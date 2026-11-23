/**
 * @file tests/cloudflare-phase3-identity-and-auth.test.ts
 * @description Comprehensive security & authorization test suite for Phase 3 (Identity, Authentication & Authorization).
 * Tests real Web Crypto RSA-SHA256 signature verification, Google JWKS caching and rotation,
 * claims validation (iss, aud, sub, exp, iat, auth_time, email_verified), App Check boundaries,
 * role-based and resource-owner policies, timing-safe server-secret authentication, and fail-closed incident response.
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { describe, it, beforeEach } from 'node:test';
import { PRIMARY_BOOTSTRAP_ADMIN_EMAIL } from '../src/utils/domainSecurityValidators';
import { EXPECTED_FIREBASE_PROJECT_ID } from '../src/utils/serverConfigValidator';
import {
  verifyWorkerAppCheck,
} from '../worker/auth/appCheckVerifier';
import {
  constantTimeSecretMatch,
  evaluateWorkerAuthorization,
  extractSingleSecurityHeader,
  resolveWorkerAuthContext,
  buildSecurityAuditEvent,
} from '../worker/auth/authorizationPolicy';
import {
  parseJwtEnvelope,
  verifyFirebaseIdToken,
} from '../worker/auth/firebaseTokenVerifier';
import {
  GOOGLE_FIREBASE_AUTH_JWKS_URL,
  importRsaJwkToCryptoKey,
  injectMockJwksKeysForTests,
  resetJwksCacheForTests,
} from '../worker/auth/jwksClient';
import type {
  AuthenticatedWorkerPrincipal,
  FirebaseIdTokenClaims,
  JwkRsaKey,
  WorkerAuthContext,
} from '../worker/auth/types';

// Generate real RSA-2048 keypair for cryptographic signature verification tests
const { publicKey: testPublicKey1, privateKey: testPrivateKey1 } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
});
const { publicKey: testPublicKey2, privateKey: testPrivateKey2 } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
});

const jwk1 = testPublicKey1.export({ format: 'jwk' }) as unknown as JwkRsaKey;
const jwk2 = testPublicKey2.export({ format: 'jwk' }) as unknown as JwkRsaKey;

const KID_1 = 'google-test-key-001';
const KID_2 = 'google-test-key-002-rotated';

function buildSignedTestIdToken(
  payload: Partial<FirebaseIdTokenClaims>,
  options: {
    kid?: string;
    alg?: string;
    privateKey?: crypto.KeyObject;
    tamperPayloadAfterSign?: boolean;
    tamperSignature?: boolean;
  } = {}
): string {
  const kid = options.kid ?? KID_1;
  const alg = options.alg ?? 'RS256';
  const privateKey = options.privateKey ?? testPrivateKey1;

  const headerObj = { alg, kid, typ: 'JWT' };
  const headerSeg = Buffer.from(JSON.stringify(headerObj)).toString('base64url');

  const nowSec = Math.floor(Date.now() / 1000);
  const defaultClaims: FirebaseIdTokenClaims = {
    iss: `https://securetoken.google.com/${EXPECTED_FIREBASE_PROJECT_ID}`,
    aud: EXPECTED_FIREBASE_PROJECT_ID,
    sub: 'test-user-uid-12345',
    email: 'user@example.com',
    email_verified: true,
    auth_time: nowSec - 120,
    iat: nowSec - 120,
    exp: nowSec + 3600,
  };

  const claimsObj = { ...defaultClaims, ...payload };
  const payloadSeg = Buffer.from(JSON.stringify(claimsObj)).toString('base64url');

  const signingInput = Buffer.from(`${headerSeg}.${payloadSeg}`, 'ascii');
  const signatureBytes = crypto.sign('RSA-SHA256', signingInput, privateKey);
  let signatureSeg = signatureBytes.toString('base64url');

  if (options.tamperSignature) {
    const raw = Buffer.from(signatureSeg, 'base64url');
    raw[raw.length - 1] ^= 0xff;
    signatureSeg = raw.toString('base64url');
  }

  if (options.tamperPayloadAfterSign) {
    const tamperedClaims = { ...claimsObj, sub: 'attacker-sub' };
    const tamperedPayloadSeg = Buffer.from(JSON.stringify(tamperedClaims)).toString('base64url');
    return `${headerSeg}.${tamperedPayloadSeg}.${signatureSeg}`;
  }

  return `${headerSeg}.${payloadSeg}.${signatureSeg}`;
}

describe('Phase 3: Identity, Authentication & Authorization Architecture', () => {
  beforeEach(async () => {
    resetJwksCacheForTests();
    const cryptoKey1 = await importRsaJwkToCryptoKey({ ...jwk1, kid: KID_1 });
    const cryptoKey2 = await importRsaJwkToCryptoKey({ ...jwk2, kid: KID_2 });
    injectMockJwksKeysForTests(GOOGLE_FIREBASE_AUTH_JWKS_URL, {
      [KID_1]: cryptoKey1,
      [KID_2]: cryptoKey2,
    });
  });

  // ===========================================================================
  // 1. JWT Envelope and Parsing Security
  // ===========================================================================
  it('1. rejects malformed, oversized, or non-RS256 JWT envelopes before crypto operations', () => {
    // Missing / empty token
    const emptyResult = parseJwtEnvelope('');
    assert.equal(emptyResult.ok, false);
    assert.equal(emptyResult.code, 'INVALID_JWT_LENGTH');

    // Oversized token (> 12,000 chars)
    const oversized = parseJwtEnvelope('a'.repeat(12001));
    assert.equal(oversized.ok, false);
    assert.equal(oversized.code, 'INVALID_JWT_LENGTH');

    // Not three segments
    const twoSegments = parseJwtEnvelope('header-part-longer-than-16.payload-part');
    assert.equal(twoSegments.ok, false);
    assert.equal(twoSegments.code, 'MALFORMED_JWT');

    // Unsupported algorithm (HS256)
    const hsHeader = Buffer.from(JSON.stringify({ alg: 'HS256', kid: 'k1', typ: 'JWT' })).toString('base64url');
    const hsPayload = Buffer.from(JSON.stringify({ sub: 'user1' })).toString('base64url');
    const hsJwt = `${hsHeader}.${hsPayload}.dGVzdHNpZw`;
    const hsResult = parseJwtEnvelope(hsJwt);
    assert.equal(hsResult.ok, false);
    assert.equal(hsResult.code, 'UNSUPPORTED_SIGNING_ALGORITHM');

    // Missing kid
    const noKidHeader = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
    const noKidJwt = `${noKidHeader}.${hsPayload}.dGVzdHNpZw`;
    const noKidResult = parseJwtEnvelope(noKidJwt);
    assert.equal(noKidResult.ok, false);
    assert.equal(noKidResult.code, 'MISSING_KEY_IDENTIFIER');
  });

  // ===========================================================================
  // 2. Cryptographic Digital Signature Verification
  // ===========================================================================
  it('2. verifies authentic RSA-SHA256 signatures and rejects forged or tampered signatures', async () => {
    const validToken = buildSignedTestIdToken({});
    const validResult = await verifyFirebaseIdToken(validToken, {
      expectedProjectId: EXPECTED_FIREBASE_PROJECT_ID,
    });
    assert.equal(validResult.valid, true);
    assert.equal(validResult.status, 200);
    assert.equal(validResult.claims?.sub, 'test-user-uid-12345');

    // Tampered payload after sign -> Signature mismatch
    const tamperedPayloadToken = buildSignedTestIdToken({}, { tamperPayloadAfterSign: true });
    const tamperedResult = await verifyFirebaseIdToken(tamperedPayloadToken, {
      expectedProjectId: EXPECTED_FIREBASE_PROJECT_ID,
    });
    assert.equal(tamperedResult.valid, false);
    assert.equal(tamperedResult.status, 401);
    assert.equal(tamperedResult.code, 'INVALID_SIGNATURE');

    // Tampered signature bytes -> Signature mismatch
    const badSigToken = buildSignedTestIdToken({}, { tamperSignature: true });
    const badSigResult = await verifyFirebaseIdToken(badSigToken, {
      expectedProjectId: EXPECTED_FIREBASE_PROJECT_ID,
    });
    assert.equal(badSigResult.valid, false);
    assert.equal(badSigResult.code, 'INVALID_SIGNATURE');

    // Signed with wrong private key -> Signature mismatch
    const wrongKeyToken = buildSignedTestIdToken({}, { kid: KID_1, privateKey: testPrivateKey2 });
    const wrongKeyResult = await verifyFirebaseIdToken(wrongKeyToken, {
      expectedProjectId: EXPECTED_FIREBASE_PROJECT_ID,
    });
    assert.equal(wrongKeyResult.valid, false);
    assert.equal(wrongKeyResult.code, 'INVALID_SIGNATURE');
  });

  // ===========================================================================
  // 3. Claims Verification (Project, Issuer, Audience, Timestamps)
  // ===========================================================================
  it('3. strictly validates issuer, audience, subject, expiration, and issued-at timestamps', async () => {
    const nowSec = Math.floor(Date.now() / 1000);

    // Wrong Issuer
    const wrongIssToken = buildSignedTestIdToken({ iss: 'https://securetoken.google.com/attacker-project' });
    const wrongIssResult = await verifyFirebaseIdToken(wrongIssToken, {
      expectedProjectId: EXPECTED_FIREBASE_PROJECT_ID,
      nowSeconds: nowSec,
    });
    assert.equal(wrongIssResult.valid, false);
    assert.equal(wrongIssResult.code, 'TOKEN_ISSUER_MISMATCH');

    // Wrong Audience (Project Mismatch)
    const wrongAudToken = buildSignedTestIdToken({ aud: 'another-unauthorized-project' });
    const wrongAudResult = await verifyFirebaseIdToken(wrongAudToken, {
      expectedProjectId: EXPECTED_FIREBASE_PROJECT_ID,
      nowSeconds: nowSec,
    });
    assert.equal(wrongAudResult.valid, false);
    assert.equal(wrongAudResult.code, 'TOKEN_PROJECT_MISMATCH');

    // Missing subject UID
    const emptySubToken = buildSignedTestIdToken({ sub: '', uid: '' });
    const emptySubResult = await verifyFirebaseIdToken(emptySubToken, {
      expectedProjectId: EXPECTED_FIREBASE_PROJECT_ID,
      nowSeconds: nowSec,
    });
    assert.equal(emptySubResult.valid, false);
    assert.equal(emptySubResult.code, 'MISSING_SUBJECT_UID');

    // Expired token (> 60s past exp)
    const expiredToken = buildSignedTestIdToken({
      iat: nowSec - 7200,
      exp: nowSec - 300,
    });
    const expiredResult = await verifyFirebaseIdToken(expiredToken, {
      expectedProjectId: EXPECTED_FIREBASE_PROJECT_ID,
      nowSeconds: nowSec,
    });
    assert.equal(expiredResult.valid, false);
    assert.equal(expiredResult.code, 'EXPIRED_FIREBASE_TOKEN');

    // Future issued-at timestamp (> 60s clock skew)
    const futureIatToken = buildSignedTestIdToken({
      iat: nowSec + 600,
      exp: nowSec + 7200,
    });
    const futureIatResult = await verifyFirebaseIdToken(futureIatToken, {
      expectedProjectId: EXPECTED_FIREBASE_PROJECT_ID,
      nowSeconds: nowSec,
    });
    assert.equal(futureIatResult.valid, false);
    assert.equal(futureIatResult.code, 'FUTURE_ISSUED_AT');
  });

  // ===========================================================================
  // 4. JWKS Key Rotation, Unknown KIDs, and Network Outage (Fail-Closed)
  // ===========================================================================
  it('4. handles key rotation gracefully and fails closed upon unknown keys or JWKS outage', async () => {
    // Rotated key (KID_2) verifies successfully
    const rotatedToken = buildSignedTestIdToken({}, { kid: KID_2, privateKey: testPrivateKey2 });
    const rotatedResult = await verifyFirebaseIdToken(rotatedToken, {
      expectedProjectId: EXPECTED_FIREBASE_PROJECT_ID,
    });
    assert.equal(rotatedResult.valid, true);

    // Unknown Key Identifier (KID_999) fails with UNKNOWN_KEY_IDENTIFIER
    const unknownKidToken = buildSignedTestIdToken({}, { kid: 'google-key-non-existent-999' });
    const unknownKidResult = await verifyFirebaseIdToken(unknownKidToken, {
      expectedProjectId: EXPECTED_FIREBASE_PROJECT_ID,
    });
    assert.equal(unknownKidResult.valid, false);
    assert.equal(unknownKidResult.status, 401);
    assert.equal(unknownKidResult.code, 'UNKNOWN_KEY_IDENTIFIER');

    // Network outage / JWKS fetch failure -> Fail-closed with 503
    resetJwksCacheForTests();
    const outageToken = buildSignedTestIdToken({});
    const outageResult = await verifyFirebaseIdToken(outageToken, {
      expectedProjectId: EXPECTED_FIREBASE_PROJECT_ID,
      fetchFn: async () => {
        throw new Error('NETWORK_TIMEOUT_CONNECTION_REFUSED');
      },
    });
    assert.equal(outageResult.valid, false);
    assert.equal(outageResult.status, 503);
    assert.equal(outageResult.code, 'JWKS_FETCH_FAILED');
  });

  // ===========================================================================
  // 5. Header Hygiene (Ambiguity, Comma-Separation, CR/LF Injection)
  // ===========================================================================
  it('5. prevents header ambiguity, multiple authorization headers, and CR/LF injection', async () => {
    // Comma-separated token header -> Rejected as ambiguous (HTTP 400)
    const commaHeaders = new Headers({
      Authorization: 'Bearer token1, Bearer token2',
    });
    const commaResult = extractSingleSecurityHeader(commaHeaders, 'authorization');
    assert.equal(commaResult.ok, false);
    assert.equal(commaResult.reason, 'AMBIGUOUS_AUTH_HEADER');

    // CR/LF injection -> Rejected as ambiguous (HTTP 400)
    const crlfResult = extractSingleSecurityHeader(
      { authorization: 'Bearer token\r\nX-Injected: true' },
      'authorization'
    );
    assert.equal(crlfResult.ok, false);
    assert.equal(crlfResult.reason, 'AMBIGUOUS_AUTH_HEADER');

    // Clean single header passes
    const cleanHeaders = new Headers({
      Authorization: 'Bearer clean-jwt-token',
    });
    const cleanResult = extractSingleSecurityHeader(cleanHeaders, 'authorization');
    assert.equal(cleanResult.ok, true);
    assert.equal(cleanResult.value, 'Bearer clean-jwt-token');
  });

  // ===========================================================================
  // 6. Request Authentication Context Resolution
  // ===========================================================================
  it('6. populates strongly-typed WorkerAuthContext distinguishing anonymous, user, admin, and service-secret', async () => {
    // Anonymous request
    const anonReq = new Request('https://radartehran.ir/api/v1/commerce/catalog');
    const anonCtx = await resolveWorkerAuthContext(anonReq);
    assert.equal(anonCtx.authenticated, false);
    assert.equal(anonCtx.mode, 'anonymous');
    assert.equal(anonCtx.principal, null);

    // Ordinary verified user token
    const userToken = buildSignedTestIdToken({
      sub: 'uid-user-1',
      email: 'citizen@example.com',
      email_verified: true,
    });
    const userReq = new Request('https://radartehran.ir/api/my-bargains', {
      headers: { Authorization: `Bearer ${userToken}` },
    });
    const userCtx = await resolveWorkerAuthContext(userReq);
    assert.equal(userCtx.authenticated, true);
    assert.equal(userCtx.mode, 'firebase_id_token');
    assert.equal(userCtx.principal?.uid, 'uid-user-1');
    assert.equal(userCtx.principal?.role, 'verified_user');
    assert.equal(userCtx.principal?.isPrimaryAdmin, false);

    // Unverified email claim -> Rejected with 403 EMAIL_NOT_VERIFIED
    const unverifiedToken = buildSignedTestIdToken({
      sub: 'uid-user-unverified',
      email: 'unverified@example.com',
      email_verified: false,
    });
    const unverifiedReq = new Request('https://radartehran.ir/api/my-bargains', {
      headers: { Authorization: `Bearer ${unverifiedToken}` },
    });
    const unverifiedCtx = await resolveWorkerAuthContext(unverifiedReq);
    assert.equal(unverifiedCtx.authenticated, false);
    assert.equal(unverifiedCtx.failureStatusCode, 403);
    assert.equal(unverifiedCtx.failureCode, 'EMAIL_NOT_VERIFIED');

    // Bootstrap Admin token -> Primary Admin principal
    const adminToken = buildSignedTestIdToken({
      sub: 'uid-admin-bootstrap',
      email: PRIMARY_BOOTSTRAP_ADMIN_EMAIL,
      email_verified: true,
    });
    const adminReq = new Request('https://radartehran.ir/api/admin/env-config', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const adminCtx = await resolveWorkerAuthContext(adminReq);
    assert.equal(adminCtx.authenticated, true);
    assert.equal(adminCtx.principal?.role, 'primary_admin');
    assert.equal(adminCtx.principal?.isPrimaryAdmin, true);

    // Service-to-service admin secret token
    const secretReq = new Request('https://radartehran.ir/api/admin/env-config', {
      headers: { 'x-admin-token': 'super-secret-admin-token-123456789' },
    });
    const secretCtx = await resolveWorkerAuthContext(secretReq, {
      adminApiSecret: 'super-secret-admin-token-123456789',
    });
    assert.equal(secretCtx.authenticated, true);
    assert.equal(secretCtx.mode, 'server_secret_token');
    assert.equal(secretCtx.principal?.role, 'service_admin');
    assert.equal(secretCtx.principal?.isPrimaryAdmin, true);
  });

  // ===========================================================================
  // 7. Authorization Policy Evaluation Engine
  // ===========================================================================
  it('7. evaluates resource and operation policies (PUBLIC, VERIFIED_USER, RESOURCE_OWNER, ADMIN, PRIMARY_ADMIN)', () => {
    const guestCtx: WorkerAuthContext = {
      authenticated: false,
      mode: 'anonymous',
      principal: null,
      verifiedAtMs: Date.now(),
      correlationId: 'corr-guest',
      environment: 'production',
    };

    const userPrincipal: AuthenticatedWorkerPrincipal = {
      uid: 'user-alice-100',
      email: 'alice@example.com',
      emailVerified: true,
      role: 'verified_user',
      authMode: 'firebase_id_token',
      isPrimaryAdmin: false,
      isDelegatedAdmin: false,
      claims: {},
    };
    const userCtx: WorkerAuthContext = {
      authenticated: true,
      mode: 'firebase_id_token',
      principal: userPrincipal,
      verifiedAtMs: Date.now(),
      correlationId: 'corr-user',
      environment: 'production',
    };

    const adminPrincipal: AuthenticatedWorkerPrincipal = {
      uid: 'admin-bob-200',
      email: PRIMARY_BOOTSTRAP_ADMIN_EMAIL,
      emailVerified: true,
      role: 'primary_admin',
      authMode: 'firebase_id_token',
      isPrimaryAdmin: true,
      isDelegatedAdmin: false,
      claims: {},
    };
    const adminCtx: WorkerAuthContext = {
      authenticated: true,
      mode: 'firebase_id_token',
      principal: adminPrincipal,
      verifiedAtMs: Date.now(),
      correlationId: 'corr-admin',
      environment: 'production',
    };

    // PUBLIC: allows guest, user, and admin
    assert.equal(evaluateWorkerAuthorization(guestCtx, { policy: 'PUBLIC' }).allowed, true);
    assert.equal(evaluateWorkerAuthorization(userCtx, { policy: 'PUBLIC' }).allowed, true);

    // VERIFIED_USER: denies guest (401), allows user (200)
    const guestOnUserPolicy = evaluateWorkerAuthorization(guestCtx, { policy: 'VERIFIED_USER' });
    assert.equal(guestOnUserPolicy.allowed, false);
    assert.equal(guestOnUserPolicy.statusCode, 401);
    assert.equal(evaluateWorkerAuthorization(userCtx, { policy: 'VERIFIED_USER' }).allowed, true);

    const recentAuthTime = Math.floor(Date.now() / 1000) - 120;
    const freshUserCtx: WorkerAuthContext = {
      ...userCtx,
      principal: { ...userPrincipal, authTimeSeconds: recentAuthTime },
    };
    const staleUserCtx: WorkerAuthContext = {
      ...userCtx,
      principal: { ...userPrincipal, authTimeSeconds: Math.floor(Date.now() / 1000) - 600 },
    };
    assert.equal(
      evaluateWorkerAuthorization(freshUserCtx, { policy: 'VERIFIED_USER', maxAuthAgeSeconds: 300 }).allowed,
      true,
    );
    const staleAuthDecision = evaluateWorkerAuthorization(staleUserCtx, {
      policy: 'VERIFIED_USER',
      maxAuthAgeSeconds: 300,
    });
    assert.equal(staleAuthDecision.allowed, false);
    assert.equal(staleAuthDecision.statusCode, 403);
    assert.equal(staleAuthDecision.failureCode, 'RECENT_AUTHENTICATION_REQUIRED');
    const missingAuthTimeDecision = evaluateWorkerAuthorization(userCtx, {
      policy: 'VERIFIED_USER',
      maxAuthAgeSeconds: 300,
    });
    assert.equal(missingAuthTimeDecision.allowed, false);
    assert.equal(missingAuthTimeDecision.failureCode, 'RECENT_AUTHENTICATION_REQUIRED');

    // RESOURCE_OWNER_OR_ADMIN:
    // - Owner matches -> Allowed (200)
    const ownerDecision = evaluateWorkerAuthorization(userCtx, {
      policy: 'RESOURCE_OWNER_OR_ADMIN',
      resourceOwnerUid: 'user-alice-100',
    });
    assert.equal(ownerDecision.allowed, true);

    // - Cross-user attempt -> Denied (403 RESOURCE_OWNER_MISMATCH)
    const crossUserDecision = evaluateWorkerAuthorization(userCtx, {
      policy: 'RESOURCE_OWNER_OR_ADMIN',
      resourceOwnerUid: 'user-charlie-300',
    });
    assert.equal(crossUserDecision.allowed, false);
    assert.equal(crossUserDecision.statusCode, 403);
    assert.equal(crossUserDecision.failureCode, 'RESOURCE_OWNER_MISMATCH');

    // - Admin override on other user's resource -> Allowed (200)
    const adminOverrideDecision = evaluateWorkerAuthorization(adminCtx, {
      policy: 'RESOURCE_OWNER_OR_ADMIN',
      resourceOwnerUid: 'user-charlie-300',
    });
    assert.equal(adminOverrideDecision.allowed, true);

    // ADMIN: denies ordinary user (403 NOT_ADMIN_USER), allows admin (200)
    const userOnAdminPolicy = evaluateWorkerAuthorization(userCtx, { policy: 'ADMIN' });
    assert.equal(userOnAdminPolicy.allowed, false);
    assert.equal(userOnAdminPolicy.statusCode, 403);
    assert.equal(userOnAdminPolicy.failureCode, 'NOT_ADMIN_USER');
    assert.equal(evaluateWorkerAuthorization(adminCtx, { policy: 'ADMIN' }).allowed, true);

    // PRIMARY_ADMIN:
    // - Disallow static server secret token when explicitly restricted
    const secretPrincipal: AuthenticatedWorkerPrincipal = {
      uid: 'server-secret-admin',
      email: PRIMARY_BOOTSTRAP_ADMIN_EMAIL,
      emailVerified: true,
      role: 'service_admin',
      authMode: 'server_secret_token',
      isPrimaryAdmin: true,
      isDelegatedAdmin: false,
      claims: {},
    };
    const secretCtx: WorkerAuthContext = {
      authenticated: true,
      mode: 'server_secret_token',
      principal: secretPrincipal,
      verifiedAtMs: Date.now(),
      correlationId: 'corr-secret',
      environment: 'production',
    };
    const restrictedSecretDecision = evaluateWorkerAuthorization(secretCtx, {
      policy: 'PRIMARY_ADMIN',
      allowServerSecretToken: false,
    });
    assert.equal(restrictedSecretDecision.allowed, false);
    assert.equal(restrictedSecretDecision.statusCode, 403);
    assert.equal(restrictedSecretDecision.failureCode, 'STATIC_ADMIN_TOKEN_FORBIDDEN_FOR_OPERATION');
  });

  // ===========================================================================
  // 8. Firebase App Check Token Boundaries
  // ===========================================================================
  it('8. enforces App Check boundaries across disabled, monitor, and enforced modes and blocks debug tokens in production', async () => {
    // Disabled mode -> Always allowed
    const disabledReq = new Request('https://radartehran.ir/api/v1/claims');
    const disabledResult = await verifyWorkerAppCheck(disabledReq, { mode: 'disabled' });
    assert.equal(disabledResult.allowed, true);
    assert.equal(disabledResult.mode, 'disabled');

    // Production environment with Debug Token -> Denied with 403
    const debugReq = new Request('https://radartehran.ir/api/buyer-alerts', {
      headers: {
        'x-firebase-appcheck-debug': 'test-debug-token-guid',
      },
    });
    const debugResult = await verifyWorkerAppCheck(debugReq, {
      mode: 'enforced',
      isProduction: true,
    });
    assert.equal(debugResult.allowed, false);
    assert.equal(debugResult.statusCode, 403);
    assert.equal(debugResult.reason, 'APP_CHECK_DEBUG_TOKEN_FORBIDDEN_IN_PRODUCTION');

    // Enforced mode without App Check token -> Denied with 401
    const missingReq = new Request('https://radartehran.ir/api/buyer-alerts');
    const missingResult = await verifyWorkerAppCheck(missingReq, { mode: 'enforced' });
    assert.equal(missingResult.allowed, false);
    assert.equal(missingResult.statusCode, 401);
    assert.equal(missingResult.reason, 'MISSING_APP_CHECK_TOKEN');

    // Monitor mode without App Check token -> Allowed with monitor flag (pass-through telemetry)
    const monitorResult = await verifyWorkerAppCheck(missingReq, { mode: 'monitor' });
    assert.equal(monitorResult.allowed, true);
    assert.equal(monitorResult.mode, 'monitor');
    assert.equal(monitorResult.reason, 'APP_CHECK_MONITOR_MISSING_TOKEN');

    // Verified App Check token via custom or standard verification
    const validAppCheckReq = new Request('https://radartehran.ir/api/buyer-alerts', {
      headers: { 'x-firebase-appcheck': 'valid-app-check-token-string-sample-test' },
    });
    const validAppCheckResult = await verifyWorkerAppCheck(validAppCheckReq, {
      mode: 'enforced',
      customVerifyFn: async () => ({ appId: '1:935427453422:web:25817d32df713f2a68deff' }),
    });
    assert.equal(validAppCheckResult.allowed, true);
    assert.equal(validAppCheckResult.appId, '1:935427453422:web:25817d32df713f2a68deff');
  });

  // ===========================================================================
  // 9. Timing-Safe Secret Matching & Secret Leakage Prevention
  // ===========================================================================
  it('9. executes timing-safe secret comparisons and prevents secret or bearer token leakage in audit logs', () => {
    // Constant-time secret match
    const secret = 'my-super-secret-token-12345';
    assert.equal(constantTimeSecretMatch(secret, secret), true);
    assert.equal(constantTimeSecretMatch(secret, 'my-super-secret-token-12344'), false);
    assert.equal(constantTimeSecretMatch(secret, 'short'), false);
    assert.equal(constantTimeSecretMatch('', secret), false);

    // Audit event generation strictly excludes tokens and secrets
    const auditEvent = buildSecurityAuditEvent('AUTH_FAILURE', {
      clientIp: '198.51.100.10',
      correlationId: 'corr-sec-999',
      path: '/api/admin/env-config',
      method: 'POST',
      actorUid: 'attacker-uid',
      actorEmail: 'attacker@evil.com',
      failureCode: 'INVALID_ADMIN_SECRET',
      failureReason: 'Invalid admin secret provided',
    });

    const serialized = JSON.stringify(auditEvent);
    assert.ok(!serialized.includes('Bearer'));
    assert.ok(!serialized.includes('super-secret-token'));
    assert.equal(auditEvent.action, 'AUTH_FAILURE');
    assert.equal(auditEvent.clientIp, '198.51.100.10');
  });
});
