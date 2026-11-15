/** @file src/features/onboarding/components/Stage57PropertyMarketModerationAndStage58Panel.tsx — Stage 57 Property, Market Boundary, UI-ENV Checks & Stage 58 Preview */
import React, { useState } from 'react';
import {
  classifyEnvironmentScenarioBoundary,
  evaluateGreeneryHazardsModerationAndMarketGuard,
} from '../services/urbanEnvironmentEngine';
import {
  STAGE57_ACCEPTANCE_TESTS_25,
  STAGE57_INTEGRATIONS_8,
  STAGE57_UX_EVENTS_11,
  STAGE58_RISK_RESILIENCE_PREVIEW_AXES_12,
  type ScenarioLifecycleKind,
  type StreetEnvironmentProfile,
} from '../services/urbanEnvironmentTypes';

interface Props {
  section: 'property_justice_and_market' | 'reports_scenarios_and_stage58';
  profile: StreetEnvironmentProfile;
  onFeedbackFa: (message: string) => void;
}

const SCENARIO_KINDS: ReadonlyArray<ScenarioLifecycleKind> = [
  'سناریوی فرضی',
  'برآورد مدل',
  'برنامه مصوب',
  'اقدام اجراشده',
  'نتیجه مشاهده‌شده',
];

export const Stage57PropertyMarketModerationAndStage58Panel: React.FC<Props> = ({
  section,
  profile,
  onFeedbackFa,
}) => {
  const [scaleOption, setScaleOption] = useState<'۲۵۰ متری' | '۵۰۰ متری' | '۱۰۰۰ متری'>('۵۰۰ متری');
  const [scenarioKind, setScenarioKind] = useState<ScenarioLifecycleKind>('سناریوی فرضی');

  const guard = evaluateGreeneryHazardsModerationAndMarketGuard(profile, false, true);

  if (section === 'property_justice_and_market') {
    return (
      <div className="space-y-4" data-testid="stage57-property-market-panel">
        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-3 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="font-bold text-lime-300">پروفایل محیطی پیرامون ملک و مرزبندی علیت بازار املاک</h4>
            <select
              aria-label="انتخاب شعاع تحلیل محیطی ملک"
              value={scaleOption}
              onChange={(e) => {
                setScaleOption(e.target.value as '۲۵۰ متری' | '۵۰۰ متری' | '۱۰۰۰ متری');
                onFeedbackFa(`مقیاس تحلیل محیطی ملک روی شعاع ${e.target.value} تنظیم شد.`);
              }}
              className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-100"
            >
              <option value="۲۵۰ متری">شعاع ۲۵۰ متری</option>
              <option value="۵۰۰ متری">شعاع ۵۰۰ متری</option>
              <option value="۱۰۰۰ متری">شعاع ۱۰۰۰ متری</option>
            </select>
          </div>

          <div className="rounded-lg border border-rose-500/30 bg-rose-950/20 p-3 text-rose-200" data-testid="stage57-market-causal-guard">
            {guard.marketCausalBoundaryFa}
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 text-slate-200">
            <strong>اتصالات ۸گانه ماژول محیط‌زیست (مقیاس {scaleOption}): </strong>
            {STAGE57_INTEGRATIONS_8.join(' • ')}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="stage57-reports-stage58-panel">
      <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-3 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="font-bold text-lime-300">برچسب سناریوهای محیطی و معیارهای پذیرش UI-ENV</h4>
          <select
            aria-label="نوع وضعیت سناریوی محیطی"
            value={scenarioKind}
            onChange={(e) => setScenarioKind(e.target.value as ScenarioLifecycleKind)}
            className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-100"
          >
            {SCENARIO_KINDS.map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
        </div>

        <div className="rounded-lg border border-amber-500/30 bg-amber-950/20 p-3 text-amber-200" data-testid="stage57-scenario-label">
          {classifyEnvironmentScenarioBoundary(scenarioKind)}
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 space-y-1.5">
            <div className="font-bold text-lime-300">
              آزمون‌های پذیرش UI-ENV ({STAGE57_ACCEPTANCE_TESTS_25.length}) • رویداد UX: {STAGE57_UX_EVENTS_11.length}
            </div>
            <div className="max-h-36 overflow-y-auto space-y-1 text-[11px] text-slate-300">
              {STAGE57_ACCEPTANCE_TESTS_25.map((item) => (
                <div key={item.id}>
                  <span className="font-mono text-lime-400">{item.id}:</span> {item.checkFa}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-teal-500/30 bg-teal-950/20 p-3 space-y-2" data-testid="stage58-preview-box">
            <div className="flex items-center justify-between">
              <span className="font-bold text-teal-300">پیش‌نمایش مرحله ۵۸: RT-UI-URBAN-RISK-RESILIENCE-001</span>
              <span className="rounded bg-teal-500/20 px-2 py-0.5 text-[10px] text-teal-200">۱۲ محور مخاطرات و تاب‌آوری</span>
            </div>
            <p className="text-[11px] text-teal-100/90">
              وجود یک مخاطره به معنای ریسک یکسان برای همه ساختمان‌ها نیست؛ خطر، مواجهه، آسیب‌پذیری کالبدی و ظرفیت پاسخ‌گویی تفکیک می‌شوند.
            </p>
            <ul className="space-y-1 text-[11px] text-slate-200 max-h-28 overflow-y-auto">
              {STAGE58_RISK_RESILIENCE_PREVIEW_AXES_12.map((axis) => (
                <li key={axis}>{axis}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};
