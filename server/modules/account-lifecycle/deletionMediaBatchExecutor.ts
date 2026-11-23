/**
 * Crash-safe media batch execution with durable receipts (Stage D — mirrors domain CV protocol).
 */

import type { AccountLifecycleActorContext, DurableAccountDeletionJob, MediaDeletionCoordinationAdapter } from './types.ts';
import type { DurableAccountLifecycleStore } from './storeContract.ts';
import type { AccountDeletionBatchReceiptRecorder } from './batchReceiptRecorder.ts';
import { buildBatchIdempotencyKey } from './batchReceiptRecorder.ts';
import { isBatchPersistingStore } from './batchPersistenceContract.ts';
import { AccountLifecycleError } from './types.ts';

export async function executeMediaBatchCrashSafe(params: {
  store: DurableAccountLifecycleStore;
  batchReceiptRecorder: AccountDeletionBatchReceiptRecorder;
  mediaAdapter: MediaDeletionCoordinationAdapter;
  actor: AccountLifecycleActorContext;
  job: DurableAccountDeletionJob;
  batchSize: number;
}): Promise<{ job: DurableAccountDeletionJob; batchesRun: number; failed: boolean }> {
  let job = params.job;
  const step = job.mediaStep;
  if (step.status === 'COMPLETED') return { job, batchesRun: 0, failed: false };

  const batchIndex = step.attempts + 1;
  const idempotencyKey = buildBatchIdempotencyKey(job.jobId, 'MEDIA', batchIndex, step.resumableCursor);

  if (isBatchPersistingStore(params.store)) {
    const persisted = await params.store.getBatchReceiptByIdempotencyKey(idempotencyKey);
    if (persisted?.status === 'COMPLETED') {
      const outcome = JSON.parse(persisted.outcomeJson) as {
        nextCursor: string | null;
        hasMore: boolean;
        deletedObjectIds: string[];
        failed: boolean;
      };
      if (!outcome.failed) {
        const committed = await params.store.commitJobProgressWithBatchReceipt({
          jobId: job.jobId,
          expectedRevision: job.revision,
          receipt: {
            receiptId: persisted.receiptId,
            idempotencyKey,
            domainSource: 'MEDIA',
            batchCursor: step.resumableCursor,
            outcomeJson: persisted.outcomeJson,
            recordedAtIso: persisted.recordedAtIso,
            status: 'COMPLETED',
            completedAtIso: persisted.completedAtIso ?? persisted.recordedAtIso,
          },
          updater: (curr) => applyMediaOutcome(curr, outcome, batchIndex),
        });
        return { job: committed.job, batchesRun: 1, failed: false };
      }
    }
  }

  const page = await params.mediaAdapter.listOwnedMediaPage({
    targetUid: job.targetUid,
    cursor: step.resumableCursor,
    pageSize: params.batchSize,
  });

  const newlyDeleted: string[] = [];
  const pendingRetry: string[] = [];
  let lastFailureReason: string | undefined;

  for (const item of page.mediaItems) {
    if (item.ownerUid !== job.targetUid) {
      throw new AccountLifecycleError(
        'CROSS_USER_DATA_LEAK_DETECTED',
        `Media cleanup refused cross-user object "${item.objectId}".`,
        500,
      );
    }
    const delRes = await params.mediaAdapter.deleteOwnedMediaObject({
      actor: params.actor,
      targetUid: job.targetUid,
      objectId: item.objectId,
      jobId: job.jobId,
    });
    if (delRes.status === 'DELETED' || delRes.status === 'ALREADY_DELETED') {
      newlyDeleted.push(item.objectId);
    } else {
      pendingRetry.push(item.objectId);
      lastFailureReason = delRes.failureReason ?? `Media object "${item.objectId}" pending retry.`;
    }
  }

  const anyPendingRetry = pendingRetry.length > 0;
  const isStepComplete = !anyPendingRetry && !page.hasMore;
  const outcomeJson = JSON.stringify({
    nextCursor: anyPendingRetry ? step.resumableCursor : page.nextCursor,
    hasMore: !isStepComplete,
    deletedObjectIds: newlyDeleted,
    failed: anyPendingRetry,
    lastFailureReason,
  });

  const recordedAtIso = new Date().toISOString();
  const receiptId = `brcp_${idempotencyKey.replace(/[^a-zA-Z0-9:_-]/g, '_').slice(0, 120)}`;

  if (isBatchPersistingStore(params.store)) {
    const committed = await params.store.commitJobProgressWithBatchReceipt({
      jobId: job.jobId,
      expectedRevision: job.revision,
      receipt: {
        receiptId,
        idempotencyKey,
        domainSource: 'MEDIA',
        batchCursor: step.resumableCursor,
        outcomeJson,
        recordedAtIso,
        status: 'COMPLETED',
        completedAtIso: recordedAtIso,
      },
      updater: (curr) => {
        const parsed = JSON.parse(outcomeJson) as {
          nextCursor: string | null;
          hasMore: boolean;
          deletedObjectIds: string[];
          failed: boolean;
          lastFailureReason?: string;
        };
        return applyMediaOutcome(curr, parsed, batchIndex);
      },
    });
    return { job: committed.job, batchesRun: 1, failed: anyPendingRetry };
  }

  await params.batchReceiptRecorder.recordDomainBatchIfAbsent({
    jobId: job.jobId,
    targetUid: job.targetUid,
    domainSource: 'MEDIA',
    batchIndex,
    cursor: step.resumableCursor,
    receipts: [],
    recordedAtIso,
  });

  job = await params.store.saveJobProgress(job.jobId, job.revision, (curr) => {
    const parsed = JSON.parse(outcomeJson);
    return applyMediaOutcome(curr, parsed, batchIndex);
  });
  return { job, batchesRun: 1, failed: anyPendingRetry };
}

function applyMediaOutcome(
  curr: DurableAccountDeletionJob,
  outcome: {
    nextCursor: string | null;
    hasMore: boolean;
    deletedObjectIds: string[];
    failed: boolean;
    lastFailureReason?: string;
  },
  batchIndex: number,
): DurableAccountDeletionJob {
  const now = new Date().toISOString();
  const deletedSet = new Set([...curr.mediaStep.deletedObjectIds, ...outcome.deletedObjectIds]);
  const anyPendingRetry = outcome.failed;
  const isStepComplete = !anyPendingRetry && !outcome.hasMore;
  return {
    ...curr,
    state: anyPendingRetry ? 'PARTIAL_FAILURE_RETRYABLE' : 'CLEANING_UP_MEDIA',
    lastFailureReason: anyPendingRetry ? (outcome.lastFailureReason ?? 'Media cleanup incomplete.') : null,
    updatedAtIso: now,
    mediaStep: {
      status: anyPendingRetry ? 'FAILED_RETRYABLE' : isStepComplete ? 'COMPLETED' : 'IN_PROGRESS',
      resumableCursor: outcome.nextCursor,
      deletedObjectIds: Array.from(deletedSet),
      pendingRetryObjectIds: anyPendingRetry ? curr.mediaStep.pendingRetryObjectIds : [],
      attempts: curr.mediaStep.attempts + 1,
      lastError: outcome.lastFailureReason,
      updatedAtIso: now,
    },
  };
}