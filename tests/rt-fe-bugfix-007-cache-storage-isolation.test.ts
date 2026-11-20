/**
 * @file tests/rt-fe-bugfix-007-cache-storage-isolation.test.ts
 * @description Independent CacheStorage-mock regression suite for RT-FE-BUGFIX-007-ORIGIN-CACHE-STORAGE-ISOLATION.
 * Covers all 7 matrix scenarios, explicit unrelated-namespace preservation, separation of
 * hook_auto_recovery / manual_full_cache_reset / service_worker_activate policies,
 * legacy Radar cache cleanup, partial/complete failure handling, and static code guards.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  ACTIVE_RADAR_CACHE_NAMES,
  CACHE_PURGE_POLICIES,
  RADAR_APP_SHELL_CACHE_NAME,
  RADAR_CACHE_INVENTORY,
  RADAR_MAP_AND_API_CACHE_NAME,
  RADAR_UI_ASSETS_CACHE_NAME,
  classifyCacheStorageOwnership,
  executeScopedCacheStoragePurge,
  type ScopedCacheStorageLike,
} from '../src/platform/storage/cacheStorageOwnership';
import { executeSafeTemporaryCacheReset } from '../src/platform/storage/safeCacheReset';
import {
  createAutoRecoveryDocumentGuard,
  executeHookErrorAutoRecovery,
} from '../src/platform/recovery/hookErrorAutoRecovery';

class MockOriginCacheStorage implements ScopedCacheStorageLike {
  private readonly cachesMap = new Set<string>();
  private readonly failingDeleteNames: Set<string>;
  private readonly returnFalseNames: Set<string>;
  public readonly deleteCalls: string[] = [];

  constructor(
    initialCacheNames: string[],
    options: { failingDeleteNames?: string[]; returnFalseNames?: string[] } = {},
  ) {
    initialCacheNames.forEach((n) => this.cachesMap.add(n));
    this.failingDeleteNames = new Set(options.failingDeleteNames ?? []);
    this.returnFalseNames = new Set(options.returnFalseNames ?? []);
  }

  async keys(): Promise<string[]> {
    return Array.from(this.cachesMap.values());
  }

  async delete(cacheName: string): Promise<boolean> {
    this.deleteCalls.push(cacheName);
    if (this.failingDeleteNames.has(cacheName)) {
      throw new Error(`Simulated CacheStorage.delete failure for ${cacheName}`);
    }
    if (this.returnFalseNames.has(cacheName)) {
      return false;
    }
    return this.cachesMap.delete(cacheName);
  }

  remaining(): string[] {
    return Array.from(this.cachesMap.values());
  }
}

test('RT-FE-BUGFIX-007 Scenario 1: Only Radar-owned caches (active + legacy versions) are present -> all allowed Radar caches deleted', async () => {
  const legacyShell = 'tehran-radar-shell-v3-2026-07';
  const legacyAssets = 'tehran-radar-assets-v2-2026-05';
  const mockCaches = new MockOriginCacheStorage([
    RADAR_APP_SHELL_CACHE_NAME,
    RADAR_UI_ASSETS_CACHE_NAME,
    RADAR_MAP_AND_API_CACHE_NAME,
    legacyShell,
    legacyAssets,
  ]);

  const report = await executeSafeTemporaryCacheReset({
    storage: null,
    cacheStorage: mockCaches,
    serviceWorker: null,
  });

  assert.equal(report.ok, true);
  assert.equal(report.browserCacheStatus, 'success');
  assert.equal(report.removedBrowserCaches.length, 5);
  assert.deepEqual(report.preservedBrowserCaches, []);
  assert.deepEqual(report.failedBrowserCaches, []);
  assert.deepEqual(mockCaches.remaining(), []);
});

test('RT-FE-BUGFIX-007 Scenario 2: Independent module cache is deleted ONLY when ownership is explicitly confirmed', async () => {
  const moduleCache = 'partner-mortgage-widget-cache-v1';

  // Without confirmation -> MUST be preserved
  const unconfirmedStore = new MockOriginCacheStorage([RADAR_APP_SHELL_CACHE_NAME, moduleCache]);
  const unconfirmedReport = await executeSafeTemporaryCacheReset({
    storage: null,
    cacheStorage: unconfirmedStore,
    serviceWorker: null,
  });
  assert.deepEqual(unconfirmedReport.removedBrowserCaches, [RADAR_APP_SHELL_CACHE_NAME]);
  assert.deepEqual(unconfirmedReport.preservedBrowserCaches, [moduleCache]);
  assert.deepEqual(unconfirmedStore.remaining(), [moduleCache]);
  assert.equal(unconfirmedStore.deleteCalls.includes(moduleCache), false);

  // With explicit ownership confirmation -> allowed during manual reset
  const confirmedStore = new MockOriginCacheStorage([RADAR_APP_SHELL_CACHE_NAME, moduleCache]);
  const confirmedReport = await executeSafeTemporaryCacheReset({
    storage: null,
    cacheStorage: confirmedStore,
    serviceWorker: null,
    confirmedModuleCaches: [moduleCache],
  });
  assert.deepEqual(confirmedReport.removedBrowserCaches, [RADAR_APP_SHELL_CACHE_NAME, moduleCache]);
  assert.deepEqual(confirmedStore.remaining(), []);
});

test('RT-FE-BUGFIX-007 Scenario 3 & Required Unrelated-Namespace Test: Unknown/unrelated origin caches MUST survive Reset untouched', async () => {
  const unrelatedNamespaceCache = 'foreign-portal-docs-ns-v2';
  const unknownWorkboxCache = 'workbox-precache-v2-https://example.org/';
  const spoofedPrefixCache = 'tehran-radar-unrelated-app-v1';

  const mockCaches = new MockOriginCacheStorage([
    RADAR_APP_SHELL_CACHE_NAME,
    RADAR_UI_ASSETS_CACHE_NAME,
    RADAR_MAP_AND_API_CACHE_NAME,
    unrelatedNamespaceCache,
    unknownWorkboxCache,
    spoofedPrefixCache,
  ]);

  const report = await executeSafeTemporaryCacheReset({
    storage: null,
    cacheStorage: mockCaches,
    serviceWorker: null,
  });

  assert.equal(report.ok, true);
  assert.equal(report.browserCacheStatus, 'success');
  assert.deepEqual(report.removedBrowserCaches, [
    RADAR_APP_SHELL_CACHE_NAME,
    RADAR_UI_ASSETS_CACHE_NAME,
    RADAR_MAP_AND_API_CACHE_NAME,
  ]);
  assert.deepEqual(report.preservedBrowserCaches, [
    unrelatedNamespaceCache,
    unknownWorkboxCache,
    spoofedPrefixCache,
  ]);
  // Critical invariant: unrelated cache still exists in CacheStorage and delete() was NEVER even called on it
  assert.deepEqual(mockCaches.remaining(), [
    unrelatedNamespaceCache,
    unknownWorkboxCache,
    spoofedPrefixCache,
  ]);
  assert.equal(mockCaches.deleteCalls.includes(unrelatedNamespaceCache), false);
  assert.equal(mockCaches.deleteCalls.includes(unknownWorkboxCache), false);
  assert.equal(mockCaches.deleteCalls.includes(spoofedPrefixCache), false);
  assert.equal(classifyCacheStorageOwnership(unrelatedNamespaceCache).ownership, 'unknown_preserved');
});

test('RT-FE-BUGFIX-007 Scenario 4: Deleting one allowed cache fails -> remaining allowed caches are still deleted and failure is recorded truthfully', async () => {
  const unrelatedCache = 'analytics-sdk-cache-v1';
  const mockCaches = new MockOriginCacheStorage(
    [
      RADAR_APP_SHELL_CACHE_NAME,
      RADAR_UI_ASSETS_CACHE_NAME,
      RADAR_MAP_AND_API_CACHE_NAME,
      unrelatedCache,
    ],
    { failingDeleteNames: [RADAR_UI_ASSETS_CACHE_NAME] },
  );

  const report = await executeSafeTemporaryCacheReset({
    storage: null,
    cacheStorage: mockCaches,
    serviceWorker: null,
  });

  assert.equal(report.ok, false, 'Partial failure MUST NOT report false success');
  assert.equal(report.partialFailure, true);
  assert.equal(report.browserCacheStatus, 'partial_failure');
  assert.deepEqual(report.removedBrowserCaches, [
    RADAR_APP_SHELL_CACHE_NAME,
    RADAR_MAP_AND_API_CACHE_NAME,
  ]);
  assert.deepEqual(report.failedBrowserCaches, [RADAR_UI_ASSETS_CACHE_NAME]);
  assert.deepEqual(report.preservedBrowserCaches, [unrelatedCache]);
  assert.match(report.browserCacheError || '', /Simulated CacheStorage\.delete failure/);
  assert.deepEqual(mockCaches.remaining(), [RADAR_UI_ASSETS_CACHE_NAME, unrelatedCache]);

  // Complete failure when ALL eligible deletions fail
  const allFailStore = new MockOriginCacheStorage([RADAR_APP_SHELL_CACHE_NAME], {
    failingDeleteNames: [RADAR_APP_SHELL_CACHE_NAME],
  });
  const completeFailReport = await executeScopedCacheStoragePurge(allFailStore, 'manual_full_cache_reset');
  assert.equal(completeFailReport.ok, false);
  assert.equal(completeFailReport.status, 'complete_failure');
  assert.deepEqual(completeFailReport.failed, [RADAR_APP_SHELL_CACHE_NAME]);
});

test('RT-FE-BUGFIX-007 Scenario 5: Empty Cache Storage completes cleanly without errors', async () => {
  const emptyStore = new MockOriginCacheStorage([]);
  const report = await executeSafeTemporaryCacheReset({
    storage: null,
    cacheStorage: emptyStore,
    serviceWorker: null,
  });

  assert.equal(report.ok, true);
  assert.equal(report.partialFailure, false);
  assert.equal(report.browserCacheStatus, 'empty_noop');
  assert.deepEqual(report.removedBrowserCaches, []);
  assert.deepEqual(report.preservedBrowserCaches, []);
  assert.deepEqual(report.failedBrowserCaches, []);
  assert.equal(report.browserCacheError, null);
});

test('RT-FE-BUGFIX-007 Scenario 6: Unavailable Cache Storage records a clear error and never claims false success', async () => {
  const unavailableReport = await executeSafeTemporaryCacheReset({
    storage: null,
    cacheStorage: null,
    serviceWorker: null,
  });

  assert.equal(unavailableReport.ok, false);
  assert.equal(unavailableReport.partialFailure, true);
  assert.equal(unavailableReport.browserCacheStatus, 'unavailable');
  assert.match(unavailableReport.browserCacheError || '', /CacheStorage API unavailable/);

  // Also when caches.keys() throws SecurityError
  const throwingStore: ScopedCacheStorageLike = {
    keys: async () => {
      const err = new Error('Origin cache access denied');
      err.name = 'SecurityError';
      throw err;
    },
    delete: async () => false,
  };
  const errReport = await executeScopedCacheStoragePurge(throwingStore, 'manual_full_cache_reset');
  assert.equal(errReport.ok, false);
  assert.equal(errReport.status, 'unavailable');
  assert.match(errReport.error || '', /SecurityError/);
});

test('RT-FE-BUGFIX-007 Scenario 7 & Separate Policies: Auto-Recovery purges ONLY shell & UI assets, preserving Radar data cache and unrelated caches; SW activate prunes ONLY legacy Radar versions', async () => {
  // Policy 1: Duplicate React Hook Auto-Recovery
  const storeMap = new Map<string, string>();
  const mockSessionStorage = {
    getItem: (k: string) => storeMap.get(k) ?? null,
    setItem: (k: string, v: string) => { storeMap.set(k, String(v)); },
  };
  const autoStore = new MockOriginCacheStorage([
    RADAR_APP_SHELL_CACHE_NAME,
    RADAR_UI_ASSETS_CACHE_NAME,
    RADAR_MAP_AND_API_CACHE_NAME,
    'unrelated-app-ns-v9',
  ]);
  let reloaded = 0;

  const autoResult = await executeHookErrorAutoRecovery(
    "Cannot read properties of null (reading 'useContext')",
    {
      windowObj: { sessionStorage: mockSessionStorage, caches: autoStore },
      navigatorObj: null,
      reloadFn: () => { reloaded += 1; },
    },
    createAutoRecoveryDocumentGuard(),
  );

  assert.equal(autoResult.outcome, 'auto_reloaded');
  assert.equal(reloaded, 1);
  assert.deepEqual(autoResult.cleanup.clearedCacheNames, [
    RADAR_APP_SHELL_CACHE_NAME,
    RADAR_UI_ASSETS_CACHE_NAME,
  ]);
  assert.deepEqual(autoResult.cleanup.preservedCacheNames, [
    RADAR_MAP_AND_API_CACHE_NAME,
    'unrelated-app-ns-v9',
  ]);
  assert.deepEqual(autoStore.remaining(), [
    RADAR_MAP_AND_API_CACHE_NAME,
    'unrelated-app-ns-v9',
  ]);

  // Policy 3: Service Worker activate — retains active Radar caches + unrelated caches, prunes only legacy Radar caches
  const swStore = new MockOriginCacheStorage([
    ...ACTIVE_RADAR_CACHE_NAMES,
    'tehran-radar-shell-v3-2026-01',
    'tehran-radar-data-v2-2025-11',
    'foreign-app-cache-v1',
  ]);
  const swPurge = await executeScopedCacheStoragePurge(swStore, 'service_worker_activate');
  assert.equal(swPurge.ok, true);
  assert.deepEqual(swPurge.deleted, ['tehran-radar-shell-v3-2026-01', 'tehran-radar-data-v2-2025-11']);
  assert.deepEqual(swStore.remaining(), [...ACTIVE_RADAR_CACHE_NAMES, 'foreign-app-cache-v1']);

  // Verify the 3 policies are strictly distinct in configuration
  assert.notDeepEqual(
    CACHE_PURGE_POLICIES.hook_auto_recovery.allowedCategories,
    CACHE_PURGE_POLICIES.manual_full_cache_reset.allowedCategories,
  );
  assert.equal(CACHE_PURGE_POLICIES.service_worker_activate.preserveActiveVersions, true);
  assert.equal(RADAR_CACHE_INVENTORY.length, 3);
});

test('RT-FE-BUGFIX-007 Static Guard: No unscoped global caches.keys() -> caches.delete() purge exists in sw.js, main.tsx, safeCacheReset.ts, or hookErrorAutoRecovery.ts', () => {
  const swSrc = fs.readFileSync(path.resolve(process.cwd(), 'public/sw.js'), 'utf8');
  const mainSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/main.tsx'), 'utf8');
  const resetSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/platform/storage/safeCacheReset.ts'), 'utf8');
  const autoSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/platform/recovery/hookErrorAutoRecovery.ts'), 'utf8');

  // public/sw.js must validate Radar ownership before pruning in activate
  assert.ok(swSrc.includes('isRadarOwnedSwCache(name)'), 'public/sw.js activate must check isRadarOwnedSwCache(name)');
  assert.ok(swSrc.includes('Promise.allSettled'), 'public/sw.js activate must isolate per-cache delete errors');
  // Active cache names in sw.js must stay synchronized with cacheStorageOwnership.ts
  assert.ok(swSrc.includes(`const CACHE_VERSION = 'v4-2026-10'`), 'sw.js CACHE_VERSION must match ownership inventory');

  // main.tsx must never call window.caches.delete directly
  assert.equal(mainSrc.includes('window.caches.delete'), false, 'src/main.tsx must not perform raw global caches.delete');
  assert.ok(resetSrc.includes("executeScopedCacheStoragePurge"), 'safeCacheReset.ts must use executeScopedCacheStoragePurge');
  assert.ok(autoSrc.includes("'hook_auto_recovery'"), 'hookErrorAutoRecovery.ts must use hook_auto_recovery policy');
});
