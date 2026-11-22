-- Canonical Staging & Edge D1 Migration 0002: Upload Sessions, Legal Holds, Rate Limits, Queue Idempotency & Audit Indexes
CREATE TABLE IF NOT EXISTS upload_sessions (
  session_id TEXT PRIMARY KEY,
  owner_uid TEXT NOT NULL,
  city_id TEXT NOT NULL,
  hood_id INTEGER NOT NULL,
  media_type TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_name TEXT NOT NULL,
  total_chunks INTEGER NOT NULL,
  max_bytes INTEGER NOT NULL,
  received_bytes INTEGER NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  created_at_ms INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_upload_sessions_owner_created ON upload_sessions(owner_uid, created_at_ms);

CREATE TABLE IF NOT EXISTS upload_session_chunks (
  session_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  chunk_base64 TEXT NOT NULL,
  byte_length INTEGER NOT NULL,
  PRIMARY KEY (session_id, chunk_index)
);

CREATE TABLE IF NOT EXISTS legal_holds (
  resource_id TEXT PRIMARY KEY,
  resource_type TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_by_email TEXT NOT NULL DEFAULT 'legal@radartehran.ir',
  created_at_iso TEXT NOT NULL DEFAULT '2026-11-08T00:00:00.000Z',
  active INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_legal_holds_active ON legal_holds(active, resource_type);

CREATE TABLE IF NOT EXISTS strong_rate_limits (
  bucket_key TEXT PRIMARY KEY,
  counter INTEGER NOT NULL,
  window_reset_ms INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_strong_rate_limits_reset ON strong_rate_limits(window_reset_ms);

CREATE TABLE IF NOT EXISTS queue_idempotency_keys (
  idempotency_key TEXT PRIMARY KEY,
  job_type TEXT NOT NULL,
  processed_at_iso TEXT NOT NULL,
  status TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_queue_idem_processed ON queue_idempotency_keys(job_type, processed_at_iso);
