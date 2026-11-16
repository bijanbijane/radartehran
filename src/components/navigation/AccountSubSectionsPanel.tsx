/** @file src/components/navigation/AccountSubSectionsPanel.tsx — Sub-section Views for Account Module (Stage 22) */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { User as FirebaseUser } from 'firebase/auth';
import type { EvaluatedNeighborhood } from '../../data/neighborhoods';
import type { PrimaryViewId } from '../../utils/areaUnit';
import type { AccountSubTabId, ModuleSubTabId, SavedMapViewItem } from '../../navigation/registry/route.types';
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
  currentUser: FirebaseUser | null;
  evaluatedNeighborhoods: EvaluatedNeighborhood[];
  mode: 'rent' | 'buy';
  visitedHomesCount: number;
  onOpenVisitedModal: () => void;
  onOpenBuyerAlertModal: () => void;
  onOpenBudgetFilter: () => void;
  onNavigateView?: (view: PrimaryViewId, subTab?: ModuleSubTabId) => void;
  onSelectNeighborhood: (hood: EvaluatedNeighborhood) => void;
  onRestoreSavedView?: (view: SavedMapViewItem) => void;
  onExportAccountData: () => Promise<boolean> | boolean;
  onRequestDeleteAccount: () => void;
  busyAction: 'export' | 'delete' | null;
  dataRequestRevision?: number;
}

export const AccountSubSectionsPanel: React.FC<AccountSubSectionsPanelProps> = (p) => {
  const [snapshotRevision, setSnapshotRevision] = useState(0);
  const refresh = () => setSnapshotRevision((x) => x + 1);
  const guestExportRevokeTimerRef = useRef<number | null>(null);
  useEffect(() => () => { if (guestExportRevokeTimerRef.current !== null) window.clearTimeout(guestExportRevokeTimerRef.current); }, []);

  const snapshot = useMemo(() => loadAccountWorkspaceSnapshot({
    callerUid: p.currentUser?.uid || 'local-user',
    displayName: p.currentUser?.displayName,
    visitedHomesCount: p.visitedHomesCount,
  }), [p.currentUser?.uid, p.currentUser?.displayName, p.visitedHomesCount, snapshotRevision, p.dataRequestRevision]);

  const handleGuestExport = () => {
    try {
      const bundle = buildLocalWorkspaceExportBundle();
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `radar-workspace-local-export.json`;
      a.click();
      if (guestExportRevokeTimerRef.current !== null) window.clearTimeout(guestExportRevokeTimerRef.current);
      guestExportRevokeTimerRef.current = window.setTimeout(() => { URL.revokeObjectURL(url); guestExportRevokeTimerRef.current = null; }, 1000);
      recordDataRequest('export', 'completed');
      refresh();
    } catch { /* ignore export failure */ }
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
        onSaveProfile={(patch) => { saveAccountProfile(patch, p.currentUser?.uid || 'local-user'); refresh(); }}
        onUpdatePrivacy={(patch) => { updatePrivacyPreferences(patch); refresh(); }}
        onRevokeSession={(id) => { revokeAuthorizedSession(id); refresh(); }}
        onExportAccountData={async () => {
          const ok = await p.onExportAccountData();
          if (ok) {
            recordDataRequest('export', 'completed');
            refresh();
          }
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
        onRemoveSavedProperty={(id) => { removeSavedPropertyById(id); refresh(); }}
        onCreateSearchWatchlist={(title, querySummaryFa, mod) => {
          createSavedSearchWatchlist({ title, querySummaryFa, module: mod, filtersSnapshot: {}, alertCadence: 'daily_digest' });
          refresh();
        }}
        onChangeSearchCadence={(id, cad) => { toggleSavedSearchAlertCadence(id, cad); refresh(); }}
        onDeleteSearchWatchlist={(id) => { deleteSavedSearchWatchlist(id); refresh(); }}
        onDeleteSavedMapView={(id) => { deleteSavedMapView(id); refresh(); }}
        onDeleteSavedMarketAnalysis={(id) => { deleteSavedMarketAnalysisById(id); refresh(); }}
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
        onDeleteValuation={(id) => { deleteSavedValuationById(id); refresh(); }}
        onNavigateView={p.onNavigateView}
      />
    );
  }

  if (p.activeSubTab === 'contributions') {
    return (
      <AccountContributionsAndServicesPanel
        myListings={snapshot.myListings}
        serviceRequests={snapshot.serviceRequests}
        serviceProposals={snapshot.serviceProposals}
        onRemoveMyListing={(id) => { removeMyListingById(id); refresh(); }}
        onNavigateView={p.onNavigateView}
      />
    );
  }

  if (p.activeSubTab === 'community') {
    return <AccountCommunityPrivacyPanel onNavigateView={p.onNavigateView} />;
  }

  if (p.activeSubTab === 'notifications') {
    return (
      <AccountNotificationsPanel
        uid={p.currentUser?.uid || 'local-user'}
        notifications={snapshot.notifications}
        channels={snapshot.notificationChannels}
        onUpdateChannels={(patch) => { updateNotificationChannels(patch); refresh(); }}
        onMarkRead={(id) => { markAccountNotificationRead(id); refresh(); }}
        onMarkAllRead={() => { markAllAccountNotificationsRead(snapshot.notifications.map((n) => n.id)); refresh(); }}
        onOpenBuyerAlertModal={p.onOpenBuyerAlertModal}
        onNavigateView={p.onNavigateView}
      />
    );
  }

  return null;
};
