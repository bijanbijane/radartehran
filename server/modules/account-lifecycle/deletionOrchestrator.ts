/**
 * Employee 7 — Durable Account Deletion Orchestrator
 * (`server/modules/account-lifecycle/deletionOrchestrator.ts`)
 *
 * Exclusive ownership: `server/modules/account-lifecycle/`
 *
 * Enforces required architecture:
 *  1. Durable Firestore/journal deletion jobs; never uses an in-memory plan as authoritative.
 *  2. Survives process restarts by reloading job progress and resumable cursors on every step.
 *  3. Write blocking enforced immediately upon job creation (`assertUserWritePermitted`).
 *  4. Bounded paginated deletion across dependent domain modules (`batchSize`).
 *  5. Distinguishes permanently deleted records (`permanentlyDeletedIds`) from records retained
 *     under an approved retention policy (`retainedRecords`).
 *  6. Coordinates Media cleanup after dependent records are purged.
 *  7. Deletes Firebase Auth identity ONLY AFTER all dependent records and media reach `COMPLETED`.
 *  8. Never marks a step or job complete unless its durable operation succeeded.
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
} from './types.ts';
import { createInitialDomainSteps } from './deletionJobBootstrap.ts';
import type { DurableAccountLifecycleStore } from './storeContract.ts';
import { assertAuthorizedForTargetAccount } from './exportService.ts';
import { isTerminalAccountDeletionState } from './stateMachine.ts';
import type { AccountDeletionBatchReceiptRecorder } from './batchReceiptRecorder.ts';
import { NoOpAccountDeletionBatchReceiptRecorder } from './batchReceiptRecorder.ts';
import type { AccountTelemetryErasureAdapter } from './telemetryErasureContract.ts';
import {
  createJobIdSuffix,
  ensureDeletionWriteBlock,
  initialLegacySupplementJournal,
  initialTelemetryErasureJournal,
  prepareDeletionJobForResume,
} from './deletionWorkflowSupport.ts';
import {
  type LegacyFirestoreSupplementRunner,
  recordTerminalExecutionReceipt,
  runLegacyFirestoreSupplementPhase,
  runTelemetryErasurePhase,
} from './deletionOrchestratorPhases.ts';
import {
  assertAllDependentStepsCompletedBeforeAuth,
  runAuthIdentityDeletion,
  runDomainSourceBatches,
  runMediaCleanupBatches,
} from './deletionOrchestratorRunners.ts';

export const DEFAULT_DELETION_BATCH_SIZE = 10;
export const MAX_DELETION_BATCH_SIZE = 50;

export interface InitiateDeletionJobRequest {
  targetUid: string;
  targetEmail?: string;
  reason?: string;
}

export interface ExecuteDeletionStepOptions {
  batchSize?: number;
  maxBatchesPerInvocation?: number;
}

export interface AccountDeletionOrchestratorOptions {
  store: DurableAccountLifecycleStore;
  domainAdapters: Iterable<UserOwnedDomainRepositoryAdapter>;
  mediaAdapter: MediaDeletionCoordinationAdapter;
  authAdapter: AuthIdentityDeletionAdapter;
  batchReceiptRecorder?: AccountDeletionBatchReceiptRecorder;
  telemetryErasureAdapter?: AccountTelemetryErasureAdapter;
  legacyFirestoreSupplement?: LegacyFirestoreSupplementRunner;
}

export class AccountDeletionOrchestrator {
  private readonly store: DurableAccountLifecycleStore;
  private readonly domainAdapters: Map<UserOwnedDomainSource, UserOwnedDomainRepositoryAdapter>;
  private readonly mediaAdapter: MediaDeletionCoordinationAdapter;
  private readonly authAdapter: AuthIdentityDeletionAdapter;
  private readonly batchReceiptRecorder: AccountDeletionBatchReceiptRecorder;
  private readonly telemetryErasureAdapter?: AccountTelemetryErasureAdapter;
  private readonly legacyFirestoreSupplement?: LegacyFirestoreSupplementRunner;

  constructor(params: AccountDeletionOrchestratorOptions) {
    this.store = params.store;
    this.domainAdapters = new Map();
    for (const adapter of params.domainAdapters) {
      this.domainAdapters.set(adapter.source, adapter);
    }
    this.mediaAdapter = params.mediaAdapter;
    this.authAdapter = params.authAdapter;
    this.batchReceiptRecorder =
      params.batchReceiptRecorder ?? new NoOpAccountDeletionBatchReceiptRecorder();
    this.telemetryErasureAdapter = params.telemetryErasureAdapter;
    this.legacyFirestoreSupplement = params.legacyFirestoreSupplement;
  }

  public async assertUserWritePermitted(targetUid: string): Promise<void> {
    await this.store.assertUserWritePermitted(targetUid);
  }

  public async getDeletionJobStatus(
    actor: AccountLifecycleActorContext,
    jobId: string,
  ): Promise<DurableAccountDeletionJob> {
    const job = await this.store.getJobById(jobId);
    if (!job) {
      throw new AccountLifecycleError('JOB_NOT_FOUND', `Deletion job "${jobId}" does not exist.`, 404);
    }
    assertAuthorizedForTargetAccount(actor, job.targetUid, 'STATUS');
    return job;
  }

  public async initiateAccountDeletionJob(
    actor: AccountLifecycleActorContext,
    request: InitiateDeletionJobRequest,
  ): Promise<{ job: DurableAccountDeletionJob; createdNew: boolean }> {
    assertAuthorizedForTargetAccount(actor, request.targetUid, 'DELETE');

    if (!actor.freshAuthVerified) {
      throw new AccountLifecycleError(
        'FRESH_AUTH_REQUIRED',
        'Destructive account deletion requires recent authentication verification (freshAuthVerified=true).',
        403,
      );
    }

    const normalizedTargetEmail = request.targetEmail?.trim().toLowerCase();
    const normalizedPrimaryAdmin = actor.primaryBootstrapAdminEmail?.trim().toLowerCase();
    if (normalizedTargetEmail && normalizedPrimaryAdmin && normalizedTargetEmail === normalizedPrimaryAdmin) {
      throw new AccountLifecycleError(
        'PRIMARY_ADMIN_PROTECTION_BLOCK',
        `Cannot delete primary bootstrap administrator account "${normalizedTargetEmail}".`,
        409,
      );
    }

    const nowIso = new Date().toISOString();
    const newJob: DurableAccountDeletionJob = {
      jobId: `deljob_${request.targetUid}_${createJobIdSuffix()}`,
      targetUid: request.targetUid,
      targetEmail: request.targetEmail,
      requestedByUid: actor.uid,
      reason: request.reason?.trim() || 'USER_REQUESTED_ERASURE',
      state: 'INITIATED_WRITE_BLOCKED',
      writeBlockEnforced: true,
      domainSteps: createInitialDomainSteps(nowIso),
      mediaStep: {
        status: 'PENDING',
        resumableCursor: null,
        deletedObjectIds: [],
        pendingRetryObjectIds: [],
        attempts: 0,
        updatedAtIso: nowIso,
      },
      authStep: {
        status: 'PENDING',
        deletedAtIso: null,
        attempts: 0,
        updatedAtIso: nowIso,
      },
      totalAttempts: 0,
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
      completedAtIso: null,
      lastFailureReason: null,
      revision: 1,
      legacyFirestoreSupplement: this.legacyFirestoreSupplement
        ? initialLegacySupplementJournal(nowIso)
        : undefined,
      telemetryErasureStep: this.telemetryErasureAdapter
        ? initialTelemetryErasureJournal(nowIso)
        : undefined,
    };

    return this.store.createOrGetActiveJob(newJob);
  }

  public async resumeDeletionJob(
    actor: AccountLifecycleActorContext,
    jobId: string,
    options?: ExecuteDeletionStepOptions,
  ): Promise<DurableAccountDeletionJob> {
    return this.executeDeletionJob(actor, jobId, options);
  }

  public async executeDeletionJob(
    actor: AccountLifecycleActorContext,
    jobId: string,
    options?: ExecuteDeletionStepOptions,
  ): Promise<DurableAccountDeletionJob> {
    let job = await this.getDeletionJobStatus(actor, jobId);
    if (job.state === 'COMPLETED') {
      return job;
    }

    const prepared = prepareDeletionJobForResume(job);
    if (
      prepared.state !== job.state ||
      prepared.lastFailureReason !== job.lastFailureReason ||
      JSON.stringify(prepared.domainSteps) !== JSON.stringify(job.domainSteps)
    ) {
      job = await this.store.saveJobProgress(job.jobId, job.revision, () => prepared);
    }

    const batchSize = options?.batchSize ?? DEFAULT_DELETION_BATCH_SIZE;
    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > MAX_DELETION_BATCH_SIZE) {
      throw new AccountLifecycleError(
        'INVALID_PAGINATION_OPTIONS',
        `Deletion batchSize must be an integer between 1 and ${MAX_DELETION_BATCH_SIZE}.`,
        400,
      );
    }

    const maxBatches = options?.maxBatchesPerInvocation ?? Number.MAX_SAFE_INTEGER;
    let batchesExecutedThisRun = 0;

    await ensureDeletionWriteBlock(this.store, job);

    job = await this.store.saveJobProgress(job.jobId, job.revision, (curr) => ({
      ...curr,
      totalAttempts: curr.totalAttempts + 1,
      lastFailureReason: null,
      updatedAtIso: new Date().toISOString(),
    }));

    if (this.legacyFirestoreSupplement) {
      job = await runLegacyFirestoreSupplementPhase({
        store: this.store,
        job,
        runner: this.legacyFirestoreSupplement,
      });
      if (job.legacyFirestoreSupplement?.status === 'FAILED_RETRYABLE') {
        await recordTerminalExecutionReceipt({ recorder: this.batchReceiptRecorder, job });
        return job;
      }
    }

    if (this.telemetryErasureAdapter && job.telemetryErasureStep?.status !== 'COMPLETED') {
      job = await runTelemetryErasurePhase({
        store: this.store,
        job,
        adapter: this.telemetryErasureAdapter,
        batchSize,
      });
      if (job.telemetryErasureStep?.status === 'FAILED_RETRYABLE') {
        await recordTerminalExecutionReceipt({ recorder: this.batchReceiptRecorder, job });
        return job;
      }
      if (job.telemetryErasureStep?.status !== 'COMPLETED') {
        await recordTerminalExecutionReceipt({ recorder: this.batchReceiptRecorder, job });
        return job;
      }
    }

    // PHASE 1: Purge dependent domain records in bounded batches
    for (const source of DEPENDENT_PURGE_SOURCES) {
      const result = await runDomainSourceBatches({
        store: this.store,
        domainAdapters: this.domainAdapters,
        batchReceiptRecorder: this.batchReceiptRecorder,
        initialJob: job,
        source,
        phaseState: 'PURGING_DEPENDENT_RECORDS',
        batchSize,
        remainingBatchesAllowed: maxBatches - batchesExecutedThisRun,
      });
      job = result.job;
      batchesExecutedThisRun += result.batchesRun;
      if (result.failed || batchesExecutedThisRun >= maxBatches) {
        await recordTerminalExecutionReceipt({ recorder: this.batchReceiptRecorder, job });
        return job;
      }
    }

    // PHASE 2: Coordinate Media cleanup (Employee 6 interface)
    if (job.mediaStep.status !== 'COMPLETED') {
      const mediaResult = await runMediaCleanupBatches({
        store: this.store,
        mediaAdapter: this.mediaAdapter,
        batchReceiptRecorder: this.batchReceiptRecorder,
        actor,
        initialJob: job,
        batchSize,
        remainingBatchesAllowed: maxBatches - batchesExecutedThisRun,
      });
      job = mediaResult.job;
      batchesExecutedThisRun += mediaResult.batchesRun;
      if (mediaResult.failed || batchesExecutedThisRun >= maxBatches) {
        await recordTerminalExecutionReceipt({ recorder: this.batchReceiptRecorder, job });
        return job;
      }
    }

    // PHASE 3: Apply retention/anonymization policies to compliance/crowd-claim sources
    for (const source of RETENTION_POLICY_SOURCES) {
      const result = await runDomainSourceBatches({
        store: this.store,
        domainAdapters: this.domainAdapters,
        batchReceiptRecorder: this.batchReceiptRecorder,
        initialJob: job,
        source,
        phaseState: 'APPLYING_RETENTION_POLICIES',
        batchSize,
        remainingBatchesAllowed: maxBatches - batchesExecutedThisRun,
      });
      job = result.job;
      batchesExecutedThisRun += result.batchesRun;
      if (result.failed || batchesExecutedThisRun >= maxBatches) {
        await recordTerminalExecutionReceipt({ recorder: this.batchReceiptRecorder, job });
        return job;
      }
    }

    if (job.domainSteps.MEDIA_METADATA.status !== 'COMPLETED' && job.mediaStep.status === 'COMPLETED') {
      job = await this.store.saveJobProgress(job.jobId, job.revision, (curr) => ({
        ...curr,
        domainSteps: {
          ...curr.domainSteps,
          MEDIA_METADATA: {
            ...curr.domainSteps.MEDIA_METADATA,
            status: 'COMPLETED',
            permanentlyDeletedIds: [...curr.mediaStep.deletedObjectIds],
            updatedAtIso: new Date().toISOString(),
          },
        },
        updatedAtIso: new Date().toISOString(),
      }));
    }

    assertAllDependentStepsCompletedBeforeAuth(job);

    // PHASE 4: Delete Firebase Auth identity strictly after all dependent records & media succeeded
    const finalJob = await runAuthIdentityDeletion(this.store, this.authAdapter, job);
    if (isTerminalAccountDeletionState(finalJob.state)) {
      await recordTerminalExecutionReceipt({ recorder: this.batchReceiptRecorder, job: finalJob });
    }
    return finalJob;
  }

}
