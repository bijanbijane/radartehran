/** @file src/features/onboarding/components/Stage73PopulationMobilitySubpanel.tsx — Stage 73 Main Subpanel */
import React, { useState } from 'react';
import { Stage73FlowsAndDemographicsPanel } from './Stage73FlowsAndDemographicsPanel';
import { Stage73StabilityScenariosPrivacyStage74Panel } from './Stage73StabilityScenariosPrivacyStage74Panel';
import { INITIAL_STAGE73_MOBILITY_PROFILES } from '../services/stage73PopulationMobilityFixtures';
import {
  STAGE73_ACCEPTANCE_TESTS_40,
  STAGE73_KPI_CARDS_8,
  STAGE73_MAP_LAYERS_11,
  STAGE73_REPORT_TYPES_10,
} from '../services/populationMobilityStage73Types';

type Stage73TabId =
  | 'overview_flows_od'
  | 'age_household_intercity'
  | 'stability_housing_development'
  | 'scenarios_privacy_reports_stage74';

export const Stage73PopulationMobilitySubpanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Stage73TabId>('overview_flows_od');
  const [selectedZoneId, setSelectedZoneId] = useState<string>(
    INITIAL_STAGE73_MOBILITY_PROFILES[0].zoneId,
  );
  const [bannerFa, setBannerFa] = useState<string>(
    'تغییر جمعیت ≠ جابه‌جایی جمعیت ≠ تغییر ترکیب اجتماعی: NM = I − O، خطوط مبدأ-مقصد ≠ مسیر فیزیکی و منع ردیابی خانوار.',
  );

  const selectedProfile =
    INITIAL_STAGE73_MOBILITY_PROFILES.find((p) => p.zoneId === selectedZoneId) ??
    INITIAL_STAGE73_MOBILITY_PROFILES[0];

  const tabs: Array<{ id: Stage73TabId; labelFa: string; badgeFa: string }> = [
    {
      id: 'overview_flows_od',
      labelFa: '۱. داشبورد، جریان ورود/خروج و نقشه ۱۱لایه',
      badgeFa: 'NM = I − O + ۱۶ فیلتر',
    },
    {
      id: 'age_household_intercity',
      labelFa: '۲. هرم سنی، اندازه خانوار و بین‌شهری',
      badgeFa: 'آماری ≠ علیت',
    },
    {
      id: 'stability_housing_development',
      labelFa: '۳. ماندگاری سکونت، نوسازی و تغییر مرز',
      badgeFa: '۵ بازه + آگهی ≠ جمعیت',
    },
    {
      id: 'scenarios_privacy_reports_stage74',
      labelFa: '۴. ضدنظارت، سناریو، UI-MOB73 و مرحله ۷۴',
      badgeFa: 'UI-MOB73-001..040',
    },
  ];

  return (
    <section
      className="rounded-2xl border border-indigo-500/30 bg-slate-950/90 p-5 text-slate-100 shadow-xl space-y-4"
      dir="rtl"
      data-testid="stage73-population-mobility-subpanel"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-indigo-500/20 px-2.5 py-0.5 text-[11px] font-bold text-indigo-300 border border-indigo-500/40 break-words">
              RT-UI-URBAN-POPULATION-MOBILITY-DEMOGRAPHIC-CHANGE-001
            </span>
            <span className="text-xs text-slate-400">
              مرحله ۷۳: جابه‌جایی جمعیت، مهاجرت درون‌شهری، تغییر ترکیب اجتماعی و پویایی سکونت
            </span>
          </div>
          <h3 className="mt-1 text-base font-bold text-white">
            جریان خالص جابه‌جایی، مهاجرت درون‌شهری، ماندگاری مالک/مستأجر، همسان‌سازی مرز تاریخی و حریم خصوصی ضدنظارت
          </h3>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            شاخص KPI: {STAGE73_KPI_CARDS_8.length}
          </span>
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            لایه نقشه: {STAGE73_MAP_LAYERS_11.length}
          </span>
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            گزارش‌ها: {STAGE73_REPORT_TYPES_10.length}
          </span>
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            آزمون پذیرش: {STAGE73_ACCEPTANCE_TESTS_40.length}
          </span>
        </div>
      </header>

      <div
        className="rounded-xl border border-indigo-500/30 bg-indigo-950/20 px-3 py-2 text-xs text-indigo-200"
        data-testid="stage73-status-banner"
      >
        {bannerFa}
      </div>

      <nav className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4" aria-label="تب‌های مرحله ۷۳">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              data-testid={`stage73-tab-${tab.id}`}
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

      {(activeTab === 'overview_flows_od' || activeTab === 'age_household_intercity') && (
        <Stage73FlowsAndDemographicsPanel
          section={activeTab}
          profiles={INITIAL_STAGE73_MOBILITY_PROFILES}
          selectedZoneId={selectedZoneId}
          onSelectZoneId={setSelectedZoneId}
          onFeedbackFa={setBannerFa}
        />
      )}

      {(activeTab === 'stability_housing_development' || activeTab === 'scenarios_privacy_reports_stage74') && (
        <Stage73StabilityScenariosPrivacyStage74Panel
          section={activeTab}
          profile={selectedProfile}
          onFeedbackFa={setBannerFa}
        />
      )}
    </section>
  );
};
