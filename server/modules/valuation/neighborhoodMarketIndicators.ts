import type {
  NeighborhoodMarketIntelligenceIndicators,
  PropertyCategory,
} from './types';
import type { ValuationDataConsumerAdapter } from './types';
import { computeMedian, computePercentile } from './evidenceAndComparableEngine';

export async function buildNeighborhoodMarketIndicators(params: {
  cityId: string;
  hoodId: number;
  propertyCategory?: PropertyCategory;
  dataConsumer: ValuationDataConsumerAdapter;
}): Promise<NeighborhoodMarketIntelligenceIndicators> {
  const benchmark = await params.dataConsumer.getNeighborhoodBenchmark({
    cityId: params.cityId,
    hoodId: params.hoodId,
  });
  if (!benchmark) {
    throw new Error(`Neighborhood benchmark not found for city '${params.cityId}' hood #${params.hoodId}.`);
  }

  const queryBase = {
    cityId: params.cityId,
    hoodId: params.hoodId,
    propertyCategory: params.propertyCategory ?? 'residential',
    transactionType: 'sale' as const,
    sqm: 100,
    limit: 50,
  };

  const [askingComps, confirmedComps] = await Promise.all([
    params.dataConsumer.queryComparableListings({ ...queryBase, evidenceType: 'asking_listing' }),
    params.dataConsumer.queryComparableListings({ ...queryBase, evidenceType: 'confirmed_transaction' }),
  ]);

  const collectPsm = (rows: typeof askingComps, baselinePsm: number) => {
    const psmList: number[] = [];
    let outlierExcludedCount = 0;
    for (const c of rows) {
      if (c.sqm <= 0 || c.priceNumericMillion <= 0) continue;
      if (c.verificationStatus === 'REJECTED' || c.verificationStatus === 'PENDING_REVIEW') continue;
      const psm = c.priceNumericMillion / c.sqm;
      if (Math.abs(psm - baselinePsm) / Math.max(1, baselinePsm) > 0.45) outlierExcludedCount++;
      else psmList.push(psm);
    }
    return { psmList, outlierExcludedCount };
  };

  const asking = collectPsm(askingComps, benchmark.basePricePerSqmMillion);
  const confirmed = collectPsm(confirmedComps, benchmark.basePricePerSqmMillion);
  const medianAsking = asking.psmList.length > 0 ? computeMedian(asking.psmList) : null;
  const medianConfirmed = confirmed.psmList.length > 0 ? computeMedian(confirmed.psmList) : null;
  const avgAsking =
    asking.psmList.length > 0
      ? asking.psmList.reduce((acc, v) => acc + v, 0) / asking.psmList.length
      : benchmark.basePricePerSqmMillion;

  const sampleSufficiency =
    asking.psmList.length >= 10 ? 'sufficient' : asking.psmList.length >= 3 ? 'limited' : 'insufficient';

  let marketHeatStatus: NeighborhoodMarketIntelligenceIndicators['marketHeatStatus'] = 'INSUFFICIENT_DATA';
  if (sampleSufficiency !== 'insufficient' && asking.psmList.length >= 10) {
    marketHeatStatus = asking.psmList.length >= 20 ? 'hot' : 'balanced';
  }

  return {
    cityId: params.cityId,
    hoodId: params.hoodId,
    hoodName: benchmark.hoodName,
    zone: benchmark.zone,
    medianAskingPricePerSqmMillion: Number((medianAsking ?? benchmark.basePricePerSqmMillion).toFixed(2)),
    averageAskingPricePerSqmMillion: Number(avgAsking.toFixed(2)),
    p25PricePerSqmMillion: Number(
      (asking.psmList.length > 0 ? computePercentile(asking.psmList, 0.25) : benchmark.basePricePerSqmMillion * 0.92).toFixed(2),
    ),
    p75PricePerSqmMillion: Number(
      (asking.psmList.length > 0 ? computePercentile(asking.psmList, 0.75) : benchmark.basePricePerSqmMillion * 1.08).toFixed(2),
    ),
    activeListingCount: asking.psmList.length,
    confirmedTransactionCount: confirmed.psmList.length,
    medianConfirmedTransactionPricePerSqmMillion:
      medianConfirmed !== null ? Number(medianConfirmed.toFixed(2)) : null,
    outlierExcludedCount: asking.outlierExcludedCount + confirmed.outlierExcludedCount,
    priceChange30dPct: null,
    marketHeatStatus,
    sampleSufficiency,
    freshnessTimestampIso: benchmark.lastUpdatedIso,
  };
}