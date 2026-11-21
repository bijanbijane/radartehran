/**
 * RT-INFRA-007 — durable object metadata registry (in-memory test port).
 */
import assert from 'node:assert/strict';
import {
  isDurableObjectMetadataProductionMode,
  isAuthoritativeProductionMetadataRecord,
  setObjectStorageMetadataRegistryForTests,
  type ObjectStorageMetadataRegistryPort,
} from '../src/utils/serverObjectStorageMetadataRegistry';
import {
  ensureBucketLoaded,
  objectStoreIndex,
  persistObjectStoreIndexNow,
  resetObjectStorageIndexForTests,
  type StoredObjectRecord,
} from '../src/utils/serverObjectStorageHelpers';

function makeRecord(id: string, remote = true): StoredObjectRecord {
  const localFileName = `${id}.webp`;
  return {
    id,
    localFileName,
    objectKey: `listings/tehran/hood-5/image/2026-10/${localFileName}`,
    bucket: 'radar-media',
    provider: 'r2',
    mediaType: 'image',
    mimeType: 'image/webp',
    sizeBytes: 1200,
    url: `/api/object-storage/file/${id}`,
    remoteS3Synced: remote,
    createdAtIso: new Date().toISOString(),
    ownerUid: 'owner-1',
  };
}

function createMemoryRegistry(): ObjectStorageMetadataRegistryPort {
  const map = new Map<string, StoredObjectRecord>();
  return {
    async verifyRepositoryAvailable() {
      return { ok: true as const };
    },
    async listAllRecords() {
      return Array.from(map.values());
    },
    async getRecord(objectId) {
      return map.get(objectId) ?? null;
    },
    async upsertRecord(record) {
      map.set(record.id, structuredClone(record));
    },
    async deleteRecord(objectId) {
      map.delete(objectId);
    },
  };
}

async function runTests(): Promise<void> {
  const prevEnv = { ...process.env };
  try {
    process.env.NODE_ENV = 'development';
    assert.equal(isDurableObjectMetadataProductionMode(), false);

    const memoryPort = createMemoryRegistry();
    setObjectStorageMetadataRegistryForTests(memoryPort);
    assert.equal(isDurableObjectMetadataProductionMode(), true);

    const id = 'obj-1730000000999-a1b2c3d4';
    const record = makeRecord(id);
    await memoryPort.upsertRecord(record);
    const loaded = await memoryPort.getRecord(id);
    assert.ok(loaded);
    assert.equal(loaded?.id, id);

    resetObjectStorageIndexForTests();
    objectStoreIndex.push(record);
    await persistObjectStoreIndexNow();
    await memoryPort.upsertRecord({ ...record, sizeBytes: 1300 });
    const updated = await memoryPort.getRecord(id);
    assert.equal(updated?.sizeBytes, 1300);

    await memoryPort.deleteRecord(id);
    assert.equal(await memoryPort.getRecord(id), null);

    await memoryPort.upsertRecord(makeRecord(id));
    resetObjectStorageIndexForTests();
    setObjectStorageMetadataRegistryForTests(memoryPort);
    await ensureBucketLoaded();
    assert.equal(objectStoreIndex.some((r) => r.id === id), true);
    objectStoreIndex.splice(0, objectStoreIndex.length);
    resetObjectStorageIndexForTests();
    setObjectStorageMetadataRegistryForTests(memoryPort);
    await ensureBucketLoaded();
    assert.equal(objectStoreIndex.some((r) => r.id === id), true, 'container restart reloads durable metadata');

    assert.equal(isAuthoritativeProductionMetadataRecord(makeRecord(id, true)), true);
    assert.equal(isAuthoritativeProductionMetadataRecord(makeRecord(id, false)), false);

    setObjectStorageMetadataRegistryForTests(null);
    process.env.NODE_ENV = 'production';
    process.env.PREVENT_PROD_FIREBASE_IN_TEST = 'true';
    assert.equal(isDurableObjectMetadataProductionMode(), false);
  } finally {
    process.env = prevEnv;
    setObjectStorageMetadataRegistryForTests(null);
    resetObjectStorageIndexForTests();
  }

  console.log('[PASS] server-object-storage-metadata-registry.test.ts');
}

runTests().catch((error) => {
  console.error('[FAIL] server-object-storage-metadata-registry.test.ts', error);
  process.exit(1);
});