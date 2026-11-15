/** @file src/features/onboarding/components/Stage60UrbanEconomySubpanel.tsx — Stage 60 Main Subpanel */
import React, { useState } from 'react';
import { Stage60ActivityEmploymentAndDeduplicationPanel } from './Stage60ActivityEmploymentAndDeduplicationPanel';
import { Stage60CorridorsMarketPrivacyAndStage61Panel } from './Stage60CorridorsMarketPrivacyAndStage61Panel';
import { INITIAL_STAGE60_PROFILES } from '../services/stage60UrbanEconomyFixtures';
import {
  STAGE60_ACCEPTANCE_TESTS_28,
  STAGE60_MAP_LAYERS_10,
  STAGE60_SECTIONS_16,
  STAGE60_UX_EVENTS_12,
} from '../services/urbanEconomyTypes';

type Stage60TabId =
  | 'overview_and_density'
  | 'classification_and_employment'
  | 'corridors_access_and_market'
  | 'scenarios_uieco_and_stage61';

export const Stage60UrbanEconomySubpanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Stage60TabId>('overview_and_density');
  const [selectedZoneId, setSelectedZoneId] = useState<string>(INITIAL_STAGE60_PROFILES[0].zoneId);
  const [bannerFa, setBannerFa] = useState<string>(
    'مرکز تحلیل اقتصاد شهری: تفکیک واحد ثبت‌شده از فعال تأییدشده، منع شمارش مضاعف شعب، جداسازی اشتغال و پرهیز از دایرکتوری تکراری.',
  );

  const selectedProfile =
    INITIAL_STAGE60_PROFILES.find((p) => p.zoneId === selectedZoneId) ?? INITIAL_STAGE60_PROFILES[0];

  const tabs: Array<{ id: Stage60TabId; labelFa: string; badgeFa: string }> = [
    {
      id: 'overview_and_density',
      labelFa: '۱. نما، تراکم، ثبت‌شده ≠ فعال و مقایسه هم‌سنخ',
      badgeFa: '۱۶ بخش + ۱۰ لایه',
    },
    {
      id: 'classification_and_employment',
      labelFa: '۲. طبقه‌بندی، منع شمارش مضاعف و اشتغال',
      badgeFa: 'کسب‌وکار ≠ اشتغال',
    },
    {
      id: 'corridors_access_and_market',
      labelFa: '۳. محور تجاری، دسترسی، پوشش داده و املاک',
      badgeFa: 'همبستگی ≠ علیت',
    },
    {
      id: 'scenarios_uieco_and_stage61',
      labelFa: '۴. سناریو، آزمون UI-ECO و پیش‌نمایش ۶۱',
      badgeFa: 'UI-ECO-001..028',
    },
  ];

  return (
    <section
      className="rounded-2xl border border-amber-500/30 bg-slate-950/90 p-5 text-slate-100 shadow-xl space-y-4"
      dir="rtl"
      data-testid="stage60-urban-economy-subpanel"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-amber-500/20 px-2.5 py-0.5 text-xs font-bold text-amber-300 border border-amber-500/40">
              RT-UI-URBAN-ECONOMY-001
            </span>
            <span className="text-xs text-slate-400">
              مرحله ۶۰: نظام تحلیل اقتصاد شهری، اشتغال، فعالیت‌های تجاری و پویایی اقتصادی محله‌ها
            </span>
          </div>
          <h3 className="mt-1 text-base font-bold text-white">
            تحلیل ساختار اقتصادی تجمیعی، محورهای تجاری، اشتغال، دسترسی شبکه‌ای و پیوند کنترل‌شده با بازار املاک
          </h3>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            بخش‌ها: {STAGE60_SECTIONS_16.length}
          </span>
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            لایه‌ها: {STAGE60_MAP_LAYERS_10.length}
          </span>
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            آزمون پذیرش: {STAGE60_ACCEPTANCE_TESTS_28.length}
          </span>
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            رویداد UX: {STAGE60_UX_EVENTS_12.length}
          </span>
        </div>
      </header>

      <div
        className="rounded-xl border border-amber-500/30 bg-amber-950/20 px-3 py-2 text-xs text-amber-200"
        data-testid="stage60-status-banner"
      >
        {bannerFa}
      </div>

      <nav className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4" aria-label="تب‌های مرحله ۶۰">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              data-testid={`stage60-tab-${tab.id}`}
              className={`flex flex-col items-start justify-between rounded-xl border p-3 text-right transition cursor-pointer ${
                isActive
                  ? 'border-amber-500/60 bg-amber-950/30 text-white shadow-sm'
                  : 'border-slate-800 bg-slate-900/60 text-slate-300 hover:border-slate-700'
              }`}
            >
              <span className="text-xs font-bold leading-5">{tab.labelFa}</span>
              <span className="mt-1.5 rounded bg-slate-950/80 px-2 py-0.5 text-[10px] font-mono text-amber-300">
                {tab.badgeFa}
              </span>
            </button>
          );
        })}
      </nav>

      {(activeTab === 'overview_and_density' || activeTab === 'classification_and_employment') && (
        <Stage60ActivityEmploymentAndDeduplicationPanel
          section={activeTab}
          profiles={INITIAL_STAGE60_PROFILES}
          selectedZoneId={selectedZoneId}
          onSelectZoneId={setSelectedZoneId}
          onFeedbackFa={setBannerFa}
        />
      )}

      {(activeTab === 'corridors_access_and_market' || activeTab === 'scenarios_uieco_and_stage61') && (
        <Stage60CorridorsMarketPrivacyAndStage61Panel
          section={activeTab}
          profile={selectedProfile}
          onFeedbackFa={setBannerFa}
        />
      )}
    </section>
  );
};
