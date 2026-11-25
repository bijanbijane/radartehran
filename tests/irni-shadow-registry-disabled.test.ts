import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const server = readFileSync('apps/api/server.ts', 'utf8');
const routeCatalog = readFileSync('src/utils/expressRouteCatalog.ts', 'utf8');
const legacyClient = readFileSync('src/data/irniGeographyClient.ts', 'utf8');

describe('IRNI shadow registry retirement', () => {
  it('does not mount the locally fabricated Express registry', () => {
    assert.doesNotMatch(server, /registerGeographyRegistryHttpRoutes/);
    assert.doesNotMatch(server, /geographyRegistryHttpRoutes/);
    assert.equal(
      existsSync('server/modules/geography/geographyRegistryHttpRoutes.ts'),
      false,
    );
  });

  it('does not advertise the retired Express geography endpoints', () => {
    assert.doesNotMatch(
      routeCatalog,
      /\/api\/v1\/geography\/(?:registry(?:\/health)?|legacy-aliases|entities)/,
    );
  });

  it('keeps the legacy browser client fail-closed when the retired endpoint is unavailable', () => {
    assert.match(legacyClient, /if\s*\(!response\.ok\)/);
    assert.match(legacyClient, /IRNI_LEGACY_ALIAS_API_UNAVAILABLE/);
    assert.match(legacyClient, /body\.source\s*!==\s*'IRNI_CANONICAL_REGISTRY'/);
  });
});
