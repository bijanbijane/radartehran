import React, { useMemo, useState } from 'react';
import { ArrowLeftRight, Clock, Globe, MapPin, RefreshCw, Scale, ShieldAlert, Smartphone, Sparkles, Wind, X } from 'lucide-react';
import { EvaluatedNeighborhood, MarketPulseData, Neighborhood, POPULAR_SEO_COMPARISONS, toPersianNum } from '../data/neighborhoods';
import { aggregateNeighborhoodMarketMetrics } from '../data/realMarketPriceAggregator';
import { resolveCityIdForNeighborhood } from '../data/multiCityData';
import { recordDiagnosticEvent } from '../utils/security';
import { BuyerAlertPwaLegalModals } from './BuyerAlertPwaLegalModals';
import type { PriceThresholdMatchItem, PriceThresholdSubscription } from './buyerPriceThresholdAlerts';
import { useDialogFocus } from './useDialogFocus';
import { computeSpatialProximityReport, updateMapAdvancedOverlayState } from './mapAdvancedLayers';
import { AreaUnitToggle, useAreaUnit, useRadarLocale, useIntlCurrency } from './AreaUnitToggle';
import { convertPricePerSqmToUnit, formatAreaShort, formatMillionTomanAsIntlCurrency } from '../utils/areaUnit';

export interface SecondaryModalsProps {
  showPulseModal: boolean; setShowPulseModal: React.Dispatch<React.SetStateAction<boolean>>;
  activeCityNameFa?: string; marketPulse: MarketPulseData | null;
  evaluatedNeighborhoods: EvaluatedNeighborhood[]; onSelectNeighborhood: (hood: EvaluatedNeighborhood) => void;
  lastSyncNotice: string; syncingPulse: boolean; onFetchMarketPulse: (forceRefresh?: boolean) => void;
  deepSyncing: boolean; onDeepWebSync: () => void; showSeoDrawer: boolean; setShowSeoDrawer: React.Dispatch<React.SetStateAction<boolean>>;
  selectedHoodId: number; onOpenSeoComparison: (id1: number, id2: number) => void; onTriggerPwaInstall: () => void;
  showBuyerAlertModal: boolean; setShowBuyerAlertModal: React.Dispatch<React.SetStateAction<boolean>>;
  neighborhoods: Neighborhood[]; alertFullName: string; setAlertFullName: React.Dispatch<React.SetStateAction<string>>;
  alertPhone: string; setAlertPhone: React.Dispatch<React.SetStateAction<string>>; alertHoodId: number; setAlertHoodId: React.Dispatch<React.SetStateAction<number>>;
  alertDealType: 'خرید' | 'اجاره'; setAlertDealType: React.Dispatch<React.SetStateAction<'خرید' | 'اجاره'>>;
  alertMaxBudget: string; setAlertMaxBudget: React.Dispatch<React.SetStateAction<string>>; alertSubmitMsg: string;
  onRegisterBuyerAlert: (e: React.FormEvent) => void; isSavingBuyerAlert?: boolean; showPwaModal: boolean;
  setShowPwaModal: React.Dispatch<React.SetStateAction<boolean>>; showLegalModal: boolean; setShowLegalModal: React.Dispatch<React.SetStateAction<boolean>>;
  thresholdSubscriptions?: PriceThresholdSubscription[]; thresholdMatches?: PriceThresholdMatchItem[];
  onAddThresholdSubscription?: (hoodId: number, dealType: 'خرید' | 'اجاره', maxThresholdMillion: number) => void;
  onRemoveThresholdSubscription?: (id: string) => void;
}

export function SecondaryModals({
  showPulseModal, setShowPulseModal, activeCityNameFa = 'تهران', marketPulse, evaluatedNeighborhoods, onSelectNeighborhood,
  lastSyncNotice, syncingPulse, onFetchMarketPulse, deepSyncing, onDeepWebSync, showSeoDrawer, setShowSeoDrawer, selectedHoodId,
  onOpenSeoComparison, onTriggerPwaInstall, showBuyerAlertModal, setShowBuyerAlertModal, neighborhoods, alertFullName,
  setAlertFullName, alertPhone, setAlertPhone, alertHoodId, setAlertHoodId, alertDealType, setAlertDealType, alertMaxBudget,
  setAlertMaxBudget, alertSubmitMsg, onRegisterBuyerAlert, isSavingBuyerAlert = false, showPwaModal, setShowPwaModal,
  showLegalModal, setShowLegalModal, thresholdSubscriptions, thresholdMatches, onAddThresholdSubscription, onRemoveThresholdSubscription,
}: SecondaryModalsProps) {
  const [seoSortBy, setSeoSortBy] = useState<'default' | 'cheapest_buy' | 'cheapest_rent' | 'highest_score' | 'nearest_metro'>('default');
  const [areaUnit] = useAreaUnit(); const [locale] = useRadarLocale(); const [intlCurrency] = useIntlCurrency();
  const intlQuerySuffix = `${areaUnit !== 'sqm' ? `&unit=${areaUnit}` : ''}${intlCurrency !== 'IRT' ? `&currency=${intlCurrency}` : ''}${locale !== 'fa' ? `&lang=${locale}` : ''}`;
  const fmtUnitBuy = (sqmVal: number) => `${areaUnit === 'sqft' ? 'هر ft² ' : 'متری '}${toPersianNum(convertPricePerSqmToUnit(sqmVal, areaUnit))} م${intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(convertPricePerSqmToUnit(sqmVal, areaUnit), intlCurrency, locale)})` : ''}`;
  const fmtUnitRent = (rahnVal: number) => `رهن ${formatAreaShort(80, areaUnit)}: ${toPersianNum(rahnVal)} م · اجاره: ${toPersianNum(Math.round(rahnVal * 0.03))} م${intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(rahnVal, intlCurrency, locale)})` : ''}`;
  const dialogRef = useDialogFocus(showPulseModal || showSeoDrawer, () => { setShowPulseModal(false); setShowSeoDrawer(false); });
  const safeEvaluated = useMemo(() => Array.isArray(evaluatedNeighborhoods) ? evaluatedNeighborhoods : [], [evaluatedNeighborhoods]);

  const sortedSeoNeighborhoods = useMemo(() => {
    const copy = [...safeEvaluated];
    if (seoSortBy === 'cheapest_buy') return copy.sort((a, b) => (a.baseBuyPerSqm ?? a.buyPerSqm) - (b.baseBuyPerSqm ?? b.buyPerSqm));
    if (seoSortBy === 'cheapest_rent') return copy.sort((a, b) => a.rahn80m - b.rahn80m);
    if (seoSortBy === 'highest_score') return copy.sort((a, b) => b.overallScore - a.overallScore);
    if (seoSortBy === 'nearest_metro') {
      return copy.sort((a, b) => {
        const dA = computeSpatialProximityReport(a, resolveCityIdForNeighborhood(a.id)).nearestMetroDistKm;
        const dB = computeSpatialProximityReport(b, resolveCityIdForNeighborhood(b.id)).nearestMetroDistKm;
        return dA - dB;
      });
    }
    return copy;
  }, [safeEvaluated, seoSortBy]);

  return (
    <>
      {showPulseModal && (
        <div role="dialog" aria-modal="true" aria-label={`نبض زنده بازار مسکن و شاخص هوای ${activeCityNameFa}`} onClick={() => setShowPulseModal(false)} className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div ref={dialogRef} tabIndex={-1} onClick={(e) => e.stopPropagation()} className="apple-window-sheet bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white rounded-2xl max-w-2xl w-full p-5 space-y-3.5 text-xs max-h-[88vh] overflow-y-auto focus:outline-none shadow-2xl">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/70 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <span className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0">
                  <Wind className="w-4 h-4 stroke-[1.75]" />
                </span>
                <h3 className="text-sm font-black text-slate-900 dark:text-white">
                  نبض زنده بازار مسکن، شاخص هوای ایستگاه‌های {activeCityNameFa} و زمان‌بند ۲ ساعته
                </h3>
              </div>
              <div className="flex items-center gap-1.5">
                <AreaUnitToggle compact showIntlControls />
                <button type="button" aria-label="بستن نبض بازار" onClick={() => setShowPulseModal(false)} className="p-1.5 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 cursor-pointer transition">
                  <X className="w-4 h-4 stroke-[1.75]" />
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="apple-grouped-card bg-slate-50/70 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 rounded-xl p-3.5 space-y-1.5">
                <div className="text-slate-500 dark:text-slate-400">شاخص آلودگی هوای ایستگاه‌های {activeCityNameFa} (AQI):</div>
                <div className="text-base font-black text-emerald-700 dark:text-emerald-400 tabular-nums">
                  {toPersianNum(marketPulse?.airQuality?.tehranAverageAqi ?? 92)} ({marketPulse?.airQuality?.statusLabel || 'قابل قبول'})
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                  غلظت ذرات PM2.5: {toPersianNum(marketPulse?.airQuality?.tehranPm25 ?? marketPulse?.airQuality?.tehranAveragePm25 ?? 31)} میکروگرم
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  {marketPulse?.airQuality?.dataStatus === 'live' ? 'منبع: داده دریافت‌شده از Open-Meteo' : 'وضعیت: ترکیبی از داده جدید و ذخیره‌شده'}
                </div>
              </div>
              <div className="apple-grouped-card bg-slate-50/70 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 rounded-xl p-3.5 space-y-1.5">
                <div className="text-slate-500 dark:text-slate-400">میانگین وزنی قیمت مسکن کل {activeCityNameFa}:</div>
                <div className="text-base font-black text-slate-900 dark:text-white tabular-nums">
                  {fmtUnitBuy(marketPulse?.marketSummary?.tehranAverageBuyPerSqm || 138)}
                </div>
                <div className="text-[11px] text-emerald-700 dark:text-emerald-400 font-semibold tabular-nums">
                  واحد {formatAreaShort(80, areaUnit)}: {toPersianNum((((marketPulse?.marketSummary?.tehranAverageBuyPerSqm || 138) * 80) / 1000).toFixed(1))} میلیارد{intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency((marketPulse?.marketSummary?.tehranAverageBuyPerSqm || 138) * 80, intlCurrency, locale)})` : ''} · تخمین معامله v6.4: {fmtUnitBuy(aggregateNeighborhoodMarketMetrics(0, activeCityNameFa, marketPulse?.marketSummary?.tehranAverageBuyPerSqm || 138, []).estimatedDealPricePerSqm)}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  const cheapId = marketPulse?.marketSummary?.cheapestNeighborhood?.id || safeEvaluated[safeEvaluated.length - 1]?.id || 23;
                  const h = safeEvaluated.find((n) => n.id === cheapId) || safeEvaluated[0];
                  if (h) { recordDiagnosticEvent('SecondaryModals', `selectCheapestHood:${h.id}`, 'success'); onSelectNeighborhood(h); }
                  setShowPulseModal(false);
                }}
                className="apple-grouped-card bg-slate-50/70 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-800 rounded-xl p-3 text-right transition cursor-pointer"
              >
                <div className="text-slate-500 dark:text-slate-400 text-[11px]">ارزان‌ترین محله امروز:</div>
                <div className="font-extrabold text-emerald-700 dark:text-emerald-400 mt-0.5 tabular-nums">
                  {marketPulse?.marketSummary?.cheapestNeighborhood?.name || 'شهرری'} ({fmtUnitBuy(marketPulse?.marketSummary?.cheapestNeighborhood?.buyPerSqm || 62)})
                </div>
              </button>
              <button
                type="button"
                onClick={() => {
                  const expId = marketPulse?.marketSummary?.mostExpensiveNeighborhood?.id || safeEvaluated[0]?.id || 1;
                  const h = safeEvaluated.find((n) => n.id === expId) || safeEvaluated[0];
                  if (h) { recordDiagnosticEvent('SecondaryModals', `selectMostExpensiveHood:${h.id}`, 'success'); onSelectNeighborhood(h); }
                  setShowPulseModal(false);
                }}
                className="apple-grouped-card bg-slate-50/70 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-800 rounded-xl p-3 text-right transition cursor-pointer"
              >
                <div className="text-slate-500 dark:text-slate-400 text-[11px]">گران‌ترین محله امروز:</div>
                <div className="font-extrabold text-slate-900 dark:text-white mt-0.5 tabular-nums">
                  {marketPulse?.marketSummary?.mostExpensiveNeighborhood?.name || 'زعفرانیه'} ({fmtUnitBuy(marketPulse?.marketSummary?.mostExpensiveNeighborhood?.buyPerSqm || 310)})
                </div>
              </button>
            </div>
            {safeEvaluated.length >= 2 && (
              <button
                type="button"
                onClick={() => {
                  const cheapId = marketPulse?.marketSummary?.cheapestNeighborhood?.id;
                  const expId = marketPulse?.marketSummary?.mostExpensiveNeighborhood?.id;
                  const sortedByPrice = [...safeEvaluated].sort((a, b) => a.buyPerSqm - b.buyPerSqm);
                  const cheapHood = safeEvaluated.find((n) => n.id === cheapId) || sortedByPrice[0];
                  const expHood = safeEvaluated.find((n) => n.id === expId) || sortedByPrice[sortedByPrice.length - 1];
                  if (cheapHood && expHood && cheapHood.id !== expHood.id) {
                    updateMapAdvancedOverlayState({ comparisonArc: { active: true, isPinned: true, hoodA: cheapHood, hoodB: expHood } });
                    onSelectNeighborhood(cheapHood);
                  }
                  setShowPulseModal(false);
                }}
                className="w-full py-2 px-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 border border-indigo-200 dark:border-indigo-800 text-indigo-800 dark:text-indigo-300 text-xs font-extrabold flex items-center justify-center gap-1.5 transition cursor-pointer"
              >
                <Scale className="w-4 h-4 stroke-[1.75]" />
                <span>ترسیم کمان شکاف قیمتی شهر (ارزان‌ترین ⇄ گران‌ترین محله) روی نقشه</span>
              </button>
            )}
            <div className="apple-grouped-card bg-slate-50/70 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 rounded-xl p-3.5 space-y-1.5 text-[11px] text-slate-600 dark:text-slate-300">
              <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                <Clock className="w-4 h-4 stroke-[1.75] text-emerald-600 dark:text-emerald-400" />
                <span>زمان‌بند خودکار هر ۲ ساعت (۸ صبح تا ۸ شب به وقت تهران)</span>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 tabular-nums">
                <span>آخرین بروزرسانی: <strong className="text-slate-900 dark:text-white">{marketPulse?.lastUpdatedTimeFa || 'هم‌اکنون'}</strong></span>
                <span>بروزرسانی بعدی: <strong className="text-emerald-700 dark:text-emerald-400">{marketPulse?.nextScheduledTimeFa || 'ساعت زوج بعدی (بازه ۸ تا ۲۰)'}</strong></span>
              </div>
              {lastSyncNotice && <div className="text-emerald-700 dark:text-emerald-400 pt-1">{lastSyncNotice}</div>}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-slate-200/70 dark:border-slate-800">
              <button
                type="button" onClick={() => onFetchMarketPulse(true)} disabled={syncingPulse}
                className="px-3 py-2 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-200/80 dark:border-slate-700 text-slate-800 dark:text-slate-200 font-bold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 stroke-[1.75] text-slate-600 dark:text-slate-300 ${syncingPulse ? 'animate-spin' : ''}`} />
                <span>همگام‌سازی زنده</span>
              </button>
              <button
                type="button" onClick={onDeepWebSync} disabled={deepSyncing}
                className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
              >
                <Sparkles className={`w-4 h-4 stroke-[1.75] ${deepSyncing ? 'animate-spin' : ''}`} />
                <span>{deepSyncing ? 'در حال بروزرسانی رادار...' : 'بروزرسانی فوری رادار'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
      {showSeoDrawer && (
        <div role="dialog" aria-modal="true" aria-label="فهرست سئو و صفحات اختصاصی محله‌ها" onClick={() => setShowSeoDrawer(false)} className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div ref={dialogRef} tabIndex={-1} onClick={(e) => e.stopPropagation()} className="apple-window-sheet bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white rounded-2xl max-w-4xl w-full p-5 max-h-[88vh] overflow-y-auto space-y-4 text-xs focus:outline-none shadow-2xl">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/70 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <span className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0">
                  <Globe className="w-4 h-4 stroke-[1.75]" />
                </span>
                <h3 className="text-sm font-black text-slate-900 dark:text-white">
                  فهرست سئو و صفحات اختصاصی محله‌های {activeCityNameFa}
                </h3>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <AreaUnitToggle compact showIntlControls />
                <button type="button" onClick={() => { setShowSeoDrawer(false); setShowLegalModal(true); }} className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-200/80 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-bold flex items-center gap-1 cursor-pointer transition">
                  <ShieldAlert className="w-3.5 h-3.5 stroke-[1.75]" />
                  <span>قوانین حقوقی</span>
                </button>
                <button type="button" onClick={() => { setShowSeoDrawer(false); onTriggerPwaInstall(); }} className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-200/80 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-bold flex items-center gap-1 cursor-pointer transition">
                  <Smartphone className="w-3.5 h-3.5 stroke-[1.75]" />
                  <span>نصب وب‌اپ</span>
                </button>
                <button type="button" aria-label="بستن فهرست سئو" onClick={() => setShowSeoDrawer(false)} className="p-1.5 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 cursor-pointer transition">
                  <X className="w-4 h-4 stroke-[1.75]" />
                </button>
              </div>
            </div>
            <div className="apple-grouped-card bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 rounded-xl p-3.5">
              <h4 className="text-xs font-extrabold text-slate-800 dark:text-slate-200 mb-2.5 flex items-center gap-1.5">
                <ArrowLeftRight className="w-4 h-4 stroke-[1.75] text-emerald-600 dark:text-emerald-400" />
                <span>{activeCityNameFa === 'تهران' ? 'مقایسه‌های پرطرفدار محله‌های تهران:' : `مقایسه سریع محله‌های ${activeCityNameFa}:`}</span>
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                {(activeCityNameFa === 'تهران' ? POPULAR_SEO_COMPARISONS : (() => {
                  const pairs: { id1: number; id2: number; title: string }[] = [];
                  for (let i = 0; i < safeEvaluated.length; i++) {
                    for (let j = i + 1; j < safeEvaluated.length && pairs.length < 9; j++) {
                      pairs.push({ id1: safeEvaluated[i].id, id2: safeEvaluated[j].id, title: `مقایسه ${safeEvaluated[i].name} با ${safeEvaluated[j].name}` });
                    }
                  }
                  return pairs;
                })()).map((pair, idx) => {
                  const cityQuery = activeCityNameFa === 'تهران' ? '' : `city=${activeCityNameFa === 'کرج' ? 'karaj' : activeCityNameFa === 'مشهد' ? 'mashhad' : activeCityNameFa === 'اصفهان' ? 'isfahan' : 'shiraz'}&`;
                  return (
                    <a key={idx} href={`/?${cityQuery}compare=${pair.id1}-${pair.id2}${intlQuerySuffix}`} onClick={(e) => { e.preventDefault(); setShowSeoDrawer(false); onOpenSeoComparison(pair.id1, pair.id2); }} className="bg-white dark:bg-slate-800/80 hover:bg-emerald-50 dark:hover:bg-slate-700/80 border border-slate-200/80 dark:border-slate-700 hover:border-emerald-300 rounded-xl px-3 py-2 text-slate-800 dark:text-slate-200 font-semibold transition flex items-center justify-between">
                      <span>{pair.title}</span>
                      <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-bold">مقایسه</span>
                    </a>
                  );
                })}
              </div>
            </div>
            <div className="apple-grouped-card bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 rounded-xl p-3.5 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-xs font-extrabold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 stroke-[1.75] text-emerald-600 dark:text-emerald-400" />
                  <span>صفحات اختصاصی قیمت مسکن محله‌های {activeCityNameFa}:</span>
                </h4>
                <div className="flex flex-wrap items-center gap-1 bg-slate-200/60 dark:bg-slate-800 p-0.5 rounded-lg">
                  {[
                    { id: 'default' as const, label: 'ترتیب منطقه' }, { id: 'cheapest_buy' as const, label: 'ارزان‌ترین خرید' },
                    { id: 'cheapest_rent' as const, label: 'ارزان‌ترین رهن' }, { id: 'highest_score' as const, label: 'بالاترین کیفیت' },
                    { id: 'nearest_metro' as const, label: '🚇 نزدیک‌ترین به مترو' },
                  ].map((mode) => (
                    <button key={mode.id} type="button" onClick={() => setSeoSortBy(mode.id)} className={`px-2 py-1 text-[10px] font-bold rounded-md cursor-pointer transition ${seoSortBy === mode.id ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs' : 'text-slate-600 dark:text-slate-400'}`}>
                      {mode.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                {sortedSeoNeighborhoods.map((n) => {
                  const metroDist = seoSortBy === 'nearest_metro' ? computeSpatialProximityReport(n, resolveCityIdForNeighborhood(n.id)).nearestMetroDistKm : null;
                  return (
                    <a key={n.id} href={`${activeCityNameFa === 'تهران' ? `/?hood=${n.id}` : `/?city=${activeCityNameFa === 'کرج' ? 'karaj' : activeCityNameFa === 'مشهد' ? 'mashhad' : activeCityNameFa === 'اصفهان' ? 'isfahan' : 'shiraz'}&hood=${n.id}`}${intlQuerySuffix}`} onClick={(e) => { e.preventDefault(); onSelectNeighborhood(n); setShowSeoDrawer(false); }} className={`border rounded-xl px-3 py-2 transition flex items-center justify-between gap-1 ${selectedHoodId === n.id ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-600 text-emerald-800 dark:text-emerald-300 font-bold' : 'bg-white dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-700/80 border-slate-200/80 dark:border-slate-700 text-slate-700 dark:text-slate-200'}`}>
                      <span className="truncate font-semibold">{n.name}</span>
                      <span className="flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400 tabular-nums shrink-0">
                        {metroDist !== null ? <span className="text-indigo-700 dark:text-indigo-400 font-bold">🚇 ~{toPersianNum(metroDist)}کم</span> : <span>{seoSortBy === 'cheapest_rent' ? fmtUnitRent(n.rahn80m) : fmtUnitBuy(n.baseBuyPerSqm ?? n.buyPerSqm)}</span>}
                        <span className="text-emerald-700 dark:text-emerald-400 font-bold">★ {toPersianNum(n.overallScore)}/۱۰</span>
                      </span>
                    </a>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
      <BuyerAlertPwaLegalModals
        showBuyerAlertModal={showBuyerAlertModal} setShowBuyerAlertModal={setShowBuyerAlertModal} neighborhoods={neighborhoods} alertFullName={alertFullName} setAlertFullName={setAlertFullName} alertPhone={alertPhone} setAlertPhone={setAlertPhone} alertHoodId={alertHoodId} setAlertHoodId={setAlertHoodId} alertDealType={alertDealType} setAlertDealType={setAlertDealType} alertMaxBudget={alertMaxBudget} setAlertMaxBudget={setAlertMaxBudget} alertSubmitMsg={alertSubmitMsg} onRegisterBuyerAlert={onRegisterBuyerAlert} isSavingBuyerAlert={isSavingBuyerAlert} showPwaModal={showPwaModal} setShowPwaModal={setShowPwaModal} showLegalModal={showLegalModal} setShowLegalModal={setShowLegalModal} thresholdSubscriptions={thresholdSubscriptions} thresholdMatches={thresholdMatches} onAddThresholdSubscription={onAddThresholdSubscription} onRemoveThresholdSubscription={onRemoveThresholdSubscription} />
    </>
  );
}