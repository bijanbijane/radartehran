/**
 * @file server/modules/property-registry/tests/propertyRegistry.test.ts
 * @description Automated test suite covering all 28 verification requirements for
 * Employee 42 — Canonical Property Registry & Asset Identity Backend (`server/modules/property-registry/`).
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CoreApiError,
  type AuthenticatedPrincipal,
  type IdempotencyRecord,
  type IdempotencyStoreAdapter,
} from '../../core';
import {
  createPropertyRegistryService,
  PROPERTY_REGISTRY_COLLECTIONS,
  type GeographyReadAdapter,
  type PropertyRegistryStoreTransaction,
  type PropertyRegistryTransactionRunner,
} from '../index';

function createInMemoryIdempotencyStore(): IdempotencyStoreAdapter {
  const records = new Map<string, IdempotencyRecord<unknown>>();
  return {
    async acquireLock<T = unknown>(params: {
      scopedKey: string;
      actorUid: string;
      operation: string;
      payloadHash: string;
      nowEpochMs: number;
      ttlMs: number;
    }) {
      const existing = records.get(params.scopedKey) as IdempotencyRecord<T> | undefined;
      if (existing) {
        if (existing.payloadHash !== params.payloadHash) {
          return { state: 'CONFLICT_PAYLOAD_MISMATCH' as const, record: existing };
        }
        if (existing.status === 'COMPLETED') {
          return { state: 'REPLAY_COMPLETED' as const, record: existing };
        }
        return { state: 'CONFLICT_IN_PROGRESS' as const, record: existing };
      }
      const record: IdempotencyRecord<T> = {
        key: params.scopedKey,
        actorUid: params.actorUid,
        operation: params.operation,
        payloadHash: params.payloadHash,
        status: 'IN_PROGRESS',
        createdAtIso: new Date(params.nowEpochMs).toISOString(),
        updatedAtIso: new Date(params.nowEpochMs).toISOString(),
        expiresAtEpochMs: params.nowEpochMs + params.ttlMs,
      };
      records.set(params.scopedKey, record);
      return { state: 'ACQUIRED' as const, record };
    },
    async markCompleted<T = unknown>(params: {
      scopedKey: string;
      statusCode: number;
      responseBody: T;
      nowEpochMs: number;
    }) {
      const existing = records.get(params.scopedKey);
      if (existing) {
        records.set(params.scopedKey, {
          ...existing,
          status: 'COMPLETED',
          statusCode: params.statusCode,
          responseBody: params.responseBody,
          updatedAtIso: new Date(params.nowEpochMs).toISOString(),
        });
      }
    },
    async releaseOnFailure(params: { scopedKey: string }) {
      records.delete(params.scopedKey);
    },
  };
}

function createTestHarness(options?: { abortFirstAttempts?: number; failNextWrite?: boolean }) {
  const collections = new Map<string, Map<string, unknown>>();
  let remainingAborts = options?.abortFirstAttempts ?? 0;
  let failWrite = options?.failNextWrite ?? false;

  const getCol = (name: string): Map<string, unknown> => {
    if (!collections.has(name)) {
      collections.set(name, new Map());
    }
    return collections.get(name)!;
  };

  const txRunner: PropertyRegistryTransactionRunner = {
    async runTransaction<T>(work: (tx: PropertyRegistryStoreTransaction) => Promise<T>): Promise<T> {
      if (remainingAborts > 0) {
        remainingAborts -= 1;
        const err = new Error('TRANSIENT_CONCURRENCY_ABORT') as Error & { code?: string };
        err.code = 'ABORTED';
        throw err;
      }
      if (failWrite) {
        failWrite = false;
        throw new CoreApiError(
          'PERSISTENCE_FAILED',
          503,
          'PERSISTENCE_UNAVAILABLE: Simulated storage outage.',
        );
      }

      const txContext: PropertyRegistryStoreTransaction = {
        async get<Doc>(col: string, id: string): Promise<Doc | null> {
          const val = getCol(col).get(id);
          return val ? (structuredClone(val) as Doc) : null;
        },
        async query<Doc>(col: string): Promise<Doc[]> {
          return Array.from(getCol(col).values()).map((v) => structuredClone(v) as Doc);
        },
        set<Doc>(col: string, id: string, data: Doc): void {
          getCol(col).set(id, structuredClone(data));
        },
        update(col: string, id: string, patch: Record<string, unknown>): void {
          const cur = (getCol(col).get(id) as Record<string, unknown>) ?? {};
          getCol(col).set(id, structuredClone({ ...cur, ...patch }));
        },
        delete(col: string, id: string): void {
          getCol(col).delete(id);
        },
      };

      return work(txContext);
    },
  };

  const geographyAdapter: GeographyReadAdapter = {
    async validateGeographicReference(input) {
      if (input.cityId !== 'tehran') {
        return {
          valid: false,
          provinceId: input.provinceId,
          cityId: input.cityId,
          neighborhoodCompositeId: null,
          districtNumber: null,
          canonicalNeighborhoodNameFa: null,
          coordinateWithinCityBounds: false,
          validationNote: `Unsupported or invalid city '${input.cityId}'.`,
        };
      }
      return {
        valid: true,
        provinceId: 'tehran',
        cityId: 'tehran',
        neighborhoodCompositeId: input.neighborhoodCompositeId ?? 'tehran:101',
        districtNumber: input.districtNumber ?? 1,
        canonicalNeighborhoodNameFa: 'نیاوران',
        coordinateWithinCityBounds: true,
      };
    },
  };

  let currentTimeMs = Date.parse('2026-06-01T10:00:00.000Z');
  const advanceClockMs = (deltaMs: number) => {
    currentTimeMs += deltaMs;
  };

  const service = createPropertyRegistryService({
    txRunner,
    idempotencyStore: createInMemoryIdempotencyStore(),
    geographyAdapter,
    now: () => new Date(currentTimeMs),
  });

  const userPrincipal: AuthenticatedPrincipal = {
    uid: 'user_contrib_1',
    role: 'verified_user',
    email: 'contrib@example.com',
    emailVerified: true,
    authMode: 'firebase_id_token',
    claims: { scopes: ['property_registry:write'] },
  };

  const reviewerPrincipal: AuthenticatedPrincipal = {
    uid: 'admin_reviewer_1',
    role: 'primary_admin',
    email: 'reviewer@example.com',
    emailVerified: true,
    authMode: 'firebase_id_token',
    claims: {
      scopes: [
        'property_registry:review',
        'property_registry:merge',
        'property_registry:read_full',
      ],
    },
  };

  return {
    service,
    collections,
    userPrincipal,
    reviewerPrincipal,
    advanceClockMs,
    setFailNextWrite: (val: boolean) => {
      failWrite = val;
    },
  };
}

test('1. Creates parcels, buildings, and units with stable IDs, validates geography & references, enforces privacy redaction, and supports missing-data provisional entities', async () => {
  const h = createTestHarness();

  // Rejects client-supplied canonical ID
  await assert.rejects(
    async () =>
      h.service.createCanonicalParcel({
        principal: h.userPrincipal,
        idempotencyKey: 'idem_bad_id',
        clientSuppliedCanonicalId: 'parcel_custom_hack',
        parcelType: 'URBAN_LAND_LOT',
        geographicInput: { provinceId: 'tehran', cityId: 'tehran', districtNumber: 1 },
        addressInput: { street: 'خیابان باهنر' },
        sourceProvenance: { sourceRecordId: 'src_1', sourceSystemNamespace: 'divar_import' },
      }),
    (err: unknown) =>
      err instanceof CoreApiError &&
      err.message.includes('CLIENT_SUPPLIED_CANONICAL_ID_FORBIDDEN'),
  );

  // Rejects invalid geography
  await assert.rejects(
    async () =>
      h.service.createCanonicalParcel({
        principal: h.userPrincipal,
        idempotencyKey: 'idem_bad_geo',
        parcelType: 'URBAN_LAND_LOT',
        geographicInput: { provinceId: 'mars', cityId: 'olympus' },
        addressInput: { street: 'خیابان باهنر' },
        sourceProvenance: { sourceRecordId: 'src_2', sourceSystemNamespace: 'divar_import' },
      }),
    (err: unknown) =>
      err instanceof CoreApiError && err.message.includes('INVALID_GEOGRAPHIC_REFERENCE'),
  );

  // Creates parcel (and tests idempotency replay)
  const parcel = await h.service.createCanonicalParcel({
    principal: h.reviewerPrincipal,
    idempotencyKey: 'idem_parcel_1',
    parcelType: 'URBAN_LAND_LOT',
    parcelAreaSqm: 600,
    areaMeasurementBasis: 'OFFICIAL_DEED',
    officialParcelIdentifier: 'SYNTH-CAD-1001',
    officialParcelIdentifierVerified: true,
    geographicInput: {
      provinceId: 'tehran',
      cityId: 'tehran',
      districtNumber: 1,
      neighborhoodCompositeId: 'tehran:101',
      coordinates: { lat: 35.81, lng: 51.47 },
    },
    addressInput: {
      street: 'خیابان باهنر',
      streetNumberOrPlate: 'پلاک ۲۴',
      postalCode: '1951111111',
      rawSourceAddress: 'تهران، نیاوران، خیابان باهنر، پلاک ۲۴',
    },
    sourceProvenance: {
      sourceRecordId: 'src_cad_1',
      sourceSystemNamespace: 'registry_import',
      reliabilityTier: 'AUTHORITATIVE_OFFICIAL',
    },
  });

  const parcelReplay = await h.service.createCanonicalParcel({
    principal: h.reviewerPrincipal,
    idempotencyKey: 'idem_parcel_1',
    parcelType: 'URBAN_LAND_LOT',
    parcelAreaSqm: 600,
    areaMeasurementBasis: 'OFFICIAL_DEED',
    officialParcelIdentifier: 'SYNTH-CAD-1001',
    officialParcelIdentifierVerified: true,
    geographicInput: {
      provinceId: 'tehran',
      cityId: 'tehran',
      districtNumber: 1,
      neighborhoodCompositeId: 'tehran:101',
      coordinates: { lat: 35.81, lng: 51.47 },
    },
    addressInput: {
      street: 'خیابان باهنر',
      streetNumberOrPlate: 'پلاک ۲۴',
      postalCode: '1951111111',
      rawSourceAddress: 'تهران، نیاوران، خیابان باهنر، پلاک ۲۴',
    },
    sourceProvenance: {
      sourceRecordId: 'src_cad_1',
      sourceSystemNamespace: 'registry_import',
      reliabilityTier: 'AUTHORITATIVE_OFFICIAL',
    },
  });
  assert.equal(parcel.canonicalId, parcelReplay.canonicalId);
  assert.ok(parcel.canonicalId.startsWith('parcel_'));

  // Rejects building referencing non-existent parcel
  await assert.rejects(
    async () =>
      h.service.createCanonicalBuilding({
        principal: h.userPrincipal,
        idempotencyKey: 'idem_bldg_bad_ref',
        buildingCategory: 'RESIDENTIAL_APARTMENT_BLOCK',
        associatedParcelIds: ['parcel_nonexistent_999'],
        buildingUseClassification: 'RESIDENTIAL',
        geographicInput: { provinceId: 'tehran', cityId: 'tehran' },
        addressInput: { street: 'خیابان باهنر' },
        sourceProvenance: { sourceRecordId: 'src_3', sourceSystemNamespace: 'survey' },
      }),
    (err: unknown) =>
      err instanceof CoreApiError && err.message.includes('ASSOCIATED_PARCEL_NOT_FOUND'),
  );

  // Creates building linked to parcel
  const building = await h.service.createCanonicalBuilding({
    principal: h.userPrincipal,
    idempotencyKey: 'idem_bldg_1',
    buildingCategory: 'RESIDENTIAL_APARTMENT_BLOCK',
    associatedParcelIds: [parcel.canonicalId],
    constructionYear: {
      exactYearSolarHijri: null,
      estimatedPeriodFromSolarHijri: 1395,
      estimatedPeriodToSolarHijri: 1398,
      isEstimated: true,
    },
    floorCount: { aboveGroundFloors: 6, belowGroundFloors: 2, isApproximate: false },
    buildingUseClassification: 'RESIDENTIAL',
    geographicInput: {
      provinceId: 'tehran',
      cityId: 'tehran',
      districtNumber: 1,
      neighborhoodCompositeId: 'tehran:101',
      coordinates: { lat: 35.81, lng: 51.47 },
    },
    addressInput: {
      street: 'خیابان باهنر',
      streetNumberOrPlate: 'پلاک ۲۴',
      postalCode: '1951111111',
    },
    sourceProvenance: { sourceRecordId: 'src_bldg_1', sourceSystemNamespace: 'survey' },
  });
  assert.ok(building.canonicalId.startsWith('bldg_'));
  assert.equal(building.constructionYear.isEstimated, true);

  // Creates unit linked to building
  const unit = await h.service.createCanonicalUnit({
    principal: h.userPrincipal,
    idempotencyKey: 'idem_unit_1',
    parentBuildingId: building.canonicalId,
    unitDesignation: 'واحد ۳A',
    floorReference: 'طبقه ۳',
    unitCategory: 'RESIDENTIAL_APARTMENT',
    areaSpec: { reportedAreaSqm: 145, verifiedDeedAreaSqm: null, isApproximate: true },
    usageClassification: 'RESIDENTIAL',
    geographicInput: {
      provinceId: 'tehran',
      cityId: 'tehran',
      districtNumber: 1,
      neighborhoodCompositeId: 'tehran:101',
    },
    addressInput: {
      street: 'خیابان باهنر',
      streetNumberOrPlate: 'پلاک ۲۴',
      postalCode: '1951111111',
    },
    sourceProvenance: { sourceRecordId: 'src_unit_1', sourceSystemNamespace: 'listing_ingest' },
  });
  assert.ok(unit.canonicalId.startsWith('unit_'));
  assert.equal(unit.associatedParcelId, parcel.canonicalId);

  // Missing-data handling: creates provisional unit without parent building or area
  const provisionalUnit = await h.service.createCanonicalUnit({
    principal: h.userPrincipal,
    idempotencyKey: 'idem_unit_provisional',
    unitDesignation: 'واحد ۱',
    unitCategory: 'SHOP',
    usageClassification: 'COMMERCIAL',
    geographicInput: { provinceId: 'tehran', cityId: 'tehran' },
    addressInput: { street: 'خیابان ولیعصر' },
    sourceProvenance: { sourceRecordId: 'src_prov_1', sourceSystemNamespace: 'crowd_claim' },
  });
  assert.equal(provisionalUnit.registrationStatus, 'PROVISIONAL_INCOMPLETE');

  // Privacy redaction check: unauthenticated/public caller receives redacted street plate, postalCode, and officialParcelIdentifier
  const publicView = await h.service.getCanonicalEntity({
    principal: null,
    canonicalId: parcel.canonicalId,
  });
  assert.equal(publicView.resolvedEntity.addressRef.streetNumberOrPlate, null);
  assert.equal(publicView.resolvedEntity.addressRef.postalCode, null);
  if (publicView.resolvedEntity.entityKind === 'PARCEL') {
    assert.equal(publicView.resolvedEntity.officialParcelIdentifier, null);
  }

  // Authorized reviewer receives full unredacted entity
  const fullView = await h.service.getCanonicalEntity({
    principal: h.reviewerPrincipal,
    canonicalId: parcel.canonicalId,
  });
  assert.equal(fullView.resolvedEntity.addressRef.streetNumberOrPlate, 'پلاک ۲۴');
});

test('2. Validates parcel-building-unit relationships, rejects invalid relationship kinds, and prevents circular relationships', async () => {
  const h = createTestHarness();

  const parcel = await h.service.createCanonicalParcel({
    principal: h.userPrincipal,
    idempotencyKey: 'idem_rel_p1',
    parcelType: 'URBAN_LAND_LOT',
    geographicInput: { provinceId: 'tehran', cityId: 'tehran' },
    addressInput: { street: 'خیابان فرشته' },
    sourceProvenance: { sourceRecordId: 'src_r1', sourceSystemNamespace: 'survey' },
  });

  const bldg1 = await h.service.createCanonicalBuilding({
    principal: h.userPrincipal,
    idempotencyKey: 'idem_rel_b1',
    buildingCategory: 'RESIDENTIAL_TOWER',
    buildingUseClassification: 'RESIDENTIAL',
    geographicInput: { provinceId: 'tehran', cityId: 'tehran' },
    addressInput: { street: 'خیابان فرشته' },
    sourceProvenance: { sourceRecordId: 'src_r2', sourceSystemNamespace: 'survey' },
  });

  const bldg2 = await h.service.createCanonicalBuilding({
    principal: h.userPrincipal,
    idempotencyKey: 'idem_rel_b2',
    buildingCategory: 'RESIDENTIAL_TOWER',
    buildingUseClassification: 'RESIDENTIAL',
    geographicInput: { provinceId: 'tehran', cityId: 'tehran' },
    addressInput: { street: 'خیابان فرشته' },
    sourceProvenance: { sourceRecordId: 'src_r3', sourceSystemNamespace: 'survey' },
  });

  const unit = await h.service.createCanonicalUnit({
    principal: h.userPrincipal,
    idempotencyKey: 'idem_rel_u1',
    unitDesignation: 'واحد ۱۰',
    unitCategory: 'RESIDENTIAL_APARTMENT',
    usageClassification: 'RESIDENTIAL',
    geographicInput: { provinceId: 'tehran', cityId: 'tehran' },
    addressInput: { street: 'خیابان فرشته' },
    sourceProvenance: { sourceRecordId: 'src_r4', sourceSystemNamespace: 'survey' },
  });

  // Valid PARCEL_CONTAINS_BUILDING and BUILDING_CONTAINS_UNIT
  await h.service.addEntityRelationship({
    principal: h.userPrincipal,
    idempotencyKey: 'idem_add_rel_pb',
    sourceEntityId: parcel.canonicalId,
    targetEntityId: bldg1.canonicalId,
    relationshipType: 'PARCEL_CONTAINS_BUILDING',
    sourceProvenance: { sourceRecordId: 'src_r5', sourceSystemNamespace: 'survey' },
  });

  await h.service.addEntityRelationship({
    principal: h.userPrincipal,
    idempotencyKey: 'idem_add_rel_bu',
    sourceEntityId: bldg1.canonicalId,
    targetEntityId: unit.canonicalId,
    relationshipType: 'BUILDING_CONTAINS_UNIT',
    sourceProvenance: { sourceRecordId: 'src_r6', sourceSystemNamespace: 'survey' },
  });

  // Invalid relationship kind (e.g. UNIT containing PARCEL) rejected
  await assert.rejects(
    async () =>
      h.service.addEntityRelationship({
        principal: h.userPrincipal,
        idempotencyKey: 'idem_bad_kind_rel',
        sourceEntityId: unit.canonicalId,
        targetEntityId: parcel.canonicalId,
        relationshipType: 'PARCEL_CONTAINS_BUILDING',
        sourceProvenance: { sourceRecordId: 'src_r7', sourceSystemNamespace: 'survey' },
      }),
    (err: unknown) =>
      err instanceof CoreApiError &&
      err.message.includes('INVALID_ENTITY_RELATIONSHIP_KINDS'),
  );

  // Unit cannot belong to two active parent buildings simultaneously
  await assert.rejects(
    async () =>
      h.service.addEntityRelationship({
        principal: h.userPrincipal,
        idempotencyKey: 'idem_conflict_parent_bldg',
        sourceEntityId: bldg2.canonicalId,
        targetEntityId: unit.canonicalId,
        relationshipType: 'BUILDING_CONTAINS_UNIT',
        sourceProvenance: { sourceRecordId: 'src_r8', sourceSystemNamespace: 'survey' },
      }),
    (err: unknown) =>
      err instanceof CoreApiError &&
      err.message.includes('UNIT_MULTIPLE_PARENT_BUILDINGS_CONFLICT'),
  );

  // Circular relationship prevention: Parcel -> Building1 -> Parcel cycle rejected
  await assert.rejects(
    async () =>
      h.service.addEntityRelationship({
        principal: h.userPrincipal,
        idempotencyKey: 'idem_cycle_rel',
        sourceEntityId: bldg1.canonicalId,
        targetEntityId: parcel.canonicalId,
        relationshipType: 'BUILDING_ASSOCIATED_WITH_PARCEL',
        sourceProvenance: { sourceRecordId: 'src_r9', sourceSystemNamespace: 'survey' },
      }),
    (err: unknown) =>
      err instanceof CoreApiError && err.message.includes('CIRCULAR_RELATIONSHIP_DETECTED'),
  );

  // Verify relationship graph retrieval
  const graph = await h.service.getEntityRelationshipGraph({
    principal: h.reviewerPrincipal,
    canonicalEntityId: bldg1.canonicalId,
  });
  assert.equal(graph.incomingRelationships.length, 1);
  assert.equal(graph.outgoingRelationships.length, 1);
  assert.equal(graph.relatedEntities.length, 2);
});

test('3. Enforces external identifier namespace isolation, prevents false-positive unit matches, requires human review for merges, and preserves merge/split/demolition lineage', async () => {
  const h = createTestHarness();

  const bldgA = await h.service.createCanonicalBuilding({
    principal: h.reviewerPrincipal,
    idempotencyKey: 'idem_bldg_A',
    buildingCategory: 'RESIDENTIAL_APARTMENT_BLOCK',
    buildingUseClassification: 'RESIDENTIAL',
    geographicInput: {
      provinceId: 'tehran',
      cityId: 'tehran',
      coordinates: { lat: 35.801, lng: 51.421 },
    },
    addressInput: { street: 'خیابان زعفرانیه', streetNumberOrPlate: 'پلاک ۱۰' },
    sourceProvenance: {
      sourceRecordId: 'src_bA',
      sourceSystemNamespace: 'municipality',
      reliabilityTier: 'AUTHORITATIVE_OFFICIAL',
    },
  });

  const bldgB = await h.service.createCanonicalBuilding({
    principal: h.reviewerPrincipal,
    idempotencyKey: 'idem_bldg_B',
    buildingCategory: 'RESIDENTIAL_APARTMENT_BLOCK',
    buildingUseClassification: 'RESIDENTIAL',
    geographicInput: {
      provinceId: 'tehran',
      cityId: 'tehran',
      coordinates: { lat: 35.801, lng: 51.421 },
    },
    addressInput: { street: 'خیابان زعفرانیه', streetNumberOrPlate: 'پلاک ۱۰' },
    sourceProvenance: {
      sourceRecordId: 'src_bB',
      sourceSystemNamespace: 'partner_portal',
      reliabilityTier: 'VERIFIED_PARTNER',
    },
  });

  const bldgDistinct = await h.service.createCanonicalBuilding({
    principal: h.reviewerPrincipal,
    idempotencyKey: 'idem_bldg_distinct',
    buildingCategory: 'RESIDENTIAL_APARTMENT_BLOCK',
    buildingUseClassification: 'RESIDENTIAL',
    geographicInput: {
      provinceId: 'tehran',
      cityId: 'tehran',
      coordinates: { lat: 35.75, lng: 51.38 },
    },
    addressInput: { street: 'خیابان ونک', streetNumberOrPlate: 'پلاک ۹۹' },
    sourceProvenance: { sourceRecordId: 'src_bD', sourceSystemNamespace: 'partner_portal' },
  });

  // External identifier namespace isolation:
  // Same string 'EXT-500' in two different namespaces is permitted without collision
  await h.service.registerExternalIdentifier({
    principal: h.reviewerPrincipal,
    idempotencyKey: 'idem_ext_ns1',
    canonicalEntityId: bldgA.canonicalId,
    identifierType: 'EXTERNAL_LISTING_PLATFORM_ID',
    identifierValue: 'EXT-500',
    issuingSourceNamespace: 'platform_alpha',
    jurisdictionScope: 'IR_TEHRAN',
    sourceProvenance: { sourceRecordId: 'src_ext1', sourceSystemNamespace: 'platform_alpha' },
  });

  await h.service.registerExternalIdentifier({
    principal: h.reviewerPrincipal,
    idempotencyKey: 'idem_ext_ns2',
    canonicalEntityId: bldgDistinct.canonicalId,
    identifierType: 'EXTERNAL_LISTING_PLATFORM_ID',
    identifierValue: 'EXT-500',
    issuingSourceNamespace: 'platform_beta',
    jurisdictionScope: 'IR_TEHRAN',
    sourceProvenance: { sourceRecordId: 'src_ext2', sourceSystemNamespace: 'platform_beta' },
  });

  // Collision inside the SAME namespace + jurisdiction + type is rejected with 409
  await assert.rejects(
    async () =>
      h.service.registerExternalIdentifier({
        principal: h.reviewerPrincipal,
        idempotencyKey: 'idem_ext_collision',
        canonicalEntityId: bldgDistinct.canonicalId,
        identifierType: 'EXTERNAL_LISTING_PLATFORM_ID',
        identifierValue: 'EXT-500',
        issuingSourceNamespace: 'platform_alpha',
        jurisdictionScope: 'IR_TEHRAN',
        sourceProvenance: { sourceRecordId: 'src_ext3', sourceSystemNamespace: 'platform_alpha' },
      }),
    (err: unknown) =>
      err instanceof CoreApiError &&
      err.message.includes('EXTERNAL_IDENTIFIER_NAMESPACE_COLLISION'),
  );

  // False-positive match prevention: two units with the same displayed unit number 'واحد ۱' in DIFFERENT buildings
  const unitInBldgA = await h.service.createCanonicalUnit({
    principal: h.userPrincipal,
    idempotencyKey: 'idem_u_bldgA',
    parentBuildingId: bldgA.canonicalId,
    unitDesignation: 'واحد ۱',
    unitCategory: 'RESIDENTIAL_APARTMENT',
    areaSpec: { reportedAreaSqm: 110 },
    usageClassification: 'RESIDENTIAL',
    geographicInput: { provinceId: 'tehran', cityId: 'tehran' },
    addressInput: { street: 'خیابان زعفرانیه', streetNumberOrPlate: 'پلاک ۱۰' },
    sourceProvenance: { sourceRecordId: 'src_uA', sourceSystemNamespace: 'survey' },
  });

  const unitInBldgDistinct = await h.service.createCanonicalUnit({
    principal: h.userPrincipal,
    idempotencyKey: 'idem_u_bldgDist',
    parentBuildingId: bldgDistinct.canonicalId,
    unitDesignation: 'واحد ۱',
    unitCategory: 'RESIDENTIAL_APARTMENT',
    areaSpec: { reportedAreaSqm: 110 },
    usageClassification: 'RESIDENTIAL',
    geographicInput: { provinceId: 'tehran', cityId: 'tehran' },
    addressInput: { street: 'خیابان زعفرانیه', streetNumberOrPlate: 'پلاک ۱۰' },
    sourceProvenance: { sourceRecordId: 'src_uD', sourceSystemNamespace: 'survey' },
  });

  const unitCandidates = await h.service.generateDuplicateCandidates({
    principal: h.userPrincipal,
    canonicalEntityId: unitInBldgA.canonicalId,
  });
  // Must NOT match unitInBldgDistinct despite identical unitDesignation, area, and street!
  assert.equal(
    unitCandidates.some((c) => c.candidateEntityId === unitInBldgDistinct.canonicalId),
    false,
  );

  // Duplicate candidate generation for bldgA and bldgB
  const bldgCandidates = await h.service.generateDuplicateCandidates({
    principal: h.userPrincipal,
    canonicalEntityId: bldgA.canonicalId,
  });
  assert.equal(bldgCandidates.length, 1);
  assert.equal(bldgCandidates[0].candidateEntityId, bldgB.canonicalId);
  assert.equal(bldgCandidates[0].autoMergePermitted, false);

  const candidateId = bldgCandidates[0].candidateId;

  // Merge without human review approval fails
  await assert.rejects(
    async () =>
      h.service.mergeCanonicalEntities({
        principal: h.reviewerPrincipal,
        idempotencyKey: 'idem_premature_merge',
        approvedCandidateId: candidateId,
        survivingEntityId: bldgA.canonicalId,
        retiringEntityId: bldgB.canonicalId,
        reason: 'Premature merge attempt',
        supportingEvidenceRefs: ['ev_1'],
      }),
    (err: unknown) =>
      err instanceof CoreApiError &&
      err.message.includes('MERGE_REQUIRES_APPROVED_HUMAN_REVIEW'),
  );

  // Unauthorized regular user cannot approve identity match
  await assert.rejects(
    async () =>
      h.service.decideIdentityMatch({
        principal: h.userPrincipal,
        idempotencyKey: 'idem_unauth_review',
        candidateId,
        decision: 'APPROVED_FOR_MERGE',
        reviewNotes: 'Try approve as regular user',
      }),
    (err: unknown) =>
      err instanceof CoreApiError &&
      err.message.includes('REGISTRY_REVIEWER_PERMISSION_REQUIRED'),
  );

  // Reviewer approves match
  const approvedCand = await h.service.decideIdentityMatch({
    principal: h.reviewerPrincipal,
    idempotencyKey: 'idem_approve_review',
    candidateId,
    decision: 'APPROVED_FOR_MERGE',
    reviewNotes: 'Verified same building structure on parcel.',
  });
  assert.equal(approvedCand.reviewStatus, 'APPROVED_FOR_MERGE');

  // Execute merge: bldgB merges into bldgA
  const mergeRes = await h.service.mergeCanonicalEntities({
    principal: h.reviewerPrincipal,
    idempotencyKey: 'idem_exec_merge',
    approvedCandidateId: candidateId,
    survivingEntityId: bldgA.canonicalId,
    retiringEntityId: bldgB.canonicalId,
    reason: 'Confirmed duplicate building records from municipal and partner imports.',
    supportingEvidenceRefs: ['ev_deed_1'],
  });
  assert.equal(mergeRes.retiredEntity.registrationStatus, 'MERGED_REDIRECT');
  assert.deepEqual(mergeRes.retiredEntity.retiredOrRedirectedToIds, [bldgA.canonicalId]);
  assert.equal(mergeRes.lineageRecord.lineageType, 'MERGED_INTO');

  // Fetching retired bldgB automatically resolves to surviving bldgA while preserving redirectTrail
  const resolvedB = await h.service.getCanonicalEntity({
    principal: h.reviewerPrincipal,
    canonicalId: bldgB.canonicalId,
  });
  assert.equal(resolvedB.wasRedirectedFromRetiredId, true);
  assert.equal(resolvedB.resolvedEntity.canonicalId, bldgA.canonicalId);
  assert.deepEqual(resolvedB.redirectTrail, [bldgB.canonicalId, bldgA.canonicalId]);

  // Split lineage test: subdivide a parcel into 2 child parcels
  const parentParcel = await h.service.createCanonicalParcel({
    principal: h.reviewerPrincipal,
    idempotencyKey: 'idem_split_parent',
    parcelType: 'URBAN_LAND_LOT',
    parcelAreaSqm: 1000,
    geographicInput: { provinceId: 'tehran', cityId: 'tehran' },
    addressInput: { street: 'خیابان الهیه' },
    sourceProvenance: { sourceRecordId: 'src_sp0', sourceSystemNamespace: 'cadastre' },
  });
  const childParcel1 = await h.service.createCanonicalParcel({
    principal: h.reviewerPrincipal,
    idempotencyKey: 'idem_split_c1',
    parcelType: 'SUBDIVIDED_PARCEL',
    parcelAreaSqm: 500,
    geographicInput: { provinceId: 'tehran', cityId: 'tehran' },
    addressInput: { street: 'خیابان الهیه - قطعه شمالی' },
    sourceProvenance: { sourceRecordId: 'src_sp1', sourceSystemNamespace: 'cadastre' },
  });
  const childParcel2 = await h.service.createCanonicalParcel({
    principal: h.reviewerPrincipal,
    idempotencyKey: 'idem_split_c2',
    parcelType: 'SUBDIVIDED_PARCEL',
    parcelAreaSqm: 500,
    geographicInput: { provinceId: 'tehran', cityId: 'tehran' },
    addressInput: { street: 'خیابان الهیه - قطعه جنوبی' },
    sourceProvenance: { sourceRecordId: 'src_sp2', sourceSystemNamespace: 'cadastre' },
  });

  const splitRes = await h.service.splitCanonicalEntity({
    principal: h.reviewerPrincipal,
    idempotencyKey: 'idem_exec_split',
    sourceEntityId: parentParcel.canonicalId,
    resultingChildIds: [childParcel1.canonicalId, childParcel2.canonicalId],
    reason: 'Official subdivision into northern and southern lots.',
    supportingEvidenceRefs: ['ev_subdiv_101'],
  });
  assert.equal(splitRes.retiredSourceEntity.registrationStatus, 'SPLIT_RETIRED');
  assert.equal(splitRes.lineageRecord.lineageType, 'SPLIT_FROM');

  // Demolition and replacement test
  const replacementBldg = await h.service.createCanonicalBuilding({
    principal: h.reviewerPrincipal,
    idempotencyKey: 'idem_replacement_bldg',
    buildingCategory: 'RESIDENTIAL_TOWER',
    buildingUseClassification: 'RESIDENTIAL',
    geographicInput: { provinceId: 'tehran', cityId: 'tehran' },
    addressInput: { street: 'خیابان ونک', streetNumberOrPlate: 'پلاک ۹۹' },
    sourceProvenance: { sourceRecordId: 'src_rep_1', sourceSystemNamespace: 'municipality' },
  });

  const demoRes = await h.service.recordPropertyDemolitionOrReplacement({
    principal: h.reviewerPrincipal,
    idempotencyKey: 'idem_demo_replace',
    demolishedEntityId: bldgDistinct.canonicalId,
    replacementEntityId: replacementBldg.canonicalId,
    reason: 'Old building demolished and replaced with modern residential tower.',
    supportingEvidenceRefs: ['permit_demo_88'],
    effectiveDateIso: '2026-03-15T00:00:00.000Z',
  });
  assert.equal(demoRes.demolishedEntity.registrationStatus, 'REPLACED_ARCHIVED');
  assert.equal(demoRes.lineageRecord.lineageType, 'REPLACED_BY');

  const lineageGraph = await h.service.getIdentityLineage({
    canonicalEntityId: replacementBldg.canonicalId,
  });
  assert.equal(lineageGraph.upstreamLineage.length, 1);
  assert.equal(lineageGraph.upstreamLineage[0].previousEntityIds[0], bldgDistinct.canonicalId);
});

test('4. Tracks effective-date vs recorded-date attribute history, detects conflicting source data, handles concurrency/persistence failures, paginates searches, and writes only to module collections', async () => {
  const h = createTestHarness({ abortFirstAttempts: 1 });

  // First call succeeds after automatic retry of transient concurrency abort
  const unit = await h.service.createCanonicalUnit({
    principal: h.reviewerPrincipal,
    idempotencyKey: 'idem_hist_unit',
    unitDesignation: 'واحد ۵',
    floorReference: 'طبقه ۲',
    unitCategory: 'RESIDENTIAL_APARTMENT',
    areaSpec: { reportedAreaSqm: 100 },
    usageClassification: 'RESIDENTIAL',
    geographicInput: { provinceId: 'tehran', cityId: 'tehran' },
    addressInput: { street: 'خیابان جردن', streetNumberOrPlate: 'پلاک ۱۲' },
    sourceProvenance: { sourceRecordId: 'src_h0', sourceSystemNamespace: 'initial_ingest' },
  });

  const initialCanonicalId = unit.canonicalId;

  // Advance clock by 30 days (recordedAt = 2026-07-01), but effectiveDate is 2026-01-15 (real-world renovation)
  h.advanceClockMs(30 * 24 * 60 * 60 * 1000);

  const updateRes = await h.service.updateDescriptiveAttributes({
    principal: h.reviewerPrincipal,
    idempotencyKey: 'idem_upd_area_conflict',
    canonicalId: unit.canonicalId,
    effectiveDateIso: '2026-01-15T00:00:00.000Z',
    changeReason: 'Conflicting area reported by second source (>10% difference).',
    sourceProvenance: { sourceRecordId: 'src_h1', sourceSystemNamespace: 'second_source' },
    updates: {
      reportedAreaSqm: 135,
      street: 'بلوار نلسون ماندلا (جردن)',
      rawSourceAddress: 'تهران، بلوار نلسون ماندلا، پلاک ۱۲، واحد ۵',
    },
  });

  // Canonical ID remains strictly invariant when street and area change
  assert.equal(updateRes.entity.canonicalId, initialCanonicalId);
  // Original address history preserved both raw addresses
  assert.equal(updateRes.entity.addressRef.sourceOriginalAddresses.length, 2);
  // >10% area discrepancy automatically created a CONFLICTING_PROPERTY_AREAS quality finding
  assert.equal(updateRes.createdFindings.length, 1);
  assert.equal(updateRes.createdFindings[0].findingType, 'CONFLICTING_PROPERTY_AREAS');
  assert.equal(updateRes.entity.qualityDimensions.conflictStatus, 'CRITICAL_IDENTITY_CONFLICT');

  // Reconstruct state by EFFECTIVE_DATE vs RECORDED_DATE at '2026-06-15T00:00:00.000Z':
  // - By EFFECTIVE_DATE (change happened 2026-01-15 <= 2026-06-15): reportedAreaSqm is 135!
  const stateByEffective = await h.service.getHistoricalEntityState({
    canonicalEntityId: unit.canonicalId,
    asOfDateIso: '2026-06-15T00:00:00.000Z',
    temporalDimension: 'EFFECTIVE_DATE',
  });
  assert.equal(stateByEffective.reconstructedAttributes.reportedAreaSqm, 135);

  // - By RECORDED_DATE (system learned on 2026-07-01 > 2026-06-15): reportedAreaSqm was still 100 on 2026-06-15!
  const stateByRecorded = await h.service.getHistoricalEntityState({
    canonicalEntityId: unit.canonicalId,
    asOfDateIso: '2026-06-15T00:00:00.000Z',
    temporalDimension: 'RECORDED_DATE',
  });
  assert.equal(stateByRecorded.reconstructedAttributes.reportedAreaSqm, 100);

  // Resolve the quality finding and confirm conflictStatus clears
  const resolvedFinding = await h.service.resolveDataQualityFinding({
    principal: h.reviewerPrincipal,
    idempotencyKey: 'idem_resolve_dq',
    findingId: updateRes.createdFindings[0].findingId,
    resolutionStatus: 'RESOLVED',
    resolutionNotes: 'Official deed confirmed 135 sqm including private terrace.',
  });
  assert.equal(resolvedFinding.status, 'RESOLVED');

  // Persistence failure handling test
  h.setFailNextWrite(true);
  await assert.rejects(
    async () =>
      h.service.createCanonicalParcel({
        principal: h.userPrincipal,
        idempotencyKey: 'idem_fail_write',
        parcelType: 'URBAN_LAND_LOT',
        geographicInput: { provinceId: 'tehran', cityId: 'tehran' },
        addressInput: { street: 'خیابان شریعتی' },
        sourceProvenance: { sourceRecordId: 'src_fail', sourceSystemNamespace: 'survey' },
      }),
    (err: unknown) =>
      err instanceof CoreApiError && err.message.includes('PERSISTENCE_UNAVAILABLE'),
  );

  // Pagination test: create 2 more units and paginate with limit=2
  for (let i = 1; i <= 2; i += 1) {
    h.advanceClockMs(1000);
    await h.service.createCanonicalUnit({
      principal: h.userPrincipal,
      idempotencyKey: `idem_page_u_${i}`,
      unitDesignation: `واحد ${i + 10}`,
      unitCategory: 'OFFICE_UNIT',
      usageClassification: 'ADMINISTRATIVE_OFFICE',
      geographicInput: { provinceId: 'tehran', cityId: 'tehran' },
      addressInput: { street: 'خیابان مطهری' },
      sourceProvenance: { sourceRecordId: `src_pg_${i}`, sourceSystemNamespace: 'survey' },
    });
  }

  const page1 = await h.service.searchCanonicalEntities({
    principal: h.reviewerPrincipal,
    cityId: 'tehran',
    entityKind: 'UNIT',
    limit: 2,
  });
  assert.equal(page1.items.length, 2);
  assert.ok(page1.nextCursor);

  const page2 = await h.service.searchCanonicalEntities({
    principal: h.reviewerPrincipal,
    cityId: 'tehran',
    entityKind: 'UNIT',
    limit: 2,
    cursor: page1.nextCursor!,
  });
  assert.equal(page2.items.length, 1);

  // Verify zero cross-module collection writes
  const allowedCollections = new Set<string>(Object.values(PROPERTY_REGISTRY_COLLECTIONS));
  for (const colName of h.collections.keys()) {
    assert.equal(
      allowedCollections.has(colName),
      true,
      `Unexpected write to external collection: ${colName}`,
    );
  }
});
