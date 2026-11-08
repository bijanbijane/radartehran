import { Router, type Request, type Response } from 'express';
import {
  CoreApiError,
  buildErrorEnvelope,
  buildSuccessEnvelope,
  extractAuthenticatedPrincipal,
  resolveCorrelationId,
  verifyAdminOrDelegatedPrincipal,
} from '../core';
import type { DataGovernanceDependencies } from './types';
import type { DataGovernanceService } from './service';

export function createDataGovernanceRouter(
  service: DataGovernanceService,
  deps: DataGovernanceDependencies = {},
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
        message: err instanceof Error ? err.message : 'Unexpected data governance error.',
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
      throw new CoreApiError('FORBIDDEN', 403, 'Admin privileges required for this data governance operation.');
    }
    return authRes.principal;
  }

  router.get('/admin/dashboard-summary', async (req: Request, res: Response) => {
    const cid = resolveCorrelationId(req);
    try {
      await requireAdmin(req);
      const summary = service.getGovernanceDashboardSummary();
      res.status(200).json(buildSuccessEnvelope(summary, cid));
    } catch (err) {
      handleRouteError(res, err, cid);
    }
  });

  router.get('/admin/records', async (req: Request, res: Response) => {
    const cid = resolveCorrelationId(req);
    try {
      await requireAdmin(req);
      const resPage = service.listMasterRecordsPaginated({
        entityType: typeof req.query.entityType === 'string' ? (req.query.entityType as any) : undefined,
        page: req.query.page !== undefined ? Number(req.query.page) : 1,
        pageSize: req.query.pageSize !== undefined ? Number(req.query.pageSize) : 20,
      });
      res.status(200).json(buildSuccessEnvelope(resPage, cid));
    } catch (err) {
      handleRouteError(res, err, cid);
    }
  });

  router.post('/admin/duplicates/merge', async (req: Request, res: Response) => {
    const cid = resolveCorrelationId(req);
    try {
      const admin = await requireAdmin(req);
      const mrg = service.mergeDuplicateEntities({
        actorUid: admin.uid,
        isAdmin: true,
        groupId: req.body.groupId,
        survivingCanonicalId: String(req.body.survivingCanonicalId ?? ''),
        retiredCanonicalIds: Array.isArray(req.body.retiredCanonicalIds) ? req.body.retiredCanonicalIds : [],
        reason: String(req.body.reason ?? ''),
      });
      res.status(200).json(buildSuccessEnvelope(mrg, cid));
    } catch (err) {
      handleRouteError(res, err, cid);
    }
  });

  router.post('/admin/corrections/:proposalId/review', async (req: Request, res: Response) => {
    const cid = resolveCorrelationId(req);
    try {
      const admin = await requireAdmin(req);
      const rev = service.reviewCorrectionProposal({
        actorUid: admin.uid,
        isAdmin: true,
        proposalId: String(req.params.proposalId),
        decision: req.body.decision,
        reviewNotes: String(req.body.reviewNotes ?? ''),
      });
      res.status(200).json(buildSuccessEnvelope(rev, cid));
    } catch (err) {
      handleRouteError(res, err, cid);
    }
  });

  return router;
}
