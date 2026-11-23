/**
 * Write-admission reader for the USER_DB schema (migrations/user-d1).
 * A missing or inconsistent lifecycle record is never interpreted as OPEN.
 */
import type { D1Database } from '../types.ts';
import type { WriteAdmissionDecision } from '../../server/modules/account-lifecycle/writeAdmissionAuthority.ts';

export async function resolveWriteAdmissionFromUserDb(
  userDb: D1Database,
  uid: string,
): Promise<WriteAdmissionDecision> {
  const targetUid = typeof uid === 'string' ? uid.trim() : '';
  if (!targetUid || targetUid.length > 128) {
    return { status: 'UNAVAILABLE', code: 'INVALID_WRITE_ADMISSION_UID' };
  }

  try {
    const [activeJob, block] = await Promise.all([
      userDb
        .prepare(
          `SELECT job_id, status FROM account_deletion_jobs
           WHERE uid = ?1 AND completed_at_iso IS NULL
           ORDER BY updated_at_iso DESC LIMIT 1`,
        )
        .bind(targetUid)
        .first<{ job_id: string; status: string }>(),
      userDb
        .prepare(
          `SELECT uid, job_id, block_reason, blocked_at_iso
           FROM account_write_blocks
           WHERE uid = ?1 AND released_at_iso IS NULL LIMIT 1`,
        )
        .bind(targetUid)
        .first<{ uid: string; job_id: string; block_reason: string; blocked_at_iso: string }>(),
    ]);

    if (activeJob && !block) {
      return { status: 'UNAVAILABLE', code: 'USER_DB_ACTIVE_JOB_WITHOUT_WRITE_BLOCK' };
    }
    if (activeJob && block && String(activeJob.job_id) !== String(block.job_id)) {
      return { status: 'UNAVAILABLE', code: 'USER_DB_ACTIVE_JOB_WRITE_BLOCK_MISMATCH' };
    }
    if (block) {
      return {
        status: 'CLOSED',
        uid: targetUid,
        revision: 0,
        deletionJobId: String(block.job_id),
        reason: String(block.block_reason || 'ACCOUNT_DELETION_ACTIVE'),
        blockState: 'WRITE_BLOCKED_DELETION_IN_PROGRESS',
      };
    }
    return { status: 'OPEN', uid: targetUid, revision: 0 };
  } catch {
    return { status: 'UNAVAILABLE', code: 'USER_DB_WRITE_ADMISSION_READ_FAILED' };
  }
}
