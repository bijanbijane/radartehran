import type React from 'react';
import type { EvaluatedNeighborhood, MapTileServerId } from '../../data/neighborhoods';
import { createExecutionTimer } from '../../utils/diagnostics';
import { ensureLeafletLoaded, retryLeafletLoad } from '../../utils/leafletLoader';
import { recordDiagnosticEvent } from '../../utils/security';
import { createLeafletBaseTileController, type BaseTileControllerInstance } from '../mapBaseTileController';
import { updateMapAdvancedOverlayState } from '../mapAdvancedLayers';
import { getMapInstanceRegistry } from '../../platform/geo/leaflet/MapInstanceRegistry';

type TooltipTrendModule = typeof import('./NeighborhoodTooltipMarketTrend');
let tooltipTrendModulePromise: Promise<TooltipTrendModule> | null = null;
let loadedTooltipTrendModule: TooltipTrendModule | null = null;
function loadTooltipTrendModule(): Promise<TooltipTrendModule> {
  if (!tooltipTrendModulePromise) {
    tooltipTrendModulePromise = import('./NeighborhoodTooltipMarketTrend').then((mod) => {
      loadedTooltipTrendModule = mod;
      return mod;
    });
  }
  return tooltipTrendModulePromise;
}

export interface MapViewportSettledEvent {
  lat: number;
  lng: number;
  zoom: number;
  isUserPan: boolean;
  isZoomOnly: boolean;
}

export interface MountLeafletLifecycleParams {
  mapContainerRef: React.RefObject<HTMLDivElement | null>;
  mapInstanceRef: React.MutableRefObject<any>;
  tileLayerRef: React.MutableRefObject<BaseTileControllerInstance | null>;
  initCenter: [number, number];
  initZoom: number;
  initialTileStyle: MapTileServerId;
  onSelectPreferredStyle: (next: MapTileServerId) => void;
  onMapLoaded: () => void;
  onZoomChange: (zoom: number) => void;
  onViewportSettled: (evt?: MapViewportSettledEvent) => void;
  onOpenModalQuick: (hoodId: number, action: 'anatomy' | 'hedonic' | 'bargains' | 'compare' | 'share') => void;
  onTeardownLayers: (map: any) => void;
  programmaticMoveRef?: React.MutableRefObject<boolean>;
  resolveHoodById?: (hoodId: number) => EvaluatedNeighborhood | undefined;
  loadLeaflet?: () => Promise<unknown>;
  retryLoadLeaflet?: () => Promise<unknown>;
}

export function mountLeafletMapLifecycle(params: MountLeafletLifecycleParams): () => void {
  const {
    mapContainerRef, mapInstanceRef, tileLayerRef, initCenter, initZoom, initialTileStyle,
    onSelectPreferredStyle, onMapLoaded, onZoomChange, onViewportSettled, onOpenModalQuick, onTeardownLayers,
    programmaticMoveRef, resolveHoodById, loadLeaflet = ensureLeafletLoaded, retryLoadLeaflet = retryLeafletLoad,
  } = params;

  let unmounted = false;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let initialInvalidateTimer: ReturnType<typeof setTimeout> | null = null;
  let moveDebounce: ReturnType<typeof setTimeout> | null = null;
  let attachedMap: any = null;
  let attachedContainer: HTMLElement | null = null;
  let handleDragStart: (() => void) | null = null;
  let handleZoomStart: (() => void) | null = null;
  let handleZoomEnd: (() => void) | null = null;
  let handleMoveEnd: (() => void) | null = null;
  let handleResize: (() => void) | null = null;
  let handleTooltipOpen: ((e: any) => void) | null = null;
  let handleTooltipClose: ((e: any) => void) | null = null;
  let handleMapActionClick: ((e: MouseEvent) => void) | null = null;
  let userDragPending = false;
  let zoomStartCenter: { lat: number; lng: number } | null = null;
  const registryContainerId = 'tehran-radar-primary-map';

  const handlePageShow = () => {
    if (!unmounted) mapInstanceRef.current?.invalidateSize?.();
  };
  if (typeof window !== 'undefined') window.addEventListener('pageshow', handlePageShow);

  const syncViewportBoundsToStore = (map: any) => {
    try {
      const b = map.getBounds?.();
      const z = map.getZoom?.() || 12;
      if (b && typeof b.getNorth === 'function') {
        updateMapAdvancedOverlayState({
          viewportBounds: { north: b.getNorth(), south: b.getSouth(), east: b.getEast(), west: b.getWest(), zoom: z },
        });
      }
    } catch { /* ignore */ }
  };

  const readSettledEvent = (map: any, isUserPan: boolean, isZoomOnly: boolean): MapViewportSettledEvent => {
    const center = map.getCenter?.();
    const lat = typeof center?.lat === 'number' && Number.isFinite(center.lat) ? center.lat : initCenter[0];
    const lng = typeof center?.lng === 'number' && Number.isFinite(center.lng) ? center.lng : initCenter[1];
    const zoom = typeof map.getZoom === 'function' && Number.isFinite(map.getZoom()) ? map.getZoom() : initZoom;
    return { lat, lng, zoom, isUserPan, isZoomOnly };
  };

  const initMap = () => {
    const L = typeof window !== 'undefined' ? (window as any).L : undefined;
    if (unmounted || !L || !mapContainerRef.current || mapInstanceRef.current) return;
    const mapTimer = createExecutionTimer('Map', 'initMapInstance');
    const map = L.map(mapContainerRef.current, {
      center: initCenter, zoom: initZoom, zoomControl: false, preferCanvas: true,
      maxBoundsViscosity: 0.8, inertia: true, inertiaDeceleration: 3000, wheelDebounceTime: 40, wheelPxPerZoomLevel: 120,
    });
    attachedMap = map;
    getMapInstanceRegistry().register(registryContainerId, map);
    tileLayerRef.current = createLeafletBaseTileController({
      map, L, initialPreferredStyle: initialTileStyle, onSelectPreferredStyle,
    });
    L.control?.zoom?.({ position: 'bottomleft' })?.addTo?.(map);
    mapInstanceRef.current = map;
    onMapLoaded();
    mapTimer('success');

    onZoomChange(map.getZoom?.() || 12);
    syncViewportBoundsToStore(map);
    onViewportSettled(readSettledEvent(map, false, false));

    initialInvalidateTimer = setTimeout(() => {
      initialInvalidateTimer = null;
      if (unmounted || mapInstanceRef.current !== map) return;
      map.invalidateSize?.();
      syncViewportBoundsToStore(map);
      onViewportSettled(readSettledEvent(map, false, false));
    }, 100);

    const onDebouncedMoveOrResize = (fromZoom: boolean) => {
      if (unmounted || mapInstanceRef.current !== map) return;
      if (moveDebounce) clearTimeout(moveDebounce);
      const capturedDrag = userDragPending;
      const capturedZoomOrigin = zoomStartCenter;
      moveDebounce = setTimeout(() => {
        moveDebounce = null;
        userDragPending = false;
        zoomStartCenter = null;
        if (unmounted || mapInstanceRef.current !== map) return;
        const center = map.getCenter?.();
        const centerDelta = capturedZoomOrigin && center
          ? Math.hypot(Number(center.lat) - capturedZoomOrigin.lat, Number(center.lng) - capturedZoomOrigin.lng)
          : Infinity;
        const isZoomOnly = Boolean(fromZoom && !capturedDrag && centerDelta < 0.002);
        const isProgrammatic = Boolean(programmaticMoveRef?.current);
        const isUserPan = Boolean(capturedDrag && !isProgrammatic && !isZoomOnly);
        onViewportSettled(readSettledEvent(map, isUserPan, isZoomOnly));
        syncViewportBoundsToStore(map);
        tileLayerRef.current?.updateAttributionForViewport();
      }, 140);
    };

    handleDragStart = () => {
      if (unmounted || mapInstanceRef.current !== map) return;
      if (programmaticMoveRef) programmaticMoveRef.current = false;
      userDragPending = true;
    };
    handleZoomStart = () => {
      if (unmounted || mapInstanceRef.current !== map) return;
      const c = map.getCenter?.();
      zoomStartCenter = c && Number.isFinite(c.lat) && Number.isFinite(c.lng) ? { lat: c.lat, lng: c.lng } : null;
    };
    handleZoomEnd = () => {
      if (unmounted || mapInstanceRef.current !== map) return;
      onZoomChange(map.getZoom?.() || 12);
      onDebouncedMoveOrResize(true);
    };
    handleMoveEnd = () => onDebouncedMoveOrResize(false);
    handleResize = () => onDebouncedMoveOrResize(false);
    handleTooltipOpen = (evt: any) => {
      if (!resolveHoodById) return;
      const el = evt?.tooltip?.getElement?.() || mapContainerRef.current;
      if (loadedTooltipTrendModule) {
        loadedTooltipTrendModule.mountNeighborhoodTooltipTrendOnOpen(el, resolveHoodById);
      } else {
        void loadTooltipTrendModule().then((mod) => {
          if (!unmounted && el?.isConnected) {
            mod.mountNeighborhoodTooltipTrendOnOpen(el, resolveHoodById);
          }
        }).catch(() => { /* fallback static SVG */ });
      }
    };
    handleTooltipClose = (evt: any) => {
      const el = evt?.tooltip?.getElement?.();
      loadedTooltipTrendModule?.unmountNeighborhoodTooltipTrendOnClose(el);
    };

    map.on?.('dragstart', handleDragStart);
    map.on?.('zoomstart', handleZoomStart);
    map.on?.('zoomend', handleZoomEnd);
    map.on?.('moveend', handleMoveEnd);
    map.on?.('resize', handleResize);
    map.on?.('tooltipopen', handleTooltipOpen);
    map.on?.('tooltipclose', handleTooltipClose);

    attachedContainer = mapContainerRef.current || map.getContainer?.() || null;
    handleMapActionClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement | null)?.closest?.('[data-hood-action], [data-tooltip-action]') as HTMLElement | null;
      if (!target) return;
      e.preventDefault();
      e.stopPropagation();
      const hoodId = Number(target.getAttribute('data-hood-id'));
      const action = (target.getAttribute('data-hood-action') || target.getAttribute('data-tooltip-action')) as 'anatomy' | 'hedonic' | 'bargains' | 'compare' | 'share' | null;
      if (!Number.isNaN(hoodId) && action) onOpenModalQuick(hoodId, action);
    };
    attachedContainer?.addEventListener?.('click', handleMapActionClick);
    if (typeof document !== 'undefined') {
      document.addEventListener('click', handleMapActionClick);
    }
  };

  const attemptLeafletInit = (attempt: number) => {
    if (unmounted) return;
    if (typeof window !== 'undefined' && (window as any).L) { initMap(); return; }
    const ensureLocalOrLoaded = async () => {
      if (typeof window !== 'undefined' && !(window as any).L && !params.loadLeaflet && !params.retryLoadLeaflet) {
        try {
          const localMod: any = await import('leaflet');
          const resolvedL = localMod?.default || localMod;
          if (resolvedL && typeof resolvedL.map === 'function') {
            (window as any).L = resolvedL;
            return resolvedL;
          }
        } catch {
          // Fall back to loader
        }
      }
      return attempt === 0 ? loadLeaflet() : retryLoadLeaflet();
    };
    ensureLocalOrLoaded()
      .then(() => { if (!unmounted) initMap(); })
      .catch((err) => {
        if (unmounted) return;
        if (attempt < 3) {
          retryTimer = setTimeout(() => {
            retryTimer = null;
            if (!unmounted) attemptLeafletInit(attempt + 1);
          }, 400 * Math.pow(2, attempt));
        } else {
          recordDiagnosticEvent('LeafletRadarMap', `Leaflet load exhausted after ${attempt + 1} attempts (${err instanceof Error ? err.message : 'timeout'})`, 'fallback');
        }
      });
  };
  attemptLeafletInit(0);

  return () => {
    unmounted = true;
    loadedTooltipTrendModule?.unmountNeighborhoodTooltipTrendOnClose();
    if (typeof window !== 'undefined') window.removeEventListener('pageshow', handlePageShow);
    if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
    if (initialInvalidateTimer) { clearTimeout(initialInvalidateTimer); initialInvalidateTimer = null; }
    if (moveDebounce) { clearTimeout(moveDebounce); moveDebounce = null; }
    const map = mapInstanceRef.current || attachedMap;
    if (map) {
      if (handleDragStart) map.off?.('dragstart', handleDragStart);
      if (handleZoomStart) map.off?.('zoomstart', handleZoomStart);
      if (handleZoomEnd) map.off?.('zoomend', handleZoomEnd);
      if (handleMoveEnd) map.off?.('moveend', handleMoveEnd);
      if (handleResize) map.off?.('resize', handleResize);
      if (handleTooltipOpen) map.off?.('tooltipopen', handleTooltipOpen);
      if (handleTooltipClose) map.off?.('tooltipclose', handleTooltipClose);
    }
    if (attachedContainer && handleMapActionClick) attachedContainer.removeEventListener?.('click', handleMapActionClick);
    if (typeof document !== 'undefined' && handleMapActionClick) document.removeEventListener('click', handleMapActionClick);
    onTeardownLayers(map);
    tileLayerRef.current?.destroy();
    tileLayerRef.current = null;
    getMapInstanceRegistry().unregister(registryContainerId);
    if (map) {
      map.remove?.();
      if (mapInstanceRef.current === map) mapInstanceRef.current = null;
    }
    attachedMap = null;
    attachedContainer = null;
  };
}
