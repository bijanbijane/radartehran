import React from 'react'; import { CheckCircle2, AlertTriangle, XCircle, Layers, ChevronDown, ChevronUp, Compass, Navigation, MapPin } from 'lucide-react'; import { toPersianNum } from '../data/neighborhoods'; import { updateMapAdvancedOverlayState, useMapAdvancedOverlayState } from './mapAdvancedLayers'; import { MapProviderStatusBadge, selectMapProviderStyle, triggerManualNeshanRetry, useMapProviderRuntimeState } from './mapBaseTileController'; import { useAreaUnit, useIntlCurrency, useRadarLocale } from './AreaUnitToggle'; import { formatAreaShort, formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, getRadarLegendCopy } from '../utils/areaUnit'; export type StatusFilterValue = 'all' | 'green' | 'yellow' | 'red'; export type MapLensValue = 'budget' | 'bubble' | 'air' | 'traffic' | 'heatmap'; export interface MapLegendProps { open: boolean; /** تابع تغییر وضعیت باز/بسته بودن راهنمای نقشه */
  onToggle: () => void; /** فیلتر وضعیت بودجه فعلی (`all | green | yellow | red`) */
  statusFilter: StatusFilterValue; /** تابع تغییر فیلتر وضعیت بودجه */
  onChangeStatusFilter: (next: StatusFilterValue) => void; /** لنز رنگی فعال نقشه (`budget | bubble | air | traffic`) */
  mapLens: MapLensValue; counts: { green: number; yellow: number; red: number; }; totalCount: number; hideOnMobileSheet?: boolean; } export function MapLegend({ open, onToggle, statusFilter, onChangeStatusFilter, mapLens, counts, totalCount, hideOnMobileSheet = false, }: MapLegendProps) { const overlayState = useMapAdvancedOverlayState(); const providerState = useMapProviderRuntimeState(); const [areaUnit] = useAreaUnit(); const [intlCurrency] = useIntlCurrency(); const [radarLocale] = useRadarLocale(); const legendCopy = getRadarLegendCopy(radarLocale); const areaUnitLabel = formatAreaUnitLabel(areaUnit); const referenceIntlSample = formatMillionTomanAsIntlCurrency(10_000, intlCurrency, radarLocale); const statusItems: { id: Exclude<StatusFilterValue, 'all'>; title: string; meaning: string; dotClass: string; activeClass: string; count: number; Icon: React.ComponentType<{ className?: string }>; }[] = [
    { id: 'green', title: legendCopy.greenTitle, meaning: mapLens === 'heatmap'
          ? 'قیمت متری پایین‌تر از میانه شهر'
          : mapLens === 'bubble'
              ? 'قیمت پایین‌تر از مرجع محله'
          : mapLens === 'air'
              ? 'امتیاز کیفیت هوا: ۷.۵ تا ۱۰'
          : mapLens === 'traffic'
              ? 'امتیاز ترافیک: ۷.۲ تا ۱۰'
              : 'در محدوده بودجه واردشده', dotClass: 'bg-emerald-500', activeClass: 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-600 dark:border-emerald-500 text-emerald-900 dark:text-emerald-200', count: counts.green, Icon: CheckCircle2, }, { id: 'yellow', title: legendCopy.yellowTitle, meaning: mapLens === 'heatmap'
          ? 'چگالی قیمت متری نزدیک به میانه شهر'
          : mapLens === 'bubble'
              ? 'قیمت نزدیک به مرجع محله'
          : mapLens === 'air'
              ? 'امتیاز کیفیت هوا: ۵.۵ تا ۷.۴'
          : mapLens === 'traffic'
              ? 'امتیاز ترافیک: ۶ تا ۷.۱'
              : 'تا ۱۵٪ بالاتر از بودجه واردشده', dotClass: 'bg-amber-500', activeClass: 'bg-amber-50 dark:bg-amber-950/60 border-amber-500 dark:border-amber-500 text-amber-900 dark:text-amber-200', count: counts.yellow, Icon: AlertTriangle, }, { id: 'red', title: legendCopy.redTitle, meaning: mapLens === 'heatmap'
              ? 'چگالی قیمت متری بالاتر از میانه شهر'
          : mapLens === 'bubble'
              ? 'قیمت بالاتر از مرجع محله'
          : mapLens === 'air'
              ? 'امتیاز کیفیت هوا کمتر از ۵.۵'
          : mapLens === 'traffic'
              ? 'امتیاز ترافیک کمتر از ۶'
              : 'بیش از ۱۵٪ بالاتر از بودجه واردشده', dotClass: 'bg-rose-500', activeClass: 'bg-rose-50 dark:bg-rose-950/60 border-rose-500 dark:border-rose-500 text-rose-900 dark:text-rose-200', count: counts.red, Icon: XCircle, }, ]; return ( <section
      aria-label="راهنمای علائم و رنگ‌های نقشه (Legend)"
      className={`fixed bottom-[180px] lg:bottom-14 left-3 lg:left-4 z-30 flex-col items-end pointer-events-none ${hideOnMobileSheet ? 'hidden lg:flex' : 'flex'}`}
    > {open && (
        <div role="region" aria-label="جزئیات راهنمای نقشه و فیلتر رنگ‌ها" className="mb-2 w-72 sm:w-80 apple-inspector-panel bg-white/95 dark:bg-slate-900/95 border border-slate-200/80 dark:border-slate-800 text-slate-900 dark:text-slate-100 rounded-2xl p-3 space-y-2.5 text-xs pointer-events-auto shadow-2xl">
          <div className="flex items-center justify-between px-1 pb-1.5 border-b border-slate-200/70 dark:border-slate-800"> <div className="font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5" title={`${areaUnitLabel} · ${referenceIntlSample}`}>
              <Layers className="w-4 h-4 stroke-[1.75] text-emerald-600 dark:text-emerald-400" /> <span>{legendCopy.legendHeaderTitle}</span>
              <span className="text-[9.5px] font-bold text-slate-500 dark:text-slate-400 tabular-nums">({formatAreaShort(80, areaUnit)} · ۱۰ م.ت{intlCurrency !== 'IRT' ? ` ≈ ${referenceIntlSample}` : ''})</span>
            </div> {statusFilter !== 'all' && (
              <button type="button" onClick={() => onChangeStatusFilter('all')} className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer">
                نمایش همه ({toPersianNum(totalCount)})
              </button> )}
          </div>
          <MapProviderStatusBadge />
          <div className="apple-grouped-card dark:bg-slate-800/60 dark:border-slate-800 p-2 space-y-1">
            <div className="text-[10.5px] font-bold text-slate-700 dark:text-slate-300">تامین‌کننده تایل نقشه (Map Provider):</div>
            <div className="grid grid-cols-4 gap-1 text-[10px]">
              {[
                { id: 'neshan' as const, label: 'نشان' }, { id: 'osm' as const, label: 'OSM' }, { id: 'satellite' as const, label: 'ماهواره' },
                { id: 'carto_dark' as const, label: 'تاریک' }, ].map((st) => (
                <button key={st.id} type="button" onClick={() => selectMapProviderStyle(st.id)} className={`py-1 px-1 rounded-lg font-bold border transition cursor-pointer ${providerState.effectiveProvider === st.id ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>
                  {st.label}
                </button> ))}
            </div>
          </div>
          {mapLens === 'heatmap' && (
            <div className="apple-grouped-card dark:bg-slate-800/60 dark:border-slate-800 p-2.5 space-y-1.5">
              <div className="flex items-center justify-between text-[11px] font-bold text-slate-800 dark:text-slate-200">
                <span>🔥 طیف چگالی قیمت هر {areaUnitLabel} (d3-scale)</span>
                <span className="text-[10px] text-purple-700 dark:text-purple-400 font-extrabold">هیت‌مپ فعال</span>
              </div>
              <div className="h-2.5 w-full rounded-full bg-gradient-to-l from-emerald-500 via-amber-500 to-purple-600" aria-hidden="true" />
              <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 font-semibold">
                <span>ارزان‌ترین (سبز)</span><span>میانه شهر (کهربایی)</span><span>لوکس‌ترین (بنفش)</span>
              </div>
            </div> )}
          {/* Interactive Spatial GIS Overlay Toggles & Lazy GeoJSON Saver */}
          <div className="apple-grouped-card dark:bg-slate-800/60 dark:border-slate-800 p-2.5 space-y-1.5">
            <div className="flex items-center justify-between text-[11px] font-bold text-slate-800 dark:text-slate-200">
              <span>لایه‌های مکانی روی نقشه (GIS):</span>
              <span className="text-[9.5px] font-extrabold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-1.5 py-0.5 rounded-md">
                زوم: {toPersianNum(overlayState.viewportBounds?.zoom ?? 12)}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-1">
              <button type="button" aria-pressed={overlayState.showCommuteIsochrones} onClick={() => updateMapAdvancedOverlayState({ showCommuteIsochrones: !overlayState.showCommuteIsochrones })} className={`py-1.5 px-1.5 rounded-lg text-[10.5px] font-bold border transition cursor-pointer text-center ${overlayState.showCommuteIsochrones ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>
                ⏱️ حلقه تردد
              </button>
              <button type="button" aria-pressed={overlayState.lowBandwidthGeoLazyMode} onClick={() => updateMapAdvancedOverlayState({ lowBandwidthGeoLazyMode: !overlayState.lowBandwidthGeoLazyMode })} title="کاهش رئوس GeoJSON و بارگذاری تنبل محدود به کادر دید برای موبایل و اینترنت ضعیف" className={`py-1.5 px-1.5 rounded-lg text-[10.5px] font-bold border transition cursor-pointer text-center ${overlayState.lowBandwidthGeoLazyMode ? 'bg-amber-600 text-white border-amber-600' : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>
                ⚡ سبک‌ساز GeoJSON
              </button>
            </div>
          </div>
          {/* Interactive Status Filter Rows (green / yellow / red) in Apple grouped list */}
          <div className="apple-grouped-card dark:bg-slate-800/60 dark:border-slate-800 divide-y divide-slate-200/60 dark:divide-slate-700 overflow-hidden" role="group" aria-label="فیلتر وضعیت بودجه روی نقشه">
            {statusItems.map((item) => {
              const isSelected = statusFilter === item.id;
              const StatusIcon = item.Icon; return (
                <button key={item.id} type="button" aria-pressed={isSelected} onClick={() => onChangeStatusFilter(isSelected ? 'all' : item.id)} className={`w-full text-right px-3 py-2.5 transition flex items-start justify-between gap-2 cursor-pointer ${isSelected ? item.activeClass : 'bg-white dark:bg-slate-900 hover:bg-slate-50/90 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200'}`}>
                  <div className="flex items-start gap-2 min-w-0">
                    <span className={`w-2.5 h-2.5 rounded-full mt-1 shrink-0 ${item.dotClass}`} aria-hidden="true" />
                    <div className="min-w-0">
                      <div className="font-bold flex items-center gap-1">
                        <StatusIcon className="w-3.5 h-3.5 shrink-0 opacity-80" /><span>{item.title}</span>
                      </div>
                      <div className="text-[10.5px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">{item.meaning}</div>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded-md bg-slate-100/90 dark:bg-slate-800 text-[10.5px] font-extrabold text-slate-700 dark:text-slate-200 tabular-nums shrink-0">
                    {toPersianNum(item.count)} محله
                  </span>
                </button>
              ); })}
          </div>
          {/* Map Symbols Key */}
          <div className="apple-grouped-card dark:bg-slate-800/60 dark:border-slate-800 p-2.5 space-y-1.5 text-[11px] text-slate-600 dark:text-slate-300">
            <div className="font-bold text-slate-800 dark:text-slate-200 mb-1">علائم هندسی و سطوح زوم (LOD):</div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-slate-900 text-white text-[9px] font-bold shrink-0">
                <MapPin className="w-3 h-3 text-emerald-400" />
              </span>
              <span>کپسول ۳سطحی: خلاصه در زوم پایین، کامل در زوم بالا</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-600 text-white shrink-0">
                <Navigation className="w-3 h-3" />
              </span>
              <span>خط‌چین و ۳ حلقه ایزوکرون (۲۰/۳۵/۵۰ دقیقه · ۳ تا ۱۲ کم{areaUnit === 'sqft' ? ' / ۱.۹ تا ۷.۵ مایل' : ''}) تا محل کار</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-slate-800 text-white shrink-0">
                <Compass className="w-3 h-3" />
              </span>
              <span>کمان بنفش: مقایسه زنده اختلاف قیمت دو محله پین‌شده</span>
            </div>
          </div>
        </div>
      )}
      <div className="pointer-events-auto flex flex-wrap items-center justify-end gap-1.5">
        <div dir="ltr" className="hidden sm:flex apple-vibrancy-bar dark:bg-slate-900/90 px-2.5 py-1.5 rounded-xl text-[10.5px] font-bold text-slate-700 dark:text-slate-200 items-center gap-1.5 border border-slate-200/60 dark:border-slate-800" title={providerState.fallbackNotice || providerState.statusBadgeText}>
          <span className={`w-2 h-2 rounded-full shrink-0 ${providerState.statusMode === 'neshan_active' ? 'bg-emerald-500' : providerState.statusMode === 'osm_fallback' ? 'bg-amber-500' : 'bg-sky-500'}`} />
          <span className="truncate max-w-[195px]">{providerState.statusBadgeText}</span>
          {providerState.statusMode === 'osm_fallback' && (
            <button type="button" onClick={() => triggerManualNeshanRetry()} className="px-1.5 py-0.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-[9.5px] font-extrabold transition cursor-pointer shrink-0">
              تلاش مجدد نشان
            </button>
          )}
        </div>
        {overlayState.comparisonArc.active &&
          overlayState.comparisonArc.hoodA &&
          overlayState.comparisonArc.hoodB && (
            <button type="button" onClick={() => updateMapAdvancedOverlayState({ comparisonArc: { active: false, isPinned: false, hoodA: null, hoodB: null } })} title="حذف کمان مقایسه دو محله از روی نقشه" className="px-2.5 py-2 rounded-xl text-[11px] font-bold bg-indigo-600 hover:bg-indigo-500 text-white border border-indigo-500 shadow-xs transition cursor-pointer flex items-center gap-1">
              <span>⚖️ {overlayState.comparisonArc.hoodA.name} ⇄ {overlayState.comparisonArc.hoodB.name}</span>
              <span className="text-indigo-200 font-black">×</span>
            </button>
          )}
        <button type="button" aria-pressed={overlayState.showMetroLines} onClick={() => updateMapAdvancedOverlayState({ showMetroLines: !overlayState.showMetroLines })} className={`px-2.5 py-2 rounded-xl text-[11px] font-bold transition cursor-pointer border ${overlayState.showMetroLines ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs' : 'apple-vibrancy-bar dark:bg-slate-900/90 hover:bg-white dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border-transparent dark:border-slate-800'}`} title="نمایش یا مخفی‌سازی خطوط مترو روی نقشه">
          {legendCopy.metroPillLabel}
        </button>
        <button type="button" aria-pressed={overlayState.showTrafficZones} onClick={() => updateMapAdvancedOverlayState({ showTrafficZones: !overlayState.showTrafficZones })} className={`px-2.5 py-2 rounded-xl text-[11px] font-bold transition cursor-pointer border ${overlayState.showTrafficZones ? 'bg-rose-600 text-white border-rose-600 shadow-xs' : 'apple-vibrancy-bar dark:bg-slate-900/90 hover:bg-white dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border-transparent dark:border-slate-800'}`} title="نمایش یا مخفی‌سازی محدوده طرح ترافیک و کنترل آلودگی هوا">
          {legendCopy.trafficPillLabel}
        </button>
        <button type="button" aria-expanded={open} onClick={onToggle} className="flex items-center gap-1.5 apple-vibrancy-bar dark:bg-slate-900/90 hover:bg-white dark:hover:bg-slate-800 px-3.5 py-2 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-100 border border-transparent dark:border-slate-800 transition cursor-pointer">
          <span className="flex items-center gap-1" aria-hidden="true">
            <span className="w-2 h-2 rounded-full bg-emerald-500" /><span className="w-2 h-2 rounded-full bg-amber-500" /><span className="w-2 h-2 rounded-full bg-rose-500" />
          </span>
          <span>{legendCopy.legendBtnLabel}</span>
          {open ? <ChevronDown className="w-3.5 h-3.5 stroke-[1.75] text-slate-500 dark:text-slate-400" /> : <ChevronUp className="w-3.5 h-3.5 stroke-[1.75] text-slate-500 dark:text-slate-400" />}
        </button>
      </div>
    </section>
  ); }