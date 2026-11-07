import { Router, type Request, type Response } from 'express';
import {
  buildPaginatedEnvelope,
  buildSuccessEnvelope,
  CoreApiError,
  extractAuthenticatedPrincipal,
  normalizePaginationParams,
  resolveCorrelationId,
  withStandardErrorBoundary,
  type AuthenticatedPrincipal,
} from '../core';
import { createBuyerAlertsService } from './service';
import type { BuyerAlertsModuleDependencies, SupportedCityId } from './types';

/**
 * Isolated Express Router for the Buyer Alerts backend module (`server/modules/buyer-alerts/`).
 * Note: Intentionally provides NO public endpoints exposing buyer contact details.
 */
export function createBuyerAlertsRouter(deps: BuyerAlertsModuleDependencies): Router {
  const router = Router();
  const service = createBuyerAlertsService(deps);

  async function requireVerifiedPrincipal(req: Request): Promise<AuthenticatedPrincipal> {
    const identity = await extractAuthenticatedPrincipal(req, deps.tokenVerifier, {
      requireVerifiedEmail: true,
    });
    if (!identity.ok || !identity.principal) {
      throw new CoreApiError(
        'UNAUTHENTICATED',
        identity.status ?? 401,
        identity.reason ?? 'Authentication required.',
      );
    }
    return identity.principal;
  }

  // 1, 7, 8 & 10. POST / — Idempotent Buyer Alert Creation with Consent Evidence
  router.post(
    '/',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireVerifiedPrincipal(req);
      const rawKey = req.headers['idempotency-key'];
      const idempotencyKey = typeof rawKey === 'string' ? rawKey : '';

      const created = await service.createBuyerAlert({
        principal,
        idempotencyKey,
        rawBody: req.body,
        correlationId,
      });

      res.status(created.statusCode).json(
        buildSuccessEnvelope(created.alert, correlationId, {
          idempotentReplay: created.replayed,
        }),
      );
    }),
  );

  // 2 & 9. GET /mine — Owner-Authorized Paginated Alert Retrieval
  router.get(
    '/mine',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireVerifiedPrincipal(req);
      const page = normalizePaginationParams(req.query as Record<string, unknown>, {
        defaultLimit: 20,
        maxLimit: 50,
      });
      const result = await service.listOwnerBuyerAlerts({
        principal,
        limit: page.limit,
        cursor: page.cursor,
      });
      res
        .status(200)
        .json(
          buildPaginatedEnvelope(
            result.items,
            { limit: page.limit, hasMore: result.hasMore, nextCursor: result.nextCursor },
            correlationId,
          ),
        );
    }),
  );

  // 6 & 9. GET /admin/list — Admin/CRM Bounded & Paginated Buyer Alert Retrieval
  router.get(
    '/admin/list',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireVerifiedPrincipal(req);
      const page = normalizePaginationParams(req.query as Record<string, unknown>, {
        defaultLimit: 20,
        maxLimit: 50,
      });
      const rawCity = req.query.cityId;
      const cityId =
        typeof rawCity === 'string' &&
        ['tehran', 'karaj', 'mashhad', 'isfahan', 'shiraz'].includes(rawCity)
          ? (rawCity as SupportedCityId)
          : undefined;
      const hoodId = req.query.hoodId !== undefined ? Number(req.query.hoodId) : undefined;
      const includeInactive = req.query.includeInactive === 'true';

      const result = await service.listAdminBuyerAlerts({
        principal,
        cityId,
        hoodId: Number.isInteger(hoodId) ? hoodId : undefined,
        includeInactive,
        limit: page.limit,
        cursor: page.cursor,
        correlationId,
      });

      res
        .status(200)
        .json(
          buildPaginatedEnvelope(
            result.items,
            { limit: page.limit, hasMore: result.hasMore, nextCursor: result.nextCursor },
            correlationId,
          ),
        );
    }),
  );

  // 2. GET /:alertId — Owner-Authorized Single Alert Retrieval
  router.get(
    '/:alertId',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireVerifiedPrincipal(req);
      const view = await service.getOwnerBuyerAlert({
        principal,
        alertId: String(req.params.alertId ?? ''),
        correlationId,
      });
      res.status(200).json(buildSuccessEnvelope(view, correlationId));
    }),
  );

  // 3. PATCH /:alertId — Owner-Authorized Alert Update (Preserves createdAt)
  router.patch(
    '/:alertId',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireVerifiedPrincipal(req);
      const updated = await service.updateOwnerBuyerAlert({
        principal,
        alertId: String(req.params.alertId ?? ''),
        rawBody: req.body,
        correlationId,
      });
      res.status(200).json(buildSuccessEnvelope(updated, correlationId));
    }),
  );

  // 4. POST /:alertId/withdraw — Owner-Authorized Alert Withdrawal
  router.post(
    '/:alertId/withdraw',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireVerifiedPrincipal(req);
      const withdrawn = await service.withdrawBuyerAlert({
        principal,
        alertId: String(req.params.alertId ?? ''),
        rawBody: req.body,
        correlationId,
      });
      res.status(200).json(buildSuccessEnvelope(withdrawn, correlationId));
    }),
  );

  // 5. POST /:alertId/expire — Expiration Evaluation
  router.post(
    '/:alertId/expire',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      await requireVerifiedPrincipal(req);
      const expired = await service.expireBuyerAlertIfDue({
        alertId: String(req.params.alertId ?? ''),
        correlationId,
      });
      res.status(200).json(buildSuccessEnvelope(expired, correlationId));
    }),
  );

  return router;
}
