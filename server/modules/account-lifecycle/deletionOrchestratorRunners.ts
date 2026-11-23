/**
 * Domain/media/auth batch runners extracted from AccountDeletionOrchestrator (Phase C).
 */

import {
  AccountLifecycleActorContext,
  AccountLifecycleError,
  AuthIdentityDeletionAdapter,
  DEPENDENT_PURGE_SOURCES,
  DurableAccountDeletionJob,
  MediaDeletionCoordinationAdapter,
  RETENTION_POLICY_SOURCES,
  UserOwnedDomainRepositoryAdapter,
  UserOwnedDomainSource,
} from './types.ts';
import type { DurableAccountLifecycleStore } from './storeContract.ts';
import type { AccountDeletionBatchReceiptRecorder } from './batchReceiptRecorder.ts';
import { executeDomainBatchCrashSafe } from './deletionDomainBatchExecutor.ts';
import { executeMediaBatchCrashSafe } from './deletionMediaBatchExecutor.ts';

export async function markDomainStepFailed(
  store: DurableAccountLifecycleStore,
  job: DurableAccountDeletionJob,
  source: UserOwnedDomainSource,
  reason: string,
): Promise<DurableAccountDeletionJob> {
  return store.saveJobProgress(job.jobId, job.revision, (curr) => {
    const now = new Date().toISOString();
    const prevStep = curr.domainSteps[source];
    return {
      ...curr,
      state: 'PARTIAL_FAILURE_RETRYABLE',
      lastFailureReason: `Domain "${source}" batch failed: ${reason}`,
      updatedAtIso: now,
      domainSteps: {
        ...curr.domainSteps,
        [source]: { ...prevStep, status: 'FAILED_RETRYABLE', attempts: prevStep.attempts + 1, lastError: reason, updatedAtIso: now },
      },
    };
  });
}

export async function runDomainSourceBatches(params: {
  store: DurableAccountLifecycleStore;
  domainAdapters: Map<UserOwnedDomainSource, UserOwnedDomainRepositoryAdapter>;
  batchReceiptRecorder: AccountDeletionBatchReceiptRecorder;
  initialJob: DurableAccountDeletionJob;
  source: UserOwnedDomainSource;
  phaseState: 'PURGING_DEPENDENT_RECORDS' | 'APPLYING_RETENTION_POLICIES';
  batchSize: number;
  remainingBatchesAllowed: number;
}): Promise<{ job: DurableAccountDeletionJob; batchesRun: number; failed: boolean }> {
  let job = params.initialJob;
  let batchesRun = 0;

  if (job.domainSteps[params.source].status === 'COMPLETED') {
    return { job, batchesRun: 0, failed: false };
  }

  const adapter = params.domainAdapters.get(params.source);
  if (!adapter) {
    const reason = `Missing repository adapter for domain source "${params.source}".`;
    job = await markDomainStepFailed(params.store, job, params.source, reason);
    return { job, batchesRun, failed: true };
  }

  while (batchesRun < params.remainingBatchesAllowed && job.domainSteps[params.source].status !== 'COMPLETED') {
    const step = job.domainSteps[params.source];
    try {
      const executed = await executeDomainBatchCrashSafe({
        store: params.store,
        batchReceiptRecorder: params.batchReceiptRecorder,
        job,
        source: params.source,
        phaseState: params.phaseState,
        batchSize: params.batchSize,
        disposeBatch: (cursor) =>
          adapter.disposeOwnedRecordsBatch({
            targetUid: job.targetUid,
            cursor,
            batchSize: params.batchSize,
            jobId: job.jobId,
          }),
      });
      batchesRun += 1;
      job = executed.job;
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      job = await markDomainStepFailed(params.store, job, params.source, reason);
      return { job, batchesRun, failed: true };
    }
  }

  return { job, batchesRun, failed: false };
}

export async function runMediaCleanupBatches(params: {
  store: DurableAccountLifecycleStore;
  mediaAdapter: MediaDeletionCoordinationAdapter;
  batchReceiptRecorder: AccountDeletionBatchReceiptRecorder;
  actor: AccountLifecycleActorContext;
  initialJob: DurableAccountDeletionJob;
  batchSize: number;
  remainingBatchesAllowed: number;
}): Promise<{ job: DurableAccountDeletionJob; batchesRun: number; failed: boolean }> {
  let job = params.initialJob;
  let batchesRun = 0;

  while (batchesRun < params.remainingBatchesAllowed && job.mediaStep.status !== 'COMPLETED') {
    try {
      const executed = await executeMediaBatchCrashSafe({
        store: params.store,
        batchReceiptRecorder: params.batchReceiptRecorder,
        mediaAdapter: params.mediaAdapter,
        actor: params.actor,
        job,
        batchSize: params.batchSize,
      });
      batchesRun += executed.batchesRun;
      job = executed.job;
      if (executed.failed) return { job, batchesRun, failed: true };
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      job = await params.store.saveJobProgress(job.jobId, job.revision, (curr) => {
        const now = new Date().toISOString();
        return {
          ...curr,
          state: 'PARTIAL_FAILURE_RETRYABLE',
          lastFailureReason: `Media cleanup failed: ${reason}`,
          updatedAtIso: now,
          mediaStep: { ...curr.mediaStep, status: 'FAILED_RETRYABLE', attempts: curr.mediaStep.attempts + 1, lastError: reason, updatedAtIso: now },
        };
      });
      return { job, batchesRun, failed: true };
    }
  }
  return { job, batchesRun, failed: false };
}

export function assertAllDependentStepsCompletedBeforeAuth(job: DurableAccountDeletionJob): void {
  if (job.legacyFirestoreSupplement && job.legacyFirestoreSupplement.status !== 'COMPLETED') {
    throw new AccountLifecycleError(
      'AUTH_DELETION_PRECONDITION_FAILED',
      `Cannot delete Firebase Auth identity for "${job.targetUid}": legacy Firestore supplement is "${job.legacyFirestoreSupplement.status}".`,
      409,
    );
  }
  if (job.telemetryErasureStep && job.telemetryErasureStep.status !== 'COMPLETED') {
    throw new AccountLifecycleError(
      'AUTH_DELETION_PRECONDITION_FAILED',
      `Cannot delete Firebase Auth identity for "${job.targetUid}": telemetry erasure is "${job.telemetryErasureStep.status}".`,
      409,
    );
  }
  for (const source of [...DEPENDENT_PURGE_SOURCES, ...RETENTION_POLICY_SOURCES]) {
    if (job.domainSteps[source].status !== 'COMPLETED') {
      throw new AccountLifecycleError(
        'AUTH_DELETION_PRECONDITION_FAILED',
        `Cannot delete Firebase Auth identity for "${job.targetUid}": dependent domain "${source}" is in status "${job.domainSteps[source].status}".`,
        409,
      );
    }
  }
  if (job.mediaStep.status !== 'COMPLETED') {
    throw new AccountLifecycleError(
      'AUTH_DELETION_PRECONDITION_FAILED',
      `Cannot delete Firebase Auth identity for "${job.targetUid}": media cleanup step is in status "${job.mediaStep.status}".`,
      409,
    );
  }
}

export async function runAuthIdentityDeletion(
  store: DurableAccountLifecycleStore,
  authAdapter: AuthIdentityDeletionAdapter,
  initialJob: DurableAccountDeletionJob,
): Promise<DurableAccountDeletionJob> {
  assertAllDependentStepsCompletedBeforeAuth(initialJob);
  const job = await store.saveJobProgress(initialJob.jobId, initialJob.revision, (curr) => ({
    ...curr,
    state: 'DELETING_AUTH_IDENTITY',
    updatedAtIso: new Date().toISOString(),
  }));
  try {
    const authRes = await authAdapter.deleteFirebaseAuthUser({ targetUid: job.targetUid, jobId: job.jobId });
    return store.saveJobProgress(job.jobId, job.revision, (curr) => {
      const now = new Date().toISOString();
      return {
        ...curr,
        state: 'COMPLETED',
        completedAtIso: now,
        lastFailureReason: null,
        updatedAtIso: now,
        authStep: { status: 'COMPLETED', deletedAtIso: authRes.deletedAtIso || now, attempts: curr.authStep.attempts + 1, lastError: undefined, updatedAtIso: now },
      };
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return store.saveJobProgress(job.jobId, job.revision, (curr) => {
      const now = new Date().toISOString();
      return {
        ...curr,
        state: 'PARTIAL_FAILURE_RETRYABLE',
        lastFailureReason: `Firebase Auth identity deletion failed: ${reason}`,
        updatedAtIso: now,
        authStep: { ...curr.authStep, status: 'FAILED_RETRYABLE', attempts: curr.authStep.attempts + 1, lastError: reason, updatedAtIso: now },
      };
    });
  }
}