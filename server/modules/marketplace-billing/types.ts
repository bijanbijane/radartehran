/**
 * Employee 67 — Real Estate Marketplace Payments, Billing & Financial Operations Backend
 * (`server/modules/marketplace-billing/types.ts`)
 *
 * Exclusive ownership: `server/modules/marketplace-billing/`
 */

import type {
  AuditEventSink,
  AuthenticatedPrincipal,
  DelegatedAdminStoreAdapter,
  FirebaseTokenVerifierAdapter,
  IdempotencyStoreAdapter,
  TransactionRunnerAdapter,
} from '../core/types';

export type BillingCurrency = 'IRT' | 'IRR' | 'USD' | 'EUR' | 'AED';

export type EligibleAccountType =
  | 'INDIVIDUAL'
  | 'PROFESSIONAL_AGENT'
  | 'BROKERAGE_ORGANIZATION'
  | 'PROPERTY_MANAGER'
  | 'DEVELOPER_ENTERPRISE';

// ============================================================================
// 2. MARKETPLACE BILLING DOMAIN (PRODUCTS & PRICING VERSIONS)
// ============================================================================

export type BillingCategory =
  | 'PROPERTY_LISTING_PUBLICATION'
  | 'FEATURED_LISTING_PLACEMENT'
  | 'LISTING_PROMOTION'
  | 'BROKERAGE_SUBSCRIPTION_PLAN'
  | 'PROFESSIONAL_ACCOUNT_PLAN'
  | 'PROPERTY_MANAGEMENT_SERVICE_PLAN'
  | 'ADDITIONAL_MARKETPLACE_SERVICE'
  | 'USAGE_BASED_PLATFORM_SERVICE'
  | 'ADMINISTRATIVE_SERVICE_CHARGE';

export type BillingInterval = 'ONE_TIME' | 'MONTHLY' | 'QUARTERLY' | 'ANNUAL' | 'USAGE_METERED';

export type ProductAvailabilityStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED' | 'DISCONTINUED';

export interface TaxTreatmentReference {
  taxCode: 'VAT_IR_STANDARD_10' | 'TAX_EXEMPT' | 'MUNICIPAL_SERVICE_TAX';
  /** Tax rate in basis points (e.g., 1000 = 10.00%). Integer only. */
  rateBasisPoints: number;
  inclusive: boolean;
}

export interface ProductEligibilityConditions {
  eligibleAccountTypes: EligibleAccountType[];
  requiresVerifiedIdentity: boolean;
  requiresBrokerageLicense: boolean;
  allowedCityIds?: string[];
}

export interface PricingVersionRecord {
  pricingVersionId: string;
  productId: string;
  versionNumber: number;
  currency: BillingCurrency;
  /** Exact integer amount in currency minor/base units (no floating point). */
  unitAmountMinor: number;
  billingInterval: BillingInterval;
  includedUsageUnits?: number;
  overageUnitAmountMinor?: number;
  taxTreatment: TaxTreatmentReference;
  effectiveFromIso: string;
  effectiveToIso: string | null;
  createdByUid: string;
  createdAtIso: string;
}

export interface BillingProductRecord {
  productId: string;
  code: string;
  name: string;
  description: string;
  category: BillingCategory;
  activePricingVersionId: string;
  currency: BillingCurrency;
  billingInterval: BillingInterval;
  availabilityStatus: ProductAvailabilityStatus;
  eligibility: ProductEligibilityConditions;
  entitlementPolicyId: string | null;
  pricingVersionIds: string[];
  revision: number;
  createdAtIso: string;
  updatedAtIso: string;
}

// ============================================================================
// 3 & 4. PAYMENT INTENT, ORCHESTRATION & PROVIDER INTEGRATION
// ============================================================================

export type PaymentIntentStatus =
  | 'CREATED'
  | 'INITIATED'
  | 'REQUIRES_ACTION'
  | 'PROCESSING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'CANCELED'
  | 'EXPIRED'
  | 'PARTIALLY_REFUNDED'
  | 'REFUNDED';

export type PaymentPurposeType =
  | 'PRODUCT_PURCHASE'
  | 'SUBSCRIPTION_INITIAL'
  | 'SUBSCRIPTION_RENEWAL'
  | 'SUBSCRIPTION_UPGRADE'
  | 'USAGE_SETTLEMENT'
  | 'COMMISSION_SERVICE_FEE'
  | 'ADMINISTRATIVE_CHARGE';

export type ProviderErrorCategory =
  | 'NONE'
  | 'PROVIDER_TIMEOUT'
  | 'PROVIDER_UNAVAILABLE'
  | 'SIGNATURE_INVALID'
  | 'PAYMENT_DECLINED'
  | 'INSUFFICIENT_FUNDS'
  | 'INVALID_REQUEST'
  | 'UNKNOWN_PROVIDER_ERROR';

export interface PaymentPurposeReference {
  purposeType: PaymentPurposeType;
  productId: string;
  pricingVersionId: string;
  quantity: number;
  listingId?: string | null;
  subscriptionId?: string | null;
  transactionDealId?: string | null;
  brokerageCommissionRefId?: string | null;
  usagePeriodKey?: string | null;
}

export interface PaymentHistoryEntry {
  eventId: string;
  fromStatus: PaymentIntentStatus | null;
  toStatus: PaymentIntentStatus;
  actorUid: string;
  providerEventRef?: string | null;
  reason: string;
  timestampIso: string;
}

export interface PaymentIntentRecord {
  paymentIntentId: string;
  payerUid: string;
  organizationId: string | null;
  invoiceId: string;
  providerId: string;
  purpose: PaymentPurposeReference;
  currency: BillingCurrency;
  subtotalAmountMinor: number;
  discountAmountMinor: number;
  taxAmountMinor: number;
  totalAmountMinor: number;
  refundedAmountMinor: number;
  appliedCouponCode: string | null;
  status: PaymentIntentStatus;
  providerTransactionRef: string | null;
  providerCheckoutUrl: string | null;
  providerFeeMinor: number;
  lastErrorCategory: ProviderErrorCategory;
  lastErrorMessage: string | null;
  ledgerObligationPostId: string | null;
  ledgerRevenuePostId: string | null;
  refundIds: string[];
  idempotencyKey: string;
  expiresAtIso: string;
  confirmedAtIso: string | null;
  failedAtIso: string | null;
  canceledAtIso: string | null;
  revision: number;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface PaymentProviderConfigReference {
  providerId: string;
  displayName: string;
  supportedCurrencies: BillingCurrency[];
  secretEnvKeyName: string;
  webhookSecretEnvKeyName: string;
  timeoutMs: number;
  maxRetries: number;
  availabilityStatus: 'AVAILABLE' | 'DEGRADED' | 'MAINTENANCE' | 'DISABLED';
  updatedAtIso: string;
}

export interface ProviderInitiatePaymentResponse {
  ok: boolean;
  providerTransactionRef?: string;
  checkoutUrl?: string;
  providerFeeMinor?: number;
  errorCategory?: ProviderErrorCategory;
  errorMessage?: string;
}

export interface ProviderWebhookPayload {
  providerId: string;
  webhookEventId: string;
  paymentIntentId: string;
  providerTransactionRef: string;
  eventStatus: 'SUCCEEDED' | 'FAILED' | 'CANCELED';
  paidAmountMinor: number;
  currency: BillingCurrency;
  providerFeeMinor?: number;
  failureCategory?: ProviderErrorCategory;
  failureReason?: string;
  occurredAtIso: string;
  rawSignature: string;
}

export interface PaymentProviderAdapter {
  readonly providerId: string;
  initiatePayment(params: {
    paymentIntentId: string;
    amountMinor: number;
    currency: BillingCurrency;
    idempotencyKey: string;
    callbackUrl: string;
  }): Promise<ProviderInitiatePaymentResponse>;
  verifyWebhookSignature(payload: Omit<ProviderWebhookPayload, 'rawSignature'>, signature: string): boolean;
  requestRefund(params: {
    paymentIntentId: string;
    providerTransactionRef: string;
    refundId: string;
    amountMinor: number;
    currency: BillingCurrency;
    idempotencyKey: string;
  }): Promise<{
    ok: boolean;
    providerRefundRef?: string;
    errorCategory?: ProviderErrorCategory;
    errorMessage?: string;
  }>;
  queryTransactionStatus(providerTransactionRef: string): Promise<{
    found: boolean;
    providerTransactionRef: string;
    status: 'SUCCEEDED' | 'FAILED' | 'PENDING' | 'REFUNDED';
    amountMinor: number;
    currency: BillingCurrency;
  }>;
}

// ============================================================================
// 5. EMPLOYEE 54 FINANCIAL LEDGER INTEGRATION
// ============================================================================

export type LedgerPostingType =
  | 'CUSTOMER_PAYMENT_OBLIGATION'
  | 'PLATFORM_SERVICE_REVENUE'
  | 'BROKERAGE_RELATED_CHARGE'
  | 'COMMISSION_SETTLEMENT_REFERENCE'
  | 'PAYMENT_PROCESSING_FEE'
  | 'TAX_LIABILITY'
  | 'REFUND_REVERSAL'
  | 'FINANCIAL_ADJUSTMENT'
  | 'PROVIDER_SETTLEMENT';

export interface LedgerPostingEntry {
  ledgerPostingId: string;
  idempotencyKey: string;
  postingType: LedgerPostingType;
  accountOwnerUid: string;
  organizationId: string | null;
  sourceDomain: 'MARKETPLACE_BILLING';
  sourceRecordId: string;
  invoiceId: string | null;
  paymentIntentId: string | null;
  refundId: string | null;
  reversesLedgerPostingId: string | null;
  currency: BillingCurrency;
  /** Positive integer minor units. Direction is explicit via debitAccount / creditAccount. */
  amountMinor: number;
  debitAccountCode: string;
  creditAccountCode: string;
  description: string;
  metadata: Record<string, unknown>;
  postedAtIso: string;
}

export interface AuthoritativeFinancialLedgerAdapter {
  postLedgerEntry(request: Omit<LedgerPostingEntry, 'ledgerPostingId' | 'postedAtIso'>): Promise<LedgerPostingEntry>;
  getLedgerEntryById(ledgerPostingId: string): Promise<LedgerPostingEntry | null>;
  listLedgerEntriesBySource(sourceRecordId: string): Promise<LedgerPostingEntry[]>;
  listAllBillingLedgerEntries(): Promise<LedgerPostingEntry[]>;
}

// ============================================================================
// 6 & 7. SUBSCRIPTIONS & CENTRALIZED ENTITLEMENT SERVICE
// ============================================================================

export type SubscriptionStatus =
  | 'PENDING_INITIAL_PAYMENT'
  | 'ACTIVE'
  | 'PAST_DUE'
  | 'PAUSED'
  | 'CANCELED'
  | 'EXPIRED';

export interface MarketplaceSubscriptionRecord {
  subscriptionId: string;
  subscriberUid: string;
  organizationId: string | null;
  accountType: EligibleAccountType;
  productId: string;
  pricingVersionId: string;
  entitlementPolicyId: string;
  status: SubscriptionStatus;
  billingInterval: BillingInterval;
  currentPeriodStartIso: string;
  currentPeriodEndIso: string;
  gracePeriodEndsAtIso: string | null;
  cancelAtPeriodEnd: boolean;
  pausedAtIso: string | null;
  canceledAtIso: string | null;
  expiredAtIso: string | null;
  failedRenewalCount: number;
  lastPaymentIntentId: string | null;
  lastInvoiceId: string | null;
  revision: number;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface SubscriptionHistoryEntryRecord {
  historyId: string;
  subscriptionId: string;
  action:
    | 'CREATED'
    | 'ACTIVATED'
    | 'RENEWED'
    | 'UPGRADED'
    | 'DOWNGRADED'
    | 'PAUSED'
    | 'RESUMED'
    | 'RENEWAL_FAILED'
    | 'CANCELED'
    | 'EXPIRED';
  fromStatus: SubscriptionStatus | null;
  toStatus: SubscriptionStatus;
  fromProductId?: string | null;
  toProductId?: string | null;
  actorUid: string;
  reason: string;
  timestampIso: string;
}

export type BillableFeatureKey =
  | 'PUBLISH_STANDARD_LISTING'
  | 'PUBLISH_FEATURED_LISTING'
  | 'PROMOTE_LISTING_BOOST'
  | 'BROKERAGE_TEAM_SEATS'
  | 'PROFESSIONAL_ANALYTICS_PRO'
  | 'PROPERTY_MANAGEMENT_PORTAL'
  | 'API_VALUATION_CALL'
  | 'BULK_DATA_EXPORT';

export interface EntitlementPolicyRecord {
  policyId: string;
  name: string;
  policyVersion: number;
  featureKeys: BillableFeatureKey[];
  maxActiveListings: number;
  maxFeaturedListings: number;
  maxBrokerageAgentSeats: number;
  monthlyUsageQuotaByFeature: Partial<Record<BillableFeatureKey, number>>;
  active: boolean;
  createdAtIso: string;
  updatedAtIso: string;
}

export type EntitlementSourceType =
  | 'SUBSCRIPTION'
  | 'ONE_TIME_PURCHASE'
  | 'TEMPORARY_PROMOTION'
  | 'ADMINISTRATIVE_GRANT';

export interface EntitlementGrantRecord {
  grantId: string;
  ownerUid: string;
  organizationId: string | null;
  sourceType: EntitlementSourceType;
  sourceReferenceId: string;
  policyId: string;
  policyVersion: number;
  featureKeys: BillableFeatureKey[];
  maxActiveListings: number;
  maxFeaturedListings: number;
  maxBrokerageAgentSeats: number;
  status: 'ACTIVE' | 'EXPIRED' | 'REVOKED';
  grantedByUid: string;
  grantReason: string;
  revokedByUid: string | null;
  revocationReason: string | null;
  effectiveFromIso: string;
  expiresAtIso: string | null;
  revokedAtIso: string | null;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface EntitlementAccessDecision {
  allowed: boolean;
  featureKey: BillableFeatureKey;
  ownerUid: string;
  organizationId: string | null;
  effectiveGrantIds: string[];
  policyVersion: number;
  aggregatedMaxActiveListings: number;
  aggregatedMaxFeaturedListings: number;
  aggregatedMaxBrokerageAgentSeats: number;
  expiresAtIso: string | null;
  denialReason?: string;
}

// ============================================================================
// 8. INVOICING, RECEIPTS & CREDIT NOTES
// ============================================================================

export type InvoiceStatus =
  | 'DRAFT'
  | 'ISSUED'
  | 'PAID'
  | 'VOIDED'
  | 'CREDITED'
  | 'PARTIALLY_REFUNDED'
  | 'REFUNDED'
  | 'OVERDUE';

export interface InvoiceLineItem {
  lineItemId: string;
  productId: string;
  pricingVersionId: string;
  description: string;
  quantity: number;
  unitAmountMinor: number;
  subtotalMinor: number;
  discountMinor: number;
  taxRateBasisPoints: number;
  taxMinor: number;
  totalMinor: number;
}

export interface MarketplaceInvoiceRecord {
  invoiceId: string;
  invoiceNumber: string;
  customerUid: string;
  organizationId: string | null;
  subscriptionId: string | null;
  paymentIntentId: string | null;
  currency: BillingCurrency;
  lineItems: InvoiceLineItem[];
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  totalMinor: number;
  amountPaidMinor: number;
  amountRefundedMinor: number;
  appliedCouponCode: string | null;
  taxTreatmentSummary: string;
  status: InvoiceStatus;
  invoiceDocumentId: string | null;
  creditNoteIds: string[];
  refundIds: string[];
  issuedAtIso: string;
  dueDateIso: string;
  paidAtIso: string | null;
  voidedAtIso: string | null;
  cancellationReason: string | null;
  revision: number;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface CreditNoteRecord {
  creditNoteId: string;
  creditNoteNumber: string;
  invoiceId: string;
  customerUid: string;
  organizationId: string | null;
  refundId: string | null;
  currency: BillingCurrency;
  subtotalReversedMinor: number;
  taxReversedMinor: number;
  totalCreditedMinor: number;
  reason: string;
  creditNoteDocumentId: string | null;
  issuedByUid: string;
  issuedAtIso: string;
}

// ============================================================================
// 9. REFUNDS & FINANCIAL ADJUSTMENTS
// ============================================================================

export type RefundStatus =
  | 'REQUESTED'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'PROVIDER_PROCESSING'
  | 'COMPLETED'
  | 'FAILED'
  | 'REJECTED';

export interface RefundRequestRecord {
  refundId: string;
  paymentIntentId: string;
  invoiceId: string;
  requesterUid: string;
  organizationId: string | null;
  currency: BillingCurrency;
  requestedAmountMinor: number;
  isFullRefund: boolean;
  reasonCode:
    | 'DUPLICATE_CHARGE'
    | 'SERVICE_NOT_DELIVERED'
    | 'LISTING_REJECTED_BY_MODERATION'
    | 'CUSTOMER_CANCELLATION_WITHIN_POLICY'
    | 'BILLING_ERROR'
    | 'ADMINISTRATIVE_ADJUSTMENT';
  reasonDetails: string;
  requiresAdminApproval: boolean;
  approvedByAdminUid: string | null;
  rejectedByAdminUid: string | null;
  adminDecisionNote: string | null;
  status: RefundStatus;
  providerRefundRef: string | null;
  ledgerReversalPostingId: string | null;
  creditNoteId: string | null;
  failureReason: string | null;
  idempotencyKey: string;
  completedAtIso: string | null;
  revision: number;
  createdAtIso: string;
  updatedAtIso: string;
}

// ============================================================================
// 10. MARKETPLACE REVENUE & COMMISSION REFERENCES
// ============================================================================

export interface CommissionBillingReferenceRecord {
  referenceId: string;
  transactionDealId: string;
  brokerageId: string;
  agentUid: string;
  authoritativeCommissionCalculationId: string;
  authoritativeGrossCommissionMinor: number;
  platformServiceChargeMinor: number;
  currency: BillingCurrency;
  invoiceId: string;
  paymentIntentId: string | null;
  createdAtIso: string;
}

// ============================================================================
// 11. DISCOUNTS, COUPONS & PROMOTIONS
// ============================================================================

export type DiscountType = 'FIXED_AMOUNT' | 'PERCENTAGE_BPS';

export interface CouponDefinitionRecord {
  couponId: string;
  code: string;
  name: string;
  discountType: DiscountType;
  /** Fixed minor units if FIXED_AMOUNT, or basis points (1-10000) if PERCENTAGE_BPS. */
  discountValue: number;
  currency: BillingCurrency | null;
  maxRedemptions: number;
  currentRedemptionsCount: number;
  perUserLimit: number;
  minimumPurchaseMinor: number;
  eligibleAccountTypes: EligibleAccountType[];
  allowedOrganizationIds: string[];
  restrictedProductIds: string[];
  stackable: boolean;
  status: 'ACTIVE' | 'EXPIRED' | 'REVOKED';
  startsAtIso: string;
  expiresAtIso: string;
  createdByUid: string;
  revokedByUid: string | null;
  revokedAtIso: string | null;
  revision: number;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface CouponRedemptionRecord {
  redemptionId: string;
  couponId: string;
  couponCode: string;
  userUid: string;
  organizationId: string | null;
  invoiceId: string;
  paymentIntentId: string;
  discountAppliedMinor: number;
  currency: BillingCurrency;
  redeemedAtIso: string;
}

// ============================================================================
// 12. USAGE-BASED BILLING
// ============================================================================

export interface UsageBillingEventRecord {
  usageEventId: string;
  idempotencyKey: string;
  ownerUid: string;
  organizationId: string | null;
  featureKey: BillableFeatureKey;
  productId: string;
  pricingVersionId: string;
  billingPeriodKey: string; // e.g. "2026-11"
  quantity: number;
  unitPriceMinor: number;
  totalChargeMinor: number;
  currency: BillingCurrency;
  billingDisclosureAccepted: boolean;
  settledInvoiceId: string | null;
  correctionOfUsageEventId: string | null;
  correctionReason: string | null;
  recordedAtIso: string;
}

export interface UsageBillingSummaryView {
  ownerUid: string;
  organizationId: string | null;
  billingPeriodKey: string;
  currency: BillingCurrency;
  featureTotals: Array<{
    featureKey: BillableFeatureKey;
    productId: string;
    totalQuantity: number;
    includedQuota: number;
    billableQuantity: number;
    estimatedChargeMinor: number;
  }>;
  totalEstimatedChargeMinor: number;
  unbilledEventIds: string[];
}

// ============================================================================
// 13. FINANCIAL RECONCILIATION
// ============================================================================

export type ReconciliationMismatchType =
  | 'MISSING_IN_LEDGER'
  | 'MISSING_IN_PROVIDER'
  | 'MISSING_IN_INTERNAL_INTENTS'
  | 'AMOUNT_MISMATCH'
  | 'CURRENCY_MISMATCH'
  | 'DUPLICATE_PROVIDER_TRANSACTION'
  | 'UNRECORDED_REFUND';

export interface ProviderSettlementRecordInput {
  providerId: string;
  providerTransactionRef: string;
  paymentIntentId?: string;
  amountMinor: number;
  currency: BillingCurrency;
  status: 'SETTLED' | 'REFUNDED';
  settledAtIso: string;
}

export interface ReconciliationExceptionRecord {
  exceptionId: string;
  batchId: string;
  mismatchType: ReconciliationMismatchType;
  paymentIntentId: string | null;
  providerTransactionRef: string | null;
  invoiceId: string | null;
  ledgerPostingId: string | null;
  expectedAmountMinor: number | null;
  actualAmountMinor: number | null;
  currency: BillingCurrency | null;
  details: string;
  status: 'OPEN' | 'UNDER_REVIEW' | 'RESOLVED_BY_ADJUSTMENT' | 'DISMISSED_WITH_EXPLANATION';
  resolutionAdjustmentPostingId: string | null;
  resolutionNote: string | null;
  resolvedByAdminUid: string | null;
  resolvedAtIso: string | null;
  createdAtIso: string;
}

export interface ReconciliationBatchRecord {
  batchId: string;
  providerId: string;
  periodStartIso: string;
  periodEndIso: string;
  totalProviderRecordsChecked: number;
  totalInternalIntentsChecked: number;
  totalLedgerPostingsChecked: number;
  matchedCount: number;
  exceptionCount: number;
  exceptionIds: string[];
  status: 'COMPLETED_CLEAN' | 'COMPLETED_WITH_EXCEPTIONS';
  executedByUid: string;
  executedAtIso: string;
}

// ============================================================================
// 1, 17. CROSS-MODULE ADAPTERS & DOMAIN EVENTS
// ============================================================================

export interface FinancialDocumentManagementAdapter {
  generateAndStoreFinancialDocument(params: {
    ownerUid: string;
    organizationId: string | null;
    documentType: 'INVOICE_PDF_ARTIFACT' | 'CREDIT_NOTE_PDF_ARTIFACT' | 'PAYMENT_RECEIPT_ARTIFACT';
    referenceNumber: string;
    payload: Record<string, unknown>;
  }): Promise<{ documentId: string; downloadPath: string }>;
  getFinancialDocumentMetadata(
    documentId: string,
    requesterUid: string,
    isAdmin: boolean,
  ): Promise<{
    exists: boolean;
    accessible: boolean;
    documentId: string;
    referenceNumber?: string;
    documentType?: string;
    downloadPath?: string;
  }>;
}

export interface CustomerAndOrganizationDirectoryAdapter {
  getCustomerBillingEligibility(
    uid: string,
    organizationId?: string | null,
  ): Promise<{
    exists: boolean;
    accountActive: boolean;
    accountType: EligibleAccountType;
    identityVerified: boolean;
    brokerageLicenseVerified: boolean;
    memberOfOrganization: boolean;
    primaryCityId: string;
  }>;
}

export interface BrokerageAndCommissionReferenceAdapter {
  getAuthoritativeCommissionRecord(params: {
    transactionDealId: string;
    brokerageId: string;
  }): Promise<{
    exists: boolean;
    calculationId: string;
    transactionDealId: string;
    brokerageId: string;
    agentUid: string;
    grossCommissionMinor: number;
    platformServiceFeeMinor: number;
    currency: BillingCurrency;
  }>;
}

export interface BillingNotificationAdapter {
  sendCustomerBillingNotification(params: {
    recipientUid: string;
    eventType:
      | 'PAYMENT_SUCCEEDED'
      | 'PAYMENT_FAILED'
      | 'INVOICE_ISSUED'
      | 'REFUND_COMPLETED'
      | 'SUBSCRIPTION_ACTIVATED'
      | 'SUBSCRIPTION_PAST_DUE'
      | 'SUBSCRIPTION_EXPIRED';
    title: string;
    body: string;
    referenceId: string;
    idempotencyKey: string;
  }): Promise<{ delivered: boolean; notificationId: string | null }>;
}

export type MarketplaceBillingDomainEventType =
  | 'billing.payment.initiated'
  | 'billing.payment.confirmed'
  | 'billing.payment.failed'
  | 'billing.refund.initiated'
  | 'billing.refund.completed'
  | 'billing.subscription.activated'
  | 'billing.subscription.renewed'
  | 'billing.subscription.expired'
  | 'billing.entitlement.changed'
  | 'billing.invoice.created'
  | 'billing.coupon.redeemed'
  | 'billing.reconciliation.completed';

export interface MarketplaceBillingDomainEvent {
  eventId: string;
  eventType: MarketplaceBillingDomainEventType;
  actorUid: string;
  targetUid: string;
  resourceId: string;
  correlationId: string;
  payload: Record<string, unknown>;
  occurredAtIso: string;
}

export interface MarketplaceBillingModuleDependencies {
  tokenVerifier: FirebaseTokenVerifierAdapter;
  adminStore: DelegatedAdminStoreAdapter;
  txRunner: TransactionRunnerAdapter;
  auditSink: AuditEventSink;
  idempotencyStore?: IdempotencyStoreAdapter;
  primaryAdminEmails?: string[];
  ledgerAdapter?: AuthoritativeFinancialLedgerAdapter;
  documentAdapter?: FinancialDocumentManagementAdapter;
  directoryAdapter?: CustomerAndOrganizationDirectoryAdapter;
  commissionAdapter?: BrokerageAndCommissionReferenceAdapter;
  notificationAdapter?: BillingNotificationAdapter;
  providerAdapters?: PaymentProviderAdapter[];
  onDomainEvent?: (event: MarketplaceBillingDomainEvent) => Promise<void> | void;
}
