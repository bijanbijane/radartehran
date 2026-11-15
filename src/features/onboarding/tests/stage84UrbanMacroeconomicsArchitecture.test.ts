/** @file src/features/onboarding/tests/stage84UrbanMacroeconomicsArchitecture.test.ts — Stage 84 Urban Macroeconomics & Cycles Tests */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateMonthlyInstallment,
  calculateRealGrowth,
  evaluateInflationFxAndCycles,
  evaluateLagScenariosAndGovernance,
} from '../services/urbanMacroeconomicsStage84Engine';
import { INITIAL_STAGE84_MACRO_PROFILES } from '../services/stage84UrbanMacroeconomicsFixtures';
import {
  STAGE84_ACCEPTANCE_TESTS_72,
  STAGE84_ATLAS_LAYERS_9,
  STAGE84_REPORT_TEMPLATES_8,
  STAGE84_SECTIONS_21,
  STAGE84_STATUS_KPIS_10,
  STAGE84_UI_STATES_7,
  STAGE85_PUBLIC_POLICY_PREVIEW_AXES_15,
} from '../services/urbanMacroeconomicsStage84Types';

test('Stage 84 exposes 21 sections, 10 status KPIs, 9 atlas layers, 8 reports, 7 states, 72 MAC tests, and 15 Stage 85 axes', () => {
  assert.equal(STAGE84_SECTIONS_21.length, 21);
  assert.equal(STAGE84_STATUS_KPIS_10.length, 10);
  assert.equal(STAGE84_ATLAS_LAYERS_9.length, 9);
  assert.equal(STAGE84_REPORT_TEMPLATES_8.length, 8);
  assert.equal(STAGE84_UI_STATES_7.length, 7);
  assert.equal(STAGE84_ACCEPTANCE_TESTS_72.length, 72);
  assert.equal(STAGE84_ACCEPTANCE_TESTS_72[0].id, 'MAC-001');
  assert.equal(STAGE84_ACCEPTANCE_TESTS_72[71].id, 'MAC-072');
  assert.equal(STAGE85_PUBLIC_POLICY_PREVIEW_AXES_15.length, 15);
});

test('Stage 84 separates national vs urban, computes real inflation-adjusted growth, async sales/rent cycles, and mortgage math', () => {
  assert.ok(calculateRealGrowth(27.5, 33.5) < 0);
  const installment = calculateMonthlyInstallment(2, 24, 10);
  assert.ok(installment > 40 && installment < 50);

  const d5 = INITIAL_STAGE84_MACRO_PROFILES[0];
  const res = evaluateInflationFxAndCycles(d5, 20, 2, 24, 10);
  assert.ok(res.geoSeparationAndRealVsNominalGuardFa.includes('تفکیک سطح ملی'));
  assert.ok(res.fxPassThroughAndAsyncCyclesGuardFa.includes('ناهم‌زمانی چرخه‌ها'));
  assert.ok(res.mortgageCalculatorGuardFa.includes('نه توصیه‌گر اعتباری'));
});

test('Stage 84 blocks definitive lag correlation on short series, exposes conflicting sources, and guards private telemetry', () => {
  const shortProfile = INITIAL_STAGE84_MACRO_PROFILES[2];
  const rShort = evaluateLagScenariosAndGovernance(shortProfile, 3, true);
  assert.ok(rShort.lagCorrelationAndCausationGuardFa.includes('متوقف شد'));

  const conflictProfile = INITIAL_STAGE84_MACRO_PROFILES[1];
  const rConflict = evaluateLagScenariosAndGovernance(conflictProfile, 3, true);
  assert.ok(rConflict.conflictingSourcesAndTelemetryPrivacyGuardFa.includes('هشدار تناقض منابع'));
  assert.ok(rConflict.conflictingSourcesAndTelemetryPrivacyGuardFa.includes('ذخیره نمی‌شوند'));
});
