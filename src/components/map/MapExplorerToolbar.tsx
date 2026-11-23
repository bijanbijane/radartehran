/**
 * @file MapExplorerToolbar.tsx — Zoom, reset, viewport-search & attribution (RT-UI-MAP-PILOT-001)
 */
import React, { useEffect, useState } from 'react';
import { Crosshair, MapPin } from 'lucide-react';
import type { CityId } from '../../data/neighborhoods';
import { MULTI_CITY_CONFIGS } from '../../data/multiCityData';
import { CITY_DISPLAY_NAMES } from '../../utils/geo/cityGeospatialResolver';
import { RadarButton } from '../common/RadarButton';
import { updateMapAdvancedOverlayState, useMapAdvancedOverlayState } from '../mapAdvancedLayers';

export interface MapExplorerToolbarProps {
  mapInstanceRef: React.MutableRefObject<unknown>;
  activeCity: CityId;
  mapZoomLevel: number;
  onLocateNearestHood: () => void;
  onOpenFilters: () => void;
  locale?: 'fa' | 'en';
}

export const MapExplorerToolbar: React.FC<MapExplorerToolbarProps> = ({
  mapInstanceRef,
  activeCity,
  mapZoomLevel,
  onLocateNearestHood,
  onOpenFilters,
  locale = 'fa',
}) => {
  const isEn = locale === 'en';
  const { filterRankingByViewport, viewportBounds } = useMapAdvancedOverlayState();
  const [liveZoom, setLiveZoom] = useState(mapZoomLevel);

  useEffect(() => setLiveZoom(mapZoomLevel), [mapZoomLevel]);

  useEffect(() => {
    const map = mapInstanceRef.current as { on?: (e: string, fn: () => void) => void; off?: (e: string, fn: () => void) => void; getZoom?: () => number } | null;
    if (!map?.on) return undefined;
    const syncZoom = () => {
      try {
        const z = map.getZoom?.();
        if (typeof z === 'number' && Number.isFinite(z)) setLiveZoom(z);
      } catch { /* ignore */ }
    };
    map.on('zoomend', syncZoom);
    return () => map.off?.('zoomend', syncZoom);
  }, [mapInstanceRef]);

  const zoomBy = (delta: number) => {
    const map = mapInstanceRef.current as { setZoom?: (z: number) => void; getZoom?: () => number } | null;
    if (!map?.setZoom) return;
    const z = map.getZoom?.() ?? liveZoom;
    map.setZoom(Math.max(5, Math.min(18, z + delta)));
  };

  const resetCityView = () => {
    const map = mapInstanceRef.current as { flyTo?: (c: [number, number], z: number, o?: { duration?: number }) => void } | null;
    const cfg = MULTI_CITY_CONFIGS[activeCity] || MULTI_CITY_CONFIGS.tehran;
    const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 1024;
    const center: [number, number] = [cfg.center[0], cfg.center[1] + (isDesktop ? 0.055 : 0)];
    map?.flyTo?.(center, cfg.defaultZoom, { duration: 0.65 });
  };

  const toggleViewportFilter = () => {
    if (!viewportBounds) return;
    updateMapAdvancedOverlayState({ filterRankingByViewport: !filterRankingByViewport });
  };

  const cityLabel = isEn ? CITY_DISPLAY_NAMES[activeCity].en : CITY_DISPLAY_NAMES[activeCity].fa;

  return (
    <div
      data-testid="map-explorer-toolbar"
      className="pointer-events-auto fixed z-[22] right-2 sm:right-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] lg:bottom-6 max-lg:left-[auto] lg:right-[calc(21rem+0.75rem)] flex flex-col items-end gap-1.5 max-w-[calc(100vw-0.5rem)]"
    >
      <div
        role="toolbar"
        aria-label={isEn ? 'Map canvas controls' : 'کنترل‌های بوم نقشه'}
        className="apple-vibrancy-bar flex flex-col gap-0.5 sm:gap-1 p-1 sm:p-1.5 rounded-xl border border-[var(--color-border-subtle)] dark:border-slate-700 shadow-lg"
      >
        <RadarButton type="button" variant="secondary" size="sm" className="min-w-[44px] min-h-[44px] sm:min-w-[2.25rem] sm:min-h-0 px-0" aria-label={isEn ? 'Zoom in' : 'بزرگ‌نمایی'} onClick={() => zoomBy(1)}>
          +
        </RadarButton>
        <span className="text-[10px] text-center font-mono text-[var(--color-text-muted)] tabular-nums px-1">{liveZoom}</span>
        <RadarButton type="button" variant="secondary" size="sm" className="min-w-[44px] min-h-[44px] sm:min-w-[2.25rem] sm:min-h-0 px-0" aria-label={isEn ? 'Zoom out' : 'کوچک‌نمایی'} onClick={() => zoomBy(-1)}>
          −
        </RadarButton>
        <RadarButton type="button" variant="secondary" size="sm" className="text-[10px] font-bold" onClick={resetCityView} aria-label={isEn ? `Reset to ${cityLabel}` : `بازنشانی نمای ${cityLabel}`}>
          <MapPin className="w-3.5 h-3.5" aria-hidden />
        </RadarButton>
        <RadarButton type="button" variant="secondary" size="sm" onClick={onLocateNearestHood} aria-label={isEn ? 'Nearest neighborhood' : 'نزدیک‌ترین محله'}>
          <Crosshair className="w-3.5 h-3.5" aria-hidden />
        </RadarButton>
        <RadarButton
          type="button"
          variant={filterRankingByViewport ? 'primary' : 'secondary'}
          size="sm"
          className="hidden sm:inline-flex text-[9px] font-bold leading-tight max-w-[4.5rem]"
          disabled={!viewportBounds}
          aria-pressed={filterRankingByViewport}
          onClick={toggleViewportFilter}
        >
          {isEn ? 'In view' : 'کادر نقشه'}
        </RadarButton>
        <RadarButton type="button" variant="secondary" size="sm" className="hidden sm:inline-flex text-[9px] font-bold" onClick={onOpenFilters}>
          {isEn ? 'Filters' : 'فیلتر'}
        </RadarButton>
      </div>
      <p className="hidden sm:block text-[9px] text-slate-500 dark:text-slate-400 bg-white/80 dark:bg-slate-900/80 px-2 py-0.5 rounded-md border border-slate-200/60 dark:border-slate-700/60 max-w-[14rem] text-end">
        © OSM · CARTO · {isEn ? 'Radar neighborhoods index' : 'شاخص محله‌ای رادار'}
      </p>
    </div>
  );
};