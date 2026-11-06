/**
 * @file src/components/priceHeatmapAndViewportLazy.tsx
 * @description
 * 1. Leaflet Price-Density Heatmap Layer powered by `d3-scale` (`scaleLinear`) color gradients.
 * 2. Viewport `IntersectionObserver` + spatial bounding-box lazy rendering for neighborhood markers
 *    and listing cards to minimize initial DOM nodes and memory footprint.
 */

import React, { useEffect, useRef, useState } from 'react';
import { scaleLinear } from 'd3-scale';
import { EvaluatedNeighborhood, toPersianNum } from '../data/neighborhoods';
import { aggregateNeighborhoodMarketMetrics } from '../data/realMarketPriceAggregator';
import {
  convertPricePerSqmToUnit,
  formatAreaShort,
  formatAreaUnitLabel,
  formatMillionTomanAsIntlCurrency,
  getStoredAreaUnit,
  getStoredIntlCurrency,
  getStoredRadarLocale,
} from '../utils/areaUnit';
import { escapeHtmlAttr } from '../utils/security';

export interface PriceDensityPointStyle {
  pricePerSqm: number;
  normalizedIntensity: number; // 0..1
  fillColor: string;
  strokeColor: string;
  pillBgColor: string;
}

export interface D3PriceDensityScaleResult {
  minPriceSqm: number;
  medianPriceSqm: number;
  maxPriceSqm: number;
  getStyleForNeighborhood: (hood: EvaluatedNeighborhood) => PriceDensityPointStyle;
}

function getEffectivePricePerSqm(
  hood: EvaluatedNeighborhood,
  mode: 'rent' | 'buy',
  rentAgeMultiplier: number
): number {
  if (mode === 'rent') {
    return Math.max(1, Number(((hood.rahn80m / 80) * rentAgeMultiplier).toFixed(1)));
  }
  return Math.max(1, hood.buyPerSqm);
}

/**
 * Builds a continuous 5-stop `d3-scale` color gradient scale and intensity scale
 * for property price density per square meter across active neighborhoods.
 */
export function buildD3PriceDensityScale(
  neighborhoods: EvaluatedNeighborhood[],
  mode: 'rent' | 'buy',
  rentAgeMultiplier = 1
): D3PriceDensityScaleResult {
  const prices = neighborhoods
    .map((h) => getEffectivePricePerSqm(h, mode, rentAgeMultiplier))
    .filter((v) => Number.isFinite(v) && v > 0)
    .sort((a, b) => a - b);

  const minP = prices[0] ?? 50;
  const maxP = prices[prices.length - 1] ?? 250;
  const p25 = prices[Math.floor((prices.length - 1) * 0.25)] ?? (minP + maxP) * 0.35;
  const median = prices[Math.floor((prices.length - 1) * 0.5)] ?? (minP + maxP) * 0.5;
  const p75 = prices[Math.floor((prices.length - 1) * 0.75)] ?? (minP + maxP) * 0.75;

  const safeMax = maxP > minP ? maxP : minP + 10;

  // d3-scale multi-stop thermal price density gradient:
  // Emerald (affordable) -> Cyan -> Amber (median) -> Rose (expensive) -> Violet (ultra-prime density)
  const colorScale = scaleLinear<string>()
    .domain([minP, p25, median, p75, safeMax])
    .range(['#10b981', '#06b6d4', '#f59e0b', '#f43f5e', '#9333ea'])
    .clamp(true);

  const strokeScale = scaleLinear<string>()
    .domain([minP, median, safeMax])
    .range(['#059669', '#d97706', '#7e22ce'])
    .clamp(true);

  const intensityScale = scaleLinear<number>()
    .domain([minP, safeMax])
    .range([0.15, 1])
    .clamp(true);

  return {
    minPriceSqm: Math.round(minP),
    medianPriceSqm: Math.round(median),
    maxPriceSqm: Math.round(safeMax),
    getStyleForNeighborhood: (hood: EvaluatedNeighborhood): PriceDensityPointStyle => {
      const pricePerSqm = getEffectivePricePerSqm(hood, mode, rentAgeMultiplier);
      const fillColor = colorScale(pricePerSqm);
      const strokeColor = strokeScale(pricePerSqm);
      const normalizedIntensity = Number(intensityScale(pricePerSqm).toFixed(3));
      return {
        pricePerSqm,
        normalizedIntensity,
        fillColor,
        strokeColor,
        pillBgColor: strokeColor,
      };
    },
  };
}

/**
 * Renders concentric thermal price-density heatmap aura circles on the Leaflet map
 * using the `d3-scale` color gradient.
 */
export function renderPriceDensityHeatmapOnLeaflet(
  L: any,
  map: any,
  neighborhoods: EvaluatedNeighborhood[],
  scaleResult: D3PriceDensityScaleResult,
  mode: 'rent' | 'buy',
  onSelectNeighborhood: (hood: EvaluatedNeighborhood) => void
): any {
  const layerGroup = L.layerGroup();
  const areaUnit = getStoredAreaUnit();
  const intlCurrency = getStoredIntlCurrency();
  const locale = getStoredRadarLocale();

  neighborhoods.forEach((hood) => {
    if (!isNeighborhoodInLeafletViewport(map, hood.lat, hood.lng, 0.25)) return;
    const style = scaleResult.getStyleForNeighborhood(hood);
    const baseRadius = Math.max(650, (hood.radius || 950) * (0.85 + style.normalizedIntensity * 0.55));
    const safeName = escapeHtmlAttr(hood.name);
    const unitPrice = convertPricePerSqmToUnit(style.pricePerSqm, areaUnit);
    const unitDeal = convertPricePerSqmToUnit(aggregateNeighborhoodMarketMetrics(hood.id, hood.name, hood.buyPerSqm, []).estimatedDealPricePerSqm, areaUnit);
    const monthlyRent80mMillions = Math.round(hood.rahn80m * 0.03);
    const unitLabel = escapeHtmlAttr(`${mode === 'rent' ? 'رهن هر' : 'خرید هر'} ${formatAreaUnitLabel(areaUnit)}`);
    const safeFxSuffix =
      intlCurrency !== 'IRT'
        ? escapeHtmlAttr(` (${formatMillionTomanAsIntlCurrency(unitPrice, intlCurrency, locale)})`)
        : '';
    const safeDealRow = mode === 'buy'
      ? `<br/><span>🤝 معامله v6.4: <strong>${toPersianNum(unitDeal)} میلیون تومان</strong></span>`
      : '';

    // Outer diffused thermal halo
    const outerCircle = L.circle([hood.lat, hood.lng], {
      radius: baseRadius * 1.45,
      stroke: false,
      fillColor: style.fillColor,
      fillOpacity: 0.16 + style.normalizedIntensity * 0.12,
      interactive: false,
    });

    // Mid thermal core
    const midCircle = L.circle([hood.lat, hood.lng], {
      radius: baseRadius * 0.9,
      color: style.strokeColor,
      weight: 1,
      opacity: 0.45,
      fillColor: style.fillColor,
      fillOpacity: 0.28 + style.normalizedIntensity * 0.2,
    });

    midCircle.bindTooltip(
      `<div dir="rtl" style="font-family:Vazirmatn,Tahoma,sans-serif;text-align:right;font-size:11px;">
        <strong>🔥 چگالی قیمت ${safeName}</strong><br/>
        <span>${unitLabel}: <strong>${toPersianNum(unitPrice)} میلیون تومان${safeFxSuffix}</strong></span>${safeDealRow}<br/>
        <span>رهن ${formatAreaShort(80, areaUnit)}: <strong>${toPersianNum(monthlyRent80mMillions)} م اجاره</strong></span><br/>
        <span style="font-size:10px;opacity:0.85;">شدت نسبی قیمت در شهر: ${toPersianNum(Math.round(style.normalizedIntensity * 100))}٪</span>
      </div>`,
      { direction: 'top', sticky: true }
    );
    midCircle.on('click', () => onSelectNeighborhood(hood));

    layerGroup.addLayer(outerCircle);
    layerGroup.addLayer(midCircle);
  });

  layerGroup.addTo(map);
  return layerGroup;
}

/**
 * Checks whether a neighborhood coordinate is inside the current padded Leaflet map viewport
 * so off-screen markers are lazily mounted only when entering the user's viewport.
 */
export function isNeighborhoodInLeafletViewport(
  map: any,
  lat: number,
  lng: number,
  padRatio = 0.22
): boolean {
  try {
    if (!map || typeof map.getBounds !== 'function') return true;
    const bounds = map.getBounds();
    if (!bounds || typeof bounds.pad !== 'function') return true;
    return Boolean(bounds.pad(padRatio).contains([lat, lng]));
  } catch {
    return true;
  }
}

export interface ViewportLazyRenderProps {
  children: React.ReactNode;
  minHeightPx?: number;
  rootMargin?: string;
  className?: string;
}

/**
 * Lazily mounts and renders listing cards, media galleries, and charts only when
 * their container enters (or is within `rootMargin` of) the user's viewport via `IntersectionObserver`.
 */
export function ViewportLazyRender({
  children,
  minHeightPx = 110,
  rootMargin = '160px 0px',
  className = '',
}: ViewportLazyRenderProps): React.ReactElement {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [hasEnteredViewport, setHasEnteredViewport] = useState<boolean>(
    () => typeof window === 'undefined' || typeof IntersectionObserver === 'undefined'
  );

  useEffect(() => {
    if (hasEnteredViewport) return undefined;
    const el = hostRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setHasEnteredViewport(true);
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting || entry.intersectionRatio > 0) {
            setHasEnteredViewport(true);
            observer.disconnect();
            break;
          }
        }
      },
      { rootMargin, threshold: 0.01 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [hasEnteredViewport, rootMargin]);

  return (
    <div ref={hostRef} className={className} style={!hasEnteredViewport ? { minHeight: `${minHeightPx}px` } : undefined}>
      {hasEnteredViewport ? (
        children
      ) : (
        <div
          aria-hidden="true"
          className="w-full rounded-[12px] bg-slate-100/80 dark:bg-slate-800/80 border border-slate-200/60 dark:border-slate-700/60 p-3.5 animate-pulse space-y-2"
          style={{ minHeight: `${minHeightPx}px` }}
        >
          <div className="h-3 w-2/5 bg-slate-200/90 dark:bg-slate-700/90 rounded-md" />
          <div className="h-4 w-4/5 bg-slate-200/90 dark:bg-slate-700/90 rounded-md" />
          <div className="h-8 w-full bg-slate-200/70 dark:bg-slate-700/70 rounded-lg mt-2" />
        </div>
      )}
    </div>
  );
}
