/**
 * @file src/platform/storage/cacheStorageOwnership.ts
 * @description RT-FE-BUGFIX-007-ORIGIN-CACHE-STORAGE-ISOLATION:
 * Single source of truth for Tehran Radar Browser Cache Storage ownership,
 * explicit allowlist classification, 3 separate recovery policies, and per-cache failure reporting.
 */

export type RadarCacheCategory = 'app_shell' | 'ui_assets' | 'map_and_api_data';
export type CacheOwnershipClassification =
  | 'radar_app_shell' | 'radar_ui_assets' | 'radar_map_and_api_data'
  | 'confirmed_external_module' | 'unknown_preserved';
export type CachePurgePolicyId = 'hook_auto_recovery' | 'manual_full_cache_reset' | 'service_worker_activate';
export type CachePurgeStatus = 'success' | 'empty_noop' | 'partial_failure' | 'complete_failure' | 'unavailable';

export interface RadarCacheInventoryEntry {
  readonly cacheName: string;
  readonly category: RadarCacheCategory;
  readonly versionPattern: RegExp;
  readonly ownerModule: string;
  readonly purpose: string;
  readonly lifecycle: string;
  readonly rebuildable: boolean;
  readonly safeToDeleteInHookAutoRecovery: boolean;
  readonly safeToDeleteInManualReset: boolean;
  readonly safeToPruneOnSwActivate: boolean;
}

export const RADAR_SW_CACHE_VERSION = 'v4-2026-10';
export const RADAR_APP_SHELL_CACHE_NAME = `tehran-radar-shell-${RADAR_SW_CACHE_VERSION}`;
export const RADAR_UI_ASSETS_CACHE_NAME = `tehran-radar-assets-${RADAR_SW_CACHE_VERSION}`;
export const RADAR_MAP_AND_API_CACHE_NAME = `tehran-radar-data-${RADAR_SW_CACHE_VERSION}`;
export const ACTIVE_RADAR_CACHE_NAMES: readonly string[] = [
  RADAR_APP_SHELL_CACHE_NAME,
  RADAR_UI_ASSETS_CACHE_NAME,
  RADAR_MAP_AND_API_CACHE_NAME,
] as const;

const ACTIVE_RADAR_CACHE_SET = new Set<string>(ACTIVE_RADAR_CACHE_NAMES);

export const RADAR_CACHE_INVENTORY: readonly RadarCacheInventoryEntry[] = [
  {
    cacheName: RADAR_APP_SHELL_CACHE_NAME,
    category: 'app_shell',
    versionPattern: /^tehran-radar-shell-v[0-9a-z._-]+$/i,
    ownerModule: 'public/sw.js (APP_SHELL_CACHE)',
    purpose: 'Core HTML shell, index.html, manifest.json, and PWA icon assets',
    lifecycle: 'Pre-cached on SW install; refreshed via NetworkFirstShell; stale versions pruned on SW activate',
    rebuildable: true,
    safeToDeleteInHookAutoRecovery: true,
    safeToDeleteInManualReset: true,
    safeToPruneOnSwActivate: true,
  },
  {
    cacheName: RADAR_UI_ASSETS_CACHE_NAME,
    category: 'ui_assets',
    versionPattern: /^tehran-radar-assets-v[0-9a-z._-]+$/i,
    ownerModule: 'public/sw.js (UI_ASSETS_CACHE) & src/utils/pwaOfflineSupport.ts (WARM_ASSET_URLS)',
    purpose: 'Hashed Vite JS/CSS bundles, fonts, Leaflet CDN assets, and static UI media',
    lifecycle: 'Warmed on SW install / WARM_ASSET_URLS and runtime asset fetches; stale versions pruned on SW activate',
    rebuildable: true,
    safeToDeleteInHookAutoRecovery: true,
    safeToDeleteInManualReset: true,
    safeToPruneOnSwActivate: true,
  },
  {
    cacheName: RADAR_MAP_AND_API_CACHE_NAME,
    category: 'map_and_api_data',
    versionPattern: /^tehran-radar-data-v[0-9a-z._-]+$/i,
    ownerModule: 'public/sw.js (MAP_AND_API_CACHE)',
    purpose: 'Read-only /api/market-pulse, /api/air-quality snapshots and bounded offline OSM/CARTO map tiles',
    lifecycle: 'Populated on runtime fetches (FIFO trimmed to 160 tiles); clearable via CLEAR_USER_CACHES or manual reset',
    rebuildable: true,
    safeToDeleteInHookAutoRecovery: false,
    safeToDeleteInManualReset: true,
    safeToPruneOnSwActivate: true,
  },
] as const;

export interface CachePurgePolicyDefinition {
  readonly policyId: CachePurgePolicyId;
  readonly description: string;
  readonly allowedCategories: readonly RadarCacheCategory[];
  readonly preserveActiveVersions: boolean;
}

export const CACHE_PURGE_POLICIES: Readonly<Record<CachePurgePolicyId, CachePurgePolicyDefinition>> = {
  hook_auto_recovery: {
    policyId: 'hook_auto_recovery',
    description: 'Duplicate React hook auto-recovery: purges only Radar shell and UI asset caches.',
    allowedCategories: ['app_shell', 'ui_assets'],
    preserveActiveVersions: false,
  },
  manual_full_cache_reset: {
    policyId: 'manual_full_cache_reset',
    description: 'User-initiated full cache reset: purges all Radar-owned temporary caches while preserving non-Radar caches.',
    allowedCategories: ['app_shell', 'ui_assets', 'map_and_api_data'],
    preserveActiveVersions: false,
  },
  service_worker_activate: {
    policyId: 'service_worker_activate',
    description: 'Service Worker activation: prunes only obsolete Radar-owned cache versions outside ACTIVE_RADAR_CACHE_NAMES.',
    allowedCategories: ['app_shell', 'ui_assets', 'map_and_api_data'],
    preserveActiveVersions: true,
  },
};

export interface ScopedCacheStorageLike {
  keys(): Promise<string[]>;
  delete(cacheName: string): Promise<boolean>;
}

export interface CachePurgeEntryOutcome {
  name: string;
  ownership: CacheOwnershipClassification;
  action: 'deleted' | 'preserved' | 'failed';
  reason: string;
  error?: string;
}

export interface ScopedCachePurgeReport {
  policy: CachePurgePolicyId;
  cachesAvailable: boolean;
  status: CachePurgeStatus;
  ok: boolean;
  partialFailure: boolean;
  eligibleCount: number;
  deleted: string[];
  preserved: string[];
  failed: string[];
  entries: CachePurgeEntryOutcome[];
  error: string | null;
}

export interface ScopedCachePurgeOptions {
  confirmedModuleCaches?: readonly string[];
}

function formatCacheError(err: unknown): string {
  if (err instanceof Error) return err.message ? `${err.name}: ${err.message}` : err.name;
  return String(err || 'unknown_cache_error');
}

export function classifyCacheStorageOwnership(
  cacheName: string,
  confirmedModuleCaches?: readonly string[],
): { ownership: CacheOwnershipClassification; category: RadarCacheCategory | null } {
  const normalized = String(cacheName || '').trim();
  if (!normalized) return { ownership: 'unknown_preserved', category: null };
  for (const entry of RADAR_CACHE_INVENTORY) {
    if (entry.cacheName === normalized || entry.versionPattern.test(normalized)) {
      const ownership: CacheOwnershipClassification =
        entry.category === 'app_shell'
          ? 'radar_app_shell'
          : entry.category === 'ui_assets'
            ? 'radar_ui_assets'
            : 'radar_map_and_api_data';
      return { ownership, category: entry.category };
    }
  }
  if (confirmedModuleCaches && confirmedModuleCaches.includes(normalized)) {
    return { ownership: 'confirmed_external_module', category: null };
  }
  return { ownership: 'unknown_preserved', category: null };
}

export function isCacheEligibleForPurgePolicy(
  cacheName: string,
  policyId: CachePurgePolicyId,
  options: ScopedCachePurgeOptions = {},
): { eligible: boolean; ownership: CacheOwnershipClassification; reason: string } {
  const policy = CACHE_PURGE_POLICIES[policyId];
  const { ownership, category } = classifyCacheStorageOwnership(cacheName, options.confirmedModuleCaches);

  if (ownership === 'unknown_preserved') {
    return { eligible: false, ownership, reason: 'Preserved: cache is not owned by Tehran Radar allowlist' };
  }
  if (ownership === 'confirmed_external_module') {
    return policyId === 'manual_full_cache_reset'
      ? { eligible: true, ownership, reason: 'Eligible: explicitly confirmed module cache for manual reset' }
      : { eligible: false, ownership, reason: `Preserved: confirmed external module cache excluded from ${policyId}` };
  }
  if (!category || !policy.allowedCategories.includes(category)) {
    return { eligible: false, ownership, reason: `Preserved: category "${category}" excluded by policy "${policyId}"` };
  }
  if (policy.preserveActiveVersions && ACTIVE_RADAR_CACHE_SET.has(cacheName)) {
    return { eligible: false, ownership, reason: 'Preserved: active Radar cache version retained during SW activation' };
  }
  return { eligible: true, ownership, reason: `Eligible: Radar-owned "${category}" cache authorized by policy "${policyId}"` };
}

export async function executeScopedCacheStoragePurge(
  cacheStorage: ScopedCacheStorageLike | null | undefined,
  policyId: CachePurgePolicyId,
  options: ScopedCachePurgeOptions = {},
): Promise<ScopedCachePurgeReport> {
  if (!cacheStorage || typeof cacheStorage.keys !== 'function' || typeof cacheStorage.delete !== 'function') {
    return {
      policy: policyId, cachesAvailable: false, status: 'unavailable', ok: false, partialFailure: true,
      eligibleCount: 0, deleted: [], preserved: [], failed: [], entries: [], error: 'CacheStorage API unavailable',
    };
  }

  let cacheNames: string[];
  try {
    const rawKeys = await cacheStorage.keys();
    cacheNames = Array.isArray(rawKeys) ? rawKeys : [];
  } catch (err) {
    return {
      policy: policyId, cachesAvailable: true, status: 'unavailable', ok: false, partialFailure: true,
      eligibleCount: 0, deleted: [], preserved: [], failed: [], entries: [], error: formatCacheError(err),
    };
  }

  if (cacheNames.length === 0) {
    return {
      policy: policyId, cachesAvailable: true, status: 'empty_noop', ok: true, partialFailure: false,
      eligibleCount: 0, deleted: [], preserved: [], failed: [], entries: [], error: null,
    };
  }

  const deleted: string[] = [];
  const preserved: string[] = [];
  const failed: string[] = [];
  const entries: CachePurgeEntryOutcome[] = [];
  let firstError: string | null = null;
  const eligibleTasks: Array<{ name: string; ownership: CacheOwnershipClassification; reason: string }> = [];

  for (const name of cacheNames) {
    const decision = isCacheEligibleForPurgePolicy(name, policyId, options);
    if (!decision.eligible) {
      preserved.push(name);
      entries.push({ name, ownership: decision.ownership, action: 'preserved', reason: decision.reason });
    } else {
      eligibleTasks.push({ name, ownership: decision.ownership, reason: decision.reason });
    }
  }

  const settled = await Promise.allSettled(
    eligibleTasks.map(async (task) => ({ task, removed: await cacheStorage.delete(task.name) })),
  );

  settled.forEach((result, idx) => {
    const task = eligibleTasks[idx];
    if (result.status === 'fulfilled' && result.value.removed) {
      deleted.push(task.name);
      entries.push({ name: task.name, ownership: task.ownership, action: 'deleted', reason: task.reason });
    } else {
      const errMsg = result.status === 'rejected'
        ? formatCacheError(result.reason)
        : `Cache delete returned false for "${task.name}"`;
      firstError = firstError ?? errMsg;
      failed.push(task.name);
      entries.push({
        name: task.name,
        ownership: task.ownership,
        action: 'failed',
        reason: result.status === 'rejected' ? 'CacheStorage.delete threw an exception' : 'CacheStorage.delete returned false',
        error: errMsg,
      });
    }
  });

  const eligibleCount = eligibleTasks.length;
  const status: CachePurgeStatus =
    failed.length > 0 && deleted.length === 0 && eligibleCount > 0
      ? 'complete_failure'
      : failed.length > 0
        ? 'partial_failure'
        : 'success';
  const ok = failed.length === 0;
  return {
    policy: policyId, cachesAvailable: true, status, ok, partialFailure: !ok,
    eligibleCount, deleted, preserved, failed, entries, error: firstError,
  };
}
