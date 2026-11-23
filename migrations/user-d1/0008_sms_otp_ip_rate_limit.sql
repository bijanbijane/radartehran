-- RT-DB-TRIAD-001 USER_DB Migration 0008:
-- Per-IP SMS OTP throttling without persisting raw client IP addresses.
ALTER TABLE auth_phone_challenges ADD COLUMN ip_hash TEXT;
CREATE INDEX IF NOT EXISTS idx_auth_phone_challenges_ip ON auth_phone_challenges(ip_hash, created_at_ms);
