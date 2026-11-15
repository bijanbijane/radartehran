/** @file src/features/onboarding/components/Stage59UrbanDemographicsSubpanel.tsx — Stage 59 Main Subpanel */
import React, { useState } from 'react';
import { Stage59DensityHouseholdAndPrivacyPanel } from './Stage59DensityHouseholdAndPrivacyPanel';
import { Stage59ServicesHousingScenarioAndStage60Panel } from './Stage59ServicesHousingScenarioAndStage60Panel';
import { INITIAL_STAGE59_PROFILES } from '../services/stage59UrbanDemographicsFixtures';
import {
  STAGE59_ACCEPTANCE_TESTS_28,
  STAGE59_MAP_LAYERS_10,
  STAGE59_SECTIONS_15,
  STAGE59_UX_EVENTS_12,
} from '../services/urbanDemographicsTypes';

type Stage59TabId =
  | 'overview_density_household'
  | 'migration_daynight_privacy'
  | 'services_and_housing'
  | 'scenarios_uidem_and_stage60';

export const Stage59UrbanDemographicsSubpanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Stage59TabId>('overview_density_household');
  const [selectedZoneId, setSelectedZoneId] = useState<string>(INITIAL_STAGE59_PROFILES[0].zoneId);
  const [bannerFa, setBannerFa] = useState<string>(
    'مرکز تحلیل جمعیت و پویایی سکونت شهری: آمار تجمیعی ساختار سنی، خانوار و مسکن با آستانه محرمانگی و منع ردیابی یا برچسب‌گذاری اشخاص.',
  );

  const selectedProfile =
    INITIAL_STAGE59_PROFILES.find((p) => p.zoneId === selectedZoneId) ?? INITIAL_STAGE59_PROFILES[0];

  const tabs: Array<{ id: Stage59TabId; labelFa: string; badgeFa: string }> = [
    {
      id: 'overview_density_household',
      labelFa: '۱. نما، تراکم ۳گانه، سن و خانوار',
      badgeFa: 'ناخالص ≠ ساختمانی',
    },
    {
      id: 'migration_daynight_privacy',
      labelFa: '۲. مهاجرت، روز/شب، محرمانگی و منع برچسب',
      badgeFa: 'حداقل آستانه آماری',
    },
    {
      id: 'services_and_housing',
      labelFa: '۳. خدمات (۵۶)، فشار زیرساخت و بازار مسکن',
      badgeFa: '۴ سطح تقاضا',
    },
    {
      id: 'scenarios_uidem_and_stage60',
      labelFa: '۴. سناریوی جمعیت، UI-DEM و پیش‌نمایش ۶۰',
      badgeFa: 'UI-DEM-001..028',
    },
  ];

  return (
    <section
      className="rounded-2xl border border-indigo-500/30 bg-slate-950/90 p-5 text-slate-100 shadow-xl space-y-4"
      dir="rtl"
      data-testid="stage59-urban-demographics-subpanel"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-indigo-500/20 px-2.5 py-0.5 text-xs font-bold text-indigo-300 border border-indigo-500/40">
              RT-UI-URBAN-DEMOGRAPHICS-SOCIAL-001
            </span>
            <span className="text-xs text-slate-400">
              مرحله ۵۹: نظام تحلیل جمعیت، ساختار اجتماعی و پویایی سکونت شهری
            </span>
          </div>
          <h3 className="mt-1 text-base font-bold text-white">
            ساختار جمعیتی تجمیعی، هرم سنی، خانوار، الگوهای سکونت، فشار خدماتی و تحولات محله‌ای با صیانت از حریم خصوصی
          </h3>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            بخش‌ها: {STAGE59_SECTIONS_15.length}
          </span>
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            لایه‌ها: {STAGE59_MAP_LAYERS_10.length}
          </span>
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            آزمون پذیرش: {STAGE59_ACCEPTANCE_TESTS_28.length}
          </span>
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            رویداد UX: {STAGE59_UX_EVENTS_12.length}
          </span>
        </div>
      </header>

      <div
        className="rounded-xl border border-indigo-500/30 bg-indigo-950/20 px-3 py-2 text-xs text-indigo-200"
        data-testid="stage59-status-banner"
      >
        {bannerFa}
      </div>

      <nav className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4" aria-label="تب‌های مرحله ۵۹">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              data-testid={`stage59-tab-${tab.id}`}
              className={`flex flex-col items-start justify-between rounded-xl border p-3 text-right transition cursor-pointer ${
                isActive
                  ? 'border-indigo-500/60 bg-indigo-950/30 text-white shadow-sm'
                  : 'border-slate-800 bg-slate-900/60 text-slate-300 hover:border-slate-700'
              }`}
            >
              <span className="text-xs font-bold leading-5">{tab.labelFa}</span>
              <span className="mt-1.5 rounded bg-slate-950/80 px-2 py-0.5 text-[10px] font-mono text-indigo-300">
                {tab.badgeFa}
              </span>
            </button>
          );
        })}
      </nav>

      {(activeTab === 'overview_density_household' || activeTab === 'migration_daynight_privacy') && (
        <Stage59DensityHouseholdAndPrivacyPanel
          section={activeTab}
          profiles={INITIAL_STAGE59_PROFILES}
          selectedZoneId={selectedZoneId}
          onSelectZoneId={setSelectedZoneId}
          onFeedbackFa={setBannerFa}
        />
      )}

      {(activeTab === 'services_and_housing' || activeTab === 'scenarios_uidem_and_stage60') && (
        <Stage59ServicesHousingScenarioAndStage60Panel
          section={activeTab}
          profile={selectedProfile}
          onFeedbackFa={setBannerFa}
        />
      )}
    </section>
  );
};
