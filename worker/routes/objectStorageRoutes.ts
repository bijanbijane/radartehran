/**
 * @file worker/routes/objectStorageRoutes.ts
 * @description Single canonical Cloudflare Worker handler for all `/api/object-storage/*` routes.
 * Delegates upload flows to `objectStorageUploadHandlers.ts` and handles status, R2 file reads
 * (Range 206/416 + signed URL), fail-closed Legal Hold deletions, and bargain media attach/cleanup.
 */
import { isUserWriteBlockedInD1 } from '../account-lifecycle/d1MutationPermit';
import { authenticateWorkerSession } from '../auth/sessionAuth';
import { buildWorkerJsonHeaders, jsonWorkerResponse, readValidatedJsonBody } from '../contextAndSecurity';
import { resolveUserDb } from '../db/bindingResolver';
import type { D1MediaObjectRecord } from '../db/d1SchemaAndMigrations';
import {
  isObjectUnderLegalHold,
  resolveWorkerMediaBucketName,
  verifySignedR2MediaUrl,
} from '../storage/r2StorageAdapter';
import { verifyCanonicalObjectSignedUrl } from '../storage/signedUrlSecurity';
import type { WorkerRequestContext } from '../types';
import {
  CANONICAL_CHUNK_SIZE_BYTES,
  isValidObjectId,
  MAX_CHUNKS_PER_UPLOAD,
  parseHttpByteRangeHeader,
  resolveObjectSigningSecret,
  resolveStorageLimits,
} from './objectStorageHelpers';
import { handleChunkedAndDirectUploadRoutes } from './objectStorageUploadHandlers';

async function authenticateUploadCaller(ctx: WorkerRequestContext) {
  return authenticateWorkerSession(ctx, true);
}

export async function handleObjectStorageRoute(
  ctx: WorkerRequestContext,
  routeParams: Record<string, string> = {},
): Promise<Response | null> {
  const { method, pathname, env, request, url } = ctx;
  if (!pathname.startsWith('/api/object-storage/')) return null;
  const limits = resolveStorageLimits(env);

  const userDb = resolveUserDb(env);

  // 1. Public sanitized storage capabilities
  if (method === 'GET' && pathname === '/api/object-storage/status') {
    const bucketRes = resolveWorkerMediaBucketName(env);
    return jsonWorkerResponse(ctx, 200, {
      status: 'ok',
      provider: 'r2',
      providerLabelFa: 'ذخیره‌سازی ابری Cloudflare R2',
      r2Bound: Boolean(env.MEDIA_BUCKET),
      d1Bound: Boolean(userDb),
      bucketConfigured: bucketRes.ok,
      chunkedUploadSupported: true,
      chunkSizeBytes: CANONICAL_CHUNK_SIZE_BYTES,
      maxChunks: MAX_CHUNKS_PER_UPLOAD,
      maxImageMb: limits.maxImageMb,
      maxVideoMb: limits.maxVideoMb,
    });
  }

  // 2. GET /api/object-storage/file/:objectId (D1 lookup + auth/signed URL + Range 206/416)
  if (method === 'GET' && pathname.startsWith('/api/object-storage/file/')) {
    const objectId = (
      routeParams.objectId ||
      routeParams.id ||
      decodeURIComponent(pathname.slice('/api/object-storage/file/'.length))
    ).trim();
    if (!isValidObjectId(objectId)) {
      return jsonWorkerResponse(ctx, 400, { status: 'error', code: 'INVALID_OBJECT_ID' });
    }
    if (!userDb || !env.MEDIA_BUCKET) {
      return jsonWorkerResponse(ctx, 503, { status: 'error', code: 'STORAGE_BACKING_SERVICES_UNAVAILABLE' });
    }
    const record = await userDb
      .prepare('SELECT * FROM media_objects WHERE object_id = ?1')
      .bind(objectId)
      .first<D1MediaObjectRecord>();
    if (!record || record.lifecycle_state !== 'ACTIVE' || record.deletion_state !== 'ACTIVE') {
      return jsonWorkerResponse(ctx, 404, { status: 'error', code: 'MEDIA_OBJECT_NOT_FOUND' });
    }

    let authorized = false;
    const expParam = url.searchParams.get('exp');
    const sigParam = url.searchParams.get('sig');
    if (expParam && sigParam) {
      const signingSecret = resolveObjectSigningSecret(env);
      if (!signingSecret) {
        return jsonWorkerResponse(ctx, 403, { status: 'error', code: 'SIGNED_URL_VERIFICATION_UNAVAILABLE' });
      }
      const expSeconds = Number(expParam);
      const canonicalCheck = await verifyCanonicalObjectSignedUrl({
        objectId: record.object_id,
        method: 'GET',
        expSeconds,
        signatureHex: sigParam,
        signingSecret,
      });
      if (canonicalCheck.valid) {
        authorized = true;
      } else {
        const legacyR2Valid = await verifySignedR2MediaUrl({
          objectId: record.object_id,
          objectKey: record.storage_key,
          method: 'GET',
          mimeType: record.mime_type,
          expSeconds,
          signatureHex: sigParam,
          signingSecret,
        });
        if (!legacyR2Valid) {
          return jsonWorkerResponse(ctx, 403, {
            status: 'error',
            code: canonicalCheck.errorCode || 'INVALID_SIGNED_URL',
          });
        }
        authorized = true;
      }
    } else if (record.target_type === 'bargain' && record.target_id) {
      authorized = true;
    } else {
      const auth = await authenticateWorkerSession(ctx, false);
      if (auth.authenticated && (auth.uid === record.owner_uid || auth.isAdmin)) {
        authorized = true;
      } else {
        return jsonWorkerResponse(ctx, auth.statusCode === 503 ? 503 : auth.authenticated ? 403 : 401, {
          status: 'error',
          code: auth.authenticated ? 'MEDIA_ACCESS_FORBIDDEN' : auth.reasonCode || 'UNAUTHORIZED',
        });
      }
    }
    if (!authorized) return jsonWorkerResponse(ctx, 403, { status: 'error', code: 'MEDIA_ACCESS_FORBIDDEN' });

    const headObj = await env.MEDIA_BUCKET.head(record.storage_key);
    if (!headObj) return jsonWorkerResponse(ctx, 404, { status: 'error', code: 'MEDIA_BYTES_NOT_FOUND' });

    const totalSize = headObj.size;
    const rangeParsed = parseHttpByteRangeHeader(request.headers.get('range'), totalSize);
    if (rangeParsed.kind === 'unsatisfiable') {
      const headers = buildWorkerJsonHeaders(ctx, { cacheControl: 'no-store' });
      headers.set('Content-Range', `bytes */${totalSize}`);
      headers.set('Accept-Ranges', 'bytes');
      return new Response(null, { status: 416, headers });
    }

    const r2Obj =
      rangeParsed.kind === 'valid'
        ? await env.MEDIA_BUCKET.get(record.storage_key, { range: { offset: rangeParsed.start, length: rangeParsed.length } })
        : await env.MEDIA_BUCKET.get(record.storage_key);
    if (!r2Obj) return jsonWorkerResponse(ctx, 404, { status: 'error', code: 'MEDIA_BYTES_NOT_FOUND' });

    const headers = new Headers();
    headers.set('Content-Type', record.mime_type);
    headers.set('Accept-Ranges', 'bytes');
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Cache-Control', 'private, max-age=300');
    headers.set('ETag', r2Obj.etag);
    headers.set('X-Request-Id', ctx.requestId);
    headers.set('X-Correlation-Id', ctx.correlationId);

    if (rangeParsed.kind === 'valid') {
      headers.set('Content-Range', `bytes ${rangeParsed.start}-${rangeParsed.end}/${totalSize}`);
      headers.set('Content-Length', String(rangeParsed.length));
      return new Response(r2Obj.body, { status: 206, headers });
    }
    headers.set('Content-Length', String(totalSize));
    return new Response(r2Obj.body, { status: 200, headers });
  }

  // 3. DELETE /api/object-storage/file/:objectId (Fail-closed Legal Hold + tombstone -> R2 -> finalize)
  if (method === 'DELETE' && pathname.startsWith('/api/object-storage/file/')) {
    const objectId = (
      routeParams.objectId ||
      routeParams.id ||
      decodeURIComponent(pathname.slice('/api/object-storage/file/'.length))
    ).trim();
    if (!isValidObjectId(objectId)) {
      return jsonWorkerResponse(ctx, 400, { status: 'error', code: 'INVALID_OBJECT_ID' });
    }
    if (!userDb || !env.MEDIA_BUCKET) {
      return jsonWorkerResponse(ctx, 503, { status: 'error', code: 'STORAGE_BACKING_SERVICES_UNAVAILABLE' });
    }
    const auth = await authenticateUploadCaller(ctx);
    if (!auth.authenticated || !auth.uid) {
      return jsonWorkerResponse(ctx, auth.statusCode === 200 ? 401 : auth.statusCode, {
        status: 'error',
        code: auth.reasonCode || 'UNAUTHORIZED',
      });
    }
    if (!auth.isAdmin && (await isUserWriteBlockedInD1(userDb, auth.uid))) {
      return jsonWorkerResponse(ctx, 423, {
        status: 'error',
        code: 'ACCOUNT_WRITE_BLOCKED',
        message: 'حساب کاربری در حال حذف است و تغییرات رسانه مسدود شده است.',
      });
    }
    const record = await userDb
      .prepare('SELECT * FROM media_objects WHERE object_id = ?1')
      .bind(objectId)
      .first<D1MediaObjectRecord>();
    if (!record) return jsonWorkerResponse(ctx, 404, { status: 'error', code: 'MEDIA_OBJECT_NOT_FOUND' });
    if (record.owner_uid !== auth.uid && !auth.isAdmin) {
      return jsonWorkerResponse(ctx, 403, { status: 'error', code: 'MEDIA_OWNER_MISMATCH' });
    }
    if (record.deletion_state === 'PHYSICALLY_DELETED') {
      return jsonWorkerResponse(ctx, 200, { status: 'ok', id: objectId, alreadyDeleted: true });
    }

    let holdStatus: { held: boolean; reason?: string };
    try {
      holdStatus = await isObjectUnderLegalHold(userDb, objectId);
    } catch {
      return jsonWorkerResponse(ctx, 503, { status: 'error', code: 'LEGAL_HOLD_VERIFICATION_UNAVAILABLE' });
    }
    if (holdStatus.held) {
      return jsonWorkerResponse(ctx, 423, {
        status: 'error',
        code: 'LEGAL_HOLD_ACTIVE',
        reason: holdStatus.reason || 'OBJECT_UNDER_LEGAL_HOLD',
      });
    }

    const nowIso = new Date().toISOString();
    await userDb
      .prepare('UPDATE media_objects SET lifecycle_state = ?1, deletion_state = ?2, updated_at_iso = ?3 WHERE object_id = ?4')
      .bind('PENDING_DELETE', 'PENDING_PHYSICAL_DELETE', nowIso, objectId)
      .run();
    try {
      await env.MEDIA_BUCKET.delete(record.storage_key);
    } catch {
      return jsonWorkerResponse(ctx, 502, { status: 'error', code: 'R2_DELETE_FAILED_SCHEDULED_RECONCILE', id: objectId });
    }
    const finalIso = new Date().toISOString();
    await userDb
      .prepare('UPDATE media_objects SET lifecycle_state = ?1, deletion_state = ?2, updated_at_iso = ?3, deleted_at_iso = ?4 WHERE object_id = ?5')
      .bind('DELETED', 'PHYSICALLY_DELETED', finalIso, finalIso, objectId)
      .run();
    return jsonWorkerResponse(ctx, 200, { status: 'ok', id: objectId, deleted: true });
  }

  // 4. Authenticated POST mutations
  if (method !== 'POST') return null;
  if (!userDb || !env.MEDIA_BUCKET) {
    return jsonWorkerResponse(ctx, 503, {
      status: 'error',
      code: !userDb ? 'D1_DATABASE_NOT_BOUND' : 'R2_MEDIA_BUCKET_NOT_BOUND',
    });
  }
  const bucketRes = resolveWorkerMediaBucketName(env);
  if (!bucketRes.ok) return jsonWorkerResponse(ctx, 503, { status: 'error', code: bucketRes.code });

  const auth = await authenticateUploadCaller(ctx);
  if (!auth.authenticated || !auth.uid) {
    return jsonWorkerResponse(ctx, auth.statusCode === 200 ? 401 : auth.statusCode, {
      status: 'error',
      code: auth.reasonCode || 'UNAUTHORIZED',
    });
  }
  if (!auth.isAdmin && (await isUserWriteBlockedInD1(userDb, auth.uid))) {
    return jsonWorkerResponse(ctx, 423, {
      status: 'error',
      code: 'ACCOUNT_WRITE_BLOCKED',
      message: 'حساب کاربری در حال حذف است و بارگذاری یا تغییر رسانه مسدود شده است.',
    });
  }

  const uploadResponse = await handleChunkedAndDirectUploadRoutes({
    ctx,
    authUid: auth.uid,
    isAdmin: auth.isAdmin,
    bucketName: bucketRes.bucketName,
    limits,
  });
  if (uploadResponse) return uploadResponse;

  // 4E. POST /api/object-storage/attach-to-bargain
  if (pathname === '/api/object-storage/attach-to-bargain') {
    const parsed = await readValidatedJsonBody(request, 64 * 1024);
    if (!parsed.ok) {
      return jsonWorkerResponse(ctx, parsed.status, { status: 'error', code: parsed.code, message: parsed.messageFa });
    }
    const bargainId = String(parsed.body.bargainId || '').trim();
    const mediaIds = Array.isArray(parsed.body.mediaIds)
      ? parsed.body.mediaIds.map((id) => String(id || '').trim()).filter(isValidObjectId)
      : [];
    if (!bargainId || bargainId.length > 120 || mediaIds.length === 0 || mediaIds.length > 20) {
      return jsonWorkerResponse(ctx, 400, { status: 'error', code: 'INVALID_ATTACH_PARAMETERS' });
    }
    const attachedIds: string[] = [];
    const nowIso = new Date().toISOString();
    for (const objectId of mediaIds) {
      const rec = await userDb
        .prepare('SELECT * FROM media_objects WHERE object_id = ?1')
        .bind(objectId)
        .first<D1MediaObjectRecord>();
      if (!rec || rec.lifecycle_state !== 'ACTIVE' || rec.deletion_state !== 'ACTIVE') {
        return jsonWorkerResponse(ctx, 404, { status: 'error', code: 'MEDIA_OBJECT_NOT_FOUND', objectId });
      }
      if (rec.owner_uid !== auth.uid && !auth.isAdmin) {
        return jsonWorkerResponse(ctx, 403, { status: 'error', code: 'MEDIA_OWNER_MISMATCH', objectId });
      }
      await userDb
        .prepare('UPDATE media_objects SET target_type = ?1, target_id = ?2, updated_at_iso = ?3 WHERE object_id = ?4')
        .bind('bargain', bargainId, nowIso, objectId)
        .run();
      attachedIds.push(objectId);
    }
    return jsonWorkerResponse(ctx, 200, { status: 'ok', bargainId, attachedIds });
  }

  // 4F. POST /api/object-storage/cleanup-bargain/:bargainId
  if (pathname.startsWith('/api/object-storage/cleanup-bargain/')) {
    const bargainId = (
      routeParams.bargainId || decodeURIComponent(pathname.slice('/api/object-storage/cleanup-bargain/'.length))
    ).trim();
    if (!bargainId || bargainId.length > 120) {
      return jsonWorkerResponse(ctx, 400, { status: 'error', code: 'INVALID_BARGAIN_ID' });
    }
    const rowsRes = await userDb
      .prepare('SELECT * FROM media_objects WHERE target_type = ?1 AND target_id = ?2')
      .bind('bargain', bargainId)
      .all<D1MediaObjectRecord>();
    const rows = rowsRes.results ?? [];
    for (const rec of rows) {
      if (rec.owner_uid !== auth.uid && !auth.isAdmin) {
        return jsonWorkerResponse(ctx, 403, { status: 'error', code: 'MEDIA_OWNER_MISMATCH', objectId: rec.object_id });
      }
    }
    const deletedIds: string[] = [];
    const skippedLegalHoldIds: string[] = [];
    for (const rec of rows) {
      if (rec.deletion_state === 'PHYSICALLY_DELETED') continue;
      let holdStatus: { held: boolean; reason?: string };
      try {
        holdStatus = await isObjectUnderLegalHold(userDb, rec.object_id);
      } catch {
        return jsonWorkerResponse(ctx, 503, { status: 'error', code: 'LEGAL_HOLD_VERIFICATION_UNAVAILABLE' });
      }
      if (holdStatus.held) {
        skippedLegalHoldIds.push(rec.object_id);
        continue;
      }
      const ts = new Date().toISOString();
      await userDb
        .prepare('UPDATE media_objects SET lifecycle_state = ?1, deletion_state = ?2, updated_at_iso = ?3 WHERE object_id = ?4')
        .bind('PENDING_DELETE', 'PENDING_PHYSICAL_DELETE', ts, rec.object_id)
        .run();
      await env.MEDIA_BUCKET.delete(rec.storage_key);
      const doneIso = new Date().toISOString();
      await userDb
        .prepare('UPDATE media_objects SET lifecycle_state = ?1, deletion_state = ?2, updated_at_iso = ?3, deleted_at_iso = ?4 WHERE object_id = ?5')
        .bind('DELETED', 'PHYSICALLY_DELETED', doneIso, doneIso, rec.object_id)
        .run();
      deletedIds.push(rec.object_id);
    }
    return jsonWorkerResponse(ctx, 200, { status: 'ok', bargainId, deletedIds, skippedLegalHoldIds });
  }

  return null;
}
