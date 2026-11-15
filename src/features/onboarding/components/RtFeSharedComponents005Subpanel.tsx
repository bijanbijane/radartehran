import React, { useMemo, useState } from 'react';
import {
  RT_FE_SHARED_COMPONENTS_005_SPEC_ID,
  RT_FE_SC_60_COMPONENTS,
  RT_FE_SC_BEHAVIORAL_STATES_14,
  RT_FE_SC_DELIVERABLES_25,
  resolveComponentStatePrecedence,
  resolveCascadingLocationSelection,
  normalizeErrorForSharedFeedback,
  type SharedComponentGroup,
} from '../services/rtFeSharedComponents005Engine';

export const RtFeSharedComponents005Subpanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'catalog' | 'states_precedence' | 'composites_isolation' | 'deliverables'>('catalog');
  const [groupFilter, setGroupFilter] = useState<SharedComponentGroup | 'all'>('all');
  const [flagDisabled, setFlagDisabled] = useState<boolean>(false);
  const [flagLoading, setFlagLoading] = useState<boolean>(true);
  const [flagInvalid, setFlagInvalid] = useState<boolean>(false);
  const [flagFocused, setFlagFocused] = useState<boolean>(true);
  const [flagReadOnly, setFlagReadOnly] = useState<boolean>(false);

  const [locationState, setLocationState] = useState({
    countryId: 'IR',
    provinceId: 'THR',
    cityId: 'tehran',
    districtId: 'region-2' as string | null,
    neighborhoodId: 'saadat-abad' as string | null,
  });

  const [rawErrorInput, setRawErrorInput] = useState<string>(
    'D1_ERROR: SQLITE_CONSTRAINT_PRIMARYKEY at worker/api-proxy.ts:142 (token=secret_123)',
  );

  const filteredComponents = useMemo(
    () =>
      groupFilter === 'all'
        ? RT_FE_SC_60_COMPONENTS
        : RT_FE_SC_60_COMPONENTS.filter((c) => c.group === groupFilter),
    [groupFilter],
  );

  const statePrecedence = useMemo(
    () =>
      resolveComponentStatePrecedence({
        disabled: flagDisabled,
        loading: flagLoading,
        invalid: flagInvalid,
        focused: flagFocused,
        readOnly: flagReadOnly,
      }),
    [flagDisabled, flagLoading, flagInvalid, flagFocused, flagReadOnly],
  );

  const normalizedFeedback = useMemo(
    () => normalizeErrorForSharedFeedback(rawErrorInput),
    [rawErrorInput],
  );

  return (
    <div className="space-y-4 text-right" dir="rtl" data-testid="rt-fe-shared-components-005-panel">
      {/* Header Banner */}
      <div className="rounded-xl border border-indigo-500/30 bg-slate-900/90 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded bg-indigo-500/20 px-2 py-0.5 font-mono text-[11px] font-bold text-indigo-300">
                {RT_FE_SHARED_COMPONENTS_005_SPEC_ID}
              </span>
              <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-[11px] font-bold text-emerald-300">
                بخش ۵ از ۲۸ — کاتالوگ ۶۰ کامپوننت مشترک (COMP-001 تا COMP-060)
              </span>
            </div>
            <h4 className="mt-1.5 text-sm font-bold text-white">
              مرحله پنجم: طراحی و معماری کتابخانه کامپوننت‌های مشترک (Shared Component Library) رادار تهران
            </h4>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="rounded-lg border border-slate-700 bg-slate-800/80 px-2.5 py-1 text-slate-200">
              ۳ سطح: Primitive / Composite / Domain
            </span>
            <span className="rounded-lg border border-emerald-500/40 bg-emerald-950/50 px-2.5 py-1 font-bold text-emerald-300">
              ۲۵ خروجی معماری (SC-OUT-001..025): تاییدشده
            </span>
          </div>
        </div>

        {/* Sub-tabs */}
        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-slate-800 pt-3">
          {[
            { id: 'catalog', label: '۱. کاتالوگ ۶۰ کامپوننت در ۸ گروه (COMP-001..COMP-060)' },
            { id: 'states_precedence', label: '۲. ماتریس ۱۴ وضعیت رفتاری و آزمایشگر اولویت وضعیت‌ها' },
            { id: 'composites_isolation', label: '۳. شبیه‌ساز LocationSelector و ایزولاسیون خطای بک‌اند/Cloudflare' },
            { id: 'deliverables', label: '۴. فهرست ۲۵ خروجی الزامی (SC-OUT-001..025) و استاندارد نسخه‌بندی' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              data-testid={`rt-fe-sc-tab-${tab.id}`}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                activeTab === tab.id
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'catalog' && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {[
              { id: 'all', label: `همه (${RT_FE_SC_60_COMPONENTS.length})` },
              { id: 'primitives', label: 'Primitives (پایه)' },
              { id: 'forms', label: 'Forms (فرم‌ها)' },
              { id: 'data-display', label: 'Data Display (نمایش داده)' },
              { id: 'navigation', label: 'Navigation (ناوبری)' },
              { id: 'feedback', label: 'Feedback (بازخورد)' },
              { id: 'overlays', label: 'Overlays (پنجره‌ها)' },
              { id: 'composites', label: 'Composites (ترکیبی)' },
              { id: 'domain', label: 'Domain (تخصصی مشترک رادار)' },
            ].map((grp) => (
              <button
                key={grp.id}
                type="button"
                onClick={() => setGroupFilter(grp.id as typeof groupFilter)}
                className={`rounded-lg px-2.5 py-1 text-xs font-bold ${
                  groupFilter === grp.id ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300'
                }`}
              >
                {grp.label}
              </button>
            ))}
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
            <div className="max-h-80 overflow-y-auto grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {filteredComponents.map((comp) => (
                <div key={comp.code} className="rounded-lg border border-slate-800 bg-slate-950/70 p-2.5 text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-indigo-300">{comp.code}</span>
                    <span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-[10px] text-emerald-300">
                      {comp.tier}
                    </span>
                  </div>
                  <div className="font-bold text-white">{comp.name}</div>
                  <div className="font-mono text-[10px] text-cyan-300" dir="ltr">
                    {comp.folderPath}
                  </div>
                  <div className="text-[11px] text-slate-300">{comp.responsibilityFa}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'states_precedence' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-3 text-xs">
            <h5 className="font-bold text-indigo-300">
              آزمایشگر سیاست ترکیب و اولویت وضعیت‌های کامپوننت (بخش ۱۳.۳ — Disabled + Loading / Invalid + Focus)
            </h5>
            <div className="flex flex-wrap gap-3 text-slate-200">
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={flagDisabled} onChange={(e) => setFlagDisabled(e.target.checked)} />
                Disabled
              </label>
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={flagLoading} onChange={(e) => setFlagLoading(e.target.checked)} />
                Loading
              </label>
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={flagInvalid} onChange={(e) => setFlagInvalid(e.target.checked)} />
                Invalid (Error)
              </label>
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={flagFocused} onChange={(e) => setFlagFocused(e.target.checked)} />
                Focus
              </label>
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={flagReadOnly} onChange={(e) => setFlagReadOnly(e.target.checked)} />
                ReadOnly
              </label>
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-950 p-3 space-y-1.5">
              <div>
                <span className="text-slate-400">وضعیت مؤثر نهایی: </span>
                <span className="font-mono font-bold text-emerald-300">{statePrecedence.effectiveVisualState}</span>
              </div>
              <div>
                <span className="text-slate-400">قفل تعامل و کلیک تکراری: </span>
                <span className="font-mono text-amber-300">{String(statePrecedence.interactionBlocked)}</span>
              </div>
              <div className="text-slate-300">{statePrecedence.explanationFa}</div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-2 text-xs">
            <h5 className="font-bold text-cyan-300">ماتریس ۱۴ وضعیت رفتاری استاندارد کامپوننت‌ها (SC-OUT-014)</h5>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {RT_FE_SC_BEHAVIORAL_STATES_14.map((st) => (
                <div key={st} className="rounded border border-slate-800 bg-slate-950/70 p-2 font-mono text-slate-200">
                  {st}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'composites_isolation' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-3 text-xs">
            <h5 className="font-bold text-emerald-300">
              شبیه‌ساز سلسله‌مراتبی LocationSelector (COMP-040 — پاک‌سازی خودکار سطوح پایین‌تر با تغییر سطح بالاتر)
            </h5>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setLocationState((s) => resolveCascadingLocationSelection(s, { level: 'city', newId: 'karaj' }))}
                className="rounded bg-indigo-600 px-2.5 py-1 font-bold text-white"
              >
                تغییر شهر به کرج (پاک‌سازی منطقه و محله)
              </button>
              <button
                type="button"
                onClick={() => setLocationState((s) => resolveCascadingLocationSelection(s, { level: 'district', newId: 'region-5' }))}
                className="rounded bg-cyan-600 px-2.5 py-1 font-bold text-white"
              >
                تغییر منطقه به منطقه ۵ (پاک‌سازی محله)
              </button>
              <button
                type="button"
                onClick={() => setLocationState((s) => resolveCascadingLocationSelection(s, { level: 'neighborhood', newId: 'punak' }))}
                className="rounded bg-emerald-600 px-2.5 py-1 font-bold text-white"
              >
                انتخاب محله پونک
              </button>
            </div>
            <div className="rounded border border-slate-800 bg-slate-950 p-3 font-mono text-[11px] text-slate-200" dir="ltr">
              City: {locationState.cityId} | District: {locationState.districtId ?? 'null'} | Neighborhood: {locationState.neighborhoodId ?? 'null'}
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-3 text-xs">
            <h5 className="font-bold text-amber-300">
              ایزولاسیون و نرمال‌سازی خطای بک‌اند/Cloudflare در کامپوننت‌های مشترک (بخش ۱۷.۵ — SC-OUT-019)
            </h5>
            <input
              type="text"
              dir="ltr"
              value={rawErrorInput}
              onChange={(e) => setRawErrorInput(e.target.value)}
              className="w-full rounded border border-slate-700 bg-slate-950 p-1.5 font-mono text-[11px] text-white"
            />
            <div className="rounded border border-slate-800 bg-slate-950 p-3 space-y-1">
              <div className="text-emerald-300 font-bold">پیام امن نمایشی در Alert/Toast:</div>
              <div className="text-white">{normalizedFeedback.userFacingMessageFa}</div>
              <div className="text-[11px] text-slate-400">
                افشای جزئیات فنی (SQL / Worker / Stack Trace): خیر ({String(normalizedFeedback.leakedTechnicalInternals)}) | قابلیت تلاش مجدد: {String(normalizedFeedback.retryable)}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'deliverables' && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-2 text-xs">
          <h5 className="font-bold text-indigo-300">
            خروجی‌های ۲۵گانه مرحله پنجم (SC-OUT-001 تا SC-OUT-025) با نسخه‌بندی Semantic Versioning (MAJOR.MINOR.PATCH)
          </h5>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {RT_FE_SC_DELIVERABLES_25.map((d) => (
              <div key={d.id} className="rounded border border-slate-800 bg-slate-950/60 p-2 text-[11px] text-slate-200">
                <span className="font-mono font-bold text-emerald-300">✓ {d.id}: </span>
                <span>{d.titleFa}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
