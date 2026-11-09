import {
  CoreApiError,
  requireEnumValue,
  requireFiniteNumberInRange,
  requireNonEmptyString,
  requireSafeFirestoreId,
  validateObjectSchema,
  type FieldValidator,
  type ValidationResult,
} from '../core';
import type {
  BusinessModuleOrigin,
  PaymentLifecycleStatus,
  RefundLifecycleStatus,
  SettlementBatchStatus,
  SupportedPaymentCurrency,
  WalletOwnerType,
} from './types';

export const VALID_PAYMENT_CURRENCIES: readonly SupportedPaymentCurrency[] = ['IRT', 'IRR'];
export const VALID_BUSINESS_MODULES: readonly BusinessModuleOrigin[] = [
  'sponsors',
  'property_services',
  'subscriptions',
  'listings',
  'marketplace',
  'wallet',
];
export const VALID_WALLET_OWNER_TYPES: readonly WalletOwnerType[] = [
  'user',
  'agency',
  'service_provider',
];

const PAYMENT_TRANSITIONS: Record<PaymentLifecycleStatus, readonly PaymentLifecycleStatus[]> = {
  created: ['pending', 'cancelled', 'expired'],
  pending: ['redirect_required', 'processing', 'succeeded', 'failed', 'expired', 'cancelled'],
  redirect_required: ['processing', 'succeeded', 'failed', 'expired', 'cancelled'],
  processing: ['succeeded', 'failed'],
  succeeded: ['refund_pending', 'partially_refunded', 'refunded', 'disputed'],
  refund_pending: ['partially_refunded', 'refunded', 'succeeded'],
  partially_refunded: ['refund_pending', 'refunded', 'disputed'],
  disputed: ['succeeded', 'refunded'],
  failed: [],
  cancelled: [],
  expired: [],
  refunded: [],
};

const REFUND_TRANSITIONS: Record<RefundLifecycleStatus, readonly RefundLifecycleStatus[]> = {
  requested: ['authorized', 'cancelled'],
  authorized: ['executing', 'cancelled'],
  executing: ['succeeded', 'failed'],
  succeeded: [],
  failed: [],
  cancelled: [],
};

const SETTLEMENT_TRANSITIONS: Record<SettlementBatchStatus, readonly SettlementBatchStatus[]> = {
  pending: ['eligible', 'on_hold'],
  eligible: ['reserved', 'on_hold'],
  reserved: ['processing', 'eligible'],
  processing: ['paid', 'failed'],
  paid: ['reversed'],
  failed: ['eligible', 'on_hold'],
  reversed: [],
  on_hold: ['pending', 'eligible'],
};

export function validatePaymentTransition(
  current: PaymentLifecycleStatus,
  target: PaymentLifecycleStatus,
): { allowed: boolean; reason?: string } {
  if (current === target) {
    return { allowed: true };
  }
  const allowedNext = PAYMENT_TRANSITIONS[current] ?? [];
  if (!allowedNext.includes(target)) {
    return {
      allowed: false,
      reason: `Illegal payment status transition from "${current}" to "${target}".`,
    };
  }
  return { allowed: true };
}

export function validateRefundTransition(
  current: RefundLifecycleStatus,
  target: RefundLifecycleStatus,
): { allowed: boolean; reason?: string } {
  if (current === target) {
    return { allowed: true };
  }
  const allowedNext = REFUND_TRANSITIONS[current] ?? [];
  if (!allowedNext.includes(target)) {
    return {
      allowed: false,
      reason: `Illegal refund status transition from "${current}" to "${target}".`,
    };
  }
  return { allowed: true };
}

export function validateSettlementTransition(
  current: SettlementBatchStatus,
  target: SettlementBatchStatus,
): { allowed: boolean; reason?: string } {
  if (current === target) {
    return { allowed: true };
  }
  const allowedNext = SETTLEMENT_TRANSITIONS[current] ?? [];
  if (!allowedNext.includes(target)) {
    return {
      allowed: false,
      reason: `Illegal settlement status transition from "${current}" to "${target}".`,
    };
  }
  return { allowed: true };
}

export function requirePositiveIntegerAmount(options?: {
  min?: number;
  max?: number;
}): FieldValidator<number> {
  const min = options?.min ?? 1;
  const max = options?.max ?? 100_000_000_000;
  return (rawValue: unknown, fieldName: string): ValidationResult<number> => {
    if (typeof rawValue !== 'number' || !Number.isFinite(rawValue)) {
      return {
        ok: false,
        issues: [{ field: fieldName, code: 'INVALID_TYPE', message: `${fieldName} must be a number.` }],
      };
    }
    if (!Number.isInteger(rawValue)) {
      return {
        ok: false,
        issues: [{ field: fieldName, code: 'INVALID_FORMAT', message: `${fieldName} must be an integer (no floats).` }],
      };
    }
    if (rawValue < min || rawValue > max) {
      return {
        ok: false,
        issues: [{ field: fieldName, code: 'NUMBER_OUT_OF_RANGE', message: `${fieldName} must be between ${min} and ${max}.` }],
      };
    }
    return { ok: true, value: rawValue, issues: [] };
  };
}

export interface CreatePaymentIntentRequest {
  businessModuleId: BusinessModuleOrigin;
  businessObjectId: string;
  description?: string;
  currency?: SupportedPaymentCurrency;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

export function validateCreatePaymentIntentRequest(
  raw: unknown,
): ValidationResult<CreatePaymentIntentRequest> {
  return validateObjectSchema<CreatePaymentIntentRequest>(
    raw,
    {
      businessModuleId: requireEnumValue(VALID_BUSINESS_MODULES),
      businessObjectId: requireSafeFirestoreId(),
      description: requireNonEmptyString({ minLength: 3, maxLength: 280 }),
      currency: requireEnumValue(VALID_PAYMENT_CURRENCIES),
    },
    {
      optionalFields: ['description', 'currency'],
      allowUnknownFields: false,
      rejectUntrustedIdentityFields: true,
    },
  );
}

export interface InitiateAttemptRequest {
  providerId?: string;
  callbackUrl?: string;
  [key: string]: unknown;
}

export function validateInitiateAttemptRequest(
  raw: unknown,
): ValidationResult<InitiateAttemptRequest> {
  return validateObjectSchema<InitiateAttemptRequest>(
    raw,
    {
      providerId: requireNonEmptyString({ minLength: 2, maxLength: 64 }),
      callbackUrl: requireNonEmptyString({ minLength: 10, maxLength: 500 }),
    },
    {
      optionalFields: ['providerId', 'callbackUrl'],
      allowUnknownFields: false,
      rejectUntrustedIdentityFields: true,
    },
  );
}

export interface RequestRefundInput {
  paymentIntentId: string;
  amount: number;
  reason: string;
  [key: string]: unknown;
}

export function validateRequestRefundInput(
  raw: unknown,
): ValidationResult<RequestRefundInput> {
  return validateObjectSchema<RequestRefundInput>(
    raw,
    {
      paymentIntentId: requireSafeFirestoreId(),
      amount: requirePositiveIntegerAmount(),
      reason: requireNonEmptyString({ minLength: 5, maxLength: 280 }),
    },
    {
      allowUnknownFields: false,
      rejectUntrustedIdentityFields: true,
    },
  );
}

export interface CreateSettlementBatchInput {
  payeeRef: string;
  payeeType: 'service_provider' | 'agency' | 'platform';
  periodStartIso: string;
  periodEndIso: string;
  grossAmount: number;
  commissionDeductions: number;
  refundDeductions: number;
  currency: SupportedPaymentCurrency;
  [key: string]: unknown;
}

export function validateCreateSettlementBatchInput(
  raw: unknown,
): ValidationResult<CreateSettlementBatchInput> {
  const res = validateObjectSchema<CreateSettlementBatchInput>(
    raw,
    {
      payeeRef: requireSafeFirestoreId(),
      payeeType: requireEnumValue(['service_provider', 'agency', 'platform'] as const),
      periodStartIso: requireNonEmptyString({ minLength: 10, maxLength: 40 }),
      periodEndIso: requireNonEmptyString({ minLength: 10, maxLength: 40 }),
      grossAmount: requirePositiveIntegerAmount(),
      commissionDeductions: requireFiniteNumberInRange({ min: 0, max: 100_000_000_000, integerOnly: true }),
      refundDeductions: requireFiniteNumberInRange({ min: 0, max: 100_000_000_000, integerOnly: true }),
      currency: requireEnumValue(VALID_PAYMENT_CURRENCIES),
    },
    {
      allowUnknownFields: false,
      rejectUntrustedIdentityFields: true,
    },
  );

  if (!res.ok || !res.value) {
    return res;
  }

  // Cross-field invariant: netPayable must be >= 0
  const net = res.value.grossAmount - res.value.commissionDeductions - res.value.refundDeductions;
  if (net < 0) {
    return {
      ok: false,
      issues: [
        {
          field: 'netPayableAmount',
          code: 'NUMBER_OUT_OF_RANGE',
          message: 'Deductions (commissions + refunds) cannot exceed gross amount.',
        },
      ],
    };
  }

  return res;
}

export function sanitizePaymentMetadata(
  raw: unknown,
): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {};
  }
  const input = raw as Record<string, unknown>;
  const clean: Record<string, unknown> = {};
  const BLOCKED_PATTERN = /(card|cvv|password|secret|token|bearer|pan|authorization)/i;

  for (const [key, val] of Object.entries(input)) {
    if (BLOCKED_PATTERN.test(key)) {
      continue;
    }
    if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
      clean[key] = val;
    }
  }
  return clean;
}
