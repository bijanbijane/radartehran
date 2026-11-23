import test from 'node:test';
import assert from 'node:assert/strict';
import type { D1Database } from '../types';
import type { D1DatabaseBinding } from '../db/types.ts';
import type { WorkerEnv } from '../types';
import { AccountLifecycleStoreError } from '../../server/modules/account-lifecycle/storeContract.ts';
import {
  acquireMutationPermitInD1,
  releaseMutationPermitInD1,
} from './d1MutationPermit';
import {
  createWorkerMediaDeletionAdapter,
} from './workerMediaAdapter.ts';
import {
  createWorkerD1TelemetryErasureAdapter,
} from './workerTelemetryErasureAdapter.ts';
import { d1FirstRow } from './d1ResultHelpers.ts';
import { consumeLifecycleRpcNonce } from './d1InternalRpcNonceStore';

interface RecordedCall {
  readonly sql: string;
  readonly values: unknown[];
}

function createFakeD1(options?: {
  rejectNonceInsert?: boolean;
  rejectNonceCleanup?: boolean;
  blockMutationPermit?: boolean;
}) {
  const nonces = new Set<string>();
  const permits = new Map<string, { uid: string; releasedAtMs: number | null }>();
  const calls: RecordedCall[] = [];

  const db = {
    prepare(sql: string) {
      let values: unknown[] = [];
      const statement = {
        bind(...nextValues: unknown[]) {
          values = nextValues;
          return statement;
        },
        async first<T = Record<string, unknown>>(): Promise<T | null> {
          return null;
        },
        async all<T = Record<string, unknown>>() {
          return { results: [] as T[], success: true };
        },
        async run<T = unknown>() {
          calls.push({ sql, values: [...values] });

          if (sql.includes('INSERT OR IGNORE INTO lifecycle_internal_rpc_nonces')) {
            if (options?.rejectNonceInsert) {
              return { success: false, meta: { duration: 0, changes: 0 }, error: 'D1_UNAVAILABLE' };
            }
            const nonce = String(values[0]);
            if (nonces.has(nonce)) {
              return { success: true, meta: { duration: 0, changes: 0 } };
            }
            nonces.add(nonce);
            return { success: true, meta: { duration: 0, changes: 1 } };
          }

          if (sql.includes('DELETE FROM lifecycle_internal_rpc_nonces')) {
            if (options?.rejectNonceCleanup) throw new Error('CLEANUP_FAILED');
            return { success: true, meta: { duration: 0, changes: 0 } };
          }

          if (sql.includes('INSERT INTO account_mutation_permits')) {
            if (options?.blockMutationPermit) {
              return { success: true, meta: { duration: 0, changes: 0 } };
            }
            const permitId = String(values[0]);
            permits.set(permitId, { uid: String(values[1]), releasedAtMs: null });
            return { success: true, meta: { duration: 0, changes: 1 } };
          }

          if (sql.includes('UPDATE account_mutation_permits')) {
            const permitId = String(values[1]);
            const permit = permits.get(permitId);
            if (!permit || permit.releasedAtMs !== null) {
              return { success: true, meta: { duration: 0, changes: 0 } };
            }
            permit.releasedAtMs = Number(values[0]);
            return { success: true, meta: { duration: 0, changes: 1 } };
          }

          throw new Error('UNEXPECTED_SQL:' + sql);
        },
      };
      return statement;
    },
    async batch() {
      return [];
    },
    async exec() {
      return { count: 0, duration: 0 };
    },
    async dump() {
      return new ArrayBuffer(0);
    },
  } as unknown as D1Database;

  return { db, calls, nonces, permits };
}

test('consumes a nonce once and records the write-admission issuer and bounded expiry', async () => {
  const fake = createFakeD1();
  const result = await consumeLifecycleRpcNonce({
    db: fake.db,
    nonce: 'rpc_nonce_0001',
    nowMs: 1_000,
  });

  assert.deepEqual(result, { consumed: true });
  assert.equal(fake.nonces.has('rpc_nonce_0001'), true);

  const insert = fake.calls.find((call) => call.sql.includes('INSERT OR IGNORE INTO lifecycle_internal_rpc_nonces'));
  assert.ok(insert);
  assert.deepEqual(insert.values, [
    'rpc_nonce_0001',
    'WRITE_ADMISSION_RPC',
    601_000,
    '1970-01-01T00:00:01.000Z',
  ]);
});

test('rejects replayed nonces without extending or replacing the original claim', async () => {
  const fake = createFakeD1();
  const first = await consumeLifecycleRpcNonce({
    db: fake.db,
    nonce: 'rpc_nonce_replay',
    nowMs: 10_000,
  });
  const replay = await consumeLifecycleRpcNonce({
    db: fake.db,
    nonce: 'rpc_nonce_replay',
    nowMs: 20_000,
  });

  assert.deepEqual(first, { consumed: true });
  assert.deepEqual(replay, { consumed: false, code: 'RPC_NONCE_REPLAYED' });
  assert.equal(fake.calls.filter((call) => call.sql.includes('INSERT OR IGNORE INTO lifecycle_internal_rpc_nonces')).length, 2);
});

test('rejects malformed nonces before touching D1', async () => {
  const fake = createFakeD1();
  const tooShort = await consumeLifecycleRpcNonce({ db: fake.db, nonce: 'short' });
  const tooLong = await consumeLifecycleRpcNonce({ db: fake.db, nonce: 'n'.repeat(129) });

  assert.deepEqual(tooShort, { consumed: false, code: 'RPC_NONCE_INVALID' });
  assert.deepEqual(tooLong, { consumed: false, code: 'RPC_NONCE_INVALID' });
  assert.equal(fake.calls.length, 0);
});

test('fails closed when the nonce insert reports a D1 failure', async () => {
  const fake = createFakeD1({ rejectNonceInsert: true });
  const result = await consumeLifecycleRpcNonce({
    db: fake.db,
    nonce: 'rpc_nonce_store_failure',
    nowMs: 50_000,
  });

  assert.deepEqual(result, { consumed: false, code: 'RPC_NONCE_STORE_UNAVAILABLE' });
  assert.equal(fake.nonces.size, 0);
});

test('treats expired-nonce cleanup as best effort after a successful claim', async () => {
  const fake = createFakeD1({ rejectNonceCleanup: true });
  const result = await consumeLifecycleRpcNonce({
    db: fake.db,
    nonce: 'rpc_nonce_cleanup_failure',
    nowMs: 60_000,
  });

  assert.deepEqual(result, { consumed: true });
  assert.equal(fake.nonces.has('rpc_nonce_cleanup_failure'), true);
});

test('acquires a durable mutation permit using the canonical USER_DB helper contract', async () => {
  const fake = createFakeD1();
  const permit = await acquireMutationPermitInD1({
    userDb: fake.db,
    uid: 'user_123',
    operationName: 'POST /api/profile',
    nowMs: 10_000,
    ttlMs: 30_000,
  });

  assert.equal(permit.ok, true);
  if (!permit.ok) return;
  assert.equal(permit.uid, 'user_123');
  assert.equal(permit.operationName, 'POST /api/profile');
  assert.equal(permit.expiresAtMs, 40_000);

  const insert = fake.calls.find((call) => call.sql.includes('INSERT INTO account_mutation_permits'));
  assert.ok(insert);
  assert.equal(insert.values[1], 'user_123');
  assert.equal(insert.values[2], 'POST /api/profile');
  assert.equal(insert.values[3], 10_000);
  assert.equal(insert.values[4], 40_000);
});

test('returns the explicit blocked result when the atomic permit insert is denied', async () => {
  const fake = createFakeD1({ blockMutationPermit: true });
  const permit = await acquireMutationPermitInD1({
    userDb: fake.db,
    uid: 'user_blocked',
    operationName: 'POST /api/delete',
    nowMs: 70_000,
  });

  assert.deepEqual(permit, {
    ok: false,
    statusCode: 423,
    code: 'ACCOUNT_WRITE_BLOCKED',
  });
});

test('releases only the specified active mutation permit', async () => {
  const fake = createFakeD1();
  const permit = await acquireMutationPermitInD1({
    userDb: fake.db,
    uid: 'user_release',
    operationName: 'PATCH /api/privacy',
    nowMs: 80_000,
  });
  assert.equal(permit.ok, true);
  if (!permit.ok) return;

  await releaseMutationPermitInD1({
    userDb: fake.db,
    permitId: permit.permitId,
    nowMs: 81_000,
  });

  assert.equal(fake.permits.get(permit.permitId)?.releasedAtMs, 81_000);
});

// Adapter fault-injection harness. It deliberately exposes D1 result failures
// so deletion code cannot confuse an unavailable store with an empty page.
function createAdapterD1(options?: {
  failAll?: boolean;
  failRun?: boolean;
  runChanges?: number;
  selectedRows?: Record<string, unknown>[];
}): { db: D1DatabaseBinding; calls: Array<{ method: string; sql: string }> } {
  const calls: Array<{ method: string; sql: string }> = [];
  const db = {
    prepare(sql: string) {
      const statement = {
        bind(..._values: unknown[]) {
          return statement;
        },
        async all<T = Record<string, unknown>>() {
          calls.push({ method: 'all', sql });
          if (options?.failAll) {
            return { results: [] as T[], success: false };
          }
          return { results: (options?.selectedRows ?? []) as T[], success: true };
        },
        async first<T = unknown>() {
          calls.push({ method: 'first', sql });
          return null as T | null;
        },
        async run<T = unknown>() {
          calls.push({ method: 'run', sql });
          if (options?.failRun) {
            return { results: [] as T[], success: false, meta: { duration: 0, changes: 0 } };
          }
          return {
            results: [] as T[],
            success: true,
            meta: { duration: 0, changes: options?.runChanges ?? 1 },
          };
        },
      };
      return statement;
    },
    async batch() { return []; },
    async exec() { return { count: 0, duration: 0 }; },
    async dump() { return new ArrayBuffer(0); },
  } as unknown as D1DatabaseBinding;
  return { db, calls };
}

function isStoreUnavailable(error: unknown): boolean {
  return error instanceof AccountLifecycleStoreError &&
    error.code === 'STORE_UNAVAILABLE' &&
    error.httpStatus === 503;
}

test('d1FirstRow distinguishes an unavailable D1 read from a missing row', async () => {
  const fake = createAdapterD1({ failAll: true });
  await assert.rejects(
    () => d1FirstRow(fake.db, 'SELECT value FROM example WHERE id = ?1', 'x'),
    isStoreUnavailable,
  );
});

test('media listing refuses to treat a failed D1 query as an empty media page', async () => {
  const fake = createAdapterD1({ failAll: true });
  const adapter = createWorkerMediaDeletionAdapter({
    db: fake.db,
    bucketName: 'radar-media',
  });

  await assert.rejects(
    () => adapter.listOwnedMediaPage({ targetUid: 'uid_123', cursor: null, pageSize: 20 }),
    isStoreUnavailable,
  );
});

test('media deletion refuses to treat a failed D1 ownership lookup as already deleted', async () => {
  const fake = createAdapterD1({ failAll: true });
  const adapter = createWorkerMediaDeletionAdapter({
    db: fake.db,
    mediaBucket: { async delete() {} } as unknown as WorkerEnv['MEDIA_BUCKET'],
    bucketName: 'radar-media',
  });

  await assert.rejects(
    () => adapter.deleteOwnedMediaObject({
      actor: { uid: 'uid_123', isAdmin: true, freshAuthVerified: true },
      targetUid: 'uid_123',
      objectId: 'media_123',
      jobId: 'job_123',
    }),
    isStoreUnavailable,
  );
});

test('media deletion refuses to claim success when the D1 metadata update fails', async () => {
  const fake = createAdapterD1({
    selectedRows: [{
      object_id: 'media_123',
      owner_uid: 'uid_123',
      storage_key: 'objects/media_123',
      bucket_name: 'radar-media',
    }],
    failRun: true,
  });
  let bucketDeleteCount = 0;
  const adapter = createWorkerMediaDeletionAdapter({
    db: fake.db,
    mediaBucket: {
      async delete() { bucketDeleteCount += 1; },
    } as unknown as WorkerEnv['MEDIA_BUCKET'],
    bucketName: 'radar-media',
  });

  await assert.rejects(
    () => adapter.deleteOwnedMediaObject({
      actor: { uid: 'uid_123', isAdmin: true, freshAuthVerified: true },
      targetUid: 'uid_123',
      objectId: 'media_123',
      jobId: 'job_123',
    }),
    isStoreUnavailable,
  );
  assert.equal(bucketDeleteCount, 1);
});

test('media deletion refuses an unconfirmed zero-row D1 metadata update', async () => {
  const fake = createAdapterD1({
    selectedRows: [{
      object_id: 'media_123',
      owner_uid: 'uid_123',
      storage_key: 'objects/media_123',
      bucket_name: 'radar-media',
    }],
    runChanges: 0,
  });
  const adapter = createWorkerMediaDeletionAdapter({
    db: fake.db,
    mediaBucket: { async delete() {} } as unknown as WorkerEnv['MEDIA_BUCKET'],
    bucketName: 'radar-media',
  });

  await assert.rejects(
    () => adapter.deleteOwnedMediaObject({
      actor: { uid: 'uid_123', isAdmin: true, freshAuthVerified: true },
      targetUid: 'uid_123',
      objectId: 'media_123',
      jobId: 'job_123',
    }),
    isStoreUnavailable,
  );
});

test('telemetry erasure refuses to treat a failed D1 query as an empty page', async () => {
  const fake = createAdapterD1({ failAll: true });
  const adapter = createWorkerD1TelemetryErasureAdapter(fake.db);

  await assert.rejects(
    () => adapter.purgeAttributableTelemetryBatch({
      targetUid: 'uid_123',
      jobId: 'job_123',
      dataClass: 'PSEUDONYMOUS_ATTRIBUTABLE',
      cursor: null,
      batchSize: 20,
    }),
    isStoreUnavailable,
  );
});

test('telemetry erasure stops when a D1 delete is not confirmed', async () => {
  const fake = createAdapterD1({
    selectedRows: [{ audit_id: 'audit_001', recorded_at_iso: '2026-11-23T00:00:00.000Z' }],
    failRun: true,
  });
  const adapter = createWorkerD1TelemetryErasureAdapter(fake.db);

  await assert.rejects(
    () => adapter.purgeAttributableTelemetryBatch({
      targetUid: 'uid_123',
      jobId: 'job_123',
      dataClass: 'PSEUDONYMOUS_ATTRIBUTABLE',
      cursor: null,
      batchSize: 20,
    }),
    isStoreUnavailable,
  );
});

test('telemetry receipt counts only rows actually deleted by D1', async () => {
  const fake = createAdapterD1({
    selectedRows: [{ audit_id: 'audit_001', recorded_at_iso: '2026-11-23T00:00:00.000Z' }],
    runChanges: 0,
  });
  const adapter = createWorkerD1TelemetryErasureAdapter(fake.db);
  const result = await adapter.purgeAttributableTelemetryBatch({
    targetUid: 'uid_123',
    jobId: 'job_123',
    dataClass: 'PSEUDONYMOUS_ATTRIBUTABLE',
    cursor: null,
    batchSize: 20,
  });

  assert.equal(result.receipts[0]?.recordsErased, 0);
});
