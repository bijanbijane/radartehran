/** @file src/features/onboarding/components/Stage66EnvironmentalSustainabilitySubpanel.tsx — Stage 66 Main Subpanel */
import React, { useState } from 'react';
import { Stage66AirVegetationAndWaterPanel } from './Stage66AirVegetationAndWaterPanel';
import { Stage66ThermalSoilScenarioStage67Panel } from './Stage66ThermalSoilScenarioStage67Panel';
import { INITIAL_STAGE66_PROFILES } from '../services/stage66EnvironmentalFixtures';
import {
  STAGE66_ACCEPTANCE_TESTS_24,
  STAGE66_MAP_LAYERS_10,
  STAGE66_MODULES_17,
  STAGE66_UX_METRICS_10,
} from '../services/environmentalSustainabilityTypes';

type Stage66TabId =
  | 'overview_air_vegetation'
  | 'trees_parks_corridors_water'
  | 'thermal_soil_pressure_compare'
  | 'scenarios_reports_quality_stage67';

export const Stage66EnvironmentalSustainabilitySubpanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Stage66TabId>('overview_air_vegetation');
  const [selectedZoneId, setSelectedZoneId] = useState<string>(INITIAL_STAGE66_PROFILES[0].zoneId);
  const [bannerFa, setBannerFa] = useState<string>(
    'مسیر: تحلیل شهری ← محیط‌زیست و پایداری ← کیفیت محیط‌زیست شهری | رادار جایگزین سامانه‌های رسمی پایش نیست و داده مستقیم، ماهواره‌ای و تخمینی را با برچسب شفاف نمایش می‌دهد.',
  );

  const selectedProfile =
    INITIAL_STAGE66_PROFILES.find((p) => p.zoneId === selectedZoneId) ?? INITIAL_STAGE66_PROFILES[0];

  const tabs: Array<{ id: Stage66TabId; labelFa: string; badgeFa: string }> = [
    {
      id: 'overview_air_vegetation',
      labelFa: '۱. نمای کلی، کیفیت هوا و پوشش گیاهی',
      badgeFa: '۱۷ بخش + ۱۰ لایه',
    },
    {
      id: 'trees_parks_corridors_water',
      labelFa: '۲. درختان، دسترسی پیاده، عدالت، کریدور و آب',
      badgeFa: 'شعاع ۳۰۰–۱۰۰۰م',
    },
    {
      id: 'thermal_soil_pressure_compare',
      labelFa: '۳. جزیره حرارتی، نفوذپذیری، فشار و مقایسه',
      badgeFa: 'حداکثر ۴ محله',
    },
    {
      id: 'scenarios_reports_quality_stage67',
      labelFa: '۴. سناریو سبز، گزارش‌ها و پیش‌نمایش ۶۷',
      badgeFa: 'UI-ENV66-001..024',
    },
  ];

  return (
    <section
      className="rounded-2xl border border-emerald-500/30 bg-slate-950/90 p-5 text-slate-100 shadow-xl space-y-4"
      dir="rtl"
      data-testid="stage66-environmental-sustainability-subpanel"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-emerald-500/20 px-2.5 py-0.5 text-xs font-bold text-emerald-300 border border-emerald-500/40">
              RT-UI-URBAN-ENVIRONMENTAL-SUSTAINABILITY-001
            </span>
            <span className="text-xs text-slate-400">
              مرحله ۶۶: نظام تحلیل کیفیت محیط‌زیست شهری، اکوسیستم طبیعی و پایداری مکانی
            </span>
          </div>
          <h3 className="mt-1 text-base font-bold text-white">
            سنجش کیفیت هوا، پوشش گیاهی، درختان، دسترسی پیاده پارک‌ها، کریدورها، آب، نفوذپذیری، LST و عدالت محیطی
          </h3>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            بخش‌ها: {STAGE66_MODULES_17.length}
          </span>
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            لایه‌ها: {STAGE66_MAP_LAYERS_10.length}
          </span>
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            آزمون پذیرش: {STAGE66_ACCEPTANCE_TESTS_24.length}
          </span>
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            معیار UX: {STAGE66_UX_METRICS_10.length}
          </span>
        </div>
      </header>

      <div
        className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 px-3 py-2 text-xs text-emerald-200"
        data-testid="stage66-status-banner"
      >
        {bannerFa}
      </div>

      <nav className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4" aria-label="تب‌های مرحله ۶۶">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              data-testid={`stage66-tab-${tab.id}`}
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

      {(activeTab === 'overview_air_vegetation' || activeTab === 'trees_parks_corridors_water') && (
        <Stage66AirVegetationAndWaterPanel
          section={activeTab}
          profiles={INITIAL_STAGE66_PROFILES}
          selectedZoneId={selectedZoneId}
          onSelectZoneId={setSelectedZoneId}
          onFeedbackFa={setBannerFa}
        />
      )}

      {(activeTab === 'thermal_soil_pressure_compare' || activeTab === 'scenarios_reports_quality_stage67') && (
        <Stage66ThermalSoilScenarioStage67Panel
          section={activeTab}
          profiles={INITIAL_STAGE66_PROFILES}
          profile={selectedProfile}
          onFeedbackFa={setBannerFa}
        />
      )}
    </section>
  );
};
