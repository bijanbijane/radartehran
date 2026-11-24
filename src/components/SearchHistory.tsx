import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Clock, Trash2, X, History } from 'lucide-react';
import { EvaluatedNeighborhood, toPersianNum } from '../data/neighborhoods';
import { getAllMultiCityNeighborhoods } from '../data/multiCityData';
import { safeLocalStorageGet, safeLocalStorageSet, safeLocalStorageRemove } from '../utils/security';
import { useAreaUnit, useRadarLocale, useIntlCurrency } from './AreaUnitToggle';
import { convertPricePerSqmToUnit, formatAreaShort, formatMillionTomanAsIntlCurrency } from '../utils/areaUnit';

export const RECENT_SEARCHES_STORAGE_KEY = 'tehran_radar_recent_searches_v1';
export const RECENT_SEARCHES_EVENT = 'tehran_radar_recent_searches_updated';
export const MAX_RECENT_SEARCHES = 5;

export function getRecentSearches(): string[] {
  const loaded = safeLocalStorageGet<string[]>(RECENT_SEARCHES_STORAGE_KEY, []);
  if (!Array.isArray(loaded)) return [];
  return loaded.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).slice(0, MAX_RECENT_SEARCHES);
}

export function recordRecentSearch(hoodName: string, maxItems: number = MAX_RECENT_SEARCHES): string[] {
  const trimmed = hoodName.trim();
  if (!trimmed) return getRecentSearches();
  const current = getRecentSearches().filter((name) => name.toLowerCase() !== trimmed.toLowerCase());
  const updated = [trimmed, ...current].slice(0, maxItems);
  safeLocalStorageSet(RECENT_SEARCHES_STORAGE_KEY, updated);
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    try { window.dispatchEvent(new CustomEvent(RECENT_SEARCHES_EVENT, { detail: updated })); } catch { /* Ignore */ }
  }
  return updated;
}

export function removeRecentSearch(hoodName: string): string[] {
  const trimmed = hoodName.trim();
  if (!trimmed) return getRecentSearches();
  const updated = getRecentSearches().filter((name) => name.toLowerCase() !== trimmed.toLowerCase());
  safeLocalStorageSet(RECENT_SEARCHES_STORAGE_KEY, updated);
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    try { window.dispatchEvent(new CustomEvent(RECENT_SEARCHES_EVENT, { detail: updated })); } catch { /* Ignore */ }
  }
  return updated;
}

export function clearAllRecentSearches(): void {
  safeLocalStorageRemove(RECENT_SEARCHES_STORAGE_KEY);
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    try { window.dispatchEvent(new CustomEvent(RECENT_SEARCHES_EVENT, { detail: [] })); } catch { /* Ignore */ }
  }
}

export function useSearchHistory() {
  const [recentSearches, setRecentSearches] = useState<string[]>(() => getRecentSearches());

  useEffect(() => {
    setRecentSearches(getRecentSearches());
    const handleUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<string[]>;
      setRecentSearches(Array.isArray(customEvent?.detail) ? customEvent.detail : getRecentSearches());
    };
    const handleStorage = (e: StorageEvent) => {
      if (e.key === RECENT_SEARCHES_STORAGE_KEY) setRecentSearches(getRecentSearches());
    };
    if (typeof window !== 'undefined') {
      window.addEventListener(RECENT_SEARCHES_EVENT, handleUpdate);
      window.addEventListener('storage', handleStorage);
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener(RECENT_SEARCHES_EVENT, handleUpdate);
        window.removeEventListener('storage', handleStorage);
      }
    };
  }, []);

  const addSearch = useCallback((name: string) => {
    const updated = recordRecentSearch(name);
    setRecentSearches(updated);
    return updated;
  }, []);

  const removeSearch = useCallback((name: string) => {
    const updated = removeRecentSearch(name);
    setRecentSearches(updated);
    return updated;
  }, []);

  const clearHistory = useCallback(() => {
    clearAllRecentSearches();
    setRecentSearches([]);
  }, []);

  return { recentSearches, addSearch, removeSearch, clearHistory, hasHistory: recentSearches.length > 0 };
}

export interface SearchHistoryProps {
  onSelectNeighborhood: (hoodName: string, matchedHood?: EvaluatedNeighborhood) => void;
  evaluatedNeighborhoods?: EvaluatedNeighborhood[];
  variant?: 'list' | 'chips' | 'menu';
  title?: string;
  className?: string;
  showPriceTag?: boolean;
  showClearAll?: boolean;
  showIndividualRemove?: boolean;
  emptyMessage?: string;
  mode?: 'rent' | 'buy';
}

export function SearchHistory({
  onSelectNeighborhood,
  evaluatedNeighborhoods = [],
  variant = 'list',
  title = 'جست‌وجوهای اخیر',
  className = '',
  showPriceTag = true,
  showClearAll = true,
  showIndividualRemove = true,
  emptyMessage = 'هنوز محله‌ای در تاریخچه جست‌وجوی شما ثبت نشده است.',
  mode = 'buy',
}: SearchHistoryProps): React.ReactElement {
  const { recentSearches, removeSearch, clearHistory } = useSearchHistory();
  const [areaUnit] = useAreaUnit();
  const [radarLocale] = useRadarLocale();
  const [intlCurrency] = useIntlCurrency();
  const allNationwideHoods = useMemo(() => getAllMultiCityNeighborhoods(), []);

  const findMatchedHood = useCallback((name: string): EvaluatedNeighborhood | undefined => {
    const norm = name.trim().toLowerCase();
    const local = evaluatedNeighborhoods.find((h) => h.name.trim().toLowerCase() === norm);
    return local || (allNationwideHoods.find((h) => h.name.trim().toLowerCase() === norm) as unknown as EvaluatedNeighborhood | undefined);
  }, [evaluatedNeighborhoods, allNationwideHoods]);

  const formatHoodPrice = (n: { buyPerSqm: number; rahn80m: number }) => {
    if (mode === 'rent') return `رهن ${formatAreaShort(80, areaUnit)}: ${toPersianNum(n.rahn80m)} م`;
    const unitBuy = Number(convertPricePerSqmToUnit(n.buyPerSqm, areaUnit).toFixed(1));
    return `${areaUnit === 'sqft' ? 'هر ft²' : 'متری'} ${toPersianNum(unitBuy)} م${intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(unitBuy, intlCurrency, radarLocale)})` : ''}`;
  };

  const handleItemClick = (e: React.MouseEvent, name: string) => {
    e.preventDefault();
    onSelectNeighborhood(name, findMatchedHood(name));
  };

  if (recentSearches.length === 0) {
    if (variant === 'chips') return <></>;
    return (
      <div className={`p-4 text-center text-xs text-slate-400 dark:text-slate-500 flex flex-col items-center justify-center gap-1.5 ${className}`}>
        <History className="w-5 h-5 text-slate-300 dark:text-slate-600 stroke-[1.5]" />
        <span>{emptyMessage}</span>
      </div>
    );
  }

  if (variant === 'chips') {
    return (
      <div role="region" aria-label={title} className={`flex flex-wrap items-center gap-1.5 ${className}`}>
        <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1 ml-1">
          <Clock className="w-3 h-3 text-slate-400" />
          <span>{title}:</span>
        </span>
        {recentSearches.map((name) => (
          <span key={name} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold hover:bg-slate-200/80 dark:hover:bg-slate-700 transition">
            <button type="button" onClick={(e) => handleItemClick(e, name)} className="hover:text-[var(--color-brand-600)] dark:hover:text-emerald-400 cursor-pointer">{name}</button>
            {showIndividualRemove && (
              <button type="button" aria-label={`حذف ${name} از تاریخچه`} onClick={(e) => { e.stopPropagation(); removeSearch(name); }} className="text-slate-400 hover:text-rose-500 rounded-full p-0.5 cursor-pointer">
                <X className="w-3 h-3" />
              </button>
            )}
          </span>
        ))}
        {showClearAll && (
          <button type="button" onClick={(e) => { e.stopPropagation(); clearHistory(); }} className="text-[10.5px] text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition font-bold px-1.5 py-0.5 cursor-pointer">
            پاک کردن همه
          </button>
        )}
      </div>
    );
  }

  return (
    <div role="region" aria-label={title} className={`w-full ${className}`}>
      <div className="px-3 py-1.5 flex items-center justify-between text-[11px] font-bold text-slate-500 dark:text-slate-400 bg-slate-50/70 dark:bg-slate-800/70 border-b border-slate-100 dark:border-slate-800">
        <span className="flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5 text-slate-400 stroke-[2]" />
          <span>{title}</span>
          <span className="px-1 py-0.5 rounded bg-slate-200/60 dark:bg-slate-700 text-[9.5px] font-bold tabular-nums">{toPersianNum(recentSearches.length)}</span>
        </span>
        {showClearAll && (
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={(e) => { e.stopPropagation(); clearHistory(); }} className="flex items-center gap-1 text-[10.5px] text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition cursor-pointer" aria-label="پاک کردن همه تاریخچه جست‌وجو">
            <Trash2 className="w-3 h-3 stroke-[1.75]" />
            <span>پاک کردن</span>
          </button>
        )}
      </div>
      <div role="list" className="divide-y divide-slate-100 dark:divide-slate-800">
        {recentSearches.map((name, idx) => {
          const matchedHood = findMatchedHood(name);
          return (
            <div key={name} role="listitem" style={{ animationDelay: `${idx * 40}ms` }} className="w-full text-right px-3.5 py-2 hover:bg-slate-50/90 dark:hover:bg-slate-800/70 transition flex items-center justify-between text-xs group ios-stagger-item">
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={(e) => handleItemClick(e, name)} className="flex items-center gap-2 flex-1 min-w-0 text-right cursor-pointer">
                <Clock className="w-3.5 h-3.5 text-slate-400 group-hover:text-[#007AFF] dark:group-hover:text-emerald-400 shrink-0 transition stroke-[1.75]" />
                <span className="font-bold text-slate-800 dark:text-slate-100 group-hover:text-[#007AFF] dark:group-hover:text-emerald-400 transition truncate">{name}</span>
                {matchedHood?.zone && <span className="text-[10px] text-slate-400 shrink-0">({matchedHood.zone})</span>}
              </button>
              <div className="flex items-center gap-2 shrink-0">
                {showPriceTag && matchedHood && <span className="text-emerald-700 dark:text-emerald-400 font-bold tabular-nums text-[11px]">{formatHoodPrice(matchedHood)}</span>}
                {showIndividualRemove && (
                  <button type="button" aria-label={`حذف ${name} از تاریخچه`} onMouseDown={(e) => e.preventDefault()} onClick={(e) => { e.stopPropagation(); removeSearch(name); }} className="p-1 rounded-md text-slate-300 dark:text-slate-600 hover:text-rose-500 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 opacity-0 group-hover:opacity-100 focus:opacity-100 transition cursor-pointer">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
