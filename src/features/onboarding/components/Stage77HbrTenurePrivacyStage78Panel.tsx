/** @file src/features/onboarding/components/Stage77HbrTenurePrivacyStage78Panel.tsx — Stage 77 Tabs 3 & 4 Panel */
import React, { useState } from 'react';
import { NumericDraftInput } from '../../../components/ui/NumericDraftInput';
import { evaluateHbrResidualTenureAndPrivacy } from '../services/rentalMarketStage77Engine';
import {
  STAGE77_ACCEPTANCE_TESTS_45,
  STAGE77_REPORT_TYPES_15,
  STAGE78_SALES_LIQUIDITY_PREVIEW_AXES_12,
  type Stage77RentalZoneProfile,
} from '../services/rentalMarketStage77Types';

interface Props {
  section: 'hbr_residual_cost_compare' | 'tenure_privacy_reports_stage78';
  profile: Stage77RentalZoneProfile;
  onFeedbackFa: (message: string) => void;
}

export const Stage77HbrTenurePrivacyStage78Panel: React.FC<Props> = ({
  section,
  profile,
  onFeedbackFa,
}) => {
  const [incomeYh, setIncomeYh] = useState<number>(60);
  const [housingCostCh, setHousingCostCh] = useState<number>(28);
  const [includeAncillary, setIncludeAncillary] = useState<boolean>(false);
  const [redactPii, setRedactPii] = useState<boolean>(true);
  const [selectedReport, setSelectedReport] = useState<string>(STAGE77_REPORT_TYPES_15[0]);

  const result = evaluateHbrResidualTenureAndPrivacy(
    profile,
    incomeYh,
    housingCostCh,
    includeAncillary,
    redactPii,
  );

  if (section === 'hbr_residual_cost_compare') {
    return (
      <div className="space-y-4 text-xs" data-testid="stage77-hbr-residual-panel">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
          <div className="flex flex-wrap items-center gap-3 text-slate-300">
            <label className="flex items-center gap-1.5">
              <span>درآمد فرضی خانوار (م.ت):</span>
              <NumericDraftInput
                allowDecimal
                min={1}
                max={500}
                fallback={60}
                value={incomeYh}
                onValueChange={setIncomeYh}
                className="w-16 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100"
              />
            </label>
            <label className="flex items-center gap-1.5">
              <span>هزینه ماهانه مسکن Ch (م.ت):</span>
              <NumericDraftInput
                allowDecimal
                min={1}
                max={300}
                fallback={28}
                value={housingCostCh}
                onValueChange={setHousingCostCh}
                className="w-16 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100"
              />
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={includeAncillary}
                onChange={(e) => setIncludeAncillary(e.target.checked)}
              />
              <span>لحاظ هزینه‌های جانبی در Ch</span>
            </label>
          </div>
          <span className="text-[11px] text-slate-400">سناریوی آزمایشی غیرمتصل به داده‌های شخصی</span>
        </div>

        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <div className="rounded-lg border border-teal-500/30 bg-teal-950/20 p-3 space-y-1 text-teal-100">
            <div className="font-bold text-teal-300">نسبت فشار هزینه (HBR) و درآمد باقیمانده (Yr)</div>
            <p>{result.hbrAndResidualIncomeGuardFa}</p>
          </div>
          <div className="rounded-lg border border-sky-500/30 bg-sky-950/20 p-3 space-y-1 text-sky-100">
            <div className="font-bold text-sky-300">پیام تحلیلی غیرساده‌انگارانه و ارزان ≠ مقرون‌به‌صرفه</div>
            <p>{result.nuancedBudgetMessageAndCostVsCommuteFa}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 text-xs" data-testid="stage77-tenure-privacy-stage78-panel">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
        <label className="flex items-center gap-2 cursor-pointer text-slate-300">
          <input
            type="checkbox"
            checked={redactPii}
            onChange={(e) => setRedactPii(e.target.checked)}
          />
          <span>حذف PII مالک/مستأجر و درآمد شخصی از خروجی عمومی و Telemetry</span>
        </label>

        <select
          aria-label="گزارش بازار اجاره"
          value={selectedReport}
          onChange={(e) => {
            setSelectedReport(e.target.value);
            onFeedbackFa(`گزارش «${e.target.value}» با تاریخ، محدوده، تعداد نمونه و روش محاسبه آماده شد.`);
          }}
          className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100"
        >
          {STAGE77_REPORT_TYPES_15.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </div>

      <div className="rounded-lg border border-teal-500/30 bg-teal-950/20 p-3 text-teal-100">
        {result.tenureSecurityAndAntiPiiTelemetryGuardFa}
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3 space-y-1 max-h-56 overflow-y-auto">
          <div className="font-bold text-teal-300">
            آزمونهای پذیرش مرحله ۷۷ ({STAGE77_ACCEPTANCE_TESTS_45.length} آزمون)
          </div>
          {STAGE77_ACCEPTANCE_TESTS_45.map((t) => (
            <div key={t.id} className="text-[11px] text-slate-300">
              <span className="font-mono text-teal-300">{t.id}:</span> {t.checkFa}
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-sky-500/30 bg-sky-950/20 p-3 space-y-1 max-h-56 overflow-y-auto">
          <div className="font-bold text-sky-300">
            پیش‌نمایش مرحله ۷۸: RT-UI-RESIDENTIAL-SALES-MARKET-LIQUIDITY-TRANSACTION-DYNAMICS-001
          </div>
          {STAGE78_SALES_LIQUIDITY_PREVIEW_AXES_12.map((axis) => (
            <div key={axis} className="text-[11px] text-slate-300">
              {axis}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
