import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  subscribeDiagnostics, clearDiagnosticEvents, getDiagnosticSnapshots,
  getDiagnosticPerformanceMetrics, createExecutionTimer, getMapLayerProfiles,
  type DiagnosticEventEntry, type MapLayerProfileEntry,
} from '../utils/diagnostics';
import { formatMillionTomanAsIntlCurrency } from '../utils/areaUnit'; void formatMillionTomanAsIntlCurrency;

function isDevEnvironment(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const search = window.location.search || '';
    if (search.includes('perf=1') || search.includes('dev=1')) return true;
    return window.localStorage?.getItem('tehran_radar_dev_perf') === '1';
  } catch { return false; }
}

function getBudgetBadge(ms: number | null): { label: string; color: string; bg: string } {
  if (ms === null) return { label: 'بی‌داده', color: 'text-slate-400', bg: 'bg-slate-700/50' };
  if (ms <= 16.6) return { label: '۶۰ FPS (عالی)', color: 'text-emerald-400', bg: 'bg-emerald-950/60 border-emerald-500/30' };
  if (ms <= 50.0) return { label: 'قابل قبول (متوسط)', color: 'text-amber-400', bg: 'bg-amber-950/60 border-amber-500/30' };
  return { label: 'افت فریم (کند)', color: 'text-rose-400', bg: 'bg-rose-950/60 border-rose-500/30' };
}

export const DevPerformancePanel: React.FC = () => {
  const [isDev] = useState<boolean>(() => isDevEnvironment());
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const [scopeFilter, setScopeFilter] = useState<'All' | 'Map' | 'Filter' | 'Other'>('All');
  const [copied, setCopied] = useState<boolean>(false);
  const [benchmarking, setBenchmarking] = useState<boolean>(false);
  const [events, setEvents] = useState<readonly DiagnosticEventEntry[]>([]);
  const [layerProfiles, setLayerProfiles] = useState<readonly MapLayerProfileEntry[]>([]);

  const refreshRafRef = React.useRef<number | null>(null);
  const refreshData = useCallback(() => {
    if (refreshRafRef.current !== null) return;
    refreshRafRef.current = requestAnimationFrame(() => {
      refreshRafRef.current = null;
      setEvents(getDiagnosticSnapshots());
      setLayerProfiles(getMapLayerProfiles());
    });
  }, []);

  useEffect(() => {
    return () => {
      if (refreshRafRef.current !== null) {
        cancelAnimationFrame(refreshRafRef.current);
        refreshRafRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!isDev) return undefined;
    refreshData();
    const unsubscribe = subscribeDiagnostics(() => {
      if (autoRefresh) refreshData();
    });
    return () => unsubscribe();
  }, [isDev, autoRefresh, refreshData]);

  const mapMetrics = useMemo(() => getDiagnosticPerformanceMetrics('Map'), [events]);
  const filterMetrics = useMemo(() => getDiagnosticPerformanceMetrics('Filter'), [events]);
  const overallMetrics = useMemo(() => getDiagnosticPerformanceMetrics(), [events]);

  const filteredEvents = useMemo(() => {
    if (scopeFilter === 'All') return events;
    if (scopeFilter === 'Other') return events.filter((e) => e.scope.toLowerCase() !== 'map' && e.scope.toLowerCase() !== 'filter');
    return events.filter((e) => e.scope.toLowerCase() === scopeFilter.toLowerCase());
  }, [events, scopeFilter]);

  const handleCopyReport = useCallback(() => {
    try {
      const report = {
        timestamp: new Date().toISOString(),
        mapMetrics,
        filterMetrics,
        overallMetrics,
        mapLayerProfiles: layerProfiles.slice(0, 20),
        recentEvents: events.slice(0, 20),
      };
      navigator.clipboard?.writeText(JSON.stringify(report, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  }, [mapMetrics, filterMetrics, overallMetrics, layerProfiles, events]);

  const handleRunMicroBenchmark = useCallback(() => {
    setBenchmarking(true);
    setTimeout(() => {
      const filterBench = createExecutionTimer('Filter', 'microBenchmarkCalculations');
      const sampleArray = Array.from({ length: 150 }, (_, i) => ({ id: i, score: Math.sin(i) * 10, price: 50 + (i % 30) }));
      for (let cycle = 0; cycle < 50; cycle++) { sampleArray.filter((item) => item.score > 0).sort((a, b) => b.score - a.score); }
      filterBench('success');
      const mapBench = createExecutionTimer('Map', 'microBenchmarkSpatialClustering');
      for (let cycle = 0; cycle < 20; cycle++) { sampleArray.map((p) => ({ ...p, dist: Math.sqrt(p.score * p.score + p.price * p.price) })); }
      mapBench('success');
      refreshData();
      setBenchmarking(false);
    }, 50);
  }, [refreshData]);

  if (!isDev) return null;
  const mapBadge = getBudgetBadge(mapMetrics.latestDurationMs);
  const filterBadge = getBudgetBadge(filterMetrics.latestDurationMs);

  return (
    <aside aria-label="داشبورد پایش پرفورمنس توسعه" className="hidden lg:block fixed bottom-16 lg:bottom-4 left-4 z-[99999] font-sans antialiased text-slate-100">
      {!isOpen ? (
        <button
          type="button" onClick={() => setIsOpen(true)} title="باز کردن داشبورد پایش پرفورمنس رندر و فیلتر (ویژه محیط توسعه)"
          className="flex items-center gap-2.5 px-3 py-2 bg-slate-900/90 hover:bg-slate-800 text-xs font-semibold rounded-full shadow-2xl border border-sky-500/40 backdrop-blur-md transition-all hover:scale-105 active:scale-95 text-right"
        >
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-sky-500" />
          </span>
          <span className="text-sky-300 font-mono font-bold">⚡ Perf:</span>
          <span>نقشه: {mapMetrics.latestDurationMs !== null ? `${mapMetrics.latestDurationMs}ms` : '—'}</span>
          <span className="text-slate-500">|</span>
          <span>فیلتر: {filterMetrics.latestDurationMs !== null ? `${filterMetrics.latestDurationMs}ms` : '—'}</span>
        </button>
      ) : (
        <div dir="rtl" className="w-[92vw] sm:w-[540px] max-h-[85vh] flex flex-col bg-slate-900/95 border border-slate-700/80 rounded-2xl shadow-2xl backdrop-blur-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          <header className="p-3.5 bg-slate-800/80 border-b border-slate-700/60 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-sky-500/20 text-sky-400 text-sm">⚡</span>
              <div>
                <h3 className="text-xs font-bold text-slate-100 flex items-center gap-2">
                  <span>پایش پرفورمنس رندرهای نقشه و فیلترها</span>
                  <span className="px-1.5 py-0.5 text-[10px] bg-sky-500/20 text-sky-300 rounded font-mono border border-sky-500/30">DEV ONLY</span>
                </h3>
                <p className="text-[10px] text-slate-400">ردیابی زمان‌های پردازش با زیرساخت تله‌متری</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button" onClick={() => setAutoRefresh(!autoRefresh)} title={autoRefresh ? 'توقف تازه‌سازی زنده' : 'شروع تازه‌سازی زنده'}
                className={`p-1.5 rounded-lg text-xs font-mono transition-colors ${autoRefresh ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-800 text-slate-400'}`}
              >
                {autoRefresh ? '● زنده' : '○ متوقف'}
              </button>
              <button type="button" onClick={() => setIsOpen(false)} className="p-1.5 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg transition-colors text-sm" title="بستن پنل">✕</button>
            </div>
          </header>

          <div className="p-3.5 space-y-3 overflow-y-auto max-h-[calc(85vh-120px)] scrollbar-thin">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className={`p-2.5 rounded-xl border ${mapBadge.bg} space-y-1`}>
                <div className="flex justify-between items-center">
                  <span className="font-bold text-slate-200">🗺️ رندرهای نقشه</span>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${mapBadge.color} bg-black/30`}>{mapBadge.label}</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-lg font-bold font-mono text-white">{mapMetrics.latestDurationMs !== null ? `${mapMetrics.latestDurationMs}ms` : '—'}</span>
                  <span className="text-[10px] text-slate-400">آخرین</span>
                </div>
                <div className="flex justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-700/40">
                  <span>میانگین: {mapMetrics.avgDurationMs}ms</span>
                  <span>p95: {mapMetrics.p95DurationMs}ms</span>
                  <span>تعداد: {mapMetrics.count}</span>
                </div>
              </div>

              <div className={`p-2.5 rounded-xl border ${filterBadge.bg} space-y-1`}>
                <div className="flex justify-between items-center">
                  <span className="font-bold text-slate-200">🔍 محاسبات فیلتر</span>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${filterBadge.color} bg-black/30`}>{filterBadge.label}</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-lg font-bold font-mono text-white">{filterMetrics.latestDurationMs !== null ? `${filterMetrics.latestDurationMs}ms` : '—'}</span>
                  <span className="text-[10px] text-slate-400">آخرین</span>
                </div>
                <div className="flex justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-700/40">
                  <span>میانگین: {filterMetrics.avgDurationMs}ms</span>
                  <span>p95: {filterMetrics.p95DurationMs}ms</span>
                  <span>تعداد: {filterMetrics.count}</span>
                </div>
              </div>
            </div>

            <section className="bg-slate-800/50 p-2.5 rounded-xl border border-slate-700/50 text-[11px] space-y-2">
              <div className="flex justify-between items-center text-slate-300 font-bold">
                <span>ریزعملیات‌های تحت رصد</span>
                <span className="text-[10px] text-slate-400 font-mono">بافر: {events.length}/100 رویداد</span>
              </div>
              <div className="space-y-1.5 font-mono text-[10px]">
                {Object.entries({ ...mapMetrics.actions, ...filterMetrics.actions }).map(([action, meta]) => {
                  const percent = Math.min(100, Math.round((meta.avgMs / 50) * 100));
                  return (
                    <div key={action} className="bg-slate-900/60 p-1.5 rounded-lg border border-slate-800 space-y-1">
                      <div className="flex justify-between text-slate-300">
                        <span className="truncate max-w-[240px] text-slate-200 font-semibold">{action}</span>
                        <span>{meta.latestMs}ms (میانگین {meta.avgMs}ms | {meta.count} بار)</span>
                      </div>
                      <div className="w-full bg-slate-800 h-1 rounded-full overflow-hidden">
                        <div className={`h-full transition-all duration-300 ${meta.avgMs <= 16.6 ? 'bg-emerald-400' : meta.avgMs <= 50 ? 'bg-amber-400' : 'bg-rose-500'}`} style={{ width: `${percent}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section aria-label="عملکرد موتور نقشه (Diff)" className="bg-slate-800/50 p-2.5 rounded-xl border border-slate-700/50 text-[10px] space-y-1.5">
              <div className="flex justify-between items-center text-slate-300 font-bold text-[11px]">
                <span>عملکرد موتور نقشه (Diff)</span>
                <span className="text-slate-400 font-mono">{layerProfiles.length}/60 لایه</span>
              </div>
              {layerProfiles.length === 0 ? (
                <div className="text-slate-500 py-1">هنوز عملیات تطبیق لایه‌ای ثبت نشده است.</div>
              ) : (
                <div className="max-h-28 overflow-y-auto border border-slate-800 rounded-lg bg-slate-950/60 font-mono divide-y divide-slate-800/70">
                  {layerProfiles.slice(0, 12).map((p) => (
                    <div key={p.id} className="grid grid-cols-[76px_1fr_44px] items-center gap-1.5 px-2 py-1 text-slate-300">
                      <span className="text-sky-300 font-bold truncate">{p.layer}</span>
                      <span className="truncate text-[9.5px]">+{p.created} / ~{p.updated} / -{p.removed} / ={p.retained} · <span className="text-slate-400">{p.reason}</span></span>
                      <span className="text-left text-emerald-300">{p.durationMs}ms</span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-300">رویدادهای زنده رینگ‌بافر</span>
                <div className="flex gap-1 text-[10px]">
                  {(['All', 'Map', 'Filter', 'Other'] as const).map((sc) => (
                    <button
                      key={sc} type="button" onClick={() => setScopeFilter(sc)}
                      className={`px-2 py-0.5 rounded transition-colors ${scopeFilter === sc ? 'bg-sky-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
                    >
                      {sc === 'All' ? 'همه' : sc}
                    </button>
                  ))}
                </div>
              </div>

              <div className="max-h-36 overflow-y-auto border border-slate-800 rounded-xl bg-slate-950/60 p-1 divide-y divide-slate-800/60 text-[10px] font-mono">
                {filteredEvents.length === 0 ? (
                  <div className="text-center py-4 text-slate-500">هیچ رویدادی در این دسته ثبت نشده است.</div>
                ) : (
                  filteredEvents.slice(0, 30).map((evt) => (
                    <div key={evt.id} className="py-1 px-1.5 flex items-center justify-between hover:bg-slate-900/60">
                      <div className="flex items-center gap-1.5 truncate">
                        <span className={`w-1.5 h-1.5 rounded-full ${evt.outcome === 'success' ? 'bg-emerald-400' : evt.outcome === 'fallback' ? 'bg-amber-400' : 'bg-rose-400'}`} />
                        <span className="text-sky-400 font-bold">[{evt.scope}]</span>
                        <span className="text-slate-300 truncate">{evt.action}</span>
                      </div>
                      <div className="text-slate-400 shrink-0">{evt.durationMs !== undefined ? `${evt.durationMs}ms` : '—'}</div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>

          <footer className="p-3 bg-slate-800/80 border-t border-slate-700/60 flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-1.5">
              <button
                type="button" onClick={handleRunMicroBenchmark} disabled={benchmarking}
                data-measurement-source="SYNTHETIC_LOCAL"
                className="px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg font-medium transition-all shadow"
              >
                {benchmarking ? 'در حال تست...' : '🧪 بنچمارک مصنوعی (SYNTHETIC_LOCAL)'}
              </button>
              <button type="button" onClick={refreshData} className="px-2.5 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg transition-colors">
                🔄 تازه‌سازی
              </button>
            </div>
            <div className="flex items-center gap-1.5">
              <button type="button" onClick={handleCopyReport} className="px-2.5 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg transition-colors">
                {copied ? '✓ کپی شد' : '📋 کپی گزارش'}
              </button>
              <button
                type="button" onClick={() => { clearDiagnosticEvents(); refreshData(); }}
                className="px-2.5 py-1.5 bg-rose-600/30 hover:bg-rose-600/50 text-rose-300 border border-rose-500/40 rounded-lg transition-colors"
              >
                🧹 پاکسازی
              </button>
            </div>
          </footer>
        </div>
      )}
    </aside>
  );
};
