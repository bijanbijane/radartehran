-- RT-DB-TRIAD-001 USER_DB Migration 0007:
-- Cloudflare-native identity providers and opaque server-side sessions.
-- No Firebase Auth, Firebase ID tokens, Firestore, or App Check dependencies.
ALTER TABLE user_sessions ADD COLUMN token_hash TEXT;
ALTER TABLE user_sessions ADD COLUMN expires_at_iso TEXT;
ALTER TABLE user_sessions ADD COLUMN auth_provider TEXT NOT NULL DEFAULT 'unknown';
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_sessions_token_hash ON user_sessions(token_hash) WHERE token_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_sessions_expiry ON user_sessions(status, expires_at_iso);

CREATE TABLE IF NOT EXISTS auth_identities (
  provider TEXT NOT NULL CHECK (provider IN ('google', 'phone')),
  provider_subject TEXT NOT NULL,
  uid TEXT NOT NULL,
  email TEXT,
  email_verified INTEGER NOT NULL DEFAULT 0,
  phone_e164 TEXT,
  created_at_iso TEXT NOT NULL,
  last_authenticated_at_iso TEXT NOT NULL,
  PRIMARY KEY (provider, provider_subject),
  UNIQUE (provider, phone_e164),
  FOREIGN KEY (uid) REFERENCES user_profiles(uid) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_auth_identities_uid ON auth_identities(uid);
CREATE INDEX IF NOT EXISTS idx_auth_identities_email ON auth_identities(email);

CREATE TABLE IF NOT EXISTS auth_oauth_states (
  state_hash TEXT PRIMARY KEY,
  nonce TEXT NOT NULL,
  code_verifier TEXT NOT NULL,
  return_path TEXT NOT NULL DEFAULT '/',
  expires_at_ms INTEGER NOT NULL,
  created_at_ms INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_auth_oauth_states_expiry ON auth_oauth_states(expires_at_ms);

CREATE TABLE IF NOT EXISTS auth_phone_challenges (
  challenge_id TEXT PRIMARY KEY,
  phone_e164 TEXT NOT NULL,
  phone_hash TEXT NOT NULL,
  provider_reference TEXT,
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'VERIFIED', 'EXPIRED', 'LOCKED')),
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at_ms INTEGER NOT NULL,
  created_at_ms INTEGER NOT NULL,
  verified_at_ms INTEGER
);
CREATE INDEX IF NOT EXISTS idx_auth_phone_challenges_phone ON auth_phone_challenges(phone_hash, created_at_ms);
CREATE INDEX IF NOT EXISTS idx_auth_phone_challenges_expiry ON auth_phone_challenges(expires_at_ms);
