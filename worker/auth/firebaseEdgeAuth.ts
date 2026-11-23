/**
 * @file worker/auth/firebaseEdgeAuth.ts
 * @description Canonical Edge Firebase ID Token verifier with fail-closed D1 revocation
 * enforcement, canonical D1 revocation write path + audit log, and cryptographic App Check verification.
 */
import type { D1Database, KVNamespace, WorkerEnv } from '../types';
import {
  isWorkerProductionEnvironment,
  resolveWorkerAppCheckMode,
  verifyWorkerAppCheck,
} from './appCheckVerifier';
import type { AppCheckMode } from './types';

export interface VerifiedFirebaseEdgePrincipal {
  authenticated: boolean;
  uid: string | null;
  email: string | null;
  emailVerified: boolean;
  isAdmin: boolean;
  role: 'guest' | 'authenticated_user' | 'publisher_owner' | 'admin';
  authTimeSeconds: number | null;
  issuedAtSeconds: number | null;
  expiresAtSeconds: number | null;
  appCheckVerified: boolean;
  appCheckMode?: AppCheckMode;
  appCheckStatusCode?: 200 | 401 | 403 | 503;
  appCheckReason?: string;
  appCheckAppId?: string;
  statusCode: 200 | 401 | 403 | 503;
  reasonCode: string;
}

export interface FirebaseJwkKey extends JsonWebKey {
  kid: string;
  alg?: string;
  use?: string;
}

export interface RevocationCheckResult {
  revoked: boolean;
  unavailable?: boolean;
  reason?: string;
}

export type RevocationActionType = 'REVOKE_BEFORE' | 'DISABLE_USER' | 'REENABLE_USER';

export interface RecordUserRevocationResult {
  applied: boolean;
  idempotentReplay: boolean;
  watermarkKey: string;
  watermarkValue: string | null;
  eventId: string;
  statusCode: 200 | 400 | 503;
  reason: string;
}

interface CachedJwksState {
  keysByKid: Map<string, CryptoKey>;
  expiresAtMs: number;
}

const GOOGLE_SECURETOKEN_JWKS_URL =
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const DEFAULT_CLOCK_SKEW_SECONDS = 30;
const PRIMARY_ADMIN_EMAILS = new Set([
  'radio837isf@gmail.com',
  'masirsalamatt@gmail.com',
  'bijanbijane.1@gmail.com',
]);

let cachedJwks: CachedJwksState | null = null;
const testOverrideJwks = new Map<string, CryptoKey>();

export function registerTestJwkForEdgeAuth(kid: string, publicKey: CryptoKey): void {
  testOverrideJwks.set(kid, publicKey);
}

export function clearTestJwksForEdgeAuth(): void {
  testOverrideJwks.clear();
  cachedJwks = null;
}

function decodeBase64UrlToUint8Array(base64Url: string): Uint8Array {
  const padded = base64Url.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((base64Url.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function decodeBase64UrlJson<T>(segment: string): T | null {
  try {
    const bytes = decodeBase64UrlToUint8Array(segment);
    const text = new TextDecoder().decode(bytes);
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

async function resolvePublicCryptoKeyByKid(
  kid: string,
  kv?: KVNamespace,
  forceRefresh = false,
): Promise<{ key: CryptoKey | null; dependencyError?: boolean }> {
  if (testOverrideJwks.has(kid)) {
    return { key: testOverrideJwks.get(kid) ?? null };
  }
  const now = Date.now();
  if (!forceRefresh && cachedJwks && cachedJwks.expiresAtMs > now && cachedJwks.keysByKid.has(kid)) {
    return { key: cachedJwks.keysByKid.get(kid) ?? null };
  }

  let rawJwksJson: string | null = null;
  if (!forceRefresh && kv) {
    try {
      rawJwksJson = await kv.get('v1:auth:firebase_jwks');
    } catch {
      rawJwksJson = null;
    }
  }

  let maxAgeSeconds = 3600;
  if (!rawJwksJson) {
    try {
      const response = await fetch(GOOGLE_SECURETOKEN_JWKS_URL, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) return { key: null, dependencyError: true };
      const cacheControl = response.headers.get('cache-control') || '';
      const maxAgeMatch = cacheControl.match(/max-age=(\d+)/i);
      if (maxAgeMatch) {
        maxAgeSeconds = Math.max(300, Math.min(21600, Number(maxAgeMatch[1]) || 3600));
      }
      rawJwksJson = await response.text();
      if (kv && rawJwksJson) {
        await kv.put('v1:auth:firebase_jwks', rawJwksJson, { expirationTtl: maxAgeSeconds }).catch(() => {});
      }
    } catch {
      return { key: null, dependencyError: true };
    }
  }

  try {
    const parsed = JSON.parse(rawJwksJson) as { keys?: FirebaseJwkKey[] };
    const map = new Map<string, CryptoKey>();
    for (const jwk of parsed.keys ?? []) {
      if (!jwk.kid || jwk.kty !== 'RSA') continue;
      const imported = await crypto.subtle.importKey(
        'jwk',
        jwk,
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['verify'],
      );
      map.set(jwk.kid, imported);
    }
    cachedJwks = {
      keysByKid: map,
      expiresAtMs: now + maxAgeSeconds * 1000,
    };
    return { key: map.get(kid) ?? null };
  } catch {
    return { key: null, dependencyError: true };
  }
}

/**
 * Fail-closed revocation check against D1 `sync_watermarks` (`revoked_uid:{uid}`).
 * - If `!db` or query throws -> fails closed with `unavailable: true` (callers MUST return HTTP 503).
 * - Watermark value `'DISABLED'` rejects all tokens for this UID.
 * - Numeric watermark is interpreted as Unix **seconds** (`valid_since_sec`); tokens with `iat < valid_since_sec` are rejected.
 */
export async function isTokenRevokedOrUserDisabled(
  uid: string,
  issuedAtSeconds: number,
  db?: D1Database,
): Promise<RevocationCheckResult> {
  if (!db) {
    return {
      revoked: true,
      unavailable: true,
      reason: 'AUTH_REVOCATION_STORE_UNAVAILABLE',
    };
  }
  try {
    const row = await db
      .prepare('SELECT watermark_value FROM sync_watermarks WHERE watermark_key = ?1')
      .bind(`revoked_uid:${uid}`)
      .first<{ watermark_value: string }>();
    if (!row || !row.watermark_value) {
      return { revoked: false };
    }
    const rawValue = String(row.watermark_value).trim();
    if (rawValue === 'DISABLED') {
      return { revoked: true, reason: 'USER_ACCOUNT_DISABLED' };
    }
    const parsedNumeric = Number(rawValue);
    if (!Number.isFinite(parsedNumeric) || parsedNumeric <= 0) {
      return {
        revoked: true,
        unavailable: true,
        reason: 'AUTH_REVOCATION_WATERMARK_CORRUPTED',
      };
    }
    // Normalize defensively if a legacy writer stored milliseconds (> 1e12).
    const validSinceSeconds = parsedNumeric > 1_000_000_000_000 ? Math.floor(parsedNumeric / 1000) : Math.floor(parsedNumeric);
    const normalizedIatSeconds = issuedAtSeconds > 1_000_000_000_000 ? Math.floor(issuedAtSeconds / 1000) : Math.floor(issuedAtSeconds);
    if (normalizedIatSeconds < validSinceSeconds) {
      return { revoked: true, reason: 'TOKEN_REVOKED_BEFORE_VALID_SINCE' };
    }
    return { revoked: false };
  } catch {
    return {
      revoked: true,
      unavailable: true,
      reason: 'AUTH_REVOCATION_CHECK_FAILED',
    };
  }
}

/**
 * Canonical D1 write path for revoking tokens, disabling, or re-enabling a user.
 * Writes idempotently to `auth_revocation_events` and updates `sync_watermarks` (`revoked_uid:{uid}`).
 */
export async function recordUserRevocationInD1(params: {
  db: D1Database | undefined;
  uid: string;
  action: RevocationActionType;
  validSinceSeconds?: number;
  actorUid: string;
  reason: string;
  idempotencyKey: string;
  nowMs?: number;
}): Promise<RecordUserRevocationResult> {
  const uid = String(params.uid || '').trim();
  const actorUid = String(params.actorUid || '').trim();
  const idempotencyKey = String(params.idempotencyKey || '').trim();
  const watermarkKey = `revoked_uid:${uid}`;

  if (!params.db) {
    return {
      applied: false,
      idempotentReplay: false,
      watermarkKey,
      watermarkValue: null,
      eventId: '',
      statusCode: 503,
      reason: 'AUTH_REVOCATION_STORE_UNAVAILABLE',
    };
  }
  if (!uid || uid.length > 128 || !actorUid || !idempotencyKey) {
    return {
      applied: false,
      idempotentReplay: false,
      watermarkKey,
      watermarkValue: null,
      eventId: '',
      statusCode: 400,
      reason: 'INVALID_REVOCATION_PARAMETERS',
    };
  }

  const nowMs = params.nowMs ?? Date.now();
  const nowSec = Math.floor(nowMs / 1000);
  const nowIso = new Date(nowMs).toISOString();
  const validSinceSeconds =
    params.action === 'REVOKE_BEFORE'
      ? Math.max(1, Math.floor(params.validSinceSeconds ?? nowSec))
      : null;
  const watermarkValue =
    params.action === 'DISABLE_USER'
      ? 'DISABLED'
      : params.action === 'REVOKE_BEFORE'
        ? String(validSinceSeconds)
        : null;
  const eventId = `rev_${nowMs}_${Math.random().toString(36).slice(2, 10)}`;

  try {
    const existing = await params.db
      .prepare('SELECT event_id FROM auth_revocation_events WHERE idempotency_key = ?1')
      .bind(idempotencyKey)
      .first<{ event_id: string }>();
    if (existing?.event_id) {
      return {
        applied: true,
        idempotentReplay: true,
        watermarkKey,
        watermarkValue,
        eventId: existing.event_id,
        statusCode: 200,
        reason: 'REVOCATION_IDEMPOTENT_REPLAY',
      };
    }

    await params.db
      .prepare(
        `INSERT OR IGNORE INTO auth_revocation_events (
          event_id, uid, action, valid_since_seconds, actor_uid, reason, idempotency_key, created_at_iso
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
      )
      .bind(
        eventId,
        uid,
        params.action,
        validSinceSeconds,
        actorUid,
        String(params.reason || 'ADMIN_REVOCATION').slice(0, 240),
        idempotencyKey,
        nowIso,
      )
      .run();

    if (params.action === 'REENABLE_USER') {
      await params.db
        .prepare('DELETE FROM sync_watermarks WHERE watermark_key = ?1')
        .bind(watermarkKey)
        .run();
    } else if (watermarkValue !== null) {
      await params.db
        .prepare(
          'INSERT OR REPLACE INTO sync_watermarks (watermark_key, watermark_value, updated_at_iso) VALUES (?1, ?2, ?3)',
        )
        .bind(watermarkKey, watermarkValue, nowIso)
        .run();
    }

    return {
      applied: true,
      idempotentReplay: false,
      watermarkKey,
      watermarkValue,
      eventId,
      statusCode: 200,
      reason: 'REVOCATION_RECORDED',
    };
  } catch {
    return {
      applied: false,
      idempotentReplay: false,
      watermarkKey,
      watermarkValue: null,
      eventId: '',
      statusCode: 503,
      reason: 'AUTH_REVOCATION_WRITE_FAILED',
    };
  }
}

export async function verifyFirebaseIdTokenOnEdge(params: {
  authorizationHeader: string | null | undefined;
  appCheckHeader?: string | null | undefined;
  appCheckDebugHeader?: string | null | undefined;
  request?: Request;
  env: WorkerEnv;
  nowSeconds?: number;
  requireVerifiedEmail?: boolean;
  sensitiveRoute?: boolean;
  appCheckFetchFn?: typeof fetch;
}): Promise<VerifiedFirebaseEdgePrincipal> {
  const unauthenticated = (
    reasonCode: string,
    statusCode: 401 | 403 | 503 = 401,
    extra?: Partial<VerifiedFirebaseEdgePrincipal>,
  ): VerifiedFirebaseEdgePrincipal => ({
    authenticated: false,
    uid: null,
    email: null,
    emailVerified: false,
    isAdmin: false,
    role: 'guest',
    authTimeSeconds: null,
    issuedAtSeconds: null,
    expiresAtSeconds: null,
    appCheckVerified: false,
    statusCode,
    reasonCode,
    ...extra,
  });

  const rawAuth = String(params.authorizationHeader || '').trim();
  if (!rawAuth.toLowerCase().startsWith('bearer ')) {
    return unauthenticated('MISSING_BEARER_TOKEN', 401);
  }
  const token = rawAuth.slice(7).trim();
  const segments = token.split('.');
  if (segments.length !== 3 || segments.some((s) => s.length === 0)) {
    return unauthenticated('MALFORMED_JWT', 401);
  }

  const header = decodeBase64UrlJson<{ alg?: string; kid?: string; typ?: string }>(segments[0]);
  const payload = decodeBase64UrlJson<{
    iss?: string;
    aud?: string;
    sub?: string;
    iat?: number;
    exp?: number;
    nbf?: number;
    auth_time?: number;
    email?: string;
    email_verified?: boolean;
    role?: string;
    admin?: boolean;
  }>(segments[1]);

  if (!header || !payload || header.alg !== 'RS256' || typeof header.kid !== 'string' || !header.kid.trim()) {
    return unauthenticated('INVALID_JWT_HEADER_OR_ALG', 401);
  }

  const projectId = (params.env.FIREBASE_PROJECT_ID || 'gen-lang-client-0713157837').trim();
  const expectedIssuer = `https://securetoken.google.com/${projectId}`;
  if (payload.iss !== expectedIssuer) {
    return unauthenticated('JWT_ISSUER_MISMATCH', 401);
  }
  if (payload.aud !== projectId) {
    return unauthenticated('JWT_AUDIENCE_MISMATCH', 401);
  }
  if (typeof payload.sub !== 'string' || payload.sub.trim().length === 0 || payload.sub.length > 128) {
    return unauthenticated('JWT_SUBJECT_INVALID', 401);
  }

  const nowSec = params.nowSeconds ?? Math.floor(Date.now() / 1000);
  const exp = Number(payload.exp);
  const iat = Number(payload.iat);
  const authTime = payload.auth_time !== undefined ? Number(payload.auth_time) : iat;
  if (!Number.isFinite(exp) || exp <= nowSec - DEFAULT_CLOCK_SKEW_SECONDS) {
    return unauthenticated('JWT_EXPIRED', 401);
  }
  if (!Number.isFinite(iat) || iat > nowSec + DEFAULT_CLOCK_SKEW_SECONDS) {
    return unauthenticated('JWT_ISSUED_IN_FUTURE', 401);
  }
  if (payload.nbf !== undefined && (!Number.isFinite(payload.nbf) || payload.nbf > nowSec + DEFAULT_CLOCK_SKEW_SECONDS)) {
    return unauthenticated('JWT_NOT_BEFORE_VIOLATION', 401);
  }
  if (!Number.isFinite(authTime) || authTime > nowSec + DEFAULT_CLOCK_SKEW_SECONDS) {
    return unauthenticated('JWT_AUTH_TIME_INVALID', 401);
  }

  let keyResolution = await resolvePublicCryptoKeyByKid(header.kid, params.env.RADAR_KV, false);
  if (!keyResolution.key && !keyResolution.dependencyError) {
    keyResolution = await resolvePublicCryptoKeyByKid(header.kid, params.env.RADAR_KV, true);
  }
  if (keyResolution.dependencyError) {
    return unauthenticated('JWKS_DEPENDENCY_UNAVAILABLE', 503);
  }
  if (!keyResolution.key) {
    return unauthenticated('JWKS_KEY_NOT_FOUND', 401);
  }

  const signedContent = new TextEncoder().encode(`${segments[0]}.${segments[1]}`);
  const signatureBytes = decodeBase64UrlToUint8Array(segments[2]);
  const signatureValid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    keyResolution.key,
    signatureBytes,
    signedContent,
  );
  if (!signatureValid) {
    return unauthenticated('JWT_SIGNATURE_INVALID', 401);
  }

  const revocation = await isTokenRevokedOrUserDisabled(payload.sub, iat, params.env.DB);
  if (revocation.unavailable) {
    return unauthenticated(revocation.reason || 'AUTH_REVOCATION_STORE_UNAVAILABLE', 503);
  }
  if (revocation.revoked) {
    return unauthenticated(revocation.reason || 'TOKEN_REVOKED', 401);
  }

  const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : null;
  const emailVerified = payload.email_verified === true;
  if ((params.requireVerifiedEmail ?? true) && !emailVerified) {
    return unauthenticated('EMAIL_NOT_VERIFIED', 403);
  }

  const configuredAdminEmail = (params.env.ADMIN_EMAIL || 'radio837isf@gmail.com').trim().toLowerCase();
  const isAdmin =
    emailVerified &&
    Boolean(email && (PRIMARY_ADMIN_EMAILS.has(email) || email === configuredAdminEmail));

  // Real cryptographic Firebase App Check verification (never structural 3-part regex).
  const appCheckMode = resolveWorkerAppCheckMode(params.env, {
    sensitiveRoute: params.sensitiveRoute ?? true,
  });
  const isProd = isWorkerProductionEnvironment(params.env);
  const debugAllowlist = String(params.env.FIREBASE_APP_CHECK_DEBUG_ALLOWLIST || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

  let appCheckRequest = params.request;
  if (!appCheckRequest) {
    const syntheticHeaders = new Headers();
    if (params.appCheckHeader) syntheticHeaders.set('x-firebase-appcheck', params.appCheckHeader);
    if (params.appCheckDebugHeader) syntheticHeaders.set('x-firebase-appcheck-debug', params.appCheckDebugHeader);
    appCheckRequest = new Request('https://radartehran.ir/_internal/app-check', { headers: syntheticHeaders });
  }

  // If mode is 'disabled' AND a token header was explicitly supplied, still verify cryptographically
  // so `appCheckVerified` truthfully reflects cryptographic validity rather than regex shape.
  const hasSuppliedAppCheckToken = Boolean(appCheckRequest.headers.get('x-firebase-appcheck')?.trim());
  const effectiveAppCheckEvalMode: AppCheckMode =
    appCheckMode === 'disabled' && hasSuppliedAppCheckToken ? 'monitor' : appCheckMode;

  const appCheckResult = await verifyWorkerAppCheck(appCheckRequest, {
    mode: effectiveAppCheckEvalMode,
    isProduction: isProd,
    expectedAppId: params.env.FIREBASE_APP_CHECK_APP_ID,
    expectedProjectId: projectId,
    expectedProjectNumber: params.env.FIREBASE_PROJECT_NUMBER,
    debugAllowlist,
    nowSeconds: nowSec,
    fetchFn: params.appCheckFetchFn,
  });

  if (!appCheckResult.allowed) {
    const failureStatus: 401 | 403 | 503 =
      appCheckResult.statusCode === 503 ? 503 : appCheckResult.statusCode === 403 ? 403 : 401;
    return unauthenticated(appCheckResult.reason, failureStatus, {
      appCheckMode,
      appCheckStatusCode: appCheckResult.statusCode,
      appCheckReason: appCheckResult.reason,
      appCheckVerified: false,
    });
  }

  const appCheckVerified = appCheckResult.reason === 'APP_CHECK_VERIFIED';

  return {
    authenticated: true,
    uid: payload.sub,
    email,
    emailVerified,
    isAdmin,
    role: isAdmin ? 'admin' : 'authenticated_user',
    authTimeSeconds: authTime,
    issuedAtSeconds: iat,
    expiresAtSeconds: exp,
    appCheckVerified,
    appCheckMode,
    appCheckStatusCode: appCheckResult.statusCode,
    appCheckReason: appCheckResult.reason,
    appCheckAppId: appCheckResult.appId,
    statusCode: 200,
    reasonCode: 'VERIFIED',
  };
}
