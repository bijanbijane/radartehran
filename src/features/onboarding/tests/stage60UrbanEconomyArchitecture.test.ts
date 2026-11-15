/** @file src/features/onboarding/tests/stage60UrbanEconomyArchitecture.test.ts — Stage 60 Architecture & Anti-Bias Tests */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateActivityEmploymentAndDeduplicationGuards,
  evaluateCorridorAccessMarketAndDynamicGuards,
} from '../services/urbanEconomyEngine';
import { INITIAL_STAGE60_PROFILES } from '../services/stage60UrbanEconomyFixtures';
import {
  STAGE60_ACCEPTANCE_TESTS_28,
  STAGE60_GLOSSARY_16,
  STAGE60_MAP_LAYERS_10,
  STAGE60_SECTIONS_16,
  STAGE60_UX_EVENTS_12,
  STAGE61_LANDUSE_PREVIEW_AXES_15,
} from '../services/urbanEconomyTypes';

test('Stage 60 exposes 16 sections, 10 layers, 16 glossary terms, 28 UI-ECO tests, 12 UX events, and 15 Stage 61 axes', () => {
  assert.equal(STAGE60_SECTIONS_16.length, 16);
  assert.equal(STAGE60_MAP_LAYERS_10.length, 10);
  assert.equal(STAGE60_GLOSSARY_16.length, 16);
  assert.equal(STAGE60_ACCEPTANCE_TESTS_28.length, 28);
  assert.equal(STAGE60_ACCEPTANCE_TESTS_28[0].id, 'UI-ECO-001');
  assert.equal(STAGE60_ACCEPTANCE_TESTS_28[27].id, 'UI-ECO-028');
  assert.equal(STAGE60_UX_EVENTS_12.length, 12);
  assert.equal(STAGE61_LANDUSE_PREVIEW_AXES_15.length, 15);
});

test('Stage 60 separates registered vs active units, blocks mismatched comparisons, prevents double counting, and blocks unlabeled employment estimates', () => {
  const workshopBelt = INITIAL_STAGE60_PROFILES[1];
  const guard = evaluateActivityEmploymentAndDeduplicationGuards(workshopBelt, true, true);
  assert.ok(guard.registeredVsActiveGuardFa.includes('۱۶۴۰') || guard.registeredVsActiveGuardFa.includes('1640'));
  assert.ok(guard.crossZoneComparisonGuardFa.includes('مسدودشدن مقایسه ناهم‌سنخ'));
  assert.ok(guard.employmentSeparationGuardFa.includes('مسدودشدن برآورد بی‌برچسب اشتغال'));
  assert.ok(guard.deduplicationGuardFa.includes('تفکیک «واحد اقتصادی»، «شعبه»'));
});

test('Stage 60 isolates data coverage expansion from real growth, enforces network access, causal property guard, privacy, and Stage 43 separation', () => {
  const workshopBelt = INITIAL_STAGE60_PROFILES[1];
  const guard = evaluateCorridorAccessMarketAndDynamicGuards(workshopBelt, 'سناریوی فرضی', true);
  assert.ok(guard.coverageVsRealGrowthGuardFa.includes('هشدار تغییر پوشش داده'));
  assert.ok(guard.networkAccessibilityAndPlacementGuardFa.includes('تضمین سودآوری'));
  assert.ok(guard.propertyMarketCausalGuardFa.includes('رابطه علّی نیست'));
  assert.ok(guard.moduleSeparationAndPrivacyGuardFa.includes('ماژول خدمات حرفه‌ای (۴۳)'));
  assert.ok(guard.scenarioLifecycleGuardFa.includes('سناریوی فرضی'));
});
