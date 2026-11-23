/**
 * Durable batch receipt + job cursor atomic persistence (CV hardening).
 */

import type { DurableAccountDeletionJob } from './types.ts';
import type { DurableAccountLifecycleStore } from './storeContract.ts';

export type BatchReceiptExecutionStatus = 'COMPLETED' | 'FAILED_RETRYABLE';

export interface PersistedBatchReceiptRow {
  receiptId: string;
  jobId: string;
  targetUid: string;
  domainSource: string | null;
  idempotencyKey: string;
  batchCursor: string | null;
  outcomeJson: string;
  recordedAtIso: string;
  status: BatchReceiptExecutionStatus;
  completedAtIso: string | null;
}

export interface CommitJobProgressWithBatchReceiptParams {
  jobId: string;
  expectedRevision: number;
  updater: (current: DurableAccountDeletionJob) => DurableAccountDeletionJob;
  receipt: {
    receiptId: string;
    idempotencyKey: string;
    domainSource: string | null;
    batchCursor: string | null;
    outcomeJson: string;
    recordedAtIso: string;
    status: BatchReceiptExecutionStatus;
    completedAtIso: string;
  };
}

export interface AccountLifecycleBatchPersistingStore extends DurableAccountLifecycleStore {
  getBatchReceiptByIdempotencyKey(idempotencyKey: string): Promise<PersistedBatchReceiptRow | null>;
  commitJobProgressWithBatchReceipt(
    params: CommitJobProgressWithBatchReceiptParams,
  ): Promise<{ job: DurableAccountDeletionJob; receiptInserted: boolean }>;
}

export function isBatchPersistingStore(
  store: DurableAccountLifecycleStore,
): store is AccountLifecycleBatchPersistingStore {
  const candidate = store as AccountLifecycleBatchPersistingStore;
  return (
    typeof candidate.getBatchReceiptByIdempotencyKey === 'function' &&
    typeof candidate.commitJobProgressWithBatchReceipt === 'function'
  );
}