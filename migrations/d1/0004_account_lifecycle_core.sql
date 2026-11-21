-- D1 migration 0004: Account lifecycle durable jobs, write blocks, export, consent (Phase A schema)
-- Source of truth for Workers remains this store; queue messages are triggers only.

CREATE TABLE IF NOT EXISTS account_deletion_jobs (
  job_id TEXT PRIMARY KEY NOT NULL,
  target_uid TEXT NOT NULL,
  requested_by_uid TEXT NOT NULL,
  state TEXT NOT NULL,
  reason TEXT NOT NULL,
  write_block_enforced INTEGER NOT NULL DEFAULT 1,
  job_json TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  created_at_iso TEXT NOT NULL,
  updated_at_iso TEXT NOT NULL,
  completed_at_iso TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_account_deletion_jobs_active_uid
  ON account_deletion_jobs(target_uid)
  WHERE completed_at_iso IS NULL;

CREATE TABLE IF NOT EXISTS account_write_blocks (
  target_uid TEXT PRIMARY KEY NOT NULL,
  state TEXT NOT NULL,
  active_deletion_job_id TEXT,
  blocked_at_iso TEXT NOT NULL,
  updated_at_iso TEXT NOT NULL,
  reason TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS account_export_jobs (
  export_job_id TEXT PRIMARY KEY NOT NULL,
  target_uid TEXT NOT NULL,
  requested_by_uid TEXT NOT NULL,
  state TEXT NOT NULL,
  job_json TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  download_expires_at_iso TEXT,
  created_at_iso TEXT NOT NULL,
  updated_at_iso TEXT NOT NULL,
  completed_at_iso TEXT
);

CREATE TABLE IF NOT EXISTS account_privacy_consents (
  consent_id TEXT PRIMARY KEY NOT NULL,
  target_uid TEXT NOT NULL,
  scope TEXT NOT NULL,
  granted INTEGER NOT NULL,
  policy_version TEXT NOT NULL,
  recorded_at_iso TEXT NOT NULL,
  revoked_at_iso TEXT,
  revision INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_account_privacy_consents_uid_scope
  ON account_privacy_consents(target_uid, scope, recorded_at_iso DESC);

CREATE TABLE IF NOT EXISTS account_lifecycle_audit (
  audit_id TEXT PRIMARY KEY NOT NULL,
  job_id TEXT,
  target_uid TEXT NOT NULL,
  actor_uid TEXT NOT NULL,
  action TEXT NOT NULL,
  detail_redacted TEXT NOT NULL,
  recorded_at_iso TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS account_data_requests (
  request_id TEXT PRIMARY KEY NOT NULL,
  target_uid TEXT NOT NULL,
  kind TEXT NOT NULL,
  linked_job_id TEXT,
  status TEXT NOT NULL,
  requested_at_iso TEXT NOT NULL,
  completed_at_iso TEXT,
  revision INTEGER NOT NULL DEFAULT 1
);