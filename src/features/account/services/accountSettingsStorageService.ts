/** @file src/features/account/services/accountSettingsStorageService.ts — UID-Scoped Profile, Privacy, Notification Channels, Sessions & Data Request Storage */
import { sanitizeInput } from '../../../utils/security';
import {
  DEFAULT_GUEST_UID,
  readScopedStorageJson,
  resolveEffectiveUid,
  writeScopedStorageJson,
} from './accountStorageScope';
import type {
  AccountExportScope,
  AccountPrivacyPreferences,
  AccountProfileSettings,
  DataRequestRecord,
  DataRequestStatus,
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

let requestSeqCounter = 0;

export function generateStableAccountId(prefix: string): string {
  requestSeqCounter += 1;
  const gCrypto = typeof globalThis !== 'undefined' ? (globalThis as { crypto?: { randomUUID?: () => string } }).crypto : undefined;
  if (gCrypto && typeof gCrypto.randomUUID === 'function') {
    return `${prefix}-${gCrypto.randomUUID().slice(0, 12)}-${requestSeqCounter.toString(36)}`;
  }
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now().toString(36)}-${requestSeqCounter.toString(36)}-${rand}`;
}

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

export function loadAccountProfile(callerUid?: string | null, fallbackName = 'کاربر رادار تهران'): AccountProfileSettings {
  const scopeUid = resolveEffectiveUid(callerUid);
  const existing = readScopedStorageJson<AccountProfileSettings | null>(
    ACCOUNT_PROFILE_KEY,
    null,
    scopeUid,
    (legacyParsed, uid) => {
      if (!legacyParsed || typeof legacyParsed !== 'object') return null;
      const rec = legacyParsed as Partial<AccountProfileSettings>;
      return rec.ownerUserId === uid ? (rec as AccountProfileSettings) : null;
    },
  );
  if (existing && existing.ownerUserId === scopeUid) {
    return {
      ...existing,
      displayName: existing.displayName || fallbackName,
      activeWorkspaceMode: existing.activeWorkspaceMode || 'personal',
    };
  }
  if (existing && scopeUid === DEFAULT_GUEST_UID) {
    return {
      ...existing,
      ownerUserId: DEFAULT_GUEST_UID,
      displayName: existing.displayName || fallbackName,
      activeWorkspaceMode: existing.activeWorkspaceMode || 'personal',
    };
  }
  return {
    ownerUserId: scopeUid,
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

export function saveAccountProfile(patch: Partial<AccountProfileSettings>, callerUid?: string | null): AccountProfileSettings {
  const scopeUid = resolveEffectiveUid(callerUid);
  const curr = loadAccountProfile(scopeUid);
  const next: AccountProfileSettings = {
    ...curr,
    ...patch,
    ownerUserId: scopeUid,
    displayName: sanitizeInput(patch.displayName ?? curr.displayName, 60) || 'کاربر رادار تهران',
    phoneMasked: sanitizeInput(patch.phoneMasked ?? curr.phoneMasked, 24),
    activeWorkspaceMode: patch.activeWorkspaceMode ?? curr.activeWorkspaceMode ?? 'personal',
    updatedAtIso: new Date().toISOString(),
  };
  writeScopedStorageJson(ACCOUNT_PROFILE_KEY, next, scopeUid);
  trackAccountEvent('account_profile_updated', { purpose: next.preferredPurpose, workspaceMode: next.activeWorkspaceMode });
  return next;
}

export function loadNotificationChannels(callerUid?: string | null): NotificationChannelPreferences {
  return readScopedStorageJson<NotificationChannelPreferences>(
    ACCOUNT_NOTIF_CHANNELS_KEY,
    {
      inApp: true, email: false, sms: false, browserPush: false, marketingOptIn: false,
      securityAlertsMandatory: true, updatedAtIso: new Date().toISOString(),
    },
    callerUid,
  );
}

export function updateNotificationChannels(
  patch: Partial<Omit<NotificationChannelPreferences, 'securityAlertsMandatory' | 'updatedAtIso'>>,
  callerUid?: string | null,
): NotificationChannelPreferences {
  const scopeUid = resolveEffectiveUid(callerUid);
  const next: NotificationChannelPreferences = {
    ...loadNotificationChannels(scopeUid), ...patch, securityAlertsMandatory: true, updatedAtIso: new Date().toISOString(),
  };
  writeScopedStorageJson(ACCOUNT_NOTIF_CHANNELS_KEY, next, scopeUid);
  trackAccountEvent('account_notif_channels_updated', { inApp: next.inApp, email: next.email, sms: next.sms, marketingOptIn: next.marketingOptIn });
  return next;
}

export function loadPrivacyPreferences(callerUid?: string | null): AccountPrivacyPreferences {
  return readScopedStorageJson<AccountPrivacyPreferences>(
    ACCOUNT_PRIVACY_KEY,
    {
      profileVisibility: 'masked_for_requests', sharePhoneOnlyAfterConsent: true, receiveMarketingUpdates: false,
      storeSearchHistoryLocally: true, privacySafeTelemetryEnabled: true, updatedAtIso: new Date().toISOString(),
    },
    callerUid,
  );
}

export function updatePrivacyPreferences(patch: Partial<AccountPrivacyPreferences>, callerUid?: string | null): AccountPrivacyPreferences {
  const scopeUid = resolveEffectiveUid(callerUid);
  const next: AccountPrivacyPreferences = { ...loadPrivacyPreferences(scopeUid), ...patch, updatedAtIso: new Date().toISOString() };
  writeScopedStorageJson(ACCOUNT_PRIVACY_KEY, next, scopeUid);
  trackAccountEvent('account_privacy_updated', { sharePhoneOnlyAfterConsent: next.sharePhoneOnlyAfterConsent, visibility: next.profileVisibility });
  return next;
}

export function loadSavedSearchWatchlists(callerUid?: string | null): SavedSearchWatchlistItem[] {
  return readScopedStorageJson<SavedSearchWatchlistItem[]>(ACCOUNT_SEARCHES_KEY, [], callerUid);
}

export function createSavedSearchWatchlist(
  input: Omit<SavedSearchWatchlistItem, 'id' | 'createdAtIso'>,
  callerUid?: string | null,
): SavedSearchWatchlistItem[] {
  const scopeUid = resolveEffectiveUid(callerUid);
  const item: SavedSearchWatchlistItem = {
    ...input,
    title: sanitizeInput(input.title, 80),
    querySummaryFa: sanitizeInput(input.querySummaryFa, 160),
    id: generateStableAccountId('srch'),
    createdAtIso: new Date().toISOString(),
  };
  const next = [item, ...loadSavedSearchWatchlists(scopeUid)].slice(0, 25);
  writeScopedStorageJson(ACCOUNT_SEARCHES_KEY, next, scopeUid);
  return next;
}

export function toggleSavedSearchAlertCadence(
  id: string,
  cadence: SavedSearchWatchlistItem['alertCadence'],
  callerUid?: string | null,
): SavedSearchWatchlistItem[] {
  const scopeUid = resolveEffectiveUid(callerUid);
  const next = loadSavedSearchWatchlists(scopeUid).map((s) => (s.id === id ? { ...s, alertCadence: cadence } : s));
  writeScopedStorageJson(ACCOUNT_SEARCHES_KEY, next, scopeUid);
  return next;
}

export function deleteSavedSearchWatchlist(id: string, callerUid?: string | null): SavedSearchWatchlistItem[] {
  const scopeUid = resolveEffectiveUid(callerUid);
  const next = loadSavedSearchWatchlists(scopeUid).filter((s) => s.id !== id);
  writeScopedStorageJson(ACCOUNT_SEARCHES_KEY, next, scopeUid);
  return next;
}

export function loadAuthorizedSessions(callerUid?: string | null): UserSessionDevice[] {
  const saved = readScopedStorageJson<UserSessionDevice[] | null>(ACCOUNT_SESSIONS_KEY, null, callerUid);
  if (saved && saved.length > 0) return saved;
  return [{
    sessionId: 'sess-current-browser', deviceLabelFa: 'مرورگر وب فعلی',
    browserSummaryFa: 'نشست فعال فعلی (ذخیره‌سازی محلی امن)', lastActiveLabelFa: 'هم‌اکنون', isCurrent: true, trusted: true,
  }];
}

export function revokeAuthorizedSession(sessionId: string, callerUid?: string | null): UserSessionDevice[] {
  const scopeUid = resolveEffectiveUid(callerUid);
  const next = loadAuthorizedSessions(scopeUid).filter((s) => s.isCurrent || s.sessionId !== sessionId);
  writeScopedStorageJson(ACCOUNT_SESSIONS_KEY, next, scopeUid);
  return next;
}

export function loadDataRequests(callerUid?: string | null): DataRequestRecord[] {
  const scopeUid = resolveEffectiveUid(callerUid);
  return readScopedStorageJson<DataRequestRecord[]>(
    ACCOUNT_DATA_REQUESTS_KEY,
    [],
    scopeUid,
    (legacyParsed, uid) => (Array.isArray(legacyParsed) ? legacyParsed.filter((r) => r && (r as DataRequestRecord).ownerUserId === uid) as DataRequestRecord[] : null),
  );
}

function defaultRetentionNoteFa(kind: 'export' | 'delete', status: DataRequestStatus, scope?: AccountExportScope): string {
  if (kind === 'delete') {
    if (status === 'failed') return 'عملیات حذف حساب انجام نشد؛ هیچ تغییری روی وضعیت نهایی تکمیل ثبت نشده است.';
    if (status === 'pending_verification') return 'پاکسازی سرور و داده محلی انجام شد، اما حذف کامل حساب احراز هویت نیازمند ورود مجدد است (نگهداری لاگ‌های قانونی طبق مقررات).';
    return 'داده‌های شخصی، آگهی‌ها، منتخب‌ها و سوابق حساب پاکسازی شدند (لاگ‌های ممیزی قانونی مطابق مقررات ناشناس/نگهداری می‌شوند).';
  }
  if (status === 'failed') return 'تهیه یا دانلود خروجی اطلاعات به نتیجه نرسید.';
  if (scope === 'local_workspace') return 'فایل JSON فضای کاری محلی همین مرورگر (محدوده محلی بدون داده‌های ابری سرور) آماده شد.';
  if (scope === 'combined_account_and_workspace') return 'خروجی ترکیبی با تفکیک منشأ سرور و فضای کاری محلی و بدون کلیدهای امنیتی تهیه شد.';
  return 'خروجی JSON داده‌های ثبت‌شده حساب در سرور (بدون کلیدهای امنیتی) دریافت و آماده دانلود شد.';
}

export interface RecordDataRequestOptions {
  uid?: string | null;
  requestId?: string;
  scope?: AccountExportScope;
  errorCode?: string;
  retentionNotesFa?: string;
}

export function recordDataRequest(
  kind: 'export' | 'delete',
  status: DataRequestStatus = 'ready',
  options: RecordDataRequestOptions = {},
): DataRequestRecord[] {
  const scopeUid = resolveEffectiveUid(options.uid);
  const existing = loadDataRequests(scopeUid);
  const nowIso = new Date().toISOString();
  const safeErrorCode = options.errorCode ? sanitizeInput(options.errorCode, 48).replace(/[^A-Z0-9_-]/gi, '') : undefined;
  const note = options.retentionNotesFa
    ? sanitizeInput(options.retentionNotesFa, 240)
    : defaultRetentionNoteFa(kind, status, options.scope);

  if (options.requestId) {
    const idx = existing.findIndex((r) => r.id === options.requestId);
    if (idx >= 0) {
      const updated: DataRequestRecord = {
        ...existing[idx],
        status,
        scope: options.scope ?? existing[idx].scope,
        errorCode: safeErrorCode ?? (status === 'failed' ? existing[idx].errorCode : undefined),
        retentionNotesFa: note,
        updatedAtIso: nowIso,
      };
      const next = existing.map((item, i) => (i === idx ? updated : item));
      writeScopedStorageJson(ACCOUNT_DATA_REQUESTS_KEY, next, scopeUid);
      return next;
    }
  }

  const entry: DataRequestRecord = {
    id: options.requestId || generateStableAccountId('dreq'),
    ownerUserId: scopeUid,
    kind,
    status,
    scope: options.scope,
    errorCode: safeErrorCode,
    retentionNotesFa: note,
    createdAtIso: nowIso,
    updatedAtIso: nowIso,
  };
  const next = [entry, ...existing].slice(0, 10);
  writeScopedStorageJson(ACCOUNT_DATA_REQUESTS_KEY, next, scopeUid);
  return next;
}
