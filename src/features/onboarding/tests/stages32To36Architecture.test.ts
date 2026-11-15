/** @file src/features/onboarding/tests/stages32To36Architecture.test.ts — Unit Tests for Stages 32–36 (Onboarding, Responsive, Accessibility, Motion & Data Visualization) */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_GETTING_STARTED_CHECKLIST,
  MAX_CONCURRENT_FLOATING_GUIDES,
  OnboardingProgressManager,
  SERVICES_PROVIDER_ONBOARDING_STEPS_FA,
  SERVICES_SEEKER_ONBOARDING_STEPS_FA,
  VALUATION_DISCLAIMER_FA,
  buildContextualAuthPrompt,
  classifyUserOnboardingSegment,
  evaluateOnboardingOutcomeQuality,
  resolveMapNavigationGestureHint,
  resolveZoomLockedLayerFeedback,
} from '../services/onboardingGuidanceEngine';
import {
  CrossDeviceStateContinuityEngine,
  GIS_ACCORDION_LAYER_GROUPS,
  TEST_VIEWPORT_WIDTHS_PX,
  arbitrateMapActivePanelOwner,
  classifyViewportTier,
  evaluateAdminMobileOperationSafety,
  resolveBottomSheetGeometry,
  resolveCardLayoutForContainerWidth,
  resolveMobileInputKeyboardMode,
  resolveResponsiveTableMode,
} from '../services/responsiveLayoutEngine';
import {
  ACCESSIBLE_AUTH_CONTRACT,
  CANONICAL_VOCABULARY_CONTRACT,
  NON_DRAG_SPATIAL_SELECTION_METHODS,
  RADAR_AUDITED_COLOR_PAIRS,
  TOUCH_TARGET_ACCESSIBILITY_CONTRACT,
  WCAG_22_TARGET_STANDARD,
  WCAG_TEXT_SPACING_CONTRACT,
  buildLiveRegionAnnouncement,
  buildThreePartFieldError,
  evaluateWcagContrast,
  resolveAccessibleStatusBadge,
  resolveBookmarkAccessibleName,
  resolveFocusTargetAfterRemoval,
} from '../services/accessibilityEngine';
import {
  DOMAIN_HONEST_FEEDBACK_CONTRACTS,
  MapMotionArbitrator,
  RADAR_MOTION_TOKENS,
  resolveEffectiveTokenDuration,
  resolveMapLayerTransitionFeedback,
  resolveMotionPolicy,
  transitionSaveButtonState,
} from '../services/motionSystemEngine';
import {
  BOX_PLOT_PLAIN_GUIDE_FA,
  RADAR_METRIC_REGISTRY,
  buildAnalyticsCacheKey,
  calculateAreaProportionalSymbolRadiusPx,
  calculateDistributionPercentiles,
  evaluateMetricSufficiency,
  selectChartForAnalyticalQuestion,
  validateNeighborhoodComparisonHomogeneity,
} from '../services/dataVisualizationEngine';
import {
  RADAR_QUALITY_DIMENSIONS,
  RADAR_SOURCE_TAXONOMY,
  evaluateDataFreshnessStatus,
  evaluateGeographicCoverageWithDenominator,
  evaluatePublicationRightsGate,
  evaluateScopedVerificationBadges,
} from '../services/dataTrustAndProvenanceEngine';
import {
  STAGE38_DESIGN_COMPONENT_IDS,
  detectBoundaryAndSemanticIncomparability,
  evaluateCompareTrayStatus,
  evaluateMultiCriteriaDecision,
  filterComparisonCriteriaRows,
  formatMissingOrZeroMetricCell,
  generateVerifiableDifferenceClaims,
} from '../services/comparativeDecisionEngine';
import {
  STAGE38_CRITERIA_DEFS,
  STAGE38_SAMPLE_PROPERTIES,
} from '../services/stage38ComparisonFixtures';

test('Stage 32 (RT-UI-ONBOARDING-001): segments users, enforces Skipped !== Completed, and preserves Post-Auth Continuation', () => {
  assert.equal(MAX_CONCURRENT_FLOATING_GUIDES, 1);
  assert.equal(
    classifyUserOnboardingSegment({
      isAuthenticated: false,
      priorSessionCount: 0,
      completedActionsCount: 0,
      hasUnseenFeatureVersion: false,
    }),
    'first_time_guest',
  );
  assert.equal(
    classifyUserOnboardingSegment({
      isAuthenticated: true,
      priorSessionCount: 6,
      completedActionsCount: 5,
      hasUnseenFeatureVersion: true,
    }),
    'returning_user_new_feature',
  );

  const mgr = new OnboardingProgressManager();
  assert.equal(mgr.startGuide('MAP-WELCOME-V1'), true);
  assert.equal(mgr.startGuide('MAP-LAYER-INTRO-V2'), false, 'Only 1 floating guide allowed at a time');
  mgr.skipGuide('MAP-WELCOME-V1');
  assert.equal(mgr.getGuideStatus('MAP-WELCOME-V1'), 'skipped');
  assert.notEqual(mgr.getGuideStatus('MAP-WELCOME-V1'), 'completed', 'Skipped must never be recorded as Completed');
  mgr.replayGuideFromHelpCenter('MAP-WELCOME-V1');
  assert.equal(mgr.getGuideStatus('MAP-WELCOME-V1'), 'in_progress');
  mgr.completeGuide('MAP-WELCOME-V1');
  assert.equal(mgr.getGuideStatus('MAP-WELCOME-V1'), 'completed');

  const prompt = buildContextualAuthPrompt('save_property', '/properties/tehran-99', { propertyId: '99' });
  mgr.queuePendingAuthAction(prompt.pendingContinuation);
  const resumed = mgr.consumePendingAuthActionOnLogin();
  assert.equal(resumed?.returnRoute, '/properties/tehran-99');
  assert.equal(mgr.consumePendingAuthActionOnLogin(), null);

  assert.equal(DEFAULT_GETTING_STARTED_CHECKLIST.length, 5);
  assert.equal(SERVICES_SEEKER_ONBOARDING_STEPS_FA.length, 7);
  assert.equal(SERVICES_PROVIDER_ONBOARDING_STEPS_FA.length, 6);
  assert.ok(VALUATION_DISCLAIMER_FA.includes('جایگزین کارشناسی رسمی نیست'));
  assert.equal(resolveMapNavigationGestureHint(true).interactionMode, 'touch');
  assert.equal(resolveZoomLockedLayerFeedback('پلاک', 10, 14).isLockedAtCurrentZoom, true);
  assert.equal(
    evaluateOnboardingOutcomeQuality({ guideCompletedOrSkipped: true, coreTaskCompletedIndependently: false }).trueOnboardingMastery,
    false,
  );
});

test('Stage 33 (RT-UI-RESPONSIVE-001): classifies 5 viewport tiers, 3-state bottom sheet, and preserves cross-device state', () => {
  assert.equal(TEST_VIEWPORT_WIDTHS_PX.length, 9);
  assert.equal(classifyViewportTier(320).tier, 'compact_mobile');
  assert.equal(classifyViewportTier(390).tier, 'standard_mobile');
  assert.equal(classifyViewportTier(768).tier, 'tablet_portrait');
  assert.equal(classifyViewportTier(1024).tier, 'tablet_landscape');
  assert.equal(classifyViewportTier(1440).tier, 'desktop_standard_or_wide');
  assert.equal(resolveCardLayoutForContainerWidth(352), 'compact_vertical');
  assert.equal(resolveCardLayoutForContainerWidth(640), 'split_horizontal');

  const collapsed = resolveBottomSheetGeometry('collapsed', 844, 0);
  assert.equal(collapsed.minHeightPx, 72);
  assert.equal(collapsed.maxHeightPx, 120);
  assert.equal(collapsed.innerScrollLocked, true);
  const keyboardOpen = resolveBottomSheetGeometry('half', 844, 280);
  assert.equal(keyboardOpen.snap, 'expanded');

  const panelArb = arbitrateMapActivePanelOwner('standard_mobile', 'results', 'layers');
  assert.equal(panelArb.activeOwner, 'layers');
  assert.equal(panelArb.concurrentFloatingPanelsCount, 1);
  assert.equal(GIS_ACCORDION_LAYER_GROUPS.length, 7);
  assert.equal(resolveResponsiveTableMode(390, 4, 'neighborhood_comparison'), 'selectable_column_comparison');
  assert.equal(resolveMobileInputKeyboardMode('mobile_phone').inputMode, 'tel');
  assert.equal(evaluateAdminMobileOperationSafety('gis_layer_schema_publish', 390).allowed, false);

  const engine = new CrossDeviceStateContinuityEngine({
    searchQuery: 'ونک',
    appliedFilters: { minSqm: 100 },
    selectedNeighborhoodId: 'vanak',
    mapCenter: [35.75, 51.41],
    mapZoom: 14,
    activePanelOwner: 'details',
    formDraftValues: { price: '18500' },
  });
  const rotated = engine.resizeOrRotateViewport(390, 844);
  assert.equal(rotated.stateLost, false);
  assert.equal(rotated.preservedState.searchQuery, 'ونک');
  assert.equal(rotated.preservedState.selectedNeighborhoodId, 'vanak');
});

test('Stage 34 (RT-UI-ACCESSIBILITY-001): validates WCAG 2.2 AA contrast, non-hue badges, 3-part errors, and focus recovery', () => {
  assert.equal(WCAG_22_TARGET_STANDARD.wcagVersion, '2.2');
  assert.equal(WCAG_22_TARGET_STANDARD.targetLevel, 'AA');
  assert.equal(WCAG_22_TARGET_STANDARD.claimsFullAAA, false);
  assert.equal(TOUCH_TARGET_ACCESSIBILITY_CONTRACT.wcag22MinimumPx, 24);
  assert.equal(TOUCH_TARGET_ACCESSIBILITY_CONTRACT.radarInternalMobileTargetPx, 44);
  assert.equal(WCAG_TEXT_SPACING_CONTRACT.lineHeightMultiplierMin, 1.5);

  for (const pair of RADAR_AUDITED_COLOR_PAIRS) {
    const res = evaluateWcagContrast(pair.fg, pair.bg, pair.role);
    assert.equal(res.passesAA, true, `Color pair ${pair.id} must pass WCAG 2.2 AA`);
  }

  const badge = resolveAccessibleStatusBadge('pending_review');
  assert.equal(badge.reliesOnlyOnColor, false);
  assert.equal(resolveBookmarkAccessibleName(false).accessibleNameFa, 'ذخیره این ملک');
  assert.equal(resolveBookmarkAccessibleName(true).accessibleNameFa, 'حذف این ملک از ذخیره‌ها');

  const err = buildThreePartFieldError({
    fieldLabelFa: 'متراژ ملک',
    problemFa: 'متراژ باید عددی بزرگ‌تر از صفر باشد.',
    remedyFa: 'یک عدد معتبر بین ۲۰ تا ۱۰۰۰ وارد کنید.',
  });
  assert.equal(err.isSpecificAndActionable, true);
  assert.equal(buildLiveRegionAnnouncement('search_results_count', '۱۲ نتیجه یافت شد').ariaLive, 'polite');
  assert.equal(NON_DRAG_SPATIAL_SELECTION_METHODS.length, 5);
  assert.equal(CANONICAL_VOCABULARY_CONTRACT.singleSaveActionFa, 'ذخیره');
  assert.equal(ACCESSIBLE_AUTH_CONTRACT.allowPasteInPasswordAndOtp, true);
  assert.equal(resolveFocusTargetAfterRemoval(['b', 'c'], 0).targetId, 'b');
  assert.equal(resolveFocusTargetAfterRemoval([], 0, 'empty-heading').targetType, 'empty_state_heading');
});

test('Stage 35 (RT-UI-MOTION-001) & Stage 36 (RT-UI-DATA-VIS-001): verifies motion tokens, save state machine, percentiles, and homogeneity guard', () => {
  const reducedPolicy = resolveMotionPolicy('standard', true);
  assert.equal(reducedPolicy.preferenceMode, 'reduced');
  assert.equal(resolveEffectiveTokenDuration(RADAR_MOTION_TOKENS[0], reducedPolicy), 0);

  const pendingSave = transitionSaveButtonState(false, 'click_request');
  assert.equal(pendingSave.labelFa, 'در حال ذخیره');
  assert.equal(pendingSave.isSavedConfirmed, false, 'Must not fake saved state before server confirmation');
  const failedSave = transitionSaveButtonState(false, 'server_fail_error');
  assert.equal(failedSave.isSavedConfirmed, false);
  const confirmedSave = transitionSaveButtonState(false, 'server_confirm_success');
  assert.equal(confirmedSave.isSavedConfirmed, true);
  assert.equal(confirmedSave.labelFa, 'ذخیره شد');

  const arb = new MapMotionArbitrator();
  const f1 = arb.requestNeighborhoodPan({ neighborhoodId: 'h1', nameFa: 'ونک', userIsDraggingMap: false, dataReady: true, policy: resolveMotionPolicy('standard', false) });
  const f2 = arb.requestNeighborhoodPan({ neighborhoodId: 'h2', nameFa: 'پونک', userIsDraggingMap: false, dataReady: true, policy: resolveMotionPolicy('standard', false) });
  assert.equal(f2.cancelledPreviousRequestId, f1.requestId);
  assert.equal(resolveMapLayerTransitionFeedback({ layerId: 'l1', layerTitleFa: 'بازار', phase: 'loaded_empty' }).statusMessageFa, 'داده‌ای برای این محدوده موجود نیست');
  assert.equal(DOMAIN_HONEST_FEEDBACK_CONTRACTS.valuationForbidsFakeCountingTicker, true);

  // Stage 36 checks
  const dist = calculateDistributionPercentiles([120, 140, 170, 210, 280]);
  assert.equal(dist.p50Median, 170);
  assert.equal(dist.p25, 140);
  assert.equal(dist.p75, 210);
  assert.equal(dist.iqrP75MinusP25, 70);
  assert.equal(dist.boxPlotGuideFa, BOX_PLOT_PLAIN_GUIDE_FA);
  assert.equal(calculateDistributionPercentiles([]).p50Median, null, 'Empty distribution must return null, never 0');
  assert.equal(evaluateMetricSufficiency(0, 30, null).safeValue, null);
  assert.equal(selectChartForAnalyticalQuestion('category_comparison').yAxisMustStartAtZero, true);
  assert.equal(calculateAreaProportionalSymbolRadiusPx(25, 100, 20), 10);
  assert.equal(
    validateNeighborhoodComparisonHomogeneity(
      { dataOrigin: 'asking_price', unitFa: 'میلیون تومان', periodFa: 'مهر ۱۴۰۵' },
      { dataOrigin: 'transaction_price', unitFa: 'میلیون تومان', periodFa: 'مهر ۱۴۰۵' },
    ).comparable,
    false,
  );
  assert.ok(buildAnalyticsCacheKey({ metricId: RADAR_METRIC_REGISTRY[0].id, geographyId: 'tehran', periodKey: '1405-07', propertyType: 'residential', dataOrigin: 'asking_price', methodologyVersion: 'v4.2' }).includes('v4.2'));

  // Stage 37 (RT-UI-DATA-TRUST-001) checks
  assert.equal(RADAR_SOURCE_TAXONOMY.length, 8);
  assert.equal(RADAR_QUALITY_DIMENSIONS.length, 12);
  const unknownFreshness = evaluateDataFreshnessStatus({ dataType: 'market_index', timestamps: {} });
  assert.equal(unknownFreshness.status, 'Unknown', 'Missing timestamp must return Unknown, never Current');
  const partialVerification = evaluateScopedVerificationBadges({
    sourceId: 'SRC-02',
    schemaValid: true,
    provenanceActivityCount: 7,
    scopedVerifications: [{ scope: 'coordinates_geometry', evidenceIds: ['ev1'], reviewedAtIso: '2026-11-12T00:00:00Z' }],
  });
  assert.equal(partialVerification.allowsFullRecordVerifiedClaim, false, 'Coordinates-only verification must not claim full record verified');
  const covVsSuff = evaluateGeographicCoverageWithDenominator({
    coveredUnits: 30,
    totalUnits: 35,
    denominatorType: 'neighborhood_count',
    uniqueSampleCountInArea: 4,
    minRequiredSamplesForIndex: 10,
  });
  assert.equal(covVsSuff.coveragePct >= 80, true);
  assert.equal(covVsSuff.isStatisticallySufficient, false, 'High geographic coverage with low samples must not be marked statistically sufficient');
  assert.equal(evaluatePublicationRightsGate('Unknown Rights').canDisplayPublicly, false, 'Unknown rights must never default to public display');

  // Stage 38 (RT-UI-COMPARE-001) checks
  assert.equal(STAGE38_DESIGN_COMPONENT_IDS.length, 18);
  assert.equal(evaluateCompareTrayStatus('property_to_property', 0).canStartComparison, false);
  assert.equal(evaluateCompareTrayStatus('property_to_property', 4).status, 'at_capacity');
  assert.equal(formatMissingOrZeroMetricCell(null, 'متر').displayTextFa, 'اطلاعات ثبت نشده');
  const diffOnlyRows = filterComparisonCriteriaRows({
    criteria: STAGE38_CRITERIA_DEFS,
    options: STAGE38_SAMPLE_PROPERTIES,
    viewMode: 'differences_only',
    selectedCriteriaIds: [],
  });
  assert.equal(diffOnlyRows.some((r) => r.id === 'parking'), false, 'Identical parking row must be hidden in differences_only mode');
  const incomp = detectBoundaryAndSemanticIncomparability(STAGE38_SAMPLE_PROPERTIES);
  assert.equal(incomp.hasWarning, true, 'Mixed boundary versions and stale data must raise warning');
  assert.ok(generateVerifiableDifferenceClaims(STAGE38_SAMPLE_PROPERTIES, STAGE38_CRITERIA_DEFS).length > 0);
  const mcda = evaluateMultiCriteriaDecision({
    options: STAGE38_SAMPLE_PROPERTIES,
    criteria: STAGE38_CRITERIA_DEFS,
    weightsPctByCriterion: { asking_price_sqm: 50, area_sqm: 30, transit_access: 20 },
  });
  assert.equal(mcda.results.length, 3);
  assert.ok(mcda.results[0].weightedScore0To100 >= mcda.results[1].weightedScore0To100);
});

