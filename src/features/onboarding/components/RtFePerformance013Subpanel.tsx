import React, { useMemo, useState } from 'react';
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

export const RtFePerformance013Subpanel: React.FC = () => {
  const [lcpMs, setLcpMs] = useState(1950);
  const [inpMs, setInpMs] = useState(140);
  const [cls, setCls] = useState(0.05);
  const [deviceMemoryGb, setDeviceMemoryGb] = useState(4);
  const [zoomLevel, setZoomLevel] = useState(12);
  const [markerCount, setMarkerCount] = useState(240);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [showDeliverables, setShowDeliverables] = useState(false);

  const budgetResult = useMemo(
    () => evaluatePagePerformanceBudget({ lcpMs, inpMs, cls, longTaskCount: lcpMs > 2500 ? 4 : 1 }),
    [lcpMs, inpMs, cls],
  );

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
              معماری عملکرد، بهینه‌سازی و مدیریت منابع فرانت‌اند رادار تهران (مرحله سیزدهم)
            </h3>
          </div>
          <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-600 text-white">
            ۳۱ واحد معماری · ۳۸ خروجی
          </span>
        </div>
        <p className="text-xs text-slate-700 dark:text-slate-300 mt-2 leading-relaxed">
          ساختار ۸بخشی عملکرد فرانت‌اند شامل بودجه Core Web Vitals (LCP ≤ 2.5s، INP ≤ 200ms، CLS ≤ 0.1)، Code Splitting، رندر تطبیقی Leaflet و جلوگیری از Regression.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
              <Gauge className="w-4 h-4 text-emerald-600" />
              شبیه‌ساز بودجه Core Web Vitals (FPA-020 / FPA-021)
            </h4>
            <span
              className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${
                budgetResult.withinBudget
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                  : 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300'
              }`}
            >
              {budgetResult.grade}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 text-xs">
            <label className="space-y-1">
              <span className="text-slate-600 dark:text-slate-400">LCP (ms) ≤ {RT_FE_FPA_CWV_TARGETS.lcpMaxMs}</span>
              <input
                type="number"
                aria-label="مقدار LCP بر حسب میلی‌ثانیه"
                value={lcpMs}
                onChange={(e) => setLcpMs(Number(e.target.value) || 0)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 px-2.5 py-1.5 font-mono text-left text-slate-900 dark:text-white"
                dir="ltr"
              />
            </label>
            <label className="space-y-1">
              <span className="text-slate-600 dark:text-slate-400">INP (ms) ≤ {RT_FE_FPA_CWV_TARGETS.inpMaxMs}</span>
              <input
                type="number"
                aria-label="مقدار INP بر حسب میلی‌ثانیه"
                value={inpMs}
                onChange={(e) => setInpMs(Number(e.target.value) || 0)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 px-2.5 py-1.5 font-mono text-left text-slate-900 dark:text-white"
                dir="ltr"
              />
            </label>
            <label className="space-y-1">
              <span className="text-slate-600 dark:text-slate-400">CLS ≤ {RT_FE_FPA_CWV_TARGETS.clsMax}</span>
              <input
                type="number"
                step="0.01"
                aria-label="مقدار CLS"
                value={cls}
                onChange={(e) => setCls(Number(e.target.value) || 0)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 px-2.5 py-1.5 font-mono text-left text-slate-900 dark:text-white"
                dir="ltr"
              />
            </label>
          </div>
          <div className="text-xs text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/70 rounded-xl p-2.5">
            شاخص‌های خارج از بودجه:{' '}
            <strong className="font-mono text-slate-900 dark:text-white" dir="ltr">
              {budgetResult.failingMetrics.length > 0 ? budgetResult.failingMetrics.join(', ') : 'None (Pass)'}
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
                aria-label="حافظه رم دستگاه"
                value={deviceMemoryGb}
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
                type="number"
                min={8}
                max={18}
                aria-label="سطح بزرگنمایی نقشه"
                value={zoomLevel}
                onChange={(e) => setZoomLevel(Number(e.target.value) || 12)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 px-2 py-1.5 font-mono text-left"
                dir="ltr"
              />
            </label>
            <label className="space-y-1">
              <span className="text-slate-600 dark:text-slate-400">تعداد Marker</span>
              <input
                type="number"
                aria-label="تعداد نشانگرهای نقشه"
                value={markerCount}
                onChange={(e) => setMarkerCount(Number(e.target.value) || 0)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 px-2 py-1.5 font-mono text-left"
                dir="ltr"
              />
            </label>
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              aria-label="فعال‌سازی کاهش حرکت سیستم"
              checked={reducedMotion}
              onChange={(e) => setReducedMotion(e.target.checked)}
            />
            ترجیح سیستم کاهش حرکت (prefers-reduced-motion)
          </label>
          <div className="flex flex-wrap gap-2 text-[11px]" dir="ltr">
            <span className="px-2.5 py-1 rounded-lg bg-teal-50 dark:bg-teal-950/50 text-teal-800 dark:text-teal-200 font-semibold">
              Mode: {adaptiveProfile.adaptiveMode}
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-sky-50 dark:bg-sky-950/50 text-sky-800 dark:text-sky-200 font-semibold">
              Markers: {adaptiveProfile.markerStrategy}
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-indigo-800 dark:text-indigo-200 font-semibold">
              GeoJSON: {adaptiveProfile.geometrySimplification}
            </span>
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
        <button
          type="button"
          onClick={() => setShowDeliverables((prev) => !prev)}
          className="w-full flex items-center justify-between text-xs font-bold text-slate-900 dark:text-white"
        >
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
