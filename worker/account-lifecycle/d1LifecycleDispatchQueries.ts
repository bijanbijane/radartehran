/** Stage D — dispatch outbox + per-job lease SQL (parameterized). */
export const SQL_INSERT_DISPATCH_OUTBOX = \`INSERT OR IGNORE INTO account_lifecycle_dispatch_outbox (
  event_id, job_id, target_uid, operation_type, idempotency_key, dispatch_status,
  attempt_count, next_attempt_at_iso, last_error_redacted, correlation_id,
  created_at_iso, updated_at_iso, dispatched_at_iso
) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)\`;

export const SQL_GET_DISPATCH_BY_IDEM = \`SELECT event_id, job_id, dispatch_status, idempotency_key
  FROM account_lifecycle_dispatch_outbox WHERE idempotency_key = ?1 LIMIT 1\`;

export const SQL_LIST_PENDING_DISPATCH = \`SELECT event_id, job_id, target_uid, operation_type, idempotency_key,
  dispatch_status, attempt_count, next_attempt_at_iso, correlation_id, created_at_iso, updated_at_iso
  FROM account_lifecycle_dispatch_outbox
  WHERE dispatch_status IN ('PENDING', 'DISPATCH_FAILED')
    AND (next_attempt_at_iso IS NULL OR next_attempt_at_iso <= ?1)
  ORDER BY created_at_iso ASC LIMIT ?2\`;

export const SQL_MARK_DISPATCH_SENT = \`UPDATE account_lifecycle_dispatch_outbox SET
  dispatch_status = 'DISPATCHED', dispatched_at_iso = ?1, updated_at_iso = ?1,
  attempt_count = attempt_count + 1, last_error_redacted = NULL
  WHERE idempotency_key = ?2 AND dispatch_status IN ('PENDING', 'DISPATCH_FAILED')\`;

export const SQL_MARK_DISPATCH_FAILED = \`UPDATE account_lifecycle_dispatch_outbox SET
  dispatch_status = 'DISPATCH_FAILED', last_error_redacted = ?1, updated_at_iso = ?2,
  attempt_count = attempt_count + 1, next_attempt_at_iso = ?3
  WHERE idempotency_key = ?4 AND dispatch_status IN ('PENDING', 'DISPATCH_FAILED')\`;

export const SQL_INSERT_JOB_LEASE = \`INSERT OR IGNORE INTO account_deletion_job_leases (
  job_id, target_uid, lease_token, fencing_revision, lease_owner, lease_expires_at_ms, acquired_at_iso, updated_at_iso
) VALUES (?1, ?2, ?3, 1, ?4, ?5, ?6, ?6)\`;

export const SQL_CLAIM_JOB_LEASE = \`UPDATE account_deletion_job_leases SET
  lease_token = ?1, fencing_revision = fencing_revision + 1, lease_owner = ?2,
  lease_expires_at_ms = ?3, updated_at_iso = ?4
WHERE job_id = ?5 AND (lease_expires_at_ms <= ?6 OR lease_token = ?1)\`;

export const SQL_GET_JOB_LEASE = \`SELECT job_id, target_uid, lease_token, fencing_revision, lease_owner, lease_expires_at_ms
  FROM account_deletion_job_leases WHERE job_id = ?1\`;

export const SQL_RELEASE_JOB_LEASE = \`UPDATE account_deletion_job_leases SET
  lease_expires_at_ms = ?1, updated_at_iso = ?2
WHERE job_id = ?3 AND lease_token = ?4 AND fencing_revision = ?5\`;

export const SQL_LIST_EXPIRED_JOB_LEASES = \`SELECT job_id, target_uid FROM account_deletion_job_leases
  WHERE lease_expires_at_ms <= ?1 LIMIT ?2\`;
