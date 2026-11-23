/**
 * @file src/components/map/MapQuickControlsStrip.tsx
 * @description One-click Rent/Buy mode toggle and urban infrastructure layer switches
 * (Metro lines, Traffic zones, Geodesic Ruler) inside the FloatingTopBar map lens row.
 */
import React from 'react';
import { Ruler, TrafficCone, TrainFront } from 'lucide-react';
import { updateMapAdvancedOverlayState, useMapAdvancedOverlayState } from '../mapAdvancedLayers';
import { useInteractiveSpatialMeasureState } from './interactiveSpatialMeasureLayer';

export interface MapQuickControlsStripProps {
  mode: 'rent' | 'buy';
  setMode: (mode: 'rent' | 'buy') => void;
  isEn?: boolean;
  isSpatialMeasureActive?: boolean;
  onToggleSpatialMeasure?: () => void;
}

export const MapQuickControlsStrip: React.FC<MapQuickControlsStripProps> = ({
  mode,
  setMode,
  isEn = false,
  isSpatialMeasureActive = false,
  onToggleSpatialMeasure,
}) => {
  const { showMetroLines, showTrafficZones } = useMapAdvancedOverlayState();
  const spatialState = useInteractiveSpatialMeasureState();
  const rulerActive = isSpatialMeasureActive || spatialState.mode === 'measure' || spatialState.mode === 'draw';

  return (
    <div
      data-testid="map-quick-controls-strip"
      className="flex items-center gap-1 overflow-x-auto no-scrollbar max-w-full"
    >
      <div
        role="group"
        aria-label={isEn ? 'Valuation mode' : 'حالت ارزیابی نقشه'}
        className="flex items-center gap-0.5 apple-vibrancy-bar p-1 rounded-[11px] text-[11px] font-bold shrink-0"
      >
        <button
          type="button"
          data-testid="quick-mode-rent"
          aria-pressed={mode === 'rent'}
          onClick={() => setMode('rent')}
          className={`px-2 py-1 rounded-[8px] whitespace-nowrap shrink-0 transition cursor-pointer ${
            mode === 'rent'
              ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-2xs'
              : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          {isEn ? 'Rent' : 'رهن'}
        </button>
        <button
          type="button"
          data-testid="quick-mode-buy"
          aria-pressed={mode === 'buy'}
          onClick={() => setMode('buy')}
          className={`px-2 py-1 rounded-[8px] whitespace-nowrap shrink-0 transition cursor-pointer ${
            mode === 'buy'
              ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-2xs'
              : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          {isEn ? 'Buy' : 'خرید'}
        </button>
      </div>

      <div
        role="group"
        aria-label={isEn ? 'Quick map layers and ruler' : 'لایه‌های سریع شهری و خط‌کش'}
        className="flex items-center gap-0.5 apple-vibrancy-bar p-1 rounded-[11px] text-[11px] font-bold shrink-0"
      >
        <button
          type="button"
          data-testid="quick-toggle-metro"
          aria-pressed={showMetroLines}
          onClick={() => updateMapAdvancedOverlayState({ showMetroLines: !showMetroLines })}
          className={`inline-flex items-center gap-1 px-2 py-1 rounded-[8px] whitespace-nowrap shrink-0 transition cursor-pointer ${
            showMetroLines
              ? 'bg-emerald-600 text-white shadow-2xs'
              : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100/80 dark:hover:bg-slate-800/80'
          }`}
        >
          <TrainFront className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>{isEn ? 'Metro' : 'خطوط مترو'}</span>
        </button>

        <button
          type="button"
          data-testid="quick-toggle-traffic"
          aria-pressed={showTrafficZones}
          onClick={() => updateMapAdvancedOverlayState({ showTrafficZones: !showTrafficZones })}
          className={`inline-flex items-center gap-1 px-2 py-1 rounded-[8px] whitespace-nowrap shrink-0 transition cursor-pointer ${
            showTrafficZones
              ? 'bg-rose-600 text-white shadow-2xs'
              : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100/80 dark:hover:bg-slate-800/80'
          }`}
        >
          <TrafficCone className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>{isEn ? 'Traffic Zone' : 'محدوده طرح'}</span>
        </button>

        {onToggleSpatialMeasure && (
          <button
            type="button"
            data-testid="quick-toggle-ruler"
            aria-pressed={rulerActive}
            onClick={onToggleSpatialMeasure}
            className={`inline-flex items-center gap-1 px-2 py-1 rounded-[8px] whitespace-nowrap shrink-0 transition cursor-pointer ${
              rulerActive
                ? 'bg-indigo-600 text-white shadow-2xs'
                : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100/80 dark:hover:bg-slate-800/80'
            }`}
          >
            <Ruler className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>{isEn ? 'Ruler' : 'خط‌کش'}</span>
          </button>
        )}
      </div>
    </div>
  );
};
