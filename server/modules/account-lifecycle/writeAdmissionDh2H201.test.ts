/**
 * D-H2-01 Write Admission authority + RPC tests.
 */

import assert from 'node:assert/strict';
import {
  assertWriteAdmissionPermitsMutation,
  mapWriteBlockRowToAdmissionDecision,
} from './writeAdmissionAuthority.ts';
import { verifyWriteAdmissionRpcRequest, signWriteAdmissionRpcRequest, generateRpcNonce } from './writeAdmissionRpcAuth.ts';
import { AccountLifecycleError } from './types.ts';
import { resolveWriteAdmissionFromD1 } from '../../../worker/account-lifecycle/d1WriteAdmissionResolver.ts';
import { InMemoryAccountLifecycleD1 } from '../../../worker/account-lifecycle/inMemoryAccountLifecycleD1.ts';
import { D1AccountLifecycleStore } from '../../../worker/account-lifecycle/d1AccountLifecycleStore.ts';
import { queryWriteAdmissionViaWorkerRpc } from './expressWriteAdmissionRpcClient.ts';
import { handleInternalWriteAdmissionRoute } from '../../../worker/routes/internalWriteAdmissionRoutes.ts';
import {
  WRITE_ADMISSION_RPC_NONCE_HEADER,
  WRITE_ADMISSION_RPC_SIGNATURE_HEADER,
  WRITE_ADMISSION_RPC_TIMESTAMP_HEADER,
} from './writeAdmissionRpcContract.ts';

const TEST_SECRET = 'test-write-admission-rpc-secret-32b';

async function signBody(bodyJson: string, ts: string, nonce: string): Promise<string> {
  return signWriteAdmissionRpcRequest({ secret: TEST_SECRET, method: 'POST', timestamp: ts, nonce, bodyJson });
}

async function runAuthorityMappingTests(): Promise<void> {
  assert.deepEqual(mapWriteBlockRowToAdmissionDecision('u1', null), { status: 'OPEN', uid: 'u1', revision: 0 });
  assert.equal(
    mapWriteBlockRowToAdmissionDecision('u1', {
      targetUid: 'u1',
      state: 'WRITE_BLOCKED_DELETION_IN_PROGRESS',
      activeDeletionJobId: 'job1',
      blockedAtIso: '',
      updatedAtIso: '',
      reason: 'del',
      revision: 3,
    }).status,
    'CLOSED',
  );
  assert.throws(() => assertWriteAdmissionPermitsMutation({ status: 'CLOSED', uid: 'u1', revision: 2 }), AccountLifecycleError);
  assert.throws(() => assertWriteAdmissionPermitsMutation({ status: 'UNAVAILABLE', code: 'X' }), AccountLifecycleError);
}

async function runRpcAuthTests(): Promise<void> {
  const body = '{"targetUid":"u1"}';
  const ts = String(Math.floor(Date.now() / 1000));
  const nonce = generateRpcNonce();
  const sig = await signBody(body, ts, nonce);
  const ok = await verifyWriteAdmissionRpcRequest({
    secret: TEST_SECRET,
    method: 'POST',
    timestamp: ts,
    nonce,
    bodyJson: body,
    providedSignature: sig,
  });
  assert.equal(ok.ok, true);

  const badSig = await verifyWriteAdmissionRpcRequest({
    secret: TEST_SECRET,
    method: 'POST',
    timestamp: ts,
    nonce,
    bodyJson: body,
    providedSignature: '00'.repeat(32),
  });
  assert.equal(badSig.ok, false);

  const oldTs = await verifyWriteAdmissionRpcRequest({
    secret: TEST_SECRET,
    method: 'POST',
    timestamp: String(Math.floor(Date.now() / 1000) - 120),
    nonce: generateRpcNonce(),
    bodyJson: body,
    providedSignature: sig,
  });
  assert.equal(oldTs.ok, false);
}

async function runD1ConsistencyTests(): Promise<void> {
  const db = new InMemoryAccountLifecycleD1();
  const store = new D1AccountLifecycleStore(db);
  const now = new Date().toISOString();
  await store.upsertWriteBlock({
    targetUid: 'alice',
    state: 'WRITE_BLOCKED_DELETION_IN_PROGRESS',
    activeDeletionJobId: 'del_alice',
    blockedAtIso: now,
    updatedAtIso: now,
    reason: 'test',
    revision: 1,
  });

  const workerDecision = await resolveWriteAdmissionFromD1(db, 'alice');
  assert.equal(workerDecision.status, 'CLOSED');
  const bobDecision = await resolveWriteAdmissionFromD1(db, 'bob');
  assert.equal(bobDecision.status, 'OPEN');
}

async function runInternalRouteTests(): Promise<void> {
  const db = new InMemoryAccountLifecycleD1();
  const body = JSON.stringify({ targetUid: 'u1' });
  const ts = String(Math.floor(Date.now() / 1000));
  const nonce = generateRpcNonce();
  const sig = await signBody(body, ts, nonce);
  const request = new Request('http://localhost/api/internal/v1/lifecycle/write-admission', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      [WRITE_ADMISSION_RPC_TIMESTAMP_HEADER]: ts,
      [WRITE_ADMISSION_RPC_NONCE_HEADER]: nonce,
      [WRITE_ADMISSION_RPC_SIGNATURE_HEADER]: sig,
    },
    body,
  });
  const res = await handleInternalWriteAdmissionRoute({
    request,
    method: 'POST',
    pathname: '/api/internal/v1/lifecycle/write-admission',
    url: new URL(request.url),
    correlationId: 'test',
    requestId: 'test',
    environment: 'development',
    env: { DB: db, LIFECYCLE_WRITE_ADMISSION_RPC_SECRET: TEST_SECRET },
  } as import('../../../worker/types.ts').WorkerRequestContext);
  assert.ok(res);
  assert.equal(res!.status, 200);

  const replay = await handleInternalWriteAdmissionRoute({
    request: new Request('http://localhost/api/internal/v1/lifecycle/write-admission', {
      method: 'POST',
      headers: request.headers,
      body,
    }),
    method: 'POST',
    pathname: '/api/internal/v1/lifecycle/write-admission',
    url: new URL(request.url),
    correlationId: 'test2',
    requestId: 'test2',
    environment: 'development',
    env: { DB: db, LIFECYCLE_WRITE_ADMISSION_RPC_SECRET: TEST_SECRET },
  } as import('../../../worker/types.ts').WorkerRequestContext);
  assert.ok(replay);
  assert.equal(replay!.status, 409);
}

async function runExpressClientConfigTests(): Promise<void> {
  const unconfigured = await queryWriteAdmissionViaWorkerRpc({ targetUid: 'x', env: {} });
  assert.equal(unconfigured.status, 'UNAVAILABLE');
  const noBase = await queryWriteAdmissionViaWorkerRpc({
    targetUid: 'x',
    env: { LIFECYCLE_WRITE_ADMISSION_RPC_SECRET: TEST_SECRET },
  });
  assert.equal(noBase.status, 'UNAVAILABLE');
}

async function run(): Promise<void> {
  await runAuthorityMappingTests();
  await runRpcAuthTests();
  await runD1ConsistencyTests();
  await runInternalRouteTests();
  await runExpressClientConfigTests();
  console.log('writeAdmissionDh2H201.test.ts: PASSED (unit + mock-handler; see writeAdmissionWranglerAcceptance for HTTP)');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});