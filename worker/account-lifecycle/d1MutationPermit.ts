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
  try {
    const row = await userDb
      .prepare('SELECT uid FROM account_write_blocks WHERE uid = ?1 AND released_at_iso IS NULL')
      .bind(uid)
      .first<{ uid: string }>();
    return Boolean(row);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/no such table:\s*account_write_blocks/i.test(msg)) {
      return false;
    }
    throw err;
  }
}

export async function blockUserWritesInD1(params: {
  userDb: D1Database;
  uid: string;
  jobId: string;
  reason?: string;
  nowIso?: string;
}): Promise<void> {
  const nowIso = params.nowIso ?? new Date().toISOString();
  await params.userDb
    .prepare(
      `INSERT OR REPLACE INTO account_write_blocks (
        uid, job_id, block_reason, blocked_at_iso, released_at_iso
      ) VALUES (?1, ?2, ?3, ?4, NULL)`,
    )
    .bind(params.uid, params.jobId, params.reason || 'ACCOUNT_DELETION_ACTIVE', nowIso)
    .run();
}

export async function acquireMutationPermitInD1(params: {
  userDb: D1Database;
  uid: string;
  operationName: string;
  ttlMs?: number;
  nowMs?: number;
}): Promise<AcquiredMutationPermit | RejectedMutationPermit> {
  const nowMs = params.nowMs ?? Date.now();
  const ttlMs = Math.max(1_000, Math.min(120_000, params.ttlMs ?? 30_000));
  const expiresAtMs = nowMs + ttlMs;
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
  const nowMs = params.nowMs ?? Date.now();
  await params.userDb
    .prepare('UPDATE account_mutation_permits SET released_at_ms = ?1 WHERE permit_id = ?2 AND released_at_ms IS NULL')
    .bind(nowMs, params.permitId)
    .run();
}

export async function countActiveMutationPermitsInD1(
  userDb: D1Database,
  uid: string,
  nowMs: number = Date.now(),
): Promise<number> {
  const row = await userDb
    .prepare(
      'SELECT COUNT(*) AS cnt FROM account_mutation_permits WHERE uid = ?1 AND released_at_ms IS NULL AND expires_at_ms > ?2',
    )
    .bind(uid, nowMs)
    .first<{ cnt: number }>();
  return Number(row?.cnt ?? 0);
}
