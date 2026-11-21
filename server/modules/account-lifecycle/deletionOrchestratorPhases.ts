/**
 * Supplemental deletion phases: legacy Firestore, telemetry erasure, batch receipts (Phase C).
 */

import type {
  AccountDeletionBatchReceiptRecorder,
  BatchReceiptRecordParams,
} from './batchReceiptRecorder.ts';
import type { DurableAccountLifecycleStore } from './storeContract.ts';
import type {
  DurableAccountDeletionJob,
  UserOwnedDomainSource,
  BatchDispositionResult,
} from './types.ts';
import type { LegacyFirestoreSupplementResult } from './legacyFirestoreDeletionSteps.ts';
import type { AccountTelemetryErasureAdapter } from './telemetryErasureContract.ts';
import { legacySupplementSucceeded } from './deletionWorkflowSupport.ts';
import { assertValidAccountDeletionStateTransition } from './stateMachine.ts';

export type LegacyFirestoreSupplementRunner = (params: {
  job: DurableAccountDeletionJob;
}) => Promise<LegacyFirestoreSupplementResult>;

export async function runLegacyFirestoreSupplementPhase(params: {
  store: DurableAccountLifecycleStore;
  job: DurableAccountDeletionJob;
  runner: LegacyFirestoreSupplementRunner;
}): Promise<DurableAccountDeletionJob> {
  const { store, runner } = params;
  let job = params.job;
  const supplement = job.legacyFirestoreSupplement;
  if (!supplement || supplement.status === 'COMPLETED') {
    return job;
  }

  try {
    const result = await runner({ job });
    const ok = legacySupplementSucceeded(result);
    return store.saveJobProgress(job.jobId, job.revision, (curr) => {
      const now = new Date().toISOString();
      assertValidAccountDeletionStateTransition(curr.state, 'PURGING_DEPENDENT_RECORDS');
      return {
        ...curr,
        state: ok ? 'PURGING_DEPENDENT_RECORDS' : 'PARTIAL_FAILURE_RETRYABLE',
        updatedAtIso: now,
        legacyFirestoreSupplement: {
          status: ok ? 'COMPLETED' : 'FAILED_RETRYABLE',
          attempts: (curr.legacyFirestoreSupplement?.attempts ?? 0) + 1,
          lastError: ok ? undefined : 'Legacy Firestore supplement incomplete.',
          result,
          updatedAtIso: now,
        },
        lastFailureReason: ok ? null : 'Legacy Firestore supplement incomplete.',
      };
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return store.saveJobProgress(job.jobId, job.revision, (curr) => {
      const now = new Date().toISOString();
      return {
        ...curr,
        state: 'PARTIAL_FAILURE_RETRYABLE',
        lastFailureReason: `Legacy Firestore supplement failed: ${reason}`,
        updatedAtIso: now,
        legacyFirestoreSupplement: {
          status: 'FAILED_RETRYABLE',
          attempts: (curr.legacyFirestoreSupplement?.attempts ?? 0) + 1,
          lastError: reason,
          updatedAtIso: now,
        },
      };
    });
  }
}

export async function runTelemetryErasurePhase(params: {
  store: DurableAccountLifecycleStore;
  job: DurableAccountDeletionJob;
  adapter: AccountTelemetryErasureAdapter;
  batchSize: number;
}): Promise<DurableAccountDeletionJob> {
  const { store, adapter, batchSize } = params;
  let job = params.job;
  const step = job.telemetryErasureStep;
  if (!step || step.status === 'COMPLETED') {
    return job;
  }

  try {
    await adapter.purgePendingIngestionQueueForUser({ targetUid: job.targetUid, jobId: job.jobId });
    const batch = await adapter.purgeAttributableTelemetryBatch({
      targetUid: job.targetUid,
      jobId: job.jobId,
      dataClass: 'PSEUDONYMOUS_ATTRIBUTABLE',
      cursor: step.resumableCursor,
      batchSize,
    });

    const erased = batch.receipts.reduce((sum, r) => sum + r.recordsErased, 0);
    const retained = batch.receipts.reduce((sum, r) => sum + r.recordsRetained, 0);

    return store.saveJobProgress(job.jobId, job.revision, (curr) => {
      const now = new Date().toISOString();
      const prev = curr.telemetryErasureStep ?? step;
      const complete = !batch.hasMore;
      return {
        ...curr,
        updatedAtIso: now,
        telemetryErasureStep: {
          status: complete ? 'COMPLETED' : 'IN_PROGRESS',
          resumableCursor: batch.nextCursor,
          batchesProcessed: prev.batchesProcessed + 1,
          recordsErased: prev.recordsErased + erased,
          recordsRetained: prev.recordsRetained + retained,
          attempts: prev.attempts + 1,
          updatedAtIso: now,
        },
      };
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return store.saveJobProgress(job.jobId, job.revision, (curr) => {
      const now = new Date().toISOString();
      return {
        ...curr,
        state: 'PARTIAL_FAILURE_RETRYABLE',
        lastFailureReason: `Telemetry erasure failed: ${reason}`,
        updatedAtIso: now,
        telemetryErasureStep: {
          ...(curr.telemetryErasureStep ?? step),
          status: 'FAILED_RETRYABLE',
          attempts: (curr.telemetryErasureStep?.attempts ?? 0) + 1,
          lastError: reason,
          updatedAtIso: now,
        },
      };
    });
  }
}

export async function recordDomainBatchReceipt(params: {
  recorder: AccountDeletionBatchReceiptRecorder;
  job: DurableAccountDeletionJob;
  source: UserOwnedDomainSource;
  batchResult: BatchDispositionResult;
  batchIndex: number;
  cursor: string | null;
}): Promise<void> {
  const record: BatchReceiptRecordParams = {
    jobId: params.job.jobId,
    targetUid: params.job.targetUid,
    domainSource: params.source,
    batchIndex: params.batchIndex,
    cursor: params.cursor,
    receipts: params.batchResult.receipts,
    recordedAtIso: new Date().toISOString(),
  };
  await params.recorder.recordDomainBatchIfAbsent(record);
}

export async function recordTerminalExecutionReceipt(params: {
  recorder: AccountDeletionBatchReceiptRecorder;
  job: DurableAccountDeletionJob;
}): Promise<void> {
  const status =
    params.job.state === 'COMPLETED'
      ? 'SUCCEEDED'
      : params.job.state === 'PARTIAL_FAILURE_RETRYABLE'
        ? 'PARTIAL'
        : 'FAILED';
  await params.recorder.recordExecutionReceipt({
    jobId: params.job.jobId,
    targetUid: params.job.targetUid,
    status,
    jobState: params.job.state,
    recordedAtIso: new Date().toISOString(),
    detailRedacted: params.job.lastFailureReason ?? `Job reached state ${params.job.state}`,
  });
}