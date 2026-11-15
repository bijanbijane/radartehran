/** @file src/features/onboarding/tests/stage57UrbanEnvironmentArchitecture.test.ts — Stage 57 Architecture & Environment Tests */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyEnvironmentScenarioBoundary,
  evaluateAirThermalAndNoiseGuards,
  evaluateGreeneryHazardsModerationAndMarketGuard,
} from '../services/urbanEnvironmentEngine';
import { INITIAL_STAGE57_PROFILES } from '../services/stage57UrbanEnvironmentFixtures';
import {
  STAGE57_ACCEPTANCE_TESTS_25,
  STAGE57_INTEGRATIONS_8,
  STAGE57_MAP_LAYERS_10,
  STAGE57_SECTIONS_13,
  STAGE57_UX_EVENTS_11,
  STAGE58_RISK_RESILIENCE_PREVIEW_AXES_12,
} from '../services/urbanEnvironmentTypes';

test('Stage 57 exposes exact counts for 13 sections, 8 integrations, 25 UI-ENV tests, 11 UX events, and Stage 58 preview', () => {
  assert.equal(STAGE57_SECTIONS_13.length, 13);
  assert.equal(STAGE57_INTEGRATIONS_8.length, 8);
  assert.equal(STAGE57_MAP_LAYERS_10.length, 10);
  assert.equal(STAGE57_ACCEPTANCE_TESTS_25.length, 25);
  assert.equal(STAGE57_ACCEPTANCE_TESTS_25[0].id, 'UI-ENV-001');
  assert.equal(STAGE57_ACCEPTANCE_TESTS_25[24].id, 'UI-ENV-025');
  assert.equal(STAGE57_UX_EVENTS_11.length, 11);
  assert.equal(STAGE58_RISK_RESILIENCE_PREVIEW_AXES_12.length, 12);
});

test('Stage 57 distinguishes missing air data from clean/zero, separates LST vs air temp, and preserves observation vs ingestion dates', () => {
  const innerAlley = INITIAL_STAGE57_PROFILES[1];
  const guard = evaluateAirThermalAndNoiseGuards(innerAlley);
  assert.equal(guard.isMissingDataNotZeroOrClean, true);
  assert.ok(guard.airStatusTextFa.includes('داده کافی موجود نیست'));
  assert.ok(guard.thermalSeparationFa.includes('LST'));
  assert.ok(guard.temporalIntegrityFa.includes('۱۴۰۴/۱۲/۲۰'));
  assert.ok(guard.noiseCaveatFa.includes('جهت‌گیری'));
});

test('Stage 57 blocks opaque single score, guards flood-safety & soil provenance, moderates citizen reports, and blocks causal price leaps', () => {
  const edge = INITIAL_STAGE57_PROFILES[0];
  const guard = evaluateGreeneryHazardsModerationAndMarketGuard(edge, false, true);
  assert.ok(guard.opaqueSingleScoreBlockedFa.includes('مسدودشدن امتیاز تک‌رقمی مبهم'));
  assert.ok(guard.floodNoRecordSafetyGuardFa.includes('ایمن قطعی'));
  assert.ok(guard.soilConfidenceBadgeFa.includes('نبود اطلاعات کافی'));
  assert.ok(guard.citizenModerationRuleFa.includes('هرگز'));
  assert.ok(guard.marketCausalBoundaryFa.includes('ممنوع'));
});

test('Stage 57 scenario boundary clearly tags non-existing proposed scenes', () => {
  const msg = classifyEnvironmentScenarioBoundary('سناریوی فرضی');
  assert.ok(msg.includes('پارک موجود'));
});
