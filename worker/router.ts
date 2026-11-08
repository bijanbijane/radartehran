/**
 * @file worker/router.ts
 * @description Modular Cloudflare Worker router for Tehran Radar (Phase 1 & Phase 2).
 * Separates route dispatch, strangler migration boundary enforcement, and structured observability
 * from the Worker entrypoint (`worker/index.ts`).
 */
import {
  buildWorkerJsonHeaders,
  jsonWorkerResponse,
} from './contextAndSecurity';
import { findMigrationRegisterEntry } from './migrationRegister';
import { handleHealthAndMetadataRoute } from './routes/healthAndMetadataRoutes';
import { handleIntelligenceAndCommerceRoute } from './routes/intelligenceAndCommerceRoutes';
import type { WorkerRequestContext } from './types';

export interface WorkerRouteDispatchResult {
  readonly response: Response;
  readonly routePattern: string;
  readonly migrationStatus: string;
}

export async function dispatchWorkerApiOrSeoRequest(
  ctx: WorkerRequestContext
): Promise<WorkerRouteDispatchResult | null> {
  const { method, pathname } = ctx;

  // Handle CORS preflight for /api/* routes
  if (method === 'OPTIONS' && pathname.startsWith('/api/')) {
    const headers = buildWorkerJsonHeaders(ctx, { cacheControl: 'no-store' });
    return {
      response: new Response(null, { status: 204, headers }),
      routePattern: 'OPTIONS /api/*',
      migrationStatus: 'VERIFIED',
    };
  }

  // Check Migration Control Register first to enforce strangler rollback / gate controls
  const registeredMatch = findMigrationRegisterEntry(method, pathname);
  if (registeredMatch && registeredMatch.entry.status !== 'VERIFIED') {
    const { entry } = registeredMatch;
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

  // Group 1A: Health, OpenAPI, PWA manifest, Sitemap, Robots
  const group1AResponse = handleHealthAndMetadataRoute(ctx);
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
    registeredMatch?.params || {}
  );
  if (group1BResponse) {
    return {
      response: group1BResponse,
      routePattern: registeredMatch?.entry.path || pathname,
      migrationStatus: 'VERIFIED',
    };
  }

  // Guarantee `/api/*` never falls through to SPA HTML
  if (pathname.startsWith('/api/')) {
    const response = jsonWorkerResponse(ctx, 404, {
      status: 'error',
      code: 'API_ROUTE_NOT_FOUND',
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
