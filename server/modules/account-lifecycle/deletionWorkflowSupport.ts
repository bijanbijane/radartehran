/**
 * Resume/retry helpers and write-block coordination for deletion orchestration (Phase C).
 */

import type {
  DurableAccountDeletionJob,
  DurableUserWriteBlockRecord,
  UserOwnedDomainSource,
} from './types.ts';
import { ALL_USER_OWNED_DOMAIN_SOURCES, DEPENDENT_PURGE_SOURCES, RETENTION_POLICY_SOURCES } from './types.ts';
import type { DurableAccountLifecycleStore } from './storeContract.ts';
import { assertValidAccountDeletionStateTransition, isTerminalAccountDeletionState } from './stateMachine.ts';
import type { LegacyFirestoreSupplementResult } from './legacyFirestoreDeletionSteps.ts';

export function createJobIdSuffix(): string {
  if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID().slice(0, 8);
  }
  return Math.random().toString(36).slice(2, 10);
}

export function initialLegacySupplementJournal(nowIso: string): NonNullable<DurableAccountDeletionJob['legacyFirestoreSupplement']> {
  return { status: 'PENDING', attempts: 0, updatedAtIso: nowIso };
}

export function initialTelemetryErasureJournal(nowIso: string): NonNullable<DurableAccountDeletionJob['telemetryErasureStep']> {
  return {
    status: 'PENDING',
    resumableCursor: null,
    batchesProcessed: 0,
    recordsErased: 0,
    recordsRetained: 0,
    attempts: 0,
    updatedAtIso: nowIso,
  };
}

export function prepareDeletionJobForResume(job: DurableAccountDeletionJob): DurableAccountDeletionJob {
  if (isTerminalAccountDeletionState(job.state)) {
    return job;
  }
  const now = new Date().toISOString();
  let next = { ...job };

  if (job.state === 'PARTIAL_FAILURE_RETRYABLE') {
    const domainSteps = { ...job.domainSteps };
    for (const source of ALL_USER_OWNED_DOMAIN_SOURCES) {
      if (domainSteps[source].status === 'FAILED_RETRYABLE') {
        domainSteps[source] = {
          ...domainSteps[source],
          status: 'IN_PROGRESS',
          lastError: undefined,
          updatedAtIso: now,
        };
      }
    }
    if (job.mediaStep.status === 'FAILED_RETRYABLE') {
      next = {
        ...next,
        mediaStep: { ...job.mediaStep, status: 'IN_PROGRESS', lastError: undefined, updatedAtIso: now },
      };
    }
    if (job.authStep.status === 'FAILED_RETRYABLE') {
      next = {
        ...next,
        authStep: { ...job.authStep, status: 'PENDING', lastError: undefined, updatedAtIso: now },
      };
    }
    next = {
      ...next,
      domainSteps,
      lastFailureReason: null,
    };
  }

  return next;
}

export async function ensureDeletionWriteBlock(
  store: DurableAccountLifecycleStore,
  job: DurableAccountDeletionJob,
): Promise<void> {
  const existing = await store.getWriteBlock(job.targetUid);
  const nowIso = new Date().toISOString();
  const record: DurableUserWriteBlockRecord = {
    targetUid: job.targetUid,
    state: 'WRITE_BLOCKED_DELETION_IN_PROGRESS',
    activeDeletionJobId: job.jobId,
    blockedAtIso: existing?.blockedAtIso ?? job.createdAtIso,
    updatedAtIso: nowIso,
    reason: `Executing deletion job ${job.jobId}`,
    revision: (existing?.revision ?? 0) + 1,
  };
  await store.upsertWriteBlock(record);
}

export function allDependentDomainStepsCompleted(job: DurableAccountDeletionJob): boolean {
  for (const source of [...DEPENDENT_PURGE_SOURCES, ...RETENTION_POLICY_SOURCES]) {
    if (job.domainSteps[source].status !== 'COMPLETED') return false;
  }
  return job.mediaStep.status === 'COMPLETED';
}

export function legacySupplementSucceeded(result: LegacyFirestoreSupplementResult): boolean {
  return (
    result.userPrefsOk &&
    result.votesOk &&
    result.firestoreBargainsOk &&
    result.alertsReconcileOk
  );
}

export function nextResumePhaseSource(job: DurableAccountDeletionJob): UserOwnedDomainSource | null {
  for (const source of DEPENDENT_PURGE_SOURCES) {
    if (job.domainSteps[source].status !== 'COMPLETED') return source;
  }
  return null;
}