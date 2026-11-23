/** @file src/features/account/services/accountWorkspaceService.ts — UID-Isolated Cross-Module Personal Workspace Aggregator, Privacy & Session Controls */
import { readSavedMapViews, deleteSavedMapView } from '../../../navigation/map/mapToolRailConfig';
import {
  loadMyListings,
  loadSavedProperties,
  loadUserListingHistory,
  saveMyListings,
  saveSavedProperties,
} from '../../properties/services/listingService';
import { loadSavedValuationReports, persistSavedValuationReports } from '../../valuation/services/valuationWorkspaceService';
import { loadSavedMarketAnalyses, persistSavedMarketAnalyses } from '../../market/state/marketUrlAdapter';
import { loadServiceProposals, loadServiceRequests } from '../../services/services/serviceWorkflowService';
import {
  cleanupAccountLocalStorageForUid,
  getActiveAccountScopeUid,
  readScopedStorageJson,
  resolveEffectiveUid,
  setActiveAccountScopeUid,
  writeScopedStorageJson,
} from './accountStorageScope';
import {
  loadAccountProfile,
  loadAuthorizedSessions,
  loadDataRequests,
  loadNotificationChannels,
  loadPrivacyPreferences,
  loadSavedSearchWatchlists,
} from './accountSettingsStorageService';
import type {
  AccountActionRequiredItem,
  AccountActivityTimelineItem,
  AccountNotificationItem,
  AccountPrivacyPreferences,
  AccountWorkspaceSnapshot,
} from '../types/account.types';

const ACCOUNT_NOTIF_READ_KEY = 'radar_account_read_notifications_v1';

export {
  loadAccountProfile,
  saveAccountProfile,
  loadNotificationChannels,
  updateNotificationChannels,
  loadPrivacyPreferences,
  updatePrivacyPreferences,
  loadSavedSearchWatchlists,
  createSavedSearchWatchlist,
  toggleSavedSearchAlertCadence,
  deleteSavedSearchWatchlist,
  loadAuthorizedSessions,
  revokeAuthorizedSession,
  loadDataRequests,
  recordDataRequest,
  trackAccountEvent,
} from './accountSettingsStorageService';

export { cleanupAccountLocalStorageForUid, setActiveAccountScopeUid, getActiveAccountScopeUid, resolveEffectiveUid };

export function assertAccountResourceOwner(ownerUid: string, callerUid: string): boolean {
  return Boolean(ownerUid && callerUid && ownerUid === callerUid);
}

export function markAccountNotificationRead(id: string, uid?: string | null): void {
  const scopeUid = resolveEffectiveUid(uid);
  const ids = new Set(readScopedStorageJson<string[]>(ACCOUNT_NOTIF_READ_KEY, [], scopeUid));
  ids.add(id);
  writeScopedStorageJson(ACCOUNT_NOTIF_READ_KEY, Array.from(ids).slice(-120), scopeUid);
}

export function markAllAccountNotificationsRead(allIds: string[], uid?: string | null): void {
  const scopeUid = resolveEffectiveUid(uid);
  const ids = new Set(readScopedStorageJson<string[]>(ACCOUNT_NOTIF_READ_KEY, [], scopeUid));
  allIds.forEach((id) => ids.add(id));
  writeScopedStorageJson(ACCOUNT_NOTIF_READ_KEY, Array.from(ids).slice(-120), scopeUid);
}

export function removeSavedPropertyById(listingId: string, uid?: string | null) {
  const scopeUid = resolveEffectiveUid(uid);
  const next = loadSavedProperties(scopeUid).filter((x) => x.listingId !== listingId);
  saveSavedProperties(next, scopeUid);
  return next;
}

export function removeMyListingById(listingId: string, uid?: string | null) {
  const scopeUid = resolveEffectiveUid(uid);
  const next = loadMyListings(scopeUid).filter((x) => x.listing.listingId !== listingId);
  saveMyListings(next, scopeUid);
  return next;
}

export function deleteSavedValuationById(reportId: string, uid?: string | null) {
  const scopeUid = resolveEffectiveUid(uid);
  const next = loadSavedValuationReports(scopeUid).filter((r) => r.id !== reportId);
  persistSavedValuationReports(next, scopeUid);
  return next;
}

export function deleteSavedMarketAnalysisById(analysisId: string, uid?: string | null) {
  const scopeUid = resolveEffectiveUid(uid);
  const next = loadSavedMarketAnalyses(scopeUid).filter((a) => a.id !== analysisId);
  persistSavedMarketAnalyses(next, scopeUid);
  return next;
}

export { deleteSavedMapView };

export function deriveActionRequiredItems(params: {
  serviceProposals: ReturnType<typeof loadServiceProposals>;
  myListings: ReturnType<typeof loadMyListings>;
  privacy: AccountPrivacyPreferences;
}): AccountActionRequiredItem[] {
  const items: AccountActionRequiredItem[] = [];
  const pendingProps = params.serviceProposals.filter((p) => p.status === 'submitted');
  if (pendingProps.length > 0) {
    items.push({
      id: `actreq-prop-${pendingProps[0].proposalId}`,
      kind: 'pending_proposal',
      titleFa: `${pendingProps.length} پیشنهاد قیمت متخصص منتظر بررسی شماست`,
      subtitleFa: `آخرین پیشنهاد از ${pendingProps[0].providerName} (${pendingProps[0].priceDisplayFa})`,
      urgency: 'high',
      targetView: 'services',
    });
  }
  const pendingListings = params.myListings.filter((l) => l.listing.status === 'pending_review');
  if (pendingListings.length > 0) {
    items.push({
      id: `actreq-lst-${pendingListings[0].listing.listingId}`,
      kind: 'listing_review',
      titleFa: `${pendingListings.length} آگهی شما در صف بازبینی و تکمیل است`,
      subtitleFa: pendingListings[0].listing.title,
      urgency: 'medium',
      targetView: 'userspace',
      targetSubTab: 'contributions',
    });
  }
  if (!params.privacy.sharePhoneOnlyAfterConsent) {
    items.push({
      id: 'actreq-privacy-phone',
      kind: 'profile_setup',
      titleFa: 'اشتراک خودکار شماره تماس فعال است',
      subtitleFa: 'برای امنیت بیشتر، تایید صریح پیش از ارسال شماره را بررسی کنید.',
      urgency: 'medium',
      targetView: 'userspace',
      targetSubTab: 'settings',
    });
  }
  return items;
}

export function loadAccountWorkspaceSnapshot(params?: {
  callerUid?: string | null;
  displayName?: string | null;
  visitedHomesCount?: number;
}): AccountWorkspaceSnapshot {
  const uid = resolveEffectiveUid(params?.callerUid);
  const profile = loadAccountProfile(uid, params?.displayName || 'کاربر رادار تهران');
  const privacy = loadPrivacyPreferences(uid);
  const notificationChannels = loadNotificationChannels(uid);
  const savedProperties = loadSavedProperties(uid);
  const myListings = loadMyListings(uid);
  const savedValuations = loadSavedValuationReports(uid);
  const savedMarketAnalyses = loadSavedMarketAnalyses(uid);
  const savedMapViews = readSavedMapViews(uid);
  const savedSearches = loadSavedSearchWatchlists(uid);
  const serviceRequests = loadServiceRequests(uid);
  const serviceProposals = loadServiceProposals(undefined, uid);
  const listingEvents = loadUserListingHistory(uid);
  const sessions = loadAuthorizedSessions(uid);
  const dataRequests = loadDataRequests(uid);
  const readIds = new Set(readScopedStorageJson<string[]>(ACCOUNT_NOTIF_READ_KEY, [], uid));

  const notifications: AccountNotificationItem[] = [
    ...serviceProposals.map((p) => ({
      id: `notif-prop-${p.proposalId}`,
      category: 'service_proposal' as const,
      titleFa: `پیشنهاد جدید از ${p.providerName}`,
      bodyFa: `${p.offeringTitleFa} · تعرفه: ${p.priceDisplayFa}`,
      createdAtIso: p.createdAtIso,
      read: readIds.has(`notif-prop-${p.proposalId}`),
      targetView: 'services' as const,
    })),
    ...myListings.map((l) => ({
      id: `notif-list-${l.listing.listingId}`,
      category: 'listing_status' as const,
      titleFa: `وضعیت آگهی: ${l.listing.title}`,
      bodyFa: l.listing.status === 'pending_review' ? 'در صف بازبینی و پالایش' : 'منتشرشده در فهرست املاک',
      createdAtIso: l.listing.updatedAtIso,
      read: readIds.has(`notif-list-${l.listing.listingId}`),
      targetView: 'userspace' as const,
      targetSubTab: 'contributions' as const,
    })),
    {
      id: 'notif-privacy-baseline',
      category: 'system_privacy',
      titleFa: 'حریم خصوصی و شفافیت اطلاعات',
      bodyFa: privacy.sharePhoneOnlyAfterConsent
        ? 'شماره تماس شما تنها پس از تأیید صریح در درخواست‌های خدمت به اشتراک گذاشته می‌شود.'
        : 'تنظیم اشتراک تماس خودکار فعال است؛ از بخش تنظیمات قابل کنترل است.',
      createdAtIso: privacy.updatedAtIso,
      read: readIds.has('notif-privacy-baseline'),
      targetView: 'userspace',
      targetSubTab: 'settings',
    },
  ];

  const timeline: AccountActivityTimelineItem[] = [
    ...savedValuations.map((v) => ({
      id: `act-val-${v.id}`,
      kind: 'valuation' as const,
      titleFa: `ارزش‌گذاری ملک در ${v.hoodName}`,
      metaFa: `${v.modelVersion} · ${Math.round(v.hedonicTotalMillion / 100) / 10} میلیارد`,
      timestampIso: v.savedAtIso,
      targetView: 'tools' as const,
      targetSubTab: 'valuation' as const,
    })),
    ...serviceRequests.map((r) => ({
      id: `act-srv-${r.id}`,
      kind: 'service_request' as const,
      titleFa: `درخواست خدمت: ${r.providerName}`,
      metaFa: `${r.neighborhoodName} · وضعیت: ${r.status}`,
      timestampIso: r.updatedAtIso || r.createdAtIso,
      targetView: 'services' as const,
    })),
    ...listingEvents.map((e) => ({
      id: `act-lst-${e.id}`,
      kind: 'property_submit' as const,
      titleFa: e.summaryFa,
      metaFa: 'آگهی‌های ثبت‌شده من',
      timestampIso: e.atIso,
      targetView: 'userspace' as const,
      targetSubTab: 'contributions' as const,
    })),
    ...savedProperties.map((p) => ({
      id: `act-save-${p.listingId}`,
      kind: 'property_save' as const,
      titleFa: `ذخیره فایل: ${p.titleSnapshot}`,
      metaFa: `${p.hoodNameSnapshot} · ${p.priceLabelSnapshot}`,
      timestampIso: p.savedAtIso,
      targetView: 'properties' as const,
    })),
  ].sort((a, b) => Date.parse(b.timestampIso) - Date.parse(a.timestampIso)).slice(0, 30);

  return {
    profile,
    privacy,
    notificationChannels,
    savedProperties,
    myListings,
    savedValuations,
    savedMarketAnalyses,
    savedMapViews,
    savedSearches,
    serviceRequests,
    serviceProposals,
    notifications,
    sessions,
    activityTimeline: timeline,
    actionRequired: deriveActionRequiredItems({ serviceProposals, myListings, privacy }),
    dataRequests,
  };
}

export function buildLocalWorkspaceExportBundle(uid?: string | null): Record<string, unknown> {
  const scopeUid = resolveEffectiveUid(uid);
  const snap = loadAccountWorkspaceSnapshot({ callerUid: scopeUid });
  return {
    schemaVersion: '2.0.0',
    exportedAtIso: new Date().toISOString(),
    scope: 'local_workspace_snapshot',
    exportScope: 'local_workspace',
    origin: 'local_workspace',
    ownerUid: scopeUid,
    includedSources: [
      'local_profile',
      'local_privacy_preferences',
      'local_notification_channels',
      'local_saved_properties',
      'local_saved_valuations',
      'local_saved_market_analyses',
      'local_saved_map_views',
      'local_saved_searches',
      'local_service_requests',
    ],
    excludedSources: [
      'server_account_d1',
      'server_bargains_and_sponsors',
      'firebase_auth_identity',
      'security_tokens_and_secrets',
    ],
    localWorkspaceData: {
      profile: {
        displayName: snap.profile.displayName,
        preferredCityId: snap.profile.preferredCityId,
        preferredPurpose: snap.profile.preferredPurpose,
        activeRoles: snap.profile.activeRoles,
        activeWorkspaceMode: snap.profile.activeWorkspaceMode,
      },
      privacy: snap.privacy,
      notificationChannels: snap.notificationChannels,
      savedProperties: snap.savedProperties,
      myListingsCount: snap.myListings.length,
      savedValuations: snap.savedValuations,
      savedMarketAnalyses: snap.savedMarketAnalyses,
      savedMapViews: snap.savedMapViews,
      savedSearches: snap.savedSearches,
      serviceRequests: snap.serviceRequests.map((r) => ({
        id: r.id,
        providerName: r.providerName,
        neighborhoodName: r.neighborhoodName,
        canonicalCategory: r.canonicalCategory,
        status: r.status,
        createdAtIso: r.createdAtIso,
      })),
    },
  };
}
