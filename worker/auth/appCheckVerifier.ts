/**
 * @file worker/auth/appCheckVerifier.ts
 * @description Cloudflare Worker & Web Crypto compatible Firebase App Check token verifier.
 * Performs full RS256 JWKS signature verification, claim checks (exp, iat, iss, aud/app_id),
 * fail-closed 503 on JWKS dependency outage in enforced mode, and production debug-token rejection.
 */
import { getGoogleSigningKey, GOOGLE_FIREBASE_APP_CHECK_JWKS_URL } from './jwksClient';
import type { WorkerEnv } from '../types';
import type { AppCheckMode, WorkerAppCheckContext } from './types';

const APP_CHECK_CLOCK_SKEW_SECONDS = 60;
const APP_CHECK_ISSUER_PREFIX = 'https://firebaseappcheck.googleapis.com/';

function decodeBase64UrlToUint8Array(base64Url: string): Uint8Array {
  const normalized = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (normalized.length % 4)) % 4;
  const binary = atob(normalized + '='.repeat(padLen));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function decodeBase64UrlJson<T>(segment: string): T | null {
  try {
    const bytes = decodeBase64UrlToUint8Array(segment);
    return JSON.parse(new TextDecoder().decode(bytes)) as T;
  } catch {
    return null;
  }
}

function extractSingleHeader(
  headers: Headers,
  targetNameLower: string,
):
  | { ok: true; value: string | undefined; reason?: undefined }
  | { ok: false; value?: undefined; reason: 'AMBIGUOUS_APP_CHECK_HEADER' } {
  let matched: string | undefined;
  let count = 0;
  for (const [key, value] of headers.entries()) {
    if (key.toLowerCase() === targetNameLower) {
      count += 1;
      matched = value;
    }
  }
  if (count > 1) return { ok: false, reason: 'AMBIGUOUS_APP_CHECK_HEADER' };
  if (matched && (matched.includes(',') || /[\r\n\u0000]/.test(matched))) {
    return { ok: false, reason: 'AMBIGUOUS_APP_CHECK_HEADER' };
  }
  return { ok: true, value: matched ? matched.trim() : undefined };
}

export function resolveWorkerAppCheckMode(
  env: WorkerEnv,
  options?: { sensitiveRoute?: boolean },
): AppCheckMode {
  const explicit = String(env.FIREBASE_APP_CHECK_MODE || '').trim().toLowerCase();
  if (explicit === 'enforced') return 'enforced';
  if (explicit === 'monitor') return 'monitor';
  if (explicit === 'disabled') return 'disabled';
  const runtimeEnv = String(env.WORKER_ENV || env.ENVIRONMENT || env.APP_ENV || 'development')
    .trim()
    .toLowerCase();
  if (runtimeEnv === 'production') {
    return options?.sensitiveRoute === false ? 'monitor' : 'enforced';
  }
  if (runtimeEnv === 'staging') return 'monitor';
  return 'disabled';
}

export function isWorkerProductionEnvironment(env: WorkerEnv): boolean {
  const runtimeEnv = String(env.WORKER_ENV || env.ENVIRONMENT || env.APP_ENV || 'development')
    .trim()
    .toLowerCase();
  return runtimeEnv === 'production';
}

export interface VerifyAppCheckOptions {
  readonly mode?: AppCheckMode;
  readonly isProduction?: boolean;
  readonly expectedAppId?: string;
  readonly expectedProjectId?: string;
  readonly debugAllowlist?: readonly string[];
  readonly nowSeconds?: number;
  readonly fetchFn?: typeof fetch;
  readonly customVerifyFn?: (token: string) => Promise<{ appId: string }>;
}

interface AppCheckJwtPayload {
  readonly iss?: string;
  readonly aud?: string | readonly string[];
  readonly sub?: string;
  readonly app_id?: string;
  readonly iat?: number;
  readonly exp?: number;
}

function isJwksDependencyError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err || '');
  return (
    msg.includes('JWKS_HTTP_ERROR') ||
    msg.includes('JWKS_PARSE_ERROR') ||
    msg.includes('JWKS_IMPORT_ERROR') ||
    msg.includes('NETWORK') ||
    msg.includes('TIMEOUT') ||
    msg.includes('fetch') ||
    msg.includes('ECONNREFUSED')
  );
}

function matchesExpectedAppId(payload: AppCheckJwtPayload, expectedAppId: string): boolean {
  const trimmed = expectedAppId.trim();
  if (!trimmed) return true;
  const candidateAppId = (payload.app_id || payload.sub || '').trim();
  return candidateAppId === trimmed;
}

function matchesExpectedProjectAudience(payload: AppCheckJwtPayload, expectedProjectId: string): boolean {
  const trimmed = expectedProjectId.trim();
  if (!trimmed) return true;
  if (payload.aud === undefined) return true;
  const audList = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  return audList.some(
    (entry) =>
      typeof entry === 'string' &&
      (entry === `projects/${trimmed}` || entry === trimmed || entry.startsWith('projects/')),
  );
}

export async function verifyWorkerAppCheck(
  request: Request,
  options?: VerifyAppCheckOptions,
): Promise<WorkerAppCheckContext> {
  const mode: AppCheckMode = options?.mode ?? 'disabled';
  const isProduction = options?.isProduction ?? false;

  const debugHeaderResult = extractSingleHeader(request.headers, 'x-firebase-appcheck-debug');
  if (!debugHeaderResult.ok) {
    return {
      allowed: false,
      mode,
      statusCode: 401,
      reason: debugHeaderResult.reason,
    };
  }
  if (isProduction && debugHeaderResult.value) {
    return {
      allowed: false,
      mode,
      statusCode: 403,
      reason: 'APP_CHECK_DEBUG_TOKEN_FORBIDDEN_IN_PRODUCTION',
    };
  }
  if (!isProduction && debugHeaderResult.value && options?.debugAllowlist && options.debugAllowlist.length > 0) {
    if (options.debugAllowlist.includes(debugHeaderResult.value)) {
      return {
        allowed: true,
        mode,
        appId: options.expectedAppId || 'debug-allowlisted-app',
        statusCode: 200,
        reason: 'APP_CHECK_DEBUG_ALLOWLISTED',
      };
    }
  }

  if (mode === 'disabled') {
    return {
      allowed: true,
      mode: 'disabled',
      statusCode: 200,
      reason: 'APP_CHECK_DISABLED',
    };
  }

  const tokenHeaderResult = extractSingleHeader(request.headers, 'x-firebase-appcheck');
  if (!tokenHeaderResult.ok) {
    return {
      allowed: false,
      mode,
      statusCode: 401,
      reason: tokenHeaderResult.reason,
    };
  }

  const token = tokenHeaderResult.value;
  if (!token || token.length < 20 || token.length > 8192 || /\s/.test(token)) {
    if (mode === 'monitor') {
      return {
        allowed: true,
        mode: 'monitor',
        statusCode: 200,
        reason: 'APP_CHECK_MONITOR_MISSING_TOKEN',
      };
    }
    return {
      allowed: false,
      mode: 'enforced',
      statusCode: 401,
      reason: 'MISSING_APP_CHECK_TOKEN',
    };
  }

  try {
    if (options?.customVerifyFn) {
      const res = await options.customVerifyFn(token);
      if (options.expectedAppId && res.appId !== options.expectedAppId) {
        throw new Error('APP_CHECK_APP_ID_MISMATCH');
      }
      return {
        allowed: true,
        mode,
        appId: res.appId,
        statusCode: 200,
        reason: 'APP_CHECK_VERIFIED',
      };
    }

    const segments = token.split('.');
    if (segments.length !== 3 || segments.some((segment) => segment.length === 0)) {
      throw new Error('MALFORMED_APP_CHECK_JWT');
    }

    const header = decodeBase64UrlJson<{ alg?: string; kid?: string; typ?: string }>(segments[0]);
    const payload = decodeBase64UrlJson<AppCheckJwtPayload>(segments[1]);
    if (!header || !payload || header.alg !== 'RS256' || typeof header.kid !== 'string' || !header.kid.trim()) {
      throw new Error('INVALID_APP_CHECK_HEADER');
    }

    if (payload.iss !== undefined && (typeof payload.iss !== 'string' || !payload.iss.startsWith(APP_CHECK_ISSUER_PREFIX))) {
      throw new Error('APP_CHECK_ISSUER_MISMATCH');
    }

    const nowSec = options?.nowSeconds ?? Math.floor(Date.now() / 1000);
    if (typeof payload.exp !== 'number' || !Number.isFinite(payload.exp) || payload.exp <= nowSec - APP_CHECK_CLOCK_SKEW_SECONDS) {
      throw new Error('APP_CHECK_TOKEN_EXPIRED');
    }
    if (payload.iat !== undefined && (!Number.isFinite(payload.iat) || payload.iat > nowSec + APP_CHECK_CLOCK_SKEW_SECONDS)) {
      throw new Error('APP_CHECK_ISSUED_IN_FUTURE');
    }

    const resolvedAppId = (payload.app_id || payload.sub || '').trim();
    if (!resolvedAppId) {
      throw new Error('APP_CHECK_MISSING_APP_ID');
    }
    if (options?.expectedAppId && !matchesExpectedAppId(payload, options.expectedAppId)) {
      throw new Error('APP_CHECK_APP_ID_MISMATCH');
    }
    if (options?.expectedProjectId && !matchesExpectedProjectAudience(payload, options.expectedProjectId)) {
      throw new Error('APP_CHECK_PROJECT_MISMATCH');
    }

    let signingKey: CryptoKey | null;
    try {
      signingKey = await getGoogleSigningKey(header.kid, GOOGLE_FIREBASE_APP_CHECK_JWKS_URL, {
        fetchFn: options?.fetchFn,
      });
    } catch (jwksErr) {
      if (mode === 'monitor') {
        return {
          allowed: true,
          mode: 'monitor',
          statusCode: 200,
          reason: 'APP_CHECK_MONITOR_VERIFIER_UNAVAILABLE',
        };
      }
      return {
        allowed: false,
        mode: 'enforced',
        statusCode: 503,
        reason: isJwksDependencyError(jwksErr) ? 'APP_CHECK_VERIFIER_UNAVAILABLE' : 'APP_CHECK_JWKS_ERROR',
      };
    }

    if (!signingKey) {
      throw new Error('APP_CHECK_KEY_NOT_FOUND');
    }

    const signingInput = new TextEncoder().encode(`${segments[0]}.${segments[1]}`);
    const sigBytes = decodeBase64UrlToUint8Array(segments[2]);
    const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', signingKey, sigBytes, signingInput);
    if (!valid) {
      throw new Error('APP_CHECK_SIGNATURE_INVALID');
    }

    return {
      allowed: true,
      mode,
      appId: resolvedAppId,
      statusCode: 200,
      reason: 'APP_CHECK_VERIFIED',
    };
  } catch (err) {
    if (isJwksDependencyError(err)) {
      if (mode === 'monitor') {
        return {
          allowed: true,
          mode: 'monitor',
          statusCode: 200,
          reason: 'APP_CHECK_MONITOR_VERIFIER_UNAVAILABLE',
        };
      }
      return {
        allowed: false,
        mode: 'enforced',
        statusCode: 503,
        reason: 'APP_CHECK_VERIFIER_UNAVAILABLE',
      };
    }

    if (mode === 'monitor') {
      return {
        allowed: true,
        mode: 'monitor',
        statusCode: 200,
        reason: 'APP_CHECK_MONITOR_INVALID_TOKEN',
      };
    }
    return {
      allowed: false,
      mode: 'enforced',
      statusCode: 401,
      reason: err instanceof Error && err.message.startsWith('APP_CHECK_') ? err.message : 'INVALID_APP_CHECK_TOKEN',
    };
  }
}
