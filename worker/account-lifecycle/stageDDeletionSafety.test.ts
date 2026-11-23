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

type FakeOptions = {
  rows?: Record<string, unknown>[];
  readFails?: boolean;
  writeFails?: boolean;
  changes?: number;
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
          if (options.readFails) return { success: false, results: [] as T[] };
          return { success: true, results: (options.rows ?? []) as T[] };
        },
        async run<T = unknown>() {
          calls.push({ method: 'run', sql, values: [...values] });
          return {
            success: !options.writeFails,
            meta: { duration: 0, changes: options.changes ?? 1 },
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
