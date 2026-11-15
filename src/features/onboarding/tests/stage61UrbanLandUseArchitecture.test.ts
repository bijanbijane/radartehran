/** @file src/features/onboarding/tests/stage61UrbanLandUseArchitecture.test.ts — Stage 61 Architecture & Three-Layer Tests */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateMixCompatibilityVacantAndValuationGuards,
  evaluateThreeLayerSeparationAndConflictGuard,
} from '../services/urbanLandUseEngine';
import { INITIAL_STAGE61_PROFILES } from '../services/stage61UrbanLandUseFixtures';
import {
  STAGE61_ACCEPTANCE_TESTS_30,
  STAGE61_CATEGORIES_17,
  STAGE61_MAP_LAYERS_14,
  STAGE61_SECTIONS_16,
  STAGE61_UX_EVENTS_14,
  STAGE62_MORPHOLOGY_PREVIEW_AXES_16,
} from '../services/urbanLandUseTypes';

test('Stage 61 exposes 16 sections, 14 layers, 17 categories, 30 UI-LU tests, 14 UX events, and 16 Stage 62 axes', () => {
  assert.equal(STAGE61_SECTIONS_16.length, 16);
  assert.equal(STAGE61_MAP_LAYERS_14.length, 14);
  assert.equal(STAGE61_CATEGORIES_17.length, 17);
  assert.equal(STAGE61_ACCEPTANCE_TESTS_30.length, 30);
  assert.equal(STAGE61_ACCEPTANCE_TESTS_30[0].id, 'UI-LU-001');
  assert.equal(STAGE61_ACCEPTANCE_TESTS_30[29].id, 'UI-LU-030');
  assert.equal(STAGE61_UX_EVENTS_14.length, 14);
  assert.equal(STAGE62_MORPHOLOGY_PREVIEW_AXES_16.length, 16);
});

test('Stage 61 keeps 3 land-use layers separate, blocks auto violation verdict, preserves conflicts, and enforces color/confidence separation', () => {
  const mixed = INITIAL_STAGE61_PROFILES[0];
  const guard = evaluateThreeLayerSeparationAndConflictGuard(mixed, true, true);
  assert.ok(guard.threeLayersComparisonFa.includes('مصوب'));
  assert.ok(guard.threeLayersComparisonFa.includes('ثبت‌شده'));
  assert.ok(guard.threeLayersComparisonFa.includes('استفاده مشاهده‌شده'));
  assert.ok(guard.violationVerdictGuardFa.includes('مسدودشدن برچسب خودکار تخلف'));
  assert.ok(guard.registeredConflictAndLegalGuardFa.includes('تعارض سوابق ثبتی'));
  assert.ok(guard.visualColorConfidenceRuleFa.includes('مسدودشدن ادغام بصری رنگ و اعتبار'));
});

test('Stage 61 separates parcel vs building floors, proximity vs conflict, vacant vs underutilized/buildable, and unvalidated valuation inputs', () => {
  const vacant = INITIAL_STAGE61_PROFILES[1];
  const guard = evaluateMixCompatibilityVacantAndValuationGuards(vacant, true, true);
  assert.ok(guard.mixAndBuildingSplitFa.includes('سطح قطعه ≠ عملکرد طبقات'));
  assert.ok(guard.compatibilityBoundaryFa.includes('صرف هم‌جواری دو عملکرد'));
  assert.ok(guard.vacantDevelopabilityGuardFa.includes('زمین خالی ≠ زمین کم‌استفاده'));
  assert.ok(guard.vacantDevelopabilityGuardFa.includes('لزوماً قابل ساخت نیست'));
  assert.ok(guard.changeHistoryAndValuationGuardFa.includes('مسدودشدن ورود بی‌برچسب به موتور ارزش‌گذاری'));
});
