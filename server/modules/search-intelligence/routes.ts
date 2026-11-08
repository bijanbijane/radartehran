/**
 * Employee 69 — Real Estate Search Intelligence, Discovery & Recommendation Engine Express Router
 * (`server/modules/search-intelligence/routes.ts`)
 *
 * Exclusive ownership: `server/modules/search-intelligence/`
 */

import express, { type Request, type Response, type Router } from 'express';
import {
  buildSuccessEnvelope,
  CoreApiError,
  extractAuthenticatedPrincipal,
  resolveCorrelationId,
  withStandardErrorBoundary,
} from '../core';
import type { AuthenticatedPrincipal } from '../core/types';
import { interpretNaturalLanguageSearchQuery, SearchIntelligenceService } from './service';
import type { IntelligentSortMode, SearchIntelligenceDependencies } from './types';

export function createSearchIntelligenceRouter(
  deps: SearchIntelligenceDependencies,
  existingService?: SearchIntelligenceService,
): Router {
  const router = express.Router();
  const service = existingService ?? new SearchIntelligenceService(deps);

  const requireAuth = async (req: Request): Promise<AuthenticatedPrincipal> => {
    const extraction = await extractAuthenticatedPrincipal(req, deps.tokenVerifier);
    if (!extraction.ok || !extraction.principal) {
      throw new CoreApiError(
        'UNAUTHENTICATED',
        extraction.status ?? 401,
        extraction.reason ?? 'Authentication required.',
      );
    }
    return extraction.principal;
  };

  const sendOk = <T>(res: Response, status: number, data: T, correlationId: string): void => {
    res.status(status).json(buildSuccessEnvelope(data, correlationId));
  };

  router.post(
    '/query',
    withStandardErrorBoundary(async (req, res) => {
      const result = await service.executeIntelligentSearch({
        filters: req.body?.filters,
        naturalLanguageQuery:
          typeof req.body?.naturalLanguageQuery === 'string'
            ? req.body.naturalLanguageQuery
            : undefined,
        sort: (req.body?.sort as IntelligentSortMode) ?? 'relevance',
        limit: req.body?.limit ? Number(req.body.limit) : 20,
        offset: req.body?.offset ? Number(req.body.offset) : 0,
      });
      sendOk(res, 200, result, resolveCorrelationId(req));
    }),
  );

  router.post(
    '/interpret-nl',
    withStandardErrorBoundary(async (req, res) => {
      const query = String(req.body?.query ?? '');
      const interpretation = interpretNaturalLanguageSearchQuery(query);
      sendOk(res, 200, { interpretation }, resolveCorrelationId(req));
    }),
  );

  router.get(
    '/similar/:propertyId',
    withStandardErrorBoundary(async (req, res) => {
      const result = await service.findSimilarAndComparableProperties(
        String(req.params.propertyId),
      );
      sendOk(res, 200, result, resolveCorrelationId(req));
    }),
  );

  router.post(
    '/recommendations',
    withStandardErrorBoundary(async (req, res) => {
      const principal = await requireAuth(req);
      const targetUid = String(req.body?.targetUid ?? principal.uid);
      const result = await service.getPersonalizedRecommendations(principal, targetUid, {
        preferredCategories: req.body?.preferredCategories,
        preferredNeighborhoodIds: req.body?.preferredNeighborhoodIds,
        maxBudgetMillions: req.body?.maxBudgetMillions,
        personalizationConsentGranted: Boolean(req.body?.personalizationConsentGranted),
      });
      sendOk(res, 200, result, resolveCorrelationId(req));
    }),
  );

  router.put(
    '/admin/ranking-policy',
    withStandardErrorBoundary(async (req, res) => {
      const principal = await requireAuth(req);
      const policy = await service.updateRankingPolicyWeights(principal, req.body?.weights ?? {});
      sendOk(res, 200, { policy }, resolveCorrelationId(req));
    }),
  );

  return router;
}
