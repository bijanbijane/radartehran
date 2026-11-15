import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RT_FE_ENTITY_DETAIL_021_SPEC_ID,
  RT_FE_STAGE22_BRIDGE_SPEC_ID,
  RT_ENTITY_DOMAINS_10,
  RT_ENTITY_LAYERS_10,
  RT_ENTITY_SECTION_REGISTRY_10,
  RT_ENTITY_HEADER_STATES_8,
  RT_ENTITY_PROVENANCE_STATUSES_7,
  RT_ENTITY_RELATIONSHIP_TYPES_10,
  RT_ENTITY_DELIVERABLES_31,
  evaluateEntityIdentityAndUrl,
  resolveEntitySectionsForType,
  evaluatePropertyPresentationRules,
  evaluateBuildingAndListingBoundaries,
  evaluateProvenanceAndRelationships,
  sanitizeEntityTelemetryEvent,
} from '../services/rtFeEntityDetail021Engine';

test('Stage 21 (RT-FE-ENTITY-DETAIL-021): verifies 10 entity domains, 10 layers, 10 sections, 8 header states, 7 provenance statuses, 10 relationships, 31 deliverables & Stage 22 bridge', () => {
  assert.equal(RT_FE_ENTITY_DETAIL_021_SPEC_ID, 'RT-FE-ENTITY-DETAIL-021');
  assert.equal(RT_FE_STAGE22_BRIDGE_SPEC_ID, 'RT-FE-ENTITY-ENGAGEMENT-022');
  assert.equal(RT_ENTITY_DOMAINS_10.length, 10);
  assert.equal(RT_ENTITY_LAYERS_10.length, 10);
  assert.equal(RT_ENTITY_SECTION_REGISTRY_10.length, 10);
  assert.equal(RT_ENTITY_HEADER_STATES_8.length, 8);
  assert.equal(RT_ENTITY_PROVENANCE_STATUSES_7.length, 7);
  assert.equal(RT_ENTITY_RELATIONSHIP_TYPES_10.length, 10);
  assert.equal(RT_ENTITY_DELIVERABLES_31.length, 31);
  assert.equal(RT_ENTITY_DELIVERABLES_31[0].id, 'RT-FE-ENTITY-OUT-001');
  assert.equal(RT_ENTITY_DELIVERABLES_31[30].id, 'RT-FE-ENTITY-OUT-031');
});

test('Stage 21: enforces immutable entity IDs, rejects query secrets, isolates section failures, and blocks body render when identity fails', () => {
  const valid = evaluateEntityIdentityAndUrl({
    id: 'prop-1042',
    type: 'property',
    headerState: 'Verified',
  });
  assert.equal(valid.valid, true);
  assert.equal(valid.canonicalUrl, '/property/prop-1042');

  const secretLeak = evaluateEntityIdentityAndUrl({
    id: 'prop-1042',
    type: 'property',
    headerState: 'Active',
    queryParams: { token: 'abc123', ownerPhone: '0912' },
    derivedFromMutableTitle: true,
  });
  assert.equal(secretLeak.valid, false);
  assert.equal(secretLeak.issues.length, 2);

  const mergedNoTarget = evaluateEntityIdentityAndUrl({
    id: 'prop-old',
    type: 'property',
    headerState: 'Merged',
  });
  assert.equal(mergedNoTarget.valid, false);

  const noIdentity = resolveEntitySectionsForType({
    entityType: 'property',
    identityLoaded: false,
    permissions: [],
  });
  assert.equal(noIdentity.canRenderBody, false);

  const partialFailure = resolveEntitySectionsForType({
    entityType: 'neighborhood',
    identityLoaded: true,
    permissions: [],
    erroredSectionIds: ['analytics'],
  });
  assert.equal(partialFailure.canRenderBody, true);
  assert.ok(partialFailure.visibleSectionIds.includes('overview'));
  assert.ok(!partialFailure.visibleSectionIds.includes('analytics'));
  assert.deepEqual(partialFailure.isolatedErrorSections, ['analytics']);
  assert.ok(!partialFailure.visibleSectionIds.includes('documents'));
});

test('Stage 21: preserves 6-price separation, tri-state completeness (missing vs zero vs not applicable), building/listing boundaries, provenance conflicts & telemetry PII filtering', () => {
  const mergedPrices = evaluatePropertyPresentationRules({
    askingSalePrice: 14500,
    modelValuationPrice: 13900,
    mergeAllIntoGenericPriceLabel: true,
    elevator: { kind: 'missing' },
  });
  assert.equal(mergedPrices.valid, false);

  const zeroElevator = evaluatePropertyPresentationRules({
    askingSalePrice: 14500,
    askingRentPrice: 900,
    recordedTransactionPrice: 14100,
    modelValuationPrice: 13900,
    elevator: { kind: 'value', value: 0 },
  });
  assert.equal(zeroElevator.valid, true);
  assert.equal(zeroElevator.distinctPriceCount, 4);
  assert.match(zeroElevator.elevatorDisplayFa, /ندارد/);

  const notApplicableElevator = evaluatePropertyPresentationRules({
    elevator: { kind: 'not_applicable' },
  });
  assert.match(notApplicableElevator.elevatorDisplayFa, /کاربرد ندارد/);

  const boundaryViolations = evaluateBuildingAndListingBoundaries({
    unitEditTargetsSharedBuildingSpec: true,
    exposeOwnerIdentityInUnitList: true,
    listingMatchedOnlyByAddressOrImage: true,
    proposedMatchStatus: 'confirmed',
  });
  assert.equal(boundaryViolations.allowed, false);
  assert.equal(boundaryViolations.resolvedMatchStatus, 'probable');
  assert.equal(boundaryViolations.issues.length, 3);

  const provCheck = evaluateProvenanceAndRelationships({
    fieldSamples: [
      { fieldId: 'areaSqm', sourceId: 'deed-src', value: 112, status: 'verified' },
      { fieldId: 'areaSqm', sourceId: 'listing-src', value: 118, status: 'unverified' },
      { fieldId: 'priceEst', sourceId: 'hedonic-v4', value: 14200, status: 'estimated' },
    ],
    relationships: [
      { relationType: 'Located In', status: 'confirmed', sourceId: 'gis-tehran' },
      { relationType: 'Advertised By', status: 'confirmed' },
    ],
  });
  assert.equal(provCheck.hasConflict, true);
  assert.equal(provCheck.missingMethodExplanation, true);
  assert.equal(provCheck.unbackedConfirmedRelations, 1);

  const telemetry = sanitizeEntityTelemetryEvent({
    eventType: 'entity_detail_open',
    entityType: 'property',
    payload: {
      entityType: 'property',
      sectionId: 'analytics',
      ownerIdentity: 'Ali Rezaei',
      exactUserLocation: '35.7,51.3',
    },
  });
  assert.deepEqual(telemetry.strippedKeys.sort(), ['exactUserLocation', 'ownerIdentity']);
  assert.equal(telemetry.sanitizedPayload.sectionId, 'analytics');
});
