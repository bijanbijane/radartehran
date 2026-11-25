/**
 * Parameterized SQL for account lifecycle D1 store (no string interpolation).
 */

export const SQL_PROBE_HEALTH = `SELECT job_id FROM account_deletion_jobs LIMIT 1`;

export const SQL_GET_WRITE_BLOCK = `SELECT target_uid, state, active_deletion_job_id, blocked_at_iso, updated_at_iso, reason, revision
  FROM account_write_blocks WHERE target_uid = ?1`;

export const SQL_UPSERT_WRITE_BLOCK = `INSERT INTO account_write_blocks (
  target_uid, state, active_deletion_job_id, blocked_at_iso, updated_at_iso, reason, revision
) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
ON CONFLICT(target_uid) DO UPDATE SET
  state = excluded.state,
  active_deletion_job_id = excluded.active_deletion_job_id,
  blocked_at_iso = excluded.blocked_at_iso,
  updated_at_iso = excluded.updated_at_iso,
  reason = excluded.reason,
  revision = excluded.revision
WHERE account_write_blocks.revision < excluded.revision`;

export const SQL_GET_JOB_BY_ID = `SELECT job_id, job_json, revision, state, target_uid, completed_at_iso
  FROM account_deletion_jobs WHERE job_id = ?1`;

export const SQL_GET_ACTIVE_JOB_FOR_UID = `SELECT job_id, job_json, revision, state, target_uid, completed_at_iso
  FROM account_deletion_jobs WHERE target_uid = ?1 AND completed_at_iso IS NULL LIMIT 1`;

export const SQL_GET_LATEST_JOB_FOR_UID = `SELECT job_id, job_json, revision, state, target_uid, completed_at_iso
  FROM account_deletion_jobs WHERE target_uid = ?1 ORDER BY created_at_iso DESC LIMIT 1`;

export const SQL_INSERT_DELETION_JOB = `INSERT INTO account_deletion_jobs (
  job_id, target_uid, requested_by_uid, state, reason, write_block_enforced, job_json,
  revision, created_at_iso, updated_at_iso, completed_at_iso
) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`;

export const SQL_INSERT_WRITE_BLOCK_ON_JOB_CREATE = `INSERT INTO account_write_blocks (
  target_uid, state, active_deletion_job_id, blocked_at_iso, updated_at_iso, reason, revision
) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`;

export const SQL_UPDATE_JOB_PROGRESS = `UPDATE account_deletion_jobs SET
  state = ?1, job_json = ?2, revision = ?3, updated_at_iso = ?4, completed_at_iso = ?5
WHERE job_id = ?6 AND revision = ?7`;

export const SQL_UPDATE_WRITE_BLOCK_ON_JOB_COMPLETE = `UPDATE account_write_blocks SET
  state = ?1, updated_at_iso = ?2, reason = ?3, revision = ?4
WHERE target_uid = ?5`;

export const SQL_LIST_JOBS = `SELECT job_id, job_json, revision, state, target_uid, completed_at_iso, updated_at_iso
  FROM account_deletion_jobs ORDER BY updated_at_iso DESC`;

const CONTINUABLE_DELETION_STATES_SQL =
  "'PARTIAL_FAILURE_RETRYABLE', 'PURGING_DEPENDENT_RECORDS', 'CLEANING_UP_MEDIA', 'APPLYING_RETENTION_POLICIES', 'DELETING_AUTH_IDENTITY', 'INITIATED_WRITE_BLOCKED'";

export const SQL_LIST_RETRYABLE_JOBS = `SELECT job_id, job_json, revision, state, target_uid, completed_at_iso, updated_at_iso
  FROM account_deletion_jobs
  WHERE state IN (${CONTINUABLE_DELETION_STATES_SQL})
  ORDER BY updated_at_iso ASC LIMIT ?1 OFFSET ?2`;

export const SQL_COUNT_RETRYABLE_JOBS = `SELECT COUNT(*) AS job_count
  FROM account_deletion_jobs
  WHERE state IN (${CONTINUABLE_DELETION_STATES_SQL})`;

export const SQL_INSERT_BATCH_RECEIPT = `INSERT OR IGNORE INTO account_deletion_batch_receipts (
  receipt_id, job_id, target_uid, domain_source, idempotency_key, batch_cursor, outcome_json, recorded_at_iso, status, completed_at_iso
) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`;

export const SQL_GET_BATCH_RECEIPT_BY_IDEM = `SELECT receipt_id, job_id, target_uid, domain_source, idempotency_key, batch_cursor, outcome_json, recorded_at_iso, status, completed_at_iso
  FROM account_deletion_batch_receipts WHERE idempotency_key = ?1 LIMIT 1`;

export const SQL_GET_EXECUTION_RECEIPT_BY_JOB = `SELECT receipt_id FROM account_deletion_execution_receipts WHERE job_id = ?1`;

export const SQL_INSERT_EXECUTION_RECEIPT = `INSERT INTO account_deletion_execution_receipts (
  receipt_id, job_id, target_uid, status, receipt_json, recorded_at_iso
) VALUES (?1, ?2, ?3, ?4, ?5, ?6)`;

export const SQL_GET_EXPORT_JOB = `SELECT export_job_id, job_json, revision FROM account_export_jobs WHERE export_job_id = ?1`;

export const SQL_INSERT_EXPORT_JOB = `INSERT INTO account_export_jobs (
  export_job_id, target_uid, requested_by_uid, state, job_json, revision,
  download_expires_at_iso, created_at_iso, updated_at_iso, completed_at_iso
) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`;

export const SQL_UPDATE_EXPORT_JOB = `UPDATE account_export_jobs SET
  state = ?1, job_json = ?2, revision = ?3, updated_at_iso = ?4, completed_at_iso = ?5, download_expires_at_iso = ?6
WHERE export_job_id = ?7 AND revision = ?8`;

export const SQL_GET_LATEST_CONSENT = `SELECT consent_id, target_uid, scope, granted, policy_version, recorded_at_iso, revoked_at_iso, revision
  FROM account_privacy_consents WHERE target_uid = ?1 AND scope = ?2 ORDER BY recorded_at_iso DESC LIMIT 1`;

export const SQL_INSERT_CONSENT = `INSERT INTO account_privacy_consents (
  consent_id, target_uid, scope, granted, policy_version, recorded_at_iso, revoked_at_iso, revision
) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`;

export const SQL_INSERT_AUDIT = `INSERT INTO account_lifecycle_audit (
  audit_id, job_id, target_uid, actor_uid, action, detail_redacted, recorded_at_iso
) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`;

export const SQL_LIST_DATA_REQUESTS = `SELECT request_id, target_uid, kind, linked_job_id, status, requested_at_iso, completed_at_iso, revision
  FROM account_data_requests WHERE target_uid = ?1 ORDER BY requested_at_iso DESC`;

export const SQL_UPSERT_DATA_REQUEST = `INSERT INTO account_data_requests (
  request_id, target_uid, kind, linked_job_id, status, requested_at_iso, completed_at_iso, revision
) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
ON CONFLICT(request_id) DO UPDATE SET
  kind = excluded.kind,
  linked_job_id = excluded.linked_job_id,
  status = excluded.status,
  requested_at_iso = excluded.requested_at_iso,
  completed_at_iso = excluded.completed_at_iso,
  revision = excluded.revision`;