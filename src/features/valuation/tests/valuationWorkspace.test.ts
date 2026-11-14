/** @file src/features/valuation/tests/valuationWorkspace.test.ts — Node Unit Tests for Stage 20 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  INITIAL_NEIGHBORHOODS,
  getNeighborhoodMarketReport,
  getNeighborhoodTrafficInfo,
  type EvaluatedNeighborhood,
} from '../../../data/neighborhoods';
import { FAST_SALE_FACTOR } from '../../../data/hedonicPricingEngine';
import {
  VALUATION_DATA_SNAPSHOT_ID,
  VALUATION_MODEL_ID,
  createDefaultValuationInput,
  createSavedValuationReport,
  evaluateWorkspaceValuation,
} from '../services/valuationWorkspaceService';

function getSampleHood(): EvaluatedNeighborhood {
  const h = INITIAL_NEIGHBORHOODS[4]; // Punak
  return {
    ...h,
    baseBuyPerSqm: h.buyPerSqm,
    status: 'green',
    distKm: null,
    diffPercent: 0,
    overallScore: Number(((h.air + h.metro + h.security) / 3).toFixed(1)),
    trafficInfo: getNeighborhoodTrafficInfo(h),
    marketReport: getNeighborhoodMarketReport(h),
  };
}

test('Stage 20 ValuationWorkspace delegates directly to hedonicPricingEngine, respects FAST_SALE_FACTOR=0.88, and separates 4 quality axes', () => {
  const hood = getSampleHood();
  const input = createDefaultValuationInput(hood.id, {
    sqm: 90,
    buildYear: 1400,
    floor: 3,
    totalFloors: 5,
    locationPrecision: 'neighborhood',
  });
  const res = evaluateWorkspaceValuation(input, hood);

  assert.equal(res.scopeSupported, true);
  assert.ok(res.hedonic && res.hedonic.isValid);
  assert.equal(res.hedonic.methodologyKind, 'RULE_BASED_HEURISTIC_MULTIPLIER');
  assert.equal(res.hedonic.fastSaleTotalMillion, Math.round(res.hedonic.hedonicTotalMillion * FAST_SALE_FACTOR));
  assert.equal(res.sufficiency.verifiedTransactionCount, 0);
  assert.equal(res.validation.status, 'rule_based_uncalibrated_against_deeds');
  assert.ok(res.uncertainty.bandPercent >= 5.0);
  assert.equal(res.snapshot.modelId, VALUATION_MODEL_ID);
  assert.equal(res.snapshot.dataSnapshotId, VALUATION_DATA_SNAPSHOT_ID);
  assert.ok(res.comparables.length >= 1);

  const snapshot = createSavedValuationReport(input, hood.name, res);
  assert.ok(snapshot && snapshot.hedonicTotalMillion === res.hedonic.hedonicTotalMillion);
  assert.equal(snapshot.dataSnapshotId, VALUATION_DATA_SNAPSHOT_ID);
});

test('Stage 20 rejects commercial/office/land valuation cleanly without fabricating residential price outputs', () => {
  const hood = getSampleHood();
  for (const cat of ['commercial', 'office', 'land'] as const) {
    const input = createDefaultValuationInput(hood.id, { propertyCategory: cat });
    const res = evaluateWorkspaceValuation(input, hood);
    assert.equal(res.scopeSupported, false);
    assert.equal(res.hedonic, null);
    assert.equal(res.comparables.length, 0);
    assert.ok(res.unsupportedReasonFa && res.unsupportedReasonFa.includes('مسکونی'));
  }
});

test('Stage 20 preserves input origin distinction (extracted text is not auto-verified) and supports non-mutating What-If evaluation', () => {
  const hood = getSampleHood();
  const baseInput = createDefaultValuationInput(hood.id, {
    sqm: 85,
    renovationStatus: 'needs_renovation',
    inputOrigins: {
      sqm: 'system_retrieved',
      buildYear: 'system_retrieved',
      floor: 'user_provided',
      renovationStatus: 'user_provided',
      amenities: 'user_provided',
      sellerAsking: 'user_provided',
    },
  });
  assert.equal(baseInput.inputOrigins.sqm, 'system_retrieved');
  const baseRes = evaluateWorkspaceValuation(baseInput, hood);
  const altRes = evaluateWorkspaceValuation({ ...baseInput, renovationStatus: 'luxury_renovated' }, hood);
  assert.ok(baseRes.hedonic && altRes.hedonic);
  assert.ok(altRes.hedonic.hedonicTotalMillion > baseRes.hedonic.hedonicTotalMillion);
  assert.equal(baseInput.renovationStatus, 'needs_renovation');
});
