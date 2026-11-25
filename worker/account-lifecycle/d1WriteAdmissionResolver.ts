/**
 * Resolves Write Admission exclusively from D1.
 *
 * An active deletion job must have a matching durable CLOSED write block.
 * Any mismatch is an invariant violation and fails closed.
 */

import type { D1DatabaseBinding } from '../db/types.ts';
import { D1AccountLifecycleStore } from './d1AccountLifecycleStore.ts';
import {
  mapWriteBlockRowToAdmissionDecision,
  type WriteAdmissionDecision,
} from '../../server/modules/account-lifecycle/writeAdmissionAuthority.ts';
import { d1FirstRow } from './d1ResultHelpers.ts';
import { SQL_GET_ACTIVE_JOB_FOR_UID } from './d1Queries.ts';

export async function resolveWriteAdmissionFromD1(
  db: D1DatabaseBinding,
  targetUid: string,
): Promise<WriteAdmissionDecision> {
  try {
    if (!targetUid || targetUid.length > 128) {
      return { status: 'UNAVAILABLE', code: 'WRITE_ADMISSION_UID_INVALID' };
    }

    // The production USER_DB migration uses uid/job_id/released_at_iso.
    // The legacy staging D1 migration uses target_uid/state/active_deletion_job_id.
    // Detect the actual table contract explicitly; never guess based on a failed query.
    const schema = await db.prepare('PRAGMA table_info(account_write_blocks)').all<{ name: string }>();
    if (schema.success === false) {
      return { status: 'UNAVAILABLE', code: 'D1_WRITE_BLOCK_SCHEMA_READ_FAILED' };
    }
    const columns = new Set((schema.results ?? []).map((column) => column.name));

    if (columns.has('uid') && columns.has('job_id') && columns.has('released_at_iso')) {
      const [activeJob, block] = await Promise.all([
        db.prepare(
          "SELECT job_id FROM account_deletion_jobs WHERE uid = ?1 AND completed_at_iso IS NULL AND status NOT IN ('COMPLETED', 'FAILED', 'BLOCKED_LEGAL_HOLD') LIMIT 1",
        ).bind(targetUid).first<{ job_id: string }>(),
        db.prepare(
          'SELECT uid, job_id, block_reason FROM account_write_blocks WHERE uid = ?1 AND released_at_iso IS NULL LIMIT 1',
        ).bind(targetUid).first<{ uid: string; job_id: string; block_reason: string }>(),
      ]);

      if (activeJob && (!activeJob.job_id || !block || block.job_id !== activeJob.job_id)) {
        return {
          status: 'UNAVAILABLE',
          code: 'WRITE_BLOCK_INVARIANT_VIOLATION_ACTIVE_JOB_BLOCK_MISMATCH',
        };
      }
      if (block) {
        return {
          status: 'CLOSED',
          uid: targetUid,
          revision: 0,
          deletionJobId: block.job_id,
          reason: block.block_reason,
          blockState: 'BLOCKED',
        };
      }
      return { status: 'OPEN', uid: targetUid, revision: 0 };
    }

    if (columns.has('target_uid') && columns.has('state') && columns.has('active_deletion_job_id')) {
      const store = new D1AccountLifecycleStore(db);
      const activeJob = await d1FirstRow(db, SQL_GET_ACTIVE_JOB_FOR_UID, targetUid);
      const block = await store.getWriteBlock(targetUid);
      if (activeJob) {
        const activeJobId = typeof activeJob.job_id === 'string' ? activeJob.job_id : '';
        if (!activeJobId || !block || block.state === 'ACTIVE_WRITES_ALLOWED' || block.activeDeletionJobId !== activeJobId) {
          return { status: 'UNAVAILABLE', code: 'WRITE_BLOCK_INVARIANT_VIOLATION_ACTIVE_JOB_BLOCK_MISMATCH' };
        }
      }
      return mapWriteBlockRowToAdmissionDecision(targetUid, block);
    }

    return { status: 'UNAVAILABLE', code: 'WRITE_BLOCK_SCHEMA_CONTRACT_UNRECOGNIZED' };
  } catch {
    return { status: 'UNAVAILABLE', code: 'D1_WRITE_BLOCK_READ_FAILED' };
  }
}