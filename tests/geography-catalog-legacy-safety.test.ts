import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  GeographyCatalog,
  RADAR_GEOGRAPHY_CATALOG_AUTHORITY,
  resolveLegacyCityProvinceId,
} from '../server/modules/geography/geographyCatalog';

describe('legacy geography catalog transition guardrails', () => {
  it('identifies the local catalog as a non-canonical Radar fixture', () => {
    const catalog = new GeographyCatalog();
    assert.equal(catalog.authority, RADAR_GEOGRAPHY_CATALOG_AUTHORITY);
    assert.equal(
      catalog.authority,
      'RADAR_LEGACY_STATIC_FIXTURE_NON_CANONICAL',
    );
    assert.equal(
      catalog.getEntityById('province:tehran')?.boundary.provenance,
      'UNVERIFIED_SOURCE',
    );
  });

  it('maps only explicitly configured city identifiers to province parents', () => {
    assert.equal(resolveLegacyCityProvinceId('tehran'), 'province:tehran');
    assert.equal(resolveLegacyCityProvinceId('karaj'), 'province:alborz');
    assert.equal(resolveLegacyCityProvinceId('mashhad'), 'province:khorasan_razavi');
    assert.equal(resolveLegacyCityProvinceId('isfahan'), 'province:isfahan');
    assert.equal(resolveLegacyCityProvinceId('shiraz'), 'province:fars');
    assert.equal(resolveLegacyCityProvinceId('tabriz'), 'province:east_azerbaijan');
  });

  it('fails closed for unknown city identifiers instead of assigning Tehran', () => {
    assert.equal(resolveLegacyCityProvinceId('unknown-city'), null);
    assert.equal(resolveLegacyCityProvinceId(''), null);
    assert.equal(resolveLegacyCityProvinceId('   '), null);
    assert.equal(resolveLegacyCityProvinceId('toString'), null);
    assert.equal(resolveLegacyCityProvinceId('__proto__'), null);
  });
});
