import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Search, ArrowLeftRight, Heart, LayoutGrid, List, ArrowUpRight, Scale, X } from 'lucide-react';
import { toPersianNum, type EvaluatedNeighborhood } from '../../data/neighborhoods';
import { formatAreaShort, formatMillionTomanAsIntlCurrency, type PrimaryViewId } from '../../utils/areaUnit';
import { useAreaUnit, useIntlCurrency, useRadarLocale } from '../AreaUnitToggle';
import { useExchangeRateSnapshot } from '../../features/commerce/services/exchangeRateClient';
import { matchesPersianSearch } from '../../utils/security';
import { explainNeighborhoodRecommendation } from '../useEvaluatedNeighborhoods';
import { useDealPriceByHoodIdMap } from '../useDealPriceByHoodIdMap';
import { DiscoverSelectedHoodEpistemicBanner } from './DiscoverSelectedHoodEpistemicBanner';
import { isCoordInsideStoredViewport, updateMapAdvancedOverlayState, useMapAdvancedOverlayState } from '../mapAdvancedLayers';
import { CasperInstantVerdictCard } from '../casper/CasperInstantVerdictCard';
import { computePaginationSlice } from '../../utils/productViewRouterShellClasses';
import { RadarPaginationBar } from '../common/RadarPaginationBar';
import { GlobalSearchWorkspace } from '../../features/search/components/GlobalSearchWorkspace';
import { PublicDataProvenanceCard } from '../../features/data-governance/components/PublicDataProvenanceCard';
import { resolveCityIdForNeighborhood } from '../../data/multiCityData';
import type { CityId } from '../../types/models';
import { aggregateNeighborhoodMarketMetrics, buildNeighborhoodListingSamples } from '../../data/realMarketPriceAggregator';
import { resolveGovernanceEntityId } from '../../features/data-governance/services/placeIdentityMappers';
import { getNeighborhoodPricePresentation, getPriceBracketOptions, matchesFinancialBracket, type PriceBracketId } from '../../features/neighborhoods/services/neighborhoodPricePresentation';

export interface ProductDiscoverViewProps {
  evaluatedNeighborhoods: EvaluatedNeighborhood[]; selectedHood: EvaluatedNeighborhood; onSelectNeighborhood: (hood: EvaluatedNeighborhood) => void;
  favoriteHoodIds: number[]; onToggleFavorite: (id: number) => void; onOpenInspector: (hood: EvaluatedNeighborhood) => void; onOpenCompare: (id1: number, id2: number) => void;
  onNavigateView: (view: PrimaryViewId) => void; activeCity?: CityId; mode: 'rent' | 'buy'; onChangeMode?: (m: 'rent' | 'buy') => void; targetSqm: number;
}
export function ProductDiscoverView(p: ProductDiscoverViewProps): React.ReactElement {
  const [areaUnit] = useAreaUnit(), [intlCurrency] = useIntlCurrency(), [radarLocale] = useRadarLocale();
  const rateState = useExchangeRateSnapshot();
  const isEn = radarLocale === 'en';
  const activeCity: CityId = p.activeCity ?? resolveCityIdForNeighborhood(p.selectedHood.id);
  const { filterRankingByViewport, viewportBounds, comparisonArc } = useMapAdvancedOverlayState();
  const [query, setQuery] = useState<string>(''), [statusFilter, setStatusFilter] = useState<'all' | 'green' | 'yellow' | 'red'>('all');
  const [zoneFilter, setZoneFilter] = useState<string>('all'), [priceBracket, setPriceBracket] = useState<PriceBracketId>('all');
  const [onlyFavorites, setOnlyFavorites] = useState<boolean>(false), [onlyWithBargains, setOnlyWithBargains] = useState<boolean>(false);
  const [sortBy, setSortBy] = useState<'score' | 'price_asc' | 'price_desc' | 'rahn_asc' | 'air'>('score'), [layoutMode, setLayoutMode] = useState<'grid' | 'list'>('grid');
  const [currentPage, setCurrentPage] = useState<number>(1), [pageSize, setPageSize] = useState<number>(12);
  const resultsTopRef = useRef<HTMLDivElement | null>(null);
  const zones = useMemo(() => { const s = new Set<string>(); p.evaluatedNeighborhoods.forEach((h) => { if (h.zone) s.add(h.zone); }); return Array.from(s); }, [p.evaluatedNeighborhoods]);
  const inViewportHoods = useMemo(() => {
    if (!viewportBounds) return [];
    return p.evaluatedNeighborhoods.filter((h) => isCoordInsideStoredViewport(h.lat, h.lng, viewportBounds));
  }, [p.evaluatedNeighborhoods, viewportBounds]);
  const dealPriceByHoodId = useDealPriceByHoodIdMap(p.evaluatedNeighborhoods);
  const selectedProvenanceStats = useMemo(() => {
    const live = buildNeighborhoodListingSamples(p.selectedHood);
    const agg = aggregateNeighborhoodMarketMetrics(p.selectedHood.id, p.selectedHood.name, p.selectedHood.buyPerSqm, live);
    return { agg, syntheticCount: Math.max(0, (p.selectedHood.bargains?.length || 0) - live.length) };
  }, [p.selectedHood]);
  const filtered = useMemo(() => {
    let list = filterRankingByViewport ? inViewportHoods : p.evaluatedNeighborhoods;
    if (statusFilter !== 'all') list = list.filter((h) => h.status === statusFilter);
    const dealSqm = (h: EvaluatedNeighborhood) => dealPriceByHoodId.get(h.id) ?? h.buyPerSqm;
    if (priceBracket !== 'all') list = list.filter((h) => matchesFinancialBracket(h, p.mode, p.targetSqm, dealSqm(h), priceBracket));
    if (zoneFilter !== 'all') list = list.filter((h) => h.zone === zoneFilter);
    if (onlyFavorites) list = list.filter((h) => p.favoriteHoodIds.includes(h.id));
    if (onlyWithBargains) list = list.filter((h) => (h.bargains?.length || 0) > 0);
    if (query.trim()) {
      const q = query.trim();
      list = list.filter((h) => matchesPersianSearch(h.name, q) || matchesPersianSearch(h.zone, q) || matchesPersianSearch(h.pros, q) || Boolean(h.bargains?.some((b) => (b.street && matchesPersianSearch(b.street, q)) || (b.title && matchesPersianSearch(b.title, q)))));
    }
    return [...list].sort((a, b) => {
      if (sortBy === 'score') return b.overallScore - a.overallScore;
      if (sortBy === 'air') return b.air - a.air;
      if (sortBy === 'rahn_asc') return (a.rahn80m * (p.targetSqm / 80)) - (b.rahn80m * (p.targetSqm / 80));
      if (sortBy === 'price_asc') return dealSqm(a) - dealSqm(b);
      return dealSqm(b) - dealSqm(a);
    });
  }, [p.evaluatedNeighborhoods, inViewportHoods, filterRankingByViewport, statusFilter, priceBracket, zoneFilter, onlyFavorites, onlyWithBargains, p.favoriteHoodIds, p.mode, p.targetSqm, query, sortBy, dealPriceByHoodId]);
  const paginationSlice = useMemo(() => computePaginationSlice(filtered, currentPage, pageSize), [filtered, currentPage, pageSize]);
  useEffect(() => { if (paginationSlice.totalPages > 0 && currentPage > paginationSlice.totalPages) setCurrentPage(paginationSlice.totalPages); }, [currentPage, paginationSlice.totalPages]);
  const handlePageChange = (nextPage: number) => { setCurrentPage(nextPage); resultsTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); };
  const topFilteredScore = useMemo(() => (filtered.length > 0 ? Math.max(...filtered.map((h) => h.overallScore)) : undefined), [filtered]);
  const tiedTopCount = useMemo(() => (topFilteredScore !== undefined ? filtered.filter((h) => Math.abs(h.overallScore - topFilteredScore) <= 0.3).length : 0), [filtered, topFilteredScore]);
  const hasActiveFilters = Boolean(query.trim() || statusFilter !== 'all' || priceBracket !== 'all' || zoneFilter !== 'all' || onlyFavorites || onlyWithBargains || filterRankingByViewport);
  const resetAllFilters = () => { setQuery(''); setStatusFilter('all'); setPriceBracket('all'); setZoneFilter('all'); setOnlyFavorites(false); setOnlyWithBargains(false); setCurrentPage(1); updateMapAdvancedOverlayState({ filterRankingByViewport: false }); };
  const toggleComparisonArc = (hood: EvaluatedNeighborhood) => {
    const isCurrentArc = comparisonArc.active && ((comparisonArc.hoodA?.id === p.selectedHood.id && comparisonArc.hoodB?.id === hood.id) || (comparisonArc.hoodB?.id === p.selectedHood.id && comparisonArc.hoodA?.id === hood.id));
    updateMapAdvancedOverlayState({ comparisonArc: { active: !isCurrentArc, isPinned: !isCurrentArc, hoodA: p.selectedHood, hoodB: hood } });
  };
  return (
    <div className="w-full max-w-6xl mx-auto px-4 py-6 sm:py-8 space-y-6 animate-fadeIn" data-testid="product-discover-view">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <span className="text-[11px] font-bold tracking-wider text-emerald-600 dark:text-emerald-400 block mb-1">{isEn ? 'Neighborhood Discovery & Comparison · Synced with Live Map' : 'اکتشاف و مقایسه جامع محلات · همگام با نقشه زنده'}</span>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">{isEn ? 'Residential Neighborhood Explorer' : 'کاشف محله‌های مسکونی'}</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">ارزیابی تحلیلی {toPersianNum(filtered.length)} محله بر پایه کیفیت زندگی، تناسب با بودجه و سناریوی معامله (مدل v6.4 — غیرثبتی)</p>
          <DiscoverSelectedHoodEpistemicBanner hood={p.selectedHood} cityId={activeCity} allNeighborhoods={p.evaluatedNeighborhoods} />
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button type="button" disabled={!viewportBounds} aria-pressed={filterRankingByViewport} onClick={() => { setCurrentPage(1); updateMapAdvancedOverlayState({ filterRankingByViewport: !filterRankingByViewport }); }} className={`px-2.5 py-1.5 rounded-lg border text-xs font-bold transition whitespace-nowrap ${!viewportBounds ? 'opacity-50 cursor-not-allowed border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 text-slate-400' : filterRankingByViewport ? 'bg-emerald-600 text-white border-emerald-600 cursor-pointer' : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-100 cursor-pointer'}`} title={!viewportBounds ? (isEn ? 'Map viewport bounds not ready yet' : 'محدوده نقشه هنوز آماده نیست') : (isEn ? 'Show only neighborhoods in current map viewport' : 'نمایش فقط محله‌های واقع در کادر فعلی نقشه زنده')}>{isEn ? `Map Viewport (${inViewportHoods.length})` : `فقط کادر نقشه (${toPersianNum(inViewportHoods.length)})`}</button>
          <div className="flex items-center border border-slate-200 dark:border-slate-800 rounded-lg p-0.5 bg-slate-50/80 dark:bg-slate-900/80">
            <button type="button" onClick={() => setLayoutMode('grid')} title="نمای شبکه‌ای" aria-label="نمای شبکه‌ای" className={`p-1.5 rounded-md transition cursor-pointer ${layoutMode === 'grid' ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-xs' : 'text-slate-400 hover:text-slate-700'}`}><LayoutGrid className="w-3.5 h-3.5" /></button>
            <button type="button" onClick={() => setLayoutMode('list')} title="نمای فهرستی" aria-label="نمای فهرستی" className={`p-1.5 rounded-md transition cursor-pointer ${layoutMode === 'list' ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-xs' : 'text-slate-400 hover:text-slate-700'}`}><List className="w-3.5 h-3.5" /></button>
          </div>
        </div>
      </div>

      <GlobalSearchWorkspace />
      <PublicDataProvenanceCard entityId={resolveGovernanceEntityId(activeCity, p.selectedHood.id)} neighborhoodNameFa={p.selectedHood.name} sampleCount={selectedProvenanceStats.agg.eligibleObservedCount} uniqueEntityCount={null} observedSampleCount={selectedProvenanceStats.agg.observedSampleCount} syntheticSampleCount={selectedProvenanceStats.syntheticCount} />
      <CasperInstantVerdictCard evaluatedNeighborhoods={p.evaluatedNeighborhoods} selectedHood={p.selectedHood} onSelectNeighborhood={p.onSelectNeighborhood} targetSqm={p.targetSqm} onOpenInspector={p.onOpenInspector} />

      <div ref={resultsTopRef} className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 space-y-3.5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input type="text" aria-label={isEn ? 'Search neighborhood or district' : 'جست‌وجوی سریع نام محله یا منطقه'} value={query} onChange={(e) => { setQuery(e.target.value); setCurrentPage(1); }} placeholder={isEn ? 'Search neighborhood or district...' : 'جست‌وجوی سریع نام محله یا منطقه...'} className="w-full pr-9 pl-7 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-slate-900 dark:focus:border-white transition" />
            {query && <button type="button" aria-label="پاک کردن عبارت جستجو" onClick={() => { setQuery(''); setCurrentPage(1); }} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"><X className="w-3.5 h-3.5" /></button>}
          </div>
          <div className="flex items-center gap-1 overflow-x-auto text-xs">
            {(['all', 'green', 'yellow', 'red'] as const).map((st) => (
              <button key={st} type="button" onClick={() => { setStatusFilter(st); setCurrentPage(1); }} className={`px-3 py-1.5 rounded-lg transition cursor-pointer whitespace-nowrap text-xs font-semibold ${statusFilter === st ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900' : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-300'}`}>
                {st === 'all' ? (isEn ? 'All' : 'تمام محله‌ها') : st === 'green' ? (isEn ? 'In Budget' : 'همخوان با بودجه') : st === 'yellow' ? (isEn ? 'Stretch' : 'مرزی') : (isEn ? 'Above Budget' : 'فراتر از بودجه')}
              </button>
            ))}
            <button type="button" aria-pressed={onlyFavorites} onClick={() => { setOnlyFavorites((v) => !v); setCurrentPage(1); }} className={`px-2.5 py-1.5 rounded-lg border text-xs font-bold transition cursor-pointer whitespace-nowrap ${onlyFavorites ? 'bg-rose-600 text-white border-rose-600' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100'}`}>
              ♥ {isEn ? `Saved (${p.favoriteHoodIds.length})` : `منتخب‌ها (${toPersianNum(p.favoriteHoodIds.length)})`}
            </button>
            <button type="button" aria-pressed={onlyWithBargains} onClick={() => { setOnlyWithBargains((v) => !v); setCurrentPage(1); }} className={`px-2.5 py-1.5 rounded-lg border text-xs font-bold transition cursor-pointer whitespace-nowrap ${onlyWithBargains ? 'bg-amber-600 text-white border-amber-600' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100'}`}>
              {isEn ? 'Under-Market Deals' : 'شکارهای زیر قیمت'}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
          <span className="text-slate-400 text-[11px] shrink-0 font-medium">{isEn ? 'Price Bracket:' : p.mode === 'rent' ? 'بازه رهن کامل:' : 'بازه قیمت کل خرید:'}</span>
          {getPriceBracketOptions(p.mode, isEn).map((tier) => (
            <button key={tier.id} type="button" onClick={() => { setPriceBracket(tier.id); setCurrentPage(1); }} className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition cursor-pointer shrink-0 ${priceBracket === tier.id ? 'bg-emerald-600 text-white shadow-2xs' : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'}`}>{tier.label}</button>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
          <div className="flex flex-wrap items-center gap-2 min-w-0 max-w-full">
            <span className="text-slate-400 text-[11px] shrink-0">{isEn ? 'District:' : 'منطقه شهرداری:'}</span>
            <select aria-label={isEn ? 'Filter by district' : 'فیلتر بر اساس منطقه شهرداری'} value={zoneFilter} onChange={(e) => { setZoneFilter(e.target.value); setCurrentPage(1); }} className="max-w-[200px] sm:max-w-[260px] truncate px-2.5 py-1 rounded-md bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-800 dark:text-slate-200 focus:outline-none">
              <option value="all">{isEn ? 'All Districts' : 'تمام مناطق'}</option>
              {zones.map((z) => (<option key={z} value={z}>{z}</option>))}
            </select>
            {hasActiveFilters && (
              <button type="button" onClick={resetAllFilters} className="px-2.5 py-1 rounded-md bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 text-[11px] font-bold hover:bg-rose-100 transition cursor-pointer">
                {isEn ? 'Reset Filters ✕' : 'پاک کردن فیلترها ✕'}
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 min-w-0 max-w-full">
            <span className="text-slate-400 text-[11px] shrink-0">{isEn ? 'Sort by:' : 'ترتیب نمایش:'}</span>
            <select aria-label={isEn ? 'Sort neighborhoods' : 'ترتیب نمایش محله‌ها'} value={sortBy} onChange={(e) => { setSortBy(e.target.value as 'score' | 'price_asc' | 'price_desc' | 'rahn_asc' | 'air'); setCurrentPage(1); }} className="max-w-[210px] sm:max-w-none truncate px-2.5 py-1 rounded-md bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-800 dark:text-slate-200 font-bold focus:outline-none">
              <option value="score">{isEn ? 'Highest Livability Score' : 'بالاترین امتیاز کیفیت سکونت'}</option><option value="price_asc">{isEn ? 'Lowest internal reference' : 'کمترین مرجع داخلی'}</option><option value="price_desc">{isEn ? 'Highest internal reference' : 'بیشترین مرجع داخلی'}</option><option value="rahn_asc">{isEn ? `Lowest ${p.targetSqm}m² Full Deposit` : `کمترین رهن کامل (${formatAreaShort(p.targetSqm, areaUnit)})`}</option><option value="air">{isEn ? 'Best Air Quality' : 'بهترین کیفیت هوا و آرامش'}</option>
            </select>
          </div>
        </div>
      </div>

      {filterRankingByViewport && viewportBounds && inViewportHoods.length === 0 ? (
        <div data-testid="empty-viewport-state" className="p-8 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center space-y-3">
          <div className="text-base font-black text-slate-900 dark:text-white">{isEn ? 'No neighborhoods fall inside the current map viewport.' : 'محله‌ای در محدوده فعلی نقشه قرار ندارد.'}</div>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">{isEn ? 'Pan or zoom the map, or disable the viewport filter to view all neighborhoods.' : 'نقشه را جابه‌جا یا بزرگ‌نمایی کنید، یا فیلتر کادر نقشه را غیرفعال نمایید.'}</p>
          <button type="button" onClick={() => { updateMapAdvancedOverlayState({ filterRankingByViewport: false }); setCurrentPage(1); }} className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition cursor-pointer">{isEn ? 'Show All Neighborhoods' : 'نمایش تمام محله‌ها'}</button>
        </div>
      ) : filtered.length === 0 ? (
        <div data-testid="relax-filter-assistant" className="p-8 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center space-y-4">
          <div className="text-base font-black text-slate-900 dark:text-white">{isEn ? 'No neighborhoods match your active filters' : 'محله‌ای با فیلترهای انتخابی شما یافت نشد'}</div>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-lg mx-auto">با اعمال این تعدیل‌های هوشمند، گزینه‌های متناسب با توان مالی شما بازگشایی می‌شوند:</p>
          <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
            <button type="button" onClick={() => { setPriceBracket('all'); setCurrentPage(1); }} className="px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs font-bold hover:bg-emerald-100 transition cursor-pointer">حذف سقف بازه قیمتی</button>
            <button type="button" onClick={() => { setZoneFilter('all'); setCurrentPage(1); }} className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold hover:bg-slate-200 transition cursor-pointer">کاوش در تمامی مناطق</button>
            <button type="button" onClick={resetAllFilters} className="px-3.5 py-1.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold transition cursor-pointer">پاک کردن همه فیلترها</button>
          </div>
        </div>
      ) : layoutMode === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {paginationSlice.items.map((hood) => {
            const isFav = p.favoriteHoodIds.includes(hood.id);
            const isSelected = hood.id === p.selectedHood.id;
            const dealPerSqm = dealPriceByHoodId.get(hood.id) ?? hood.buyPerSqm;
            const pres = getNeighborhoodPricePresentation({ hood, cityId: activeCity, dealPerSqm, targetSqm: p.targetSqm, areaUnit, intlCurrency, exchangeRateRef: rateState.snapshot });
            const explain = explainNeighborhoodRecommendation(hood, { mode: p.mode, topReferenceScore: topFilteredScore });
            const isTiedTop = topFilteredScore !== undefined && Math.abs(hood.overallScore - topFilteredScore) <= 0.3 && tiedTopCount > 1;
            const isArcActive = comparisonArc.active && ((comparisonArc.hoodA?.id === p.selectedHood.id && comparisonArc.hoodB?.id === hood.id) || (comparisonArc.hoodB?.id === p.selectedHood.id && comparisonArc.hoodA?.id === hood.id));

            return (
              <div key={hood.id} className={`p-5 rounded-2xl bg-white dark:bg-slate-900/90 ring-1 transition-all flex flex-col justify-between ${isSelected ? 'ring-2 ring-emerald-600 dark:ring-emerald-400 shadow-md' : 'ring-slate-900/5 dark:ring-white/10 shadow-xs hover:shadow-sm hover:ring-slate-900/15 dark:hover:ring-white/20'}`}>
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div role="button" tabIndex={0} onClick={() => p.onSelectNeighborhood(hood)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); p.onSelectNeighborhood(hood); } }} className="cursor-pointer">
                      <div className="text-[11px] text-slate-400 font-medium">{hood.zone} · امتیاز {toPersianNum(hood.overallScore)} از ۱۰ {isTiedTop && <span className="text-indigo-600 dark:text-indigo-400 font-bold">(≈ هم‌تراز ±۰.۳)</span>}</div>
                      <h3 className="text-base font-black text-slate-900 dark:text-white mt-0.5 flex items-center gap-1.5">
                        <span>محله {hood.name}</span>
                        {topFilteredScore !== undefined && Math.abs(hood.overallScore - topFilteredScore) < 0.05 && (
                          <span className="text-[9.5px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 font-black ring-1 ring-amber-500/25">فرصت برتر</span>
                        )}
                        {isSelected && <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-bold">فعال روی نقشه</span>}
                      </h3>
                      <div className="mt-1 text-[11px] font-medium">
                        {hood.status === 'green' ? <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />همخوان با بودجه شما</span> : <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400"><span className="w-1.5 h-1.5 rounded-full bg-amber-500" />{toPersianNum(hood.diffPercent)}٪ بالاتر از بودجه</span>}
                      </div>
                    </div>
                    <button type="button" onClick={(e) => { e.stopPropagation(); p.onToggleFavorite(hood.id); }} aria-label={isFav ? `حذف ${hood.name} از منتخب‌ها` : `افزودن ${hood.name} به منتخب‌ها`} className={`p-1.5 rounded-lg border transition cursor-pointer ${isFav ? 'bg-rose-50 dark:bg-rose-950/60 border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400' : 'border-slate-200 dark:border-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}>
                      <Heart className={`w-3.5 h-3.5 ${isFav ? 'fill-rose-500 text-rose-500' : ''}`} />
                    </button>
                  </div>

                  <div className="my-3.5 pt-3 border-t border-slate-100 dark:border-slate-800 grid grid-cols-2 gap-3 tabular-nums">
                    <div>
                      <div className="text-[10px] text-slate-400 font-medium">{pres.buyReferenceLabelFa}</div>
                      <strong className="text-sm font-black text-slate-900 dark:text-white mt-0.5 block">
                        {pres.buyValueWithUnitFa}
                      </strong>
                      <span className="text-[10px] text-slate-500 block">{pres.dealScenarioLineFa}</span>
                    </div>
                    <div className="border-r border-slate-100 dark:border-slate-800 pr-3">
                      <span className="text-[10px] text-slate-400 block font-medium">{pres.rahnAreaLabelFa}:</span>
                      <strong className="text-sm font-black text-emerald-600 dark:text-emerald-400 mt-0.5 block">{pres.rahnValueWithUnitFa}</strong>
                    </div>
                  </div>

                  <div className="text-[11px] text-slate-500 dark:text-slate-400 space-y-0.5 leading-relaxed">
                    <div className="truncate"><span className="text-slate-700 dark:text-slate-300 font-semibold">شاخصه:</span> {hood.pros || 'موقعیت مناسب'}</div>
                    <div className="truncate"><span className="text-slate-400 font-medium">نکته سکونت:</span> {explain.nonCompensatoryWarningsFa[0] ? <span className="text-amber-600 dark:text-amber-400 font-bold">⚠ {explain.nonCompensatoryWarningsFa[0]}</span> : (hood.cons || 'تراکم منطقه‌ای')}</div>
                  </div>
                </div>

                <div className="pt-3.5 mt-3.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-1.5">
                  <button type="button" onClick={(e) => { e.stopPropagation(); p.onOpenInspector(hood); }} className="flex-1 py-2 px-3 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer hover:opacity-90">
                    <span>بررسی کارنامه تحلیلی</span><ArrowUpRight className="w-3.5 h-3.5" />
                  </button>
                  {!isSelected && (
                    <button type="button" onClick={(e) => { e.stopPropagation(); toggleComparisonArc(hood); }} title={`ترسیم کمان مقایسه زنده با ${p.selectedHood.name} روی نقشه`} aria-label={`کمان مقایسه ${hood.name} روی نقشه`} className={`p-2 rounded-xl border text-xs transition cursor-pointer ${isArcActive ? 'bg-indigo-600 text-white border-indigo-600' : 'border-slate-200 dark:border-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400'}`}>
                      <Scale className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button type="button" onClick={(e) => { e.stopPropagation(); p.onOpenCompare(p.selectedHood.id, hood.id); }} title="جدول مقایسه دو محله" aria-label={`مقایسه ${hood.name}`} className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs transition cursor-pointer">
                    <ArrowLeftRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="border border-slate-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
          {paginationSlice.items.map((hood) => {
            const isFav = p.favoriteHoodIds.includes(hood.id);
            const dealPerSqm = dealPriceByHoodId.get(hood.id) ?? hood.buyPerSqm;
            const pres = getNeighborhoodPricePresentation({ hood, cityId: activeCity, dealPerSqm, targetSqm: p.targetSqm, areaUnit, intlCurrency, exchangeRateRef: rateState.snapshot });
            const explain = explainNeighborhoodRecommendation(hood, { mode: p.mode, topReferenceScore: topFilteredScore });
            const isSelected = hood.id === p.selectedHood.id;
            const isArcActive = comparisonArc.active && ((comparisonArc.hoodA?.id === p.selectedHood.id && comparisonArc.hoodB?.id === hood.id) || (comparisonArc.hoodB?.id === p.selectedHood.id && comparisonArc.hoodA?.id === hood.id));
            return (
              <div key={hood.id} className={`p-3.5 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs ${isSelected ? 'bg-emerald-50/50 dark:bg-emerald-950/30' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}>
                <div role="button" tabIndex={0} onClick={() => p.onSelectNeighborhood(hood)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); p.onSelectNeighborhood(hood); } }} className="flex items-center gap-3 cursor-pointer">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-black tabular-nums ${isSelected ? 'bg-emerald-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white'}`}>{toPersianNum(hood.overallScore)}</div>
                  <div>
                    <div className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-1.5">
                      <span>محله {hood.name}</span>
                      {isSelected && <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 font-bold">فعال روی نقشه</span>}
                    </div>
                    <div className="text-[11px] text-slate-400">{hood.zone} · {explain.nonCompensatoryWarningsFa[0] || hood.pros || 'موقعیت متوازن'}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 sm:gap-3 tabular-nums">
                  <div>
                    <span className="text-[10px] text-slate-400 block">{pres.buyReferenceLabelFa}</span>
                    <span className="font-black text-slate-900 dark:text-white">{pres.buyValueWithUnitFa}</span>
                    <span className="text-[10px] text-slate-500 block">{pres.dealScenarioLineFa}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block">{pres.rahnAreaLabelFa}:</span>
                    <span className="font-black text-emerald-600 dark:text-emerald-400">{pres.rahnValueWithUnitFa}</span>
                  </div>
                  <button type="button" onClick={(e) => { e.stopPropagation(); p.onToggleFavorite(hood.id); }} aria-label={isFav ? `حذف ${hood.name} از منتخب‌ها` : `افزودن ${hood.name} به منتخب‌ها`} className={`p-1.5 rounded-lg border transition cursor-pointer ${isFav ? 'bg-rose-50 dark:bg-rose-950/60 border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400' : 'border-slate-200 dark:border-slate-700 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}><Heart className={`w-3.5 h-3.5 ${isFav ? 'fill-rose-500 text-rose-500' : ''}`} /></button>
                  {!isSelected && <button type="button" onClick={(e) => { e.stopPropagation(); toggleComparisonArc(hood); }} title={`ترسیم کمان مقایسه با ${p.selectedHood.name} روی نقشه`} aria-label={`کمان مقایسه ${hood.name} روی نقشه`} className={`p-1.5 rounded-lg border transition cursor-pointer ${isArcActive ? 'bg-indigo-600 text-white border-indigo-600' : 'border-slate-200 dark:border-slate-700 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/50'}`}><Scale className="w-3.5 h-3.5" /></button>}
                  <button type="button" onClick={(e) => { e.stopPropagation(); p.onOpenCompare(p.selectedHood.id, hood.id); }} title="مقایسه دو محله" aria-label={`مقایسه ${hood.name} با ${p.selectedHood.name}`} className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"><ArrowLeftRight className="w-3.5 h-3.5" /></button>
                  <button type="button" onClick={(e) => { e.stopPropagation(); p.onOpenInspector(hood); }} aria-label={`مشاهده کارنامه ${hood.name}`} className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-900 hover:text-white dark:hover:bg-white dark:hover:text-slate-900 transition font-bold cursor-pointer">کارنامه</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <RadarPaginationBar slice={paginationSlice} onPageChange={handlePageChange} onPageSizeChange={(size) => { setPageSize(size); setCurrentPage(1); }} pageSizeOptions={[12, 24, 0]} isEn={isEn} />
    </div>
  );
}
