/**
 * @file tests/object-storage-recovery-retry.test.ts
 *
 * Concurrency and retry tests for the deletion state machine.
 */

import assert from 'node:assert/strict';

import {
  deleteStoredObjectWithRetry,
} from '../src/utils/serverObjectStorageCleanup';

import type {
  StoredObjectRecord,
} from '../src/utils/serverObjectStorageHelpers';

function makeRecord(
  overrides: Partial<StoredObjectRecord> = {},
): StoredObjectRecord {
  const id =
    overrides.id ??
    'obj-1781000000000-a1b2c3d4';

  const localFileName =
    overrides.localFileName ??
    `${id}.webp`;

  return {
    id,
    objectKey:
      overrides.objectKey ??
      `listings/tehran/hood-1/image/2026-10/${localFileName}`,

    bucket:
      overrides.bucket ??
      'tehran-housing-radar-media',

    provider:
      overrides.provider ??
      'arvancloud',

    mediaType:
      overrides.mediaType ??
      'image',

    mimeType:
      overrides.mimeType ??
      'image/webp',

    sizeBytes:
      overrides.sizeBytes ??
      2048,

    url:
      overrides.url ??
      `/api/object-storage/file/${id}`,

    remoteS3Synced:
      overrides.remoteS3Synced ??
      true,

    createdAtIso:
      overrides.createdAtIso ??
      '2026-10-28T00:00:00.000Z',

    localFileName,

    ownerUid:
      overrides.ownerUid ??
      'user-lock-test-1',

    bargainId:
      overrides.bargainId,

    deletionState:
      overrides.deletionState,
  };
}

async function testConcurrentDeletionUsesOneLock(): Promise<void> {
  const record = makeRecord({
    id: 'obj-1781000000001-11111111',
    remoteS3Synced: true,
    bargainId: 'bargain_concurrent_12345',
  });

  const records: StoredObjectRecord[] = [
    record,
  ];

  let releaseRemoteDelete: () => void = () => {};

  const remoteDeleteGate = new Promise<void>(
    (resolve) => {
      releaseRemoteDelete = resolve;
    },
  );

  let remoteCalls = 0;
  let localCalls = 0;

  const deps = {
    records,

    persistIndex: async () => {},

    deleteRemote: async () => {
      remoteCalls += 1;
      await remoteDeleteGate;
      return true;
    },

    deleteLocal: async () => {
      localCalls += 1;
    },
  };

  const firstAttemptPromise =
    deleteStoredObjectWithRetry(
      record.id,
      {
        kind: 'bargain',
        bargainId: 'bargain_concurrent_12345',
      },
      deps,
    );

  // Yield once so the first call acquires the lock and reaches deleteRemote.
  await Promise.resolve();

  const secondAttempt =
    await deleteStoredObjectWithRetry(
      record.id,
      {
        kind: 'bargain',
        bargainId: 'bargain_concurrent_12345',
      },
      deps,
    );

  assert.deepEqual(secondAttempt, {
    status: 'failed',
    objectId: record.id,
    reason: 'already_in_progress',
    retryable: true,
  });

  releaseRemoteDelete();

  const firstAttempt =
    await firstAttemptPromise;

  assert.deepEqual(firstAttempt, {
    status: 'deleted',
    objectId: record.id,
  });

  assert.equal(remoteCalls, 1);
  assert.equal(localCalls, 1);
  assert.equal(records.length, 0);
}

async function testRemoteFailureIsRetryable(): Promise<void> {
  const record = makeRecord({
    id: 'obj-1781000000002-22222222',
    remoteS3Synced: true,
  });

  const records: StoredObjectRecord[] = [
    record,
  ];

  let remoteShouldSucceed = false;
  let remoteCalls = 0;
  let localCalls = 0;

  const deps = {
    records,

    persistIndex: async () => {},

    deleteRemote: async () => {
      remoteCalls += 1;
      return remoteShouldSucceed;
    },

    deleteLocal: async () => {
      localCalls += 1;
    },
  };

  const first =
    await deleteStoredObjectWithRetry(
      record.id,
      { kind: 'unattached_only' },
      deps,
    );

  assert.deepEqual(first, {
    status: 'failed',
    objectId: record.id,
    reason: 'remote_delete_failed',
    retryable: true,
  });

  assert.equal(records.length, 1);
  assert.equal(
    records[0].deletionState,
    'pending_delete',
  );
  assert.equal(
    records[0].remoteS3Synced,
    true,
  );
  assert.equal(localCalls, 0);

  remoteShouldSucceed = true;

  const second =
    await deleteStoredObjectWithRetry(
      record.id,
      { kind: 'unattached_only' },
      deps,
    );

  assert.deepEqual(second, {
    status: 'deleted',
    objectId: record.id,
  });

  assert.equal(remoteCalls, 2);
  assert.equal(localCalls, 1);
  assert.equal(records.length, 0);
}

async function testLocalFailureDoesNotRepeatCompletedRemoteDeletion(): Promise<void> {
  const record = makeRecord({
    id: 'obj-1781000000003-33333333',
    remoteS3Synced: true,
  });

  const records: StoredObjectRecord[] = [
    record,
  ];

  let localShouldSucceed = false;
  let remoteCalls = 0;
  let localCalls = 0;

  const deps = {
    records,

    persistIndex: async () => {},

    deleteRemote: async () => {
      remoteCalls += 1;
      return true;
    },

    deleteLocal: async () => {
      localCalls += 1;

      if (!localShouldSucceed) {
        throw new Error('DISK_BUSY');
      }
    },
  };

  const first =
    await deleteStoredObjectWithRetry(
      record.id,
      { kind: 'unattached_only' },
      deps,
    );

  assert.deepEqual(first, {
    status: 'failed',
    objectId: record.id,
    reason: 'local_delete_failed',
    retryable: true,
  });

  assert.equal(remoteCalls, 1);
  assert.equal(localCalls, 1);
  assert.equal(records.length, 1);
  assert.equal(
    records[0].deletionState,
    'pending_delete',
  );
  assert.equal(
    records[0].remoteS3Synced,
    false,
  );

  localShouldSucceed = true;

  const second =
    await deleteStoredObjectWithRetry(
      record.id,
      { kind: 'unattached_only' },
      deps,
    );

  assert.deepEqual(second, {
    status: 'deleted',
    objectId: record.id,
  });

  // Remote delete was already persisted as completed.
  assert.equal(remoteCalls, 1);
  assert.equal(localCalls, 2);
  assert.equal(records.length, 0);
}

async function testFirstPersistenceFailureStopsAllDeletes(): Promise<void> {
  const record = makeRecord({
    id: 'obj-1781000000004-44444444',
    deletionState: 'active',
    remoteS3Synced: true,
  });

  const records: StoredObjectRecord[] = [
    record,
  ];

  let remoteCalls = 0;
  let localCalls = 0;

  const result =
    await deleteStoredObjectWithRetry(
      record.id,
      { kind: 'unattached_only' },
      {
        records,

        persistIndex: async () => {
          throw new Error('INDEX_UNWRITABLE');
        },

        deleteRemote: async () => {
          remoteCalls += 1;
          return true;
        },

        deleteLocal: async () => {
          localCalls += 1;
        },
      },
    );

  assert.deepEqual(result, {
    status: 'failed',
    objectId: record.id,
    reason: 'index_persist_failed',
    retryable: true,
  });

  assert.equal(remoteCalls, 0);
  assert.equal(localCalls, 0);
  assert.equal(records.length, 1);
  assert.equal(
    records[0].deletionState,
    'active',
  );
}

async function testInvalidRecordNeverReachesExternalStorage(): Promise<void> {
  const badRecord = makeRecord({
    id: 'obj-1781000000005-55555555',
    localFileName: '../unsafe.webp',
  });

  const records: StoredObjectRecord[] = [
    badRecord,
  ];

  let persistCalls = 0;
  let remoteCalls = 0;
  let localCalls = 0;

  const result =
    await deleteStoredObjectWithRetry(
      badRecord.id,
      { kind: 'unattached_only' },
      {
        records,

        persistIndex: async () => {
          persistCalls += 1;
        },

        deleteRemote: async () => {
          remoteCalls += 1;
          return true;
        },

        deleteLocal: async () => {
          localCalls += 1;
        },
      },
    );

  assert.deepEqual(result, {
    status: 'failed',
    objectId: badRecord.id,
    reason: 'invalid_record',
    retryable: false,
  });

  assert.equal(persistCalls, 0);
  assert.equal(remoteCalls, 0);
  assert.equal(localCalls, 0);
  assert.equal(records.length, 1);
}

async function testRetryAfterRemoteDeleteSucceededButIndexWriteFailed(): Promise<void> {
  const initialRecord = makeRecord({
    id: 'obj-1781000000006-66666666',
    remoteS3Synced: true,
  });

  /*
   * Simulates the durable index file on disk.
   * Only successful persistIndex() calls update this snapshot.
   */
  let durableSnapshot: StoredObjectRecord[] = [
    structuredClone(initialRecord),
  ];

  /*
   * Simulates the remote object in S3.
   */
  const remoteObjects = new Set<string>([
    initialRecord.objectKey,
  ]);

  /*
   * Simulates the local file in .object-storage-bucket.
   */
  const localFiles = new Set<string>([
    initialRecord.localFileName,
  ]);

  let persistCallCount = 0;
  let remoteDeleteCalls = 0;
  let localDeleteCalls = 0;

  /*
   * First server process:
   * - persist #1 (pending_delete) succeeds;
   * - remote delete removes the object from S3;
   * - persist #2 (remoteS3Synced = false) fails.
   */
  const firstProcessRecords: StoredObjectRecord[] =
    structuredClone(durableSnapshot);

  const firstAttempt =
    await deleteStoredObjectWithRetry(
      initialRecord.id,
      { kind: 'unattached_only' },
      {
        records: firstProcessRecords,

        persistIndex: async () => {
          persistCallCount += 1;

          if (persistCallCount === 2) {
            throw new Error(
              'SIMULATED_DISK_FAILURE_AFTER_REMOTE_DELETE',
            );
          }

          durableSnapshot =
            structuredClone(firstProcessRecords);
        },

        deleteRemote: async (record) => {
          remoteDeleteCalls += 1;

          // S3 DeleteObject is idempotent:
          // deleting an existing or already-deleted key succeeds.
          remoteObjects.delete(record.objectKey);
          return true;
        },

        deleteLocal: async (record) => {
          localDeleteCalls += 1;
          localFiles.delete(record.localFileName);
        },
      },
    );

  assert.deepEqual(firstAttempt, {
    status: 'failed',
    objectId: initialRecord.id,
    reason: 'index_persist_failed',
    retryable: true,
  });

  // The remote object was already deleted before persist #2 failed.
  assert.equal(
    remoteObjects.has(initialRecord.objectKey),
    false,
  );

  // Local delete was not reached in the first process.
  assert.equal(localDeleteCalls, 0);
  assert.equal(
    localFiles.has(initialRecord.localFileName),
    true,
  );

  // The durable disk snapshot still has remoteS3Synced = true,
  // because persist #2 failed.
  assert.equal(durableSnapshot.length, 1);
  assert.equal(
    durableSnapshot[0].deletionState,
    'pending_delete',
  );
  assert.equal(
    durableSnapshot[0].remoteS3Synced,
    true,
  );

  /*
   * Second server process:
   * - loads the durable disk snapshot from persist #1;
   * - sees pending_delete and remoteS3Synced = true;
   * - calls deleteRemote again;
   * - idempotent remote delete returns true even though the key is gone;
   * - deletes the local file and removes the index record.
   */
  const restartedProcessRecords: StoredObjectRecord[] =
    structuredClone(durableSnapshot);

  const secondAttempt =
    await deleteStoredObjectWithRetry(
      initialRecord.id,
      { kind: 'unattached_only' },
      {
        records: restartedProcessRecords,

        persistIndex: async () => {
          durableSnapshot =
            structuredClone(restartedProcessRecords);
        },

        deleteRemote: async (record) => {
          remoteDeleteCalls += 1;

          // Still idempotent when the object is already absent.
          remoteObjects.delete(record.objectKey);
          return true;
        },

        deleteLocal: async (record) => {
          localDeleteCalls += 1;
          localFiles.delete(record.localFileName);
        },
      },
    );

  assert.deepEqual(secondAttempt, {
    status: 'deleted',
    objectId: initialRecord.id,
  });

  assert.equal(remoteDeleteCalls, 2);
  assert.equal(localDeleteCalls, 1);
  assert.equal(
    localFiles.has(initialRecord.localFileName),
    false,
  );
  assert.equal(
    durableSnapshot.length,
    0,
  );
}

async function run(): Promise<void> {
  await testConcurrentDeletionUsesOneLock();
  await testRemoteFailureIsRetryable();
  await testLocalFailureDoesNotRepeatCompletedRemoteDeletion();
  await testFirstPersistenceFailureStopsAllDeletes();
  await testInvalidRecordNeverReachesExternalStorage();
  await testRetryAfterRemoteDeleteSucceededButIndexWriteFailed();

  console.log(
    'Object Storage recovery and retry tests passed.',
  );
}

run().catch((error) => {
  console.error(
    '[OBJECT_STORAGE_RECOVERY_RETRY_TEST_FAILED]',
    error instanceof Error
      ? error.stack ?? error.message
      : error,
  );
  process.exitCode = 1;
});
