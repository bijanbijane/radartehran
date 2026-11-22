import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createWorkerRequestContext } from '../worker/contextAndSecurity';
import { findMigrationRegisterEntry } from '../worker/migrationRegister';
import { handleIrniCanonicalRpcRoute } from '../worker/routes/irniCanonicalRpcRoutes';
import type {
  IrniGeographicPersistenceResult,
  IrniGeographicRegistryMetadata,
  IrniGeographicRpcBinding,
} from '../worker/irni/irniGeographicRpcTypes';

const CHECKSUM = 'a'.repeat(64);
const PREFIX = '/api/v2/reference/irni/canonical';

function persistenceOk<T>(value: T): IrniGeographicPersistenceResult<T> {
  return { ok: true, value };
}

function registryMetadata(
  overrides: Partial<IrniGeographicRegistryMetadata> = {},
): IrniGeographicRegistryMetadata {
  return {
    contractVersion: '1.0.0',
    contractState: 'ACTIVE',
    canonicalIdentityContractVersion: 'IRGEO-IDENTITY-1.0.0',
    idAlgorithmVersion: 'IRGEO1-SHA256-FULL-V1',
    geographicSchemaVersion: '1.0.0',
    registryRevision: 8,
    registryChecksum: CHECKSUM,
    integrityVerified: true,
    ...overrides,
  };
}

function createBinding(
  overrides: Partial<IrniGeographicRpcBinding> = {},
): IrniGeographicRpcBinding {
  return {
    getApprovedRegistryMetadata: async () => persistenceOk(registryMetadata()),
    getApprovedEntityByCanonicalId: async () =>
      persistenceOk({ geographicEntityId: 'IRGEO1-' + 'b'.repeat(64) } as never),
    resolveIdentifier: async (_query, revision) =>
      persistenceOk({
        queryIdentifier: 'radar:city-hood:v1:tehran:5',
        resolved: true,
        canonicalGeographicEntityId: 'IRGEO1-' + 'b'.repeat(64),
        resolutionPath: 'LEGACY_ALIAS',
        registryRevision: revision,
      }),
    listApprovedEntitiesPaginated: async (_filter, _page, revision) =>
      persistenceOk({
        registryRevision: revision,
        registryChecksum: CHECKSUM,
        page: {
          items: [],
          nextCursor: null,
          previousCursor: null,
          hasMore: false,
          pageSize: 0,
          totalMatchedCount: 0,
          appliedSort: { field: 'canonicalNameFa', direction: 'ASC' },
        },
      }),
    listApprovedRelationshipsForEntity: async (_id, revision) =>
      persistenceOk({
        registryRevision: revision,
        registryChecksum: CHECKSUM,
        relationships: [],
      }),
    ...overrides,
  };
}

function makeContext(
  method: string,
  path: string,
  binding?: IrniGeographicRpcBinding,
) {
  const request = new Request('https://radartehran.ir' + path, { method });
  return createWorkerRequestContext(
    request,
    binding ? { IRNI_GEOGRAPHY: binding } : {},
  );
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

describe('canonical IRNI v2 HTTP read adapter', () => {
  it('is registered as verified in the central Migration Control Register', () => {
    const paths = [
      '/metadata',
      '/entities',
      '/entities/IRGEO1-' + 'b'.repeat(64),
      '/entities/IRGEO1-' + 'b'.repeat(64) + '/relationships',
      '/resolve',
    ];

    for (const suffix of paths) {
      const match = findMigrationRegisterEntry('GET', PREFIX + suffix);
      assert.ok(match, 'Expected route to be centrally registered: ' + suffix);
      assert.equal(match.entry.status, 'VERIFIED');
      assert.equal(match.entry.migrationGroup, 'GROUP_2_PUBLIC_MARKET_AND_GEO_READS');
      assert.equal(match.entry.workerHandlerModule, 'worker/routes/irniCanonicalRpcRoutes.ts');
    }
  });

  it('fails closed with 503 when the IRNI Service Binding is absent', async () => {
    const response = await handleIrniCanonicalRpcRoute(
      makeContext('GET', PREFIX + '/metadata'),
    );
    assert.ok(response);
    assert.equal(response.status, 503);
    const body = await readJson(response);
    assert.equal(body.code, 'STORAGE_UNAVAILABLE');
  });

  it('rejects non-GET methods without invoking the binding', async () => {
    let calls = 0;
    const binding = createBinding({
      getApprovedRegistryMetadata: async () => {
        calls += 1;
        return persistenceOk(registryMetadata());
      },
    });
    const response = await handleIrniCanonicalRpcRoute(
      makeContext('POST', PREFIX + '/metadata', binding),
    );
    assert.ok(response);
    assert.equal(response.status, 405);
    assert.equal(calls, 0);
  });

  it('serves registry metadata without pretending scaffold state is active', async () => {
    const binding = createBinding({
      getApprovedRegistryMetadata: async () =>
        persistenceOk(registryMetadata({
          contractState: 'CONTRACT_FINALIZED_RUNTIME_NOT_IMPLEMENTED',
        })),
    });
    const response = await handleIrniCanonicalRpcRoute(
      makeContext('GET', PREFIX + '/metadata', binding),
    );
    assert.ok(response);
    assert.equal(response.status, 200);
    const body = await readJson(response);
    assert.equal(body.contractVersion, '1.0.0');
    const data = body.data as Record<string, unknown>;
    assert.equal(data.contractState, 'CONTRACT_FINALIZED_RUNTIME_NOT_IMPLEMENTED');
    assert.equal(data.integrityVerified, true);
  });

  it('requires a positive expectedRevision before any entity query', async () => {
    let calls = 0;
    const binding = createBinding({
      getApprovedRegistryMetadata: async () => {
        calls += 1;
        return persistenceOk(registryMetadata());
      },
    });
    const response = await handleIrniCanonicalRpcRoute(
      makeContext('GET', PREFIX + '/entities?expectedRevision=0', binding),
    );
    assert.ok(response);
    assert.equal(response.status, 400);
    assert.equal(calls, 0);
  });

  it('serves an approved entity page only when the pinned revision and checksum match', async () => {
    const binding = createBinding();
    const response = await handleIrniCanonicalRpcRoute(
      makeContext(
        'GET',
        PREFIX + '/entities?expectedRevision=8&limit=10&sortBy=canonicalNameFa&sortDirection=ASC',
        binding,
      ),
    );
    assert.ok(response);
    assert.equal(response.status, 200);
    const body = await readJson(response);
    assert.equal(body.status, 'ok');
    const data = body.data as Record<string, unknown>;
    assert.equal(data.registryRevision, 8);
    assert.equal(data.registryChecksum, CHECKSUM);
  });

  it('maps registry revision drift to HTTP 409 without returning a page', async () => {
    const binding = createBinding({
      getApprovedRegistryMetadata: async () =>
        persistenceOk(registryMetadata({ registryRevision: 9 })),
    });
    const response = await handleIrniCanonicalRpcRoute(
      makeContext('GET', PREFIX + '/entities?expectedRevision=8', binding),
    );
    assert.ok(response);
    assert.equal(response.status, 409);
    const body = await readJson(response);
    assert.equal(body.code, 'VERSION_CONFLICT');
  });

  it('rejects unapproved sort fields and malformed identifiers before RPC', async () => {
    let calls = 0;
    const binding = createBinding({
      getApprovedRegistryMetadata: async () => {
        calls += 1;
        return persistenceOk(registryMetadata());
      },
    });
    const badSort = await handleIrniCanonicalRpcRoute(
      makeContext('GET', PREFIX + '/entities?expectedRevision=8&sortBy=rawSql', binding),
    );
    const badId = await handleIrniCanonicalRpcRoute(
      makeContext('GET', PREFIX + '/entities/not%2Fcanonical?expectedRevision=8', binding),
    );
    assert.ok(badSort);
    assert.ok(badId);
    assert.equal(badSort.status, 400);
    assert.equal(badId.status, 400);
    assert.equal(calls, 0);
  });
});
