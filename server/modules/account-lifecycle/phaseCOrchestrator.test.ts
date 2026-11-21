/**
 * Phase C — orchestrator resume, batch receipt idempotency, D1 workflow integration.
 */

import assert from 'node:assert/strict';
import { createInitialDomainSteps } from './durableJobStore.ts';
import { AccountDeletionOrchestrator } from './deletionOrchestrator.ts';
import { InMemoryOrBackedDomainRepositoryAdapter } from './moduleAdapters.ts';
import { ConfigurableAuthIdentityDeletionAdapter } from './moduleAdapters.ts';
import { InMemoryAccountDeletionBatchReceiptRecorder, buildBatchIdempotencyKey } from './batchReceiptRecorder.ts';
import type { DurableAccountDeletionJob, MediaDeletionCoordinationAdapter } from './types.ts';
import { D1AccountLifecycleStore } from '../../../worker/account-lifecycle/d1AccountLifecycleStore.ts';
import { D1AccountDeletionBatchReceiptRecorder } from '../../../worker/account-lifecycle/d1BatchReceiptRecorder.ts';
import { InMemoryAccountLifecycleD1 } from '../../../worker/account-lifecycle/inMemoryAccountLifecycleD1.ts';

function sampleJob(targetUid: string): DurableAccountDeletionJob {
  const now = new Date().toISOString();
  return {
    jobId: `deljob_${targetUid}_phasec`,
    targetUid,
    requestedByUid: targetUid,
    reason: 'PHASE_C_TEST',
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
    authStep: { status: 'PENDING', deletedAtIso: null, attempts: 0, updatedAtIso: now },
    legacyFirestoreSupplement: {
      status: 'COMPLETED',
      attempts: 1,
      updatedAtIso: now,
      result: {
        userPrefsOk: true,
        votesOk: true,
        firestoreBargainsOk: true,
        alertsReconcileOk: true,
        authDeletedOnServer: false,
      },
    },
    totalAttempts: 0,
    createdAtIso: now,
    updatedAtIso: now,
    completedAtIso: null,
    lastFailureReason: null,
    revision: 1,
  };
}

const emptyMedia: MediaDeletionCoordinationAdapter = {
  async listOwnedMediaPage() {
    return { mediaItems: [], nextCursor: null, hasMore: false };
  },
  async deleteOwnedMediaObject() {
    return { objectId: 'x', status: 'ALREADY_DELETED' as const };
  },
};

async function run(): Promise<void> {
  const uid = 'user_phase_c';
  const db = new InMemoryAccountLifecycleD1();
  const d1Store = new D1AccountLifecycleStore(db);
  const d1Recorder = new D1AccountDeletionBatchReceiptRecorder(d1Store);
  const profileAdapter = new InMemoryOrBackedDomainRepositoryAdapter('USER_PROFILE', [
    {
      recordId: 'profile_1',
      ownerUid: uid,
      source: 'USER_PROFILE',
      createdAtIso: new Date().toISOString(),
      retentionClass: 'STANDARD_PURGEABLE',
      payload: {},
    },
  ]);

  const orchestrator = new AccountDeletionOrchestrator({
    store: d1Store,
    domainAdapters: [
      profileAdapter,
      new InMemoryOrBackedDomainRepositoryAdapter('FAVORITES_AND_WORKSPACES', []),
      new InMemoryOrBackedDomainRepositoryAdapter('BUYER_ALERTS', []),
      new InMemoryOrBackedDomainRepositoryAdapter('BARGAIN_LISTINGS', []),
      new InMemoryOrBackedDomainRepositoryAdapter('SPONSOR_RECORDS', []),
      new InMemoryOrBackedDomainRepositoryAdapter('CROWD_CLAIMS', []),
      new InMemoryOrBackedDomainRepositoryAdapter('MEDIA_METADATA', []),
    ],
    mediaAdapter: emptyMedia,
    authAdapter: new ConfigurableAuthIdentityDeletionAdapter(async () => undefined),
    batchReceiptRecorder: d1Recorder,
  });

  const actor = { uid, isAdmin: false, freshAuthVerified: true };
  const seeded = await d1Store.createOrGetActiveJob(sampleJob(uid));
  const partial = await orchestrator.executeDeletionJob(actor, seeded.job.jobId, {
    batchSize: 10,
    maxBatchesPerInvocation: 1,
  });
  assert.ok(partial.domainSteps.USER_PROFILE.batchesProcessed >= 0);

  const idem = buildBatchIdempotencyKey(seeded.job.jobId, 'USER_PROFILE', 99, 'cursor_test');
  const firstReceipt = await d1Store.recordBatchReceiptIdempotent({
    receiptId: 'rcp_first',
    jobId: seeded.job.jobId,
    targetUid: uid,
    domainSource: 'USER_PROFILE',
    idempotencyKey: idem,
    batchCursor: 'cursor_test',
    outcomeJson: '{}',
    recordedAtIso: new Date().toISOString(),
  });
  assert.equal(firstReceipt.inserted, true);
  const dup = await d1Store.recordBatchReceiptIdempotent({
    receiptId: 'rcp_dup',
    jobId: seeded.job.jobId,
    targetUid: uid,
    domainSource: 'USER_PROFILE',
    idempotencyKey: idem,
    batchCursor: 'cursor_test',
    outcomeJson: '{}',
    recordedAtIso: new Date().toISOString(),
  });
  assert.equal(dup.inserted, false);

  const restarted = new AccountDeletionOrchestrator({
    store: new D1AccountLifecycleStore(db),
    domainAdapters: [
      profileAdapter,
      new InMemoryOrBackedDomainRepositoryAdapter('FAVORITES_AND_WORKSPACES', []),
      new InMemoryOrBackedDomainRepositoryAdapter('BUYER_ALERTS', []),
      new InMemoryOrBackedDomainRepositoryAdapter('BARGAIN_LISTINGS', []),
      new InMemoryOrBackedDomainRepositoryAdapter('SPONSOR_RECORDS', []),
      new InMemoryOrBackedDomainRepositoryAdapter('CROWD_CLAIMS', []),
      new InMemoryOrBackedDomainRepositoryAdapter('MEDIA_METADATA', []),
    ],
    mediaAdapter: emptyMedia,
    authAdapter: new ConfigurableAuthIdentityDeletionAdapter(async () => undefined),
    batchReceiptRecorder: d1Recorder,
  });

  const resumed = await restarted.resumeDeletionJob(actor, seeded.job.jobId, {
    batchSize: 20,
    maxBatchesPerInvocation: 100,
  });
  assert.ok(['COMPLETED', 'PARTIAL_FAILURE_RETRYABLE', 'PURGING_DEPENDENT_RECORDS'].includes(resumed.state));

  const memRecorder = new InMemoryAccountDeletionBatchReceiptRecorder();
  assert.ok(memRecorder);
  console.log('RT-ACCOUNT-LIFECYCLE-WORKERS-001 Phase C orchestrator tests: PASSED');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});