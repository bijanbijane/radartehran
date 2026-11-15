/** @file src/features/onboarding/tests/stage64UrbanMobilityArchitecture.test.ts — Stage 64 Architecture & Multimodal Guard Tests */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateNetworkTransitAndMultimodalGuards,
  evaluateTrafficParkingOdPrivacyAndValuationGuards,
} from '../services/urbanMobilityEngine';
import { INITIAL_STAGE64_PROFILES } from '../services/stage64UrbanMobilityFixtures';
import {
  STAGE64_ACCEPTANCE_TESTS_30,
  STAGE64_MAP_LAYERS_12,
  STAGE64_SECTIONS_17,
  STAGE64_TEMPORAL_STATES_5,
  STAGE64_UX_EVENTS_16,
  STAGE65_REGENERATION_PREVIEW_AXES_16,
} from '../services/urbanMobilityTypes';

test('Stage 64 exposes 17 sections, 12 map layers, 5 temporal states, 30 UI-MOB tests, 16 UX events, and 16 Stage 65 axes', () => {
  assert.equal(STAGE64_SECTIONS_17.length, 17);
  assert.equal(STAGE64_MAP_LAYERS_12.length, 12);
  assert.equal(STAGE64_TEMPORAL_STATES_5.length, 5);
  assert.equal(STAGE64_ACCEPTANCE_TESTS_30.length, 30);
  assert.equal(STAGE64_ACCEPTANCE_TESTS_30[0].id, 'UI-MOB-001');
  assert.equal(STAGE64_ACCEPTANCE_TESTS_30[29].id, 'UI-MOB-030');
  assert.equal(STAGE64_UX_EVENTS_16.length, 16);
  assert.equal(STAGE65_REGENERATION_PREVIEW_AXES_16.length, 16);
});

test('Stage 64 separates distance vs walk access, schedule vs observed, wait/transfer inclusion, and ranking criterion', () => {
  const enghelab = INITIAL_STAGE64_PROFILES[0];
  const full = evaluateNetworkTransitAndMultimodalGuards(enghelab, true);
  assert.ok(full.distanceVsAccessTimeFa.includes('180'));
  assert.ok(full.interchangeOperationalGapFa.includes('اتصال اسمی'));
  assert.ok(full.scheduleVsObservedFa.includes('4'));
  assert.ok(full.scheduleVsObservedFa.includes('7'));
  assert.ok(full.multimodalTotalTimeBreakdownFa.includes('38 دقیقه'));
  assert.ok(full.bestRouteCriterionGuardFa.includes('کوتاه‌ترین زمان کل'));

  const blocked = evaluateNetworkTransitAndMultimodalGuards(enghelab, false);
  assert.ok(blocked.multimodalTotalTimeBreakdownFa.includes('مسدودشدن نمایش ناقص'));
});

test('Stage 64 guards live traffic, parking occupancy, freight legal permit, OD k-anonymity, and valuation bounds', () => {
  const tehransar = INITIAL_STAGE64_PROFILES[1];
  const guard = evaluateTrafficParkingOdPrivacyAndValuationGuards(tehransar, true, true);
  assert.ok(guard.temporalAndLiveTrafficGuardFa.includes('نبود منبع عملیاتی لحظه‌ای'));
  assert.ok(guard.parkingAndFreightBoundaryFa.includes('تعداد جای پارک آزاد'));
  assert.ok(guard.parkingAndFreightBoundaryFa.includes('مجوز قانونی تردد'));
  assert.ok(guard.odPrivacyAndNoRouteHistoryFa.includes('مسدودشدن انتشار جریان خرد'));
  assert.ok(guard.dayTypeComparisonAndResilienceFa.includes('هشدار هم‌سنخی زمانی'));
  assert.ok(guard.propertyValuationBoundaryFa.includes('مسدودشدن قیمت‌گذاری خودکار'));
});
