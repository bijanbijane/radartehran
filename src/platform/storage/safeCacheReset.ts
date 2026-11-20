/**
 * @file src/platform/storage/safeCacheReset.ts
 * @description Ownership-separated, allowlist-only temporary cache reset engine (RT-FE-BUGFIX-001 & RT-FE-BUGFIX-007).
 * Guarantees persistent user-owned data and unrelated Origin Cache Storage namespaces are NEVER deleted.
 */

import {
  executeScopedCacheStoragePurge,
  type CachePurgeEntryOutcome,
  type CachePurgeStatus,
} from './cacheStorageOwnership';

export type StorageKeyOwnershipClass = 'temporary_cache' | 'persistent_user' | 'unknown_preserved';

export const PERSISTENT_USER_STORAGE_KEYS: readonly string[] = [
  'tehran_radar_favorites_v1', 'tehran_radar_favorite_hoods_v1', 'tehran_radar_visited_homes_v1',
  'tehran_radar_visited_apartments_v1', 'tehran_radar_my_portfolio_v1', 'tehran_radar_recent_searches_v1',
  'tehran_radar_saved_map_views_v1', 'tehran_radar_saved_market_analyses_v1',
  'tehran_radar_price_threshold_alerts_v1', 'tehran_radar_dismissed_threshold_matches_v1',
  'tehran_radar_apple_theme_v1', 'tehran_radar_tile_style_v1', 'tehran_radar_neshan_pref_migrated_v1',
  'tehran_radar_onboarded_v1', 'tehran_radar_campaign_discount_v1', 'radar_area_unit_v1',
  'radar_locale_v1', 'radar_intl_currency_v1', 'radar_experience_mode_v1',
  'radar_listing_verifier_quota_v1', 'radar_hide_dev_overlay', 'favoriteHoodIds',
] as const;

export const PERSISTENT_USER_STORAGE_PREFIXES: readonly string[] = [
  'tehran_radar_listing_draft_v1', 'radar_acct_v1__', 'radar_account_', 'radar_saved_',
  'radar_my_listings_', 'radar_listing_', 'radar_valuation_', 'radar_offline_outbox_',
  'radar_buyer_price_alerts_', 'radar_visit_book_', 'rt:prefs:', 'rt:v1:prefs:',
  'rt:v1:preferences:', 'rt:v1:session:',
] as const;

export const TEMPORARY_CACHE_STORAGE_KEYS: readonly string[] = [
  'tehran_neighborhoods_radar_v1', 'tehran_neighborhoods_radar_v2',
  'tehran_radar_feature_flags_v1', 'tehran_radar_feature_flags_v2',
  'tehran_radar_cache_ts_v1', 'tehran_radar_hood_lru_v1',
  'tehran_radar_neshan_fallback_state_v1', 'tehran_radar_db_audit_weekly_v1',
  'tehran_radar_autotest_probe',
] as const;

export const TEMPORARY_CACHE_STORAGE_PREFIXES: readonly string[] = [
  'rt:cache:', 'rt:v1:cache:', 'rt:temp:', 'rt:v1:temp:', 'radar_resilience_v1_',
  'radar_tile_cache_', 'radar_market_cache_', 'radar_osm_boundary_cache_', 'radar_recent_perf_trace_',
] as const;

const PERSISTENT_KEY_SET = new Set<string>(PERSISTENT_USER_STORAGE_KEYS);
const TEMPORARY_CACHE_KEY_SET = new Set<string>(TEMPORARY_CACHE_STORAGE_KEYS);

export function classifyStorageKeyOwnership(key: string): StorageKeyOwnershipClass {
  const normalized = String(key || '');
  if (!normalized) return 'unknown_preserved';
  if (PERSISTENT_KEY_SET.has(normalized) || PERSISTENT_USER_STORAGE_PREFIXES.some((p) => normalized.startsWith(p))) {
    return 'persistent_user';
  }
  if (TEMPORARY_CACHE_KEY_SET.has(normalized) || TEMPORARY_CACHE_STORAGE_PREFIXES.some((p) => normalized.startsWith(p))) {
    return 'temporary_cache';
  }
  return 'unknown_preserved';
}

export function isTemporaryCacheStorageKey(key: string): boolean {
  return classifyStorageKeyOwnership(key) === 'temporary_cache';
}

export interface SafeCacheStorageLike {
  readonly length: number;
  key(index: number): string | null;
  getItem?(key: string): string | null;
  removeItem(key: string): void;
}

export interface BrowserCacheStorageLike {
  keys(): Promise<string[]>;
  delete(cacheName: string): Promise<boolean>;
}

export interface ServiceWorkerContainerLike {
  getRegistrations(): Promise<readonly { update(): Promise<unknown> }[]>;
}

export interface SafeCacheResetOptions {
  storage?: SafeCacheStorageLike | null;
  cacheStorage?: BrowserCacheStorageLike | null;
  serviceWorker?: ServiceWorkerContainerLike | null;
  clearMemoryCaches?: ReadonlyArray<() => void>;
  confirmedModuleCaches?: readonly string[];
}

export interface SafeCacheResetReport {
  ok: boolean;
  partialFailure: boolean;
  removedLocalStorageKeys: string[];
  failedLocalStorageKeys: string[];
  preservedLocalStorageKeys: string[];
  storageEnumerationError: string | null;
  clearedMemoryCaches: number;
  failedMemoryCaches: number;
  removedBrowserCaches: string[];
  preservedBrowserCaches: string[];
  failedBrowserCaches: string[];
  browserCacheEntries: CachePurgeEntryOutcome[];
  browserCacheStatus: CachePurgeStatus;
  browserCacheError: string | null;
  serviceWorkerUpdatedCount: number;
  serviceWorkerError: string | null;
}

function toErrorText(err: unknown): string {
  if (err instanceof Error) return err.message || err.name;
  return String(err || 'unknown_error');
}

export async function executeSafeTemporaryCacheReset(
  options: SafeCacheResetOptions = {},
): Promise<SafeCacheResetReport> {
  const report: SafeCacheResetReport = {
    ok: true, partialFailure: false,
    removedLocalStorageKeys: [], failedLocalStorageKeys: [], preservedLocalStorageKeys: [],
    storageEnumerationError: null, clearedMemoryCaches: 0, failedMemoryCaches: 0,
    removedBrowserCaches: [], preservedBrowserCaches: [], failedBrowserCaches: [],
    browserCacheEntries: [], browserCacheStatus: 'unavailable', browserCacheError: null,
    serviceWorkerUpdatedCount: 0, serviceWorkerError: null,
  };

  let targetStorage: SafeCacheStorageLike | null = null;
  if (options.storage !== undefined) {
    targetStorage = options.storage;
  } else if (typeof window !== 'undefined') {
    try { targetStorage = window.localStorage ?? null; }
    catch (err) { report.storageEnumerationError = toErrorText(err); report.partialFailure = true; }
  }

  // 1. LocalStorage: enumerate safely and remove ONLY explicitly allowlisted temporary cache keys.
  if (targetStorage) {
    const candidateTemporaryKeys = new Set<string>();
    try {
      const total = targetStorage.length;
      for (let i = 0; i < total; i++) {
        let key: string | null = null;
        try { key = targetStorage.key(i); }
        catch (err) { report.storageEnumerationError = toErrorText(err); report.partialFailure = true; continue; }
        if (!key) continue;
        if (classifyStorageKeyOwnership(key) === 'temporary_cache') candidateTemporaryKeys.add(key);
        else report.preservedLocalStorageKeys.push(key);
      }
    } catch (err) {
      report.storageEnumerationError = toErrorText(err);
      report.partialFailure = true;
      for (const knownTempKey of TEMPORARY_CACHE_STORAGE_KEYS) candidateTemporaryKeys.add(knownTempKey);
    }

    for (const key of candidateTemporaryKeys) {
      if (!isTemporaryCacheStorageKey(key)) continue;
      try { targetStorage.removeItem(key); report.removedLocalStorageKeys.push(key); }
      catch { report.failedLocalStorageKeys.push(key); report.partialFailure = true; }
    }
  }

  // 2. Synchronize in-memory caches independently of storage failures.
  for (const clearFn of options.clearMemoryCaches ?? []) {
    try { clearFn(); report.clearedMemoryCaches += 1; }
    catch { report.failedMemoryCaches += 1; report.partialFailure = true; }
  }

  // 3. Browser Cache Storage: Application-Owned Caches Only (RT-FE-BUGFIX-007).
  let targetCacheStorage: BrowserCacheStorageLike | null = null;
  let cacheAccessError: string | null = null;
  if (options.cacheStorage !== undefined) {
    targetCacheStorage = options.cacheStorage;
  } else if (typeof window !== 'undefined') {
    try { if ('caches' in window && window.caches) targetCacheStorage = window.caches; }
    catch (err) { cacheAccessError = toErrorText(err); }
  }

  if (cacheAccessError) {
    report.browserCacheStatus = 'unavailable';
    report.browserCacheError = cacheAccessError;
    report.partialFailure = true;
  } else {
    const cachePurge = await executeScopedCacheStoragePurge(
      targetCacheStorage, 'manual_full_cache_reset', { confirmedModuleCaches: options.confirmedModuleCaches },
    );
    report.browserCacheStatus = cachePurge.status;
    report.removedBrowserCaches = cachePurge.deleted;
    report.preservedBrowserCaches = cachePurge.preserved;
    report.failedBrowserCaches = cachePurge.failed;
    report.browserCacheEntries = cachePurge.entries;
    report.browserCacheError = cachePurge.error;
    if (!cachePurge.ok) report.partialFailure = true;
  }

  // 4. Service Worker registration refresh (isolated from LocalStorage & Cache Storage).
  let targetSw: ServiceWorkerContainerLike | null = null;
  if (options.serviceWorker !== undefined) {
    targetSw = options.serviceWorker;
  } else if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator && navigator.serviceWorker) {
    targetSw = navigator.serviceWorker;
  }

  if (targetSw) {
    try {
      const registrations = await targetSw.getRegistrations();
      const settled = await Promise.allSettled(registrations.map((reg) => reg.update()));
      for (const item of settled) {
        if (item.status === 'fulfilled') report.serviceWorkerUpdatedCount += 1;
        else { report.serviceWorkerError = toErrorText(item.reason); report.partialFailure = true; }
      }
    } catch (err) {
      report.serviceWorkerError = toErrorText(err);
      report.partialFailure = true;
    }
  }

  report.ok = !report.partialFailure;
  return report;
}
