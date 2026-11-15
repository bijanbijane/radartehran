/** @file src/features/onboarding/tests/stage68EconomicIntelligenceArchitecture.test.ts — Stage 68 Architecture & Economic Guard Tests */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateCatchmentLifecycleRealtyCapacityAndGovernance,
  evaluateEconomicDensityHubsEmploymentAndBoundaries,
} from '../services/economicIntelligenceStage68Engine';
import { INITIAL_STAGE68_PROFILES } from '../services/stage68EconomicIntelligenceFixtures';
import {
  STAGE68_ACCEPTANCE_TESTS_25,
  STAGE68_HUB_TYPES_9,
  STAGE68_KEY_INDICATORS_8,
  STAGE68_LAYER_GROUPS_7,
  STAGE68_MAP_LAYERS_10,
  STAGE68_REPORT_TYPES_15,
  STAGE68_SECTIONS_20,
  STAGE68_UX_METRICS_10,
  STAGE69_LANDUSE_PREVIEW_AXES_20,
} from '../services/economicIntelligenceStage68Types';

test('Stage 68 exposes 20 sections, 10 map layers, 7 layer groups, 8 KPIs, 9 hub types, 15 reports, 10 UX metrics, 25 UI-ECO68 checks, and 20 Stage 69 axes', () => {
  assert.equal(STAGE68_SECTIONS_20.length, 20);
  assert.equal(STAGE68_MAP_LAYERS_10.length, 10);
  assert.equal(STAGE68_LAYER_GROUPS_7.length, 7);
  assert.equal(STAGE68_KEY_INDICATORS_8.length, 8);
  assert.equal(STAGE68_HUB_TYPES_9.length, 9);
  assert.equal(STAGE68_REPORT_TYPES_15.length, 15);
  assert.equal(STAGE68_UX_METRICS_10.length, 10);
  assert.equal(STAGE68_ACCEPTANCE_TESTS_25.length, 25);
  assert.equal(STAGE68_ACCEPTANCE_TESTS_25[0].id, 'UI-ECO68-001');
  assert.equal(STAGE68_ACCEPTANCE_TESTS_25[24].id, 'UI-ECO68-025');
  assert.equal(STAGE69_LANDUSE_PREVIEW_AXES_20.length, 20);
});

test('Stage 68 enforces registered DB != city total, density != economic power, potential vs established hub, workshop separation, 3 employment metrics, and mobile clustering', () => {
  const chitgar = INITIAL_STAGE68_PROFILES[2];
  const g1 = evaluateEconomicDensityHubsEmploymentAndBoundaries(chitgar, true);
  assert.ok(g1.registeredDbVsDensityVsPowerGuardFa.includes('≠ کل واحدهای فعال شهر'));
  assert.ok(g1.registeredDbVsDensityVsPowerGuardFa.includes('≠ شاخص قدرت/تمرکز اقتصادی'));
  assert.ok(g1.hubEstablishedVsPotentialAndWorkshopGuardFa.includes('محدوده دارای ظرفیت بالقوه'));
  assert.ok(g1.hubEstablishedVsPotentialAndWorkshopGuardFa.includes('در دسته کارخانه صنعتی'));
  assert.ok(g1.employmentThreeWayAndBoundaryGuardFa.includes('شاغلان ساکن'));
  assert.ok(g1.employmentThreeWayAndBoundaryGuardFa.includes('فرصت‌های شغلی ثبت‌شده'));
  assert.ok(g1.mobileClusteringGuardFa.includes('خوشه‌بندی مکانی'));
});

test('Stage 68 enforces estimated footfall tag, unverified user closure block, name change != opening, realty correlation != causation, capacity != zoning permit, and public export privacy', () => {
  const haftChenar = INITIAL_STAGE68_PROFILES[3];
  const g2 = evaluateCatchmentLifecycleRealtyCapacityAndGovernance(haftChenar, 6, false, true);
  assert.ok(g2.catchmentNetworkAndFootfallGuardFa.includes('محدوده جذب برآوردی'));
  assert.ok(g2.lifecycleVerificationAndDedupGuardFa.includes('به‌عنوان افتتاح جدید ثبت نشد'));
  assert.ok(g2.lifecycleVerificationAndDedupGuardFa.includes('در حال بررسی'));
  assert.ok(g2.realtyCausalityAndZoningPermitGuardFa.includes('≠ علیت قطعی'));
  assert.ok(g2.realtyCausalityAndZoningPermitGuardFa.includes('به معنای مجازبودن ساخت‌وساز یا تغییر کاربری نیست'));
  assert.ok(g2.compareTransparentCompositeAndPrivacyGuardFa.includes('حداکثر ۴ محدوده'));
  assert.ok(g2.compareTransparentCompositeAndPrivacyGuardFa.includes('منع امتیاز مبهم'));
  assert.ok(g2.compareTransparentCompositeAndPrivacyGuardFa.includes('اطلاعات شخصی صاحبان کسب‌وکار'));
});
