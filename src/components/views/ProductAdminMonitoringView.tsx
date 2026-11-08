/** @file src/components/views/ProductAdminMonitoringView.tsx — Dedicated Full-Page Admin & Monitoring View (< 140 lines) [RULE-01] */
import React, { useEffect } from 'react';
import { signInWithPopup } from 'firebase/auth';
import { auth, googleProvider } from '../../firebase';
import type { EvaluatedNeighborhood, Neighborhood, MapTileServerId, CityId } from '../../data/neighborhoods';
import type { FeatureFlags, SystemHealthData } from '../../types/models';
import { AdminModal } from '../AdminModal';
import { triggerManualNeshanRetry, readPersistedFallbackCircuit } from '../mapBaseTileController';

export interface ProductAdminMonitoringViewProps {
  ui: any;
  evaluatedNeighborhoods: EvaluatedNeighborhood[];
  allNeighborhoods?: Neighborhood[];
  activeCity: CityId;
  totalLiveBargainsCount: number;
  featureFlags: FeatureFlags;
  currentUser: any;
  isVerifiedAdmin: boolean;
  crudActions: any;
  handleDeepWebSync: () => void;
  mapTileStyle?: MapTileServerId;
  setMapTileStyle?: (style: MapTileServerId) => void;
  onBackToMap: () => void;
}

export const ProductAdminMonitoringView: React.FC<ProductAdminMonitoringViewProps> = (p) => {
  const { ui, crudActions } = p;

  const fetchSystemHealth = async () => {
    ui.setLoadingSystemHealth(true);
    try {
      const headers: Record<string, string> = {};
      if (p.currentUser) {
        try {
          const idToken = await p.currentUser.getIdToken();
          if (idToken) headers.Authorization = `Bearer ${idToken}`;
        } catch {
          // ignore token error in temporary inspection mode
        }
      }
      const res = await fetch('/api/system-health', { headers, cache: 'no-store' });
      if (!res.ok) {
        ui.setSystemHealth(null);
        return;
      }
      const payload: unknown = await res.json();
      if (!payload || typeof payload !== 'object' || Array.isArray(payload) || !('status' in payload) || payload.status !== 'ok') {
        ui.setSystemHealth(null);
        return;
      }
      ui.setSystemHealth(payload as SystemHealthData);
    } catch {
      ui.setSystemHealth(null);
    } finally {
      ui.setLoadingSystemHealth(false);
    }
  };

  useEffect(() => {
    ui.setAdminUnlocked(true);
  }, []);

  const mergedNeighborhoods = p.allNeighborhoods
    ? p.allNeighborhoods.map((n) => p.evaluatedNeighborhoods.find((ev) => ev.id === n.id) || n)
    : p.evaluatedNeighborhoods;

  return (
    <div data-testid="admin-monitoring-full-page" className="w-full min-h-full bg-[#F8F9FA] dark:bg-slate-950 pb-20">
      <AdminModal
        open={true}
        asPageView={true}
        temporaryInspectionMode={true}
        onClose={p.onBackToMap}
        adminUnlocked={ui.adminUnlocked}
        setAdminUnlocked={ui.setAdminUnlocked}
        adminPassInput={ui.adminPassInput}
        setAdminPassInput={ui.setAdminPassInput}
        adminPassError={ui.adminPassError}
        onAdminLogin={crudActions.handleAdminLogin}
        adminTab={ui.adminTab}
        setAdminTab={ui.setAdminTab}
        sponsorRequests={ui.sponsorRequests}
        buyerLeads={ui.buyerLeads}
        totalLiveBargainsCount={p.totalLiveBargainsCount}
        neighborhoods={mergedNeighborhoods}
        activeCity={p.activeCity}
        onAdminApproveSponsor={crudActions.handleAdminApproveSponsor}
        onAdminDeleteSponsorRequest={crudActions.handleAdminDeleteSponsorRequest}
        onDownloadBuyerLeadsCsv={crudActions.handleDownloadBuyerLeadsCsv}
        onAdminDeleteBargain={crudActions.handleAdminDeleteBargain}
        onAdminApproveBargain={crudActions.handleAdminApproveBargain}
        adminEditHoodId={ui.adminEditHoodId}
        setAdminEditHoodId={ui.setAdminEditHoodId}
        adminEditBuySqm={ui.adminEditBuySqm}
        setAdminEditBuySqm={ui.setAdminEditBuySqm}
        adminEditRahn80m={ui.adminEditRahn80m}
        setAdminEditRahn80m={ui.setAdminEditRahn80m}
        adminPriceSavedMsg={ui.adminPriceSavedMsg}
        onAdminQuickPriceSave={crudActions.handleAdminQuickPriceSave}
        deepSyncing={ui.deepSyncing}
        onDeepWebSync={p.handleDeepWebSync}
        newAdminPassword={ui.newAdminPassword}
        setNewAdminPassword={ui.setNewAdminPassword}
        adminPassChangeMsg={ui.adminPassChangeMsg}
        onAdminChangePassword={crudActions.handleAdminChangePassword}
        systemHealth={ui.systemHealth}
        loadingSystemHealth={ui.loadingSystemHealth}
        onRefreshSystemHealth={fetchSystemHealth}
        featureFlags={p.featureFlags}
        onToggleFeatureFlag={crudActions.handleToggleFeatureFlag}
        onDownloadFullBackupJson={crudActions.handleDownloadFullBackupJson}
        onRestoreFullBackupJson={crudActions.handleRestoreFullBackupJson}
        backupStatusMsg={ui.backupStatusMsg}
        isVerifiedAdmin={p.isVerifiedAdmin}
        currentUserEmail={p.currentUser?.email || null}
        onGoogleSignIn={() => {
          ui.setAdminPassError('');
          signInWithPopup(auth, googleProvider).catch((err) =>
            ui.setAdminPassError(
              err?.code === 'auth/popup-blocked'
                ? 'پنجره ورود گوگل توسط مرورگر مسدود شد؛ لطفاً مسدودکننده پاپ‌آپ را غیرفعال کنید.'
                : err?.code === 'auth/popup-closed-by-user'
                  ? 'پنجره ورود گوگل بسته شد.'
                  : 'خطا در ورود با حساب گوگل؛ لطفاً دوباره تلاش کنید.'
            )
          );
        }}
        onExtendSponsor30Days={crudActions.handleExtendSponsor30Days}
        onReleaseHoodSponsor={crudActions.handleReleaseHoodSponsor}
        mapTileStyle={p.mapTileStyle}
        onSelectMapTileStyle={p.setMapTileStyle}
        onRetryNeshan={triggerManualNeshanRetry}
        isFallbackActive={readPersistedFallbackCircuit()}
      />
    </div>
  );
};
