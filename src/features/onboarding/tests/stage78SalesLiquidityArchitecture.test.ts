/** @file src/features/onboarding/tests/stage78SalesLiquidityArchitecture.test.ts — Stage 78 Architecture & Liquidity Tests */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateSalesGapDomAndLiquidity,
  evaluateYieldCycleAndPrivacy,
} from '../services/salesLiquidityStage78Engine';
import { INITIAL_STAGE78_SALES_PROFILES } from '../services/stage78SalesLiquidityFixtures';
import {
  STAGE78_ACCEPTANCE_TESTS_48,
  STAGE78_FILTERS_17,
  STAGE78_KPI_CARDS_14,
  STAGE78_MAP_LAYERS_10,
  STAGE78_REPORT_TYPES_18,
  STAGE78_SECTIONS_18,
  STAGE79_INVESTMENT_OPPORTUNITY_PREVIEW_AXES_12,
} from '../services/salesLiquidityStage78Types';

test('Stage 78 exposes 18 sections, 14 KPIs, 17 filters, 10 map layers, 18 reports, 48 UI-SLS78 checks, and 12 Stage 79 axes', () => {
  assert.equal(STAGE78_SECTIONS_18.length, 18);
  assert.equal(STAGE78_KPI_CARDS_14.length, 14);
  assert.equal(STAGE78_FILTERS_17.length, 17);
  assert.equal(STAGE78_MAP_LAYERS_10.length, 10);
  assert.equal(STAGE78_REPORT_TYPES_18.length, 18);
  assert.equal(STAGE78_ACCEPTANCE_TESTS_48.length, 48);
  assert.equal(STAGE78_ACCEPTANCE_TESTS_48[0].id, 'UI-SLS78-001');
  assert.equal(STAGE78_ACCEPTANCE_TESTS_48[47].id, 'UI-SLS78-048');
  assert.equal(STAGE79_INVESTMENT_OPPORTUNITY_PREVIEW_AXES_12.length, 12);
});

test('Stage 78 verifies G=8.3% & waiting=72M sandbox, 3 entities separation, DOM != closing, unsold survival label, and low-coverage insufficient guard', () => {
  const ekbatan = INITIAL_STAGE78_SALES_PROFILES[0];
  const r1 = evaluateSalesGapDomAndLiquidity(ekbatan, 12, 11, 12, 6, true);
  assert.ok(r1.entitiesSeparationAndQualityGuardFa.includes('آگهی (615) ≠ ملک ≠ معامله'));
  assert.ok(r1.askingGapAndWaitingCostSandboxFa.includes('8.3%'));
  assert.ok(r1.askingGapAndWaitingCostSandboxFa.includes('۷۲ م.ت'));
  assert.ok(r1.domSurvivalAndLiquidityConfidenceGuardFa.includes('هنوز فروخته نشده'));

  const vardavard = INITIAL_STAGE78_SALES_PROFILES[2];
  const rLow = evaluateSalesGapDomAndLiquidity(vardavard, 7.4, 6.8, 8, 4, true);
  assert.ok(rLow.domSurvivalAndLiquidityConfidenceGuardFa.includes('داده ناکافی برای ارزیابی'));
});

test('Stage 78 verifies Yg/Yn/R_real scenario math, non-psychological behavioral guard, and spatial/telemetry privacy', () => {
  const zaferanieh = INITIAL_STAGE78_SALES_PROFILES[1];
  const r2 = evaluateYieldCycleAndPrivacy(zaferanieh, 20, 900, 100, 30, 25, true);
  assert.ok(r2.yieldRoiAndInflationRealReturnFa.includes('Yg=4.50%'));
  assert.ok(r2.yieldRoiAndInflationRealReturnFa.includes('Yn=4.00%'));
  assert.ok(r2.yieldRoiAndInflationRealReturnFa.includes('R_real = 4.00%'));
  assert.ok(r2.motiveBehavioralAndCycleGuardFa.includes('نه تشخیص روان‌شناختی فرد'));
  assert.ok(r2.spatialAndTelemetryPrivacyGuardFa.includes('از نقشه عمومی و Telemetry حذف شده‌اند'));
});
