/**
 * @file tests/market-analytics-backend.test.ts
 * @description Comprehensive Test Suite for the Property Valuation & Market Analytics Backend (Employee 10).
 * Covers price calculations, rent and sale separation, source-category distinction, outliers,
 * missing-data safeguards, sample-size thresholds, confidence indicators, temporal consistency,
 * historical trends, neighborhood comparisons, and deterministic reproducibility.
 */

import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  CANONICAL_ANALYTICS_MODEL_VERSION,
  computeHistoricalMarketTrends,
  computeMissingSafeQualityIndex,
  computeNeighborhoodMarketIndicators,
  computePropertyOrNeighborhoodValuation,
  computeSupplyDemandIndicators,
  DEFAULT_VALUATION_MODEL_SPEC,
  detectStatisticalOutliers,
  InMemoryMarketAnalyticsRepository,
  MarketAnalyticsService,
  sanitizeAndDeduplicateObservations,
  type ApprovedBargainListingContract,
  type CrowdMarketObservationContract,
  type MarketObservationRecord,
} from '../server/modules/market-analytics';

const REF_TIMESTAMP = '2026-11-07T12:00:00.000Z';

function makeSaleObs(
  id: string,
  perSqm: number,
  overrides: Partial<MarketObservationRecord> = {}
): MarketObservationRecord {
  const sqm = overrides.sqm !== undefined ? overrides.sqm : 100;
  return {
    observationId: id,
    cityId: 'tehran',
    hoodId: 3, // Saadat Abad
    marketMode: 'sale',
    sourceCategory: 'verified_transaction',
    observedAtIso: '2026-11-01T10:00:00.000Z',
    sqm,
    totalPriceMillion: sqm !== null ? perSqm * sqm : perSqm * 100,
    depositMillion: null,
    monthlyRentMillion: null,
    buildYear: 1400,
    buildingAgeYears: 5,
    floor: 2,
    totalFloors: 5,
    hasParking: true,
    hasElevator: true,
    hasStorage: true,
    renovationGrade: 'standard',
    ...overrides,
  };
}

function makeRentalObs(
  id: string,
  depositMillion: number | null,
  monthlyRentMillion: number | null,
  overrides: Partial<MarketObservationRecord> = {}
): MarketObservationRecord {
  return {
    observationId: id,
    cityId: 'tehran',
    hoodId: 3,
    marketMode: 'rental',
    sourceCategory: 'verified_transaction',
    observedAtIso: '2026-11-01T10:00:00.000Z',
    sqm: 80,
    totalPriceMillion: null,
    depositMillion,
    monthlyRentMillion,
    buildYear: 1400,
    buildingAgeYears: 5,
    floor: 2,
    totalFloors: 5,
    hasParking: true,
    hasElevator: true,
    hasStorage: true,
    renovationGrade: 'standard',
    ...overrides,
  };
}

describe('Employee 10 — Property Valuation and Market Analytics Backend', () => {
  // =========================================================================
  // 1. Valuation Principles & 5-Category Source Distinction
  // =========================================================================
  describe('Source Category Distinction & Asking-to-Transaction Spread', () => {
    it('distinguishes verified transactions from asking prices and applies explicit negotiation haircuts', () => {
      // 5 public asking prices at 200M/sqm vs 5 verified transactions at 200M/sqm
      const askingPool = [1, 2, 3, 4, 5].map((i) =>
        makeSaleObs(`ask-${i}`, 200, {
          sourceCategory: 'public_asking_price',
          observedAtIso: `2026-11-0${i}T10:00:00.000Z`,
        })
      );
      const txPool = [1, 2, 3, 4, 5].map((i) =>
        makeSaleObs(`tx-${i}`, 200, {
          sourceCategory: 'verified_transaction',
          observedAtIso: `2026-11-0${i}T10:00:00.000Z`,
        })
      );

      const subject = { cityId: 'tehran' as const, hoodId: 3, marketMode: 'sale' as const, sqm: 100 };

      const askValuation = computePropertyOrNeighborhoodValuation({
        subject,
        observations: askingPool,
        valuationTimestampIso: REF_TIMESTAMP,
      });
      const txValuation = computePropertyOrNeighborhoodValuation({
        subject,
        observations: txPool,
        valuationTimestampIso: REF_TIMESTAMP,
      });

      assert.ok(askValuation.centralValue?.perSqmMillion);
      assert.ok(txValuation.centralValue?.perSqmMillion);
      // Asking prices receive 0.92 haircut (184M/sqm), whereas verified transactions receive 1.0 (200M/sqm)
      assert.equal(txValuation.centralValue?.perSqmMillion, 200);
      assert.equal(askValuation.centralValue?.perSqmMillion, 184);
      assert.equal(askValuation.dataSources[0].sourceCategory, 'public_asking_price');
      assert.equal(askValuation.dataSources[0].isTransactionEvidence, false);
      assert.equal(askValuation.dataSources[0].appliedAskingToTransactionFactor, 0.92);
      assert.ok(
        askValuation.limitations.some((l) => l.includes('معامله قطعی')),
        'Must explicitly warn when no verified transactions exist in the sample'
      );
    });

    it('rejects model-derived estimates from primary empirical evidence', () => {
      const observations: MarketObservationRecord[] = [
        makeSaleObs('m-1', 210, { sourceCategory: 'model_derived_estimate' }),
        makeSaleObs('tx-1', 200, { sourceCategory: 'verified_transaction' }),
      ];

      const sanitized = sanitizeAndDeduplicateObservations({
        observations,
        expectedCityId: 'tehran',
        expectedHoodId: 3,
        expectedMarketMode: 'sale',
        referenceTimestampIso: REF_TIMESTAMP,
      });

      assert.equal(sanitized.validObservations.length, 1);
      assert.equal(sanitized.rejections.length, 1);
      assert.equal(
        sanitized.rejections[0].reason,
        'MODEL_DERIVED_EXCLUDED_FROM_PRIMARY_EVIDENCE'
      );
    });
  });

  // =========================================================================
  // 2. Strict Separation of Sale and Rental Markets
  // =========================================================================
  describe('Sale and Rental Market Separation', () => {
    it('excludes rental observations from sale valuations and vice versa', () => {
      const mixedPool: MarketObservationRecord[] = [
        makeSaleObs('sale-1', 195, { observedAtIso: '2026-11-01T10:00:00.000Z' }),
        makeSaleObs('sale-2', 200, { observedAtIso: '2026-11-02T10:00:00.000Z' }),
        makeSaleObs('sale-3', 205, { observedAtIso: '2026-11-03T10:00:00.000Z' }),
        makeSaleObs('sale-4', 198, { observedAtIso: '2026-11-04T10:00:00.000Z' }),
        makeSaleObs('sale-5', 202, { observedAtIso: '2026-11-05T10:00:00.000Z' }),
        makeRentalObs('rent-1', 1200, 30, { observedAtIso: '2026-11-02T10:00:00.000Z' }),
      ];

      const saleRes = computePropertyOrNeighborhoodValuation({
        subject: { cityId: 'tehran', hoodId: 3, marketMode: 'sale', sqm: 100 },
        observations: mixedPool,
        valuationTimestampIso: REF_TIMESTAMP,
      });

      assert.equal(saleRes.comparableObservationsCount.inliersUsed, 5);
      assert.ok(
        saleRes.dataQuality.rejections.some(
          (r) => r.observationId === 'rent-1' && r.reason === 'CROSS_MODE_CONTAMINATION'
        )
      );
    });

    it('accurately converts deposit + monthly rent into Rahn-equivalent in rental valuations', () => {
      // 1000M deposit + 30M monthly rent at 3% rate => 1000 + (30 / 0.03) = 2000M Rahn-equivalent for 80 sqm (25M/sqm)
      const rentalPool = [1, 2, 3, 4, 5].map((i) =>
        makeRentalObs(`r-${i}`, 1000, 30, {
          observedAtIso: `2026-11-0${i}T10:00:00.000Z`,
        })
      );

      const rentRes = computePropertyOrNeighborhoodValuation({
        subject: { cityId: 'tehran', hoodId: 3, marketMode: 'rental', sqm: 80 },
        observations: rentalPool,
        valuationTimestampIso: REF_TIMESTAMP,
      });

      assert.equal(rentRes.status, 'authoritative_estimate');
      assert.equal(rentRes.centralValue?.rahnEquivalentMillion, 2000);
      assert.equal(rentRes.centralValue?.perSqmMillion, 25);
      assert.equal(rentRes.centralValue?.estimatedMonthlyRentMillion, 60); // 2000 * 0.03
    });
  });

  // =========================================================================
  // 3. Statistical Outlier Detection & Deduplication
  // =========================================================================
  describe('Outlier Detection & Duplicate Exclusion', () => {
    it('identifies and excludes extreme high and low outliers via Tukey IQR + median guard', () => {
      const observations = [
        makeSaleObs('in-1', 196, { observedAtIso: '2026-11-01T10:00:00.000Z' }),
        makeSaleObs('in-2', 198, { observedAtIso: '2026-11-02T10:00:00.000Z' }),
        makeSaleObs('in-3', 200, { observedAtIso: '2026-11-03T10:00:00.000Z' }),
        makeSaleObs('in-4', 202, { observedAtIso: '2026-11-04T10:00:00.000Z' }),
        makeSaleObs('in-5', 204, { observedAtIso: '2026-11-05T10:00:00.000Z' }),
        makeSaleObs('out-low', 45, { observedAtIso: '2026-11-06T10:00:00.000Z' }),
        makeSaleObs('out-high', 850, { observedAtIso: '2026-11-06T11:00:00.000Z' }),
      ];

      const res = computePropertyOrNeighborhoodValuation({
        subject: { cityId: 'tehran', hoodId: 3, marketMode: 'sale', sqm: 100 },
        observations,
        valuationTimestampIso: REF_TIMESTAMP,
      });

      assert.equal(res.outlierReport.outliers.length, 2);
      assert.equal(res.comparableObservationsCount.inliersUsed, 5);
      assert.equal(res.outlierReport.median, 200);
      assert.equal(res.centralValue?.perSqmMillion, 200.06); // Recency-weighted mean across Nov 1 (196) .. Nov 5 (204)
      const directions = res.outlierReport.outliers.map((o) => o.direction).sort();
      assert.deepEqual(directions, ['high_extreme', 'low_extreme']);
    });

    it('excludes duplicate observation IDs and duplicate content fingerprints', () => {
      const obs1 = makeSaleObs('dup-id', 200, { observedAtIso: '2026-11-01T10:00:00.000Z' });
      const obs2 = makeSaleObs('dup-id', 205, { observedAtIso: '2026-11-02T10:00:00.000Z' });
      // Same content on same day with different ID
      const obs3 = makeSaleObs('diff-id-same-content', 200, { observedAtIso: '2026-11-01T18:00:00.000Z' });

      const sanitized = sanitizeAndDeduplicateObservations({
        observations: [obs1, obs2, obs3],
        expectedCityId: 'tehran',
        expectedHoodId: 3,
        expectedMarketMode: 'sale',
        referenceTimestampIso: REF_TIMESTAMP,
      });

      assert.equal(sanitized.validObservations.length, 1);
      assert.equal(sanitized.rejectedDuplicateCount, 2);
    });
  });

  // =========================================================================
  // 4. Missing Data Safeguards (Never Treating Missing as Zero)
  // =========================================================================
  describe('Missing Data Handling & Per-Sqm Guardrails', () => {
    it('never treats missing floor (null) as ground floor (0) or missing age (null) as brand-new (0)', () => {
      const unknownSpecsIndex = computeMissingSafeQualityIndex({
        sqm: null,
        ageYears: null,
        floor: null,
        hasParking: null,
        hasElevator: null,
        hasStorage: null,
        renovationGrade: null,
      });

      const groundFloorIndex = computeMissingSafeQualityIndex({
        sqm: null,
        ageYears: null,
        floor: 0, // Explicit ground floor (-5.5%)
        hasParking: null,
        hasElevator: null,
        hasStorage: null,
        renovationGrade: null,
      });

      const brandNewIndex = computeMissingSafeQualityIndex({
        sqm: null,
        ageYears: 0, // Explicit brand-new (+6.5%)
        floor: null,
        hasParking: null,
        hasElevator: null,
        hasStorage: null,
        renovationGrade: null,
      });

      assert.equal(unknownSpecsIndex, 1.0, 'All-null attributes must yield neutral 1.0000 index');
      assert.ok(groundFloorIndex < 1.0, 'Explicit floor=0 must apply ground-floor discount');
      assert.ok(brandNewIndex > 1.0, 'Explicit ageYears=0 must apply brand-new premium');
    });

    it('omits per-sqm central value when subject area is unknown (null) while still computing per-sqm range from valid comparables', () => {
      const pool = [1, 2, 3, 4, 5].map((i) =>
        makeSaleObs(`s-${i}`, 200, { observedAtIso: `2026-11-0${i}T10:00:00.000Z` })
      );

      const res = computePropertyOrNeighborhoodValuation({
        subject: { cityId: 'tehran', hoodId: 3, marketMode: 'sale', sqm: null },
        observations: pool,
        valuationTimestampIso: REF_TIMESTAMP,
      });

      assert.equal(res.status, 'authoritative_estimate');
      assert.equal(res.centralValue?.perSqmMillion, 200);
      assert.equal(res.centralValue?.totalMillion, null, 'Total price must be null when subject sqm is unknown');
      assert.ok(res.limitations.some((l) => l.includes('متراژ')));
    });
  });

  // =========================================================================
  // 5. Sample-Size Thresholds & Refusal to Emit Unjustified Estimates
  // =========================================================================
  describe('Sample-Size Sufficiency Gates & Confidence Indicators', () => {
    it('refuses to emit any numerical estimate when valid inliers < 3 (insufficient_evidence)', () => {
      const tinyPool = [
        makeSaleObs('s-1', 200, { observedAtIso: '2026-11-01T10:00:00.000Z' }),
        makeSaleObs('s-2', 205, { observedAtIso: '2026-11-02T10:00:00.000Z' }),
      ];

      const res = computePropertyOrNeighborhoodValuation({
        subject: { cityId: 'tehran', hoodId: 3, marketMode: 'sale', sqm: 100 },
        observations: tinyPool,
        valuationTimestampIso: REF_TIMESTAMP,
      });

      assert.equal(res.status, 'insufficient_evidence');
      assert.equal(res.isAuthoritativeEstimateAllowed, false);
      assert.equal(res.centralValue, null);
      assert.equal(res.estimatedRange, null);
      assert.equal(res.confidence.level, 'insufficient_evidence');
    });

    it('emits provisional_range_only (centralValue: null) when 3..4 unverified asking samples exist', () => {
      const smallAskingPool = [1, 2, 3].map((i) =>
        makeSaleObs(`ask-${i}`, 195 + i * 5, {
          sourceCategory: 'public_asking_price',
          observedAtIso: `2026-11-0${i}T10:00:00.000Z`,
        })
      );

      const res = computePropertyOrNeighborhoodValuation({
        subject: { cityId: 'tehran', hoodId: 3, marketMode: 'sale', sqm: 100 },
        observations: smallAskingPool,
        valuationTimestampIso: REF_TIMESTAMP,
      });

      assert.equal(res.status, 'provisional_range_only');
      assert.equal(res.isAuthoritativeEstimateAllowed, false);
      assert.equal(res.centralValue, null, 'Must not emit centralValue on provisional_range_only');
      assert.ok(res.estimatedRange !== null, 'Must provide estimatedRange when 3..4 samples exist');
    });
  });

  // =========================================================================
  // 6. Temporal Consistency, Historical Trends & Zero Synthetic Gap-Filling
  // =========================================================================
  describe('Temporal Consistency & Historical Market Trends', () => {
    it('rejects future observations and stale observations older than maxObservationAgeDays', () => {
      const futureObs = makeSaleObs('future-1', 200, { observedAtIso: '2026-12-01T00:00:00.000Z' });
      const staleObs = makeSaleObs('stale-1', 200, { observedAtIso: '2025-01-01T00:00:00.000Z' });

      const sanitized = sanitizeAndDeduplicateObservations({
        observations: [futureObs, staleObs],
        expectedCityId: 'tehran',
        expectedHoodId: 3,
        expectedMarketMode: 'sale',
        referenceTimestampIso: REF_TIMESTAMP,
      });

      assert.equal(sanitized.validObservations.length, 0);
      assert.equal(sanitized.rejections.length, 2);
      assert.deepEqual(
        sanitized.rejections.map((r) => r.reason).sort(),
        ['INVALID_OR_FUTURE_TIMESTAMP', 'STALE_OBSERVATION_EXCEEDED_MAX_AGE']
      );
    });

    it('distinguishes observed period indicators from inferred trends and never fills missing periods with synthetic data', () => {
      const periods = [
        {
          periodKey: '2026-09',
          periodStartIso: '2026-09-01T00:00:00.000Z',
          periodEndIso: '2026-09-30T23:59:59.000Z',
        },
        {
          periodKey: '2026-10', // Empty period (0 samples) -> must NOT be synthetically filled
          periodStartIso: '2026-10-01T00:00:00.000Z',
          periodEndIso: '2026-10-31T23:59:59.000Z',
        },
        {
          periodKey: '2026-11',
          periodStartIso: '2026-11-01T00:00:00.000Z',
          periodEndIso: '2026-11-30T23:59:59.000Z',
        },
      ];

      const observations = [
        makeSaleObs('sep-1', 180, { observedAtIso: '2026-09-10T10:00:00.000Z' }),
        makeSaleObs('sep-2', 182, { observedAtIso: '2026-09-12T10:00:00.000Z' }),
        makeSaleObs('sep-3', 184, { observedAtIso: '2026-09-15T10:00:00.000Z' }),
        makeSaleObs('nov-1', 198, { observedAtIso: '2026-11-02T10:00:00.000Z' }),
        makeSaleObs('nov-2', 200, { observedAtIso: '2026-11-04T10:00:00.000Z' }),
        makeSaleObs('nov-3', 202, { observedAtIso: '2026-11-06T10:00:00.000Z' }),
      ];

      const trend = computeHistoricalMarketTrends({
        cityId: 'tehran',
        hoodId: 3,
        marketMode: 'sale',
        periods,
        observations,
        computedAtIso: REF_TIMESTAMP,
      });

      assert.equal(trend.points.length, 3);
      assert.equal(trend.points[0].indicatorType, 'observed_indicator');
      assert.equal(trend.points[0].centralPerSqmMillion, 182);

      // Middle period has 0 observations: must be marked insufficient_period_sample with null values
      assert.equal(trend.points[1].indicatorType, 'insufficient_period_sample');
      assert.equal(trend.points[1].centralPerSqmMillion, null);

      assert.equal(trend.points[2].indicatorType, 'observed_indicator');
      assert.equal(trend.points[2].centralPerSqmMillion, 200);

      assert.equal(trend.inferredOverallDirection.classification, 'inferred_trend');
      assert.equal(trend.inferredOverallDirection.direction, 'upward');
      assert.equal(trend.inferredOverallDirection.observedPeriodsWithData, 2);
      assert.ok(trend.inferredOverallDirection.predictiveClaimDisclaimer.includes('Backtest'));
    });
  });

  // =========================================================================
  // 7. Reproducibility, Upstream Contract Adapters & Service Orchestration
  // =========================================================================
  describe('Reproducibility, Upstream Contracts & Neighborhood Comparison', () => {
    it('produces identical reproducibilityHash and numerical outputs regardless of input observation order', () => {
      const obsList = [
        makeSaleObs('obs-a', 192, { observedAtIso: '2026-11-01T10:00:00.000Z' }),
        makeSaleObs('obs-b', 198, { observedAtIso: '2026-11-02T10:00:00.000Z' }),
        makeSaleObs('obs-c', 200, { observedAtIso: '2026-11-03T10:00:00.000Z' }),
        makeSaleObs('obs-d', 204, { observedAtIso: '2026-11-04T10:00:00.000Z' }),
        makeSaleObs('obs-e', 206, { observedAtIso: '2026-11-05T10:00:00.000Z' }),
      ];

      const subject = { cityId: 'tehran' as const, hoodId: 3, marketMode: 'sale' as const, sqm: 95 };

      const run1 = computePropertyOrNeighborhoodValuation({
        subject,
        observations: obsList,
        valuationTimestampIso: REF_TIMESTAMP,
      });

      const run2 = computePropertyOrNeighborhoodValuation({
        subject,
        observations: [...obsList].reverse(),
        valuationTimestampIso: REF_TIMESTAMP,
      });

      assert.equal(run1.reproducibilityHash, run2.reproducibilityHash);
      assert.equal(run1.resultId, run2.resultId);
      assert.deepEqual(run1.centralValue, run2.centralValue);
      assert.deepEqual(run1.estimatedRange, run2.estimatedRange);
      assert.equal(run1.modelVersion, CANONICAL_ANALYTICS_MODEL_VERSION);
    });

    it('integrates Bargains, Crowd Claims, and Geography contracts via MarketAnalyticsService and compares neighborhoods', async () => {
      const repo = new InMemoryMarketAnalyticsRepository();
      const service = new MarketAnalyticsService(repo, DEFAULT_VALUATION_MODEL_SPEC);

      const bargainsHood3: ApprovedBargainListingContract[] = [1, 2, 3].map((i) => ({
        id: `bg-3-${i}`,
        cityId: 'tehran',
        hoodId: 3, // Saadat Abad
        dealMode: 'sale',
        status: 'approved',
        sqm: 100,
        askingTotalMillion: (200 + i * 2) * 100,
        observedAtIso: `2026-11-0${i}T10:00:00.000Z`,
      }));

      const crowdDealsHood3: CrowdMarketObservationContract[] = [1, 2].map((i) => ({
        claimId: `cr-3-${i}`,
        cityId: 'tehran',
        hoodId: 3,
        marketMode: 'sale',
        claimType: 'completed_deal_report',
        verificationState: 'verified_by_document',
        sqm: 100,
        reportedTotalMillion: (195 + i * 2) * 100,
        observedAtIso: `2026-11-0${i + 3}T10:00:00.000Z`,
      }));

      const saleHood5 = [1, 2, 3, 4, 5].map((i) =>
        makeSaleObs(`p-5-${i}`, 150 + i, {
          hoodId: 5, // Punak
          observedAtIso: `2026-11-0${i}T10:00:00.000Z`,
        })
      );

      const comparison = await service.compareNeighborhoods({
        neighborhoodA: {
          cityId: 'tehran',
          hoodId: 3,
          evidence: { approvedBargains: bargainsHood3, crowdObservations: crowdDealsHood3 },
          supplyDemandInput: {
            periodStartIso: '2026-10-01T00:00:00.000Z',
            periodEndIso: REF_TIMESTAMP,
            activeSaleListingsCount: 40,
            activeRentalListingsCount: 25,
            newListingsInPeriodCount: 15,
            verifiedDealsInPeriodCount: 12,
            activeBuyerAlertsCount: 85,
          },
        },
        neighborhoodB: {
          cityId: 'tehran',
          hoodId: 5,
          evidence: { directObservations: saleHood5 },
        },
        computedAtIso: REF_TIMESTAMP,
      });

      assert.equal(comparison.comparisonMetrics.saleComparisonAvailable, true);
      assert.ok(comparison.comparisonMetrics.salePerSqmDiffMillion! > 30);
      assert.equal(comparison.neighborhoodA.supplyDemand.status, 'sufficient_data');
      assert.equal(comparison.neighborhoodA.supplyDemand.liquidityRegime, 'high_demand');
      assert.equal(comparison.neighborhoodB.supplyDemand.status, 'insufficient_supply_demand_evidence');

      // Verify repository persisted projections
      const storedHood3 = await repo.listValuationsForNeighborhood('tehran', 3, 'sale');
      assert.equal(storedHood3.length, 1);
    });

    it('refuses predictive accuracy claims without measured historical validation and computes MAPE/coverage when >= 5 holdout deals exist', async () => {
      const { evaluateHistoricalValidationBacktest } = await import(
        '../server/modules/market-analytics'
      );

      const unvalidated = evaluateHistoricalValidationBacktest([]);
      assert.equal(unvalidated.isValidated, false);
      assert.equal(unvalidated.predictiveAccuracyClaimAllowed, false);
      assert.equal(unvalidated.meanAbsolutePercentageError, null);

      const validated = evaluateHistoricalValidationBacktest([
        { predictedCentralMillion: 200, predictedMinMillion: 190, predictedMaxMillion: 210, actualVerifiedTransactionMillion: 198, isVerifiedTransaction: true },
        { predictedCentralMillion: 200, predictedMinMillion: 190, predictedMaxMillion: 210, actualVerifiedTransactionMillion: 202, isVerifiedTransaction: true },
        { predictedCentralMillion: 200, predictedMinMillion: 190, predictedMaxMillion: 210, actualVerifiedTransactionMillion: 205, isVerifiedTransaction: true },
        { predictedCentralMillion: 200, predictedMinMillion: 190, predictedMaxMillion: 210, actualVerifiedTransactionMillion: 195, isVerifiedTransaction: true },
        { predictedCentralMillion: 200, predictedMinMillion: 190, predictedMaxMillion: 210, actualVerifiedTransactionMillion: 200, isVerifiedTransaction: true },
      ]);
      assert.equal(validated.isValidated, true);
      assert.equal(validated.predictiveAccuracyClaimAllowed, true);
      assert.equal(validated.evaluatedHoldoutDealsCount, 5);
      assert.equal(validated.rangeCoverageRate, 1);
      assert.ok(validated.meanAbsolutePercentageError !== null && validated.meanAbsolutePercentageError < 3);
    });
  });
});

