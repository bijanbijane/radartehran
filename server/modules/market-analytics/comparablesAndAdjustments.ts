/**
 * @file server/modules/market-analytics/comparablesAndAdjustments.ts
 * @description Comparable-Property Selection, Missing-Safe Hedonic Quality Normalization,
 * Temporal Decay Weighting, and Source-Category Proportion Accounting (Employee 10).
 */

import {
  DEFAULT_VALUATION_MODEL_SPEC,
  isFiniteNumber,
  SOURCE_CATEGORY_META,
  type SanitizedObservationsBundle,
} from './dataQualityAndOutliers';
import type {
  EvaluatedComparableItem,
  MarketObservationRecord,
  ObservationSourceCategory,
  RenovationGrade,
  SourceProportionSummary,
  SubjectPropertySpecs,
  ValuationModelVersionSpec,
} from './types';

export interface ComparableSelectionCriteria {
  maxAreaDeviationRatio?: number;
  maxAgeDifferenceYears?: number;
  requireKnownAreaForPerSqm?: boolean;
  maxComparables?: number;
}

/**
 * Resolves building age in years from either explicit buildingAgeYears or buildYear.
 * Never treats missing (null/undefined) as 0 (brand-new). Returns null when unknown.
 */
export function resolveExplicitBuildingAge(
  buildingAgeYears: number | null | undefined,
  buildYear: number | null | undefined,
  currentJalaliYear = 1405
): number | null {
  if (isFiniteNumber(buildingAgeYears) && buildingAgeYears >= 0 && buildingAgeYears <= 80) {
    return buildingAgeYears;
  }
  if (isFiniteNumber(buildYear) && buildYear >= 1330 && buildYear <= currentJalaliYear) {
    return currentJalaliYear - buildYear;
  }
  return null;
}

/**
 * Computes quality factor relative to a standard reference unit (5yr old, floor 2, standard renovation, full amenities).
 * Crucially, missing attributes (null) contribute 0% adjustment rather than being coerced to 0 (ground floor / brand new).
 */
export function computeMissingSafeQualityIndex(
  specs: {
    sqm: number | null;
    ageYears: number | null;
    floor: number | null;
    totalFloors?: number | null;
    hasParking?: boolean | null;
    hasElevator?: boolean | null;
    hasStorage?: boolean | null;
    renovationGrade?: RenovationGrade | null;
  }
): number {
  let deltaPct = 0;

  if (specs.ageYears !== null) {
    const age = specs.ageYears;
    if (age === 0) deltaPct += 6.5;
    else if (age === 1) deltaPct += 4.5;
    else if (age <= 4) deltaPct += 2.0 - (age - 2) * 0.8;
    else if (age <= 10) deltaPct += -(age - 4) * 1.1;
    else if (age <= 20) deltaPct += -6.6 - (age - 10) * 1.25;
    else deltaPct += Math.max(-26.0, -19.1 - (age - 20) * 0.7);
  }

  if (specs.renovationGrade !== null && specs.renovationGrade !== undefined) {
    if (specs.renovationGrade === 'luxury_renovated') deltaPct += 7.5;
    else if (specs.renovationGrade === 'renovated') deltaPct += 4.0;
    else if (specs.renovationGrade === 'needs_renovation') deltaPct -= 9.5;
  }

  if (specs.floor !== null) {
    const f = specs.floor;
    const hasElev = specs.hasElevator ?? true;
    if (f < 0) deltaPct -= 8.5;
    else if (f === 0) deltaPct -= 5.5;
    else if (f === 1) deltaPct -= 1.8;
    else if (f >= 3 && !hasElev) deltaPct -= 3.5 * (f - 1);
    else if (f >= 3 && f <= 5) deltaPct += (f - 2) * 1.5;
    else if (f > 5) deltaPct += Math.min(10.5, 4.5 + (f - 5) * 0.75);
  }

  if (specs.hasParking === false) deltaPct -= 7.5;
  if (specs.hasElevator === false && specs.floor === 2) deltaPct -= 3.5;
  if (specs.hasStorage === false) deltaPct -= 1.5;
  if (specs.hasParking === true && specs.hasElevator === true && specs.hasStorage === true) {
    deltaPct += 1.5;
  }

  if (specs.sqm !== null) {
    if (specs.sqm < 55) deltaPct += 3.5;
    else if (specs.sqm <= 70) deltaPct += 1.5;
    else if (specs.sqm > 180) deltaPct += 1.0;
  }

  const clampedPct = Math.max(-35, Math.min(32, deltaPct));
  return Math.round((1 + clampedPct / 100) * 10000) / 10000;
}

/**
 * Computes similarity score [0.25 .. 1.0] between a candidate observation and subject property.
 * Missing attributes apply a conservative penalty without treating missing values as zero.
 */
export function computeComparableSimilarityScore(
  obs: MarketObservationRecord,
  subject: SubjectPropertySpecs,
  currentJalaliYear = 1405
): number {
  let score = 1.0;

  if (subject.sqm !== null && obs.sqm !== null) {
    const relDiff = Math.abs(obs.sqm - subject.sqm) / Math.max(25, subject.sqm);
    score *= Math.max(0.4, 1 - relDiff * 0.85);
  } else if (subject.sqm !== null || obs.sqm !== null) {
    score *= 0.82;
  }

  const subAge = resolveExplicitBuildingAge(subject.buildingAgeYears, subject.buildYear, currentJalaliYear);
  const obsAge = resolveExplicitBuildingAge(obs.buildingAgeYears, obs.buildYear, currentJalaliYear);
  if (subAge !== null && obsAge !== null) {
    const ageDiff = Math.abs(obsAge - subAge);
    score *= Math.max(0.5, 1 - (ageDiff / 30) * 0.6);
  } else if (subAge !== null || obsAge !== null) {
    score *= 0.88;
  }

  if (subject.hasParking !== null && subject.hasParking !== undefined && obs.hasParking !== null) {
    if (subject.hasParking !== obs.hasParking) score *= 0.9;
  }
  if (subject.hasElevator !== null && subject.hasElevator !== undefined && obs.hasElevator !== null) {
    if (subject.hasElevator !== obs.hasElevator) score *= 0.88;
  }

  return Math.round(Math.max(0.25, Math.min(1.0, score)) * 1000) / 1000;
}

/**
 * Selects, normalizes, and weights comparable observations for a subject property or neighborhood.
 * Primary metric is:
 * - For 'sale': per-sqm price in Million Toman (when sqm is valid), or total price when evaluating fixed-area units without sqm.
 * - For 'rental': per-sqm Rahn-equivalent in Million Toman (when sqm is valid), or total Rahn-equivalent.
 */
export function evaluateAndWeightComparables(params: {
  sanitizedObservations: SanitizedObservationsBundle['validObservations'];
  subject: SubjectPropertySpecs;
  modelSpec?: ValuationModelVersionSpec;
  criteria?: ComparableSelectionCriteria;
}): {
  evaluated: EvaluatedComparableItem[];
  usesPerSqmMetric: boolean;
  subjectQualityIndex: number;
} {
  const model = params.modelSpec ?? DEFAULT_VALUATION_MODEL_SPEC;
  const criteria = params.criteria ?? {};
  const maxAreaDev = criteria.maxAreaDeviationRatio ?? 0.65;
  const maxAgeDiff = criteria.maxAgeDifferenceYears ?? 25;

  const subjectAge = resolveExplicitBuildingAge(
    params.subject.buildingAgeYears,
    params.subject.buildYear,
    model.currentJalaliYear
  );
  const subjectQualityIndex = computeMissingSafeQualityIndex({
    sqm: params.subject.sqm,
    ageYears: subjectAge,
    floor: params.subject.floor ?? null,
    totalFloors: params.subject.totalFloors ?? null,
    hasParking: params.subject.hasParking ?? null,
    hasElevator: params.subject.hasElevator ?? null,
    hasStorage: params.subject.hasStorage ?? null,
    renovationGrade: params.subject.renovationGrade ?? null,
  });

  // Determine if per-sqm calculation is valid across observations
  const withValidSqm = params.sanitizedObservations.filter((o) => o.sqm !== null && o.sqm >= 20);
  const usesPerSqmMetric =
    criteria.requireKnownAreaForPerSqm !== false && withValidSqm.length > 0;

  const candidatePool = usesPerSqmMetric ? withValidSqm : params.sanitizedObservations;
  const evaluated: EvaluatedComparableItem[] = [];

  for (const obs of candidatePool) {
    if (params.subject.sqm !== null && obs.sqm !== null) {
      const ratio = Math.abs(obs.sqm - params.subject.sqm) / Math.max(25, params.subject.sqm);
      if (ratio > maxAreaDev) continue;
    }

    const obsAge = resolveExplicitBuildingAge(obs.buildingAgeYears, obs.buildYear, model.currentJalaliYear);
    if (subjectAge !== null && obsAge !== null && Math.abs(obsAge - subjectAge) > maxAgeDiff) {
      continue;
    }

    const rawTotalOrRahn =
      obs.marketMode === 'sale' ? (obs.totalPriceMillion as number) : (obs.rawRahnEquivalentMillion as number);
    const rawMetricMillion =
      usesPerSqmMetric && obs.sqm !== null ? rawTotalOrRahn / obs.sqm : rawTotalOrRahn;

    const askingToTxFactor = model.askingToTransactionAdjustment[obs.sourceCategory] ?? 0.92;
    const transactionAdjustedMetricMillion = rawMetricMillion * askingToTxFactor;

    const obsQualityForSubjectDims = computeMissingSafeQualityIndex({
      sqm: params.subject.sqm !== null ? obs.sqm : null,
      ageYears: subjectAge !== null ? obsAge : null,
      floor: params.subject.floor !== undefined && params.subject.floor !== null ? obs.floor : null,
      totalFloors:
        params.subject.totalFloors !== undefined && params.subject.totalFloors !== null
          ? obs.totalFloors
          : null,
      hasParking:
        params.subject.hasParking !== undefined && params.subject.hasParking !== null
          ? obs.hasParking
          : null,
      hasElevator:
        params.subject.hasElevator !== undefined && params.subject.hasElevator !== null
          ? obs.hasElevator
          : null,
      hasStorage:
        params.subject.hasStorage !== undefined && params.subject.hasStorage !== null
          ? obs.hasStorage
          : null,
      renovationGrade:
        params.subject.renovationGrade !== undefined && params.subject.renovationGrade !== null
          ? obs.renovationGrade
          : null,
    });

    const qualityRatio = subjectQualityIndex / Math.max(0.6, obsQualityForSubjectDims);
    const subjectQualityAdjustedMetricMillion = transactionAdjustedMetricMillion * qualityRatio;

    const similarityScore = computeComparableSimilarityScore(obs, params.subject, model.currentJalaliYear);
    const recencyWeight = Math.pow(0.5, obs.ageDays / Math.max(1, model.temporalHalfLifeDays));
    const sourceBaseWeight = model.sourceCategoryBaseWeight[obs.sourceCategory] ?? 0.5;
    const reporterTrust =
      isFiniteNumber(obs.reliabilityWeight) && obs.reliabilityWeight > 0
        ? Math.min(1.25, Math.max(0.3, obs.reliabilityWeight))
        : 1.0;

    const combinedWeight = similarityScore * recencyWeight * sourceBaseWeight * reporterTrust;

    if (combinedWeight <= 0) continue;

    evaluated.push({
      observationId: obs.observationId,
      sourceCategory: obs.sourceCategory,
      observedAtIso: obs.observedAtIso,
      ageDays: obs.ageDays,
      sqm: obs.sqm,
      rawMetricMillion: Math.round(rawMetricMillion * 100) / 100,
      transactionAdjustedMetricMillion: Math.round(transactionAdjustedMetricMillion * 100) / 100,
      subjectQualityAdjustedMetricMillion: Math.round(subjectQualityAdjustedMetricMillion * 100) / 100,
      similarityScore,
      recencyWeight: Math.round(recencyWeight * 1000) / 1000,
      sourceBaseWeight,
      combinedWeight: Math.round(combinedWeight * 10000) / 10000,
    });
  }

  evaluated.sort((a, b) => b.combinedWeight - a.combinedWeight || a.observationId.localeCompare(b.observationId));

  const limited =
    criteria.maxComparables && criteria.maxComparables > 0
      ? evaluated.slice(0, criteria.maxComparables)
      : evaluated;

  return {
    evaluated: limited,
    usesPerSqmMetric,
    subjectQualityIndex,
  };
}

/**
 * Computes explicit source category proportions and transparent explanations of weighting and haircuts.
 */
export function computeSourceProportionSummaries(
  inliers: ReadonlyArray<EvaluatedComparableItem>,
  modelSpec: ValuationModelVersionSpec = DEFAULT_VALUATION_MODEL_SPEC
): SourceProportionSummary[] {
  if (inliers.length === 0) return [];
  const totalCount = inliers.length;
  const totalWeight = inliers.reduce((acc, item) => acc + item.combinedWeight, 0);

  const byCategory = new Map<ObservationSourceCategory, { count: number; weightSum: number }>();
  for (const item of inliers) {
    const prev = byCategory.get(item.sourceCategory) || { count: 0, weightSum: 0 };
    prev.count += 1;
    prev.weightSum += item.combinedWeight;
    byCategory.set(item.sourceCategory, prev);
  }

  const summaries: SourceProportionSummary[] = [];
  for (const [category, stats] of byCategory.entries()) {
    const meta = SOURCE_CATEGORY_META[category];
    const haircutFactor = modelSpec.askingToTransactionAdjustment[category];
    const rawProp = Math.round((stats.count / totalCount) * 1000) / 1000;
    const weightProp = totalWeight > 0 ? Math.round((stats.weightSum / totalWeight) * 1000) / 1000 : 0;
    const spreadPct = Math.round((1 - haircutFactor) * 1000) / 10;

    summaries.push({
      sourceCategory: category,
      categoryLabelFa: meta.labelFa,
      isTransactionEvidence: meta.isTransaction,
      observationCount: stats.count,
      rawCountProportion: rawProp,
      effectiveWeightProportion: weightProp,
      appliedAskingToTransactionFactor: haircutFactor,
      weightingExplanation: meta.isTransaction
        ? `${meta.labelFa}: وزن پایه ${(modelSpec.sourceCategoryBaseWeight[category] * 100).toFixed(0)}٪، بدون کسر ضریب چانه‌زنی (معامله قطعی).`
        : `${meta.labelFa}: وزن پایه ${(modelSpec.sourceCategoryBaseWeight[category] * 100).toFixed(0)}٪ و اعمال ${spreadPct}٪ تعدیل شکاف قیمت اعلامی به معامله قطعی (ضریب ${haircutFactor}).`,
    });
  }

  return summaries.sort((a, b) => b.effectiveWeightProportion - a.effectiveWeightProportion);
}
