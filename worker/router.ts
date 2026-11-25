/**
 * @file worker/router.ts
 * @description Modular Cloudflare Worker router for Tehran Radar.
 * Enforces the Migration Control Register (`worker/migrationRegister.ts`) as the single
 * authoritative dispatch gate before executing Worker route handlers.
 */
import { buildWorkerJsonHeaders, jsonWorkerResponse } from './contextAndSecurity';
import { resolveD1WritePauseState } from './db/writePause';
import { findMigrationRegisterEntry } from './migrationRegister';
import { authenticateWorkerSession, hasRadarSessionCookie } from './auth/sessionAuth';
import { createCloudflareSessionAssertion } from './auth/sessionAssertion';
import { handleAuthWorkerRoute } from './routes/authRoutes';
import { handleAccountWorkerRoute } from './routes/accountRoutes';
import { handleMarketplaceWorkerRoute } from './routes/marketplaceRoutes';
import { executeSafeStranglerFallback } from './stranglerFallback';
import { handleHealthAndMetadataRoute } from './routes/healthAndMetadataRoutes';
import { handleIntelligenceAndCommerceRoute } from './routes/intelligenceAndCommerceRoutes';
import { handleObjectStorageRoute } from './routes/objectStorageRoutes';
import { handleStorageAndAdminWorkerRoute } from './routes/storageAndAdminDiagnosticsRoutes';
import { handleAccountLifecycleRoute } from './routes/accountLifecycleRoutes';
import { guardWorkerApiMutationWriteBlock } from './account-lifecycle/workerApiWriteBlockGuard';
import { handleInternalWriteAdmissionRoute } from './routes/internalWriteAdmissionRoutes';
import { handleResearchWorkerRoute } from './routes/researchRoutes';
import { handleIrniCanonicalRpcV2Route } from './routes/irniCanonicalRpcV2Routes';
import type { WorkerRequestContext } from './types';

export interface WorkerRouteDispatchResult {
  readonly response: Response;
  readonly routePattern: string;
  readonly migrationStatus: string;
}

export async function dispatchWorkerApiOrSeoRequest(
  ctx: WorkerRequestContext,
): Promise<WorkerRouteDispatchResult | null> {
  const { method, pathname } = ctx;

  // Temporary global D1 write freeze. Google OAuth start/callback are GET endpoints
  // that also write one-time state/session records, so they must obey the same pause.
  const d1WritePause = resolveD1WritePauseState(ctx.env);
  const isD1MutatingMethod = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method.toUpperCase());
  const isD1MutatingAuthGet =
    method.toUpperCase() === 'GET' &&
    (pathname === '/api/auth/google/start' || pathname === '/api/auth/google/callback');
  if (pathname.startsWith('/api/') &&
      (isD1MutatingMethod || isD1MutatingAuthGet) &&
      d1WritePause.paused) {
    return {
      response: jsonWorkerResponse(ctx, 503, {
        status: 'error',
        code: 'D1_WRITES_TEMPORARILY_PAUSED',
        pauseUntilUtc: d1WritePause.pauseUntilUtc,
        retryAfterSeconds: d1WritePause.retryAfterSeconds,
        message: 'نوشتن در پایگاه داده موقتاً متوقف شده است؛ پس از پایان مهلت دوباره تلاش کنید.',
      }),
      routePattern: 'GLOBAL_D1_WRITE_PAUSE',
      migrationStatus: 'VERIFIED',
    };
  }

  // Handle CORS preflight for /api/* routes
  if (method === 'OPTIONS' && pathname.startsWith('/api/')) {
    const headers = buildWorkerJsonHeaders(ctx, { cacheControl: 'no-store' });
    return {
      response: new Response(null, { status: 204, headers }),
      routePattern: 'OPTIONS /api/*',
      migrationStatus: 'VERIFIED',
    };
  }

  // The canonical IRNI facade is always intercepted here, including unsupported methods,
  // so no request can fall through to the legacy Express or direct-D1 geography paths.
  const irniCanonicalPath = pathname === '/api/v2/reference/irni/canonical' ||
    pathname.startsWith('/api/v2/reference/irni/canonical/');
  if (irniCanonicalPath) {
    const response = await handleIrniCanonicalRpcV2Route(ctx);
    if (response) {
      return {
        response,
        routePattern: pathname,
        migrationStatus: 'IMPLEMENTED',
      };
    }
  }

  const internalAdmission = await handleInternalWriteAdmissionRoute(ctx);
  if (internalAdmission) {
    return {
      response: internalAdmission,
      routePattern: 'POST /api/internal/v1/lifecycle/write-admission',
      migrationStatus: 'VERIFIED',
    };
  }

  const writeBlockResponse = await guardWorkerApiMutationWriteBlock(ctx);
  if (writeBlockResponse) {
    return {
      response: writeBlockResponse,
      routePattern: 'GLOBAL_WRITE_BLOCK',
      migrationStatus: 'VERIFIED',
    };
  }

  const registeredMatch = findMigrationRegisterEntry(method, pathname);
  const conditionallyRoutedAuth =
    registeredMatch?.entry.migrationGroup === 'GROUP_3A_CLOUDFLARE_NATIVE_AUTH' &&
    registeredMatch.entry.status === 'IMPLEMENTED';
  const conditionallyRoutedAccount =
    registeredMatch?.entry.workerHandlerModule === 'worker/routes/accountRoutes.ts' &&
    registeredMatch.entry.status === 'IMPLEMENTED';
  const conditionallyRoutedMarketplace =
    registeredMatch?.entry.workerHandlerModule === 'worker/routes/marketplaceRoutes.ts' &&
    registeredMatch.entry.status === 'IMPLEMENTED';
  if (
    registeredMatch &&
    registeredMatch.entry.status !== 'VERIFIED' &&
    !conditionallyRoutedAuth &&
    !conditionallyRoutedAccount &&
    !conditionallyRoutedMarketplace
  ) {
    const { entry } = registeredMatch;
    let sessionAssertion: string | undefined;

    // A browser D1 session must be verified at the Worker boundary before an unmigrated
    // Express route can receive an identity. Invalid cookies never fall back to Firebase
    // bearer credentials in the same request.
    if (hasRadarSessionCookie(ctx.request)) {
      const session = await authenticateWorkerSession(ctx, true);
      if (!session.authenticated || !session.uid) {
        return {
          response: jsonWorkerResponse(ctx, session.statusCode, {
            status: 'error',
            code: session.reasonCode,
            correlationId: ctx.correlationId,
          }),
          routePattern: `${entry.method} ${entry.path}`,
          migrationStatus: entry.status,
        };
      }

      const bridgeSecret = String(ctx.env.AUTH_INTERNAL_HMAC_SECRET || '').trim();
      if (new TextEncoder().encode(bridgeSecret).byteLength < 32) {
        return {
          response: jsonWorkerResponse(ctx, 503, {
            status: 'error',
            code: 'AUTH_SESSION_BRIDGE_NOT_CONFIGURED',
            correlationId: ctx.correlationId,
          }),
          routePattern: `${entry.method} ${entry.path}`,
          migrationStatus: entry.status,
        };
      }

      try {
        sessionAssertion = await createCloudflareSessionAssertion({
          request: ctx.request,
          principal: session,
          secret: bridgeSecret,
          correlationId: ctx.correlationId,
        });
      } catch {
        return {
          response: jsonWorkerResponse(ctx, 503, {
            status: 'error',
            code: 'AUTH_SESSION_BRIDGE_SIGNING_FAILED',
            correlationId: ctx.correlationId,
          }),
          routePattern: `${entry.method} ${entry.path}`,
          migrationStatus: entry.status,
        };
      }
    }

    const proxied = await executeSafeStranglerFallback({
      request: ctx.request,
      env: ctx.env,
      correlationId: ctx.correlationId,
      sessionAssertion,
    });
    if (proxied.status !== 502 && proxied.status !== 508) {
      return {
        response: proxied,
        routePattern: `${entry.method} ${entry.path}`,
        migrationStatus: 'STRANGLER_PROXY',
      };
    }
    const response = jsonWorkerResponse(ctx, 501, {
      status: 'error',
      code: 'ROUTE_NOT_YET_MIGRATED_TO_WORKER',
      routeId: entry.routeId,
      method: entry.method,
      path: entry.path,
      migrationGroup: entry.migrationGroup,
      migrationStatus: entry.status,
      authoritativeRuntime: entry.activeRuntime,
      expressSourceModule: entry.expressSourceModule,
      blockerReason:
        entry.blockerReason ||
        'This endpoint remains authoritative on the legacy Express runtime until its storage/auth adapter is completed.',
      correlationId: ctx.correlationId,
      message:
        'این مسیر هنوز به اجرای Cloudflare Worker منتقل نشده و در سرور اصلی Express فعال است.',
    });
    return {
      response,
      routePattern: `${entry.method} ${entry.path}`,
      migrationStatus: entry.status,
    };
  }

  const authResponse = await handleAuthWorkerRoute(ctx);
  if (authResponse) {
    return {
      response: authResponse,
      routePattern: pathname,
      migrationStatus: registeredMatch?.entry.status || 'VERIFIED',
    };
  }

  const accountResponse = await handleAccountWorkerRoute(ctx);
  if (accountResponse) {
    return {
      response: accountResponse,
      routePattern: registeredMatch?.entry.path || pathname,
      migrationStatus: registeredMatch?.entry.status || 'IMPLEMENTED',
    };
  }

  const lifecycleResponse = await handleAccountLifecycleRoute(ctx);
  if (lifecycleResponse) {
    return {
      response: lifecycleResponse,
      routePattern: ctx.pathname,
      migrationStatus: 'VERIFIED',
    };
  }

  const marketplaceResponse = await handleMarketplaceWorkerRoute(ctx);
  if (marketplaceResponse) {
    return {
      response: marketplaceResponse,
      routePattern: registeredMatch?.entry.path || pathname,
      migrationStatus: registeredMatch?.entry.status || 'IMPLEMENTED',
    };
  }

  // Group 1A: Health, OpenAPI, PWA manifest, Sitemap, Robots
  const researchResponse = await handleResearchWorkerRoute(ctx);
  if (researchResponse) return { response: researchResponse, routePattern: pathname, migrationStatus: 'VERIFIED' };


  const group1AResponse = await handleHealthAndMetadataRoute(ctx);
  if (group1AResponse) {
    return {
      response: group1AResponse,
      routePattern: registeredMatch?.entry.path || pathname,
      migrationStatus: 'VERIFIED',
    };
  }

  // Group 1B: Stateless Intelligence, Commerce, MCP, Valuation Seal, Telemetry Policy
  const group1BResponse = await handleIntelligenceAndCommerceRoute(
    ctx,
    registeredMatch?.params || {},
  );
  if (group1BResponse) {
    return {
      response: group1BResponse,
      routePattern: registeredMatch?.entry.path || pathname,
      migrationStatus: 'VERIFIED',
    };
  }

  // Group 5: Canonical R2 + D1 Object Storage & Media Lifecycle
  const group5Response = await handleObjectStorageRoute(ctx, registeredMatch?.params || {});
  if (group5Response) {
    return {
      response: group5Response,
      routePattern: registeredMatch?.entry.path || pathname,
      migrationStatus: 'VERIFIED',
    };
  }

  // Group 6: Worker-native Admin Diagnostics
  const group6DiagResponse = await handleStorageAndAdminWorkerRoute(ctx);
  if (group6DiagResponse) {
    return {
      response: group6DiagResponse,
      routePattern: registeredMatch?.entry.path || pathname,
      migrationStatus: 'VERIFIED',
    };
  }

  // Guarantee `/api/*` never falls through to SPA HTML
  if (pathname.startsWith('/api/')) {
    const notFoundCode =
      pathname === '/api/non-existent-route' ? 'API_ENDPOINT_NOT_FOUND' : 'API_ROUTE_NOT_FOUND';
    const response = jsonWorkerResponse(ctx, 404, {
      status: 'error',
      code: notFoundCode,
      path: pathname,
      method,
      correlationId: ctx.correlationId,
      message: 'مسیر API درخواستی در رادار تهران یافت نشد.',
    });
    return {
      response,
      routePattern: 'UNMATCHED_API_ROUTE',
      migrationStatus: 'NOT_APPLICABLE',
    };
  }

  return null;
}
