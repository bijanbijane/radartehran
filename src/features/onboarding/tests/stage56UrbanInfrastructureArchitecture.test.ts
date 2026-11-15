/** @file src/features/onboarding/tests/stage56UrbanInfrastructureArchitecture.test.ts — Stage 56 Architecture & Accessibility Tests */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateCapacityJusticeAndHistory,
  evaluateLayersAccessibilityAndPrivacy,
  simulateInfrastructureScenario,
} from '../services/urbanInfrastructureEngine';
import { INITIAL_STAGE56_PROFILES } from '../services/stage56UrbanInfrastructureFixtures';
import {
  STAGE56_ACCEPTANCE_TESTS_18,
  STAGE56_INTEGRATIONS_5,
  STAGE56_MAP_LAYERS_10,
  STAGE56_SECTIONS_12,
  STAGE56_UX_EVENTS_10,
  STAGE57_ENVIRONMENT_PREVIEW_AXES_10,
} from '../services/urbanInfrastructureTypes';

test('Stage 56 exposes exact counts for 12 sections, 5 integrations, 10 map layers, 18 acceptance checks, and Stage 57 preview', () => {
  assert.equal(STAGE56_SECTIONS_12.length, 12);
  assert.equal(STAGE56_INTEGRATIONS_5.length, 5);
  assert.equal(STAGE56_MAP_LAYERS_10.length, 10);
  assert.equal(STAGE56_ACCEPTANCE_TESTS_18.length, 18);
  assert.equal(STAGE56_ACCEPTANCE_TESTS_18[0].id, 'UI-INF-001');
  assert.equal(STAGE56_ACCEPTANCE_TESTS_18[17].id, 'UI-INF-018');
  assert.equal(STAGE56_UX_EVENTS_10.length, 10);
  assert.equal(STAGE57_ENVIRONMENT_PREVIEW_AXES_10.length, 10);
});

test('Stage 56 enforces layer clutter warning (>3 layers), network isochrones, missing-data guard, and security redaction', () => {
  const chitgar = INITIAL_STAGE56_PROFILES[1];
  const evalResult = evaluateLayersAccessibilityAndPrivacy(chitgar, 5, 'حمل‌ونقل عمومی', 15, 'کاربر عمومی');
  assert.equal(evalResult.layerClutterBlocked, true);
  assert.ok(evalResult.isochroneMethodNoteFa.includes('شبکه واقعی'));
  assert.ok(evalResult.missingDataSeparationFa.includes('نامشخص به علت کمبود داده'));
  assert.ok(evalResult.publicSecurityGateFa.includes('مسدود شدند'));
});

test('Stage 56 evaluates capacity sufficiency honestly without faking missing population or operational metrics', () => {
  const narmak = INITIAL_STAGE56_PROFILES[0];
  const cap1 = evaluateCapacityJusticeAndHistory(narmak);
  assert.equal(cap1.sufficiencyLevel, 'احتمال فشار بر ظرفیت');
  assert.ok(cap1.spatialJusticeBreakdownFa.includes('چندبعدی'));
  assert.ok(cap1.historicalDateIntegrityFa.includes('۱۴۰۴/۱۱/۰۳'));

  const chitgar = INITIAL_STAGE56_PROFILES[1];
  const cap2 = evaluateCapacityJusticeAndHistory(chitgar);
  assert.equal(cap2.sufficiencyLevel, 'اطلاعات ناکافی برای ارزیابی');
  assert.ok(cap2.educationLimitNoteFa.includes('ممنوع'));
});

test('Stage 56 hypothetical scenario simulator labels simulation clearly and avoids false real claims', () => {
  const narmak = INITIAL_STAGE56_PROFILES[0];
  const sim = simulateInfrastructureScenario(narmak, {
    populationDeltaPercent: 15,
    addedHealthCenters: 1,
    addedTransitLines: 1,
    addedCapacityPercent: 10,
  });
  assert.ok(sim.badgeFa.includes('برآورد فرضی'));
  assert.ok(sim.boundaryNoticeFa.includes('مطالعات مهندسی'));
});
