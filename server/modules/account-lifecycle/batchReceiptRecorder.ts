/**
 * Durable batch + execution receipt recorders for deletion orchestration (Phase C).
 */

import type { RecordDispositionReceipt, UserOwnedDomainSource } from './types.ts';

export interface BatchReceiptRecordParams {
  jobId: string;
  targetUid: string;
  domainSource: UserOwnedDomainSource | 'MEDIA' | 'TELEMETRY' | 'LEGACY_FIRESTORE';
  batchIndex: number;
  cursor: string | null;
  receipts: RecordDispositionReceipt[];
  recordedAtIso: string;
}

export interface ExecutionReceiptRecordParams {
  jobId: string;
  targetUid: string;
  status: 'SUCCEEDED' | 'PARTIAL' | 'FAILED';
  jobState: string;
  recordedAtIso: string;
  detailRedacted: string;
}

export interface AccountDeletionBatchReceiptRecorder {
  recordDomainBatchIfAbsent(params: BatchReceiptRecordParams): Promise<{ inserted: boolean; receiptId: string }>;
  recordExecutionReceipt(params: ExecutionReceiptRecordParams): Promise<void>;
}

export function buildBatchIdempotencyKey(
  jobId: string,
  domainSource: BatchReceiptRecordParams['domainSource'],
  batchIndex: number,
  cursor: string | null,
): string {
  const cursorPart = cursor ?? '__START__';
  return `${jobId}:${domainSource}:${batchIndex}:${cursorPart}`;
}

export class InMemoryAccountDeletionBatchReceiptRecorder implements AccountDeletionBatchReceiptRecorder {
  private readonly batchKeys = new Set<string>();
  private readonly executionByJob = new Map<string, ExecutionReceiptRecordParams>();

  public async recordDomainBatchIfAbsent(
    params: BatchReceiptRecordParams,
  ): Promise<{ inserted: boolean; receiptId: string }> {
    const idem = buildBatchIdempotencyKey(params.jobId, params.domainSource, params.batchIndex, params.cursor);
    if (this.batchKeys.has(idem)) {
      return { inserted: false, receiptId: `mem_${idem}` };
    }
    this.batchKeys.add(idem);
    return { inserted: true, receiptId: `mem_${idem}` };
  }

  public async recordExecutionReceipt(params: ExecutionReceiptRecordParams): Promise<void> {
    this.executionByJob.set(params.jobId, params);
  }

  public getExecutionReceipt(jobId: string): ExecutionReceiptRecordParams | undefined {
    return this.executionByJob.get(jobId);
  }

  public hasBatchKey(idem: string): boolean {
    return this.batchKeys.has(idem);
  }
}

export class NoOpAccountDeletionBatchReceiptRecorder implements AccountDeletionBatchReceiptRecorder {
  public async recordDomainBatchIfAbsent(
    params: BatchReceiptRecordParams,
  ): Promise<{ inserted: boolean; receiptId: string }> {
    const idem = buildBatchIdempotencyKey(params.jobId, params.domainSource, params.batchIndex, params.cursor);
    return { inserted: true, receiptId: `noop_${idem}` };
  }

  public async recordExecutionReceipt(): Promise<void> {
    return;
  }
}