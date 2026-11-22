-- RT-DB-TRIAD-001 USER_DB Migration 0004:
-- Authoritative User Profiles, Privacy Consents, Notification Channels, Favorites,
-- Saved Searches, Sessions, Data Requests, Admin RBAC/Audit, and Pseudonymous Subject Registry.
-- Domain Owner: USER_DB (radar-user-db)
CREATE TABLE IF NOT EXISTS user_profiles (
  uid TEXT PRIMARY KEY,
  display_name TEXT NOT NULL DEFAULT '',
  preferred_city TEXT NOT NULL DEFAULT 'tehran',
  preferred_language TEXT NOT NULL DEFAULT 'fa',
  area_unit TEXT NOT NULL DEFAULT 'sqm',
  intl_currency TEXT NOT NULL DEFAULT 'USD',
  role TEXT NOT NULL DEFAULT 'USER',
  account_status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at_iso TEXT NOT NULL,
  updated_at_iso TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_user_profiles_status_updated ON user_profiles(account_status, updated_at_iso);

CREATE TABLE IF NOT EXISTS user_privacy_consents (
  uid TEXT PRIMARY KEY,
  research_analytics_consent INTEGER NOT NULL DEFAULT 0,
  behavioral_telemetry_consent INTEGER NOT NULL DEFAULT 0,
  marketing_communications_consent INTEGER NOT NULL DEFAULT 0,
  consent_version TEXT NOT NULL DEFAULT 'v1',
  consent_source TEXT NOT NULL DEFAULT 'account_settings',
  granted_at_iso TEXT,
  revoked_at_iso TEXT,
  updated_at_iso TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_user_privacy_research ON user_privacy_consents(research_analytics_consent, updated_at_iso);

CREATE TABLE IF NOT EXISTS user_privacy_consent_audit (
  audit_id TEXT PRIMARY KEY,
  uid TEXT NOT NULL,
  consent_type TEXT NOT NULL,
  previous_value INTEGER NOT NULL,
  new_value INTEGER NOT NULL,
  consent_version TEXT NOT NULL,
  actor_uid TEXT NOT NULL,
  source TEXT NOT NULL,
  recorded_at_iso TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_privacy_audit_uid_time ON user_privacy_consent_audit(uid, recorded_at_iso);

CREATE TABLE IF NOT EXISTS user_notification_channels (
  channel_id TEXT PRIMARY KEY,
  uid TEXT NOT NULL,
  channel_type TEXT NOT NULL,
  destination_masked TEXT NOT NULL,
  destination_hash TEXT NOT NULL,
  verified INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at_iso TEXT NOT NULL,
  updated_at_iso TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_user_channels_uid ON user_notification_channels(uid, enabled);

CREATE TABLE IF NOT EXISTS user_favorites (
  uid TEXT NOT NULL,
  city_id TEXT NOT NULL,
  hood_id INTEGER NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at_iso TEXT NOT NULL,
  PRIMARY KEY (uid, city_id, hood_id)
);

CREATE INDEX IF NOT EXISTS idx_user_favorites_uid_created ON user_favorites(uid, created_at_iso);

CREATE TABLE IF NOT EXISTS user_saved_searches (
  search_id TEXT PRIMARY KEY,
  uid TEXT NOT NULL,
  label TEXT NOT NULL,
  city_id TEXT NOT NULL DEFAULT 'tehran',
  filters_json TEXT NOT NULL,
  alert_enabled INTEGER NOT NULL DEFAULT 0,
  created_at_iso TEXT NOT NULL,
  updated_at_iso TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_user_saved_searches_uid ON user_saved_searches(uid, updated_at_iso);

CREATE TABLE IF NOT EXISTS user_sessions (
  session_id TEXT PRIMARY KEY,
  uid TEXT NOT NULL,
  device_label TEXT NOT NULL DEFAULT 'web',
  user_agent_summary TEXT NOT NULL DEFAULT '',
  ip_prefix TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at_iso TEXT NOT NULL,
  last_seen_at_iso TEXT NOT NULL,
  revoked_at_iso TEXT,
  revoked_by_uid TEXT
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_uid_status ON user_sessions(uid, status, last_seen_at_iso);

CREATE TABLE IF NOT EXISTS user_data_requests (
  request_id TEXT PRIMARY KEY,
  uid TEXT NOT NULL,
  request_type TEXT NOT NULL,
  status TEXT NOT NULL,
  payload_summary_json TEXT NOT NULL DEFAULT '{}',
  requested_at_iso TEXT NOT NULL,
  completed_at_iso TEXT,
  updated_at_iso TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_user_data_requests_uid_status ON user_data_requests(uid, status, requested_at_iso);

CREATE TABLE IF NOT EXISTS admin_role_bindings (
  uid TEXT PRIMARY KEY,
  role TEXT NOT NULL,
  granted_by_uid TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  created_at_iso TEXT NOT NULL,
  updated_at_iso TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_audit_logs (
  audit_id TEXT PRIMARY KEY,
  actor_uid TEXT NOT NULL,
  action TEXT NOT NULL,
  target_uid TEXT,
  target_resource TEXT NOT NULL DEFAULT '',
  summary_json TEXT NOT NULL DEFAULT '{}',
  created_at_iso TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON admin_audit_logs(created_at_iso);

-- Maps a user's pseudonymized subject keys across HMAC key rotations inside USER_DB ONLY.
-- Never replicated to RESEARCH_DB; deleted upon completed account erasure after verifiable receipt.
CREATE TABLE IF NOT EXISTS user_research_subject_registry (
  uid TEXT NOT NULL,
  subject_key TEXT NOT NULL,
  subject_key_version TEXT NOT NULL,
  created_at_iso TEXT NOT NULL,
  erasure_requested_at_iso TEXT,
  erased_at_iso TEXT,
  PRIMARY KEY (uid, subject_key_version)
);

CREATE INDEX IF NOT EXISTS idx_user_research_subject_key ON user_research_subject_registry(subject_key);
