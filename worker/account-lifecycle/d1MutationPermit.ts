/**
 * D1-backed mutation admission permits (Stage D hardening).
 */

import type { D1DatabaseBinding } from '../db/types.ts';
import { AccountLifecycleError } from '../../server/modules/account-lifecycle/types.ts';

export const DEFAULT_MUTATION_PERMIT_TTL_MS = 120_000;

export const SQL_INSERT_PERMIT = `
INSERT INTO account_mutation_permits (
  permit_id, target_uid, holder_id, route_signature, acquired_at_iso, expires_at_ms, status
) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'ACQUIRED')
`;

export const SQL_RELEASE_PERMIT = `
UPDATE account_mutation_permits
SET status = 'RELEASED', released_at_iso = ?1
WHERE permit_id = ?2 AND target_uid = ?3 AND status = 'ACQUIRED'
`;

export const SQL_EXPIRE_STALE_PERMITS = `
UPDATE account_mutation_permits
SET status = 'EXPIRED', released_at_iso = ?1
WHERE target_uid = ?2 AND status = 'ACQUIRED' AND expires_at_ms < ?3
`;

export const SQL_COUNT_ACTIVE_PERMITS = `
SELECT COUNT(*) AS active_count FROM account_mutation_permits
WHERE target_uid = ?1 AND status = 'ACQUIRED' AND expires_at_ms >= ?2
`;

export async function acquireD1MutationPermit(params: {
  db: D1DatabaseBinding;
  targetUid: string;
  holderId: string;
  routeSignature: string;
  ttlMs?: number;
}): Promise<{ permitId: string; expiresAtMs: number }> {
  const nowMs = Date.now();
  const ttl = params.ttlMs ?? DEFAULT_MUTATION_PERMIT_TTL_MS;
  const expiresAtMs = nowMs + ttl;
  const permitId = `mtp_${params.targetUid}_${nowMs}_${Math.random().toString(36).slice(2, 10)}`;
  const nowIso = new Date(nowMs).toISOString();

  const block = await params.db
    .prepare(
      `SELECT state FROM account_write_blocks WHERE target_uid = ?1`,
    )
    .bind(params.targetUid)
    .first<{ state: string }>();

  if (block && block.state !== 'ACTIVE_WRITES_ALLOWED') {
    throw new AccountLifecycleError(
      'USER_WRITES_BLOCKED_BY_DELETION',
      'New mutation permits are closed while deletion is active.',
      423,
    );
  }

  const res = await params.db
    .prepare(SQL_INSERT_PERMIT)
    .bind(permitId, params.targetUid, params.holderId, params.routeSignature, nowIso, expiresAtMs)
    .run();
  if (!res.success || (res.meta?.changes ?? 0) !== 1) {
    throw new AccountLifecycleError('STORE_UNAVAILABLE', 'Failed to acquire mutation permit.', 503);
  }
  return { permitId, expiresAtMs };
}

export async function releaseD1MutationPermit(params: {
  db: D1DatabaseBinding;
  targetUid: string;
  permitId: string;
}): Promise<void> {
  const nowIso = new Date().toISOString();
  await params.db.prepare(SQL_RELEASE_PERMIT).bind(nowIso, params.permitId, params.targetUid).run();
}

export async function assertD1MutationDrainComplete(db: D1DatabaseBinding, targetUid: string): Promise<void> {
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  await db.prepare(SQL_EXPIRE_STALE_PERMITS).bind(nowIso, targetUid, nowMs).run();
  const row = await db
    .prepare(SQL_COUNT_ACTIVE_PERMITS)
    .bind(targetUid, nowMs)
    .first<{ active_count: number }>();
  const active = Number(row?.active_count ?? 0);
  if (active > 0) {
    throw new AccountLifecycleError(
      'MUTATION_DRAIN_INCOMPLETE',
      `${active} in-flight mutation permit(s) must complete before destructive cleanup.`,
      409,
    );
  }
}