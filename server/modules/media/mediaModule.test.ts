/**
 * @fileoverview Comprehensive Verification Suite for Employee 6 — Media and Object Storage Backend Module
 * (`server/modules/media/mediaModule.test.ts`).
 *
 * Covers:
 * 1. Upload authorization & production storage fail-closed guards (no silent local prod fallback, no invented S3/R2)
 * 2. Ownership verification & Bargain/Sponsor target association
 * 3. Metadata persistence, raw-byte firewall, and credential/key redaction
 * 4. Secure retrieval authorization, byte-range slicing, and missing object bytes detection
 * 5. Storage failure handling, retryable deletion, and idempotent duplicate deletion
 * 6. Orphan detection & interrupted durable cleanup job recovery
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  assertMetadataContainsNoRawBytes,
  computeSha256Hex,
  ConfiguredS3ByteStorageProvider,
  createDurableMediaMetadataStore,
  createMediaModuleFacade,
  DeterministicByteStorageProvider,
  type MediaActorContext,
  MediaDomainError,
  type MediaTargetEntityVerifier,
} from './index';

const OWNER_ALICE: MediaActorContext = { uid: 'user_alice_media_01', isAdmin: false };
const OTHER_BOB: MediaActorContext = { uid: 'user_bob_media_02', isAdmin: false };
const ADMIN_ACTOR: MediaActorContext = { uid: 'admin_media_01', isAdmin: true };
const FIXED_NOW_MS = 1_746_871_200_000;

// Valid minimal WebP binary header ("RIFF" + size + "WEBP" + "VP8 ")
function createValidWebpBuffer(extraTag = 'sample'): Buffer {
  const payload = Buffer.from(`VP8 ${extraTag.padEnd(16, '0')}`, 'ascii');
  const header = Buffer.alloc(12);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(payload.length + 4, 4);
  header.write('WEBP', 8, 'ascii');
  return Buffer.concat([header, payload]);
}

async function runTests(): Promise<void> {
  // -------------------------------------------------------------------------
  // 1. Storage Requirements: No Silent Local Prod Storage & No Invented R2/S3
  // -------------------------------------------------------------------------
  {
    const ephemeralProdStorage = new DeterministicByteStorageProvider({
      environmentMode: 'production',
      durabilityTier: 'EPHEMERAL_DEV_FILESYSTEM',
    });
    const prodFacadeWithLocal = createMediaModuleFacade({ byteStorage: ephemeralProdStorage });
    const webp = createValidWebpBuffer('prod_guard');

    await assert.rejects(
      () =>
        prodFacadeWithLocal.mediaService.authorizeUpload(
          OWNER_ALICE,
          {
            idempotencyKey: 'idem_prod_local_block',
            cityId: 'tehran',
            hoodId: 1,
            mediaType: 'image',
            mimeType: 'image/webp',
            declaredSizeBytes: webp.length,
            expectedSha256: computeSha256Hex(webp),
            originalFileName: 'photo.webp',
          },
          FIXED_NOW_MS
        ),
      (err: unknown) =>
        err instanceof MediaDomainError && err.code === 'PRODUCTION_DURABLE_STORAGE_NOT_CONFIGURED'
    );

    const unconfiguredS3 = new ConfiguredS3ByteStorageProvider({
      NODE_ENV: 'production',
      OBJECT_STORAGE_PROVIDER: 'r2',
      OBJECT_STORAGE_ACCESS_KEY: '',
      OBJECT_STORAGE_SECRET_KEY: '',
    });
    assert.equal(unconfiguredS3.getHealthStatus().isConfigured, false);
    assert.equal(unconfiguredS3.getHealthStatus().durabilityTier, 'UNCONFIGURED_DISABLED');
  }

  // -------------------------------------------------------------------------
  // 2. Metadata vs Object Bytes Firewall & Durable Snapshot Persistence
  // -------------------------------------------------------------------------
  {
    assert.throws(
      () => assertMetadataContainsNoRawBytes({ objectId: 'obj-1', dataBase64: 'AAAA' }),
      (err: unknown) => err instanceof MediaDomainError && err.code === 'METADATA_RAW_BYTES_VIOLATION'
    );
    assert.throws(
      () => assertMetadataContainsNoRawBytes({ objectId: 'obj-1', rawBytes: Buffer.from([1, 2, 3]) }),
      (err: unknown) => err instanceof MediaDomainError && err.code === 'METADATA_RAW_BYTES_VIOLATION'
    );
  }

  // -------------------------------------------------------------------------
  // 3. Upload Authorization, Registration, Ownership & Bargain/Sponsor Attachment
  // -------------------------------------------------------------------------
  const tmpSnapshotPath = path.join(os.tmpdir(), `media-meta-test-${process.pid}-${Date.now()}.json`);
  try {
    const byteStorage = new DeterministicByteStorageProvider({
      environmentMode: 'production',
      durabilityTier: 'PRODUCTION_OBJECT_STORAGE',
    });
    const metadataStore = createDurableMediaMetadataStore({ durableSnapshotPath: tmpSnapshotPath });
    const { mediaService } = createMediaModuleFacade({ metadataStore, byteStorage });

    const webpBytes = createValidWebpBuffer('bargain_hero_1');
    const sha256 = computeSha256Hex(webpBytes);

    const grant1 = await mediaService.authorizeUpload(
      OWNER_ALICE,
      {
        idempotencyKey: 'idem_alice_upload_01',
        cityId: 'tehran',
        hoodId: 1,
        mediaType: 'image',
        mimeType: 'image/webp',
        declaredSizeBytes: webpBytes.length,
        expectedSha256: sha256,
        originalFileName: 'fereshteh.webp',
      },
      FIXED_NOW_MS
    );

    // Idempotent replay of authorizeUpload returns identical grantId & objectId
    const grantReplay = await mediaService.authorizeUpload(
      OWNER_ALICE,
      {
        idempotencyKey: 'idem_alice_upload_01',
        cityId: 'tehran',
        hoodId: 1,
        mediaType: 'image',
        mimeType: 'image/webp',
        declaredSizeBytes: webpBytes.length,
        expectedSha256: sha256,
        originalFileName: 'fereshteh.webp',
      },
      FIXED_NOW_MS + 1_000
    );
    assert.equal(grantReplay.grantId, grant1.grantId);
    assert.equal(grantReplay.objectId, grant1.objectId);

    // Non-owner Bob cannot register Alice's grant
    await assert.rejects(
      () => mediaService.registerUploadedObject(OTHER_BOB, grant1.grantId, webpBytes, FIXED_NOW_MS + 2_000),
      (err: unknown) => err instanceof MediaDomainError && err.code === 'FORBIDDEN_NOT_OWNER'
    );

    // Owner Alice registers the object
    const reg = await mediaService.registerUploadedObject(
      OWNER_ALICE,
      grant1.grantId,
      webpBytes,
      FIXED_NOW_MS + 2_000
    );
    assert.equal(reg.idempotentReplay, false);
    assert.equal(reg.descriptor.objectId, grant1.objectId);
    assert.equal(reg.descriptor.state, 'ACTIVE');
    assert.equal('internalObjectKey' in reg.descriptor, false);

    // Idempotent re-registration returns existing active descriptor
    const regReplay = await mediaService.registerUploadedObject(
      OWNER_ALICE,
      grant1.grantId,
      webpBytes,
      FIXED_NOW_MS + 3_000
    );
    assert.equal(regReplay.idempotentReplay, true);
    assert.equal(regReplay.descriptor.objectId, grant1.objectId);

    // Verify metadata persistence across store reload from disk
    const reloadedStore = createDurableMediaMetadataStore({ durableSnapshotPath: tmpSnapshotPath });
    const reloadedMeta = await reloadedStore.getMetadataRecord(grant1.objectId);
    assert.ok(reloadedMeta !== null);
    assert.equal(reloadedMeta.sha256, sha256);

    // Unattached media cannot be retrieved by non-owner Bob, but can be retrieved by owner Alice
    await assert.rejects(
      () => mediaService.retrieveAuthorizedMediaBytes(OTHER_BOB, grant1.objectId),
      (err: unknown) => err instanceof MediaDomainError && err.code === 'FORBIDDEN_NOT_OWNER'
    );
    const ownerRetrieval = await mediaService.retrieveAuthorizedMediaBytes(
      OWNER_ALICE,
      grant1.objectId,
      'bytes=0-3'
    );
    assert.equal(ownerRetrieval.payload.isPartialContent, true);
    assert.equal(ownerRetrieval.payload.bytes.toString('ascii'), 'RIFF');

    // Target ownership verification before attaching to BARGAIN or SPONSOR
    const mockVerifier: MediaTargetEntityVerifier = {
      async verifyTargetEntity(targetType, targetId) {
        if (targetType === 'BARGAIN' && targetId === 'bargain_alice_100') {
          return { exists: true, ownerUid: OWNER_ALICE.uid };
        }
        if (targetType === 'SPONSOR' && targetId === 'sponsor_bob_200') {
          return { exists: true, ownerUid: OTHER_BOB.uid };
        }
        return { exists: false, ownerUid: null };
      },
    };

    // Alice cannot attach her media to Bob's sponsor record
    await assert.rejects(
      () =>
        mediaService.attachMediaToTarget(
          OWNER_ALICE,
          {
            objectIds: [grant1.objectId],
            targetType: 'SPONSOR',
            targetId: 'sponsor_bob_200',
          },
          mockVerifier
        ),
      (err: unknown) =>
        err instanceof MediaDomainError && err.code === 'TARGET_OWNERSHIP_VERIFICATION_FAILED'
    );

    // Alice attaches her media to her own bargain record
    const attached = await mediaService.attachMediaToTarget(
      OWNER_ALICE,
      {
        objectIds: [grant1.objectId],
        targetType: 'BARGAIN',
        targetId: 'bargain_alice_100',
      },
      mockVerifier,
      FIXED_NOW_MS + 5_000
    );
    assert.equal(attached.idempotentReplay, false);
    assert.equal(attached.attachedObjects[0].association.targetType, 'BARGAIN');
    assert.equal(attached.attachedObjects[0].association.targetId, 'bargain_alice_100');

    // Once attached to a public bargain, anonymous/other users can retrieve it
    const publicRetrieve = await mediaService.retrieveAuthorizedMediaBytes(null, grant1.objectId);
    assert.equal(publicRetrieve.payload.sizeBytes, webpBytes.length);

    // Direct unattached deletion of attached media is blocked
    await assert.rejects(
      () => mediaService.deleteMediaObject(OWNER_ALICE, grant1.objectId),
      (err: unknown) =>
        err instanceof MediaDomainError && err.code === 'MEDIA_ATTACHED_CANNOT_DELETE_DIRECTLY'
    );
  } finally {
    await fs.promises.unlink(tmpSnapshotPath).catch(() => {});
  }

  // -------------------------------------------------------------------------
  // 4. Missing Objects, Storage Failures, Retryable Deletion & Duplicate Deletion
  // -------------------------------------------------------------------------
  {
    const byteStorage = new DeterministicByteStorageProvider({
      environmentMode: 'production',
      durabilityTier: 'PRODUCTION_OBJECT_STORAGE',
    });
    const { mediaService, metadataStore } = createMediaModuleFacade({ byteStorage });
    const webp = createValidWebpBuffer('delete_retry_test');
    const grant = await mediaService.authorizeUpload(
      OWNER_ALICE,
      {
        idempotencyKey: 'idem_delete_retry_01',
        cityId: 'karaj',
        hoodId: 101,
        mediaType: 'image',
        mimeType: 'image/webp',
        declaredSizeBytes: webp.length,
        expectedSha256: computeSha256Hex(webp),
        originalFileName: 'azimiyeh.webp',
      },
      FIXED_NOW_MS
    );
    await mediaService.registerUploadedObject(OWNER_ALICE, grant.grantId, webp, FIXED_NOW_MS + 1_000);

    // Simulate storage DELETE_FAIL: deletion records PENDING_DELETE and returns retryable PENDING_RETRY
    byteStorage.setSimulatedFailureMode('DELETE_FAIL');
    const failedDel = await mediaService.deleteMediaObject(OWNER_ALICE, grant.objectId);
    assert.equal(failedDel.status, 'PENDING_RETRY');
    assert.equal(failedDel.retryable, true);
    assert.equal(failedDel.deletionAttemptCount, 1);

    const pendingMeta = await metadataStore.getMetadataRecord(grant.objectId);
    assert.equal(pendingMeta?.state, 'PENDING_DELETE');

    // Restore storage health and retry delete -> transitions to DELETED
    byteStorage.setSimulatedFailureMode('NONE');
    const recoveredDel = await mediaService.deleteMediaObject(OWNER_ALICE, grant.objectId);
    assert.equal(recoveredDel.status, 'DELETED');
    assert.equal(recoveredDel.idempotentReplay, false);
    assert.equal(recoveredDel.deletionAttemptCount, 2);

    // Duplicate deletion is 100% idempotent
    const duplicateDel = await mediaService.deleteMediaObject(OWNER_ALICE, grant.objectId);
    assert.equal(duplicateDel.status, 'DELETED');
    assert.equal(duplicateDel.idempotentReplay, true);
  }

  // -------------------------------------------------------------------------
  // 5. Missing Storage Bytes Detection & Interrupted Cleanup Job Recovery
  // -------------------------------------------------------------------------
  {
    const byteStorage = new DeterministicByteStorageProvider({
      environmentMode: 'production',
      durabilityTier: 'PRODUCTION_OBJECT_STORAGE',
    });
    const { mediaService, metadataStore, orphanAndCleanup } = createMediaModuleFacade({ byteStorage });

    // Create 3 media objects:
    // objA: attached to a deleted bargain ('bargain_deleted_999') -> ORPHAN_STALE_TARGET_DELETED
    // objB: unattached and older than 2-hour grace window -> ORPHAN_UNATTACHED_EXPIRED
    // objC: active metadata whose raw bytes were lost from storage -> MISSING_STORAGE_BYTES_FOR_ACTIVE_METADATA
    const uploadHelper = async (idem: string, createdAtMs: number) => {
      const buf = createValidWebpBuffer(idem);
      const g = await mediaService.authorizeUpload(
        OWNER_ALICE,
        {
          idempotencyKey: idem,
          cityId: 'mashhad',
          hoodId: 201,
          mediaType: 'image',
          mimeType: 'image/webp',
          declaredSizeBytes: buf.length,
          expectedSha256: computeSha256Hex(buf),
          originalFileName: `${idem}.webp`,
        },
        createdAtMs
      );
      const r = await mediaService.registerUploadedObject(OWNER_ALICE, g.grantId, buf, createdAtMs);
      return r.descriptor.objectId;
    };

    const objA = await uploadHelper('idem_orphan_stale_bargain', FIXED_NOW_MS);
    const objB = await uploadHelper('idem_orphan_expired_unattached', FIXED_NOW_MS);
    const objC = await uploadHelper('idem_missing_bytes', FIXED_NOW_MS);

    await mediaService.attachMediaToTarget(
      OWNER_ALICE,
      { objectIds: [objA], targetType: 'BARGAIN', targetId: 'bargain_deleted_999' },
      { async verifyTargetEntity() { return { exists: true, ownerUid: OWNER_ALICE.uid }; } },
      FIXED_NOW_MS
    );

    // Manually remove objC's raw bytes from storage to simulate missing object bytes
    const metaC = await metadataStore.getMetadataRecord(objC);
    assert.ok(metaC !== null);
    await byteStorage.deleteObjectBytes(metaC.internalObjectKey);

    // Attempt to retrieve objC fails with STORAGE_BYTES_MISSING
    await assert.rejects(
      () => mediaService.retrieveAuthorizedMediaBytes(OWNER_ALICE, objC),
      (err: unknown) => err instanceof MediaDomainError && err.code === 'STORAGE_BYTES_MISSING'
    );

    // Also inject a dangling storage object with no metadata
    const danglingKey = 'listings/mashhad/hood-201/image/2026-05/obj-1746871200000-deadbeef.webp';
    await byteStorage.putObjectBytes(danglingKey, createValidWebpBuffer('dangling'), 'image/webp');

    // Run orphan detection 3 hours later (after grace window expires for objB, and bargain_deleted_999 is gone)
    const evalMs = FIXED_NOW_MS + 3 * 60 * 60 * 1000;
    const report = await orphanAndCleanup.detectOrphanMediaObjects(
      ADMIN_ACTOR,
      {
        activeBargainIds: new Set<string>(),
        activeSponsorIds: new Set<string>(),
        referencedMediaObjectIds: new Set<string>(),
      },
      { nowMs: evalMs }
    );

    assert.equal(report.counts.ORPHAN_STALE_TARGET_DELETED, 1);
    assert.equal(report.counts.ORPHAN_UNATTACHED_EXPIRED, 1);
    assert.equal(report.counts.MISSING_STORAGE_BYTES_FOR_ACTIVE_METADATA, 1);
    assert.equal(report.counts.DANGLING_STORAGE_BYTES_WITHOUT_METADATA, 1);

    // Create durable cleanup job (3 eligible items: objA, objB, danglingKey)
    const job = await orphanAndCleanup.createDurableCleanupJob(ADMIN_ACTOR, report, evalMs);
    assert.equal(job.items.length, 3);
    assert.equal(job.status, 'PENDING');

    // Execute step 1 (maxBatchSize = 1) -> processes 1 item and pauses In Progress
    const step1 = await orphanAndCleanup.executeCleanupJobBatch(ADMIN_ACTOR, job.jobId, 1, evalMs + 1_000);
    assert.equal(step1.deletedCount, 1);
    assert.equal(step1.status, 'IN_PROGRESS');

    // Simulate storage outage during step 2 -> records PARTIAL_RETRYABLE without losing state
    byteStorage.setSimulatedFailureMode('DELETE_FAIL');
    const step2Outage = await orphanAndCleanup.executeCleanupJobBatch(
      ADMIN_ACTOR,
      job.jobId,
      5,
      evalMs + 2_000
    );
    assert.equal(step2Outage.status, 'PARTIAL_RETRYABLE');
    assert.equal(step2Outage.deletedCount, 1);
    assert.equal(step2Outage.failedCount, 2);

    // Restore storage and resume the interrupted cleanup job -> completes all 3 items
    byteStorage.setSimulatedFailureMode('NONE');
    const completedJob = await orphanAndCleanup.executeCleanupJobBatch(
      ADMIN_ACTOR,
      job.jobId,
      5,
      evalMs + 3_000
    );
    assert.equal(completedJob.status, 'COMPLETED');
    assert.equal(completedJob.deletedCount, 3);
    assert.equal(completedJob.failedCount, 0);
  }

  console.log('ALL EMPLOYEE-6 MEDIA AND OBJECT-STORAGE TESTS PASSED');
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
