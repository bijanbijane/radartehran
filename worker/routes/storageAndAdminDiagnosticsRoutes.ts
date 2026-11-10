/**
 * @file worker/routes/storageAndAdminDiagnosticsRoutes.ts
 * @description Cloudflare Worker D1 + R2 chunked media upload handlers and Section 16/25
 * admin operational diagnostics endpoint.
 */
import { verifyFirebaseIdTokenOnEdge } from '../auth/firebaseEdgeAuth';
import { jsonWorkerResponse, readValidatedJsonBody } from '../contextAndSecurity';
import {
  type D1UploadSessionRecord,
  inspectD1OperationalDiagnostics,
} from '../db/d1SchemaAndMigrations';
import { storeValidatedMediaInR2 } from '../storage/r2StorageAdapter';
import type { DependencyCompatibilityEntry, WorkerRequestContext } from '../types';

export const WORKER_DEPENDENCY_COMPATIBILITY_MATRIX: readonly DependencyCompatibilityEntry[] = [
  {
    packageName: 'express',
    currentUsage: 'Legacy Node HTTP server routing',
    officialStatus: 'NOT_SUPPORTED',
    edgeReplacement: 'worker/router.ts Web Fetch API router',
  },
  {
    packageName: 'firebase-admin',
    currentUsage: 'Node-only gRPC Firebase Auth & Firestore SDK',
    officialStatus: 'NOT_SUPPORTED',
    edgeReplacement: 'worker/auth/firebaseEdgeAuth.ts WebCrypto RS256 + Firestore REST',
  },
  {
    packageName: 'sharp',
    currentUsage: 'Native libvips C++ binary image processing',
    officialStatus: 'NOT_SUPPORTED',
    edgeReplacement: 'worker/storage/r2StorageAdapter.ts magic-byte guard + Cloudflare Images',
  },
  {
    packageName: '@google/genai',
    currentUsage: 'Server-side Gemini API SDK',
    officialStatus: 'WORKS_NATIVELY',
    edgeReplacement: 'Native Web Fetch compatible SDK on Workers',
  },
];

function decodeBase64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/^data:[^;]+;base64,/, '').trim();
  const binStr = atob(clean);
  const bytes = new Uint8Array(binStr.length);
  for (let i = 0; i < binStr.length; i++) {
    bytes[i] = binStr.charCodeAt(i);
  }
  return bytes;
}

export async function handleStorageAndAdminWorkerRoute(
  ctx: WorkerRequestContext
): Promise<Response | null> {
  const { method, pathname } = ctx;

  if (method === 'GET' && pathname === '/api/admin/worker-diagnostics') {
    const auth = await verifyFirebaseIdTokenOnEdge({
      authorizationHeader: ctx.request.headers.get('authorization'),
      appCheckHeader: ctx.request.headers.get('x-firebase-appcheck'),
      env: ctx.env,
    });
    if (!auth.authenticated || !auth.isAdmin) {
      return jsonWorkerResponse(ctx, auth.statusCode === 200 ? 403 : auth.statusCode, {
        status: 'error',
        code: auth.reasonCode || 'ADMIN_FORBIDDEN',
      });
    }
    const diag = await inspectD1OperationalDiagnostics(ctx.env.DB);
    return jsonWorkerResponse(ctx, 200, {
      status: 'ok',
      dependencyMatrix: WORKER_DEPENDENCY_COMPATIBILITY_MATRIX,
      operationalVisibility: {
        workerHealth: 'healthy',
        d1Status: ctx.env.DB ? 'bound' : 'unbound',
        r2Status: ctx.env.MEDIA_BUCKET ? 'bound' : 'unbound',
        migrationStatus: {
          ledgerTable: diag.ledgerTable,
          appliedCount: diag.migrationsApplied.length,
          expectedCount: diag.expectedCount,
          allCanonicalMigrationsApplied: diag.allCanonicalMigrationsApplied,
          migrations: diag.migrationsApplied,
        },
        safePerformanceMetrics: { cpuTimeMs: null },
        rollbackCommand: 'npx wrangler rollback --env staging',
      },
    });
  }

  if (
    method === 'POST' &&
    (pathname === '/api/object-storage/upload-init' ||
      pathname === '/api/object-storage/upload-chunk' ||
      pathname === '/api/object-storage/upload-complete')
  ) {
    if (!ctx.env.DB || !ctx.env.MEDIA_BUCKET) {
      return null;
    }
    const auth = await verifyFirebaseIdTokenOnEdge({
      authorizationHeader: ctx.request.headers.get('authorization'),
      appCheckHeader: ctx.request.headers.get('x-firebase-appcheck'),
      env: ctx.env,
    });
    if (!auth.authenticated || !auth.uid) {
      return jsonWorkerResponse(ctx, auth.statusCode === 200 ? 401 : auth.statusCode, {
        status: 'error',
        code: auth.reasonCode || 'UNAUTHORIZED',
      });
    }

    const parsed = await readValidatedJsonBody(ctx.request, 8 * 1024 * 1024);
    if (!parsed.ok) {
      return jsonWorkerResponse(ctx, parsed.status, {
        status: 'error',
        code: parsed.code,
        message: parsed.messageFa,
      });
    }
    const body = parsed.body;

    if (pathname === '/api/object-storage/upload-init') {
      const mediaType = body.mediaType === 'video' ? 'video' : 'image';
      const mimeType = String(body.mimeType || 'image/webp').trim();
      const city = String(body.city || 'tehran').trim();
      const hoodId = Math.max(1, Math.trunc(Number(body.hoodId) || 1));
      const fileName = String(body.fileName || 'upload.webp').slice(0, 120);
      const totalChunks = Math.max(1, Math.min(200, Math.trunc(Number(body.totalChunks) || 1)));
      const maxBytes = mediaType === 'video' ? 50 * 1024 * 1024 : 10 * 1024 * 1024;
      const sessionId = `upl_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;

      await ctx.env.DB.prepare(
        `INSERT OR REPLACE INTO upload_sessions (
          session_id, owner_uid, city_id, hood_id, media_type, mime_type, file_name,
          total_chunks, max_bytes, received_bytes, completed, created_at_ms
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)`
      )
        .bind(
          sessionId,
          auth.uid,
          city,
          hoodId,
          mediaType,
          mimeType,
          fileName,
          totalChunks,
          maxBytes,
          0,
          0,
          Date.now()
        )
        .run();

      return jsonWorkerResponse(ctx, 200, {
        status: 'ok',
        sessionId,
        durablePersistence: 'd1_sqlite',
      });
    }

    if (pathname === '/api/object-storage/upload-chunk') {
      const sessionId = String(body.sessionId || '').trim();
      const chunkIndex = Math.max(0, Math.trunc(Number(body.chunkIndex) || 0));
      const base64Data = String(body.base64Data || '').trim();
      const session = await ctx.env.DB.prepare(
        'SELECT * FROM upload_sessions WHERE session_id = ?1'
      )
        .bind(sessionId)
        .first<D1UploadSessionRecord>();
      if (!session) {
        return jsonWorkerResponse(ctx, 404, { status: 'error', code: 'SESSION_NOT_FOUND' });
      }
      if (session.owner_uid !== auth.uid && !auth.isAdmin) {
        return jsonWorkerResponse(ctx, 403, { status: 'error', code: 'SESSION_OWNER_MISMATCH' });
      }
      const chunkBytes = decodeBase64ToBytes(base64Data);
      await ctx.env.DB.prepare(
        'INSERT INTO upload_session_chunks (session_id, chunk_index, chunk_base64, byte_length) VALUES (?1, ?2, ?3, ?4)'
      )
        .bind(sessionId, chunkIndex, base64Data, chunkBytes.byteLength)
        .run();

      return jsonWorkerResponse(ctx, 200, {
        status: 'ok',
        sessionId,
        chunkIndex,
        byteLength: chunkBytes.byteLength,
      });
    }

    if (pathname === '/api/object-storage/upload-complete') {
      const sessionId = String(body.sessionId || '').trim();
      const session = await ctx.env.DB.prepare(
        'SELECT * FROM upload_sessions WHERE session_id = ?1'
      )
        .bind(sessionId)
        .first<D1UploadSessionRecord>();
      if (!session) {
        return jsonWorkerResponse(ctx, 404, { status: 'error', code: 'SESSION_NOT_FOUND' });
      }
      if (session.owner_uid !== auth.uid && !auth.isAdmin) {
        return jsonWorkerResponse(ctx, 403, { status: 'error', code: 'SESSION_OWNER_MISMATCH' });
      }
      const chunksRes = await ctx.env.DB.prepare(
        'SELECT chunk_index, chunk_base64, byte_length FROM upload_session_chunks WHERE session_id = ?1 ORDER BY chunk_index ASC'
      )
        .bind(sessionId)
        .all<{ chunk_index: number; chunk_base64: string; byte_length: number }>();
      const decodedChunks = (chunksRes.results ?? []).map((c) => decodeBase64ToBytes(c.chunk_base64));
      const totalLength = decodedChunks.reduce((acc, b) => acc + b.byteLength, 0);
      const assembled = new Uint8Array(totalLength);
      let offset = 0;
      for (const b of decodedChunks) {
        assembled.set(b, offset);
        offset += b.byteLength;
      }

      const stored = await storeValidatedMediaInR2({
        r2: ctx.env.MEDIA_BUCKET,
        bucketName: 'radartehran-staging-media',
        ownerUid: session.owner_uid,
        city: session.city_id,
        hoodId: Number(session.hood_id),
        mediaType: session.media_type === 'video' ? 'video' : 'image',
        declaredMimeType: session.mime_type,
        bytes: assembled,
      });
      if ('errorCode' in stored) {
        return jsonWorkerResponse(ctx, stored.statusCode, {
          status: 'error',
          code: stored.errorCode,
        });
      }
      await ctx.env.DB.prepare('DELETE FROM upload_session_chunks WHERE session_id = ?1')
        .bind(sessionId)
        .run();
      await ctx.env.DB.prepare('DELETE FROM upload_sessions WHERE session_id = ?1')
        .bind(sessionId)
        .run();

      return jsonWorkerResponse(ctx, 200, {
        status: 'ok',
        mediaObject: stored.mediaObject,
      });
    }
  }

  return null;
}
