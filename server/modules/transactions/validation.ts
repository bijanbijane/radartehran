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
import { ALLOWED_ROLES_BY_TX_TYPE } from './stateMachineAndAuthz';
import {
  ALL_MILESTONE_TYPES,
  ALL_PARTICIPANT_ROLES,
  ALL_TRANSACTION_CURRENCIES,
  ALL_TRANSACTION_STATUSES,
  ALL_TRANSACTION_TYPES,
  type ClosingSettlementStatus,
  type ContractStatus,
  type MilestoneStatus,
  type MilestoneType,
  type ParticipantRole,
  type TransactionCurrency,
  type TransactionStatus,
  type TransactionType,
} from './types';

const SUPPORTED_CITIES = ['tehran', 'karaj', 'mashhad', 'isfahan', 'shiraz'] as const;
const MAX_MONETARY_AMOUNT = 1_000_000_000_000_000;

function requireFutureIsoTimestamp(nowEpochMs: number): FieldValidator<string> {
  return (rawValue: unknown, fieldName: string): ValidationResult<string> => {
    const normalized = normalizeFirestoreTimestamp(rawValue);
    if (!normalized) {
      return {
        ok: false,
        issues: [{ field: fieldName, code: 'INVALID_FORMAT', message: `${fieldName} must be a valid ISO timestamp.` }],
      };
    }
    if (normalized.epochMs <= nowEpochMs) {
      return {
        ok: false,
        issues: [{ field: fieldName, code: 'INVALID_FORMAT', message: `${fieldName} must be in the future.` }],
      };
    }
    return { ok: true, value: normalized.iso, issues: [] };
  };
}

export type CreateTransactionInput = {
  transactionId?: string;
  transactionType: TransactionType;
  propertyId: string;
  cityId: string;
  hoodId: number;
  initiatorRole: ParticipantRole;
  askingAmount: number;
  depositAmount?: number;
  monthlyRentAmount?: number;
  currency: TransactionCurrency;
  brokerUid?: string;
  expiresAtIso?: string;
};

export function validateCreateTransactionInput(
  rawInput: unknown,
  nowEpochMs = Date.now(),
): ValidationResult<CreateTransactionInput> {
  const base = validateObjectSchema<CreateTransactionInput>(
    rawInput,
    {
      transactionId: requireSafeFirestoreId(),
      transactionType: requireEnumValue(ALL_TRANSACTION_TYPES),
      propertyId: requireSafeFirestoreId(),
      cityId: requireEnumValue(SUPPORTED_CITIES),
      hoodId: requireFiniteNumberInRange({ min: 1, max: 999, integerOnly: true }),
      initiatorRole: requireEnumValue(ALL_PARTICIPANT_ROLES),
      askingAmount: requireFiniteNumberInRange({ min: 1, max: MAX_MONETARY_AMOUNT, integerOnly: true }),
      depositAmount: requireFiniteNumberInRange({ min: 0, max: MAX_MONETARY_AMOUNT, integerOnly: true }),
      monthlyRentAmount: requireFiniteNumberInRange({ min: 0, max: MAX_MONETARY_AMOUNT, integerOnly: true }),
      currency: requireEnumValue(ALL_TRANSACTION_CURRENCIES),
      brokerUid: requireSafeFirestoreId(),
      expiresAtIso: requireFutureIsoTimestamp(nowEpochMs),
    },
    {
      optionalFields: ['transactionId', 'depositAmount', 'monthlyRentAmount', 'brokerUid', 'expiresAtIso'],
      rejectUntrustedIdentityFields: true,
    },
  );

  if (!base.ok || !base.value) return base;
  const val = base.value;
  const issues: ValidationIssue[] = [];

  const allowedRoles = ALLOWED_ROLES_BY_TX_TYPE[val.transactionType];
  if (!allowedRoles.includes(val.initiatorRole)) {
    issues.push({
      field: 'initiatorRole',
      code: 'INVALID_ENUM_VALUE',
      message: `Role "${val.initiatorRole}" is not allowed for transactionType "${val.transactionType}".`,
    });
  }

  if (val.transactionType === 'RENTAL' && val.depositAmount === undefined && val.monthlyRentAmount === undefined) {
    issues.push({
      field: 'depositAmount',
      code: 'REQUIRED_FIELD_MISSING',
      message: 'Rental transactions require depositAmount or monthlyRentAmount.',
    });
  }

  return issues.length > 0 ? { ok: false, issues } : base;
}

export type TransitionTransactionInput = {
  targetStatus: TransactionStatus;
  expectedVersion: number;
  reason?: string;
};

export function validateTransitionTransactionInput(rawInput: unknown): ValidationResult<TransitionTransactionInput> {
  return validateObjectSchema<TransitionTransactionInput>(
    rawInput,
    {
      targetStatus: requireEnumValue(ALL_TRANSACTION_STATUSES),
      expectedVersion: requireFiniteNumberInRange({ min: 1, max: 1_000_000, integerOnly: true }),
      reason: requireNonEmptyString({ minLength: 2, maxLength: 500 }),
    },
    { optionalFields: ['reason'], rejectUntrustedIdentityFields: true },
  );
}

export type InviteParticipantInput = {
  targetUserId: string;
  role: ParticipantRole;
  expectedVersion: number;
  representsPartyUid?: string;
  invitationExpiresAtIso?: string;
};

export function validateInviteParticipantInput(
  rawInput: unknown,
  txType: TransactionType,
  nowEpochMs = Date.now(),
): ValidationResult<InviteParticipantInput> {
  const base = validateObjectSchema<InviteParticipantInput>(
    rawInput,
    {
      targetUserId: requireSafeFirestoreId(),
      role: requireEnumValue(ALL_PARTICIPANT_ROLES),
      expectedVersion: requireFiniteNumberInRange({ min: 1, max: 1_000_000, integerOnly: true }),
      representsPartyUid: requireSafeFirestoreId(),
      invitationExpiresAtIso: requireFutureIsoTimestamp(nowEpochMs),
    },
    { optionalFields: ['representsPartyUid', 'invitationExpiresAtIso'], rejectUntrustedIdentityFields: true },
  );

  if (!base.ok || !base.value) return base;
  const allowedRoles = ALLOWED_ROLES_BY_TX_TYPE[txType];
  if (!allowedRoles.includes(base.value.role)) {
    return {
      ok: false,
      issues: [
        {
          field: 'role',
          code: 'INVALID_ENUM_VALUE',
          message: `Role "${base.value.role}" is not permitted in a "${txType}" transaction.`,
        },
      ],
    };
  }
  return base;
}

export type RespondInvitationInput = {
  decision: 'ACCEPT' | 'DECLINE';
  expectedVersion: number;
};

export function validateRespondInvitationInput(rawInput: unknown): ValidationResult<RespondInvitationInput> {
  return validateObjectSchema<RespondInvitationInput>(
    rawInput,
    {
      decision: requireEnumValue(['ACCEPT', 'DECLINE'] as const),
      expectedVersion: requireFiniteNumberInRange({ min: 1, max: 1_000_000, integerOnly: true }),
    },
    { rejectUntrustedIdentityFields: true },
  );
}

export type ModifyParticipantInput = {
  newRole?: ParticipantRole;
  revokeAccess?: boolean;
  reason?: string;
  expectedVersion: number;
};

export function validateModifyParticipantInput(rawInput: unknown): ValidationResult<ModifyParticipantInput> {
  return validateObjectSchema<ModifyParticipantInput>(
    rawInput,
    {
      newRole: requireEnumValue(ALL_PARTICIPANT_ROLES),
      revokeAccess: (v, f) =>
        typeof v === 'boolean'
          ? { ok: true, value: v, issues: [] }
          : { ok: false, issues: [{ field: f, code: 'INVALID_TYPE', message: `${f} must be a boolean.` }] },
      reason: requireNonEmptyString({ minLength: 2, maxLength: 400 }),
      expectedVersion: requireFiniteNumberInRange({ min: 1, max: 1_000_000, integerOnly: true }),
    },
    { optionalFields: ['newRole', 'revokeAccess', 'reason'], rejectUntrustedIdentityFields: true },
  );
}

export type SubmitOfferInput = {
  amount: number;
  depositAmount?: number;
  monthlyRentAmount?: number;
  currency: TransactionCurrency;
  conditions: string;
  expiresAtIso?: string;
  parentOfferId?: string;
  expectedVersion: number;
};

export function validateSubmitOfferInput(
  rawInput: unknown,
  nowEpochMs = Date.now(),
): ValidationResult<SubmitOfferInput> {
  return validateObjectSchema<SubmitOfferInput>(
    rawInput,
    {
      amount: requireFiniteNumberInRange({ min: 1, max: MAX_MONETARY_AMOUNT, integerOnly: true }),
      depositAmount: requireFiniteNumberInRange({ min: 0, max: MAX_MONETARY_AMOUNT, integerOnly: true }),
      monthlyRentAmount: requireFiniteNumberInRange({ min: 0, max: MAX_MONETARY_AMOUNT, integerOnly: true }),
      currency: requireEnumValue(ALL_TRANSACTION_CURRENCIES),
      conditions: requireNonEmptyString({ minLength: 3, maxLength: 2000 }),
      expiresAtIso: requireFutureIsoTimestamp(nowEpochMs),
      parentOfferId: requireSafeFirestoreId(),
      expectedVersion: requireFiniteNumberInRange({ min: 1, max: 1_000_000, integerOnly: true }),
    },
    {
      optionalFields: ['depositAmount', 'monthlyRentAmount', 'expiresAtIso', 'parentOfferId'],
      rejectUntrustedIdentityFields: true,
    },
  );
}

export type DecideOfferInput = {
  decision: 'ACCEPT' | 'REJECT' | 'WITHDRAW';
  expectedVersion: number;
  note?: string;
};

export function validateDecideOfferInput(rawInput: unknown): ValidationResult<DecideOfferInput> {
  return validateObjectSchema<DecideOfferInput>(
    rawInput,
    {
      decision: requireEnumValue(['ACCEPT', 'REJECT', 'WITHDRAW'] as const),
      expectedVersion: requireFiniteNumberInRange({ min: 1, max: 1_000_000, integerOnly: true }),
      note: requireNonEmptyString({ minLength: 2, maxLength: 500 }),
    },
    { optionalFields: ['note'], rejectUntrustedIdentityFields: true },
  );
}

export type PostNegotiationEntryInput = {
  entryType: 'INITIATED' | 'MESSAGE' | 'TERMS_PROPOSAL' | 'DEADLINE_SET' | 'CLOSED';
  message: string;
  referencedOfferId?: string;
  deadlineIso?: string;
  expectedVersion: number;
};

export function validateNegotiationEntryInput(
  rawInput: unknown,
  nowEpochMs = Date.now(),
): ValidationResult<PostNegotiationEntryInput> {
  return validateObjectSchema<PostNegotiationEntryInput>(
    rawInput,
    {
      entryType: requireEnumValue(['INITIATED', 'MESSAGE', 'TERMS_PROPOSAL', 'DEADLINE_SET', 'CLOSED'] as const),
      message: requireNonEmptyString({ minLength: 2, maxLength: 2000 }),
      referencedOfferId: requireSafeFirestoreId(),
      deadlineIso: requireFutureIsoTimestamp(nowEpochMs),
      expectedVersion: requireFiniteNumberInRange({ min: 1, max: 1_000_000, integerOnly: true }),
    },
    { optionalFields: ['referencedOfferId', 'deadlineIso'], rejectUntrustedIdentityFields: true },
  );
}

export type AttachContractInput = {
  title: string;
  mediaObjectId: string;
  sha256Checksum: string;
  officialTrackingCode?: string;
  supersedesContractId?: string;
  expiresAtIso?: string;
  expectedVersion: number;
};

export function validateAttachContractInput(
  rawInput: unknown,
  nowEpochMs = Date.now(),
): ValidationResult<AttachContractInput> {
  return validateObjectSchema<AttachContractInput>(
    rawInput,
    {
      title: requireNonEmptyString({ minLength: 3, maxLength: 200 }),
      mediaObjectId: requireSafeFirestoreId(),
      sha256Checksum: requireNonEmptyString({ minLength: 64, maxLength: 64, pattern: /^[a-fA-F0-9]{64}$/ }),
      officialTrackingCode: requireNonEmptyString({ minLength: 4, maxLength: 64 }),
      supersedesContractId: requireSafeFirestoreId(),
      expiresAtIso: requireFutureIsoTimestamp(nowEpochMs),
      expectedVersion: requireFiniteNumberInRange({ min: 1, max: 1_000_000, integerOnly: true }),
    },
    {
      optionalFields: ['officialTrackingCode', 'supersedesContractId', 'expiresAtIso'],
      rejectUntrustedIdentityFields: true,
    },
  );
}

export type UpdateContractStatusInput = {
  targetStatus?: ContractStatus;
  recordPartySignature?: {
    executionStatus: 'ACKNOWLEDGED' | 'EXTERNAL_REGISTRY_RECORDED' | 'DECLINED';
    externalRegistryRef?: string;
  };
  expectedVersion: number;
};

export function validateUpdateContractStatusInput(rawInput: unknown): ValidationResult<UpdateContractStatusInput> {
  return validateObjectSchema<UpdateContractStatusInput>(
    rawInput,
    {
      targetStatus: requireEnumValue([
        'DRAFT',
        'UNDER_REVIEW',
        'READY_FOR_EXECUTION',
        'PARTIALLY_SIGNED',
        'EXECUTED',
        'SUPERSEDED',
        'EXPIRED',
        'REVOKED',
      ] as const),
      recordPartySignature: (val, field) => {
        if (!val || typeof val !== 'object' || Array.isArray(val)) {
          return { ok: false, issues: [{ field, code: 'INVALID_TYPE', message: `${field} must be an object.` }] };
        }
        const rec = val as Record<string, unknown>;
        const st = rec.executionStatus;
        if (st !== 'ACKNOWLEDGED' && st !== 'EXTERNAL_REGISTRY_RECORDED' && st !== 'DECLINED') {
          return { ok: false, issues: [{ field: `${field}.executionStatus`, code: 'INVALID_ENUM_VALUE', message: 'Invalid signature executionStatus.' }] };
        }
        const extRef = typeof rec.externalRegistryRef === 'string' ? rec.externalRegistryRef.trim().slice(0, 120) : undefined;
        return {
          ok: true,
          value: { executionStatus: st, ...(extRef ? { externalRegistryRef: extRef } : {}) },
          issues: [],
        };
      },
      expectedVersion: requireFiniteNumberInRange({ min: 1, max: 1_000_000, integerOnly: true }),
    },
    { optionalFields: ['targetStatus', 'recordPartySignature'], rejectUntrustedIdentityFields: true },
  );
}

export type UpdateMilestoneInput = {
  milestoneType: MilestoneType;
  status: MilestoneStatus;
  dueDateIso?: string;
  required?: boolean;
  expectedVersion: number;
};

export function validateUpdateMilestoneInput(rawInput: unknown): ValidationResult<UpdateMilestoneInput> {
  return validateObjectSchema<UpdateMilestoneInput>(
    rawInput,
    {
      milestoneType: requireEnumValue(ALL_MILESTONE_TYPES),
      status: requireEnumValue(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'WAIVED', 'BLOCKED'] as const),
      dueDateIso: requireNonEmptyString({ minLength: 10, maxLength: 40 }),
      required: (v, f) =>
        typeof v === 'boolean'
          ? { ok: true, value: v, issues: [] }
          : { ok: false, issues: [{ field: f, code: 'INVALID_TYPE', message: `${f} must be a boolean.` }] },
      expectedVersion: requireFiniteNumberInRange({ min: 1, max: 1_000_000, integerOnly: true }),
    },
    { optionalFields: ['dueDateIso', 'required'], rejectUntrustedIdentityFields: true },
  );
}

export type ClosingOperationInput = {
  operation: 'INITIATE' | 'CONFIRM_PARTY' | 'RECORD_SETTLEMENT_REF' | 'REPORT_EXCEPTION' | 'RESOLVE_EXCEPTION' | 'COMPLETE' | 'CANCEL';
  settlementStatus?: ClosingSettlementStatus;
  settlementReferenceId?: string;
  handoverConfirmed?: boolean;
  exceptionId?: string;
  exceptionCode?: string;
  exceptionDescription?: string;
  cancellationReason?: string;
  expectedVersion: number;
};

export function validateClosingOperationInput(rawInput: unknown): ValidationResult<ClosingOperationInput> {
  return validateObjectSchema<ClosingOperationInput>(
    rawInput,
    {
      operation: requireEnumValue([
        'INITIATE',
        'CONFIRM_PARTY',
        'RECORD_SETTLEMENT_REF',
        'REPORT_EXCEPTION',
        'RESOLVE_EXCEPTION',
        'COMPLETE',
        'CANCEL',
      ] as const),
      settlementStatus: requireEnumValue([
        'UNINITIATED',
        'REFERENCE_RECORDED',
        'CONFIRMED_BY_PARTIES',
        'DISPUTED',
      ] as const),
      settlementReferenceId: requireSafeFirestoreId(),
      handoverConfirmed: (v, f) =>
        typeof v === 'boolean'
          ? { ok: true, value: v, issues: [] }
          : { ok: false, issues: [{ field: f, code: 'INVALID_TYPE', message: `${f} must be boolean.` }] },
      exceptionId: requireSafeFirestoreId(),
      exceptionCode: requireNonEmptyString({ minLength: 2, maxLength: 64 }),
      exceptionDescription: requireNonEmptyString({ minLength: 3, maxLength: 500 }),
      cancellationReason: requireNonEmptyString({ minLength: 3, maxLength: 500 }),
      expectedVersion: requireFiniteNumberInRange({ min: 1, max: 1_000_000, integerOnly: true }),
    },
    {
      optionalFields: [
        'settlementStatus',
        'settlementReferenceId',
        'handoverConfirmed',
        'exceptionId',
        'exceptionCode',
        'exceptionDescription',
        'cancellationReason',
      ],
      rejectUntrustedIdentityFields: true,
    },
  );
}

export type InitiateDisputeInput = {
  reasonCategory: 'BREACH_OF_TERMS' | 'DOCUMENT_DISCREPANCY' | 'SETTLEMENT_DELAY' | 'MISREPRESENTATION' | 'OTHER';
  description: string;
  expectedVersion: number;
};

export function validateInitiateDisputeInput(rawInput: unknown): ValidationResult<InitiateDisputeInput> {
  return validateObjectSchema<InitiateDisputeInput>(
    rawInput,
    {
      reasonCategory: requireEnumValue([
        'BREACH_OF_TERMS',
        'DOCUMENT_DISCREPANCY',
        'SETTLEMENT_DELAY',
        'MISREPRESENTATION',
        'OTHER',
      ] as const),
      description: requireNonEmptyString({ minLength: 10, maxLength: 2000 }),
      expectedVersion: requireFiniteNumberInRange({ min: 1, max: 1_000_000, integerOnly: true }),
    },
    { rejectUntrustedIdentityFields: true },
  );
}

export type AdminInterventionInput = {
  action: 'SUSPEND' | 'RESTORE' | 'RESOLVE_DISPUTE' | 'FORCE_CANCEL';
  targetStatusAfterRestore?: TransactionStatus;
  reason: string;
  expectedVersion: number;
};

export function validateAdminInterventionInput(rawInput: unknown): ValidationResult<AdminInterventionInput> {
  return validateObjectSchema<AdminInterventionInput>(
    rawInput,
    {
      action: requireEnumValue(['SUSPEND', 'RESTORE', 'RESOLVE_DISPUTE', 'FORCE_CANCEL'] as const),
      targetStatusAfterRestore: requireEnumValue(ALL_TRANSACTION_STATUSES),
      reason: requireNonEmptyString({ minLength: 5, maxLength: 1000 }),
      expectedVersion: requireFiniteNumberInRange({ min: 1, max: 1_000_000, integerOnly: true }),
    },
    { optionalFields: ['targetStatusAfterRestore'], rejectUntrustedIdentityFields: true },
  );
}
