/**
 * D1 account lifecycle persistence integration tests (in-memory D1 engine).
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createInitialDomainSteps } from '../../server/modules/account-lifecycle/durableJobStore.ts';
import { AccountLifecycleError } from '../../server/modules/account-lifecycle/types.ts';
import { AccountLifecycleStoreError } from '../../server/modules/account-lifecycle/storeContract.ts';
import { FirestoreAndJournalAccountLifecycleStore } from '../../server/modules/account-lifecycle/durableJobStore.ts';
import { AccountDeletionOrchestrator } from '../../server/modules/account-lifecycle/deletionOrchestrator.ts';
import { InMemoryOrBackedDomainRepositoryAdapter } from '../../server/modules/account-lifecycle/moduleAdapters.ts';
import { ConfigurableAuthIdentityDeletionAdapter } from '../../server/modules/account-lifecycle/moduleAdapters.ts';
import type { DurableAccountDeletionJob, MediaDeletionCoordinationAdapter } from '../../server/modules/account-lifecycle/types.ts';
import { D1AccountLifecycleStore } from './d1AccountLifecycleStore.ts';
import { InMemoryAccountLifecycleD1 } from './inMemoryAccountLifecycleD1.ts';

function sampleJob(targetUid: string, jobId: string): DurableAccountDeletionJob {
  const now = new Date().toISOString();
  return {
    jobId,
    targetUid,
    requestedByUid: targetUid,
    reason: 'USER_REQUESTED',
    state: 'INITIATED_WRITE_BLOCKED',
    writeBlockEnforced: true,
    domainSteps: createInitialDomainSteps(now),
    mediaStep: {
      status: 'PENDING',
      resumableCursor: null,
      deletedObjectIds: [],
      pendingRetryObjectIds: [],
      attempts: 0,
      updatedAtIso: now,
    },
    authStep: {
      status: 'PENDING',
      deletedAtIso: null,
      attempts: 0,
      updatedAtIso: now,
    },
    totalAttempts: 0,
    createdAtIso: now,
    updatedAtIso: now,
    completedAtIso: null,
    lastFailureReason: null,
    revision: 1,
  };
}

async function run(): Promise<void> {
  const db = new InMemoryAccountLifecycleD1();
  const store = new D1AccountLifecycleStore(db);
  const uid = 'user_d1_alpha';

  const health = await store.probeHealth();
  assert.equal(health.health, 'HEALTHY');

  const job = sampleJob(uid, 'deljob_user_d1_alpha_001');
  const created = await store.createOrGetActiveJob(job);
  assert.equal(created.createdNew, true);
  const block = await store.getWriteBlock(uid);
  assert.ok(block);
  assert.equal(block?.activeDeletionJobId, job.jobId);
  assert.equal(block?.state, 'WRITE_BLOCKED_DELETION_IN_PROGRESS');

  const reread = await store.getJobById(job.jobId);
  assert.ok(reread);
  assert.equal(reread?.revision, 1);
  assert.equal(reread?.domainSteps.BARGAIN_LISTINGS.resumableCursor, null);

  const saved = await store.saveJobProgress(job.jobId, 1, (curr) => ({
    ...curr,
    state: 'PURGING_DEPENDENT_RECORDS',
    updatedAtIso: new Date().toISOString(),
    domainSteps: {
      ...curr.domainSteps,
      BARGAIN_LISTINGS: {
        ...curr.domainSteps.BARGAIN_LISTINGS,
        resumableCursor: 'cursor_batch_1',
        batchesProcessed: 1,
        status: 'IN_PROGRESS',
        updatedAtIso: new Date().toISOString(),
      },
    },
  }));
  assert.equal(saved.revision, 2);
  assert.equal(saved.domainSteps.BARGAIN_LISTINGS.resumableCursor, 'cursor_batch_1');

  await assert.rejects(
    () => store.saveJobProgress(job.jobId, 1, (c) => c),
    (err: unknown) => err instanceof AccountLifecycleError && err.code === 'CONCURRENT_MODIFICATION_CONFLICT',
  );

  const duplicate = await store.createOrGetActiveJob(sampleJob(uid, 'deljob_user_d1_alpha_002'));
  assert.equal(duplicate.createdNew, false);
  assert.equal(duplicate.job.jobId, job.jobId);

  const idemKey = `${job.jobId}:BARGAIN_LISTINGS:batch:1`;
  const firstReceipt = await store.recordBatchReceiptIdempotent({
    receiptId: 'rcp_1',
    jobId: job.jobId,
    targetUid: uid,
    domainSource: 'BARGAIN_LISTINGS',
    idempotencyKey: idemKey,
    batchCursor: 'cursor_batch_1',
    outcomeJson: '{"deleted":2}',
    recordedAtIso: new Date().toISOString(),
  });
  assert.equal(firstReceipt.inserted, true);
  const dupReceipt = await store.recordBatchReceiptIdempotent({
    receiptId: 'rcp_2',
    jobId: job.jobId,
    targetUid: uid,
    domainSource: 'BARGAIN_LISTINGS',
    idempotencyKey: idemKey,
    batchCursor: 'cursor_batch_1',
    outcomeJson: '{"deleted":2}',
    recordedAtIso: new Date().toISOString(),
  });
  assert.equal(dupReceipt.inserted, false);
  assert.equal(dupReceipt.receiptId, 'rcp_1');

  const restarted = new D1AccountLifecycleStore(db);
  const recovered = await restarted.getJobById(job.jobId);
  assert.equal(recovered?.revision, 2);
  assert.equal(recovered?.domainSteps.BARGAIN_LISTINGS.resumableCursor, 'cursor_batch_1');

  const continuable = await restarted.listContinuableDeletionJobs(10, 0);
  assert.ok(continuable.some((j) => j.jobId === job.jobId));

  await assert.rejects(
    () =>
      new D1AccountLifecycleStore(null as unknown as InMemoryAccountLifecycleD1).createOrGetActiveJob(
        sampleJob('no_db', 'deljob_no_db'),
      ),
    (err: unknown) => err instanceof AccountLifecycleStoreError,
  );

  const raceDb = new InMemoryAccountLifecycleD1();
  const raceStore = new D1AccountLifecycleStore(raceDb);
  const uid2 = 'user_d1_concurrent';
  const raceFirst = await raceStore.createOrGetActiveJob(sampleJob(uid2, 'deljob_c1'));
  assert.equal(raceFirst.createdNew, true);
  const raceSecond = await raceStore.createOrGetActiveJob(sampleJob(uid2, 'deljob_c2'));
  assert.equal(raceSecond.createdNew, false);
  assert.equal(raceSecond.job.jobId, raceFirst.job.jobId);


  const blockBeforeFail = await store.getWriteBlock(uid);
  await assert.rejects(
    () => store.saveJobProgress(job.jobId, 99, (c) => ({ ...c, state: 'COMPLETED' })),
    (err: unknown) => err instanceof AccountLifecycleError,
  );
  const blockAfterFail = await store.getWriteBlock(uid);
  assert.equal(blockAfterFail?.revision, blockBeforeFail?.revision);
  assert.equal(blockAfterFail?.state, blockBeforeFail?.state);

  const emptyMedia: MediaDeletionCoordinationAdapter = {
    async listOwnedMediaPage() {
      return { mediaItems: [], nextCursor: null, hasMore: false };
    },
    async deleteOwnedMediaObject() {
      return { objectId: 'x', status: 'ALREADY_DELETED' };
    },
  };
  const orchestrator = new AccountDeletionOrchestrator({
    store,
    domainAdapters: [new InMemoryOrBackedDomainRepositoryAdapter('USER_PROFILE', [])],
    mediaAdapter: emptyMedia,
    authAdapter: new ConfigurableAuthIdentityDeletionAdapter(async () => undefined),
  });
  const actor = { uid, isAdmin: false, freshAuthVerified: true };
  const executed = await orchestrator.executeDeletionJob(actor, job.jobId, { batchSize: 5, maxBatchesPerInvocation: 5 });
  assert.ok(executed.revision >= 2);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acl-journal-corrupt-'));
  const corruptPath = path.join(tmpDir, 'journal.json');
  fs.writeFileSync(corruptPath, '{ not-json', 'utf8');
  const journalStore = new FirestoreAndJournalAccountLifecycleStore({
    durableJournalPath: corruptPath,
    enableFirestoreSync: false,
  });
  await assert.rejects(
    () => journalStore.getJobById('any'),
    (err: unknown) => err instanceof AccountLifecycleStoreError && err.code === 'STORE_SNAPSHOT_CORRUPT',
  );

  console.log('D1 account lifecycle persistence tests: 20 scenarios PASSED');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});