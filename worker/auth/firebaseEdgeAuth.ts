import type { D1Database, KVNamespace, WorkerEnv } from '../types';

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
  statusCode: 200 | 401 | 403;
  reasonCode: string;
}

export interface FirebaseJwkKey extends JsonWebKey {
  kid: string;
  alg?: string;
  use?: string;
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
  for (let i = 0; i < binary.length; i++) {
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
): Promise<CryptoKey | null> {
  if (testOverrideJwks.has(kid)) {
    return testOverrideJwks.get(kid) ?? null;
  }
  const now = Date.now();
  if (!forceRefresh && cachedJwks && cachedJwks.expiresAtMs > now && cachedJwks.keysByKid.has(kid)) {
    return cachedJwks.keysByKid.get(kid) ?? null;
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
      if (!response.ok) return null;
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
      return null;
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
    return map.get(kid) ?? null;
  } catch {
    return null;
  }
}

export async function isTokenRevokedOrUserDisabled(
  uid: string,
  issuedAtSeconds: number,
  db?: D1Database,
): Promise<{ revoked: boolean; reason?: string }> {
  if (!db) return { revoked: false };
  try {
    const row = await db
      .prepare('SELECT watermark_value FROM sync_watermarks WHERE watermark_key = ?1')
      .bind(`revoked_uid:${uid}`)
      .first<{ watermark_value: string }>();
    if (!row || !row.watermark_value) return { revoked: false };
    if (row.watermark_value === 'DISABLED') {
      return { revoked: true, reason: 'USER_ACCOUNT_DISABLED' };
    }
    const validSinceSeconds = Number(row.watermark_value);
    if (Number.isFinite(validSinceSeconds) && issuedAtSeconds < validSinceSeconds) {
      return { revoked: true, reason: 'TOKEN_REVOKED_BEFORE_VALID_SINCE' };
    }
    return { revoked: false };
  } catch {
    return { revoked: false };
  }
}

export async function verifyFirebaseIdTokenOnEdge(params: {
  authorizationHeader: string | null | undefined;
  appCheckHeader?: string | null | undefined;
  env: WorkerEnv;
  nowSeconds?: number;
  requireVerifiedEmail?: boolean;
}): Promise<VerifiedFirebaseEdgePrincipal> {
  const unauthenticated = (reasonCode: string, statusCode: 401 | 403 = 401): VerifiedFirebaseEdgePrincipal => ({
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

  let cryptoKey = await resolvePublicCryptoKeyByKid(header.kid, params.env.RADAR_KV, false);
  if (!cryptoKey) {
    cryptoKey = await resolvePublicCryptoKeyByKid(header.kid, params.env.RADAR_KV, true);
  }
  if (!cryptoKey) {
    return unauthenticated('JWKS_KEY_NOT_FOUND', 401);
  }

  const signedContent = new TextEncoder().encode(`${segments[0]}.${segments[1]}`);
  const signatureBytes = decodeBase64UrlToUint8Array(segments[2]);
  const signatureValid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    signatureBytes,
    signedContent,
  );
  if (!signatureValid) {
    return unauthenticated('JWT_SIGNATURE_INVALID', 401);
  }

  const revocation = await isTokenRevokedOrUserDisabled(payload.sub, iat, params.env.DB);
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

  const rawAppCheck = String(params.appCheckHeader || '').trim();
  const appCheckVerified = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(rawAppCheck);

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
    statusCode: 200,
    reasonCode: 'VERIFIED',
  };
}
