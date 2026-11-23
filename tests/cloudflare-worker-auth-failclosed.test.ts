/**
 * @file tests/cloudflare-worker-auth-failclosed.test.ts
 * @description Package 1 E2E verification for fail-closed D1 Auth Revocation, cryptographic
 * Firebase App Check verification (RS256 JWKS, modes, JWKS outage), and Express checkRevoked=true
 * fail-closed enforcement (no silent fallback to verifyIdToken(..., false)).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, it } from 'node:test';
import {
  resolveWorkerAppCheckMode,
  verifyWorkerAppCheck,
} from '../worker/auth/appCheckVerifier';
import { resetJwksCacheForTests } from '../worker/auth/jwksClient';
import { resolveWorkerAuthContext } from '../worker/auth/authorizationPolicy';
import {
  clearTestJwksForEdgeAuth,
  isTokenRevokedOrUserDisabled,
  recordUserRevocationInD1,
  registerTestJwkForEdgeAuth,
  verifyFirebaseIdTokenOnEdge,
} from '../worker/auth/firebaseEdgeAuth';
import {
  D1_MIGRATIONS,
  runD1MigrationsIdempotently,
} from '../worker/db/d1SchemaAndMigrations';
import type { D1Database, D1PreparedStatement, WorkerEnv } from '../worker/types';

function b64url(input: Uint8Array | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : Buffer.from(input);
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function createRsaPair() {
  return crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  );
}

async function signJwt(privateKey: CryptoKey, kid: string, payload: Record<string, unknown>) {
  const h = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid }));
  const p = b64url(JSON.stringify(payload));
  const sig = new Uint8Array(
    await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, new TextEncoder().encode(`${h}.${p}`)),
  );
  return `${h}.${p}.${b64url(sig)}`;
}

async function createMigratedRealSqliteD1(): Promise<D1Database> {
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
  const db: D1Database = {
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
  };
  const sqlDir = path.resolve(process.cwd(), 'migrations/d1');
  for (const mig of D1_MIGRATIONS) {
    sqlite.exec(fs.readFileSync(path.join(sqlDir, mig.fileName), 'utf8'));
  }
  await runD1MigrationsIdempotently(db);
  return db;
}

afterEach(() => {
  clearTestJwksForEdgeAuth();
  resetJwksCacheForTests();
});

describe('Package 1 E2E: Fail-Closed Auth Revocation & Cryptographic App Check', () => {
  it('1. fails closed (503) when D1 is missing or throws during revocation check', async () => {
    const missing = await isTokenRevokedOrUserDisabled('u1', 1000, undefined);
    assert.equal(missing.unavailable, true);

    const throwingDb = {
      prepare() {
        return {
          bind() {
            return {
              async first() {
                throw new Error('D1_NETWORK_ERROR');
              },
            };
          },
        };
      },
    } as unknown as D1Database;

    const errored = await isTokenRevokedOrUserDisabled('u1', 1000, throwingDb);
    assert.equal(errored.unavailable, true);

    const kp = await createRsaPair();
    registerTestJwkForEdgeAuth('kid-failclosed', kp.publicKey);
    const now = Math.floor(Date.now() / 1000);
    const jwt = await signJwt(kp.privateKey, 'kid-failclosed', {
      iss: 'https://securetoken.google.com/radartehran-test',
      aud: 'radartehran-test',
      sub: 'u1',
      user_id: 'u1',
      email: 'u1@example.com',
      email_verified: true,
      iat: now - 10,
      auth_time: now - 10,
      exp: now + 3600,
    });

    const authRes = await verifyFirebaseIdTokenOnEdge({
      authorizationHeader: `Bearer ${jwt}`,
      env: { ENVIRONMENT: 'staging', FIREBASE_PROJECT_ID: 'radartehran-test', FIREBASE_APP_CHECK_MODE: 'disabled', DB: throwingDb },
    });
    assert.equal(authRes.authenticated, false);
    assert.equal(authRes.statusCode, 503);
  });

  it('2. records canonical D1 revocations (REVOKE_BEFORE, DISABLE_USER, REENABLE_USER) with idempotent audit log', async () => {
    const db = await createMigratedRealSqliteD1();
    const kp = await createRsaPair();
    registerTestJwkForEdgeAuth('kid-rev', kp.publicKey);
    const now = Math.floor(Date.now() / 1000);

    const oldJwt = await signJwt(kp.privateKey, 'kid-rev', {
      iss: 'https://securetoken.google.com/radartehran-test',
      aud: 'radartehran-test',
      sub: 'user-rev-1',
      user_id: 'user-rev-1',
      email: 'rev@example.com',
      email_verified: true,
      iat: now - 120,
      auth_time: now - 120,
      exp: now + 3600,
    });
    const freshJwt = await signJwt(kp.privateKey, 'kid-rev', {
      iss: 'https://securetoken.google.com/radartehran-test',
      aud: 'radartehran-test',
      sub: 'user-rev-1',
      user_id: 'user-rev-1',
      email: 'rev@example.com',
      email_verified: true,
      iat: now + 10,
      auth_time: now + 10,
      exp: now + 3600,
    });

    const env: WorkerEnv = {
      ENVIRONMENT: 'staging',
      FIREBASE_PROJECT_ID: 'radartehran-test',
      FIREBASE_APP_CHECK_MODE: 'disabled',
      DB: db,
    };

    // Initially valid
    const before = await verifyFirebaseIdTokenOnEdge({ authorizationHeader: `Bearer ${oldJwt}`, env });
    assert.equal(before.authenticated, true);

    // REVOKE_BEFORE now -> oldJwt rejected 401, freshJwt accepted 200
    const r1 = await recordUserRevocationInD1({
      db,
      uid: 'user-rev-1',
      action: 'REVOKE_BEFORE',
      validSinceSeconds: now,
      actorUid: 'admin-1',
      reason: 'PASSWORD_RESET',
      idempotencyKey: 'rev-key-1',
    });
    assert.equal(r1.applied, true);
    assert.equal(r1.idempotentReplay, false);

    // Idempotent replay does not duplicate audit event
    const r1Replay = await recordUserRevocationInD1({
      db,
      uid: 'user-rev-1',
      action: 'REVOKE_BEFORE',
      validSinceSeconds: now,
      actorUid: 'admin-1',
      reason: 'PASSWORD_RESET',
      idempotencyKey: 'rev-key-1',
    });
    assert.equal(r1Replay.idempotentReplay, true);

    const oldAfterRevoke = await verifyFirebaseIdTokenOnEdge({ authorizationHeader: `Bearer ${oldJwt}`, env });
    assert.equal(oldAfterRevoke.authenticated, false);
    assert.equal(oldAfterRevoke.statusCode, 401);

    const freshAfterRevoke = await verifyFirebaseIdTokenOnEdge({ authorizationHeader: `Bearer ${freshJwt}`, env });
    assert.equal(freshAfterRevoke.authenticated, true);

    // DISABLE_USER -> even freshJwt rejected 403
    await recordUserRevocationInD1({
      db,
      uid: 'user-rev-1',
      action: 'DISABLE_USER',
      actorUid: 'admin-1',
      reason: 'ACCOUNT_SUSPENDED',
      idempotencyKey: 'rev-key-2',
    });
    const disabledRes = await verifyFirebaseIdTokenOnEdge({ authorizationHeader: `Bearer ${freshJwt}`, env });
    assert.equal(disabledRes.authenticated, false);
    assert.equal(disabledRes.statusCode, 401);

    // REENABLE_USER -> freshJwt accepted again
    await recordUserRevocationInD1({
      db,
      uid: 'user-rev-1',
      action: 'REENABLE_USER',
      actorUid: 'admin-1',
      reason: 'APPEAL_GRANTED',
      idempotencyKey: 'rev-key-3',
    });
    const reenabledRes = await verifyFirebaseIdTokenOnEdge({ authorizationHeader: `Bearer ${freshJwt}`, env });
    assert.equal(reenabledRes.authenticated, true);

    // Audit rows persisted in auth_revocation_events
    const auditRows = await db
      .prepare('SELECT * FROM auth_revocation_events WHERE uid = ?1')
      .bind('user-rev-1')
      .all();
    assert.equal(auditRows.results.length, 3);
  });

  it('3. never permits monitor/disabled App Check mode on production-sensitive routes', () => {
    assert.equal(
      resolveWorkerAppCheckMode(
        { WORKER_ENV: 'production', FIREBASE_APP_CHECK_MODE: 'disabled' },
        { sensitiveRoute: true },
      ),
      'enforced',
    );
    assert.equal(
      resolveWorkerAppCheckMode(
        { WORKER_ENV: 'production', FIREBASE_APP_CHECK_MODE: 'monitor' },
        { sensitiveRoute: true },
      ),
      'enforced',
    );
    assert.equal(
      resolveWorkerAppCheckMode(
        { WORKER_ENV: 'production', FIREBASE_APP_CHECK_MODE: 'disabled' },
        { sensitiveRoute: false },
      ),
      'monitor',
    );
    assert.equal(
      resolveWorkerAppCheckMode(
        { WORKER_ENV: 'staging', FIREBASE_APP_CHECK_MODE: 'disabled' },
      ),
      'disabled',
    );
  });

  it('3. verifies cryptographic App Check (RS256 valid, forged, wrong app_id, expired, JWKS outage 503, debug blocked in prod, monitor mode)', async () => {
    const kp = await createRsaPair();
    const attackerKp = await createRsaPair();
    const exportedJwk = await crypto.subtle.exportKey('jwk', kp.publicKey);
    const jwksFetch: typeof fetch = async () =>
      new Response(JSON.stringify({ keys: [{ ...exportedJwk, kid: 'ac-kid-1', alg: 'RS256', use: 'sig' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    const outageFetch: typeof fetch = async () => new Response('down', { status: 503 });
    const now = Math.floor(Date.now() / 1000);
    const baseOpts = {
      mode: 'enforced' as const,
      isProduction: true,
      expectedProjectId: 'radartehran-prod',
      expectedProjectNumber: '123456789012',
      expectedAppId: '1:123456789012:web:abcdef',
      fetchFn: jwksFetch,
      nowSeconds: now,
    };

    const missingVerifierConfig = await verifyWorkerAppCheck(
      new Request('https://radartehran.ir/api/object-storage/upload', {
        headers: { 'X-Firebase-AppCheck': 'syntactically-valid-placeholder-token' },
      }),
      { ...baseOpts, expectedProjectNumber: undefined },
    );
    assert.equal(missingVerifierConfig.allowed, false);
    assert.equal(missingVerifierConfig.statusCode, 503);
    assert.equal(missingVerifierConfig.reason, 'APP_CHECK_VERIFIER_CONFIGURATION_MISSING');

    const validToken = await signJwt(kp.privateKey, 'ac-kid-1', {
      iss: 'https://firebaseappcheck.googleapis.com/123456789012',
      aud: ['projects/123456789012', 'projects/radartehran-prod'],
      sub: '1:123456789012:web:abcdef',
      app_id: '1:123456789012:web:abcdef',
      iat: now - 5,
      exp: now + 1800,
    });
    const okRes = await verifyWorkerAppCheck(
      new Request('https://radartehran.ir/api/object-storage/upload', { headers: { 'X-Firebase-AppCheck': validToken } }),
      baseOpts,
    );
    assert.equal(okRes.allowed, true);
    assert.equal(okRes.statusCode, 200);

    // A valid signature and matching app ID must still be rejected for another project's audience.
    const wrongProject = await signJwt(kp.privateKey, 'ac-kid-1', {
      iss: 'https://firebaseappcheck.googleapis.com/123456789012',
      aud: ['projects/987654321000', 'projects/another-project'],
      sub: '1:123456789012:web:abcdef',
      iat: now - 5,
      exp: now + 1800,
    });
    const wrongProjectRes = await verifyWorkerAppCheck(
      new Request('https://radartehran.ir/api/object-storage/upload', { headers: { 'X-Firebase-AppCheck': wrongProject } }),
      baseOpts,
    );
    assert.equal(wrongProjectRes.allowed, false);
    assert.equal(wrongProjectRes.reason, 'APP_CHECK_PROJECT_MISMATCH');

    // A valid signature and audience must still be rejected when the issuer belongs to another project.
    const wrongIssuer = await signJwt(kp.privateKey, 'ac-kid-1', {
      iss: 'https://firebaseappcheck.googleapis.com/987654321000',
      aud: ['projects/123456789012', 'projects/radartehran-prod'],
      sub: '1:123456789012:web:abcdef',
      iat: now - 5,
      exp: now + 1800,
    });
    const wrongIssuerRes = await verifyWorkerAppCheck(
      new Request('https://radartehran.ir/api/object-storage/upload', { headers: { 'X-Firebase-AppCheck': wrongIssuer } }),
      baseOpts,
    );
    assert.equal(wrongIssuerRes.allowed, false);
    assert.equal(wrongIssuerRes.reason, 'APP_CHECK_ISSUER_MISMATCH');

    // Missing issuer is never accepted.
    const missingIssuer = await signJwt(kp.privateKey, 'ac-kid-1', {
      aud: ['projects/123456789012', 'projects/radartehran-prod'],
      sub: '1:123456789012:web:abcdef',
      iat: now - 5,
      exp: now + 1800,
    });
    const missingIssuerRes = await verifyWorkerAppCheck(
      new Request('https://radartehran.ir/api/object-storage/upload', { headers: { 'X-Firebase-AppCheck': missingIssuer } }),
      baseOpts,
    );
    assert.equal(missingIssuerRes.allowed, false);
    assert.equal(missingIssuerRes.reason, 'APP_CHECK_ISSUER_MISMATCH');

    // Missing issued-at is invalid even when the signature and other claims are valid.
    const missingIat = await signJwt(kp.privateKey, 'ac-kid-1', {
      iss: 'https://firebaseappcheck.googleapis.com/123456789012',
      aud: ['projects/123456789012', 'projects/radartehran-prod'],
      sub: '1:123456789012:web:abcdef',
      exp: now + 1800,
    });
    const missingIatRes = await verifyWorkerAppCheck(
      new Request('https://radartehran.ir/api/object-storage/upload', { headers: { 'X-Firebase-AppCheck': missingIat } }),
      baseOpts,
    );
    assert.equal(missingIatRes.allowed, false);
    assert.equal(missingIatRes.reason, 'APP_CHECK_ISSUED_AT_INVALID');

    // Forged signature signed by attacker key -> rejected
    const forgedToken = await signJwt(attackerKp.privateKey, 'ac-kid-1', {
      iss: 'https://firebaseappcheck.googleapis.com/123456789012',
      aud: ['projects/123456789012', 'projects/radartehran-prod'],
      sub: '1:123456789012:web:abcdef',
      iat: now - 5,
      exp: now + 1800,
    });
    const forgedRes = await verifyWorkerAppCheck(
      new Request('https://radartehran.ir/api/object-storage/upload', { headers: { 'X-Firebase-AppCheck': forgedToken } }),
      baseOpts,
    );
    assert.equal(forgedRes.allowed, false);
    assert.equal(forgedRes.statusCode, 401);

    // Wrong app_id -> rejected
    const wrongApp = await signJwt(kp.privateKey, 'ac-kid-1', {
      iss: 'https://firebaseappcheck.googleapis.com/123456789012',
      aud: ['projects/123456789012', 'projects/radartehran-prod'],
      sub: '1:123456789012:web:EVILAPP',
      iat: now - 5,
      exp: now + 1800,
    });
    const wrongAppRes = await verifyWorkerAppCheck(
      new Request('https://radartehran.ir/api/object-storage/upload', { headers: { 'X-Firebase-AppCheck': wrongApp } }),
      baseOpts,
    );
    assert.equal(wrongAppRes.allowed, false);

    // Expired token -> rejected
    const expired = await signJwt(kp.privateKey, 'ac-kid-1', {
      iss: 'https://firebaseappcheck.googleapis.com/123456789012',
      aud: ['projects/123456789012', 'projects/radartehran-prod'],
      sub: '1:123456789012:web:abcdef',
      iat: now - 4000,
      exp: now - 200,
    });
    const expRes = await verifyWorkerAppCheck(
      new Request('https://radartehran.ir/api/object-storage/upload', { headers: { 'X-Firebase-AppCheck': expired } }),
      baseOpts,
    );
    assert.equal(expRes.allowed, false);

    // JWKS outage fails closed with 503 in enforced mode
    const outageToken = await signJwt(kp.privateKey, 'ac-kid-uncached', {
      iss: 'https://firebaseappcheck.googleapis.com/123456789012',
      aud: ['projects/123456789012', 'projects/radartehran-prod'],
      sub: '1:123456789012:web:abcdef',
      iat: now - 5,
      exp: now + 1800,
    });
    // Isolate the dependency-outage case from the prior successful JWKS cache and refresh throttle.
    resetJwksCacheForTests();
    const outageRes = await verifyWorkerAppCheck(
      new Request('https://radartehran.ir/api/object-storage/upload', { headers: { 'X-Firebase-AppCheck': outageToken } }),
      { ...baseOpts, fetchFn: outageFetch },
    );
    assert.equal(outageRes.allowed, false);
    assert.equal(outageRes.statusCode, 503);

    // Debug header blocked in production
    const debugInProd = await verifyWorkerAppCheck(
      new Request('https://radartehran.ir/api/object-storage/upload', { headers: { 'X-Firebase-AppCheck-Debug': 'debug-secret-token' } }),
      baseOpts,
    );
    assert.equal(debugInProd.allowed, false);
    assert.equal(debugInProd.statusCode, 403);

    // Monitor mode allows missing token with statusCode=200
    const monitorRes = await verifyWorkerAppCheck(
      new Request('https://radartehran.ir/api/object-storage/upload'),
      { ...baseOpts, mode: 'monitor', isProduction: false },
    );
    assert.equal(monitorRes.allowed, true);
    assert.equal(monitorRes.statusCode, 200);
  });

  it('4. requires App Check for Firebase-authenticated account lifecycle requests while preserving service-secret auth', async () => {
    const kp = await createRsaPair();
    const now = Math.floor(Date.now() / 1000);
    const idToken = await signJwt(kp.privateKey, 'lifecycle-id-kid', {
      iss: 'https://securetoken.google.com/radartehran-prod',
      aud: 'radartehran-prod',
      sub: 'lifecycle-user-1',
      user_id: 'lifecycle-user-1',
      email: 'lifecycle-user@example.com',
      email_verified: true,
      iat: now - 10,
      auth_time: now - 10,
      exp: now + 3600,
    });
    const env: WorkerEnv = {
      WORKER_ENV: 'production',
      FIREBASE_PROJECT_ID: 'radartehran-prod',
      FIREBASE_PROJECT_NUMBER: '123456789012',
      FIREBASE_APP_CHECK_APP_ID: '1:123456789012:web:abcdef',
      FIREBASE_APP_CHECK_MODE: 'enforced',
    };
    const userRequest = new Request('https://radartehran.ir/api/v1/account/lifecycle/privacy', {
      headers: { Authorization: `Bearer ${idToken}` },
    });
    const userAuth = await resolveWorkerAuthContext(userRequest, {
      expectedProjectId: 'radartehran-prod',
      env,
      requireAppCheck: true,
      tokenVerifyOptions: {
        nowSeconds: now,
        customKeyResolver: async (kid) => kid === 'lifecycle-id-kid' ? kp.publicKey : null,
      },
    });
    assert.equal(userAuth.authenticated, false);
    assert.equal(userAuth.failureStatusCode, 401);
    assert.equal(userAuth.failureCode, 'MISSING_APP_CHECK_TOKEN');

    const serviceRequest = new Request('https://radartehran.ir/api/v1/account/lifecycle/internal', {
      headers: { 'X-Admin-Token': 'service-secret-value' },
    });
    const serviceAuth = await resolveWorkerAuthContext(serviceRequest, {
      adminApiSecret: 'service-secret-value',
      env,
      requireAppCheck: true,
    });
    assert.equal(serviceAuth.authenticated, true);
    assert.equal(serviceAuth.mode, 'server_secret_token');
  });

  it('4. verifies Express auth module has zero fallback to verifyIdToken(..., false)', () => {
    const expressAuthSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'src/utils/serverAdminAndTelegramSecurity.ts'),
      'utf8',
    );
    assert.equal(/verifyIdToken\([^,]+,\s*false\)/.test(expressAuthSrc), false);
    assert.ok(expressAuthSrc.includes('verifyIdToken(idToken, true)'));
    assert.ok(expressAuthSrc.includes('FIREBASE_AUTH_DEPENDENCY_UNAVAILABLE'));
  });
});
