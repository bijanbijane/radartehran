/** @file src/features/onboarding/components/Stage83UrbanInvestmentSubpanel.tsx — Stage 83 Main Subpanel */
import React, { useState } from 'react';
import { Stage83CapitalFlowPppFinancingPanel } from './Stage83CapitalFlowPppFinancingPanel';
import { Stage83ReturnsRiskPublicImpactStage84Panel } from './Stage83ReturnsRiskPublicImpactStage84Panel';
import { INITIAL_STAGE83_INVESTMENT_PROFILES } from '../services/stage83UrbanInvestmentFixtures';
import {
  STAGE83_ACCEPTANCE_TESTS_68,
  STAGE83_KPI_CARDS_14,
  STAGE83_REPORT_TYPES_22,
} from '../services/urbanInvestmentStage83Types';

type Stage83TabId =
  | 'overview_funnels_atlas'
  | 'ppp_wacc_jv'
  | 'returns_public_compare'
  | 'privacy_reports_stage84';

export const Stage83UrbanInvestmentSubpanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Stage83TabId>('overview_funnels_atlas');
  const [selectedProjectId, setSelectedProjectId] = useState<string>(
    INITIAL_STAGE83_INVESTMENT_PROFILES[0].projectId,
  );
  const [bannerFa, setBannerFa] = useState<string>(
    'فرصت ≠ پروژه ≠ ساختار تأمین مالی ≠ قرارداد ≠ عملکرد؛ اعلام‌شده ≠ تعهدشده ≠ تأمین‌شده ≠ مصرف‌شده؛ اقتصاد سرمایه‌گذاری جدا از اقتصاد عمومی ارزیابی می‌شود.',
  );

  const selectedProfile =
    INITIAL_STAGE83_INVESTMENT_PROFILES.find((p) => p.projectId === selectedProjectId) ??
    INITIAL_STAGE83_INVESTMENT_PROFILES[0];

  const tabs: Array<{ id: Stage83TabId; labelFa: string; badgeFa: string }> = [
    {
      id: 'overview_funnels_atlas',
      labelFa: '۱. داشبورد جریان سرمایه، ۵ موجودیت و ۴ قیف',
      badgeFa: '۱۴ KPI + ۱۲ فیلتر',
    },
    {
      id: 'ppp_wacc_jv',
      labelFa: '۲. مشارکت PPP، تعهدات عمومی، WACC و مشارکت ساخت',
      badgeFa: 'شفافیت ریسک PPP',
    },
    {
      id: 'returns_public_compare',
      labelFa: '۳. بازده واقعی، اقتصاد عمومی و مقایسه همگن',
      badgeFa: 'منع عدد کاذب',
    },
    {
      id: 'privacy_reports_stage84',
      labelFa: '۴. محرمانگی سرمایه‌گذار، ۲۲ گزارش، UI-FIN83 و ۸۴',
      badgeFa: 'UI-FIN83-001..068',
    },
  ];

  return (
    <section
      className="rounded-2xl border border-rose-500/30 bg-slate-950/90 p-5 text-slate-100 shadow-xl space-y-4"
      dir="rtl"
      data-testid="stage83-urban-investment-subpanel"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-rose-500/20 px-2.5 py-0.5 text-[11px] font-bold text-rose-300 border border-rose-500/40 break-words">
              RT-UI-URBAN-INVESTMENT-FINANCING-PPP-CAPITAL-ECONOMICS-001
            </span>
            <span className="text-xs text-slate-400">
              مرحله ۸۳: سرمایه‌گذاری شهری، تأمین مالی، PPP و اقتصاد سرمایه
            </span>
          </div>
          <h3 className="mt-1 text-base font-bold text-white">
            جریان ۴مرحله‌ای سرمایه، ماتریس ریسک و تعهدات PPP، WACC، آثار عمومی و محرمانگی اسناد
          </h3>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            شاخص KPI: {STAGE83_KPI_CARDS_14.length}
          </span>
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            گزارش‌ها: {STAGE83_REPORT_TYPES_22.length}
          </span>
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            آزمون پذیرش: {STAGE83_ACCEPTANCE_TESTS_68.length}
          </span>
        </div>
      </header>

      <div
        className="rounded-xl border border-rose-500/30 bg-rose-950/20 px-3 py-2 text-xs text-rose-200"
        data-testid="stage83-status-banner"
      >
        {bannerFa}
      </div>

      <nav className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4" aria-label="تب‌های مرحله ۸۳">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              data-testid={`stage83-tab-${tab.id}`}
              className={`flex flex-col items-start justify-between rounded-xl border p-3 text-right transition cursor-pointer ${
                isActive
                  ? 'border-rose-500/60 bg-rose-950/30 text-white shadow-sm'
                  : 'border-slate-800 bg-slate-900/60 text-slate-300 hover:border-slate-700'
              }`}
            >
              <span className="text-xs font-bold leading-5">{tab.labelFa}</span>
              <span className="mt-1.5 rounded bg-slate-950/80 px-2 py-0.5 text-[10px] font-mono text-rose-300">
                {tab.badgeFa}
              </span>
            </button>
          );
        })}
      </nav>

      {(activeTab === 'overview_funnels_atlas' || activeTab === 'ppp_wacc_jv') && (
        <Stage83CapitalFlowPppFinancingPanel
          section={activeTab}
          profiles={INITIAL_STAGE83_INVESTMENT_PROFILES}
          selectedProjectId={selectedProjectId}
          onSelectProjectId={setSelectedProjectId}
          onFeedbackFa={setBannerFa}
        />
      )}

      {(activeTab === 'returns_public_compare' || activeTab === 'privacy_reports_stage84') && (
        <Stage83ReturnsRiskPublicImpactStage84Panel
          section={activeTab}
          profile={selectedProfile}
          onFeedbackFa={setBannerFa}
        />
      )}
    </section>
  );
};
