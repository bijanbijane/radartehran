/**
 * RT-INFRA-010 — Media durable metadata, registry convergence, reconciliation (isolated).
 */
import assert from 'node:assert/strict';
import {
  MEDIA_METADATA_NATIVE_SCHEMA,
  isMediaMetadataRecordPayload,
  parseMediaMetadataDocument,
} from '../server/modules/media/firestoreMetadataAuthority';
import {
  isProductionMediaMetadataAuthority,
  resolveMediaMetadataBackendId,
} from '../server/modules/media/durableMediaMetadataRepository';
import {
  buildMediaMetadataReconciliationReport,
  mergeReconciliationMediaHydration,
} from '../server/modules/media/mediaMetadataReconciliation';
import {
  classifyMediaObjectMetadataDocument,
  projectStoredObjectAsMediaReadModel,
} from '../server/modules/media/mediaObjectRegistryConvergence';
import { createDurableMediaMetadataStore } from '../server/modules/media/metadataStore';
import {
  DeterministicByteStorageProvider,
  createMediaModuleFacade,
} from '../server/modules/media';
import { STORED_OBJECT_METADATA_SCHEMA } from '../src/utils/serverObjectStorageMetadataRegistry';
import type { MediaMetadataRecord } from '../server/modules/media/types';

function sampleMediaRecord(objectId: string, revision = 1): MediaMetadataRecord {
  return {
    objectId,
    ownerUid: 'user-a',
    cityId: 'tehran',
    hoodId: 5,
    mediaType: 'image',
    mimeType: 'image/webp',
    sizeBytes: 100,
    sha256: 'abc',
    state: 'ACTIVE',
    visibilityPolicy: 'OWNER_OR_ADMIN',
    providerId: 'local_bucket',
    durabilityTier: 'EPHEMERAL_DEV_FILESYSTEM',
    internalObjectKey: `listings/tehran/hood-5/image/2026-10/${objectId}.webp`,
    byteStorageVerified: true,
    association: {
      targetType: 'UNATTACHED',
      targetId: null,
      attachedByUid: null,
      attachedAtIso: null,
    },
    uploadGrantId: 'grant-1',
    idempotencyKey: 'idem-1',
    deletionAttemptCount: 0,
    createdAtIso: new Date().toISOString(),
    updatedAtIso: new Date().toISOString(),
    revision,
  };
}

async function runTests(): Promise<void> {
  assert.equal(isMediaMetadataRecordPayload(sampleMediaRecord('obj-1')), true);
  assert.equal(isMediaMetadataRecordPayload({ foo: 1 }), false);

  const envProd = { NODE_ENV: 'production', PREVENT_PROD_FIREBASE_IN_TEST: 'true' } as NodeJS.ProcessEnv;
  assert.equal(isProductionMediaMetadataAuthority(envProd), false);
  assert.equal(resolveMediaMetadataBackendId({ NODE_ENV: 'production' }), 'firestore_legacy');
  assert.equal(isProductionMediaMetadataAuthority({ NODE_ENV: 'production' }), true);
  assert.equal(resolveMediaMetadataBackendId({ NODE_ENV: 'production', RADAR_MEDIA_METADATA_BACKEND: 'd1' }), 'd1');
  assert.equal(
    isProductionMediaMetadataAuthority({ NODE_ENV: 'production', RADAR_MEDIA_METADATA_LOCAL_ONLY: '1' }),
    false,
  );

  const nativeEnvelope = {
    schemaVersion: MEDIA_METADATA_NATIVE_SCHEMA,
    record: sampleMediaRecord('obj-native'),
    updatedAtIso: new Date().toISOString(),
  };
  const parsed = parseMediaMetadataDocument(nativeEnvelope);
  assert.ok(parsed);
  assert.equal(parsed?.objectId, 'obj-native');

  const storedEnvelope = {
    schemaVersion: STORED_OBJECT_METADATA_SCHEMA,
    record: { id: 'obj-stored' },
    updatedAtIso: new Date().toISOString(),
  };
  assert.equal(parseMediaMetadataDocument(storedEnvelope), null);
  assert.equal(classifyMediaObjectMetadataDocument(storedEnvelope), STORED_OBJECT_METADATA_SCHEMA);

  const projection = projectStoredObjectAsMediaReadModel({
    id: 'obj-stored',
    localFileName: 'obj-stored.webp',
    objectKey: 'k',
    bucket: 'b',
    provider: 'r2',
    mediaType: 'image',
    mimeType: 'image/webp',
    sizeBytes: 10,
    url: '/u',
    remoteS3Synced: true,
    createdAtIso: new Date().toISOString(),
    ownerUid: 'o',
  });
  assert.equal(projection.objectId, 'obj-stored');
  assert.equal(projection.projectedFrom, STORED_OBJECT_METADATA_SCHEMA);

  const merged = mergeReconciliationMediaHydration(
    [sampleMediaRecord('x', 1)],
    [sampleMediaRecord('x', 2)],
  );
  assert.equal(merged.length, 1);
  assert.equal(merged[0]?.revision, 2);

  const byteStorage = new DeterministicByteStorageProvider({
    environmentMode: 'development',
    durabilityTier: 'EPHEMERAL_DEV_FILESYSTEM',
  });
  const metadataStore = createDurableMediaMetadataStore();
  await metadataStore.saveMetadataRecord(sampleMediaRecord('orph-meta'));

  const report = await buildMediaMetadataReconciliationReport(metadataStore, byteStorage, {
    storedObjectRecords: [
      {
        id: 'orph-stored',
        localFileName: 'missing-key.webp',
        objectKey: 'missing-key.webp',
        bucket: 'b',
        provider: 'r2',
        mediaType: 'image',
        mimeType: 'image/webp',
        sizeBytes: 1,
        url: '/u',
        remoteS3Synced: true,
        createdAtIso: new Date().toISOString(),
      },
    ],
  });
  assert.ok(report.issues.some((i) => i.code === 'MEDIA_NATIVE_WITHOUT_BYTES'));
  assert.ok(report.issues.some((i) => i.code === 'STORED_OBJECT_WITHOUT_MEDIA_NATIVE'));
  assert.ok(report.issues.every((i) => i.eligibleForAutomaticCleanup === false));

  const { computeSha256Hex } = await import('../server/modules/media/storageProvider');
  const { mediaService, metadataStore: store2 } = createMediaModuleFacade({ byteStorage });
  const header = Buffer.alloc(12);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(20, 4);
  header.write('WEBP', 8, 'ascii');
  const buf = Buffer.concat([header, Buffer.from('VP8 test-payload!!!', 'ascii')]);
  const actor = { uid: 'user-z', isAdmin: false };
  const auth2 = await mediaService.authorizeUpload(
    actor,
    {
      idempotencyKey: 'dur-key-2',
      cityId: 'tehran',
      hoodId: 1,
      mediaType: 'image',
      mimeType: 'image/webp',
      declaredSizeBytes: buf.length,
      expectedSha256: computeSha256Hex(buf),
      originalFileName: 'x.webp',
    },
    Date.now(),
  );
  const reg = await mediaService.registerUploadedObject(actor, auth2.grantId, buf);
  assert.ok(reg.descriptor.objectId);
  const persisted = await store2.getMetadataRecord(reg.descriptor.objectId);
  assert.ok(persisted);
  assert.equal(persisted?.state, 'ACTIVE');

  console.log('[media-durable-metadata.test] PASS');
}

runTests().catch((error) => {
  console.error('[media-durable-metadata.test] FAIL', error);
  process.exit(1);
});