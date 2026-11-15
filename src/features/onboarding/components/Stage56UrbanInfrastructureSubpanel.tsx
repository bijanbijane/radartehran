/** @file src/features/onboarding/components/Stage56UrbanInfrastructureSubpanel.tsx — Stage 56 Main Subpanel */
import React, { useState } from 'react';
import { Stage56OverviewUtilitiesAndMobilityPanel } from './Stage56OverviewUtilitiesAndMobilityPanel';
import { Stage56JusticeCapacityHistoryAndStage57Panel } from './Stage56JusticeCapacityHistoryAndStage57Panel';
import { INITIAL_STAGE56_PROFILES } from '../services/stage56UrbanInfrastructureFixtures';
import {
  STAGE56_ACCEPTANCE_TESTS_18,
  STAGE56_MAP_LAYERS_10,
  STAGE56_SECTIONS_12,
  STAGE56_UX_EVENTS_10,
} from '../services/urbanInfrastructureTypes';

type Stage56TabId =
  | 'overview_and_utilities'
  | 'mobility_and_services'
  | 'justice_and_capacity'
  | 'history_scenarios_and_stage57';

export const Stage56UrbanInfrastructureSubpanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Stage56TabId>('overview_and_utilities');
  const [bannerFa, setBannerFa] = useState<string>(
    'مرکز زیرساخت و خدمات شهری: تفکیک وجود خدمت از دسترسی واقعی شبکه‌ای، تفکیک پوشش از ظرفیت، بدون جایگزینی داده ناموجود با عدد فرضی.',
  );

  const tabs: Array<{ id: Stage56TabId; labelFa: string; badgeFa: string }> = [
    {
      id: 'overview_and_utilities',
      labelFa: '۱. نمای کلی، لایه‌ها، آب و انرژی و امنیت',
      badgeFa: '۱۰ لایه نقشه',
    },
    {
      id: 'mobility_and_services',
      labelFa: '۲. دسترسی زمانی شبکه‌ای، درمان و آموزش',
      badgeFa: 'Isochrone',
    },
    {
      id: 'justice_and_capacity',
      labelFa: '۳. عدالت فضایی، کفایت ظرفیت و مقایسه',
      badgeFa: 'عرضه/تقاضا',
    },
    {
      id: 'history_scenarios_and_stage57',
      labelFa: '۴. تغییرات زمانی، سناریو و پیش‌نمایش ۵۷',
      badgeFa: 'UI-INF-001..018',
    },
  ];

  return (
    <section
      className="rounded-2xl border border-emerald-500/30 bg-slate-950/90 p-5 text-slate-100 shadow-xl space-y-4"
      dir="rtl"
      data-testid="stage56-urban-infrastructure-subpanel"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-emerald-500/20 px-2.5 py-0.5 text-xs font-bold text-emerald-300 border border-emerald-500/40">
              RT-UI-URBAN-INFRASTRUCTURE-001
            </span>
            <span className="text-xs text-slate-400">
              مرحله ۵۶: نظام تحلیل زیرساخت‌های شهری، ظرفیت خدمات‌رسانی و دسترسی محله‌ها
            </span>
          </div>
          <h3 className="mt-1 text-base font-bold text-white">
            پایش پوشش، ظرفیت عملیاتی، دسترسی زمانی چندشیوه، عدالت فضایی و سناریوهای فرضی زیرساخت شهری
          </h3>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            بخش‌ها: {STAGE56_SECTIONS_12.length}
          </span>
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            لایه‌ها: {STAGE56_MAP_LAYERS_10.length}
          </span>
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            آزمون پذیرش: {STAGE56_ACCEPTANCE_TESTS_18.length}
          </span>
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            رویداد UX: {STAGE56_UX_EVENTS_10.length}
          </span>
        </div>
      </header>

      <div
        className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 px-3 py-2 text-xs text-emerald-200"
        data-testid="stage56-status-banner"
      >
        {bannerFa}
      </div>

      <nav className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4" aria-label="تب‌های مرحله ۵۶">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              data-testid={`stage56-tab-${tab.id}`}
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

      {(activeTab === 'overview_and_utilities' || activeTab === 'mobility_and_services') && (
        <Stage56OverviewUtilitiesAndMobilityPanel
          section={activeTab}
          profiles={INITIAL_STAGE56_PROFILES}
          onFeedbackFa={setBannerFa}
        />
      )}

      {(activeTab === 'justice_and_capacity' || activeTab === 'history_scenarios_and_stage57') && (
        <Stage56JusticeCapacityHistoryAndStage57Panel
          section={activeTab}
          profiles={INITIAL_STAGE56_PROFILES}
          onFeedbackFa={setBannerFa}
        />
      )}
    </section>
  );
};
