/** @file src/features/account/services/accountWorkspaceService.ts — Cross-Module Personal Workspace Aggregator, Privacy & Session Controls */
import { readSavedMapViews, deleteSavedMapView } from '../../../navigation/map/mapToolRailConfig';
import {
  loadMyListings,
  loadSavedProperties,
  loadUserListingHistory,
  saveMyListings,
} from '../../properties/services/listingService';
import { loadSavedValuationReports, persistSavedValuationReports } from '../../valuation/services/valuationWorkspaceService';
import { loadSavedMarketAnalyses, persistSavedMarketAnalyses } from '../../market/state/marketUrlAdapter';
import { loadServiceProposals, loadServiceRequests } from '../../services/services/serviceWorkflowService';
import {
  loadAccountProfile,
  loadAuthorizedSessions,
  loadDataRequests,
  loadNotificationChannels,
  loadPrivacyPreferences,
  loadSavedSearchWatchlists,
  readAccountJson,
  writeAccountJson,
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

export function assertAccountResourceOwner(ownerUid: string, callerUid: string): boolean {
  return Boolean(ownerUid && callerUid && ownerUid === callerUid);
}

export function markAccountNotificationRead(id: string): void {
  const ids = new Set(readAccountJson<string[]>(ACCOUNT_NOTIF_READ_KEY, []));
  ids.add(id);
  writeAccountJson(ACCOUNT_NOTIF_READ_KEY, Array.from(ids).slice(-120));
}

export function markAllAccountNotificationsRead(allIds: string[]): void {
  const ids = new Set(readAccountJson<string[]>(ACCOUNT_NOTIF_READ_KEY, []));
  allIds.forEach((id) => ids.add(id));
  writeAccountJson(ACCOUNT_NOTIF_READ_KEY, Array.from(ids).slice(-120));
}

export function removeSavedPropertyById(listingId: string) {
  const next = loadSavedProperties().filter((x) => x.listingId !== listingId);
  writeAccountJson('radar_saved_properties_v1', next);
  return next;
}

export function removeMyListingById(listingId: string) {
  const next = loadMyListings().filter((x) => x.listing.listingId !== listingId);
  saveMyListings(next);
  return next;
}

export function deleteSavedValuationById(reportId: string) {
  const next = loadSavedValuationReports().filter((r) => r.id !== reportId);
  persistSavedValuationReports(next);
  return next;
}

export function deleteSavedMarketAnalysisById(analysisId: string) {
  const next = loadSavedMarketAnalyses().filter((a) => a.id !== analysisId);
  persistSavedMarketAnalyses(next);
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
  callerUid?: string;
  displayName?: string | null;
  visitedHomesCount?: number;
}): AccountWorkspaceSnapshot {
  const uid = params?.callerUid || 'local-user';
  const profile = loadAccountProfile(uid, params?.displayName || 'کاربر رادار تهران');
  const privacy = loadPrivacyPreferences();
  const notificationChannels = loadNotificationChannels();
  const savedProperties = loadSavedProperties();
  const myListings = loadMyListings();
  const savedValuations = loadSavedValuationReports();
  const savedMarketAnalyses = loadSavedMarketAnalyses();
  const savedMapViews = readSavedMapViews();
  const savedSearches = loadSavedSearchWatchlists();
  const serviceRequests = loadServiceRequests();
  const serviceProposals = loadServiceProposals();
  const listingEvents = loadUserListingHistory();
  const sessions = loadAuthorizedSessions();
  const dataRequests = loadDataRequests();
  const readIds = new Set(readAccountJson<string[]>(ACCOUNT_NOTIF_READ_KEY, []));

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

export function buildLocalWorkspaceExportBundle(): Record<string, unknown> {
  const snap = loadAccountWorkspaceSnapshot();
  return {
    exportedAtIso: new Date().toISOString(),
    scope: 'local_workspace_snapshot',
    profile: snap.profile,
    privacy: snap.privacy,
    notificationChannels: snap.notificationChannels,
    savedProperties: snap.savedProperties,
    myListingsCount: snap.myListings.length,
    savedValuations: snap.savedValuations,
    savedMarketAnalyses: snap.savedMarketAnalyses,
    savedMapViews: snap.savedMapViews,
    savedSearches: snap.savedSearches,
    serviceRequests: snap.serviceRequests,
  };
}

