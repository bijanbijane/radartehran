/** @file src/features/onboarding/components/Stage82UrbanRegenerationSubpanel.tsx — Stage 82 Main Subpanel */
import React, { useState } from 'react';
import { Stage82AtlasInefficiencyFabricPanel } from './Stage82AtlasInefficiencyFabricPanel';
import { Stage82InterventionFeasibilityDisplacementStage83Panel } from './Stage82InterventionFeasibilityDisplacementStage83Panel';
import { INITIAL_STAGE82_REGENERATION_PROFILES } from '../services/stage82UrbanRegenerationFixtures';
import {
  STAGE82_ACCEPTANCE_TESTS_65,
  STAGE82_ATLAS_LAYERS_12,
  STAGE82_KPI_CARDS_14,
  STAGE82_REPORT_TYPES_18,
} from '../services/urbanRegenerationStage82Types';

type Stage82TabId =
  | 'overview_five_entities_atlas'
  | 'inefficiency_decay_dysfunction'
  | 'matrix_feasibility_displacement'
  | 'did_privacy_reports_stage83';

export const Stage82UrbanRegenerationSubpanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Stage82TabId>('overview_five_entities_atlas');
  const [selectedZoneId, setSelectedZoneId] = useState<string>(
    INITIAL_STAGE82_REGENERATION_PROFILES[0].zoneId,
  );
  const [bannerFa, setBannerFa] = useState<string>(
    'فرسودگی ساختمان ≠ ناکارآمدی شهری؛ ۵ موجودیت مستقل بازآفرینی؛ پایش اجباری ریسک جابه‌جایی ساکنان؛ منافع غیرمالی به اجبار پولی نمی‌شوند.',
  );

  const selectedProfile =
    INITIAL_STAGE82_REGENERATION_PROFILES.find((p) => p.zoneId === selectedZoneId) ??
    INITIAL_STAGE82_REGENERATION_PROFILES[0];

  const tabs: Array<{ id: Stage82TabId; labelFa: string; badgeFa: string }> = [
    {
      id: 'overview_five_entities_atlas',
      labelFa: '۱. داشبورد بازآفرینی، ۵ موجودیت و اطلس ۱۲لایه',
      badgeFa: '۱۴ KPI + ۱۲ فیلتر',
    },
    {
      id: 'inefficiency_decay_dysfunction',
      labelFa: '۲. شاخص ناکارآمدی تفکیکی و فرسودگی ≠ ناکارآمدی',
      badgeFa: 'وزن‌دهی شفاف',
    },
    {
      id: 'matrix_feasibility_displacement',
      labelFa: '۳. ماتریس اولویت ۲×۲، توجیه اجتماعی و جابه‌جایی',
      badgeFa: 'پایش اجتماعی',
    },
    {
      id: 'did_privacy_reports_stage83',
      labelFa: '۴. ارزیابی قبل/بعد (DiD)، UI-REG82 و مرحله ۸۳',
      badgeFa: 'UI-REG82-001..065',
    },
  ];

  return (
    <section
      className="rounded-2xl border border-fuchsia-500/30 bg-slate-950/90 p-5 text-slate-100 shadow-xl space-y-4"
      dir="rtl"
      data-testid="stage82-urban-regeneration-subpanel"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-fuchsia-500/20 px-2.5 py-0.5 text-[11px] font-bold text-fuchsia-300 border border-fuchsia-500/40 break-words">
              RT-UI-URBAN-DEVELOPMENT-REGENERATION-NEIGHBORHOOD-RENEWAL-001
            </span>
            <span className="text-xs text-slate-400">
              مرحله ۸۲: توسعه شهری، بازآفرینی بافت‌ها، نوسازی محله‌ها و ارزیابی اجتماعی
            </span>
          </div>
          <h3 className="mt-1 text-base font-bold text-white">
            تحلیل سه‌مقیاسی (ساختمان، بلوک، محله)، مداخلات متناسب، ماتریس اولویت ۲×۲ و حفاظت از ساکنان
          </h3>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            شاخص KPI: {STAGE82_KPI_CARDS_14.length}
          </span>
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            لایه اطلس: {STAGE82_ATLAS_LAYERS_12.length}
          </span>
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            گزارش‌ها: {STAGE82_REPORT_TYPES_18.length}
          </span>
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            آزمون پذیرش: {STAGE82_ACCEPTANCE_TESTS_65.length}
          </span>
        </div>
      </header>

      <div
        className="rounded-xl border border-fuchsia-500/30 bg-fuchsia-950/20 px-3 py-2 text-xs text-fuchsia-200"
        data-testid="stage82-status-banner"
      >
        {bannerFa}
      </div>

      <nav className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4" aria-label="تب‌های مرحله ۸۲">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              data-testid={`stage82-tab-${tab.id}`}
              className={`flex flex-col items-start justify-between rounded-xl border p-3 text-right transition cursor-pointer ${
                isActive
                  ? 'border-fuchsia-500/60 bg-fuchsia-950/30 text-white shadow-sm'
                  : 'border-slate-800 bg-slate-900/60 text-slate-300 hover:border-slate-700'
              }`}
            >
              <span className="text-xs font-bold leading-5">{tab.labelFa}</span>
              <span className="mt-1.5 rounded bg-slate-950/80 px-2 py-0.5 text-[10px] font-mono text-fuchsia-300">
                {tab.badgeFa}
              </span>
            </button>
          );
        })}
      </nav>

      {(activeTab === 'overview_five_entities_atlas' || activeTab === 'inefficiency_decay_dysfunction') && (
        <Stage82AtlasInefficiencyFabricPanel
          section={activeTab}
          profiles={INITIAL_STAGE82_REGENERATION_PROFILES}
          selectedZoneId={selectedZoneId}
          onSelectZoneId={setSelectedZoneId}
          onFeedbackFa={setBannerFa}
        />
      )}

      {(activeTab === 'matrix_feasibility_displacement' || activeTab === 'did_privacy_reports_stage83') && (
        <Stage82InterventionFeasibilityDisplacementStage83Panel
          section={activeTab}
          profile={selectedProfile}
          onFeedbackFa={setBannerFa}
        />
      )}
    </section>
  );
};
