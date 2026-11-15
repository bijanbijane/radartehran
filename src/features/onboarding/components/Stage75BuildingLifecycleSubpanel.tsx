/** @file src/features/onboarding/components/Stage75BuildingLifecycleSubpanel.tsx — Stage 75 Main Subpanel */
import React, { useState } from 'react';
import { Stage75AgePhysicalStructuralMepPanel } from './Stage75AgePhysicalStructuralMepPanel';
import { Stage75RiskValuationPrivacyStage76Panel } from './Stage75RiskValuationPrivacyStage76Panel';
import { INITIAL_STAGE75_BUILDING_PROFILES } from '../services/stage75BuildingLifecycleFixtures';
import {
  STAGE75_ACCEPTANCE_TESTS_45,
  STAGE75_FILTER_FIELDS_13,
  STAGE75_KPI_CARDS_8,
  STAGE75_REPORT_TYPES_10,
} from '../services/buildingLifecycleStage75Types';

type Stage75TabId =
  | 'overview_age_deterioration'
  | 'structural_quality_mep'
  | 'risk_renovation_valuation'
  | 'privacy_reports_ui_stage76';

export const Stage75BuildingLifecycleSubpanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Stage75TabId>('overview_age_deterioration');
  const [selectedBuildingId, setSelectedBuildingId] = useState<string>(
    INITIAL_STAGE75_BUILDING_PROFILES[0].buildingId,
  );
  const [bannerFa, setBannerFa] = useState<string>(
    'سن بنا ≠ فرسودگی؛ ظاهر مناسب ≠ ایمنی سازه؛ فاقد سابقه نگهداری ≠ بدون نگهداری؛ رنگ قرمز اولویت بررسی ≠ ساختمان ناایمن قطعی.',
  );

  const selectedProfile =
    INITIAL_STAGE75_BUILDING_PROFILES.find((p) => p.buildingId === selectedBuildingId) ??
    INITIAL_STAGE75_BUILDING_PROFILES[0];

  const tabs: Array<{ id: Stage75TabId; labelFa: string; badgeFa: string }> = [
    {
      id: 'overview_age_deterioration',
      labelFa: '۱. داشبورد، ۱۲ بخش و تفکیک سن از فرسودگی',
      badgeFa: '۸ KPI + ۱۳ فیلتر',
    },
    {
      id: 'structural_quality_mep',
      labelFa: '۲. سازه، ۳ وضعیت کیفیت، تأسیسات و نگهداری',
      badgeFa: 'نصب ≠ آخرین تعمیر',
    },
    {
      id: 'risk_renovation_valuation',
      labelFa: '۳. ریسک ۳گانه، مداخلات و اثر ارزش ملک',
      badgeFa: 'یکپارچه با هدونیک',
    },
    {
      id: 'privacy_reports_ui_stage76',
      labelFa: '۴. حریم خصوصی، گزارش، UI-BLD75 و مرحله ۷۶',
      badgeFa: 'UI-BLD75-001..045',
    },
  ];

  return (
    <section
      className="rounded-2xl border border-rose-500/30 bg-slate-950/90 p-5 text-slate-100 shadow-xl space-y-4"
      dir="rtl"
      data-testid="stage75-building-lifecycle-subpanel"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-rose-500/20 px-2.5 py-0.5 text-[11px] font-bold text-rose-300 border border-rose-500/40 break-words">
              RT-UI-BUILDING-LIFECYCLE-DETERIORATION-STRUCTURAL-QUALITY-001
            </span>
            <span className="text-xs text-slate-400">
              مرحله ۷۵: چرخه عمر ساختمان، استهلاک کالبدی، کیفیت سازه‌ای و ریسک فرسودگی
            </span>
          </div>
          <h3 className="mt-1 text-base font-bold text-white">
            جداسازی سن تقویمی، کیفیت ساخت، مستندات سازه‌ای، تأسیسات، نگهداری و اولویت بازسازی بدون احکام مبهم
          </h3>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            شاخص KPI: {STAGE75_KPI_CARDS_8.length}
          </span>
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            فیلترها: {STAGE75_FILTER_FIELDS_13.length}
          </span>
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            گزارش‌ها: {STAGE75_REPORT_TYPES_10.length}
          </span>
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            آزمون پذیرش: {STAGE75_ACCEPTANCE_TESTS_45.length}
          </span>
        </div>
      </header>

      <div
        className="rounded-xl border border-rose-500/30 bg-rose-950/20 px-3 py-2 text-xs text-rose-200"
        data-testid="stage75-status-banner"
      >
        {bannerFa}
      </div>

      <nav className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4" aria-label="تب‌های مرحله ۷۵">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              data-testid={`stage75-tab-${tab.id}`}
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

      {(activeTab === 'overview_age_deterioration' || activeTab === 'structural_quality_mep') && (
        <Stage75AgePhysicalStructuralMepPanel
          section={activeTab}
          profiles={INITIAL_STAGE75_BUILDING_PROFILES}
          selectedBuildingId={selectedBuildingId}
          onSelectBuildingId={setSelectedBuildingId}
          onFeedbackFa={setBannerFa}
        />
      )}

      {(activeTab === 'risk_renovation_valuation' || activeTab === 'privacy_reports_ui_stage76') && (
        <Stage75RiskValuationPrivacyStage76Panel
          section={activeTab}
          profile={selectedProfile}
          onFeedbackFa={setBannerFa}
        />
      )}
    </section>
  );
};
