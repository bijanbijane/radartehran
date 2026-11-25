-- RT-DB-TRIAD-003 (Section B) USER_DB Migration 0007:
-- Leased per-subject research processing permits, durable consent revocation drain/erasure jobs,
-- and revision-scoped outbox support (ZERO raw UID in research_erasure_outbox).
-- Domain Owner: USER_DB (radar-user-db)
CREATE TABLE IF NOT EXISTS research_processing_permits (
  permit_id TEXT PRIMARY KEY,
  uid TEXT NOT NULL,
  subject_key TEXT NOT NULL,
  subject_key_version TEXT NOT NULL,
  consent_revision INTEGER NOT NULL,
  consumer_kind TEXT NOT NULL DEFAULT 'http_ingest',
  acquired_at_ms INTEGER NOT NULL,
  expires_at_ms INTEGER NOT NULL,
  released_at_ms INTEGER
);

CREATE INDEX IF NOT EXISTS idx_research_permits_uid_active
  ON research_processing_permits(uid, released_at_ms, expires_at_ms, consent_revision);

CREATE INDEX IF NOT EXISTS idx_research_permits_subject_active
  ON research_processing_permits(subject_key, subject_key_version, released_at_ms, expires_at_ms);

CREATE TABLE IF NOT EXISTS research_consent_revocation_jobs (
  revocation_id TEXT PRIMARY KEY,
  uid TEXT NOT NULL,
  revoked_consent_revision INTEGER NOT NULL,
  new_consent_revision INTEGER NOT NULL,
  status TEXT NOT NULL,
  erased_events_count INTEGER NOT NULL DEFAULT 0,
  receipt_ids_json TEXT NOT NULL DEFAULT '[]',
  created_at_iso TEXT NOT NULL,
  updated_at_iso TEXT NOT NULL,
  completed_at_iso TEXT
);

CREATE INDEX IF NOT EXISTS idx_research_consent_rev_uid_status
  ON research_consent_revocation_jobs(uid, status, new_consent_revision);

-- NULL max_consent_revision = full account deletion (erase all + permanent fence).
-- Non-NULL max_consent_revision = consent revocation (erase events <= max_consent_revision + advance fence).
ALTER TABLE research_erasure_outbox ADD COLUMN max_consent_revision INTEGER;
