/** @file src/features/onboarding/components/Stage77RentalMarketSubpanel.tsx — Stage 77 Main Subpanel */
import React, { useState } from 'react';
import { Stage77HbrTenurePrivacyStage78Panel } from './Stage77HbrTenurePrivacyStage78Panel';
import { Stage77SupplyOutliersConversionPanel } from './Stage77SupplyOutliersConversionPanel';
import { INITIAL_STAGE77_RENTAL_PROFILES } from '../services/stage77RentalMarketFixtures';
import {
  STAGE77_ACCEPTANCE_TESTS_45,
  STAGE77_KPI_CARDS_12,
  STAGE77_MAP_LAYERS_10,
  STAGE77_REPORT_TYPES_15,
} from '../services/rentalMarketStage77Types';

type Stage77TabId =
  | 'overview_supply_dedup'
  | 'price_outliers_rahn_conversion'
  | 'hbr_residual_cost_compare'
  | 'tenure_privacy_reports_stage78';

export const Stage77RentalMarketSubpanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Stage77TabId>('overview_supply_dedup');
  const [selectedZoneId, setSelectedZoneId] = useState<string>(
    INITIAL_STAGE77_RENTAL_PROFILES[0].zoneId,
  );
  const [bannerFa, setBannerFa] = useState<string>(
    'قیمت آگهی ≠ قرارداد؛ میانگین بدون میانه/توزیع ارائه نمی‌شود؛ نرخ تبدیل ودیعه تاریخ‌دار و قابل تغییر است؛ HBR با درآمد باقیمانده (Yr) تفسیر می‌شود.',
  );

  const selectedProfile =
    INITIAL_STAGE77_RENTAL_PROFILES.find((p) => p.zoneId === selectedZoneId) ??
    INITIAL_STAGE77_RENTAL_PROFILES[0];

  const tabs: Array<{ id: Stage77TabId; labelFa: string; badgeFa: string }> = [
    {
      id: 'overview_supply_dedup',
      labelFa: '۱. داشبورد، عرضه یکتا و تشخیص تکرار ۳وضعیتی',
      badgeFa: '۱۲ KPI + ۱۶ فیلتر',
    },
    {
      id: 'price_outliers_rahn_conversion',
      labelFa: '۲. توزیع، کنترل نمونه پرت و تبدیل ودیعه (R_eq)',
      badgeFa: 'IQR + نرخ r شفاف',
    },
    {
      id: 'hbr_residual_cost_compare',
      labelFa: '۳. فشار هزینه (HBR)، درآمد باقیمانده و مقایسه محله',
      badgeFa: 'HBR + Yr',
    },
    {
      id: 'tenure_privacy_reports_stage78',
      labelFa: '۴. پایداری سکونت، گزارش‌ها، UI-RNT77 و مرحله ۷۸',
      badgeFa: 'UI-RNT77-001..045',
    },
  ];

  return (
    <section
      className="rounded-2xl border border-teal-500/30 bg-slate-950/90 p-5 text-slate-100 shadow-xl space-y-4"
      dir="rtl"
      data-testid="stage77-rental-market-subpanel"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-teal-500/20 px-2.5 py-0.5 text-[11px] font-bold text-teal-300 border border-teal-500/40 break-words">
              RT-UI-RENTAL-MARKET-AFFORDABILITY-HOUSING-COST-BURDEN-001
            </span>
            <span className="text-xs text-slate-400">
              مرحله ۷۷: عرضه مسکن استیجاری، ساختار بازار اجاره و فشار هزینه خانوار
            </span>
          </div>
          <h3 className="mt-1 text-base font-bold text-white">
            تفکیک عرضه اجاره، قیمت آگهی/قرارداد، نرخ تبدیل ودیعه، HBR/درآمد باقیمانده و امنیت سکونت
          </h3>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            شاخص KPI: {STAGE77_KPI_CARDS_12.length}
          </span>
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            لایه نقشه: {STAGE77_MAP_LAYERS_10.length}
          </span>
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            گزارش‌ها: {STAGE77_REPORT_TYPES_15.length}
          </span>
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            آزمون پذیرش: {STAGE77_ACCEPTANCE_TESTS_45.length}
          </span>
        </div>
      </header>

      <div
        className="rounded-xl border border-teal-500/30 bg-teal-950/20 px-3 py-2 text-xs text-teal-200"
        data-testid="stage77-status-banner"
      >
        {bannerFa}
      </div>

      <nav className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4" aria-label="تب‌های مرحله ۷۷">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              data-testid={`stage77-tab-${tab.id}`}
              className={`flex flex-col items-start justify-between rounded-xl border p-3 text-right transition cursor-pointer ${
                isActive
                  ? 'border-teal-500/60 bg-teal-950/30 text-white shadow-sm'
                  : 'border-slate-800 bg-slate-900/60 text-slate-300 hover:border-slate-700'
              }`}
            >
              <span className="text-xs font-bold leading-5">{tab.labelFa}</span>
              <span className="mt-1.5 rounded bg-slate-950/80 px-2 py-0.5 text-[10px] font-mono text-teal-300">
                {tab.badgeFa}
              </span>
            </button>
          );
        })}
      </nav>

      {(activeTab === 'overview_supply_dedup' || activeTab === 'price_outliers_rahn_conversion') && (
        <Stage77SupplyOutliersConversionPanel
          section={activeTab}
          profiles={INITIAL_STAGE77_RENTAL_PROFILES}
          selectedZoneId={selectedZoneId}
          onSelectZoneId={setSelectedZoneId}
          onFeedbackFa={setBannerFa}
        />
      )}

      {(activeTab === 'hbr_residual_cost_compare' || activeTab === 'tenure_privacy_reports_stage78') && (
        <Stage77HbrTenurePrivacyStage78Panel
          section={activeTab}
          profile={selectedProfile}
          onFeedbackFa={setBannerFa}
        />
      )}
    </section>
  );
};
