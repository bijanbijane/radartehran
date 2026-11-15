/** @file src/features/onboarding/tests/stage71SpatialEquityArchitecture.test.ts — Stage 71 Architecture & Spatial Equity Guard Tests */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateCompositeEquityScenariosAndPrivacy,
  evaluateServicesAccessAndDeprivation,
} from '../services/spatialEquityUrbanJusticeStage71Engine';
import { INITIAL_STAGE71_EQUITY_PROFILES } from '../services/stage71SpatialEquityFixtures';
import {
  STAGE71_ACCEPTANCE_TESTS_40,
  STAGE71_ACCESS_CRITERIA_7,
  STAGE71_DEPRIVATION_LEVELS_5,
  STAGE71_DOMAINS_20,
  STAGE71_FILTER_FIELDS_18,
  STAGE71_KPI_CARDS_8,
  STAGE71_REPORT_TYPES_15,
  STAGE71_SERVICE_CLASSES_10,
  STAGE71_TOOLS_6,
  STAGE71_UX_METRICS_10,
  STAGE72_AFFORDABILITY_PREVIEW_AXES_15,
} from '../services/spatialEquityUrbanJusticeStage71Types';

test('Stage 71 exposes 20 domains, 8 KPIs, 6 tools, 10 service classes, 7 criteria, 5 levels, 18 filters, 15 reports, 10 UX metrics, 40 UI-EQU71 checks, and 15 Stage 72 axes', () => {
  assert.equal(STAGE71_DOMAINS_20.length, 20);
  assert.equal(STAGE71_KPI_CARDS_8.length, 8);
  assert.equal(STAGE71_TOOLS_6.length, 6);
  assert.equal(STAGE71_SERVICE_CLASSES_10.length, 10);
  assert.equal(STAGE71_ACCESS_CRITERIA_7.length, 7);
  assert.equal(STAGE71_DEPRIVATION_LEVELS_5.length, 5);
  assert.equal(STAGE71_FILTER_FIELDS_18.length, 18);
  assert.equal(STAGE71_REPORT_TYPES_15.length, 15);
  assert.equal(STAGE71_UX_METRICS_10.length, 10);
  assert.equal(STAGE71_ACCEPTANCE_TESTS_40.length, 40);
  assert.equal(STAGE71_ACCEPTANCE_TESTS_40[0].id, 'UI-EQU71-001');
  assert.equal(STAGE71_ACCEPTANCE_TESTS_40[39].id, 'UI-EQU71-040');
  assert.equal(STAGE72_AFFORDABILITY_PREVIEW_AXES_15.length, 15);
});

test('Stage 71 enforces missing data != zero, network walk vs direct distance, target school pop, private garden exclusion, official/user infra split, and multi-factor deprivation', () => {
  const moshiriyeh = INITIAL_STAGE71_EQUITY_PROFILES[2];
  const res = evaluateServicesAccessAndDeprivation(moshiriyeh, true, true);
  assert.ok(res.networkAccessAndMissingNotZeroGuardFa.includes('داده ناموجود'));
  assert.ok(res.networkAccessAndMissingNotZeroGuardFa.includes('داده ناموجود ≠ ۰ تخت'));
  assert.ok(res.targetAgeGreenAndInfraSeparationGuardFa.includes('جمعیت دانش‌آموز هدف'));
  assert.ok(res.targetAgeGreenAndInfraSeparationGuardFa.includes('باغ/فضای سبز خصوصی حذف گردید'));
  assert.ok(res.targetAgeGreenAndInfraSeparationGuardFa.includes('مجزا از گزارش کاربران'));
  assert.ok(res.multiFactorDeprivationAndCostBarrierGuardFa.includes('روش چندمؤلفه‌ای'));
});

test('Stage 71 enforces Σ wj = 1 normalization, 3-way risk split, spend != equity effect, simulation disclaimer, and anti-discrimination/anti-inference privacy', () => {
  const abdoulabad = INITIAL_STAGE71_EQUITY_PROFILES[0];
  const res = evaluateCompositeEquityScenariosAndPrivacy(
    abdoulabad,
    { service: 0.45, infra: 0.3, env: 0.25 },
    true,
  );
  assert.ok(res.compositeWeightsSensitivityResultFa.includes('Σ wj = 1.00'));
  assert.ok(res.riskThreeWayAndProjectSpendGuardFa.includes('مواجهه'));
  assert.ok(res.riskThreeWayAndProjectSpendGuardFa.includes('آسیب‌پذیری'));
  assert.ok(res.riskThreeWayAndProjectSpendGuardFa.includes('هزینه پروژه ≠ اثر واقعی بر عدالت شهری'));
  assert.ok(res.simulationAndAntiDiscriminationPrivacyGuardFa.includes('نتیجه شبیه‌سازی است نه تضمین تحقق پروژه'));
  assert.ok(res.simulationAndAntiDiscriminationPrivacyGuardFa.includes('ضدتبعیض'));
});
