/**
 * @fileoverview Automated Security & Authorization Test Suite (Tasks 1, 2 & 5).
 * Tests:
 * - Task 1: `/api/send-telegram` payload validation, rejection of client-supplied `botToken`/`channelId`,
 *   message length limits, Content-Type enforcement, and frontend caller verification.
 * - Task 2: Authoritative admin authentication and authorization across unauthenticated users,
 *   unverified accounts, ordinary users, bootstrap admin, delegated `/admins/{uid}` admins,
 *   revoked admins, and privilege escalation attempts.
 * - Task 5: Production environment configuration validation and placeholder rejection.
 */

import * as fs from 'fs';
import * as crypto from 'crypto';
import {
  getValidatedServerConfig,
  verifyAdminApiAuthorization,
  isDelegatedAdminDocument,
  validateTelegramSendRequest,
  EXPECTED_FIREBASE_PROJECT_ID,
  TELEGRAM_MAX_MESSAGE_LENGTH,
} from '../src/utils/serverAdminAndTelegramSecurity';
import { isAuthorizedAdminUser } from '../src/data/neighborhoods';
import {
  applyDeliveryBoundarySecurityHeaders,
  isIpInAbuseCooldown,
  recordAbuseSignal,
  resetRateLimitStateForTests,
} from '../src/utils/serverDeliveryAndAbuseGuard';
import { escapeXml } from '../src/utils/serverSeoAndSitemap';

function assertCondition(name: string, condition: boolean, details: string): void {
  if (!condition) {
    console.error(`[FAIL] ${name}: ${details}`);
    process.exit(1);
  }
  console.log(`[PASS] ${name}: ${details}`);
}

const TEST_RSA_CERT = `-----BEGIN CERTIFICATE-----
MIIDFTCCAf2gAwIBAgIUMycZOQZTsV4YBM6M7sdwZiQdJCkwDQYJKoZIhvcNAQEL
BQAwGjEYMBYGA1UEAwwPU2VjdXJlVG9rZW5UZXN0MB4XDTI2MTAyODEyMTgzN1oX
DTM2MTAyNTEyMTgzN1owGjEYMBYGA1UEAwwPU2VjdXJlVG9rZW5UZXN0MIIBIjAN
BgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAtF819VjtFlz4f2hYSRKgyMt8M34W
bnq8oeykGskYDiG+rWrZcNmLLztHbVG6d8jckVBFZsmMNn7bHHZIcmaFozshV9jC
DpKv862yt79ziMbVt9eWy80cRDfTfiDO60e7dXr1dxiUK49bLSxXejaKIGi+wpDi
zzJCoziaf3kz1Vy+7ztFbRVSKIXpzPCSeA9jMpDj2MvYKWflhnsT1qNlvxoNsy5b
h+yzcy6NZbZoULZF+P5lQS4QVEFnYt+eUEYmg2uwjH8UFSjQs1A+Kdd5kvYeO1GN
iYHQEcuSlPvbG+L3fK793yrcX+WVuje26z07/c4x9D+qpfvE1921CBXj9QIDAQAB
o1MwUTAdBgNVHQ4EFgQUMcQNHs4N7V3gdCAfjtzCq7OjmGUwHwYDVR0jBBgwFoAU
McQNHs4N7V3gdCAfjtzCq7OjmGUwDwYDVR0TAQH/BAUwAwEB/zANBgkqhkiG9w0B
AQsFAAOCAQEAihggMOytvCHkgVG9T9BzWM2SymDYJWVhkQ1ddNb6GVUuWaS0r0cP
iZCN2olxF/kT9s8eJqTxShTNx2ylS+wMeWhm2aPFlrHcqRYUZch1WavVJ9JlUYig
DD++dRMt840vfEydrplevGsNkdvfMe274SN3HUU4oW5dDCFkvx1370L4xgCPQCgC
Z9Lvqu8pLeUG87y3vSQvl61CCFhQuVClPg/MPsqh4fyuE1PP9120HNxCp9OF/vCf
3Fwj8zUu6PYA8xjfvGoMgwqhyfOeigVzhBfbEtHuSonD9RSn5j+JmhG/p/1I9smp
kPxi0u00Gba6C4hYXKwZ5MQu/BcSEheImg==
-----END CERTIFICATE-----`;

const TEST_RSA_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQC0XzX1WO0WXPh/
aFhJEqDIy3wzfhZueryh7KQayRgOIb6tatlw2YsvO0dtUbp3yNyRUEVmyYw2ftsc
dkhyZoWjOyFX2MIOkq/zrbK3v3OIxtW315bLzRxEN9N+IM7rR7t1evV3GJQrj1st
LFd6NoogaL7CkOLPMkKjOJp/eTPVXL7vO0VtFVIohenM8JJ4D2MykOPYy9gpZ+WG
exPWo2W/Gg2zLluH7LNzLo1ltmhQtkX4/mVBLhBUQWdi355QRiaDa7CMfxQVKNCz
UD4p13mS9h47UY2JgdARy5KU+9sb4vd8rv3fKtxf5ZW6N7brPTv9zjH0P6ql+8TX
3bUIFeP1AgMBAAECggEAO4mL9YrfY3jXu7J1JdWkxfLI8fRGMjyIREio2ICVVKDV
4Ec7M/FS7Im8J30JOF3QVJTy+50+j4RrDeeLPVvS89DiTi1pzMallqE4s0daOwUq
6W6bw3TWRjxJLsJkmqwIWBx4ptGxovlEZtJSo7AaAt2gTffmLe9QqLDX6ojWz6+q
JsRaVn9W2pWW8ZyCa0ynN4FzLLAM1pE+5h+g/AHa3xiMhVz8+fJF18zGlp0zDImb
vs4VCSuOxwRBiLAWb/dD3bvOftDRZYMr0X0gwkJ8ewngUJUJfojAwdN8AA6tgzH/
HbOz4CgpVF6gpzadLfQJhTZQPgMgFHX1MXA0DOiQVwKBgQDY77lyxF0qK4bkL/SN
UIf6nNu9vahSq3T9OcvSZjxrbxcERkAlLDAaTUHSgJyUO0LstN+G3mU6Qe7x5kkX
EcA39nUzOQ3p8apnCaXflvPimJMiIiR8dzd7ICbfuc/XE+svBiFPFEUDhGN0kavD
rUjULyTWZ6BAAaHBI7H/iUz+rwKBgQDU2fIgci4Yl9Pc4kwJIgZ27oOlGHSnxhmc
btrl91kIZUjVJ9NTyNNvPKydUSj64oPWChUhk5xVvINWv5dHPTmWI3RReTNmc+9X
VHYEwrgmaY6wi1vMZctcYvgf9CbIxg1aU8N0rV8XzWiXZOu689vzZI85AHrG+2cE
rOfmZ29QmwKBgCotgbrkntCCIfnfsQaAr890C+06IK3iFB7fy9cedYTV1n3IQtR3
YOrcNn3873SKiRqImCUavEe1ZgW2JmPL2bmHu4W4BBKGIAFkiNGOAeD+lSy/wqRI
cYsI10YMVHKWttUvte4wHLLwXH3fjKvA1zYZ7GmbQDbxmkd47zSlt0iVAoGAUPy8
S+wl7eWXDyxrke4IV6hZHrA3cr7Fb+geEfITRkaDd9c3aWG4UVLcut7uoMcfMomT
kLsBeP3JW3B6tvhsuNu0nmtnS0xBfRD99sHAH516VWIxA4yX3AcsMbxMJYh1/DB
y5ioxTHUznqcfqnqu7eUNObsc/CkcAYNomRoyGJECgYBEwLhwdIdHl8fYafcLHFnw
1dBiSozzVw8rGDWqIHN2SBB70MaizLwy4Z/pTb6yFfj60ZwlD1y0sYJEoRkE9a3j
WIBHkJ31cG6I1Y4DS7KNp8sGIs2ugJmDdksr4JEmqSi3sidMXjFwRqb8ZHp+BL/g
gwgsXfYl9wkKj7+h/9cFhA==
-----END PRIVATE KEY-----`;

const TEST_PUBLIC_CERTS = { 'key-1': TEST_RSA_CERT };

function buildTestJwt(payload: Record<string, unknown>, alg = 'RS256', kid: string | null = 'key-1'): string {
  const headerObj: Record<string, unknown> = { alg, typ: 'JWT' };
  if (kid !== null) {
    headerObj.kid = kid;
  }
  const header = Buffer.from(JSON.stringify(headerObj)).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const data = Buffer.from(`${header}.${body}`, 'ascii');
  const signature = crypto.sign('RSA-SHA256', data, TEST_RSA_KEY).toString('base64url');
  return `${header}.${body}.${signature}`;
}

async function runSecurityTests(): Promise<void> {
  const nowSec = 1760000000;

  // ===========================================================================
  // TASK 1: /api/send-telegram Payload & Credential Isolation Tests
  // ===========================================================================

  // 1. Rejects non-JSON Content-Type
  const badContentType = validateTelegramSendRequest({ city: 'tehran' }, 'text/plain');
  assertCondition(
    'Task 1.1 - Content-Type validation',
    !badContentType.valid && badContentType.statusCode === 415,
    'Rejected text/plain Content-Type with HTTP 415'
  );

  // 2. Rejects client-supplied botToken in request body
  const injectedBotToken = validateTelegramSendRequest(
    { city: 'tehran', botToken: '123456789:ABCdefGHIjklMNOpqrSTUvwxYZ123456789' },
    'application/json'
  );
  assertCondition(
    'Task 1.2 - Reject client botToken',
    !injectedBotToken.valid &&
      injectedBotToken.statusCode === 400 &&
      injectedBotToken.code === 'FORBIDDEN_CLIENT_CREDENTIALS',
    'Rejected client-supplied botToken with HTTP 400 FORBIDDEN_CLIENT_CREDENTIALS'
  );

  // 3. Rejects client-supplied channelId / chat_id in request body
  const injectedChannelId = validateTelegramSendRequest(
    { city: 'tehran', channelId: '@AttackerChannel' },
    'application/json'
  );
  const injectedChatId = validateTelegramSendRequest(
    { city: 'tehran', chat_id: '-100123456789' },
    'application/json'
  );
  assertCondition(
    'Task 1.3 - Reject client channelId & chat_id',
    !injectedChannelId.valid &&
      injectedChannelId.statusCode === 400 &&
      !injectedChatId.valid &&
      injectedChatId.statusCode === 400,
    'Rejected client-supplied channelId and chat_id with HTTP 400'
  );

  // 4. Rejects unexpected payload fields
  const unexpectedField = validateTelegramSendRequest(
    { city: 'tehran', text: 'گزارش', webhookUrl: 'https://evil.example.com' },
    'application/json'
  );
  assertCondition(
    'Task 1.4 - Reject unexpected payload fields',
    !unexpectedField.valid &&
      unexpectedField.statusCode === 400 &&
      unexpectedField.code === 'UNEXPECTED_PAYLOAD_FIELD',
    'Rejected unexpected field webhookUrl with HTTP 400'
  );

  // 5. Rejects oversized Telegram message (> 4096 chars)
  const oversizedText = 'الف'.repeat(TELEGRAM_MAX_MESSAGE_LENGTH + 1);
  const oversizedRes = validateTelegramSendRequest(
    { city: 'tehran', text: oversizedText },
    'application/json'
  );
  assertCondition(
    'Task 1.5 - Reject message > 4096 chars',
    !oversizedRes.valid &&
      oversizedRes.statusCode === 400 &&
      oversizedRes.code === 'MESSAGE_TOO_LONG',
    'Rejected >4096 char payload with HTTP 400'
  );

  // 6. Accepts clean { city, text } payload
  const validReq = validateTelegramSendRequest(
    { city: 'isfahan', text: '📡 گزارش رسمی رادار مسکن اصفهان' },
    'application/json; charset=utf-8'
  );
  assertCondition(
    'Task 1.6 - Accept valid { city, text } payload',
    validReq.valid && validReq.city === 'isfahan' && validReq.customText.includes('اصفهان'),
    'Accepted clean { city, text } request'
  );

  // 7. Verify frontend callers never send botToken or channelId
  const expansionSrc = fs.readFileSync('src/components/ExpansionModulesModal.tsx', 'utf8');
  const adminModalSrc = fs.readFileSync('src/components/AdminModal.tsx', 'utf8');
  const noClientTokenInModals =
    !expansionSrc.includes('botToken:') &&
    !expansionSrc.includes('channelId:') &&
    !adminModalSrc.includes('botToken:') &&
    !adminModalSrc.includes('channelId:');
  assertCondition(
    'Task 1.7 - Frontend callers purged of botToken/channelId',
    noClientTokenInModals,
    'Neither ExpansionModulesModal nor AdminModal sends botToken or channelId'
  );

  // ===========================================================================
  // TASK 2: Admin Authentication & Authorization Reconciliation Tests
  // ===========================================================================

  // 8. Client/shared isAuthorizedAdminUser matrix
  assertCondition(
    'Task 2.1 - Unauthenticated user denied',
    !isAuthorizedAdminUser(null) && !isAuthorizedAdminUser(undefined),
    'Null/undefined user denied'
  );
  assertCondition(
    'Task 2.2 - Unverified bootstrap admin denied',
    !isAuthorizedAdminUser({ email: 'radio837isf@gmail.com', emailVerified: false }),
    'Unverified bootstrap email denied'
  );
  assertCondition(
    'Task 2.3 - Ordinary verified user denied',
    !isAuthorizedAdminUser({ email: 'ordinary@example.com', emailVerified: true }),
    'Ordinary verified user denied'
  );
  assertCondition(
    'Task 2.4 - Verified bootstrap admin allowed',
    isAuthorizedAdminUser({ email: 'radio837isf@gmail.com', emailVerified: true }),
    'Verified bootstrap admin allowed'
  );
  assertCondition(
    'Task 2.5 - Verified delegated /admins/{uid} admin allowed',
    isAuthorizedAdminUser(
      { uid: 'uid-del-1', email: 'delegate@example.com', emailVerified: true },
      { role: 'admin', email: 'delegate@example.com' }
    ) &&
      isAuthorizedAdminUser(
        { uid: 'uid-del-1', email: 'delegate@example.com', emailVerified: true },
        true
      ),
    'Delegated admin with role==="admin" and emailVerified===true allowed'
  );
  assertCondition(
    'Task 2.6 - Unverified delegated admin denied',
    !isAuthorizedAdminUser(
      { uid: 'uid-del-1', email: 'delegate@example.com', emailVerified: false },
      { role: 'admin', email: 'delegate@example.com' }
    ),
    'Delegated admin without emailVerified denied'
  );
  assertCondition(
    'Task 2.7 - Privilege escalation attempt (non-admin role or mismatched email) denied',
    !isAuthorizedAdminUser(
      { uid: 'uid-del-2', email: 'attacker@example.com', emailVerified: true },
      { role: 'editor', email: 'attacker@example.com' }
    ) &&
      !isAuthorizedAdminUser(
        { uid: 'uid-del-2', email: 'attacker@example.com', emailVerified: true },
        { role: 'admin', email: 'someone-else@example.com' }
      ) &&
      !isAuthorizedAdminUser(
        { uid: 'uid-del-2', email: 'attacker@example.com', emailVerified: true },
        false
      ),
    'Non-admin role, email mismatch, and revoked admin flag all denied'
  );

  // 9. Server-side verifyAdminApiAuthorization matrix (Firebase Admin SDK + Server Secret)
  const unauthServer = await verifyAdminApiAuthorization({}, {});
  assertCondition(
    'Task 2.8 - Server rejects missing Authorization header (401)',
    !unauthServer.authorized &&
      unauthServer.statusCode === 401 &&
      unauthServer.reason === 'CLOUDFLARE_SESSION_REQUIRED',
    `Reason: ${unauthServer.reason}`
  );

  const invalidSecretCheck = await verifyAdminApiAuthorization(
    { 'x-admin-token': 'wrong-admin-secret-token' },
    { ADMIN_API_SECRET: '0123456789abcdef0123456789abcdef' }
  );
  assertCondition(
    'Task 2.9 - Invalid server admin secret is rejected (403)',
    !invalidSecretCheck.authorized &&
      invalidSecretCheck.statusCode === 403 &&
      invalidSecretCheck.reason === 'STATIC_ADMIN_TOKEN_RETIRED',
    'Legacy x-admin-token is rejected with 403 STATIC_ADMIN_TOKEN_RETIRED'
  );

  const malformedJwtCheck = await verifyAdminApiAuthorization(
    { authorization: 'Bearer not-a-three-part-jwt' },
    {}
  );
  assertCondition(
    'Task 2.10 - Malformed JWT is rejected before Admin SDK verification (401)',
    !malformedJwtCheck.authorized &&
      malformedJwtCheck.statusCode === 401 &&
      malformedJwtCheck.reason === 'CLOUDFLARE_SESSION_REQUIRED',
    'Bearer headers cannot establish a session; Cloudflare session is required'
  );

  const oversizedJwtCheck = await verifyAdminApiAuthorization(
    { authorization: `Bearer ${'a'.repeat(12005)}` },
    {}
  );
  assertCondition(
    'Task 2.11 - Oversized JWT is rejected before Admin SDK verification (401)',
    !oversizedJwtCheck.authorized &&
      oversizedJwtCheck.statusCode === 401 &&
      oversizedJwtCheck.reason === 'CLOUDFLARE_SESSION_REQUIRED',
    'Oversized legacy bearer token cannot establish a Cloudflare session'
  );

  const secretAuthResult = await verifyAdminApiAuthorization(
    { 'x-admin-token': '0123456789abcdef0123456789abcdef' },
    { ADMIN_API_SECRET: '0123456789abcdef0123456789abcdef' }
  );
  assertCondition(
    'Task 2.14 - Configured server secret authorizes admin request',
    !secretAuthResult.authorized &&
      secretAuthResult.statusCode === 403 &&
      secretAuthResult.reason === 'STATIC_ADMIN_TOKEN_RETIRED',
    'Static server admin secret is retired and cannot authorize requests'
  );

  const fakeJwt = buildTestJwt({
    aud: EXPECTED_FIREBASE_PROJECT_ID,
    iss: `https://securetoken.google.com/${EXPECTED_FIREBASE_PROJECT_ID}`,
    sub: 'admin-uid',
    email: 'radio837isf@gmail.com',
    email_verified: true,
    iat: nowSec - 60,
    exp: nowSec + 3600,
  });

  const fakeJwtResult = await verifyAdminApiAuthorization(
    { authorization: `Bearer ${fakeJwt}` },
    {}
  );
  assertCondition(
    'Task 2.15 - Simulated JWT signature is not trusted',
    !fakeJwtResult.authorized && fakeJwtResult.statusCode !== 200,
    'A Firebase ID token cannot establish the required Cloudflare D1 session'
  );

  assertCondition(
    'Delegated admin with role admin is accepted',
    isDelegatedAdminDocument(
      {
        role: 'admin',
        email: 'delegate@example.com',
      },
      'delegate@example.com'
    ),
    'Admin role with matching email is accepted'
  );

  assertCondition(
    'Viewer role cannot grant admin access',
    !isDelegatedAdminDocument(
      {
        role: 'viewer',
        email: 'viewer@example.com',
      },
      'viewer@example.com'
    ),
    'Non-admin role must be denied'
  );

  assertCondition(
    'Mismatched delegated admin email is rejected',
    !isDelegatedAdminDocument(
      {
        role: 'admin',
        email: 'someone-else@example.com',
      },
      'delegate@example.com'
    ),
    'Mismatched document email must not grant access'
  );

  assertCondition(
    'Legacy UID-bound admin document without email is accepted',
    isDelegatedAdminDocument(
      {
        role: 'admin',
      },
      'delegate@example.com'
    ),
    'Legacy admin document without email remains compatible'
  );

  // ===========================================================================
  // TASK 5: Production Environment Configuration Validation Tests
  // ===========================================================================

  const placeholderEnvCfg = getValidatedServerConfig({
    PORT: 'invalid-port',
    APP_URL: 'MY_APP_URL',
    GEMINI_API_KEY: 'MY_GEMINI_API_KEY',
    TELEGRAM_BOT_TOKEN: '',
    TELEGRAM_CHANNEL_ID: '',
  });
  assertCondition(
    'Task 5.1 - Placeholder and invalid env vars safely rejected with fallbacks',
    placeholderEnvCfg.port === 3000 &&
      placeholderEnvCfg.appUrl === null &&
      !placeholderEnvCfg.geminiConfigured &&
      placeholderEnvCfg.geminiApiKey === null &&
      !placeholderEnvCfg.telegramConfigured &&
      placeholderEnvCfg.telegramBotToken === null,
    'Placeholders rejected cleanly without false positive configuration flags'
  );

  const validEnvCfg = getValidatedServerConfig({
    PORT: '3000',
    APP_URL: 'https://radar.example.com/',
    GEMINI_API_KEY: 'AIzaSyTestValidLengthGeminiKey123456',
    TELEGRAM_BOT_TOKEN: '123456789:ABCdefGHIjklMNOpqrSTUvwxYZ123456789',
    TELEGRAM_CHANNEL_ID: '@TehranHousingRadar',
  });
  assertCondition(
    'Task 5.2 - Valid server env vars parsed accurately',
    validEnvCfg.port === 3000 &&
      validEnvCfg.appUrl === 'https://radar.example.com' &&
      validEnvCfg.geminiConfigured &&
      validEnvCfg.telegramConfigured &&
      validEnvCfg.telegramChannelId === '@TehranHousingRadar',
    'Valid production env config accepted'
  );

  // ===========================================================================
  // TASK 6: Brute-Force Cooldown, HTTP Security Headers & SEO Meta Escaping
  // ===========================================================================
  resetRateLimitStateForTests();
  const bruteForceIp = '203.0.113.77';
  const baseTs = 1760000000000;
  for (let i = 0; i < 4; i++) {
    recordAbuseSignal(bruteForceIp, 'auth_failure', baseTs + i * 100);
  }
  const beforeThreshold = isIpInAbuseCooldown(bruteForceIp, baseTs + 400);
  const fifthStrike = recordAbuseSignal(bruteForceIp, 'auth_failure', baseTs + 500);
  const afterThreshold = isIpInAbuseCooldown(bruteForceIp, baseTs + 600);
  assertCondition(
    'Task 6.1 - Brute-force auth_failure triggers exponential IP cooldown at 5 failed attempts (10 strikes)',
    !beforeThreshold.blocked &&
      fifthStrike.blocked &&
      fifthStrike.strikes === 10 &&
      afterThreshold.blocked &&
      afterThreshold.retryAfterSec >= 59,
    'IP blocked with exponential cooldown after 5 auth_failure strikes'
  );
  resetRateLimitStateForTests();

  const headerMap = new Map<string, string>();
  const mockRes = {
    setHeader(name: string, value: string) {
      headerMap.set(name.toLowerCase(), value);
    },
  } as unknown as import('express').Response;
  applyDeliveryBoundarySecurityHeaders({} as import('express').Request, mockRes, 'production');
  assertCondition(
    'Task 6.2 - HTTP Security Headers include HSTS, COOP, nosniff, and CSP form-action self',
    headerMap.get('x-content-type-options') === 'nosniff' &&
      headerMap.get('cross-origin-opener-policy') === 'same-origin-allow-popups' &&
      (headerMap.get('strict-transport-security') || '').includes('max-age=31536000') &&
      (headerMap.get('content-security-policy') || '').includes("form-action 'self'") &&
      (headerMap.get('content-security-policy') || '').includes("object-src 'none'"),
    'All hardened HTTP security headers verified'
  );

  const escapedMeta = escapeXml('محله <script>alert("xss")</script> & "تست"');
  assertCondition(
    'Task 6.3 - SSR SEO meta escaping neutralizes HTML/XML special characters',
    !escapedMeta.includes('<script>') &&
      !escapedMeta.includes('"xss"') &&
      escapedMeta.includes('&lt;script&gt;') &&
      escapedMeta.includes('&quot;xss&quot;'),
    'HTML/XML special characters escaped in SSR SEO metadata'
  );

  console.log('\n=======================================================');
  console.log('[SECURITY & AUTH SUITE PASS] All 24 assertions passed!');
  console.log('=======================================================\n');
}

void runSecurityTests();
