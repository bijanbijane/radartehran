-- RT-DB-TRIAD-003 (Section B) RESEARCH_DB Migration 0003:
-- Monotonic consent_revision tagging on research_events and per-subject consent fencing watermarks
-- to guarantee that zombie/delayed/replayed consumers from a revoked consent revision can NEVER
-- persist events into RESEARCH_DB after revocation completion — without cross-D1 transactions.
-- STRICT PRIVACY INVARIANT: ZERO raw Firebase UID or PII columns.
-- Domain Owner: RESEARCH_DB (radar-researcher-db)
ALTER TABLE research_events ADD COLUMN consent_revision INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_research_events_subject_rev
  ON research_events(subject_key, subject_key_version, consent_revision);

CREATE TABLE IF NOT EXISTS research_subject_consent_fences (
  subject_key TEXT NOT NULL,
  subject_key_version TEXT NOT NULL,
  revoked_through_revision INTEGER NOT NULL,
  last_outbox_id TEXT NOT NULL,
  last_receipt_id TEXT NOT NULL,
  updated_at_iso TEXT NOT NULL,
  PRIMARY KEY (subject_key, subject_key_version)
);
