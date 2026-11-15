/** @file src/features/onboarding/components/Stage79InvestmentOpportunitySubpanel.tsx — Stage 79 Main Subpanel */
import React, { useState } from 'react';
import { Stage79CostNpvSensitivityStage80Panel } from './Stage79CostNpvSensitivityStage80Panel';
import { Stage79SpatialMapLandParcelPanel } from './Stage79SpatialMapLandParcelPanel';
import { INITIAL_STAGE79_INVESTMENT_PROFILES } from '../services/stage79InvestmentFixtures';
import {
  STAGE79_ACCEPTANCE_TESTS_52,
  STAGE79_KPI_CARDS_11,
  STAGE79_MAP_LAYERS_15,
  STAGE79_REPORT_TYPES_18,
} from '../services/investmentOpportunityStage79Types';

type Stage79TabId =
  | 'spatial_discovery_ranking'
  | 'land_far_consolidation'
  | 'cost_npv_irr_sensitivity'
  | 'reports_privacy_stage80';

export const Stage79InvestmentOpportunitySubpanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Stage79TabId>('spatial_discovery_ranking');
  const [selectedOpportunityId, setSelectedOpportunityId] = useState<string>(
    INITIAL_STAGE79_INVESTMENT_PROFILES[0].opportunityId,
  );
  const [bannerFa, setBannerFa] = useState<string>(
    'قیمت پایین ≠ فرصت؛ جذابیت مکانی ≠ امکان‌پذیری مالی؛ رتبه‌بندی با «تناسب با معیارهای انتخاب‌شده»؛ NPV/IRR بدون جریان نقد معتبر محاسبه نمی‌شوند.',
  );

  const selectedProfile =
    INITIAL_STAGE79_INVESTMENT_PROFILES.find((p) => p.opportunityId === selectedOpportunityId) ??
    INITIAL_STAGE79_INVESTMENT_PROFILES[0];

  const tabs: Array<{ id: Stage79TabId; labelFa: string; badgeFa: string }> = [
    {
      id: 'spatial_discovery_ranking',
      labelFa: '۱. فرصت‌یابی مکانی، نقشه ۱۵لایه و تناسب با معیارها',
      badgeFa: '۱۱ KPI + ۱۲ فیلتر',
    },
    {
      id: 'land_far_consolidation',
      labelFa: '۲. اقتصاد زمین ۳قیمتی، ظرفیت ساخت و تجمیع/بازآفرینی',
      badgeFa: 'اقتصادی + ارزش عمومی',
    },
    {
      id: 'cost_npv_irr_sensitivity',
      labelFa: '۳. برآورد ۳سطحی هزینه، NPV/IRR و تحلیل حساسیت',
      badgeFa: 'کنترل چندریشه‌ای',
    },
    {
      id: 'reports_privacy_stage80',
      labelFa: '۴. گزارش‌های ۱۸گانه، حریم خصوصی، UI-INV79 و مرحله ۸۰',
      badgeFa: 'UI-INV79-001..052',
    },
  ];

  return (
    <section
      className="rounded-2xl border border-violet-500/30 bg-slate-950/90 p-5 text-slate-100 shadow-xl space-y-4"
      dir="rtl"
      data-testid="stage79-investment-opportunity-subpanel"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-violet-500/20 px-2.5 py-0.5 text-[11px] font-bold text-violet-300 border border-violet-500/40 break-words">
              RT-UI-REAL-ESTATE-INVESTMENT-OPPORTUNITY-SPATIAL-DEVELOPMENT-001
            </span>
            <span className="text-xs text-slate-400">
              مرحله ۷۹: سرمایه‌گذاری ملکی، فرصت‌یابی مکانی و ارزیابی پروژه‌های توسعه
            </span>
          </div>
          <h3 className="mt-1 text-base font-bold text-white">
            فرصت‌یابی چندبعدی، تفکیک ظرفیت قانونی/اقتصادی، بازآفرینی دومتغیره و امکان‌سنجی NPV/IRR
          </h3>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            شاخص KPI: {STAGE79_KPI_CARDS_11.length}
          </span>
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            لایه نقشه: {STAGE79_MAP_LAYERS_15.length}
          </span>
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            گزارش‌ها: {STAGE79_REPORT_TYPES_18.length}
          </span>
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            آزمون پذیرش: {STAGE79_ACCEPTANCE_TESTS_52.length}
          </span>
        </div>
      </header>

      <div
        className="rounded-xl border border-violet-500/30 bg-violet-950/20 px-3 py-2 text-xs text-violet-200"
        data-testid="stage79-status-banner"
      >
        {bannerFa}
      </div>

      <nav className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4" aria-label="تب‌های مرحله ۷۹">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              data-testid={`stage79-tab-${tab.id}`}
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

      {(activeTab === 'spatial_discovery_ranking' || activeTab === 'land_far_consolidation') && (
        <Stage79SpatialMapLandParcelPanel
          section={activeTab}
          profiles={INITIAL_STAGE79_INVESTMENT_PROFILES}
          selectedOpportunityId={selectedOpportunityId}
          onSelectOpportunityId={setSelectedOpportunityId}
          onFeedbackFa={setBannerFa}
        />
      )}

      {(activeTab === 'cost_npv_irr_sensitivity' || activeTab === 'reports_privacy_stage80') && (
        <Stage79CostNpvSensitivityStage80Panel
          section={activeTab}
          profile={selectedProfile}
          onFeedbackFa={setBannerFa}
        />
      )}
    </section>
  );
};
