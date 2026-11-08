/**
 * Employee 67 — Marketplace Payments, Billing, Subscriptions, Entitlements, Invoicing & Reconciliation Service
 * (`server/modules/marketplace-billing/service.ts`)
 *
 * Exclusive ownership: `server/modules/marketplace-billing/`
 */

import crypto from 'node:crypto';
import {
  CoreApiError,
  createStructuredAuditEvent,
  sanitizeTextInput,
  verifyAdminOrDelegatedPrincipal,
} from '../core';
import type { AuthenticatedPrincipal, TransactionContextLike } from '../core/types';
import {
  createDefaultBillingNotificationAdapter,
  createDefaultBrokerageCommissionAdapter,
  createDefaultCustomerDirectoryAdapter,
  createDefaultFinancialDocumentAdapter,
  createDefaultFinancialLedgerAdapter,
  createSandboxPaymentProviderAdapter,
  MarketplaceBillingRepository,
} from './repository';
import type {
  AuthoritativeFinancialLedgerAdapter,
  BillableFeatureKey,
  BillingCurrency,
  BillingInterval,
  BillingNotificationAdapter,
  BillingProductRecord,
  BrokerageAndCommissionReferenceAdapter,
  CommissionBillingReferenceRecord,
  CouponDefinitionRecord,
  CouponRedemptionRecord,
  CreditNoteRecord,
  CustomerAndOrganizationDirectoryAdapter,
  EntitlementAccessDecision,
  EntitlementGrantRecord,
  EntitlementPolicyRecord,
  FinancialDocumentManagementAdapter,
  MarketplaceBillingDomainEvent,
  MarketplaceBillingDomainEventType,
  MarketplaceBillingModuleDependencies,
  MarketplaceInvoiceRecord,
  MarketplaceSubscriptionRecord,
  PaymentHistoryEntry,
  PaymentIntentRecord,
  PaymentProviderAdapter,
  PaymentProviderConfigReference,
  PaymentPurposeType,
  PricingVersionRecord,
  ProviderSettlementRecordInput,
  ProviderWebhookPayload,
  ReconciliationBatchRecord,
  ReconciliationExceptionRecord,
  RefundRequestRecord,
  SubscriptionHistoryEntryRecord,
  UsageBillingEventRecord,
  UsageBillingSummaryView,
} from './types';
import {
  assertPlainObject,
  assertSafeNonNegativeInteger,
  assertSafePositiveInteger,
  computeCouponDiscountMinor,
  computeInvoiceLineItemArithmetic,
  rejectForbiddenClientFinancialFields,
  SUPPORTED_FEATURE_KEYS,
  SUPPORTED_PAYMENT_PURPOSE_TYPES,
  validateCreateCouponInput,
  validateCreateOrUpdateProductInput,
  validateCurrency,
} from './validation';

const REFUND_ADMIN_APPROVAL_THRESHOLD_MINOR: Record<BillingCurrency, number> = {
  IRT: 10_000_000, // 10 Million Tomans
  IRR: 100_000_000,
  USD: 50_000, // $500.00 in cents
  EUR: 50_000,
  AED: 180_000,
};

export class MarketplaceBillingService {
  private readonly deps: MarketplaceBillingModuleDependencies;
  public readonly repo: MarketplaceBillingRepository;
  public readonly ledgerAdapter: AuthoritativeFinancialLedgerAdapter;
  public readonly documentAdapter: FinancialDocumentManagementAdapter;
  public readonly directoryAdapter: CustomerAndOrganizationDirectoryAdapter;
  public readonly commissionAdapter: BrokerageAndCommissionReferenceAdapter;
  public readonly notificationAdapter: BillingNotificationAdapter;
  private readonly providerAdapters = new Map<string, PaymentProviderAdapter>();
  private defaultsSeeded = false;

  constructor(deps: MarketplaceBillingModuleDependencies) {
    this.deps = deps;
    this.repo = new MarketplaceBillingRepository(deps.txRunner);
    this.ledgerAdapter = deps.ledgerAdapter ?? createDefaultFinancialLedgerAdapter();
    this.documentAdapter = deps.documentAdapter ?? createDefaultFinancialDocumentAdapter();
    this.directoryAdapter = deps.directoryAdapter ?? createDefaultCustomerDirectoryAdapter();
    this.commissionAdapter = deps.commissionAdapter ?? createDefaultBrokerageCommissionAdapter();
    this.notificationAdapter = deps.notificationAdapter ?? createDefaultBillingNotificationAdapter();

    const defaultProvider = createSandboxPaymentProviderAdapter('sandbox_gateway_ir');
    this.providerAdapters.set(defaultProvider.providerId, defaultProvider);
    if (deps.providerAdapters) {
      for (const adapter of deps.providerAdapters) {
        this.providerAdapters.set(adapter.providerId, adapter);
      }
    }
  }

  public registerProviderAdapter(adapter: PaymentProviderAdapter): void {
    this.providerAdapters.set(adapter.providerId, adapter);
  }

  private async assertAdminPrincipal(principal: AuthenticatedPrincipal): Promise<void> {
    const decision = await verifyAdminOrDelegatedPrincipal(principal, this.deps.adminStore, {
      primaryAdminEmails: this.deps.primaryAdminEmails,
    });
    if (!decision.allowed) {
      throw new CoreApiError(
        decision.failureCode === 'INSUFFICIENT_ROLE' ? 'FORBIDDEN' : 'UNAUTHENTICATED',
        decision.status,
        decision.reason ?? 'Administrative financial authorization required.',
      );
    }
  }

  private assertOwnershipOrAdmin(
    principal: AuthenticatedPrincipal,
    ownerUid: string,
    isAdmin = false,
  ): void {
    if (isAdmin) return;
    if (
      principal.role === 'primary_admin' ||
      principal.role === 'delegated_admin' ||
      principal.role === 'server_secret_admin'
    ) {
      return;
    }
    if (principal.uid !== ownerUid) {
      throw new CoreApiError(
        'FORBIDDEN',
        403,
        'Access denied: financial record belongs to another account.',
      );
    }
  }

  private async emitAuditAndDomainEvent(params: {
    actor: AuthenticatedPrincipal;
    targetUid: string;
    eventType: MarketplaceBillingDomainEventType;
    action: string;
    resourceId: string;
    correlationId?: string;
    payload: Record<string, unknown>;
  }): Promise<void> {
    const nowIso = new Date().toISOString();
    const correlationId = params.correlationId ?? `corr_${crypto.randomBytes(6).toString('hex')}`;
    const auditEvent = createStructuredAuditEvent({
      principal: params.actor,
      correlationId,
      action: `marketplace_billing.${params.action}`,
      targetCollection: 'marketplace_billing',
      targetResourceId: params.resourceId,
      outcome: 'SUCCESS',
      metadata: params.payload,
    });
    await this.deps.auditSink.writeAuditEvent(auditEvent);

    if (this.deps.onDomainEvent) {
      await this.deps.onDomainEvent({
        eventId: `mbevt_${crypto.randomBytes(6).toString('hex')}`,
        eventType: params.eventType,
        actorUid: params.actor.uid,
        targetUid: params.targetUid,
        resourceId: params.resourceId,
        correlationId,
        payload: params.payload,
        occurredAtIso: nowIso,
      });
    }
  }

  private computePeriodEndIso(startIso: string, interval: BillingInterval): string {
    const startMs = Date.parse(startIso);
    const dayMs = 86_400_000;
    if (interval === 'MONTHLY') return new Date(startMs + 30 * dayMs).toISOString();
    if (interval === 'QUARTERLY') return new Date(startMs + 90 * dayMs).toISOString();
    if (interval === 'ANNUAL') return new Date(startMs + 365 * dayMs).toISOString();
    return new Date(startMs + 30 * dayMs).toISOString();
  }

  public async ensureDefaultCatalogSeeded(): Promise<void> {
    if (this.defaultsSeeded) return;
    await this.repo.runInTransaction('mb.seedDefaults', async (tx) => {
      const existingProducts = await this.repo.listAllProductsInTx(tx);
      if (existingProducts.length > 0) {
        this.defaultsSeeded = true;
        return;
      }

      const nowIso = new Date().toISOString();

      // Default Provider Config Reference (no raw secrets stored in DB)
      const defaultProviderConfig: PaymentProviderConfigReference = {
        providerId: 'sandbox_gateway_ir',
        displayName: 'درگاه پرداخت امن رادار (Sandbox)',
        supportedCurrencies: ['IRT', 'IRR'],
        secretEnvKeyName: 'PAYMENT_PROVIDER_SANDBOX_API_KEY',
        webhookSecretEnvKeyName: 'PAYMENT_PROVIDER_SANDBOX_WEBHOOK_SECRET',
        timeoutMs: 8000,
        maxRetries: 3,
        availabilityStatus: 'AVAILABLE',
        updatedAtIso: nowIso,
      };
      await this.repo.upsertProviderConfigInTx(tx, defaultProviderConfig);

      // Default Entitlement Policies
      const proAgentPolicy: EntitlementPolicyRecord = {
        policyId: 'pol_pro_agent_monthly',
        name: 'سیاست دسترسی مشاور حرفه‌ای',
        policyVersion: 1,
        featureKeys: [
          'PUBLISH_STANDARD_LISTING',
          'PUBLISH_FEATURED_LISTING',
          'PROMOTE_LISTING_BOOST',
          'PROFESSIONAL_ANALYTICS_PRO',
          'API_VALUATION_CALL',
        ],
        maxActiveListings: 25,
        maxFeaturedListings: 5,
        maxBrokerageAgentSeats: 1,
        monthlyUsageQuotaByFeature: {
          API_VALUATION_CALL: 200,
        },
        active: true,
        createdAtIso: nowIso,
        updatedAtIso: nowIso,
      };
      const brokerageEnterprisePolicy: EntitlementPolicyRecord = {
        policyId: 'pol_brokerage_enterprise_monthly',
        name: 'سیاست دسترسی دپارتمان املاک سازمانی',
        policyVersion: 1,
        featureKeys: [
          'PUBLISH_STANDARD_LISTING',
          'PUBLISH_FEATURED_LISTING',
          'PROMOTE_LISTING_BOOST',
          'BROKERAGE_TEAM_SEATS',
          'PROFESSIONAL_ANALYTICS_PRO',
          'PROPERTY_MANAGEMENT_PORTAL',
          'API_VALUATION_CALL',
          'BULK_DATA_EXPORT',
        ],
        maxActiveListings: 150,
        maxFeaturedListings: 30,
        maxBrokerageAgentSeats: 25,
        monthlyUsageQuotaByFeature: {
          API_VALUATION_CALL: 2000,
          BULK_DATA_EXPORT: 50,
        },
        active: true,
        createdAtIso: nowIso,
        updatedAtIso: nowIso,
      };
      const singleFeaturedListingPolicy: EntitlementPolicyRecord = {
        policyId: 'pol_single_featured_listing',
        name: 'نردبان و ویژه کردن تکی آگهی',
        policyVersion: 1,
        featureKeys: ['PUBLISH_FEATURED_LISTING', 'PROMOTE_LISTING_BOOST'],
        maxActiveListings: 2,
        maxFeaturedListings: 1,
        maxBrokerageAgentSeats: 0,
        monthlyUsageQuotaByFeature: {},
        active: true,
        createdAtIso: nowIso,
        updatedAtIso: nowIso,
      };

      await this.repo.upsertEntitlementPolicyInTx(tx, proAgentPolicy);
      await this.repo.upsertEntitlementPolicyInTx(tx, brokerageEnterprisePolicy);
      await this.repo.upsertEntitlementPolicyInTx(tx, singleFeaturedListingPolicy);

      // Default Billing Products & Pricing Versions
      const seedProductWithPricing = async (params: {
        productId: string;
        code: string;
        name: string;
        description: string;
        category: BillingProductRecord['category'];
        unitAmountMinor: number;
        billingInterval: BillingInterval;
        entitlementPolicyId: string | null;
        includedUsageUnits?: number;
        overageUnitAmountMinor?: number;
      }) => {
        const pricingVersionId = `pv_${params.productId}_v1`;
        const pricing: PricingVersionRecord = {
          pricingVersionId,
          productId: params.productId,
          versionNumber: 1,
          currency: 'IRT',
          unitAmountMinor: params.unitAmountMinor,
          billingInterval: params.billingInterval,
          includedUsageUnits: params.includedUsageUnits,
          overageUnitAmountMinor: params.overageUnitAmountMinor,
          taxTreatment: {
            taxCode: 'VAT_IR_STANDARD_10',
            rateBasisPoints: 1000, // 10% VAT
            inclusive: false,
          },
          effectiveFromIso: '2026-01-01T00:00:00.000Z',
          effectiveToIso: null,
          createdByUid: 'system_seed',
          createdAtIso: nowIso,
        };
        const product: BillingProductRecord = {
          productId: params.productId,
          code: params.code,
          name: params.name,
          description: params.description,
          category: params.category,
          activePricingVersionId: pricingVersionId,
          currency: 'IRT',
          billingInterval: params.billingInterval,
          availabilityStatus: 'ACTIVE',
          eligibility: {
            eligibleAccountTypes: [
              'INDIVIDUAL',
              'PROFESSIONAL_AGENT',
              'BROKERAGE_ORGANIZATION',
              'PROPERTY_MANAGER',
              'DEVELOPER_ENTERPRISE',
            ],
            requiresVerifiedIdentity: false,
            requiresBrokerageLicense: false,
          },
          entitlementPolicyId: params.entitlementPolicyId,
          pricingVersionIds: [pricingVersionId],
          revision: 1,
          createdAtIso: nowIso,
          updatedAtIso: nowIso,
        };
        await this.repo.upsertPricingVersionInTx(tx, pricing);
        await this.repo.upsertProductInTx(tx, product);
      };

      await seedProductWithPricing({
        productId: 'prod_featured_listing',
        code: 'FEATURED_LISTING_30D',
        name: 'آگهی ویژه و نردبان ۳۰ روزه',
        description: 'نمایش متمایز آگهی ملک در صدر نتایج جستجو و نقشه حرارتی به مدت ۳۰ روز',
        category: 'FEATURED_LISTING_PLACEMENT',
        unitAmountMinor: 500_000, // 500,000 Tomans
        billingInterval: 'ONE_TIME',
        entitlementPolicyId: singleFeaturedListingPolicy.policyId,
      });

      await seedProductWithPricing({
        productId: 'prod_pro_agent_plan',
        code: 'PRO_AGENT_MONTHLY',
        name: 'اشتراک ماهانه مشاور حرفه‌ای',
        description: 'اشتراک حرفه‌ای شامل ۲۵ آگهی فعال، ۵ آگهی ویژه و تحلیل هداونیک پیشرفته',
        category: 'PROFESSIONAL_ACCOUNT_PLAN',
        unitAmountMinor: 2_500_000, // 2,500,000 Tomans
        billingInterval: 'MONTHLY',
        entitlementPolicyId: proAgentPolicy.policyId,
      });

      await seedProductWithPricing({
        productId: 'prod_brokerage_plan',
        code: 'BROKERAGE_ORG_MONTHLY',
        name: 'اشتراک ماهانه دپارتمان املاک',
        description: 'اشتراک سازمانی دپارتمان املاک شامل ۱۵۰ آگهی فعال، ۳۰ آگهی ویژه و ۲۵ صندلی مشاور',
        category: 'BROKERAGE_SUBSCRIPTION_PLAN',
        unitAmountMinor: 9_000_000, // 9,000,000 Tomans
        billingInterval: 'MONTHLY',
        entitlementPolicyId: brokerageEnterprisePolicy.policyId,
      });

      await seedProductWithPricing({
        productId: 'prod_usage_valuation_api',
        code: 'USAGE_VALUATION_API_CALL',
        name: 'سرویس مصرفی ارزیابی هداونیک API',
        description: 'محاسبه مصرفی هر فراخوانی مازاد موتور ارزش‌گذاری هداونیک',
        category: 'USAGE_BASED_PLATFORM_SERVICE',
        unitAmountMinor: 15_000, // 15,000 Tomans per call
        billingInterval: 'USAGE_METERED',
        entitlementPolicyId: null,
        includedUsageUnits: 10,
        overageUnitAmountMinor: 15_000,
      });

      this.defaultsSeeded = true;
    });
  }

  // ==========================================================================
  // 2. MARKETPLACE BILLING PRODUCTS & PRICING VERSIONS
  // ==========================================================================

  public async listAvailableBillingProducts(): Promise<
    Array<{ product: BillingProductRecord; activePricing: PricingVersionRecord }>
  > {
    await this.ensureDefaultCatalogSeeded();
    const cached = this.repo.getCachedPricingCatalog();
    if (cached) return cached;

    const items = await this.repo.runInTransaction('mb.listAvailableProducts', async (tx) => {
      const products = await this.repo.listAllProductsInTx(tx);
      const out: Array<{ product: BillingProductRecord; activePricing: PricingVersionRecord }> = [];
      for (const product of products) {
        if (product.availabilityStatus !== 'ACTIVE') continue;
        const pricing = await this.repo.getPricingVersionInTx(tx, product.activePricingVersionId);
        if (pricing) {
          out.push({ product, activePricing: pricing });
        }
      }
      return out;
    });

    this.repo.setCachedPricingCatalog(items);
    return items;
  }

  public async createOrUpdateBillingProduct(
    adminPrincipal: AuthenticatedPrincipal,
    rawInput: unknown,
    existingProductId?: string,
  ): Promise<{ product: BillingProductRecord; pricingVersion: PricingVersionRecord }> {
    await this.assertAdminPrincipal(adminPrincipal);
    await this.ensureDefaultCatalogSeeded();
    const input = validateCreateOrUpdateProductInput(rawInput);
    const nowIso = new Date().toISOString();

    const result = await this.repo.runInTransaction('mb.upsertBillingProduct', async (tx) => {
      const productId =
        existingProductId ?? `prod_${input.code.toLowerCase()}_${crypto.randomBytes(3).toString('hex')}`;
      const existing = existingProductId ? await this.repo.getProductInTx(tx, existingProductId) : null;
      const nextVersionNum = existing ? existing.pricingVersionIds.length + 1 : 1;
      const pricingVersionId = `pv_${productId}_v${nextVersionNum}`;

      if (existing) {
        const prevPricing = await this.repo.getPricingVersionInTx(tx, existing.activePricingVersionId);
        if (prevPricing && !prevPricing.effectiveToIso) {
          prevPricing.effectiveToIso = input.effectiveFromIso;
          await this.repo.upsertPricingVersionInTx(tx, prevPricing);
        }
      }

      const pricingVersion: PricingVersionRecord = {
        pricingVersionId,
        productId,
        versionNumber: nextVersionNum,
        currency: input.currency,
        unitAmountMinor: input.unitAmountMinor,
        billingInterval: input.billingInterval,
        includedUsageUnits: input.includedUsageUnits,
        overageUnitAmountMinor: input.overageUnitAmountMinor,
        taxTreatment: input.taxTreatment,
        effectiveFromIso: input.effectiveFromIso,
        effectiveToIso: input.effectiveToIso,
        createdByUid: adminPrincipal.uid,
        createdAtIso: nowIso,
      };

      const product: BillingProductRecord = {
        productId,
        code: input.code,
        name: input.name,
        description: input.description,
        category: input.category,
        activePricingVersionId: pricingVersionId,
        currency: input.currency,
        billingInterval: input.billingInterval,
        availabilityStatus: input.availabilityStatus,
        eligibility: input.eligibility,
        entitlementPolicyId: input.entitlementPolicyId,
        pricingVersionIds: existing
          ? [...existing.pricingVersionIds, pricingVersionId]
          : [pricingVersionId],
        revision: (existing?.revision ?? 0) + 1,
        createdAtIso: existing?.createdAtIso ?? nowIso,
        updatedAtIso: nowIso,
      };

      await this.repo.upsertPricingVersionInTx(tx, pricingVersion);
      await this.repo.upsertProductInTx(tx, product);
      return { product, pricingVersion };
    });

    // Invalidate pricing cache immediately on product/price change
    this.repo.invalidatePricingCatalogCache();

    await this.emitAuditAndDomainEvent({
      actor: adminPrincipal,
      targetUid: adminPrincipal.uid,
      eventType: 'billing.entitlement.changed',
      action: existingProductId ? 'product.updated' : 'product.created',
      resourceId: result.product.productId,
      payload: {
        productId: result.product.productId,
        pricingVersionId: result.pricingVersion.pricingVersionId,
        unitAmountMinor: result.pricingVersion.unitAmountMinor,
        currency: result.pricingVersion.currency,
      },
    });

    return result;
  }

  // ==========================================================================
  // 11. DISCOUNTS, COUPONS & PROMOTIONS
  // ==========================================================================

  public async createCoupon(
    adminPrincipal: AuthenticatedPrincipal,
    rawInput: unknown,
  ): Promise<CouponDefinitionRecord> {
    await this.assertAdminPrincipal(adminPrincipal);
    await this.ensureDefaultCatalogSeeded();
    const input = validateCreateCouponInput(rawInput);
    const nowIso = new Date().toISOString();

    const coupon = await this.repo.runInTransaction('mb.createCoupon', async (tx) => {
      const existing = await this.repo.getCouponByCodeInTx(tx, input.code);
      if (existing) {
        throw new CoreApiError('CONFLICT', 409, `Coupon code ${input.code} already exists.`);
      }
      const record: CouponDefinitionRecord = {
        couponId: `cpn_${crypto.randomBytes(5).toString('hex')}`,
        code: input.code,
        name: input.name,
        discountType: input.discountType,
        discountValue: input.discountValue,
        currency: input.currency,
        maxRedemptions: input.maxRedemptions,
        currentRedemptionsCount: 0,
        perUserLimit: input.perUserLimit,
        minimumPurchaseMinor: input.minimumPurchaseMinor,
        eligibleAccountTypes: input.eligibleAccountTypes,
        allowedOrganizationIds: input.allowedOrganizationIds,
        restrictedProductIds: input.restrictedProductIds,
        stackable: input.stackable,
        status: 'ACTIVE',
        startsAtIso: input.startsAtIso,
        expiresAtIso: input.expiresAtIso,
        createdByUid: adminPrincipal.uid,
        revokedByUid: null,
        revokedAtIso: null,
        revision: 1,
        createdAtIso: nowIso,
        updatedAtIso: nowIso,
      };
      await this.repo.upsertCouponInTx(tx, record);
      return record;
    });

    await this.emitAuditAndDomainEvent({
      actor: adminPrincipal,
      targetUid: adminPrincipal.uid,
      eventType: 'billing.coupon.redeemed',
      action: 'coupon.created',
      resourceId: coupon.couponId,
      payload: { code: coupon.code, discountType: coupon.discountType, discountValue: coupon.discountValue },
    });

    return coupon;
  }

  public async revokeCoupon(
    adminPrincipal: AuthenticatedPrincipal,
    couponCode: string,
  ): Promise<CouponDefinitionRecord> {
    await this.assertAdminPrincipal(adminPrincipal);
    const nowIso = new Date().toISOString();
    const updated = await this.repo.runInTransaction('mb.revokeCoupon', async (tx) => {
      const coupon = await this.repo.getCouponByCodeInTx(tx, couponCode);
      if (!coupon) {
        throw new CoreApiError('NOT_FOUND', 404, `Coupon ${couponCode} not found.`);
      }
      coupon.status = 'REVOKED';
      coupon.revokedByUid = adminPrincipal.uid;
      coupon.revokedAtIso = nowIso;
      coupon.revision += 1;
      coupon.updatedAtIso = nowIso;
      await this.repo.upsertCouponInTx(tx, coupon);
      return coupon;
    });

    await this.emitAuditAndDomainEvent({
      actor: adminPrincipal,
      targetUid: adminPrincipal.uid,
      eventType: 'billing.coupon.redeemed',
      action: 'coupon.revoked',
      resourceId: updated.couponId,
      payload: { code: updated.code },
    });
    return updated;
  }

  private async validateAndRedeemCouponInTx(params: {
    tx: TransactionContextLike;
    couponCode: string;
    userUid: string;
    organizationId: string | null;
    accountType: BillingProductRecord['eligibility']['eligibleAccountTypes'][number];
    productId: string;
    subtotalMinor: number;
    currency: BillingCurrency;
    invoiceId: string;
    paymentIntentId: string;
    nowIso: string;
  }): Promise<{ discountMinor: number; redemption: CouponRedemptionRecord }> {
    const coupon = await this.repo.getCouponByCodeInTx(params.tx, params.couponCode);
    if (!coupon) {
      throw new CoreApiError('NOT_FOUND', 404, `Coupon code ${params.couponCode} not found.`);
    }
    if (coupon.status !== 'ACTIVE') {
      throw new CoreApiError('CONFLICT', 409, `Coupon ${coupon.code} is ${coupon.status}.`);
    }
    if (params.nowIso < coupon.startsAtIso || params.nowIso > coupon.expiresAtIso) {
      throw new CoreApiError('VALIDATION_FAILED', 400, `Coupon ${coupon.code} is outside its valid date window.`);
    }
    if (coupon.currentRedemptionsCount >= coupon.maxRedemptions) {
      throw new CoreApiError('CONFLICT', 409, `Coupon ${coupon.code} has reached its maximum redemption limit.`);
    }
    if (params.subtotalMinor < coupon.minimumPurchaseMinor) {
      throw new CoreApiError(
        'VALIDATION_FAILED',
        400,
        `Order subtotal (${params.subtotalMinor}) does not meet coupon minimum purchase (${coupon.minimumPurchaseMinor}).`,
      );
    }
    if (
      coupon.eligibleAccountTypes.length > 0 &&
      !coupon.eligibleAccountTypes.includes(params.accountType)
    ) {
      throw new CoreApiError('FORBIDDEN', 403, `Coupon ${coupon.code} is not eligible for account type ${params.accountType}.`);
    }
    if (
      coupon.allowedOrganizationIds.length > 0 &&
      (!params.organizationId || !coupon.allowedOrganizationIds.includes(params.organizationId))
    ) {
      throw new CoreApiError('FORBIDDEN', 403, `Coupon ${coupon.code} is restricted to specific organizations.`);
    }
    if (
      coupon.restrictedProductIds.length > 0 &&
      !coupon.restrictedProductIds.includes(params.productId)
    ) {
      throw new CoreApiError('VALIDATION_FAILED', 400, `Coupon ${coupon.code} is not applicable to product ${params.productId}.`);
    }

    const userRedemptions = await this.repo.listUserCouponRedemptionsInTx(
      params.tx,
      coupon.code,
      params.userUid,
    );
    if (userRedemptions.length >= coupon.perUserLimit) {
      throw new CoreApiError(
        'CONFLICT',
        409,
        `User has already reached the per-user redemption limit (${coupon.perUserLimit}) for coupon ${coupon.code}.`,
      );
    }

    const discountMinor = computeCouponDiscountMinor(coupon, params.subtotalMinor, params.currency);

    coupon.currentRedemptionsCount += 1;
    coupon.revision += 1;
    coupon.updatedAtIso = params.nowIso;
    await this.repo.upsertCouponInTx(params.tx, coupon);

    const redemption: CouponRedemptionRecord = {
      redemptionId: `red_${crypto.randomBytes(6).toString('hex')}`,
      couponId: coupon.couponId,
      couponCode: coupon.code,
      userUid: params.userUid,
      organizationId: params.organizationId,
      invoiceId: params.invoiceId,
      paymentIntentId: params.paymentIntentId,
      discountAppliedMinor: discountMinor,
      currency: params.currency,
      redeemedAtIso: params.nowIso,
    };
    await this.repo.recordCouponRedemptionInTx(params.tx, redemption);
    return { discountMinor, redemption };
  }

  // ==========================================================================
  // 3, 4, 5, 8. PAYMENT INTENT CREATION, INVOICING & LEDGER INTEGRATION
  // ==========================================================================

  public async createPaymentIntent(
    principal: AuthenticatedPrincipal,
    rawInput: unknown,
  ): Promise<{
    paymentIntent: PaymentIntentRecord;
    invoice: MarketplaceInvoiceRecord;
    replayed: boolean;
  }> {
    await this.ensureDefaultCatalogSeeded();
    const obj = assertPlainObject(rawInput, 'CreatePaymentIntentInput');
    rejectForbiddenClientFinancialFields(obj);

    if (Array.isArray(obj.couponCodes) && obj.couponCodes.length > 1) {
      throw new CoreApiError(
        'VALIDATION_FAILED',
        400,
        'Stacking multiple coupons on a single payment intent is not permitted by policy.',
      );
    }

    const idempotencyKey = sanitizeTextInput(String(obj.idempotencyKey ?? '')).slice(0, 120);
    if (idempotencyKey.length < 6) {
      throw new CoreApiError('IDEMPOTENCY_KEY_INVALID', 400, 'idempotencyKey (min 6 chars) is required for payment intent creation.');
    }

    const productId = sanitizeTextInput(String(obj.productId ?? ''));
    if (!productId) {
      throw new CoreApiError('VALIDATION_FAILED', 400, 'productId is required.');
    }
    const quantity = obj.quantity !== undefined ? assertSafePositiveInteger(obj.quantity, 'quantity', 10_000) : 1;
    const purposeType = (obj.purposeType ?? 'PRODUCT_PURCHASE') as PaymentPurposeType;
    if (!SUPPORTED_PAYMENT_PURPOSE_TYPES.has(purposeType)) {
      throw new CoreApiError('VALIDATION_FAILED', 400, `Unsupported purposeType: ${String(obj.purposeType)}`);
    }

    const organizationId =
      typeof obj.organizationId === 'string' && sanitizeTextInput(obj.organizationId)
        ? sanitizeTextInput(obj.organizationId)
        : null;
    const providerId =
      typeof obj.providerId === 'string' && sanitizeTextInput(obj.providerId)
        ? sanitizeTextInput(obj.providerId)
        : 'sandbox_gateway_ir';
    const couponCode =
      typeof obj.couponCode === 'string' && sanitizeTextInput(obj.couponCode)
        ? sanitizeTextInput(obj.couponCode).toUpperCase()
        : null;

    const providerAdapter = this.providerAdapters.get(providerId);
    if (!providerAdapter) {
      throw new CoreApiError('VALIDATION_FAILED', 400, `Unsupported payment provider: ${providerId}`);
    }

    // Check customer & organization eligibility via Employee 64 adapter
    const customerEligibility = await this.directoryAdapter.getCustomerBillingEligibility(
      principal.uid,
      organizationId,
    );
    if (!customerEligibility.exists || !customerEligibility.accountActive) {
      throw new CoreApiError('FORBIDDEN', 403, 'Customer account is not active for marketplace billing.');
    }
    if (organizationId && !customerEligibility.memberOfOrganization) {
      throw new CoreApiError('FORBIDDEN', 403, 'User is not an authorized member of the specified organization.');
    }

    // Optional authoritative commission reference check (Section 10)
    const transactionDealId =
      typeof obj.transactionDealId === 'string' && sanitizeTextInput(obj.transactionDealId)
        ? sanitizeTextInput(obj.transactionDealId)
        : null;
    const brokerageId =
      typeof obj.brokerageId === 'string' && sanitizeTextInput(obj.brokerageId)
        ? sanitizeTextInput(obj.brokerageId)
        : null;

    let authoritativeCommissionInfo: Awaited<
      ReturnType<BrokerageAndCommissionReferenceAdapter['getAuthoritativeCommissionRecord']>
    > | null = null;
    if (purposeType === 'COMMISSION_SERVICE_FEE') {
      if (!transactionDealId || !brokerageId) {
        throw new CoreApiError(
          'VALIDATION_FAILED',
          400,
          'COMMISSION_SERVICE_FEE requires transactionDealId and brokerageId.',
        );
      }
      authoritativeCommissionInfo = await this.commissionAdapter.getAuthoritativeCommissionRecord({
        transactionDealId,
        brokerageId,
      });
      if (!authoritativeCommissionInfo.exists) {
        throw new CoreApiError(
          'NOT_FOUND',
          404,
          `Authoritative commission record for deal ${transactionDealId} not found.`,
        );
      }
    }

    const nowIso = new Date().toISOString();

    const txResult = await this.repo.runInTransaction('mb.createPaymentIntent', async (tx) => {
      const existingIntent = await this.repo.getPaymentIntentByIdempotencyInTx(
        tx,
        principal.uid,
        idempotencyKey,
      );
      if (existingIntent) {
        const existingInvoice = await this.repo.getInvoiceInTx(tx, existingIntent.invoiceId);
        if (existingInvoice) {
          return {
            paymentIntent: existingIntent,
            invoice: existingInvoice,
            replayed: true,
          };
        }
      }

      const product = await this.repo.getProductInTx(tx, productId);
      if (!product || product.availabilityStatus !== 'ACTIVE') {
        throw new CoreApiError('NOT_FOUND', 404, `Active billing product ${productId} not found.`);
      }
      if (!product.eligibility.eligibleAccountTypes.includes(customerEligibility.accountType)) {
        throw new CoreApiError(
          'FORBIDDEN',
          403,
          `Account type ${customerEligibility.accountType} is not eligible for product ${product.code}.`,
        );
      }
      if (product.eligibility.requiresVerifiedIdentity && !customerEligibility.identityVerified) {
        throw new CoreApiError('FORBIDDEN', 403, 'Verified identity is required for this product.');
      }
      if (product.eligibility.requiresBrokerageLicense && !customerEligibility.brokerageLicenseVerified) {
        throw new CoreApiError('FORBIDDEN', 403, 'Verified brokerage license is required for this product.');
      }

      const requestedPricingVersionId =
        typeof obj.pricingVersionId === 'string' && sanitizeTextInput(obj.pricingVersionId)
          ? sanitizeTextInput(obj.pricingVersionId)
          : product.activePricingVersionId;

      const pricingVersion = await this.repo.getPricingVersionInTx(tx, requestedPricingVersionId);
      if (!pricingVersion || pricingVersion.productId !== product.productId) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid pricingVersionId for product.');
      }
      if (
        pricingVersion.effectiveFromIso > nowIso ||
        (pricingVersion.effectiveToIso && pricingVersion.effectiveToIso <= nowIso)
      ) {
        throw new CoreApiError('CONFLICT', 409, 'Selected pricing version is not effective at the current time.');
      }

      if (obj.currency !== undefined) {
        const clientCurr = validateCurrency(obj.currency);
        if (clientCurr !== pricingVersion.currency) {
          throw new CoreApiError(
            'VALIDATION_FAILED',
            400,
            `Currency mismatch: product requires ${pricingVersion.currency}, got ${clientCurr}.`,
          );
        }
      }

      const paymentIntentId = `pi_${crypto.randomBytes(6).toString('hex')}`;
      const invoiceId = `inv_${crypto.randomBytes(6).toString('hex')}`;
      const invoiceNumber = await this.repo.nextInvoiceSequenceNumberInTx(tx, 'INV');

      // Authoritative unit amount: from commission adapter if COMMISSION_SERVICE_FEE, else from pricingVersion
      const authoritativeUnitMinor =
        purposeType === 'COMMISSION_SERVICE_FEE' && authoritativeCommissionInfo
          ? authoritativeCommissionInfo.platformServiceFeeMinor
          : pricingVersion.unitAmountMinor;

      const rawSubtotalMinor = Number(BigInt(authoritativeUnitMinor) * BigInt(quantity));

      let discountMinor = 0;
      if (couponCode) {
        const redeemed = await this.validateAndRedeemCouponInTx({
          tx,
          couponCode,
          userUid: principal.uid,
          organizationId,
          accountType: customerEligibility.accountType,
          productId: product.productId,
          subtotalMinor: rawSubtotalMinor,
          currency: pricingVersion.currency,
          invoiceId,
          paymentIntentId,
          nowIso,
        });
        discountMinor = redeemed.discountMinor;
      }

      const lineItem = computeInvoiceLineItemArithmetic({
        lineItemId: `li_${crypto.randomBytes(4).toString('hex')}`,
        productId: product.productId,
        pricingVersionId: pricingVersion.pricingVersionId,
        description: `${product.name} (v${pricingVersion.versionNumber})`,
        quantity,
        unitAmountMinor: authoritativeUnitMinor,
        discountMinor,
        taxTreatment: pricingVersion.taxTreatment,
      });

      const dueDateIso = new Date(Date.now() + 24 * 3600_000).toISOString();
      const expiresAtIso = new Date(Date.now() + 30 * 60_000).toISOString();

      const invoice: MarketplaceInvoiceRecord = {
        invoiceId,
        invoiceNumber,
        customerUid: principal.uid,
        organizationId,
        subscriptionId:
          typeof obj.subscriptionId === 'string' ? sanitizeTextInput(obj.subscriptionId) : null,
        paymentIntentId,
        currency: pricingVersion.currency,
        lineItems: [lineItem],
        subtotalMinor: lineItem.subtotalMinor,
        discountMinor: lineItem.discountMinor,
        taxMinor: lineItem.taxMinor,
        totalMinor: lineItem.totalMinor,
        amountPaidMinor: 0,
        amountRefundedMinor: 0,
        appliedCouponCode: couponCode,
        taxTreatmentSummary: `${pricingVersion.taxTreatment.taxCode} (${pricingVersion.taxTreatment.rateBasisPoints} bps)`,
        status: 'ISSUED',
        invoiceDocumentId: null,
        creditNoteIds: [],
        refundIds: [],
        issuedAtIso: nowIso,
        dueDateIso,
        paidAtIso: null,
        voidedAtIso: null,
        cancellationReason: null,
        revision: 1,
        createdAtIso: nowIso,
        updatedAtIso: nowIso,
      };

      const paymentIntent: PaymentIntentRecord = {
        paymentIntentId,
        payerUid: principal.uid,
        organizationId,
        invoiceId,
        providerId,
        purpose: {
          purposeType,
          productId: product.productId,
          pricingVersionId: pricingVersion.pricingVersionId,
          quantity,
          listingId: typeof obj.listingId === 'string' ? sanitizeTextInput(obj.listingId) : null,
          subscriptionId: invoice.subscriptionId,
          transactionDealId,
          brokerageCommissionRefId: authoritativeCommissionInfo?.calculationId ?? null,
          usagePeriodKey:
            typeof obj.usagePeriodKey === 'string' ? sanitizeTextInput(obj.usagePeriodKey) : null,
        },
        currency: pricingVersion.currency,
        subtotalAmountMinor: lineItem.subtotalMinor,
        discountAmountMinor: lineItem.discountMinor,
        taxAmountMinor: lineItem.taxMinor,
        totalAmountMinor: lineItem.totalMinor,
        refundedAmountMinor: 0,
        appliedCouponCode: couponCode,
        status: 'CREATED',
        providerTransactionRef: null,
        providerCheckoutUrl: null,
        providerFeeMinor: 0,
        lastErrorCategory: 'NONE',
        lastErrorMessage: null,
        ledgerObligationPostId: null,
        ledgerRevenuePostId: null,
        refundIds: [],
        idempotencyKey,
        expiresAtIso,
        confirmedAtIso: null,
        failedAtIso: null,
        canceledAtIso: null,
        revision: 1,
        createdAtIso: nowIso,
        updatedAtIso: nowIso,
      };

      if (authoritativeCommissionInfo && transactionDealId && brokerageId) {
        const commRef: CommissionBillingReferenceRecord = {
          referenceId: `commref_${paymentIntentId}`,
          transactionDealId,
          brokerageId,
          agentUid: authoritativeCommissionInfo.agentUid,
          authoritativeCommissionCalculationId: authoritativeCommissionInfo.calculationId,
          authoritativeGrossCommissionMinor: authoritativeCommissionInfo.grossCommissionMinor,
          platformServiceChargeMinor: authoritativeCommissionInfo.platformServiceFeeMinor,
          currency: authoritativeCommissionInfo.currency,
          invoiceId,
          paymentIntentId,
          createdAtIso: nowIso,
        };
        await this.repo.upsertCommissionBillingReferenceInTx(tx, commRef);
      }

      await this.repo.upsertInvoiceInTx(tx, invoice);
      await this.repo.upsertPaymentIntentInTx(tx, paymentIntent);
      await this.repo.appendPaymentHistoryInTx(tx, paymentIntentId, {
        eventId: `phe_${crypto.randomBytes(5).toString('hex')}`,
        fromStatus: null,
        toStatus: 'CREATED',
        actorUid: principal.uid,
        reason: 'Payment intent and invoice created with server-derived authoritative pricing.',
        timestampIso: nowIso,
      });

      return { paymentIntent, invoice, replayed: false };
    });

    if (txResult.replayed) {
      return txResult;
    }

    // Post customer payment obligation to Employee 54 Ledger (idempotent) + generate Employee 63 invoice document
    const obligationEntry = await this.ledgerAdapter.postLedgerEntry({
      idempotencyKey: `ledger_obligation_${txResult.invoice.invoiceId}`,
      postingType: 'CUSTOMER_PAYMENT_OBLIGATION',
      accountOwnerUid: principal.uid,
      organizationId,
      sourceDomain: 'MARKETPLACE_BILLING',
      sourceRecordId: txResult.invoice.invoiceId,
      invoiceId: txResult.invoice.invoiceId,
      paymentIntentId: txResult.paymentIntent.paymentIntentId,
      refundId: null,
      reversesLedgerPostingId: null,
      currency: txResult.invoice.currency,
      amountMinor: txResult.invoice.totalMinor,
      debitAccountCode: 'ACCOUNTS_RECEIVABLE_CUSTOMER',
      creditAccountCode: 'UNEARNED_BILLING_REVENUE',
      description: `Invoice ${txResult.invoice.invoiceNumber} obligation`,
      metadata: {
        invoiceNumber: txResult.invoice.invoiceNumber,
        productId: txResult.paymentIntent.purpose.productId,
      },
    });

    const docArtifact = await this.documentAdapter.generateAndStoreFinancialDocument({
      ownerUid: principal.uid,
      organizationId,
      documentType: 'INVOICE_PDF_ARTIFACT',
      referenceNumber: txResult.invoice.invoiceNumber,
      payload: {
        invoiceId: txResult.invoice.invoiceId,
        invoiceNumber: txResult.invoice.invoiceNumber,
        lineItems: txResult.invoice.lineItems,
        totalMinor: txResult.invoice.totalMinor,
        currency: txResult.invoice.currency,
      },
    });

    // Initiate payment session with PaymentProviderAdapter
    const providerResponse = await providerAdapter.initiatePayment({
      paymentIntentId: txResult.paymentIntent.paymentIntentId,
      amountMinor: txResult.paymentIntent.totalAmountMinor,
      currency: txResult.paymentIntent.currency,
      idempotencyKey: `prov_init_${txResult.paymentIntent.paymentIntentId}`,
      callbackUrl: `https://tehranradar.ir/api/v1/billing/webhooks/${providerId}`,
    });

    const finalized = await this.repo.runInTransaction('mb.finalizeIntentInitiation', async (tx) => {
      const intent = await this.repo.getPaymentIntentInTx(tx, txResult.paymentIntent.paymentIntentId);
      const invoice = await this.repo.getInvoiceInTx(tx, txResult.invoice.invoiceId);
      if (!intent || !invoice) {
        throw new CoreApiError('INTERNAL_ERROR', 500, 'Payment intent missing after creation.');
      }

      invoice.invoiceDocumentId = docArtifact.documentId;
      intent.ledgerObligationPostId = obligationEntry.ledgerPostingId;

      const updatedNowIso = new Date().toISOString();
      if (providerResponse.ok && providerResponse.providerTransactionRef) {
        const prevStatus = intent.status;
        intent.status = 'INITIATED';
        intent.providerTransactionRef = providerResponse.providerTransactionRef;
        intent.providerCheckoutUrl = providerResponse.checkoutUrl ?? null;
        intent.providerFeeMinor = providerResponse.providerFeeMinor ?? 0;
        intent.revision += 1;
        intent.updatedAtIso = updatedNowIso;
        await this.repo.appendPaymentHistoryInTx(tx, intent.paymentIntentId, {
          eventId: `phe_${crypto.randomBytes(5).toString('hex')}`,
          fromStatus: prevStatus,
          toStatus: 'INITIATED',
          actorUid: principal.uid,
          providerEventRef: providerResponse.providerTransactionRef,
          reason: 'Provider checkout session initiated.',
          timestampIso: updatedNowIso,
        });
      } else {
        // Provider outage / initiation failure leaves intent in CREATED with recorded errorCategory
        // so it is never corrupted and can be safely retried or inspected.
        intent.lastErrorCategory = providerResponse.errorCategory ?? 'PROVIDER_UNAVAILABLE';
        intent.lastErrorMessage = providerResponse.errorMessage ?? 'Provider initiation failed.';
        intent.revision += 1;
        intent.updatedAtIso = updatedNowIso;
      }

      await this.repo.upsertInvoiceInTx(tx, invoice);
      await this.repo.upsertPaymentIntentInTx(tx, intent);
      return { paymentIntent: intent, invoice };
    });

    await this.emitAuditAndDomainEvent({
      actor: principal,
      targetUid: principal.uid,
      eventType: 'billing.payment.initiated',
      action: 'payment_intent.created',
      resourceId: finalized.paymentIntent.paymentIntentId,
      payload: {
        invoiceId: finalized.invoice.invoiceId,
        invoiceNumber: finalized.invoice.invoiceNumber,
        totalAmountMinor: finalized.paymentIntent.totalAmountMinor,
        currency: finalized.paymentIntent.currency,
        status: finalized.paymentIntent.status,
      },
    });

    return {
      ...finalized,
      replayed: false,
    };
  }

  // ==========================================================================
  // 4 & 5. WEBHOOK PROCESSING, SIGNATURE VERIFICATION, REPLAY PROTECTION & LEDGER POSTING
  // ==========================================================================

  public async processProviderWebhook(
    rawPayload: ProviderWebhookPayload,
  ): Promise<{
    paymentIntent: PaymentIntentRecord;
    invoice: MarketplaceInvoiceRecord;
    replayedWebhook: boolean;
  }> {
    await this.ensureDefaultCatalogSeeded();
    const providerAdapter = this.providerAdapters.get(rawPayload.providerId);
    if (!providerAdapter) {
      throw new CoreApiError('VALIDATION_FAILED', 400, `Unknown payment provider: ${rawPayload.providerId}`);
    }

    const { rawSignature, ...unsignedPayload } = rawPayload;
    const isSignatureValid = providerAdapter.verifyWebhookSignature(unsignedPayload, rawSignature);
    if (!isSignatureValid) {
      throw new CoreApiError(
        'FORBIDDEN',
        403,
        'Webhook signature verification failed. Callback rejected.',
      );
    }

    const nowIso = new Date().toISOString();

    const preCheck = await this.repo.runInTransaction('mb.webhookPreCheck', async (tx) => {
      const alreadyProcessed = await this.repo.hasProcessedWebhookEventInTx(
        tx,
        rawPayload.providerId,
        rawPayload.webhookEventId,
      );
      const intent = await this.repo.getPaymentIntentInTx(tx, rawPayload.paymentIntentId);
      if (!intent) {
        throw new CoreApiError('NOT_FOUND', 404, `PaymentIntent ${rawPayload.paymentIntentId} not found.`);
      }
      const invoice = await this.repo.getInvoiceInTx(tx, intent.invoiceId);
      if (!invoice) {
        throw new CoreApiError('NOT_FOUND', 404, `Invoice ${intent.invoiceId} not found.`);
      }
      if (alreadyProcessed || intent.status === 'SUCCEEDED') {
        return { replayed: true, intent, invoice };
      }

      if (intent.status === 'CANCELED' || intent.status === 'EXPIRED') {
        throw new CoreApiError(
          'CONFLICT',
          409,
          `Cannot confirm payment intent in terminal state ${intent.status}.`,
        );
      }

      // Amount & currency integrity check against tampering
      if (rawPayload.currency !== intent.currency) {
        throw new CoreApiError(
          'VALIDATION_FAILED',
          400,
          `Webhook currency (${rawPayload.currency}) does not match payment intent currency (${intent.currency}).`,
        );
      }
      if (rawPayload.eventStatus === 'SUCCEEDED' && rawPayload.paidAmountMinor !== intent.totalAmountMinor) {
        throw new CoreApiError(
          'VALIDATION_FAILED',
          400,
          `Webhook paidAmountMinor (${rawPayload.paidAmountMinor}) does not match authoritative totalAmountMinor (${intent.totalAmountMinor}).`,
        );
      }

      return { replayed: false, intent, invoice };
    });

    if (preCheck.replayed) {
      return {
        paymentIntent: preCheck.intent,
        invoice: preCheck.invoice,
        replayedWebhook: true,
      };
    }

    if (rawPayload.eventStatus === 'FAILED' || rawPayload.eventStatus === 'CANCELED') {
      const failedResult = await this.repo.runInTransaction('mb.webhookFailed', async (tx) => {
        const intent = (await this.repo.getPaymentIntentInTx(tx, rawPayload.paymentIntentId))!;
        const invoice = (await this.repo.getInvoiceInTx(tx, intent.invoiceId))!;
        await this.repo.markWebhookEventProcessedInTx(
          tx,
          rawPayload.providerId,
          rawPayload.webhookEventId,
          intent.paymentIntentId,
        );

        const prevStatus = intent.status;
        const nextStatus = rawPayload.eventStatus === 'CANCELED' ? 'CANCELED' : 'FAILED';
        intent.status = nextStatus;
        intent.providerTransactionRef = rawPayload.providerTransactionRef;
        intent.lastErrorCategory = rawPayload.failureCategory ?? 'PAYMENT_DECLINED';
        intent.lastErrorMessage = rawPayload.failureReason ?? 'Payment failed at provider.';
        if (nextStatus === 'FAILED') intent.failedAtIso = nowIso;
        if (nextStatus === 'CANCELED') intent.canceledAtIso = nowIso;
        intent.revision += 1;
        intent.updatedAtIso = nowIso;

        await this.repo.upsertPaymentIntentInTx(tx, intent);
        await this.repo.appendPaymentHistoryInTx(tx, intent.paymentIntentId, {
          eventId: `phe_${crypto.randomBytes(5).toString('hex')}`,
          fromStatus: prevStatus,
          toStatus: nextStatus,
          actorUid: 'system_webhook',
          providerEventRef: rawPayload.webhookEventId,
          reason: intent.lastErrorMessage,
          timestampIso: nowIso,
        });

        // If linked to a subscription renewal, trigger failed renewal / grace period handling
        if (intent.purpose.subscriptionId) {
          const sub = await this.repo.getSubscriptionInTx(tx, intent.purpose.subscriptionId);
          if (sub && (sub.status === 'ACTIVE' || sub.status === 'PENDING_INITIAL_PAYMENT')) {
            const prevSubStatus = sub.status;
            sub.status = 'PAST_DUE';
            sub.failedRenewalCount += 1;
            sub.gracePeriodEndsAtIso = new Date(Date.now() + 7 * 86_400_000).toISOString();
            sub.revision += 1;
            sub.updatedAtIso = nowIso;
            await this.repo.upsertSubscriptionInTx(tx, sub);
            await this.repo.appendSubscriptionHistoryInTx(tx, {
              historyId: `subh_${crypto.randomBytes(5).toString('hex')}`,
              subscriptionId: sub.subscriptionId,
              action: 'RENEWAL_FAILED',
              fromStatus: prevSubStatus,
              toStatus: 'PAST_DUE',
              actorUid: 'system_webhook',
              reason: `Payment intent ${intent.paymentIntentId} failed; grace period granted until ${sub.gracePeriodEndsAtIso}.`,
              timestampIso: nowIso,
            });
          }
        }

        return { paymentIntent: intent, invoice };
      });

      await this.notificationAdapter.sendCustomerBillingNotification({
        recipientUid: failedResult.paymentIntent.payerUid,
        eventType: 'PAYMENT_FAILED',
        title: 'عدم موفقیت پرداخت',
        body: `پرداخت فاکتور ${failedResult.invoice.invoiceNumber} ناموفق بود.`,
        referenceId: failedResult.paymentIntent.paymentIntentId,
        idempotencyKey: `notif_fail_${rawPayload.webhookEventId}`,
      });

      return { ...failedResult, replayedWebhook: false };
    }

    // SUCCEEDED path: post revenue, tax, and provider fee to Employee 54 ledger (idempotent)
    const intent = preCheck.intent;
    const invoice = preCheck.invoice;
    const netRevenueMinor = invoice.subtotalMinor - invoice.discountMinor;

    const revenuePosting = await this.ledgerAdapter.postLedgerEntry({
      idempotencyKey: `ledger_revenue_${intent.paymentIntentId}`,
      postingType:
        intent.purpose.purposeType === 'COMMISSION_SERVICE_FEE'
          ? 'COMMISSION_SETTLEMENT_REFERENCE'
          : 'PLATFORM_SERVICE_REVENUE',
      accountOwnerUid: intent.payerUid,
      organizationId: intent.organizationId,
      sourceDomain: 'MARKETPLACE_BILLING',
      sourceRecordId: intent.paymentIntentId,
      invoiceId: invoice.invoiceId,
      paymentIntentId: intent.paymentIntentId,
      refundId: null,
      reversesLedgerPostingId: null,
      currency: intent.currency,
      amountMinor: netRevenueMinor,
      debitAccountCode: 'CASH_CLEARING_PROVIDER',
      creditAccountCode: 'PLATFORM_EARNED_REVENUE',
      description: `Confirmed payment revenue for invoice ${invoice.invoiceNumber}`,
      metadata: {
        providerTransactionRef: rawPayload.providerTransactionRef,
        productId: intent.purpose.productId,
      },
    });

    if (invoice.taxMinor > 0) {
      await this.ledgerAdapter.postLedgerEntry({
        idempotencyKey: `ledger_tax_${intent.paymentIntentId}`,
        postingType: 'TAX_LIABILITY',
        accountOwnerUid: intent.payerUid,
        organizationId: intent.organizationId,
        sourceDomain: 'MARKETPLACE_BILLING',
        sourceRecordId: intent.paymentIntentId,
        invoiceId: invoice.invoiceId,
        paymentIntentId: intent.paymentIntentId,
        refundId: null,
        reversesLedgerPostingId: null,
        currency: intent.currency,
        amountMinor: invoice.taxMinor,
        debitAccountCode: 'CASH_CLEARING_PROVIDER',
        creditAccountCode: 'TAX_PAYABLE_VAT',
        description: `VAT tax liability for invoice ${invoice.invoiceNumber}`,
        metadata: { invoiceNumber: invoice.invoiceNumber },
      });
    }

    const feeMinor = rawPayload.providerFeeMinor ?? intent.providerFeeMinor;
    if (feeMinor > 0) {
      await this.ledgerAdapter.postLedgerEntry({
        idempotencyKey: `ledger_fee_${intent.paymentIntentId}`,
        postingType: 'PAYMENT_PROCESSING_FEE',
        accountOwnerUid: intent.payerUid,
        organizationId: intent.organizationId,
        sourceDomain: 'MARKETPLACE_BILLING',
        sourceRecordId: intent.paymentIntentId,
        invoiceId: invoice.invoiceId,
        paymentIntentId: intent.paymentIntentId,
        refundId: null,
        reversesLedgerPostingId: null,
        currency: intent.currency,
        amountMinor: feeMinor,
        debitAccountCode: 'PAYMENT_GATEWAY_FEE_EXPENSE',
        creditAccountCode: 'CASH_CLEARING_PROVIDER',
        description: `Gateway processing fee for ${rawPayload.providerTransactionRef}`,
        metadata: { providerId: rawPayload.providerId },
      });
    }

    const confirmedResult = await this.repo.runInTransaction('mb.confirmWebhookSuccess', async (tx) => {
      const currentIntent = (await this.repo.getPaymentIntentInTx(tx, intent.paymentIntentId))!;
      const currentInvoice = (await this.repo.getInvoiceInTx(tx, invoice.invoiceId))!;

      if (currentIntent.status === 'SUCCEEDED') {
        return { paymentIntent: currentIntent, invoice: currentInvoice, wasAlreadyConfirmed: true };
      }

      await this.repo.markWebhookEventProcessedInTx(
        tx,
        rawPayload.providerId,
        rawPayload.webhookEventId,
        currentIntent.paymentIntentId,
      );

      const prevStatus = currentIntent.status;
      currentIntent.status = 'SUCCEEDED';
      currentIntent.providerTransactionRef = rawPayload.providerTransactionRef;
      currentIntent.providerFeeMinor = feeMinor;
      currentIntent.ledgerRevenuePostId = revenuePosting.ledgerPostingId;
      currentIntent.confirmedAtIso = nowIso;
      currentIntent.revision += 1;
      currentIntent.updatedAtIso = nowIso;

      currentInvoice.status = 'PAID';
      currentInvoice.amountPaidMinor = currentIntent.totalAmountMinor;
      currentInvoice.paidAtIso = nowIso;
      currentInvoice.revision += 1;
      currentInvoice.updatedAtIso = nowIso;

      await this.repo.upsertPaymentIntentInTx(tx, currentIntent);
      await this.repo.upsertInvoiceInTx(tx, currentInvoice);
      await this.repo.appendPaymentHistoryInTx(tx, currentIntent.paymentIntentId, {
        eventId: `phe_${crypto.randomBytes(5).toString('hex')}`,
        fromStatus: prevStatus,
        toStatus: 'SUCCEEDED',
        actorUid: 'system_webhook',
        providerEventRef: rawPayload.webhookEventId,
        reason: `Confirmed via verified webhook ${rawPayload.webhookEventId}`,
        timestampIso: nowIso,
      });

      // Grant entitlement or activate/renew subscription if applicable
      const product = await this.repo.getProductInTx(tx, currentIntent.purpose.productId);
      if (currentIntent.purpose.subscriptionId) {
        const sub = await this.repo.getSubscriptionInTx(tx, currentIntent.purpose.subscriptionId);
        if (sub) {
          const prevSubStatus = sub.status;
          sub.status = 'ACTIVE';
          sub.gracePeriodEndsAtIso = null;
          sub.failedRenewalCount = 0;
          sub.currentPeriodStartIso = nowIso;
          sub.currentPeriodEndIso = this.computePeriodEndIso(nowIso, sub.billingInterval);
          sub.lastPaymentIntentId = currentIntent.paymentIntentId;
          sub.lastInvoiceId = currentInvoice.invoiceId;
          sub.revision += 1;
          sub.updatedAtIso = nowIso;
          await this.repo.upsertSubscriptionInTx(tx, sub);
          await this.repo.appendSubscriptionHistoryInTx(tx, {
            historyId: `subh_${crypto.randomBytes(5).toString('hex')}`,
            subscriptionId: sub.subscriptionId,
            action: prevSubStatus === 'PENDING_INITIAL_PAYMENT' ? 'ACTIVATED' : 'RENEWED',
            fromStatus: prevSubStatus,
            toStatus: 'ACTIVE',
            actorUid: 'system_webhook',
            reason: `Payment confirmed (${currentIntent.paymentIntentId}).`,
            timestampIso: nowIso,
          });

          const policy = await this.repo.getEntitlementPolicyInTx(tx, sub.entitlementPolicyId);
          if (policy) {
            const grant: EntitlementGrantRecord = {
              grantId: `grt_sub_${sub.subscriptionId}`,
              ownerUid: sub.subscriberUid,
              organizationId: sub.organizationId,
              sourceType: 'SUBSCRIPTION',
              sourceReferenceId: sub.subscriptionId,
              policyId: policy.policyId,
              policyVersion: policy.policyVersion,
              featureKeys: policy.featureKeys,
              maxActiveListings: policy.maxActiveListings,
              maxFeaturedListings: policy.maxFeaturedListings,
              maxBrokerageAgentSeats: policy.maxBrokerageAgentSeats,
              status: 'ACTIVE',
              grantedByUid: 'system_billing',
              grantReason: `Subscription ${sub.subscriptionId} active`,
              revokedByUid: null,
              revocationReason: null,
              effectiveFromIso: nowIso,
              expiresAtIso: sub.currentPeriodEndIso,
              revokedAtIso: null,
              createdAtIso: nowIso,
              updatedAtIso: nowIso,
            };
            await this.repo.upsertEntitlementGrantInTx(tx, grant);
          }
        }
      } else if (product?.entitlementPolicyId) {
        const policy = await this.repo.getEntitlementPolicyInTx(tx, product.entitlementPolicyId);
        if (policy) {
          const grant: EntitlementGrantRecord = {
            grantId: `grt_pi_${currentIntent.paymentIntentId}`,
            ownerUid: currentIntent.payerUid,
            organizationId: currentIntent.organizationId,
            sourceType: 'ONE_TIME_PURCHASE',
            sourceReferenceId: currentIntent.paymentIntentId,
            policyId: policy.policyId,
            policyVersion: policy.policyVersion,
            featureKeys: policy.featureKeys,
            maxActiveListings: policy.maxActiveListings * currentIntent.purpose.quantity,
            maxFeaturedListings: policy.maxFeaturedListings * currentIntent.purpose.quantity,
            maxBrokerageAgentSeats: policy.maxBrokerageAgentSeats,
            status: 'ACTIVE',
            grantedByUid: 'system_billing',
            grantReason: `One-time purchase ${product.code}`,
            revokedByUid: null,
            revocationReason: null,
            effectiveFromIso: nowIso,
            expiresAtIso: new Date(Date.now() + 30 * 86_400_000).toISOString(),
            revokedAtIso: null,
            createdAtIso: nowIso,
            updatedAtIso: nowIso,
          };
          await this.repo.upsertEntitlementGrantInTx(tx, grant);
        }
      }

      return { paymentIntent: currentIntent, invoice: currentInvoice, wasAlreadyConfirmed: false };
    });

    if (!confirmedResult.wasAlreadyConfirmed) {
      await this.notificationAdapter.sendCustomerBillingNotification({
        recipientUid: confirmedResult.paymentIntent.payerUid,
        eventType: 'PAYMENT_SUCCEEDED',
        title: 'پرداخت موفق و صدور فاکتور',
        body: `پرداخت فاکتور ${confirmedResult.invoice.invoiceNumber} با موفقیت تایید شد.`,
        referenceId: confirmedResult.paymentIntent.paymentIntentId,
        idempotencyKey: `notif_succ_${rawPayload.webhookEventId}`,
      });
    }

    return {
      paymentIntent: confirmedResult.paymentIntent,
      invoice: confirmedResult.invoice,
      replayedWebhook: confirmedResult.wasAlreadyConfirmed,
    };
  }

  public async getPaymentIntentStatus(
    principal: AuthenticatedPrincipal,
    paymentIntentId: string,
  ): Promise<{ paymentIntent: PaymentIntentRecord; history: PaymentHistoryEntry[] }> {
    await this.ensureDefaultCatalogSeeded();
    return this.repo.runInTransaction('mb.getPaymentIntentStatus', async (tx) => {
      const intent = await this.repo.getPaymentIntentInTx(tx, paymentIntentId);
      if (!intent) {
        throw new CoreApiError('NOT_FOUND', 404, `PaymentIntent ${paymentIntentId} not found.`);
      }
      this.assertOwnershipOrAdmin(principal, intent.payerUid);
      const history = await this.repo.listPaymentHistoryInTx(tx, paymentIntentId);
      return { paymentIntent: intent, history };
    });
  }

  // ==========================================================================
  // 6 & 7. SUBSCRIPTION LIFECYCLE & CENTRALIZED ENTITLEMENT SERVICE
  // ==========================================================================

  public async createSubscription(
    principal: AuthenticatedPrincipal,
    rawInput: unknown,
  ): Promise<{
    subscription: MarketplaceSubscriptionRecord;
    paymentIntent: PaymentIntentRecord;
    invoice: MarketplaceInvoiceRecord;
  }> {
    await this.ensureDefaultCatalogSeeded();
    const obj = assertPlainObject(rawInput, 'CreateSubscriptionInput');
    rejectForbiddenClientFinancialFields(obj);

    const productId = sanitizeTextInput(String(obj.productId ?? ''));
    const idempotencyKey = sanitizeTextInput(
      String(obj.idempotencyKey ?? `sub_create_${principal.uid}_${productId}_${Date.now()}`),
    );
    const organizationId =
      typeof obj.organizationId === 'string' && sanitizeTextInput(obj.organizationId)
        ? sanitizeTextInput(obj.organizationId)
        : null;

    const eligibility = await this.directoryAdapter.getCustomerBillingEligibility(
      principal.uid,
      organizationId,
    );
    if (!eligibility.exists || !eligibility.accountActive) {
      throw new CoreApiError('FORBIDDEN', 403, 'Account is not active for subscriptions.');
    }

    const nowIso = new Date().toISOString();
    const subscription = await this.repo.runInTransaction('mb.createSubscriptionDraft', async (tx) => {
      const product = await this.repo.getProductInTx(tx, productId);
      if (!product || product.availabilityStatus !== 'ACTIVE') {
        throw new CoreApiError('NOT_FOUND', 404, `Subscription product ${productId} not found.`);
      }
      if (
        product.billingInterval !== 'MONTHLY' &&
        product.billingInterval !== 'QUARTERLY' &&
        product.billingInterval !== 'ANNUAL'
      ) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'Selected product is not a recurring subscription plan.');
      }
      if (!product.entitlementPolicyId) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'Subscription product must reference an entitlementPolicyId.');
      }

      const subId = `sub_${crypto.randomBytes(6).toString('hex')}`;
      const record: MarketplaceSubscriptionRecord = {
        subscriptionId: subId,
        subscriberUid: principal.uid,
        organizationId,
        accountType: eligibility.accountType,
        productId: product.productId,
        pricingVersionId: product.activePricingVersionId,
        entitlementPolicyId: product.entitlementPolicyId,
        status: 'PENDING_INITIAL_PAYMENT',
        billingInterval: product.billingInterval,
        currentPeriodStartIso: nowIso,
        currentPeriodEndIso: this.computePeriodEndIso(nowIso, product.billingInterval),
        gracePeriodEndsAtIso: null,
        cancelAtPeriodEnd: false,
        pausedAtIso: null,
        canceledAtIso: null,
        expiredAtIso: null,
        failedRenewalCount: 0,
        lastPaymentIntentId: null,
        lastInvoiceId: null,
        revision: 1,
        createdAtIso: nowIso,
        updatedAtIso: nowIso,
      };
      await this.repo.upsertSubscriptionInTx(tx, record);
      await this.repo.appendSubscriptionHistoryInTx(tx, {
        historyId: `subh_${crypto.randomBytes(5).toString('hex')}`,
        subscriptionId: subId,
        action: 'CREATED',
        fromStatus: null,
        toStatus: 'PENDING_INITIAL_PAYMENT',
        toProductId: product.productId,
        actorUid: principal.uid,
        reason: 'Subscription created awaiting initial payment confirmation.',
        timestampIso: nowIso,
      });
      return record;
    });

    const paymentResult = await this.createPaymentIntent(principal, {
      productId: subscription.productId,
      purposeType: 'SUBSCRIPTION_INITIAL',
      subscriptionId: subscription.subscriptionId,
      organizationId,
      idempotencyKey,
      couponCode: obj.couponCode,
    });

    const updatedSub = await this.repo.runInTransaction('mb.linkSubscriptionPaymentIntent', async (tx) => {
      const sub = (await this.repo.getSubscriptionInTx(tx, subscription.subscriptionId))!;
      sub.lastPaymentIntentId = paymentResult.paymentIntent.paymentIntentId;
      sub.lastInvoiceId = paymentResult.invoice.invoiceId;
      await this.repo.upsertSubscriptionInTx(tx, sub);
      return sub;
    });

    return {
      subscription: updatedSub,
      paymentIntent: paymentResult.paymentIntent,
      invoice: paymentResult.invoice,
    };
  }

  public async changeSubscriptionPlan(
    principal: AuthenticatedPrincipal,
    subscriptionId: string,
    rawInput: unknown,
  ): Promise<{
    subscription: MarketplaceSubscriptionRecord;
    action: 'UPGRADED' | 'DOWNGRADED';
  }> {
    await this.ensureDefaultCatalogSeeded();
    const obj = assertPlainObject(rawInput, 'ChangeSubscriptionPlanInput');
    const targetProductId = sanitizeTextInput(String(obj.targetProductId ?? ''));
    if (!targetProductId) {
      throw new CoreApiError('VALIDATION_FAILED', 400, 'targetProductId is required.');
    }

    const nowIso = new Date().toISOString();
    return this.repo.runInTransaction('mb.changeSubscriptionPlan', async (tx) => {
      const sub = await this.repo.getSubscriptionInTx(tx, subscriptionId);
      if (!sub) {
        throw new CoreApiError('NOT_FOUND', 404, `Subscription ${subscriptionId} not found.`);
      }
      this.assertOwnershipOrAdmin(principal, sub.subscriberUid);
      if (sub.status !== 'ACTIVE' && sub.status !== 'PAST_DUE') {
        throw new CoreApiError('CONFLICT', 409, `Cannot change plan for subscription in status ${sub.status}.`);
      }

      const currentPricing = await this.repo.getPricingVersionInTx(tx, sub.pricingVersionId);
      const targetProduct = await this.repo.getProductInTx(tx, targetProductId);
      if (!targetProduct || targetProduct.availabilityStatus !== 'ACTIVE' || !targetProduct.entitlementPolicyId) {
        throw new CoreApiError('NOT_FOUND', 404, `Target subscription plan ${targetProductId} not found.`);
      }
      const targetPricing = await this.repo.getPricingVersionInTx(tx, targetProduct.activePricingVersionId);
      if (!targetPricing) {
        throw new CoreApiError('NOT_FOUND', 404, 'Target plan pricing version missing.');
      }

      const action: 'UPGRADED' | 'DOWNGRADED' =
        targetPricing.unitAmountMinor >= (currentPricing?.unitAmountMinor ?? 0)
          ? 'UPGRADED'
          : 'DOWNGRADED';

      const prevProductId = sub.productId;
      sub.productId = targetProduct.productId;
      sub.pricingVersionId = targetPricing.pricingVersionId;
      sub.entitlementPolicyId = targetProduct.entitlementPolicyId;
      sub.billingInterval = targetProduct.billingInterval;
      sub.revision += 1;
      sub.updatedAtIso = nowIso;
      await this.repo.upsertSubscriptionInTx(tx, sub);

      await this.repo.appendSubscriptionHistoryInTx(tx, {
        historyId: `subh_${crypto.randomBytes(5).toString('hex')}`,
        subscriptionId: sub.subscriptionId,
        action,
        fromStatus: sub.status,
        toStatus: sub.status,
        fromProductId: prevProductId,
        toProductId: targetProduct.productId,
        actorUid: principal.uid,
        reason: `Plan ${action.toLowerCase()} from ${prevProductId} to ${targetProduct.productId}`,
        timestampIso: nowIso,
      });

      // Synchronize active subscription entitlement grant to new policy
      const newPolicy = await this.repo.getEntitlementPolicyInTx(tx, targetProduct.entitlementPolicyId);
      if (newPolicy && sub.status === 'ACTIVE') {
        const grant: EntitlementGrantRecord = {
          grantId: `grt_sub_${sub.subscriptionId}`,
          ownerUid: sub.subscriberUid,
          organizationId: sub.organizationId,
          sourceType: 'SUBSCRIPTION',
          sourceReferenceId: sub.subscriptionId,
          policyId: newPolicy.policyId,
          policyVersion: newPolicy.policyVersion,
          featureKeys: newPolicy.featureKeys,
          maxActiveListings: newPolicy.maxActiveListings,
          maxFeaturedListings: newPolicy.maxFeaturedListings,
          maxBrokerageAgentSeats: newPolicy.maxBrokerageAgentSeats,
          status: 'ACTIVE',
          grantedByUid: principal.uid,
          grantReason: `Subscription ${action.toLowerCase()} to ${targetProduct.code}`,
          revokedByUid: null,
          revocationReason: null,
          effectiveFromIso: nowIso,
          expiresAtIso: sub.currentPeriodEndIso,
          revokedAtIso: null,
          createdAtIso: nowIso,
          updatedAtIso: nowIso,
        };
        await this.repo.upsertEntitlementGrantInTx(tx, grant);
      }

      return { subscription: sub, action };
    });
  }

  public async pauseOrResumeSubscription(
    principal: AuthenticatedPrincipal,
    subscriptionId: string,
    operation: 'PAUSE' | 'RESUME',
  ): Promise<MarketplaceSubscriptionRecord> {
    await this.ensureDefaultCatalogSeeded();
    const nowIso = new Date().toISOString();
    return this.repo.runInTransaction(`mb.${operation.toLowerCase()}Subscription`, async (tx) => {
      const sub = await this.repo.getSubscriptionInTx(tx, subscriptionId);
      if (!sub) {
        throw new CoreApiError('NOT_FOUND', 404, `Subscription ${subscriptionId} not found.`);
      }
      this.assertOwnershipOrAdmin(principal, sub.subscriberUid);

      if (operation === 'PAUSE') {
        if (sub.status !== 'ACTIVE') {
          throw new CoreApiError('CONFLICT', 409, 'Only ACTIVE subscriptions can be paused.');
        }
        sub.status = 'PAUSED';
        sub.pausedAtIso = nowIso;
        sub.revision += 1;
        sub.updatedAtIso = nowIso;
        await this.repo.upsertSubscriptionInTx(tx, sub);
        await this.repo.appendSubscriptionHistoryInTx(tx, {
          historyId: `subh_${crypto.randomBytes(5).toString('hex')}`,
          subscriptionId: sub.subscriptionId,
          action: 'PAUSED',
          fromStatus: 'ACTIVE',
          toStatus: 'PAUSED',
          actorUid: principal.uid,
          reason: 'Subscription paused by subscriber.',
          timestampIso: nowIso,
        });

        const grants = await this.repo.listEntitlementGrantsBySourceInTx(tx, sub.subscriptionId);
        for (const g of grants) {
          g.status = 'REVOKED';
          g.revocationReason = 'Subscription paused';
          g.revokedAtIso = nowIso;
          g.updatedAtIso = nowIso;
          await this.repo.upsertEntitlementGrantInTx(tx, g);
        }
      } else {
        if (sub.status !== 'PAUSED') {
          throw new CoreApiError('CONFLICT', 409, 'Only PAUSED subscriptions can be resumed.');
        }
        sub.status = 'ACTIVE';
        sub.pausedAtIso = null;
        sub.revision += 1;
        sub.updatedAtIso = nowIso;
        await this.repo.upsertSubscriptionInTx(tx, sub);
        await this.repo.appendSubscriptionHistoryInTx(tx, {
          historyId: `subh_${crypto.randomBytes(5).toString('hex')}`,
          subscriptionId: sub.subscriptionId,
          action: 'RESUMED',
          fromStatus: 'PAUSED',
          toStatus: 'ACTIVE',
          actorUid: principal.uid,
          reason: 'Subscription resumed by subscriber.',
          timestampIso: nowIso,
        });

        const policy = await this.repo.getEntitlementPolicyInTx(tx, sub.entitlementPolicyId);
        if (policy) {
          const grant: EntitlementGrantRecord = {
            grantId: `grt_sub_${sub.subscriptionId}`,
            ownerUid: sub.subscriberUid,
            organizationId: sub.organizationId,
            sourceType: 'SUBSCRIPTION',
            sourceReferenceId: sub.subscriptionId,
            policyId: policy.policyId,
            policyVersion: policy.policyVersion,
            featureKeys: policy.featureKeys,
            maxActiveListings: policy.maxActiveListings,
            maxFeaturedListings: policy.maxFeaturedListings,
            maxBrokerageAgentSeats: policy.maxBrokerageAgentSeats,
            status: 'ACTIVE',
            grantedByUid: principal.uid,
            grantReason: 'Subscription resumed',
            revokedByUid: null,
            revocationReason: null,
            effectiveFromIso: nowIso,
            expiresAtIso: sub.currentPeriodEndIso,
            revokedAtIso: null,
            createdAtIso: nowIso,
            updatedAtIso: nowIso,
          };
          await this.repo.upsertEntitlementGrantInTx(tx, grant);
        }
      }

      return sub;
    });
  }

  public async cancelSubscription(
    principal: AuthenticatedPrincipal,
    subscriptionId: string,
    rawInput: unknown,
  ): Promise<MarketplaceSubscriptionRecord> {
    await this.ensureDefaultCatalogSeeded();
    const obj = assertPlainObject(rawInput ?? {}, 'CancelSubscriptionInput');
    const immediate = Boolean(obj.immediate);
    const reason = sanitizeTextInput(String(obj.reason ?? 'Customer requested cancellation.')).slice(0, 300);
    const nowIso = new Date().toISOString();

    return this.repo.runInTransaction('mb.cancelSubscription', async (tx) => {
      const sub = await this.repo.getSubscriptionInTx(tx, subscriptionId);
      if (!sub) {
        throw new CoreApiError('NOT_FOUND', 404, `Subscription ${subscriptionId} not found.`);
      }
      this.assertOwnershipOrAdmin(principal, sub.subscriberUid);
      if (sub.status === 'CANCELED' || sub.status === 'EXPIRED') {
        return sub;
      }

      const prevStatus = sub.status;
      if (immediate || sub.status === 'PENDING_INITIAL_PAYMENT') {
        sub.status = 'CANCELED';
        sub.canceledAtIso = nowIso;
        const grants = await this.repo.listEntitlementGrantsBySourceInTx(tx, sub.subscriptionId);
        for (const g of grants) {
          g.status = 'REVOKED';
          g.revokedByUid = principal.uid;
          g.revocationReason = reason;
          g.revokedAtIso = nowIso;
          g.updatedAtIso = nowIso;
          await this.repo.upsertEntitlementGrantInTx(tx, g);
        }
      } else {
        sub.cancelAtPeriodEnd = true;
        sub.canceledAtIso = nowIso;
      }
      sub.revision += 1;
      sub.updatedAtIso = nowIso;
      await this.repo.upsertSubscriptionInTx(tx, sub);

      await this.repo.appendSubscriptionHistoryInTx(tx, {
        historyId: `subh_${crypto.randomBytes(5).toString('hex')}`,
        subscriptionId: sub.subscriptionId,
        action: 'CANCELED',
        fromStatus: prevStatus,
        toStatus: sub.status,
        actorUid: principal.uid,
        reason,
        timestampIso: nowIso,
      });

      return sub;
    });
  }

  public async listUserSubscriptions(
    principal: AuthenticatedPrincipal,
    targetUid = principal.uid,
  ): Promise<Array<{ subscription: MarketplaceSubscriptionRecord; history: SubscriptionHistoryEntryRecord[] }>> {
    this.assertOwnershipOrAdmin(principal, targetUid);
    return this.repo.runInTransaction('mb.listUserSubscriptions', async (tx) => {
      const subs = await this.repo.listUserSubscriptionsInTx(tx, targetUid);
      const out: Array<{ subscription: MarketplaceSubscriptionRecord; history: SubscriptionHistoryEntryRecord[] }> = [];
      for (const s of subs) {
        const history = await this.repo.listSubscriptionHistoryInTx(tx, s.subscriptionId);
        out.push({ subscription: s, history });
      }
      return out;
    });
  }

  /**
   * Centralized server-side entitlement access evaluation (Section 7).
   */
  public async evaluateEntitlementAccess(params: {
    ownerUid: string;
    organizationId?: string | null;
    featureKey: BillableFeatureKey;
    nowIso?: string;
  }): Promise<EntitlementAccessDecision> {
    await this.ensureDefaultCatalogSeeded();
    if (!SUPPORTED_FEATURE_KEYS.has(params.featureKey)) {
      throw new CoreApiError('VALIDATION_FAILED', 400, `Unsupported featureKey: ${params.featureKey}`);
    }
    const nowIso = params.nowIso ?? new Date().toISOString();

    return this.repo.runInTransaction('mb.evaluateEntitlementAccess', async (tx) => {
      const allGrants = await this.repo.listEntitlementGrantsForSubjectInTx(
        tx,
        params.ownerUid,
        params.organizationId,
      );

      const activeMatchingGrants: EntitlementGrantRecord[] = [];
      for (const grant of allGrants) {
        if (grant.status !== 'ACTIVE') continue;
        if (grant.effectiveFromIso > nowIso) continue;
        if (grant.expiresAtIso && grant.expiresAtIso <= nowIso) {
          grant.status = 'EXPIRED';
          grant.updatedAtIso = nowIso;
          await this.repo.upsertEntitlementGrantInTx(tx, grant);
          continue;
        }
        if (grant.featureKeys.includes(params.featureKey)) {
          activeMatchingGrants.push(grant);
        }
      }

      if (activeMatchingGrants.length === 0) {
        return {
          allowed: false,
          featureKey: params.featureKey,
          ownerUid: params.ownerUid,
          organizationId: params.organizationId ?? null,
          effectiveGrantIds: [],
          policyVersion: 1,
          aggregatedMaxActiveListings: 0,
          aggregatedMaxFeaturedListings: 0,
          aggregatedMaxBrokerageAgentSeats: 0,
          expiresAtIso: null,
          denialReason: `No active entitlement grant found for feature ${params.featureKey}.`,
        };
      }

      let maxActiveListings = 0;
      let maxFeaturedListings = 0;
      let maxBrokerageAgentSeats = 0;
      let latestExpiresAtIso: string | null = null;
      let highestPolicyVersion = 1;

      for (const g of activeMatchingGrants) {
        maxActiveListings += g.maxActiveListings;
        maxFeaturedListings += g.maxFeaturedListings;
        maxBrokerageAgentSeats = Math.max(maxBrokerageAgentSeats, g.maxBrokerageAgentSeats);
        highestPolicyVersion = Math.max(highestPolicyVersion, g.policyVersion);
        if (g.expiresAtIso && (!latestExpiresAtIso || g.expiresAtIso > latestExpiresAtIso)) {
          latestExpiresAtIso = g.expiresAtIso;
        }
      }

      return {
        allowed: true,
        featureKey: params.featureKey,
        ownerUid: params.ownerUid,
        organizationId: params.organizationId ?? null,
        effectiveGrantIds: activeMatchingGrants.map((g) => g.grantId),
        policyVersion: highestPolicyVersion,
        aggregatedMaxActiveListings: maxActiveListings,
        aggregatedMaxFeaturedListings: maxFeaturedListings,
        aggregatedMaxBrokerageAgentSeats: maxBrokerageAgentSeats,
        expiresAtIso: latestExpiresAtIso,
      };
    });
  }

  public async grantAdministrativeEntitlement(
    adminPrincipal: AuthenticatedPrincipal,
    rawInput: unknown,
  ): Promise<EntitlementGrantRecord> {
    await this.assertAdminPrincipal(adminPrincipal);
    await this.ensureDefaultCatalogSeeded();
    const obj = assertPlainObject(rawInput, 'AdminEntitlementGrantInput');
    const targetUid = sanitizeTextInput(String(obj.targetUid ?? ''));
    const policyId = sanitizeTextInput(String(obj.policyId ?? ''));
    const reason = sanitizeTextInput(String(obj.reason ?? '')).slice(0, 300);
    if (!targetUid || !policyId || reason.length < 5) {
      throw new CoreApiError('VALIDATION_FAILED', 400, 'targetUid, policyId, and reason (min 5 chars) are required.');
    }

    const durationDays = obj.durationDays !== undefined ? assertSafePositiveInteger(obj.durationDays, 'durationDays', 3650) : 30;
    const nowIso = new Date().toISOString();
    const expiresAtIso = new Date(Date.now() + durationDays * 86_400_000).toISOString();

    const grant = await this.repo.runInTransaction('mb.adminGrantEntitlement', async (tx) => {
      const policy = await this.repo.getEntitlementPolicyInTx(tx, policyId);
      if (!policy) {
        throw new CoreApiError('NOT_FOUND', 404, `EntitlementPolicy ${policyId} not found.`);
      }
      const record: EntitlementGrantRecord = {
        grantId: `grt_adm_${crypto.randomBytes(6).toString('hex')}`,
        ownerUid: targetUid,
        organizationId: typeof obj.organizationId === 'string' ? sanitizeTextInput(obj.organizationId) : null,
        sourceType: obj.isTemporaryPromotion ? 'TEMPORARY_PROMOTION' : 'ADMINISTRATIVE_GRANT',
        sourceReferenceId: `adm_override_${adminPrincipal.uid}`,
        policyId: policy.policyId,
        policyVersion: policy.policyVersion,
        featureKeys: policy.featureKeys,
        maxActiveListings: policy.maxActiveListings,
        maxFeaturedListings: policy.maxFeaturedListings,
        maxBrokerageAgentSeats: policy.maxBrokerageAgentSeats,
        status: 'ACTIVE',
        grantedByUid: adminPrincipal.uid,
        grantReason: reason,
        revokedByUid: null,
        revocationReason: null,
        effectiveFromIso: nowIso,
        expiresAtIso,
        revokedAtIso: null,
        createdAtIso: nowIso,
        updatedAtIso: nowIso,
      };
      await this.repo.upsertEntitlementGrantInTx(tx, record);
      return record;
    });

    await this.emitAuditAndDomainEvent({
      actor: adminPrincipal,
      targetUid,
      eventType: 'billing.entitlement.changed',
      action: 'entitlement.admin_granted',
      resourceId: grant.grantId,
      payload: { policyId, reason, expiresAtIso },
    });

    return grant;
  }

  public async revokeEntitlementGrant(
    adminPrincipal: AuthenticatedPrincipal,
    grantId: string,
    reason: string,
  ): Promise<EntitlementGrantRecord> {
    await this.assertAdminPrincipal(adminPrincipal);
    const cleanReason = sanitizeTextInput(reason || 'Administrative revocation');
    const nowIso = new Date().toISOString();

    const grant = await this.repo.runInTransaction('mb.revokeEntitlementGrant', async (tx) => {
      const existing = await this.repo.getEntitlementGrantInTx(tx, grantId);
      if (!existing) {
        throw new CoreApiError('NOT_FOUND', 404, `EntitlementGrant ${grantId} not found.`);
      }
      existing.status = 'REVOKED';
      existing.revokedByUid = adminPrincipal.uid;
      existing.revocationReason = cleanReason;
      existing.revokedAtIso = nowIso;
      existing.updatedAtIso = nowIso;
      await this.repo.upsertEntitlementGrantInTx(tx, existing);
      return existing;
    });

    await this.emitAuditAndDomainEvent({
      actor: adminPrincipal,
      targetUid: grant.ownerUid,
      eventType: 'billing.entitlement.changed',
      action: 'entitlement.revoked',
      resourceId: grant.grantId,
      payload: { reason: cleanReason },
    });

    return grant;
  }

  // ==========================================================================
  // 8 & 9. INVOICES, CREDIT NOTES & CONTROLLED REFUND WORKFLOWS
  // ==========================================================================

  public async listCustomerInvoices(
    principal: AuthenticatedPrincipal,
    customerUid = principal.uid,
  ): Promise<Array<{ invoice: MarketplaceInvoiceRecord; creditNotes: CreditNoteRecord[] }>> {
    this.assertOwnershipOrAdmin(principal, customerUid);
    return this.repo.runInTransaction('mb.listCustomerInvoices', async (tx) => {
      const invoices = await this.repo.listCustomerInvoicesInTx(tx, customerUid);
      const out: Array<{ invoice: MarketplaceInvoiceRecord; creditNotes: CreditNoteRecord[] }> = [];
      for (const inv of invoices) {
        const creditNotes = await this.repo.listCreditNotesForInvoiceInTx(tx, inv.invoiceId);
        out.push({ invoice: inv, creditNotes });
      }
      return out;
    });
  }

  public async getInvoiceDocument(
    principal: AuthenticatedPrincipal,
    invoiceId: string,
  ): Promise<{
    invoice: MarketplaceInvoiceRecord;
    document: { documentId: string; referenceNumber?: string; downloadPath?: string };
  }> {
    const isAdmin =
      principal.role === 'primary_admin' ||
      principal.role === 'delegated_admin' ||
      principal.role === 'server_secret_admin';
    const invoice = await this.repo.runInTransaction('mb.getInvoice', async (tx) => {
      const inv = await this.repo.getInvoiceInTx(tx, invoiceId);
      if (!inv) {
        throw new CoreApiError('NOT_FOUND', 404, `Invoice ${invoiceId} not found.`);
      }
      this.assertOwnershipOrAdmin(principal, inv.customerUid, isAdmin);
      return inv;
    });

    if (!invoice.invoiceDocumentId) {
      throw new CoreApiError('NOT_FOUND', 404, 'Invoice document artifact has not been generated.');
    }
    const meta = await this.documentAdapter.getFinancialDocumentMetadata(
      invoice.invoiceDocumentId,
      principal.uid,
      isAdmin,
    );
    if (!meta.exists || !meta.accessible) {
      throw new CoreApiError('FORBIDDEN', 403, 'Access denied to invoice document artifact.');
    }
    return {
      invoice,
      document: {
        documentId: meta.documentId,
        referenceNumber: meta.referenceNumber,
        downloadPath: meta.downloadPath,
      },
    };
  }

  public async requestRefund(
    principal: AuthenticatedPrincipal,
    rawInput: unknown,
  ): Promise<{ refund: RefundRequestRecord; creditNote: CreditNoteRecord | null; replayed: boolean }> {
    await this.ensureDefaultCatalogSeeded();
    const obj = assertPlainObject(rawInput, 'RequestRefundInput');
    const paymentIntentId = sanitizeTextInput(String(obj.paymentIntentId ?? ''));
    const idempotencyKey = sanitizeTextInput(String(obj.idempotencyKey ?? '')).slice(0, 120);
    if (!paymentIntentId || idempotencyKey.length < 6) {
      throw new CoreApiError('VALIDATION_FAILED', 400, 'paymentIntentId and idempotencyKey (min 6 chars) are required.');
    }

    const reasonCode = (obj.reasonCode ?? 'CUSTOMER_CANCELLATION_WITHIN_POLICY') as RefundRequestRecord['reasonCode'];
    const validReasons = new Set<RefundRequestRecord['reasonCode']>([
      'DUPLICATE_CHARGE',
      'SERVICE_NOT_DELIVERED',
      'LISTING_REJECTED_BY_MODERATION',
      'CUSTOMER_CANCELLATION_WITHIN_POLICY',
      'BILLING_ERROR',
      'ADMINISTRATIVE_ADJUSTMENT',
    ]);
    if (!validReasons.has(reasonCode)) {
      throw new CoreApiError('VALIDATION_FAILED', 400, `Invalid refund reasonCode: ${String(obj.reasonCode)}`);
    }
    const reasonDetails = sanitizeTextInput(String(obj.reasonDetails ?? reasonCode)).slice(0, 500);

    const isAdmin =
      principal.role === 'primary_admin' ||
      principal.role === 'delegated_admin' ||
      principal.role === 'server_secret_admin';
    const nowIso = new Date().toISOString();

    const staged = await this.repo.runInTransaction('mb.stageRefundRequest', async (tx) => {
      const existingByIdem = await this.repo.getRefundByIdempotencyInTx(
        tx,
        principal.uid,
        idempotencyKey,
      );
      if (existingByIdem) {
        return { refund: existingByIdem, intent: null, invoice: null, replayed: true };
      }

      const intent = await this.repo.getPaymentIntentInTx(tx, paymentIntentId);
      if (!intent) {
        throw new CoreApiError('NOT_FOUND', 404, `PaymentIntent ${paymentIntentId} not found.`);
      }
      this.assertOwnershipOrAdmin(principal, intent.payerUid, isAdmin);

      if (intent.status !== 'SUCCEEDED' && intent.status !== 'PARTIALLY_REFUNDED') {
        throw new CoreApiError(
          'CONFLICT',
          409,
          `PaymentIntent ${paymentIntentId} in status ${intent.status} is not eligible for a refund.`,
        );
      }

      const invoice = await this.repo.getInvoiceInTx(tx, intent.invoiceId);
      if (!invoice) {
        throw new CoreApiError('NOT_FOUND', 404, `Invoice ${intent.invoiceId} not found.`);
      }

      const existingRefunds = await this.repo.listRefundsByPaymentIntentInTx(tx, paymentIntentId);
      const activeOrCompletedMinor = existingRefunds
        .filter((r) => r.status !== 'FAILED' && r.status !== 'REJECTED')
        .reduce((sum, r) => sum + r.requestedAmountMinor, 0);

      const remainingRefundableMinor = intent.totalAmountMinor - activeOrCompletedMinor;
      if (remainingRefundableMinor <= 0) {
        throw new CoreApiError('CONFLICT', 409, 'Payment intent has already been fully refunded.');
      }

      const requestedAmountMinor =
        obj.requestedAmountMinor !== undefined
          ? assertSafePositiveInteger(obj.requestedAmountMinor, 'requestedAmountMinor')
          : remainingRefundableMinor;

      if (requestedAmountMinor > remainingRefundableMinor) {
        throw new CoreApiError(
          'VALIDATION_FAILED',
          400,
          `Requested refund amount (${requestedAmountMinor}) exceeds remaining refundable balance (${remainingRefundableMinor}). Over-refunding is prohibited.`,
        );
      }

      const threshold = REFUND_ADMIN_APPROVAL_THRESHOLD_MINOR[intent.currency] ?? 10_000_000;
      const requiresAdminApproval = !isAdmin && requestedAmountMinor >= threshold;

      const refund: RefundRequestRecord = {
        refundId: `ref_${crypto.randomBytes(6).toString('hex')}`,
        paymentIntentId: intent.paymentIntentId,
        invoiceId: invoice.invoiceId,
        requesterUid: principal.uid,
        organizationId: intent.organizationId,
        currency: intent.currency,
        requestedAmountMinor,
        isFullRefund: requestedAmountMinor === intent.totalAmountMinor,
        reasonCode,
        reasonDetails,
        requiresAdminApproval,
        approvedByAdminUid: isAdmin ? principal.uid : null,
        rejectedByAdminUid: null,
        adminDecisionNote: isAdmin ? 'Auto-approved by administrative initiator' : null,
        status: requiresAdminApproval ? 'PENDING_APPROVAL' : 'APPROVED',
        providerRefundRef: null,
        ledgerReversalPostingId: null,
        creditNoteId: null,
        failureReason: null,
        idempotencyKey,
        completedAtIso: null,
        revision: 1,
        createdAtIso: nowIso,
        updatedAtIso: nowIso,
      };

      await this.repo.upsertRefundInTx(tx, refund);
      return { refund, intent, invoice, replayed: false };
    });

    if (staged.replayed) {
      return { refund: staged.refund, creditNote: null, replayed: true };
    }

    if (staged.refund.status === 'PENDING_APPROVAL') {
      await this.emitAuditAndDomainEvent({
        actor: principal,
        targetUid: principal.uid,
        eventType: 'billing.refund.initiated',
        action: 'refund.pending_approval',
        resourceId: staged.refund.refundId,
        payload: {
          paymentIntentId,
          requestedAmountMinor: staged.refund.requestedAmountMinor,
        },
      });
      return { refund: staged.refund, creditNote: null, replayed: false };
    }

    return this.executeApprovedRefund(principal, staged.refund.refundId);
  }

  public async decideRefundApproval(
    adminPrincipal: AuthenticatedPrincipal,
    refundId: string,
    rawInput: unknown,
  ): Promise<{ refund: RefundRequestRecord; creditNote: CreditNoteRecord | null }> {
    await this.assertAdminPrincipal(adminPrincipal);
    const obj = assertPlainObject(rawInput, 'RefundApprovalDecisionInput');
    const decision = obj.decision as 'APPROVE' | 'REJECT';
    if (decision !== 'APPROVE' && decision !== 'REJECT') {
      throw new CoreApiError('VALIDATION_FAILED', 400, 'decision must be APPROVE or REJECT.');
    }
    const note = sanitizeTextInput(String(obj.note ?? '')).slice(0, 300);
    const nowIso = new Date().toISOString();

    const updated = await this.repo.runInTransaction('mb.decideRefundApproval', async (tx) => {
      const refund = await this.repo.getRefundInTx(tx, refundId);
      if (!refund) {
        throw new CoreApiError('NOT_FOUND', 404, `Refund ${refundId} not found.`);
      }
      if (refund.status !== 'PENDING_APPROVAL') {
        throw new CoreApiError('CONFLICT', 409, `Refund ${refundId} is in status ${refund.status}, not PENDING_APPROVAL.`);
      }
      if (decision === 'REJECT') {
        refund.status = 'REJECTED';
        refund.rejectedByAdminUid = adminPrincipal.uid;
        refund.adminDecisionNote = note || 'Rejected by financial administrator';
        refund.revision += 1;
        refund.updatedAtIso = nowIso;
      } else {
        refund.status = 'APPROVED';
        refund.approvedByAdminUid = adminPrincipal.uid;
        refund.adminDecisionNote = note || 'Approved by financial administrator';
        refund.revision += 1;
        refund.updatedAtIso = nowIso;
      }
      await this.repo.upsertRefundInTx(tx, refund);
      return refund;
    });

    if (updated.status === 'REJECTED') {
      await this.emitAuditAndDomainEvent({
        actor: adminPrincipal,
        targetUid: updated.requesterUid,
        eventType: 'billing.refund.initiated',
        action: 'refund.rejected',
        resourceId: updated.refundId,
        payload: { note },
      });
      return { refund: updated, creditNote: null };
    }

    const res = await this.executeApprovedRefund(adminPrincipal, updated.refundId);
    return { refund: res.refund, creditNote: res.creditNote };
  }

  private async executeApprovedRefund(
    actor: AuthenticatedPrincipal,
    refundId: string,
  ): Promise<{ refund: RefundRequestRecord; creditNote: CreditNoteRecord | null; replayed: boolean }> {
    const context = await this.repo.runInTransaction('mb.loadApprovedRefund', async (tx) => {
      const refund = await this.repo.getRefundInTx(tx, refundId);
      if (!refund) {
        throw new CoreApiError('NOT_FOUND', 404, `Refund ${refundId} not found.`);
      }
      const intent = await this.repo.getPaymentIntentInTx(tx, refund.paymentIntentId);
      const invoice = await this.repo.getInvoiceInTx(tx, refund.invoiceId);
      if (!intent || !invoice) {
        throw new CoreApiError('NOT_FOUND', 404, 'Associated payment intent or invoice missing.');
      }
      return { refund, intent, invoice };
    });

    const providerAdapter = this.providerAdapters.get(context.intent.providerId);
    if (!providerAdapter || !context.intent.providerTransactionRef) {
      throw new CoreApiError('CONFLICT', 409, 'Payment provider reference unavailable for refund.');
    }

    const providerResult = await providerAdapter.requestRefund({
      paymentIntentId: context.intent.paymentIntentId,
      providerTransactionRef: context.intent.providerTransactionRef,
      refundId: context.refund.refundId,
      amountMinor: context.refund.requestedAmountMinor,
      currency: context.refund.currency,
      idempotencyKey: `prov_refund_${context.refund.refundId}`,
    });

    const nowIso = new Date().toISOString();
    if (!providerResult.ok || !providerResult.providerRefundRef) {
      const failedRefund = await this.repo.runInTransaction('mb.markRefundFailed', async (tx) => {
        const ref = (await this.repo.getRefundInTx(tx, refundId))!;
        ref.status = 'FAILED';
        ref.failureReason = providerResult.errorMessage ?? 'Provider failed to execute refund.';
        ref.revision += 1;
        ref.updatedAtIso = nowIso;
        await this.repo.upsertRefundInTx(tx, ref);
        return ref;
      });
      return { refund: failedRefund, creditNote: null, replayed: false };
    }

    // Provider refund confirmed -> Post reversal entry to Employee 54 ledger (never mutating historical postings)
    const reversalPosting = await this.ledgerAdapter.postLedgerEntry({
      idempotencyKey: `ledger_refund_reversal_${context.refund.refundId}`,
      postingType: 'REFUND_REVERSAL',
      accountOwnerUid: context.intent.payerUid,
      organizationId: context.intent.organizationId,
      sourceDomain: 'MARKETPLACE_BILLING',
      sourceRecordId: context.refund.refundId,
      invoiceId: context.invoice.invoiceId,
      paymentIntentId: context.intent.paymentIntentId,
      refundId: context.refund.refundId,
      reversesLedgerPostingId: context.intent.ledgerRevenuePostId,
      currency: context.refund.currency,
      amountMinor: context.refund.requestedAmountMinor,
      debitAccountCode: 'PLATFORM_EARNED_REVENUE_REVERSAL',
      creditAccountCode: 'CASH_CLEARING_PROVIDER',
      description: `Refund reversal for invoice ${context.invoice.invoiceNumber} (${context.refund.reasonCode})`,
      metadata: {
        providerRefundRef: providerResult.providerRefundRef,
        reversesPostingId: context.intent.ledgerRevenuePostId,
      },
    });

    const finalized = await this.repo.runInTransaction('mb.completeRefundAndCreditNote', async (tx) => {
      const refund = (await this.repo.getRefundInTx(tx, refundId))!;
      const intent = (await this.repo.getPaymentIntentInTx(tx, refund.paymentIntentId))!;
      const invoice = (await this.repo.getInvoiceInTx(tx, refund.invoiceId))!;

      const creditNoteNumber = await this.repo.nextInvoiceSequenceNumberInTx(tx, 'CN');
      const creditNoteId = `cn_${crypto.randomBytes(6).toString('hex')}`;

      // Proportional tax reversal using exact BigInt integer math
      const taxReversedMinor =
        invoice.totalMinor > 0
          ? Number(
              (BigInt(invoice.taxMinor) * BigInt(refund.requestedAmountMinor) +
                BigInt(Math.floor(invoice.totalMinor / 2))) /
                BigInt(invoice.totalMinor),
            )
          : 0;
      const subtotalReversedMinor = Math.max(0, refund.requestedAmountMinor - taxReversedMinor);

      const creditNote: CreditNoteRecord = {
        creditNoteId,
        creditNoteNumber,
        invoiceId: invoice.invoiceId,
        customerUid: invoice.customerUid,
        organizationId: invoice.organizationId,
        refundId: refund.refundId,
        currency: refund.currency,
        subtotalReversedMinor,
        taxReversedMinor,
        totalCreditedMinor: refund.requestedAmountMinor,
        reason: `${refund.reasonCode}: ${refund.reasonDetails}`,
        creditNoteDocumentId: null,
        issuedByUid: actor.uid,
        issuedAtIso: nowIso,
      };

      refund.status = 'COMPLETED';
      refund.providerRefundRef = providerResult.providerRefundRef!;
      refund.ledgerReversalPostingId = reversalPosting.ledgerPostingId;
      refund.creditNoteId = creditNoteId;
      refund.completedAtIso = nowIso;
      refund.revision += 1;
      refund.updatedAtIso = nowIso;

      intent.refundedAmountMinor += refund.requestedAmountMinor;
      intent.refundIds = [...intent.refundIds, refund.refundId];
      intent.status =
        intent.refundedAmountMinor >= intent.totalAmountMinor ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
      intent.revision += 1;
      intent.updatedAtIso = nowIso;

      invoice.amountRefundedMinor += refund.requestedAmountMinor;
      invoice.refundIds = [...invoice.refundIds, refund.refundId];
      invoice.creditNoteIds = [...invoice.creditNoteIds, creditNoteId];
      invoice.status =
        invoice.amountRefundedMinor >= invoice.totalMinor ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
      invoice.revision += 1;
      invoice.updatedAtIso = nowIso;

      await this.repo.upsertCreditNoteInTx(tx, creditNote);
      await this.repo.upsertRefundInTx(tx, refund);
      await this.repo.upsertPaymentIntentInTx(tx, intent);
      await this.repo.upsertInvoiceInTx(tx, invoice);
      await this.repo.appendPaymentHistoryInTx(tx, intent.paymentIntentId, {
        eventId: `phe_${crypto.randomBytes(5).toString('hex')}`,
        fromStatus: 'SUCCEEDED',
        toStatus: intent.status,
        actorUid: actor.uid,
        providerEventRef: providerResult.providerRefundRef,
        reason: `Refund ${refund.refundId} completed (${refund.requestedAmountMinor} ${refund.currency}).`,
        timestampIso: nowIso,
      });

      return { refund, creditNote, invoice };
    });

    const cnDoc = await this.documentAdapter.generateAndStoreFinancialDocument({
      ownerUid: finalized.invoice.customerUid,
      organizationId: finalized.invoice.organizationId,
      documentType: 'CREDIT_NOTE_PDF_ARTIFACT',
      referenceNumber: finalized.creditNote.creditNoteNumber,
      payload: {
        creditNoteId: finalized.creditNote.creditNoteId,
        creditNoteNumber: finalized.creditNote.creditNoteNumber,
        invoiceId: finalized.invoice.invoiceId,
        totalCreditedMinor: finalized.creditNote.totalCreditedMinor,
      },
    });

    await this.repo.runInTransaction('mb.attachCreditNoteDocument', async (tx) => {
      finalized.creditNote.creditNoteDocumentId = cnDoc.documentId;
      await this.repo.upsertCreditNoteInTx(tx, finalized.creditNote);
    });

    await this.emitAuditAndDomainEvent({
      actor,
      targetUid: finalized.invoice.customerUid,
      eventType: 'billing.refund.completed',
      action: 'refund.completed',
      resourceId: finalized.refund.refundId,
      payload: {
        paymentIntentId: finalized.refund.paymentIntentId,
        creditNoteId: finalized.creditNote.creditNoteId,
        amountMinor: finalized.refund.requestedAmountMinor,
        ledgerReversalPostingId: reversalPosting.ledgerPostingId,
      },
    });

    await this.notificationAdapter.sendCustomerBillingNotification({
      recipientUid: finalized.invoice.customerUid,
      eventType: 'REFUND_COMPLETED',
      title: 'استرداد وجه انجام شد',
      body: `مبلغ ${finalized.refund.requestedAmountMinor} برای فاکتور ${finalized.invoice.invoiceNumber} مسترد شد.`,
      referenceId: finalized.refund.refundId,
      idempotencyKey: `notif_refund_${finalized.refund.refundId}`,
    });

    return { refund: finalized.refund, creditNote: finalized.creditNote, replayed: false };
  }

  // ==========================================================================
  // 12. USAGE-BASED BILLING
  // ==========================================================================

  public async recordBillableUsageEvent(
    principal: AuthenticatedPrincipal,
    rawInput: unknown,
  ): Promise<{ usageEvent: UsageBillingEventRecord; replayed: boolean }> {
    await this.ensureDefaultCatalogSeeded();
    const obj = assertPlainObject(rawInput, 'RecordUsageEventInput');

    if (obj.billingDisclosureAccepted !== true) {
      throw new CoreApiError(
        'VALIDATION_FAILED',
        400,
        'General behavioral telemetry cannot be billed. Explicit billingDisclosureAccepted=true is required.',
      );
    }

    const idempotencyKey = sanitizeTextInput(String(obj.idempotencyKey ?? '')).slice(0, 120);
    if (idempotencyKey.length < 6) {
      throw new CoreApiError('IDEMPOTENCY_KEY_INVALID', 400, 'idempotencyKey (min 6 chars) is required.');
    }

    const featureKey = obj.featureKey as BillableFeatureKey;
    if (!SUPPORTED_FEATURE_KEYS.has(featureKey)) {
      throw new CoreApiError('VALIDATION_FAILED', 400, `Unsupported billable featureKey: ${String(obj.featureKey)}`);
    }
    const productId = sanitizeTextInput(String(obj.productId ?? 'prod_usage_valuation_api'));
    const quantity = assertSafePositiveInteger(obj.quantity ?? 1, 'quantity', 100_000);
    const billingPeriodKey =
      typeof obj.billingPeriodKey === 'string' && /^\d{4}-\d{2}$/.test(obj.billingPeriodKey)
        ? obj.billingPeriodKey
        : new Date().toISOString().slice(0, 7);
    const organizationId =
      typeof obj.organizationId === 'string' && sanitizeTextInput(obj.organizationId)
        ? sanitizeTextInput(obj.organizationId)
        : null;

    const nowIso = new Date().toISOString();

    return this.repo.runInTransaction('mb.recordUsageEvent', async (tx) => {
      const existing = await this.repo.getUsageEventByIdempotencyInTx(tx, principal.uid, idempotencyKey);
      if (existing) {
        return { usageEvent: existing, replayed: true };
      }

      const product = await this.repo.getProductInTx(tx, productId);
      if (!product || product.availabilityStatus !== 'ACTIVE') {
        throw new CoreApiError('NOT_FOUND', 404, `Usage billing product ${productId} not found.`);
      }
      const pricing = await this.repo.getPricingVersionInTx(tx, product.activePricingVersionId);
      if (!pricing) {
        throw new CoreApiError('NOT_FOUND', 404, 'Pricing version missing for usage product.');
      }

      const unitPriceMinor = pricing.overageUnitAmountMinor ?? pricing.unitAmountMinor;
      const totalChargeMinor = Number(BigInt(unitPriceMinor) * BigInt(quantity));

      const event: UsageBillingEventRecord = {
        usageEventId: `use_${crypto.randomBytes(6).toString('hex')}`,
        idempotencyKey,
        ownerUid: principal.uid,
        organizationId,
        featureKey,
        productId: product.productId,
        pricingVersionId: pricing.pricingVersionId,
        billingPeriodKey,
        quantity,
        unitPriceMinor,
        totalChargeMinor,
        currency: pricing.currency,
        billingDisclosureAccepted: true,
        settledInvoiceId: null,
        correctionOfUsageEventId: null,
        correctionReason: null,
        recordedAtIso: nowIso,
      };

      await this.repo.upsertUsageEventInTx(tx, event);
      return { usageEvent: event, replayed: false };
    });
  }

  public async getUsageBillingSummaryAndPreview(
    principal: AuthenticatedPrincipal,
    targetUid = principal.uid,
    billingPeriodKey = new Date().toISOString().slice(0, 7),
  ): Promise<UsageBillingSummaryView> {
    await this.ensureDefaultCatalogSeeded();
    this.assertOwnershipOrAdmin(principal, targetUid);

    return this.repo.runInTransaction('mb.getUsageBillingSummary', async (tx) => {
      const events = await this.repo.listUsageEventsByOwnerPeriodInTx(tx, targetUid, billingPeriodKey);
      const byFeature = new Map<
        BillableFeatureKey,
        {
          productId: string;
          totalQuantity: number;
          includedQuota: number;
          unitPriceMinor: number;
        }
      >();

      for (const evt of events) {
        const product = await this.repo.getProductInTx(tx, evt.productId);
        const pricing = product
          ? await this.repo.getPricingVersionInTx(tx, evt.pricingVersionId)
          : null;
        const includedQuota = pricing?.includedUsageUnits ?? 0;

        const current = byFeature.get(evt.featureKey) ?? {
          productId: evt.productId,
          totalQuantity: 0,
          includedQuota,
          unitPriceMinor: evt.unitPriceMinor,
        };
        current.totalQuantity = Math.max(0, current.totalQuantity + evt.quantity);
        byFeature.set(evt.featureKey, current);
      }

      let totalEstimatedChargeMinor = 0;
      const featureTotals: UsageBillingSummaryView['featureTotals'] = [];

      for (const [featureKey, agg] of byFeature.entries()) {
        const billableQuantity = Math.max(0, agg.totalQuantity - agg.includedQuota);
        const estimatedChargeMinor = Number(BigInt(billableQuantity) * BigInt(agg.unitPriceMinor));
        totalEstimatedChargeMinor += estimatedChargeMinor;
        featureTotals.push({
          featureKey,
          productId: agg.productId,
          totalQuantity: agg.totalQuantity,
          includedQuota: agg.includedQuota,
          billableQuantity,
          estimatedChargeMinor,
        });
      }

      return {
        ownerUid: targetUid,
        organizationId: events[0]?.organizationId ?? null,
        billingPeriodKey,
        currency: events[0]?.currency ?? 'IRT',
        featureTotals,
        totalEstimatedChargeMinor,
        unbilledEventIds: events.filter((e) => !e.settledInvoiceId).map((e) => e.usageEventId),
      };
    });
  }

  // ==========================================================================
  // 13. FINANCIAL RECONCILIATION WORKFLOWS
  // ==========================================================================

  public async runReconciliationBatch(
    adminPrincipal: AuthenticatedPrincipal,
    rawInput: unknown,
  ): Promise<{
    batch: ReconciliationBatchRecord;
    exceptions: ReconciliationExceptionRecord[];
  }> {
    await this.assertAdminPrincipal(adminPrincipal);
    await this.ensureDefaultCatalogSeeded();
    const obj = assertPlainObject(rawInput, 'RunReconciliationBatchInput');
    const providerId = sanitizeTextInput(String(obj.providerId ?? 'sandbox_gateway_ir'));
    const providerRecords = Array.isArray(obj.providerRecords)
      ? (obj.providerRecords as ProviderSettlementRecordInput[])
      : [];
    const nowIso = new Date().toISOString();

    const ledgerEntries = await this.ledgerAdapter.listAllBillingLedgerEntries();

    const result = await this.repo.runInTransaction('mb.runReconciliationBatch', async (tx) => {
      const batchId = `recb_${crypto.randomBytes(6).toString('hex')}`;
      const allIntents = (await this.repo.listAllPaymentIntentsInTx(tx)).filter(
        (i) => i.providerId === providerId,
      );

      const intentByProviderRef = new Map<string, PaymentIntentRecord>();
      const intentById = new Map<string, PaymentIntentRecord>();
      for (const intent of allIntents) {
        intentById.set(intent.paymentIntentId, intent);
        if (intent.providerTransactionRef) {
          intentByProviderRef.set(intent.providerTransactionRef, intent);
        }
      }

      const revenueLedgerByIntentId = new Map<string, number>();
      for (const entry of ledgerEntries) {
        if (
          entry.paymentIntentId &&
          (entry.postingType === 'PLATFORM_SERVICE_REVENUE' ||
            entry.postingType === 'COMMISSION_SETTLEMENT_REFERENCE' ||
            entry.postingType === 'TAX_LIABILITY')
        ) {
          revenueLedgerByIntentId.set(
            entry.paymentIntentId,
            (revenueLedgerByIntentId.get(entry.paymentIntentId) ?? 0) + entry.amountMinor,
          );
        }
      }

      const exceptions: ReconciliationExceptionRecord[] = [];
      const seenProviderRefs = new Set<string>();
      let matchedCount = 0;

      const recordException = async (
        mismatchType: ReconciliationExceptionRecord['mismatchType'],
        fields: Partial<ReconciliationExceptionRecord> & { details: string },
      ) => {
        const exc: ReconciliationExceptionRecord = {
          exceptionId: `recex_${crypto.randomBytes(6).toString('hex')}`,
          batchId,
          mismatchType,
          paymentIntentId: fields.paymentIntentId ?? null,
          providerTransactionRef: fields.providerTransactionRef ?? null,
          invoiceId: fields.invoiceId ?? null,
          ledgerPostingId: fields.ledgerPostingId ?? null,
          expectedAmountMinor: fields.expectedAmountMinor ?? null,
          actualAmountMinor: fields.actualAmountMinor ?? null,
          currency: fields.currency ?? null,
          details: fields.details,
          status: 'OPEN',
          resolutionAdjustmentPostingId: null,
          resolutionNote: null,
          resolvedByAdminUid: null,
          resolvedAtIso: null,
          createdAtIso: nowIso,
        };
        await this.repo.upsertReconciliationExceptionInTx(tx, exc);
        exceptions.push(exc);
      };

      // 1. Check every provider settlement record against internal intents & Employee 54 ledger
      for (const provRec of providerRecords) {
        if (seenProviderRefs.has(provRec.providerTransactionRef)) {
          await recordException('DUPLICATE_PROVIDER_TRANSACTION', {
            providerTransactionRef: provRec.providerTransactionRef,
            actualAmountMinor: provRec.amountMinor,
            currency: provRec.currency,
            details: `Duplicate provider transaction reference ${provRec.providerTransactionRef} in settlement batch.`,
          });
          continue;
        }
        seenProviderRefs.add(provRec.providerTransactionRef);

        const matchedIntent =
          intentByProviderRef.get(provRec.providerTransactionRef) ??
          (provRec.paymentIntentId ? intentById.get(provRec.paymentIntentId) : undefined);

        if (!matchedIntent) {
          await recordException('MISSING_IN_INTERNAL_INTENTS', {
            providerTransactionRef: provRec.providerTransactionRef,
            actualAmountMinor: provRec.amountMinor,
            currency: provRec.currency,
            details: `Provider transaction ${provRec.providerTransactionRef} has no matching PaymentIntent.`,
          });
          continue;
        }

        if (matchedIntent.currency !== provRec.currency) {
          await recordException('CURRENCY_MISMATCH', {
            paymentIntentId: matchedIntent.paymentIntentId,
            providerTransactionRef: provRec.providerTransactionRef,
            invoiceId: matchedIntent.invoiceId,
            expectedAmountMinor: matchedIntent.totalAmountMinor,
            actualAmountMinor: provRec.amountMinor,
            currency: provRec.currency,
            details: `Currency mismatch: intent=${matchedIntent.currency}, provider=${provRec.currency}.`,
          });
          continue;
        }

        if (matchedIntent.totalAmountMinor !== provRec.amountMinor) {
          await recordException('AMOUNT_MISMATCH', {
            paymentIntentId: matchedIntent.paymentIntentId,
            providerTransactionRef: provRec.providerTransactionRef,
            invoiceId: matchedIntent.invoiceId,
            expectedAmountMinor: matchedIntent.totalAmountMinor,
            actualAmountMinor: provRec.amountMinor,
            currency: provRec.currency,
            details: `Amount mismatch: intent=${matchedIntent.totalAmountMinor}, provider=${provRec.amountMinor}.`,
          });
          continue;
        }

        const ledgerTotal = revenueLedgerByIntentId.get(matchedIntent.paymentIntentId) ?? 0;
        if (ledgerTotal !== matchedIntent.totalAmountMinor) {
          await recordException('MISSING_IN_LEDGER', {
            paymentIntentId: matchedIntent.paymentIntentId,
            providerTransactionRef: provRec.providerTransactionRef,
            invoiceId: matchedIntent.invoiceId,
            expectedAmountMinor: matchedIntent.totalAmountMinor,
            actualAmountMinor: ledgerTotal,
            currency: matchedIntent.currency,
            details: `Ledger revenue+tax total (${ledgerTotal}) does not match confirmed intent (${matchedIntent.totalAmountMinor}).`,
          });
          continue;
        }

        matchedCount += 1;
      }

      // 2. Check internal SUCCEEDED intents missing from provider settlement batch
      for (const intent of allIntents) {
        if (intent.status === 'SUCCEEDED') {
          if (!intent.providerTransactionRef || !seenProviderRefs.has(intent.providerTransactionRef)) {
            await recordException('MISSING_IN_PROVIDER', {
              paymentIntentId: intent.paymentIntentId,
              providerTransactionRef: intent.providerTransactionRef,
              invoiceId: intent.invoiceId,
              expectedAmountMinor: intent.totalAmountMinor,
              actualAmountMinor: 0,
              currency: intent.currency,
              details: `Internal SUCCEEDED intent ${intent.paymentIntentId} missing from provider settlement records.`,
            });
          }
        }
      }

      const batch: ReconciliationBatchRecord = {
        batchId,
        providerId,
        periodStartIso: typeof obj.periodStartIso === 'string' ? obj.periodStartIso : nowIso,
        periodEndIso: typeof obj.periodEndIso === 'string' ? obj.periodEndIso : nowIso,
        totalProviderRecordsChecked: providerRecords.length,
        totalInternalIntentsChecked: allIntents.length,
        totalLedgerPostingsChecked: ledgerEntries.length,
        matchedCount,
        exceptionCount: exceptions.length,
        exceptionIds: exceptions.map((e) => e.exceptionId),
        status: exceptions.length === 0 ? 'COMPLETED_CLEAN' : 'COMPLETED_WITH_EXCEPTIONS',
        executedByUid: adminPrincipal.uid,
        executedAtIso: nowIso,
      };

      await this.repo.upsertReconciliationBatchInTx(tx, batch);
      return { batch, exceptions };
    });

    await this.emitAuditAndDomainEvent({
      actor: adminPrincipal,
      targetUid: adminPrincipal.uid,
      eventType: 'billing.reconciliation.completed',
      action: 'reconciliation.batch_completed',
      resourceId: result.batch.batchId,
      payload: {
        matchedCount: result.batch.matchedCount,
        exceptionCount: result.batch.exceptionCount,
        status: result.batch.status,
      },
    });

    return result;
  }

  public async resolveReconciliationException(
    adminPrincipal: AuthenticatedPrincipal,
    exceptionId: string,
    rawInput: unknown,
  ): Promise<ReconciliationExceptionRecord> {
    await this.assertAdminPrincipal(adminPrincipal);
    const obj = assertPlainObject(rawInput, 'ResolveReconciliationExceptionInput');
    const resolutionMode = obj.resolutionMode as
      | 'RESOLVED_BY_ADJUSTMENT'
      | 'DISMISSED_WITH_EXPLANATION';
    if (
      resolutionMode !== 'RESOLVED_BY_ADJUSTMENT' &&
      resolutionMode !== 'DISMISSED_WITH_EXPLANATION'
    ) {
      throw new CoreApiError(
        'VALIDATION_FAILED',
        400,
        'resolutionMode must be RESOLVED_BY_ADJUSTMENT or DISMISSED_WITH_EXPLANATION.',
      );
    }
    const resolutionNote = sanitizeTextInput(String(obj.resolutionNote ?? '')).slice(0, 500);
    if (resolutionNote.length < 5) {
      throw new CoreApiError('VALIDATION_FAILED', 400, 'resolutionNote (min 5 chars) is required.');
    }

    const existing = await this.repo.runInTransaction('mb.getReconciliationException', async (tx) => {
      const exc = await this.repo.getReconciliationExceptionInTx(tx, exceptionId);
      if (!exc) {
        throw new CoreApiError('NOT_FOUND', 404, `ReconciliationException ${exceptionId} not found.`);
      }
      return exc;
    });

    let adjustmentPostingId: string | null = null;
    if (resolutionMode === 'RESOLVED_BY_ADJUSTMENT') {
      const adjAmount = Math.abs(
        (existing.expectedAmountMinor ?? 0) - (existing.actualAmountMinor ?? 0),
      );
      if (adjAmount > 0 && existing.currency) {
        const adjPosting = await this.ledgerAdapter.postLedgerEntry({
          idempotencyKey: `ledger_reconcile_adj_${exceptionId}`,
          postingType: 'FINANCIAL_ADJUSTMENT',
          accountOwnerUid: adminPrincipal.uid,
          organizationId: null,
          sourceDomain: 'MARKETPLACE_BILLING',
          sourceRecordId: exceptionId,
          invoiceId: existing.invoiceId,
          paymentIntentId: existing.paymentIntentId,
          refundId: null,
          reversesLedgerPostingId: existing.ledgerPostingId,
          currency: existing.currency,
          amountMinor: adjAmount,
          debitAccountCode: 'RECONCILIATION_SUSPENSE',
          creditAccountCode: 'PLATFORM_EARNED_REVENUE',
          description: `Authorized reconciliation adjustment for ${exceptionId}: ${resolutionNote}`,
          metadata: { exceptionId, batchId: existing.batchId },
        });
        adjustmentPostingId = adjPosting.ledgerPostingId;
      }
    }

    const nowIso = new Date().toISOString();
    const resolved = await this.repo.runInTransaction('mb.resolveReconciliationException', async (tx) => {
      const exc = (await this.repo.getReconciliationExceptionInTx(tx, exceptionId))!;
      exc.status = resolutionMode;
      exc.resolutionAdjustmentPostingId = adjustmentPostingId;
      exc.resolutionNote = resolutionNote;
      exc.resolvedByAdminUid = adminPrincipal.uid;
      exc.resolvedAtIso = nowIso;
      await this.repo.upsertReconciliationExceptionInTx(tx, exc);
      return exc;
    });

    await this.emitAuditAndDomainEvent({
      actor: adminPrincipal,
      targetUid: adminPrincipal.uid,
      eventType: 'billing.reconciliation.completed',
      action: 'reconciliation.exception_resolved',
      resourceId: resolved.exceptionId,
      payload: {
        resolutionMode,
        adjustmentPostingId,
        resolutionNote,
      },
    });

    return resolved;
  }

  // ==========================================================================
  // 17. BACKGROUND JOBS (PAYMENT EXPIRATION & SUBSCRIPTION EXPIRATION)
  // ==========================================================================

  public async executeBillingLifecycleBackgroundJob(nowIso = new Date().toISOString()): Promise<{
    expiredPaymentIntentsCount: number;
    expiredSubscriptionsCount: number;
  }> {
    await this.ensureDefaultCatalogSeeded();
    return this.repo.runInTransaction('mb.executeLifecycleJob', async (tx) => {
      let expiredPaymentIntentsCount = 0;
      let expiredSubscriptionsCount = 0;

      const intents = await this.repo.listAllPaymentIntentsInTx(tx);
      for (const intent of intents) {
        if (
          (intent.status === 'CREATED' || intent.status === 'INITIATED') &&
          intent.expiresAtIso <= nowIso
        ) {
          const prev = intent.status;
          intent.status = 'EXPIRED';
          intent.revision += 1;
          intent.updatedAtIso = nowIso;
          await this.repo.upsertPaymentIntentInTx(tx, intent);
          await this.repo.appendPaymentHistoryInTx(tx, intent.paymentIntentId, {
            eventId: `phe_${crypto.randomBytes(5).toString('hex')}`,
            fromStatus: prev,
            toStatus: 'EXPIRED',
            actorUid: 'system_cron',
            reason: 'Payment intent expired prior to completion.',
            timestampIso: nowIso,
          });
          expiredPaymentIntentsCount += 1;
        }
      }

      const subs = await this.repo.listAllSubscriptionsInTx(tx);
      for (const sub of subs) {
        const graceExpired =
          sub.status === 'PAST_DUE' &&
          sub.gracePeriodEndsAtIso &&
          sub.gracePeriodEndsAtIso <= nowIso;
        const periodEndCanceled =
          sub.status === 'ACTIVE' &&
          sub.cancelAtPeriodEnd &&
          sub.currentPeriodEndIso <= nowIso;

        if (graceExpired || periodEndCanceled) {
          const prev = sub.status;
          sub.status = 'EXPIRED';
          sub.expiredAtIso = nowIso;
          sub.revision += 1;
          sub.updatedAtIso = nowIso;
          await this.repo.upsertSubscriptionInTx(tx, sub);
          await this.repo.appendSubscriptionHistoryInTx(tx, {
            historyId: `subh_${crypto.randomBytes(5).toString('hex')}`,
            subscriptionId: sub.subscriptionId,
            action: 'EXPIRED',
            fromStatus: prev,
            toStatus: 'EXPIRED',
            actorUid: 'system_cron',
            reason: graceExpired ? 'Grace period elapsed after renewal failure.' : 'Period ended with cancelAtPeriodEnd=true.',
            timestampIso: nowIso,
          });

          const grants = await this.repo.listEntitlementGrantsBySourceInTx(tx, sub.subscriptionId);
          for (const g of grants) {
            if (g.status === 'ACTIVE') {
              g.status = 'EXPIRED';
              g.updatedAtIso = nowIso;
              await this.repo.upsertEntitlementGrantInTx(tx, g);
            }
          }
          expiredSubscriptionsCount += 1;
        }
      }

      return { expiredPaymentIntentsCount, expiredSubscriptionsCount };
    });
  }
}
