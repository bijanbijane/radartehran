/** @file src/features/onboarding/components/Stage61ValuationScenariosLuAndStage62Panel.tsx — Stage 61 Tabs 3 & 4 + Stage 62 Preview */
import React, { useState } from 'react';
import { evaluateMixCompatibilityVacantAndValuationGuards } from '../services/urbanLandUseEngine';
import {
  STAGE61_ACCEPTANCE_TESTS_30,
  STAGE61_UX_EVENTS_14,
  STAGE62_MORPHOLOGY_PREVIEW_AXES_16,
  type ParcelLandUseProfile,
} from '../services/urbanLandUseTypes';

interface Props {
  section: 'history_and_valuation' | 'scenarios_uilu_and_stage62';
  profile: ParcelLandUseProfile;
  onFeedbackFa: (message: string) => void;
}

export const Stage61ValuationScenariosLuAndStage62Panel: React.FC<Props> = ({
  section,
  profile,
  onFeedbackFa,
}) => {
  const [attemptUnvalidatedValuation, setAttemptUnvalidatedValuation] = useState<boolean>(true);
  const [scenarioLabel, setScenarioLabel] = useState<'سناریوی تحلیلی' | 'تغییر تأییدشده'>('سناریوی تحلیلی');

  const guard = evaluateMixCompatibilityVacantAndValuationGuards(
    profile,
    true,
    attemptUnvalidatedValuation,
  );

  if (section === 'history_and_valuation') {
    return (
      <div className="space-y-4 text-xs" data-testid="stage61-history-valuation-panel">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
          <h4 className="font-bold text-cyan-300">تاریخچه تغییر کاربری و قواعد اتصال ایمن به موتور ارزش‌گذاری</h4>
          <label className="flex items-center gap-2 cursor-pointer text-slate-300">
            <input
              type="checkbox"
              checked={attemptUnvalidatedValuation}
              onChange={(e) => setAttemptUnvalidatedValuation(e.target.checked)}
            />
            <span>آزمون انتقال تغییر تأییدنشده یا تخمینی به ارزش‌گذاری</span>
          </label>
        </div>

        <div
          className={`rounded-xl border p-3 ${
            attemptUnvalidatedValuation
              ? 'border-rose-500/40 bg-rose-950/25 text-rose-200'
              : 'border-emerald-500/30 bg-emerald-950/20 text-emerald-200'
          }`}
          data-testid="stage61-valuation-guard"
        >
          {guard.changeHistoryAndValuationGuardFa}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 text-xs" data-testid="stage61-scenarios-stage62-panel">
      <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="font-bold text-cyan-300">سناریوسازی عملکردی، آزمون‌های پذیرش UI-LU و پیش‌نمایش ۶۲</h4>
          <select
            aria-label="نوع وضعیت سناریوی کاربری زمین"
            value={scenarioLabel}
            onChange={(e) => {
              const val = e.target.value as 'سناریوی تحلیلی' | 'تغییر تأییدشده';
              setScenarioLabel(val);
              onFeedbackFa(`وضعیت نمایش تغییر عملکرد روی «${val}» تنظیم شد.`);
            }}
            className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-100"
          >
            <option value="سناریوی تحلیلی">سناریوی تحلیلی (عدم تأیید حقوقی/فنی اجرای پروژه)</option>
            <option value="تغییر تأییدشده">تغییر تأییدشده با سند مرجع</option>
          </select>
        </div>

        <div className="rounded-lg border border-amber-500/30 bg-amber-950/20 p-3 text-amber-200" data-testid="stage61-scenario-disclaimer">
          برچسب سناریو: «{scenarioLabel}» — تغییر فرضی کاربری روی نقشه هرگز معادل تایید امکان حقوقی/فنی یا جایگزین ضوابط (۵۵)، مخاطرات (۵۸) و زیرساخت (۵۶) نیست.
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3 space-y-1.5">
          <div className="font-bold text-cyan-300">
            آزمون‌های پذیرش UI-LU ({STAGE61_ACCEPTANCE_TESTS_30.length}) • رویداد UX: {STAGE61_UX_EVENTS_14.length}
          </div>
          <div className="max-h-36 overflow-y-auto space-y-1 text-[11px] text-slate-300">
            {STAGE61_ACCEPTANCE_TESTS_30.map((item) => (
              <div key={item.id}>
                <span className="font-mono text-cyan-400">{item.id}:</span> {item.checkFa}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-violet-500/30 bg-violet-950/20 p-3 space-y-2" data-testid="stage62-preview-box">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-bold text-violet-300">پیش‌نمایش مرحله ۶۲: RT-UI-URBAN-MORPHOLOGY-SPATIAL-FORM-001</span>
            <span className="rounded bg-violet-500/20 px-2 py-0.5 text-[10px] text-violet-200">۱۶ محور مورفولوژی</span>
          </div>
          <p className="text-[11px] text-violet-100/90">
            اصل محوری مرحله ۶۲: دو محله با تراکم یا کاربری مشابه می‌توانند از نظر فرم کالبدی، اندازه قطعات، ارتفاع، نفوذپذیری و فضای باز کاملاً متفاوت باشند.
          </p>
          <ul className="space-y-1 text-[11px] text-slate-200 max-h-28 overflow-y-auto">
            {STAGE62_MORPHOLOGY_PREVIEW_AXES_16.map((axis) => (
              <li key={axis}>{axis}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};
