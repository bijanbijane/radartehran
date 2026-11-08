/**
 * @file tests/cloudflare-phase4-r2-and-storage.test.ts
 * @description Phase 4: Production-Grade Cloudflare R2 Object Storage,
 * Media Security, Multipart Life Cycle, and Reconciliation Test Suite.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CloudflareR2StorageAdapter,
  SimulatedR2StorageAdapter,
  buildScopedStorageKey,
  parseAndValidateStorageKey,
  generateDeterministicObjectId,
  sanitizeClientFileName,
  validateMediaBytes,
  detectMagicBytesFormat,
  hasDangerousPayloadOrPolyglot,
  transitionUploadLifecycleState,
  transitionDeletionLifecycleState,
  analyzeStorageConsistency,
  createSignedStorageUrl,
  verifySignedStorageUrl,
  generateMigrationDryRunPlan,
  type CanonicalObjectMetadata,
  type MigrationSourceItem,
} from '../worker/storage/index';

// Pre-crafted authentic test media signatures
const AUTHENTIC_JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0xaa, 0xbb]);
const AUTHENTIC_PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52]);
const AUTHENTIC_WEBP = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, // RIFF
  0x24, 0x00, 0x00, 0x00, // size
  0x57, 0x45, 0x42, 0x50, // WEBP
  0x56, 0x50, 0x38, 0x20, // VP8_
]);
const AUTHENTIC_MP4 = new Uint8Array([
  0x00, 0x00, 0x00, 0x20,
  0x66, 0x74, 0x79, 0x70, // ftyp
  0x69, 0x73, 0x6f, 0x6d, // isom
  0x00, 0x00, 0x02, 0x00,
]);

test('Phase 4: R2 Object Storage & Media Infrastructure Architecture', async (t) => {
  await t.test('1. enforces collision-resistant key design and neutralizes path traversal', () => {
    const objectId = generateDeterministicObjectId();
    assert.match(objectId, /^obj-\d{10,16}-[a-f0-9]{12}$/);

    const safeKey = buildScopedStorageKey({
      environment: 'production',
      city: 'tehran',
      hoodId: 42,
      mediaCategory: 'image',
      mimeType: 'image/webp',
      objectId,
    });
    assert.match(safeKey, /^listings\/production\/tehran\/hood-42\/image\/\d{4}-\d{2}\/obj-.*\.webp$/);

    const parsed = parseAndValidateStorageKey(safeKey);
    assert.equal(parsed.valid, true);
    assert.equal(parsed.city, 'tehran');
    assert.equal(parsed.hoodId, 42);
    assert.equal(parsed.mediaCategory, 'image');

    // Path traversal attacks rejected
    assert.equal(parseAndValidateStorageKey('../../../etc/passwd').valid, false);
    assert.equal(parseAndValidateStorageKey('listings/production/tehran/hood-1/image/2026-05/../../secret.webp').valid, false);
    assert.equal(parseAndValidateStorageKey('listings\\production\\tehran\\secret.webp').valid, false);

    // Client filename sanitized without affecting key
    const sanitizedName = sanitizeClientFileName('../../malicious-name<script>.png');
    assert.equal(sanitizedName, 'malicious-name_script_.png');
    assert.ok(!sanitizedName.includes('/'));
    assert.ok(!sanitizedName.includes('\\'));
  });

  await t.test('2. executes full R2 lifecycle: put, get, head, conditional write, range request, and deletion', async () => {
    const simulated = new SimulatedR2StorageAdapter();
    const adapter = new CloudflareR2StorageAdapter(simulated, 'test-bucket');

    const capabilities = adapter.getCapabilities();
    assert.equal(capabilities.providerId, 'cloudflare_r2');
    assert.equal(capabilities.supportsRangeRequests, true);
    assert.equal(capabilities.supportsConditionalWrites, true);

    const testKey = 'listings/production/tehran/hood-1/image/2026-05/obj-1710000000000-abcdef123456.webp';
    const putRes = await adapter.putObject(testKey, AUTHENTIC_WEBP, {
      httpMetadata: { contentType: 'image/webp', cacheControl: 'public, max-age=31536000' },
      customMetadata: { ownerUid: 'user_123', city: 'tehran' },
    });
    assert.equal(putRes.key, testKey);
    assert.equal(putRes.size, AUTHENTIC_WEBP.byteLength);

    // HEAD check
    const headRes = await adapter.headObject(testKey);
    assert.ok(headRes);
    assert.equal(headRes?.size, AUTHENTIC_WEBP.byteLength);

    // GET full body
    const fullGet = await adapter.getObject(testKey);
    assert.ok(fullGet);
    const fullBytes = new Uint8Array(await fullGet!.arrayBuffer());
    assert.deepEqual(fullBytes, AUTHENTIC_WEBP);

    // Range request GET (first 4 bytes: RIFF)
    const rangeGet = await adapter.getObject(testKey, { range: { offset: 0, length: 4 } });
    assert.ok(rangeGet);
    const rangeBytes = new Uint8Array(await rangeGet!.arrayBuffer());
    assert.deepEqual(rangeBytes, new Uint8Array([0x52, 0x49, 0x46, 0x46]));

    // Conditional matching: matching etag passes, mismatched throws
    const matching = await adapter.putObject(testKey, AUTHENTIC_WEBP, { onlyIf: { etagMatches: putRes.etag } });
    assert.ok(matching);
    await assert.rejects(
      () => adapter.putObject(testKey, AUTHENTIC_WEBP, { onlyIf: { etagMatches: '"non-matching-etag"' } }),
      /R2_PUT_PRECONDITION_FAILED/
    );

    // Delete check
    const delRes = await adapter.deleteObject(testKey);
    assert.equal(delRes.deleted, true);
    assert.equal(delRes.wasAlreadyMissing, false);

    // Second delete returns wasAlreadyMissing: true
    const delRes2 = await adapter.deleteObject(testKey);
    assert.equal(delRes2.deleted, true);
    assert.equal(delRes2.wasAlreadyMissing, true);
  });

  await t.test('3. executes multipart upload creation, part streaming, completion, and abort', async () => {
    const simulated = new SimulatedR2StorageAdapter();
    const adapter = new CloudflareR2StorageAdapter(simulated, 'test-bucket');

    const key = 'listings/production/tehran/hood-5/video/2026-05/obj-1710000000000-abcdef123456.mp4';
    const multipart = await adapter.createMultipartUpload(key);
    assert.ok(multipart.uploadId);

    const part1 = new Uint8Array([1, 2, 3, 4]);
    const part2 = new Uint8Array([5, 6, 7, 8]);

    const upPart1 = await multipart.uploadPart(1, part1);
    const upPart2 = await multipart.uploadPart(2, part2);
    assert.equal(upPart1.partNumber, 1);
    assert.equal(upPart2.partNumber, 2);

    const completed = await multipart.complete([upPart1, upPart2]);
    assert.equal(completed.size, 8);

    const obj = await adapter.getObject(key);
    assert.ok(obj);
    const readBytes = new Uint8Array(await obj!.arrayBuffer());
    assert.deepEqual(readBytes, new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]));

    // Abort test
    const multipart2 = await adapter.createMultipartUpload('temp-key');
    await multipart2.abort();
    await assert.rejects(() => adapter.resumeMultipartUpload('temp-key', multipart2.uploadId), /MULTIPART_SESSION_NOT_FOUND/);
  });

  await t.test('4. validates authentic magic bytes and rejects MIME spoofing, SVG/XML, and polyglots', async () => {
    // 1. Valid Authentic Formats
    const jpegRes = await validateMediaBytes(AUTHENTIC_JPEG, 'image', 'image/jpeg');
    assert.equal(jpegRes.valid, true);
    assert.equal(jpegRes.detectedMime, 'image/jpeg');

    const pngRes = await validateMediaBytes(AUTHENTIC_PNG, 'image', 'image/png');
    assert.equal(pngRes.valid, true);

    const mp4Res = await validateMediaBytes(AUTHENTIC_MP4, 'video', 'video/mp4');
    assert.equal(mp4Res.valid, true);

    // 2. MIME spoofing: EXE disguised as JPEG
    const fakeJpeg = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00]);
    const spoofRes = await validateMediaBytes(fakeJpeg, 'image', 'image/jpeg');
    assert.equal(spoofRes.valid, false);
    assert.equal(spoofRes.errorCode, 'UNRECOGNIZED_MAGIC_BYTES');

    // 3. SVG/XML active vector rejected
    const svgBytes = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    const svgRes = await validateMediaBytes(svgBytes, 'image', 'image/jpeg');
    assert.equal(svgRes.valid, false);
    assert.equal(svgRes.errorCode, 'DANGEROUS_PAYLOAD_DETECTED');

    // 4. Polyglot PHP/HTML in JPEG rejected
    const polyglotBytes = new Uint8Array([...AUTHENTIC_JPEG, ...new TextEncoder().encode('<?php phpinfo(); ?>')]);
    const polyRes = await validateMediaBytes(polyglotBytes, 'image', 'image/jpeg');
    assert.equal(polyRes.valid, false);
    assert.equal(polyRes.errorCode, 'DANGEROUS_PAYLOAD_DETECTED');

    // 5. Category mismatch (video signature declared as image)
    const catRes = await validateMediaBytes(AUTHENTIC_MP4, 'image', 'image/jpeg');
    assert.equal(catRes.valid, false);
    assert.equal(catRes.errorCode, 'MEDIA_CATEGORY_MISMATCH');
  });

  await t.test('5. enforces upload and deletion state machines, legal hold, and retention lock', () => {
    // Permitted upload transitions
    assert.equal(transitionUploadLifecycleState('CREATED', 'AUTHORIZED').success, true);
    assert.equal(transitionUploadLifecycleState('AUTHORIZED', 'UPLOADING').success, true);
    assert.equal(transitionUploadLifecycleState('UPLOADING', 'UPLOADED').success, true);
    assert.equal(transitionUploadLifecycleState('UPLOADED', 'VERIFYING').success, true);
    assert.equal(transitionUploadLifecycleState('VERIFYING', 'VERIFIED').success, true);
    assert.equal(transitionUploadLifecycleState('VERIFIED', 'PUBLISHED').success, true);

    // Illegal jump from CREATED directly to PUBLISHED rejected
    const jump = transitionUploadLifecycleState('CREATED', 'PUBLISHED');
    assert.equal(jump.success, false);
    assert.equal(jump.errorCode, 'INVALID_UPLOAD_STATE_TRANSITION');

    // Deletion under active legal hold strictly rejected
    const legalHoldBlock = transitionDeletionLifecycleState('ACTIVE', 'PHYSICALLY_DELETED', { legalHold: true });
    assert.equal(legalHoldBlock.success, false);
    assert.equal(legalHoldBlock.errorCode, 'LEGAL_HOLD_ACTIVE');

    // Deletion under active retention lock strictly rejected
    const futureDate = new Date(Date.now() + 86400000).toISOString();
    const retentionBlock = transitionDeletionLifecycleState('ACTIVE', 'PHYSICALLY_DELETED', { retentionUntilIso: futureDate });
    assert.equal(retentionBlock.success, false);
    assert.equal(retentionBlock.errorCode, 'RETENTION_PERIOD_ACTIVE');

    // Valid deletion flow when no hold is active
    assert.equal(transitionDeletionLifecycleState('ACTIVE', 'PENDING_PHYSICAL_DELETE').success, true);
    assert.equal(transitionDeletionLifecycleState('PENDING_PHYSICAL_DELETE', 'PHYSICALLY_DELETED').success, true);
  });

  await t.test('6. analyzes consistency and identifies orphan objects, missing bytes, and discrepancies', () => {
    const storageKeys = [
      'listings/production/tehran/hood-1/image/2026-05/obj-1.webp',
      'listings/production/tehran/hood-1/image/2026-05/obj-dangling.webp',
    ];

    const metadata: CanonicalObjectMetadata[] = [
      {
        objectId: 'obj-1',
        storageKey: 'listings/production/tehran/hood-1/image/2026-05/obj-1.webp',
        providerId: 'cloudflare_r2',
        environment: 'production',
        ownerUid: 'uid_1',
        mediaCategory: 'image',
        mimeType: 'image/webp',
        declaredSizeBytes: 1000,
        actualSizeBytes: 1000,
        sha256Checksum: 'abcdef',
        lifecycleState: 'PUBLISHED',
        deletionState: 'ACTIVE',
        visibility: 'PUBLIC_WHEN_ATTACHED',
        legalHold: false,
        uploadGrantId: 'grant_1',
        idempotencyKey: 'idem_1',
        createdAtIso: '2026-05-01T00:00:00Z',
        updatedAtIso: '2026-05-01T00:00:00Z',
        deletionAttempts: 0,
        revision: 1,
      },
      {
        objectId: 'obj-missing-bytes',
        storageKey: 'listings/production/tehran/hood-1/image/2026-05/obj-missing-bytes.webp',
        providerId: 'cloudflare_r2',
        environment: 'production',
        ownerUid: 'uid_2',
        mediaCategory: 'image',
        mimeType: 'image/webp',
        declaredSizeBytes: 2000,
        actualSizeBytes: 2000,
        sha256Checksum: 'fedcba',
        lifecycleState: 'PUBLISHED',
        deletionState: 'ACTIVE',
        visibility: 'PUBLIC_WHEN_ATTACHED',
        legalHold: false,
        uploadGrantId: 'grant_2',
        idempotencyKey: 'idem_2',
        createdAtIso: '2026-05-01T00:00:00Z',
        updatedAtIso: '2026-05-01T00:00:00Z',
        deletionAttempts: 0,
        revision: 1,
      },
    ];

    const report = analyzeStorageConsistency(storageKeys, metadata);
    assert.equal(report.totalObjectsScanned, 2);
    assert.equal(report.totalMetadataScanned, 2);
    assert.equal(report.orphanObjectsCount, 1); // obj-dangling
    assert.equal(report.missingObjectsCount, 1); // obj-missing-bytes
    assert.equal(report.discrepancies.length, 2);
  });

  await t.test('7. generates and validates HMAC-signed URLs, preventing method tampering and expiration', async () => {
    const secret = 'super-secret-hmac-key-for-test-32bytes';
    const key = 'listings/production/tehran/hood-1/image/2026-05/obj-1.webp';

    const signedUrl = await createSignedStorageUrl('https://radartehran.example.com', {
      storageKey: key,
      method: 'GET',
      expiresInSeconds: 300,
      expectedOwnerUid: 'user_42',
    }, secret);

    const parsed = new URL(signedUrl);
    const validResult = await verifySignedStorageUrl(parsed, 'GET', secret);
    assert.equal(validResult.valid, true);
    assert.equal(validResult.key, key);
    assert.equal(validResult.ownerUid, 'user_42');

    // Method mismatch tampering (GET signed URL invoked with PUT)
    const methodMismatch = await verifySignedStorageUrl(parsed, 'PUT', secret);
    assert.equal(methodMismatch.valid, false);
    assert.equal(methodMismatch.errorCode, 'HTTP_METHOD_NOT_PERMITTED');

    // Signature tampering
    parsed.searchParams.set('sig', 'tampered-signature-hex');
    const tampered = await verifySignedStorageUrl(parsed, 'GET', secret);
    assert.equal(tampered.valid, false);
    assert.equal(tampered.errorCode, 'INVALID_SIGNATURE');

    // Expiration check
    parsed.searchParams.set('exp', String(Math.floor(Date.now() / 1000) - 10)); // expired 10s ago
    const expired = await verifySignedStorageUrl(parsed, 'GET', secret);
    assert.equal(expired.valid, false);
    assert.equal(expired.errorCode, 'SIGNED_URL_EXPIRED');
  });

  await t.test('8. generates deterministic migration dry-run plan with zero source mutation', () => {
    const sourceItems: MigrationSourceItem[] = [
      {
        id: 'obj-1710000000000-aaaa11112222',
        sourceKey: 'listings/tehran/hood-1/image/2026-05/obj-1710000000000-aaaa11112222.webp',
        sizeBytes: 150000,
        mimeType: 'image/webp',
        mediaCategory: 'image',
        city: 'tehran',
        hoodId: 1,
        ownerUid: 'uid_1',
        checksumSha256: 'sha256_mock_1',
        createdAtIso: '2026-05-01T00:00:00Z',
      },
      {
        id: 'obj-1710000000000-bbbb22223333',
        sourceKey: 'listings/karaj/hood-103/video/2026-05/obj-1710000000000-bbbb22223333.mp4',
        sizeBytes: 4500000,
        mimeType: 'video/mp4',
        mediaCategory: 'video',
        city: 'karaj',
        hoodId: 103,
        ownerUid: 'uid_2',
        checksumSha256: 'sha256_mock_2',
        createdAtIso: '2026-05-01T00:00:00Z',
      },
    ];

    const plan = generateMigrationDryRunPlan(sourceItems, { batchSize: 50, targetEnvironment: 'production' });
    assert.equal(plan.totalSourceObjects, 2);
    assert.equal(plan.totalSourceBytes, 4650000);
    assert.equal(plan.collisionsDetected, 0);
    assert.equal(plan.batchesPlanned, 1);
    assert.equal(plan.batches[0].items.length, 2);
    assert.match(plan.batches[0].items[0].destinationKey, /^listings\/production\/tehran\/hood-1\/image/);
    assert.match(plan.batches[0].items[1].destinationKey, /^listings\/production\/karaj\/hood-103\/video/);
  });
});
