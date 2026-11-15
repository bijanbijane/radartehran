/** @file src/features/onboarding/components/Stage72HousingAffordabilitySubpanel.tsx — Stage 72 Main Subpanel */
import React, { useState } from 'react';
import { Stage72BuyRentCostPressurePanel } from './Stage72BuyRentCostPressurePanel';
import { Stage72GapScenariosPrivacyStage73Panel } from './Stage72GapScenariosPrivacyStage73Panel';
import { INITIAL_STAGE72_AFFORDABILITY_PROFILES } from '../services/stage72HousingAffordabilityFixtures';
import {
  STAGE72_ACCEPTANCE_TESTS_40,
  STAGE72_KPI_CARDS_6,
  STAGE72_MAP_LAYERS_9,
  STAGE72_REPORT_TYPES_7,
} from '../services/housingAffordabilityStage72Types';

type Stage72TabId =
  | 'overview_buy_pti'
  | 'rent_hcr_ancillary_groups'
  | 'gap_nominal_real_compare'
  | 'scenarios_privacy_reports_stage73';

export const Stage72HousingAffordabilitySubpanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Stage72TabId>('overview_buy_pti');
  const [selectedZoneId, setSelectedZoneId] = useState<string>(
    INITIAL_STAGE72_AFFORDABILITY_PROFILES[0].zoneId,
  );
  const [bannerFa, setBannerFa] = useState<string>(
    'گران/ارزان بودن ملک ≠ استطاعت‌پذیری: PTI معادل سال‌های پس‌انداز نیست، رفت‌وآمد از مسکن جدا است و داده ناموجود با صفر پر نمی‌شود.',
  );

  const selectedProfile =
    INITIAL_STAGE72_AFFORDABILITY_PROFILES.find((p) => p.zoneId === selectedZoneId) ??
    INITIAL_STAGE72_AFFORDABILITY_PROFILES[0];

  const tabs: Array<{ id: Stage72TabId; labelFa: string; badgeFa: string }> = [
    {
      id: 'overview_buy_pti',
      labelFa: '۱. داشبورد، لایه‌های نقشه و قدرت خرید PTI',
      badgeFa: '۶ KPI + ۱۸ فیلتر',
    },
    {
      id: 'rent_hcr_ancillary_groups',
      labelFa: '۲. اجاره، نرخ تبدیل ودیعه و فشار HCR',
      badgeFa: 'HCR + ۷ هزینه جانبی',
    },
    {
      id: 'gap_nominal_real_compare',
      labelFa: '۳. شکاف اسمی/واقعی و مقایسه سناریوها',
      badgeFa: 'حداکثر ۵ محله',
    },
    {
      id: 'scenarios_privacy_reports_stage73',
      labelFa: '۴. حریم خصوصی، گزارش‌ها، UI-AFF72 و مرحله ۷۳',
      badgeFa: 'UI-AFF72-001..040',
    },
  ];

  return (
    <section
      className="rounded-2xl border border-emerald-500/30 bg-slate-950/90 p-5 text-slate-100 shadow-xl space-y-4"
      dir="rtl"
      data-testid="stage72-housing-affordability-subpanel"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-emerald-500/20 px-2.5 py-0.5 text-[11px] font-bold text-emerald-300 border border-emerald-500/40 break-words">
              RT-UI-HOUSING-AFFORDABILITY-HOUSEHOLD-ECONOMICS-001
            </span>
            <span className="text-xs text-slate-400">
              مرحله ۷۲: اقتصاد مسکن خانوار، استطاعت‌پذیری خرید و اجاره و فشار هزینه سکونت
            </span>
          </div>
          <h3 className="mt-1 text-base font-bold text-white">
            تحلیل PTI و ۳ وضعیت خرید، محاسبه HCR و تبدیل ودیعه/اجاره، شکاف تورمی و حریم خصوصی نشست‌محور
          </h3>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            شاخص KPI: {STAGE72_KPI_CARDS_6.length}
          </span>
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            لایه نقشه: {STAGE72_MAP_LAYERS_9.length}
          </span>
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            گزارش‌ها: {STAGE72_REPORT_TYPES_7.length}
          </span>
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            آزمون پذیرش: {STAGE72_ACCEPTANCE_TESTS_40.length}
          </span>
        </div>
      </header>

      <div
        className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 px-3 py-2 text-xs text-emerald-200"
        data-testid="stage72-status-banner"
      >
        {bannerFa}
      </div>

      <nav className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4" aria-label="تب‌های مرحله ۷۲">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              data-testid={`stage72-tab-${tab.id}`}
              className={`flex flex-col items-start justify-between rounded-xl border p-3 text-right transition cursor-pointer ${
                isActive
                  ? 'border-emerald-500/60 bg-emerald-950/30 text-white shadow-sm'
                  : 'border-slate-800 bg-slate-900/60 text-slate-300 hover:border-slate-700'
              }`}
            >
              <span className="text-xs font-bold leading-5">{tab.labelFa}</span>
              <span className="mt-1.5 rounded bg-slate-950/80 px-2 py-0.5 text-[10px] font-mono text-emerald-300">
                {tab.badgeFa}
              </span>
            </button>
          );
        })}
      </nav>

      {(activeTab === 'overview_buy_pti' || activeTab === 'rent_hcr_ancillary_groups') && (
        <Stage72BuyRentCostPressurePanel
          section={activeTab}
          profiles={INITIAL_STAGE72_AFFORDABILITY_PROFILES}
          selectedZoneId={selectedZoneId}
          onSelectZoneId={setSelectedZoneId}
          onFeedbackFa={setBannerFa}
        />
      )}

      {(activeTab === 'gap_nominal_real_compare' || activeTab === 'scenarios_privacy_reports_stage73') && (
        <Stage72GapScenariosPrivacyStage73Panel
          section={activeTab}
          profile={selectedProfile}
          onFeedbackFa={setBannerFa}
        />
      )}
    </section>
  );
};
