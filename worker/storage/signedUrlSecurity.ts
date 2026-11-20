/**
 * @file worker/storage/signedUrlSecurity.ts
 * @description Canonical constant-time HMAC-SHA256 signed URL generation and verification
 * for Cloudflare Worker R2 media access. Single source of truth for signed URL primitives.
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
 * Constant-time string comparison to prevent timing side-channel attacks.
 */
export function timingSafeEqualHex(a: string, b: string): boolean {
  const normA = a.toLowerCase();
  const normB = b.toLowerCase();
  const maxLen = Math.max(normA.length, normB.length);
  let diff = normA.length ^ normB.length;
  for (let i = 0; i < maxLen; i += 1) {
    const charA = i < normA.length ? normA.charCodeAt(i) : 0;
    const charB = i < normB.length ? normB.charCodeAt(i) : 0;
    diff |= charA ^ charB;
  }
  return diff === 0 && normA.length > 0;
}

/**
 * Canonical Web Crypto HMAC-SHA256 hex digest generator shared by all Worker storage signers.
 */
export async function computeHmacSha256Hex(message: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sigBuf = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(sigBuf), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Generate a canonical signed file-access URL bound to `objectId` (never exposing internal R2 keys).
 */
export async function createCanonicalObjectSignedUrl(params: {
  objectId: string;
  method?: 'GET';
  expiresInSeconds?: number;
  signingSecret: string;
  nowSeconds?: number;
}): Promise<{ signedPath: string; expiresAtSeconds: number; signatureHex: string }> {
  if (!params.signingSecret || params.signingSecret.length < 16) {
    throw new Error('SIGNING_SECRET_INSUFFICIENT_ENTROPY');
  }
  const objectId = params.objectId.trim();
  if (!objectId || !/^[a-zA-Z0-9_-]{6,120}$/.test(objectId)) {
    throw new Error('INVALID_OBJECT_ID');
  }
  const method = params.method || 'GET';
  const nowSec = params.nowSeconds ?? Math.floor(Date.now() / 1000);
  const duration = Math.min(MAX_EXPIRATION_SECONDS, Math.max(30, Math.trunc(params.expiresInSeconds ?? DEFAULT_EXPIRATION_SECONDS)));
  const exp = nowSec + duration;
  const canonicalMessage = `v2:${method}:${objectId}:${exp}`;
  const signatureHex = await computeHmacSha256Hex(canonicalMessage, params.signingSecret);
  const signedPath = `/api/object-storage/file/${encodeURIComponent(objectId)}?exp=${exp}&sig=${signatureHex}`;
  return { signedPath, expiresAtSeconds: exp, signatureHex };
}

/**
 * Verify a canonical signed file-access request bound to `objectId` using constant-time comparison.
 */
export async function verifyCanonicalObjectSignedUrl(params: {
  objectId: string;
  method: string;
  expSeconds: number;
  signatureHex: string;
  signingSecret: string;
  nowSeconds?: number;
}): Promise<{ valid: boolean; errorCode?: string }> {
  if (!params.signingSecret || params.signingSecret.length < 16) {
    return { valid: false, errorCode: 'SIGNING_SECRET_MISSING' };
  }
  if (params.method.toUpperCase() !== 'GET') {
    return { valid: false, errorCode: 'HTTP_METHOD_NOT_PERMITTED' };
  }
  const nowSec = params.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (!Number.isFinite(params.expSeconds) || params.expSeconds < nowSec) {
    return { valid: false, errorCode: 'SIGNED_URL_EXPIRED' };
  }
  const canonicalMessage = `v2:GET:${params.objectId.trim()}:${Math.trunc(params.expSeconds)}`;
  const expectedSig = await computeHmacSha256Hex(canonicalMessage, params.signingSecret);
  if (!timingSafeEqualHex(expectedSig, params.signatureHex.trim())) {
    return { valid: false, errorCode: 'INVALID_SIGNATURE' };
  }
  return { valid: true };
}

/**
 * Generate a cryptographically signed storage access URL (storage-key scoped contract).
 */
export async function createSignedStorageUrl(
  baseUrl: string,
  options: SignedUrlOptions,
  signingSecret: string,
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
  const sig = await computeHmacSha256Hex(message, signingSecret);

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
  signingSecret: string,
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
  const expectedSig = await computeHmacSha256Hex(message, signingSecret);

  if (!timingSafeEqualHex(expectedSig, clientSig)) {
    return { valid: false, errorCode: 'INVALID_SIGNATURE', errorMessage: 'Signature mismatch or tampering detected.' };
  }

  return {
    valid: true,
    key,
    method: allowedMethod as 'GET' | 'PUT',
    ownerUid: uid,
  };
}
