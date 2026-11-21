/**
 * @file worker/routes/objectStorageUploadHandlers.ts
 * @description Chunked (`upload-init`, `upload-chunk`, `upload-complete`) and direct small-file
 * (`upload`) handlers for the canonical Cloudflare Worker Object Storage routes.
 */
import { jsonWorkerResponse, readValidatedJsonBody } from '../contextAndSecurity';
import type { D1UploadSessionRecord } from '../db/d1SchemaAndMigrations';
import { storeValidatedMediaWithD1Saga } from '../storage/r2StorageAdapter';
import type { WorkerRequestContext } from '../types';
import {
  ALLOWED_IMAGE_MIME_TYPES,
  ALLOWED_UPLOAD_CITIES,
  ALLOWED_VIDEO_MIME_TYPES,
  CANONICAL_CHUNK_SIZE_BYTES,
  decodeStrictBase64,
  enforceObjectStorageRateLimit,
  MAX_ACTIVE_SESSIONS_GLOBAL,
  MAX_ACTIVE_SESSIONS_PER_USER,
  MAX_CHUNKS_PER_UPLOAD,
  purgeExpiredUploadSessions,
  sanitizeUploadFileName,
  UPLOAD_SESSION_TTL_MS,
} from './objectStorageHelpers';

export interface UploadHandlerContext {
  readonly ctx: WorkerRequestContext;
  readonly authUid: string;
  readonly isAdmin: boolean;
  readonly bucketName: string;
  readonly limits: { maxImageMb: number; maxVideoMb: number };
}

export async function handleChunkedAndDirectUploadRoutes(
  params: UploadHandlerContext,
): Promise<Response | null> {
  const { ctx, authUid, isAdmin, bucketName, limits } = params;
  const { pathname, env, request } = ctx;
  if (!env.DB || !env.MEDIA_BUCKET) return null;

  if (pathname === '/api/object-storage/upload-init') {
    const rateLimited = await enforceObjectStorageRateLimit({
      ctx,
      subjectKey: `init:${authUid}:${ctx.clientIp}`,
      maxRequests: 30,
    });
    if (rateLimited) return rateLimited;

    const parsed = await readValidatedJsonBody(request, 64 * 1024);
    if (!parsed.ok) {
      return jsonWorkerResponse(ctx, parsed.status, { status: 'error', code: parsed.code, message: parsed.messageFa });
    }
    const body = parsed.body;
    const mediaType = body.mediaType === 'video' ? 'video' : body.mediaType === 'image' ? 'image' : null;
    if (!mediaType) return jsonWorkerResponse(ctx, 400, { status: 'error', code: 'INVALID_MEDIA_TYPE' });

    const mimeType = String(body.mimeType || '').trim().toLowerCase();
    const allowedMimes = mediaType === 'video' ? ALLOWED_VIDEO_MIME_TYPES : ALLOWED_IMAGE_MIME_TYPES;
    if (!allowedMimes.has(mimeType)) {
      return jsonWorkerResponse(ctx, 415, { status: 'error', code: 'UNSUPPORTED_MEDIA_MIME_TYPE' });
    }
    const city = String(body.city || 'tehran').trim().toLowerCase();
    if (!ALLOWED_UPLOAD_CITIES.has(city)) return jsonWorkerResponse(ctx, 400, { status: 'error', code: 'INVALID_CITY' });

    const hoodId = Number(body.hoodId ?? 1);
    if (!Number.isInteger(hoodId) || hoodId < 1 || hoodId > 999) {
      return jsonWorkerResponse(ctx, 400, { status: 'error', code: 'INVALID_HOOD_ID' });
    }
    const totalChunks = Number(body.totalChunks);
    if (!Number.isInteger(totalChunks) || totalChunks < 1 || totalChunks > MAX_CHUNKS_PER_UPLOAD) {
      return jsonWorkerResponse(ctx, 400, { status: 'error', code: 'INVALID_TOTAL_CHUNKS' });
    }
    const hardMaxBytes = (mediaType === 'video' ? limits.maxVideoMb : limits.maxImageMb) * 1024 * 1024;
    const declaredTotalBytes = body.totalSizeBytes !== undefined ? Number(body.totalSizeBytes) : hardMaxBytes;
    if (!Number.isFinite(declaredTotalBytes) || declaredTotalBytes < 12 || declaredTotalBytes > hardMaxBytes) {
      return jsonWorkerResponse(ctx, 413, { status: 'error', code: 'DECLARED_SIZE_EXCEEDS_LIMIT' });
    }

    const nowMs = Date.now();
    await purgeExpiredUploadSessions(env.DB, nowMs);

    const userCountRow = await env.DB
      .prepare('SELECT COUNT(*) as cnt FROM upload_sessions WHERE owner_uid = ?1 AND completed = 0')
      .bind(authUid)
      .first<{ cnt: number }>();
    if (Number(userCountRow?.cnt ?? 0) >= MAX_ACTIVE_SESSIONS_PER_USER) {
      return jsonWorkerResponse(ctx, 429, { status: 'error', code: 'USER_UPLOAD_SESSION_QUOTA_EXCEEDED' });
    }
    const globalCountRow = await env.DB
      .prepare('SELECT COUNT(*) as cnt FROM upload_sessions WHERE completed = 0')
      .first<{ cnt: number }>();
    if (Number(globalCountRow?.cnt ?? 0) >= MAX_ACTIVE_SESSIONS_GLOBAL) {
      return jsonWorkerResponse(ctx, 429, { status: 'error', code: 'GLOBAL_UPLOAD_SESSION_QUOTA_EXCEEDED' });
    }

    const sessionId = `upl_${nowMs}_${crypto.randomUUID().slice(0, 10)}`;
    const fileName = sanitizeUploadFileName(body.fileName);
    await env.DB
      .prepare(
        `INSERT INTO upload_sessions (
          session_id, owner_uid, city_id, hood_id, media_type, mime_type, file_name,
          total_chunks, max_bytes, received_bytes, completed, created_at_ms
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)`,
      )
      .bind(sessionId, authUid, city, hoodId, mediaType, mimeType, fileName, totalChunks, Math.min(hardMaxBytes, Math.trunc(declaredTotalBytes)), 0, 0, nowMs)
      .run();

    return jsonWorkerResponse(ctx, 200, {
      status: 'ok',
      sessionId,
      totalChunks,
      maxChunkSizeBytes: CANONICAL_CHUNK_SIZE_BYTES,
      expiresAtIso: new Date(nowMs + UPLOAD_SESSION_TTL_MS).toISOString(),
      durablePersistence: 'd1_sqlite',
    });
  }

  if (pathname === '/api/object-storage/upload-chunk') {
    const rateLimited = await enforceObjectStorageRateLimit({
      ctx,
      subjectKey: `chunk:${authUid}:${ctx.clientIp}`,
      maxRequests: 180,
    });
    if (rateLimited) return rateLimited;

    const parsed = await readValidatedJsonBody(request, 3 * 1024 * 1024);
    if (!parsed.ok) {
      return jsonWorkerResponse(ctx, parsed.status, { status: 'error', code: parsed.code, message: parsed.messageFa });
    }
    const sessionId = String(parsed.body.sessionId || '').trim();
    const chunkIndex = Number(parsed.body.chunkIndex);
    const session = await env.DB
      .prepare('SELECT * FROM upload_sessions WHERE session_id = ?1')
      .bind(sessionId)
      .first<D1UploadSessionRecord>();
    if (!session) return jsonWorkerResponse(ctx, 404, { status: 'error', code: 'UPLOAD_SESSION_NOT_FOUND' });
    if (session.owner_uid !== authUid && !isAdmin) {
      return jsonWorkerResponse(ctx, 403, { status: 'error', code: 'SESSION_OWNER_MISMATCH' });
    }
    if (Number(session.completed) === 1) {
      return jsonWorkerResponse(ctx, 409, { status: 'error', code: 'UPLOAD_SESSION_ALREADY_COMPLETED' });
    }
    if (Date.now() - Number(session.created_at_ms) > UPLOAD_SESSION_TTL_MS) {
      await env.DB.prepare('DELETE FROM upload_session_chunks WHERE session_id = ?1').bind(sessionId).run();
      await env.DB.prepare('DELETE FROM upload_sessions WHERE session_id = ?1').bind(sessionId).run();
      return jsonWorkerResponse(ctx, 410, { status: 'error', code: 'UPLOAD_SESSION_EXPIRED' });
    }
    if (!Number.isInteger(chunkIndex) || chunkIndex < 0 || chunkIndex >= Number(session.total_chunks)) {
      return jsonWorkerResponse(ctx, 400, { status: 'error', code: 'INVALID_CHUNK_INDEX' });
    }

    const decoded = decodeStrictBase64(parsed.body.base64Data);
    if (decoded.ok === false) {
      return jsonWorkerResponse(ctx, 400, { status: 'error', code: decoded.code });
    }
    if (decoded.bytes.byteLength > CANONICAL_CHUNK_SIZE_BYTES) {
      return jsonWorkerResponse(ctx, 413, { status: 'error', code: 'CHUNK_SIZE_EXCEEDS_2MB_LIMIT' });
    }

    const existingChunk = await env.DB
      .prepare('SELECT chunk_index, chunk_base64, byte_length FROM upload_session_chunks WHERE session_id = ?1 AND chunk_index = ?2')
      .bind(sessionId, chunkIndex)
      .first<{ chunk_index: number; chunk_base64: string; byte_length: number }>();
    if (existingChunk) {
      if (existingChunk.byte_length === decoded.bytes.byteLength && existingChunk.chunk_base64 === decoded.cleanBase64) {
        return jsonWorkerResponse(ctx, 200, {
          status: 'ok',
          sessionId,
          chunkIndex,
          byteLength: existingChunk.byte_length,
          idempotentReplay: true,
        });
      }
      return jsonWorkerResponse(ctx, 409, { status: 'error', code: 'DUPLICATE_CHUNK_CONFLICT' });
    }

    const budgetRes = await env.DB
      .prepare('UPDATE upload_sessions SET received_bytes = received_bytes + ?1 WHERE session_id = ?2 AND completed = 0 AND received_bytes + ?1 <= max_bytes')
      .bind(decoded.bytes.byteLength, sessionId)
      .run();
    if ((budgetRes.meta?.changes ?? 0) === 0) {
      return jsonWorkerResponse(ctx, 413, { status: 'error', code: 'CUMULATIVE_UPLOAD_SIZE_EXCEEDED' });
    }

    await env.DB
      .prepare('INSERT OR IGNORE INTO upload_session_chunks (session_id, chunk_index, chunk_base64, byte_length) VALUES (?1, ?2, ?3, ?4)')
      .bind(sessionId, chunkIndex, decoded.cleanBase64, decoded.bytes.byteLength)
      .run();

    return jsonWorkerResponse(ctx, 200, {
      status: 'ok',
      sessionId,
      chunkIndex,
      byteLength: decoded.bytes.byteLength,
      idempotentReplay: false,
    });
  }

  if (pathname === '/api/object-storage/upload-complete') {
    const rateLimited = await enforceObjectStorageRateLimit({
      ctx,
      subjectKey: `complete:${authUid}:${ctx.clientIp}`,
      maxRequests: 30,
    });
    if (rateLimited) return rateLimited;

    const parsed = await readValidatedJsonBody(request, 64 * 1024);
    if (!parsed.ok) {
      return jsonWorkerResponse(ctx, parsed.status, { status: 'error', code: parsed.code, message: parsed.messageFa });
    }
    const sessionId = String(parsed.body.sessionId || '').trim();
    const session = await env.DB
      .prepare('SELECT * FROM upload_sessions WHERE session_id = ?1')
      .bind(sessionId)
      .first<D1UploadSessionRecord>();
    if (!session) return jsonWorkerResponse(ctx, 404, { status: 'error', code: 'UPLOAD_SESSION_NOT_FOUND' });
    if (session.owner_uid !== authUid && !isAdmin) {
      return jsonWorkerResponse(ctx, 403, { status: 'error', code: 'SESSION_OWNER_MISMATCH' });
    }
    if (Date.now() - Number(session.created_at_ms) > UPLOAD_SESSION_TTL_MS) {
      await env.DB.prepare('DELETE FROM upload_session_chunks WHERE session_id = ?1').bind(sessionId).run();
      await env.DB.prepare('DELETE FROM upload_sessions WHERE session_id = ?1').bind(sessionId).run();
      return jsonWorkerResponse(ctx, 410, { status: 'error', code: 'UPLOAD_SESSION_EXPIRED' });
    }

    const chunksRes = await env.DB
      .prepare('SELECT chunk_index, chunk_base64, byte_length FROM upload_session_chunks WHERE session_id = ?1 ORDER BY chunk_index ASC')
      .bind(sessionId)
      .all<{ chunk_index: number; chunk_base64: string; byte_length: number }>();
    const chunks = chunksRes.results ?? [];
    if (chunks.length !== Number(session.total_chunks)) {
      return jsonWorkerResponse(ctx, 400, {
        status: 'error',
        code: 'INCOMPLETE_UPLOAD_CHUNKS',
        receivedChunks: chunks.length,
        expectedChunks: Number(session.total_chunks),
      });
    }
    for (let i = 0; i < chunks.length; i += 1) {
      if (Number(chunks[i].chunk_index) !== i) {
        return jsonWorkerResponse(ctx, 400, { status: 'error', code: 'MISSING_CONTIGUOUS_CHUNK_INDEX' });
      }
    }

    const claimComplete = await env.DB
      .prepare('UPDATE upload_sessions SET completed = 1 WHERE session_id = ?1 AND completed = 0')
      .bind(sessionId)
      .run();
    if ((claimComplete.meta?.changes ?? 0) === 0) {
      return jsonWorkerResponse(ctx, 409, { status: 'error', code: 'UPLOAD_SESSION_ALREADY_COMPLETED' });
    }

    const decodedParts: Uint8Array[] = [];
    let totalBytes = 0;
    const hardLimit = (session.media_type === 'video' ? limits.maxVideoMb : limits.maxImageMb) * 1024 * 1024;
    const maxAllowed = Math.min(Number(session.max_bytes), hardLimit);
    for (const row of chunks) {
      const dec = decodeStrictBase64(row.chunk_base64);
      if (!dec.ok) return jsonWorkerResponse(ctx, 400, { status: 'error', code: 'CORRUPTED_STORED_CHUNK' });
      totalBytes += dec.bytes.byteLength;
      if (totalBytes > maxAllowed) {
        return jsonWorkerResponse(ctx, 413, { status: 'error', code: 'CUMULATIVE_UPLOAD_SIZE_EXCEEDED' });
      }
      decodedParts.push(dec.bytes);
    }

    const assembled = new Uint8Array(totalBytes);
    let offset = 0;
    for (const part of decodedParts) {
      assembled.set(part, offset);
      offset += part.byteLength;
    }

    const stored = await storeValidatedMediaWithD1Saga({
      r2: env.MEDIA_BUCKET,
      db: env.DB,
      bucketName,
      ownerUid: session.owner_uid,
      city: session.city_id,
      hoodId: Number(session.hood_id),
      mediaType: session.media_type === 'video' ? 'video' : 'image',
      declaredMimeType: session.mime_type,
      bytes: assembled,
      maxImageMb: limits.maxImageMb,
      maxVideoMb: limits.maxVideoMb,
    });

    await env.DB.prepare('DELETE FROM upload_session_chunks WHERE session_id = ?1').bind(sessionId).run();
    await env.DB.prepare('DELETE FROM upload_sessions WHERE session_id = ?1').bind(sessionId).run();

    if (stored.ok === false) {
      return jsonWorkerResponse(ctx, stored.statusCode, { status: 'error', code: stored.errorCode });
    }
    return jsonWorkerResponse(ctx, 200, { status: 'ok', sessionId, mediaObject: stored.mediaObject });
  }

  if (pathname === '/api/object-storage/upload') {
    const rateLimited = await enforceObjectStorageRateLimit({
      ctx,
      subjectKey: `direct:${authUid}:${ctx.clientIp}`,
      maxRequests: 30,
    });
    if (rateLimited) return rateLimited;

    const parsed = await readValidatedJsonBody(request, 14 * 1024 * 1024);
    if (!parsed.ok) {
      return jsonWorkerResponse(ctx, parsed.status, { status: 'error', code: parsed.code, message: parsed.messageFa });
    }
    const mediaType = parsed.body.mediaType === 'video' ? 'video' : 'image';
    const mimeType = String(parsed.body.mimeType || (mediaType === 'video' ? 'video/mp4' : 'image/webp')).trim().toLowerCase();
    const decoded = decodeStrictBase64(parsed.body.base64Data ?? parsed.body.dataBase64);
    if (decoded.ok === false) {
      return jsonWorkerResponse(ctx, 400, { status: 'error', code: decoded.code });
    }
    if (mediaType === 'video' && decoded.bytes.byteLength > CANONICAL_CHUNK_SIZE_BYTES) {
      return jsonWorkerResponse(ctx, 413, {
        status: 'error',
        code: 'USE_CHUNKED_UPLOAD_FLOW',
        message: 'برای بارگذاری ویدیوهای بزرگ‌تر از ۲ مگابایت از جریان چندبخشی استفاده کنید.',
      });
    }
    if (decoded.bytes.byteLength > limits.maxImageMb * 1024 * 1024) {
      return jsonWorkerResponse(ctx, 413, { status: 'error', code: 'USE_CHUNKED_UPLOAD_FLOW' });
    }

    const stored = await storeValidatedMediaWithD1Saga({
      r2: env.MEDIA_BUCKET,
      db: env.DB,
      bucketName,
      ownerUid: authUid,
      city: String(parsed.body.city || 'tehran').trim().toLowerCase(),
      hoodId: Number(parsed.body.hoodId || 1),
      mediaType,
      declaredMimeType: mimeType,
      bytes: decoded.bytes,
      maxImageMb: limits.maxImageMb,
      maxVideoMb: limits.maxVideoMb,
    });
    if (stored.ok === false) {
      return jsonWorkerResponse(ctx, stored.statusCode, { status: 'error', code: stored.errorCode });
    }
    return jsonWorkerResponse(ctx, 200, { status: 'ok', mediaObject: stored.mediaObject });
  }

  return null;
}
