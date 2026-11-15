import React, { useMemo, useState } from 'react';
import {
  RT_FE_IA_002_SPEC_ID,
  RT_FE_IA_PRINCIPLES_10,
  RT_FE_IA_5_SPACES,
  RT_FE_IA_CENTRAL_ROUTE_REGISTRY,
  RT_FE_IA_ROUTE_REQUIREMENTS_15,
  RT_FE_IA_DELIVERABLES_15,
  type AccessLevel,
  type InformationSpaceId,
} from '../services/rtFeIa002InformationArchitectureTypes';
import {
  evaluateIaRouteAccessAndLifecycle,
  sanitizeAndParseShareableUrlQuery,
  validateUrlNamingStandard,
  evaluateRtFeIa002Stage3Gate,
} from '../services/rtFeIa002RoutingAndUrlEngine';
import { RtFeIa002CloudflareAddendumPanel } from './RtFeIa002CloudflareAddendumPanel';

export const RtFeIa002InformationArchitectureSubpanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'registry' | 'guard' | 'url_contract' | 'cloudflare'>('registry');
  const [spaceFilter, setSpaceFilter] = useState<InformationSpaceId | 'all'>('all');
  const [simPath, setSimPath] = useState<string>('/properties/PR-1024');
  const [simAuth, setSimAuth] = useState<boolean>(false);
  const [simRole, setSimRole] = useState<AccessLevel>('guest');
  const [simEntityExists, setSimEntityExists] = useState<boolean>(true);
  const [simNetworkError, setSimNetworkError] = useState<boolean>(false);
  const [rawQueryInput, setRawQueryInput] = useState<string>(
    'region=5&neighborhood=punak&dealType=buy&priceMin=5000000000&priceMax=12000000000&rooms=2&sort=price_asc&page=1&view=split',
  );

  const stage3Gate = useMemo(() => evaluateRtFeIa002Stage3Gate(), []);
  const filteredRoutes = useMemo(
    () => (spaceFilter === 'all' ? RT_FE_IA_CENTRAL_ROUTE_REGISTRY : RT_FE_IA_CENTRAL_ROUTE_REGISTRY.filter((r) => r.space === spaceFilter)),
    [spaceFilter],
  );
  const accessOutcome = useMemo(
    () =>
      evaluateIaRouteAccessAndLifecycle({
        requestedPath: simPath,
        isAuthenticated: simAuth,
        userRole: simAuth ? simRole : 'guest',
        entityExists: simEntityExists,
        networkError: simNetworkError,
      }),
    [simPath, simAuth, simRole, simEntityExists, simNetworkError],
  );
  const parsedQueryResult = useMemo(() => sanitizeAndParseShareableUrlQuery(rawQueryInput), [rawQueryInput]);
  const namingVerdict = useMemo(() => validateUrlNamingStandard(simPath), [simPath]);

  return (
    <div className="space-y-4 text-right" dir="rtl" data-testid="rt-fe-ia-002-panel">
      <div className="rounded-xl border border-cyan-500/30 bg-slate-900/90 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded bg-cyan-500/20 px-2 py-0.5 font-mono text-[11px] font-bold text-cyan-300">{RT_FE_IA_002_SPEC_ID}</span>
              <span className="rounded bg-indigo-500/20 px-2 py-0.5 text-[11px] font-bold text-indigo-300">
                بخش ۲ از ۲۸ + متمم استقرار Cloudflare (RT-FE-IA-002-CF-001)
              </span>
            </div>
            <h4 className="mt-1.5 text-sm font-bold text-white">
              مرحله دوم: معماری اطلاعات، ساختار صفحات، نظام مسیریابی و هم‌راستاسازی لبه شبکه Cloudflare
            </h4>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="rounded-lg border border-slate-700 bg-slate-800/80 px-2.5 py-1 text-slate-200">
              {stage3Gate.totalRegisteredRoutes} مسیر ثبت‌شده
            </span>
            <span className="rounded-lg border border-emerald-500/40 bg-emerald-950/50 px-2.5 py-1 font-bold text-emerald-300">
              دروازه مرحله ۳: {stage3Gate.readyForStage3 ? 'آماده و تاییدشده' : 'نیازمند بازبینی'}
            </span>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-slate-800 pt-3">
          {[
            { id: 'registry', label: '۱. فضاهای ۵گانه و رجیستری مرکزی مسیرها (OUT-01..09)' },
            { id: 'guard', label: '۲. شبیه‌ساز ۴مرحله‌ای حفاظت مسیر و تفکیک ۴۰۴/۴۰۳/خطای شبکه' },
            { id: 'url_contract', label: '۳. قرارداد Query پارامترهای قابل اشتراک، چرخه حیات و الزامات' },
            { id: 'cloudflare', label: '۴. متمم معماری اطلاعات و مسیریابی روی Cloudflare (RT-FE-IA-002-CF-001)' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              data-testid={`rt-fe-ia-tab-${tab.id}`}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                activeTab === tab.id ? 'bg-cyan-600 text-white' : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'registry' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-5">
            {RT_FE_IA_5_SPACES.map((sp) => (
              <button
                key={sp.id}
                type="button"
                onClick={() => setSpaceFilter(spaceFilter === sp.id ? 'all' : sp.id)}
                className={`rounded-xl border p-2.5 text-right transition-colors ${
                  spaceFilter === sp.id ? 'border-cyan-500 bg-cyan-950/40' : 'border-slate-800 bg-slate-900/70 hover:border-slate-700'
                }`}
              >
                <div className="text-xs font-bold text-white">{sp.titleFa}</div>
                <div className="mt-0.5 text-[10px] text-cyan-300">قالب: {sp.defaultLayout}</div>
              </button>
            ))}
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
            <h5 className="mb-2 text-xs font-bold text-cyan-300">رجیستری مرکزی مسیرها ({filteredRoutes.length} مسیر)</h5>
            <div className="max-h-72 overflow-y-auto space-y-1">
              {filteredRoutes.map((route) => (
                <div key={route.id} className="flex items-center justify-between rounded border border-slate-800 bg-slate-950/60 p-1.5 text-xs">
                  <span className="font-bold text-white">{route.title}</span>
                  <span className="font-mono text-cyan-300" dir="ltr">{route.path}</span>
                  <span className="font-mono text-indigo-300">{route.module} / {route.layout} / {route.access}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'guard' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 text-xs">
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-3">
            <h5 className="font-bold text-cyan-300">شبیه‌ساز ۴مرحله‌ای حفاظت مسیر و تغییر مسیرهای قدیمی</h5>
            <div className="flex flex-wrap gap-1.5">
              {['/properties/PR-1024', '/property/PR-1024', '/account/profile', '/admin/dashboard', '/unknown-route'].map((preset) => (
                <button key={preset} type="button" onClick={() => setSimPath(preset)} className={`rounded px-2 py-1 font-mono text-[11px] ${simPath === preset ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-300'}`} dir="ltr">
                  {preset}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input type="text" dir="ltr" value={simPath} onChange={(e) => setSimPath(e.target.value)} className="rounded border border-slate-700 bg-slate-950 p-1.5 font-mono text-white" />
              <select value={simRole} onChange={(e) => setSimRole(e.target.value as AccessLevel)} className="rounded border border-slate-700 bg-slate-950 p-1.5 text-white">
                <option value="guest">guest</option>
                <option value="authenticated">authenticated</option>
                <option value="admin">admin</option>
              </select>
            </div>
            <div className="flex flex-wrap gap-3 text-slate-300">
              <label className="flex items-center gap-1"><input type="checkbox" checked={simAuth} onChange={(e) => setSimAuth(e.target.checked)} /> احراز هویت شده</label>
              <label className="flex items-center gap-1"><input type="checkbox" checked={simEntityExists} onChange={(e) => setSimEntityExists(e.target.checked)} /> موجودیت موجود</label>
              <label className="flex items-center gap-1"><input type="checkbox" checked={simNetworkError} onChange={(e) => setSimNetworkError(e.target.checked)} /> خطای شبکه</label>
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-1.5">
            <h5 className="font-bold text-emerald-300">خروجی تصمیم مسیریاب و تفکیک ۳گانه خطاها</h5>
            <div className="rounded border border-slate-800 bg-slate-950 p-3 space-y-1">
              <div>وضعیت: <strong className="font-mono text-cyan-300">{accessOutcome.resolution}</strong> (HTTP {accessOutcome.httpEquivalentStatus})</div>
              <div>مسیر نهایی: <code className="text-emerald-300" dir="ltr">{accessOutcome.redirectTo ?? accessOutcome.effectivePath}</code></div>
              <div>قالب: <code className="text-indigo-300">{accessOutcome.selectedLayout}</code></div>
              <div className="text-slate-300">{accessOutcome.reasonFa}</div>
              <div className="text-[11px] text-slate-400">نام‌گذاری مسیر: {namingVerdict.valid ? '✓ معتبر' : namingVerdict.violationsFa.join('، ')}</div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'url_contract' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 text-xs">
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-2.5">
            <h5 className="font-bold text-cyan-300">پالایشگر قرارداد پارامترهای آدرس قابل اشتراک (OUT-08, OUT-12)</h5>
            <input type="text" dir="ltr" value={rawQueryInput} onChange={(e) => setRawQueryInput(e.target.value)} className="w-full rounded border border-slate-700 bg-slate-950 p-2 font-mono text-white" />
            <div className="rounded border border-slate-800 bg-slate-950 p-2.5 font-mono text-emerald-300" dir="ltr">
              ?{parsedQueryResult.canonicalQueryString}
            </div>
            {RT_FE_IA_PRINCIPLES_10.map((p) => (
              <div key={p.id} className="text-[11px] text-slate-300"><span className="font-mono text-cyan-300">{p.id}:</span> {p.titleFa}</div>
            ))}
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 grid grid-cols-2 gap-2 text-[11px]">
            <div>
              <div className="mb-1 font-bold text-emerald-300">الزامات ROUTE-001..015</div>
              {RT_FE_IA_ROUTE_REQUIREMENTS_15.map((req) => <div key={req.id} className="text-slate-300">✓ {req.id}: {req.titleFa}</div>)}
            </div>
            <div>
              <div className="mb-1 font-bold text-cyan-300">خروجی‌های OUT-01..15</div>
              {RT_FE_IA_DELIVERABLES_15.map((del) => <div key={del.id} className="text-slate-300">✓ {del.id}: {del.titleFa}</div>)}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'cloudflare' && <RtFeIa002CloudflareAddendumPanel />}
    </div>
  );
};
