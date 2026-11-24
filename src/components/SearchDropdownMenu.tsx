import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Clock, Trash2, MapPin, TrendingUp, Sparkles, Building2, SlidersHorizontal } from 'lucide-react';
import { EvaluatedNeighborhood, toPersianNum } from '../data/neighborhoods';
import type { CityId, Neighborhood } from '../types/models';
import { MULTI_CITY_CONFIGS, resolveCityIdForNeighborhood, getAllMultiCityNeighborhoods } from '../data/multiCityData';
import { aggregateNeighborhoodMarketMetrics, buildNeighborhoodListingSamples } from '../data/realMarketPriceAggregator';
import { SmartNaturalSearchMatchesSection } from './SmartNaturalSearchMatchesSection';
import { useAreaUnit, useRadarLocale, useIntlCurrency } from './AreaUnitToggle';
import { convertPricePerSqmToUnit, formatAreaShort, formatMillionTomanAsIntlCurrency, type PrimaryViewId } from '../utils/areaUnit';
import { matchesPersianSearch } from '../utils/security';
import { isNeighborhoodSearchInputFocused } from '../utils/interactions/dialogStack';
export {
  SearchHistory, getRecentSearches, recordRecentSearch, removeRecentSearch,
  clearAllRecentSearches, useSearchHistory, RECENT_SEARCHES_STORAGE_KEY, MAX_RECENT_SEARCHES,
} from './SearchHistory';
import { SearchHistory, recordRecentSearch } from './SearchHistory';

export const POPULAR_HOOD_NAMES = ['سعادت‌آباد', 'شهرک غرب', 'پونک', 'نیاوران', 'چیتگر', 'تهران‌پارس غربی', 'ونک', 'یوسف‌آباد'];

export function getTrendingNeighborhoods(
  allHoods: EvaluatedNeighborhood[],
  currentMatches: EvaluatedNeighborhood[] = []
): EvaluatedNeighborhood[] {
  const matchIds = new Set(currentMatches.map((m) => m.id));
  const trendingByCatalog = allHoods.filter((h) => POPULAR_HOOD_NAMES.includes(h.name) && !matchIds.has(h.id));
  if (trendingByCatalog.length >= 3) return trendingByCatalog.slice(0, 3);
  const topScored = [...allHoods].filter((h) => !matchIds.has(h.id)).sort((a, b) => (b.overallScore || 0) - (a.overallScore || 0));
  return [...trendingByCatalog, ...topScored].slice(0, 3);
}

export function useGlobalSearchShortcut(onOpenDropdown: () => void): void {
  useEffect(() => {
    let focusTimer: number | null = null;
    const handleGlobalKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInputFocused = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable);
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      if (((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') || (!isInputFocused && e.key === '/')) {
        e.preventDefault();
        onOpenDropdown();
        const tryFocus = () => { document.querySelector<HTMLInputElement>('input[aria-label="جست‌وجوی محله"]')?.focus(); };
        tryFocus();
        if (focusTimer !== null) window.clearTimeout(focusTimer);
        focusTimer = window.setTimeout(() => { focusTimer = null; tryFocus(); }, 40);
      }
    };
    window.addEventListener('keydown', handleGlobalKey);
    return () => {
      if (focusTimer !== null) window.clearTimeout(focusTimer);
      window.removeEventListener('keydown', handleGlobalKey);
    };
  }, [onOpenDropdown]);
}

export interface SearchDropdownMenuProps {
  searchQuery: string; searchMatches: EvaluatedNeighborhood[]; crossCityMatches?: Neighborhood[];
  evaluatedNeighborhoods: EvaluatedNeighborhood[]; mode?: 'rent' | 'buy';
  onSelectNeighborhood: (hood: EvaluatedNeighborhood) => void;
  onSwitchCity?: (cityId: CityId, targetHoodId?: number) => void;
  onNavigateDestination?: (view: PrimaryViewId, subTab?: any) => void;
  setMobileSheetOpen: (v: boolean) => void; setSearchQuery: (q: string) => void; setShowSearchDropdown: (v: boolean) => void;
}

export function SearchDropdownMenu({
  searchQuery, searchMatches, crossCityMatches = [], evaluatedNeighborhoods, mode = 'buy',
  onSelectNeighborhood, onSwitchCity, onNavigateDestination, setMobileSheetOpen, setSearchQuery, setShowSearchDropdown,
}: SearchDropdownMenuProps): React.ReactElement {
  const [areaUnit] = useAreaUnit();
  const [radarLocale] = useRadarLocale();
  const [intlCurrency] = useIntlCurrency();
  const [highlightedIndex, setHighlightedIndex] = useState<number>(0);
  const formatHoodPriceMetric = (n: { id?: number; name?: string; rahn80m: number; buyPerSqm: number; distKm?: number | null }) => {
    const distTag = typeof n.distKm === 'number' ? ` · ${toPersianNum(areaUnit === 'sqft' ? (n.distKm * 0.621371).toFixed(1) : n.distKm.toFixed(1))} ${areaUnit === 'sqft' ? 'mi' : 'km'}` : '';
    if (mode === 'rent') return `رهن ${formatAreaShort(80, areaUnit)}: ${toPersianNum(n.rahn80m)} م · اجاره: ${toPersianNum(Math.round(n.rahn80m * 0.03))} م${intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(n.rahn80m, intlCurrency, radarLocale)})` : ''}${distTag}`;
    const unitBuy = Number(convertPricePerSqmToUnit(n.buyPerSqm, areaUnit).toFixed(1));
    const hoodSamples = buildNeighborhoodListingSamples({ id: n.id ?? 1, name: n.name ?? '', buyPerSqm: n.buyPerSqm });
    const unitDeal = Number(convertPricePerSqmToUnit(aggregateNeighborhoodMarketMetrics(n.id ?? 1, n.name ?? '', n.buyPerSqm, hoodSamples).estimatedDealPricePerSqm, areaUnit).toFixed(1));
    return `${areaUnit === 'sqft' ? 'هر ft²' : 'متری'} ${toPersianNum(unitBuy)} م (سناریو v6.4 (غیرثبتی): ${toPersianNum(unitDeal)} م) · کل ${formatAreaShort(80, areaUnit)}: ${toPersianNum(((n.buyPerSqm * 80) / 1000).toFixed(1))} میلیارد${intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(unitBuy, intlCurrency, radarLocale)} · کل: ${formatMillionTomanAsIntlCurrency(n.buyPerSqm * 80, intlCurrency, radarLocale)})` : ''}${distTag}`;
  };
  useEffect(() => { setHighlightedIndex(0); }, [searchQuery]);
  const allNationwideHoods = useMemo(() => getAllMultiCityNeighborhoods(), []);
  const propertyDealMatches = useMemo(() => {
    const q = searchQuery.trim();
    if (!q) return [];
    const hits: { hood: EvaluatedNeighborhood; title: string; street: string; sqm: number }[] = [];
    for (const h of evaluatedNeighborhoods) {
      for (const b of h.bargains || []) {
        if ((b.title && matchesPersianSearch(b.title, q)) || (b.street && matchesPersianSearch(b.street, q)) || matchesPersianSearch(h.name, q)) {
          hits.push({ hood: h, title: b.title || `فایل زیر قیمت ${h.name}`, street: b.street || h.zone, sqm: b.sqm || 80 });
        }
      }
    }
    return hits.slice(0, 4);
  }, [evaluatedNeighborhoods, searchQuery]);
  const moduleQuickMatches = useMemo(() => {
    const q = searchQuery.trim();
    if (!q) return [];
    const candidates: { id: string; label: string; view: PrimaryViewId; subTab?: string; keywords: string }[] = [
      { id: 'market', label: 'تحلیل بازار، حباب قیمت و مقایسه کلان', view: 'intelligence', subTab: 'overview', keywords: 'بازار قیمت حباب تحلیل روند اجاره' },
      { id: 'tools', label: 'ابزار ارزش‌گذاری هدونیک و محاسبه وام', view: 'tools', subTab: 'valuation', keywords: 'ارزش گذاری هدونیک محاسبه وام مالیات کمیسیون' },
      { id: 'props', label: 'جست‌وجوی املاک و فایل‌های زیر قیمت', view: 'properties', subTab: 'all', keywords: 'ملک املاک فایل آگهی خرید اجاره' },
    ];
    return candidates.filter((c) => matchesPersianSearch(c.keywords, q) || matchesPersianSearch(c.label, q));
  }, [searchQuery]);
  const trendingHoods = useMemo(() => getTrendingNeighborhoods(evaluatedNeighborhoods, searchMatches), [evaluatedNeighborhoods, searchMatches]);
  const handleSelectNeighborhood = useCallback((n: EvaluatedNeighborhood) => {
    recordRecentSearch(n.name); onSelectNeighborhood(n); setMobileSheetOpen(true); setSearchQuery(''); setShowSearchDropdown(false);
  }, [onSelectNeighborhood, setMobileSheetOpen, setSearchQuery, setShowSearchDropdown]);
  const handleSelectCrossCityNeighborhood = (n: Neighborhood) => {
    const targetCity = resolveCityIdForNeighborhood(n.id);
    recordRecentSearch(n.name); if (onSwitchCity) onSwitchCity(targetCity, n.id);
    setMobileSheetOpen(true); setSearchQuery(''); setShowSearchDropdown(false);
  };
  const handleSelectRecentSearchName = (name: string) => {
    const norm = name.trim().toLowerCase();
    const matched = evaluatedNeighborhoods.find((h) => h.name.trim().toLowerCase() === norm);
    if (matched) { handleSelectNeighborhood(matched); return; }
    const crossMatched = allNationwideHoods.find((h) => h.name.trim().toLowerCase() === norm);
    if (crossMatched) { handleSelectCrossCityNeighborhood(crossMatched); return; }
    setSearchQuery(name);
  };
  useEffect(() => {
    const visibleMatches = searchQuery.trim() ? searchMatches.slice(0, 50) : trendingHoods;
    const onKeyDown = (e: KeyboardEvent) => {
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      if (e.key === 'Escape') { e.preventDefault(); setShowSearchDropdown(false); return; }
      if (visibleMatches.length === 0) return;
      const activeEl = document.activeElement as HTMLElement | null;
      if (!isNeighborhoodSearchInputFocused(activeEl)) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); setHighlightedIndex((prev) => (prev + 1) % visibleMatches.length); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlightedIndex((prev) => (prev - 1 + visibleMatches.length) % visibleMatches.length); }
      else if (e.key === 'Enter') {
        const clampedIdx = Math.min(highlightedIndex, visibleMatches.length - 1);
        const chosen = visibleMatches[clampedIdx] || visibleMatches[0];
        if (chosen) { e.preventDefault(); handleSelectNeighborhood(chosen); }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [searchQuery, searchMatches, trendingHoods, highlightedIndex, handleSelectNeighborhood, setShowSearchDropdown]);
  const isQueryEmpty = !searchQuery.trim(); return (
    <div className="absolute top-full mt-2 inset-x-0 sm:inset-x-auto sm:start-0 sm:w-[360px] md:w-[420px] max-w-[calc(100vw-1.5rem)] apple-grouped-card dark:bg-slate-900 dark:border-slate-700/80 shadow-xl max-h-[min(24rem,calc(100dvh-11rem))] overflow-y-auto z-50 divide-y divide-slate-200/60 dark:divide-slate-800 animate-fadeIn">
      {isQueryEmpty ? (
        <div className="py-1">
          <SearchHistory
            onSelectNeighborhood={(name) => handleSelectRecentSearchName(name)}
            evaluatedNeighborhoods={evaluatedNeighborhoods} mode={mode}
            showPriceTag={true} showClearAll={true} showIndividualRemove={true}
            emptyMessage="نام محله مورد نظر خود را برای جست‌وجو وارد کنید."
          />
          {trendingHoods.length > 0 && (
            <div className="border-t border-slate-200/80 dark:border-slate-800">
              <div className="px-3 py-1.5 flex items-center justify-between text-[11px] font-bold text-amber-800 dark:text-amber-300 bg-amber-50/60 dark:bg-amber-950/30 border-b border-amber-100/70 dark:border-amber-900/50">
                <span className="flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 stroke-[2]" />
                  <span>محله‌های پرطرفدار و ترند</span>
                </span>
                <span className="text-[10px] text-amber-700 dark:text-amber-400 font-bold">انتخاب سریع</span>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {trendingHoods.map((n, idx) => (
                  <button key={`empty-trending-${n.id}`} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => handleSelectNeighborhood(n)} className={`w-full text-right px-3.5 py-2 transition flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 text-xs cursor-pointer group ${idx === highlightedIndex ? 'bg-amber-50/80 dark:bg-amber-950/40' : 'hover:bg-amber-50/50 dark:hover:bg-slate-800/70'}`}>
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Sparkles className="w-3 h-3 shrink-0 text-amber-500 group-hover:text-amber-600 transition" />
                      <span className="font-bold text-slate-800 dark:text-slate-100 group-hover:text-amber-800 dark:group-hover:text-amber-300 transition">{n.name}</span>
                      <span className="text-[10px] text-slate-400 whitespace-nowrap">({n.zone})</span>
                    </div>
                    <span className="text-emerald-700 dark:text-emerald-400 font-bold tabular-nums text-[10.5px] leading-snug">{formatHoodPriceMetric(n)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="border-t border-slate-200/80 dark:border-slate-800">
            <div className="px-3 py-1.5 flex items-center justify-between text-[11px] font-bold text-slate-600 dark:text-slate-300 bg-slate-50/90 dark:bg-slate-800/80 border-b border-slate-100 dark:border-slate-800">
              <span>فهرست کامل محلات این منطقه</span>
              <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-bold tabular-nums">{toPersianNum(evaluatedNeighborhoods.length)} محله</span>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-56 overflow-y-auto">
              {evaluatedNeighborhoods.map((n) => (
                <button key={`dir-${n.id}`} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => handleSelectNeighborhood(n)} className="w-full text-right px-3.5 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/70 transition flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 text-xs cursor-pointer group">
                  <div className="flex items-center gap-1.5 min-w-0 max-w-full">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${n.status === 'green' ? 'bg-emerald-500' : n.status === 'yellow' ? 'bg-amber-500' : 'bg-rose-500'}`} />
                    <span className="font-bold text-slate-800 dark:text-slate-100 group-hover:text-[#007AFF] dark:group-hover:text-emerald-400">{n.name}</span>
                    <span className="text-[10px] text-slate-400 whitespace-nowrap">({n.zone})</span>
                  </div>
                  <span className="text-emerald-700 dark:text-emerald-400 font-bold tabular-nums text-[10.5px] leading-snug">{formatHoodPriceMetric(n)}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="py-1">
          <SmartNaturalSearchMatchesSection
            searchQuery={searchQuery} evaluatedNeighborhoods={evaluatedNeighborhoods}
            mode={mode} onSelectNeighborhood={handleSelectNeighborhood}
          />
          {searchMatches.length > 0 && (
            <div>
              <div className="px-3 py-1 flex items-center justify-between text-[11px] font-bold text-slate-500 dark:text-slate-400 bg-slate-50/70 dark:bg-slate-800/70 border-b border-slate-100 dark:border-slate-800">
                <span>۱. محدوده‌های جغرافیایی و محله‌ها (↑↓ و Enter)</span>
                <span className="text-[10px] text-slate-400 tabular-nums">{toPersianNum(searchMatches.length)} محله</span>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {searchMatches.slice(0, 50).map((n, idx) => (
                  <button
                    key={n.id} type="button" style={{ animationDelay: `${Math.min(idx * 30, 180)}ms` }}
                    onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setHighlightedIndex(idx)} onClick={() => handleSelectNeighborhood(n)}
                    className={`w-full text-right px-3.5 py-2.5 transition flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-xs cursor-pointer ios-stagger-item group ${
                      idx === highlightedIndex ? 'bg-emerald-50/90 dark:bg-emerald-950/40 text-emerald-950 dark:text-emerald-100' : 'hover:bg-slate-50 dark:hover:bg-slate-800/70'
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${n.status === 'green' ? 'bg-emerald-500' : n.status === 'yellow' ? 'bg-amber-500' : 'bg-rose-500'}`} />
                      <span className="font-bold text-slate-900 dark:text-slate-100 group-hover:text-[#007AFF] dark:group-hover:text-emerald-400 transition">{n.name}</span>
                      <span className="text-[10px] text-slate-400 whitespace-nowrap">({n.zone})</span>
                      {searchQuery.trim() && !matchesPersianSearch(n.name, searchQuery.trim()) && (matchesPersianSearch(n.pros, searchQuery.trim()) || n.bargains?.some((b) => Boolean((b.street && matchesPersianSearch(b.street, searchQuery.trim())) || (b.title && matchesPersianSearch(b.title, searchQuery.trim()))))) && (
                        <span className="px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 text-[9.5px] font-bold">زیرمحله / خیابان</span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] font-bold tabular-nums shrink-0">{toPersianNum(n.overallScore)}/۱۰</span>
                      <span className="text-emerald-700 dark:text-emerald-400 font-bold tabular-nums text-[10.5px] leading-snug">{formatHoodPriceMetric(n)}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
          {propertyDealMatches.length > 0 && (
            <div className="border-t border-slate-200/80 dark:border-slate-800">
              <div className="px-3 py-1 flex items-center justify-between text-[11px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50/60 dark:bg-emerald-950/30">
                <span className="flex items-center gap-1"><Building2 className="w-3.5 h-3.5" /><span>۲. املاک و فایل‌های شکار زیر قیمت</span></span>
                <span className="text-[10px] tabular-nums">{toPersianNum(propertyDealMatches.length)} مورد</span>
              </div>
              {propertyDealMatches.map((m, i) => (
                <button key={`deal-${m.hood.id}-${i}`} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { onSelectNeighborhood(m.hood); if (onNavigateDestination) onNavigateDestination('properties', 'all'); setSearchQuery(''); setShowSearchDropdown(false); }} className="w-full text-right px-3.5 py-2 hover:bg-emerald-50/40 dark:hover:bg-slate-800/70 transition flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 text-xs cursor-pointer">
                  <span className="font-bold text-slate-800 dark:text-slate-100">{m.title} ({m.hood.name})</span>
                  <span className="text-[10.5px] text-slate-400 shrink-0">{m.street} · {formatAreaShort(m.sqm, areaUnit)}</span>
                </button>
              ))}
            </div>
          )}
          {moduleQuickMatches.length > 0 && onNavigateDestination && (
            <div className="border-t border-slate-200/80 dark:border-slate-800">
              <div className="px-3 py-1 text-[11px] font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-50/60 dark:bg-indigo-950/30 flex items-center gap-1">
                <SlidersHorizontal className="w-3.5 h-3.5" /><span>۳. ابزارها و بخش‌های تحلیلی</span>
              </div>
              {moduleQuickMatches.map((mod) => (
                <button key={mod.id} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { onNavigateDestination(mod.view, mod.subTab); setSearchQuery(''); setShowSearchDropdown(false); }} className="w-full text-right px-3.5 py-2 hover:bg-indigo-50/40 dark:hover:bg-slate-800/70 transition text-xs font-bold text-slate-800 dark:text-slate-100 cursor-pointer">
                  {mod.label} ↗
                </button>
              ))}
            </div>
          )}
          {searchMatches.length === 0 && (
            <div className="px-3.5 py-2.5 text-center text-xs text-slate-400">محله‌ای با این نام در این شهر یافت نشد.</div>
          )}
          {crossCityMatches.length > 0 && (
            <div className="mt-1 border-t border-slate-200/80 dark:border-slate-800">
              <div className="px-3 py-1.5 flex items-center justify-between text-[11px] font-bold text-indigo-900 dark:text-indigo-200 bg-indigo-50/70 dark:bg-indigo-950/40 border-b border-indigo-100 dark:border-indigo-900/50">
                <span>نتایج در سایر استان‌ها و شهرهای ایران</span>
                <span className="text-[10px] text-indigo-700 dark:text-indigo-400 font-bold tabular-nums">{toPersianNum(crossCityMatches.length)} محله</span>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {crossCityMatches.slice(0, 30).map((n) => {
                  const targetCityId = resolveCityIdForNeighborhood(n.id);
                  const cityName = MULTI_CITY_CONFIGS[targetCityId]?.nameFa || targetCityId;
                  return (
                    <button key={`cross-${n.id}`} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => handleSelectCrossCityNeighborhood(n)} className="w-full text-right px-3.5 py-2 hover:bg-indigo-50/60 dark:hover:bg-indigo-950/30 transition flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-xs cursor-pointer group">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <MapPin className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                        <span className="font-bold text-slate-900 dark:text-slate-100 group-hover:text-indigo-700 dark:group-hover:text-indigo-300">{n.name}</span>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 whitespace-nowrap">({n.zone})</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900/60 text-indigo-800 dark:text-indigo-300 text-[9.5px] font-bold shrink-0">پرواز به {cityName}</span>
                        <span className="text-emerald-700 dark:text-emerald-400 font-bold tabular-nums text-[10.5px] leading-snug">{formatHoodPriceMetric(n)}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {trendingHoods.length > 0 && (
            <div className="mt-1 border-t border-slate-200/80 dark:border-slate-800">
              <div className="px-3 py-1.5 flex items-center justify-between text-[11px] font-bold text-amber-800 dark:text-amber-300 bg-amber-50/60 dark:bg-amber-950/30 border-b border-amber-100/70 dark:border-amber-900/50">
                <span className="flex items-center gap-1.5"><TrendingUp className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 stroke-[2]" /><span>محله‌های پرطرفدار و ترند</span></span>
                <span className="text-[10px] text-amber-700 dark:text-amber-400 font-bold">پیشنهاد سریع</span>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {trendingHoods.map((n, idx) => (
                  <button key={`trending-${n.id}`} type="button" style={{ animationDelay: `${(idx + 1) * 45}ms` }} onMouseDown={(e) => e.preventDefault()} onClick={() => handleSelectNeighborhood(n)} className="w-full text-right px-3.5 py-2 hover:bg-amber-50/50 dark:hover:bg-slate-800/70 transition flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 text-xs cursor-pointer group ios-stagger-item">
                    <div className="flex items-center gap-1.5 min-w-0"><Sparkles className="w-3 h-3 shrink-0 text-amber-500 group-hover:text-amber-600 transition" /><span className="font-bold text-slate-800 dark:text-slate-100 group-hover:text-amber-800 dark:group-hover:text-amber-300 transition">{n.name}</span><span className="text-[10px] text-slate-400 whitespace-nowrap">({n.zone})</span></div>
                    <div className="flex flex-wrap items-center gap-1.5"><span className="px-1.5 py-0.5 rounded-[5px] bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 font-bold text-[10px] tabular-nums shrink-0">{toPersianNum(n.overallScore)} / ۱۰</span><span className="text-slate-600 dark:text-slate-400 font-bold tabular-nums text-[10.5px] leading-snug">{formatHoodPriceMetric(n)}</span></div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}