/**
 * D1-backed batch and execution receipt recorder (Workers path).
 */

import type {
  AccountDeletionBatchReceiptRecorder,
  BatchReceiptRecordParams,
  ExecutionReceiptRecordParams,
} from '../../server/modules/account-lifecycle/batchReceiptRecorder.ts';
import { buildBatchIdempotencyKey as buildKey } from '../../server/modules/account-lifecycle/batchReceiptRecorder.ts';
import type { D1AccountLifecycleStore } from './d1AccountLifecycleStore.ts';
import * as Q from './d1Queries.ts';

export class D1AccountDeletionBatchReceiptRecorder implements AccountDeletionBatchReceiptRecorder {
  constructor(private readonly store: D1AccountLifecycleStore) {}

  public async recordDomainBatchIfAbsent(
    params: BatchReceiptRecordParams,
  ): Promise<{ inserted: boolean; receiptId: string }> {
    const idem = buildKey(params.jobId, params.domainSource, params.batchIndex, params.cursor);
    const receiptId = `brcp_${idem.replace(/[^a-zA-Z0-9:_-]/g, '_').slice(0, 120)}`;
    return this.store.recordBatchReceiptIdempotent({
      receiptId,
      jobId: params.jobId,
      targetUid: params.targetUid,
      domainSource: params.domainSource,
      idempotencyKey: idem,
      batchCursor: params.cursor,
      outcomeJson: JSON.stringify({ receipts: params.receipts }),
      recordedAtIso: params.recordedAtIso,
    });
  }

  public async recordExecutionReceipt(params: ExecutionReceiptRecordParams): Promise<void> {
    await this.store.recordExecutionReceiptIdempotent({
      receiptId: `exrcpt_${params.jobId}`,
      jobId: params.jobId,
      targetUid: params.targetUid,
      status: params.status,
      receiptJson: JSON.stringify({
        jobState: params.jobState,
        detailRedacted: params.detailRedacted,
      }),
      recordedAtIso: params.recordedAtIso,
    });
  }
}