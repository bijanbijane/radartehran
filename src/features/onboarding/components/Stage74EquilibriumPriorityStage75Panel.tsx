/** @file src/features/onboarding/components/Stage74EquilibriumPriorityStage75Panel.tsx — Stage 74 Tabs 3 & 4 Panel */
import React, { useState } from 'react';
import { evaluateGapEquilibriumAndPriority } from '../services/housingDemandSupplyStage74Engine';
import {
  STAGE74_ACCEPTANCE_TESTS_45,
  STAGE74_GAP_DIMENSIONS_5,
  STAGE74_REPORT_TYPES_10,
  STAGE74_UX_METRICS_10,
  STAGE75_BUILDING_LIFECYCLE_PREVIEW_AXES_12,
  type Stage74MarketEquilibriumProfile,
} from '../services/housingDemandSupplyStage74Types';

interface Props {
  section: 'gap_matrix_equilibrium' | 'priority_reports_ui_stage75';
  profile: Stage74MarketEquilibriumProfile;
  onFeedbackFa: (message: string) => void;
}

export const Stage74EquilibriumPriorityStage75Panel: React.FC<Props> = ({
  section,
  profile,
  onFeedbackFa,
}) => {
  const [keepFiveSeparate, setKeepFiveSeparate] = useState<boolean>(true);
  const [scenarioDeltaPct, setScenarioDeltaPct] = useState<number>(10);
  const [selectedReport, setSelectedReport] = useState<string>(STAGE74_REPORT_TYPES_10[0]);

  const result = evaluateGapEquilibriumAndPriority(
    profile,
    keepFiveSeparate,
    scenarioDeltaPct,
  );

  if (section === 'gap_matrix_equilibrium') {
    return (
      <div className="space-y-4 text-xs" data-testid="stage74-gap-equilibrium-panel">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
          <label className="flex items-center gap-2 cursor-pointer text-slate-300">
            <input
              type="checkbox"
              checked={keepFiveSeparate}
              onChange={(e) => setKeepFiveSeparate(e.target.checked)}
            />
            <span>نمایش مجزای ۵ بُعد شکاف (منع ادغام بدون وزن‌دهی)</span>
          </label>

          <div className="flex flex-wrap gap-2">
            {[-10, 0, 10, 25].map((delta) => (
              <button
                key={delta}
                type="button"
                onClick={() => {
                  setScenarioDeltaPct(delta);
                  onFeedbackFa(
                    `سناریوی تغییر عرضه (${delta >= 0 ? '+' : ''}${delta}%) با برچسب برآورد مدل شبیه‌سازی شد.`,
                  );
                }}
                className={`rounded border px-2.5 py-1 cursor-pointer ${
                  scenarioDeltaPct === delta
                    ? 'border-amber-400 bg-amber-500/20 text-amber-200 font-bold'
                    : 'border-slate-700 bg-slate-950 text-slate-300'
                }`}
              >
                عرضه {delta >= 0 ? `+${delta}` : delta}%
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <div className="rounded-lg border border-amber-500/30 bg-amber-950/20 p-3 space-y-1 text-amber-100">
            <div className="font-bold text-amber-300">شکاف تعداد (GQ = DQ − SQ) و ماتریس ۵بُعدی</div>
            <p>{result.unitGapFiveDimensionsGuardFa}</p>
            <div className="text-[11px] text-slate-300">{STAGE74_GAP_DIMENSIONS_5.join(' • ')}</div>
          </div>
          <div className="rounded-lg border border-sky-500/30 bg-sky-950/20 p-3 space-y-1 text-sky-100">
            <div className="font-bold text-sky-300">تعادل تعدادی در برابر تعادل ساختاری/کیفی</div>
            <p>{result.structuralEquilibriumVsCountBalanceGuardFa}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 text-xs" data-testid="stage74-priority-reports-stage75-panel">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
        <span className="font-bold text-amber-300">گزارش‌های ۱۰گانه تعادل بازار، اولویت توسعه و محرمانگی</span>
        <select
          aria-label="گزارش عرضه و تقاضای مسکن"
          value={selectedReport}
          onChange={(e) => {
            setSelectedReport(e.target.value);
            onFeedbackFa(`گزارش «${e.target.value}» با محدوده، دوره و سطح عدم‌قطعیت آماده شد.`);
          }}
          className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100"
        >
          {STAGE74_REPORT_TYPES_10.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </div>

      <div className="rounded-lg border border-amber-500/30 bg-amber-950/20 p-3 text-amber-100 space-y-1">
        <div>{result.priorityNoAutoPermitAndPrivacyGuardFa}</div>
        <div className="text-[11px] text-slate-300">
          ۱۰ معیار UX: {STAGE74_UX_METRICS_10.join(' • ')}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3 space-y-1 max-h-56 overflow-y-auto">
          <div className="font-bold text-amber-300">
            آزمونهای پذیرش RT-UI-HOUSING-DEMAND-SUPPLY-ACCEPTANCE-001 ({STAGE74_ACCEPTANCE_TESTS_45.length} آزمون)
          </div>
          {STAGE74_ACCEPTANCE_TESTS_45.map((t) => (
            <div key={t.id} className="text-[11px] text-slate-300">
              <span className="font-mono text-amber-300">{t.id}:</span> {t.checkFa}
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-rose-500/30 bg-rose-950/20 p-3 space-y-1 max-h-56 overflow-y-auto">
          <div className="font-bold text-rose-300">
            پیش‌نمایش مرحله ۷۵: RT-UI-BUILDING-LIFECYCLE-DETERIORATION-STRUCTURAL-QUALITY-001
          </div>
          {STAGE75_BUILDING_LIFECYCLE_PREVIEW_AXES_12.map((axis) => (
            <div key={axis} className="text-[11px] text-slate-300">
              {axis}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
