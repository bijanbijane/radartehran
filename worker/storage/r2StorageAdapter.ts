import type { D1Database, R2Bucket, R2ObjectBody, R2ObjectMetadata, R2PutOptions } from '../types';

export interface R2StoredMediaResult {
  id: string;
  objectKey: string;
  bucket: string;
  provider: 'r2';
  mediaType: 'image' | 'video';
  mimeType: string;
  sizeBytes: number;
  sha256Hex: string;
  url: string;
  remoteS3Synced: true;
  createdAtIso: string;
}

const SAFE_CITIES = new Set(['tehran', 'karaj', 'mashhad', 'isfahan', 'shiraz']);
const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
};

export async function computeSha256HexOnEdge(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function detectEdgeMediaMagicBytes(bytes: Uint8Array): {
  valid: boolean;
  mediaType?: 'image' | 'video';
  detectedMime?: string;
  reasonCode?: string;
} {
  if (bytes.byteLength < 12) return { valid: false, reasonCode: 'PAYLOAD_TOO_SMALL' };
  const headText = new TextDecoder('utf-8', { fatal: false }).decode(bytes.subarray(0, Math.min(512, bytes.byteLength))).toLowerCase();
  if (headText.includes('<svg') || headText.includes('<!doctype html') || headText.includes('<script') || headText.includes('<?xml')) {
    return { valid: false, reasonCode: 'FORBIDDEN_SVG_HTML_SCRIPT_PAYLOAD' };
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { valid: true, mediaType: 'image', detectedMime: 'image/jpeg' };
  }
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return { valid: true, mediaType: 'image', detectedMime: 'image/png' };
  }
  if (
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return { valid: true, mediaType: 'image', detectedMime: 'image/webp' };
  }
  if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
    const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
    return { valid: true, mediaType: 'video', detectedMime: brand === 'qt  ' ? 'video/quicktime' : 'video/mp4' };
  }
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {
    return { valid: true, mediaType: 'video', detectedMime: 'video/webm' };
  }
  return { valid: false, reasonCode: 'UNRECOGNIZED_MAGIC_BYTES' };
}

export function buildR2MediaObjectKey(params: {
  city: string;
  hoodId: number;
  mediaType: 'image' | 'video';
  mimeType: string;
  objectId: string;
}): string {
  const city = SAFE_CITIES.has(params.city) ? params.city : 'tehran';
  const hoodId = Math.max(1, Math.min(999, Math.trunc(params.hoodId) || 1));
  const ext = EXTENSION_BY_MIME[params.mimeType] || (params.mediaType === 'video' ? 'mp4' : 'webp');
  const now = new Date();
  const ym = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  return `listings/${city}/hood-${hoodId}/${params.mediaType}/${ym}/${params.objectId}.${ext}`;
}

export async function createSignedR2MediaUrl(params: {
  objectId: string;
  objectKey: string;
  method: 'GET' | 'PUT';
  mimeType: string;
  expiresInSeconds: number;
  signingSecret: string;
  nowSeconds?: number;
}): Promise<{ signedPath: string; expiresAtSeconds: number; signatureHex: string }> {
  const nowSec = params.nowSeconds ?? Math.floor(Date.now() / 1000);
  const exp = nowSec + Math.max(30, Math.min(3600, Math.trunc(params.expiresInSeconds)));
  const canonical = `${params.method}\n${params.objectId}\n${params.objectKey}\n${params.mimeType}\n${exp}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(params.signingSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sigBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(canonical));
  const signatureHex = Array.from(new Uint8Array(sigBuf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const signedPath = `/api/object-storage/file/${encodeURIComponent(params.objectId)}?key=${encodeURIComponent(params.objectKey)}&mime=${encodeURIComponent(params.mimeType)}&exp=${exp}&sig=${signatureHex}`;
  return { signedPath, expiresAtSeconds: exp, signatureHex };
}

export async function verifySignedR2MediaUrl(params: {
  objectId: string;
  objectKey: string;
  method: 'GET' | 'PUT';
  mimeType: string;
  expSeconds: number;
  signatureHex: string;
  signingSecret: string;
  nowSeconds?: number;
}): Promise<boolean> {
  const nowSec = params.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (!Number.isFinite(params.expSeconds) || params.expSeconds < nowSec) return false;
  const expected = await createSignedR2MediaUrl({
    objectId: params.objectId,
    objectKey: params.objectKey,
    method: params.method,
    mimeType: params.mimeType,
    expiresInSeconds: params.expSeconds - nowSec,
    signingSecret: params.signingSecret,
    nowSeconds: nowSec,
  });
  return expected.signatureHex === params.signatureHex.toLowerCase();
}

export async function isObjectUnderLegalHold(db: D1Database | undefined, objectId: string): Promise<boolean> {
  if (!db) return false;
  const row = await db
    .prepare('SELECT active, reason FROM legal_holds WHERE resource_id = ?1')
    .bind(objectId)
    .first<{ active: number; reason: string }>();
  return Boolean(row && Number(row.active) === 1);
}

export async function storeValidatedMediaInR2(params: {
  r2: R2Bucket;
  bucketName: string;
  ownerUid: string;
  city: string;
  hoodId: number;
  mediaType: 'image' | 'video';
  declaredMimeType: string;
  bytes: Uint8Array;
  maxImageMb?: number;
  maxVideoMb?: number;
}): Promise<{ ok: true; mediaObject: R2StoredMediaResult } | { ok: false; statusCode: number; errorCode: string }> {
  const magic = detectEdgeMediaMagicBytes(params.bytes);
  if (!magic.valid || !magic.detectedMime || magic.mediaType !== params.mediaType) {
    return { ok: false, statusCode: 415, errorCode: magic.reasonCode || 'MEDIA_SIGNATURE_MISMATCH' };
  }
  const maxMb = params.mediaType === 'video' ? (params.maxVideoMb ?? 50) : (params.maxImageMb ?? 10);
  if (params.bytes.byteLength > maxMb * 1024 * 1024) {
    return { ok: false, statusCode: 413, errorCode: 'MEDIA_SIZE_LIMIT_EXCEEDED' };
  }
  const randHex = Array.from(crypto.getRandomValues(new Uint8Array(4)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const objectId = `obj-${Date.now()}-${randHex}`;
  const objectKey = buildR2MediaObjectKey({
    city: params.city,
    hoodId: params.hoodId,
    mediaType: params.mediaType,
    mimeType: magic.detectedMime,
    objectId,
  });
  const sha256Hex = await computeSha256HexOnEdge(params.bytes);
  const createdAtIso = new Date().toISOString();
  await params.r2.put(objectKey, params.bytes, {
    httpMetadata: {
      contentType: magic.detectedMime,
      contentDisposition: `inline; filename="${objectId}.${EXTENSION_BY_MIME[magic.detectedMime] || 'bin'}"`,
      cacheControl: 'public, max-age=3600, must-revalidate',
    },
    customMetadata: {
      objectId,
      ownerUid: params.ownerUid,
      mediaType: params.mediaType,
      sha256Hex,
      createdAtIso,
    },
    sha256: sha256Hex,
  });

  return {
    ok: true,
    mediaObject: {
      id: objectId,
      objectKey,
      bucket: params.bucketName,
      provider: 'r2',
      mediaType: params.mediaType,
      mimeType: magic.detectedMime,
      sizeBytes: params.bytes.byteLength,
      sha256Hex,
      url: `/api/object-storage/file/${objectId}?key=${encodeURIComponent(objectKey)}`,
      remoteS3Synced: true,
      createdAtIso,
    },
  };
}

export async function deleteMediaFromR2WithLegalHoldCheck(params: {
  r2: R2Bucket;
  db?: D1Database;
  objectId: string;
  objectKey: string;
}): Promise<{ deleted: boolean; statusCode: 200 | 423; reasonCode: string }> {
  if (await isObjectUnderLegalHold(params.db, params.objectId)) {
    return { deleted: false, statusCode: 423, reasonCode: 'OBJECT_UNDER_LEGAL_HOLD' };
  }
  await params.r2.delete(params.objectKey);
  return { deleted: true, statusCode: 200, reasonCode: 'DELETED' };
}

/**
 * Deterministic in-memory Cloudflare R2 bucket simulator for local Worker & CI verification.
 */
export function createLocalR2BucketSimulator(): R2Bucket {
  const store = new Map<string, { bytes: Uint8Array; meta: R2ObjectMetadata }>();
  return {
    async put(key: string, value: Uint8Array | ArrayBuffer | string, options?: R2PutOptions): Promise<R2ObjectMetadata> {
      const bytes =
        typeof value === 'string'
          ? new TextEncoder().encode(value)
          : value instanceof Uint8Array
            ? new Uint8Array(value)
            : new Uint8Array(value);
      const meta: R2ObjectMetadata = {
        key,
        size: bytes.byteLength,
        etag: `"${bytes.byteLength.toString(16)}-${Date.now().toString(16)}"`,
        uploaded: new Date(),
        httpMetadata: options?.httpMetadata,
        customMetadata: options?.customMetadata,
      };
      store.set(key, { bytes, meta });
      return meta;
    },
    async get(key: string, options?: { range?: { offset: number; length?: number } }): Promise<R2ObjectBody | null> {
      const entry = store.get(key);
      if (!entry) return null;
      const start = options?.range?.offset ?? 0;
      const end = options?.range?.length !== undefined ? start + options.range.length : entry.bytes.byteLength;
      const sliced = entry.bytes.slice(start, Math.min(end, entry.bytes.byteLength));
      return {
        ...entry.meta,
        size: entry.bytes.byteLength,
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(sliced);
            controller.close();
          },
        }),
        async arrayBuffer() {
          return sliced.buffer.slice(sliced.byteOffset, sliced.byteOffset + sliced.byteLength);
        },
        async text() {
          return new TextDecoder().decode(sliced);
        },
      };
    },
    async head(key: string): Promise<R2ObjectMetadata | null> {
      return store.get(key)?.meta ?? null;
    },
    async delete(keys: string | string[]): Promise<void> {
      for (const k of Array.isArray(keys) ? keys : [keys]) {
        store.delete(k);
      }
    },
    async list(options?: { prefix?: string; limit?: number }): Promise<{ objects: R2ObjectMetadata[]; truncated: boolean }> {
      const prefix = options?.prefix || '';
      const objects = Array.from(store.values())
        .filter((e) => e.meta.key.startsWith(prefix))
        .map((e) => e.meta)
        .slice(0, options?.limit ?? 100);
      return { objects, truncated: false };
    },
  };
}
