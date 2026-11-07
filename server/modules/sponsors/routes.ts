import { Router, type Request, type Response } from 'express';
import {
  buildSuccessEnvelope,
  CoreApiError,
  extractAuthenticatedPrincipal,
  resolveCorrelationId,
  withStandardErrorBoundary,
  type AuthenticatedPrincipal,
} from '../core';
import { createSponsorsService } from './service';
import type { SponsorsModuleDependencies, SponsorSupportedCityId } from './types';

function parseCityId(raw: unknown): SponsorSupportedCityId {
  return typeof raw === 'string' &&
    ['tehran', 'karaj', 'mashhad', 'isfahan', 'shiraz'].includes(raw)
    ? (raw as SponsorSupportedCityId)
    : 'tehran';
}

/**
 * Isolated Express Router for the Sponsorship & Advertising backend module (`server/modules/sponsors/`).
 * Exported for integration without modifying `server.ts`.
 */
export function createSponsorsRouter(deps: SponsorsModuleDependencies): Router {
  const router = Router();
  const service = createSponsorsService(deps);

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

  // 4. GET /availability — Check Neighborhood Slot Availability
  router.get(
    '/availability',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const cityId = parseCityId(req.query.cityId ?? req.query.city);
      const hoodId = Number(req.query.hoodId);
      const status = await service.checkSlotAvailability({ cityId, hoodId });
      res.status(200).json(buildSuccessEnvelope(status, correlationId));
    }),
  );

  // Public Placement Projection (Approved + Paid/Waived + Non-Expired Only)
  router.get(
    '/public-placement',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const cityId = parseCityId(req.query.cityId ?? req.query.city);
      const hoodId = Number(req.query.hoodId);
      const placement = await service.getPublicActivePlacement({ cityId, hoodId });
      res.status(200).json(buildSuccessEnvelope({ placement }, correlationId));
    }),
  );

  // 1, 2, 3 & 9. POST /reserve — Idempotent Sponsor Reservation Submission
  router.post(
    '/reserve',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireVerifiedPrincipal(req);
      const rawKey = req.headers['idempotency-key'];
      const idempotencyKey = typeof rawKey === 'string' ? rawKey : '';

      const created = await service.submitSponsorReservation({
        principal,
        idempotencyKey,
        rawBody: req.body,
        correlationId,
      });

      res.status(created.statusCode).json(
        buildSuccessEnvelope(created.reservation, correlationId, {
          idempotentReplay: created.replayed,
        }),
      );
    }),
  );

  // 2. GET /:reservationId — Owner-Authorized Reservation Retrieval
  router.get(
    '/:reservationId',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireVerifiedPrincipal(req);
      const view = await service.getOwnerReservation({
        principal,
        reservationId: String(req.params.reservationId ?? ''),
        correlationId,
      });
      res.status(200).json(buildSuccessEnvelope(view, correlationId));
    }),
  );

  // 8. POST /:reservationId/cancel — Owner-Authorized Reservation Cancellation
  router.post(
    '/:reservationId/cancel',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireVerifiedPrincipal(req);
      const cancelled = await service.cancelSponsorReservation({
        principal,
        reservationId: String(req.params.reservationId ?? ''),
        rawBody: req.body,
        correlationId,
      });
      res.status(200).json(buildSuccessEnvelope(cancelled, correlationId));
    }),
  );

  // 8. POST /:reservationId/expire — Expiration Check
  router.post(
    '/:reservationId/expire',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      await requireVerifiedPrincipal(req);
      const expired = await service.expireSponsorReservationIfDue({
        reservationId: String(req.params.reservationId ?? ''),
      });
      res.status(200).json(buildSuccessEnvelope(expired, correlationId));
    }),
  );

  // 6. POST /payment-events/verify — Server-Side Verified Payment Event Callback
  router.post(
    '/payment-events/verify',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const updated = await service.recordVerifiedPaymentEvent({
        rawEvent: req.body,
        correlationId,
      });
      res.status(200).json(buildSuccessEnvelope(updated, correlationId));
    }),
  );

  // 5. POST /admin/:reservationId/moderate — Admin Approval / Rejection
  router.post(
    '/admin/:reservationId/moderate',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireVerifiedPrincipal(req);
      const updated = await service.moderateSponsorReservation({
        principal,
        reservationId: String(req.params.reservationId ?? ''),
        rawBody: req.body,
        correlationId,
      });
      res.status(200).json(buildSuccessEnvelope(updated, correlationId));
    }),
  );

  return router;
}
