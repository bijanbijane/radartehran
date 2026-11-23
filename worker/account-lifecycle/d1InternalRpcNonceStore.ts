/**
 * @file worker/account-lifecycle/d1InternalRpcNonceStore.ts
 * @description Replay-protected internal RPC nonce store and Web Crypto HMAC-SHA256
 * signature verification operating strictly on `USER_DB`.
 */
import { computeHmacSha256Hex } from '../research/pseudonymizer';
import type { D1Database } from '../types';

export const MAX_RPC_CLOCK_SKEW_MS = 5 * 60 * 1000;

function timingSafeHexEqual(a: string, b: string): boolean {
  if (a.length !== b.length || a.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Atomically consumes a previously authenticated Write Admission RPC nonce.
 * HMAC and timestamp verification must be completed by the caller before this function.
 */
export async function consumeLifecycleRpcNonce(params: {
  db: D1Database;
  nonce: string;
  nowMs?: number;
}): Promise<{ consumed: true } | { consumed: false; code: string }> {
  const nonce = String(params.nonce || '').trim();
  const nowMs = params.nowMs ?? Date.now();
  if (nonce.length < 12 || nonce.length > 128 || !Number.isSafeInteger(nowMs) || nowMs < 0) {
    return { consumed: false, code: 'RPC_NONCE_INVALID' };
  }
  try {
    const cleanup = await params.db.prepare(
      'DELETE FROM lifecycle_internal_rpc_nonces WHERE expires_at_ms <= ?1',
    ).bind(nowMs).run();
    if (!cleanup.success) return { consumed: false, code: 'RPC_NONCE_STORE_UNAVAILABLE' };

    const inserted = await params.db.prepare(
      'INSERT OR IGNORE INTO lifecycle_internal_rpc_nonces (nonce, issuer, expires_at_ms, created_at_iso) VALUES (?1, ?2, ?3, ?4)',
    ).bind(
      nonce,
      'WRITE_ADMISSION_RPC',
      nowMs + MAX_RPC_CLOCK_SKEW_MS * 2,
      new Date(nowMs).toISOString(),
    ).run();
    if (!inserted.success) return { consumed: false, code: 'RPC_NONCE_STORE_UNAVAILABLE' };
    if ((inserted.meta?.changes ?? 0) !== 1) return { consumed: false, code: 'RPC_NONCE_REPLAYED' };
    return { consumed: true };
  } catch {
    return { consumed: false, code: 'RPC_NONCE_STORE_UNAVAILABLE' };
  }
}

export async function signInternalLifecycleRpc(params: {
  secret: string;
  issuer: string;
  nonce: string;
  timestampMs: number;
  payloadJson: string;
}): Promise<string> {
  const canonical = `${params.issuer}:${params.nonce}:${params.timestampMs}:${params.payloadJson}`;
  return computeHmacSha256Hex(params.secret, canonical);
}

export async function verifyAndConsumeInternalRpcNonce(params: {
  userDb: D1Database;
  secret: string | undefined;
  issuer: string;
  nonce: string;
  timestampMs: number;
  signatureHex: string;
  payloadJson: string;
  nowMs?: number;
}): Promise<{ ok: true } | { ok: false; statusCode: 401 | 409 | 503; code: string }> {
  const secret = String(params.secret || '').trim();
  if (secret.length < 32) {
    return { ok: false, statusCode: 503, code: 'INTERNAL_LIFECYCLE_RPC_SECRET_MISSING' };
  }
  const nowMs = params.nowMs ?? Date.now();
  if (!Number.isFinite(params.timestampMs) || Math.abs(nowMs - params.timestampMs) > MAX_RPC_CLOCK_SKEW_MS) {
    return { ok: false, statusCode: 401, code: 'INTERNAL_RPC_TIMESTAMP_SKEW' };
  }
  const nonce = String(params.nonce || '').trim();
  if (nonce.length < 12 || nonce.length > 128) {
    return { ok: false, statusCode: 401, code: 'INVALID_INTERNAL_RPC_NONCE' };
  }

  const expectedSig = await signInternalLifecycleRpc({
    secret,
    issuer: params.issuer,
    nonce,
    timestampMs: params.timestampMs,
    payloadJson: params.payloadJson,
  });
  if (!timingSafeHexEqual(expectedSig, String(params.signatureHex || '').trim().toLowerCase())) {
    return { ok: false, statusCode: 401, code: 'INVALID_INTERNAL_RPC_SIGNATURE' };
  }

  const expiresAtMs = nowMs + MAX_RPC_CLOCK_SKEW_MS * 2;
  // Atomic INSERT OR IGNORE eliminates TOCTOU race under concurrent replay attempts.
  const insertRes = await params.userDb
    .prepare(
      'INSERT OR IGNORE INTO lifecycle_internal_rpc_nonces (nonce, issuer, expires_at_ms, created_at_iso) VALUES (?1, ?2, ?3, ?4)',
    )
    .bind(nonce, params.issuer.slice(0, 64), expiresAtMs, new Date(nowMs).toISOString())
    .run();

  if ((insertRes.meta?.changes ?? 0) !== 1) {
    return { ok: false, statusCode: 409, code: 'INTERNAL_RPC_NONCE_REPLAYED' };
  }

  // Opportunistic cleanup of expired nonces
  await params.userDb
    .prepare('DELETE FROM lifecycle_internal_rpc_nonces WHERE expires_at_ms <= ?1')
    .bind(nowMs)
    .run();

  return { ok: true };
}
