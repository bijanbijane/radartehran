import { Router, type Request, type Response } from 'express';
import {
  buildSuccessEnvelope,
  CoreApiError,
  extractAuthenticatedPrincipal,
  resolveCorrelationId,
  withStandardErrorBoundary,
  type AuthenticatedPrincipal,
} from '../core';
import { createDataIngestionService } from './service';
import type { DataIngestionModuleDependencies } from './types';

/**
 * Standalone Express router factory for Employee 14 — External Data Ingestion & Governance Module.
 * Exported explicitly without modifying `server.ts` or global route files.
 */
export function createDataIngestionRouter(deps: DataIngestionModuleDependencies): Router {
  const router = Router();
  const service = createDataIngestionService(deps);

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

  router.post(
    '/sources',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const principal = await requireVerifiedPrincipal(req);
      const correlationId = resolveCorrelationId(req);
      const idempotencyKey = String(req.headers['idempotency-key'] ?? '');
      const result = await service.registerDataSource({
        principal,
        idempotencyKey,
        rawBody: req.body,
        correlationId,
      });
      res.status(result.statusCode).json(
        buildSuccessEnvelope({ source: result.source, replayed: result.replayed }, correlationId, {
          idempotentReplay: result.replayed,
        }),
      );
    }),
  );

  router.post(
    '/jobs',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const principal = await requireVerifiedPrincipal(req);
      const correlationId = resolveCorrelationId(req);
      const idempotencyKey = String(req.headers['idempotency-key'] ?? '');
      const result = await service.createImportJob({
        principal,
        idempotencyKey,
        rawBody: req.body,
        correlationId,
      });
      res.status(result.statusCode).json(
        buildSuccessEnvelope({ job: result.job, replayed: result.replayed }, correlationId, {
          idempotentReplay: result.replayed,
        }),
      );
    }),
  );

  router.post(
    '/jobs/:jobId/batches',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const principal = await requireVerifiedPrincipal(req);
      const correlationId = resolveCorrelationId(req);
      const result = await service.ingestRecordsBatch({
        principal,
        jobId: String(req.params.jobId ?? ''),
        rawBody: req.body,
        correlationId,
      });
      res.status(200).json(buildSuccessEnvelope(result, correlationId));
    }),
  );

  router.post(
    '/jobs/:jobId/structured-file',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const principal = await requireVerifiedPrincipal(req);
      const correlationId = resolveCorrelationId(req);
      const result = await service.ingestStructuredFile({
        principal,
        jobId: String(req.params.jobId ?? ''),
        rawBody: req.body,
        correlationId,
      });
      res.status(200).json(buildSuccessEnvelope(result, correlationId));
    }),
  );

  router.post(
    '/jobs/:jobId/moderate',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const principal = await requireVerifiedPrincipal(req);
      const correlationId = resolveCorrelationId(req);
      const result = await service.moderateImportJob({
        principal,
        jobId: String(req.params.jobId ?? ''),
        rawBody: req.body,
        correlationId,
      });
      res.status(200).json(buildSuccessEnvelope(result, correlationId));
    }),
  );

  router.post(
    '/jobs/:jobId/publish',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const principal = await requireVerifiedPrincipal(req);
      const correlationId = resolveCorrelationId(req);
      const idempotencyKey = String(req.headers['idempotency-key'] ?? '');
      const result = await service.publishApprovedJob({
        principal,
        jobId: String(req.params.jobId ?? ''),
        idempotencyKey,
        correlationId,
      });
      res.status(200).json(
        buildSuccessEnvelope(result, correlationId, { idempotentReplay: result.replayed }),
      );
    }),
  );

  router.get(
    '/jobs/:jobId/reconciliation',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const principal = await requireVerifiedPrincipal(req);
      const correlationId = resolveCorrelationId(req);
      const report = await service.getReconciliationReport({
        principal,
        jobId: String(req.params.jobId ?? ''),
        correlationId,
      });
      res.status(200).json(buildSuccessEnvelope({ report }, correlationId));
    }),
  );

  return router;
}
