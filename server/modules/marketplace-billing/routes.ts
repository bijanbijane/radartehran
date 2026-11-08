/**
 * Employee 67 — Marketplace Billing, Payments, Subscriptions & Financial Operations Express Router
 * (`server/modules/marketplace-billing/routes.ts`)
 *
 * Exclusive ownership: `server/modules/marketplace-billing/`
 */

import express, { type Request, type Response, type Router } from 'express';
import {
  buildSuccessEnvelope,
  CoreApiError,
  extractAuthenticatedPrincipal,
  resolveCorrelationId,
  withStandardErrorBoundary,
} from '../core';
import type { AuthenticatedPrincipal } from '../core/types';
import { MarketplaceBillingService } from './service';
import type {
  BillableFeatureKey,
  MarketplaceBillingModuleDependencies,
  ProviderWebhookPayload,
} from './types';

export function createMarketplaceBillingRouter(
  deps: MarketplaceBillingModuleDependencies,
  existingService?: MarketplaceBillingService,
): Router {
  const router = express.Router();
  const service = existingService ?? new MarketplaceBillingService(deps);

  const requireAuth = async (req: Request): Promise<AuthenticatedPrincipal> => {
    const extraction = await extractAuthenticatedPrincipal(req, deps.tokenVerifier);
    if (!extraction.ok || !extraction.principal) {
      throw new CoreApiError(
        'UNAUTHENTICATED',
        extraction.status ?? 401,
        extraction.reason ?? 'Authentication required for billing operations.',
      );
    }
    return extraction.principal;
  };

  const sendOk = <T>(res: Response, status: number, data: T, correlationId: string): void => {
    res.status(status).json(buildSuccessEnvelope(data, correlationId));
  };

  // ---- Public / Customer Catalog & Pricing ----
  router.get(
    '/products',
    withStandardErrorBoundary(async (req, res) => {
      const items = await service.listAvailableBillingProducts();
      sendOk(res, 200, { items }, resolveCorrelationId(req));
    }),
  );

  // ---- Payment Intents ----
  router.post(
    '/payment-intents',
    withStandardErrorBoundary(async (req, res) => {
      const principal = await requireAuth(req);
      const result = await service.createPaymentIntent(principal, req.body);
      sendOk(res, result.replayed ? 200 : 201, result, resolveCorrelationId(req));
    }),
  );

  router.get(
    '/payment-intents/:paymentIntentId',
    withStandardErrorBoundary(async (req, res) => {
      const principal = await requireAuth(req);
      const result = await service.getPaymentIntentStatus(principal, String(req.params.paymentIntentId));
      sendOk(res, 200, result, resolveCorrelationId(req));
    }),
  );

  // ---- Provider Webhooks (Authenticated via cryptographic HMAC signature) ----
  router.post(
    '/webhooks/:providerId',
    withStandardErrorBoundary(async (req, res) => {
      const payload: ProviderWebhookPayload = {
        ...(req.body as ProviderWebhookPayload),
        providerId: String(req.params.providerId),
        rawSignature: String(
          req.headers['x-webhook-signature'] ?? req.body?.rawSignature ?? '',
        ),
      };
      const result = await service.processProviderWebhook(payload);
      sendOk(res, 200, result, resolveCorrelationId(req));
    }),
  );

  // ---- Invoices & Financial Documents ----
  router.get(
    '/invoices',
    withStandardErrorBoundary(async (req, res) => {
      const principal = await requireAuth(req);
      const items = await service.listCustomerInvoices(principal);
      sendOk(res, 200, { items }, resolveCorrelationId(req));
    }),
  );

  router.get(
    '/invoices/:invoiceId/document',
    withStandardErrorBoundary(async (req, res) => {
      const principal = await requireAuth(req);
      const result = await service.getInvoiceDocument(principal, String(req.params.invoiceId));
      sendOk(res, 200, result, resolveCorrelationId(req));
    }),
  );

  // ---- Subscriptions ----
  router.post(
    '/subscriptions',
    withStandardErrorBoundary(async (req, res) => {
      const principal = await requireAuth(req);
      const result = await service.createSubscription(principal, req.body);
      sendOk(res, 201, result, resolveCorrelationId(req));
    }),
  );

  router.get(
    '/subscriptions',
    withStandardErrorBoundary(async (req, res) => {
      const principal = await requireAuth(req);
      const items = await service.listUserSubscriptions(principal);
      sendOk(res, 200, { items }, resolveCorrelationId(req));
    }),
  );

  router.post(
    '/subscriptions/:subscriptionId/change-plan',
    withStandardErrorBoundary(async (req, res) => {
      const principal = await requireAuth(req);
      const result = await service.changeSubscriptionPlan(
        principal,
        String(req.params.subscriptionId),
        req.body,
      );
      sendOk(res, 200, result, resolveCorrelationId(req));
    }),
  );

  router.post(
    '/subscriptions/:subscriptionId/pause',
    withStandardErrorBoundary(async (req, res) => {
      const principal = await requireAuth(req);
      const subscription = await service.pauseOrResumeSubscription(
        principal,
        String(req.params.subscriptionId),
        'PAUSE',
      );
      sendOk(res, 200, { subscription }, resolveCorrelationId(req));
    }),
  );

  router.post(
    '/subscriptions/:subscriptionId/resume',
    withStandardErrorBoundary(async (req, res) => {
      const principal = await requireAuth(req);
      const subscription = await service.pauseOrResumeSubscription(
        principal,
        String(req.params.subscriptionId),
        'RESUME',
      );
      sendOk(res, 200, { subscription }, resolveCorrelationId(req));
    }),
  );

  router.post(
    '/subscriptions/:subscriptionId/cancel',
    withStandardErrorBoundary(async (req, res) => {
      const principal = await requireAuth(req);
      const subscription = await service.cancelSubscription(
        principal,
        String(req.params.subscriptionId),
        req.body,
      );
      sendOk(res, 200, { subscription }, resolveCorrelationId(req));
    }),
  );

  // ---- Centralized Entitlement Check ----
  router.get(
    '/entitlements/check/:featureKey',
    withStandardErrorBoundary(async (req, res) => {
      const principal = await requireAuth(req);
      const decision = await service.evaluateEntitlementAccess({
        ownerUid: principal.uid,
        organizationId: typeof req.query.organizationId === 'string' ? req.query.organizationId : null,
        featureKey: String(req.params.featureKey) as BillableFeatureKey,
      });
      sendOk(res, 200, { decision }, resolveCorrelationId(req));
    }),
  );

  // ---- Usage Billing ----
  router.post(
    '/usage-events',
    withStandardErrorBoundary(async (req, res) => {
      const principal = await requireAuth(req);
      const result = await service.recordBillableUsageEvent(principal, req.body);
      sendOk(res, result.replayed ? 200 : 201, result, resolveCorrelationId(req));
    }),
  );

  router.get(
    '/usage-summary',
    withStandardErrorBoundary(async (req, res) => {
      const principal = await requireAuth(req);
      const periodKey =
        typeof req.query.billingPeriodKey === 'string'
          ? req.query.billingPeriodKey
          : new Date().toISOString().slice(0, 7);
      const summary = await service.getUsageBillingSummaryAndPreview(principal, principal.uid, periodKey);
      sendOk(res, 200, { summary }, resolveCorrelationId(req));
    }),
  );

  // ---- Refunds ----
  router.post(
    '/refunds',
    withStandardErrorBoundary(async (req, res) => {
      const principal = await requireAuth(req);
      const result = await service.requestRefund(principal, req.body);
      sendOk(res, result.replayed ? 200 : 201, result, resolveCorrelationId(req));
    }),
  );

  // ---- Administrative Financial Operations ----
  router.post(
    '/admin/products',
    withStandardErrorBoundary(async (req, res) => {
      const principal = await requireAuth(req);
      const result = await service.createOrUpdateBillingProduct(principal, req.body);
      sendOk(res, 201, result, resolveCorrelationId(req));
    }),
  );

  router.put(
    '/admin/products/:productId',
    withStandardErrorBoundary(async (req, res) => {
      const principal = await requireAuth(req);
      const result = await service.createOrUpdateBillingProduct(
        principal,
        req.body,
        String(req.params.productId),
      );
      sendOk(res, 200, result, resolveCorrelationId(req));
    }),
  );

  router.post(
    '/admin/coupons',
    withStandardErrorBoundary(async (req, res) => {
      const principal = await requireAuth(req);
      const coupon = await service.createCoupon(principal, req.body);
      sendOk(res, 201, { coupon }, resolveCorrelationId(req));
    }),
  );

  router.post(
    '/admin/coupons/:couponCode/revoke',
    withStandardErrorBoundary(async (req, res) => {
      const principal = await requireAuth(req);
      const coupon = await service.revokeCoupon(principal, String(req.params.couponCode));
      sendOk(res, 200, { coupon }, resolveCorrelationId(req));
    }),
  );

  router.post(
    '/admin/entitlements/grant',
    withStandardErrorBoundary(async (req, res) => {
      const principal = await requireAuth(req);
      const grant = await service.grantAdministrativeEntitlement(principal, req.body);
      sendOk(res, 201, { grant }, resolveCorrelationId(req));
    }),
  );

  router.post(
    '/admin/entitlements/:grantId/revoke',
    withStandardErrorBoundary(async (req, res) => {
      const principal = await requireAuth(req);
      const grant = await service.revokeEntitlementGrant(
        principal,
        String(req.params.grantId),
        String(req.body?.reason ?? 'Administrative revocation'),
      );
      sendOk(res, 200, { grant }, resolveCorrelationId(req));
    }),
  );

  router.post(
    '/admin/refunds/:refundId/decision',
    withStandardErrorBoundary(async (req, res) => {
      const principal = await requireAuth(req);
      const result = await service.decideRefundApproval(
        principal,
        String(req.params.refundId),
        req.body,
      );
      sendOk(res, 200, result, resolveCorrelationId(req));
    }),
  );

  router.post(
    '/admin/reconciliation/batches',
    withStandardErrorBoundary(async (req, res) => {
      const principal = await requireAuth(req);
      const result = await service.runReconciliationBatch(principal, req.body);
      sendOk(res, 201, result, resolveCorrelationId(req));
    }),
  );

  router.post(
    '/admin/reconciliation/exceptions/:exceptionId/resolve',
    withStandardErrorBoundary(async (req, res) => {
      const principal = await requireAuth(req);
      const exception = await service.resolveReconciliationException(
        principal,
        String(req.params.exceptionId),
        req.body,
      );
      sendOk(res, 200, { exception }, resolveCorrelationId(req));
    }),
  );

  return router;
}
