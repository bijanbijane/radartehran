/** @file src/features/onboarding/components/Stage67DemographicSocialSubpanel.tsx — Stage 67 Main Subpanel */
import React, { useState } from 'react';
import { Stage67PopulationDensityAgeHouseholdPanel } from './Stage67PopulationDensityAgeHouseholdPanel';
import { Stage67DayNightHousingJusticeScenarioPanel } from './Stage67DayNightHousingJusticeScenarioPanel';
import { INITIAL_STAGE67_PROFILES } from '../services/stage67DemographicIntelligenceFixtures';
import {
  STAGE67_ACCEPTANCE_TESTS_22,
  STAGE67_MAP_LAYERS_10,
  STAGE67_REPORT_TYPES_14,
  STAGE67_SECTIONS_18,
} from '../services/demographicIntelligenceStage67Types';

type Stage67TabId =
  | 'overview_and_spatial_density'
  | 'age_household_change_migration'
  | 'day_night_floating_services_justice'
  | 'compare_scenarios_privacy_stage68';

export const Stage67DemographicSocialSubpanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Stage67TabId>('overview_and_spatial_density');
  const [selectedZoneId, setSelectedZoneId] = useState<string>(INITIAL_STAGE67_PROFILES[0].zoneId);
  const [bannerFa, setBannerFa] = useState<string>(
    'مسیر: تحلیل شهری ← جمعیت و ساختار اجتماعی ← هوش جمعیتی شهر | تحلیل صرفاً تجمیع‌شده، منع ردیابی افراد و تفکیک جمعیت ساکن، روزانه و شناور.',
  );

  const selectedProfile =
    INITIAL_STAGE67_PROFILES.find((p) => p.zoneId === selectedZoneId) ?? INITIAL_STAGE67_PROFILES[0];

  const tabs: Array<{ id: Stage67TabId; labelFa: string; badgeFa: string }> = [
    {
      id: 'overview_and_spatial_density',
      labelFa: '۱. صفحه اصلی، ۷ مقیاس و ۳ نوع تراکم',
      badgeFa: '۱۸ بخش + ۱۰ لایه',
    },
    {
      id: 'age_household_change_migration',
      labelFa: '۲. هرم سنی، خانوار و مهاجرت تجمیعی',
      badgeFa: '۱۳۹۰ تا ۱۴۰۵',
    },
    {
      id: 'day_night_floating_services_justice',
      labelFa: '۳. جمعیت روز/شب، شناور، خدمات و نابرابری',
      badgeFa: '۷ بازه + ۹ خدمت',
    },
    {
      id: 'compare_scenarios_privacy_stage68',
      labelFa: '۴. مقایسه، سناریو≠پیش‌بینی و پیش‌نمایش ۶۸',
      badgeFa: 'UI-DEM67-001..022',
    },
  ];

  return (
    <section
      className="rounded-2xl border border-violet-500/30 bg-slate-950/90 p-5 text-slate-100 shadow-xl space-y-4"
      dir="rtl"
      data-testid="stage67-demographic-social-subpanel"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-violet-500/20 px-2.5 py-0.5 text-xs font-bold text-violet-300 border border-violet-500/40">
              RT-UI-URBAN-DEMOGRAPHIC-SOCIAL-INTELLIGENCE-001
            </span>
            <span className="text-xs text-slate-400">
              مرحله ۶۷: نظام تحلیل جمعیت، ساختار اجتماعی، توزیع فضایی جمعیت و پویایی‌های جمعیتی شهری
            </span>
          </div>
          <h3 className="mt-1 text-base font-bold text-white">
            سنجش تراکم ناخالص/خالص، هرم سنی، خانوار و مسکن، جمعیت روز/شب/شناور، مهاجرت تجمیع‌شده و حریم خصوصی
          </h3>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            بخش‌ها: {STAGE67_SECTIONS_18.length}
          </span>
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            لایه‌ها: {STAGE67_MAP_LAYERS_10.length}
          </span>
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            گزارش‌ها: {STAGE67_REPORT_TYPES_14.length}
          </span>
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            آزمون پذیرش: {STAGE67_ACCEPTANCE_TESTS_22.length}
          </span>
        </div>
      </header>

      <div
        className="rounded-xl border border-violet-500/30 bg-violet-950/20 px-3 py-2 text-xs text-violet-200"
        data-testid="stage67-status-banner"
      >
        {bannerFa}
      </div>

      <nav className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4" aria-label="تب‌های مرحله ۶۷">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              data-testid={`stage67-tab-${tab.id}`}
              className={`flex flex-col items-start justify-between rounded-xl border p-3 text-right transition cursor-pointer ${
                isActive
                  ? 'border-violet-500/60 bg-violet-950/30 text-white shadow-sm'
                  : 'border-slate-800 bg-slate-900/60 text-slate-300 hover:border-slate-700'
              }`}
            >
              <span className="text-xs font-bold leading-5">{tab.labelFa}</span>
              <span className="mt-1.5 rounded bg-slate-950/80 px-2 py-0.5 text-[10px] font-mono text-violet-300">
                {tab.badgeFa}
              </span>
            </button>
          );
        })}
      </nav>

      {(activeTab === 'overview_and_spatial_density' || activeTab === 'age_household_change_migration') && (
        <Stage67PopulationDensityAgeHouseholdPanel
          section={activeTab}
          profiles={INITIAL_STAGE67_PROFILES}
          selectedZoneId={selectedZoneId}
          onSelectZoneId={setSelectedZoneId}
          onFeedbackFa={setBannerFa}
        />
      )}

      {(activeTab === 'day_night_floating_services_justice' || activeTab === 'compare_scenarios_privacy_stage68') && (
        <Stage67DayNightHousingJusticeScenarioPanel
          section={activeTab}
          profiles={INITIAL_STAGE67_PROFILES}
          profile={selectedProfile}
          onFeedbackFa={setBannerFa}
        />
      )}
    </section>
  );
};
