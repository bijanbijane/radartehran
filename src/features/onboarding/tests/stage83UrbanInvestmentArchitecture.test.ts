/** @file src/features/onboarding/tests/stage83UrbanInvestmentArchitecture.test.ts — Stage 83 Urban Investment, PPP & Capital Economics Tests */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateWacc,
  evaluateCapitalFlowAndPpp,
  evaluateReturnsPublicImpactAndPrivacy,
} from '../services/urbanInvestmentStage83Engine';
import { INITIAL_STAGE83_INVESTMENT_PROFILES } from '../services/stage83UrbanInvestmentFixtures';
import {
  STAGE83_ACCEPTANCE_TESTS_68,
  STAGE83_FILTERS_12,
  STAGE83_KPI_CARDS_14,
  STAGE83_REPORT_TYPES_22,
  STAGE83_SECTIONS_28,
  STAGE84_MACROECONOMICS_PREVIEW_AXES_15,
} from '../services/urbanInvestmentStage83Types';

test('Stage 83 exposes 28 sections, 14 KPIs, 12 filters, 22 reports, 68 UI-FIN83 tests, and 15 Stage 84 axes', () => {
  assert.equal(STAGE83_SECTIONS_28.length, 28);
  assert.equal(STAGE83_KPI_CARDS_14.length, 14);
  assert.equal(STAGE83_FILTERS_12.length, 12);
  assert.equal(STAGE83_REPORT_TYPES_22.length, 22);
  assert.equal(STAGE83_ACCEPTANCE_TESTS_68.length, 68);
  assert.equal(STAGE83_ACCEPTANCE_TESTS_68[0].id, 'UI-FIN83-001');
  assert.equal(STAGE83_ACCEPTANCE_TESTS_68[67].id, 'UI-FIN83-068');
  assert.equal(STAGE84_MACROECONOMICS_PREVIEW_AXES_15.length, 15);
});

test('Stage 83 separates 4 capital funnels, exposes PPP long-term public commitments, and differentiates WACC from bank rate', () => {
  const tod = INITIAL_STAGE83_INVESTMENT_PROFILES[0];
  const flow = evaluateCapitalFlowAndPpp(tod, 40);
  assert.ok(flow.fiveEntitiesAndFourFunnelsGuardFa.includes('اعلام‌شده (2400) ≠ تعهدشده (1850) ≠ تأمین‌شده (1420) ≠ مصرف‌شده (680)'));
  assert.ok(flow.spatialConcentrationAndPppFiscalGuardFa.includes('تعهد بلندمدت نهاد عمومی'));
  assert.equal(Number(calculateWacc(40, 26, 60, 36).toFixed(1)), 32);
  assert.ok(flow.waccVsBankRateAndJointVentureGuardFa.includes('هزینه سرمایه ≠ نرخ سود بانکی'));
});

test('Stage 83 refuses fake IRR/return when baseline missing, warns on heterogeneous project comparison, and guards investor PII', () => {
  const socialInfra = INITIAL_STAGE83_INVESTMENT_PROFILES[2];
  const rSocial = evaluateReturnsPublicImpactAndPrivacy(socialInfra, true, true);
  assert.equal(rSocial.realAdjustedReturnPct, null);
  assert.ok(rSocial.missingDataAndHeterogeneousCompareGuardFa.includes('عدد ظاهراً دقیق تولید نمی‌شود'));
  assert.ok(rSocial.missingDataAndHeterogeneousCompareGuardFa.includes('هشدار روش‌شناختی'));
  assert.ok(rSocial.investorConfidentialityAndTelemetryGuardFa.includes('حذف شده‌اند'));
});
