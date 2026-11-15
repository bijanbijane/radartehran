import React, { useMemo, useState } from 'react';
import { Columns3, GitCompareArrows, Layers, ShieldCheck } from 'lucide-react';
import {
  RT_FE_RESULTS_PRESENTATION_019_SPEC_ID, RT_FE_STAGE20_BRIDGE_SPEC_ID,
  RT_RESULTS_LAYERS_9, RT_RESULTS_VIEW_REGISTRY_9, RT_RESULTS_STATES_10, RT_RESULTS_COLUMN_PRESETS_4,
  RT_RESULTS_EXECUTION_PHASES_12, RT_RESULTS_DELIVERABLES_23,
  formatResultFieldValue, evaluateResultSetIntegrity, evaluateSelectionModel,
  evaluateComparisonSet, resolveColumnPreferences,
} from '../services/rtFeResultsPresentation019Engine';

type ResultsTabId = 'layers_formatter' | 'selection_sync' | 'comparison_states' | 'phases_deliverables';

export const RtFeResultsPresentation019Subpanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ResultsTabId>('layers_formatter');
  const [sampleValueMode, setSampleValueMode] = useState<'zero' | 'missing' | 'irr'>('irr');
  const [selectionMode, setSelectionMode] = useState<'explicit' | 'all_matching'>('explicit');
  const [staleQueryMix, setStaleQueryMix] = useState<boolean>(false);
  const [presetId, setPresetId] = useState<'public' | 'expert' | 'research' | 'admin'>('expert');
  const [mismatchUnits, setMismatchUnits] = useState<boolean>(false);

  const formattedSample = useMemo(() => {
    if (sampleValueMode === 'zero') return formatResultFieldValue({ rawValue: 0, fieldType: 'number' });
    if (sampleValueMode === 'missing') return formatResultFieldValue({ rawValue: null, fieldType: 'number' });
    return formatResultFieldValue({ rawValue: 125_000_000_000, fieldType: 'currency_irr_to_irt' });
  }, [sampleValueMode]);

  const integrityOut = useMemo(
    () =>
      evaluateResultSetIntegrity({
        activeQueryId: 'q-19-active',
        incomingQueryId: staleQueryMix ? 'q-18-stale' : 'q-19-active',
        completeness: 'partial',
        isPublicContext: true,
        exposedFields: ['propertyType', 'area', 'pricePerSqm'],
      }),
    [staleQueryMix],
  );

  const selectionOut = useMemo(
    () =>
      evaluateSelectionModel({
        selection: selectionMode === 'explicit'
          ? { mode: 'explicit', ids: ['p-101', 'p-102', 'p-103'] }
          : { mode: 'all_matching', queryId: 'q-19-active', excludedIds: ['p-109'] },
        pageTotal: 50,
        queryTotal: 5000,
      }),
    [selectionMode],
  );

  const activePreset = useMemo(
    () => RT_RESULTS_COLUMN_PRESETS_4.find((p) => p.id === presetId) ?? RT_RESULTS_COLUMN_PRESETS_4[0],
    [presetId],
  );

  const columnPrefOut = useMemo(
    () =>
      resolveColumnPreferences({
        registeredColumns: ['propertyType', 'area', 'neighborhood', 'totalPrice', 'buildingAge', 'floor', 'amenities', 'pricePerSqm', 'sourceId', 'updatedAt', 'qualityStatus', 'version', 'recordId', 'workflowState', 'recordOwner', 'modifiedAt'],
        featureDefault: ['propertyType', 'area', 'neighborhood'],
        workspacePref: [...activePreset.columns],
        userPref: presetId === 'expert' ? [...activePreset.columns] : undefined,
      }),
    [activePreset, presetId],
  );

  const comparisonOut = useMemo(
    () =>
      evaluateComparisonSet([
        { id: 'n-zaferanieh', entityType: 'Neighborhood', unit: 'IRT/sqm', period: '1405-08', value: 195 },
        { id: 'n-punak', entityType: 'Neighborhood', unit: mismatchUnits ? 'IRR/sqm' : 'IRT/sqm', period: '1405-08', value: null },
      ]),
    [mismatchUnits],
  );

  return (
    <div dir="rtl" data-testid="rt-fe-results-019-panel" className="space-y-4 text-right">
      <div className="rounded-xl border border-teal-500/30 bg-slate-900/95 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-teal-500/20 px-2 py-0.5 font-mono text-[11px] font-bold text-teal-300" dir="ltr">
                {RT_FE_RESULTS_PRESENTATION_019_SPEC_ID}
              </span>
              <span className="rounded bg-cyan-500/20 px-2 py-0.5 text-[11px] font-bold text-cyan-300">
                ۹ لایه · ۹ نمای Registry · ۱۰ وضعیت نمایش · ۲۳ خروجی OUT
              </span>
            </div>
            <h4 className="mt-1.5 text-sm font-bold text-white">
              مرحله نوزدهم: نظام نمایش نتایج، فهرست‌ها، جدول‌های داده و نماهای مقایسه‌ای
            </h4>
          </div>
          <span className="rounded-lg border border-emerald-500/40 bg-emerald-950/50 px-2.5 py-1 text-xs font-bold text-emerald-300 whitespace-nowrap shrink-0" dir="ltr">
            Zero ≠ Missing · Sync Map/Table/List
          </span>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-slate-800 pt-3">
          {[
            { id: 'layers_formatter', label: '۱. ۹ لایه نمایش، Formatter (صفر در برابر ناموجود) و View Registry' },
            { id: 'selection_sync', label: '۲. انتخاب صفحه در برابر Query، ستون‌های جدول و منع اختلاط نتایج' },
            { id: 'comparison_states', label: '۳. مقایسه هم‌واحد/دوره و ۱۰ وضعیت نمایش نتایج' },
            { id: 'phases_deliverables', label: '۴. نقشه ۱۲فازی و ۲۳ خروجی نهایی OUT-001..023' },
          ].map((tab) => (
            <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id as ResultsTabId)} data-testid={`rt-fe-results-tab-${tab.id}`} className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${activeTab === tab.id ? 'bg-teal-600 text-white' : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'}`}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'layers_formatter' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 text-xs">
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-2.5">
            <h5 className="font-bold text-teal-300 flex items-center gap-1.5"><Layers className="w-4 h-4 shrink-0" /> <span>تفکیک صفر واقعی از داده ناموجود و تبدیل ریال خام به تومان (§۱۹.۱۸ و §۱۹.۱۹)</span></h5>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" data-testid="rt-fe-results-val-irr" onClick={() => setSampleValueMode('irr')} className={`rounded px-2.5 py-1 text-[11px] font-bold ${sampleValueMode === 'irr' ? 'bg-teal-600 text-white' : 'bg-slate-800 text-slate-300'}`}>ریال خام ← تومان</button>
              <button type="button" data-testid="rt-fe-results-val-zero" onClick={() => setSampleValueMode('zero')} className={`rounded px-2.5 py-1 text-[11px] font-bold ${sampleValueMode === 'zero' ? 'bg-teal-600 text-white' : 'bg-slate-800 text-slate-300'}`}>صفر واقعی (0)</button>
              <button type="button" data-testid="rt-fe-results-val-missing" onClick={() => setSampleValueMode('missing')} className={`rounded px-2.5 py-1 text-[11px] font-bold ${sampleValueMode === 'missing' ? 'bg-teal-600 text-white' : 'bg-slate-800 text-slate-300'}`}>داده ناموجود (null)</button>
            </div>
            <div data-testid="rt-fe-results-fmt-out" className="rounded bg-slate-950 p-2.5 text-[11px] space-y-1 text-slate-200">
              <div>مقدار خام بدون تغییر: <strong className="font-mono text-amber-300" dir="ltr">{String(formattedSample.rawValue)}</strong></div>
              <div>خروجی نمایشی <span dir="ltr">Formatter</span> — <strong className="text-emerald-300">{formattedSample.displayText}</strong></div>
              <div>وضعیت موجودی داده — <strong className="font-mono text-cyan-300" dir="ltr">{formattedSample.availability} · isZero={String(formattedSample.isZero)}</strong></div>
            </div>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {RT_RESULTS_VIEW_REGISTRY_9.slice(0, 5).map((v) => (
                <div key={v.id} className="flex justify-between rounded bg-slate-950/70 px-2 py-1 text-[10px]">
                  <span className="text-slate-200 font-bold">{v.labelFa}</span>
                  <span className="font-mono text-indigo-300" dir="ltr">comp={String(v.capabilities.comparable)} · sort={String(v.capabilities.sortable)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-1 max-h-80 overflow-y-auto">
            <h5 className="font-bold text-cyan-300">۹ لایه معماری نمایش نتایج (§۱۹.۴)</h5>
            {RT_RESULTS_LAYERS_9.map((l) => (
              <div key={l.layer} className="rounded border border-slate-800 bg-slate-950/70 p-1.5 text-[11px]">
                <span className="inline-block rounded bg-slate-900 px-1.5 py-0.5 font-mono font-bold text-cyan-300 ml-1.5" dir="ltr">{l.layer}. {l.nameEn}</span>
                <span className="text-slate-200">{l.roleFa}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'selection_sync' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 text-xs">
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-2.5">
            <h5 className="font-bold text-indigo-300 flex items-center gap-1.5"><ShieldCheck className="w-4 h-4 shrink-0" /> <span>تفکیک انتخاب صفحه از کل <span dir="ltr">Query</span> و جلوگیری از اختلاط نتایج (§۱۹.۶ & §۱۹.۱۵)</span></h5>
            <div className="flex flex-wrap gap-2">
              <button type="button" data-testid="rt-fe-results-sel-page" onClick={() => setSelectionMode('explicit')} className={`rounded px-2.5 py-1 text-[11px] font-bold ${selectionMode === 'explicit' ? 'bg-teal-600 text-white' : 'bg-slate-800 text-slate-300'}`}>انتخاب صفحه (explicit)</button>
              <button type="button" data-testid="rt-fe-results-sel-query" onClick={() => setSelectionMode('all_matching')} className={`rounded px-2.5 py-1 text-[11px] font-bold ${selectionMode === 'all_matching' ? 'bg-teal-600 text-white' : 'bg-slate-800 text-slate-300'}`}>تمام نتایج Query (all_matching)</button>
              <button type="button" data-testid="rt-fe-results-stale-toggle" onClick={() => setStaleQueryMix((s) => !s)} className={`rounded px-2.5 py-1 text-[11px] font-bold ${staleQueryMix ? 'bg-rose-700 text-white' : 'bg-slate-800 text-slate-300'}`}>شبیه‌سازی اختلاط Query قدیمی</button>
            </div>
            <div data-testid="rt-fe-results-sel-out" className="rounded bg-slate-950 p-2.5 text-[11px] space-y-1 text-slate-200">
              <div>تعداد موثر: <strong className="text-emerald-300">{selectionOut.effectiveCount}</strong> — {selectionOut.scopeLabelFa}</div>
              <div>کنترل سرور و تأیید عمده: <strong className="text-amber-300">{selectionOut.requiresBulkConfirmation ? 'تأیید چندمرحله‌ای + کنترل مجوز در Backend' : 'کنترل مجوز سرور الزامی'}</strong></div>
              <div className={`font-bold ${integrityOut.accepted ? 'text-cyan-300' : 'text-rose-300'}`}>{integrityOut.completenessBannerFa}</div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-2.5">
            <h5 className="font-bold text-teal-300 flex items-center gap-1.5"><Columns3 className="w-4 h-4 shrink-0" /> <span>الگوهای آماده ستون جدول (<span dir="ltr">Column Preset</span>) و اولویت تنظیمات (§۱۹.۱۲)</span></h5>
            <div className="flex flex-wrap gap-1.5">
              {RT_RESULTS_COLUMN_PRESETS_4.map((p) => (
                <button key={p.id} type="button" onClick={() => setPresetId(p.id)} className={`rounded px-2.5 py-1 text-[11px] font-bold ${presetId === p.id ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300'}`}>{p.titleFa}</button>
              ))}
            </div>
            <div className="rounded bg-slate-950 p-2.5 text-[11px] space-y-1 text-slate-200">
              <div>منبع برنده اولویت: <strong className="font-mono text-emerald-300" dir="ltr">{columnPrefOut.sourceLevel}</strong></div>
              <div className="flex flex-wrap gap-1 pt-1">
                {columnPrefOut.resolvedColumns.map((col) => (
                  <span key={col} className="rounded bg-slate-800 px-2 py-0.5 font-mono text-[10px] text-cyan-200" dir="ltr">{col}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'comparison_states' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 text-xs">
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-2.5">
            <h5 className="font-bold text-cyan-300 flex items-center gap-1.5"><GitCompareArrows className="w-4 h-4 shrink-0" /> <span>مقایسه معنایی با کنترل یکسانی واحد و فیلد ناموجود (§۱۹.۱۷)</span></h5>
            <button type="button" data-testid="rt-fe-results-unit-toggle" onClick={() => setMismatchUnits((m) => !m)} className={`rounded px-3 py-1.5 text-[11px] font-bold ${mismatchUnits ? 'bg-rose-700 text-white' : 'bg-slate-800 text-slate-200'}`}>
              {mismatchUnits ? 'بازگشت به واحد هم‌سان (تومان/متر)' : 'تست خطای عدم تطابق واحد (IRT در برابر IRR)'}
            </button>
            <div data-testid="rt-fe-results-cmp-out" className={`rounded p-2.5 text-[11px] font-bold ${comparisonOut.comparable ? 'bg-emerald-950/60 text-emerald-200' : 'bg-rose-950/60 text-rose-200'}`}>
              {comparisonOut.reasonFa}
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-2">
            <h5 className="font-bold text-indigo-300">۱۰ وضعیت نمایش نتایج بدون جعل مقدار خالی (§۱۹.۲۳)</h5>
            <div className="flex flex-wrap gap-1.5">
              {RT_RESULTS_STATES_10.map((st) => (
                <span key={st} className="rounded bg-slate-800 px-2 py-0.5 font-mono text-[10px] text-cyan-200" dir="ltr">{st}</span>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'phases_deliverables' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 text-xs">
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-1 max-h-80 overflow-y-auto">
            <h5 className="font-bold text-cyan-300">نقشه اجرای ۱۲فازی (§۱۹.۳۳)</h5>
            {RT_RESULTS_EXECUTION_PHASES_12.map((ph) => (
              <div key={ph.phase} className="rounded border border-slate-800 bg-slate-950/70 p-1.5 text-[10px]">
                <strong className="text-teal-300">فاز {ph.phase}: </strong><span className="text-slate-200">{ph.titleFa}</span> <span className="font-mono text-indigo-300" dir="ltr">({ph.outputId})</span>
              </div>
            ))}
            <div className="pt-1 text-[10px] text-emerald-300">مرز انتقال به مرحله ۲۰: <code className="font-mono" dir="ltr">{RT_FE_STAGE20_BRIDGE_SPEC_ID}</code></div>
          </div>

          <div className="lg:col-span-2 rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-1.5">
            <h5 className="font-bold text-emerald-300">۲۳ خروجی نهایی مرحله نوزدهم (RT-FE-RESULTS-OUT-001 تا 023)</h5>
            <div className="max-h-72 overflow-y-auto grid grid-cols-1 gap-1 sm:grid-cols-2">
              {RT_RESULTS_DELIVERABLES_23.map((del) => (
                <div key={del.id} className="rounded border border-slate-800 bg-slate-950/60 p-1.5 text-[11px] text-slate-200">
                  <span className="font-mono font-bold text-emerald-300" dir="ltr">✓ {del.id}</span> <span>{del.titleFa}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
