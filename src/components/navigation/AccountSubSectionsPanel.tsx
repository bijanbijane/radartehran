/** @file src/components/navigation/AccountSubSectionsPanel.tsx — Sub-section Views for Account Module (Stage 22) */
import React, { useState } from 'react';
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
  onExportAccountData: () => void;
  onRequestDeleteAccount: () => void;
  busyAction: 'export' | 'delete' | null;
}

export const AccountSubSectionsPanel: React.FC<AccountSubSectionsPanelProps> = (p) => {
  const [tick, setTick] = useState(0);
  const refresh = () => setTick((x) => x + 1);
  void tick;

  const snapshot = loadAccountWorkspaceSnapshot({
    callerUid: p.currentUser?.uid || 'local-user',
    displayName: p.currentUser?.displayName,
    visitedHomesCount: p.visitedHomesCount,
  });

  const handleGuestExport = () => {
    const bundle = buildLocalWorkspaceExportBundle();
    recordDataRequest('export', 'completed');
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `radar-workspace-local-export.json`;
    a.click();
    URL.revokeObjectURL(url);
    refresh();
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
        onExportAccountData={() => { recordDataRequest('export', 'ready'); p.onExportAccountData(); refresh(); }}
        onExportLocalGuestBundle={handleGuestExport}
        onRequestDeleteAccount={() => { recordDataRequest('delete', 'pending_verification'); p.onRequestDeleteAccount(); refresh(); }}
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
