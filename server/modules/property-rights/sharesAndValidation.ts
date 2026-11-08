import {
  EvidenceSourceReliability,
  ExactOwnershipShare,
  IdentityConfidenceState,
  InterestVerificationStatus,
  LegalStatusClassification,
  MultiDimensionalStatusVector,
  OwnershipInterestRecord,
  PropertyRightsActorContext,
  PropertyRightsActorRole,
  PublicOrRedactedOwnershipInterestView,
  ShareCalculationBasis,
} from './types';

export type PropertyRightsErrorCode =
  | 'VALIDATION_ERROR'
  | 'INVALID_OWNERSHIP_SHARE'
  | 'SHARE_OVERFLOW_CONFLICT'
  | 'INVALID_PARTY_REFERENCE'
  | 'INVALID_PROPERTY_REFERENCE'
  | 'INVALID_STATE_TRANSITION'
  | 'DUPLICATE_SOURCE_EVIDENCE'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'UNAUTHORIZED_ENUMERATION'
  | 'NOT_FOUND'
  | 'CONCURRENT_MODIFICATION_CONFLICT'
  | 'CROSS_MODULE_WRITE_PROHIBITED'
  | 'DISPUTE_ADJUDICATION_PROHIBITED'
  | 'PERSISTENCE_UNAVAILABLE';

export class PropertyRightsError extends Error {
  public readonly code: PropertyRightsErrorCode;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;

  constructor(
    code: PropertyRightsErrorCode,
    message: string,
    statusCode = 400,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'PropertyRightsError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export function assertNonEmptyString(val: unknown, fieldName: string, maxLength = 2000): string {
  if (typeof val !== 'string' || val.trim().length === 0) {
    throw new PropertyRightsError('VALIDATION_ERROR', `Field '${fieldName}' must be a non-empty string.`, 400, {
      fieldName,
    });
  }
  const trimmed = val.trim();
  if (trimmed.length > maxLength) {
    throw new PropertyRightsError(
      'VALIDATION_ERROR',
      `Field '${fieldName}' exceeds maximum length of ${maxLength}.`,
      400,
      { fieldName, maxLength },
    );
  }
  return trimmed;
}

export function assertValidIsoTimestamp(val: unknown, fieldName: string): string {
  const s = assertNonEmptyString(val, fieldName, 64);
  const ms = Date.parse(s);
  if (Number.isNaN(ms)) {
    throw new PropertyRightsError(
      'VALIDATION_ERROR',
      `Field '${fieldName}' must be a valid ISO-8601 date or timestamp.`,
      400,
      { fieldName, providedValue: val },
    );
  }
  return s;
}

export function computeDaysBetweenEffectiveAndRecorded(
  effectiveDateIso: string,
  recordedAtIso: string,
): number {
  const effMs = Date.parse(effectiveDateIso);
  const recMs = Date.parse(recordedAtIso);
  if (Number.isNaN(effMs) || Number.isNaN(recMs) || recMs <= effMs) {
    return 0;
  }
  return Math.floor((recMs - effMs) / (1000 * 60 * 60 * 24));
}

function gcdBigInt(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x === 0n ? 1n : x;
}

export function normalizeExactFraction(
  numerator: number,
  denominator: number,
): { numerator: number; denominator: number } {
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator) || denominator <= 0) {
    throw new PropertyRightsError(
      'INVALID_OWNERSHIP_SHARE',
      `Invalid fraction ${numerator}/${denominator}: numerator and denominator must be safe integers with denominator > 0.`,
      400,
    );
  }
  if (numerator < 0) {
    throw new PropertyRightsError('INVALID_OWNERSHIP_SHARE', 'Ownership share numerator cannot be negative.', 400);
  }
  if (numerator === 0) {
    return { numerator: 0, denominator: 1 };
  }
  const g = gcdBigInt(BigInt(numerator), BigInt(denominator));
  return {
    numerator: Number(BigInt(numerator) / g),
    denominator: Number(BigInt(denominator) / g),
  };
}

export function addExactFractions(
  a: { numerator: number; denominator: number },
  b: { numerator: number; denominator: number },
): { numerator: number; denominator: number } {
  const num = BigInt(a.numerator) * BigInt(b.denominator) + BigInt(b.numerator) * BigInt(a.denominator);
  const den = BigInt(a.denominator) * BigInt(b.denominator);
  const g = gcdBigInt(num, den);
  return {
    numerator: Number(num / g),
    denominator: Number(den / g),
  };
}

export function subtractExactFractions(
  fromShare: { numerator: number; denominator: number },
  deltaShare: { numerator: number; denominator: number },
): { numerator: number; denominator: number } {
  const num =
    BigInt(fromShare.numerator) * BigInt(deltaShare.denominator) -
    BigInt(deltaShare.numerator) * BigInt(fromShare.denominator);
  if (num < 0n) {
    throw new PropertyRightsError(
      'INVALID_OWNERSHIP_SHARE',
      `Cannot transfer ${deltaShare.numerator}/${deltaShare.denominator} from available share ${fromShare.numerator}/${fromShare.denominator}.`,
      400,
    );
  }
  const den = BigInt(fromShare.denominator) * BigInt(deltaShare.denominator);
  const g = gcdBigInt(num, den);
  return {
    numerator: Number(num / g),
    denominator: Number(den / g),
  };
}

export function compareExactFractions(
  a: { numerator: number; denominator: number },
  b: { numerator: number; denominator: number },
): -1 | 0 | 1 {
  const left = BigInt(a.numerator) * BigInt(b.denominator);
  const right = BigInt(b.numerator) * BigInt(a.denominator);
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

export function validateAndFormatOwnershipShare(raw: {
  shareState: ExactOwnershipShare['shareState'];
  numerator?: number | null;
  denominator?: number | null;
  calculationBasis?: ShareCalculationBasis;
}): ExactOwnershipShare {
  const basis: ShareCalculationBasis = raw.calculationBasis ?? 'SIX_DANG_6';

  if (raw.shareState === 'UNKNOWN_SHARE') {
    if (raw.numerator !== undefined && raw.numerator !== null) {
      throw new PropertyRightsError(
        'INVALID_OWNERSHIP_SHARE',
        'UNKNOWN_SHARE must have null numerator and denominator (never conflated with zero).',
        400,
      );
    }
    return {
      shareState: 'UNKNOWN_SHARE',
      numerator: null,
      denominator: null,
      calculationBasis: basis,
      dangDisplayLabel: 'سهم نامشخص (نیازمند بررسی مستندات)',
    };
  }

  if (raw.shareState === 'ZERO_NO_OWNERSHIP') {
    return {
      shareState: 'ZERO_NO_OWNERSHIP',
      numerator: 0,
      denominator: 1,
      calculationBasis: basis,
      dangDisplayLabel: '۰ دانگ (فاقد سهم مالکیت)',
    };
  }

  if (raw.numerator === undefined || raw.numerator === null || raw.denominator === undefined || raw.denominator === null) {
    throw new PropertyRightsError(
      'INVALID_OWNERSHIP_SHARE',
      'KNOWN_EXACT_SHARE requires integer numerator and denominator.',
      400,
    );
  }

  if (raw.numerator <= 0) {
    throw new PropertyRightsError(
      'INVALID_OWNERSHIP_SHARE',
      'KNOWN_EXACT_SHARE numerator must be > 0 (use ZERO_NO_OWNERSHIP for zero share or UNKNOWN_SHARE when unknown).',
      400,
    );
  }

  const normalized = normalizeExactFraction(raw.numerator, raw.denominator);
  if (compareExactFractions(normalized, { numerator: 1, denominator: 1 }) > 0) {
    throw new PropertyRightsError(
      'INVALID_OWNERSHIP_SHARE',
      `Ownership share ${raw.numerator}/${raw.denominator} exceeds 100% (6/6 Dang).`,
      400,
    );
  }

  const dangNum = (normalized.numerator * 6) / normalized.denominator;
  const dangLabel = Number.isInteger(dangNum)
    ? `${dangNum} دانگ از ۶ دانگ`
    : `${normalized.numerator}/${normalized.denominator} سهم مشاع`;

  return {
    shareState: 'KNOWN_EXACT_SHARE',
    numerator: normalized.numerator,
    denominator: normalized.denominator,
    calculationBasis: basis,
    dangDisplayLabel: dangLabel,
  };
}

/**
 * Derives the legal status classification from verificationStatus & sourceReliability while
 * keeping all four dimensions (`identityConfidence`, `sourceReliability`, `verificationStatus`, `legalStatus`)
 * strictly separate. Never presents an unverified claim as established legal ownership.
 */
export function buildMultiDimensionalStatusVector(params: {
  identityConfidence: IdentityConfidenceState;
  sourceReliability: EvidenceSourceReliability;
  verificationStatus: InterestVerificationStatus;
}): MultiDimensionalStatusVector {
  const { identityConfidence, sourceReliability, verificationStatus } = params;

  if (
    verificationStatus === 'VERIFIED' &&
    sourceReliability === 'UNVERIFIED_PARTY_ASSERTION_OR_UPLOAD'
  ) {
    throw new PropertyRightsError(
      'VALIDATION_ERROR',
      'An interest cannot be marked VERIFIED when its only sourceReliability is UNVERIFIED_PARTY_ASSERTION_OR_UPLOAD.',
      400,
    );
  }

  let legalStatus: LegalStatusClassification;
  if (verificationStatus === 'VERIFIED') {
    legalStatus = 'INDEPENDENTLY_VERIFIED_INTEREST';
  } else if (verificationStatus === 'DOCUMENTED' || verificationStatus === 'PENDING_VERIFICATION') {
    legalStatus = 'DOCUMENTED_UNVERIFIED_INTEREST';
  } else if (
    verificationStatus === 'DISPUTED' ||
    verificationStatus === 'UNKNOWN' ||
    verificationStatus === 'REJECTED'
  ) {
    legalStatus = 'UNRESOLVED_OR_DISPUTED_LEGAL_STATUS';
  } else if (
    verificationStatus === 'EXPIRED' ||
    verificationStatus === 'RELEASED' ||
    verificationStatus === 'SUPERSEDED'
  ) {
    legalStatus = 'HISTORICAL_TERMINATED_OR_SUPERSEDED';
  } else {
    legalStatus = 'REPORTED_UNVERIFIED_CLAIM';
  }

  return {
    identityConfidence,
    sourceReliability,
    verificationStatus,
    legalStatus,
  };
}

const ALLOWED_TRANSITIONS: Record<InterestVerificationStatus, InterestVerificationStatus[]> = {
  CLAIMED: ['DOCUMENTED', 'PENDING_VERIFICATION', 'DISPUTED', 'REJECTED', 'SUPERSEDED'],
  DOCUMENTED: ['PENDING_VERIFICATION', 'VERIFIED', 'DISPUTED', 'REJECTED', 'SUPERSEDED', 'EXPIRED'],
  PENDING_VERIFICATION: ['VERIFIED', 'DISPUTED', 'REJECTED', 'DOCUMENTED'],
  VERIFIED: ['DISPUTED', 'SUPERSEDED', 'EXPIRED', 'RELEASED'],
  DISPUTED: ['VERIFIED', 'REJECTED', 'SUPERSEDED', 'DOCUMENTED'],
  REJECTED: ['DOCUMENTED', 'PENDING_VERIFICATION'],
  EXPIRED: [],
  RELEASED: [],
  SUPERSEDED: [],
  UNKNOWN: ['CLAIMED', 'DOCUMENTED', 'PENDING_VERIFICATION', 'DISPUTED'],
};

export function validateVerificationStateTransition(
  currentStatus: InterestVerificationStatus,
  targetStatus: InterestVerificationStatus,
  actor: PropertyRightsActorContext,
): void {
  if (currentStatus === targetStatus) return;
  const allowed = ALLOWED_TRANSITIONS[currentStatus] ?? [];
  if (!allowed.includes(targetStatus)) {
    throw new PropertyRightsError(
      'INVALID_STATE_TRANSITION',
      `Transition from '${currentStatus}' to '${targetStatus}' is not permitted.`,
      422,
      { currentStatus, targetStatus },
    );
  }

  if (targetStatus === 'VERIFIED' || targetStatus === 'REJECTED' || currentStatus === 'DISPUTED') {
    assertRequiredRole(actor, ['RIGHTS_VERIFICATION_OFFICER', 'REGISTRY_ADMIN']);
  }
}

export function assertRequiredRole(
  actor: PropertyRightsActorContext,
  allowedRoles: PropertyRightsActorRole[],
): void {
  if (!actor || !actor.isAuthenticated || !actor.actorId || actor.actorId.trim() === '') {
    throw new PropertyRightsError('UNAUTHENTICATED', 'Authenticated actor context is required.', 401);
  }
  if (!allowedRoles.includes(actor.role)) {
    throw new PropertyRightsError(
      'FORBIDDEN',
      `Actor '${actor.actorId}' with role '${actor.role}' is not authorized. Required one of: [${allowedRoles.join(', ')}].`,
      403,
    );
  }
}

export function canReadFullConfidentialOwnership(
  actor: PropertyRightsActorContext,
  partyId?: string,
): boolean {
  if (!actor || !actor.isAuthenticated) return false;
  if (
    actor.role === 'REGISTRY_ADMIN' ||
    actor.role === 'RIGHTS_VERIFICATION_OFFICER' ||
    actor.role === 'AUTHORIZED_REGISTRAR'
  ) {
    return true;
  }
  if (partyId && actor.linkedPartyIds?.includes(partyId)) {
    return true;
  }
  return false;
}

export function assertAuthorizedForPropertyInterestsQuery(
  actor: PropertyRightsActorContext,
  propertyPartyIds: string[],
): void {
  if (!actor || !actor.isAuthenticated) {
    throw new PropertyRightsError(
      'UNAUTHORIZED_ENUMERATION',
      'Public unauthenticated enumeration of private property ownership interests is prohibited.',
      403,
    );
  }
  if (
    actor.role === 'REGISTRY_ADMIN' ||
    actor.role === 'RIGHTS_VERIFICATION_OFFICER' ||
    actor.role === 'AUTHORIZED_REGISTRAR'
  ) {
    return;
  }
  const hasPartyLink = propertyPartyIds.some((pid) => actor.linkedPartyIds?.includes(pid));
  if (!hasPartyLink) {
    throw new PropertyRightsError(
      'UNAUTHORIZED_ENUMERATION',
      `Actor '${actor.actorId}' is not a recorded party on this property and lacks registrar/admin permissions.`,
      403,
    );
  }
}

export function toRedactedOwnershipInterest(
  record: OwnershipInterestRecord,
  actor: PropertyRightsActorContext,
): OwnershipInterestRecord | PublicOrRedactedOwnershipInterestView {
  if (canReadFullConfidentialOwnership(actor, record.partyRef.partyId)) {
    return structuredClone(record);
  }
  const { internalReviewNotes: _notes, partyRef, ...rest } = record;
  const {
    confidentialFullName: _name,
    confidentialNationalOrRegistrationId: _nid,
    ...redactedParty
  } = partyRef;
  return {
    ...structuredClone(rest),
    partyRef: structuredClone(redactedParty),
  };
}

export function clampPaginationLimit(rawLimit?: number): number {
  if (rawLimit === undefined || rawLimit === null || Number.isNaN(Number(rawLimit))) return 25;
  const n = Math.floor(Number(rawLimit));
  if (n < 1) return 1;
  if (n > 100) return 100;
  return n;
}
