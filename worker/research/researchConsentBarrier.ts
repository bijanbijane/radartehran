/**
 * @file worker/research/researchConsentBarrier.ts
 * @description Atomic leased per-subject research processing permits and consent-revocation
 * drain primitives on `USER_DB`.
 *
 * Guarantees (in tandem with `RESEARCH_DB.research_subject_consent_fences`):
 * - Consent verification and permit issuance happen in ONE atomic SQL statement on `USER_DB`.
 * - No new permit can be issued once consent revocation begins.
 * - Every permit has a bounded lease (`expires_at_ms`) so crashed workers never permanently block revocation.
 * - No cross-D1 distributed transaction is assumed.
 */
import type { D1Database } from '../types';

export const DEFAULT_RESEARCH_PERMIT_TTL_MS = 15_000;
export const MIN_RESEARCH_PERMIT_TTL_MS = 250;
export const MAX_RESEARCH_PERMIT_TTL_MS = 60_000;
export const PERMANENT_DELETION_FENCE_REVISION = 2_147_483_647;

export type ResearchProcessingConsumerKind = 'http_ingest' | 'queue_ingest';

export type ResearchConsentRevocationStatus = 'DRAINING_PERMITS' | 'PENDING_ERASURE' | 'COMPLETED';

export interface AcquiredResearchProcessingPermit {
  readonly ok: true;
  readonly permitId: string;
  readonly uid: string;
  readonly subjectKey: string;
  readonly subjectKeyVersion: string;
  readonly consentRevision: number;
  readonly consentVersion: string;
  readonly consumerKind: ResearchProcessingConsumerKind;
  readonly acquiredAtMs: number;
  readonly expiresAtMs: number;
}

export interface RejectedResearchProcessingPermit {
  readonly ok: false;
  readonly statusCode: 403 | 503;
  readonly code: string;
}

export interface ResearchConsentRevocationJobRecord {
  readonly revocationId: string;
  readonly uid: string;
  readonly revokedConsentRevision: number;
  readonly newConsentRevision: number;
  readonly status: ResearchConsentRevocationStatus;
  readonly erasedEventsCount: number;
  readonly receiptIds: string[];
  readonly createdAtIso: string;
  readonly updatedAtIso: string;
  readonly completedAtIso: string | null;
}

function clampPermitTtlMs(ttlMs?: number): number {
  const raw = typeof ttlMs === 'number' && Number.isFinite(ttlMs) ? Math.trunc(ttlMs) : DEFAULT_RESEARCH_PERMIT_TTL_MS;
  return Math.max(MIN_RESEARCH_PERMIT_TTL_MS, Math.min(MAX_RESEARCH_PERMIT_TTL_MS, raw));
}

async function classifyPermitRejectionReason(
  userDb: D1Database,
  uid: string,
  expectedConsentRevision?: number,
): Promise<RejectedResearchProcessingPermit> {
  try {
    const blocked = await userDb
      .prepare('SELECT uid FROM account_write_blocks WHERE uid = ?1 AND released_at_iso IS NULL')
      .bind(uid)
      .first<{ uid: string }>();
    if (blocked) {
      return { ok: false, statusCode: 403, code: 'ACCOUNT_DELETION_IN_PROGRESS' };
    }

    const row = await userDb
      .prepare(
        'SELECT research_analytics_consent, consent_revision, revoked_at_iso FROM user_privacy_consents WHERE uid = ?1',
      )
      .bind(uid)
      .first<{
        research_analytics_consent: number;
        consent_revision?: number;
        revoked_at_iso: string | null;
      }>();

    if (!row || Number(row.research_analytics_consent) !== 1 || row.revoked_at_iso) {
      return { ok: false, statusCode: 403, code: 'RESEARCH_CONSENT_REQUIRED' };
    }

    const currentRev = Math.max(1, Number(row.consent_revision ?? 1));
    if (expectedConsentRevision !== undefined && currentRev !== expectedConsentRevision) {
      return { ok: false, statusCode: 403, code: 'CONSENT_REVISION_STALE_OR_REVOKED' };
    }

    const revJob = await userDb
      .prepare(
        `SELECT revocation_id FROM research_consent_revocation_jobs
         WHERE uid = ?1 AND status IN ('DRAINING_PERMITS', 'PENDING_ERASURE') AND new_consent_revision >= ?2
         LIMIT 1`,
      )
      .bind(uid, currentRev)
      .first<{ revocation_id: string }>();
    if (revJob) {
      return { ok: false, statusCode: 403, code: 'RESEARCH_CONSENT_REVOCATION_IN_PROGRESS' };
    }

    return { ok: false, statusCode: 403, code: 'RESEARCH_PERMIT_DENIED' };
  } catch {
    return { ok: false, statusCode: 503, code: 'CONSENT_VERIFICATION_UNAVAILABLE' };
  }
}

/**
 * Atomically checks active research consent + absence of account write blocks + absence of
 * active consent revocation jobs AND issues a bounded-lease processing permit in ONE SQL statement.
 */
export async function acquireResearchProcessingPermitInD1(params: {
  userDb: D1Database;
  uid: string;
  subjectKey: string;
  subjectKeyVersion: string;
  consumerKind: ResearchProcessingConsumerKind;
  expectedConsentRevision?: number;
  ttlMs?: number;
  nowMs?: number;
}): Promise<AcquiredResearchProcessingPermit | RejectedResearchProcessingPermit> {
  const nowMs = params.nowMs ?? Date.now();
  const ttlMs = clampPermitTtlMs(params.ttlMs);
  const expiresAtMs = nowMs + ttlMs;
  const permitId = `rperm_${nowMs}_${crypto.randomUUID().slice(0, 10)}`;
  const expectedRev = params.expectedConsentRevision ?? null;

  try {
    const insertRes = await params.userDb
      .prepare(
        `INSERT INTO research_processing_permits (
          permit_id, uid, subject_key, subject_key_version, consent_revision,
          consumer_kind, acquired_at_ms, expires_at_ms, released_at_ms
        )
        SELECT
          ?1,
          upc.uid,
          ?2,
          ?3,
          upc.consent_revision,
          ?4,
          ?5,
          ?6,
          NULL
        FROM user_privacy_consents upc
        WHERE upc.uid = ?7
          AND upc.research_analytics_consent = 1
          AND upc.revoked_at_iso IS NULL
          AND (?8 IS NULL OR upc.consent_revision = ?9)
          AND NOT EXISTS (
            SELECT 1 FROM account_write_blocks awb
            WHERE awb.uid = ?10 AND awb.released_at_iso IS NULL
          )
          AND NOT EXISTS (
            SELECT 1 FROM research_consent_revocation_jobs rcj
            WHERE rcj.uid = ?11
              AND rcj.status IN ('DRAINING_PERMITS', 'PENDING_ERASURE')
              AND rcj.new_consent_revision >= upc.consent_revision
          )`,
      )
      .bind(
        permitId,
        params.subjectKey,
        params.subjectKeyVersion,
        params.consumerKind,
        nowMs,
        expiresAtMs,
        params.uid,
        expectedRev,
        expectedRev,
        params.uid,
        params.uid,
      )
      .run();

    if ((insertRes.meta?.changes ?? 0) !== 1) {
      return classifyPermitRejectionReason(params.userDb, params.uid, params.expectedConsentRevision);
    }

    const issued = await params.userDb
      .prepare(
        `SELECT rpp.consent_revision, upc.consent_version
         FROM research_processing_permits rpp
         LEFT JOIN user_privacy_consents upc ON upc.uid = rpp.uid
         WHERE rpp.permit_id = ?1`,
      )
      .bind(permitId)
      .first<{ consent_revision: number; consent_version?: string | null }>();

    if (!issued) {
      return { ok: false, statusCode: 503, code: 'RESEARCH_PERMIT_READBACK_FAILED' };
    }

    return {
      ok: true,
      permitId,
      uid: params.uid,
      subjectKey: params.subjectKey,
      subjectKeyVersion: params.subjectKeyVersion,
      consentRevision: Math.max(1, Number(issued.consent_revision ?? 1)),
      consentVersion: String(issued.consent_version || 'v1'),
      consumerKind: params.consumerKind,
      acquiredAtMs: nowMs,
      expiresAtMs,
    };
  } catch {
    return { ok: false, statusCode: 503, code: 'CONSENT_VERIFICATION_UNAVAILABLE' };
  }
}

/**
 * Releases an active research processing permit idempotently (always invoked in `finally`).
 */
export async function releaseResearchProcessingPermitInD1(params: {
  userDb: D1Database;
  permitId: string;
  nowMs?: number;
}): Promise<void> {
  const nowMs = params.nowMs ?? Date.now();
  await params.userDb
    .prepare(
      'UPDATE research_processing_permits SET released_at_ms = ?1 WHERE permit_id = ?2 AND released_at_ms IS NULL',
    )
    .bind(nowMs, params.permitId)
    .run();
}

/**
 * Marks expired permits as released so crashed consumers never permanently block consent revocation.
 */
export async function expireStaleResearchProcessingPermitsInD1(params: {
  userDb: D1Database;
  uid: string;
  nowMs?: number;
}): Promise<number> {
  const nowMs = params.nowMs ?? Date.now();
  const res = await params.userDb
    .prepare(
      `UPDATE research_processing_permits
       SET released_at_ms = expires_at_ms
       WHERE uid = ?1 AND released_at_ms IS NULL AND expires_at_ms <= ?2`,
    )
    .bind(params.uid, nowMs)
    .run();
  return res.meta?.changes ?? 0;
}

/**
 * Counts currently active (unreleased & unexpired) research processing permits for a user,
 * optionally bounded to `consent_revision <= maxConsentRevision`.
 */
export async function countActiveResearchProcessingPermitsInD1(params: {
  userDb: D1Database;
  uid: string;
  maxConsentRevision?: number;
  nowMs?: number;
}): Promise<number> {
  const nowMs = params.nowMs ?? Date.now();
  const maxRev = params.maxConsentRevision ?? null;
  const row = await params.userDb
    .prepare(
      `SELECT COUNT(*) AS cnt
       FROM research_processing_permits
       WHERE uid = ?1
         AND released_at_ms IS NULL
         AND expires_at_ms > ?2
         AND (?3 IS NULL OR consent_revision <= ?4)`,
    )
    .bind(params.uid, nowMs, maxRev, maxRev)
    .first<{ cnt: number }>();
  return Number(row?.cnt ?? 0);
}

/**
 * UID-free queued permit acquisition: resolves `(subjectKey, subjectKeyVersion)` via `USER_DB`
 * subject registry, checks for any blocking erasure outbox items, and atomically acquires a
 * leased processing permit tied to the user's active consent revision.
 */
export async function acquireQueuedResearchProcessingPermitInD1(params: {
  userDb: D1Database;
  subjectKey: string;
  subjectKeyVersion: string;
  expectedConsentRevision?: number;
  ttlMs?: number;
  nowMs?: number;
}): Promise<AcquiredResearchProcessingPermit | RejectedResearchProcessingPermit> {
  try {
    const outboxRows = await params.userDb
      .prepare(
        `SELECT outbox_id, status, max_consent_revision
         FROM research_erasure_outbox
         WHERE subject_key = ?1 AND subject_key_version = ?2`,
      )
      .bind(params.subjectKey, params.subjectKeyVersion)
      .all<{ outbox_id: string; status: string; max_consent_revision?: number | null }>();

    for (const item of outboxRows.results ?? []) {
      const maxRev =
        item.max_consent_revision === null || item.max_consent_revision === undefined
          ? null
          : Number(item.max_consent_revision);
      if (item.status !== 'COMPLETED') {
        return { ok: false, statusCode: 403, code: 'RESEARCH_ERASURE_PENDING_OR_COMPLETED' };
      }
      // Full account deletion outbox (max_consent_revision IS NULL) permanently blocks the subject.
      if (maxRev === null) {
        return { ok: false, statusCode: 403, code: 'RESEARCH_ERASURE_PENDING_OR_COMPLETED' };
      }
      // Consent-revocation outbox blocks if caller's revision is <= revoked revision or unspecified.
      if (params.expectedConsentRevision === undefined || params.expectedConsentRevision <= maxRev) {
        return { ok: false, statusCode: 403, code: 'CONSENT_REVISION_STALE_OR_REVOKED' };
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
      return { ok: false, statusCode: 403, code: 'RESEARCH_SUBJECT_NOT_ELIGIBLE' };
    }

    return acquireResearchProcessingPermitInD1({
      userDb: params.userDb,
      uid: reg.uid,
      subjectKey: params.subjectKey,
      subjectKeyVersion: params.subjectKeyVersion,
      consumerKind: 'queue_ingest',
      expectedConsentRevision: params.expectedConsentRevision,
      ttlMs: params.ttlMs,
      nowMs: params.nowMs,
    });
  } catch {
    return { ok: false, statusCode: 503, code: 'CONSENT_VERIFICATION_UNAVAILABLE' };
  }
}

export function mapConsentRevocationJobRow(row: Record<string, unknown>): ResearchConsentRevocationJobRecord {
  let receiptIds: string[] = [];
  try {
    const parsed = JSON.parse(String(row.receipt_ids_json || '[]'));
    if (Array.isArray(parsed)) {
      receiptIds = parsed.map((x) => String(x)).filter(Boolean);
    }
  } catch {
    receiptIds = [];
  }
  const rawStatus = String(row.status || 'DRAINING_PERMITS');
  const status: ResearchConsentRevocationStatus =
    rawStatus === 'COMPLETED' || rawStatus === 'PENDING_ERASURE' ? rawStatus : 'DRAINING_PERMITS';

  return {
    revocationId: String(row.revocation_id),
    uid: String(row.uid),
    revokedConsentRevision: Number(row.revoked_consent_revision ?? 0),
    newConsentRevision: Number(row.new_consent_revision ?? 1),
    status,
    erasedEventsCount: Number(row.erased_events_count ?? 0),
    receiptIds,
    createdAtIso: String(row.created_at_iso),
    updatedAtIso: String(row.updated_at_iso),
    completedAtIso: row.completed_at_iso ? String(row.completed_at_iso) : null,
  };
}
