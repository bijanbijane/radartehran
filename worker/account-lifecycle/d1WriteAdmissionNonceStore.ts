/**
 * Replay protection for the Worker Write Admission RPC (migration d1/0009).
 *
 * This table differs from the USER_DB lifecycle nonce table used by
 * d1InternalRpcNonceStore.ts; the two schemas are deliberately not conflated.
 */
import type { D1DatabaseBinding } from '../db/types.ts';

export const LIFECYCLE_RPC_NONCE_TTL_MS = 10 * 60 * 1000;

export async function consumeLifecycleRpcNonce(params: {
  db: D1DatabaseBinding;
  nonce: string;
  nowMs?: number;
}): Promise<{ consumed: true } | { consumed: false; code: string }> {
  const nonce = params.nonce.trim();
  const nowMs = params.nowMs ?? Date.now();
  if (!nonce || nonce.length < 12 || nonce.length > 128 || !Number.isSafeInteger(nowMs) || nowMs < 0) {
    return { consumed: false, code: 'RPC_NONCE_INVALID' };
  }

  try {
    // Remove expired keys before insert so an expired nonce does not remain
    // permanently reserved. The primary key keeps concurrent replays atomic.
    await params.db
      .prepare('DELETE FROM lifecycle_internal_rpc_nonces WHERE expires_at_ms <= ?1')
      .bind(nowMs)
      .run();

    const inserted = await params.db
      .prepare(
        'INSERT OR IGNORE INTO lifecycle_internal_rpc_nonces (nonce, consumed_at_iso, expires_at_ms) VALUES (?1, ?2, ?3)',
      )
      .bind(nonce, new Date(nowMs).toISOString(), nowMs + LIFECYCLE_RPC_NONCE_TTL_MS)
      .run();

    if ((inserted.meta?.changes ?? 0) !== 1) {
      return { consumed: false, code: 'RPC_NONCE_REPLAYED' };
    }
    return { consumed: true };
  } catch {
    return { consumed: false, code: 'RPC_NONCE_STORE_UNAVAILABLE' };
  }
}
