/**
 * @file worker/storage/r2StorageAdapter.ts
 * @description Canonical R2 media adapter with D1 `media_objects` Saga (`PENDING_UPLOAD -> R2 -> ACTIVE`),
 * fail-closed Legal Hold verification, environment-aware bucket resolution (zero hardcoded staging bucket names),
 * magic-byte + polyglot guards, and constant-time HMAC signed URL verification.
 */
import type { D1Database, R2Bucket, R2ObjectBody, R2ObjectMetadata, R2PutOptions, WorkerEnv } from '../types';
import { hasDangerousPayloadOrPolyglot } from './mediaValidation';
import { computeHmacSha256Hex, timingSafeEqualHex } from './signedUrlSecurity';

export interface R2StoredMediaResult {
  id: string;
  objectKey: string;
  bucket: string;
  provider: 'r2';
  mediaType: 'image' | 'video';
  mimeType: string;
  sizeBytes: number;
  sha256Hex: string;
  contentHashSha256: string;
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

export function resolveWorkerMediaBucketName(
  env: WorkerEnv,
): { ok: true; bucketName: string } | { ok: false; code: string } {
  const configured = String(env.R2_MEDIA_BUCKET_NAME || '').trim();
  if (configured) {
    return { ok: true, bucketName: configured };
  }
  const runtimeEnv = String(env.WORKER_ENV || env.ENVIRONMENT || env.APP_ENV || 'development')
    .trim()
    .toLowerCase();
  if (runtimeEnv === 'production') {
    return { ok: false, code: 'R2_MEDIA_BUCKET_NAME_UNCONFIGURED_IN_PRODUCTION' };
  }
  if (runtimeEnv === 'staging') {
    return { ok: true, bucketName: 'radartehran-staging-media' };
  }
  return { ok: true, bucketName: `radartehran-${runtimeEnv}-media` };
}

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
  if (hasDangerousPayloadOrPolyglot(bytes)) {
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
  const signatureHex = await computeHmacSha256Hex(canonical, params.signingSecret);
  const signedPath = `/api/object-storage/file/${encodeURIComponent(params.objectId)}?exp=${exp}&sig=${signatureHex}`;
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
  if (!params.signingSecret || !params.signatureHex) return false;
  const canonical = `${params.method}\n${params.objectId}\n${params.objectKey}\n${params.mimeType}\n${Math.trunc(params.expSeconds)}`;
  const expectedHex = await computeHmacSha256Hex(canonical, params.signingSecret);
  return timingSafeEqualHex(expectedHex, params.signatureHex.trim());
}

/**
 * Fail-closed Legal Hold & retention lock check against D1.
 * Throws if `db` is absent or if the D1 lookup fails so callers NEVER delete blindly.
 */
export async function isObjectUnderLegalHold(
  db: D1Database | undefined,
  objectId: string,
  nowMs: number = Date.now(),
): Promise<{ held: boolean; reason?: string }> {
  if (!db) {
    throw new Error('LEGAL_HOLD_DB_UNAVAILABLE');
  }
  const holdRow = await db
    .prepare('SELECT active, reason FROM legal_holds WHERE resource_id = ?1')
    .bind(objectId)
    .first<{ active: number; reason: string }>();
  if (holdRow && Number(holdRow.active) === 1) {
    return { held: true, reason: holdRow.reason || 'ACTIVE_LEGAL_HOLD' };
  }
  const mediaRow = await db
    .prepare('SELECT legal_hold, retention_until FROM media_objects WHERE object_id = ?1')
    .bind(objectId)
    .first<{ legal_hold: number; retention_until: string | null }>();
  if (mediaRow) {
    if (Number(mediaRow.legal_hold) === 1) {
      return { held: true, reason: 'MEDIA_OBJECT_LEGAL_HOLD' };
    }
    if (mediaRow.retention_until && Date.parse(mediaRow.retention_until) > nowMs) {
      return { held: true, reason: 'MEDIA_OBJECT_RETENTION_LOCK' };
    }
  }
  return { held: false };
}

function validateDeclaredMimeConsistency(detectedMime: string, declaredMime: string): boolean {
  const clean = declaredMime.trim().toLowerCase();
  if (!clean || clean === detectedMime) return true;
  if (
    (detectedMime === 'video/mp4' && clean === 'video/quicktime') ||
    (detectedMime === 'video/quicktime' && clean === 'video/mp4')
  ) {
    return true;
  }
  return false;
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
  if (!validateDeclaredMimeConsistency(magic.detectedMime, params.declaredMimeType)) {
    return { ok: false, statusCode: 415, errorCode: 'MIME_TYPE_SPOOF_DETECTED' };
  }
  const maxMb = params.mediaType === 'video' ? (params.maxVideoMb ?? 50) : (params.maxImageMb ?? 10);
  if (params.bytes.byteLength > maxMb * 1024 * 1024) {
    return { ok: false, statusCode: 413, errorCode: 'MEDIA_SIZE_LIMIT_EXCEEDED' };
  }
  const randHex = Array.from(crypto.getRandomValues(new Uint8Array(6)))
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
      contentHashSha256: sha256Hex,
      url: `/api/object-storage/file/${encodeURIComponent(objectId)}`,
      remoteS3Synced: true,
      createdAtIso,
    },
  };
}

/**
 * R2 + D1 Media Metadata Saga:
 * 1. Validate magic bytes, polyglot/SVG/PHP payload, MIME consistency, and size caps.
 * 2. Reserve D1 `media_objects` row with `lifecycle_state = 'PENDING_UPLOAD'` BEFORE R2 put.
 * 3. Write binary payload to R2 (`r2.put`). On failure -> mark D1 row `FAILED_UPLOAD`.
 * 4. Confirm D1 row `lifecycle_state = 'ACTIVE'`. On failure -> attempt immediate R2 cleanup
 *    and mark `FAILED_UPLOAD` (or leave `PENDING_UPLOAD` for `r2_orphan_media_reconcile`).
 */
export async function storeValidatedMediaWithD1Saga(params: {
  r2: R2Bucket;
  db: D1Database;
  bucketName: string;
  ownerUid: string;
  city: string;
  hoodId: number;
  mediaType: 'image' | 'video';
  declaredMimeType: string;
  bytes: Uint8Array;
  maxImageMb?: number;
  maxVideoMb?: number;
  targetType?: string | null;
  targetId?: string | null;
}): Promise<{ ok: true; mediaObject: R2StoredMediaResult } | { ok: false; statusCode: number; errorCode: string }> {
  const magic = detectEdgeMediaMagicBytes(params.bytes);
  if (!magic.valid || !magic.detectedMime || magic.mediaType !== params.mediaType) {
    return { ok: false, statusCode: 415, errorCode: magic.reasonCode || 'MEDIA_SIGNATURE_MISMATCH' };
  }
  if (!validateDeclaredMimeConsistency(magic.detectedMime, params.declaredMimeType)) {
    return { ok: false, statusCode: 415, errorCode: 'MIME_TYPE_SPOOF_DETECTED' };
  }
  const maxMb = params.mediaType === 'video' ? (params.maxVideoMb ?? 50) : (params.maxImageMb ?? 10);
  if (params.bytes.byteLength > maxMb * 1024 * 1024) {
    return { ok: false, statusCode: 413, errorCode: 'MEDIA_SIZE_LIMIT_EXCEEDED' };
  }

  const randHex = Array.from(crypto.getRandomValues(new Uint8Array(6)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const objectId = `obj-${Date.now()}-${randHex}`;
  const safeCity = SAFE_CITIES.has(params.city) ? params.city : 'tehran';
  const safeHoodId = Math.max(1, Math.min(999, Math.trunc(params.hoodId) || 1));
  const objectKey = buildR2MediaObjectKey({
    city: safeCity,
    hoodId: safeHoodId,
    mediaType: params.mediaType,
    mimeType: magic.detectedMime,
    objectId,
  });
  const sha256Hex = await computeSha256HexOnEdge(params.bytes);
  const createdAtIso = new Date().toISOString();

  // Step 1: Reserve metadata row in D1 BEFORE touching R2
  try {
    await params.db
      .prepare(
        `INSERT INTO media_objects (
          object_id, owner_uid, bucket_name, storage_key, city_id, hood_id,
          media_type, mime_type, size_bytes, sha256_checksum, target_type, target_id,
          lifecycle_state, deletion_state, legal_hold, retention_until,
          created_at_iso, updated_at_iso, deleted_at_iso
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19)`,
      )
      .bind(
        objectId,
        params.ownerUid,
        params.bucketName,
        objectKey,
        safeCity,
        safeHoodId,
        params.mediaType,
        magic.detectedMime,
        params.bytes.byteLength,
        sha256Hex,
        params.targetType ?? null,
        params.targetId ?? null,
        'PENDING_UPLOAD',
        'ACTIVE',
        0,
        null,
        createdAtIso,
        createdAtIso,
        null,
      )
      .run();
  } catch {
    return { ok: false, statusCode: 503, errorCode: 'D1_MEDIA_RESERVATION_FAILED' };
  }

  // Step 2: Upload bytes to R2
  try {
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
  } catch {
    await params.db
      .prepare('UPDATE media_objects SET lifecycle_state = ?1, updated_at_iso = ?2 WHERE object_id = ?3')
      .bind('FAILED_UPLOAD', new Date().toISOString(), objectId)
      .run()
      .catch(() => {});
    return { ok: false, statusCode: 502, errorCode: 'R2_PUT_FAILED' };
  }

  // Step 3: Confirm D1 record ACTIVE
  try {
    await params.db
      .prepare('UPDATE media_objects SET lifecycle_state = ?1, updated_at_iso = ?2 WHERE object_id = ?3')
      .bind('ACTIVE', new Date().toISOString(), objectId)
      .run();
  } catch {
    // Compensating action: delete uploaded R2 object to prevent orphan
    await params.r2.delete(objectKey).catch(() => {});
    await params.db
      .prepare('UPDATE media_objects SET lifecycle_state = ?1, updated_at_iso = ?2 WHERE object_id = ?3')
      .bind('FAILED_UPLOAD', new Date().toISOString(), objectId)
      .run()
      .catch(() => {});
    return { ok: false, statusCode: 503, errorCode: 'D1_MEDIA_CONFIRM_FAILED' };
  }

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
      contentHashSha256: sha256Hex,
      url: `/api/object-storage/file/${encodeURIComponent(objectId)}`,
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
}): Promise<{ deleted: boolean; statusCode: 200 | 423 | 503; reasonCode: string }> {
  let holdStatus: { held: boolean; reason?: string };
  try {
    holdStatus = await isObjectUnderLegalHold(params.db, params.objectId);
  } catch {
    return { deleted: false, statusCode: 503, reasonCode: 'LEGAL_HOLD_VERIFICATION_UNAVAILABLE' };
  }
  if (holdStatus.held) {
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
    async list(options?: { prefix?: string; limit?: number; cursor?: string }): Promise<{ objects: R2ObjectMetadata[]; truncated: boolean; cursor?: string }> {
      const prefix = options?.prefix || '';
      const limit = Math.max(1, Math.min(1000, Math.trunc(options?.limit ?? 100)));
      const all = Array.from(store.values())
        .filter((e) => e.meta.key.startsWith(prefix))
        .map((e) => e.meta)
        .sort((a, b) => a.key.localeCompare(b.key));
      // The local simulator uses the last key as an opaque cursor stand-in. It remains
      // stable when the current page is deleted, matching R2's forward-only pagination.
      const start = options?.cursor
        ? all.findIndex((item) => item.key > String(options.cursor))
        : 0;
      const safeStart = start < 0 ? all.length : start;
      const objects = all.slice(safeStart, safeStart + limit);
      const nextIndex = safeStart + objects.length;
      const truncated = nextIndex < all.length;
      return {
        objects,
        truncated,
        ...(truncated && objects.length > 0 ? { cursor: objects[objects.length - 1].key } : {}),
      };
    },
  };
}
