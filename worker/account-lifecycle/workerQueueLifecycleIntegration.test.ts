/**
 * Local MessageBatch lifecycle queue integration (Stage D hardening).
 */

import assert from 'node:assert/strict';
import { processRadarQueueBatch } from '../queues/queueAndCronProcessor.ts';
import type { MessageBatch } from '../types.ts';
import { InMemoryAccountLifecycleD1 } from './inMemoryAccountLifecycleD1.ts';
import { ACCOUNT_LIFECYCLE_QUEUE_JOB_TYPE, buildLifecycleQueueIdempotencyKey } from './lifecycleQueueContract.ts';

interface MockMessage<T> {
  id: string;
  timestamp: Date;
  attempts: number;
  body: T;
  ack: () => void;
  retry: (opts?: { delaySeconds?: number }) => void;
}

function createMockBatch(messages: MockMessage<unknown>[]): MessageBatch<unknown> {
  return {
    messages,
    queue: 'RADAR_QUEUE',
    retryAll: (_options?: { delaySeconds?: number }) => undefined,
    ackAll: () => undefined,
  };
}

async function run(): Promise<void> {
  const db = new InMemoryAccountLifecycleD1();
  const envelope = {
    schemaVersion: '1.0',
    messageId: 'msg_int_1',
    idempotencyKey: buildLifecycleQueueIdempotencyKey('deljob_missing', 'q1'),
    jobType: ACCOUNT_LIFECYCLE_QUEUE_JOB_TYPE,
    createdAtIso: new Date().toISOString(),
    correlationId: 'corr_int_1',
    payload: { jobId: 'deljob_missing', targetUid: 'u_test', operation: 'DELETION_STEP' },
  };

  let acked = false;
  let retried = false;
  const batch = createMockBatch([
    {
      id: 'm1',
      timestamp: new Date(),
      attempts: 1,
      body: envelope,
      ack() {
        acked = true;
      },
      retry() {
        retried = true;
      },
    },
  ]);

  const summary = await processRadarQueueBatch({
    batch,
    db,
    executeJob: async () => {
      throw new Error('UNSUPPORTED_LIFECYCLE_QUEUE_JOB_MUST_NOT_EXECUTE');
    },
    leaseOwner: 'integration_test',
    nowMs: Date.now(),
  });

  assert.equal(summary.processedCount, 0);
  assert.equal(summary.retriedCount, 1);
  assert.equal(summary.failedCount, 1);
  assert.equal(acked, false);
  assert.equal(retried, true, 'Unsupported lifecycle work must be retried, never silently acknowledged');
  console.log('workerQueueLifecycleIntegration.test.ts: PASSED (unsupported lifecycle job fails closed)');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});