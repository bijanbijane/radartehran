/** @file src/features/onboarding/components/Stage82InterventionFeasibilityDisplacementStage83Panel.tsx — Stage 82 Tabs 3 & 4 Panel */
import React, { useState } from 'react';
import { evaluateInterventionDisplacementAndPrivacy } from '../services/urbanRegenerationStage82Engine';
import {
  STAGE82_ACCEPTANCE_TESTS_65,
  STAGE82_REPORT_TYPES_18,
  STAGE83_URBAN_INVESTMENT_PREVIEW_AXES_15,
  type Stage82RegenerationZoneProfile,
} from '../services/urbanRegenerationStage82Types';

interface Props {
  section: 'matrix_feasibility_displacement' | 'did_privacy_reports_stage83';
  profile: Stage82RegenerationZoneProfile;
  onFeedbackFa: (message: string) => void;
}

export const Stage82InterventionFeasibilityDisplacementStage83Panel: React.FC<Props> = ({
  section,
  profile,
  onFeedbackFa,
}) => {
  const [monetizeNonMarket, setMonetizeNonMarket] = useState<boolean>(false);
  const [redactResidentPii, setRedactResidentPii] = useState<boolean>(true);
  const [selectedReport, setSelectedReport] = useState<string>(STAGE82_REPORT_TYPES_18[0]);

  const result = evaluateInterventionDisplacementAndPrivacy(
    profile,
    monetizeNonMarket,
    redactResidentPii,
  );

  if (section === 'matrix_feasibility_displacement') {
    return (
      <div className="space-y-4 text-xs" data-testid="stage82-matrix-displacement-panel">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
          <label className="flex items-center gap-2 cursor-pointer text-slate-300">
            <input
              type="checkbox"
              checked={monetizeNonMarket}
              onChange={(e) => setMonetizeNonMarket(e.target.checked)}
            />
            <span>آزمایش تبدیل اجباری منافع غیرمالی به عدد پولی (برای مشاهده هشدار طراحی)</span>
          </label>
          <span className="rounded bg-fuchsia-500/20 px-2 py-0.5 text-fuchsia-200 font-bold">
            {result.priorityMatrixQuadrant}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <div className="rounded-lg border border-fuchsia-500/30 bg-fuchsia-950/20 p-3 space-y-1 text-fuchsia-100">
            <div className="font-bold text-fuchsia-300">ماتریس اولویت ۲×۲ و تفکیک توجیه اجتماعی از مالی</div>
            <p>{result.financialVsSocialAndNonMonetaryGuardFa}</p>
          </div>
          <div className="rounded-lg border border-rose-500/30 bg-rose-950/20 p-3 space-y-1 text-rose-100">
            <div className="font-bold text-rose-300">پایش جابه‌جایی جمعیت و فشار سکونتی</div>
            <p>{result.displacementPressureWarningFa}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 text-xs" data-testid="stage82-did-privacy-stage83-panel">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
        <label className="flex items-center gap-2 cursor-pointer text-slate-300">
          <input
            type="checkbox"
            checked={redactResidentPii}
            onChange={(e) => setRedactResidentPii(e.target.checked)}
          />
          <span>حذف PII ساکنان/مالکان، تجمیع آسیب‌پذیری و کنترل سوگیری مشارکت آنلاین</span>
        </label>

        <select
          aria-label="گزارش بازآفرینی شهری"
          value={selectedReport}
          onChange={(e) => {
            setSelectedReport(e.target.value);
            onFeedbackFa(`گزارش «${e.target.value}» با تاریخ، روش، عدم قطعیت و آثار اجتماعی آماده شد.`);
          }}
          className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100"
        >
          {STAGE82_REPORT_TYPES_18.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </div>

      <div className="rounded-lg border border-fuchsia-500/30 bg-fuchsia-950/20 p-3 text-fuchsia-100">
        {result.didVsDescriptiveAndPrivacyGuardFa}
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3 space-y-1 max-h-56 overflow-y-auto">
          <div className="font-bold text-fuchsia-300">
            آزمونهای پذیرش مرحله ۸۲ ({STAGE82_ACCEPTANCE_TESTS_65.length} آزمون)
          </div>
          {STAGE82_ACCEPTANCE_TESTS_65.map((t) => (
            <div key={t.id} className="text-[11px] text-slate-300">
              <span className="font-mono text-fuchsia-300">{t.id}:</span> {t.checkFa}
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-sky-500/30 bg-sky-950/20 p-3 space-y-1 max-h-56 overflow-y-auto">
          <div className="font-bold text-sky-300">
            پیش‌نمایش مرحله ۸۳: RT-UI-URBAN-INVESTMENT-FINANCING-PPP-CAPITAL-ECONOMICS-001
          </div>
          {STAGE83_URBAN_INVESTMENT_PREVIEW_AXES_15.map((axis) => (
            <div key={axis} className="text-[11px] text-slate-300">
              {axis}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
