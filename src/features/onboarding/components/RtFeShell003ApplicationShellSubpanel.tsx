import React, { useMemo, useState } from 'react';
import {
  RT_FE_SHELL_003_SPEC_ID,
  RT_FE_SHELL_4_LAYOUTS,
  RT_FE_SHELL_PRIMARY_NAV_7,
  RT_FE_SHELL_MODULE_SIDEBARS,
  RT_FE_SHELL_OVERLAY_HOSTS_8,
  RT_FE_SHELL_BREAKPOINTS_6,
  RT_FE_SHELL_A11Y_10,
  RT_FE_SHELL_DELIVERABLES_15,
  resolveShellConfigurationForRoute,
} from '../services/rtFeShell003ApplicationShellEngine';

export const RtFeShell003ApplicationShellSubpanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'layouts' | 'navigation' | 'simulator' | 'overlays_a11y'>('layouts');
  const [simPath, setSimPath] = useState<string>('/properties/PR-1024');
  const [simViewportWidth, setSimViewportWidth] = useState<number>(1366);
  const [sidebarModule, setSidebarModule] = useState<'properties' | 'neighborhoods' | 'workspace' | 'admin'>('properties');

  const resolvedShell = useMemo(
    () => resolveShellConfigurationForRoute({ pathname: simPath, viewportWidthPx: simViewportWidth }),
    [simPath, simViewportWidth],
  );

  return (
    <div className="space-y-4 text-right" dir="rtl" data-testid="rt-fe-shell-003-panel">
      <div className="rounded-xl border border-emerald-500/30 bg-slate-900/90 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded bg-emerald-500/20 px-2 py-0.5 font-mono text-[11px] font-bold text-emerald-300">{RT_FE_SHELL_003_SPEC_ID}</span>
              <span className="rounded bg-indigo-500/20 px-2 py-0.5 text-[11px] font-bold text-indigo-300">بخش ۳ از ۲۸ — پوسته اصلی، ۴ قالب اجرایی و نظام ناوبری</span>
            </div>
            <h4 className="mt-1.5 text-sm font-bold text-white">
              مرحله سوم: طراحی معماری پوسته اصلی فرانت‌اند (Application Shell)، Layoutها و نظام ناوبری
            </h4>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="rounded-lg border border-slate-700 bg-slate-800/80 px-2.5 py-1 text-slate-200">۴ قالب اجرایی</span>
            <span className="rounded-lg border border-emerald-500/40 bg-emerald-950/50 px-2.5 py-1 font-bold text-emerald-300">
              دروازه مرحله ۴ (Design System): آماده و تاییدشده
            </span>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-slate-800 pt-3">
          {[
            { id: 'layouts', label: '۱. چهار Layout اصلی و هدر عمومی (SH-OUT-01..03)' },
            { id: 'navigation', label: '۲. ناوبری اصلی ۷گانه و سایدبار ماژول‌ها (SH-OUT-04..05)' },
            { id: 'simulator', label: '۳. شبیه‌ساز LayoutResolver، حالت محتوا و واکنش‌گرایی (XS..2XL)' },
            { id: 'overlays_a11y', label: '۴. مدیریت Overlayها (OVL-01..08)، دسترس‌پذیری و تحویل‌ها' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              data-testid={`rt-fe-shell-tab-${tab.id}`}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                activeTab === tab.id ? 'bg-[var(--color-brand-600)] text-white' : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'layouts' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {RT_FE_SHELL_4_LAYOUTS.map((layoutSpec) => (
            <div key={layoutSpec.layout} className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-mono font-bold text-emerald-300">{layoutSpec.layout}</span>
                <span className="text-[11px] text-slate-300">{layoutSpec.ownerSpaceFa}</span>
              </div>
              <div className="rounded border border-slate-800 bg-slate-950/70 p-2 font-mono text-[11px] text-cyan-300" dir="ltr">
                {layoutSpec.headerComponent}
              </div>
              <div className="flex flex-wrap gap-1">
                {layoutSpec.subComponents.map((sub) => (
                  <span key={sub} className="rounded bg-slate-800 px-2 py-0.5 font-mono text-[10px] text-slate-200">{sub}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'navigation' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 text-xs">
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-2">
            <h5 className="font-bold text-emerald-300">ناوبری اصلی ۷بخشی هدر عمومی (SH-OUT-04)</h5>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {RT_FE_SHELL_PRIMARY_NAV_7.map((item, idx) => (
                <div key={item.id} className="rounded border border-slate-800 bg-slate-950/70 p-2 flex items-center justify-between">
                  <span className="font-bold text-white">{idx + 1}. {item.label}</span>
                  <span className="font-mono text-cyan-300" dir="ltr">{item.path}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <h5 className="font-bold text-indigo-300">سایدبار ماژول‌ها (SH-OUT-05)</h5>
              <div className="flex gap-1">
                {(['properties', 'neighborhoods', 'workspace', 'admin'] as const).map((m) => (
                  <button key={m} type="button" onClick={() => setSidebarModule(m)} className={`rounded px-2 py-0.5 text-[11px] ${sidebarModule === m ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300'}`}>
                    {m}
                  </button>
                ))}
              </div>
            </div>
            <div className="max-h-56 overflow-y-auto space-y-1">
              {RT_FE_SHELL_MODULE_SIDEBARS[sidebarModule].map((nav) => (
                <div key={nav.id} className="flex justify-between rounded border border-slate-800 bg-slate-950/70 p-1.5">
                  <span className="font-bold text-white">{nav.label}</span>
                  <span className="font-mono text-cyan-300" dir="ltr">{nav.path}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'simulator' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 text-xs">
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-2.5">
            <h5 className="font-bold text-emerald-300">شبیه‌ساز زنده LayoutResolver و نقاط شکست (XS تا 2XL)</h5>
            <div className="flex flex-wrap gap-1.5">
              {['/map', '/properties/PR-1024', '/housing-market', '/account/saved/properties', '/admin/data-sources', '/404'].map((samplePath) => (
                <button key={samplePath} type="button" onClick={() => setSimPath(samplePath)} className={`rounded px-2 py-1 font-mono text-[11px] ${simPath === samplePath ? 'bg-[var(--color-brand-600)] text-white' : 'bg-slate-800 text-slate-300'}`} dir="ltr">
                  {samplePath}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {RT_FE_SHELL_BREAKPOINTS_6.map((bp) => (
                <button key={bp.id} type="button" onClick={() => setSimViewportWidth(bp.minWidthPx + 40)} className={`rounded px-2 py-1 text-[11px] ${resolvedShell.breakpoint.id === bp.id ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-300'}`}>
                  {bp.id}
                </button>
              ))}
            </div>
            <div className="rounded border border-slate-800 bg-slate-950 p-2.5 space-y-1">
              <div>Layout: <strong className="font-mono text-emerald-300">{resolvedShell.shellConfig.layout}</strong> | Mode: <strong className="font-mono text-cyan-300">{resolvedShell.shellConfig.content.mode}</strong></div>
              <div>Breakpoint: <span className="text-amber-300">{resolvedShell.breakpoint.id} ({resolvedShell.breakpoint.sidebarMode})</span></div>
              <div>Footer={String(resolvedShell.shellConfig.footer.visible)} | BottomNav={String(resolvedShell.shellConfig.navigation.bottomNavigation)}</div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-1.5">
            <h5 className="font-bold text-cyan-300">جدول ۶گانه نقاط شکست واکنش‌گرا (SH-OUT-09)</h5>
            {RT_FE_SHELL_BREAKPOINTS_6.map((b) => (
              <div key={b.id} className="flex justify-between rounded border border-slate-800 bg-slate-950/70 p-1.5">
                <span className="text-white">{b.id}: {b.labelFa}</span>
                <span className="font-mono text-emerald-300">{b.headerVariant} / {b.sidebarMode}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'overlays_a11y' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 text-[11px]">
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3.5 space-y-1">
            <div className="font-bold text-emerald-300">GlobalOverlayHost (OVL-01..08)</div>
            {RT_FE_SHELL_OVERLAY_HOSTS_8.map((ovl) => <div key={ovl.code} className="text-slate-300">{ovl.code} ({ovl.componentName} z-{ovl.zIndexTier}): {ovl.responsibilityFa}</div>)}
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3.5 space-y-1">
            <div className="font-bold text-indigo-300">دسترس‌پذیری (A11Y-SH-001..010)</div>
            {RT_FE_SHELL_A11Y_10.map((a) => <div key={a.id} className="text-slate-300">✓ {a.id}: {a.titleFa}</div>)}
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3.5 space-y-1">
            <div className="font-bold text-cyan-300">خروجی‌های SH-OUT-01..15</div>
            {RT_FE_SHELL_DELIVERABLES_15.map((del) => <div key={del.id} className="text-slate-300">✓ {del.id}: {del.titleFa}</div>)}
          </div>
        </div>
      )}
    </div>
  );
};
