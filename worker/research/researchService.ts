/**
 * @file worker/research/researchService.ts
 * @description Server-side consent-enforced behavioral research ingestion, idempotent subject erasure
 * inbox consumer, retention expiration purge, and k-anonymity small-group-suppressed aggregation engine.
 *
 * Strict Domain Isolation:
 * - Reads consent & subject registry strictly from `USER_DB` (fail-closed if unavailable).
 * - Writes events, aggregates, and erasure receipts strictly to `RESEARCH_DB` (zero raw UID / zero PII).
 */
import { evaluateTieredWorkerRateLimit } from '../cache/kvAndEdgeRateLimiter';
import { requireResearchDb, requireUserDb } from '../db/bindingResolver';
import type { D1Database, WorkerEnv } from '../types';
import { deriveResearchSubjectKey } from './pseudonymizer';
import {
  acquireResearchProcessingPermitInD1,
  releaseResearchProcessingPermitInD1,
} from './researchConsentBarrier';
import {
  MAX_RESEARCH_BATCH_SIZE,
  RESEARCH_EVENT_POLICIES,
  validateAndMinimizeResearchEvent,
  type AllowedResearchEventType,
  type ValidatedResearchEvent,
} from './researchEventContract';

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
    const consentRevision = Number(row.consent_revision ?? 1);
    if (!Number.isSafeInteger(consentRevision) || consentRevision < 1) {
      return { allowed: false, statusCode: 503, code: 'CONSENT_REVISION_INVALID' };
    }
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
    const outbox = await params.userDb
      .prepare(
        `SELECT outbox_id FROM research_erasure_outbox
         WHERE subject_key = ?1 AND subject_key_version = ?2 LIMIT 1`,
      )
      .bind(params.subjectKey, params.subjectKeyVersion)
      .first<{ outbox_id: string }>();
    if (outbox) {
      return { allowed: false, statusCode: 403, code: 'RESEARCH_ERASURE_PENDING_OR_COMPLETED' };
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
 * Reusable by both HTTP direct ingestion and Queue consumer (`research_event_ingest`).
 */
export async function writePseudonymizedEventsToResearchDb(params: {
  researchDb: D1Database;
  subjectKey: string;
  subjectKeyVersion: string;
  consentRevision?: number;
  events: readonly ValidatedResearchEvent[];
  nowMs?: number;
  rejectedCount?: number;
}): Promise<{
  readonly batchId: string;
  readonly receiptId: string;
  readonly acceptedCount: number;
  readonly deduplicatedCount: number;
  readonly fencedCount: number;
}> {
  const nowMs = params.nowMs ?? Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const consentRevision = params.consentRevision ?? 1;
  if (!Number.isSafeInteger(consentRevision) || consentRevision < 1) {
    throw new Error('RESEARCH_CONSENT_REVISION_INVALID');
  }
  const batchId = `rb_${nowMs}_${crypto.randomUUID().slice(0, 8)}`;
  const receiptId = `rcpt_${nowMs}_${crypto.randomUUID().slice(0, 8)}`;

  let acceptedCount = 0;
  let deduplicatedCount = 0;
  let fencedCount = 0;

  for (const evt of params.events) {
    const existing = await params.researchDb
      .prepare('SELECT idempotency_key FROM research_idempotency_keys WHERE idempotency_key = ?1')
      .bind(evt.idempotencyKey)
      .first<{ idempotency_key: string }>();

    if (existing) {
      deduplicatedCount += 1;
      continue;
    }

    const eventId = `revt_${nowMs}_${crypto.randomUUID().slice(0, 10)}`;
    // The fence check is part of the INSERT statement itself. A prior SELECT would leave
    // a race in which a revocation could commit its fence between the check and this write.
    const insertEventStmt = params.researchDb
      .prepare(
        `INSERT OR IGNORE INTO research_events (
          event_id, subject_key, subject_key_version, event_type, schema_version,
          city_id, hood_id, session_bucket, payload_json,
          occurred_at_iso, ingested_at_iso, expires_at_iso, idempotency_key, consent_revision
        )
        SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14
        WHERE NOT EXISTS (
          SELECT 1 FROM research_subject_consent_fences
          WHERE subject_key = ?2 AND subject_key_version = ?3
            AND revoked_through_revision >= ?14
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
      );

    const insertIdemStmt = params.researchDb
      .prepare(
        `INSERT OR IGNORE INTO research_idempotency_keys (
          idempotency_key, event_type, recorded_at_iso, expires_at_iso
        )
        SELECT ?1, ?2, ?3, ?4
        WHERE EXISTS (
          SELECT 1 FROM research_events
          WHERE idempotency_key = ?1 AND subject_key = ?5
            AND subject_key_version = ?6 AND consent_revision = ?7
        )`,
      )
      .bind(
        evt.idempotencyKey,
        evt.eventType,
        nowIso,
        evt.expiresAtIso,
        params.subjectKey,
        params.subjectKeyVersion,
        consentRevision,
      );

    const batchResults = await params.researchDb.batch([insertEventStmt, insertIdemStmt]);
    if (batchResults.length !== 2 || batchResults.some((r) => !r.success)) {
      throw new Error('RESEARCH_DB_ATOMIC_WRITE_FAILED');
    }
    const eventChanges = batchResults[0]?.meta?.changes;
    const idempotencyChanges = batchResults[1]?.meta?.changes;
    if (!Number.isSafeInteger(eventChanges) || !Number.isSafeInteger(idempotencyChanges)) {
      throw new Error('RESEARCH_DB_ATOMIC_WRITE_RESULT_UNCONFIRMED');
    }
    if (eventChanges === 0) {
      const fence = await params.researchDb
        .prepare(
          'SELECT revoked_through_revision FROM research_subject_consent_fences WHERE subject_key = ?1 AND subject_key_version = ?2',
        )
        .bind(params.subjectKey, params.subjectKeyVersion)
        .first<{ revoked_through_revision: number }>();
      if (fence && Number(fence.revoked_through_revision) >= consentRevision) {
        fencedCount += 1;
      } else {
        deduplicatedCount += 1;
      }
      continue;
    }
    if (eventChanges !== 1 || idempotencyChanges !== 1) {
      throw new Error('RESEARCH_DB_IDEMPOTENCY_STATE_INCONSISTENT');
    }
    acceptedCount += 1;
  }

  const receiptInsert = await params.researchDb
    .prepare(
      `INSERT INTO research_ingestion_receipts (
        receipt_id, batch_id, accepted_count, deduplicated_count, rejected_count, recorded_at_iso
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
    )
    .bind(receiptId, batchId, acceptedCount, deduplicatedCount, params.rejectedCount ?? 0, nowIso)
    .run();
  if (!receiptInsert.success) throw new Error('RESEARCH_INGESTION_RECEIPT_WRITE_FAILED');

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
  beforeResearchWriteHook?: () => Promise<void>;
  afterConsentCheckBeforeResearchWriteHook?: (context: { permitId: string; consentRevision: number }) => Promise<void>;
}): Promise<ResearchIngestionResponse | ResearchIngestionFailure> {
  const userDbRes = requireUserDb(params.env);
  if (userDbRes.ok === false) {
    return { ok: false, statusCode: 503, code: userDbRes.code, messageFa: userDbRes.messageFa };
  }
  const researchDbRes = requireResearchDb(params.env);
  if (researchDbRes.ok === false) {
    return { ok: false, statusCode: 503, code: researchDbRes.code, messageFa: researchDbRes.messageFa };
  }

  // 1. Authoritative server-side consent check (captures monotonic consentRevision)
  const consent = await verifyServerSideResearchConsent(userDbRes.db, params.uid);
  if (consent.allowed === false) {
    return {
      ok: false,
      statusCode: consent.statusCode,
      code: consent.code,
      messageFa:
        consent.statusCode === 503
          ? 'بررسی رضایت پژوهشی در دسترس نیست؛ ثبت رویداد متوقف شد.'
          : 'کاربر رضایت فعال برای ثبت داده‌های پژوهشی ندارد.',
    };
  }
  const capturedConsentRevision = consent.consentRevision;

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
  const registryWrite = await userDbRes.db
    .prepare(
      `INSERT OR IGNORE INTO user_research_subject_registry (
        uid, subject_key, subject_key_version, created_at_iso
      ) VALUES (?1, ?2, ?3, ?4)`,
    )
    .bind(params.uid, pseudo.derived.subjectKey, pseudo.derived.subjectKeyVersion, nowIso)
    .run();
  if (!registryWrite.success) {
    return {
      ok: false,
      statusCode: 503,
      code: 'RESEARCH_SUBJECT_REGISTRY_WRITE_FAILED',
      messageFa: 'ثبت نگاشت حذف‌پذیر داده پژوهشی در دسترس نیست؛ ثبت رویداد متوقف شد.',
    };
  }

  // Permit issuance atomically binds this ingestion to the captured consent revision.
  const permit = await acquireResearchProcessingPermitInD1({
    userDb: userDbRes.db,
    uid: params.uid,
    subjectKey: pseudo.derived.subjectKey,
    subjectKeyVersion: pseudo.derived.subjectKeyVersion,
    consumerKind: 'http_ingest',
    expectedConsentRevision: capturedConsentRevision,
    nowMs,
  });
  if (permit.ok === false) {
    return {
      ok: false,
      statusCode: permit.statusCode,
      code: permit.code,
      messageFa: 'مجوز پردازش پژوهشی صادر نشد؛ ثبت رویداد متوقف شد.',
    };
  }

  try {
    // An already-issued permit may finish while revocation drains. The RESEARCH_DB
    // revision fence prevents it (or any zombie worker) from writing after completion.
    if (params.afterConsentCheckBeforeResearchWriteHook) {
      await params.afterConsentCheckBeforeResearchWriteHook({
        permitId: permit.permitId,
        consentRevision: permit.consentRevision,
      });
    }
    if (params.beforeResearchWriteHook) await params.beforeResearchWriteHook();

    const written = await writePseudonymizedEventsToResearchDb({
      researchDb: researchDbRes.db,
      subjectKey: pseudo.derived.subjectKey,
      subjectKeyVersion: pseudo.derived.subjectKeyVersion,
      consentRevision: permit.consentRevision,
      events: validEvents,
      nowMs,
      rejectedCount: rejections.length,
    });

    return {
      ok: true,
      batchId: written.batchId,
      receiptId: written.receiptId,
      acceptedCount: written.acceptedCount,
      deduplicatedCount: written.deduplicatedCount,
      rejectedCount: rejections.length,
      consentRevision: permit.consentRevision,
      rejections,
    };
  } finally {
    await releaseResearchProcessingPermitInD1({ userDb: userDbRes.db, permitId: permit.permitId, nowMs: Date.now() });
  }
}

export interface ResearchSubjectErasureResult {
  readonly ok: true;
  readonly outboxId: string;
  readonly receiptId: string;
  readonly deletedEventsCount: number;
  readonly invalidatedAggregationWindowsCount: number;
  readonly idempotentReplay: boolean;
  readonly completedAtIso: string;
}

/**
 * Idempotent Inbox consumer in `RESEARCH_DB` executing erasure by `(subject_key, subject_key_version)`.
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
  const maxConsentRevision =
    params.maxConsentRevision === undefined || params.maxConsentRevision === null
      ? null
      : Number(params.maxConsentRevision);
  if (maxConsentRevision !== null && (!Number.isSafeInteger(maxConsentRevision) || maxConsentRevision < 1)) {
    throw new Error('RESEARCH_ERASURE_MAX_CONSENT_REVISION_INVALID');
  }
  const nowIso = new Date(nowMs).toISOString();

  const existing = await params.researchDb
    .prepare(
      'SELECT subject_key, subject_key_version, receipt_id, deleted_events_count, completed_at_iso, status FROM research_erasure_inbox WHERE outbox_id = ?1',
    )
    .bind(params.outboxId)
    .first<{
      subject_key: string;
      subject_key_version: string;
      receipt_id: string;
      deleted_events_count: number;
      completed_at_iso: string | null;
      status: string;
    }>();

  // An outbox ID is an idempotency key, not an authorization to reuse a receipt
  // for another pseudonymous subject or key version.
  if (
    existing &&
    (existing.subject_key !== params.subjectKey ||
      existing.subject_key_version !== params.subjectKeyVersion)
  ) {
    throw new Error('RESEARCH_SUBJECT_ERASURE_OUTBOX_IDENTITY_CONFLICT');
  }

  if (existing && existing.status === 'COMPLETED' && existing.completed_at_iso) {
    return {
      ok: true,
      outboxId: params.outboxId,
      receiptId: existing.receipt_id,
      deletedEventsCount: Number(existing.deleted_events_count || 0),
      invalidatedAggregationWindowsCount: 0,
      idempotentReplay: true,
      completedAtIso: existing.completed_at_iso,
    };
  }

  const countRow = await params.researchDb
    .prepare(
      'SELECT COUNT(*) AS cnt FROM research_events WHERE subject_key = ?1 AND subject_key_version = ?2 AND (?3 IS NULL OR consent_revision <= ?4)',
    )
    .bind(params.subjectKey, params.subjectKeyVersion, maxConsentRevision, maxConsentRevision)
    .first<{ cnt: number }>();
  if (!countRow || !Number.isSafeInteger(Number(countRow.cnt)) || Number(countRow.cnt) < 0) {
    throw new Error('RESEARCH_ERASURE_TARGET_COUNT_UNAVAILABLE');
  }
  const targetCount = Number(countRow.cnt);

  // Identify derived aggregation scopes impacted by this subject so stale counts are invalidated atomically.
  const impactedScopesRes = await params.researchDb
    .prepare(
      'SELECT DISTINCT event_type, city_id FROM research_events WHERE subject_key = ?1 AND subject_key_version = ?2 AND (?3 IS NULL OR consent_revision <= ?4)',
    )
    .bind(params.subjectKey, params.subjectKeyVersion, maxConsentRevision, maxConsentRevision)
    .all<{ event_type: string; city_id: string }>();
  if (!impactedScopesRes.success) throw new Error('RESEARCH_ERASURE_IMPACTED_SCOPE_READ_FAILED');
  const impactedScopes = impactedScopesRes.results ?? [];

  // Stable IDs make concurrent deliveries of the same durable outbox command converge
  // on one immutable receipt. INSERT OR REPLACE could overwrite a receipt already returned
  // to a competing USER_DB worker.
  const erasureId = `rerase_${params.outboxId}`;
  const receiptId = `ercpt_${params.outboxId}`;

  // Claim the durable outbox identity before any destructive statement. The batch is
  // atomic; guarded deletes below can run only when this outbox ID belongs to this exact
  // subject key/version. This also protects the race where two different subjects submit
  // the same outbox ID after both passed the initial read.
  const insertInboxStmt = params.researchDb
    .prepare(
      `INSERT OR IGNORE INTO research_erasure_inbox (
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

  const deleteEventsStmt = params.researchDb
    .prepare(
      `DELETE FROM research_events
       WHERE subject_key = ?1 AND subject_key_version = ?2
         AND (?4 IS NULL OR consent_revision <= ?4)
         AND EXISTS (
           SELECT 1 FROM research_erasure_inbox
           WHERE outbox_id = ?3 AND subject_key = ?1 AND subject_key_version = ?2
         )`,
    )
    .bind(params.subjectKey, params.subjectKeyVersion, params.outboxId, maxConsentRevision);

  const invalidateWindowStmts = impactedScopes.map((scope) =>
    params.researchDb
      .prepare(
        `DELETE FROM research_aggregation_windows
         WHERE event_type = ?1 AND city_id = ?2
           AND EXISTS (
             SELECT 1 FROM research_erasure_inbox
             WHERE outbox_id = ?3 AND subject_key = ?4 AND subject_key_version = ?5
           )`,
      )
      .bind(
        scope.event_type,
        scope.city_id,
        params.outboxId,
        params.subjectKey,
        params.subjectKeyVersion,
      ),
  );

  const fenceRevision = maxConsentRevision ?? 2_147_483_647;
  const updateConsentFenceStmt = params.researchDb
    .prepare(
      `INSERT INTO research_subject_consent_fences (
        subject_key, subject_key_version, revoked_through_revision,
        last_outbox_id, last_receipt_id, updated_at_iso
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
      ON CONFLICT(subject_key, subject_key_version) DO UPDATE SET
        revoked_through_revision = MAX(
          research_subject_consent_fences.revoked_through_revision,
          excluded.revoked_through_revision
        ),
        last_outbox_id = excluded.last_outbox_id,
        last_receipt_id = excluded.last_receipt_id,
        updated_at_iso = excluded.updated_at_iso`,
    )
    .bind(
      params.subjectKey,
      params.subjectKeyVersion,
      fenceRevision,
      params.outboxId,
      receiptId,
      nowIso,
    );

  const batchResults = await params.researchDb.batch([
    insertInboxStmt,
    deleteEventsStmt,
    ...invalidateWindowStmts,
    updateConsentFenceStmt,
  ]);
  if (
    batchResults.length !== 3 + invalidateWindowStmts.length ||
    batchResults.some((r) => !r.success)
  ) {
    throw new Error('RESEARCH_SUBJECT_ERASURE_BATCH_FAILED');
  }

  // Read the canonical row after commit. A competing Worker may have inserted it first.
  const canonicalInbox = await params.researchDb
    .prepare(
      'SELECT subject_key, subject_key_version, status, deleted_events_count, receipt_id, completed_at_iso FROM research_erasure_inbox WHERE outbox_id = ?1',
    )
    .bind(params.outboxId)
    .first<{
      subject_key: string;
      subject_key_version: string;
      status: string;
      deleted_events_count: number;
      receipt_id: string;
      completed_at_iso: string | null;
    }>();
  if (
    !canonicalInbox ||
    canonicalInbox.subject_key !== params.subjectKey ||
    canonicalInbox.subject_key_version !== params.subjectKeyVersion ||
    canonicalInbox.status !== 'COMPLETED' ||
    !canonicalInbox.completed_at_iso ||
    !canonicalInbox.receipt_id ||
    !Number.isSafeInteger(Number(canonicalInbox.deleted_events_count)) ||
    Number(canonicalInbox.deleted_events_count) < 0
  ) {
    throw new Error('RESEARCH_SUBJECT_ERASURE_CANONICAL_RECEIPT_UNAVAILABLE');
  }

  return {
    ok: true,
    outboxId: params.outboxId,
    receiptId: canonicalInbox.receipt_id,
    deletedEventsCount: Number(canonicalInbox.deleted_events_count),
    invalidatedAggregationWindowsCount: impactedScopes.length,
    idempotentReplay: canonicalInbox.receipt_id !== receiptId || Number(batchResults[0]?.meta?.changes ?? 1) === 0,
    completedAtIso: canonicalInbox.completed_at_iso,
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
  if (!evRes.success || !idemRes.success || !aggRes.success) {
    throw new Error('RESEARCH_RETENTION_PURGE_FAILED');
  }

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
  const utcMidnightPattern = /^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/;
  if (!utcMidnightPattern.test(windowStartIso) || !utcMidnightPattern.test(windowEndIso)) {
    throw new AggregationWindowPolicyError(
      'AGGREGATION_WINDOW_NOT_CANONICAL_UTC',
      'Aggregation window boundaries must be explicit canonical UTC midnight timestamps ending in .000Z.',
    );
  }
  const startMs = Date.parse(windowStartIso);
  const endMs = Date.parse(windowEndIso);
  if (
    !Number.isFinite(startMs) ||
    !Number.isFinite(endMs) ||
    new Date(startMs).toISOString() !== windowStartIso ||
    new Date(endMs).toISOString() !== windowEndIso ||
    endMs <= startMs
  ) {
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
  if (!policy) {
    throw new AggregationWindowPolicyError('UNSUPPORTED_RESEARCH_EVENT_TYPE', 'Unsupported research event type.');
  }
  const requestedK = Number(params.minCohortSize ?? policy.minKAnonymity);
  const normalizedK = Number.isSafeInteger(requestedK) ? requestedK : policy.minKAnonymity;
  const kThreshold = Math.max(HARD_MIN_K_ANONYMITY, normalizedK);
  const nowMs = params.nowMs ?? Date.now();
  const generatedAtIso = new Date(nowMs).toISOString();
  const expiresAtIso = new Date(nowMs + policy.aggregationRetentionDays * 24 * 60 * 60 * 1000).toISOString();
  const hoodId = params.hoodId ?? null;

  const stats = hoodId === null
    ? await params.researchDb
        .prepare(
          `SELECT COALESCE(MAX(version_stats.distinct_subjects), 0) AS distinct_subjects,
                  COALESCE(SUM(version_stats.event_count), 0) AS event_count
           FROM (
             SELECT subject_key_version,
                    COUNT(DISTINCT subject_key) AS distinct_subjects,
                    COUNT(*) AS event_count
             FROM research_events
             WHERE event_type = ?1 AND city_id = ?2 AND occurred_at_iso >= ?3 AND occurred_at_iso < ?4 AND expires_at_iso > ?5
             GROUP BY subject_key_version
           ) AS version_stats`,
        )
        .bind(params.eventType, params.cityId, params.windowStartIso, params.windowEndIso, generatedAtIso)
        .first<{ distinct_subjects: number; event_count: number }>()
    : await params.researchDb
        .prepare(
          `SELECT COALESCE(MAX(version_stats.distinct_subjects), 0) AS distinct_subjects,
                  COALESCE(SUM(version_stats.event_count), 0) AS event_count
           FROM (
             SELECT subject_key_version,
                    COUNT(DISTINCT subject_key) AS distinct_subjects,
                    COUNT(*) AS event_count
             FROM research_events
             WHERE event_type = ?1 AND city_id = ?2 AND hood_id = ?3 AND occurred_at_iso >= ?4 AND occurred_at_iso < ?5 AND expires_at_iso > ?6
             GROUP BY subject_key_version
           ) AS version_stats`,
        )
        .bind(params.eventType, params.cityId, hoodId, params.windowStartIso, params.windowEndIso, generatedAtIso)
        .first<{ distinct_subjects: number; event_count: number }>();

  if (
    !stats ||
    !Number.isSafeInteger(Number(stats.distinct_subjects)) ||
    !Number.isSafeInteger(Number(stats.event_count)) ||
    Number(stats.distinct_subjects) < 0 ||
    Number(stats.event_count) < 0
  ) {
    throw new Error('RESEARCH_AGGREGATION_STATS_UNAVAILABLE_OR_INVALID');
  }
  const rawDistinct = Number(stats.distinct_subjects);
  const rawEvents = Number(stats.event_count);
  const kSuppressed = rawDistinct < kThreshold;

  const distinctSubjectsCount = kSuppressed ? null : coarsenCount(rawDistinct);
  const eventCount = kSuppressed ? null : coarsenCount(rawEvents);
  const windowId = `ragg_${params.eventType}_${params.cityId}_${hoodId ?? 'all'}_${params.windowStartIso.slice(0, 10)}_${params.windowEndIso.slice(0, 10)}`;

  const aggregationWrite = await params.researchDb
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
  if (!aggregationWrite.success) throw new Error('RESEARCH_AGGREGATION_WINDOW_WRITE_FAILED');

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
