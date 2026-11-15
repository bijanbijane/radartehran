/** @file src/features/onboarding/components/Stage58UrbanRiskSubpanel.tsx — Stage 58 Main Subpanel */
import React, { useState } from 'react';
import { Stage58AccessResilienceScenarioAndStage59Panel } from './Stage58AccessResilienceScenarioAndStage59Panel';
import { Stage58HazardsBuildingSubsidencePanel } from './Stage58HazardsBuildingSubsidencePanel';
import { INITIAL_STAGE58_PROFILES } from '../services/stage58UrbanRiskFixtures';
import {
  STAGE58_ACCEPTANCE_TESTS_28,
  STAGE58_MAP_LAYERS_10,
  STAGE58_SECTIONS_14,
  STAGE58_UX_EVENTS_12,
} from '../services/urbanRiskTypes';

type Stage58TabId =
  | 'overview_and_seismic'
  | 'multi_hazard_matrix'
  | 'access_and_infrastructure'
  | 'property_scenarios_and_stage59';

export const Stage58UrbanRiskSubpanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Stage58TabId>('overview_and_seismic');
  const [selectedZoneId, setSelectedZoneId] = useState<string>(INITIAL_STAGE58_PROFILES[0].zoneId);
  const [bannerFa, setBannerFa] = useState<string>(
    'مرکز تحلیل مخاطرات و تاب‌آوری شهری: تفکیک صریح مخاطره، مواجهه، آسیب‌پذیری و ظرفیت پاسخ‌گویی بدون ادغام در یک عدد واحد.',
  );

  const selectedProfile =
    INITIAL_STAGE58_PROFILES.find((p) => p.zoneId === selectedZoneId) ?? INITIAL_STAGE58_PROFILES[0];

  const tabs: Array<{ id: Stage58TabId; labelFa: string; badgeFa: string }> = [
    {
      id: 'overview_and_seismic',
      labelFa: '۱. مدل ۵گانه، زلزله و آسیب‌پذیری بنا',
      badgeFa: 'مخاطره ≠ ریسک',
    },
    {
      id: 'multi_hazard_matrix',
      labelFa: '۲. فرونشست، سیلاب، آتش‌سوزی، شیب و رخدادها',
      badgeFa: 'منع شایعه و خطای ایمنی',
    },
    {
      id: 'access_and_infrastructure',
      labelFa: '۳. معابر امدادی، مراکز و تاب‌آوری زیرساخت',
      badgeFa: 'شبیه‌سازی ≠ عملیات زنده',
    },
    {
      id: 'property_scenarios_and_stage59',
      labelFa: '۴. پروفایل، سناریو، UI-RISK و پیش‌نمایش ۵۹',
      badgeFa: 'UI-RISK-001..028',
    },
  ];

  return (
    <section
      className="rounded-2xl border border-teal-500/30 bg-slate-950/90 p-5 text-slate-100 shadow-xl space-y-4"
      dir="rtl"
      data-testid="stage58-urban-risk-subpanel"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-teal-500/20 px-2.5 py-0.5 text-xs font-bold text-teal-300 border border-teal-500/40">
              RT-UI-URBAN-RISK-RESILIENCE-001
            </span>
            <span className="text-xs text-slate-400">
              مرحله ۵۸: نظام تحلیل مخاطرات شهری، ایمنی مکانی و تاب‌آوری محله‌ها
            </span>
          </div>
          <h3 className="mt-1 text-base font-bold text-white">
            سنجش تفکیکی مخاطرات طبیعی و انسان‌ساخت، آسیب‌پذیری کالبدی، دسترسی اضطراری و تاب‌آوری زیرساخت‌ها
          </h3>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            بخش‌ها: {STAGE58_SECTIONS_14.length}
          </span>
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            لایه‌ها: {STAGE58_MAP_LAYERS_10.length}
          </span>
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            آزمون پذیرش: {STAGE58_ACCEPTANCE_TESTS_28.length}
          </span>
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            رویداد UX: {STAGE58_UX_EVENTS_12.length}
          </span>
        </div>
      </header>

      <div
        className="rounded-xl border border-teal-500/30 bg-teal-950/20 px-3 py-2 text-xs text-teal-200"
        data-testid="stage58-status-banner"
      >
        {bannerFa}
      </div>

      <nav className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4" aria-label="تب‌های مرحله ۵۸">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              data-testid={`stage58-tab-${tab.id}`}
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

      {(activeTab === 'overview_and_seismic' || activeTab === 'multi_hazard_matrix') && (
        <Stage58HazardsBuildingSubsidencePanel
          section={activeTab}
          profiles={INITIAL_STAGE58_PROFILES}
          selectedZoneId={selectedZoneId}
          onSelectZoneId={setSelectedZoneId}
          onFeedbackFa={setBannerFa}
        />
      )}

      {(activeTab === 'access_and_infrastructure' || activeTab === 'property_scenarios_and_stage59') && (
        <Stage58AccessResilienceScenarioAndStage59Panel
          section={activeTab}
          profile={selectedProfile}
          onFeedbackFa={setBannerFa}
        />
      )}
    </section>
  );
};
