import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Search, LayoutGrid, List, X } from 'lucide-react';
import { type EvaluatedNeighborhood } from '../../data/neighborhoods';
import { formatMillionTomanAsIntlCurrency } from '../../utils/areaUnit';
import { useAreaUnit, useIntlCurrency, useRadarLocale } from '../AreaUnitToggle';
import { useExchangeRateSnapshot } from '../../features/commerce/services/exchangeRateClient';
import { matchesPersianSearch } from '../../utils/security';
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
import { getPriceBracketOptions } from '../../features/neighborhoods/services/neighborhoodPricePresentation';
import {
  compareDiscoverNeighborhoods,
  matchesDiscoverPriceBracket,
  type DiscoverPriceBracketId,
  type DiscoverSortMode,
} from '../../features/discovery/services/discoverPricingEngine';
import { getDiscoverLocaleCopy } from '../../features/discovery/i18n/discoverLocaleCopy';
import { DiscoverNeighborhoodResults } from '../discover/DiscoverNeighborhoodResults';

export interface ProductDiscoverViewProps {
  evaluatedNeighborhoods: EvaluatedNeighborhood[];
  selectedHood: EvaluatedNeighborhood;
  onSelectNeighborhood: (hood: EvaluatedNeighborhood) => void;
  favoriteHoodIds: number[];
  onToggleFavorite: (id: number) => void;
  onOpenInspector: (hood: EvaluatedNeighborhood) => void;
  onOpenCompare: (id1: number, id2: number) => void;
  activeCity?: CityId;
  mode: 'rent' | 'buy';
  targetSqm: number;
}

export function ProductDiscoverView(p: ProductDiscoverViewProps): React.ReactElement {
  const [areaUnit] = useAreaUnit(), [intlCurrency] = useIntlCurrency(), [radarLocale] = useRadarLocale();
  const rateState = useExchangeRateSnapshot();
  const copy = getDiscoverLocaleCopy(radarLocale);
  const { isEn } = copy;
  const activeCity: CityId = p.activeCity ?? resolveCityIdForNeighborhood(p.selectedHood.id);
  const { filterRankingByViewport, viewportBounds, comparisonArc } = useMapAdvancedOverlayState();
  const [query, setQuery] = useState<string>(''), [statusFilter, setStatusFilter] = useState<'all' | 'green' | 'yellow' | 'red'>('all');
  const [zoneFilter, setZoneFilter] = useState<string>('all'), [priceBracket, setPriceBracket] = useState<DiscoverPriceBracketId>('all');
  const [onlyFavorites, setOnlyFavorites] = useState<boolean>(false), [onlyWithBargains, setOnlyWithBargains] = useState<boolean>(false);
  const [sortBy, setSortBy] = useState<DiscoverSortMode>('score'), [layoutMode, setLayoutMode] = useState<'grid' | 'list'>('grid');
  const [currentPage, setCurrentPage] = useState<number>(1), [pageSize, setPageSize] = useState<number>(12);
  const resultsTopRef = useRef<HTMLDivElement | null>(null);
  const prevCityRef = useRef<CityId>(activeCity);

  const zones = useMemo(() => {
    const s = new Set<string>();
    p.evaluatedNeighborhoods.forEach((h) => { if (h.zone) s.add(h.zone); });
    return Array.from(s);
  }, [p.evaluatedNeighborhoods]);

  useEffect(() => {
    if (prevCityRef.current !== activeCity) {
      prevCityRef.current = activeCity;
      setZoneFilter('all');
      setCurrentPage(1);
      if (filterRankingByViewport) updateMapAdvancedOverlayState({ filterRankingByViewport: false });
    }
  }, [activeCity, filterRankingByViewport]);

  useEffect(() => {
    if (zoneFilter !== 'all' && !zones.includes(zoneFilter)) setZoneFilter('all');
  }, [zoneFilter, zones]);

  const inViewportHoods = useMemo(() => {
    if (!viewportBounds) return [];
    return p.evaluatedNeighborhoods.filter(
      (h) => Number.isFinite(h.lat) && Number.isFinite(h.lng) && isCoordInsideStoredViewport(h.lat, h.lng, viewportBounds),
    );
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
    if (priceBracket !== 'all') {
      list = list.filter((h) => matchesDiscoverPriceBracket(h, p.mode, p.targetSqm, dealSqm(h), priceBracket));
    }
    if (zoneFilter !== 'all') list = list.filter((h) => h.zone === zoneFilter);
    if (onlyFavorites) list = list.filter((h) => p.favoriteHoodIds.includes(h.id));
    if (onlyWithBargains) list = list.filter((h) => (h.bargains?.length || 0) > 0);
    if (query.trim()) {
      const q = query.trim();
      list = list.filter(
        (h) =>
          matchesPersianSearch(h.name, q) ||
          matchesPersianSearch(h.zone, q) ||
          matchesPersianSearch(h.pros, q) ||
          Boolean(h.bargains?.some((b) => (b.street && matchesPersianSearch(b.street, q)) || (b.title && matchesPersianSearch(b.title, q)))),
      );
    }
    return [...list].sort((a, b) => compareDiscoverNeighborhoods(a, b, sortBy, p.targetSqm, dealPriceByHoodId));
  }, [
    p.evaluatedNeighborhoods, inViewportHoods, filterRankingByViewport, statusFilter, priceBracket,
    zoneFilter, onlyFavorites, onlyWithBargains, p.favoriteHoodIds, p.mode, p.targetSqm, query, sortBy, dealPriceByHoodId,
  ]);

  const paginationSlice = useMemo(() => computePaginationSlice(filtered, currentPage, pageSize), [filtered, currentPage, pageSize]);
  useEffect(() => {
    if (currentPage !== paginationSlice.currentPage) setCurrentPage(paginationSlice.currentPage);
  }, [currentPage, paginationSlice.currentPage]);

  const handlePageChange = (nextPage: number) => {
    setCurrentPage(nextPage);
    resultsTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  const topFilteredScore = useMemo(() => {
    if (filtered.length === 0) return undefined;
    return filtered.reduce((best, item) => (item.overallScore > best ? item.overallScore : best), Number.NEGATIVE_INFINITY);
  }, [filtered]);
  const tiedTopCount = useMemo(
    () => (topFilteredScore !== undefined ? filtered.filter((h) => Math.abs(h.overallScore - topFilteredScore) <= 0.3).length : 0),
    [filtered, topFilteredScore],
  );

  const hasActiveFilters = Boolean(query.trim() || statusFilter !== 'all' || priceBracket !== 'all' || zoneFilter !== 'all' || onlyFavorites || onlyWithBargains || filterRankingByViewport);
  const resetAllFilters = () => {
    setQuery(''); setStatusFilter('all'); setPriceBracket('all'); setZoneFilter('all');
    setOnlyFavorites(false); setOnlyWithBargains(false); setCurrentPage(1);
    updateMapAdvancedOverlayState({ filterRankingByViewport: false });
  };
  const toggleComparisonArc = (hood: EvaluatedNeighborhood) => {
    const isCurrentArc = comparisonArc.active && ((comparisonArc.hoodA?.id === p.selectedHood.id && comparisonArc.hoodB?.id === hood.id) || (comparisonArc.hoodB?.id === p.selectedHood.id && comparisonArc.hoodA?.id === hood.id));
    updateMapAdvancedOverlayState({ comparisonArc: { active: !isCurrentArc, isPinned: !isCurrentArc, hoodA: p.selectedHood, hoodB: hood } });
  };
  const fxRefLabel = intlCurrency !== 'IRT' ? ` · ${copy.approxFxPrefix} ${formatMillionTomanAsIntlCurrency(p.selectedHood.buyPerSqm, intlCurrency, radarLocale, rateState.snapshot)}` : '';

  return (
    <div dir={copy.dir} lang={copy.lang} className="w-full max-w-6xl mx-auto px-4 py-6 sm:py-8 space-y-6 animate-fadeIn" data-testid="product-discover-view">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <span className="text-[11px] font-bold tracking-wide text-[var(--color-brand-600)] dark:text-emerald-400 block mb-1">{copy.eyebrow}</span>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">{copy.heading}</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{copy.subtitle(filtered.length, p.mode)}{fxRefLabel}</p>
          <DiscoverSelectedHoodEpistemicBanner hood={p.selectedHood} cityId={activeCity} allNeighborhoods={p.evaluatedNeighborhoods} />
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            disabled={!viewportBounds}
            aria-pressed={filterRankingByViewport}
            onClick={() => { setCurrentPage(1); updateMapAdvancedOverlayState({ filterRankingByViewport: !filterRankingByViewport }); }}
            className={`px-2.5 py-1.5 rounded-lg border text-xs font-bold transition whitespace-nowrap ${!viewportBounds ? 'opacity-50 cursor-not-allowed border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 text-slate-400' : filterRankingByViewport ? 'bg-[var(--color-brand-600)] text-white border-emerald-600 cursor-pointer' : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-100 cursor-pointer'}`}
            title={!viewportBounds ? (isEn ? copy.viewportToggleUnavailableTitle : 'محدوده نقشه هنوز آماده نیست') : copy.viewportToggleActiveTitle}
          >
            {copy.viewportToggleLabel(inViewportHoods.length)}
          </button>
          <div className="flex items-center border border-slate-200 dark:border-slate-800 rounded-lg p-0.5 bg-slate-50/80 dark:bg-slate-900/80">
            <button type="button" onClick={() => setLayoutMode('grid')} aria-pressed={layoutMode === 'grid'} title={copy.layoutGridLabel} aria-label={copy.layoutGridLabel} className={`p-1.5 rounded-md transition cursor-pointer ${layoutMode === 'grid' ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-xs' : 'text-slate-400 hover:text-slate-700'}`}><LayoutGrid className="w-3.5 h-3.5" /></button>
            <button type="button" onClick={() => setLayoutMode('list')} aria-pressed={layoutMode === 'list'} title={copy.layoutListLabel} aria-label={copy.layoutListLabel} className={`p-1.5 rounded-md transition cursor-pointer ${layoutMode === 'list' ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-xs' : 'text-slate-400 hover:text-slate-700'}`}><List className="w-3.5 h-3.5" /></button>
          </div>
        </div>
      </div>

      <GlobalSearchWorkspace
        activeCity={activeCity}
        activeNeighborhoodId={p.selectedHood.id}
        activeNeighborhoodName={p.selectedHood.name}
        viewportBounds={viewportBounds}
        onSelectNeighborhoodId={(hoodId) => {
          const found = p.evaluatedNeighborhoods.find((h) => String(h.id) === String(hoodId));
          if (found) {
            p.onSelectNeighborhood(found);
            p.onOpenInspector(found);
          }
        }}
      />
      <PublicDataProvenanceCard entityId={resolveGovernanceEntityId(activeCity, p.selectedHood.id)} neighborhoodNameFa={p.selectedHood.name} sampleCount={selectedProvenanceStats.agg.eligibleObservedCount} uniqueEntityCount={null} observedSampleCount={selectedProvenanceStats.agg.observedSampleCount} syntheticSampleCount={selectedProvenanceStats.syntheticCount} />
      <CasperInstantVerdictCard evaluatedNeighborhoods={p.evaluatedNeighborhoods} selectedHood={p.selectedHood} onSelectNeighborhood={p.onSelectNeighborhood} targetSqm={p.targetSqm} onOpenInspector={p.onOpenInspector} />

      <div ref={resultsTopRef} className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 space-y-3.5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className={`w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 pointer-events-none ${copy.dir === 'rtl' ? 'right-3' : 'left-3'}`} />
            <input type="text" aria-label={copy.searchAriaLabel} value={query} onChange={(e) => { setQuery(e.target.value); setCurrentPage(1); }} placeholder={copy.searchPlaceholder} className={`w-full py-2 rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-slate-900 dark:focus:border-white transition ${copy.dir === 'rtl' ? 'pr-9 pl-7' : 'pl-9 pr-7'}`} />
            {query && (
              <button type="button" aria-label={copy.clearSearchAriaLabel} onClick={() => { setQuery(''); setCurrentPage(1); }} className={`absolute top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer ${copy.dir === 'rtl' ? 'left-2.5' : 'right-2.5'}`}><X className="w-3.5 h-3.5" /></button>
            )}
          </div>
          <div className="flex items-center gap-1 overflow-x-auto text-xs">
            {(['all', 'green', 'yellow', 'red'] as const).map((st) => (
              <button key={st} type="button" onClick={() => { setStatusFilter(st); setCurrentPage(1); }} className={`px-3 py-1.5 rounded-lg transition cursor-pointer whitespace-nowrap text-xs font-semibold ${statusFilter === st ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900' : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-300'}`}>
                {st === 'all' ? copy.statusAll : st === 'green' ? copy.statusGreen : st === 'yellow' ? copy.statusYellow : copy.statusRed}
              </button>
            ))}
            <button type="button" aria-pressed={onlyFavorites} onClick={() => { setOnlyFavorites((v) => !v); setCurrentPage(1); }} className={`px-2.5 py-1.5 rounded-lg border text-xs font-bold transition cursor-pointer whitespace-nowrap ${onlyFavorites ? 'bg-rose-600 text-white border-rose-600' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100'}`}>♥ {copy.favoritesBtn(p.favoriteHoodIds.length)}</button>
            <button type="button" aria-pressed={onlyWithBargains} onClick={() => { setOnlyWithBargains((v) => !v); setCurrentPage(1); }} className={`px-2.5 py-1.5 rounded-lg border text-xs font-bold transition cursor-pointer whitespace-nowrap ${onlyWithBargains ? 'bg-amber-600 text-white border-amber-600' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100'}`}>{copy.dealsOnlyBtn}</button>
          </div>
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
          <span className="text-slate-400 text-[11px] shrink-0 font-medium">{copy.bracketLabel(p.mode)}</span>
          {getPriceBracketOptions(p.mode, isEn).map((tier) => (
            <button key={tier.id} type="button" onClick={() => { setPriceBracket(tier.id); setCurrentPage(1); }} className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition cursor-pointer shrink-0 ${priceBracket === tier.id ? 'bg-[var(--color-brand-600)] text-white shadow-2xs' : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'}`}>{tier.label}</button>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
          <div className="flex flex-wrap items-center gap-2 min-w-0 max-w-full">
            <span className="text-slate-400 text-[11px] shrink-0">{copy.districtLabel}</span>
            <select aria-label={copy.districtAriaLabel} value={zoneFilter} onChange={(e) => { setZoneFilter(e.target.value); setCurrentPage(1); }} className="max-w-[200px] sm:max-w-[260px] truncate px-2.5 py-1 rounded-md bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-800 dark:text-slate-200 focus:outline-none">
              <option value="all">{copy.allDistricts}</option>
              {zones.map((z) => (<option key={z} value={z}>{z}</option>))}
            </select>
            {hasActiveFilters && <button type="button" onClick={resetAllFilters} className="px-2.5 py-1 rounded-md bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 text-[11px] font-bold hover:bg-rose-100 transition cursor-pointer">{copy.resetFiltersBtn}</button>}
          </div>
          <div className="flex items-center gap-2 min-w-0 max-w-full">
            <span className="text-slate-400 text-[11px] shrink-0">{copy.sortLabel}</span>
            <select aria-label={copy.sortAriaLabel} value={sortBy} onChange={(e) => { setSortBy(e.target.value as DiscoverSortMode); setCurrentPage(1); }} className="max-w-[210px] sm:max-w-none truncate px-2.5 py-1 rounded-md bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-800 dark:text-slate-200 font-bold focus:outline-none">
              <option value="score">{copy.sortScore}</option>
              <option value="price_asc">{copy.sortPriceAsc(areaUnit)}</option>
              <option value="price_desc">{copy.sortPriceDesc(areaUnit)}</option>
              <option value="rahn_asc">{copy.sortRahnAsc(p.targetSqm, areaUnit)}</option>
              <option value="air">{copy.sortAir}</option>
            </select>
          </div>
        </div>
      </div>

      {filterRankingByViewport && viewportBounds && inViewportHoods.length === 0 ? (
        <div data-testid="empty-viewport-state" className="p-8 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center space-y-3">
          <div className="text-base font-black text-slate-900 dark:text-white">{isEn ? copy.emptyViewportTitle : 'محله‌ای در محدوده فعلی نقشه قرار ندارد.'}</div>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">{copy.emptyViewportDesc}</p>
          <button type="button" onClick={() => { updateMapAdvancedOverlayState({ filterRankingByViewport: false }); setCurrentPage(1); }} className="px-4 py-2 rounded-xl bg-[var(--color-brand-600)] hover:bg-[var(--color-brand-700)] text-white text-xs font-bold transition cursor-pointer">{isEn ? copy.showAllNeighborhoodsBtn : 'نمایش تمام محله‌ها'}</button>
        </div>
      ) : filtered.length === 0 ? (
        <div data-testid="relax-filter-assistant" className="p-8 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center space-y-4">
          <div className="text-base font-black text-slate-900 dark:text-white">{copy.noMatchesTitle}</div>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-lg mx-auto">{copy.noMatchesDesc}</p>
          <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
            <button type="button" onClick={() => { setPriceBracket('all'); setCurrentPage(1); }} className="px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs font-bold hover:bg-emerald-100 transition cursor-pointer">{copy.relaxPriceBtn}</button>
            <button type="button" onClick={() => { setZoneFilter('all'); setCurrentPage(1); }} className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold hover:bg-slate-200 transition cursor-pointer">{copy.relaxDistrictBtn}</button>
            <button type="button" onClick={resetAllFilters} className="px-3.5 py-1.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold transition cursor-pointer">{copy.clearAllFiltersBtn}</button>
          </div>
        </div>
      ) : (
        <DiscoverNeighborhoodResults
          items={paginationSlice.items}
          layoutMode={layoutMode}
          selectedHood={p.selectedHood}
          activeCity={activeCity}
          favoriteHoodIds={p.favoriteHoodIds}
          dealPriceByHoodId={dealPriceByHoodId}
          topFilteredScore={topFilteredScore}
          tiedTopCount={tiedTopCount}
          comparisonArcActive={comparisonArc.active}
          comparisonArcHoodAId={comparisonArc.hoodA?.id ?? null}
          comparisonArcActiveHoodBId={comparisonArc.hoodB?.id ?? null}
          targetSqm={p.targetSqm}
          mode={p.mode}
          areaUnit={areaUnit}
          intlCurrency={intlCurrency}
          radarLocale={radarLocale}
          exchangeRateRef={rateState.snapshot}
          copy={copy}
          onSelectNeighborhood={p.onSelectNeighborhood}
          onToggleFavorite={p.onToggleFavorite}
          onToggleComparisonArc={toggleComparisonArc}
          onOpenInspector={p.onOpenInspector}
          onOpenCompare={p.onOpenCompare}
        />
      )}

      <RadarPaginationBar slice={paginationSlice} onPageChange={handlePageChange} onPageSizeChange={(size) => { setPageSize(size); setCurrentPage(1); }} pageSizeOptions={[12, 24, 0]} isEn={isEn} />
    </div>
  );
}

