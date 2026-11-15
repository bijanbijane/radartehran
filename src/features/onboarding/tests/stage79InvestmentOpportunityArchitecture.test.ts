/** @file src/features/onboarding/tests/stage79InvestmentOpportunityArchitecture.test.ts — Stage 79 Investment Opportunity & NPV/IRR Tests */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateNpv,
  estimateIrrWithGuard,
  evaluateNpvCostAndPrivacy,
  evaluateSpatialParcelOpportunity,
} from '../services/investmentOpportunityStage79Engine';
import { INITIAL_STAGE79_INVESTMENT_PROFILES } from '../services/stage79InvestmentFixtures';
import {
  STAGE79_ACCEPTANCE_TESTS_52,
  STAGE79_FILTERS_12,
  STAGE79_KPI_CARDS_11,
  STAGE79_MAP_LAYERS_15,
  STAGE79_REPORT_TYPES_18,
  STAGE79_SECTIONS_20,
  STAGE80_CONSTRUCTION_PREVIEW_AXES_14,
} from '../services/investmentOpportunityStage79Types';

test('Stage 79 exposes 20 sections, 11 KPIs, 15 layers, 12 filters, 18 reports, 52 UI-INV79 tests, and 14 Stage 80 axes', () => {
  assert.equal(STAGE79_SECTIONS_20.length, 20);
  assert.equal(STAGE79_KPI_CARDS_11.length, 11);
  assert.equal(STAGE79_MAP_LAYERS_15.length, 15);
  assert.equal(STAGE79_FILTERS_12.length, 12);
  assert.equal(STAGE79_REPORT_TYPES_18.length, 18);
  assert.equal(STAGE79_ACCEPTANCE_TESTS_52.length, 52);
  assert.equal(STAGE79_ACCEPTANCE_TESTS_52[0].id, 'UI-INV79-001');
  assert.equal(STAGE79_ACCEPTANCE_TESTS_52[51].id, 'UI-INV79-052');
  assert.equal(STAGE80_CONSTRUCTION_PREVIEW_AXES_14.length, 14);
});

test('Stage 79 separates legal vs economic FAR, analytical vs legal parcel consolidation, and dual-axis regeneration', () => {
  const oudlajan = INITIAL_STAGE79_INVESTMENT_PROFILES[1];
  const spatial = evaluateSpatialParcelOpportunity(oudlajan);
  assert.ok(spatial.upstreamConsumerAndFitRankingGuardFa.includes('هرگز به‌عنوان «بهترین سرمایه‌گذاری»'));
  assert.ok(spatial.consolidationAndRegenerationDualAxisGuardFa.includes('انتخاب در نقشه ≠ امکان یا تأیید قانونی تجمیع'));
  assert.ok(spatial.consolidationAndRegenerationDualAxisGuardFa.includes('بدون جابه‌جایی اجباری'));
});

test('Stage 79 computes valid NPV/IRR, blocks invalid missing cashflow, and catches multi-root sign changes', () => {
  const npv = calculateNpv([-100, 60, 70], 10);
  assert.ok(npv !== null && npv > 12 && npv < 13);

  const multiSignIrr = estimateIrrWithGuard([-100, 230, -132]);
  assert.equal(multiSignIrr.irrPct, null);
  assert.ok(multiSignIrr.statusFa.includes('چندریشه‌ای'));

  const missingProfile = INITIAL_STAGE79_INVESTMENT_PROFILES[2];
  const resMissing = evaluateNpvCostAndPrivacy(missingProfile, 25, 100, true, true);
  assert.equal(resMissing.npvBillion, null);
  assert.equal(resMissing.irrPct, null);
  assert.ok(resMissing.npvIrrAndNoDoubleCountGuardFa.includes('عدد ساختگی NPV/IRR تولید نمی‌کند'));
});
