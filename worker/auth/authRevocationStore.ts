/**
 * Durable D1 auth revocation ledger shared by account lifecycle and Cloudflare sessions.
 * This module has no Firebase or external identity-provider dependency.
 */
import type { D1Database } from '../types';

export type RevocationActionType = 'REVOKE_BEFORE' | 'DISABLE_USER' | 'REENABLE_USER';

export interface RecordUserRevocationResult {
  applied: boolean;
  idempotentReplay: boolean;
  watermarkKey: string;
  watermarkValue: string | null;
  eventId: string;
  statusCode: 200 | 400 | 409 | 503;
  reason: string;
}

export async function recordUserRevocationInD1(params: {
  db: D1Database | undefined;
  uid: string;
  action: RevocationActionType;
  validSinceSeconds?: number;
  actorUid: string;
  reason: string;
  idempotencyKey: string;
  nowMs?: number;
}): Promise<RecordUserRevocationResult> {
  const uid = String(params.uid || '').trim();
  const actorUid = String(params.actorUid || '').trim();
  const idempotencyKey = String(params.idempotencyKey || '').trim();
  const watermarkKey = `revoked_uid:${uid}`;

  if (!params.db) {
    return {
      applied: false,
      idempotentReplay: false,
      watermarkKey,
      watermarkValue: null,
      eventId: '',
      statusCode: 503,
      reason: 'AUTH_REVOCATION_STORE_UNAVAILABLE',
    };
  }
  if (!uid || uid.length > 128 || !actorUid || !idempotencyKey) {
    return {
      applied: false,
      idempotentReplay: false,
      watermarkKey,
      watermarkValue: null,
      eventId: '',
      statusCode: 400,
      reason: 'INVALID_REVOCATION_PARAMETERS',
    };
  }

  const nowMs = params.nowMs ?? Date.now();
  const nowSec = Math.floor(nowMs / 1000);
  const nowIso = new Date(nowMs).toISOString();
  const validSinceSeconds =
    params.action === 'REVOKE_BEFORE'
      ? Math.max(1, Math.floor(params.validSinceSeconds ?? nowSec))
      : null;
  const watermarkValue =
    params.action === 'DISABLE_USER'
      ? 'DISABLED'
      : params.action === 'REVOKE_BEFORE'
        ? String(validSinceSeconds)
        : null;
  const eventId = `rev_${nowMs}_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;

  const resolveExistingRecord = (
    existing: { event_id: string; uid: string; action: string; valid_since_seconds: number | null },
  ): RecordUserRevocationResult => {
    const existingValidSince =
      existing.valid_since_seconds === null || existing.valid_since_seconds === undefined
        ? null
        : Number(existing.valid_since_seconds);
    const sameOperation =
      existing.uid === uid &&
      existing.action === params.action &&
      existingValidSince === validSinceSeconds;
    if (!sameOperation) {
      return {
        applied: false,
        idempotentReplay: false,
        watermarkKey,
        watermarkValue: null,
        eventId: existing.event_id,
        statusCode: 409,
        reason: 'IDEMPOTENCY_KEY_CONFLICT',
      };
    }
    return {
      applied: true,
      idempotentReplay: true,
      watermarkKey,
      watermarkValue,
      eventId: existing.event_id,
      statusCode: 200,
      reason: 'REVOCATION_IDEMPOTENT_REPLAY',
    };
  };

  const lookupExistingByIdempotencyKey = async () =>
    params.db!
      .prepare('SELECT event_id, uid, action, valid_since_seconds FROM auth_revocation_events WHERE idempotency_key = ?1')
      .bind(idempotencyKey)
      .first<{ event_id: string; uid: string; action: string; valid_since_seconds: number | null }>();

  try {
    const existing = await lookupExistingByIdempotencyKey();
    if (existing?.event_id) {
      return resolveExistingRecord(existing);
    }

    // Strict INSERT (not INSERT OR IGNORE) guarantees that on concurrent UNIQUE(idempotency_key)
    // race, statement 1 fails and D1 atomically rolls back statement 2 (sync_watermarks) so a
    // losing concurrent request can NEVER overwrite the watermark with conflicting parameters.
    const insertEventStmt = params.db
      .prepare(
        `INSERT INTO auth_revocation_events (
          event_id, uid, action, valid_since_seconds, actor_uid, reason, idempotency_key, created_at_iso
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
      )
      .bind(
        eventId,
        uid,
        params.action,
        validSinceSeconds,
        actorUid,
        String(params.reason || 'ADMIN_REVOCATION').slice(0, 240),
        idempotencyKey,
        nowIso,
      );

    const watermarkStmt =
      params.action === 'REENABLE_USER'
        ? params.db.prepare('DELETE FROM sync_watermarks WHERE watermark_key = ?1').bind(watermarkKey)
        : params.db
            .prepare(
              'INSERT OR REPLACE INTO sync_watermarks (watermark_key, watermark_value, updated_at_iso) VALUES (?1, ?2, ?3)',
            )
            .bind(watermarkKey, watermarkValue!, nowIso);

    // Execute event audit insert + watermark mutation atomically inside a single D1 transaction.
    // If either statement fails, D1 rolls back the entire batch so retries never see a phantom audit row.
    const batchResults = await params.db.batch([insertEventStmt, watermarkStmt]);
    if (!Array.isArray(batchResults) || batchResults.length !== 2 || batchResults.some((r) => !r.success)) {
      const raced = await lookupExistingByIdempotencyKey().catch(() => null);
      if (raced?.event_id) {
        return resolveExistingRecord(raced);
      }
      return {
        applied: false,
        idempotentReplay: false,
        watermarkKey,
        watermarkValue: null,
        eventId: '',
        statusCode: 503,
        reason: 'AUTH_REVOCATION_WRITE_FAILED',
      };
    }

    return {
      applied: true,
      idempotentReplay: false,
      watermarkKey,
      watermarkValue,
      eventId,
      statusCode: 200,
      reason: 'REVOCATION_RECORDED',
    };
  } catch {
    // Re-check whether the failure was caused by a concurrent UNIQUE(idempotency_key) commit.
    // Because D1 rolled back our failed batch, reconciling against the committed row yields
    // deterministic 200 REVOCATION_IDEMPOTENT_REPLAY or 409 IDEMPOTENCY_KEY_CONFLICT.
    try {
      const raced = await lookupExistingByIdempotencyKey();
      if (raced?.event_id) {
        return resolveExistingRecord(raced);
      }
    } catch {
      // Fall through to fail-closed 503 if the reconciliation read itself fails.
    }
    return {
      applied: false,
      idempotentReplay: false,
      watermarkKey,
      watermarkValue: null,
      eventId: '',
      statusCode: 503,
      reason: 'AUTH_REVOCATION_WRITE_FAILED',
    };
  }
}


export interface UserAuthRevocationCheck {
  revoked: boolean;
  unavailable?: boolean;
  reason?: string;
}

export async function isUserAuthDisabledOrRevoked(
  uid: string,
  issuedAtSeconds: number,
  db?: D1Database,
): Promise<UserAuthRevocationCheck> {
  if (!db) return { revoked: true, unavailable: true, reason: 'AUTH_REVOCATION_STORE_UNAVAILABLE' };
  try {
    const row = await db.prepare('SELECT watermark_value FROM sync_watermarks WHERE watermark_key = ?1')
      .bind(`revoked_uid:${uid}`)
      .first<{ watermark_value: string }>();
    if (!row?.watermark_value) return { revoked: false };
    const value = String(row.watermark_value).trim();
    if (value === 'DISABLED') return { revoked: true, reason: 'USER_ACCOUNT_DISABLED' };
    const since = Number(value);
    if (!Number.isFinite(since) || since <= 0) return { revoked: true, unavailable: true, reason: 'AUTH_REVOCATION_WATERMARK_CORRUPTED' };
    const normalizedSince = since > 1_000_000_000_000 ? Math.floor(since / 1000) : Math.floor(since);
    const normalizedIssued = issuedAtSeconds > 1_000_000_000_000 ? Math.floor(issuedAtSeconds / 1000) : Math.floor(issuedAtSeconds);
    return normalizedIssued < normalizedSince
      ? { revoked: true, reason: 'SESSION_REVOKED' }
      : { revoked: false };
  } catch {
    return { revoked: true, unavailable: true, reason: 'AUTH_REVOCATION_CHECK_FAILED' };
  }
}
