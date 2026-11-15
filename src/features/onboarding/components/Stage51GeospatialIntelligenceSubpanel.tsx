/** @file src/features/onboarding/components/Stage51GeospatialIntelligenceSubpanel.tsx — Stage 51 Main Subpanel */
import React, { useState } from 'react';
import { Stage51AccessProximityAndDensityPanel } from './Stage51AccessProximityAndDensityPanel';
import { Stage51ClustersMultiCriteriaAndGovernancePanel } from './Stage51ClustersMultiCriteriaAndGovernancePanel';
import {
  INITIAL_STAGE51_DESTINATIONS,
  INITIAL_STAGE51_GRID_CELLS,
  INITIAL_STAGE51_SAVED_ARTIFACTS,
} from '../services/stage51GeospatialFixtures';
import {
  STAGE51_BOUNDARIES_8,
  STAGE51_FORBIDDEN_ERRORS_20,
  STAGE51_GI_COMPONENT_IDS_50,
  STAGE51_UI_GI_TASKS_40,
  STAGE51_UX_EVENTS_19,
  type SavedSpatialArtifactRecord,
} from '../services/geospatialIntelligenceTypes';

type Stage51TabId =
  | 'access_proximity_and_coverage'
  | 'density_grid_and_landuse'
  | 'multicriteria_temporal_and_urban'
  | 'versioning_privacy_and_stage52';

export const Stage51GeospatialIntelligenceSubpanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Stage51TabId>('access_proximity_and_coverage');
  const [artifacts, setArtifacts] = useState<SavedSpatialArtifactRecord[]>(
    INITIAL_STAGE51_SAVED_ARTIFACTS,
  );
  const [bannerFa, setBannerFa] = useState<string>(
    'مرکز تحلیل‌های مکانی پیشرفته با تفکیک فاصله مستقیم از دسترسی شبکه‌ای، خوشه بصری از آماری و دقت مکانی از اطمینان تحلیلی.',
  );

  const tabs: Array<{ id: Stage51TabId; labelFa: string; badgeFa: string }> = [
    {
      id: 'access_proximity_and_coverage',
      labelFa: '۱. فاصله مستقیم در برابر مسیر شبکه و پوشش خدمات',
      badgeFa: 'GI-01..GI-15',
    },
    {
      id: 'density_grid_and_landuse',
      labelFa: '۲. تراکم، خوشه‌بندی، خودهمبستگی و شبکه درون‌محله‌ای',
      badgeFa: 'GI-16..GI-24',
    },
    {
      id: 'multicriteria_temporal_and_urban',
      labelFa: '۳. تحلیل چندمعیاره مکانی، تغییرات زمانی و نشانه‌های تحول',
      badgeFa: 'GI-25..GI-30',
    },
    {
      id: 'versioning_privacy_and_stage52',
      labelFa: '۴. نسخه‌بندی تحلیل، حریم خصوصی مکانی و پیش‌نمایش مرحله ۵۲',
      badgeFa: 'GI-31..GI-50',
    },
  ];

  return (
    <section
      className="rounded-2xl border border-teal-500/30 bg-slate-950/90 p-5 text-slate-100 shadow-xl space-y-4"
      dir="rtl"
      data-testid="stage51-geospatial-intelligence-subpanel"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-teal-500/20 px-2.5 py-0.5 text-xs font-bold text-teal-300 border border-teal-500/40">
              RT-UI-GEOSPATIAL-INTELLIGENCE-001
            </span>
            <span className="text-xs text-slate-400">
              مرحله ۵۱: تحلیل‌های مکانی پیشرفته، روابط فضایی و هوشمندی جغرافیایی
            </span>
          </div>
          <h3 className="mt-1 text-base font-bold text-white">
            مرکز تحلیل دسترسی شبکه‌ای، تراکم، خوشه‌های فضایی، تفاوت‌های درون‌محله‌ای و ارزیابی چندمعیاره مکانی
          </h3>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            مرزهای مرحله: {STAGE51_BOUNDARIES_8.length}
          </span>
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            کامپوننت‌ها: {STAGE51_GI_COMPONENT_IDS_50.length}
          </span>
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            رویداد UX: {STAGE51_UX_EVENTS_19.length}
          </span>
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            تسک/تست/خطای ممنوع: {STAGE51_UI_GI_TASKS_40.length} / 24 / {STAGE51_FORBIDDEN_ERRORS_20.length}
          </span>
        </div>
      </header>

      <div
        className="rounded-xl border border-teal-500/30 bg-teal-950/20 px-3 py-2 text-xs text-teal-200"
        data-testid="stage51-status-banner"
      >
        {bannerFa}
      </div>

      <nav className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4" aria-label="تب‌های مرحله ۵۱">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              data-testid={`stage51-tab-${tab.id}`}
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

      {(activeTab === 'access_proximity_and_coverage' || activeTab === 'density_grid_and_landuse') && (
        <Stage51AccessProximityAndDensityPanel
          section={activeTab}
          destinations={INITIAL_STAGE51_DESTINATIONS}
          gridCells={INITIAL_STAGE51_GRID_CELLS}
          onFeedbackFa={setBannerFa}
        />
      )}

      {(activeTab === 'multicriteria_temporal_and_urban' ||
        activeTab === 'versioning_privacy_and_stage52') && (
        <Stage51ClustersMultiCriteriaAndGovernancePanel
          section={activeTab}
          artifacts={artifacts}
          onUpdateArtifact={(next) =>
            setArtifacts((prev) => prev.map((a) => (a.artifactId === next.artifactId ? next : a)))
          }
          onFeedbackFa={setBannerFa}
        />
      )}
    </section>
  );
};
