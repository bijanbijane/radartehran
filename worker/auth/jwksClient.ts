/**
 * @file worker/auth/jwksClient.ts
 * @description Cloudflare Worker & Web Crypto compatible JWKS client for Google Firebase Authentication
 * and Firebase App Check public keys.
 * Enforces Cache-Control compliance, key rotation, fetch deduplication, and fail-closed error handling.
 */
import type { GoogleJwksResponse, JwkRsaKey } from './types';

export const GOOGLE_FIREBASE_AUTH_JWKS_URL =
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

export const GOOGLE_FIREBASE_APP_CHECK_JWKS_URL =
  'https://firebaseappcheck.googleapis.com/v1/jwks';

interface CachedJwksEntry {
  readonly keysByKid: ReadonlyMap<string, CryptoKey>;
  readonly expiresAtMs: number;
}

const jwksMemoryCache = new Map<string, CachedJwksEntry>();
const inFlightJwksFetches = new Map<string, Promise<ReadonlyMap<string, CryptoKey>>>();
let lastJwksFetchAttemptMs = 0;
const MIN_REFRESH_INTERVAL_MS = 10_000;

function parseMaxAgeSeconds(cacheControlHeader: string | null): number {
  if (!cacheControlHeader) return 3600;
  const match = /max-age=(\d+)/i.exec(cacheControlHeader);
  if (!match || !match[1]) return 3600;
  const parsed = Number(match[1]);
  if (!Number.isFinite(parsed) || parsed < 60) return 60;
  return Math.min(parsed, 86400);
}

export async function importRsaJwkToCryptoKey(jwk: JwkRsaKey): Promise<CryptoKey> {
  if (jwk.kty !== 'RSA' || !jwk.n || !jwk.e) {
    throw new Error('INVALID_RSA_JWK: Missing kty, n, or e parameter.');
  }

  return crypto.subtle.importKey(
    'jwk',
    {
      kty: 'RSA',
      n: jwk.n,
      e: jwk.e,
      alg: 'RS256',
      ext: true,
    },
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: { name: 'SHA-256' },
    },
    false,
    ['verify']
  );
}

async function fetchAndCacheJwks(
  jwksUrl: string,
  fetchFn: typeof fetch = fetch
): Promise<ReadonlyMap<string, CryptoKey>> {
  const response = await fetchFn(jwksUrl, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(6000),
  });

  if (!response.ok) {
    throw new Error(`JWKS_HTTP_ERROR: Status ${response.status} from ${jwksUrl}`);
  }

  const rawJson = (await response.json()) as GoogleJwksResponse;
  if (!rawJson || !Array.isArray(rawJson.keys) || rawJson.keys.length === 0) {
    throw new Error('JWKS_PARSE_ERROR: Empty or malformed keys array in JWKS response.');
  }

  const map = new Map<string, CryptoKey>();
  for (const key of rawJson.keys) {
    if (key.kid && key.kty === 'RSA') {
      try {
        const cryptoKey = await importRsaJwkToCryptoKey(key);
        map.set(key.kid, cryptoKey);
      } catch {
        // Skip unparseable individual key
      }
    }
  }

  if (map.size === 0) {
    throw new Error('JWKS_IMPORT_ERROR: Zero valid RS256 keys could be imported from JWKS.');
  }

  const maxAgeSec = parseMaxAgeSeconds(response.headers.get('cache-control'));
  const expiresAtMs = Date.now() + maxAgeSec * 1000;
  jwksMemoryCache.set(jwksUrl, { keysByKid: map, expiresAtMs });
  return map;
}

export async function getGoogleSigningKey(
  kid: string,
  jwksUrl: string = GOOGLE_FIREBASE_AUTH_JWKS_URL,
  options?: {
    forceRefresh?: boolean;
    fetchFn?: typeof fetch;
  }
): Promise<CryptoKey | null> {
  const nowMs = Date.now();
  const cached = jwksMemoryCache.get(jwksUrl);

  if (cached && !options?.forceRefresh && nowMs < cached.expiresAtMs) {
    const key = cached.keysByKid.get(kid);
    if (key) return key;
  }

  // Key rotation or miss: refresh if outside minimum interval
  if (nowMs - lastJwksFetchAttemptMs < MIN_REFRESH_INTERVAL_MS && cached) {
    return cached.keysByKid.get(kid) ?? null;
  }

  lastJwksFetchAttemptMs = nowMs;

  let inFlight = inFlightJwksFetches.get(jwksUrl);
  if (!inFlight) {
    inFlight = fetchAndCacheJwks(jwksUrl, options?.fetchFn).finally(() => {
      inFlightJwksFetches.delete(jwksUrl);
    });
    inFlightJwksFetches.set(jwksUrl, inFlight);
  }

  try {
    const freshMap = await inFlight;
    return freshMap.get(kid) ?? null;
  } catch (err) {
    // Fail-closed, but allow cached stale key if unexpired
    if (cached && nowMs < cached.expiresAtMs) {
      return cached.keysByKid.get(kid) ?? null;
    }
    throw err;
  }
}

export function resetJwksCacheForTests(): void {
  jwksMemoryCache.clear();
  inFlightJwksFetches.clear();
  lastJwksFetchAttemptMs = 0;
}

export function injectMockJwksKeysForTests(
  jwksUrl: string,
  keys: Record<string, CryptoKey>,
  ttlSeconds = 3600
): void {
  const map = new Map<string, CryptoKey>(Object.entries(keys));
  jwksMemoryCache.set(jwksUrl, {
    keysByKid: map,
    expiresAtMs: Date.now() + ttlSeconds * 1000,
  });
}
