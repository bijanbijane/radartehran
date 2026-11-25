import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  IrniGeographicRpcClient,
  IRNI_GEOGRAPHIC_RPC_CONTRACT_VERSION,
} from '../worker/irni/irniGeographicRpcClient';
import type {
  IrniCanonicalGeographicEntity,
  IrniGeographicPersistenceResult,
  IrniGeographicRegistryMetadata,
  IrniGeographicRpcBinding,
} from '../worker/irni/irniGeographicRpcTypes';

const VALID_CHECKSUM = 'a'.repeat(64);

function metadata(
  overrides: Partial<IrniGeographicRegistryMetadata> = {},
): IrniGeographicRegistryMetadata {
  return {
    contractVersion: IRNI_GEOGRAPHIC_RPC_CONTRACT_VERSION,
    contractState: 'ACTIVE',
    canonicalIdentityContractVersion: 'IRGEO-IDENTITY-1.0.0',
    idAlgorithmVersion: 'IRGEO1-SHA256-FULL-V1',
    geographicSchemaVersion: '1.0.0',
    registryRevision: 8,
    registryChecksum: VALID_CHECKSUM,
    integrityVerified: true,
    ...overrides,
  };
}

function approvedEntity(
  overrides: Partial<IrniCanonicalGeographicEntity> = {},
): IrniCanonicalGeographicEntity {
  return {
    geographicEntityId: 'IRGEO1-' + 'b'.repeat(64),
    identityAnchor: 'NCC:URBAN_NEIGHBORHOOD:12345',
    identityAnchorType: 'TYPE_A_SOURCE_NATIVE',
    entityType: 'URBAN_NEIGHBORHOOD',
    classificationSystemId: 'IRGEO-URBAN-NEIGHBORHOOD',
    canonicalNameFa: 'محله نمونه',
    alternativeNamesFa: ['نمونه'],
    originalSourceNames: [],
    nameEn: 'Sample Neighborhood',
    parentGeographicEntityId: 'IRGEO1-' + 'c'.repeat(64),
    provinceGeographicEntityId: 'IRGEO1-' + 'd'.repeat(64),
    sourceNativeIdentifiers: [],
    sourceDatasetReferences: [],
    sourceRecordReferences: [],
    provenanceReferences: [],
    relationshipReferences: [],
    validFrom: null,
    validTo: null,
    recordedAt: '2026-11-22T00:00:00.000Z',
    supersededAt: null,
    identityStatus: 'CONFIRMED_CANONICAL',
    verificationStatus: 'VERIFIED_OFFICIAL_PRIMARY',
    lifecycleStatus: 'ACTIVE',
    boundaryStatus: 'POINT_LOCATION_ONLY',
    boundaryVersionReferences: [],
    schemaVersion: '1.0.0',
    createdAt: '2026-11-22T00:00:00.000Z',
    lastVerifiedAt: '2026-11-22T00:00:00.000Z',
    isSyntheticFixture: false,
    ...overrides,
  };
}

function persistenceOk<T>(value: T): IrniGeographicPersistenceResult<T> {
  return { ok: true, value };
}

function createBinding(
  overrides: Partial<IrniGeographicRpcBinding> = {},
): IrniGeographicRpcBinding {
  return {
    getApprovedRegistryMetadata: async () => persistenceOk(metadata()),
    getApprovedEntityByCanonicalId: async () => persistenceOk(approvedEntity()),
    resolveIdentifier: async (_query, expectedRegistryRevision) =>
      persistenceOk({
        queryIdentifier: 'radar:city-hood:v1:tehran:5',
        resolved: true,
        canonicalGeographicEntityId: approvedEntity().geographicEntityId,
        resolutionPath: 'LEGACY_ALIAS',
        registryRevision: expectedRegistryRevision,
      }),
    listApprovedEntitiesPaginated: async (_filter, _page, expectedRegistryRevision) =>
      persistenceOk({
        registryRevision: expectedRegistryRevision,
        registryChecksum: VALID_CHECKSUM,
        page: {
          items: [approvedEntity()],
          nextCursor: null,
          previousCursor: null,
          hasMore: false,
          pageSize: 1,
          totalMatchedCount: 1,
          appliedSort: { field: 'canonicalNameFa', direction: 'ASC' },
        },
      }),
    listApprovedRelationshipsForEntity: async (_id, expectedRegistryRevision) =>
      persistenceOk({
        registryRevision: expectedRegistryRevision,
        registryChecksum: VALID_CHECKSUM,
        relationships: [],
      }),
    ...overrides,
  };
}

function failureCode(
  result: IrniGeographicPersistenceResult<unknown>,
): string | undefined {
  return result.ok ? undefined : String(result.error.details?.failureCode ?? result.error.code);
}

describe('IRNI v1 geographic RPC client — fail-closed binding and contract guards', () => {
  it('does not construct an HTTPS or local fallback when the Service Binding is absent', async () => {
    const client = new IrniGeographicRpcClient();
    assert.equal(client.isConfigured(), false);

    const result = await client.getApprovedEntityByCanonicalId(
      'IRGEO1-' + 'b'.repeat(64),
      8,
    );

    assert.equal(result.ok, false);
    assert.equal(failureCode(result), 'IRNI_RPC_BINDING_UNAVAILABLE');
  });

  it('refuses geographic reads while the IRNI Worker reports scaffold-only contract state', async () => {
    let readCalls = 0;
    const binding = createBinding({
      getApprovedRegistryMetadata: async () =>
        persistenceOk(metadata({ contractState: 'CONTRACT_FINALIZED_RUNTIME_NOT_IMPLEMENTED' })),
      getApprovedEntityByCanonicalId: async () => {
        readCalls += 1;
        return persistenceOk(approvedEntity());
      },
    });
    const result = await new IrniGeographicRpcClient({ binding })
      .getApprovedEntityByCanonicalId('IRGEO1-' + 'b'.repeat(64), 8);

    assert.equal(result.ok, false);
    assert.equal(failureCode(result), 'IRNI_RPC_CONTRACT_MISMATCH');
    assert.equal(readCalls, 0);
  });

  it('refuses data reads when registry integrity is not verified', async () => {
    let readCalls = 0;
    const binding = createBinding({
      getApprovedRegistryMetadata: async () =>
        persistenceOk(metadata({ integrityVerified: false })),
      getApprovedEntityByCanonicalId: async () => {
        readCalls += 1;
        return persistenceOk(approvedEntity());
      },
    });
    const result = await new IrniGeographicRpcClient({ binding })
      .getApprovedEntityByCanonicalId('IRGEO1-' + 'b'.repeat(64), 8);

    assert.equal(result.ok, false);
    assert.equal(failureCode(result), 'IRNI_RPC_REGISTRY_UNVERIFIED');
    assert.equal(readCalls, 0);
  });

  it('pins every read to one exact registry revision and rejects cross-revision requests', async () => {
    let readCalls = 0;
    const binding = createBinding({
      getApprovedRegistryMetadata: async () => persistenceOk(metadata({ registryRevision: 9 })),
      getApprovedEntityByCanonicalId: async () => {
        readCalls += 1;
        return persistenceOk(approvedEntity());
      },
    });
    const result = await new IrniGeographicRpcClient({ binding })
      .getApprovedEntityByCanonicalId('IRGEO1-' + 'b'.repeat(64), 8);

    assert.equal(result.ok, false);
    assert.equal(result.ok ? undefined : result.error.code, 'VERSION_CONFLICT');
    assert.equal(readCalls, 0);
  });

  it('validates metadata contract version and checksum before accepting it', async () => {
    const wrongVersion = new IrniGeographicRpcClient({
      binding: createBinding({
        getApprovedRegistryMetadata: async () =>
          persistenceOk(metadata({ contractVersion: '2.0.0' as '1.0.0' })),
      }),
    });
    const wrongChecksum = new IrniGeographicRpcClient({
      binding: createBinding({
        getApprovedRegistryMetadata: async () =>
          persistenceOk(metadata({ registryChecksum: 'not-a-checksum' })),
      }),
    });

    assert.equal(failureCode(await wrongVersion.getApprovedRegistryMetadata()), 'IRNI_RPC_INVALID_RESPONSE');
    assert.equal(failureCode(await wrongChecksum.getApprovedRegistryMetadata()), 'IRNI_RPC_INVALID_RESPONSE');
  });

  it('returns only approved canonical entities and rejects synthetic, retired, or unverified records', async () => {
    const approvedClient = new IrniGeographicRpcClient({
      binding: createBinding(),
    });
    const approved = await approvedClient.getApprovedEntityByCanonicalId(
      'IRGEO1-' + 'b'.repeat(64),
      8,
    );
    assert.equal(approved.ok, true);

    const rejectedEntities = [
      approvedEntity({ isSyntheticFixture: true }),
      approvedEntity({ lifecycleStatus: 'RETIRED' }),
      approvedEntity({ identityStatus: 'DISPUTED' }),
      approvedEntity({ verificationStatus: 'PROVISIONAL_UNVERIFIED' }),
    ];

    for (const entity of rejectedEntities) {
      const client = new IrniGeographicRpcClient({
        binding: createBinding({
          getApprovedEntityByCanonicalId: async () => persistenceOk(entity),
        }),
      });
      const result = await client.getApprovedEntityByCanonicalId(
        'IRGEO1-' + 'b'.repeat(64),
        8,
      );
      assert.equal(result.ok, false);
      assert.equal(failureCode(result), 'IRNI_RPC_INVALID_RESPONSE');
    }
  });

  it('passes versioned Radar legacy aliases unchanged to exact-match resolution', async () => {
    let captured: unknown = null;
    const binding = createBinding({
      resolveIdentifier: async (query, expectedRegistryRevision) => {
        captured = query;
        return persistenceOk({
          queryIdentifier: query.kind === 'RADAR_LEGACY_ALIAS'
            ? query.alias.legacyIdentifierValue
            : query.identifier,
          resolved: true,
          canonicalGeographicEntityId: approvedEntity().geographicEntityId,
          resolutionPath: 'LEGACY_ALIAS',
          registryRevision: expectedRegistryRevision,
        });
      },
    });
    const query = {
      kind: 'RADAR_LEGACY_ALIAS',
      alias: {
        legacySystemCode: 'TEHRAN_RADAR',
        legacyIdentifierValue: 'radar:city-hood:v1:tehran:5',
      },
    } as const;

    const result = await new IrniGeographicRpcClient({ binding }).resolveIdentifier(query, 8);
    assert.deepEqual(captured, query);
    assert.equal(result.ok, true);
    assert.equal(result.ok ? result.value.resolutionPath : '', 'LEGACY_ALIAS');
  });

  it('fails closed on transport exceptions and malformed remote result envelopes', async () => {
    const thrown = new IrniGeographicRpcClient({
      binding: createBinding({
        getApprovedRegistryMetadata: async () => {
          throw new Error('binding unavailable');
        },
      }),
    });
    const malformed = new IrniGeographicRpcClient({
      binding: createBinding({
        getApprovedRegistryMetadata: async () => ({ ok: true, value: {} } as never),
      }),
    });

    assert.equal(
      failureCode(await thrown.getApprovedRegistryMetadata()),
      'IRNI_RPC_RUNTIME_UNAVAILABLE',
    );
    assert.equal(
      failureCode(await malformed.getApprovedRegistryMetadata()),
      'IRNI_RPC_INVALID_RESPONSE',
    );
  });

  it('rejects malformed, unversioned, and inherited legacy query fields before invoking RPC', async () => {
    let readCalls = 0;
    const binding = createBinding({
      resolveIdentifier: async () => {
        readCalls += 1;
        return persistenceOk({
          queryIdentifier: 'x',
          resolved: false,
          canonicalGeographicEntityId: null,
          resolutionPath: 'NOT_FOUND',
          registryRevision: 8,
        });
      },
    });
    const client = new IrniGeographicRpcClient({ binding });

    const unversioned = await client.resolveIdentifier(
      {
        kind: 'RADAR_LEGACY_ALIAS',
        alias: {
          legacySystemCode: 'TEHRAN_RADAR',
          legacyIdentifierValue: '5',
        },
      },
      8,
    );
    const malformedSuffix = await client.resolveIdentifier(
      {
        kind: 'RADAR_LEGACY_ALIAS',
        alias: {
          legacySystemCode: 'TEHRAN_RADAR',
          legacyIdentifierValue: 'radar:city-hood:v1:hood:tehran:5',
        },
      },
      8,
    );
    const inherited = await client.resolveIdentifier(
      Object.create({
        kind: 'RADAR_LEGACY_ALIAS',
        alias: {
          legacySystemCode: 'TEHRAN_RADAR',
          legacyIdentifierValue: 'radar:city-hood:v1:tehran:5',
        },
      }) as never,
      8,
    );

    for (const result of [unversioned, malformedSuffix, inherited]) {
      assert.equal(result.ok, false);
      assert.equal(failureCode(result), 'IRNI_RPC_INVALID_PARAMETERS');
    }
    assert.equal(readCalls, 0);
  });

  it('accepts only page and relationship envelopes bound to the pinned revision and valid checksums', async () => {
    const client = new IrniGeographicRpcClient({ binding: createBinding() });
    const page = await client.listApprovedEntitiesPaginated({}, { limit: 10 }, 8);
    const relationships = await client.listApprovedRelationshipsForEntity(
      approvedEntity().geographicEntityId,
      8,
    );

    assert.equal(page.ok, true);
    assert.equal(relationships.ok, true);

    const malformedPage = new IrniGeographicRpcClient({
      binding: createBinding({
        listApprovedEntitiesPaginated: async () =>
          persistenceOk({
            registryRevision: 8,
            registryChecksum: 'bad',
            page: {
              items: [approvedEntity()],
              nextCursor: null,
              previousCursor: null,
              hasMore: false,
              pageSize: 1,
              totalMatchedCount: 1,
              appliedSort: { field: 'canonicalNameFa', direction: 'ASC' },
            },
          }),
      }),
    });
    assert.equal(
      failureCode(await malformedPage.listApprovedEntitiesPaginated({}, {}, 8)),
      'IRNI_RPC_INVALID_RESPONSE',
    );
  });

  it('rejects resolution, page, and relationship envelopes whose revision or checksum differs from verified metadata', async () => {
    const wrongResolutionRevision = new IrniGeographicRpcClient({
      binding: createBinding({
        resolveIdentifier: async () =>
          persistenceOk({
            queryIdentifier: 'radar:city-hood:v1:tehran:5',
            resolved: true,
            canonicalGeographicEntityId: approvedEntity().geographicEntityId,
            resolutionPath: 'LEGACY_ALIAS',
            registryRevision: 9,
          }),
      }),
    });
    const resolution = await wrongResolutionRevision.resolveIdentifier({
      kind: 'RADAR_LEGACY_ALIAS',
      alias: {
        legacySystemCode: 'TEHRAN_RADAR',
        legacyIdentifierValue: 'radar:city-hood:v1:tehran:5',
      },
    }, 8);
    assert.equal(resolution.ok, false);
    assert.equal(resolution.ok ? undefined : resolution.error.code, 'VERSION_CONFLICT');

    const wrongPageRevision = new IrniGeographicRpcClient({
      binding: createBinding({
        listApprovedEntitiesPaginated: async () =>
          persistenceOk({
            registryRevision: 9,
            registryChecksum: VALID_CHECKSUM,
            page: {
              items: [approvedEntity()],
              nextCursor: null,
              previousCursor: null,
              hasMore: false,
              pageSize: 1,
              totalMatchedCount: 1,
              appliedSort: { field: 'canonicalNameFa', direction: 'ASC' },
            },
          }),
      }),
    });
    const pageRevision = await wrongPageRevision.listApprovedEntitiesPaginated({}, {}, 8);
    assert.equal(pageRevision.ok, false);
    assert.equal(pageRevision.ok ? undefined : pageRevision.error.code, 'VERSION_CONFLICT');

    const wrongPageChecksum = new IrniGeographicRpcClient({
      binding: createBinding({
        listApprovedEntitiesPaginated: async () =>
          persistenceOk({
            registryRevision: 8,
            registryChecksum: 'b'.repeat(64),
            page: {
              items: [approvedEntity()],
              nextCursor: null,
              previousCursor: null,
              hasMore: false,
              pageSize: 1,
              totalMatchedCount: 1,
              appliedSort: { field: 'canonicalNameFa', direction: 'ASC' },
            },
          }),
      }),
    });
    const pageChecksum = await wrongPageChecksum.listApprovedEntitiesPaginated({}, {}, 8);
    assert.equal(pageChecksum.ok, false);
    assert.equal(failureCode(pageChecksum), 'IRNI_RPC_REGISTRY_UNVERIFIED');

    const wrongRelationshipChecksum = new IrniGeographicRpcClient({
      binding: createBinding({
        listApprovedRelationshipsForEntity: async () =>
          persistenceOk({
            registryRevision: 8,
            registryChecksum: 'c'.repeat(64),
            relationships: [],
          }),
      }),
    });
    const relationshipChecksum = await wrongRelationshipChecksum.listApprovedRelationshipsForEntity(
      approvedEntity().geographicEntityId,
      8,
    );
    assert.equal(relationshipChecksum.ok, false);
    assert.equal(failureCode(relationshipChecksum), 'IRNI_RPC_REGISTRY_UNVERIFIED');
  });

});
