/** @file src/features/onboarding/components/Stage84LagScenariosAtlasMethodStage85Panel.tsx — Stage 84 Tabs 3 & 4 Panel */
import React, { useState } from 'react';
import { evaluateLagScenariosAndGovernance } from '../services/urbanMacroeconomicsStage84Engine';
import {
  STAGE84_ACCEPTANCE_TESTS_72,
  STAGE84_REPORT_TEMPLATES_8,
  STAGE85_PUBLIC_POLICY_PREVIEW_AXES_15,
  type Stage84MacroRegionProfile,
} from '../services/urbanMacroeconomicsStage84Types';

interface Props {
  section: 'lag_scenarios_forecast' | 'methodology_reports_stage85';
  profile: Stage84MacroRegionProfile;
  onFeedbackFa: (message: string) => void;
}

export const Stage84LagScenariosAtlasMethodStage85Panel: React.FC<Props> = ({
  section,
  profile,
  onFeedbackFa,
}) => {
  const [lagMonths, setLagMonths] = useState<number>(3);
  const [redactPrivateTelemetry, setRedactPrivateTelemetry] = useState<boolean>(true);
  const [selectedReport, setSelectedReport] = useState<string>(STAGE84_REPORT_TEMPLATES_8[0]);

  const result = evaluateLagScenariosAndGovernance(
    profile,
    lagMonths,
    redactPrivateTelemetry,
  );

  if (section === 'lag_scenarios_forecast') {
    return (
      <div className="space-y-4 text-xs" data-testid="stage84-lag-scenarios-panel">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
          <label className="flex items-center gap-2 text-slate-300">
            <span>تأخیر زمانی تحلیل Lag (ماه):</span>
            <input
              type="number"
              min={0}
              max={24}
              value={lagMonths}
              onChange={(e) => setLagMonths(Math.min(24, Math.max(0, Number(e.target.value) || 0)))}
              className="w-16 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100"
            />
          </label>
          <span className="text-[11px] text-slate-400">
            مشاهدات موجود: {profile.observationMonthsCount} ماه
          </span>
        </div>

        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <div className="rounded-lg border border-cyan-500/30 bg-cyan-950/20 p-3 space-y-1 text-cyan-100">
            <div className="font-bold text-cyan-300">تحلیل تأخیر زمانی (Lag) و تفکیک همبستگی ≠ علیت</div>
            <p>{result.lagCorrelationAndCausationGuardFa}</p>
          </div>
          <div className="rounded-lg border border-sky-500/30 bg-sky-950/20 p-3 space-y-1 text-sky-100">
            <div className="font-bold text-sky-300">سناریوهای کاربر ≠ پیش‌بینی با بازه عدم‌قطعیت</div>
            <p>{result.scenarioAndForecastUncertaintyGuardFa}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 text-xs" data-testid="stage84-methodology-reports-stage85-panel">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
        <label className="flex items-center gap-2 cursor-pointer text-slate-300">
          <input
            type="checkbox"
            checked={redactPrivateTelemetry}
            onChange={(e) => setRedactPrivateTelemetry(e.target.checked)}
          />
          <span>حذف سناریوهای خصوصی، مقادیر حساس خانوار و هویت از Telemetry عمومی</span>
        </label>

        <select
          aria-label="قالب گزارش اقتصاد کلان"
          value={selectedReport}
          onChange={(e) => {
            setSelectedReport(e.target.value);
            onFeedbackFa(`گزارش «${e.target.value}» با تاریخ آخرین داده، منابع، روش و محدودیت‌ها آماده شد.`);
          }}
          className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100"
        >
          {STAGE84_REPORT_TEMPLATES_8.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </div>

      <div className="rounded-lg border border-cyan-500/30 bg-cyan-950/20 p-3 text-cyan-100">
        {result.conflictingSourcesAndTelemetryPrivacyGuardFa}
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3 space-y-1 max-h-56 overflow-y-auto">
          <div className="font-bold text-cyan-300">
            آزمونهای پذیرش مرحله ۸۴ ({STAGE84_ACCEPTANCE_TESTS_72.length} آزمون MAC)
          </div>
          {STAGE84_ACCEPTANCE_TESTS_72.map((t) => (
            <div key={t.id} className="text-[11px] text-slate-300">
              <span className="font-mono text-cyan-300">{t.id}:</span> {t.checkFa}
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-sky-500/30 bg-sky-950/20 p-3 space-y-1 max-h-56 overflow-y-auto">
          <div className="font-bold text-sky-300">
            پیش‌نمایش مرحله ۸۵: RT-UI-PUBLIC-POLICY-URBAN-GOVERNANCE-GOVERNMENT-INTERVENTIONS-REAL-ESTATE-IMPACT-001
          </div>
          {STAGE85_PUBLIC_POLICY_PREVIEW_AXES_15.map((axis) => (
            <div key={axis} className="text-[11px] text-slate-300">
              {axis}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
