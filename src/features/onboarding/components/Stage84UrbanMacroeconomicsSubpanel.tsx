/** @file src/features/onboarding/components/Stage84UrbanMacroeconomicsSubpanel.tsx — Stage 84 Main Subpanel */
import React, { useState } from 'react';
import { Stage84DashboardInflationFxCyclesPanel } from './Stage84DashboardInflationFxCyclesPanel';
import { Stage84LagScenariosAtlasMethodStage85Panel } from './Stage84LagScenariosAtlasMethodStage85Panel';
import { INITIAL_STAGE84_MACRO_PROFILES } from '../services/stage84UrbanMacroeconomicsFixtures';
import {
  STAGE84_ACCEPTANCE_TESTS_72,
  STAGE84_ATLAS_LAYERS_9,
  STAGE84_REPORT_TEMPLATES_8,
  STAGE84_SECTIONS_21,
} from '../services/urbanMacroeconomicsStage84Types';

type Stage84TabId =
  | 'macro_dashboard_inflation'
  | 'fx_interest_cycles'
  | 'lag_scenarios_forecast'
  | 'methodology_reports_stage85';

export const Stage84UrbanMacroeconomicsSubpanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Stage84TabId>('macro_dashboard_inflation');
  const [selectedProfileId, setSelectedProfileId] = useState<string>(
    INITIAL_STAGE84_MACRO_PROFILES[0].profileId,
  );
  const [bannerFa, setBannerFa] = useState<string>(
    'داده مشاهده‌شده ≠ تحلیل آماری ≠ تفسیر؛ اقتصاد ملی ≠ شهری؛ قیمت اسمی ≠ واقعی؛ همبستگی ≠ علیت؛ چرخه‌های خرید و اجاره مستقل‌اند.',
  );

  const selectedProfile =
    INITIAL_STAGE84_MACRO_PROFILES.find((p) => p.profileId === selectedProfileId) ??
    INITIAL_STAGE84_MACRO_PROFILES[0];

  const tabs: Array<{ id: Stage84TabId; labelFa: string; badgeFa: string }> = [
    {
      id: 'macro_dashboard_inflation',
      labelFa: '۱. داشبورد اقتصاد کلان، ۲۱ بخش و تورم اسمی/واقعی',
      badgeFa: '۱۰ کارت + ۹ لایه',
    },
    {
      id: 'fx_interest_cycles',
      labelFa: '۲. نرخ ارز، نرخ بهره/اقساط و چرخه‌های ناهم‌زمان',
      badgeFa: 'خرید ≠ اجاره',
    },
    {
      id: 'lag_scenarios_forecast',
      labelFa: '۳. تحلیل تأخیر (Lag)، سناریوسازی و بازه پیش‌بینی',
      badgeFa: 'همبستگی ≠ علیت',
    },
    {
      id: 'methodology_reports_stage85',
      labelFa: '۴. کیفیت/تناقض منابع، ۷۲ آزمون MAC و مرحله ۸۵',
      badgeFa: 'MAC-001..072',
    },
  ];

  return (
    <section
      className="rounded-2xl border border-cyan-500/30 bg-slate-950/90 p-5 text-slate-100 shadow-xl space-y-4"
      dir="rtl"
      data-testid="stage84-urban-macroeconomics-subpanel"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-cyan-500/20 px-2.5 py-0.5 text-[11px] font-bold text-cyan-300 border border-cyan-500/40 break-words">
              RT-UI-URBAN-MACROECONOMICS-ECONOMIC-CYCLES-REAL-ESTATE-IMPACT-001
            </span>
            <span className="text-xs text-slate-400">
              مرحله ۸۴: اقتصاد کلان شهری، چرخه‌های تجاری و اثر متغیرها بر بازار املاک
            </span>
          </div>
          <h3 className="mt-1 text-base font-bold text-white">
            تفکیک اسمی و واقعی، انتقال ارز به هزینه ساخت، ناهم‌زمانی چرخه‌ها، تحلیل Lag و عدم قطعیت پیش‌بینی
          </h3>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            بخش‌ها: {STAGE84_SECTIONS_21.length}
          </span>
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            لایه اطلس: {STAGE84_ATLAS_LAYERS_9.length}
          </span>
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            گزارش‌ها: {STAGE84_REPORT_TEMPLATES_8.length}
          </span>
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            آزمون پذیرش: {STAGE84_ACCEPTANCE_TESTS_72.length}
          </span>
        </div>
      </header>

      <div
        className="rounded-xl border border-cyan-500/30 bg-cyan-950/20 px-3 py-2 text-xs text-cyan-200"
        data-testid="stage84-status-banner"
      >
        {bannerFa}
      </div>

      <nav className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4" aria-label="تب‌های مرحله ۸۴">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              data-testid={`stage84-tab-${tab.id}`}
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

      {(activeTab === 'macro_dashboard_inflation' || activeTab === 'fx_interest_cycles') && (
        <Stage84DashboardInflationFxCyclesPanel
          section={activeTab}
          profiles={INITIAL_STAGE84_MACRO_PROFILES}
          selectedProfileId={selectedProfileId}
          onSelectProfileId={setSelectedProfileId}
          onFeedbackFa={setBannerFa}
        />
      )}

      {(activeTab === 'lag_scenarios_forecast' || activeTab === 'methodology_reports_stage85') && (
        <Stage84LagScenariosAtlasMethodStage85Panel
          section={activeTab}
          profile={selectedProfile}
          onFeedbackFa={setBannerFa}
        />
      )}
    </section>
  );
};
