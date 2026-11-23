/**
 * Stage D — lifecycle queue contract, dispatch lease unit tests (in-memory D1).
 */

import assert from 'node:assert/strict';
import { validateLifecycleQueuePayload, buildLifecycleQueueIdempotencyKey } from './lifecycleQueueContract.ts';
import { validateQueueEnvelope } from '../queues/queueAndCronProcessor.ts';
import { D1AccountLifecycleDispatch } from './d1LifecycleDispatch.ts';
import { InMemoryAccountLifecycleD1 } from './inMemoryAccountLifecycleD1.ts';
import { calculateLifecycleRecoveryOffset } from './stageDLifecycleRuntime.ts';

async function run(): Promise<void> {
  assert.equal(calculateLifecycleRecoveryOffset(40, 50, 0), 0);
  assert.equal(calculateLifecycleRecoveryOffset(120, 50, 0), 0);
  assert.equal(calculateLifecycleRecoveryOffset(120, 50, 1), 50);
  assert.equal(calculateLifecycleRecoveryOffset(120, 50, 2), 100);
  assert.equal(calculateLifecycleRecoveryOffset(120, 50, 3), 30);
  assert.equal(calculateLifecycleRecoveryOffset(0, 50, 99), 0);
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
  assert.equal(v.valid, true);

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

  const leaseAfterExpiry = await dispatch.acquireJobLease({
    jobId: 'deljob_u1',
    targetUid: 'u1',
    leaseToken: 'tok_c',
    leaseOwner: 'worker_c',
    nowMs: Date.now() + 121_000,
  });
  assert.equal(leaseAfterExpiry.acquired, true);
  assert.equal(leaseAfterExpiry.fencingRevision, 2);
  assert.equal(await dispatch.verifyJobLease('deljob_u1', 'tok_c', 2, Date.now() + 121_001), true);

  const pending = await dispatch.listPendingDispatch(10, new Date(Date.now() + 1_000).toISOString());
  assert.equal(pending.length, 1);
  assert.equal(await dispatch.markDispatchSent(idem, new Date().toISOString()), true);
  assert.equal((await dispatch.listPendingDispatch(10, new Date(Date.now() + 1_000).toISOString())).length, 0);

  const failedKey = buildLifecycleQueueIdempotencyKey('deljob_u1', 'retry');
  await dispatch.enqueueDispatchEvent({
    eventId: 'evt2',
    jobId: 'deljob_u1',
    targetUid: 'u1',
    operationType: 'DELETION_STEP',
    idempotencyKey: failedKey,
    correlationId: 'c2',
    createdAtIso: new Date().toISOString(),
  });
  await dispatch.markDispatchFailed(failedKey, new Date().toISOString(), new Date(Date.now() + 30_000).toISOString(), 'QUEUE_UNAVAILABLE');
  assert.equal((await dispatch.listPendingDispatch(10, new Date(Date.now() + 10_000).toISOString())).length, 0);
  assert.equal((await dispatch.listPendingDispatch(10, new Date(Date.now() + 31_000).toISOString())).length, 1);

  const raceDb = new InMemoryAccountLifecycleD1();
  const raceDispatch = new D1AccountLifecycleDispatch(raceDb);
  const raceNow = Date.now();
  const claims = await Promise.all([
    raceDispatch.acquireJobLease({ jobId: 'deljob_race', targetUid: 'u1', leaseToken: 'race_a', leaseOwner: 'a', nowMs: raceNow }),
    raceDispatch.acquireJobLease({ jobId: 'deljob_race', targetUid: 'u1', leaseToken: 'race_b', leaseOwner: 'b', nowMs: raceNow }),
  ]);
  assert.equal(claims.filter((claim) => claim.acquired).length, 1, 'only one concurrent first-lease claimant may win');

  console.log('RT-ACCOUNT-LIFECYCLE-WORKERS-001-D phase tests: PASSED');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});