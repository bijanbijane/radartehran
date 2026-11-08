/**
 * Property Transaction & Deal Management Pure Validation & Sanitization Engine
 * (`server/modules/property-transactions/validation.ts`)
 * Exclusive ownership: `server/modules/property-transactions/`
 */

import type {
  DealParticipant,
  ParticipantRole,
  PurchaseOfferTerms,
  RentalOfferTerms,
  TransactionType,
} from './types';

export class DealValidationError extends Error {
  public readonly code: string;
  public readonly field?: string;

  constructor(code: string, message: string, field?: string) {
    super(message);
    this.name = 'DealValidationError';
    this.code = code;
    this.field = field;
  }
}

export function sanitizeText(input: unknown, maxLength = 1000): string {
  if (typeof input !== 'string') return '';
  return input
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, maxLength);
}

export function validateSafeFirestoreId(id: unknown, fieldName: string): string {
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{3,128}$/.test(id)) {
    throw new DealValidationError('INVALID_IDENTIFIER', `Invalid ${fieldName} identifier.`, fieldName);
  }
  return id;
}

export function validateIsoDateString(isoString: unknown, fieldName: string, requireFuture = false): string {
  if (typeof isoString !== 'string') {
    throw new DealValidationError('INVALID_TIMESTAMP', `${fieldName} must be an ISO date string.`, fieldName);
  }
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    throw new DealValidationError('INVALID_TIMESTAMP', `${fieldName} is not a valid date.`, fieldName);
  }
  if (requireFuture && date.getTime() <= Date.now()) {
    throw new DealValidationError('PAST_TIMESTAMP_DISALLOWED', `${fieldName} must be in the future.`, fieldName);
  }
  return date.toISOString();
}

export function validatePurchaseOfferTerms(terms: unknown): PurchaseOfferTerms {
  if (!terms || typeof terms !== 'object') {
    throw new DealValidationError('INVALID_OFFER_TERMS', 'Purchase offer terms must be an object.');
  }
  const t = terms as Record<string, unknown>;

  if (typeof t.purchasePriceMillionToman !== 'number' || !Number.isFinite(t.purchasePriceMillionToman) || t.purchasePriceMillionToman <= 0) {
    throw new DealValidationError('INVALID_PURCHASE_PRICE', 'Purchase price must be a positive number in Million Toman.', 'purchasePriceMillionToman');
  }
  if (t.purchasePriceMillionToman > 10_000_000) {
    throw new DealValidationError('PRICE_EXCEEDS_MAX_CAP', 'Purchase price exceeds system maximum threshold.', 'purchasePriceMillionToman');
  }
  if (t.currency !== 'IRT') {
    throw new DealValidationError('INVALID_CURRENCY', 'Currency must strictly be Iranian Toman (IRT).', 'currency');
  }

  const paymentConditions = sanitizeText(t.paymentConditionsSummary, 500);
  if (paymentConditions.length < 3) {
    throw new DealValidationError('MISSING_PAYMENT_CONDITIONS', 'Payment conditions summary is required.', 'paymentConditionsSummary');
  }

  let earnestMoney: number | undefined;
  if (t.earnestMoneyDepositMillionToman !== undefined) {
    if (typeof t.earnestMoneyDepositMillionToman !== 'number' || t.earnestMoneyDepositMillionToman < 0 || t.earnestMoneyDepositMillionToman > t.purchasePriceMillionToman) {
      throw new DealValidationError('INVALID_EARNEST_MONEY', 'Earnest money deposit must be non-negative and <= purchase price.', 'earnestMoneyDepositMillionToman');
    }
    earnestMoney = t.earnestMoneyDepositMillionToman;
  }

  return {
    purchasePriceMillionToman: Math.round(t.purchasePriceMillionToman * 100) / 100,
    currency: 'IRT',
    paymentConditionsSummary: paymentConditions,
    earnestMoneyDepositMillionToman: earnestMoney,
    financingContingencyDays: typeof t.financingContingencyDays === 'number' && t.financingContingencyDays >= 0 ? Math.min(180, Math.floor(t.financingContingencyDays)) : undefined,
    closingDaysLimit: typeof t.closingDaysLimit === 'number' && t.closingDaysLimit >= 0 ? Math.min(365, Math.floor(t.closingDaysLimit)) : undefined,
    includedFixturesSummary: sanitizeText(t.includedFixturesSummary, 300) || undefined,
    additionalTerms: sanitizeText(t.additionalTerms, 1000) || undefined,
  };
}

export function validateRentalOfferTerms(terms: unknown): RentalOfferTerms {
  if (!terms || typeof terms !== 'object') {
    throw new DealValidationError('INVALID_OFFER_TERMS', 'Rental offer terms must be an object.');
  }
  const t = terms as Record<string, unknown>;

  if (typeof t.depositMillionToman !== 'number' || !Number.isFinite(t.depositMillionToman) || t.depositMillionToman < 0) {
    throw new DealValidationError('INVALID_DEPOSIT', 'Rental deposit must be a non-negative number in Million Toman.', 'depositMillionToman');
  }
  if (typeof t.monthlyRentMillionToman !== 'number' || !Number.isFinite(t.monthlyRentMillionToman) || t.monthlyRentMillionToman < 0) {
    throw new DealValidationError('INVALID_MONTHLY_RENT', 'Monthly rent must be a non-negative number in Million Toman.', 'monthlyRentMillionToman');
  }
  if (t.depositMillionToman === 0 && t.monthlyRentMillionToman === 0) {
    throw new DealValidationError('ZERO_FINANCIAL_OFFER', 'Deposit and monthly rent cannot both be zero.', 'depositMillionToman');
  }
  if (t.currency !== 'IRT') {
    throw new DealValidationError('INVALID_CURRENCY', 'Currency must strictly be Iranian Toman (IRT).', 'currency');
  }

  if (typeof t.leaseDurationMonths !== 'number' || !Number.isInteger(t.leaseDurationMonths) || t.leaseDurationMonths < 1 || t.leaseDurationMonths > 120) {
    throw new DealValidationError('INVALID_LEASE_DURATION', 'Lease duration must be between 1 and 120 months.', 'leaseDurationMonths');
  }

  const startDateIso = validateIsoDateString(t.proposedStartDateIso, 'proposedStartDateIso', false);

  return {
    depositMillionToman: Math.round(t.depositMillionToman * 100) / 100,
    monthlyRentMillionToman: Math.round(t.monthlyRentMillionToman * 100) / 100,
    currency: 'IRT',
    leaseDurationMonths: t.leaseDurationMonths,
    proposedStartDateIso: startDateIso,
    occupantCount: typeof t.occupantCount === 'number' && t.occupantCount >= 1 ? Math.min(50, Math.floor(t.occupantCount)) : undefined,
    petClause: sanitizeText(t.petClause, 200) || undefined,
    additionalRentalConditions: sanitizeText(t.additionalRentalConditions, 1000) || undefined,
  };
}

export function validateOfferTransactionMatch(transactionType: TransactionType, purchaseTerms?: PurchaseOfferTerms, rentalTerms?: RentalOfferTerms): void {
  if (transactionType === 'sale') {
    if (rentalTerms) {
      throw new DealValidationError('CONTRADICTORY_OFFER_TYPES', 'Sale deals cannot contain rentalTerms.');
    }
    if (!purchaseTerms) {
      throw new DealValidationError('MISSING_PURCHASE_TERMS', 'Sale deals require purchaseTerms.');
    }
  } else if (transactionType === 'rental') {
    if (purchaseTerms) {
      throw new DealValidationError('CONTRADICTORY_OFFER_TYPES', 'Rental deals cannot contain purchaseTerms.');
    }
    if (!rentalTerms) {
      throw new DealValidationError('MISSING_RENTAL_TERMS', 'Rental deals require rentalTerms.');
    }
  }
}

export function assertParticipantCanSubmitOffer(participant: DealParticipant, transactionType: TransactionType): void {
  if (!participant.isActive) {
    throw new DealValidationError('INACTIVE_PARTICIPANT', 'Inactive participants cannot submit offers.');
  }
  if (!participant.canSubmitOffers) {
    throw new DealValidationError('UNAUTHORIZED_PARTICIPANT_ROLE', `Role ${participant.role} is not authorized to submit offers.`);
  }
}

export function assertParticipantCanAcceptOffer(participant: DealParticipant): void {
  if (!participant.isActive) {
    throw new DealValidationError('INACTIVE_PARTICIPANT', 'Inactive participants cannot accept offers.');
  }
  if (!participant.canAcceptOffers) {
    throw new DealValidationError('UNAUTHORIZED_PARTICIPANT_ROLE', `Role ${participant.role} is not authorized to accept offers.`);
  }
}

export function validateViewingDuration(durationMinutes: unknown): number {
  if (typeof durationMinutes !== 'number' || !Number.isInteger(durationMinutes) || durationMinutes < 15 || durationMinutes > 240) {
    throw new DealValidationError('INVALID_VIEWING_DURATION', 'Viewing duration must be between 15 and 240 minutes.', 'durationMinutes');
  }
  return durationMinutes;
}
