import React, { useMemo, useState } from 'react';
import { Activity, BarChart3, MapPin, ShieldAlert } from 'lucide-react';
import {
  RT_FE_DATA_VISUALIZATION_020_SPEC_ID, RT_FE_STAGE21_BRIDGE_SPEC_ID,
  RT_VIS_LAYERS_11, RT_VIS_CHART_REGISTRY_18, RT_VIS_METRIC_CATEGORIES_10,
  RT_VIS_DASHBOARD_TYPES_8, RT_VIS_CHOROPLETH_METHODS_5, RT_VIS_DELIVERABLES_33,
  validateChartSelectionAndSchema, evaluateTimeSeriesAndGapPolicy,
  evaluateCrossFilterGraph, evaluateSpatialChoroplethSpec,
  buildAccessibleChartSummary, sanitizeVisualizationExportAndTelemetry,
} from '../services/rtFeDataVisualization020Engine';

type VisTabId = 'layers_registry' | 'timeseries_uncertainty' | 'spatial_crossfilter' | 'deliverables_bridge';

export const RtFeDataVisualization020Subpanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<VisTabId>('layers_registry');
  const [chartType, setChartType] = useState<'pie' | 'bar' | 'line'>('pie');
  const [categoryCount, setCategoryCount] = useState<number>(12);
  const [isTemporalOrdered, setIsTemporalOrdered] = useState<boolean>(false);
  const [reqGranularity, setReqGranularity] = useState<'monthly' | 'daily'>('monthly');
  const [baseZero, setBaseZero] = useState<boolean>(false);
  const [choroplethMethod, setChoroplethMethod] = useState<string>('Quantile');
  const [sampleSize, setSampleSize] = useState<number>(3);
  const [simulateCycle, setSimulateCycle] = useState<boolean>(true);

  const chartCheck = useMemo(
    () =>
      validateChartSelectionAndSchema({
        chartType,
        categoryCount,
        isTemporalOrdered,
        hasUnitLabel: true,
      }),
    [chartType, categoryCount, isTemporalOrdered],
  );

  const tsPoints = useMemo(
    () => [
      { period: 'شهریور ۱۴۰۵', value: baseZero ? 0 : 112 },
      { period: 'مهر ۱۴۰۵', value: null },
      { period: 'آبان ۱۴۰۵', value: 126, isEstimated: true },
    ],
    [baseZero],
  );

  const tsOut = useMemo(
    () =>
      evaluateTimeSeriesAndGapPolicy({
        sourceGranularity: 'monthly',
        requestedGranularity: reqGranularity,
        gapPolicy: 'break_line',
        points: tsPoints,
      }),
    [reqGranularity, tsPoints],
  );

  const aaSummary = useMemo(
    () =>
      buildAccessibleChartSummary({
        metricTitleFa: 'میانه قیمت هر متر مسکن',
        unitFa: 'میلیون تومان',
        points: tsPoints,
      }),
    [tsPoints],
  );

  const crossOut = useMemo(
    () =>
      evaluateCrossFilterGraph(
        simulateCycle
          ? [
              { fromWidgetId: 'chart-price', toWidgetId: 'table-props' },
              { fromWidgetId: 'table-props', toWidgetId: 'map-hoods' },
              { fromWidgetId: 'map-hoods', toWidgetId: 'chart-price' },
            ]
          : [
              { fromWidgetId: 'chart-price', toWidgetId: 'table-props' },
              { fromWidgetId: 'chart-price', toWidgetId: 'map-hoods' },
            ],
      ),
    [simulateCycle],
  );

  const spatialOut = useMemo(
    () =>
      evaluateSpatialChoroplethSpec({
        method: choroplethMethod,
        separatesMissingValueStyle: true,
        usesExistingLeafletAdapter: true,
      }),
    [choroplethMethod],
  );

  const exportOut = useMemo(
    () =>
      sanitizeVisualizationExportAndTelemetry({
        sampleSize,
        minSampleThreshold: 5,
        hasExportPermission: true,
      }),
    [sampleSize],
  );

  return (
    <div dir="rtl" data-testid="rt-fe-vis-020-panel" className="space-y-4 text-right">
      <div className="rounded-xl border border-teal-500/30 bg-slate-900/95 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-teal-500/20 px-2 py-0.5 font-mono text-[11px] font-bold text-teal-300" dir="ltr">
                {RT_FE_DATA_VISUALIZATION_020_SPEC_ID}
              </span>
              <span className="rounded bg-cyan-500/20 px-2 py-0.5 text-[11px] font-bold text-cyan-300">
                ۱۱ لایه · ۱۸ نوع نمودار · ۸ داشبورد · ۳۳ خروجی OUT
              </span>
            </div>
            <h4 className="mt-1.5 text-sm font-bold text-white">
              مرحله بیستم: نظام بصری‌سازی داده، نمودارها، داشبوردهای تحلیلی و تعاملات داده‌محور
            </h4>
          </div>
          <span className="rounded-lg border border-emerald-500/40 bg-emerald-950/50 px-2.5 py-1 text-xs font-bold text-emerald-300 whitespace-nowrap shrink-0" dir="ltr">
            Backend Metrics · Honest Uncertainty
          </span>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-slate-800 pt-3">
          {[
            { id: 'layers_registry', label: '۱. ۱۱ لایه، ۱۸ نوع نمودار و قانون تناسب Chart Registry' },
            { id: 'timeseries_uncertainty', label: '۲. سری زمانی بدون پرش از خلأ، مبنای صفر و خلاصه متنی AA' },
            { id: 'spatial_crossfilter', label: '۳. نقشه Choropleth، جلوگیری از حلقه Cross-filtering و حریم Small-Cell' },
            { id: 'deliverables_bridge', label: '۴. ۸ نوع داشبورد، ۱۰ حوزه شاخص و ۳۳ خروجی OUT-001..033' },
          ].map((tab) => (
            <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id as VisTabId)} data-testid={`rt-fe-vis-tab-${tab.id}`} className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${activeTab === tab.id ? 'bg-teal-600 text-white' : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'}`}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'layers_registry' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 text-xs">
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-2.5">
            <h5 className="font-bold text-teal-300 flex items-center gap-1.5"><BarChart3 className="w-4 h-4 shrink-0" /> <span>جلوگیری از انتخاب نمودار گمراه‌کننده (§۲۰.۸.۲ & §۲۰.۹)</span></h5>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" data-testid="rt-fe-vis-chart-pie" onClick={() => { setChartType('pie'); setCategoryCount(12); }} className={`rounded px-2.5 py-1 text-[11px] font-bold ${chartType === 'pie' ? 'bg-amber-700 text-white' : 'bg-slate-800 text-slate-300'}`}>دایره‌ای با ۱۲ دسته</button>
              <button type="button" data-testid="rt-fe-vis-chart-line" onClick={() => { setChartType('line'); setIsTemporalOrdered(false); }} className={`rounded px-2.5 py-1 text-[11px] font-bold ${chartType === 'line' && !isTemporalOrdered ? 'bg-amber-700 text-white' : 'bg-slate-800 text-slate-300'}`}>خطی بدون ترتیب زمانی</button>
              <button type="button" data-testid="rt-fe-vis-chart-bar" onClick={() => { setChartType('bar'); setCategoryCount(12); }} className={`rounded px-2.5 py-1 text-[11px] font-bold ${chartType === 'bar' ? 'bg-teal-600 text-white' : 'bg-slate-800 text-slate-300'}`}>میله‌ای مجاز (۱۲ دسته)</button>
            </div>
            <div data-testid="rt-fe-vis-chart-verdict" className={`rounded p-2.5 text-[11px] font-bold ${chartCheck.valid ? 'bg-emerald-950/60 text-emerald-200' : 'bg-rose-950/60 text-rose-200'}`}>
              {chartCheck.reasonFa}
            </div>
            <div className="flex flex-wrap gap-1 pt-1">
              {RT_VIS_CHART_REGISTRY_18.slice(0, 10).map((c) => (
                <span key={c.type} className="rounded bg-slate-800 px-2 py-0.5 font-mono text-[10px] text-cyan-200" dir="ltr">{c.type}</span>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-1 max-h-80 overflow-y-auto">
            <h5 className="font-bold text-cyan-300">۱۱ لایه معماری بصری‌سازی داده (§۲۰.۴)</h5>
            {RT_VIS_LAYERS_11.map((l) => (
              <div key={l.layer} className="rounded border border-slate-800 bg-slate-950/70 p-1.5 text-[11px]">
                <span className="inline-block rounded bg-slate-900 px-1.5 py-0.5 font-mono font-bold text-cyan-300 ml-1.5" dir="ltr">{l.layer}. {l.nameEn}</span>
                <span className="text-slate-200">{l.roleFa}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'timeseries_uncertainty' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 text-xs">
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-2.5">
            <h5 className="font-bold text-indigo-300 flex items-center gap-1.5"><Activity className="w-4 h-4 shrink-0" /> <span>وقفه زمانی، ممنوعیت درون‌یابی جعلی و تغییر درصد با مبنای صفر (§۲۰.۱۰)</span></h5>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" data-testid="rt-fe-vis-ts-daily" onClick={() => setReqGranularity((g) => (g === 'daily' ? 'monthly' : 'daily'))} className={`rounded px-2.5 py-1 text-[11px] font-bold ${reqGranularity === 'daily' ? 'bg-rose-700 text-white' : 'bg-slate-800 text-slate-300'}`}>
                {reqGranularity === 'daily' ? 'بازگشت به ماهانه واقعی' : 'تست تبدیل ماهانه ← روزانه'}
              </button>
              <button type="button" data-testid="rt-fe-vis-ts-basezero" onClick={() => setBaseZero((z) => !z)} className={`rounded px-2.5 py-1 text-[11px] font-bold ${baseZero ? 'bg-amber-700 text-white' : 'bg-slate-800 text-slate-300'}`}>
                {baseZero ? 'مبنای غیرصفر (۱۱۲)' : 'تست مبنای صفر (۰ ← تغییر٪ نامعتبر)'}
              </button>
            </div>
            <div data-testid="rt-fe-vis-ts-verdict" className={`rounded p-2.5 text-[11px] space-y-1 ${tsOut.valid ? 'bg-slate-950 text-slate-200' : 'bg-rose-950/60 text-rose-200 font-bold'}`}>
              <div>{tsOut.reasonFa}</div>
              {tsOut.valid && (
                <div>دوره‌های خالی: <strong className="text-amber-300">{tsOut.missingCount}</strong> · برآوردی (Dashed): <strong className="text-cyan-300">{tsOut.estimatedCount}</strong> · تغییر٪: <strong className="font-mono text-emerald-300" dir="ltr">{tsOut.percentChange !== null ? `${tsOut.percentChange}%` : 'مبنا صفر — نامعتبر'}</strong></div>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-2">
            <h5 className="font-bold text-teal-300">جایگزین متنی خودکار برای دسترس‌پذیری (§۲۰.۲۸.۱)</h5>
            <div data-testid="rt-fe-vis-aa-summary" className="rounded border border-emerald-500/30 bg-slate-950 p-3 text-[11px] leading-relaxed text-emerald-200">
              {aaSummary}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'spatial_crossfilter' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 text-xs">
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-2.5">
            <h5 className="font-bold text-cyan-300 flex items-center gap-1.5"><MapPin className="w-4 h-4 shrink-0" /> <span>نقشه <span dir="ltr">Choropleth</span> روی <span dir="ltr">Leaflet Adapter</span> و طبقه‌بندی صریح (§۲۰.۱۳)</span></h5>
            <select aria-label="روش طبقه‌بندی نقشه" value={choroplethMethod} onChange={(e) => setChoroplethMethod(e.target.value)} className="rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-[11px] text-white" dir="ltr">
              {RT_VIS_CHOROPLETH_METHODS_5.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            <div className="rounded bg-slate-950 p-2.5 text-[11px] text-emerald-300 font-bold">{spatialOut.reasonFa}</div>
            <button type="button" data-testid="rt-fe-vis-cycle-toggle" onClick={() => setSimulateCycle((c) => !c)} className={`rounded px-2.5 py-1 text-[11px] font-bold ${simulateCycle ? 'bg-rose-700 text-white' : 'bg-teal-600 text-white'}`}>
              {simulateCycle ? 'حذف حلقه از گراف Cross-filter' : 'شبیه‌سازی حلقه بی‌نهایت Cross-filter'}
            </button>
            <div data-testid="rt-fe-vis-cross-verdict" className={`rounded p-2 text-[11px] font-bold ${crossOut.acyclic ? 'bg-emerald-950/60 text-emerald-200' : 'bg-rose-950/60 text-rose-200'}`}>
              {crossOut.noteFa}
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-2.5">
            <h5 className="font-bold text-amber-300 flex items-center gap-1.5"><ShieldAlert className="w-4 h-4 shrink-0" /> <span>حاکمیت حریم خصوصی <span dir="ltr">Small-Cell</span> در خروجی نمودار (§۲۰.۲۹ & §۲۰.۳۰)</span></h5>
            <div className="flex gap-2">
              <button type="button" data-testid="rt-fe-vis-sample-small" onClick={() => setSampleSize(3)} className={`rounded px-2.5 py-1 text-[11px] font-bold ${sampleSize === 3 ? 'bg-rose-700 text-white' : 'bg-slate-800 text-slate-300'}`}>نمونه کوچک (n=3)</button>
              <button type="button" data-testid="rt-fe-vis-sample-ok" onClick={() => setSampleSize(24)} className={`rounded px-2.5 py-1 text-[11px] font-bold ${sampleSize === 24 ? 'bg-emerald-700 text-white' : 'bg-slate-800 text-slate-300'}`}>نمونه معتبر (n=24)</button>
            </div>
            <div data-testid="rt-fe-vis-export-verdict" className={`rounded p-2.5 text-[11px] font-bold ${exportOut.exportAllowed ? 'bg-emerald-950/60 text-emerald-200' : 'bg-rose-950/60 text-rose-200'}`}>
              {exportOut.exportAllowed ? 'خروجی و Export نمودار با حفظ واحد، دوره، منبع و نسخه مجاز است.' : exportOut.blockReasonFa}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'deliverables_bridge' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 text-xs">
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-2 max-h-80 overflow-y-auto">
            <h5 className="font-bold text-cyan-300">۸ نوع داشبورد و ۱۰ حوزه شاخص</h5>
            <div className="flex flex-wrap gap-1">
              {RT_VIS_DASHBOARD_TYPES_8.map((d) => <span key={d} className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-indigo-200" dir="ltr">{d}</span>)}
            </div>
            {RT_VIS_METRIC_CATEGORIES_10.map((m) => (
              <div key={m.id} className="rounded border border-slate-800 bg-slate-950/70 p-1.5 text-[10px]">
                <strong className="text-teal-300">{m.titleFa}: </strong><span className="text-slate-300">{m.samplesFa}</span>
              </div>
            ))}
            <div className="pt-1 text-[10px] text-emerald-300">مرز انتقال به مرحله ۲۱: <code className="font-mono" dir="ltr">{RT_FE_STAGE21_BRIDGE_SPEC_ID}</code></div>
          </div>

          <div className="lg:col-span-2 rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-1.5">
            <h5 className="font-bold text-emerald-300">۳۳ خروجی نهایی مرحله بیستم (RT-FE-VIS-OUT-001 تا 033)</h5>
            <div className="max-h-72 overflow-y-auto grid grid-cols-1 gap-1 sm:grid-cols-2">
              {RT_VIS_DELIVERABLES_33.map((del) => (
                <div key={del.id} className="rounded border border-slate-800 bg-slate-950/60 p-1.5 text-[11px] text-slate-200">
                  <span className="font-mono font-bold text-emerald-300" dir="ltr">✓ {del.id}</span> <span>{del.titleFa}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
