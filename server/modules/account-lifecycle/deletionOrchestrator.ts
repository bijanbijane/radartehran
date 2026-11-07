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

import crypto from 'node:crypto';
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
import {
  createInitialDomainSteps,
  DurableAccountLifecycleStore,
} from './durableJobStore.ts';
import { assertAuthorizedForTargetAccount } from './exportService.ts';

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

export class AccountDeletionOrchestrator {
  private readonly store: DurableAccountLifecycleStore;
  private readonly domainAdapters: Map<UserOwnedDomainSource, UserOwnedDomainRepositoryAdapter>;
  private readonly mediaAdapter: MediaDeletionCoordinationAdapter;
  private readonly authAdapter: AuthIdentityDeletionAdapter;

  constructor(params: {
    store: DurableAccountLifecycleStore;
    domainAdapters: Iterable<UserOwnedDomainRepositoryAdapter>;
    mediaAdapter: MediaDeletionCoordinationAdapter;
    authAdapter: AuthIdentityDeletionAdapter;
  }) {
    this.store = params.store;
    this.domainAdapters = new Map();
    for (const adapter of params.domainAdapters) {
      this.domainAdapters.set(adapter.source, adapter);
    }
    this.mediaAdapter = params.mediaAdapter;
    this.authAdapter = params.authAdapter;
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
      jobId: `deljob_${request.targetUid}_${crypto.randomUUID().slice(0, 8)}`,
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
    };

    return this.store.createOrGetActiveJob(newJob);
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

    await this.store.upsertWriteBlock({
      targetUid: job.targetUid,
      state: 'WRITE_BLOCKED_DELETION_IN_PROGRESS',
      activeDeletionJobId: job.jobId,
      blockedAtIso: job.createdAtIso,
      updatedAtIso: new Date().toISOString(),
      reason: `Executing deletion job ${job.jobId}`,
      revision: 1,
    });

    job = await this.store.saveJobProgress(job.jobId, job.revision, (curr) => ({
      ...curr,
      totalAttempts: curr.totalAttempts + 1,
      lastFailureReason: null,
      updatedAtIso: new Date().toISOString(),
    }));

    // PHASE 1: Purge dependent domain records in bounded batches
    for (const source of DEPENDENT_PURGE_SOURCES) {
      const result = await this.runDomainSourceBatches(
        job,
        source,
        'PURGING_DEPENDENT_RECORDS',
        batchSize,
        maxBatches - batchesExecutedThisRun,
      );
      job = result.job;
      batchesExecutedThisRun += result.batchesRun;
      if (result.failed || batchesExecutedThisRun >= maxBatches) {
        return job;
      }
    }

    // PHASE 2: Coordinate Media cleanup (Employee 6 interface)
    if (job.mediaStep.status !== 'COMPLETED') {
      const mediaResult = await this.runMediaCleanupBatches(
        actor,
        job,
        batchSize,
        maxBatches - batchesExecutedThisRun,
      );
      job = mediaResult.job;
      batchesExecutedThisRun += mediaResult.batchesRun;
      if (mediaResult.failed || batchesExecutedThisRun >= maxBatches) {
        return job;
      }
    }

    // PHASE 3: Apply retention/anonymization policies to compliance/crowd-claim sources
    for (const source of RETENTION_POLICY_SOURCES) {
      const result = await this.runDomainSourceBatches(
        job,
        source,
        'APPLYING_RETENTION_POLICIES',
        batchSize,
        maxBatches - batchesExecutedThisRun,
      );
      job = result.job;
      batchesExecutedThisRun += result.batchesRun;
      if (result.failed || batchesExecutedThisRun >= maxBatches) {
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

    this.assertAllDependentStepsCompletedBeforeAuth(job);

    // PHASE 4: Delete Firebase Auth identity strictly after all dependent records & media succeeded
    return this.runAuthIdentityDeletion(job);
  }

  private async runDomainSourceBatches(
    initialJob: DurableAccountDeletionJob,
    source: UserOwnedDomainSource,
    phaseState: 'PURGING_DEPENDENT_RECORDS' | 'APPLYING_RETENTION_POLICIES',
    batchSize: number,
    remainingBatchesAllowed: number,
  ): Promise<{ job: DurableAccountDeletionJob; batchesRun: number; failed: boolean }> {
    let job = initialJob;
    let batchesRun = 0;

    if (job.domainSteps[source].status === 'COMPLETED') {
      return { job, batchesRun: 0, failed: false };
    }

    const adapter = this.domainAdapters.get(source);
    if (!adapter) {
      const reason = `Missing repository adapter for domain source "${source}".`;
      job = await this.markDomainStepFailed(job, source, reason);
      return { job, batchesRun, failed: true };
    }

    while (batchesRun < remainingBatchesAllowed && job.domainSteps[source].status !== 'COMPLETED') {
      const step = job.domainSteps[source];
      try {
        const batchResult = await adapter.disposeOwnedRecordsBatch({
          targetUid: job.targetUid,
          cursor: step.resumableCursor,
          batchSize,
          jobId: job.jobId,
        });
        batchesRun += 1;

        job = await this.store.saveJobProgress(job.jobId, job.revision, (curr) => {
          const now = new Date().toISOString();
          const prevStep = curr.domainSteps[source];
          const deletedSet = new Set(prevStep.permanentlyDeletedIds);
          const retainedMap = new Map(prevStep.retainedRecords.map((r) => [r.recordId, r]));

          for (const receipt of batchResult.receipts) {
            if (receipt.outcome === 'PERMANENTLY_DELETED') {
              deletedSet.add(receipt.recordId);
            } else {
              retainedMap.set(receipt.recordId, {
                recordId: receipt.recordId,
                outcome: receipt.outcome,
                retentionPolicyCode: receipt.retentionPolicyCode,
                retentionReason: receipt.retentionReason ?? 'Retained under statutory audit policy',
              });
            }
          }

          return {
            ...curr,
            state: phaseState,
            updatedAtIso: now,
            domainSteps: {
              ...curr.domainSteps,
              [source]: {
                ...prevStep,
                status: !batchResult.hasMore ? 'COMPLETED' : 'IN_PROGRESS',
                resumableCursor: batchResult.nextCursor,
                batchesProcessed: prevStep.batchesProcessed + 1,
                permanentlyDeletedIds: Array.from(deletedSet),
                retainedRecords: Array.from(retainedMap.values()),
                attempts: prevStep.attempts + 1,
                lastError: undefined,
                updatedAtIso: now,
              },
            },
          };
        });
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        job = await this.markDomainStepFailed(job, source, reason);
        return { job, batchesRun, failed: true };
      }
    }

    return { job, batchesRun, failed: false };
  }

  private async markDomainStepFailed(
    job: DurableAccountDeletionJob,
    source: UserOwnedDomainSource,
    reason: string,
  ): Promise<DurableAccountDeletionJob> {
    return this.store.saveJobProgress(job.jobId, job.revision, (curr) => {
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

  private async runMediaCleanupBatches(
    actor: AccountLifecycleActorContext,
    initialJob: DurableAccountDeletionJob,
    batchSize: number,
    remainingBatchesAllowed: number,
  ): Promise<{ job: DurableAccountDeletionJob; batchesRun: number; failed: boolean }> {
    let job = initialJob;
    let batchesRun = 0;

    while (batchesRun < remainingBatchesAllowed && job.mediaStep.status !== 'COMPLETED') {
      try {
        const page = await this.mediaAdapter.listOwnedMediaPage({
          targetUid: job.targetUid,
          cursor: job.mediaStep.resumableCursor,
          pageSize: batchSize,
        });
        batchesRun += 1;
        const newlyDeleted: string[] = [];
        const pendingRetry: string[] = [];
        let lastFailureReason: string | undefined;

        for (const item of page.mediaItems) {
          if (item.ownerUid !== job.targetUid) {
            throw new AccountLifecycleError(
              'CROSS_USER_DATA_LEAK_DETECTED',
              `Media cleanup refused cross-user object "${item.objectId}" owned by "${item.ownerUid}".`,
              500,
            );
          }
          const delRes = await this.mediaAdapter.deleteOwnedMediaObject({
            actor,
            targetUid: job.targetUid,
            objectId: item.objectId,
            jobId: job.jobId,
          });
          if (delRes.status === 'DELETED' || delRes.status === 'ALREADY_DELETED') {
            newlyDeleted.push(item.objectId);
          } else {
            pendingRetry.push(item.objectId);
            lastFailureReason = delRes.failureReason ?? `Media object "${item.objectId}" returned PENDING_RETRY.`;
          }
        }

        const anyPendingRetry = pendingRetry.length > 0;
        const isStepComplete = !anyPendingRetry && !page.hasMore;
        job = await this.store.saveJobProgress(job.jobId, job.revision, (curr) => {
          const now = new Date().toISOString();
          const deletedSet = new Set([...curr.mediaStep.deletedObjectIds, ...newlyDeleted]);
          return {
            ...curr,
            state: anyPendingRetry ? 'PARTIAL_FAILURE_RETRYABLE' : 'CLEANING_UP_MEDIA',
            lastFailureReason: anyPendingRetry ? (lastFailureReason ?? 'Media cleanup incomplete; retry required.') : null,
            updatedAtIso: now,
            mediaStep: {
              status: anyPendingRetry ? 'FAILED_RETRYABLE' : isStepComplete ? 'COMPLETED' : 'IN_PROGRESS',
              resumableCursor: anyPendingRetry ? curr.mediaStep.resumableCursor : page.nextCursor,
              deletedObjectIds: Array.from(deletedSet),
              pendingRetryObjectIds: pendingRetry,
              attempts: curr.mediaStep.attempts + 1,
              lastError: lastFailureReason,
              updatedAtIso: now,
            },
          };
        });
        if (anyPendingRetry) return { job, batchesRun, failed: true };
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        job = await this.store.saveJobProgress(job.jobId, job.revision, (curr) => {
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

  private assertAllDependentStepsCompletedBeforeAuth(job: DurableAccountDeletionJob): void {
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

  private async runAuthIdentityDeletion(initialJob: DurableAccountDeletionJob): Promise<DurableAccountDeletionJob> {
    const job = await this.store.saveJobProgress(initialJob.jobId, initialJob.revision, (curr) => ({
      ...curr,
      state: 'DELETING_AUTH_IDENTITY',
      updatedAtIso: new Date().toISOString(),
    }));
    try {
      const authRes = await this.authAdapter.deleteFirebaseAuthUser({ targetUid: job.targetUid, jobId: job.jobId });
      return this.store.saveJobProgress(job.jobId, job.revision, (curr) => {
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
      return this.store.saveJobProgress(job.jobId, job.revision, (curr) => {
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
}
