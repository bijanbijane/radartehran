/**
 * Stage D — lifecycle queue contract, dispatch lease unit tests (in-memory D1).
 */

import assert from 'node:assert/strict';
import { validateLifecycleQueuePayload, buildLifecycleQueueIdempotencyKey } from './lifecycleQueueContract.ts';
import { validateQueueEnvelope } from '../queues/queueAndCronProcessor.ts';
import { D1AccountLifecycleDispatch } from './d1LifecycleDispatch.ts';
import { acquireD1MutationPermit, releaseD1MutationPermit, countActiveD1MutationPermits } from './d1WriteAdmissionPermit.ts';
import { SQL_UPSERT_WRITE_BLOCK } from './d1Queries.ts';
import { InMemoryAccountLifecycleD1 } from './inMemoryAccountLifecycleD1.ts';
import { calculateLifecycleRecoveryOffset, isStageDLifecycleEnabled, getStageDDeletionReadiness, assertStageDDeletionReady } from './stageDLifecycleRuntime.ts';
import type { WorkerEnv } from '../types.ts';

async function run(): Promise<void> {
  const lifecycleBinding = {} as WorkerEnv['DB'];
  const userBinding = {} as WorkerEnv['USER_DB'];
  const configuredStageEnv = {
    DB: lifecycleBinding,
    USER_DB: userBinding,
    STAGE_D_LIFECYCLE_ENABLED: 'true',
    STAGE_D_LIFECYCLE_DATABASE_ID: 'lifecycle-db-id',
    STAGE_D_USER_DATABASE_ID: 'user-db-id',
  } as WorkerEnv;
  assert.equal(isStageDLifecycleEnabled(configuredStageEnv), true);
  assert.equal(isStageDLifecycleEnabled({
    ...configuredStageEnv,
    USER_DB: lifecycleBinding,
  }), false);
  assert.equal(isStageDLifecycleEnabled({
    ...configuredStageEnv,
    STAGE_D_USER_DATABASE_ID: 'lifecycle-db-id',
  }), false);
  assert.equal(isStageDLifecycleEnabled({
    ...configuredStageEnv,
    STAGE_D_LIFECYCLE_ENABLED: 'false',
  }), false);
  assert.equal(isStageDLifecycleEnabled({
    ...configuredStageEnv,
    USER_DB: undefined,
  }), false);

  const provisionedBindingsButIncompleteAdapters = {
    ...configuredStageEnv,
    MEDIA_BUCKET: {} as NonNullable<WorkerEnv['MEDIA_BUCKET']>,
    R2_MEDIA_BUCKET_NAME: 'radartehran-staging-media',
  } as WorkerEnv;
  const deletionReadiness = getStageDDeletionReadiness(provisionedBindingsButIncompleteAdapters);
  assert.equal(deletionReadiness.ready, false);
  assert.ok(deletionReadiness.blockers.includes('DOMAIN_ERASURE_ADAPTER_NOT_READY:BARGAIN_LISTINGS'));
  assert.ok(deletionReadiness.blockers.includes('DOMAIN_ERASURE_ADAPTER_NOT_READY:USER_PROFILE'));
  assert.ok(deletionReadiness.blockers.includes('DOMAIN_ERASURE_ADAPTER_NOT_READY:MEDIA_METADATA'));
  assert.ok(deletionReadiness.blockers.includes('AUTH_IDENTITY_ERASURE_ADAPTER_NOT_READY'));
  assert.throws(
    () => assertStageDDeletionReady(provisionedBindingsButIncompleteAdapters),
    /Account deletion was not started because required erasure capabilities are unavailable/,
  );

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

  const permitNow = 1_800_000_000_000;
  const permit = await acquireD1MutationPermit({
    db,
    targetUid: 'uid_permit',
    holderId: 'worker_permit',
    routeSignature: 'POST /api/test-mutation',
    ttlMs: 5_000,
    nowMs: permitNow,
  });
  assert.ok(permit.permitId.startsWith('d1permit_'));
  assert.equal(
    await countActiveD1MutationPermits({ db, targetUid: 'uid_permit', nowMs: permitNow + 1 }),
    1,
  );
  const released = await releaseD1MutationPermit({
    db,
    targetUid: 'uid_permit',
    permitId: permit.permitId,
    nowMs: permitNow + 2,
  });
  assert.equal(released.released, true);
  assert.equal(
    await countActiveD1MutationPermits({ db, targetUid: 'uid_permit', nowMs: permitNow + 3 }),
    0,
  );

  const expiringPermit = await acquireD1MutationPermit({
    db,
    targetUid: 'uid_expiry',
    holderId: 'worker_expiry',
    routeSignature: 'POST /api/test-expiring-mutation',
    ttlMs: 1_000,
    nowMs: permitNow + 10_000,
  });
  assert.equal(
    await countActiveD1MutationPermits({ db, targetUid: 'uid_expiry', nowMs: permitNow + 11_000 }),
    0,
    'expired permits are durably marked before active-permit count is returned',
  );
  const expiryReplay = await releaseD1MutationPermit({
    db,
    targetUid: 'uid_expiry',
    permitId: expiringPermit.permitId,
    nowMs: permitNow + 11_001,
  });
  assert.equal(expiryReplay.released, false);

  const blockTime = new Date(permitNow + 20_000).toISOString();
  await db.prepare(SQL_UPSERT_WRITE_BLOCK).bind(
    'uid_blocked',
    'DELETION_IN_PROGRESS',
    'deljob_blocked',
    blockTime,
    blockTime,
    'ACCOUNT_DELETION_ACTIVE',
    1,
  ).run();
  await assert.rejects(
    () => acquireD1MutationPermit({
      db,
      targetUid: 'uid_blocked',
      holderId: 'worker_blocked',
      routeSignature: 'POST /api/blocked-mutation',
      nowMs: permitNow + 20_001,
    }),
    (error: unknown) =>
      error instanceof Error &&
      'code' in error &&
      error.code === 'ACCOUNT_WRITE_BLOCKED',
  );

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