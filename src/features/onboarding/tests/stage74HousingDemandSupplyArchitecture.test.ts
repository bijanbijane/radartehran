/** @file src/features/onboarding/tests/stage74HousingDemandSupplyArchitecture.test.ts — Stage 74 Architecture & Equilibrium Guard Tests */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateFiveConceptsAndSupplyDemand,
  evaluateGapEquilibriumAndPriority,
} from '../services/housingDemandSupplyStage74Engine';
import { INITIAL_STAGE74_EQUILIBRIUM_PROFILES } from '../services/stage74HousingDemandSupplyFixtures';
import {
  STAGE74_ACCEPTANCE_TESTS_45,
  STAGE74_AREA_BRACKETS_5,
  STAGE74_GAP_DIMENSIONS_5,
  STAGE74_KPI_CARDS_8,
  STAGE74_REPORT_TYPES_10,
  STAGE74_UX_METRICS_10,
  STAGE74_VACANCY_CLASSES_4,
  STAGE75_BUILDING_LIFECYCLE_PREVIEW_AXES_12,
} from '../services/housingDemandSupplyStage74Types';

test('Stage 74 exposes 8 KPIs, 5 area brackets, 5 gap dimensions, 4 vacancy classes, 10 reports, 10 UX metrics, 45 UI-EQB74 checks, and 12 Stage 75 axes', () => {
  assert.equal(STAGE74_KPI_CARDS_8.length, 8);
  assert.equal(STAGE74_AREA_BRACKETS_5.length, 5);
  assert.equal(STAGE74_GAP_DIMENSIONS_5.length, 5);
  assert.equal(STAGE74_VACANCY_CLASSES_4.length, 4);
  assert.equal(STAGE74_REPORT_TYPES_10.length, 10);
  assert.equal(STAGE74_UX_METRICS_10.length, 10);
  assert.equal(STAGE74_ACCEPTANCE_TESTS_45.length, 45);
  assert.equal(STAGE74_ACCEPTANCE_TESTS_45[0].id, 'UI-EQB74-001');
  assert.equal(STAGE74_ACCEPTANCE_TESTS_45[44].id, 'UI-EQB74-045');
  assert.equal(STAGE75_BUILDING_LIFECYCLE_PREVIEW_AXES_12.length, 12);
});

test('Stage 74 enforces 5-concept separation, listing deduplication, vacancy exclusion, pipeline != supply, and motive uncertainty', () => {
  const shahran = INITIAL_STAGE74_EQUILIBRIUM_PROFILES[0];
  const r1 = evaluateFiveConceptsAndSupplyDemand(shahran, true, true);
  assert.ok(r1.fiveConceptsAndDeduplicationGuardFa.includes('واحد یکتا از'));
  assert.ok(r1.vacantAndPipelineNotGuaranteedSupplyGuardFa.includes('خالی و قابل عرضه'));
  assert.ok(r1.vacantAndPipelineNotGuaranteedSupplyGuardFa.includes('ظرفیت بالقوه توسعه ≠ عرضه قطعی آینده'));
  assert.ok(r1.motiveViewsAndNeedsFreedomGuardFa.includes('تقاضای مصرفی/سرمایه‌ای برآوردی'));
  assert.ok(r1.motiveViewsAndNeedsFreedomGuardFa.includes('بازدید/جست‌وجوی آگهی ≠ تعداد خریداران واقعی'));
});

test('Stage 74 enforces GQ = DQ - SQ, 5 separate gap dimensions, structural equilibrium check, and non-binding priority map', () => {
  const kouhak = INITIAL_STAGE74_EQUILIBRIUM_PROFILES[2];
  const r2 = evaluateGapEquilibriumAndPriority(kouhak, true, 10);
  assert.ok(r2.unitGapFiveDimensionsGuardFa.includes('GQ = DQ − SQ'));
  assert.ok(r2.unitGapFiveDimensionsGuardFa.includes('ادغام کور در یک امتیاز واحد ممنوع'));
  assert.ok(r2.structuralEquilibriumVsCountBalanceGuardFa.includes('تعادل تعدادی» و «تعادل کیفی/متراژی»'));
  assert.ok(r2.priorityNoAutoPermitAndPrivacyGuardFa.includes('نه صدور خودکار مجوز ساخت'));
});
