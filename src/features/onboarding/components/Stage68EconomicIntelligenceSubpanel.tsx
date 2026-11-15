/** @file src/features/onboarding/components/Stage68EconomicIntelligenceSubpanel.tsx — Stage 68 Main Subpanel */
import React, { useState } from 'react';
import { Stage68BusinessDistributionHubsAndJobsPanel } from './Stage68BusinessDistributionHubsAndJobsPanel';
import { Stage68CatchmentLifecycleRealtyStage69Panel } from './Stage68CatchmentLifecycleRealtyStage69Panel';
import { INITIAL_STAGE68_PROFILES } from '../services/stage68EconomicIntelligenceFixtures';
import {
  STAGE68_ACCEPTANCE_TESTS_25,
  STAGE68_MAP_LAYERS_10,
  STAGE68_REPORT_TYPES_15,
  STAGE68_SECTIONS_20,
} from '../services/economicIntelligenceStage68Types';

type Stage68TabId =
  | 'overview_density_hubs'
  | 'employment_jobs_commercial_industrial'
  | 'catchment_lifecycle_realty_capacity'
  | 'compare_reports_privacy_stage69';

export const Stage68EconomicIntelligenceSubpanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Stage68TabId>('overview_density_hubs');
  const [selectedZoneId, setSelectedZoneId] = useState<string>(INITIAL_STAGE68_PROFILES[0].zoneId);
  const [bannerFa, setBannerFa] = useState<string>(
    'مسیر: تحلیل شهری ← اقتصاد و فعالیت‌های اقتصادی ← هوش اقتصادی شهر | واحد ثبت‌شده ≠ کل شهر، تراکم ≠ قدرت اقتصادی و ظرفیت ≠ مجوز ضوابط.',
  );

  const selectedProfile =
    INITIAL_STAGE68_PROFILES.find((p) => p.zoneId === selectedZoneId) ?? INITIAL_STAGE68_PROFILES[0];

  const tabs: Array<{ id: Stage68TabId; labelFa: string; badgeFa: string }> = [
    {
      id: 'overview_density_hubs',
      labelFa: '۱. توزیع مکانی، تراکم≠قدرت و قطب‌ها',
      badgeFa: '۲۰ بخش + ۱۰ لایه',
    },
    {
      id: 'employment_jobs_commercial_industrial',
      labelFa: '۲. اشتغال، فرصت شغلی، تجاری و کارگاهی',
      badgeFa: '۳ معیار مجزا',
    },
    {
      id: 'catchment_lifecycle_realty_capacity',
      labelFa: '۳. جذب شبکه‌ای، چرخه حیات، املاک و ظرفیت',
      badgeFa: 'ظرفیت ≠ مجوز',
    },
    {
      id: 'compare_reports_privacy_stage69',
      labelFa: '۴. مقایسه، گزارش، حریم خصوصی و پیش‌نمایش ۶۹',
      badgeFa: 'UI-ECO68-001..025',
    },
  ];

  return (
    <section
      className="rounded-2xl border border-amber-500/30 bg-slate-950/90 p-5 text-slate-100 shadow-xl space-y-4"
      dir="rtl"
      data-testid="stage68-economic-intelligence-subpanel"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-amber-500/20 px-2.5 py-0.5 text-[11px] font-bold text-amber-300 border border-amber-500/40 break-words">
              RT-UI-URBAN-ECONOMIC-ACTIVITY-INTELLIGENCE-001
            </span>
            <span className="text-xs text-slate-400">
              مرحله ۶۸: نظام تحلیل اقتصاد شهری، فعالیت‌های اقتصادی، ساختار اشتغال و پویایی‌های تجاری
            </span>
          </div>
          <h3 className="mt-1 text-base font-bold text-white">
            تحلیل فضایی و شبکه‌ای قطب‌های اقتصادی، اشتغال، خرده‌فروشی، رصد تغییرات کسب‌وکار، املاک تجاری و ظرفیت توسعه
          </h3>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            بخش‌ها: {STAGE68_SECTIONS_20.length}
          </span>
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            لایه‌ها: {STAGE68_MAP_LAYERS_10.length}
          </span>
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            گزارش‌ها: {STAGE68_REPORT_TYPES_15.length}
          </span>
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            آزمون پذیرش: {STAGE68_ACCEPTANCE_TESTS_25.length}
          </span>
        </div>
      </header>

      <div
        className="rounded-xl border border-amber-500/30 bg-amber-950/20 px-3 py-2 text-xs text-amber-200"
        data-testid="stage68-status-banner"
      >
        {bannerFa}
      </div>

      <nav className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4" aria-label="تب‌های مرحله ۶۸">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              data-testid={`stage68-tab-${tab.id}`}
              className={`flex flex-col items-start justify-between rounded-xl border p-3 text-right transition cursor-pointer ${
                isActive
                  ? 'border-amber-500/60 bg-amber-950/30 text-white shadow-sm'
                  : 'border-slate-800 bg-slate-900/60 text-slate-300 hover:border-slate-700'
              }`}
            >
              <span className="text-xs font-bold leading-5">{tab.labelFa}</span>
              <span className="mt-1.5 rounded bg-slate-950/80 px-2 py-0.5 text-[10px] font-mono text-amber-300">
                {tab.badgeFa}
              </span>
            </button>
          );
        })}
      </nav>

      {(activeTab === 'overview_density_hubs' || activeTab === 'employment_jobs_commercial_industrial') && (
        <Stage68BusinessDistributionHubsAndJobsPanel
          section={activeTab}
          profiles={INITIAL_STAGE68_PROFILES}
          selectedZoneId={selectedZoneId}
          onSelectZoneId={setSelectedZoneId}
          onFeedbackFa={setBannerFa}
        />
      )}

      {(activeTab === 'catchment_lifecycle_realty_capacity' || activeTab === 'compare_reports_privacy_stage69') && (
        <Stage68CatchmentLifecycleRealtyStage69Panel
          section={activeTab}
          profiles={INITIAL_STAGE68_PROFILES}
          profile={selectedProfile}
          onFeedbackFa={setBannerFa}
        />
      )}
    </section>
  );
};
