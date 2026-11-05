/**
 * @file tests/object-storage-pending-delete-recovery.test.ts
 *
 * Unit tests for pending-delete recovery decisions.
 *
 * These tests do not use Firestore or S3.
 * They verify that recovery never deletes an object unless its
 * deletion state and association rules are both satisfied.
 */

import assert from 'node:assert/strict';

import {
  decidePendingDeleteRecovery,
} from '../src/utils/serverObjectStorageCleanup';

import type {
  StoredObjectRecord,
} from '../src/utils/serverObjectStorageHelpers';

function makeRecord(
  overrides: Partial<StoredObjectRecord> = {},
): StoredObjectRecord {
  const id =
    overrides.id ??
    'obj-1780000000000-a1b2c3d4';

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
      1024,

    url:
      overrides.url ??
      `/api/object-storage/file/${id}`,

    remoteS3Synced:
      overrides.remoteS3Synced ??
      false,

    createdAtIso:
      overrides.createdAtIso ??
      '2026-10-28T00:00:00.000Z',

    localFileName,

    ownerUid:
      overrides.ownerUid ??
      'user-recovery-1',

    bargainId: overrides.bargainId,
    deletionState: overrides.deletionState,
  };
}

// ---------------------------------------------------------------------------
// 1. Active records are never recovered as pending deletes
// ---------------------------------------------------------------------------

{
  const record = makeRecord({
    deletionState: 'active',
  });

  const decision =
    decidePendingDeleteRecovery(record);

  assert.deepEqual(decision, {
    action: 'skip_not_pending',
    objectId: record.id,
  });
}

// ---------------------------------------------------------------------------
// 2. Legacy records without deletionState are skipped
// ---------------------------------------------------------------------------

{
  const record = makeRecord({
    deletionState: undefined,
  });

  const decision =
    decidePendingDeleteRecovery(record);

  assert.deepEqual(decision, {
    action: 'skip_not_pending',
    objectId: record.id,
  });
}

// ---------------------------------------------------------------------------
// 3. Unattached pending_delete record can be retried
// ---------------------------------------------------------------------------

{
  const record = makeRecord({
    deletionState: 'pending_delete',
    bargainId: undefined,
  });

  const decision =
    decidePendingDeleteRecovery(record);

  assert.deepEqual(decision, {
    action: 'retry_delete',
    objectId: record.id,
    policy: {
      kind: 'unattached_only',
    },
  });
}

// ---------------------------------------------------------------------------
// 4. Bargain-attached pending_delete record requires Firestore state
// ---------------------------------------------------------------------------

{
  const record = makeRecord({
    deletionState: 'pending_delete',
    bargainId: 'bargain_recovery_12345',
  });

  const decision =
    decidePendingDeleteRecovery(record);

  assert.deepEqual(decision, {
    action: 'blocked',
    objectId: record.id,
    reason: 'missing_firestore_state',
  });
}

// ---------------------------------------------------------------------------
// 5. Existing bargain document blocks recovery deletion
// ---------------------------------------------------------------------------

{
  const record = makeRecord({
    deletionState: 'pending_delete',
    bargainId: 'bargain_recovery_12345',
  });

  const decision =
    decidePendingDeleteRecovery(record, {
      bargainExists: true,
      ownerExists: false,
    });

  assert.deepEqual(decision, {
    action: 'blocked',
    objectId: record.id,
    reason: 'bargain_still_exists',
  });
}

// ---------------------------------------------------------------------------
// 6. Existing owner document blocks recovery deletion
// ---------------------------------------------------------------------------

{
  const record = makeRecord({
    deletionState: 'pending_delete',
    bargainId: 'bargain_recovery_12345',
  });

  const decision =
    decidePendingDeleteRecovery(record, {
      bargainExists: false,
      ownerExists: true,
    });

  assert.deepEqual(decision, {
    action: 'blocked',
    objectId: record.id,
    reason: 'owner_still_exists',
  });
}

// ---------------------------------------------------------------------------
// 7. Bargain-attached pending_delete record is retried only after
//    both bargain and owner documents are absent
// ---------------------------------------------------------------------------

{
  const record = makeRecord({
    deletionState: 'pending_delete',
    bargainId: 'bargain_recovery_12345',
  });

  const decision =
    decidePendingDeleteRecovery(record, {
      bargainExists: false,
      ownerExists: false,
    });

  assert.deepEqual(decision, {
    action: 'retry_delete',
    objectId: record.id,
    policy: {
      kind: 'bargain',
      bargainId: 'bargain_recovery_12345',
    },
  });
}

// ---------------------------------------------------------------------------
// 8. Corrupted localFileName is blocked before any file operation
// ---------------------------------------------------------------------------

{
  const record = makeRecord({
    deletionState: 'pending_delete',
    localFileName: '../outside.webp',
  });

  const decision =
    decidePendingDeleteRecovery(record);

  assert.deepEqual(decision, {
    action: 'blocked',
    objectId: record.id,
    reason: 'invalid_record',
  });
}

// ---------------------------------------------------------------------------
// 9. Corrupted bargainId is blocked before any Firestore or file action
// ---------------------------------------------------------------------------

{
  const record = makeRecord({
    deletionState: 'pending_delete',
    bargainId: '../bad',
  });

  const decision =
    decidePendingDeleteRecovery(record, {
      bargainExists: false,
      ownerExists: false,
    });

  assert.deepEqual(decision, {
    action: 'blocked',
    objectId: record.id,
    reason: 'invalid_record',
  });
}

// ---------------------------------------------------------------------------
// 10. Non-object input is blocked safely
// ---------------------------------------------------------------------------

{
  const decision =
    decidePendingDeleteRecovery(null);

  assert.deepEqual(decision, {
    action: 'blocked',
    objectId: '',
    reason: 'invalid_record',
  });
}

console.log(
  'Pending-delete recovery decision tests passed.',
);
