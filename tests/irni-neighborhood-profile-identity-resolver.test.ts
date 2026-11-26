import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createIrniNeighborhoodProfileIdentityResolver,
} from '../worker/irni/neighborhoodProfileIdentityResolver';
import type {
  IrniGeographicRpcBindingV2,
  IrniRpcEntityV2,
  IrniRpcMetadataV2,
  IrniRpcResult,
} from '../worker/irni/irniGeographicRpcV2Types';
import { encodeRadarCityNeighborhoodAlias } from '../worker/irni/radarLegacyIdentifiers';

const CHECKSUM = 'a'.repeat(64);
const ID = 'IRGEO1-' + 'b'.repeat(64);
const META: IrniRpcMetadataV2 = {
  contractVersion: '2.0.0',
  contractState: 'ACTIVE',
  canonicalIdentityContractVersion: 'IRGEO-IDENTITY-1.0.0',
  idAlgorithmVersion: 'IRGEO1-SHA256-FULL-V1',
  geographicSchemaVersion: '1.0.0',
  registryRevision: 19,
  registryChecksum: CHECKSUM,
  integrityVerified: true,
  canonicalEntityCount: 9828,
  relationshipCount: 9827,
  identityAnchorCount: 9828,
  sourceMappingCount: 10341,
  legacyAliasCount: 11,
};
const ENTITY: IrniRpcEntityV2 = {
  geographicEntityId: ID,
  identityAnchor: 'NCC:URBAN_NEIGHBORHOOD:12345',
  identityAnchorType: 'TYPE_A_SOURCE_NATIVE',
  entityType: 'URBAN_NEIGHBORHOOD',
  classificationSystemId: 'IRGEO-URBAN-NEIGHBORHOOD',
  canonicalNameFa: 'محله نمونه',
  alternativeNamesFa: [],
  nameEn: 'Sample',
  parentGeographicEntityId: null,
  parentNameFa: null,
  provinceGeographicEntityId: null,
  provinceNameFa: null,
  sourceNativeIdentifiers: [],
  sourceDatasetReferences: ['DATASET-1'],
  identityStatus: 'CONFIRMED_CANONICAL',
  verificationStatus: 'VERIFIED_SECONDARY_GAZETTEER',
  lifecycleStatus: 'ACTIVE',
  boundaryStatus: 'POINT_LOCATION_ONLY',
  pointCoordinates: { latitude: 35.7, longitude: 51.4 },
  areaSqKm: null,
  boundaryReference: null,
  validFrom: null,
  validTo: null,
  recordedAt: '2026-11-25T00:00:00.000Z',
  schemaVersion: '1.0.0',
  isSyntheticFixture: false,
  metadataCoverage: {},
  registryIdentity: {
    identityAnchor: 'NCC:URBAN_NEIGHBORHOOD:12345',
    anchorType: 'TYPE_A_SOURCE_NATIVE',
    issuedOrderIndex: 123,
    issuedAtRegistryRevision: 19,
    identityStatus: 'CONFIRMED_CANONICAL',
    retiredAtRegistryRevision: null,
    retiredReason: null,
    survivingGeographicEntityId: null,
  },
};
function ok<T>(value: T): IrniRpcResult<T> { return { ok: true, value }; }
function createBinding(overrides: Partial<IrniGeographicRpcBindingV2> = {}): IrniGeographicRpcBindingV2 {
  return {
    getApprovedRegistryMetadata: async () => ok(META),
    getApprovedEntityByCanonicalId: async () => ok(ENTITY),
    resolveIdentifier: async (_query, revision) => ok({
      queryIdentifier: 'unused',
      resolved: true,
      canonicalGeographicEntityId: ID,
      resolutionPath: 'LEGACY_ALIAS',
      registryRevision: revision,
    }),
    listApprovedEntitiesPaginated: async (_filter, _page, revision) => ok({
      registryRevision: revision, registryChecksum: CHECKSUM,
      page: { items: [ENTITY], nextCursor: null, previousCursor: null, hasMore: false,
        pageSize: 1, totalMatchedCount: 1, appliedSort: { field: 'issuedOrderIndex', direction: 'ASC' } },
    }),
    listApprovedRelationshipsForEntity: async (_id, revision) => ok({
      registryRevision: revision, registryChecksum: CHECKSUM, relationships: [],
    }),
    listApprovedLegacyAliases: async (_system, revision) => ok({
      registryRevision: revision, registryChecksum: CHECKSUM,
      aliases: [{
        aliasId: 'alias-1',
        legacySystemCode: 'TEHRAN_RADAR',
        legacyIdentifierValue: encodeRadarCityNeighborhoodAlias('tehran', 13),
        canonicalGeographicEntityId: ID,
        aliasStatus: 'ACTIVE_COMPATIBILITY_ALIAS',
        resolutionEvidenceRef: 'evidence:reviewed-crosswalk-1',
        recordedAtRegistryRevision: revision,
        automaticResolutionEligible: true,
      }],
    }),
    ...overrides,
  };
}
const CONFIG = {
  expectedCanonicalIdentityContractVersion: 'IRGEO-IDENTITY-1.0.0',
  expectedIdAlgorithmVersion: 'IRGEO1-SHA256-FULL-V1',
};

test('resolves a neighborhood only through an approved versioned Radar alias and canonical entity', async () => {
  const resolver = createIrniNeighborhoodProfileIdentityResolver(createBinding(), CONFIG);
  const result = await resolver({ cityId: 'tehran', legacyNeighborhoodId: 13 });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.identity.geographicEntityId, ID);
    assert.equal(result.identity.identityStatus, 'CONFIRMED_CANONICAL');
    assert.equal(result.identity.verificationStatus, 'VERIFIED_SECONDARY_GAZETTEER');
  }
});

test('fails closed when the Worker Service Binding is missing', async () => {
  const resolver = createIrniNeighborhoodProfileIdentityResolver(undefined, CONFIG);
  assert.deepEqual(await resolver({ cityId: 'tehran', legacyNeighborhoodId: 13 }), {
    ok: false, code: 'IRNI_BINDING_UNAVAILABLE',
  });
});

test('rejects a registry with unexpected identity contract or ID algorithm', async () => {
  const binding = createBinding({
    getApprovedRegistryMetadata: async () => ok({ ...META, idAlgorithmVersion: 'UNEXPECTED' }),
  });
  const resolver = createIrniNeighborhoodProfileIdentityResolver(binding, CONFIG);
  assert.deepEqual(await resolver({ cityId: 'tehran', legacyNeighborhoodId: 13 }), {
    ok: false, code: 'IRNI_REGISTRY_UNVERIFIED',
  });
});

test('rejects missing aliases rather than guessing by name, point, or numeric neighborhood ID', async () => {
  const binding = createBinding({
    listApprovedLegacyAliases: async (_system, revision) => ok({
      registryRevision: revision, registryChecksum: CHECKSUM, aliases: [],
    }),
  });
  const resolver = createIrniNeighborhoodProfileIdentityResolver(binding, CONFIG);
  assert.deepEqual(await resolver({ cityId: 'tehran', legacyNeighborhoodId: 13 }), {
    ok: false, code: 'IRNI_ALIAS_NOT_FOUND',
  });
});

test('rejects conflicting approved aliases for the same legacy neighborhood', async () => {
  const alias = {
    aliasId: 'alias-2',
    legacySystemCode: 'TEHRAN_RADAR' as const,
    legacyIdentifierValue: encodeRadarCityNeighborhoodAlias('tehran', 13),
    canonicalGeographicEntityId: 'IRGEO1-' + 'c'.repeat(64),
    aliasStatus: 'ACTIVE_COMPATIBILITY_ALIAS' as const,
    resolutionEvidenceRef: 'evidence:reviewed-crosswalk-2',
    recordedAtRegistryRevision: 19,
    automaticResolutionEligible: true,
  };
  const binding = createBinding({
    listApprovedLegacyAliases: async (_system, revision) => ok({
      registryRevision: revision, registryChecksum: CHECKSUM,
      aliases: [{
        aliasId: 'alias-1',
        legacySystemCode: 'TEHRAN_RADAR',
        legacyIdentifierValue: encodeRadarCityNeighborhoodAlias('tehran', 13),
        canonicalGeographicEntityId: ID,
        aliasStatus: 'ACTIVE_COMPATIBILITY_ALIAS',
        resolutionEvidenceRef: 'evidence:reviewed-crosswalk-1',
        recordedAtRegistryRevision: revision,
        automaticResolutionEligible: true,
      }, alias],
    }),
  });
  const resolver = createIrniNeighborhoodProfileIdentityResolver(binding, CONFIG);
  assert.deepEqual(await resolver({ cityId: 'tehran', legacyNeighborhoodId: 13 }), {
    ok: false, code: 'IRNI_ALIAS_AMBIGUOUS',
  });
});

test('rejects aliases that are not eligible for automatic resolution', async () => {
  const binding = createBinding({
    listApprovedLegacyAliases: async (_system, revision) => ok({
      registryRevision: revision, registryChecksum: CHECKSUM,
      aliases: [{
        aliasId: 'alias-1',
        legacySystemCode: 'TEHRAN_RADAR',
        legacyIdentifierValue: encodeRadarCityNeighborhoodAlias('tehran', 13),
        canonicalGeographicEntityId: ID,
        aliasStatus: 'ACTIVE_COMPATIBILITY_ALIAS',
        resolutionEvidenceRef: 'evidence:manual-only',
        recordedAtRegistryRevision: revision,
        automaticResolutionEligible: false,
      }],
    }),
  });
  const resolver = createIrniNeighborhoodProfileIdentityResolver(binding, CONFIG);
  assert.deepEqual(await resolver({ cityId: 'tehran', legacyNeighborhoodId: 13 }), {
    ok: false, code: 'IRNI_ALIAS_NOT_AUTOMATICALLY_RESOLVABLE',
  });
});

test('rejects canonical records that are not active neighborhood entities', async () => {
  const binding = createBinding({
    getApprovedEntityByCanonicalId: async () => ok({ ...ENTITY, entityType: 'URBAN_DISTRICT' }),
  });
  const resolver = createIrniNeighborhoodProfileIdentityResolver(binding, CONFIG);
  assert.deepEqual(await resolver({ cityId: 'tehran', legacyNeighborhoodId: 13 }), {
    ok: false, code: 'IRNI_CANONICAL_ENTITY_MISMATCH',
  });
});

test('rejects malformed legacy identifiers before any RPC call', async () => {
  let calls = 0;
  const binding = createBinding({
    getApprovedRegistryMetadata: async () => { calls += 1; return ok(META); },
  });
  const resolver = createIrniNeighborhoodProfileIdentityResolver(binding, CONFIG);
  const result = await resolver({ cityId: 'Tehran', legacyNeighborhoodId: 0 });
  assert.deepEqual(result, { ok: false, code: 'IRNI_ALIAS_NOT_FOUND' });
  assert.equal(calls, 0);
});
