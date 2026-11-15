/** @file src/features/onboarding/components/Stage50MarketReportingSubpanel.tsx — Stage 50 Main Subpanel */
import React, { useState } from 'react';
import { Stage50OverviewAndTrendsPanel } from './Stage50OverviewAndTrendsPanel';
import { Stage50NarrativeAndGovernancePanel } from './Stage50NarrativeAndGovernancePanel';
import {
  INITIAL_STAGE50_NARRATIVE,
  INITIAL_STAGE50_REPORTS,
} from '../services/stage50ReportingFixtures';
import {
  STAGE50_BOUNDARIES_7,
  STAGE50_FORBIDDEN_ERRORS_20,
  STAGE50_MR_COMPONENT_IDS_50,
  STAGE50_UI_MR_TASKS_39,
  STAGE50_UX_EVENTS_17,
  type MarketReportSummaryRecord,
} from '../services/marketReportingTypes';

type Stage50TabId =
  | 'overview_and_builder'
  | 'trends_supply_and_comparison'
  | 'narrative_quality_and_methodology'
  | 'versioning_access_and_stage51';

export const Stage50MarketReportingSubpanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Stage50TabId>('overview_and_builder');
  const [reports, setReports] = useState<MarketReportSummaryRecord[]>(INITIAL_STAGE50_REPORTS);
  const [selectedReportId, setSelectedReportId] = useState<string>(INITIAL_STAGE50_REPORTS[0].reportId);
  const [bannerFa, setBannerFa] = useState<string>(
    'مرکز گزارش‌های تحلیلی بازار با تفکیک داده، محاسبه، تفسیر و محدودیت؛ بدون ادغام قیمت آگهی و قیمت معامله.',
  );

  const activeReport = reports.find((r) => r.reportId === selectedReportId) ?? reports[0];

  const tabs: Array<{ id: Stage50TabId; labelFa: string; badgeFa: string }> = [
    {
      id: 'overview_and_builder',
      labelFa: '۱. داشبورد گزارش‌ها، ۱۶ بخش استاندارد و سازنده گزارش',
      badgeFa: 'MR-01..MR-12',
    },
    {
      id: 'trends_supply_and_comparison',
      labelFa: '۲. روند اسمی/تعدیل‌شده، ساختار عرضه و مقایسه محله‌ها',
      badgeFa: 'MR-13..MR-22',
    },
    {
      id: 'narrative_quality_and_methodology',
      labelFa: '۳. روایت تحلیلی ۵ جزئی، نوع گزاره‌ها و کیفیت ۶ محوری',
      badgeFa: 'MR-23..MR-48',
    },
    {
      id: 'versioning_access_and_stage51',
      labelFa: '۴. نسخه‌بندی، اصلاحیه، دسترسی و پیش‌نمایش مرحله ۵۱',
      badgeFa: 'MR-29..MR-50',
    },
  ];

  return (
    <section
      className="rounded-2xl border border-cyan-500/30 bg-slate-950/90 p-5 text-slate-100 shadow-xl space-y-4"
      dir="rtl"
      data-testid="stage50-market-reporting-subpanel"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-cyan-500/20 px-2.5 py-0.5 text-xs font-bold text-cyan-300 border border-cyan-500/40">
              RT-UI-MARKET-REPORTING-001
            </span>
            <span className="text-xs text-slate-400">
              مرحله ۵۰: گزارش‌های تحلیلی، روندهای بازار و روایت تغییرات املاک
            </span>
          </div>
          <h3 className="mt-1 text-base font-bold text-white">
            مرکز گزارش‌های بازار تهران، تحلیل تغییرات محله، ساختار عرضه و شناسنامه روش‌شناسی
          </h3>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            مرزهای مرحله: {STAGE50_BOUNDARIES_7.length}
          </span>
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            کامپوننت‌ها: {STAGE50_MR_COMPONENT_IDS_50.length}
          </span>
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            رویداد UX: {STAGE50_UX_EVENTS_17.length}
          </span>
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            تسک/تست/خطای ممنوع: {STAGE50_UI_MR_TASKS_39.length} / 15 / {STAGE50_FORBIDDEN_ERRORS_20.length}
          </span>
        </div>
      </header>

      <div
        className="rounded-xl border border-cyan-500/30 bg-cyan-950/20 px-3 py-2 text-xs text-cyan-200"
        data-testid="stage50-status-banner"
      >
        {bannerFa}
      </div>

      <nav className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4" aria-label="تب‌های مرحله ۵۰">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              data-testid={`stage50-tab-${tab.id}`}
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

      {(activeTab === 'overview_and_builder' || activeTab === 'trends_supply_and_comparison') && (
        <Stage50OverviewAndTrendsPanel
          section={activeTab}
          reports={reports}
          selectedReportId={selectedReportId}
          onSelectReport={setSelectedReportId}
          onFeedbackFa={setBannerFa}
        />
      )}

      {(activeTab === 'narrative_quality_and_methodology' ||
        activeTab === 'versioning_access_and_stage51') && (
        <Stage50NarrativeAndGovernancePanel
          section={activeTab}
          report={activeReport}
          narrative={INITIAL_STAGE50_NARRATIVE}
          onUpdateReport={(next) =>
            setReports((prev) => prev.map((r) => (r.reportId === next.reportId ? next : r)))
          }
          onFeedbackFa={setBannerFa}
        />
      )}
    </section>
  );
};
