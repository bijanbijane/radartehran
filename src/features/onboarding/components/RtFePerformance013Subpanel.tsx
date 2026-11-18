import React, { useEffect, useMemo, useState } from 'react';
import { Activity, Cpu, Gauge, Layers, Zap } from 'lucide-react';
import {
  RT_FE_PERFORMANCE_ARCHITECTURE_013_SPEC_ID,
  RT_FE_FPA_8_DOMAINS,
  RT_FE_FPA_4_PAGE_GROUPS,
  RT_FE_FPA_CWV_TARGETS,
  RT_FE_FPA_31_UNITS,
  RT_FE_FPA_DELIVERABLES_38,
  evaluatePagePerformanceBudget,
  resolveAdaptiveRenderingProfile,
} from '../services/rtFePerformance013Engine';
import { BrowserRumCollector, type BrowserPerformanceSnapshot } from '../../../platform/performance';

export const RtFePerformance013Subpanel: React.FC = () => {
  const [mode, setMode] = useState<'FIELD_RUM' | 'SYNTHETIC_LOCAL'>('FIELD_RUM');
  const [rumSnapshot, setRumSnapshot] = useState<BrowserPerformanceSnapshot | null>(null);
  const [simLcpMs, setSimLcpMs] = useState(1950);
  const [simInpMs, setSimInpMs] = useState(140);
  const [simCls, setSimCls] = useState(0.05);
  const [simLongTaskCount, setSimLongTaskCount] = useState(1);
  const [deviceMemoryGb, setDeviceMemoryGb] = useState(4);
  const [zoomLevel, setZoomLevel] = useState(12);
  const [markerCount, setMarkerCount] = useState(240);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [showDeliverables, setShowDeliverables] = useState(false);

  useEffect(() => {
    const collector = new BrowserRumCollector();
    collector.start();
    setRumSnapshot(collector.getSnapshot());
    return () => collector.disconnect();
  }, []);

  const hasMeasuredRum =
    rumSnapshot !== null && (rumSnapshot.lcpMs !== null || rumSnapshot.inpMs !== null || rumSnapshot.cls !== null);

  const budgetResult = useMemo(() => {
    if (mode === 'FIELD_RUM') {
      if (!hasMeasuredRum || !rumSnapshot) {
        return evaluatePagePerformanceBudget({
          lcpMs: 0, inpMs: 0, cls: 0, longTaskCount: rumSnapshot?.longTaskCount ?? 0,
          sampleCount: 0, measurementSource: 'FIELD_RUM',
        });
      }
      return evaluatePagePerformanceBudget({
        lcpMs: rumSnapshot.lcpMs ?? 0, inpMs: rumSnapshot.inpMs ?? 0, cls: rumSnapshot.cls ?? 0,
        longTaskCount: rumSnapshot.longTaskCount, sampleCount: 1, measurementSource: 'FIELD_RUM',
      });
    }
    return evaluatePagePerformanceBudget({
      lcpMs: simLcpMs, inpMs: simInpMs, cls: simCls, longTaskCount: simLongTaskCount,
      sampleCount: 1, measurementSource: 'SYNTHETIC_LOCAL',
    });
  }, [mode, hasMeasuredRum, rumSnapshot, simLcpMs, simInpMs, simCls, simLongTaskCount]);

  const adaptiveProfile = useMemo(
    () => resolveAdaptiveRenderingProfile({ deviceMemoryGb, reducedMotion, markerCount, zoomLevel }),
    [deviceMemoryGb, reducedMotion, markerCount, zoomLevel],
  );

  return (
    <div dir="rtl" data-testid="rt-fe-performance-013-panel" className="space-y-5 text-right">
      <div className="rounded-2xl border border-emerald-200 dark:border-emerald-800/60 bg-gradient-to-l from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <span className="text-[11px] font-bold tracking-wide text-emerald-700 dark:text-emerald-300">
              {RT_FE_PERFORMANCE_ARCHITECTURE_013_SPEC_ID} · FPA-001..FPA-031
            </span>
            <h3 className="text-base font-black text-slate-900 dark:text-white mt-0.5">
              معماری عملکرد، بهینه‌سازی و مدیریت منابع فرانت‌اند رادار تهران (مرحله سیزدهم و سی‌ام)
            </h3>
          </div>
          <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-600 text-white">۳۱ واحد معماری · ۳۸ خروجی</span>
        </div>
        <p className="text-xs text-slate-700 dark:text-slate-300 mt-2 leading-relaxed">
          ساختار ۸بخشی عملکرد فرانت‌اند شامل اندازه‌گیری واقعی مرورگر (FIELD_RUM با PerformanceObserver مستقل برای Long Task) و تفکیک از شبیه‌ساز آموزشی (SYNTHETIC_LOCAL).
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
              <Gauge className="w-4 h-4 text-emerald-600" />
              <span>ارزیاب بودجه Core Web Vitals ({mode === 'FIELD_RUM' ? 'داده واقعی مرورگر FIELD_RUM' : 'شبیه‌ساز SYNTHETIC_LOCAL'})</span>
            </h4>
            <div className="flex items-center gap-1.5">
              <button
                type="button" data-testid="perf-mode-field-rum" onClick={() => setMode('FIELD_RUM')}
                className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer ${mode === 'FIELD_RUM' ? 'bg-emerald-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600'}`}
              >
                FIELD_RUM
              </button>
              <button
                type="button" data-testid="perf-mode-synthetic" onClick={() => setMode('SYNTHETIC_LOCAL')}
                className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer ${mode === 'SYNTHETIC_LOCAL' ? 'bg-amber-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600'}`}
              >
                SYNTHETIC_LOCAL
              </button>
              <span
                data-testid="perf-budget-grade-badge"
                className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${
                  budgetResult.grade === 'INSUFFICIENT_SAMPLE'
                    ? 'bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-300'
                    : budgetResult.withinBudget
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                      : 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300'
                }`}
              >
                {budgetResult.grade}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2 text-xs">
            <label className="space-y-1">
              <span className="text-slate-600 dark:text-slate-400">LCP (ms) ≤ {RT_FE_FPA_CWV_TARGETS.lcpMaxMs}</span>
              <input
                type="number" aria-label="مقدار LCP بر حسب میلی‌ثانیه" value={simLcpMs}
                onChange={(e) => { setMode('SYNTHETIC_LOCAL'); setSimLcpMs(Number(e.target.value) || 0); }}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 px-2 py-1.5 font-mono text-left text-slate-900 dark:text-white" dir="ltr"
              />
            </label>
            <label className="space-y-1">
              <span className="text-slate-600 dark:text-slate-400">INP (ms) ≤ {RT_FE_FPA_CWV_TARGETS.inpMaxMs}</span>
              <input
                type="number" aria-label="مقدار INP بر حسب میلی‌ثانیه" value={simInpMs}
                onChange={(e) => { setMode('SYNTHETIC_LOCAL'); setSimInpMs(Number(e.target.value) || 0); }}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 px-2 py-1.5 font-mono text-left text-slate-900 dark:text-white" dir="ltr"
              />
            </label>
            <label className="space-y-1">
              <span className="text-slate-600 dark:text-slate-400">CLS ≤ {RT_FE_FPA_CWV_TARGETS.clsMax}</span>
              <input
                type="number" step="0.01" aria-label="مقدار CLS" value={simCls}
                onChange={(e) => { setMode('SYNTHETIC_LOCAL'); setSimCls(Number(e.target.value) || 0); }}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 px-2 py-1.5 font-mono text-left text-slate-900 dark:text-white" dir="ltr"
              />
            </label>
            <label className="space-y-1">
              <span className="text-slate-600 dark:text-slate-400">Long Tasks (&gt;50ms)</span>
              <input
                type="number" aria-label="تعداد Long Task مستقل" value={simLongTaskCount}
                onChange={(e) => { setMode('SYNTHETIC_LOCAL'); setSimLongTaskCount(Math.max(0, Number(e.target.value) || 0)); }}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 px-2 py-1.5 font-mono text-left text-slate-900 dark:text-white" dir="ltr"
              />
            </label>
          </div>
          <div className="text-xs text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/70 rounded-xl p-2.5">
            منشأ داده: <strong className="font-mono">{budgetResult.measurementSource}</strong> · شاخص‌های خارج از بودجه:{' '}
            <strong className="font-mono text-slate-900 dark:text-white" dir="ltr">
              {budgetResult.grade === 'INSUFFICIENT_SAMPLE'
                ? 'INSUFFICIENT_SAMPLE (بدون نمونه واقعی مرورگر)'
                : budgetResult.failingMetrics.length > 0
                  ? budgetResult.failingMetrics.join(', ')
                  : 'None (Pass)'}
            </strong>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 space-y-3">
          <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
            <Cpu className="w-4 h-4 text-teal-600" />
            رندر تطبیقی و بهینه‌سازی نقشه Leaflet (FPA-011 / FPA-023)
          </h4>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <label className="space-y-1">
              <span className="text-slate-600 dark:text-slate-400">رم دستگاه (GB)</span>
              <select
                aria-label="حافظه رم دستگاه" value={deviceMemoryGb}
                onChange={(e) => setDeviceMemoryGb(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 px-2 py-1.5"
              >
                <option value={2}>2 GB</option>
                <option value={4}>4 GB</option>
                <option value={8}>8+ GB</option>
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-slate-600 dark:text-slate-400">Zoom نقشه</span>
              <input
                type="number" min={8} max={18} aria-label="سطح بزرگنمایی نقشه"
                value={zoomLevel} onChange={(e) => setZoomLevel(Number(e.target.value) || 12)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 px-2 py-1.5 font-mono text-left" dir="ltr"
              />
            </label>
            <label className="space-y-1">
              <span className="text-slate-600 dark:text-slate-400">تعداد Marker</span>
              <input
                type="number" aria-label="تعداد نشانگرهای نقشه"
                value={markerCount} onChange={(e) => setMarkerCount(Number(e.target.value) || 0)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 px-2 py-1.5 font-mono text-left" dir="ltr"
              />
            </label>
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
            <input type="checkbox" aria-label="فعال‌سازی کاهش حرکت سیستم" checked={reducedMotion} onChange={(e) => setReducedMotion(e.target.checked)} />
            ترجیح سیستم کاهش حرکت (prefers-reduced-motion)
          </label>
          <div className="flex flex-wrap gap-2 text-[11px]" dir="ltr">
            <span className="px-2.5 py-1 rounded-lg bg-teal-50 dark:bg-teal-950/50 text-teal-800 dark:text-teal-200 font-semibold">Mode: {adaptiveProfile.adaptiveMode}</span>
            <span className="px-2.5 py-1 rounded-lg bg-sky-50 dark:bg-sky-950/50 text-sky-800 dark:text-sky-200 font-semibold">Markers: {adaptiveProfile.markerStrategy}</span>
            <span className="px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-indigo-800 dark:text-indigo-200 font-semibold">GeoJSON: {adaptiveProfile.geometrySimplification}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
          <h4 className="text-xs font-bold text-slate-900 dark:text-white mb-2.5 flex items-center gap-1.5">
            <Layers className="w-4 h-4 text-emerald-600" />
            ۸ حوزه معماری عملکرد فرانت‌اند (FPA-002)
          </h4>
          <div className="space-y-1.5">
            {RT_FE_FPA_8_DOMAINS.map((d) => (
              <div key={d.id} className="text-xs rounded-lg bg-slate-50 dark:bg-slate-800/70 px-2.5 py-1.5 flex items-center justify-between gap-2">
                <span className="font-semibold text-slate-800 dark:text-slate-100">{d.id}. {d.titleFa}</span>
                <span className="text-[11px] font-mono text-slate-500 whitespace-nowrap shrink-0 text-left" dir="ltr">{d.nameEn}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
          <h4 className="text-xs font-bold text-slate-900 dark:text-white mb-2.5 flex items-center gap-1.5">
            <Activity className="w-4 h-4 text-teal-600" />
            طبقه‌بندی ۴گانه اهمیت عملکردی صفحات (FPA-003)
          </h4>
          <div className="space-y-2">
            {RT_FE_FPA_4_PAGE_GROUPS.map((g) => (
              <div key={g.group} className="text-xs rounded-xl border border-slate-200 dark:border-slate-700 p-2.5">
                <div className="flex justify-between font-bold text-slate-900 dark:text-white">
                  <span>گروه {g.group}: {g.titleFa}</span>
                  <span className="font-mono text-[11px] text-emerald-700 dark:text-emerald-300" dir="ltr">{g.priority}</span>
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-1">{g.examplesFa}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
        <button type="button" onClick={() => setShowDeliverables((prev) => !prev)} className="w-full flex items-center justify-between text-xs font-bold text-slate-900 dark:text-white">
          <span className="flex items-center gap-1.5">
            <Zap className="w-4 h-4 text-amber-500" />
            فهرست کامل ۳۱ واحد معماری (FPA-001..031) و ۳۸ خروجی (FPA-OUT-001..038)
          </span>
          <span className="text-emerald-600 dark:text-emerald-400">{showDeliverables ? 'بستن' : 'نمایش کامل'}</span>
        </button>
        {showDeliverables && (
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px]">
            <div className="space-y-1 max-h-60 overflow-y-auto pl-2">
              {RT_FE_FPA_31_UNITS.map((u) => (
                <div key={u.id} className="px-2 py-1 rounded bg-slate-50 dark:bg-slate-800/60">
                  <strong className="font-mono text-emerald-700 dark:text-emerald-300" dir="ltr">{u.id}</strong> — {u.titleFa}
                </div>
              ))}
            </div>
            <div className="space-y-1 max-h-60 overflow-y-auto pl-2">
              {RT_FE_FPA_DELIVERABLES_38.map((o) => (
                <div key={o.id} className="px-2 py-1 rounded bg-slate-50 dark:bg-slate-800/60">
                  <strong className="font-mono text-teal-700 dark:text-teal-300" dir="ltr">{o.id}</strong> — {o.titleFa}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
