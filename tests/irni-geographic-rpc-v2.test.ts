import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createWorkerRequestContext } from '../worker/contextAndSecurity';
import { findMigrationRegisterEntry } from '../worker/migrationRegister';
import { dispatchWorkerApiOrSeoRequest } from '../worker/router';
import { IrniGeographicRpcV2Client } from '../worker/irni/irniGeographicRpcV2Client';
import type {
  IrniGeographicRpcBindingV2,
  IrniRpcEntityV2,
  IrniRpcMetadataV2,
  IrniRpcResult,
} from '../worker/irni/irniGeographicRpcV2Types';
import { handleIrniCanonicalRpcV2Route } from '../worker/routes/irniCanonicalRpcV2Routes';
import { handleHealthAndMetadataRoute } from '../worker/routes/healthAndMetadataRoutes';
import type { D1Database } from '../worker/types';

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
  alternativeNamesFa: ['نمونه'],
  nameEn: 'Sample',
  parentGeographicEntityId: null,
  parentNameFa: null,
  provinceGeographicEntityId: null,
  provinceNameFa: null,
  sourceNativeIdentifiers: [{
    identifierNamespaceCode: 'NCC',
    sourceNativeId: '12345',
    sourceDatasetId: 'DATASET-1',
    isPrimaryAnchorSource: true,
  }],
  sourceDatasetReferences: ['DATASET-1'],
  identityStatus: 'CONFIRMED_CANONICAL',
  verificationStatus: 'VERIFIED_OFFICIAL_PRIMARY',
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
  metadataCoverage: {
    originalSourceNames: 'NOT_PERSISTED_IN_REVISION_19_ENTITY_JSON',
    sourceRecordReferences: 'NOT_PERSISTED_IN_REVISION_19_ENTITY_JSON',
    provenanceReferences: 'NOT_PERSISTED_IN_REVISION_19_ENTITY_JSON',
    relationshipReferences: 'SEPARATE_VERSIONED_RELATIONSHIP_QUERY',
    boundaryVersionReferences: 'NOT_PERSISTED_IN_REVISION_19_ENTITY_JSON',
    createdAt: 'NOT_PERSISTED_IN_REVISION_19_ENTITY_JSON',
    lastVerifiedAt: 'NOT_PERSISTED_IN_REVISION_19_ENTITY_JSON',
    supersededAt: 'NOT_PERSISTED_IN_REVISION_19_ENTITY_JSON',
  },
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
function binding(overrides: Partial<IrniGeographicRpcBindingV2> = {}): IrniGeographicRpcBindingV2 {
  return {
    getApprovedRegistryMetadata: async () => ok(META),
    getApprovedEntityByCanonicalId: async () => ok(ENTITY),
    resolveIdentifier: async (_query, revision) => ok({
      queryIdentifier: 'IRGEO1-x',
      resolved: true,
      canonicalGeographicEntityId: ID,
      resolutionPath: 'DIRECT_ACTIVE_CANONICAL',
      registryRevision: revision,
    }),
    listApprovedEntitiesPaginated: async (_filter, _page, revision) => ok({
      registryRevision: revision,
      registryChecksum: CHECKSUM,
      page: {
        items: [ENTITY], nextCursor: null, previousCursor: null, hasMore: false,
        pageSize: 1, totalMatchedCount: 1, appliedSort: { field: 'issuedOrderIndex', direction: 'ASC' },
      },
    }),
    listApprovedRelationshipsForEntity: async (_id, revision) => ok({
      registryRevision: revision, registryChecksum: CHECKSUM, relationships: [],
    }),
    listApprovedLegacyAliases: async (_system, revision) => ok({
      registryRevision: revision, registryChecksum: CHECKSUM, aliases: [],
    }),
    ...overrides,
  };
}
function context(method: string, path: string, service?: IrniGeographicRpcBindingV2) {
  const request = new Request('https://radartehran.ir' + path, { method });
  return createWorkerRequestContext(request, service ? { IRNI_GEOGRAPHY: service } : {});
}
async function json(response: Response): Promise<Record<string, unknown>> {
  return await response.json() as Record<string, unknown>;
}

describe('Radar IRNI geographic RPC v2 consumer', () => {
  it('fails closed when the internal Service Binding is absent', async () => {
    const result = await new IrniGeographicRpcV2Client().getApprovedRegistryMetadata();
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.details?.failureCode, 'IRNI_RPC_BINDING_UNAVAILABLE');
  });

  it('rejects stale revisions before issuing entity reads', async () => {
    let reads = 0;
    const service = binding({ getApprovedRegistryMetadata: async () => ok({ ...META, registryRevision: 20 }),
      getApprovedEntityByCanonicalId: async () => { reads += 1; return ok(ENTITY); } });
    const result = await new IrniGeographicRpcV2Client(service).getApprovedEntityByCanonicalId(ID, 19);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, 'VERSION_CONFLICT');
    assert.equal(reads, 0);
  });

  it('rejects an entity whose registry identity metadata is incomplete', async () => {
    const invalid = { ...ENTITY, registryIdentity: { ...ENTITY.registryIdentity, issuedOrderIndex: 0 } };
    const service = binding({ getApprovedEntityByCanonicalId: async () => ok(invalid as IrniRpcEntityV2) });
    const result = await new IrniGeographicRpcV2Client(service).getApprovedEntityByCanonicalId(ID, 19);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.details?.failureCode, 'IRNI_RPC_INVALID_RESPONSE');
  });

  it('rejects bare numeric aliases and accepts only namespaced Radar identifiers', async () => {
    let calls = 0;
    const service = binding({ resolveIdentifier: async (_query, revision) => {
      calls += 1;
      return ok({ queryIdentifier: 'radar:city-hood:v1:tehran:8', resolved: false, canonicalGeographicEntityId: null, resolutionPath: 'NOT_FOUND', registryRevision: revision });
    }});
    const client = new IrniGeographicRpcV2Client(service);
    const invalid = await client.resolveIdentifier({ kind: 'RADAR_LEGACY_ALIAS', alias: { legacySystemCode: 'TEHRAN_RADAR', legacyIdentifierValue: '8' } }, 19);
    assert.equal(invalid.ok, false);
    assert.equal(calls, 0);
    const valid = await client.resolveIdentifier({ kind: 'RADAR_LEGACY_ALIAS', alias: { legacySystemCode: 'TEHRAN_RADAR', legacyIdentifierValue: 'radar:city-hood:v1:tehran:8' } }, 19);
    assert.equal(valid.ok, true);
    assert.equal(calls, 1);
  });

  it('rejects a provider that marks a bare numeric alias automatically resolvable', async () => {
    const service = binding({ listApprovedLegacyAliases: async (_system, revision) => ok({
      registryRevision: revision,
      registryChecksum: CHECKSUM,
      aliases: [{
        aliasId: 'legacy-1',
        legacySystemCode: 'TEHRAN_RADAR',
        legacyIdentifierValue: '8',
        canonicalGeographicEntityId: ID,
        aliasStatus: 'ACTIVE_COMPATIBILITY_ALIAS',
        resolutionEvidenceRef: 'evidence:phase-12',
        recordedAtRegistryRevision: 19,
        automaticResolutionEligible: true,
      }],
    }) });
    const result = await new IrniGeographicRpcV2Client(service).listApprovedLegacyAliases('TEHRAN_RADAR', 19);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.details?.failureCode, 'IRNI_RPC_INVALID_RESPONSE');
  });

  it('checks both registry revision and checksum on paginated snapshots', async () => {
    const service = binding({ listApprovedEntitiesPaginated: async (_filter, _page, revision) => ok({
      registryRevision: revision, registryChecksum: 'f'.repeat(64),
      page: { items: [ENTITY], nextCursor: null, previousCursor: null, hasMore: false, pageSize: 1, totalMatchedCount: 1, appliedSort: { field: 'issuedOrderIndex', direction: 'ASC' } },
    }) });
    const result = await new IrniGeographicRpcV2Client(service).listApprovedEntitiesPaginated({ entityType: 'URBAN_NEIGHBORHOOD' }, { limit: 20, sortBy: 'issuedOrderIndex' }, 19);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, 'VERSION_CONFLICT');
  });

  it('registers and serves the public read-only v2 facade', async () => {
    const match = findMigrationRegisterEntry('GET', '/api/v2/reference/irni/canonical/metadata');
    assert.ok(match);
    assert.equal(match.entry.status, 'IMPLEMENTED');
    const response = await handleIrniCanonicalRpcV2Route(context('GET', '/api/v2/reference/irni/canonical/metadata', binding()));
    assert.ok(response);
    assert.equal(response.status, 200);
    const body = await json(response);
    assert.equal(body.contractVersion, '2.0.0');
    assert.equal((body.data as Record<string, unknown>).registryRevision, 19);
  });

  it('dispatches the registered implemented route to the IRNI RPC handler instead of Express fallback', async () => {
    const ctx = context('GET', '/api/v2/reference/irni/canonical/metadata', binding());
    const dispatched = await dispatchWorkerApiOrSeoRequest(ctx);
    assert.ok(dispatched);
    assert.equal(dispatched.response.status, 200);
    assert.equal(dispatched.migrationStatus, 'IMPLEMENTED');
    const body = await json(dispatched.response);
    assert.equal(body.contractVersion, '2.0.0');
  });

  it('reports geography readiness through RPC without requiring a Radar geography D1 binding', async () => {
    const fakeDb = () => ({
      prepare: (sql: string) => ({
        first: async () => sql === 'SELECT 1 AS ok' ? { ok: 1 } : { count: 6 },
      }),
    } as unknown as D1Database);
    const ctx = createWorkerRequestContext(
      new Request('https://radartehran.ir/api/health/database-triad'),
      { USER_DB: fakeDb(), RESEARCH_DB: fakeDb(), IRNI_GEOGRAPHY: binding() },
    );
    const response = await handleHealthAndMetadataRoute(ctx);
    assert.ok(response);
    assert.equal(response.status, 200);
    const body = await json(response);
    assert.equal(body.status, 'ok');
    const bindings = body.bindings as Record<string, unknown>;
    const probes = body.probes as Record<string, unknown>;
    assert.equal(bindings.irniServiceBindingConfigured, true);
    assert.equal(bindings.legacyNeighborhoodDbBindingPresent, false);
    assert.equal(bindings.irniDirectDbBindingPresent, false);
    assert.equal(probes.irniRpc, 'ok');
  });

  it('rejects mutations and missing binding without local or HTTPS fallback', async () => {
    const mutation = await handleIrniCanonicalRpcV2Route(context('POST', '/api/v2/reference/irni/canonical/metadata', binding()));
    assert.ok(mutation);
    assert.equal(mutation.status, 405);
    const missing = await handleIrniCanonicalRpcV2Route(context('GET', '/api/v2/reference/irni/canonical/metadata'));
    assert.ok(missing);
    assert.equal(missing.status, 503);
  });
});
