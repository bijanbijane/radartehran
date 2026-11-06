/**
 * @fileoverview Smart Neighborhood Recommender Modal (`src/components/SmartSuggestModal.tsx`).
 * Recommends the best matching neighborhoods for the user's effective Buy or Rent budget,
 * sorted dynamically by Undervaluation, Lowest Price, Clean Air & Calm, or Commute & Metro access.
 */

import React, { useMemo } from 'react';
import { Compass, Scale, Sparkles, X } from 'lucide-react';
import { EvaluatedNeighborhood, toPersianNum } from '../data/neighborhoods';
import { aggregateNeighborhoodMarketMetrics } from '../data/realMarketPriceAggregator';
import { resolveCityIdForNeighborhood } from '../data/multiCityData';
import { clampNumber, recordDiagnosticEvent } from '../utils/security';
import { useDialogFocus } from './useDialogFocus';
import {
  computeSpatialProximityReport,
  updateMapAdvancedOverlayState,
} from './mapAdvancedLayers';
import { AreaUnitToggle, useAreaUnit, useRadarLocale, useIntlCurrency } from './AreaUnitToggle';
import { convertPricePerSqmToUnit, formatAreaValue, formatMillionTomanAsIntlCurrency } from '../utils/areaUnit';

export type SuggestSortMode = 'undervalued' | 'cheapest' | 'clean_calm' | 'commute_metro';

export interface SmartSuggestModalProps {
  open: boolean;
  onClose: () => void;
  mode: 'rent' | 'buy';
  totalRahnEquivalent: number;
  maxAffordablePerSqm: number;
  targetSqm?: number;
  rentAgeMultiplier?: number;
  suggestSortBy: SuggestSortMode;
  setSuggestSortBy: React.Dispatch<React.SetStateAction<SuggestSortMode>>;
  smartSuggestedNeighborhoods: EvaluatedNeighborhood[];
  onSelectNeighborhood: (hood: EvaluatedNeighborhood) => void;
}

export function SmartSuggestModal({
  open,
  onClose,
  mode,
  totalRahnEquivalent,
  maxAffordablePerSqm,
  targetSqm = 80,
  rentAgeMultiplier = 1,
  suggestSortBy,
  setSuggestSortBy,
  smartSuggestedNeighborhoods,
  onSelectNeighborhood,
}: SmartSuggestModalProps): React.ReactElement | null {
  const dialogRef = useDialogFocus(open, onClose);
  const [areaUnit] = useAreaUnit();
  const [locale] = useRadarLocale();
  const [intlCurrency] = useIntlCurrency();
  const isEn = locale === 'en';

  const safeList = useMemo(() => {
    return Array.isArray(smartSuggestedNeighborhoods) ? smartSuggestedNeighborhoods : [];
  }, [smartSuggestedNeighborhoods]);

  if (!open) return null;

  const safeRahn = clampNumber(totalRahnEquivalent, 10, 100000, 1200);
  const safeBuySqm = clampNumber(maxAffordablePerSqm, 10, 2000, 110);
  const safeTargetSqm = clampNumber(targetSqm, 30, 350, 80);

  const handleSelectItem = (hood: EvaluatedNeighborhood): void => {
    try {
      recordDiagnosticEvent('SmartSuggestModal', `Selected suggested hood: ${hood.name}`, 'success');
      onSelectNeighborhood(hood);
      onClose();
    } catch {
      onClose();
    }
  };

  const topSuggestedHood = safeList[0] || null;

  const sortTabs: { id: SuggestSortMode; labelFa: string; labelEn: string }[] = [
    { id: 'undervalued', labelFa: 'بیشترین جاماندگی از بازار', labelEn: 'Top Undervalued' },
    { id: 'cheapest', labelFa: 'ارزان‌ترین قیمت', labelEn: 'Lowest Price' },
    { id: 'clean_calm', labelFa: 'پاک‌ترین هوا و آرامش', labelEn: 'Clean Air & Calm' },
    { id: 'commute_metro', labelFa: 'نزدیک‌ترین به کار و مترو', labelEn: 'Commute & Metro' },
  ];

  return (
    <div
      dir={isEn ? 'ltr' : 'rtl'}
      role="dialog"
      aria-modal="true"
      aria-label={isEn ? 'Smart Neighborhood Recommendations' : 'پیشنهاد هوشمند محله'}
      onClick={onClose}
      className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50"
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="apple-window-sheet bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-3xl w-full p-5 max-h-[88vh] overflow-y-auto focus:outline-none shadow-2xl"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/70 dark:border-slate-800 pb-3.5 mb-4">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 flex items-center justify-center shadow-xs shrink-0">
              <Sparkles className="w-4 h-4 stroke-[1.75]" />
            </span>
            <div>
              <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                {isEn ? 'Smart Neighborhood Recommendations' : 'پیشنهاد هوشمند بهترین محله‌ها برای بودجه شما'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                {isEn ? 'Based on your current budget: ' : 'بر اساس بودجه فعلی شما: '}
                {mode === 'rent'
                  ? (isEn
                      ? `~${toPersianNum(safeRahn)}M deposit (${formatAreaValue(safeTargetSqm, areaUnit, true)}) · rent: ${toPersianNum(Math.round(safeRahn * 0.03))}M/mo${intlCurrency !== 'IRT' ? ` · ${formatMillionTomanAsIntlCurrency(safeRahn, intlCurrency, locale)}` : ''}`
                      : `معادل ${toPersianNum(safeRahn)} میلیون رهن کامل (${formatAreaValue(safeTargetSqm, areaUnit, true)}) · اجاره ماهانه: ${toPersianNum(Math.round(safeRahn * 0.03))} م${intlCurrency !== 'IRT' ? ` · ${formatMillionTomanAsIntlCurrency(safeRahn, intlCurrency, locale)}` : ''}`)
                  : (isEn
                      ? `${toPersianNum(convertPricePerSqmToUnit(safeBuySqm, areaUnit))}M/${areaUnit === 'sqft' ? 'ft²' : 'm²'} · total ${formatAreaValue(safeTargetSqm, areaUnit, true)}: ${toPersianNum(Math.round(safeBuySqm * safeTargetSqm))}M${intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(Math.round(safeBuySqm * safeTargetSqm), intlCurrency, locale)})` : ''}`
                      : `${areaUnit === 'sqft' ? 'هر ft² ' : 'متری '}${toPersianNum(convertPricePerSqmToUnit(safeBuySqm, areaUnit))} میلیون تومان · کل ${formatAreaValue(safeTargetSqm, areaUnit, true)}: ${toPersianNum(Math.round(safeBuySqm * safeTargetSqm))} م${intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(Math.round(safeBuySqm * safeTargetSqm), intlCurrency, locale)})` : ''}`)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <AreaUnitToggle compact showIntlControls />
            <button
              type="button"
              aria-label={isEn ? 'Close recommendations' : 'بستن پیشنهاد هوشمند'}
              onClick={onClose}
              className="p-1.5 rounded-full bg-slate-200/80 dark:bg-slate-800 hover:bg-slate-300/80 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 cursor-pointer transition"
            >
              <X className="w-4 h-4 stroke-[1.75]" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-1.5 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl mb-4 text-xs font-bold">
          {sortTabs.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => {
                setSuggestSortBy(f.id);
                if (f.id === 'commute_metro') {
                  updateMapAdvancedOverlayState({
                    showMetroLines: true,
                    showCommuteIsochrones: true,
                  });
                }
              }}
              className={`py-2 px-2.5 rounded-lg text-center transition cursor-pointer ${
                suggestSortBy === f.id
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-extrabold shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {isEn ? f.labelEn : f.labelFa}
            </button>
          ))}
        </div>

        {safeList.length === 0 ? (
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 p-6 text-center space-y-2">
            <Compass className="w-6 h-6 stroke-[1.75] text-slate-400 mx-auto" />
            <div className="text-xs font-bold text-slate-700 dark:text-slate-200">
              {isEn ? 'No neighborhoods found matching this filter.' : 'محله‌ای با این فیلتر یافت نشد.'}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {isEn ? 'Adjust your budget slightly or try another sort criterion.' : 'بودجه خود را در بخش فیلتر بودجه کمی تغییر دهید یا معیار مرتب‌سازی دیگری را انتخاب کنید.'}
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200/80 dark:border-slate-800 divide-y divide-slate-200/60 dark:divide-slate-800 overflow-hidden">
            {safeList.map((n, index) => {
              const scaledRahn = Math.round(n.rahn80m * (safeTargetSqm / 80) * rentAgeMultiplier);
              const uDeal = convertPricePerSqmToUnit(aggregateNeighborhoodMarketMetrics(n.id, n.name, n.buyPerSqm, []).estimatedDealPricePerSqm, areaUnit);
              const spatialRep = computeSpatialProximityReport(n, resolveCityIdForNeighborhood(n.id));
              return (
                <div
                  key={n.id}
                  className="w-full bg-white dark:bg-slate-900 hover:bg-slate-50/90 dark:hover:bg-slate-800/70 p-3.5 flex flex-wrap items-center justify-between gap-3 transition"
                >
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => handleSelectItem(n)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleSelectItem(n);
                      }
                    }}
                    className="flex items-center gap-3 flex-1 min-w-[220px] cursor-pointer"
                  >
                    <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200/70 dark:border-slate-700 flex items-center justify-center font-black text-slate-900 dark:text-white text-xs tabular-nums shrink-0">
                      {toPersianNum(index + 1)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-extrabold text-slate-900 dark:text-white text-sm">{isEn ? n.name : `محله ${n.name}`}</span>
                        <span className="text-xs text-slate-500 dark:text-slate-400">({n.zone})</span>
                        <span
                          className={`text-[11px] font-bold ${
                            n.status === 'green'
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : n.status === 'yellow'
                                ? 'text-amber-600 dark:text-amber-400'
                                : 'text-rose-600 dark:text-rose-400'
                          }`}
                        >
                          · {n.status === 'green'
                              ? (isEn ? 'Budget Match' : 'مناسب بودجه')
                              : n.status === 'yellow'
                                ? (isEn ? 'Borderline' : 'لب مرز بودجه')
                                : (isEn ? `+${toPersianNum(n.diffPercent)}% Above Budget` : `${toPersianNum(n.diffPercent)}٪ بالاتر از بودجه`)}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex flex-wrap items-center gap-2 tabular-nums">
                        <span>{(n.marketReport?.badgeText || 'متعادل').replace(/^[💎⚖️🔥🟢🟡🔴]+\s*/, '')}</span>
                        <span aria-hidden="true">·</span>
                        <span>{isEn ? `Air: ${toPersianNum(n.air)}/10` : `هوا: ${toPersianNum(n.air)}/۱۰`}</span>
                        <span aria-hidden="true">·</span>
                        <span>{isEn ? `Metro: ${toPersianNum(n.metro)}/10 (~${toPersianNum(spatialRep.nearestMetroDistKm)} km)` : `مترو: ${toPersianNum(n.metro)}/۱۰ (~${toPersianNum(spatialRep.nearestMetroDistKm)} کم تا ایستگاه)`}</span>
                        <span aria-hidden="true">·</span>
                        <span className={spatialRep.trafficZoneStatus === 'outside' ? 'text-emerald-700 dark:text-emerald-400 font-semibold' : 'text-amber-700 dark:text-amber-400'}>
                          {spatialRep.trafficZoneLabelFa}
                        </span>
                        {n.distKm !== null && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-emerald-700 dark:text-emerald-400">
                              {isEn ? `Job Dist: ${toPersianNum(n.distKm)} km` : `فاصله تا کار: ${toPersianNum(n.distKm)} کیلومتر`}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="text-left flex flex-col items-end gap-1">
                    <div className="text-xs font-extrabold text-slate-900 dark:text-white tabular-nums">
                      {mode === 'rent'
                        ? (isEn
                            ? `Deposit ${formatAreaValue(safeTargetSqm, areaUnit, true)}: ${toPersianNum(scaledRahn)}M · Rent: ${toPersianNum(Math.round(scaledRahn * 0.03))}M/mo`
                            : `رهن ${formatAreaValue(safeTargetSqm, areaUnit, true)}: ${toPersianNum(scaledRahn)} میلیون · اجاره ماهانه: ${toPersianNum(Math.round(scaledRahn * 0.03))} م`)
                        : (isEn
                            ? `Ask: ${toPersianNum(convertPricePerSqmToUnit(n.buyPerSqm, areaUnit))}M · Deal v6.4: ${toPersianNum(uDeal)}M/${areaUnit === 'sqft' ? 'ft²' : 'm²'}`
                            : `${areaUnit === 'sqft' ? 'هر ft² ' : 'متری '}${toPersianNum(convertPricePerSqmToUnit(n.buyPerSqm, areaUnit))} م · معامله v6.4: ${toPersianNum(uDeal)} م`)}
                    </div>
                    <div className="flex items-center gap-2">
                      {index > 0 && topSuggestedHood && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            updateMapAdvancedOverlayState({
                              comparisonArc: {
                                active: true,
                                isPinned: true,
                                hoodA: topSuggestedHood,
                                hoodB: n,
                              },
                            });
                            handleSelectItem(n);
                          }}
                          className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 text-[10.5px] font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <Scale className="w-3 h-3" />
                          <span>{isEn ? `Compare with #1` : `کمان مقایسه با رتبه ۱`}</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleSelectItem(n)}
                        className="text-[11px] text-emerald-700 dark:text-emerald-400 hover:underline font-bold cursor-pointer"
                      >
                        {isEn ? 'View on map →' : 'مشاهده روی نقشه ←'}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
