/**
 * @file tests/rt-fe-bugfix-001-cache-clear.test.ts
 * @description Independent regression tests for:
 *  - RT-FE-BUGFIX-001 (BUG-001): Safe temporary cache reset without deleting persistent user data (7 acceptance rows)
 *  - RT-FE-BUGFIX-004: Full URL (pathname + search + hash) preservation across Cache Reset & reload hydration (8 scenarios)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  PERSISTENT_USER_STORAGE_KEYS,
  TEMPORARY_CACHE_STORAGE_KEYS,
  classifyStorageKeyOwnership,
  executeSafeTemporaryCacheReset,
  isTemporaryCacheStorageKey,
} from '../src/platform/storage/safeCacheReset';
import {
  buildCanonicalPathForDestination,
  buildSynchronizedNavigationUrl,
  resolveRouteFromLocation,
} from '../src/navigation/url/navigationUrlContract';
import { applyUrlParamsFromLocation } from '../src/components/useAppUrlAndTitleSync';
import type { CityId } from '../src/data/neighborhoods';

class MockStorage implements Storage {
  private map = new Map<string, string>();
  private failingRemoveKeys: Set<string>;

  constructor(initial: Record<string, string> = {}, failingRemoveKeys: string[] = []) {
    Object.entries(initial).forEach(([k, v]) => this.map.set(k, v));
    this.failingRemoveKeys = new Set(failingRemoveKeys);
  }

  get length(): number {
    return this.map.size;
  }

  clear(): void {
    this.map.clear();
  }

  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }

  key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    if (this.failingRemoveKeys.has(key)) {
      throw new Error(`Simulated storage removeItem failure on ${key}`);
    }
    this.map.delete(key);
  }

  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }

  snapshot(): Record<string, string> {
    return Object.fromEntries(this.map.entries());
  }
}

test('BUG-001 Rows 1, 2, 3, 4, 5: Temporary cache is cleared while favorites, visited homes, preferences, and unknown keys remain intact and re-hydrate cleanly', async () => {
  const favoritesPayload = JSON.stringify([5, 12, 101, 201]);
  const visitedPayload = JSON.stringify([{ id: 'v1', hoodId: 5, address: 'سعادت‌آباد سرو شرقی' }]);
  const portfolioPayload = JSON.stringify({ ownedUnits: [{ id: 'u1', sqm: 92 }] });
  const recentSearchesPayload = JSON.stringify(['سعادت‌آباد', 'عظیمیه']);

  const mockStorage = new MockStorage({
    // Persistent user data
    tehran_radar_favorites_v1: favoritesPayload,
    tehran_radar_visited_homes_v1: visitedPayload,
    tehran_radar_visited_apartments_v1: visitedPayload,
    tehran_radar_my_portfolio_v1: portfolioPayload,
    tehran_radar_recent_searches_v1: recentSearchesPayload,
    tehran_radar_apple_theme_v1: 'dark',
    radar_area_unit_v1: 'sqm',
    radar_locale_v1: 'fa',
    // Unknown future keys (must NOT be swept by prefix)
    tehran_radar_future_user_feature_v9: '{"pinned":true}',
    tehran_neighborhoods_custom_notes_v1: '{"note":"keep me"}',
    custom_plugin_state: 'preserve-me',
    // Temporary cache keys (MUST be removed)
    tehran_neighborhoods_radar_v1: '{"cached":true}',
    tehran_neighborhoods_radar_v2: '{"cached":true}',
    tehran_radar_feature_flags_v1: '{"flags":true}',
    tehran_radar_feature_flags_v2: '{"flags":true}',
    tehran_radar_cache_ts_v1: '1700000000',
    tehran_radar_hood_lru_v1: '[]',
    'rt:v1:cache:market_pulse': '{"stale":1}',
    radar_resilience_v1_snapshot: '{"stale":2}',
    radar_tile_cache_osm: 'blob',
  });

  let memoryCacheClearedCount = 0;
  const deletedBrowserCaches: string[] = [];
  let swUpdatedCount = 0;

  const report = await executeSafeTemporaryCacheReset({
    storage: mockStorage,
    cacheStorage: {
      keys: async () => [
        'tehran-radar-shell-v4-2026-10',
        'tehran-radar-assets-v4-2026-10',
        'tehran-radar-data-v4-2026-10',
        'unrelated-origin-app-v1',
      ],
      delete: async (name: string) => {
        deletedBrowserCaches.push(name);
        return true;
      },
    },
    serviceWorker: {
      getRegistrations: async () => [
        {
          update: async () => {
            swUpdatedCount += 1;
          },
        },
      ],
    },
    clearMemoryCaches: [
      () => {
        memoryCacheClearedCount += 1;
      },
      () => {
        memoryCacheClearedCount += 1;
      },
    ],
  });

  // Row 1 & Row 3: Favorites & all persistent user keys preserved identically for post-refresh hydration
  assert.equal(mockStorage.getItem('tehran_radar_favorites_v1'), favoritesPayload);
  assert.deepEqual(JSON.parse(mockStorage.getItem('tehran_radar_favorites_v1')!), [5, 12, 101, 201]);
  assert.equal(mockStorage.getItem('tehran_radar_visited_homes_v1'), visitedPayload);
  assert.equal(mockStorage.getItem('tehran_radar_visited_apartments_v1'), visitedPayload);
  assert.equal(mockStorage.getItem('tehran_radar_my_portfolio_v1'), portfolioPayload);
  assert.equal(mockStorage.getItem('tehran_radar_recent_searches_v1'), recentSearchesPayload);
  assert.equal(mockStorage.getItem('tehran_radar_apple_theme_v1'), 'dark');
  assert.equal(mockStorage.getItem('radar_area_unit_v1'), 'sqm');
  assert.equal(mockStorage.getItem('radar_locale_v1'), 'fa');

  // Row 2: Temporary cache keys removed + Browser Cache Storage & SW refreshed
  for (const tempKey of [
    'tehran_neighborhoods_radar_v1',
    'tehran_neighborhoods_radar_v2',
    'tehran_radar_feature_flags_v1',
    'tehran_radar_feature_flags_v2',
    'tehran_radar_cache_ts_v1',
    'tehran_radar_hood_lru_v1',
    'rt:v1:cache:market_pulse',
    'radar_resilience_v1_snapshot',
    'radar_tile_cache_osm',
  ]) {
    assert.equal(mockStorage.getItem(tempKey), null, `Temporary cache key ${tempKey} must be removed`);
    assert.ok(report.removedLocalStorageKeys.includes(tempKey));
  }
  assert.deepEqual(deletedBrowserCaches, [
    'tehran-radar-shell-v4-2026-10',
    'tehran-radar-assets-v4-2026-10',
    'tehran-radar-data-v4-2026-10',
  ]);
  assert.deepEqual(report.preservedBrowserCaches, ['unrelated-origin-app-v1']);
  assert.equal(swUpdatedCount, 1);

  // Row 4: In-memory caches synced & cleared
  assert.equal(memoryCacheClearedCount, 2);
  assert.equal(report.clearedMemoryCaches, 2);

  // Row 5: Unknown keys (even sharing tehran_radar_ / tehran_neighborhoods_ prefix!) are preserved
  assert.equal(mockStorage.getItem('tehran_radar_future_user_feature_v9'), '{"pinned":true}');
  assert.equal(mockStorage.getItem('tehran_neighborhoods_custom_notes_v1'), '{"note":"keep me"}');
  assert.equal(mockStorage.getItem('custom_plugin_state'), 'preserve-me');
  assert.equal(classifyStorageKeyOwnership('tehran_radar_future_user_feature_v9'), 'unknown_preserved');
  assert.equal(isTemporaryCacheStorageKey('tehran_radar_favorites_v1'), false);
  assert.equal(report.partialFailure, false);
});

test('BUG-001 Row 6: Browser Cache Storage error and partial localStorage.removeItem error do not throw or delete persistent user data', async () => {
  const mockStorage = new MockStorage(
    {
      tehran_radar_favorites_v1: '[1,2,3]',
      tehran_radar_cache_ts_v1: '123',
      tehran_neighborhoods_radar_v2: '{"x":1}',
    },
    ['tehran_radar_cache_ts_v1']
  );

  const report = await executeSafeTemporaryCacheReset({
    storage: mockStorage,
    cacheStorage: {
      keys: async () => {
        throw new Error('SecurityError: CacheStorage blocked');
      },
      delete: async () => false,
    },
    serviceWorker: {
      getRegistrations: async () => {
        throw new Error('SW unavailable');
      },
    },
    clearMemoryCaches: [
      () => {
        throw new Error('Memory cache error');
      },
    ],
  });

  assert.equal(report.partialFailure, true);
  assert.deepEqual(report.failedLocalStorageKeys, ['tehran_radar_cache_ts_v1']);
  assert.equal(report.failedMemoryCaches, 1);
  assert.match(report.browserCacheError || '', /CacheStorage blocked/);
  assert.match(report.serviceWorkerError || '', /SW unavailable/);
  assert.equal(mockStorage.getItem('tehran_radar_favorites_v1'), '[1,2,3]');
  assert.equal(mockStorage.getItem('tehran_neighborhoods_radar_v2'), null);
});

test('BUG-001 Row 7: Repeated cache reset execution is idempotent and leaves user data untouched', async () => {
  const mockStorage = new MockStorage({
    tehran_radar_favorites_v1: '[5,7]',
    tehran_neighborhoods_radar_v1: '{"a":1}',
  });

  const emptyCaches = { keys: async () => [] as string[], delete: async () => true };
  const first = await executeSafeTemporaryCacheReset({ storage: mockStorage, cacheStorage: emptyCaches, serviceWorker: null });
  const second = await executeSafeTemporaryCacheReset({ storage: mockStorage, cacheStorage: emptyCaches, serviceWorker: null });

  assert.deepEqual(first.removedLocalStorageKeys, ['tehran_neighborhoods_radar_v1']);
  assert.deepEqual(second.removedLocalStorageKeys, []);
  assert.equal(second.partialFailure, false);
  assert.equal(mockStorage.getItem('tehran_radar_favorites_v1'), '[5,7]');

  // Ownership sets remain disjoint
  for (const pKey of PERSISTENT_USER_STORAGE_KEYS) {
    assert.equal(
      TEMPORARY_CACHE_STORAGE_KEYS.includes(pKey as (typeof TEMPORARY_CACHE_STORAGE_KEYS)[number]),
      false,
      `Persistent key ${pKey} must never appear in TEMPORARY_CACHE_STORAGE_KEYS`
    );
  }
});

test('RT-FE-BUGFIX-004: Static verification that RootErrorBoundary & DualLayerErrorTrap preserve full URL via reload() and never wipe favorites', () => {
  const mainSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/main.tsx'), 'utf8');
  const dualSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/components/DualLayerErrorTrap.tsx'), 'utf8');

  for (const [name, src] of [
    ['src/main.tsx', mainSrc],
    ['src/components/DualLayerErrorTrap.tsx', dualSrc],
  ]) {
    assert.ok(src.includes('executeSafeTemporaryCacheReset'), `${name} must use executeSafeTemporaryCacheReset`);
    assert.ok(src.includes('window.location.reload()'), `${name} must use window.location.reload() to preserve query & hash`);
    assert.equal(
      src.includes('window.location.href = window.location.pathname'),
      false,
      `${name} must NOT strip query & hash via window.location.href = window.location.pathname`
    );
    assert.equal(
      src.includes("startsWith('tehran_radar_')"),
      false,
      `${name} must NOT sweep all tehran_radar_* keys`
    );
    assert.equal(
      src.includes("'tehran_radar_favorites_v1'"),
      false,
      `${name} must NOT list tehran_radar_favorites_v1 for deletion`
    );
  }
});

test('RT-FE-BUGFIX-004: All 8 URL scenarios survive Cache Reset -> reload() -> re-hydration without dropping city, view, valid queries, or hash', async () => {
  interface HydratedState {
    city: CityId;
    view: string;
    subTab?: string;
    mode: 'rent' | 'buy';
    buyTotalBudget: number;
    targetSqm: number;
    selectedHoodId: number;
  }

  const runReloadHydration = async (initialHref: string) => {
    const parsed = new URL(initialHref, 'https://radartehran.ir');
    const mockStorage = new MockStorage({
      tehran_radar_favorites_v1: '[101]',
      tehran_neighborhoods_radar_v2: '{"stale":true}',
    });

    // Simulate handleFullCacheReset: safe reset followed by browser reload() preserving exact URL
    let reloadedHref = '';
    await executeSafeTemporaryCacheReset({ storage: mockStorage, cacheStorage: null, serviceWorker: null });
    reloadedHref = `${parsed.pathname}${parsed.search}${parsed.hash}`;

    const reloadedUrl = new URL(reloadedHref, 'https://radartehran.ir');
    const state: HydratedState = {
      city: 'tehran',
      view: 'map',
      subTab: undefined,
      mode: 'rent',
      buyTotalBudget: 8000,
      targetSqm: 80,
      selectedHoodId: 5,
    };

    applyUrlParamsFromLocation(reloadedUrl.pathname, reloadedUrl.search, false, {
      activeCity: state.city,
      setActiveCity: (c) => { state.city = c; },
      selectedHoodId: state.selectedHoodId,
      setSelectedHoodId: (id) => { state.selectedHoodId = id; },
      showCompareModal: false,
      setShowCompareModal: () => {},
      compareId1: 5,
      setCompareId1: () => {},
      compareId2: 1,
      setCompareId2: () => {},
      mode: state.mode,
      setMode: (m) => { state.mode = m; },
      deposit: 500,
      setDeposit: () => {},
      monthlyRent: 20,
      setMonthlyRent: () => {},
      buyTotalBudget: state.buyTotalBudget,
      setBuyTotalBudget: (b) => { state.buyTotalBudget = b; },
      targetSqm: state.targetSqm,
      setTargetSqm: (s) => { state.targetSqm = s; },
      primaryView: state.view,
      setPrimaryView: (v) => { state.view = v; },
      activeSubTab: state.subTab as never,
      setActiveSubTab: (s) => { state.subTab = s; },
      mapInstanceRef: { current: null },
      hasUrlBudgetParams: false,
    });

    const canonicalPath =
      state.view !== 'map' && state.view !== 'home'
        ? buildCanonicalPathForDestination(state.view as never, state.subTab as never)
        : reloadedUrl.pathname;

    const syncedUrl =
      state.view !== 'map' && state.view !== 'home'
        ? buildSynchronizedNavigationUrl({
            canonicalPath,
            currentSearch: reloadedUrl.search,
            currentHash: reloadedUrl.hash,
            isRouteChange: false,
            activeCity: state.city,
            selectedHoodId: state.selectedHoodId,
          })
        : `${reloadedUrl.pathname}${reloadedUrl.search}${reloadedUrl.hash}`;

    return { reloadedHref, state, syncedUrl, favoritesAfter: mockStorage.getItem('tehran_radar_favorites_v1') };
  };

  // Scenario 1: /?city=karaj
  const s1 = await runReloadHydration('/?city=karaj');
  assert.equal(s1.reloadedHref, '/?city=karaj');
  assert.equal(s1.state.city, 'karaj');
  assert.equal(s1.favoritesAfter, '[101]');

  // Scenario 2: /?city=mashhad
  const s2 = await runReloadHydration('/?city=mashhad');
  assert.equal(s2.reloadedHref, '/?city=mashhad');
  assert.equal(s2.state.city, 'mashhad');

  // Scenario 3: /?view=properties
  const s3 = await runReloadHydration('/?view=properties');
  assert.equal(s3.reloadedHref, '/?view=properties');
  assert.equal(s3.state.view, 'properties');
  assert.equal(resolveRouteFromLocation('/', '?view=properties').viewId, 'properties');

  // Scenario 4: /?city=karaj&view=properties
  const s4 = await runReloadHydration('/?city=karaj&view=properties');
  assert.equal(s4.reloadedHref, '/?city=karaj&view=properties');
  assert.equal(s4.state.city, 'karaj');
  assert.equal(s4.state.view, 'properties');
  assert.ok(s4.syncedUrl.includes('city=karaj'));

  // Scenario 5: URL with Hash
  const s5 = await runReloadHydration('/?city=karaj&view=properties#listing-results');
  assert.equal(s5.reloadedHref, '/?city=karaj&view=properties#listing-results');
  assert.equal(s5.state.city, 'karaj');
  assert.equal(s5.state.view, 'properties');
  assert.ok(s5.syncedUrl.endsWith('#listing-results'), `Hash must be preserved, got ${s5.syncedUrl}`);

  // Scenario 6: Multiple valid query parameters
  const s6 = await runReloadHydration('/?city=isfahan&view=properties&mode=buy&buy=12000&sqm=95&sort=newest');
  assert.equal(s6.state.city, 'isfahan');
  assert.equal(s6.state.view, 'properties');
  assert.equal(s6.state.mode, 'buy');
  assert.equal(s6.state.buyTotalBudget, 12000);
  assert.equal(s6.state.targetSqm, 95);
  assert.ok(s6.syncedUrl.includes('city=isfahan'));
  assert.ok(s6.syncedUrl.includes('sort=newest'));

  // Scenario 7: URL without query
  const s7 = await runReloadHydration('/');
  assert.equal(s7.reloadedHref, '/');
  assert.equal(s7.state.city, 'tehran');
  assert.equal(s7.state.view, 'map');

  // Scenario 8: Repeated reset without redirect loop
  const pass1 = await runReloadHydration('/?city=shiraz&view=properties#cards');
  const pass2 = await runReloadHydration(pass1.syncedUrl);
  assert.equal(pass2.state.city, 'shiraz');
  assert.equal(pass2.state.view, 'properties');
  assert.equal(pass2.syncedUrl, pass1.syncedUrl, 'Repeated resets must converge with zero redirect loop');
});
