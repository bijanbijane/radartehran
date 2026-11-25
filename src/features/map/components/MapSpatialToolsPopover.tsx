/**
 * @file src/features/map/components/MapSpatialToolsPopover.tsx
 * @description Stage 15 (RT-UI-MAP-001) & Stage 16 (RT-UI-LAYERS-001) Interactive Spatial Tools & Layer Catalog Panel.
 */
import React, { useState, useMemo, useEffect } from 'react';
import { Ruler, PenTool, ShieldAlert, CheckCircle2, X, Layers, Eye, EyeOff, Trash2, Info, Undo2, Car, Footprints, MapPin } from 'lucide-react';
import { toPersianNum, type EvaluatedNeighborhood } from '../../../data/neighborhoods';
import { activateMapToolbarMode, buildDynamicLayerLegend, computeGeodesicMeasurement, validateDrawnPolygonWGS84 } from '../services/mapExperienceEngine';
import { CENTRAL_LAYER_METADATA_REGISTRY, getPublicCatalogLayers, manageActiveLayerStack, type ActiveLayerStackItem } from '../services/layerManagementRegistry';
import type { GeoPointWGS84 } from '../types/map.types';
import {
  clearInteractiveSpatialPoints,
  estimateTravelTimesFromMeters,
  findNeighborhoodsInsidePolygon,
  setInteractiveMeasureKind,
  setInteractiveSpatialMode,
  setInteractiveSpatialPoints,
  undoInteractiveSpatialPoint,
  useInteractiveSpatialMeasureState,
} from '../../../components/map/interactiveSpatialMeasureLayer';

export interface MapSpatialToolsPopoverProps {
  selectedHood: EvaluatedNeighborhood;
  evaluatedNeighborhoods: readonly EvaluatedNeighborhood[];
  onSelectNeighborhood?: (hood: EvaluatedNeighborhood) => void;
  onClose: () => void;
}

const SAMPLE_VALID_POLYGON: GeoPointWGS84[] = [
  { lat: 35.755, lng: 51.405 }, { lat: 35.765, lng: 51.425 }, { lat: 35.748, lng: 51.432 }, { lat: 35.742, lng: 51.410 },
];
const SAMPLE_SELF_INTERSECTING_POLYGON: GeoPointWGS84[] = [
  { lat: 35.750, lng: 51.400 }, { lat: 35.770, lng: 51.430 }, { lat: 35.770, lng: 51.400 }, { lat: 35.750, lng: 51.430 },
];

export const MapSpatialToolsPopover: React.FC<MapSpatialToolsPopoverProps> = (p) => {
  const [panelTab, setPanelTab] = useState<'tools_15' | 'catalog_16'>('tools_15');
  const spatial = useInteractiveSpatialMeasureState();
  const [catalogView, setCatalogView] = useState<'all' | 'active'>('all');
  const [layerQuery, setLayerQuery] = useState('');
  const [selectedDetailsLayerId, setSelectedDetailsLayerId] = useState<string | null>(null);
  const [activeStack, setActiveStack] = useState<ActiveLayerStackItem[]>([
    { layerId: 'base.light', visible: true, opacity: 100, zOrder: 1 },
    { layerId: 'boundary.neighborhoods', visible: true, opacity: 100, zOrder: 4 },
    { layerId: 'market.price', visible: true, opacity: 90, zOrder: 3 },
  ]);
  const [compatibilityMsg, setCompatibilityMsg] = useState<string | null>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setInteractiveSpatialMode('explore', { preservePoints: false });
        p.onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [p.onClose]);

  const activeMode = spatial.mode;
  const measureKind = spatial.measureKind;
  const points = spatial.points;
  const modeState = useMemo(() => activateMapToolbarMode('explore', activeMode), [activeMode]);
  const polygonCheck = useMemo(() => validateDrawnPolygonWGS84(points), [points]);
  const polygonMatch = useMemo(() => findNeighborhoodsInsidePolygon(points, p.evaluatedNeighborhoods), [points, p.evaluatedNeighborhoods]);
  const measurement = useMemo(() => computeGeodesicMeasurement(measureKind, points), [measureKind, points]);
  const travelTimes = useMemo(() => estimateTravelTimesFromMeters(measurement.rawValueMetersOrSqm), [measurement.rawValueMetersOrSqm]);
  const publicLayers = useMemo(() => getPublicCatalogLayers(layerQuery), [layerQuery]);
  const legendSpec = useMemo(() => buildDynamicLayerLegend('property_asking_price', p.evaluatedNeighborhoods), [p.evaluatedNeighborhoods]);
  const inspectedLayer = useMemo(() => CENTRAL_LAYER_METADATA_REGISTRY.find((l) => l.id === selectedDetailsLayerId) || null, [selectedDetailsLayerId]);

  const dispatchStackAction = (action: Parameters<typeof manageActiveLayerStack>[1]) => {
    const res = manageActiveLayerStack(activeStack, action);
    setActiveStack(res.nextStack);
    setCompatibilityMsg(res.warningFa);
  };

  const handleClose = () => {
    setInteractiveSpatialMode('explore', { preservePoints: false });
    p.onClose();
  };

  return (
    <div
      role="dialog" aria-label="ابزارهای ترسیم، اندازه‌گیری و کاتالوگ لایه‌های نقشه"
      data-testid="map-spatial-tools-popover"
      className="pointer-events-auto w-80 sm:w-88 max-w-[calc(100vw-5.25rem)] rounded-2xl border border-[#DCE3DF] dark:border-[var(--color-border-strong)] bg-white/95 dark:bg-[var(--color-bg-surface)] backdrop-blur-xl shadow-2xl p-3.5 space-y-3 text-xs max-h-[calc(100dvh-15rem)] lg:max-h-[calc(100dvh-10rem)] overflow-y-auto"
    >
      <div className="flex items-center justify-between border-b border-slate-100 dark:border-[var(--color-border-subtle)] pb-2">
        <div role="tablist" aria-label="تب‌های ابزار مکانی و کاتالوگ لایه" className="flex items-center gap-1">
          <button type="button" role="tab" aria-selected={panelTab === 'tools_15'} data-testid="spatial-tab-tools-15" onClick={() => setPanelTab('tools_15')} className={`px-2.5 py-1 rounded-[8px] font-bold cursor-pointer ${panelTab === 'tools_15' ? 'bg-[var(--color-brand-600)] text-white' : 'text-[#34433E] dark:text-[var(--color-text-secondary)]'}`}>ابزار نقشه</button>
          <button type="button" role="tab" aria-selected={panelTab === 'catalog_16'} data-testid="spatial-tab-catalog-16" onClick={() => setPanelTab('catalog_16')} className={`px-2.5 py-1 rounded-[8px] font-bold cursor-pointer ${panelTab === 'catalog_16' ? 'bg-[var(--color-brand-600)] text-white' : 'text-[#34433E] dark:text-[var(--color-text-secondary)]'}`}>کاتالوگ لایه‌ها</button>
        </div>
        <button type="button" onClick={handleClose} aria-label="بستن پنل ابزار مکانی" className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-[var(--color-bg-elevated)] cursor-pointer"><X className="w-3.5 h-3.5" /></button>
      </div>

      {panelTab === 'tools_15' ? (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[10.5px] font-bold text-slate-500">
              <span>حالت فعال بوم نقشه:</span>
              {points.length > 0 && <span className="tabular-nums text-emerald-700 dark:text-emerald-400">{toPersianNum(points.length)} نقطه ثبت‌شده</span>}
            </div>
            <div role="group" aria-label="انتخاب حالت ابزار نقشه" className="grid grid-cols-3 gap-1">
              {([{ id: 'explore', label: 'کاوش' }, { id: 'draw', label: 'ترسیم محدوده' }, { id: 'measure', label: 'اندازه‌گیری' }] as const).map((m) => (
                <button
                  key={m.id} type="button" data-testid={`map-mode-btn-${m.id}`} aria-pressed={activeMode === m.id}
                  onClick={() => setInteractiveSpatialMode(m.id, { preservePoints: m.id !== 'explore' })}
                  className={`py-1.5 rounded-[8px] font-bold border transition cursor-pointer ${activeMode === m.id ? 'bg-[var(--color-brand-600)] text-white border-[var(--color-brand-600)]' : 'border-[#DCE3DF] dark:border-[var(--color-border-strong)] text-[#182522] dark:text-[var(--color-text-primary)]'}`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <p className="text-[10.5px] text-[#34433E] dark:text-[var(--color-text-secondary)] bg-[#F6F8F6] dark:bg-[var(--color-bg-muted)] p-2 rounded-[8px]" data-testid="map-mode-cursor-hint">
              {activeMode === 'measure'
                ? 'روی هر نقطه یا برچسب محله روی نقشه کلیک کنید تا خط‌کش ژئودزیک و زمان تقریبی پیاده/خودرو محاسبه شود.'
                : activeMode === 'draw'
                  ? 'حداقل ۳ نقطه روی نقشه کلیک کنید تا چندضلعی محدوده بسته شود و محله‌های داخل آن شناسایی شوند.'
                  : modeState.cursorHintFa}
            </p>
            {(activeMode === 'draw' || activeMode === 'measure') && (
              <div className="flex items-center gap-1.5">
                <button type="button" data-testid="spatial-undo-btn" disabled={points.length === 0} onClick={undoInteractiveSpatialPoint} className="flex-1 inline-flex items-center justify-center gap-1 py-1.5 px-2 rounded-[8px] border border-slate-200 dark:border-[var(--color-border-strong)] bg-white dark:bg-[var(--color-bg-surface)] font-bold text-[11px] text-slate-700 dark:text-[var(--color-text-primary)] hover:bg-slate-50 dark:hover:bg-[var(--color-bg-elevated)] disabled:opacity-45 cursor-pointer disabled:cursor-not-allowed"><Undo2 className="w-3.5 h-3.5" /><span>برگشت</span></button>
                <button type="button" data-testid="spatial-clear-btn" disabled={points.length === 0} onClick={clearInteractiveSpatialPoints} className="flex-1 inline-flex items-center justify-center gap-1 py-1.5 px-2 rounded-[8px] border border-rose-200 dark:border-rose-900/70 bg-rose-50/70 dark:bg-rose-950/40 font-bold text-[11px] text-rose-700 dark:text-rose-300 hover:bg-rose-100/70 disabled:opacity-45 cursor-pointer disabled:cursor-not-allowed"><Trash2 className="w-3.5 h-3.5" /><span>پاکسازی</span></button>
              </div>
            )}
          </div>

          {activeMode === 'draw' && (
            <div className="p-2.5 rounded-[10px] border border-[#DCE3DF] dark:border-[var(--color-border-strong)] bg-[#F6F8F6] dark:bg-[var(--color-bg-muted)] space-y-2" data-testid="map-draw-validator-box">
              <div className="flex items-center justify-between font-bold text-[#182522] dark:text-white">
                <span className="flex items-center gap-1"><PenTool className="w-3.5 h-3.5 text-[var(--color-brand-600)]" /> محدوده ترسیمی WGS84</span>
                <div className="flex gap-1 text-[10px]">
                  <button type="button" onClick={() => setInteractiveSpatialPoints(SAMPLE_VALID_POLYGON)} className="px-1.5 py-0.5 rounded bg-white dark:bg-[var(--color-bg-surface)] border border-slate-200 dark:border-[var(--color-border-strong)] cursor-pointer">نمونه معتبر</button>
                  <button type="button" onClick={() => setInteractiveSpatialPoints(SAMPLE_SELF_INTERSECTING_POLYGON)} className="px-1.5 py-0.5 rounded bg-white dark:bg-[var(--color-bg-surface)] border border-slate-200 dark:border-[var(--color-border-strong)] cursor-pointer">خودمتقاطع</button>
                </div>
              </div>
              {points.length < 3 ? (
                <div className="text-[11px] text-slate-600 dark:text-[var(--color-text-secondary)]">
                  {points.length === 0 ? 'برای شروع، روی نقشه کلیک کنید (حداقل ۳ نقطه).' : `${toPersianNum(points.length)} از ۳ نقطه ثبت شد — ادامه دهید.`}
                </div>
              ) : polygonCheck.valid ? (
                <div className="space-y-2">
                  <div className="text-[11px] text-emerald-700 dark:text-emerald-300 flex items-center gap-1 font-bold tabular-nums">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    <span>چندضلعی معتبر ({toPersianNum(polygonCheck.vertexCount)} نقطه · {toPersianNum(polygonCheck.areaSqKm)} کیلومتر مربع)</span>
                  </div>
                  <div data-testid="polygon-matched-hoods" className="p-2 rounded-lg bg-white dark:bg-[var(--color-bg-surface)] border border-slate-200 dark:border-[var(--color-border-strong)] space-y-1.5">
                    <div className="flex items-center justify-between text-[10.5px] font-bold text-slate-800 dark:text-[var(--color-text-primary)] tabular-nums">
                      <span>محله‌های داخل محدوده: {toPersianNum(polygonMatch.matched.length)}</span>
                      {polygonMatch.avgBuyPerSqm !== null && (
                        <span className="text-emerald-700 dark:text-emerald-400">میانگین {toPersianNum(polygonMatch.avgBuyPerSqm)} م/م²</span>
                      )}
                    </div>
                    {polygonMatch.matched.length > 0 ? (
                      <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                        {polygonMatch.matched.map((hood) => (
                          <button
                            key={hood.id} type="button"
                            onClick={() => { setInteractiveSpatialMode('explore', { preservePoints: true }); p.onSelectNeighborhood?.(hood); }}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800 text-[10.5px] font-bold hover:bg-emerald-100 cursor-pointer"
                          >
                            <MapPin className="w-3 h-3 shrink-0" /><span>{hood.name}</span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="text-[10.5px] text-slate-500">محله‌ای داخل این محدوده نیست؛ نقاط را گسترده‌تر بکشید.</div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-[11px] text-rose-700 dark:text-rose-300 flex items-start gap-1">
                  <ShieldAlert className="w-3.5 h-3.5 shrink-0 mt-0.5" /> <span>{polygonCheck.errorMessageFa}</span>
                </div>
              )}
            </div>
          )}

          {activeMode === 'measure' && (
            <div className="p-2.5 rounded-[10px] border border-[#DCE3DF] dark:border-[var(--color-border-strong)] bg-[#F6F8F6] dark:bg-[var(--color-bg-muted)] space-y-2" data-testid="map-measure-box">
              <div className="flex items-center justify-between font-bold text-[#182522] dark:text-white">
                <span className="flex items-center gap-1"><Ruler className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" /> خط‌کش ژئودزیک (WGS84)</span>
                <div className="flex gap-1 text-[10px]">
                  <button type="button" onClick={() => setInteractiveMeasureKind('linear_distance')} className={`px-1.5 py-0.5 rounded cursor-pointer ${measureKind === 'linear_distance' ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-[var(--color-bg-surface)]'}`}>فاصله خطی</button>
                  <button type="button" onClick={() => setInteractiveMeasureKind('area')} className={`px-1.5 py-0.5 rounded cursor-pointer ${measureKind === 'area' ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-[var(--color-bg-surface)]'}`}>مساحت</button>
                </div>
              </div>
              {points.length < (measureKind === 'area' ? 3 : 2) ? (
                <div className="text-[11px] text-slate-600 dark:text-[var(--color-text-secondary)]">
                  {measureKind === 'area' ? 'حداقل ۳ نقطه روی نقشه کلیک کنید تا مساحت محاسبه شود.' : 'روی ۲ یا چند نقطه روی نقشه کلیک کنید تا فاصله دقیق محاسبه شود.'}
                </div>
              ) : (
                <div className="space-y-1.5">
                  <div className="text-sm font-bold text-[#182522] dark:text-white tabular-nums" data-testid="spatial-measure-output">
                    خروجی: {measurement.formattedValueFa}
                  </div>
                  {measureKind === 'linear_distance' && (
                    <div className="flex items-center gap-3 text-[11px] font-bold text-slate-700 dark:text-[var(--color-text-secondary)] tabular-nums" data-testid="spatial-travel-estimates">
                      <span className="inline-flex items-center gap-1"><Footprints className="w-3.5 h-3.5 text-emerald-600" /> پیاده: ~{toPersianNum(travelTimes.walkMinutes)} دقیقه</span>
                      <span className="inline-flex items-center gap-1"><Car className="w-3.5 h-3.5 text-indigo-600" /> خودرو: ~{toPersianNum(travelTimes.driveMinutes)} دقیقه</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="p-2.5 rounded-[8px] bg-[#F6F8F6] dark:bg-[var(--color-bg-muted)] border border-[#DCE3DF] dark:border-[var(--color-border-strong)] space-y-1.5" data-testid="map-dynamic-legend">
            <div className="flex items-center justify-between text-[11px] font-bold text-[#182522] dark:text-white">
              <span>{legendSpec.indicatorTitleFa}</span> <span className="text-[10px] text-slate-500">{legendSpec.unitFa}</span>
            </div>
            <div className="space-y-1">
              {legendSpec.stops.map((st) => (
                <div key={st.labelFa} className="flex items-center justify-between text-[10.5px] text-[#34433E] dark:text-[var(--color-text-secondary)] tabular-nums">
                  <span className="flex items-center gap-1.5"><span style={{ color: st.colorHex }} aria-hidden="true">{st.symbol}</span><span>{st.labelFa}</span></span>
                  <span className="text-[10px] text-slate-400">{legendSpec.periodLabelFa}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-3" data-testid="stage-16-layer-catalog-view">
          <div className="flex items-center gap-1.5">
            <input
              type="text" value={layerQuery} onChange={(e) => setLayerQuery(e.target.value)}
              placeholder="جست‌وجوی لایه اطلاعاتی..." aria-label="جست‌وجوی کاتالوگ لایه‌ها"
              className="flex-1 px-2.5 py-1.5 rounded-[8px] border border-[#DCE3DF] dark:border-[var(--color-border-strong)] bg-[#F6F8F6] dark:bg-[var(--color-bg-muted)] text-xs focus:outline-none focus:border-[var(--color-brand-600)]"
            />
            <button type="button" onClick={() => setCatalogView('all')} className={`px-2 py-1.5 rounded-[8px] font-bold cursor-pointer ${catalogView === 'all' ? 'bg-[#182522] text-white' : 'bg-[#F1F4F2] dark:bg-[var(--color-bg-muted)] text-[#34433E]'}`}>همه ({toPersianNum(publicLayers.length)})</button>
            <button type="button" onClick={() => setCatalogView('active')} className={`px-2 py-1.5 rounded-[8px] font-bold cursor-pointer ${catalogView === 'active' ? 'bg-[var(--color-brand-600)] text-white' : 'bg-[#F1F4F2] dark:bg-[var(--color-bg-muted)] text-[#34433E]'}`}>فعال‌ها ({toPersianNum(activeStack.length)})</button>
          </div>

          {compatibilityMsg && (
            <div className="p-2 rounded-[8px] bg-amber-50 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800 text-[10.5px] font-semibold text-amber-900 dark:text-amber-200" data-testid="stage-16-compatibility-alert">
              {compatibilityMsg}
            </div>
          )}

          {catalogView === 'all' ? (
            <div className="space-y-1.5 max-h-52 overflow-y-auto">
              {publicLayers.map((ly) => {
                const inStack = activeStack.find((s) => s.layerId === ly.id);
                return (
                  <div key={ly.id} className="p-2 rounded-[8px] border border-[#DCE3DF] dark:border-[var(--color-border-subtle)] bg-[#F6F8F6]/70 dark:bg-[var(--color-bg-muted)] flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-bold text-[#182522] dark:text-white truncate">{ly.title}</div>
                      <div className="text-[10px] text-slate-500">{ly.category} · {ly.renderer} · کیفیت: {ly.qualityStatus}</div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button type="button" onClick={() => setSelectedDetailsLayerId(ly.id)} aria-label={`جزئیات لایه ${ly.title}`} className="p-1 rounded hover:bg-slate-200 dark:hover:bg-[var(--color-bg-elevated)] text-slate-500 cursor-pointer"><Info className="w-3.5 h-3.5" /></button>
                      <button
                        type="button" onClick={() => dispatchStackAction(inStack ? { type: 'remove', layerId: ly.id } : { type: 'activate', layerId: ly.id })}
                        className={`px-2 py-1 rounded-[6px] text-[10.5px] font-bold cursor-pointer ${inStack ? 'bg-[var(--color-brand-600)] text-white' : 'bg-white dark:bg-[var(--color-bg-surface)] border border-[#DCE3DF] dark:border-[var(--color-border-strong)] text-[#182522] dark:text-[var(--color-text-primary)]'}`}
                      >
                        {inStack ? 'فعال' : 'افزودن'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-2 max-h-52 overflow-y-auto" data-testid="stage-16-active-stack-list">
              {activeStack.map((item) => {
                const meta = CENTRAL_LAYER_METADATA_REGISTRY.find((l) => l.id === item.layerId);
                if (!meta) return null;
                return (
                  <div key={item.layerId} className="p-2 rounded-[8px] border border-[#DCE3DF] dark:border-[var(--color-border-strong)] bg-white dark:bg-[var(--color-bg-surface)] space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-[#182522] dark:text-white flex items-center gap-1"><Layers className="w-3.5 h-3.5 text-[var(--color-brand-600)]" /><span>{meta.title}</span></span>
                      <div className="flex items-center gap-1">
                        <button type="button" onClick={() => dispatchStackAction({ type: 'mute_toggle', layerId: item.layerId })} aria-label={item.visible ? 'خاموش‌کردن موقت لایه' : 'روشن‌کردن لایه'} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-[var(--color-bg-elevated)] text-slate-600 cursor-pointer">
                          {item.visible ? <Eye className="w-3.5 h-3.5 text-[var(--color-brand-600)]" /> : <EyeOff className="w-3.5 h-3.5 text-slate-400" />}
                        </button>
                        <button type="button" onClick={() => dispatchStackAction({ type: 'remove', layerId: item.layerId })} aria-label="حذف لایه از ترکیب فعال" className="p-1 rounded hover:bg-rose-50 text-slate-400 hover:text-rose-600 cursor-pointer">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-[10.5px] text-slate-500">
                      <span>شفافیت: {toPersianNum(item.opacity)}٪ · ترتیب رندر: #{toPersianNum(item.zOrder)}</span>
                      <input
                        type="range" min={20} max={100} step={10} value={item.opacity} aria-label={`شفافیت لایه ${meta.title}`}
                        onChange={(e) => dispatchStackAction({ type: 'set_opacity', layerId: item.layerId, opacity: Number(e.target.value) })}
                        className="w-24 accent-[var(--color-brand-600)] cursor-pointer"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {inspectedLayer && (
            <div className="p-2.5 rounded-[8px] bg-[#F6F8F6] dark:bg-[var(--color-bg-muted)] border border-[#DCE3DF] dark:border-[var(--color-border-strong)] space-y-1 text-[10.5px]" data-testid="stage-16-layer-details-box">
              <div className="flex items-center justify-between font-bold text-[#182522] dark:text-white">
                <span>مشخصات لایه: {inspectedLayer.title} (v{inspectedLayer.version})</span>
                <button type="button" onClick={() => setSelectedDetailsLayerId(null)} className="text-slate-400 hover:text-slate-700 cursor-pointer">✕</button>
              </div>
              <div>منبع: {inspectedLayer.sourceIds.join(', ')} · مجموعه داده: {inspectedLayer.datasetId}</div>
              <div>بازه زوم مجاز: {toPersianNum(inspectedLayer.minZoom ?? 5)} تا {toPersianNum(inspectedLayer.maxZoom ?? 19)} · به‌روزرسانی: {inspectedLayer.temporal.updatedAt || '—'}</div>
              <div className="text-amber-800 dark:text-amber-300">محدودیت تفسیر: {inspectedLayer.limitations[0]}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
