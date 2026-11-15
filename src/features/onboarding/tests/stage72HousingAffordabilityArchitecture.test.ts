/** @file src/features/onboarding/tests/stage72HousingAffordabilityArchitecture.test.ts — Stage 72 Architecture & Household Economics Tests */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateBuyRentAndCostPressure,
  evaluateGapScenariosAndPrivacy,
} from '../services/housingAffordabilityStage72Engine';
import { INITIAL_STAGE72_AFFORDABILITY_PROFILES } from '../services/stage72HousingAffordabilityFixtures';
import {
  STAGE72_ACCEPTANCE_TESTS_40,
  STAGE72_ANCILLARY_COST_CATEGORIES_7,
  STAGE72_FILTER_FIELDS_18,
  STAGE72_HOUSEHOLD_GROUPS_8,
  STAGE72_KPI_CARDS_6,
  STAGE72_MAP_LAYERS_9,
  STAGE72_REPORT_TYPES_7,
  STAGE72_UX_METRICS_9,
  STAGE73_POPULATION_MOBILITY_PREVIEW_AXES_11,
} from '../services/housingAffordabilityStage72Types';

test('Stage 72 exposes 6 KPIs, 9 map layers, 8 household groups, 7 ancillary categories, 18 filters, 7 reports, 9 UX metrics, 40 UI-AFF72 checks, and 11 Stage 73 axes', () => {
  assert.equal(STAGE72_KPI_CARDS_6.length, 6);
  assert.equal(STAGE72_MAP_LAYERS_9.length, 9);
  assert.equal(STAGE72_HOUSEHOLD_GROUPS_8.length, 8);
  assert.equal(STAGE72_ANCILLARY_COST_CATEGORIES_7.length, 7);
  assert.equal(STAGE72_FILTER_FIELDS_18.length, 18);
  assert.equal(STAGE72_REPORT_TYPES_7.length, 7);
  assert.equal(STAGE72_UX_METRICS_9.length, 9);
  assert.equal(STAGE72_ACCEPTANCE_TESTS_40.length, 40);
  assert.equal(STAGE72_ACCEPTANCE_TESTS_40[0].id, 'UI-AFF72-001');
  assert.equal(STAGE72_ACCEPTANCE_TESTS_40[39].id, 'UI-AFF72-040');
  assert.equal(STAGE73_POPULATION_MOBILITY_PREVIEW_AXES_11.length, 11);
});

test('Stage 72 enforces PTI != years of savings, HCR separate commuting, missing income -> اطلاعات کافی موجود نیست, and 3 buy scenarios', () => {
  const punak = INITIAL_STAGE72_AFFORDABILITY_PROFILES[0];
  const r1 = evaluateBuyRentAndCostPressure(punak, 0, 3, true);
  assert.ok(r1.ptiFormulaAndSavingsWarningFa.includes('معادل تعداد سال‌های واقعی پس‌انداز نیست'));
  assert.ok(r1.buyThreeScenariosFa.includes('۳ وضعیت مستقل قدرت خرید'));
  assert.ok(r1.hcrHousingVsCommuteAndMissingGuardFa.includes('در شاخص جداگانه نمایش داده شد'));

  const yaftabadMissing = INITIAL_STAGE72_AFFORDABILITY_PROFILES[3];
  const rMissing = evaluateBuyRentAndCostPressure(yaftabadMissing, 0, 2.8, true);
  assert.ok(rMissing.ptiFormulaAndSavingsWarningFa.includes('اطلاعات کافی موجود نیست'));
  assert.ok(rMissing.hcrHousingVsCommuteAndMissingGuardFa.includes('اطلاعات کافی موجود نیست'));
});

test('Stage 72 enforces nominal vs real gap, anti-stigma out-of-range wording, unmodeled scenario probability guard, 3 sub-indices, and session-only privacy', () => {
  const niavaran = INITIAL_STAGE72_AFFORDABILITY_PROFILES[1];
  const r2 = evaluateGapScenariosAndPrivacy(niavaran, 'بدبینانه', 35, 10, true);
  assert.ok(r2.nominalVsRealGapAndOutOfRangeLabelFa.includes('غیرقابل سکونت/نامناسب» ممنوع است'));
  assert.ok(r2.nominalVsRealGapAndOutOfRangeLabelFa.includes('رشد واقعی پس از تعدیل تورم'));
  assert.ok(r2.scenarioProjectionAndProbabilityGuardFa.includes('اعلام احتمال وقوع بدون مدل معتبر ممنوع'));
  assert.ok(r2.subIndicesSplitAndPrivacyGuardFa.includes('۳ زیرشاخص مستقل'));
  assert.ok(r2.subIndicesSplitAndPrivacyGuardFa.includes('وارد نقشه عمومی نمی‌گردد'));
});
