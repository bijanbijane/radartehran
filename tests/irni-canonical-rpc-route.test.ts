import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { findMigrationRegisterEntry } from '../worker/migrationRegister';

const PREFIX = '/api/v2/reference/irni/canonical';

describe('canonical IRNI v2 HTTP route ownership', () => {
  it('registers every public canonical read path to the V2 Worker handler', () => {
    const paths = [
      '/metadata',
      '/entities',
      '/entities/IRGEO2-' + 'b'.repeat(64),
      '/entities/IRGEO2-' + 'b'.repeat(64) + '/relationships',
      '/resolve',
      '/aliases',
    ];
    for (const suffix of paths) {
      const match = findMigrationRegisterEntry('GET', PREFIX + suffix);
      assert.ok(match, 'Expected route to be centrally registered: ' + suffix);
      assert.equal(match.entry.status, 'IMPLEMENTED');
      assert.equal(match.entry.migrationGroup, 'GROUP_2_PUBLIC_MARKET_AND_GEO_READS');
      assert.equal(match.entry.workerHandlerModule, 'worker/routes/irniCanonicalRpcV2Routes.ts');
    }
  });

  it('does not throw when a canonical route contains malformed percent encoding', () => {
    assert.doesNotThrow(() => {
      assert.equal(findMigrationRegisterEntry('GET', PREFIX + '/entities/%E0%A4%A'), null);
    });
  });

});
