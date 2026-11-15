/** @file src/features/onboarding/components/Stage71SpatialEquitySubpanel.tsx — Stage 71 Main Subpanel */
import React, { useState } from 'react';
import { Stage71CompositeEquityScenariosStage72Panel } from './Stage71CompositeEquityScenariosStage72Panel';
import { Stage71ServicesAccessDeprivationPanel } from './Stage71ServicesAccessDeprivationPanel';
import { INITIAL_STAGE71_EQUITY_PROFILES } from '../services/stage71SpatialEquityFixtures';
import {
  STAGE71_ACCEPTANCE_TESTS_40,
  STAGE71_DOMAINS_20,
  STAGE71_KPI_CARDS_8,
  STAGE71_REPORT_TYPES_15,
} from '../services/spatialEquityUrbanJusticeStage71Types';

type Stage71TabId =
  | 'overview_services_access'
  | 'deprivation_education_health_green'
  | 'composite_risk_projects'
  | 'scenarios_privacy_reports_stage72';

export const Stage71SpatialEquitySubpanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Stage71TabId>('overview_services_access');
  const [selectedZoneId, setSelectedZoneId] = useState<string>(INITIAL_STAGE71_EQUITY_PROFILES[0].zoneId);
  const [bannerFa, setBannerFa] = useState<string>(
    'عدالت فضایی به یک امتیاز کلی تقلیل نمی‌یابد: دسترسی شبکه‌ای ≠ فاصله مستقیم، داده ناموجود ≠ صفر، پارک عمومی ≠ باغ خصوصی.',
  );

  const selectedProfile =
    INITIAL_STAGE71_EQUITY_PROFILES.find((p) => p.zoneId === selectedZoneId) ??
    INITIAL_STAGE71_EQUITY_PROFILES[0];

  const tabs: Array<{ id: Stage71TabId; labelFa: string; badgeFa: string }> = [
    {
      id: 'overview_services_access',
      labelFa: '۱. ۲۰ حوزه، خدمات ۱۰گانه و دسترسی شبکه‌ای',
      badgeFa: '۲۰ حوزه + ۱۸ فیلتر',
    },
    {
      id: 'deprivation_education_health_green',
      labelFa: '۲. محرومیت ۵سطحی، آموزش، درمان و فضای سبز',
      badgeFa: 'ناموجود ≠ صفر',
    },
    {
      id: 'composite_risk_projects',
      labelFa: '۳. شاخص ترکیبی Ei، ریسک سه‌گانه و پروژه‌ها',
      badgeFa: 'Σ wj = 1 + حساسیت',
    },
    {
      id: 'scenarios_privacy_reports_stage72',
      labelFa: '۴. سناریو، ضدتبعیض، UI-EQU71 و مرحله ۷۲',
      badgeFa: 'UI-EQU71-001..040',
    },
  ];

  return (
    <section
      className="rounded-2xl border border-violet-500/30 bg-slate-950/90 p-5 text-slate-100 shadow-xl space-y-4"
      dir="rtl"
      data-testid="stage71-spatial-equity-subpanel"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-violet-500/20 px-2.5 py-0.5 text-[11px] font-bold text-violet-300 border border-violet-500/40 break-words">
              RT-UI-SPATIAL-EQUITY-URBAN-JUSTICE-001
            </span>
            <span className="text-xs text-slate-400">
              مرحله ۷۱: تحلیل نابرابری‌های فضایی، عدالت شهری و محرومیت مکانی
            </span>
          </div>
          <h3 className="mt-1 text-base font-bold text-white">
            توزیع فضایی خدمات عمومی، دسترسی شبکه‌ای واقعی، محرومیت چندبُعدی، شاخص ترکیبی شفاف و قواعد ضدتبعیض
          </h3>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            حوزه‌ها: {STAGE71_DOMAINS_20.length}
          </span>
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            شاخص KPI: {STAGE71_KPI_CARDS_8.length}
          </span>
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            گزارش‌ها: {STAGE71_REPORT_TYPES_15.length}
          </span>
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            آزمون پذیرش: {STAGE71_ACCEPTANCE_TESTS_40.length}
          </span>
        </div>
      </header>

      <div
        className="rounded-xl border border-violet-500/30 bg-violet-950/20 px-3 py-2 text-xs text-violet-200"
        data-testid="stage71-status-banner"
      >
        {bannerFa}
      </div>

      <nav className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4" aria-label="تب‌های مرحله ۷۱">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              data-testid={`stage71-tab-${tab.id}`}
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

      {(activeTab === 'overview_services_access' || activeTab === 'deprivation_education_health_green') && (
        <Stage71ServicesAccessDeprivationPanel
          section={activeTab}
          profiles={INITIAL_STAGE71_EQUITY_PROFILES}
          selectedZoneId={selectedZoneId}
          onSelectZoneId={setSelectedZoneId}
          onFeedbackFa={setBannerFa}
        />
      )}

      {(activeTab === 'composite_risk_projects' || activeTab === 'scenarios_privacy_reports_stage72') && (
        <Stage71CompositeEquityScenariosStage72Panel
          section={activeTab}
          profile={selectedProfile}
          onFeedbackFa={setBannerFa}
        />
      )}
    </section>
  );
};
