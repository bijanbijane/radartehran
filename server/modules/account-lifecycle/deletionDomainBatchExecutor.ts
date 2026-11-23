/**
 * Crash-safe domain batch execution: receipt-before-cursor skip, atomic D1 commit (CV).
 */

import type { BatchDispositionResult, DurableAccountDeletionJob, UserOwnedDomainSource } from './types.ts';
import type { DurableAccountLifecycleStore } from './storeContract.ts';
import type { AccountDeletionBatchReceiptRecorder } from './batchReceiptRecorder.ts';
import { buildBatchIdempotencyKey } from './batchReceiptRecorder.ts';
import { isBatchPersistingStore } from './batchPersistenceContract.ts';
import { applyDomainStepProgress } from './deletionDomainStepProgress.ts';

export function parseBatchOutcomeJson(outcomeJson: string): BatchDispositionResult {
  const parsed = JSON.parse(outcomeJson) as { receipts?: BatchDispositionResult['receipts']; nextCursor?: string | null; hasMore?: boolean };
  if (parsed.receipts && typeof parsed.hasMore === 'boolean') {
    return {
      receipts: parsed.receipts,
      nextCursor: parsed.nextCursor ?? null,
      hasMore: parsed.hasMore,
    };
  }
  return {
    receipts: parsed.receipts ?? [],
    nextCursor: null,
    hasMore: false,
  };
}

export function buildDomainBatchOutcomeJson(batchResult: BatchDispositionResult): string {
  return JSON.stringify({
    receipts: batchResult.receipts,
    nextCursor: batchResult.nextCursor,
    hasMore: batchResult.hasMore,
  });
}

export async function executeDomainBatchCrashSafe(params: {
  store: DurableAccountLifecycleStore;
  batchReceiptRecorder: AccountDeletionBatchReceiptRecorder;
  job: DurableAccountDeletionJob;
  source: UserOwnedDomainSource;
  phaseState: 'PURGING_DEPENDENT_RECORDS' | 'APPLYING_RETENTION_POLICIES';
  batchSize: number;
  disposeBatch: (cursor: string | null) => Promise<BatchDispositionResult>;
}): Promise<{ job: DurableAccountDeletionJob; batchResult: BatchDispositionResult; usedPersistedReceipt: boolean }> {
  const step = params.job.domainSteps[params.source];
  const batchIndex = step.batchesProcessed + 1;
  const idempotencyKey = buildBatchIdempotencyKey(params.job.jobId, params.source, batchIndex, step.resumableCursor);
  const recordedAtIso = new Date().toISOString();

  let batchResult: BatchDispositionResult | null = null;
  let usedPersistedReceipt = false;

  if (isBatchPersistingStore(params.store)) {
    const persisted = await params.store.getBatchReceiptByIdempotencyKey(idempotencyKey);
    if (persisted && persisted.status === 'COMPLETED') {
      batchResult = parseBatchOutcomeJson(persisted.outcomeJson);
      usedPersistedReceipt = true;
    }
  }

  if (!batchResult) {
    batchResult = await params.disposeBatch(step.resumableCursor);
  }

  const receiptId = `brcp_${idempotencyKey.replace(/[^a-zA-Z0-9:_-]/g, '_').slice(0, 120)}`;
  const outcomeJson = buildDomainBatchOutcomeJson(batchResult);

  if (isBatchPersistingStore(params.store)) {
    const committed = await params.store.commitJobProgressWithBatchReceipt({
      jobId: params.job.jobId,
      expectedRevision: params.job.revision,
      receipt: {
        receiptId,
        idempotencyKey,
        domainSource: params.source,
        batchCursor: step.resumableCursor,
        outcomeJson,
        recordedAtIso,
        status: 'COMPLETED',
        completedAtIso: recordedAtIso,
      },
      updater: (curr) =>
        applyDomainStepProgress({
          job: curr,
          source: params.source,
          phaseState: params.phaseState,
          batchResult,
          batchIndex,
        }),
    });
    return { job: committed.job, batchResult, usedPersistedReceipt };
  }

  await params.batchReceiptRecorder.recordDomainBatchIfAbsent({
    jobId: params.job.jobId,
    targetUid: params.job.targetUid,
    domainSource: params.source,
    batchIndex,
    cursor: step.resumableCursor,
    receipts: batchResult.receipts,
    recordedAtIso,
  });

  const job = await params.store.saveJobProgress(params.job.jobId, params.job.revision, (curr) =>
    applyDomainStepProgress({
      job: curr,
      source: params.source,
      phaseState: params.phaseState,
      batchResult,
      batchIndex,
    }),
  );

  return { job, batchResult, usedPersistedReceipt };
}