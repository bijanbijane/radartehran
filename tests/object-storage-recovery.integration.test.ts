/**
 * @file tests/object-storage-recovery.integration.test.ts
 *
 * Integration tests for:
 * POST /api/object-storage/admin/reconcile-pending-deletes
 *
 * Requirements:
 * - The pending-delete recovery endpoint must be implemented.
 * - StoredObjectRecord must support deletionState and bargainId.
 * - The recovery state machine must be wired to the storage route.
 * - Firestore Emulator must be active for this test.
 *
 * Safety:
 * - Uses a temporary working directory.
 * - Uses a dedicated Firebase test project.
 * - Does not contact the real S3 provider.
 * - Deletes only Firestore documents created by this test.
 * - Does not delete files outside the temporary media directory.
 */

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import express from 'express';

type JsonObject = Record<string, unknown>;

type TestMediaRecord = {
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
};

function makeRecord(
  id: string,
  options: {
    ownerUid?: string;
    bargainId?: string;
    deletionState?: 'active' | 'pending_delete';
    remoteS3Synced?: boolean;
  } = {},
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

    remoteS3Synced:
      options.remoteS3Synced ?? false,

    createdAtIso: new Date().toISOString(),

    localFileName,

    ownerUid:
      options.ownerUid ?? 'recovery-test-owner',

    ...(options.bargainId
      ? { bargainId: options.bargainId }
      : {}),

    ...(options.deletionState
      ? { deletionState: options.deletionState }
      : {}),
  };
}

async function parseJson(
  response: globalThis.Response,
): Promise<JsonObject> {
  const value: unknown = await response.json();

  assert.ok(
    value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value),
    'Expected a JSON object response',
  );

  return value as JsonObject;
}

async function fileExists(
  filename: string,
): Promise<boolean> {
  try {
    await fs.promises.access(filename);
    return true;
  } catch {
    return false;
  }
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

  const envKeys = [
    'FIREBASE_PROJECT_ID',
    'GCLOUD_PROJECT',
    'ADMIN_API_SECRET',
  ] as const;

  const originalEnv = Object.fromEntries(
    envKeys.map((key) => [
      key,
      process.env[key],
    ]),
  );

  const testProjectId =
    'gen-lang-client-0713157837';

  const adminSecret =
    'test-recovery-admin-secret-927401836251';

  const suffix = crypto
    .randomBytes(8)
    .toString('hex');

  const existingBargainId =
    `recover-live-${suffix}`;

  const existingOwnerId =
    `recover-live-${suffix}`;

  const originalBargainId =
    `recover-deleted-${suffix}`;

  const originalOwnerId =
    `recover-deleted-${suffix}`;

  const testDocumentIds = {
    liveBargain: existingBargainId,
    liveOwner: existingOwnerId,
    deletedBargain: originalBargainId,
    deletedOwner: originalOwnerId,
  };

  const createdDocuments = new Set<string>();

  const tempRoot = await fs.promises.mkdtemp(
    path.join(
      os.tmpdir(),
      'radar-pending-recovery-test-',
    ),
  );

  let server: http.Server | null = null;
  let adminDb: any = null;

  try {
    /*
     * Important:
     * serverObjectStorageHelpers.ts resolves BUCKET_DIR from
     * process.cwd() at module evaluation time.
     *
     * Therefore, do not statically import serverObjectStorage
     * at the top of this test file.
     */
    process.chdir(tempRoot);

    process.env.FIREBASE_PROJECT_ID =
      testProjectId;

    process.env.GCLOUD_PROJECT =
      testProjectId;

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

    /*
     * Four fixtures:
     *
     * 1. pendingUnattached:
     *    Should be deleted because the previous request already
     *    persisted pending_delete.
     *
     * 2. pendingAttachedToLiveBargain:
     *    Must remain because the associated bargain and owner
     *    documents still exist.
     *
     * 3. pendingAttachedToDeletedBargain:
     *    May be deleted only after the server confirms both
     *    Firestore documents are absent.
     *
     * 4. activeUnattached:
     *    Must never be processed by this recovery route.
     */
    const pendingUnattachedId =
      'obj-1790000001000-a1b2c3d4';

    const pendingLiveId =
      'obj-1790000001001-b2c3d4e5';

    const pendingDeletedId =
      'obj-1790000001002-c3d4e5f6';

    const activeUnattachedId =
      'obj-1790000001003-d4e5f6a7';

    const pendingUnattached = makeRecord(
      pendingUnattachedId,
      {
        deletionState: 'pending_delete',
      },
    );

    const pendingAttachedToLiveBargain =
      makeRecord(
        pendingLiveId,
        {
          bargainId: testDocumentIds.liveBargain,
          deletionState: 'pending_delete',
        },
      );

    const pendingAttachedToDeletedBargain =
      makeRecord(
        pendingDeletedId,
        {
          bargainId: testDocumentIds.deletedBargain,
          deletionState: 'pending_delete',
        },
      );

    const activeUnattached = makeRecord(
      activeUnattachedId,
      {
        deletionState: 'active',
      },
    );

    const initialRecords = [
      pendingUnattached,
      pendingAttachedToLiveBargain,
      pendingAttachedToDeletedBargain,
      activeUnattached,
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
     * The contents are intentionally opaque bytes, not actual
     * image files. The recovery endpoint should not decode them;
     * its job is to resume previously authorized deletion work.
     */
    for (const record of initialRecords) {
      await fs.promises.writeFile(
        path.join(
          bucketDir,
          record.localFileName,
        ),
        Buffer.alloc(
          record.sizeBytes,
          0x41,
        ),
        { mode: 0o600 },
      );
    }

    /*
     * Import project modules after the temp working directory
     * and environment variables have been established.
     */
    const storage =
      await import(
        '../src/utils/serverObjectStorage'
      );

    const security =
      await import(
        '../src/utils/serverAdminAndTelegramSecurity'
      );

    const adminDbInstance =
      security.getFirebaseAdminFirestoreForServer();

    adminDb = adminDbInstance;

    await storage.ensureBucketLoaded();

    storage.resetObjectStorageIndexForTests();

    await storage.ensureBucketLoaded();

    /*
     * Use Firestore's configured named database. The live bargain
     * will exist in this test database, not in production.
     */
    await adminDb
      .collection('bargains')
      .doc(testDocumentIds.liveBargain)
      .set({
        auditTest: true,
        objectStorageObjectIds: [
          pendingLiveId,
        ],
      });

    createdDocuments.add(
      `bargains/${testDocumentIds.liveBargain}`,
    );

    await adminDb
      .collection('bargainOwners')
      .doc(testDocumentIds.liveOwner)
      .set({
        bargainId: testDocumentIds.liveBargain,
        userId: 'recovery-test-owner',
        auditTest: true,
      });

    createdDocuments.add(
      `bargainOwners/${testDocumentIds.liveOwner}`,
    );

    /*
     * Intentionally do not create the documents for
     * originalBargainId.
     * Both reads should succeed and report nonexistence.
     */

    const app = express();

    app.disable('x-powered-by');

    storage.registerObjectStorageRoutes(
      app,
      () => {
        // Keep test logs out of the application audit stream.
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
    );

    const baseUrl =
      `http://127.0.0.1:${address.port}`;

    const endpoint =
      `${baseUrl}/api/object-storage/admin/` +
      'reconcile-pending-deletes';

    const adminHeaders = {
      'x-admin-token': adminSecret,
    };

    const readIndex = async () =>
      JSON.parse(
        await fs.promises.readFile(
          indexFile,
          'utf8',
        ),
      ) as TestMediaRecord[];

    // -----------------------------------------------------------------------
    // TEST 1: missing admin credentials must be rejected
    // -----------------------------------------------------------------------

    const noAuth = await fetch(
      endpoint,
      { method: 'POST' },
    );

    assert.ok(
      [401, 403].includes(noAuth.status),
      'Recovery must reject unauthenticated requests',
    );

    const noAuthJson = await parseJson(noAuth);

    assert.equal(noAuthJson.status, 'error');

    // -----------------------------------------------------------------------
    // TEST 2: an invalid admin secret must be rejected
    // -----------------------------------------------------------------------

    const invalidSecret = await fetch(
      endpoint,
      {
        method: 'POST',
        headers: {
          'x-admin-token': 'not-the-test-admin-secret',
        },
      },
    );

    assert.equal(
      invalidSecret.status,
      403,
    );

    // -----------------------------------------------------------------------
    // TEST 3: recovery is bounded to the configured batch size
    // -----------------------------------------------------------------------

    const oversizedLimit = await fetch(
      `${endpoint}?limit=100000`,
      {
        method: 'POST',
        headers: adminHeaders,
      },
    );

    assert.ok(
      [200, 207].includes(
        oversizedLimit.status,
      ),
    );

    const oversizedJson =
      await parseJson(oversizedLimit);

    assert.ok(
      typeof oversizedJson.limit === 'number',
    );

    assert.ok(
      (oversizedJson.limit as number) <= 25,
      'Recovery batch size must never exceed its configured maximum',
    );

    assert.equal(
      oversizedJson.deletedCount,
      2,
    );

    assert.equal(
      oversizedJson.skippedCount,
      1,
    );

    assert.equal(
      oversizedJson.failedCount,
      0,
    );

    assert.equal(
      oversizedJson.morePendingRecords,
      false,
    );

    // -----------------------------------------------------------------------
    // TEST 4: active media must not be deleted
    // -----------------------------------------------------------------------

    const indexAfterFirstRecovery =
      await readIndex();

    assert.ok(
      indexAfterFirstRecovery.some(
        (item) =>
          item.id === activeUnattachedId,
      ),
      'An active record must remain in the index',
    );

    assert.equal(
      await fileExists(
        path.join(
          bucketDir,
          activeUnattached.localFileName,
        ),
      ),
      true,
      'An active local file must remain on disk',
    );

    // -----------------------------------------------------------------------
    // TEST 5: attached media with an existing bargain must be retained
    // -----------------------------------------------------------------------

    assert.ok(
      indexAfterFirstRecovery.some(
        (item) =>
          item.id === pendingLiveId,
      ),
      'A record linked to a live bargain must remain in the index',
    );

    assert.equal(
      await fileExists(
        path.join(
          bucketDir,
          pendingAttachedToLiveBargain.localFileName,
        ),
      ),
      true,
      'A live bargain media file must remain on disk',
    );

    // -----------------------------------------------------------------------
    // TEST 6: an unattached pending record must be recoverable
    // -----------------------------------------------------------------------

    const pendingUnattachedStillExists =
      indexAfterFirstRecovery.some(
        (item) =>
          item.id === pendingUnattachedId,
      );

    assert.equal(
      pendingUnattachedStillExists,
      false,
      'The previously authorized unattached deletion should complete',
    );

    assert.equal(
      await fileExists(
        path.join(
          bucketDir,
          pendingUnattached.localFileName,
        ),
      ),
      false,
      'The unattached pending file should be removed',
    );

    // -----------------------------------------------------------------------
    // TEST 7: an attached record with both documents absent is recoverable
    // -----------------------------------------------------------------------

    const indexAfterRecovery =
      await readIndex();

    assert.equal(
      indexAfterRecovery.some(
        (item) =>
          item.id === pendingDeletedId,
      ),
      false,
      'A pending record whose bargain and ownership documents are absent can be recovered',
    );

    assert.equal(
      await fileExists(
        path.join(
          bucketDir,
          pendingAttachedToDeletedBargain.localFileName,
        ),
      ),
      false,
      'The stale attached media file should be removed',
    );

    // -----------------------------------------------------------------------
    // TEST 8: remote deletion must not be invoked for local-only fixtures
    // -----------------------------------------------------------------------

    assert.ok(
      initialRecords.every(
        (record) =>
          record.remoteS3Synced === false,
      ),
      'Every test fixture must be local-only',
    );

    /*
     * Since no fixture is recorded as remotely synced, this test
     * cannot prove real S3 behavior. It proves that the configured
     * scenario uses no live remote objects.
     */

    // -----------------------------------------------------------------------
    // TEST 9: repeated recovery must not delete unrelated media
    // -----------------------------------------------------------------------

    const secondRecovery = await fetch(
      `${endpoint}?limit=25`,
      {
        method: 'POST',
        headers: adminHeaders,
      },
    );

    assert.ok(
      [200, 207].includes(
        secondRecovery.status,
      ),
    );

    const afterSecondRecovery =
      await readIndex();

    assert.ok(
      afterSecondRecovery.some(
        (record) =>
          record.id === activeUnattachedId,
      ),
    );

    assert.ok(
      afterSecondRecovery.some(
        (record) =>
          record.id === pendingLiveId,
      ),
    );

    assert.equal(
      await fileExists(
        path.join(
          bucketDir,
          activeUnattached.localFileName,
        ),
      ),
      true,
    );

    assert.equal(
      await fileExists(
        path.join(
          bucketDir,
          pendingAttachedToLiveBargain.localFileName,
        ),
      ),
      true,
    );

    // -----------------------------------------------------------------------
    // TEST 10: response must not reveal local storage paths or credentials
    // -----------------------------------------------------------------------

    const responseText =
      JSON.stringify(oversizedJson);

    assert.equal(
      /localFileName|secretAccessKey|secretKey|AWS_SECRET_ACCESS_KEY/i.test(
        responseText,
      ),
      false,
      'Recovery response must not expose local filenames or storage secrets',
    );

    console.log(
      'Pending-delete recovery integration tests passed.',
    );
  } finally {
    if (server) {
      await closeServer(server).catch(() => {});
    }

    if (adminDb) {
      for (const documentPath of createdDocuments) {
        await adminDb
          .doc(documentPath)
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

    for (const key of envKeys) {
      const oldValue = originalEnv[key];

      if (oldValue === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = oldValue;
      }
    }
  }
}

run().catch((error) => {
  console.error(
    '[OBJECT_STORAGE_RECOVERY_INTEGRATION_FAILED]',
    error instanceof Error
      ? error.stack ?? error.message
      : error,
  );

  process.exitCode = 1;
});
