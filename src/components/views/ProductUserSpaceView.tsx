import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import { loadAccountWorkspaceSnapshot, recordDataRequest, removeSavedPropertyById } from '../../features/account/services/accountWorkspaceService';
import { AccountOverviewDashboard } from '../../features/account/components/AccountOverviewDashboard';
import { AccountSavedItemsPanel } from '../../features/account/components/AccountSavedItemsPanel';
import { AccountFavoriteNeighborhoodsSection } from '../../features/account/components/AccountFavoriteNeighborhoodsSection';
import { explainNeighborhoodRecommendation } from '../useEvaluatedNeighborhoods';
const CLIENT_STORAGE_KEYS_FALLBACK = ['tehran_housing_radar_v35_neighborhoods', 'tehran_radar_feature_flags_v35', 'tehran_radar_visited_homes_v1', 'tehran_radar_favorite_hoods_v1', 'tehran_radar_recent_searches_v1', 'tehran_radar_area_unit_v1', 'tehran_radar_intl_currency_v1'] as const;
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
  const [privacyNotice, setPrivacyNotice] = useState<string | null>(null);
  const [snapshotRevision, setSnapshotRevision] = useState(0);
  const exportRevokeTimerRef = useRef<number | null>(null);
  useEffect(() => () => { if (exportRevokeTimerRef.current !== null) window.clearTimeout(exportRevokeTimerRef.current); }, []);
  const isEn = radarLocale === 'en';
  const currentTab: AccountSubTabId = p.activeSubTab || 'overview';
  const workspaceSnapshot = useMemo(() => loadAccountWorkspaceSnapshot({
    callerUid: p.currentUser?.uid || 'local-user',
    displayName: p.currentUser?.displayName,
    visitedHomesCount: p.visitedHomesCount,
  }), [p.currentUser?.uid, p.currentUser?.displayName, p.visitedHomesCount, snapshotRevision]);
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

  const handleExportAccountData = async (): Promise<boolean> => {
    if (!p.currentUser || busyAction) return false;
    setBusyAction('export'); setPrivacyNotice(null);
    try {
      const token = await p.currentUser.getIdToken();
      const res = await fetch('/api/account/export-data', { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.exportData) {
        const blob = new Blob([JSON.stringify(data.exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = `radar-account-export-${p.currentUser.uid.slice(0, 8)}.json`; a.click();
        if (exportRevokeTimerRef.current !== null) window.clearTimeout(exportRevokeTimerRef.current);
        exportRevokeTimerRef.current = window.setTimeout(() => { URL.revokeObjectURL(url); exportRevokeTimerRef.current = null; }, 1000);
        setPrivacyNotice('فایل JSON اطلاعات حساب شما آماده و دانلود شد.');
        return true;
      }
      setPrivacyNotice('خطا در دریافت خروجی اطلاعات حساب.');
      return false;
    } catch {
      setPrivacyNotice('ارتباط با سرور برای دریافت اطلاعات برقرار نشد.');
      return false;
    } finally { setBusyAction(null); }
  };

  const handleConfirmAccountDelete = async () => {
    if (!p.currentUser || busyAction) return;
    setBusyAction('delete'); setPrivacyNotice(null);
    try {
      const token = await p.currentUser.getIdToken();
      const res = await fetch('/api/account/delete', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ confirmDelete: true }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok) {
        const keys: readonly string[] = Array.isArray(data?.clearClientLocalStorageKeys) ? data.clearClientLocalStorageKeys : CLIENT_STORAGE_KEYS_FALLBACK;
        try { keys.forEach((k) => window.localStorage.removeItem(k)); } catch { /* ignore */ }
        if (data?.requiresClientAuthDeletion && p.currentUser) {
          try { await deleteUser(p.currentUser); } catch (authErr: unknown) {
            const errCode = (authErr as { code?: string })?.code || '';
            recordDataRequest('delete', 'pending_verification');
            setSnapshotRevision((r) => r + 1);
            setConfirmDeleteOpen(false);
            setPrivacyNotice(errCode === 'auth/requires-recent-login' ? 'داده‌های سرور پاکسازی شدند، اما برای حذف نهایی حساب فایربیس/گوگل به‌دلیل قدیمی‌بودن نشست فعلی، لطفاً یک‌بار خارج شده و دوباره وارد شوید و سپس دکمه حذف را بزنید.' : 'داده‌های سرور پاکسازی شدند، اما حذف خودکار حساب احراز هویت در مرورگر کامل نشد. لطفاً پس از ورود مجدد دوباره امتحان کنید.');
            return;
          }
        }
        recordDataRequest('delete', 'completed');
        setSnapshotRevision((r) => r + 1);
        setConfirmDeleteOpen(false); p.onSignOut();
      } else { setPrivacyNotice(data?.message || 'حذف حساب کاربری انجام نشد.'); }
    } catch { setPrivacyNotice('خطا در اجرای درخواست حذف حساب کاربری.'); } finally { setBusyAction(null); }
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-4 py-6 space-y-7 animate-fadeIn" data-testid="product-userspace-view">
      <div className="p-5 sm:p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 flex flex-col gap-4 shadow-xs">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center font-black text-lg shadow-sm">
              {p.currentUser?.displayName ? p.currentUser.displayName.charAt(0).toUpperCase() : <User className="w-6 h-6 stroke-[2]" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-black text-slate-900 dark:text-white">{p.currentUser?.displayName || (isEn ? 'Guest User Account' : 'حساب کاربری مهمان')}</h1>
                {p.currentUser?.emailVerified && (
                  <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 text-[10.5px] font-bold border border-emerald-200 dark:border-emerald-800">
                    <CheckCircle2 className="w-3 h-3" /><span>{isEn ? 'Verified' : 'تأییدشده'}</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{p.currentUser?.email || (isEn ? 'Sign in to sync saved neighborhoods and price alerts across devices.' : 'برای همگام‌سازی ابری منتخب‌ها و دریافت هشدارهای هوشمند وارد شوید.')}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            {p.currentUser ? (
              <>
                <button type="button" onClick={async () => { const ok = await handleExportAccountData(); if (ok) { recordDataRequest('export', 'completed'); setSnapshotRevision((r) => r + 1); } }} disabled={busyAction !== null} className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"><Download className="w-3.5 h-3.5" /><span>دانلود اطلاعات حساب من</span></button>
                <button type="button" onClick={() => setConfirmDeleteOpen((v) => !v)} disabled={busyAction !== null} className="px-3 py-2 rounded-xl bg-rose-50 dark:bg-rose-950/60 hover:bg-rose-100 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"><Trash2 className="w-3.5 h-3.5" /><span>حذف کامل حساب کاربری</span></button>
                <button type="button" onClick={p.onSignOut} className="px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"><LogOut className="w-3.5 h-3.5" /><span>{isEn ? 'Sign Out' : 'خروج از حساب'}</span></button>
              </>
            ) : (
              <button type="button" onClick={p.onGoogleSignIn} className="px-4 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-xs"><LogIn className="w-3.5 h-3.5" /><span>{isEn ? 'Sign in with Google' : 'ورود با حساب گوگل'}</span></button>
            )}
          </div>
        </div>
        {confirmDeleteOpen && p.currentUser && (
          <div className="p-3.5 rounded-2xl bg-rose-50/90 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
            <span className="text-rose-800 dark:text-rose-200 font-bold">آیا از حذف دائمی حساب کاربری، آگهی‌ها، هشدارهای خرید و فایل‌های رسانه خود اطمینان دارید؟</span>
            <div className="flex items-center gap-2">
              <button type="button" onClick={handleConfirmAccountDelete} disabled={busyAction === 'delete'} className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black cursor-pointer disabled:opacity-50">تأیید نهایی حذف حساب</button>
              <button type="button" onClick={() => setConfirmDeleteOpen(false)} className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 font-bold cursor-pointer">انصراف</button>
            </div>
          </div>
        )}
        {privacyNotice && <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300">{privacyNotice}</p>}
      </div>

      {currentTab !== 'overview' && currentTab !== 'favorites' && (
        <AccountSubSectionsPanel
          activeSubTab={currentTab} currentUser={p.currentUser} evaluatedNeighborhoods={p.evaluatedNeighborhoods} mode={p.mode}
          visitedHomesCount={p.visitedHomesCount} onOpenVisitedModal={p.onOpenVisitedModal} onOpenBuyerAlertModal={p.onOpenBuyerAlertModal}
          onOpenBudgetFilter={p.onOpenBudgetFilter} onNavigateView={p.onNavigateView} onSelectNeighborhood={p.onSelectNeighborhood}
          onRestoreSavedView={p.onRestoreSavedView} onExportAccountData={handleExportAccountData}
          onRequestDeleteAccount={() => setConfirmDeleteOpen(true)} busyAction={busyAction} dataRequestRevision={snapshotRevision}
        />
      )}

      {currentTab === 'overview' && <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            <span className="text-[11px] text-slate-400 block font-medium">{isEn ? 'Your Active Budget:' : 'مبنای بودجه شما:'}</span>
            <strong className="text-sm font-black text-slate-900 dark:text-white tabular-nums mt-0.5 block">{p.mode === 'buy' ? `${toPersianNum(effectiveBuyBudget)} م خرید${p.useLoanBooster ? ' (با وام)' : ''}` : `${toPersianNum(p.deposit)}م / ${toPersianNum(p.monthlyRent)}م (رهن معادل: ${toPersianNum(effectiveRahnPower)}م)`}<span className="text-[10px] font-normal text-slate-500">{budgetFx}</span></strong>
          </div>
          <button type="button" onClick={p.onOpenBudgetFilter} aria-label="تنظیم بودجه" className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"><SlidersHorizontal className="w-4 h-4" /></button>
        </div>
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            <span className="text-[11px] text-slate-400 block font-medium">{isEn ? 'Property Visit Log:' : 'دفترچه بازدیدها:'}</span>
            <strong className="text-sm font-black text-emerald-600 dark:text-emerald-400 tabular-nums mt-0.5 block">{toPersianNum(p.visitedHomesCount)} {isEn ? 'recorded visits' : 'ملک ثبت‌شده'}</strong>
          </div>
          <button type="button" onClick={p.onOpenVisitedModal} aria-label={isEn ? 'Open property visit log' : 'مشاهده دفترچه بازدیدها'} className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold transition cursor-pointer">{isEn ? 'Open Log' : 'مشاهده'}</button>
        </div>
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            <span className="text-[11px] text-slate-400 block font-medium">{isEn ? 'Under-Market Alerts:' : 'پایش فایل‌های زیر قیمت:'}</span>
            <strong className="text-sm font-black text-slate-900 dark:text-white mt-0.5 block">{isEn ? 'Smart Deal Alert' : 'پیامک هوشمند شکار'}</strong>
          </div>
          <button type="button" onClick={p.onOpenBuyerAlertModal} aria-label={isEn ? 'Configure under-market deal alert' : 'ثبت و تنظیم هشدار خرید'} className="px-2.5 py-1.5 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold transition cursor-pointer hover:opacity-90">{isEn ? 'Configure' : 'ثبت هشدار'}</button>
        </div>
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            <span className="text-[11px] text-slate-400 block font-medium">{isEn ? 'Shortlist Average:' : 'میانگین امتیاز منتخب‌ها:'}</span>
            <strong className="text-sm font-black text-slate-900 dark:text-white tabular-nums mt-0.5 block">{avgShortlistScore ? `${toPersianNum(avgShortlistScore)} / ۱۰` : (isEn ? 'No saves' : 'بدون منتخب')}</strong>
          </div>
          {favoriteHoods.length >= 2 && p.onOpenShortlistMatrix ? (
            <button type="button" onClick={p.onOpenShortlistMatrix} aria-label="مقایسه ماتریسی منتخب‌ها" className="p-2 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 transition cursor-pointer"><ArrowLeftRight className="w-4 h-4" /></button>
          ) : (
            <span className="text-[11px] text-slate-400 tabular-nums">{toPersianNum(favoriteHoods.length)} محله</span>
          )}
        </div>
      </div>}

      {currentTab === 'overview' && (
        <AccountOverviewDashboard
          snapshot={workspaceSnapshot}
          favoriteHoodsCount={favoriteHoods.length}
          visitedHomesCount={p.visitedHomesCount}
          onNavigateView={p.onNavigateView}
          onSwitchAccountTab={(tab) => p.onNavigateView?.('userspace', tab)}
        />
      )}

      {currentTab === 'overview' && <SearchHistory variant="chips" title="آخرین محله‌های جست‌وجوشده" evaluatedNeighborhoods={p.evaluatedNeighborhoods} mode={p.mode} onSelectNeighborhood={(_name, matched) => { if (matched) { p.onSelectNeighborhood(matched); p.onNavigateView?.('map'); } }} className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800" />}

      {currentTab === 'favorites' && (
        <AccountSavedItemsPanel
          modeTab="properties_only"
          savedProperties={workspaceSnapshot.savedProperties}
          savedSearches={workspaceSnapshot.savedSearches}
          savedMapViews={workspaceSnapshot.savedMapViews}
          savedMarketAnalyses={workspaceSnapshot.savedMarketAnalyses}
          evaluatedNeighborhoods={p.evaluatedNeighborhoods}
          dealMode={p.mode}
          onRemoveSavedProperty={(id) => { removeSavedPropertyById(id); setSnapshotRevision((r) => r + 1); }}
          onCreateSearchWatchlist={() => {}}
          onChangeSearchCadence={() => {}}
          onDeleteSearchWatchlist={() => {}}
          onDeleteSavedMapView={() => {}}
          onDeleteSavedMarketAnalysis={() => {}}
          onOpenBudgetFilter={p.onOpenBudgetFilter}
          onSelectNeighborhood={p.onSelectNeighborhood}
          onNavigateView={p.onNavigateView}
        />
      )}

      {(currentTab === 'overview' || currentTab === 'favorites') && (
        <>
          {refHood && (
            <div className="text-[11px] text-slate-500 px-1 tabular-nums">
              محله مرجع فعال ({refHood.name}): برآورد سناریو v6.4 (غیرثبتی) هر متر {toPersianNum(refDealSqm)} میلیون تومان
            </div>
          )}
          <AccountFavoriteNeighborhoodsSection
            favoriteHoods={favoriteHoods}
            evaluatedNeighborhoods={p.evaluatedNeighborhoods}
            selectedHood={p.selectedHood}
            activeCity={p.activeCity}
            mode={p.mode}
            isEn={isEn}
            areaUnit={areaUnit}
            intlCurrency={intlCurrency}
            radarLocale={radarLocale}
            avgShortlistScore={avgShortlistScore}
            topFavScore={topFavScore}
            explainByHoodId={favExplainById}
            dealSqmByHoodId={favDealSqmById}
            renderCardHeader={(hood, isSelected, isOtherCity, cityLabel, explain) => (
              <div role="button" tabIndex={0} onClick={() => p.onSelectNeighborhood(hood)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); p.onSelectNeighborhood(hood); } }} className="cursor-pointer">
                <div className="flex items-center gap-1.5">
                  <h3 className="font-black text-slate-900 dark:text-white text-sm">{isOtherCity ? `${cityLabel} · محله ${hood.name}` : `محله ${hood.name}`}</h3>
                  {isSelected && <span className="px-1.5 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold">فعال روی نقشه</span>}
                </div>
                <span className="text-[11px] text-slate-400">{hood.zone} · امتیاز {toPersianNum(hood.overallScore)}/۱۰ {explain.nonCompensatoryWarningsFa[0] ? <strong className="text-amber-600 dark:text-amber-400">· ⚠ {explain.nonCompensatoryWarningsFa[0]}</strong> : null}</span>
              </div>
            )}
            onToggleFavorite={p.onToggleFavorite}
            onSelectNeighborhood={p.onSelectNeighborhood}
            onOpenInspector={p.onOpenInspector}
            onOpenShortlistMatrix={p.onOpenShortlistMatrix}
            onNavigateView={(v) => p.onNavigateView?.(v)}
          />
        </>
      )}
    </div>
  );
}
