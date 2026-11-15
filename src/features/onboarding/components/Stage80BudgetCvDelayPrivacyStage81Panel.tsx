/** @file src/features/onboarding/components/Stage80BudgetCvDelayPrivacyStage81Panel.tsx — Stage 80 Tabs 3 & 4 Panel */
import React, { useState } from 'react';
import { evaluateBudgetCvLccAndPrivacy } from '../services/constructionEconomicsStage80Engine';
import {
  STAGE80_ACCEPTANCE_TESTS_56,
  STAGE80_REPORT_TYPES_18,
  STAGE81_LAND_MARKET_PREVIEW_AXES_15,
  type Stage80ConstructionProfile,
} from '../services/constructionEconomicsStage80Types';

interface Props {
  section: 'budget_cv_lcc_progress' | 'privacy_reports_stage81';
  profile: Stage80ConstructionProfile;
  onFeedbackFa: (message: string) => void;
}

export const Stage80BudgetCvDelayPrivacyStage81Panel: React.FC<Props> = ({
  section,
  profile,
  onFeedbackFa,
}) => {
  const [approvedBudgetBillion, setApprovedBudgetBillion] = useState<number>(profile.approvedBudgetBillion);
  const [actualSpentBillion, setActualSpentBillion] = useState<number>(profile.actualSpentBillion);
  const [annualMaintBillion, setAnnualMaintBillion] = useState<number>(2);
  const [lccDiscountPct, setLccDiscountPct] = useState<number>(25);
  const [redactPrivatePii, setRedactPrivatePii] = useState<boolean>(true);
  const [selectedReport, setSelectedReport] = useState<string>(STAGE80_REPORT_TYPES_18[0]);

  const result = evaluateBudgetCvLccAndPrivacy(
    profile,
    approvedBudgetBillion,
    actualSpentBillion,
    annualMaintBillion,
    lccDiscountPct,
    redactPrivatePii,
  );

  if (section === 'budget_cv_lcc_progress') {
    return (
      <div className="space-y-4 text-xs" data-testid="stage80-budget-cv-lcc-panel">
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/70 p-3 text-slate-300">
          <label className="flex items-center gap-1.5">
            <span>بودجه مصوب B (م.م.ت):</span>
            <input
              type="number"
              min={1}
              value={approvedBudgetBillion}
              onChange={(e) => setApprovedBudgetBillion(Number(e.target.value) || 50)}
              className="w-16 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100"
            />
          </label>
          <label className="flex items-center gap-1.5">
            <span>هزینه واقعی A (م.م.ت):</span>
            <input
              type="number"
              min={0}
              value={actualSpentBillion}
              onChange={(e) => setActualSpentBillion(Number(e.target.value) || 0)}
              className="w-16 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100"
            />
          </label>
          <label className="flex items-center gap-1.5">
            <span>نگهداری سالانه Ct (م.م.ت):</span>
            <input
              type="number"
              min={0}
              value={annualMaintBillion}
              onChange={(e) => setAnnualMaintBillion(Number(e.target.value) || 0)}
              className="w-14 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100"
            />
          </label>
          <label className="flex items-center gap-1.5">
            <span>تنزیل LCC (%):</span>
            <input
              type="number"
              min={5}
              value={lccDiscountPct}
              onChange={(e) => setLccDiscountPct(Number(e.target.value) || 25)}
              className="w-14 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100"
            />
          </label>
        </div>

        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <div className="rounded-lg border border-orange-500/30 bg-orange-950/20 p-3 space-y-1 text-orange-100">
            <div className="font-bold text-orange-300">انحراف بودجه (CV/CV%)، Cd و پیشرفت فیزیکی ≠ مالی</div>
            <p>{result.budgetVarianceAndProgressGapFa}</p>
          </div>
          <div className="rounded-lg border border-sky-500/30 bg-sky-950/20 p-3 space-y-1 text-sky-100">
            <div className="font-bold text-sky-300">هزینه چرخه عمر (LCC) و مرز با مرحله ۷۹</div>
            <p>{result.lccAndBoundaryWithStage79Fa}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 text-xs" data-testid="stage80-privacy-reports-stage81-panel">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
        <label className="flex items-center gap-2 cursor-pointer text-slate-300">
          <input
            type="checkbox"
            checked={redactPrivatePii}
            onChange={(e) => setRedactPrivatePii(e.target.checked)}
          />
          <span>حذف دستمزد افراد، فاکتورهای محرمانه و PII پیمانکاران از Telemetry</span>
        </label>

        <select
          aria-label="گزارش اقتصاد ساخت"
          value={selectedReport}
          onChange={(e) => {
            setSelectedReport(e.target.value);
            onFeedbackFa(`گزارش «${e.target.value}» با تاریخ مرجع و فرضیات زیربنا آماده شد.`);
          }}
          className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100"
        >
          {STAGE80_REPORT_TYPES_18.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </div>

      <div className="rounded-lg border border-orange-500/30 bg-orange-950/20 p-3 text-orange-100">
        {result.contractorAndInvoicePrivacyGuardFa}
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3 space-y-1 max-h-56 overflow-y-auto">
          <div className="font-bold text-orange-300">
            آزمونهای پذیرش مرحله ۸۰ ({STAGE80_ACCEPTANCE_TESTS_56.length} آزمون)
          </div>
          {STAGE80_ACCEPTANCE_TESTS_56.map((t) => (
            <div key={t.id} className="text-[11px] text-slate-300">
              <span className="font-mono text-orange-300">{t.id}:</span> {t.checkFa}
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-sky-500/30 bg-sky-950/20 p-3 space-y-1 max-h-56 overflow-y-auto">
          <div className="font-bold text-sky-300">
            پیش‌نمایش مرحله ۸۱: RT-UI-URBAN-LAND-MARKET-LAND-ECONOMICS-OWNERSHIP-LAND-USE-001
          </div>
          {STAGE81_LAND_MARKET_PREVIEW_AXES_15.map((axis) => (
            <div key={axis} className="text-[11px] text-slate-300">
              {axis}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
