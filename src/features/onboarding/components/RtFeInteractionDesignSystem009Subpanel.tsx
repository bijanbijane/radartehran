import React, { useMemo, useState } from 'react';
import { NumericDraftInput } from '../../../components/ui/NumericDraftInput';
import {
  RT_FE_INTERACTION_DESIGN_SYSTEM_009_SPEC_ID,
  RT_FE_IDS_PROTECTION_LEVELS_5,
  RT_FE_IDS_LIFECYCLE_8_STEPS,
  RT_FE_IDS_ASYNC_STATES_8,
  RT_FE_IDS_KEYBOARD_SHORTCUTS_8,
  RT_FE_IDS_ERROR_RECOVERY_10,
  RT_FE_IDS_STATE_OWNERSHIP_5,
  RT_FE_IDS_RESPONSIVE_MATRIX_9,
  RT_FE_IDS_23_UNITS,
  RT_FE_IDS_DELIVERABLES_25,
  evaluateAsyncRequestOrdering,
} from '../services/rtFeInteractionDesignSystem009Engine';

export const RtFeInteractionDesignSystem009Subpanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<
    'lifecycle_protection' | 'async_race_recovery' | 'shortcuts_state_matrix' | 'units_deliverables'
  >('lifecycle_protection');
  const [latestSeq, setLatestSeq] = useState<number>(5);
  const [incomingSeq, setIncomingSeq] = useState<number>(3);
  const [cancelledFlag, setCancelledFlag] = useState<boolean>(false);

  const raceCheck = useMemo(
    () => evaluateAsyncRequestOrdering(latestSeq, incomingSeq, cancelledFlag),
    [latestSeq, incomingSeq, cancelledFlag],
  );

  return (
    <div className="space-y-4 text-right" dir="rtl" data-testid="rt-fe-ids-009-panel">
      {/* Header Banner */}
      <div className="rounded-xl border border-indigo-500/30 bg-slate-900/90 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded bg-indigo-500/20 px-2 py-0.5 font-mono text-[11px] font-bold text-indigo-300">
                {RT_FE_INTERACTION_DESIGN_SYSTEM_009_SPEC_ID}
              </span>
              <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-[11px] font-bold text-emerald-300">
                بخش ۹ از ۲۸ — ۲۳ واحد رفتاری، چرخه تعامل ۸گامی، مهار Race Condition و ۲۵ خروجی الزامی
              </span>
            </div>
            <h4 className="mt-1.5 text-sm font-bold text-white">
              مرحله نهم: طراحی و معماری نظام تعامل و رفتار رابط کاربری (Interaction Design System)
            </h4>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="rounded-lg border border-slate-700 bg-slate-800/80 px-2.5 py-1 text-slate-200">
              IDS-001..023 + IDS-OUT-001..025
            </span>
            <span className="rounded-lg border border-emerald-500/40 bg-emerald-950/50 px-2.5 py-1 font-bold text-emerald-300">
              دروازه مرحله ۱۰ (Page Templates & Patterns): آماده و تاییدشده
            </span>
          </div>
        </div>

        {/* Sub-tabs */}
        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-slate-800 pt-3">
          {[
            { id: 'lifecycle_protection', label: '۱. چرخه ۸مرحله‌ای تعامل و ۵ سطح حفاظت از عملیات (IDS-001..004)' },
            { id: 'async_race_recovery', label: '۲. وضعیت‌های غیرهم‌زمان، مهار Race Condition و بازیابی ۱۰ نوع خطا (IDS-011, 019)' },
            { id: 'shortcuts_state_matrix', label: '۳. میان‌برهای صفحه‌کلید، مالکیت ۵لایه وضعیت و ماتریس دستگاه‌ها (IDS-018, 020, 021)' },
            { id: 'units_deliverables', label: '۴. ۲۳ واحد تعاملی و ۲۵ خروجی الزامی (IDS-OUT-001..025)' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              data-testid={`rt-fe-ids-tab-${tab.id}`}
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

      {activeTab === 'lifecycle_protection' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 text-xs">
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-2">
            <h5 className="font-bold text-indigo-300">چرخه استاندارد ۸مرحله‌ای هر تعامل در رادار تهران (IDS-002)</h5>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {RT_FE_IDS_LIFECYCLE_8_STEPS.map((st) => (
                <div key={st.step} className="rounded border border-slate-800 bg-slate-950/70 p-2">
                  <div className="font-mono font-bold text-cyan-300">{st.step}. {st.key}</div>
                  <div className="mt-0.5 text-[11px] text-slate-300">{st.roleFa}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-2">
            <h5 className="font-bold text-emerald-300">۵ سطح حفاظت از عملیات بر اساس میزان حساسیت (IDS-001 §3.3)</h5>
            {RT_FE_IDS_PROTECTION_LEVELS_5.map((lvl) => (
              <div key={lvl.levelId} className="flex items-center justify-between rounded border border-slate-800 bg-slate-950/70 p-2.5">
                <div>
                  <span className="font-bold text-white">{lvl.titleFa}</span>
                  <p className="text-[11px] text-slate-300">{lvl.behaviorFa}</p>
                </div>
                <div className="flex gap-1.5 text-[10px]">
                  {lvl.supportsUndo && <span className="rounded bg-cyan-950 px-2 py-0.5 text-cyan-300">Undo مجاز</span>}
                  {lvl.requiresConfirmation && <span className="rounded bg-amber-950 px-2 py-0.5 text-amber-300">نیازمند تأیید</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'async_race_recovery' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 text-xs">
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-3">
            <h5 className="font-bold text-cyan-300">مدل ۸حالته عملیات غیرهم‌زمان و شبیه‌ساز مهار Race Condition (IDS-011)</h5>
            <div className="flex flex-wrap gap-1.5">
              {RT_FE_IDS_ASYNC_STATES_8.map((st) => (
                <span key={st} className="rounded border border-slate-700 bg-slate-950 px-2 py-1 font-mono text-[11px] text-indigo-300">
                  {st}
                </span>
              ))}
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-950 p-3 space-y-2">
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-1 text-slate-300">
                  آخرین درخواست ارسالی (#):
                  <NumericDraftInput
                    min={1}
                    max={99999}
                    fallback={1}
                    value={latestSeq}
                    onValueChange={setLatestSeq}
                    className="w-16 rounded border border-slate-700 bg-slate-900 px-2 py-0.5 font-mono text-white"
                  />
                </label>
                <label className="flex items-center gap-1 text-slate-300">
                  پاسخ دریافتی (#):
                  <NumericDraftInput
                    min={1}
                    max={99999}
                    fallback={1}
                    value={incomingSeq}
                    onValueChange={setIncomingSeq}
                    className="w-16 rounded border border-slate-700 bg-slate-900 px-2 py-0.5 font-mono text-white"
                  />
                </label>
                <label className="flex items-center gap-1 text-slate-300">
                  <input
                    type="checkbox"
                    checked={cancelledFlag}
                    onChange={(e) => setCancelledFlag(e.target.checked)}
                  />
                  لغوشده توسط کاربر
                </label>
              </div>
              <div className={`rounded p-2 text-[11px] font-bold ${raceCheck.accepted ? 'bg-emerald-950/60 text-emerald-300' : 'bg-amber-950/60 text-amber-300'}`}>
                {raceCheck.reasonFa}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-2">
            <h5 className="font-bold text-amber-300">۱۰ طبقه خطای تعاملی و قرارداد بازیابی بدون ازدست‌رفتن داده کاربر (IDS-019)</h5>
            <div className="max-h-72 overflow-y-auto space-y-1.5">
              {RT_FE_IDS_ERROR_RECOVERY_10.map((err) => (
                <div key={err.errorClass} className="rounded border border-slate-800 bg-slate-950/70 p-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white">{err.titleFa}</span>
                    <span className="font-mono text-[11px] text-indigo-300">{err.errorClass}</span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-300">{err.recoveryBehaviorFa}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'shortcuts_state_matrix' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 text-xs">
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-1.5">
            <h5 className="font-bold text-emerald-300">۸ میان‌بر استاندارد صفحه‌کلید (IDS-018)</h5>
            {RT_FE_IDS_KEYBOARD_SHORTCUTS_8.map((sc) => (
              <div key={sc.shortcut} className="flex items-center justify-between rounded border border-slate-800 bg-slate-950/70 p-2">
                <span className="text-[11px] text-slate-200">{sc.actionFa}</span>
                <kbd className="rounded bg-slate-800 px-2 py-0.5 font-mono text-[11px] text-cyan-300" dir="ltr">{sc.shortcut}</kbd>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-1.5">
            <h5 className="font-bold text-cyan-300">قانون تک‌مالکی وضعیت در ۵ لایه (IDS-020)</h5>
            {RT_FE_IDS_STATE_OWNERSHIP_5.map((own) => (
              <div key={own.tier} className="rounded border border-slate-800 bg-slate-950/70 p-2">
                <div className="flex justify-between font-mono text-[11px]">
                  <span className="font-bold text-white">{own.tier}</span>
                  <span className="text-emerald-300">{own.owner}</span>
                </div>
                <div className="mt-0.5 text-[11px] text-slate-300">{own.examplesFa}</div>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-1.5">
            <h5 className="font-bold text-indigo-300">ماتریس ۹ردیفه تطبیق تعامل در دستگاه‌ها (IDS-021)</h5>
            <div className="max-h-72 overflow-y-auto space-y-1">
              {RT_FE_IDS_RESPONSIVE_MATRIX_9.map((row) => (
                <div key={row.interaction} className="rounded border border-slate-800 bg-slate-950/70 p-1.5 text-[11px]">
                  <div className="font-mono font-bold text-white">{row.interaction}</div>
                  <div className="text-slate-300">دسکتاپ: {row.desktop} | تبلت: {row.tablet} | موبایل: {row.mobile}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'units_deliverables' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 text-xs">
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-1.5">
            <h5 className="font-bold text-indigo-300">۲۳ واحد معماری نظام تعامل (IDS-001 تا IDS-023)</h5>
            <div className="max-h-72 overflow-y-auto space-y-1">
              {RT_FE_IDS_23_UNITS.map((u) => (
                <div key={u.id} className="rounded border border-slate-800 bg-slate-950/60 p-1.5 text-[11px] text-slate-200">
                  <span className="font-mono font-bold text-indigo-300">{u.id}: </span>
                  <span>{u.titleFa}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-1.5">
            <h5 className="font-bold text-emerald-300">۲۵ خروجی الزامی مرحله نهم (IDS-OUT-001 تا IDS-OUT-025)</h5>
            <div className="max-h-72 overflow-y-auto space-y-1">
              {RT_FE_IDS_DELIVERABLES_25.map((del) => (
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
