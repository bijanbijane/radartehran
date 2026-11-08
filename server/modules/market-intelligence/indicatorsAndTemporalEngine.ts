import crypto from 'crypto';
import type { PropertyCategory, ValuationTransactionType } from '../valuation';
import { computeMedian, computePercentile } from '../valuation';
import type {
  DataAvailabilityStatus,
  DataLineageMetadata,
  MarketEvidenceEventInput,
  MarketGeographicLevel,
  MarketIntelligenceConfig,
  TemporalMarketSeriesResult,
  TemporalSeriesBucket,
  TimeGranularity,
  ValidatedMarketIndicators,
} from './types';

export function createDefaultMarketIntelligenceConfig(nowIso = new Date().toISOString()): MarketIntelligenceConfig {
  return {
    configVersion: 1,
    methodologyVersion: 'mi_analytics_v3.1.0',
    minSampleThresholdPublic: 3,
    minSampleThresholdRanking: 3,
    minBucketsForForecast: 3,
    anomalyPriceSpikeThresholdPct: 22.0,
    anomalyVolumeSpikeThresholdPct: 60.0,
    rahnToRentConversionRatePct: 3.0,
    staleEvidenceThresholdDays: 90,
    updatedByUid: 'system_bootstrap',
    updatedAtIso: nowIso,
  };
}

export function filterOutliersIqr(events: MarketEvidenceEventInput[]): {
  clean: MarketEvidenceEventInput[];
  excludedCount: number;
} {
  const preFiltered = events.filter((e) => !e.isOutlier && e.sqm > 0);
  let excludedCount = events.length - preFiltered.length;
  if (preFiltered.length < 4) {
    return { clean: preFiltered, excludedCount };
  }

  const psmValues = preFiltered
    .map((e) => {
      const price = e.completedPriceMillion ?? e.askingPriceMillion ?? 0;
      return price > 0 ? price / e.sqm : 0;
    })
    .filter((v) => v > 0);

  if (psmValues.length < 4) {
    return { clean: preFiltered, excludedCount };
  }

  const median = computeMedian(psmValues);
  const q1 = computePercentile(psmValues, 0.25);
  const q3 = computePercentile(psmValues, 0.75);
  const iqr = Math.max(median * 0.12, q3 - q1);
  const lower = q1 - 1.7 * iqr;
  const upper = q3 + 1.7 * iqr;

  const clean: MarketEvidenceEventInput[] = [];
  for (const ev of preFiltered) {
    const price = ev.completedPriceMillion ?? ev.askingPriceMillion ?? 0;
    if (price > 0) {
      const psm = price / ev.sqm;
      if (psm < lower || psm > upper) {
        excludedCount++;
        continue;
      }
    }
    clean.push(ev);
  }
  return { clean, excludedCount };
}

export function computeEffectiveMonthlyRentThousandTomanPerSqm(
  ev: MarketEvidenceEventInput,
  rahnRatePct: number,
): number | null {
  if (ev.sqm <= 0) return null;
  const rahnRate = rahnRatePct / 100;
  const monthlyMillion =
    (ev.monthlyRentMillion ?? 0) + (ev.depositMillion ?? 0) * rahnRate;
  if (monthlyMillion <= 0) return null;
  return Number(((monthlyMillion * 1000) / ev.sqm).toFixed(2));
}

export function computeValidatedMarketIndicators(params: {
  geographicLevel: MarketGeographicLevel;
  cityId: string;
  districtId?: string;
  hoodId?: number;
  hoodName?: string;
  subNeighborhoodId?: string;
  propertyCategory: PropertyCategory;
  transactionType: ValuationTransactionType;
  periodStartIso: string;
  periodEndIso: string;
  scopedEvents: MarketEvidenceEventInput[];
  pairedRentalEventsForYield?: MarketEvidenceEventInput[];
  config: MarketIntelligenceConfig;
  aggregationVersion: number;
  nowIso: string;
  suppressSmallSamplesForPublic?: boolean;
}): ValidatedMarketIndicators {
  const {
    geographicLevel,
    cityId,
    districtId,
    hoodId,
    hoodName,
    subNeighborhoodId,
    propertyCategory,
    transactionType,
    periodStartIso,
    periodEndIso,
    scopedEvents,
    pairedRentalEventsForYield,
    config,
    aggregationVersion,
    nowIso,
    suppressSmallSamplesForPublic,
  } = params;

  const { clean, excludedCount } = filterOutliersIqr(scopedEvents);

  const verifiedEvents = clean.filter(
    (e) =>
      (e.sourceCategory === 'VERIFIED_TRANSACTION' || e.sourceCategory === 'VERIFIED_TENANCY' || e.sourceCategory === 'BROKERAGE_DEAL') &&
      (e.completedPriceMillion !== undefined || e.monthlyRentMillion !== undefined || e.depositMillion !== undefined),
  );
  const askingEvents = clean.filter(
    (e) => e.sourceCategory === 'PUBLISHED_LISTING' || (e.askingPriceMillion !== undefined && e.completedPriceMillion === undefined),
  );

  const totalCount = clean.length;
  const verifiedCount = verifiedEvents.length;
  const askingCount = askingEvents.length;
  const uniqueSources = new Set(clean.map((e) => e.sourceCategory)).size;

  const newestMs = clean.reduce((max, e) => Math.max(max, Date.parse(e.observedAtIso) || 0), 0);
  const freshnessDays =
    newestMs > 0 ? Math.max(0, Math.round((Date.parse(nowIso) - newestMs) / (1000 * 60 * 60 * 24))) : 999;

  let availabilityStatus: DataAvailabilityStatus = 'AVAILABLE';
  if (totalCount === 0) {
    availabilityStatus = 'NO_OBSERVATIONS';
  } else if (suppressSmallSamplesForPublic && totalCount < config.minSampleThresholdPublic) {
    availabilityStatus = 'SUPPRESSED_PRIVACY';
  } else if (totalCount < config.minSampleThresholdPublic) {
    availabilityStatus = 'INSUFFICIENT_SAMPLE';
  } else if (freshnessDays > config.staleEvidenceThresholdDays) {
    availabilityStatus = 'STALE_EVIDENCE';
  } else if (totalCount < 6) {
    availabilityStatus = 'LIMITED_SAMPLE';
  }

  const isSuppressed =
    availabilityStatus === 'NO_OBSERVATIONS' ||
    availabilityStatus === 'SUPPRESSED_PRIVACY' ||
    (suppressSmallSamplesForPublic && availabilityStatus === 'INSUFFICIENT_SAMPLE');

  const askingTotals = askingEvents
    .map((e) => e.askingPriceMillion ?? 0)
    .filter((v) => v > 0);
  const verifiedTotals = verifiedEvents
    .map((e) => e.completedPriceMillion ?? 0)
    .filter((v) => v > 0);

  const askingPsms = askingEvents
    .filter((e) => (e.askingPriceMillion ?? 0) > 0 && e.sqm > 0)
    .map((e) => (e.askingPriceMillion as number) / e.sqm);
  const verifiedPsms = verifiedEvents
    .filter((e) => (e.completedPriceMillion ?? 0) > 0 && e.sqm > 0)
    .map((e) => (e.completedPriceMillion as number) / e.sqm);

  let weightedPsm: number | null = null;
  if (!isSuppressed && (verifiedPsms.length > 0 || askingPsms.length > 0)) {
    let wSum = 0;
    let wTotal = 0;
    for (const p of verifiedPsms) {
      wSum += p * 1.0;
      wTotal += 1.0;
    }
    for (const p of askingPsms) {
      wSum += p * 0.96 * 0.65;
      wTotal += 0.65;
    }
    weightedPsm = wTotal > 0 ? Number((wSum / wTotal).toFixed(2)) : null;
  }

  const rentPerSqmValues = clean
    .map((e) => computeEffectiveMonthlyRentThousandTomanPerSqm(e, config.rahnToRentConversionRatePct))
    .filter((v): v is number => v !== null && v > 0);
  const rentalPricePerSqmThousandToman =
    !isSuppressed && rentPerSqmValues.length > 0 ? Number(computeMedian(rentPerSqmValues).toFixed(2)) : null;

  // Gross rental yield estimation (annualized rent per sqm / sale price per sqm)
  let estimatedGrossRentalYieldPct: number | null = null;
  const referenceSalePsm = verifiedPsms.length > 0 ? computeMedian(verifiedPsms) : weightedPsm;
  let referenceRentThousandPerSqm = rentalPricePerSqmThousandToman;
  if (!referenceRentThousandPerSqm && pairedRentalEventsForYield && pairedRentalEventsForYield.length >= 2) {
    const pairedVals = pairedRentalEventsForYield
      .map((e) => computeEffectiveMonthlyRentThousandTomanPerSqm(e, config.rahnToRentConversionRatePct))
      .filter((v): v is number => v !== null && v > 0);
    if (pairedVals.length >= 2) {
      referenceRentThousandPerSqm = computeMedian(pairedVals);
    }
  }
  if (!isSuppressed && referenceSalePsm && referenceSalePsm > 0 && referenceRentThousandPerSqm && referenceRentThousandPerSqm > 0) {
    const annualRentMillionPerSqm = (referenceRentThousandPerSqm * 12) / 1000;
    estimatedGrossRentalYieldPct = Number(((annualRentMillionPerSqm / referenceSalePsm) * 100).toFixed(2));
  }

  // Inventory & volume metrics
  const activeListings = askingEvents.filter((e) => !e.isWithdrawnOrExpired && !e.completedAtIso);
  const activeSaleListingInventory = transactionType === 'sale' ? activeListings.length : 0;
  const activeRentalListingInventory = transactionType === 'rent' ? activeListings.length : 0;
  const newListingVolume = askingEvents.length;
  const completedSaleVolume = transactionType === 'sale' ? verifiedEvents.length : 0;
  const completedRentalVolume = transactionType === 'rent' ? verifiedEvents.length : 0;

  // Liquidity & dynamics
  const priceReducedListings = askingEvents.filter((e) => (e.priceReducedCount ?? 0) > 0).length;
  const withdrawnListings = askingEvents.filter((e) => e.isWithdrawnOrExpired).length;
  const priceReductionFrequencyPct =
    !isSuppressed && askingEvents.length > 0
      ? Number(((priceReducedListings / askingEvents.length) * 100).toFixed(1))
      : null;
  const listingWithdrawalFrequencyPct =
    !isSuppressed && askingEvents.length > 0
      ? Number(((withdrawnListings / askingEvents.length) * 100).toFixed(1))
      : null;

  const listingAgesDays: number[] = [];
  const completionDays: number[] = [];
  for (const e of clean) {
    if (e.publishedAtIso) {
      const endRef = e.completedAtIso ?? e.observedAtIso;
      const days = Math.max(1, Math.round((Date.parse(endRef) - Date.parse(e.publishedAtIso)) / (1000 * 60 * 60 * 24)));
      if (Number.isFinite(days)) {
        listingAgesDays.push(days);
        if (e.completedAtIso && (e.sourceCategory === 'VERIFIED_TRANSACTION' || e.sourceCategory === 'VERIFIED_TENANCY')) {
          completionDays.push(days);
        }
      }
    }
  }

  const averageListingAgeDays =
    !isSuppressed && listingAgesDays.length > 0
      ? Number((listingAgesDays.reduce((a, b) => a + b, 0) / listingAgesDays.length).toFixed(1))
      : null;
  const medianListingAgeDays =
    !isSuppressed && listingAgesDays.length > 0 ? Number(computeMedian(listingAgesDays).toFixed(1)) : null;
  const medianDaysToCompletion =
    !isSuppressed && completionDays.length > 0 ? Number(computeMedian(completionDays).toFixed(1)) : null;

  const totalPool = activeListings.length + verifiedEvents.length + withdrawnListings;
  const listingToTransactionConversionPct =
    !isSuppressed && totalPool > 0 ? Number(((verifiedEvents.length / totalPool) * 100).toFixed(1)) : null;
  const inventoryTurnoverRatio =
    !isSuppressed && activeListings.length > 0
      ? Number((verifiedEvents.length / activeListings.length).toFixed(2))
      : null;

  // Supply & Demand
  const observedSupplyCount = activeListings.length;
  const observedCompletedDemandCount = verifiedEvents.length;
  const activeReservationCount = clean.filter((e) => e.isReservationActive).length;

  const modelDerivedAbsorptionRatePct =
    !isSuppressed && observedSupplyCount + observedCompletedDemandCount >= config.minSampleThresholdPublic
      ? Number(
          (
            ((observedCompletedDemandCount + activeReservationCount * 0.5) /
              Math.max(1, observedSupplyCount + observedCompletedDemandCount)) *
            100
          ).toFixed(1),
        )
      : null;

  const modelDerivedMonthsOfInventory =
    !isSuppressed && observedCompletedDemandCount > 0
      ? Number((observedSupplyCount / observedCompletedDemandCount).toFixed(2))
      : null;

  let supplyDemandBalanceStatus: ValidatedMarketIndicators['supplyDemandBalanceStatus'] = 'insufficient_evidence';
  if (modelDerivedAbsorptionRatePct !== null) {
    if (modelDerivedAbsorptionRatePct >= 40) supplyDemandBalanceStatus = 'seller_market';
    else if (modelDerivedAbsorptionRatePct >= 20) supplyDemandBalanceStatus = 'balanced';
    else supplyDemandBalanceStatus = 'buyer_market';
  }

  let marketActivityLevel: ValidatedMarketIndicators['marketActivityLevel'] = 'insufficient_evidence';
  if (!isSuppressed && totalCount >= config.minSampleThresholdPublic) {
    if (totalCount >= 20 || verifiedCount >= 8) marketActivityLevel = 'very_high';
    else if (totalCount >= 10 || verifiedCount >= 4) marketActivityLevel = 'high';
    else if (totalCount >= 5) marketActivityLevel = 'moderate';
    else marketActivityLevel = 'low';
  }

  const missingBuildYearCount = clean.filter((e) => e.buildYear === undefined).length;
  const missingValueRatio =
    totalCount > 0 ? Number((missingBuildYearCount / totalCount).toFixed(2)) : 0;

  const confidenceLevel =
    isSuppressed || totalCount < config.minSampleThresholdPublic
      ? 'insufficient'
      : verifiedCount >= 3 && totalCount >= 6
        ? 'high'
        : totalCount >= 3
          ? 'medium'
          : 'low';

  const lineage: DataLineageMetadata = {
    lineageId: `lin_${crypto.randomBytes(6).toString('hex')}`,
    sourceRecordIds: clean.map((e) => e.sourceRecordId),
    sourceCategories: Array.from(new Set(clean.map((e) => e.sourceCategory))),
    geographicLevel,
    cityId,
    districtId,
    hoodId,
    subNeighborhoodId,
    propertyCategory,
    transactionType,
    periodStartIso,
    periodEndIso,
    calculationMethod: 'iqr_filtered_median_and_reliability_weighted_mean',
    aggregationVersion,
    methodologyVersion: config.methodologyVersion,
    configVersion: config.configVersion,
    calculatedAtIso: nowIso,
    exclusionRulesApplied: ['IQR_1.7_OUTLIER_FILTER', 'SEPARATE_ASKING_VS_VERIFIED', 'MIN_SAMPLE_SUPPRESSION'],
  };

  return {
    id: `ind_${cityId}_${hoodId ?? 'all'}_${propertyCategory}_${transactionType}_v${aggregationVersion}`,
    geographicLevel,
    cityId,
    districtId,
    hoodId,
    hoodName,
    subNeighborhoodId,
    propertyCategory,
    transactionType,
    periodStartIso,
    periodEndIso,
    medianAskingTotalMillion: !isSuppressed && askingTotals.length > 0 ? Number(computeMedian(askingTotals).toFixed(1)) : null,
    medianVerifiedTransactionTotalMillion:
      !isSuppressed && verifiedTotals.length > 0 ? Number(computeMedian(verifiedTotals).toFixed(1)) : null,
    weightedAveragePricePerSqmMillion: weightedPsm,
    medianAskingPricePerSqmMillion:
      !isSuppressed && askingPsms.length > 0 ? Number(computeMedian(askingPsms).toFixed(2)) : null,
    medianVerifiedPricePerSqmMillion:
      !isSuppressed && verifiedPsms.length > 0 ? Number(computeMedian(verifiedPsms).toFixed(2)) : null,
    rentalPricePerSqmThousandToman,
    estimatedGrossRentalYieldPct,
    activeSaleListingInventory,
    activeRentalListingInventory,
    newListingVolume,
    completedSaleVolume,
    completedRentalVolume,
    priceReductionFrequencyPct,
    listingWithdrawalFrequencyPct,
    averageListingAgeDays,
    medianListingAgeDays,
    medianDaysToCompletion,
    listingToTransactionConversionPct,
    inventoryTurnoverRatio,
    observedSupplyCount,
    observedCompletedDemandCount,
    activeReservationCount,
    modelDerivedAbsorptionRatePct,
    modelDerivedMonthsOfInventory,
    supplyDemandBalanceStatus,
    marketActivityLevel,
    reliability: {
      observationCount: totalCount,
      verifiedObservationCount: verifiedCount,
      askingObservationCount: askingCount,
      sourceDiversityCount: uniqueSources,
      freshnessDays,
      missingValueRatio,
      outlierExcludedCount: excludedCount,
      availabilityStatus,
      confidenceLevel,
      methodologyVersion: config.methodologyVersion,
      aggregationVersion,
      configVersion: config.configVersion,
    },
    lineage,
  };
}

function generateTimeWindows(
  startIso: string,
  endIso: string,
  granularity: TimeGranularity,
): Array<{ bucketKey: string; startMs: number; endMs: number; startIso: string; endIso: string }> {
  const startMs = Date.parse(startIso);
  const endMs = Date.parse(endIso);
  const stepDaysMap: Record<TimeGranularity, number> = {
    daily: 1,
    weekly: 7,
    monthly: 30,
    quarterly: 90,
    annual: 365,
  };
  const stepMs = stepDaysMap[granularity] * 24 * 60 * 60 * 1000;
  const windows: Array<{ bucketKey: string; startMs: number; endMs: number; startIso: string; endIso: string }> = [];

  let cursor = startMs;
  let index = 1;
  while (cursor < endMs && index <= 120) {
    const next = Math.min(endMs, cursor + stepMs);
    const sIso = new Date(cursor).toISOString();
    const eIso = new Date(next).toISOString();
    windows.push({
      bucketKey: `${granularity}_${sIso.slice(0, 10)}`,
      startMs: cursor,
      endMs: next,
      startIso: sIso,
      endIso: eIso,
    });
    cursor = next;
    index++;
  }
  return windows;
}

export function computeTemporalMarketSeries(params: {
  cityId: string;
  hoodId?: number;
  propertyCategory: PropertyCategory;
  transactionType: ValuationTransactionType;
  granularity: TimeGranularity;
  periodStartIso: string;
  periodEndIso: string;
  events: MarketEvidenceEventInput[];
  config: MarketIntelligenceConfig;
}): TemporalMarketSeriesResult {
  const { cityId, hoodId, propertyCategory, transactionType, granularity, periodStartIso, periodEndIso, events, config } =
    params;

  const { clean } = filterOutliersIqr(events);
  const windows = generateTimeWindows(periodStartIso, periodEndIso, granularity);
  const buckets: TemporalSeriesBucket[] = [];

  for (const w of windows) {
    const bucketEvents = clean.filter((e) => {
      const t = Date.parse(e.observedAtIso);
      return t >= w.startMs && t < w.endMs;
    });

    if (bucketEvents.length === 0) {
      // Explicit missing period — NEVER treat absence of observations as 0 market activity
      buckets.push({
        bucketKey: w.bucketKey,
        periodStartIso: w.startIso,
        periodEndIso: w.endIso,
        hasObservations: false,
        observationCount: 0,
        verifiedCount: 0,
        medianAskingPsmMillion: null,
        medianVerifiedPsmMillion: null,
        weightedPsmMillion: null,
        rollingMedianPsmMillion: null,
        rollingAveragePsmMillion: null,
        absolutePriceChangePsmMillion: null,
        percentagePriceChangePct: null,
        accelerationPctDelta: null,
        transactionVolume: null,
        transactionVolumeChangePct: null,
        activeInventoryCount: null,
        inventoryChangePct: null,
        medianRentPerSqmThousandToman: null,
        statusNote: 'NO_OBSERVATIONS_IN_PERIOD',
      });
      continue;
    }

    const verified = bucketEvents.filter((e) => e.completedPriceMillion !== undefined);
    const asking = bucketEvents.filter((e) => e.askingPriceMillion !== undefined && e.completedPriceMillion === undefined);

    const vPsms = verified.map((e) => (e.completedPriceMillion as number) / e.sqm);
    const aPsms = asking.map((e) => (e.askingPriceMillion as number) / e.sqm);

    const medVerified = vPsms.length > 0 ? Number(computeMedian(vPsms).toFixed(2)) : null;
    const medAsking = aPsms.length > 0 ? Number(computeMedian(aPsms).toFixed(2)) : null;

    let wSum = 0;
    let wTotal = 0;
    for (const p of vPsms) {
      wSum += p;
      wTotal += 1;
    }
    for (const p of aPsms) {
      wSum += p * 0.96 * 0.65;
      wTotal += 0.65;
    }
    const weightedPsm = wTotal > 0 ? Number((wSum / wTotal).toFixed(2)) : null;

    const rentVals = bucketEvents
      .map((e) => computeEffectiveMonthlyRentThousandTomanPerSqm(e, config.rahnToRentConversionRatePct))
      .filter((v): v is number => v !== null && v > 0);
    const medRent = rentVals.length > 0 ? Number(computeMedian(rentVals).toFixed(2)) : null;

    buckets.push({
      bucketKey: w.bucketKey,
      periodStartIso: w.startIso,
      periodEndIso: w.endIso,
      hasObservations: true,
      observationCount: bucketEvents.length,
      verifiedCount: verified.length,
      medianAskingPsmMillion: medAsking,
      medianVerifiedPsmMillion: medVerified,
      weightedPsmMillion: weightedPsm,
      rollingMedianPsmMillion: null,
      rollingAveragePsmMillion: null,
      absolutePriceChangePsmMillion: null,
      percentagePriceChangePct: null,
      accelerationPctDelta: null,
      transactionVolume: verified.length,
      transactionVolumeChangePct: null,
      activeInventoryCount: asking.length,
      inventoryChangePct: null,
      medianRentPerSqmThousandToman: medRent,
    });
  }

  // Rolling stats, period-over-period changes, and acceleration
  let prevObservedBucket: TemporalSeriesBucket | null = null;
  for (let i = 0; i < buckets.length; i++) {
    const b = buckets[i];
    if (!b.hasObservations || b.weightedPsmMillion === null) continue;

    // 3-bucket rolling window over observed buckets
    const windowPrices: number[] = [];
    for (let j = Math.max(0, i - 2); j <= i; j++) {
      const p = buckets[j].weightedPsmMillion;
      if (buckets[j].hasObservations && p !== null) windowPrices.push(p);
    }
    if (windowPrices.length > 0) {
      b.rollingMedianPsmMillion = Number(computeMedian(windowPrices).toFixed(2));
      b.rollingAveragePsmMillion = Number(
        (windowPrices.reduce((acc, v) => acc + v, 0) / windowPrices.length).toFixed(2),
      );
    }

    if (prevObservedBucket && prevObservedBucket.weightedPsmMillion !== null && prevObservedBucket.weightedPsmMillion > 1) {
      b.absolutePriceChangePsmMillion = Number(
        (b.weightedPsmMillion - prevObservedBucket.weightedPsmMillion).toFixed(2),
      );
      b.percentagePriceChangePct = Number(
        (((b.weightedPsmMillion - prevObservedBucket.weightedPsmMillion) / prevObservedBucket.weightedPsmMillion) * 100).toFixed(2),
      );
      if (prevObservedBucket.percentagePriceChangePct !== null) {
        b.accelerationPctDelta = Number(
          (b.percentagePriceChangePct - prevObservedBucket.percentagePriceChangePct).toFixed(2),
        );
      }
      if (
        prevObservedBucket.transactionVolume !== null &&
        prevObservedBucket.transactionVolume >= 2 &&
        b.transactionVolume !== null
      ) {
        b.transactionVolumeChangePct = Number(
          (((b.transactionVolume - prevObservedBucket.transactionVolume) / prevObservedBucket.transactionVolume) * 100).toFixed(1),
        );
      }
      if (
        prevObservedBucket.activeInventoryCount !== null &&
        prevObservedBucket.activeInventoryCount >= 2 &&
        b.activeInventoryCount !== null
      ) {
        b.inventoryChangePct = Number(
          (((b.activeInventoryCount - prevObservedBucket.activeInventoryCount) / prevObservedBucket.activeInventoryCount) * 100).toFixed(1),
        );
      }
    }

    prevObservedBucket = b;
  }

  const observedPrices = buckets
    .map((b) => b.weightedPsmMillion)
    .filter((v): v is number => v !== null && v > 0);

  const firstPrice = observedPrices.length > 0 ? observedPrices[0] : null;
  const lastPrice = observedPrices.length > 1 ? observedPrices[observedPrices.length - 1] : null;
  const overallGrowthPct =
    firstPrice && lastPrice && firstPrice > 1
      ? Number((((lastPrice - firstPrice) / firstPrice) * 100).toFixed(2))
      : null;

  return {
    cityId,
    hoodId,
    propertyCategory,
    transactionType,
    granularity,
    periodStartIso,
    periodEndIso,
    buckets,
    historicalMinPsmMillion: observedPrices.length > 0 ? Math.min(...observedPrices) : null,
    historicalMaxPsmMillion: observedPrices.length > 0 ? Math.max(...observedPrices) : null,
    overallGrowthPct,
    methodologyVersion: config.methodologyVersion,
  };
}
