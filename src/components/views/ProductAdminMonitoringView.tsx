/** @file src/components/views/ProductAdminMonitoringView.tsx — Dedicated Full-Page Admin & Monitoring View (< 140 lines) [RULE-01] */
import React, { useEffect } from 'react';
import { signInWithPopup } from 'firebase/auth';
import { auth, googleProvider } from '../../firebase';
import type { EvaluatedNeighborhood, Neighborhood, MapTileServerId, CityId } from '../../data/neighborhoods';
import type { FeatureFlags, SystemHealthData } from '../../types/models';
import { AdminModal } from '../AdminModal';
import { triggerManualNeshanRetry, readPersistedFallbackCircuit } from '../mapBaseTileController';
import { formatMillionTomanAsIntlCurrency } from '../../utils/areaUnit';

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
      <div className="max-w-5xl mx-auto px-4 pt-3 pb-2 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
          <h2 className="text-xs sm:text-sm font-black text-slate-900 dark:text-white">صفحه مستقل مدیریت و مانیتورینگ سیستم</h2>
          <span className="text-[10px] px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 font-bold border border-emerald-300 dark:border-emerald-800">
            بررسی موقت بدون رمز
          </span>
        </div>
        <button
          type="button"
          onClick={p.onBackToMap}
          className="px-3 py-1.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold transition hover:opacity-90 flex items-center gap-1.5 cursor-pointer shadow-sm"
        >
          <span>← بازگشت به نقشه</span>
        </button>
      </div>
      <AdminModal
        open={true}
        asPageView={true}
        temporaryInspectionMode={true}
        onClose={p.onBackToMap}
        adminUnlocked={true}
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
        isVerifiedAdmin={true}
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
