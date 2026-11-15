/** @file src/features/onboarding/components/Stage61UrbanLandUseSubpanel.tsx — Stage 61 Main Subpanel */
import React, { useState } from 'react';
import { Stage61ThreeLayersMixAndVacantPanel } from './Stage61ThreeLayersMixAndVacantPanel';
import { Stage61ValuationScenariosLuAndStage62Panel } from './Stage61ValuationScenariosLuAndStage62Panel';
import { INITIAL_STAGE61_PROFILES } from '../services/stage61UrbanLandUseFixtures';
import {
  STAGE61_ACCEPTANCE_TESTS_30,
  STAGE61_MAP_LAYERS_14,
  STAGE61_SECTIONS_16,
  STAGE61_UX_EVENTS_14,
} from '../services/urbanLandUseTypes';

type Stage61TabId =
  | 'three_layers_and_classification'
  | 'mix_compatibility_and_vacant'
  | 'history_and_valuation'
  | 'scenarios_uilu_and_stage62';

export const Stage61UrbanLandUseSubpanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Stage61TabId>('three_layers_and_classification');
  const [selectedZoneId, setSelectedZoneId] = useState<string>(INITIAL_STAGE61_PROFILES[0].zoneId);
  const [bannerFa, setBannerFa] = useState<string>(
    'مرکز تحلیل کاربری زمین: تفکیک مستقل کاربری مصوب، کاربری ثبت‌شده و استفاده مشاهده‌شده بدون صدور برچسب خودکار تخلف.',
  );

  const selectedProfile =
    INITIAL_STAGE61_PROFILES.find((p) => p.zoneId === selectedZoneId) ?? INITIAL_STAGE61_PROFILES[0];

  const tabs: Array<{ id: Stage61TabId; labelFa: string; badgeFa: string }> = [
    {
      id: 'three_layers_and_classification',
      labelFa: '۱. سه‌لایه مستقل (مصوب/ثبت‌شده/واقعی) و ۱۷ دسته',
      badgeFa: 'اختلاف ≠ تخلف خودکار',
    },
    {
      id: 'mix_compatibility_and_vacant',
      labelFa: '۲. اختلاط، سازگاری و زمین خالی ≠ کم‌استفاده',
      badgeFa: 'خالی ≠ قابل ساخت',
    },
    {
      id: 'history_and_valuation',
      labelFa: '۳. تغییرات کاربری، تاریخچه و مرز ارزش‌گذاری',
      badgeFa: 'داده تخمینی کنترل‌شده',
    },
    {
      id: 'scenarios_uilu_and_stage62',
      labelFa: '۴. سناریو، آزمون UI-LU و پیش‌نمایش ۶۲',
      badgeFa: 'UI-LU-001..030',
    },
  ];

  return (
    <section
      className="rounded-2xl border border-cyan-500/30 bg-slate-950/90 p-5 text-slate-100 shadow-xl space-y-4"
      dir="rtl"
      data-testid="stage61-urban-landuse-subpanel"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-cyan-500/20 px-2.5 py-0.5 text-xs font-bold text-cyan-300 border border-cyan-500/40">
              RT-UI-URBAN-LANDUSE-FUNCTIONAL-001
            </span>
            <span className="text-xs text-slate-400">
              مرحله ۶۱: نظام تحلیل کاربری زمین، ساختار عملکردی شهر و تحولات فضایی
            </span>
          </div>
          <h3 className="mt-1 text-base font-bold text-white">
            تحلیل سه‌لایه کاربری قطعه و ساختمان، اختلاط عملکردی، سازگاری مجاورت، اراضی بایر و تحولات کاربری
          </h3>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            بخش‌ها: {STAGE61_SECTIONS_16.length}
          </span>
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            لایه‌ها: {STAGE61_MAP_LAYERS_14.length}
          </span>
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            آزمون پذیرش: {STAGE61_ACCEPTANCE_TESTS_30.length}
          </span>
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            رویداد UX: {STAGE61_UX_EVENTS_14.length}
          </span>
        </div>
      </header>

      <div
        className="rounded-xl border border-cyan-500/30 bg-cyan-950/20 px-3 py-2 text-xs text-cyan-200"
        data-testid="stage61-status-banner"
      >
        {bannerFa}
      </div>

      <nav className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4" aria-label="تب‌های مرحله ۶۱">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              data-testid={`stage61-tab-${tab.id}`}
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

      {(activeTab === 'three_layers_and_classification' || activeTab === 'mix_compatibility_and_vacant') && (
        <Stage61ThreeLayersMixAndVacantPanel
          section={activeTab}
          profiles={INITIAL_STAGE61_PROFILES}
          selectedZoneId={selectedZoneId}
          onSelectZoneId={setSelectedZoneId}
          onFeedbackFa={setBannerFa}
        />
      )}

      {(activeTab === 'history_and_valuation' || activeTab === 'scenarios_uilu_and_stage62') && (
        <Stage61ValuationScenariosLuAndStage62Panel
          section={activeTab}
          profile={selectedProfile}
          onFeedbackFa={setBannerFa}
        />
      )}
    </section>
  );
};
