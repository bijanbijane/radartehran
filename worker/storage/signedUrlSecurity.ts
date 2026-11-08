/**
 * @file worker/storage/signedUrlSecurity.ts
 * @description Secure signed URL generation, HMAC-SHA256 verification,
 * replay protection, method restriction, and path-traversal prevention.
 *
 * Implements Cloudflare Worker-mediated signed URL generation using Web Crypto.
 * Does not expose internal R2 keys or cloud provider secrets.
 */

export interface SignedUrlOptions {
  storageKey: string;
  method?: 'GET' | 'PUT';
  expiresInSeconds?: number;
  expectedOwnerUid?: string;
  allowedIp?: string;
}

export interface SignedUrlPayload {
  readonly key: string;
  readonly method: 'GET' | 'PUT';
  readonly exp: number;
  readonly uid?: string;
  readonly sig: string;
}

export interface SignedUrlValidationResult {
  readonly valid: boolean;
  readonly key?: string;
  readonly method?: 'GET' | 'PUT';
  readonly ownerUid?: string;
  readonly errorCode?: string;
  readonly errorMessage?: string;
}

const DEFAULT_EXPIRATION_SECONDS = 900; // 15 minutes
const MAX_EXPIRATION_SECONDS = 3600; // 1 hour max

/**
 * Constant-time hex string comparison to prevent timing attacks.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function computeHmacSignature(message: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sigBuf = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(sigBuf), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Generate a cryptographically signed storage access URL.
 */
export async function createSignedStorageUrl(
  baseUrl: string,
  options: SignedUrlOptions,
  signingSecret: string
): Promise<string> {
  if (!signingSecret || signingSecret.length < 16) {
    throw new Error('SIGNING_SECRET_INSUFFICIENT_ENTROPY');
  }

  const key = options.storageKey.trim();
  if (!key || key.includes('..') || key.includes('\\')) {
    throw new Error('INVALID_STORAGE_KEY');
  }

  const method = options.method || 'GET';
  const duration = Math.min(MAX_EXPIRATION_SECONDS, Math.max(30, options.expiresInSeconds || DEFAULT_EXPIRATION_SECONDS));
  const exp = Math.floor(Date.now() / 1000) + duration;
  const uid = options.expectedOwnerUid ? options.expectedOwnerUid.trim() : '';

  const message = `${method}:${key}:${exp}:${uid}`;
  const sig = await computeHmacSignature(message, signingSecret);

  const cleanBase = baseUrl.replace(/\/+$/, '');
  const params = new URLSearchParams();
  params.set('key', key);
  params.set('method', method);
  params.set('exp', String(exp));
  if (uid) params.set('uid', uid);
  params.set('sig', sig);

  return `${cleanBase}/api/object-storage/signed-access?${params.toString()}`;
}

/**
 * Validate a signed access request URL or parameters.
 */
export async function verifySignedStorageUrl(
  urlOrParams: URL | URLSearchParams,
  currentMethod: string,
  signingSecret: string
): Promise<SignedUrlValidationResult> {
  if (!signingSecret) {
    return { valid: false, errorCode: 'SIGNING_SECRET_MISSING', errorMessage: 'Server signing key unconfigured.' };
  }

  const params = urlOrParams instanceof URL ? urlOrParams.searchParams : urlOrParams;
  const key = params.get('key');
  const allowedMethod = params.get('method') || 'GET';
  const expStr = params.get('exp');
  const uid = params.get('uid') || undefined;
  const clientSig = params.get('sig');

  if (!key || !expStr || !clientSig) {
    return { valid: false, errorCode: 'MISSING_SIGNATURE_PARAMS', errorMessage: 'Required signed URL parameters missing.' };
  }

  if (key.includes('..') || key.includes('\\') || key.includes('\0')) {
    return { valid: false, errorCode: 'PATH_TRAVERSAL_DETECTED', errorMessage: 'Illegal characters in storage key.' };
  }

  if (currentMethod.toUpperCase() !== allowedMethod.toUpperCase()) {
    return {
      valid: false,
      errorCode: 'HTTP_METHOD_NOT_PERMITTED',
      errorMessage: `Signed URL was authorized for ${allowedMethod}, not ${currentMethod}.`,
    };
  }

  const exp = Number(expStr);
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(exp) || exp < now) {
    return { valid: false, errorCode: 'SIGNED_URL_EXPIRED', errorMessage: 'Signed URL has expired.' };
  }

  const message = `${allowedMethod}:${key}:${exp}:${uid || ''}`;
  const expectedSig = await computeHmacSignature(message, signingSecret);

  if (!timingSafeEqual(expectedSig, clientSig)) {
    return { valid: false, errorCode: 'INVALID_SIGNATURE', errorMessage: 'Signature mismatch or tampering detected.' };
  }

  return {
    valid: true,
    key,
    method: allowedMethod as 'GET' | 'PUT',
    ownerUid: uid,
  };
}
