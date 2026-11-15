/** @file src/features/onboarding/components/Stage64UrbanMobilitySubpanel.tsx — Stage 64 Main Subpanel */
import React, { useState } from 'react';
import { Stage64AccessPrivacyScenarioStage65Panel } from './Stage64AccessPrivacyScenarioStage65Panel';
import { Stage64NetworkTransitMultimodalPanel } from './Stage64NetworkTransitMultimodalPanel';
import { INITIAL_STAGE64_PROFILES } from '../services/stage64UrbanMobilityFixtures';
import {
  STAGE64_ACCEPTANCE_TESTS_30,
  STAGE64_MAP_LAYERS_12,
  STAGE64_SECTIONS_17,
  STAGE64_UX_EVENTS_16,
} from '../services/urbanMobilityTypes';

type Stage64TabId =
  | 'overview_and_network'
  | 'transit_and_multimodal'
  | 'od_parking_freight_and_valuation'
  | 'scenarios_uimob_and_stage65';

export const Stage64UrbanMobilitySubpanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Stage64TabId>('overview_and_network');
  const [selectedZoneId, setSelectedZoneId] = useState<string>(INITIAL_STAGE64_PROFILES[0].zoneId);
  const [bannerFa, setBannerFa] = useState<string>(
    'مرکز تحلیل تحرک شهری: فاصله مستقیم ≠ زمان دسترسی، برنامه رسمی ≠ عملکرد واقعی، حفظ انتظار و انتقال در زمان سفر و محرمانگی جریان OD.',
  );

  const selectedProfile =
    INITIAL_STAGE64_PROFILES.find((p) => p.zoneId === selectedZoneId) ?? INITIAL_STAGE64_PROFILES[0];

  const tabs: Array<{ id: Stage64TabId; labelFa: string; badgeFa: string }> = [
    {
      id: 'overview_and_network',
      labelFa: '۱. نما، شبکه و ۵ وضعیت زمانی',
      badgeFa: '۱۷ بخش + ۱۲ لایه',
    },
    {
      id: 'transit_and_multimodal',
      labelFa: '۲. حمل‌ونقل عمومی و مسیر چندوجهی',
      badgeFa: 'انتظار و انتقال',
    },
    {
      id: 'od_parking_freight_and_valuation',
      labelFa: '۳. جریان OD، پارکینگ، بار و املاک',
      badgeFa: 'حریم خصوصی سفر',
    },
    {
      id: 'scenarios_uimob_and_stage65',
      labelFa: '۴. سناریو، آزمون UI-MOB و پیش‌نمایش',
      badgeFa: 'UI-MOB-001..030',
    },
  ];

  return (
    <section
      className="rounded-2xl border border-indigo-500/30 bg-slate-950/90 p-5 text-slate-100 shadow-xl space-y-4"
      dir="rtl"
      data-testid="stage64-urban-mobility-subpanel"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-indigo-500/20 px-2.5 py-0.5 text-xs font-bold text-indigo-300 border border-indigo-500/40">
              RT-UI-URBAN-MOBILITY-TRAVEL-001
            </span>
            <span className="text-xs text-slate-400">
              مرحله ۶۴: نظام تحلیل حمل‌ونقل شهری، الگوهای سفر، جابه‌جایی و یکپارچگی شبکه تحرک
            </span>
          </div>
          <h3 className="mt-1 text-base font-bold text-white">
            تحلیل چندوجهی دسترسی، سرفاصله واقعی، جریان تجمیعی مبدأ ـ مقصد، گره‌های تبادل و تاب‌آوری تحرک
          </h3>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            بخش‌ها: {STAGE64_SECTIONS_17.length}
          </span>
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            لایه‌ها: {STAGE64_MAP_LAYERS_12.length}
          </span>
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            آزمون پذیرش: {STAGE64_ACCEPTANCE_TESTS_30.length}
          </span>
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            رویداد UX: {STAGE64_UX_EVENTS_16.length}
          </span>
        </div>
      </header>

      <div
        className="rounded-xl border border-indigo-500/30 bg-indigo-950/20 px-3 py-2 text-xs text-indigo-200"
        data-testid="stage64-status-banner"
      >
        {bannerFa}
      </div>

      <nav className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4" aria-label="تب‌های مرحله ۶۴">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              data-testid={`stage64-tab-${tab.id}`}
              className={`flex flex-col items-start justify-between rounded-xl border p-3 text-right transition cursor-pointer ${
                isActive
                  ? 'border-indigo-500/60 bg-indigo-950/30 text-white shadow-sm'
                  : 'border-slate-800 bg-slate-900/60 text-slate-300 hover:border-slate-700'
              }`}
            >
              <span className="text-xs font-bold leading-5">{tab.labelFa}</span>
              <span className="mt-1.5 rounded bg-slate-950/80 px-2 py-0.5 text-[10px] font-mono text-indigo-300">
                {tab.badgeFa}
              </span>
            </button>
          );
        })}
      </nav>

      {(activeTab === 'overview_and_network' || activeTab === 'transit_and_multimodal') && (
        <Stage64NetworkTransitMultimodalPanel
          section={activeTab}
          profiles={INITIAL_STAGE64_PROFILES}
          selectedZoneId={selectedZoneId}
          onSelectZoneId={setSelectedZoneId}
          onFeedbackFa={setBannerFa}
        />
      )}

      {(activeTab === 'od_parking_freight_and_valuation' || activeTab === 'scenarios_uimob_and_stage65') && (
        <Stage64AccessPrivacyScenarioStage65Panel
          section={activeTab}
          profile={selectedProfile}
          onFeedbackFa={setBannerFa}
        />
      )}
    </section>
  );
};
