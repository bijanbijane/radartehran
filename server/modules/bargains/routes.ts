import { Router, type Request, type Response } from 'express';
import {
  buildSuccessEnvelope,
  CoreApiError,
  extractAuthenticatedPrincipal,
  normalizePaginationParams,
  resolveCorrelationId,
  withStandardErrorBoundary,
  type AuthenticatedPrincipal,
} from '../core';
import { createBargainsService } from './service';
import type { BargainsModuleDependencies } from './types';

/**
 * Creates an isolated Express Router for the Bargains & Ownership domain module.
 * Per ownership boundaries, this router is exported for integration and is NOT registered in `server.ts`.
 */
export function createBargainsRouter(deps: BargainsModuleDependencies): Router {
  const router = Router();
  const service = createBargainsService(deps);

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

  // 1 & 9. POST / — Idempotent Bargain Creation (Authenticated Verified User)
  router.post(
    '/',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireVerifiedPrincipal(req);
      const rawKey = req.headers['idempotency-key'];
      const idempotencyKey = typeof rawKey === 'string' ? rawKey : '';

      const created = await service.createBargain({
        principal,
        idempotencyKey,
        rawBody: req.body,
        correlationId,
      });

      res.status(created.statusCode).json(
        buildSuccessEnvelope(created.bargain, correlationId, {
          idempotentReplay: created.replayed,
        }),
      );
    }),
  );

  // 10. GET /public — List Public Approved Bargains by Neighborhood
  router.get(
    '/public',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const hoodId = Number(req.query.hoodId);
      const page = normalizePaginationParams(req.query as Record<string, unknown>, {
        defaultLimit: 20,
        maxLimit: 50,
      });
      const items = await service.listPublicBargainsByHood(hoodId, page.limit);
      res.status(200).json(buildSuccessEnvelope({ hoodId, items }, correlationId));
    }),
  );

  // 10. GET /public/:bargainId — Retrieve Single Public Approved Bargain Projection
  router.get(
    '/public/:bargainId',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const projection = await service.getPublicBargainById(String(req.params.bargainId ?? ''));
      res.status(200).json(buildSuccessEnvelope(projection, correlationId));
    }),
  );

  // 3. GET /:bargainId/owner — Owner-Authorized Listing Retrieval
  router.get(
    '/:bargainId/owner',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireVerifiedPrincipal(req);
      const view = await service.getOwnerBargain({
        principal,
        bargainId: String(req.params.bargainId ?? ''),
        correlationId,
      });
      res.status(200).json(buildSuccessEnvelope(view, correlationId));
    }),
  );

  // 4 & 8. PATCH /:bargainId — Owner-Authorized Listing Update with Revision Check
  router.patch(
    '/:bargainId',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireVerifiedPrincipal(req);
      const updated = await service.updateOwnerBargain({
        principal,
        bargainId: String(req.params.bargainId ?? ''),
        rawBody: req.body,
        correlationId,
      });
      res.status(200).json(buildSuccessEnvelope(updated, correlationId));
    }),
  );

  // 5. POST /:bargainId/withdraw — Owner-Authorized Listing Withdrawal
  router.post(
    '/:bargainId/withdraw',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireVerifiedPrincipal(req);
      const withdrawn = await service.withdrawBargain({
        principal,
        bargainId: String(req.params.bargainId ?? ''),
        rawBody: req.body,
        correlationId,
      });
      res.status(200).json(buildSuccessEnvelope(withdrawn, correlationId));
    }),
  );

  // 6. POST /:bargainId/expire — Expiration Check & State Transition
  router.post(
    '/:bargainId/expire',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      await requireVerifiedPrincipal(req);
      const expiredResult = await service.expireBargainIfDue({
        bargainId: String(req.params.bargainId ?? ''),
        correlationId,
      });
      res.status(200).json(buildSuccessEnvelope(expiredResult, correlationId));
    }),
  );

  // 7 & 8. POST /admin/:bargainId/moderate — Admin Moderation (Approve / Reject)
  router.post(
    '/admin/:bargainId/moderate',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireVerifiedPrincipal(req);
      const result = await service.moderateBargain({
        principal,
        bargainId: String(req.params.bargainId ?? ''),
        rawBody: req.body,
        correlationId,
      });
      res.status(200).json(buildSuccessEnvelope(result, correlationId));
    }),
  );

  // Legacy route compatibility: POST /admin/approve (accepts bargainId + status in body, never trusts fromStatus)
  router.post(
    '/admin/approve',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireVerifiedPrincipal(req);
      const bodyObj =
        req.body && typeof req.body === 'object' && !Array.isArray(req.body)
          ? (req.body as Record<string, unknown>)
          : {};
      const bargainId = typeof bodyObj.bargainId === 'string' ? bodyObj.bargainId : '';
      const restBody = { ...bodyObj };
      delete restBody.bargainId;

      const result = await service.moderateBargain({
        principal,
        bargainId,
        rawBody: restBody,
        correlationId,
      });
      res.status(200).json(buildSuccessEnvelope(result, correlationId));
    }),
  );

  return router;
}
