import React, { useState, useMemo } from 'react';
import { Search, ArrowLeftRight, Heart, LayoutGrid, List, ArrowUpRight, Scale, X } from 'lucide-react';
import type { EvaluatedNeighborhood } from '../../data/neighborhoods';
import { toPersianNum } from '../../data/neighborhoods';
import { convertPricePerSqmToUnit, formatMillionTomanAsIntlCurrency, type PrimaryViewId } from '../../utils/areaUnit';
import { useAreaUnit, useIntlCurrency, useRadarLocale } from '../AreaUnitToggle';
import { matchesPersianSearch } from '../../utils/security';
import { aggregateNeighborhoodMarketMetrics, buildNeighborhoodListingSamples } from '../../data/realMarketPriceAggregator';
import { explainNeighborhoodRecommendation } from '../useEvaluatedNeighborhoods';
import { isCoordInsideStoredViewport, updateMapAdvancedOverlayState, useMapAdvancedOverlayState } from '../mapAdvancedLayers';

export interface ProductDiscoverViewProps {
  evaluatedNeighborhoods: EvaluatedNeighborhood[]; selectedHood: EvaluatedNeighborhood;
  onSelectNeighborhood: (hood: EvaluatedNeighborhood) => void; favoriteHoodIds: number[];
  onToggleFavorite: (id: number) => void; onOpenInspector: (hood: EvaluatedNeighborhood) => void;
  onOpenCompare: (id1: number, id2: number) => void; onNavigateView: (view: PrimaryViewId) => void;
  mode: 'rent' | 'buy'; onChangeMode?: (m: 'rent' | 'buy') => void; targetSqm: number;
}

export function ProductDiscoverView(p: ProductDiscoverViewProps): React.ReactElement {
  const [areaUnit] = useAreaUnit(), [intlCurrency] = useIntlCurrency(), [radarLocale] = useRadarLocale();
  const isEn = radarLocale === 'en';
  const { filterRankingByViewport, viewportBounds, comparisonArc } = useMapAdvancedOverlayState();
  const [query, setQuery] = useState<string>(''), [statusFilter, setStatusFilter] = useState<'all' | 'green' | 'yellow' | 'red'>('all');
  const [zoneFilter, setZoneFilter] = useState<string>('all'), [priceBracket, setPriceBracket] = useState<'all' | 'under5b' | '5to10b' | '10to20b' | 'luxury'>('all');
  const [onlyFavorites, setOnlyFavorites] = useState<boolean>(false), [onlyWithBargains, setOnlyWithBargains] = useState<boolean>(false);
  const [sortBy, setSortBy] = useState<'score' | 'price_asc' | 'price_desc' | 'rahn_asc' | 'air'>('score'), [layoutMode, setLayoutMode] = useState<'grid' | 'list'>('grid');

  const zones = useMemo(() => { const s = new Set<string>(); p.evaluatedNeighborhoods.forEach((h) => { if (h.zone) s.add(h.zone); }); return Array.from(s); }, [p.evaluatedNeighborhoods]);
  const inViewportHoods = useMemo(() => {
    if (!viewportBounds) return p.evaluatedNeighborhoods;
    const inside = p.evaluatedNeighborhoods.filter((h) => isCoordInsideStoredViewport(h.lat, h.lng, viewportBounds));
    return inside.length > 0 ? inside : p.evaluatedNeighborhoods;
  }, [p.evaluatedNeighborhoods, viewportBounds]);
  const dealPriceByHoodId = useMemo(() => {
    const m = new Map<number, number>();
    p.evaluatedNeighborhoods.forEach((hood) => m.set(hood.id, aggregateNeighborhoodMarketMetrics(hood.id, hood.name, hood.buyPerSqm, buildNeighborhoodListingSamples(hood)).estimatedDealPricePerSqm));
    return m;
  }, [p.evaluatedNeighborhoods]);

  const filtered = useMemo(() => {
    let list = filterRankingByViewport ? inViewportHoods : p.evaluatedNeighborhoods;
    if (statusFilter !== 'all') list = list.filter((h) => h.status === statusFilter);
    if (priceBracket === 'under5b') list = list.filter((h) => p.mode === 'rent' ? h.rahn80m * (p.targetSqm / 80) < 1000 : h.buyPerSqm * p.targetSqm < 5000);
    else if (priceBracket === '5to10b') list = list.filter((h) => { const val = p.mode === 'rent' ? h.rahn80m * (p.targetSqm / 80) : h.buyPerSqm * p.targetSqm; return p.mode === 'rent' ? val >= 1000 && val <= 2000 : val >= 5000 && val <= 10000; });
    else if (priceBracket === '10to20b') list = list.filter((h) => { const val = p.mode === 'rent' ? h.rahn80m * (p.targetSqm / 80) : h.buyPerSqm * p.targetSqm; return p.mode === 'rent' ? val > 2000 && val <= 4000 : val > 10000 && val <= 20000; });
    else if (priceBracket === 'luxury') list = list.filter((h) => p.mode === 'rent' ? h.rahn80m * (p.targetSqm / 80) > 4000 : h.buyPerSqm * p.targetSqm > 20000);
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
      if (sortBy === 'rahn_asc') return a.rahn80m - b.rahn80m;
      if (sortBy === 'price_asc') return (dealPriceByHoodId.get(a.id) ?? a.buyPerSqm) - (dealPriceByHoodId.get(b.id) ?? b.buyPerSqm);
      return b.buyPerSqm - a.buyPerSqm;
    });
  }, [p.evaluatedNeighborhoods, inViewportHoods, filterRankingByViewport, statusFilter, priceBracket, zoneFilter, onlyFavorites, onlyWithBargains, p.favoriteHoodIds, p.mode, p.targetSqm, query, sortBy, dealPriceByHoodId]);

  const topFilteredScore = useMemo(() => (filtered.length > 0 ? Math.max(...filtered.map((h) => h.overallScore)) : undefined), [filtered]);
  const tiedTopCount = useMemo(() => (topFilteredScore !== undefined ? filtered.filter((h) => Math.abs(h.overallScore - topFilteredScore) <= 0.3).length : 0), [filtered, topFilteredScore]);
  const hasActiveFilters = Boolean(query.trim() || statusFilter !== 'all' || priceBracket !== 'all' || zoneFilter !== 'all' || onlyFavorites || onlyWithBargains || filterRankingByViewport);
  const resetAllFilters = () => { setQuery(''); setStatusFilter('all'); setPriceBracket('all'); setZoneFilter('all'); setOnlyFavorites(false); setOnlyWithBargains(false); updateMapAdvancedOverlayState({ filterRankingByViewport: false }); };

  const toggleComparisonArc = (hood: EvaluatedNeighborhood) => {
    const isCurrentArc = comparisonArc.active && ((comparisonArc.hoodA?.id === p.selectedHood.id && comparisonArc.hoodB?.id === hood.id) || (comparisonArc.hoodB?.id === p.selectedHood.id && comparisonArc.hoodA?.id === hood.id));
    updateMapAdvancedOverlayState({ comparisonArc: { active: !isCurrentArc, isPinned: !isCurrentArc, hoodA: p.selectedHood, hoodB: hood } });
  };

  return (
    <div className="w-full max-w-6xl mx-auto px-4 py-6 sm:py-8 space-y-6 animate-fadeIn" data-testid="product-discover-view">
      {/* Editorial Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <span className="text-[11px] font-bold tracking-wider text-emerald-600 dark:text-emerald-400 block mb-1">
            {isEn ? 'Neighborhood Discovery & Comparison · Synced with Live Map' : 'اکتشاف و مقایسه جامع محلات · همگام با نقشه زنده'}
          </span>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
            {isEn ? 'Residential Neighborhood Explorer' : 'کاشف محله‌های مسکونی'}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            ارزیابی تحلیلی {toPersianNum(filtered.length)} محله بر پایه کیفیت زندگی، تناسب با بودجه و سناریوی معامله (مدل v6.4 — غیرثبتی)
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button type="button" aria-pressed={filterRankingByViewport} onClick={() => updateMapAdvancedOverlayState({ filterRankingByViewport: !filterRankingByViewport })} className={`px-2.5 py-1.5 rounded-lg border text-xs font-bold transition cursor-pointer whitespace-nowrap ${filterRankingByViewport ? 'bg-emerald-600 text-white border-emerald-600' : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-100'}`} title="نمایش فقط محله‌های واقع در کادر فعلی نقشه زنده">
            📍 {isEn ? `Map Viewport (${inViewportHoods.length})` : `فقط کادر نقشه (${toPersianNum(inViewportHoods.length)})`}
          </button>
          <div className="flex items-center border border-slate-200 dark:border-slate-800 rounded-lg p-0.5 bg-slate-50/80 dark:bg-slate-900/80">
            <button type="button" onClick={() => setLayoutMode('grid')} title="نمای شبکه‌ای" aria-label="نمای شبکه‌ای" className={`p-1.5 rounded-md transition cursor-pointer ${layoutMode === 'grid' ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-xs' : 'text-slate-400 hover:text-slate-700'}`}><LayoutGrid className="w-3.5 h-3.5" /></button>
            <button type="button" onClick={() => setLayoutMode('list')} title="نمای فهرستی" aria-label="نمای فهرستی" className={`p-1.5 rounded-md transition cursor-pointer ${layoutMode === 'list' ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-xs' : 'text-slate-400 hover:text-slate-700'}`}><List className="w-3.5 h-3.5" /></button>
          </div>
        </div>
      </div>

      {/* Filter and Control Bar */}
      <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 space-y-3.5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input type="text" aria-label={isEn ? 'Search neighborhood or district' : 'جست‌وجوی سریع نام محله یا منطقه'} value={query} onChange={(e) => setQuery(e.target.value)} placeholder={isEn ? 'Search neighborhood or district...' : 'جست‌وجوی سریع نام محله یا منطقه...'} className="w-full pr-9 pl-7 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-slate-900 dark:focus:border-white transition" />
            {query && <button type="button" aria-label="پاک کردن عبارت جستجو" onClick={() => setQuery('')} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"><X className="w-3.5 h-3.5" /></button>}
          </div>
          <div className="flex items-center gap-1 overflow-x-auto text-xs">
            {(['all', 'green', 'yellow', 'red'] as const).map((st) => (
              <button key={st} type="button" onClick={() => setStatusFilter(st)} className={`px-3 py-1.5 rounded-lg transition cursor-pointer whitespace-nowrap text-xs font-semibold ${statusFilter === st ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900' : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-300'}`}>
                {st === 'all' ? (isEn ? 'All' : 'تمام محله‌ها') : st === 'green' ? (isEn ? 'In Budget' : 'همخوان با بودجه') : st === 'yellow' ? (isEn ? 'Stretch' : 'مرزی') : (isEn ? 'Above Budget' : 'فراتر از بودجه')}
              </button>
            ))}
            <button type="button" aria-pressed={onlyFavorites} onClick={() => setOnlyFavorites((v) => !v)} className={`px-2.5 py-1.5 rounded-lg border text-xs font-bold transition cursor-pointer whitespace-nowrap ${onlyFavorites ? 'bg-rose-600 text-white border-rose-600' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100'}`}>
              ♥ {isEn ? `Saved (${p.favoriteHoodIds.length})` : `منتخب‌ها (${toPersianNum(p.favoriteHoodIds.length)})`}
            </button>
            <button type="button" aria-pressed={onlyWithBargains} onClick={() => setOnlyWithBargains((v) => !v)} className={`px-2.5 py-1.5 rounded-lg border text-xs font-bold transition cursor-pointer whitespace-nowrap ${onlyWithBargains ? 'bg-amber-600 text-white border-amber-600' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100'}`}>
              {isEn ? 'Under-Market Deals' : 'شکارهای زیر قیمت'}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
          <span className="text-slate-400 text-[11px] shrink-0 font-medium">{isEn ? 'Price Bracket:' : 'بازه قیمتی:'}</span>
          {[
            { id: 'all' as const, label: isEn ? 'All Prices' : 'همه قیمت‌ها' },
            { id: 'under5b' as const, label: p.mode === 'rent' ? (isEn ? '< 1B Rahn' : 'زیر ۱ م.ت') : (isEn ? '< 5B' : 'زیر ۵ میلیارد') },
            { id: '5to10b' as const, label: p.mode === 'rent' ? (isEn ? '1-2B Rahn' : '۱ تا ۲ م.ت') : (isEn ? '5-10B' : '۵ تا ۱۰ میلیارد') },
            { id: '10to20b' as const, label: p.mode === 'rent' ? (isEn ? '2-4B Rahn' : '۲ تا ۴ م.ت') : (isEn ? '10-20B' : '۱۰ تا ۲۰ میلیارد') },
            { id: 'luxury' as const, label: p.mode === 'rent' ? (isEn ? '4B+ Luxury' : 'لوکس ۴+ م.ت') : (isEn ? '20B+ Luxury' : 'لوکس ۲۰+ میلیارد') },
          ].map((tier) => (
            <button key={tier.id} type="button" onClick={() => setPriceBracket(tier.id)} className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition cursor-pointer shrink-0 ${priceBracket === tier.id ? 'bg-emerald-600 text-white shadow-2xs' : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'}`}>{tier.label}</button>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
          <div className="flex flex-wrap items-center gap-2 min-w-0 max-w-full">
            <span className="text-slate-400 text-[11px] shrink-0">{isEn ? 'District:' : 'منطقه شهرداری:'}</span>
            <select aria-label={isEn ? 'Filter by district' : 'فیلتر بر اساس منطقه شهرداری'} value={zoneFilter} onChange={(e) => setZoneFilter(e.target.value)} className="max-w-[200px] sm:max-w-[260px] truncate px-2.5 py-1 rounded-md bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-800 dark:text-slate-200 focus:outline-none">
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
            <select aria-label={isEn ? 'Sort neighborhoods' : 'ترتیب نمایش محله‌ها'} value={sortBy} onChange={(e) => setSortBy(e.target.value as 'score' | 'price_asc' | 'price_desc' | 'rahn_asc' | 'air')} className="max-w-[210px] sm:max-w-none truncate px-2.5 py-1 rounded-md bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-800 dark:text-slate-200 font-bold focus:outline-none">
              <option value="score">{isEn ? 'Highest Livability Score' : 'بالاترین امتیاز کیفیت سکونت'}</option><option value="price_asc">{isEn ? 'Lowest v6.4 Deal Price' : 'کمترین قیمت معامله v6.4'}</option><option value="price_desc">{isEn ? 'Highest Asking Price' : 'بیشترین ارزش پایه'}</option><option value="rahn_asc">{isEn ? 'Lowest 80m² Deposit' : 'کمترین رهن کامل ۸۰ متر'}</option><option value="air">{isEn ? 'Best Air Quality' : 'بهترین کیفیت هوا و آرامش'}</option>
            </select>
          </div>
        </div>
      </div>

      {/* Content Rendering: Empty State vs Grid vs List */}
      {filtered.length === 0 ? (
        <div className="p-8 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center space-y-3">
          <div className="text-sm font-black text-slate-900 dark:text-white">{isEn ? 'No neighborhoods match your active filters' : 'هیچ محله‌ای با فیلترهای انتخابی یافت نشد'}</div>
          <p className="text-xs text-slate-500 dark:text-slate-400">{isEn ? 'Try adjusting your search query, budget filter, map viewport, or district selection.' : 'عبارت جستجو، فیلتر وضعیت بودجه، کادر نقشه یا منطقه شهرداری را تغییر دهید.'}</p>
          <button type="button" onClick={resetAllFilters} className="px-4 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold transition cursor-pointer">{isEn ? 'Reset All Filters' : 'پاک کردن فیلترها و نمایش همه محله‌ها'}</button>
        </div>
      ) : layoutMode === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {filtered.map((hood) => {
            const isFav = p.favoriteHoodIds.includes(hood.id);
            const isSelected = hood.id === p.selectedHood.id;
            const unitBuy = convertPricePerSqmToUnit(hood.buyPerSqm, areaUnit);
            const unitDeal = convertPricePerSqmToUnit(dealPriceByHoodId.get(hood.id) ?? hood.buyPerSqm, areaUnit);
            const explain = explainNeighborhoodRecommendation(hood, { mode: p.mode, topReferenceScore: topFilteredScore });
            const isTiedTop = topFilteredScore !== undefined && Math.abs(hood.overallScore - topFilteredScore) <= 0.3 && tiedTopCount > 1;
            const isArcActive = comparisonArc.active && ((comparisonArc.hoodA?.id === p.selectedHood.id && comparisonArc.hoodB?.id === hood.id) || (comparisonArc.hoodB?.id === p.selectedHood.id && comparisonArc.hoodA?.id === hood.id));

            return (
              <div key={hood.id} className={`p-5 rounded-2xl bg-white dark:bg-slate-900 border transition-all flex flex-col justify-between ${isSelected ? 'border-emerald-600 dark:border-emerald-400 ring-1 ring-emerald-600 dark:ring-emerald-400 shadow-sm' : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'}`}>
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div role="button" tabIndex={0} onClick={() => p.onSelectNeighborhood(hood)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); p.onSelectNeighborhood(hood); } }} className="cursor-pointer">
                      <div className="text-[11px] text-slate-400 font-medium">{hood.zone} · امتیاز {toPersianNum(hood.overallScore)} از ۱۰ {isTiedTop && <span className="text-indigo-600 dark:text-indigo-400 font-bold">(≈ هم‌تراز ±۰.۳)</span>}</div>
                      <h3 className="text-base font-black text-slate-900 dark:text-white mt-0.5 flex items-center gap-1.5">
                        <span>محله {hood.name}</span>
                        {isSelected && <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-bold">فعال روی نقشه</span>}
                      </h3>
                      <div className="mt-1 text-[11px] font-medium">
                        {hood.status === 'green' ? <span className="text-emerald-600 dark:text-emerald-400">● همخوان با بودجه شما</span> : <span className="text-amber-600 dark:text-amber-400">● {toPersianNum(hood.diffPercent)}٪ بالاتر از بودجه</span>}
                      </div>
                    </div>
                    <button type="button" onClick={(e) => { e.stopPropagation(); p.onToggleFavorite(hood.id); }} aria-label={isFav ? `حذف ${hood.name} از منتخب‌ها` : `افزودن ${hood.name} به منتخب‌ها`} className={`p-1.5 rounded-lg border transition cursor-pointer ${isFav ? 'bg-rose-50 dark:bg-rose-950/60 border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400' : 'border-slate-200 dark:border-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}>
                      <Heart className={`w-3.5 h-3.5 ${isFav ? 'fill-rose-500 text-rose-500' : ''}`} />
                    </button>
                  </div>

                  <div className="my-3.5 pt-3 border-t border-slate-100 dark:border-slate-800 grid grid-cols-2 gap-3 tabular-nums">
                    <div>
                      <div className="flex items-center justify-between text-[10px] text-slate-400 font-medium">
                        <span>اعلامی / معامله:</span>
                        {unitBuy > unitDeal && <span className="text-emerald-700 dark:text-emerald-400 font-bold bg-emerald-50 dark:bg-emerald-950/40 px-1 rounded">~{toPersianNum(Math.max(1, Math.round(((unitBuy - unitDeal) / unitBuy) * 100)))}٪ تخفیف</span>}
                      </div>
                      <strong className="text-sm font-black text-slate-900 dark:text-white mt-0.5 block">
                        {toPersianNum(unitBuy)} <span className="text-emerald-600 dark:text-emerald-400">({toPersianNum(unitDeal)})</span> <span className="text-[10px] font-normal text-slate-400">م.ت{intlCurrency !== 'IRT' ? ` · ${formatMillionTomanAsIntlCurrency(unitDeal, intlCurrency, radarLocale)}` : ''}</span>
                      </strong>
                    </div>
                    <div className="border-r border-slate-100 dark:border-slate-800 pr-3">
                      <span className="text-[10px] text-slate-400 block font-medium">رهن ۸۰ متر:</span>
                      <strong className="text-sm font-black text-emerald-600 dark:text-emerald-400 mt-0.5 block">{toPersianNum(hood.rahn80m)} <span className="text-[10px] font-normal text-slate-400">م.ت</span></strong>
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
          {filtered.map((hood) => {
            const isFav = p.favoriteHoodIds.includes(hood.id);
            const unitBuy = convertPricePerSqmToUnit(hood.buyPerSqm, areaUnit);
            const unitDeal = convertPricePerSqmToUnit(dealPriceByHoodId.get(hood.id) ?? hood.buyPerSqm, areaUnit);
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
                    <div className="text-[11px] text-slate-400">{hood.zone} · {explain.nonCompensatoryWarningsFa[0] ? `⚠ ${explain.nonCompensatoryWarningsFa[0]}` : (hood.pros || 'موقعیت متوازن')}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 sm:gap-3 tabular-nums">
                  <div>
                    <span className="text-[10px] text-slate-400 block">اعلامی / معامله v6.4:</span>
                    <span className="font-black text-slate-900 dark:text-white">{toPersianNum(unitBuy)} <span className="text-emerald-600 dark:text-emerald-400">({toPersianNum(unitDeal)})</span> م</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block">رهن ۸۰متر:</span>
                    <span className="font-black text-emerald-600 dark:text-emerald-400">{toPersianNum(hood.rahn80m)} م</span>
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
    </div>
  );
}
