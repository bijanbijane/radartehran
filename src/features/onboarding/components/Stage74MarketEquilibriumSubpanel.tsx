/** @file src/features/onboarding/components/Stage74MarketEquilibriumSubpanel.tsx — Stage 74 Main Subpanel */
import React, { useState } from 'react';
import { Stage74EquilibriumPriorityStage75Panel } from './Stage74EquilibriumPriorityStage75Panel';
import { Stage74SupplyDemandSeparationPanel } from './Stage74SupplyDemandSeparationPanel';
import { INITIAL_STAGE74_EQUILIBRIUM_PROFILES } from '../services/stage74HousingDemandSupplyFixtures';
import {
  STAGE74_ACCEPTANCE_TESTS_45,
  STAGE74_AREA_BRACKETS_5,
  STAGE74_KPI_CARDS_8,
  STAGE74_REPORT_TYPES_10,
} from '../services/housingDemandSupplyStage74Types';

type Stage74TabId =
  | 'overview_five_concepts'
  | 'vacancies_pipeline_motive'
  | 'gap_matrix_equilibrium'
  | 'priority_reports_ui_stage75';

export const Stage74MarketEquilibriumSubpanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Stage74TabId>('overview_five_concepts');
  const [selectedZoneId, setSelectedZoneId] = useState<string>(
    INITIAL_STAGE74_EQUILIBRIUM_PROFILES[0].zoneId,
  );
  const [bannerFa, setBannerFa] = useState<string>(
    'موجودی فیزیکی ≠ قابل استفاده ≠ عرضه فعال ≠ تقاضای مؤثر ≠ نیاز سکونتی: GQ = DQ − SQ با حذف دوباره‌شماری آگهی و کنترل ۵ بُعد شکاف.',
  );

  const selectedProfile =
    INITIAL_STAGE74_EQUILIBRIUM_PROFILES.find((p) => p.zoneId === selectedZoneId) ??
    INITIAL_STAGE74_EQUILIBRIUM_PROFILES[0];

  const tabs: Array<{ id: Stage74TabId; labelFa: string; badgeFa: string }> = [
    {
      id: 'overview_five_concepts',
      labelFa: '۱. داشبورد، تفکیک ۵ مفهوم و ضد دوباره-شماری',
      badgeFa: '۸ KPI + ۵ متراژ',
    },
    {
      id: 'vacancies_pipeline_motive',
      labelFa: '۲. واحدهای خالی، پروانه و انگیزه مصرفی/سرمایه‌ای',
      badgeFa: 'خالی ≠ عرضه',
    },
    {
      id: 'gap_matrix_equilibrium',
      labelFa: '۳. شکاف GQ = DQ − SQ و تعادل ساختاری',
      badgeFa: '۵ بُعد + سناریو',
    },
    {
      id: 'priority_reports_ui_stage75',
      labelFa: '۴. اولویت، گزارش، UI-EQB74 و مرحله ۷۵',
      badgeFa: 'UI-EQB74-001..045',
    },
  ];

  return (
    <section
      className="rounded-2xl border border-amber-500/30 bg-slate-950/90 p-5 text-slate-100 shadow-xl space-y-4"
      dir="rtl"
      data-testid="stage74-market-equilibrium-subpanel"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-amber-500/20 px-2.5 py-0.5 text-[11px] font-bold text-amber-300 border border-amber-500/40 break-words">
              RT-UI-HOUSING-DEMAND-SUPPLY-MARKET-EQUILIBRIUM-001
            </span>
            <span className="text-xs text-slate-400">
              مرحله ۷۴: تحلیل تقاضای مسکن، نیاز سکونتی، ظرفیت عرضه و تعادل بازار محله
            </span>
          </div>
          <h3 className="mt-1 text-base font-bold text-white">
            تفکیک ۵ لایه عرضه و تقاضا، ماتریس شکاف ۵بعدی GQ = DQ − SQ، طبقه‌بندی واحدهای خالی و اولویت‌بندی تحلیلی
          </h3>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            شاخص KPI: {STAGE74_KPI_CARDS_8.length}
          </span>
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            بازه متراژ: {STAGE74_AREA_BRACKETS_5.length}
          </span>
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            گزارش‌ها: {STAGE74_REPORT_TYPES_10.length}
          </span>
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            آزمون پذیرش: {STAGE74_ACCEPTANCE_TESTS_45.length}
          </span>
        </div>
      </header>

      <div
        className="rounded-xl border border-amber-500/30 bg-amber-950/20 px-3 py-2 text-xs text-amber-200"
        data-testid="stage74-status-banner"
      >
        {bannerFa}
      </div>

      <nav className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4" aria-label="تب‌های مرحله ۷۴">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              data-testid={`stage74-tab-${tab.id}`}
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

      {(activeTab === 'overview_five_concepts' || activeTab === 'vacancies_pipeline_motive') && (
        <Stage74SupplyDemandSeparationPanel
          section={activeTab}
          profiles={INITIAL_STAGE74_EQUILIBRIUM_PROFILES}
          selectedZoneId={selectedZoneId}
          onSelectZoneId={setSelectedZoneId}
          onFeedbackFa={setBannerFa}
        />
      )}

      {(activeTab === 'gap_matrix_equilibrium' || activeTab === 'priority_reports_ui_stage75') && (
        <Stage74EquilibriumPriorityStage75Panel
          section={activeTab}
          profile={selectedProfile}
          onFeedbackFa={setBannerFa}
        />
      )}
    </section>
  );
};
