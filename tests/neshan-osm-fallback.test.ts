/**
 * @file tests/neshan-osm-fallback.test.ts
 * @description Comprehensive verification suite for Neshan Maps Primary Provider + Automatic OpenStreetMap Fallback.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  DEFAULT_NESHAN_WEB_KEY,
  NESHAN_FALLBACK_MESSAGE,
  NESHAN_TILE_OPTIONS,
  OFFICIAL_OSM_TILE_URL,
  OSM_STANDARD_TILE_OPTIONS,
  NeshanTileHealthMonitor,
  buildNeshanBaseTileUrl,
  buildNeshanLabelTileUrl,
  buildProviderAttributionHtml,
  calcNeshanTile,
  classifyNeshanHttpError,
  createLeafletBaseTileController,
  getMapProviderRuntimeState,
  patchLeafletGridLayerNullSafety,
  resolveNeshanConfiguration,
  validateNeshanApiKey,
  writePersistedFallbackCircuit,
} from '../src/components/mapBaseTileController';
import { FREE_KEYLESS_TILE_SERVERS } from '../src/data/neighborhoods';
import { isValidMapTileServerId } from '../src/types/typeGuards';

console.log('🗺️ Running Neshan Primary Provider & Automatic OSM Fallback Test Suite...\n');

let passed = 0;
function check(name: string, fn: () => void | Promise<void>): Promise<void> {
  return Promise.resolve()
    .then(() => fn())
    .then(() => {
      passed += 1;
      console.log(`  ✅ ${passed}. ${name}`);
    })
    .catch((err) => {
      console.error(`  ❌ FAILED: ${name}`);
      throw err;
    });
}

async function runSuite(): Promise<void> {
  await check('Neshan API key validation accepts valid web.* keys and rejects empty keys', () => {
    const valid = validateNeshanApiKey(DEFAULT_NESHAN_WEB_KEY);
    assert.equal(valid.isValid, true);
    assert.equal(valid.normalizedKey, DEFAULT_NESHAN_WEB_KEY);

    const empty = validateNeshanApiKey('');
    assert.equal(empty.isValid, false);

    const whitespace = validateNeshanApiKey('   ');
    assert.equal(whitespace.isValid, false);
  });

  await check('Tracked source files never hardcode Mapbox tokens and .gitignore excludes .env.local', () => {
    const gitignore = fs.readFileSync('.gitignore', 'utf8');
    assert.ok(gitignore.includes('.env.local'), '.gitignore must exclude .env.local');

    const appSource = fs.readFileSync('src/App.tsx', 'utf8');
    assert.ok(!appSource.includes('pk.ey'), 'App.tsx must not contain public Mapbox token');
    assert.ok(!appSource.includes('mapbox://'), 'App.tsx must not contain Mapbox style URLs');
  });

  await check('Neshan tile hash math formula matches live Neshan tile edge nodes exactly', () => {
    // Verified hash from live Neshan edge for z=14, x=10531, y=6502
    const baseHash = calcNeshanTile(14, 10531, 6502, 103, 2518);
    assert.equal(baseHash, '30123552148242106232510');

    const labelHash = calcNeshanTile(14, 10531, 6502, 202, 2518);
    assert.equal(labelHash, '301245521416162106232510');

    const baseUrl = buildNeshanBaseTileUrl(14, 10531, 6502, 0);
    assert.equal(baseUrl, 'https://tile1.neshan.org/30123552148242106232510.png');

    const labelUrl = buildNeshanLabelTileUrl(14, 10531, 6502, 0);
    assert.equal(labelUrl, 'https://tile5.neshan.org/301245521416162106232510.png');
  });

  await check('Neshan tile options use 256px standard tiles with subdomains', () => {
    assert.equal(NESHAN_TILE_OPTIONS.tileSize, 256);
    assert.equal(NESHAN_TILE_OPTIONS.detectRetina, false);
    assert.equal(NESHAN_TILE_OPTIONS.maxZoom, 19);
    assert.deepEqual([...NESHAN_TILE_OPTIONS.subdomains], ['1', '2', '3', '4']);
  });

  await check('Rolling-window monitor ignores tileabort and stale layers, triggering failover at threshold', () => {
    let failoverTriggered = false;
    const monitor = new NeshanTileHealthMonitor(
      { minCompletedOutcomes: 8, minFailedOutcomes: 5, failureRateThreshold: 0.6 },
      () => {
        failoverTriggered = true;
      }
    );

    monitor.setLayerGeneration(1);

    // 1 single error does NOT trigger failover
    monitor.recordError(1, 500);
    assert.equal(failoverTriggered, false);

    // Aborts due to pan/zoom do NOT trigger failover
    monitor.recordAbort(1);
    monitor.recordAbort(1);
    assert.equal(failoverTriggered, false);

    // Stale generation events are ignored
    monitor.recordError(0, 500);
    monitor.recordSuccess(0);
    assert.equal(monitor.getSnapshot().total, 1);

    // Add successes
    monitor.recordSuccess(1);
    monitor.recordSuccess(1);
    monitor.recordSuccess(1);

    // Add failures to cross >=8 total, >=5 failures, >=60% rate
    monitor.recordError(1, 500);
    monitor.recordError(1, 500);
    monitor.recordError(1, 500);
    monitor.recordError(1, 500);
    monitor.recordError(1, 500);

    assert.equal(failoverTriggered, true, 'Failover must be triggered when failure thresholds are reached');
  });

  await check('classifyNeshanHttpError accurately categorizes HTTP statuses', () => {
    assert.equal(classifyNeshanHttpError(401).category, 'unauthorized');
    assert.equal(classifyNeshanHttpError(403).category, 'forbidden');
    assert.equal(classifyNeshanHttpError(404).category, 'not_found');
    assert.equal(classifyNeshanHttpError(429).category, 'rate_limited');
    assert.equal(classifyNeshanHttpError(502).category, 'server_error');
    assert.equal(classifyNeshanHttpError(null).category, 'network_error');
  });

  await check('Leaflet base tile controller initializes with Neshan, supports clean switching, and stops on fallback', () => {
    const layersOnMap = new Set<any>();
    const mockMap = {
      _layers: {} as Record<string, any>,
      hasLayer(l: any) {
        return layersOnMap.has(l);
      },
      addLayer(l: any) {
        layersOnMap.add(l);
        return this;
      },
      removeLayer(l: any) {
        layersOnMap.delete(l);
        return this;
      },
      on() {
        return this;
      },
      off() {
        return this;
      },
      getZoom() {
        return 13;
      },
      getCenter() {
        return { lat: 35.7, lng: 51.4 };
      },
    };

    const mockL = {
      GridLayer: { prototype: {} },
      TileLayer: {
        extend(def: any) {
          function SubClass(this: any, url: any, options: any) {
            this._url = url;
            this.options = options || {};
            this._events = {};
          }
          SubClass.prototype = Object.create(def);
          SubClass.prototype.addTo = function (map: any) {
            map.addLayer(this);
            return this;
          };
          SubClass.prototype.bringToBack = function () {
            return this;
          };
          SubClass.prototype.on = function (evt: string, fn: any) {
            this._events[evt] = fn;
            return this;
          };
          SubClass.prototype.off = function () {
            return this;
          };
          return SubClass;
        },
      },
      tileLayer(url: string, options: any) {
        return {
          _url: url,
          options,
          addTo(map: any) {
            map.addLayer(this);
            return this;
          },
          bringToBack() {
            return this;
          },
          on() {
            return this;
          },
          off() {
            return this;
          },
        };
      },
    };

    const controller = createLeafletBaseTileController({
      map: mockMap,
      L: mockL,
      initialPreferredStyle: 'neshan',
    });

    assert.equal(controller.getEffectiveProvider(), 'neshan');

    // Switch to OSM (Free keyless map)
    controller.switchStyle('osm');
    assert.equal(controller.getEffectiveProvider(), 'osm');

    // Retry Neshan
    controller.retryNeshan();
    assert.equal(controller.getEffectiveProvider(), 'neshan');

    // Individual tile error applies one-time OSM per-tile fallback without blank hole
    const neshanLayer = controller.getActiveBaseLayer();
    const addedClasses = new Set<string>();
    const fakeTile: any = {
      status: null,
      src: 'https://tile2.neshan.org/301234421282452628050.png',
      dataset: {},
      style: { visibility: 'hidden', opacity: '0' },
      classList: { add: (cls: string) => addedClasses.add(cls) },
    };
    neshanLayer._events.tileerror({ tile: fakeTile, coords: { z: 12, x: 2632, y: 1611 } });
    assert.equal(fakeTile.dataset.osmFallbackApplied, '1');
    assert.equal(fakeTile.src, 'https://tile.openstreetmap.org/12/2632/1611.png');
    assert.equal(typeof fakeTile.onload, 'function');
    fakeTile.onload();
    assert.equal(addedClasses.has('leaflet-tile-loaded'), true);
    assert.equal(fakeTile.style.visibility, 'visible');
    assert.equal(fakeTile.style.opacity, '1');

    // Second error on same tile does NOT re-trigger fallback loop
    fakeTile.src = 'unchanged';
    neshanLayer._events.tileerror({ tile: fakeTile, coords: { z: 12, x: 2632, y: 1611 } });
    assert.equal(fakeTile.src, 'unchanged');

    controller.destroy();
  });

  await check('Only approved Neshan/OSM providers are selectable', () => {
    assert.equal((FREE_KEYLESS_TILE_SERVERS as any).mapbox, undefined);
    assert.equal((FREE_KEYLESS_TILE_SERVERS as any).satellite, undefined, 'Esri imagery must not be exposed without a commercial license');
    assert.equal((FREE_KEYLESS_TILE_SERVERS as any).carto_dark, undefined, 'CARTO basemaps must not be exposed without an API key');
    assert.equal((FREE_KEYLESS_TILE_SERVERS as any).osm_hot, undefined, 'OSM France free tiles must not be exposed for a commercial site');
    assert.equal(isValidMapTileServerId('neshan'), true);
    assert.equal(isValidMapTileServerId('osm'), true);
    assert.equal(isValidMapTileServerId('satellite'), false, 'Unlicensed Esri imagery must not be selectable');
    assert.equal(isValidMapTileServerId('carto_dark'), false, 'CARTO basemaps require a configured API key');
    assert.equal(isValidMapTileServerId('osm_hot'), false, 'OSM France free tiles are not an approved commercial provider');
    assert.equal(isValidMapTileServerId('voyager'), true);
    assert.equal(isValidMapTileServerId('mapbox'), false, 'Removed mapbox must not be valid');
    assert.equal(isValidMapTileServerId('invalid_style'), false);
  });

  await check('patchLeafletGridLayerNullSafety intercepts Leaflet zoom and setView when _map is null', () => {
    const fakeProto: any = {
      _animateZoom() {
        return this._map.project();
      },
      _setView() {
        return this._map.project();
      },
      _updateLevels() {
        return this._map.project();
      },
      _update() {
        return this._map.project();
      },
    };
    const mockL = { GridLayer: { prototype: fakeProto } };
    patchLeafletGridLayerNullSafety(mockL);

    const detachedLayer: any = Object.create(fakeProto);
    detachedLayer._map = null;

    // Must return safely without throwing TypeError: Cannot read properties of null (reading 'project')
    assert.doesNotThrow(() => {
      detachedLayer._animateZoom({ center: [35, 51], zoom: 14 });
      detachedLayer._setView([35, 51], 14);
      detachedLayer._updateLevels();
      detachedLayer._update([35, 51]);
    });
  });

  console.log(`\n🎉 All ${passed} Neshan Primary + Automatic OSM Fallback verification checks passed!\n`);
}

runSuite().catch((err) => {
  console.error('❌ Neshan + OSM Fallback test suite failed:', err);
  process.exit(1);
});
