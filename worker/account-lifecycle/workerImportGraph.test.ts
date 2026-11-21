/**
 * Worker-compatible import graph for account lifecycle modules (CV).
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const forbidden = [
  'from \'express\'',
  'from "express"',
  'firebase-admin',
  'node:fs',
  'node:path',
  'sharp',
  'durableJobStore',
];

const roots = [
  'worker/account-lifecycle/d1AccountLifecycleStore.ts',
  'worker/account-lifecycle/d1BatchReceiptRecorder.ts',
  'worker/account-lifecycle/d1StoreBinding.ts',
  'server/modules/account-lifecycle/deletionOrchestrator.ts',
  'server/modules/account-lifecycle/deletionOrchestratorRunners.ts',
  'server/modules/account-lifecycle/deletionDomainBatchExecutor.ts',
  'server/modules/account-lifecycle/deletionJobBootstrap.ts',
  'worker/account-lifecycle/workerLifecycleRuntime.ts',
  'worker/routes/accountLifecycleRoutes.ts',
];

function read(rel: string): string {
  return fs.readFileSync(path.resolve(process.cwd(), rel), 'utf8');
}

for (const rel of roots) {
  const src = read(rel);
  for (const token of forbidden) {
    assert.ok(!src.includes(token), `${rel} must not reference "${token}"`);
  }
}

console.log('Account lifecycle worker import graph check: PASSED');