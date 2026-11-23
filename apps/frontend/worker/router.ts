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
    const response = jsonWorkerResponse(ctx, 404, {
      status: 'error',
      code: 'API_ROUTE_NOT_ON_FRONTEND_WORKER',
      path: pathname,
      method,
      correlationId: ctx.correlationId,
      message:
        'مسیر API در Worker فرانت‌اند سرو نمی‌شود. از Worker یا سرور radartehran-api استفاده کنید.',
      hint: 'Configure VITE_API_BASE_URL to the radartehran-api origin in production.',
    });
    return { response, routePattern: 'UNMATCHED_API_ROUTE' };
  }

  return null;
}