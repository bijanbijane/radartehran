-- RT-DB-TRIAD-001 USER_DB Migration 0009:
-- Store only a keyed digest of locally verified OTPs; never persist the OTP itself.
ALTER TABLE auth_phone_challenges ADD COLUMN code_hash TEXT;
