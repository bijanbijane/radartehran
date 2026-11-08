import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createMarketIntelligenceService,
  type MarketEvidenceEventInput,
} from '../server/modules/market-intelligence';

function buildSampleEvents(): MarketEvidenceEventInput[] {
  return [
    // Hood 1 (Niavaran) — Month 1 (2026-08)
    {
      id: 'ev_m1_1',
      sourceRecordId: 'tx_2001',
      sourceCategory: 'VERIFIED_TRANSACTION',
      cityId: 'tehran',
      districtId: 'd1',
      hoodId: 1,
      hoodName: 'نیاوران',
      propertyCategory: 'residential',
      transactionType: 'sale',
      sqm: 100,
      buildYear: 1403,
      completedPriceMillion: 15000,
      publishedAtIso: '2026-07-20T00:00:00.000Z',
      completedAtIso: '2026-08-10T00:00:00.000Z',
      observedAtIso: '2026-08-10T00:00:00.000Z',
      privateParticipantId: 'secret_buyer_1',
    },
    {
      id: 'ev_m1_2',
      sourceRecordId: 'tx_2002',
      sourceCategory: 'VERIFIED_TRANSACTION',
      cityId: 'tehran',
      districtId: 'd1',
      hoodId: 1,
      hoodName: 'نیاوران',
      propertyCategory: 'residential',
      transactionType: 'sale',
      sqm: 120,
      buildYear: 1400,
      completedPriceMillion: 18240, // 152M/sqm
      publishedAtIso: '2026-07-25T00:00:00.000Z',
      completedAtIso: '2026-08-15T00:00:00.000Z',
      observedAtIso: '2026-08-15T00:00:00.000Z',
    },
    // Hood 1 — Month 2 (2026-09) intentionally left empty to test missing period handling!
    // Hood 1 — Month 3 (2026-10)
    {
      id: 'ev_m3_1',
      sourceRecordId: 'tx_2003',
      sourceCategory: 'VERIFIED_TRANSACTION',
      cityId: 'tehran',
      districtId: 'd1',
      hoodId: 1,
      hoodName: 'نیاوران',
      propertyCategory: 'residential',
      transactionType: 'sale',
      sqm: 100,
      buildYear: 1404,
      completedPriceMillion: 16200, // 162M/sqm
      publishedAtIso: '2026-09-25T00:00:00.000Z',
      completedAtIso: '2026-10-12T00:00:00.000Z',
      observedAtIso: '2026-10-12T00:00:00.000Z',
    },
    {
      id: 'ev_m3_2',
      sourceRecordId: 'lst_2004',
      sourceCategory: 'PUBLISHED_LISTING',
      cityId: 'tehran',
      districtId: 'd1',
      hoodId: 1,
      hoodName: 'نیاوران',
      propertyCategory: 'residential',
      transactionType: 'sale',
      sqm: 110,
      buildYear: 1402,
      askingPriceMillion: 18700, // 170M/sqm asking
      priceReducedCount: 1,
      publishedAtIso: '2026-10-01T00:00:00.000Z',
      observedAtIso: '2026-10-18T00:00:00.000Z',
    },
    {
      id: 'ev_m3_3',
      sourceRecordId: 'lst_2005',
      sourceCategory: 'PUBLISHED_LISTING',
      cityId: 'tehran',
      districtId: 'd1',
      hoodId: 1,
      hoodName: 'نیاوران',
      propertyCategory: 'residential',
      transactionType: 'sale',
      sqm: 90,
      buildYear: 1396,
      askingPriceMillion: 15120, // 168M/sqm asking
      isWithdrawnOrExpired: true,
      publishedAtIso: '2026-09-15T00:00:00.000Z',
      observedAtIso: '2026-10-20T00:00:00.000Z',
    },
    // Hood 1 — Month 4 (2026-11)
    {
      id: 'ev_m4_1',
      sourceRecordId: 'tx_2006',
      sourceCategory: 'VERIFIED_TRANSACTION',
      cityId: 'tehran',
      districtId: 'd1',
      hoodId: 1,
      hoodName: 'نیاوران',
      propertyCategory: 'residential',
      transactionType: 'sale',
      sqm: 95,
      buildYear: 1404,
      completedPriceMillion: 15960, // 168M/sqm
      isReservationActive: true,
      publishedAtIso: '2026-10-20T00:00:00.000Z',
      completedAtIso: '2026-11-04T00:00:00.000Z',
      observedAtIso: '2026-11-04T00:00:00.000Z',
    },
    // Rental observations for Hood 1 (for rental intelligence & yield)
    {
      id: 'ev_rent_1',
      sourceRecordId: 'ten_3001',
      sourceCategory: 'VERIFIED_TENANCY',
      cityId: 'tehran',
      districtId: 'd1',
      hoodId: 1,
      hoodName: 'نیاوران',
      propertyCategory: 'residential',
      transactionType: 'rent',
      sqm: 100,
      buildYear: 1402,
      furnishedStatus: 'furnished',
      depositMillion: 1000,
      monthlyRentMillion: 35,
      observedAtIso: '2026-10-15T00:00:00.000Z',
    },
    {
      id: 'ev_rent_2',
      sourceRecordId: 'ten_3002',
      sourceCategory: 'VERIFIED_TENANCY',
      cityId: 'tehran',
      districtId: 'd1',
      hoodId: 1,
      hoodName: 'نیاوران',
      propertyCategory: 'residential',
      transactionType: 'rent',
      sqm: 95,
      buildYear: 1400,
      furnishedStatus: 'unfurnished',
      depositMillion: 1200,
      monthlyRentMillion: 25,
      observedAtIso: '2026-10-20T00:00:00.000Z',
    },
    {
      id: 'ev_rent_3',
      sourceRecordId: 'ten_3003',
      sourceCategory: 'VERIFIED_TENANCY',
      cityId: 'tehran',
      districtId: 'd1',
      hoodId: 1,
      hoodName: 'نیاوران',
      propertyCategory: 'residential',
      transactionType: 'rent',
      sqm: 110,
      buildYear: 1403,
      furnishedStatus: 'unfurnished',
      depositMillion: 1500,
      monthlyRentMillion: 30,
      observedAtIso: '2026-10-25T00:00:00.000Z',
    },
    // Commercial retail segment in Hood 1
    {
      id: 'ev_comm_1',
      sourceRecordId: 'tx_4001',
      sourceCategory: 'VERIFIED_TRANSACTION',
      cityId: 'tehran',
      hoodId: 1,
      propertyCategory: 'commercial',
      commercialSubSegment: 'retail',
      transactionType: 'sale',
      sqm: 45,
      commercialFrontageMeters: 6.5,
      completedPriceMillion: 15750,
      observedAtIso: '2026-10-15T00:00:00.000Z',
    },
    {
      id: 'ev_comm_2',
      sourceRecordId: 'tx_4002',
      sourceCategory: 'VERIFIED_TRANSACTION',
      cityId: 'tehran',
      hoodId: 1,
      propertyCategory: 'commercial',
      commercialSubSegment: 'retail',
      transactionType: 'sale',
      sqm: 50,
      commercialFrontageMeters: 7.0,
      completedPriceMillion: 18000,
      observedAtIso: '2026-10-18T00:00:00.000Z',
    },
    {
      id: 'ev_comm_3',
      sourceRecordId: 'tx_4003',
      sourceCategory: 'VERIFIED_TRANSACTION',
      cityId: 'tehran',
      hoodId: 1,
      propertyCategory: 'commercial',
      commercialSubSegment: 'retail',
      transactionType: 'sale',
      sqm: 60,
      commercialFrontageMeters: 8.0,
      completedPriceMillion: 21000,
      observedAtIso: '2026-10-22T00:00:00.000Z',
    },
    // Hood 2 (Saadat Abad) — only 1 observation (below ranking & public sample threshold)
    {
      id: 'ev_h2_1',
      sourceRecordId: 'tx_5001',
      sourceCategory: 'VERIFIED_TRANSACTION',
      cityId: 'tehran',
      hoodId: 2,
      hoodName: 'سعادت‌آباد',
      propertyCategory: 'residential',
      transactionType: 'sale',
      sqm: 100,
      completedPriceMillion: 12500,
      observedAtIso: '2026-10-15T00:00:00.000Z',
    },
  ];
}

test('Employee 60 — 1. Market indicators, asking vs verified separation, liquidity, supply/demand & rental yield', () => {
  const service = createMarketIntelligenceService({
    now: () => new Date('2026-11-08T00:00:00.000Z'),
  });

  const ingestRes = service.ingestEvidenceEvents(buildSampleEvents());
  assert.ok(ingestRes.ingestedCount >= 12);

  const saleInd = service.getMarketIndicators({
    cityId: 'tehran',
    hoodId: 1,
    propertyCategory: 'residential',
    transactionType: 'sale',
    periodStartIso: '2026-08-01T00:00:00.000Z',
    periodEndIso: '2026-11-08T00:00:00.000Z',
    isPublicRequest: false,
  });

  // Asking vs verified prices are clearly distinguished
  assert.ok(saleInd.medianVerifiedPricePerSqmMillion !== null);
  assert.ok(saleInd.medianAskingPricePerSqmMillion !== null);
  assert.notEqual(saleInd.medianVerifiedPricePerSqmMillion, saleInd.medianAskingPricePerSqmMillion);
  assert.ok((saleInd.estimatedGrossRentalYieldPct ?? 0) > 0);
  assert.ok((saleInd.medianDaysToCompletion ?? 0) > 0);
  assert.ok((saleInd.listingToTransactionConversionPct ?? 0) > 0);
  assert.ok((saleInd.priceReductionFrequencyPct ?? 0) > 0);
  assert.ok((saleInd.listingWithdrawalFrequencyPct ?? 0) > 0);
  assert.ok((saleInd.modelDerivedAbsorptionRatePct ?? 0) > 0);
  assert.equal(saleInd.reliability.verifiedObservationCount, 4);
  assert.equal(saleInd.reliability.askingObservationCount, 2);
  assert.ok((saleInd.lineage?.sourceRecordIds.length ?? 0) === 6);

  // Public request suppresses small samples (Hood 2 has only 1 sample < 3) and hides sourceRecordIds
  const hood2Public = service.getMarketIndicators({
    cityId: 'tehran',
    hoodId: 2,
    propertyCategory: 'residential',
    transactionType: 'sale',
    isPublicRequest: true,
  });
  assert.equal(hood2Public.reliability.availabilityStatus, 'SUPPRESSED_PRIVACY');
  assert.equal(hood2Public.medianVerifiedPricePerSqmMillion, null);
  assert.equal(hood2Public.lineage?.sourceRecordIds.length, 0);
});

test('Employee 60 — 2. Temporal aggregation, explicit missing periods, rolling stats & short-term forecasting', () => {
  const service = createMarketIntelligenceService({
    now: () => new Date('2026-11-08T00:00:00.000Z'),
  });
  service.ingestEvidenceEvents(buildSampleEvents());

  const series = service.getTemporalMarketSeries({
    cityId: 'tehran',
    hoodId: 1,
    propertyCategory: 'residential',
    transactionType: 'sale',
    granularity: 'monthly',
    periodStartIso: '2026-08-01T00:00:00.000Z',
    periodEndIso: '2026-11-08T00:00:00.000Z',
  });

  assert.ok(series.buckets.length >= 3);
  // Find missing period bucket (September)
  const missingBucket = series.buckets.find((b) => !b.hasObservations);
  assert.ok(missingBucket, 'Missing period must be explicitly represented');
  assert.equal(missingBucket.transactionVolume, null); // Never report missing data as 0 activity
  assert.equal(missingBucket.statusNote, 'NO_OBSERVATIONS_IN_PERIOD');

  // Observed buckets have rolling median and growth rate
  const observedBuckets = series.buckets.filter((b) => b.hasObservations);
  assert.equal(observedBuckets.length, 3);
  assert.ok(observedBuckets[2].rollingMedianPsmMillion !== null);
  assert.ok((series.overallGrowthPct ?? 0) > 0);

  // Forecast for Hood 1 (3 observed buckets, 6 observations -> eligible)
  const forecastH1 = service.getShortTermForecast({
    cityId: 'tehran',
    hoodId: 1,
    propertyCategory: 'residential',
    transactionType: 'sale',
    periodStartIso: '2026-08-01T00:00:00.000Z',
    periodEndIso: '2026-11-08T00:00:00.000Z',
    horizonMonths: 3,
  });
  assert.equal(forecastH1.eligible, true);
  assert.equal(forecastH1.projections.length, 3);
  assert.ok(forecastH1.projections[0].lowBoundPsmMillion < forecastH1.projections[0].pointForecastPsmMillion);
  assert.ok(forecastH1.projections[0].highBoundPsmMillion > forecastH1.projections[0].pointForecastPsmMillion);

  // Forecast for Hood 2 (insufficient evidence -> disabled)
  const forecastH2 = service.getShortTermForecast({
    cityId: 'tehran',
    hoodId: 2,
    propertyCategory: 'residential',
    transactionType: 'sale',
    periodStartIso: '2026-08-01T00:00:00.000Z',
    periodEndIso: '2026-11-08T00:00:00.000Z',
  });
  assert.equal(forecastH2.eligible, false);
  assert.equal(forecastH2.ineligibilityReason, 'INSUFFICIENT_HISTORICAL_EVIDENCE');
});

test('Employee 60 — 3. Segmentation, commercial analytics, geographic comparisons & anomaly detection/review', () => {
  const service = createMarketIntelligenceService({
    now: () => new Date('2026-11-08T00:00:00.000Z'),
  });
  service.ingestEvidenceEvents(buildSampleEvents());

  const segments = service.getMarketSegmentsForScope({
    cityId: 'tehran',
    hoodId: 1,
    suppressSmallSamples: true,
  });
  const retailSeg = segments.find((s) => s.segmentKey === 'retail');
  assert.ok(retailSeg);
  assert.equal(retailSeg.suppressedForPrivacyOrSampleSize, false);
  assert.ok((retailSeg.commercialFrontageMedianMeters ?? 0) >= 6.5);

  // Small segment (furnished rental has only 1 sample) is suppressed for privacy/reliability
  const furnishedSeg = segments.find((s) => s.segmentKey === 'furnished');
  assert.ok(furnishedSeg);
  assert.equal(furnishedSeg.suppressedForPrivacyOrSampleSize, true);
  assert.equal(furnishedSeg.medianRentPerSqmThousandToman, null);

  // Geographic comparison: Hood 1 is eligible for ranking; Hood 2 (1 sample) is ineligible
  const comparison = service.compareNeighborhoods({
    cityId: 'tehran',
    hoodIds: [1, 2],
    propertyCategory: 'residential',
    transactionType: 'sale',
    periodStartIso: '2026-08-01T00:00:00.000Z',
    periodEndIso: '2026-11-08T00:00:00.000Z',
  });
  const c1 = comparison.find((c) => c.hoodId === 1);
  const c2 = comparison.find((c) => c.hoodId === 2);
  assert.equal(c1?.eligibleForRanking, true);
  assert.equal(c1?.rankByPricePerSqm, 1);
  assert.equal(c2?.eligibleForRanking, false);
  assert.equal(c2?.rankByPricePerSqm, undefined);

  // Anomaly detection: inject suspicious repeated identical prices in Hood 3
  service.ingestEvidenceEvents([
    { id: 'rep_1', sourceRecordId: 'r1', sourceCategory: 'PUBLISHED_LISTING', cityId: 'tehran', hoodId: 3, propertyCategory: 'residential', transactionType: 'sale', sqm: 100, askingPriceMillion: 9999, observedAtIso: '2026-10-05T00:00:00.000Z' },
    { id: 'rep_2', sourceRecordId: 'r2', sourceCategory: 'PUBLISHED_LISTING', cityId: 'tehran', hoodId: 3, propertyCategory: 'residential', transactionType: 'sale', sqm: 105, askingPriceMillion: 9999, observedAtIso: '2026-10-06T00:00:00.000Z' },
    { id: 'rep_3', sourceRecordId: 'r3', sourceCategory: 'PUBLISHED_LISTING', cityId: 'tehran', hoodId: 3, propertyCategory: 'residential', transactionType: 'sale', sqm: 98, askingPriceMillion: 9999, observedAtIso: '2026-10-07T00:00:00.000Z' },
    { id: 'rep_4', sourceRecordId: 'r4', sourceCategory: 'PUBLISHED_LISTING', cityId: 'tehran', hoodId: 3, propertyCategory: 'residential', transactionType: 'sale', sqm: 110, askingPriceMillion: 9999, observedAtIso: '2026-10-08T00:00:00.000Z' },
  ]);

  const detected = service.detectAndStoreAnomalies({
    cityId: 'tehran',
    hoodId: 3,
    propertyCategory: 'residential',
    transactionType: 'sale',
    periodStartIso: '2026-10-01T00:00:00.000Z',
    periodEndIso: '2026-10-30T00:00:00.000Z',
  });
  assert.ok(detected.some((a) => a.category === 'DATA_QUALITY_ANOMALY' && a.anomalyType === 'SUSPICIOUS_REPEATED_PRICES'));

  // Public anomaly list is empty before admin approval
  assert.equal(service.listAnomalies({ cityId: 'tehran', hoodId: 3, onlyPubliclyApproved: true }).length, 0);

  // Admin approves anomaly for public display
  service.reviewAnomaly({
    actorUid: 'admin_60',
    anomalyId: detected[0].id,
    decision: 'APPROVED_PUBLIC',
    notes: 'Confirmed market notice',
  });
  assert.equal(service.listAnomalies({ cityId: 'tehran', hoodId: 3, onlyPubliclyApproved: true }).length, 1);
});

test('Employee 60 — 4. Incremental cache invalidation, idempotent aggregation jobs & historical version preservation', async () => {
  const service = createMarketIntelligenceService({
    now: () => new Date('2026-11-08T00:00:00.000Z'),
  });
  service.ingestEvidenceEvents(buildSampleEvents());

  // Populate cache for Hood 1 and Hood 2
  service.getNeighborhoodMarketProfile({ cityId: 'tehran', hoodId: 1, isPublicRequest: true });
  service.getNeighborhoodMarketProfile({ cityId: 'tehran', hoodId: 2, isPublicRequest: true });
  assert.equal(service.isNeighborhoodProfileCached('tehran', 1, true), true);
  assert.equal(service.isNeighborhoodProfileCached('tehran', 2, true), true);

  // New evidence in Hood 1 invalidates Hood 1 cache without invalidating unrelated Hood 2 cache
  service.ingestEvidenceEvents([
    {
      id: 'ev_new_h1',
      sourceRecordId: 'tx_9001',
      sourceCategory: 'VERIFIED_TRANSACTION',
      cityId: 'tehran',
      hoodId: 1,
      propertyCategory: 'residential',
      transactionType: 'sale',
      sqm: 100,
      completedPriceMillion: 16500,
      observedAtIso: '2026-11-06T00:00:00.000Z',
    },
  ]);
  assert.equal(service.isNeighborhoodProfileCached('tehran', 1, true), false);
  assert.equal(service.isNeighborhoodProfileCached('tehran', 2, true), true);

  // Run aggregation job v1 and v2; verify idempotency and immutable history preservation
  const job1 = await service.runAggregationJob({
    actorUid: 'admin_60',
    idempotencyKey: 'agg_key_101',
    jobType: 'INCREMENTAL_NEIGHBORHOOD',
    cityId: 'tehran',
    hoodIds: [1],
  });
  const job1Dup = await service.runAggregationJob({
    actorUid: 'admin_60',
    idempotencyKey: 'agg_key_101',
    jobType: 'INCREMENTAL_NEIGHBORHOOD',
    cityId: 'tehran',
    hoodIds: [1],
  });
  assert.equal(job1.id, job1Dup.id);

  const job2 = await service.runAggregationJob({
    actorUid: 'admin_60',
    idempotencyKey: 'agg_key_102',
    jobType: 'RECALCULATION',
    cityId: 'tehran',
    hoodIds: [1],
  });
  assert.ok(job2.newAggregationVersion > job1.newAggregationVersion);

  const history = service.listMaterializedHistory({ cityId: 'tehran', hoodId: 1 });
  assert.equal(history.length, 2);
  assert.notEqual(history[0].reliability.aggregationVersion, history[1].reliability.aggregationVersion);
});
