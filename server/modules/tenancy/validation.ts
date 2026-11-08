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
} from '../core';
import {
  ALL_TRANSACTION_CURRENCIES,
  MAX_MONETARY_SAFE_INT,
  type RentalFrequency,
  type TransactionCurrency,
} from '../transactions';
import {
  ALL_MAINTENANCE_STATUSES,
  ALL_RENTAL_AVAILABILITY_STATUSES,
  type FurnishingStatus,
  type InspectionChecklistItem,
  type InspectionType,
  type MaintenancePriority,
  type MaintenanceStatus,
  type RentalAvailabilityStatus,
  type RentalCategory,
  type ScreeningVerificationItemStatus,
  type TerminationType,
} from './types';

const PROHIBITED_TENANCY_FIELDS: ReadonlySet<string> = new Set([
  'religion',
  'ethnicity',
  'race',
  'politicalAffiliation',
  'nationalityBias',
  'maritalDiscriminationScore',
  'password',
  'bankPassword',
  'cardNumber',
  'cvv',
  'cvv2',
  'paymentConfirmed',
  'isAdmin',
]);

function checkProhibitedTenancyFields(rawInput: unknown): ValidationIssue[] {
  if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) return [];
  const issues: ValidationIssue[] = [];
  for (const key of Object.keys(rawInput as Record<string, unknown>)) {
    if (PROHIBITED_TENANCY_FIELDS.has(key)) {
      issues.push({
        field: key,
        code: 'UNTRUSTED_IDENTITY_FIELD',
        message: `Field "${key}" is prohibited in tenancy payloads (discriminatory attribute, sensitive credential, or untrusted privilege).`,
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
        issues: [{ field: fieldName, code: 'INVALID_FORMAT', message: `${fieldName} must be a valid ISO timestamp.` }],
      };
    }
    return { ok: true, value: normalized.iso, issues: [] };
  };
}

const booleanValidator: FieldValidator<boolean> = (v, f) =>
  typeof v === 'boolean'
    ? { ok: true, value: v, issues: [] }
    : { ok: false, issues: [{ field: f, code: 'INVALID_TYPE', message: `${f} must be a boolean.` }] };

const stringArrayValidator: FieldValidator<string[]> = (val, field) => {
  if (!Array.isArray(val) || val.length > 30) {
    return { ok: false, issues: [{ field, code: 'INVALID_TYPE', message: `${field} must be an array of up to 30 strings.` }] };
  }
  const items: string[] = [];
  for (let i = 0; i < val.length; i++) {
    const r = requireNonEmptyString({ minLength: 1, maxLength: 100 })(val[i], `${field}[${i}]`);
    if (!r.ok || !r.value) return { ok: false, issues: r.issues };
    items.push(r.value);
  }
  return { ok: true, value: items, issues: [] };
};

export type UpsertRentalPropertyConfigInput = {
  propertyManagerUid?: string;
  brokerUid?: string;
  availabilityStatus: RentalAvailabilityStatus;
  rentalCategory: RentalCategory;
  maxOccupancyCount: number;
  furnishingStatus: FurnishingStatus;
  facilities: string[];
  parkingSpaces: number;
  hasStorageUnit: boolean;
  rentalConditions: string;
  minLeaseDurationMonths: number;
  maxLeaseDurationMonths: number;
  requiredDepositAmount: number;
  advertisedPeriodicRentAmount: number;
  currency: TransactionCurrency;
  availableFromIso: string;
};

export function validateUpsertRentalPropertyConfigInput(
  rawInput: unknown,
): ValidationResult<UpsertRentalPropertyConfigInput> {
  const prohibited = checkProhibitedTenancyFields(rawInput);
  if (prohibited.length > 0) return { ok: false, issues: prohibited };

  const base = validateObjectSchema<UpsertRentalPropertyConfigInput>(
    rawInput,
    {
      propertyManagerUid: requireSafeFirestoreId(),
      brokerUid: requireSafeFirestoreId(),
      availabilityStatus: requireEnumValue(ALL_RENTAL_AVAILABILITY_STATUSES),
      rentalCategory: requireEnumValue(['RESIDENTIAL_APARTMENT', 'VILLA', 'COMMERCIAL_UNIT', 'OFFICE_SPACE'] as const),
      maxOccupancyCount: requireFiniteNumberInRange({ min: 1, max: 100, integerOnly: true }),
      furnishingStatus: requireEnumValue(['UNFURNISHED', 'SEMI_FURNISHED', 'FULLY_FURNISHED'] as const),
      facilities: stringArrayValidator,
      parkingSpaces: requireFiniteNumberInRange({ min: 0, max: 50, integerOnly: true }),
      hasStorageUnit: booleanValidator,
      rentalConditions: requireNonEmptyString({ minLength: 3, maxLength: 2000 }),
      minLeaseDurationMonths: requireFiniteNumberInRange({ min: 1, max: 120, integerOnly: true }),
      maxLeaseDurationMonths: requireFiniteNumberInRange({ min: 1, max: 240, integerOnly: true }),
      requiredDepositAmount: requireFiniteNumberInRange({ min: 0, max: MAX_MONETARY_SAFE_INT, integerOnly: true }),
      advertisedPeriodicRentAmount: requireFiniteNumberInRange({ min: 1, max: MAX_MONETARY_SAFE_INT, integerOnly: true }),
      currency: requireEnumValue(ALL_TRANSACTION_CURRENCIES),
      availableFromIso: requireIsoTimestamp(),
    },
    { optionalFields: ['propertyManagerUid', 'brokerUid'], rejectUntrustedIdentityFields: true },
  );

  if (!base.ok || !base.value) return base;
  if (base.value.minLeaseDurationMonths > base.value.maxLeaseDurationMonths) {
    return {
      ok: false,
      issues: [
        {
          field: 'maxLeaseDurationMonths',
          code: 'NUMBER_OUT_OF_RANGE',
          message: 'maxLeaseDurationMonths must be >= minLeaseDurationMonths.',
        },
      ],
    };
  }
  return base;
}

export type CreateRentalApplicationInput = {
  applicationId?: string;
  proposedPeriodicRentAmount: number;
  proposedDepositAmount: number;
  currency: TransactionCurrency;
  desiredMoveInDateIso: string;
  desiredLeaseDurationMonths: number;
  occupantCount: number;
  applicantNote?: string;
  submitImmediately?: boolean;
};

export function validateCreateRentalApplicationInput(
  rawInput: unknown,
): ValidationResult<CreateRentalApplicationInput> {
  const prohibited = checkProhibitedTenancyFields(rawInput);
  if (prohibited.length > 0) return { ok: false, issues: prohibited };

  return validateObjectSchema<CreateRentalApplicationInput>(
    rawInput,
    {
      applicationId: requireSafeFirestoreId(),
      proposedPeriodicRentAmount: requireFiniteNumberInRange({ min: 1, max: MAX_MONETARY_SAFE_INT, integerOnly: true }),
      proposedDepositAmount: requireFiniteNumberInRange({ min: 0, max: MAX_MONETARY_SAFE_INT, integerOnly: true }),
      currency: requireEnumValue(ALL_TRANSACTION_CURRENCIES),
      desiredMoveInDateIso: requireIsoTimestamp(),
      desiredLeaseDurationMonths: requireFiniteNumberInRange({ min: 1, max: 240, integerOnly: true }),
      occupantCount: requireFiniteNumberInRange({ min: 1, max: 100, integerOnly: true }),
      applicantNote: requireNonEmptyString({ minLength: 2, maxLength: 1000 }),
      submitImmediately: booleanValidator,
    },
    { optionalFields: ['applicationId', 'applicantNote', 'submitImmediately'], rejectUntrustedIdentityFields: true },
  );
}

export type DecideRentalApplicationInput = {
  action: 'SUBMIT' | 'START_REVIEW' | 'REQUEST_INFO' | 'APPROVE' | 'REJECT' | 'WITHDRAW';
  reason?: string;
  linkedTransactionId?: string;
};

export function validateDecideRentalApplicationInput(
  rawInput: unknown,
): ValidationResult<DecideRentalApplicationInput> {
  const prohibited = checkProhibitedTenancyFields(rawInput);
  if (prohibited.length > 0) return { ok: false, issues: prohibited };

  return validateObjectSchema<DecideRentalApplicationInput>(
    rawInput,
    {
      action: requireEnumValue([
        'SUBMIT',
        'START_REVIEW',
        'REQUEST_INFO',
        'APPROVE',
        'REJECT',
        'WITHDRAW',
      ] as const),
      reason: requireNonEmptyString({ minLength: 2, maxLength: 1000 }),
      linkedTransactionId: requireSafeFirestoreId(),
    },
    { optionalFields: ['reason', 'linkedTransactionId'], rejectUntrustedIdentityFields: true },
  );
}

export type RecordTenantScreeningInput = {
  identityVerificationStatus: ScreeningVerificationItemStatus;
  documentVerificationStatus: ScreeningVerificationItemStatus;
  referenceVerificationStatus: ScreeningVerificationItemStatus;
  incomeDocumentationStatus: ScreeningVerificationItemStatus;
  employmentVerificationStatus: ScreeningVerificationItemStatus;
  externalProviderReference?: string;
  manualReviewStatus: 'PENDING' | 'APPROVED' | 'REJECTED';
  reviewNote?: string;
};

export function validateRecordTenantScreeningInput(
  rawInput: unknown,
): ValidationResult<RecordTenantScreeningInput> {
  const prohibited = checkProhibitedTenancyFields(rawInput);
  if (prohibited.length > 0) return { ok: false, issues: prohibited };

  const itemStatusEnum = requireEnumValue([
    'NOT_SUBMITTED',
    'PENDING_REVIEW',
    'VERIFIED',
    'FAILED',
    'WAIVED',
  ] as const);

  return validateObjectSchema<RecordTenantScreeningInput>(
    rawInput,
    {
      identityVerificationStatus: itemStatusEnum,
      documentVerificationStatus: itemStatusEnum,
      referenceVerificationStatus: itemStatusEnum,
      incomeDocumentationStatus: itemStatusEnum,
      employmentVerificationStatus: itemStatusEnum,
      externalProviderReference: requireNonEmptyString({ minLength: 3, maxLength: 120 }),
      manualReviewStatus: requireEnumValue(['PENDING', 'APPROVED', 'REJECTED'] as const),
      reviewNote: requireNonEmptyString({ minLength: 2, maxLength: 500 }),
    },
    { optionalFields: ['externalProviderReference', 'reviewNote'], rejectUntrustedIdentityFields: true },
  );
}

export type CreateLeaseAgreementInput = {
  leaseId?: string;
  transactionId: string;
  applicationId?: string;
  previousLeaseId?: string;
  tenantUid: string;
  propertyManagerUid?: string;
  brokerUid?: string;
  leaseStartDateIso: string;
  leaseEndDateIso: string;
  periodicRentAmount: number;
  depositAmount: number;
  currency: TransactionCurrency;
  paymentFrequency: RentalFrequency;
  customIntervalDays?: number;
  installmentCount: number;
  gracePeriodDays: number;
  contractualConditions: string;
  permittedRentAdjustmentClauseRef?: string;
  contractDocumentId: string;
};

export function validateCreateLeaseAgreementInput(
  rawInput: unknown,
): ValidationResult<CreateLeaseAgreementInput> {
  const prohibited = checkProhibitedTenancyFields(rawInput);
  if (prohibited.length > 0) return { ok: false, issues: prohibited };

  const base = validateObjectSchema<CreateLeaseAgreementInput>(
    rawInput,
    {
      leaseId: requireSafeFirestoreId(),
      transactionId: requireSafeFirestoreId(),
      applicationId: requireSafeFirestoreId(),
      previousLeaseId: requireSafeFirestoreId(),
      tenantUid: requireSafeFirestoreId(),
      propertyManagerUid: requireSafeFirestoreId(),
      brokerUid: requireSafeFirestoreId(),
      leaseStartDateIso: requireIsoTimestamp(),
      leaseEndDateIso: requireIsoTimestamp(),
      periodicRentAmount: requireFiniteNumberInRange({ min: 1, max: MAX_MONETARY_SAFE_INT, integerOnly: true }),
      depositAmount: requireFiniteNumberInRange({ min: 0, max: MAX_MONETARY_SAFE_INT, integerOnly: true }),
      currency: requireEnumValue(ALL_TRANSACTION_CURRENCIES),
      paymentFrequency: requireEnumValue(['MONTHLY', 'QUARTERLY', 'SEMI_ANNUAL', 'ANNUAL', 'CUSTOM_DAYS'] as const),
      customIntervalDays: requireFiniteNumberInRange({ min: 1, max: 366, integerOnly: true }),
      installmentCount: requireFiniteNumberInRange({ min: 1, max: 60, integerOnly: true }),
      gracePeriodDays: requireFiniteNumberInRange({ min: 0, max: 30, integerOnly: true }),
      contractualConditions: requireNonEmptyString({ minLength: 5, maxLength: 3000 }),
      permittedRentAdjustmentClauseRef: requireNonEmptyString({ minLength: 3, maxLength: 200 }),
      contractDocumentId: requireSafeFirestoreId(),
    },
    {
      optionalFields: [
        'leaseId',
        'applicationId',
        'previousLeaseId',
        'propertyManagerUid',
        'brokerUid',
        'customIntervalDays',
        'permittedRentAdjustmentClauseRef',
      ],
      rejectUntrustedIdentityFields: true,
    },
  );

  if (!base.ok || !base.value) return base;
  if (Date.parse(base.value.leaseEndDateIso) <= Date.parse(base.value.leaseStartDateIso)) {
    return {
      ok: false,
      issues: [{ field: 'leaseEndDateIso', code: 'INVALID_FORMAT', message: 'leaseEndDateIso must be after leaseStartDateIso.' }],
    };
  }
  return base;
}

export type LeaseWorkflowActionInput = {
  action: 'SUBMIT_FOR_APPROVAL' | 'APPROVE' | 'RECORD_SIGNATURE' | 'ACTIVATE';
  requireConfirmedDepositOnActivation?: boolean;
};

export function validateLeaseWorkflowActionInput(
  rawInput: unknown,
): ValidationResult<LeaseWorkflowActionInput> {
  const prohibited = checkProhibitedTenancyFields(rawInput);
  if (prohibited.length > 0) return { ok: false, issues: prohibited };

  return validateObjectSchema<LeaseWorkflowActionInput>(
    rawInput,
    {
      action: requireEnumValue(['SUBMIT_FOR_APPROVAL', 'APPROVE', 'RECORD_SIGNATURE', 'ACTIVATE'] as const),
      requireConfirmedDepositOnActivation: booleanValidator,
    },
    { optionalFields: ['requireConfirmedDepositOnActivation'], rejectUntrustedIdentityFields: true },
  );
}

export type DepositOperationInput = {
  operation: 'SYNC_FROM_LEDGER' | 'RECORD_DEDUCTION' | 'INITIATE_REFUND';
  deductionAmount?: number;
  deductionReason?: string;
  authorizationReference?: string;
  inspectionReferenceId?: string;
  refundSettlementId?: string;
  refundAmount?: number;
};

export function validateDepositOperationInput(
  rawInput: unknown,
): ValidationResult<DepositOperationInput> {
  const prohibited = checkProhibitedTenancyFields(rawInput);
  if (prohibited.length > 0) return { ok: false, issues: prohibited };

  return validateObjectSchema<DepositOperationInput>(
    rawInput,
    {
      operation: requireEnumValue(['SYNC_FROM_LEDGER', 'RECORD_DEDUCTION', 'INITIATE_REFUND'] as const),
      deductionAmount: requireFiniteNumberInRange({ min: 1, max: MAX_MONETARY_SAFE_INT, integerOnly: true }),
      deductionReason: requireNonEmptyString({ minLength: 5, maxLength: 500 }),
      authorizationReference: requireNonEmptyString({ minLength: 3, maxLength: 120 }),
      inspectionReferenceId: requireSafeFirestoreId(),
      refundSettlementId: requireSafeFirestoreId(),
      refundAmount: requireFiniteNumberInRange({ min: 1, max: MAX_MONETARY_SAFE_INT, integerOnly: true }),
    },
    {
      optionalFields: [
        'deductionAmount',
        'deductionReason',
        'authorizationReference',
        'inspectionReferenceId',
        'refundSettlementId',
        'refundAmount',
      ],
      rejectUntrustedIdentityFields: true,
    },
  );
}

export type ProposeRenewalInput = {
  renewalId?: string;
  newLeaseStartDateIso: string;
  newLeaseEndDateIso: string;
  proposedPeriodicRentAmount: number;
  proposedDepositAmount: number;
  installmentCount: number;
  proposedConditions: string;
  newContractDocumentId: string;
};

export function validateProposeRenewalInput(rawInput: unknown): ValidationResult<ProposeRenewalInput> {
  const prohibited = checkProhibitedTenancyFields(rawInput);
  if (prohibited.length > 0) return { ok: false, issues: prohibited };

  return validateObjectSchema<ProposeRenewalInput>(
    rawInput,
    {
      renewalId: requireSafeFirestoreId(),
      newLeaseStartDateIso: requireIsoTimestamp(),
      newLeaseEndDateIso: requireIsoTimestamp(),
      proposedPeriodicRentAmount: requireFiniteNumberInRange({ min: 1, max: MAX_MONETARY_SAFE_INT, integerOnly: true }),
      proposedDepositAmount: requireFiniteNumberInRange({ min: 0, max: MAX_MONETARY_SAFE_INT, integerOnly: true }),
      installmentCount: requireFiniteNumberInRange({ min: 1, max: 60, integerOnly: true }),
      proposedConditions: requireNonEmptyString({ minLength: 5, maxLength: 2000 }),
      newContractDocumentId: requireSafeFirestoreId(),
    },
    { optionalFields: ['renewalId'], rejectUntrustedIdentityFields: true },
  );
}

export type RespondRenewalInput = {
  decision: 'ACCEPT' | 'REJECT' | 'COUNTER';
  counterPeriodicRentAmount?: number;
  counterDepositAmount?: number;
  newContractDocumentId?: string;
};

export function validateRespondRenewalInput(rawInput: unknown): ValidationResult<RespondRenewalInput> {
  const prohibited = checkProhibitedTenancyFields(rawInput);
  if (prohibited.length > 0) return { ok: false, issues: prohibited };

  return validateObjectSchema<RespondRenewalInput>(
    rawInput,
    {
      decision: requireEnumValue(['ACCEPT', 'REJECT', 'COUNTER'] as const),
      counterPeriodicRentAmount: requireFiniteNumberInRange({ min: 1, max: MAX_MONETARY_SAFE_INT, integerOnly: true }),
      counterDepositAmount: requireFiniteNumberInRange({ min: 0, max: MAX_MONETARY_SAFE_INT, integerOnly: true }),
      newContractDocumentId: requireSafeFirestoreId(),
    },
    {
      optionalFields: ['counterPeriodicRentAmount', 'counterDepositAmount', 'newContractDocumentId'],
      rejectUntrustedIdentityFields: true,
    },
  );
}

export type ProposeRentAdjustmentInput = {
  adjustmentId?: string;
  contractualClauseReference: string;
  newRentAmount: number;
  effectiveDateIso: string;
  reason: string;
};

export function validateProposeRentAdjustmentInput(
  rawInput: unknown,
): ValidationResult<ProposeRentAdjustmentInput> {
  const prohibited = checkProhibitedTenancyFields(rawInput);
  if (prohibited.length > 0) return { ok: false, issues: prohibited };

  return validateObjectSchema<ProposeRentAdjustmentInput>(
    rawInput,
    {
      adjustmentId: requireSafeFirestoreId(),
      contractualClauseReference: requireNonEmptyString({ minLength: 3, maxLength: 200 }),
      newRentAmount: requireFiniteNumberInRange({ min: 1, max: MAX_MONETARY_SAFE_INT, integerOnly: true }),
      effectiveDateIso: requireIsoTimestamp(),
      reason: requireNonEmptyString({ minLength: 3, maxLength: 500 }),
    },
    { optionalFields: ['adjustmentId'], rejectUntrustedIdentityFields: true },
  );
}

export type CreateLeaseAmendmentInput = {
  amendmentId?: string;
  reason: string;
  changedFields: Record<string, { previousValue: string | number | boolean; proposedValue: string | number | boolean }>;
  effectiveDateIso: string;
  amendmentDocumentId?: string;
};

export function validateCreateLeaseAmendmentInput(
  rawInput: unknown,
): ValidationResult<CreateLeaseAmendmentInput> {
  const prohibited = checkProhibitedTenancyFields(rawInput);
  if (prohibited.length > 0) return { ok: false, issues: prohibited };

  return validateObjectSchema<CreateLeaseAmendmentInput>(
    rawInput,
    {
      amendmentId: requireSafeFirestoreId(),
      reason: requireNonEmptyString({ minLength: 3, maxLength: 500 }),
      changedFields: (val, field) => {
        if (!val || typeof val !== 'object' || Array.isArray(val) || Object.keys(val).length === 0) {
          return { ok: false, issues: [{ field, code: 'INVALID_TYPE', message: `${field} must be a non-empty map.` }] };
        }
        return {
          ok: true,
          value: val as Record<string, { previousValue: string | number | boolean; proposedValue: string | number | boolean }>,
          issues: [],
        };
      },
      effectiveDateIso: requireIsoTimestamp(),
      amendmentDocumentId: requireSafeFirestoreId(),
    },
    { optionalFields: ['amendmentId', 'amendmentDocumentId'], rejectUntrustedIdentityFields: true },
  );
}

export type CreateMaintenanceRequestInput = {
  requestId?: string;
  category: 'PLUMBING' | 'ELECTRICAL' | 'HVAC' | 'APPLIANCE' | 'STRUCTURAL' | 'GENERAL';
  description: string;
  priority: MaintenancePriority;
  attachmentMediaIds?: string[];
  estimatedCostAmount?: number;
};

export function validateCreateMaintenanceRequestInput(
  rawInput: unknown,
): ValidationResult<CreateMaintenanceRequestInput> {
  const prohibited = checkProhibitedTenancyFields(rawInput);
  if (prohibited.length > 0) return { ok: false, issues: prohibited };

  return validateObjectSchema<CreateMaintenanceRequestInput>(
    rawInput,
    {
      requestId: requireSafeFirestoreId(),
      category: requireEnumValue(['PLUMBING', 'ELECTRICAL', 'HVAC', 'APPLIANCE', 'STRUCTURAL', 'GENERAL'] as const),
      description: requireNonEmptyString({ minLength: 5, maxLength: 2000 }),
      priority: requireEnumValue(['LOW', 'MEDIUM', 'HIGH', 'EMERGENCY'] as const),
      attachmentMediaIds: stringArrayValidator,
      estimatedCostAmount: requireFiniteNumberInRange({ min: 0, max: MAX_MONETARY_SAFE_INT, integerOnly: true }),
    },
    { optionalFields: ['requestId', 'attachmentMediaIds', 'estimatedCostAmount'], rejectUntrustedIdentityFields: true },
  );
}

export type UpdateMaintenanceRequestInput = {
  status: MaintenanceStatus;
  assignedServiceProviderId?: string;
  workOrderReference?: string;
  approvedCostAmount?: number;
  costPayerUid?: string;
  completionSummary?: string;
};

export function validateUpdateMaintenanceRequestInput(
  rawInput: unknown,
): ValidationResult<UpdateMaintenanceRequestInput> {
  const prohibited = checkProhibitedTenancyFields(rawInput);
  if (prohibited.length > 0) return { ok: false, issues: prohibited };

  return validateObjectSchema<UpdateMaintenanceRequestInput>(
    rawInput,
    {
      status: requireEnumValue(ALL_MAINTENANCE_STATUSES),
      assignedServiceProviderId: requireSafeFirestoreId(),
      workOrderReference: requireNonEmptyString({ minLength: 2, maxLength: 100 }),
      approvedCostAmount: requireFiniteNumberInRange({ min: 1, max: MAX_MONETARY_SAFE_INT, integerOnly: true }),
      costPayerUid: requireSafeFirestoreId(),
      completionSummary: requireNonEmptyString({ minLength: 3, maxLength: 1000 }),
    },
    {
      optionalFields: [
        'assignedServiceProviderId',
        'workOrderReference',
        'approvedCostAmount',
        'costPayerUid',
        'completionSummary',
      ],
      rejectUntrustedIdentityFields: true,
    },
  );
}

export type RecordInspectionInput = {
  inspectionId?: string;
  inspectionType: InspectionType;
  scheduledAtIso: string;
  checklist: InspectionChecklistItem[];
  completeImmediately?: boolean;
};

export function validateRecordInspectionInput(rawInput: unknown): ValidationResult<RecordInspectionInput> {
  const prohibited = checkProhibitedTenancyFields(rawInput);
  if (prohibited.length > 0) return { ok: false, issues: prohibited };

  return validateObjectSchema<RecordInspectionInput>(
    rawInput,
    {
      inspectionId: requireSafeFirestoreId(),
      inspectionType: requireEnumValue(['MOVE_IN', 'PERIODIC', 'MOVE_OUT'] as const),
      scheduledAtIso: requireIsoTimestamp(),
      checklist: (val, field) => {
        if (!Array.isArray(val)) {
          return { ok: false, issues: [{ field, code: 'INVALID_TYPE', message: `${field} must be an array.` }] };
        }
        return { ok: true, value: val as InspectionChecklistItem[], issues: [] };
      },
      completeImmediately: booleanValidator,
    },
    { optionalFields: ['inspectionId', 'completeImmediately'], rejectUntrustedIdentityFields: true },
  );
}

export type HandoverOperationInput = {
  handoverId?: string;
  handoverType: 'MOVE_IN' | 'MOVE_OUT';
  scheduledAtIso: string;
  inspectionReferenceId: string;
  keysTransferredConfirmed: boolean;
  accessDevicesTransferredConfirmed: boolean;
  meterReadings?: {
    electricityKwh?: number;
    waterCubicMeters?: number;
    gasCubicMeters?: number;
  };
  handoverDocumentMediaIds?: string[];
  completeHandover?: boolean;
};

export function validateHandoverOperationInput(rawInput: unknown): ValidationResult<HandoverOperationInput> {
  const prohibited = checkProhibitedTenancyFields(rawInput);
  if (prohibited.length > 0) return { ok: false, issues: prohibited };

  return validateObjectSchema<HandoverOperationInput>(
    rawInput,
    {
      handoverId: requireSafeFirestoreId(),
      handoverType: requireEnumValue(['MOVE_IN', 'MOVE_OUT'] as const),
      scheduledAtIso: requireIsoTimestamp(),
      inspectionReferenceId: requireSafeFirestoreId(),
      keysTransferredConfirmed: booleanValidator,
      accessDevicesTransferredConfirmed: booleanValidator,
      meterReadings: (val) => ({
        ok: true,
        value: (val && typeof val === 'object' ? val : {}) as {
          electricityKwh?: number;
          waterCubicMeters?: number;
          gasCubicMeters?: number;
        },
        issues: [],
      }),
      handoverDocumentMediaIds: stringArrayValidator,
      completeHandover: booleanValidator,
    },
    {
      optionalFields: ['handoverId', 'meterReadings', 'handoverDocumentMediaIds', 'completeHandover'],
      rejectUntrustedIdentityFields: true,
    },
  );
}

export type InitiateTerminationInput = {
  terminationId?: string;
  terminationType: TerminationType;
  effectiveTerminationDateIso: string;
  reason: string;
  contractualRuleReference: string;
  moveOutHandoverId?: string;
  completeTermination?: boolean;
};

export function validateInitiateTerminationInput(rawInput: unknown): ValidationResult<InitiateTerminationInput> {
  const prohibited = checkProhibitedTenancyFields(rawInput);
  if (prohibited.length > 0) return { ok: false, issues: prohibited };

  return validateObjectSchema<InitiateTerminationInput>(
    rawInput,
    {
      terminationId: requireSafeFirestoreId(),
      terminationType: requireEnumValue([
        'TENANT_INITIATED',
        'LANDLORD_INITIATED',
        'MUTUAL',
        'CONTRACTUAL_EXPIRATION',
        'EARLY_AUTHORIZED',
      ] as const),
      effectiveTerminationDateIso: requireIsoTimestamp(),
      reason: requireNonEmptyString({ minLength: 5, maxLength: 1000 }),
      contractualRuleReference: requireNonEmptyString({ minLength: 3, maxLength: 200 }),
      moveOutHandoverId: requireSafeFirestoreId(),
      completeTermination: booleanValidator,
    },
    { optionalFields: ['terminationId', 'moveOutHandoverId', 'completeTermination'], rejectUntrustedIdentityFields: true },
  );
}
