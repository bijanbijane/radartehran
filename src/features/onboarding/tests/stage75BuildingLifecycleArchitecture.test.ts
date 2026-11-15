/** @file src/features/onboarding/tests/stage75BuildingLifecycleArchitecture.test.ts — Stage 75 Architecture & Structural Safety Guard Tests */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STAGE75_MANDATED_MISSING_STRUCTURAL_TEXT,
  evaluateAgeVisibleAndStructural,
  evaluateRiskValuationAndPrivacy,
} from '../services/buildingLifecycleStage75Engine';
import { INITIAL_STAGE75_BUILDING_PROFILES } from '../services/stage75BuildingLifecycleFixtures';
import {
  STAGE75_ACCEPTANCE_TESTS_45,
  STAGE75_FILTER_FIELDS_13,
  STAGE75_INTERVENTION_TYPES_8,
  STAGE75_KPI_CARDS_8,
  STAGE75_REPORT_TYPES_10,
  STAGE75_SECTIONS_12,
  STAGE76_RESIDENTIAL_LIVABILITY_PREVIEW_AXES_12,
} from '../services/buildingLifecycleStage75Types';

test('Stage 75 exposes 12 sections, 8 KPIs, 13 filters, 8 intervention types, 10 reports, 45 UI-BLD75 checks, and 12 Stage 76 axes', () => {
  assert.equal(STAGE75_SECTIONS_12.length, 12);
  assert.equal(STAGE75_KPI_CARDS_8.length, 8);
  assert.equal(STAGE75_FILTER_FIELDS_13.length, 13);
  assert.equal(STAGE75_INTERVENTION_TYPES_8.length, 8);
  assert.equal(STAGE75_REPORT_TYPES_10.length, 10);
  assert.equal(STAGE75_ACCEPTANCE_TESTS_45.length, 45);
  assert.equal(STAGE75_ACCEPTANCE_TESTS_45[0].id, 'UI-BLD75-001');
  assert.equal(STAGE75_ACCEPTANCE_TESTS_45[44].id, 'UI-BLD75-045');
  assert.equal(STAGE76_RESIDENTIAL_LIVABILITY_PREVIEW_AXES_12.length, 12);
});

test('Stage 75 enforces age != deterioration, visible != structural, mandated missing structural wording, MEP install != repair dates, and missing record != no maintenance', () => {
  const unknownOld = INITIAL_STAGE75_BUILDING_PROFILES[2];
  const r1 = evaluateAgeVisibleAndStructural(unknownOld, true, true);
  assert.ok(r1.ageVsDeteriorationAndMissingZeroGuardFa.includes('هرگز صفر نمایش داده نمی‌شود'));
  assert.ok(r1.ageVsDeteriorationAndMissingZeroGuardFa.includes('سن ساختمان به‌تنهایی شاخص فرسودگی نیست'));
  assert.ok(r1.structuralSafetyMandatedGuardFa.includes(STAGE75_MANDATED_MISSING_STRUCTURAL_TEXT));
  assert.ok(r1.mepAndMaintenanceRecordGuardFa.includes('«فاقد سابقه نگهداری» ≠ «بدون نگهداری»'));

  const wellMaintained40Yr = INITIAL_STAGE75_BUILDING_PROFILES[0];
  const rGood = evaluateAgeVisibleAndStructural(wellMaintained40Yr, true, true);
  assert.ok(rGood.ageVsDeteriorationAndMissingZeroGuardFa.includes('به‌معنای تأیید ایمنی سازه نیست'));
  assert.ok(rGood.mepAndMaintenanceRecordGuardFa.includes('نصب تأسیسات'));
  assert.ok(rGood.mepAndMaintenanceRecordGuardFa.includes('آخرین سرویس'));
});

test('Stage 75 enforces 3-way risk split, red priority != unsafe, single Hedonic engine integration, and PII/telemetry redaction', () => {
  const poor10Yr = INITIAL_STAGE75_BUILDING_PROFILES[1];
  const r2 = evaluateRiskValuationAndPrivacy(poor10Yr, true, true);
  assert.ok(r2.threeRiskSplitAndPriorityNotUnsafeGuardFa.includes('عمر و استهلاک ظاهری ≠ ضعف سازه‌ای ≠ اولویت بررسی'));
  assert.ok(r2.threeRiskSplitAndPriorityNotUnsafeGuardFa.includes('رنگ قرمز به‌طور خودکار به معنای «ساختمان ناایمن» نیست'));
  assert.ok(r2.valuationHedonicIntegrationGuardFa.includes('بدون موتور ارزش‌گذاری موازی'));
  assert.ok(r2.privacyTelemetryAndVerificationTagGuardFa.includes('گزارش‌شده، تأییدنشده'));
  assert.ok(r2.privacyTelemetryAndVerificationTagGuardFa.includes('در خروجی عمومی و Telemetry ثبت نمی‌شود'));
});
