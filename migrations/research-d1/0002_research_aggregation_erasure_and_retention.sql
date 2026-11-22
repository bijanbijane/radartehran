-- RT-DB-TRIAD-001 RESEARCH_DB Migration 0002:
-- K-Anonymous Aggregation Windows, Idempotent Subject Erasure Inbox, Processing Jobs & Retention Policies.
-- Domain Owner: RESEARCH_DB (radar-researcher-db) — Zero PII / Zero raw UID.
CREATE TABLE IF NOT EXISTS research_aggregation_windows (
  window_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  city_id TEXT NOT NULL,
  hood_id INTEGER,
  window_start_iso TEXT NOT NULL,
  window_end_iso TEXT NOT NULL,
  distinct_subjects_count INTEGER,
  event_count INTEGER,
  k_threshold INTEGER NOT NULL,
  k_suppressed INTEGER NOT NULL DEFAULT 1,
  metrics_json TEXT,
  source TEXT NOT NULL DEFAULT 'RESEARCH_DB',
  schema_version INTEGER NOT NULL DEFAULT 1,
  generated_at_iso TEXT NOT NULL,
  expires_at_iso TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_research_agg_lookup ON research_aggregation_windows(event_type, city_id, window_start_iso, window_end_iso);
CREATE INDEX IF NOT EXISTS idx_research_agg_expires ON research_aggregation_windows(expires_at_iso);

-- Idempotent Inbox receiving erasure commands from USER_DB Outbox using ONLY subject_key + version.
CREATE TABLE IF NOT EXISTS research_erasure_inbox (
  erasure_id TEXT PRIMARY KEY,
  outbox_id TEXT NOT NULL UNIQUE,
  subject_key TEXT NOT NULL,
  subject_key_version TEXT NOT NULL,
  status TEXT NOT NULL,
  deleted_events_count INTEGER NOT NULL DEFAULT 0,
  receipt_id TEXT NOT NULL,
  received_at_iso TEXT NOT NULL,
  completed_at_iso TEXT
);

CREATE INDEX IF NOT EXISTS idx_research_erasure_subject ON research_erasure_inbox(subject_key, subject_key_version);

CREATE TABLE IF NOT EXISTS research_processing_jobs (
  job_id TEXT PRIMARY KEY,
  job_type TEXT NOT NULL,
  status TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  summary_json TEXT NOT NULL DEFAULT '{}',
  created_at_iso TEXT NOT NULL,
  updated_at_iso TEXT NOT NULL,
  completed_at_iso TEXT
);

CREATE INDEX IF NOT EXISTS idx_research_jobs_type_status ON research_processing_jobs(job_type, status, updated_at_iso);

CREATE TABLE IF NOT EXISTS research_retention_policies (
  event_type TEXT PRIMARY KEY,
  retention_days INTEGER NOT NULL,
  aggregation_retention_days INTEGER NOT NULL,
  min_k_anonymity INTEGER NOT NULL DEFAULT 10,
  updated_at_iso TEXT NOT NULL
);
