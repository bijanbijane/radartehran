/**
 * Account lifecycle queue message contract (Stage D).
 */

import type { RadarQueueJobType } from '../queues/queueAndCronProcessor.ts';

export const ACCOUNT_LIFECYCLE_QUEUE_JOB_TYPE: RadarQueueJobType = 'account_lifecycle_deletion_step';

export const ACCOUNT_LIFECYCLE_QUEUE_SCHEMA_VERSION = '1.0' as const;

export interface AccountLifecycleQueuePayload {
  readonly jobId: string;
  readonly targetUid: string;
  readonly operation: 'DELETION_STEP';
  readonly fencingRevision?: number;
}

export function buildLifecycleQueueIdempotencyKey(jobId: string, suffix: string): string {
  return `acl_q_${jobId}_${suffix}`.slice(0, 160);
}

export function validateLifecycleQueuePayload(raw: unknown):
  | { ok: true; payload: AccountLifecycleQueuePayload }
  | { ok: false; reason: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, reason: 'PAYLOAD_NOT_OBJECT' };
  }
  const rec = raw as Record<string, unknown>;
  if (typeof rec.jobId !== 'string' || rec.jobId.length < 4) return { ok: false, reason: 'INVALID_JOB_ID' };
  if (typeof rec.targetUid !== 'string' || rec.targetUid.length < 2) return { ok: false, reason: 'INVALID_TARGET_UID' };
  if (rec.operation !== 'DELETION_STEP') return { ok: false, reason: 'INVALID_OPERATION' };
  const fencing =
    rec.fencingRevision === undefined ? undefined : Number(rec.fencingRevision);
  if (fencing !== undefined && (!Number.isInteger(fencing) || fencing < 0)) {
    return { ok: false, reason: 'INVALID_FENCING_REVISION' };
  }
  return {
    ok: true,
    payload: {
      jobId: rec.jobId,
      targetUid: rec.targetUid,
      operation: 'DELETION_STEP',
      fencingRevision: fencing,
    },
  };
}