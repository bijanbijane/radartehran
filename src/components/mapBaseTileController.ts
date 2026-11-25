import React, { useSyncExternalStore } from 'react'; import { FREE_KEYLESS_TILE_SERVERS, type FreeKeylessTileServerId, type MapTileServerId } from '../data/neighborhoods'; import { type ClassifiedTileError, NESHAN_FALLBACK_MESSAGE, NESHAN_TILE_OPTIONS, NeshanTileHealthMonitor, OFFICIAL_OSM_TILE_URL, OSM_STANDARD_TILE_OPTIONS, TILE_STYLE_PREF_STORAGE_KEY, buildNeshanBaseTileUrl, buildNeshanLabelTileUrl, buildProviderAttributionHtml, classifyNeshanHttpError, patchLeafletGridLayerNullSafety, readPersistedFallbackCircuit, resolveInitialPreferredTileStyle, resolveNeshanConfiguration, writePersistedFallbackCircuit, } from '../utils/neshanTileConfig';
import { convertPricePerSqmToUnit, formatAreaUnitLabel, formatMillionTomanAsIntlCurrency } from '../utils/areaUnit'; import { useAreaUnit, useIntlCurrency, useRadarLocale } from './AreaUnitToggle';
export * from '../utils/neshanTileConfig'; export type MapProviderStatusMode = 'neshan_active' | 'osm_fallback' | 'manual_osm' | 'manual_style'; export interface MapProviderRuntimeState { preferredStyle: MapTileServerId; effectiveProvider: MapTileServerId; statusMode: MapProviderStatusMode; statusBadgeText: string; fallbackNotice: string | null; lastErrorClassification: ClassifiedTileError | null; neshanConfigured: boolean; configIssueReason: string | null; isRetryingNeshan: boolean; activeLayerGeneration: number;
} const initialCfg = resolveNeshanConfiguration(); const initialFallback = readPersistedFallbackCircuit(); let runtimeState: MapProviderRuntimeState = {
  preferredStyle: 'neshan', effectiveProvider: initialFallback ? 'osm' : 'neshan', statusMode: initialFallback ? 'osm_fallback' : 'neshan_active', statusBadgeText: initialFallback ? 'نقشه رایگان OpenStreetMap (پشتیبان خودکار)' : 'نقشه نشان (فعال و پیش‌فرض)',
  fallbackNotice: initialFallback ? NESHAN_FALLBACK_MESSAGE : null, lastErrorClassification: null, neshanConfigured: true, configIssueReason: null, isRetryingNeshan: false, activeLayerGeneration: 1, }; const listeners = new Set<() => void>(); function emitRuntimeStateChange(): void { for (const listener of listeners) listener(); }
export function getMapProviderRuntimeState(): MapProviderRuntimeState { return runtimeState; }
function updateRuntimeState(partial: Partial<MapProviderRuntimeState>): void { runtimeState = { ...runtimeState, ...partial }; emitRuntimeStateChange(); }
export function subscribeToMapProviderState(listener: () => void): () => void { listeners.add(listener); return () => { listeners.delete(listener); }; }
export interface LeafletBaseTileController { initializeBaseLayer: () => any; switchStyle: (newStyle: MapTileServerId) => void; syncPreferredStyle: (newStyle: MapTileServerId) => void; retryNeshan: () => boolean; updateAttributionForViewport: () => void; destroy: () => void; getActiveBaseLayer: () => any; getEffectiveProvider: () => MapTileServerId; }
export type BaseTileControllerInstance = LeafletBaseTileController; let activeControllerInstance: LeafletBaseTileController | null = null; export function useMapProviderRuntimeState(): MapProviderRuntimeState { return useSyncExternalStore(subscribeToMapProviderState, getMapProviderRuntimeState); }
export function selectMapProviderStyle(styleId: MapTileServerId): void { if (activeControllerInstance) { activeControllerInstance.switchStyle(styleId); } else { try { localStorage.setItem(TILE_STYLE_PREF_STORAGE_KEY, styleId); } catch { }
    updateRuntimeState({ preferredStyle: styleId, effectiveProvider: styleId, statusMode: styleId === 'neshan' ? 'neshan_active' : 'manual_style', statusBadgeText: styleId === 'neshan' ? 'نقشه نشان (فعال و پیش‌فرض)' : 'نقشه سفارشی', });
  } }
export function triggerManualNeshanRetry(): boolean { if (activeControllerInstance) return activeControllerInstance.retryNeshan();
  writePersistedFallbackCircuit(false); updateRuntimeState({ effectiveProvider: 'neshan', statusMode: 'neshan_active', statusBadgeText: 'نقشه نشان (فعال و پیش‌فرض)', fallbackNotice: null }); return true;
}
export const triggerManualMapboxRetry = triggerManualNeshanRetry;
export interface BaseTileControllerParams {
  map: any;
  L: any;
  initialPreferredStyle?: MapTileServerId;
  onSelectPreferredStyle?: (provider: MapTileServerId) => void;
  initialStyle?: MapTileServerId;
  onProviderChange?: (provider: MapTileServerId) => void;
}
export function createLeafletBaseTileController(arg1: any, arg2?: any, arg3?: any): LeafletBaseTileController {
  let map: any; let L: any;
  let options: { initialStyle?: MapTileServerId; onProviderChange?: (provider: MapTileServerId) => void } = {};
  if (arg1 && typeof arg1 === 'object' && arg1.map) {
    map = arg1.map; L = arg1.L;
    options = { initialStyle: arg1.initialPreferredStyle || arg1.initialStyle, onProviderChange: arg1.onSelectPreferredStyle || arg1.onProviderChange };
  } else {
    map = arg1; L = arg2; options = arg3 || {};
  }
  patchLeafletGridLayerNullSafety(L);
  let currentBaseLayer: any = null;
  let currentLabelLayer: any = null;
  let isDestroyed = false;
  let layerGeneration = 1;
  const cfg = resolveNeshanConfiguration();
  const initialPref = options.initialStyle || resolveInitialPreferredTileStyle();
  const healthMonitor = new NeshanTileHealthMonitor({}, () => {
    handleAutomaticFailover('Consecutive tile load failures exceeded threshold');
  });
  function cleanupCurrentLayers(): void {
    if (currentLabelLayer) {
      try {
        if (map && typeof map.hasLayer === 'function' && map.hasLayer(currentLabelLayer)) {
          if (typeof map.off === 'function' && currentLabelLayer._animateZoom) {
            map.off('zoomanim', currentLabelLayer._animateZoom, currentLabelLayer);
          }
          map.removeLayer(currentLabelLayer);
        }
      } catch {
      }
      currentLabelLayer = null;
    }
    if (!currentBaseLayer) return;
    const target = currentBaseLayer;
    currentBaseLayer = null;
    try {
      if (map && typeof map.hasLayer === 'function' && map.hasLayer(target)) {
        if (typeof map.off === 'function' && target._animateZoom) {
          map.off('zoomanim', target._animateZoom, target);
        }
        if (typeof target.getEvents === 'function' && typeof map.off === 'function') {
          map.off(target.getEvents(), target);
        }
        map.removeLayer(target);
      }
    } catch {
    }
  }
  function createNeshanLayers(gen: number): { base: any; labels: any } {
    healthMonitor.setLayerGeneration(gen);
    const NeshanBaseTileLayer = L.TileLayer.extend({
      getTileUrl(coords: { x: number; y: number; z: number }): string {
        const subIndex = Math.abs(coords.x + coords.y);
        return buildNeshanBaseTileUrl(coords.z, coords.x, coords.y, subIndex);
      },
    });
    const baseLayer = new NeshanBaseTileLayer(null, {
      ...NESHAN_TILE_OPTIONS,
      attribution: buildProviderAttributionHtml('neshan'),
      zIndex: 1,
    });
    baseLayer.on('tileload', () => {
      healthMonitor.recordSuccess(gen);
    });
    baseLayer.on('tileerror', (evt: any) => {
      const classified = classifyNeshanHttpError(evt?.tile?.status ?? null);
      healthMonitor.recordError(gen, classified.httpStatus);
      updateRuntimeState({ lastErrorClassification: classified });
      const tileEl = evt?.tile as HTMLImageElement | undefined;
      const coords = evt?.coords as { x?: number; y?: number; z?: number } | undefined;
      if (
        tileEl &&
        coords &&
        Number.isFinite(coords.x) &&
        Number.isFinite(coords.y) &&
        Number.isFinite(coords.z) &&
        tileEl.dataset &&
        tileEl.dataset.osmFallbackApplied !== '1'
      ) {
        tileEl.dataset.osmFallbackApplied = '1';
        const fallbackUrl = OFFICIAL_OSM_TILE_URL
          .replace('{z}', String(coords.z))
          .replace('{x}', String(coords.x))
          .replace('{y}', String(coords.y));
        tileEl.onload = () => {
          tileEl.classList?.add('leaflet-tile-loaded');
          if (tileEl.style) {
            tileEl.style.visibility = 'visible';
            tileEl.style.opacity = '1';
          }
        };
        tileEl.onerror = null;
        tileEl.src = fallbackUrl;
      }
    });
    baseLayer.on('tileabort', () => {
      healthMonitor.recordAbort(gen);
    });
    return { base: baseLayer, labels: null };
  }
  function createOsmBaseLayer(): any {
    return L.tileLayer(OFFICIAL_OSM_TILE_URL, {
      ...OSM_STANDARD_TILE_OPTIONS,
      attribution: buildProviderAttributionHtml('osm'),
      zIndex: 1,
    });
  }
  function createKeylessServerLayer(styleId: FreeKeylessTileServerId): any {
    const srv = FREE_KEYLESS_TILE_SERVERS[styleId];
    const url = srv?.url || OFFICIAL_OSM_TILE_URL;
    return L.tileLayer(url, {
      ...OSM_STANDARD_TILE_OPTIONS,
      attribution: buildProviderAttributionHtml(styleId),
      zIndex: 1,
    });
  }
  function handleAutomaticFailover(reason: string): void {
    if (isDestroyed) return;
    writePersistedFallbackCircuit(true, reason);
    cleanupCurrentLayers();
    layerGeneration += 1;
    const fallbackLayer = createOsmBaseLayer();
    fallbackLayer.addTo(map);
    if (typeof fallbackLayer.bringToBack === 'function') {
      fallbackLayer.bringToBack();
    }
    currentBaseLayer = fallbackLayer;
    updateRuntimeState({
      effectiveProvider: 'osm',
      statusMode: 'osm_fallback',
      statusBadgeText: 'نقشه رایگان OpenStreetMap (پشتیبان خودکار)',
      fallbackNotice: NESHAN_FALLBACK_MESSAGE,
      activeLayerGeneration: layerGeneration,
    });
    if (options.onProviderChange) {
      options.onProviderChange('osm');
    }
  }
  function applyStyle(styleId: MapTileServerId, isExplicitRetry = false): void {
    if (isDestroyed) return;
    cleanupCurrentLayers();
    layerGeneration += 1;
    let newBase: any = null;
    let newLabels: any = null;
    let effective: MapTileServerId = styleId;
    let mode: MapProviderStatusMode = 'manual_style';
    let badge = 'نقشه سفارشی';
    let notice: string | null = null;
    if (styleId === 'neshan') {
      const fallbackActive = readPersistedFallbackCircuit();
      if (fallbackActive && !isExplicitRetry) {
        newBase = createOsmBaseLayer();
        effective = 'osm';
        mode = 'osm_fallback';
        badge = 'نقشه رایگان OpenStreetMap (پشتیبان خودکار)';
        notice = NESHAN_FALLBACK_MESSAGE;
      } else {
        writePersistedFallbackCircuit(false);
        const layers = createNeshanLayers(layerGeneration);
        newBase = layers.base;
        newLabels = layers.labels;
        effective = 'neshan';
        mode = 'neshan_active';
        badge = 'نقشه نشان (فعال و پیش‌فرض)';
        notice = null;
      }
    } else if (styleId === 'osm') {
      newBase = createOsmBaseLayer();
      effective = 'osm';
      mode = 'manual_osm';
      badge = 'نقشه رایگان OpenStreetMap (دستی)';
      notice = null;
    } else {
      newBase = createKeylessServerLayer(styleId as FreeKeylessTileServerId);
      effective = styleId;
      mode = 'manual_style';
      const label = FREE_KEYLESS_TILE_SERVERS[styleId as FreeKeylessTileServerId]?.label || styleId;
      badge = label;
      notice = null;
    }
    newBase.addTo(map);
    if (typeof newBase.bringToBack === 'function') {
      newBase.bringToBack();
    }
    currentBaseLayer = newBase;
    if (newLabels) {
      newLabels.addTo(map);
      currentLabelLayer = newLabels;
    }
    try {
      localStorage.setItem(TILE_STYLE_PREF_STORAGE_KEY, styleId);
    } catch {
    }
    updateRuntimeState({
      preferredStyle: styleId,
      effectiveProvider: effective,
      statusMode: mode,
      statusBadgeText: badge,
      fallbackNotice: notice,
      isRetryingNeshan: false,
      activeLayerGeneration: layerGeneration,
    });
    if (options.onProviderChange) {
      options.onProviderChange(effective);
    }
  }
  function initializeBaseLayer(): any {
    applyStyle(initialPref);
    return currentBaseLayer;
  }
  function switchStyle(newStyle: MapTileServerId): void {
    applyStyle(newStyle);
  }
  function retryNeshan(): boolean {
    writePersistedFallbackCircuit(false);
    updateRuntimeState({ isRetryingNeshan: true });
    applyStyle('neshan', true);
    return true;
  }
  function destroy(): void {
    isDestroyed = true;
    cleanupCurrentLayers();
  }
  const controller: LeafletBaseTileController = {
    initializeBaseLayer,
    switchStyle,
    syncPreferredStyle: switchStyle,
    retryNeshan,
    updateAttributionForViewport: () => {},
    destroy: () => {
      destroy();
      if (activeControllerInstance === controller) {
        activeControllerInstance = null;
      }
    },
    getActiveBaseLayer: () => currentBaseLayer,
    getEffectiveProvider: () => runtimeState.effectiveProvider,
  };
  activeControllerInstance = controller;
  initializeBaseLayer();
  return controller;
}
export function MapProviderStatusBadge(props: { onRetryNeshan?: () => void; className?: string }): React.ReactElement {
  const [areaUnit] = useAreaUnit(); const [intlCurrency] = useIntlCurrency(); const [locale] = useRadarLocale();
  const state = useSyncExternalStore(subscribeToMapProviderState, getMapProviderRuntimeState);
  const { statusMode, statusBadgeText, isRetryingNeshan } = state;
  const isFallback = statusMode === 'osm_fallback'; const isNeshan = statusMode === 'neshan_active';
  const badgeUnitMeta = `${formatAreaUnitLabel(areaUnit)} · ${formatMillionTomanAsIntlCurrency(convertPricePerSqmToUnit(100, areaUnit), intlCurrency, locale)}`;
  const badgeClass = `inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-[11px] font-medium border shadow-xs transition-all ${
    isFallback ? 'bg-amber-500/10 border-amber-500/30 text-amber-900 dark:text-amber-200'
      : isNeshan ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-900 dark:text-emerald-200'
      : 'bg-slate-500/10 border-slate-500/20 text-slate-700 dark:text-[var(--color-text-secondary)]'
  } ${props.className || ''}`;
  const dotClass = `w-2 h-2 rounded-full ${isFallback ? 'bg-amber-500 animate-pulse' : isNeshan ? 'bg-emerald-500' : 'bg-slate-400'}`;
  return React.createElement(
    'div',
    { className: badgeClass, role: 'status', 'aria-live': 'polite', 'data-unit-meta': badgeUnitMeta },
    React.createElement('span', { className: dotClass, 'aria-hidden': true }), React.createElement('span', { className: 'truncate max-w-[200px]' }, statusBadgeText), isFallback && props.onRetryNeshan
      ? React.createElement(
          'button', { type: 'button', onClick: props.onRetryNeshan, disabled: isRetryingNeshan, className:
              'ml-1 px-1.5 py-0.5 rounded-sm bg-amber-600 hover:bg-amber-700 text-white text-[10px] font-bold cursor-pointer transition disabled:opacity-50', }, isRetryingNeshan ? 'در حال اتصال...' : 'تلاش مجدد نشان'
        )
      : null
  ); }