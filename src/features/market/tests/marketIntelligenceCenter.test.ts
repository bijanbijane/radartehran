import test from 'node:test';
import assert from 'node:assert/strict';
import {
  INITIAL_NEIGHBORHOODS,
  getNeighborhoodMarketReport,
  getNeighborhoodTrafficInfo,
  type EvaluatedNeighborhood,
} from '../../../data/neighborhoods';
import {
  computeDistributionStats,
  computeMean,
  computeMedian,
  computeQuantile,
  buildSupplyCompositionByArea,
} from '../services/marketStatsHelpers';
import {
  RENT_CONVERSION_ANNUAL_RATE,
  evaluateSampleSufficiency,
  resolveRentEquivalent,
} from '../indicators/IndicatorRegistry';
import {
  commitMarketDraft,
  createDefaultMarketDraft,
  isDraftDirty,
  normalizeDraftForMarketType,
  resetMarketFiltersToDefault,
} from '../filters/MarketFilterDraft';
import {
  parseMarketContextFromQuery,
  serializeMarketContextToQuery,
} from '../state/marketUrlAdapter';
import { buildMarketSnapshotBundle } from '../services/marketDataAdapter';
import { buildMarketAggregateExport, createRequestSequenceGuard } from '../services/marketQueryService';

test('Statistical helpers compute exact Mean, Median, Percentiles (P10/P25/P75/P90) and IQR', () => {
  const sample = [100, 120, 140, 160, 180, 200, 220, 240, 260];
  assert.equal(computeMean(sample), 180);
  assert.equal(computeMedian(sample), 180);
  assert.equal(computeQuantile(sample, 0.25), 140);
  assert.equal(computeQuantile(sample, 0.75), 220);

  const dist = computeDistributionStats(sample);
  assert.equal(dist.count, 9);
  assert.equal(dist.min, 100);
  assert.equal(dist.max, 260);
  assert.equal(dist.median, 180);
  assert.equal(dist.iqr, 80);
  assert.ok(dist.p10 !== null && dist.p90 !== null && dist.p90 > dist.p10);

  const empty = computeDistributionStats([]);
  assert.equal(empty.count, 0);
  assert.equal(empty.median, null);
  assert.deepEqual(empty.bins, []);
});

test('Rent formula separates raw deposit and uses documented conversion rate 0.36/yr (3%/mo)', () => {
  assert.equal(RENT_CONVERSION_ANNUAL_RATE, 0.36);
  // 1000M deposit, 0 monthly -> 1000 * 0.36 / 12 = 30M/month
  assert.equal(resolveRentEquivalent(1000, 0), 30);
  // 500M deposit + 10M monthly -> 10 + 15 = 25M/month
  assert.equal(resolveRentEquivalent(500, 10), 25);
});

test('Sample sufficiency and non-residential category gating never fabricate unavailable data', () => {
  assert.equal(evaluateSampleSufficiency('commercial', 'neighborhood', 10, 'asking_price_median_sqm'), 'unavailable');
  assert.equal(evaluateSampleSufficiency('office', 'city', 20, 'asking_price_median_sqm'), 'unavailable');
  assert.equal(evaluateSampleSufficiency('land', 'zone', 8, 'asking_price_median_sqm'), 'unavailable');
  assert.equal(evaluateSampleSufficiency('residential', 'neighborhood', 5, 'verified_transaction_sqm'), 'unavailable');
  assert.equal(evaluateSampleSufficiency('residential', 'neighborhood', 0, 'asking_price_median_sqm'), 'provisional');
  assert.equal(evaluateSampleSufficiency('residential', 'city', 5, 'asking_price_median_sqm'), 'insufficient_sample');
  assert.equal(evaluateSampleSufficiency('residential', 'city', 20, 'asking_price_median_sqm'), 'published');
});

test('Draft vs Applied filter contract tracks dirty state, resets cleanly, and adapts controls per market type', () => {
  const initialDraft = createDefaultMarketDraft('sale', 'neighborhood', 'منطقه ۵');
  const applied = commitMarketDraft(initialDraft);
  assert.equal(isDraftDirty(initialDraft, applied), false);

  const editedDraft = { ...initialDraft, period: '365d' as const, areaRange: '75to120' as const };
  assert.equal(isDraftDirty(editedDraft, applied), true);

  const landNormalized = normalizeDraftForMarketType({ ...editedDraft, rooms: '3plus', transactionType: 'rent' }, 'land');
  assert.equal(landNormalized.marketType, 'land');
  assert.equal(landNormalized.transactionType, 'sale');
  assert.equal(landNormalized.rooms, 'all');
  assert.equal(landNormalized.propertySubType, 'land_plot');

  const reset = resetMarketFiltersToDefault('منطقه ۵');
  assert.equal(isDraftDirty(reset.draft, reset.applied), false);
  assert.equal(reset.applied.period, '180d');
});

test('URL state adapter serializes/parses safe allowlisted params and ignores corrupted values', () => {
  const draft = { ...createDefaultMarketDraft('rent', 'zone', 'منطقه ۲'), period: '90d' as const, onlyObserved: true };
  const qs = serializeMarketContextToQuery(draft, [3, 5, 7]);
  const parsed = parseMarketContextFromQuery(`?${qs}`);
  assert.equal(parsed.draftPatch.transactionType, 'rent');
  assert.equal(parsed.draftPatch.geoLevel, 'zone');
  assert.equal(parsed.draftPatch.period, '90d');
  assert.equal(parsed.draftPatch.onlyObserved, true);
  assert.deepEqual(parsed.compareHoodIds, [3, 5, 7]);

  const poisoned = parseMarketContextFromQuery('?market=hacked&tx=invalid&cmp=-5,abc,12');
  assert.equal(poisoned.draftPatch.marketType, 'residential');
  assert.equal(poisoned.draftPatch.transactionType, 'sale');
  assert.deepEqual(poisoned.compareHoodIds, [12]);
});

test('marketDataAdapter strictly separates asking vs v6.4 estimated vs verified=0 and guards stale requests', () => {
  const evaluated: EvaluatedNeighborhood[] = INITIAL_NEIGHBORHOODS.map((h) => {
    const trafficInfo = getNeighborhoodTrafficInfo(h);
    return {
      ...h,
      baseBuyPerSqm: h.buyPerSqm,
      marketReport: getNeighborhoodMarketReport(h),
      trafficInfo,
      overallScore: Number(((h.metro + h.air + trafficInfo.trafficScore) / 3).toFixed(1)),
      status: 'green',
      distKm: null,
      diffPercent: 0,
    };
  });
  const punak = evaluated.find((h) => h.id === 5) || evaluated[0];
  const applied = commitMarketDraft(createDefaultMarketDraft('sale', 'neighborhood', punak.zone));

  const bundle = buildMarketSnapshotBundle({
    allHoods: evaluated,
    selectedHood: punak,
    activeCity: 'tehran',
    filters: applied,
    compareHoodIds: [3, 7],
    areaUnit: 'sqm',
    intlCurrency: 'IRT',
    radarLocale: 'fa',
  });

  assert.equal(bundle.quality.verifiedTransactionCount, 0);
  const askingInd = bundle.indicators.find((i) => i.id === 'asking_price_median_sqm');
  const dealInd = bundle.indicators.find((i) => i.id === 'estimated_deal_v64_sqm');
  const txInd = bundle.indicators.find((i) => i.id === 'verified_transaction_sqm');
  assert.equal(askingInd?.dataKind, 'asking_price');
  assert.equal(dealInd?.dataKind, 'estimated_value');
  assert.equal(txInd?.dataKind, 'transaction_price');
  assert.equal(txInd?.value, null);
  assert.equal(txInd?.status, 'unavailable');
  assert.ok(bundle.comparisonRows.length >= 2);

  // Supply shares sum cleanly
  const supply = buildSupplyCompositionByArea([
    { sqm: 60 },
    { sqm: 90 },
    { sqm: 140 },
  ]);
  assert.equal(supply.length, 3);
  assert.equal(supply.reduce((acc, s) => acc + s.count, 0), 3);

  // Request sequence guard prevents stale race condition
  const guard = createRequestSequenceGuard();
  const s1 = guard.next();
  const s2 = guard.next();
  assert.equal(guard.isLatest(s1), false);
  assert.equal(guard.isLatest(s2), true);

  // Export carries explicit provenance header
  const csv = buildMarketAggregateExport(bundle, applied, 'csv');
  assert.ok(csv.content.includes('Verified Registered Transactions: 0'));
  assert.ok(csv.content.includes('asking_price_median_sqm'));
});
