/** @file src/features/onboarding/tests/stage82UrbanRegenerationArchitecture.test.ts — Stage 82 Urban Regeneration & Renewal Tests */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyPriorityMatrix,
  evaluateAtlasAndInefficiencyBreakdown,
  evaluateInterventionDisplacementAndPrivacy,
} from '../services/urbanRegenerationStage82Engine';
import { INITIAL_STAGE82_REGENERATION_PROFILES } from '../services/stage82UrbanRegenerationFixtures';
import {
  STAGE82_ACCEPTANCE_TESTS_65,
  STAGE82_ATLAS_LAYERS_12,
  STAGE82_FILTERS_12,
  STAGE82_KPI_CARDS_14,
  STAGE82_REPORT_TYPES_18,
  STAGE82_SECTIONS_26,
  STAGE83_URBAN_INVESTMENT_PREVIEW_AXES_15,
} from '../services/urbanRegenerationStage82Types';

test('Stage 82 exposes 26 sections, 14 KPIs, 12 filters, 12 layers, 18 reports, 65 UI-REG82 tests, and 15 Stage 83 axes', () => {
  assert.equal(STAGE82_SECTIONS_26.length, 26);
  assert.equal(STAGE82_KPI_CARDS_14.length, 14);
  assert.equal(STAGE82_FILTERS_12.length, 12);
  assert.equal(STAGE82_ATLAS_LAYERS_12.length, 12);
  assert.equal(STAGE82_REPORT_TYPES_18.length, 18);
  assert.equal(STAGE82_ACCEPTANCE_TESTS_65.length, 65);
  assert.equal(STAGE82_ACCEPTANCE_TESTS_65[0].id, 'UI-REG82-001');
  assert.equal(STAGE82_ACCEPTANCE_TESTS_65[64].id, 'UI-REG82-065');
  assert.equal(STAGE83_URBAN_INVESTMENT_PREVIEW_AXES_15.length, 15);
});

test('Stage 82 distinguishes physical decay from infrastructural dysfunction and classifies 2x2 priority matrix correctly', () => {
  const shadabad = INITIAL_STAGE82_REGENERATION_PROFILES[1];
  const atlas = evaluateAtlasAndInefficiencyBreakdown(shadabad, 'ترکیب چند روش');
  assert.ok(atlas.fiveEntitiesAndLifecycleGuardFa.includes('محدوده مداخله'));
  assert.ok(atlas.compositeVsDisaggregatedBreakdownFa.includes('تفکیک اجباری ابعاد'));
  assert.ok(atlas.decayVsDysfunctionAndDiagnosticGuardFa.includes('فرسودگی کالبدی ≠ ناکارآمدی شهری'));
  assert.equal(classifyPriorityMatrix('بالا', 'بالا'), 'اولویت اجرای فوری');
  assert.equal(classifyPriorityMatrix('بالا', 'پایین'), 'نیازمند رفع موانع');
  assert.equal(classifyPriorityMatrix('پایین', 'بالا'), 'مداخله فرصت‌محور');
  assert.equal(classifyPriorityMatrix('پایین', 'پایین'), 'پایش و بررسی دوره‌ای');
});

test('Stage 82 emits social monitoring displacement warning, guards DiD vs descriptive comparison, and protects resident PII', () => {
  const navab = INITIAL_STAGE82_REGENERATION_PROFILES[2];
  const rNavab = evaluateInterventionDisplacementAndPrivacy(navab, false, true);
  assert.ok(rNavab.displacementPressureWarningFa.includes('نیازمند پایش اجتماعی'));
  assert.ok(rNavab.financialVsSocialAndNonMonetaryGuardFa.includes('اولویت اجرای فوری'));

  const shadabad = INITIAL_STAGE82_REGENERATION_PROFILES[1];
  const rShad = evaluateInterventionDisplacementAndPrivacy(shadabad, false, true);
  assert.ok(rShad.didVsDescriptiveAndPrivacyGuardFa.includes('مقایسه توصیفی'));
  assert.ok(rShad.didVsDescriptiveAndPrivacyGuardFa.includes('نماینده قطعی تمام ساکنان تلقی نمی‌شود'));
});
