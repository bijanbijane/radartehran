import express, { type Request, type Response } from 'express';
import {
  authorizePrincipal,
  buildErrorEnvelope,
  buildSuccessEnvelope,
  CoreApiError,
  extractAuthenticatedPrincipal,
  resolveCorrelationId,
  withStandardErrorBoundary,
} from '../core';
import {
  validateCreatePaymentIntentRequest,
  validateCreateSettlementBatchInput,
  validateInitiateAttemptRequest,
  validateRequestRefundInput,
} from './lifecycleAndValidation';
import { PaymentsService } from './service';
import type { PaymentsModuleDependencies } from './types';

export function createPaymentsRouter(deps: PaymentsModuleDependencies): express.Router {
  const router = express.Router();
  const service = new PaymentsService(deps);

  // 1. POST /intents — Create payment intent for an authorized business object
  router.post(
    '/intents',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const identity = await extractAuthenticatedPrincipal(req, deps.tokenVerifier);
      if (!identity.ok || !identity.principal) {
        res.status(identity.status ?? 401).json(buildErrorEnvelope('UNAUTHENTICATED', identity.reason ?? 'Auth required.', correlationId));
        return;
      }

      const validation = validateCreatePaymentIntentRequest(req.body);
      if (!validation.ok || !validation.value) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid payment intent input.', validation.issues);
      }

      const idempotencyKey = (req.headers['idempotency-key'] as string) || `idem_${Date.now()}`;
      const intent = await service.createPaymentIntent({
        customerUid: identity.principal.uid,
        businessModuleId: validation.value.businessModuleId,
        businessObjectId: validation.value.businessObjectId,
        description: validation.value.description,
        currency: validation.value.currency,
        idempotencyKey,
        metadata: validation.value.metadata,
      });

      res.status(201).json(buildSuccessEnvelope(intent, correlationId));
    }),
  );

  // 2. GET /intents/:id — Get payment intent details
  router.get(
    '/intents/:id',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const identity = await extractAuthenticatedPrincipal(req, deps.tokenVerifier);
      if (!identity.ok || !identity.principal) {
        res.status(identity.status ?? 401).json(buildErrorEnvelope('UNAUTHENTICATED', identity.reason ?? 'Auth required.', correlationId));
        return;
      }

      const intent = await deps.repository.getPaymentIntent(req.params.id);
      if (!intent) {
        throw new CoreApiError('NOT_FOUND', 404, 'Payment intent not found.');
      }

      const authz = await authorizePrincipal(
        identity.principal,
        { minimumRole: 'verified_user', resourceOwnerUid: intent.customerAccountRef, allowAdminOverrideForOwnership: true },
        deps.adminStore,
        deps.primaryAdminEmails,
      );
      if (!authz.allowed) {
        throw new CoreApiError('FORBIDDEN', 403, 'Cannot access another customer payment intent.');
      }

      res.status(200).json(buildSuccessEnvelope(intent, correlationId));
    }),
  );

  // 3. POST /intents/:id/attempts — Initiate a payment attempt through a provider
  router.post(
    '/intents/:id/attempts',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const identity = await extractAuthenticatedPrincipal(req, deps.tokenVerifier);
      if (!identity.ok || !identity.principal) {
        res.status(identity.status ?? 401).json(buildErrorEnvelope('UNAUTHENTICATED', identity.reason ?? 'Auth required.', correlationId));
        return;
      }

      const validation = validateInitiateAttemptRequest(req.body);
      if (!validation.ok || !validation.value) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid attempt input.', validation.issues);
      }

      const result = await service.initiatePaymentAttempt({
        paymentIntentId: req.params.id,
        customerUid: identity.principal.uid,
        providerId: validation.value.providerId,
        callbackUrl: validation.value.callbackUrl,
      });

      res.status(200).json(buildSuccessEnvelope(result, correlationId));
    }),
  );

  // 4. POST /callbacks/:providerId — Authenticated server-to-server webhook/callback
  router.post(
    '/callbacks/:providerId',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const intentId = (req.query.intentId as string) || (req.body as Record<string, unknown>)?.paymentIntentId;
      if (!intentId || typeof intentId !== 'string') {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'paymentIntentId is required in callback query or body.');
      }

      const idempotencyKey = (req.headers['idempotency-key'] as string) || undefined;
      const result = await service.processProviderCallback({
        providerId: req.params.providerId,
        callbackParams: {
          rawHeaders: req.headers as Record<string, string | string[] | undefined>,
          rawBody: req.body,
        },
        paymentIntentId: intentId,
        idempotencyKey,
      });

      res.status(200).json(buildSuccessEnvelope(result, correlationId));
    }),
  );

  // 5. POST /refunds — Request or execute a refund
  router.post(
    '/refunds',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const identity = await extractAuthenticatedPrincipal(req, deps.tokenVerifier);
      if (!identity.ok || !identity.principal) {
        res.status(identity.status ?? 401).json(buildErrorEnvelope('UNAUTHENTICATED', identity.reason ?? 'Auth required.', correlationId));
        return;
      }

      const validation = validateRequestRefundInput(req.body);
      if (!validation.ok || !validation.value) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid refund input.', validation.issues);
      }

      const authz = await authorizePrincipal(
        identity.principal,
        { minimumRole: 'verified_user' },
        deps.adminStore,
        deps.primaryAdminEmails,
      );
      const isPrivilegedAdmin = authz.effectiveRole === 'primary_admin' || authz.effectiveRole === 'delegated_admin';

      const idempotencyKey = (req.headers['idempotency-key'] as string) || `idem_ref_${Date.now()}`;
      const refund = await service.requestRefund({
        paymentIntentId: validation.value.paymentIntentId,
        amount: validation.value.amount,
        reason: validation.value.reason,
        actorUid: identity.principal.uid,
        isPrivilegedAdmin,
        idempotencyKey,
      });

      res.status(201).json(buildSuccessEnvelope(refund, correlationId));
    }),
  );

  // 6. GET /wallet/me — Get authenticated user's wallet
  router.get(
    '/wallet/me',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const identity = await extractAuthenticatedPrincipal(req, deps.tokenVerifier);
      if (!identity.ok || !identity.principal) {
        res.status(identity.status ?? 401).json(buildErrorEnvelope('UNAUTHENTICATED', identity.reason ?? 'Auth required.', correlationId));
        return;
      }

      const wallet = await service.getWalletAccount(identity.principal.uid);
      res.status(200).json(buildSuccessEnvelope(wallet, correlationId));
    }),
  );

  // 7. POST /settlements/batch — Admin create settlement batch
  router.post(
    '/settlements/batch',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const identity = await extractAuthenticatedPrincipal(req, deps.tokenVerifier);
      if (!identity.ok || !identity.principal) {
        res.status(identity.status ?? 401).json(buildErrorEnvelope('UNAUTHENTICATED', identity.reason ?? 'Auth required.', correlationId));
        return;
      }

      const authz = await authorizePrincipal(
        identity.principal,
        { minimumRole: 'delegated_admin' },
        deps.adminStore,
        deps.primaryAdminEmails,
      );
      if (!authz.allowed) {
        throw new CoreApiError('FORBIDDEN', 403, 'Admin privilege required for settlements.');
      }

      const validation = validateCreateSettlementBatchInput(req.body);
      if (!validation.ok || !validation.value) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid settlement batch input.', validation.issues);
      }

      const batch = await service.createSettlementBatch(validation.value);
      res.status(201).json(buildSuccessEnvelope(batch, correlationId));
    }),
  );

  // 8. POST /reconciliation/dry-run — Admin dry-run financial reconciliation
  router.post(
    '/reconciliation/dry-run',
    withStandardErrorBoundary(async (req: Request, res: Response) => {
      const correlationId = resolveCorrelationId(req);
      const identity = await extractAuthenticatedPrincipal(req, deps.tokenVerifier);
      if (!identity.ok || !identity.principal) {
        res.status(identity.status ?? 401).json(buildErrorEnvelope('UNAUTHENTICATED', identity.reason ?? 'Auth required.', correlationId));
        return;
      }

      const authz = await authorizePrincipal(
        identity.principal,
        { minimumRole: 'delegated_admin' },
        deps.adminStore,
        deps.primaryAdminEmails,
      );
      if (!authz.allowed) {
        throw new CoreApiError('FORBIDDEN', 403, 'Admin privilege required for reconciliation.');
      }

      const body = (req.body as Record<string, unknown>) ?? {};
      const report = await service.runReconciliation({
        periodStartIso: (body.periodStartIso as string) || new Date(Date.now() - 30 * 86400000).toISOString(),
        periodEndIso: (body.periodEndIso as string) || new Date().toISOString(),
      });

      res.status(200).json(buildSuccessEnvelope(report, correlationId));
    }),
  );

  return router;
}
