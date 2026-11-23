/** @file src/components/navigation/AccountSubSectionsPanel.tsx — Sub-section Views for Account Module (State-Driven Snapshot & UID Isolation) */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { AuthUserSnapshot } from '../../platform/auth';
import type { EvaluatedNeighborhood } from '../../data/neighborhoods';
import type { PrimaryViewId } from '../../utils/areaUnit';
import type { AccountSubTabId, ModuleSubTabId, SavedMapViewItem } from '../../navigation/registry/route.types';
import type { AccountWorkspaceSnapshot } from '../../features/account/types/account.types';
import {
  ACCOUNT_WORKSPACE_UPDATED_EVENT,
  isStorageKeyForUid,
  resolveEffectiveUid,
} from '../../features/account/services/accountStorageScope';
import { downloadJsonPayloadFile } from '../../features/account/services/accountExportDownloadService';
import {
  buildLocalWorkspaceExportBundle,
  createSavedSearchWatchlist,
  deleteSavedMapView,
  deleteSavedMarketAnalysisById,
  deleteSavedSearchWatchlist,
  deleteSavedValuationById,
  loadAccountWorkspaceSnapshot,
  markAccountNotificationRead,
  markAllAccountNotificationsRead,
  recordDataRequest,
  removeMyListingById,
  removeSavedPropertyById,
  revokeAuthorizedSession,
  saveAccountProfile,
  toggleSavedSearchAlertCadence,
  updateNotificationChannels,
  updatePrivacyPreferences,
} from '../../features/account/services/accountWorkspaceService';
import { AccountSavedItemsPanel } from '../../features/account/components/AccountSavedItemsPanel';
import { AccountActivityAndValuationsPanel } from '../../features/account/components/AccountActivityAndValuationsPanel';
import { AccountContributionsAndServicesPanel } from '../../features/account/components/AccountContributionsAndServicesPanel';
import { AccountNotificationsPanel } from '../../features/account/components/AccountNotificationsPanel';
import { AccountProfileAndSettingsPanel } from '../../features/account/components/AccountProfileAndSettingsPanel';
import { AccountCommunityPrivacyPanel } from '../../features/account/components/AccountCommunityPrivacyPanel';

export interface AccountSubSectionsPanelProps {
  activeSubTab: AccountSubTabId;
  currentUser: AuthUserSnapshot | null;
  evaluatedNeighborhoods: EvaluatedNeighborhood[];
  mode: 'rent' | 'buy';
  visitedHomesCount: number;
  onOpenVisitedModal: () => void;
  onOpenBuyerAlertModal: () => void;
  onOpenBudgetFilter: () => void;
  onNavigateView?: (view: PrimaryViewId, subTab?: ModuleSubTabId) => void;
  onSelectNeighborhood: (hood: EvaluatedNeighborhood) => void;
  onRestoreSavedView?: (view: SavedMapViewItem) => void;
  onExportAccountData: (includeLocalWorkspace?: boolean) => Promise<boolean> | boolean;
  onRequestDeleteAccount: () => void;
  busyAction: 'export' | 'delete' | null;
  dataRequestRevision?: number;
  loadSnapshotFn?: typeof loadAccountWorkspaceSnapshot;
}

export const AccountSubSectionsPanel: React.FC<AccountSubSectionsPanelProps> = (p) => {
  const effectiveUid = resolveEffectiveUid(p.currentUser?.uid ?? null);
  const effectiveDisplayName = p.currentUser?.displayName ?? null;
  const loaderFn = p.loadSnapshotFn ?? loadAccountWorkspaceSnapshot;
  const syncKey = `${effectiveUid}|${effectiveDisplayName ?? ''}|${p.visitedHomesCount}|${p.dataRequestRevision ?? 0}`;

  const [snapshot, setSnapshot] = useState<AccountWorkspaceSnapshot>(() =>
    loaderFn({ callerUid: effectiveUid, displayName: effectiveDisplayName, visitedHomesCount: p.visitedHomesCount }),
  );
  const [actionErrorFa, setActionErrorFa] = useState<string | null>(null);
  const lastSyncKeyRef = useRef<string>(syncKey);
  const guestDownloadCancelRef = useRef<(() => void) | null>(null);

  const refresh = useCallback(() => {
    try {
      const next = loaderFn({ callerUid: effectiveUid, displayName: effectiveDisplayName, visitedHomesCount: p.visitedHomesCount });
      setSnapshot(next);
      setActionErrorFa(null);
    } catch {
      setActionErrorFa('به‌روزرسانی وضعیت فضای کاری با خطا مواجه شد؛ آخرین وضعیت معتبر حفظ شده است.');
    }
  }, [loaderFn, effectiveUid, effectiveDisplayName, p.visitedHomesCount]);

  useEffect(() => {
    if (lastSyncKeyRef.current === syncKey) return;
    lastSyncKeyRef.current = syncKey;
    refresh();
  }, [syncKey, refresh]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handleStorage = (ev: StorageEvent) => {
      if (!ev.key || isStorageKeyForUid(ev.key, effectiveUid)) refresh();
    };
    const handleWorkspaceEvent = (ev: Event) => {
      const detailUid = (ev as CustomEvent<{ uid?: string }>)?.detail?.uid;
      if (!detailUid || detailUid === effectiveUid) refresh();
    };
    window.addEventListener('storage', handleStorage);
    window.addEventListener(ACCOUNT_WORKSPACE_UPDATED_EVENT, handleWorkspaceEvent);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(ACCOUNT_WORKSPACE_UPDATED_EVENT, handleWorkspaceEvent);
    };
  }, [effectiveUid, refresh]);

  useEffect(() => () => {
    if (guestDownloadCancelRef.current) {
      guestDownloadCancelRef.current();
      guestDownloadCancelRef.current = null;
    }
  }, []);

  const runSnapshotMutation = (mutator: () => void) => {
    try {
      mutator();
      setActionErrorFa(null);
      refresh();
    } catch {
      setActionErrorFa('اعمال تغییر روی داده‌های حساب انجام نشد.');
    }
  };

  const handleGuestExport = () => {
    if (guestDownloadCancelRef.current) {
      guestDownloadCancelRef.current();
      guestDownloadCancelRef.current = null;
    }
    try {
      const bundle = buildLocalWorkspaceExportBundle(effectiveUid);
      const dl = downloadJsonPayloadFile(bundle, { scope: 'local_workspace' });
      guestDownloadCancelRef.current = dl.cancelRevokeTimer ?? null;
      recordDataRequest('export', dl.ok ? 'completed' : 'failed', {
        uid: effectiveUid,
        scope: 'local_workspace',
        errorCode: dl.code,
        retentionNotesFa: dl.ok ? undefined : dl.messageFa,
      });
      setActionErrorFa(dl.ok ? null : (dl.messageFa || 'دانلود خروجی فضای کاری ناموفق بود.'));
      refresh();
    } catch {
      recordDataRequest('export', 'failed', {
        uid: effectiveUid,
        scope: 'local_workspace',
        errorCode: 'DOWNLOAD_FAILED',
        retentionNotesFa: 'آماده‌سازی خروجی فضای کاری محلی ناموفق بود.',
      });
      setActionErrorFa('آماده‌سازی خروجی فضای کاری محلی ناموفق بود.');
      refresh();
    }
  };

  if (p.activeSubTab === 'profile' || p.activeSubTab === 'settings') {
    return (
      <AccountProfileAndSettingsPanel
        modeTab={p.activeSubTab}
        currentUser={p.currentUser}
        profile={snapshot.profile}
        privacy={snapshot.privacy}
        sessions={snapshot.sessions}
        dataRequests={snapshot.dataRequests}
        busyAction={p.busyAction}
        actionErrorFa={actionErrorFa}
        onSaveProfile={(patch) => runSnapshotMutation(() => { saveAccountProfile(patch, effectiveUid); })}
        onUpdatePrivacy={(patch) => runSnapshotMutation(() => { updatePrivacyPreferences(patch, effectiveUid); })}
        onRevokeSession={(id) => runSnapshotMutation(() => { revokeAuthorizedSession(id, effectiveUid); })}
        onExportAccountData={async (includeLocalWorkspace) => {
          await p.onExportAccountData(includeLocalWorkspace);
          refresh();
        }}
        onExportLocalGuestBundle={handleGuestExport}
        onRequestDeleteAccount={() => { p.onRequestDeleteAccount(); }}
      />
    );
  }

  if (p.activeSubTab === 'saved_views' || p.activeSubTab === 'saved_searches') {
    return (
      <AccountSavedItemsPanel
        modeTab={p.activeSubTab}
        savedProperties={snapshot.savedProperties}
        savedSearches={snapshot.savedSearches}
        savedMapViews={snapshot.savedMapViews}
        savedMarketAnalyses={snapshot.savedMarketAnalyses}
        evaluatedNeighborhoods={p.evaluatedNeighborhoods}
        dealMode={p.mode}
        onRemoveSavedProperty={(id) => runSnapshotMutation(() => { removeSavedPropertyById(id, effectiveUid); })}
        onCreateSearchWatchlist={(title, querySummaryFa, mod) => runSnapshotMutation(() => {
          createSavedSearchWatchlist({ title, querySummaryFa, module: mod, filtersSnapshot: {}, alertCadence: 'daily_digest' }, effectiveUid);
        })}
        onChangeSearchCadence={(id, cad) => runSnapshotMutation(() => { toggleSavedSearchAlertCadence(id, cad, effectiveUid); })}
        onDeleteSearchWatchlist={(id) => runSnapshotMutation(() => { deleteSavedSearchWatchlist(id, effectiveUid); })}
        onDeleteSavedMapView={(id) => runSnapshotMutation(() => { deleteSavedMapView(id, effectiveUid); })}
        onDeleteSavedMarketAnalysis={(id) => runSnapshotMutation(() => { deleteSavedMarketAnalysisById(id, effectiveUid); })}
        onRestoreSavedView={p.onRestoreSavedView}
        onOpenBudgetFilter={p.onOpenBudgetFilter}
        onSelectNeighborhood={p.onSelectNeighborhood}
        onNavigateView={p.onNavigateView}
      />
    );
  }

  if (p.activeSubTab === 'activity') {
    return (
      <AccountActivityAndValuationsPanel
        savedValuations={snapshot.savedValuations}
        timeline={snapshot.activityTimeline}
        visitedHomesCount={p.visitedHomesCount}
        onOpenVisitedModal={p.onOpenVisitedModal}
        onDeleteValuation={(id) => runSnapshotMutation(() => { deleteSavedValuationById(id, effectiveUid); })}
        onNavigateView={p.onNavigateView}
      />
    );
  }

  if (p.activeSubTab === 'contributions') {
    return (
      <AccountContributionsAndServicesPanel
        currentUser={p.currentUser}
        myListings={snapshot.myListings}
        serviceRequests={snapshot.serviceRequests}
        serviceProposals={snapshot.serviceProposals}
        onRemoveMyListing={(id) => runSnapshotMutation(() => { removeMyListingById(id, effectiveUid); })}
        onNavigateView={p.onNavigateView}
      />
    );
  }

  if (p.activeSubTab === 'community') {
    return <AccountCommunityPrivacyPanel currentUser={p.currentUser} onNavigateView={p.onNavigateView} />;
  }

  if (p.activeSubTab === 'notifications') {
    return (
      <AccountNotificationsPanel
        uid={effectiveUid}
        notifications={snapshot.notifications}
        channels={snapshot.notificationChannels}
        onUpdateChannels={(patch) => runSnapshotMutation(() => { updateNotificationChannels(patch, effectiveUid); })}
        onMarkRead={(id) => runSnapshotMutation(() => { markAccountNotificationRead(id, effectiveUid); })}
        onMarkAllRead={() => runSnapshotMutation(() => { markAllAccountNotificationsRead(snapshot.notifications.map((n) => n.id), effectiveUid); })}
        onOpenBuyerAlertModal={p.onOpenBuyerAlertModal}
        onNavigateView={p.onNavigateView}
      />
    );
  }

  return null;
};
