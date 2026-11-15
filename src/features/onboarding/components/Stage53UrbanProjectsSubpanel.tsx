/** @file src/features/onboarding/components/Stage53UrbanProjectsSubpanel.tsx — Stage 53 Main Subpanel */
import React, { useState } from 'react';
import { Stage53ProjectsStatusAndEvidencePanel } from './Stage53ProjectsStatusAndEvidencePanel';
import { Stage53SpatialImpactFieldAndGovernancePanel } from './Stage53SpatialImpactFieldAndGovernancePanel';
import { INITIAL_STAGE53_PROJECTS } from '../services/stage53UrbanProjectsFixtures';
import {
  STAGE53_BOUNDARIES_8,
  STAGE53_UP_COMPONENT_IDS_50,
  STAGE53_UX_EVENTS_18,
} from '../services/urbanProjectsTypes';

type Stage53TabId =
  | 'projects_status_and_documents'
  | 'progress_financials_and_comparison'
  | 'spatial_footprint_market_and_physical'
  | 'field_reports_privacy_and_stage54';

export const Stage53UrbanProjectsSubpanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Stage53TabId>('projects_status_and_documents');
  const [bannerFa, setBannerFa] = useState<string>(
    'مرکز پروژه‌های شهری و تحولات کالبدی با تفکیک خبر از سند رسمی، پیشرفت مستند از تبلیغاتی، محدوده عملیات از اثر تحلیلی و پیش‌نمایش مرحله ۵۴.',
  );

  const tabs: Array<{ id: Stage53TabId; labelFa: string; badgeFa: string }> = [
    {
      id: 'projects_status_and_documents',
      labelFa: '۱. پروژه، طرح، خبر، وضعیت چندفازی و اسناد',
      badgeFa: 'UP-01..UP-15',
    },
    {
      id: 'progress_financials_and_comparison',
      labelFa: '۲. پیشرفت مستند، اطلاعات مالی و مقایسه',
      badgeFa: 'UP-16..UP-25',
    },
    {
      id: 'spatial_footprint_market_and_physical',
      labelFa: '۳. محدوده عملیات، اثر تحلیلی و تحول کالبدی',
      badgeFa: 'UP-11, UP-32..37',
    },
    {
      id: 'field_reports_privacy_and_stage54',
      labelFa: '۴. گزارش میدانی، حریم خصوصی و پیش‌نمایش ۵۴',
      badgeFa: 'UP-26..UP-50',
    },
  ];

  return (
    <section
      className="rounded-2xl border border-orange-500/30 bg-slate-950/90 p-5 text-slate-100 shadow-xl space-y-4"
      dir="rtl"
      data-testid="stage53-urban-projects-subpanel"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-orange-500/20 px-2.5 py-0.5 text-xs font-bold text-orange-300 border border-orange-500/40">
              RT-UI-URBAN-PROJECTS-001
            </span>
            <span className="text-xs text-slate-400">
              مرحله ۵۳: پروژه‌های شهری، طرح‌های توسعه و تحولات کالبدی شهر
            </span>
          </div>
          <h3 className="mt-1 text-base font-bold text-white">
            مرکز پایش وضعیت مستند پروژه‌ها، خط زمانی چندفازی، محدوده‌های مکانی و کنترل خطای تفسیری بازار
          </h3>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            مرزهای مرحله: {STAGE53_BOUNDARIES_8.length}
          </span>
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            کامپوننت‌ها: {STAGE53_UP_COMPONENT_IDS_50.length}
          </span>
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            رویداد UX: {STAGE53_UX_EVENTS_18.length}
          </span>
        </div>
      </header>

      <div
        className="rounded-xl border border-orange-500/30 bg-orange-950/20 px-3 py-2 text-xs text-orange-200"
        data-testid="stage53-status-banner"
      >
        {bannerFa}
      </div>

      <nav className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4" aria-label="تب‌های مرحله ۵۳">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              data-testid={`stage53-tab-${tab.id}`}
              className={`flex flex-col items-start justify-between rounded-xl border p-3 text-right transition cursor-pointer ${
                isActive
                  ? 'border-orange-500/60 bg-orange-950/30 text-white shadow-sm'
                  : 'border-slate-800 bg-slate-900/60 text-slate-300 hover:border-slate-700'
              }`}
            >
              <span className="text-xs font-bold leading-5">{tab.labelFa}</span>
              <span className="mt-1.5 rounded bg-slate-950/80 px-2 py-0.5 text-[10px] font-mono text-orange-300">
                {tab.badgeFa}
              </span>
            </button>
          );
        })}
      </nav>

      {(activeTab === 'projects_status_and_documents' || activeTab === 'progress_financials_and_comparison') && (
        <Stage53ProjectsStatusAndEvidencePanel
          section={activeTab}
          projects={INITIAL_STAGE53_PROJECTS}
          onFeedbackFa={setBannerFa}
        />
      )}

      {(activeTab === 'spatial_footprint_market_and_physical' || activeTab === 'field_reports_privacy_and_stage54') && (
        <Stage53SpatialImpactFieldAndGovernancePanel
          section={activeTab}
          projects={INITIAL_STAGE53_PROJECTS}
          onFeedbackFa={setBannerFa}
        />
      )}
    </section>
  );
};
