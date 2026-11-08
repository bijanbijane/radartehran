import {
  normalizeFirestoreTimestamp,
  requireEnumValue,
  requireFiniteNumberInRange,
  requireNonEmptyString,
  requireSafeFirestoreId,
  validateObjectSchema,
  type FieldValidator,
  type ValidationIssue,
  type ValidationResult,
} from '../../core';
import {
  ALL_TRANSACTION_CURRENCIES,
  type TransactionCurrency,
} from '../types';
import {
  ALL_LEDGER_ACCOUNT_TYPES,
  ALL_LEDGER_ENTRY_TYPES,
  ALL_OBLIGATION_CATEGORIES,
  ALL_OBLIGATION_STATUSES,
  MAX_MONETARY_SAFE_INT,
  type CommissionCalculationMode,
  type FinancialDisputeStatus,
  type LedgerAccountType,
  type LedgerEntryType,
  type ObligationCategory,
  type ObligationStatus,
  type PaymentFailureClassification,
  type RentalFrequency,
  type SettlementObligationAllocation,
} from './types';

const FORBIDDEN_FINANCIAL_CLIENT_FIELDS: ReadonlySet<string> = new Set([
  'paymentConfirmed',
  'settlementCompleted',
  'ledgerBalance',
  'isAdmin',
  'adminOverride',
  'cardNumber',
  'cvv',
  'cvv2',
  'cardPin',
  'bankPassword',
  'ibanSecret',
]);

function checkForbiddenFinancialFields(rawInput: unknown): ValidationIssue[] {
  if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) {
    return [];
  }
  const issues: ValidationIssue[] = [];
  for (const key of Object.keys(rawInput as Record<string, unknown>)) {
    if (FORBIDDEN_FINANCIAL_CLIENT_FIELDS.has(key)) {
      issues.push({
        field: key,
        code: 'UNTRUSTED_IDENTITY_FIELD',
        message: `Field "${key}" is prohibited in financial ledger payloads (untrusted client state or prohibited sensitive credential).`,
      });
    }
  }
  return issues;
}

function requireIsoTimestamp(): FieldValidator<string> {
  return (rawValue: unknown, fieldName: string): ValidationResult<string> => {
    const normalized = normalizeFirestoreTimestamp(rawValue);
    if (!normalized) {
      return {
        ok: false,
        issues: [{ field: fieldName, code: 'INVALID_FORMAT', message: `${fieldName} must be a valid ISO-8601 timestamp.` }],
      };
    }
    return { ok: true, value: normalized.iso, issues: [] };
  };
}

export type CreateObligationInput = {
  obligationId?: string;
  category: ObligationCategory;
  title: string;
  amount: number;
  currency: TransactionCurrency;
  payerUid: string;
  payeeUid: string;
  dueDateIso: string;
  contractReferenceId?: string;
  initialStatus?: 'DRAFT' | 'PENDING';
};

export function validateCreateObligationInput(rawInput: unknown): ValidationResult<CreateObligationInput> {
  const forbidden = checkForbiddenFinancialFields(rawInput);
  if (forbidden.length > 0) return { ok: false, issues: forbidden };

  const base = validateObjectSchema<CreateObligationInput>(
    rawInput,
    {
      obligationId: requireSafeFirestoreId(),
      category: requireEnumValue(ALL_OBLIGATION_CATEGORIES),
      title: requireNonEmptyString({ minLength: 3, maxLength: 200 }),
      amount: requireFiniteNumberInRange({ min: 1, max: MAX_MONETARY_SAFE_INT, integerOnly: true }),
      currency: requireEnumValue(ALL_TRANSACTION_CURRENCIES),
      payerUid: requireSafeFirestoreId(),
      payeeUid: requireSafeFirestoreId(),
      dueDateIso: requireIsoTimestamp(),
      contractReferenceId: requireSafeFirestoreId(),
      initialStatus: requireEnumValue(['DRAFT', 'PENDING'] as const),
    },
    { optionalFields: ['obligationId', 'contractReferenceId', 'initialStatus'], rejectUntrustedIdentityFields: true },
  );

  if (!base.ok || !base.value) return base;
  if (base.value.payerUid === base.value.payeeUid) {
    return {
      ok: false,
      issues: [{ field: 'payeeUid', code: 'INVALID_FORMAT', message: 'payerUid and payeeUid must be distinct parties.' }],
    };
  }
  return base;
}

export type UpdateObligationInput = {
  targetStatus?: ObligationStatus;
  dueDateIso?: string;
  title?: string;
};

export function validateUpdateObligationInput(rawInput: unknown): ValidationResult<UpdateObligationInput> {
  const forbidden = checkForbiddenFinancialFields(rawInput);
  if (forbidden.length > 0) return { ok: false, issues: forbidden };

  return validateObjectSchema<UpdateObligationInput>(
    rawInput,
    {
      targetStatus: requireEnumValue(ALL_OBLIGATION_STATUSES),
      dueDateIso: requireIsoTimestamp(),
      title: requireNonEmptyString({ minLength: 3, maxLength: 200 }),
    },
    { optionalFields: ['targetStatus', 'dueDateIso', 'title'], rejectUntrustedIdentityFields: true },
  );
}

export type CreateLedgerPostingInput = {
  postingGroupId?: string;
  entryType: LedgerEntryType;
  debitAccount: LedgerAccountType;
  creditAccount: LedgerAccountType;
  amount: number;
  currency: TransactionCurrency;
  financialCategory: ObligationCategory;
  responsiblePartyUid: string;
  beneficiaryUid?: string;
  relatedObligationId?: string;
  relatedSettlementId?: string;
  note?: string;
};

export function validateCreateLedgerPostingInput(rawInput: unknown): ValidationResult<CreateLedgerPostingInput> {
  const forbidden = checkForbiddenFinancialFields(rawInput);
  if (forbidden.length > 0) return { ok: false, issues: forbidden };

  const base = validateObjectSchema<CreateLedgerPostingInput>(
    rawInput,
    {
      postingGroupId: requireSafeFirestoreId(),
      entryType: requireEnumValue(ALL_LEDGER_ENTRY_TYPES),
      debitAccount: requireEnumValue(ALL_LEDGER_ACCOUNT_TYPES),
      creditAccount: requireEnumValue(ALL_LEDGER_ACCOUNT_TYPES),
      amount: requireFiniteNumberInRange({ min: 1, max: MAX_MONETARY_SAFE_INT, integerOnly: true }),
      currency: requireEnumValue(ALL_TRANSACTION_CURRENCIES),
      financialCategory: requireEnumValue(ALL_OBLIGATION_CATEGORIES),
      responsiblePartyUid: requireSafeFirestoreId(),
      beneficiaryUid: requireSafeFirestoreId(),
      relatedObligationId: requireSafeFirestoreId(),
      relatedSettlementId: requireSafeFirestoreId(),
      note: requireNonEmptyString({ minLength: 2, maxLength: 400 }),
    },
    {
      optionalFields: [
        'postingGroupId',
        'beneficiaryUid',
        'relatedObligationId',
        'relatedSettlementId',
        'note',
      ],
      rejectUntrustedIdentityFields: true,
    },
  );

  if (!base.ok || !base.value) return base;
  if (base.value.debitAccount === base.value.creditAccount) {
    return {
      ok: false,
      issues: [
        {
          field: 'creditAccount',
          code: 'INVALID_ENUM_VALUE',
          message: 'Double-entry posting requires distinct debitAccount and creditAccount.',
        },
      ],
    };
  }
  return base;
}

export type ReverseLedgerPostingInput = {
  postingGroupId: string;
  reason: string;
  replacementAmount?: number;
};

export function validateReverseLedgerPostingInput(rawInput: unknown): ValidationResult<ReverseLedgerPostingInput> {
  const forbidden = checkForbiddenFinancialFields(rawInput);
  if (forbidden.length > 0) return { ok: false, issues: forbidden };

  return validateObjectSchema<ReverseLedgerPostingInput>(
    rawInput,
    {
      postingGroupId: requireSafeFirestoreId(),
      reason: requireNonEmptyString({ minLength: 3, maxLength: 500 }),
      replacementAmount: requireFiniteNumberInRange({ min: 1, max: MAX_MONETARY_SAFE_INT, integerOnly: true }),
    },
    { optionalFields: ['replacementAmount'], rejectUntrustedIdentityFields: true },
  );
}

export type CreatePaymentReferenceInput = {
  paymentRefId?: string;
  obligationId?: string;
  initiationReference: string;
  externalProviderName?: string;
  externalProviderRef?: string;
  amount: number;
  currency: TransactionCurrency;
  payerUid: string;
  payeeUid: string;
};

export function validateCreatePaymentReferenceInput(rawInput: unknown): ValidationResult<CreatePaymentReferenceInput> {
  const forbidden = checkForbiddenFinancialFields(rawInput);
  if (forbidden.length > 0) return { ok: false, issues: forbidden };

  return validateObjectSchema<CreatePaymentReferenceInput>(
    rawInput,
    {
      paymentRefId: requireSafeFirestoreId(),
      obligationId: requireSafeFirestoreId(),
      initiationReference: requireNonEmptyString({ minLength: 3, maxLength: 120 }),
      externalProviderName: requireNonEmptyString({ minLength: 2, maxLength: 64 }),
      externalProviderRef: requireNonEmptyString({ minLength: 2, maxLength: 120 }),
      amount: requireFiniteNumberInRange({ min: 1, max: MAX_MONETARY_SAFE_INT, integerOnly: true }),
      currency: requireEnumValue(ALL_TRANSACTION_CURRENCIES),
      payerUid: requireSafeFirestoreId(),
      payeeUid: requireSafeFirestoreId(),
    },
    {
      optionalFields: ['paymentRefId', 'obligationId', 'externalProviderName', 'externalProviderRef'],
      rejectUntrustedIdentityFields: true,
    },
  );
}

export type UpdatePaymentReferenceInput = {
  status: 'PENDING' | 'PROCESSING' | 'CONFIRMED' | 'FAILED' | 'CANCELLED';
  confirmationReference?: string;
  failureReasonClassification?: PaymentFailureClassification;
  failureDetail?: string;
};

export function validateUpdatePaymentReferenceInput(rawInput: unknown): ValidationResult<UpdatePaymentReferenceInput> {
  const forbidden = checkForbiddenFinancialFields(rawInput);
  if (forbidden.length > 0) return { ok: false, issues: forbidden };

  return validateObjectSchema<UpdatePaymentReferenceInput>(
    rawInput,
    {
      status: requireEnumValue(['PENDING', 'PROCESSING', 'CONFIRMED', 'FAILED', 'CANCELLED'] as const),
      confirmationReference: requireNonEmptyString({ minLength: 3, maxLength: 120 }),
      failureReasonClassification: requireEnumValue([
        'PROVIDER_TIMEOUT',
        'INSUFFICIENT_FUNDS',
        'REJECTED_BY_BANK',
        'SIGNATURE_MISMATCH',
        'AMOUNT_MISMATCH',
        'CANCELLED_BY_PAYER',
        'COMPLIANCE_HOLD',
        'OTHER',
      ] as const),
      failureDetail: requireNonEmptyString({ minLength: 2, maxLength: 400 }),
    },
    {
      optionalFields: ['confirmationReference', 'failureReasonClassification', 'failureDetail'],
      rejectUntrustedIdentityFields: true,
    },
  );
}

export type CreateSettlementInput = {
  settlementId?: string;
  allocations: SettlementObligationAllocation[];
  currency: TransactionCurrency;
  payerUid: string;
  payeeUid: string;
  paymentRefId?: string;
};

export function validateCreateSettlementInput(rawInput: unknown): ValidationResult<CreateSettlementInput> {
  const forbidden = checkForbiddenFinancialFields(rawInput);
  if (forbidden.length > 0) return { ok: false, issues: forbidden };

  return validateObjectSchema<CreateSettlementInput>(
    rawInput,
    {
      settlementId: requireSafeFirestoreId(),
      allocations: (val, field) => {
        if (!Array.isArray(val) || val.length === 0 || val.length > 25) {
          return {
            ok: false,
            issues: [{ field, code: 'INVALID_TYPE', message: `${field} must be a non-empty array of 1..25 obligation allocations.` }],
          };
        }
        const items: SettlementObligationAllocation[] = [];
        const seenIds = new Set<string>();
        for (let i = 0; i < val.length; i++) {
          const item = val[i] as Record<string, unknown>;
          if (!item || typeof item !== 'object') {
            return { ok: false, issues: [{ field: `${field}[${i}]`, code: 'INVALID_TYPE', message: 'Invalid allocation object.' }] };
          }
          const obRes = requireSafeFirestoreId()(item.obligationId, `${field}[${i}].obligationId`);
          if (!obRes.ok || !obRes.value) return { ok: false, issues: obRes.issues };
          if (seenIds.has(obRes.value)) {
            return { ok: false, issues: [{ field: `${field}[${i}].obligationId`, code: 'INVALID_FORMAT', message: 'Duplicate obligationId in settlement allocations.' }] };
          }
          seenIds.add(obRes.value);
          const amtRes = requireFiniteNumberInRange({ min: 1, max: MAX_MONETARY_SAFE_INT, integerOnly: true })(
            item.allocatedAmount,
            `${field}[${i}].allocatedAmount`,
          );
          if (!amtRes.ok || amtRes.value === undefined) return { ok: false, issues: amtRes.issues };
          items.push({ obligationId: obRes.value, allocatedAmount: amtRes.value });
        }
        return { ok: true, value: items, issues: [] };
      },
      currency: requireEnumValue(ALL_TRANSACTION_CURRENCIES),
      payerUid: requireSafeFirestoreId(),
      payeeUid: requireSafeFirestoreId(),
      paymentRefId: requireSafeFirestoreId(),
    },
    { optionalFields: ['settlementId', 'paymentRefId'], rejectUntrustedIdentityFields: true },
  );
}

export type SettlementActionInput = {
  action: 'INITIATE' | 'CONFIRM' | 'FAIL' | 'CANCEL' | 'COMPLETE';
  paymentRefId?: string;
  confirmedAmount?: number;
  reason?: string;
};

export function validateSettlementActionInput(rawInput: unknown): ValidationResult<SettlementActionInput> {
  const forbidden = checkForbiddenFinancialFields(rawInput);
  if (forbidden.length > 0) return { ok: false, issues: forbidden };

  return validateObjectSchema<SettlementActionInput>(
    rawInput,
    {
      action: requireEnumValue(['INITIATE', 'CONFIRM', 'FAIL', 'CANCEL', 'COMPLETE'] as const),
      paymentRefId: requireSafeFirestoreId(),
      confirmedAmount: requireFiniteNumberInRange({ min: 1, max: MAX_MONETARY_SAFE_INT, integerOnly: true }),
      reason: requireNonEmptyString({ minLength: 2, maxLength: 500 }),
    },
    { optionalFields: ['paymentRefId', 'confirmedAmount', 'reason'], rejectUntrustedIdentityFields: true },
  );
}

export type CreateRefundInput = {
  refundId?: string;
  settlementId: string;
  obligationId: string;
  amount: number;
  currency: TransactionCurrency;
  reason: string;
};

export function validateCreateRefundInput(rawInput: unknown): ValidationResult<CreateRefundInput> {
  const forbidden = checkForbiddenFinancialFields(rawInput);
  if (forbidden.length > 0) return { ok: false, issues: forbidden };

  return validateObjectSchema<CreateRefundInput>(
    rawInput,
    {
      refundId: requireSafeFirestoreId(),
      settlementId: requireSafeFirestoreId(),
      obligationId: requireSafeFirestoreId(),
      amount: requireFiniteNumberInRange({ min: 1, max: MAX_MONETARY_SAFE_INT, integerOnly: true }),
      currency: requireEnumValue(ALL_TRANSACTION_CURRENCIES),
      reason: requireNonEmptyString({ minLength: 3, maxLength: 500 }),
    },
    { optionalFields: ['refundId'], rejectUntrustedIdentityFields: true },
  );
}

export type RefundDecisionInput = {
  action: 'AUTHORIZE' | 'CONFIRM' | 'REJECT' | 'REVERSE';
  externalRefundRef?: string;
  reason?: string;
};

export function validateRefundDecisionInput(rawInput: unknown): ValidationResult<RefundDecisionInput> {
  const forbidden = checkForbiddenFinancialFields(rawInput);
  if (forbidden.length > 0) return { ok: false, issues: forbidden };

  return validateObjectSchema<RefundDecisionInput>(
    rawInput,
    {
      action: requireEnumValue(['AUTHORIZE', 'CONFIRM', 'REJECT', 'REVERSE'] as const),
      externalRefundRef: requireNonEmptyString({ minLength: 3, maxLength: 120 }),
      reason: requireNonEmptyString({ minLength: 2, maxLength: 400 }),
    },
    { optionalFields: ['externalRefundRef', 'reason'], rejectUntrustedIdentityFields: true },
  );
}

export type GenerateRentalScheduleInput = {
  scheduleId?: string;
  contractReferenceId: string;
  tenantUid: string;
  landlordUid: string;
  currency: TransactionCurrency;
  securityDepositAmount: number;
  periodicRentAmount: number;
  frequency: RentalFrequency;
  customIntervalDays?: number;
  installmentCount: number;
  startDateIso: string;
};

export function validateGenerateRentalScheduleInput(rawInput: unknown): ValidationResult<GenerateRentalScheduleInput> {
  const forbidden = checkForbiddenFinancialFields(rawInput);
  if (forbidden.length > 0) return { ok: false, issues: forbidden };

  return validateObjectSchema<GenerateRentalScheduleInput>(
    rawInput,
    {
      scheduleId: requireSafeFirestoreId(),
      contractReferenceId: requireSafeFirestoreId(),
      tenantUid: requireSafeFirestoreId(),
      landlordUid: requireSafeFirestoreId(),
      currency: requireEnumValue(ALL_TRANSACTION_CURRENCIES),
      securityDepositAmount: requireFiniteNumberInRange({ min: 0, max: MAX_MONETARY_SAFE_INT, integerOnly: true }),
      periodicRentAmount: requireFiniteNumberInRange({ min: 1, max: MAX_MONETARY_SAFE_INT, integerOnly: true }),
      frequency: requireEnumValue(['MONTHLY', 'QUARTERLY', 'SEMI_ANNUAL', 'ANNUAL', 'CUSTOM_DAYS'] as const),
      customIntervalDays: requireFiniteNumberInRange({ min: 1, max: 366, integerOnly: true }),
      installmentCount: requireFiniteNumberInRange({ min: 1, max: 60, integerOnly: true }),
      startDateIso: requireIsoTimestamp(),
    },
    { optionalFields: ['scheduleId', 'customIntervalDays'], rejectUntrustedIdentityFields: true },
  );
}

export type CreateCommissionInput = {
  commissionId?: string;
  brokerUid: string;
  payerUid: string;
  calculationMode: CommissionCalculationMode;
  baseTransactionAmount: number;
  basisPoints?: number;
  fixedAmount?: number;
  currency: TransactionCurrency;
  contractReferenceId: string;
  dueDateIso: string;
};

export function validateCreateCommissionInput(rawInput: unknown): ValidationResult<CreateCommissionInput> {
  const forbidden = checkForbiddenFinancialFields(rawInput);
  if (forbidden.length > 0) return { ok: false, issues: forbidden };

  return validateObjectSchema<CreateCommissionInput>(
    rawInput,
    {
      commissionId: requireSafeFirestoreId(),
      brokerUid: requireSafeFirestoreId(),
      payerUid: requireSafeFirestoreId(),
      calculationMode: requireEnumValue(['FIXED_AMOUNT', 'BASIS_POINTS'] as const),
      baseTransactionAmount: requireFiniteNumberInRange({ min: 1, max: MAX_MONETARY_SAFE_INT, integerOnly: true }),
      basisPoints: requireFiniteNumberInRange({ min: 1, max: 5000, integerOnly: true }),
      fixedAmount: requireFiniteNumberInRange({ min: 1, max: MAX_MONETARY_SAFE_INT, integerOnly: true }),
      currency: requireEnumValue(ALL_TRANSACTION_CURRENCIES),
      contractReferenceId: requireSafeFirestoreId(),
      dueDateIso: requireIsoTimestamp(),
    },
    { optionalFields: ['commissionId', 'basisPoints', 'fixedAmount'], rejectUntrustedIdentityFields: true },
  );
}

export type CreateFinancialDisputeInput = {
  financialDisputeId?: string;
  linkedTransactionDisputeId?: string;
  disputedObligationIds?: string[];
  disputedSettlementIds?: string[];
  disputedAmount: number;
  currency: TransactionCurrency;
  reason: string;
};

export function validateCreateFinancialDisputeInput(rawInput: unknown): ValidationResult<CreateFinancialDisputeInput> {
  const forbidden = checkForbiddenFinancialFields(rawInput);
  if (forbidden.length > 0) return { ok: false, issues: forbidden };

  const stringArrayValidator: FieldValidator<string[]> = (val, field) => {
    if (!Array.isArray(val) || val.length > 25) {
      return { ok: false, issues: [{ field, code: 'INVALID_TYPE', message: `${field} must be an array of up to 25 IDs.` }] };
    }
    const ids: string[] = [];
    for (let i = 0; i < val.length; i++) {
      const r = requireSafeFirestoreId()(val[i], `${field}[${i}]`);
      if (!r.ok || !r.value) return { ok: false, issues: r.issues };
      ids.push(r.value);
    }
    return { ok: true, value: ids, issues: [] };
  };

  return validateObjectSchema<CreateFinancialDisputeInput>(
    rawInput,
    {
      financialDisputeId: requireSafeFirestoreId(),
      linkedTransactionDisputeId: requireSafeFirestoreId(),
      disputedObligationIds: stringArrayValidator,
      disputedSettlementIds: stringArrayValidator,
      disputedAmount: requireFiniteNumberInRange({ min: 1, max: MAX_MONETARY_SAFE_INT, integerOnly: true }),
      currency: requireEnumValue(ALL_TRANSACTION_CURRENCIES),
      reason: requireNonEmptyString({ minLength: 5, maxLength: 1000 }),
    },
    {
      optionalFields: [
        'financialDisputeId',
        'linkedTransactionDisputeId',
        'disputedObligationIds',
        'disputedSettlementIds',
      ],
      rejectUntrustedIdentityFields: true,
    },
  );
}

export type ResolveFinancialDisputeInput = {
  targetStatus: Extract<FinancialDisputeStatus, 'UNDER_REVIEW' | 'RESOLVED' | 'DISMISSED'>;
  resolutionReference: string;
  resolutionSummary: string;
  restoreObligationsAndSettlements?: boolean;
};

export function validateResolveFinancialDisputeInput(rawInput: unknown): ValidationResult<ResolveFinancialDisputeInput> {
  const forbidden = checkForbiddenFinancialFields(rawInput);
  if (forbidden.length > 0) return { ok: false, issues: forbidden };

  return validateObjectSchema<ResolveFinancialDisputeInput>(
    rawInput,
    {
      targetStatus: requireEnumValue(['UNDER_REVIEW', 'RESOLVED', 'DISMISSED'] as const),
      resolutionReference: requireNonEmptyString({ minLength: 3, maxLength: 120 }),
      resolutionSummary: requireNonEmptyString({ minLength: 5, maxLength: 1000 }),
      restoreObligationsAndSettlements: (v, f) =>
        typeof v === 'boolean'
          ? { ok: true, value: v, issues: [] }
          : { ok: false, issues: [{ field: f, code: 'INVALID_TYPE', message: `${f} must be a boolean.` }] },
    },
    { optionalFields: ['restoreObligationsAndSettlements'], rejectUntrustedIdentityFields: true },
  );
}
