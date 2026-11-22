/**
 * @file worker/routes/objectStorageHelpers.ts
 * @description Validation, strict Base64 decoding, HTTP Range parsing, D1 rate-limit enforcement,
 * and upload quota helpers for the canonical Cloudflare Worker Object Storage routes.
 */
import { evaluateTieredWorkerRateLimit } from '../cache/kvAndEdgeRateLimiter';
import { jsonWorkerResponse } from '../contextAndSecurity';
import { resolveUserDb } from '../db/bindingResolver';
import type { D1Database, WorkerEnv, WorkerRequestContext } from '../types';

export const CANONICAL_CHUNK_SIZE_BYTES = 2 * 1024 * 1024; // 2 MiB
export const MAX_CHUNKS_PER_UPLOAD = 30;
export const UPLOAD_SESSION_TTL_MS = 15 * 60 * 1000;
export const MAX_ACTIVE_SESSIONS_PER_USER = 2;
export const MAX_ACTIVE_SESSIONS_GLOBAL = 25;
export const DEFAULT_MAX_IMAGE_MB = 10;
export const DEFAULT_MAX_VIDEO_MB = 50;

export const ALLOWED_UPLOAD_CITIES = new Set(['tehran', 'karaj', 'mashhad', 'isfahan', 'shiraz']);
export const ALLOWED_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
export const ALLOWED_VIDEO_MIME_TYPES = new Set(['video/mp4', 'video/webm', 'video/quicktime']);

const CANONICAL_BASE64_REGEX = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const OBJECT_ID_REGEX = /^[a-zA-Z0-9_-]{6,120}$/;

export function isValidObjectId(value: string): boolean {
  return OBJECT_ID_REGEX.test(value) && !value.includes('..') && !value.includes('/') && !value.includes('\\');
}

export function sanitizeUploadFileName(raw: unknown): string {
  const cleaned = String(raw || 'upload.bin')
    .replace(/[/\\<>:"|?*\u0000-\u001f]/g, '_')
    .replace(/\.{2,}/g, '.')
    .trim()
    .slice(0, 120);
  return cleaned || 'upload.bin';
}

export function resolveStorageLimits(env: WorkerEnv): { maxImageMb: number; maxVideoMb: number } {
  const img = Number(env.OBJECT_STORAGE_MAX_IMAGE_MB || DEFAULT_MAX_IMAGE_MB);
  const vid = Number(env.OBJECT_STORAGE_MAX_VIDEO_MB || DEFAULT_MAX_VIDEO_MB);
  return {
    maxImageMb: Number.isFinite(img) && img >= 1 && img <= 20 ? Math.trunc(img) : DEFAULT_MAX_IMAGE_MB,
    maxVideoMb: Number.isFinite(vid) && vid >= 5 && vid <= 100 ? Math.trunc(vid) : DEFAULT_MAX_VIDEO_MB,
  };
}

export function resolveObjectSigningSecret(env: WorkerEnv): string | null {
  const candidate = String(env.R2_SIGNING_SECRET || env.OBJECT_STORAGE_SIGNING_SECRET || '').trim();
  return candidate.length >= 16 ? candidate : null;
}

/**
 * Strict canonical Base64 decoding (strips optional data-URI prefix, validates RFC 4648 padding/alphabet).
 */
export function decodeStrictBase64(rawInput: unknown): { ok: true; bytes: Uint8Array; cleanBase64: string } | { ok: false; code: string } {
  if (typeof rawInput !== 'string') {
    return { ok: false, code: 'INVALID_BASE64_TYPE' };
  }
  const stripped = rawInput.replace(/^data:[^;]+;base64,/i, '').replace(/\s+/g, '');
  if (!stripped || stripped.length % 4 !== 0 || !CANONICAL_BASE64_REGEX.test(stripped)) {
    return { ok: false, code: 'INVALID_BASE64_ENCODING' };
  }
  try {
    const binary = atob(stripped);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    if (bytes.byteLength === 0) {
      return { ok: false, code: 'EMPTY_BINARY_PAYLOAD' };
    }
    return { ok: true, bytes, cleanBase64: stripped };
  } catch {
    return { ok: false, code: 'INVALID_BASE64_ENCODING' };
  }
}

export async function enforceObjectStorageRateLimit(params: {
  ctx: WorkerRequestContext;
  subjectKey: string;
  maxRequests: number;
  windowSeconds?: number;
}): Promise<Response | null> {
  const userDb = resolveUserDb(params.ctx.env);
  if (!userDb) {
    return jsonWorkerResponse(params.ctx, 503, {
      status: 'error',
      code: 'D1_DATABASE_NOT_BOUND',
      message: 'پایگاه داده D1 برای اعمال محدودیت نرخ و نشست‌های بارگذاری متصل نیست.',
    });
  }
  const result = await evaluateTieredWorkerRateLimit({
    tier: 'strong_durable',
    action: 'media_upload',
    subjectKey: params.subjectKey,
    maxRequests: params.maxRequests,
    windowSeconds: params.windowSeconds ?? 60,
    db: userDb,
  });
  if (!result.allowed) {
    return jsonWorkerResponse(
      params.ctx,
      429,
      {
        status: 'error',
        code: 'OBJECT_STORAGE_RATE_LIMITED',
        retryAfterSeconds: result.retryAfterSeconds,
        message: 'تعداد درخواست‌های بارگذاری بیش از حد مجاز است. لطفاً کمی بعد دوباره تلاش کنید.',
      },
      { extraHeaders: { 'Retry-After': String(result.retryAfterSeconds) } },
    );
  }
  return null;
}

export async function purgeExpiredUploadSessions(db: D1Database, nowMs: number = Date.now()): Promise<number> {
  const cutoffMs = nowMs - UPLOAD_SESSION_TTL_MS;
  const expired = await db
    .prepare('SELECT session_id FROM upload_sessions WHERE created_at_ms < ?1')
    .bind(cutoffMs)
    .all<{ session_id: string }>();
  for (const row of expired.results ?? []) {
    await db.prepare('DELETE FROM upload_session_chunks WHERE session_id = ?1').bind(row.session_id).run();
  }
  const delRes = await db.prepare('DELETE FROM upload_sessions WHERE created_at_ms < ?1').bind(cutoffMs).run();
  return delRes.meta?.changes ?? (expired.results?.length ?? 0);
}

export type ParsedByteRange =
  | { kind: 'none' }
  | { kind: 'valid'; start: number; end: number; length: number }
  | { kind: 'unsatisfiable' };

export function parseHttpByteRangeHeader(rangeHeader: string | null, totalSize: number): ParsedByteRange {
  if (!rangeHeader) return { kind: 'none' };
  const trimmed = rangeHeader.trim();
  if (!trimmed.toLowerCase().startsWith('bytes=') || trimmed.includes(',')) {
    return { kind: 'unsatisfiable' };
  }
  const spec = trimmed.slice(6).trim();
  const dashIdx = spec.indexOf('-');
  if (dashIdx === -1) return { kind: 'unsatisfiable' };

  const startStr = spec.slice(0, dashIdx).trim();
  const endStr = spec.slice(dashIdx + 1).trim();
  if (totalSize <= 0) return { kind: 'unsatisfiable' };

  if (startStr === '' && endStr !== '') {
    const suffixLen = Number(endStr);
    if (!Number.isInteger(suffixLen) || suffixLen <= 0) return { kind: 'unsatisfiable' };
    const clampedLen = Math.min(totalSize, suffixLen);
    const start = totalSize - clampedLen;
    return { kind: 'valid', start, end: totalSize - 1, length: clampedLen };
  }

  const start = Number(startStr);
  const end = endStr === '' ? totalSize - 1 : Number(endStr);
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start >= totalSize || end < start) {
    return { kind: 'unsatisfiable' };
  }
  const clampedEnd = Math.min(end, totalSize - 1);
  return { kind: 'valid', start, end: clampedEnd, length: clampedEnd - start + 1 };
}
