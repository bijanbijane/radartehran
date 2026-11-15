/** @file src/features/onboarding/tests/stage77RentalMarketArchitecture.test.ts — Stage 77 Architecture & Rental Affordability Tests */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyCostBurdenTier,
  evaluateHbrResidualTenureAndPrivacy,
  evaluateRentalSupplyOutliersAndConversion,
} from '../services/rentalMarketStage77Engine';
import { INITIAL_STAGE77_RENTAL_PROFILES } from '../services/stage77RentalMarketFixtures';
import {
  STAGE77_ACCEPTANCE_TESTS_45,
  STAGE77_FILTERS_16,
  STAGE77_KPI_CARDS_12,
  STAGE77_MAP_LAYERS_10,
  STAGE77_REPORT_TYPES_15,
  STAGE77_SECTIONS_16,
  STAGE78_SALES_LIQUIDITY_PREVIEW_AXES_12,
} from '../services/rentalMarketStage77Types';

test('Stage 77 exposes 16 sections, 12 KPIs, 16 filters, 10 map layers, 15 reports, 45 UI-RNT77 checks, and 12 Stage 78 axes', () => {
  assert.equal(STAGE77_SECTIONS_16.length, 16);
  assert.equal(STAGE77_KPI_CARDS_12.length, 12);
  assert.equal(STAGE77_FILTERS_16.length, 16);
  assert.equal(STAGE77_MAP_LAYERS_10.length, 10);
  assert.equal(STAGE77_REPORT_TYPES_15.length, 15);
  assert.equal(STAGE77_ACCEPTANCE_TESTS_45.length, 45);
  assert.equal(STAGE77_ACCEPTANCE_TESTS_45[0].id, 'UI-RNT77-001');
  assert.equal(STAGE77_ACCEPTANCE_TESTS_45[44].id, 'UI-RNT77-045');
  assert.equal(STAGE78_SALES_LIQUIDITY_PREVIEW_AXES_12.length, 12);
});

test('Stage 77 verifies Req formula (600M deposit, 8M rent, 30% => 23.0M), asking != contract, outlier comparison, and deduplication 3-state guard', () => {
  const baghfeyz = INITIAL_STAGE77_RENTAL_PROFILES[0];
  const r1 = evaluateRentalSupplyOutliersAndConversion(baghfeyz, 8, 600, 30, true);
  assert.ok(r1.askingVsContractAndDedupGuardFa.includes('قیمت آگهی ≠ قیمت نهایی قرارداد'));
  assert.ok(r1.askingVsContractAndDedupGuardFa.includes('حذف خودکار ممنوع'));
  assert.ok(r1.distributionAndOutliersComparisonFa.includes('میانه'));
  assert.ok(r1.distributionAndOutliersComparisonFa.includes('IQR'));
  assert.ok(r1.rahnEquivalentFormulaAndSandboxFa.includes('23.0 میلیون تومان'));
});

test('Stage 77 verifies HBR & Yr sandbox (60M income, 28M Ch => 46.7% فشار بالا, Yr = 32.0M), non-simplistic budget copy, cheaper != affordable, and PII/telemetry redaction', () => {
  const shokoufeh = INITIAL_STAGE77_RENTAL_PROFILES[2];
  assert.equal(classifyCostBurdenTier(46.7), 'فشار بالا');
  const r2 = evaluateHbrResidualTenureAndPrivacy(shokoufeh, 60, 28, false, true);
  assert.ok(r2.hbrAndResidualIncomeGuardFa.includes('46.7%'));
  assert.ok(r2.hbrAndResidualIncomeGuardFa.includes('32.0 م.ت'));
  assert.ok(r2.nuancedBudgetMessageAndCostVsCommuteFa.includes('جایگزین عبارت ساده‌انگارانه «این محله گران است»'));
  assert.ok(r2.nuancedBudgetMessageAndCostVsCommuteFa.includes('«ارزان‌تر» ≠ «مقرون‌به‌صرفه‌تر»'));
  assert.ok(r2.tenureSecurityAndAntiPiiTelemetryGuardFa.includes('بدون افشای تماس/درآمد فردی'));
});
