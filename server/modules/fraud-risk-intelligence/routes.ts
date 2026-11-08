/**
 * EMPLOYEE 71 — REAL ESTATE FRAUD DETECTION & RISK INTELLIGENCE HTTP ROUTES
 */

import { Router, type Request, type Response } from 'express';
import {
  buildSuccessEnvelope,
  CoreApiError,
  extractAuthenticatedPrincipal,
  resolveCorrelationId,
  withStandardErrorBoundary,
  type AuthenticatedPrincipal,
  type FirebaseTokenVerifierAdapter,
} from '../core';
import type { FraudRiskIntelligenceService } from './service';

export function createFraudRiskIntelligenceRouter(
  service: FraudRiskIntelligenceService,
  tokenVerifier: FirebaseTokenVerifierAdapter,
): Router {
  const router = Router();

  const requireAuth = async (req: Request): Promise<AuthenticatedPrincipal> => {
    const extraction = await extractAuthenticatedPrincipal(req, tokenVerifier);
    if (!extraction.ok || !extraction.principal) {
      throw new CoreApiError(
        'UNAUTHENTICATED',
        extraction.status ?? 401,
        extraction.reason ?? 'Authentication required for risk intelligence endpoints.',
      );
    }
    return extraction.principal;
  };

  router.post(
    '/signals',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const actor = await requireAuth(req);
      const result = await service.ingestRiskSignal(actor, req.body, correlationId);
      res.status(result.deduplicated ? 200 : 201).json(buildSuccessEnvelope(result, correlationId));
    }),
  );

  router.post(
    '/rules',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const actor = await requireAuth(req);
      const rule = await service.upsertRiskRule(actor, req.body, correlationId);
      res.status(201).json(buildSuccessEnvelope(rule, correlationId));
    }),
  );

  router.post(
    '/assessments/recalculate',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const actor = await requireAuth(req);
      const assessment = await service.recalculateEntityRiskAssessment(
        actor,
        req.body.entityType,
        req.body.entityId,
        req.body.options,
        correlationId,
      );
      res.status(200).json(buildSuccessEnvelope(assessment, correlationId));
    }),
  );

  router.post(
    '/reviews/decide',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const actor = await requireAuth(req);
      const result = await service.recordHumanReviewDecision(actor, req.body, correlationId);
      res.status(200).json(buildSuccessEnvelope(result, correlationId));
    }),
  );

  router.post(
    '/actions/execute',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const actor = await requireAuth(req);
      const result = await service.executeProtectiveAction(actor, req.body, correlationId);
      res.status(201).json(buildSuccessEnvelope(result, correlationId));
    }),
  );

  router.get(
    '/evidences/:evidenceId',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const actor = await requireAuth(req);
      const ev = service.getAuthorizedEvidence(actor, String(req.params.evidenceId));
      res.status(200).json(buildSuccessEnvelope(ev, correlationId));
    }),
  );

  router.get(
    '/overview',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const actor = await requireAuth(req);
      const overview = service.getAdminOverviewAndMetrics(actor);
      res.status(200).json(buildSuccessEnvelope(overview, correlationId));
    }),
  );

  return router;
}
