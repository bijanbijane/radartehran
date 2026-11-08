import React, { useState } from 'react';
import {
  User, Heart, Shield, LogIn, LogOut,
  MapPin, CheckCircle2, SlidersHorizontal, ArrowLeftRight, Scale, Download, Trash2
} from 'lucide-react';
import type { User as FirebaseUser } from 'firebase/auth';
import type { EvaluatedNeighborhood } from '../../data/neighborhoods';
import { toPersianNum } from '../../data/neighborhoods';
import { convertPricePerSqmToUnit, formatMillionTomanAsIntlCurrency, type PrimaryViewId } from '../../utils/areaUnit';
import { useAreaUnit, useIntlCurrency, useRadarLocale } from '../AreaUnitToggle';
import { aggregateNeighborhoodMarketMetrics } from '../../data/realMarketPriceAggregator';
import { updateMapAdvancedOverlayState, useMapAdvancedOverlayState } from '../mapAdvancedLayers';

const CLIENT_STORAGE_KEYS_FALLBACK = [
  'tehran_housing_radar_v35_neighborhoods', 'tehran_radar_feature_flags_v35', 'tehran_radar_visited_homes_v1',
  'tehran_radar_favorite_hoods_v1', 'tehran_radar_recent_searches_v1', 'tehran_radar_area_unit_v1', 'tehran_radar_intl_currency_v1',
] as const;

export interface ProductUserSpaceViewProps {
  currentUser: FirebaseUser | null; onGoogleSignIn: () => void; onSignOut: () => void; isVerifiedAdmin: boolean;
  onOpenAdminModal: () => void; favoriteHoodIds: number[]; onToggleFavorite: (id: number) => void;
  evaluatedNeighborhoods: EvaluatedNeighborhood[]; selectedHood?: EvaluatedNeighborhood;
  onSelectNeighborhood: (hood: EvaluatedNeighborhood) => void; onOpenInspector: (hood: EvaluatedNeighborhood) => void;
  onOpenShortlistMatrix?: () => void; onNavigateView?: (view: PrimaryViewId) => void;
  onOpenBuyerAlertModal: () => void; visitedHomesCount: number; onOpenVisitedModal: () => void;
  mode: 'rent' | 'buy'; deposit: number; monthlyRent: number; buyTotalBudget: number; targetSqm: number;
  onOpenBudgetFilter: () => void;
}

export function ProductUserSpaceView(p: ProductUserSpaceViewProps): React.ReactElement {
  const [areaUnit] = useAreaUnit(), [intlCurrency] = useIntlCurrency(), [radarLocale] = useRadarLocale();
  const [busyAction, setBusyAction] = useState<'export' | 'delete' | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [privacyNotice, setPrivacyNotice] = useState<string | null>(null);
  const isEn = radarLocale === 'en';
  const { comparisonArc } = useMapAdvancedOverlayState();
  const favoriteHoods = p.evaluatedNeighborhoods.filter((h) => p.favoriteHoodIds.includes(h.id));
  const budgetFx = intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(p.mode === 'buy' ? p.buyTotalBudget : p.deposit, intlCurrency, radarLocale)})` : '';
  const avgShortlistScore = favoriteHoods.length > 0 ? (favoriteHoods.reduce((acc, h) => acc + h.overallScore, 0) / favoriteHoods.length).toFixed(1) : null;

  const handleExportAccountData = async () => {
    if (!p.currentUser || busyAction) return;
    setBusyAction('export'); setPrivacyNotice(null);
    try {
      const token = await p.currentUser.getIdToken();
      const res = await fetch('/api/account/export-data', { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.exportData) {
        const blob = new Blob([JSON.stringify(data.exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = `radar-account-export-${p.currentUser.uid.slice(0, 8)}.json`; a.click();
        URL.revokeObjectURL(url); setPrivacyNotice('فایل JSON اطلاعات حساب شما آماده و دانلود شد.');
      } else { setPrivacyNotice('خطا در دریافت خروجی اطلاعات حساب.'); }
    } catch { setPrivacyNotice('ارتباط با سرور برای دریافت اطلاعات برقرار نشد.'); } finally { setBusyAction(null); }
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
        setConfirmDeleteOpen(false); p.onSignOut();
      } else { setPrivacyNotice(data?.message || 'حذف حساب کاربری انجام نشد.'); }
    } catch { setPrivacyNotice('خطا در اجرای درخواست حذف حساب کاربری.'); } finally { setBusyAction(null); }
  };

  return (
    <div className="w-full max-w-5xl mx-auto px-4 py-6 space-y-7 animate-fadeIn" data-testid="product-userspace-view">
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
                <button type="button" onClick={handleExportAccountData} disabled={busyAction !== null} className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"><Download className="w-3.5 h-3.5" /><span>دانلود اطلاعات حساب من</span></button>
                <button type="button" onClick={() => setConfirmDeleteOpen((v) => !v)} disabled={busyAction !== null} className="px-3 py-2 rounded-xl bg-rose-50 dark:bg-rose-950/60 hover:bg-rose-100 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"><Trash2 className="w-3.5 h-3.5" /><span>حذف کامل حساب کاربری</span></button>
                <button type="button" onClick={p.onSignOut} className="px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"><LogOut className="w-3.5 h-3.5" /><span>{isEn ? 'Sign Out' : 'خروج از حساب'}</span></button>
              </>
            ) : (
              <button type="button" onClick={p.onGoogleSignIn} className="px-4 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-xs"><LogIn className="w-3.5 h-3.5" /><span>{isEn ? 'Sign in with Google' : 'ورود با حساب گوگل'}</span></button>
            )}
            <button type="button" onClick={p.onOpenAdminModal} className="px-3.5 py-2 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-700 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer hover:bg-amber-100"><Shield className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" /><span>{isEn ? 'Admin & Monitoring (No Password)' : 'پنل مدیریت و مانیتورینگ (بررسی بدون رمز)'}</span></button>
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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            <span className="text-[11px] text-slate-400 block font-medium">{isEn ? 'Your Active Budget:' : 'مبنای بودجه شما:'}</span>
            <strong className="text-sm font-black text-slate-900 dark:text-white tabular-nums mt-0.5 block">{p.mode === 'buy' ? `${toPersianNum(p.buyTotalBudget)} م خرید` : `${toPersianNum(p.deposit)}م / ${toPersianNum(p.monthlyRent)}م`}<span className="text-[10px] font-normal text-slate-500">{budgetFx}</span></strong>
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
      </div>

      {/* Saved Favorites Section */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
              <Heart className="w-4 h-4 text-rose-500 fill-rose-500" />
              <span>{isEn ? `Saved Neighborhoods (${favoriteHoods.length})` : `محله‌های نشان‌شده شما (${toPersianNum(favoriteHoods.length)})`}</span>
            </h2>
            {avgShortlistScore && (
              <span className="text-[11px] px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold">
                میانگین امتیاز: {toPersianNum(avgShortlistScore)}/۱۰
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {favoriteHoods.length >= 2 && p.onOpenShortlistMatrix && (
              <button type="button" onClick={p.onOpenShortlistMatrix} className="px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-xs font-extrabold flex items-center gap-1.5 transition cursor-pointer">
                <ArrowLeftRight className="w-3.5 h-3.5 text-emerald-600" /><span>{isEn ? 'Shortlist Decision Matrix' : 'ماتریس مقایسه منتخب‌ها'}</span>
              </button>
            )}
            <span className="text-xs text-slate-400 hidden sm:inline">{isEn ? 'Click any card to center live map' : 'کلیک روی هر کارت، نقشه زنده را متمرکز می‌کند'}</span>
          </div>
        </div>

        {favoriteHoods.length === 0 ? (
          <div className="p-8 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center space-y-4">
            <Heart className="w-8 h-8 text-slate-300 dark:text-slate-700 mx-auto" />
            <div className="space-y-1">
              <p className="text-xs text-slate-700 dark:text-slate-300 font-bold">{isEn ? 'No saved neighborhoods in your shortlist yet.' : 'هنوز هیچ محله‌ای را به لیست منتخب‌های خود اضافه نکرده‌اید.'}</p>
              <p className="text-[11px] text-slate-400">{isEn ? 'Bookmark neighborhoods to unlock the multi-criteria comparison matrix and track v6.4 closing prices.' : 'با نشان کردن محله‌ها، ماتریس مقایسه تحلیلی فعال می‌شود و تغییرات قیمت را رصد خواهید کرد.'}</p>
            </div>
            {p.evaluatedNeighborhoods.filter((h) => h.status === 'green').length > 0 && (
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80">
                <span className="text-[11px] font-bold text-slate-400 block mb-2">{isEn ? 'Quick picks matching your budget:' : 'پیشنهاد سریع متناسب با بودجه شما:'}</span>
                <div className="flex flex-wrap items-center justify-center gap-1.5">
                  {p.evaluatedNeighborhoods.filter((h) => h.status === 'green').slice(0, 3).map((h) => (
                    <button key={h.id} type="button" onClick={() => p.onToggleFavorite(h.id)} className="px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 text-xs font-bold transition flex items-center gap-1 cursor-pointer">
                      <span>+ {h.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {p.onNavigateView && (
              <div className="flex items-center justify-center gap-2 pt-1">
                <button type="button" onClick={() => p.onNavigateView?.('discover')} className="px-3.5 py-1.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold transition cursor-pointer">
                  {isEn ? 'Explore Neighborhoods' : 'کشف و فیلتر محله‌ها'}
                </button>
                <button type="button" onClick={() => p.onNavigateView?.('map')} className="px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold transition cursor-pointer">
                  {isEn ? 'Open Live Map' : 'کاوش روی نقشه زنده'}
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {favoriteHoods.map((hood) => {
              const unitBuy = convertPricePerSqmToUnit(hood.buyPerSqm, areaUnit);
              const unitDeal = convertPricePerSqmToUnit(aggregateNeighborhoodMarketMetrics(hood.id, hood.name, hood.buyPerSqm, []).estimatedDealPricePerSqm, areaUnit);
              const isSelected = p.selectedHood?.id === hood.id;
              const isArcActive = p.selectedHood && comparisonArc.active && ((comparisonArc.hoodA?.id === p.selectedHood.id && comparisonArc.hoodB?.id === hood.id) || (comparisonArc.hoodB?.id === p.selectedHood.id && comparisonArc.hoodA?.id === hood.id));

              return (
                <div key={hood.id} className={`p-5 rounded-2xl bg-white dark:bg-slate-900 border transition flex flex-col justify-between ${isSelected ? 'border-emerald-500 ring-2 ring-emerald-500/20' : 'border-slate-200 dark:border-slate-800 hover:border-slate-400 dark:hover:border-slate-600'}`}>
                  <div className="flex items-start justify-between">
                    <div role="button" tabIndex={0} onClick={() => p.onSelectNeighborhood(hood)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); p.onSelectNeighborhood(hood); } }} className="cursor-pointer">
                      <div className="flex items-center gap-1.5">
                        <h3 className="font-black text-slate-900 dark:text-white text-sm">محله {hood.name}</h3>
                        {isSelected && <span className="px-1.5 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold">فعال روی نقشه</span>}
                      </div>
                      <span className="text-[11px] text-slate-400">{hood.zone} · امتیاز {toPersianNum(hood.overallScore)}/۱۰</span>
                    </div>
                    <button type="button" onClick={(e) => { e.stopPropagation(); p.onToggleFavorite(hood.id); }} aria-label={`حذف ${hood.name} از منتخب‌ها`} className="text-rose-500 hover:text-rose-600 p-1 cursor-pointer">
                      <Heart className="w-4 h-4 fill-rose-500" />
                    </button>
                  </div>

                  <div className="py-3 my-3 border-y border-slate-100 dark:border-slate-800 grid grid-cols-2 text-xs tabular-nums">
                    <div>
                      <span className="text-[10px] text-slate-400 block font-medium">اعلامی / معامله v6.4:</span>
                      <strong className="text-slate-900 dark:text-white font-black text-sm">
                        {toPersianNum(unitBuy)} <span className="text-emerald-600 dark:text-emerald-400">({toPersianNum(unitDeal)})</span> م.ت{intlCurrency !== 'IRT' ? ` · ${formatMillionTomanAsIntlCurrency(unitDeal, intlCurrency, radarLocale)}` : ''}
                      </strong>
                    </div>
                    <div className="border-r border-slate-100 dark:border-slate-800 pr-3">
                      <span className="text-[10px] text-slate-400 block font-medium">رهن ۸۰ متر:</span>
                      <strong className="text-emerald-600 dark:text-emerald-400 font-black text-sm">{toPersianNum(hood.rahn80m)} م.ت</strong>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button type="button" onClick={(e) => { e.stopPropagation(); p.onOpenInspector(hood); }} aria-label={`مشاهده کارنامه ${hood.name}`} className="flex-1 py-2 rounded-xl bg-slate-900 dark:bg-white hover:opacity-90 text-white dark:text-slate-900 text-xs font-bold transition cursor-pointer">
                      مشاهده کارنامه محله
                    </button>
                    {!isSelected && p.selectedHood && (
                      <button type="button" onClick={(e) => { e.stopPropagation(); updateMapAdvancedOverlayState({ comparisonArc: { active: !isArcActive, isPinned: !isArcActive, hoodA: p.selectedHood!, hoodB: hood } }); }} title={`ترسیم کمان مقایسه با ${p.selectedHood.name} روی نقشه`} aria-label={`کمان مقایسه ${hood.name} روی نقشه`} className={`p-2 rounded-xl border text-xs transition cursor-pointer ${isArcActive ? 'bg-indigo-600 text-white border-indigo-600' : 'border-slate-200 dark:border-slate-700 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50'}`}>
                        <Scale className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {p.onNavigateView && (
                      <button type="button" onClick={(e) => { e.stopPropagation(); p.onSelectNeighborhood(hood); p.onNavigateView?.('map'); }} aria-label={`نمایش ${hood.name} روی نقشه`} className="px-2.5 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-xs font-bold transition cursor-pointer flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5" /><span>نقشه کامل</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
