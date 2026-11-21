/**
 * D-H2-01A acceptance: local Wrangler D1 + HTTP Worker + Express RPC client/middleware.
 * Classification: local D1 integration + real local Worker HTTP + Express HTTP integration.
 */

import assert from 'node:assert/strict';
import { execSync, spawn, type ChildProcess } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createExpressMutationWriteBlockMiddleware } from '../../server/modules/account-lifecycle/expressMutationWriteBlockMiddleware.ts';
import { queryWriteAdmissionViaWorkerRpc } from '../../server/modules/account-lifecycle/expressWriteAdmissionRpcClient.ts';
import {
  INTERNAL_WRITE_ADMISSION_RPC_PATH,
  WRITE_ADMISSION_RPC_NONCE_HEADER,
  WRITE_ADMISSION_RPC_SIGNATURE_HEADER,
  WRITE_ADMISSION_RPC_TIMESTAMP_HEADER,
} from '../../server/modules/account-lifecycle/writeAdmissionRpcContract.ts';
import { signWriteAdmissionRpcRequest, generateRpcNonce } from '../../server/modules/account-lifecycle/writeAdmissionRpcAuth.ts';
import { D1AccountLifecycleStore } from './d1AccountLifecycleStore.ts';
import { createInitialDomainSteps } from '../../server/modules/account-lifecycle/deletionJobBootstrap.ts';
import type { DurableAccountDeletionJob } from '../../server/modules/account-lifecycle/types.ts';
import type { D1DatabaseBinding } from '../db/types.ts';
import { resolveWriteAdmissionFromD1 } from './d1WriteAdmissionResolver.ts';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TEST_SECRET = 'test-write-admission-rpc-secret-32b';
const WORKER_PORT = 18787;
const WORKER_BASE = `http://127.0.0.1:${WORKER_PORT}`;

function sampleJob(targetUid: string, jobId: string): DurableAccountDeletionJob {
  const now = new Date().toISOString();
  return {
    jobId,
    targetUid,
    requestedByUid: targetUid,
    reason: 'WRANGLER_ACCEPTANCE',
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

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

async function waitForWorkerReady(): Promise<void> {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`${WORKER_BASE}/api/healthz`);
      if (res.ok) return;
    } catch {
      /* retry */
    }
    await sleep(500);
  }
  throw new Error('WORKER_HTTP_READY_TIMEOUT');
}

async function applyMigrations(): Promise<void> {
  execSync('npm run cf:staging:migrate:local', { cwd: projectRoot, stdio: 'pipe', encoding: 'utf8' });
}

async function inspectNonceSchema(db: D1DatabaseBinding): Promise<string> {
  const res = await db
    .prepare(`SELECT sql FROM sqlite_master WHERE name = 'lifecycle_internal_rpc_nonces'`)
    .all<{ sql: string }>();
  const row = res.results?.[0]?.sql ?? '';
  assert.ok(row.includes('lifecycle_internal_rpc_nonces'), 'nonce table must exist in local D1');
  assert.ok(row.includes('nonce'), 'nonce column must exist');
  return row;
}

async function main(): Promise<void> {
  let wranglerProc: ChildProcess | undefined;
  let proxyDispose: (() => Promise<void>) | undefined;

  try {
    await applyMigrations();

    const wrangler = await import('wrangler');
    const proxy = await wrangler.getPlatformProxy<{ DB: D1DatabaseBinding }>({
      configPath: path.join(projectRoot, 'wrangler.jsonc'),
      environment: 'staging',
    });
    proxyDispose = proxy.dispose;
    const db = proxy.env.DB;
    assert.ok(db, 'local D1 DB binding required');

    await inspectNonceSchema(db);

    const store = new D1AccountLifecycleStore(db);
    const openUid = `accept_open_${Date.now()}`;
    const closedUid = `accept_closed_${Date.now()}`;
    const jobId = `deljob_${closedUid}`;
    await store.createOrGetActiveJob(sampleJob(closedUid, jobId));
    const block = await store.getWriteBlock(closedUid);
    assert.ok(block);
    assert.notEqual(block!.state, 'ACTIVE_WRITES_ALLOWED');
    const admissionClosed = await resolveWriteAdmissionFromD1(db, closedUid);
    assert.equal(admissionClosed.status, 'CLOSED');
    const admissionOpen = await resolveWriteAdmissionFromD1(db, openUid);
    assert.equal(admissionOpen.status, 'OPEN');

    wranglerProc = spawn(
      'npx',
      [
        'wrangler',
        'dev',
        '--config',
        'wrangler.jsonc',
        '--env',
        'staging',
        '--port',
        String(WORKER_PORT),
        '--ip',
        '127.0.0.1',
        `--var`,
        `LIFECYCLE_WRITE_ADMISSION_RPC_SECRET:${TEST_SECRET}`,
      ],
      { cwd: projectRoot, stdio: 'pipe' },
    );
    await waitForWorkerReady();

    const rpcOpen = await queryWriteAdmissionViaWorkerRpc({
      targetUid: openUid,
      env: {
        LIFECYCLE_WRITE_ADMISSION_RPC_SECRET: TEST_SECRET,
        LIFECYCLE_WRITE_ADMISSION_WORKER_BASE_URL: WORKER_BASE,
      },
    });
    assert.equal(rpcOpen.status, 'OPEN');

    const rpcClosed = await queryWriteAdmissionViaWorkerRpc({
      targetUid: closedUid,
      env: {
        LIFECYCLE_WRITE_ADMISSION_RPC_SECRET: TEST_SECRET,
        LIFECYCLE_WRITE_ADMISSION_WORKER_BASE_URL: WORKER_BASE,
      },
    });
    assert.equal(rpcClosed.status, 'CLOSED');

    const bodyJson = JSON.stringify({ targetUid: openUid });
    const ts = String(Math.floor(Date.now() / 1000));
    const nonce = generateRpcNonce();
    const sig = await signWriteAdmissionRpcRequest({
      secret: TEST_SECRET,
      method: 'POST',
      timestamp: ts,
      nonce,
      bodyJson,
    });
    const firstHttp = await fetch(`${WORKER_BASE}${INTERNAL_WRITE_ADMISSION_RPC_PATH}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [WRITE_ADMISSION_RPC_TIMESTAMP_HEADER]: ts,
        [WRITE_ADMISSION_RPC_NONCE_HEADER]: nonce,
        [WRITE_ADMISSION_RPC_SIGNATURE_HEADER]: sig,
      },
      body: bodyJson,
    });
    assert.equal(firstHttp.status, 200);
    const replayHttp = await fetch(`${WORKER_BASE}${INTERNAL_WRITE_ADMISSION_RPC_PATH}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [WRITE_ADMISSION_RPC_TIMESTAMP_HEADER]: ts,
        [WRITE_ADMISSION_RPC_NONCE_HEADER]: nonce,
        [WRITE_ADMISSION_RPC_SIGNATURE_HEADER]: sig,
      },
      body: bodyJson,
    });
    assert.equal(replayHttp.status, 409);

    const unconfigured = await queryWriteAdmissionViaWorkerRpc({ targetUid: openUid, env: {} });
    assert.equal(unconfigured.status, 'UNAVAILABLE');

    let expressServer: Server | undefined;
    const expressApp = express();
    expressApp.use(
      express.json(),
      createExpressMutationWriteBlockMiddleware({
        verifyUserAuth: async () => ({
          authorized: true,
          authenticated: true,
          uid: closedUid,
          statusCode: 200,
          reason: 'TEST',
        }),
        resolveAdmission: (uid) =>
          queryWriteAdmissionViaWorkerRpc({
            targetUid: uid,
            env: {
              LIFECYCLE_WRITE_ADMISSION_RPC_SECRET: TEST_SECRET,
              LIFECYCLE_WRITE_ADMISSION_WORKER_BASE_URL: WORKER_BASE,
            },
          }),
      }),
    );
    expressApp.post('/api/test-mutation', (_req, res) => res.status(200).json({ status: 'ok' }));

    expressServer = createServer(expressApp);
    await new Promise<void>((resolve) => expressServer!.listen(0, resolve));
    const expressPort = (expressServer.address() as { port: number }).port;

    const blocked = await fetch(`http://127.0.0.1:${expressPort}/api/test-mutation`, { method: 'POST' });
    assert.equal(blocked.status, 423);

    const expressApp2 = express();
    expressApp2.use(
      express.json(),
      createExpressMutationWriteBlockMiddleware({
        verifyUserAuth: async () => ({
          authorized: true,
          authenticated: true,
          uid: openUid,
          statusCode: 200,
          reason: 'TEST',
        }),
        resolveAdmission: (uid) =>
          queryWriteAdmissionViaWorkerRpc({
            targetUid: uid,
            env: {
              LIFECYCLE_WRITE_ADMISSION_RPC_SECRET: TEST_SECRET,
              LIFECYCLE_WRITE_ADMISSION_WORKER_BASE_URL: WORKER_BASE,
            },
          }),
      }),
    );
    expressApp2.post('/api/test-mutation', (_req, res) => res.status(200).json({ status: 'ok' }));
    const expressServer2 = createServer(expressApp2);
    await new Promise<void>((resolve) => expressServer2.listen(0, resolve));
    const expressPort2 = (expressServer2.address() as { port: number }).port;
    const allowed = await fetch(`http://127.0.0.1:${expressPort2}/api/test-mutation`, { method: 'POST' });
    assert.equal(allowed.status, 200);

    expressServer?.close();
    expressServer2.close();

    console.log('writeAdmissionWranglerAcceptance.test.ts: PASSED (local D1 + Worker HTTP + Express HTTP)');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('writeAdmissionWranglerAcceptance.test.ts: FAILED', msg);
    process.exit(1);
  } finally {
    wranglerProc?.kill('SIGTERM');
    await proxyDispose?.();
  }
}

void main();