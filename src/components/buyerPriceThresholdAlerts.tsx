import React, { useState, useEffect, useMemo, useCallback } from 'react'; import { BellRing, CheckCircle2, MapPin, Plus, Trash2, X, ArrowUpLeft } from 'lucide-react'; import { EvaluatedNeighborhood, Neighborhood, toPersianNum } from '../data/neighborhoods'; import { aggregateNeighborhoodMarketMetrics } from '../data/realMarketPriceAggregator'; import { convertPricePerSqmToUnit, formatAreaShort, formatMillionTomanAsIntlCurrency } from '../utils/areaUnit'; import { useAreaUnit, useIntlCurrency, useRadarLocale } from './AreaUnitToggle'; import { clampNumber } from '../utils/security'; import { extractVerifiedBargainPriceInDealUnit } from '../utils/buyerAlertsAndCommunityTrust'; import { BuyerAlertPriceSparkline } from './BuyerAlertPriceSparkline'; export const PRICE_THRESHOLD_STORAGE_KEY = 'tehran_radar_price_threshold_alerts_v1'; export const DISMISSED_MATCHES_STORAGE_KEY = 'tehran_radar_dismissed_threshold_matches_v1'; export interface PriceThresholdSubscription { id: string; hoodId: number; hoodName: string; dealType: 'خرید' | 'اجاره'; maxThresholdMillion: number; createdAtIso: string; } export interface PriceThresholdMatchItem { matchKey: string; subscription: PriceThresholdSubscription; neighborhood: Neighborhood | EvaluatedNeighborhood; matchedSource: 'bargain_listing' | 'neighborhood_avg'; observedMillion: number; bargainTitle?: string; discountPercent: number; }
export function loadPriceThresholdSubscriptions(): PriceThresholdSubscription[] { if (typeof window === 'undefined' || !window.localStorage) return []; try { const raw = window.localStorage.getItem(PRICE_THRESHOLD_STORAGE_KEY); if (!raw) return []; const parsed = JSON.parse(raw); if (!Array.isArray(parsed)) return []; return parsed.filter( (item): item is PriceThresholdSubscription => Boolean(item) && typeof item.id === 'string' && typeof item.hoodId === 'number' && typeof item.hoodName === 'string' && (item.dealType === 'خرید' || item.dealType === 'اجاره') &&
        typeof item.maxThresholdMillion === 'number' && Number.isFinite(item.maxThresholdMillion) && item.maxThresholdMillion > 0
    ).slice(0, 30); } catch { return []; } } export function savePriceThresholdSubscriptions(list: PriceThresholdSubscription[]): void { if (typeof window === 'undefined' || !window.localStorage) return; try { window.localStorage.setItem(PRICE_THRESHOLD_STORAGE_KEY, JSON.stringify(list.slice(0, 30))); }
  catch { /* ignore quota errors */ }
} export function evaluatePriceThresholdAlertMatches( subscriptions: PriceThresholdSubscription[], neighborhoods: (Neighborhood | EvaluatedNeighborhood)[]
): PriceThresholdMatchItem[] { if (!Array.isArray(subscriptions) || subscriptions.length === 0 || !Array.isArray(neighborhoods) || neighborhoods.length === 0) return []; const matches: PriceThresholdMatchItem[] = []; for (const sub of subscriptions) { const hood = neighborhoods.find((n) => n.id === sub.hoodId); if (!hood) continue; const currentBuySqm = Number((hood as EvaluatedNeighborhood).buyPerSqm ?? hood.buyPerSqm);
    const currentRahn80m = Number(hood.rahn80m); const bargains = Array.isArray(hood.bargains) ? hood.bargains : []; if (sub.dealType === 'خرید' && Number.isFinite(currentBuySqm) && currentBuySqm > 0) { const matchingBargain = bargains.find((b) => { if (b.type !== 'خرید') return false; const verifiedPrice = extractVerifiedBargainPriceInDealUnit(b, 'خرید').price; return verifiedPrice !== null && verifiedPrice <= sub.maxThresholdMillion; });
      if (matchingBargain) { const observedMillion = extractVerifiedBargainPriceInDealUnit(matchingBargain, 'خرید').price ?? currentBuySqm; matches.push({
          matchKey: `${sub.id}:bargain:${matchingBargain.id}:${observedMillion}`,
          subscription: sub, neighborhood: hood, matchedSource: 'bargain_listing', observedMillion, bargainTitle: matchingBargain.title, discountPercent: Number(matchingBargain.discountPercent) || Math.round((1 - observedMillion / currentBuySqm) * 100), }); } else if (currentBuySqm <= sub.maxThresholdMillion) { matches.push({
          matchKey: `${sub.id}:avg:${currentBuySqm}`,
          subscription: sub, neighborhood: hood, matchedSource: 'neighborhood_avg', observedMillion: currentBuySqm, discountPercent: Math.max(0, Math.round(((sub.maxThresholdMillion - currentBuySqm) / sub.maxThresholdMillion) * 100)), }); }
    } else if (sub.dealType === 'اجاره' && Number.isFinite(currentRahn80m) && currentRahn80m > 0) { const matchingRentBargain = bargains.find((b) => { if (b.type !== 'اجاره') return false; const verifiedPrice = extractVerifiedBargainPriceInDealUnit(b, 'اجاره').price;
        return verifiedPrice !== null && verifiedPrice <= sub.maxThresholdMillion; }); if (matchingRentBargain) { const observedMillion = extractVerifiedBargainPriceInDealUnit(matchingRentBargain, 'اجاره').price ?? currentRahn80m;
        matches.push({
          matchKey: `${sub.id}:bargain:${matchingRentBargain.id}:${observedMillion}`,
          subscription: sub, neighborhood: hood, matchedSource: 'bargain_listing', observedMillion, bargainTitle: matchingRentBargain.title, discountPercent: Number(matchingRentBargain.discountPercent) || 10, });
      } else if (currentRahn80m <= sub.maxThresholdMillion) { matches.push({
          matchKey: `${sub.id}:avg:${currentRahn80m}`,
          subscription: sub, neighborhood: hood, matchedSource: 'neighborhood_avg', observedMillion: currentRahn80m, discountPercent: Math.max(0, Math.round(((sub.maxThresholdMillion - currentRahn80m) / sub.maxThresholdMillion) * 100)),
        });
      }
    }
  }
  return matches;
}
export function useBuyerPriceThresholdAlerts(neighborhoods: (Neighborhood | EvaluatedNeighborhood)[]) {
  const [subscriptions, setSubscriptions] = useState<PriceThresholdSubscription[]>(() => loadPriceThresholdSubscriptions());
  const [dismissedKeys, setDismissedKeys] = useState<string[]>(() => {
    if (typeof window === 'undefined' || !window.localStorage) return [];
    try {
      const parsed = JSON.parse(window.localStorage.getItem(DISMISSED_MATCHES_STORAGE_KEY) || '[]');
      return Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === 'string') : [];
    } catch {
      return [];
    }
  });
  useEffect(() => { savePriceThresholdSubscriptions(subscriptions); }, [subscriptions]);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try { window.localStorage.setItem(DISMISSED_MATCHES_STORAGE_KEY, JSON.stringify(dismissedKeys.slice(-50))); } catch { /* ignore */ }
  }, [dismissedKeys]);
  const addSubscription = useCallback(
    (hoodId: number, dealType: 'خرید' | 'اجاره', maxThresholdMillion: number) => {
      const targetHood = neighborhoods.find((n) => n.id === hoodId);
      const hoodName = targetHood?.name || `محله #${hoodId}`;
      const clampedThreshold = clampNumber(maxThresholdMillion, 10, 50000, 120);
      setSubscriptions((prev) => {
        const existingIdx = prev.findIndex((s) => s.hoodId === hoodId && s.dealType === dealType);
        const nextItem: PriceThresholdSubscription = {
          id: existingIdx >= 0 ? prev[existingIdx].id : `sub_${hoodId}_${dealType}_${Date.now()}`,
          hoodId, hoodName, dealType, maxThresholdMillion: clampedThreshold, createdAtIso: new Date().toISOString(),
        };
        if (existingIdx >= 0) {
          const copy = [...prev]; copy[existingIdx] = nextItem; return copy;
        }
        return [nextItem, ...prev].slice(0, 30);
      });
      setDismissedKeys((prev) => prev.filter((k) => !k.includes(`_${hoodId}_${dealType}_`)));
    },
    [neighborhoods]
  );
  const removeSubscription = useCallback((id: string) => { setSubscriptions((prev) => prev.filter((s) => s.id !== id)); }, []);
  const allMatches = useMemo(() => evaluatePriceThresholdAlertMatches(subscriptions, neighborhoods), [subscriptions, neighborhoods]);
  const activeVisibleMatches = useMemo(() => allMatches.filter((m) => !dismissedKeys.includes(m.matchKey)), [allMatches, dismissedKeys]);
  const dismissMatch = useCallback((matchKey: string) => { setDismissedKeys((prev) => (prev.includes(matchKey) ? prev : [...prev, matchKey])); }, []);
  const restoreDismissedMatches = useCallback(() => { setDismissedKeys([]); }, []);
  return { subscriptions, allMatches, activeVisibleMatches, addSubscription, removeSubscription, dismissMatch, restoreDismissedMatches };
}
export interface BuyerPriceThresholdManagerProps {
  neighborhoods: (Neighborhood | EvaluatedNeighborhood)[];
  selectedHoodId: number;
  onSelectHoodId: (id: number) => void;
  dealType: 'خرید' | 'اجاره';
  onSelectDealType: (t: 'خرید' | 'اجاره') => void;
  subscriptions: PriceThresholdSubscription[];
  allMatches: PriceThresholdMatchItem[];
  onAddSubscription: (hoodId: number, dealType: 'خرید' | 'اجاره', maxThresholdMillion: number) => void;
  onRemoveSubscription: (id: string) => void;
}
export function BuyerPriceThresholdManagerSection({
  neighborhoods, selectedHoodId, dealType, subscriptions, allMatches, onAddSubscription, onRemoveSubscription,
}: BuyerPriceThresholdManagerProps): React.ReactElement {
  const [areaUnit] = useAreaUnit(); const [locale] = useRadarLocale(); const [intlCurrency] = useIntlCurrency();
  const currentHood = useMemo(
    () => neighborhoods.find((n) => n.id === selectedHoodId) || neighborhoods[0],
    [neighborhoods, selectedHoodId]
  );
  const defaultThreshold = useMemo(() => {
    if (!currentHood) return dealType === 'خرید' ? 120 : 1200;
    return dealType === 'خرید' ? Math.round(currentHood.buyPerSqm) : Math.round(currentHood.rahn80m);
  }, [currentHood, dealType]);
  const [thresholdInput, setThresholdInput] = useState<number>(defaultThreshold);
  const [justSavedNotice, setJustSavedNotice] = useState<string>('');
  useEffect(() => {
    setThresholdInput(defaultThreshold);
  }, [defaultThreshold]);
  const handleSaveThreshold = () => {
    if (!currentHood) return;
    onAddSubscription(currentHood.id, dealType, thresholdInput);
    const uVal = dealType === 'خرید' ? convertPricePerSqmToUnit(thresholdInput, areaUnit) : thresholdInput;
    const fx = intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(uVal, intlCurrency, locale)})` : '';
    setJustSavedNotice(
      `هشدار سقف قیمت برای محله ${currentHood.name} (${
        dealType === 'خرید'
          ? `حداکثر ${areaUnit === 'sqft' ? 'ft²' : 'متری'} ${toPersianNum(uVal)} م${fx}`
          : `حداکثر رهن کامل ${toPersianNum(uVal)} م${fx}`
      }) فعال شد.`
    );
  };
  const uDefault = dealType === 'خرید' ? convertPricePerSqmToUnit(defaultThreshold, areaUnit) : defaultThreshold;
  const uInput = dealType === 'خرید' ? convertPricePerSqmToUnit(thresholdInput, areaUnit) : thresholdInput; const uDealDefault = currentHood && dealType === 'خرید' ? convertPricePerSqmToUnit(aggregateNeighborhoodMarketMetrics(currentHood.id, currentHood.name, currentHood.buyPerSqm, []).estimatedDealPricePerSqm, areaUnit) : 0;
  return (
    <div className="apple-grouped-card dark:bg-slate-800/60 p-3.5 space-y-3 text-xs border border-emerald-200/80 dark:border-emerald-800/70">
      <div className="flex items-center justify-between border-b border-slate-200/70 dark:border-slate-700 pb-2">
        <div className="font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
          <BellRing className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span>اشتراک هوشمند سقف قیمت محله (پایش زنده و اعلان پایدار)</span>
        </div>
        <span className="text-[10.5px] font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
          {toPersianNum(subscriptions.length)} پایش فعال
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end">
        <div className="sm:col-span-8">
          <label className="block text-[11px] text-slate-600 dark:text-slate-300 mb-1 flex items-center justify-between">
            <span>
              {dealType === 'خرید'
                ? `سقف قیمت ${areaUnit === 'sqft' ? 'هر ft²' : 'هر متر'} در ${currentHood?.name || 'محله'} (میلیون تومان):`
                : `سقف رهن کامل ${formatAreaShort(80, areaUnit)} در ${currentHood?.name || 'محله'} (میلیون تومان):`}
            </span>
            <strong className="text-emerald-700 dark:text-emerald-400 tabular-nums">
              فعلی محله: {toPersianNum(uDefault)} م{uDealDefault > 0 ? ` (معامله: ${toPersianNum(uDealDefault)} م)` : ''}{intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(uDefault, intlCurrency, locale)})` : ''} · سقف انتخابی: {toPersianNum(uInput)} م{intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(uInput, intlCurrency, locale)})` : ''}
            </strong>
          </label>
          <input
            type="number" aria-label="سقف قیمت انتخابی" min={10} max={50000} step={dealType === 'خرید' ? 2 : 25} value={thresholdInput}
            onChange={(e) => setThresholdInput(clampNumber(Number(e.target.value), 10, 50000, defaultThreshold))}
            className="w-full bg-slate-100/80 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white font-black tabular-nums focus:outline-none focus:bg-white dark:focus:bg-slate-900 focus:border-emerald-600"
          />
        </div>
        <div className="sm:col-span-4">
          <button
            type="button" onClick={handleSaveThreshold}
            className="w-full py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer shadow-2xs"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2]" />
            <span>افزودن سقف قیمت</span>
          </button>
        </div>
      </div>
      {currentHood && (
        <BuyerAlertPriceSparkline neighborhood={currentHood} dealType={dealType} maxThresholdMillion={thresholdInput} />
      )}
      {justSavedNotice && (
        <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-[11px] font-bold flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span>{justSavedNotice}</span>
        </div>
      )}
      {subscriptions.length > 0 && (
        <div className="space-y-1.5 pt-1 border-t border-slate-200/60 dark:border-slate-700 max-h-40 overflow-y-auto">
          {subscriptions.map((sub) => {
            const match = allMatches.find((m) => m.subscription.id === sub.id);
            const subHood = neighborhoods.find((n) => n.id === sub.hoodId);
            const uSubMax = sub.dealType === 'خرید' ? convertPricePerSqmToUnit(sub.maxThresholdMillion, areaUnit) : sub.maxThresholdMillion;
            const uObs = match ? (sub.dealType === 'خرید' ? convertPricePerSqmToUnit(match.observedMillion, areaUnit) : match.observedMillion) : 0;
            const uCur = subHood ? (sub.dealType === 'خرید' ? convertPricePerSqmToUnit(subHood.buyPerSqm, areaUnit) : subHood.rahn80m) : 0;
            return (
              <div
                key={sub.id}
                className="flex items-center justify-between gap-2 bg-slate-50 dark:bg-slate-900/70 border border-slate-200/80 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-[11px]"
              >
                <div className="min-w-0 truncate">
                  <strong className="text-slate-900 dark:text-white">{sub.hoodName}</strong>
                  <span className="text-slate-400 mx-1">·</span>
                  <span className="text-slate-600 dark:text-slate-300">
                    {sub.dealType === 'خرید' ? `سقف ${areaUnit === 'sqft' ? 'ft²' : 'متری'} ${toPersianNum(uSubMax)} م (کل ${formatAreaShort(80, areaUnit)}: ${toPersianNum(((sub.maxThresholdMillion * 80) / 1000).toFixed(1))} میلیارد)` : `سقف رهن ${toPersianNum(uSubMax)} م (اجاره معادل: ${toPersianNum(Math.round(uSubMax * 0.03))} م)`}{intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(uSubMax, intlCurrency, locale)})` : ''}
                  </span>
                  <span className="text-slate-400 mx-1">·</span>
                  {match ? (
                    <span className="text-emerald-700 dark:text-emerald-400 font-extrabold">تطابق فعال ({toPersianNum(uObs)} م{intlCurrency !== 'IRT' ? ` · ${formatMillionTomanAsIntlCurrency(uObs, intlCurrency, locale)}` : ''})</span>
                  ) : (
                    <span className="text-amber-700 dark:text-amber-400 font-semibold">در انتظار کاهش قیمت{subHood ? ` (فعلی: ${toPersianNum(uCur)} م)` : ''}</span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {subHood && (
                    <BuyerAlertPriceSparkline
                      neighborhood={subHood} dealType={sub.dealType} maxThresholdMillion={sub.maxThresholdMillion} observedMillion={match?.observedMillion} compact
                    />
                  )}
                  <button
                    type="button" onClick={() => onRemoveSubscription(sub.id)} title="حذف اشتراک سقف قیمت"
                    className="text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 p-1 cursor-pointer shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
export interface PersistentPriceThresholdMatchBannerProps {
  matches: PriceThresholdMatchItem[];
  onInspectMatchedHood: (hood: Neighborhood | EvaluatedNeighborhood) => void;
  onOpenAlertModal: () => void;
  onDismissMatch: (matchKey: string) => void;
}
export function PersistentPriceThresholdMatchBanner({
  matches, onInspectMatchedHood, onOpenAlertModal, onDismissMatch,
}: PersistentPriceThresholdMatchBannerProps): React.ReactElement | null {
  const [areaUnit] = useAreaUnit(); const [locale] = useRadarLocale(); const [intlCurrency] = useIntlCurrency();
  if (!Array.isArray(matches) || matches.length === 0) return null;
  const topMatch = matches[0]; const extraCount = matches.length - 1;
  const uTopObs = topMatch.subscription.dealType === 'خرید' ? convertPricePerSqmToUnit(topMatch.observedMillion, areaUnit) : topMatch.observedMillion;
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed z-40 bottom-20 lg:bottom-6 left-3 right-3 lg:right-auto lg:w-[420px] apple-window-sheet bg-white dark:bg-slate-900 border-2 border-emerald-500/80 rounded-2xl p-3.5 shadow-2xl space-y-2 text-xs text-slate-900 dark:text-slate-100"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-7 h-7 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
            <BellRing className="w-4 h-4 stroke-[2]" />
          </span>
          <div className="min-w-0">
            <div className="font-black text-slate-900 dark:text-white truncate">
              تطابق سقف قیمت در محله {topMatch.subscription.hoodName}
              {extraCount > 0 ? ` (+${toPersianNum(extraCount)} مورد دیگر)` : ''}
            </div>
            <div className="text-[10.5px] text-emerald-700 dark:text-emerald-400 font-bold tabular-nums">
              {topMatch.subscription.dealType === 'خرید'
                ? `نرخ کشف‌شده: ${areaUnit === 'sqft' ? 'ft²' : 'متری'} ${toPersianNum(uTopObs)} م · کل ${formatAreaShort(80, areaUnit)}: ${toPersianNum(((topMatch.observedMillion * 80) / 1000).toFixed(1))} میلیارد (سقف شما: ${toPersianNum(convertPricePerSqmToUnit(topMatch.subscription.maxThresholdMillion, areaUnit))} م)${intlCurrency !== 'IRT' ? ` · ${formatMillionTomanAsIntlCurrency(uTopObs, intlCurrency, locale)}` : ''}`
                : `رهن کشف‌شده (${formatAreaShort(80, areaUnit)}): ${toPersianNum(uTopObs)} م · اجاره معادل: ${toPersianNum(Math.round(uTopObs * 0.03))} م (سقف شما: ${toPersianNum(topMatch.subscription.maxThresholdMillion)} م)${intlCurrency !== 'IRT' ? ` · ${formatMillionTomanAsIntlCurrency(uTopObs, intlCurrency, locale)}` : ''}`}
            </div>
          </div>
        </div>
        <button
          type="button"
          aria-label="بستن اعلان تطابق قیمت"
          onClick={() => onDismissMatch(topMatch.matchKey)} className="p-1 rounded-full bg-slate-200/80 dark:bg-slate-800 hover:bg-slate-300/80 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 cursor-pointer shrink-0"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
        {topMatch.matchedSource === 'bargain_listing' && topMatch.bargainTitle
          ? `فایل زیر قیمت «${topMatch.bargainTitle}» (${toPersianNum(topMatch.discountPercent)}٪ زیر میانگین) در آستانه قیمت انتخابی شما قرار دارد.`
          : `میانگین فعلی محله ${topMatch.subscription.hoodName} در محدوده سقف قیمت ثبت‌شده شما قرار دارد.`}
      </p>
      <BuyerAlertPriceSparkline
        neighborhood={topMatch.neighborhood} dealType={topMatch.subscription.dealType} maxThresholdMillion={topMatch.subscription.maxThresholdMillion} observedMillion={topMatch.observedMillion} />
      <div className="flex items-center justify-between gap-2 pt-1">
        <button
          type="button"
          onClick={() => onInspectMatchedHood(topMatch.neighborhood)} className="flex-1 py-1.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-[11px] flex items-center justify-center gap-1.5 transition cursor-pointer"
        >
          <MapPin className="w-3.5 h-3.5" />
          <span>مشاهده محله و فایل‌ها</span>
          <ArrowUpLeft className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={onOpenAlertModal} className="py-1.5 px-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-[11px] transition cursor-pointer shrink-0"
        >
          مدیریت هشدارها
        </button>
      </div>
    </div>
  ); }