import { Router, type Request, type Response } from 'express';
import {
  CoreApiError,
  buildErrorEnvelope,
  buildSuccessEnvelope,
  extractAuthenticatedPrincipal,
  resolveCorrelationId,
  verifyAdminOrDelegatedPrincipal,
} from '../core';
import type { MarketIntelligenceDependencies } from './types';
import type { MarketIntelligenceService } from './service';

export function createMarketIntelligenceRouter(
  service: MarketIntelligenceService,
  deps: MarketIntelligenceDependencies = {},
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
        message: err instanceof Error ? err.message : 'Unexpected market intelligence error.',
        correlationId,
      }),
    );
  }

  async function requireAdmin(req: Request) {
    if (!deps.tokenVerifier || !deps.adminStore) {
      throw new CoreApiError('FORBIDDEN', 403, 'Administrative authorization infrastructure is not configured.');
    }
    const authRes = await extractAuthenticatedPrincipal(req, deps.tokenVerifier, { requireVerifiedEmail: false });
    if (!authRes.ok || !authRes.principal) {
      throw new CoreApiError('UNAUTHORIZED', 401, authRes.reason ?? 'Authentication required.');
    }
    const adminCheck = await verifyAdminOrDelegatedPrincipal(authRes.principal, deps.adminStore, {
      primaryAdminEmails: deps.primaryAdminEmails,
    });
    if (!adminCheck.allowed) {
      throw new CoreApiError('FORBIDDEN', 403, 'Admin privileges required for this market intelligence operation.');
    }
    return authRes.principal;
  }

  // Public: neighborhood market overview
  router.get('/neighborhoods/:cityId/:hoodId/profile', (req: Request, res: Response) => {
    const cid = resolveCorrelationId(req);
    try {
      const profile = service.getNeighborhoodMarketProfile({
        cityId: String(req.params.cityId),
        hoodId: Number(req.params.hoodId),
        isPublicRequest: true,
      });
      res.status(200).json(buildSuccessEnvelope(profile, cid));
    } catch (err) {
      handleRouteError(res, err, cid);
    }
  });

  // Public: temporal market trends
  router.get('/trends/:cityId', (req: Request, res: Response) => {
    const cid = resolveCorrelationId(req);
    try {
      const nowIso = (deps.now ?? (() => new Date()))().toISOString();
      const series = service.getTemporalMarketSeries({
        cityId: String(req.params.cityId),
        hoodId: req.query.hoodId !== undefined ? Number(req.query.hoodId) : undefined,
        propertyCategory: (req.query.propertyCategory as any) ?? 'residential',
        transactionType: (req.query.transactionType as any) ?? 'sale',
        granularity: (req.query.granularity as any) ?? 'monthly',
        periodStartIso:
          typeof req.query.periodStartIso === 'string'
            ? req.query.periodStartIso
            : new Date(Date.parse(nowIso) - 180 * 24 * 60 * 60 * 1000).toISOString(),
        periodEndIso: typeof req.query.periodEndIso === 'string' ? req.query.periodEndIso : nowIso,
      });
      res.status(200).json(buildSuccessEnvelope(series, cid));
    } catch (err) {
      handleRouteError(res, err, cid);
    }
  });

  // Public: geographic comparisons
  router.post('/comparisons', (req: Request, res: Response) => {
    const cid = resolveCorrelationId(req);
    try {
      const entries = service.compareNeighborhoods({
        cityId: String(req.body.cityId ?? 'tehran'),
        hoodIds: Array.isArray(req.body.hoodIds) ? req.body.hoodIds.map(Number) : [],
        propertyCategory: req.body.propertyCategory ?? 'residential',
        transactionType: req.body.transactionType ?? 'sale',
      });
      res.status(200).json(buildSuccessEnvelope({ items: entries }, cid));
    } catch (err) {
      handleRouteError(res, err, cid);
    }
  });

  // Public: publicly approved anomalies only
  router.get('/anomalies', (req: Request, res: Response) => {
    const cid = resolveCorrelationId(req);
    try {
      const items = service.listAnomalies({
        cityId: typeof req.query.cityId === 'string' ? req.query.cityId : undefined,
        hoodId: req.query.hoodId !== undefined ? Number(req.query.hoodId) : undefined,
        onlyPubliclyApproved: true,
      });
      res.status(200).json(buildSuccessEnvelope({ items }, cid));
    } catch (err) {
      handleRouteError(res, err, cid);
    }
  });

  // Admin: review anomaly
  router.post('/admin/anomalies/:anomalyId/review', async (req: Request, res: Response) => {
    const cid = resolveCorrelationId(req);
    try {
      const admin = await requireAdmin(req);
      const updated = service.reviewAnomaly({
        actorUid: admin.uid,
        anomalyId: String(req.params.anomalyId),
        decision: req.body.decision,
        notes: String(req.body.notes ?? ''),
      });
      res.status(200).json(buildSuccessEnvelope(updated, cid));
    } catch (err) {
      handleRouteError(res, err, cid);
    }
  });

  // Admin: trigger aggregation/backfill/recalculation job
  router.post('/admin/jobs/aggregate', async (req: Request, res: Response) => {
    const cid = resolveCorrelationId(req);
    try {
      const admin = await requireAdmin(req);
      const job = await service.runAggregationJob({
        actorUid: admin.uid,
        idempotencyKey: String(req.body.idempotencyKey ?? cid),
        jobType: req.body.jobType ?? 'RECALCULATION',
        cityId: String(req.body.cityId ?? 'tehran'),
        hoodIds: Array.isArray(req.body.hoodIds) ? req.body.hoodIds.map(Number) : [],
        propertyCategory: req.body.propertyCategory,
      });
      res.status(200).json(buildSuccessEnvelope(job, cid));
    } catch (err) {
      handleRouteError(res, err, cid);
    }
  });

  // Admin: update configuration
  router.patch('/admin/config', async (req: Request, res: Response) => {
    const cid = resolveCorrelationId(req);
    try {
      const admin = await requireAdmin(req);
      const cfg = service.updateConfiguration({
        actorUid: admin.uid,
        updates: req.body ?? {},
      });
      res.status(200).json(buildSuccessEnvelope(cfg, cid));
    } catch (err) {
      handleRouteError(res, err, cid);
    }
  });

  return router;
}
