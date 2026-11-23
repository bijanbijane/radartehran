import React, { useCallback, useEffect, useState } from 'react';
import { Activity, AlertTriangle, CheckCircle2, RefreshCw, ShieldCheck } from 'lucide-react';
import { getAuthClient } from '../platform/auth';

interface WorkerDiagnostics {
  status: 'ok';
  environment?: string;
  operationalVisibility?: {
    workerHealth?: string;
    d1Status?: string;
    userDbStatus?: string;
    researchDbStatus?: string;
    r2Status?: string;
    kvStatus?: string;
    queueStatus?: string;
    dlqStatus?: string;
    migrationStatus?: {
      appliedCount?: number;
      expectedCount?: number;
      pendingMigrations?: string[];
      allCanonicalMigrationsApplied?: boolean;
    };
  };
}

const STATUS_LABELS: Record<string, string> = {
  healthy: 'سالم',
  degraded_pending_migrations: 'نیازمند تکمیل Migration',
  bound: 'متصل',
  unbound: 'متصل نیست',
};

export function AdminEnvConfigPanel(): React.ReactElement {
  const [report, setReport] = useState<WorkerDiagnostics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!getAuthClient().getUser()) {
      setReport(null);
      setError('برای مشاهده وضعیت زیرساخت، ورود مدیر لازم است.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/worker-diagnostics', {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      const payload = await response.json().catch(() => null) as WorkerDiagnostics | null;
      if (!response.ok || payload?.status !== 'ok') {
        throw new Error(response.status === 403 ? 'این گزارش فقط برای مدیر مجاز است.' : 'گزارش عملیاتی Worker در دسترس نیست.');
      }
      setReport(payload);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'خطا در دریافت گزارش زیرساخت Cloudflare');
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const client = getAuthClient();
    void client.refreshSession().then((user) => { if (user) void refresh(); }).catch(() => undefined);
    const unsubscribe = client.subscribe((state, user) => {
      if ((state === 'READY' || state === 'AUTHENTICATED') && user) void refresh();
    });
    return unsubscribe;
  }, [refresh]);

  const visibility = report?.operationalVisibility;
  const migration = visibility?.migrationStatus;
  const rows = [
    ['سلامت Worker', visibility?.workerHealth],
    ['USER_DB', visibility?.userDbStatus],
    ['RESEARCH_DB', visibility?.researchDbStatus],
    ['R2 رسانه', visibility?.r2Status],
    ['KV', visibility?.kvStatus],
    ['Queue', visibility?.queueStatus],
    ['Dead Letter Queue', visibility?.dlqStatus],
  ] as const;

  return (
    <section className="space-y-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 font-extrabold text-slate-900 dark:text-white">
          <ShieldCheck className="h-5 w-5 text-emerald-600" />
          وضعیت زیرساخت Cloudflare
        </div>
        <button type="button" onClick={() => void refresh()} disabled={loading} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs font-bold disabled:opacity-50">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          بازخوانی
        </button>
      </div>
      {error && <div role="alert" className="flex items-center gap-2 rounded-xl bg-amber-50 dark:bg-amber-950/30 p-3 text-xs text-amber-800 dark:text-amber-200"><AlertTriangle className="h-4 w-4 shrink-0" />{error}</div>}
      {report && (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {rows.map(([label, value]) => (
              <div key={label} className="rounded-xl border border-slate-200 dark:border-slate-700 p-3">
                <div className="text-[11px] text-slate-500 dark:text-slate-400">{label}</div>
                <div className="mt-1 flex items-center gap-1.5 text-xs font-extrabold text-slate-900 dark:text-white">
                  {value === 'bound' || value === 'healthy' ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <Activity className="h-3.5 w-3.5 text-amber-600" />}
                  {value ? STATUS_LABELS[value] || value : 'نامشخص'}
                </div>
              </div>
            ))}
          </div>
          <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3 text-xs">
            <div className="font-bold text-slate-800 dark:text-slate-100">وضعیت Migration پایگاه کاربری</div>
            <div className="mt-1 text-slate-600 dark:text-slate-300">
              {migration ? `${migration.appliedCount ?? 0} از ${migration.expectedCount ?? 0} Migration اجرا شده` : 'اطلاعات Migration موجود نیست'}
            </div>
            {migration?.pendingMigrations?.length ? <div className="mt-2 text-amber-700 dark:text-amber-300">Migrationهای باقی‌مانده: {migration.pendingMigrations.join('، ')}</div> : null}
          </div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400">محیط: {report.environment || 'نامشخص'} · این پنل فقط وضعیت را می‌خواند؛ تغییر Secret و Binding باید از مسیر کنترل‌شده استقرار Cloudflare انجام شود.</div>
        </>
      )}
      {!report && loading && <div className="text-xs text-slate-500">در حال دریافت وضعیت Worker...</div>}
    </section>
  );
}
