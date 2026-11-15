/** @file src/features/onboarding/tests/stage65UrbanRiskResilienceArchitecture.test.ts — Stage 65 Architecture & Resilience Guard Tests */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateEmergencyAccessCapacityAlertAndIndexGuards,
  evaluateMultiHazardVulnerabilityAndResilience,
} from '../services/urbanRiskStage65Engine';
import { INITIAL_STAGE65_PROFILES } from '../services/stage65UrbanRiskFixtures';
import {
  STAGE65_ACCEPTANCE_TESTS_23,
  STAGE65_MAP_LAYERS_13,
  STAGE65_RESILIENCE_DIMENSIONS_5,
  STAGE65_SECTIONS_18,
  STAGE65_UX_EVENTS_12,
  STAGE66_ENVIRONMENT_PREVIEW_AXES_17,
} from '../services/urbanRiskStage65Types';

test('Stage 65 exposes 18 sections, 13 map layers, 5 resilience dimensions, 23 acceptance tests, 12 UX events, and 17 Stage 66 axes', () => {
  assert.equal(STAGE65_SECTIONS_18.length, 18);
  assert.equal(STAGE65_MAP_LAYERS_13.length, 13);
  assert.equal(STAGE65_RESILIENCE_DIMENSIONS_5.length, 5);
  assert.equal(STAGE65_ACCEPTANCE_TESTS_23.length, 23);
  assert.equal(STAGE65_ACCEPTANCE_TESTS_23[0].id, 'UI-RISK65-001');
  assert.equal(STAGE65_ACCEPTANCE_TESTS_23[22].id, 'UI-RISK65-023');
  assert.equal(STAGE65_UX_EVENTS_12.length, 12);
  assert.equal(STAGE66_ENVIRONMENT_PREVIEW_AXES_17.length, 17);
});

test('Stage 65 enforces missing data != zero hazard, blocks unsafe-by-age label, separates subsidence metrics, and restricts public infra coords', () => {
  const tajrish = INITIAL_STAGE65_PROFILES[0];
  const guard = evaluateMultiHazardVulnerabilityAndResilience(tajrish, true, true);
  assert.ok(guard.hazardVsResilienceAndMissingDataFa.includes('نبود داده هرگز به معنی نبود خطر نیست'));
  assert.ok(guard.buildingSafetyLabelGuardFa.includes('مسدودشدن برچسب «ناایمن»'));
  assert.ok(guard.subsidenceAndFloodModelGuardFa.includes('خروجی مدل سناریویی'));
  assert.ok(guard.infrastructureDependencyAndPrivacyFa.includes('در نمای عمومی محدود شد'));
});

test('Stage 65 enforces emergency route bounds, open-space theoretical capacity, incomplete score "--", alert separation, and anti-alarmist rules', () => {
  const tajrish = INITIAL_STAGE65_PROFILES[0];
  const guard = evaluateEmergencyAccessCapacityAlertAndIndexGuards(tajrish, false, true);
  assert.ok(guard.populationAndEmergencyRouteGuardFa.includes('زمان پاسخ اضطراری عملیاتی نمی‌شوند'));
  assert.ok(guard.openSpaceTheoreticalCapacityGuardFa.includes('ظرفیت قطعی پذیرش نیست'));
  assert.ok(guard.resilienceScoreCompletenessGuardFa.includes('-- (فاقد داده کافی'));
  assert.ok(guard.officialAlertAndScenarioBoundaryFa.includes('سناریوی فرضی'));
  assert.ok(guard.antiAlarmistPublicationGuardFa.includes('منع واژگان اضطراب‌زا'));
});
