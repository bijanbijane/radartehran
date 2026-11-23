/**
 * Local MessageBatch lifecycle queue integration (Stage D hardening).
 */

import assert from 'node:assert/strict';
import { processRadarQueueBatch } from '../queues/queueAndCronProcessor.ts';
import { createCanonicalQueueJobDispatcher } from '../queues/jobDispatcher.ts';
import type { RadarQueueEnvelope } from '../queues/queueAndCronProcessor.ts';
import type { MessageBatch } from '../types.ts';
import { InMemoryAccountLifecycleD1 } from './inMemoryAccountLifecycleD1.ts';
import { buildLifecycleQueueIdempotencyKey } from './lifecycleQueueContract.ts';
import { AccountLifecycleError } from '../../server/modules/account-lifecycle/types.ts';

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
  const env = { DB: db } as import('../types.ts').WorkerEnv;

  const envelope: RadarQueueEnvelope = {
    schemaVersion: '1.0',
    messageId: 'msg_int_1',
    idempotencyKey: buildLifecycleQueueIdempotencyKey('deljob_missing', 'q1'),
    jobType: 'account_lifecycle_deletion_step',
    createdAtIso: new Date().toISOString(),
    correlationId: 'corr_int_1',
    payload: { jobId: 'deljob_missing', targetUid: 'u_test', operation: 'DELETION_STEP' },
  };

  // USER_DB is required in the valid dual-D1 Stage D topology. The dispatcher
  // must delegate configuration and schema checks to the Stage D runtime.
  const userDbOnlyEnv = {
    USER_DB: {} as import('../types.ts').WorkerEnv['USER_DB'],
    RADAR_QUEUE: { async send() {} },
  } as import('../types.ts').WorkerEnv;
  await assert.rejects(
    () => createCanonicalQueueJobDispatcher(userDbOnlyEnv)(envelope),
    (error: unknown) =>
      error instanceof AccountLifecycleError && error.code === 'STORE_UNAVAILABLE',
  );

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
    executeJob: createCanonicalQueueJobDispatcher(env),
    leaseOwner: 'integration_test',
    nowMs: Date.now(),
  });

  assert.equal(summary.processedCount + summary.failedCount + summary.retriedCount, 1);
  assert.ok(acked || retried, 'Message must be acked or retried after processing');
  console.log('workerQueueLifecycleIntegration.test.ts: PASSED (local MessageBatch dispatch)');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});