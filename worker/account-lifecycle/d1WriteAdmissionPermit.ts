/**
 * Durable write-admission mutation permits for the dedicated migrations/d1 schema.
 * The legacy USER_DB permit contract remains in d1MutationPermit.ts.
 */
import type { D1DatabaseBinding } from '../db/types.ts';

export const DEFAULT_D1_MUTATION_PERMIT_TTL_MS = 120_000;
export const MAX_D1_MUTATION_PERMIT_TTL_MS = 300_000;

export class D1MutationPermitError extends Error {
  readonly code: string;
  readonly httpStatus: number;

  constructor(code: string, message: string, httpStatus: number) {
    super(message);
    this.name = 'D1MutationPermitError';
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

export async function acquireD1MutationPermit(params: {
  db: D1DatabaseBinding;
  targetUid: string;
  holderId: string;
  routeSignature: string;
  ttlMs?: number;
  nowMs?: number;
}): Promise<{ permitId: string }> {
  const targetUid = String(params.targetUid || '').trim();
  const holderId = String(params.holderId || '').trim();
  const routeSignature = String(params.routeSignature || '').trim();
  const nowMs = params.nowMs ?? Date.now();
  const ttlMs = params.ttlMs ?? DEFAULT_D1_MUTATION_PERMIT_TTL_MS;

  if (!targetUid || targetUid.length > 128 || !holderId || holderId.length > 128 ||
      !routeSignature || routeSignature.length > 240) {
    throw new D1MutationPermitError('INVALID_MUTATION_PERMIT_INPUT', 'Mutation permit request is invalid.', 400);
  }
  if (!Number.isSafeInteger(nowMs) || nowMs < 0 ||
      !Number.isInteger(ttlMs) || ttlMs < 1_000 || ttlMs > MAX_D1_MUTATION_PERMIT_TTL_MS) {
    throw new D1MutationPermitError('INVALID_MUTATION_PERMIT_INPUT', 'Mutation permit timing parameters are invalid.', 400);
  }

  const permitId = 'd1permit_' + crypto.randomUUID();
  const acquiredAtIso = new Date(nowMs).toISOString();
  const expiresAtMs = nowMs + ttlMs;

  try {
    const result = await params.db.prepare(
      "INSERT INTO account_mutation_permits (permit_id, target_uid, holder_id, route_signature, acquired_at_iso, expires_at_ms, released_at_iso, status) " +
      "SELECT ?1, ?2, ?3, ?4, ?5, ?6, NULL, 'ACTIVE' " +
      "WHERE NOT EXISTS (SELECT 1 FROM account_write_blocks WHERE target_uid = ?2 AND state <> 'ACTIVE_WRITES_ALLOWED')",
    ).bind(permitId, targetUid, holderId, routeSignature, acquiredAtIso, expiresAtMs).run();

    if (!result.success) {
      throw new D1MutationPermitError('MUTATION_PERMIT_STORE_UNAVAILABLE', 'Mutation permit storage is unavailable.', 503);
    }
    if ((result.meta?.changes ?? 0) !== 1) {
      throw new D1MutationPermitError('ACCOUNT_WRITE_BLOCKED', 'Account mutation is blocked by an active deletion write block.', 423);
    }
    return { permitId };
  } catch (error) {
    if (error instanceof D1MutationPermitError) throw error;
    throw new D1MutationPermitError('MUTATION_PERMIT_STORE_UNAVAILABLE', 'Mutation permit storage is unavailable.', 503);
  }
}

export async function releaseD1MutationPermit(params: {
  db: D1DatabaseBinding;
  targetUid: string;
  permitId: string;
  nowMs?: number;
}): Promise<{ released: boolean }> {
  const targetUid = String(params.targetUid || '').trim();
  const permitId = String(params.permitId || '').trim();
  const nowMs = params.nowMs ?? Date.now();
  if (!targetUid || targetUid.length > 128 || !permitId ||
      !Number.isSafeInteger(nowMs) || nowMs < 0) {
    throw new D1MutationPermitError('INVALID_MUTATION_PERMIT_INPUT', 'Mutation permit release request is invalid.', 400);
  }
  try {
    const result = await params.db.prepare(
      "UPDATE account_mutation_permits SET released_at_iso = ?1, status = 'RELEASED' " +
      "WHERE permit_id = ?2 AND target_uid = ?3 AND status = 'ACTIVE' AND released_at_iso IS NULL",
    ).bind(new Date(nowMs).toISOString(), permitId, targetUid).run();
    if (!result.success) {
      throw new D1MutationPermitError('MUTATION_PERMIT_STORE_UNAVAILABLE', 'Mutation permit release failed.', 503);
    }
    return { released: (result.meta?.changes ?? 0) === 1 };
  } catch (error) {
    if (error instanceof D1MutationPermitError) throw error;
    throw new D1MutationPermitError('MUTATION_PERMIT_STORE_UNAVAILABLE', 'Mutation permit release failed.', 503);
  }
}

export async function countActiveD1MutationPermits(params: {
  db: D1DatabaseBinding;
  targetUid: string;
  nowMs?: number;
}): Promise<number> {
  const targetUid = String(params.targetUid || '').trim();
  const nowMs = params.nowMs ?? Date.now();
  if (!targetUid || targetUid.length > 128 || !Number.isSafeInteger(nowMs) || nowMs < 0) {
    throw new D1MutationPermitError('INVALID_MUTATION_PERMIT_INPUT', 'Mutation permit drain query is invalid.', 400);
  }
  try {
    const expired = await params.db.prepare(
      "UPDATE account_mutation_permits SET status = 'EXPIRED', released_at_iso = ?1 " +
      "WHERE target_uid = ?2 AND status = 'ACTIVE' AND released_at_iso IS NULL AND expires_at_ms <= ?3",
    ).bind(new Date(nowMs).toISOString(), targetUid, nowMs).run();
    if (!expired.success) {
      throw new D1MutationPermitError('MUTATION_PERMIT_STORE_UNAVAILABLE', 'Mutation permit drain query failed.', 503);
    }
    const row = await params.db.prepare(
      "SELECT COUNT(*) AS active_count FROM account_mutation_permits " +
      "WHERE target_uid = ?1 AND status = 'ACTIVE' AND released_at_iso IS NULL AND expires_at_ms > ?2",
    ).bind(targetUid, nowMs).first<{ active_count: number }>();
    if (!row || !Number.isFinite(Number(row.active_count))) {
      throw new D1MutationPermitError('MUTATION_PERMIT_STORE_UNAVAILABLE', 'Mutation permit count could not be verified.', 503);
    }
    return Number(row.active_count);
  } catch (error) {
    if (error instanceof D1MutationPermitError) throw error;
    throw new D1MutationPermitError('MUTATION_PERMIT_STORE_UNAVAILABLE', 'Mutation permit drain query failed.', 503);
  }
}
