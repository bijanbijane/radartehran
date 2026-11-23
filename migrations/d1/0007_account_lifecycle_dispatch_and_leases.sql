-- D1 migration 0007: Account deletion dispatch outbox + per-job execution leases (Stage D)

CREATE TABLE IF NOT EXISTS account_lifecycle_dispatch_outbox (
  event_id TEXT PRIMARY KEY NOT NULL,
  job_id TEXT NOT NULL,
  target_uid TEXT NOT NULL,
  operation_type TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  dispatch_status TEXT NOT NULL DEFAULT 'PENDING',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_attempt_at_iso TEXT,
  last_error_redacted TEXT,
  correlation_id TEXT,
  created_at_iso TEXT NOT NULL,
  updated_at_iso TEXT NOT NULL,
  dispatched_at_iso TEXT,
  FOREIGN KEY (job_id) REFERENCES account_deletion_jobs(job_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_acl_dispatch_outbox_idempotency
  ON account_lifecycle_dispatch_outbox(idempotency_key);

CREATE INDEX IF NOT EXISTS idx_acl_dispatch_outbox_pending
  ON account_lifecycle_dispatch_outbox(dispatch_status, next_attempt_at_iso, updated_at_iso);

CREATE TABLE IF NOT EXISTS account_deletion_job_leases (
  job_id TEXT PRIMARY KEY NOT NULL,
  target_uid TEXT NOT NULL,
  lease_token TEXT NOT NULL,
  fencing_revision INTEGER NOT NULL,
  lease_owner TEXT NOT NULL,
  lease_expires_at_ms INTEGER NOT NULL,
  acquired_at_iso TEXT NOT NULL,
  updated_at_iso TEXT NOT NULL,
  FOREIGN KEY (job_id) REFERENCES account_deletion_jobs(job_id)
);

CREATE INDEX IF NOT EXISTS idx_account_deletion_job_leases_expiry
  ON account_deletion_job_leases(lease_expires_at_ms);