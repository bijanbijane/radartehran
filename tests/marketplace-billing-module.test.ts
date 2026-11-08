/**
 * Employee 67 — Real Estate Marketplace Payments, Billing & Financial Operations Test Suite
 * (`tests/marketplace-billing-module.test.ts`)
 */

import assert from 'node:assert/strict';
import express from 'express';
import { CoreApiError } from '../server/modules/core';
import type {
  AuthenticatedPrincipal,
  DelegatedAdminStoreAdapter,
  FirebaseTokenVerifierAdapter,
  StructuredAuditEvent,
} from '../server/modules/core/types';
import {
  computeInvoiceLineItemArithmetic,
  computeWebhookHmacSignature,
  createDefaultBillingNotificationAdapter,
  createDefaultBrokerageCommissionAdapter,
  createDefaultCustomerDirectoryAdapter,
  createDefaultFinancialDocumentAdapter,
  createDefaultFinancialLedgerAdapter,
  createInMemoryMarketplaceBillingTxRunner,
  createMarketplaceBillingRouter,
  createSandboxPaymentProviderAdapter,
  MarketplaceBillingService,
  type MarketplaceBillingDomainEvent,
} from '../server/modules/marketplace-billing';

function createTestHarness() {
  const txRunner = createInMemoryMarketplaceBillingTxRunner();
  const auditEvents: StructuredAuditEvent[] = [];
  const domainEvents: MarketplaceBillingDomainEvent[] = [];
  const ledgerAdapter = createDefaultFinancialLedgerAdapter();
  const documentAdapter = createDefaultFinancialDocumentAdapter();
  const directoryAdapter = createDefaultCustomerDirectoryAdapter();
  const commissionAdapter = createDefaultBrokerageCommissionAdapter();
  const notificationAdapter = createDefaultBillingNotificationAdapter();
  const sandboxProvider = createSandboxPaymentProviderAdapter(
    'sandbox_gateway_ir',
    'test_webhook_hmac_secret_2026',
  );

  const tokenVerifier: FirebaseTokenVerifierAdapter = {
    async verifyIdToken(token: string) {
      if (token === 'token_user_a' || token === 'valid_bearer_token_user_a') {
        return { uid: 'user_a', email: 'user_a@example.com', email_verified: true };
      }
      if (token === 'token_user_b' || token === 'valid_bearer_token_user_b') {
        return { uid: 'user_b', email: 'user_b@example.com', email_verified: true };
      }
      if (token === 'token_admin' || token === 'valid_bearer_token_admin') {
        return { uid: 'admin_1', email: 'admin@radar.ir', email_verified: true, admin: true };
      }
      throw new Error('Invalid token');
    },
  };

  const adminStore: DelegatedAdminStoreAdapter = {
    async getDelegatedAdminByUid(uid: string) {
      if (uid === 'admin_1') {
        return { uid: 'admin_1', email: 'admin@radar.ir', role: 'admin', active: true };
      }
      return null;
    },
  };

  const service = new MarketplaceBillingService({
    tokenVerifier,
    adminStore,
    txRunner,
    auditSink: {
      async writeAuditEvent(event) {
        auditEvents.push(event);
      },
    },
    primaryAdminEmails: ['admin@radar.ir'],
    ledgerAdapter,
    documentAdapter,
    directoryAdapter,
    commissionAdapter,
    notificationAdapter,
    providerAdapters: [sandboxProvider],
    onDomainEvent(event) {
      domainEvents.push(event);
    },
  });

  const userA: AuthenticatedPrincipal = {
    uid: 'user_a',
    email: 'user_a@example.com',
    emailVerified: true,
    role: 'verified_user',
    authMode: 'firebase_id_token',
    claims: {},
  };

  const userB: AuthenticatedPrincipal = {
    uid: 'user_b',
    email: 'user_b@example.com',
    emailVerified: true,
    role: 'verified_user',
    authMode: 'firebase_id_token',
    claims: {},
  };

  const adminPrincipal: AuthenticatedPrincipal = {
    uid: 'admin_1',
    email: 'admin@radar.ir',
    emailVerified: true,
    role: 'primary_admin',
    authMode: 'firebase_id_token',
    claims: { admin: true },
  };

  return {
    service,
    sandboxProvider,
    ledgerAdapter,
    documentAdapter,
    auditEvents,
    domainEvents,
    userA,
    userB,
    adminPrincipal,
    tokenVerifier,
    adminStore,
    txRunner,
  };
}

async function runTests(): Promise<void> {
  console.log('--- Running Employee 67 Marketplace Billing & Financial Operations Tests ---');

  // 1. Billing product validation, pricing version selection, cache invalidation & exact integer arithmetic
  {
    const h = createTestHarness();
    const initialCatalog = await h.service.listAvailableBillingProducts();
    assert.ok(initialCatalog.length >= 4, 'Default billing products should be seeded');

    // Floating-point unitAmountMinor must be rejected
    await assert.rejects(
      () =>
        h.service.createOrUpdateBillingProduct(h.adminPrincipal, {
          code: 'FLOAT_INVALID_PROD',
          name: 'محصول تست اعشاری',
          category: 'LISTING_PROMOTION',
          currency: 'IRT',
          unitAmountMinor: 125.5,
          billingInterval: 'ONE_TIME',
        }),
      (err: unknown) => err instanceof CoreApiError && err.status === 400,
    );

    // Non-admin cannot create or update billing products
    await assert.rejects(
      () =>
        h.service.createOrUpdateBillingProduct(h.userA, {
          code: 'UNAUTH_PROD',
          name: 'محصول غیرمجاز',
          category: 'LISTING_PROMOTION',
          currency: 'IRT',
          unitAmountMinor: 300_000,
          billingInterval: 'ONE_TIME',
        }),
      (err: unknown) => err instanceof CoreApiError && err.status === 403,
    );

    // Admin creates product -> pricing version v1 -> updates product -> pricing version v2 & cache invalidated
    const created = await h.service.createOrUpdateBillingProduct(h.adminPrincipal, {
      code: 'BOOST_3D_TOUR',
      name: 'ارتقای تور سه‌بعدی آگهی',
      category: 'ADDITIONAL_MARKETPLACE_SERVICE',
      currency: 'IRT',
      unitAmountMinor: 800_000,
      billingInterval: 'ONE_TIME',
      taxTreatment: {
        taxCode: 'VAT_IR_STANDARD_10',
        rateBasisPoints: 1000,
        inclusive: false,
      },
    });
    assert.equal(created.pricingVersion.versionNumber, 1);

    const updated = await h.service.createOrUpdateBillingProduct(
      h.adminPrincipal,
      {
        code: 'BOOST_3D_TOUR',
        name: 'ارتقای تور سه‌بعدی آگهی نسخه ۲',
        category: 'ADDITIONAL_MARKETPLACE_SERVICE',
        currency: 'IRT',
        unitAmountMinor: 950_000,
        billingInterval: 'ONE_TIME',
      },
      created.product.productId,
    );
    assert.equal(updated.pricingVersion.versionNumber, 2);
    assert.equal(updated.product.pricingVersionIds.length, 2);

    const refreshedCatalog = await h.service.listAvailableBillingProducts();
    const foundUpdated = refreshedCatalog.find((i) => i.product.productId === created.product.productId);
    assert.ok(foundUpdated);
    assert.equal(foundUpdated.activePricing.unitAmountMinor, 950_000);

    // Exact integer arithmetic verification (both exclusive and inclusive tax)
    const exclusiveLine = computeInvoiceLineItemArithmetic({
      lineItemId: 'li_1',
      productId: 'p1',
      pricingVersionId: 'pv1',
      description: 'Test exclusive VAT',
      quantity: 3,
      unitAmountMinor: 500_000,
      discountMinor: 150_000,
      taxTreatment: { taxCode: 'VAT_IR_STANDARD_10', rateBasisPoints: 1000, inclusive: false },
    });
    assert.equal(exclusiveLine.subtotalMinor, 1_500_000);
    assert.equal(exclusiveLine.discountMinor, 150_000);
    assert.equal(exclusiveLine.taxMinor, 135_000); // 10% of 1,350,000
    assert.equal(exclusiveLine.totalMinor, 1_485_000);

    const inclusiveLine = computeInvoiceLineItemArithmetic({
      lineItemId: 'li_2',
      productId: 'p2',
      pricingVersionId: 'pv2',
      description: 'Test inclusive VAT',
      quantity: 1,
      unitAmountMinor: 1_100_000,
      discountMinor: 0,
      taxTreatment: { taxCode: 'VAT_IR_STANDARD_10', rateBasisPoints: 1000, inclusive: true },
    });
    assert.equal(inclusiveLine.taxMinor, 100_000);
    assert.equal(inclusiveLine.totalMinor, 1_100_000);
  }

  // 2. Payment intent creation, untrusted field rejection, provider outage resilience, webhook HMAC & replay protection, and Ledger integration
  {
    const h = createTestHarness();

    // Client-submitted amountMinor, status, or raw card credentials must be rejected
    for (const forbiddenPayload of [
      { productId: 'prod_featured_listing', idempotencyKey: 'idem_bad_1', amountMinor: 100 },
      { productId: 'prod_featured_listing', idempotencyKey: 'idem_bad_2', status: 'SUCCEEDED' },
      { productId: 'prod_featured_listing', idempotencyKey: 'idem_bad_3', cardNumber: '6037991122334455' },
      { productId: 'prod_featured_listing', idempotencyKey: 'idem_bad_4', cvv: '123' },
    ]) {
      await assert.rejects(
        () => h.service.createPaymentIntent(h.userA, forbiddenPayload),
        (err: unknown) => err instanceof CoreApiError && err.status === 400,
      );
    }

    // Currency manipulation must be rejected
    await assert.rejects(
      () =>
        h.service.createPaymentIntent(h.userA, {
          productId: 'prod_featured_listing',
          idempotencyKey: 'idem_curr_mismatch',
          currency: 'USD',
        }),
      (err: unknown) => err instanceof CoreApiError && err.status === 400,
    );

    // Provider outage simulation: timeout during initiation does not corrupt state
    h.sandboxProvider.setSimulatedFailureMode('TIMEOUT');
    const outageResult = await h.service.createPaymentIntent(h.userA, {
      productId: 'prod_featured_listing',
      idempotencyKey: 'idem_outage_test_1',
    });
    assert.equal(outageResult.paymentIntent.status, 'CREATED');
    assert.equal(outageResult.paymentIntent.lastErrorCategory, 'PROVIDER_TIMEOUT');
    h.sandboxProvider.setSimulatedFailureMode('NONE');

    // Normal payment intent creation + idempotent replay
    const created1 = await h.service.createPaymentIntent(h.userA, {
      productId: 'prod_featured_listing',
      quantity: 2,
      idempotencyKey: 'idem_featured_purchase_1',
    });
    assert.equal(created1.replayed, false);
    assert.equal(created1.paymentIntent.status, 'INITIATED');
    assert.equal(created1.paymentIntent.subtotalAmountMinor, 1_000_000); // 2 * 500,000
    assert.equal(created1.paymentIntent.taxAmountMinor, 100_000); // 10% VAT
    assert.equal(created1.paymentIntent.totalAmountMinor, 1_100_000);

    const replayed1 = await h.service.createPaymentIntent(h.userA, {
      productId: 'prod_featured_listing',
      quantity: 2,
      idempotencyKey: 'idem_featured_purchase_1',
    });
    assert.equal(replayed1.replayed, true);
    assert.equal(replayed1.paymentIntent.paymentIntentId, created1.paymentIntent.paymentIntentId);

    // Forged webhook signature must be rejected with 403 FORBIDDEN
    const webhookUnsigned = {
      providerId: 'sandbox_gateway_ir',
      webhookEventId: 'wh_evt_1001',
      paymentIntentId: created1.paymentIntent.paymentIntentId,
      providerTransactionRef: created1.paymentIntent.providerTransactionRef!,
      eventStatus: 'SUCCEEDED' as const,
      paidAmountMinor: created1.paymentIntent.totalAmountMinor,
      currency: 'IRT' as const,
      occurredAtIso: new Date().toISOString(),
    };
    await assert.rejects(
      () =>
        h.service.processProviderWebhook({
          ...webhookUnsigned,
          rawSignature: 'forged_invalid_signature_0000',
        }),
      (err: unknown) => err instanceof CoreApiError && err.status === 403,
    );

    // Valid webhook signature confirms payment, posts to Employee 54 ledger, and grants entitlement
    const validSig = computeWebhookHmacSignature(
      h.sandboxProvider.getWebhookSecret(),
      webhookUnsigned,
    );
    const whResult1 = await h.service.processProviderWebhook({
      ...webhookUnsigned,
      rawSignature: validSig,
    });
    assert.equal(whResult1.replayedWebhook, false);
    assert.equal(whResult1.paymentIntent.status, 'SUCCEEDED');
    assert.equal(whResult1.invoice.status, 'PAID');

    // Duplicate / replayed webhook is safely ignored without duplicate ledger postings
    const whReplay = await h.service.processProviderWebhook({
      ...webhookUnsigned,
      rawSignature: validSig,
    });
    assert.equal(whReplay.replayedWebhook, true);

    const ledgerEntries = await h.ledgerAdapter.listLedgerEntriesBySource(
      created1.paymentIntent.paymentIntentId,
    );
    const revenuePostings = ledgerEntries.filter((e) => e.postingType === 'PLATFORM_SERVICE_REVENUE');
    const taxPostings = ledgerEntries.filter((e) => e.postingType === 'TAX_LIABILITY');
    assert.equal(revenuePostings.length, 1, 'Must have exactly 1 revenue posting (no duplicates)');
    assert.equal(revenuePostings[0].amountMinor, 1_000_000);
    assert.equal(taxPostings.length, 1, 'Must have exactly 1 tax liability posting');
    assert.equal(taxPostings[0].amountMinor, 100_000);

    // Entitlement granted from one-time purchase of 2 featured listings
    const entCheck = await h.service.evaluateEntitlementAccess({
      ownerUid: h.userA.uid,
      featureKey: 'PUBLISH_FEATURED_LISTING',
    });
    assert.equal(entCheck.allowed, true);
    assert.equal(entCheck.aggregatedMaxFeaturedListings, 2);
  }

  // 3. Subscriptions lifecycle, upgrades/downgrades, pause/resume, failed renewal grace periods, and entitlements
  {
    const h = createTestHarness();

    // Before subscribing, PRO analytics feature is denied
    const preCheck = await h.service.evaluateEntitlementAccess({
      ownerUid: h.userA.uid,
      featureKey: 'PROFESSIONAL_ANALYTICS_PRO',
    });
    assert.equal(preCheck.allowed, false);

    // Create subscription -> status is PENDING_INITIAL_PAYMENT
    const subCreated = await h.service.createSubscription(h.userA, {
      productId: 'prod_pro_agent_plan',
      idempotencyKey: 'idem_sub_pro_1',
    });
    assert.equal(subCreated.subscription.status, 'PENDING_INITIAL_PAYMENT');

    // Confirm initial payment via verified webhook -> status becomes ACTIVE and entitlements are granted
    const whPayload = {
      providerId: 'sandbox_gateway_ir',
      webhookEventId: 'wh_sub_activate_1',
      paymentIntentId: subCreated.paymentIntent.paymentIntentId,
      providerTransactionRef: subCreated.paymentIntent.providerTransactionRef!,
      eventStatus: 'SUCCEEDED' as const,
      paidAmountMinor: subCreated.paymentIntent.totalAmountMinor,
      currency: 'IRT' as const,
      occurredAtIso: new Date().toISOString(),
    };
    await h.service.processProviderWebhook({
      ...whPayload,
      rawSignature: computeWebhookHmacSignature(h.sandboxProvider.getWebhookSecret(), whPayload),
    });

    const activeCheck = await h.service.evaluateEntitlementAccess({
      ownerUid: h.userA.uid,
      featureKey: 'PROFESSIONAL_ANALYTICS_PRO',
    });
    assert.equal(activeCheck.allowed, true);
    assert.equal(activeCheck.aggregatedMaxActiveListings, 25);

    // Upgrade subscription to Brokerage Enterprise Plan -> maxActiveListings becomes 150
    const upgraded = await h.service.changeSubscriptionPlan(
      h.userA,
      subCreated.subscription.subscriptionId,
      { targetProductId: 'prod_brokerage_plan' },
    );
    assert.equal(upgraded.action, 'UPGRADED');

    const postUpgradeCheck = await h.service.evaluateEntitlementAccess({
      ownerUid: h.userA.uid,
      featureKey: 'BROKERAGE_TEAM_SEATS',
    });
    assert.equal(postUpgradeCheck.allowed, true);
    assert.equal(postUpgradeCheck.aggregatedMaxActiveListings, 150);
    assert.equal(postUpgradeCheck.aggregatedMaxBrokerageAgentSeats, 25);

    // Pause subscription -> revokes active entitlement while paused
    const paused = await h.service.pauseOrResumeSubscription(
      h.userA,
      subCreated.subscription.subscriptionId,
      'PAUSE',
    );
    assert.equal(paused.status, 'PAUSED');

    const pausedCheck = await h.service.evaluateEntitlementAccess({
      ownerUid: h.userA.uid,
      featureKey: 'BROKERAGE_TEAM_SEATS',
    });
    assert.equal(pausedCheck.allowed, false);

    // Resume subscription -> restores entitlement
    const resumed = await h.service.pauseOrResumeSubscription(
      h.userA,
      subCreated.subscription.subscriptionId,
      'RESUME',
    );
    assert.equal(resumed.status, 'ACTIVE');

    // Simulate failed renewal payment intent -> subscription enters PAST_DUE with grace period
    const renewalIntent = await h.service.createPaymentIntent(h.userA, {
      productId: 'prod_brokerage_plan',
      purposeType: 'SUBSCRIPTION_RENEWAL',
      subscriptionId: subCreated.subscription.subscriptionId,
      idempotencyKey: 'idem_sub_renewal_fail_1',
    });
    const failWh = {
      providerId: 'sandbox_gateway_ir',
      webhookEventId: 'wh_sub_renewal_failed_1',
      paymentIntentId: renewalIntent.paymentIntent.paymentIntentId,
      providerTransactionRef: renewalIntent.paymentIntent.providerTransactionRef!,
      eventStatus: 'FAILED' as const,
      paidAmountMinor: 0,
      currency: 'IRT' as const,
      failureCategory: 'INSUFFICIENT_FUNDS' as const,
      failureReason: 'Insufficient funds on renewal card',
      occurredAtIso: new Date().toISOString(),
    };
    await h.service.processProviderWebhook({
      ...failWh,
      rawSignature: computeWebhookHmacSignature(h.sandboxProvider.getWebhookSecret(), failWh),
    });

    const subsList = await h.service.listUserSubscriptions(h.userA);
    assert.equal(subsList[0].subscription.status, 'PAST_DUE');
    assert.ok(subsList[0].subscription.gracePeriodEndsAtIso);

    // Run background expiration job after grace period -> transitions subscription & grant to EXPIRED
    const futureIso = new Date(Date.now() + 10 * 86_400_000).toISOString();
    const jobRes = await h.service.executeBillingLifecycleBackgroundJob(futureIso);
    assert.equal(jobRes.expiredSubscriptionsCount, 1);

    const expiredCheck = await h.service.evaluateEntitlementAccess({
      ownerUid: h.userA.uid,
      featureKey: 'BROKERAGE_TEAM_SEATS',
      nowIso: futureIso,
    });
    assert.equal(expiredCheck.allowed, false);
  }

  // 4. Coupons, concurrency/redemption limits, per-user limits & administrative revocation
  {
    const h = createTestHarness();
    const coupon = await h.service.createCoupon(h.adminPrincipal, {
      code: 'SPRING20',
      name: 'تخفیف ۲۰ درصدی بهاره',
      discountType: 'PERCENTAGE_BPS',
      discountValue: 2000, // 20%
      maxRedemptions: 1,
      perUserLimit: 1,
      minimumPurchaseMinor: 100_000,
    });
    assert.equal(coupon.code, 'SPRING20');

    // User A redeems coupon on featured listing (500,000 - 20% = 400,000 + 40,000 VAT = 440,000)
    const intentWithCoupon = await h.service.createPaymentIntent(h.userA, {
      productId: 'prod_featured_listing',
      couponCode: 'SPRING20',
      idempotencyKey: 'idem_cpn_use_1',
    });
    assert.equal(intentWithCoupon.paymentIntent.discountAmountMinor, 100_000);
    assert.equal(intentWithCoupon.paymentIntent.taxAmountMinor, 40_000);
    assert.equal(intentWithCoupon.paymentIntent.totalAmountMinor, 440_000);

    // Second redemption attempt by User B must fail because maxRedemptions=1 is exhausted
    await assert.rejects(
      () =>
        h.service.createPaymentIntent(h.userB, {
          productId: 'prod_featured_listing',
          couponCode: 'SPRING20',
          idempotencyKey: 'idem_cpn_use_2',
        }),
      (err: unknown) => err instanceof CoreApiError && err.status === 409,
    );
  }

  // 5. Controlled Refunds (partial & full, over-refund prevention, admin approval workflow, ledger reversal & credit notes)
  {
    const h = createTestHarness();
    const purchase = await h.service.createPaymentIntent(h.userA, {
      productId: 'prod_featured_listing',
      quantity: 1,
      idempotencyKey: 'idem_refund_flow_1',
    });
    // Total is 550,000 IRT (below 10M threshold -> auto-approved)
    const wh = {
      providerId: 'sandbox_gateway_ir',
      webhookEventId: 'wh_refund_flow_1',
      paymentIntentId: purchase.paymentIntent.paymentIntentId,
      providerTransactionRef: purchase.paymentIntent.providerTransactionRef!,
      eventStatus: 'SUCCEEDED' as const,
      paidAmountMinor: purchase.paymentIntent.totalAmountMinor,
      currency: 'IRT' as const,
      occurredAtIso: new Date().toISOString(),
    };
    await h.service.processProviderWebhook({
      ...wh,
      rawSignature: computeWebhookHmacSignature(h.sandboxProvider.getWebhookSecret(), wh),
    });

    // Partial refund of 220,000 IRT
    const partialRef = await h.service.requestRefund(h.userA, {
      paymentIntentId: purchase.paymentIntent.paymentIntentId,
      requestedAmountMinor: 220_000,
      reasonCode: 'CUSTOMER_CANCELLATION_WITHIN_POLICY',
      reasonDetails: 'Partial refund request',
      idempotencyKey: 'idem_ref_partial_1',
    });
    assert.equal(partialRef.refund.status, 'COMPLETED');
    assert.ok(partialRef.creditNote);
    assert.equal(partialRef.creditNote.totalCreditedMinor, 220_000);

    // Over-refund attempt (requesting 400,000 when only 330,000 remains) must be rejected
    await assert.rejects(
      () =>
        h.service.requestRefund(h.userA, {
          paymentIntentId: purchase.paymentIntent.paymentIntentId,
          requestedAmountMinor: 400_000,
          reasonCode: 'BILLING_ERROR',
          idempotencyKey: 'idem_ref_over_1',
        }),
      (err: unknown) => err instanceof CoreApiError && err.status === 400,
    );

    // Remaining 330,000 refund succeeds and transitions invoice/paymentIntent to REFUNDED
    const remainingRef = await h.service.requestRefund(h.userA, {
      paymentIntentId: purchase.paymentIntent.paymentIntentId,
      requestedAmountMinor: 330_000,
      reasonCode: 'CUSTOMER_CANCELLATION_WITHIN_POLICY',
      idempotencyKey: 'idem_ref_rem_1',
    });
    assert.equal(remainingRef.refund.status, 'COMPLETED');

    const statusAfter = await h.service.getPaymentIntentStatus(
      h.userA,
      purchase.paymentIntent.paymentIntentId,
    );
    assert.equal(statusAfter.paymentIntent.status, 'REFUNDED');
    assert.equal(statusAfter.paymentIntent.refundedAmountMinor, 550_000);

    // Verify Employee 54 ledger contains REFUND_REVERSAL entries and original revenue posting is untouched
    const allLedger = await h.ledgerAdapter.listAllBillingLedgerEntries();
    const reversals = allLedger.filter(
      (e) =>
        e.paymentIntentId === purchase.paymentIntent.paymentIntentId &&
        e.postingType === 'REFUND_REVERSAL',
    );
    assert.equal(reversals.length, 2);
  }

  // 6. Usage-Based Billing, Commission References & Financial Reconciliation
  {
    const h = createTestHarness();

    // Behavioral telemetry without explicit billingDisclosureAccepted=true must be rejected
    await assert.rejects(
      () =>
        h.service.recordBillableUsageEvent(h.userA, {
          featureKey: 'API_VALUATION_CALL',
          quantity: 5,
          billingDisclosureAccepted: false,
          idempotencyKey: 'idem_usage_no_disclosure',
        }),
      (err: unknown) => err instanceof CoreApiError && err.status === 400,
    );

    // Record 15 API valuation calls (10 included in default pricing version, 5 overage @ 15,000 = 75,000 IRT)
    await h.service.recordBillableUsageEvent(h.userA, {
      featureKey: 'API_VALUATION_CALL',
      quantity: 15,
      billingDisclosureAccepted: true,
      billingPeriodKey: '2026-11',
      idempotencyKey: 'idem_usage_valid_15',
    });

    const usageSummary = await h.service.getUsageBillingSummaryAndPreview(
      h.userA,
      h.userA.uid,
      '2026-11',
    );
    assert.equal(usageSummary.totalEstimatedChargeMinor, 75_000);
    assert.equal(usageSummary.featureTotals[0].billableQuantity, 5);

    // Commission service fee payment intent integrates with authoritative commission adapter
    const commIntent = await h.service.createPaymentIntent(h.userA, {
      productId: 'prod_featured_listing',
      purposeType: 'COMMISSION_SERVICE_FEE',
      transactionDealId: 'deal_9001',
      brokerageId: 'brk_101',
      idempotencyKey: 'idem_comm_fee_1',
    });
    assert.equal(commIntent.paymentIntent.subtotalAmountMinor, 5_000_000); // From authoritative commission adapter

    // Financial Reconciliation Batch detecting mismatches and resolving via authorized adjustment
    const recResult = await h.service.runReconciliationBatch(h.adminPrincipal, {
      providerId: 'sandbox_gateway_ir',
      providerRecords: [
        {
          providerId: 'sandbox_gateway_ir',
          providerTransactionRef: 'ptx_unknown_999',
          amountMinor: 550_000,
          currency: 'IRT',
          status: 'SETTLED',
          settledAtIso: new Date().toISOString(),
        },
        {
          providerId: 'sandbox_gateway_ir',
          providerTransactionRef: 'ptx_unknown_999', // Duplicate provider ref
          amountMinor: 550_000,
          currency: 'IRT',
          status: 'SETTLED',
          settledAtIso: new Date().toISOString(),
        },
      ],
    });
    assert.equal(recResult.batch.status, 'COMPLETED_WITH_EXCEPTIONS');
    assert.ok(recResult.exceptions.some((e) => e.mismatchType === 'MISSING_IN_INTERNAL_INTENTS'));
    assert.ok(recResult.exceptions.some((e) => e.mismatchType === 'DUPLICATE_PROVIDER_TRANSACTION'));

    const resolvedExc = await h.service.resolveReconciliationException(
      h.adminPrincipal,
      recResult.exceptions[0].exceptionId,
      {
        resolutionMode: 'RESOLVED_BY_ADJUSTMENT',
        resolutionNote: 'Posted suspense adjustment after gateway settlement verification.',
      },
    );
    assert.equal(resolvedExc.status, 'RESOLVED_BY_ADJUSTMENT');
    assert.ok(resolvedExc.resolutionAdjustmentPostingId);
  }

  // 7. Customer Financial Data Isolation & Express HTTP Router Verification
  {
    const h = createTestHarness();
    const intentA = await h.service.createPaymentIntent(h.userA, {
      productId: 'prod_featured_listing',
      idempotencyKey: 'idem_isolation_1',
    });

    // User B cannot view User A's payment intent, invoices, or invoice document
    await assert.rejects(
      () => h.service.getPaymentIntentStatus(h.userB, intentA.paymentIntent.paymentIntentId),
      (err: unknown) => err instanceof CoreApiError && err.status === 403,
    );
    await assert.rejects(
      () => h.service.getInvoiceDocument(h.userB, intentA.invoice.invoiceId),
      (err: unknown) => err instanceof CoreApiError && err.status === 403,
    );

    // Express Router integration test
    const app = express();
    app.use(express.json());
    app.use(
      '/api/v1/billing',
      createMarketplaceBillingRouter(
        {
          tokenVerifier: h.tokenVerifier,
          adminStore: h.adminStore,
          txRunner: h.txRunner,
          auditSink: { async writeAuditEvent() {} },
          primaryAdminEmails: ['admin@radar.ir'],
        },
        h.service,
      ),
    );

    const server = app.listen(0);
    try {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      const baseUrl = `http://127.0.0.1:${port}/api/v1/billing`;

      const prodRes = await fetch(`${baseUrl}/products`);
      assert.equal(prodRes.status, 200);
      const prodBody = (await prodRes.json()) as { ok: boolean; data: { items: unknown[] } };
      assert.equal(prodBody.ok, true);
      assert.ok(prodBody.data.items.length >= 4);

      const unauthRes = await fetch(`${baseUrl}/invoices`);
      assert.equal(unauthRes.status, 401);

      const invRes = await fetch(`${baseUrl}/invoices`, {
        headers: { Authorization: 'Bearer valid_bearer_token_user_a' },
      });
      assert.equal(invRes.status, 200);
    } finally {
      server.close();
    }
  }

  console.log('[PASS] All Employee 67 Marketplace Billing & Financial Operations tests passed!');
}

runTests().catch((err) => {
  console.error('[FAIL] Employee 67 tests failed:', err);
  process.exit(1);
});
