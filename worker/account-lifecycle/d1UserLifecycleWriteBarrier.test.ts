import assert from 'node:assert/strict';
import test from 'node:test';
import type { D1Database } from '../types.ts';
import { AccountLifecycleStoreError } from '../../server/modules/account-lifecycle/storeContract.ts';
import {
  assertUserDbDeletionWriteBlock,
  assertNoActiveUserDbLegalHold,
  ensureUserDbDeletionWriteBlock,
  rebindUserDbDeletionWriteBlock,
  releaseUserDbDeletionWriteBlockIfOwned,
} from './d1UserLifecycleWriteBarrier.ts';

function fakeUserDb(params: {
  run?: { success: boolean; meta?: { changes?: number }; error?: string };
  row?: { uid: string; job_id: string; released_at_iso: string | null } | null;
  failRead?: boolean;
}): { db: D1Database; calls: Array<{ sql: string; values: unknown[] }> } {
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  const db = {
    prepare(sql: string) {
      let values: unknown[] = [];
      const statement = {
        bind(...next: unknown[]) {
          values = next;
          return statement;
        },
        async run() {
          calls.push({ sql, values });
          return params.run ?? { success: true, meta: { changes: 1 } };
        },
        async first() {
          if (params.failRead) throw new Error('synthetic USER_DB read failure');
          calls.push({ sql, values });
          return params.row ?? null;
        },
      };
      return statement;
    },
  } as unknown as D1Database;
  return { db, calls };
}

test('Stage D mirrors a matching write block to USER_DB without overwriting another active job', async () => {
  const { db, calls } = fakeUserDb({
    row: { uid: 'uid_1', job_id: 'job_1', released_at_iso: null },
  });
  await ensureUserDbDeletionWriteBlock({ userDb: db, uid: 'uid_1', jobId: 'job_1' });

  assert.equal(calls.length, 2);
  assert.match(calls[0].sql, /INSERT INTO account_write_blocks/);
  assert.match(calls[0].sql, /NOT EXISTS \([\s\S]*account_write_blocks/);
  assert.match(calls[0].sql, /NOT EXISTS \([\s\S]*account_deletion_jobs/);
  assert.match(calls[0].sql, /ON CONFLICT\(uid\) DO UPDATE/);
  assert.deepEqual(calls[0].values.slice(0, 2), ['uid_1', 'job_1']);
  assert.match(calls[1].sql, /SELECT uid, job_id, released_at_iso FROM account_write_blocks/);
});

test('Stage D refuses to replace a different active USER_DB write block', async () => {
  const { db } = fakeUserDb({
    run: { success: true, meta: { changes: 0 } },
    row: { uid: 'uid_1', job_id: 'legacy_job_2', released_at_iso: null },
  });
  await assert.rejects(
    () => ensureUserDbDeletionWriteBlock({ userDb: db, uid: 'uid_1', jobId: 'stage_job_1' }),
    (error: unknown) => error instanceof AccountLifecycleStoreError &&
      error.code === 'WRITE_BLOCK_UNVERIFIED' &&
      error.httpStatus === 503,
  );
});

test('Stage D refuses to proceed when USER_DB cannot persist the mirrored block', async () => {
  const { db } = fakeUserDb({ run: { success: false, error: 'database unavailable' } });
  await assert.rejects(
    () => ensureUserDbDeletionWriteBlock({ userDb: db, uid: 'uid_1', jobId: 'job_1' }),
    (error: unknown) => error instanceof AccountLifecycleStoreError &&
      error.code === 'STORE_UNAVAILABLE' &&
      error.httpStatus === 503,
  );
});

test('Stage D refuses a missing, released, or mismatched USER_DB write block', async () => {
  for (const row of [
    null,
    { uid: 'uid_1', job_id: 'job_1', released_at_iso: '2026-11-24T00:00:00.000Z' },
    { uid: 'uid_1', job_id: 'other_job', released_at_iso: null },
  ]) {
    const { db } = fakeUserDb({ row });
    await assert.rejects(
      () => assertUserDbDeletionWriteBlock({ userDb: db, uid: 'uid_1', jobId: 'job_1' }),
      (error: unknown) => error instanceof AccountLifecycleStoreError &&
        error.code === 'WRITE_BLOCK_UNVERIFIED' &&
        error.httpStatus === 503,
    );
  }
});

test('Stage D fails closed when USER_DB barrier verification cannot be read', async () => {
  const { db } = fakeUserDb({ failRead: true });
  await assert.rejects(
    () => assertUserDbDeletionWriteBlock({ userDb: db, uid: 'uid_1', jobId: 'job_1' }),
    /synthetic USER_DB read failure/,
  );
});

function fakeLegalHoldDb(params: {
  row?: { resource_id: string; reason: string } | null;
  failRead?: boolean;
}): D1Database {
  return {
    prepare(sql: string) {
      let values: unknown[] = [];
      const statement = {
        bind(...next: unknown[]) { values = next; return statement; },
        async first() {
          if (params.failRead) throw new Error('synthetic legal-hold lookup failure');
          assert.match(sql, /FROM legal_holds/);
          assert.deepEqual(values, ['user:uid_1', 'uid_1']);
          return params.row ?? null;
        },
      };
      return statement;
    },
  } as unknown as D1Database;
}

test('Stage D permits deletion only after both USER_DB legal-hold keys are clear', async () => {
  await assertNoActiveUserDbLegalHold({ userDb: fakeLegalHoldDb({ row: null }), uid: 'uid_1' });
});

test('Stage D refuses deletion when either USER_DB legal-hold key is active', async () => {
  await assert.rejects(
    () => assertNoActiveUserDbLegalHold({
      userDb: fakeLegalHoldDb({ row: { resource_id: 'user:uid_1', reason: 'court order' } }),
      uid: 'uid_1',
    }),
    (error: unknown) => error instanceof AccountLifecycleStoreError &&
      error.code === 'LEGAL_HOLD_ACTIVE' &&
      error.httpStatus === 409,
  );
});

test('Stage D refuses deletion when USER_DB legal-hold status cannot be verified', async () => {
  await assert.rejects(
    () => assertNoActiveUserDbLegalHold({ userDb: fakeLegalHoldDb({ failRead: true }), uid: 'uid_1' }),
    (error: unknown) => error instanceof AccountLifecycleStoreError &&
      error.code === 'STORE_UNAVAILABLE' &&
      error.httpStatus === 503,
  );
});



test('Stage D atomically rebinds its USER_DB reservation when another active lifecycle job won', async () => {
  const { db, calls } = fakeUserDb({
    row: { uid: 'uid_1', job_id: 'stage_job_2', released_at_iso: null },
  });
  await rebindUserDbDeletionWriteBlock({
    userDb: db,
    uid: 'uid_1',
    reservedJobId: 'reservation_job_1',
    authoritativeJobId: 'stage_job_2',
  });
  assert.equal(calls.length, 2);
  assert.match(calls[0].sql, /UPDATE account_write_blocks/);
  assert.match(calls[0].sql, /WHERE uid = \?4 AND job_id = \?5 AND released_at_iso IS NULL/);
  assert.deepEqual(calls[0].values.slice(0, 5), [
    'stage_job_2',
    'STAGE_D_ACCOUNT_DELETION_ACTIVE',
    calls[0].values[2],
    'uid_1',
    'reservation_job_1',
  ]);
  assert.match(calls[1].sql, /SELECT uid, job_id, released_at_iso FROM account_write_blocks/);
});

test('Stage D only rolls back the exact USER_DB reservation owned by the failed initiation', async () => {
  const releasedAt = '2026-11-24T00:00:00.000Z';
  const { db, calls } = fakeUserDb({
    row: { uid: 'uid_1', job_id: 'reservation_job_1', released_at_iso: releasedAt },
  });
  await releaseUserDbDeletionWriteBlockIfOwned({
    userDb: db,
    uid: 'uid_1',
    reservedJobId: 'reservation_job_1',
    nowIso: releasedAt,
  });
  assert.equal(calls.length, 2);
  assert.match(calls[0].sql, /UPDATE account_write_blocks/);
  assert.match(calls[0].sql, /WHERE uid = \?2 AND job_id = \?3 AND released_at_iso IS NULL/);
  assert.deepEqual(calls[0].values, [releasedAt, 'uid_1', 'reservation_job_1']);
  assert.match(calls[1].sql, /SELECT uid, job_id, released_at_iso FROM account_write_blocks/);
});
