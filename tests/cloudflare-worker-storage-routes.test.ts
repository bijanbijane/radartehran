/**
 * @file tests/cloudflare-worker-storage-routes.test.ts
 * @description Package 1 E2E Worker verification for all 9 canonical `/api/object-storage/*`
 * routes using real `node:sqlite` D1, R2 simulator, and real RS256 Firebase JWTs.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, it } from 'node:test';
import workerEntrypoint from '../worker/index';
import {
  clearTestJwksForEdgeAuth,
  registerTestJwkForEdgeAuth,
} from '../worker/auth/firebaseEdgeAuth';
import {
  D1_MIGRATIONS,
  runD1MigrationsIdempotently,
} from '../worker/db/d1SchemaAndMigrations';
import {
  createLocalR2BucketSimulator,
  storeValidatedMediaWithD1Saga,
} from '../worker/storage/r2StorageAdapter';
import { createCanonicalObjectSignedUrl } from '../worker/storage/signedUrlSecurity';
import type { D1Database, D1PreparedStatement, WorkerEnv } from '../worker/types';

function b64url(input: Uint8Array | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : Buffer.from(input);
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function generateTestKeyAndJwt(payloadOverrides: Record<string, unknown> = {}) {
  const kp = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  );
  const kid = `kid-${Math.random().toString(36).slice(2, 8)}`;
  registerTestJwkForEdgeAuth(kid, kp.publicKey);
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid }));
  const payload = b64url(JSON.stringify({
    iss: 'https://securetoken.google.com/radartehran-test',
    aud: 'radartehran-test',
    sub: 'user-owner-1',
    user_id: 'user-owner-1',
    email: 'owner@example.com',
    email_verified: true,
    iat: now - 30,
    auth_time: now - 30,
    exp: now + 3600,
    ...payloadOverrides,
  }));
  const sig = new Uint8Array(
    await crypto.subtle.sign('RSASSA-PKCS1-v1_5', kp.privateKey, new TextEncoder().encode(`${header}.${payload}`)),
  );
  return `${header}.${payload}.${b64url(sig)}`;
}

function createRealSqliteD1(): { db: D1Database; sqlite: DatabaseSync } {
  const sqlite = new DatabaseSync(':memory:');
  const wrap = (sql: string, params: unknown[] = []): D1PreparedStatement => ({
    bind(...values: unknown[]) {
      return wrap(sql, values);
    },
    async first<T = Record<string, unknown>>(col?: string): Promise<T | null> {
      const row = sqlite.prepare(sql).get(...(params as never[])) as Record<string, unknown> | undefined;
      if (!row) return null;
      return (col ? row[col] : row) as T;
    },
    async all<T = Record<string, unknown>>() {
      return { results: sqlite.prepare(sql).all(...(params as never[])) as T[], success: true };
    },
    async run() {
      const info = sqlite.prepare(sql).run(...(params as never[])) as { changes?: number | bigint };
      return { success: true, meta: { changes: Number(info.changes ?? 0) } };
    },
  });
  return {
    sqlite,
    db: {
      prepare: (q) => wrap(q),
      async batch(stmts) {
        const out = [];
        for (const s of stmts) out.push({ success: (await s.run()).success });
        return out;
      },
      async exec(q) {
        sqlite.exec(q);
        return { count: 1, duration: 1 };
      },
    },
  };
}

const VALID_WEBP = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00,
  0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20,
  0x18, 0x00, 0x00, 0x00, 0x30, 0x01, 0x00, 0x9d,
  0x01, 0x2a, 0x01, 0x00, 0x01, 0x00, 0x02, 0x00,
  0x34, 0x25, 0xa4, 0x00, 0x03, 0x70, 0x00, 0xfe,
  0xfb, 0xfd, 0x50, 0x00,
]);

async function buildEnv() {
  const { db, sqlite } = createRealSqliteD1();
  const r2 = createLocalR2BucketSimulator();
  const sqlDir = path.resolve(process.cwd(), 'migrations/d1');
  for (const mig of D1_MIGRATIONS) {
    sqlite.exec(fs.readFileSync(path.join(sqlDir, mig.fileName), 'utf8'));
  }
  await runD1MigrationsIdempotently(db);
  const env: WorkerEnv = {
    ENVIRONMENT: 'staging',
    FIREBASE_PROJECT_ID: 'radartehran-test',
    FIREBASE_APP_CHECK_MODE: 'disabled',
    R2_MEDIA_BUCKET_NAME: 'radartehran-staging-media',
    R2_SIGNING_SECRET: 'test-signing-secret-0123456789abcdef',
    DB: db,
    MEDIA_BUCKET: r2,
  };
  return { db, sqlite, r2, env };
}

afterEach(() => {
  clearTestJwksForEdgeAuth();
});

describe('Package 1 E2E: Cloudflare Worker Object Storage Routes & R2+D1 Saga', () => {
  it('1. GET /api/object-storage/status returns sanitized R2 capabilities without secrets', async () => {
    const { env } = await buildEnv();
    const res = await workerEntrypoint.fetch(new Request('https://radartehran.ir/api/object-storage/status'), env);
    assert.equal(res.status, 200);
    const body = (await res.json()) as Record<string, unknown>;
    assert.equal(body.provider, 'r2');
    assert.equal(body.chunkedUploadSupported, true);
    assert.equal(body.chunkSizeBytes, 2 * 1024 * 1024);
    assert.equal('R2_SIGNING_SECRET' in body, false);
  });

  it('2. executes full multi-chunk upload-init -> upload-chunk (with idempotent replay & conflict) -> upload-complete -> GET 200/206/416 & signed URL', async () => {
    const { env } = await buildEnv();
    const ownerJwt = await generateTestKeyAndJwt({ sub: 'owner-1', user_id: 'owner-1' });
    const otherJwt = await generateTestKeyAndJwt({ sub: 'other-2', user_id: 'other-2' });

    const part0 = VALID_WEBP.slice(0, 20);
    const part1 = VALID_WEBP.slice(20);

    const initRes = await workerEntrypoint.fetch(
      new Request('https://radartehran.ir/api/object-storage/upload-init', {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerJwt}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mediaType: 'image',
          mimeType: 'image/webp',
          totalSizeBytes: VALID_WEBP.byteLength,
          totalChunks: 2,
          city: 'tehran',
          hoodId: 1,
        }),
      }),
      env,
    );
    assert.equal(initRes.status, 200);
    const { sessionId } = (await initRes.json()) as { sessionId: string };

    // Chunk 0 upload + idempotent replay + conflict on different bytes
    const c0 = await workerEntrypoint.fetch(
      new Request('https://radartehran.ir/api/object-storage/upload-chunk', {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerJwt}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, chunkIndex: 0, base64Data: Buffer.from(part0).toString('base64') }),
      }),
      env,
    );
    assert.equal(c0.status, 200);

    const c0Replay = await workerEntrypoint.fetch(
      new Request('https://radartehran.ir/api/object-storage/upload-chunk', {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerJwt}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, chunkIndex: 0, base64Data: Buffer.from(part0).toString('base64') }),
      }),
      env,
    );
    assert.equal(c0Replay.status, 200);
    assert.equal(((await c0Replay.json()) as { idempotentReplay: boolean }).idempotentReplay, true);

    const c0Conflict = await workerEntrypoint.fetch(
      new Request('https://radartehran.ir/api/object-storage/upload-chunk', {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerJwt}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, chunkIndex: 0, base64Data: Buffer.from([9, 9, 9]).toString('base64') }),
      }),
      env,
    );
    assert.equal(c0Conflict.status, 409);

    // Other user cannot push chunk to owner's session
    const c1Foreign = await workerEntrypoint.fetch(
      new Request('https://radartehran.ir/api/object-storage/upload-chunk', {
        method: 'POST',
        headers: { Authorization: `Bearer ${otherJwt}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, chunkIndex: 1, base64Data: Buffer.from(part1).toString('base64') }),
      }),
      env,
    );
    assert.equal(c1Foreign.status, 403);

    // Upload chunk 1 and complete
    const c1 = await workerEntrypoint.fetch(
      new Request('https://radartehran.ir/api/object-storage/upload-chunk', {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerJwt}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, chunkIndex: 1, base64Data: Buffer.from(part1).toString('base64') }),
      }),
      env,
    );
    assert.equal(c1.status, 200);

    const completeRes = await workerEntrypoint.fetch(
      new Request('https://radartehran.ir/api/object-storage/upload-complete', {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerJwt}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      }),
      env,
    );
    assert.equal(completeRes.status, 200);
    const { mediaObject } = (await completeRes.json()) as { mediaObject: { id: string } };
    assert.ok(mediaObject.id.startsWith('obj-'));

    // GET unauthenticated fails with 401 before bargain attach
    const unauthGet = await workerEntrypoint.fetch(
      new Request(`https://radartehran.ir/api/object-storage/file/${mediaObject.id}`),
      env,
    );
    assert.equal(unauthGet.status, 401);

    // GET by owner returns 200 with full bytes
    const ownerGet = await workerEntrypoint.fetch(
      new Request(`https://radartehran.ir/api/object-storage/file/${mediaObject.id}`, {
        headers: { Authorization: `Bearer ${ownerJwt}` },
      }),
      env,
    );
    assert.equal(ownerGet.status, 200);
    assert.equal(ownerGet.headers.get('accept-ranges'), 'bytes');
    assert.equal((await ownerGet.arrayBuffer()).byteLength, VALID_WEBP.byteLength);

    // GET with valid Range returns 206 Partial Content
    const rangeGet = await workerEntrypoint.fetch(
      new Request(`https://radartehran.ir/api/object-storage/file/${mediaObject.id}`, {
        headers: { Authorization: `Bearer ${ownerJwt}`, Range: 'bytes=0-11' },
      }),
      env,
    );
    assert.equal(rangeGet.status, 206);
    assert.equal(rangeGet.headers.get('content-range'), `bytes 0-11/${VALID_WEBP.byteLength}`);
    assert.equal((await rangeGet.arrayBuffer()).byteLength, 12);

    // GET with unsatisfiable Range returns 416
    const badRange = await workerEntrypoint.fetch(
      new Request(`https://radartehran.ir/api/object-storage/file/${mediaObject.id}`, {
        headers: { Authorization: `Bearer ${ownerJwt}`, Range: 'bytes=5000-6000' },
      }),
      env,
    );
    assert.equal(badRange.status, 416);

    // GET with canonical signed URL succeeds; tampered sig fails 403
    const signed = await createCanonicalObjectSignedUrl({
      objectId: mediaObject.id,
      method: 'GET',
      signingSecret: env.R2_SIGNING_SECRET!,
      expiresInSeconds: 300,
    });
    const signedUrl = `https://radartehran.ir${signed.signedPath}`;
    const signedRes = await workerEntrypoint.fetch(new Request(signedUrl), env);
    assert.equal(signedRes.status, 200);

    const tamperedUrl = signedUrl.replace(signed.signatureHex, '0'.repeat(64));
    const tamperedRes = await workerEntrypoint.fetch(new Request(tamperedUrl), env);
    assert.equal(tamperedRes.status, 403);
  });

  it('3. enforces Legal Hold (423), owner mismatch (403), attach-to-bargain & cleanup-bargain, and R2+D1 Saga compensation', async () => {
    const { db, r2, env } = await buildEnv();
    const ownerJwt = await generateTestKeyAndJwt({ sub: 'owner-1', user_id: 'owner-1' });
    const otherJwt = await generateTestKeyAndJwt({ sub: 'other-2', user_id: 'other-2' });

    // Direct upload image
    const uploadRes = await workerEntrypoint.fetch(
      new Request('https://radartehran.ir/api/object-storage/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerJwt}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mediaType: 'image',
          mimeType: 'image/webp',
          city: 'tehran',
          hoodId: 1,
          base64Data: Buffer.from(VALID_WEBP).toString('base64'),
        }),
      }),
      env,
    );
    assert.equal(uploadRes.status, 200);
    const { mediaObject } = (await uploadRes.json()) as { mediaObject: { id: string; objectKey: string } };

    // Attach to bargain
    const attachRes = await workerEntrypoint.fetch(
      new Request('https://radartehran.ir/api/object-storage/attach-to-bargain', {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerJwt}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ bargainId: 'bargain-42', mediaIds: [mediaObject.id] }),
      }),
      env,
    );
    assert.equal(attachRes.status, 200);

    // Other user cannot delete
    const foreignDel = await workerEntrypoint.fetch(
      new Request(`https://radartehran.ir/api/object-storage/file/${mediaObject.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${otherJwt}` },
      }),
      env,
    );
    assert.equal(foreignDel.status, 403);

    // Place legal hold -> DELETE returns 423 and cleanup-bargain skips held object
    await db
      .prepare('INSERT INTO legal_holds (resource_id, resource_type, reason, active, created_at_iso) VALUES (?1, ?2, ?3, 1, ?4)')
      .bind(mediaObject.id, 'media_object', 'COURT_ORDER', new Date().toISOString())
      .run();

    const heldDel = await workerEntrypoint.fetch(
      new Request(`https://radartehran.ir/api/object-storage/file/${mediaObject.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${ownerJwt}` },
      }),
      env,
    );
    assert.equal(heldDel.status, 423);

    const cleanupHeld = await workerEntrypoint.fetch(
      new Request('https://radartehran.ir/api/object-storage/cleanup-bargain/bargain-42', {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerJwt}` },
      }),
      env,
    );
    assert.equal(cleanupHeld.status, 200);
    const cleanupHeldJson = (await cleanupHeld.json()) as { deletedIds: string[]; skippedLegalHoldIds: string[] };
    assert.deepEqual(cleanupHeldJson.skippedLegalHoldIds, [mediaObject.id]);
    assert.equal(cleanupHeldJson.deletedIds.length, 0);

    // Release legal hold -> cleanup deletes R2 object and marks PHYSICALLY_DELETED in D1
    await db.prepare('UPDATE legal_holds SET active = 0 WHERE resource_id = ?1').bind(mediaObject.id).run();
    const cleanupDone = await workerEntrypoint.fetch(
      new Request('https://radartehran.ir/api/object-storage/cleanup-bargain/bargain-42', {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerJwt}` },
      }),
      env,
    );
    assert.equal(cleanupDone.status, 200);
    const cleanupDoneJson = (await cleanupDone.json()) as { deletedIds: string[] };
    assert.deepEqual(cleanupDoneJson.deletedIds, [mediaObject.id]);
    assert.equal(await r2.head(mediaObject.objectKey), null);

    // Saga compensation: if R2 put fails, D1 row transitions to FAILED_UPLOAD
    const failingR2 = {
      ...r2,
      async put() {
        throw new Error('SIMULATED_R2_OUTAGE');
      },
    };
    const sagaFail = await storeValidatedMediaWithD1Saga({
      r2: failingR2,
      db,
      bucketName: 'radartehran-staging-media',
      ownerUid: 'owner-1',
      city: 'tehran',
      hoodId: 1,
      mediaType: 'image',
      declaredMimeType: 'image/webp',
      bytes: VALID_WEBP,
    });
    assert.equal(sagaFail.ok, false);
    assert.equal(sagaFail.statusCode, 502);
    const failedRows = await db
      .prepare("SELECT lifecycle_state FROM media_objects WHERE lifecycle_state = 'FAILED_UPLOAD'")
      .all<{ lifecycle_state: string }>();
    assert.ok(failedRows.results.length >= 1);
  });
});
