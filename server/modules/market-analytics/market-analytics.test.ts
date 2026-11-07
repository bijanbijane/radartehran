/**
 * @file server/modules/market-analytics/market-analytics.test.ts
 * @description Self-contained Domain Test Suite for Employee 10 — Property Valuation and Market Analytics Backend.
 */

import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  CANONICAL_ANALYTICS_MODEL_VERSION,
  computeHistoricalMarketTrends,
  computeMissingSafeQualityIndex,
  computePropertyOrNeighborhoodValuation,
  DEFAULT_VALUATION_MODEL_SPEC,
  evaluateHistoricalValidationBacktest,
  InMemoryMarketAnalyticsRepository,
  MarketAnalyticsService,
  sanitizeAndDeduplicateObservations,
  type ApprovedBargainListingContract,
  type CrowdMarketObservationContract,
  type MarketObservationRecord,
} from './index';

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
    hoodId: 3,
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

describe('Employee 10 — Self-Contained Domain Verification Suite', () => {
  it('distinguishes verified transactions from public asking prices with explicit haircuts', () => {
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
    const askVal = computePropertyOrNeighborhoodValuation({
      subject,
      observations: askingPool,
      valuationTimestampIso: REF_TIMESTAMP,
    });
    const txVal = computePropertyOrNeighborhoodValuation({
      subject,
      observations: txPool,
      valuationTimestampIso: REF_TIMESTAMP,
    });

    assert.equal(txVal.centralValue?.perSqmMillion, 200);
    assert.equal(askVal.centralValue?.perSqmMillion, 184);
    assert.equal(askVal.dataSources[0].appliedAskingToTransactionFactor, 0.92);
  });

  it('strictly separates sale and rental calculations and computes Rahn-equivalent accurately', () => {
    const rentalPool = [1, 2, 3, 4, 5].map((i) =>
      makeRentalObs(`r-${i}`, 1000, 30, { observedAtIso: `2026-11-0${i}T10:00:00.000Z` })
    );
    const rentRes = computePropertyOrNeighborhoodValuation({
      subject: { cityId: 'tehran', hoodId: 3, marketMode: 'rental', sqm: 80 },
      observations: rentalPool,
      valuationTimestampIso: REF_TIMESTAMP,
    });

    assert.equal(rentRes.status, 'authoritative_estimate');
    assert.equal(rentRes.centralValue?.rahnEquivalentMillion, 2000);
    assert.equal(rentRes.centralValue?.perSqmMillion, 25);
  });

  it('filters extreme statistical outliers and duplicate observations', () => {
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
  });

  it('never treats missing data (null) as zero and enforces sample-size thresholds', () => {
    assert.equal(
      computeMissingSafeQualityIndex({
        sqm: null,
        ageYears: null,
        floor: null,
        hasParking: null,
        hasElevator: null,
        hasStorage: null,
        renovationGrade: null,
      }),
      1.0
    );

    const insufficient = computePropertyOrNeighborhoodValuation({
      subject: { cityId: 'tehran', hoodId: 3, marketMode: 'sale', sqm: 100 },
      observations: [makeSaleObs('s-1', 200), makeSaleObs('s-2', 205)],
      valuationTimestampIso: REF_TIMESTAMP,
    });
    assert.equal(insufficient.status, 'insufficient_evidence');
    assert.equal(insufficient.centralValue, null);
  });

  it('distinguishes observed indicators from inferred trends, validates backtests, and guarantees reproducibility', async () => {
    const periods = [
      { periodKey: '2026-09', periodStartIso: '2026-09-01T00:00:00.000Z', periodEndIso: '2026-09-30T23:59:59.000Z' },
      { periodKey: '2026-10', periodStartIso: '2026-10-01T00:00:00.000Z', periodEndIso: '2026-10-31T23:59:59.000Z' },
      { periodKey: '2026-11', periodStartIso: '2026-11-01T00:00:00.000Z', periodEndIso: '2026-11-30T23:59:59.000Z' },
    ];
    const obs = [
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
      observations: obs,
      computedAtIso: REF_TIMESTAMP,
    });
    assert.equal(trend.points[1].indicatorType, 'insufficient_period_sample');
    assert.equal(trend.inferredOverallDirection.classification, 'inferred_trend');

    const unval = evaluateHistoricalValidationBacktest([]);
    assert.equal(unval.predictiveAccuracyClaimAllowed, false);

    const repo = new InMemoryMarketAnalyticsRepository();
    const service = new MarketAnalyticsService(repo, DEFAULT_VALUATION_MODEL_SPEC);
    const bargains: ApprovedBargainListingContract[] = [1, 2, 3].map((i) => ({
      id: `bg-${i}`,
      cityId: 'tehran',
      hoodId: 3,
      dealMode: 'sale',
      status: 'approved',
      sqm: 100,
      askingTotalMillion: 20000,
      observedAtIso: `2026-11-0${i}T10:00:00.000Z`,
    }));
    const crowds: CrowdMarketObservationContract[] = [1, 2].map((i) => ({
      claimId: `cr-${i}`,
      cityId: 'tehran',
      hoodId: 3,
      marketMode: 'sale',
      claimType: 'completed_deal_report',
      verificationState: 'verified_by_document',
      sqm: 100,
      reportedTotalMillion: 19800,
      observedAtIso: `2026-11-0${i + 3}T10:00:00.000Z`,
    }));

    const v1 = await service.evaluatePropertyOrNeighborhood({
      subject: { cityId: 'tehran', hoodId: 3, marketMode: 'sale', sqm: 100 },
      evidence: { approvedBargains: bargains, crowdObservations: crowds },
      valuationTimestampIso: REF_TIMESTAMP,
    });
    assert.equal(v1.modelVersion, CANONICAL_ANALYTICS_MODEL_VERSION);
  });
});
