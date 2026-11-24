/**
 * @file MapExplorerToolbar.tsx — Consolidated bottom-left map controls (Zoom, Reset, GPS, Viewport Filter, Legend)
 */
import React, { useEffect, useState } from 'react';
import { Crosshair, Layers, MapPin, Ruler } from 'lucide-react';
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
  onToggleLegend?: () => void;
  isLegendOpen?: boolean;
  isSpatialMeasureActive?: boolean;
  onToggleSpatialMeasure?: () => void;
  locale?: 'fa' | 'en';
}

export const MapExplorerToolbar: React.FC<MapExplorerToolbarProps> = ({
  mapInstanceRef,
  activeCity,
  mapZoomLevel,
  onLocateNearestHood,
  onToggleLegend,
  isLegendOpen = false,
  isSpatialMeasureActive = false,
  onToggleSpatialMeasure,
  locale = 'fa',
}) => {
  const isEn = locale === 'en';
  const { filterRankingByViewport, viewportBounds } = useMapAdvancedOverlayState();
  const [liveZoom, setLiveZoom] = useState(mapZoomLevel);

  useEffect(() => setLiveZoom(mapZoomLevel), [mapZoomLevel]);

  useEffect(() => {
    const map = mapInstanceRef.current as {
      on?: (e: string, fn: () => void) => void;
      off?: (e: string, fn: () => void) => void;
      getZoom?: () => number;
    } | null;
    if (!map?.on) return undefined;
    const syncZoom = () => {
      try {
        const z = map.getZoom?.();
        if (typeof z === 'number' && Number.isFinite(z)) setLiveZoom(z);
      } catch {
        /* ignore */
      }
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
    const map = mapInstanceRef.current as {
      flyTo?: (c: [number, number], z: number, o?: { duration?: number }) => void;
    } | null;
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
      className="pointer-events-auto fixed z-[22] left-3 lg:left-4 bottom-[calc(9.5rem+env(safe-area-inset-bottom))] md:bottom-[5.25rem] lg:bottom-5 flex flex-col items-start gap-1.5"
    >
      <div
        role="toolbar"
        aria-label={isEn ? 'Map canvas controls' : 'کنترل‌های بوم نقشه'}
        className="apple-vibrancy-bar flex flex-col gap-1 p-1.5 rounded-[12px]"
      >
        <RadarButton
          type="button"
          variant="secondary"
          size="sm"
          className="min-w-[44px] min-h-[44px] lg:min-w-[36px] lg:min-h-[36px] px-0 text-sm font-bold"
          aria-label={isEn ? 'Zoom in' : 'بزرگ‌نمایی'}
          onClick={() => zoomBy(1)}
        >
          +
        </RadarButton>
        <span className="text-xs text-center font-mono text-[var(--color-text-muted)] tabular-nums select-none">
          {liveZoom}
        </span>
        <RadarButton
          type="button"
          variant="secondary"
          size="sm"
          className="min-w-[44px] min-h-[44px] lg:min-w-[36px] lg:min-h-[36px] px-0 text-sm font-bold"
          aria-label={isEn ? 'Zoom out' : 'کوچک‌نمایی'}
          onClick={() => zoomBy(-1)}
        >
          −
        </RadarButton>
        <RadarButton
          type="button"
          variant="secondary"
          size="sm"
          className="min-w-[44px] min-h-[44px] lg:min-w-[36px] lg:min-h-[36px] px-0"
          onClick={resetCityView}
          aria-label={isEn ? `Reset to ${cityLabel}` : `بازنشانی نمای ${cityLabel}`}
          title={isEn ? `Reset to ${cityLabel}` : `بازنشانی نمای ${cityLabel}`}
        >
          <MapPin className="w-4 h-4" aria-hidden="true" />
        </RadarButton>
        <RadarButton
          type="button"
          variant="secondary"
          size="sm"
          className="min-w-[44px] min-h-[44px] lg:min-w-[36px] lg:min-h-[36px] px-0"
          onClick={onLocateNearestHood}
          aria-label={isEn ? 'Nearest neighborhood' : 'نزدیک‌ترین محله'}
          title={isEn ? 'Nearest neighborhood' : 'نزدیک‌ترین محله (GPS)'}
        >
          <Crosshair className="w-4 h-4" aria-hidden="true" />
        </RadarButton>
        {onToggleSpatialMeasure && (
          <RadarButton
            type="button"
            variant={isSpatialMeasureActive ? 'primary' : 'secondary'}
            size="sm"
            className="hidden lg:inline-flex min-w-[36px] min-h-[36px] px-0"
            aria-pressed={isSpatialMeasureActive}
            aria-label={isEn ? 'Distance ruler' : 'خط‌کش فاصله روی نقشه'}
            title={isEn ? 'Distance ruler' : 'خط‌کش فاصله'}
            onClick={onToggleSpatialMeasure}
          >
            <Ruler className="w-4 h-4" aria-hidden="true" />
          </RadarButton>
        )}
      </div>

      <div className="hidden lg:flex items-center gap-1.5">
        <RadarButton
          type="button"
          variant={filterRankingByViewport ? 'primary' : 'secondary'}
          size="sm"
          className="px-3 py-1.5 text-xs font-bold whitespace-nowrap apple-vibrancy-bar"
          disabled={!viewportBounds}
          aria-pressed={filterRankingByViewport}
          onClick={toggleViewportFilter}
        >
          {isEn ? 'In view' : 'کادر نقشه'}
        </RadarButton>
        {onToggleLegend && (
          <RadarButton
            type="button"
            variant={isLegendOpen ? 'primary' : 'secondary'}
            size="sm"
            className="px-3 py-1.5 text-xs font-bold whitespace-nowrap apple-vibrancy-bar inline-flex items-center gap-1.5"
            aria-expanded={isLegendOpen}
            onClick={onToggleLegend}
          >
            <Layers className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{isEn ? 'Legend' : 'راهنمای نقشه'}</span>
          </RadarButton>
        )}
      </div>
    </div>
  );
};