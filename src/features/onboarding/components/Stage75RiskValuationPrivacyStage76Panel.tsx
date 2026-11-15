/** @file src/features/onboarding/components/Stage75RiskValuationPrivacyStage76Panel.tsx — Stage 75 Tabs 3 & 4 Panel */
import React, { useState } from 'react';
import { evaluateRiskValuationAndPrivacy } from '../services/buildingLifecycleStage75Engine';
import {
  STAGE75_ACCEPTANCE_TESTS_45,
  STAGE75_INTERVENTION_TYPES_8,
  STAGE75_REPORT_TYPES_10,
  STAGE76_RESIDENTIAL_LIVABILITY_PREVIEW_AXES_12,
  type Stage75BuildingLifecycleProfile,
} from '../services/buildingLifecycleStage75Types';

interface Props {
  section: 'risk_renovation_valuation' | 'privacy_reports_ui_stage76';
  profile: Stage75BuildingLifecycleProfile;
  onFeedbackFa: (message: string) => void;
}

export const Stage75RiskValuationPrivacyStage76Panel: React.FC<Props> = ({
  section,
  profile,
  onFeedbackFa,
}) => {
  const [integrateHedonic, setIntegrateHedonic] = useState<boolean>(true);
  const [redactPrivate, setRedactPrivate] = useState<boolean>(true);
  const [selectedReport, setSelectedReport] = useState<string>(STAGE75_REPORT_TYPES_10[0]);

  const result = evaluateRiskValuationAndPrivacy(
    profile,
    integrateHedonic,
    redactPrivate,
  );

  if (section === 'risk_renovation_valuation') {
    return (
      <div className="space-y-4 text-xs" data-testid="stage75-risk-valuation-panel">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
          <label className="flex items-center gap-2 cursor-pointer text-slate-300">
            <input
              type="checkbox"
              checked={integrateHedonic}
              onChange={(e) => setIntegrateHedonic(e.target.checked)}
            />
            <span>اتصال به موتور ارزش‌گذاری هدونیک رادار (بدون موتور ارزش‌گذاری موازی)</span>
          </label>
          <span className="text-[11px] text-slate-400">۸ نوع مداخله بازسازی/مقاوم‌سازی</span>
        </div>

        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <div className="rounded-lg border border-rose-500/30 bg-rose-950/20 p-3 space-y-1 text-rose-100">
            <div className="font-bold text-rose-300">تفکیک ۳ بُعد ریسک و رنگ قرمز ≠ ناایمن قطعی</div>
            <p>{result.threeRiskSplitAndPriorityNotUnsafeGuardFa}</p>
          </div>
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/20 p-3 space-y-1 text-emerald-100">
            <div className="font-bold text-emerald-300">اثر فرسودگی بر ارزش و کنترل متغیرهای موقعیت/متراژ</div>
            <p>{result.valuationHedonicIntegrationGuardFa}</p>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 text-[11px] text-slate-300">
          ۸ دسته مداخله: {STAGE75_INTERVENTION_TYPES_8.join(' • ')}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 text-xs" data-testid="stage75-privacy-reports-stage76-panel">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
        <label className="flex items-center gap-2 cursor-pointer text-slate-300">
          <input
            type="checkbox"
            checked={redactPrivate}
            onChange={(e) => setRedactPrivate(e.target.checked)}
          />
          <span>حذف PII ساکنان، اسناد مالکیت و محتوای محرمانه از خروجی و Telemetry</span>
        </label>

        <select
          aria-label="گزارش چرخه عمر ساختمان"
          value={selectedReport}
          onChange={(e) => {
            setSelectedReport(e.target.value);
            onFeedbackFa(`گزارش «${e.target.value}» با تاریخ، محدوده، روش محاسبه و پوشش داده آماده شد.`);
          }}
          className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100"
        >
          {STAGE75_REPORT_TYPES_10.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </div>

      <div className="rounded-lg border border-rose-500/30 bg-rose-950/20 p-3 text-rose-100 space-y-1">
        <div>{result.privacyTelemetryAndVerificationTagGuardFa}</div>
        <div className="text-[11px] text-slate-300">شواهد: {profile.evidenceSummaryFa}</div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3 space-y-1 max-h-56 overflow-y-auto">
          <div className="font-bold text-rose-300">
            آزمونهای پذیرش مرحله ۷۵ ({STAGE75_ACCEPTANCE_TESTS_45.length} آزمون)
          </div>
          {STAGE75_ACCEPTANCE_TESTS_45.map((t) => (
            <div key={t.id} className="text-[11px] text-slate-300">
              <span className="font-mono text-rose-300">{t.id}:</span> {t.checkFa}
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-teal-500/30 bg-teal-950/20 p-3 space-y-1 max-h-56 overflow-y-auto">
          <div className="font-bold text-teal-300">
            پیش‌نمایش مرحله ۷۶: RT-UI-RESIDENTIAL-LIVABILITY-INDOOR-COMFORT-001
          </div>
          {STAGE76_RESIDENTIAL_LIVABILITY_PREVIEW_AXES_12.map((axis) => (
            <div key={axis} className="text-[11px] text-slate-300">
              {axis}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
