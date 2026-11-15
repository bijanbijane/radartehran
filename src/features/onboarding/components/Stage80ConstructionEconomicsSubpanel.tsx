/** @file src/features/onboarding/components/Stage80ConstructionEconomicsSubpanel.tsx — Stage 80 Main Subpanel */
import React, { useState } from 'react';
import { Stage80BudgetCvDelayPrivacyStage81Panel } from './Stage80BudgetCvDelayPrivacyStage81Panel';
import { Stage80CostIndexMaterialsEquipmentPanel } from './Stage80CostIndexMaterialsEquipmentPanel';
import { INITIAL_STAGE80_CONSTRUCTION_PROFILES } from '../services/stage80ConstructionFixtures';
import {
  STAGE80_ACCEPTANCE_TESTS_56,
  STAGE80_KPI_CARDS_14,
  STAGE80_PHASES_16,
  STAGE80_REPORT_TYPES_18,
} from '../services/constructionEconomicsStage80Types';

type Stage80TabId =
  | 'overview_floor_basis'
  | 'materials_safety_duplicates'
  | 'budget_cv_lcc_progress'
  | 'privacy_reports_stage81';

export const Stage80ConstructionEconomicsSubpanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Stage80TabId>('overview_floor_basis');
  const [selectedProjectId, setSelectedProjectId] = useState<string>(
    INITIAL_STAGE80_CONSTRUCTION_PROFILES[0].projectId,
  );
  const [bannerFa, setBannerFa] = useState<string>(
    'قلم هزینه ≠ فعالیت ≠ پروژه؛ زیربنای ناخالص ≠ مفید؛ فاکتور تکراری پرچم‌گذاری می‌شود (حذف خودکار ممنوع)؛ گودبرداری بدون مدارک خاک/مجاوران پرریسک است.',
  );

  const selectedProfile =
    INITIAL_STAGE80_CONSTRUCTION_PROFILES.find((p) => p.projectId === selectedProjectId) ??
    INITIAL_STAGE80_CONSTRUCTION_PROFILES[0];

  const tabs: Array<{ id: Stage80TabId; labelFa: string; badgeFa: string }> = [
    {
      id: 'overview_floor_basis',
      labelFa: '۱. داشبورد ساخت، مبنای زیربنا و ۱۶ فاز اجرایی',
      badgeFa: '۱۴ KPI + ۱۴ فیلتر',
    },
    {
      id: 'materials_safety_duplicates',
      labelFa: '۲. قیمت مصالح، فاکتور تکراری و ایمنی گودبرداری',
      badgeFa: 'پرچم + مدارک خاک',
    },
    {
      id: 'budget_cv_lcc_progress',
      labelFa: '۳. انحراف بودجه (CV/CV%)، LCC و پیشرفت فیزیکی/مالی',
      badgeFa: 'Cd = Ci + Cf + Co',
    },
    {
      id: 'privacy_reports_stage81',
      labelFa: '۴. حریم خصوصی پیمانکار، UI-CST80 و پیش‌نمایش ۸۱',
      badgeFa: 'UI-CST80-001..056',
    },
  ];

  return (
    <section
      className="rounded-2xl border border-orange-500/30 bg-slate-950/90 p-5 text-slate-100 shadow-xl space-y-4"
      dir="rtl"
      data-testid="stage80-construction-economics-subpanel"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-orange-500/20 px-2.5 py-0.5 text-[11px] font-bold text-orange-300 border border-orange-500/40 break-words">
              RT-UI-CONSTRUCTION-ECONOMICS-COST-MONITORING-BUILDING-DEVELOPMENT-001
            </span>
            <span className="text-xs text-slate-400">
              مرحله ۸۰: اقتصاد ساخت‌وساز، پایش هزینه‌های پروژه و چرخه توسعه بنا
            </span>
          </div>
          <h3 className="mt-1 text-base font-bold text-white">
            مدیریت ۱۶ فاز اجرایی، شاخص قیمت مصالح، کنترل انحراف بودجه (CV)، ایمنی گود و هزینه چرخه عمر
          </h3>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            شاخص KPI: {STAGE80_KPI_CARDS_14.length}
          </span>
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            فاز اجرایی: {STAGE80_PHASES_16.length}
          </span>
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            گزارش‌ها: {STAGE80_REPORT_TYPES_18.length}
          </span>
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            آزمون پذیرش: {STAGE80_ACCEPTANCE_TESTS_56.length}
          </span>
        </div>
      </header>

      <div
        className="rounded-xl border border-orange-500/30 bg-orange-950/20 px-3 py-2 text-xs text-orange-200"
        data-testid="stage80-status-banner"
      >
        {bannerFa}
      </div>

      <nav className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4" aria-label="تب‌های مرحله ۸۰">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              data-testid={`stage80-tab-${tab.id}`}
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

      {(activeTab === 'overview_floor_basis' || activeTab === 'materials_safety_duplicates') && (
        <Stage80CostIndexMaterialsEquipmentPanel
          section={activeTab}
          profiles={INITIAL_STAGE80_CONSTRUCTION_PROFILES}
          selectedProjectId={selectedProjectId}
          onSelectProjectId={setSelectedProjectId}
          onFeedbackFa={setBannerFa}
        />
      )}

      {(activeTab === 'budget_cv_lcc_progress' || activeTab === 'privacy_reports_stage81') && (
        <Stage80BudgetCvDelayPrivacyStage81Panel
          section={activeTab}
          profile={selectedProfile}
          onFeedbackFa={setBannerFa}
        />
      )}
    </section>
  );
};
