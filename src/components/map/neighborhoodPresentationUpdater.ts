import { EvaluatedNeighborhood, isFeaturedMapSponsor, toPersianNum } from '../../data/neighborhoods';
import { CityId } from '../../data/multiCityData';
import { convertPricePerSqmToUnit, formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, type AreaUnit, type IntlCurrencyCode, type RadarLocale } from '../../utils/areaUnit';
import { AuthoritativeBoundaryRecord, getZoomAdaptivePolygonStyle, resolveNeighborhoodGeoJsonForLod } from '../../utils/neighborhoodBoundaries';
import { isLiveDivarBargainId } from '../../data/realMarketPriceAggregator';
import {
  buildNeighborhoodLodDivIconConfig,
  buildNeighborhoodRichTooltipHtml,
  renderGoldBargainPinOnLeaflet,
  type MarkerVisualTier,
} from '../mapZoomLodAndDeclutter';
import type { D3PriceDensityScaleResult } from '../priceHeatmapAndViewportLazy';
import { profileLayerReconciliation } from './mapRenderProfiler';

export function formatNeighborhoodLayerKey(cityId: CityId | string, hoodId: number): string {
  return `${cityId || 'tehran'}:${hoodId}`;
}

export interface PolygonLayerEntry {
  layer: any;
  geometryKey: string;
  styleKey: string;
  stroke: string;
  fill: string;
  hood: EvaluatedNeighborhood;
  cityId?: CityId;
  scopedKey?: string;
}

export interface NeighborhoodMarkerEntry {
  marker: any;
  lat: number;
  lng: number;
  lastIconKey: string;
  lastTooltipKey: string;
  lastThemeKey: string;
  lodTier: MarkerVisualTier;
  pillBg: string;
  hasSponsor: boolean;
  stroke: string;
  fill: string;
  hood: EvaluatedNeighborhood;
  cityId?: CityId;
  scopedKey?: string;
  baseZIndex?: number;
}

export type MarkerLayerEntry = NeighborhoodMarkerEntry;

export interface GoldPinLayerEntry {
  pin: any;
  signature: string;
  cityId?: CityId;
  scopedKey?: string;
}

export interface NeighborhoodReconcilerRefs {
  polygonsByHood: Map<number, PolygonLayerEntry>;
  markersByHood: Map<number, NeighborhoodMarkerEntry>;
  goldPinsByHood: Map<number, GoldPinLayerEntry>;
}

export function getLensPalette(
  hood: EvaluatedNeighborhood,
  mapLens: 'budget' | 'bubble' | 'air' | 'traffic' | 'heatmap',
  d3PriceScale?: D3PriceDensityScaleResult
): { stroke: string; fill: string; pillBg: string } {
  if (mapLens === 'heatmap' && d3PriceScale) {
    const s = d3PriceScale.getStyleForNeighborhood(hood);
    return { stroke: s.strokeColor, fill: s.fillColor, pillBg: s.pillBgColor };
  }
  if (mapLens === 'bubble') {
    if (hood.marketReport.status === 'undervalued') return { stroke: '#047857', fill: '#34d399', pillBg: '#047857' };
    if (hood.marketReport.status === 'balanced') return { stroke: '#b45309', fill: '#fbbf24', pillBg: '#9a3412' };
    return { stroke: '#be123c', fill: '#fb7185', pillBg: '#be123c' };
  }
  if (mapLens === 'air') {
    if (hood.air >= 7.5) return { stroke: '#047857', fill: '#34d399', pillBg: '#047857' };
    if (hood.air >= 5.5) return { stroke: '#b45309', fill: '#fbbf24', pillBg: '#9a3412' };
    return { stroke: '#be123c', fill: '#fb7185', pillBg: '#be123c' };
  }
  if (mapLens === 'traffic') {
    const ts = hood.trafficInfo?.trafficScore ?? 6.5;
    if (ts >= 7.2) return { stroke: '#047857', fill: '#34d399', pillBg: '#047857' };
    if (ts >= 6.0) return { stroke: '#b45309', fill: '#fbbf24', pillBg: '#9a3412' };
    return { stroke: '#be123c', fill: '#fb7185', pillBg: '#be123c' };
  }
  if (hood.status === 'green') return { stroke: '#047857', fill: '#34d399', pillBg: '#047857' };
  if (hood.status === 'yellow') return { stroke: '#b45309', fill: '#fbbf24', pillBg: '#9a3412' };
  return { stroke: '#be123c', fill: '#fb7185', pillBg: '#be123c' };
}

export function buildMarkerPriceLabels(
  hood: EvaluatedNeighborhood,
  mapLens: 'budget' | 'bubble' | 'air' | 'traffic' | 'heatmap',
  mode: 'rent' | 'buy',
  scaledRahnPill: number,
  areaUnit: AreaUnit,
  intlCurrency: IntlCurrencyCode,
  locale: RadarLocale
): { shortPriceLabel: string; fullPriceLabel: string } {
  const isEn = locale === 'en';
  const fmt = (n: number) => (isEn ? String(n) : toPersianNum(n));
  if (mapLens === 'bubble') {
    const lbl = hood.marketReport.status === 'undervalued' ? (isEn ? 'Value' : 'جامانده') : hood.marketReport.status === 'balanced' ? (isEn ? 'Fair' : 'متعادل') : (isEn ? 'High' : 'حباب بالا');
    return { shortPriceLabel: lbl, fullPriceLabel: lbl };
  }
  if (mapLens === 'air') {
    const lbl = isEn ? `Air ${hood.air}/10` : `هوا ${toPersianNum(hood.air)}/۱۰`;
    return { shortPriceLabel: lbl, fullPriceLabel: lbl };
  }
  if (mapLens === 'traffic') {
    const ts = hood.trafficInfo?.trafficScore ?? 6.5;
    const lbl = isEn ? `Traffic ${ts}/10` : `ترافیک ${toPersianNum(ts)}/۱۰`;
    return { shortPriceLabel: lbl, fullPriceLabel: lbl };
  }
  const unitBuy = convertPricePerSqmToUnit(hood.buyPerSqm, areaUnit);
  const unitLabel = formatAreaUnitLabel(areaUnit, locale);
  const fxTag = intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(mode === 'rent' ? scaledRahnPill : unitBuy, intlCurrency, locale)})` : '';
  if (mode === 'rent') {
    return {
      shortPriceLabel: intlCurrency !== 'IRT' ? formatMillionTomanAsIntlCurrency(scaledRahnPill, intlCurrency, locale) : isEn ? `${scaledRahnPill}M` : `${fmt(scaledRahnPill)}م`,
      fullPriceLabel: isEn ? `${scaledRahnPill}M Rent${fxTag}` : `${fmt(scaledRahnPill)}م رهن${fxTag}`,
    };
  }
  const shortPriceLabel = intlCurrency !== 'IRT'
    ? formatMillionTomanAsIntlCurrency(unitBuy, intlCurrency, locale)
    : areaUnit === 'sqft' ? `${fmt(unitBuy)}/ft²` : `${fmt(unitBuy)}${isEn ? 'M' : 'م'}`;
  const fullPriceLabel = `${unitLabel} ${fmt(unitBuy)}${isEn ? 'M' : 'م'}${fxTag}`;
  return { shortPriceLabel, fullPriceLabel };
}

export function updateNeighborhoodMarkerPresentation(params: {
  L: any;
  refs: NeighborhoodReconcilerRefs;
  selectedHoodId: number;
  currentZoom: number;
  activeCity: CityId;
  mode: 'rent' | 'buy';
  targetSqm: number;
  rentAgeMultiplier: number;
  mapLens: 'budget' | 'bubble' | 'air' | 'traffic' | 'heatmap';
  isDarkMap: boolean;
  enableSponsorBilling: boolean;
  d3PriceScale?: D3PriceDensityScaleResult;
  areaUnit: AreaUnit;
  intlCurrency: IntlCurrencyCode;
  locale: RadarLocale;
}): void {
  const {
    L, refs, selectedHoodId, currentZoom, activeCity, mode, targetSqm,
    rentAgeMultiplier, mapLens, isDarkMap, enableSponsorBilling, d3PriceScale, areaUnit, intlCurrency, locale,
  } = params;
  const safeSqmPill = Math.max(25, targetSqm || 75);
  const themeKey = `${isDarkMap ? 1 : 0}|${locale}`;

  profileLayerReconciliation('polygons', 'presentationUpdate', () => {
    let updated = 0, retained = 0;
    refs.polygonsByHood.forEach((entry, id) => {
      const isSelected = id === selectedHoodId;
      const { stroke, fill } = getLensPalette(entry.hood, mapLens, d3PriceScale);
      const nextStyleKey = `${activeCity}|${stroke}|${fill}|${currentZoom}|${isSelected ? 1 : 0}`;
      entry.stroke = stroke;
      entry.fill = fill;
      if (entry.styleKey !== nextStyleKey) {
        entry.layer?.setStyle?.(getZoomAdaptivePolygonStyle(currentZoom, isSelected, stroke, fill));
        entry.styleKey = nextStyleKey;
        updated++;
      } else retained++;
      if (isSelected) entry.layer?.bringToFront?.();
    });
    return { created: 0, updated, removed: 0, retained };
  });

  profileLayerReconciliation('markers', 'presentationUpdate', () => {
    let updated = 0, retained = 0;
    refs.markersByHood.forEach((entry, id) => {
      const hood = entry.hood;
      const isSelected = id === selectedHoodId;
      const hasSponsor = isFeaturedMapSponsor(hood.sponsor, enableSponsorBilling);
      const palette = getLensPalette(hood, mapLens, d3PriceScale);
      const scaledRahnPill = Math.round(hood.rahn80m * (safeSqmPill / 80) * rentAgeMultiplier);
      const { shortPriceLabel, fullPriceLabel } = buildMarkerPriceLabels(hood, mapLens, mode, scaledRahnPill, areaUnit, intlCurrency, locale);
      const nextIconKey = `${activeCity}|${id}|${hood.lat}|${hood.lng}|${currentZoom}|${entry.lodTier}|${isSelected ? 1 : 0}|${hasSponsor ? 1 : 0}|${themeKey}|${palette.pillBg}|${shortPriceLabel}|${fullPriceLabel}`;
      const nextTooltipKey = `${id}|${activeCity}|${mode}|${safeSqmPill}|${scaledRahnPill}|${themeKey}|${areaUnit}|${intlCurrency}|${hood.buyPerSqm}|${hood.bargains?.length ?? 0}`;
      const baseZ = isSelected ? 1000 : hasSponsor ? 250 : 0;
      let changed = false;
      entry.stroke = palette.stroke;
      entry.fill = palette.fill;
      entry.pillBg = palette.pillBg;
      entry.hasSponsor = hasSponsor;
      entry.lastThemeKey = themeKey;
      entry.baseZIndex = baseZ;
      if (entry.lastIconKey !== nextIconKey) {
        const cfg = buildNeighborhoodLodDivIconConfig({ hood, tier: entry.lodTier, zoom: currentZoom, isSelected, hasSponsor, isDarkMap, pillBg: palette.pillBg, stroke: palette.stroke, shortPriceLabel, fullPriceLabel });
        entry.marker?.setIcon?.(L.divIcon({ className: 'leaflet-div-icon custom-hood-pill price-pill-icon', html: cfg.html, iconSize: cfg.iconSize, iconAnchor: cfg.iconAnchor }));
        entry.marker?.setZIndexOffset?.(baseZ);
        entry.lastIconKey = nextIconKey;
        changed = true;
      }
      if (entry.lastTooltipKey !== nextTooltipKey) {
        entry.marker?.setTooltipContent?.(buildNeighborhoodRichTooltipHtml({ hood, activeCity, mode, safeSqmPill, scaledRahnPill, isDarkMap }));
        entry.lastTooltipKey = nextTooltipKey;
        changed = true;
      }
      if (changed) updated++;
      else retained++;
    });
    return { created: 0, updated, removed: 0, retained };
  });
}

export function reconcileGoldPinsLayer(params: {
  L: any; map: any; refs: NeighborhoodReconcilerRefs; visibleHoods: EvaluatedNeighborhood[];
  currentZoom: number; secondaryPinsMinZoom: number; showGoldPins: boolean; isDarkMap: boolean;
  activeCity?: CityId;
  onOpenBargains: (hoodId: number) => void; reason?: string;
}): void {
  const { L, map, refs, visibleHoods, currentZoom, secondaryPinsMinZoom, showGoldPins, isDarkMap, activeCity = 'tehran', onOpenBargains, reason = 'goldPins' } = params;
  profileLayerReconciliation('gold-pins', reason, () => {
    let created = 0, updated = 0, removed = 0, retained = 0;
    const goldTargets = new Map<number, { hood: EvaluatedNeighborhood; signature: string }>();
    if (showGoldPins && currentZoom >= secondaryPinsMinZoom) {
      for (const hood of visibleHoods) {
        if (!refs.markersByHood.has(hood.id)) continue;
        const bargain = Array.isArray(hood.bargains) ? hood.bargains.find((row) => isLiveDivarBargainId(row.id)) : undefined;
        if (!bargain) continue;
        goldTargets.set(hood.id, { hood, signature: `${activeCity}|${hood.id}|${hood.lat}|${hood.lng}|${isDarkMap ? 1 : 0}|${bargain.id}|${bargain.discountPercent}|${bargain.priceText}` });
      }
    }
    for (const [id, entry] of refs.goldPinsByHood.entries()) {
      if (!goldTargets.has(id) || (entry.cityId && entry.cityId !== activeCity)) {
        map.removeLayer(entry.pin);
        refs.goldPinsByHood.delete(id);
        removed++;
      }
    }
    for (const [id, target] of goldTargets.entries()) {
      const existing = refs.goldPinsByHood.get(id);
      if (existing && existing.cityId === activeCity && existing.signature === target.signature) { retained++; continue; }
      if (existing) map.removeLayer(existing.pin);
      const pin = renderGoldBargainPinOnLeaflet({ L, map, hood: target.hood, isDarkMap, onClickBargain: onOpenBargains });
      if (pin) {
        refs.goldPinsByHood.set(id, { pin, signature: target.signature, cityId: activeCity, scopedKey: formatNeighborhoodLayerKey(activeCity, id) });
        if (existing) updated++; else created++;
      }
    }
    return { created, updated, removed, retained };
  });
}

export function ensureSelectedMarkerExists(params: {
  L: any; map: any; refs: NeighborhoodReconcilerRefs; selectedHood: EvaluatedNeighborhood | undefined; allCityHoods: EvaluatedNeighborhood[];
  currentZoom: number; activeCity: CityId; mode: 'rent' | 'buy'; targetSqm: number; rentAgeMultiplier: number;
  mapLens: 'budget' | 'bubble' | 'air' | 'traffic' | 'heatmap'; isDarkMap: boolean; lowBandwidthMode: boolean; enableSponsorBilling: boolean;
  osmBoundariesByHood: Record<number, AuthoritativeBoundaryRecord>; d3PriceScale?: D3PriceDensityScaleResult;
  areaUnit: AreaUnit; intlCurrency: IntlCurrencyCode; locale: RadarLocale; onSelectNeighborhood: (hood: EvaluatedNeighborhood) => void;
}): void {
  const { L, map, refs, selectedHood, allCityHoods, currentZoom, activeCity, mode, targetSqm, rentAgeMultiplier, mapLens, isDarkMap, lowBandwidthMode, enableSponsorBilling, osmBoundariesByHood, d3PriceScale, areaUnit, intlCurrency, locale, onSelectNeighborhood } = params;
  if (!map || !L || !selectedHood) return;
  const existingMarker = refs.markersByHood.get(selectedHood.id);
  if (existingMarker && (!existingMarker.cityId || existingMarker.cityId === activeCity)) return;
  if (existingMarker) {
    map.removeLayer(existingMarker.marker);
    refs.markersByHood.delete(selectedHood.id);
  }
  const palette = getLensPalette(selectedHood, mapLens, d3PriceScale);
  const safeSqmPill = Math.max(25, targetSqm || 75);
  const scaledRahnPill = Math.round(selectedHood.rahn80m * (safeSqmPill / 80) * rentAgeMultiplier);
  const hasSponsor = isFeaturedMapSponsor(selectedHood.sponsor, enableSponsorBilling);
  const tier: MarkerVisualTier = currentZoom >= 14 ? 'detailed_pill' : 'standard_pill';
  const { shortPriceLabel, fullPriceLabel } = buildMarkerPriceLabels(selectedHood, mapLens, mode, scaledRahnPill, areaUnit, intlCurrency, locale);
  const themeKey = `${isDarkMap ? 1 : 0}|${locale}`;
  const existingPoly = refs.polygonsByHood.get(selectedHood.id);
  if (existingPoly && existingPoly.cityId && existingPoly.cityId !== activeCity) {
    map.removeLayer(existingPoly.layer);
    refs.polygonsByHood.delete(selectedHood.id);
  }
  if (!refs.polygonsByHood.has(selectedHood.id)) {
    const style = getZoomAdaptivePolygonStyle(currentZoom, true, palette.stroke, palette.fill);
    const { geometryKey, geoJsonFeature, coords } = resolveNeighborhoodGeoJsonForLod(selectedHood, allCityHoods, osmBoundariesByHood[selectedHood.id]?.coordinates, { zoom: currentZoom, isSelected: true, lowBandwidthMode, cityId: activeCity });
    const layer = typeof L.geoJSON === 'function' ? L.geoJSON(geoJsonFeature, { style: () => style }).addTo(map) : L.polygon(coords, style).addTo(map);
    const pEntry: PolygonLayerEntry = { layer, geometryKey, styleKey: `${activeCity}|${palette.stroke}|${palette.fill}|${currentZoom}|1`, stroke: palette.stroke, fill: palette.fill, hood: selectedHood, cityId: activeCity, scopedKey: formatNeighborhoodLayerKey(activeCity, selectedHood.id) };
    layer.on?.('click', () => onSelectNeighborhood(pEntry.hood));
    layer.bringToFront?.();
    refs.polygonsByHood.set(selectedHood.id, pEntry);
  }
  const cfg = buildNeighborhoodLodDivIconConfig({ hood: selectedHood, tier, zoom: currentZoom, isSelected: true, hasSponsor, isDarkMap, pillBg: palette.pillBg, stroke: palette.stroke, shortPriceLabel, fullPriceLabel });
  const marker = L.marker([selectedHood.lat, selectedHood.lng], { icon: L.divIcon({ className: 'leaflet-div-icon custom-hood-pill price-pill-icon', html: cfg.html, iconSize: cfg.iconSize, iconAnchor: cfg.iconAnchor }), zIndexOffset: 1000 }).addTo(map);
  marker.bindTooltip?.(buildNeighborhoodRichTooltipHtml({ hood: selectedHood, activeCity, mode, safeSqmPill, scaledRahnPill, isDarkMap }), { direction: 'top', interactive: true, offset: [0, -10] });
  const mEntry: NeighborhoodMarkerEntry = {
    marker, lat: selectedHood.lat, lng: selectedHood.lng, lodTier: tier, pillBg: palette.pillBg, hasSponsor, stroke: palette.stroke, fill: palette.fill, hood: selectedHood,
    cityId: activeCity, scopedKey: formatNeighborhoodLayerKey(activeCity, selectedHood.id), baseZIndex: 1000,
    lastThemeKey: themeKey, lastIconKey: `${activeCity}|${selectedHood.id}|${selectedHood.lat}|${selectedHood.lng}|${currentZoom}|${tier}|1|${hasSponsor ? 1 : 0}|${themeKey}|${palette.pillBg}|${shortPriceLabel}|${fullPriceLabel}`,
    lastTooltipKey: `${selectedHood.id}|${activeCity}|${mode}|${safeSqmPill}|${scaledRahnPill}|${themeKey}|${areaUnit}|${intlCurrency}|${selectedHood.buyPerSqm}|${selectedHood.bargains?.length ?? 0}`,
  };
  marker.on?.('click', () => onSelectNeighborhood(mEntry.hood));
  marker.on?.('mouseover', () => marker.setZIndexOffset?.(2500));
  marker.on?.('mouseout', () => marker.setZIndexOffset?.(mEntry.baseZIndex ?? 1000));
  refs.markersByHood.set(selectedHood.id, mEntry);
}
