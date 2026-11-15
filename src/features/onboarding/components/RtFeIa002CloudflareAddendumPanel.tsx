import React, { useMemo, useState } from 'react';
import {
  RT_FE_IA_002_CF_001_SPEC_ID,
  CF_DUAL_ROUTING_TABLE_10,
  CF_ISOLATED_ENVIRONMENTS_3,
  CF_CACHE_POLICIES_8,
  CF_SECURITY_HEADERS_5,
  CF_REDIRECT_MATRIX_6,
  CF_REQUIREMENTS_15,
  CF_TEST_SCENARIOS_14,
  CF_DELIVERABLES_12,
  simulateCloudflareWorkerRequest,
} from '../services/rtFeIa002CloudflareAddendumEngine';

export const RtFeIa002CloudflareAddendumPanel: React.FC = () => {
  const [simUrl, setSimUrl] = useState<string>('/properties/PR-1024');
  const [clientBuild, setClientBuild] = useState<string>('2026.11.15-r1');
  const [edgeBuild, setEdgeBuild] = useState<string>('2026.11.15-r1');

  const edgeSimulation = useMemo(
    () =>
      simulateCloudflareWorkerRequest({
        requestUrl: simUrl,
        configuredApiOrigin: 'https://api.example.com',
        clientBuildVersion: clientBuild,
        edgeActiveBuildVersion: edgeBuild,
      }),
    [simUrl, clientBuild, edgeBuild],
  );

  return (
    <div className="space-y-4 text-right" dir="rtl" data-testid="rt-fe-ia-002-cf-001-panel">
      {/* Banner */}
      <div className="rounded-xl border border-amber-500/30 bg-slate-950/80 p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <span className="rounded bg-amber-500/20 px-2 py-0.5 font-mono text-[11px] font-bold text-amber-300">
              {RT_FE_IA_002_CF_001_SPEC_ID}
            </span>
            <h5 className="mt-1 text-xs font-bold text-white">
              متمم معماری اطلاعات و مسیریابی برای استقرار روی Cloudflare (React SPA + Vite + Cloudflare Workers Static Assets)
            </h5>
          </div>
          <span className="rounded border border-emerald-500/40 bg-emerald-950/40 px-2.5 py-1 font-mono text-[11px] text-emerald-300">
            not_found_handling: &quot;single-page-application&quot; | run_worker_first: [&quot;/api/*&quot;]
          </span>
        </div>
      </div>

      {/* Live Edge vs React Router Simulator */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-3">
          <h6 className="text-xs font-bold text-amber-300">
            شبیه‌ساز زنده رفتار لبه شبکه Cloudflare Worker در برابر React Router (CF-T01..CF-T14)
          </h6>
          <div className="flex flex-wrap gap-1.5">
            {[
              '/',
              '/map',
              '/properties/PR-1024',
              '/property/PR-1024',
              '/api/health',
              '/api/invalid',
              '/assets/app-8f91c2.js',
              '/robots.txt',
            ].map((sample) => (
              <button
                key={sample}
                type="button"
                onClick={() => setSimUrl(sample)}
                className={`rounded px-2 py-1 font-mono text-[11px] ${
                  simUrl === sample ? 'bg-amber-600 text-white' : 'bg-slate-800 text-slate-300'
                }`}
                dir="ltr"
              >
                {sample}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <label className="space-y-1">
              <span className="text-slate-400">مسیر درخواست:</span>
              <input
                type="text"
                dir="ltr"
                value={simUrl}
                onChange={(e) => setSimUrl(e.target.value)}
                className="w-full rounded border border-slate-700 bg-slate-950 p-1.5 font-mono text-white"
              />
            </label>
            <label className="space-y-1">
              <span className="text-slate-400">نسخه باندل کلاینت:</span>
              <input
                type="text"
                dir="ltr"
                value={clientBuild}
                onChange={(e) => setClientBuild(e.target.value)}
                className="w-full rounded border border-slate-700 bg-slate-950 p-1.5 font-mono text-white"
              />
            </label>
            <label className="space-y-1">
              <span className="text-slate-400">نسخه فعال روی Edge:</span>
              <input
                type="text"
                dir="ltr"
                value={edgeBuild}
                onChange={(e) => setEdgeBuild(e.target.value)}
                className="w-full rounded border border-slate-700 bg-slate-950 p-1.5 font-mono text-white"
              />
            </label>
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-950 p-3 text-xs space-y-1">
            <div>
              <span className="text-slate-400">مسئول رسیدگی در لبه شبکه: </span>
              <span className="font-mono font-bold text-amber-300">{edgeSimulation.handledBy}</span>
            </div>
            <div>
              <span className="text-slate-400">وضعیت و نوع محتوا: </span>
              <span className="font-mono text-emerald-300">
                HTTP {edgeSimulation.statusCode} ({edgeSimulation.contentType})
              </span>
            </div>
            <div>
              <span className="text-slate-400">هدر Cache-Control: </span>
              <span className="font-mono text-cyan-300" dir="ltr">{edgeSimulation.cacheControl}</span>
            </div>
            {edgeSimulation.proxiedUpstreamUrl && (
              <div>
                <span className="text-slate-400">مقصد پراکسی یا تغییر مسیر: </span>
                <span className="font-mono text-indigo-300" dir="ltr">{edgeSimulation.proxiedUpstreamUrl}</span>
              </div>
            )}
            <div className="pt-1 text-slate-200">{edgeSimulation.summaryFa}</div>
          </div>
        </div>

        {/* Dual-Level Routing Table + 3 Isolated Environments */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-3">
          <h6 className="text-xs font-bold text-cyan-300">
            جدول تفکیک مسیریابی ۲سطحی (Edge در برابر React Router — CF-OUT-02) و ۳ محیط ایزوله (CF-OUT-05)
          </h6>
          <div className="max-h-44 overflow-y-auto">
            <table className="w-full text-right text-[11px]">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="py-1 px-1.5">مسیر</th>
                  <th className="py-1 px-1.5">لایه مسئول</th>
                  <th className="py-1 px-1.5">رفتار مورد انتظار</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {CF_DUAL_ROUTING_TABLE_10.map((row) => (
                  <tr key={row.pathPattern}>
                    <td className="py-1 px-1.5 font-mono text-amber-300" dir="ltr">{row.pathPattern}</td>
                    <td className="py-1 px-1.5 font-mono text-cyan-300">{row.handlingLayer}</td>
                    <td className="py-1 px-1.5 text-slate-300">{row.expectedBehaviorFa}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3 pt-1">
            {CF_ISOLATED_ENVIRONMENTS_3.map((env) => (
              <div key={env.envKey} className="rounded border border-slate-800 bg-slate-950 p-2 text-[11px]">
                <div className="font-mono font-bold text-emerald-300">{env.workerName}</div>
                <div className="font-mono text-[10px] text-slate-400" dir="ltr">{env.apiBaseUrlVar}</div>
                <div className="mt-0.5 text-[10px] text-slate-300">{env.explicitBindingsNoteFa}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Cache Policies, Security Headers, Redirect Matrix & 15 CF Requirements */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3.5 space-y-1.5 text-[11px]">
          <div className="font-bold text-emerald-300">سیاست کش ۸گانه در لبه شبکه (CF-OUT-06)</div>
          {CF_CACHE_POLICIES_8.map((c) => (
            <div key={c.pathMatch} className="rounded border border-slate-800/80 bg-slate-950/60 p-1.5">
              <div className="flex justify-between">
                <span className="font-bold text-white">{c.resourceCategoryFa}</span>
                <span className="font-mono text-amber-300" dir="ltr">{c.pathMatch}</span>
              </div>
              <div className="font-mono text-[10px] text-cyan-300" dir="ltr">{c.cacheControlHeader}</div>
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3.5 space-y-2 text-[11px]">
          <div className="font-bold text-indigo-300">هدرهای امنیتی (CF-OUT-07) و جدول تصمیم تغییر مسیر (CF-OUT-08)</div>
          {CF_SECURITY_HEADERS_5.map((h) => (
            <div key={h.headerName} className="text-slate-300">
              <span className="font-mono text-cyan-300">{h.headerName}:</span> {h.purposeFa}
            </div>
          ))}
          <div className="border-t border-slate-800 pt-1.5 space-y-1">
            {CF_REDIRECT_MATRIX_6.map((rm) => (
              <div key={rm.redirectTypeFa} className="text-slate-300">
                <span className="font-mono text-amber-300">[{rm.implementationLayer}]</span> {rm.redirectTypeFa}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3.5 space-y-1.5 text-[11px]">
          <div className="font-bold text-amber-300">
            الزامات CF-IA-001..015 ({CF_REQUIREMENTS_15.length} مورد)، آزمون‌های CF-T01..T14 ({CF_TEST_SCENARIOS_14.length} سناریو) و CF-OUT-01..12 ({CF_DELIVERABLES_12.length} خروجی)
          </div>
          <div className="max-h-56 overflow-y-auto space-y-1">
            {CF_REQUIREMENTS_15.map((req) => (
              <div key={req.id} className="text-slate-300">
                <span className="font-mono text-emerald-300">✓ {req.id}:</span> {req.titleFa}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
