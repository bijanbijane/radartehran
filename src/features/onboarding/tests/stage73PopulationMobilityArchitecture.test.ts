/** @file src/features/onboarding/tests/stage73PopulationMobilityArchitecture.test.ts — Stage 73 Architecture & Mobility Guard Tests */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateFlowsAndDemographicStructure,
  evaluateStabilityScenariosAndPrivacy,
} from '../services/populationMobilityStage73Engine';
import { INITIAL_STAGE73_MOBILITY_PROFILES } from '../services/stage73PopulationMobilityFixtures';
import {
  STAGE73_ACCEPTANCE_TESTS_40,
  STAGE73_FILTER_FIELDS_16,
  STAGE73_KPI_CARDS_8,
  STAGE73_MAP_LAYERS_11,
  STAGE73_REPORT_TYPES_10,
  STAGE73_TENURE_BUCKETS_5,
  STAGE73_UX_METRICS_10,
  STAGE74_MARKET_EQUILIBRIUM_PREVIEW_AXES_11,
} from '../services/populationMobilityStage73Types';

test('Stage 73 exposes 8 KPIs, 11 map layers, 5 tenure buckets, 16 filters, 10 reports, 10 UX metrics, 40 UI-MOB73 checks, and 11 Stage 74 axes', () => {
  assert.equal(STAGE73_KPI_CARDS_8.length, 8);
  assert.equal(STAGE73_MAP_LAYERS_11.length, 11);
  assert.equal(STAGE73_TENURE_BUCKETS_5.length, 5);
  assert.equal(STAGE73_FILTER_FIELDS_16.length, 16);
  assert.equal(STAGE73_REPORT_TYPES_10.length, 10);
  assert.equal(STAGE73_UX_METRICS_10.length, 10);
  assert.equal(STAGE73_ACCEPTANCE_TESTS_40.length, 40);
  assert.equal(STAGE73_ACCEPTANCE_TESTS_40[0].id, 'UI-MOB73-001');
  assert.equal(STAGE73_ACCEPTANCE_TESTS_40[39].id, 'UI-MOB73-040');
  assert.equal(STAGE74_MARKET_EQUILIBRIUM_PREVIEW_AXES_11.length, 11);
});

test('Stage 73 enforces 3-way separation + NM = I - O, OD lines != physical route, missing inter-city fallback, and statistical correlation != causation', () => {
  const yousefabad = INITIAL_STAGE73_MOBILITY_PROFILES[1];
  const r1 = evaluateFlowsAndDemographicStructure(yousefabad, true, true);
  assert.ok(r1.threeWayConceptAndNetMigrationFa.includes('NM = I − O'));
  assert.ok(r1.flowLinesAndInterCityGuardFa.includes('≠ مسیر فیزیکی حرکت اشخاص'));
  assert.ok(r1.flowLinesAndInterCityGuardFa.includes('غیرفعال / داده ناکافی'));
  assert.ok(r1.householdAndHousingCorrelationGuardFa.includes('تحلیل آماری» است (نه رابطه علت‌ومعلولی قطعی)'));
});

test('Stage 73 enforces tenure non-stereotyping, new build != occupied, boundary shift warning, scenario label, anti-surveillance, and listings != population', () => {
  const chitgar = INITIAL_STAGE73_MOBILITY_PROFILES[0];
  const r2 = evaluateStabilityScenariosAndPrivacy(chitgar, 30, true);
  assert.ok(r2.tenureAndNewBuildCapacityGuardFa.includes('بدون فرض کلیشه‌ای'));
  assert.ok(r2.tenureAndNewBuildCapacityGuardFa.includes('واحد ساخته‌شده ≠'));
  assert.ok(r2.historicalBoundaryAndScenarioLabelFa.includes('همسان‌سازی محدوده'));
  assert.ok(r2.historicalBoundaryAndScenarioLabelFa.includes('برآورد مدل (نه آمار قطعی آینده)'));
  assert.ok(r2.antiSurveillanceAndListingNotPopulationGuardFa.includes('Anti-Inference'));
  assert.ok(r2.antiSurveillanceAndListingNotPopulationGuardFa.includes('جایگزین آمار واقعی جمعیت ساکن نمی‌شود'));
});
