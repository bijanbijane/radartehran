/**
 * Frontend-only Cloudflare Worker router: SEO/metadata and explicit /api/* JSON boundaries.
 */
import { buildWorkerJsonHeaders, jsonWorkerResponse } from '../../../worker/contextAndSecurity';
import type { WorkerRequestContext } from '../../../worker/types';
import { handleFrontendMetadataRoute } from './metadataRoutes';

export interface FrontendWorkerDispatchResult {
  readonly response: Response;
  readonly routePattern: string;
}

export async function dispatchFrontendWorkerEdgeRequest(
  ctx: WorkerRequestContext
): Promise<FrontendWorkerDispatchResult | null> {
  const { method, pathname } = ctx;

  if (method === 'OPTIONS' && pathname.startsWith('/api/')) {
    const headers = buildWorkerJsonHeaders(ctx, { cacheControl: 'no-store' });
    return {
      response: new Response(null, { status: 204, headers }),
      routePattern: 'OPTIONS /api/*',
    };
  }

  const metadataResponse = await handleFrontendMetadataRoute(ctx);
  if (metadataResponse) {
    return { response: metadataResponse, routePattern: pathname };
  }

  if (pathname.startsWith('/api/')) {
    const apiService = ctx.env.RADAR_API;
    if (!apiService || typeof apiService.fetch !== 'function') {
      return { response: jsonWorkerResponse(ctx, 503, {
        status: 'error', code: 'RADAR_API_SERVICE_BINDING_MISSING', path: pathname,
        correlationId: ctx.correlationId,
        message: 'اتصال سرویس Backend رادار تهران از فرانت‌اند برقرار نیست.',
      }), routePattern: 'API_SERVICE_BINDING_MISSING' };
    }
    try {
      const upstream = await apiService.fetch(ctx.request);
      const headers = new Headers(upstream.headers);
      headers.set('X-Radar-API-Proxy', 'service-binding');
      headers.set('X-Correlation-Id', ctx.correlationId);
      return { response: new Response(upstream.body, {
        status: upstream.status, statusText: upstream.statusText, headers,
      }), routePattern: 'API_SERVICE_BINDING' };
    } catch {
      return { response: jsonWorkerResponse(ctx, 502, {
        status: 'error', code: 'RADAR_API_UPSTREAM_UNAVAILABLE',
        correlationId: ctx.correlationId,
        message: 'سرویس Backend رادار تهران در دسترس نیست.',
      }), routePattern: 'API_SERVICE_BINDING_ERROR' };
    }
  }

  return null;
}