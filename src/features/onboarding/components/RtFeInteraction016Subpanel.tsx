import React, { useMemo, useState } from 'react';
import { CheckSquare, Hand, Keyboard, ShieldCheck } from 'lucide-react';
import {
  RT_FE_INTERACTION_PATTERNS_016_SPEC_ID, RT_FE_STAGE17_BRIDGE_SPEC_ID,
  RT_INT_MODEL_STEPS_5, RT_INT_CATEGORIES_16, RT_INT_CONFIRMATION_LEVELS_5,
  RT_INT_RECOVERY_STRATEGIES_8, RT_INT_EXECUTION_PHASES_10, RT_INT_DELIVERABLES_30,
  evaluateControlInteractionTrigger, evaluateActionConfirmationAndFeedback,
  evaluateSelectionAndToolbar, resolveMotionTiming,
} from '../services/rtFeInteraction016Engine';

type IntTabId = 'model_states' | 'confirmation_selection' | 'recovery_motion' | 'phases_deliverables';

export const RtFeInteraction016Subpanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<IntTabId>('model_states');
  const [controlState, setControlState] = useState<'Idle' | 'Disabled' | 'Loading'>('Loading');
  const [isOffline, setIsOffline] = useState<boolean>(false);
  const [riskLevel, setRiskLevel] = useState<'C0' | 'C1' | 'C2' | 'C3' | 'C4'>('C3');
  const [failedCount, setFailedCount] = useState<number>(2);
  const [selectedIds, setSelectedIds] = useState<string[]>(['PR-101', 'PR-102']);
  const [reducedMotion, setReducedMotion] = useState<boolean>(false);

  const triggerOut = useMemo(
    () => evaluateControlInteractionTrigger({ currentState: controlState, allowConcurrent: false, isOffline, requiresServer: true }),
    [controlState, isOffline],
  );
  const actionOut = useMemo(
    () =>
      evaluateActionConfirmationAndFeedback({
        riskLevel,
        entityLabelFa: 'آگهی‌های منطقه ۵',
        totalTargets: 5,
        succeededTargets: 5 - failedCount,
        failedTargets: failedCount,
        hasReliableProgress: false,
      }),
    [riskLevel, failedCount],
  );
  const selectionOut = useMemo(
    () => evaluateSelectionAndToolbar({ selectedIds, totalAvailableChildren: 4 }),
    [selectedIds],
  );
  const motionOut = useMemo(() => resolveMotionTiming('panel', reducedMotion), [reducedMotion]);

  const toggleItem = (id: string) =>
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  return (
    <div dir="rtl" data-testid="rt-fe-int-016-panel" className="space-y-4 text-right">
      <div className="rounded-xl border border-teal-500/30 bg-slate-900/95 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-teal-500/20 px-2 py-0.5 font-mono text-[11px] font-bold text-teal-300" dir="ltr">
                {RT_FE_INTERACTION_PATTERNS_016_SPEC_ID}
              </span>
              <span className="rounded bg-cyan-500/20 px-2 py-0.5 text-[11px] font-bold text-cyan-300">
                ۱۶ گروه تعامل · ۱۳ وضعیت · ماتریس C0-C4 · ۳۰ خروجی RT-FE-INT-OUT
              </span>
            </div>
            <h4 className="mt-1.5 text-sm font-bold text-white">
              مرحله شانزدهم: نظام الگوهای تعامل، رفتار کنترل‌ها و ریزتعامل‌های رابط کاربری
            </h4>
          </div>
          <span className="rounded-lg border border-emerald-500/40 bg-emerald-950/50 px-2.5 py-1 text-xs font-bold text-emerald-300 whitespace-nowrap shrink-0" dir="ltr">
            Trigger → State → Feedback → Recovery
          </span>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-slate-800 pt-3">
          {[
            { id: 'model_states', label: '۱. مدل ۵مرحله‌ای، ۱۶ الگو و مهار Double Submit' },
            { id: 'confirmation_selection', label: '۲. تأیید C0-C4، نتیجه جزئی و Multi-Selection' },
            { id: 'recovery_motion', label: '۳. ۸ بازیابی خطا، Motion و Reduced Motion' },
            { id: 'phases_deliverables', label: '۴. مهاجرت ۱۰فازی و ۳۰ خروجی RT-FE-INT-OUT' },
          ].map((tab) => (
            <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id as IntTabId)} data-testid={`rt-fe-int-tab-${tab.id}`} className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${activeTab === tab.id ? 'bg-teal-600 text-white' : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'}`}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'model_states' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 text-xs">
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-2">
            <h5 className="font-bold text-teal-300 flex items-center gap-1.5"><Hand className="w-4 h-4" /> مدل ۵گانه تعامل (§۱۶.۳) و آزمون Double-Submit / Offline</h5>
            {RT_INT_MODEL_STEPS_5.map((s) => (
              <div key={s.step} className="rounded border border-slate-800 bg-slate-950/70 p-2 text-[11px]">
                <span className="inline-block rounded bg-slate-900 px-1.5 py-0.5 font-mono font-bold text-cyan-300 ml-1.5" dir="ltr">{s.step}. {s.nameEn}</span>
                <span className="text-slate-200">{s.roleFa}</span>
              </div>
            ))}
            <div className="pt-2 space-y-2 border-t border-slate-800">
              <div className="flex flex-wrap items-center gap-2">
                {(['Idle', 'Loading', 'Disabled'] as const).map((st) => (
                  <button key={st} type="button" data-testid={`rt-fe-int-state-${st}`} onClick={() => setControlState(st)} className={`rounded px-2.5 py-1 text-[11px] font-bold ${controlState === st ? 'bg-teal-600 text-white' : 'bg-slate-800 text-slate-300'}`}>
                    {st}
                  </button>
                ))}
                <label className="flex items-center gap-1 text-[11px] text-slate-300 cursor-pointer">
                  <input type="checkbox" data-testid="rt-fe-int-offline-toggle" checked={isOffline} onChange={(e) => setIsOffline(e.target.checked)} />
                  حالت Offline
                </label>
              </div>
              <div data-testid="rt-fe-int-trigger-verdict" className={`rounded p-2 text-[11px] font-bold ${triggerOut.accepted ? 'bg-emerald-950/60 text-emerald-200' : 'bg-rose-950/60 text-rose-200'}`}>
                {triggerOut.reasonFa}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-1.5">
            <h5 className="font-bold text-cyan-300">۱۶ گروه استاندارد الگوهای تعامل (INT-001 تا INT-016)</h5>
            <div className="max-h-72 overflow-y-auto space-y-1">
              {RT_INT_CATEGORIES_16.map((cat) => (
                <div key={cat.code} className="rounded border border-slate-800 bg-slate-950/70 p-1.5 text-[11px]">
                  <span className="inline-block rounded bg-slate-900 px-1.5 py-0.5 font-mono font-bold text-indigo-300 ml-1.5" dir="ltr">{cat.code} {cat.nameEn}</span>
                  <span className="text-slate-300">{cat.sampleFa}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'confirmation_selection' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 text-xs">
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-2.5">
            <h5 className="font-bold text-indigo-300 flex items-center gap-1.5"><ShieldCheck className="w-4 h-4" /> ماتریس تأیید C0-C4 و نتیجه جزئی عملیات گروهی (§۱۶.۹ & §۱۶.۱۰)</h5>
            <div className="flex flex-wrap gap-1.5">
              {RT_INT_CONFIRMATION_LEVELS_5.map((lvl) => (
                <button key={lvl.level} type="button" data-testid={`rt-fe-int-risk-${lvl.level}`} onClick={() => setRiskLevel(lvl.level)} className={`rounded px-2.5 py-1 text-[11px] font-bold ${riskLevel === lvl.level ? 'bg-teal-600 text-white' : 'bg-slate-800 text-slate-300'}`}>
                  {lvl.level}
                </button>
              ))}
              <button type="button" data-testid="rt-fe-int-bulk-partial" onClick={() => setFailedCount((c) => (c === 0 ? 2 : 0))} className="rounded bg-amber-900/60 px-2.5 py-1 text-[11px] font-bold text-amber-200">
                {failedCount > 0 ? 'شبیه‌سازی موفقیت ۱۰۰٪' : 'شبیه‌سازی خطا در ۲ از ۵ مورد'}
              </button>
            </div>
            <div data-testid="rt-fe-int-action-verdict" className="rounded bg-slate-950 p-2.5 text-[11px] space-y-1">
              <div className="text-slate-200">نیاز به تأیید: <strong className="text-cyan-300">{actionOut.requiresConfirmation ? (actionOut.requiresTwoStepConfirm ? 'بله (دومرحله‌ای C4)' : 'بله') : 'خیر (بدون خستگی کاربر)'}</strong></div>
              {actionOut.confirmPromptFa && <div className="text-amber-300">{actionOut.confirmPromptFa}</div>}
              <div className={actionOut.actionResult.status === 'success' ? 'text-emerald-300 font-bold' : 'text-rose-300 font-bold'}>{actionOut.actionResult.message}</div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-2.5">
            <h5 className="font-bold text-teal-300 flex items-center gap-1.5"><CheckSquare className="w-4 h-4" /> انتخاب تکی، گروهی، سلسله‌مراتبی و Selection Toolbar (§۱۶.۸)</h5>
            <div className="flex flex-wrap gap-1.5">
              {['PR-101', 'PR-102', 'PR-103', 'PR-104'].map((id) => (
                <label key={id} className="flex items-center gap-1 rounded border border-slate-800 bg-slate-950 px-2 py-1 text-[11px] text-slate-200 cursor-pointer">
                  <input type="checkbox" data-testid={`rt-fe-int-sel-${id}`} checked={selectedIds.includes(id)} onChange={() => toggleItem(id)} />
                  <span className="font-mono" dir="ltr">{id}</span>
                </label>
              ))}
            </div>
            <div data-testid="rt-fe-int-selection-bar" className="rounded bg-slate-950 p-2.5 text-[11px] space-y-1 text-slate-200">
              <div>تعداد انتخاب: <strong>{selectionOut.selectedCount}</strong> · وضعیت والد سلسله‌مراتبی: <code className="text-cyan-300" dir="ltr">{selectionOut.parentCheckState}</code></div>
              <div>وضعیت Selection Toolbar: <strong className={selectionOut.showSelectionToolbar ? 'text-emerald-300' : 'text-slate-400'}>{selectionOut.showSelectionToolbar ? `فعال (مقایسه املاک: ${selectionOut.canCompareProperties ? 'مجاز' : 'نیازمند حداقل ۲ ملک'})` : 'مخفی (بدون انتخاب معتبر)'}</strong></div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'recovery_motion' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 text-xs">
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-1.5">
            <h5 className="font-bold text-cyan-300">۸ الگوی بازیابی خطای تعامل بدون اتلاف داده (§۱۶.۲۶)</h5>
            {RT_INT_RECOVERY_STRATEGIES_8.map((rec) => (
              <div key={rec.failureType} className="rounded border border-slate-800 bg-slate-950/70 p-1.5 text-[10px]">
                <span className="inline-block rounded bg-slate-900 px-1.5 py-0.5 font-mono font-bold text-amber-300 ml-1.5" dir="ltr">{rec.failureType}</span>
                <span className="text-slate-300">{rec.behaviorFa}</span>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-2.5">
            <h5 className="font-bold text-indigo-300 flex items-center gap-1.5"><Keyboard className="w-4 h-4" /> Motion Tokens و دسترسی صفحه‌کلیدی + Reduced Motion (§۱۶.۲۲)</h5>
            <label className="flex items-center gap-2 text-[11px] text-slate-200 cursor-pointer">
              <input type="checkbox" data-testid="rt-fe-int-reduced-motion" checked={reducedMotion} onChange={(e) => setReducedMotion(e.target.checked)} />
              شبیه‌سازی فعال‌بودن prefers-reduced-motion
            </label>
            <div data-testid="rt-fe-int-motion-verdict" className="rounded bg-slate-950 p-2.5 text-[11px] text-emerald-300 font-bold">
              مدت انیمیشن پنل: <span dir="ltr">{motionOut.durationMs}ms</span> — {motionOut.noteFa}
            </div>
            <div className="rounded bg-slate-950/70 p-2 text-[10px] text-slate-300">
              قانون Drag & Drop (§۱۶.۱۷.۴): تمام جابه‌جایی‌های Widget و پنل دارای دکمه جایگزین صفحه‌کلیدی (انتقال به بالا/پایین و تغییر عرض با کلیدها) هستند.
            </div>
          </div>
        </div>
      )}

      {activeTab === 'phases_deliverables' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 text-xs">
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-1">
            <h5 className="font-bold text-cyan-300">نقشه اجرای ۱۰فازی (§۱۶.۳۴)</h5>
            {RT_INT_EXECUTION_PHASES_10.map((ph) => (
              <div key={ph.phase} className="rounded border border-slate-800 bg-slate-950/70 p-1.5 text-[10px]">
                <strong className="text-teal-300">فاز {ph.phase}: </strong><span className="text-slate-200">{ph.titleFa}</span> <span className="font-mono text-indigo-300" dir="ltr">({ph.outputId})</span>
              </div>
            ))}
            <div className="pt-1 text-[10px] text-emerald-300">مرز انتقال به مرحله ۱۷: <code className="font-mono" dir="ltr">{RT_FE_STAGE17_BRIDGE_SPEC_ID}</code></div>
          </div>

          <div className="lg:col-span-2 rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-1.5">
            <h5 className="font-bold text-emerald-300">۳۰ خروجی نهایی مرحله شانزدهم (RT-FE-INT-OUT-001 تا RT-FE-INT-OUT-030)</h5>
            <div className="max-h-72 overflow-y-auto grid grid-cols-1 gap-1 sm:grid-cols-2">
              {RT_INT_DELIVERABLES_30.map((del) => (
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
