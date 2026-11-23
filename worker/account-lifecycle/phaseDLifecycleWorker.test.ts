/**
 * Stage D — lifecycle queue contract, dispatch lease unit tests (in-memory D1).
 */

import assert from 'node:assert/strict';
import { validateLifecycleQueuePayload, buildLifecycleQueueIdempotencyKey } from './lifecycleQueueContract.ts';
import { validateQueueEnvelope } from '../queues/queueAndCronProcessor.ts';
import { D1AccountLifecycleDispatch } from './d1LifecycleDispatch.ts';
import { InMemoryAccountLifecycleD1 } from './inMemoryAccountLifecycleD1.ts';

async function run(): Promise<void> {
  const ok = validateLifecycleQueuePayload({
    jobId: 'deljob_u1',
    targetUid: 'u1',
    operation: 'DELETION_STEP',
  });
  assert.equal(ok.ok, true);

  const bad = validateLifecycleQueuePayload({ jobId: 'x', operation: 'NOPE' });
  assert.equal(bad.ok, false);

  const idem = buildLifecycleQueueIdempotencyKey('deljob_u1', 'step1');
  const envelope = {
    schemaVersion: '1.0' as const,
    messageId: 'msg_1',
    idempotencyKey: idem,
    jobType: 'account_lifecycle_deletion_step' as const,
    createdAtIso: new Date().toISOString(),
    correlationId: 'corr_1',
    payload: { jobId: 'deljob_u1', targetUid: 'u1', operation: 'DELETION_STEP' as const },
  };
  const v = validateQueueEnvelope(envelope);
  assert.equal(v.valid, false);
  if (v.valid === false) {
    assert.equal(v.reason, 'UNKNOWN_OR_UNSUPPORTED_JOB_TYPE');
  }

  const db = new InMemoryAccountLifecycleD1();
  const dispatch = new D1AccountLifecycleDispatch(db);
  const now = new Date().toISOString();
  const inserted = await dispatch.enqueueDispatchEvent({
    eventId: 'evt1',
    jobId: 'deljob_u1',
    targetUid: 'u1',
    operationType: 'DELETION_STEP',
    idempotencyKey: idem,
    correlationId: 'c1',
    createdAtIso: now,
  });
  assert.equal(inserted.inserted, true);

  const lease = await dispatch.acquireJobLease({
    jobId: 'deljob_u1',
    targetUid: 'u1',
    leaseToken: 'tok_a',
    leaseOwner: 'worker_a',
    nowMs: Date.now(),
  });
  assert.equal(lease.acquired, true);

  const leaseB = await dispatch.acquireJobLease({
    jobId: 'deljob_u1',
    targetUid: 'u1',
    leaseToken: 'tok_b',
    leaseOwner: 'worker_b',
    nowMs: Date.now(),
  });
  assert.equal(leaseB.acquired, false);

  console.log('RT-ACCOUNT-LIFECYCLE-WORKERS-001-D phase tests: PASSED');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});