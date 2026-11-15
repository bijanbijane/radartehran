/** @file src/features/onboarding/tests/stage67DemographicSocialArchitecture.test.ts — Stage 67 Architecture & Privacy Guard Tests */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateDayNightFloatingJusticeScenarioAndPrivacyGuards,
  evaluatePopulationDensityAgeHouseholdAndMigrationGuards,
} from '../services/demographicIntelligenceStage67Engine';
import { INITIAL_STAGE67_PROFILES } from '../services/stage67DemographicIntelligenceFixtures';
import {
  STAGE67_ACCEPTANCE_TESTS_22,
  STAGE67_AGE_GROUPS_8,
  STAGE67_DATA_TYPES_8,
  STAGE67_KEY_INDICATORS_8,
  STAGE67_LAYER_GROUPS_6,
  STAGE67_MAP_LAYERS_10,
  STAGE67_QUALITY_STATUSES_6,
  STAGE67_REPORT_TYPES_14,
  STAGE67_SECTIONS_18,
  STAGE67_SERVICE_GROUPS_9,
  STAGE67_SPATIAL_SCALES_7,
  STAGE67_TIME_WINDOWS_7,
  STAGE68_ECONOMY_PREVIEW_AXES_13,
} from '../services/demographicIntelligenceStage67Types';

test('Stage 67 exposes 18 sections, 10 layers, 6 layer groups, 8 KPIs, 7 scales, 8 age groups, 7 time windows, 9 service groups, 14 reports, 22 UI-DEM67 checks, and 13 Stage 68 axes', () => {
  assert.equal(STAGE67_SECTIONS_18.length, 18);
  assert.equal(STAGE67_MAP_LAYERS_10.length, 10);
  assert.equal(STAGE67_LAYER_GROUPS_6.length, 6);
  assert.equal(STAGE67_KEY_INDICATORS_8.length, 8);
  assert.equal(STAGE67_SPATIAL_SCALES_7.length, 7);
  assert.equal(STAGE67_AGE_GROUPS_8.length, 8);
  assert.equal(STAGE67_TIME_WINDOWS_7.length, 7);
  assert.equal(STAGE67_SERVICE_GROUPS_9.length, 9);
  assert.equal(STAGE67_DATA_TYPES_8.length, 8);
  assert.equal(STAGE67_QUALITY_STATUSES_6.length, 6);
  assert.equal(STAGE67_REPORT_TYPES_14.length, 14);
  assert.equal(STAGE67_ACCEPTANCE_TESTS_22.length, 22);
  assert.equal(STAGE67_ACCEPTANCE_TESTS_22[0].id, 'UI-DEM67-001');
  assert.equal(STAGE67_ACCEPTANCE_TESTS_22[21].id, 'UI-DEM67-022');
  assert.equal(STAGE68_ECONOMY_PREVIEW_AXES_13.length, 13);
});

test('Stage 67 separates 3 densities (FAR != population), blocks fake 0 and hidden 1405 interpolation, enforces small-cell privacy, and separates household correlation from effective housing demand', () => {
  const arjantin = INITIAL_STAGE67_PROFILES[0];
  const g1 = evaluatePopulationDensityAgeHouseholdAndMigrationGuards(arjantin, 'بلوک آماری', '۱۴۰۵');
  assert.ok(g1.totalVsThreeDensitiesGuardFa.includes('تراکم ساختمانی هرگز معادل تراکم جمعیت نیست'));
  assert.ok(g1.missingDataAndScalePermissionGuardFa.includes('تجمیع شد'));
  assert.ok(g1.missingDataAndScalePermissionGuardFa.includes('داده در دسترس نیست'));
  assert.ok(g1.householdHousingCausalityGuardFa.includes('از علت‌ومعلول جداست'));
  assert.ok(g1.migrationAndMobilityBoundaryGuardFa.includes('مرزبندی شفاف با نظام حمل‌ونقل'));

  const chitgar = INITIAL_STAGE67_PROFILES[2];
  const gChitgar = evaluatePopulationDensityAgeHouseholdAndMigrationGuards(chitgar, 'محله', '۱۴۰۰');
  assert.ok(gChitgar.totalVsThreeDensitiesGuardFa.includes('داده در دسترس نیست'));
});

test('Stage 67 blocks day-pop from commercial buildings alone, separates resident/potential/visitors, commercial units != jobs, scenario != forecast, and dynamic k-group privacy', () => {
  const chitgar = INITIAL_STAGE67_PROFILES[2];
  const g2 = evaluateDayNightFloatingJusticeScenarioAndPrivacyGuards(chitgar, 5, true, true);
  assert.ok(g2.dayNightAndFloatingSeparationGuardFa.includes('داده در دسترس نیست'));
  assert.ok(g2.dayNightAndFloatingSeparationGuardFa.includes('ظرفیت بالقوه جذب'));
  assert.ok(g2.inequalityAndCommercialJobsGuardFa.includes('ادعای قطعی درباره وضعیت اقتصادی'));
  assert.ok(g2.inequalityAndCommercialJobsGuardFa.includes('هرگز جایگزین تعداد فرصت‌های شغلی'));
  assert.ok(g2.compareAndCompositeHealthScoreGuardFa.includes('حداکثر ۴ محدوده'));
  assert.ok(g2.compareAndCompositeHealthScoreGuardFa.includes('سلامت جمعیتی محله'));
  assert.ok(g2.scenarioVsForecastAndDynamicPrivacyGuardFa.includes('سناریو'));
  assert.ok(g2.scenarioVsForecastAndDynamicPrivacyGuardFa.includes('خطر بازشناسایی'));
});
