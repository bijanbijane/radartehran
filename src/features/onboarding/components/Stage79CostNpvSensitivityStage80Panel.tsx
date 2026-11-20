/** @file src/features/onboarding/components/Stage79CostNpvSensitivityStage80Panel.tsx — Stage 79 Tabs 3 & 4 Panel */
import React, { useState } from 'react';
import { NumericDraftInput } from '../../../components/ui/NumericDraftInput';
import { evaluateNpvCostAndPrivacy } from '../services/investmentOpportunityStage79Engine';
import {
  STAGE79_ACCEPTANCE_TESTS_52,
  STAGE79_REPORT_TYPES_18,
  STAGE80_CONSTRUCTION_PREVIEW_AXES_14,
  type Stage79InvestmentProfile,
} from '../services/investmentOpportunityStage79Types';

interface Props {
  section: 'cost_npv_irr_sensitivity' | 'reports_privacy_stage80';
  profile: Stage79InvestmentProfile;
  onFeedbackFa: (message: string) => void;
}

export const Stage79CostNpvSensitivityStage80Panel: React.FC<Props> = ({
  section,
  profile,
  onFeedbackFa,
}) => {
  const [discountRatePct, setDiscountRatePct] = useState<number>(28);
  const [costMultiplierPct, setCostMultiplierPct] = useState<number>(100);
  const [preventDoubleCount, setPreventDoubleCount] = useState<boolean>(true);
  const [redactPrivatePii, setRedactPrivatePii] = useState<boolean>(true);
  const [selectedReport, setSelectedReport] = useState<string>(STAGE79_REPORT_TYPES_18[0]);

  const result = evaluateNpvCostAndPrivacy(
    profile,
    discountRatePct,
    costMultiplierPct,
    preventDoubleCount,
    redactPrivatePii,
  );

  if (section === 'cost_npv_irr_sensitivity') {
    return (
      <div className="space-y-4 text-xs" data-testid="stage79-npv-sensitivity-panel">
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/70 p-3 text-slate-300">
          <label className="flex items-center gap-1.5">
            <span>نرخ تنزیل (%):</span>
            <NumericDraftInput
              allowDecimal
              min={5}
              max={80}
              fallback={28}
              value={discountRatePct}
              onValueChange={setDiscountRatePct}
              className="w-16 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100"
            />
          </label>
          <label className="flex items-center gap-1.5">
            <span>تغییر هزینه ساخت (%):</span>
            <NumericDraftInput
              allowDecimal
              min={50}
              max={200}
              fallback={100}
              value={costMultiplierPct}
              onValueChange={setCostMultiplierPct}
              className="w-16 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100"
            />
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={preventDoubleCount}
              onChange={(e) => setPreventDoubleCount(e.target.checked)}
            />
            <span>جلوگیری از شمارش مضاعف تأمین مالی در NPV</span>
          </label>
        </div>

        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <div className="rounded-lg border border-violet-500/30 bg-violet-950/20 p-3 space-y-1 text-violet-100">
            <div className="font-bold text-violet-300">NPV و کنترل اعتبار/چندریشه‌ای IRR</div>
            <p>{result.npvIrrAndNoDoubleCountGuardFa}</p>
          </div>
          <div className="rounded-lg border border-sky-500/30 bg-sky-950/20 p-3 space-y-1 text-sky-100">
            <div className="font-bold text-sky-300">۳ سطح برآورد هزینه و عدم قطعیت ارزش آینده</div>
            <p>{result.costEstimateTierAndScenarioGuardFa}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 text-xs" data-testid="stage79-reports-privacy-stage80-panel">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
        <label className="flex items-center gap-2 cursor-pointer text-slate-300">
          <input
            type="checkbox"
            checked={redactPrivatePii}
            onChange={(e) => setRedactPrivatePii(e.target.checked)}
          />
          <span>حذف هویت مالکان، اسناد خصوصی و داده‌های حساس از خروجی و Telemetry</span>
        </label>

        <select
          aria-label="گزارش سرمایه‌گذاری ملکی"
          value={selectedReport}
          onChange={(e) => {
            setSelectedReport(e.target.value);
            onFeedbackFa(`گزارش «${e.target.value}» با فرضیات مالی، تاریخ، منبع و محدودیت‌ها آماده شد.`);
          }}
          className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100"
        >
          {STAGE79_REPORT_TYPES_18.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </div>

      <div className="rounded-lg border border-violet-500/30 bg-violet-950/20 p-3 text-violet-100">
        {result.antiSpeculationAndTelemetryPrivacyGuardFa}
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3 space-y-1 max-h-56 overflow-y-auto">
          <div className="font-bold text-violet-300">
            آزمونهای پذیرش مرحله ۷۹ ({STAGE79_ACCEPTANCE_TESTS_52.length} آزمون)
          </div>
          {STAGE79_ACCEPTANCE_TESTS_52.map((t) => (
            <div key={t.id} className="text-[11px] text-slate-300">
              <span className="font-mono text-violet-300">{t.id}:</span> {t.checkFa}
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-sky-500/30 bg-sky-950/20 p-3 space-y-1 max-h-56 overflow-y-auto">
          <div className="font-bold text-sky-300">
            پیش‌نمایش مرحله ۸۰: RT-UI-CONSTRUCTION-ECONOMICS-COST-MONITORING-BUILDING-DEVELOPMENT-001
          </div>
          {STAGE80_CONSTRUCTION_PREVIEW_AXES_14.map((axis) => (
            <div key={axis} className="text-[11px] text-slate-300">
              {axis}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
