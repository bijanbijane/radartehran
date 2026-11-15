/** @file src/features/onboarding/components/Stage63UrbanPublicRealmSubpanel.tsx — Stage 63 Main Subpanel */
import React, { useState } from 'react';
import { Stage63FacadeVitalityScenarioStage64Panel } from './Stage63FacadeVitalityScenarioStage64Panel';
import { Stage63SidewalkAccessSafetyPanel } from './Stage63SidewalkAccessSafetyPanel';
import { INITIAL_STAGE63_PROFILES } from '../services/stage63UrbanPublicRealmFixtures';
import {
  STAGE63_ACCEPTANCE_TESTS_28,
  STAGE63_MAP_LAYERS_12,
  STAGE63_SECTIONS_16,
  STAGE63_UX_EVENTS_15,
} from '../services/urbanPublicRealmTypes';

type Stage63TabId =
  | 'overview_and_sidewalks'
  | 'accessibility_and_safety'
  | 'facade_vitality_and_reports'
  | 'scenarios_uipr_and_stage64';

export const Stage63UrbanPublicRealmSubpanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Stage63TabId>('overview_and_sidewalks');
  const [selectedZoneId, setSelectedZoneId] = useState<string>(INITIAL_STAGE63_PROFILES[0].zoneId);
  const [bannerFa, setBannerFa] = useState<string>(
    'مرکز تحلیل فضای عمومی: تفکیک عرض اسمی از عرض مفید، زنجیره دسترس‌پذیری فراگیر، ایمنی فیزیکی از احساس امنیت و پوشش سایه از آسایش حرارتی.',
  );

  const selectedProfile =
    INITIAL_STAGE63_PROFILES.find((p) => p.zoneId === selectedZoneId) ?? INITIAL_STAGE63_PROFILES[0];

  const tabs: Array<{ id: Stage63TabId; labelFa: string; badgeFa: string }> = [
    {
      id: 'overview_and_sidewalks',
      labelFa: '۱. نما، عرض مفید و ۶ بُعد کیفیت',
      badgeFa: '۱۶ بخش + ۱۲ لایه',
    },
    {
      id: 'accessibility_and_safety',
      labelFa: '۲. زنجیره دسترسی، ایمنی و سایه',
      badgeFa: 'پیوستگی ≠ دسترسی',
    },
    {
      id: 'facade_vitality_and_reports',
      labelFa: '۳. جداره، سرزندگی روز/شب و مشارکت',
      badgeFa: 'حریم خصوصی تصاویر',
    },
    {
      id: 'scenarios_uipr_and_stage64',
      labelFa: '۴. سناریو، آزمون UI-PR و پیش‌نمایش ۶۴',
      badgeFa: 'UI-PR-001..028',
    },
  ];

  return (
    <section
      className="rounded-2xl border border-emerald-500/30 bg-slate-950/90 p-5 text-slate-100 shadow-xl space-y-4"
      dir="rtl"
      data-testid="stage63-urban-public-realm-subpanel"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-emerald-500/20 px-2.5 py-0.5 text-xs font-bold text-emerald-300 border border-emerald-500/40">
              RT-UI-URBAN-PUBLIC-REALM-STREETSCAPE-001
            </span>
            <span className="text-xs text-slate-400">
              مرحله ۶۳: نظام تحلیل فضای عمومی، خیابان‌ها، منظر شهری و تجربه پیاده
            </span>
          </div>
          <h3 className="mt-1 text-base font-bold text-white">
            تحلیل پیوستگی و عرض مفید پیاده‌رو، دسترس‌پذیری گروه‌های مختلف، سایه، جداره فعال و گزارش‌های مکانی
          </h3>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            بخش‌ها: {STAGE63_SECTIONS_16.length}
          </span>
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            لایه‌ها: {STAGE63_MAP_LAYERS_12.length}
          </span>
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            آزمون پذیرش: {STAGE63_ACCEPTANCE_TESTS_28.length}
          </span>
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            رویداد UX: {STAGE63_UX_EVENTS_15.length}
          </span>
        </div>
      </header>

      <div
        className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 px-3 py-2 text-xs text-emerald-200"
        data-testid="stage63-status-banner"
      >
        {bannerFa}
      </div>

      <nav className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4" aria-label="تب‌های مرحله ۶۳">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              data-testid={`stage63-tab-${tab.id}`}
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

      {(activeTab === 'overview_and_sidewalks' || activeTab === 'accessibility_and_safety') && (
        <Stage63SidewalkAccessSafetyPanel
          section={activeTab}
          profiles={INITIAL_STAGE63_PROFILES}
          selectedZoneId={selectedZoneId}
          onSelectZoneId={setSelectedZoneId}
          onFeedbackFa={setBannerFa}
        />
      )}

      {(activeTab === 'facade_vitality_and_reports' || activeTab === 'scenarios_uipr_and_stage64') && (
        <Stage63FacadeVitalityScenarioStage64Panel
          section={activeTab}
          profile={selectedProfile}
          onFeedbackFa={setBannerFa}
        />
      )}
    </section>
  );
};
