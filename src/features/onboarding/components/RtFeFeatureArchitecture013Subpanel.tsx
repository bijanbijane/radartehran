import React, { useMemo, useState } from 'react';
import { Boxes, GitBranch, Layers, ShieldCheck } from 'lucide-react';
import {
  RT_FE_FEATURE_ARCHITECTURE_013_SPEC_ID, RT_FEAT_ARCHITECTURE_LEVELS_5, RT_FEAT_DOMAINS_8_51_FEATURES,
  RT_FEAT_INTERNAL_LAYERS_6, RT_FEAT_COMMUNICATION_PATTERNS_4, RT_FEAT_LIFECYCLE_STATUSES_7,
  RT_FEAT_TEAM_OWNERSHIP_8, RT_FEAT_MIGRATION_PHASES_6, RT_FEAT_DELIVERABLES_36,
  RT_FEAT_SAMPLE_DEPENDENCY_REGISTRY, RT_FEA_7_GROUPS_42_FEATURES, RT_FEA_ENTITY_OWNERSHIP_11,
  RT_FEA_EXTERNAL_ADAPTERS_7, RT_FEA_DOCS_12, RT_FEA_EXECUTION_STEPS_24,
  RT_FEA_DELIVERABLES_27, RT_FE_STAGE14_BRIDGE_SPEC_ID,
  validateFeatureImportBoundary, detectFeatureDependencyCycles,
  evaluateFeatureAccessAndFlag, validateAgentTaskBoundary,
} from '../services/rtFeFeatureArchitecture013Engine';

type FeatTabId = 'domains_anatomy' | 'deps_boundaries' | 'flags_agents' | 'migration_deliverables';

export const RtFeFeatureArchitecture013Subpanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<FeatTabId>('domains_anatomy');
  const [selectedDomainGroup, setSelectedDomainGroup] = useState<number>(1);
  const [catalogView, setCatalogView] = useState<'8domains' | '7groups'>('8domains');
  const [injectCycle, setInjectCycle] = useState<boolean>(false);
  const [importTargetPath, setImportTargetPath] = useState<string>('@/features/properties/data/repositories/property.repository');
  const [accessScope, setAccessScope] = useState<'public' | 'authenticated' | 'administrative'>('administrative');
  const [flagEnabled, setFlagEnabled] = useState<boolean>(true);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);

  const cycleReport = useMemo(() => {
    const deps = injectCycle
      ? [
          ...RT_FEAT_SAMPLE_DEPENDENCY_REGISTRY,
          { sourceFeature: 'properties', targetFeature: 'valuation', dependencyType: 'contract' as const, required: true, reason: 'Simulated cycle' },
        ]
      : RT_FEAT_SAMPLE_DEPENDENCY_REGISTRY;
    return detectFeatureDependencyCycles(deps);
  }, [injectCycle]);

  const importVerdict = useMemo(
    () => validateFeatureImportBoundary({ importerLayer: 'feature', importerFeature: 'valuation', importPath: importTargetPath }),
    [importTargetPath],
  );

  const accessVerdict = useMemo(
    () => evaluateFeatureAccessAndFlag({ featureStatus: 'active', accessScope, flagEnabled, userAuthenticated: true, isAdmin }),
    [accessScope, flagEnabled, isAdmin],
  );

  const agentVerdict = useMemo(
    () =>
      validateAgentTaskBoundary(
        { allowedPaths: ['src/features/valuation/'], restrictedPaths: ['src/app/router/', 'src/shared/auth/'] },
        accessScope === 'administrative' ? 'src/app/router/routes.ts' : 'src/features/valuation/domain/rules.ts',
      ),
    [accessScope],
  );

  const activeGroup = RT_FEAT_DOMAINS_8_51_FEATURES.find((g) => g.groupIndex === selectedDomainGroup) ?? RT_FEAT_DOMAINS_8_51_FEATURES[0];

  return (
    <div dir="rtl" data-testid="rt-fe-feat-013-panel" className="space-y-4 text-right">
      <div className="rounded-xl border border-indigo-500/30 bg-slate-900/95 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-indigo-500/20 px-2 py-0.5 font-mono text-[11px] font-bold text-indigo-300" dir="ltr">
                {RT_FE_FEATURE_ARCHITECTURE_013_SPEC_ID}
              </span>
              <span className="rounded bg-cyan-500/20 px-2 py-0.5 text-[11px] font-bold text-cyan-300">
                ۵۱/۴۲ قابلیت رسمی · ۱۱ مالکیت موجودیت · ۱۲ سند و ۲۷/۳۶ خروجی
              </span>
            </div>
            <h4 className="mt-1.5 text-sm font-bold text-white">
              نظام ماژول‌بندی و معماری قابلیت‌های فرانت‌اند (Frontend Feature Architecture &amp; Modularization)
            </h4>
          </div>
          <span className="rounded-lg border border-emerald-500/40 bg-emerald-950/50 px-2.5 py-1 text-xs font-bold text-emerald-300 whitespace-nowrap shrink-0" dir="ltr">
            Public API + Cycle Check + Isolation
          </span>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-slate-800 pt-3">
          {[
            { id: 'domains_anatomy', label: '۱. دامنه‌ها، مالکیت موجودیت‌ها و ساختار داخلی' },
            { id: 'deps_boundaries', label: '۲. رجیستری وابستگی، چرخه و مرز Public API' },
            { id: 'flags_agents', label: '۳. Flag vs مجوز، Adapterها و Agent Boundary' },
            { id: 'migration_deliverables', label: '۴. گام‌ها، ۱۲ سند و خروجی‌های RT-FEA-OUT / RT-FEAT-OUT' },
          ].map((tab) => (
            <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id as FeatTabId)} data-testid={`rt-fe-feat-tab-${tab.id}`} className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${activeTab === tab.id ? 'bg-indigo-600 text-white' : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'}`}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'domains_anatomy' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 text-xs">
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h5 className="font-bold text-indigo-300 flex items-center gap-1.5">
                <Boxes className="w-4 h-4 shrink-0" />
                <span>طبقه‌بندی قابلیت‌های رادار تهران</span>
              </h5>
              <div className="flex gap-1">
                <button type="button" data-testid="rt-fe-feat-view-8" onClick={() => setCatalogView('8domains')} className={`rounded px-2 py-0.5 text-[10px] font-bold ${catalogView === '8domains' ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-300'}`}>۸ دامنه (۵۱)</button>
                <button type="button" data-testid="rt-fe-feat-view-7" onClick={() => setCatalogView('7groups')} className={`rounded px-2 py-0.5 text-[10px] font-bold ${catalogView === '7groups' ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-300'}`}>۷ گروه (۴۲)</button>
              </div>
            </div>

            {catalogView === '8domains' ? (
              <>
                <div className="flex flex-wrap gap-1.5">
                  {RT_FEAT_DOMAINS_8_51_FEATURES.map((grp) => (
                    <button key={grp.groupIndex} type="button" onClick={() => setSelectedDomainGroup(grp.groupIndex)} className={`rounded px-2 py-1 text-[11px] font-bold ${selectedDomainGroup === grp.groupIndex ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>
                      {grp.groupIndex}. {grp.groupTitleFa}
                    </button>
                  ))}
                </div>
                <div className="space-y-1.5 pt-1">
                  {activeGroup.features.map((feat) => (
                    <div key={feat.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-800 bg-slate-950/70 p-2">
                      <div>
                        <span className="inline-block rounded bg-slate-900 px-1.5 py-0.5 font-mono font-bold text-cyan-300 ml-2" dir="ltr">{feat.id}</span>
                        <span className="font-bold text-white ml-2" dir="ltr">{feat.nameEn}</span>
                        <span className="text-slate-300">{feat.responsibilityFa}</span>
                      </div>
                      <span className="text-[10px] font-mono text-emerald-300 whitespace-nowrap shrink-0" dir="ltr">{feat.primaryOwnerTeam}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="max-h-72 overflow-y-auto space-y-1.5">
                {RT_FEA_7_GROUPS_42_FEATURES.map((grp) => (
                  <div key={grp.prefix} className="rounded border border-slate-800 bg-slate-950/70 p-2">
                    <div className="font-bold text-cyan-300 mb-1">{grp.group} <span className="font-mono text-[10px] text-indigo-300" dir="ltr">({grp.prefix}-*)</span></div>
                    <div className="flex flex-wrap gap-1" dir="ltr">
                      {grp.items.map((it) => <span key={it} className="rounded bg-slate-900 px-1.5 py-0.5 font-mono text-[10px] text-slate-200">{it}</span>)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-2">
            <h5 className="font-bold text-cyan-300 flex items-center gap-1.5">
              <Layers className="w-4 h-4 shrink-0" />
              <span>۵ محدوده کلان، ۶ لایه داخلی و مالکیت ۱۱ موجودیت اصلی (§۱۳.۷)</span>
            </h5>
            {RT_FEAT_ARCHITECTURE_LEVELS_5.map((lvl) => (
              <div key={lvl.id} className="rounded border border-slate-800 bg-slate-950/70 p-2 text-[11px] leading-relaxed">
                <span className="inline-block rounded bg-slate-900 px-1.5 py-0.5 font-mono font-bold text-indigo-300 ml-1.5" dir="ltr">{lvl.levelEn}</span>
                <span className="text-slate-200">{lvl.responsibilityFa}</span>
              </div>
            ))}
            <div className="max-h-32 overflow-y-auto space-y-1 pt-1">
              {RT_FEA_ENTITY_OWNERSHIP_11.map((eo) => (
                <div key={eo.entity} className="flex flex-wrap items-center justify-between gap-2 rounded bg-slate-950 px-2 py-1 text-[10px]" dir="ltr">
                  <span className="font-mono font-bold text-emerald-300">{eo.entity} → {eo.owner}</span>
                  <span className="text-slate-400">Consumers: {eo.consumers.join(', ')}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'deps_boundaries' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 text-xs">
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-3">
            <h5 className="font-bold text-cyan-300 flex items-center gap-1.5"><GitBranch className="w-4 h-4" /> تشخیص چرخه در Dependency Registry (§۱۳.۸ / §۱۳.۹)</h5>
            <label className="flex items-center gap-2 text-slate-200 cursor-pointer">
              <input type="checkbox" data-testid="rt-fe-feat-cycle-toggle" checked={injectCycle} onChange={(e) => setInjectCycle(e.target.checked)} />
              شبیه‌سازی وابستگی معکوس غیرمجاز (properties ← valuation)
            </label>
            <div data-testid="rt-fe-feat-cycle-verdict" className={`rounded p-2.5 text-[11px] font-bold ${cycleReport.hasCycle ? 'bg-rose-950/60 text-rose-200 border border-rose-500/40' : 'bg-emerald-950/60 text-emerald-200 border border-emerald-500/40'}`}>
              {cycleReport.hasCycle ? `چرخه وابستگی کشف شد (مسدود در CI): ${cycleReport.cyclePath.join(' → ')}` : 'گراف وابستگی ماژول‌ها بدون چرخه (DAG سالم، ۰ چرخه) است.'}
            </div>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {RT_FEAT_SAMPLE_DEPENDENCY_REGISTRY.map((d) => (
                <div key={`${d.sourceFeature}-${d.targetFeature}`} className="flex justify-between rounded bg-slate-950/70 px-2 py-1 font-mono text-[10px] text-slate-300" dir="ltr">
                  <span>{d.sourceFeature} → {d.targetFeature}</span>
                  <span className="text-cyan-300">{d.dependencyType} v{d.contractVersion}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-2.5">
            <h5 className="font-bold text-indigo-300">کنترل مرز Import و ۴ الگوی ارتباط بین ماژول‌ها (§۱۳.۷ / §۱۳.۱۰)</h5>
            <select aria-label="مسیر Import ماژول دیگر" data-testid="rt-fe-feat-import-select" value={importTargetPath} onChange={(e) => setImportTargetPath(e.target.value)} className="w-full rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 font-mono text-[11px] text-white" dir="ltr">
              <option value="@/features/properties/data/repositories/property.repository">@/features/properties/data/repositories/property.repository</option>
              <option value="@/features/properties/public">@/features/properties/public</option>
            </select>
            <div data-testid="rt-fe-feat-import-verdict" className={`rounded p-2.5 text-[11px] font-bold ${importVerdict.allowed ? 'bg-emerald-950/60 text-emerald-200' : 'bg-amber-950/60 text-amber-200'}`}>
              {importVerdict.messageFa}
            </div>
            {RT_FEAT_COMMUNICATION_PATTERNS_4.map((cp) => (
              <div key={cp.pattern} className="rounded border border-slate-800 bg-slate-950/70 p-2 text-[11px] leading-relaxed">
                <span className="inline-block rounded bg-slate-900 px-1.5 py-0.5 font-mono font-bold text-cyan-300 ml-1.5" dir="ltr">{cp.pattern}</span>
                <span className="text-slate-300">{cp.summaryFa}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'flags_agents' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 text-xs">
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-2.5">
            <h5 className="font-bold text-emerald-300 flex items-center gap-1.5"><ShieldCheck className="w-4 h-4" /> جداسازی Feature Flag از مجوز و مرز Agent (§۱۳.۱۲ / §۱۳.۱۸)</h5>
            <div className="flex flex-wrap items-center gap-3">
              <select aria-label="سطح دسترسی قابلیت" data-testid="rt-fe-feat-scope-select" value={accessScope} onChange={(e) => setAccessScope(e.target.value as typeof accessScope)} className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-[11px] text-white">
                <option value="public">عمومی (Public Feature)</option>
                <option value="authenticated">نیازمند ورود (Authenticated)</option>
                <option value="administrative">مدیریتی ایزوله (Administrative)</option>
              </select>
              <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer"><input type="checkbox" checked={flagEnabled} onChange={(e) => setFlagEnabled(e.target.checked)} /> Feature Flag روشن</label>
              <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer"><input type="checkbox" checked={isAdmin} onChange={(e) => setIsAdmin(e.target.checked)} /> نقش مدیر (Admin)</label>
            </div>
            <div className={`rounded p-2.5 text-[11px] font-bold ${accessVerdict.accessible ? 'bg-emerald-950/60 text-emerald-200' : 'bg-rose-950/60 text-rose-200'}`}>{accessVerdict.reasonFa}</div>
            <div className="rounded border border-slate-800 bg-slate-950 p-2 text-[11px] text-slate-300">
              <span className="inline-block rounded bg-slate-900 px-1.5 py-0.5 font-mono text-cyan-300 ml-1.5" dir="ltr">AgentTaskBoundary</span>{agentVerdict.reasonFa}
            </div>
            <div className="space-y-1 pt-1">
              {RT_FEA_EXTERNAL_ADAPTERS_7.map((ad) => (
                <div key={ad.technology} className="flex justify-between rounded bg-slate-950/70 px-2 py-1 text-[10px]">
                  <span className="font-mono font-bold text-indigo-300" dir="ltr">{ad.technology}</span>
                  <span className="text-slate-300" dir="ltr">{ad.adapterFa}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-2">
            <h5 className="font-bold text-indigo-300">۸ حوزه مالکیت تیمی، ۶ لایه داخلی و چرخه عمر ماژول</h5>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {RT_FEAT_TEAM_OWNERSHIP_8.map((tm) => (
                <div key={tm.domain} className="rounded bg-slate-950/70 p-2 text-[11px]">
                  <div className="font-mono font-bold text-cyan-300" dir="ltr">{tm.domain}</div>
                  <div className="text-slate-300">{tm.scopeFa}</div>
                </div>
              ))}
            </div>
            <div className="space-y-1 pt-1">
              {RT_FEAT_INTERNAL_LAYERS_6.map((layer) => (
                <div key={layer.folder} className="rounded bg-slate-950 px-2 py-1 text-[10px] text-slate-300">
                  <span className="inline-block rounded bg-slate-900 px-1 py-0.5 font-mono text-emerald-300 ml-1.5" dir="ltr">{layer.folder}</span>{layer.roleFa}
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-1 pt-1" dir="ltr">
              {RT_FEAT_LIFECYCLE_STATUSES_7.map((st) => <span key={st} className="rounded bg-slate-800 px-2 py-0.5 font-mono text-[10px] text-emerald-300">{st}</span>)}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'migration_deliverables' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 text-xs">
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-1.5">
            <h5 className="font-bold text-cyan-300">مهاجرت ۶فازی، {RT_FEA_EXECUTION_STEPS_24.length} گام و ۱۲ سند مرجع</h5>
            {RT_FEAT_MIGRATION_PHASES_6.map((ph) => (
              <div key={ph.phase} className="rounded border border-slate-800 bg-slate-950/70 p-1.5 text-[10px]">
                <strong className="text-indigo-300">فاز {ph.phase}: {ph.titleFa}</strong> — <span className="text-slate-300">{ph.outputFa}</span>
              </div>
            ))}
            <div className="pt-1 text-[10px] text-emerald-300">
              اسناد رسمی ({RT_FEA_DOCS_12[0].id}..012) و پل انتقال به <code className="font-mono" dir="ltr">{RT_FE_STAGE14_BRIDGE_SPEC_ID}</code>
            </div>
          </div>

          <div className="lg:col-span-2 rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-2">
            <h5 className="font-bold text-emerald-300">خروجی‌های رسمی مرحله (۲۷ خروجی RT-FEA-OUT و ۳۶ خروجی RT-FEAT-OUT)</h5>
            <div className="max-h-72 overflow-y-auto grid grid-cols-1 gap-1 sm:grid-cols-2">
              {RT_FEA_DELIVERABLES_27.map((del) => (
                <div key={del.id} className="rounded border border-indigo-500/30 bg-slate-950/70 p-1.5 text-[11px] text-slate-200">
                  <span className="font-mono font-bold text-indigo-300" dir="ltr">✓ {del.id}</span> <span className="text-slate-300">{del.titleFa}</span>
                </div>
              ))}
              {RT_FEAT_DELIVERABLES_36.map((del) => (
                <div key={del.id} className="rounded border border-slate-800 bg-slate-950/60 p-1.5 text-[11px] text-slate-200">
                  <span className="font-mono font-bold text-emerald-300" dir="ltr">✓ {del.id}</span> <span className="text-slate-300">{del.titleFa}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
