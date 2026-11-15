/** @file src/features/onboarding/components/Stage71ServicesAccessDeprivationPanel.tsx — Stage 71 Tabs 1 & 2 Panel */
import React, { useState } from 'react';
import { evaluateServicesAccessAndDeprivation } from '../services/spatialEquityUrbanJusticeStage71Engine';
import {
  STAGE71_ACCESS_CRITERIA_7,
  STAGE71_DEPRIVATION_LEVELS_5,
  STAGE71_DOMAINS_20,
  STAGE71_FILTER_FIELDS_18,
  STAGE71_KPI_CARDS_8,
  STAGE71_SERVICE_CLASSES_10,
  STAGE71_TOOLS_6,
  type Stage71EquityZoneProfile,
} from '../services/spatialEquityUrbanJusticeStage71Types';

interface Props {
  section: 'overview_services_access' | 'deprivation_education_health_green';
  profiles: ReadonlyArray<Stage71EquityZoneProfile>;
  selectedZoneId: string;
  onSelectZoneId: (id: string) => void;
  onFeedbackFa: (message: string) => void;
}

export const Stage71ServicesAccessDeprivationPanel: React.FC<Props> = ({
  section,
  profiles,
  selectedZoneId,
  onSelectZoneId,
  onFeedbackFa,
}) => {
  const [excludePrivateGreen, setExcludePrivateGreen] = useState<boolean>(true);
  const [separateUserInfraReports, setSeparateUserInfraReports] = useState<boolean>(true);

  const profile = profiles.find((p) => p.zoneId === selectedZoneId) ?? profiles[0];
  if (!profile) return null;

  const guard = evaluateServicesAccessAndDeprivation(
    profile,
    excludePrivateGreen,
    separateUserInfraReports,
  );

  if (section === 'overview_services_access') {
    return (
      <div className="space-y-4 text-xs" data-testid="stage71-overview-services-panel">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
          <div className="flex flex-wrap gap-2">
            {profiles.map((p) => (
              <button
                key={p.zoneId}
                type="button"
                onClick={() => {
                  onSelectZoneId(p.zoneId);
                  onFeedbackFa(
                    `محدوده «${p.zoneNameFa}» (${p.districtFa}) با ${p.missingIndicatorsCount} شاخص مفقود (عدم جایگزینی با صفر) انتخاب شد.`,
                  );
                }}
                className={`rounded-lg border px-3 py-1.5 cursor-pointer ${
                  p.zoneId === profile.zoneId
                    ? 'border-violet-400 bg-violet-500/20 text-violet-200 font-bold'
                    : 'border-slate-700 bg-slate-950 text-slate-300'
                }`}
              >
                {p.zoneNameFa}
              </button>
            ))}
          </div>
          <span className="text-[11px] text-slate-400">
            {profile.referenceYearFa} • اطمینان: {profile.confidenceLevelFa}
          </span>
        </div>

        <div className="rounded-lg border border-violet-500/30 bg-violet-950/20 p-3 space-y-1.5 text-violet-100">
          <div className="font-bold text-violet-300">دسترسی شبکه‌ای، ظرفیت خدمات و قانون «داده ناموجود ≠ صفر»</div>
          <p>{guard.networkAccessAndMissingNotZeroGuardFa}</p>
          <p className="text-[11px] text-slate-400">منبع: {profile.dataSourceFa}</p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 space-y-1.5">
          <div className="font-bold text-violet-300">
            ۲۰ حوزه عدالت فضایی، ۸ کارت KPI، ۱۰ گروه خدمت، ۷ معیار دسترسی و ۱۸ فیلتر
          </div>
          <div className="text-[11px] text-slate-300">
            ۱۰ گروه خدمات عمومی: {STAGE71_SERVICE_CLASSES_10.join(' • ')}
          </div>
          <div className="text-[11px] text-slate-300">
            ۷ معیار دسترسی: {STAGE71_ACCESS_CRITERIA_7.join(' • ')}
          </div>
          <div className="text-[11px] text-slate-400">
            ۸ کارت KPI: {STAGE71_KPI_CARDS_8.map((k) => `${k.titleFa} (${k.unitFa})`).join(' • ')}
          </div>
          <div className="text-[11px] text-slate-400">
            ۶ ابزار: {STAGE71_TOOLS_6.join(' • ')} | ۱۸ فیلتر: {STAGE71_FILTER_FIELDS_18.join(' • ')}
          </div>
          <div className="text-[11px] text-slate-400">
            ۲۰ حوزه: {STAGE71_DOMAINS_20.map((d) => `${d.id}.${d.titleFa}`).join(' • ')}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 text-xs" data-testid="stage71-deprivation-services-panel">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
        <div className="flex flex-wrap items-center gap-3 text-slate-300">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={excludePrivateGreen}
              onChange={(e) => {
                setExcludePrivateGreen(e.target.checked);
                onFeedbackFa(
                  e.target.checked
                    ? 'فضای سبز فقط بر اساس بوستان/پارک قابل استفاده عمومی محاسبه شد (باغ خصوصی مستثنا شد).'
                    : 'هشدار دقت: لحاظ‌کردن فضای سبز خصوصی در عدالت سبز غیرمجاز است.',
                );
              }}
            />
            <span>حذف باغات خصوصی از سرانه دسترسی فضای سبز</span>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={separateUserInfraReports}
              onChange={(e) => setSeparateUserInfraReports(e.target.checked)}
            />
            <span>تفکیک گزارش کاربران از ممیزی رسمی زیرساخت</span>
          </label>
        </div>

        <span className="text-[11px] text-slate-400">
          ۵ سطح محرومیت: {STAGE71_DEPRIVATION_LEVELS_5.join(' / ')}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/20 p-3 space-y-1.5 text-emerald-100">
          <div className="font-bold text-emerald-300">جمعیت دانش‌آموز هدف، فضای سبز عمومی و تفکیک زیرساخت</div>
          <p>{guard.targetAgeGreenAndInfraSeparationGuardFa}</p>
        </div>
        <div className="rounded-lg border border-amber-500/30 bg-amber-950/20 p-3 space-y-1.5 text-amber-100">
          <div className="font-bold text-amber-300">محرومیت چندبُعدی و مانع هزینه دسترسی</div>
          <p>{guard.multiFactorDeprivationAndCostBarrierGuardFa}</p>
        </div>
      </div>
    </div>
  );
};
