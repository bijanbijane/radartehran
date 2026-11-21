/** RT-UI-SEARCH-001 (Stages 27 & 30) | Global Search, Discovery & Recommendation Interface */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BookmarkPlus, Filter, MapPin, RotateCcw, Search, X } from 'lucide-react';
import { MULTI_CITY_CONFIGS, type CityId } from '../../../data/multiCityData';
import { toPersianNum } from '../../../data/neighborhoods';
import { transitionModuleContext } from '../../../interaction-system/interactionEngines';
import type { SavedSearchAlertFrequency, SearchBoundingBox, SearchExecutionResponse, SearchFilterSet, SearchScope, SearchSortOption, SearchViewMode } from '../models/search.types';
import { decodeSearchUrlState, getPlaceHierarchyForCity } from '../services/searchNormalizerAndPlanner';
import { createInitialEmptySearchResponse, postCanonicalSearchQuery } from '../api/searchQueryClient';
import { defaultSearchWorkspaceService } from '../services/searchWorkspaceService';
import { SearchResultsAndDiscoveryGrid } from './SearchResultsAndDiscoveryGrid';
import { GlobalSearchNavQuickAccess } from './globalSearchNavQuickAccess';
import { useGlobalSearchNavQuickAccess } from './useGlobalSearchNavQuickAccess';
import { GlobalSearchLoadErrorBanner, syncSearchHistoryUrl } from './globalSearchHistoryUrl';

export { syncSearchHistoryUrl } from './globalSearchHistoryUrl';

export interface GlobalSearchWorkspaceProps {
  activeCity?: CityId;
  activeNeighborhoodId?: number;
  activeNeighborhoodName?: string;
  viewportBounds?: SearchBoundingBox | null;
  initialQuery?: string;
  onSelectNeighborhoodId?: (hoodId: string) => void;
  onNavigatePath?: (path: string) => void;
}

const SCOPE_TABS: Array<{ id: SearchScope; labelFa: string }> = [
  { id: 'ALL', labelFa: 'همه نتایج' }, { id: 'NEIGHBORHOODS', labelFa: 'محله‌ها' },
  { id: 'PROPERTIES', labelFa: 'املاک' }, { id: 'MARKET', labelFa: 'بازار' },
  { id: 'SERVICES', labelFa: 'خدمات' }, { id: 'KNOWLEDGE', labelFa: 'دانش و پژوهش' },
  { id: 'COMMUNITY', labelFa: 'جامعه' }, { id: 'MAP', labelFa: 'نقشه و مکان' },
];

export const GlobalSearchWorkspace: React.FC<GlobalSearchWorkspaceProps> = ({
  activeCity = 'tehran', activeNeighborhoodId, activeNeighborhoodName, viewportBounds = null,
  initialQuery = '', onSelectNeighborhoodId, onNavigatePath,
}) => {
  const initialDecoded = useMemo(
    () => decodeSearchUrlState(typeof window !== 'undefined' ? window.location.search : ''),
    []
  );
  const [rawQuery, setRawQuery] = useState(initialQuery || initialDecoded.q || '');
  const [activeScope, setActiveScope] = useState<SearchScope>(initialDecoded.scope || 'ALL');
  const [sort, setSort] = useState<SearchSortOption>(initialDecoded.sort || 'RELEVANCE');
  const [viewMode, setViewMode] = useState<SearchViewMode>(initialDecoded.viewMode || 'LIST');
  const [draftFilters, setDraftFilters] = useState<SearchFilterSet>({ ...initialDecoded.filters, cityId: activeCity });
  const [appliedFilters, setAppliedFilters] = useState<SearchFilterSet>({ ...initialDecoded.filters, cityId: activeCity });
  const [filterStatus, setFilterStatus] = useState<'DEFAULT' | 'DRAFT' | 'APPLIED'>('DEFAULT');
  const [contextTransitionBannerFa, setContextTransitionBannerFa] = useState<string | null>(null);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [highlightedIdx, setHighlightedIdx] = useState(-1);
  const [saveAlertFreq, setSaveAlertFreq] = useState<SavedSearchAlertFrequency>('OFF');
  const [savedBannerFa, setSavedBannerFa] = useState<string | null>(null);
  const [degradedScopes, setDegradedScopes] = useState<SearchScope[]>([]);
  const [searchLoadErrorFa, setSearchLoadErrorFa] = useState<string | null>(null);
  const pendingHistoryModeRef = useRef<'push' | 'replace'>('replace');
  const isPopStateRestoreRef = useRef<boolean>(false);
  const searchBoxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!suggestOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target as Node)) {
        setSuggestOpen(false);
      }
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [suggestOpen]);

  const cityNameFa = MULTI_CITY_CONFIGS[activeCity]?.nameFa || 'تهران';
  const cityPlaces = useMemo(() => getPlaceHierarchyForCity(activeCity), [activeCity]);
  const hasValidViewportBounds = Boolean(
    viewportBounds &&
    Number.isFinite(viewportBounds.north) &&
    Number.isFinite(viewportBounds.south) &&
    viewportBounds.north > viewportBounds.south &&
    viewportBounds.east > viewportBounds.west
  );

  const discoveryContext = useMemo(
    () => ({
      cityId: activeCity,
      neighborhoodId: activeNeighborhoodId,
      neighborhoodName: activeNeighborhoodName,
    }),
    [activeCity, activeNeighborhoodId, activeNeighborhoodName]
  );

  const [recommendations, setRecommendations] = useState(() =>
    defaultSearchWorkspaceService.getDiscoveryRecommendations(discoveryContext)
  );
  const [personalizationOn, setPersonalizationOn] = useState(
    () => defaultSearchWorkspaceService.getPrivacySettings().personalizationEnabled
  );

  useEffect(() => {
    setRecommendations(defaultSearchWorkspaceService.getDiscoveryRecommendations(discoveryContext));
  }, [discoveryContext]);

  const latestReqCounter = useRef(0);
  const [searchResponse, setSearchResponse] = useState<SearchExecutionResponse>(() =>
    createInitialEmptySearchResponse(
      initialQuery || initialDecoded.q || '',
      initialDecoded.scope || 'ALL',
      { ...initialDecoded.filters, cityId: activeCity },
      initialDecoded.sort || 'RELEVANCE',
    )
  );

  const prevCityRef = useRef<CityId>(activeCity);
  useEffect(() => {
    if (prevCityRef.current === activeCity) return;
    prevCityRef.current = activeCity;
    pendingHistoryModeRef.current = 'replace';
    const resetSpatial = { cityId: activeCity, neighborhoodId: undefined, districtNumber: undefined, boundingBox: undefined, polygon: undefined, nearPoint: undefined };
    const cleanedFilters: SearchFilterSet = { ...appliedFilters, ...resetSpatial };
    setDraftFilters((prev) => ({ ...prev, ...resetSpatial }));
    setAppliedFilters(cleanedFilters);
    latestReqCounter.current += 1;
    void postCanonicalSearchQuery({
      requestId: `req-city-${latestReqCounter.current}`,
      query: rawQuery,
      scope: activeScope,
      filters: cleanedFilters,
      sort,
      degradedScopes,
    })
      .then((res) => {
        setSearchLoadErrorFa(null);
        setSearchResponse(res);
      })
      .catch((err) => {
        if (err instanceof Error && (err.message === 'STALE_SEARCH_RESPONSE' || err.name === 'AbortError')) return;
        setSearchLoadErrorFa('بارگذاری نتایج جست‌وجو ناموفق بود. اتصال شبکه یا سرور API را بررسی کنید.');
      });
  }, [activeCity]);

  const suggestions = defaultSearchWorkspaceService.getAutocompleteSuggestions(rawQuery, activeCity);
  const navQuickAccess = useGlobalSearchNavQuickAccess(rawQuery);

  const runCommittedSearch = (
    nextQuery: string,
    nextScope: SearchScope = activeScope,
    nextFilters: SearchFilterSet = appliedFilters,
    nextSort: SearchSortOption = sort,
    nextViewMode: SearchViewMode = viewMode,
    nextDegraded: SearchScope[] = degradedScopes,
    historyModeOverride?: 'push' | 'replace',
  ) => {
    latestReqCounter.current += 1;
    const reqId = `req-${latestReqCounter.current}`;
    const scopedFilters: SearchFilterSet = { ...nextFilters, cityId: activeCity };
    void postCanonicalSearchQuery({
      requestId: reqId,
      query: nextQuery,
      scope: nextScope,
      filters: scopedFilters,
      sort: nextSort,
      degradedScopes: nextDegraded,
    })
      .then((res) => {
        setSearchLoadErrorFa(null);
        setSearchResponse(res);
      })
      .catch((err) => {
        if (err instanceof Error && (err.message === 'STALE_SEARCH_RESPONSE' || err.name === 'AbortError')) return;
        setSearchLoadErrorFa('بارگذاری نتایج جست‌وجو ناموفق بود. اتصال شبکه یا سرور API را بررسی کنید.');
      });
    const modeToUse = historyModeOverride || pendingHistoryModeRef.current;
    pendingHistoryModeRef.current = 'replace';
    if (typeof window !== 'undefined') {
      syncSearchHistoryUrl(
        window.history,
        window.location.pathname,
        window.location.search,
        { q: nextQuery, scope: nextScope, sort: nextSort, viewMode: nextViewMode, filters: scopedFilters },
        modeToUse,
        isPopStateRestoreRef.current,
        window.location.hash,
      );
    }
    isPopStateRestoreRef.current = false;
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      runCommittedSearch(rawQuery, activeScope, appliedFilters, sort, viewMode, degradedScopes);
    }, 300);
    return () => clearTimeout(timer);
  }, [rawQuery, activeScope, appliedFilters, sort, viewMode, activeCity, degradedScopes]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handlePopState = () => {
      isPopStateRestoreRef.current = true;
      pendingHistoryModeRef.current = 'replace';
      const decoded = decodeSearchUrlState(window.location.search);
      setRawQuery(decoded.q);
      setActiveScope(decoded.scope);
      setSort(decoded.sort);
      setViewMode(decoded.viewMode);
      const nextFilters: SearchFilterSet = { ...decoded.filters, cityId: activeCity };
      setDraftFilters(nextFilters);
      setAppliedFilters(nextFilters);
      setFilterStatus(Object.keys(decoded.filters).length > 0 ? 'APPLIED' : 'DEFAULT');
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [activeCity]);

  const handleResetFiltersOnly = () => {
    const clean: SearchFilterSet = { cityId: activeCity };
    pendingHistoryModeRef.current = 'push';
    setDraftFilters(clean);
    setAppliedFilters(clean);
    setFilterStatus('DEFAULT');
    setContextTransitionBannerFa(null);
  };

  const handleResetFullSearch = () => {
    const clean: SearchFilterSet = { cityId: activeCity };
    pendingHistoryModeRef.current = 'push';
    setDraftFilters(clean);
    setAppliedFilters(clean);
    setFilterStatus('DEFAULT');
    setActiveScope('ALL');
    setSort('RELEVANCE');
    setRawQuery('');
    setContextTransitionBannerFa(null);
  };

  const handleTransactionChange = (nextTx: SearchFilterSet['transactionType']) => {
    if (draftFilters.transactionType === 'BUY' && (nextTx === 'RENT' || nextTx === 'FULL_MORTGAGE') && draftFilters.maxPriceMillionToman) {
      const trans = transitionModuleContext('buy', 'rent', {
        hoodId: Number(draftFilters.neighborhoodId) || 0,
        dealMode: 'buy',
        targetDealMode: 'rent',
        buyBudgetMillion: draftFilters.maxPriceMillionToman,
      });
      setContextTransitionBannerFa(trans.userNoticeFa ?? null);
      setDraftFilters({ ...draftFilters, transactionType: nextTx, maxPriceMillionToman: undefined });
    } else {
      setContextTransitionBannerFa(null);
      setDraftFilters({ ...draftFilters, transactionType: nextTx });
    }
    setFilterStatus('DRAFT');
  };

  const handleSaveCurrentSearch = () => {
    const rec = defaultSearchWorkspaceService.createSavedSearch({
      titleFa: rawQuery.trim() || `جست‌وجوی منتخب رادار (${cityNameFa})`,
      query: rawQuery, scope: activeScope, filters: appliedFilters, sort, alertFrequency: saveAlertFreq,
    });
    setSavedBannerFa(
      saveAlertFreq === 'OFF'
        ? `جست‌وجوی «${rec.titleFa}» به‌صورت ذخیره موقت در این نشست ثبت شد (بدون اعلان).`
        : `جست‌وجوی «${rec.titleFa}» (ذخیره موقت در این نشست) ثبت شد · درخواست اعلان (${saveAlertFreq}) ثبت شد و در انتظار تأیید سرویس اعلان است.`
    );
  };

  const activeOptionId =
    suggestOpen && highlightedIdx >= 0 && suggestions[highlightedIdx]
      ? `search-option-${suggestions[highlightedIdx].id}`
      : undefined;

  return (
    <section
      data-testid="global-search-workspace"
      data-active-city={activeCity}
      className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-[var(--color-border-subtle)] dark:border-slate-800 space-y-4 text-xs"
      dir="rtl"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <strong className="text-sm sm:text-base font-black text-slate-900 dark:text-white flex items-center gap-1.5">
            <Search className="w-4 h-4 text-[var(--color-brand-600)]" />
            <span>درگاه جست‌وجوی سراسری، کشف اطلاعات و پیشنهادهای هوشمند ({cityNameFa})</span>
          </strong>
          <p className="text-[11px] text-slate-500 mt-0.5">
            پشتیبانی از نرمال‌سازی فارسی، تشخیص نیت، فیلتر مکانی {cityNameFa} و رتبه‌بندی شفاف
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {(['LIST', 'MAP', 'SPLIT'] as SearchViewMode[]).map((m) => (
            <button
              key={m}
              type="button"
              data-testid={`search-view-mode-${m.toLowerCase()}`}
              onClick={() => { pendingHistoryModeRef.current = 'push'; setViewMode(m); }}
              className={`min-h-[38px] px-2.5 py-1 rounded-lg font-bold cursor-pointer ${viewMode === m ? 'bg-[var(--color-brand-600)] text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'}`}
            >
              {m === 'LIST' ? 'فهرست' : m === 'MAP' ? 'نقشه' : 'ترکیبی (فهرست + نقشه)'}
            </button>
          ))}
        </div>
      </div>

      {searchLoadErrorFa ? <GlobalSearchLoadErrorBanner messageFa={searchLoadErrorFa} /> : null}

      <div ref={searchBoxRef} className="relative">
        <div className="flex items-center gap-2 h-11 px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 focus-within:border-[var(--color-brand-600)]">
          <Search className="w-4 h-4 text-[var(--color-brand-600)] shrink-0" />
          <input
            type="text"
            role="combobox"
            aria-expanded={suggestOpen}
            aria-controls="global-search-suggestions-listbox"
            aria-activedescendant={activeOptionId}
            aria-label="جست‌وجوی سراسری محله، ملک، شاخص بازار، خدمات، دانش یا پرسش‌های کاربران"
            data-testid="global-search-input"
            value={rawQuery}
            placeholder={`محله، ملک، خیابان یا شاخص بازار در ${cityNameFa} را جست‌وجو کنید...`}
            onFocus={() => setSuggestOpen(true)}
            onChange={(e) => { pendingHistoryModeRef.current = 'replace'; setRawQuery(e.target.value); setSuggestOpen(true); setHighlightedIdx(-1); }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setSuggestOpen(true); setHighlightedIdx((p) => (p + 1) % Math.max(1, suggestions.length)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlightedIdx((p) => (p <= 0 ? suggestions.length - 1 : p - 1)); }
              else if (e.key === 'Enter') {
                e.preventDefault();
                pendingHistoryModeRef.current = 'push';
                if (highlightedIdx >= 0 && suggestions[highlightedIdx]) {
                  const chosen = suggestions[highlightedIdx].queryText;
                  setRawQuery(chosen);
                  setSuggestOpen(false);
                  runCommittedSearch(chosen, activeScope, appliedFilters, sort, viewMode, degradedScopes, 'push');
                } else {
                  setSuggestOpen(false);
                  runCommittedSearch(rawQuery, activeScope, appliedFilters, sort, viewMode, degradedScopes, 'push');
                }
              }
              else if (e.key === 'Escape') { setSuggestOpen(false); }
            }}
            className="w-full bg-transparent text-xs sm:text-sm font-bold text-slate-900 dark:text-white focus:outline-none"
          />
          {rawQuery && (
            <button type="button" aria-label="پاک‌سازی عبارت جست‌وجو" data-testid="btn-clear-global-search" onClick={() => { pendingHistoryModeRef.current = 'push'; setRawQuery(''); setHighlightedIdx(-1); }} className="p-1 rounded-lg hover:bg-slate-200 text-slate-500 cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {suggestOpen && suggestions.length > 0 && (
          <div id="global-search-suggestions-listbox" role="listbox" data-testid="global-search-suggestions-popover" className="mt-1 p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-lg space-y-1 z-20">
            <div className="flex items-center justify-between px-2 py-1 text-[10.5px] text-slate-400">
              <span>پیشنهادهای دسته‌بندی‌شده ({cityNameFa} · جهت‌نما و Enter)</span>
              <button type="button" onClick={() => setSuggestOpen(false)} className="text-slate-500 hover:underline cursor-pointer">بستن</button>
            </div>
            <GlobalSearchNavQuickAccess
              items={navQuickAccess}
              onCloseSuggestions={() => setSuggestOpen(false)}
              onSelectPath={onNavigatePath}
            />
            {suggestions.map((sug, idx) => (
              <div
                key={sug.id}
                id={`search-option-${sug.id}`}
                role="option"
                aria-selected={highlightedIdx === idx}
                data-testid={`search-suggestion-item-${idx}`}
                onClick={() => {
                  pendingHistoryModeRef.current = 'push';
                  setRawQuery(sug.queryText);
                  setSuggestOpen(false);
                  runCommittedSearch(sug.queryText, activeScope, appliedFilters, sort, viewMode, degradedScopes, 'push');
                }}
                className={`p-2 rounded-lg flex items-center justify-between gap-2 cursor-pointer ${highlightedIdx === idx ? 'bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300' : 'hover:bg-slate-50 dark:hover:bg-slate-800/70'}`}
              >
                <div>
                  <div className="font-bold text-slate-900 dark:text-white">{sug.titleFa}</div>
                  <div className="text-[10.5px] text-slate-500">{sug.subtitleFa}</div>
                </div>
                <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-bold">{sug.scope}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {searchResponse.plan.typoSuggestion && (
        <div data-testid="search-typo-suggestion-banner" className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 flex items-center justify-between gap-2">
          <span className="font-bold text-amber-900 dark:text-amber-200">{searchResponse.plan.typoSuggestion.promptFa} (عبارت اصلی شما حفظ شده است)</span>
          <button type="button" onClick={() => { pendingHistoryModeRef.current = 'push'; setRawQuery(searchResponse.plan.typoSuggestion!.suggestedQuery); }} className="px-2.5 py-1 rounded-lg bg-amber-600 text-white font-bold cursor-pointer">
            جست‌وجوی «{searchResponse.plan.typoSuggestion.suggestedQuery}»
          </button>
        </div>
      )}

      {rawQuery.trim().length > 0 && (
        <div data-testid="search-plan-summary-bar" className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-2 text-[11px]">
          <div className="flex flex-wrap items-center gap-2">
            <span>عبارت نرمال‌شده: <strong>{searchResponse.plan.normalizedQuery}</strong></span>
            <span>· نیت: <strong>{searchResponse.plan.primaryIntent}</strong></span>
            <span>· اطمینان: <strong>{searchResponse.plan.confidence}</strong></span>
          </div>
          <span className="text-slate-500">نسخه سیاست رتبه‌بندی: {searchResponse.rankingPolicyVersion}</span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="حوزه‌های جست‌وجوی سراسری">
        {SCOPE_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeScope === tab.id}
            data-testid={`search-scope-tab-${tab.id.toLowerCase()}`}
            onClick={() => { pendingHistoryModeRef.current = 'push'; setActiveScope(tab.id); }}
            className={`min-h-[38px] px-3 py-1.5 rounded-xl font-bold flex items-center gap-1 cursor-pointer ${activeScope === tab.id ? 'bg-[var(--color-brand-600)] text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'}`}
          >
            <span>{tab.labelFa}</span>
            <span className="tabular-nums opacity-85">({toPersianNum(searchResponse.groupedCounts[tab.id] ?? 0)})</span>
          </button>
        ))}
      </div>

      <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1"><Filter className="w-3.5 h-3.5 text-[var(--color-brand-600)]" /><span>فیلترها ({filterStatus}):</span></span>
            <select aria-label="فیلتر محله" data-testid="search-filter-neighborhood" value={draftFilters.neighborhoodId || ''} onChange={(e) => { setDraftFilters({ ...draftFilters, neighborhoodId: e.target.value || undefined }); setFilterStatus('DRAFT'); }} className="min-h-[38px] p-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 font-bold">
              <option value="">همه محله‌های {cityNameFa}</option>
              {cityPlaces.map((p) => (
                <option key={p.id} value={p.id}>{p.canonicalName}{p.district !== undefined ? ` (منطقه ${toPersianNum(p.district)})` : ''}</option>
              ))}
            </select>
            <select aria-label="نوع معامله" data-testid="search-filter-transaction" value={draftFilters.transactionType || ''} onChange={(e) => handleTransactionChange((e.target.value || undefined) as SearchFilterSet['transactionType'])} className="min-h-[38px] p-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 font-bold">
              <option value="">همه انواع معامله</option><option value="BUY">خرید و فروش</option><option value="RENT">رهن و اجاره</option><option value="FULL_MORTGAGE">رهن کامل</option>
            </select>
            <select aria-label="تعداد اتاق خواب" data-testid="search-filter-bedrooms" value={draftFilters.bedrooms ? String(draftFilters.bedrooms) : ''} onChange={(e) => { setDraftFilters({ ...draftFilters, bedrooms: e.target.value ? Number(e.target.value) : undefined }); setFilterStatus('DRAFT'); }} className="min-h-[38px] p-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 font-bold">
              <option value="">همه تعداد اتاق</option><option value="1">۱ خوابه</option><option value="2">۲ خوابه</option><option value="3">۳ خوابه</option>
            </select>
            <button type="button" data-testid="btn-apply-search-filters" onClick={() => { pendingHistoryModeRef.current = 'push'; const nextF = { ...draftFilters, cityId: activeCity }; setAppliedFilters(nextF); setFilterStatus('APPLIED'); runCommittedSearch(rawQuery, activeScope, nextF, sort, viewMode, degradedScopes, 'push'); }} className="min-h-[38px] px-2.5 py-1.5 rounded-lg bg-[var(--color-brand-600)] text-white font-bold cursor-pointer">اعمال فیلتر</button>
            <button
              type="button"
              data-testid="btn-search-in-map-bounds"
              disabled={!hasValidViewportBounds}
              title={hasValidViewportBounds ? 'افزودن محدوده فعلی نقشه به پیش‌نویس فیلترها' : 'محدوده نقشه هنوز آماده نیست'}
              onClick={() => {
                if (!viewportBounds || !hasValidViewportBounds) return;
                const box: SearchBoundingBox = { north: viewportBounds.north, south: viewportBounds.south, east: viewportBounds.east, west: viewportBounds.west };
                setDraftFilters({ ...draftFilters, cityId: activeCity, boundingBox: box });
                setFilterStatus('DRAFT');
              }}
              className={`min-h-[38px] px-2.5 py-1.5 rounded-lg border font-bold flex items-center gap-1 ${hasValidViewportBounds ? 'border-[var(--color-brand-600)] text-[var(--color-brand-600)] cursor-pointer' : 'border-slate-200 text-slate-400 cursor-not-allowed opacity-60'}`}
            >
              <MapPin className="w-3.5 h-3.5" /><span>جست‌وجو در این محدوده نقشه</span>
            </button>
            <button type="button" data-testid="btn-reset-search-filters" onClick={handleResetFiltersOnly} className="min-h-[38px] px-2 py-1.5 rounded-lg border border-slate-300 text-slate-600 flex items-center gap-1 cursor-pointer"><RotateCcw className="w-3.5 h-3.5" /><span>پاک‌کردن فیلترها</span></button>
            <button type="button" data-testid="btn-reset-full-search" onClick={handleResetFullSearch} className="min-h-[38px] px-2 py-1.5 rounded-lg border border-rose-200 text-rose-700 flex items-center gap-1 cursor-pointer"><span>پاک‌کردن جست‌وجوی کامل</span></button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select aria-label="مرتب‌سازی نتایج" data-testid="search-sort-select" value={sort} onChange={(e) => { pendingHistoryModeRef.current = 'push'; setSort(e.target.value as SearchSortOption); }} className="min-h-[38px] p-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 font-bold">
              <option value="RELEVANCE">مرتبط‌ترین</option><option value="NEWEST">جدیدترین</option><option value="PRICE_ASC">کمترین قیمت پیشنهادی</option><option value="PRICE_DESC">بیشترین قیمت پیشنهادی</option><option value="QUALITY_SCORE_DESC">بالاترین کیفیت مستندات</option>
            </select>
            <select aria-label="تنظیم اعلان جست‌وجوی ذخیره‌شده" value={saveAlertFreq} onChange={(e) => setSaveAlertFreq(e.target.value as SavedSearchAlertFrequency)} className="min-h-[38px] p-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-300">
              <option value="OFF">ذخیره بدون اعلان</option><option value="INSTANT">درخواست اعلان فوری</option><option value="DAILY">درخواست خلاصه روزانه</option><option value="WEEKLY">درخواست خلاصه هفتگی</option>
            </select>
            <button type="button" data-testid="btn-save-current-search" onClick={handleSaveCurrentSearch} className="min-h-[38px] px-2.5 py-1.5 rounded-lg bg-[var(--color-brand-600)] text-white font-bold flex items-center gap-1 cursor-pointer"><BookmarkPlus className="w-3.5 h-3.5" /><span>ذخیره جست‌وجو</span></button>
          </div>
        </div>
        {contextTransitionBannerFa && <div data-testid="search-context-transition-banner" className="text-amber-700 dark:text-amber-300 font-bold">{contextTransitionBannerFa}</div>}
        {savedBannerFa && <div data-testid="saved-search-confirmation-banner" className="text-emerald-700 font-bold">{savedBannerFa}</div>}
      </div>

      <SearchResultsAndDiscoveryGrid
        searchResponse={searchResponse}
        viewMode={viewMode}
        recommendations={recommendations}
        personalizationOn={personalizationOn}
        onTogglePersonalization={(next) => {
          setPersonalizationOn(next);
          defaultSearchWorkspaceService.setPersonalizationEnabled(next);
          setRecommendations(defaultSearchWorkspaceService.getDiscoveryRecommendations(discoveryContext));
        }}
        onDismissRecommendation={(id) => {
          defaultSearchWorkspaceService.dismissRecommendation(id);
          setRecommendations(defaultSearchWorkspaceService.getDiscoveryRecommendations(discoveryContext));
        }}
        onResetFilters={handleResetFiltersOnly}
        onApplySuggestedQuery={(sq) => { handleResetFiltersOnly(); setRawQuery(sq); }}
        onSelectNeighborhoodId={onSelectNeighborhoodId}
        onNavigatePath={onNavigatePath}
        onRetryFailedSources={() => setDegradedScopes([])}
      />
    </section>
  );
};
