-- RT-DB-TRIAD-001 RESEARCH_DB Migration 0001:
-- Physically & Architecturally Isolated Research Database Schema (radar-researcher-db).
-- STRICT PRIVACY INVARIANT:
--   ZERO raw Firebase UID, email, phone, IP address, auth tokens, or user PII columns exist here.
--   Subjects are represented exclusively by server-side HMAC-SHA256 `subject_key` + `subject_key_version`.
-- Authoritative Migration Ledger: d1_migrations (independent of USER_DB).
CREATE TABLE IF NOT EXISTS research_event_registry (
  event_type TEXT PRIMARY KEY,
  schema_version INTEGER NOT NULL,
  domain TEXT NOT NULL,
  retention_days INTEGER NOT NULL,
  min_k_anonymity INTEGER NOT NULL DEFAULT 10,
  active INTEGER NOT NULL DEFAULT 1,
  updated_at_iso TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS research_events (
  event_id TEXT PRIMARY KEY,
  subject_key TEXT NOT NULL,
  subject_key_version TEXT NOT NULL,
  event_type TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  city_id TEXT NOT NULL,
  hood_id INTEGER,
  session_bucket TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  occurred_at_iso TEXT NOT NULL,
  ingested_at_iso TEXT NOT NULL,
  expires_at_iso TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE
);

CREATE INDEX IF NOT EXISTS idx_research_events_subject ON research_events(subject_key, subject_key_version);
CREATE INDEX IF NOT EXISTS idx_research_events_type_city_time ON research_events(event_type, city_id, occurred_at_iso);
CREATE INDEX IF NOT EXISTS idx_research_events_expires ON research_events(expires_at_iso);

CREATE TABLE IF NOT EXISTS research_idempotency_keys (
  idempotency_key TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  recorded_at_iso TEXT NOT NULL,
  expires_at_iso TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_research_idem_expires ON research_idempotency_keys(expires_at_iso);

CREATE TABLE IF NOT EXISTS research_ingestion_receipts (
  receipt_id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  accepted_count INTEGER NOT NULL DEFAULT 0,
  deduplicated_count INTEGER NOT NULL DEFAULT 0,
  rejected_count INTEGER NOT NULL DEFAULT 0,
  recorded_at_iso TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_research_ingest_receipts_time ON research_ingestion_receipts(recorded_at_iso);
