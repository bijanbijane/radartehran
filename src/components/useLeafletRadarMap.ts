import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EvaluatedNeighborhood, LocalLandmark, MapTileServerId, WorkHub } from '../data/neighborhoods';
import { CityId, MULTI_CITY_CONFIGS } from '../data/multiCityData';
import { AuthoritativeBoundaryRecord, clientGeoJsonLruCache, fetchAuthoritativeCityBoundaries } from '../utils/neighborhoodBoundaries';
import { planViewportBoundaryFetchBatch } from '../utils/geojsonViewportLazyEngine';
import { buildExternalDivarUrl, escapeHtmlAttr, FeatureFlags } from '../utils/security'; void escapeHtmlAttr; void buildExternalDivarUrl;
import { formatMillionTomanAsIntlCurrency } from '../utils/areaUnit'; void formatMillionTomanAsIntlCurrency;
import { useAreaUnit, useIntlCurrency, useRadarLocale } from './AreaUnitToggle';
import { buildD3PriceDensityScale, renderPriceDensityHeatmapOnLeaflet } from './priceHeatmapAndViewportLazy';
import { renderCommuteIsochronesLayer, renderMetroLinesLayer, renderNeighborhoodComparisonArc, renderTrafficZonesLayer, useMapAdvancedOverlayState } from './mapAdvancedLayers';
import type { BaseTileControllerInstance } from './mapBaseTileController';
import { createExecutionTimer } from '../utils/diagnostics';
import { profileLayerReconciliation } from './map/mapRenderProfiler';
import { clearOverlayGroupRef, type MetroLineEntry, type TrafficZoneEntry } from './map/advancedOverlayReconcilers';
import { mountLeafletMapLifecycle, type MapViewportSettledEvent } from './map/leafletMapLifecycle';
import { clearNeighborhoodReconcilerLayers, createEmptyReconcilerRefs, ensureSelectedMarkerExists, reconcileGoldPinsLayer, reconcileNeighborhoodLayers, selectVisibleMapNeighborhoods, updateNeighborhoodMarkerPresentation, updateSelectionPillsInPlace } from './map/neighborhoodLayerReconciler';
import { clearWorkRouteAndLandmarkLayers, createEmptyWorkRouteAndLandmarkRefs, reconcileWorkRouteAndLandmarks } from './map/workRouteAndLandmarkLayers';
import {
  appendInteractiveSpatialPoint,
  clearInteractiveSpatialMeasureLayer,
  getInteractiveSpatialMeasureState,
  reconcileInteractiveSpatialMeasureLayer,
  useInteractiveSpatialMeasureState,
} from './map/interactiveSpatialMeasureLayer';
import { resolveCityFromCoordinates, type CityResolutionResult } from '../utils/geo/cityGeospatialResolver';

declare global { interface Window { L: any; } }

export type MapNavigationIntent = 'initial_mount' | 'explicit_city_select' | 'manual_map_pan' | 'programmatic_hood_jump' | 'history_restore';

export interface UseLeafletRadarMapParams {
  activeCity: CityId; mapTileStyle: MapTileServerId; setMapTileStyle: React.Dispatch<React.SetStateAction<MapTileServerId>>;
  deferredMapNeighborhoods: EvaluatedNeighborhood[]; selectedHoodId: number; selectedHood: EvaluatedNeighborhood;
  mode: 'rent' | 'buy'; targetSqm: number; rentAgeMultiplier: number; selectedWorkHub: WorkHub;
  statusFilter: 'all' | 'green' | 'yellow' | 'red'; mapLens: 'budget' | 'bubble' | 'air' | 'traffic' | 'heatmap';
  showGoldPins: boolean; showLandmarkPins: boolean; hoodLandmarks: LocalLandmark[]; featureFlags: FeatureFlags;
  onSelectNeighborhood: (hood: EvaluatedNeighborhood) => void;
  onOpenModalQuick: (hoodId: number, action: 'anatomy' | 'hedonic' | 'bargains' | 'compare' | 'share') => void;
  navigationIntentRef?: React.MutableRefObject<MapNavigationIntent>;
  onMapAutoSwitchCity?: (cityId: CityId, resolution: CityResolutionResult) => void;
  onGeoContextStatusChange?: (resolution: CityResolutionResult) => void;
}

const readDomDarkClass = (): boolean => typeof document !== 'undefined' && document.documentElement.classList.contains('apple-dark');
const getIsDarkMap = (mapTileStyle: MapTileServerId, domDark: boolean): boolean => mapTileStyle === 'carto_dark' || mapTileStyle === 'satellite' || domDark;

export function useLeafletRadarMap(params: UseLeafletRadarMapParams) {
  const { activeCity, mapTileStyle, setMapTileStyle, deferredMapNeighborhoods, selectedHoodId, selectedHood, mode, targetSqm, rentAgeMultiplier, selectedWorkHub, statusFilter, mapLens, showGoldPins, showLandmarkPins, hoodLandmarks, featureFlags, onSelectNeighborhood, onOpenModalQuick, navigationIntentRef, onMapAutoSwitchCity, onGeoContextStatusChange } = params;
  const [areaUnit] = useAreaUnit(), [intlCurrency] = useIntlCurrency(), [locale] = useRadarLocale();

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const tileLayerRef = useRef<BaseTileControllerInstance | null>(null);
  const heatmapLayerRef = useRef<any>(null);
  const trafficZonesLayerRef = useRef<any>(null);
  const metroLinesLayerRef = useRef<any>(null);
  const commuteIsochronesLayerRef = useRef<any>(null);
  const comparisonArcLayerRef = useRef<any>(null);
  const spatialMeasureLayerRef = useRef<any>(null);
  const trafficEntriesRef = useRef<Map<string, TrafficZoneEntry>>(new Map());
  const metroEntriesRef = useRef<Map<string, MetroLineEntry>>(new Map());
  const isochroneSigRef = useRef<string | null>(null);
  const comparisonArcSigRef = useRef<string | null>(null);
  const markersMapRef = useRef<Record<number, { circle: any; marker: any; stroke: string; fill: string; pillBg: string; hasSponsor: boolean }>>({});
  const reconcilerRefs = useRef(createEmptyReconcilerRefs());
  const workLandmarkRefs = useRef(createEmptyWorkRouteAndLandmarkRefs());
  const programmaticMoveRef = useRef<boolean>(false);
  const programmaticTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const markProgrammaticMove = useCallback((durationMs = 900) => {
    programmaticMoveRef.current = true;
    if (programmaticTimerRef.current) clearTimeout(programmaticTimerRef.current);
    programmaticTimerRef.current = setTimeout(() => {
      programmaticTimerRef.current = null;
      programmaticMoveRef.current = false;
    }, durationMs);
  }, []);

  useEffect(() => () => { if (programmaticTimerRef.current) clearTimeout(programmaticTimerRef.current); }, []);

  const [mapZoomLevel, setMapZoomLevel] = useState<number>(12);
  const [viewportEpoch, setViewportEpoch] = useState<number>(0);
  const [isDarkTheme, setIsDarkTheme] = useState<boolean>(readDomDarkClass);
  const [isMapLoaded, setIsMapLoaded] = useState<boolean>(false);
  const [isMapIntersectingViewport, setIsMapIntersectingViewport] = useState<boolean>(true);
  const [osmBoundariesByHood, setOsmBoundariesByHood] = useState<Record<number, AuthoritativeBoundaryRecord>>({});

  const isDarkMap = getIsDarkMap(mapTileStyle, isDarkTheme);
  const activeCityRef = useRef<CityId>(activeCity); activeCityRef.current = activeCity;
  const onSelectNeighborhoodRef = useRef(onSelectNeighborhood); onSelectNeighborhoodRef.current = onSelectNeighborhood;
  const onOpenModalQuickRef = useRef(onOpenModalQuick); onOpenModalQuickRef.current = onOpenModalQuick;
  const onMapAutoSwitchCityRef = useRef(onMapAutoSwitchCity); onMapAutoSwitchCityRef.current = onMapAutoSwitchCity;
  const onGeoContextStatusChangeRef = useRef(onGeoContextStatusChange); onGeoContextStatusChangeRef.current = onGeoContextStatusChange;
  const selectedHoodIdRef = useRef(selectedHoodId); selectedHoodIdRef.current = selectedHoodId;
  const selectedHoodRef = useRef(selectedHood); selectedHoodRef.current = selectedHood;
  const neighborhoodsRef = useRef(deferredMapNeighborhoods); neighborhoodsRef.current = deferredMapNeighborhoods;
  const mapZoomLevelRef = useRef(mapZoomLevel); mapZoomLevelRef.current = mapZoomLevel;
  const presentationRef = useRef({ mode, targetSqm, rentAgeMultiplier, mapLens, isDarkMap, areaUnit, intlCurrency, locale, showGoldPins });
  presentationRef.current = { mode, targetSqm, rentAgeMultiplier, mapLens, isDarkMap, areaUnit, intlCurrency, locale, showGoldPins };

  const activeCityHoodIds = useMemo(() => new Set((MULTI_CITY_CONFIGS[activeCity]?.neighborhoods || []).map((h) => h.id)), [activeCity]);
  const cityScopedMapNeighborhoods = useMemo(
    () => deferredMapNeighborhoods.filter((h) => activeCityHoodIds.has(h.id)),
    [deferredMapNeighborhoods, activeCityHoodIds],
  );
  const d3PriceScaleForCity = useMemo(
    () =>
      buildD3PriceDensityScale(
        cityScopedMapNeighborhoods.length > 0 ? cityScopedMapNeighborhoods : deferredMapNeighborhoods,
        mode,
        rentAgeMultiplier,
      ),
    [cityScopedMapNeighborhoods, deferredMapNeighborhoods, mode, rentAgeMultiplier],
  );

  useEffect(() => {
    const el = mapContainerRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return undefined;
    const obs = new IntersectionObserver((entries) => { if (entries[0]) setIsMapIntersectingViewport(entries[0].isIntersecting); }, { threshold: 0.01 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return undefined;
    const themeObs = new MutationObserver(() => setIsDarkTheme(readDomDarkClass()));
    themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-apple-theme'] });
    return () => themeObs.disconnect();
  }, []);

  const advancedOverlayState = useMapAdvancedOverlayState();
  const spatialMeasureState = useInteractiveSpatialMeasureState();
  const handleNeighborhoodLayerSelect = useCallback((hood: EvaluatedNeighborhood) => {
    const st = getInteractiveSpatialMeasureState();
    if (st.mode === 'measure' || st.mode === 'draw') {
      appendInteractiveSpatialPoint({ lat: hood.lat, lng: hood.lng });
      return;
    }
    onSelectNeighborhoodRef.current(hood);
  }, []);

  useEffect(() => {
    const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    const hasUrlHood = Boolean(urlParams && (urlParams.has('hood') || urlParams.has('compare')));
    const cityCfg = MULTI_CITY_CONFIGS[activeCity] || MULTI_CITY_CONFIGS.tehran;
    const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 1024;
    const rawCenter: [number, number] = selectedHood && (hasUrlHood || activeCityHoodIds.has(selectedHood.id)) ? [selectedHood.lat, selectedHood.lng] : cityCfg.center;
    const initCenter: [number, number] = [rawCenter[0], rawCenter[1] + (isDesktop ? 0.055 : 0)];
    const initZoom = selectedHood && hasUrlHood ? 13 : cityCfg.defaultZoom;

    return mountLeafletMapLifecycle({
      mapContainerRef, mapInstanceRef, tileLayerRef, initCenter, initZoom, initialTileStyle: mapTileStyle,
      programmaticMoveRef,
      onSelectPreferredStyle: (next) => setMapTileStyle(next),
      onMapLoaded: () => setIsMapLoaded(true),
      onZoomChange: (nextZoom) => setMapZoomLevel((prev) => (prev === nextZoom ? prev : nextZoom)),
      onViewportSettled: (evt?: MapViewportSettledEvent) => {
        setViewportEpoch((c) => c + 1);
        if (evt?.isUserPan && !evt.isZoomOnly) {
          const resolution = resolveCityFromCoordinates(evt.lat, evt.lng, { currentCityId: activeCityRef.current });
          onGeoContextStatusChangeRef.current?.(resolution);
          if (resolution.status === 'resolved' && resolution.cityId !== activeCityRef.current) {
            onMapAutoSwitchCityRef.current?.(resolution.cityId, resolution);
          }
        }
      },
      onOpenModalQuick: (hoodId, action) => onOpenModalQuickRef.current(hoodId, action),
      resolveHoodById: (hoodId) => neighborhoodsRef.current.find((h) => h.id === hoodId) || (selectedHoodRef.current?.id === hoodId ? selectedHoodRef.current : undefined),
      onTeardownLayers: (map) => {
        clearNeighborhoodReconcilerLayers(map, reconcilerRefs.current);
        clearWorkRouteAndLandmarkLayers(map, workLandmarkRefs.current);
        markersMapRef.current = {};
        if (heatmapLayerRef.current && map) { map.removeLayer?.(heatmapLayerRef.current); heatmapLayerRef.current = null; }
        clearOverlayGroupRef(map, trafficZonesLayerRef, trafficEntriesRef.current);
        clearOverlayGroupRef(map, metroLinesLayerRef, metroEntriesRef.current);
        clearOverlayGroupRef(map, commuteIsochronesLayerRef);
        clearOverlayGroupRef(map, comparisonArcLayerRef);
        clearInteractiveSpatialMeasureLayer(map, spatialMeasureLayerRef);
        isochroneSigRef.current = null;
        comparisonArcSigRef.current = null;
      },
    });
  }, []);

  const mountedCityRef = useRef(activeCity);
  useEffect(() => {
    if (mountedCityRef.current === activeCity) return;
    mountedCityRef.current = activeCity;
    if (navigationIntentRef?.current === 'manual_map_pan' || navigationIntentRef?.current === 'programmatic_hood_jump') {
      return;
    }
    const cfg = MULTI_CITY_CONFIGS[activeCity] || MULTI_CITY_CONFIGS.tehran;
    const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 1024;
    const nextCenter: [number, number] = [cfg.center[0], cfg.center[1] + (isDesktop ? 0.055 : 0)];
    markProgrammaticMove(1050);
    if (typeof mapInstanceRef.current?.flyTo === 'function') {
      mapInstanceRef.current.flyTo(nextCenter, cfg.defaultZoom, { duration: 0.85 });
    } else {
      mapInstanceRef.current?.setView?.(nextCenter, cfg.defaultZoom, { animate: true });
    }
  }, [activeCity, markProgrammaticMove, navigationIntentRef]);

  useEffect(() => {
    if (!mapInstanceRef.current || !window.L) return;
    renderTrafficZonesLayer({ L: window.L, map: mapInstanceRef.current, groupRef: trafficZonesLayerRef, entriesMap: trafficEntriesRef.current, activeCity, showTrafficZones: advancedOverlayState.showTrafficZones, viewportBounds: advancedOverlayState.viewportBounds });
  }, [advancedOverlayState.showTrafficZones, advancedOverlayState.viewportBounds, activeCity, isMapLoaded]);

  useEffect(() => {
    if (!mapInstanceRef.current || !window.L) return;
    renderMetroLinesLayer({ L: window.L, map: mapInstanceRef.current, groupRef: metroLinesLayerRef, entriesMap: metroEntriesRef.current, activeCity, showMetroLines: advancedOverlayState.showMetroLines, viewportBounds: advancedOverlayState.viewportBounds, zoom: mapZoomLevel, lowBandwidthMode: advancedOverlayState.lowBandwidthGeoLazyMode });
  }, [advancedOverlayState.showMetroLines, advancedOverlayState.viewportBounds, advancedOverlayState.lowBandwidthGeoLazyMode, activeCity, mapZoomLevel, isMapLoaded]);

  useEffect(() => {
    if (!mapInstanceRef.current || !window.L) return;
    renderCommuteIsochronesLayer({ L: window.L, map: mapInstanceRef.current, groupRef: commuteIsochronesLayerRef, sigRef: isochroneSigRef, showCommuteIsochrones: advancedOverlayState.showCommuteIsochrones, selectedWorkHub, activeCity });
  }, [advancedOverlayState.showCommuteIsochrones, selectedWorkHub, activeCity, isMapLoaded]);

  useEffect(() => {
    if (!mapInstanceRef.current || !window.L) return;
    renderNeighborhoodComparisonArc({ L: window.L, map: mapInstanceRef.current, groupRef: comparisonArcLayerRef, sigRef: comparisonArcSigRef, mode, targetSqm, rentAgeMultiplier, areaUnit, intlCurrency, locale, comparisonArc: advancedOverlayState.comparisonArc });
  }, [advancedOverlayState.comparisonArc, mode, targetSqm, rentAgeMultiplier, areaUnit, intlCurrency, locale, isMapLoaded]);

  useEffect(() => {
    if (!mapInstanceRef.current || !window.L) return;
    reconcileInteractiveSpatialMeasureLayer({ L: window.L, map: mapInstanceRef.current, groupRef: spatialMeasureLayerRef, state: spatialMeasureState, isDarkMap });
  }, [spatialMeasureState, isDarkMap, isMapLoaded]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    const container = mapContainerRef.current;
    const interactive = spatialMeasureState.mode === 'measure' || spatialMeasureState.mode === 'draw';
    if (container) container.style.cursor = interactive ? 'crosshair' : '';
    if (!map || !interactive || typeof map.on !== 'function') return () => { if (container) container.style.cursor = ''; };
    const onMapClick = (e: any) => {
      const lat = e?.latlng?.lat;
      const lng = e?.latlng?.lng;
      if (typeof lat === 'number' && typeof lng === 'number') {
        appendInteractiveSpatialPoint({ lat, lng });
      }
    };
    map.on('click', onMapClick);
    return () => {
      map.off?.('click', onMapClick);
      if (container) container.style.cursor = '';
    };
  }, [spatialMeasureState.mode, isMapLoaded]);

  useEffect(() => { tileLayerRef.current?.syncPreferredStyle(mapTileStyle); }, [mapTileStyle]);

  const prevCityRef = useRef(activeCity);
  useEffect(() => {
    let cancelled = false;
    const targetCity = activeCity;
    const cityChanged = prevCityRef.current !== targetCity;
    if (cityChanged) { prevCityRef.current = targetCity; setOsmBoundariesByHood({}); }
    const cityCfg = MULTI_CITY_CONFIGS[targetCity] || MULTI_CITY_CONFIGS.tehran;
    const sourceList = cityCfg.neighborhoods || [];
    if (!sourceList.length) return undefined;
    const vb = advancedOverlayState.viewportBounds;
    const isVbInCity = vb ? (cityCfg.center[0] <= vb.north + 0.5 && cityCfg.center[0] >= vb.south - 0.5 && cityCfg.center[1] <= vb.east + 0.5 && cityCfg.center[1] >= vb.west - 0.5) : false;
    const { batch } = planViewportBoundaryFetchBatch({
      allNeighborhoods: sourceList.map((n) => ({ id: n.id, name: n.name, lat: n.lat, lng: n.lng, radius: n.radius })),
      viewportBounds: isVbInCity ? vb : null, loadedHoodIds: cityChanged ? {} : osmBoundariesByHood, lowBandwidthOrMobileMode: advancedOverlayState.lowBandwidthGeoLazyMode,
    });
    if (!batch.length) return undefined;
    fetchAuthoritativeCityBoundaries(targetCity, cityCfg.nameFa, batch)
      .then((boundaries) => {
        if (!cancelled && activeCityRef.current === targetCity && Object.keys(boundaries).length > 0) {
          setOsmBoundariesByHood((prev) => ({ ...prev, ...boundaries }));
        }
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [activeCity, viewportEpoch, advancedOverlayState.lowBandwidthGeoLazyMode]);

  useEffect(() => {
    const map = mapInstanceRef.current, L = window.L;
    if (!map || !L) return;
    profileLayerReconciliation('heatmap', 'lensChange', () => {
      const hadPrev = Boolean(heatmapLayerRef.current);
      if (heatmapLayerRef.current) { map.removeLayer(heatmapLayerRef.current); heatmapLayerRef.current = null; }
      if (!isMapIntersectingViewport || mapLens !== 'heatmap') return { created: 0, updated: 0, removed: hadPrev ? 1 : 0, retained: 0 };
      heatmapLayerRef.current = renderPriceDensityHeatmapOnLeaflet(
        L,
        map,
        deferredMapNeighborhoods.filter((h) => statusFilter === 'all' || h.status === statusFilter),
        d3PriceScaleForCity,
        mode,
        handleNeighborhoodLayerSelect,
      );
      return { created: hadPrev ? 0 : 1, updated: hadPrev ? 1 : 0, removed: 0, retained: 0 };
    });
  }, [mapLens, isMapIntersectingViewport, deferredMapNeighborhoods, d3PriceScaleForCity, mode, statusFilter, isMapLoaded]);

  const getSlice = () => selectVisibleMapNeighborhoods({
    map: mapInstanceRef.current, allNeighborhoods: deferredMapNeighborhoods, activeCity, activeCityHoodIds,
    selectedHoodId: selectedHoodIdRef.current, selectedHood: selectedHoodRef.current,
    currentZoom: mapZoomLevelRef.current, statusFilter, lowBandwidthMode: advancedOverlayState.lowBandwidthGeoLazyMode,
  });

  useEffect(() => {
    const timer = createExecutionTimer('Map', 'renderMarkersAndLayers');
    const map = mapInstanceRef.current, L = window.L;
    if (!map || !L) { timer('fallback'); return; }
    if (!isMapIntersectingViewport) { clearNeighborhoodReconcilerLayers(map, reconcilerRefs.current); markersMapRef.current = {}; timer('fallback'); return; }
    const { cityScopedHoods, renderHoods, visibleHoods, lazyPolicy, currentZoom, currentSelectedId } = getSlice();
    const pres = presentationRef.current;
    clientGeoJsonLruCache.setMaxEntries(lazyPolicy.maxLruCacheSize);
    reconcileNeighborhoodLayers({
      L, map, refs: reconcilerRefs.current, visibleHoods, allCityHoods: renderHoods, selectedHoodId: currentSelectedId,
      currentZoom, activeCity, mode: pres.mode, targetSqm: pres.targetSqm, rentAgeMultiplier: pres.rentAgeMultiplier,
      mapLens: pres.mapLens, isDarkMap: pres.isDarkMap, skipGoldPins: true, lowBandwidthMode: advancedOverlayState.lowBandwidthGeoLazyMode,
      enableSponsorBilling: featureFlags.enableSponsorBilling, osmBoundariesByHood, d3PriceScale: d3PriceScaleForCity,
      areaUnit: pres.areaUnit, intlCurrency: pres.intlCurrency, locale: pres.locale, reason: 'reconcileGeometryAndLod',
      onSelectNeighborhood: handleNeighborhoodLayerSelect,
    });
    const nextMarkersMap: typeof markersMapRef.current = {};
    reconcilerRefs.current.polygonsByHood.forEach((polyEntry, id) => {
      const mEntry = reconcilerRefs.current.markersByHood.get(id);
      nextMarkersMap[id] = { circle: polyEntry.layer, marker: mEntry?.marker ?? null, stroke: polyEntry.stroke, fill: polyEntry.fill, pillBg: mEntry?.pillBg ?? polyEntry.stroke, hasSponsor: mEntry?.hasSponsor ?? false };
    });
    markersMapRef.current = nextMarkersMap;
    timer('success');
  }, [deferredMapNeighborhoods, mapZoomLevel, selectedHoodId, viewportEpoch, statusFilter, osmBoundariesByHood, activeCity, activeCityHoodIds, featureFlags.enableSponsorBilling, isMapIntersectingViewport, advancedOverlayState.lowBandwidthGeoLazyMode, isMapLoaded, d3PriceScaleForCity]);

  useEffect(() => {
    const map = mapInstanceRef.current, L = window.L;
    if (!map || !L || !isMapIntersectingViewport) return;
    updateNeighborhoodMarkerPresentation({
      L, refs: reconcilerRefs.current, selectedHoodId: selectedHoodIdRef.current, currentZoom: mapZoomLevelRef.current,
      activeCity, mode, targetSqm, rentAgeMultiplier, mapLens, isDarkMap,
      enableSponsorBilling: featureFlags.enableSponsorBilling, d3PriceScale: d3PriceScaleForCity, areaUnit, intlCurrency, locale,
    });
  }, [mode, targetSqm, rentAgeMultiplier, mapLens, mapTileStyle, isDarkTheme, areaUnit, intlCurrency, locale, d3PriceScaleForCity]);

  useEffect(() => {
    const map = mapInstanceRef.current, L = window.L;
    if (!map || !L || !isMapIntersectingViewport) return;
    const { visibleHoods, lazyPolicy, currentZoom } = getSlice();
    reconcileGoldPinsLayer({
      L, map, refs: reconcilerRefs.current, visibleHoods, currentZoom, secondaryPinsMinZoom: lazyPolicy.secondaryPinsMinZoom,
      showGoldPins, isDarkMap, onOpenBargains: (hoodId) => onOpenModalQuickRef.current(hoodId, 'bargains'), reason: 'goldPinsSync',
    });
  }, [showGoldPins, mapZoomLevel, deferredMapNeighborhoods, activeCityHoodIds, statusFilter, isMapIntersectingViewport, isDarkMap, featureFlags.enableSponsorBilling, advancedOverlayState.lowBandwidthGeoLazyMode, isMapLoaded]);

  useEffect(() => {
    const timer = createExecutionTimer('Map', 'updateSelectionPills');
    const { missingSelected } = updateSelectionPillsInPlace({ refs: reconcilerRefs.current, selectedHoodId, mapZoomLevel, isDarkMap });
    if (missingSelected && mapInstanceRef.current && window.L && isMapIntersectingViewport) {
      const pres = presentationRef.current;
      ensureSelectedMarkerExists({
        L: window.L, map: mapInstanceRef.current, refs: reconcilerRefs.current, selectedHood, allCityHoods: deferredMapNeighborhoods,
        currentZoom: mapZoomLevel, activeCity, mode: pres.mode, targetSqm: pres.targetSqm, rentAgeMultiplier: pres.rentAgeMultiplier,
        mapLens: pres.mapLens, isDarkMap, lowBandwidthMode: advancedOverlayState.lowBandwidthGeoLazyMode,
        enableSponsorBilling: featureFlags.enableSponsorBilling, osmBoundariesByHood, d3PriceScale: d3PriceScaleForCity,
        areaUnit: pres.areaUnit, intlCurrency: pres.intlCurrency, locale: pres.locale,
        onSelectNeighborhood: handleNeighborhoodLayerSelect,
      });
    }
    timer('success');
  }, [selectedHoodId, mapZoomLevel, mapTileStyle, isDarkTheme, d3PriceScaleForCity, deferredMapNeighborhoods, activeCity, featureFlags.enableSponsorBilling, advancedOverlayState.lowBandwidthGeoLazyMode, osmBoundariesByHood, isMapIntersectingViewport, selectedHood]);

  useEffect(() => {
    if (!mapInstanceRef.current || !window.L) return;
    reconcileWorkRouteAndLandmarks({ L: window.L, map: mapInstanceRef.current, refs: workLandmarkRefs.current, selectedWorkHub, selectedHood, showLandmarkPins, hoodLandmarks });
  }, [selectedWorkHub, selectedHood, showLandmarkPins, hoodLandmarks, isMapLoaded]);

  const handleFocusLandmarkOnMap = useCallback((lm: LocalLandmark) => {
    const hood = selectedHoodRef.current;
    if (mapInstanceRef.current && hood) mapInstanceRef.current.flyTo([hood.lat + lm.latOffset, hood.lng + lm.lngOffset], 15, { duration: 0.7 });
  }, []);

  return { mapContainerRef, mapInstanceRef, tileLayerRef, markersMapRef, osmBoundariesByHood, handleFocusLandmarkOnMap, isMapLoaded, mapZoomLevel };
}