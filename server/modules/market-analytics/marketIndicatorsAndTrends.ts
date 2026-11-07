/**
 * @file server/modules/market-analytics/marketIndicatorsAndTrends.ts
 * @description Neighborhood-Level Market Indicators, Supply/Demand Analysis,
 * Historical Market Trends (Observed vs. Inferred), Backtest Validation, and Neighborhood Comparison (Employee 10).
 */

import crypto from 'node:crypto';
import { defaultGeographicService, type SupportedCityId } from '../geography';
import {
  computeQuantile,
  DEFAULT_VALUATION_MODEL_SPEC,
  detectStatisticalOutliers,
  isFiniteNumber,
  sanitizeAndDeduplicateObservations,
} from './dataQualityAndOutliers';
import { computePropertyOrNeighborhoodValuation } from './valuationEngine';
import type {
  HistoricalBacktestValidationResult,
  HistoricalTrendPoint,
  HistoricalTrendSeriesOutput,
  MarketMode,
  MarketObservationRecord,
  SupplyDemandIndicatorOutput,
  SupplyDemandInputMetrics,
  ValuationModelVersionSpec,
  VersionedValuationOutput,
} from './types';

export interface NeighborhoodMarketIndicatorsOutput {
  cityId: SupportedCityId;
  hoodId: number;
  compositeNeighborhoodId: string;
  neighborhoodNameFa: string;
  computedAtIso: string;
  modelVersion: string;
  saleAnalysis: VersionedValuationOutput;
  rentalAnalysis: VersionedValuationOutput;
  crossMarketYield: {
    status: 'computed' | 'insufficient_dual_market_evidence';
    priceToRahnRatio: number | null;
    estimatedGrossAnnualRentalYieldPercent: number | null;
    explanation: string;
  };
  supplyDemand: SupplyDemandIndicatorOutput;
}

export interface NeighborhoodComparisonOutput {
  computedAtIso: string;
  modelVersion: string;
  neighborhoodA: NeighborhoodMarketIndicatorsOutput;
  neighborhoodB: NeighborhoodMarketIndicatorsOutput;
  comparisonMetrics: {
    saleComparisonAvailable: boolean;
    salePerSqmDiffMillion: number | null;
    salePerSqmDiffPercent: number | null;
    rentalComparisonAvailable: boolean;
    rentalRahn80mDiffMillion: number | null;
    rentalRahn80mDiffPercent: number | null;
    higherConfidenceNeighborhood: string | 'equal';
    summaryExplanationFa: string;
  };
}

/**
 * Evaluates supply and demand indicators only when sufficient non-null metrics exist.
 */
export function computeSupplyDemandIndicators(
  input?: SupplyDemandInputMetrics | null
): SupplyDemandIndicatorOutput {
  if (!input) {
    return {
      status: 'insufficient_supply_demand_evidence',
      liquidityRegime: 'unknown',
      monthsOfInventory: null,
      absorptionRatePercent: null,
      buyerAlertToListingRatio: null,
      limitations: ['داده‌های عرضه و تقاضای دوره‌ای برای این محله ارائه نشده است.'],
      explanation: 'به علت نبود داده‌های شمارش آگهی‌های فعال و معاملات دوره، شاخص عرضه و تقاضا محاسبه نشد.',
    };
  }

  const activeSale =
    isFiniteNumber(input.activeSaleListingsCount) && input.activeSaleListingsCount >= 0
      ? input.activeSaleListingsCount
      : null;
  const deals =
    isFiniteNumber(input.verifiedDealsInPeriodCount) && input.verifiedDealsInPeriodCount >= 0
      ? input.verifiedDealsInPeriodCount
      : null;
  const buyerAlerts =
    isFiniteNumber(input.activeBuyerAlertsCount) && input.activeBuyerAlertsCount >= 0
      ? input.activeBuyerAlertsCount
      : null;

  if (activeSale === null || activeSale < 3 || (deals === null && buyerAlerts === null)) {
    return {
      status: 'insufficient_supply_demand_evidence',
      liquidityRegime: 'unknown',
      monthsOfInventory: null,
      absorptionRatePercent: null,
      buyerAlertToListingRatio: null,
      limitations: ['حداقل ۳ آگهی فعال فروش و آمار معاملات یا هشدارهای خریدار برای استخراج شاخص عرضه و تقاضا الزامی است.'],
      explanation: 'شواهد آماری کافی برای تعیین رژیم نقدشوندگی و فشار تقاضا وجود ندارد.',
    };
  }

  const absorptionRatePercent = deals !== null && activeSale > 0 ? Math.round((deals / activeSale) * 1000) / 10 : null;
  const monthsOfInventory = deals !== null && deals > 0 ? Math.round((activeSale / deals) * 10) / 10 : null;
  const buyerAlertToListingRatio = buyerAlerts !== null && activeSale > 0 ? Math.round((buyerAlerts / activeSale) * 100) / 100 : null;

  let liquidityRegime: SupplyDemandIndicatorOutput['liquidityRegime'] = 'balanced';
  if ((absorptionRatePercent !== null && absorptionRatePercent >= 25) || (buyerAlertToListingRatio !== null && buyerAlertToListingRatio >= 1.8)) {
    liquidityRegime = 'high_demand';
  } else if ((absorptionRatePercent !== null && absorptionRatePercent < 8) || (monthsOfInventory !== null && monthsOfInventory > 12)) {
    liquidityRegime = 'oversupplied';
  }

  return {
    status: 'sufficient_data',
    liquidityRegime,
    monthsOfInventory,
    absorptionRatePercent,
    buyerAlertToListingRatio,
    limitations: [],
    explanation: `شاخص عرضه و تقاضا بر پایه ${activeSale} آگهی فعال محاسبه شد (وضعیت نقدشوندگی: ${liquidityRegime}).`,
  };
}

/**
 * Computes comprehensive neighborhood-level sale, rental, yield, and supply/demand indicators.
 */
export function computeNeighborhoodMarketIndicators(params: {
  cityId: SupportedCityId;
  hoodId: number;
  observations: ReadonlyArray<MarketObservationRecord>;
  computedAtIso: string;
  supplyDemandInput?: SupplyDemandInputMetrics | null;
  modelSpec?: ValuationModelVersionSpec;
}): NeighborhoodMarketIndicatorsOutput {
  const model = params.modelSpec ?? DEFAULT_VALUATION_MODEL_SPEC;
  const geo = defaultGeographicService.validateCityNeighborhood(params.cityId, params.hoodId);
  const hoodNameFa = geo.neighborhood ? geo.neighborhood.nameFa : `محله #${params.hoodId}`;
  const compositeNeighborhoodId = `${params.cityId}:${params.hoodId}`;

  const saleAnalysis = computePropertyOrNeighborhoodValuation({
    subject: { cityId: params.cityId, hoodId: params.hoodId, marketMode: 'sale', sqm: 80 },
    observations: params.observations.filter((o) => o.marketMode === 'sale'),
    valuationTimestampIso: params.computedAtIso,
    modelSpec: model,
  });

  const rentalAnalysis = computePropertyOrNeighborhoodValuation({
    subject: { cityId: params.cityId, hoodId: params.hoodId, marketMode: 'rental', sqm: 80 },
    observations: params.observations.filter((o) => o.marketMode === 'rental'),
    valuationTimestampIso: params.computedAtIso,
    modelSpec: model,
  });

  const saleTotal80m = saleAnalysis.centralValue?.totalMillion ?? null;
  const rahnTotal80m = rentalAnalysis.centralValue?.rahnEquivalentMillion ?? null;

  let crossMarketYield: NeighborhoodMarketIndicatorsOutput['crossMarketYield'];
  if (
    saleAnalysis.isAuthoritativeEstimateAllowed &&
    rentalAnalysis.isAuthoritativeEstimateAllowed &&
    saleTotal80m !== null &&
    rahnTotal80m !== null &&
    rahnTotal80m > 0
  ) {
    const prRatio = Math.round((saleTotal80m / rahnTotal80m) * 100) / 100;
    const annualRentEquivalent = rahnTotal80m * model.monthlyRentToRahnRate * 12;
    const grossYieldPct = Math.round((annualRentEquivalent / saleTotal80m) * 1000) / 10;
    crossMarketYield = {
      status: 'computed',
      priceToRahnRatio: prRatio,
      estimatedGrossAnnualRentalYieldPercent: grossYieldPct,
      explanation: `نسبت قیمت به رهن کامل (P/R) معادل ${prRatio} و بازده ناخالص اجاره سالانه حدود ${grossYieldPct}٪ برآورد شد.`,
    };
  } else {
    crossMarketYield = {
      status: 'insufficient_dual_market_evidence',
      priceToRahnRatio: null,
      estimatedGrossAnnualRentalYieldPercent: null,
      explanation: 'برای محاسبه نسبت قیمت به رهن (P/R)، هر دو بازار فروش و اجاره باید دارای برآورد مرکزی معتبر با نمونه کافی باشند.',
    };
  }

  return {
    cityId: params.cityId,
    hoodId: params.hoodId,
    compositeNeighborhoodId,
    neighborhoodNameFa: hoodNameFa,
    computedAtIso: params.computedAtIso,
    modelVersion: model.modelVersion,
    saleAnalysis,
    rentalAnalysis,
    crossMarketYield,
    supplyDemand: computeSupplyDemandIndicators(params.supplyDemandInput),
  };
}

/**
 * Evaluates out-of-sample backtest accuracy against actual verified transactions.
 * Predictive accuracy claims are never permitted unless >= 5 verified holdout deals are measured.
 */
export function evaluateHistoricalValidationBacktest(
  pairs: ReadonlyArray<{
    predictedCentralMillion: number;
    predictedMinMillion: number;
    predictedMaxMillion: number;
    actualVerifiedTransactionMillion: number;
    isVerifiedTransaction: boolean;
  }>
): HistoricalBacktestValidationResult {
  const validVerified = pairs.filter(
    (p) =>
      p.isVerifiedTransaction &&
      isFiniteNumber(p.actualVerifiedTransactionMillion) &&
      p.actualVerifiedTransactionMillion > 0 &&
      isFiniteNumber(p.predictedCentralMillion) &&
      p.predictedCentralMillion > 0
  );

  if (validVerified.length < 5) {
    return {
      isValidated: false,
      predictiveAccuracyClaimAllowed: false,
      evaluatedHoldoutDealsCount: validVerified.length,
      meanAbsolutePercentageError: null,
      medianAbsolutePercentageError: null,
      rangeCoverageRate: null,
      validationSummaryFa: `تعداد معاملات قطعی آزمون پس‌نگری (${validVerified.length} مورد) کمتر از حداقل ۵ معامله است؛ ادعای دقت پیش‌بینی مجاز نیست.`,
    };
  }

  const apeList = validVerified
    .map((p) => Math.abs(p.predictedCentralMillion - p.actualVerifiedTransactionMillion) / p.actualVerifiedTransactionMillion)
    .sort((a, b) => a - b);
  const mape = Math.round((apeList.reduce((a, b) => a + b, 0) / apeList.length) * 1000) / 10;
  const mdape = Math.round((computeQuantile(apeList, 0.5) as number) * 1000) / 10;
  const inRangeCount = validVerified.filter(
    (p) => p.actualVerifiedTransactionMillion >= p.predictedMinMillion && p.actualVerifiedTransactionMillion <= p.predictedMaxMillion
  ).length;
  const coverage = Math.round((inRangeCount / validVerified.length) * 1000) / 1000;

  return {
    isValidated: true,
    predictiveAccuracyClaimAllowed: mape <= 15.0,
    evaluatedHoldoutDealsCount: validVerified.length,
    meanAbsolutePercentageError: mape,
    medianAbsolutePercentageError: mdape,
    rangeCoverageRate: coverage,
    validationSummaryFa: `ارزیابی تجربی بر روی ${validVerified.length} معامله قطعی: خطای میانگین (MAPE) برابر ${mape}٪ و نرخ پوشش بازه ${(coverage * 100).toFixed(0)}٪.`,
  };
}

/**
 * Computes historical market trends across explicit time windows.
 * Never fills missing periods with synthetic observations; distinguishes observed indicators from inferred trends.
 */
export function computeHistoricalMarketTrends(params: {
  cityId: SupportedCityId;
  hoodId: number;
  marketMode: MarketMode;
  periods: ReadonlyArray<{ periodKey: string; periodStartIso: string; periodEndIso: string }>;
  observations: ReadonlyArray<MarketObservationRecord>;
  computedAtIso: string;
  minSamplesPerPeriod?: number;
  modelSpec?: ValuationModelVersionSpec;
  historicalBacktestPairs?: Parameters<typeof evaluateHistoricalValidationBacktest>[0];
}): HistoricalTrendSeriesOutput {
  const model = params.modelSpec ?? DEFAULT_VALUATION_MODEL_SPEC;
  const minSamples = params.minSamplesPerPeriod ?? 3;
  const compositeNeighborhoodId = `${params.cityId}:${params.hoodId}`;
  const points: HistoricalTrendPoint[] = [];
  let prevCentralMetric: number | null = null;

  for (const period of params.periods) {
    const startMs = Date.parse(period.periodStartIso);
    const endMs = Date.parse(period.periodEndIso);
    const periodObs = params.observations.filter((o) => {
      const ms = Date.parse(o.observedAtIso);
      return Number.isFinite(ms) && ms >= startMs && ms <= endMs;
    });

    const sanitized = sanitizeAndDeduplicateObservations({
      observations: periodObs, expectedCityId: params.cityId, expectedHoodId: params.hoodId,
      expectedMarketMode: params.marketMode, referenceTimestampIso: period.periodEndIso,
      modelSpec: { ...model, maxObservationAgeDays: 3650 },
    });

    const rawItems = sanitized.validObservations
      .filter((o) => o.sqm !== null && o.sqm >= 20)
      .map((o) => {
        const haircut = model.askingToTransactionAdjustment[o.sourceCategory] ?? 0.92;
        const baseVal = params.marketMode === 'sale' ? (o.totalPriceMillion as number) : (o.rawRahnEquivalentMillion as number);
        return { observationId: o.observationId, sourceCategory: o.sourceCategory, metricValue: (baseVal / (o.sqm as number)) * haircut };
      });

    const outlierRes = detectStatisticalOutliers(rawItems, model.iqrOutlierMultiplier);
    const inlierSet = new Set(outlierRes.inlierIds);
    const inlierValues = rawItems.filter((r) => inlierSet.has(r.observationId)).map((r) => r.metricValue).sort((a, b) => a - b);

    if (inlierValues.length < minSamples) {
      points.push({
        periodKey: period.periodKey, periodStartIso: period.periodStartIso, periodEndIso: period.periodEndIso,
        indicatorType: 'insufficient_period_sample', sampleCount: inlierValues.length,
        centralPerSqmMillion: null, centralRahn80mMillion: null, q1Metric: null, q3Metric: null, periodChangePercent: null,
      });
      continue;
    }

    const medianPerSqm = Math.round((computeQuantile(inlierValues, 0.5) as number) * 100) / 100;
    const q1 = Math.round((computeQuantile(inlierValues, 0.25) as number) * 100) / 100;
    const q3 = Math.round((computeQuantile(inlierValues, 0.75) as number) * 100) / 100;
    const changePct = prevCentralMetric !== null && prevCentralMetric > 0 ? Math.round(((medianPerSqm - prevCentralMetric) / prevCentralMetric) * 1000) / 10 : null;
    prevCentralMetric = medianPerSqm;

    points.push({
      periodKey: period.periodKey, periodStartIso: period.periodStartIso, periodEndIso: period.periodEndIso,
      indicatorType: 'observed_indicator', sampleCount: inlierValues.length,
      centralPerSqmMillion: params.marketMode === 'sale' ? medianPerSqm : null,
      centralRahn80mMillion: params.marketMode === 'rental' ? Math.round(medianPerSqm * 80) : null,
      q1Metric: q1, q3Metric: q3, periodChangePercent: changePct,
    });
  }

  const observedPoints = points.filter((p) => p.indicatorType === 'observed_indicator');
  const historicalValidation = params.historicalBacktestPairs
    ? evaluateHistoricalValidationBacktest(params.historicalBacktestPairs)
    : undefined;

  let inferredOverallDirection: HistoricalTrendSeriesOutput['inferredOverallDirection'];
  if (observedPoints.length >= 2) {
    const first = observedPoints[0];
    const last = observedPoints[observedPoints.length - 1];
    const firstVal = params.marketMode === 'sale' ? first.centralPerSqmMillion! : first.centralRahn80mMillion!;
    const lastVal = params.marketMode === 'sale' ? last.centralPerSqmMillion! : last.centralRahn80mMillion!;
    const cumPct = Math.round(((lastVal - firstVal) / firstVal) * 1000) / 10;
    const direction = cumPct > 2.0 ? 'upward' : cumPct < -2.0 ? 'downward' : 'flat';

    inferredOverallDirection = {
      classification: 'inferred_trend', direction, cumulativeChangePercent: cumPct,
      observedPeriodsWithData: observedPoints.length, totalPeriodsEvaluated: points.length,
      predictiveClaimDisclaimer:
        'این شاخص صرفاً روند استنباط‌شده از مشاهدات گذشته است و بدون اعتبارسنجی تجربی (Backtest)، ادعای پیش‌بینی قطعی آینده را ندارد.',
    };
  } else {
    inferredOverallDirection = {
      classification: 'insufficient_history', direction: 'indeterminate', cumulativeChangePercent: null,
      observedPeriodsWithData: observedPoints.length, totalPeriodsEvaluated: points.length,
      predictiveClaimDisclaimer: 'تعداد دوره‌های دارای داده مشاهده‌شده کمتر از ۲ دوره است؛ استنتاج روند تاریخی یا پیش‌بینی مجاز نیست.',
    };
  }

  const hashPayload = JSON.stringify({ c: params.cityId, h: params.hoodId, m: params.marketMode, v: model.modelVersion, pts: points });
  const reproducibilityHash = crypto.createHash('sha256').update(hashPayload).digest('hex').slice(0, 32);

  return {
    cityId: params.cityId, hoodId: params.hoodId, compositeNeighborhoodId, marketMode: params.marketMode,
    modelVersion: model.modelVersion, computedAtIso: params.computedAtIso, reproducibilityHash,
    points, inferredOverallDirection, historicalValidation,
  };
}

/**
 * Compares two neighborhoods side-by-side when statistically justified.
 */
export function compareNeighborhoodMarkets(params: {
  neighborhoodA: NeighborhoodMarketIndicatorsOutput;
  neighborhoodB: NeighborhoodMarketIndicatorsOutput;
  computedAtIso: string;
}): NeighborhoodComparisonOutput {
  const { neighborhoodA: a, neighborhoodB: b } = params;
  const saleA = a.saleAnalysis.centralValue?.perSqmMillion ?? null;
  const saleB = b.saleAnalysis.centralValue?.perSqmMillion ?? null;
  const saleComparisonAvailable =
    a.saleAnalysis.isAuthoritativeEstimateAllowed && b.saleAnalysis.isAuthoritativeEstimateAllowed && saleA !== null && saleB !== null && saleB > 0;

  const saleDiffMillion = saleComparisonAvailable ? Math.round((saleA - saleB) * 100) / 100 : null;
  const saleDiffPercent = saleComparisonAvailable ? Math.round(((saleA - saleB) / saleB) * 1000) / 10 : null;

  const rahnA = a.rentalAnalysis.centralValue?.rahnEquivalentMillion ?? null;
  const rahnB = b.rentalAnalysis.centralValue?.rahnEquivalentMillion ?? null;
  const rentalComparisonAvailable =
    a.rentalAnalysis.isAuthoritativeEstimateAllowed && b.rentalAnalysis.isAuthoritativeEstimateAllowed && rahnA !== null && rahnB !== null && rahnB > 0;

  const rentalDiffMillion = rentalComparisonAvailable ? Math.round(rahnA - rahnB) : null;
  const rentalDiffPercent = rentalComparisonAvailable ? Math.round(((rahnA - rahnB) / rahnB) * 1000) / 10 : null;

  const confA = a.saleAnalysis.confidence.score + a.rentalAnalysis.confidence.score;
  const confB = b.saleAnalysis.confidence.score + b.rentalAnalysis.confidence.score;
  const higherConfidenceNeighborhood = confA > confB ? a.compositeNeighborhoodId : confB > confA ? b.compositeNeighborhoodId : 'equal';

  return {
    computedAtIso: params.computedAtIso,
    modelVersion: a.modelVersion,
    neighborhoodA: a,
    neighborhoodB: b,
    comparisonMetrics: {
      saleComparisonAvailable, salePerSqmDiffMillion: saleDiffMillion, salePerSqmDiffPercent: saleDiffPercent,
      rentalComparisonAvailable, rentalRahn80mDiffMillion: rentalDiffMillion, rentalRahn80mDiffPercent: rentalDiffPercent,
      higherConfidenceNeighborhood,
      summaryExplanationFa: saleComparisonAvailable
        ? `مقایسه فروش بین ${a.neighborhoodNameFa} و ${b.neighborhoodNameFa}: اختلاف هر متر مربع ${saleDiffMillion} میلیون تومان (${saleDiffPercent}٪).`
        : 'به علت ناکافی بودن شواهد آماری در حداقل یکی از دو محله، مقایسه عددی قطعی قیمت فروش انجام نشد.',
    },
  };
}
