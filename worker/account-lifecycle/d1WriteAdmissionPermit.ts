/**
 * Worker write-admission mutation permits for the staging/API D1 schema.
 *
 * This module intentionally targets migrations/d1/0008_account_mutation_permits.sql.
 * The legacy USER_DB permit API in d1MutationPermit.ts targets a different schema
 * (migrations/user-d1/0005) and must not be reused for this binding.
 */
import type { D1DatabaseBinding } from '../db/types.ts';

export const DEFAULT_D1_MUTATION_PERMIT_TTL_MS = 120_000;
export const MAX_D1_MUTATION_PERMIT_TTL_MS = 300_000;

export const SQL_ACQUIRE_D1_MUTATION_PERMIT = `INSERT INTO account_mutation_permits (
  permit_id, target_uid, holder_id, route_signature, acquired_at_iso, expires_at_ms, released_at_iso, status
)
SELECT ?1, ?2, ?3, ?4, ?5, ?6, NULL, 'ACTIVE'
WHERE NOT EXISTS (
  SELECT 1 FROM account_write_blocks
  WHERE target_uid = ?2 AND state <> 'ACTIVE_WRITES_ALLOWED'
)`;

export const SQL_RELEASE_D1_MUTATION_PERMIT = `UPDATE account_mutation_permits
SET released_at_iso = ?1, status = 'RELEASED'
WHERE permit_id = ?2 AND target_uid = ?3 AND status = 'ACTIVE' AND released_at_iso IS NULL`;

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
  const targetUid = params.targetUid.trim();
  const holderId = params.holderId.trim();
  const routeSignature = params.routeSignature.trim();
  const nowMs = params.nowMs ?? Date.now();
  const ttlMs = params.ttlMs ?? DEFAULT_D1_MUTATION_PERMIT_TTL_MS;

  if (!targetUid || targetUid.length > 128 || !holderId || holderId.length > 128 || !routeSignature || routeSignature.length > 240) {
    throw new D1MutationPermitError('INVALID_MUTATION_PERMIT_INPUT', 'Mutation permit request is invalid.', 400);
  }
  if (!Number.isSafeInteger(nowMs) || nowMs < 0 || !Number.isInteger(ttlMs) || ttlMs < 1_000 || ttlMs > MAX_D1_MUTATION_PERMIT_TTL_MS) {
    throw new D1MutationPermitError('INVALID_MUTATION_PERMIT_INPUT', 'Mutation permit timing parameters are invalid.', 400);
  }

  const permitId = `d1permit_${crypto.randomUUID()}`;
  const acquiredAtIso = new Date(nowMs).toISOString();
  const expiresAtMs = nowMs + ttlMs;

  try {
    // This single INSERT..SELECT is the TOCTOU barrier: once a write block is
    // closed, no concurrent request can acquire a new active permit.
    const result = await params.db
      .prepare(SQL_ACQUIRE_D1_MUTATION_PERMIT)
      .bind(permitId, targetUid, holderId, routeSignature, acquiredAtIso, expiresAtMs)
      .run();

    if ((result.meta?.changes ?? 0) !== 1) {
      throw new D1MutationPermitError(
        'ACCOUNT_WRITE_BLOCKED',
        'Account mutation is blocked by an active deletion write block.',
        423,
      );
    }
    return { permitId };
  } catch (error) {
    if (error instanceof D1MutationPermitError) throw error;
    throw new D1MutationPermitError(
      'MUTATION_PERMIT_STORE_UNAVAILABLE',
      'Could not acquire a durable mutation permit; the mutation was refused.',
      503,
    );
  }
}

export async function releaseD1MutationPermit(params: {
  db: D1DatabaseBinding;
  targetUid: string;
  permitId: string;
  nowMs?: number;
}): Promise<{ released: boolean }> {
  const targetUid = params.targetUid.trim();
  const permitId = params.permitId.trim();
  const nowMs = params.nowMs ?? Date.now();
  if (!targetUid || targetUid.length > 128 || !permitId || !Number.isSafeInteger(nowMs) || nowMs < 0) {
    throw new D1MutationPermitError('INVALID_MUTATION_PERMIT_INPUT', 'Mutation permit release request is invalid.', 400);
  }

  try {
    const result = await params.db
      .prepare(SQL_RELEASE_D1_MUTATION_PERMIT)
      .bind(new Date(nowMs).toISOString(), permitId, targetUid)
      .run();
    return { released: (result.meta?.changes ?? 0) === 1 };
  } catch {
    throw new D1MutationPermitError(
      'MUTATION_PERMIT_STORE_UNAVAILABLE',
      'Could not release the durable mutation permit.',
      503,
    );
  }
}
