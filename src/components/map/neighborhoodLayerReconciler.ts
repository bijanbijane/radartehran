import { EvaluatedNeighborhood, isFeaturedMapSponsor } from '../../data/neighborhoods';
import { CityId } from '../../data/multiCityData';
import type { AreaUnit, IntlCurrencyCode, RadarLocale } from '../../utils/areaUnit';
import { AuthoritativeBoundaryRecord, getZoomAdaptivePolygonStyle, resolveNeighborhoodGeoJsonForLod } from '../../utils/neighborhoodBoundaries';
import { buildNeighborhoodLodDivIconConfig, buildNeighborhoodRichTooltipHtml, computeDeclutteredMarkerTiers } from '../mapZoomLodAndDeclutter';
import type { D3PriceDensityScaleResult } from '../priceHeatmapAndViewportLazy';
import { profileLayerReconciliation } from './mapRenderProfiler';
import {
  buildMarkerPriceLabels,
  ensureSelectedMarkerExists,
  formatNeighborhoodLayerKey,
  getLensPalette,
  reconcileGoldPinsLayer,
  updateNeighborhoodMarkerPresentation,
  type GoldPinLayerEntry,
  type MarkerLayerEntry,
  type NeighborhoodMarkerEntry,
  type NeighborhoodReconcilerRefs,
  type PolygonLayerEntry,
} from './neighborhoodPresentationUpdater';

import { MULTI_CITY_CONFIGS } from '../../data/multiCityData';
import { resolveGeoLazyLoadingPolicy } from '../../utils/geojsonViewportLazyEngine';
import { isNeighborhoodInLeafletViewport } from '../priceHeatmapAndViewportLazy';

export type { PolygonLayerEntry, NeighborhoodMarkerEntry, MarkerLayerEntry, GoldPinLayerEntry, NeighborhoodReconcilerRefs };
export { getLensPalette, buildMarkerPriceLabels, updateNeighborhoodMarkerPresentation, reconcileGoldPinsLayer, ensureSelectedMarkerExists, formatNeighborhoodLayerKey };

export function selectVisibleMapNeighborhoods(params: {
  map: any; allNeighborhoods: EvaluatedNeighborhood[]; activeCity: CityId; activeCityHoodIds: Set<number>;
  selectedHoodId: number; selectedHood: EvaluatedNeighborhood | undefined; currentZoom: number;
  statusFilter: 'all' | 'green' | 'yellow' | 'red'; lowBandwidthMode: boolean;
}) {
  const { map, allNeighborhoods, activeCity, activeCityHoodIds, selectedHoodId, selectedHood, currentZoom, statusFilter, lowBandwidthMode } = params;
  const cityScopedHoods = allNeighborhoods.filter((h) => activeCityHoodIds.has(h.id));
  const renderHoods = activeCityHoodIds.size > 0 ? cityScopedHoods : allNeighborhoods;
  const lazyPolicy = resolveGeoLazyLoadingPolicy(currentZoom, lowBandwidthMode);
  const cityCfg = MULTI_CITY_CONFIGS[activeCity] || MULTI_CITY_CONFIGS.tehran;
  const refLat = selectedHood?.lat ?? cityCfg.center[0], refLng = selectedHood?.lng ?? cityCfg.center[1];
  const hasUsableViewport = Boolean(map && typeof map.getBounds === 'function');
  const visibleHoods = [...renderHoods]
    .sort((a, b) => (a.id === selectedHoodId ? -1 : b.id === selectedHoodId ? 1 : a.id - b.id))
    .filter((hood) => {
      if (statusFilter !== 'all' && hood.status !== statusFilter) return false;
      if (hood.id === selectedHoodId) return true;
      if (hasUsableViewport) {
        return isNeighborhoodInLeafletViewport(map, hood.lat, hood.lng, Math.max(0.6, lazyPolicy.viewportPadRatio));
      }
      return Math.abs(hood.lat - refLat) <= 0.55 && Math.abs(hood.lng - refLng) <= 0.65;
    });
  return { cityScopedHoods, renderHoods, visibleHoods, lazyPolicy, currentZoom, currentSelectedId: selectedHoodId };
}

export function createEmptyReconcilerRefs(): NeighborhoodReconcilerRefs {
  return { polygonsByHood: new Map(), markersByHood: new Map(), goldPinsByHood: new Map() };
}

export function clearNeighborhoodReconcilerLayers(map: any, refs: NeighborhoodReconcilerRefs): void {
  refs.polygonsByHood.forEach((entry) => { try { map?.removeLayer?.(entry.layer); } catch { /* ignore */ } });
  refs.polygonsByHood.clear();
  refs.markersByHood.forEach((entry) => { try { map?.removeLayer?.(entry.marker); } catch { /* ignore */ } });
  refs.markersByHood.clear();
  refs.goldPinsByHood.forEach((entry) => { try { map?.removeLayer?.(entry.pin); } catch { /* ignore */ } });
  refs.goldPinsByHood.clear();
}

export interface ReconcileNeighborhoodLayersParams {
  L: any; map: any; refs: NeighborhoodReconcilerRefs;
  visibleHoods: EvaluatedNeighborhood[]; allCityHoods: EvaluatedNeighborhood[];
  selectedHoodId: number; currentZoom: number; activeCity: CityId;
  mode: 'rent' | 'buy'; targetSqm: number; rentAgeMultiplier: number;
  mapLens: 'budget' | 'bubble' | 'air' | 'traffic' | 'heatmap'; isDarkMap: boolean;
  showGoldPins?: boolean; secondaryPinsMinZoom?: number; skipGoldPins?: boolean;
  lowBandwidthMode: boolean; enableSponsorBilling: boolean;
  osmBoundariesByHood: Record<number, AuthoritativeBoundaryRecord>;
  d3PriceScale?: D3PriceDensityScaleResult;
  areaUnit: AreaUnit; intlCurrency: IntlCurrencyCode; locale: RadarLocale;
  reason?: string;
  onSelectNeighborhood: (hood: EvaluatedNeighborhood) => void;
  onOpenBargains?: (hoodId: number) => void;
}

export function reconcileNeighborhoodLayers(params: ReconcileNeighborhoodLayersParams): void {
  const {
    L, map, refs, visibleHoods, allCityHoods, selectedHoodId, currentZoom, activeCity, mode, targetSqm,
    rentAgeMultiplier, mapLens, isDarkMap, showGoldPins = false, secondaryPinsMinZoom = 12, skipGoldPins = false,
    lowBandwidthMode, enableSponsorBilling, osmBoundariesByHood, d3PriceScale, areaUnit, intlCurrency, locale,
    reason = 'reconcile', onSelectNeighborhood, onOpenBargains,
  } = params;

  const visibleIds = new Set(visibleHoods.map((h) => h.id));
  const safeSqmPill = Math.max(25, targetSqm || 75);
  const themeKey = `${isDarkMap ? 1 : 0}|${locale}`;
  const paletteById = new Map<number, { stroke: string; fill: string; pillBg: string }>();
  visibleHoods.forEach((h) => paletteById.set(h.id, getLensPalette(h, mapLens, d3PriceScale)));

  profileLayerReconciliation('polygons', reason, () => {
    let created = 0, updated = 0, removed = 0, retained = 0;
    for (const [id, entry] of refs.polygonsByHood.entries()) {
      if (!visibleIds.has(id) || (entry.cityId && entry.cityId !== activeCity)) {
        map.removeLayer(entry.layer);
        refs.polygonsByHood.delete(id);
        removed++;
      }
    }
    for (const hood of visibleHoods) {
      const isSelected = hood.id === selectedHoodId;
      const { stroke, fill } = paletteById.get(hood.id)!;
      const style = getZoomAdaptivePolygonStyle(currentZoom, isSelected, stroke, fill);
      const styleKey = `${activeCity}|${stroke}|${fill}|${currentZoom}|${isSelected ? 1 : 0}`;
      const { geometryKey, geoJsonFeature, coords } = resolveNeighborhoodGeoJsonForLod(
        hood, allCityHoods, osmBoundariesByHood[hood.id]?.coordinates, { zoom: currentZoom, isSelected, lowBandwidthMode, cityId: activeCity }
      );
      const existing = refs.polygonsByHood.get(hood.id);
      if (existing) {
        existing.hood = hood; existing.stroke = stroke; existing.fill = fill;
        existing.cityId = activeCity; existing.scopedKey = formatNeighborhoodLayerKey(activeCity, hood.id);
        if (existing.geometryKey !== geometryKey) {
          if (typeof existing.layer?.clearLayers === 'function' && typeof existing.layer?.addData === 'function') {
            existing.layer.clearLayers(); existing.layer.addData(geoJsonFeature); existing.layer.setStyle?.(() => style);
          } else {
            map.removeLayer(existing.layer);
            const nextLayer = typeof L.geoJSON === 'function' ? L.geoJSON(geoJsonFeature, { style: () => style }).addTo(map) : L.polygon(coords, style).addTo(map);
            nextLayer.on?.('click', () => onSelectNeighborhood(existing.hood));
            existing.layer = nextLayer;
          }
          existing.geometryKey = geometryKey; existing.styleKey = styleKey; updated++;
        } else if (existing.styleKey !== styleKey) {
          existing.layer.setStyle?.(style); existing.styleKey = styleKey; updated++;
        } else retained++;
        if (isSelected) existing.layer?.bringToFront?.();
      } else {
        const layer = typeof L.geoJSON === 'function' ? L.geoJSON(geoJsonFeature, { style: () => style }).addTo(map) : L.polygon(coords, style).addTo(map);
        const entry: PolygonLayerEntry = {
          layer, geometryKey, styleKey, stroke, fill, hood,
          cityId: activeCity, scopedKey: formatNeighborhoodLayerKey(activeCity, hood.id),
        };
        layer.on?.('click', () => onSelectNeighborhood(entry.hood));
        if (isSelected) layer.bringToFront?.();
        refs.polygonsByHood.set(hood.id, entry);
        created++;
      }
    }
    return { created, updated, removed, retained };
  });

  const priceLabelsById = new Map<number, { shortPriceLabel: string; fullPriceLabel: string }>();
  for (const hood of visibleHoods) {
    const scaledRahnPill = Math.round(hood.rahn80m * (safeSqmPill / 80) * rentAgeMultiplier);
    priceLabelsById.set(hood.id, buildMarkerPriceLabels(hood, mapLens, mode, scaledRahnPill, areaUnit, intlCurrency, locale));
  }

  const declutteredTiers = computeDeclutteredMarkerTiers(
    map,
    visibleHoods,
    currentZoom,
    selectedHoodId,
    (h) => isFeaturedMapSponsor(h.sponsor, enableSponsorBilling),
    priceLabelsById
  );

  profileLayerReconciliation('markers', reason, () => {
    let created = 0, updated = 0, removed = 0, retained = 0;
    for (const [id, entry] of refs.markersByHood.entries()) {
      if (!visibleIds.has(id) || (entry.cityId && entry.cityId !== activeCity)) {
        map.removeLayer(entry.marker);
        refs.markersByHood.delete(id);
        removed++;
      }
    }
    for (const hood of visibleHoods) {
      const id = hood.id;
      const isSelected = id === selectedHoodId;
      const tier = declutteredTiers.get(id) ?? 'dot';
      const scaledRahnPill = Math.round(hood.rahn80m * (safeSqmPill / 80) * rentAgeMultiplier);
      const palette = paletteById.get(id)!;
      const { shortPriceLabel, fullPriceLabel } = priceLabelsById.get(id)!;
      const hasSponsor = isFeaturedMapSponsor(hood.sponsor, enableSponsorBilling);
      const baseZ = isSelected ? 1000 : hasSponsor ? 250 : 0;
      const lastIconKey = `${activeCity}|${id}|${hood.lat}|${hood.lng}|${currentZoom}|${tier}|${isSelected ? 1 : 0}|${hasSponsor ? 1 : 0}|${themeKey}|${palette.pillBg}|${shortPriceLabel}|${fullPriceLabel}`;
      const lastTooltipKey = `${id}|${activeCity}|${mode}|${safeSqmPill}|${scaledRahnPill}|${themeKey}|${areaUnit}|${intlCurrency}|${hood.buyPerSqm}|${hood.bargains?.length ?? 0}`;
      const existing = refs.markersByHood.get(id);
      if (existing) {
        let changed = false;
        existing.hood = hood; existing.stroke = palette.stroke; existing.fill = palette.fill;
        existing.cityId = activeCity; existing.scopedKey = formatNeighborhoodLayerKey(activeCity, id);
        existing.pillBg = palette.pillBg; existing.hasSponsor = hasSponsor; existing.lodTier = tier; existing.lastThemeKey = themeKey;
        existing.baseZIndex = baseZ;
        if (existing.lat !== hood.lat || existing.lng !== hood.lng) {
          existing.marker.setLatLng?.([hood.lat, hood.lng]); existing.lat = hood.lat; existing.lng = hood.lng; changed = true;
        }
        if (existing.lastIconKey !== lastIconKey) {
          const cfg = buildNeighborhoodLodDivIconConfig({ hood, tier, zoom: currentZoom, isSelected, hasSponsor, isDarkMap, pillBg: palette.pillBg, stroke: palette.stroke, shortPriceLabel, fullPriceLabel });
          existing.marker.setIcon?.(L.divIcon({ className: 'leaflet-div-icon custom-hood-pill price-pill-icon', html: cfg.html, iconSize: cfg.iconSize, iconAnchor: cfg.iconAnchor }));
          existing.marker.setZIndexOffset?.(baseZ);
          existing.lastIconKey = lastIconKey; changed = true;
        }
        if (existing.lastTooltipKey !== lastTooltipKey) {
          existing.marker.setTooltipContent?.(buildNeighborhoodRichTooltipHtml({ hood, activeCity, mode, safeSqmPill, scaledRahnPill, isDarkMap }));
          existing.lastTooltipKey = lastTooltipKey; changed = true;
        }
        if (changed) updated++; else retained++;
      } else {
        const cfg = buildNeighborhoodLodDivIconConfig({ hood, tier, zoom: currentZoom, isSelected, hasSponsor, isDarkMap, pillBg: palette.pillBg, stroke: palette.stroke, shortPriceLabel, fullPriceLabel });
        const marker = L.marker([hood.lat, hood.lng], { icon: L.divIcon({ className: 'leaflet-div-icon custom-hood-pill price-pill-icon', html: cfg.html, iconSize: cfg.iconSize, iconAnchor: cfg.iconAnchor }), zIndexOffset: baseZ }).addTo(map);
        marker.bindTooltip?.(buildNeighborhoodRichTooltipHtml({ hood, activeCity, mode, safeSqmPill, scaledRahnPill, isDarkMap }), { direction: 'top', interactive: true, offset: [0, -10] });
        const entry: NeighborhoodMarkerEntry = {
          marker, lat: hood.lat, lng: hood.lng, lastIconKey, lastTooltipKey, lastThemeKey: themeKey,
          lodTier: tier, pillBg: palette.pillBg, hasSponsor, stroke: palette.stroke, fill: palette.fill, hood,
          cityId: activeCity, scopedKey: formatNeighborhoodLayerKey(activeCity, id), baseZIndex: baseZ,
        };
        marker.on?.('click', () => onSelectNeighborhood(entry.hood));
        marker.on?.('mouseover', () => marker.setZIndexOffset?.(2500));
        marker.on?.('mouseout', () => marker.setZIndexOffset?.(entry.baseZIndex ?? 0));
        refs.markersByHood.set(id, entry);
        created++;
      }
    }
    return { created, updated, removed, retained };
  });

  if (!skipGoldPins && onOpenBargains) {
    reconcileGoldPinsLayer({ L, map, refs, visibleHoods, currentZoom, secondaryPinsMinZoom, showGoldPins, isDarkMap, activeCity, onOpenBargains, reason });
  }
}

export function updateSelectionPillsInPlace(params: {
  refs: NeighborhoodReconcilerRefs; selectedHoodId: number; mapZoomLevel: number; isDarkMap: boolean;
}): { missingSelected: boolean } {
  const { refs, selectedHoodId, mapZoomLevel, isDarkMap } = params;
  if (selectedHoodId && !refs.markersByHood.get(selectedHoodId)?.marker) return { missingSelected: true };
  refs.polygonsByHood.forEach((entry, hoodId) => {
    const isSelected = hoodId === selectedHoodId;
    entry.layer?.setStyle?.(getZoomAdaptivePolygonStyle(mapZoomLevel, isSelected, entry.stroke, entry.fill));
    if (isSelected) entry.layer?.bringToFront?.();
    entry.styleKey = `${entry.cityId || 'tehran'}|${entry.stroke}|${entry.fill}|${mapZoomLevel}|${isSelected ? 1 : 0}`;
  });
  refs.markersByHood.forEach((entry, hoodId) => {
    const isSelected = hoodId === selectedHoodId;
    const baseZ = isSelected ? 1000 : entry.hasSponsor ? 250 : 0;
    entry.baseZIndex = baseZ;
    entry.marker?.setZIndexOffset?.(baseZ);
    const pillSpan = (entry.marker?.getElement?.() as HTMLElement | null)?.querySelector?.('[data-hood-pill]') as HTMLElement | null;
    if (pillSpan) {
      pillSpan.style.border = isSelected
        ? (isDarkMap ? '2px solid #38bdf8' : '2px solid #0f172a')
        : entry.hasSponsor ? '1.5px solid #fbbf24' : isDarkMap ? '1px solid rgba(255,255,255,0.65)' : '1px solid rgba(255,255,255,0.35)';
      pillSpan.style.boxShadow = isSelected ? '0 0 0 3px rgba(56,189,248,0.45), 0 8px 20px rgba(0,0,0,0.45)' : '0 2px 8px rgba(0,0,0,0.35)';
    }
  });
  return { missingSelected: false };
}
