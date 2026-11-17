/** @file src/features/account/services/accountStorageScope.ts — UID-Scoped Storage, Safe Legacy Migration & Allowlisted Account Cleanup */

export const DEFAULT_GUEST_UID = 'local-user';
export const ACCOUNT_WORKSPACE_UPDATED_EVENT = 'radar:account-workspace-updated';

export type StorageKeyOwnershipKind = 'account_private' | 'device_public';

export interface StorageKeyPolicyEntry {
  baseKey: string;
  ownership: StorageKeyOwnershipKind;
  uidScoped: boolean;
  clearOnAccountDelete: boolean;
  description: string;
}

export const ACCOUNT_SCOPED_BASE_KEYS = [
  'radar_account_profile_v1',
  'radar_account_privacy_v1',
  'radar_account_saved_searches_v1',
  'radar_account_notif_channels_v1',
  'radar_account_sessions_v1',
  'radar_account_data_requests_v1',
  'radar_account_read_notifications_v1',
  'radar_saved_properties_v1',
  'radar_my_listings_v1',
  'radar_listing_submission_draft_v1',
  'radar_listing_history_v1',
  'radar_listing_reports_v1',
  'radar_valuation_reports_v1',
  'tehran_radar_saved_market_analyses_v1',
  'tehran_radar_saved_map_views_v1',
] as const;

export const LEGACY_SHARED_PERSONAL_KEYS = [
  'tehran_radar_visited_homes_v1',
  'tehran_radar_favorite_hoods_v1',
  'tehran_radar_recent_searches_v1',
] as const;

export const DEVICE_PUBLIC_PRESERVED_KEYS = new Set<string>([
  'tehran_radar_area_unit_v1',
  'radar_area_unit_v1',
  'tehran_radar_intl_currency_v1',
  'radar_intl_currency_v1',
  'radar_locale_v1',
  'radar_experience_mode_v1',
  'tehran_radar_theme_v1',
  'tehran_housing_radar_v35_neighborhoods',
  'tehran_radar_feature_flags_v35',
]);

export const CLIENT_ACCOUNT_CLEANUP_ALLOWLIST = new Set<string>([
  ...ACCOUNT_SCOPED_BASE_KEYS,
  ...LEGACY_SHARED_PERSONAL_KEYS,
]);

let activeScopeUid = DEFAULT_GUEST_UID;

export function normalizeAccountScopeUid(uid?: string | null): string {
  if (typeof uid !== 'string') return DEFAULT_GUEST_UID;
  const trimmed = uid.trim();
  if (!trimmed || trimmed === DEFAULT_GUEST_UID) return DEFAULT_GUEST_UID;
  const cleaned = trimmed.replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 128);
  return cleaned || DEFAULT_GUEST_UID;
}

export function isGuestScopeUid(uid?: string | null): boolean {
  return normalizeAccountScopeUid(uid) === DEFAULT_GUEST_UID;
}

export function setActiveAccountScopeUid(uid?: string | null): string {
  activeScopeUid = normalizeAccountScopeUid(uid);
  return activeScopeUid;
}

export function getActiveAccountScopeUid(): string {
  return activeScopeUid;
}

export function resolveEffectiveUid(explicitUid?: string | null): string {
  return explicitUid !== undefined ? normalizeAccountScopeUid(explicitUid) : activeScopeUid;
}

export function resolveScopedStorageKey(baseKey: string, explicitUid?: string | null): string {
  return `${baseKey}::${resolveEffectiveUid(explicitUid)}`;
}

export function emitAccountWorkspaceUpdated(uid?: string | null, changedKey?: string): void {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
  try {
    if (typeof CustomEvent === 'function') {
      window.dispatchEvent(
        new CustomEvent(ACCOUNT_WORKSPACE_UPDATED_EVENT, {
          detail: { uid: resolveEffectiveUid(uid), changedKey: changedKey || null, atIso: new Date().toISOString() },
        }),
      );
    }
  } catch { /* non-blocking */ }
}

export function isStorageKeyForUid(storageKey: string, uid?: string | null): boolean {
  const scope = resolveEffectiveUid(uid);
  if (storageKey.endsWith(`::${scope}`)) return true;
  return ACCOUNT_SCOPED_BASE_KEYS.includes(storageKey as (typeof ACCOUNT_SCOPED_BASE_KEYS)[number]) && scope === DEFAULT_GUEST_UID;
}

export function readScopedStorageJson<T>(
  baseKey: string,
  fallback: T,
  explicitUid?: string | null,
  legacyOwnerResolver?: (legacyParsed: unknown, scopeUid: string) => T | null,
): T {
  if (typeof window === 'undefined' || !window.localStorage) return fallback;
  const scopeUid = resolveEffectiveUid(explicitUid);
  const scopedKey = `${baseKey}::${scopeUid}`;
  try {
    const scopedRaw = window.localStorage.getItem(scopedKey);
    if (scopedRaw !== null) return JSON.parse(scopedRaw) as T;

    const legacyRaw = window.localStorage.getItem(baseKey);
    if (legacyRaw === null) return fallback;
    const legacyParsed = JSON.parse(legacyRaw) as unknown;

    if (scopeUid === DEFAULT_GUEST_UID) {
      window.localStorage.setItem(scopedKey, JSON.stringify(legacyParsed));
      return legacyParsed as T;
    }

    if (legacyOwnerResolver) {
      const owned = legacyOwnerResolver(legacyParsed, scopeUid);
      if (owned !== null) {
        window.localStorage.setItem(scopedKey, JSON.stringify(owned));
        return owned;
      }
    }
    return fallback;
  } catch {
    return fallback;
  }
}

export function writeScopedStorageJson<T>(baseKey: string, val: T, explicitUid?: string | null): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  const scopedKey = resolveScopedStorageKey(baseKey, explicitUid);
  try {
    window.localStorage.setItem(scopedKey, JSON.stringify(val));
    emitAccountWorkspaceUpdated(explicitUid, scopedKey);
  } catch { /* ignore quota failures */ }
}

export function removeScopedStorageKey(baseKey: string, explicitUid?: string | null): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.removeItem(resolveScopedStorageKey(baseKey, explicitUid));
    emitAccountWorkspaceUpdated(explicitUid, baseKey);
  } catch { /* ignore */ }
}

export function listStorageKeyPolicies(): StorageKeyPolicyEntry[] {
  return [
    ...ACCOUNT_SCOPED_BASE_KEYS.map((baseKey) => ({
      baseKey,
      ownership: 'account_private' as const,
      uidScoped: true,
      clearOnAccountDelete: true,
      description: 'داده خصوصی فضای کاری کاربر با جداسازی UID',
    })),
    ...LEGACY_SHARED_PERSONAL_KEYS.map((baseKey) => ({
      baseKey,
      ownership: 'account_private' as const,
      uidScoped: false,
      clearOnAccountDelete: true,
      description: 'داده فعالیت شخصی کاربر در مرورگر (بازدید/علاقه‌مندی/جست‌وجو)',
    })),
    ...Array.from(DEVICE_PUBLIC_PRESERVED_KEYS).map((baseKey) => ({
      baseKey,
      ownership: 'device_public' as const,
      uidScoped: false,
      clearOnAccountDelete: false,
      description: 'تنظیمات عمومی دستگاه (زبان، واحد سطح، ارز، پوسته) — هنگام حذف حساب حفظ می‌شود',
    })),
  ];
}

function pruneUidOwnedServiceArrays(targetUid: string): number {
  if (typeof window === 'undefined' || !window.localStorage) return 0;
  let mutatedCount = 0;
  try {
    const reqRaw = window.localStorage.getItem('radar_service_requests_v1');
    const deletedReqIds = new Set<string>();
    if (reqRaw) {
      const reqs = JSON.parse(reqRaw);
      if (Array.isArray(reqs)) {
        const kept = reqs.filter((r) => {
          const isOwned = r && typeof r === 'object' && (r as { ownerUserId?: string }).ownerUserId === targetUid;
          if (isOwned && typeof (r as { id?: string }).id === 'string') deletedReqIds.add((r as { id: string }).id);
          return !isOwned;
        });
        if (kept.length !== reqs.length) {
          window.localStorage.setItem('radar_service_requests_v1', JSON.stringify(kept));
          mutatedCount += 1;
        }
      }
    }
    if (deletedReqIds.size > 0) {
      const propRaw = window.localStorage.getItem('radar_service_proposals_v1');
      if (propRaw) {
        const props = JSON.parse(propRaw);
        if (Array.isArray(props)) {
          const keptProps = props.filter((p) => !(p && typeof p === 'object' && deletedReqIds.has(String((p as { requestId?: string }).requestId))));
          if (keptProps.length !== props.length) {
            window.localStorage.setItem('radar_service_proposals_v1', JSON.stringify(keptProps));
            mutatedCount += 1;
          }
        }
      }
    }
  } catch { /* ignore */ }
  return mutatedCount;
}

export function cleanupAccountLocalStorageForUid(
  targetUid: string,
  serverSuggestedKeys: readonly string[] = [],
): { removedKeys: string[]; rejectedKeys: string[]; preservedPublicKeys: string[] } {
  const normalizedTarget = normalizeAccountScopeUid(targetUid);
  const removedKeys: string[] = [];
  const rejectedKeys: string[] = [];
  const preservedPublicKeys: string[] = [];
  if (typeof window === 'undefined' || !window.localStorage) {
    return { removedKeys, rejectedKeys, preservedPublicKeys };
  }

  const candidateBaseKeys = new Set<string>(ACCOUNT_SCOPED_BASE_KEYS);
  for (const rawKey of serverSuggestedKeys) {
    const key = String(rawKey || '').trim();
    if (!key) continue;
    if (DEVICE_PUBLIC_PRESERVED_KEYS.has(key)) {
      preservedPublicKeys.push(key);
    } else if (CLIENT_ACCOUNT_CLEANUP_ALLOWLIST.has(key)) {
      candidateBaseKeys.add(key);
    } else {
      rejectedKeys.push(key);
    }
  }

  for (const baseKey of candidateBaseKeys) {
    if (ACCOUNT_SCOPED_BASE_KEYS.includes(baseKey as (typeof ACCOUNT_SCOPED_BASE_KEYS)[number])) {
      const scopedKey = `${baseKey}::${normalizedTarget}`;
      try {
        if (window.localStorage.getItem(scopedKey) !== null) {
          window.localStorage.removeItem(scopedKey);
          removedKeys.push(scopedKey);
        }
        if (normalizedTarget === DEFAULT_GUEST_UID && window.localStorage.getItem(baseKey) !== null) {
          window.localStorage.removeItem(baseKey);
          removedKeys.push(baseKey);
        }
      } catch { /* ignore */ }
    } else if (LEGACY_SHARED_PERSONAL_KEYS.includes(baseKey as (typeof LEGACY_SHARED_PERSONAL_KEYS)[number])) {
      const scopedKey = `${baseKey}::${normalizedTarget}`;
      try {
        if (window.localStorage.getItem(scopedKey) !== null) {
          window.localStorage.removeItem(scopedKey);
          removedKeys.push(scopedKey);
        }
        if (window.localStorage.getItem(baseKey) !== null) {
          window.localStorage.removeItem(baseKey);
          removedKeys.push(baseKey);
        }
      } catch { /* ignore */ }
    }
  }

  const prunedArrays = pruneUidOwnedServiceArrays(normalizedTarget);
  if (prunedArrays > 0) removedKeys.push('radar_service_requests_v1(uid_filtered)');
  emitAccountWorkspaceUpdated(normalizedTarget, 'account_cleanup');
  return { removedKeys, rejectedKeys, preservedPublicKeys };
}
