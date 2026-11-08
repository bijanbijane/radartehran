import test from 'node:test';
import assert from 'node:assert/strict';
import { CoreApiError } from '../server/modules/core';
import { createDataGovernanceService } from '../server/modules/data-governance';

test('Employee 62 — 1. Canonical entity creation, entity resolution, duplicate grouping, merge & merge reversal', () => {
  const mdm = createDataGovernanceService({
    now: () => new Date('2026-11-08T00:00:00.000Z'),
  });

  // Create canonical building
  const bld = mdm.registerOrUpdateMasterRecord({
    actorUid: 'admin_62',
    isAdmin: true,
    canonicalId: 'mdm_building_niavaran_01',
    entityType: 'building',
    attributes: {
      cityId: 'tehran',
      hoodId: 1,
      floorsCount: 10,
      declaredUnitsCount: 20,
    },
    provenance: {
      sourceId: 'src_registry_1',
      sourceCategory: 'OFFICIAL_REGISTRY',
      sourceRecordRef: 'reg_bld_01',
      collectionMethod: 'api_sync',
      collectedAtIso: '2026-11-01T00:00:00.000Z',
      verificationStatus: 'VERIFIED',
      reliabilityTier: 'HIGH',
    },
  });
  assert.equal(bld.created, true);

  // Create canonical property #1
  const prop1 = mdm.registerOrUpdateMasterRecord({
    actorUid: 'agent_1',
    canonicalId: 'mdm_prop_101',
    entityType: 'property',
    parentCanonicalId: 'mdm_building_niavaran_01',
    sourceSpecificIds: { divar: 'dv_101' },
    attributes: {
      cityId: 'tehran',
      hoodId: 1,
      buildingId: 'mdm_building_niavaran_01',
      unitNumber: '4A',
      propertyCategory: 'residential',
      sqm: 120,
      buildYear: 1402,
      deedType: 'single_page',
      normalizedAddressFa: 'تهران نیاوران خیابان باهنر پلاک ۱۰ واحد ۴A',
      coordinates: { lat: 35.815, lng: 51.462 },
    },
    provenance: {
      sourceId: 'src_broker_1',
      sourceCategory: 'BROKER_SUBMISSION',
      sourceRecordRef: 'brk_sub_101',
      collectionMethod: 'portal_form',
      collectedAtIso: '2026-11-02T00:00:00.000Z',
      verificationStatus: 'VERIFIED',
      reliabilityTier: 'HIGH',
    },
  });
  assert.equal(prop1.created, true);

  // Exact match resolution via external identifier prevents duplicate creation
  const exactUpdate = mdm.registerOrUpdateMasterRecord({
    actorUid: 'agent_1',
    entityType: 'property',
    sourceSpecificIds: { divar: 'dv_101' },
    attributes: { floor: 4 },
    provenance: prop1.record.provenance,
  });
  assert.equal(exactUpdate.created, false);
  assert.equal(exactUpdate.record.canonicalId, 'mdm_prop_101');
  assert.equal(exactUpdate.record.version, 2);

  // Registering a very similar property without exact external ID creates a duplicate candidate group (never auto-merged)
  const prop2 = mdm.registerOrUpdateMasterRecord({
    actorUid: 'user_2',
    canonicalId: 'mdm_prop_102_dup',
    entityType: 'property',
    parentCanonicalId: 'mdm_building_niavaran_01',
    attributes: {
      cityId: 'tehran',
      hoodId: 1,
      buildingId: 'mdm_building_niavaran_01',
      unitNumber: '4A',
      propertyCategory: 'residential',
      sqm: 121,
      buildYear: 1402,
      normalizedAddressFa: 'تهران نیاوران خیابان باهنر پلاک ۱۰ واحد ۴A',
      coordinates: { lat: 35.81502, lng: 51.46202 },
    },
    provenance: {
      sourceId: 'src_user_2',
      sourceCategory: 'USER_ENTRY',
      sourceRecordRef: 'usr_102',
      collectionMethod: 'web_form',
      collectedAtIso: '2026-11-03T00:00:00.000Z',
      verificationStatus: 'PENDING',
      reliabilityTier: 'MEDIUM',
    },
  });
  assert.equal(prop2.created, true);
  assert.ok(prop2.duplicateCandidateGroupId);

  // Create a listing referencing the duplicate mdm_prop_102_dup
  mdm.registerOrUpdateMasterRecord({
    actorUid: 'user_2',
    canonicalId: 'mdm_listing_501',
    entityType: 'listing',
    parentCanonicalId: 'mdm_prop_102_dup',
    relatedCanonicalIds: { propertyId: 'mdm_prop_102_dup' },
    attributes: {
      propertyCanonicalId: 'mdm_prop_102_dup',
      cityId: 'tehran',
      hoodId: 1,
      propertyCategory: 'residential',
      transactionType: 'sale',
      sqm: 120,
    },
    provenance: prop2.record.provenance,
  });

  // Non-admin cannot merge duplicates
  assert.throws(
    () =>
      mdm.mergeDuplicateEntities({
        actorUid: 'user_2',
        isAdmin: false,
        groupId: prop2.duplicateCandidateGroupId,
        survivingCanonicalId: 'mdm_prop_101',
        retiredCanonicalIds: ['mdm_prop_102_dup'],
        reason: 'Unauthorized merge attempt',
      }),
    (err: unknown) => err instanceof CoreApiError && err.status === 403,
  );

  // Admin merges mdm_prop_102_dup into mdm_prop_101 -> migrates listing reference & preserves retired record as MERGED_ALIAS
  const mergeRes = mdm.mergeDuplicateEntities({
    actorUid: 'admin_62',
    isAdmin: true,
    groupId: prop2.duplicateCandidateGroupId,
    survivingCanonicalId: 'mdm_prop_101',
    retiredCanonicalIds: ['mdm_prop_102_dup'],
    reason: 'Confirmed identical physical unit 4A',
  });
  assert.equal(mergeRes.migratedDependentRefsCount, 1);

  const retiredRec = mdm.getMasterRecord('mdm_prop_102_dup');
  assert.equal(retiredRec?.status, 'MERGED_ALIAS');
  assert.equal(retiredRec?.mergedIntoCanonicalId, 'mdm_prop_101');

  const migratedListing = mdm.getMasterRecord('mdm_listing_501');
  assert.equal(migratedListing?.parentCanonicalId, 'mdm_prop_101');
  assert.equal(migratedListing?.relatedCanonicalIds.propertyId, 'mdm_prop_101');

  // Safe merge reversal restores pre-merge state
  const reversed = mdm.reverseEntityMerge({
    actorUid: 'admin_62',
    isAdmin: true,
    mergeId: mergeRes.mergeId,
    reason: 'Audit test reversal',
  });
  assert.equal(reversed.reversed, true);
  assert.equal(mdm.getMasterRecord('mdm_prop_102_dup')?.status, 'ACTIVE');
});

test('Employee 62 — 2. Data quality rules, explainable scoring, cross-module consistency & data profiling', () => {
  const mdm = createDataGovernanceService({
    now: () => new Date('2026-11-08T00:00:00.000Z'),
  });

  mdm.registerOrUpdateMasterRecord({
    actorUid: 'admin_62',
    isAdmin: true,
    canonicalId: 'mdm_prop_good',
    entityType: 'property',
    attributes: {
      cityId: 'tehran',
      hoodId: 1,
      propertyCategory: 'residential',
      sqm: 110,
      buildYear: 1403,
      deedType: 'single_page',
    },
    provenance: {
      sourceId: 'src_1',
      sourceCategory: 'OFFICIAL_REGISTRY',
      sourceRecordRef: 'ref_1',
      collectionMethod: 'api',
      collectedAtIso: '2026-11-01T00:00:00.000Z',
      verificationStatus: 'VERIFIED',
      reliabilityTier: 'HIGH',
    },
  });

  const goodQuality = mdm.evaluateDataQuality('mdm_prop_good');
  assert.equal(goodQuality.blockingPassed, true);
  assert.equal(goodQuality.overallClassification, 'EXCELLENT');
  assert.ok(goodQuality.overallScore >= 90);

  // Create a flawed record with unsupported cityId and missing buildYear/deedType
  mdm.registerOrUpdateMasterRecord({
    actorUid: 'user_1',
    canonicalId: 'mdm_prop_bad',
    entityType: 'property',
    parentCanonicalId: 'non_existent_building_id',
    attributes: {
      cityId: 'atlantis_unknown_city',
      hoodId: 1,
      propertyCategory: 'residential',
      sqm: 5, // Below range (< 10)
    },
    provenance: {
      sourceId: 'src_u',
      sourceCategory: 'USER_ENTRY',
      sourceRecordRef: 'ref_u',
      collectionMethod: 'manual',
      collectedAtIso: '2026-11-01T00:00:00.000Z',
      verificationStatus: 'UNVERIFIED',
      reliabilityTier: 'LOW',
    },
  });

  const badQuality = mdm.evaluateDataQuality('mdm_prop_bad');
  assert.equal(badQuality.blockingPassed, false);
  assert.equal(badQuality.overallClassification, 'CRITICAL_FAILURE');
  assert.ok(badQuality.failedBlockingRules.some((r) => r.ruleId === 'DQ_GEO_CONSISTENCY'));
  assert.ok(badQuality.failedBlockingRules.some((r) => r.ruleId === 'DQ_RANGE_AREA_PRICE'));

  // Cross-module consistency check detects dangling property reference & contradictory completion state
  const consistency = mdm.checkCrossModuleConsistency([
    {
      checkType: 'LISTING_TO_PROPERTY',
      sourceId: 'lst_orphan_1',
      targetId: 'prop_missing_999',
    },
    {
      checkType: 'LISTING_COMPLETION_VS_TRANSACTION',
      sourceId: 'lst_active_99',
      targetId: 'tx_closed_99',
      sourceMeta: {
        listingState: 'ACTIVE_AVAILABLE',
        transactionState: 'COMPLETED_CLOSED',
      },
    },
  ]);
  assert.equal(consistency.valid, false);
  assert.equal(consistency.violations.length, 2);

  // Data profiling
  const profile = mdm.getDataProfile({ entityType: 'property' });
  assert.equal(profile.totalRecords, 2);
  assert.equal(profile.verifiedRecordsCount, 1);
});

test('Employee 62 — 3. Protected fields, correction workflows, idempotent propagation, schema contracts & pagination', () => {
  const mdm = createDataGovernanceService({
    now: () => new Date('2026-11-08T00:00:00.000Z'),
  });

  mdm.registerOrUpdateMasterRecord({
    actorUid: 'admin_62',
    isAdmin: true,
    canonicalId: 'mdm_prop_prot_1',
    entityType: 'property',
    protectedFields: ['deedType', 'sqm'],
    attributes: {
      cityId: 'tehran',
      hoodId: 1,
      propertyCategory: 'residential',
      sqm: 100,
      deedType: 'single_page',
    },
    provenance: {
      sourceId: 'src_1',
      sourceCategory: 'OFFICIAL_REGISTRY',
      sourceRecordRef: 'ref_1',
      collectionMethod: 'api',
      collectedAtIso: '2026-11-01T00:00:00.000Z',
      verificationStatus: 'VERIFIED',
      reliabilityTier: 'HIGH',
    },
  });

  // Non-admin direct modification of protected field 'sqm' is rejected
  assert.throws(
    () =>
      mdm.registerOrUpdateMasterRecord({
        actorUid: 'ordinary_user',
        isAdmin: false,
        canonicalId: 'mdm_prop_prot_1',
        entityType: 'property',
        attributes: { sqm: 145 },
        provenance: mdm.getMasterRecord('mdm_prop_prot_1')!.provenance,
      }),
    (err: unknown) => err instanceof CoreApiError && err.status === 403,
  );

  // Submit controlled correction proposal -> Admin approves -> triggers idempotent propagation -> rollback
  const proposal = mdm.submitCorrectionProposal({
    actorUid: 'ordinary_user',
    canonicalId: 'mdm_prop_prot_1',
    proposedChanges: { sqm: 108 },
    reason: 'Official cadastral re-measurement certificate',
    evidenceRefs: ['doc_cadastre_881'],
  });
  assert.equal(proposal.status, 'PENDING_REVIEW');
  assert.equal(proposal.beforeValues.sqm, 100);

  const approved = mdm.reviewCorrectionProposal({
    actorUid: 'admin_62',
    isAdmin: true,
    proposalId: proposal.proposalId,
    decision: 'APPROVE',
    reviewNotes: 'Verified against cadastral deed',
  });
  assert.equal(approved.status, 'APPROVED_APPLIED');
  assert.ok(approved.propagationJobId);
  assert.equal(mdm.getMasterRecord('mdm_prop_prot_1')?.attributes.sqm, 108);

  // Rollback correction restores previous value (100) and preserves full versionHistory
  const rolledBack = mdm.rollbackCorrectionProposal({
    actorUid: 'admin_62',
    isAdmin: true,
    proposalId: proposal.proposalId,
    reason: 'Restoring original deed measurement',
  });
  assert.equal(rolledBack.status, 'ROLLED_BACK');
  const restoredRec = mdm.getMasterRecord('mdm_prop_prot_1')!;
  assert.equal(restoredRec.attributes.sqm, 100);
  assert.equal(restoredRec.versionHistory.length, 3);

  // Schema contract compatibility validation detects breaking removal of required field
  const compatFail = mdm.validateDataContractCompatibility({
    contractId: 'contract_canonical_property_v2',
    proposedRequiredFields: ['cityId', 'hoodId'], // Missing propertyCategory and sqm
  });
  assert.equal(compatFail.compatible, false);
  assert.ok(compatFail.breakingRemovedRequiredFields.includes('sqm'));

  // Dashboard & paginated listing
  const dash = mdm.getGovernanceDashboardSummary();
  assert.equal(dash.totalMasterRecords, 1);
  const page = mdm.listMasterRecordsPaginated({ page: 1, pageSize: 10 });
  assert.equal(page.total, 1);
});
