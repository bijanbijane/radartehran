import test from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveAnalyticsPlaceId,
  resolveProvenanceEntityId,
} from '../services/placeIdentityMappers';
import { DataGovernanceEngine } from '../services/dataGovernanceEngine';
import { buildPublicProvenanceContract } from '../services/claimsAndLineageService';
import { AnalyticsPlatformEngine } from '../../analytics/services/analyticsPlatformEngine';

test('Stage 1.1: Independent mappers keep provenance and analytics scopes separated without guessing', () => {
  assert.equal(resolveProvenanceEntityId(3), 'saadat-abad');
  assert.equal(resolveProvenanceEntityId(5), null);
  assert.equal(resolveProvenanceEntityId(401), null);

  assert.equal(resolveAnalyticsPlaceId(3), 'saadat-abad');
  assert.equal(resolveAnalyticsPlaceId(5), 'punak');
  assert.equal(resolveAnalyticsPlaceId(401), null);
});

test('Stage 1.2: Lineage lookup does not leak saadat-abad edges to unmapped or analytics-only places', () => {
  const gov = new DataGovernanceEngine();
  assert.equal(gov.getLineageForEntity('saadat-abad').length, 3);
  assert.equal(gov.getLineageForEntity('punak').length, 0);
  assert.equal(gov.getLineageForEntity('qasr-dasht').length, 0);
  assert.equal(gov.getLineageForEntity(null).length, 0);
});

test('Stage 1.3: Public provenance contract never inflates sampleCount/uniqueEntityCount or fakes sources for unregistered places', () => {
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
  assert.equal(unreg.provenance.independentEvidenceCount, 0);
  assert.equal(unreg.provenance.sampleCount, 0);
  assert.equal(unreg.provenance.uniqueEntityCount, null);
  assert.equal(unreg.referencePeriod.labelFa, 'ثبت نشده');

  const saadatEmptyLocal = buildPublicProvenanceContract({
    entityId: 'saadat-abad',
    neighborhoodNameFa: 'سعادت‌آباد',
    sampleCount: 0,
    uniqueEntityCount: null,
  });
  assert.equal(saadatEmptyLocal.provenanceStatus, 'REGISTERED');
  assert.equal(saadatEmptyLocal.provenance.sampleCount, 0);
  assert.equal(saadatEmptyLocal.provenance.uniqueEntityCount, null);
  assert.equal(saadatEmptyLocal.sufficiencyStatus, 'INSUFFICIENT');
});

test('Stage 1.4: Analytics engine returns UNAVAILABLE when observed data is absent and marks explicit demo simulation honestly', () => {
  const analytics = new AnalyticsPlatformEngine({ seedDemo: true });
  const unmapped = analytics.getOverviewBundle(null, 180);
  assert.equal(unmapped.activeSnapshot.value, null);
  assert.equal(unmapped.activeSnapshot.distribution, undefined);
  assert.equal(unmapped.activeSnapshot.dataOrigin, 'UNAVAILABLE');
  assert.equal(unmapped.savedAnalyses.length, 0);

  const shirazSnap = analytics.getMetricSnapshotForPlace('qasr-dasht', 210);
  assert.equal(shirazSnap.value, null);
  assert.equal(shirazSnap.dataOrigin, 'UNAVAILABLE');

  const punakNoObs = analytics.getOverviewBundle('punak', 400);
  assert.equal(punakNoObs.activeSnapshot.geography.placeId, 'punak');
  assert.equal(punakNoObs.activeSnapshot.value, null);
  assert.equal(punakNoObs.activeSnapshot.dataOrigin, 'UNAVAILABLE');
  assert.equal(punakNoObs.savedAnalyses.length, 1);

  const punakSim = analytics.createDemoSimulatedSnapshot('punak', 400);
  assert.equal(punakSim.geography.placeId, 'punak');
  assert.equal(punakSim.dataOrigin, 'SIMULATED');
  assert.equal(punakSim.distribution?.uniqueEntityCount, 9);

  const saadatObs = analytics.getMetricSnapshotForPlace('saadat-abad', 620, [600, 610, 620, 630, 640]);
  assert.equal(saadatObs.dataOrigin, 'OBSERVED');
  assert.equal(saadatObs.distribution?.uniqueEntityCount, 5);
});
