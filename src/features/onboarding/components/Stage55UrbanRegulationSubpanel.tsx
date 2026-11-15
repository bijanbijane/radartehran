/** @file src/features/onboarding/components/Stage55UrbanRegulationSubpanel.tsx — Stage 55 Main Subpanel */
import React, { useState } from 'react';
import { Stage55ZoningDensityAndParcelPanel } from './Stage55ZoningDensityAndParcelPanel';
import { Stage55ScenariosDocsPrivacyAndStage56Panel } from './Stage55ScenariosDocsPrivacyAndStage56Panel';
import {
  INITIAL_STAGE55_AMENDMENTS,
  INITIAL_STAGE55_CONSTRAINTS,
  INITIAL_STAGE55_DOCUMENTS,
  INITIAL_STAGE55_PARCELS,
} from '../services/stage55UrbanRegulationFixtures';
import {
  STAGE55_BOUNDARIES_9,
  STAGE55_DOCUMENT_CATEGORIES_10,
  STAGE55_UX_METRICS_8,
  STAGE56_INFRASTRUCTURE_PREVIEW_AXES_10,
} from '../services/urbanRegulationTypes';

type Stage55TabId =
  | 'zoning_and_overview'
  | 'density_and_parcel_compare'
  | 'scenarios_docs_and_history'
  | 'reports_privacy_and_stage56';

export const Stage55UrbanRegulationSubpanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Stage55TabId>('zoning_and_overview');
  const [bannerFa, setBannerFa] = useState<string>(
    'مرکز تحلیل ضوابط شهرسازی: مرزبندی شفاف میان ضابطه مصوب، وضعیت موجود و برآورد تحلیلی — بدون صدور مجوز یا ادعای حقوقی قطعی.',
  );

  const tabs: Array<{ id: Stage55TabId; labelFa: string; badgeFa: string }> = [
    {
      id: 'zoning_and_overview',
      labelFa: '۱. ضابطه، موجود و برآورد / پهنه و حریم‌ها',
      badgeFa: 'تفکیک سه‌گانه',
    },
    {
      id: 'density_and_parcel_compare',
      labelFa: '۲. تحلیل تراکم، ملک و مقایسه هم‌مبنا',
      badgeFa: 'تأیید/محاسبه/نامشخص',
    },
    {
      id: 'scenarios_docs_and_history',
      labelFa: '۳. سناریوی فرضی، اسناد و تاریخچه مقررات',
      badgeFa: '۱٠ دسته سند',
    },
    {
      id: 'reports_privacy_and_stage56',
      labelFa: '۴. گزارش ۱۲بخشی، حریم خصوصی و پیش‌نمایش ۵۶',
      badgeFa: 'گام بعدی: ۵۶',
    },
  ];

  return (
    <section
      className="rounded-2xl border border-cyan-500/30 bg-slate-950/90 p-5 text-slate-100 shadow-xl space-y-4"
      dir="rtl"
      data-testid="stage55-urban-regulation-subpanel"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-cyan-500/20 px-2.5 py-0.5 text-xs font-bold text-cyan-300 border border-cyan-500/40">
              RT-UI-URBAN-REGULATION-001
            </span>
            <span className="text-xs text-slate-400">
              مرحله ۵۵: تحلیل ضوابط شهرسازی، تراکم ساختمانی و انطباق پروژه‌ها
            </span>
          </div>
          <h3 className="mt-1 text-base font-bold text-white">
            نظام شناخت حقوق و محدودیت‌های توسعه شهری با منشأ اسناد، نمایش عدم قطعیت و سناریوسازی فرضی
          </h3>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            مرز مراحل: {STAGE55_BOUNDARIES_9.length}
          </span>
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            دسته اسناد: {STAGE55_DOCUMENT_CATEGORIES_10.length}
          </span>
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            شاخص UX: {STAGE55_UX_METRICS_8.length}
          </span>
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            محور ۵۶: {STAGE56_INFRASTRUCTURE_PREVIEW_AXES_10.length}
          </span>
        </div>
      </header>

      <div
        className="rounded-xl border border-cyan-500/30 bg-cyan-950/20 px-3 py-2 text-xs text-cyan-200"
        data-testid="stage55-status-banner"
      >
        {bannerFa}
      </div>

      <nav className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4" aria-label="تب‌های مرحله ۵۵">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              data-testid={`stage55-tab-${tab.id}`}
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

      {(activeTab === 'zoning_and_overview' || activeTab === 'density_and_parcel_compare') && (
        <Stage55ZoningDensityAndParcelPanel
          section={activeTab}
          parcels={INITIAL_STAGE55_PARCELS}
          constraints={INITIAL_STAGE55_CONSTRAINTS}
          onFeedbackFa={setBannerFa}
        />
      )}

      {(activeTab === 'scenarios_docs_and_history' || activeTab === 'reports_privacy_and_stage56') && (
        <Stage55ScenariosDocsPrivacyAndStage56Panel
          section={activeTab}
          documents={INITIAL_STAGE55_DOCUMENTS}
          amendments={INITIAL_STAGE55_AMENDMENTS}
          onFeedbackFa={setBannerFa}
        />
      )}
    </section>
  );
};
