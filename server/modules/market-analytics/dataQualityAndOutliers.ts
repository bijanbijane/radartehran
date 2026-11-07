/**
 * @file server/modules/market-analytics/dataQualityAndOutliers.ts
 * @description Pure Data-Quality Validation, Source Category Labeling, Upstream Contract Adapters,
 * Deduplication, Missing-Data Safeguards, and Statistical Outlier Detection (Employee 10).
 */

import { defaultGeographicService, type SupportedCityId } from '../geography';
import type {
  ApprovedBargainListingContract,
  CrowdMarketObservationContract,
  DataQualityReport,
  MarketMode,
  MarketObservationRecord,
  ObservationSourceCategory,
  OutlierDetectionResult,
  OutlierEntry,
  RejectedObservationEntry,
  ValuationModelVersionSpec,
} from './types';

export const CANONICAL_ANALYTICS_MODEL_VERSION = 'v1.0.0-market-analytics-2026.11';

export const DEFAULT_VALUATION_MODEL_SPEC: ValuationModelVersionSpec = {
  modelVersion: CANONICAL_ANALYTICS_MODEL_VERSION,
  releasedAtIso: '2026-11-07T00:00:00.000Z',
  currentJalaliYear: 1405,
  monthlyRentToRahnRate: 0.03, // 30M Rahn <-> 0.9M Monthly Rent (3% monthly conversion)
  askingToTransactionAdjustment: {
    verified_transaction: 1.0, // Actual completed transaction price (no haircut)
    approved_property_listing: 0.94, // Approved vetted listing asking price (-6% negotiation spread)
    public_asking_price: 0.92, // Unvetted public asking price (-8% negotiation spread)
    user_submitted_observation: 0.93, // Crowd-submitted quote observation (-7% spread)
    model_derived_estimate: 1.0, // Excluded from primary empirical pool
  },
  sourceCategoryBaseWeight: {
    verified_transaction: 1.0,
    approved_property_listing: 0.8,
    public_asking_price: 0.55,
    user_submitted_observation: 0.45,
    model_derived_estimate: 0.0,
  },
  temporalHalfLifeDays: 45,
  maxObservationAgeDays: 180,
  iqrOutlierMultiplier: 1.5,
  minSampleSizeForRange: 3,
  minSampleSizeForAuthoritativeCentral: 5,
  maxCoefficientOfVariationForCentral: 0.28,
};

export const SOURCE_CATEGORY_META: Record<
  ObservationSourceCategory,
  { labelFa: string; isTransaction: boolean; descriptionFa: string }
> = {
  verified_transaction: {
    labelFa: 'معامله قطعی ثبت‌شده',
    isTransaction: true,
    descriptionFa: 'قیمت نهایی معامله انجام‌شده و تاییدشده (بدون کسر حاشیه چانه‌زنی).',
  },
  approved_property_listing: {
    labelFa: 'آگهی تاییدشده پلتفرم',
    isTransaction: false,
    descriptionFa: 'قیمت پیشنهادی در آگهی‌های احرازشده (با اعمال ضریب تعدیل مذاکره به معامله).',
  },
  public_asking_price: {
    labelFa: 'قیمت اعلامی عمومی بازار',
    isTransaction: false,
    descriptionFa: 'نرخ اعلامی فروشنده/موجر در آگهی‌های عمومی (متفاوت از قیمت معامله قطعی).',
  },
  user_submitted_observation: {
    labelFa: 'گزارش میدانی کاربران',
    isTransaction: false,
    descriptionFa: 'مشاهدات ارسالی کاربران و مشاوران محلی (با وزن‌دهی محافظه‌کارانه).',
  },
  model_derived_estimate: {
    labelFa: 'برآورد مشتق از مدل',
    isTransaction: false,
    descriptionFa: 'برآورد محاسباتی مدل (هرگز به عنوان داده مشاهده‌شده اولیه ترکیب نمی‌شود).',
  },
};

/**
 * Checks whether a value is a valid finite number (never coerces null/undefined/boolean/"" to 0).
 */
export function isFiniteNumber(val: unknown): val is number {
  return typeof val === 'number' && Number.isFinite(val);
}

/**
 * Converts an Approved Bargain Listing Contract into a normalized MarketObservationRecord.
 * Returns null if the bargain is not in 'approved' status.
 */
export function adaptApprovedBargainToObservation(
  bargain: ApprovedBargainListingContract
): MarketObservationRecord | null {
  if (!bargain || bargain.status !== 'approved') return null;
  return {
    observationId: `bargain:${bargain.id}`,
    cityId: bargain.cityId,
    hoodId: bargain.hoodId,
    marketMode: bargain.dealMode,
    sourceCategory: 'approved_property_listing',
    observedAtIso: bargain.observedAtIso,
    sqm: isFiniteNumber(bargain.sqm) ? bargain.sqm : null,
    totalPriceMillion:
      bargain.dealMode === 'sale' && isFiniteNumber(bargain.askingTotalMillion)
        ? bargain.askingTotalMillion
        : null,
    depositMillion:
      bargain.dealMode === 'rental' && isFiniteNumber(bargain.depositMillion)
        ? bargain.depositMillion
        : null,
    monthlyRentMillion:
      bargain.dealMode === 'rental' && isFiniteNumber(bargain.monthlyRentMillion)
        ? bargain.monthlyRentMillion
        : null,
    buildYear: isFiniteNumber(bargain.buildYear) ? bargain.buildYear : null,
    buildingAgeYears: isFiniteNumber(bargain.buildingAgeYears) ? bargain.buildingAgeYears : null,
    floor: isFiniteNumber(bargain.floor) ? bargain.floor : null,
    totalFloors: isFiniteNumber(bargain.totalFloors) ? bargain.totalFloors : null,
    hasParking: typeof bargain.hasParking === 'boolean' ? bargain.hasParking : null,
    hasElevator: typeof bargain.hasElevator === 'boolean' ? bargain.hasElevator : null,
    hasStorage: typeof bargain.hasStorage === 'boolean' ? bargain.hasStorage : null,
    renovationGrade: bargain.renovationGrade ?? null,
    reliabilityWeight: 1.0,
  };
}

/**
 * Converts a Crowd Claim Contract into a normalized MarketObservationRecord.
 * Document-verified completed deals map to 'verified_transaction'; others map to 'user_submitted_observation'.
 */
export function adaptCrowdClaimToObservation(
  claim: CrowdMarketObservationContract
): MarketObservationRecord | null {
  if (!claim || claim.verificationState === 'rejected') return null;
  const isVerifiedDeal =
    claim.claimType === 'completed_deal_report' &&
    claim.verificationState === 'verified_by_document';
  return {
    observationId: `crowd:${claim.claimId}`,
    cityId: claim.cityId,
    hoodId: claim.hoodId,
    marketMode: claim.marketMode,
    sourceCategory: isVerifiedDeal ? 'verified_transaction' : 'user_submitted_observation',
    observedAtIso: claim.observedAtIso,
    sqm: isFiniteNumber(claim.sqm) ? claim.sqm : null,
    totalPriceMillion:
      claim.marketMode === 'sale' && isFiniteNumber(claim.reportedTotalMillion)
        ? claim.reportedTotalMillion
        : null,
    depositMillion:
      claim.marketMode === 'rental' && isFiniteNumber(claim.reportedDepositMillion)
        ? claim.reportedDepositMillion
        : null,
    monthlyRentMillion:
      claim.marketMode === 'rental' && isFiniteNumber(claim.reportedMonthlyRentMillion)
        ? claim.reportedMonthlyRentMillion
        : null,
    buildYear: isFiniteNumber(claim.buildYear) ? claim.buildYear : null,
    buildingAgeYears: isFiniteNumber(claim.buildingAgeYears) ? claim.buildingAgeYears : null,
    floor: isFiniteNumber(claim.floor) ? claim.floor : null,
    totalFloors: isFiniteNumber(claim.totalFloors) ? claim.totalFloors : null,
    hasParking: typeof claim.hasParking === 'boolean' ? claim.hasParking : null,
    hasElevator: typeof claim.hasElevator === 'boolean' ? claim.hasElevator : null,
    hasStorage: typeof claim.hasStorage === 'boolean' ? claim.hasStorage : null,
    renovationGrade: claim.renovationGrade ?? null,
    reliabilityWeight: isFiniteNumber(claim.reporterTrustWeight) ? claim.reporterTrustWeight : null,
  };
}

export interface SanitizedObservationsBundle {
  validObservations: Array<MarketObservationRecord & { ageDays: number; rawRahnEquivalentMillion: number | null }>;
  rejections: RejectedObservationEntry[];
  rejectedDuplicateCount: number;
  rejectedInvalidCount: number;
  missingAreaCount: number;
  missingAgeCount: number;
  missingAmenitiesCount: number;
}

/**
 * Validates, separates by marketMode, checks geography consistency, rejects missing/zero/negative prices,
 * and deduplicates observations.
 */
export function sanitizeAndDeduplicateObservations(params: {
  observations: ReadonlyArray<MarketObservationRecord>;
  expectedCityId: SupportedCityId;
  expectedHoodId: number;
  expectedMarketMode: MarketMode;
  referenceTimestampIso: string;
  modelSpec?: ValuationModelVersionSpec;
}): SanitizedObservationsBundle {
  const model = params.modelSpec ?? DEFAULT_VALUATION_MODEL_SPEC;
  const refMs = Date.parse(params.referenceTimestampIso);
  const validRefMs = Number.isFinite(refMs) ? refMs : Date.now();
  const seenIds = new Set<string>();
  const seenFingerprints = new Set<string>();
  const validObservations: SanitizedObservationsBundle['validObservations'] = [];
  const rejections: RejectedObservationEntry[] = [];
  let rejectedDuplicateCount = 0;
  let rejectedInvalidCount = 0;
  let missingAreaCount = 0;
  let missingAgeCount = 0;
  let missingAmenitiesCount = 0;

  for (const obs of params.observations) {
    const id = String(obs?.observationId || '').trim() || 'unknown_id';
    if (seenIds.has(id)) {
      rejectedDuplicateCount++;
      rejections.push({ observationId: id, reason: 'DUPLICATE_OBSERVATION_ID', detail: `Duplicate ID '${id}' excluded.` });
      continue;
    }

    if (obs.sourceCategory === 'model_derived_estimate') {
      rejectedInvalidCount++;
      rejections.push({
        observationId: id,
        reason: 'MODEL_DERIVED_EXCLUDED_FROM_PRIMARY_EVIDENCE',
        detail: 'Model-derived estimates cannot be fed back as primary market observations.',
      });
      continue;
    }

    const geoCheck = defaultGeographicService.validateCityNeighborhood(obs.cityId, obs.hoodId);
    if (!geoCheck.valid || obs.cityId !== params.expectedCityId || obs.hoodId !== params.expectedHoodId) {
      rejectedInvalidCount++;
      rejections.push({
        observationId: id,
        reason: 'INVALID_GEOGRAPHY_REFERENCE',
        detail: geoCheck.errorMessage || `Observation geography (${obs.cityId}:${obs.hoodId}) does not match target (${params.expectedCityId}:${params.expectedHoodId}).`,
      });
      continue;
    }

    if (obs.marketMode !== params.expectedMarketMode) {
      rejectedInvalidCount++;
      rejections.push({
        observationId: id,
        reason: 'CROSS_MODE_CONTAMINATION',
        detail: `Observation mode '${obs.marketMode}' cannot be mixed into '${params.expectedMarketMode}' valuation.`,
      });
      continue;
    }

    const obsMs = Date.parse(obs.observedAtIso);
    if (!Number.isFinite(obsMs) || obsMs > validRefMs + 60_000) {
      rejectedInvalidCount++;
      rejections.push({
        observationId: id,
        reason: 'INVALID_OR_FUTURE_TIMESTAMP',
        detail: `Timestamp '${obs.observedAtIso}' is invalid or in the future relative to '${params.referenceTimestampIso}'.`,
      });
      continue;
    }

    const ageDays = Math.max(0, (validRefMs - obsMs) / 86_400_000);
    if (ageDays > model.maxObservationAgeDays) {
      rejectedInvalidCount++;
      rejections.push({
        observationId: id,
        reason: 'STALE_OBSERVATION_EXCEEDED_MAX_AGE',
        detail: `Observation age (${ageDays.toFixed(1)} days) exceeds max allowed ${model.maxObservationAgeDays} days.`,
      });
      continue;
    }

    if (obs.sqm !== null && (!isFiniteNumber(obs.sqm) || obs.sqm < 20 || obs.sqm > 2000)) {
      rejectedInvalidCount++;
      rejections.push({
        observationId: id,
        reason: 'INVALID_AREA_SQM',
        detail: `Invalid area sqm=${String(obs.sqm)}; must be null (unknown) or within [20, 2000].`,
      });
      continue;
    }

    let rawRahnEquivalentMillion: number | null = null;
    if (params.expectedMarketMode === 'sale') {
      if (!isFiniteNumber(obs.totalPriceMillion) || obs.totalPriceMillion <= 0) {
        rejectedInvalidCount++;
        rejections.push({
          observationId: id,
          reason: 'MISSING_OR_NON_POSITIVE_PRICE',
          detail: 'Sale observation requires a positive finite totalPriceMillion.',
        });
        continue;
      }
    } else {
      const hasDeposit = isFiniteNumber(obs.depositMillion) && obs.depositMillion >= 0;
      const hasRent = isFiniteNumber(obs.monthlyRentMillion) && obs.monthlyRentMillion >= 0;
      if (!hasDeposit && !hasRent) {
        rejectedInvalidCount++;
        rejections.push({
          observationId: id,
          reason: 'MISSING_OR_NON_POSITIVE_PRICE',
          detail: 'Rental observation requires depositMillion and/or monthlyRentMillion.',
        });
        continue;
      }
      const depositPart = hasDeposit ? (obs.depositMillion as number) : 0;
      const rentPart = hasRent ? (obs.monthlyRentMillion as number) / model.monthlyRentToRahnRate : 0;
      rawRahnEquivalentMillion = Math.round((depositPart + rentPart) * 100) / 100;
      if (rawRahnEquivalentMillion <= 0) {
        rejectedInvalidCount++;
        rejections.push({
          observationId: id,
          reason: 'MISSING_OR_NON_POSITIVE_PRICE',
          detail: 'Rental observation total Rahn-equivalent must be strictly positive.',
        });
        continue;
      }
    }

    const dayKey = obs.observedAtIso.slice(0, 10);
    const priceKey = params.expectedMarketMode === 'sale' ? obs.totalPriceMillion : rawRahnEquivalentMillion;
    const fingerprint = `${obs.cityId}|${obs.hoodId}|${obs.marketMode}|${obs.sourceCategory}|${obs.sqm ?? 'na'}|${priceKey}|${obs.floor ?? 'na'}|${dayKey}`;
    if (seenFingerprints.has(fingerprint)) {
      rejectedDuplicateCount++;
      rejections.push({
        observationId: id,
        reason: 'DUPLICATE_CONTENT_FINGERPRINT',
        detail: 'Duplicate observation content fingerprint on the same day.',
      });
      continue;
    }

    seenIds.add(id);
    seenFingerprints.add(fingerprint);
    if (obs.sqm === null) missingAreaCount++;
    if (obs.buildYear === null && obs.buildingAgeYears === null) missingAgeCount++;
    if (obs.hasParking === null || obs.hasElevator === null || obs.hasStorage === null) missingAmenitiesCount++;

    validObservations.push({
      ...obs,
      observationId: id,
      ageDays: Math.round(ageDays * 100) / 100,
      rawRahnEquivalentMillion,
    });
  }

  return {
    validObservations,
    rejections,
    rejectedDuplicateCount,
    rejectedInvalidCount,
    missingAreaCount,
    missingAgeCount,
    missingAmenitiesCount,
  };
}

/**
 * Computes exact linear-interpolated percentile on a sorted ascending numeric array.
 */
export function computeQuantile(sortedAsc: ReadonlyArray<number>, q: number): number | null {
  if (sortedAsc.length === 0) return null;
  if (sortedAsc.length === 1) return sortedAsc[0];
  const pos = (sortedAsc.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  const nextVal = sortedAsc[base + 1] !== undefined ? sortedAsc[base + 1] : sortedAsc[base];
  return sortedAsc[base] + rest * (nextVal - sortedAsc[base]);
}

/**
 * Identifies statistical outliers using Tukey's IQR fence combined with a robust median ratio guard.
 */
export function detectStatisticalOutliers(
  items: ReadonlyArray<{ observationId: string; sourceCategory: ObservationSourceCategory; metricValue: number }>,
  iqrMultiplier = 1.5
): OutlierDetectionResult {
  if (items.length < 4) {
    const sorted = items.map((i) => i.metricValue).sort((a, b) => a - b);
    return {
      method: 'tukey_iqr_and_mad_guard',
      iqrMultiplier,
      q1: computeQuantile(sorted, 0.25),
      median: computeQuantile(sorted, 0.5),
      q3: computeQuantile(sorted, 0.75),
      iqr: null,
      lowerFence: null,
      upperFence: null,
      inlierIds: items.map((i) => i.observationId),
      outliers: [],
    };
  }

  const sortedValues = items.map((i) => i.metricValue).sort((a, b) => a - b);
  const q1 = computeQuantile(sortedValues, 0.25)!;
  const median = computeQuantile(sortedValues, 0.5)!;
  const q3 = computeQuantile(sortedValues, 0.75)!;
  const rawIqr = Math.max(q3 - q1, median * 0.04);
  const lowerFence = Math.max(median * 0.35, q1 - iqrMultiplier * rawIqr);
  const upperFence = Math.min(median * 2.5, q3 + iqrMultiplier * rawIqr);

  const inlierIds: string[] = [];
  const outliers: OutlierEntry[] = [];

  for (const item of items) {
    if (item.metricValue < lowerFence) {
      outliers.push({
        observationId: item.observationId,
        sourceCategory: item.sourceCategory,
        metricValue: Math.round(item.metricValue * 100) / 100,
        direction: 'low_extreme',
        fenceThreshold: Math.round(lowerFence * 100) / 100,
        explanation: `مقدار (${item.metricValue.toFixed(1)}) پایین‌تر از مرز آماری پایین (${lowerFence.toFixed(1)}) قرار دارد و به عنوان داده پرت حذف شد.`,
      });
    } else if (item.metricValue > upperFence) {
      outliers.push({
        observationId: item.observationId,
        sourceCategory: item.sourceCategory,
        metricValue: Math.round(item.metricValue * 100) / 100,
        direction: 'high_extreme',
        fenceThreshold: Math.round(upperFence * 100) / 100,
        explanation: `مقدار (${item.metricValue.toFixed(1)}) بالاتر از مرز آماری بالا (${upperFence.toFixed(1)}) قرار دارد و به عنوان داده پرت حذف شد.`,
      });
    } else {
      inlierIds.push(item.observationId);
    }
  }

  return {
    method: 'tukey_iqr_and_mad_guard',
    iqrMultiplier,
    q1: Math.round(q1 * 100) / 100,
    median: Math.round(median * 100) / 100,
    q3: Math.round(q3 * 100) / 100,
    iqr: Math.round(rawIqr * 100) / 100,
    lowerFence: Math.round(lowerFence * 100) / 100,
    upperFence: Math.round(upperFence * 100) / 100,
    inlierIds,
    outliers,
  };
}
