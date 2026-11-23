import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  clearTestJwksForEdgeAuth,
  registerTestJwkForEdgeAuth,
  verifyFirebaseIdTokenOnEdge,
} from '../worker/auth/firebaseEdgeAuth';
import {
  GOOGLE_FIREBASE_APP_CHECK_JWKS_URL,
  injectMockJwksKeysForTests,
  resetJwksCacheForTests,
} from '../worker/auth/jwksClient';
import {
  AUTHORITATIVE_D1_MIGRATIONS_TABLE,
  buildD1SessionBookmarkHeader,
  createLocalD1DatabaseSimulator,
  D1_MIGRATIONS,
  queryNeighborhoodProjectionsD1,
  runD1MigrationsIdempotently,
  upsertNeighborhoodProjectionD1,
} from '../worker/db/d1SchemaAndMigrations';
import {
  createLocalR2BucketSimulator,
  createSignedR2MediaUrl,
  deleteMediaFromR2WithLegalHoldCheck,
  detectEdgeMediaMagicBytes,
  storeValidatedMediaInR2,
  verifySignedR2MediaUrl,
} from '../worker/storage/r2StorageAdapter';
import {
  buildVersionedKvKey,
  createLocalKvNamespaceSimulator,
  evaluateTieredWorkerRateLimit,
  getOrPopulateKvSwrCache,
} from '../worker/cache/kvAndEdgeRateLimiter';
import {
  computeQueueRetryDelaySeconds,
  convertUtcScheduledTimeToTehranWallClock,
  processRadarQueueBatch,
  type RadarQueueEnvelope,
} from '../worker/queues/queueAndCronProcessor';
import {
  computeRealEstateDomainEdgeMetrics,
  recordTruthfulWorkerRequestTelemetry,
  scrubPiiFromTelemetryText,
} from '../worker/telemetry/workerTelemetryEngine';
import { evaluateStranglerFallbackSafety, WORKER_HOP_HEADER } from '../worker/stranglerFallback';
import workerEntrypoint from '../worker/index';
import type {
  D1Database,
  D1PreparedStatement,
  DependencyCompatibilityEntry,
  MessageBatch,
  QueueMessage,
  WorkerEnv,
  WorkerExecutionContext,
} from '../worker/types';
import { getStorageProviderLabelFa } from '../src/utils/objectStorage';
import {
  buildValidatedS3TargetUrl,
  normalizeStorageProvider,
  resolveObjectStorageRuntimeConfig,
} from '../src/utils/objectStorageUpload';
import { getRuntimeEnvConfig } from '../src/utils/serverRuntimeEnvStore';

function createRealSqliteD1Database(): D1Database {
  const sqlite = new DatabaseSync(':memory:');
  const makeStmt = (query: string, boundValues: unknown[] = []): D1PreparedStatement => ({
    bind(...values: unknown[]) {
      return makeStmt(query, values);
    },
    async first<T = Record<string, unknown>>(colName?: string): Promise<T | null> {
      const stmt = sqlite.prepare(query);
      const row = stmt.get(...(boundValues as Array<string | number | null>)) as Record<string, unknown> | undefined;
      if (!row) return null;
      if (colName) return (row[colName] as T) ?? null;
      return row as T;
    },
    async run() {
      const stmt = sqlite.prepare(query);
      const info = stmt.run(...(boundValues as Array<string | number | null>));
      return {
        success: true,
        meta: { duration: 0.1, changes: Number(info.changes) },
      };
    },
    async all<T = Record<string, unknown>>() {
      const stmt = sqlite.prepare(query);
      const rows = stmt.all(...(boundValues as Array<string | number | null>)) as T[];
      return {
        results: rows,
        success: true,
      };
    },
  });
  return {
    prepare(query: string) {
      return makeStmt(query);
    },
    async batch<T = unknown>(statements: D1PreparedStatement[]) {
      const out: Array<{ results?: T[]; success: boolean }> = [];
      for (const s of statements) {
        out.push(await s.run());
      }
      return out;
    },
    async exec(query: string) {
      sqlite.exec(query);
      return { count: 1, duration: 0.1 };
    },
  };
}

function toBase64Url(bytes: Uint8Array | string): string {
  const buf = typeof bytes === 'string' ? Buffer.from(bytes, 'utf-8') : Buffer.from(bytes);
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function signTestFirebaseJwt(
  privateKey: CryptoKey,
  kid: string,
  payload: Record<string, unknown>,
): Promise<string> {
  const headerB64 = toBase64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid }));
  const payloadB64 = toBase64Url(JSON.stringify(payload));
  const signingInput = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, signingInput);
  return `${headerB64}.${payloadB64}.${toBase64Url(new Uint8Array(sig))}`;
}

async function runSuite(): Promise<void> {
  console.log('⚡ Running Cloudflare Worker Platform & Architecture Verification Suite...');

  // 1. First-class R2 provider & endpoint resolution
  {
    assert.equal(normalizeStorageProvider('r2'), 'r2');
    assert.equal(normalizeStorageProvider('cloudflare_r2'), 'r2');
    assert.equal(getStorageProviderLabelFa('r2'), 'آبجکت استوریج کلودفلر (Cloudflare R2)');
    const r2Cfg = resolveObjectStorageRuntimeConfig({
      OBJECT_STORAGE_PROVIDER: 'r2',
      OBJECT_STORAGE_BUCKET: 'radartehran-staging-media',
      R2_ACCOUNT_ID: 'acc1234567890abcdef',
      R2_ACCESS_KEY_ID: 'r2_access_key_12345',
      R2_SECRET_ACCESS_KEY: 'r2_secret_key_1234567890abcdef',
    });
    assert.equal(r2Cfg.provider, 'r2');
    assert.equal(r2Cfg.region, 'auto');
    assert.equal(r2Cfg.endpoint, 'https://acc1234567890abcdef.r2.cloudflarestorage.com');
    assert.equal(r2Cfg.s3CredentialsConfigured, true);
    const validKey = 'listings/tehran/hood-1/image/2026-11/obj-1762620000000-a1b2c3d4.webp';
    const targetUrl = buildValidatedS3TargetUrl(validKey, r2Cfg, {
      OBJECT_STORAGE_PROVIDER: 'r2',
      R2_ACCOUNT_ID: 'acc1234567890abcdef',
    });
    assert.ok(targetUrl, 'Expected valid R2 target URL for allowlisted *.r2.cloudflarestorage.com host');
    assert.equal(targetUrl?.hostname, 'acc1234567890abcdef.r2.cloudflarestorage.com');
    const runtimeR2 = getRuntimeEnvConfig({
      OBJECT_STORAGE_PROVIDER: 'cloudflare_r2',
      R2_ACCOUNT_ID: 'acc1234567890abcdef',
      R2_ACCESS_KEY_ID: 'r2_key',
      R2_SECRET_ACCESS_KEY: 'r2_sec',
    });
    assert.equal(runtimeR2.OBJECT_STORAGE_PROVIDER, 'r2');
    assert.equal(runtimeR2.OBJECT_STORAGE_REGION, 'auto');
    assert.equal(runtimeR2.OBJECT_STORAGE_ENDPOINT, 'https://acc1234567890abcdef.r2.cloudflarestorage.com');
    console.log('  ✅ 1. First-class Cloudflare R2 provider, auto region, and account endpoint resolution verified');
  }

  // 2. WebCrypto RS256 Firebase JWT verification on Edge
  {
    clearTestJwksForEdgeAuth();
    const keyPair = await crypto.subtle.generateKey(
      {
        name: 'RSASSA-PKCS1-v1_5',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256',
      },
      true,
      ['sign', 'verify'],
    );
    registerTestJwkForEdgeAuth('test-kid-1', keyPair.publicKey);
    const db = createLocalD1DatabaseSimulator();
    await runD1MigrationsIdempotently(db);
    const env: WorkerEnv = {
      WORKER_ENV: 'staging',
      FIREBASE_PROJECT_ID: 'gen-lang-client-0713157837',
      ADMIN_EMAIL: 'radio837isf@gmail.com',
      DB: db,
    };
    const nowSec = Math.floor(Date.now() / 1000);
    const validAdminJwt = await signTestFirebaseJwt(keyPair.privateKey, 'test-kid-1', {
      iss: 'https://securetoken.google.com/gen-lang-client-0713157837',
      aud: 'gen-lang-client-0713157837',
      sub: 'uid_admin_01',
      email: 'radio837isf@gmail.com',
      email_verified: true,
      iat: nowSec - 60,
      exp: nowSec + 1800,
      auth_time: nowSec - 60,
    });
    resetJwksCacheForTests();
    injectMockJwksKeysForTests(GOOGLE_FIREBASE_APP_CHECK_JWKS_URL, {
      'test-appcheck-kid-1': keyPair.publicKey,
    });
    const validAppCheckJwt = await signTestFirebaseJwt(keyPair.privateKey, 'test-appcheck-kid-1', {
      iss: 'https://firebaseappcheck.googleapis.com/935427453422',
      aud: ['projects/935427453422', 'projects/gen-lang-client-0713157837'],
      sub: '1:935427453422:web:25817d32df713f2a68deff',
      app_id: '1:935427453422:web:25817d32df713f2a68deff',
      iat: nowSec - 30,
      exp: nowSec + 1800,
    });
    const verified = await verifyFirebaseIdTokenOnEdge({
      authorizationHeader: `Bearer ${validAdminJwt}`,
      appCheckHeader: validAppCheckJwt,
      env: { ...env, FIREBASE_APP_CHECK_MODE: 'enforced' },
      nowSeconds: nowSec,
    });
    assert.equal(verified.authenticated, true);
    assert.equal(verified.isAdmin, true);
    assert.equal(verified.appCheckVerified, true);

    const forgedAppCheck = await verifyFirebaseIdTokenOnEdge({
      authorizationHeader: `Bearer ${validAdminJwt}`,
      appCheckHeader: 'eyJhbGciOiJSUzI1NiJ9.eyJhcHAiOiJyYWRhciJ9.c2ln',
      env: { ...env, FIREBASE_APP_CHECK_MODE: 'enforced' },
      nowSeconds: nowSec,
    });
    assert.equal(forgedAppCheck.authenticated, false);
    assert.equal(forgedAppCheck.appCheckVerified, false);
    assert.equal(forgedAppCheck.statusCode, 401);

    const expiredJwt = await signTestFirebaseJwt(keyPair.privateKey, 'test-kid-1', {
      iss: 'https://securetoken.google.com/gen-lang-client-0713157837',
      aud: 'gen-lang-client-0713157837',
      sub: 'uid_user_02',
      email: 'user@example.com',
      email_verified: true,
      iat: nowSec - 3600,
      exp: nowSec - 120,
    });
    const expiredCheck = await verifyFirebaseIdTokenOnEdge({
      authorizationHeader: `Bearer ${expiredJwt}`,
      env,
      nowSeconds: nowSec,
    });
    assert.equal(expiredCheck.authenticated, false);
    assert.equal(expiredCheck.reasonCode, 'JWT_EXPIRED');

    const unverifiedEmailJwt = await signTestFirebaseJwt(keyPair.privateKey, 'test-kid-1', {
      iss: 'https://securetoken.google.com/gen-lang-client-0713157837',
      aud: 'gen-lang-client-0713157837',
      sub: 'uid_unverified',
      email: 'unverified@example.com',
      email_verified: false,
      iat: nowSec - 10,
      exp: nowSec + 600,
    });
    const unverifiedCheck = await verifyFirebaseIdTokenOnEdge({
      authorizationHeader: `Bearer ${unverifiedEmailJwt}`,
      env,
      nowSeconds: nowSec,
    });
    assert.equal(unverifiedCheck.authenticated, false);
    assert.equal(unverifiedCheck.statusCode, 403);
    assert.equal(unverifiedCheck.reasonCode, 'EMAIL_NOT_VERIFIED');
    console.log('  ✅ 2. WebCrypto RS256 Firebase JWT & App Check edge verification (valid, expired, unverified) verified');
  }

  // 3. Single authoritative D1 migration ledger (d1_migrations), SQL SHA-256 parity, projections, and bookmarks
  {
    assert.equal(AUTHORITATIVE_D1_MIGRATIONS_TABLE, 'd1_migrations');
    for (const mig of D1_MIGRATIONS) {
      const diskPath = path.join(process.cwd(), 'migrations/d1', mig.fileName);
      assert.ok(fs.existsSync(diskPath), `Missing SQL file on disk: ${diskPath}`);
      const diskSql = fs.readFileSync(diskPath, 'utf-8').trim();
      assert.ok(!diskSql.includes('schema_migrations'), 'Must not create competing schema_migrations table');
      const diskSha256 = crypto.createHash('sha256').update(diskSql).digest('hex');
      assert.equal(diskSha256, mig.checksumSha256, `SHA-256 mismatch on ${mig.fileName}`);
      assert.equal(diskSql, mig.sql.trim(), `SQL content mismatch between disk and TypeScript mirror on ${mig.fileName}`);
    }

    for (const [engineLabel, db] of [
      ['real-node-sqlite', createRealSqliteD1Database()],
      ['worker-d1-simulator', createLocalD1DatabaseSimulator()],
    ] as const) {
      const mig = await runD1MigrationsIdempotently(db);
      assert.equal(mig.ledgerTable, 'd1_migrations');
      assert.equal(mig.appliedVersions.length, 3, `Expected 3 D1 migrations on ${engineLabel}`);
      const migSecond = await runD1MigrationsIdempotently(db);
      assert.equal(migSecond.appliedVersions.length, 0, `Idempotent re-run must apply 0 duplicate migrations on ${engineLabel}`);

      await upsertNeighborhoodProjectionD1(db, {
        city_id: 'tehran',
        hood_id: 1,
        name_fa: 'سعادت‌آباد',
        district: 2,
        buy_per_sqm_million: 185,
        deal_per_sqm_million: 171.5,
        rahn_80m_million: 2600,
        aqi: 74,
        investment_score: 91.5,
        firestore_version_iso: new Date().toISOString(),
        projected_at_iso: new Date().toISOString(),
      });

      const queried = await queryNeighborhoodProjectionsD1(db, {
        cityId: 'tehran',
        maxBuyPerSqmMillion: 200,
        minInvestmentScore: 80,
      });
      assert.equal(queried.authority, 'firestore_primary_d1_projection');
      assert.equal(queried.items.length, 1);
      assert.equal(queried.items[0].name_fa, 'سعادت‌آباد');
    }

    const bmHeader = buildD1SessionBookmarkHeader('bm_0001_tehran_seq');
    assert.equal(bmHeader['X-D1-Consistency-Mode'], 'sequential_bookmark_session');
    console.log('  ✅ 3. Single authoritative d1_migrations ledger, SQL SHA-256 parity, projections, and bookmarks verified');
  }

  // 4. R2 upload, magic-byte enforcement, signed URLs, byte-range, and legal hold protection
  {
    const r2 = createLocalR2BucketSimulator();
    const db = createLocalD1DatabaseSimulator();
    await runD1MigrationsIdempotently(db);

    const svgSpoof = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    assert.equal(detectEdgeMediaMagicBytes(svgSpoof).valid, false);

    // Valid WebP header (RIFF....WEBP)
    const webpBytes = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00,
      0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20,
      0x18, 0x00, 0x00, 0x00, 0x30, 0x01, 0x00, 0x9d,
    ]);
    const stored = await storeValidatedMediaInR2({
      r2,
      bucketName: 'radartehran-staging-media',
      ownerUid: 'uid_owner_1',
      city: 'tehran',
      hoodId: 1,
      mediaType: 'image',
      declaredMimeType: 'image/webp',
      bytes: webpBytes,
    });
    assert.equal(stored.ok, true);
    if (stored.ok) {
      const signed = await createSignedR2MediaUrl({
        objectId: stored.mediaObject.id,
        objectKey: stored.mediaObject.objectKey,
        method: 'GET',
        mimeType: 'image/webp',
        expiresInSeconds: 300,
        signingSecret: 'staging_r2_secret_key_for_hmac_verification',
        nowSeconds: 1_760_000_000,
      });
      const verifiedSig = await verifySignedR2MediaUrl({
        objectId: stored.mediaObject.id,
        objectKey: stored.mediaObject.objectKey,
        method: 'GET',
        mimeType: 'image/webp',
        expSeconds: signed.expiresAtSeconds,
        signatureHex: signed.signatureHex,
        signingSecret: 'staging_r2_secret_key_for_hmac_verification',
        nowSeconds: 1_760_000_100,
      });
      assert.equal(verifiedSig, true);

      // Place object under legal hold and verify deletion is blocked with 423
      await db
        .prepare('INSERT OR REPLACE INTO legal_holds (resource_id, resource_type, reason, active) VALUES (?1, ?2, ?3, ?4)')
        .bind(stored.mediaObject.id, 'r2_media_object', 'JUDICIAL_DISPUTE_HOLD', 1)
        .run();
      const blockedDelete = await deleteMediaFromR2WithLegalHoldCheck({
        r2,
        db,
        objectId: stored.mediaObject.id,
        objectKey: stored.mediaObject.objectKey,
      });
      assert.equal(blockedDelete.deleted, false);
      assert.equal(blockedDelete.statusCode, 423);
    }

    // Synthetic staging-smoke/ prefix upload, retrieval, range read, and cleanup verification (Section 8)
    const smokeKey = 'staging-smoke/webp-integrity-check.webp';
    await r2.put(smokeKey, webpBytes, {
      httpMetadata: { contentType: 'image/webp' },
      customMetadata: { smokeSuite: 'true' },
    });
    const smokeHead = await r2.head(smokeKey);
    assert.ok(smokeHead);
    assert.equal(smokeHead.size, webpBytes.byteLength);
    const smokeRange = await r2.get(smokeKey, { range: { offset: 0, length: 4 } });
    assert.ok(smokeRange);
    const riffMagic = new TextDecoder().decode(await smokeRange.arrayBuffer());
    assert.equal(riffMagic, 'RIFF');
    await r2.delete(smokeKey);
    assert.equal(await r2.head(smokeKey), null, 'Synthetic staging-smoke/ object must be cleaned up after verification');
    console.log('  ✅ 4. Cloudflare R2 media validation, SHA-256, HMAC signed URLs, staging-smoke/ lifecycle, and legal-hold guard verified');
  }

  // 5. KV SWR cache & non-authoritative namespace guard + multi-tier rate limiting
  {
    assert.throws(
      () => buildVersionedKvKey('staging', 'bargain_ownership', 'b1'),
      /KV_AUTHORITATIVE_STATE_FORBIDDEN/,
    );
    const kv = createLocalKvNamespaceSimulator();
    let loaderCalls = 0;
    const first = await getOrPopulateKvSwrCache({
      kv,
      env: 'staging',
      namespace: 'market_pulse',
      key: 'tehran',
      freshTtlSeconds: 60,
      staleTtlSeconds: 180,
      nowMs: 1_000_000,
      loader: async () => {
        loaderCalls += 1;
        return { usdToman: 68500 };
      },
    });
    assert.equal(first.cacheStatus, 'MISS');
    const second = await getOrPopulateKvSwrCache({
      kv,
      env: 'staging',
      namespace: 'market_pulse',
      key: 'tehran',
      freshTtlSeconds: 60,
      staleTtlSeconds: 180,
      nowMs: 1_010_000,
      loader: async () => {
        loaderCalls += 1;
        return { usdToman: 69000 };
      },
    });
    assert.equal(second.cacheStatus, 'HIT_FRESH');
    assert.equal(loaderCalls, 1);

    const db = createLocalD1DatabaseSimulator();
    await runD1MigrationsIdempotently(db);
    const r1 = await evaluateTieredWorkerRateLimit({
      tier: 'strong_durable',
      action: 'buyer_lead',
      subjectKey: 'ip_1.2.3.4',
      maxRequests: 2,
      windowSeconds: 3600,
      db,
      nowMs: 5_000_000,
    });
    const r2 = await evaluateTieredWorkerRateLimit({
      tier: 'strong_durable',
      action: 'buyer_lead',
      subjectKey: 'ip_1.2.3.4',
      maxRequests: 2,
      windowSeconds: 3600,
      db,
      nowMs: 5_001_000,
    });
    const r3 = await evaluateTieredWorkerRateLimit({
      tier: 'strong_durable',
      action: 'buyer_lead',
      subjectKey: 'ip_1.2.3.4',
      maxRequests: 2,
      windowSeconds: 3600,
      db,
      nowMs: 5_002_000,
    });
    assert.equal(r1.allowed, true);
    assert.equal(r2.allowed, true);
    assert.equal(r3.allowed, false);
    console.log('  ✅ 5. Cloudflare KV SWR caching, forbidden authoritative state guard, and tiered rate limiting verified');
  }

  // 6. Queue consumer (ack-after-commit, idempotency, DLQ) and UTC-to-Asia/Tehran cron conversion
  {
    const db = createLocalD1DatabaseSimulator();
    await runD1MigrationsIdempotently(db);
    const dlqMessages: unknown[] = [];
    const validMsg: RadarQueueEnvelope = {
      schemaVersion: '1.0',
      messageId: 'msg_001',
      idempotencyKey: 'idem_sync_2026_11_08',
      jobType: 'firestore_d1_projection_sync',
      createdAtIso: new Date().toISOString(),
      correlationId: 'corr_001',
      payload: { city: 'tehran' },
    };
    const makeQueueMsg = (id: string, body: unknown, attempts = 1): QueueMessage<unknown> & { acked: boolean; retried: boolean } => ({
      id,
      timestamp: new Date(),
      body,
      attempts,
      acked: false,
      retried: false,
      ack() {
        this.acked = true;
      },
      retry() {
        this.retried = true;
      },
    });
    const m1 = makeQueueMsg('m1', validMsg);
    const m2Duplicate = makeQueueMsg('m2', validMsg);
    const m3Poison = makeQueueMsg('m3', { invalid: true });
    const batch: MessageBatch<unknown> = {
      queue: 'radartehran-staging-queue',
      messages: [m1, m2Duplicate, m3Poison],
      ackAll() {},
      retryAll() {},
    };
    let executedJobs = 0;
    const qResult = await processRadarQueueBatch({
      batch,
      db,
      dlq: {
        async send(msg) {
          dlqMessages.push(msg);
        },
      },
      executeJob: async () => {
        executedJobs += 1;
      },
    });
    assert.equal(executedJobs, 1, 'Duplicate idempotency key must not re-execute job');
    assert.equal(qResult.deduplicatedCount, 1);
    assert.equal(qResult.deadLetteredCount, 1);
    assert.equal(dlqMessages.length, 1);
    assert.ok(computeQueueRetryDelaySeconds(2) > computeQueueRetryDelaySeconds(1));

    // UTC 00:30 -> 04:00 Asia/Tehran
    const utc0030 = Date.UTC(2026, 10, 8, 0, 30, 0);
    const tehranMorning = convertUtcScheduledTimeToTehranWallClock(utc0030);
    assert.equal(tehranMorning.tehranFormatted, '04:00 Asia/Tehran');
    assert.equal(tehranMorning.matchedScheduleTask, 'morning_market_and_d1_sync');

    // UTC 18:30 -> 22:00 Asia/Tehran
    const utc1830 = Date.UTC(2026, 10, 8, 18, 30, 0);
    const tehranNight = convertUtcScheduledTimeToTehranWallClock(utc1830);
    assert.equal(tehranNight.tehranFormatted, '22:00 Asia/Tehran');
    assert.equal(tehranNight.matchedScheduleTask, 'nightly_orphan_and_telemetry_flush');
    console.log('  ✅ 6. Cloudflare Queue consumer (idempotency, DLQ isolation) and UTC-to-Asia/Tehran cron triggers verified');
  }

  // 7. Strangler fallback safety & end-to-end Worker HTTP router + truthful telemetry
  {
    const loopReq = new Request('https://radartehran-staging.bijanbijane-1.workers.dev/api/market-pulse', {
      headers: { [WORKER_HOP_HEADER]: '1' },
    });
    const loopDecision = evaluateStranglerFallbackSafety({
      request: loopReq,
      env: { STRANGLER_FALLBACK_ENABLED: 'true', STRANGLER_ORIGIN_URL: 'https://origin.example.com' },
    });
    assert.equal(loopDecision.allowed, false);
    assert.equal(loopDecision.reasonCode, 'RECURSION_HOP_DETECTED');

    const unsafePostReq = new Request('https://radartehran-staging.bijanbijane-1.workers.dev/api/buyer-alerts', {
      method: 'POST',
    });
    const postDecision = evaluateStranglerFallbackSafety({
      request: unsafePostReq,
      env: { STRANGLER_FALLBACK_ENABLED: 'true', STRANGLER_ORIGIN_URL: 'https://origin.example.com' },
    });
    assert.equal(postDecision.allowed, false);
    assert.equal(postDecision.reasonCode, 'MUTATION_MISSING_IDEMPOTENCY_KEY');

    const sqliteDb = createRealSqliteD1Database();
    await runD1MigrationsIdempotently(sqliteDb);
    const env: WorkerEnv = {
      WORKER_ENV: 'staging',
      FIREBASE_PROJECT_ID: 'gen-lang-client-0713157837',
      ADMIN_EMAIL: 'radio837isf@gmail.com',
      DB: sqliteDb,
      MEDIA_BUCKET: createLocalR2BucketSimulator(),
      RADAR_KV: createLocalKvNamespaceSimulator(),
    };
    const execCtx: WorkerExecutionContext = {
      waitUntil() {},
      passThroughOnException() {},
    };
    const healthRes = await workerEntrypoint.fetch(
      new Request('https://radartehran-staging.bijanbijane-1.workers.dev/api/healthz'),
      env,
      execCtx,
    );
    assert.equal(healthRes.status, 200);
    const healthJson = (await healthRes.json()) as { ok: boolean; runtime: string; registeredRoutesCount: number };
    assert.equal(healthJson.ok, true);
    assert.equal(healthJson.runtime, 'cloudflare-workers');
    assert.equal(healthJson.registeredRoutesCount, 88);

    const valuationRequest = () => new Request(
      'https://radartehran-staging.bijanbijane-1.workers.dev/api/v1/valuation/verify-seal',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cityId: 'tehran', hoodId: 1, sqm: 90, buildYear: 1400 }),
      },
    );
    const missingSealSecret = await workerEntrypoint.fetch(valuationRequest(), env, execCtx);
    assert.equal(missingSealSecret.status, 503);
    const missingSealBody = await missingSealSecret.json() as { code?: string };
    assert.equal(missingSealBody.code, 'VALUATION_SEAL_SECRET_UNAVAILABLE');

    const configuredSeal = await workerEntrypoint.fetch(
      valuationRequest(),
      { ...env, VALUATION_SEAL_SECRET: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef' },
      execCtx,
    );
    assert.equal(configuredSeal.status, 200);
    const configuredSealBody = await configuredSeal.json() as { seal?: { sealSignature?: string } };
    assert.equal(configuredSealBody.seal?.sealSignature?.length, 64);

    // Verify D1-backed chunked upload lifecycle on Worker router
    const keyPair = await crypto.subtle.generateKey(
      {
        name: 'RSASSA-PKCS1-v1_5',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256',
      },
      true,
      ['sign', 'verify'],
    );
    registerTestJwkForEdgeAuth('test-kid-router', keyPair.publicKey);
    const nowSec = Math.floor(Date.now() / 1000);
    const adminJwt = await signTestFirebaseJwt(keyPair.privateKey, 'test-kid-router', {
      iss: 'https://securetoken.google.com/gen-lang-client-0713157837',
      aud: 'gen-lang-client-0713157837',
      sub: 'uid_admin_edge',
      email: 'radio837isf@gmail.com',
      email_verified: true,
      iat: nowSec - 30,
      exp: nowSec + 1800,
    });
    const validWebpBytes = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00,
      0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20,
      0x18, 0x00, 0x00, 0x00, 0x30, 0x01, 0x00, 0x9d,
    ]);
    const initRes = await workerEntrypoint.fetch(
      new Request('https://radartehran-staging.bijanbijane-1.workers.dev/api/object-storage/upload-init', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminJwt}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          mediaType: 'image',
          mimeType: 'image/webp',
          totalSizeBytes: validWebpBytes.byteLength,
          totalChunks: 1,
          city: 'tehran',
          hoodId: 1,
        }),
      }),
      env,
      execCtx,
    );
    assert.equal(initRes.status, 200);
    const initJson = (await initRes.json()) as { status: string; sessionId: string; durablePersistence: string };
    assert.equal(initJson.status, 'ok');
    assert.ok(initJson.sessionId.startsWith('upl_'));
    assert.equal(initJson.durablePersistence, 'd1_sqlite');

    const chunkRes = await workerEntrypoint.fetch(
      new Request('https://radartehran-staging.bijanbijane-1.workers.dev/api/object-storage/upload-chunk', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminJwt}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId: initJson.sessionId,
          chunkIndex: 0,
          base64Data: Buffer.from(validWebpBytes).toString('base64'),
        }),
      }),
      env,
      execCtx,
    );
    assert.equal(chunkRes.status, 200);

    const completeRes = await workerEntrypoint.fetch(
      new Request('https://radartehran-staging.bijanbijane-1.workers.dev/api/object-storage/upload-complete', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminJwt}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sessionId: initJson.sessionId }),
      }),
      env,
      execCtx,
    );
    assert.equal(completeRes.status, 200);
    const completeJson = (await completeRes.json()) as { status: string; mediaObject: { id: string } };
    assert.equal(completeJson.status, 'ok');

    // Verify Section 16 & 25 operationalVisibility admin diagnostics
    const diagRes = await workerEntrypoint.fetch(
      new Request('https://radartehran-staging.bijanbijane-1.workers.dev/api/admin/worker-diagnostics', {
        headers: { Authorization: `Bearer ${adminJwt}` },
      }),
      env,
      execCtx,
    );
    assert.equal(diagRes.status, 200);
    const diagJson = (await diagRes.json()) as {
      status: string;
      dependencyMatrix: DependencyCompatibilityEntry[];
      operationalVisibility: {
        workerHealth: string;
        d1Status: string;
        r2Status: string;
        migrationStatus: {
          ledgerTable: string;
          appliedCount: number;
          expectedCount: number;
          allCanonicalMigrationsApplied: boolean;
          migrations: Array<{ name: string; fileName: string; checksum_sha256: string }>;
        };
        safePerformanceMetrics: { cpuTimeMs: number | null };
        rollbackCommand: string;
      };
    };
    assert.equal(diagJson.status, 'ok');
    assert.ok(diagJson.dependencyMatrix.some((d) => d.officialStatus === 'NOT_SUPPORTED'));
    assert.ok(diagJson.dependencyMatrix.some((d) => d.officialStatus === 'WORKS_NATIVELY'));
    assert.equal(diagJson.operationalVisibility.workerHealth, 'healthy');
    assert.equal(diagJson.operationalVisibility.d1Status, 'bound');
    assert.equal(diagJson.operationalVisibility.r2Status, 'bound');
    assert.equal(diagJson.operationalVisibility.migrationStatus.ledgerTable, 'd1_migrations');
    assert.equal(diagJson.operationalVisibility.migrationStatus.appliedCount, 3);
    assert.equal(diagJson.operationalVisibility.migrationStatus.expectedCount, 3);
    assert.equal(diagJson.operationalVisibility.migrationStatus.allCanonicalMigrationsApplied, true);
    assert.equal(diagJson.operationalVisibility.migrationStatus.migrations[0].fileName, '0001_core_projections_and_watermarks.sql');
    assert.equal(diagJson.operationalVisibility.migrationStatus.migrations[1].fileName, '0002_upload_sessions_legal_holds_and_rate_limits.sql');
    assert.equal(diagJson.operationalVisibility.migrationStatus.migrations[2].fileName, '0003_media_objects_and_queue_execution_leases.sql');
    assert.equal(diagJson.operationalVisibility.safePerformanceMetrics.cpuTimeMs, null);

    // Verify 3-tier separated workflows & Section 7 D1 migration isolation security invariants
    const bootstrapYml = fs.readFileSync(path.join(process.cwd(), '.github/workflows/bootstrap-staging.yml'), 'utf-8');
    const migrateYml = fs.readFileSync(path.join(process.cwd(), '.github/workflows/migrate-staging-d1.yml'), 'utf-8');
    const deployYml = fs.readFileSync(path.join(process.cwd(), '.github/workflows/deploy-staging.yml'), 'utf-8');
    const provisionScript = fs.readFileSync(path.join(process.cwd(), 'scripts/cloudflare/provision-staging.mjs'), 'utf-8');
    const migrateScriptMod = await import('../scripts/cloudflare/migrate-staging-d1.mjs');

    // Bootstrap workflow checks
    assert.ok(bootstrapYml.includes('environment: staging-bootstrap'));
    assert.ok(bootstrapYml.includes('CF_BOOTSTRAP_API_TOKEN'));
    assert.ok(bootstrapYml.includes('vars.CLOUDFLARE_ACCOUNT_ID || secrets.CLOUDFLARE_ACCOUNT_ID'));
    assert.ok(bootstrapYml.includes('--mode=bootstrap'));
    assert.ok(!bootstrapYml.includes('pull_request'));
    assert.ok(!bootstrapYml.includes('--env production'));

    // Routine deployment workflow checks (Section 1 & Section 7)
    assert.ok(deployYml.includes('environment: staging-deploy'));
    assert.ok(deployYml.includes('CF_DEPLOY_API_TOKEN'));
    assert.ok(deployYml.includes('vars.CLOUDFLARE_ACCOUNT_ID || secrets.CLOUDFLARE_ACCOUNT_ID'));
    assert.ok(deployYml.includes('--mode=verify-only --require-remote --reject-placeholder-ids'));
    assert.ok(!deployYml.includes('CF_BOOTSTRAP_API_TOKEN'), 'Routine deploy must never reference CF_BOOTSTRAP_API_TOKEN');
    assert.ok(!deployYml.includes('CF_STAGING_MIGRATION_TOKEN'), 'Routine deploy must never reference CF_STAGING_MIGRATION_TOKEN');
    assert.ok(!deployYml.includes('d1 migrations apply'), 'Routine deploy must never apply D1 migrations');
    assert.ok(!deployYml.includes('d1 execute'), 'Routine deploy must never execute remote D1 SQL');
    assert.ok(!deployYml.includes('workflow_run'), 'Routine deploy must not chain via workflow_run');
    assert.ok(!deployYml.includes('pull_request'));
    assert.ok(!deployYml.includes('--env production'));

    // Dedicated D1 migration workflow checks (Section 2, 3, 4, 7)
    assert.ok(migrateYml.includes('workflow_dispatch:'), 'Migration workflow must be manually triggered');
    assert.ok(!migrateYml.includes('push:'), 'Migration workflow must not trigger on push');
    assert.ok(!migrateYml.includes('pull_request:'), 'Migration workflow must not trigger on pull_request');
    assert.ok(!migrateYml.includes('workflow_run:'), 'Migration workflow must not trigger on workflow_run');
    assert.ok(migrateYml.includes('environment: staging-migrations'), 'Migration workflow must use staging-migrations environment');
    assert.ok(migrateYml.includes('CF_STAGING_MIGRATION_TOKEN'), 'Migration workflow must use CF_STAGING_MIGRATION_TOKEN');
    assert.ok(!migrateYml.includes('CF_DEPLOY_API_TOKEN'), 'Migration workflow must not use routine deploy token');
    assert.ok(!migrateYml.includes('CF_BOOTSTRAP_API_TOKEN'), 'Migration workflow must not reuse bootstrap token');
    assert.ok(!migrateYml.includes('wrangler deploy'), 'Migration workflow must have zero Worker deployment capability');

    // Hard-coded target & validation checks in migrate-staging-d1.mjs (Section 3 & 7)
    assert.equal(migrateScriptMod.ALLOWED_STAGING_MIGRATION_TARGET.databaseName, 'radartehran-staging-db');
    assert.equal(migrateScriptMod.ALLOWED_STAGING_MIGRATION_TARGET.environment, 'staging');
    assert.equal(migrateScriptMod.ALLOWED_STAGING_MIGRATION_TARGET.migrationsDir, 'migrations/d1');
    assert.equal(migrateScriptMod.ALLOWED_STAGING_MIGRATION_TARGET.migrationsTable, 'd1_migrations');

    assert.throws(
      () => migrateScriptMod.assertNoArbitraryTargetFlags(['--database=radartehran-prod']),
      /ARBITRARY_MIGRATION_TARGET_FORBIDDEN/,
    );
    assert.throws(
      () => migrateScriptMod.assertNoArbitraryTargetFlags(['--dir=custom/sql']),
      /ARBITRARY_MIGRATION_TARGET_FORBIDDEN/,
    );

    const jsoncMod = await import('../scripts/cloudflare/jsoncUtils.mjs');
    const provisionMod = await import('../scripts/cloudflare/provision-staging.mjs');
    const baseWrangler = jsoncMod.parseJsonc(
      fs.readFileSync(path.join(process.cwd(), 'wrangler.jsonc'), 'utf-8'),
      'wrangler.jsonc',
    );
    assert.throws(
      () =>
        migrateScriptMod.validateStagingD1TargetAndMigrations({
          wranglerConfig: baseWrangler,
          allowPlaceholderForLocalDryCheck: false,
        }),
      /PLACEHOLDER_STAGING_D1_ID_REJECTED/,
    );

    const prodNameSpoof = structuredClone(baseWrangler);
    prodNameSpoof.env.staging.d1_databases[0].database_name = 'radartehran-prod-db';
    prodNameSpoof.env.staging.d1_databases[0].database_id = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
    assert.throws(
      () =>
        migrateScriptMod.validateStagingD1TargetAndMigrations({
          wranglerConfig: prodNameSpoof,
          allowPlaceholderForLocalDryCheck: false,
        }),
      /PRODUCTION_D1_TARGET_FORBIDDEN/,
    );

    const prodIdCollision = structuredClone(baseWrangler);
    prodIdCollision.env.staging.d1_databases[0].database_id = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
    prodIdCollision.env.production.d1_databases = [
      { database_name: 'radartehran-db', database_id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d' },
    ];
    assert.throws(
      () =>
        migrateScriptMod.validateStagingD1TargetAndMigrations({
          wranglerConfig: prodIdCollision,
          allowPlaceholderForLocalDryCheck: false,
        }),
      /PRODUCTION_D1_ID_FORBIDDEN/,
    );

    assert.ok(provisionScript.includes('PLACEHOLDER_STAGING_BINDING_ID_REJECTED'));
    assert.ok(provisionScript.includes('STAGING_BINDING_ID_DRIFT_DETECTED'));

    // Verify /api/health/readiness fails with 503 REQUIRED_D1_MIGRATION_PENDING when a migration is missing, without running runtime DDL
    const unmigratedDb = createRealSqliteD1Database();
    const unmigratedReadinessRes = await workerEntrypoint.fetch(
      new Request('https://radartehran-staging.bijanbijane-1.workers.dev/api/health/readiness'),
      { ...env, DB: unmigratedDb },
      execCtx,
    );
    assert.equal(unmigratedReadinessRes.status, 503);
    const unmigratedJson = (await unmigratedReadinessRes.json()) as {
      ok: boolean;
      code: string;
      migrationReadiness: { allCanonicalMigrationsApplied: boolean; pendingMigrations: string[] };
    };
    assert.equal(unmigratedJson.ok, false);
    assert.equal(unmigratedJson.code, 'REQUIRED_D1_MIGRATION_PENDING');
    assert.equal(unmigratedJson.migrationReadiness.allCanonicalMigrationsApplied, false);
    assert.equal(unmigratedJson.migrationReadiness.pendingMigrations.length, 3);

    const migratedReadinessRes = await workerEntrypoint.fetch(
      new Request('https://radartehran-staging.bijanbijane-1.workers.dev/api/health/readiness'),
      env,
      execCtx,
    );
    assert.equal(migratedReadinessRes.status, 200);
    const migratedJson = (await migratedReadinessRes.json()) as {
      ok: boolean;
      migrationReadiness: { allCanonicalMigrationsApplied: boolean; pendingMigrations: string[] };
    };
    assert.equal(migratedJson.ok, true);
    assert.equal(migratedJson.migrationReadiness.allCanonicalMigrationsApplied, true);
    assert.equal(migratedJson.migrationReadiness.pendingMigrations.length, 0);

    // Ensure no runtime DDL execution exists in worker runtime entrypoints
    for (const runtimeFile of ['worker/index.ts', 'worker/router.ts', 'worker/queues/queueAndCronProcessor.ts']) {
      const src = fs.readFileSync(path.join(process.cwd(), runtimeFile), 'utf-8');
      assert.ok(!src.includes('runD1MigrationsIdempotently'), `${runtimeFile} must never execute runtime DDL migrations`);
      assert.ok(!src.includes('CREATE TABLE'), `${runtimeFile} must never execute inline CREATE TABLE DDL`);
    }

    const notFoundApiRes = await workerEntrypoint.fetch(
      new Request('https://radartehran-staging.bijanbijane-1.workers.dev/api/non-existent-route'),
      env,
      execCtx,
    );
    assert.equal(notFoundApiRes.status, 404);
    assert.ok(notFoundApiRes.headers.get('content-type')?.includes('application/json'));
    const notFoundJson = (await notFoundApiRes.json()) as { code: string };
    assert.equal(notFoundJson.code, 'API_ENDPOINT_NOT_FOUND');

    const sample = recordTruthfulWorkerRequestTelemetry({
      correlationId: 'corr_test',
      environment: 'staging',
      method: 'GET',
      pathname: '/api/buyer-alerts?phone=09123456789&email=test@example.com',
      statusCode: 200,
      startedAtPerfMs: 10,
      finishedAtPerfMs: 14.5,
    });
    assert.equal(sample.wallTimeMs, 4.5);
    assert.equal(sample.cpuTimeMs, null);
    assert.ok(!sample.pathname.includes('09123456789'));
    assert.equal(scrubPiiFromTelemetryText('تماس: 09121112233'), 'تماس: [REDACTED_IR_PHONE]');

    const domainMetrics = computeRealEstateDomainEdgeMetrics({
      cityId: 'tehran',
      hoodId: 1,
      askingPerSqmMillion: 195,
      dealPerSqmMillion: 175,
      inquiryCohortCount: 3,
    });
    assert.equal(domainMetrics.kAnonymitySatisfied, false);
    assert.equal(domainMetrics.inquiryCohortCount, 0);
    console.log('  ✅ 7. Safe Strangler fallback, D1+R2 chunked upload routes, Section 25 diagnostics, and truthful telemetry verified');

    // 8. Staging Bootstrap Compatibility & Security Repair Regression Suite (16 Mandatory Scenarios)
    {
      // (8.1) JSONC parsing with comments (// and /* */) and https:// URLs
      const sampleJsoncWithComments = `{
        // Top-level comment with https://radartehran.ir//not-a-comment
        "name": "radartehran",
        "vars": {
          "APP_URL": "https://radartehran.ir/*still-inside-string*/path"
        },
        /* Multi-line block comment
           describing staging & production */
        "env": {
          "staging": {
            "name": "radartehran-staging",
            "vars": {
              "APP_ENV": "staging",
              "APP_URL": "https://staging.radartehran.example.com"
            }
            // Pre-bootstrap comment: bindings not yet populated
          },
          "production": {
            "name": "radartehran",
            "vars": {
              "APP_ENV": "production",
              "APP_URL": "https://radartehran.ir"
            },
          }
        }
      }`;
      const parsedSample = jsoncMod.parseJsonc(sampleJsoncWithComments, 'test.jsonc');
      assert.equal(parsedSample.vars.APP_URL, 'https://radartehran.ir/*still-inside-string*/path');
      assert.equal(parsedSample.env.staging.name, 'radartehran-staging');

      // (8.2) Initial bootstrap validation permits missing initial D1/KV bindings before provisioning
      const initialValidated = provisionMod.validateInitialBootstrapConfig({
        rawJsoncText: sampleJsoncWithComments,
      });
      assert.equal(initialValidated.env.staging.name, 'radartehran-staging');
      assert.equal(initialValidated.env.staging.d1_databases, undefined);

      // (8.3) Post-provisioning generation of complete Staging bindings & comment preservation
      const tmpDir = fs.mkdtempSync(path.join(process.cwd(), '.tmp-staging-bootstrap-test-'));
      try {
        const tmpWranglerPath = path.join(tmpDir, 'wrangler.jsonc');
        const tmpManifestPath = path.join(tmpDir, 'staging-resource-manifest.json');
        fs.writeFileSync(tmpWranglerPath, sampleJsoncWithComments, 'utf-8');

        const realD1Uuid = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
        const realKvHex = 'abcdef0123456789abcdef0123456789';
        const updatedParsed = provisionMod.updateStagingWranglerBindings({
          d1DatabaseId: realD1Uuid,
          kvNamespaceId: realKvHex,
          wranglerConfigPath: tmpWranglerPath,
        });

        const updatedText = fs.readFileSync(tmpWranglerPath, 'utf-8');
        assert.ok(updatedText.includes('// Top-level comment with https://radartehran.ir//not-a-comment'));
        assert.ok(updatedText.includes('// Pre-bootstrap comment: bindings not yet populated'));
        assert.equal(updatedParsed.env.staging.workers_dev, true);
        assert.equal(
          updatedParsed.env.staging.vars.APP_URL,
          'https://radartehran-staging.workers.dev',
          'Must replace fake staging.radartehran.example.com APP_URL with workers.dev URL',
        );
        assert.equal(updatedParsed.env.staging.d1_databases[0].binding, 'DB');
        assert.equal(updatedParsed.env.staging.d1_databases[0].database_name, 'radartehran-staging-db');
        assert.equal(updatedParsed.env.staging.d1_databases[0].database_id, realD1Uuid);
        assert.equal(updatedParsed.env.staging.r2_buckets[0].binding, 'MEDIA_BUCKET');
        assert.equal(updatedParsed.env.staging.r2_buckets[0].bucket_name, 'radartehran-staging-media');
        assert.equal(updatedParsed.env.staging.kv_namespaces[0].binding, 'RADAR_KV');
        assert.equal(updatedParsed.env.staging.kv_namespaces[0].id, realKvHex);
        assert.equal(updatedParsed.env.staging.queues.producers.length, 2);
        assert.equal(updatedParsed.env.staging.queues.consumers[0].queue, 'radartehran-staging-queue');
        assert.equal(updatedParsed.env.staging.queues.consumers[0].dead_letter_queue, 'radartehran-staging-dlq');

        // (8.4 & 8.5 & 8.6) Rejection of Production targets and unexpected resource names
        assert.throws(
          () => provisionMod.assertStagingScopedName('radartehran'),
          /SECURITY_GUARD_ABORT/,
        );
        assert.throws(
          () => provisionMod.assertStagingScopedName('radartehran-prod-db'),
          /SECURITY_GUARD_ABORT/,
        );
        assert.throws(
          () =>
            provisionMod.validateInitialBootstrapConfig({
              rawJsoncText: JSON.stringify({
                env: {
                  staging: {
                    name: 'radartehran-staging',
                    d1_databases: [{ binding: 'DB', database_name: 'radartehran-staging-wrong-db' }],
                  },
                  production: { name: 'radartehran' },
                },
              }),
            }),
          /UNEXPECTED_STAGING_D1_BINDING/,
        );

        // (8.7) Rejection of placeholder IDs in routine deployment
        const placeholderConfig = structuredClone(updatedParsed);
        placeholderConfig.env.staging.d1_databases[0].database_id = '00000000-0000-0000-0000-000000000001';
        assert.throws(
          () =>
            provisionMod.validateCompleteStagingWranglerConfig(placeholderConfig, {
              rejectPlaceholders: true,
            }),
          /PLACEHOLDER_STAGING_BINDING_ID_REJECTED/,
        );

        // (8.8) Failed list operations must abort instead of attempting creation blindly
        let createCalledOnFailedList = false;
        assert.throws(
          () =>
            provisionMod.provisionOrVerifyRemoteStagingResources({
              isVerifyOnly: false,
              runCommand: (args: string[]) => {
                if (args[0] === 'd1' && args[1] === 'list') {
                  return { status: 1, stdout: '', stderr: 'API error 500' };
                }
                if (args[1] === 'create' || args[2] === 'create') {
                  createCalledOnFailedList = true;
                }
                return { status: 0, stdout: '[]', stderr: '' };
              },
            }),
          /REMOTE_LIST_OPERATION_FAILED/,
        );
        assert.equal(createCalledOnFailedList, false, 'Must never call create when list fails');

        // (8.9 & 8.12) Partial provisioning failure records diagnostic manifest and succeeds cleanly on retry
        fs.writeFileSync(tmpWranglerPath, sampleJsoncWithComments, 'utf-8');
        const validAccountId = '11223344556677889900aabbccddeeff';
        const mockEnv = {
          CLOUDFLARE_API_TOKEN: 'cf_test_bootstrap_token_1234567890',
          CLOUDFLARE_ACCOUNT_ID: validAccountId,
        };
        let failKvCreateOnce = true;
        const createdStore = {
          d1: false,
          r2: false,
          kv: false,
          qMain: false,
          qDlq: false,
        };
        const mockRunner = (args: string[]) => {
          const cmd = args.join(' ');
          if (cmd === 'whoami') {
            return { status: 0, stdout: `Account ID: ${validAccountId}`, stderr: '' };
          }
          if (cmd === 'd1 list --json') {
            return {
              status: 0,
              stdout: createdStore.d1
                ? JSON.stringify([{ name: 'radartehran-staging-db', uuid: realD1Uuid }])
                : '[]',
              stderr: '',
            };
          }
          if (cmd === 'd1 create radartehran-staging-db') {
            createdStore.d1 = true;
            return { status: 0, stdout: `Created D1 ${realD1Uuid}`, stderr: '' };
          }
          if (cmd === 'r2 bucket list') {
            return {
              status: 0,
              stdout: createdStore.r2 ? 'name: radartehran-staging-media' : '',
              stderr: '',
            };
          }
          if (cmd === 'r2 bucket create radartehran-staging-media') {
            createdStore.r2 = true;
            return { status: 0, stdout: 'Created bucket', stderr: '' };
          }
          if (cmd === 'kv namespace list') {
            return {
              status: 0,
              stdout: createdStore.kv
                ? JSON.stringify([{ title: 'radartehran-staging-kv', id: realKvHex }])
                : '[]',
              stderr: '',
            };
          }
          if (cmd === 'kv namespace create radartehran-staging-kv') {
            if (failKvCreateOnce) {
              failKvCreateOnce = false;
              return { status: 1, stdout: '', stderr: 'Transient KV create failure' };
            }
            createdStore.kv = true;
            return { status: 0, stdout: `id = "${realKvHex}"`, stderr: '' };
          }
          if (cmd === 'queues list') {
            const list = [];
            if (createdStore.qMain) list.push('radartehran-staging-queue');
            if (createdStore.qDlq) list.push('radartehran-staging-dlq');
            return { status: 0, stdout: list.join('\n'), stderr: '' };
          }
          if (cmd === 'queues create radartehran-staging-queue') {
            createdStore.qMain = true;
            return { status: 0, stdout: 'Created queue', stderr: '' };
          }
          if (cmd === 'queues create radartehran-staging-dlq') {
            createdStore.qDlq = true;
            return { status: 0, stdout: 'Created dlq', stderr: '' };
          }
          if (args[0] === 'secret' && args[1] === 'put') {
            return { status: 0, stdout: 'Success', stderr: '' };
          }
          return { status: 1, stdout: '', stderr: `Unexpected command: ${cmd}` };
        };

        // First run fails on KV creation and writes partial manifest
        assert.throws(
          () =>
            provisionMod.executeStagingProvisioning({
              rawArgs: ['--mode=bootstrap', '--require-remote'],
              env: mockEnv,
              wranglerConfigPath: tmpWranglerPath,
              manifestOutputPath: tmpManifestPath,
              runCommand: mockRunner,
            }),
          /RESOURCE_CREATION_FAILED/,
        );
        const partialManifest = JSON.parse(fs.readFileSync(tmpManifestPath, 'utf-8'));
        assert.equal(partialManifest.status, 'FAILED_PARTIAL_OR_ABORTED');
        assert.equal(partialManifest.resources.length, 2);

        // Second run (retry) reuses D1 + R2 and creates KV + Queues cleanly
        const retryManifest = provisionMod.executeStagingProvisioning({
          rawArgs: ['--mode=bootstrap', '--require-remote', '--provision-internal-secrets'],
          env: mockEnv,
          wranglerConfigPath: tmpWranglerPath,
          manifestOutputPath: tmpManifestPath,
          runCommand: mockRunner,
        });
        assert.equal(retryManifest.resources.length, 5);
        assert.equal(retryManifest.resources[0].creationOrReuseStatus, 'REUSED');
        assert.equal(retryManifest.resources[1].creationOrReuseStatus, 'REUSED');
        assert.equal(retryManifest.resources[2].creationOrReuseStatus, 'CREATED');
        assert.equal(retryManifest.secretStatuses.length, 3);

        // (8.10) Failed secret uploads and Production secret reuse must fail closed
        assert.throws(
          () =>
            provisionMod.provisionInternalStagingSecrets({
              env: { ADMIN_API_SECRET: 'short_secret' },
              runCommand: () => ({ status: 0, stdout: '', stderr: '' }),
            }),
          /INVALID_STAGING_SECRET_LENGTH/,
        );
        assert.throws(
          () =>
            provisionMod.provisionInternalStagingSecrets({
              env: {
                ADMIN_API_SECRET: 'same_secret_value_1234567890123456',
                PROD_ADMIN_API_SECRET: 'same_secret_value_1234567890123456',
              },
              runCommand: () => ({ status: 0, stdout: '', stderr: '' }),
            }),
          /PRODUCTION_SECRET_REUSE_FORBIDDEN/,
        );
        assert.throws(
          () =>
            provisionMod.provisionInternalStagingSecrets({
              env: {},
              runCommand: () => ({ status: 1, stdout: '', stderr: 'Secret upload failed' }),
            }),
          /STAGING_SECRET_UPLOAD_FAILED/,
        );

        // (8.11) Wrong Cloudflare account ID fails closed
        assert.throws(
          () =>
            provisionMod.checkWranglerAuth({
              env: {
                CLOUDFLARE_API_TOKEN: 'token_123456789012',
                CLOUDFLARE_ACCOUNT_ID: 'ffffffffffffffffffffffffffffffff',
              },
              runCommand: () => ({
                status: 0,
                stdout: `Authenticated in account ${validAccountId}`,
                stderr: '',
              }),
            }),
          /CLOUDFLARE_ACCOUNT_ID_MISMATCH/,
        );

        // (8.15) Workflow shell interpolation and SHA-pinning security checks
        for (const wfFile of [
          '.github/workflows/bootstrap-staging.yml',
          '.github/workflows/deploy-staging.yml',
          '.github/workflows/migrate-staging-d1.yml',
        ]) {
          const wfText = fs.readFileSync(path.join(process.cwd(), wfFile), 'utf-8');
          assert.ok(
            !wfText.includes('if [ "${{ inputs.'),
            `${wfFile} must not interpolate inputs directly inside shell run script`,
          );
          assert.ok(
            !wfText.includes('--url "${{ steps.'),
            `${wfFile} must pass step outputs via env: instead of inline shell interpolation`,
          );
          assert.ok(
            wfText.includes('actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683'),
            `${wfFile} must pin actions/checkout to full commit SHA`,
          );
          assert.ok(
            wfText.includes('JOB_STATUS: ${{ job.status }}'),
            `${wfFile} summary step must inspect job.status so failed runs never imply success`,
          );
        }
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
      console.log('  ✅ 8. All 16 Staging Bootstrap Compatibility & Security Repair regression invariants verified (zero remote Cloudflare calls)');
    }
  }

  console.log('🎉 All Cloudflare Worker Platform & Architecture Verification checks passed!');
}

runSuite().catch((err) => {
  console.error('❌ Cloudflare Worker verification suite failed:', err);
  process.exit(1);
});
