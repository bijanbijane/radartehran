import React, { useMemo, useState } from 'react';
import {
  RT_FE_ARCH_001_SPEC_ID,
  RT_FE_ARCH_6_LAYERS,
  RT_FE_ARCH_9_EXECUTION_STEPS,
  RT_FE_ARCH_13_MODULES,
  RT_FE_ARCH_MODULE_INTERNAL_FOLDERS_9,
  RT_FE_ARCH_OWNERSHIP_MATRIX_11,
  RT_FE_ARCH_STATE_GOVERNANCE_8,
  RT_FE_ARCH_REQUIREMENTS_10,
  RT_FE_ARCH_DELIVERABLES_10,
  type FrontendArchitectureLayerId,
} from '../services/rtFeArch001ModularArchitectureTypes';
import {
  RT_FE_ARCH_DEPENDENCY_RULES_6,
  RT_FE_ARCH_TARGET_FOLDER_TREE,
  validateLayerDependency,
  validateInterModuleDependency,
  createPropertyModulePublicAdapter,
  evaluateRtFeArch001ReadinessGate,
} from '../services/rtFeArch001ModularArchitectureEngine';

export const RtFeArch001ModularArchitectureSubpanel: React.FC = () => {
  const [sourceLayer, setSourceLayer] = useState<FrontendArchitectureLayerId>('pages_layouts');
  const [targetLayer, setTargetLayer] = useState<FrontendArchitectureLayerId>('features');
  const [sourceModule] = useState<string>('property-valuation');
  const [targetModule] = useState<string>('property-listings');
  const [viaPublicContract, setViaPublicContract] = useState<boolean>(true);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>('PR-1024');
  const [activeView, setActiveView] = useState<'layers' | 'modules' | 'ownership' | 'governance'>('layers');

  const layerVerdict = useMemo(() => validateLayerDependency(sourceLayer, targetLayer), [sourceLayer, targetLayer]);
  const moduleVerdict = useMemo(
    () =>
      validateInterModuleDependency({
        fromModule: sourceModule,
        toModule: targetModule,
        importPath: viaPublicContract ? `@/features/${targetModule}/index.ts` : `@/features/${targetModule}/model/internal.ts`,
      }),
    [sourceModule, targetModule, viaPublicContract],
  );
  const propertyContractAdapter = useMemo(() => createPropertyModulePublicAdapter(), []);
  const readinessGate = useMemo(() => evaluateRtFeArch001ReadinessGate(), []);

  return (
    <div className="space-y-4 text-right" dir="rtl" data-testid="rt-fe-arch-001-panel">
      <div className="rounded-xl border border-indigo-500/30 bg-slate-900/90 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded bg-indigo-500/20 px-2 py-0.5 font-mono text-[11px] font-bold text-indigo-300">
                {RT_FE_ARCH_001_SPEC_ID}
              </span>
              <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-[11px] font-bold text-emerald-300">
                بخش ۱ از ۲۸ — یکپارچه ماژولار (Modular Monolith)
              </span>
            </div>
            <h4 className="mt-1.5 text-sm font-bold text-white">
              مرحله اول: طراحی معماری ماژولار فرانت‌اند رادار تهران (React 19 + TypeScript + Vite + Tailwind)
            </h4>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="rounded-lg border border-slate-700 bg-slate-800/80 px-2.5 py-1 text-slate-200">۶ لایه + ۱۳ ماژول</span>
            <span className="rounded-lg border border-emerald-500/40 bg-emerald-950/50 px-2.5 py-1 font-bold text-emerald-300">
              دروازه مرحله ۲: {readinessGate.readyForStage2 ? 'آماده و تاییدشده' : 'نیازمند بازبینی'}
            </span>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-slate-800 pt-3">
          {[
            { id: 'layers', label: '۱. لایه‌های ۶گانه و جریان ۹مرحله‌ای' },
            { id: 'modules', label: '۲. کاتالوگ ۱۳ ماژول و ساختار پوشه' },
            { id: 'ownership', label: '۳. ماتریس مالکیت داده و قرارداد عمومی' },
            { id: 'governance', label: '۴. سنجش وابستگی، وضعیت و تحویل‌ها (OUT-01..10)' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveView(tab.id as typeof activeView)}
              data-testid={`rt-fe-arch-tab-${tab.id}`}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                activeView === tab.id ? 'bg-indigo-600 text-white' : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeView === 'layers' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-2">
            <h5 className="text-xs font-bold text-indigo-300">نقشه ۶ لایه معماری فرانت‌اند (قانون وابستگی رو به پایین)</h5>
            {RT_FE_ARCH_6_LAYERS.map((layer) => (
              <div key={layer.id} className="rounded-lg border border-slate-800 bg-slate-950/70 p-2 text-xs">
                <div className="flex items-center justify-between font-bold text-white">
                  <span>{layer.rank}. {layer.titleFa} ({layer.titleEn})</span>
                  <span className="font-mono text-[11px] text-indigo-300">{layer.id}</span>
                </div>
                <p className="mt-0.5 text-[11px] text-slate-300">{layer.summaryFa}</p>
              </div>
            ))}
          </div>

          <div className="space-y-4">
            <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
              <h5 className="mb-2 text-xs font-bold text-emerald-300">جریان ۹مرحله‌ای اجرای فرانت‌اند</h5>
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
                {RT_FE_ARCH_9_EXECUTION_STEPS.map((s) => (
                  <div key={s.step} className="rounded border border-slate-800 bg-slate-950/60 p-2 text-[11px]">
                    <div className="font-bold text-emerald-300">گام {s.step}: {s.titleFa}</div>
                    <div className="text-slate-300">{s.descriptionFa}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
              <h5 className="mb-2 text-xs font-bold text-cyan-300">ساختار استاندارد ۹ پوشه داخلی هر ماژول</h5>
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
                {RT_FE_ARCH_MODULE_INTERNAL_FOLDERS_9.map((item) => (
                  <div key={item.folder} className="rounded border border-slate-800 bg-slate-950/70 p-2">
                    <div className="font-mono text-[11px] font-bold text-cyan-300">{item.folder}</div>
                    <div className="text-[10px] text-slate-300">{item.roleFa}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeView === 'modules' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2 rounded-xl border border-slate-800 bg-slate-900/70 p-4">
            <h5 className="mb-2 text-xs font-bold text-indigo-300">کاتالوگ رسمی ۱۳ خانواده ماژول فرانت‌اند (FE-M01 تا FE-M13)</h5>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {RT_FE_ARCH_13_MODULES.map((m) => (
                <div key={m.id} className="rounded-lg border border-slate-800 bg-slate-950/70 p-2 text-xs">
                  <div className="flex items-center justify-between font-mono text-[11px]">
                    <span className="font-bold text-indigo-300">{m.id}</span>
                    <span className="text-emerald-300">features/{m.slug}</span>
                  </div>
                  <div className="mt-0.5 font-bold text-white">{m.titleFa}</div>
                  <div className="text-[11px] text-slate-300">{m.responsibilityFa}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-2 text-xs">
            <h5 className="font-bold text-amber-300">درخت مرجع پوشه‌های پروژه (OUT-05)</h5>
            {RT_FE_ARCH_TARGET_FOLDER_TREE.map((f) => (
              <div key={f.rootFolder} className="rounded border border-slate-800 bg-slate-950/70 p-2">
                <div className="font-mono font-bold text-cyan-300" dir="ltr">{f.rootFolder}</div>
                <div className="text-[11px] text-slate-300">{f.descriptionFa}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeView === 'ownership' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 text-xs">
          <div className="lg:col-span-2 rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-1.5">
            <h5 className="font-bold text-indigo-300">ماتریس ۱۱ردیفه مالکیت قابلیت‌ها و موجودیت‌ها (OUT-07)</h5>
            {RT_FE_ARCH_OWNERSHIP_MATRIX_11.map((row) => (
              <div key={row.capabilityFa} className="flex items-center justify-between rounded border border-slate-800 bg-slate-950/70 p-2">
                <span className="font-bold text-white">{row.capabilityFa}</span>
                <span className="font-mono text-emerald-300">{row.primaryOwnerFa}</span>
                <span className="text-[11px] text-slate-300">{row.consumersFa}</span>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-3">
            <h5 className="font-bold text-cyan-300">قرارداد عمومی ماژول املاک ({propertyContractAdapter.contractName} v{propertyContractAdapter.contractVersion})</h5>
            <div className="flex gap-1.5">
              {['PR-1024', 'PR-2048', 'PR-3096'].map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setSelectedPropertyId(id)}
                  className={`rounded px-2.5 py-1 font-mono ${selectedPropertyId === id ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-300'}`}
                >
                  {id}
                </button>
              ))}
            </div>
            <div className="rounded border border-slate-800 bg-slate-950 p-2.5 text-[11px] text-slate-300">
              شناسه انتخابی: <code className="text-emerald-300">{selectedPropertyId}</code> — دسترسی صرفاً از طریق <code className="text-cyan-300">features/property-listings/index.ts</code>.
            </div>
          </div>
        </div>
      )}

      {activeView === 'governance' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 text-xs">
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-2.5">
            <h5 className="font-bold text-indigo-300">آزمایشگر تعاملی قوانین وابستگی لایه‌ها و ماژول‌ها (OUT-04)</h5>
            <div className="grid grid-cols-2 gap-2">
              <select value={sourceLayer} onChange={(e) => setSourceLayer(e.target.value as FrontendArchitectureLayerId)} className="rounded border border-slate-700 bg-slate-950 p-1.5 text-white">
                {RT_FE_ARCH_6_LAYERS.map((l) => <option key={l.id} value={l.id}>{l.rank}. {l.titleFa}</option>)}
              </select>
              <select value={targetLayer} onChange={(e) => setTargetLayer(e.target.value as FrontendArchitectureLayerId)} className="rounded border border-slate-700 bg-slate-950 p-1.5 text-white">
                {RT_FE_ARCH_6_LAYERS.map((l) => <option key={l.id} value={l.id}>{l.rank}. {l.titleFa}</option>)}
              </select>
            </div>
            <div className={`rounded border p-2 ${layerVerdict.allowed ? 'border-emerald-500/40 bg-emerald-950/30 text-emerald-200' : 'border-rose-500/40 bg-rose-950/30 text-rose-200'}`}>
              {layerVerdict.reasonFa}
            </div>
            <label className="flex items-center gap-2 text-slate-300">
              <input type="checkbox" checked={viaPublicContract} onChange={(e) => setViaPublicContract(e.target.checked)} />
              فراخوانی ماژول {sourceModule} از {targetModule} صرفاً از طریق index.ts
            </label>
            <div className={`rounded border p-2 ${moduleVerdict.valid ? 'border-emerald-500/40 bg-emerald-950/30 text-emerald-200' : 'border-rose-500/40 bg-rose-950/30 text-rose-200'}`}>
              {moduleVerdict.verdictFa}
            </div>
            {RT_FE_ARCH_DEPENDENCY_RULES_6.map((r) => (
              <div key={r.ruleId} className="text-[11px] text-slate-300"><span className="font-mono text-indigo-300">{r.ruleId}:</span> {r.titleFa}</div>
            ))}
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-2">
            <h5 className="font-bold text-emerald-300">مدیریت وضعیت ۸سطحی (OUT-08) و تحویل‌های OUT-01..10</h5>
            <div className="grid grid-cols-2 gap-1.5">
              {RT_FE_ARCH_STATE_GOVERNANCE_8.map((st) => (
                <div key={st.stateTypeFa} className="rounded border border-slate-800 bg-slate-950/70 p-1.5 text-[11px]">
                  <div className="font-bold text-white">{st.stateTypeFa}</div>
                  <div className="text-emerald-300">{st.storageLocationFa}</div>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2 border-t border-slate-800 pt-2 text-[11px]">
              <div>
                {RT_FE_ARCH_REQUIREMENTS_10.map((req) => (
                  <div key={req.id} className="text-slate-300"><span className="font-mono text-emerald-300">✓ {req.id}:</span> {req.requirementFa}</div>
                ))}
              </div>
              <div>
                {RT_FE_ARCH_DELIVERABLES_10.map((del) => (
                  <div key={del.id} className="text-slate-300"><span className="font-mono text-cyan-300">✓ {del.id}:</span> {del.titleFa}</div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
