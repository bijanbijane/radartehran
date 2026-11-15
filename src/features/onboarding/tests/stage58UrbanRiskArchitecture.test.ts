/** @file src/features/onboarding/tests/stage58UrbanRiskArchitecture.test.ts — Stage 58 Architecture & Epistemic Tests */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateEmergencyAccessInfrastructureAndTimelineGuards,
  evaluateHazardVsBuildingSeismicGuard,
  evaluateSubsidenceFloodFireSlopeAndEventsGuards,
} from '../services/urbanRiskEngine';
import { INITIAL_STAGE58_PROFILES } from '../services/stage58UrbanRiskFixtures';
import {
  STAGE58_ACCEPTANCE_TESTS_28,
  STAGE58_CONCEPTUAL_PILLARS_5,
  STAGE58_INTEGRATIONS_9,
  STAGE58_MAP_LAYERS_10,
  STAGE58_SECTIONS_14,
  STAGE58_UX_EVENTS_12,
  STAGE59_DEMOGRAPHICS_PREVIEW_AXES_13,
} from '../services/urbanRiskTypes';

test('Stage 58 exposes 5 pillars, 14 sections, 9 integrations, 10 map layers, 28 UI-RISK tests, 12 UX events, and 13 Stage 59 axes', () => {
  assert.equal(STAGE58_CONCEPTUAL_PILLARS_5.length, 5);
  assert.equal(STAGE58_SECTIONS_14.length, 14);
  assert.equal(STAGE58_INTEGRATIONS_9.length, 9);
  assert.equal(STAGE58_MAP_LAYERS_10.length, 10);
  assert.equal(STAGE58_ACCEPTANCE_TESTS_28.length, 28);
  assert.equal(STAGE58_ACCEPTANCE_TESTS_28[0].id, 'UI-RISK-001');
  assert.equal(STAGE58_ACCEPTANCE_TESTS_28[27].id, 'UI-RISK-028');
  assert.equal(STAGE58_UX_EVENTS_12.length, 12);
  assert.equal(STAGE59_DEMOGRAPHICS_PREVIEW_AXES_13.length, 13);
});

test('Stage 58 blocks opaque combined single score and avoids deterministic building verdict without engineering assessment', () => {
  const baharestan = INITIAL_STAGE58_PROFILES[0];
  const guard = evaluateHazardVsBuildingSeismicGuard(baharestan, true);
  assert.ok(guard.unifiedSingleScoreGuardFa.includes('مسدودشدن امتیاز واحد ترکیبی'));
  assert.ok(guard.hazardVsVulnerabilitySeparationFa.includes('تفکیک'));
  assert.ok(guard.buildingAssessmentRuleFa.includes('جایگزین بررسی مهندسی نمی‌شود'));
});

test('Stage 58 guards subsidence-to-building leap, missing flood/fire records, slope instability, and unverified rumor boundaries', () => {
  const baharestan = INITIAL_STAGE58_PROFILES[0];
  const shahrak = INITIAL_STAGE58_PROFILES[1];

  const bGuard = evaluateSubsidenceFloodFireSlopeAndEventsGuards(baharestan, true);
  assert.ok(bGuard.floodNonRecordGuardFa.includes('ایمن قطعی'));
  assert.ok(bGuard.firePrivacyAndMissingSystemGuardFa.includes('نبود واقعی آن'));
  assert.ok(bGuard.firePrivacyAndMissingSystemGuardFa.includes('محدود شده'));
  assert.ok(bGuard.slopeInstabilityGuardFa.includes('رانش قطعی'));
  assert.ok(bGuard.otherEventsVerificationGuardFa.includes('شایعات'));

  const sGuard = evaluateSubsidenceFloodFireSlopeAndEventsGuards(shahrak, true);
  assert.ok(sGuard.subsidenceBuildingGuardFa.includes('۱۸ میلی‌متر در سال') || sGuard.subsidenceBuildingGuardFa.includes('18'));
  assert.ok(sGuard.subsidenceBuildingGuardFa.includes('تشخیص قطعی نشست'));
});

test('Stage 58 distinguishes normal vs emergency travel time, separates 4 dates, handles source conflicts, and marks crisis simulator as research-only', () => {
  const shahrak = INITIAL_STAGE58_PROFILES[1];
  const guard = evaluateEmergencyAccessInfrastructureAndTimelineGuards(shahrak, true);
  assert.ok(guard.emergencyAccessScenarioGuardFa.includes('تحلیل سناریو / شبیه‌سازی'));
  assert.ok(guard.responseCapacityCaveatFa.includes('تضمین‌کننده دریافت خدمت'));
  assert.ok(guard.fourDateSeparationFa.includes('۱۴۰۴/۰۱/۲۴'));
  assert.ok(guard.fourDateSeparationFa.includes('۱۴۰۵/۰۲/۱۴'));
  assert.ok(guard.sourceConflictResolutionFa.includes('تعارض منابع فعال'));
  assert.ok(guard.crisisScenarioDisclaimerFa.includes('ابزار پژوهش و تحلیل است، نه سامانه فرماندهی بحران'));
});
