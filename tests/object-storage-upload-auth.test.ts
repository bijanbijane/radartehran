/**
 * @file tests/object-storage-upload-auth.test.ts
 * @description Integration & unit tests for Object Storage upload authentication (Section 94 / Item 230),
 * image/status hardening (Section 93 / Items 214-220), and index concurrency/quarantine/record validation (Section 95 / Item 234).
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import express from 'express';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth, type DecodedIdToken } from 'firebase-admin/auth';
import {
  ensureBucketLoaded,
  isSafeStoredObjectRecord,
  registerObjectStorageRoutes,
  resetObjectStorageIndexForTests,
  type StoredObjectRecord,
} from '../src/utils/serverObjectStorage';
import { processImageToWebpMax800 } from '../src/utils/objectStorageUpload';

function createTestJwt(payload: Record<string, unknown>, sig = 'valid_sig'): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.${sig}`;
}

function makeValidStoredRecord(id = 'obj-1730000000000-a1b2c3d4'): StoredObjectRecord {
  const localFileName = `${id}.webp`;
  return {
    id,
    localFileName,
    objectKey: `listings/tehran/hood-5/image/2026-10/${localFileName}`,
    bucket: 'tehran-housing-radar-media',
    provider: 'arvancloud',
    mediaType: 'image',
    mimeType: 'image/webp',
    sizeBytes: 12345,
    url: `/api/object-storage/file/${id}`,
    remoteS3Synced: false,
    createdAtIso: new Date().toISOString(),
  };
}

async function runTests(): Promise<void> {
  const projectId = 'gen-lang-client-0713157837';
  const nowSec = Math.floor(Date.now() / 1000);
  const bucketDir = path.join(process.cwd(), '.object-storage-bucket');
  const indexFile = path.join(bucketDir, 'index.json');
  const backupIndex = await fs.promises.readFile(indexFile, 'utf-8').catch(() => null);

  process.env.FIREBASE_PROJECT_ID = projectId;
  process.env.ADMIN_API_SECRET = 'test-admin-secret-token-9876543210';

  const revokedUids = new Set<string>(['revoked-user-uid']);
  const appName = `radar-user-auth-${projectId}`;
  const fbApp =
    getApps().find((a) => a.name === appName) ?? initializeApp({ projectId }, appName);
  const authClient = getAuth(fbApp);
  const originalVerifyIdToken = authClient.verifyIdToken.bind(authClient);

  authClient.verifyIdToken = async (token: string, checkRevoked?: boolean): Promise<DecodedIdToken> => {
    const parts = token.split('.');
    if (parts.length !== 3 || parts[2] !== 'valid_sig') {
      throw { code: 'auth/invalid-id-token' };
    }
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as Record<
      string,
      unknown
    >;
    const uid = String(payload.uid ?? payload.user_id ?? payload.sub ?? '');
    if (checkRevoked && revokedUids.has(uid)) {
      throw { code: 'auth/id-token-revoked' };
    }
    return {
      ...payload,
      uid,
    } as unknown as DecodedIdToken;
  };

  const app = express();
  registerObjectStorageRoutes(app, () => {});
  const apiServer = http.createServer(app);
  await new Promise<void>((resolve) => apiServer.listen(0, '127.0.0.1', resolve));
  const apiAddr = apiServer.address();
  assert(apiAddr && typeof apiAddr === 'object');
  const baseUrl = `http://127.0.0.1:${apiAddr.port}`;

  try {
    // =========================================================================
    // SECTION 94 (Item 230): Upload Authentication Scenarios
    // =========================================================================

    // 1. No Authorization header => 401 before body parsing
    const noAuthRes = await fetch(`${baseUrl}/api/object-storage/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mediaType: 'image',
        mimeType: 'image/jpeg',
        hoodId: 5,
        city: 'tehran',
        dataBase64: 'AAAA',
      }),
    });
    assert.equal(noAuthRes.status, 401);
    const noAuthBody = (await noAuthRes.json()) as { code?: string };
    assert.equal(noAuthBody.code, 'MISSING_BEARER_TOKEN');

    // 2. Invalid / disabled / revoked token => 401
    const revokedToken = createTestJwt({
      iss: `https://securetoken.google.com/${projectId}`,
      aud: projectId,
      auth_time: nowSec - 60,
      user_id: 'revoked-user-uid',
      sub: 'revoked-user-uid',
      iat: nowSec - 60,
      exp: nowSec + 3600,
      email: 'revoked@example.com',
      email_verified: true,
    });
    const badTokenRes = await fetch(`${baseUrl}/api/object-storage/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${revokedToken}`,
      },
      body: JSON.stringify({
        mediaType: 'image',
        mimeType: 'image/jpeg',
        hoodId: 5,
        city: 'tehran',
        dataBase64: 'AAAA',
      }),
    });
    assert.equal(badTokenRes.status, 401);
    const badTokenBody = (await badTokenRes.json()) as { code?: string };
    assert.equal(badTokenBody.code, 'INVALID_OR_REVOKED_FIREBASE_TOKEN');

    // 2b. Unverified email user => 403 EMAIL_NOT_VERIFIED
    const unverifiedToken = createTestJwt({
      iss: `https://securetoken.google.com/${projectId}`,
      aud: projectId,
      auth_time: nowSec - 60,
      user_id: 'unverified-user-123',
      sub: 'unverified-user-123',
      iat: nowSec - 60,
      exp: nowSec + 3600,
      email: 'unverified@example.com',
      email_verified: false,
    });
    const unverifiedRes = await fetch(`${baseUrl}/api/object-storage/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${unverifiedToken}`,
      },
      body: JSON.stringify({
        mediaType: 'image',
        mimeType: 'image/jpeg',
        hoodId: 5,
        city: 'tehran',
        dataBase64: 'AAAA',
      }),
    });
    assert.equal(unverifiedRes.status, 403);
    const unverifiedBody = (await unverifiedRes.json()) as { code?: string };
    assert.equal(unverifiedBody.code, 'EMAIL_NOT_VERIFIED');

    // 3. Valid, email-verified Firebase user token => authentication succeeds and reaches file validation
    const validVerifiedToken = createTestJwt({
      iss: `https://securetoken.google.com/${projectId}`,
      aud: projectId,
      auth_time: nowSec - 60,
      user_id: 'verified-user-123',
      sub: 'verified-user-123',
      iat: nowSec - 60,
      exp: nowSec + 3600,
      email: 'user@example.com',
      email_verified: true,
    });
    const validAuthRes = await fetch(`${baseUrl}/api/object-storage/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${validVerifiedToken}`,
      },
      body: JSON.stringify({
        mediaType: 'image',
        mimeType: 'image/jpeg',
        hoodId: 5,
        city: 'tehran',
        dataBase64: '',
      }),
    });
    assert.equal(validAuthRes.status, 400);
    const validAuthBody = (await validAuthRes.json()) as { code?: string };
    assert.equal(validAuthBody.code, 'EMPTY_FILE');

    // =========================================================================
    // SECTION 93: Corrupt Image Rejection & Public Status Privacy
    // =========================================================================
    await assert.rejects(
      () => processImageToWebpMax800(Buffer.from('not-a-valid-image-buffer-payload')),
      /INVALID_IMAGE_INPUT/
    );

    const statusRes = await fetch(`${baseUrl}/api/object-storage/status`);
    assert.equal(statusRes.status, 200);
    const statusBody = (await statusRes.json()) as Record<string, unknown>;
    assert.deepEqual(Object.keys(statusBody).sort(), [
      'maxImageMb',
      'maxVideoMb',
      'providerLabelFa',
      'status',
    ]);

    // =========================================================================
    // SECTION 95 (Item 234): Index Validation, Deduplication, Quarantine & Concurrency
    // =========================================================================
    const validRec = makeValidStoredRecord('obj-1730000000001-a1b2c3d4');
    assert.equal(isSafeStoredObjectRecord(validRec), true);

    // Scenario: localFileName containing ../ is rejected
    assert.equal(
      isSafeStoredObjectRecord({
        ...validRec,
        localFileName: '../obj-1730000000001-a1b2c3d4.webp',
      }),
      false
    );

    // Scenario: objectKey with invalid city or invalid extension is rejected
    assert.equal(
      isSafeStoredObjectRecord({
        ...validRec,
        objectKey: 'listings/tabriz/hood-5/image/2026-10/obj-1730000000001-a1b2c3d4.webp',
      }),
      false
    );
    assert.equal(
      isSafeStoredObjectRecord({
        ...validRec,
        objectKey: 'listings/tehran/hood-5/image/2026-10/obj-1730000000001-a1b2c3d4.exe',
      }),
      false
    );

    // Scenario: Duplicate IDs, path traversal record, and concurrent initial load
    await fs.promises.mkdir(bucketDir, { recursive: true });
    await fs.promises.writeFile(
      indexFile,
      JSON.stringify([
        validRec,
        { ...validRec }, // duplicate ID
        { ...validRec, id: 'obj-1730000000002-b2c3d4e5', localFileName: '../evil.webp' },
      ]),
      'utf-8'
    );
    resetObjectStorageIndexForTests();

    // Two concurrent requests on initial load wait on the shared promise
    const [adminRes1, adminRes2] = await Promise.all([
      fetch(`${baseUrl}/api/object-storage/admin/status`, {
        headers: { 'x-admin-token': process.env.ADMIN_API_SECRET },
      }),
      fetch(`${baseUrl}/api/object-storage/admin/status`, {
        headers: { 'x-admin-token': process.env.ADMIN_API_SECRET },
      }),
    ]);
    const adminBody1 = (await adminRes1.json()) as { totalObjectsCount?: number };
    const adminBody2 = (await adminRes2.json()) as { totalObjectsCount?: number };
    assert.equal(adminBody1.totalObjectsCount, 1);
    assert.equal(adminBody2.totalObjectsCount, 1);

    // Scenario: Missing local file returns 404, invalid objectId returns 404 (Section 98 Item 264)
    const missingFileRes = await fetch(
      `${baseUrl}/api/object-storage/file/${validRec.id}`
    );
    assert.equal(missingFileRes.status, 404);

    const badIdRes = await fetch(`${baseUrl}/api/object-storage/file/not-a-valid-id`);
    assert.equal(badIdRes.status, 404);

    // Scenario: Corrupt JSON in index.json is quarantined
    await fs.promises.writeFile(indexFile, '{corrupt-json-payload', 'utf-8');
    resetObjectStorageIndexForTests();
    await ensureBucketLoaded();
    const bucketFiles = await fs.promises.readdir(bucketDir);
    const quarantinedFiles = bucketFiles.filter((f) => f.startsWith('index.json.corrupt-'));
    assert(quarantinedFiles.length >= 1, 'Expected corrupt index.json to be quarantined');
    for (const qFile of quarantinedFiles) {
      await fs.promises.unlink(path.join(bucketDir, qFile)).catch(() => {});
    }

    console.log('All Section 93, 94, and 95 Object Storage tests passed.');
  } finally {
    authClient.verifyIdToken = originalVerifyIdToken;
    if (backupIndex !== null) {
      await fs.promises.writeFile(indexFile, backupIndex, 'utf-8').catch(() => {});
    } else {
      await fs.promises.unlink(indexFile).catch(() => {});
    }
    resetObjectStorageIndexForTests();
    apiServer.close();
  }
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
