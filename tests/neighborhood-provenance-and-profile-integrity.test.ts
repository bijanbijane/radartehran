import assert from 'node:assert/strict';
import test from 'node:test';
import {
  resolveProvenanceEntityId,
  resolveAnalyticsPlaceId,
} from '../src/features/data-governance/services/placeIdentityMappers';
import { DataGovernanceEngine } from '../src/features/data-governance/services/dataGovernanceEngine';
import { buildPublicProvenanceContract } from '../src/features/data-governance/services/claimsAndLineageService';
import { AnalyticsPlatformEngine } from '../src/features/analytics/services/analyticsPlatformEngine';
import {
  buildNeighborhoodIntelligenceProfile,
  evaluateMarketSampleAdequacy,
  formatNullSafeMetricValue,
} from '../src/features/neighborhoods/services/neighborhoodProfileEngine';
import {
  INITIAL_NEIGHBORHOODS,
  getNeighborhoodMarketReport,
  getNeighborhoodTrafficInfo,
  type EvaluatedNeighborhood,
} from '../src/data/neighborhoods';
import { calculateHedonicValuation } from '../src/data/hedonicPricingEngine';

const EVALUATED_HOODS: EvaluatedNeighborhood[] = INITIAL_NEIGHBORHOODS.slice(0, 10).map((h) => ({
  ...h,
  status: 'green',
  distKm: 4.5,
  overallScore: 8.4,
  diffPercent: 5,
  marketReport: getNeighborhoodMarketReport(h),
  trafficInfo: getNeighborhoodTrafficInfo(h),
}));

test('Stage 26.1: resolveProvenanceEntityId & resolveAnalyticsPlaceId separate provenance and analytics without guessing', () => {
  assert.equal(resolveProvenanceEntityId(3), 'saadat-abad');
  assert.equal(resolveProvenanceEntityId(5), null);
  assert.equal(resolveProvenanceEntityId(401), null);

  assert.equal(resolveAnalyticsPlaceId(3), 'saadat-abad');
  assert.equal(resolveAnalyticsPlaceId(5), 'punak');
  assert.equal(resolveAnalyticsPlaceId(401), null);

  const gov = new DataGovernanceEngine();
  assert.equal(gov.getLineageForEntity('saadat-abad').length, 3);
  assert.equal(gov.getLineageForEntity('punak').length, 0);
  assert.equal(gov.getLineageForEntity(null).length, 0);
});

test('Stage 26.2: buildPublicProvenanceContract separates UNREGISTERED from REGISTERED without fabricating sampleCount', () => {
  const unreg = buildPublicProvenanceContract({
    entityId: null,
    neighborhoodNameFa: 'قصرالدشت',
    sampleCount: 0,
    uniqueEntityCount: null,
    syntheticSampleCount: 2,
  });
  assert.equal(unreg.provenanceStatus, 'UNREGISTERED');
  assert.equal(unreg.sufficiencyStatus, 'NOT_ASSESSED');
  assert.equal(unreg.provenance.sourceCount, 0);
  assert.equal(unreg.provenance.sampleCount, 0);
  assert.equal(unreg.provenance.uniqueEntityCount, null);

  const registered = buildPublicProvenanceContract({
    entityId: 'saadat-abad',
    neighborhoodNameFa: 'سعادت‌آباد',
    sampleCount: 18,
    uniqueEntityCount: 15,
  });
  assert.equal(registered.provenanceStatus, 'REGISTERED');
  assert.equal(registered.provenance.sampleCount, 18);
  assert.equal(registered.provenance.uniqueEntityCount, 15);
});

test('Stage 26.3: AnalyticsPlatformEngine returns UNAVAILABLE when observed data is missing and marks demo simulation explicitly', () => {
  const analytics = new AnalyticsPlatformEngine();
  const missingSnap = analytics.getMetricSnapshotForPlace('punak', 400);
  assert.equal(missingSnap.value, null);
  assert.equal(missingSnap.dataOrigin, 'UNAVAILABLE');

  const observedSnap = analytics.getMetricSnapshotForPlace('saadat-abad', 620, [600, 610, 620, 630, 640]);
  assert.equal(observedSnap.dataOrigin, 'OBSERVED');
  assert.equal(observedSnap.distribution?.uniqueEntityCount, 5);

  const simSnap = analytics.createDemoSimulatedSnapshot('punak', 400);
  assert.equal(simSnap.dataOrigin, 'SIMULATED');
  assert.equal(simSnap.distribution?.uniqueEntityCount, 9);
});

test('Stage 26.4: buildNeighborhoodIntelligenceProfile blocks unverified area claims and separates asking price from the optional negotiation scenario', () => {
  assert.equal(formatNullSafeMetricValue(null), '—');
  assert.equal(formatNullSafeMetricValue(0), '۰');
  assert.equal(evaluateMarketSampleAdequacy(8).adequate, false);

  const hood = EVALUATED_HOODS[0];
  const profileWithoutDeal = buildNeighborhoodIntelligenceProfile(hood, EVALUATED_HOODS, 'tehran');
  assert.equal(profileWithoutDeal.boundary.status, 'under-review');
  assert.equal(profileWithoutDeal.boundary.areaKm2, null);
  assert.ok(profileWithoutDeal.boundary.statusLabelFa.includes('تأیید و مساحت‌سنجی نشده'));
  const askingWithoutDeal = profileWithoutDeal.quickMetrics.find((m) => m.id === 'asking-median');
  assert.equal(askingWithoutDeal?.comparisonLabel, undefined, 'comparisonLabel must be undefined when dealPricePerSqm is omitted');

  const profileWithDeal = buildNeighborhoodIntelligenceProfile(hood, EVALUATED_HOODS, 'tehran', 198);
  const askingWithDeal = profileWithDeal.quickMetrics.find((m) => m.id === 'asking-median');
  assert.ok(askingWithDeal?.comparisonLabel?.includes('سناریو v6.4 (غیرثبتی)'));
});

