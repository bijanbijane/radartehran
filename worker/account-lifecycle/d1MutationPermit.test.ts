import assert from 'node:assert/strict';
import test from 'node:test';
import type { D1Database } from '../types.ts';
import {
  acquireMutationPermitInD1,
  countActiveMutationPermitsInD1,
  releaseMutationPermitInD1,
  UserD1MutationPermitError,
} from './d1MutationPermit.ts';

type RunResult = { success: boolean; meta?: { changes?: number } };
type FakeOptions = {
  runResult?: RunResult;
  runError?: Error;
  row?: { released_at_ms: number | null } | { cnt: number | string } | null;
  firstError?: Error;
};

function fakeDb(options: FakeOptions = {}): { db: D1Database; calls: Array<{ sql: string; values: unknown[] }> } {
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  const db = {
    prepare(sql: string) {
      let values: unknown[] = [];
      const statement = {
        bind(...next: unknown[]) { values = next; return statement; },
        async run() {
          calls.push({ sql, values });
          if (options.runError) throw options.runError;
          return options.runResult ?? { success: true, meta: { changes: 1 } };
        },
        async first<T>() {
          calls.push({ sql, values });
          if (options.firstError) throw options.firstError;
          return (options.row ?? null) as T | null;
        },
      };
      return statement;
    },
  } as unknown as D1Database;
  return { db, calls };
}

test('USER_DB permit acquisition persists an atomic no-write-block INSERT', async () => {
  const { db, calls } = fakeDb({ runResult: { success: true, meta: { changes: 1 } } });
  const result = await acquireMutationPermitInD1({
    userDb: db,
    uid: 'uid_1',
    operationName: 'POST /api/profile',
    ttlMs: 120_000,
    nowMs: 1_800_000_000_000,
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.uid, 'uid_1');
    assert.equal(result.expiresAtMs, 1_800_000_120_000);
  }
  assert.match(calls[0].sql, /INSERT INTO account_mutation_permits/);
  assert.match(calls[0].sql, /WHERE NOT EXISTS \([\s\S]*account_write_blocks/);
  assert.deepEqual(calls[0].values.slice(1, 4), ['uid_1', 'POST /api/profile', 1_800_000_000_000]);
});

test('USER_DB permit acquisition reports an active write block only after a successful zero-row INSERT', async () => {
  const { db } = fakeDb({ runResult: { success: true, meta: { changes: 0 } } });
  const result = await acquireMutationPermitInD1({
    userDb: db,
    uid: 'uid_1',
    operationName: 'POST /api/profile',
    nowMs: 1_800_000_000_000,
  });
  assert.deepEqual(result, { ok: false, statusCode: 423, code: 'ACCOUNT_WRITE_BLOCKED' });
});

test('USER_DB permit acquisition fails with 503 on D1 write failure, not a false 423 block', async () => {
  const { db } = fakeDb({ runResult: { success: false } });
  await assert.rejects(
    () => acquireMutationPermitInD1({ userDb: db, uid: 'uid_1', operationName: 'POST /api/profile' }),
    (error: unknown) => error instanceof UserD1MutationPermitError && error.httpStatus === 503,
  );
});

test('USER_DB permit release is acknowledged only after the released timestamp is read back', async () => {
  const { db, calls } = fakeDb({
    row: { released_at_ms: 1_800_000_000_123 },
    runResult: { success: true, meta: { changes: 1 } },
  });
  await releaseMutationPermitInD1({ userDb: db, permitId: 'permit_1', nowMs: 1_800_000_000_123 });
  assert.match(calls[0].sql, /UPDATE account_mutation_permits SET released_at_ms/);
  assert.match(calls[1].sql, /SELECT released_at_ms FROM account_mutation_permits/);
});

test('USER_DB permit release fails closed when D1 does not confirm the update', async () => {
  const { db } = fakeDb({ runResult: { success: false } });
  await assert.rejects(
    () => releaseMutationPermitInD1({ userDb: db, permitId: 'permit_1' }),
    (error: unknown) => error instanceof UserD1MutationPermitError && error.httpStatus === 503,
  );
});

test('USER_DB permit release fails closed when the release timestamp is absent', async () => {
  const { db } = fakeDb({ row: { released_at_ms: null } });
  await assert.rejects(
    () => releaseMutationPermitInD1({ userDb: db, permitId: 'permit_1' }),
    (error: unknown) => error instanceof UserD1MutationPermitError && error.httpStatus === 503,
  );
});

test('USER_DB permit drain count returns a verified nonnegative integer', async () => {
  const { db } = fakeDb({ row: { cnt: '2' } });
  assert.equal(await countActiveMutationPermitsInD1(db, 'uid_1', 1_800_000_000_000), 2);
});

test('USER_DB permit drain count fails closed for missing, invalid, or unreadable results', async () => {
  for (const row of [null, { cnt: '-1' }, { cnt: 'not-a-number' }]) {
    const { db } = fakeDb({ row: row as FakeOptions['row'] });
    await assert.rejects(
      () => countActiveMutationPermitsInD1(db, 'uid_1'),
      (error: unknown) => error instanceof UserD1MutationPermitError && error.httpStatus === 503,
    );
  }
  const { db } = fakeDb({ firstError: new Error('synthetic read failure') });
  await assert.rejects(
    () => countActiveMutationPermitsInD1(db, 'uid_1'),
    (error: unknown) => error instanceof UserD1MutationPermitError && error.httpStatus === 503,
  );
});
