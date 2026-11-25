/**
 * @file worker/research/researchService.ts
 * @description Server-side consent-enforced behavioral research ingestion, idempotent subject erasure
 * inbox consumer, retention expiration purge, and k-anonymity small-group-suppressed aggregation engine.
 *
 * Strict Domain Isolation:
 * - Reads consent & subject registry strictly from `USER_DB` (fail-closed if unavailable).
 * - Writes events, aggregates, and erasure receipts strictly to `RESEARCH_DB` (zero raw UID / zero PII).
 */
import {
  getResearchConsentRevocationJobFromD1,
  listPendingResearchConsentRevocationsFromD1,
  updateUserPrivacyConsentInD1,
  type D1UserPrivacyConsent,
} from '../account/d1AccountRepository';
import { evaluateTieredWorkerRateLimit } from '../cache/kvAndEdgeRateLimiter';
import { requireResearchDb, requireUserDb, resolveResearchDb } from '../db/bindingResolver';
import type { D1Database, WorkerEnv } from '../types';
import { deriveAllSubjectKeysForErasure, deriveResearchSubjectKey } from './pseudonymizer';
import {
  acquireQueuedResearchProcessingPermitInD1,
  acquireResearchProcessingPermitInD1,
  countActiveResearchProcessingPermitsInD1,
  expireStaleResearchProcessingPermitsInD1,
  PERMANENT_DELETION_FENCE_REVISION,
  releaseResearchProcessingPermitInD1,
  type ResearchConsentRevocationStatus,
} from './researchConsentBarrier';
import {
  MAX_RESEARCH_BATCH_SIZE,
  RESEARCH_EVENT_POLICIES,
  validateAndMinimizeResearchEvent,
  type AllowedResearchEventType,
  type ValidatedResearchEvent,
} from './researchEventContract';

export {
  acquireQueuedResearchProcessingPermitInD1,
  acquireResearchProcessingPermitInD1,
  countActiveResearchProcessingPermitsInD1,
  DEFAULT_RESEARCH_PERMIT_TTL_MS,
  expireStaleResearchProcessingPermitsInD1,
  PERMANENT_DELETION_FENCE_REVISION,
  releaseResearchProcessingPermitInD1,
} from './researchConsentBarrier';
export type {
  AcquiredResearchProcessingPermit,
  RejectedResearchProcessingPermit,
  ResearchConsentRevocationJobRecord,
  ResearchConsentRevocationStatus,
  ResearchProcessingConsumerKind,
} from './researchConsentBarrier';

export const DEFAULT_K_ANONYMITY_MIN_COHORT = 10;
export const HARD_MIN_K_ANONYMITY = 10;
export const COARSENING_BUCKET_WIDTH = 5;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export class AggregationWindowPolicyError extends Error {
  public readonly code: string;
  public readonly statusCode = 400;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'AggregationWindowPolicyError';
    this.code = code;
  }
}

export interface ResearchIngestionResponse {
  readonly ok: true;
  readonly batchId: string;
  readonly receiptId: string;
  readonly acceptedCount: number;
  readonly deduplicatedCount: number;
  readonly rejectedCount: number;
  readonly consentRevision: number;
  readonly rejections: Array<{ readonly index: number; readonly code: string; readonly detail: string }>;
  // STRICT PRIVACY: subjectKey is intentionally omitted from all client responses.
}

export interface ResearchIngestionFailure {
  readonly ok: false;
  readonly statusCode: 400 | 403 | 429 | 503;
  readonly code: string;
  readonly messageFa: string;
  readonly retryAfterSeconds?: number;
}

export function resolveKAnonymityMinCohort(env: WorkerEnv): number {
  const parsed = Number(env.RESEARCH_K_ANONYMITY_MIN_COHORT);
  if (Number.isInteger(parsed) && parsed >= HARD_MIN_K_ANONYMITY && parsed <= 1000) {
    return parsed;
  }
  return DEFAULT_K_ANONYMITY_MIN_COHORT;
}

/**
 * Verifies user research consent authoritatively from `USER_DB` (fail-closed)
 * including monotonic `consent_revision` ordering to defeat revocation race conditions.
 * Never trusts any client-supplied `consent=true` flag.
 */
export async function verifyServerSideResearchConsent(
  userDb: D1Database,
  uid: string,
  expectedConsentRevision?: number,
): Promise<
  | { readonly allowed: true; readonly consentVersion: string; readonly consentRevision: number }
  | { readonly allowed: false; readonly statusCode: 403 | 503; readonly code: string }
> {
  try {
    const blocked = await userDb
      .prepare('SELECT uid FROM account_write_blocks WHERE uid = ?1 AND released_at_iso IS NULL')
      .bind(uid)
      .first<{ uid: string }>();
    if (blocked) {
      return { allowed: false, statusCode: 403, code: 'ACCOUNT_DELETION_IN_PROGRESS' };
    }

    const row = await userDb
      .prepare(
        'SELECT research_analytics_consent, behavioral_telemetry_consent, consent_version, consent_revision, revoked_at_iso FROM user_privacy_consents WHERE uid = ?1',
      )
      .bind(uid)
      .first<{
        research_analytics_consent: number;
        behavioral_telemetry_consent: number;
        consent_version: string;
        consent_revision?: number;
        revoked_at_iso: string | null;
      }>();

    if (!row || Number(row.research_analytics_consent) !== 1 || row.revoked_at_iso) {
      return { allowed: false, statusCode: 403, code: 'RESEARCH_CONSENT_REQUIRED' };
    }
    const consentRevision = Math.max(1, Number(row.consent_revision ?? 1));
    if (expectedConsentRevision !== undefined && consentRevision !== expectedConsentRevision) {
      return { allowed: false, statusCode: 403, code: 'CONSENT_REVISION_STALE_OR_REVOKED' };
    }
    return { allowed: true, consentVersion: row.consent_version || 'v1', consentRevision };
  } catch {
    return { allowed: false, statusCode: 503, code: 'CONSENT_VERIFICATION_UNAVAILABLE' };
  }
}

/**
 * UID-free queued consent gate: resolves a pseudonymized `(subject_key, subject_key_version)` via
 * `USER_DB.user_research_subject_registry` and verifies active consent, matching `consent_revision`,
 * absence of write-blocks, and absence of pending/completed research erasure outbox items.
 */
export async function verifyQueuedResearchSubjectConsent(params: {
  userDb: D1Database;
  subjectKey: string;
  subjectKeyVersion: string;
  expectedConsentRevision?: number;
}): Promise<
  | { readonly allowed: true; readonly consentVersion: string; readonly consentRevision: number }
  | { readonly allowed: false; readonly statusCode: 403 | 503; readonly code: string }
> {
  try {
    const outboxRows = await params.userDb
      .prepare(
        `SELECT outbox_id, status, max_consent_revision FROM research_erasure_outbox
         WHERE subject_key = ?1 AND subject_key_version = ?2`,
      )
      .bind(params.subjectKey, params.subjectKeyVersion)
      .all<{ outbox_id: string; status: string; max_consent_revision?: number | null }>();
    for (const item of outboxRows.results ?? []) {
      const maxRev =
        item.max_consent_revision === null || item.max_consent_revision === undefined
          ? null
          : Number(item.max_consent_revision);
      if (
        item.status !== 'COMPLETED' ||
        maxRev === null ||
        params.expectedConsentRevision === undefined ||
        params.expectedConsentRevision <= maxRev
      ) {
        return { allowed: false, statusCode: 403, code: 'RESEARCH_ERASURE_PENDING_OR_COMPLETED' };
      }
    }

    const reg = await params.userDb
      .prepare(
        `SELECT uid, erasure_requested_at_iso, erased_at_iso
         FROM user_research_subject_registry
         WHERE subject_key = ?1 AND subject_key_version = ?2 LIMIT 1`,
      )
      .bind(params.subjectKey, params.subjectKeyVersion)
      .first<{ uid: string; erasure_requested_at_iso: string | null; erased_at_iso: string | null }>();
    if (!reg || !reg.uid || reg.erasure_requested_at_iso || reg.erased_at_iso) {
      return { allowed: false, statusCode: 403, code: 'RESEARCH_SUBJECT_NOT_ELIGIBLE' };
    }

    return verifyServerSideResearchConsent(params.userDb, reg.uid, params.expectedConsentRevision);
  } catch {
    return { allowed: false, statusCode: 503, code: 'CONSENT_VERIFICATION_UNAVAILABLE' };
  }
}

/**
 * Persists a validated, already-pseudonymized batch of events into `RESEARCH_DB`.
 * Enforces an atomic per-subject consent fence (`research_subject_consent_fences`) inside SQL so
 * zombie or replayed consumers carrying a revoked `consent_revision` can NEVER persist rows.
 */
export async function writePseudonymizedEventsToResearchDb(params: {
  researchDb: D1Database;
  subjectKey: string;
  subjectKeyVersion: string;
  events: readonly ValidatedResearchEvent[];
  consentRevision?: number;
  nowMs?: number;
}): Promise<{
  readonly batchId: string;
  readonly receiptId: string;
  readonly acceptedCount: number;
  readonly deduplicatedCount: number;
  readonly fencedCount: number;
}> {
  const nowMs = params.nowMs ?? Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const batchId = `rb_${nowMs}_${crypto.randomUUID().slice(0, 8)}`;
  const receiptId = `rcpt_${nowMs}_${crypto.randomUUID().slice(0, 8)}`;
  const consentRevision = Math.max(1, Math.trunc(params.consentRevision ?? 1));

  let acceptedCount = 0;
  let deduplicatedCount = 0;
  let fencedCount = 0;

  for (const evt of params.events) {
    const eventId = `revt_${nowMs}_${crypto.randomUUID().slice(0, 10)}`;
    const insertEventStmt = params.researchDb
      .prepare(
        `INSERT INTO research_events (
          event_id, subject_key, subject_key_version, event_type, schema_version,
          city_id, hood_id, session_bucket, payload_json,
          occurred_at_iso, ingested_at_iso, expires_at_iso, idempotency_key, consent_revision
        )
        SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14
        WHERE NOT EXISTS (
          SELECT 1 FROM research_subject_consent_fences
          WHERE subject_key = ?15
            AND subject_key_version = ?16
            AND revoked_through_revision >= ?17
        )
        AND NOT EXISTS (
          SELECT 1 FROM research_idempotency_keys WHERE idempotency_key = ?18
        )
        AND NOT EXISTS (
          SELECT 1 FROM research_events WHERE idempotency_key = ?19
        )`,
      )
      .bind(
        eventId,
        params.subjectKey,
        params.subjectKeyVersion,
        evt.eventType,
        evt.schemaVersion,
        evt.cityId,
        evt.hoodId,
        evt.sessionBucket,
        evt.payloadJson,
        evt.occurredAtIso,
        evt.ingestedAtIso,
        evt.expiresAtIso,
        evt.idempotencyKey,
        consentRevision,
        params.subjectKey,
        params.subjectKeyVersion,
        consentRevision,
        evt.idempotencyKey,
        evt.idempotencyKey,
      );

    const insertIdemStmt = params.researchDb
      .prepare(
        `INSERT OR IGNORE INTO research_idempotency_keys (
          idempotency_key, event_type, recorded_at_iso, expires_at_iso
        )
        SELECT ?1, ?2, ?3, ?4
        WHERE EXISTS (
          SELECT 1 FROM research_events WHERE idempotency_key = ?5
        )`,
      )
      .bind(evt.idempotencyKey, evt.eventType, nowIso, evt.expiresAtIso, evt.idempotencyKey);

    const batchResults = await params.researchDb.batch([insertEventStmt, insertIdemStmt]);
    if (batchResults.some((r) => !r.success)) {
      throw new Error('RESEARCH_DB_ATOMIC_WRITE_FAILED');
    }

    if ((batchResults[0]?.meta?.changes ?? 0) === 1) {
      acceptedCount += 1;
      continue;
    }

    const fenceRow = await params.researchDb
      .prepare(
        `SELECT revoked_through_revision FROM research_subject_consent_fences
         WHERE subject_key = ?1 AND subject_key_version = ?2`,
      )
      .bind(params.subjectKey, params.subjectKeyVersion)
      .first<{ revoked_through_revision: number }>();

    if (fenceRow && Number(fenceRow.revoked_through_revision) >= consentRevision) {
      fencedCount += 1;
    } else {
      deduplicatedCount += 1;
    }
  }

  await params.researchDb
    .prepare(
      `INSERT INTO research_ingestion_receipts (
        receipt_id, batch_id, accepted_count, deduplicated_count, rejected_count, recorded_at_iso
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
    )
    .bind(receiptId, batchId, acceptedCount, deduplicatedCount, fencedCount, nowIso)
    .run();

  return { batchId, receiptId, acceptedCount, deduplicatedCount, fencedCount };
}

/**
 * Full authenticated behavioral research ingestion flow:
 * 1. Resolve USER_DB & RESEARCH_DB (fail-closed, strictly distinct).
 * 2. Verify server-side consent in USER_DB (never trusts client flags).
 * 3. Enforce durable rate limit in USER_DB.
 * 4. Validate batch size & allowlist/PII schema for every event.
 * 5. Derive HMAC-SHA256 `subject_key` (never returned to client).
 * 6. Register subject key version in USER_DB for rotation-safe erasure.
 * 7. Write strictly pseudonymized events into RESEARCH_DB.
 */
export async function ingestResearchEventsBatch(params: {
  env: WorkerEnv;
  uid: string;
  clientIp: string;
  rawEvents: unknown;
  nowMs?: number;
  permitTtlMs?: number;
  beforeResearchWriteHook?: () => Promise<void>;
  afterConsentCheckBeforeResearchWriteHook?: (ctx: {
    permitId: string;
    consentRevision: number;
    subjectKey: string;
    subjectKeyVersion: string;
  }) => Promise<void>;
}): Promise<ResearchIngestionResponse | ResearchIngestionFailure> {
  const userDbRes = requireUserDb(params.env);
  if (userDbRes.ok === false) {
    return { ok: false, statusCode: 503, code: userDbRes.code, messageFa: userDbRes.messageFa };
  }
  const researchDbRes = requireResearchDb(params.env);
  if (researchDbRes.ok === false) {
    return { ok: false, statusCode: 503, code: researchDbRes.code, messageFa: researchDbRes.messageFa };
  }

  // 1. Fast fail-closed server-side consent pre-check
  const initialConsent = await verifyServerSideResearchConsent(userDbRes.db, params.uid);
  if (initialConsent.allowed === false) {
    return {
      ok: false,
      statusCode: initialConsent.statusCode,
      code: initialConsent.code,
      messageFa:
        initialConsent.statusCode === 503
          ? 'بررسی رضایت پژوهشی در دسترس نیست؛ ثبت رویداد متوقف شد.'
          : 'کاربر رضایت فعال برای ثبت داده‌های پژوهشی ندارد.',
    };
  }

  // 2. Durable rate limiting per user
  const rateLimit = await evaluateTieredWorkerRateLimit({
    tier: 'strong_durable',
    action: 'research_ingest',
    subjectKey: `research:${params.uid}`,
    maxRequests: 60,
    windowSeconds: 60,
    db: userDbRes.db,
  });
  if (!rateLimit.allowed) {
    return {
      ok: false,
      statusCode: 429,
      code: 'RESEARCH_INGEST_RATE_LIMITED',
      retryAfterSeconds: rateLimit.retryAfterSeconds,
      messageFa: 'تعداد درخواست‌های ثبت رویداد پژوهشی بیش از حد مجاز است.',
    };
  }

  // 3. Batch structure validation
  if (!Array.isArray(params.rawEvents) || params.rawEvents.length === 0) {
    return {
      ok: false,
      statusCode: 400,
      code: 'EMPTY_RESEARCH_EVENT_BATCH',
      messageFa: 'حداقل یک رویداد معتبر در دسته الزامی است.',
    };
  }
  if (params.rawEvents.length > MAX_RESEARCH_BATCH_SIZE) {
    return {
      ok: false,
      statusCode: 400,
      code: 'RESEARCH_BATCH_SIZE_EXCEEDED',
      messageFa: `حداکثر ${MAX_RESEARCH_BATCH_SIZE} رویداد در هر دسته مجاز است.`,
    };
  }

  const nowMs = params.nowMs ?? Date.now();
  const validEvents: ValidatedResearchEvent[] = [];
  const rejections: Array<{ index: number; code: string; detail: string }> = [];

  for (let i = 0; i < params.rawEvents.length; i += 1) {
    const check = validateAndMinimizeResearchEvent(params.rawEvents[i], nowMs);
    if ('event' in check && check.ok) {
      validEvents.push(check.event);
    } else if ('code' in check) {
      rejections.push({ index: i, code: check.code, detail: check.detail });
    }
  }

  if (validEvents.length === 0) {
    return {
      ok: false,
      statusCode: 400,
      code: rejections[0]?.code || 'ALL_RESEARCH_EVENTS_REJECTED',
      messageFa: 'هیچ رویداد معتبری در دسته وجود نداشت و تمام موارد رد شدند.',
    };
  }

  // 4. Server-side HMAC-SHA256 pseudonymization
  const keyVersion = String(params.env.RESEARCH_HMAC_KEY_VERSION || 'v1').trim() || 'v1';
  const pseudo = await deriveResearchSubjectKey({
    uid: params.uid,
    secret: params.env.RESEARCH_HMAC_SECRET,
    keyVersion,
  });
  if (pseudo.ok === false) {
    return {
      ok: false,
      statusCode: pseudo.statusCode,
      code: pseudo.code,
      messageFa: 'کلید رمزنگاری ناشناس‌سازی پژوهشی تنظیم نشده است.',
    };
  }

  // 5. Record subject key version mapping inside USER_DB ONLY (for rotation-safe erasure)
  const nowIso = new Date(nowMs).toISOString();
  await userDbRes.db
    .prepare(
      `INSERT OR IGNORE INTO user_research_subject_registry (
        uid, subject_key, subject_key_version, created_at_iso
      ) VALUES (?1, ?2, ?3, ?4)`,
    )
    .bind(params.uid, pseudo.derived.subjectKey, pseudo.derived.subjectKeyVersion, nowIso)
    .run();

  // 6. Atomically verify active consent + absence of revocation/write-block AND acquire leased permit in USER_DB
  const permit = await acquireResearchProcessingPermitInD1({
    userDb: userDbRes.db,
    uid: params.uid,
    subjectKey: pseudo.derived.subjectKey,
    subjectKeyVersion: pseudo.derived.subjectKeyVersion,
    consumerKind: 'http_ingest',
    expectedConsentRevision: initialConsent.consentRevision,
    ttlMs: params.permitTtlMs,
    nowMs,
  });
  if (permit.ok === false) {
    return {
      ok: false,
      statusCode: permit.statusCode,
      code: permit.code,
      messageFa:
        permit.statusCode === 503
          ? 'بررسی رضایت پژوهشی در دسترس نیست؛ ثبت رویداد متوقف شد.'
          : 'مجوز پردازش پژوهشی صادر نشد؛ رضایت کاربر فعال نیست یا در حال لغو است.',
    };
  }

  try {
    // Optional test seam before pre-commit consent re-verification
    if (params.beforeResearchWriteHook) {
      await params.beforeResearchWriteHook();
    }

    // 7. Fast-fail pre-commit consent re-verification with monotonic consent_revision check
    const preCommitConsent = await verifyServerSideResearchConsent(
      userDbRes.db,
      params.uid,
      permit.consentRevision,
    );
    if (preCommitConsent.allowed === false) {
      return {
        ok: false,
        statusCode: preCommitConsent.statusCode,
        code:
          preCommitConsent.statusCode === 503
            ? preCommitConsent.code
            : 'CONSENT_REVOKED_OR_REVISED_IN_FLIGHT',
        messageFa: 'رضایت پژوهشی کاربر هم‌زمان لغو یا تغییر یافته و ثبت رویداد متوقف شد.',
      };
    }

    // Optional Section B barrier seam: suspended AFTER all USER_DB checks, immediately BEFORE RESEARCH_DB write
    if (params.afterConsentCheckBeforeResearchWriteHook) {
      await params.afterConsentCheckBeforeResearchWriteHook({
        permitId: permit.permitId,
        consentRevision: permit.consentRevision,
        subjectKey: pseudo.derived.subjectKey,
        subjectKeyVersion: pseudo.derived.subjectKeyVersion,
      });
    }

    // 8. Persist pseudonymized events strictly in RESEARCH_DB with atomic consent fence enforcement
    const written = await writePseudonymizedEventsToResearchDb({
      researchDb: researchDbRes.db,
      subjectKey: pseudo.derived.subjectKey,
      subjectKeyVersion: pseudo.derived.subjectKeyVersion,
      consentRevision: permit.consentRevision,
      events: validEvents,
      nowMs,
    });

    if (written.fencedCount > 0 && written.acceptedCount === 0) {
      return {
        ok: false,
        statusCode: 403,
        code: 'CONSENT_FENCED_IN_RESEARCH_DB',
        messageFa: 'نسخه رضایت پژوهشی پیش‌تر لغو و در RESEARCH_DB مسدود شده است.',
      };
    }

    return {
      ok: true,
      batchId: written.batchId,
      receiptId: written.receiptId,
      acceptedCount: written.acceptedCount,
      deduplicatedCount: written.deduplicatedCount,
      rejectedCount: rejections.length + written.fencedCount,
      consentRevision: permit.consentRevision,
      rejections,
    };
  } finally {
    await releaseResearchProcessingPermitInD1({
      userDb: userDbRes.db,
      permitId: permit.permitId,
    }).catch(() => {});
  }
}

export interface ResearchSubjectErasureResult {
  readonly ok: true;
  readonly outboxId: string;
  readonly receiptId: string;
  readonly deletedEventsCount: number;
  readonly invalidatedAggregationWindowsCount: number;
  readonly fencedThroughRevision: number;
  readonly idempotentReplay: boolean;
  readonly completedAtIso: string;
}

/**
 * Idempotent Inbox consumer in `RESEARCH_DB` executing erasure by `(subject_key, subject_key_version)`.
 * Atomically deletes matching events, invalidates affected aggregation windows, advances
 * `research_subject_consent_fences`, and records an idempotent receipt in `research_erasure_inbox`.
 * Never receives or stores raw Firebase UID.
 */
export async function executeResearchSubjectErasure(params: {
  researchDb: D1Database;
  outboxId: string;
  subjectKey: string;
  subjectKeyVersion: string;
  maxConsentRevision?: number | null;
  nowMs?: number;
}): Promise<ResearchSubjectErasureResult> {
  const nowMs = params.nowMs ?? Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const scopedRevision =
    typeof params.maxConsentRevision === 'number' && Number.isInteger(params.maxConsentRevision)
      ? params.maxConsentRevision
      : null;
  const effectiveFenceRevision = scopedRevision ?? PERMANENT_DELETION_FENCE_REVISION;

  const existing = await params.researchDb
    .prepare(
      'SELECT receipt_id, deleted_events_count, completed_at_iso, status FROM research_erasure_inbox WHERE outbox_id = ?1',
    )
    .bind(params.outboxId)
    .first<{
      receipt_id: string;
      deleted_events_count: number;
      completed_at_iso: string | null;
      status: string;
    }>();

  if (existing && existing.status === 'COMPLETED' && existing.completed_at_iso) {
    return {
      ok: true,
      outboxId: params.outboxId,
      receiptId: existing.receipt_id,
      deletedEventsCount: Number(existing.deleted_events_count || 0),
      invalidatedAggregationWindowsCount: 0,
      fencedThroughRevision: effectiveFenceRevision,
      idempotentReplay: true,
      completedAtIso: existing.completed_at_iso,
    };
  }

  const countRow =
    scopedRevision === null
      ? await params.researchDb
          .prepare('SELECT COUNT(*) AS cnt FROM research_events WHERE subject_key = ?1 AND subject_key_version = ?2')
          .bind(params.subjectKey, params.subjectKeyVersion)
          .first<{ cnt: number }>()
      : await params.researchDb
          .prepare(
            'SELECT COUNT(*) AS cnt FROM research_events WHERE subject_key = ?1 AND subject_key_version = ?2 AND consent_revision <= ?3',
          )
          .bind(params.subjectKey, params.subjectKeyVersion, scopedRevision)
          .first<{ cnt: number }>();
  const targetCount = Number(countRow?.cnt ?? 0);

  // Identify derived aggregation scopes impacted by this subject so stale counts are invalidated atomically.
  const impactedScopesRes =
    scopedRevision === null
      ? await params.researchDb
          .prepare(
            'SELECT DISTINCT event_type, city_id FROM research_events WHERE subject_key = ?1 AND subject_key_version = ?2',
          )
          .bind(params.subjectKey, params.subjectKeyVersion)
          .all<{ event_type: string; city_id: string }>()
      : await params.researchDb
          .prepare(
            'SELECT DISTINCT event_type, city_id FROM research_events WHERE subject_key = ?1 AND subject_key_version = ?2 AND consent_revision <= ?3',
          )
          .bind(params.subjectKey, params.subjectKeyVersion, scopedRevision)
          .all<{ event_type: string; city_id: string }>();
  const impactedScopes = impactedScopesRes.results ?? [];

  const erasureId = `rerase_${nowMs}_${crypto.randomUUID().slice(0, 8)}`;
  const receiptId = `ercpt_${nowMs}_${crypto.randomUUID().slice(0, 10)}`;

  const deleteEventsStmt =
    scopedRevision === null
      ? params.researchDb
          .prepare('DELETE FROM research_events WHERE subject_key = ?1 AND subject_key_version = ?2')
          .bind(params.subjectKey, params.subjectKeyVersion)
      : params.researchDb
          .prepare(
            'DELETE FROM research_events WHERE subject_key = ?1 AND subject_key_version = ?2 AND consent_revision <= ?3',
          )
          .bind(params.subjectKey, params.subjectKeyVersion, scopedRevision);

  const invalidateWindowStmts = impactedScopes.map((scope) =>
    params.researchDb
      .prepare('DELETE FROM research_aggregation_windows WHERE event_type = ?1 AND city_id = ?2')
      .bind(scope.event_type, scope.city_id),
  );

  const upsertFenceStmt = params.researchDb
    .prepare(
      `INSERT INTO research_subject_consent_fences (
        subject_key, subject_key_version, revoked_through_revision,
        last_outbox_id, last_receipt_id, updated_at_iso
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
      ON CONFLICT(subject_key, subject_key_version) DO UPDATE SET
        revoked_through_revision = MAX(research_subject_consent_fences.revoked_through_revision, excluded.revoked_through_revision),
        last_outbox_id = excluded.last_outbox_id,
        last_receipt_id = excluded.last_receipt_id,
        updated_at_iso = excluded.updated_at_iso`,
    )
    .bind(
      params.subjectKey,
      params.subjectKeyVersion,
      effectiveFenceRevision,
      params.outboxId,
      receiptId,
      nowIso,
    );

  const insertInboxStmt = params.researchDb
    .prepare(
      `INSERT OR REPLACE INTO research_erasure_inbox (
        erasure_id, outbox_id, subject_key, subject_key_version, status,
        deleted_events_count, receipt_id, received_at_iso, completed_at_iso
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`,
    )
    .bind(
      erasureId,
      params.outboxId,
      params.subjectKey,
      params.subjectKeyVersion,
      'COMPLETED',
      targetCount,
      receiptId,
      nowIso,
      nowIso,
    );

  const batchResults = await params.researchDb.batch([
    deleteEventsStmt,
    ...invalidateWindowStmts,
    upsertFenceStmt,
    insertInboxStmt,
  ]);
  if (batchResults.some((r) => !r.success)) {
    throw new Error('RESEARCH_SUBJECT_ERASURE_BATCH_FAILED');
  }

  return {
    ok: true,
    outboxId: params.outboxId,
    receiptId,
    deletedEventsCount: targetCount,
    invalidatedAggregationWindowsCount: impactedScopes.length,
    fencedThroughRevision: effectiveFenceRevision,
    idempotentReplay: false,
    completedAtIso: nowIso,
  };
}

export interface ResearchConsentRevocationExecutionResult {
  readonly ok: boolean;
  readonly statusCode: 200 | 202 | 404 | 503;
  readonly revocationId: string;
  readonly status: ResearchConsentRevocationStatus;
  readonly completed: boolean;
  readonly idempotentReplay: boolean;
  readonly revokedConsentRevision: number;
  readonly newConsentRevision: number;
  readonly activePermitsRemaining: number;
  readonly expiredPermitsReclaimed: number;
  readonly outboxItemsTotal: number;
  readonly outboxItemsCompleted: number;
  readonly erasedEventsCount: number;
  readonly receiptIds: string[];
  readonly code: string;
}

/**
 * Reconciles a durable consent-revocation job through:
 * 1. Reclaiming expired leases (`expires_at_ms <= nowMs`) and draining active permits.
 * 2. Refusing to complete while ANY active permit for `consent_revision <= newConsentRevision` remains.
 * 3. Enqueuing UID-free `research_erasure_outbox` rows scoped to `max_consent_revision = newConsentRevision`.
 * 4. Executing idempotent erasure + fencing on `RESEARCH_DB` and verifying receipts before marking `COMPLETED`.
 */
export async function reconcileResearchConsentRevocation(params: {
  env: WorkerEnv;
  revocationId: string;
  nowMs?: number;
}): Promise<ResearchConsentRevocationExecutionResult> {
  const userDbRes = requireUserDb(params.env);
  if (userDbRes.ok === false) {
    return {
      ok: false,
      statusCode: 503,
      revocationId: params.revocationId,
      status: 'DRAINING_PERMITS',
      completed: false,
      idempotentReplay: false,
      revokedConsentRevision: 0,
      newConsentRevision: 0,
      activePermitsRemaining: 0,
      expiredPermitsReclaimed: 0,
      outboxItemsTotal: 0,
      outboxItemsCompleted: 0,
      erasedEventsCount: 0,
      receiptIds: [],
      code: userDbRes.code,
    };
  }
  const userDb = userDbRes.db;
  const nowMs = params.nowMs ?? Date.now();
  const nowIso = new Date(nowMs).toISOString();

  const job = await getResearchConsentRevocationJobFromD1(userDb, params.revocationId);
  if (!job) {
    return {
      ok: false,
      statusCode: 404,
      revocationId: params.revocationId,
      status: 'DRAINING_PERMITS',
      completed: false,
      idempotentReplay: false,
      revokedConsentRevision: 0,
      newConsentRevision: 0,
      activePermitsRemaining: 0,
      expiredPermitsReclaimed: 0,
      outboxItemsTotal: 0,
      outboxItemsCompleted: 0,
      erasedEventsCount: 0,
      receiptIds: [],
      code: 'REVOCATION_JOB_NOT_FOUND',
    };
  }

  if (job.status === 'COMPLETED') {
    return {
      ok: true,
      statusCode: 200,
      revocationId: job.revocationId,
      status: 'COMPLETED',
      completed: true,
      idempotentReplay: true,
      revokedConsentRevision: job.revokedConsentRevision,
      newConsentRevision: job.newConsentRevision,
      activePermitsRemaining: 0,
      expiredPermitsReclaimed: 0,
      outboxItemsTotal: job.receiptIds.length,
      outboxItemsCompleted: job.receiptIds.length,
      erasedEventsCount: job.erasedEventsCount,
      receiptIds: job.receiptIds,
      code: 'CONSENT_REVOCATION_ALREADY_COMPLETED',
    };
  }

  // Step 1: Reclaim expired leases (crash recovery) and check active permits for revoked revision
  const expiredPermitsReclaimed = await expireStaleResearchProcessingPermitsInD1({
    userDb,
    uid: job.uid,
    nowMs,
  });
  const activePermitsRemaining = await countActiveResearchProcessingPermitsInD1({
    userDb,
    uid: job.uid,
    maxConsentRevision: job.newConsentRevision,
    nowMs,
  });

  if (activePermitsRemaining > 0) {
    return {
      ok: true,
      statusCode: 202,
      revocationId: job.revocationId,
      status: 'DRAINING_PERMITS',
      completed: false,
      idempotentReplay: false,
      revokedConsentRevision: job.revokedConsentRevision,
      newConsentRevision: job.newConsentRevision,
      activePermitsRemaining,
      expiredPermitsReclaimed,
      outboxItemsTotal: 0,
      outboxItemsCompleted: 0,
      erasedEventsCount: 0,
      receiptIds: [],
      code: 'RESEARCH_PERMITS_DRAINING',
    };
  }

  // Step 2: Collect all subject keys (registered + derived across active & rotated HMAC keys)
  const subjectKeyMap = new Map<string, { subjectKey: string; subjectKeyVersion: string }>();
  const regRes = await userDb
    .prepare('SELECT subject_key, subject_key_version FROM user_research_subject_registry WHERE uid = ?1')
    .bind(job.uid)
    .all<{ subject_key: string; subject_key_version: string }>();
  for (const row of regRes.results ?? []) {
    subjectKeyMap.set(`${row.subject_key_version}:${row.subject_key}`, {
      subjectKey: row.subject_key,
      subjectKeyVersion: row.subject_key_version,
    });
  }

  const derivedRes = await deriveAllSubjectKeysForErasure({ uid: job.uid, env: params.env });
  if (derivedRes.ok) {
    for (const key of derivedRes.keys) {
      subjectKeyMap.set(`${key.subjectKeyVersion}:${key.subjectKey}`, key);
    }
  } else if (subjectKeyMap.size === 0 && params.env.RESEARCH_DB) {
    return {
      ok: false,
      statusCode: 503,
      revocationId: job.revocationId,
      status: 'PENDING_ERASURE',
      completed: false,
      idempotentReplay: false,
      revokedConsentRevision: job.revokedConsentRevision,
      newConsentRevision: job.newConsentRevision,
      activePermitsRemaining: 0,
      expiredPermitsReclaimed,
      outboxItemsTotal: 0,
      outboxItemsCompleted: 0,
      erasedEventsCount: 0,
      receiptIds: [],
      code: 'code' in derivedRes ? derivedRes.code : 'RESEARCH_HMAC_SECRET_MISSING',
    };
  }

  // Step 3: Enqueue durable UID-free outbox rows scoped to `max_consent_revision = job.newConsentRevision`
  const subjectKeys = Array.from(subjectKeyMap.values());
  for (const sk of subjectKeys) {
    const outboxId = `rrevout_${job.revocationId}_${sk.subjectKeyVersion}_${sk.subjectKey.slice(0, 16)}`;
    await userDb
      .prepare(
        `INSERT OR IGNORE INTO research_erasure_outbox (
          outbox_id, job_id, subject_key, subject_key_version, status,
          attempt_count, next_retry_at_ms, max_consent_revision, created_at_iso, updated_at_iso
        ) VALUES (?1, ?2, ?3, ?4, 'PENDING', 0, 0, ?5, ?6, ?7)`,
      )
      .bind(outboxId, job.revocationId, sk.subjectKey, sk.subjectKeyVersion, job.newConsentRevision, nowIso, nowIso)
      .run();
  }

  await userDb
    .prepare(
      `UPDATE research_consent_revocation_jobs
       SET status = 'PENDING_ERASURE', updated_at_iso = ?1
       WHERE revocation_id = ?2 AND status = 'DRAINING_PERMITS'`,
    )
    .bind(nowIso, job.revocationId)
    .run();

  if (subjectKeys.length === 0) {
    await userDb
      .prepare(
        `UPDATE research_consent_revocation_jobs
         SET status = 'COMPLETED', erased_events_count = 0, receipt_ids_json = '[]',
             updated_at_iso = ?1, completed_at_iso = ?2
         WHERE revocation_id = ?3`,
      )
      .bind(nowIso, nowIso, job.revocationId)
      .run();
    return {
      ok: true,
      statusCode: 200,
      revocationId: job.revocationId,
      status: 'COMPLETED',
      completed: true,
      idempotentReplay: false,
      revokedConsentRevision: job.revokedConsentRevision,
      newConsentRevision: job.newConsentRevision,
      activePermitsRemaining: 0,
      expiredPermitsReclaimed,
      outboxItemsTotal: 0,
      outboxItemsCompleted: 0,
      erasedEventsCount: 0,
      receiptIds: [],
      code: 'CONSENT_REVOCATION_COMPLETED',
    };
  }

  // Step 4: Execute idempotent erasure & fencing against RESEARCH_DB for all pending outbox rows
  const researchDb = resolveResearchDb(params.env);
  const outboxRowsRes = await userDb
    .prepare(
      `SELECT outbox_id, subject_key, subject_key_version, status, attempt_count, max_consent_revision, receipt_id, erased_events_count
       FROM research_erasure_outbox
       WHERE job_id = ?1`,
    )
    .bind(job.revocationId)
    .all<{
      outbox_id: string;
      subject_key: string;
      subject_key_version: string;
      status: string;
      attempt_count: number;
      max_consent_revision: number | null;
      receipt_id: string | null;
      erased_events_count: number;
    }>();

  const allOutboxRows = outboxRowsRes.results ?? [];
  let completedCount = 0;
  let erasedEventsCount = 0;
  const receiptIds: string[] = [];

  for (const row of allOutboxRows) {
    if (row.status === 'COMPLETED' && row.receipt_id) {
      completedCount += 1;
      erasedEventsCount += Number(row.erased_events_count || 0);
      receiptIds.push(row.receipt_id);
      continue;
    }

    const attempts = Number(row.attempt_count ?? 0) + 1;
    if (!researchDb) {
      const backoffMs = Math.min(300_000, 10_000 * Math.pow(2, Math.min(attempts, 5)));
      await userDb
        .prepare(
          `UPDATE research_erasure_outbox
           SET status = 'RETRY_PENDING', attempt_count = ?1, next_retry_at_ms = ?2,
               last_error_code = 'RESEARCH_DB_UNAVAILABLE', updated_at_iso = ?3
           WHERE outbox_id = ?4`,
        )
        .bind(attempts, nowMs + backoffMs, nowIso, row.outbox_id)
        .run();
      continue;
    }

    try {
      const erasureRes = await executeResearchSubjectErasure({
        researchDb,
        outboxId: row.outbox_id,
        subjectKey: row.subject_key,
        subjectKeyVersion: row.subject_key_version,
        maxConsentRevision: row.max_consent_revision ?? job.newConsentRevision,
        nowMs,
      });

      await userDb
        .prepare(
          `UPDATE research_erasure_outbox
           SET status = 'COMPLETED', attempt_count = ?1, receipt_id = ?2,
               erased_events_count = ?3, last_error_code = NULL,
               updated_at_iso = ?4, completed_at_iso = ?5
           WHERE outbox_id = ?6`,
        )
        .bind(
          attempts,
          erasureRes.receiptId,
          erasureRes.deletedEventsCount,
          nowIso,
          erasureRes.completedAtIso,
          row.outbox_id,
        )
        .run();

      completedCount += 1;
      erasedEventsCount += erasureRes.deletedEventsCount;
      receiptIds.push(erasureRes.receiptId);
    } catch {
      const backoffMs = Math.min(300_000, 10_000 * Math.pow(2, Math.min(attempts, 5)));
      await userDb
        .prepare(
          `UPDATE research_erasure_outbox
           SET status = 'RETRY_PENDING', attempt_count = ?1, next_retry_at_ms = ?2,
               last_error_code = 'RESEARCH_ERASURE_EXECUTION_FAILED', updated_at_iso = ?3
           WHERE outbox_id = ?4`,
        )
        .bind(attempts, nowMs + backoffMs, nowIso, row.outbox_id)
        .run();
    }
  }

  // Step 5: Declare final completion ONLY when every outbox entry has a verifiable RESEARCH_DB receipt
  if (completedCount === allOutboxRows.length && allOutboxRows.length > 0) {
    await userDb
      .prepare(
        `UPDATE research_consent_revocation_jobs
         SET status = 'COMPLETED', erased_events_count = ?1, receipt_ids_json = ?2,
             updated_at_iso = ?3, completed_at_iso = ?4
         WHERE revocation_id = ?5`,
      )
      .bind(erasedEventsCount, JSON.stringify(receiptIds), nowIso, nowIso, job.revocationId)
      .run();

    return {
      ok: true,
      statusCode: 200,
      revocationId: job.revocationId,
      status: 'COMPLETED',
      completed: true,
      idempotentReplay: false,
      revokedConsentRevision: job.revokedConsentRevision,
      newConsentRevision: job.newConsentRevision,
      activePermitsRemaining: 0,
      expiredPermitsReclaimed,
      outboxItemsTotal: allOutboxRows.length,
      outboxItemsCompleted: completedCount,
      erasedEventsCount,
      receiptIds,
      code: 'CONSENT_REVOCATION_COMPLETED',
    };
  }

  return {
    ok: false,
    statusCode: 202,
    revocationId: job.revocationId,
    status: 'PENDING_ERASURE',
    completed: false,
    idempotentReplay: false,
    revokedConsentRevision: job.revokedConsentRevision,
    newConsentRevision: job.newConsentRevision,
    activePermitsRemaining: 0,
    expiredPermitsReclaimed,
    outboxItemsTotal: allOutboxRows.length,
    outboxItemsCompleted: completedCount,
    erasedEventsCount,
    receiptIds,
    code: 'RESEARCH_CONSENT_ERASURE_PENDING',
  };
}

/**
 * End-to-end research consent revocation orchestrator:
 * 1. Atomically revokes consent in `USER_DB`, bumps `consent_revision`, blocks new permits,
 *    and creates a durable `research_consent_revocation_jobs` record.
 * 2. Runs barrier reconciliation (permit drain -> durable outbox -> idempotent RESEARCH_DB erasure + fence -> receipt).
 */
export async function revokeUserResearchConsentWithBarrier(params: {
  env: WorkerEnv;
  uid: string;
  actorUid: string;
  behavioralTelemetryConsent?: boolean;
  marketingCommunicationsConsent?: boolean;
  consentVersion?: string;
  consentSource?: string;
  nowMs?: number;
}): Promise<{
  readonly privacy: D1UserPrivacyConsent;
  readonly revocation: ResearchConsentRevocationExecutionResult | null;
}> {
  const userDbRes = requireUserDb(params.env);
  if (userDbRes.ok === false) {
    throw new Error(userDbRes.code);
  }
  const nowMs = params.nowMs ?? Date.now();
  const nowIso = new Date(nowMs).toISOString();

  const privacy = await updateUserPrivacyConsentInD1(userDbRes.db, {
    uid: params.uid,
    actorUid: params.actorUid,
    researchAnalyticsConsent: false,
    behavioralTelemetryConsent: params.behavioralTelemetryConsent,
    marketingCommunicationsConsent: params.marketingCommunicationsConsent,
    consentVersion: params.consentVersion,
    consentSource: params.consentSource ?? 'account_privacy_api',
    nowIso,
  });

  let targetRevocationId = privacy.revocationJobId ?? null;
  if (!targetRevocationId) {
    const pendingJobs = await listPendingResearchConsentRevocationsFromD1(userDbRes.db, params.uid);
    if (pendingJobs.length > 0) {
      targetRevocationId = pendingJobs[pendingJobs.length - 1].revocationId;
    }
  }

  if (!targetRevocationId) {
    return { privacy, revocation: null };
  }

  const revocation = await reconcileResearchConsentRevocation({
    env: params.env,
    revocationId: targetRevocationId,
    nowMs,
  });

  return {
    privacy: {
      ...privacy,
      revocationJobId: targetRevocationId,
      revocationStatus: revocation.status,
    },
    revocation,
  };
}

/**
 * Purges expired raw events, idempotency keys, and expired derived aggregation windows from `RESEARCH_DB`.
 */
export async function purgeExpiredResearchData(params: {
  researchDb: D1Database;
  nowMs?: number;
}): Promise<{
  readonly purgedAtIso: string;
  readonly deletedEventsCount: number;
  readonly deletedIdempotencyKeysCount: number;
  readonly deletedAggregationWindowsCount: number;
}> {
  const nowIso = new Date(params.nowMs ?? Date.now()).toISOString();

  const evRes = await params.researchDb
    .prepare('DELETE FROM research_events WHERE expires_at_iso <= ?1')
    .bind(nowIso)
    .run();
  const idemRes = await params.researchDb
    .prepare('DELETE FROM research_idempotency_keys WHERE expires_at_iso <= ?1')
    .bind(nowIso)
    .run();
  const aggRes = await params.researchDb
    .prepare('DELETE FROM research_aggregation_windows WHERE expires_at_iso <= ?1')
    .bind(nowIso)
    .run();

  return {
    purgedAtIso: nowIso,
    deletedEventsCount: evRes.meta?.changes ?? 0,
    deletedIdempotencyKeysCount: idemRes.meta?.changes ?? 0,
    deletedAggregationWindowsCount: aggRes.meta?.changes ?? 0,
  };
}

export interface KAnonymousResearchAggregation {
  readonly windowId: string;
  readonly eventType: AllowedResearchEventType;
  readonly cityId: string;
  readonly hoodId: number | null;
  readonly windowStartIso: string;
  readonly windowEndIso: string;
  readonly kThreshold: number;
  readonly kSuppressed: boolean;
  readonly coarseningBucketWidth: number;
  readonly exactCountsWithheld: true;
  readonly distinctSubjectsCount: number | null;
  readonly eventCount: number | null;
  readonly provenance: {
    readonly source: 'RESEARCH_DB';
    readonly dataClassification: 'PSEUDONYMIZED RESEARCH DATA';
    readonly schemaVersion: number;
    readonly generatedAtIso: string;
    readonly expiresAtIso: string;
    readonly policyRationale: string;
  };
}

function assertDayAlignedAggregationWindow(windowStartIso: string, windowEndIso: string): void {
  const startMs = Date.parse(windowStartIso);
  const endMs = Date.parse(windowEndIso);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    throw new AggregationWindowPolicyError(
      'INVALID_AGGREGATION_WINDOW',
      'Aggregation windowStartIso and windowEndIso must be valid ISO-8601 timestamps with end > start.',
    );
  }
  const isStartMidnightUtc = startMs % ONE_DAY_MS === 0;
  const isEndMidnightUtc = endMs % ONE_DAY_MS === 0;
  if (!isStartMidnightUtc || !isEndMidnightUtc || endMs - startMs < ONE_DAY_MS) {
    throw new AggregationWindowPolicyError(
      'AGGREGATION_WINDOW_NOT_DAY_ALIGNED',
      'Aggregation windows must be UTC day-aligned (00:00:00.000Z) with at least a 24h span to mitigate query differencing.',
    );
  }
}

function coarsenCount(value: number): number {
  return Math.floor(value / COARSENING_BUCKET_WIDTH) * COARSENING_BUCKET_WIDTH;
}

/**
 * Computes and stores a k-anonymity-enforced, query-differencing-hardened aggregation window from `RESEARCH_DB`.
 * - Enforces non-lowerable `k >= 10` (`HARD_MIN_K_ANONYMITY`).
 * - Requires UTC day-aligned boundaries (`>= 24h` span) to block sliding-window differencing attacks.
 * - Coarsens released counts to multiples of 5 (`exactCountsWithheld: true`).
 * - Small cohorts (`distinct_subjects < kThreshold`) are strictly suppressed (`null` counts).
 */
export async function computeKAnonymousResearchAggregation(params: {
  researchDb: D1Database;
  eventType: AllowedResearchEventType;
  cityId: string;
  hoodId?: number | null;
  windowStartIso: string;
  windowEndIso: string;
  minCohortSize?: number;
  nowMs?: number;
}): Promise<KAnonymousResearchAggregation> {
  assertDayAlignedAggregationWindow(params.windowStartIso, params.windowEndIso);

  const policy = RESEARCH_EVENT_POLICIES[params.eventType];
  const kThreshold = Math.max(HARD_MIN_K_ANONYMITY, Math.trunc(params.minCohortSize ?? policy.minKAnonymity));
  const nowMs = params.nowMs ?? Date.now();
  const generatedAtIso = new Date(nowMs).toISOString();
  const expiresAtIso = new Date(nowMs + policy.aggregationRetentionDays * 24 * 60 * 60 * 1000).toISOString();
  const hoodId = params.hoodId ?? null;

  const stats = hoodId === null
    ? await params.researchDb
        .prepare(
          `SELECT COUNT(DISTINCT subject_key) AS distinct_subjects, COUNT(*) AS event_count
           FROM research_events
           WHERE event_type = ?1 AND city_id = ?2 AND occurred_at_iso >= ?3 AND occurred_at_iso < ?4 AND expires_at_iso > ?5`,
        )
        .bind(params.eventType, params.cityId, params.windowStartIso, params.windowEndIso, generatedAtIso)
        .first<{ distinct_subjects: number; event_count: number }>()
    : await params.researchDb
        .prepare(
          `SELECT COUNT(DISTINCT subject_key) AS distinct_subjects, COUNT(*) AS event_count
           FROM research_events
           WHERE event_type = ?1 AND city_id = ?2 AND hood_id = ?3 AND occurred_at_iso >= ?4 AND occurred_at_iso < ?5 AND expires_at_iso > ?6`,
        )
        .bind(params.eventType, params.cityId, hoodId, params.windowStartIso, params.windowEndIso, generatedAtIso)
        .first<{ distinct_subjects: number; event_count: number }>();

  const rawDistinct = Number(stats?.distinct_subjects ?? 0);
  const rawEvents = Number(stats?.event_count ?? 0);
  const kSuppressed = rawDistinct < kThreshold;

  const distinctSubjectsCount = kSuppressed ? null : coarsenCount(rawDistinct);
  const eventCount = kSuppressed ? null : coarsenCount(rawEvents);
  const windowId = `ragg_${params.eventType}_${params.cityId}_${hoodId ?? 'all'}_${params.windowStartIso.slice(0, 10)}_${params.windowEndIso.slice(0, 10)}`;

  await params.researchDb
    .prepare(
      `INSERT OR REPLACE INTO research_aggregation_windows (
        window_id, event_type, city_id, hood_id, window_start_iso, window_end_iso,
        distinct_subjects_count, event_count, k_threshold, k_suppressed, metrics_json,
        source, schema_version, generated_at_iso, expires_at_iso
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)`,
    )
    .bind(
      windowId,
      params.eventType,
      params.cityId,
      hoodId,
      params.windowStartIso,
      params.windowEndIso,
      distinctSubjectsCount,
      eventCount,
      kThreshold,
      kSuppressed ? 1 : 0,
      kSuppressed
        ? null
        : JSON.stringify({
            coarseningBucketWidth: COARSENING_BUCKET_WIDTH,
            exactCountsWithheld: true,
          }),
      'RESEARCH_DB',
      policy.schemaVersion,
      generatedAtIso,
      expiresAtIso,
    )
    .run();

  return {
    windowId,
    eventType: params.eventType,
    cityId: params.cityId,
    hoodId,
    windowStartIso: params.windowStartIso,
    windowEndIso: params.windowEndIso,
    kThreshold,
    kSuppressed,
    coarseningBucketWidth: COARSENING_BUCKET_WIDTH,
    exactCountsWithheld: true,
    distinctSubjectsCount,
    eventCount,
    provenance: {
      source: 'RESEARCH_DB',
      dataClassification: 'PSEUDONYMIZED RESEARCH DATA',
      schemaVersion: policy.schemaVersion,
      generatedAtIso,
      expiresAtIso,
      policyRationale: `Hard minimum cohort size k=${kThreshold} with UTC day-aligned windows and bucket width=${COARSENING_BUCKET_WIDTH} coarsening enforced to reduce neighborhood-level re-identification and query differencing risk.`,
    },
  };
}
