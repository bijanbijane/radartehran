/** @file src/features/onboarding/tests/stage63UrbanPublicRealmArchitecture.test.ts — Stage 63 Architecture & Accessibility Chain Tests */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateSafetyShadeFacadePrivacyAndScenario,
  evaluateSidewalkAndAccessibilityChain,
} from '../services/urbanPublicRealmEngine';
import { INITIAL_STAGE63_PROFILES } from '../services/stage63UrbanPublicRealmFixtures';
import {
  STAGE63_ACCEPTANCE_TESTS_28,
  STAGE63_MAP_LAYERS_12,
  STAGE63_QUALITY_DIMENSIONS_6,
  STAGE63_SECTIONS_16,
  STAGE63_UX_EVENTS_15,
  STAGE64_MOBILITY_PREVIEW_AXES_16,
} from '../services/urbanPublicRealmTypes';

test('Stage 63 exposes 16 sections, 12 map layers, 6 dimensions, 28 UI-PR tests, 15 UX events, and 16 Stage 64 axes', () => {
  assert.equal(STAGE63_SECTIONS_16.length, 16);
  assert.equal(STAGE63_MAP_LAYERS_12.length, 12);
  assert.equal(STAGE63_QUALITY_DIMENSIONS_6.length, 6);
  assert.equal(STAGE63_ACCEPTANCE_TESTS_28.length, 28);
  assert.equal(STAGE63_ACCEPTANCE_TESTS_28[0].id, 'UI-PR-001');
  assert.equal(STAGE63_ACCEPTANCE_TESTS_28[27].id, 'UI-PR-028');
  assert.equal(STAGE63_UX_EVENTS_15.length, 15);
  assert.equal(STAGE64_MOBILITY_PREVIEW_AXES_16.length, 16);
});

test('Stage 63 distinguishes nominal vs effective width, enforces accessibility chain & independent group evaluation', () => {
  const valiasr = INITIAL_STAGE63_PROFILES[0];
  const guard = evaluateSidewalkAndAccessibilityChain(valiasr, true);
  assert.ok(guard.widthSeparationFa.includes('4.8'));
  assert.ok(guard.widthSeparationFa.includes('2.6'));
  assert.ok(guard.continuityVsAccessibilityFa.includes('معادل دسترس‌پذیری نیست'));
  assert.ok(guard.accessibilityChainVerdictFa.includes('دارای گسست است'));
  assert.ok(guard.compositeMaskingGuardFa.includes('مسدودشدن پنهان‌کاری امتیاز ترکیبی'));
});

test('Stage 63 separates physical vs perceived safety, shade vs thermal comfort, stale/duplicate handling, and PII masking', () => {
  const naziabad = INITIAL_STAGE63_PROFILES[1];
  const guard = evaluateSafetyShadeFacadePrivacyAndScenario(naziabad, true, true);
  assert.ok(guard.safetySeparationFa.includes('ایمنی فیزیکی'));
  assert.ok(guard.safetySeparationFa.includes('جایگزین نرخ جرم'));
  assert.ok(guard.shadeVsThermalGuardFa.includes('برچسب آسایش حرارتی قطعی مسدود است'));
  assert.ok(guard.duplicateStaleAndPrivacyGuardFa.includes('بدون حذف تاریخچه'));
  assert.ok(guard.duplicateStaleAndPrivacyGuardFa.includes('هشدار تازگی'));
  assert.ok(guard.duplicateStaleAndPrivacyGuardFa.includes('پوشانده شد'));
  assert.ok(guard.scenarioAndSpaceBoundaryFa.includes('سناریوی فرضی بهبود فضای عمومی'));
});
