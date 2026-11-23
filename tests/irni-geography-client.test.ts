import test from 'node:test';
import assert from 'node:assert/strict';
import { attachIrniCanonicalIdentities, type IrniLegacyAlias } from '../src/data/irniGeographyClient';

const NARMAK_ID = 'IRGEO1-2b8bb4937180a4fde28102e0360479d1d3a702dc4a49e13de332b67b09ae1f83';

const alias = (legacyIdentifierValue: string, canonicalGeographicEntityId: string): IrniLegacyAlias => ({
  aliasId: 'alias-' + legacyIdentifierValue,
  legacySystemCode: 'TEHRAN_RADAR',
  legacyIdentifierValue,
  canonicalGeographicEntityId,
  aliasStatus: 'ACTIVE_COMPATIBILITY_ALIAS',
  recordedAtRegistryRevision: 19,
  resolutionEvidenceRef: 'IRNI-PHASE-11',
});

test('explicit IRNI alias resolves legacy Narmak ID without altering the source record', () => {
  const result = attachIrniCanonicalIdentities(
    [{ id: 13, name: 'نارمک' }, { id: 10, name: 'ونک' }],
    [alias('13', NARMAK_ID)],
    19,
  );
  assert.equal(result[0].geographicEntityId, NARMAK_ID);
  assert.equal(result[0].geographicIdentityResolutionStatus, 'RESOLVED');
  assert.equal(result[0].id, 13);
  assert.equal(result[1].geographicEntityId, null);
  assert.equal(result[1].geographicIdentityResolutionStatus, 'UNRESOLVED');
  assert.equal(result[1].id, 10);
});

test('resolver never uses a different namespace or inactive alias', () => {
  const result = attachIrniCanonicalIdentities(
    [{ id: 10, name: 'ونک' }],
    [
      { ...alias('10', NARMAK_ID), legacySystemCode: 'OTHER_LEGACY' },
      { ...alias('10', NARMAK_ID), aliasStatus: 'RETIRED_COMPATIBILITY_ALIAS' },
    ],
    19,
  );
  assert.equal(result[0].geographicEntityId, null);
  assert.equal(result[0].geographicIdentityResolutionStatus, 'UNRESOLVED');
});

test('unavailable canonical API fails closed and does not reuse stale numeric IDs', () => {
  const result = attachIrniCanonicalIdentities(
    [{ id: 13, name: 'نارمک' }],
    [alias('13', NARMAK_ID)],
    null,
    false,
  );
  assert.equal(result[0].geographicEntityId, null);
  assert.equal(result[0].geographicIdentityResolutionStatus, 'UNAVAILABLE');
  assert.equal(result[0].geographicRegistryRevision, null);
});

test('duplicate active aliases for one legacy ID are rejected', () => {
  assert.throws(() => attachIrniCanonicalIdentities(
    [{ id: 13, name: 'نارمک' }],
    [alias('13', NARMAK_ID), alias('13', 'IRGEO1-DIFFERENT')],
    19,
  ), /DUPLICATE_IRNI_LEGACY_ALIAS/);
});
