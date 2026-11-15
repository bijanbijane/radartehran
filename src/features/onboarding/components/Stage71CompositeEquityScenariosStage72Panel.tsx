/** @file src/features/onboarding/components/Stage71CompositeEquityScenariosStage72Panel.tsx — Stage 71 Tabs 3 & 4 Panel */
import React, { useState } from 'react';
import { evaluateCompositeEquityScenariosAndPrivacy } from '../services/spatialEquityUrbanJusticeStage71Engine';
import {
  STAGE71_ACCEPTANCE_TESTS_40,
  STAGE71_REPORT_TYPES_15,
  STAGE71_UX_METRICS_10,
  STAGE72_AFFORDABILITY_PREVIEW_AXES_15,
  type Stage71EquityZoneProfile,
} from '../services/spatialEquityUrbanJusticeStage71Types';

interface Props {
  section: 'composite_risk_projects' | 'scenarios_privacy_reports_stage72';
  profile: Stage71EquityZoneProfile;
  onFeedbackFa: (message: string) => void;
}

export const Stage71CompositeEquityScenariosStage72Panel: React.FC<Props> = ({
  section,
  profile,
  onFeedbackFa,
}) => {
  const [weights, setWeights] = useState<{ service: number; infra: number; env: number }>({
    service: 0.45,
    infra: 0.3,
    env: 0.25,
  });
  const [publicExportSanitized, setPublicExportSanitized] = useState<boolean>(true);
  const [selectedReport, setSelectedReport] = useState<string>(STAGE71_REPORT_TYPES_15[0]);

  const guard = evaluateCompositeEquityScenariosAndPrivacy(
    profile,
    weights,
    publicExportSanitized,
  );

  if (section === 'composite_risk_projects') {
    return (
      <div className="space-y-4 text-xs" data-testid="stage71-composite-risk-panel">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
          <span className="font-bold text-violet-300">تنظیم و شفافیت وزن‌های شاخص ترکیبی (Ei = Σ wj·Sij)</span>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setWeights({ service: 0.45, infra: 0.3, env: 0.25 });
                onFeedbackFa('وزن پایه عدالت خدماتی (۰.۴۵ / ۰.۳۰ / ۰.۲۵) با Σ wj = 1 اعمال شد.');
              }}
              className="rounded border border-slate-700 bg-slate-950 px-2.5 py-1 text-slate-200 cursor-pointer"
            >
              وزن متعادل پایه
            </button>
            <button
              type="button"
              onClick={() => {
                setWeights({ service: 0.6, infra: 0.2, env: 0.2 });
                onFeedbackFa('وزن اولویت خدمات عمومی (۰.۶۰ / ۰.۲۰ / ۰.۲۰) برای تحلیل حساسیت تنظیم شد.');
              }}
              className="rounded border border-slate-700 bg-slate-950 px-2.5 py-1 text-slate-200 cursor-pointer"
            >
              تمرکز بر خدمات
            </button>
            <button
              type="button"
              onClick={() => {
                setWeights({ service: 0.35, infra: 0.25, env: 0.4 });
                onFeedbackFa('وزن اولویت تاب‌آوری محیطی (۰.۳۵ / ۰.۲۵ / ۰.۴۰) اعمال شد.');
              }}
              className="rounded border border-slate-700 bg-slate-950 px-2.5 py-1 text-slate-200 cursor-pointer"
            >
              تمرکز محیطی
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <div className="rounded-lg border border-violet-500/30 bg-violet-950/20 p-3 space-y-1.5 text-violet-100">
            <div className="font-bold text-violet-300">نتیجه شاخص ترکیبی و آزمون حساسیت وزن</div>
            <p>{guard.compositeWeightsSensitivityResultFa}</p>
          </div>
          <div className="rounded-lg border border-sky-500/30 bg-sky-950/20 p-3 space-y-1.5 text-sky-100">
            <div className="font-bold text-sky-300">تفکیک سه‌گانه ریسک و هزینه پروژه ≠ اثر عدالت</div>
            <p>{guard.riskThreeWayAndProjectSpendGuardFa}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 text-xs" data-testid="stage71-scenarios-privacy-stage72-panel">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
        <label className="flex items-center gap-2 cursor-pointer text-slate-300">
          <input
            type="checkbox"
            checked={publicExportSanitized}
            onChange={(e) => setPublicExportSanitized(e.target.checked)}
          />
          <span>پاکسازی خروجی عمومی، قواعد ضدتبعیض و Anti-Inference</span>
        </label>

        <select
          aria-label="گزارش عدالت فضایی"
          value={selectedReport}
          onChange={(e) => {
            setSelectedReport(e.target.value);
            onFeedbackFa(`گزارش «${e.target.value}» با شفافیت داده و حذف شناسه‌های حساس آماده شد.`);
          }}
          className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100"
        >
          {STAGE71_REPORT_TYPES_15.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </div>

      <div className="rounded-lg border border-violet-500/30 bg-violet-950/20 p-3 text-violet-100 space-y-1">
        <div>{guard.simulationAndAntiDiscriminationPrivacyGuardFa}</div>
        <div className="text-[11px] text-slate-300">
          ۱۰ معیار UX: {STAGE71_UX_METRICS_10.join(' • ')}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3 space-y-1 max-h-56 overflow-y-auto">
          <div className="font-bold text-violet-300">
            آزمونهای پذیرش RT-UI-SPATIAL-EQUITY-ACCEPTANCE-001 ({STAGE71_ACCEPTANCE_TESTS_40.length} آزمون)
          </div>
          {STAGE71_ACCEPTANCE_TESTS_40.map((t) => (
            <div key={t.id} className="text-[11px] text-slate-300">
              <span className="font-mono text-violet-300">{t.id}:</span> {t.checkFa}
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-3 space-y-1 max-h-56 overflow-y-auto">
          <div className="font-bold text-emerald-300">
            پیش‌نمایش مرحله ۷۲: RT-UI-HOUSING-AFFORDABILITY-HOUSEHOLD-ECONOMICS-001
          </div>
          {STAGE72_AFFORDABILITY_PREVIEW_AXES_15.map((axis) => (
            <div key={axis} className="text-[11px] text-slate-300">
              {axis}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
