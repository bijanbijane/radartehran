-- D1 migration 0008: Durable in-flight mutation permits (write-admission drain barrier).
CREATE TABLE IF NOT EXISTS account_mutation_permits (
  permit_id TEXT PRIMARY KEY NOT NULL,
  target_uid TEXT NOT NULL,
  holder_id TEXT NOT NULL,
  route_signature TEXT NOT NULL,
  acquired_at_iso TEXT NOT NULL,
  expires_at_ms INTEGER NOT NULL,
  released_at_iso TEXT,
  status TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_mutation_permits_uid_active
  ON account_mutation_permits(target_uid, status, expires_at_ms);