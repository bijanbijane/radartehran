/**
 * Retry and failure-injection tests for object-storage deletion.
 *
 * These tests do not access production Firebase, S3, or local media.
 * All side effects are injected through callbacks.
 */

import assert from 'node:assert/strict';

import {
  cleanupBargainObjects,
  deleteStoredObjectWithRetry,
  type ObjectStorageCleanupDependencies,
} from '../src/utils/serverObjectStorageCleanup';

import {
  isSafeStoredObjectRecord,
  type StoredObjectRecord,
} from '../src/utils/serverObjectStorageHelpers';

function fixtureRecord(
  id: string,
  bargainId: string | undefined,
  remoteS3Synced = false,
): StoredObjectRecord {
  const filename = `${id}.webp`;

  return {
    id,
    localFileName: filename,

    objectKey:
      `listings/tehran/hood-5/image/2026-10/${filename}`,

    bucket: 'tehran-housing-radar-media',
    provider: 'arvancloud',

    mediaType: 'image',
    mimeType: 'image/webp',

    sizeBytes: 128,

    url: `/api/object-storage/file/${id}`,

    remoteS3Synced,

    createdAtIso: new Date().toISOString(),

    ownerUid: 'test-user-a',

    ...(bargainId ? { bargainId } : {}),
  };
}

type FakeEnvironmentOptions = {
  records: StoredObjectRecord[];

  persist?: () => Promise<void>;

  deleteRemote?: (
    record: Readonly<StoredObjectRecord>,
  ) => Promise<boolean>;

  deleteLocal?: (
    record: Readonly<StoredObjectRecord>,
  ) => Promise<void>;
};

function fakeEnvironment(
  options: FakeEnvironmentOptions,
): {
  deps: ObjectStorageCleanupDependencies;
  persistedSnapshots: string[][];
  remoteDeletedIds: string[];
  localDeletedIds: string[];
} {
  const persistedSnapshots: string[][] = [];
  const remoteDeletedIds: string[] = [];
  const localDeletedIds: string[] = [];

  const deps: ObjectStorageCleanupDependencies = {
    records: options.records,

    persistIndex: async () => {
      if (options.persist) {
        await options.persist();
      }

      /*
       * Snapshot IDs and states rather than retaining references
       * to mutable objects.
       */
      persistedSnapshots.push(
        options.records.map(
          (record) =>
            `${record.id}:${record.deletionState ?? 'active'}:` +
            `${record.remoteS3Synced ? 'remote' : 'local-only'}`,
        ),
      );
    },

    deleteRemote: async (record) => {
      remoteDeletedIds.push(record.id);

      return options.deleteRemote
        ? options.deleteRemote(record)
        : true;
    },

    deleteLocal: async (record) => {
      localDeletedIds.push(record.id);

      if (options.deleteLocal) {
        await options.deleteLocal(record);
      }
    },

    isSafeRecord: isSafeStoredObjectRecord,
  };

  return {
    deps,
    persistedSnapshots,
    remoteDeletedIds,
    localDeletedIds,
  };
}

function assertStillPending(
  record: StoredObjectRecord,
): void {
  assert.equal(
    record.deletionState,
    'pending_delete',
  );
}

async function testSuccessfulDeletionRemovesOnlyTargetRecord(): Promise<void> {
  const bargainId = 'bargain_test_123456789';

  const target = fixtureRecord(
    'obj-1790000000000-a1b2c3d4',
    bargainId,
  );

  const unrelated = fixtureRecord(
    'obj-1790000000001-b2c3d4e5',
    'bargain_other_12345678',
  );

  const unattached = fixtureRecord(
    'obj-1790000000002-c3d4e5f6',
    undefined,
  );

  const records = [
    target,
    unrelated,
    unattached,
  ];

  const env = fakeEnvironment({
    records,
  });

  const result = await cleanupBargainObjects(
    bargainId,
    env.deps,
  );

  assert.equal(result.status, 'completed');
  assert.equal(result.candidateCount, 1);
  assert.equal(result.deletedCount, 1);
  assert.equal(result.failedCount, 0);

  assert.deepEqual(
    records.map((record) => record.id),
    [unrelated.id, unattached.id],
    'Only the targeted bargain-associated record may be removed',
  );

  assert.deepEqual(
    env.localDeletedIds,
    [target.id],
  );

  assert.deepEqual(
    env.remoteDeletedIds,
    [],
    'A local-only record must not trigger remote deletion',
  );
}

async function testRemoteFailureRetainsRetryableRecord(): Promise<void> {
  const bargainId = 'bargain_test_234567890';

  const record = fixtureRecord(
    'obj-1790000000010-a1b2c3d4',
    bargainId,
    true,
  );

  const records = [record];

  let remoteAttempts = 0;
  let localAttempts = 0;

  const env = fakeEnvironment({
    records,

    deleteRemote: async () => {
      remoteAttempts++;
      return false;
    },

    deleteLocal: async () => {
      localAttempts++;
    },
  });

  const result = await cleanupBargainObjects(
    bargainId,
    env.deps,
  );

  assert.equal(result.status, 'partial');
  assert.equal(result.deletedCount, 0);
  assert.equal(result.failedCount, 1);

  assert.equal(
    result.failures[0].reason,
    'remote_delete_failed',
  );

  assert.equal(
    result.failures[0].retryable,
    true,
  );

  assert.equal(remoteAttempts, 1);
  assert.equal(
    localAttempts,
    0,
    'Local deletion must stop after an unconfirmed remote deletion',
  );

  assert.equal(records.length, 1);
  assertStillPending(records[0]);

  assert.equal(
    records[0].remoteS3Synced,
    true,
    'Remote state must remain retryable',
  );
}

async function testLocalFailureCanBeRetriedWithoutRepeatingRemoteDelete(): Promise<void> {
  const bargainId = 'bargain_test_345678901';

  const record = fixtureRecord(
    'obj-1790000000020-a1b2c3d4',
    bargainId,
    true,
  );

  const records = [record];

  let remoteAttempts = 0;
  let localAttempts = 0;
  let failLocal = true;

  const env = fakeEnvironment({
    records,

    deleteRemote: async () => {
      remoteAttempts++;
      return true;
    },

    deleteLocal: async () => {
      localAttempts++;

      if (failLocal) {
        throw new Error('SIMULATED_LOCAL_DELETE_FAILURE');
      }
    },
  });

  const first = await cleanupBargainObjects(
    bargainId,
    env.deps,
  );

  assert.equal(first.status, 'partial');
  assert.equal(first.deletedCount, 0);
  assert.equal(first.failures[0].reason, 'local_delete_failed');

  assertStillPending(record);

  assert.equal(
    record.remoteS3Synced,
    false,
    'Successful remote deletion should be durably recorded',
  );

  assert.equal(remoteAttempts, 1);
  assert.equal(localAttempts, 1);
  assert.equal(records.length, 1);

  /*
   * Simulate recovery:
   * the local delete can succeed on the second attempt.
   */
  failLocal = false;

  const second = await cleanupBargainObjects(
    bargainId,
    env.deps,
  );

  assert.equal(second.status, 'completed');
  assert.equal(second.deletedCount, 1);
  assert.equal(second.failedCount, 0);

  assert.equal(
    remoteAttempts,
    1,
    'The remote object should not be deleted a second time once remoteS3Synced=false is durable',
  );

  assert.equal(
    records.length,
    0,
    'The index record should be removed after successful retry',
  );

  assert.equal(localAttempts, 2);
}

async function testInitialIndexFailurePreventsExternalDeletion(): Promise<void> {
  const bargainId = 'bargain_test_456789012';

  const record = fixtureRecord(
    'obj-1790000000030-a1b2c3d4',
    bargainId,
    true,
  );

  const records = [record];

  let persistAttempts = 0;
  let remoteAttempts = 0;
  let localAttempts = 0;

  const env = fakeEnvironment({
    records,

    persist: async () => {
      persistAttempts++;

      if (persistAttempts === 1) {
        throw new Error(
          'SIMULATED_INDEX_PERSIST_FAILURE',
        );
      }
    },

    deleteRemote: async () => {
      remoteAttempts++;
      return true;
    },

    deleteLocal: async () => {
      localAttempts++;
    },
  });

  const result = await cleanupBargainObjects(
    bargainId,
    env.deps,
  );

  assert.equal(result.status, 'partial');
  assert.equal(
    result.failures[0].reason,
    'index_persist_failed',
  );

  assert.equal(
    record.deletionState,
    undefined,
    'The in-memory deletion intent must be rolled back if it could not be persisted',
  );

  assert.equal(remoteAttempts, 0);
  assert.equal(localAttempts, 0);

  assert.equal(
    records.length,
    1,
    'The media record must remain untouched',
  );
}

async function testFinalIndexFailureRetainsPendingRecordForRetry(): Promise<void> {
  const bargainId = 'bargain_test_567890123';

  const record = fixtureRecord(
    'obj-1790000000040-a1b2c3d4',
    bargainId,
    true,
  );

  const records = [record];

  let persistAttempts = 0;
  let failOnThirdPersist = true;
  let remoteAttempts = 0;
  let localAttempts = 0;

  const env = fakeEnvironment({
    records,

    persist: async () => {
      persistAttempts++;

      /*
       * Persist #1: pending_delete.
       * Persist #2: remoteS3Synced=false.
       * Persist #3: final index removal. Fail this first time.
       */
      if (
        failOnThirdPersist &&
        persistAttempts === 3
      ) {
        throw new Error(
          'SIMULATED_FINAL_INDEX_FAILURE',
        );
      }
    },

    deleteRemote: async () => {
      remoteAttempts++;
      return true;
    },

    deleteLocal: async () => {
      localAttempts++;
    },
  });

  const first = await cleanupBargainObjects(
    bargainId,
    env.deps,
  );

  assert.equal(first.status, 'partial');
  assert.equal(
    first.failures[0].reason,
    'index_persist_failed',
  );

  assert.equal(records.length, 1);
  assertStillPending(records[0]);

  assert.equal(
    records[0].remoteS3Synced,
    false,
  );

  assert.equal(
    remoteAttempts,
    1,
    'The remote object was deleted only once',
  );

  assert.equal(
    localAttempts,
    1,
    'The local object may already be absent',
  );

  /*
   * A retry treats local ENOENT as success.
   * The fake callback represents an idempotent delete operation.
   */
  failOnThirdPersist = false;

  const retry = await cleanupBargainObjects(
    bargainId,
    env.deps,
  );

  assert.equal(retry.status, 'completed');
  assert.equal(retry.deletedCount, 1);
  assert.equal(records.length, 0);

  assert.equal(
    remoteAttempts,
    1,
    'Retry must not repeat a remote delete already recorded as complete',
  );

  assert.equal(localAttempts, 2);
}

async function testAnUnrelatedBargainIsNeverDeleted(): Promise<void> {
  const targetBargainId =
    'bargain_test_678901234';

  const otherBargainId =
    'bargain_test_789012345';

  const target = fixtureRecord(
    'obj-1790000000050-a1b2c3d4',
    targetBargainId,
  );

  const unrelated = fixtureRecord(
    'obj-1790000000051-b2c3d4e5',
    otherBargainId,
  );

  const records = [target, unrelated];

  const env = fakeEnvironment({
    records,
  });

  const result = await cleanupBargainObjects(
    targetBargainId,
    env.deps,
  );

  assert.equal(result.status, 'completed');
  assert.equal(result.deletedCount, 1);

  assert.equal(
    records.length,
    1,
  );

  assert.equal(
    records[0].id,
    unrelated.id,
    'Other bargain media must remain in the index',
  );

  assert.deepEqual(
    env.localDeletedIds,
    [target.id],
  );
}

async function testUnattachedObjectCannotBeDeletedByBargainCleanup(): Promise<void> {
  const bargainId = 'bargain_test_890123456';

  const unattached = fixtureRecord(
    'obj-1790000000060-a1b2c3d4',
    undefined,
  );

  const records = [unattached];

  let remoteAttempts = 0;
  let localAttempts = 0;

  const env = fakeEnvironment({
    records,

    deleteRemote: async () => {
      remoteAttempts++;
      return true;
    },

    deleteLocal: async () => {
      localAttempts++;
    },
  });

  const result = await deleteStoredObjectWithRetry(
    unattached.id,
    {
      kind: 'bargain',
      bargainId,
    },
    env.deps,
  );

  assert.equal(result.status, 'failed');

  if (result.status === 'failed') {
    assert.equal(
      result.reason,
      'association_mismatch',
    );

    assert.equal(result.retryable, false);
  }

  assert.equal(remoteAttempts, 0);
  assert.equal(localAttempts, 0);
  assert.equal(records.length, 1);
}

async function testUnattachedOnlyPolicyRejectsBargainMedia(): Promise<void> {
  const record = fixtureRecord(
    'obj-1790000000070-a1b2c3d4',
    'bargain_test_901234567',
  );

  const records = [record];

  let remoteAttempts = 0;
  let localAttempts = 0;

  const env = fakeEnvironment({
    records,

    deleteRemote: async () => {
      remoteAttempts++;
      return true;
    },

    deleteLocal: async () => {
      localAttempts++;
    },
  });

  const result = await deleteStoredObjectWithRetry(
    record.id,
    {
      kind: 'unattached_only',
    },
    env.deps,
  );

  assert.equal(result.status, 'failed');

  if (result.status === 'failed') {
    assert.equal(
      result.reason,
      'association_mismatch',
    );
  }

  assert.equal(remoteAttempts, 0);
  assert.equal(localAttempts, 0);
  assert.equal(records.length, 1);
}

async function testMissingObjectIsIdempotentlyReported(): Promise<void> {
  const records: StoredObjectRecord[] = [];

  const env = fakeEnvironment({
    records,
  });

  const result = await deleteStoredObjectWithRetry(
    'obj-1790000000080-a1b2c3d4',
    {
      kind: 'bargain',
      bargainId: 'bargain_test_012345678',
    },
    env.deps,
  );

  assert.equal(result.status, 'failed');

  if (result.status === 'failed') {
    assert.equal(result.reason, 'object_not_found');
    assert.equal(result.retryable, true);
  }
}

async function testInvalidRecordCannotTriggerStorageDeletion(): Promise<void> {
  const valid = fixtureRecord(
    'obj-1790000000090-a1b2c3d4',
    'bargain_test_123450987',
  );

  /*
   * Deliberately corrupt the object key.
   * The server validator must reject it before external callbacks run.
   */
  const invalid = {
    ...valid,
    objectKey: '../outside/private.webp',
  } as StoredObjectRecord;

  const records = [invalid];

  let remoteAttempts = 0;
  let localAttempts = 0;

  const env = fakeEnvironment({
    records,

    deleteRemote: async () => {
      remoteAttempts++;
      return true;
    },

    deleteLocal: async () => {
      localAttempts++;
    },
  });

  const result = await deleteStoredObjectWithRetry(
    invalid.id,
    {
      kind: 'bargain',
      bargainId: 'bargain_test_123450987',
    },
    env.deps,
  );

  assert.equal(result.status, 'failed');

  if (result.status === 'failed') {
    assert.equal(result.reason, 'invalid_record');
    assert.equal(result.retryable, false);
  }

  assert.equal(remoteAttempts, 0);
  assert.equal(localAttempts, 0);
  assert.equal(records.length, 1);
}

async function testNoAssociatedObjectsProducesNoDeletion(): Promise<void> {
  const records = [
    fixtureRecord(
      'obj-1790000000100-a1b2c3d4',
      'bargain_other_12345678',
    ),
  ];

  const env = fakeEnvironment({
    records,
  });

  const result = await cleanupBargainObjects(
    'bargain_test_234560987',
    env.deps,
  );

  assert.equal(
    result.status,
    'no_associated_objects',
  );

  assert.equal(result.candidateCount, 0);
  assert.equal(result.deletedCount, 0);
  assert.equal(result.failedCount, 0);

  assert.equal(
    records.length,
    1,
    'Unrelated media must remain untouched',
  );
}

async function main(): Promise<void> {
  const tests: Array<{
    name: string;
    run: () => Promise<void>;
  }> = [
    {
      name: 'successful deletion removes only the target record',
      run: testSuccessfulDeletionRemovesOnlyTargetRecord,
    },
    {
      name: 'remote failure retains retryable record',
      run: testRemoteFailureRetainsRetryableRecord,
    },
    {
      name: 'local failure can be retried',
      run: testLocalFailureCanBeRetriedWithoutRepeatingRemoteDelete,
    },
    {
      name: 'initial index failure prevents external deletion',
      run: testInitialIndexFailurePreventsExternalDeletion,
    },
    {
      name: 'final index failure retains a pending record',
      run: testFinalIndexFailureRetainsPendingRecordForRetry,
    },
    {
      name: 'unrelated bargain is never deleted',
      run: testAnUnrelatedBargainIsNeverDeleted,
    },
    {
      name: 'unattached media cannot be deleted by bargain cleanup',
      run: testUnattachedObjectCannotBeDeletedByBargainCleanup,
    },
    {
      name: 'unattached-only deletion rejects attached media',
      run: testUnattachedOnlyPolicyRejectsBargainMedia,
    },
    {
      name: 'missing objects are reported without external deletion',
      run: testMissingObjectIsIdempotentlyReported,
    },
    {
      name: 'invalid object records cannot trigger deletion',
      run: testInvalidRecordCannotTriggerStorageDeletion,
    },
    {
      name: 'empty target associations do not delete unrelated media',
      run: testNoAssociatedObjectsProducesNoDeletion,
    },
  ];

  let passed = 0;

  for (const test of tests) {
    await test.run();

    passed++;

    console.log(
      `[PASS] ${passed}/${tests.length} ${test.name}`,
    );
  }

  console.log(
    `All ${passed} Object Storage cleanup state-machine tests passed.`,
  );
}

main().catch((error) => {
  console.error(
    '[OBJECT_STORAGE_CLEANUP_TEST_FAILURE]',
    error instanceof Error
      ? error.stack ?? error.message
      : error,
  );

  process.exitCode = 1;
});
