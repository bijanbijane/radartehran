/**
 * Replay protection for the dedicated migrations/d1 lifecycle Write Admission RPC table.
 */
import type { D1DatabaseBinding } from '../db/types.ts';

export const LIFECYCLE_RPC_NONCE_TTL_MS = 10 * 60 * 1000;

export async function consumeLifecycleRpcNonce(params: {
  db: D1DatabaseBinding;
  nonce: string;
  nowMs?: number;
}): Promise<{ consumed: true } | { consumed: false; code: string }> {
  const value = String(params.nonce || '').trim();
  const nowMs = params.nowMs ?? Date.now();
  if (!value || value.length < 12 || value.length > 128 ||
      !Number.isSafeInteger(nowMs) || nowMs < 0) {
    return { consumed: false, code: 'RPC_NONCE_INVALID' };
  }
  try {
    const cleanup = await params.db.prepare(
      'DELETE FROM lifecycle_internal_rpc_nonces WHERE expires_at_ms <= ?1',
    ).bind(nowMs).run();
    if (!cleanup.success) {
      return { consumed: false, code: 'RPC_NONCE_STORE_UNAVAILABLE' };
    }
    const inserted = await params.db.prepare(
      'INSERT OR IGNORE INTO lifecycle_internal_rpc_nonces (nonce, consumed_at_iso, expires_at_ms) VALUES (?1, ?2, ?3)',
    ).bind(value, new Date(nowMs).toISOString(), nowMs + LIFECYCLE_RPC_NONCE_TTL_MS).run();
    if (!inserted.success) {
      return { consumed: false, code: 'RPC_NONCE_STORE_UNAVAILABLE' };
    }
    if ((inserted.meta?.changes ?? 0) !== 1) {
      return { consumed: false, code: 'RPC_NONCE_REPLAYED' };
    }
    return { consumed: true };
  } catch {
    return { consumed: false, code: 'RPC_NONCE_STORE_UNAVAILABLE' };
  }
}
