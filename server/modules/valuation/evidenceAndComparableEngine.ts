import crypto from 'crypto';
import type {
  ComparablePropertyCandidate,
  CurrencyUnit,
  MarketEvidenceRecord,
  MarketEvidenceSourceType,
  NeighborhoodBaselineRecord,
  PropertyCategory,
  PropertyValuationInput,
  ValuationModelConfiguration,
  ValuationTransactionType,
} from './types';
import { normalizeCurrencyToMillionToman } from './validation';
import {
  isEvidenceEligibleForOfficialBaseline,
  resolveInitialEvidenceVerificationStatus,
} from './evidenceVerificationPolicy';

export function createDefaultModelConfiguration(nowIso = new Date().toISOString()): ValuationModelConfiguration {
  return {
    id: 'val_cfg_v2_2_0',
    modelVersion: 'hedonic_ir_v2.2.0',
    configVersion: 1,
    status: 'ACTIVE',
    categoryMultipliers: {
      residential: 1.0,
      detached_house: 1.18,
      villa_garden: 1.28,
      commercial: 1.85,
      office: 1.25,
      industrial: 0.65,
      land: 1.0,
      land_development: 0.92,
      agricultural: 0.25,
      mixed_use: 1.35,
      entire_building: 1.12,
    },
    renovationWeightsPct: {
      luxury_renovated: 9.0,
      renovated: 4.5,
      standard: 0,
      needs_renovation: -8.5,
    },
    elevatorWeightPct: 2.5,
    noElevatorHighFloorPenaltyPct: -9.0,
    parkingWeightPct: 5.5,
    storageWeightPct: 1.8,
    deedSinglePageWeightPct: 2.0,
    deedPromissoryPenaltyPct: -12.0,
    maxSingleFactorContributionPct: 30.0,
    maxTotalAdjustmentPct: 65.0,
    outlierIqrMultiplier: 1.6,
    minPricePerSqmMillion: 5.0,
    maxPricePerSqmMillion: 1500.0,
    minComparableSampleCount: 3,
    maxComparableDistanceMeters: 3500,
    maxComparableAgeDays: 180,
    monthlyInflationTrendPct: 2.4,
    rahnToRentMonthlyRatePct: 3.0,
    furnishedRentalPremiumPct: 18.0,
    shortTermLeasePremiumPct: 12.0,
    longTermLeaseDiscountPct: -5.0,
    createdByUid: 'system_bootstrap',
    createdAtIso: nowIso,
    changeReason: 'Initial production hedonic model configuration',
  };
}

export const SOURCE_RELIABILITY_WEIGHTS: Record<MarketEvidenceSourceType, number> = {
  VERIFIED_COMPLETED_TRANSACTION: 1.0,
  VERIFIED_RENTAL_CONTRACT: 1.0,
  VERIFIED_PROFESSIONAL_SUBMISSION: 0.85,
  ACTIVE_PUBLISHED_LISTING: 0.68,
  HISTORICAL_LISTING: 0.55,
  APPROVED_MANUAL_OBSERVATION: 0.60,
};

export function computeEvidenceDedupeSignature(params: {
  cityId: string;
  hoodId: number;
  propertyCategory: PropertyCategory;
  transactionType: ValuationTransactionType;
  sqm: number;
  buildYear?: number;
  floor?: number;
  normalizedTotalMillion: number;
}): string {
  const roundedSqm = Math.round(params.sqm);
  const roundedPrice = Math.round(params.normalizedTotalMillion / 10) * 10;
  const raw = `${params.cityId}|${params.hoodId}|${params.propertyCategory}|${params.transactionType}|${roundedSqm}|${params.buildYear ?? 'na'}|${params.floor ?? 'na'}|${roundedPrice}`;
  return crypto.createHash('sha256').update(raw, 'utf8').digest('hex').slice(0, 24);
}

export function computeMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function computePercentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * p)));
  return sorted[idx];
}

export function buildMarketEvidenceRecord(params: {
  id?: string;
  sourceType: MarketEvidenceSourceType;
  sourceRecordId: string;
  cityId: string;
  districtId?: string;
  hoodId: number;
  subNeighborhoodId?: string;
  propertyCategory: PropertyCategory;
  transactionType: ValuationTransactionType;
  sqm: number;
  landAreaSqm?: number;
  buildYear?: number;
  floor?: number;
  bedrooms?: number;
  hasElevator?: boolean;
  hasParking?: boolean;
  hasStorage?: boolean;
  renovationCondition?: MarketEvidenceRecord['renovationCondition'];
  coordinates?: { lat: number; lng: number };
  rawCurrencyUnit?: CurrencyUnit;
  rawTotalAmount: number;
  rawMonthlyRentAmount?: number;
  privateParticipantRef?: string;
  confidentialNotes?: string;
  observedAtIso?: string;
  existingEvidence: MarketEvidenceRecord[];
  config: ValuationModelConfiguration;
  nowIso: string;
}): MarketEvidenceRecord {
  const unit = params.rawCurrencyUnit ?? 'IRT_MILLION';
  const normalizedTotalMillion = normalizeCurrencyToMillionToman(params.rawTotalAmount, unit);
  const normalizedMonthlyRentMillion =
    params.rawMonthlyRentAmount !== undefined
      ? normalizeCurrencyToMillionToman(params.rawMonthlyRentAmount, unit)
      : undefined;

  const fullEquivalentMillion =
    params.transactionType === 'rent' && normalizedMonthlyRentMillion !== undefined
      ? normalizedTotalMillion + normalizedMonthlyRentMillion / (params.config.rahnToRentMonthlyRatePct / 100)
      : normalizedTotalMillion;

  const normalizedPricePerSqmMillion = Number((fullEquivalentMillion / Math.max(1, params.sqm)).toFixed(3));
  const isCompletedTransaction =
    params.sourceType === 'VERIFIED_COMPLETED_TRANSACTION' || params.sourceType === 'VERIFIED_RENTAL_CONTRACT';
  const isAskingPrice = !isCompletedTransaction;

  const dedupeSignature = computeEvidenceDedupeSignature({
    cityId: params.cityId,
    hoodId: params.hoodId,
    propertyCategory: params.propertyCategory,
    transactionType: params.transactionType,
    sqm: params.sqm,
    buildYear: params.buildYear,
    floor: params.floor,
    normalizedTotalMillion: fullEquivalentMillion,
  });

  const duplicate = params.existingEvidence.find(
    (e) =>
      e.sourceRecordId === params.sourceRecordId ||
      (e.dedupeSignature === dedupeSignature && e.verificationStatus !== 'REJECTED'),
  );

  // Check domain and statistical outlier bounds
  let outlierFlag = false;
  let outlierReason: string | undefined;

  if (
    normalizedPricePerSqmMillion < params.config.minPricePerSqmMillion ||
    normalizedPricePerSqmMillion > params.config.maxPricePerSqmMillion
  ) {
    outlierFlag = true;
    outlierReason = `قیمت هر متر (${normalizedPricePerSqmMillion}) خارج از بازه مجاز مدل (${params.config.minPricePerSqmMillion}..${params.config.maxPricePerSqmMillion}) است.`;
  } else {
    const peerValues = params.existingEvidence
      .filter(
        (e) =>
          e.cityId === params.cityId &&
          e.hoodId === params.hoodId &&
          e.propertyCategory === params.propertyCategory &&
          e.transactionType === params.transactionType &&
          !e.outlierFlag &&
          !e.duplicateOfEvidenceId &&
          isEvidenceEligibleForOfficialBaseline(e.verificationStatus, !!e.outlierFlag, e.duplicateOfEvidenceId),
      )
      .map((e) => e.normalizedPricePerSqmMillion);

    if (peerValues.length >= 3) {
      const median = computeMedian(peerValues);
      const q1 = computePercentile(peerValues, 0.25);
      const q3 = computePercentile(peerValues, 0.75);
      const iqr = Math.max(median * 0.12, q3 - q1);
      const lower = q1 - params.config.outlierIqrMultiplier * iqr;
      const upper = q3 + params.config.outlierIqrMultiplier * iqr;
      if (
        normalizedPricePerSqmMillion < lower ||
        normalizedPricePerSqmMillion > upper ||
        Math.abs(normalizedPricePerSqmMillion - median) / Math.max(1, median) > 0.45
      ) {
        outlierFlag = true;
        outlierReason = 'انحراف شدید از میانه محله (داده پرت آماری)';
      }
    }
  }

  return {
    id: params.id ?? `ev_${crypto.randomBytes(6).toString('hex')}`,
    sourceType: params.sourceType,
    sourceRecordId: params.sourceRecordId,
    cityId: params.cityId,
    districtId: params.districtId,
    hoodId: params.hoodId,
    subNeighborhoodId: params.subNeighborhoodId,
    propertyCategory: params.propertyCategory,
    transactionType: params.transactionType,
    sqm: params.sqm,
    landAreaSqm: params.landAreaSqm,
    buildYear: params.buildYear,
    floor: params.floor,
    bedrooms: params.bedrooms,
    hasElevator: params.hasElevator,
    hasParking: params.hasParking,
    hasStorage: params.hasStorage,
    renovationCondition: params.renovationCondition,
    coordinates: params.coordinates,
    rawCurrencyUnit: unit,
    rawTotalAmount: params.rawTotalAmount,
    normalizedTotalMillion: Number(fullEquivalentMillion.toFixed(2)),
    normalizedPricePerSqmMillion,
    normalizedDepositMillion: params.transactionType === 'rent' ? normalizedTotalMillion : undefined,
    normalizedMonthlyRentMillion,
    isAskingPrice,
    isCompletedTransaction,
    reliabilityWeight: SOURCE_RELIABILITY_WEIGHTS[params.sourceType],
    verificationStatus: resolveInitialEvidenceVerificationStatus(params.sourceType, outlierFlag),
    outlierFlag,
    outlierReason,
    duplicateOfEvidenceId: duplicate?.id,
    dedupeSignature,
    privateParticipantRef: params.privateParticipantRef,
    confidentialNotes: params.confidentialNotes,
    observedAtIso: params.observedAtIso ?? params.nowIso,
    ingestedAtIso: params.nowIso,
  };
}

export function calculateHaversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLng * sinLng;
  return Math.round(2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)));
}

export function computeTemporalAdjustmentPct(
  observedAtIso: string | undefined,
  valuationDateIso: string,
  monthlyTrendPct: number,
): number {
  if (!observedAtIso) return 0;
  const obsMs = Date.parse(observedAtIso);
  const valMs = Date.parse(valuationDateIso);
  if (!Number.isFinite(obsMs) || !Number.isFinite(valMs)) return 0;
  const diffDays = (valMs - obsMs) / (1000 * 60 * 60 * 24);
  if (Math.abs(diffDays) < 7) return 0;
  const months = diffDays / 30;
  return Number(Math.max(-35, Math.min(50, months * monthlyTrendPct)).toFixed(2));
}

export function selectAndScoreComparables(params: {
  input: PropertyValuationInput;
  rawCandidates: Array<{
    id: string;
    sqm: number;
    priceNumericMillion: number;
    buildYear?: number;
    hoodId: number;
    distanceMeters?: number;
    coordinates?: { lat: number; lng: number };
    sourceType?: MarketEvidenceSourceType;
    evidenceType?: 'confirmed_transaction' | 'asking_listing';
    approvedAtIso?: string;
    observedAtIso?: string;
    isVerifiedTransaction?: boolean;
    outlierFlag?: boolean;
    duplicateOfEvidenceId?: string;
    verificationStatus?: string;
  }>;
  baselinePerSqmMillion: number;
  config: ValuationModelConfiguration;
  valuationDateIso: string;
}): {
  comparables: ComparablePropertyCandidate[];
  includedComparables: ComparablePropertyCandidate[];
  outlierExcludedIds: string[];
  duplicateExcludedIds: string[];
} {
  const { input, rawCandidates, baselinePerSqmMillion, config, valuationDateIso } = params;
  const outlierExcludedIds: string[] = [];
  const duplicateExcludedIds: string[] = [];

  const validPsmValues = rawCandidates
    .filter(
      (c) =>
        c.sqm > 0 &&
        c.priceNumericMillion > 0 &&
        !c.duplicateOfEvidenceId &&
        isEvidenceEligibleForOfficialBaseline(String(c.verificationStatus || 'PENDING_REVIEW'), !!c.outlierFlag, c.duplicateOfEvidenceId),
    )
    .map((c) => c.priceNumericMillion / c.sqm);
  const medianRawPsm = validPsmValues.length > 0 ? computeMedian(validPsmValues) : baselinePerSqmMillion;

  const comparables: ComparablePropertyCandidate[] = rawCandidates.map((c) => {
    const psm = c.priceNumericMillion / Math.max(1, c.sqm);
    const sizeDiffRatio = Math.abs(c.sqm - input.sqm) / Math.max(1, input.sqm);
    const priceDiffFromMedianRatio = Math.abs(psm - medianRawPsm) / Math.max(1, medianRawPsm);

    const distanceMeters =
      c.distanceMeters ??
      (input.coordinates && c.coordinates ? calculateHaversineMeters(input.coordinates, c.coordinates) : undefined);

    const effectiveObsIso = c.observedAtIso ?? c.approvedAtIso;
    const obsDaysOld = effectiveObsIso
      ? Math.max(0, (Date.parse(valuationDateIso) - Date.parse(effectiveObsIso)) / (1000 * 60 * 60 * 24))
      : 15;

    let included = true;
    let exclusionReason: string | undefined;

    if (c.verificationStatus === 'REJECTED') {
      included = false;
      exclusionReason = 'رد شده در بررسی کنترل کیفیت';
    } else if (c.duplicateOfEvidenceId) {
      included = false;
      exclusionReason = 'رکورد تکراری بازار (Deduplicated)';
      duplicateExcludedIds.push(c.id);
    } else if (
      c.outlierFlag ||
      (priceDiffFromMedianRatio > 0.45 && Math.abs(psm - baselinePerSqmMillion) / Math.max(1, baselinePerSqmMillion) > 0.45)
    ) {
      included = false;
      exclusionReason = 'فاصله شدید قیمت از میانه محله (داده پرت آماری)';
      outlierExcludedIds.push(c.id);
    } else if (sizeDiffRatio > 0.5) {
      included = false;
      exclusionReason = 'تفاوت متراژ بیش از ۵۰ درصد با ملک هدف';
    } else if (distanceMeters !== undefined && distanceMeters > config.maxComparableDistanceMeters) {
      included = false;
      exclusionReason = `فاصله مکانی بیش از حد مجاز (${distanceMeters} متر)`;
    } else if (obsDaysOld > config.maxComparableAgeDays) {
      included = false;
      exclusionReason = 'قدمت بیش از حد مشاهده بازار';
    }

    const isVerified = Boolean(
      c.isVerifiedTransaction ||
      c.sourceType === 'VERIFIED_COMPLETED_TRANSACTION' ||
      c.evidenceType === 'confirmed_transaction',
    );
    const evidenceType: 'confirmed_transaction' | 'asking_listing' =
      c.evidenceType ?? (isVerified ? 'confirmed_transaction' : 'asking_listing');

    const sizeScore = Math.max(0, 100 - sizeDiffRatio * 110);
    const ageDiff = input.buildYear && c.buildYear ? Math.abs(input.buildYear - c.buildYear) : 3;
    const ageScore = Math.max(0, 100 - ageDiff * 4.5);
    const distScore =
      distanceMeters !== undefined
        ? Math.max(0, 100 - (distanceMeters / Math.max(1, config.maxComparableDistanceMeters)) * 60)
        : 85;
    const recencyScore = Math.max(40, 100 - (obsDaysOld / Math.max(1, config.maxComparableAgeDays)) * 50);
    const reliabilityBonus = isVerified ? 8 : 0;

    const similarityScore = Math.min(
      100,
      Math.round(sizeScore * 0.4 + ageScore * 0.25 + distScore * 0.2 + recencyScore * 0.15 + reliabilityBonus),
    );

    const temporalAdjPct = computeTemporalAdjustmentPct(
      effectiveObsIso,
      valuationDateIso,
      config.monthlyInflationTrendPct,
    );
    const adjustedPsm = Number((psm * (1 + temporalAdjPct / 100)).toFixed(2));

    return {
      listingId: c.id,
      sourceType: c.sourceType ?? (isVerified ? 'VERIFIED_COMPLETED_TRANSACTION' : 'ACTIVE_PUBLISHED_LISTING'),
      evidenceType,
      sqm: c.sqm,
      pricePerSqmMillion: Number(psm.toFixed(2)),
      totalPriceMillion: Number(c.priceNumericMillion.toFixed(1)),
      buildYear: c.buildYear,
      distanceMeters,
      similarityScore,
      included,
      exclusionReason,
      observedAtIso: effectiveObsIso,
      temporalAdjustmentPct: temporalAdjPct,
      adjustedPricePerSqmMillion: adjustedPsm,
      isVerifiedTransaction: isVerified,
    };
  });

  const includedComparables = comparables
    .filter((c) => c.included)
    .sort((a, b) => b.similarityScore - a.similarityScore);

  return {
    comparables,
    includedComparables,
    outlierExcludedIds,
    duplicateExcludedIds,
  };
}

export function computeNeighborhoodBaselineFromEvidence(params: {
  cityId: string;
  districtId?: string;
  hoodId: number;
  subNeighborhoodId?: string;
  hoodName: string;
  propertyCategory: PropertyCategory;
  transactionType: ValuationTransactionType;
  evidenceRecords: MarketEvidenceRecord[];
  benchmarkFallbackPerSqmMillion?: number;
  config: ValuationModelConfiguration;
  nowIso: string;
}): NeighborhoodBaselineRecord {
  const { cityId, districtId, hoodId, subNeighborhoodId, hoodName, propertyCategory, transactionType, evidenceRecords, config, nowIso } = params;

  const filterByScope = (
    scope: 'sub_neighborhood' | 'neighborhood' | 'district' | 'city',
  ): MarketEvidenceRecord[] => {
    return evidenceRecords.filter((e) => {
      if (e.cityId !== cityId) return false;
      if (e.propertyCategory !== propertyCategory || e.transactionType !== transactionType) return false;
      if (scope === 'sub_neighborhood') return Boolean(subNeighborhoodId && e.subNeighborhoodId === subNeighborhoodId && e.hoodId === hoodId);
      if (scope === 'neighborhood') return e.hoodId === hoodId;
      if (scope === 'district') return Boolean(districtId && e.districtId === districtId);
      return true;
    });
  };

  const isBaselineEligible = (e: MarketEvidenceRecord) =>
    isEvidenceEligibleForOfficialBaseline(e.verificationStatus, !!e.outlierFlag, e.duplicateOfEvidenceId);
  let chosenLevel: NeighborhoodBaselineRecord['geographicLevel'] = 'neighborhood';
  let scopedAll = filterByScope('neighborhood');

  if (subNeighborhoodId) {
    const subRecords = filterByScope('sub_neighborhood').filter(isBaselineEligible);
    if (subRecords.length >= config.minComparableSampleCount) {
      chosenLevel = 'sub_neighborhood';
      scopedAll = filterByScope('sub_neighborhood');
    }
  }

  let eligible = scopedAll.filter(isBaselineEligible);

  if (eligible.length === 0 && districtId) {
    const distAll = filterByScope('district');
    const distEligible = distAll.filter(isBaselineEligible);
    if (distEligible.length > 0) {
      chosenLevel = 'district';
      scopedAll = distAll;
      eligible = distEligible;
    }
  }

  if (eligible.length === 0) {
    const cityAll = filterByScope('city');
    const cityEligible = cityAll.filter(isBaselineEligible);
    if (cityEligible.length > 0) {
      chosenLevel = 'city';
      scopedAll = cityAll;
      eligible = cityEligible;
    }
  }

  const verifiedList = eligible.filter((e) => e.isCompletedTransaction);
  const askingList = eligible.filter((e) => e.isAskingPrice);
  const outlierExcludedCount = scopedAll.filter((e) => e.outlierFlag || e.verificationStatus === 'REJECTED').length;

  const verifiedPsms = verifiedList.map((e) => e.normalizedPricePerSqmMillion);
  // Apply a slight negotiation discount (-4%) when deriving market baseline from asking prices
  const askingPsms = askingList.map((e) => e.normalizedPricePerSqmMillion);

  const medianVerified = verifiedPsms.length > 0 ? Number(computeMedian(verifiedPsms).toFixed(2)) : null;
  const medianAsking = askingPsms.length > 0 ? Number(computeMedian(askingPsms).toFixed(2)) : null;

  let weightedSum = 0;
  let totalWeight = 0;
  for (const ev of eligible) {
    const effectivePsm = ev.isAskingPrice ? ev.normalizedPricePerSqmMillion * 0.96 : ev.normalizedPricePerSqmMillion;
    weightedSum += effectivePsm * ev.reliabilityWeight;
    totalWeight += ev.reliabilityWeight;
  }

  const fallbackBase =
    params.benchmarkFallbackPerSqmMillion !== undefined
      ? params.benchmarkFallbackPerSqmMillion * (config.categoryMultipliers[propertyCategory] ?? 1.0)
      : 0;

  const weightedPricePerSqmMillion =
    totalWeight > 0 ? Number((weightedSum / totalWeight).toFixed(2)) : Number(fallbackBase.toFixed(2));

  const allPsms = eligible.map((e) => e.normalizedPricePerSqmMillion);
  const p25 = allPsms.length > 0 ? Number(computePercentile(allPsms, 0.25).toFixed(2)) : Number((weightedPricePerSqmMillion * 0.92).toFixed(2));
  const p75 = allPsms.length > 0 ? Number(computePercentile(allPsms, 0.75).toFixed(2)) : Number((weightedPricePerSqmMillion * 1.08).toFixed(2));

  const sampleSufficiency: NeighborhoodBaselineRecord['sampleSufficiency'] =
    eligible.length >= 5 ? 'sufficient' : eligible.length >= 2 || fallbackBase > 0 ? 'limited' : 'insufficient';

  const newestObsMs = eligible.reduce((max, e) => Math.max(max, Date.parse(e.observedAtIso) || 0), 0);
  const freshnessDays =
    newestObsMs > 0 ? Math.max(0, Math.round((Date.parse(nowIso) - newestObsMs) / (1000 * 60 * 60 * 24))) : 0;

  return {
    id: `base_${cityId}_${hoodId}_${propertyCategory}_${transactionType}`,
    cityId,
    districtId,
    hoodId,
    subNeighborhoodId,
    hoodName,
    propertyCategory,
    transactionType,
    geographicLevel: chosenLevel,
    medianVerifiedPricePerSqmMillion: medianVerified,
    medianAskingPricePerSqmMillion: medianAsking,
    weightedPricePerSqmMillion,
    p25PricePerSqmMillion: p25,
    p75PricePerSqmMillion: p75,
    verifiedSampleCount: verifiedList.length,
    askingSampleCount: askingList.length,
    totalEligibleCount: eligible.length,
    outlierExcludedCount,
    sampleSufficiency,
    freshnessDays,
    computedAtIso: nowIso,
    modelVersion: config.modelVersion,
  };
}
