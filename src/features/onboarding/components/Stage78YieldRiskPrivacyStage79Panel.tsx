/** @file src/features/onboarding/components/Stage78YieldRiskPrivacyStage79Panel.tsx — Stage 78 Tabs 3 & 4 Panel */
import React, { useState } from 'react';
import { evaluateYieldCycleAndPrivacy } from '../services/salesLiquidityStage78Engine';
import {
  STAGE78_ACCEPTANCE_TESTS_48,
  STAGE78_REPORT_TYPES_18,
  STAGE79_INVESTMENT_OPPORTUNITY_PREVIEW_AXES_12,
  type Stage78SalesLiquidityProfile,
} from '../services/salesLiquidityStage78Types';

interface Props {
  section: 'yield_cycle_comparison' | 'privacy_reports_stage79';
  profile: Stage78SalesLiquidityProfile;
  onFeedbackFa: (message: string) => void;
}

export const Stage78YieldRiskPrivacyStage79Panel: React.FC<Props> = ({
  section,
  profile,
  onFeedbackFa,
}) => {
  const [purchaseBillion, setPurchaseBillion] = useState<number>(20);
  const [annualRentMillion, setAnnualRentMillion] = useState<number>(900);
  const [annualCostMillion, setAnnualCostMillion] = useState<number>(100);
  const [nominalReturnPct, setNominalReturnPct] = useState<number>(30);
  const [inflationPct, setInflationPct] = useState<number>(25);
  const [redactPrivateDealLocations, setRedactPrivateDealLocations] = useState<boolean>(true);
  const [selectedReport, setSelectedReport] = useState<string>(STAGE78_REPORT_TYPES_18[0]);

  const result = evaluateYieldCycleAndPrivacy(
    profile,
    purchaseBillion,
    annualRentMillion,
    annualCostMillion,
    nominalReturnPct,
    inflationPct,
    redactPrivateDealLocations,
  );

  if (section === 'yield_cycle_comparison') {
    return (
      <div className="space-y-4 text-xs" data-testid="stage78-yield-cycle-panel">
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/70 p-3 text-slate-300">
          <label className="flex items-center gap-1.5">
            <span>خرید (م.م.ت):</span>
            <input
              type="number"
              min={1}
              value={purchaseBillion}
              onChange={(e) => setPurchaseBillion(Number(e.target.value) || 20)}
              className="w-16 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100"
            />
          </label>
          <label className="flex items-center gap-1.5">
            <span>اجاره سالانه (م.ت):</span>
            <input
              type="number"
              min={0}
              value={annualRentMillion}
              onChange={(e) => setAnnualRentMillion(Number(e.target.value) || 0)}
              className="w-20 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100"
            />
          </label>
          <label className="flex items-center gap-1.5">
            <span>هزینه سالانه (م.ت):</span>
            <input
              type="number"
              min={0}
              value={annualCostMillion}
              onChange={(e) => setAnnualCostMillion(Number(e.target.value) || 0)}
              className="w-16 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100"
            />
          </label>
          <label className="flex items-center gap-1.5">
            <span>بازده اسمی (%):</span>
            <input
              type="number"
              value={nominalReturnPct}
              onChange={(e) => setNominalReturnPct(Number(e.target.value) || 0)}
              className="w-14 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100"
            />
          </label>
          <label className="flex items-center gap-1.5">
            <span>تورم (%):</span>
            <input
              type="number"
              value={inflationPct}
              onChange={(e) => setInflationPct(Number(e.target.value) || 0)}
              className="w-14 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100"
            />
          </label>
        </div>

        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <div className="rounded-lg border border-amber-500/30 bg-amber-950/20 p-3 space-y-1 text-amber-100">
            <div className="font-bold text-amber-300">بازده ناخالص (Yg)، خالص (Yn) و بازده واقعی (R_real)</div>
            <p>{result.yieldRoiAndInflationRealReturnFa}</p>
          </div>
          <div className="rounded-lg border border-sky-500/30 bg-sky-950/20 p-3 space-y-1 text-sky-100">
            <div className="font-bold text-sky-300">مصرفی/سرمایه‌ای، رفتار فروشنده و چرخه دوبعدی</div>
            <p>{result.motiveBehavioralAndCycleGuardFa}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 text-xs" data-testid="stage78-privacy-reports-stage79-panel">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
        <label className="flex items-center gap-2 cursor-pointer text-slate-300">
          <input
            type="checkbox"
            checked={redactPrivateDealLocations}
            onChange={(e) => setRedactPrivateDealLocations(e.target.checked)}
          />
          <span>حذف موقعیت دقیق معاملات خصوصی، هویت طرفین و دارایی شخصی از نقشه و Telemetry</span>
        </label>

        <select
          aria-label="گزارش معاملات و نقدشوندگی"
          value={selectedReport}
          onChange={(e) => {
            setSelectedReport(e.target.value);
            onFeedbackFa(`گزارش «${e.target.value}» با تاریخ، دوره، محدوده، نمونه و سطح اعتبار آماده شد.`);
          }}
          className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100"
        >
          {STAGE78_REPORT_TYPES_18.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </div>

      <div className="rounded-lg border border-amber-500/30 bg-amber-950/20 p-3 text-amber-100">
        {result.spatialAndTelemetryPrivacyGuardFa}
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3 space-y-1 max-h-56 overflow-y-auto">
          <div className="font-bold text-amber-300">
            آزمونهای پذیرش مرحله ۷۸ ({STAGE78_ACCEPTANCE_TESTS_48.length} آزمون)
          </div>
          {STAGE78_ACCEPTANCE_TESTS_48.map((t) => (
            <div key={t.id} className="text-[11px] text-slate-300">
              <span className="font-mono text-amber-300">{t.id}:</span> {t.checkFa}
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-sky-500/30 bg-sky-950/20 p-3 space-y-1 max-h-56 overflow-y-auto">
          <div className="font-bold text-sky-300">
            پیش‌نمایش مرحله ۷۹: RT-UI-REAL-ESTATE-INVESTMENT-OPPORTUNITY-SPATIAL-DEVELOPMENT-001
          </div>
          {STAGE79_INVESTMENT_OPPORTUNITY_PREVIEW_AXES_12.map((axis) => (
            <div key={axis} className="text-[11px] text-slate-300">
              {axis}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
