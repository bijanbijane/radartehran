/**
 * @file worker/account-lifecycle/d1MutationPermit.ts
 * @description Durable write-blocking and in-flight mutation permit coordination on `USER_DB`.
 * Ensures account deletion cleanly blocks new user writes and drains active mutation permits.
 */
import type { D1Database } from '../types';

export interface AcquiredMutationPermit {
  readonly ok: true;
  readonly permitId: string;
  readonly uid: string;
  readonly operationName: string;
  readonly expiresAtMs: number;
}

export interface RejectedMutationPermit {
  readonly ok: false;
  readonly statusCode: 423;
  readonly code: 'ACCOUNT_WRITE_BLOCKED';
}

export async function isUserWriteBlockedInD1(userDb: D1Database, uid: string): Promise<boolean> {
  // Missing schema or a D1 read failure is not evidence that writes are allowed.
  // Callers must fail closed rather than interpreting an unavailable block table as OPEN.
  const result = await userDb
    .prepare('SELECT uid FROM account_write_blocks WHERE uid = ?1 AND released_at_iso IS NULL')
    .bind(uid)
    .all<{ uid: string }>();
  if (!result.success) throw new Error('ACCOUNT_WRITE_BLOCK_READ_FAILED');
  return result.results.length > 0;
}

export async function blockUserWritesInD1(params: {
  userDb: D1Database;
  uid: string;
  jobId: string;
  reason?: string;
  nowIso?: string;
}): Promise<void> {
  const nowIso = params.nowIso ?? new Date().toISOString();
  const result = await params.userDb
    .prepare(
      `INSERT INTO account_write_blocks (
        uid, job_id, block_reason, blocked_at_iso, released_at_iso
      ) VALUES (?1, ?2, ?3, ?4, NULL)
      ON CONFLICT(uid) DO UPDATE SET
        job_id = excluded.job_id,
        block_reason = excluded.block_reason,
        blocked_at_iso = excluded.blocked_at_iso,
        released_at_iso = NULL
      WHERE account_write_blocks.released_at_iso IS NOT NULL
         OR account_write_blocks.job_id = excluded.job_id`,
    )
    .bind(params.uid, params.jobId, params.reason || 'ACCOUNT_DELETION_ACTIVE', nowIso)
    .run();

  if (result.success === false || (result.meta?.changes ?? 0) !== 1) {
    throw new Error('ACCOUNT_WRITE_BLOCK_CONFLICT_OR_STORE_UNAVAILABLE');
  }
}

export async function acquireMutationPermitInD1(params: {
  userDb: D1Database;
  uid: string;
  operationName: string;
  ttlMs?: number;
  nowMs?: number;
}): Promise<AcquiredMutationPermit | RejectedMutationPermit> {
  const suppliedNowMs = params.nowMs ?? Date.now();
  const nowMs = Number.isSafeInteger(suppliedNowMs) && Number(suppliedNowMs) > 0
    ? Number(suppliedNowMs)
    : Date.now();
  const suppliedTtlMs = Number(params.ttlMs ?? 15 * 60_000);
  const ttlMs = Number.isSafeInteger(suppliedTtlMs)
    ? Math.max(1_000, Math.min(15 * 60_000, suppliedTtlMs))
    : 15 * 60_000;
  const expiresAtMs = nowMs + ttlMs;
  if (!Number.isSafeInteger(expiresAtMs)) throw new Error('ACCOUNT_MUTATION_PERMIT_EXPIRY_INVALID');
  const permitId = `perm_${nowMs}_${crypto.randomUUID().slice(0, 8)}`;

  // Single atomic SQL statement prevents TOCTOU race where account_write_blocks is inserted
  // between a prior SELECT and a subsequent INSERT.
  const res = await params.userDb
    .prepare(
      `INSERT INTO account_mutation_permits (
        permit_id, uid, operation_name, acquired_at_ms, expires_at_ms, released_at_ms
      )
      SELECT ?1, ?2, ?3, ?4, ?5, NULL
      WHERE NOT EXISTS (
        SELECT 1 FROM account_write_blocks WHERE uid = ?2 AND released_at_iso IS NULL
      )`,
    )
    .bind(permitId, params.uid, params.operationName.slice(0, 80), nowMs, expiresAtMs)
    .run();

  if (res.success === false) {
    throw new Error('ACCOUNT_MUTATION_PERMIT_STORE_UNAVAILABLE');
  }
  if ((res.meta?.changes ?? 0) !== 1) {
    return { ok: false, statusCode: 423, code: 'ACCOUNT_WRITE_BLOCKED' };
  }

  return {
    ok: true,
    permitId,
    uid: params.uid,
    operationName: params.operationName,
    expiresAtMs,
  };
}

export async function releaseMutationPermitInD1(params: {
  userDb: D1Database;
  permitId: string;
  nowMs?: number;
}): Promise<void> {
  const suppliedNowMs = params.nowMs ?? Date.now();
  const nowMs = Number.isSafeInteger(suppliedNowMs) && Number(suppliedNowMs) > 0
    ? Number(suppliedNowMs)
    : Date.now();
  const result = await params.userDb
    .prepare('UPDATE account_mutation_permits SET released_at_ms = ?1 WHERE permit_id = ?2 AND released_at_ms IS NULL')
    .bind(nowMs, params.permitId)
    .run();
  if (result.success === false) throw new Error('ACCOUNT_MUTATION_PERMIT_RELEASE_FAILED');
}

export async function countActiveMutationPermitsInD1(
  userDb: D1Database,
  uid: string,
  nowMs: number = Date.now(),
): Promise<number> {
  const safeNowMs = Number.isSafeInteger(nowMs) && nowMs > 0 ? nowMs : Date.now();
  const row = await userDb
    .prepare(
      'SELECT COUNT(*) AS cnt FROM account_mutation_permits WHERE uid = ?1 AND released_at_ms IS NULL AND expires_at_ms > ?2',
    )
    .bind(uid, safeNowMs)
    .first<{ cnt: number }>();
  if (!row || !Number.isFinite(Number(row.cnt)) || Number(row.cnt) < 0) {
    throw new Error('ACCOUNT_MUTATION_PERMIT_COUNT_UNAVAILABLE');
  }
  return Number(row.cnt);
}
