/**
 * @file tests/casper-decision-intelligence.test.ts
 * @description Unit tests for CASPER Socio-Technical Real Estate Decision Intelligence,
 * 12-Category Epistemic Truth Ledger, Cognitive Bias Shield, and Counterfactual MCDA Engine.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { FAST_SALE_FACTOR } from '../src/data/hedonicPricingEngine';
import { INITIAL_NEIGHBORHOODS } from '../src/data/neighborhoods';
import {
  aggregateNeighborhoodMarketMetrics,
  buildNeighborhoodListingSamples,
} from '../src/data/realMarketPriceAggregator';
import {
  evaluateCasperDecisionIntelligence,
  type CasperEpistemicCategoryCode,
} from '../src/utils/casper/casperDecisionEngine';

const ALL_12_EPISTEMIC_CATEGORIES: readonly CasperEpistemicCategoryCode[] = [
  'OBSERVED_DATA',
  'VERIFIED_DATA',
  'ESTIMATED_DATA',
  'ADVERTISER_CLAIM',
  'USER_PROVIDED',
  'THIRD_PARTY_DATA',
  'INFERRED_DATA',
  'PREDICTED_DATA',
  'MISSING_DATA',
  'CONFLICTING_DATA',
  'OUTDATED_DATA',
  'UNKNOWN_DATA',
];

describe('CASPER Socio-Technical Decision Intelligence & Epistemic Truth Engine', () => {
  it('classifies neighborhood intelligence across all 12 CASPER Section 33 epistemic categories and scales confidence dynamically', () => {
    const hood = INITIAL_NEIGHBORHOODS[0];
    const zeroSampleReport = evaluateCasperDecisionIntelligence(hood, {
      targetAreaSqm: 90,
      achievedDiscountPct: 8,
      holdingHorizonYears: 3,
      priorityProfile: 'balanced',
      intlCurrency: 'USD',
      observedSampleCount: 0,
      isBootstrapped: true,
    });
    const richSampleReport = evaluateCasperDecisionIntelligence(hood, {
      targetAreaSqm: 90,
      achievedDiscountPct: 8,
      holdingHorizonYears: 3,
      priorityProfile: 'balanced',
      intlCurrency: 'USD',
      observedSampleCount: 10,
      isBootstrapped: false,
    });

    assert.equal(zeroSampleReport.epistemicLedger.length, 12);
    assert.deepEqual(
      zeroSampleReport.epistemicLedger.map((entry) => entry.code),
      ALL_12_EPISTEMIC_CATEGORIES,
    );

    const zeroObsEntry = zeroSampleReport.epistemicLedger.find((e) => e.code === 'OBSERVED_DATA')!;
    const richObsEntry = richSampleReport.epistemicLedger.find((e) => e.code === 'OBSERVED_DATA')!;
    assert.ok(
      zeroObsEntry.confidencePct < richObsEntry.confidencePct,
      'Zero observed samples must never claim the same epistemic confidence as 10 verified samples',
    );
    assert.equal(zeroObsEntry.confidencePct, 45);
    assert.equal(richObsEntry.confidencePct, 94);
  });

  it('enforces 100% parity with canonical v6.4 Market Aggregator deal price and Hedonic FAST_SALE_FACTOR (0.88)', () => {
    const hood = INITIAL_NEIGHBORHOODS[4] ?? INITIAL_NEIGHBORHOODS[0];
    const agg = aggregateNeighborhoodMarketMetrics(
      hood.id,
      hood.name,
      hood.buyPerSqm,
      buildNeighborhoodListingSamples(hood),
    );
    const report = evaluateCasperDecisionIntelligence(hood, {
      targetAreaSqm: 100,
      achievedDiscountPct: 10,
      holdingHorizonYears: 4,
      priorityProfile: 'capital_preservation',
      intlCurrency: 'EUR',
      canonicalDealPerSqmMillion: agg.estimatedDealPricePerSqm,
      fastSaleFactor: FAST_SALE_FACTOR,
    });

    assert.equal(report.dealBaselinePerSqmMillion, agg.estimatedDealPricePerSqm);
    assert.equal(report.fastSaleFactorUsed, 0.88);
    assert.equal(report.askingTotalMillion, Math.round(hood.buyPerSqm * 100));
    assert.equal(report.scenarioTargetTotalMillion, Math.round(hood.buyPerSqm * 0.9 * 100));
    assert.ok(report.askingTotalIntl.includes('€'));

    const emergencyScenario = report.counterfactuals.find((c) => c.id === 'emergency_fast_exit')!;
    assert.equal(
      emergencyScenario.resultingTotalMillionToman,
      Math.round(report.scenarioTargetTotalMillion * FAST_SALE_FACTOR),
    );
  });

  it('accounts for 4.2% round-trip transaction friction and 1.2% annual physical depreciation across holding horizons', () => {
    const hood = INITIAL_NEIGHBORHOODS[1] ?? INITIAL_NEIGHBORHOODS[0];
    const oneYearReport = evaluateCasperDecisionIntelligence(hood, {
      targetAreaSqm: 85,
      achievedDiscountPct: 5,
      holdingHorizonYears: 1,
      priorityProfile: 'liquidity_first',
      areaUnit: 'sqft',
    });
    const sevenYearReport = evaluateCasperDecisionIntelligence(hood, {
      targetAreaSqm: 85,
      achievedDiscountPct: 5,
      holdingHorizonYears: 7,
      priorityProfile: 'liquidity_first',
      areaUnit: 'sqm',
    });

    const horizon1Yr = oneYearReport.counterfactuals.find((c) => c.id === 'horizon_compounding')!;
    const horizon7Yr = sevenYearReport.counterfactuals.find((c) => c.id === 'horizon_compounding')!;
    assert.ok(
      horizon1Yr.deltaMillionToman < 0,
      '1-year holding horizon must truthfully reflect negative net delta when 4.2% transaction friction exceeds 1-year net carry',
    );
    assert.ok(
      horizon7Yr.deltaMillionToman > horizon1Yr.deltaMillionToman,
      '7-year holding horizon must compound net rental carry above 1-year horizon',
    );
    assert.ok(
      oneYearReport.decisionSummaryFa.includes('فوت مربع'),
      'Decision summary must respect sqft AreaUnit selection',
    );
  });
});
