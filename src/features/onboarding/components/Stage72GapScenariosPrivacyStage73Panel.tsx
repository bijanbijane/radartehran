/** @file src/features/onboarding/components/Stage72GapScenariosPrivacyStage73Panel.tsx — Stage 72 Tabs 3 & 4 Panel */
import React, { useState } from 'react';
import { evaluateGapScenariosAndPrivacy } from '../services/housingAffordabilityStage72Engine';
import {
  STAGE72_ACCEPTANCE_TESTS_40,
  STAGE72_REPORT_TYPES_7,
  STAGE72_UX_METRICS_9,
  STAGE73_POPULATION_MOBILITY_PREVIEW_AXES_11,
  type Stage72AffordabilityZoneProfile,
  type Stage72ScenarioPreset,
} from '../services/housingAffordabilityStage72Types';

interface Props {
  section: 'gap_nominal_real_compare' | 'scenarios_privacy_reports_stage73';
  profile: Stage72AffordabilityZoneProfile;
  onFeedbackFa: (message: string) => void;
}

export const Stage72GapScenariosPrivacyStage73Panel: React.FC<Props> = ({
  section,
  profile,
  onFeedbackFa,
}) => {
  const [preset, setPreset] = useState<Stage72ScenarioPreset>('پایه');
  const [priceChangePct, setPriceChangePct] = useState<number>(15);
  const [incomeChangePct, setIncomeChangePct] = useState<number>(12);
  const [sessionOnly, setSessionOnly] = useState<boolean>(true);
  const [selectedReport, setSelectedReport] = useState<string>(STAGE72_REPORT_TYPES_7[0]);

  const result = evaluateGapScenariosAndPrivacy(
    profile,
    preset,
    priceChangePct,
    incomeChangePct,
    sessionOnly,
  );

  if (section === 'gap_nominal_real_compare') {
    return (
      <div className="space-y-4 text-xs" data-testid="stage72-gap-compare-panel">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
          <span className="font-bold text-emerald-300">سناریوی مقایسه و شکاف اسمی در برابر رشد واقعی</span>
          <div className="flex flex-wrap gap-2">
            {(['پایه', 'خوش‌بینانه', 'بدبینانه'] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => {
                  setPreset(p);
                  if (p === 'خوش‌بینانه') {
                    setPriceChangePct(10);
                    setIncomeChangePct(25);
                  } else if (p === 'بدبینانه') {
                    setPriceChangePct(35);
                    setIncomeChangePct(10);
                  } else {
                    setPriceChangePct(15);
                    setIncomeChangePct(12);
                  }
                  onFeedbackFa(`سناریوی «${p}» بدون اعلام احتمال وقوع بی‌مدل اعمال شد.`);
                }}
                className={`rounded border px-2.5 py-1 cursor-pointer ${
                  preset === p
                    ? 'border-emerald-400 bg-emerald-500/20 text-emerald-200 font-bold'
                    : 'border-slate-700 bg-slate-950 text-slate-300'
                }`}
              >
                سناریوی {p}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/20 p-3 space-y-1 text-emerald-100">
            <div className="font-bold text-emerald-300">شکاف اسمی/واقعی و منع برچسب تحقیرآمیز محله</div>
            <p>{result.nominalVsRealGapAndOutOfRangeLabelFa}</p>
          </div>
          <div className="rounded-lg border border-sky-500/30 bg-sky-950/20 p-3 space-y-1 text-sky-100">
            <div className="font-bold text-sky-300">خروجی سناریوی اقتصادی (بدون احتمال قطعی)</div>
            <p>{result.scenarioProjectionAndProbabilityGuardFa}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 text-xs" data-testid="stage72-scenarios-privacy-stage73-panel">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
        <label className="flex items-center gap-2 cursor-pointer text-slate-300">
          <input
            type="checkbox"
            checked={sessionOnly}
            onChange={(e) => setSessionOnly(e.target.checked)}
          />
          <span>پردازش نشست‌محور درآمد، ۳ زیرشاخص مجزا و ممنوعیت پروفایل مالی</span>
        </label>

        <select
          aria-label="گزارش اقتصاد مسکن"
          value={selectedReport}
          onChange={(e) => {
            setSelectedReport(e.target.value);
            onFeedbackFa(`گزارش «${e.target.value}» با تاریخ، محدوده، دوره و مفروضات آماده شد.`);
          }}
          className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100"
        >
          {STAGE72_REPORT_TYPES_7.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </div>

      <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/20 p-3 text-emerald-100 space-y-1">
        <div>{result.subIndicesSplitAndPrivacyGuardFa}</div>
        <div className="text-[11px] text-slate-300">
          ۹ معیار UX: {STAGE72_UX_METRICS_9.join(' • ')}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3 space-y-1 max-h-56 overflow-y-auto">
          <div className="font-bold text-emerald-300">
            آزمونهای پذیرش RT-UI-HOUSING-AFFORDABILITY-ACCEPTANCE-001 ({STAGE72_ACCEPTANCE_TESTS_40.length} آزمون)
          </div>
          {STAGE72_ACCEPTANCE_TESTS_40.map((t) => (
            <div key={t.id} className="text-[11px] text-slate-300">
              <span className="font-mono text-emerald-300">{t.id}:</span> {t.checkFa}
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-indigo-500/30 bg-indigo-950/20 p-3 space-y-1 max-h-56 overflow-y-auto">
          <div className="font-bold text-indigo-300">
            پیش‌نمایش مرحله ۷۳: RT-UI-URBAN-POPULATION-MOBILITY-DEMOGRAPHIC-CHANGE-001
          </div>
          {STAGE73_POPULATION_MOBILITY_PREVIEW_AXES_11.map((axis) => (
            <div key={axis} className="text-[11px] text-slate-300">
              {axis}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
