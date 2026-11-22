-- RT-DB-TRIAD-002 USER_DB Migration 0006:
-- Adds monotonic consent_revision to user_privacy_consents and user_privacy_consent_audit
-- to enforce strict consent-revocation ordering against concurrent and queued research ingestion.
-- Domain Owner: USER_DB (radar-user-db)
ALTER TABLE user_privacy_consents ADD COLUMN consent_revision INTEGER NOT NULL DEFAULT 1;
ALTER TABLE user_privacy_consent_audit ADD COLUMN consent_revision INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_user_privacy_consent_rev
  ON user_privacy_consents(uid, consent_revision, research_analytics_consent);
