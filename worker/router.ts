/**
 * @file worker/router.ts
 * @description Modular Cloudflare Worker router for Tehran Radar.
 * Enforces the Migration Control Register (`worker/migrationRegister.ts`) as the single
 * authoritative dispatch gate before executing Worker route handlers.
 */
import { buildWorkerJsonHeaders, jsonWorkerResponse } from './contextAndSecurity';
import { findMigrationRegisterEntry } from './migrationRegister';
import { handleAccountWorkerRoute } from './routes/accountRoutes';
import { handleHealthAndMetadataRoute } from './routes/healthAndMetadataRoutes';
import { handleIntelligenceAndCommerceRoute } from './routes/intelligenceAndCommerceRoutes';
import { handleIrniCanonicalRpcRoute } from './routes/irniCanonicalRpcRoutes';
import { handleIrniReferenceRoute } from './routes/irniReferenceRoutes';
import { handleObjectStorageRoute } from './routes/objectStorageRoutes';
import { handleResearchWorkerRoute } from './routes/researchRoutes';
import { handleStorageAndAdminWorkerRoute } from './routes/storageAndAdminDiagnosticsRoutes';
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

  // Handle CORS preflight for /api/* routes
  if (method === 'OPTIONS' && pathname.startsWith('/api/')) {
    const headers = buildWorkerJsonHeaders(ctx, { cacheControl: 'no-store' });
    return {
      response: new Response(null, { status: 204, headers }),
      routePattern: 'OPTIONS /api/*',
      migrationStatus: 'VERIFIED',
    };
  }

  // Authoritative Migration Control Register check FIRST — zero route bypasses
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

  // Group 4: Worker-native Account, Privacy, Sessions, Data Requests & Deletion Lifecycle (USER_DB)
  const group4AccountResponse = await handleAccountWorkerRoute(ctx);
  if (group4AccountResponse) {
    return {
      response: group4AccountResponse,
      routePattern: registeredMatch?.entry.path || pathname,
      migrationStatus: 'VERIFIED',
    };
  }

  // Group 3/Research: Physically Isolated Behavioral Research Domain (RESEARCH_DB)
  const researchResponse = await handleResearchWorkerRoute(ctx);
  if (researchResponse) {
    return {
      response: researchResponse,
      routePattern: registeredMatch?.entry.path || pathname,
      migrationStatus: 'VERIFIED',
    };
  }

  // Canonical IRNI v1: registered, revision-pinned, read-only Workers RPC facade.
  const canonicalIrniRpcResponse = await handleIrniCanonicalRpcRoute(ctx);
  if (canonicalIrniRpcResponse) {
    return {
      response: canonicalIrniRpcResponse,
      routePattern: registeredMatch?.entry.path || pathname,
      migrationStatus: 'VERIFIED',
    };
  }

  // Reference/IRNI: Strictly Read-Only External IRNI Neighborhood Reference API Client
  const irniRefResponse = await handleIrniReferenceRoute(ctx);
  if (irniRefResponse) {
    return {
      response: irniRefResponse,
      routePattern: pathname,
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
