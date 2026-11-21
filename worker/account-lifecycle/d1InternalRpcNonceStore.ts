/**
 * D1 replay protection for internal lifecycle RPC.
 */

import type { D1DatabaseBinding } from '../db/types.ts';

const SQL_INSERT_NONCE = `INSERT INTO lifecycle_internal_rpc_nonces (nonce, consumed_at_iso, expires_at_ms)
VALUES (?1, ?2, ?3)`;

const NONCE_RETENTION_MS = 10 * 60 * 1000;

function errorMessage(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof Error) return value.message;
  return String(value ?? '');
}

function isNonceUniquenessConflict(value: unknown): boolean {
  const message = errorMessage(value).toLowerCase();

  const identifiesNonce =
    message.includes('lifecycle_internal_rpc_nonces') &&
    message.includes('nonce');

  const identifiesConstraint =
    message.includes('unique') ||
    message.includes('primary key') ||
    message.includes('sqlite_constraint_unique') ||
    message.includes('sqlite_constraint_primarykey');

  return identifiesNonce && identifiesConstraint;
}

export async function consumeLifecycleRpcNonce(params: {
  db: D1DatabaseBinding;
  nonce: string;
  nowMs?: number;
}): Promise<{ consumed: boolean; code?: string }> {
  const nowMs = params.nowMs ?? Date.now();

  if (!params.nonce || params.nonce.length > 256) {
    return { consumed: false, code: 'RPC_NONCE_INVALID' };
  }

  const nowIso = new Date(nowMs).toISOString();
  const expiresAtMs = nowMs + NONCE_RETENTION_MS;

  try {
    const res = await params.db
      .prepare(SQL_INSERT_NONCE)
      .bind(params.nonce, nowIso, expiresAtMs)
      .run();

    if (!res.success) {
      if (isNonceUniquenessConflict(res.error)) {
        return { consumed: false, code: 'RPC_NONCE_REPLAYED' };
      }

      return { consumed: false, code: 'RPC_NONCE_STORE_FAILED' };
    }

    if (res.meta?.changes === 1) {
      return { consumed: true };
    }

    if (res.meta?.changes === 0) {
      return { consumed: false, code: 'RPC_NONCE_REPLAYED' };
    }

    // Missing change metadata is not proof that the nonce was consumed.
    return { consumed: false, code: 'RPC_NONCE_STORE_FAILED' };
  } catch (err) {
    // Cloudflare D1 may throw on a uniqueness violation instead of
    // returning a failed D1Result. Convert only the nonce PK conflict
    // to a replay response; all other errors remain unavailable.
    if (isNonceUniquenessConflict(err)) {
      return { consumed: false, code: 'RPC_NONCE_REPLAYED' };
    }

    return { consumed: false, code: 'RPC_NONCE_STORE_FAILED' };
  }
}
