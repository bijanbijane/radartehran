/**
 * Real local Cloudflare D1 (Wrangler Miniflare SQLite) integration — account lifecycle CV.
 * Skips with explicit reason when Wrangler cannot run in this environment.
 */

import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { createInitialDomainSteps } from '../../server/modules/account-lifecycle/durableJobStore.ts';
import { AccountLifecycleError } from '../../server/modules/account-lifecycle/types.ts';
import type { DurableAccountDeletionJob } from '../../server/modules/account-lifecycle/types.ts';
import { D1AccountLifecycleStore } from './d1AccountLifecycleStore.ts';
import { requireWorkerLifecycleBindings } from './stageDLifecycleRuntime.ts';
import { AccountLifecycleError } from '../../server/modules/account-lifecycle/types.ts';
import { acquireD1MutationPermit, countActiveD1MutationPermits, releaseD1MutationPermit, D1MutationPermitError } from './d1WriteAdmissionPermit.ts';
import type { D1DatabaseBinding } from '../db/types.ts';

import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function sampleJob(targetUid: string, jobId: string): DurableAccountDeletionJob {
  const now = new Date().toISOString();
  return {
    jobId,
    targetUid,
    requestedByUid: targetUid,
    reason: 'WRANGLER_D1_TEST',
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
    totalAttempts: 0,
    createdAtIso: now,
    updatedAtIso: now,
    completedAtIso: null,
    lastFailureReason: null,
    revision: 1,
  };
}

async function main(): Promise<void> {
  try {
    execSync(
      'npx wrangler d1 migrations apply radartehran-staging-db --local --env staging',
      { cwd: projectRoot, stdio: 'pipe', encoding: 'utf8' },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log('SKIP: Wrangler local D1 migrations unavailable:', msg.slice(0, 240));
    return;
  }

  let dispose: (() => Promise<void>) | undefined;
  let db: D1DatabaseBinding | undefined;
  try {
    const wrangler = await import('wrangler');
    const proxy = await wrangler.getPlatformProxy<{ DB: D1DatabaseBinding }>({
      configPath: path.join(projectRoot, 'wrangler.jsonc'),
      environment: 'staging',
    });
    db = proxy.env.DB;
    dispose = proxy.dispose;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log('SKIP: getPlatformProxy unavailable:', msg.slice(0, 240));
    return;
  }

  if (!db) {
    console.log('SKIP: DB binding missing from getPlatformProxy');
    return;
  }

  await requireWorkerLifecycleBindings({ DB: db } as unknown as import('../types.ts').WorkerEnv);
  await assert.rejects(
    () => requireWorkerLifecycleBindings({ DB: db, USER_DB: db } as unknown as import('../types.ts').WorkerEnv),
    (error: unknown) => error instanceof AccountLifecycleError && error.code === 'STORE_UNAVAILABLE',
  );

  const store = new D1AccountLifecycleStore(db);
  const health = await store.probeHealth();
  assert.equal(health.health, 'HEALTHY');

  const uid = `wrangler_d1_${Date.now()}`;
  const jobId = `deljob_${uid}_real`;
  const activePermit = await acquireD1MutationPermit({
    db,
    targetUid: uid,
    holderId: 'wrangler-lifecycle-test',
    routeSignature: 'POST /api/test/mutation',
  });
  assert.equal(await countActiveD1MutationPermits({ db, targetUid: uid }), 1);

  const created = await store.createOrGetActiveJob(sampleJob(uid, jobId));
  assert.equal(created.createdNew, true);
  await assert.rejects(
    () => acquireD1MutationPermit({
      db,
      targetUid: uid,
      holderId: 'late-mutation',
      routeSignature: 'POST /api/test/late-mutation',
    }),
    (error: unknown) => error instanceof D1MutationPermitError && error.httpStatus === 423,
  );
  assert.equal(await countActiveD1MutationPermits({ db, targetUid: uid }), 1);
  await releaseD1MutationPermit({ db, targetUid: uid, permitId: activePermit.permitId });
  assert.equal(await countActiveD1MutationPermits({ db, targetUid: uid }), 0);

  const smokeKey = `${jobId}:smoke:${Date.now()}`;
  const smokeInsert = await store.recordBatchReceiptIdempotent({
    receiptId: `brcp_smoke_${Date.now()}`,
    jobId,
    targetUid: uid,
    domainSource: 'USER_PROFILE',
    idempotencyKey: smokeKey,
    batchCursor: null,
    outcomeJson: '{}',
    recordedAtIso: new Date().toISOString(),
  });
  assert.equal(smokeInsert.inserted, true);
  assert.ok(await store.getBatchReceiptByIdempotencyKey(smokeKey));

  const committed = await store.commitJobProgressWithBatchReceipt({
    jobId,
    expectedRevision: 1,
    receipt: {
      receiptId: `brcp_${jobId}_1`,
      idempotencyKey: `${jobId}:USER_PROFILE:1:__START__`,
      domainSource: 'USER_PROFILE',
      batchCursor: null,
      outcomeJson: JSON.stringify({ receipts: [], nextCursor: 'c1', hasMore: true }),
      recordedAtIso: new Date().toISOString(),
      status: 'COMPLETED',
      completedAtIso: new Date().toISOString(),
    },
    updater: (curr) => ({
      ...curr,
      state: 'PURGING_DEPENDENT_RECORDS',
      updatedAtIso: new Date().toISOString(),
      domainSteps: {
        ...curr.domainSteps,
        USER_PROFILE: {
          ...curr.domainSteps.USER_PROFILE,
          status: 'IN_PROGRESS',
          resumableCursor: 'c1',
          batchesProcessed: 1,
          updatedAtIso: new Date().toISOString(),
        },
      },
    }),
  });
  assert.equal(committed.job.revision, 2);
  const receiptRow = await store.getBatchReceiptByIdempotencyKey(
    `${jobId}:USER_PROFILE:1:__START__`,
  );
  assert.ok(receiptRow);
  assert.equal(receiptRow?.status, 'COMPLETED');

  await assert.rejects(
    () => store.saveJobProgress(jobId, 1, (c) => c),
    (e: unknown) => e instanceof AccountLifecycleError && e.code === 'CONCURRENT_MODIFICATION_CONFLICT',
  );

  const dup = await store.commitJobProgressWithBatchReceipt({
    jobId,
    expectedRevision: 2,
    receipt: {
      receiptId: `brcp_${jobId}_1b`,
      idempotencyKey: `${jobId}:USER_PROFILE:1:__START__`,
      domainSource: 'USER_PROFILE',
      batchCursor: null,
      outcomeJson: JSON.stringify({ receipts: [], nextCursor: 'c1', hasMore: true }),
      recordedAtIso: new Date().toISOString(),
      status: 'COMPLETED',
      completedAtIso: new Date().toISOString(),
    },
    updater: (c) => c,
  });
  assert.equal(dup.receiptInserted, false);

  if (dispose) await dispose();
  console.log('Wrangler local D1 account lifecycle integration: PASSED');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});