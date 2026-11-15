/** @file src/features/onboarding/tests/stage81UrbanLandMarketArchitecture.test.ts — Stage 81 Urban Land Market & RLV Tests */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateLandSharePct,
  calculateResidualLandValue,
  evaluateParcelUseAndCapacity,
  evaluateVacantRlvInfraAndPrivacy,
} from '../services/urbanLandMarketStage81Engine';
import { INITIAL_STAGE81_LAND_PROFILES } from '../services/stage81UrbanLandFixtures';
import {
  STAGE81_ACCEPTANCE_TESTS_60,
  STAGE81_ATLAS_LAYERS_15,
  STAGE81_FILTERS_14,
  STAGE81_KPI_CARDS_16,
  STAGE81_REPORT_TYPES_18,
  STAGE81_SECTIONS_24,
  STAGE82_REGENERATION_PREVIEW_AXES_15,
} from '../services/urbanLandMarketStage81Types';

test('Stage 81 exposes 24 sections, 16 KPIs, 14 filters, 15 atlas layers, 18 reports, 60 UI-LND81 tests, and 15 Stage 82 axes', () => {
  assert.equal(STAGE81_SECTIONS_24.length, 24);
  assert.equal(STAGE81_KPI_CARDS_16.length, 16);
  assert.equal(STAGE81_FILTERS_14.length, 14);
  assert.equal(STAGE81_ATLAS_LAYERS_15.length, 15);
  assert.equal(STAGE81_REPORT_TYPES_18.length, 18);
  assert.equal(STAGE81_ACCEPTANCE_TESTS_60.length, 60);
  assert.equal(STAGE81_ACCEPTANCE_TESTS_60[0].id, 'UI-LND81-001');
  assert.equal(STAGE81_ACCEPTANCE_TESTS_60[59].id, 'UI-LND81-060');
  assert.equal(STAGE82_REGENERATION_PREVIEW_AXES_15.length, 15);
});

test('Stage 81 separates 4 entities, 3 uses, 3 capacities, area mismatches, and hypothetical vs legal subdivision', () => {
  const valiasr = INITIAL_STAGE81_LAND_PROFILES[0];
  const res = evaluateParcelUseAndCapacity(valiasr);
  assert.ok(res.fourEntitiesAndPriceBasisGuardFa.includes('قطعه زمین ≠ کاربری ≠ مالکیت ≠ ارزش اقتصادی'));
  assert.ok(res.threeUsesAndThreeCapacitiesGuardFa.includes('ظرفیت نظری (480%) ≠ قانونی (360%) ≠ اقتصادی (320%)'));
  assert.ok(res.areaMismatchAndHypotheticalSubdivisionGuardFa.includes('تفکیک فرضی ≠ افراز و تفکیک ثبتی قانونی'));
});

test('Stage 81 computes SL & RLV, distinguishes vacant vs parking/park, flags metro correlation != causation, and guards PII', () => {
  assert.equal(Number(calculateLandSharePct(60, 100).toFixed(1)), 60);
  assert.equal(calculateResidualLandValue(300, 110, 20, 15, 35), 120);

  const ecological = INITIAL_STAGE81_LAND_PROFILES[2];
  const rEco = evaluateVacantRlvInfraAndPrivacy(ecological, 300, 110, 20, 15, 35, true);
  assert.ok(rEco.vacantVsUnderutilizedAndParkGuardFa.includes('پارکینگ روباز و کارگاه فعال زمین بایر نیستند'));
  assert.ok(rEco.infraCausality3DAndPiiPrivacyGuardFa.includes('همبستگی رشد قیمت زمین با توسعه زیرساخت الزاماً علیت قطعی نیست'));
  assert.ok(rEco.infraCausality3DAndPiiPrivacyGuardFa.includes('حذف شده و مدل‌های سه‌بعدی مرجع رسمی ثبتی نیستند'));
});
