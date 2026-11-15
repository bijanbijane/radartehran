/** @file src/features/onboarding/components/Stage65UrbanRiskResilienceSubpanel.tsx — Stage 65 Main Subpanel */
import React, { useState } from 'react';
import { Stage65MultiHazardInfraAndBuildingPanel } from './Stage65MultiHazardInfraAndBuildingPanel';
import { Stage65ResilienceAlertsScenarioStage66Panel } from './Stage65ResilienceAlertsScenarioStage66Panel';
import { INITIAL_STAGE65_PROFILES } from '../services/stage65UrbanRiskFixtures';
import {
  STAGE65_ACCEPTANCE_TESTS_23,
  STAGE65_MAP_LAYERS_13,
  STAGE65_SECTIONS_18,
  STAGE65_UX_EVENTS_12,
} from '../services/urbanRiskStage65Types';

type Stage65TabId =
  | 'overview_and_geohazards'
  | 'buildings_and_critical_infra'
  | 'emergency_access_and_resilience'
  | 'alerts_scenarios_and_stage66';

export const Stage65UrbanRiskResilienceSubpanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Stage65TabId>('overview_and_geohazards');
  const [selectedZoneId, setSelectedZoneId] = useState<string>(INITIAL_STAGE65_PROFILES[0].zoneId);
  const [bannerFa, setBannerFa] = useState<string>(
    'مرکز هوشمندی مخاطرات و تاب‌آوری (۱۸ بخش): مخاطره ≠ آسیب‌پذیری ≠ تاب‌آوری، نبود داده ≠ نبود خطر و مرزبندی کامل با فرماندهی رسمی بحران.',
  );

  const selectedProfile =
    INITIAL_STAGE65_PROFILES.find((p) => p.zoneId === selectedZoneId) ?? INITIAL_STAGE65_PROFILES[0];

  const tabs: Array<{ id: Stage65TabId; labelFa: string; badgeFa: string }> = [
    {
      id: 'overview_and_geohazards',
      labelFa: '۱. نمای کلی، ۵ بُعد تاب‌آوری و مخاطرات',
      badgeFa: '۱۸ بخش + ۱۳ لایه',
    },
    {
      id: 'buildings_and_critical_infra',
      labelFa: '۲. ساختمان‌ها و وابستگی زیرساخت حیاتی',
      badgeFa: 'منع برچسب ناایمن',
    },
    {
      id: 'emergency_access_and_resilience',
      labelFa: '۳. دسترسی اضطراری، فضای باز و کارت تاب‌آوری',
      badgeFa: 'داده ناقص = --',
    },
    {
      id: 'alerts_scenarios_and_stage66',
      labelFa: '۴. هشدار رسمی، سناریو و پیش‌نمایش ۶۶',
      badgeFa: 'UI-RISK65-001..023',
    },
  ];

  return (
    <section
      className="rounded-2xl border border-rose-500/30 bg-slate-950/90 p-5 text-slate-100 shadow-xl space-y-4"
      dir="rtl"
      data-testid="stage65-urban-risk-resilience-subpanel"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-rose-500/20 px-2.5 py-0.5 text-xs font-bold text-rose-300 border border-rose-500/40">
              RT-UI-URBAN-RISK-RESILIENCE-001
            </span>
            <span className="text-xs text-slate-400">
              مرحله ۶۵: نظام تحلیل مخاطرات شهری، تاب‌آوری مکانی و آسیب‌پذیری زیرساخت‌ها و محله‌ها
            </span>
          </div>
          <h3 className="mt-1 text-base font-bold text-white">
            تحلیل زلزله، سیلاب، فرونشست، رانش، گراف وابستگی شبکه‌های حیاتی، پناهگاه‌ها و تاب‌آوری ۵بُعدی محله‌ها
          </h3>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            بخش‌ها: {STAGE65_SECTIONS_18.length}
          </span>
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            لایه‌ها: {STAGE65_MAP_LAYERS_13.length}
          </span>
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            آزمون پذیرش: {STAGE65_ACCEPTANCE_TESTS_23.length}
          </span>
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            رویداد UX: {STAGE65_UX_EVENTS_12.length}
          </span>
        </div>
      </header>

      <div
        className="rounded-xl border border-rose-500/30 bg-rose-950/20 px-3 py-2 text-xs text-rose-200"
        data-testid="stage65-status-banner"
      >
        {bannerFa}
      </div>

      <nav className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4" aria-label="تب‌های مرحله ۶۵">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              data-testid={`stage65-tab-${tab.id}`}
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

      {(activeTab === 'overview_and_geohazards' || activeTab === 'buildings_and_critical_infra') && (
        <Stage65MultiHazardInfraAndBuildingPanel
          section={activeTab}
          profiles={INITIAL_STAGE65_PROFILES}
          selectedZoneId={selectedZoneId}
          onSelectZoneId={setSelectedZoneId}
          onFeedbackFa={setBannerFa}
        />
      )}

      {(activeTab === 'emergency_access_and_resilience' || activeTab === 'alerts_scenarios_and_stage66') && (
        <Stage65ResilienceAlertsScenarioStage66Panel
          section={activeTab}
          profile={selectedProfile}
          onFeedbackFa={setBannerFa}
        />
      )}
    </section>
  );
};
