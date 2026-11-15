/** @file src/features/onboarding/tests/stage69LandUseFunctionalArchitecture.test.ts — Stage 69 Architecture & Land Use Guard Tests */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateLandUseClassificationMapAndSectors,
  evaluateLandUseMixCompatibilityConformanceAndScenarios,
} from '../services/landUseFunctionalStructureStage69Engine';
import { INITIAL_STAGE69_LANDUSE_PROFILES } from '../services/stage69LandUseFunctionalFixtures';
import {
  STAGE69_ACCEPTANCE_TESTS_40,
  STAGE69_COMPATIBILITY_STATES_3,
  STAGE69_CONFORMANCE_STATUSES_5,
  STAGE69_DOMAINS_20,
  STAGE69_EXPORT_FORMATS_5,
  STAGE69_FILTER_FIELDS_18,
  STAGE69_KPI_CARDS_8,
  STAGE69_MAIN_GROUPS_14,
  STAGE69_MIX_BASES_4,
  STAGE69_REPORT_TYPES_10,
  STAGE69_TOOLBAR_ACTIONS_7,
  STAGE69_UX_METRICS_9,
  STAGE70_DEMOGRAPHIC_PREVIEW_AXES_15,
} from '../services/landUseFunctionalStructureStage69Types';

test('Stage 69 exposes 20 domains, 14 groups, 8 KPIs, 7 tools, 5 conformance, 3 compatibility, 4 mix bases, 18 filters, 10 reports, 5 formats, 9 UX metrics, 40 UI-LU69 checks, and 15 Stage 70 axes', () => {
  assert.equal(STAGE69_DOMAINS_20.length, 20);
  assert.equal(STAGE69_MAIN_GROUPS_14.length, 14);
  assert.equal(STAGE69_KPI_CARDS_8.length, 8);
  assert.equal(STAGE69_TOOLBAR_ACTIONS_7.length, 7);
  assert.equal(STAGE69_CONFORMANCE_STATUSES_5.length, 5);
  assert.equal(STAGE69_COMPATIBILITY_STATES_3.length, 3);
  assert.equal(STAGE69_MIX_BASES_4.length, 4);
  assert.equal(STAGE69_FILTER_FIELDS_18.length, 18);
  assert.equal(STAGE69_REPORT_TYPES_10.length, 10);
  assert.equal(STAGE69_EXPORT_FORMATS_5.length, 5);
  assert.equal(STAGE69_UX_METRICS_9.length, 9);
  assert.equal(STAGE69_ACCEPTANCE_TESTS_40.length, 40);
  assert.equal(STAGE69_ACCEPTANCE_TESTS_40[0].id, 'UI-LU69-001');
  assert.equal(STAGE69_ACCEPTANCE_TESTS_40[39].id, 'UI-LU69-040');
  assert.equal(STAGE70_DEMOGRAPHIC_PREVIEW_AXES_15.length, 15);
});

test('Stage 69 enforces land-use vs economic activity separation, 3-layer color rule, 4 residential variables, private garden exclusion, and satellite non-legal boundary', () => {
  const molavi = INITIAL_STAGE69_LANDUSE_PROFILES[0];
  const g1 = evaluateLandUseClassificationMapAndSectors(molavi, true, true);
  assert.ok(g1.landUseVsActivityAndColorRuleFa.includes('جدا از فعالیت اقتصادی مستقر'));
  assert.ok(g1.landUseVsActivityAndColorRuleFa.includes('رنگ کاربری زمین ≠ رنگ وضعیت اعتبار داده ≠ رنگ هشدار'));
  assert.ok(g1.residentialFourVarsAndPublicGreenGuardFa.includes('ساختمان ≠'));
  assert.ok(g1.residentialFourVarsAndPublicGreenGuardFa.includes('مساحت سبز به معنای دسترسی عمومی نیست'));
  assert.ok(g1.educationHealthCapacityAndSatelliteLegalGuardFa.includes('تشخیص تصویری ماهواره‌ای ≠ اثبات وضعیت حقوقی'));
});

test('Stage 69 enforces explicit mix basis, Shannon quality warning, interval history, conformance != violation, 3 realty value types, scenario != approved plan, and public privacy', () => {
  const shoush = INITIAL_STAGE69_LANDUSE_PROFILES[2];
  const g2 = evaluateLandUseMixCompatibilityConformanceAndScenarios(shoush, 'زیربنای ساختمان', false, true);
  assert.ok(g2.mixBasisDiversityAndCompatibilityGuardFa.includes('غیرقابل جایگزینی با سه مبنای دیگر'));
  assert.ok(g2.mixBasisDiversityAndCompatibilityGuardFa.includes('تنوع زیاد به‌صورت خودکار نشانه کیفیت بهتر محله نیست'));
  assert.ok(g2.historicalRangeAndConformanceVsViolationGuardFa.includes('بازه احتمالی به‌جای تاریخ ساختگی'));
  assert.ok(g2.historicalRangeAndConformanceVsViolationGuardFa.includes('بهتنهایی اثباتکننده تخلف ساختمانی یا شهرسازی نیست'));
  assert.ok(g2.threeRealtyValuesScenarioAndPrivacyGuardFa.includes('معاملاتی مشاهده‌شده'));
  assert.ok(g2.threeRealtyValuesScenarioAndPrivacyGuardFa.includes('مدل تحلیلی (طرح مصوب یا ضابطه رسمی نیست)'));
  assert.ok(g2.threeRealtyValuesScenarioAndPrivacyGuardFa.includes('اطلاعات مالکیت و هویت اشخاص به‌صورت پیش‌فرض مخفی'));
});
