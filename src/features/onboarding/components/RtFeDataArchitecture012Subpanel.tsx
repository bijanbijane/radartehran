import React, { useMemo, useState } from 'react';
import { NumericDraftInput } from '../../../components/ui/NumericDraftInput';
import {
  RT_FE_DATA_ARCHITECTURE_012_SPEC_ID,
  RT_DATA_RESPONSIBILITY_LAYERS_6,
  RT_DATA_STATE_CLASSIFICATION_5,
  RT_DATA_FORM_STATES_10,
  RT_DATA_UI_STATUS_MATRIX_11,
  RT_DATA_RETRY_POLICIES_6,
  RT_DATA_CLOUDFLARE_INTEGRATION_5,
  RT_DATA_EXECUTION_STEPS_20,
  RT_DATA_DELIVERABLES_25,
  RT_FE_FDA_CACHE_POLICIES_9,
  RT_FE_FDA_32_UNITS,
  resolveMutationCacheInvalidationTags,
  evaluateVersionedEntityConflict,
  normalizeQueryFilterKey,
  evaluateOptimisticUpdateEligibility,
} from '../services/rtFeDataArchitecture012Engine';

export const RtFeDataArchitecture012Subpanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'layers_states' | 'query_cache' | 'mutations_errors' | 'cloudflare_deliverables'>('layers_states');
  const [mutatedEntityId, setMutatedEntityId] = useState<string>('PR-1024');
  const [clientVersion, setClientVersion] = useState<number>(3);
  const [serverVersion, setServerVersion] = useState<number>(4);
  const [mutationKind, setMutationKind] = useState<'bookmark_toggle' | 'listing_publish' | 'transaction_submit'>('listing_publish');

  const invalidationPlan = useMemo(
    () => resolveMutationCacheInvalidationTags('property', mutatedEntityId, 'saadat-abad'),
    [mutatedEntityId],
  );
  const conflictVerdict = useMemo(
    () => evaluateVersionedEntityConflict(clientVersion, serverVersion),
    [clientVersion, serverVersion],
  );
  const normalizedKey = useMemo(
    () => normalizeQueryFilterKey('properties', { maxPrice: 15000, minPrice: 5000, authToken: 'secret-jwt', city: 'tehran', page: 2 }, null),
    [],
  );
  const optimisticVerdict = useMemo(() => evaluateOptimisticUpdateEligibility(mutationKind), [mutationKind]);

  return (
    <div className="space-y-4 text-right" dir="rtl" data-testid="rt-fe-fda-012-panel">
      <div className="rounded-xl border border-cyan-500/30 bg-slate-900/90 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded bg-cyan-500/20 px-2 py-0.5 font-mono text-[11px] font-bold text-cyan-300">
                {RT_FE_DATA_ARCHITECTURE_012_SPEC_ID}
              </span>
              <span className="rounded bg-indigo-500/20 px-2 py-0.5 text-[11px] font-bold text-indigo-300">
                بخش ۱۲ — ۶ لایه مسئولیت، ۵ نوع State، ۳۲ واحد FDA و ۲۵ خروجی RT-DATA-OUT
              </span>
            </div>
            <h4 className="mt-1.5 text-sm font-bold text-white">
              مرحله دوازدهم: نظام مدیریت داده در فرانت‌اند (Frontend Data Architecture & State Management)
            </h4>
          </div>
          <span className="rounded-lg border border-emerald-500/40 bg-emerald-950/50 px-2.5 py-1 text-xs font-bold text-emerald-300">
            TanStack Query + Zod + R2/D1/KV Isolation
          </span>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-slate-800 pt-3">
          {[
            { id: 'layers_states', label: '۱. ۶ لایه مسئولیت، ۵ طبقه State و ۱۰ حالت فرم' },
            { id: 'query_cache', label: '۲. رجیستری Query Key، ۹ سیاست کش و ابطال تگ‌محور' },
            { id: 'mutations_errors', label: '۳. Optimistic vs Backend، تعارض ۴۰۹ و ۱۱ وضعیت خطا/داده' },
            { id: 'cloudflare_deliverables', label: '۴. اتصال Cloudflare، نقشه ۲۰گامی و ۲۵ خروجی RT-DATA-OUT' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              data-testid={`rt-fe-fda-tab-${tab.id}`}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                activeTab === tab.id ? 'bg-cyan-600 text-white' : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'layers_states' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 text-xs">
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-2">
            <h5 className="font-bold text-cyan-300">طبقه‌بندی ۵گانه وضعیت داده (۱۲.۳) و ۱۰ وضعیت Form State</h5>
            {RT_DATA_STATE_CLASSIFICATION_5.map((st) => (
              <div key={st.tier} className="rounded border border-slate-800 bg-slate-950/70 p-2">
                <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[11px]">
                  <span className="font-bold text-white whitespace-nowrap shrink-0" dir="ltr">{st.tier}</span>
                  <span className="text-emerald-300 text-left">{st.responsibilityFa}</span>
                </div>
                <div className="mt-1 text-[11px] text-slate-300">{st.examplesFa}</div>
              </div>
            ))}
            <div className="flex flex-wrap gap-1 pt-1" dir="ltr">
              {RT_DATA_FORM_STATES_10.map((fs) => (
                <span key={fs} className="rounded bg-slate-800 px-2 py-0.5 font-mono text-[10px] text-indigo-300">
                  {fs}
                </span>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-2">
            <h5 className="font-bold text-indigo-300">مرزبندی ۶لایه مسئولیت (۱۲.۲) و جریان استاندارد دریافت داده (۱۲.۴)</h5>
            {RT_DATA_RESPONSIBILITY_LAYERS_6.map((layer) => (
              <div key={layer.id} className="rounded border border-slate-800 bg-slate-950/70 p-2 text-[11px]">
                <span className="font-mono font-bold text-cyan-300">{layer.layerEn}: </span>
                <span className="text-slate-200">{layer.roleFa}</span>
              </div>
            ))}
            <div className="rounded border border-slate-800 bg-slate-950 p-2 font-mono text-[10px] text-emerald-300" dir="ltr">
              Page/Component → Feature Hook → Query Definition → Repository → API Client → Backend → Validation → Query Cache
            </div>
          </div>
        </div>
      )}

      {activeTab === 'query_cache' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 text-xs">
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-1.5">
            <h5 className="font-bold text-emerald-300">۹ دسته سیاست Cache Management (۱۲.۹)</h5>
            <div className="max-h-72 overflow-y-auto space-y-1">
              {RT_FE_FDA_CACHE_POLICIES_9.map((cp) => (
                <div key={cp.dataCategoryFa} className="flex items-center justify-between rounded border border-slate-800 bg-slate-950/70 p-2 text-[11px]">
                  <span className="font-bold text-white">{cp.dataCategoryFa}</span>
                  <span className="font-mono text-cyan-300" dir="ltr">
                    stale={cp.staleTimeMs / 1000}s | public={String(cp.publicCacheSafe)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-3">
            <h5 className="font-bold text-cyan-300">ابطال تگ‌محور کش (۱۲.۱۰) و نرمال‌ساز Query Key بدون نشت توکن (۱۲.۸)</h5>
            <div className="flex gap-1.5">
              {['PR-1024', 'PR-2048', 'PR-3096'].map((id) => (
                <button key={id} type="button" onClick={() => setMutatedEntityId(id)} className={`rounded px-2.5 py-1 font-mono text-[11px] ${mutatedEntityId === id ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-300'}`}>
                  {id}
                </button>
              ))}
            </div>
            <div className="rounded border border-slate-800 bg-slate-950 p-3 space-y-1 text-[11px]">
              <div>تگ اصلی ابطال‌شده: <code className="text-emerald-300" dir="ltr">{invalidationPlan.primaryTag}</code></div>
              <div>تگ‌های وابسته: <code className="text-cyan-300" dir="ltr">{invalidationPlan.dependentTags.join(', ')}</code></div>
              <div>فیلدهای حساس حذف‌شده از Query Key: <code className="text-rose-300" dir="ltr">{normalizedKey.strippedSensitiveKeys.join(', ')}</code></div>
              <div className="font-mono text-[10px] text-slate-300 break-all" dir="ltr">
                {JSON.stringify(normalizedKey.queryKeyTuple)}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'mutations_errors' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 text-xs">
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-3">
            <h5 className="font-bold text-amber-300">کنترل تعارض نسخه ۴۰۹ (۱۲.۱۹) و Optimistic Update (۱۲.۱۸)</h5>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-1.5 text-slate-300">
                نسخه کلاینت:
                <NumericDraftInput min={1} max={9999} fallback={1} value={clientVersion} onValueChange={setClientVersion} className="w-14 rounded border border-slate-700 bg-slate-950 px-2 py-0.5 font-mono text-white" />
              </label>
              <label className="flex items-center gap-1.5 text-slate-300">
                نسخه سرور:
                <NumericDraftInput min={1} max={9999} fallback={1} value={serverVersion} onValueChange={setServerVersion} className="w-14 rounded border border-slate-700 bg-slate-950 px-2 py-0.5 font-mono text-white" />
              </label>
              <select
                aria-label="نوع عملیات تغییر داده"
                value={mutationKind}
                onChange={(e) => setMutationKind(e.target.value as typeof mutationKind)}
                className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-[11px] text-white"
              >
                <option value="bookmark_toggle">نشان‌کردن ملک (Bookmark)</option>
                <option value="listing_publish">انتشار آگهی (حساس)</option>
                <option value="transaction_submit">ثبت معامله (حساس)</option>
              </select>
            </div>
            <div className={`rounded p-2 text-[11px] font-bold ${conflictVerdict.conflictDetected ? 'bg-amber-950/60 text-amber-300' : 'bg-emerald-950/60 text-emerald-300'}`}>
              {conflictVerdict.actionFa}
            </div>
            <div className={`rounded p-2 text-[11px] ${optimisticVerdict.optimisticAllowed ? 'bg-cyan-950/50 text-cyan-200' : 'bg-rose-950/50 text-rose-200'}`}>
              {optimisticVerdict.reasonFa}
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-2">
            <h5 className="font-bold text-indigo-300">۱۱ وضعیت داده/خطا (۱۲.۱۶) و ۶ سیاست Retry (۱۲.۱۷)</h5>
            <div className="max-h-40 overflow-y-auto space-y-1">
              {RT_DATA_UI_STATUS_MATRIX_11.map((row) => (
                <div key={row.status} className="flex justify-between rounded bg-slate-950/70 px-2 py-1 text-[10px]">
                  <span className="font-mono font-bold text-cyan-300">{row.status}</span>
                  <span className="text-slate-300">{row.uiBehaviorFa}</span>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-1 pt-1">
              {RT_DATA_RETRY_POLICIES_6.map((rp) => (
                <div key={rp.operation} className="rounded bg-slate-950 px-2 py-1 text-[10px] text-slate-300">
                  <strong className="text-emerald-300">{rp.operation}:</strong> {rp.policyFa}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'cloudflare_deliverables' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 text-xs">
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-1.5">
            <h5 className="font-bold text-cyan-300">اتصال Cloudflare (Workers/D1/KV/R2/Queues)</h5>
            {RT_DATA_CLOUDFLARE_INTEGRATION_5.map((cf) => (
              <div key={cf.service} className="rounded border border-slate-800 bg-slate-950/70 p-2 text-[11px]">
                <span className="font-mono font-bold text-emerald-300">{cf.service}: </span>
                <span className="text-slate-200">{cf.frontendPathFa}</span>
              </div>
            ))}
            <div className="pt-1 text-[10px] text-slate-400">
              نقشه اجرای ۲۰گامی ({RT_DATA_EXECUTION_STEPS_20.length} گام) و {RT_FE_FDA_32_UNITS.length} واحد FDA فعال است.
            </div>
          </div>

          <div className="lg:col-span-2 rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-1.5">
            <h5 className="font-bold text-emerald-300">۲۵ خروجی الزامی مرحله دوازدهم (RT-DATA-OUT-001 تا RT-DATA-OUT-025)</h5>
            <div className="max-h-72 overflow-y-auto grid grid-cols-1 gap-1 sm:grid-cols-2">
              {RT_DATA_DELIVERABLES_25.map((del) => (
                <div key={del.id} className="rounded border border-slate-800 bg-slate-950/60 p-1.5 text-[11px] text-slate-200">
                  <span className="font-mono font-bold text-emerald-300">✓ {del.id}: </span>
                  <span>{del.titleFa}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
