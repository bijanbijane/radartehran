import { Router, type Request, type Response } from 'express';
import {
  CoreApiError,
  buildErrorEnvelope,
  buildSuccessEnvelope,
  extractAuthenticatedPrincipal,
  resolveCorrelationId,
  verifyAdminOrDelegatedPrincipal,
} from '../core';
import type { ValuationModuleDependencies } from './types';
import type { ValuationService } from './service';

export function createValuationRouter(service: ValuationService, deps: ValuationModuleDependencies): Router {
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
        message: err instanceof Error ? err.message : 'Unexpected valuation error.',
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
      throw new CoreApiError('FORBIDDEN', 403, 'Admin privileges required for this valuation operation.');
    }
    return authRes.principal;
  }

  // Public/user valuation estimate
  router.post('/estimate', async (req: Request, res: Response) => {
    const cid = resolveCorrelationId(req);
    try {
      const result = await service.estimatePropertyValue(req.body, { includeDiagnostics: false });
      res.status(200).json(buildSuccessEnvelope(result, cid));
    } catch (err) {
      handleRouteError(res, err, cid);
    }
  });

  // Public neighborhood baseline & market indicators
  router.get('/neighborhoods/:cityId/:hoodId/baseline', async (req: Request, res: Response) => {
    const cid = resolveCorrelationId(req);
    try {
      const baseline = await service.computeNeighborhoodBaseline({
        cityId: String(req.params.cityId),
        hoodId: Number(req.params.hoodId),
        propertyCategory: (req.query.propertyCategory as any) ?? 'residential',
        transactionType: (req.query.transactionType as any) ?? 'sale',
      });
      res.status(200).json(buildSuccessEnvelope(baseline, cid));
    } catch (err) {
      handleRouteError(res, err, cid);
    }
  });

  // Public evidence list (strips private participant fields)
  router.get('/evidence', async (req: Request, res: Response) => {
    const cid = resolveCorrelationId(req);
    try {
      const items = service.listMarketEvidence({
        cityId: typeof req.query.cityId === 'string' ? req.query.cityId : undefined,
        hoodId: req.query.hoodId !== undefined ? Number(req.query.hoodId) : undefined,
        includePrivateFields: false,
      });
      res.status(200).json(buildSuccessEnvelope({ items }, cid));
    } catch (err) {
      handleRouteError(res, err, cid);
    }
  });

  // Admin: review/override market evidence
  router.post('/admin/evidence/review', async (req: Request, res: Response) => {
    const cid = resolveCorrelationId(req);
    try {
      const admin = await requireAdmin(req);
      const updated = await service.reviewMarketEvidence({
        actorUid: admin.uid,
        decision: req.body,
      });
      res.status(200).json(buildSuccessEnvelope(updated, cid));
    } catch (err) {
      handleRouteError(res, err, cid);
    }
  });

  // Admin: update model configuration
  router.post('/admin/model-config', async (req: Request, res: Response) => {
    const cid = resolveCorrelationId(req);
    try {
      const admin = await requireAdmin(req);
      const cfg = await service.upsertModelConfiguration({
        actorUid: admin.uid,
        modelVersion: String(req.body.modelVersion ?? ''),
        changeReason: String(req.body.changeReason ?? ''),
        updates: req.body.updates ?? {},
      });
      res.status(200).json(buildSuccessEnvelope(cfg, cid));
    } catch (err) {
      handleRouteError(res, err, cid);
    }
  });

  // Admin: rollback model configuration
  router.post('/admin/model-config/rollback', async (req: Request, res: Response) => {
    const cid = resolveCorrelationId(req);
    try {
      const admin = await requireAdmin(req);
      const cfg = await service.rollbackModelConfiguration({
        actorUid: admin.uid,
        targetConfigId: req.body.targetConfigId,
        reason: String(req.body.reason ?? 'Admin rollback'),
      });
      res.status(200).json(buildSuccessEnvelope(cfg, cid));
    } catch (err) {
      handleRouteError(res, err, cid);
    }
  });

  return router;
}
