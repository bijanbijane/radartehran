-- RT-DB-TRIAD-001 USER_DB Migration 0005:
-- Account Lifecycle Orchestration, Write Blocks, Mutation Permits, Anonymized Receipts,
-- Durable Research Erasure Outbox (ZERO raw UID), and Internal RPC Replay Protection Nonces.
-- Domain Owner: USER_DB (radar-user-db)
CREATE TABLE IF NOT EXISTS account_deletion_jobs (
  job_id TEXT PRIMARY KEY,
  uid TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL,
  stage TEXT NOT NULL,
  requested_by_uid TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT 'USER_REQUESTED_ERASURE',
  legal_hold_blocked INTEGER NOT NULL DEFAULT 0,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error_code TEXT,
  last_error_message TEXT,
  receipt_hash TEXT,
  created_at_iso TEXT NOT NULL,
  updated_at_iso TEXT NOT NULL,
  completed_at_iso TEXT
);

CREATE INDEX IF NOT EXISTS idx_account_del_jobs_uid_status ON account_deletion_jobs(uid, status);

CREATE TABLE IF NOT EXISTS account_write_blocks (
  uid TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  block_reason TEXT NOT NULL,
  blocked_at_iso TEXT NOT NULL,
  released_at_iso TEXT
);

CREATE TABLE IF NOT EXISTS account_mutation_permits (
  permit_id TEXT PRIMARY KEY,
  uid TEXT NOT NULL,
  operation_name TEXT NOT NULL,
  acquired_at_ms INTEGER NOT NULL,
  expires_at_ms INTEGER NOT NULL,
  released_at_ms INTEGER
);

CREATE INDEX IF NOT EXISTS idx_mutation_permits_uid_active ON account_mutation_permits(uid, released_at_ms, expires_at_ms);

-- Preserves verifiable compliance/deletion evidence using SHA-256 uid_hash (zero raw PII).
CREATE TABLE IF NOT EXISTS account_lifecycle_receipts (
  receipt_id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  uid_hash TEXT NOT NULL,
  stage TEXT NOT NULL,
  subsystem TEXT NOT NULL,
  status TEXT NOT NULL,
  deleted_records_count INTEGER NOT NULL DEFAULT 0,
  evidence_json TEXT NOT NULL DEFAULT '{}',
  recorded_at_iso TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_lifecycle_receipts_job ON account_lifecycle_receipts(job_id, recorded_at_iso);

-- Durable Outbox for cross-domain erasure into RESEARCH_DB.
-- STRICT PRIVACY INVARIANT: Stores ONLY pseudonymized (subject_key, subject_key_version), NEVER raw UID.
CREATE TABLE IF NOT EXISTS research_erasure_outbox (
  outbox_id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  subject_key TEXT NOT NULL,
  subject_key_version TEXT NOT NULL,
  status TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_retry_at_ms INTEGER NOT NULL DEFAULT 0,
  receipt_id TEXT,
  erased_events_count INTEGER NOT NULL DEFAULT 0,
  last_error_code TEXT,
  created_at_iso TEXT NOT NULL,
  updated_at_iso TEXT NOT NULL,
  completed_at_iso TEXT
);

CREATE INDEX IF NOT EXISTS idx_research_outbox_status_retry ON research_erasure_outbox(status, next_retry_at_ms);
CREATE INDEX IF NOT EXISTS idx_research_outbox_job ON research_erasure_outbox(job_id);

CREATE TABLE IF NOT EXISTS lifecycle_internal_rpc_nonces (
  nonce TEXT PRIMARY KEY,
  issuer TEXT NOT NULL,
  expires_at_ms INTEGER NOT NULL,
  created_at_iso TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rpc_nonces_expires ON lifecycle_internal_rpc_nonces(expires_at_ms);
