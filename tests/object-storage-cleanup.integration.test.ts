/**
 * @file tests/object-storage-cleanup.integration.test.ts
 *
 * HTTP integration tests for:
 * POST /api/object-storage/cleanup-bargain/:bargainId
 *
 * Prerequisites:
 * - Firestore Emulator is running.
 * - The cleanup-bargain route has been added to the storage server.
 * - getFirebaseAdminFirestoreForServer() targets the named database.
 *
 * Safety:
 * - Uses a temporary working directory.
 * - Uses a dedicated Firebase test project.
 * - Never calls S3 for the test fixtures.
 * - Cleans up only Firestore documents created by this test.
 */

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import express from 'express';

type JsonObject = Record<string, unknown>;

interface TestMediaRecord {
  id: string;
  objectKey: string;
  bucket: string;
  provider: 'arvancloud';
  mediaType: 'image';
  mimeType: 'image/webp';
  sizeBytes: number;
  url: string;
  remoteS3Synced: boolean;
  createdAtIso: string;
  localFileName: string;
  ownerUid: string;
  bargainId?: string;
  deletionState?: 'active' | 'pending_delete';
}

const EXPECTED_PROJECT_ID = 'gen-lang-client-0713157837';

function makeTestMediaRecord(
  id: string,
  ownerUid: string,
  bargainId?: string,
): TestMediaRecord {
  const localFileName = `${id}.webp`;

  return {
    id,
    objectKey:
      `listings/tehran/hood-5/image/2026-10/${localFileName}`,

    bucket: 'tehran-housing-radar-media',
    provider: 'arvancloud',

    mediaType: 'image',
    mimeType: 'image/webp',

    sizeBytes: 128,

    url: `/api/object-storage/file/${id}`,

    remoteS3Synced: false,
    createdAtIso: new Date().toISOString(),

    localFileName,
    ownerUid,

    ...(bargainId ? { bargainId } : {}),
  };
}

async function parseJson(
  response: globalThis.Response,
): Promise<JsonObject> {
  const payload: unknown = await response.json();

  assert.ok(
    payload !== null &&
      typeof payload === 'object' &&
      !Array.isArray(payload),
    'Expected a JSON object response',
  );

  return payload as JsonObject;
}

async function closeServer(
  server: http.Server,
): Promise<void> {
  server.closeAllConnections?.();

  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

async function run(): Promise<void> {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error(
      'FIRESTORE_EMULATOR_HOST is required. ' +
        'Run with firebase emulators:exec.',
    );
  }

  const originalCwd = process.cwd();

  const originalEnv: Record<string, string | undefined> = {
    FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID,
    GCLOUD_PROJECT: process.env.GCLOUD_PROJECT,
    ADMIN_API_SECRET: process.env.ADMIN_API_SECRET,
  };

  const tempRoot = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), 'radar-cleanup-integration-'),
  );

  let server: http.Server | null = null;
  let adminDb: any = null;

  let targetBargainId = '';
  let unrelatedBargainId = '';

  let targetOwnerDocumentCreated = false;
  let targetBargainDocumentCreated = false;

  let unrelatedOwnerDocumentCreated = false;
  let unrelatedBargainDocumentCreated = false;

  const randomSuffix = crypto
    .randomBytes(8)
    .toString('hex');

  targetBargainId =
    `bargain-target-${randomSuffix}`;

  unrelatedBargainId =
    `bargain-other-${randomSuffix}`;

  const adminSecret =
    'test-admin-secret-802713649251';

  try {
    /*
     * The storage helper resolves BUCKET_DIR from process.cwd()
     * when its module is imported.
     *
     * Change directory before the dynamic import to isolate the
     * test index and files from the working project.
     */
    process.chdir(tempRoot);

    process.env.FIREBASE_PROJECT_ID =
      EXPECTED_PROJECT_ID;

    process.env.GCLOUD_PROJECT =
      EXPECTED_PROJECT_ID;

    process.env.ADMIN_API_SECRET =
      adminSecret;

    const bucketDir = path.join(
      tempRoot,
      '.object-storage-bucket',
    );

    const indexFile = path.join(
      bucketDir,
      'index.json',
    );

    await fs.promises.mkdir(bucketDir, {
      recursive: true,
      mode: 0o700,
    });

    const targetMediaId =
      'obj-1790000000000-a1b2c3d4';

    const unrelatedMediaId =
      'obj-1790000000001-b2c3d4e5';

    const unattachedMediaId =
      'obj-1790000000002-c3d4e5f6';

    const targetRecord = makeTestMediaRecord(
      targetMediaId,
      'cleanup-test-owner',
      targetBargainId,
    );

    const unrelatedRecord = makeTestMediaRecord(
      unrelatedMediaId,
      'cleanup-test-owner',
      unrelatedBargainId,
    );

    const unattachedRecord = makeTestMediaRecord(
      unattachedMediaId,
      'cleanup-test-owner',
    );

    const initialRecords = [
      targetRecord,
      unrelatedRecord,
      unattachedRecord,
    ];

    await fs.promises.writeFile(
      indexFile,
      JSON.stringify(initialRecords, null, 2),
      {
        encoding: 'utf8',
        mode: 0o600,
      },
    );

    /*
     * Real local files are created so that the test can verify
     * successful deletion for the target object and preservation
     * of unrelated files.
     *
     * These bytes are opaque test data, not served as real images.
     */
    for (const record of initialRecords) {
      await fs.promises.writeFile(
        path.join(bucketDir, record.localFileName),
        Buffer.alloc(record.sizeBytes, 0x41),
        { mode: 0o600 },
      );
    }

    /*
     * All project modules with storage path constants are loaded
     * only after the temporary working directory is established.
     */
    const storage =
      await import('../src/utils/serverObjectStorage');

    const security =
      await import('../src/utils/serverAdminAndTelegramSecurity');

    await storage.ensureBucketLoaded();

    storage.resetObjectStorageIndexForTests();

    /*
     * The index was already written.
     * Re-load it after resetting the in-memory state.
     */
    await storage.ensureBucketLoaded();

    adminDb =
      security.getFirebaseAdminFirestoreForServer();

    const app = express();

    app.disable('x-powered-by');

    storage.registerObjectStorageRoutes(
      app,
      () => {
        // Do not emit production audit logs for test fixtures.
      },
    );

    server = http.createServer(app);

    await new Promise<void>((resolve, reject) => {
      server!.once('error', reject);

      server!.listen(
        0,
        '127.0.0.1',
        () => {
          server!.removeListener('error', reject);
          resolve();
        },
      );
    });

    const address = server.address();

    assert.ok(
      address &&
        typeof address === 'object',
      'The test server must bind to an ephemeral port',
    );

    const baseUrl =
      `http://127.0.0.1:${address.port}`;

    const cleanupUrl =
      (bargainId: string) =>
        `${baseUrl}/api/object-storage/cleanup-bargain/` +
        encodeURIComponent(bargainId);

    const adminHeaders = {
      'x-admin-token': adminSecret,
    };

    const mediaIndexSnapshot = async () => {
      return JSON.parse(
        await fs.promises.readFile(
          indexFile,
          'utf8',
        ),
      ) as TestMediaRecord[];
    };

    // -----------------------------------------------------------------------
    // TEST 1: unauthenticated cleanup is denied
    // -----------------------------------------------------------------------

    const unauthenticatedResponse = await fetch(
      cleanupUrl(targetBargainId),
      {
        method: 'POST',
      },
    );

    assert.ok(
      [401, 403].includes(
        unauthenticatedResponse.status,
      ),
      'Unauthenticated cleanup must be denied',
    );

    const unauthenticatedBody =
      await parseJson(unauthenticatedResponse);

    assert.equal(
      unauthenticatedBody.status,
      'error',
    );

    // -----------------------------------------------------------------------
    // TEST 2: invalid admin secret is rejected
    // -----------------------------------------------------------------------

    const invalidSecretResponse = await fetch(
      cleanupUrl(targetBargainId),
      {
        method: 'POST',
        headers: {
          'x-admin-token': 'incorrect-test-secret',
        },
      },
    );

    assert.equal(
      invalidSecretResponse.status,
      403,
    );

    // -----------------------------------------------------------------------
    // TEST 3: existing bargain prevents cleanup
    // -----------------------------------------------------------------------

    const targetBargainRef = adminDb
      .collection('bargains')
      .doc(targetBargainId);

    const targetOwnerRef = adminDb
      .collection('bargainOwners')
      .doc(targetBargainId);

    await targetBargainRef.set({
      auditTest: true,
      objectStorageObjectIds: [
        targetMediaId,
      ],
    });

    targetBargainDocumentCreated = true;

    await targetOwnerRef.set({
      bargainId: targetBargainId,
      userId: 'cleanup-test-owner',
      auditTest: true,
    });

    targetOwnerDocumentCreated = true;

    // Also register the unrelated bargain & owner documents in Firestore
    await adminDb
      .collection('bargains')
      .doc(unrelatedBargainId)
      .set({
        auditTest: true,
        objectStorageObjectIds: [unrelatedMediaId],
      });

    unrelatedBargainDocumentCreated = true;

    await adminDb
      .collection('bargainOwners')
      .doc(unrelatedBargainId)
      .set({
        bargainId: unrelatedBargainId,
        userId: 'cleanup-test-owner',
        auditTest: true,
      });

    unrelatedOwnerDocumentCreated = true;

    const indexBeforeBlockedCleanup =
      await fs.promises.readFile(
        indexFile,
        'utf8',
      );

    const blockedByBargainResponse = await fetch(
      cleanupUrl(targetBargainId),
      {
        method: 'POST',
        headers: adminHeaders,
      },
    );

    assert.equal(
      blockedByBargainResponse.status,
      409,
      'An existing bargain must prevent media cleanup',
    );

    const blockedByBargainBody =
      await parseJson(blockedByBargainResponse);

    assert.equal(
      blockedByBargainBody.code,
      'BARGAIN_STILL_EXISTS',
    );

    assert.equal(
      await fs.promises.readFile(
        indexFile,
        'utf8',
      ),
      indexBeforeBlockedCleanup,
      'Blocked cleanup must not modify the index',
    );

    await fs.promises.access(
      path.join(bucketDir, targetRecord.localFileName),
    );

    // -----------------------------------------------------------------------
    // TEST 4: an owner document without its bargain still blocks cleanup
    // -----------------------------------------------------------------------

    await targetBargainRef.delete();

    targetBargainDocumentCreated = false;

    const blockedByOwnerResponse = await fetch(
      cleanupUrl(targetBargainId),
      {
        method: 'POST',
        headers: adminHeaders,
      },
    );

    assert.equal(
      blockedByOwnerResponse.status,
      409,
      'A remaining owner document must prevent cleanup',
    );

    const blockedByOwnerBody =
      await parseJson(blockedByOwnerResponse);

    assert.equal(
      blockedByOwnerBody.code,
      'BARGAIN_STILL_EXISTS',
    );

    await fs.promises.access(
      path.join(bucketDir, targetRecord.localFileName),
    );

    // -----------------------------------------------------------------------
    // TEST 5: cleanup after both documents are deleted
    // -----------------------------------------------------------------------

    await targetOwnerRef.delete();

    targetOwnerDocumentCreated = false;

    const cleanupResponse = await fetch(
      cleanupUrl(targetBargainId),
      {
        method: 'POST',
        headers: adminHeaders,
      },
    );

    assert.equal(
      cleanupResponse.status,
      200,
      'The target media should be deleted after both documents are absent',
    );

    const cleanupBody =
      await parseJson(cleanupResponse);

    assert.equal(
      cleanupBody.status,
      'ok',
    );

    assert.equal(
      cleanupBody.bargainId,
      targetBargainId,
    );

    assert.equal(
      cleanupBody.candidateCount,
      1,
    );

    assert.equal(
      cleanupBody.deletedCount,
      1,
    );

    assert.equal(
      cleanupBody.failedCount,
      0,
    );

    assert.deepEqual(
      cleanupBody.deletedIds,
      [targetMediaId],
    );

    // The target local file must have been removed.
    await assert.rejects(
      () =>
        fs.promises.access(
          path.join(
            bucketDir,
            targetRecord.localFileName,
          ),
        ),
      'The target local file must be deleted',
    );

    // The target index record must have been removed.
    const afterCleanupIndex =
      await mediaIndexSnapshot();

    assert.equal(
      afterCleanupIndex.some(
        (record) => record.id === targetMediaId,
      ),
      false,
    );

    // -----------------------------------------------------------------------
    // TEST 6: unrelated media remains untouched
    // -----------------------------------------------------------------------

    assert.ok(
      afterCleanupIndex.some(
        (record) => record.id === unrelatedMediaId,
      ),
      'Media linked to another bargain must remain in the index',
    );

    assert.ok(
      afterCleanupIndex.some(
        (record) => record.id === unattachedMediaId,
      ),
      'Unattached media must not be deleted by bargain cleanup',
    );

    await fs.promises.access(
      path.join(
        bucketDir,
        unrelatedRecord.localFileName,
      ),
    );

    await fs.promises.access(
      path.join(
        bucketDir,
        unattachedRecord.localFileName,
      ),
    );

    // -----------------------------------------------------------------------
    // TEST 7: retrying an already-completed cleanup is harmless
    // -----------------------------------------------------------------------

    const retryResponse = await fetch(
      cleanupUrl(targetBargainId),
      {
        method: 'POST',
        headers: adminHeaders,
      },
    );

    assert.equal(
      retryResponse.status,
      200,
    );

    const retryBody =
      await parseJson(retryResponse);

    assert.equal(
      retryBody.status,
      'ok',
    );

    assert.equal(
      retryBody.deletedCount,
      0,
    );

    assert.equal(
      retryBody.auditRequired,
      true,
      'An empty association list must not be treated as proof that no orphan exists',
    );

    // -----------------------------------------------------------------------
    // TEST 8: missing records must not delete other media
    // -----------------------------------------------------------------------

    const invalidIdResponse = await fetch(
      cleanupUrl('../invalid-id'),
      {
        method: 'POST',
        headers: adminHeaders,
      },
    );

    assert.equal(
      invalidIdResponse.status,
      400,
    );

    const finalIndex =
      await mediaIndexSnapshot();

    assert.equal(
      finalIndex.some(
        (record) => record.id === unrelatedMediaId,
      ),
      true,
    );

    assert.equal(
      finalIndex.some(
        (record) => record.id === unattachedMediaId,
      ),
      true,
    );

    // -----------------------------------------------------------------------
    // TEST 9: unauthenticated pending-delete reconciliation is denied
    // -----------------------------------------------------------------------

    const reconcileUrl =
      `${baseUrl}/api/object-storage/admin/reconcile-pending-deletes`;

    const unauthenticatedReconcileResponse =
      await fetch(reconcileUrl, {
        method: 'POST',
      });

    assert.ok(
      [401, 403].includes(
        unauthenticatedReconcileResponse.status,
      ),
      'Unauthenticated reconciliation must be denied',
    );

    // -----------------------------------------------------------------------
    // TEST 10: pending-delete record blocked by an existing bargain
    // -----------------------------------------------------------------------

    const blockedPendingMediaId =
      'obj-1790000000003-d4e5f6a7';

    const blockedPendingRecord: TestMediaRecord = {
      ...makeTestMediaRecord(
        blockedPendingMediaId,
        'cleanup-test-owner',
        unrelatedBargainId,
      ),
      deletionState: 'pending_delete',
    };

    const unattachedPendingMediaId =
      'obj-1790000000004-e5f6a7b8';

    const unattachedPendingRecord: TestMediaRecord = {
      ...makeTestMediaRecord(
        unattachedPendingMediaId,
        'cleanup-test-owner',
      ),
      deletionState: 'pending_delete',
    };

    const currentSnapshot =
      await mediaIndexSnapshot();

    const recoverySeedIndex = [
      ...currentSnapshot,
      blockedPendingRecord,
      unattachedPendingRecord,
    ];

    await fs.promises.writeFile(
      indexFile,
      JSON.stringify(recoverySeedIndex, null, 2),
      {
        encoding: 'utf8',
        mode: 0o600,
      },
    );

    await fs.promises.writeFile(
      path.join(
        bucketDir,
        blockedPendingRecord.localFileName,
      ),
      Buffer.alloc(
        blockedPendingRecord.sizeBytes,
        0x42,
      ),
      { mode: 0o600 },
    );

    await fs.promises.writeFile(
      path.join(
        bucketDir,
        unattachedPendingRecord.localFileName,
      ),
      Buffer.alloc(
        unattachedPendingRecord.sizeBytes,
        0x43,
      ),
      { mode: 0o600 },
    );

    storage.resetObjectStorageIndexForTests();
    await storage.ensureBucketLoaded();

    const partialReconcileResponse =
      await fetch(reconcileUrl, {
        method: 'POST',
        headers: adminHeaders,
      });

    assert.equal(
      partialReconcileResponse.status,
      207,
      'Reconciliation must return 207 when one pending record is blocked',
    );

    const partialReconcileBody =
      await parseJson(partialReconcileResponse);

    assert.equal(
      partialReconcileBody.status,
      'partial',
    );

    assert.equal(
      partialReconcileBody.deletedCount,
      1,
    );

    assert.equal(
      partialReconcileBody.blockedCount,
      1,
    );

    assert.deepEqual(
      partialReconcileBody.deletedIds,
      [unattachedPendingMediaId],
    );

    // Unattached pending media was deleted.
    await assert.rejects(
      () =>
        fs.promises.access(
          path.join(
            bucketDir,
            unattachedPendingRecord.localFileName,
          ),
        ),
    );

    // Bargain-linked pending media remains because its bargain still exists.
    await fs.promises.access(
      path.join(
        bucketDir,
        blockedPendingRecord.localFileName,
      ),
    );

    // -----------------------------------------------------------------------
    // TEST 11: deleting both Firestore documents allows reconciliation
    // -----------------------------------------------------------------------

    await adminDb
      .collection('bargains')
      .doc(unrelatedBargainId)
      .delete();

    unrelatedBargainDocumentCreated = false;

    await adminDb
      .collection('bargainOwners')
      .doc(unrelatedBargainId)
      .delete();

    unrelatedOwnerDocumentCreated = false;

    const fullReconcileResponse =
      await fetch(reconcileUrl, {
        method: 'POST',
        headers: adminHeaders,
      });

    assert.equal(
      fullReconcileResponse.status,
      200,
    );

    const fullReconcileBody =
      await parseJson(fullReconcileResponse);

    assert.equal(
      fullReconcileBody.status,
      'ok',
    );

    assert.equal(
      fullReconcileBody.deletedCount,
      1,
    );

    assert.equal(
      fullReconcileBody.blockedCount,
      0,
    );

    assert.deepEqual(
      fullReconcileBody.deletedIds,
      [blockedPendingMediaId],
    );

    await assert.rejects(
      () =>
        fs.promises.access(
          path.join(
            bucketDir,
            blockedPendingRecord.localFileName,
          ),
        ),
    );

    // -----------------------------------------------------------------------
    // TEST 12: active records are untouched by reconciliation
    // -----------------------------------------------------------------------

    const afterReconcileIndex =
      await mediaIndexSnapshot();

    assert.equal(
      afterReconcileIndex.some(
        (record) =>
          record.id === unrelatedMediaId,
      ),
      true,
      'Active media must not be deleted by pending-delete reconciliation',
    );

    assert.equal(
      afterReconcileIndex.some(
        (record) =>
          record.id === unattachedMediaId,
      ),
      true,
      'Active unattached media must not be deleted by pending-delete reconciliation',
    );

    console.log(
      'Object Storage cleanup HTTP integration tests passed.',
    );
  } finally {
    if (server) {
      await closeServer(server).catch(() => {});
    }

    /*
     * Delete only the known test documents.
     * Never use a collection-wide delete in this test.
     */
    if (adminDb) {
      if (targetBargainDocumentCreated) {
        await adminDb
          .collection('bargains')
          .doc(targetBargainId)
          .delete()
          .catch(() => {});
      }

      if (targetOwnerDocumentCreated) {
        await adminDb
          .collection('bargainOwners')
          .doc(targetBargainId)
          .delete()
          .catch(() => {});
      }

      if (unrelatedBargainDocumentCreated) {
        await adminDb
          .collection('bargains')
          .doc(unrelatedBargainId)
          .delete()
          .catch(() => {});
      }

      if (unrelatedOwnerDocumentCreated) {
        await adminDb
          .collection('bargainOwners')
          .doc(unrelatedBargainId)
          .delete()
          .catch(() => {});
      }

      await adminDb.terminate().catch(() => {});
    }

    process.chdir(originalCwd);

    await fs.promises.rm(
      tempRoot,
      {
        recursive: true,
        force: true,
      },
    );

    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

run().catch((error) => {
  console.error(
    '[OBJECT_STORAGE_CLEANUP_INTEGRATION_FAILED]',
    error instanceof Error
      ? error.stack ?? error.message
      : error,
  );

  process.exitCode = 1;
});
