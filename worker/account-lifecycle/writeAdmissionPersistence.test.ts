import test from 'node:test';
import assert from 'node:assert/strict';
import type { D1Database } from '../types';
import {
  acquireMutationPermitInD1,
  releaseMutationPermitInD1,
} from './d1MutationPermit';
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
