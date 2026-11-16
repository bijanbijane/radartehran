/**
 * @file src/features/map/components/MapSpatialToolsPopover.tsx
 * @description Stage 15 (RT-UI-MAP-001) & Stage 16 (RT-UI-LAYERS-001) Interactive Spatial Tools & Layer Catalog Panel.
 */
import React, { useState, useMemo } from 'react';
import { Ruler, PenTool, ShieldAlert, CheckCircle2, X, Layers, Eye, EyeOff, Trash2, Info } from 'lucide-react';
import { toPersianNum, type EvaluatedNeighborhood } from '../../../data/neighborhoods';
import { activateMapToolbarMode, buildDynamicLayerLegend, computeGeodesicMeasurement, validateDrawnPolygonWGS84 } from '../services/mapExperienceEngine';
import { CENTRAL_LAYER_METADATA_REGISTRY, getPublicCatalogLayers, manageActiveLayerStack, type ActiveLayerStackItem } from '../services/layerManagementRegistry';
import type { GeoPointWGS84, MapMode, MeasurementToolKind } from '../types/map.types';

export interface MapSpatialToolsPopoverProps {
  selectedHood: EvaluatedNeighborhood;
  evaluatedNeighborhoods: readonly EvaluatedNeighborhood[];
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
  const [activeMode, setActiveMode] = useState<MapMode>('explore');
  const [measureKind, setMeasureKind] = useState<MeasurementToolKind>('linear_distance');
  const [polygonPreset, setPolygonPreset] = useState<'valid' | 'self_intersect'>('valid');
  const [catalogView, setCatalogView] = useState<'all' | 'active'>('all');
  const [layerQuery, setLayerQuery] = useState('');
  const [selectedDetailsLayerId, setSelectedDetailsLayerId] = useState<string | null>(null);
  const [activeStack, setActiveStack] = useState<ActiveLayerStackItem[]>([
    { layerId: 'base.light', visible: true, opacity: 100, zOrder: 1 },
    { layerId: 'boundary.neighborhoods', visible: true, opacity: 100, zOrder: 4 },
    { layerId: 'market.price', visible: true, opacity: 90, zOrder: 3 },
  ]);
  const [compatibilityMsg, setCompatibilityMsg] = useState<string | null>(null);

  const modeState = useMemo(() => activateMapToolbarMode('explore', activeMode), [activeMode]);
  const samplePoints = polygonPreset === 'valid' ? SAMPLE_VALID_POLYGON : SAMPLE_SELF_INTERSECTING_POLYGON;
  const polygonCheck = useMemo(() => validateDrawnPolygonWGS84(samplePoints), [samplePoints]);
  const measurement = useMemo(() => computeGeodesicMeasurement(measureKind, samplePoints), [measureKind, samplePoints]);
  const publicLayers = useMemo(() => getPublicCatalogLayers(layerQuery), [layerQuery]);
  const legendSpec = useMemo(() => buildDynamicLayerLegend('property_asking_price', p.evaluatedNeighborhoods), [p.evaluatedNeighborhoods]);
  const inspectedLayer = useMemo(() => CENTRAL_LAYER_METADATA_REGISTRY.find((l) => l.id === selectedDetailsLayerId) || null, [selectedDetailsLayerId]);

  const dispatchStackAction = (action: Parameters<typeof manageActiveLayerStack>[1]) => {
    const res = manageActiveLayerStack(activeStack, action);
    setActiveStack(res.nextStack);
    setCompatibilityMsg(res.warningFa);
  };

  return (
    <div
      role="dialog" aria-label="ابزارهای ترسیم، اندازه‌گیری و کاتالوگ لایه‌ها (RT-UI-MAP-001 & RT-UI-LAYERS-001)"
      data-testid="map-spatial-tools-popover"
      className="pointer-events-auto w-80 sm:w-88 max-w-[calc(100vw-4.5rem)] rounded-2xl border border-[#DCE3DF] dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl shadow-2xl p-3.5 space-y-3 text-xs max-h-[calc(100dvh-10rem)] overflow-y-auto"
    >
      <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
        <div role="tablist" aria-label="تب‌های ابزار مکانی و کاتالوگ لایه" className="flex items-center gap-1">
          <button
            type="button" role="tab" aria-selected={panelTab === 'tools_15'} data-testid="spatial-tab-tools-15" onClick={() => setPanelTab('tools_15')}
            className={`px-2.5 py-1 rounded-[8px] font-bold cursor-pointer ${panelTab === 'tools_15' ? 'bg-[#176B63] text-white' : 'text-[#34433E] dark:text-slate-300'}`}
          >
            ابزار نقشه (۱۵)
          </button>
          <button
            type="button" role="tab" aria-selected={panelTab === 'catalog_16'} data-testid="spatial-tab-catalog-16" onClick={() => setPanelTab('catalog_16')}
            className={`px-2.5 py-1 rounded-[8px] font-bold cursor-pointer ${panelTab === 'catalog_16' ? 'bg-[#176B63] text-white' : 'text-[#34433E] dark:text-slate-300'}`}
          >
            کاتالوگ لایه‌ها (۱۶)
          </button>
        </div>
        <button type="button" onClick={p.onClose} aria-label="بستن پنل ابزار مکانی" className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {panelTab === 'tools_15' ? (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <div className="text-[10.5px] font-bold text-slate-500">حالت فعال بوم نقشه (عدم تداخل ترسیم و انتخاب):</div>
            <div role="group" aria-label="انتخاب حالت ابزار نقشه" className="grid grid-cols-3 gap-1">
              {([{ id: 'explore', label: 'کاوش' }, { id: 'draw', label: 'ترسیم محدوده' }, { id: 'measure', label: 'اندازه‌گیری' }] as const).map((m) => (
                <button
                  key={m.id} type="button" data-testid={`map-mode-btn-${m.id}`} aria-pressed={activeMode === m.id} onClick={() => setActiveMode(m.id)}
                  className={`py-1.5 rounded-[8px] font-bold border transition cursor-pointer ${
                    activeMode === m.id ? 'bg-[#176B63] text-white border-[#176B63]' : 'border-[#DCE3DF] dark:border-slate-700 text-[#182522] dark:text-slate-200'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <p className="text-[10.5px] text-[#34433E] dark:text-slate-300 bg-[#F6F8F6] dark:bg-slate-800/80 p-2 rounded-[8px]" data-testid="map-mode-cursor-hint">
              {modeState.cursorHintFa}
            </p>
          </div>

          {activeMode === 'draw' && (
            <div className="p-2.5 rounded-[10px] border border-[#DCE3DF] dark:border-slate-700 bg-[#F6F8F6] dark:bg-slate-800/60 space-y-2" data-testid="map-draw-validator-box">
              <div className="flex items-center justify-between font-bold text-[#182522] dark:text-white">
                <span className="flex items-center gap-1"><PenTool className="w-3.5 h-3.5 text-[#176B63]" /> اعتبارسنجی هندسه WGS84</span>
                <div className="flex gap-1 text-[10px]">
                  <button type="button" onClick={() => setPolygonPreset('valid')} className={`px-1.5 py-0.5 rounded ${polygonPreset === 'valid' ? 'bg-[#176B63] text-white' : 'bg-white dark:bg-slate-900'}`}>معتبر</button>
                  <button type="button" onClick={() => setPolygonPreset('self_intersect')} className={`px-1.5 py-0.5 rounded ${polygonPreset === 'self_intersect' ? 'bg-rose-600 text-white' : 'bg-white dark:bg-slate-900'}`}>خودمتقاطع</button>
                </div>
              </div>
              {polygonCheck.valid ? (
                <div className="text-[11px] text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span>چندضلعی بسته معتبر ({polygonCheck.vertexCount} نقطه · {polygonCheck.areaSqKm} کیلومتر مربع)</span>
                </div>
              ) : (
                <div className="text-[11px] text-rose-700 dark:text-rose-300 flex items-start gap-1">
                  <ShieldAlert className="w-3.5 h-3.5 shrink-0 mt-0.5" /> <span>{polygonCheck.errorMessageFa}</span>
                </div>
              )}
            </div>
          )}

          {activeMode === 'measure' && (
            <div className="p-2.5 rounded-[10px] border border-[#DCE3DF] dark:border-slate-700 bg-[#F6F8F6] dark:bg-slate-800/60 space-y-2" data-testid="map-measure-box">
              <div className="flex items-center justify-between font-bold text-[#182522] dark:text-white">
                <span className="flex items-center gap-1"><Ruler className="w-3.5 h-3.5 text-[#176B63]" /> محاسبه ژئودزیک (WGS84)</span>
                <div className="flex gap-1 text-[10px]">
                  <button type="button" onClick={() => setMeasureKind('linear_distance')} className={`px-1.5 py-0.5 rounded ${measureKind === 'linear_distance' ? 'bg-[#176B63] text-white' : 'bg-white dark:bg-slate-900'}`}>فاصله خطی</button>
                  <button type="button" onClick={() => setMeasureKind('area')} className={`px-1.5 py-0.5 rounded ${measureKind === 'area' ? 'bg-[#176B63] text-white' : 'bg-white dark:bg-slate-900'}`}>مساحت</button>
                </div>
              </div>
              <div className="text-sm font-black text-[#182522] dark:text-white tabular-nums">
                خروجی: {measurement.formattedValueFa} <span className="text-[10.5px] font-normal text-slate-500">({measurement.unitFa} · بدون تغییر فیلترها)</span>
              </div>
            </div>
          )}

          <div className="p-2.5 rounded-[8px] bg-[#F6F8F6] dark:bg-slate-800/70 border border-[#DCE3DF] dark:border-slate-700 space-y-1.5" data-testid="map-dynamic-legend">
            <div className="flex items-center justify-between text-[11px] font-bold text-[#182522] dark:text-white">
              <span>{legendSpec.indicatorTitleFa}</span> <span className="text-[10px] text-slate-500">{legendSpec.unitFa}</span>
            </div>
            <div className="space-y-1">
              {legendSpec.stops.map((st) => (
                <div key={st.labelFa} className="flex items-center justify-between text-[10.5px] text-[#34433E] dark:text-slate-300 tabular-nums">
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
              className="flex-1 px-2.5 py-1.5 rounded-[8px] border border-[#DCE3DF] dark:border-slate-700 bg-[#F6F8F6] dark:bg-slate-800 text-xs focus:outline-none focus:border-[#176B63]"
            />
            <button type="button" onClick={() => setCatalogView('all')} className={`px-2 py-1.5 rounded-[8px] font-bold cursor-pointer ${catalogView === 'all' ? 'bg-[#182522] text-white' : 'bg-[#F1F4F2] dark:bg-slate-800 text-[#34433E]'}`}>همه ({toPersianNum(publicLayers.length)})</button>
            <button type="button" onClick={() => setCatalogView('active')} className={`px-2 py-1.5 rounded-[8px] font-bold cursor-pointer ${catalogView === 'active' ? 'bg-[#176B63] text-white' : 'bg-[#F1F4F2] dark:bg-slate-800 text-[#34433E]'}`}>فعال‌ها ({toPersianNum(activeStack.length)})</button>
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
                  <div key={ly.id} className="p-2 rounded-[8px] border border-[#DCE3DF] dark:border-slate-800 bg-[#F6F8F6]/70 dark:bg-slate-800/50 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-bold text-[#182522] dark:text-white truncate">{ly.title}</div>
                      <div className="text-[10px] text-slate-500">{ly.category} · {ly.renderer} · کیفیت: {ly.qualityStatus}</div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button type="button" onClick={() => setSelectedDetailsLayerId(ly.id)} aria-label={`جزئیات لایه ${ly.title}`} className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 cursor-pointer"><Info className="w-3.5 h-3.5" /></button>
                      <button
                        type="button" onClick={() => dispatchStackAction(inStack ? { type: 'remove', layerId: ly.id } : { type: 'activate', layerId: ly.id })}
                        className={`px-2 py-1 rounded-[6px] text-[10.5px] font-bold cursor-pointer ${inStack ? 'bg-[#176B63] text-white' : 'bg-white dark:bg-slate-900 border border-[#DCE3DF] dark:border-slate-700 text-[#182522] dark:text-slate-200'}`}
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
                  <div key={item.layerId} className="p-2 rounded-[8px] border border-[#DCE3DF] dark:border-slate-700 bg-white dark:bg-slate-900 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-[#182522] dark:text-white flex items-center gap-1"><Layers className="w-3.5 h-3.5 text-[#176B63]" /><span>{meta.title}</span></span>
                      <div className="flex items-center gap-1">
                        <button type="button" onClick={() => dispatchStackAction({ type: 'mute_toggle', layerId: item.layerId })} aria-label={item.visible ? 'خاموش‌کردن موقت لایه' : 'روشن‌کردن لایه'} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 cursor-pointer">
                          {item.visible ? <Eye className="w-3.5 h-3.5 text-[#176B63]" /> : <EyeOff className="w-3.5 h-3.5 text-slate-400" />}
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
                        className="w-24 accent-[#176B63] cursor-pointer"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {inspectedLayer && (
            <div className="p-2.5 rounded-[8px] bg-[#F6F8F6] dark:bg-slate-800 border border-[#DCE3DF] dark:border-slate-700 space-y-1 text-[10.5px]" data-testid="stage-16-layer-details-box">
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
