import { Router, type Request, type Response } from 'express';
import {
  CoreApiError,
  buildErrorEnvelope,
  buildSuccessEnvelope,
  extractAuthenticatedPrincipal,
  resolveCorrelationId,
  verifyAdminOrDelegatedPrincipal,
} from '../core';
import type { GeospatialModuleDependencies } from './types';
import type { GeospatialService } from './service';
import { getCloudflareSessionContext } from '../../../src/utils/serverCloudflareSessionBridge';
import { getGeospatialPersistenceHealth } from './geospatialDurableRecovery';

export function createGeospatialRouter(
  service: GeospatialService,
  deps: GeospatialModuleDependencies = {},
): Router {
  const router = Router();

  router.use((req: Request, res: Response, next) => {
    const health = getGeospatialPersistenceHealth();
    if (health === 'READY') {
      next();
      return;
    }
    res.setHeader('Cache-Control', 'no-store');
    res.status(503).json(buildErrorEnvelope({
      code: 'PERSISTENCE_FAILED',
      message: 'Geospatial services are unavailable until a verified durable snapshot is recovered.',
      // Keep public outage responses intentionally low-detail. Recovery
      // diagnostics can contain internal validation context and belong in
      // authenticated operational telemetry, not an unauthenticated API body.
      details: {
        health,
        recoveryRequired: true,
      },
      correlationId: resolveCorrelationId(req),
    }));
  });

  function handleRouteError(res: Response, err: unknown, correlationId: string) {
    if (err instanceof CoreApiError) {
      res.status(err.status).json(
        buildErrorEnvelope({
          code: err.code,
          message: err.message,
          details: err.details,
          correlationId,
        }),
      );
      return;
    }
    res.status(500).json(
      buildErrorEnvelope({
        code: 'INTERNAL_ERROR',
        message: err instanceof Error ? err.message : 'Unexpected geospatial error.',
        correlationId,
      }),
    );
  }

  async function checkIsAdmin(req: Request): Promise<{ isAdmin: boolean; uid?: string }> {
    // A verified Worker assertion is the canonical identity path. Never downgrade
    // a present Cloudflare session to legacy Firebase authorization.
    const sessionPrincipal = getCloudflareSessionContext();
    if (sessionPrincipal) {
      return {
        isAdmin: sessionPrincipal.isAdmin
          && (sessionPrincipal.isPrimaryAdmin || sessionPrincipal.isDelegatedAdmin),
        uid: sessionPrincipal.uid,
      };
    }
    if (!deps.tokenVerifier || !deps.adminStore) return { isAdmin: false };
    const authRes = await extractAuthenticatedPrincipal(req, deps.tokenVerifier, { requireVerifiedEmail: false });
    if (!authRes.ok || !authRes.principal) return { isAdmin: false };
    const adminCheck = await verifyAdminOrDelegatedPrincipal(authRes.principal, deps.adminStore, {
      primaryAdminEmails: deps.primaryAdminEmails,
    });
    return { isAdmin: adminCheck.allowed, uid: authRes.principal.uid };
  }

  // Resolve coordinate to geographic hierarchy
  router.get('/resolve-point', (req: Request, res: Response) => {
    const cid = resolveCorrelationId(req);
    try {
      const result = service.resolvePointToGeography(req.query.lat, req.query.lng);
      res.status(200).json(buildSuccessEnvelope(result, cid));
    } catch (err) {
      handleRouteError(res, err, cid);
    }
  });

  // Read-only profile boundary evidence. Missing registries or unreviewed legacy records remain blocked.
  router.get('/neighborhood-boundaries/:cityId/:hoodId/profile-evidence', async (req: Request, res: Response) => {
    const cid = resolveCorrelationId(req);
    try {
      const cityId = String(req.params.cityId ?? '').trim();
      const hoodId = Number(req.params.hoodId);
      if (!/^[a-zA-Z0-9_-]{1,64}$/.test(cityId)
        || !Number.isSafeInteger(hoodId)
        || hoodId < 1
        || hoodId > 9999) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid city or neighborhood identifier.');
      }
      const result = await service.getNeighborhoodProfileBoundaryReadModel({ cityId, hoodId });
      res.setHeader('Cache-Control', 'private, no-store');
      res.status(200).json(buildSuccessEnvelope(result, cid));
    } catch (err) {
      handleRouteError(res, err, cid);
    }
  });

  // Boundary approval is an authenticated, independent second-person action.
  router.post('/neighborhood-boundaries/:cityId/:hoodId/versions/:versionId/approve', async (req: Request, res: Response) => {
    const cid = resolveCorrelationId(req);
    try {
      const { isAdmin, uid } = await checkIsAdmin(req);
      if (!isAdmin || !uid) {
        throw new CoreApiError('FORBIDDEN', 403, 'Only an authorized administrator can review a neighborhood boundary.');
      }
      const cityId = String(req.params.cityId ?? '').trim();
      const hoodId = Number(req.params.hoodId);
      const versionId = String(req.params.versionId ?? '').trim();
      if (!/^[a-zA-Z0-9_-]{1,64}$/.test(cityId)
        || !Number.isSafeInteger(hoodId)
        || hoodId < 1
        || hoodId > 9999
        || !/^[a-zA-Z0-9_-]{1,128}$/.test(versionId)) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid boundary approval identifier.');
      }
      const approved = await service.approveNeighborhoodBoundary({
        entityId: `hood:${cityId}:${hoodId}`,
        versionId,
        reviewerUid: uid,
      });
      res.setHeader('Cache-Control', 'no-store');
      res.status(200).json(buildSuccessEnvelope(approved, cid));
    } catch (err) {
      handleRouteError(res, err, cid);
    }
  });

  // Spatial listing search
  router.post('/search', (req: Request, res: Response) => {
    const cid = resolveCorrelationId(req);
    try {
      const result = service.searchListingsSpatially(req.body);
      res.status(200).json(buildSuccessEnvelope(result, cid));
    } catch (err) {
      handleRouteError(res, err, cid);
    }
  });

  // Nearby points of interest
  router.get('/pois/nearby', (req: Request, res: Response) => {
    const cid = resolveCorrelationId(req);
    try {
      const items = service.findNearbyPointsOfInterest({
        cityId: String(req.query.cityId ?? 'tehran'),
        center: { lat: Number(req.query.lat), lng: Number(req.query.lng) },
        radiusMeters: Number(req.query.radiusMeters ?? 1500),
      });
      res.status(200).json(buildSuccessEnvelope({ items }, cid));
    } catch (err) {
      handleRouteError(res, err, cid);
    }
  });

  // Location context & accessibility indicators
  router.get('/location-context', (req: Request, res: Response) => {
    const cid = resolveCorrelationId(req);
    try {
      const ctx = service.getLocationContext({
        cityId: String(req.query.cityId ?? 'tehran'),
        coordinates: { lat: Number(req.query.lat), lng: Number(req.query.lng) },
        hoodId: req.query.hoodId !== undefined ? Number(req.query.hoodId) : undefined,
      });
      res.status(200).json(buildSuccessEnvelope(ctx, cid));
    } catch (err) {
      handleRouteError(res, err, cid);
    }
  });

  // Geographic overlay retrieval with public/admin access enforcement
  router.get('/overlays/:layerId', async (req: Request, res: Response) => {
    const cid = resolveCorrelationId(req);
    try {
      const { isAdmin } = await checkIsAdmin(req);
      const overlay = service.getGeographicOverlay({
        layerId: String(req.params.layerId),
        isAdminCaller: isAdmin,
      });
      res.status(200).json(buildSuccessEnvelope(overlay, cid));
    } catch (err) {
      handleRouteError(res, err, cid);
    }
  });

  // Spatial market summary (integrated with Employee 60)
  router.get('/market-summary/:cityId/:hoodId', (req: Request, res: Response) => {
    const cid = resolveCorrelationId(req);
    try {
      const summary = service.getSpatialMarketSummary({
        cityId: String(req.params.cityId),
        hoodId: Number(req.params.hoodId),
      });
      res.status(200).json(buildSuccessEnvelope(summary, cid));
    } catch (err) {
      handleRouteError(res, err, cid);
    }
  });

  return router;
}
