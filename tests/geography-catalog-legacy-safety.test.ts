import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  GeographyCatalog,
  RADAR_GEOGRAPHY_CATALOG_AUTHORITY,
  resolveLegacyCityProvinceId,
} from '../server/modules/geography/geographyCatalog';
import {
  encodeRadarCityNeighborhoodAlias,
  encodeRadarGeographyCatalogAlias,
  encodeRadarUrbanIntelligenceAlias,
} from '../worker/irni/radarLegacyIdentifiers';

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


describe('versioned Radar legacy identifier encoding', () => {
  it('encodes the old (city_id, hood_id) database tuple without losing its namespace', () => {
    assert.equal(
      encodeRadarCityNeighborhoodAlias('tehran', 5),
      'radar:city-hood:v1:tehran:5',
    );
    assert.equal(
      encodeRadarCityNeighborhoodAlias('karaj', '101'),
      'radar:city-hood:v1:karaj:101',
    );
  });

  it('encodes GeographyCatalog and Urban Intelligence identifiers in separate namespaces', () => {
    assert.equal(
      encodeRadarGeographyCatalogAlias('hood:tehran:5'),
      'radar:geography-catalog:v1:hood%3Atehran%3A5',
    );
    assert.equal(
      encodeRadarUrbanIntelligenceAlias('tehran:hood:5'),
      'radar:urban-intelligence:v1:tehran%3Ahood%3A5',
    );
  });

  it('does not collide when city, source identifier format, or source ID changes', () => {
    const values = new Set([
      encodeRadarCityNeighborhoodAlias('tehran', 5),
      encodeRadarCityNeighborhoodAlias('karaj', 5),
      encodeRadarGeographyCatalogAlias('hood:tehran:5'),
      encodeRadarUrbanIntelligenceAlias('tehran:hood:5'),
    ]);
    assert.equal(values.size, 4);
  });

  it('rejects malformed city identifiers and non-canonical numeric IDs', () => {
    assert.throws(() => encodeRadarCityNeighborhoodAlias('Tehran', 5), TypeError);
    assert.throws(() => encodeRadarCityNeighborhoodAlias('tehran ', 5), TypeError);
    assert.throws(() => encodeRadarCityNeighborhoodAlias('tehran', 0), TypeError);
    assert.throws(() => encodeRadarCityNeighborhoodAlias('tehran', -5), TypeError);
    assert.throws(() => encodeRadarCityNeighborhoodAlias('tehran', '05'), TypeError);
    assert.throws(() => encodeRadarCityNeighborhoodAlias('tehran', 5.5), TypeError);
  });

  it('rejects unrecognized old identifier shapes', () => {
    assert.throws(() => encodeRadarGeographyCatalogAlias('hood:tehran:unknown'), TypeError);
    assert.throws(() => encodeRadarUrbanIntelligenceAlias('hood:tehran:5'), TypeError);
    assert.throws(() => encodeRadarUrbanIntelligenceAlias('tehran:hood:abc'), TypeError);
  });
});
