-- Canonical Staging & Edge D1 Migration 0003: Media Objects Metadata, Queue Execution Leases & Auth Revocation Audit
-- Authoritative Migration Ledger: d1_migrations (managed by Wrangler D1 Migrations)
CREATE TABLE IF NOT EXISTS media_objects (
  object_id TEXT PRIMARY KEY,
  owner_uid TEXT NOT NULL,
  bucket_name TEXT NOT NULL,
  storage_key TEXT NOT NULL UNIQUE,
  city_id TEXT NOT NULL DEFAULT 'tehran',
  hood_id INTEGER NOT NULL DEFAULT 1,
  media_type TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  sha256_checksum TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  lifecycle_state TEXT NOT NULL,
  deletion_state TEXT NOT NULL DEFAULT 'ACTIVE',
  legal_hold INTEGER NOT NULL DEFAULT 0,
  retention_until TEXT,
  created_at_iso TEXT NOT NULL,
  updated_at_iso TEXT NOT NULL,
  deleted_at_iso TEXT
);

CREATE INDEX IF NOT EXISTS idx_media_objects_owner_state ON media_objects(owner_uid, lifecycle_state, deletion_state);
CREATE INDEX IF NOT EXISTS idx_media_objects_target ON media_objects(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_media_objects_lifecycle_updated ON media_objects(lifecycle_state, updated_at_iso);

CREATE TABLE IF NOT EXISTS queue_job_executions (
  idempotency_key TEXT PRIMARY KEY,
  job_type TEXT NOT NULL,
  message_id TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  status TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  lease_owner TEXT,
  lease_expires_at_ms INTEGER,
  last_error_code TEXT,
  last_error_message TEXT,
  result_json TEXT,
  created_at_iso TEXT NOT NULL,
  updated_at_iso TEXT NOT NULL,
  completed_at_iso TEXT
);

CREATE INDEX IF NOT EXISTS idx_queue_job_exec_status_lease ON queue_job_executions(status, lease_expires_at_ms);
CREATE INDEX IF NOT EXISTS idx_queue_job_exec_type_updated ON queue_job_executions(job_type, updated_at_iso);

CREATE TABLE IF NOT EXISTS auth_revocation_events (
  event_id TEXT PRIMARY KEY,
  uid TEXT NOT NULL,
  action TEXT NOT NULL,
  valid_since_seconds INTEGER,
  actor_uid TEXT NOT NULL,
  reason TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at_iso TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_auth_revocation_uid_created ON auth_revocation_events(uid, created_at_iso);
