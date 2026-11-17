/** @file src/features/valuation/tests/valuationWorkspace.test.ts — Node Unit Tests for Stages 89–96 Valuation Workspace */
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
  DEFAULT_INPUT_ORIGINS,
  VALUATION_MODEL_ID,
  createDefaultValuationInput,
  createSavedValuationReport,
  evaluateWorkspaceValuation,
  extractValuationSpecsFromAdText,
  validateAndMigrateSavedValuationReports,
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

test('Stage 89 marks defaults as default_assumption and extracts only mentioned ad fields as system_retrieved', () => {
  assert.equal(DEFAULT_INPUT_ORIGINS.sqm, 'default_assumption');
  assert.equal(DEFAULT_INPUT_ORIGINS.floor, 'default_assumption');
  const def = createDefaultValuationInput(1, {}, 'tehran');
  assert.equal(def.inputOrigins.sqm, 'default_assumption');
  assert.equal(def.inputOrigins.buildYear, 'default_assumption');

  const { patch } = extractValuationSpecsFromAdText('۱۱۰ متر طبقه ۲ از ۵ با پارکینگ', def);
  assert.equal(patch.sqm, 110);
  assert.equal(patch.floor, 2);
  assert.equal(patch.totalFloors, 5);
  assert.equal(patch.hasParking, true);
  assert.equal(patch.inputOrigins?.sqm, 'system_retrieved');
  assert.equal(patch.inputOrigins?.floor, 'system_retrieved');
  assert.equal(patch.inputOrigins?.amenities, 'system_retrieved');
  assert.equal(patch.inputOrigins?.buildYear, 'default_assumption');
  assert.equal(patch.sellerAskingBillion, undefined);
});

test('Stage 90 & 92 & 94 enforce hedonic delegation, FAST_SALE_FACTOR, purpose separation, and multi-city snapshot IDs', () => {
  const hood = getSampleHood();
  const input = createDefaultValuationInput(hood.id, {
    sqm: 90,
    buildYear: 1400,
    floor: 3,
    totalFloors: 5,
    locationPrecision: 'neighborhood',
    purpose: 'sale',
  }, 'shiraz');
  const res = evaluateWorkspaceValuation(input, hood, 'shiraz');

  assert.equal(res.scopeSupported, true);
  assert.ok(res.hedonic && res.hedonic.isValid);
  assert.equal(res.hedonic.methodologyKind, 'RULE_BASED_HEURISTIC_MULTIPLIER');
  assert.equal(res.hedonic.fastSaleTotalMillion, Math.round(res.hedonic.hedonicTotalMillion * FAST_SALE_FACTOR));
  assert.equal(res.purposeResult?.kind, 'sale');
  assert.equal(res.sufficiency.verifiedTransactionCount, 0);
  assert.equal(res.validation.status, 'rule_based_uncalibrated_against_deeds');
  assert.ok(res.uncertainty.bandPercent >= 5.0);
  assert.equal(res.snapshot.modelId, VALUATION_MODEL_ID);
  assert.equal(res.snapshot.cityId, 'shiraz');
  assert.equal(res.snapshot.dataSnapshotId, 'snapshot-shiraz-curated-1405');
  assert.ok(res.comparables.length >= 1);

  const rentRes = evaluateWorkspaceValuation({ ...input, purpose: 'rent' }, hood, 'tehran');
  assert.equal(rentRes.purposeResult?.kind, 'rent');
  if (rentRes.purposeResult?.kind === 'rent') {
    assert.equal(rentRes.purposeResult.estimationMode, 'neighborhood_index_limited_estimate');
    assert.equal(rentRes.purposeResult.monthlyRentEquivalentMillion, null);
    assert.ok(rentRes.purposeResult.estimatedFullRahnMillion > 0);
  }

  const snapshot = createSavedValuationReport(input, hood.name, res, 'uid-99');
  assert.ok(snapshot && snapshot.hedonicTotalMillion === res.hedonic.hedonicTotalMillion);
  assert.equal(snapshot.storageScope, 'account_synced');
  assert.equal(snapshot.cityId, 'shiraz');
  assert.equal(snapshot.reportVersion, 2);
});

test('Stage 91 & 93 reject out-of-scope properties cleanly and migrate untrusted v1 reports safely', () => {
  const hood = getSampleHood();
  for (const cat of ['commercial', 'office', 'land'] as const) {
    const input = createDefaultValuationInput(hood.id, { propertyCategory: cat });
    const res = evaluateWorkspaceValuation(input, hood);
    assert.equal(res.scopeSupported, false);
    assert.equal(res.hedonic, null);
    assert.equal(res.purposeResult, null);
    assert.equal(res.comparables.length, 0);
    assert.ok(res.unsupportedReasonFa && res.unsupportedReasonFa.includes('مسکونی'));
  }

  const migrated = validateAndMigrateSavedValuationReports([
    {
      id: 'legacy-1',
      hoodName: 'پونک',
      input: { hoodId: 1, sqm: 90, purpose: 'sale' },
      hedonicTotalMillion: 12000,
      hedonicPerSqm: 133,
    },
    { id: 'bad-row', input: { sqm: 2, hoodId: 0 }, hedonicTotalMillion: -5, hedonicPerSqm: 0 },
  ]);
  assert.equal(migrated.length, 1);
  assert.equal(migrated[0].id, 'legacy-1');
  assert.equal(migrated[0].reportVersion, 2);
});

test('Stage 95 preserves input origin distinction and non-mutating What-If evaluation', () => {
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
      sellerAsking: 'default_assumption',
    },
  });
  assert.equal(baseInput.inputOrigins.sqm, 'system_retrieved');
  const baseRes = evaluateWorkspaceValuation(baseInput, hood);
  const altRes = evaluateWorkspaceValuation({ ...baseInput, renovationStatus: 'luxury_renovated', isHypotheticalScenario: true }, hood);
  assert.ok(baseRes.hedonic && altRes.hedonic);
  assert.ok(altRes.hedonic.hedonicTotalMillion > baseRes.hedonic.hedonicTotalMillion);
  assert.equal(baseInput.renovationStatus, 'needs_renovation');
});
