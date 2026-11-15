/** @file src/features/onboarding/tests/stage70DemographicAnalysisArchitecture.test.ts — Stage 70 Architecture & Demographic Guard Tests */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateDayNightCapacityScenariosAndPrivacy,
  evaluateDensityChangeHouseholdAndMigration,
} from '../services/demographicAnalysisStage70Engine';
import { INITIAL_STAGE70_DEMOGRAPHIC_PROFILES } from '../services/stage70DemographicAnalysisFixtures';
import {
  STAGE70_ACCEPTANCE_TESTS_40,
  STAGE70_AGE_GROUPS_8,
  STAGE70_COMPOSITE_INDEXES_8,
  STAGE70_DOMAINS_20,
  STAGE70_FILTER_FIELDS_19,
  STAGE70_HOURLY_SLOTS_6,
  STAGE70_KPI_CARDS_8,
  STAGE70_REPORT_TYPES_15,
  STAGE70_TOOLBAR_ACTIONS_6,
  STAGE71_SPATIAL_EQUITY_PREVIEW_AXES_15,
} from '../services/demographicAnalysisStage70Types';

test('Stage 70 exposes 20 domains, 8 KPIs, 6 tools, 8 age groups, 6 hourly slots, 19 filters, 8 composites, 15 reports, 40 UI-DEM70 checks, and 15 Stage 71 axes', () => {
  assert.equal(STAGE70_DOMAINS_20.length, 20);
  assert.equal(STAGE70_KPI_CARDS_8.length, 8);
  assert.equal(STAGE70_TOOLBAR_ACTIONS_6.length, 6);
  assert.equal(STAGE70_AGE_GROUPS_8.length, 8);
  assert.equal(STAGE70_HOURLY_SLOTS_6.length, 6);
  assert.equal(STAGE70_FILTER_FIELDS_19.length, 19);
  assert.equal(STAGE70_COMPOSITE_INDEXES_8.length, 8);
  assert.equal(STAGE70_REPORT_TYPES_15.length, 15);
  assert.equal(STAGE70_ACCEPTANCE_TESTS_40.length, 40);
  assert.equal(STAGE70_ACCEPTANCE_TESTS_40[0].id, 'UI-DEM70-001');
  assert.equal(STAGE70_ACCEPTANCE_TESTS_40[39].id, 'UI-DEM70-040');
  assert.equal(STAGE71_SPATIAL_EQUITY_PREVIEW_AXES_15.length, 15);
});

test('Stage 70 enforces gross != net density, reference != publication year, abs != pct change + CAGR, unemployment denominator, housing non-conclusion, and migration privacy', () => {
  const bazaar = INITIAL_STAGE70_DEMOGRAPHIC_PROFILES[1];
  const g1 = evaluateDensityChangeHouseholdAndMigration(bazaar, true, true);
  assert.ok(g1.grossVsNetDensityAndReferenceYearGuardFa.includes('≠ تراکم خالص سکونتی'));
  assert.ok(g1.grossVsNetDensityAndReferenceYearGuardFa.includes('هشدار ناسازگاری سال آماری'));
  assert.ok(g1.absVsPctChangeCagrAndLaborGuardFa.includes('≠ تغییر درصدی'));
  assert.ok(g1.absVsPctChangeCagrAndLaborGuardFa.includes('CAGR='));
  assert.ok(g1.absVsPctChangeCagrAndLaborGuardFa.includes('≠ سهم بیکاران از کل جمعیت'));
  assert.ok(g1.householdHousingAndMigrationPrivacyGuardFa.includes('تعمیم داده منطقه‌ای به قطعه/خانوار و نمایش مسیر فردی ممنوع است'));
});

test('Stage 70 enforces ΔP = P_day - P_night estimated tag, building height != pop, 3 distinct capacities, correlation != causation, transparent composite, and anti-inference', () => {
  const chitgar = INITIAL_STAGE70_DEMOGRAPHIC_PROFILES[2];
  const g2 = evaluateDayNightCapacityScenariosAndPrivacy(chitgar, '۱۲ تا ۱۵', true, true);
  assert.ok(g2.dayNightDeltaAndBuildingHeightGuardFa.includes('ΔP = P_day'));
  assert.ok(g2.dayNightDeltaAndBuildingHeightGuardFa.includes('[تخمین جمعیت حاضر، تفکیک‌شده از جمعیت ساکن]'));
  assert.ok(g2.dayNightDeltaAndBuildingHeightGuardFa.includes('ارتفاع ساختمان ≠ جمعیت واقعی'));
  assert.ok(g2.threeCapacitiesAndHousingCausalityGuardFa.includes('ظرفیت نظری'));
  assert.ok(g2.threeCapacitiesAndHousingCausalityGuardFa.includes('ظرفیت قانونی ضوابط'));
  assert.ok(g2.threeCapacitiesAndHousingCausalityGuardFa.includes('ظرفیت عملیاتی زیرساختی'));
  assert.ok(g2.threeCapacitiesAndHousingCausalityGuardFa.includes('≠ علیت قطعی'));
  assert.ok(g2.microGroupSuppressionCompositeAndDisclosureGuardFa.includes('فرمول، متغیرهای ورودی، مخرج'));
  assert.ok(g2.microGroupSuppressionCompositeAndDisclosureGuardFa.includes('Anti-Inference'));
});
