/**
 * @file worker/routes/edgePlatformAndStorageRoutes.ts
 * @description Worker-native handlers for D1+R2 chunked media upload lifecycle,
 * KV SWR market-pulse reads, and Section 25 operationalVisibility admin diagnostics.
 * Uses canonical Worker bindings (`DB`, `MEDIA_BUCKET`, `RADAR_KV`, `RADAR_QUEUE`, `RADAR_DLQ`).
 */
import { INITIAL_NEIGHBORHOODS } from '../../src/data/neighborhoods';
import { verifyFirebaseIdTokenOnEdge } from '../auth/firebaseEdgeAuth';
import { getOrPopulateKvSwrCache } from '../cache/kvAndEdgeRateLimiter';
import { jsonWorkerResponse, readValidatedJsonBody } from '../contextAndSecurity';
import {
  type D1UploadSessionRecord,
  inspectD1OperationalDiagnostics,
  queryNeighborhoodProjectionsD1,
} from '../db/d1SchemaAndMigrations';
import { storeValidatedMediaInR2 } from '../storage/r2StorageAdapter';
import { summarizeWorkerTelemetryWindow } from '../telemetry/workerTelemetryEngine';
import type { DependencyCompatibilityEntry, WorkerRequestContext } from '../types';

export const WORKER_DEPENDENCY_COMPATIBILITY_MATRIX: readonly DependencyCompatibilityEntry[] = [
  {
    packageName: 'express',
    officialStatus: 'NOT_SUPPORTED',
    edgeReplacement: 'worker/router.ts (Web Fetch API Request/Response router)',
    rationale: 'Node.js HTTP server listener is not used in Cloudflare Worker isolate fetch entrypoint.',
  },
  {
    packageName: 'firebase-admin',
    officialStatus: 'NOT_SUPPORTED',
    edgeReplacement: 'worker/auth/firebaseEdgeAuth.ts (WebCrypto SubtleCrypto RS256 JWKS verifier)',
    rationale: 'Replaces Node gRPC/service-account SDK with zero-dependency WebCrypto JWT verification.',
  },
  {
    packageName: 'sharp',
    officialStatus: 'NOT_SUPPORTED',
    edgeReplacement: 'worker/storage/r2StorageAdapter.ts (magic-byte signature inspection + R2)',
    rationale: 'Native C++ libvips bindings cannot run inside V8 isolates.',
  },
  {
    packageName: 'decimal.js',
    officialStatus: 'WORKS_NATIVELY',
    edgeReplacement: 'decimal.js (pure ECMAScript module)',
    rationale: 'Deterministic financial arithmetic runs natively in V8 Workers.',
  },
  {
    packageName: '@google/genai',
    officialStatus: 'WORKS_NATIVELY',
    edgeReplacement: 'Fetch-based Gemini API gateway',
    rationale: 'Standard Web Fetch transport works natively in Workers.',
  },
];

function decodeBase64ToBytes(base64Text: string): Uint8Array | null {
  try {
    const clean = String(base64Text || '').replace(/^data:[^;]+;base64,/, '').trim();
    const binary = atob(clean);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      out[i] = binary.charCodeAt(i);
    }
    return out;
  } catch {
    return null;
  }
}

export async function handleEdgePlatformAndStorageRoute(
  ctx: WorkerRequestContext
): Promise<Response | null> {
  const { method, pathname, request, env, url } = ctx;

  // 1. Public Market Pulse via KV SWR + D1 projections when Staging/Edge bindings are active
  if (
    method === 'GET' &&
    pathname === '/api/market-pulse' &&
    (env.DB || env.RADAR_KV || env.WORKER_ENV === 'staging' || ctx.environment === 'staging')
  ) {
    const city = (url.searchParams.get('city') || 'tehran').toLowerCase().trim();
    const swr = await getOrPopulateKvSwrCache({
      kv: env.RADAR_KV,
      env: ctx.environment,
      namespace: 'market_pulse',
      key: `pulse:${city}`,
      freshTtlSeconds: 60,
      staleTtlSeconds: 300,
      loader: async () => {
        if (env.DB) {
          try {
            const proj = await queryNeighborhoodProjectionsD1(env.DB, { cityId: city, limit: 25 });
            if (proj.items.length > 0) {
              return {
                city,
                source: 'd1_projection',
                neighborhoodsCount: proj.items.length,
                averageBuyPerSqmMillion: Math.round(
                  proj.items.reduce((acc, r) => acc + r.buy_per_sqm_million, 0) / proj.items.length
                ),
                updatedAtIso: new Date().toISOString(),
              };
            }
          } catch {
            // Fall back to baseline neighborhood dataset
          }
        }
        return {
          city,
          source: 'edge_baseline_dataset',
          neighborhoodsCount: INITIAL_NEIGHBORHOODS.length,
          averageBuyPerSqmMillion: 168,
          updatedAtIso: new Date().toISOString(),
        };
      },
    });

    return jsonWorkerResponse(ctx, 200, {
      status: 'ok',
      cacheStatus: swr.cacheStatus,
      ...(swr.value ?? { city, neighborhoodsCount: INITIAL_NEIGHBORHOODS.length }),
    });
  }

  // 2. Direct single-request upload authentication guard (`POST /api/object-storage/upload`)
  if (method === 'POST' && pathname === '/api/object-storage/upload') {
    const auth = await verifyFirebaseIdTokenOnEdge({
      authorizationHeader: request.headers.get('authorization'),
      appCheckHeader: request.headers.get('x-firebase-appcheck'),
      env,
    });
    if (!auth.authenticated || !auth.uid) {
      return jsonWorkerResponse(ctx, auth.statusCode, {
        status: 'error',
        code: auth.reasonCode,
        message: 'احراز هویت برای بارگذاری فایل الزامی است.',
      });
    }
    if (!env.MEDIA_BUCKET) {
      return jsonWorkerResponse(ctx, 503, {
        status: 'error',
        code: 'R2_MEDIA_BUCKET_NOT_BOUND',
        message: 'باکت ذخیره‌سازی رسانه (MEDIA_BUCKET) در محیط جاری متصل نیست.',
      });
    }
    const parsed = await readValidatedJsonBody(request, 12 * 1024 * 1024);
    if (!parsed.ok) {
      return jsonWorkerResponse(ctx, parsed.status, {
        status: 'error',
        code: parsed.code,
        message: parsed.messageFa,
      });
    }
    const rawB64 = String(parsed.body.base64Data || parsed.body.dataBase64 || '');
    const bytes = decodeBase64ToBytes(rawB64);
    if (!bytes || bytes.byteLength === 0) {
      return jsonWorkerResponse(ctx, 400, {
        status: 'error',
        code: 'EMPTY_MEDIA_PAYLOAD',
        message: 'داده باینری فایل معتبر نیست.',
      });
    }
    const mediaType = parsed.body.mediaType === 'video' ? 'video' : 'image';
    const stored = await storeValidatedMediaInR2({
      r2: env.MEDIA_BUCKET,
      bucketName: 'radartehran-staging-media',
      ownerUid: auth.uid,
      city: String(parsed.body.city || 'tehran'),
      hoodId: Number(parsed.body.hoodId || 1),
      mediaType,
      declaredMimeType: String(parsed.body.mimeType || 'image/webp'),
      bytes,
    });
    if (stored.ok === false) {
      return jsonWorkerResponse(ctx, stored.statusCode, {
        status: 'error',
        code: stored.errorCode,
      });
    }
    return jsonWorkerResponse(ctx, 200, {
      status: 'ok',
      mediaObject: stored.mediaObject,
    });
  }

  // 3. D1-backed chunked upload lifecycle (`upload-init`, `upload-chunk`, `upload-complete`)
  if (
    method === 'POST' &&
    (pathname === '/api/object-storage/upload-init' ||
      pathname === '/api/object-storage/upload-chunk' ||
      pathname === '/api/object-storage/upload-complete')
  ) {
    const auth = await verifyFirebaseIdTokenOnEdge({
      authorizationHeader: request.headers.get('authorization'),
      appCheckHeader: request.headers.get('x-firebase-appcheck'),
      env,
    });
    if (!auth.authenticated || !auth.uid) {
      return jsonWorkerResponse(ctx, auth.statusCode, {
        status: 'error',
        code: auth.reasonCode,
        message: 'احراز هویت برای بارگذاری چندبخشی الزامی است.',
      });
    }
    if (!env.DB) {
      return jsonWorkerResponse(ctx, 503, {
        status: 'error',
        code: 'D1_DATABASE_NOT_BOUND',
        message: 'پایگاه داده D1 برای مدیریت نشست بارگذاری متصل نیست.',
      });
    }

    const parsed = await readValidatedJsonBody(request, 6 * 1024 * 1024);
    if (!parsed.ok) {
      return jsonWorkerResponse(ctx, parsed.status, {
        status: 'error',
        code: parsed.code,
        message: parsed.messageFa,
      });
    }

    if (pathname === '/api/object-storage/upload-init') {
      const sessionId = `upl_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
      const mediaType = parsed.body.mediaType === 'video' ? 'video' : 'image';
      const mimeType = String(parsed.body.mimeType || 'image/webp');
      const totalChunks = Math.max(1, Math.min(200, Number(parsed.body.totalChunks || 1)));
      const maxBytes = Math.max(12, Math.min(50 * 1024 * 1024, Number(parsed.body.totalSizeBytes || 10 * 1024 * 1024)));
      const city = String(parsed.body.city || 'tehran');
      const hoodId = Number(parsed.body.hoodId || 1);
      const fileName = String(parsed.body.fileName || `${sessionId}.webp`);

      await env.DB.prepare(
        `INSERT OR REPLACE INTO upload_sessions (
          session_id, owner_uid, city_id, hood_id, media_type, mime_type, file_name,
          total_chunks, max_bytes, received_bytes, completed, created_at_ms
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)`
      )
        .bind(sessionId, auth.uid, city, hoodId, mediaType, mimeType, fileName, totalChunks, maxBytes, 0, 0, Date.now())
        .run();

      return jsonWorkerResponse(ctx, 200, {
        status: 'ok',
        sessionId,
        durablePersistence: 'd1_sqlite',
        totalChunks,
      });
    }

    if (pathname === '/api/object-storage/upload-chunk') {
      const sessionId = String(parsed.body.sessionId || '').trim();
      const chunkIndex = Number(parsed.body.chunkIndex ?? 0);
      const base64Data = String(parsed.body.base64Data || '').trim();
      const session = await env.DB.prepare('SELECT * FROM upload_sessions WHERE session_id = ?1')
        .bind(sessionId)
        .first<D1UploadSessionRecord>();
      if (!session || session.owner_uid !== auth.uid) {
        return jsonWorkerResponse(ctx, 404, {
          status: 'error',
          code: 'UPLOAD_SESSION_NOT_FOUND',
        });
      }
      const chunkBytes = decodeBase64ToBytes(base64Data);
      if (!chunkBytes) {
        return jsonWorkerResponse(ctx, 400, {
          status: 'error',
          code: 'INVALID_CHUNK_BASE64',
        });
      }
      await env.DB.prepare(
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
      if (!env.MEDIA_BUCKET) {
        return jsonWorkerResponse(ctx, 503, {
          status: 'error',
          code: 'R2_MEDIA_BUCKET_NOT_BOUND',
        });
      }
      const sessionId = String(parsed.body.sessionId || '').trim();
      const session = await env.DB.prepare('SELECT * FROM upload_sessions WHERE session_id = ?1')
        .bind(sessionId)
        .first<D1UploadSessionRecord>();
      if (!session || session.owner_uid !== auth.uid) {
        return jsonWorkerResponse(ctx, 404, {
          status: 'error',
          code: 'UPLOAD_SESSION_NOT_FOUND',
        });
      }
      const chunksRes = await env.DB.prepare(
        'SELECT chunk_index, chunk_base64, byte_length FROM upload_session_chunks WHERE session_id = ?1 ORDER BY chunk_index ASC'
      )
        .bind(sessionId)
        .all<{ chunk_index: number; chunk_base64: string; byte_length: number }>();

      const parts: Uint8Array[] = [];
      let totalLen = 0;
      for (const c of chunksRes.results) {
        const b = decodeBase64ToBytes(c.chunk_base64);
        if (b) {
          parts.push(b);
          totalLen += b.byteLength;
        }
      }
      const combined = new Uint8Array(totalLen);
      let offset = 0;
      for (const p of parts) {
        combined.set(p, offset);
        offset += p.byteLength;
      }

      const stored = await storeValidatedMediaInR2({
        r2: env.MEDIA_BUCKET,
        bucketName: 'radartehran-staging-media',
        ownerUid: auth.uid,
        city: session.city_id,
        hoodId: session.hood_id,
        mediaType: session.media_type,
        declaredMimeType: session.mime_type,
        bytes: combined,
      });
      await env.DB.prepare('DELETE FROM upload_sessions WHERE session_id = ?1').bind(sessionId).run();
      if (stored.ok === false) {
        return jsonWorkerResponse(ctx, stored.statusCode, {
          status: 'error',
          code: stored.errorCode,
        });
      }
      return jsonWorkerResponse(ctx, 200, {
        status: 'ok',
        sessionId,
        mediaObject: stored.mediaObject,
      });
    }
  }

  // 4. Admin Operational Visibility & Worker Diagnostics (`GET /api/admin/worker-diagnostics`)
  if (method === 'GET' && pathname === '/api/admin/worker-diagnostics') {
    const auth = await verifyFirebaseIdTokenOnEdge({
      authorizationHeader: request.headers.get('authorization'),
      appCheckHeader: request.headers.get('x-firebase-appcheck'),
      env,
    });
    if (!auth.authenticated || !auth.isAdmin) {
      return jsonWorkerResponse(ctx, auth.authenticated ? 403 : 401, {
        status: 'error',
        code: auth.reasonCode,
        message: 'دسترسی به تشخیص وضعیت Worker محدود به مدیر سیستم است.',
      });
    }

    const d1Diag = await inspectD1OperationalDiagnostics(env.DB);
    const telemetrySummary = summarizeWorkerTelemetryWindow();
    return jsonWorkerResponse(ctx, 200, {
      status: 'ok',
      environment: ctx.environment,
      dependencyMatrix: WORKER_DEPENDENCY_COMPATIBILITY_MATRIX,
      operationalVisibility: {
        workerHealth: d1Diag.allCanonicalMigrationsApplied || !env.DB ? 'healthy' : 'degraded_pending_migrations',
        d1Status: env.DB ? 'bound' : 'unbound',
        r2Status: env.MEDIA_BUCKET ? 'bound' : 'unbound',
        kvStatus: env.RADAR_KV ? 'bound' : 'unbound',
        queueStatus: env.RADAR_QUEUE ? 'bound' : 'unbound',
        dlqStatus: env.RADAR_DLQ ? 'bound' : 'unbound',
        migrationStatus: {
          ledgerTable: d1Diag.ledgerTable,
          appliedCount: d1Diag.migrationsApplied.length,
          expectedCount: d1Diag.expectedCount,
          allCanonicalMigrationsApplied: d1Diag.allCanonicalMigrationsApplied,
          pendingMigrations: d1Diag.pendingMigrations,
          migrations: d1Diag.migrationsApplied,
        },
        watermarks: d1Diag.watermarks,
        lastQueueProcessedAtIso: d1Diag.lastQueueProcessedAtIso,
        safePerformanceMetrics: {
          cpuTimeMs: null,
          ...telemetrySummary,
        },
        rollbackCommand: 'npx wrangler rollback --env staging',
      },
    });
  }

  return null;
}
