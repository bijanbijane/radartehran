/**
 * Employee 64 — Customer Experience HTTP API Router (`/api/v1/cx`)
 * (`server/modules/customer-experience/routes.ts`)
 *
 * Exclusive ownership: `server/modules/customer-experience/`
 */

import express from 'express';
import type { Express, Request, Response, Router } from 'express';
import {
  buildPaginatedEnvelope,
  buildSuccessEnvelope,
  CoreApiError,
  executeIdempotentMutation,
  extractAuthenticatedPrincipal,
  resolveCorrelationId,
  verifyAdminOrDelegatedPrincipal,
  withStandardErrorBoundary,
} from '../core';
import { CustomerExperienceService } from './service';
import type {
  AuthenticatedPrincipal,
  CustomerExperienceModuleDependencies,
  UgcTargetType,
} from './types';

interface RateBucket {
  count: number;
  resetAtMs: number;
}

function createWindowRateLimiter(maxPerWindow: number, windowMs = 60_000) {
  const buckets = new Map<string, RateBucket>();
  return (key: string): void => {
    const now = Date.now();
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAtMs <= now) {
      buckets.set(key, { count: 1, resetAtMs: now + windowMs });
      return;
    }
    bucket.count += 1;
    if (bucket.count > maxPerWindow) {
      throw new CoreApiError(
        'RATE_LIMITED',
        429,
        'Rate limit exceeded for customer experience endpoint.',
      );
    }
  };
}

export function createCustomerExperienceRouter(
  deps: CustomerExperienceModuleDependencies,
  existingService?: CustomerExperienceService,
): { router: Router; service: CustomerExperienceService } {
  const router = express.Router();
  const service = existingService ?? new CustomerExperienceService(deps);
  const checkMutationRateLimit = createWindowRateLimiter(120, 60_000);

  const requireAuth = async (req: Request): Promise<AuthenticatedPrincipal> => {
    const extraction = await extractAuthenticatedPrincipal(req, deps.tokenVerifier);
    if (!extraction.ok || !extraction.principal) {
      throw new CoreApiError(
        extraction.status === 403 ? 'FORBIDDEN' : 'UNAUTHENTICATED',
        extraction.status ?? 401,
        extraction.reason ?? 'Valid Bearer authentication token is required.',
      );
    }
    return extraction.principal;
  };

  const runMaybeIdempotent = async <T>(
    req: Request,
    principal: AuthenticatedPrincipal,
    operation: string,
    work: () => Promise<T>,
  ): Promise<{ data: T; replayed: boolean }> => {
    const rawKey = req.header('idempotency-key') || req.header('x-idempotency-key');
    if (rawKey && deps.idempotencyStore) {
      const result = await executeIdempotentMutation({
        store: deps.idempotencyStore,
        actorUid: principal.uid,
        operation: `cx:${operation}`,
        idempotencyKey: rawKey.trim(),
        requestPayload: req.body ?? {},
        mutationFn: async () => ({ statusCode: 200, body: await work() }),
      });
      return { data: result.body, replayed: result.replayed };
    }
    return { data: await work(), replayed: false };
  };

  // --------------------------------------------------------------------------
  // 2. Profile & 10. Onboarding
  // --------------------------------------------------------------------------

  router.get(
    '/profile/me',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireAuth(req);
      const profile = await service.getOrInitOwnProfile(principal);
      res.status(200).json(buildSuccessEnvelope(profile, correlationId));
    }),
  );

  router.patch(
    '/profile/me',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireAuth(req);
      checkMutationRateLimit(`profile:${principal.uid}`);
      const { data, replayed } = await runMaybeIdempotent(req, principal, 'profile.update', () =>
        service.updateOwnProfile(principal, req.body, correlationId),
      );
      res.status(200).json(buildSuccessEnvelope(data, correlationId, { idempotentReplay: replayed }));
    }),
  );

  router.get(
    '/profiles/:uid/public',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const publicView = await service.getPublicProfile(String(req.params.uid || ''));
      res.status(200).json(buildSuccessEnvelope(publicView, correlationId));
    }),
  );

  router.patch(
    '/onboarding/me',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireAuth(req);
      checkMutationRateLimit(`onboarding:${principal.uid}`);
      const updated = await service.updateOnboardingCheckpoint(principal, req.body, correlationId);
      res.status(200).json(buildSuccessEnvelope(updated, correlationId));
    }),
  );

  // --------------------------------------------------------------------------
  // 3. Preferences & Personalization
  // --------------------------------------------------------------------------

  router.get(
    '/preferences/me',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireAuth(req);
      const prefs = await service.getOwnPreferences(principal);
      res.status(200).json(buildSuccessEnvelope(prefs, correlationId));
    }),
  );

  router.patch(
    '/preferences/me',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireAuth(req);
      checkMutationRateLimit(`prefs:${principal.uid}`);
      const { data, replayed } = await runMaybeIdempotent(req, principal, 'preferences.update', () =>
        service.updateOwnPreferences(principal, req.body, correlationId),
      );
      res.status(200).json(buildSuccessEnvelope(data, correlationId, { idempotentReplay: replayed }));
    }),
  );

  // --------------------------------------------------------------------------
  // 4. Saved Properties, Favorites & Collections
  // --------------------------------------------------------------------------

  router.get(
    '/saved-properties',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireAuth(req);
      const result = await service.listSavedProperties(principal, {
        limit: req.query.limit,
        cursor: req.query.cursor,
        collectionId: typeof req.query.collectionId === 'string' ? req.query.collectionId : undefined,
        favoritesOnly: req.query.favoritesOnly === 'true',
      });
      res.status(200).json(
        buildPaginatedEnvelope(
          result.items,
          {
            limit: Number(req.query.limit) || 20,
            nextCursor: result.nextCursor,
            hasMore: result.hasMore,
            totalCount: result.totalCount,
          },
          correlationId,
        ),
      );
    }),
  );

  router.post(
    '/saved-properties',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireAuth(req);
      checkMutationRateLimit(`saved:${principal.uid}`);
      const { data, replayed } = await runMaybeIdempotent(req, principal, 'saved.upsert', () =>
        service.saveOrFavoriteProperty(principal, req.body, correlationId),
      );
      res.status(200).json(buildSuccessEnvelope(data, correlationId, { idempotentReplay: replayed }));
    }),
  );

  router.delete(
    '/saved-properties/:propertyId',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireAuth(req);
      checkMutationRateLimit(`saved:${principal.uid}`);
      const result = await service.removeSavedProperty(
        principal,
        String(req.params.propertyId || ''),
        correlationId,
      );
      res.status(200).json(buildSuccessEnvelope(result, correlationId));
    }),
  );

  router.get(
    '/collections',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireAuth(req);
      const collections = await service.listCollections(principal);
      res.status(200).json(buildSuccessEnvelope(collections, correlationId));
    }),
  );

  router.post(
    '/collections',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireAuth(req);
      checkMutationRateLimit(`collections:${principal.uid}`);
      const created = await service.createCollection(principal, req.body, correlationId);
      res.status(201).json(buildSuccessEnvelope(created, correlationId));
    }),
  );

  router.post(
    '/collections/reorder',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireAuth(req);
      checkMutationRateLimit(`collections:${principal.uid}`);
      const ordered = await service.reorderCollections(
        principal,
        req.body?.orderedCollectionIds,
        correlationId,
      );
      res.status(200).json(buildSuccessEnvelope(ordered, correlationId));
    }),
  );

  router.patch(
    '/collections/:collectionId',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireAuth(req);
      checkMutationRateLimit(`collections:${principal.uid}`);
      const updated = await service.updateCollection(
        principal,
        String(req.params.collectionId || ''),
        req.body,
        correlationId,
      );
      res.status(200).json(buildSuccessEnvelope(updated, correlationId));
    }),
  );

  router.post(
    '/collections/:collectionId/properties/:propertyId',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireAuth(req);
      checkMutationRateLimit(`collections:${principal.uid}`);
      const updated = await service.addPropertyToCollection(
        principal,
        String(req.params.collectionId || ''),
        String(req.params.propertyId || ''),
        correlationId,
      );
      res.status(200).json(buildSuccessEnvelope(updated, correlationId));
    }),
  );

  router.delete(
    '/collections/:collectionId/properties/:propertyId',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireAuth(req);
      checkMutationRateLimit(`collections:${principal.uid}`);
      const updated = await service.removePropertyFromCollection(
        principal,
        String(req.params.collectionId || ''),
        String(req.params.propertyId || ''),
        correlationId,
      );
      res.status(200).json(buildSuccessEnvelope(updated, correlationId));
    }),
  );

  router.delete(
    '/collections/:collectionId',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireAuth(req);
      checkMutationRateLimit(`collections:${principal.uid}`);
      const deleted = await service.deleteCollection(
        principal,
        String(req.params.collectionId || ''),
        correlationId,
      );
      res.status(200).json(buildSuccessEnvelope(deleted, correlationId));
    }),
  );

  // --------------------------------------------------------------------------
  // 5. Saved Searches
  // --------------------------------------------------------------------------

  router.get(
    '/saved-searches',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireAuth(req);
      const result = await service.listSavedSearches(principal, {
        limit: req.query.limit,
        cursor: req.query.cursor,
      });
      res.status(200).json(
        buildPaginatedEnvelope(
          result.items,
          {
            limit: Number(req.query.limit) || 20,
            nextCursor: result.nextCursor,
            hasMore: result.hasMore,
            totalCount: result.totalCount,
          },
          correlationId,
        ),
      );
    }),
  );

  router.post(
    '/saved-searches',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireAuth(req);
      checkMutationRateLimit(`ssearch:${principal.uid}`);
      const created = await service.createSavedSearch(principal, req.body, correlationId);
      res.status(201).json(buildSuccessEnvelope(created, correlationId));
    }),
  );

  router.patch(
    '/saved-searches/:searchId',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireAuth(req);
      checkMutationRateLimit(`ssearch:${principal.uid}`);
      const updated = await service.updateSavedSearch(
        principal,
        String(req.params.searchId || ''),
        req.body,
        correlationId,
      );
      res.status(200).json(buildSuccessEnvelope(updated, correlationId));
    }),
  );

  router.delete(
    '/saved-searches/:searchId',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireAuth(req);
      checkMutationRateLimit(`ssearch:${principal.uid}`);
      const deleted = await service.deleteSavedSearch(
        principal,
        String(req.params.searchId || ''),
        correlationId,
      );
      res.status(200).json(buildSuccessEnvelope(deleted, correlationId));
    }),
  );

  router.post(
    '/saved-searches/:searchId/execute',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireAuth(req);
      const result = await service.executeSavedSearch(
        principal,
        String(req.params.searchId || ''),
        {
          limit: req.body?.limit ?? req.query.limit,
          cursor: req.body?.cursor ?? req.query.cursor,
        },
      );
      res.status(200).json(buildSuccessEnvelope(result, correlationId));
    }),
  );

  // --------------------------------------------------------------------------
  // 6. Search Alerts & Subscriptions
  // --------------------------------------------------------------------------

  router.get(
    '/search-alerts',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireAuth(req);
      const alerts = await service.listSearchAlerts(principal);
      res.status(200).json(buildSuccessEnvelope(alerts, correlationId));
    }),
  );

  router.post(
    '/search-alerts',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireAuth(req);
      checkMutationRateLimit(`alerts:${principal.uid}`);
      const created = await service.createSearchAlert(principal, req.body, correlationId);
      res.status(201).json(buildSuccessEnvelope(created, correlationId));
    }),
  );

  router.patch(
    '/search-alerts/:alertId',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireAuth(req);
      checkMutationRateLimit(`alerts:${principal.uid}`);
      const updated = await service.updateSearchAlert(
        principal,
        String(req.params.alertId || ''),
        req.body,
        correlationId,
      );
      res.status(200).json(buildSuccessEnvelope(updated, correlationId));
    }),
  );

  router.delete(
    '/search-alerts/:alertId',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireAuth(req);
      checkMutationRateLimit(`alerts:${principal.uid}`);
      const deleted = await service.deleteSearchAlert(
        principal,
        String(req.params.alertId || ''),
        correlationId,
      );
      res.status(200).json(buildSuccessEnvelope(deleted, correlationId));
    }),
  );

  router.post(
    '/search-alerts/:alertId/execute-job',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireAuth(req);
      const decision = await verifyAdminOrDelegatedPrincipal(principal, deps.adminStore, {
        primaryAdminEmails: deps.primaryAdminEmails,
      });
      if (!decision.allowed) {
        throw new CoreApiError('FORBIDDEN', 403, 'Scheduled alert job execution requires administrative or worker privilege.');
      }
      const jobKey = String(req.body?.jobExecutionKey || req.header('idempotency-key') || '');
      const result = await service.executeSearchAlertJob(
        String(req.params.alertId || ''),
        jobKey,
      );
      res.status(200).json(
        buildSuccessEnvelope(result, correlationId, {
          idempotentReplay: result.replayed,
        }),
      );
    }),
  );

  // --------------------------------------------------------------------------
  // 7. User Activity & Recently Viewed
  // --------------------------------------------------------------------------

  router.get(
    '/activity',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireAuth(req);
      const result = await service.listUserActivity(principal, {
        limit: req.query.limit,
        cursor: req.query.cursor,
        targetType: typeof req.query.targetType === 'string' ? (req.query.targetType as any) : undefined,
      });
      res.status(200).json(
        buildPaginatedEnvelope(
          result.items,
          {
            limit: Number(req.query.limit) || 20,
            nextCursor: result.nextCursor,
            hasMore: result.hasMore,
            totalCount: result.totalCount,
          },
          correlationId,
        ),
      );
    }),
  );

  router.post(
    '/activity',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireAuth(req);
      checkMutationRateLimit(`activity:${principal.uid}`);
      const recorded = await service.recordUserActivity(principal, req.body);
      res.status(200).json(buildSuccessEnvelope(recorded, correlationId));
    }),
  );

  router.delete(
    '/activity/:entryId',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireAuth(req);
      const deleted = await service.deleteActivityEntry(principal, String(req.params.entryId || ''));
      res.status(200).json(buildSuccessEnvelope(deleted, correlationId));
    }),
  );

  router.delete(
    '/activity',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireAuth(req);
      const cleared = await service.clearActivityHistory(principal);
      res.status(200).json(buildSuccessEnvelope(cleared, correlationId));
    }),
  );

  // --------------------------------------------------------------------------
  // 8. User Dashboard Aggregation
  // --------------------------------------------------------------------------

  router.get(
    '/dashboard',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireAuth(req);
      const dashboard = await service.getUserDashboard(principal);
      res.status(200).json(buildSuccessEnvelope(dashboard, correlationId));
    }),
  );

  // --------------------------------------------------------------------------
  // 9. Privacy, Consent & User Data Rights
  // --------------------------------------------------------------------------

  router.get(
    '/privacy/consents',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireAuth(req);
      const consents = await service.listConsents(principal);
      res.status(200).json(buildSuccessEnvelope(consents, correlationId));
    }),
  );

  router.put(
    '/privacy/consents',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireAuth(req);
      checkMutationRateLimit(`privacy:${principal.uid}`);
      const consent = await service.upsertConsent(principal, req.body, correlationId);
      res.status(200).json(buildSuccessEnvelope(consent, correlationId));
    }),
  );

  router.get(
    '/privacy/data-rights',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireAuth(req);
      const list = await service.listOwnDataRightsRequests(principal);
      res.status(200).json(buildSuccessEnvelope(list, correlationId));
    }),
  );

  router.post(
    '/privacy/data-rights',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireAuth(req);
      checkMutationRateLimit(`privacy:${principal.uid}`);
      const created = await service.submitDataRightsRequest(principal, req.body, correlationId);
      res.status(201).json(buildSuccessEnvelope(created, correlationId));
    }),
  );

  // --------------------------------------------------------------------------
  // 11. User-Generated Content (UGC)
  // --------------------------------------------------------------------------

  router.get(
    '/ugc/target/:targetType/:targetId',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const result = await service.listPublishedUgcForTarget(
        String(req.params.targetType || '') as UgcTargetType,
        String(req.params.targetId || ''),
        {
          limit: req.query.limit,
          cursor: req.query.cursor,
        },
      );
      res.status(200).json(
        buildPaginatedEnvelope(
          result.items,
          {
            limit: Number(req.query.limit) || 20,
            nextCursor: result.nextCursor,
            hasMore: result.hasMore,
            totalCount: result.totalCount,
          },
          correlationId,
        ),
      );
    }),
  );

  router.post(
    '/ugc',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireAuth(req);
      checkMutationRateLimit(`ugc:${principal.uid}`);
      const created = await service.createUgcReview(principal, req.body, correlationId);
      res.status(201).json(buildSuccessEnvelope(created, correlationId));
    }),
  );

  router.patch(
    '/ugc/:ugcId',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireAuth(req);
      checkMutationRateLimit(`ugc:${principal.uid}`);
      const updated = await service.updateOwnUgcReview(
        principal,
        String(req.params.ugcId || ''),
        req.body,
        correlationId,
      );
      res.status(200).json(buildSuccessEnvelope(updated, correlationId));
    }),
  );

  router.delete(
    '/ugc/:ugcId',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireAuth(req);
      checkMutationRateLimit(`ugc:${principal.uid}`);
      const deleted = await service.deleteOwnUgcReview(
        principal,
        String(req.params.ugcId || ''),
        correlationId,
      );
      res.status(200).json(buildSuccessEnvelope(deleted, correlationId));
    }),
  );

  router.post(
    '/ugc/:ugcId/report-abuse',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireAuth(req);
      checkMutationRateLimit(`ugc:${principal.uid}`);
      const reported = await service.reportUgcAbuse(
        principal,
        String(req.params.ugcId || ''),
        req.body,
        correlationId,
      );
      res.status(200).json(buildSuccessEnvelope(reported, correlationId));
    }),
  );

  // --------------------------------------------------------------------------
  // 16. Administrative & Support Endpoints (RBAC + Audit Logged)
  // --------------------------------------------------------------------------

  router.post(
    '/admin/accounts/:targetUid/lifecycle',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireAuth(req);
      const updated = await service.adminSetAccountLifecycleStatus(
        principal,
        String(req.params.targetUid || ''),
        req.body,
        correlationId,
      );
      res.status(200).json(buildSuccessEnvelope(updated, correlationId));
    }),
  );

  router.post(
    '/admin/privacy/data-rights/:requestId/review',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireAuth(req);
      const updated = await service.adminReviewDataRightsRequest(
        principal,
        String(req.params.requestId || ''),
        req.body,
        correlationId,
      );
      res.status(200).json(buildSuccessEnvelope(updated, correlationId));
    }),
  );

  router.post(
    '/admin/privacy/data-rights/:requestId/confirm-domain',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireAuth(req);
      const updated = await service.confirmDataRightsDomainCompletion(
        principal,
        String(req.params.requestId || ''),
        req.body,
        correlationId,
      );
      res.status(200).json(buildSuccessEnvelope(updated, correlationId));
    }),
  );

  router.post(
    '/admin/ugc/:ugcId/moderate',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireAuth(req);
      const updated = await service.adminModerateUgc(
        principal,
        String(req.params.ugcId || ''),
        req.body,
        correlationId,
      );
      res.status(200).json(buildSuccessEnvelope(updated, correlationId));
    }),
  );

  return { router, service };
}

export function registerCustomerExperienceRoutes(
  app: Express,
  deps: CustomerExperienceModuleDependencies,
  basePath = '/api/v1/cx',
): CustomerExperienceService {
  const { router, service } = createCustomerExperienceRouter(deps);
  app.use(basePath, router);
  return service;
}
