/** @file src/features/onboarding/components/Stage83ReturnsRiskPublicImpactStage84Panel.tsx — Stage 83 Tabs 3 & 4 Panel */
import React, { useState } from 'react';
import { evaluateReturnsPublicImpactAndPrivacy } from '../services/urbanInvestmentStage83Engine';
import {
  STAGE83_ACCEPTANCE_TESTS_68,
  STAGE83_REPORT_TYPES_22,
  STAGE84_MACROECONOMICS_PREVIEW_AXES_15,
  type Stage83CapitalProjectProfile,
} from '../services/urbanInvestmentStage83Types';

interface Props {
  section: 'returns_public_compare' | 'privacy_reports_stage84';
  profile: Stage83CapitalProjectProfile;
  onFeedbackFa: (message: string) => void;
}

export const Stage83ReturnsRiskPublicImpactStage84Panel: React.FC<Props> = ({
  section,
  profile,
  onFeedbackFa,
}) => {
  const [compareHeterogeneous, setCompareHeterogeneous] = useState<boolean>(false);
  const [redactInvestorData, setRedactInvestorData] = useState<boolean>(true);
  const [selectedReport, setSelectedReport] = useState<string>(STAGE83_REPORT_TYPES_22[0]);

  const result = evaluateReturnsPublicImpactAndPrivacy(
    profile,
    compareHeterogeneous,
    redactInvestorData,
  );

  if (section === 'returns_public_compare') {
    return (
      <div className="space-y-4 text-xs" data-testid="stage83-returns-public-panel">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
          <label className="flex items-center gap-2 cursor-pointer text-slate-300">
            <input
              type="checkbox"
              checked={compareHeterogeneous}
              onChange={(e) => setCompareHeterogeneous(e.target.checked)}
            />
            <span>شبیه‌سازی مقایسه مستقیم تجاری کوتاه‌مدت با زیرساختی بلندمدت</span>
          </label>
          <span className="text-[11px] text-slate-400">
            تورم مرجع: {profile.inflationRatePct}%
          </span>
        </div>

        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <div className="rounded-lg border border-rose-500/30 bg-rose-950/20 p-3 space-y-1 text-rose-100">
            <div className="font-bold text-rose-300">اقتصاد سرمایه‌گذاری در کنار اقتصاد عمومی پروژه</div>
            <p>{result.dualEconomyPrivateVsPublicGuardFa}</p>
          </div>
          <div className="rounded-lg border border-sky-500/30 bg-sky-950/20 p-3 space-y-1 text-sky-100">
            <div className="font-bold text-sky-300">بازده واقعی، منع عدد کاذب و کنترل مقایسه ناهمگن</div>
            <p>{result.missingDataAndHeterogeneousCompareGuardFa}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 text-xs" data-testid="stage83-privacy-reports-stage84-panel">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
        <label className="flex items-center gap-2 cursor-pointer text-slate-300">
          <input
            type="checkbox"
            checked={redactInvestorData}
            onChange={(e) => setRedactInvestorData(e.target.checked)}
          />
          <span>حذف اسناد مالی محرمانه، مذاکرات و هویت شرکا از خروجی عمومی و Telemetry</span>
        </label>

        <select
          aria-label="گزارش سرمایه‌گذاری شهری"
          value={selectedReport}
          onChange={(e) => {
            setSelectedReport(e.target.value);
            onFeedbackFa(`گزارش «${e.target.value}» با تاریخ، دوره، فرضیات و محدودیت‌ها آماده شد.`);
          }}
          className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100"
        >
          {STAGE83_REPORT_TYPES_22.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </div>

      <div className="rounded-lg border border-rose-500/30 bg-rose-950/20 p-3 text-rose-100">
        {result.investorConfidentialityAndTelemetryGuardFa}
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3 space-y-1 max-h-56 overflow-y-auto">
          <div className="font-bold text-rose-300">
            آزمونهای پذیرش مرحله ۸۳ ({STAGE83_ACCEPTANCE_TESTS_68.length} آزمون)
          </div>
          {STAGE83_ACCEPTANCE_TESTS_68.map((t) => (
            <div key={t.id} className="text-[11px] text-slate-300">
              <span className="font-mono text-rose-300">{t.id}:</span> {t.checkFa}
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-sky-500/30 bg-sky-950/20 p-3 space-y-1 max-h-56 overflow-y-auto">
          <div className="font-bold text-sky-300">
            پیش‌نمایش مرحله ۸۴: RT-UI-URBAN-MACROECONOMICS-ECONOMIC-CYCLES-REAL-ESTATE-IMPACT-001
          </div>
          {STAGE84_MACROECONOMICS_PREVIEW_AXES_15.map((axis) => (
            <div key={axis} className="text-[11px] text-slate-300">
              {axis}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
