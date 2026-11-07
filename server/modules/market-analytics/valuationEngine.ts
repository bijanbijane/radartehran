/**
 * @file server/modules/market-analytics/valuationEngine.ts
 * @description Pure Reproducible Property & Neighborhood Valuation Engine (Employee 10).
 * Enforces evidence sufficiency gates, separates sale and rental markets, and generates
 * versioned outputs with explicit source proportions, confidence scores, and factor explanations.
 */

import crypto from 'node:crypto';
import { defaultGeographicService } from '../geography';
import {
  computeQuantile,
  DEFAULT_VALUATION_MODEL_SPEC,
  detectStatisticalOutliers,
  isFiniteNumber,
  sanitizeAndDeduplicateObservations,
} from './dataQualityAndOutliers';
import {
  computeSourceProportionSummaries,
  evaluateAndWeightComparables,
  type ComparableSelectionCriteria,
} from './comparablesAndAdjustments';
import type {
  AnalyticalFactorExplanation,
  ConfidenceAssessment,
  DataQualityReport,
  EvaluatedComparableItem,
  MarketObservationRecord,
  SubjectPropertySpecs,
  ValuationModelVersionSpec,
  VersionedValuationOutput,
} from './types';

/**
 * Generates a deterministic SHA-256 reproducibility hash from canonicalized valuation inputs.
 * Invariant to input array ordering.
 */
export function computeReproducibilityHash(params: {
  subject: SubjectPropertySpecs;
  observations: ReadonlyArray<MarketObservationRecord>;
  valuationTimestampIso: string;
  modelSpec: ValuationModelVersionSpec;
}): string {
  const sortedObs = [...params.observations]
    .map((o) => ({
      id: o.observationId, c: o.cityId, h: o.hoodId, m: o.marketMode, s: o.sourceCategory,
      t: o.observedAtIso, sqm: o.sqm, p: o.totalPriceMillion, dep: o.depositMillion,
      rent: o.monthlyRentMillion, by: o.buildYear, age: o.buildingAgeYears, fl: o.floor,
      pk: o.hasParking, el: o.hasElevator, st: o.hasStorage, rn: o.renovationGrade,
    }))
    .sort((a, b) => a.id.localeCompare(b.id) || a.t.localeCompare(b.t));

  const canonicalPayload = JSON.stringify({
    v: params.modelSpec.modelVersion,
    ts: params.valuationTimestampIso,
    sub: {
      pid: params.subject.propertyId ?? null, c: params.subject.cityId, h: params.subject.hoodId,
      m: params.subject.marketMode, sqm: params.subject.sqm, by: params.subject.buildYear ?? null,
      age: params.subject.buildingAgeYears ?? null, fl: params.subject.floor ?? null,
      tf: params.subject.totalFloors ?? null, pk: params.subject.hasParking ?? null,
      el: params.subject.hasElevator ?? null, st: params.subject.hasStorage ?? null,
      rn: params.subject.renovationGrade ?? null, ask: params.subject.candidateAskingTotalMillion ?? null,
      dep: params.subject.candidateDepositMillion ?? null, rent: params.subject.candidateMonthlyRentMillion ?? null,
    },
    obs: sortedObs,
  });

  return crypto.createHash('sha256').update(canonicalPayload).digest('hex').slice(0, 32);
}

/**
 * Computes weighted mean and coefficient of variation across inlier comparables.
 */
export function computeWeightedComparableStats(inliers: ReadonlyArray<EvaluatedComparableItem>): {
  weightedMean: number | null;
  coefficientOfVariation: number | null;
  q1: number | null;
  median: number | null;
  q3: number | null;
} {
  if (inliers.length === 0) {
    return { weightedMean: null, coefficientOfVariation: null, q1: null, median: null, q3: null };
  }
  const totalWeight = inliers.reduce((acc, i) => acc + i.combinedWeight, 0);
  const weightedMean =
    totalWeight > 0
      ? inliers.reduce((acc, i) => acc + i.subjectQualityAdjustedMetricMillion * i.combinedWeight, 0) / totalWeight
      : inliers.reduce((acc, i) => acc + i.subjectQualityAdjustedMetricMillion, 0) / inliers.length;

  const variance =
    totalWeight > 0
      ? inliers.reduce((acc, i) => acc + i.combinedWeight * Math.pow(i.subjectQualityAdjustedMetricMillion - weightedMean, 2), 0) / totalWeight
      : 0;
  const stdDev = Math.sqrt(Math.max(0, variance));
  const cv = weightedMean > 0 ? Math.round((stdDev / weightedMean) * 1000) / 1000 : null;
  const sorted = inliers.map((i) => i.subjectQualityAdjustedMetricMillion).sort((a, b) => a - b);

  return {
    weightedMean: Math.round(weightedMean * 100) / 100,
    coefficientOfVariation: cv,
    q1: computeQuantile(sorted, 0.25),
    median: computeQuantile(sorted, 0.5),
    q3: computeQuantile(sorted, 0.75),
  };
}

/**
 * Evaluates data quality, sample size gates, and confidence assessment.
 */
export function evaluateConfidenceAndAuthoritativeGate(params: {
  inliers: ReadonlyArray<EvaluatedComparableItem>;
  coefficientOfVariation: number | null;
  modelSpec: ValuationModelVersionSpec;
}): {
  status: VersionedValuationOutput['status'];
  isAuthoritativeEstimateAllowed: boolean;
  confidence: ConfidenceAssessment;
} {
  const { inliers, coefficientOfVariation, modelSpec } = params;
  const n = inliers.length;

  if (n < modelSpec.minSampleSizeForRange) {
    return {
      status: 'insufficient_evidence',
      isAuthoritativeEstimateAllowed: false,
      confidence: {
        score: n === 0 ? 0 : n * 12,
        level: 'insufficient_evidence',
        verifiedTransactionShare: 0,
        coefficientOfVariation,
        medianObservationAgeDays: null,
        rationale: [
          `تعداد نمونه‌های معتبر همگن (${n} مورد) کمتر از حداقل نصاب آماری (${modelSpec.minSampleSizeForRange} مورد) است.`,
          'به دلیل عدم کفایت شواهد تجربی، ارائه برآورد عددی قطعی مجاز نیست.',
        ],
      },
    };
  }

  const verifiedCount = inliers.filter((i) => i.sourceCategory === 'verified_transaction').length;
  const verifiedShare = Math.round((verifiedCount / n) * 1000) / 1000;
  const sortedAges = inliers.map((i) => i.ageDays).sort((a, b) => a - b);
  const medianAge = Math.round((computeQuantile(sortedAges, 0.5) ?? 0) * 10) / 10;

  const hasEnoughForCentral =
    n >= modelSpec.minSampleSizeForAuthoritativeCentral ||
    (n >= modelSpec.minSampleSizeForRange && verifiedCount >= 2);
  const dispersionAcceptable =
    coefficientOfVariation === null || coefficientOfVariation <= modelSpec.maxCoefficientOfVariationForCentral;

  const isAuthoritative = hasEnoughForCentral && dispersionAcceptable;
  const status: VersionedValuationOutput['status'] = isAuthoritative
    ? 'authoritative_estimate'
    : 'provisional_range_only';

  let rawScore = 40 + Math.min(30, n * 4) + verifiedShare * 20;
  if (coefficientOfVariation !== null) rawScore -= Math.min(25, coefficientOfVariation * 55);
  if (medianAge > 45) rawScore -= Math.min(15, (medianAge - 45) * 0.2);

  const score = Math.round(Math.max(15, Math.min(98, rawScore)));
  const level: ConfidenceAssessment['level'] =
    score >= 78 && isAuthoritative ? 'high' : score >= 55 ? 'moderate' : 'low';

  const rationale: string[] = [
    `بر پایه ${n} مشاهده معتبر پس از پالایش داده‌های پرت (سهم معاملات قطعی تاییدشده: ${(verifiedShare * 100).toFixed(0)}٪).`,
  ];
  if (!isAuthoritative) {
    rationale.push(
      !hasEnoughForCentral
        ? `حجم نمونه (${n} مورد) برای صدور قیمت مرکزی قطعی کافی نیست؛ صرفاً بازه احتیاطی گزارش می‌شود.`
        : `پراکندگی داده‌ها (CV=${coefficientOfVariation}) فراتر از آستانه مجاز (${modelSpec.maxCoefficientOfVariationForCentral}) است؛ صرفاً بازه قیمتی ارائه می‌شود.`
    );
  }

  return {
    status,
    isAuthoritativeEstimateAllowed: isAuthoritative,
    confidence: {
      score, level, verifiedTransactionShare: verifiedShare,
      coefficientOfVariation, medianObservationAgeDays: medianAge, rationale,
    },
  };
}

/**
 * Pure entry point to compute a versioned property or neighborhood valuation.
 */
export function computePropertyOrNeighborhoodValuation(params: {
  subject: SubjectPropertySpecs;
  observations: ReadonlyArray<MarketObservationRecord>;
  valuationTimestampIso: string;
  modelSpec?: ValuationModelVersionSpec;
  criteria?: ComparableSelectionCriteria;
}): VersionedValuationOutput {
  const model = params.modelSpec ?? DEFAULT_VALUATION_MODEL_SPEC;
  const geoValidation = defaultGeographicService.validateCityNeighborhood(params.subject.cityId, params.subject.hoodId);
  const hoodRecord = geoValidation.neighborhood;
  const provinceId = hoodRecord ? hoodRecord.provinceId : 'tehran';
  const hoodNameFa = hoodRecord ? hoodRecord.nameFa : `محله #${params.subject.hoodId}`;
  const compositeNeighborhoodId = `${params.subject.cityId}:${params.subject.hoodId}`;

  const reproducibilityHash = computeReproducibilityHash({
    subject: params.subject, observations: params.observations,
    valuationTimestampIso: params.valuationTimestampIso, modelSpec: model,
  });

  const sanitized = sanitizeAndDeduplicateObservations({
    observations: params.observations, expectedCityId: params.subject.cityId,
    expectedHoodId: params.subject.hoodId, expectedMarketMode: params.subject.marketMode,
    referenceTimestampIso: params.valuationTimestampIso, modelSpec: model,
  });

  const { evaluated, usesPerSqmMetric, subjectQualityIndex } = evaluateAndWeightComparables({
    sanitizedObservations: sanitized.validObservations,
    subject: params.subject, modelSpec: model, criteria: params.criteria,
  });

  const outlierReport = detectStatisticalOutliers(
    evaluated.map((e) => ({
      observationId: e.observationId, sourceCategory: e.sourceCategory,
      metricValue: e.subjectQualityAdjustedMetricMillion,
    })),
    model.iqrOutlierMultiplier
  );

  const inlierIdSet = new Set(outlierReport.inlierIds);
  const inliers = evaluated.filter((e) => inlierIdSet.has(e.observationId));
  const stats = computeWeightedComparableStats(inliers);
  const gate = evaluateConfidenceAndAuthoritativeGate({
    inliers, coefficientOfVariation: stats.coefficientOfVariation, modelSpec: model,
  });
  const dataSources = computeSourceProportionSummaries(inliers, model);

  const sampleSufficiency: DataQualityReport['sampleSufficiency'] =
    inliers.length < model.minSampleSizeForRange
      ? 'insufficient'
      : inliers.length < model.minSampleSizeForAuthoritativeCentral
      ? 'limited'
      : inliers.length >= 10
      ? 'high'
      : 'adequate';

  const dataQuality: DataQualityReport = {
    totalSubmittedCount: params.observations.length,
    validDeduplicatedCount: sanitized.validObservations.length,
    inlierComparableCount: inliers.length,
    rejectedDuplicateCount: sanitized.rejectedDuplicateCount,
    rejectedInvalidCount: sanitized.rejectedInvalidCount,
    outlierExcludedCount: outlierReport.outliers.length,
    missingAreaCount: sanitized.missingAreaCount,
    missingAgeCount: sanitized.missingAgeCount,
    missingAmenitiesCount: sanitized.missingAmenitiesCount,
    sampleSufficiency,
    rejections: sanitized.rejections,
  };

  const hasValidSubjectSqm = isFiniteNumber(params.subject.sqm) && params.subject.sqm >= 20;
  const effectiveSqm = hasValidSubjectSqm ? (params.subject.sqm as number) : null;

  let estimatedRange: VersionedValuationOutput['estimatedRange'] = null;
  let centralValue: VersionedValuationOutput['centralValue'] = null;

  if (gate.status !== 'insufficient_evidence' && stats.q1 !== null && stats.q3 !== null && stats.weightedMean !== null) {
    const lowMetric = Math.round(Math.min(stats.q1, stats.weightedMean * 0.95) * 100) / 100;
    const highMetric = Math.round(Math.max(stats.q3, stats.weightedMean * 1.05) * 100) / 100;
    const minTotal = usesPerSqmMetric && effectiveSqm !== null ? Math.round(lowMetric * effectiveSqm) : !usesPerSqmMetric ? Math.round(lowMetric) : null;
    const maxTotal = usesPerSqmMetric && effectiveSqm !== null ? Math.round(highMetric * effectiveSqm) : !usesPerSqmMetric ? Math.round(highMetric) : null;
    const centralTotal = usesPerSqmMetric && effectiveSqm !== null ? Math.round(stats.weightedMean * effectiveSqm) : !usesPerSqmMetric ? Math.round(stats.weightedMean) : null;

    if (params.subject.marketMode === 'sale') {
      estimatedRange = {
        minTotalMillion: minTotal, maxTotalMillion: maxTotal,
        minPerSqmMillion: usesPerSqmMetric ? lowMetric : null,
        maxPerSqmMillion: usesPerSqmMetric ? highMetric : null,
      };
      if (gate.isAuthoritativeEstimateAllowed) {
        centralValue = { totalMillion: centralTotal, perSqmMillion: usesPerSqmMetric ? stats.weightedMean : null };
      }
    } else {
      estimatedRange = {
        minTotalMillion: minTotal, maxTotalMillion: maxTotal,
        minPerSqmMillion: usesPerSqmMetric ? lowMetric : null,
        maxPerSqmMillion: usesPerSqmMetric ? highMetric : null,
        minRahnEquivalentMillion: minTotal, maxRahnEquivalentMillion: maxTotal,
      };
      if (gate.isAuthoritativeEstimateAllowed) {
        const estMonthlyRent = centralTotal !== null ? Math.round(centralTotal * model.monthlyRentToRahnRate * 100) / 100 : null;
        centralValue = {
          totalMillion: centralTotal, perSqmMillion: usesPerSqmMetric ? stats.weightedMean : null,
          rahnEquivalentMillion: centralTotal, estimatedMonthlyRentMillion: estMonthlyRent,
        };
      }
    }
  }

  const limitations: string[] = [];
  if (!geoValidation.valid) limitations.push(`شناسه جغرافیایی (${compositeNeighborhoodId}) در رجیستری رسمی تایید نشد.`);
  if (gate.confidence.verifiedTransactionShare === 0 && inliers.length > 0) {
    limitations.push('هیچ معامله قطعی ثبت‌شده‌ای در نمونه فعلی وجود ندارد؛ برآورد مبتنی بر قیمت‌های اعلامی تعدیل‌شده با ضریب مذاکره است.');
  }
  if (sanitized.missingAreaCount > 0 || !hasValidSubjectSqm) {
    limitations.push('به علت نبود متراژ معتبر در بخشی از ورودی‌ها، محاسبه قیمت هر متر مربع محدود شده است.');
  }
  if (!gate.isAuthoritativeEstimateAllowed) {
    limitations.push('به دلیل محدودیت حجم نمونه یا پراکندگی بالا، مقدار مرکزی قطعی صادر نشده است.');
  }

  const subjectDeltaPct = Math.round((subjectQualityIndex - 1) * 1000) / 10;
  const contributingFactors: AnalyticalFactorExplanation[] = [
    {
      factorId: 'source_composition', labelFa: 'ترکیب منابع داده و تفکیک آگهی از معامله',
      direction: gate.confidence.verifiedTransactionShare >= 0.5 ? 'neutral' : 'downward',
      impactPercent: null,
      explanation: `تفکیک صریح ${dataSources.length} طبقه منبع داده؛ قیمت‌های اعلامی هرگز بدون ضریب تعدیل با معاملات قطعی ترکیب نشده‌اند.`,
    },
    {
      factorId: 'hedonic_subject_adjustment', labelFa: 'تعدیل کیفی و مشخصات ملک هدف',
      direction: subjectDeltaPct > 0 ? 'upward' : subjectDeltaPct < 0 ? 'downward' : 'neutral',
      impactPercent: subjectDeltaPct,
      explanation: `شاخص کیفی ملک هدف نسبت به واحد استاندارد مرجع معادل ${subjectDeltaPct >= 0 ? '+' : ''}${subjectDeltaPct}٪ محاسبه شد (فیلدهای نامشخص بدون جایگزینی با صفر خنثی لحاظ شدند).`,
    },
    {
      factorId: 'outlier_trimming', labelFa: 'پالایش آماری داده‌های پرت (IQR)',
      direction: 'guardrail', impactPercent: null,
      explanation: `${outlierReport.outliers.length} مشاهده پرت خارج از بازه آماری شناسایی و از محاسبه نهایی حذف شد.`,
    },
  ];

  let candidateQuoteEvaluation: VersionedValuationOutput['candidateQuoteEvaluation'] = undefined;
  const candidateTotal =
    params.subject.marketMode === 'sale'
      ? params.subject.candidateAskingTotalMillion
      : isFiniteNumber(params.subject.candidateDepositMillion) || isFiniteNumber(params.subject.candidateMonthlyRentMillion)
      ? (params.subject.candidateDepositMillion ?? 0) + (params.subject.candidateMonthlyRentMillion ?? 0) / model.monthlyRentToRahnRate
      : null;

  if (isFiniteNumber(candidateTotal) && candidateTotal > 0 && centralValue?.totalMillion) {
    const devPct = Math.round(((candidateTotal - centralValue.totalMillion) / centralValue.totalMillion) * 1000) / 10;
    const classification = devPct <= -6 ? 'undervalued_bargain' : devPct >= 6 ? 'overpriced_asking' : 'within_fair_range';
    candidateQuoteEvaluation = {
      quotedMetricMillion: Math.round(candidateTotal * 10) / 10,
      deviationPercent: devPct,
      classification,
      explanation:
        classification === 'undervalued_bargain'
          ? `نرخ پیشنهادی ${Math.abs(devPct)}٪ پایین‌تر از برآورد مرکزی مدل است.`
          : classification === 'overpriced_asking'
          ? `نرخ پیشنهادی ${devPct}٪ بالاتر از برآورد مرکزی مدل است.`
          : `نرخ پیشنهادی در محدوده متعارف کارشناسی (${devPct}٪ اختلاف) قرار دارد.`,
    };
  }

  return {
    resultId: `val_${compositeNeighborhoodId.replace(':', '_')}_${params.subject.marketMode}_${reproducibilityHash.slice(0, 12)}`,
    reproducibilityHash,
    valuationTimestampIso: params.valuationTimestampIso,
    modelVersion: model.modelVersion,
    marketMode: params.subject.marketMode,
    reference: {
      targetType: params.subject.propertyId ? 'property' : 'neighborhood',
      cityId: params.subject.cityId, provinceId, hoodId: params.subject.hoodId,
      compositeNeighborhoodId, neighborhoodNameFa: hoodNameFa,
      propertyId: params.subject.propertyId, subjectSqm: effectiveSqm,
    },
    status: gate.status,
    isAuthoritativeEstimateAllowed: gate.isAuthoritativeEstimateAllowed,
    estimatedRange,
    centralValue,
    comparableObservationsCount: {
      submittedTotal: params.observations.length,
      validDeduplicated: sanitized.validObservations.length,
      inliersUsed: inliers.length,
    },
    dataSources,
    confidence: gate.confidence,
    limitations,
    contributingFactors,
    dataQuality,
    outlierReport,
    selectedComparables: inliers,
    candidateQuoteEvaluation,
  };
}
