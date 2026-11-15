/** @file src/features/onboarding/tests/stage80ConstructionEconomicsArchitecture.test.ts — Stage 80 Construction Economics & CV/LCC Tests */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateLcc,
  evaluateBudgetCvLccAndPrivacy,
  evaluateConstructionCostMaterialsAndSafety,
} from '../services/constructionEconomicsStage80Engine';
import { INITIAL_STAGE80_CONSTRUCTION_PROFILES } from '../services/stage80ConstructionFixtures';
import {
  STAGE80_ACCEPTANCE_TESTS_56,
  STAGE80_FILTERS_14,
  STAGE80_KPI_CARDS_14,
  STAGE80_PHASES_16,
  STAGE80_REPORT_TYPES_18,
  STAGE80_SECTIONS_22,
  STAGE81_LAND_MARKET_PREVIEW_AXES_15,
} from '../services/constructionEconomicsStage80Types';

test('Stage 80 exposes 22 sections, 14 KPIs, 14 filters, 16 phases, 18 reports, 56 UI-CST80 tests, and 15 Stage 81 axes', () => {
  assert.equal(STAGE80_SECTIONS_22.length, 22);
  assert.equal(STAGE80_KPI_CARDS_14.length, 14);
  assert.equal(STAGE80_FILTERS_14.length, 14);
  assert.equal(STAGE80_PHASES_16.length, 16);
  assert.equal(STAGE80_REPORT_TYPES_18.length, 18);
  assert.equal(STAGE80_ACCEPTANCE_TESTS_56.length, 56);
  assert.equal(STAGE80_ACCEPTANCE_TESTS_56[0].id, 'UI-CST80-001');
  assert.equal(STAGE80_ACCEPTANCE_TESTS_56[55].id, 'UI-CST80-056');
  assert.equal(STAGE81_LAND_MARKET_PREVIEW_AXES_15.length, 15);
});

test('Stage 80 enforces gross vs useful floor area, duplicate invoice flagging without auto-delete, and excavation safety docs guard', () => {
  const punak = INITIAL_STAGE80_CONSTRUCTION_PROFILES[0];
  const r1 = evaluateConstructionCostMaterialsAndSafety(punak);
  assert.ok(r1.entitiesAndFloorAreaBasisGuardFa.includes('زیربنای ناخالص'));
  assert.ok(r1.entitiesAndFloorAreaBasisGuardFa.includes('زیربنای مفید'));
  assert.ok(r1.excavationSafetyAndDuplicateInvoiceGuardFa.includes('حذف خودکار ممنوع'));

  const vanak = INITIAL_STAGE80_CONSTRUCTION_PROFILES[1];
  const r2 = evaluateConstructionCostMaterialsAndSafety(vanak);
  assert.ok(r2.excavationSafetyAndDuplicateInvoiceGuardFa.includes('هشدار ایمنی حیاتی'));
});

test('Stage 80 computes Cd, CV, CV%, LCC, separates physical vs financial progress, and guards contractor PII', () => {
  const punak = INITIAL_STAGE80_CONSTRUCTION_PROFILES[0];
  const res = evaluateBudgetCvLccAndPrivacy(punak, 50, 60, 2, 25, true);
  assert.equal(res.totalDevCdBillion, 56);
  assert.equal(res.costVarianceCvBillion, -10);
  assert.equal(Number(res.costVariancePct.toFixed(1)), 20);
  assert.ok(calculateLcc(40, [2, 2], 25) > 42);
  assert.ok(res.budgetVarianceAndProgressGapFa.includes('پیشرفت فیزیکی (68%) ≠ پیشرفت مالی (79%)'));
  assert.ok(res.contractorAndInvoicePrivacyGuardFa.includes('حذف شده‌اند'));
});
