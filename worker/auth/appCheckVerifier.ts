/**
 * @file worker/auth/appCheckVerifier.ts
 * @description Cloudflare Worker & Web Crypto compatible Firebase App Check token verifier.
 * Enforces boundaries across 'disabled', 'monitor', and 'enforced' modes.
 */
import { getGoogleSigningKey, GOOGLE_FIREBASE_APP_CHECK_JWKS_URL } from './jwksClient';
import type { AppCheckMode, WorkerAppCheckContext } from './types';

function extractSingleHeader(
  headers: Headers,
  targetNameLower: string
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

export interface VerifyAppCheckOptions {
  readonly mode?: AppCheckMode;
  readonly isProduction?: boolean;
  readonly customVerifyFn?: (token: string) => Promise<{ appId: string }>;
}

export async function verifyWorkerAppCheck(
  request: Request,
  options?: VerifyAppCheckOptions
): Promise<WorkerAppCheckContext> {
  const mode: AppCheckMode = options?.mode ?? 'disabled';
  const isProduction = options?.isProduction ?? false;

  const debugHeaderResult = extractSingleHeader(request.headers, 'x-firebase-appcheck-debug');
  if (isProduction && debugHeaderResult.ok && debugHeaderResult.value) {
    return {
      allowed: false,
      mode,
      statusCode: 403,
      reason: 'APP_CHECK_DEBUG_TOKEN_FORBIDDEN_IN_PRODUCTION',
    };
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
  if (!token || token.length < 20 || token.length > 8192) {
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
      return {
        allowed: true,
        mode,
        appId: res.appId,
        statusCode: 200,
        reason: 'APP_CHECK_VERIFIED',
      };
    }

    // Standard App Check JWT verification
    const segments = token.split('.');
    if (segments.length !== 3) throw new Error('MALFORMED_APP_CHECK_JWT');
    const headerJson = atob(segments[0].replace(/-/g, '+').replace(/_/g, '/'));
    const header = JSON.parse(headerJson) as { alg: string; kid: string };
    if (header.alg !== 'RS256' || !header.kid) throw new Error('INVALID_APP_CHECK_HEADER');

    const signingKey = await getGoogleSigningKey(
      header.kid,
      GOOGLE_FIREBASE_APP_CHECK_JWKS_URL
    );
    if (!signingKey) throw new Error('APP_CHECK_KEY_NOT_FOUND');

    const signingInput = new TextEncoder().encode(`${segments[0]}.${segments[1]}`);
    const sigStr = atob(segments[2].replace(/-/g, '+').replace(/_/g, '/'));
    const sigBytes = new Uint8Array(sigStr.length);
    for (let i = 0; i < sigStr.length; i++) sigBytes[i] = sigStr.charCodeAt(i);

    const valid = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      signingKey,
      sigBytes,
      signingInput
    );
    if (!valid) throw new Error('APP_CHECK_SIGNATURE_INVALID');

    const payloadJson = atob(segments[1].replace(/-/g, '+').replace(/_/g, '/'));
    const payload = JSON.parse(payloadJson) as { app_id?: string; sub?: string; exp?: number };
    const nowSec = Math.floor(Date.now() / 1000);
    if (typeof payload.exp !== 'number' || payload.exp <= nowSec) {
      throw new Error('APP_CHECK_TOKEN_EXPIRED');
    }

    return {
      allowed: true,
      mode,
      appId: payload.app_id || payload.sub,
      statusCode: 200,
      reason: 'APP_CHECK_VERIFIED',
    };
  } catch {
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
      reason: 'INVALID_APP_CHECK_TOKEN',
    };
  }
}
