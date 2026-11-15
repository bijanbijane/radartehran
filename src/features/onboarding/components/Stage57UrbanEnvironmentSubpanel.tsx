/** @file src/features/onboarding/components/Stage57UrbanEnvironmentSubpanel.tsx — Stage 57 Main Subpanel */
import React, { useState } from 'react';
import { Stage57AirThermalGreeneryAndHazardsPanel } from './Stage57AirThermalGreeneryAndHazardsPanel';
import { Stage57PropertyMarketModerationAndStage58Panel } from './Stage57PropertyMarketModerationAndStage58Panel';
import { INITIAL_STAGE57_PROFILES } from '../services/stage57UrbanEnvironmentFixtures';
import {
  STAGE57_ACCEPTANCE_TESTS_25,
  STAGE57_MAP_LAYERS_10,
  STAGE57_SECTIONS_13,
  STAGE57_UX_EVENTS_11,
} from '../services/urbanEnvironmentTypes';

type Stage57TabId =
  | 'air_noise_and_thermal'
  | 'greenery_water_and_soil'
  | 'property_justice_and_market'
  | 'reports_scenarios_and_stage58';

export const Stage57UrbanEnvironmentSubpanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Stage57TabId>('air_noise_and_thermal');
  const [bannerFa, setBannerFa] = useState<string>(
    'مرکز تحلیل محیط‌زیست شهری: تفکیک داده مستقیم از تخمینی و ماهواره‌ای، دمای هوا از دمای سطح و منع خلاصه‌سازی گمراه‌کننده به یک عدد مبهم.',
  );

  const tabs: Array<{ id: Stage57TabId; labelFa: string; badgeFa: string }> = [
    {
      id: 'air_noise_and_thermal',
      labelFa: '۱. هوا، آلودگی صوتی و جزایر حرارتی',
      badgeFa: 'مقیاس خیابان',
    },
    {
      id: 'greenery_water_and_soil',
      labelFa: '۲. فضای سبز، روان‌آب، خاک و گزارش مردمی',
      badgeFa: 'منع امتیاز مبهم',
    },
    {
      id: 'property_justice_and_market',
      labelFa: '۳. پروفایل ملک، عدالت محیطی و مرزبندی بازار',
      badgeFa: 'شعاع ۲۵۰–۱۰۰۰م',
    },
    {
      id: 'reports_scenarios_and_stage58',
      labelFa: '۴. سناریو، آزمون UI-ENV و پیش‌نمایش ۵۸',
      badgeFa: 'UI-ENV-001..025',
    },
  ];

  return (
    <section
      className="rounded-2xl border border-lime-500/30 bg-slate-950/90 p-5 text-slate-100 shadow-xl space-y-4"
      dir="rtl"
      data-testid="stage57-urban-environment-subpanel"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-lime-500/20 px-2.5 py-0.5 text-xs font-bold text-lime-300 border border-lime-500/40">
              RT-UI-URBAN-ENVIRONMENT-001
            </span>
            <span className="text-xs text-slate-400">
              مرحله ۵۷: تحلیل محیط‌زیست شهری، آلودگی، اقلیم و کیفیت زیست‌محیطی محله‌ها
            </span>
          </div>
          <h3 className="mt-1 text-base font-bold text-white">
            پایش چندبعدی کیفیت هوا، صدا، جزایر حرارتی، فضای سبز، روان‌آب و سابقه محیطی با تفکیک داده و عدم قطعیت
          </h3>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            بخش‌ها: {STAGE57_SECTIONS_13.length}
          </span>
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            لایه‌ها: {STAGE57_MAP_LAYERS_10.length}
          </span>
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            آزمون پذیرش: {STAGE57_ACCEPTANCE_TESTS_25.length}
          </span>
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            رویداد UX: {STAGE57_UX_EVENTS_11.length}
          </span>
        </div>
      </header>

      <div
        className="rounded-xl border border-lime-500/30 bg-lime-950/20 px-3 py-2 text-xs text-lime-200"
        data-testid="stage57-status-banner"
      >
        {bannerFa}
      </div>

      <nav className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4" aria-label="تب‌های مرحله ۵۷">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              data-testid={`stage57-tab-${tab.id}`}
              className={`flex flex-col items-start justify-between rounded-xl border p-3 text-right transition cursor-pointer ${
                isActive
                  ? 'border-lime-500/60 bg-lime-950/30 text-white shadow-sm'
                  : 'border-slate-800 bg-slate-900/60 text-slate-300 hover:border-slate-700'
              }`}
            >
              <span className="text-xs font-bold leading-5">{tab.labelFa}</span>
              <span className="mt-1.5 rounded bg-slate-950/80 px-2 py-0.5 text-[10px] font-mono text-lime-300">
                {tab.badgeFa}
              </span>
            </button>
          );
        })}
      </nav>

      {(activeTab === 'air_noise_and_thermal' || activeTab === 'greenery_water_and_soil') && (
        <Stage57AirThermalGreeneryAndHazardsPanel
          section={activeTab}
          profiles={INITIAL_STAGE57_PROFILES}
          onFeedbackFa={setBannerFa}
        />
      )}

      {(activeTab === 'property_justice_and_market' || activeTab === 'reports_scenarios_and_stage58') && (
        <Stage57PropertyMarketModerationAndStage58Panel
          section={activeTab}
          profile={INITIAL_STAGE57_PROFILES[0]}
          onFeedbackFa={setBannerFa}
        />
      )}
    </section>
  );
};
