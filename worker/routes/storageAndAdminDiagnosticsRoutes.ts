/**
 * @file worker/routes/storageAndAdminDiagnosticsRoutes.ts
 * @description Section 16/25 Worker Admin Operational Diagnostics handler.
 * Object Storage routes have been converged into `worker/routes/objectStorageRoutes.ts`
 * as the single canonical implementation (RT-TEAMWORK-CRITICAL-002).
 */
import { verifyFirebaseIdTokenOnEdge } from '../auth/firebaseEdgeAuth';
import { jsonWorkerResponse } from '../contextAndSecurity';
import { getTriadDomainBindingDiagnostics, resolveUserDb } from '../db/bindingResolver';
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

export async function handleStorageAndAdminWorkerRoute(
  ctx: WorkerRequestContext,
): Promise<Response | null> {
  const { method, pathname, env, request } = ctx;

  if (method === 'GET' && pathname === '/api/admin/worker-diagnostics') {
    const auth = await verifyFirebaseIdTokenOnEdge({
      authorizationHeader: request.headers.get('authorization'),
      appCheckHeader: request.headers.get('x-firebase-appcheck'),
      appCheckDebugHeader: request.headers.get('x-firebase-appcheck-debug'),
      request,
      env,
      sensitiveRoute: true,
    });
    if (!auth.authenticated || !auth.isAdmin) {
      return jsonWorkerResponse(ctx, auth.statusCode === 200 ? 403 : auth.statusCode, {
        status: 'error',
        code: auth.reasonCode || 'ADMIN_FORBIDDEN',
      });
    }
    const userDb = resolveUserDb(env);
    const diag = await inspectD1OperationalDiagnostics(userDb);
    const triadDomains = getTriadDomainBindingDiagnostics(env);
    const telemetrySummary = summarizeWorkerTelemetryWindow();
    return jsonWorkerResponse(ctx, 200, {
      status: 'ok',
      environment: ctx.environment,
      dependencyMatrix: WORKER_DEPENDENCY_COMPATIBILITY_MATRIX,
      triadDomains,
      operationalVisibility: {
        workerHealth: diag.allCanonicalMigrationsApplied || !userDb ? 'healthy' : 'degraded_pending_migrations',
        d1Status: userDb ? 'bound' : 'unbound',
        userDbStatus: triadDomains.userDbBound ? 'bound' : 'unbound',
        researchDbStatus: triadDomains.researchDbBound ? 'bound' : 'unbound',
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
