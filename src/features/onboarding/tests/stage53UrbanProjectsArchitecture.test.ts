/** @file src/features/onboarding/tests/stage53UrbanProjectsArchitecture.test.ts — Stage 53 Invariant Tests */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  compareUrbanProjectsSafely,
  evaluateProjectEvidenceAndStatus,
  evaluateProjectProgressAndFinancials,
  evaluateSpatialFootprintImpactAndMarketGuard,
  submitFieldReportAndPrivacyGate,
} from '../services/urbanProjectsEngine';
import { INITIAL_STAGE53_PROJECTS } from '../services/stage53UrbanProjectsFixtures';
import {
  STAGE53_BOUNDARIES_8,
  STAGE53_CRITICAL_CONTROLS_5,
  STAGE53_UP_COMPONENT_IDS_50,
  STAGE53_UX_EVENTS_18,
  STAGE54_BUILT_ENV_AXES_25,
} from '../services/urbanProjectsTypes';

test('Stage 53 catalogs expose 8 boundaries, 50 UP components, 18 UX events, 5 controls & Stage 54 preview', () => {
  assert.equal(STAGE53_BOUNDARIES_8.length, 8);
  assert.equal(STAGE53_UP_COMPONENT_IDS_50.length, 50);
  assert.equal(STAGE53_UX_EVENTS_18.length, 18);
  assert.equal(STAGE53_CRITICAL_CONTROLS_5.length, 5);
  assert.ok(STAGE54_BUILT_ENV_AXES_25.length >= 5);
});

test('Stage 53 blocks official promotion from news, field reports, same-user review, or unreviewed AI', () => {
  const newsProject = INITIAL_STAGE53_PROJECTS[1];
  const fromNews = evaluateProjectEvidenceAndStatus({
    project: newsProject,
    evidenceKind: 'خبر رسانه‌ای',
    registeredByUserId: 'editor-01',
    reviewerUserId: 'reviewer-02',
    targetStatus: 'در حال اجرا',
  });
  assert.equal(fromNews.officialPromotionBlocked, true);
  assert.equal(fromNews.effectiveStatus, 'اعلام‌شده');

  const fromAi = evaluateProjectEvidenceAndStatus({
    project: newsProject,
    evidenceKind: 'خروجی هوش مصنوعی بدون بازبین',
    registeredByUserId: 'editor-01',
    reviewerUserId: 'reviewer-02',
    targetStatus: 'تصویب‌شده',
  });
  assert.equal(fromAi.officialPromotionBlocked, true);
  assert.equal(fromAi.effectiveStatus, 'نامشخص');

  const railProject = INITIAL_STAGE53_PROJECTS[0];
  const samePerson = evaluateProjectEvidenceAndStatus({
    project: railProject,
    evidenceKind: 'سند رسمی تأییدشده',
    registeredByUserId: 'editor-01',
    reviewerUserId: 'editor-01',
    targetStatus: 'تکمیل‌شده',
  });
  assert.equal(samePerson.officialPromotionBlocked, true);
  assert.equal(samePerson.preservesMultiPhaseIndependence, true);
});

test('Stage 53 suppresses synthetic progress bars, exposes progress conflicts, and keeps financial figures separate', () => {
  const railEval = evaluateProjectProgressAndFinancials(INITIAL_STAGE53_PROJECTS[0]);
  assert.equal(railEval.showsSyntheticProgressBar, true);
  assert.equal(railEval.hasProgressConflict, true);
  assert.equal(railEval.collapsedIntoSingleCostNumber, false);
  assert.equal(railEval.usesNominalValuesUnlessDeflatorDeclared, true);

  const newsEval = evaluateProjectProgressAndFinancials(INITIAL_STAGE53_PROJECTS[1]);
  assert.equal(newsEval.showsSyntheticProgressBar, false);
  assert.match(newsEval.progressDisplayFa, /منتشر نشده است/);
});

test('Stage 53 separates execution footprint vs effect zone and blocks unverified causal or attribution claims', () => {
  const rail = INITIAL_STAGE53_PROJECTS[0];
  const guard = evaluateSpatialFootprintImpactAndMarketGuard({
    project: rail,
    relationKind: 'داخل محدوده اثر انتخابی',
    geometryOverlapPercent: 34,
    observedBuildingChangeNearby: true,
    hasIndependentAttributionEvidence: false,
  });
  assert.equal(guard.executionFootprintSeparateFromEffectZone, true);
  assert.equal(guard.claimsGuaranteedPriceIncrease, false);
  assert.equal(guard.zoningAutoChangedByNearbyPlan, false);
  assert.equal(guard.geometricAlignmentRepresentsPhysicalProgress, false);
  assert.equal(guard.observedChangeAttributedToProject, false);
  assert.equal(guard.beforeAfterProvesCausality, false);
});

test('Stage 53 enforces observation vs interpretation, privacy redaction, restricted doc gate, and non-ranking compare', () => {
  const rail = INITIAL_STAGE53_PROJECTS[0];
  const gate = submitFieldReportAndPrivacyGate({
    project: rail,
    observationFa: 'گودبرداری مشاهده شد',
    interpretationFa: 'پروژه تمام شده است',
    facesAndPlatesRedacted: true,
    userRole: 'logged_in_user',
    documentToAccess: rail.documents[1], // محرمانه
  });
  assert.equal(gate.observationKeptSeparateFromInterpretation, true);
  assert.equal(gate.mutatesOfficialStatusDirectly, false);
  assert.equal(gate.canDownloadDocument, false);

  const cmp = compareUrbanProjectsSafely(INITIAL_STAGE53_PROJECTS);
  assert.equal(cmp.ranksNeighborhoodQualityByProjectCount, false);
  assert.equal(cmp.rows.length, 2);
});
