/** @file src/features/onboarding/components/Stage69LandUseFunctionalSubpanel.tsx — Stage 69 Main Subpanel */
import React, { useState } from 'react';
import { Stage69LandUseTaxonomySectorsPanel } from './Stage69LandUseTaxonomySectorsPanel';
import { Stage69MixCompatibilityScenariosStage70Panel } from './Stage69MixCompatibilityScenariosStage70Panel';
import { INITIAL_STAGE69_LANDUSE_PROFILES } from '../services/stage69LandUseFunctionalFixtures';
import {
  STAGE69_ACCEPTANCE_TESTS_40,
  STAGE69_DOMAINS_20,
  STAGE69_MAIN_GROUPS_14,
  STAGE69_REPORT_TYPES_10,
} from '../services/landUseFunctionalStructureStage69Types';

type Stage69TabId =
  | 'map_domains_taxonomy_colors'
  | 'residential_commercial_services_green'
  | 'mix_compatibility_conformance'
  | 'scenarios_realty_reports_stage70';

export const Stage69LandUseFunctionalSubpanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Stage69TabId>('map_domains_taxonomy_colors');
  const [selectedZoneId, setSelectedZoneId] = useState<string>(INITIAL_STAGE69_LANDUSE_PROFILES[0].zoneId);
  const [bannerFa, setBannerFa] = useState<string>(
    'کاربری زمین یک سیستم فضایی-عملکردی است: کاربری زمین ≠ فعالیت اقتصادی، رنگ کاربری ≠ رنگ هشدار، اختلاف مصوب/واقعی ≠ تخلف قطعی و سناریو ≠ طرح مصوب.',
  );

  const selectedProfile =
    INITIAL_STAGE69_LANDUSE_PROFILES.find((p) => p.zoneId === selectedZoneId) ?? INITIAL_STAGE69_LANDUSE_PROFILES[0];

  const tabs: Array<{ id: Stage69TabId; labelFa: string; badgeFa: string }> = [
    {
      id: 'map_domains_taxonomy_colors',
      labelFa: '۱. نقشه ۴ سطحی، ۲۰ حوزه، طبقه‌بندی و رنگ',
      badgeFa: '۲۰ حوزه + ۱۴ گروه',
    },
    {
      id: 'residential_commercial_services_green',
      labelFa: '۲. مسکونی، تجاری، صنعتی، خدمات و سبز',
      badgeFa: 'باغ خصوصی ≠ عمومی',
    },
    {
      id: 'mix_compatibility_conformance',
      labelFa: '۳. اختلاط، ماتریس سازگاری و تطابق مصوب/واقعی',
      badgeFa: 'اختلاف ≠ تخلف',
    },
    {
      id: 'scenarios_realty_reports_stage70',
      labelFa: '۴. سناریو، ارزش، گزارش، UI-LU69 و مرحله ۷۰',
      badgeFa: 'UI-LU69-001..040',
    },
  ];

  return (
    <section
      className="rounded-2xl border border-emerald-500/30 bg-slate-950/90 p-5 text-slate-100 shadow-xl space-y-4"
      dir="rtl"
      data-testid="stage69-landuse-functional-subpanel"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-emerald-500/20 px-2.5 py-0.5 text-[11px] font-bold text-emerald-300 border border-emerald-500/40 break-words">
              RT-UI-URBAN-LANDUSE-FUNCTIONAL-STRUCTURE-001
            </span>
            <span className="text-xs text-slate-400">
              مرحله ۶۹: نظام تحلیل کاربری زمین، ساختار عملکردی شهر و سازگاری فضایی فعالیتها
            </span>
          </div>
          <h3 className="mt-1 text-base font-bold text-white">
            ساختار سلسله‌مراتبی کاربریها، اختلاط ۴مبنایی، ماتریس سازگاری، تعارض مصوب و واقعی و سناریوسازی فضایی
          </h3>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            حوزهها: {STAGE69_DOMAINS_20.length}
          </span>
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            گروه اصلی: {STAGE69_MAIN_GROUPS_14.length}
          </span>
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            گزارشها: {STAGE69_REPORT_TYPES_10.length}
          </span>
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            آزمون پذیرش: {STAGE69_ACCEPTANCE_TESTS_40.length}
          </span>
        </div>
      </header>

      <div
        className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 px-3 py-2 text-xs text-emerald-200"
        data-testid="stage69-status-banner"
      >
        {bannerFa}
      </div>

      <nav className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4" aria-label="تب‌های مرحله ۶۹">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              data-testid={`stage69-tab-${tab.id}`}
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

      {(activeTab === 'map_domains_taxonomy_colors' || activeTab === 'residential_commercial_services_green') && (
        <Stage69LandUseTaxonomySectorsPanel
          section={activeTab}
          profiles={INITIAL_STAGE69_LANDUSE_PROFILES}
          selectedZoneId={selectedZoneId}
          onSelectZoneId={setSelectedZoneId}
          onFeedbackFa={setBannerFa}
        />
      )}

      {(activeTab === 'mix_compatibility_conformance' || activeTab === 'scenarios_realty_reports_stage70') && (
        <Stage69MixCompatibilityScenariosStage70Panel
          section={activeTab}
          profile={selectedProfile}
          onFeedbackFa={setBannerFa}
        />
      )}
    </section>
  );
};
