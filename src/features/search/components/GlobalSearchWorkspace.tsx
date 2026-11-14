/**
 * RT-UI-SEARCH-001 (Stages 27 & 30) | Global Search, Discovery & Recommendation Interface
 */

import React, { useEffect, useRef, useState } from 'react';
import { BookmarkPlus, Filter, MapPin, RotateCcw, Search, X } from 'lucide-react';
import { toPersianNum } from '../../../data/neighborhoods';
import type {
  SavedSearchAlertFrequency,
  SearchExecutionResponse,
  SearchFilterSet,
  SearchScope,
  SearchSortOption,
  SearchViewMode,
} from '../models/search.types';
import { decodeSearchUrlState, encodeSearchUrlState, PLACE_HIERARCHY_REGISTRY } from '../services/searchNormalizerAndPlanner';
import { defaultSearchEngine } from '../services/searchOrchestratorEngine';
import { defaultSearchWorkspaceService } from '../services/searchWorkspaceService';
import { SearchResultsAndDiscoveryGrid } from './SearchResultsAndDiscoveryGrid';

export interface GlobalSearchWorkspaceProps {
  initialQuery?: string;
  onSelectNeighborhoodId?: (hoodId: string) => void;
  onNavigatePath?: (path: string) => void;
}

const SCOPE_TABS: Array<{ id: SearchScope; labelFa: string }> = [
  { id: 'ALL', labelFa: 'همه نتایج' },
  { id: 'NEIGHBORHOODS', labelFa: 'محله‌ها' },
  { id: 'PROPERTIES', labelFa: 'املاک' },
  { id: 'MARKET', labelFa: 'بازار' },
  { id: 'SERVICES', labelFa: 'خدمات' },
  { id: 'KNOWLEDGE', labelFa: 'دانش و پژوهش' },
  { id: 'COMMUNITY', labelFa: 'جامعه' },
  { id: 'MAP', labelFa: 'نقشه و مکان' },
];

export const GlobalSearchWorkspace: React.FC<GlobalSearchWorkspaceProps> = ({
  initialQuery = '',
  onSelectNeighborhoodId,
  onNavigatePath,
}) => {
  const initialDecoded = decodeSearchUrlState(typeof window !== 'undefined' ? window.location.search : '');
  const [rawQuery, setRawQuery] = useState(initialQuery || initialDecoded.q || '');
  const [activeScope, setActiveScope] = useState<SearchScope>(initialDecoded.scope || 'ALL');
  const [sort, setSort] = useState<SearchSortOption>(initialDecoded.sort || 'RELEVANCE');
  const [viewMode, setViewMode] = useState<SearchViewMode>('LIST');
  const [draftFilters, setDraftFilters] = useState<SearchFilterSet>(initialDecoded.filters || {});
  const [appliedFilters, setAppliedFilters] = useState<SearchFilterSet>(initialDecoded.filters || {});
  const [filterStatus, setFilterStatus] = useState<'DEFAULT' | 'DRAFT' | 'APPLIED'>('DEFAULT');
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [highlightedIdx, setHighlightedIdx] = useState(-1);
  const [saveAlertFreq, setSaveAlertFreq] = useState<SavedSearchAlertFrequency>('OFF');
  const [savedBannerFa, setSavedBannerFa] = useState<string | null>(null);
  const [recommendations, setRecommendations] = useState(() =>
    defaultSearchWorkspaceService.getDiscoveryRecommendations('سعادت‌آباد')
  );
  const [personalizationOn, setPersonalizationOn] = useState(
    () => defaultSearchWorkspaceService.getPrivacySettings().personalizationEnabled
  );

  const latestReqCounter = useRef(0);
  const [searchResponse, setSearchResponse] = useState<SearchExecutionResponse>(() =>
    defaultSearchEngine.executeSearch({
      requestId: 'req-init', rawQuery: initialQuery || initialDecoded.q || '',
      scope: initialDecoded.scope || 'ALL', explicitFilters: initialDecoded.filters || {}, sort: initialDecoded.sort || 'RELEVANCE',
    })
  );

  const suggestions = defaultSearchWorkspaceService.getAutocompleteSuggestions(rawQuery);

  const runCommittedSearch = (
    nextQuery: string,
    nextScope: SearchScope = activeScope,
    nextFilters: SearchFilterSet = appliedFilters,
    nextSort: SearchSortOption = sort
  ) => {
    latestReqCounter.current += 1;
    const reqId = `req-${latestReqCounter.current}`;
    const res = defaultSearchEngine.executeSearch({
      requestId: reqId, rawQuery: nextQuery, scope: nextScope, explicitFilters: nextFilters, sort: nextSort,
    });
    setSearchResponse(res);
    if (nextQuery.trim()) {
      defaultSearchWorkspaceService.recordSearchHistory({
        rawQuery: nextQuery, scope: nextScope, filters: nextFilters, resultCount: res.totalCount,
      });
    }
    if (typeof window !== 'undefined') {
      const qs = encodeSearchUrlState({ q: nextQuery, scope: nextScope, sort: nextSort, filters: nextFilters });
      window.history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => { runCommittedSearch(rawQuery, activeScope, appliedFilters, sort); }, 180);
    return () => clearTimeout(timer);
  }, [rawQuery, activeScope, appliedFilters, sort]);

  const handleResetAllFilters = () => {
    setDraftFilters({}); setAppliedFilters({}); setFilterStatus('DEFAULT'); setRawQuery('');
  };

  const handleSaveCurrentSearch = () => {
    const rec = defaultSearchWorkspaceService.createSavedSearch({
      titleFa: rawQuery.trim() || 'جست‌وجوی منتخب رادار',
      query: rawQuery, scope: activeScope, filters: appliedFilters, sort, alertFrequency: saveAlertFreq,
    });
    setSavedBannerFa(
      saveAlertFreq === 'OFF'
        ? `جست‌وجوی «${rec.titleFa}» بدون فعال‌سازی اعلان در حساب شما ذخیره شد.`
        : `جست‌وجوی «${rec.titleFa}» با اعلان «${saveAlertFreq}» ذخیره شد.`
    );
  };

  return (
    <section
      data-testid="global-search-workspace"
      className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-[#DCE3DF] dark:border-slate-800 space-y-4 text-xs"
      dir="rtl"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <strong className="text-sm sm:text-base font-black text-slate-900 dark:text-white flex items-center gap-1.5">
            <Search className="w-4 h-4 text-[#176B63]" />
            <span>درگاه جست‌وجوی سراسری، کشف اطلاعات و پیشنهادهای هوشمند رادار تهران</span>
          </strong>
          <p className="text-[11px] text-slate-500 mt-0.5">
            پشتیبانی از نرمال‌سازی فارسی (نیم‌فاصله، اعداد، ی/ک)، تشخیص نیت، فیلتر مکانی و رتبه‌بندی شفاف
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {(['LIST', 'MAP', 'SPLIT'] as SearchViewMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              data-testid={`search-view-mode-${mode.toLowerCase()}`}
              onClick={() => setViewMode(mode)}
              className={`px-2.5 py-1 rounded-lg font-bold cursor-pointer ${viewMode === mode ? 'bg-[#176B63] text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'}`}
            >
              {mode === 'LIST' ? 'فهرست' : mode === 'MAP' ? 'نقشه' : 'ترکیبی (فهرست + نقشه)'}
            </button>
          ))}
        </div>
      </div>

      <div className="relative">
        <div className="flex items-center gap-2 h-11 px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 focus-within:border-[#176B63]">
          <Search className="w-4 h-4 text-[#176B63] shrink-0" />
          <input
            type="text"
            role="combobox"
            aria-expanded={suggestOpen}
            aria-controls="global-search-suggestions-listbox"
            aria-label="جست‌وجوی سراسری محله، ملک، شاخص بازار، خدمات، دانش یا پرسش‌های کاربران"
            data-testid="global-search-input"
            value={rawQuery}
            placeholder="محله، ملک، خیابان، شاخص قیمت، کارشناس ارزیابی یا پرسش حقوقی را جست‌وجو کنید..."
            onFocus={() => setSuggestOpen(true)}
            onChange={(e) => { setRawQuery(e.target.value); setSuggestOpen(true); setHighlightedIdx(-1); }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setSuggestOpen(true); setHighlightedIdx((p) => (p + 1) % Math.max(1, suggestions.length)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlightedIdx((p) => (p <= 0 ? suggestions.length - 1 : p - 1)); }
              else if (e.key === 'Enter' && highlightedIdx >= 0 && suggestions[highlightedIdx]) { e.preventDefault(); setRawQuery(suggestions[highlightedIdx].queryText); setSuggestOpen(false); }
              else if (e.key === 'Escape') { setSuggestOpen(false); }
            }}
            className="w-full bg-transparent text-xs sm:text-sm font-bold text-slate-900 dark:text-white focus:outline-none"
          />
          {rawQuery && (
            <button type="button" aria-label="پاک‌سازی عبارت جست‌وجو" data-testid="btn-clear-global-search" onClick={() => { setRawQuery(''); setHighlightedIdx(-1); }} className="p-1 rounded-lg hover:bg-slate-200 text-slate-500 cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {suggestOpen && suggestions.length > 0 && (
          <div id="global-search-suggestions-listbox" role="listbox" data-testid="global-search-suggestions-popover" className="mt-1 p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-lg space-y-1 z-20">
            <div className="flex items-center justify-between px-2 py-1 text-[10.5px] text-slate-400">
              <span>پیشنهادهای دسته‌بندی‌شده (حداکثر ۸ مورد · جهت‌نما و Enter)</span>
              <button type="button" onClick={() => setSuggestOpen(false)} className="text-slate-500 hover:underline cursor-pointer">بستن</button>
            </div>
            {suggestions.map((sug, idx) => (
              <div
                key={sug.id}
                role="option"
                aria-selected={highlightedIdx === idx}
                data-testid={`search-suggestion-item-${idx}`}
                onClick={() => { setRawQuery(sug.queryText); setSuggestOpen(false); }}
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
          <button type="button" onClick={() => setRawQuery(searchResponse.plan.typoSuggestion!.suggestedQuery)} className="px-2.5 py-1 rounded-lg bg-amber-600 text-white font-bold cursor-pointer">
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
            onClick={() => setActiveScope(tab.id)}
            className={`px-3 py-1.5 rounded-xl font-bold flex items-center gap-1 cursor-pointer ${activeScope === tab.id ? 'bg-[#176B63] text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'}`}
          >
            <span>{tab.labelFa}</span>
            <span className="tabular-nums opacity-85">({toPersianNum(searchResponse.groupedCounts[tab.id] ?? 0)})</span>
          </button>
        ))}
      </div>

      <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1"><Filter className="w-3.5 h-3.5 text-[#176B63]" /><span>فیلترها ({filterStatus}):</span></span>
            <select aria-label="فیلتر محله" data-testid="search-filter-neighborhood" value={draftFilters.neighborhoodId || ''} onChange={(e) => { setDraftFilters({ ...draftFilters, neighborhoodId: e.target.value || undefined }); setFilterStatus('DRAFT'); }} className="p-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 font-bold">
              <option value="">همه محله‌های تهران</option>
              {PLACE_HIERARCHY_REGISTRY.map((p) => (<option key={p.id} value={p.id}>{p.canonicalName} (منطقه {toPersianNum(p.district)})</option>))}
            </select>
            <select aria-label="تعداد اتاق خواب" data-testid="search-filter-bedrooms" value={draftFilters.bedrooms ? String(draftFilters.bedrooms) : ''} onChange={(e) => { setDraftFilters({ ...draftFilters, bedrooms: e.target.value ? Number(e.target.value) : undefined }); setFilterStatus('DRAFT'); }} className="p-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 font-bold">
              <option value="">همه تعداد اتاق</option>
              <option value="1">۱ خوابه</option><option value="2">۲ خوابه</option><option value="3">۳ خوابه</option>
            </select>
            <button type="button" data-testid="btn-apply-search-filters" onClick={() => { setAppliedFilters({ ...draftFilters }); setFilterStatus(Object.keys(draftFilters).length > 0 ? 'APPLIED' : 'DEFAULT'); }} className="px-2.5 py-1.5 rounded-lg bg-[#176B63] text-white font-bold cursor-pointer">اعمال فیلتر</button>
            <button type="button" data-testid="btn-search-in-map-bounds" onClick={() => { const updated = { ...appliedFilters, boundingBox: { north: 35.83, south: 35.74, east: 51.48, west: 51.31 } }; setDraftFilters(updated); setAppliedFilters(updated); setFilterStatus('APPLIED'); }} className="px-2.5 py-1.5 rounded-lg border border-[#176B63] text-[#176B63] font-bold flex items-center gap-1 cursor-pointer"><MapPin className="w-3.5 h-3.5" /><span>جست‌وجو در این محدوده نقشه</span></button>
            <button type="button" data-testid="btn-reset-search-filters" onClick={handleResetAllFilters} className="px-2 py-1.5 rounded-lg border border-slate-300 text-slate-600 flex items-center gap-1 cursor-pointer"><RotateCcw className="w-3.5 h-3.5" /><span>حذف فیلترها</span></button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select aria-label="مرتب‌سازی نتایج" data-testid="search-sort-select" value={sort} onChange={(e) => setSort(e.target.value as SearchSortOption)} className="p-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 font-bold">
              <option value="RELEVANCE">مرتبط‌ترین</option><option value="NEWEST">جدیدترین</option><option value="PRICE_ASC">کمترین قیمت پیشنهادی</option><option value="PRICE_DESC">بیشترین قیمت پیشنهادی</option><option value="QUALITY_SCORE_DESC">بالاترین کیفیت مستندات</option>
            </select>
            <select aria-label="تنظیم اعلان جست‌وجوی ذخیره‌شده" value={saveAlertFreq} onChange={(e) => setSaveAlertFreq(e.target.value as SavedSearchAlertFrequency)} className="p-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-300">
              <option value="OFF">ذخیره بدون اعلان</option><option value="INSTANT">اعلان فوری تغییرات معنادار</option><option value="DAILY">خلاصه روزانه</option><option value="WEEKLY">خلاصه هفتگی</option>
            </select>
            <button type="button" data-testid="btn-save-current-search" onClick={handleSaveCurrentSearch} className="px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white font-bold flex items-center gap-1 cursor-pointer"><BookmarkPlus className="w-3.5 h-3.5" /><span>ذخیره جست‌وجو</span></button>
          </div>
        </div>
        {savedBannerFa && <div data-testid="saved-search-confirmation-banner" className="text-emerald-700 font-bold">{savedBannerFa}</div>}
      </div>

      <SearchResultsAndDiscoveryGrid
        searchResponse={searchResponse}
        recommendations={recommendations}
        personalizationOn={personalizationOn}
        onTogglePersonalization={(next) => {
          setPersonalizationOn(next);
          defaultSearchWorkspaceService.setPersonalizationEnabled(next);
          setRecommendations(defaultSearchWorkspaceService.getDiscoveryRecommendations('سعادت‌آباد'));
        }}
        onDismissRecommendation={(id) => {
          defaultSearchWorkspaceService.dismissRecommendation(id);
          setRecommendations(defaultSearchWorkspaceService.getDiscoveryRecommendations('سعادت‌آباد'));
        }}
        onResetFilters={handleResetAllFilters}
        onApplySuggestedQuery={(sq) => { setAppliedFilters({}); setDraftFilters({}); setRawQuery(sq); }}
        onSelectNeighborhoodId={onSelectNeighborhoodId}
        onNavigatePath={onNavigatePath}
      />
    </section>
  );
};
