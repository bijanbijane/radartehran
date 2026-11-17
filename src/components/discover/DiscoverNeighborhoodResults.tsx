/**
 * @file src/components/discover/DiscoverNeighborhoodResults.tsx
 * @description Semantic Grid & List result items for ProductDiscoverView (non-nested accessible buttons, unified DiscoverPriceSummary).
 */
import React from 'react';
import { ArrowLeftRight, ArrowUpRight, Heart, Scale } from 'lucide-react';
import { toPersianNum, type EvaluatedNeighborhood } from '../../data/neighborhoods';
import type { CityId } from '../../types/models';
import type { AreaUnit, IntlCurrencyCode, RadarLocale, RuntimeExchangeRateReference } from '../../utils/areaUnit';
import { explainNeighborhoodRecommendation } from '../useEvaluatedNeighborhoods';
import { resolveDiscoverFreshness } from '../../features/discovery/services/discoverPricingEngine';
import type { DiscoverLocaleCopy } from '../../features/discovery/i18n/discoverLocaleCopy';
import { DiscoverPriceSummary } from './DiscoverPriceSummary';

export interface DiscoverNeighborhoodResultsProps {
  items: EvaluatedNeighborhood[];
  layoutMode: 'grid' | 'list';
  selectedHood: EvaluatedNeighborhood;
  activeCity: CityId;
  favoriteHoodIds: number[];
  dealPriceByHoodId: ReadonlyMap<number, number>;
  topFilteredScore: number | undefined;
  tiedTopCount: number;
  comparisonArcActiveHoodBId?: number | null;
  comparisonArcActive: boolean;
  comparisonArcHoodAId?: number | null;
  targetSqm: number;
  mode: 'rent' | 'buy';
  areaUnit: AreaUnit;
  intlCurrency: IntlCurrencyCode;
  radarLocale: RadarLocale;
  exchangeRateRef?: RuntimeExchangeRateReference | null;
  copy: DiscoverLocaleCopy;
  onSelectNeighborhood: (hood: EvaluatedNeighborhood) => void;
  onToggleFavorite: (id: number) => void;
  onToggleComparisonArc: (hood: EvaluatedNeighborhood) => void;
  onOpenInspector: (hood: EvaluatedNeighborhood) => void;
  onOpenCompare: (id1: number, id2: number) => void;
}

export const DiscoverNeighborhoodResults: React.FC<DiscoverNeighborhoodResultsProps> = ({
  items,
  layoutMode,
  selectedHood,
  activeCity,
  favoriteHoodIds,
  dealPriceByHoodId,
  topFilteredScore,
  tiedTopCount,
  comparisonArcActive,
  comparisonArcHoodAId,
  comparisonArcActiveHoodBId,
  targetSqm,
  mode,
  areaUnit,
  intlCurrency,
  radarLocale,
  exchangeRateRef,
  copy,
  onSelectNeighborhood,
  onToggleFavorite,
  onToggleComparisonArc,
  onOpenInspector,
  onOpenCompare,
}) => {
  const formatNum = (val: number) => (copy.isEn ? val.toLocaleString('en-US') : toPersianNum(val));
  const checkArc = (hoodId: number) =>
    comparisonArcActive &&
    ((comparisonArcHoodAId === selectedHood.id && comparisonArcActiveHoodBId === hoodId) ||
      (comparisonArcActiveHoodBId === selectedHood.id && comparisonArcHoodAId === hoodId));

  if (layoutMode === 'grid') {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {items.map((hood) => {
          const isFav = favoriteHoodIds.includes(hood.id);
          const isSelected = hood.id === selectedHood.id;
          const dealPerSqm = dealPriceByHoodId.get(hood.id) ?? hood.buyPerSqm;
          const freshness = resolveDiscoverFreshness(hood, activeCity);
          const explain = explainNeighborhoodRecommendation(hood, { mode, topReferenceScore: topFilteredScore });
          const isTiedTop = topFilteredScore !== undefined && Math.abs(hood.overallScore - topFilteredScore) <= 0.3 && tiedTopCount > 1;
          const isArcActive = checkArc(hood.id);

          return (
            <div key={hood.id} className={`p-5 rounded-2xl bg-white dark:bg-slate-900/90 ring-1 transition-all flex flex-col justify-between ${isSelected ? 'ring-2 ring-emerald-600 dark:ring-emerald-400 shadow-md' : 'ring-slate-900/5 dark:ring-white/10 shadow-xs hover:shadow-sm hover:ring-slate-900/15 dark:hover:ring-white/20'}`}>
              <div>
                <div className="flex items-start justify-between gap-2">
                  <button
                    type="button"
                    aria-pressed={isSelected}
                    aria-label={copy.selectNeighborhoodAria(hood.name, hood.zone, isSelected)}
                    onClick={() => onSelectNeighborhood(hood)}
                    className={`flex-1 min-w-0 cursor-pointer rounded-lg focus-visible:outline-2 focus-visible:outline-emerald-600 ${copy.dir === 'rtl' ? 'text-right' : 'text-left'}`}
                  >
                    <div className="text-[11px] text-slate-400 font-medium">{hood.zone} · {copy.scoreLabel(hood.overallScore)} {isTiedTop && <span className="text-indigo-600 dark:text-indigo-400 font-bold">{copy.tiedTopNote}</span>}</div>
                    <h3 className="text-base font-black text-slate-900 dark:text-white mt-0.5 flex flex-wrap items-center gap-1.5">
                      <span>{copy.neighborhoodPrefix ? `${copy.neighborhoodPrefix} ${hood.name}` : hood.name}</span>
                      {topFilteredScore !== undefined && Math.abs(hood.overallScore - topFilteredScore) < 0.05 && (
                        <span className="text-[9.5px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 font-black ring-1 ring-amber-500/25">{copy.topOpportunityBadge}</span>
                      )}
                      {isSelected && <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-bold">{copy.selectedOnMapBadge}</span>}
                    </h3>
                    <div className="mt-1 text-[11px] font-medium">
                      {hood.status === 'green'
                        ? <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />{copy.inBudgetBadge}</span>
                        : <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400"><span className="w-1.5 h-1.5 rounded-full bg-amber-500" />{copy.aboveBudgetBadge(hood.diffPercent)}</span>}
                    </div>
                  </button>
                  <button type="button" onClick={() => onToggleFavorite(hood.id)} aria-pressed={isFav} aria-label={isFav ? copy.favoriteRemoveAria(hood.name) : copy.favoriteAddAria(hood.name)} className={`p-1.5 rounded-lg border transition cursor-pointer shrink-0 ${isFav ? 'bg-rose-50 dark:bg-rose-950/60 border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400' : 'border-slate-200 dark:border-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}>
                    <Heart className={`w-3.5 h-3.5 ${isFav ? 'fill-rose-500 text-rose-500' : ''}`} />
                  </button>
                </div>

                <DiscoverPriceSummary buyPerSqm={hood.buyPerSqm} dealPerSqm={dealPerSqm} rahn80m={hood.rahn80m} targetSqm={targetSqm} areaUnit={areaUnit} intlCurrency={intlCurrency} radarLocale={radarLocale} mode={mode} exchangeRateRef={exchangeRateRef} freshness={freshness} layout="grid" />

                <div className="text-[11px] text-slate-500 dark:text-slate-400 space-y-0.5 leading-relaxed">
                  <div className="truncate"><span className="text-slate-700 dark:text-slate-300 font-semibold">{copy.prosLabel}</span> {hood.pros || copy.prosFallback}</div>
                  <div className="truncate"><span className="text-slate-400 font-medium">{copy.livingNoteLabel}</span> {explain.nonCompensatoryWarningsFa[0] ? <span className="text-amber-600 dark:text-amber-400 font-bold">⚠ {explain.nonCompensatoryWarningsFa[0]}</span> : (hood.cons || copy.consFallback)}</div>
                </div>
              </div>

              <div className="pt-3.5 mt-3.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-1.5">
                <button type="button" onClick={() => onOpenInspector(hood)} className="flex-1 py-2 px-3 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer hover:opacity-90">
                  <span>{copy.inspectCardBtn}</span><ArrowUpRight className="w-3.5 h-3.5" />
                </button>
                {!isSelected && (
                  <button type="button" onClick={() => onToggleComparisonArc(hood)} aria-pressed={isArcActive} title={copy.mapArcTitle(selectedHood.name)} aria-label={copy.mapArcAria(hood.name)} className={`p-2 rounded-xl border text-xs transition cursor-pointer ${isArcActive ? 'bg-indigo-600 text-white border-indigo-600' : 'border-slate-200 dark:border-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400'}`}>
                    <Scale className="w-3.5 h-3.5" />
                  </button>
                )}
                <button type="button" onClick={() => onOpenCompare(selectedHood.id, hood.id)} title={copy.compareMatrixTitle} aria-label={copy.compareMatrixAria(hood.name, selectedHood.name)} className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs transition cursor-pointer">
                  <ArrowLeftRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="border border-slate-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
      {items.map((hood) => {
        const isFav = favoriteHoodIds.includes(hood.id);
        const isSelected = hood.id === selectedHood.id;
        const dealPerSqm = dealPriceByHoodId.get(hood.id) ?? hood.buyPerSqm;
        const freshness = resolveDiscoverFreshness(hood, activeCity);
        const explain = explainNeighborhoodRecommendation(hood, { mode, topReferenceScore: topFilteredScore });
        const isArcActive = checkArc(hood.id);

        return (
          <div key={hood.id} className={`p-3.5 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs ${isSelected ? 'bg-emerald-50/50 dark:bg-emerald-950/30' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}>
            <button
              type="button"
              aria-pressed={isSelected}
              aria-label={copy.selectNeighborhoodAria(hood.name, hood.zone, isSelected)}
              onClick={() => onSelectNeighborhood(hood)}
              className={`flex items-center gap-3 cursor-pointer rounded-lg focus-visible:outline-2 focus-visible:outline-emerald-600 ${copy.dir === 'rtl' ? 'text-right' : 'text-left'}`}
            >
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-black tabular-nums shrink-0 ${isSelected ? 'bg-emerald-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white'}`}>{formatNum(hood.overallScore)}</div>
              <div className="min-w-0">
                <div className="font-bold text-slate-900 dark:text-white text-sm flex flex-wrap items-center gap-1.5">
                  <span>{copy.neighborhoodPrefix ? `${copy.neighborhoodPrefix} ${hood.name}` : hood.name}</span>
                  {isSelected && <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 font-bold">{copy.selectedOnMapBadge}</span>}
                </div>
                <div className="text-[11px] text-slate-400 truncate">{hood.zone} · {explain.nonCompensatoryWarningsFa[0] || hood.pros || copy.prosFallback}</div>
              </div>
            </button>
            <div className="flex flex-wrap items-center gap-2 sm:gap-3 tabular-nums">
              <DiscoverPriceSummary buyPerSqm={hood.buyPerSqm} dealPerSqm={dealPerSqm} rahn80m={hood.rahn80m} targetSqm={targetSqm} areaUnit={areaUnit} intlCurrency={intlCurrency} radarLocale={radarLocale} mode={mode} exchangeRateRef={exchangeRateRef} freshness={freshness} layout="list" />
              <button type="button" onClick={() => onToggleFavorite(hood.id)} aria-pressed={isFav} aria-label={isFav ? copy.favoriteRemoveAria(hood.name) : copy.favoriteAddAria(hood.name)} className={`p-1.5 rounded-lg border transition cursor-pointer ${isFav ? 'bg-rose-50 dark:bg-rose-950/60 border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400' : 'border-slate-200 dark:border-slate-700 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}><Heart className={`w-3.5 h-3.5 ${isFav ? 'fill-rose-500 text-rose-500' : ''}`} /></button>
              {!isSelected && <button type="button" onClick={() => onToggleComparisonArc(hood)} aria-pressed={isArcActive} title={copy.mapArcTitle(selectedHood.name)} aria-label={copy.mapArcAria(hood.name)} className={`p-1.5 rounded-lg border transition cursor-pointer ${isArcActive ? 'bg-indigo-600 text-white border-indigo-600' : 'border-slate-200 dark:border-slate-700 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/50'}`}><Scale className="w-3.5 h-3.5" /></button>}
              <button type="button" onClick={() => onOpenCompare(selectedHood.id, hood.id)} title={copy.compareMatrixTitle} aria-label={copy.compareMatrixAria(hood.name, selectedHood.name)} className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"><ArrowLeftRight className="w-3.5 h-3.5" /></button>
              <button type="button" onClick={() => onOpenInspector(hood)} aria-label={copy.inspectRowAria(hood.name)} className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-900 hover:text-white dark:hover:bg-white dark:hover:text-slate-900 transition font-bold cursor-pointer">{copy.inspectRowBtn}</button>
            </div>
          </div>
        );
      })}
    </div>
  );
};
