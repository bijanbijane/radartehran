import crypto from 'crypto';
import { computeMedian } from '../valuation';
import type { PropertyCategory, ValuationTransactionType } from '../valuation';
import { computeEffectiveMonthlyRentThousandTomanPerSqm, filterOutliersIqr } from './indicatorsAndTemporalEngine';
import type {
  GeographicComparisonEntry,
  MarketAnomalyRecord,
  MarketEvidenceEventInput,
  MarketIntelligenceConfig,
  MarketSegmentBucket,
  ShortTermMarketForecast,
  TemporalMarketSeriesResult,
  ValidatedMarketIndicators,
} from './types';

const CURRENT_JALALI_YEAR = 1405;

export function computeMarketSegments(params: {
  events: MarketEvidenceEventInput[];
  config: MarketIntelligenceConfig;
  suppressSmallSamples?: boolean;
}): MarketSegmentBucket[] {
  const { clean } = filterOutliersIqr(params.events);
  const total = Math.max(1, clean.length);
  const minThreshold = params.suppressSmallSamples !== false ? params.config.minSampleThresholdPublic : 1;

  function buildBucket(
    dimension: MarketSegmentBucket['segmentDimension'],
    key: string,
    labelFa: string,
    subset: MarketEvidenceEventInput[],
  ): MarketSegmentBucket {
    const suppressed = subset.length > 0 && subset.length < minThreshold;
    const psms = subset
      .map((e) => {
        const p = e.completedPriceMillion ?? e.askingPriceMillion ?? 0;
        return p > 0 && e.sqm > 0 ? p / e.sqm : 0;
      })
      .filter((v) => v > 0);
    const rents = subset
      .map((e) => computeEffectiveMonthlyRentThousandTomanPerSqm(e, params.config.rahnToRentConversionRatePct))
      .filter((v): v is number => v !== null && v > 0);
    const frontages = subset
      .map((e) => e.commercialFrontageMeters)
      .filter((v): v is number => v !== undefined && v > 0);

    return {
      segmentDimension: dimension,
      segmentKey: key,
      labelFa,
      sampleCount: subset.length,
      suppressedForPrivacyOrSampleSize: suppressed,
      medianPricePerSqmMillion:
        !suppressed && psms.length >= minThreshold ? Number(computeMedian(psms).toFixed(2)) : null,
      medianRentPerSqmThousandToman:
        !suppressed && rents.length >= minThreshold ? Number(computeMedian(rents).toFixed(2)) : null,
      shareOfMarketPct: !suppressed && subset.length > 0 ? Number(((subset.length / total) * 100).toFixed(1)) : null,
      commercialFrontageMedianMeters:
        !suppressed && frontages.length > 0 ? Number(computeMedian(frontages).toFixed(1)) : undefined,
    };
  }

  const buckets: MarketSegmentBucket[] = [
    // Area ranges
    buildBucket('area_range', 'small_under_75', 'متراژ کوچک (زیر ۷۵ متر)', clean.filter((e) => e.sqm < 75)),
    buildBucket('area_range', 'medium_75_120', 'متراژ متوسط (۷۵ تا ۱۲۰ متر)', clean.filter((e) => e.sqm >= 75 && e.sqm <= 120)),
    buildBucket('area_range', 'large_120_200', 'متراژ بزرگ (۱۲۱ تا ۲۰۰ متر)', clean.filter((e) => e.sqm > 120 && e.sqm <= 200)),
    buildBucket('area_range', 'luxury_over_200', 'متراژ بالای ۲۰۰ متر', clean.filter((e) => e.sqm > 200)),
    // Building age
    buildBucket(
      'building_age',
      'new_0_3',
      'نوساز تا ۳ سال ساخت',
      clean.filter((e) => e.buildYear !== undefined && CURRENT_JALALI_YEAR - e.buildYear <= 3),
    ),
    buildBucket(
      'building_age',
      'modern_4_10',
      '۴ تا ۱۰ سال ساخت',
      clean.filter(
        (e) => e.buildYear !== undefined && CURRENT_JALALI_YEAR - e.buildYear >= 4 && CURRENT_JALALI_YEAR - e.buildYear <= 10,
      ),
    ),
    buildBucket(
      'building_age',
      'mature_over_10',
      'بیش از ۱۰ سال ساخت',
      clean.filter((e) => e.buildYear !== undefined && CURRENT_JALALI_YEAR - e.buildYear > 10),
    ),
    // Furnished vs unfurnished rentals
    buildBucket('furnished_status', 'furnished', 'مبله کامل', clean.filter((e) => e.furnishedStatus === 'furnished')),
    buildBucket('furnished_status', 'unfurnished', 'غیرمبله', clean.filter((e) => e.furnishedStatus === 'unfurnished')),
    // Commercial sub-segments
    buildBucket('commercial_sub_segment', 'retail', 'مغازه و واحد تجاری خرده‌فروشی', clean.filter((e) => e.commercialSubSegment === 'retail')),
    buildBucket('commercial_sub_segment', 'office', 'واحد اداری و دفتر کار', clean.filter((e) => e.commercialSubSegment === 'office' || e.propertyCategory === 'office')),
    buildBucket('commercial_sub_segment', 'warehouse', 'انبار و سوله صنعتی', clean.filter((e) => e.commercialSubSegment === 'warehouse' || e.propertyCategory === 'industrial')),
  ];

  return buckets.filter((b) => b.sampleCount > 0);
}

export function compareGeographicAreas(params: {
  indicatorsByHood: ValidatedMarketIndicators[];
  config: MarketIntelligenceConfig;
}): GeographicComparisonEntry[] {
  const { indicatorsByHood, config } = params;

  const eligiblePsms = indicatorsByHood
    .filter((i) => i.reliability.observationCount >= config.minSampleThresholdRanking && i.weightedAveragePricePerSqmMillion !== null)
    .map((i) => i.weightedAveragePricePerSqmMillion as number);
  const cityMedianPsm = eligiblePsms.length > 0 ? computeMedian(eligiblePsms) : null;

  const entries: GeographicComparisonEntry[] = indicatorsByHood.map((ind) => {
    const eligible =
      ind.reliability.observationCount >= config.minSampleThresholdRanking &&
      ind.weightedAveragePricePerSqmMillion !== null;

    return {
      cityId: ind.cityId,
      hoodId: ind.hoodId ?? 0,
      hoodName: ind.hoodName ?? `Hood #${ind.hoodId ?? 0}`,
      eligibleForRanking: eligible,
      ineligibilityReason: eligible
        ? undefined
        : `تعداد نمونه‌های معتبر (${ind.reliability.observationCount}) کمتر از حد نصاب رتبه‌بندی (${config.minSampleThresholdRanking}) است.`,
      sampleCount: ind.reliability.observationCount,
      verifiedSampleCount: ind.reliability.verifiedObservationCount,
      medianVerifiedPsmMillion: eligible ? ind.medianVerifiedPricePerSqmMillion : null,
      medianAskingPsmMillion: eligible ? ind.medianAskingPricePerSqmMillion : null,
      weightedPsmMillion: eligible ? ind.weightedAveragePricePerSqmMillion : null,
      rentalYieldPct: eligible ? ind.estimatedGrossRentalYieldPct : null,
      marketActivityLevel: ind.marketActivityLevel,
      normalizedPriceIndexToCityMedian:
        eligible && cityMedianPsm && cityMedianPsm > 0 && ind.weightedAveragePricePerSqmMillion
          ? Number(((ind.weightedAveragePricePerSqmMillion / cityMedianPsm) * 100).toFixed(1))
          : null,
    };
  });

  // Assign deterministic ranks only to eligible neighborhoods
  const eligibleSorted = entries
    .filter((e) => e.eligibleForRanking && e.weightedPsmMillion !== null)
    .sort((a, b) => (b.weightedPsmMillion ?? 0) - (a.weightedPsmMillion ?? 0));

  eligibleSorted.forEach((entry, idx) => {
    entry.rankByPricePerSqm = idx + 1;
  });

  return entries;
}

export function detectMarketAnomalies(params: {
  cityId: string;
  hoodId?: number;
  propertyCategory: PropertyCategory;
  transactionType: ValuationTransactionType;
  series: TemporalMarketSeriesResult;
  rawEvents: MarketEvidenceEventInput[];
  config: MarketIntelligenceConfig;
  nowIso: string;
}): MarketAnomalyRecord[] {
  const { cityId, hoodId, propertyCategory, transactionType, series, rawEvents, config, nowIso } = params;
  const anomalies: MarketAnomalyRecord[] = [];

  // 1. Check temporal buckets for sudden price spikes/drops & volume jumps (MARKET_ANOMALY)
  for (const b of series.buckets) {
    if (b.hasObservations && b.percentagePriceChangePct !== null) {
      const absChange = Math.abs(b.percentagePriceChangePct);
      if (absChange >= config.anomalyPriceSpikeThresholdPct && b.weightedPsmMillion !== null) {
        const isSpike = b.percentagePriceChangePct > 0;
        const baseline = Number((b.weightedPsmMillion / (1 + b.percentagePriceChangePct / 100)).toFixed(2));
        anomalies.push({
          id: `anom_${crypto.randomBytes(6).toString('hex')}`,
          category: 'MARKET_ANOMALY',
          anomalyType: isSpike ? 'SUDDEN_PRICE_SPIKE' : 'SUDDEN_PRICE_DROP',
          severity: absChange >= config.anomalyPriceSpikeThresholdPct * 1.5 ? 'HIGH' : 'MEDIUM',
          cityId,
          hoodId,
          propertyCategory,
          transactionType,
          detectedAtIso: nowIso,
          periodStartIso: b.periodStartIso,
          periodEndIso: b.periodEndIso,
          observedValue: b.weightedPsmMillion,
          baselineExpectedValue: baseline,
          deviationPct: b.percentagePriceChangePct,
          descriptionFa: isSpike
            ? `جهش ناگهانی قیمت (${b.percentagePriceChangePct}%) در بازه ${b.bucketKey}`
            : `افت ناگهانی قیمت (${b.percentagePriceChangePct}%) در بازه ${b.bucketKey}`,
          reviewStatus: 'PENDING_REVIEW',
          publiclyApproved: false,
          methodologyVersion: config.methodologyVersion,
        });
      }
    }

    if (
      b.hasObservations &&
      b.transactionVolumeChangePct !== null &&
      Math.abs(b.transactionVolumeChangePct) >= config.anomalyVolumeSpikeThresholdPct
    ) {
      anomalies.push({
        id: `anom_${crypto.randomBytes(6).toString('hex')}`,
        category: 'MARKET_ANOMALY',
        anomalyType: 'ABNORMAL_TRANSACTION_VOLUME_CHANGE',
        severity: 'MEDIUM',
        cityId,
        hoodId,
        propertyCategory,
        transactionType,
        detectedAtIso: nowIso,
        periodStartIso: b.periodStartIso,
        periodEndIso: b.periodEndIso,
        observedValue: b.transactionVolume ?? 0,
        baselineExpectedValue: Math.max(1, Math.round((b.transactionVolume ?? 1) / (1 + b.transactionVolumeChangePct / 100))),
        deviationPct: b.transactionVolumeChangePct,
        descriptionFa: `تغییر غیرعادی حجم معاملات (${b.transactionVolumeChangePct}%) در بازه ${b.bucketKey}`,
        reviewStatus: 'PENDING_REVIEW',
        publiclyApproved: false,
        methodologyVersion: config.methodologyVersion,
      });
    }
  }

  // 2. Check for suspicious repeated identical prices (DATA_QUALITY_ANOMALY)
  const priceCounts = new Map<number, number>();
  for (const e of rawEvents) {
    const p = e.completedPriceMillion ?? e.askingPriceMillion;
    if (p !== undefined && p > 0) {
      priceCounts.set(p, (priceCounts.get(p) ?? 0) + 1);
    }
  }
  for (const [priceVal, count] of priceCounts.entries()) {
    if (count >= 4 && rawEvents.length >= 4 && count / rawEvents.length >= 0.5) {
      anomalies.push({
        id: `anom_${crypto.randomBytes(6).toString('hex')}`,
        category: 'DATA_QUALITY_ANOMALY',
        anomalyType: 'SUSPICIOUS_REPEATED_PRICES',
        severity: 'HIGH',
        cityId,
        hoodId,
        propertyCategory,
        transactionType,
        detectedAtIso: nowIso,
        periodStartIso: series.periodStartIso,
        periodEndIso: series.periodEndIso,
        observedValue: count,
        baselineExpectedValue: 1,
        deviationPct: Number(((count / rawEvents.length) * 100).toFixed(1)),
        descriptionFa: `تکرار مشکوک قیمت یکسان (${priceVal} میلیون تومان در ${count} رکورد) — نیازمند بررسی کیفیت داده`,
        reviewStatus: 'PENDING_REVIEW',
        publiclyApproved: false,
        methodologyVersion: config.methodologyVersion,
      });
    }
  }

  return anomalies;
}

export function computeShortTermMarketForecast(params: {
  cityId: string;
  hoodId: number;
  propertyCategory: PropertyCategory;
  transactionType: ValuationTransactionType;
  series: TemporalMarketSeriesResult;
  horizonMonths?: number;
  config: MarketIntelligenceConfig;
  nowIso: string;
}): ShortTermMarketForecast {
  const { cityId, hoodId, propertyCategory, transactionType, series, config, nowIso } = params;
  const horizonMonths = Math.max(1, Math.min(6, params.horizonMonths ?? 3));

  const observedBuckets = series.buckets.filter(
    (b) => b.hasObservations && b.weightedPsmMillion !== null && b.observationCount >= 1,
  );
  const totalObs = observedBuckets.reduce((acc, b) => acc + b.observationCount, 0);

  if (observedBuckets.length < config.minBucketsForForecast || totalObs < config.minSampleThresholdPublic) {
    return {
      cityId,
      hoodId,
      propertyCategory,
      transactionType,
      eligible: false,
      ineligibilityReason: 'INSUFFICIENT_HISTORICAL_EVIDENCE',
      horizonMonths,
      inputObservationsCount: totalObs,
      inputBucketsCount: observedBuckets.length,
      currentBaselinePsmMillion:
        observedBuckets.length > 0 ? observedBuckets[observedBuckets.length - 1].weightedPsmMillion : null,
      projections: [],
      modelVersion: 'holt_linear_damped_v1.0',
      disclaimerFa:
        'به دلیل کمبود شواهد تاریخی پایدار در این بخش، پیش‌بینی آماری کوتاه‌مدت غیرفعال شده است. برآوردها توصیه مالی محسوب نمی‌شوند.',
      generatedAtIso: nowIso,
    };
  }

  const prices = observedBuckets.map((b) => b.weightedPsmMillion as number);
  const lastPrice = prices[prices.length - 1];

  // Calculate average period-over-period growth rate with damping
  const stepGrowthRates: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i - 1] > 0) {
      stepGrowthRates.push((prices[i] - prices[i - 1]) / prices[i - 1]);
    }
  }
  const avgStepRate =
    stepGrowthRates.length > 0
      ? stepGrowthRates.reduce((a, b) => a + b, 0) / stepGrowthRates.length
      : 0.015;
  const boundedMonthlyRate = Math.max(-0.08, Math.min(0.08, avgStepRate));

  // Volatility for uncertainty band
  const diffs = stepGrowthRates.map((r) => Math.abs(r - avgStepRate));
  const avgVolatility = diffs.length > 0 ? diffs.reduce((a, b) => a + b, 0) / diffs.length : 0.03;

  const baseMs = Date.parse(nowIso);
  const projections: ShortTermMarketForecast['projections'] = [];

  for (let m = 1; m <= horizonMonths; m++) {
    const damping = Math.pow(0.88, m - 1);
    const cumulativeGrowth = boundedMonthlyRate * m * damping;
    const point = Number((lastPrice * (1 + cumulativeGrowth)).toFixed(2));
    const bandPct = Math.min(25, Number(((0.04 + avgVolatility * Math.sqrt(m)) * 100).toFixed(1)));
    const low = Number((point * (1 - bandPct / 100)).toFixed(2));
    const high = Number((point * (1 + bandPct / 100)).toFixed(2));
    const targetIso = new Date(baseMs + m * 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 7);

    projections.push({
      monthOffset: m,
      targetMonthIso: targetIso,
      pointForecastPsmMillion: point,
      lowBoundPsmMillion: low,
      highBoundPsmMillion: high,
      uncertaintyWidthPct: Number((bandPct * 2).toFixed(1)),
    });
  }

  return {
    cityId,
    hoodId,
    propertyCategory,
    transactionType,
    eligible: true,
    horizonMonths,
    inputObservationsCount: totalObs,
    inputBucketsCount: observedBuckets.length,
    currentBaselinePsmMillion: lastPrice,
    projections,
    modelVersion: 'holt_linear_damped_v1.0',
    disclaimerFa:
      'این تصویرسازی آماری بر پایه روند گذشته بازار بوده و دارای بازه عدم قطعیت است؛ به هیچ عنوان تضمین قیمت آینده یا مشاوره سرمایه‌گذاری محسوب نمی‌شود.',
    generatedAtIso: nowIso,
  };
}
