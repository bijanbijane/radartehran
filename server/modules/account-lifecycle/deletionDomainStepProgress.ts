/**
 * Pure domain-step cursor/receipt aggregation for one batch (CV).
 */

import type { BatchDispositionResult, DurableAccountDeletionJob, UserOwnedDomainSource } from './types.ts';
import { assertValidAccountDeletionStateTransition } from './stateMachine.ts';

export function applyDomainStepProgress(params: {
  job: DurableAccountDeletionJob;
  source: UserOwnedDomainSource;
  phaseState: 'PURGING_DEPENDENT_RECORDS' | 'APPLYING_RETENTION_POLICIES';
  batchResult: BatchDispositionResult;
  batchIndex: number;
}): DurableAccountDeletionJob {
  const now = new Date().toISOString();
  const prevStep = params.job.domainSteps[params.source];
  const deletedSet = new Set(prevStep.permanentlyDeletedIds);
  const retainedMap = new Map(prevStep.retainedRecords.map((r) => [r.recordId, r]));

  for (const receipt of params.batchResult.receipts) {
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

  assertValidAccountDeletionStateTransition(params.job.state, params.phaseState);

  return {
    ...params.job,
    state: params.phaseState,
    updatedAtIso: now,
    domainSteps: {
      ...params.job.domainSteps,
      [params.source]: {
        ...prevStep,
        status: !params.batchResult.hasMore ? 'COMPLETED' : 'IN_PROGRESS',
        resumableCursor: params.batchResult.nextCursor,
        batchesProcessed: params.batchIndex,
        permanentlyDeletedIds: Array.from(deletedSet),
        retainedRecords: Array.from(retainedMap.values()),
        attempts: prevStep.attempts + 1,
        lastError: undefined,
        updatedAtIso: now,
      },
    },
  };
}