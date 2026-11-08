import express, { type Request, type Response, type Router } from 'express';
import {
  buildSuccessEnvelope,
  CoreApiError,
  extractAuthenticatedPrincipal,
  resolveCorrelationId,
  withStandardErrorBoundary,
  type AuthenticatedPrincipal,
} from '../core';
import { createTenancyManagementService } from './service';
import type { TenancyModuleDependencies } from './types';

function extractIdempotencyKey(req: Request): string {
  const raw = req.headers['idempotency-key'] ?? req.headers['x-idempotency-key'];
  if (typeof raw === 'string' && raw.trim().length > 0) {
    return raw.trim();
  }
  throw new CoreApiError(
    'VALIDATION_FAILED',
    400,
    'Idempotency-Key header is required for tenancy mutations.',
  );
}

export function createTenancyManagementRouter(deps: TenancyModuleDependencies): Router {
  const router = express.Router({ mergeParams: true });
  const service = createTenancyManagementService(deps);

  async function requireAuth(req: Request): Promise<AuthenticatedPrincipal> {
    const auth = await extractAuthenticatedPrincipal(req, deps.tokenVerifier, {
      requireVerifiedEmail: false,
    });
    if (!auth.ok || !auth.principal) {
      throw new CoreApiError(
        'UNAUTHENTICATED',
        auth.status ?? 401,
        auth.reason ?? 'Authentication required.',
      );
    }
    return auth.principal;
  }

  router.put(
    '/properties/:propertyId/config',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireAuth(req);
      const result = await service.upsertRentalPropertyConfig({
        principal,
        propertyId: String(req.params.propertyId),
        rawInput: req.body,
        idempotencyKey: extractIdempotencyKey(req),
        correlationId,
      });
      res.status(result.statusCode).json(
        buildSuccessEnvelope(result.body, correlationId, { idempotentReplay: result.replayed }),
      );
    }),
  );

  router.get(
    '/properties/:propertyId/overview',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireAuth(req);
      const data = await service.getPropertyTenancyOverview({
        principal,
        propertyId: String(req.params.propertyId),
      });
      res.status(200).json(buildSuccessEnvelope(data, correlationId));
    }),
  );

  router.post(
    '/properties/:propertyId/applications',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireAuth(req);
      const result = await service.createRentalApplication({
        principal,
        propertyId: String(req.params.propertyId),
        rawInput: req.body,
        idempotencyKey: extractIdempotencyKey(req),
        correlationId,
      });
      res.status(result.statusCode).json(
        buildSuccessEnvelope(result.body, correlationId, { idempotentReplay: result.replayed }),
      );
    }),
  );

  router.post(
    '/properties/:propertyId/applications/:applicationId/decision',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireAuth(req);
      const result = await service.decideRentalApplication({
        principal,
        propertyId: String(req.params.propertyId),
        applicationId: String(req.params.applicationId),
        rawInput: req.body,
        idempotencyKey: extractIdempotencyKey(req),
        correlationId,
      });
      res.status(result.statusCode).json(
        buildSuccessEnvelope(result.body, correlationId, { idempotentReplay: result.replayed }),
      );
    }),
  );

  router.post(
    '/properties/:propertyId/applications/:applicationId/screening',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireAuth(req);
      const result = await service.recordTenantScreening({
        principal,
        propertyId: String(req.params.propertyId),
        applicationId: String(req.params.applicationId),
        rawInput: req.body,
        idempotencyKey: extractIdempotencyKey(req),
        correlationId,
      });
      res.status(result.statusCode).json(
        buildSuccessEnvelope(result.body, correlationId, { idempotentReplay: result.replayed }),
      );
    }),
  );

  router.post(
    '/properties/:propertyId/leases',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireAuth(req);
      const result = await service.createLeaseAgreement({
        principal,
        propertyId: String(req.params.propertyId),
        rawInput: req.body,
        idempotencyKey: extractIdempotencyKey(req),
        correlationId,
      });
      res.status(result.statusCode).json(
        buildSuccessEnvelope(result.body, correlationId, { idempotentReplay: result.replayed }),
      );
    }),
  );

  router.post(
    '/properties/:propertyId/leases/:leaseId/workflow',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireAuth(req);
      const result = await service.performLeaseWorkflowAction({
        principal,
        propertyId: String(req.params.propertyId),
        leaseId: String(req.params.leaseId),
        rawInput: req.body,
        idempotencyKey: extractIdempotencyKey(req),
        correlationId,
      });
      res.status(result.statusCode).json(
        buildSuccessEnvelope(result.body, correlationId, { idempotentReplay: result.replayed }),
      );
    }),
  );

  router.post(
    '/properties/:propertyId/leases/:leaseId/deposit',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireAuth(req);
      const result = await service.performDepositOperation({
        principal,
        propertyId: String(req.params.propertyId),
        leaseId: String(req.params.leaseId),
        rawInput: req.body,
        idempotencyKey: extractIdempotencyKey(req),
        correlationId,
      });
      res.status(result.statusCode).json(
        buildSuccessEnvelope(result.body, correlationId, { idempotentReplay: result.replayed }),
      );
    }),
  );

  router.post(
    '/properties/:propertyId/leases/:leaseId/renewals',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireAuth(req);
      const result = await service.proposeLeaseRenewal({
        principal,
        propertyId: String(req.params.propertyId),
        leaseId: String(req.params.leaseId),
        rawInput: req.body,
        idempotencyKey: extractIdempotencyKey(req),
        correlationId,
      });
      res.status(result.statusCode).json(
        buildSuccessEnvelope(result.body, correlationId, { idempotentReplay: result.replayed }),
      );
    }),
  );

  router.post(
    '/properties/:propertyId/leases/:leaseId/renewals/:renewalId/respond',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireAuth(req);
      const result = await service.respondToLeaseRenewal({
        principal,
        propertyId: String(req.params.propertyId),
        leaseId: String(req.params.leaseId),
        renewalId: String(req.params.renewalId),
        rawInput: req.body,
        idempotencyKey: extractIdempotencyKey(req),
        correlationId,
      });
      res.status(result.statusCode).json(
        buildSuccessEnvelope(result.body, correlationId, { idempotentReplay: result.replayed }),
      );
    }),
  );

  router.post(
    '/properties/:propertyId/leases/:leaseId/rent-adjustments',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireAuth(req);
      const result = await service.proposeRentAdjustment({
        principal,
        propertyId: String(req.params.propertyId),
        leaseId: String(req.params.leaseId),
        rawInput: req.body,
        approveImmediately: req.query.approveImmediately === 'true',
        idempotencyKey: extractIdempotencyKey(req),
        correlationId,
      });
      res.status(result.statusCode).json(
        buildSuccessEnvelope(result.body, correlationId, { idempotentReplay: result.replayed }),
      );
    }),
  );

  router.post(
    '/properties/:propertyId/leases/:leaseId/amendments',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireAuth(req);
      const result = await service.createLeaseAmendment({
        principal,
        propertyId: String(req.params.propertyId),
        leaseId: String(req.params.leaseId),
        rawInput: req.body,
        counterpartyConfirmed: req.query.counterpartyConfirmed === 'true',
        idempotencyKey: extractIdempotencyKey(req),
        correlationId,
      });
      res.status(result.statusCode).json(
        buildSuccessEnvelope(result.body, correlationId, { idempotentReplay: result.replayed }),
      );
    }),
  );

  router.post(
    '/properties/:propertyId/leases/:leaseId/maintenance',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireAuth(req);
      const result = await service.createMaintenanceRequest({
        principal,
        propertyId: String(req.params.propertyId),
        leaseId: String(req.params.leaseId),
        rawInput: req.body,
        idempotencyKey: extractIdempotencyKey(req),
        correlationId,
      });
      res.status(result.statusCode).json(
        buildSuccessEnvelope(result.body, correlationId, { idempotentReplay: result.replayed }),
      );
    }),
  );

  router.patch(
    '/properties/:propertyId/leases/:leaseId/maintenance/:requestId',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireAuth(req);
      const result = await service.updateMaintenanceRequest({
        principal,
        propertyId: String(req.params.propertyId),
        leaseId: String(req.params.leaseId),
        requestId: String(req.params.requestId),
        rawInput: req.body,
        idempotencyKey: extractIdempotencyKey(req),
        correlationId,
      });
      res.status(result.statusCode).json(
        buildSuccessEnvelope(result.body, correlationId, { idempotentReplay: result.replayed }),
      );
    }),
  );

  router.post(
    '/properties/:propertyId/leases/:leaseId/inspections',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireAuth(req);
      const result = await service.recordInspection({
        principal,
        propertyId: String(req.params.propertyId),
        leaseId: String(req.params.leaseId),
        rawInput: req.body,
        idempotencyKey: extractIdempotencyKey(req),
        correlationId,
      });
      res.status(result.statusCode).json(
        buildSuccessEnvelope(result.body, correlationId, { idempotentReplay: result.replayed }),
      );
    }),
  );

  router.post(
    '/properties/:propertyId/leases/:leaseId/handovers',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireAuth(req);
      const result = await service.performHandover({
        principal,
        propertyId: String(req.params.propertyId),
        leaseId: String(req.params.leaseId),
        rawInput: req.body,
        idempotencyKey: extractIdempotencyKey(req),
        correlationId,
      });
      res.status(result.statusCode).json(
        buildSuccessEnvelope(result.body, correlationId, { idempotentReplay: result.replayed }),
      );
    }),
  );

  router.post(
    '/properties/:propertyId/leases/:leaseId/terminations',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireAuth(req);
      const result = await service.initiateOrCompleteTermination({
        principal,
        propertyId: String(req.params.propertyId),
        leaseId: String(req.params.leaseId),
        rawInput: req.body,
        idempotencyKey: extractIdempotencyKey(req),
        correlationId,
      });
      res.status(result.statusCode).json(
        buildSuccessEnvelope(result.body, correlationId, { idempotentReplay: result.replayed }),
      );
    }),
  );

  router.get(
    '/analytics',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      await requireAuth(req);
      res.status(200).json(buildSuccessEnvelope(service.getTenancyAnalyticsSnapshot(), correlationId));
    }),
  );

  return router;
}
