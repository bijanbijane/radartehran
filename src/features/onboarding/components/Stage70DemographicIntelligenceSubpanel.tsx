/** @file src/features/onboarding/components/Stage70DemographicIntelligenceSubpanel.tsx — Stage 70 Main Subpanel */
import React, { useState } from 'react';
import { Stage70DayNightCapacityScenariosStage71Panel } from './Stage70DayNightCapacityScenariosStage71Panel';
import { Stage70DensityAgeHouseholdMigrationPanel } from './Stage70DensityAgeHouseholdMigrationPanel';
import { INITIAL_STAGE70_DEMOGRAPHIC_PROFILES } from '../services/stage70DemographicAnalysisFixtures';
import {
  STAGE70_ACCEPTANCE_TESTS_40,
  STAGE70_COMPOSITE_INDEXES_8,
  STAGE70_DOMAINS_20,
  STAGE70_REPORT_TYPES_15,
} from '../services/demographicAnalysisStage70Types';

type Stage70TabId =
  | 'overview_density_years'
  | 'age_household_change_migration'
  | 'daynight_capacity_housing'
  | 'scenarios_privacy_reports_stage71';

export const Stage70DemographicIntelligenceSubpanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Stage70TabId>('overview_density_years');
  const [selectedZoneId, setSelectedZoneId] = useState<string>(INITIAL_STAGE70_DEMOGRAPHIC_PROFILES[0].zoneId);
  const [bannerFa, setBannerFa] = useState<string>(
    'جمعیت یک پدیده مکانی-زمانی-اجتماعی است: تراکم ناخالص ≠ خالص، سال مرجع ≠ انتشار، ۳ ظرفیت جداگانه و تجمیع ضدشناسایی.',
  );

  const selectedProfile =
    INITIAL_STAGE70_DEMOGRAPHIC_PROFILES.find((p) => p.zoneId === selectedZoneId) ??
    INITIAL_STAGE70_DEMOGRAPHIC_PROFILES[0];

  const tabs: Array<{ id: Stage70TabId; labelFa: string; badgeFa: string }> = [
    {
      id: 'overview_density_years',
      labelFa: '۱. ۲۰ حوزه، تراکم ناخالص/خالص و سال مرجع',
      badgeFa: '۲۰ حوزه + ۸ KPI',
    },
    {
      id: 'age_household_change_migration',
      labelFa: '۲. هرم سنی، خانوار، CAGR و مهاجرت',
      badgeFa: 'تغییر مطلق ≠ درصدی',
    },
    {
      id: 'daynight_capacity_housing',
      labelFa: '۳. جمعیت روز/شب، ۳ ظرفیت و مسکن',
      badgeFa: 'ΔP + ظرفیت سه‌گانه',
    },
    {
      id: 'scenarios_privacy_reports_stage71',
      labelFa: '۴. سناریو، محرمانگی، UI-DEM70 و مرحله ۷۱',
      badgeFa: 'UI-DEM70-001..040',
    },
  ];

  return (
    <section
      className="rounded-2xl border border-cyan-500/30 bg-slate-950/90 p-5 text-slate-100 shadow-xl space-y-4"
      dir="rtl"
      data-testid="stage70-demographic-intelligence-subpanel"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-cyan-500/20 px-2.5 py-0.5 text-[11px] font-bold text-cyan-300 border border-cyan-500/40 break-words">
              RT-UI-URBAN-DEMOGRAPHIC-SOCIAL-INTELLIGENCE-001
            </span>
            <span className="text-xs text-slate-400">
              مرحله ۷۰: نظام تحلیل جمعیت، ساختار اجتماعی، پراکندگی سکونت و ویژگیهای جمعیتی محلهها
            </span>
          </div>
          <h3 className="mt-1 text-base font-bold text-white">
            تحلیل فضایی و زمانی جمعیت ساکن و حاضر، تراکم خالص، خانوار، مهاجرت تجمیعی، جمعیت‌پذیری و محرمانگی
          </h3>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            حوزهها: {STAGE70_DOMAINS_20.length}
          </span>
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            شاخص ترکیبی: {STAGE70_COMPOSITE_INDEXES_8.length}
          </span>
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            گزارشها: {STAGE70_REPORT_TYPES_15.length}
          </span>
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            آزمون پذیرش: {STAGE70_ACCEPTANCE_TESTS_40.length}
          </span>
        </div>
      </header>

      <div
        className="rounded-xl border border-cyan-500/30 bg-cyan-950/20 px-3 py-2 text-xs text-cyan-200"
        data-testid="stage70-status-banner"
      >
        {bannerFa}
      </div>

      <nav className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4" aria-label="تب‌های مرحله ۷۰">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              data-testid={`stage70-tab-${tab.id}`}
              className={`flex flex-col items-start justify-between rounded-xl border p-3 text-right transition cursor-pointer ${
                isActive
                  ? 'border-cyan-500/60 bg-cyan-950/30 text-white shadow-sm'
                  : 'border-slate-800 bg-slate-900/60 text-slate-300 hover:border-slate-700'
              }`}
            >
              <span className="text-xs font-bold leading-5">{tab.labelFa}</span>
              <span className="mt-1.5 rounded bg-slate-950/80 px-2 py-0.5 text-[10px] font-mono text-cyan-300">
                {tab.badgeFa}
              </span>
            </button>
          );
        })}
      </nav>

      {(activeTab === 'overview_density_years' || activeTab === 'age_household_change_migration') && (
        <Stage70DensityAgeHouseholdMigrationPanel
          section={activeTab}
          profiles={INITIAL_STAGE70_DEMOGRAPHIC_PROFILES}
          selectedZoneId={selectedZoneId}
          onSelectZoneId={setSelectedZoneId}
          onFeedbackFa={setBannerFa}
        />
      )}

      {(activeTab === 'daynight_capacity_housing' || activeTab === 'scenarios_privacy_reports_stage71') && (
        <Stage70DayNightCapacityScenariosStage71Panel
          section={activeTab}
          profile={selectedProfile}
          onFeedbackFa={setBannerFa}
        />
      )}
    </section>
  );
};
