/** @file src/features/onboarding/tests/stage55UrbanRegulationArchitecture.test.ts — Stage 55 Architecture & Compliance Tests */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  auditDocumentAndPrivacyAccess,
  compareTwoParcelsCompliance,
  evaluateThreeWaySeparationAndParcelCompliance,
  simulateHypotheticalDevelopmentScenarios,
} from '../services/urbanRegulationEngine';
import {
  INITIAL_STAGE55_CONSTRAINTS,
  INITIAL_STAGE55_DOCUMENTS,
  INITIAL_STAGE55_PARCELS,
} from '../services/stage55UrbanRegulationFixtures';
import {
  STAGE55_BOUNDARIES_9,
  STAGE55_DOCUMENT_CATEGORIES_10,
  STAGE55_SPECIAL_STATES_9,
  STAGE55_UX_METRICS_8,
  STAGE56_INFRASTRUCTURE_PREVIEW_AXES_10,
} from '../services/urbanRegulationTypes';

test('Stage 55 exposes exact counts for boundaries, doc categories, UX metrics, and Stage 56 preview axes', () => {
  assert.equal(STAGE55_BOUNDARIES_9.length, 9);
  assert.equal(STAGE55_DOCUMENT_CATEGORIES_10.length, 10);
  assert.equal(STAGE55_UX_METRICS_8.length, 8);
  assert.ok(STAGE55_SPECIAL_STATES_9.length >= 5);
  assert.equal(STAGE56_INFRASTRUCTURE_PREVIEW_AXES_10.length, 10);
});

test('Stage 55 enforces 3-way separation (approved rule vs observed reality vs estimate) and avoids legality judgment', () => {
  const p1 = INITIAL_STAGE55_PARCELS[0];
  const verdict = evaluateThreeWaySeparationAndParcelCompliance(p1, INITIAL_STAGE55_CONSTRAINTS, false);
  assert.ok(verdict.approvedRuleSummaryFa.includes('ضابطه مصوب'));
  assert.ok(verdict.observedRealitySummaryFa.includes('وضعیت موجود'));
  assert.ok(verdict.analyticalEstimateSummaryFa.includes('برآورد تحلیلی'));
  assert.ok(verdict.landUseDivergenceNoteFa.includes('حکم نمی‌دهد'));
  assert.ok(verdict.warningsFa.some((w) => w.includes('ممنوعیت قطعی')));
});

test('Stage 55 blocks parcel comparison when calculation basis mismatches and succeeds when normalized', () => {
  const [p1, p2] = INITIAL_STAGE55_PARCELS;
  const blocked = compareTwoParcelsCompliance(p1, p2);
  assert.equal(blocked.comparable, false);
  assert.ok(blocked.verdictFa.includes('مسدود شد'));

  const allowed = compareTwoParcelsCompliance(p1, { ...p2, calculationBasisFa: p1.calculationBasisFa });
  assert.equal(allowed.comparable, true);
  assert.equal(allowed.farGapPercent, 60);
});

test('Stage 55 hypothetical scenarios always carry hypothetical label and primary doc safeguard keeps primary text visible', () => {
  const sim = simulateHypotheticalDevelopmentScenarios({
    lotAreaSqm: 400,
    baseFarPercent: 240,
    coveragePercent: 60,
    hypotheticalFloors: 5,
    maxHeightMeters: 18,
    setbackMeters: 2,
  });
  assert.ok(sim.labelTagFa.includes('محاسبه فرضی'));
  assert.equal(sim.scenarios.length, 3);
  assert.ok(sim.disclaimerFa.includes('استعلام رسمی'));

  const audit = auditDocumentAndPrivacyAccess(INITIAL_STAGE55_DOCUMENTS[0], 'خریدار یا فروشنده', true);
  assert.equal(audit.mustKeepPrimaryTextAccessible, true);
  assert.ok(audit.displayedTextFa.includes('متن مرجع اصلی'));
  assert.equal(audit.reportSectionsCount, 12);
});
