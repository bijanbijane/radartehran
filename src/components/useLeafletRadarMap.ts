import React, { useEffect, useRef, useState } from 'react'; import { EvaluatedNeighborhood, getNeighborhoodLandmarks, isSponsorActive, LocalLandmark, MapTileServerId, toPersianNum, WorkHub, } from '../data/neighborhoods'; import { CityId, MULTI_CITY_CONFIGS } from '../data/multiCityData'; import { AuthoritativeBoundaryRecord, clientGeoJsonLruCache, fetchAuthoritativeCityBoundaries, getZoomAdaptivePolygonStyle, renderNeighborhoodGeoJSONOnLeaflet, } from '../utils/neighborhoodBoundaries'; import { planViewportBoundaryFetchBatch, resolveGeoLazyLoadingPolicy } from '../utils/geojsonViewportLazyEngine'; import { convertPricePerSqmToUnit, formatAreaUnitLabel, formatMillionTomanAsIntlCurrency } from '../utils/areaUnit'; import { buildExternalDivarUrl, escapeHtmlAttr, FeatureFlags } from '../utils/security'; import { useAreaUnit, useIntlCurrency, useRadarLocale } from './AreaUnitToggle'; import { buildD3PriceDensityScale, D3PriceDensityScaleResult, isNeighborhoodInLeafletViewport, renderPriceDensityHeatmapOnLeaflet, } from './priceHeatmapAndViewportLazy'; import { buildZoomAdaptivePillIconConfig, renderAdvancedSpatialOverlaysOnLeaflet, updateMapAdvancedOverlayState, useMapAdvancedOverlayState, } from './mapAdvancedLayers';
import { createLeafletBaseTileController, type BaseTileControllerInstance } from './mapBaseTileController'; import { buildNeighborhoodRichTooltipHtml, renderGoldBargainPinOnLeaflet } from './mapZoomLodAndDeclutter'; declare global { interface Window { L: any; } }
export interface UseLeafletRadarMapParams { activeCity: CityId; mapTileStyle: MapTileServerId; setMapTileStyle: React.Dispatch<React.SetStateAction<MapTileServerId>>; deferredMapNeighborhoods: EvaluatedNeighborhood[]; selectedHoodId: number; selectedHood: EvaluatedNeighborhood; mode: 'rent' | 'buy'; targetSqm: number; rentAgeMultiplier: number; selectedWorkHub: WorkHub; statusFilter: 'all' | 'green' | 'yellow' | 'red'; mapLens: 'budget' | 'bubble' | 'air' | 'traffic' | 'heatmap'; showGoldPins: boolean; showLandmarkPins: boolean; hoodLandmarks: LocalLandmark[]; featureFlags: FeatureFlags; onSelectNeighborhood: (hood: EvaluatedNeighborhood) => void; onOpenModalQuick: (hoodId: number, action: 'anatomy' | 'hedonic' | 'bargains' | 'compare' | 'share') => void; }
function getLensPalette( hood: EvaluatedNeighborhood, mapLens: 'budget' | 'bubble' | 'air' | 'traffic' | 'heatmap', d3PriceScale?: D3PriceDensityScaleResult
) { if (mapLens === 'heatmap' && d3PriceScale) { const s = d3PriceScale.getStyleForNeighborhood(hood); return { stroke: s.strokeColor, fill: s.fillColor, pillBg: s.pillBgColor }; } if (mapLens === 'bubble') { if (hood.marketReport.status === 'undervalued') return { stroke: '#10b981', fill: '#34d399', pillBg: '#059669' }; if (hood.marketReport.status === 'balanced') return { stroke: '#f59e0b', fill: '#fbbf24', pillBg: '#d97706' }; return { stroke: '#f43f5e', fill: '#fb7185', pillBg: '#e11d48' }; }
  if (mapLens === 'air') { if (hood.air >= 7.5) return { stroke: '#10b981', fill: '#34d399', pillBg: '#059669' }; if (hood.air >= 5.5) return { stroke: '#f59e0b', fill: '#fbbf24', pillBg: '#d97706' }; return { stroke: '#f43f5e', fill: '#fb7185', pillBg: '#e11d48' };
  } if (mapLens === 'traffic') { const ts = hood.trafficInfo?.trafficScore ?? 6.5; if (ts >= 7.2) return { stroke: '#10b981', fill: '#34d399', pillBg: '#059669' }; if (ts >= 6.0) return { stroke: '#f59e0b', fill: '#fbbf24', pillBg: '#d97706' }; return { stroke: '#f43f5e', fill: '#fb7185', pillBg: '#e11d48' }; }
  if (hood.status === 'green') return { stroke: '#10b981', fill: '#34d399', pillBg: '#059669' }; if (hood.status === 'yellow') return { stroke: '#f59e0b', fill: '#fbbf24', pillBg: '#d97706' }; return { stroke: '#f43f5e', fill: '#fb7185', pillBg: '#e11d48' }; }
export function useLeafletRadarMap(params: UseLeafletRadarMapParams) { const { activeCity, mapTileStyle, setMapTileStyle, deferredMapNeighborhoods, selectedHoodId, selectedHood, mode, targetSqm, rentAgeMultiplier,
    selectedWorkHub, statusFilter, mapLens, showGoldPins, showLandmarkPins, hoodLandmarks, featureFlags, onSelectNeighborhood, onOpenModalQuick, } = params; const [areaUnit] = useAreaUnit(); const [intlCurrency] = useIntlCurrency(); const [locale] = useRadarLocale(); const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null); const tileLayerRef = useRef<BaseTileControllerInstance | null>(null); const heatmapLayerRef = useRef<any>(null); const markersMapRef = useRef<Record<number, { circle: any; marker: any; stroke: string; fill: string; pillBg: string; hasSponsor: boolean }>>({});
  const workLineRef = useRef<any>(null); const workMarkerRef = useRef<any>(null); const goldPinsRef = useRef<any[]>([]); const landmarkPinsRef = useRef<any[]>([]); const [mapZoomLevel, setMapZoomLevel] = useState<number>(12); const [viewportEpoch, setViewportEpoch] = useState<number>(0);
  const [isMapIntersectingViewport, setIsMapIntersectingViewport] = useState<boolean>(true); const [osmBoundariesByHood, setOsmBoundariesByHood] = useState<Record<number, AuthoritativeBoundaryRecord>>({}); const onSelectNeighborhoodRef = useRef(onSelectNeighborhood); onSelectNeighborhoodRef.current = onSelectNeighborhood;
  const onOpenModalQuickRef = useRef(onOpenModalQuick); onOpenModalQuickRef.current = onOpenModalQuick;
  const neighborhoodsRef = useRef(deferredMapNeighborhoods); neighborhoodsRef.current = deferredMapNeighborhoods;
  const selectedHoodIdRef = useRef(selectedHoodId); selectedHoodIdRef.current = selectedHoodId;
  const mapZoomLevelRef = useRef(mapZoomLevel);
  mapZoomLevelRef.current = mapZoomLevel;
  useEffect(() => {
    const el = mapContainerRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return undefined;
    const obs = new IntersectionObserver((entries) => {
      if (entries[0]) setIsMapIntersectingViewport(entries[0].isIntersecting);
    }, { threshold: 0.01 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  const advancedOverlayState = useMapAdvancedOverlayState();
  const advancedOverlaysGroupRef = useRef<any>(null);
  useEffect(() => {
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let removeDocClickListener: (() => void) | null = null;
    const handlePageShow = () => { mapInstanceRef.current?.invalidateSize?.(); };
    window.addEventListener('pageshow', handlePageShow);
    const initMap = () => {
      if (!window.L || !mapContainerRef.current || mapInstanceRef.current) return;
      const L = window.L;
      const map = L.map(mapContainerRef.current, { center: [35.735, 51.395], zoom: 12, zoomControl: false, preferCanvas: true, maxBoundsViscosity: 0.8 });
      tileLayerRef.current = createLeafletBaseTileController({
        map, L, initialPreferredStyle: mapTileStyle,
        onSelectPreferredStyle: (next: MapTileServerId) => setMapTileStyle(next),
      });
      L.control.zoom({ position: 'bottomleft' }).addTo(map);
      if (typeof L.control.scale === 'function') L.control.scale({ metric: true, imperial: false, position: 'bottomleft' }).addTo(map);
      mapInstanceRef.current = map;
      const syncViewportBoundsToStore = () => {
        try {
          const b = map.getBounds?.();
          const z = map.getZoom?.() || 12;
          if (b && typeof b.getNorth === 'function') {
            updateMapAdvancedOverlayState({
              viewportBounds: {
                north: b.getNorth(), south: b.getSouth(),
                east: b.getEast(), west: b.getWest(), zoom: z,
              },
            });
          }
        } catch { /* ignore */ }
      };
      setMapZoomLevel(map.getZoom() || 12);
      syncViewportBoundsToStore();
      let moveDebounce: ReturnType<typeof setTimeout> | null = null;
      const onDebouncedMoveOrResize = () => {
        if (moveDebounce) clearTimeout(moveDebounce);
        moveDebounce = setTimeout(() => { setViewportEpoch((c) => c + 1); syncViewportBoundsToStore(); tileLayerRef.current?.updateAttributionForViewport(); }, 80);
      };
      map.on('zoomend', () => {
        const nextZoom = map.getZoom() || 12;
        setMapZoomLevel((prev) => (prev === nextZoom ? prev : nextZoom));
        onDebouncedMoveOrResize();
      });
      map.on('moveend', onDebouncedMoveOrResize);
      map.on('resize', onDebouncedMoveOrResize);
      const handleMapActionClick = (e: MouseEvent) => {
        const target = (e.target as HTMLElement | null)?.closest?.('[data-hood-action], [data-tooltip-action]') as HTMLElement | null;
        if (!target) return;
        e.preventDefault(); e.stopPropagation();
        const hoodId = Number(target.getAttribute('data-hood-id'));
        const action = (target.getAttribute('data-hood-action') || target.getAttribute('data-tooltip-action')) as 'anatomy' | 'hedonic' | 'bargains' | 'compare' | 'share' | null;
        if (!Number.isNaN(hoodId) && action) onOpenModalQuickRef.current(hoodId, action);
      };
      document.addEventListener('click', handleMapActionClick);
      removeDocClickListener = () => { if (moveDebounce) clearTimeout(moveDebounce); document.removeEventListener('click', handleMapActionClick); };
    };
    if (window.L) initMap();
    else {
      retryTimer = setInterval(() => {
        if (window.L) { initMap(); if (retryTimer) clearInterval(retryTimer); }
      }, 150);
    }
    return () => {
      window.removeEventListener('pageshow', handlePageShow);
      if (retryTimer) clearInterval(retryTimer);
      if (removeDocClickListener) removeDocClickListener();
      tileLayerRef.current?.destroy(); tileLayerRef.current = null;
      if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null; }
    };
  }, []);
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !window.L) return;
    if (advancedOverlaysGroupRef.current) { map.removeLayer(advancedOverlaysGroupRef.current); advancedOverlaysGroupRef.current = null; }
    advancedOverlaysGroupRef.current = renderAdvancedSpatialOverlaysOnLeaflet({
      L: window.L, map, activeCity, mode, targetSqm, rentAgeMultiplier, selectedWorkHub, overlayState: advancedOverlayState,
    });
  }, [advancedOverlayState, activeCity, mode, targetSqm, rentAgeMultiplier, selectedWorkHub, areaUnit, intlCurrency, locale]);
  useEffect(() => {
    tileLayerRef.current?.syncPreferredStyle(mapTileStyle);
  }, [mapTileStyle]);
  useEffect(() => {
    let cancelled = false;
    const cityCfg = MULTI_CITY_CONFIGS[activeCity] || MULTI_CITY_CONFIGS.tehran;
    const sourceList = activeCity === 'tehran' ? neighborhoodsRef.current : (cityCfg.neighborhoods || neighborhoodsRef.current);
    if (!sourceList.length) return;
    const { batch } = planViewportBoundaryFetchBatch({
      allNeighborhoods: sourceList.map((n) => ({ id: n.id, name: n.name, lat: n.lat, lng: n.lng, radius: n.radius })),
      viewportBounds: advancedOverlayState.viewportBounds,
      loadedHoodIds: osmBoundariesByHood,
      lowBandwidthOrMobileMode: advancedOverlayState.lowBandwidthGeoLazyMode,
    });
    if (!batch.length) return;
    fetchAuthoritativeCityBoundaries(activeCity, cityCfg.nameFa, batch).then((boundaries) => {
      if (!cancelled && Object.keys(boundaries).length > 0) {
        setOsmBoundariesByHood((prev) => ({ ...prev, ...boundaries }));
      }
    });
    return () => { cancelled = true; };
  }, [activeCity, viewportEpoch, advancedOverlayState.lowBandwidthGeoLazyMode]);
  useEffect(() => {
    const map = mapInstanceRef.current;
    const L = window.L;
    if (!map || !L) return;
    Object.values(markersMapRef.current).forEach((obj: any) => {
      if (obj.circle) map.removeLayer(obj.circle);
      if (obj.marker) map.removeLayer(obj.marker);
    });
    markersMapRef.current = {};
    goldPinsRef.current.forEach((pin) => map.removeLayer(pin));
    goldPinsRef.current = [];
    if (heatmapLayerRef.current) {
      map.removeLayer(heatmapLayerRef.current);
      heatmapLayerRef.current = null;
    }
    if (!isMapIntersectingViewport) return;
    const d3PriceScale = buildD3PriceDensityScale(deferredMapNeighborhoods, mode, rentAgeMultiplier);
    if (mapLens === 'heatmap') {
      heatmapLayerRef.current = renderPriceDensityHeatmapOnLeaflet(
        L, map,
        deferredMapNeighborhoods.filter((h) => statusFilter === 'all' || h.status === statusFilter),
        d3PriceScale, mode,
        (hood) => onSelectNeighborhoodRef.current(hood)
      );
    }
    const isDarkMap =
      mapTileStyle === 'carto_dark' ||
      mapTileStyle === 'satellite' ||
      (typeof document !== 'undefined' && document.documentElement.classList.contains('apple-dark'));
    const currentZoom = mapZoomLevelRef.current;
    const currentSelectedId = selectedHoodIdRef.current;
    const lazyPolicy = resolveGeoLazyLoadingPolicy(currentZoom, advancedOverlayState.lowBandwidthGeoLazyMode);
    clientGeoJsonLruCache.setMaxEntries(lazyPolicy.maxLruCacheSize);
    deferredMapNeighborhoods.forEach((hood) => {
      if (statusFilter !== 'all' && hood.status !== statusFilter) return;
      const isSelected = hood.id === currentSelectedId;
      if (!isSelected && !isNeighborhoodInLeafletViewport(map, hood.lat, hood.lng, lazyPolicy.viewportPadRatio)) return;
      const { stroke, fill, pillBg } = getLensPalette(hood, mapLens, d3PriceScale);
      const safeSqmPill = Math.max(25, targetSqm || 75);
      const scaledRahnPill = Math.round(hood.rahn80m * (safeSqmPill / 80) * rentAgeMultiplier);
      let priceLabel = '';
      if (mapLens === 'bubble') {
        priceLabel = hood.marketReport.status === 'undervalued' ? 'جامانده 💎' : hood.marketReport.status === 'balanced' ? 'متعادل' : 'حباب بالا';
      } else if (mapLens === 'air') {
        priceLabel = `هوا ${toPersianNum(hood.air)}/۱۰`;
      } else if (mapLens === 'traffic') {
        priceLabel = `ترافیک ${toPersianNum(hood.trafficInfo?.trafficScore ?? 6.5)}/۱۰`;
      } else {
        const unitBuy = convertPricePerSqmToUnit(hood.buyPerSqm, areaUnit); const unitLabel = formatAreaUnitLabel(areaUnit);
        const fxTag = intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(mode === 'rent' ? scaledRahnPill : unitBuy, intlCurrency, locale)})` : '';
        priceLabel = mode === 'rent' ? `${toPersianNum(scaledRahnPill)}م رهن${fxTag}` : `${unitLabel} ${toPersianNum(unitBuy)}م${fxTag}`;
      }
      const polygonStyle = getZoomAdaptivePolygonStyle(currentZoom, isSelected, stroke, fill);
      const osmRecord = osmBoundariesByHood[hood.id];
      const handleHoodClick = () => onSelectNeighborhoodRef.current(hood);
      const circle = renderNeighborhoodGeoJSONOnLeaflet(
        L, map, hood, deferredMapNeighborhoods, polygonStyle, osmRecord?.coordinates, handleHoodClick,
        { zoom: currentZoom, isSelected, lowBandwidthMode: advancedOverlayState.lowBandwidthGeoLazyMode }
      );
      const hasSponsor = isSponsorActive(hood.sponsor, featureFlags.enableSponsorBilling);
      const pillConfig = buildZoomAdaptivePillIconConfig({
        hood, zoom: currentZoom, isSelected, hasSponsor, isDarkMap, pillBg, priceLabel,
      });
      const pillIcon = L.divIcon({
        className: 'custom-hood-pill price-pill-icon',
        html: pillConfig.html,
        iconSize: pillConfig.iconSize,
        iconAnchor: pillConfig.iconAnchor,
      });
      const marker = L.marker([hood.lat, hood.lng], {
        icon: pillIcon,
        zIndexOffset: isSelected ? 1000 : hasSponsor ? 250 : 0,
      }).addTo(map);
      marker.on('click', handleHoodClick);
      const richPopupHtml = buildNeighborhoodRichTooltipHtml({
        hood, activeCity, mode, safeSqmPill, scaledRahnPill, isDarkMap,
      });
      marker.bindTooltip(richPopupHtml, { direction: 'top', interactive: true, offset: [0, -10] });
      markersMapRef.current[hood.id] = { circle, marker, stroke, fill, pillBg, hasSponsor };
      if (showGoldPins && currentZoom >= lazyPolicy.secondaryPinsMinZoom && Array.isArray(hood.bargains) && hood.bargains.length > 0) {
        const gPin = renderGoldBargainPinOnLeaflet({
          L, map, hood, isDarkMap,
          onClickBargain: (hId) => onOpenModalQuickRef.current(hId, 'bargains'),
        });
        if (gPin) goldPinsRef.current.push(gPin);
      }
    });
  }, [deferredMapNeighborhoods, mode, targetSqm, rentAgeMultiplier, statusFilter, mapLens, mapTileStyle, showGoldPins, osmBoundariesByHood, activeCity, featureFlags.enableSponsorBilling, viewportEpoch, isMapIntersectingViewport, advancedOverlayState.lowBandwidthGeoLazyMode, areaUnit, intlCurrency, locale]);
  useEffect(() => {
    if (selectedHoodId && !markersMapRef.current[selectedHoodId]) {
      setViewportEpoch((c) => c + 1);
      return;
    }
    const isDarkMap =
      mapTileStyle === 'carto_dark' ||
      mapTileStyle === 'satellite' ||
      (typeof document !== 'undefined' && document.documentElement.classList.contains('apple-dark'));
    Object.entries(markersMapRef.current).forEach(([idStr, entry]) => {
      const hoodId = Number(idStr);
      const isSelected = hoodId === selectedHoodId;
      if (entry.circle && typeof entry.circle.setStyle === 'function') {
        entry.circle.setStyle(getZoomAdaptivePolygonStyle(mapZoomLevel, isSelected, entry.stroke, entry.fill));
      }
      if (typeof entry.marker?.setZIndexOffset === 'function') {
        entry.marker.setZIndexOffset(isSelected ? 1000 : entry.hasSponsor ? 250 : 0);
      }
      const el = entry.marker?.getElement?.() as HTMLElement | null;
      const pillSpan = el?.querySelector?.('[data-hood-pill]') as HTMLElement | null;
      if (pillSpan) {
        pillSpan.style.border = isSelected
          ? isDarkMap ? '2px solid #38bdf8' : '2px solid #0f172a'
          : entry.hasSponsor ? '1.5px solid #fbbf24'
          : isDarkMap ? '1px solid rgba(255,255,255,0.65)' : '1px solid rgba(255,255,255,0.35)';
        pillSpan.style.boxShadow = isSelected ? '0 0 18px rgba(16,185,129,0.9)' : '0 3px 10px rgba(0,0,0,0.45)';
      }
    });
  }, [selectedHoodId, mapZoomLevel, mapTileStyle]);
  useEffect(() => {
    const map = mapInstanceRef.current;
    const L = window.L;
    if (!map || !L) return;
    if (workLineRef.current) { map.removeLayer(workLineRef.current); workLineRef.current = null; }
    if (workMarkerRef.current) { map.removeLayer(workMarkerRef.current); workMarkerRef.current = null; }
    landmarkPinsRef.current.forEach((pin) => map.removeLayer(pin));
    landmarkPinsRef.current = [];
    if (selectedWorkHub.lat !== null && selectedWorkHub.lng !== null && selectedHood) {
      const safeHubName = escapeHtmlAttr(selectedWorkHub.name);
      const safeHoodLabel = escapeHtmlAttr(selectedHood.name);
      const hubIcon = L.divIcon({
        className: 'work-hub-pin',
        html: `<div style="transform:translate(-50%,-50%);background:#0284c7;color:#fff;padding:4px 10px;border-radius:9999px;font-family:Vazirmatn,Tahoma,sans-serif;font-size:11px;font-weight:800;white-space:nowrap;border:2px solid #fff;box-shadow:0 0 15px rgba(2,132,199,0.8);">🏢 محل کار: ${safeHubName}</div>`,
        iconSize: [0, 0],
      });
      workMarkerRef.current = L.marker([selectedWorkHub.lat, selectedWorkHub.lng], { icon: hubIcon, zIndexOffset: 900 }).addTo(map);
      workLineRef.current = L.polyline(
        [[selectedHood.lat, selectedHood.lng], [selectedWorkHub.lat, selectedWorkHub.lng]],
        { color: '#38bdf8', weight: 2.5, dashArray: '6, 6', opacity: 0.85 }
      ).addTo(map).bindTooltip(
        `<div dir="rtl" style="font-family:Vazirmatn,Tahoma,sans-serif;font-size:11px;text-align:right;">🚗 مسیر ${safeHoodLabel} تا ${safeHubName}: <strong>${toPersianNum((selectedHood.distKm || 0).toFixed(1))} کیلومتر</strong></div>`,
        { sticky: true, direction: 'top' }
      );
    }
    if (showLandmarkPins && selectedHood) {
      const landmarks = hoodLandmarks.length > 0 ? hoodLandmarks : getNeighborhoodLandmarks(selectedHood);
      landmarks.forEach((lm) => {
        const badgeColor = lm.category === 'مترو و حمل‌ونقل' ? '#0284c7' : lm.category === 'پارک و فضای سبز' ? '#059669' : lm.category === 'مرکز خرید و رفاهی' ? '#d97706' : '#e11d48';
        const emoji = lm.category === 'مترو و حمل‌ونقل' ? '🚇' : lm.category === 'پارک و فضای سبز' ? '🌳' : lm.category === 'مرکز خرید و رفاهی' ? '🛍️' : '🏥';
        const safeLmName = escapeHtmlAttr(lm.name); const safeLmCategory = escapeHtmlAttr(lm.category); const safeLmDesc = escapeHtmlAttr(lm.desc);
        const lmIcon = L.divIcon({
          className: 'hood-landmark-pin',
          html: `<div style="display:flex;justify-content:center;align-items:center;transform:translate(-50%,-50%);"><span style="white-space:nowrap;display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:9999px;font-family:Vazirmatn,Tahoma,sans-serif;font-size:10px;font-weight:800;color:#ffffff;background:${badgeColor};border:1.5px solid #ffffff;box-shadow:0 3px 10px rgba(0,0,0,0.5);">${emoji} ${safeLmName}</span></div>`,
          iconSize: [0, 0],
        });
        const lPin = L.marker([selectedHood.lat + lm.latOffset, selectedHood.lng + lm.lngOffset], { icon: lmIcon })
          .addTo(map)
          .bindTooltip(
            `<div dir="rtl" style="font-family:Vazirmatn,Tahoma,sans-serif;text-align:right;max-width:220px;"><strong>${emoji} ${safeLmName}</strong> (${safeLmCategory})<br/><span style="font-size:11px;opacity:0.85;">${safeLmDesc}</span></div>`,
            { direction: 'top' }
          );
        landmarkPinsRef.current.push(lPin); }); } }, [selectedWorkHub, selectedHood, showLandmarkPins, hoodLandmarks]); const handleFocusLandmarkOnMap = (lm: LocalLandmark) => { if (mapInstanceRef.current && selectedHood) { mapInstanceRef.current.flyTo([selectedHood.lat + lm.latOffset, selectedHood.lng + lm.lngOffset], 15, { duration: 0.7 }); } }; return { mapContainerRef, mapInstanceRef, tileLayerRef, markersMapRef, osmBoundariesByHood, handleFocusLandmarkOnMap }; }