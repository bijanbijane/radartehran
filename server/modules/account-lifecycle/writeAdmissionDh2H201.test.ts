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
import { EventEmitter } from 'node:events';
import { createExpressMutationWriteBlockMiddleware } from './expressMutationWriteBlockMiddleware.ts';

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

function createMockUserDb(options: { denyPermit?: boolean } = {}): {
  db: import('../../../worker/types.ts').D1Database;
  calls: string[];
} {
  const calls: string[] = [];
  const db = {
    prepare(sql: string) {
      let values: unknown[] = [];
      const statement = {
        bind(...next: unknown[]) { values = next; return statement; },
        async first<T = Record<string, unknown>>() {
          calls.push('first:' + sql);
          if (sql.includes('SELECT released_at_ms')) return { released_at_ms: Date.now() } as T;
          return null as T | null;
        },
        async all<T = Record<string, unknown>>() {
          calls.push('all:' + sql);
          return { success: true, results: [] as T[] };
        },
        async run() {
          calls.push('run:' + sql);
          if (sql.includes('INSERT INTO account_mutation_permits')) {
            return { success: true, meta: { changes: options.denyPermit ? 0 : 1 } };
          }
          return { success: true, meta: { changes: 1 } };
        },
      };
      return statement;
    },
  };
  return { db: db as unknown as import('../../../worker/types.ts').D1Database, calls };
}

async function invokeUserDbWriteAdmissionRpc(params: {
  db: import('../../../worker/types.ts').D1Database;
  body: Record<string, unknown>;
}): Promise<Response> {
  const body = JSON.stringify(params.body);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = generateRpcNonce();
  const signature = await signBody(body, timestamp, nonce);
  const request = new Request('http://localhost/api/internal/v1/lifecycle/write-admission', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      [WRITE_ADMISSION_RPC_TIMESTAMP_HEADER]: timestamp,
      [WRITE_ADMISSION_RPC_NONCE_HEADER]: nonce,
      [WRITE_ADMISSION_RPC_SIGNATURE_HEADER]: signature,
    },
    body,
  });
  const response = await handleInternalWriteAdmissionRoute({
    request,
    method: 'POST',
    pathname: '/api/internal/v1/lifecycle/write-admission',
    url: new URL(request.url),
    correlationId: 'user-db-rpc-test',
    requestId: 'user-db-rpc-test',
    environment: 'test',
    env: { USER_DB: params.db, LIFECYCLE_WRITE_ADMISSION_RPC_SECRET: TEST_SECRET },
  } as import('../../../worker/types.ts').WorkerRequestContext);
  assert.ok(response);
  return response!;
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

  const userDb = createMockUserDb();
  const acquired = await invokeUserDbWriteAdmissionRpc({
    db: userDb.db,
    body: { targetUid: 'u1', action: 'acquire', operationName: 'POST /api/listings' },
  });
  assert.equal(acquired.status, 200);
  const acquiredBody = await acquired.json() as Record<string, unknown>;
  assert.equal(acquiredBody.action, 'acquired');
  assert.equal(typeof acquiredBody.permitId, 'string');
  assert.ok(userDb.calls.some((sql) => sql.includes('INSERT INTO account_mutation_permits')));

  const released = await invokeUserDbWriteAdmissionRpc({
    db: userDb.db,
    body: { targetUid: 'u1', action: 'release', permitId: String(acquiredBody.permitId) },
  });
  assert.equal(released.status, 200);
  assert.equal((await released.json() as Record<string, unknown>).action, 'released');
  assert.ok(userDb.calls.some((sql) => sql.includes('WHERE permit_id = ?2 AND uid = ?3')));

  const blockedUserDb = createMockUserDb({ denyPermit: true });
  const blockedAcquire = await invokeUserDbWriteAdmissionRpc({
    db: blockedUserDb.db,
    body: { targetUid: 'u1', action: 'acquire', operationName: 'POST /api/listings' },
  });
  assert.equal(blockedAcquire.status, 423);
}

class FakeExpressResponse extends EventEmitter {
  statusCode = 200;
  payload: unknown;
  status(code: number): this { this.statusCode = code; return this; }
  json(value: unknown): this { this.payload = value; return this; }
}

async function runExpressPermitLifetimeTests(): Promise<void> {
  const response = new FakeExpressResponse();
  let nextCalled = false;
  let releases = 0;
  const middleware = createExpressMutationWriteBlockMiddleware({
    verifyUserAuth: async () => ({ authorized: true, uid: 'u1' }) as Awaited<ReturnType<typeof import('../../../src/utils/serverAdminAndTelegramSecurity.ts').verifyFirebaseUserAuthorization>>,
    acquirePermit: async (_uid, operationName) => {
      assert.equal(operationName, 'POST /api/listings');
      return { ok: true, permitId: 'permit_1', expiresAtMs: Date.now() + 60_000 };
    },
    releasePermit: async (uid, permitId) => {
      assert.equal(uid, 'u1');
      assert.equal(permitId, 'permit_1');
      releases += 1;
    },
  });
  await middleware(
    { path: '/api/listings', method: 'POST', headers: {} } as import('express').Request,
    response as unknown as import('express').Response,
    (() => { nextCalled = true; }) as import('express').NextFunction,
  );
  assert.equal(nextCalled, true);
  response.emit('finish');
  response.emit('close');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(releases, 1, 'permit must be released exactly once on response completion/close');

  const blockedResponse = new FakeExpressResponse();
  let blockedNext = false;
  const blocked = createExpressMutationWriteBlockMiddleware({
    verifyUserAuth: async () => ({ authorized: true, uid: 'u1' }) as Awaited<ReturnType<typeof import('../../../src/utils/serverAdminAndTelegramSecurity.ts').verifyFirebaseUserAuthorization>>,
    acquirePermit: async () => ({ ok: false, statusCode: 423, code: 'ACCOUNT_WRITE_BLOCKED' }),
  });
  await blocked(
    { path: '/api/listings', method: 'POST', headers: {} } as import('express').Request,
    blockedResponse as unknown as import('express').Response,
    (() => { blockedNext = true; }) as import('express').NextFunction,
  );
  assert.equal(blockedNext, false);
  assert.equal(blockedResponse.statusCode, 423);
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
  await runExpressPermitLifetimeTests();
  console.log('writeAdmissionDh2H201.test.ts: PASSED (unit + mock-handler; see writeAdmissionWranglerAcceptance for HTTP)');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});