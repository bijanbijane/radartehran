/** @file src/features/account/services/accountSettingsStorageService.ts — Profile, Privacy, Notification Channels, Sessions & Data Retention Storage */
import { sanitizeInput } from '../../../utils/security';
import type {
  AccountPrivacyPreferences,
  AccountProfileSettings,
  DataRequestRecord,
  NotificationChannelPreferences,
  SavedSearchWatchlistItem,
  UserSessionDevice,
} from '../types/account.types';

const ACCOUNT_PROFILE_KEY = 'radar_account_profile_v1';
const ACCOUNT_PRIVACY_KEY = 'radar_account_privacy_v1';
const ACCOUNT_SEARCHES_KEY = 'radar_account_saved_searches_v1';
const ACCOUNT_NOTIF_CHANNELS_KEY = 'radar_account_notif_channels_v1';
const ACCOUNT_SESSIONS_KEY = 'radar_account_sessions_v1';
const ACCOUNT_DATA_REQUESTS_KEY = 'radar_account_data_requests_v1';

export function readAccountJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeAccountJson<T>(key: string, val: T): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(val));
  } catch { /* ignore quota failures */ }
}

const PII_KEYS = new Set(['phone', 'email', 'name', 'token', 'requesterPhone', 'requesterName']);

export function trackAccountEvent(eventName: string, meta: Record<string, string | number | boolean> = {}): void {
  if (typeof window === 'undefined') return;
  const safeMeta: Record<string, string | number | boolean> = {};
  Object.entries(meta).forEach(([k, v]) => {
    if (!PII_KEYS.has(k)) safeMeta[k] = v;
  });
  try {
    window.dispatchEvent(new CustomEvent('radar:account-analytics', { detail: { eventName, timestampIso: new Date().toISOString(), ...safeMeta } }));
  } catch { /* non-blocking */ }
}

export function loadAccountProfile(callerUid = 'local-user', fallbackName = 'کاربر رادار تهران'): AccountProfileSettings {
  const existing = readAccountJson<AccountProfileSettings | null>(ACCOUNT_PROFILE_KEY, null);
  if (existing) return { ...existing, activeWorkspaceMode: existing.activeWorkspaceMode || 'personal' };
  return {
    ownerUserId: callerUid,
    displayName: fallbackName,
    phoneMasked: 'ثبت‌نشده',
    preferredCityId: 'tehran',
    preferredPurpose: 'buy',
    activeRoles: ['seeker'],
    activeWorkspaceMode: 'personal',
    subscriptionTier: 'free_explorer',
    updatedAtIso: new Date().toISOString(),
  };
}

export function saveAccountProfile(patch: Partial<AccountProfileSettings>, callerUid = 'local-user'): AccountProfileSettings {
  const curr = loadAccountProfile(callerUid);
  const next: AccountProfileSettings = {
    ...curr,
    ...patch,
    ownerUserId: callerUid,
    displayName: sanitizeInput(patch.displayName ?? curr.displayName, 60) || 'کاربر رادار تهران',
    phoneMasked: sanitizeInput(patch.phoneMasked ?? curr.phoneMasked, 24),
    activeWorkspaceMode: patch.activeWorkspaceMode ?? curr.activeWorkspaceMode ?? 'personal',
    updatedAtIso: new Date().toISOString(),
  };
  writeAccountJson(ACCOUNT_PROFILE_KEY, next);
  trackAccountEvent('account_profile_updated', { purpose: next.preferredPurpose, workspaceMode: next.activeWorkspaceMode });
  return next;
}

export function loadNotificationChannels(): NotificationChannelPreferences {
  return readAccountJson<NotificationChannelPreferences>(ACCOUNT_NOTIF_CHANNELS_KEY, {
    inApp: true, email: false, sms: false, browserPush: false, marketingOptIn: false,
    securityAlertsMandatory: true, updatedAtIso: new Date().toISOString(),
  });
}

export function updateNotificationChannels(
  patch: Partial<Omit<NotificationChannelPreferences, 'securityAlertsMandatory' | 'updatedAtIso'>>,
): NotificationChannelPreferences {
  const next: NotificationChannelPreferences = {
    ...loadNotificationChannels(), ...patch, securityAlertsMandatory: true, updatedAtIso: new Date().toISOString(),
  };
  writeAccountJson(ACCOUNT_NOTIF_CHANNELS_KEY, next);
  trackAccountEvent('account_notif_channels_updated', { inApp: next.inApp, email: next.email, sms: next.sms, marketingOptIn: next.marketingOptIn });
  return next;
}

export function loadPrivacyPreferences(): AccountPrivacyPreferences {
  return readAccountJson<AccountPrivacyPreferences>(ACCOUNT_PRIVACY_KEY, {
    profileVisibility: 'masked_for_requests', sharePhoneOnlyAfterConsent: true, receiveMarketingUpdates: false,
    storeSearchHistoryLocally: true, privacySafeTelemetryEnabled: true, updatedAtIso: new Date().toISOString(),
  });
}

export function updatePrivacyPreferences(patch: Partial<AccountPrivacyPreferences>): AccountPrivacyPreferences {
  const next: AccountPrivacyPreferences = { ...loadPrivacyPreferences(), ...patch, updatedAtIso: new Date().toISOString() };
  writeAccountJson(ACCOUNT_PRIVACY_KEY, next);
  trackAccountEvent('account_privacy_updated', { sharePhoneOnlyAfterConsent: next.sharePhoneOnlyAfterConsent, visibility: next.profileVisibility });
  return next;
}

export function loadSavedSearchWatchlists(): SavedSearchWatchlistItem[] {
  return readAccountJson<SavedSearchWatchlistItem[]>(ACCOUNT_SEARCHES_KEY, []);
}

export function createSavedSearchWatchlist(input: Omit<SavedSearchWatchlistItem, 'id' | 'createdAtIso'>): SavedSearchWatchlistItem[] {
  const item: SavedSearchWatchlistItem = {
    ...input,
    title: sanitizeInput(input.title, 80),
    querySummaryFa: sanitizeInput(input.querySummaryFa, 160),
    id: `srch-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
    createdAtIso: new Date().toISOString(),
  };
  const next = [item, ...loadSavedSearchWatchlists()].slice(0, 25);
  writeAccountJson(ACCOUNT_SEARCHES_KEY, next);
  return next;
}

export function toggleSavedSearchAlertCadence(id: string, cadence: SavedSearchWatchlistItem['alertCadence']): SavedSearchWatchlistItem[] {
  const next = loadSavedSearchWatchlists().map((s) => (s.id === id ? { ...s, alertCadence: cadence } : s));
  writeAccountJson(ACCOUNT_SEARCHES_KEY, next);
  return next;
}

export function deleteSavedSearchWatchlist(id: string): SavedSearchWatchlistItem[] {
  const next = loadSavedSearchWatchlists().filter((s) => s.id !== id);
  writeAccountJson(ACCOUNT_SEARCHES_KEY, next);
  return next;
}

export function loadAuthorizedSessions(): UserSessionDevice[] {
  const saved = readAccountJson<UserSessionDevice[] | null>(ACCOUNT_SESSIONS_KEY, null);
  if (saved && saved.length > 0) return saved;
  return [{
    sessionId: 'sess-current-browser', deviceLabelFa: 'مرورگر وب فعلی',
    browserSummaryFa: 'نشست فعال فعلی (ذخیره‌سازی محلی امن)', lastActiveLabelFa: 'هم‌اکنون', isCurrent: true, trusted: true,
  }];
}

export function revokeAuthorizedSession(sessionId: string): UserSessionDevice[] {
  const next = loadAuthorizedSessions().filter((s) => s.isCurrent || s.sessionId !== sessionId);
  writeAccountJson(ACCOUNT_SESSIONS_KEY, next);
  return next;
}

export function loadDataRequests(): DataRequestRecord[] {
  return readAccountJson<DataRequestRecord[]>(ACCOUNT_DATA_REQUESTS_KEY, []);
}

export function recordDataRequest(kind: 'export' | 'delete', status: DataRequestRecord['status'] = 'ready'): DataRequestRecord[] {
  const entry: DataRequestRecord = {
    id: `dreq-${Date.now()}`, kind, status,
    retentionNotesFa: kind === 'delete'
      ? 'داده‌های شخصی و منتخب‌ها حذف می‌شوند؛ سوابق درخواست‌های خدمت باز، پرونده‌های اختلاف و لاگ‌های ممیزی امنیتی مطابق تعهدات قانونی نگهداری می‌شوند.'
      : 'خروجی JSON شامل داده‌های شخصی و سوابق فضای کاری بدون کلیدهای امنیتی تهیه شد.',
    createdAtIso: new Date().toISOString(),
  };
  const next = [entry, ...loadDataRequests()].slice(0, 10);
  writeAccountJson(ACCOUNT_DATA_REQUESTS_KEY, next);
  return next;
}
