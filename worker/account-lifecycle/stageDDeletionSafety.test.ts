import test from 'node:test';
import assert from 'node:assert/strict';
import type { D1DatabaseBinding } from '../db/types.ts';
import type { WorkerEnv } from '../types.ts';
import { AccountLifecycleStoreError } from '../../server/modules/account-lifecycle/storeContract.ts';
import {
  isStageDLifecycleEnabled,
  recoverPendingLifecycleDispatch,
  requireWorkerLifecycleBindings,
} from './stageDLifecycleRuntime.ts';
import { d1FirstRow } from './d1ResultHelpers.ts';
import { createWorkerMediaDeletionAdapter } from './workerMediaAdapter.ts';
import { createWorkerD1TelemetryErasureAdapter } from './workerTelemetryErasureAdapter.ts';
import { createWorkerD1DomainAdapters } from './workerD1DomainAdapters.ts';
import { D1AccountLifecycleDispatch } from './d1LifecycleDispatch.ts';

type FakeOptions = {
  rows?: Record<string, unknown>[];
  rowsBySqlIncludes?: Record<string, Record<string, unknown>[]>;
  readFails?: boolean;
  readFailsFor?: string[];
  writeFails?: boolean;
  writeFailsFor?: string[];
  changes?: number;
  changesBySqlIncludes?: Record<string, number>;
};

function fakeD1(options: FakeOptions = {}): {
  db: D1DatabaseBinding;
  calls: Array<{ method: string; sql: string; values: unknown[] }>;
} {
  const calls: Array<{ method: string; sql: string; values: unknown[] }> = [];
  const db = {
    prepare(sql: string) {
      let values: unknown[] = [];
      const statement = {
        bind(...next: unknown[]) { values = next; return statement; },
        async all<T = Record<string, unknown>>() {
          calls.push({ method: 'all', sql, values: [...values] });
          if (options.readFails || options.readFailsFor?.some((fragment) => sql.includes(fragment))) {
            return { success: false, results: [] as T[] };
          }
          const rowsEntry = Object.entries(options.rowsBySqlIncludes ?? {}).find(([fragment]) => sql.includes(fragment));
          const rows = rowsEntry?.[1] ?? options.rows ?? [];
          const boundedLimit = sql.includes('LIMIT ?3') && typeof values[2] === 'number'
            ? values[2] as number
            : undefined;
          return {
            success: true,
            results: (boundedLimit === undefined ? rows : rows.slice(0, boundedLimit)) as T[],
          };
        },
        async run<T = unknown>() {
          calls.push({ method: 'run', sql, values: [...values] });
          const changesEntry = Object.entries(options.changesBySqlIncludes ?? {}).find(([fragment]) => sql.includes(fragment));
          return {
            success: !(options.writeFails || options.writeFailsFor?.some((fragment) => sql.includes(fragment))),
            meta: { duration: 0, changes: changesEntry?.[1] ?? options.changes ?? 1 },
          };
        },
        async first<T = unknown>() { return null as T | null; },
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

test('d1FirstRow fails closed instead of treating a D1 error as an absent row', async () => {
  const { db } = fakeD1({ readFails: true });
  await assert.rejects(() => d1FirstRow(db, 'SELECT value FROM example'), isStoreUnavailable);
});

test('Stage D is disabled without an explicit flag and recovery touches neither D1 nor Queue', async () => {
  let reads = 0;
  let sends = 0;
  const db = {
    prepare() { reads += 1; throw new Error('UNEXPECTED_D1_ACCESS'); },
    async batch() { return []; },
    async exec() { return { count: 0, duration: 0 }; },
  } as unknown as D1DatabaseBinding;
  const env = {
    DB: db,
    RADAR_QUEUE: { async send() { sends += 1; } },
  } as unknown as WorkerEnv;

  assert.equal(isStageDLifecycleEnabled(env), false);
  assert.equal(await recoverPendingLifecycleDispatch(env, 25), 0);
  await assert.rejects(() => requireWorkerLifecycleBindings(env));
  assert.equal(reads, 0);
  assert.equal(sends, 0);
});

test('Stage D rejects USER_DB even when the opt-in flag is true', async () => {
  const { db } = fakeD1();
  const env = {
    DB: db,
    USER_DB: db,
    STAGE_D_LIFECYCLE_ENABLED: 'true',
  } as unknown as WorkerEnv;

  assert.equal(isStageDLifecycleEnabled(env), false);
  await assert.rejects(() => requireWorkerLifecycleBindings(env));
});

test('media adapter refuses to call a failed D1 list an empty page', async () => {
  const { db } = fakeD1({ readFails: true });
  const adapter = createWorkerMediaDeletionAdapter({ db, bucketName: 'radar-media' });
  await assert.rejects(
    () => adapter.listOwnedMediaPage({ targetUid: 'uid_1', cursor: null, pageSize: 10 }),
    isStoreUnavailable,
  );
});

test('media adapter uses correctly ordered D1 metadata placeholders', async () => {
  const { db, calls } = fakeD1({
    rows: [{
      object_id: 'media_1',
      owner_uid: 'uid_1',
      storage_key: 'objects/media_1',
      bucket_name: 'radar-media',
    }],
  });
  const adapter = createWorkerMediaDeletionAdapter({
    db,
    mediaBucket: { async delete() {} } as unknown as WorkerEnv['MEDIA_BUCKET'],
    bucketName: 'radar-media',
  });
  const result = await adapter.deleteOwnedMediaObject({
    actor: { uid: 'uid_1', isAdmin: true, freshAuthVerified: true },
    targetUid: 'uid_1',
    objectId: 'media_1',
    jobId: 'job_1',
  });
  assert.equal(result.status, 'DELETED');
  const update = calls.find((call) => call.method === 'run' && call.sql.includes('UPDATE media_objects'));
  assert.ok(update);
  assert.equal(update.values.length, 3);
  assert.equal(update.values[1], 'media_1');
  assert.equal(update.values[2], 'uid_1');
});

test('media adapter leaves metadata pending when the D1 transition fails', async () => {
  const { db } = fakeD1({
    rows: [{
      object_id: 'media_1',
      owner_uid: 'uid_1',
      storage_key: 'objects/media_1',
      bucket_name: 'radar-media',
    }],
    writeFails: true,
  });
  const adapter = createWorkerMediaDeletionAdapter({
    db,
    mediaBucket: { async delete() {} } as unknown as WorkerEnv['MEDIA_BUCKET'],
    bucketName: 'radar-media',
  });
  const result = await adapter.deleteOwnedMediaObject({
    actor: { uid: 'uid_1', isAdmin: true, freshAuthVerified: true },
    targetUid: 'uid_1',
    objectId: 'media_1',
    jobId: 'job_1',
  });
  assert.equal(result.status, 'PENDING_RETRY');
});

test('telemetry adapter fails closed on failed reads', async () => {
  const { db } = fakeD1({ readFails: true });
  const adapter = createWorkerD1TelemetryErasureAdapter(db);
  await assert.rejects(
    () => adapter.purgeAttributableTelemetryBatch({
      targetUid: 'uid_1', jobId: 'job_1', cursor: null, batchSize: 10,
    }),
    isStoreUnavailable,
  );
});

test('telemetry adapter fails closed when D1 cannot confirm deletion', async () => {
  const { db } = fakeD1({
    rows: [{ audit_id: 'audit_1', recorded_at_iso: '2026-11-23T00:00:00.000Z' }],
    changes: 0,
  });
  const adapter = createWorkerD1TelemetryErasureAdapter(db);
  await assert.rejects(
    () => adapter.purgeAttributableTelemetryBatch({
      targetUid: 'uid_1', jobId: 'job_1', cursor: null, batchSize: 10,
    }),
    isStoreUnavailable,
  );
});

test('D1 domain adapters fail closed when an ownership query fails', async () => {
  const { db } = fakeD1({ readFails: true });
  const adapter = createWorkerD1DomainAdapters(db).find((candidate) => candidate.source === 'MEDIA_METADATA');
  assert.ok(adapter);
  await assert.rejects(
    () => adapter.fetchOwnedRecordsPage({ targetUid: 'uid_1', cursor: null, pageSize: 10 }),
  );
});


test('USER_PROFILE adapter fails closed when upload-session D1 query fails', async () => {
  const { db } = fakeD1({ readFailsFor: ['FROM upload_sessions'] });
  const adapter = createWorkerD1DomainAdapters(db).find((candidate) => candidate.source === 'USER_PROFILE');
  assert.ok(adapter);
  await assert.rejects(
    () => adapter.fetchOwnedRecordsPage({ targetUid: 'uid_1', cursor: null, pageSize: 10 }),
  );
});

test('USER_PROFILE adapter fails closed when account data-request D1 query fails', async () => {
  const { db } = fakeD1({
    rowsBySqlIncludes: { 'FROM upload_sessions': [] },
    readFailsFor: ['FROM account_data_requests'],
  });
  const adapter = createWorkerD1DomainAdapters(db).find((candidate) => candidate.source === 'USER_PROFILE');
  assert.ok(adapter);
  await assert.rejects(
    () => adapter.fetchOwnedRecordsPage({ targetUid: 'uid_1', cursor: null, pageSize: 10 }),
  );
});

test('USER_PROFILE pages retain the final upload-session rows and fill only remaining capacity with requests', async () => {
  const { db } = fakeD1({
    rowsBySqlIncludes: {
      'FROM upload_sessions': [
        { session_id: 'session_1', owner_uid: 'uid_1', created_at_ms: 1_700_000_000_000 },
        { session_id: 'session_2', owner_uid: 'uid_1', created_at_ms: 1_700_000_000_001 },
      ],
      'FROM account_data_requests': [
        { request_id: 'request_1', target_uid: 'uid_1', requested_at_iso: '2026-11-23T00:00:00.000Z' },
        { request_id: 'request_2', target_uid: 'uid_1', requested_at_iso: '2026-11-23T00:00:01.000Z' },
      ],
    },
  });
  const adapter = createWorkerD1DomainAdapters(db).find((candidate) => candidate.source === 'USER_PROFILE');
  assert.ok(adapter);

  const page = await adapter.fetchOwnedRecordsPage({ targetUid: 'uid_1', cursor: null, pageSize: 3 });
  assert.deepEqual(page.items.map((item) => item.recordId), ['session_1', 'session_2', 'request_1']);
  assert.equal(page.items.length, 3);
  assert.equal(page.nextCursor, 'drq:request_1');
  assert.equal(page.hasMore, true);
});

test('USER_PROFILE deletion keeps a combined D1 batch within its requested size', async () => {
  const { db } = fakeD1({
    rowsBySqlIncludes: {
      'FROM upload_sessions': [
        { session_id: 'session_1', owner_uid: 'uid_1', created_at_ms: 1_700_000_000_000 },
        { session_id: 'session_2', owner_uid: 'uid_1', created_at_ms: 1_700_000_000_001 },
      ],
      'FROM account_data_requests': [
        { request_id: 'request_1', target_uid: 'uid_1', requested_at_iso: '2026-11-23T00:00:00.000Z' },
        { request_id: 'request_2', target_uid: 'uid_1', requested_at_iso: '2026-11-23T00:00:01.000Z' },
        { request_id: 'request_3', target_uid: 'uid_1', requested_at_iso: '2026-11-23T00:00:02.000Z' },
        { request_id: 'request_4', target_uid: 'uid_1', requested_at_iso: '2026-11-23T00:00:03.000Z' },
      ],
    },
  });
  const adapter = createWorkerD1DomainAdapters(db).find((candidate) => candidate.source === 'USER_PROFILE');
  assert.ok(adapter);

  const batch = await adapter.disposeOwnedRecordsBatch({
    targetUid: 'uid_1',
    cursor: null,
    batchSize: 3,
    jobId: 'job_1',
  });
  assert.deepEqual(batch.receipts.map((receipt) => receipt.recordId), ['session_1', 'session_2', 'request_1']);
  assert.equal(batch.receipts.length, 3);
  assert.equal(batch.nextCursor, 'drq:request_1');
  assert.equal(batch.hasMore, true);
});

test('upload-session deletion emits no success receipt when D1 deletion fails', async () => {
  const { db } = fakeD1({
    rowsBySqlIncludes: {
      'FROM upload_sessions': [{ session_id: 'session_1', owner_uid: 'uid_1', created_at_ms: 1_700_000_000_000 }],
    },
    writeFailsFor: ['DELETE FROM upload_sessions'],
  });
  const adapter = createWorkerD1DomainAdapters(db).find((candidate) => candidate.source === 'USER_PROFILE');
  assert.ok(adapter);
  await assert.rejects(
    () => adapter.disposeOwnedRecordsBatch({ targetUid: 'uid_1', cursor: null, batchSize: 10, jobId: 'job_1' }),
  );
});

test('data-request deletion emits no success receipt when D1 deletion fails', async () => {
  const { db } = fakeD1({
    rowsBySqlIncludes: {
      'FROM upload_sessions': [],
      'FROM account_data_requests': [{
        request_id: 'request_1',
        target_uid: 'uid_1',
        requested_at_iso: '2026-11-23T00:00:00.000Z',
      }],
    },
    writeFailsFor: ['DELETE FROM account_data_requests'],
  });
  const adapter = createWorkerD1DomainAdapters(db).find((candidate) => candidate.source === 'USER_PROFILE');
  assert.ok(adapter);
  await assert.rejects(
    () => adapter.disposeOwnedRecordsBatch({ targetUid: 'uid_1', cursor: null, batchSize: 10, jobId: 'job_1' }),
  );
});

test('media metadata domain disposition rejects an unconfirmed zero-row update', async () => {
  const { db } = fakeD1({
    rows: [{ object_id: 'media_1', owner_uid: 'uid_1', created_at_iso: '2026-11-23T00:00:00.000Z' }],
    changesBySqlIncludes: { 'UPDATE media_objects': 0 },
  });
  const adapter = createWorkerD1DomainAdapters(db).find((candidate) => candidate.source === 'MEDIA_METADATA');
  assert.ok(adapter);
  await assert.rejects(
    () => adapter.disposeOwnedRecordsBatch({ targetUid: 'uid_1', cursor: null, batchSize: 10, jobId: 'job_1' }),
  );
});

test('D1 media metadata deletion fails closed when its update fails', async () => {
  const { db } = fakeD1({
    rows: [{ object_id: 'media_1', owner_uid: 'uid_1', created_at_iso: '2026-11-23T00:00:00.000Z' }],
    writeFails: true,
  });
  const adapter = createWorkerD1DomainAdapters(db).find((candidate) => candidate.source === 'MEDIA_METADATA');
  assert.ok(adapter);
  await assert.rejects(
    () => adapter.disposeOwnedRecordsBatch({ targetUid: 'uid_1', cursor: null, batchSize: 10 }),
  );
});


test('USER_PROFILE pagination preserves the final upload-session page and fills only the remaining request capacity', async () => {
  const { db, calls } = fakeD1({
    rowsBySqlIncludes: {
      'FROM upload_sessions': [
        { session_id: 'session_1', owner_uid: 'uid_1', created_at_ms: 1_700_000_000_000 },
        { session_id: 'session_2', owner_uid: 'uid_1', created_at_ms: 1_700_000_000_001 },
      ],
      'FROM account_data_requests': [
        { request_id: 'request_1', target_uid: 'uid_1', requested_at_iso: '2026-11-23T00:00:00.000Z' },
        { request_id: 'request_2', target_uid: 'uid_1', requested_at_iso: '2026-11-23T00:00:01.000Z' },
      ],
    },
  });
  const adapter = createWorkerD1DomainAdapters(db).find((candidate) => candidate.source === 'USER_PROFILE');
  assert.ok(adapter);

  const page = await adapter.fetchOwnedRecordsPage({ targetUid: 'uid_1', cursor: null, pageSize: 5 });
  assert.deepEqual(
    page.items.map((item) => item.recordId),
    ['session_1', 'session_2', 'request_1', 'request_2'],
  );
  assert.equal(page.hasMore, false);
  assert.equal(page.nextCursor, null);

  const requestRead = calls.find((call) => call.method === 'all' && call.sql.includes('FROM account_data_requests'));
  assert.ok(requestRead);
  assert.deepEqual(requestRead.values, ['uid_1', '', 3]);
});

test('USER_PROFILE deletion keeps its combined session and request batch within the caller capacity', async () => {
  const { db, calls } = fakeD1({
    rowsBySqlIncludes: {
      'FROM upload_sessions': [
        { session_id: 'session_1', owner_uid: 'uid_1', created_at_ms: 1_700_000_000_000 },
      ],
      'FROM account_data_requests': [
        { request_id: 'request_1', target_uid: 'uid_1', requested_at_iso: '2026-11-23T00:00:00.000Z' },
        { request_id: 'request_2', target_uid: 'uid_1', requested_at_iso: '2026-11-23T00:00:01.000Z' },
      ],
    },
  });
  const adapter = createWorkerD1DomainAdapters(db).find((candidate) => candidate.source === 'USER_PROFILE');
  assert.ok(adapter);

  const batch = await adapter.disposeOwnedRecordsBatch({
    targetUid: 'uid_1',
    cursor: null,
    batchSize: 3,
    jobId: 'job_1',
  });
  assert.deepEqual(
    batch.receipts.map((receipt) => receipt.recordId),
    ['session_1', 'request_1', 'request_2'],
  );
  assert.equal(batch.receipts.length, 3);
  assert.equal(batch.hasMore, true);
  assert.equal(batch.nextCursor, 'drq:request_2');
  assert.equal(calls.filter((call) => call.method === 'run' && call.sql.startsWith('DELETE FROM')).length, 4);
  const requestRead = calls.find((call) => call.method === 'all' && call.sql.includes('FROM account_data_requests'));
  assert.ok(requestRead);
  assert.deepEqual(requestRead.values, ['uid_1', '', 2]);
});

test('D1 dispatch refuses a persisted lease with a corrupt fencing revision before attempting takeover', async () => {
  const { db, calls } = fakeD1({
    rowsBySqlIncludes: {
      'FROM account_deletion_job_leases': [{
        job_id: 'job_1',
        target_uid: 'uid_1',
        lease_token: 'existing_token',
        fencing_revision: 'not-a-number',
        lease_owner: 'worker_existing',
        lease_expires_at_ms: 60_000,
      }],
    },
  });
  const dispatch = new D1AccountLifecycleDispatch(db);

  await assert.rejects(
    () => dispatch.acquireJobLease({
      jobId: 'job_1',
      targetUid: 'uid_1',
      leaseToken: 'new_token',
      leaseOwner: 'worker_new',
      nowMs: 1_000,
    }),
    isStoreUnavailable,
  );
  assert.equal(calls.filter((call) => call.method === 'run').length, 0);
});

test('D1 dispatch does not report an outbox row sent unless D1 confirms DISPATCHED state', async () => {
  const { db } = fakeD1({
    rowsBySqlIncludes: {
      'FROM account_lifecycle_dispatch_outbox': [{
        event_id: 'event_1',
        job_id: 'job_1',
        dispatch_status: 'PENDING',
        idempotency_key: 'job_1:initial',
      }],
    },
    changesBySqlIncludes: { 'UPDATE account_lifecycle_dispatch_outbox': 0 },
  });
  const dispatch = new D1AccountLifecycleDispatch(db);

  await assert.rejects(
    () => dispatch.markDispatchSent('job_1:initial', '2026-11-24T00:00:00.000Z'),
    isStoreUnavailable,
  );
});

test('D1 dispatch accepts an outbox state already confirmed as DISPATCHED by a concurrent consumer', async () => {
  const { db } = fakeD1({
    rowsBySqlIncludes: {
      'FROM account_lifecycle_dispatch_outbox': [{
        event_id: 'event_1',
        job_id: 'job_1',
        dispatch_status: 'DISPATCHED',
        idempotency_key: 'job_1:initial',
      }],
    },
    changesBySqlIncludes: { 'UPDATE account_lifecycle_dispatch_outbox': 0 },
  });
  const dispatch = new D1AccountLifecycleDispatch(db);

  assert.equal(await dispatch.markDispatchSent('job_1:initial', '2026-11-24T00:00:00.000Z'), false);
});
