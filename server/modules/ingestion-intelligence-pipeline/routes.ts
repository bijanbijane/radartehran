/**
 * EMPLOYEE 70 — REAL ESTATE DATA INGESTION & INTELLIGENCE PIPELINE HTTP ROUTES
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
import type { IngestionIntelligencePipelineService } from './service';

export function createIngestionIntelligencePipelineRouter(
  service: IngestionIntelligencePipelineService,
  tokenVerifier: FirebaseTokenVerifierAdapter,
): Router {
  const router = Router();

  const requireAuth = async (req: Request): Promise<AuthenticatedPrincipal> => {
    const extraction = await extractAuthenticatedPrincipal(req, tokenVerifier);
    if (!extraction.ok || !extraction.principal) {
      throw new CoreApiError(
        'UNAUTHENTICATED',
        extraction.status ?? 401,
        extraction.reason ?? 'Authentication required for ingestion pipeline operations.',
      );
    }
    return extraction.principal;
  };

  router.post(
    '/sources',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const actor = await requireAuth(req);
      const record = await service.registerDataSource(actor, req.body, correlationId);
      res.status(201).json(buildSuccessEnvelope(record, correlationId));
    }),
  );

  router.patch(
    '/sources/:sourceId/status',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const actor = await requireAuth(req);
      const record = await service.setDataSourceStatus(
        actor,
        String(req.params.sourceId),
        req.body.status,
        correlationId,
      );
      res.status(200).json(buildSuccessEnvelope(record, correlationId));
    }),
  );

  router.post(
    '/batches/execute',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const actor = await requireAuth(req);
      const result = await service.executeIngestionPipelineBatch(actor, req.body, correlationId);
      res.status(201).json(buildSuccessEnvelope(result, correlationId));
    }),
  );

  router.post(
    '/batches/:batchId/decision',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const actor = await requireAuth(req);
      const batch = await service.approveOrRollbackBatch(
        actor,
        String(req.params.batchId),
        req.body.decision,
        req.body.reason,
        correlationId,
      );
      res.status(200).json(buildSuccessEnvelope(batch, correlationId));
    }),
  );

  router.post(
    '/resolutions/:normalizedRecordId/review',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const actor = await requireAuth(req);
      const resolution = await service.reviewAmbiguousEntityCandidate(
        actor,
        String(req.params.normalizedRecordId),
        req.body.decision,
        req.body.targetCanonicalPropertyId,
        correlationId,
      );
      res.status(200).json(buildSuccessEnvelope(resolution, correlationId));
    }),
  );

  router.get(
    '/metrics',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const actor = await requireAuth(req);
      const metrics = service.getOperationalMetrics(actor);
      res.status(200).json(buildSuccessEnvelope(metrics, correlationId));
    }),
  );

  return router;
}
