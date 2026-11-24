import React, { useCallback, useEffect, useRef, useState } from 'react';
import { User, LogIn, LogOut, CheckCircle2, SlidersHorizontal, ArrowLeftRight, Download, Trash2 } from 'lucide-react';
import { deleteUser, type User as FirebaseUser } from 'firebase/auth';
import type { EvaluatedNeighborhood } from '../../data/neighborhoods';
import { getNeighborhoodMarketReport, getNeighborhoodTrafficInfo, toPersianNum } from '../../data/neighborhoods';
import { type CityId, getAllMultiCityNeighborhoods } from '../../data/multiCityData';
import { formatMillionTomanAsIntlCurrency, type PrimaryViewId } from '../../utils/areaUnit';
import { useAreaUnit, useIntlCurrency, useRadarLocale } from '../AreaUnitToggle';
import { aggregateNeighborhoodMarketMetrics, buildNeighborhoodListingSamples } from '../../data/realMarketPriceAggregator';
import { SearchHistory } from '../SearchHistory';
import { AccountSubSectionsPanel } from '../navigation/AccountSubSectionsPanel';
import type { AccountSubTabId, ModuleSubTabId, SavedMapViewItem } from '../../navigation/registry/route.types';
import {
  ACCOUNT_WORKSPACE_UPDATED_EVENT,
  isStorageKeyForUid,
  resolveEffectiveUid,
  setActiveAccountScopeUid,
} from '../../features/account/services/accountStorageScope';
import { generateStableAccountId } from '../../features/account/services/accountSettingsStorageService';
import { downloadJsonPayloadFile } from '../../features/account/services/accountExportDownloadService';
import {
  buildAccountExportDownloadPayload,
  executeAccountDeletionFlow,
  requestAccountServerExport,
} from '../../features/account/services/accountActionService';
import type { AccountDeleteLayerStatus, AccountWorkspaceSnapshot } from '../../features/account/types/account.types';
import { loadAccountWorkspaceSnapshot, recordDataRequest, removeSavedPropertyById } from '../../features/account/services/accountWorkspaceService';
import { AccountOverviewDashboard } from '../../features/account/components/AccountOverviewDashboard';
import { AccountSavedItemsPanel } from '../../features/account/components/AccountSavedItemsPanel';
import { AccountFavoriteNeighborhoodsSection } from '../../features/account/components/AccountFavoriteNeighborhoodsSection';
import { AccountSidebarNav } from '../../features/account/components/AccountSidebarNav';
import { explainNeighborhoodRecommendation } from '../useEvaluatedNeighborhoods';
export interface ProductUserSpaceViewProps {
  currentUser: FirebaseUser | null; onGoogleSignIn: () => void; onSignOut: () => void;
  favoriteHoodIds: number[]; onToggleFavorite: (id: number) => void;
  evaluatedNeighborhoods: EvaluatedNeighborhood[]; nationwideEvaluatedNeighborhoods?: EvaluatedNeighborhood[];
  activeCity?: CityId; selectedHood?: EvaluatedNeighborhood; activeSubTab?: AccountSubTabId;
  onSelectNeighborhood: (hood: EvaluatedNeighborhood) => void; onOpenInspector: (hood: EvaluatedNeighborhood) => void;
  onOpenShortlistMatrix?: () => void; onNavigateView?: (view: PrimaryViewId, subTab?: ModuleSubTabId) => void;
  onOpenBuyerAlertModal: () => void; visitedHomesCount: number; onOpenVisitedModal: () => void;
  mode: 'rent' | 'buy'; deposit: number; monthlyRent: number; buyTotalBudget: number; targetSqm: number;
  totalRahnEquivalent?: number; useLoanBooster?: boolean; onOpenBudgetFilter: () => void;
  onRestoreSavedView?: (view: SavedMapViewItem) => void;
}
export function ProductUserSpaceView(p: ProductUserSpaceViewProps): React.ReactElement {
  const [areaUnit] = useAreaUnit(), [intlCurrency] = useIntlCurrency(), [radarLocale] = useRadarLocale();
  const [busyAction, setBusyAction] = useState<'export' | 'delete' | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [privacyNotice, setPrivacyNotice] = useState<{ kind: 'info' | 'error'; text: string } | null>(null);
  const [deleteLayers, setDeleteLayers] = useState<AccountDeleteLayerStatus | null>(null);
  const [dataRequestRevision, setDataRequestRevision] = useState(0);
  const effectiveUid = resolveEffectiveUid(p.currentUser?.uid ?? null);
  const effectiveDisplayName = p.currentUser?.displayName ?? null;
  const syncKey = `${effectiveUid}|${effectiveDisplayName ?? ''}|${p.visitedHomesCount}`;
  const lastSyncKeyRef = useRef(syncKey);
  const downloadCancelRef = useRef<(() => void) | null>(null);
  const [workspaceSnapshot, setWorkspaceSnapshot] = useState<AccountWorkspaceSnapshot>(() => {
    setActiveAccountScopeUid(p.currentUser?.uid ?? null);
    return loadAccountWorkspaceSnapshot({ callerUid: effectiveUid, displayName: effectiveDisplayName, visitedHomesCount: p.visitedHomesCount });
  });
  const refreshWorkspace = useCallback(() => {
    setActiveAccountScopeUid(p.currentUser?.uid ?? null);
    setWorkspaceSnapshot(loadAccountWorkspaceSnapshot({ callerUid: effectiveUid, displayName: effectiveDisplayName, visitedHomesCount: p.visitedHomesCount }));
  }, [p.currentUser?.uid, effectiveUid, effectiveDisplayName, p.visitedHomesCount]);
  useEffect(() => { if (lastSyncKeyRef.current !== syncKey) { lastSyncKeyRef.current = syncKey; refreshWorkspace(); } }, [syncKey, refreshWorkspace]);
  useEffect(() => {
    const onStorage = (ev: StorageEvent) => { if (!ev.key || isStorageKeyForUid(ev.key, effectiveUid)) refreshWorkspace(); };
    const onEvent = (ev: Event) => { if (!(ev as CustomEvent<{ uid?: string }>)?.detail?.uid || (ev as CustomEvent<{ uid?: string }>).detail.uid === effectiveUid) refreshWorkspace(); };
    window.addEventListener('storage', onStorage);
    window.addEventListener(ACCOUNT_WORKSPACE_UPDATED_EVENT, onEvent);
    return () => { window.removeEventListener('storage', onStorage); window.removeEventListener(ACCOUNT_WORKSPACE_UPDATED_EVENT, onEvent); };
  }, [effectiveUid, refreshWorkspace]);
  useEffect(() => () => { if (downloadCancelRef.current) downloadCancelRef.current(); }, []);
  const isEn = radarLocale === 'en';
  const currentTab: AccountSubTabId = p.activeSubTab || 'overview';
  const refHood = p.selectedHood || p.evaluatedNeighborhoods[0];
  const refDealSqm = refHood ? aggregateNeighborhoodMarketMetrics(refHood.id, refHood.name, refHood.buyPerSqm, buildNeighborhoodListingSamples(refHood)).estimatedDealPricePerSqm : 0;
  const effectiveBuyBudget = p.buyTotalBudget + (p.useLoanBooster ? 1200 : 0);
  const effectiveRahnPower = p.totalRahnEquivalent ?? (p.deposit + Math.round((p.monthlyRent * 100) / 3) + (p.useLoanBooster ? 400 : 0));
  const allMultiCityHoods = getAllMultiCityNeighborhoods();
  const safeSqm = Math.max(25, Number(p.targetSqm) || 80);
  const favoriteHoods = p.favoriteHoodIds.map((id) => {
    const ev = p.evaluatedNeighborhoods.find((h) => h.id === id) || p.nationwideEvaluatedNeighborhoods?.find((h) => h.id === id);
    if (ev) return ev;
    const raw = allMultiCityHoods.find((h) => h.id === id);
    if (!raw) return null;
    const ratio = p.mode === 'rent' ? Math.round(raw.rahn80m * (safeSqm / 80)) / Math.max(1, effectiveRahnPower) : (raw.buyPerSqm * safeSqm) / Math.max(1, effectiveBuyBudget);
    return { ...raw, baseBuyPerSqm: raw.buyPerSqm, overallScore: Math.round(((raw.air + raw.powerWater + raw.internet + raw.metro + raw.security + raw.flatTerrain) / 6) * 10) / 10, status: ratio <= 1.0 ? ('green' as const) : ratio <= 1.15 ? ('yellow' as const) : ('red' as const), diffPercent: Math.round((ratio - 1) * 100), distKm: null, trafficInfo: getNeighborhoodTrafficInfo(raw), marketReport: getNeighborhoodMarketReport(raw) } satisfies EvaluatedNeighborhood;
  }).filter((h): h is EvaluatedNeighborhood => Boolean(h));
  const topFavScore = favoriteHoods.length > 0 ? Math.max(...favoriteHoods.map((h) => h.overallScore)) : undefined;
  const favExplainById = new Map(favoriteHoods.map((hood) => [hood.id, explainNeighborhoodRecommendation(hood, { mode: p.mode, topReferenceScore: topFavScore })]));
  const favDealSqmById = new Map(favoriteHoods.map((hood) => [hood.id, aggregateNeighborhoodMarketMetrics(hood.id, hood.name, hood.buyPerSqm, buildNeighborhoodListingSamples(hood)).estimatedDealPricePerSqm]));
  const budgetFx = intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(p.mode === 'buy' ? effectiveBuyBudget : effectiveRahnPower, intlCurrency, radarLocale)})` : '';
  const avgShortlistScore = favoriteHoods.length > 0 ? (favoriteHoods.reduce((acc, h) => acc + h.overallScore, 0) / favoriteHoods.length).toFixed(1) : null;
  const handleExportAccountData = async (includeLocalWorkspace = false): Promise<boolean> => {
    if (!p.currentUser || busyAction) return false;
    setBusyAction('export'); setPrivacyNotice(null); setDeleteLayers(null);
    const scope = includeLocalWorkspace ? 'combined_account_and_workspace' : 'server_account';
    const requestId = generateStableAccountId('dreq');
    try {
      const serverRes = await requestAccountServerExport({ getToken: () => p.currentUser!.getIdToken(), expectedUid: p.currentUser.uid });
      if (serverRes.ok === false) {
        const failRes = serverRes as Extract<typeof serverRes, { ok: false }>;
        recordDataRequest('export', 'failed', { uid: effectiveUid, requestId, scope, errorCode: failRes.code, retentionNotesFa: failRes.messageFa });
        setDataRequestRevision((r) => r + 1); refreshWorkspace();
        setPrivacyNotice({ kind: 'error', text: failRes.messageFa });
        return false;
      }
      recordDataRequest('export', 'ready', { uid: effectiveUid, requestId, scope });
      const built = buildAccountExportDownloadPayload({ serverData: serverRes.data, uid: p.currentUser.uid, includeLocalWorkspace });
      if (downloadCancelRef.current) downloadCancelRef.current();
      const dl = downloadJsonPayloadFile(built.payload, { scope: built.scope });
      downloadCancelRef.current = dl.cancelRevokeTimer ?? null;
      if (!dl.ok) {
        recordDataRequest('export', 'failed', { uid: effectiveUid, requestId, scope: built.scope, errorCode: dl.code, retentionNotesFa: dl.messageFa });
        setDataRequestRevision((r) => r + 1); refreshWorkspace();
        setPrivacyNotice({ kind: 'error', text: dl.messageFa || 'دانلود فایل خروجی در مرورگر انجام نشد.' });
        return false;
      }
      const partialMsg = built.isPartialExport ? ` (هشدار: خروجی جزئی؛ منابع غیرقابل‌دسترس: ${built.unavailableSources.join('، ')})` : '';
      recordDataRequest('export', 'completed', { uid: effectiveUid, requestId, scope: built.scope, retentionNotesFa: `فایل خروجی ${built.scope === 'combined_account_and_workspace' ? 'سرور + فضای محلی' : 'سرور'} با تفکیک منشأ آماده و دانلود شد${partialMsg}.` });
      setDataRequestRevision((r) => r + 1); refreshWorkspace();
      setPrivacyNotice({ kind: 'info', text: `فایل JSON اطلاعات حساب آماده و دانلود شد${partialMsg}.` });
      return true;
    } finally { setBusyAction(null); }
  };
  const handleConfirmAccountDelete = async () => {
    if (!p.currentUser || busyAction) return;
    setBusyAction('delete'); setPrivacyNotice(null); setDeleteLayers(null);
    const requestId = generateStableAccountId('dreq');
    try {
      const res = await executeAccountDeletionFlow({ currentUser: p.currentUser, deleteFirebaseUserFn: (u) => deleteUser(u as FirebaseUser) });
      if (res.ok === false && !res.data) {
        const failRes = res as Extract<typeof res, { ok: false }>;
        recordDataRequest('delete', 'failed', { uid: effectiveUid, requestId, errorCode: failRes.code, retentionNotesFa: failRes.messageFa });
        setDataRequestRevision((r) => r + 1); refreshWorkspace();
        setPrivacyNotice({ kind: 'error', text: failRes.messageFa });
        return;
      }
      if (!res.data) return;
      const failCode = res.ok === false ? (res as Extract<typeof res, { ok: false }>).code : undefined;
      setDeleteLayers(res.data);
      recordDataRequest('delete', res.data.requestStatus, { uid: effectiveUid, requestId, errorCode: failCode, retentionNotesFa: res.data.messageFa });
      setDataRequestRevision((r) => r + 1); refreshWorkspace();
      setConfirmDeleteOpen(false);
      setPrivacyNotice({ kind: res.ok ? 'info' : 'error', text: res.data.messageFa });
      if (res.data.requiresSignOut) p.onSignOut();
    } finally { setBusyAction(null); }
  };
  return (
    <div className="w-full max-w-[1320px] mx-auto px-4 py-6 animate-fadeIn flex flex-col lg:flex-row gap-6 items-start" data-testid="product-userspace-view">
      <AccountSidebarNav currentTab={currentTab} onSelectTab={(tab) => p.onNavigateView?.('userspace', tab)} />
      <div className="flex-1 min-w-0 w-full space-y-6">
      <div className="p-5 sm:p-6 rounded-2xl bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] flex flex-col gap-4 shadow-xs">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-[var(--color-brand-600)] text-white flex items-center justify-center font-bold text-lg shadow-sm shrink-0">
              {p.currentUser?.displayName ? p.currentUser.displayName.charAt(0).toUpperCase() : <User className="w-6 h-6 stroke-[2]" />}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl sm:text-[28px] font-bold leading-[1.35] text-[var(--color-text-primary)]">{p.currentUser?.displayName || (isEn ? 'Guest User Account' : 'حساب کاربری مهمان')}</h1>
                {p.currentUser?.emailVerified && (
                  <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md bg-[var(--color-brand-soft)] text-[var(--color-brand-700)] dark:text-emerald-300 text-xs font-bold border border-[var(--color-border-subtle)]">
                    <CheckCircle2 className="w-3.5 h-3.5" /><span>{isEn ? 'Verified' : 'تأییدشده'}</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{p.currentUser?.email || (isEn ? 'Sign in to sync saved neighborhoods and price alerts across devices.' : 'برای همگام‌سازی ابری منتخب‌ها و دریافت هشدارهای هوشمند وارد شوید.')}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            {p.currentUser ? (
              <>
                <button type="button" onClick={() => void handleExportAccountData(false)} disabled={busyAction !== null} className="min-h-[44px] md:min-h-[36px] px-3 py-2 rounded-xl bg-[var(--color-bg-muted)] hover:bg-[var(--color-border-subtle)] text-[var(--color-text-primary)] text-xs font-bold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"><Download className="w-3.5 h-3.5" /><span>دانلود اطلاعات حساب من</span></button>
                <button type="button" onClick={() => setConfirmDeleteOpen((v) => !v)} disabled={busyAction !== null} className="min-h-[44px] md:min-h-[36px] px-3 py-2 rounded-xl bg-rose-50 dark:bg-rose-950/60 hover:bg-rose-100 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"><Trash2 className="w-3.5 h-3.5" /><span>حذف کامل حساب کاربری</span></button>
                <button type="button" onClick={p.onSignOut} className="min-h-[44px] md:min-h-[36px] px-3.5 py-2 rounded-xl bg-[var(--color-bg-muted)] hover:bg-[var(--color-border-subtle)] text-[var(--color-text-primary)] text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"><LogOut className="w-3.5 h-3.5" /><span>{isEn ? 'Sign Out' : 'خروج از حساب'}</span></button>
              </>
            ) : (
              <button type="button" onClick={p.onGoogleSignIn} className="min-h-[44px] md:min-h-[38px] px-4 py-2 rounded-xl bg-[var(--color-brand-600)] hover:bg-[var(--color-brand-700)] text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-xs"><LogIn className="w-3.5 h-3.5" /><span>{isEn ? 'Sign in with Google' : 'ورود با حساب گوگل'}</span></button>
            )}
          </div>
        </div>
        {currentTab === 'overview' && (
          <div className="pt-3 border-t border-[var(--color-border-subtle)] flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="text-[var(--color-text-secondary)] tabular-nums">
              بودجه فعال:{' '}
              <strong className="text-[var(--color-text-primary)]">
                {p.mode === 'buy'
                  ? `${toPersianNum(effectiveBuyBudget)} م خرید${p.useLoanBooster ? ' (با وام)' : ''}`
                  : `${toPersianNum(p.deposit)}م / ${toPersianNum(p.monthlyRent)}م (رهن معادل: ${toPersianNum(effectiveRahnPower)}م)`}
              </strong>
              {budgetFx ? <span className="text-[var(--color-text-muted)]">{budgetFx}</span> : null}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={p.onOpenBudgetFilter} className="min-h-[40px] md:min-h-[34px] px-3 py-1 rounded-lg border border-[var(--color-border-strong)] text-[var(--color-text-primary)] hover:bg-[var(--color-bg-muted)] font-bold inline-flex items-center gap-1.5 cursor-pointer">
                <SlidersHorizontal className="w-3.5 h-3.5" /><span>تنظیم بودجه</span>
              </button>
              <button type="button" onClick={p.onOpenVisitedModal} className="min-h-[40px] md:min-h-[34px] px-3 py-1 rounded-lg border border-[var(--color-border-strong)] text-[var(--color-text-primary)] hover:bg-[var(--color-bg-muted)] font-bold cursor-pointer">
                {isEn ? 'Visit Log' : `دفترچه بازدیدها (${toPersianNum(p.visitedHomesCount)})`}
              </button>
              <button type="button" onClick={p.onOpenBuyerAlertModal} className="min-h-[40px] md:min-h-[34px] px-3 py-1 rounded-lg bg-[var(--color-brand-soft)] text-[var(--color-brand-700)] dark:text-emerald-300 font-bold cursor-pointer">
                {isEn ? 'Deal Alert' : 'ثبت هشدار شکار'}
              </button>
              {favoriteHoods.length >= 2 && p.onOpenShortlistMatrix && (
                <button type="button" onClick={p.onOpenShortlistMatrix} aria-label="مقایسه ماتریسی منتخب‌ها" className="min-h-[40px] md:min-h-[34px] px-3 py-1 rounded-lg border border-[var(--color-border-strong)] text-[var(--color-brand-600)] dark:text-emerald-300 font-bold inline-flex items-center gap-1 cursor-pointer">
                  <ArrowLeftRight className="w-3.5 h-3.5" /><span>مقایسه منتخب‌ها</span>
                </button>
              )}
            </div>
          </div>
        )}
        {confirmDeleteOpen && p.currentUser && (
          <div className="p-3.5 rounded-2xl bg-rose-50/90 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
            <span className="text-rose-800 dark:text-rose-200 font-bold">آیا از حذف دائمی حساب کاربری، آگهی‌ها، هشدارهای خرید و فایل‌های رسانه خود اطمینان دارید؟</span>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => void handleConfirmAccountDelete()} disabled={busyAction === 'delete'} className="min-h-[40px] px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold cursor-pointer disabled:opacity-50">تأیید نهایی حذف حساب</button>
              <button type="button" onClick={() => setConfirmDeleteOpen(false)} className="min-h-[40px] px-3 py-1.5 rounded-xl bg-[var(--color-bg-surface)] text-[var(--color-text-primary)] border border-[var(--color-border-strong)] font-bold cursor-pointer">انصراف</button>
            </div>
          </div>
        )}
        {deleteLayers && (
          <div className="p-3 rounded-xl bg-[var(--color-bg-muted)] border border-[var(--color-border-subtle)] flex flex-wrap gap-2 text-xs font-bold">
            <span>حذف داده‌های سرور: {deleteLayers.serverDeletion === 'completed' ? 'کامل' : 'جزئی'}</span>
            <span>· پاکسازی محلی حساب ({deleteLayers.removedLocalKeysCount} کلید): {deleteLayers.localCleanup === 'completed' ? 'انجام شد' : 'ناموفق'}</span>
            <span>· هویت حساب: {deleteLayers.authDeletion === 'completed' || deleteLayers.authDeletion === 'not_required' ? 'حذف شد' : deleteLayers.authDeletion === 'requires_reauth' ? 'نیازمند ورود مجدد' : 'ناموفق'}</span>
          </div>
        )}
        {privacyNotice && <p role={privacyNotice.kind === 'error' ? 'alert' : 'status'} className={`text-xs font-bold ${privacyNotice.kind === 'error' ? 'text-rose-700 dark:text-rose-300' : 'text-emerald-700 dark:text-emerald-300'}`}>{privacyNotice.text}</p>}
      </div>
      {currentTab !== 'overview' && currentTab !== 'favorites' && (
        <AccountSubSectionsPanel
          activeSubTab={currentTab} currentUser={p.currentUser} evaluatedNeighborhoods={p.evaluatedNeighborhoods} mode={p.mode}
          visitedHomesCount={p.visitedHomesCount} onOpenVisitedModal={p.onOpenVisitedModal} onOpenBuyerAlertModal={p.onOpenBuyerAlertModal}
          onOpenBudgetFilter={p.onOpenBudgetFilter} onNavigateView={p.onNavigateView} onSelectNeighborhood={p.onSelectNeighborhood}
          onRestoreSavedView={p.onRestoreSavedView} onExportAccountData={handleExportAccountData}
          onRequestDeleteAccount={() => setConfirmDeleteOpen(true)} busyAction={busyAction} dataRequestRevision={dataRequestRevision}
        />
      )}

      {currentTab === 'overview' && (
        <AccountOverviewDashboard snapshot={workspaceSnapshot} isAuthenticated={Boolean(p.currentUser)} favoriteHoodsCount={favoriteHoods.length} visitedHomesCount={p.visitedHomesCount} onNavigateView={p.onNavigateView} onSwitchAccountTab={(tab) => p.onNavigateView?.('userspace', tab)} />
      )}
      {currentTab === 'overview' && <SearchHistory variant="chips" title="آخرین محله‌های جست‌وجوشده" evaluatedNeighborhoods={p.evaluatedNeighborhoods} mode={p.mode} onSelectNeighborhood={(_name, matched) => { if (matched) { p.onSelectNeighborhood(matched); p.onNavigateView?.('map'); } }} className="p-3.5 rounded-2xl bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)]" />}
      {currentTab === 'favorites' && (
        <AccountSavedItemsPanel
          modeTab="properties_only" savedProperties={workspaceSnapshot.savedProperties} savedSearches={workspaceSnapshot.savedSearches}
          savedMapViews={workspaceSnapshot.savedMapViews} savedMarketAnalyses={workspaceSnapshot.savedMarketAnalyses}
          evaluatedNeighborhoods={p.evaluatedNeighborhoods} dealMode={p.mode}
          onRemoveSavedProperty={(id) => { removeSavedPropertyById(id, effectiveUid); refreshWorkspace(); }}
          onCreateSearchWatchlist={() => {}} onChangeSearchCadence={() => {}} onDeleteSearchWatchlist={() => {}}
          onDeleteSavedMapView={() => {}} onDeleteSavedMarketAnalysis={() => {}}
          onOpenBudgetFilter={p.onOpenBudgetFilter} onSelectNeighborhood={p.onSelectNeighborhood} onNavigateView={p.onNavigateView}
        />
      )}
      {(currentTab === 'overview' || currentTab === 'favorites') && (
        <>
          {refHood && (
            <div className="text-xs text-[var(--color-text-muted)] px-1 tabular-nums">
              محله مرجع فعال ({refHood.name}): برآورد معامله (غیرثبتی) هر متر {toPersianNum(refDealSqm)} میلیون تومان
            </div>
          )}
          <AccountFavoriteNeighborhoodsSection
            favoriteHoods={favoriteHoods} evaluatedNeighborhoods={p.evaluatedNeighborhoods} selectedHood={p.selectedHood} activeCity={p.activeCity}
            mode={p.mode} isEn={isEn} areaUnit={areaUnit} intlCurrency={intlCurrency} radarLocale={radarLocale} avgShortlistScore={avgShortlistScore}
            topFavScore={topFavScore} explainByHoodId={favExplainById} dealSqmByHoodId={favDealSqmById}
            renderCardHeader={(hood, isSelected, isOtherCity, cityLabel, explain) => (
              <div role="button" tabIndex={0} onClick={() => p.onSelectNeighborhood(hood)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); p.onSelectNeighborhood(hood); } }} className="cursor-pointer">
                <div className="flex items-center gap-1.5">
                  <h3 className="font-bold text-[var(--color-text-primary)] text-sm">{isOtherCity ? `${cityLabel} · محله ${hood.name}` : `محله ${hood.name}`}</h3>
                  {isSelected && <span className="px-1.5 py-0.5 rounded-md bg-[var(--color-brand-soft)] text-[var(--color-brand-700)] dark:text-emerald-300 text-xs font-bold">فعال روی نقشه</span>}
                </div>
                <span className="text-xs text-[var(--color-text-muted)]">{hood.zone} · امتیاز {toPersianNum(hood.overallScore)}/۱۰ {explain.nonCompensatoryWarningsFa[0] ? <strong className="text-amber-700 dark:text-amber-400">· ⚠ {explain.nonCompensatoryWarningsFa[0]}</strong> : null}</span>
              </div>
            )}
            onToggleFavorite={p.onToggleFavorite} onSelectNeighborhood={p.onSelectNeighborhood} onOpenInspector={p.onOpenInspector}
            onOpenShortlistMatrix={p.onOpenShortlistMatrix} onNavigateView={(v) => p.onNavigateView?.(v)}
          />
        </>
      )}
      </div>
    </div>
  );
}
