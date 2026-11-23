/**
 * Independent Cloudflare Frontend Worker (`radartehran-frontend`).
 * Serves the React SPA, edge SEO metadata, and static assets only.
 * Must not import express, firebase-admin, or API route registries.
 */
import {
  buildObservabilityRecord,
  createWorkerRequestContext,
  jsonWorkerResponse,
} from '../../../worker/contextAndSecurity';
import type { WorkerEnv, WorkerExecutionContext } from '../../../worker/types';
import { dispatchFrontendWorkerEdgeRequest } from './router';
import { resolveWorkerBaseUrl } from '../../../worker/routes/healthAndMetadataRoutes';
import { handleFrontendSpaOrStaticAssetRequest } from './spaDelivery';

export default {
  async fetch(
    request: Request,
    env: WorkerEnv = {},
    _executionCtx?: WorkerExecutionContext
  ): Promise<Response> {
    const reqCtx = createWorkerRequestContext(request, env);
    try {
      const edgeResult = await dispatchFrontendWorkerEdgeRequest(reqCtx);
      if (edgeResult) {
        buildObservabilityRecord(reqCtx, edgeResult.response.status, edgeResult.routePattern, 'VERIFIED');
        return edgeResult.response;
      }

      const baseUrl = resolveWorkerBaseUrl(reqCtx);
      const staticOrSpaResponse = await handleFrontendSpaOrStaticAssetRequest(
        request,
        env,
        reqCtx.url,
        reqCtx.correlationId,
        baseUrl
      );
      buildObservabilityRecord(reqCtx, staticOrSpaResponse.status, 'SPA_OR_STATIC_ASSET', 'VERIFIED');
      return staticOrSpaResponse;
    } catch (err) {
      const errorCategory = err instanceof Error ? err.name : 'UNHANDLED_FRONTEND_WORKER_EXCEPTION';
      buildObservabilityRecord(reqCtx, 500, reqCtx.pathname, 'ERROR', errorCategory);
      return jsonWorkerResponse(reqCtx, 500, {
        status: 'error',
        code: 'INTERNAL_FRONTEND_WORKER_ERROR',
        correlationId: reqCtx.correlationId,
        message: 'خطای داخلی در Worker فرانت‌اند رادار تهران رخ داد.',
      });
    }
  },
};