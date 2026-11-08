/**
 * @file worker/auth/firebaseTokenVerifier.ts
 * @description Cloudflare Worker & Web Crypto compatible Firebase ID token verifier.
 * Strictly verifies RSA-SHA256 digital signatures, Google JWKS keys, issuer, audience,
 * subject, expiration, and auth_time without Node.js crypto or firebase-admin dependencies.
 */
import { getGoogleSigningKey, GOOGLE_FIREBASE_AUTH_JWKS_URL } from './jwksClient';
import type {
  FirebaseIdTokenClaims,
  FirebaseTokenHeader,
  TokenVerificationResult,
} from './types';

const CLOCK_SKEW_SECONDS = 60;
const MAX_TOKEN_BYTES = 12_000;
const MIN_TOKEN_BYTES = 16;

function base64UrlDecodeToString(input: string): string {
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const padLength = (4 - (base64.length % 4)) % 4;
  const padded = base64 + '='.repeat(padLength);
  return atob(padded);
}

function base64UrlDecodeToUint8Array(input: string): Uint8Array {
  const binaryString = base64UrlDecodeToString(input);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export interface JwtEnvelopeParseResult {
  readonly ok: boolean;
  readonly header?: FirebaseTokenHeader;
  readonly payload?: FirebaseIdTokenClaims;
  readonly signingInput?: Uint8Array;
  readonly signature?: Uint8Array;
  readonly status?: 400 | 401;
  readonly code?: TokenVerificationResult['code'];
  readonly reason?: string;
}

export function parseJwtEnvelope(idToken: string): JwtEnvelopeParseResult {
  if (
    !idToken ||
    idToken.length < MIN_TOKEN_BYTES ||
    idToken.length > MAX_TOKEN_BYTES ||
    /\s/.test(idToken)
  ) {
    return {
      ok: false,
      status: 401,
      code: 'INVALID_JWT_LENGTH',
      reason: 'طول توکن معتبر نیست.',
    };
  }

  const segments = idToken.split('.');
  if (segments.length !== 3 || segments.some((s) => s.length === 0)) {
    return {
      ok: false,
      status: 401,
      code: 'MALFORMED_JWT',
      reason: 'ساختار سه بخشی توکن معتبر نیست.',
    };
  }

  const [headerSeg, payloadSeg, signatureSeg] = segments;

  let header: FirebaseTokenHeader;
  let payload: FirebaseIdTokenClaims;
  try {
    header = JSON.parse(base64UrlDecodeToString(headerSeg)) as FirebaseTokenHeader;
    payload = JSON.parse(base64UrlDecodeToString(payloadSeg)) as FirebaseIdTokenClaims;
  } catch {
    return {
      ok: false,
      status: 401,
      code: 'MALFORMED_JWT',
      reason: 'بخش سرآیند یا داده توکن نامعتبر است.',
    };
  }

  if (header.alg !== 'RS256') {
    return {
      ok: false,
      status: 401,
      code: 'UNSUPPORTED_SIGNING_ALGORITHM',
      reason: 'الگوریتم امضای توکن باید RS256 باشد.',
    };
  }

  if (!header.kid || typeof header.kid !== 'string' || !header.kid.trim()) {
    return {
      ok: false,
      status: 401,
      code: 'MISSING_KEY_IDENTIFIER',
      reason: 'شناسه کلید امضا در سرآیند توکن وجود ندارد.',
    };
  }

  const signingInput = new TextEncoder().encode(`${headerSeg}.${payloadSeg}`);
  let signature: Uint8Array;
  try {
    signature = base64UrlDecodeToUint8Array(signatureSeg);
  } catch {
    return {
      ok: false,
      status: 401,
      code: 'INVALID_SIGNATURE',
      reason: 'امضای توکن نامعتبر است.',
    };
  }

  return {
    ok: true,
    header,
    payload,
    signingInput,
    signature,
  };
}

export interface VerifyFirebaseIdTokenOptions {
  readonly expectedProjectId: string;
  readonly nowSeconds?: number;
  readonly jwksUrl?: string;
  readonly fetchFn?: typeof fetch;
  readonly customKeyResolver?: (kid: string) => Promise<CryptoKey | null>;
  readonly checkRevoked?: boolean;
}

export async function verifyFirebaseIdToken(
  idToken: string,
  options: VerifyFirebaseIdTokenOptions
): Promise<TokenVerificationResult> {
  const envelope = parseJwtEnvelope(idToken);
  if (
    !envelope.ok ||
    !envelope.header ||
    !envelope.payload ||
    !envelope.signingInput ||
    !envelope.signature
  ) {
    return {
      valid: false,
      status: envelope.status || 401,
      code: envelope.code || 'MALFORMED_JWT',
      reason: envelope.reason || 'ساختار توکن معتبر نیست.',
    };
  }

  const { header, payload, signingInput, signature } = envelope;
  const nowSec = options.nowSeconds ?? Math.floor(Date.now() / 1000);

  // 1. Resolve RS256 public key
  let signingKey: CryptoKey | null = null;
  try {
    if (options.customKeyResolver) {
      signingKey = await options.customKeyResolver(header.kid);
    } else {
      signingKey = await getGoogleSigningKey(
        header.kid,
        options.jwksUrl ?? GOOGLE_FIREBASE_AUTH_JWKS_URL,
        { fetchFn: options.fetchFn }
      );
    }
  } catch {
    return {
      valid: false,
      status: 503,
      code: 'JWKS_FETCH_FAILED',
      reason: 'ارتباط با سرور کلیدهای امنیتی گوگل برقرار نشد.',
    };
  }

  if (!signingKey) {
    return {
      valid: false,
      status: 401,
      code: 'UNKNOWN_KEY_IDENTIFIER',
      reason: 'شناسه کلید امضا در میان کلیدهای معتبر گوگل یافت نشد.',
    };
  }

  // 2. Cryptographic signature verification via Web Crypto API
  let isSignatureValid = false;
  try {
    isSignatureValid = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      signingKey,
      signature,
      signingInput
    );
  } catch {
    isSignatureValid = false;
  }

  if (!isSignatureValid) {
    return {
      valid: false,
      status: 401,
      code: 'INVALID_SIGNATURE',
      reason: 'امضای دیجیتال توکن معتبر نیست.',
    };
  }

  // 3. Claims verification
  const expectedIss = `https://securetoken.google.com/${options.expectedProjectId}`;
  if (payload.iss !== expectedIss) {
    return {
      valid: false,
      status: 401,
      code: 'TOKEN_ISSUER_MISMATCH',
      reason: 'مرجع صادرکننده توکن با پروژه فایربیس مطابقت ندارد.',
    };
  }

  if (payload.aud !== options.expectedProjectId) {
    return {
      valid: false,
      status: 401,
      code: 'TOKEN_PROJECT_MISMATCH',
      reason: 'شناسه پروژه توکن با پروژه فایربیس رادار تهران مطابقت ندارد.',
    };
  }

  const subjectUid = String(payload.sub || payload.uid || '').trim();
  if (!subjectUid) {
    return {
      valid: false,
      status: 401,
      code: 'MISSING_SUBJECT_UID',
      reason: 'شناسه کاربر در توکن معتبر نیست.',
    };
  }

  if (typeof payload.exp !== 'number' || payload.exp <= nowSec - CLOCK_SKEW_SECONDS) {
    return {
      valid: false,
      status: 401,
      code: 'EXPIRED_FIREBASE_TOKEN',
      reason: 'اعتبار توکن کاربری منقضی شده است.',
    };
  }

  if (typeof payload.iat !== 'number' || payload.iat > nowSec + CLOCK_SKEW_SECONDS) {
    return {
      valid: false,
      status: 401,
      code: 'FUTURE_ISSUED_AT',
      reason: 'زمان صدور توکن در آینده است.',
    };
  }

  if (typeof payload.auth_time === 'number' && payload.auth_time > nowSec + CLOCK_SKEW_SECONDS) {
    return {
      valid: false,
      status: 401,
      code: 'FUTURE_AUTH_TIME',
      reason: 'زمان احراز هویت توکن در آینده است.',
    };
  }

  return {
    valid: true,
    status: 200,
    claims: payload,
    reason: 'توکن با موفقیت تأیید شد.',
  };
}
