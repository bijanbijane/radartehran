import React, { useMemo, useState } from 'react';
import {
  RT_FE_LAYOUT_006_SPEC_ID,
  RT_FE_LAYOUT_8_TEMPLATES,
  RT_FE_LAYOUT_20_UNITS,
  RT_FE_LAYOUT_TESTS_16,
  RT_FE_LAYOUT_DELIVERABLES_23,
  evaluateDashboardModuleFaultIsolation,
  resolveResponsiveLayoutTier,
  type LayoutTemplateCode,
  type SubModuleStatus,
} from '../services/rtFeLayout006SpatialArchitectureEngine';

export const RtFeLayout006SpatialArchitectureSubpanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'templates' | 'units_shell' | 'fault_responsive' | 'tests_deliverables'>('templates');
  const [selectedTemplate, setSelectedTemplate] = useState<LayoutTemplateCode>('LAY-012');
  const [viewportPx, setViewportPx] = useState<number>(1280);
  const [kpiStatus, setKpiStatus] = useState<SubModuleStatus>('Ready');
  const [chartStatus, setChartStatus] = useState<SubModuleStatus>('Error');
  const [tableStatus, setTableStatus] = useState<SubModuleStatus>('Ready');
  const [mapStatus, setMapStatus] = useState<SubModuleStatus>('Ready');

  const activeTemplateSpec = useMemo(
    () => RT_FE_LAYOUT_8_TEMPLATES.find((t) => t.code === selectedTemplate) ?? RT_FE_LAYOUT_8_TEMPLATES[0],
    [selectedTemplate],
  );

  const responsiveAdaptation = useMemo(() => resolveResponsiveLayoutTier(viewportPx), [viewportPx]);

  const faultIsolation = useMemo(
    () =>
      evaluateDashboardModuleFaultIsolation({
        kpiModule: kpiStatus,
        chartModule: chartStatus,
        tableModule: tableStatus,
        mapModule: mapStatus,
      }),
    [kpiStatus, chartStatus, tableStatus, mapStatus],
  );

  return (
    <div className="space-y-4 text-right" dir="rtl" data-testid="rt-fe-layout-006-panel">
      {/* Header Banner */}
      <div className="rounded-xl border border-cyan-500/30 bg-slate-900/90 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded bg-cyan-500/20 px-2 py-0.5 font-mono text-[11px] font-bold text-cyan-300">
                {RT_FE_LAYOUT_006_SPEC_ID}
              </span>
              <span className="rounded bg-indigo-500/20 px-2 py-0.5 text-[11px] font-bold text-indigo-300">
                بخش ۶ از ۲۸ — سیستم Layout، Page Shell و ۸ الگوی فضایی صفحات (LAY-001..020)
              </span>
            </div>
            <h4 className="mt-1.5 text-sm font-bold text-white">
              مرحله ششم: طراحی و معماری سیستم Layout، Page Shell و ساختار فضایی صفحات رادار تهران
            </h4>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="rounded-lg border border-slate-700 bg-slate-800/80 px-2.5 py-1 text-slate-200">
              ۸ قالب محتوایی (LAY-008..015)
            </span>
            <span className="rounded-lg border border-emerald-500/40 bg-emerald-950/50 px-2.5 py-1 font-bold text-emerald-300">
              ۲۳ خروجی الزامی (LO-OUT-001..023): تاییدشده
            </span>
          </div>
        </div>

        {/* Sub-tabs */}
        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-slate-800 pt-3">
          {[
            { id: 'templates', label: '۱. هشت Layout Template رسمی (Dashboard / Listing / Detail / Analytics / Map / Form / Workspace / Admin)' },
            { id: 'units_shell', label: '۲. بیست واحد معماری چیدمان (LAY-001 تا LAY-020) و Page Shell' },
            { id: 'fault_responsive', label: '۳. شبیه‌ساز جداسازی خطا در داشبورد و واکنش‌گرایی غیرظاهری' },
            { id: 'tests_deliverables', label: '۴. آزمون‌های ۱۶گانه (LT-001..016) و خروجی‌ها (LO-OUT-001..023)' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              data-testid={`rt-fe-layout-tab-${tab.id}`}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                activeTab === tab.id
                  ? 'bg-cyan-600 text-white'
                  : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'templates' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-2">
            <h5 className="text-xs font-bold text-cyan-300">انتخاب الگوی فضایی صفحه (LAY-008..LAY-015)</h5>
            {RT_FE_LAYOUT_8_TEMPLATES.map((tpl) => (
              <button
                key={tpl.code}
                type="button"
                onClick={() => setSelectedTemplate(tpl.code)}
                className={`w-full rounded-lg border p-2.5 text-right text-xs transition-colors ${
                  selectedTemplate === tpl.code
                    ? 'border-cyan-500 bg-cyan-950/40 text-white'
                    : 'border-slate-800 bg-slate-950/60 text-slate-300 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-cyan-300">{tpl.code}</span>
                  <span className="font-mono text-[10px] text-emerald-300">{tpl.nameEn}</span>
                </div>
                <div className="mt-0.5 font-bold">{tpl.titleFa}</div>
              </button>
            ))}
          </div>

          <div className="lg:col-span-2 rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-3 text-xs">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div>
                <span className="font-mono text-cyan-300">{activeTemplateSpec.code} — {activeTemplateSpec.nameEn}</span>
                <h5 className="text-sm font-bold text-white mt-0.5">{activeTemplateSpec.titleFa}</h5>
              </div>
              <span className="rounded bg-slate-800 px-2.5 py-1 font-mono text-emerald-300">
                contentWidth: {activeTemplateSpec.contentWidth}
              </span>
            </div>

            <div>
              <div className="mb-1.5 font-bold text-indigo-300">نواحی فضایی استاندارد در این قالب:</div>
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {activeTemplateSpec.regions.map((reg, idx) => (
                  <div key={reg} className="rounded border border-slate-800 bg-slate-950/80 p-2 font-mono text-[11px] text-slate-200" dir="ltr">
                    {idx + 1}. {reg}
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 pt-1">
              <div className="rounded border border-slate-800 bg-slate-950/60 p-2.5">
                <div className="font-bold text-emerald-300 mb-1">موارد کاربرد در رادار تهران:</div>
                <div className="text-slate-300">{activeTemplateSpec.useCasesFa.join(' • ')}</div>
              </div>
              <div className="rounded border border-slate-800 bg-slate-950/60 p-2.5">
                <div className="font-bold text-amber-300 mb-1">رفتار تطبیقی در موبایل:</div>
                <div className="text-slate-300">{activeTemplateSpec.mobileAdaptationFa}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'units_shell' && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-2.5">
          <h5 className="text-xs font-bold text-cyan-300">
            کاتالوگ ۲۰ واحد معماری سیستم چیدمان (LAY-001 تا LAY-020)
          </h5>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {RT_FE_LAYOUT_20_UNITS.map((u) => (
              <div key={u.id} className="rounded-lg border border-slate-800 bg-slate-950/70 p-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-cyan-300">{u.id}</span>
                  <span className="font-mono text-[10px] text-indigo-300">{u.titleEn}</span>
                </div>
                <div className="mt-1 text-[11px] text-slate-200">{u.titleFa}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'fault_responsive' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Sub-module fault isolation simulator */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-3 text-xs">
            <h5 className="font-bold text-emerald-300">
              شبیه‌ساز جداسازی خطا در Layout داشبورد و نقشه (بخش ۱۲ — LO-OUT-021)
            </h5>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'KPI Module', val: kpiStatus, setter: setKpiStatus },
                { label: 'Chart Module', val: chartStatus, setter: setChartStatus },
                { label: 'Table Module', val: tableStatus, setter: setTableStatus },
                { label: 'Map Module', val: mapStatus, setter: setMapStatus },
              ].map((m) => (
                <label key={m.label} className="space-y-1">
                  <span className="font-mono text-slate-300">{m.label}:</span>
                  <select
                    value={m.val}
                    onChange={(e) => m.setter(e.target.value as SubModuleStatus)}
                    className="w-full rounded border border-slate-700 bg-slate-950 p-1.5 font-mono text-white"
                  >
                    <option value="Ready">Ready</option>
                    <option value="Loading">Loading</option>
                    <option value="Error">Error</option>
                    <option value="Empty">Empty</option>
                  </select>
                </label>
              ))}
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950 p-3 space-y-1">
              <div className="font-bold text-emerald-300">
                پوسته کلی صفحه سالم است (overallShellIntact: {String(faultIsolation.overallShellIntact)})
              </div>
              <div className="text-slate-200">{faultIsolation.isolationVerdictFa}</div>
            </div>
          </div>

          {/* Non-cosmetic responsive layout adaptation */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-3 text-xs">
            <h5 className="font-bold text-cyan-300">
              موتور واکنش‌گرایی ساختاری در ۵ محدوده عرض (LAY-016 — جلوگیری از Responsive صرفاً ظاهری)
            </h5>
            <div className="flex flex-wrap gap-1.5">
              {[360, 540, 820, 1280, 1520].map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => setViewportPx(w)}
                  className={`rounded px-2.5 py-1 font-mono text-[11px] ${
                    viewportPx === w ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  {w}px
                </button>
              ))}
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950 p-3 space-y-1.5">
              <div>
                <span className="text-slate-400">محدوده فعال: </span>
                <span className="font-mono font-bold text-amber-300">{responsiveAdaptation.labelFa}</span>
              </div>
              <div>
                <span className="text-slate-400">رفتار Sidebar: </span>
                <span className="font-mono text-cyan-300">{responsiveAdaptation.sidebarBehavior}</span>
              </div>
              <div>
                <span className="text-slate-400">رفتار جداول داده: </span>
                <span className="font-mono text-emerald-300">{responsiveAdaptation.tableBehavior}</span>
              </div>
              <div>
                <span className="text-slate-400">رفتار پنل اطلاعات نقشه: </span>
                <span className="font-mono text-indigo-300">{responsiveAdaptation.mapInfoPanelBehavior}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'tests_deliverables' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 text-xs">
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-1.5">
            <h5 className="font-bold text-emerald-300">مجموعه ۱۶ آزمون معماری Layout (LT-001 تا LT-016)</h5>
            <div className="max-h-64 overflow-y-auto space-y-1">
              {RT_FE_LAYOUT_TESTS_16.map((lt) => (
                <div key={lt.id} className="text-[11px] text-slate-300">
                  <span className="font-mono text-emerald-300">✓ {lt.id} ({lt.titleEn}): </span>
                  <span>{lt.criteriaFa}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-1.5">
            <h5 className="font-bold text-cyan-300">خروجی‌های ۲۳گانه الزامی مرحله ششم (LO-OUT-001 تا LO-OUT-023)</h5>
            <div className="max-h-64 overflow-y-auto space-y-1">
              {RT_FE_LAYOUT_DELIVERABLES_23.map((lo) => (
                <div key={lo.id} className="text-[11px] text-slate-300">
                  <span className="font-mono text-cyan-300">✓ {lo.id}: </span>
                  <span>{lo.titleFa}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
