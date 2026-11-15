/** @file src/features/onboarding/tests/stage52UrbanDataAtlasArchitecture.test.ts — Stage 52 Invariant Tests */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  compareUrbanDatasetsByPurpose,
  detectLayerCombinationPrivacyRisk,
  evaluateDatasetAccessAndActions,
  evaluateReviewScheduleAndVersionRollback,
  evaluateSourceConflictResolution,
  runDatasetQualityAuditWorkbench,
  submitCitizenProposalAndDataGapCheck,
} from '../services/urbanDataAtlasEngine';
import {
  INITIAL_STAGE52_CONFLICTS,
  INITIAL_STAGE52_DATASETS,
} from '../services/stage52UrbanAtlasFixtures';
import {
  STAGE52_BOUNDARIES_8,
  STAGE52_UA_COMPONENT_IDS_45,
  STAGE52_UX_EVENTS_17,
} from '../services/urbanDataAtlasTypes';

test('Stage 52 catalogs include 8 boundaries, 45 UA components, 17 UX events & 3 provenance roles/dates', () => {
  assert.equal(STAGE52_BOUNDARIES_8.length, 8);
  assert.equal(STAGE52_UA_COMPONENT_IDS_45.length, 45);
  assert.equal(STAGE52_UX_EVENTS_17.length, 17);

  for (const ds of INITIAL_STAGE52_DATASETS) {
    assert.ok(ds.datasetId.startsWith('RT-DATA-URBAN-'));
    assert.ok(ds.publisherFa && ds.supplierFa && ds.processorFa);
    assert.ok(ds.validAtDateFa && ds.receivedAtDateFa && ds.lastReviewedAtFa);
    assert.equal(ds.quality.usesSingleOpaqueScore, false);
  }
});

test('Stage 52 separates availability from public access and gates raw download vs map usage by license', () => {
  const health = INITIAL_STAGE52_DATASETS[0];
  const parcel = INITIAL_STAGE52_DATASETS[2];

  const healthAccess = evaluateDatasetAccessAndActions({ dataset: health, userRole: 'logged_in_user' });
  assert.equal(healthAccess.canAddToMap, true);
  assert.equal(healthAccess.canDownloadRawFile, false);
  assert.equal(healthAccess.sourceLicenseEqualsProductOwnership, false);

  const parcelVisitor = evaluateDatasetAccessAndActions({ dataset: parcel, userRole: 'visitor' });
  assert.match(parcelVisitor.availabilityLabelFa, /موجود است اما/);
  assert.equal(parcelVisitor.canViewMetadata, true);
  assert.equal(parcelVisitor.canViewDataPreview, false);
  assert.equal(parcelVisitor.canAddToMap, false);
});

test('Stage 52 comparison refuses winner declaration purely by record count', () => {
  const cmp = compareUrbanDatasetsByPurpose({
    datasetA: INITIAL_STAGE52_DATASETS[0],
    datasetB: INITIAL_STAGE52_DATASETS[1],
    intendedUseFa: 'بررسی پوشش خدمات',
  });
  assert.equal(cmp.judgedSolelyByRecordCount, false);
  assert.equal(cmp.declaresAbsoluteWinner, false);
  assert.equal(cmp.comparisonRows.length, 5);
});

test('Stage 52 conflict governance blocks resolution purely because one file looks newer or fuller', () => {
  const blocked = evaluateSourceConflictResolution({
    conflict: INITIAL_STAGE52_CONFLICTS[0],
    attemptedNewerFileOnlyHeuristic: true,
  });
  assert.equal(blocked.conflictHidden, false);
  assert.equal(blocked.resolvedByNewerOrMoreCompleteHeuristicBlocked, true);
  assert.equal(blocked.effectiveStatus, 'در انتظار بررسی');

  const resolved = evaluateSourceConflictResolution({
    conflict: INITIAL_STAGE52_CONFLICTS[0],
    attemptedNewerFileOnlyHeuristic: false,
    verifiedReferenceDocumentId: 'REF-MUN-1405-02',
  });
  assert.equal(resolved.resolvedByNewerOrMoreCompleteHeuristicBlocked, false);
  assert.equal(resolved.effectiveStatus, 'حل‌شده با سند مرجع');
});

test('Stage 52 review due-date warns without invalidating, preserves history on rollback, & guards citizen/privacy rules', () => {
  const review = evaluateReviewScheduleAndVersionRollback({
    dataset: INITIAL_STAGE52_DATASETS[0],
    currentDateFa: '۱۴۰۵/۰۸/۱۶',
    isReviewDuePassed: true,
    rollbackReasonFa: 'خطای ساختاری',
  });
  assert.equal(review.autoMarkedDefinitivelyInvalid, false);
  assert.equal(review.rollbackPerformed, true);
  assert.equal(review.newerVersionHistoryPreservedOnRollback, true);
  assert.ok(review.impactedDirectLayers.length >= 1);
  assert.ok(review.impactedIndirectReports.length >= 1);

  const proposalCheck = submitCitizenProposalAndDataGapCheck({
    datasetId: 'RT-DATA-URBAN-0001',
    errorTypeFa: 'نام مرکز',
    proposedValueFa: 'بیمارستان جدید',
    evidenceSourceFa: 'مدرک رسمی',
    approvedPreviousCorrectionsCount: 3,
    totalSubmissionsCount: 4,
    gapRequestTitleFa: 'اطلاعات شخصی مالکان',
    gapRequestPopularityVotes: 500,
    containsSensitivePersonalOrPrivateData: true,
  });
  assert.equal(proposalCheck.proposal.mutatesReferenceDirectly, false);
  assert.equal(proposalCheck.dataGapRequest.popularityAloneJustifiesSensitiveRelease, false);
  assert.equal(proposalCheck.dataGapRequest.releaseBlockedDueToSensitivity, true);

  const privacy = detectLayerCombinationPrivacyRisk({
    selectedDatasets: [INITIAL_STAGE52_DATASETS[0], INITIAL_STAGE52_DATASETS[2]],
    distinguishedMissingKind: 'اطلاعات ثبت نشده',
  });
  assert.equal(privacy.combinationRiskElevated, true);
  assert.equal(privacy.requiresAggregationOrMasking, true);
  assert.equal(privacy.missingKindDistinctFromZero, true);
});

test('Stage 52 §30 quality workbench tracks 12 steps, record-bound geometry errors & version diff', () => {
  const audit = runDatasetQualityAuditWorkbench({
    dataset: INITIAL_STAGE52_DATASETS[0],
    previousVersionErrorCount: 4,
    geometryIssues: [{ recordId: 'REC-H-418', areaFa: 'منطقه ۱۸', issueKindFa: 'خودتقاطع' }],
  });
  assert.equal(audit.steps.length, 12);
  assert.equal(audit.usesGenericSpatialErrorOnly, false);
  assert.equal(audit.recordBoundGeometryIssues[0].recordId, 'REC-H-418');
  assert.equal(audit.errorDeltaVsPreviousVersion, audit.errorCount - 4);
});
