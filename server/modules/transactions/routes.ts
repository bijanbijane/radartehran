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
import { createTransactionsService } from './service';
import type {
  TransactionsModuleDependencies,
  TransactionStatus,
  TransactionType,
} from './types';

export function createTransactionsRouter(deps: TransactionsModuleDependencies): Router {
  const router = Router();
  const service = createTransactionsService(deps);

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

  // 1. POST / — Idempotent Transaction Creation
  router.post(
    '/',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireVerifiedPrincipal(req);
      const rawKey = req.headers['idempotency-key'];
      const idempotencyKey = typeof rawKey === 'string' ? rawKey : '';

      const created = await service.createTransaction({
        principal,
        idempotencyKey,
        rawBody: req.body,
        correlationId,
      });

      res.status(created.statusCode).json(
        buildSuccessEnvelope(created.transaction, correlationId, {
          idempotentReplay: created.replayed,
        }),
      );
    }),
  );

  // 2. GET / — List Authenticated Participant's Transactions
  router.get(
    '/',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireVerifiedPrincipal(req);
      const page = normalizePaginationParams(req.query as Record<string, unknown>, {
        defaultLimit: 20,
        maxLimit: 50,
      });
      const status = typeof req.query.status === 'string' ? (req.query.status as TransactionStatus) : undefined;
      const transactionType =
        typeof req.query.transactionType === 'string' ? (req.query.transactionType as TransactionType) : undefined;

      const items = await service.listParticipantTransactions({
        principal,
        status,
        transactionType,
        limit: page.limit,
      });
      res.status(200).json(buildSuccessEnvelope({ items, count: items.length }, correlationId));
    }),
  );

  // 3. GET /admin/analytics — Aggregate Transaction Analytics (Admin Only)
  router.get(
    '/admin/analytics',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireVerifiedPrincipal(req);
      const snapshot = await service.getAnalyticsSnapshot({ principal });
      res.status(200).json(buildSuccessEnvelope(snapshot, correlationId));
    }),
  );

  // 4. GET /:transactionId — Retrieve Transaction View
  router.get(
    '/:transactionId',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireVerifiedPrincipal(req);
      const view = await service.getTransaction({
        principal,
        transactionId: String(req.params.transactionId ?? ''),
        correlationId,
      });
      res.status(200).json(buildSuccessEnvelope(view, correlationId));
    }),
  );

  // 5. POST /:transactionId/transition — State Machine Transition
  router.post(
    '/:transactionId/transition',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireVerifiedPrincipal(req);
      const view = await service.transitionStatus({
        principal,
        transactionId: String(req.params.transactionId ?? ''),
        rawBody: req.body,
        correlationId,
      });
      res.status(200).json(buildSuccessEnvelope(view, correlationId));
    }),
  );

  // 6. POST /:transactionId/participants/invite — Invite Participant
  router.post(
    '/:transactionId/participants/invite',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireVerifiedPrincipal(req);
      const result = await service.inviteParticipant({
        principal,
        transactionId: String(req.params.transactionId ?? ''),
        rawBody: req.body,
        correlationId,
      });
      res.status(201).json(buildSuccessEnvelope(result, correlationId));
    }),
  );

  // 7. POST /:transactionId/participants/respond — Accept / Decline Invitation
  router.post(
    '/:transactionId/participants/respond',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireVerifiedPrincipal(req);
      const result = await service.respondToInvitation({
        principal,
        transactionId: String(req.params.transactionId ?? ''),
        rawBody: req.body,
        correlationId,
      });
      res.status(200).json(buildSuccessEnvelope(result, correlationId));
    }),
  );

  // 8. PATCH /:transactionId/participants/:targetUserId — Modify Role or Revoke Access
  router.patch(
    '/:transactionId/participants/:targetUserId',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireVerifiedPrincipal(req);
      const result = await service.modifyOrRevokeParticipant({
        principal,
        transactionId: String(req.params.transactionId ?? ''),
        targetUserId: String(req.params.targetUserId ?? ''),
        rawBody: req.body,
        correlationId,
      });
      res.status(200).json(buildSuccessEnvelope(result, correlationId));
    }),
  );

  // 9. POST /:transactionId/offers — Submit Offer or Counteroffer
  router.post(
    '/:transactionId/offers',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireVerifiedPrincipal(req);
      const result = await service.submitOffer({
        principal,
        transactionId: String(req.params.transactionId ?? ''),
        rawBody: req.body,
        correlationId,
      });
      res.status(201).json(buildSuccessEnvelope(result, correlationId));
    }),
  );

  // 10. GET /:transactionId/offers — Retrieve Offer History
  router.get(
    '/:transactionId/offers',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireVerifiedPrincipal(req);
      const items = await service.getTransactionSubresourceList({
        principal,
        transactionId: String(req.params.transactionId ?? ''),
        resource: 'offers',
      });
      res.status(200).json(buildSuccessEnvelope({ items, count: items.length }, correlationId));
    }),
  );

  // 11. POST /:transactionId/offers/:offerId/decide — Accept / Reject / Withdraw Offer
  router.post(
    '/:transactionId/offers/:offerId/decide',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireVerifiedPrincipal(req);
      const result = await service.decideOffer({
        principal,
        transactionId: String(req.params.transactionId ?? ''),
        offerId: String(req.params.offerId ?? ''),
        rawBody: req.body,
        correlationId,
      });
      res.status(200).json(buildSuccessEnvelope(result, correlationId));
    }),
  );

  // 12. POST /:transactionId/negotiation — Post Structured Negotiation Entry
  router.post(
    '/:transactionId/negotiation',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireVerifiedPrincipal(req);
      const result = await service.postNegotiationEntry({
        principal,
        transactionId: String(req.params.transactionId ?? ''),
        rawBody: req.body,
        correlationId,
      });
      res.status(201).json(buildSuccessEnvelope(result, correlationId));
    }),
  );

  // 13. GET /:transactionId/negotiation — Retrieve Negotiation History
  router.get(
    '/:transactionId/negotiation',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireVerifiedPrincipal(req);
      const items = await service.getTransactionSubresourceList({
        principal,
        transactionId: String(req.params.transactionId ?? ''),
        resource: 'negotiations',
      });
      res.status(200).json(buildSuccessEnvelope({ items, count: items.length }, correlationId));
    }),
  );

  // 14. POST /:transactionId/contracts — Attach Contract Document Reference
  router.post(
    '/:transactionId/contracts',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireVerifiedPrincipal(req);
      const result = await service.attachContractReference({
        principal,
        transactionId: String(req.params.transactionId ?? ''),
        rawBody: req.body,
        correlationId,
      });
      res.status(201).json(buildSuccessEnvelope(result, correlationId));
    }),
  );

  // 15. GET /:transactionId/contracts — Retrieve Contract Versions
  router.get(
    '/:transactionId/contracts',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireVerifiedPrincipal(req);
      const items = await service.getTransactionSubresourceList({
        principal,
        transactionId: String(req.params.transactionId ?? ''),
        resource: 'contracts',
      });
      res.status(200).json(buildSuccessEnvelope({ items, count: items.length }, correlationId));
    }),
  );

  // 16. PATCH /:transactionId/contracts/:contractId — Record Signature Status / Update Contract Status
  router.patch(
    '/:transactionId/contracts/:contractId',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireVerifiedPrincipal(req);
      const result = await service.updateContractStatus({
        principal,
        transactionId: String(req.params.transactionId ?? ''),
        contractId: String(req.params.contractId ?? ''),
        rawBody: req.body,
        correlationId,
      });
      res.status(200).json(buildSuccessEnvelope(result, correlationId));
    }),
  );

  // 17. PATCH /:transactionId/milestones — Update Configurable Milestone
  router.patch(
    '/:transactionId/milestones',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireVerifiedPrincipal(req);
      const result = await service.updateMilestone({
        principal,
        transactionId: String(req.params.transactionId ?? ''),
        rawBody: req.body,
        correlationId,
      });
      res.status(200).json(buildSuccessEnvelope(result, correlationId));
    }),
  );

  // 18. GET /:transactionId/milestones — Retrieve Transaction Milestones
  router.get(
    '/:transactionId/milestones',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireVerifiedPrincipal(req);
      const items = await service.getTransactionSubresourceList({
        principal,
        transactionId: String(req.params.transactionId ?? ''),
        resource: 'milestones',
      });
      res.status(200).json(buildSuccessEnvelope({ items, count: items.length }, correlationId));
    }),
  );

  // 19. POST /:transactionId/closing — Execute Closing Workflow Operation
  router.post(
    '/:transactionId/closing',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireVerifiedPrincipal(req);
      const result = await service.executeClosingOperation({
        principal,
        transactionId: String(req.params.transactionId ?? ''),
        rawBody: req.body,
        correlationId,
      });
      res.status(200).json(buildSuccessEnvelope(result, correlationId));
    }),
  );

  // 20. POST /:transactionId/disputes — Initiate Dispute
  router.post(
    '/:transactionId/disputes',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireVerifiedPrincipal(req);
      const result = await service.initiateDispute({
        principal,
        transactionId: String(req.params.transactionId ?? ''),
        rawBody: req.body,
        correlationId,
      });
      res.status(201).json(buildSuccessEnvelope(result, correlationId));
    }),
  );

  // 21. POST /:transactionId/admin/intervene — Administrative Control & Dispute Resolution
  router.post(
    '/:transactionId/admin/intervene',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireVerifiedPrincipal(req);
      const view = await service.executeAdminIntervention({
        principal,
        transactionId: String(req.params.transactionId ?? ''),
        rawBody: req.body,
        correlationId,
      });
      res.status(200).json(buildSuccessEnvelope(view, correlationId));
    }),
  );

  // 22. GET /:transactionId/history — Retrieve Append-Only Transaction History
  router.get(
    '/:transactionId/history',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireVerifiedPrincipal(req);
      const items = await service.getTransactionSubresourceList({
        principal,
        transactionId: String(req.params.transactionId ?? ''),
        resource: 'history',
      });
      res.status(200).json(buildSuccessEnvelope({ items, count: items.length }, correlationId));
    }),
  );

  return router;
}
