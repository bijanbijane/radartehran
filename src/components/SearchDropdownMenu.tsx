import React, { useState, useEffect, useMemo } from 'react';
import { Clock, Trash2, MapPin, TrendingUp, Sparkles } from 'lucide-react';
import { EvaluatedNeighborhood, toPersianNum } from '../data/neighborhoods';
import type { CityId, Neighborhood } from '../types/models';
import { MULTI_CITY_CONFIGS, resolveCityIdForNeighborhood, getAllMultiCityNeighborhoods } from '../data/multiCityData';
import { aggregateNeighborhoodMarketMetrics, buildNeighborhoodListingSamples } from '../data/realMarketPriceAggregator';
import { SmartNaturalSearchMatchesSection } from './SmartNaturalSearchMatchesSection';
import { useAreaUnit, useRadarLocale, useIntlCurrency } from './AreaUnitToggle';
import { convertPricePerSqmToUnit, formatAreaShort, formatMillionTomanAsIntlCurrency } from '../utils/areaUnit';
export {
  SearchHistory,
  getRecentSearches,
  recordRecentSearch,
  removeRecentSearch,
  clearAllRecentSearches,
  useSearchHistory,
  RECENT_SEARCHES_STORAGE_KEY,
  MAX_RECENT_SEARCHES,
} from './SearchHistory';
import { SearchHistory, recordRecentSearch } from './SearchHistory';

export const POPULAR_HOOD_NAMES = [
  'سعادت‌آباد',
  'شهرک غرب',
  'پونک',
  'نیاوران',
  'چیتگر',
  'تهران‌پارس غربی',
  'ونک',
  'یوسف‌آباد',
];

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
    const handleGlobalKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInputFocused = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable);
      if (((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') || (!isInputFocused && e.key === '/')) {
        e.preventDefault();
        const searchEl = document.querySelector<HTMLInputElement>('input[aria-label="جست‌وجوی محله"]');
        if (searchEl) { searchEl.focus(); onOpenDropdown(); }
      }
    };
    window.addEventListener('keydown', handleGlobalKey);
    return () => window.removeEventListener('keydown', handleGlobalKey);
  }, [onOpenDropdown]);
}

export interface SearchDropdownMenuProps {
  searchQuery: string; searchMatches: EvaluatedNeighborhood[]; crossCityMatches?: Neighborhood[];
  evaluatedNeighborhoods: EvaluatedNeighborhood[]; mode?: 'rent' | 'buy';
  onSelectNeighborhood: (hood: EvaluatedNeighborhood) => void;
  onSwitchCity?: (cityId: CityId, targetHoodId?: number) => void;
  setMobileSheetOpen: (v: boolean) => void; setSearchQuery: (q: string) => void; setShowSearchDropdown: (v: boolean) => void;
}

export function SearchDropdownMenu({
  searchQuery, searchMatches, crossCityMatches = [], evaluatedNeighborhoods, mode = 'buy',
  onSelectNeighborhood, onSwitchCity, setMobileSheetOpen, setSearchQuery, setShowSearchDropdown,
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
    return `${areaUnit === 'sqft' ? 'هر ft²' : 'متری'} ${toPersianNum(unitBuy)} م (معامله v6.4: ${toPersianNum(unitDeal)} م) · کل ${formatAreaShort(80, areaUnit)}: ${toPersianNum(((n.buyPerSqm * 80) / 1000).toFixed(1))} میلیارد${intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(unitBuy, intlCurrency, radarLocale)} · کل: ${formatMillionTomanAsIntlCurrency(n.buyPerSqm * 80, intlCurrency, radarLocale)})` : ''}${distTag}`;
  };
  useEffect(() => { setHighlightedIndex(0); }, [searchQuery]);
  const allNationwideHoods = useMemo(() => getAllMultiCityNeighborhoods(), []);
  const trendingHoods = useMemo(() => getTrendingNeighborhoods(evaluatedNeighborhoods, searchMatches), [evaluatedNeighborhoods, searchMatches]);
  const handleSelectNeighborhood = (n: EvaluatedNeighborhood) => {
    recordRecentSearch(n.name);
    onSelectNeighborhood(n);
    setMobileSheetOpen(true);
    setSearchQuery('');
    setShowSearchDropdown(false);
  };
  const handleSelectCrossCityNeighborhood = (n: Neighborhood) => {
    const targetCity = resolveCityIdForNeighborhood(n.id);
    recordRecentSearch(n.name);
    if (onSwitchCity) onSwitchCity(targetCity, n.id);
    setMobileSheetOpen(true);
    setSearchQuery('');
    setShowSearchDropdown(false);
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
      if (e.key === 'Escape') { setShowSearchDropdown(false); return; }
      if (visibleMatches.length === 0) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); setHighlightedIndex((prev) => (prev + 1) % visibleMatches.length); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlightedIndex((prev) => (prev - 1 + visibleMatches.length) % visibleMatches.length); }
      else if (e.key === 'Enter' && visibleMatches[highlightedIndex]) { e.preventDefault(); handleSelectNeighborhood(visibleMatches[highlightedIndex]); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [searchQuery, searchMatches, trendingHoods, highlightedIndex]);
  const isQueryEmpty = !searchQuery.trim(); return (
    <div className="absolute right-0 left-0 mt-2 apple-grouped-card dark:bg-slate-900 dark:border-slate-700/80 shadow-xl max-h-96 overflow-y-auto z-50 divide-y divide-slate-200/60 dark:divide-slate-800 animate-in fade-in-0 duration-200">
      {isQueryEmpty ? (
        <div className="py-1">
          <SearchHistory
            onSelectNeighborhood={(name) => handleSelectRecentSearchName(name)}
            evaluatedNeighborhoods={evaluatedNeighborhoods}
            mode={mode}
            showPriceTag={true}
            showClearAll={true}
            showIndividualRemove={true}
            emptyMessage="نام محله مورد نظر خود را برای جست‌وجو وارد کنید."
          />
          {trendingHoods.length > 0 && (
            <div className="border-t border-slate-200/80 dark:border-slate-800">
              <div className="px-3 py-1.5 flex items-center justify-between text-[11px] font-extrabold text-amber-800 dark:text-amber-300 bg-amber-50/60 dark:bg-amber-950/30 border-b border-amber-100/70 dark:border-amber-900/50">
                <span className="flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 stroke-[2]" />
                  <span>محله‌های پرطرفدار و ترند</span>
                </span>
                <span className="text-[10px] text-amber-700 dark:text-amber-400 font-bold">انتخاب سریع</span>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {trendingHoods.map((n, idx) => (
                  <button key={`empty-trending-${n.id}`} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => handleSelectNeighborhood(n)} className={`w-full text-right px-3.5 py-2 transition flex items-center justify-between text-xs cursor-pointer group ${idx === highlightedIndex ? 'bg-amber-50/80 dark:bg-amber-950/40' : 'hover:bg-amber-50/50 dark:hover:bg-slate-800/70'}`}>
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-3 h-3 text-amber-500 group-hover:text-amber-600 transition" />
                      <span className="font-bold text-slate-800 dark:text-slate-100 group-hover:text-amber-800 dark:group-hover:text-amber-300 transition">{n.name}</span>
                      <span className="text-[10px] text-slate-400">({n.zone})</span>
                    </div>
                    <span className="text-emerald-700 dark:text-emerald-400 font-bold tabular-nums text-[11px]">{formatHoodPriceMetric(n)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="border-t border-slate-200/80 dark:border-slate-800">
            <div className="px-3 py-1.5 flex items-center justify-between text-[11px] font-extrabold text-slate-600 dark:text-slate-300 bg-slate-50/90 dark:bg-slate-800/80 border-b border-slate-100 dark:border-slate-800">
              <span>فهرست کامل محلات این منطقه</span>
              <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-bold tabular-nums">{toPersianNum(evaluatedNeighborhoods.length)} محله</span>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-56 overflow-y-auto">
              {evaluatedNeighborhoods.map((n) => (
                <button key={`dir-${n.id}`} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => handleSelectNeighborhood(n)} className="w-full text-right px-3.5 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/70 transition flex items-center justify-between text-xs cursor-pointer group">
                  <div className="flex items-center gap-1.5 truncate">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${n.status === 'green' ? 'bg-emerald-500' : n.status === 'yellow' ? 'bg-amber-500' : 'bg-rose-500'}`} />
                    <span className="font-bold text-slate-800 dark:text-slate-100 group-hover:text-[#007AFF] dark:group-hover:text-emerald-400 truncate">{n.name}</span>
                    <span className="text-[10px] text-slate-400 truncate">({n.zone})</span>
                  </div>
                  <span className="text-emerald-700 dark:text-emerald-400 font-bold tabular-nums text-[11px] shrink-0">{formatHoodPriceMetric(n)}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="py-1">
          <SmartNaturalSearchMatchesSection
            searchQuery={searchQuery}
            evaluatedNeighborhoods={evaluatedNeighborhoods}
            mode={mode}
            onSelectNeighborhood={handleSelectNeighborhood}
          />
          {searchMatches.length > 0 && (
            <div>
              <div className="px-3 py-1 flex items-center justify-between text-[11px] font-extrabold text-slate-500 dark:text-slate-400 bg-slate-50/70 dark:bg-slate-800/70 border-b border-slate-100 dark:border-slate-800">
                <span>نتایج جست‌وجو (↑↓ و Enter)</span>
                <span className="text-[10px] text-slate-400 tabular-nums">
                  {toPersianNum(searchMatches.length)} محله
                </span>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {searchMatches.slice(0, 50).map((n, idx) => (
                  <button
                    key={n.id}
                    type="button"
                    style={{ animationDelay: `${Math.min(idx * 30, 180)}ms` }}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                    onClick={() => handleSelectNeighborhood(n)}
                    className={`w-full text-right px-3.5 py-2.5 transition flex items-center justify-between text-xs cursor-pointer ios-stagger-item group ${
                      idx === highlightedIndex ? 'bg-emerald-50/90 dark:bg-emerald-950/40 text-emerald-950 dark:text-emerald-100' : 'hover:bg-slate-50 dark:hover:bg-slate-800/70'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          n.status === 'green' ? 'bg-emerald-500' : n.status === 'yellow' ? 'bg-amber-500' : 'bg-rose-500'
                        }`}
                      />
                      <span className="font-bold text-slate-900 dark:text-slate-100 group-hover:text-[#007AFF] dark:group-hover:text-emerald-400 transition">{n.name}</span>
                      <span className="text-[10px] text-slate-400">({n.zone})</span>
                      {searchQuery.trim() && !n.name.includes(searchQuery.trim()) && (n.pros.includes(searchQuery.trim()) || (n.bargains?.[0]?.street && n.bargains[0].street.includes(searchQuery.trim()))) && (
                        <span className="px-1.5 py-0.2 rounded bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 text-[9.5px] font-bold">زیرمحله / خیابان</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] font-bold tabular-nums">
                        {toPersianNum(n.overallScore)}/۱۰
                      </span>
                      <span className="text-emerald-700 dark:text-emerald-400 font-bold tabular-nums text-[11px]">
                        {formatHoodPriceMetric(n)}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
          {searchMatches.length === 0 && (
            <div className="px-3.5 py-2.5 text-center text-xs text-slate-400">
              محله‌ای با این نام در این شهر یافت نشد.
            </div>
          )}
          {crossCityMatches.length > 0 && (
            <div className="mt-1 border-t border-slate-200/80 dark:border-slate-800">
              <div className="px-3 py-1.5 flex items-center justify-between text-[11px] font-extrabold text-indigo-900 dark:text-indigo-200 bg-indigo-50/70 dark:bg-indigo-950/40 border-b border-indigo-100 dark:border-indigo-900/50">
                <span>نتایج در سایر استان‌ها و شهرهای ایران</span>
                <span className="text-[10px] text-indigo-700 dark:text-indigo-400 font-bold tabular-nums">{toPersianNum(crossCityMatches.length)} محله</span>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {crossCityMatches.slice(0, 30).map((n) => { const targetCityId = resolveCityIdForNeighborhood(n.id); const cityName = MULTI_CITY_CONFIGS[targetCityId]?.nameFa || targetCityId; return ( <button
                      key={`cross-${n.id}`}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleSelectCrossCityNeighborhood(n)}
                      className="w-full text-right px-3.5 py-2 hover:bg-indigo-50/60 dark:hover:bg-indigo-950/30 transition flex items-center justify-between text-xs cursor-pointer group"
                    >
                      <div className="flex items-center gap-1.5 truncate">
                        <MapPin className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                        <span className="font-bold text-slate-900 dark:text-slate-100 group-hover:text-indigo-700 dark:group-hover:text-indigo-300 truncate">{n.name}</span>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 truncate">({n.zone})</span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900/60 text-indigo-800 dark:text-indigo-300 text-[9.5px] font-bold">
                          پرواز به {cityName} </span>
                        <span className="text-emerald-700 dark:text-emerald-400 font-bold tabular-nums text-[11px]">
                          {formatHoodPriceMetric(n)} </span>
                      </div>
                    </button>
                  ); })} </div>
            </div>
          )} {trendingHoods.length > 0 && ( <div className="mt-1 border-t border-slate-200/80 dark:border-slate-800">
              <div className="px-3 py-1.5 flex items-center justify-between text-[11px] font-extrabold text-amber-800 dark:text-amber-300 bg-amber-50/60 dark:bg-amber-950/30 border-b border-amber-100/70 dark:border-amber-900/50">
                <span className="flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 stroke-[2]" />
                  <span>محله‌های پرطرفدار و ترند</span>
                </span>
                <span className="text-[10px] text-amber-700 dark:text-amber-400 font-bold">پیشنهاد سریع</span>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {trendingHoods.map((n, idx) => ( <button
                    key={`trending-${n.id}`}
                    type="button"
                    style={{ animationDelay: `${(idx + 1) * 45}ms` }}
                    onMouseDown={(e) => e.preventDefault()} onClick={() => handleSelectNeighborhood(n)} className="w-full text-right px-3.5 py-2 hover:bg-amber-50/50 dark:hover:bg-slate-800/70 transition flex items-center justify-between text-xs cursor-pointer group ios-stagger-item"
                  >
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-3 h-3 text-amber-500 group-hover:text-amber-600 transition" />
                      <span className="font-bold text-slate-800 dark:text-slate-100 group-hover:text-amber-800 dark:group-hover:text-amber-300 transition">{n.name}</span>
                      <span className="text-[10px] text-slate-400">({n.zone})</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="px-1.5 py-0.5 rounded-[5px] bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 font-extrabold text-[10px] tabular-nums">
                        {toPersianNum(n.overallScore)} / ۱۰
                      </span>
                      <span className="text-slate-600 dark:text-slate-400 font-bold tabular-nums text-[11px]">
                        {formatHoodPriceMetric(n)} </span>
                    </div>
                  </button>
                ))} </div>
            </div>
          )} </div>
      )} </div>
  ); }