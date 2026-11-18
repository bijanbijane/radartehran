/**
 * Comprehensive Acceptance & Architecture Test Suite for Stages 27, 28, 29, 30 & 31
 * Covers:
 * - Stage 27 & 30 (RT-UI-SEARCH-001): SEARCH-T01..T42 & SRCH-T01..T15
 * - Stage 28 (RT-UI-DATA-GOV-001): DGOV-T01..T52
 * - Stage 29 (RT-UI-ANALYTICS-001): ANALYTICS-T01..T40
 * - Stage 31 (RT-UI-PERSONALIZATION-001): PERS-T01..T18
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildSearchPlan,
  decodeSearchUrlState,
  encodeSearchUrlState,
  normalizePersianSearchQuery,
  validateRawSearchQuery,
} from '../services/searchNormalizerAndPlanner';
import {
  canCallerAccessSearchDocument,
  SearchIndexAndOrchestratorEngine,
  validateUserPolygonGeometry,
} from '../services/searchOrchestratorEngine';
import {
  containsSensitivePersonalPattern,
  SearchWorkspaceStateManager,
} from '../services/searchWorkspaceService';
import { DataGovernanceEngine } from '../../data-governance/services/dataGovernanceEngine';
import {
  buildPublicProvenanceContract,
  compareEntityVersionsDiff,
  computeIndependentClaimConfidence,
  evaluateDataFreshness,
  evaluateMarketSampleSufficiency,
  reconstructEntityAtValidTime,
} from '../../data-governance/services/claimsAndLineageService';
import {
  AnalyticsPlatformEngine,
  computeDistributionStats,
  computeSafePeriodComparison,
  OFFICIAL_METRIC_REGISTRY,
} from '../../analytics/services/analyticsPlatformEngine';
import {
  formatPriceByUserPreference,
  formatValueWithNumberPreference,
  PersonalizationWorkspaceEngine,
} from '../../account/services/personalizationAndPreferencesEngine';

test('Stage 27 & 30 (RT-UI-SEARCH-001): Persian Normalization, ZWNJ, Digits, Typo & Synonym Separation', () => {
  const n1 = normalizePersianSearchQuery('آپارتمان ٢ خوابه در سعادت آباد یا تهران پارس');
  assert.equal(n1.rawQuery, 'آپارتمان ٢ خوابه در سعادت آباد یا تهران پارس');
  assert.ok(n1.normalizedQuery.includes('۲خوابه'));
  assert.ok(n1.normalizedQuery.includes('سعادت‌آباد'));
  assert.ok(n1.normalizedQuery.includes('تهران‌پارس'));

  const typo = normalizePersianSearchQuery('اپارتمان در سعات آباد');
  assert.ok(typo.typoSuggestion);
  assert.equal(typo.typoSuggestion?.suggestedToken, 'سعادت‌آباد');
  assert.equal(typo.rawQuery, 'اپارتمان در سعات آباد');

  const planOffice = buildSearchPlan('دفتر کار در ونک');
  assert.equal(planOffice.extractedFilters.propertyType, 'OFFICE');
  const planComm = buildSearchPlan('مغازه تجاری در ونک');
  assert.equal(planComm.extractedFilters.propertyType, 'COMMERCIAL');

  const planHigh = buildSearchPlan('آپارتمان دوخوابه در سعادت‌آباد زیر ۱۵ میلیارد');
  assert.equal(planHigh.primaryIntent, 'PROPERTY_SEARCH');
  assert.equal(planHigh.confidence, 'HIGH');
  assert.equal(planHigh.autoAppliedFilters.bedrooms, 2);
  assert.equal(planHigh.autoAppliedFilters.maxPriceMillionToman, 15000);

  const planLow = buildSearchPlan('جای خوب');
  assert.equal(planLow.confidence, 'LOW');
  assert.deepEqual(planLow.autoAppliedFilters, {});
  assert.equal(validateRawSearchQuery('a'.repeat(205)).valid, false);
});

test('Stage 27 & 30 (RT-UI-SEARCH-001): Security Visibility, Location Precision, Index Tombstone & Saved Search Alerts', () => {
  const engine = new SearchIndexAndOrchestratorEngine();
  const pubRes = engine.executeSearch({ rawQuery: '', scope: 'ALL', caller: { isAuthenticated: false } });
  assert.ok(pubRes.results.every((r) => r.document.visibility === 'PUBLIC'));
  assert.ok(!pubRes.results.some((r) => r.document.id === 'doc-private-owner-draft-999'));
  assert.ok(!pubRes.results.some((r) => r.document.id === 'doc-admin-internal-audit-log'));
  assert.ok(!pubRes.results.some((r) => r.document.id === 'doc-deleted-tombstone-listing'));

  const ownerDoc = engine.executeSearch({
    rawQuery: 'پیش‌نویس شخصی', scope: 'ACCOUNT', caller: { userId: 'usr-owner-1', isAuthenticated: true },
  });
  assert.ok(ownerDoc.results.some((r) => r.document.id === 'doc-private-owner-draft-999'));
  assert.equal(canCallerAccessSearchDocument({ ...pubRes.results[0].document, visibility: 'PARTICIPANTS_ONLY' }, { isAdmin: true }), false);

  assert.equal(validateUserPolygonGeometry({ coordinates: [{ lat: 35.7, lng: 51.3 }] }).valid, false);
  assert.equal(
    validateUserPolygonGeometry({
      coordinates: [{ lat: 35.75, lng: 51.35 }, { lat: 35.80, lng: 51.35 }, { lat: 35.80, lng: 51.40 }],
    }).valid,
    true
  );

  const staleUpsert = engine.upsertDocument({ ...pubRes.results[0].document, sourceVersion: 1 });
  assert.equal(staleUpsert.applied, false);
  const tomb = engine.tombstoneDeleteDocument('doc-prop-punak-88', 5);
  assert.equal(tomb.deleted, true);
  const reviveOldVersion = engine.upsertDocument({ ...pubRes.results[0].document, id: 'doc-prop-punak-88', sourceVersion: 3 });
  assert.equal(reviveOldVersion.applied, false);

  const ws = new SearchWorkspaceStateManager();
  assert.ok(ws.getAutocompleteSuggestions('').length <= 8);
  assert.equal(containsSensitivePersonalPattern('09123456789'), true);
  assert.equal(ws.recordSearchHistory({ rawQuery: '09123456789', scope: 'ALL', resultCount: 0 }), null);

  const minorEdit = ws.evaluateSavedSearchMatchChange('saved-search-1', {
    entityId: 'prop-saadat-105', entityType: 'LISTING', version: 3, priceMillionToman: 15200,
    activeStatus: true, changeKind: 'MINOR_TEXT_OR_IMAGE_EDIT',
  });
  assert.equal(minorEdit.shouldNotify, false);

  const priceDrop = ws.evaluateSavedSearchMatchChange('saved-search-1', {
    entityId: 'prop-saadat-105', entityType: 'LISTING', version: 4, priceMillionToman: 14900,
    activeStatus: true, changeKind: 'PRICE_CHANGE',
  });
  assert.equal(priceDrop.shouldNotify, true);

  const qs = encodeSearchUrlState({ q: 'سعادت‌آباد', scope: 'PROPERTIES', sort: 'PRICE_ASC', filters: { bedrooms: 2 } });
  const decoded = decodeSearchUrlState(qs);
  assert.equal(decoded.q, 'سعادت‌آباد');
  assert.equal(decoded.scope, 'PROPERTIES');
  assert.equal(decoded.filters.bedrooms, 2);
});

test('Stage 28 (RT-UI-DATA-GOV-001): Source Registry, Usage Policy, Independent Witness Deduplication, Conflict Guard & Lineage', () => {
  const gov = new DataGovernanceEngine();
  assert.equal(gov.registerSource({ nameFa: 'منبع ناقص' }).ok, false);

  const rawDisplayCheck = gov.canUseSourceForOperation('src-licensed-partner-analytics', 'DISPLAY_RAW');
  assert.equal(rawDisplayCheck.allowed, false);
  const analyzeCheck = gov.canUseSourceForOperation('src-licensed-partner-analytics', 'ANALYZE');
  assert.equal(analyzeCheck.allowed, true);

  const copycatEvidences = [
    { id: 'e1', sourceId: 'site-a', derivedFromSourceId: 'root-feed-1', verificationStatus: 'VERIFIED' as const },
    { id: 'e2', sourceId: 'site-b', derivedFromSourceId: 'root-feed-1', verificationStatus: 'VERIFIED' as const },
    { id: 'e3', sourceId: 'site-c', derivedFromSourceId: 'root-feed-1', verificationStatus: 'VERIFIED' as const },
  ];
  const conf = computeIndependentClaimConfidence(copycatEvidences);
  assert.equal(conf.independentWitnessCount, 1);
  assert.equal(conf.confidenceLevel, 'MEDIUM');

  const fresh = evaluateDataFreshness({
    observedAt: '2025-01-01T00:00:00Z',
    recordedAt: '2026-04-12T00:00:00Z',
    referenceNowIso: '2026-04-12T00:00:00Z',
  });
  assert.equal(fresh.freshnessStatus, 'EXPIRED');

  const suffLow = evaluateMarketSampleSufficiency({
    targetId: 'saadat-abad', sampleCount: 3, uniqueEntityCount: 3, hasSourceId: true,
    hasMethodologyVersion: true, observedAt: '2026-04-12T00:00:00Z', recordedAt: '2026-04-12T00:00:00Z',
  });
  assert.equal(suffLow.coverage, 'INSUFFICIENT');

  const autoAttempt = gov.resolveConflictCase({
    caseId: 'recon-case-101', reviewerId: 'bot', resolutionValue: 105, resolutionReasonFa: 'حل خودکار', isAutomatedAttempt: true,
  });
  assert.equal(autoAttempt.ok, false);

  const conflictedReviewer = gov.resolveConflictCase({
    caseId: 'recon-case-101', reviewerId: 'usr-owner-1', resolutionValue: 110, resolutionReasonFa: 'بررسی مالک',
  });
  assert.equal(conflictedReviewer.ok, false);
  assert.equal(gov.getEvidenceForCaller('ev-private-deed-900', { isAdmin: false }).ok, false);

  const versions = gov.getEntityVersions('saadat-abad');
  const marchState = reconstructEntityAtValidTime(versions, '2026-03-20T00:00:00Z');
  assert.equal(marchState?.value, 138.4);
  const diff = compareEntityVersionsDiff(versions[0], versions[1]);
  assert.notEqual(diff.previousMethodologyVersion, diff.newMethodologyVersion);

  const pubCard = buildPublicProvenanceContract({ entityId: 'saadat-abad', neighborhoodNameFa: 'سعادت‌آباد', sampleCount: 48, uniqueEntityCount: 42 });
  assert.equal(pubCard.methodology.code, 'MEDIAN_OFFER_PRICE');
});

test('Stage 29 (RT-UI-ANALYTICS-001): Idempotent Ingestion, IQR Trimmed Percentiles, Safe Change % & Small-Cell Guard', () => {
  const analytics = new AnalyticsPlatformEngine({ seedDemo: true });
  const dup = analytics.ingestAnalyticalEvent({
    idempotencyKey: 'idem-boot-1', sourceSystem: 'ListingOutbox', schemaVersion: '1.0', occurredAt: '2026-04-12T00:00:00Z',
  });
  assert.equal(dup.status, 'DUPLICATE_SKIPPED');

  const invalidSchema = analytics.ingestAnalyticalEvent({ sourceSystem: 'BrokenProducer' });
  assert.equal(invalidSchema.status, 'QUARANTINED');

  const dist = computeDistributionStats([130, 135, 138, 140, 142, 144, 146, 148, 150, 490], 45, true);
  assert.equal(dist.trimmedOutlierCount, 1);
  assert.ok(dist.median < 150);
  assert.ok(dist.iqr > 0);

  const zeroDenom = computeSafePeriodComparison({
    currentPeriodLabelFa: 'فروردین ۱۴۰۵', previousPeriodLabelFa: 'اسفند ۱۴۰۴', currentValue: 142, previousValue: 0,
    currentSampleCount: 40, previousSampleCount: 0, currentBoundaryVersion: 'v2.0-1405', previousBoundaryVersion: 'v2.0-1405',
  });
  assert.equal(zeroDenom.computable, false);
  assert.equal(zeroDenom.changePercent, null);

  const boundaryChanged = computeSafePeriodComparison({
    currentPeriodLabelFa: 'بهار ۱۴۰۵', previousPeriodLabelFa: 'بهار ۱۴۰۳', currentValue: 142, previousValue: 118,
    currentSampleCount: 48, previousSampleCount: 42, currentBoundaryVersion: 'v2.0-1405', previousBoundaryVersion: 'v1.0-1403',
  });
  assert.equal(boundaryChanged.boundaryVersionConsistent, false);
  assert.ok(boundaryChanged.compositionShiftWarningFa?.includes('نسخه مرز محله'));

  assert.equal(
    analytics.canExportDatasetSlice({ sampleCount: 3, datasetClassification: 'PUBLIC', callerRole: 'RESEARCHER' }).allowed,
    false
  );
  assert.ok(OFFICIAL_METRIC_REGISTRY.length >= 4);
});

test('Stage 31 (RT-UI-PERSONALIZATION-001): Saved Items IDOR Guard, Undo, Display-Only Currency/Number & 3-State Map City', () => {
  const pers = new PersonalizationWorkspaceEngine();
  assert.equal(pers.listSavedItems('usr-attacker', 'usr-current').ok, false);

  const beforeCount = pers.listSavedItems('usr-current').items.length;
  const rem = pers.removeSavedItemWithUndo('usr-current', 'sv-prop-105');
  assert.equal(rem.removed, true);
  assert.equal(pers.listSavedItems('usr-current').items.length, beforeCount - 1);
  pers.undoLastRemovedItem('usr-current');
  assert.equal(pers.listSavedItems('usr-current').items.length, beforeCount);

  assert.equal(formatValueWithNumberPreference('prop-saadat-105', 'fa', true), 'prop-saadat-105');
  const tomanDisplay = formatPriceByUserPreference(14900, { currencyUnit: 'toman', numberFormat: 'en' });
  assert.equal(tomanDisplay.canonicalPriceMillionToman, 14900);
  assert.equal(tomanDisplay.displayAmount, '14,900');
  assert.equal(tomanDisplay.unitLabelFa, 'میلیون تومان');

  const afterKarajView = pers.recordTransientMapCityView('usr-current', 'karaj');
  assert.equal(afterKarajView.map.defaultCityId, 'tehran');
  assert.equal(afterKarajView.map.lastViewedCityId, 'karaj');

  const afterPriv = pers.updatePreferences('usr-current', {
    personalizationLevels: { level2ActivityBasedEnabled: false, level3SmartRecommendationsEnabled: false },
  });
  assert.equal(afterPriv.personalizationLevels.level1ExplicitPreferencesEnabled, true);
  assert.equal(afterPriv.search.personalizedSuggestionsEnabled, false);
});
