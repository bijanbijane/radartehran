/**
 * @file src/components/map/MapViewportPulseDock.tsx
 * @description Live collapsible bottom dock displaying real-time viewport neighborhood summary,
 * median price (+ v6.4 negotiation scenario / scaled rahn + FX), top-4 lens-ranked areas,
 * one-click comparison arc, and viewport ranking lock.
 */
import React, { useMemo, useState } from 'react';
import { ArrowLeftRight, ChevronDown, ChevronUp, Lock, Radar, Unlock } from 'lucide-react';
import { toPersianNum, type EvaluatedNeighborhood } from '../../data/neighborhoods';
import { FAST_SALE_FACTOR } from '../../data/hedonicPricingEngine';
import {
  convertPricePerSqmToUnit,
  formatMillionTomanAsIntlCurrency,
} from '../../utils/areaUnit';
import { useAreaUnit, useIntlCurrency, useRadarLocale } from '../AreaUnitToggle';
import { useExchangeRateSnapshot } from '../../features/commerce/services/exchangeRateClient';
import {
  type MapViewportBoundsState,
  updateMapAdvancedOverlayState,
  useMapAdvancedOverlayState,
} from '../mapAdvancedLayers';
import { listNeighborhoodsInMapViewport } from './mapViewportHoodFilter';

export type MapPulseLensId = 'budget' | 'bubble' | 'air' | 'traffic' | 'heatmap';

export interface ViewportPulseSnapshot {
  inViewportCount: number;
  affordableCount: number;
  totalCityCount: number;
  usingFullCityFallback: boolean;
  viewportMedianBuyPerSqm: number | null;
  cityMedianBuyPerSqm: number | null;
  viewportNegotiatedBuyPerSqm: number | null;
  viewportMedianRahn: number | null;
  cityMedianRahn: number | null;
  diffVsCityPct: number | null;
  topNeighborhoods: EvaluatedNeighborhood[];
}

function computeMedian(values: readonly number[]): number | null {
  const clean = values.filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
  if (clean.length === 0) return null;
  const mid = Math.floor(clean.length / 2);
  return clean.length % 2 === 1 ? Math.round(clean[mid]) : Math.round((clean[mid - 1] + clean[mid]) / 2);
}

function scaledRahnForHood(hood: EvaluatedNeighborhood, targetSqm: number, rentAgeMultiplier: number): number {
  const safeSqm = Math.max(25, Number.isFinite(targetSqm) ? targetSqm : 80);
  const safeMult = Number.isFinite(rentAgeMultiplier) && rentAgeMultiplier > 0 ? rentAgeMultiplier : 1;
  return Math.round((Number(hood.rahn80m) || 0) * (safeSqm / 80) * safeMult);
}

const STATUS_RANK: Record<string, number> = { green: 0, yellow: 1, red: 2 };

export function computeViewportPulseSnapshot(params: {
  evaluatedNeighborhoods: readonly EvaluatedNeighborhood[];
  viewportBounds: MapViewportBoundsState | null;
  mode: 'rent' | 'buy';
  targetSqm: number;
  rentAgeMultiplier: number;
  mapLens: MapPulseLensId;
}): ViewportPulseSnapshot {
  const { evaluatedNeighborhoods, viewportBounds, mode, targetSqm, rentAgeMultiplier, mapLens } = params;
  const inBounds = viewportBounds
    ? listNeighborhoodsInMapViewport(evaluatedNeighborhoods, viewportBounds)
    : [];
  // Fall back to city-wide data only when no viewport has been established.
  // An established viewport with zero matching neighborhoods is a genuine empty state.
  const usingFullCityFallback = viewportBounds === null;
  const activeSet = usingFullCityFallback ? [...evaluatedNeighborhoods] : inBounds;

  const cityMedianBuyPerSqm = computeMedian(evaluatedNeighborhoods.map((h) => Number(h.buyPerSqm)));
  const viewportMedianBuyPerSqm = computeMedian(activeSet.map((h) => Number(h.buyPerSqm)));
  const viewportNegotiatedBuyPerSqm =
    viewportMedianBuyPerSqm !== null ? Math.round(viewportMedianBuyPerSqm * FAST_SALE_FACTOR) : null;

  const cityMedianRahn = computeMedian(
    evaluatedNeighborhoods.map((h) => scaledRahnForHood(h, targetSqm, rentAgeMultiplier)),
  );
  const viewportMedianRahn = computeMedian(
    activeSet.map((h) => scaledRahnForHood(h, targetSqm, rentAgeMultiplier)),
  );

  const vpMetric = mode === 'buy' ? viewportMedianBuyPerSqm : viewportMedianRahn;
  const cityMetric = mode === 'buy' ? cityMedianBuyPerSqm : cityMedianRahn;
  const diffVsCityPct =
    vpMetric !== null && cityMetric !== null && cityMetric > 0
      ? Math.round(((vpMetric - cityMetric) / cityMetric) * 100)
      : null;

  const sorted = [...activeSet].sort((a, b) => {
    if (mapLens === 'heatmap') {
      const aVal = mode === 'buy' ? a.buyPerSqm : scaledRahnForHood(a, targetSqm, rentAgeMultiplier);
      const bVal = mode === 'buy' ? b.buyPerSqm : scaledRahnForHood(b, targetSqm, rentAgeMultiplier);
      return aVal - bVal || b.overallScore - a.overallScore;
    }
    if (mapLens === 'bubble') {
      const aDiff = typeof a.diffPercent === 'number' ? a.diffPercent : 0;
      const bDiff = typeof b.diffPercent === 'number' ? b.diffPercent : 0;
      return aDiff - bDiff || b.overallScore - a.overallScore;
    }
    if (mapLens === 'air') return (b.air ?? 0) - (a.air ?? 0) || b.overallScore - a.overallScore;
    if (mapLens === 'traffic') {
      const aTraffic = a.trafficInfo?.trafficScore ?? 6.5;
      const bTraffic = b.trafficInfo?.trafficScore ?? 6.5;
      return bTraffic - aTraffic || (b.metro ?? 0) - (a.metro ?? 0);
    }
    const rankDiff = (STATUS_RANK[a.status] ?? 3) - (STATUS_RANK[b.status] ?? 3);
    return rankDiff || b.overallScore - a.overallScore || a.buyPerSqm - b.buyPerSqm;
  });

  return {
    inViewportCount: viewportBounds ? inBounds.length : evaluatedNeighborhoods.length,
    affordableCount: activeSet.filter((h) => h.status === 'green').length,
    totalCityCount: evaluatedNeighborhoods.length,
    usingFullCityFallback,
    viewportMedianBuyPerSqm,
    cityMedianBuyPerSqm,
    viewportNegotiatedBuyPerSqm,
    viewportMedianRahn,
    cityMedianRahn,
    diffVsCityPct,
    topNeighborhoods: sorted.slice(0, 4),
  };
}

export interface MapViewportPulseDockProps {
  evaluatedNeighborhoods: EvaluatedNeighborhood[];
  selectedHood: EvaluatedNeighborhood;
  mode: 'rent' | 'buy';
  targetSqm: number;
  rentAgeMultiplier: number;
  mapLens: MapPulseLensId;
  onSelectNeighborhood: (hood: EvaluatedNeighborhood) => void;
}

const LENS_CAPTION_FA: Record<MapPulseLensId, string> = {
  budget: 'برترین‌های بودجه',
  heatmap: 'اقتصادی‌ترین کادر',
  bubble: 'کم‌حباب‌ترین کادر',
  air: 'پاک‌ترین هوای کادر',
  traffic: 'خلوت‌ترین ترافیک',
};

export const MapViewportPulseDock: React.FC<MapViewportPulseDockProps> = ({
  evaluatedNeighborhoods,
  selectedHood,
  mode,
  targetSqm,
  rentAgeMultiplier,
  mapLens,
  onSelectNeighborhood,
}) => {
  const [areaUnit] = useAreaUnit();
  const [intlCurrency] = useIntlCurrency();
  const [locale] = useRadarLocale();
  const rateState = useExchangeRateSnapshot();
  const isEn = locale === 'en';
  const { viewportBounds, filterRankingByViewport, comparisonArc } = useMapAdvancedOverlayState();
  const [collapsed, setCollapsed] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth < 1280 : false,
  );

  const snapshot = useMemo(
    () =>
      computeViewportPulseSnapshot({
        evaluatedNeighborhoods,
        viewportBounds,
        mode,
        targetSqm,
        rentAgeMultiplier,
        mapLens,
      }),
    [evaluatedNeighborhoods, viewportBounds, mode, targetSqm, rentAgeMultiplier, mapLens],
  );

  if (evaluatedNeighborhoods.length === 0) return null;

  const safeSqm = Math.max(25, targetSqm || 80);
  const unitLabel = areaUnit === 'sqft' ? 'ft²' : 'م²';
  const medianBuyUnit =
    snapshot.viewportMedianBuyPerSqm !== null
      ? convertPricePerSqmToUnit(snapshot.viewportMedianBuyPerSqm, areaUnit)
      : null;
  const negotiatedBuyUnit =
    snapshot.viewportNegotiatedBuyPerSqm !== null
      ? convertPricePerSqmToUnit(snapshot.viewportNegotiatedBuyPerSqm, areaUnit)
      : null;

  const medianPrimaryText =
    mode === 'buy'
      ? medianBuyUnit !== null
        ? `${toPersianNum(medianBuyUnit)} م/${unitLabel}`
        : '—'
      : snapshot.viewportMedianRahn !== null
        ? `${toPersianNum(snapshot.viewportMedianRahn)} م (${toPersianNum(safeSqm)}م)`
        : '—';

  const fxText =
    intlCurrency !== 'IRT'
      ? mode === 'buy' && snapshot.viewportMedianBuyPerSqm !== null
        ? formatMillionTomanAsIntlCurrency(
            convertPricePerSqmToUnit(snapshot.viewportMedianBuyPerSqm, areaUnit),
            intlCurrency,
            locale,
            rateState.snapshot,
          )
        : mode === 'rent' && snapshot.viewportMedianRahn !== null
          ? formatMillionTomanAsIntlCurrency(snapshot.viewportMedianRahn, intlCurrency, locale, rateState.snapshot)
          : null
      : null;

  const diffText =
    snapshot.diffVsCityPct === null
      ? null
      : snapshot.diffVsCityPct === 0
        ? isEn ? 'At city median' : 'هم‌سطح میانه شهر'
        : snapshot.diffVsCityPct < 0
          ? isEn
            ? `${Math.abs(snapshot.diffVsCityPct)}% below city`
            : `${toPersianNum(Math.abs(snapshot.diffVsCityPct))}٪ ارزان‌تر از کل شهر`
          : isEn
            ? `${snapshot.diffVsCityPct}% above city`
            : `${toPersianNum(snapshot.diffVsCityPct)}٪ گران‌تر از کل شهر`;

  const toggleComparisonArc = (targetHood: EvaluatedNeighborhood) => {
    if (targetHood.id === selectedHood.id) return;
    const isActiveForTarget =
      comparisonArc.active &&
      comparisonArc.hoodA?.id === selectedHood.id &&
      comparisonArc.hoodB?.id === targetHood.id;
    updateMapAdvancedOverlayState({
      comparisonArc: isActiveForTarget
        ? { active: false, isPinned: false, hoodA: null, hoodB: null }
        : { active: true, isPinned: true, hoodA: selectedHood, hoodB: targetHood },
    });
  };

  if (collapsed) {
    return (
      <div
        data-testid="map-viewport-pulse-dock"
        data-collapsed="true"
        className="pointer-events-auto fixed z-[26] bottom-[calc(4.75rem+env(safe-area-inset-bottom))] lg:bottom-4 left-1/2 -translate-x-1/2 xl:left-[23.5rem] xl:right-[33.5rem] xl:translate-x-0 xl:w-fit xl:mx-auto max-w-[calc(100vw-8.75rem)]"
      >
        <button
          type="button"
          data-testid="pulse-dock-toggle"
          onClick={() => setCollapsed(false)}
          className="apple-vibrancy-bar border border-slate-200/90 dark:border-[var(--color-border-strong)] rounded-full px-3 py-1.5 shadow-lg flex items-center gap-2 text-[11px] font-bold text-slate-800 dark:text-[var(--color-text-primary)] cursor-pointer hover:bg-white dark:hover:bg-[var(--color-bg-elevated)] transition whitespace-nowrap"
        >
          <Radar className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" aria-hidden="true" />
          <span className="tabular-nums truncate">
            {snapshot.usingFullCityFallback
              ? isEn ? `${snapshot.totalCityCount} city areas` : `${toPersianNum(snapshot.totalCityCount)} محله کل شهر`
              : isEn ? `${snapshot.inViewportCount} in view` : `${toPersianNum(snapshot.inViewportCount)} محله در کادر`} · {medianPrimaryText}
          </span>
          <ChevronUp className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
        </button>
      </div>
    );
  }

  return (
    <section
      data-testid="map-viewport-pulse-dock"
      data-collapsed="false"
      aria-label={isEn ? 'Live map viewport radar' : 'رادار زنده کادر دید نقشه'}
      className="pointer-events-auto fixed z-[28] lg:z-[26] bottom-[calc(4.75rem+env(safe-area-inset-bottom))] lg:bottom-4 inset-x-3 lg:inset-x-auto lg:left-[23.5rem] lg:right-[22.5rem] xl:right-[33.5rem] max-w-[520px] mx-auto apple-vibrancy-bar bg-white/95 dark:bg-[var(--color-bg-surface)] border border-slate-200/90 dark:border-[var(--color-border-strong)] rounded-2xl shadow-xl p-2.5 space-y-2 text-[11px]"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 min-w-0">
          <span className="inline-flex items-center gap-1.5 font-bold text-slate-900 dark:text-white whitespace-nowrap">
            <Radar className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" aria-hidden="true" />
            <span>{isEn ? 'Viewport Radar' : 'رادار کادر دید'}</span>
          </span>
          <span className="text-slate-600 dark:text-[var(--color-text-secondary)] font-semibold tabular-nums whitespace-nowrap">
            {snapshot.usingFullCityFallback
              ? `${toPersianNum(snapshot.totalCityCount)} محله کل شهر`
              : `${toPersianNum(snapshot.inViewportCount)} محله در کادر`}
            <span className="text-emerald-700 dark:text-emerald-400 font-bold"> ({toPersianNum(snapshot.affordableCount)} مناسب بودجه)</span>
          </span>
          <span className="font-bold text-slate-900 dark:text-white tabular-nums whitespace-nowrap">
            میانه: {medianPrimaryText}
            {mode === 'buy' && negotiatedBuyUnit !== null && (
              <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 mr-1">
                (مذاکره v6.4: {toPersianNum(negotiatedBuyUnit)})
              </span>
            )}
            {fxText && <span className="text-[10px] font-semibold text-slate-500 mr-1">· {fxText}</span>}
          </span>
          {diffText && (
            <span
              className={`text-[10px] font-bold tabular-nums whitespace-nowrap ${
                (snapshot.diffVsCityPct ?? 0) <= 0
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : 'text-amber-700 dark:text-amber-400'
              }`}
            >
              {diffText}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            data-testid="pulse-dock-lock-viewport"
            disabled={!viewportBounds}
            aria-pressed={filterRankingByViewport}
            onClick={() => updateMapAdvancedOverlayState({ filterRankingByViewport: !filterRankingByViewport })}
            className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[10px] font-bold transition whitespace-nowrap cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
              filterRankingByViewport
                ? 'bg-[var(--color-brand-600)] text-white border-transparent'
                : 'border-slate-200 dark:border-[var(--color-border-strong)] text-slate-700 dark:text-[var(--color-text-primary)] hover:bg-slate-100 dark:hover:bg-[var(--color-bg-elevated)]'
            }`}
          >
            {filterRankingByViewport ? <Lock className="w-3 h-3" aria-hidden="true" /> : <Unlock className="w-3 h-3" aria-hidden="true" />}
            <span>{isEn ? 'Lock view' : 'قفل کادر'}</span>
          </button>
          <button
            type="button"
            data-testid="pulse-dock-toggle"
            aria-label={isEn ? 'Collapse viewport radar' : 'جمع‌کردن نوار رادار کادر دید'}
            onClick={() => setCollapsed(true)}
            className="p-1 rounded-lg border border-slate-200 dark:border-[var(--color-border-strong)] text-slate-600 dark:text-[var(--color-text-secondary)] hover:bg-slate-100 dark:hover:bg-[var(--color-bg-elevated)] cursor-pointer"
          >
            <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5" aria-label={LENS_CAPTION_FA[mapLens]}>
        {snapshot.topNeighborhoods.map((hood) => {
          const isSelected = hood.id === selectedHood.id;
          const isArcTarget =
            comparisonArc.active &&
            comparisonArc.hoodA?.id === selectedHood.id &&
            comparisonArc.hoodB?.id === hood.id;
          const hoodMetric =
            mapLens === 'air'
              ? `هوا ${toPersianNum(hood.air)}/۱۰`
              : mapLens === 'traffic'
                ? `ترافیک ${toPersianNum(hood.trafficInfo?.trafficScore ?? 6.5)}/۱۰`
                : mapLens === 'bubble'
                  ? hood.marketReport?.status === 'undervalued'
                    ? 'جامانده (ارزنده)'
                    : hood.marketReport?.status === 'balanced'
                      ? 'متعادل'
                      : `حباب ${toPersianNum(hood.diffPercent ?? 0)}٪`
                  : mode === 'buy'
                    ? `${toPersianNum(convertPricePerSqmToUnit(hood.buyPerSqm, areaUnit))} م`
                    : `${toPersianNum(scaledRahnForHood(hood, targetSqm, rentAgeMultiplier))} م`;

          return (
            <div
              key={hood.id}
              className={`flex items-center justify-between gap-1 px-2 py-1.5 rounded-xl border transition min-w-0 ${
                isSelected
                  ? 'border-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/40'
                  : 'border-slate-200/80 dark:border-[var(--color-border-strong)] bg-slate-50/70 dark:bg-[var(--color-bg-muted)] hover:border-slate-300 dark:hover:border-slate-600'
              }`}
            >
              <button
                type="button"
                onClick={() => onSelectNeighborhood(hood)}
                className="min-w-0 flex-1 text-start cursor-pointer"
              >
                <div className="font-bold text-slate-900 dark:text-white truncate text-[11px]">
                  {hood.name}
                </div>
                <div className="text-[10px] font-semibold text-slate-500 dark:text-[var(--color-text-muted)] tabular-nums truncate">
                  {hoodMetric}
                </div>
              </button>
              <button
                type="button"
                disabled={isSelected}
                aria-pressed={isArcTarget}
                data-testid={`pulse-dock-arc-${hood.id}`}
                title={isSelected ? 'محله فعال فعلی' : `کمان مقایسه ${selectedHood.name} با ${hood.name}`}
                aria-label={isSelected ? 'محله فعال فعلی' : `ترسیم کمان مقایسه با ${hood.name}`}
                onClick={() => toggleComparisonArc(hood)}
                className={`p-1 rounded-lg border shrink-0 transition ${
                  isSelected
                    ? 'opacity-35 cursor-not-allowed border-transparent text-slate-400'
                    : isArcTarget
                      ? 'bg-indigo-600 text-white border-indigo-600 cursor-pointer'
                      : 'border-slate-200 dark:border-[var(--color-border-strong)] text-slate-600 dark:text-[var(--color-text-secondary)] hover:bg-indigo-50 dark:hover:bg-indigo-950/60 hover:text-indigo-700 cursor-pointer'
                }`}
              >
                <ArrowLeftRight className="w-3 h-3" aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
};
