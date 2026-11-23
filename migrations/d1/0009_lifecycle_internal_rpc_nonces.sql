-- D1 migration 0009: Replay protection for lifecycle internal Write Admission RPC.
CREATE TABLE IF NOT EXISTS lifecycle_internal_rpc_nonces (
  nonce TEXT PRIMARY KEY NOT NULL,
  consumed_at_iso TEXT NOT NULL,
  expires_at_ms INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_lifecycle_rpc_nonces_expires
  ON lifecycle_internal_rpc_nonces(expires_at_ms);