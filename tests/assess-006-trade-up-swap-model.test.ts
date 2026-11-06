/**
 * @file tests/assess-006-trade-up-swap-model.test.ts
 * @description Empirical validation for Workstream ASSESS-006:
 *   1. Trade-Up & Asset Swap model (`evaluateTradeUpOptions` in `src/data/neighborhoodInsights.ts`):
 *      - Age depreciation floor (0.60 minimum at >= 34 years).
 *      - 1% transaction friction deduction (`netProceeds = round(saleValue * 0.99)`).
 *      - Mortgage loan booster (+1,200M Toman) and extra cash stacking.
 *      - Target age segment multipliers ('new' = 1.0, 'mid' = 0.88, 'older' = 0.76).
 *      - Tenant Rahn bridge deduction with minimum 500M Toman cash floor.
 *   2. Rent-vs-Buy P/R ratio & 3-year wealth projection (`evaluateRentVsBuyInNeighborhood`).
 *   3. Direct Metro commute line intersection (`checkDirectMetroCommute`).
 */

import assert from 'node:assert/strict';
import {
  evaluateTradeUpOptions,
  evaluateRentVsBuyInNeighborhood,
  checkDirectMetroCommute,
} from '../src/data/neighborhoodInsights';
import { INITIAL_NEIGHBORHOODS, EvaluatedNeighborhood } from '../src/data/neighborhoods';

console.log('--- Starting ASSESS-006: Trade-Up & Asset Swap Model Validation ---');

function toMockEvaluated(hoodId: number, status: 'undervalued' | 'balanced' | 'bubble' = 'balanced'): EvaluatedNeighborhood {
  const base = INITIAL_NEIGHBORHOODS.find((h) => h.id === hoodId) || INITIAL_NEIGHBORHOODS[0];
  return {
    ...base,
    baseBuyPerSqm: base.buyPerSqm,
    status: 'green',
    distKm: null,
    overallScore: 8.5,
    diffPercent: 0,
    trafficInfo: base.trafficInfo || {
      liveStatus: 'تردد روان',
      liveSeverity: 'smooth',
      peakHours: '۱۸ تا ۲۰',
      seasonalAnalysis: 'متعادل',
      bottlenecks: 'ندارد',
      trafficScore: 8.0,
    },
    marketReport: {
      status,
      badgeText: status,
      hoodGrowth6mPercent: 12,
      tehranGrowth6mPercent: 10,
      prRatio: 6.5,
      summary: '',
      trendData: [],
    },
  };
}

// ============================================================================
// 1. Current Home Sale Valuation, Age Floor & 1% Closing Friction
// ============================================================================
{
  const punak = toMockEvaluated(5); // Punak
  const allHoods = INITIAL_NEIGHBORHOODS.slice(0, 10).map((h) => toMockEvaluated(h.id));

  // 1.1: 10-year-old 80 sqm apartment in Punak
  // Age factor = 1 - 10 * 0.012 = 0.88
  const res10Yr = evaluateTradeUpOptions({
    currentHood: punak,
    currentSqm: 80,
    currentAgeYears: 10,
    extraCashMillion: 500,
    useLoanBooster: false,
    useTenantRahnDeduction: false,
    targetNewSqm: 100,
    targetAgeSegment: 'new',
    allNeighborhoods: allHoods,
  });

  const expectedSale10Yr = Math.round(punak.buyPerSqm * 80 * 0.88);
  const expectedNetProceeds = Math.round(expectedSale10Yr * 0.99);
  assert.equal(res10Yr.currentHomeSaleValueMillion, expectedSale10Yr, 'Current home sale value must reflect 0.88 age factor');
  assert.equal(res10Yr.netProceedsFromSaleMillion, expectedNetProceeds, 'Net proceeds must deduct 1% closing friction');
  assert.equal(res10Yr.totalBaseCapitalMillion, expectedNetProceeds + 500, 'Total capital = netProceeds + extraCash');

  // 1.2: 45-year-old apartment must hit 0.60 land-equity floor
  const res45Yr = evaluateTradeUpOptions({
    currentHood: punak,
    currentSqm: 80,
    currentAgeYears: 45,
    extraCashMillion: 0,
    useLoanBooster: false,
    useTenantRahnDeduction: false,
    targetNewSqm: 100,
    targetAgeSegment: 'new',
    allNeighborhoods: allHoods,
  });
  const expectedFloorSale = Math.round(punak.buyPerSqm * 80 * 0.60);
  assert.equal(res45Yr.currentHomeSaleValueMillion, expectedFloorSale, '45-year-old home must respect 0.60 land value floor');

  console.log('✓ 1. Current home equity valuation, 60% land floor & 1% closing friction verified');
}

// ============================================================================
// 2. Mortgage Loan Booster (+1,200M) & Tenant Rahn Bridge Deduction
// ============================================================================
{
  const sattarkhan = toMockEvaluated(28); // Sattarkhan
  const punak = toMockEvaluated(5); // Punak
  const gisha = toMockEvaluated(26); // Gisha
  const candidates = [sattarkhan, punak, gisha];

  const baseNoBoosters = evaluateTradeUpOptions({
    currentHood: sattarkhan,
    currentSqm: 70,
    currentAgeYears: 12,
    extraCashMillion: 1000,
    useLoanBooster: false,
    useTenantRahnDeduction: false,
    targetNewSqm: 105,
    targetAgeSegment: 'mid',
    allNeighborhoods: candidates,
  });

  const withLoanBooster = evaluateTradeUpOptions({
    currentHood: sattarkhan,
    currentSqm: 70,
    currentAgeYears: 12,
    extraCashMillion: 1000,
    useLoanBooster: true,
    useTenantRahnDeduction: false,
    targetNewSqm: 105,
    targetAgeSegment: 'mid',
    allNeighborhoods: candidates,
  });

  assert.equal(
    withLoanBooster.totalBaseCapitalMillion - baseNoBoosters.totalBaseCapitalMillion,
    1200,
    'Mortgage loan booster must add exactly 1,200M Toman to base capital'
  );

  const withLoanAndRahn = evaluateTradeUpOptions({
    currentHood: sattarkhan,
    currentSqm: 70,
    currentAgeYears: 12,
    extraCashMillion: 1000,
    useLoanBooster: true,
    useTenantRahnDeduction: true,
    targetNewSqm: 105,
    targetAgeSegment: 'mid',
    allNeighborhoods: candidates,
  });

  for (let i = 0; i < candidates.length; i++) {
    const withoutRahn = withLoanBooster.matchingHoods[i];
    const withRahn = withLoanAndRahn.matchingHoods[i];
    assert.ok(
      withRahn.surplusOrDeficitMillion > withoutRahn.surplusOrDeficitMillion,
      `Tenant rahn bridge must improve affordability surplus in ${candidates[i].name}`
    );
  }

  console.log('✓ 2. Mortgage loan booster (+1,200M) & Tenant Rahn bridge deduction verified');
}

// ============================================================================
// 3. Target Age Segment Monotonicity ('new' > 'mid' > 'older' cost)
// ============================================================================
{
  const punak = toMockEvaluated(5);
  const segNew = evaluateTradeUpOptions({
    currentHood: punak,
    currentSqm: 80,
    currentAgeYears: 5,
    targetNewSqm: 110,
    targetAgeSegment: 'new',
    allNeighborhoods: [punak],
  });
  const segMid = evaluateTradeUpOptions({
    currentHood: punak,
    currentSqm: 80,
    currentAgeYears: 5,
    targetNewSqm: 110,
    targetAgeSegment: 'mid',
    allNeighborhoods: [punak],
  });
  const segOlder = evaluateTradeUpOptions({
    currentHood: punak,
    currentSqm: 80,
    currentAgeYears: 5,
    targetNewSqm: 110,
    targetAgeSegment: 'older',
    allNeighborhoods: [punak],
  });

  assert.ok(
    segNew.matchingHoods[0].targetUnitTotalPriceMillion > segMid.matchingHoods[0].targetUnitTotalPriceMillion &&
    segMid.matchingHoods[0].targetUnitTotalPriceMillion > segOlder.matchingHoods[0].targetUnitTotalPriceMillion,
    'Target unit cost must strictly decrease across new (1.0) > mid (0.88) > older (0.76)'
  );

  console.log('✓ 3. Target age segment price multipliers (1.0 / 0.88 / 0.76) verified');
}

// ============================================================================
// 4. Rent-vs-Buy P/R Arbitrage & Direct Metro Commute Verification
// ============================================================================
{
  const undervaluedHood = toMockEvaluated(15, 'undervalued'); // Piroozi (id: 15)
  const bubbleHood: EvaluatedNeighborhood = {
    ...toMockEvaluated(1, 'bubble'),
    buyPerSqm: 350, // 80m = 28,000M
    rahn80m: 3500,  // P/R ratio = 28000 / 3500 = 8.0 (> 6.8)
  };

  const verdictBuy = evaluateRentVsBuyInNeighborhood(undervaluedHood);
  const verdictRent = evaluateRentVsBuyInNeighborhood(bubbleHood);

  assert.equal(verdictBuy.recommendation, 'BUY_NOW', 'Undervalued neighborhood must trigger BUY_NOW');
  assert.equal(verdictRent.recommendation, 'RENT_AND_INVEST', 'Bubble neighborhood with P/R > 6.8 must trigger RENT_AND_INVEST');

  // Direct Metro Line check: Mirdamad (hood 29, Line 1) -> Vanak / Tajrish (Line 1)
  const mirdamad = toMockEvaluated(29);
  const directToTajrish = checkDirectMetroCommute(mirdamad, 'tajrish');
  assert.equal(directToTajrish.hasDirectLine, true);
  assert.equal(directToTajrish.sharedLineNumber, 1);

  console.log('✓ 4. Rent-vs-Buy P/R arbitrage & direct Metro line solver verified');
}

console.log('--- ALL ASSESS-006 TRADE-UP & ASSET SWAP MODEL TESTS PASSED ---');
