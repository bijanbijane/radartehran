import { Router, type Request, type Response } from 'express';
import {
  buildSuccessEnvelope,
  CoreApiError,
  extractAuthenticatedPrincipal,
  resolveCorrelationId,
  withStandardErrorBoundary,
  type AuthenticatedPrincipal,
} from '../core';
import { createSearchService } from './service';
import type { SearchModuleDependencies } from './types';

/**
 * Standalone Express router factory for Employee 9 — Search & Discovery Module.
 * Exported explicitly without modifying `server.ts` or global route files.
 */
export function createSearchRouter(deps: SearchModuleDependencies): Router {
  const router = Router();
  const service = createSearchService(deps);

  async function requireVerifiedPrincipal(req: Request): Promise<AuthenticatedPrincipal> {
    const authResult = await extractAuthenticatedPrincipal(req, deps.tokenVerifier, {
      requireVerifiedEmail: true,
    });
    if (!authResult.ok || !authResult.principal) {
      throw new CoreApiError(
        'UNAUTHENTICATED',
        authResult.status ?? 401,
        authResult.reason ?? 'Authentication required.',
      );
    }
    return authResult.principal;
  }

  // GET /listings — Search, filter, and paginate publicly discoverable listings
  router.get(
    '/listings',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const result = await service.searchPublicListings(req.query);
      res.status(200).json(buildSuccessEnvelope(result, correlationId));
    }),
  );

  // POST /saved — Save search configuration (Authenticated User)
  router.post(
    '/saved',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const principal = await requireVerifiedPrincipal(req);
      const correlationId = resolveCorrelationId(req);
      const idempotencyKey = String(req.headers['idempotency-key'] ?? '');
      const result = await service.saveSearchConfig({
        principal,
        idempotencyKey,
        rawBody: req.body,
      });
      res.status(201).json(buildSuccessEnvelope(result, correlationId, { idempotentReplay: result.replayed }));
    }),
  );

  // GET /saved — Retrieve user's saved searches
  router.get(
    '/saved',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const principal = await requireVerifiedPrincipal(req);
      const correlationId = resolveCorrelationId(req);
      const result = await service.getUserSavedSearches({ principal });
      res.status(200).json(buildSuccessEnvelope(result, correlationId));
    }),
  );

  // DELETE /saved/:id — Delete user's saved search
  router.delete(
    '/saved/:id',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const principal = await requireVerifiedPrincipal(req);
      const correlationId = resolveCorrelationId(req);
      const result = await service.deleteSavedSearch({
        principal,
        savedSearchId: String(req.params.id ?? ''),
      });
      res.status(200).json(buildSuccessEnvelope(result, correlationId));
    }),
  );

  return router;
}
