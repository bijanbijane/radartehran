/** @file src/features/onboarding/tests/stage59UrbanDemographicsArchitecture.test.ts — Stage 59 Architecture & Privacy Tests */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateDensityAndHouseholdGuards,
  evaluateHousingServicesAndScenarioGuards,
  evaluatePrivacyMigrationDayNightAndSocialGuards,
} from '../services/urbanDemographicsEngine';
import { INITIAL_STAGE59_PROFILES } from '../services/stage59UrbanDemographicsFixtures';
import {
  STAGE59_ACCEPTANCE_TESTS_28,
  STAGE59_GLOSSARY_12,
  STAGE59_INTEGRATIONS_10,
  STAGE59_MAP_LAYERS_10,
  STAGE59_SECTIONS_15,
  STAGE59_UX_EVENTS_12,
  STAGE60_URBAN_ECONOMY_PREVIEW_AXES_14,
} from '../services/urbanDemographicsTypes';

test('Stage 59 exposes 15 sections, 10 integrations, 10 map layers, 12 glossary terms, 28 UI-DEM tests, 12 UX events, and 14 Stage 60 axes', () => {
  assert.equal(STAGE59_SECTIONS_15.length, 15);
  assert.equal(STAGE59_INTEGRATIONS_10.length, 10);
  assert.equal(STAGE59_MAP_LAYERS_10.length, 10);
  assert.equal(STAGE59_GLOSSARY_12.length, 12);
  assert.equal(STAGE59_ACCEPTANCE_TESTS_28.length, 28);
  assert.equal(STAGE59_ACCEPTANCE_TESTS_28[0].id, 'UI-DEM-001');
  assert.equal(STAGE59_ACCEPTANCE_TESTS_28[27].id, 'UI-DEM-028');
  assert.equal(STAGE59_UX_EVENTS_12.length, 12);
  assert.equal(STAGE60_URBAN_ECONOMY_PREVIEW_AXES_14.length, 14);
});

test('Stage 59 separates 3 density concepts, warns on cross-year mismatch, and blocks blind district extrapolation', () => {
  const yousefabad = INITIAL_STAGE59_PROFILES[0];
  const guard = evaluateDensityAndHouseholdGuards(yousefabad, yousefabad.districtAvgRefYearFa, true);
  assert.ok(guard.densitySeparationFa.includes('ناخالص'));
  assert.ok(guard.densitySeparationFa.includes('خالص سکونتی'));
  assert.ok(guard.densitySeparationFa.includes('ساختمانی'));
  assert.ok(guard.householdVsUnitDistinctionFa.includes('نوع خانوار از روی تعداد واحد حدس زده نمی‌شود'));
  assert.ok(guard.yearMismatchGuardFa.includes('هشدار ناهم‌زمانی سال مرجع'));
  assert.ok(guard.districtExtrapolationGuardFa.includes('مسدودشدن تعمیم مستقیم'));
});

test('Stage 59 enforces micro-block privacy threshold, filter re-identification block, day/night estimation caveat, boundary alerts, and anti-stigmatization', () => {
  const standardTract = INITIAL_STAGE59_PROFILES[0];
  const microBlock = INITIAL_STAGE59_PROFILES[1];

  const microGuard = evaluatePrivacyMigrationDayNightAndSocialGuards(microBlock, false);
  assert.ok(microGuard.privacyThresholdGuardFa.includes('اعمال آستانه محرمانگی'));

  const filterGuard = evaluatePrivacyMigrationDayNightAndSocialGuards(standardTract, true);
  assert.ok(filterGuard.privacyThresholdGuardFa.includes('هشدار خطر بازشناسایی'));
  assert.ok(filterGuard.migrationCausalityGuardFa.includes('لزوماً معادل مهاجرت نیست'));
  assert.ok(filterGuard.dayNightAccuracyGuardFa.includes('برآوردی / غیرمستقیم'));
  assert.ok(filterGuard.boundaryHistoryGuardFa.includes('هشدار تغییر مرز آماری'));
  assert.ok(filterGuard.antiStigmatizationRuleFa.includes('ممنوع'));
});

test('Stage 59 distinguishes 4 housing demand tiers, reuses Stage 56 services, and labels future demographic scenarios cleanly', () => {
  const standardTract = INITIAL_STAGE59_PROFILES[0];
  const guard = evaluateHousingServicesAndScenarioGuards(standardTract, 'سناریوی فرضی');
  assert.ok(guard.housingDemandFourTierGuardFa.includes('نیاز بالقوه سکونت'));
  assert.ok(guard.housingDemandFourTierGuardFa.includes('معاملات مشاهده‌شده'));
  assert.ok(guard.stage56SingleSourceLinkFa.includes('مرحله ۵۶'));
  assert.ok(guard.forecastLifecycleBadgeFa.includes('سناریوی فرضی'));
});
