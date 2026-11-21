-- D1 migration 0005: Batch idempotency, execution receipts, retention metadata hooks

CREATE TABLE IF NOT EXISTS account_deletion_batch_receipts (
  receipt_id TEXT PRIMARY KEY NOT NULL,
  job_id TEXT NOT NULL,
  target_uid TEXT NOT NULL,
  domain_source TEXT,
  idempotency_key TEXT NOT NULL,
  batch_cursor TEXT,
  outcome_json TEXT NOT NULL,
  recorded_at_iso TEXT NOT NULL,
  FOREIGN KEY (job_id) REFERENCES account_deletion_jobs(job_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_account_deletion_batch_receipts_idempotency
  ON account_deletion_batch_receipts(idempotency_key);

CREATE INDEX IF NOT EXISTS idx_account_deletion_batch_receipts_job
  ON account_deletion_batch_receipts(job_id, recorded_at_iso DESC);

CREATE TABLE IF NOT EXISTS account_deletion_execution_receipts (
  receipt_id TEXT PRIMARY KEY NOT NULL,
  job_id TEXT NOT NULL UNIQUE,
  target_uid TEXT NOT NULL,
  status TEXT NOT NULL,
  receipt_json TEXT NOT NULL,
  recorded_at_iso TEXT NOT NULL,
  FOREIGN KEY (job_id) REFERENCES account_deletion_jobs(job_id)
);

CREATE TABLE IF NOT EXISTS account_deletion_retention_records (
  record_id TEXT PRIMARY KEY NOT NULL,
  job_id TEXT NOT NULL,
  target_uid TEXT NOT NULL,
  policy_code TEXT NOT NULL,
  retention_reason TEXT NOT NULL,
  retained_payload_json TEXT NOT NULL,
  expires_at_iso TEXT,
  recorded_at_iso TEXT NOT NULL,
  FOREIGN KEY (job_id) REFERENCES account_deletion_jobs(job_id)
);

CREATE INDEX IF NOT EXISTS idx_account_deletion_retention_job
  ON account_deletion_retention_records(job_id, recorded_at_iso DESC);