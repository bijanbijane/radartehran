/** @file src/features/onboarding/components/Stage78SalesLiquiditySubpanel.tsx — Stage 78 Main Subpanel */
import React, { useState } from 'react';
import { Stage78SalesGapDomLiquidityPanel } from './Stage78SalesGapDomLiquidityPanel';
import { Stage78YieldRiskPrivacyStage79Panel } from './Stage78YieldRiskPrivacyStage79Panel';
import { INITIAL_STAGE78_SALES_PROFILES } from '../services/stage78SalesLiquidityFixtures';
import {
  STAGE78_ACCEPTANCE_TESTS_48,
  STAGE78_KPI_CARDS_14,
  STAGE78_MAP_LAYERS_10,
  STAGE78_REPORT_TYPES_18,
} from '../services/salesLiquidityStage78Types';

type Stage78TabId =
  | 'overview_entities_gap'
  | 'dom_survival_liquidity'
  | 'yield_cycle_comparison'
  | 'privacy_reports_stage79';

export const Stage78SalesLiquiditySubpanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Stage78TabId>('overview_entities_gap');
  const [selectedZoneId, setSelectedZoneId] = useState<string>(
    INITIAL_STAGE78_SALES_PROFILES[0].zoneId,
  );
  const [bannerFa, setBannerFa] = useState<string>(
    'آگهی ≠ ملک ≠ معامله؛ DOM ≠ زمان تکمیل معامله؛ فایل‌های فروخته‌نشده از بقا حذف نمی‌شوند؛ نقدشوندگی همیشه با پوشش داده و اطمینان نمایش داده می‌شود.',
  );

  const selectedProfile =
    INITIAL_STAGE78_SALES_PROFILES.find((p) => p.zoneId === selectedZoneId) ??
    INITIAL_STAGE78_SALES_PROFILES[0];

  const tabs: Array<{ id: Stage78TabId; labelFa: string; badgeFa: string }> = [
    {
      id: 'overview_entities_gap',
      labelFa: '۱. داشبورد معاملات، تفکیک ۳ موجودیت و شکاف قیمت (G)',
      badgeFa: '۱۴ KPI + ۱۷ فیلتر',
    },
    {
      id: 'dom_survival_liquidity',
      labelFa: '۲. مدت فروش (DOM)، بقا (سانسور) و نقدشوندگی L',
      badgeFa: 'DOM ≠ تکمیل + پوشش',
    },
    {
      id: 'yield_cycle_comparison',
      labelFa: '۳. بازده (Yg/Yn/R_real)، انگیزه با شواهد و چرخه',
      badgeFa: 'تورم‌زدایی واقعی',
    },
    {
      id: 'privacy_reports_stage79',
      labelFa: '۴. حفاظت مکانی، گزارش‌های ۱۸گانه، UI-SLS78 و مرحله ۷۹',
      badgeFa: 'UI-SLS78-001..048',
    },
  ];

  return (
    <section
      className="rounded-2xl border border-amber-500/30 bg-slate-950/90 p-5 text-slate-100 shadow-xl space-y-4"
      dir="rtl"
      data-testid="stage78-sales-liquidity-subpanel"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-amber-500/20 px-2.5 py-0.5 text-[11px] font-bold text-amber-300 border border-amber-500/40 break-words">
              RT-UI-RESIDENTIAL-SALES-MARKET-LIQUIDITY-TRANSACTION-DYNAMICS-001
            </span>
            <span className="text-xs text-slate-400">
              مرحله ۷۸: بازار خرید و فروش مسکن، نقدشوندگی املاک و پویایی معاملات
            </span>
          </div>
          <h3 className="mt-1 text-base font-bold text-white">
            معاملات واقعی، شکاف قیمت پیشنهادی، مدت فروش با سانسور، شاخص نقدشوندگی و بازده واقعی
          </h3>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            شاخص KPI: {STAGE78_KPI_CARDS_14.length}
          </span>
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            لایه نقشه: {STAGE78_MAP_LAYERS_10.length}
          </span>
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            گزارش‌ها: {STAGE78_REPORT_TYPES_18.length}
          </span>
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            آزمون پذیرش: {STAGE78_ACCEPTANCE_TESTS_48.length}
          </span>
        </div>
      </header>

      <div
        className="rounded-xl border border-amber-500/30 bg-amber-950/20 px-3 py-2 text-xs text-amber-200"
        data-testid="stage78-status-banner"
      >
        {bannerFa}
      </div>

      <nav className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4" aria-label="تب‌های مرحله ۷۸">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              data-testid={`stage78-tab-${tab.id}`}
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

      {(activeTab === 'overview_entities_gap' || activeTab === 'dom_survival_liquidity') && (
        <Stage78SalesGapDomLiquidityPanel
          section={activeTab}
          profiles={INITIAL_STAGE78_SALES_PROFILES}
          selectedZoneId={selectedZoneId}
          onSelectZoneId={setSelectedZoneId}
          onFeedbackFa={setBannerFa}
        />
      )}

      {(activeTab === 'yield_cycle_comparison' || activeTab === 'privacy_reports_stage79') && (
        <Stage78YieldRiskPrivacyStage79Panel
          section={activeTab}
          profile={selectedProfile}
          onFeedbackFa={setBannerFa}
        />
      )}
    </section>
  );
};
