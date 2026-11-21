/**
 * Resolves Write Admission exclusively from D1.
 *
 * An active deletion job must have a matching durable CLOSED write block.
 * Any mismatch is an invariant violation and fails closed.
 */

import type { D1DatabaseBinding } from '../db/types.ts';
import { createD1AccountLifecycleStore } from '../../server/modules/account-lifecycle/storeFactory.ts';
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
    const store = createD1AccountLifecycleStore(db);

    // Read the active job as well as the write block. Neither record alone
    // is sufficient to validate the active-deletion invariant.
    const activeJob = await d1FirstRow(db, SQL_GET_ACTIVE_JOB_FOR_UID, targetUid);
    const block = await store.getWriteBlock(targetUid);

    if (activeJob) {
      const activeJobId =
        typeof activeJob.job_id === 'string' ? activeJob.job_id : '';

      if (!activeJobId) {
        return {
          status: 'UNAVAILABLE',
          code: 'WRITE_BLOCK_INVARIANT_VIOLATION_INVALID_ACTIVE_JOB',
        };
      }

      if (!block) {
        return {
          status: 'UNAVAILABLE',
          code: 'WRITE_BLOCK_INVARIANT_VIOLATION_ACTIVE_JOB_WITHOUT_BLOCK',
        };
      }

      if (
        block.state === 'ACTIVE_WRITES_ALLOWED' ||
        block.activeDeletionJobId !== activeJobId
      ) {
        return {
          status: 'UNAVAILABLE',
          code: 'WRITE_BLOCK_INVARIANT_VIOLATION_ACTIVE_JOB_BLOCK_MISMATCH',
        };
      }

      return mapWriteBlockRowToAdmissionDecision(targetUid, block);
    }

    // A CLOSED record remains fail-closed even if its associated job is
    // no longer returned by the active-job query. The terminal lifecycle
    // transition is responsible for reopening admission safely.
    return mapWriteBlockRowToAdmissionDecision(targetUid, block);
  } catch {
    return { status: 'UNAVAILABLE', code: 'D1_WRITE_BLOCK_READ_FAILED' };
  }
}