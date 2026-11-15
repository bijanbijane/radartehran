/**
 * @file src/features/account/components/SystemHealthDashboardCard.tsx
 * @description Live System Health Dashboard in Settings showing real-time Online/Offline status
 * and measured response latency (ms) for Firebase, Casper Hub, and Cloud Databases.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity,
  CheckCircle2,
  Cloud,
  Cpu,
  Database,
  RefreshCw,
  WifiOff,
  AlertTriangle,
  Clock,
} from 'lucide-react';
import {
  executeLiveSystemHealthProbes,
  type ServiceHealthProbeResult,
  type SystemHealthDashboardSnapshot,
} from '../services/systemHealthProbeService';

export const SystemHealthDashboardCard: React.FC = () => {
  const [snapshot, setSnapshot] = useState<SystemHealthDashboardSnapshot | null>(null);
  const [probing, setProbing] = useState<boolean>(false);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const mountedRef = useRef<boolean>(true);

  const runProbe = useCallback(async () => {
    if (!mountedRef.current) return;
    setProbing(true);
    try {
      const result = await executeLiveSystemHealthProbes();
      if (mountedRef.current) {
        setSnapshot(result);
      }
    } finally {
      if (mountedRef.current) {
        setProbing(false);
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void runProbe();
    const handleOnlineChange = () => {
      void runProbe();
    };
    window.addEventListener('online', handleOnlineChange);
    window.addEventListener('offline', handleOnlineChange);
    return () => {
      mountedRef.current = false;
      window.removeEventListener('online', handleOnlineChange);
      window.removeEventListener('offline', handleOnlineChange);
    };
  }, [runProbe]);

  useEffect(() => {
    if (!autoRefresh) return undefined;
    const timer = window.setInterval(() => {
      void runProbe();
    }, 30_000);
    return () => {
      window.clearInterval(timer);
    };
  }, [autoRefresh, runProbe]);

  const getStatusBadgeClasses = (status: ServiceHealthProbeResult['status']) => {
    if (status === 'online') {
      return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800';
    }
    if (status === 'degraded') {
      return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800';
    }
    return 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800';
  };

  const getDotColor = (status: ServiceHealthProbeResult['status']) => {
    if (status === 'online') return 'bg-emerald-500';
    if (status === 'degraded') return 'bg-amber-500';
    return 'bg-rose-500';
  };

  const getLatencyBarWidth = (ms: number | null) => {
    if (ms === null || !Number.isFinite(ms)) return '0%';
    const pct = Math.max(12, Math.min(100, Math.round((1 - Math.min(ms, 800) / 900) * 100)));
    return `${pct}%`;
  };

  const getServiceIcon = (id: ServiceHealthProbeResult['id']) => {
    if (id === 'firebase') return <Cloud className="w-4 h-4 text-teal-600 dark:text-teal-400" />;
    if (id === 'casperHub') return <Cpu className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />;
    return <Database className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />;
  };

  const servicesList: ServiceHealthProbeResult[] = snapshot
    ? [snapshot.services.firebase, snapshot.services.casperHub, snapshot.services.cloudDatabase]
    : [];

  return (
    <section
      dir="rtl"
      data-testid="system-health-dashboard"
      aria-label="داشبورد سلامت سیستم و وضعیت اتصال سرویس‌های ابری"
      className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 p-4 sm:p-5 shadow-xs space-y-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3.5">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-teal-50 dark:bg-teal-950/60 border border-teal-200/70 dark:border-teal-800 flex items-center justify-center text-teal-700 dark:text-teal-300">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-black text-slate-900 dark:text-white">
                داشبورد سلامت سیستم (System Health)
              </h3>
              {snapshot && (
                <span
                  data-testid="system-health-overall-badge"
                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-bold border ${getStatusBadgeClasses(snapshot.overallStatus)}`}
                >
                  <span className={`w-2 h-2 rounded-full ${getDotColor(snapshot.overallStatus)} animate-pulse`} />
                  {snapshot.overallStatus === 'online'
                    ? 'همه سرویس‌ها آنلاین'
                    : snapshot.overallStatus === 'degraded'
                      ? 'پایدار (با حالت جایگزین)'
                      : 'آفلاین'}
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              پایش زنده وضعیت اتصال و زمان پاسخ‌دهی (Latency) برای Firebase، کسپر هاب و دیتابیس‌های ابری
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <label className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-600 dark:text-slate-300 cursor-pointer select-none bg-slate-100 dark:bg-slate-800 px-2.5 py-1.5 rounded-lg">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded text-teal-600 focus:ring-teal-500"
            />
            <span>بروزرسانی خودکار</span>
          </label>
          <button
            type="button"
            data-testid="system-health-refresh-btn"
            onClick={() => void runProbe()}
            disabled={probing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white transition cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${probing ? 'animate-spin' : ''}`} />
            <span>{probing ? 'در حال پینگ...' : 'تست پینگ زنده'}</span>
          </button>
        </div>
      </div>

      {/* Summary KPI Strip */}
      {snapshot && (
        <div className="grid grid-cols-3 gap-2.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl p-2.5 border border-slate-200/60 dark:border-slate-800 text-xs">
          <div className="flex items-center justify-between px-2">
            <span className="text-slate-500 dark:text-slate-400 font-bold">امتیاز پایداری شبکه:</span>
            <span className="font-black text-slate-900 dark:text-white" data-testid="system-health-score">
              {snapshot.overallScorePct.toLocaleString('fa-IR')}٪
            </span>
          </div>
          <div className="flex items-center justify-between px-2 border-r border-slate-200 dark:border-slate-700">
            <span className="text-slate-500 dark:text-slate-400 font-bold">میانگین زمان پاسخ:</span>
            <span className="font-black font-mono text-teal-700 dark:text-teal-300" data-testid="system-health-avg-latency">
              {snapshot.averageLatencyMs !== null ? `${snapshot.averageLatencyMs} ms` : '—'}
            </span>
          </div>
          <div className="flex items-center justify-between px-2 border-r border-slate-200 dark:border-slate-700">
            <span className="text-slate-500 dark:text-slate-400 font-bold flex items-center gap-1">
              <Clock className="w-3 h-3" /> آخرین بررسی:
            </span>
            <span className="font-bold text-slate-700 dark:text-slate-200">{snapshot.checkedAtFa}</span>
          </div>
        </div>
      )}

      {/* Three Service Cards: Firebase, Casper Hub, Cloud Databases */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {servicesList.map((srv) => (
          <div
            key={srv.id}
            data-testid={`health-service-card-${srv.id}`}
            className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/30 p-3.5 flex flex-col justify-between gap-2.5"
          >
            <div className="space-y-1.5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center shrink-0">
                    {getServiceIcon(srv.id)}
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-slate-900 dark:text-white leading-tight">{srv.titleFa}</h4>
                    <p className="text-[10px] font-mono text-slate-400 dark:text-slate-500">{srv.subtitleEn}</p>
                  </div>
                </div>
                <span
                  data-testid={`health-status-${srv.id}`}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border shrink-0 ${getStatusBadgeClasses(srv.status)}`}
                >
                  {srv.status === 'online' ? (
                    <CheckCircle2 className="w-3 h-3" />
                  ) : srv.status === 'degraded' ? (
                    <AlertTriangle className="w-3 h-3" />
                  ) : (
                    <WifiOff className="w-3 h-3" />
                  )}
                  {srv.statusLabelFa}
                </span>
              </div>

              <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">{srv.detailFa}</p>
            </div>

            <div className="pt-2 border-t border-slate-200/60 dark:border-slate-700/60 space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-500 dark:text-slate-400 font-bold">زمان پاسخ (Latency):</span>
                <div className="flex items-center gap-1.5">
                  <span
                    data-testid={`health-latency-${srv.id}`}
                    className="font-mono font-black text-slate-900 dark:text-white bg-white dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700"
                  >
                    {srv.latencyMs !== null ? `${srv.latencyMs} ms` : 'آفلاین'}
                  </span>
                  <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">({srv.latencyBadgeFa})</span>
                </div>
              </div>
              <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${getDotColor(srv.status)}`}
                  style={{ width: getLatencyBarWidth(srv.latencyMs) }}
                />
              </div>
              <div className="text-[10px] font-mono text-slate-400 dark:text-slate-500 truncate" title={srv.endpointLabel}>
                {srv.endpointLabel}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};
export default SystemHealthDashboardCard;
