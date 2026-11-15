/** @file src/features/onboarding/tests/stage66EnvironmentalSustainabilityArchitecture.test.ts — Stage 66 Architecture & Scientific Guard Tests */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateEnvMeasurementAndEcosystemGuards,
  evaluateThermalUrbanPressureScenarioAndIndexGuards,
} from '../services/environmentalSustainabilityEngine';
import { INITIAL_STAGE66_PROFILES } from '../services/stage66EnvironmentalFixtures';
import {
  STAGE66_ACCEPTANCE_TESTS_24,
  STAGE66_COMPOSITE_INDICES_9,
  STAGE66_DATA_PROVENANCE_TAGS_8,
  STAGE66_KEY_INDICATORS_8,
  STAGE66_LAYER_GROUPS_8,
  STAGE66_MAP_LAYERS_10,
  STAGE66_MODULES_17,
  STAGE66_QUALITY_BADGES_5,
  STAGE66_REPORT_TYPES_11,
  STAGE66_UX_METRICS_10,
  STAGE67_DEMOGRAPHIC_PREVIEW_AXES_11,
} from '../services/environmentalSustainabilityTypes';

test('Stage 66 exposes 17 modules, 10 map layers, 8 layer groups, 8 KPIs, 9 indices, 8 provenance tags, 5 quality badges, 11 reports, 24 UI-ENV66 tests, and 11 Stage 67 axes', () => {
  assert.equal(STAGE66_MODULES_17.length, 17);
  assert.equal(STAGE66_MAP_LAYERS_10.length, 10);
  assert.equal(STAGE66_LAYER_GROUPS_8.length, 8);
  assert.equal(STAGE66_KEY_INDICATORS_8.length, 8);
  assert.equal(STAGE66_COMPOSITE_INDICES_9.length, 9);
  assert.equal(STAGE66_DATA_PROVENANCE_TAGS_8.length, 8);
  assert.equal(STAGE66_QUALITY_BADGES_5.length, 5);
  assert.equal(STAGE66_REPORT_TYPES_11.length, 11);
  assert.equal(STAGE66_UX_METRICS_10.length, 10);
  assert.equal(STAGE66_ACCEPTANCE_TESTS_24.length, 24);
  assert.equal(STAGE66_ACCEPTANCE_TESTS_24[0].id, 'UI-ENV66-001');
  assert.equal(STAGE66_ACCEPTANCE_TESTS_24[23].id, 'UI-ENV66-024');
  assert.equal(STAGE67_DEMOGRAPHIC_PREVIEW_AXES_11.length, 11);
});

test('Stage 66 enforces air modeled estimate tag, seasonal imagery warning, registered!=real trees, Euclidean vs network access, corridor capacity fallback, and water lab limits', () => {
  const chitgar = INITIAL_STAGE66_PROFILES[1];
  const guard = evaluateEnvMeasurementAndEcosystemGuards(chitgar, '۱۳۹۵', '۱۴۰۵', 500);
  assert.ok(guard.airQualityOriginGuardFa.includes('برچسب الزامی «تخمینی»'));
  assert.ok(guard.airQualityOriginGuardFa.includes('عدم نمایش صفر جعلی'));
  assert.ok(guard.vegetationSeasonalAndTreeSurveyGuardFa.includes('هشدار مقایسه زمانی'));
  assert.ok(guard.vegetationSeasonalAndTreeSurveyGuardFa.includes('معادل تعداد واقعی تمام درختان محدوده نیست'));
  assert.ok(guard.parkAccessAndJusticeGuardFa.includes('شکاف دسترسی واقعی'));
  assert.ok(guard.parkAccessAndJusticeGuardFa.includes('عرضه ≠ بهره‌مندی جمعیت'));

  const niavaran = INITIAL_STAGE66_PROFILES[0];
  const ecoGuard = evaluateEnvMeasurementAndEcosystemGuards(niavaran, '۱۳۹۵', '۱۴۰۵', 500);
  assert.ok(ecoGuard.corridorAndWaterEvidenceGuardFa.includes('پهنه دارای ظرفیت اتصال اکولوژیک'));
  assert.ok(ecoGuard.corridorAndWaterEvidenceGuardFa.includes('نشان‌دهنده سلامت یا کیفیت شیمیایی آب نیست'));
});

test('Stage 66 enforces LST!=air temp, soil satellite limit, non-causal urban pressure, compare cap <=4, composite missing component guard, hypothetical scenario tag, and public export privacy', () => {
  const shoush = INITIAL_STAGE66_PROFILES[2];
  const guard = evaluateThermalUrbanPressureScenarioAndIndexGuards(shoush, 6, false, true, true);
  assert.ok(guard.thermalLstAndSoilLimitGuardFa.includes('با دمای هوای ایستگاه هواشناسی یکسان نیست'));
  assert.ok(guard.thermalLstAndSoilLimitGuardFa.includes('کافی نیستند'));
  assert.ok(guard.imperviousAndDevelopmentCausalityGuardFa.includes('معادل احتمال قطعی سیلاب نیست'));
  assert.ok(guard.imperviousAndDevelopmentCausalityGuardFa.includes('رابطه علت‌ومعلولی قطعی استنتاج نمی‌شود'));
  assert.ok(guard.neighborhoodCompareAndCompositeIndexGuardFa.includes('محدود به حداکثر ۴ محله'));
  assert.ok(guard.neighborhoodCompareAndCompositeIndexGuardFa.includes('رتبه‌بندی کلی گمراه‌کننده'));
  assert.ok(guard.neighborhoodCompareAndCompositeIndexGuardFa.includes('حذف بی‌اعلام آن'));
  assert.ok(guard.hypotheticalScenarioAndPrivacyExportGuardFa.includes('سناریوی فرضی'));
  assert.ok(guard.hypotheticalScenarioAndPrivacyExportGuardFa.includes('حالت انتشار عمومی'));
});
