/**
 * Employee 67 — Marketplace Billing Validation, Exact Integer Arithmetic & Security Guards
 * (`server/modules/marketplace-billing/validation.ts`)
 *
 * Exclusive ownership: `server/modules/marketplace-billing/`
 */

import {
  CoreApiError,
  sanitizeTextInput,
  UNTRUSTED_REQUEST_IDENTITY_FIELDS,
} from '../core';
import type {
  BillableFeatureKey,
  BillingCategory,
  BillingCurrency,
  BillingInterval,
  CouponDefinitionRecord,
  DiscountType,
  EligibleAccountType,
  InvoiceLineItem,
  PaymentPurposeType,
  ProductAvailabilityStatus,
  ProductEligibilityConditions,
  TaxTreatmentReference,
} from './types';

export const SUPPORTED_BILLING_CURRENCIES = new Set<BillingCurrency>([
  'IRT',
  'IRR',
  'USD',
  'EUR',
  'AED',
]);

export const SUPPORTED_BILLING_CATEGORIES = new Set<BillingCategory>([
  'PROPERTY_LISTING_PUBLICATION',
  'FEATURED_LISTING_PLACEMENT',
  'LISTING_PROMOTION',
  'BROKERAGE_SUBSCRIPTION_PLAN',
  'PROFESSIONAL_ACCOUNT_PLAN',
  'PROPERTY_MANAGEMENT_SERVICE_PLAN',
  'ADDITIONAL_MARKETPLACE_SERVICE',
  'USAGE_BASED_PLATFORM_SERVICE',
  'ADMINISTRATIVE_SERVICE_CHARGE',
]);

export const SUPPORTED_BILLING_INTERVALS = new Set<BillingInterval>([
  'ONE_TIME',
  'MONTHLY',
  'QUARTERLY',
  'ANNUAL',
  'USAGE_METERED',
]);

export const SUPPORTED_ACCOUNT_TYPES = new Set<EligibleAccountType>([
  'INDIVIDUAL',
  'PROFESSIONAL_AGENT',
  'BROKERAGE_ORGANIZATION',
  'PROPERTY_MANAGER',
  'DEVELOPER_ENTERPRISE',
]);

export const SUPPORTED_FEATURE_KEYS = new Set<BillableFeatureKey>([
  'PUBLISH_STANDARD_LISTING',
  'PUBLISH_FEATURED_LISTING',
  'PROMOTE_LISTING_BOOST',
  'BROKERAGE_TEAM_SEATS',
  'PROFESSIONAL_ANALYTICS_PRO',
  'PROPERTY_MANAGEMENT_PORTAL',
  'API_VALUATION_CALL',
  'BULK_DATA_EXPORT',
]);

export const SUPPORTED_PAYMENT_PURPOSE_TYPES = new Set<PaymentPurposeType>([
  'PRODUCT_PURCHASE',
  'SUBSCRIPTION_INITIAL',
  'SUBSCRIPTION_RENEWAL',
  'SUBSCRIPTION_UPGRADE',
  'USAGE_SETTLEMENT',
  'COMMISSION_SERVICE_FEE',
  'ADMINISTRATIVE_CHARGE',
]);

/**
 * Forbidden client fields on payment intent / checkout / subscription creation.
 * The server must derive authoritative billing amounts and statuses from validated product/pricing records
 * and must never accept raw payment credentials (card numbers, CVVs, PANs).
 */
export const FORBIDDEN_CLIENT_FINANCIAL_FIELDS = new Set<string>([
  ...UNTRUSTED_REQUEST_IDENTITY_FIELDS,
  'amount',
  'amountMinor',
  'unitAmountMinor',
  'subtotalAmountMinor',
  'discountAmountMinor',
  'taxAmountMinor',
  'totalAmountMinor',
  'status',
  'paymentStatus',
  'providerConfirmation',
  'providerTransactionRef',
  'entitlementStatus',
  'paidAtIso',
  'confirmedAtIso',
  'cardNumber',
  'pan',
  'cvv',
  'cvc',
  'cardExpiry',
  'pin',
]);

export function assertPlainObject(raw: unknown, contextLabel: string): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new CoreApiError('VALIDATION_FAILED', 400, `${contextLabel} must be a JSON object.`);
  }
  return raw as Record<string, unknown>;
}

export function rejectForbiddenClientFinancialFields(
  obj: Record<string, unknown>,
  additionalForbidden: string[] = [],
): void {
  const forbiddenSet = new Set([...FORBIDDEN_CLIENT_FINANCIAL_FIELDS, ...additionalForbidden]);
  for (const key of Object.keys(obj)) {
    if (forbiddenSet.has(key)) {
      throw new CoreApiError(
        'VALIDATION_FAILED',
        400,
        `Client payload contains untrusted or forbidden financial/credential field: ${key}`,
      );
    }
  }
}

export function assertSafeNonNegativeInteger(value: unknown, fieldName: string, max = 100_000_000_000): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > max) {
    throw new CoreApiError(
      'VALIDATION_FAILED',
      400,
      `${fieldName} must be an exact non-negative integer minor-unit amount (no floating-point decimals).`,
    );
  }
  return value;
}

export function assertSafePositiveInteger(value: unknown, fieldName: string, max = 100_000_000_000): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0 || value > max) {
    throw new CoreApiError(
      'VALIDATION_FAILED',
      400,
      `${fieldName} must be an exact positive integer (1..${max}).`,
    );
  }
  return value;
}

export function validateCurrency(raw: unknown, fieldName = 'currency'): BillingCurrency {
  if (typeof raw !== 'string' || !SUPPORTED_BILLING_CURRENCIES.has(raw as BillingCurrency)) {
    throw new CoreApiError(
      'VALIDATION_FAILED',
      400,
      `${fieldName} must be one of: ${Array.from(SUPPORTED_BILLING_CURRENCIES).join(', ')}`,
    );
  }
  return raw as BillingCurrency;
}

/**
 * Exact integer basis-point arithmetic (10,000 bps = 100%).
 * Uses BigInt to avoid any IEEE-754 floating-point precision loss or overflow,
 * with deterministic half-up integer rounding.
 */
export function calculateBasisPointsMinor(amountMinor: number, basisPoints: number): number {
  assertSafeNonNegativeInteger(amountMinor, 'amountMinor');
  assertSafeNonNegativeInteger(basisPoints, 'basisPoints', 100_000);
  if (amountMinor === 0 || basisPoints === 0) return 0;
  const product = BigInt(amountMinor) * BigInt(basisPoints);
  const rounded = (product + 5000n) / 10000n;
  return Number(rounded);
}

/**
 * Computes exact integer invoice line item and totals without floating-point arithmetic.
 */
export function computeInvoiceLineItemArithmetic(params: {
  lineItemId: string;
  productId: string;
  pricingVersionId: string;
  description: string;
  quantity: number;
  unitAmountMinor: number;
  discountMinor: number;
  taxTreatment: TaxTreatmentReference;
}): InvoiceLineItem {
  const quantity = assertSafePositiveInteger(params.quantity, 'quantity', 100_000);
  const unitAmountMinor = assertSafeNonNegativeInteger(params.unitAmountMinor, 'unitAmountMinor');
  const subtotalMinor = Number(BigInt(unitAmountMinor) * BigInt(quantity));
  const clampedDiscountMinor = Math.min(
    subtotalMinor,
    assertSafeNonNegativeInteger(params.discountMinor, 'discountMinor'),
  );
  const netBeforeTaxMinor = subtotalMinor - clampedDiscountMinor;

  let taxMinor = 0;
  let totalMinor = netBeforeTaxMinor;

  if (params.taxTreatment.rateBasisPoints > 0) {
    if (params.taxTreatment.inclusive) {
      // Inclusive tax: netBeforeTax = base + tax => tax = round(netBeforeTax * bps / (10000 + bps))
      const bps = BigInt(params.taxTreatment.rateBasisPoints);
      const denom = 10000n + bps;
      taxMinor = Number((BigInt(netBeforeTaxMinor) * bps + denom / 2n) / denom);
      totalMinor = netBeforeTaxMinor;
    } else {
      taxMinor = calculateBasisPointsMinor(netBeforeTaxMinor, params.taxTreatment.rateBasisPoints);
      totalMinor = netBeforeTaxMinor + taxMinor;
    }
  }

  return {
    lineItemId: params.lineItemId,
    productId: params.productId,
    pricingVersionId: params.pricingVersionId,
    description: params.description,
    quantity,
    unitAmountMinor,
    subtotalMinor,
    discountMinor: clampedDiscountMinor,
    taxRateBasisPoints: params.taxTreatment.rateBasisPoints,
    taxMinor,
    totalMinor,
  };
}

/**
 * Computes exact integer discount minor units for a validated coupon against a subtotal.
 */
export function computeCouponDiscountMinor(
  coupon: Pick<CouponDefinitionRecord, 'discountType' | 'discountValue' | 'currency'>,
  subtotalMinor: number,
  targetCurrency: BillingCurrency,
): number {
  assertSafeNonNegativeInteger(subtotalMinor, 'subtotalMinor');
  if (subtotalMinor === 0) return 0;

  if (coupon.discountType === 'FIXED_AMOUNT') {
    if (coupon.currency && coupon.currency !== targetCurrency) {
      throw new CoreApiError(
        'VALIDATION_FAILED',
        400,
        `Coupon currency (${coupon.currency}) does not match billing currency (${targetCurrency}).`,
      );
    }
    return Math.min(subtotalMinor, coupon.discountValue);
  }

  // PERCENTAGE_BPS
  const rawDiscount = calculateBasisPointsMinor(subtotalMinor, coupon.discountValue);
  return Math.min(subtotalMinor, rawDiscount);
}

export function validateCreateOrUpdateProductInput(raw: unknown): {
  code: string;
  name: string;
  description: string;
  category: BillingCategory;
  currency: BillingCurrency;
  unitAmountMinor: number;
  billingInterval: BillingInterval;
  availabilityStatus: ProductAvailabilityStatus;
  taxTreatment: TaxTreatmentReference;
  eligibility: ProductEligibilityConditions;
  entitlementPolicyId: string | null;
  includedUsageUnits?: number;
  overageUnitAmountMinor?: number;
  effectiveFromIso: string;
  effectiveToIso: string | null;
} {
  const obj = assertPlainObject(raw, 'BillingProduct');
  const code = sanitizeTextInput(String(obj.code ?? '')).toUpperCase();
  if (!/^[A-Z0-9_]{3,64}$/.test(code)) {
    throw new CoreApiError('VALIDATION_FAILED', 400, 'Product code must be 3..64 uppercase alphanumeric/underscore characters.');
  }
  const name = sanitizeTextInput(String(obj.name ?? ''));
  if (name.length < 3 || name.length > 140) {
    throw new CoreApiError('VALIDATION_FAILED', 400, 'Product name must be between 3 and 140 characters.');
  }
  const description = sanitizeTextInput(String(obj.description ?? name)).slice(0, 600);

  const category = obj.category as BillingCategory;
  if (!SUPPORTED_BILLING_CATEGORIES.has(category)) {
    throw new CoreApiError('VALIDATION_FAILED', 400, `Unsupported billing category: ${String(obj.category)}`);
  }

  const currency = validateCurrency(obj.currency);
  const unitAmountMinor = assertSafeNonNegativeInteger(obj.unitAmountMinor, 'unitAmountMinor');

  const billingInterval = obj.billingInterval as BillingInterval;
  if (!SUPPORTED_BILLING_INTERVALS.has(billingInterval)) {
    throw new CoreApiError('VALIDATION_FAILED', 400, `Unsupported billing interval: ${String(obj.billingInterval)}`);
  }

  const availabilityStatus = (obj.availabilityStatus ?? 'ACTIVE') as ProductAvailabilityStatus;
  if (!['DRAFT', 'ACTIVE', 'ARCHIVED', 'DISCONTINUED'].includes(availabilityStatus)) {
    throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid availabilityStatus.');
  }

  const rawTax = assertPlainObject(obj.taxTreatment ?? {
    taxCode: 'VAT_IR_STANDARD_10',
    rateBasisPoints: 1000,
    inclusive: false,
  }, 'taxTreatment');
  const taxCode = rawTax.taxCode as TaxTreatmentReference['taxCode'];
  if (!['VAT_IR_STANDARD_10', 'TAX_EXEMPT', 'MUNICIPAL_SERVICE_TAX'].includes(taxCode)) {
    throw new CoreApiError('VALIDATION_FAILED', 400, 'Unsupported taxCode.');
  }
  const rateBasisPoints = assertSafeNonNegativeInteger(rawTax.rateBasisPoints, 'taxTreatment.rateBasisPoints', 5000);
  if (taxCode === 'TAX_EXEMPT' && rateBasisPoints !== 0) {
    throw new CoreApiError('VALIDATION_FAILED', 400, 'TAX_EXEMPT tax treatment must have rateBasisPoints = 0.');
  }

  const rawElig = assertPlainObject(
    obj.eligibility ?? {
      eligibleAccountTypes: Array.from(SUPPORTED_ACCOUNT_TYPES),
      requiresVerifiedIdentity: false,
      requiresBrokerageLicense: false,
    },
    'eligibility',
  );
  const eligibleAccountTypes = Array.isArray(rawElig.eligibleAccountTypes)
    ? (rawElig.eligibleAccountTypes as EligibleAccountType[])
    : Array.from(SUPPORTED_ACCOUNT_TYPES);
  if (
    eligibleAccountTypes.length === 0 ||
    eligibleAccountTypes.some((t) => !SUPPORTED_ACCOUNT_TYPES.has(t))
  ) {
    throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid eligibleAccountTypes.');
  }

  const effectiveFromIso =
    typeof obj.effectiveFromIso === 'string' && !Number.isNaN(Date.parse(obj.effectiveFromIso))
      ? new Date(obj.effectiveFromIso).toISOString()
      : new Date().toISOString();
  const effectiveToIso =
    typeof obj.effectiveToIso === 'string' && !Number.isNaN(Date.parse(obj.effectiveToIso))
      ? new Date(obj.effectiveToIso).toISOString()
      : null;

  if (effectiveToIso && effectiveToIso <= effectiveFromIso) {
    throw new CoreApiError('VALIDATION_FAILED', 400, 'effectiveToIso must be after effectiveFromIso.');
  }

  return {
    code,
    name,
    description,
    category,
    currency,
    unitAmountMinor,
    billingInterval,
    availabilityStatus,
    taxTreatment: {
      taxCode,
      rateBasisPoints,
      inclusive: Boolean(rawTax.inclusive),
    },
    eligibility: {
      eligibleAccountTypes,
      requiresVerifiedIdentity: Boolean(rawElig.requiresVerifiedIdentity),
      requiresBrokerageLicense: Boolean(rawElig.requiresBrokerageLicense),
      allowedCityIds: Array.isArray(rawElig.allowedCityIds)
        ? rawElig.allowedCityIds.map((c) => sanitizeTextInput(String(c)))
        : undefined,
    },
    entitlementPolicyId:
      typeof obj.entitlementPolicyId === 'string' && sanitizeTextInput(obj.entitlementPolicyId)
        ? sanitizeTextInput(obj.entitlementPolicyId)
        : null,
    includedUsageUnits:
      obj.includedUsageUnits !== undefined
        ? assertSafeNonNegativeInteger(obj.includedUsageUnits, 'includedUsageUnits')
        : undefined,
    overageUnitAmountMinor:
      obj.overageUnitAmountMinor !== undefined
        ? assertSafeNonNegativeInteger(obj.overageUnitAmountMinor, 'overageUnitAmountMinor')
        : undefined,
    effectiveFromIso,
    effectiveToIso,
  };
}

export function validateCreateCouponInput(raw: unknown): {
  code: string;
  name: string;
  discountType: DiscountType;
  discountValue: number;
  currency: BillingCurrency | null;
  maxRedemptions: number;
  perUserLimit: number;
  minimumPurchaseMinor: number;
  eligibleAccountTypes: EligibleAccountType[];
  allowedOrganizationIds: string[];
  restrictedProductIds: string[];
  stackable: boolean;
  startsAtIso: string;
  expiresAtIso: string;
} {
  const obj = assertPlainObject(raw, 'Coupon');
  const code = sanitizeTextInput(String(obj.code ?? '')).toUpperCase();
  if (!/^[A-Z0-9_-]{3,40}$/.test(code)) {
    throw new CoreApiError('VALIDATION_FAILED', 400, 'Coupon code must be 3..40 uppercase alphanumeric characters.');
  }
  const name = sanitizeTextInput(String(obj.name ?? code)).slice(0, 120);
  const discountType = obj.discountType as DiscountType;
  if (discountType !== 'FIXED_AMOUNT' && discountType !== 'PERCENTAGE_BPS') {
    throw new CoreApiError('VALIDATION_FAILED', 400, 'discountType must be FIXED_AMOUNT or PERCENTAGE_BPS.');
  }
  const discountValue = assertSafePositiveInteger(
    obj.discountValue,
    'discountValue',
    discountType === 'PERCENTAGE_BPS' ? 10_000 : 100_000_000_000,
  );
  const currency =
    discountType === 'FIXED_AMOUNT'
      ? validateCurrency(obj.currency, 'currency')
      : obj.currency
        ? validateCurrency(obj.currency, 'currency')
        : null;

  const maxRedemptions = assertSafePositiveInteger(obj.maxRedemptions ?? 100, 'maxRedemptions', 1_000_000);
  const perUserLimit = assertSafePositiveInteger(obj.perUserLimit ?? 1, 'perUserLimit', 1000);
  const minimumPurchaseMinor = assertSafeNonNegativeInteger(obj.minimumPurchaseMinor ?? 0, 'minimumPurchaseMinor');

  const startsAtIso =
    typeof obj.startsAtIso === 'string' && !Number.isNaN(Date.parse(obj.startsAtIso))
      ? new Date(obj.startsAtIso).toISOString()
      : new Date(Date.now() - 60_000).toISOString();
  const expiresAtIso =
    typeof obj.expiresAtIso === 'string' && !Number.isNaN(Date.parse(obj.expiresAtIso))
      ? new Date(obj.expiresAtIso).toISOString()
      : new Date(Date.now() + 30 * 86_400_000).toISOString();

  if (expiresAtIso <= startsAtIso) {
    throw new CoreApiError('VALIDATION_FAILED', 400, 'Coupon expiresAtIso must be after startsAtIso.');
  }

  return {
    code,
    name,
    discountType,
    discountValue,
    currency,
    maxRedemptions,
    perUserLimit,
    minimumPurchaseMinor,
    eligibleAccountTypes: Array.isArray(obj.eligibleAccountTypes)
      ? (obj.eligibleAccountTypes as EligibleAccountType[])
      : Array.from(SUPPORTED_ACCOUNT_TYPES),
    allowedOrganizationIds: Array.isArray(obj.allowedOrganizationIds)
      ? obj.allowedOrganizationIds.map((id) => sanitizeTextInput(String(id)))
      : [],
    restrictedProductIds: Array.isArray(obj.restrictedProductIds)
      ? obj.restrictedProductIds.map((id) => sanitizeTextInput(String(id)))
      : [],
    stackable: Boolean(obj.stackable),
    startsAtIso,
    expiresAtIso,
  };
}
