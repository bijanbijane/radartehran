-- RT-DB-TRIAD-003 follow-up: one revocation intent per user and consent revision.
-- Prevents concurrent duplicate revocation jobs from creating overlapping outbox scopes.
CREATE UNIQUE INDEX IF NOT EXISTS idx_research_consent_revocation_uid_revision
  ON research_consent_revocation_jobs(uid, revoked_consent_revision);

CREATE INDEX IF NOT EXISTS idx_research_erasure_outbox_job_status_retry
  ON research_erasure_outbox(job_id, status, next_retry_at_ms);
