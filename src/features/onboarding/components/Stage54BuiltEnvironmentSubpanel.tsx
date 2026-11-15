/** @file src/features/onboarding/components/Stage54BuiltEnvironmentSubpanel.tsx — Stage 54 Main Subpanel */
import React, { useState } from 'react';
import { Stage54BuildingIdentityAndChangesPanel } from './Stage54BuildingIdentityAndChangesPanel';
import { Stage54FabricValuationPrivacyAndStage55Panel } from './Stage54FabricValuationPrivacyAndStage55Panel';
import { INITIAL_STAGE54_BUILDINGS, INITIAL_STAGE54_CHANGES } from '../services/stage54BuiltEnvironmentFixtures';
import {
  STAGE54_BE_COMPONENT_IDS_50,
  STAGE54_BOUNDARIES_7,
  STAGE54_UI_BE_TASK_IDS_46,
  STAGE54_UX_EVENTS_19,
} from '../services/builtEnvironmentTypes';

type Stage54TabId =
  | 'identity_parcels_units_age_height'
  | 'changes_demolition_and_ai'
  | 'fabric_density_and_valuation'
  | 'quality_privacy_and_stage55';

export const Stage54BuiltEnvironmentSubpanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Stage54TabId>('identity_parcels_units_age_height');
  const [bannerFa, setBannerFa] = useState<string>(
    'مرکز رصد ساختمان‌ها و بافت کالبدی: تفکیک ساختمان از قطعه و آگهی، شفافیت ارتفاع/سن، پایش تغییرات و پیش‌نمایش مرحله ۵۵.',
  );

  const tabs: Array<{ id: Stage54TabId; labelFa: string; badgeFa: string }> = [
    {
      id: 'identity_parcels_units_age_height',
      labelFa: '۱. شناسنامه، موجودیت‌ها، ارتفاع و سن بنا',
      badgeFa: 'BE-01..BE-20',
    },
    {
      id: 'changes_demolition_and_ai',
      labelFa: '۲. پایش تغییرات، تخریب و کنترل AI',
      badgeFa: 'BE-21..BE-30',
    },
    {
      id: 'fabric_density_and_valuation',
      labelFa: '۳. تحلیل بافت، مخرج تراکم و اتصال ۲۰',
      badgeFa: 'BE-31..BE-40',
    },
    {
      id: 'quality_privacy_and_stage55',
      labelFa: '۴. کیفیت ۴بخشی، حریم خصوصی و پیش‌نمایش ۵۵',
      badgeFa: 'BE-41..BE-50',
    },
  ];

  return (
    <section
      className="rounded-2xl border border-amber-500/30 bg-slate-950/90 p-5 text-slate-100 shadow-xl space-y-4"
      dir="rtl"
      data-testid="stage54-built-environment-subpanel"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-amber-500/20 px-2.5 py-0.5 text-xs font-bold text-amber-300 border border-amber-500/40">
              RT-UI-BUILT-ENVIRONMENT-MONITORING-001
            </span>
            <span className="text-xs text-slate-400">
              مرحله ۵۴: نظام رصد ساختمان‌ها، بافت کالبدی و تغییرات ساخت‌وساز شهری
            </span>
          </div>
          <h3 className="mt-1 text-base font-bold text-white">
            شناسنامه کالبدی ساختمان، تفکیک قطعه/واحد/پرونده، تحلیل تراکم بافت و کنترل تشخیص خودکار تغییرات
          </h3>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            مرزها: {STAGE54_BOUNDARIES_7.length}
          </span>
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            کامپوننت‌ها: {STAGE54_BE_COMPONENT_IDS_50.length}
          </span>
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            رویداد UX: {STAGE54_UX_EVENTS_19.length}
          </span>
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            وظایف اجرا: {STAGE54_UI_BE_TASK_IDS_46.length}
          </span>
        </div>
      </header>

      <div
        className="rounded-xl border border-amber-500/30 bg-amber-950/20 px-3 py-2 text-xs text-amber-200"
        data-testid="stage54-status-banner"
      >
        {bannerFa}
      </div>

      <nav className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4" aria-label="تب‌های مرحله ۵۴">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              data-testid={`stage54-tab-${tab.id}`}
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

      {(activeTab === 'identity_parcels_units_age_height' || activeTab === 'changes_demolition_and_ai') && (
        <Stage54BuildingIdentityAndChangesPanel
          section={activeTab}
          buildings={INITIAL_STAGE54_BUILDINGS}
          changes={INITIAL_STAGE54_CHANGES}
          onFeedbackFa={setBannerFa}
        />
      )}

      {(activeTab === 'fabric_density_and_valuation' || activeTab === 'quality_privacy_and_stage55') && (
        <Stage54FabricValuationPrivacyAndStage55Panel
          section={activeTab}
          building={INITIAL_STAGE54_BUILDINGS[0]}
          onFeedbackFa={setBannerFa}
        />
      )}
    </section>
  );
};
