/** @file src/components/navigation/MapToolRail.tsx — Dedicated Spatial Map Tool Rail & Context Panel (RT-UI-NAV-001 Section 8) */
import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeftRight, Bookmark, Check, Layers, LineChart, Navigation,
  Ruler, SlidersHorizontal, TrafficCone, TrainFront, Trash2, X,
} from 'lucide-react';
import type { CityId, EvaluatedNeighborhood, MapTileServerId } from '../../data/neighborhoods';
import { toPersianNum } from '../../data/neighborhoods';
import { CITY_TRAFFIC_ZONES, updateMapAdvancedOverlayState, useMapAdvancedOverlayState } from '../mapAdvancedLayers';
import {
  setInteractiveSpatialMode,
  useInteractiveSpatialMeasureState,
} from '../map/interactiveSpatialMeasureLayer';
import {
  deleteSavedMapView, readSavedMapViews, resolveMapToolVisualState, saveCurrentMapView, toggleMapContextPanel,
  type MapContextPanelId,
} from '../../navigation/map/mapToolRailConfig';
import type { SavedMapViewItem } from '../../navigation/registry/route.types';
import type { RadarLocale } from '../../utils/areaUnit';
import {
  convertPricePerSqmToUnit,
  convertPricePerSqmToUnitRaw,
  formatAreaShort,
  formatMillionTomanAsIntlCurrency,
} from '../../utils/areaUnit';
import { useAreaUnit, useIntlCurrency } from '../AreaUnitToggle';
import { useExchangeRateSnapshot } from '../../features/commerce/services/exchangeRateClient';
import { MapSpatialToolsPopover } from '../../features/map/components/MapSpatialToolsPopover';

export interface MapToolRailProps {
  visible: boolean;
  locale: RadarLocale;
  activeCity: CityId;
  selectedHood: EvaluatedNeighborhood;
  evaluatedNeighborhoods: EvaluatedNeighborhood[];
  targetSqm: number;
  mapLens: 'budget' | 'bubble' | 'air' | 'traffic' | 'heatmap';
  setMapLens: (l: 'budget' | 'bubble' | 'air' | 'traffic' | 'heatmap') => void;
  mapTileStyle: MapTileServerId;
  setMapTileStyle: React.Dispatch<React.SetStateAction<MapTileServerId>>;
  mode: 'rent' | 'buy';
  hasFilterApplied: boolean;
  openPanel: MapContextPanelId;
  onChangeOpenPanel: React.Dispatch<React.SetStateAction<MapContextPanelId>>;
  showSpatialTools: boolean;
  onChangeShowSpatialTools: React.Dispatch<React.SetStateAction<boolean>>;
  onCloseCompetingPanels?: () => void;
  onToggleFilterPopover: () => void;
  onLocateNearestHood: () => void;
  onOpenCompareModal: () => void;
  onOpenPriceTrendModal: () => void;
  onOpenInspectorDrawer: () => void;
  onRestoreSavedView: (view: SavedMapViewItem) => void;
  onSelectNeighborhood?: (hood: EvaluatedNeighborhood) => void;
  statusFilter: 'all' | 'green' | 'yellow' | 'red';
  setStatusFilter: React.Dispatch<React.SetStateAction<'all' | 'green' | 'yellow' | 'red'>>;
}

const LENS_BUTTONS: { id: MapToolRailProps['mapLens']; labelFa: string; labelEn: string }[] = [
  { id: 'budget', labelFa: 'بودجه من', labelEn: 'My Budget' },
  { id: 'heatmap', labelFa: 'هیت‌مپ قیمت', labelEn: 'Price Heatmap' },
  { id: 'bubble', labelFa: 'حباب قیمت', labelEn: 'Price Bubble' },
  { id: 'air', labelFa: 'کیفیت هوا', labelEn: 'Air Quality' },
  { id: 'traffic', labelFa: 'ترافیک', labelEn: 'Traffic' },
];

const METRO_OVERLAY_TITLES: Record<CityId, { fa: string; en: string }> = {
  tehran: { fa: 'خطوط و ایستگاه‌های مترو تهران', en: 'Tehran Metro Network' },
  karaj: { fa: 'خطوط قطار شهری کرج', en: 'Karaj Urban Rail Network' },
  mashhad: { fa: 'خطوط قطار شهری مشهد', en: 'Mashhad Urban Rail Network' },
  isfahan: { fa: 'خطوط مترو اصفهان', en: 'Isfahan Metro Network' },
  shiraz: { fa: 'خطوط مترو شیراز', en: 'Shiraz Metro Network' },
};

const TRAFFIC_OVERLAY_TITLES_EN: Record<CityId, string> = {
  tehran: 'Tehran Traffic Restriction Zones',
  karaj: 'Karaj Central Traffic Ring',
  mashhad: 'Mashhad Central Traffic Zone',
  isfahan: 'Isfahan Central Traffic Zone',
  shiraz: 'Shiraz Central Traffic Ring',
};

export const MapToolRail: React.FC<MapToolRailProps> = (p) => {
  const isEn = p.locale === 'en';
  const [areaUnit] = useAreaUnit();
  const [intlCurrency] = useIntlCurrency();
  const rateState = useExchangeRateSnapshot();
  const [savedViews, setSavedViews] = useState<SavedMapViewItem[]>(() => readSavedMapViews());
  const [customViewLabel, setCustomViewLabel] = useState('');
  const { showMetroLines, showTrafficZones, comparisonArc, filterRankingByViewport, viewportBounds } = useMapAdvancedOverlayState();
  const spatialState = useInteractiveSpatialMeasureState();
  const isSpatialInteractive = spatialState.mode === 'measure' || spatialState.mode === 'draw';

  const railRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const sync = () => setSavedViews(readSavedMapViews());
    window.addEventListener('radar-saved-views-updated', sync);
    return () => window.removeEventListener('radar-saved-views-updated', sync);
  }, []);

  useEffect(() => {
    if (!p.openPanel && !p.showSpatialTools) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        p.onChangeOpenPanel(null);
        p.onChangeShowSpatialTools(false);
        setInteractiveSpatialMode('explore', { preservePoints: false });
      }
    };
    const onMouseDown = (e: MouseEvent) => {
      if (railRef.current && !railRef.current.contains(e.target as Node)) {
        p.onChangeOpenPanel(null);
        if (!isSpatialInteractive) p.onChangeShowSpatialTools(false);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onMouseDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onMouseDown);
    };
  }, [p.openPanel, p.showSpatialTools, p.onChangeOpenPanel, p.onChangeShowSpatialTools, isSpatialInteractive]);

  if (!p.visible || !p.selectedHood) return null;

  const snap = {
    openPanel: p.openPanel,
    activeLens: p.mapLens,
    showMetroLines,
    showTrafficZones,
    hasFilterApplied: p.hasFilterApplied,
    isComparing: Boolean(comparisonArc.active),
    hasSavedViews: savedViews.length > 0,
    showSpatialTools: p.showSpatialTools,
    isSpatialMeasuring: isSpatialInteractive || spatialState.points.length > 0,
  };

  const stateClass = (toolId: Parameters<typeof resolveMapToolVisualState>[0]) => {
    const st = resolveMapToolVisualState(toolId, snap);
    if (st === 'open') return 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-transparent shadow-md';
    if (st === 'active') return 'bg-emerald-50 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700';
    return 'bg-white/95 dark:bg-slate-900/95 text-slate-700 dark:text-slate-200 border-slate-200/90 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800';
  };

  const handleToggleRailPanel = (target: 'layers' | 'filters' | 'analysis' | 'save_view') => {
    p.onCloseCompetingPanels?.();
    p.onChangeShowSpatialTools(false);
    setInteractiveSpatialMode('explore', { preservePoints: true });
    p.onChangeOpenPanel((c) => toggleMapContextPanel(c, target));
  };

  const handleToggleMeasureTool = () => {
    if (p.showSpatialTools && !p.openPanel) {
      p.onChangeShowSpatialTools(false);
      setInteractiveSpatialMode('explore', { preservePoints: false });
      return;
    }
    p.onCloseCompetingPanels?.();
    p.onChangeOpenPanel(null);
    p.onChangeShowSpatialTools(true);
    setInteractiveSpatialMode('measure', { preservePoints: true });
  };

  const handleSaveView = (e: React.FormEvent) => {
    e.preventDefault();
    const label = customViewLabel.trim() || `${p.selectedHood.name} · ${LENS_BUTTONS.find((l) => l.id === p.mapLens)?.labelFa || p.mapLens}`;
    const updated = saveCurrentMapView({
      label,
      cityId: p.activeCity,
      hoodId: p.selectedHood.id,
      hoodName: p.selectedHood.name,
      lens: p.mapLens,
      mode: p.mode,
    });
    setSavedViews(updated);
    setCustomViewLabel('');
  };

  const safeTargetSqm = Math.max(25, p.targetSqm || 80);
  const scaledRahn = Math.round(p.selectedHood.rahn80m * (safeTargetSqm / 80));
  const unitBuy = convertPricePerSqmToUnit(p.selectedHood.buyPerSqm, areaUnit);
  const unitBuyRaw = convertPricePerSqmToUnitRaw(p.selectedHood.buyPerSqm, areaUnit);
  const areaUnitSuffix = areaUnit === 'sqft' ? 'فوت مربع (ft²)' : 'مترمربع';
  const buyValueText =
    intlCurrency !== 'IRT'
      ? `${formatMillionTomanAsIntlCurrency(unitBuyRaw, intlCurrency, p.locale, rateState.snapshot)} / ${areaUnitSuffix}`
      : `${toPersianNum(unitBuy)} میلیون تومان / ${areaUnitSuffix}`;
  const rahnValueText =
    intlCurrency !== 'IRT'
      ? formatMillionTomanAsIntlCurrency(scaledRahn, intlCurrency, p.locale, rateState.snapshot)
      : `${toPersianNum(scaledRahn)} میلیون تومان`;
  const metroLabel = isEn
    ? (METRO_OVERLAY_TITLES[p.activeCity]?.en || 'Urban Metro Network')
    : (METRO_OVERLAY_TITLES[p.activeCity]?.fa || 'خطوط و ایستگاه‌های مترو');
  const trafficLabel = isEn
    ? (TRAFFIC_OVERLAY_TITLES_EN[p.activeCity] || 'Traffic Restriction Zones')
    : (CITY_TRAFFIC_ZONES[p.activeCity]?.titleFa || 'محدوده طرح ترافیک');

  return (
    <div ref={railRef} data-testid="map-tool-rail" className={`fixed left-3 top-[164px] sm:top-[160px] lg:top-[124px] ${p.openPanel || p.showSpatialTools ? 'z-[40]' : 'z-20'} flex flex-row-reverse items-start gap-2 pointer-events-none`}>
      {/* Vertical Map Tool Rail (48px width, 40px tools, 8px vertical gap) */}
      <div role="toolbar" aria-label={isEn ? 'Map Tools' : 'ابزارهای تعاملی نقشه'} className="pointer-events-auto w-12 flex flex-col items-center gap-2 apple-vibrancy-bar p-1 rounded-[12px] border border-slate-200/80 dark:border-slate-700/80 shadow-lg">
        <button type="button" onClick={() => handleToggleRailPanel('layers')} aria-expanded={p.openPanel === 'layers'} title={isEn ? 'Map Layers' : 'لایه‌های نقشه'} className={`w-10 h-10 rounded-[8px] border flex flex-col items-center justify-center gap-0.5 transition cursor-pointer ${stateClass('layers')}`}>
          <Layers className="w-4 h-4" aria-hidden="true" />
          <span className="text-[9px] font-bold leading-none">{isEn ? 'Layers' : 'لایه‌ها'}</span>
        </button>
        <button type="button" onClick={() => handleToggleRailPanel('filters')} aria-expanded={p.openPanel === 'filters'} title={isEn ? 'Map filters' : 'فیلتر نقشه'} className={`w-10 h-10 rounded-[8px] border flex flex-col items-center justify-center gap-0.5 transition cursor-pointer ${stateClass('filters')}`}>
          <SlidersHorizontal className="w-4 h-4" aria-hidden="true" />
          <span className="text-[9px] font-bold leading-none">{isEn ? 'Filter' : 'فیلتر'}</span>
        </button>
        <button type="button" data-testid="map-tool-measure-btn" onClick={handleToggleMeasureTool} aria-expanded={p.showSpatialTools && !p.openPanel} title={isEn ? 'Geodesic Ruler & Draw' : 'خط‌کش ژئودزیک و ترسیم محدوده'} className={`w-10 h-10 rounded-[8px] border flex flex-col items-center justify-center gap-0.5 transition cursor-pointer ${stateClass('measure')}`}>
          <Ruler className="w-4 h-4" aria-hidden="true" />
          <span className="text-[9px] font-bold leading-none">{isEn ? 'Ruler' : 'خط‌کش'}</span>
        </button>
        <button type="button" onClick={() => handleToggleRailPanel('analysis')} aria-expanded={p.openPanel === 'analysis'} title={isEn ? 'Area Analytics' : 'تحلیل محله'} className={`w-10 h-10 rounded-[8px] border flex flex-col items-center justify-center gap-0.5 transition cursor-pointer ${stateClass('analysis')}`}>
          <LineChart className="w-4 h-4" aria-hidden="true" />
          <span className="text-[9px] font-bold leading-none">{isEn ? 'Stats' : 'تحلیل'}</span>
        </button>
        <button type="button" onClick={() => { p.onCloseCompetingPanels?.(); p.onChangeOpenPanel(null); p.onChangeShowSpatialTools(false); p.onLocateNearestHood(); }} title={isEn ? 'Locate Nearest Area' : 'موقعیت من'} className={`w-10 h-10 rounded-[8px] border flex flex-col items-center justify-center gap-0.5 transition cursor-pointer ${stateClass('locate')}`}>
          <Navigation className="w-4 h-4" aria-hidden="true" />
          <span className="text-[9px] font-bold leading-none">{isEn ? 'Near' : 'موقعیت'}</span>
        </button>
        <button type="button" onClick={() => { p.onCloseCompetingPanels?.(); p.onChangeOpenPanel(null); p.onChangeShowSpatialTools(false); p.onOpenCompareModal(); }} title={isEn ? 'Compare Areas' : 'مقایسه روی نقشه'} className={`w-10 h-10 rounded-[8px] border flex flex-col items-center justify-center gap-0.5 transition cursor-pointer ${stateClass('compare')}`}>
          <ArrowLeftRight className="w-4 h-4" aria-hidden="true" />
          <span className="text-[9px] font-bold leading-none">{isEn ? 'Cmp' : 'مقایسه'}</span>
        </button>
        <button type="button" onClick={() => handleToggleRailPanel('save_view')} aria-expanded={p.openPanel === 'save_view'} title={isEn ? 'Saved Map Views' : 'ذخیره نمای نقشه'} className={`w-10 h-10 rounded-[8px] border flex flex-col items-center justify-center gap-0.5 transition cursor-pointer ${stateClass('save_view')}`}>
          <Bookmark className="w-4 h-4" aria-hidden="true" />
          <span className="text-[9px] font-bold leading-none">{isEn ? 'Save' : 'نمای من'}</span>
        </button>
      </div>

      {/* Single Context Panel (Closing panel keeps active layers/lenses intact) */}
      {p.openPanel === 'filters' && (
        <div role="dialog" aria-label={isEn ? 'Map filters' : 'فیلترهای نقشه'} className="pointer-events-auto w-64 max-w-[calc(100vw-5.25rem)] max-h-[calc(100dvh-15rem)] lg:max-h-[calc(100dvh-10rem)] overflow-y-auto rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl shadow-2xl p-3 space-y-2.5 text-xs">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
            <span className="font-black text-slate-900 dark:text-white">{isEn ? 'Explorer filters' : 'فیلتر کاوشگر نقشه'}</span>
            <button type="button" onClick={() => p.onChangeOpenPanel(null)} aria-label="بستن پنل فیلتر" className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"><X className="w-3.5 h-3.5" /></button>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {(['all', 'green', 'yellow', 'red'] as const).map((st) => (
              <button
                key={st}
                type="button"
                aria-pressed={p.statusFilter === st}
                onClick={() => p.setStatusFilter(st)}
                className={`py-1.5 rounded-lg border font-bold text-[11px] cursor-pointer ${p.statusFilter === st ? 'bg-[var(--color-brand-600)] text-white border-transparent' : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
              >
                {st === 'all' ? (isEn ? 'All' : 'همه') : st === 'green' ? (isEn ? 'Within budget' : 'سبز') : st === 'yellow' ? (isEn ? 'Stretch' : 'زرد') : (isEn ? 'Over' : 'قرمز')}
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={!viewportBounds}
            aria-pressed={filterRankingByViewport}
            onClick={() => updateMapAdvancedOverlayState({ filterRankingByViewport: !filterRankingByViewport })}
            className={`w-full py-2 rounded-lg border font-bold text-[11px] ${!viewportBounds ? 'opacity-50 cursor-not-allowed' : filterRankingByViewport ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900' : 'border-slate-200 dark:border-slate-700'}`}
          >
            {isEn ? 'Match map viewport' : 'محدود به کادر نقشه'}
          </button>
          <button type="button" onClick={() => { p.onToggleFilterPopover(); p.onChangeOpenPanel(null); }} className="w-full py-2 rounded-lg border border-[var(--color-brand-600)]/40 text-[var(--color-brand-600)] font-bold">
            {isEn ? 'Budget & advanced filters…' : 'بودجه و فیلترهای پیشرفته…'}
          </button>
        </div>
      )}

      {p.openPanel === 'layers' && (
        <div role="dialog" aria-label={isEn ? 'Map Layers & Overlays' : 'لایه‌ها و نمای نقشه'} className="pointer-events-auto w-64 max-w-[calc(100vw-5.25rem)] max-h-[calc(100dvh-15rem)] lg:max-h-[calc(100dvh-10rem)] overflow-y-auto rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl shadow-2xl p-3 space-y-2.5 text-xs">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
            <span className="font-black text-slate-900 dark:text-white">{isEn ? 'Urban GIS Overlays' : 'لایه‌های زیرساخت شهری'}</span>
            <button type="button" onClick={() => p.onChangeOpenPanel(null)} aria-label="بستن پنل لایه‌ها" className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"><X className="w-3.5 h-3.5" /></button>
          </div>
          <div className="space-y-1.5">
            <button type="button" aria-pressed={showMetroLines} onClick={() => updateMapAdvancedOverlayState({ showMetroLines: !showMetroLines })} className={`w-full px-2.5 py-2 rounded-lg border text-start font-bold cursor-pointer transition flex items-center justify-between gap-1.5 ${showMetroLines ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-transparent' : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>
              <span className="flex items-center gap-1.5 min-w-0"><TrainFront className="w-3.5 h-3.5 shrink-0" aria-hidden="true" /><span className="truncate">{metroLabel}</span></span>
              {showMetroLines && <Check className="w-3.5 h-3.5 shrink-0" />}
            </button>
            <button type="button" aria-pressed={showTrafficZones} onClick={() => updateMapAdvancedOverlayState({ showTrafficZones: !showTrafficZones })} className={`w-full px-2.5 py-2 rounded-lg border text-start font-bold cursor-pointer transition flex items-center justify-between gap-1.5 ${showTrafficZones ? 'bg-rose-600 text-white border-transparent' : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>
              <span className="flex items-center gap-1.5 min-w-0"><TrafficCone className="w-3.5 h-3.5 shrink-0" aria-hidden="true" /><span className="truncate">{trafficLabel}</span></span>
              {showTrafficZones && <Check className="w-3.5 h-3.5 shrink-0" />}
            </button>
          </div>
        </div>
      )}

      {p.openPanel === 'analysis' && (
        <div role="dialog" aria-label={isEn ? 'Spatial Analytics Panel' : 'تحلیل سریع محدوده'} className="pointer-events-auto w-64 max-w-[calc(100vw-5.25rem)] max-h-[calc(100dvh-15rem)] lg:max-h-[calc(100dvh-10rem)] overflow-y-auto rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl shadow-2xl p-3 space-y-2.5 text-xs">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
            <span className="font-black text-slate-900 dark:text-white">محله {p.selectedHood.name}</span>
            <button type="button" onClick={() => p.onChangeOpenPanel(null)} aria-label="بستن پنل تحلیل" className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"><X className="w-3.5 h-3.5" /></button>
          </div>
          <div className="text-[11px] text-slate-600 dark:text-slate-300 space-y-1 tabular-nums">
            <div>امتیاز کل: <strong className="text-[var(--color-brand-600)]">{toPersianNum(p.selectedHood.overallScore)}/۱۰</strong></div>
            <div>مرجع خرید: <strong>{buyValueText}</strong></div>
            <div>رهن کامل برآوردی ({formatAreaShort(safeTargetSqm, areaUnit)}): <strong>{rahnValueText}</strong></div>
          </div>
          <div className="grid grid-cols-1 gap-1.5 pt-1">
            <button type="button" onClick={() => { p.onOpenInspectorDrawer(); p.onChangeOpenPanel(null); }} className="lg:hidden w-full py-1.5 rounded-lg bg-[var(--color-brand-600)] hover:bg-[var(--color-brand-700)] text-white font-bold cursor-pointer">
              باز کردن کارنامه کامل محله
            </button>
            <button type="button" onClick={() => { p.onOpenPriceTrendModal(); p.onChangeOpenPanel(null); }} className="w-full py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 font-bold cursor-pointer">
              نمودار روند تاریخی قیمت
            </button>
            <button type="button" data-testid="open-spatial-tools-btn" onClick={() => { p.onCloseCompetingPanels?.(); p.onChangeOpenPanel(null); p.onChangeShowSpatialTools(true); }} className="w-full py-1.5 rounded-lg border border-[var(--color-brand-600)]/40 bg-[var(--color-bg-muted)] dark:bg-slate-800 text-[var(--color-brand-600)] dark:text-emerald-300 font-bold cursor-pointer">
              ترسیم، اندازه‌گیری و راهنمای لایه
            </button>
          </div>
        </div>
      )}

      {p.showSpatialTools && !p.openPanel && (
        <MapSpatialToolsPopover
          selectedHood={p.selectedHood}
          evaluatedNeighborhoods={p.evaluatedNeighborhoods}
          onSelectNeighborhood={p.onSelectNeighborhood}
          onClose={() => {
            setInteractiveSpatialMode('explore', { preservePoints: false });
            p.onChangeShowSpatialTools(false);
          }}
        />
      )}

      {p.openPanel === 'save_view' && (
        <div role="dialog" aria-label={isEn ? 'Saved Map Views' : 'نماهای ذخیره‌شده نقشه'} className="pointer-events-auto w-68 max-w-[calc(100vw-5.25rem)] max-h-[calc(100dvh-15rem)] lg:max-h-[calc(100dvh-10rem)] overflow-y-auto rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl shadow-2xl p-3 space-y-2.5 text-xs">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
            <span className="font-black text-slate-900 dark:text-white">{isEn ? 'Saved Views' : 'ذخیره و بازیابی نمای نقشه'}</span>
            <button type="button" onClick={() => p.onChangeOpenPanel(null)} aria-label="بستن پنل نماها" className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"><X className="w-3.5 h-3.5" /></button>
          </div>
          <form onSubmit={handleSaveView} className="flex gap-1.5">
            <input type="text" value={customViewLabel} onChange={(e) => setCustomViewLabel(e.target.value)} placeholder={`مثلاً: رصد ${p.selectedHood.name}...`} className="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs focus:outline-none focus:border-emerald-600" />
            <button type="submit" className="px-2.5 py-1.5 rounded-lg bg-[var(--color-brand-600)] text-white font-bold cursor-pointer shrink-0">ذخیره</button>
          </form>
          {savedViews.length === 0 ? (
            <p className="text-[11px] text-slate-400 text-center py-2">هنوز نمایی ذخیره نشده است.</p>
          ) : (
            <div className="space-y-1 max-h-44 overflow-y-auto">
              {savedViews.map((v) => (
                <div key={v.id} className="flex items-center justify-between gap-1.5 p-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/70">
                  <button type="button" onClick={() => { p.onRestoreSavedView(v); p.onChangeOpenPanel(null); }} className="text-start flex-1 min-w-0 cursor-pointer">
                    <div className="font-bold text-slate-800 dark:text-slate-100 truncate">{v.label}</div>
                    <div className="text-[10px] text-slate-400">{v.hoodName} · {v.mode === 'rent' ? 'رهن/اجاره' : 'خرید'}</div>
                  </button>
                  <button type="button" onClick={() => setSavedViews(deleteSavedMapView(v.id))} aria-label="حذف نما" className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

