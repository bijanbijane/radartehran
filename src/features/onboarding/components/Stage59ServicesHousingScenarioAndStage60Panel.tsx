/** @file src/features/onboarding/components/Stage59ServicesHousingScenarioAndStage60Panel.tsx — Stage 59 Tabs 3 & 4 + Stage 60 Preview */
import React, { useState } from 'react';
import { evaluateHousingServicesAndScenarioGuards } from '../services/urbanDemographicsEngine';
import {
  STAGE59_ACCEPTANCE_TESTS_28,
  STAGE59_INTEGRATIONS_10,
  STAGE59_UX_EVENTS_12,
  STAGE60_URBAN_ECONOMY_PREVIEW_AXES_14,
  type DemographicForecastKind,
  type NeighborhoodDemographicsProfile,
} from '../services/urbanDemographicsTypes';

interface Props {
  section: 'services_and_housing' | 'scenarios_uidem_and_stage60';
  profile: NeighborhoodDemographicsProfile;
  onFeedbackFa: (message: string) => void;
}

const FORECAST_KINDS: ReadonlyArray<DemographicForecastKind> = [
  'داده مشاهده‌شده',
  'روند تاریخی',
  'برآورد مدل',
  'سناریوی فرضی',
  'برنامه یا هدف رسمی',
];

export const Stage59ServicesHousingScenarioAndStage60Panel: React.FC<Props> = ({
  section,
  profile,
  onFeedbackFa,
}) => {
  const [forecastKind, setForecastKind] = useState<DemographicForecastKind>('سناریوی فرضی');

  const guard = evaluateHousingServicesAndScenarioGuards(profile, forecastKind);

  if (section === 'services_and_housing') {
    return (
      <div className="space-y-4 text-xs" data-testid="stage59-services-housing-panel">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3 space-y-1.5" data-testid="stage59-housing-guard">
            <div className="font-bold text-indigo-300">تقاضای مسکن: تفکیک ۴گانه نیاز، تقاضای آماری، مؤثر و معاملات</div>
            <p className="text-slate-200">{guard.housingDemandFourTierGuardFa}</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3 space-y-1.5" data-testid="stage59-stage56-link">
            <div className="font-bold text-emerald-300">تناسب خدمات و فشار جمعیتی (بدون تکرار بانک مرحله ۵۶)</div>
            <p className="text-slate-200">{guard.stage56SingleSourceLinkFa}</p>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 text-[11px] text-slate-300">
          <strong>اتصالات ۱۰گانه ماژول جمعیت با رادار تهران: </strong>
          {STAGE59_INTEGRATIONS_10.join(' • ')}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 text-xs" data-testid="stage59-scenarios-stage60-panel">
      <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="font-bold text-indigo-300">مرزبندی پیش‌بینی جمعیت از واقعیت و آزمون‌های پذیرش UI-DEM</h4>
          <select
            aria-label="نوع برچسب خروجی آینده‌نگر جمعیت"
            value={forecastKind}
            onChange={(e) => {
              const kind = e.target.value as DemographicForecastKind;
              setForecastKind(kind);
              onFeedbackFa(`وضعیت خروجی جمعیتی روی برچسب «${kind}» تنظیم شد.`);
            }}
            className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-100"
          >
            {FORECAST_KINDS.map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
        </div>

        <div className="rounded-lg border border-amber-500/30 bg-amber-950/20 p-3 text-amber-200" data-testid="stage59-forecast-guard">
          {guard.forecastLifecycleBadgeFa}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3 space-y-1.5">
          <div className="font-bold text-indigo-300">
            آزمون‌های پذیرش UI-DEM ({STAGE59_ACCEPTANCE_TESTS_28.length}) • رویداد UX: {STAGE59_UX_EVENTS_12.length}
          </div>
          <div className="max-h-36 overflow-y-auto space-y-1 text-[11px] text-slate-300">
            {STAGE59_ACCEPTANCE_TESTS_28.map((item) => (
              <div key={item.id}>
                <span className="font-mono text-indigo-400">{item.id}:</span> {item.checkFa}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-3 space-y-2" data-testid="stage60-preview-box">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-bold text-amber-300">پیش‌نمایش مرحله ۶۰: RT-UI-URBAN-ECONOMY-001</span>
            <span className="rounded bg-amber-500/20 px-2 py-0.5 text-[10px] text-amber-200">۱۴ محور اقتصاد شهری</span>
          </div>
          <p className="text-[11px] text-amber-100/90">
            اصل محوری مرحله ۶۰: تعداد کسب‌وکارها به‌تنهایی نشان‌دهنده قدرت اقتصادی نیست؛ تحلیل اقتصادی باید متکی بر داده‌های تجمیعی و مستند باشد، نه پرونده‌سازی اقتصادی درباره اشخاص.
          </p>
          <ul className="space-y-1 text-[11px] text-slate-200 max-h-28 overflow-y-auto">
            {STAGE60_URBAN_ECONOMY_PREVIEW_AXES_14.map((axis) => (
              <li key={axis}>{axis}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};
