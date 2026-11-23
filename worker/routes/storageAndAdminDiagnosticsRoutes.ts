/**
 * @file worker/routes/storageAndAdminDiagnosticsRoutes.ts
 * @description Section 16/25 Worker Admin Operational Diagnostics handler.
 * Object Storage routes have been converged into `worker/routes/objectStorageRoutes.ts`
 * as the single canonical implementation (RT-TEAMWORK-CRITICAL-002).
 */
import { authenticateWorkerSession } from '../auth/sessionAuth';
import { jsonWorkerResponse } from '../contextAndSecurity';
import { inspectD1OperationalDiagnostics } from '../db/d1SchemaAndMigrations';
import { summarizeWorkerTelemetryWindow } from '../telemetry/workerTelemetryEngine';
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
    edgeReplacement: 'D1-backed opaque sessions with Google OIDC / SMS identity verification',
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

export async function handleStorageAndAdminWorkerRoute(
  ctx: WorkerRequestContext,
): Promise<Response | null> {
  const { method, pathname, env, request } = ctx;

  if (method === 'GET' && pathname === '/api/admin/worker-diagnostics') {
    const auth = await authenticateWorkerSession(ctx);
    if (!auth.authenticated || !auth.isAdmin) {
      return jsonWorkerResponse(ctx, auth.statusCode === 200 ? 403 : auth.statusCode, {
        status: 'error',
        code: auth.reasonCode || 'ADMIN_FORBIDDEN',
      });
    }
    const diag = await inspectD1OperationalDiagnostics(env.DB);
    const telemetrySummary = summarizeWorkerTelemetryWindow();
    return jsonWorkerResponse(ctx, 200, {
      status: 'ok',
      environment: ctx.environment,
      dependencyMatrix: WORKER_DEPENDENCY_COMPATIBILITY_MATRIX,
      operationalVisibility: {
        workerHealth: diag.allCanonicalMigrationsApplied || !env.DB ? 'healthy' : 'degraded_pending_migrations',
        d1Status: env.DB ? 'bound' : 'unbound',
        r2Status: env.MEDIA_BUCKET ? 'bound' : 'unbound',
        kvStatus: env.RADAR_KV ? 'bound' : 'unbound',
        queueStatus: env.RADAR_QUEUE ? 'bound' : 'unbound',
        dlqStatus: env.RADAR_DLQ ? 'bound' : 'unbound',
        migrationStatus: {
          ledgerTable: diag.ledgerTable,
          appliedCount: diag.migrationsApplied.length,
          expectedCount: diag.expectedCount,
          allCanonicalMigrationsApplied: diag.allCanonicalMigrationsApplied,
          pendingMigrations: diag.pendingMigrations,
          migrations: diag.migrationsApplied,
        },
        watermarks: diag.watermarks,
        lastQueueProcessedAtIso: diag.lastQueueProcessedAtIso,
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
