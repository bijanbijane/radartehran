/** @file src/components/views/ProductAdminMonitoringView.tsx — Independent Admin Shell with 6-Section RTL Sidebar (< 220 lines) */
import React, { useEffect, useState } from 'react';
import { signInWithPopup } from 'firebase/auth';
import { Database, FileText, LayoutDashboard, LogOut, Menu, Shield, Users, Wrench, X } from 'lucide-react';
import { auth, googleProvider } from '../../firebase';
import type { EvaluatedNeighborhood, Neighborhood, MapTileServerId, CityId } from '../../data/neighborhoods';
import type { FeatureFlags, SystemHealthData } from '../../types/models';
import { AdminModal } from '../AdminModal';
import { triggerManualNeshanRetry, readPersistedFallbackCircuit } from '../mapBaseTileController';
import { formatMillionTomanAsIntlCurrency } from '../../utils/areaUnit';
import { ADMIN_SIDEBAR_SECTIONS } from '../../navigation/registry/admin.routes';
import type { AdminSectionId } from '../../navigation/registry/route.types';
import { DEFAULT_UI_ROLLOUT_FLAGS } from '../../interaction-system/contracts/validationAndImplementContract';
import { AdminServiceModerationCard } from '../../features/services/components/AdminServiceModerationCard';
import { AdminOperationsOverviewCard } from '../../features/admin/components/AdminOperationsOverviewCard';
import { AdminGovernanceModerationWorkspace } from '../../features/admin/components/AdminGovernanceModerationWorkspace';
import { AdminDataAndModelCenter } from '../../features/admin/components/AdminDataAndModelCenter';
import { AdminSecurityAndAuditCenter } from '../../features/admin/components/AdminSecurityAndAuditCenter';
import { AdminCommunicationsPanel } from '../../features/admin/components/AdminCommunicationsPanel';
import { loadActiveGovernanceRole, saveActiveGovernanceRole } from '../../features/admin/services/adminGovernanceService';
import type { AdminGovernanceRole } from '../../features/admin/types/admin.types';

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
  activeSection?: AdminSectionId;
  onChangeSection?: (section: AdminSectionId) => void;
  onBackToMap: () => void;
}

const ADMIN_ICONS = {
  overview: LayoutDashboard,
  content: FileText,
  data: Database,
  users: Users,
  operations: Wrench,
  security: Shield,
} as const;

export const ProductAdminMonitoringView: React.FC<ProductAdminMonitoringViewProps> = (p) => {
  const { ui, crudActions } = p;
  const [sidebarOpenMobile, setSidebarOpenMobile] = useState(false);
  const [localSection, setLocalSection] = useState<AdminSectionId>(p.activeSection || 'overview');
  const [governanceRole, setGovernanceRole] = useState<AdminGovernanceRole>(() => loadActiveGovernanceRole());
  const currentSection = p.activeSection || localSection;

  const fetchSystemHealth = async () => {
    if (!p.isVerifiedAdmin || !p.currentUser || !p.currentUser.emailVerified) {
      ui.setSystemHealth(null);
      return;
    }
    ui.setLoadingSystemHealth(true);
    try {
      const idToken = await p.currentUser.getIdToken();
      if (!idToken) { ui.setSystemHealth(null); return; }
      const res = await fetch('/api/system-health', { headers: { Authorization: `Bearer ${idToken}` }, cache: 'no-store' });
      if (!res.ok) { ui.setSystemHealth(null); return; }
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
    if (p.isVerifiedAdmin && ui.adminUnlocked && ui.adminTab === 'security') {
      void fetchSystemHealth();
    }
  }, [p.isVerifiedAdmin, ui.adminUnlocked, ui.adminTab]);

  const handleSelectSection = (sec: (typeof ADMIN_SIDEBAR_SECTIONS)[number]) => {
    setLocalSection(sec.id);
    p.onChangeSection?.(sec.id);
    ui.setAdminTab(sec.mappedLegacyTab);
    setSidebarOpenMobile(false);
  };

  const mergedNeighborhoods = p.allNeighborhoods
    ? p.allNeighborhoods.map((n) => p.evaluatedNeighborhoods.find((ev) => ev.id === n.id) || n)
    : p.evaluatedNeighborhoods;
  const activeMeta = ADMIN_SIDEBAR_SECTIONS.find((s) => s.id === currentSection) || ADMIN_SIDEBAR_SECTIONS[0];
  const sampleFx = formatMillionTomanAsIntlCurrency(100, 'USD', 'fa');

  return (
    <div data-testid="admin-monitoring-full-page" data-admin-fx-sample={sampleFx} className="w-full min-h-full bg-[#F6F8F6] dark:bg-slate-950 flex flex-col">
      {/* Independent Admin Context Top Bar */}
      <header className="sticky top-0 z-20 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 h-14 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <button type="button" onClick={() => setSidebarOpenMobile((o) => !o)} aria-label="منوی مدیریت" className="lg:hidden p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 cursor-pointer">
            {sidebarOpenMobile ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
          <span className="font-black text-sm text-slate-900 dark:text-white">محیط عملیاتی و مدیریت رادار تهران</span>
          <span className="hidden sm:inline-block text-[10px] px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-bold border border-emerald-200 dark:border-emerald-800">
            {p.isVerifiedAdmin && ui.adminUnlocked ? 'نشست ادمین تاییدشده (RBAC)' : 'محافظت‌شده (Zero-Trust)'}
          </span>
        </div>
        <button
          type="button"
          onClick={p.onBackToMap}
          className="px-3 py-1.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold transition hover:opacity-90 flex items-center gap-1.5 cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>بازگشت به محیط عمومی</span>
        </button>
      </header>

      {/* Independent Admin 2-Column Layout: RTL Right Sidebar + Left Content */}
      <div className="flex-1 flex relative max-w-[1440px] w-full mx-auto">
        <aside
          aria-label="منوی بخش‌های مدیریت"
          className={`${sidebarOpenMobile ? 'fixed inset-y-14 right-0 z-30 block' : 'hidden'} lg:block lg:static w-64 shrink-0 bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 p-3 space-y-1.5`}
        >
          <div className="px-2.5 py-1.5 text-[10.5px] font-black text-slate-400">گروه‌های عملیاتی پنل</div>
          {ADMIN_SIDEBAR_SECTIONS.map((sec) => {
            const Icon = ADMIN_ICONS[sec.id];
            const active = currentSection === sec.id;
            return (
              <button
                key={sec.id}
                type="button"
                aria-current={active ? 'page' : undefined}
                onClick={() => handleSelectSection(sec)}
                className={`w-full text-start px-3 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2.5 transition cursor-pointer ${
                  active
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                <div className="min-w-0">
                  <div className="truncate">{sec.labelFa}</div>
                </div>
              </button>
            );
          })}
        </aside>

        <section className="flex-1 min-w-0 p-4 sm:p-6 space-y-4">
          <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div>
              <h1 className="text-base font-black text-slate-900 dark:text-white">{activeMeta.labelFa}</h1>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">{activeMeta.descriptionFa}</p>
            </div>
            <span className="text-[10.5px] font-mono text-slate-400">{activeMeta.requiredPermission}</span>
          </div>

          {currentSection === 'overview' && (
            <AdminOperationsOverviewCard
              isVerifiedAdmin={p.isVerifiedAdmin}
              activeRole={governanceRole}
              onChangeRole={(role) => setGovernanceRole(saveActiveGovernanceRole(role))}
              sponsorRequestsCount={(ui.sponsorRequests || []).length}
              liveBargainsCount={p.totalLiveBargainsCount}
              onJumpSection={(secId) => {
                const match = ADMIN_SIDEBAR_SECTIONS.find((s) => s.id === secId);
                if (match) handleSelectSection(match);
              }}
            />
          )}

          {(currentSection === 'overview' || currentSection === 'operations') && (
            <div data-testid="admin-ux-health-monitor" className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-[#DCE3DF] dark:border-slate-800 space-y-2 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-extrabold text-[#182522] dark:text-white">پایش سلامت تجربه کاربری (UX Health Monitor · غیرشخصی)</span>
                <span className="px-2 py-0.5 rounded-[6px] bg-[#EAF5EE] text-[#176B4C] font-bold text-[11px]">
                  پایلوت نقشه (RT-PILOT-MAP-001) · S0/S1 Gate: پاک
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {DEFAULT_UI_ROLLOUT_FLAGS.map((flag) => (
                  <span key={flag.key} className="px-2 py-0.5 rounded-[6px] border border-[#DCE3DF] dark:border-slate-700 text-[10.5px] font-semibold text-[#34433E] dark:text-slate-300">
                    {flag.key}: {flag.enabled ? 'فعال' : 'غیرفعال'}
                  </span>
                ))}
              </div>
            </div>
          )}

          {currentSection === 'content' && (
            <AdminGovernanceModerationWorkspace
              section="content"
              isVerifiedAdmin={p.isVerifiedAdmin}
              activeRole={governanceRole}
            />
          )}

          {currentSection === 'data' && (
            <AdminDataAndModelCenter
              neighborhoods={mergedNeighborhoods}
              activeCity={p.activeCity}
              isVerifiedAdmin={p.isVerifiedAdmin}
              activeRole={governanceRole}
            />
          )}

          {currentSection === 'users' && (
            <>
              <AdminServiceModerationCard isVerifiedAdmin={p.isVerifiedAdmin} />
              <AdminGovernanceModerationWorkspace
                section="users"
                isVerifiedAdmin={p.isVerifiedAdmin}
                activeRole={governanceRole}
              />
            </>
          )}

          {currentSection === 'operations' && (
            <AdminCommunicationsPanel isVerifiedAdmin={p.isVerifiedAdmin} />
          )}

          {(currentSection === 'operations' || currentSection === 'security') && (
            <AdminSecurityAndAuditCenter section={currentSection} isVerifiedAdmin={p.isVerifiedAdmin} activeRole={governanceRole} />
          )}

          <AdminModal
            open={true} asPageView={true} onClose={p.onBackToMap}
            adminUnlocked={ui.adminUnlocked} setAdminUnlocked={ui.setAdminUnlocked}
            adminPassInput={ui.adminPassInput} setAdminPassInput={ui.setAdminPassInput}
            adminPassError={ui.adminPassError} onAdminLogin={crudActions.handleAdminLogin}
            adminTab={ui.adminTab} setAdminTab={ui.setAdminTab}
            sponsorRequests={ui.sponsorRequests} buyerLeads={ui.buyerLeads}
            totalLiveBargainsCount={p.totalLiveBargainsCount} neighborhoods={mergedNeighborhoods} activeCity={p.activeCity}
            onAdminApproveSponsor={crudActions.handleAdminApproveSponsor} onAdminDeleteSponsorRequest={crudActions.handleAdminDeleteSponsorRequest}
            onDownloadBuyerLeadsCsv={crudActions.handleDownloadBuyerLeadsCsv}
            onAdminDeleteBargain={crudActions.handleAdminDeleteBargain} onAdminApproveBargain={crudActions.handleAdminApproveBargain}
            adminEditHoodId={ui.adminEditHoodId} setAdminEditHoodId={ui.setAdminEditHoodId}
            adminEditBuySqm={ui.adminEditBuySqm} setAdminEditBuySqm={ui.setAdminEditBuySqm}
            adminEditRahn80m={ui.adminEditRahn80m} setAdminEditRahn80m={ui.setAdminEditRahn80m}
            adminPriceSavedMsg={ui.adminPriceSavedMsg} onAdminQuickPriceSave={crudActions.handleAdminQuickPriceSave}
            deepSyncing={ui.deepSyncing} onDeepWebSync={p.handleDeepWebSync}
            newAdminPassword={ui.newAdminPassword} setNewAdminPassword={ui.setNewAdminPassword}
            adminPassChangeMsg={ui.adminPassChangeMsg} onAdminChangePassword={crudActions.handleAdminChangePassword}
            systemHealth={ui.systemHealth} loadingSystemHealth={ui.loadingSystemHealth} onRefreshSystemHealth={fetchSystemHealth}
            featureFlags={p.featureFlags} onToggleFeatureFlag={crudActions.handleToggleFeatureFlag}
            onDownloadFullBackupJson={crudActions.handleDownloadFullBackupJson} onRestoreFullBackupJson={crudActions.handleRestoreFullBackupJson}
            backupStatusMsg={ui.backupStatusMsg} isVerifiedAdmin={p.isVerifiedAdmin} currentUserEmail={p.currentUser?.email || null}
            onGoogleSignIn={() => {
              ui.setAdminPassError('');
              signInWithPopup(auth, googleProvider).catch((err) =>
                ui.setAdminPassError(
                  err?.code === 'auth/popup-blocked'
                    ? 'پنجره ورود گوگل توسط مرورگر مسدود شد؛ لطفاً مسدودکننده پاپ‌آپ را غیرفعال کنید.'
                    : err?.code === 'auth/popup-closed-by-user'
                      ? 'پنجره ورود گوگل بسته شد.'
                      : 'خطا در ورود با حساب گوگل؛ لطفاً دوباره تلاش کنید.',
                ),
              );
            }}
            onExtendSponsor30Days={crudActions.handleExtendSponsor30Days} onReleaseHoodSponsor={crudActions.handleReleaseHoodSponsor}
            mapTileStyle={p.mapTileStyle} onSelectMapTileStyle={p.setMapTileStyle}
            onRetryNeshan={triggerManualNeshanRetry} isFallbackActive={readPersistedFallbackCircuit()}
          />
        </section>
      </div>
    </div>
  );
};
