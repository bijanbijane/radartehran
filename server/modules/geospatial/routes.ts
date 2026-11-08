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

export function createGeospatialRouter(
  service: GeospatialService,
  deps: GeospatialModuleDependencies = {},
): Router {
  const router = Router();

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
