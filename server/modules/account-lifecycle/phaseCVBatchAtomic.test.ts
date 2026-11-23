/**
 * CV — atomic batch receipt + cursor, crash-safe resume without double-delete.
 */

import assert from 'node:assert/strict';
import { createInitialDomainSteps } from './durableJobStore.ts';
import { buildBatchIdempotencyKey } from './batchReceiptRecorder.ts';
import { executeDomainBatchCrashSafe, buildDomainBatchOutcomeJson } from './deletionDomainBatchExecutor.ts';
import { InMemoryOrBackedDomainRepositoryAdapter } from './moduleAdapters.ts';
import type { BatchDispositionResult, DurableAccountDeletionJob } from './types.ts';
import { D1AccountLifecycleStore } from '../../../worker/account-lifecycle/d1AccountLifecycleStore.ts';
import { InMemoryAccountDeletionBatchReceiptRecorder } from './batchReceiptRecorder.ts';
import { InMemoryAccountLifecycleD1 } from '../../../worker/account-lifecycle/inMemoryAccountLifecycleD1.ts';
import { uncoveredDomainSources } from './domainAdapterCoverageMatrix.ts';

function job(uid: string): DurableAccountDeletionJob {
  const now = new Date().toISOString();
  return {
    jobId: `deljob_${uid}_cv`,
    targetUid: uid,
    requestedByUid: uid,
    reason: 'CV_TEST',
    state: 'PURGING_DEPENDENT_RECORDS',
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
    authStep: { status: 'PENDING', deletedAtIso: null, attempts: 0, updatedAtIso: now },
    totalAttempts: 1,
    createdAtIso: now,
    updatedAtIso: now,
    completedAtIso: null,
    lastFailureReason: null,
    revision: 2,
  };
}

async function run(): Promise<void> {
  assert.equal(uncoveredDomainSources().length, 0);

  const uid = 'user_cv_atomic';
  const db = new InMemoryAccountLifecycleD1();
  const store = new D1AccountLifecycleStore(db);
  const now = new Date().toISOString();
  const created = await store.createOrGetActiveJob({
    ...job(uid),
    state: 'INITIATED_WRITE_BLOCKED',
    revision: 1,
    createdAtIso: now,
    updatedAtIso: now,
  });
  assert.equal(created.createdNew, true);

  let disposeCalls = 0;
  const adapter = new InMemoryOrBackedDomainRepositoryAdapter('USER_PROFILE', [
    {
      recordId: 'p1',
      ownerUid: uid,
      source: 'USER_PROFILE',
      createdAtIso: new Date().toISOString(),
      retentionClass: 'STANDARD_PURGEABLE',
      payload: {},
    },
  ]);

  let current = await store.getJobById(created.job.jobId);
  assert.ok(current);
  const batchResult: BatchDispositionResult = {
    receipts: [
      {
        recordId: 'p1',
        source: 'USER_PROFILE',
        outcome: 'PERMANENTLY_DELETED',
        processedAtIso: new Date().toISOString(),
      },
    ],
    nextCursor: null,
    hasMore: false,
  };

  const first = await executeDomainBatchCrashSafe({
    store,
    batchReceiptRecorder: new InMemoryAccountDeletionBatchReceiptRecorder(),
    job: current,
    source: 'USER_PROFILE',
    phaseState: 'PURGING_DEPENDENT_RECORDS',
    batchSize: 10,
    disposeBatch: async () => {
      disposeCalls += 1;
      return adapter.disposeOwnedRecordsBatch({
        targetUid: uid,
        cursor: null,
        batchSize: 10,
        jobId: current!.jobId,
      });
    },
  });
  current = first.job;
  assert.equal(disposeCalls, 1);
  assert.equal(current.domainSteps.USER_PROFILE.status, 'COMPLETED');
  assert.equal(current.revision, 2);

  const idem = buildBatchIdempotencyKey(current.jobId, 'USER_PROFILE', 1, null);
  const receipt = await store.getBatchReceiptByIdempotencyKey(idem);
  assert.ok(receipt);
  assert.equal(receipt?.status, 'COMPLETED');
  assert.equal(receipt?.outcomeJson, buildDomainBatchOutcomeJson(batchResult));

  current = {
    ...current,
    domainSteps: {
      ...current.domainSteps,
      USER_PROFILE: {
        ...current.domainSteps.USER_PROFILE,
        status: 'IN_PROGRESS',
        batchesProcessed: 0,
        resumableCursor: null,
      },
    },
    revision: 2,
  };

  const resumed = await executeDomainBatchCrashSafe({
    store,
    batchReceiptRecorder: new InMemoryAccountDeletionBatchReceiptRecorder(),
    job: current,
    source: 'USER_PROFILE',
    phaseState: 'PURGING_DEPENDENT_RECORDS',
    batchSize: 10,
    disposeBatch: async () => {
      disposeCalls += 1;
      throw new Error('Must not re-execute external batch when receipt exists');
    },
  });
  assert.equal(resumed.usedPersistedReceipt, true);
  assert.equal(disposeCalls, 1);
  assert.equal(resumed.job.domainSteps.USER_PROFILE.status, 'COMPLETED');

  console.log('RT-ACCOUNT-LIFECYCLE-WORKERS-001-CV batch atomic tests: PASSED');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});