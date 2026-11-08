import express, { type Request, type Response, type Router } from 'express';
import {
  buildSuccessEnvelope,
  CoreApiError,
  extractAuthenticatedPrincipal,
  resolveCorrelationId,
  withStandardErrorBoundary,
  type AuthenticatedPrincipal,
} from '../../core';
import { createTransactionFinancialLedgerService } from './service';
import type { FinancialLedgerDependencies } from './types';

function extractIdempotencyKey(req: Request): string {
  const raw = req.headers['idempotency-key'] ?? req.headers['x-idempotency-key'];
  if (typeof raw === 'string' && raw.trim().length > 0) {
    return raw.trim();
  }
  throw new CoreApiError(
    'VALIDATION_FAILED',
    400,
    'Idempotency-Key header is required for financial ledger mutations.',
  );
}

function extractWebhookSecret(req: Request): string | undefined {
  const raw = req.headers['x-provider-webhook-secret'];
  return typeof raw === 'string' ? raw.trim() : undefined;
}

export function createTransactionFinancialLedgerRouter(deps: FinancialLedgerDependencies): Router {
  const router = express.Router({ mergeParams: true });
  const service = createTransactionFinancialLedgerService(deps);

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

  router.get(
    '/:transactionId/ledger/summary',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireAuth(req);
      const data = await service.getFinancialSummaryAndRecords({
        principal,
        transactionId: String(req.params.transactionId),
      });
      res.status(200).json(buildSuccessEnvelope(data, correlationId));
    }),
  );

  router.post(
    '/:transactionId/ledger/obligations',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireAuth(req);
      const result = await service.createObligation({
        principal,
        transactionId: String(req.params.transactionId),
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
    '/:transactionId/ledger/obligations/:obligationId',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireAuth(req);
      const result = await service.updateObligation({
        principal,
        transactionId: String(req.params.transactionId),
        obligationId: String(req.params.obligationId),
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
    '/:transactionId/ledger/entries',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireAuth(req);
      const result = await service.postLedgerEntryPair({
        principal,
        transactionId: String(req.params.transactionId),
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
    '/:transactionId/ledger/entries/reverse',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireAuth(req);
      const result = await service.reverseLedgerPosting({
        principal,
        transactionId: String(req.params.transactionId),
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
    '/:transactionId/ledger/payment-references',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireAuth(req);
      const result = await service.createPaymentReference({
        principal,
        transactionId: String(req.params.transactionId),
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
    '/:transactionId/ledger/payment-references/:paymentRefId/status',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireAuth(req);
      const result = await service.updatePaymentReferenceStatus({
        principal,
        transactionId: String(req.params.transactionId),
        paymentRefId: String(req.params.paymentRefId),
        rawInput: req.body,
        idempotencyKey: extractIdempotencyKey(req),
        correlationId,
        webhookSecretHeader: extractWebhookSecret(req),
      });
      res.status(result.statusCode).json(
        buildSuccessEnvelope(result.body, correlationId, { idempotentReplay: result.replayed }),
      );
    }),
  );

  router.post(
    '/:transactionId/ledger/settlements',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireAuth(req);
      const result = await service.createSettlement({
        principal,
        transactionId: String(req.params.transactionId),
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
    '/:transactionId/ledger/settlements/:settlementId/action',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireAuth(req);
      const result = await service.performSettlementAction({
        principal,
        transactionId: String(req.params.transactionId),
        settlementId: String(req.params.settlementId),
        rawInput: req.body,
        idempotencyKey: extractIdempotencyKey(req),
        correlationId,
        webhookSecretHeader: extractWebhookSecret(req),
      });
      res.status(result.statusCode).json(
        buildSuccessEnvelope(result.body, correlationId, { idempotentReplay: result.replayed }),
      );
    }),
  );

  router.post(
    '/:transactionId/ledger/refunds',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireAuth(req);
      const result = await service.createRefund({
        principal,
        transactionId: String(req.params.transactionId),
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
    '/:transactionId/ledger/refunds/:refundId/decision',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireAuth(req);
      const result = await service.decideRefund({
        principal,
        transactionId: String(req.params.transactionId),
        refundId: String(req.params.refundId),
        rawInput: req.body,
        idempotencyKey: extractIdempotencyKey(req),
        correlationId,
        webhookSecretHeader: extractWebhookSecret(req),
      });
      res.status(result.statusCode).json(
        buildSuccessEnvelope(result.body, correlationId, { idempotentReplay: result.replayed }),
      );
    }),
  );

  router.post(
    '/:transactionId/ledger/rental-schedules',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireAuth(req);
      const result = await service.generateRentalSchedule({
        principal,
        transactionId: String(req.params.transactionId),
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
    '/:transactionId/ledger/commissions',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireAuth(req);
      const result = await service.createCommission({
        principal,
        transactionId: String(req.params.transactionId),
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
    '/:transactionId/ledger/disputes',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireAuth(req);
      const result = await service.initiateFinancialDispute({
        principal,
        transactionId: String(req.params.transactionId),
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
    '/:transactionId/ledger/disputes/:financialDisputeId/resolve',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireAuth(req);
      const result = await service.resolveFinancialDispute({
        principal,
        transactionId: String(req.params.transactionId),
        financialDisputeId: String(req.params.financialDisputeId),
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
    '/:transactionId/ledger/reconcile',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const principal = await requireAuth(req);
      const report = await service.reconcileTransactionLedger({
        principal,
        transactionId: String(req.params.transactionId),
        correlationId,
      });
      res.status(200).json(buildSuccessEnvelope(report, correlationId));
    }),
  );

  router.get(
    '/ledger/analytics',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      await requireAuth(req);
      res.status(200).json(buildSuccessEnvelope(service.getFinancialAnalyticsSnapshot(), correlationId));
    }),
  );

  return router;
}
