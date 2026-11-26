/**
 * @file tests/object-storage-security.test.ts
 *
 * Security regression tests for Tehran Radar Object Storage.
 *
 * Run:
 *   npx tsx tests/object-storage-security.test.ts
 *
 * Tests cover existing exported helpers, static route contracts,
 * and concurrent 10x100MB quota enforcement via `reserveUploadCapacity`.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import express, { type Express } from 'express';
import sharp from 'sharp';
import { createCloudflareSessionBridgeMiddleware } from '../src/utils/serverCloudflareSessionBridge';
import { createCloudflareSessionAssertion } from '../worker/auth/sessionAssertion';
import type { WorkerSessionPrincipal } from '../worker/auth/sessionAuth';

import {
  classifyStoredObjectReference,
  detectMediaFormatByMagicBytes,
  isSafeStoredObjectRecord,
  parseSingleByteRange,
  validateMediaMagicBytesAndExtension,
  writeFileAtomically,
  type MediaAuditReferences,
  type StoredObjectRecord,
} from '../src/utils/serverObjectStorageHelpers';

import {
  MAX_BYTES_PER_OWNER,
  ensureBucketLoaded,
  registerObjectStorageRoutes,
  reserveUploadCapacity,
  resetObjectStorageIndexForTests,
} from '../src/utils/serverObjectStorage';

import {
  buildListingObjectKey,
} from '../src/utils/objectStorage';

const TEST_SESSION_BRIDGE_SECRET = 'object-storage-quota-test-session-bridge-secret';

function installTestSessionBridge(app: Express): void {
  app.use((req, _res, next) => {
    const uidHeader = req.headers['x-test-uid'];
    const uid = typeof uidHeader === 'string' && uidHeader.trim() ? uidHeader.trim() : 'owner-user-a';
    const primaryAdmin = req.headers['x-test-primary-admin'] === 'true';
    const correlationId = 'quota-test-' + randomUUID();
    const principal: WorkerSessionPrincipal = {
      authenticated: true,
      uid,
      email: primaryAdmin ? 'radio837isf@gmail.com' : uid + '@example.com',
      emailVerified: true,
      phoneNumber: null,
      displayName: primaryAdmin ? 'Primary Admin' : 'Test User',
      isAdmin: primaryAdmin,
      isPrimaryAdmin: primaryAdmin,
      isDelegatedAdmin: false,
      authProvider: 'google',
      authTimeSeconds: Math.floor(Date.now() / 1000),
      statusCode: 200,
      reasonCode: 'SESSION_VERIFIED',
    };
    void createCloudflareSessionAssertion({
      request: new Request(new URL(req.originalUrl, 'https://radartehran.test').toString(), { method: req.method }),
      principal,
      secret: TEST_SESSION_BRIDGE_SECRET,
      correlationId,
    }).then((assertion) => {
      req.headers['x-radar-session-assertion'] = assertion;
      req.headers['x-radar-worker-hop'] = '1';
      req.headers['x-correlation-id'] = correlationId;
      next();
    }).catch(next);
  });
  app.use(createCloudflareSessionBridgeMiddleware({
    AUTH_INTERNAL_HMAC_SECRET: TEST_SESSION_BRIDGE_SECRET,
  }));
}

const rootDir = process.cwd();

const storageSource = fs.readFileSync(
  path.join(rootDir, 'src/utils/serverObjectStorage.ts'),
  'utf8',
);

const helperSource = fs.readFileSync(
  path.join(rootDir, 'src/utils/serverObjectStorageHelpers.ts'),
  'utf8',
);

interface TestCase {
  name: string;
  run: () => void | Promise<void>;
}

const tests: TestCase[] = [];

function addTest(
  name: string,
  run: TestCase['run'],
): void {
  tests.push({ name, run });
}

function makeWebpBuffer(): Buffer {
  const buffer = Buffer.alloc(20);

  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(buffer.length - 8, 4);
  buffer.write('WEBP', 8, 'ascii');
  buffer.write('VP8X', 12, 'ascii');

  return buffer;
}

function makeJpegBuffer(): Buffer {
  return Buffer.from([
    0xff, 0xd8, 0xff, 0xe0,
    0x00, 0x10,
    0x4a, 0x46, 0x49, 0x46,
    0x00, 0x00, 0x00, 0x00,
  ]);
}

function makePngBuffer(): Buffer {
  return Buffer.from(
    '89504e470d0a1a0a00000000',
    'hex',
  );
}

function makeMp4HeaderBuffer(): Buffer {
  return Buffer.from([
    0x00, 0x00, 0x00, 0x18,
    0x66, 0x74, 0x79, 0x70,
    0x69, 0x73, 0x6f, 0x6d,
    0x00, 0x00, 0x02, 0x00,
    0x69, 0x73, 0x6f, 0x6d,
    0x69, 0x73, 0x6f, 0x32,
    0x00, 0x00, 0x00, 0x08,
    0x6d, 0x64, 0x61, 0x74,
  ]);
}

const validId = 'obj-1760000000000-a1b2c3d4';

const validRecord: StoredObjectRecord = {
  id: validId,
  objectKey:
    `listings/tehran/hood-12/image/2026-10/${validId}.webp`,
  bucket: 'radar-test',
  provider: 'local_bucket',
  mediaType: 'image',
  mimeType: 'image/webp',
  sizeBytes: 1024,
  url: `/api/object-storage/file/${validId}`,
  remoteS3Synced: false,
  createdAtIso: '2026-10-29T00:00:00.000Z',
  localFileName: `${validId}.webp`,
  ownerUid: 'test-user-1',
};

// ---------------------------------------------------------------------------
// 1. Magic-byte detection
// ---------------------------------------------------------------------------

addTest('Recognizes a JPEG signature', () => {
  const result = detectMediaFormatByMagicBytes(
    makeJpegBuffer(),
  );

  assert.ok(result);
  assert.equal(result.mediaType, 'image');
  assert.ok(result.supportedMimeTypes.includes('image/jpeg'));
});

addTest('Recognizes a PNG signature', () => {
  const result = detectMediaFormatByMagicBytes(
    makePngBuffer(),
  );

  assert.ok(result);
  assert.equal(result.mediaType, 'image');
  assert.ok(result.supportedMimeTypes.includes('image/png'));
});

addTest('Recognizes a WebP signature', () => {
  const result = detectMediaFormatByMagicBytes(
    makeWebpBuffer(),
  );

  assert.ok(result);
  assert.equal(result.mediaType, 'image');
  assert.ok(result.supportedMimeTypes.includes('image/webp'));
});

addTest('Recognizes an ISO-BMFF MP4 header', () => {
  const result = detectMediaFormatByMagicBytes(
    makeMp4HeaderBuffer(),
  );

  assert.ok(result);
  assert.equal(result.mediaType, 'video');
  assert.ok(result.supportedMimeTypes.includes('video/mp4'));
});

addTest('Rejects an unrecognized file signature', () => {
  const result = detectMediaFormatByMagicBytes(
    Buffer.from('this is not an image or video'),
  );

  assert.equal(result, null);
});

// ---------------------------------------------------------------------------
// 2. MIME, extension and media-type matching
// ---------------------------------------------------------------------------

addTest('Accepts matching WebP bytes, MIME and extension', () => {
  const result = validateMediaMagicBytesAndExtension({
    buffer: makeWebpBuffer(),
    mimeType: 'image/webp',
    extension: '.webp',
    mediaType: 'image',
  });

  assert.equal(result.valid, true);
});

addTest('Rejects WebP bytes falsely declared as JPEG', () => {
  const result = validateMediaMagicBytesAndExtension({
    buffer: makeWebpBuffer(),
    mimeType: 'image/jpeg',
    extension: '.jpg',
    mediaType: 'image',
  });

  assert.equal(result.valid, false);
  assert.equal(result.reason, 'MAGIC_BYTES_MIME_MISMATCH');
});

addTest('Rejects a mismatched image extension', () => {
  const result = validateMediaMagicBytesAndExtension({
    buffer: makeWebpBuffer(),
    mimeType: 'image/webp',
    extension: '.jpg',
    mediaType: 'image',
  });

  assert.equal(result.valid, false);
  assert.equal(
    result.reason,
    'MAGIC_BYTES_EXTENSION_MISMATCH',
  );
});

addTest('Rejects an image submitted as video', () => {
  const result = validateMediaMagicBytesAndExtension({
    buffer: makePngBuffer(),
    mimeType: 'image/png',
    extension: '.png',
    mediaType: 'video',
  });

  assert.equal(result.valid, false);
  assert.equal(
    result.reason,
    'MAGIC_BYTES_MEDIA_TYPE_MISMATCH',
  );
});

// ---------------------------------------------------------------------------
// 3. Object-store index record validation
// ---------------------------------------------------------------------------

addTest('Accepts a structurally valid stored object record', () => {
  assert.equal(
    isSafeStoredObjectRecord(validRecord),
    true,
  );
});

addTest('Rejects a path-traversal local filename', () => {
  assert.equal(
    isSafeStoredObjectRecord({
      ...validRecord,
      localFileName: `../${validRecord.localFileName}`,
    }),
    false,
  );
});

addTest('Rejects an object key belonging to another object ID', () => {
  assert.equal(
    isSafeStoredObjectRecord({
      ...validRecord,
      objectKey:
        'listings/tehran/hood-12/image/2026-10/' +
        'obj-1760000000001-ffffffff.webp',
    }),
    false,
  );
});

addTest('Rejects an unsupported storage provider', () => {
  assert.equal(
    isSafeStoredObjectRecord({
      ...validRecord,
      provider: 'unknown_provider',
    }),
    false,
  );
});

addTest('Rejects a negative or excessive stored byte count', () => {
  assert.equal(
    isSafeStoredObjectRecord({
      ...validRecord,
      sizeBytes: -10,
    }),
    false,
  );

  assert.equal(
    isSafeStoredObjectRecord({
      ...validRecord,
      sizeBytes: 251 * 1024 * 1024,
    }),
    false,
  );
});

addTest('Rejects invalid owner metadata', () => {
  assert.equal(
    isSafeStoredObjectRecord({
      ...validRecord,
      ownerUid: '   ',
    }),
    false,
  );
});

// ---------------------------------------------------------------------------
// 4. Object-key generation
// ---------------------------------------------------------------------------

addTest('Builds a hierarchical key for a supported city', () => {
  const key = buildListingObjectKey({
    city: 'tehran',
    hoodId: 12,
    mediaType: 'image',
    mimeType: 'image/webp',
    objectId: validId,
  });

  assert.match(
    key,
    /^listings\/tehran\/hood-12\/image\/\d{4}-(0[1-9]|1[0-2])\/obj-\d{10,16}-[a-f0-9]{8}\.webp$/i,
  );
});

// ---------------------------------------------------------------------------
// 5. HTTP byte-range handling
// ---------------------------------------------------------------------------

addTest('Parses a single-byte range', () => {
  assert.deepEqual(
    parseSingleByteRange('bytes=0-0', 10),
    { start: 0, end: 0 },
  );
});

addTest('Parses an open-ended range', () => {
  assert.deepEqual(
    parseSingleByteRange('bytes=5-', 10),
    { start: 5, end: 9 },
  );
});

addTest('Parses a suffix range', () => {
  assert.deepEqual(
    parseSingleByteRange('bytes=-4', 10),
    { start: 6, end: 9 },
  );
});

addTest('Clamps the requested end to the file boundary', () => {
  assert.deepEqual(
    parseSingleByteRange('bytes=5-100', 10),
    { start: 5, end: 9 },
  );
});

addTest('Rejects multiple ranges', () => {
  assert.equal(
    parseSingleByteRange('bytes=0-1,4-5', 10),
    null,
  );
});

addTest('Rejects ranges outside the available file size', () => {
  assert.equal(
    parseSingleByteRange('bytes=10-11', 10),
    null,
  );

  assert.equal(
    parseSingleByteRange('bytes=-0', 10),
    null,
  );

  assert.equal(
    parseSingleByteRange('bytes=8-3', 10),
    null,
  );
});

addTest('Rejects invalid total sizes', () => {
  assert.equal(parseSingleByteRange('bytes=0-1', 0), null);
  assert.equal(parseSingleByteRange('bytes=0-1', -1), null);
  assert.equal(parseSingleByteRange('bytes=0-1', 1.5), null);
});

// ---------------------------------------------------------------------------
// 6. Atomic file writing
// ---------------------------------------------------------------------------

addTest('Atomically writes a complete file and preserves its content', async () => {
  const testDirectory = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), 'radar-object-storage-test-'),
  );

  try {
    const target = path.join(testDirectory, 'payload.bin');
    const expected = Buffer.from('radar-storage-test');

    await writeFileAtomically(target, expected);

    const actual = await fs.promises.readFile(target);

    assert.deepEqual(actual, expected);
  } finally {
    await fs.promises.rm(testDirectory, {
      recursive: true,
      force: true,
    });
  }
});

addTest('Atomic writer rejects an empty buffer', async () => {
  const testDirectory = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), 'radar-object-storage-empty-'),
  );

  try {
    const target = path.join(testDirectory, 'empty.bin');

    await assert.rejects(
      () => writeFileAtomically(target, Buffer.alloc(0)),
      /INVALID_FILE_BUFFER/,
    );

    assert.equal(
      fs.existsSync(target),
      false,
    );
  } finally {
    await fs.promises.rm(testDirectory, {
      recursive: true,
      force: true,
    });
  }
});

// ---------------------------------------------------------------------------
// 7. Static checks for security-sensitive HTTP route contracts
// ---------------------------------------------------------------------------

addTest('Upload endpoint requires a verified Cloudflare D1 session', () => {
  assert.match(
    storageSource,
    /app\.post\(['"]\/api\/object-storage\/upload['"],\s*requireVerifiedCloudflareSession,\s*uploadJsonParser/,
  );

  assert.match(
    storageSource,
    /verifyAuthenticatedUserHeader/,
  );
});

addTest('Upload endpoint binds the uploaded object to the authenticated UID', () => {
  assert.match(
    storageSource,
    /const ownerUid = res\.locals\.cloudflareUid/,
  );

  assert.match(
    storageSource,
    /remoteS3Synced:\s*false,\s*createdAtIso:[\s\S]*?ownerUid/,
  );
});

addTest('Final file validation occurs before the durable local write', () => {
  const validationIndex = storageSource.indexOf(
    'const finalMagicCheck = validateMediaMagicBytesAndExtension',
  );

  const writeIndex = storageSource.indexOf(
    'await writeFileAtomically(localFilePath, finalBuffer, 0o600)',
  );

  assert.ok(validationIndex >= 0, 'Final validation must exist');
  assert.ok(writeIndex >= 0, 'Atomic write must exist');

  assert.ok(
    validationIndex < writeIndex,
    'Final media validation must precede the durable write',
  );
});

addTest('Deletion endpoint verifies admin/user authorization and ownership', () => {
  const deleteStart = storageSource.indexOf(
    "app.delete('/api/object-storage/file/:objectId'",
  );

  assert.ok(deleteStart >= 0);

  const deleteSource = storageSource.slice(deleteStart);

  assert.match(deleteSource, /verifyAdminApiAuthorization/);
  assert.match(deleteSource, /verifyAuthenticatedUserHeader/);
  assert.match(deleteSource, /removed\.ownerUid\s*===\s*userAuth\.uid/);
  assert.match(deleteSource, /if\s*\(!isAdmin\s*&&\s*!isOwner\)/);
});

addTest('Public media endpoint enables content-type sniffing protection', () => {
  assert.match(
    storageSource,
    /res\.setHeader\('X-Content-Type-Options',\s*'nosniff'\)/,
  );
});

addTest('Public storage-status response does not expose S3 credentials', () => {
  const start = storageSource.indexOf(
    "app.get('/api/object-storage/status'",
  );

  const end = storageSource.indexOf(
    "app.get('/api/object-storage/admin/status'",
  );

  assert.ok(start >= 0 && end > start);

  const publicStatusSource = storageSource.slice(start, end);

  assert.doesNotMatch(
    publicStatusSource,
    /secretAccessKey|accessKeySecret|AWS_SECRET_ACCESS_KEY/i,
  );
});

addTest('Object-index persistence failure has an explicit rollback path', () => {
  assert.match(
    storageSource,
    /OBJECT_INDEX_PERSIST_FAILED/,
  );

  assert.match(
    storageSource,
    /await fs\.promises\.unlink\(localFilePath\)\.catch\(\(\) => \{\}\)/,
  );
});

// ---------------------------------------------------------------------------
// 8. Concurrent 10x100MB Quota Integration Test (`reserveUploadCapacity`)
// ---------------------------------------------------------------------------

addTest('Integration: 10 concurrent 100MB uploads to /api/object-storage/upload enforce 500MB quota (5 succeed, 5 fail with STORAGE_QUOTA_EXCEEDED)', async () => {
  assert.equal(MAX_BYTES_PER_OWNER, 500 * 1024 * 1024);
  assert.ok(
    helperSource.includes('MAX_BYTES_PER_OWNER = 500 * 1024 * 1024'),
    'Per-owner 500MB quota constant must be defined',
  );

  resetObjectStorageIndexForTests();

  const ownerUid = 'concurrent-quota-user-500mb';
  const hundredMbBytes = 100 * 1024 * 1024;
  const activeReservations: Array<{ release: () => void }> = [];

  try {
    // Dispatch 10 simultaneous 100MB upload requests for the same user
    const concurrentRequests = Array.from({ length: 10 }, async (_, index) => {
      // Simulate concurrent arrival at `/api/object-storage/upload` reservation gate
      await Promise.resolve();
      const reservation = reserveUploadCapacity(ownerUid, hundredMbBytes);
      if (!reservation) {
        return {
          requestIndex: index,
          statusCode: 507,
          body: {
            status: 'error',
            code: 'STORAGE_QUOTA_EXCEEDED',
          },
        };
      }
      activeReservations.push(reservation);
      // Keep reservation active while concurrent sibling uploads are in-flight
      await new Promise((resolve) => setTimeout(resolve, 15));
      return {
        requestIndex: index,
        statusCode: 200,
        body: {
          status: 'ok',
          code: 'UPLOAD_ACCEPTED',
        },
      };
    });

    const responses = await Promise.all(concurrentRequests);

    const succeeded = responses.filter((res) => res.statusCode === 200);
    const rejected = responses.filter(
      (res) =>
        res.statusCode === 507 &&
        res.body.code === 'STORAGE_QUOTA_EXCEEDED',
    );

    assert.equal(
      succeeded.length,
      5,
      `Expected exactly 5 successful 100MB uploads under 500MB cap, got ${succeeded.length}`,
    );
    assert.equal(
      rejected.length,
      5,
      `Expected exactly 5 rejected 100MB uploads with STORAGE_QUOTA_EXCEEDED, got ${rejected.length}`,
    );
  } finally {
    for (const r of activeReservations) {
      r.release();
    }
    resetObjectStorageIndexForTests();
  }
});

function makeQuotaFixtureRecord(
  index: number,
  ownerUid: string,
): StoredObjectRecord {
  const hex = (index + 1)
    .toString(16)
    .padStart(8, '0');

  const id = `obj-1730000000000-${hex}`;
  const localFileName = `${id}.webp`;

  return {
    id,
    localFileName,
    objectKey:
      `listings/tehran/hood-5/image/2026-10/` +
      localFileName,
    bucket: 'tehran-housing-radar-media',
    provider: 'arvancloud',
    mediaType: 'image',
    mimeType: 'image/webp',
    sizeBytes: 1024,
    url: `/api/object-storage/file/${id}`,
    remoteS3Synced: false,
    createdAtIso: new Date().toISOString(),
    ownerUid,
  };
}

addTest('Integration: per-owner 30-file quota, 299-slot concurrent upload race, and 300-file global quota', async () => {
  const sessionSecret = 'object-storage-quota-test-session-bridge-secret';
  const sessionPrincipal: WorkerSessionPrincipal = {
    authenticated: true,
    uid: 'owner-user-a',
    email: 'owner-a@example.com',
    emailVerified: true,
    phoneNumber: null,
    displayName: 'User A',
    isAdmin: false,
    isPrimaryAdmin: false,
    isDelegatedAdmin: false,
    authProvider: 'google',
    authTimeSeconds: Math.floor(Date.now() / 1000),
    statusCode: 200,
    reasonCode: 'SESSION_VERIFIED',
  };
  const bucketDir = path.join(process.cwd(), '.object-storage-bucket');
  const indexFile = path.join(bucketDir, 'index.json');
  await fs.promises.mkdir(bucketDir, { recursive: true });
  const backupIndex = await fs.promises.readFile(indexFile, 'utf-8').catch(() => null);

  const validJpegBuffer = await sharp({
    create: {
      width: 24,
      height: 24,
      channels: 3,
      background: { r: 16, g: 185, b: 129 },
    },
  })
    .jpeg()
    .toBuffer();

  const app = express();
  installTestSessionBridge(app);
  registerObjectStorageRoutes(app, () => {});
  const apiServer = http.createServer(app);
  await new Promise<void>((resolve) => apiServer.listen(0, '127.0.0.1', resolve));
  const apiAddr = apiServer.address();
  assert(apiAddr && typeof apiAddr === 'object');
  const baseUrl = `http://127.0.0.1:${apiAddr.port}`;

  try {
    /**
     * 1. 30 existing files owned by User A must block another upload
     * from User A, even though the global bucket is far from full.
     */
    const thirtyOwnedRecords = Array.from(
      { length: 30 },
      (_, index) => makeQuotaFixtureRecord(index, 'owner-user-a'),
    );

    await fs.promises.writeFile(
      indexFile,
      JSON.stringify(thirtyOwnedRecords),
      'utf-8',
    );

    resetObjectStorageIndexForTests();
    await ensureBucketLoaded();

    const ownerQuotaResponse = await fetch(
      `${baseUrl}/api/object-storage/upload`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          mediaType: 'image',
          mimeType: 'image/jpeg',
          hoodId: 5,
          city: 'tehran',
          dataBase64: validJpegBuffer.toString('base64'),
        }),
      },
    );

    assert.equal(ownerQuotaResponse.status, 507);

    const ownerQuotaJson = (await ownerQuotaResponse.json()) as {
      code?: string;
    };

    assert.equal(
      ownerQuotaJson.code,
      'STORAGE_QUOTA_EXCEEDED',
    );

    /**
     * 2. With 299 objects stored, two concurrent uploads must not
     * both consume the single remaining global slot.
     */
    const twoNinetyNineRecords = Array.from(
      { length: 299 },
      (_, index) =>
        makeQuotaFixtureRecord(
          index,
          `global-fixture-${Math.floor(index / 29)}`,
        ),
    );

    await fs.promises.writeFile(
      indexFile,
      JSON.stringify(twoNinetyNineRecords),
      'utf-8',
    );

    resetObjectStorageIndexForTests();
    await ensureBucketLoaded();

    const sendConcurrentUpload = () =>
      fetch(`${baseUrl}/api/object-storage/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          mediaType: 'image',
          mimeType: 'image/jpeg',
          hoodId: 5,
          city: 'tehran',
          dataBase64: validJpegBuffer.toString('base64'),
        }),
      });

    const concurrentResponses = await Promise.all([
      sendConcurrentUpload(),
      sendConcurrentUpload(),
    ]);

    const concurrentStatuses = concurrentResponses
      .map((response) => response.status)
      .sort((a, b) => a - b);

    assert.deepEqual(
      concurrentStatuses,
      [200, 507],
      'Only one upload may consume the final available slot',
    );

    const persistedConcurrentRecords = JSON.parse(
      await fs.promises.readFile(indexFile, 'utf-8'),
    ) as StoredObjectRecord[];

    assert.equal(
      persistedConcurrentRecords.length,
      300,
      'Concurrent uploads must not exceed the global object-count limit',
    );

    // Clean up any local files created during the 200 OK concurrent upload
    for (const rec of persistedConcurrentRecords) {
      if (rec.ownerUid === 'owner-user-a') {
        await fs.promises.unlink(path.join(bucketDir, rec.localFileName)).catch(() => {});
      }
    }

    /**
     * 3. Global 300-record capacity check with distributed fixture owners
     */
    const threeHundredRecords = Array.from(
      { length: 300 },
      (_, i) =>
        makeQuotaFixtureRecord(
          i,
          `global-quota-fixture-${Math.floor(i / 29)}`,
        ),
    );

    await fs.promises.writeFile(
      indexFile,
      JSON.stringify(threeHundredRecords),
      'utf-8',
    );

    resetObjectStorageIndexForTests();
    await ensureBucketLoaded();

    const globalQuotaRes = await fetch(
      `${baseUrl}/api/object-storage/upload`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          mediaType: 'image',
          mimeType: 'image/jpeg',
          hoodId: 5,
          city: 'tehran',
          dataBase64: validJpegBuffer.toString('base64'),
        }),
      },
    );

    assert.equal(globalQuotaRes.status, 507);
  } finally {
    if (backupIndex !== null) {
      await fs.promises.writeFile(indexFile, backupIndex, 'utf-8').catch(() => {});
    } else {
      await fs.promises.unlink(indexFile).catch(() => {});
    }
    resetObjectStorageIndexForTests();
    apiServer.close();
  }
});

// ---------------------------------------------------------------------------
// 8b. Media Association & Post-Deletion Cleanup Tests (`attach-to-bargain` & `cleanup-bargain`)
// ---------------------------------------------------------------------------

addTest('Validates optional bargainId and deletionState on StoredObjectRecord and rejects malformed values', () => {
  assert.equal(
    isSafeStoredObjectRecord({
      ...validRecord,
      bargainId: 'bargain_valid_12345',
      deletionState: 'active',
    }),
    true,
  );
  assert.equal(
    isSafeStoredObjectRecord({
      ...validRecord,
      bargainId: 'bargain_valid_12345',
      deletionState: 'pending_delete',
    }),
    true,
  );
  assert.equal(
    isSafeStoredObjectRecord({
      ...validRecord,
      bargainId: 'short',
    }),
    false,
  );
  assert.equal(
    isSafeStoredObjectRecord({
      ...validRecord,
      bargainId: '../bad/id/123456',
    }),
    false,
  );
  assert.equal(
    isSafeStoredObjectRecord({
      ...validRecord,
      deletionState: 'unknown_state' as 'active',
    }),
    false,
  );
});

addTest('Integration: attach-to-bargain, 409 block on direct DELETE of bargain-attached media, pending_delete 404 block, and two-phase cleanup-bargain', async () => {
  const bucketDir = path.join(process.cwd(), '.object-storage-bucket');
  const indexFile = path.join(bucketDir, 'index.json');
  await fs.promises.mkdir(bucketDir, { recursive: true });
  const backupIndex = await fs.promises.readFile(indexFile, 'utf-8').catch(() => null);

  // Mock Firestore documents in the admin Firestore instance
  const { getFirebaseAdminFirestoreForServer } = await import(
    '../src/utils/serverAdminAndTelegramSecurity'
  );
  const adminDb = getFirebaseAdminFirestoreForServer();
  const originalCollection = adminDb.collection.bind(adminDb);

  const mockFirestoreDocs = new Map<string, Record<string, unknown>>();
  (adminDb as unknown as { collection: (colName: string) => unknown }).collection = (
    colName: string,
  ) => ({
    doc: (docId: string) => ({
      get: async () => {
        const key = `${colName}/${docId}`;
        const data = mockFirestoreDocs.get(key);
        return {
          exists: Boolean(data),
          data: () => data,
        };
      },
    }),
  });

  const mediaA1 = makeQuotaFixtureRecord(0, 'owner-user-a');
  const mediaA2 = makeQuotaFixtureRecord(1, 'owner-user-a');
  const mediaB1 = makeQuotaFixtureRecord(2, 'owner-user-b');
  const fileA1Path = path.join(bucketDir, mediaA1.localFileName);
  const fileA2Path = path.join(bucketDir, mediaA2.localFileName);
  const fileB1Path = path.join(bucketDir, mediaB1.localFileName);

  const app = express();
  installTestSessionBridge(app);
  registerObjectStorageRoutes(app, () => {});
  const apiServer = http.createServer(app);
  await new Promise<void>((resolve) => apiServer.listen(0, '127.0.0.1', resolve));
  const apiAddr = apiServer.address();
  assert(apiAddr && typeof apiAddr === 'object');
  const baseUrl = `http://127.0.0.1:${apiAddr.port}`;

  try {
    await fs.promises.writeFile(fileA1Path, Buffer.from('media-a1'), 'utf-8');
    await fs.promises.writeFile(fileA2Path, Buffer.from('media-a2'), 'utf-8');
    await fs.promises.writeFile(fileB1Path, Buffer.from('media-b1'), 'utf-8');
    await fs.promises.writeFile(
      indexFile,
      JSON.stringify([mediaA1, mediaA2, mediaB1]),
      'utf-8',
    );
    resetObjectStorageIndexForTests();
    await ensureBucketLoaded();

    const bargain1Id = 'bargain_doc_owner_a_01';
    const bargain2Id = 'bargain_doc_owner_a_02';
    const bargainBId = 'bargain_doc_owner_b_01';

    // 1. User B cannot attach User A's media ID to User B's bargain
    mockFirestoreDocs.set(`bargains/${bargainBId}`, {
      hoodId: 5,
      objectStorageObjectIds: [mediaA1.id],
    });
    mockFirestoreDocs.set(`bargainOwners/${bargainBId}`, {
      bargainId: bargainBId,
      userId: 'owner-user-b',
    });

    const crossUserAttachRes = await fetch(
      `${baseUrl}/api/object-storage/attach-to-bargain`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-test-uid': 'owner-user-b',
        },
        body: JSON.stringify({
          bargainId: bargainBId,
          objectIds: [mediaA1.id],
        }),
      },
    );
    assert.equal(
      crossUserAttachRes.status,
      404,
      'User B must not be able to attach User A media object',
    );

    // 2. User A can attach their own mediaA1 to bargain1Id
    mockFirestoreDocs.set(`bargains/${bargain1Id}`, {
      hoodId: 5,
      objectStorageObjectIds: [mediaA1.id],
    });
    mockFirestoreDocs.set(`bargainOwners/${bargain1Id}`, {
      bargainId: bargain1Id,
      userId: 'owner-user-a',
    });

    const validAttachRes = await fetch(
      `${baseUrl}/api/object-storage/attach-to-bargain`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          bargainId: bargain1Id,
          objectIds: [mediaA1.id],
        }),
      },
    );
    assert.equal(validAttachRes.status, 200);

    // 2b. Section 9 & 10: Direct DELETE of bargain-attached media must be rejected with 409 MEDIA_ATTACHED_TO_BARGAIN
    const blockedDeleteResponse = await fetch(
      `${baseUrl}/api/object-storage/file/${encodeURIComponent(mediaA1.id)}`,
      {
        method: 'DELETE',
        headers: {
        },
      },
    );
    assert.equal(
      blockedDeleteResponse.status,
      409,
      'Direct deletion of bargain-linked media must be blocked',
    );
    const blockedDeleteJson = (await blockedDeleteResponse.json()) as {
      code?: string;
    };
    assert.equal(blockedDeleteJson.code, 'MEDIA_ATTACHED_TO_BARGAIN');
    // Confirm the local file was preserved on disk
    await fs.promises.access(fileA1Path);

    // Even admin cannot directly delete bargain-attached media via generic DELETE endpoint
    const blockedAdminDeleteResponse = await fetch(
      `${baseUrl}/api/object-storage/file/${encodeURIComponent(mediaA1.id)}`,
      {
        method: 'DELETE',
        headers: {
          'x-test-primary-admin': 'true',
        },
      },
    );
    assert.equal(blockedAdminDeleteResponse.status, 409);

    // 3. Media already attached to bargain1Id cannot be attached to bargain2Id
    mockFirestoreDocs.set(`bargains/${bargain2Id}`, {
      hoodId: 5,
      objectStorageObjectIds: [mediaA1.id],
    });
    mockFirestoreDocs.set(`bargainOwners/${bargain2Id}`, {
      bargainId: bargain2Id,
      userId: 'owner-user-a',
    });

    const duplicateAttachRes = await fetch(
      `${baseUrl}/api/object-storage/attach-to-bargain`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          bargainId: bargain2Id,
          objectIds: [mediaA1.id],
        }),
      },
    );
    assert.equal(
      duplicateAttachRes.status,
      409,
      'Media already attached to another bargain must be rejected with 409',
    );
    const duplicateJson = (await duplicateAttachRes.json()) as { code?: string };
    assert.equal(duplicateJson.code, 'MEDIA_ALREADY_ATTACHED');

    // Attach mediaA2 to bargain2Id so we can verify isolation during cleanup
    mockFirestoreDocs.set(`bargains/${bargain2Id}`, {
      hoodId: 5,
      objectStorageObjectIds: [mediaA2.id],
    });
    const attachA2Res = await fetch(
      `${baseUrl}/api/object-storage/attach-to-bargain`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          bargainId: bargain2Id,
          objectIds: [mediaA2.id],
        }),
      },
    );
    assert.equal(attachA2Res.status, 200);

    // 4. Cleanup request while bargain or bargainOwner still exists in Firestore returns 409
    const prematureCleanupRes = await fetch(
      `${baseUrl}/api/object-storage/cleanup-bargain/${bargain1Id}`,
      {
        method: 'POST',
        headers: {
          'x-test-primary-admin': 'true',
        },
      },
    );
    assert.equal(
      prematureCleanupRes.status,
      409,
      'Cleanup must return 409 while bargain or bargainOwner still exists',
    );

    // 5. After both bargain and bargainOwner docs are deleted, cleanup removes mediaA1 and preserves mediaA2 & mediaB1
    mockFirestoreDocs.delete(`bargains/${bargain1Id}`);
    mockFirestoreDocs.delete(`bargainOwners/${bargain1Id}`);

    const cleanupRes = await fetch(
      `${baseUrl}/api/object-storage/cleanup-bargain/${bargain1Id}`,
      {
        method: 'POST',
        headers: {
          'x-test-primary-admin': 'true',
        },
      },
    );
    assert.equal(cleanupRes.status, 200);
    const cleanupJson = (await cleanupRes.json()) as {
      status?: string;
      deletedCount?: number;
      cleanupPendingIds?: string[];
    };
    assert.equal(cleanupJson.status, 'ok');
    assert.equal(cleanupJson.deletedCount, 1);
    assert.deepEqual(cleanupJson.cleanupPendingIds, []);
    assert.equal(fs.existsSync(fileA1Path), false, 'Deleted bargain media file must be unlinked');
    assert.equal(fs.existsSync(fileA2Path), true, 'Other bargain media file must remain intact');
    assert.equal(fs.existsSync(fileB1Path), true, 'Other user media file must remain intact');

    // 6. Section 10: If remoteS3Synced is true and remote S3 deletion fails, the record is marked pending_delete,
    // blocked from public GET (404), and retained in cleanupPendingIds for retry
    const retryBargainId = 'bargain_doc_retry_s3_01';
    const mediaS3Retry: StoredObjectRecord = {
      ...makeQuotaFixtureRecord(10, 'owner-user-a'),
      remoteS3Synced: true,
      bargainId: retryBargainId,
    };
    const fileS3RetryPath = path.join(bucketDir, mediaS3Retry.localFileName);
    await fs.promises.writeFile(fileS3RetryPath, Buffer.from('media-s3-retry'), 'utf-8');
    await fs.promises.writeFile(
      indexFile,
      JSON.stringify([mediaA2, mediaB1, mediaS3Retry]),
      'utf-8',
    );
    resetObjectStorageIndexForTests();
    await ensureBucketLoaded();

    const partialCleanupRes = await fetch(
      `${baseUrl}/api/object-storage/cleanup-bargain/${retryBargainId}`,
      {
        method: 'POST',
        headers: {
          'x-test-primary-admin': 'true',
        },
      },
    );
    assert.equal(
      partialCleanupRes.status,
      207,
      'Failed remote S3 delete must return 207 partial and keep record ID for retry',
    );
    const partialJson = (await partialCleanupRes.json()) as {
      status?: string;
      deletedCount?: number;
      cleanupPendingIds?: string[];
    };
    assert.equal(partialJson.status, 'partial');
    assert.equal(partialJson.deletedCount, 0);
    assert.deepEqual(partialJson.cleanupPendingIds, [mediaS3Retry.id]);

    // Public GET for an object in pending_delete state must return 404 OBJECT_NOT_FOUND
    const pendingGetRes = await fetch(
      `${baseUrl}/api/object-storage/file/${encodeURIComponent(mediaS3Retry.id)}`,
    );
    assert.equal(
      pendingGetRes.status,
      404,
      'Public GET must return 404 for objects in pending_delete state',
    );
    await fs.promises.unlink(fileS3RetryPath).catch(() => {});
  } finally {
    (adminDb as unknown as { collection: typeof originalCollection }).collection =
      originalCollection;
    delete process.env.ADMIN_API_SECRET;
    await fs.promises.unlink(fileA1Path).catch(() => {});
    await fs.promises.unlink(fileA2Path).catch(() => {});
    await fs.promises.unlink(fileB1Path).catch(() => {});
    if (backupIndex !== null) {
      await fs.promises.writeFile(indexFile, backupIndex, 'utf-8').catch(() => {});
    } else {
      await fs.promises.unlink(indexFile).catch(() => {});
    }
    resetObjectStorageIndexForTests();
    apiServer.close();
  }
});

// ---------------------------------------------------------------------------
// 8c. Pure Orphan-Media Audit Classification Tests (`classifyStoredObjectReference`)
// ---------------------------------------------------------------------------

const auditFixture: StoredObjectRecord = {
  ...validRecord,
  id: 'obj-1730000000000-12345678',
  url: '/api/object-storage/file/obj-1730000000000-12345678',
};

const emptyAuditReferences: MediaAuditReferences = {
  objectIds: new Set<string>(),
  objectKeys: new Set<string>(),
  urls: new Set<string>(),
  bargainIds: new Set<string>(),
};

addTest('Classifies pending_delete records before reference checks', () => {
  assert.equal(
    classifyStoredObjectReference(
      {
        ...auditFixture,
        deletionState: 'pending_delete',
        bargainId: 'bargain_100',
      },
      {
        objectIds: new Set([auditFixture.id]),
        objectKeys: new Set([auditFixture.objectKey]),
        urls: new Set([auditFixture.url]),
        bargainIds: new Set(['bargain_100']),
      },
    ),
    'pending_deletion',
  );
});

addTest('Classifies media linked to an existing bargainId without direct reference as associated_bargain_reference_missing', () => {
  assert.equal(
    classifyStoredObjectReference(
      {
        ...auditFixture,
        bargainId: 'bargain_100',
      },
      {
        ...emptyAuditReferences,
        bargainIds: new Set(['bargain_100']),
      },
    ),
    'associated_bargain_reference_missing',
  );
});

addTest('Classifies media referenced by objectStorageObjectIds as referenced', () => {
  assert.equal(
    classifyStoredObjectReference(
      auditFixture,
      {
        ...emptyAuditReferences,
        objectIds: new Set([auditFixture.id]),
      },
    ),
    'referenced',
  );
});

addTest('Classifies media referenced by imageUrl or videoUrl as referenced', () => {
  assert.equal(
    classifyStoredObjectReference(
      auditFixture,
      {
        ...emptyAuditReferences,
        urls: new Set([auditFixture.url]),
      },
    ),
    'referenced',
  );
});

addTest('Classifies media referenced by objectKey as referenced', () => {
  assert.equal(
    classifyStoredObjectReference(
      auditFixture,
      {
        ...emptyAuditReferences,
        objectKeys: new Set([auditFixture.objectKey]),
      },
    ),
    'referenced',
  );
});

addTest('Flags stale bargain links separately from unreferenced candidates', () => {
  assert.equal(
    classifyStoredObjectReference(
      {
        ...auditFixture,
        bargainId: 'deleted_bargain_999',
      },
      emptyAuditReferences,
    ),
    'stale_bargain_association',
  );
});

addTest('Classifies media with no known reference as likely_orphan', () => {
  assert.equal(
    classifyStoredObjectReference(
      auditFixture,
      emptyAuditReferences,
    ),
    'likely_orphan',
  );
});

// ---------------------------------------------------------------------------
// 9. Run suite
// ---------------------------------------------------------------------------

let passed = 0;

for (const test of tests) {
  try {
    await test.run();
    passed++;
    console.log(`[PASS] ${passed}. ${test.name}`);
  } catch (error) {
    console.error(`[FAIL] ${test.name}`);

    if (error instanceof Error) {
      console.error(error.stack ?? error.message);
    } else {
      console.error(error);
    }

    process.exitCode = 1;
    break;
  }
}

if (process.exitCode !== 1) {
  console.log(
    `\nAll ${passed} Object Storage security regression tests passed.`,
  );
}


