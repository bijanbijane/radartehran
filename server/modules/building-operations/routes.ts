import express, { type Request, type Response, type Router } from 'express';
import {
  buildSuccessEnvelope,
  CoreApiError,
  extractAuthenticatedPrincipal,
  resolveCorrelationId,
  withStandardErrorBoundary,
  type AuthenticatedPrincipal,
} from '../core';
import { createBuildingOperationsService } from './service';
import type { BuildingOperationsDependencies } from './types';

function extractIdempotencyKey(req: Request): string {
  const raw = req.headers['idempotency-key'] ?? req.headers['x-idempotency-key'];
  if (typeof raw === 'string' && raw.trim().length > 0) {
    return raw.trim();
  }
  throw new CoreApiError(
    'VALIDATION_FAILED',
    400,
    'Idempotency-Key header is required for building operations mutations.',
  );
}

export function createBuildingOperationsRouter(deps: BuildingOperationsDependencies): Router {
  const router = express.Router({ mergeParams: true });
  const service = createBuildingOperationsService(deps);

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
    '/buildings/:buildingId',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireAuth(req);
      const result = await service.upsertBuilding({
        principal,
        buildingId: String(req.params.buildingId),
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
    '/buildings/:buildingId/overview',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireAuth(req);
      const data = await service.getBuildingOperationalOverview({
        principal,
        buildingId: String(req.params.buildingId),
      });
      res.status(200).json(buildSuccessEnvelope(data, correlationId));
    }),
  );

  router.post(
    '/buildings/:buildingId/units',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireAuth(req);
      const result = await service.registerBuildingUnit({
        principal,
        buildingId: String(req.params.buildingId),
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
    '/buildings/:buildingId/facilities',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireAuth(req);
      const result = await service.registerOrUpdateFacility({
        principal,
        buildingId: String(req.params.buildingId),
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
    '/buildings/:buildingId/equipment',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireAuth(req);
      const result = await service.registerOrUpdateEquipmentAsset({
        principal,
        buildingId: String(req.params.buildingId),
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
    '/buildings/:buildingId/contracts',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireAuth(req);
      const result = await service.createManagementContract({
        principal,
        buildingId: String(req.params.buildingId),
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
    '/buildings/:buildingId/maintenance',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireAuth(req);
      const result = await service.createMaintenanceRequest({
        principal,
        buildingId: String(req.params.buildingId),
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
    '/buildings/:buildingId/preventive-schedules',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireAuth(req);
      const result = await service.createPreventiveSchedule({
        principal,
        buildingId: String(req.params.buildingId),
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
    '/buildings/:buildingId/preventive-schedules/:scheduleId/generate-work-order',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireAuth(req);
      const result = await service.generatePreventiveWorkOrder({
        principal,
        buildingId: String(req.params.buildingId),
        scheduleId: String(req.params.scheduleId),
        serviceProviderId: String(req.body?.serviceProviderId ?? ''),
        estimatedCostAmount: Number(req.body?.estimatedCostAmount ?? 0),
        currency: req.body?.currency === 'IRR' ? 'IRR' : 'IRT',
        idempotencyKey: extractIdempotencyKey(req),
        correlationId,
      });
      res.status(result.statusCode).json(
        buildSuccessEnvelope(result.body, correlationId, { idempotentReplay: result.replayed }),
      );
    }),
  );

  router.post(
    '/buildings/:buildingId/work-orders',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireAuth(req);
      const result = await service.createWorkOrder({
        principal,
        buildingId: String(req.params.buildingId),
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
    '/buildings/:buildingId/work-orders/:workOrderId/transition',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireAuth(req);
      const result = await service.transitionWorkOrder({
        principal,
        buildingId: String(req.params.buildingId),
        workOrderId: String(req.params.workOrderId),
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
    '/buildings/:buildingId/expenses',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireAuth(req);
      const result = await service.createBuildingExpense({
        principal,
        buildingId: String(req.params.buildingId),
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
    '/buildings/:buildingId/expense-allocations',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireAuth(req);
      const result = await service.allocateSharedBuildingExpense({
        principal,
        buildingId: String(req.params.buildingId),
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
    '/buildings/:buildingId/utilities',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireAuth(req);
      const result = await service.recordUtilityBill({
        principal,
        buildingId: String(req.params.buildingId),
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
    '/buildings/:buildingId/inspections',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireAuth(req);
      const result = await service.recordBuildingInspection({
        principal,
        buildingId: String(req.params.buildingId),
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
    '/buildings/:buildingId/incidents',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireAuth(req);
      const result = await service.reportSafetyIncident({
        principal,
        buildingId: String(req.params.buildingId),
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
      const snapshot = service.getBuildingOperationsAnalyticsSnapshot();
      res.status(200).json(buildSuccessEnvelope(snapshot, correlationId));
    }),
  );

  return router;
}
