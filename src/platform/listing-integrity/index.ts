/**
 * @file src/platform/listing-integrity/index.ts
 * @description Stage 12 (RT-FE-REBUILD-LISTING-DATA-INTEGRITY-012) — Listing Data Integrity,
 * Price & Location Truth, PropertyFact<T> Contract, Publication State Machine & Abuse Reporting.
 */
import type { CityId } from '../../types/models';
import { validateCityNeighborhoodPair } from '../geo-context';

export const RT_FE_REBUILD_STAGE_12_SPEC_ID = 'RT-FE-REBUILD-LISTING-DATA-INTEGRITY-012' as const;

export type ListingCurrencyUnit = 'IRR' | 'IRT';
export type LocationPrecisionTier = 'exact' | 'approximate' | 'neighborhood_only' | 'unknown';
export type PropertyFactQuality = 'provided' | 'verified' | 'estimated' | 'unknown' | 'invalid';

export type ListingPublicationState =
  | 'draft'
  | 'validating'
  | 'ready_to_submit'
  | 'submitting'
  | 'submitted'
  | 'under_review'
  | 'published'
  | 'rejected'
  | 'archived';

export type ListingAbuseReportState = 'REPORT_DRAFT' | 'VALIDATING' | 'SUBMITTING' | 'REPORTED' | 'FAILED';

export interface NormalizedListingMoney {
  readonly amountToman: number;
  readonly amountRial: number;
  readonly originalUnit: ListingCurrencyUnit;
  readonly isEstimated: boolean;
  readonly labelFa: string;
}

export interface PropertyFact<T> {
  readonly value: T | null;
  readonly quality: PropertyFactQuality;
  readonly sourceId: string;
  readonly disclosureFa: string;
}

export function normalizeListingMoney(input: {
  amount: number;
  unit: ListingCurrencyUnit;
  isEstimated?: boolean;
}): NormalizedListingMoney {
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new Error('INVALID_LISTING_PRICE_AMOUNT');
  }
  const amountToman = input.unit === 'IRR' ? Math.round(input.amount / 10) : Math.round(input.amount);
  const amountRial = input.unit === 'IRR' ? Math.round(input.amount) : Math.round(input.amount * 10);
  const isEstimated = Boolean(input.isEstimated);
  return {
    amountToman,
    amountRial,
    originalUnit: input.unit,
    isEstimated,
    labelFa: isEstimated
      ? `${amountToman.toLocaleString('fa-IR')} تومان (برآورد مدل — غیرقطعی)`
      : `${amountToman.toLocaleString('fa-IR')} تومان`,
  };
}

export function validateListingPriceIntegrity(input: {
  declaredTotalToman?: number | null;
  declaredPerSqmToman?: number | null;
  areaSqm?: number | null;
  fabricatedFromDiscountPercent?: boolean;
  substitutedFromNeighborhoodAverage?: boolean;
  isMarkedEstimated?: boolean;
}): {
  readonly valid: boolean;
  readonly issues: readonly string[];
} {
  const issues: string[] = [];
  if (input.fabricatedFromDiscountPercent) {
    issues.push('FABRICATED_PRICE_FROM_DISCOUNT_FORBIDDEN');
  }
  if (input.substitutedFromNeighborhoodAverage && !input.isMarkedEstimated) {
    issues.push('SILENT_NEIGHBORHOOD_AVERAGE_SUBSTITUTION_FORBIDDEN');
  }
  if (
    input.declaredTotalToman != null &&
    input.declaredPerSqmToman != null &&
    input.areaSqm != null &&
    input.areaSqm > 0
  ) {
    const impliedTotal = input.declaredPerSqmToman * input.areaSqm;
    const driftRatio = Math.abs(impliedTotal - input.declaredTotalToman) / Math.max(1, input.declaredTotalToman);
    if (driftRatio > 0.05) {
      issues.push('TOTAL_VS_PER_SQM_MISMATCH_EXCEEDS_5_PERCENT');
    }
  }
  return { valid: issues.length === 0, issues };
}

export function validateListingLocationIntegrity(input: {
  cityId: string;
  neighborhoodId: number;
  latitude?: number | null;
  longitude?: number | null;
  precision: LocationPrecisionTier;
}): {
  readonly valid: boolean;
  readonly issues: readonly string[];
  readonly canonicalCityId: CityId | null;
} {
  const issues: string[] = [];
  const pairCheck = validateCityNeighborhoodPair(input.cityId, input.neighborhoodId);
  if (!pairCheck.valid) {
    issues.push(pairCheck.errorCode ?? 'CITY_NEIGHBORHOOD_MISMATCH');
  }
  if (input.latitude != null || input.longitude != null) {
    const lat = Number(input.latitude);
    const lng = Number(input.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      issues.push('NON_FINITE_COORDINATES');
    } else if (Math.abs(lat) < 0.001 && Math.abs(lng) < 0.001) {
      issues.push('ZERO_NULL_ISLAND_COORDINATES_REJECTED');
    } else if (lat < 24 || lat > 40 || lng < 44 || lng > 64) {
      issues.push('OUT_OF_IRAN_WGS84_BOUNDS');
    }
  } else if (input.precision === 'exact') {
    issues.push('EXACT_PRECISION_REQUIRES_COORDINATES');
  }
  return {
    valid: issues.length === 0,
    issues,
    canonicalCityId: pairCheck.valid ? pairCheck.cityId : null,
  };
}

export function createPropertyFact<T>(
  value: T | null | undefined,
  quality: PropertyFactQuality,
  sourceId: string,
): PropertyFact<T> {
  if (value === undefined || value === null || quality === 'unknown') {
    return {
      value: null,
      quality: quality === 'invalid' ? 'invalid' : 'unknown',
      sourceId,
      disclosureFa: 'نامشخص (بدون جایگزینی با صفر یا مقدار پیش‌فرض)',
    };
  }
  const disclosureMap: Record<PropertyFactQuality, string> = {
    provided: 'اعلام‌شده توسط ثبت‌کننده',
    verified: 'تأییدشده با مدرک معتبر',
    estimated: 'برآورد آماری/مدل (غیرقطعی)',
    unknown: 'نامشخص',
    invalid: 'مقدار نامعتبر',
  };
  return {
    value,
    quality,
    sourceId,
    disclosureFa: disclosureMap[quality],
  };
}

export function transitionListingPublicationState(input: {
  currentState: ListingPublicationState;
  intent: 'VALIDATE' | 'MARK_READY' | 'SUBMIT' | 'SERVER_ACK_SUBMITTED' | 'SERVER_REVIEW' | 'SERVER_PUBLISH' | 'SERVER_REJECT';
  idempotencyKey?: string;
  serverConfirmedListingId?: string | null;
}): {
  readonly allowed: boolean;
  readonly nextState: ListingPublicationState;
  readonly reasonCode: string;
} {
  if (input.intent === 'SERVER_PUBLISH') {
    if (!input.serverConfirmedListingId || !input.idempotencyKey) {
      return {
        allowed: false,
        nextState: input.currentState,
        reasonCode: 'PUBLISH_REQUIRES_BACKEND_CONFIRMATION_AND_IDEMPOTENCY_KEY',
      };
    }
    return { allowed: true, nextState: 'published', reasonCode: 'PUBLISHED_BY_BACKEND_CONFIRMATION' };
  }
  if (input.intent === 'SUBMIT') {
    if (!input.idempotencyKey || input.idempotencyKey.trim().length < 8) {
      return {
        allowed: false,
        nextState: input.currentState,
        reasonCode: 'MISSING_IDEMPOTENCY_KEY',
      };
    }
    return { allowed: true, nextState: 'submitting', reasonCode: 'SUBMITTING_WITH_IDEMPOTENCY_KEY' };
  }
  const transitions: Record<string, ListingPublicationState> = {
    VALIDATE: 'validating',
    MARK_READY: 'ready_to_submit',
    SERVER_ACK_SUBMITTED: 'submitted',
    SERVER_REVIEW: 'under_review',
    SERVER_REJECT: 'rejected',
  };
  return {
    allowed: true,
    nextState: transitions[input.intent] ?? input.currentState,
    reasonCode: 'TRANSITION_APPLIED',
  };
}

export function evaluateAbuseReportSubmission(input: {
  listingId: string;
  reasonCode: string;
  idempotencyKey: string;
  serverReportId?: string | null;
}): {
  readonly state: ListingAbuseReportState;
  readonly persistedOnServer: boolean;
} {
  if (!input.listingId.trim() || !input.reasonCode.trim() || input.idempotencyKey.trim().length < 6) {
    return { state: 'FAILED', persistedOnServer: false };
  }
  if (!input.serverReportId) {
    return { state: 'SUBMITTING', persistedOnServer: false };
  }
  return { state: 'REPORTED', persistedOnServer: true };
}
