/** @file src/features/onboarding/components/Stage81UrbanLandMarketSubpanel.tsx — Stage 81 Main Subpanel */
import React, { useState } from 'react';
import { Stage81LandIndexParcelUseCapacityPanel } from './Stage81LandIndexParcelUseCapacityPanel';
import { Stage81VacantResidualInfraPrivacyStage82Panel } from './Stage81VacantResidualInfraPrivacyStage82Panel';
import { INITIAL_STAGE81_LAND_PROFILES } from '../services/stage81UrbanLandFixtures';
import {
  STAGE81_ACCEPTANCE_TESTS_60,
  STAGE81_ATLAS_LAYERS_15,
  STAGE81_KPI_CARDS_16,
  STAGE81_REPORT_TYPES_18,
} from '../services/urbanLandMarketStage81Types';

type Stage81TabId =
  | 'overview_entities_atlas'
  | 'use_capacity_areas'
  | 'vacant_sl_rlv'
  | 'infra_privacy_reports_stage82';

export const Stage81UrbanLandMarketSubpanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Stage81TabId>('overview_entities_atlas');
  const [selectedParcelId, setSelectedParcelId] = useState<string>(
    INITIAL_STAGE81_LAND_PROFILES[0].parcelId,
  );
  const [bannerFa, setBannerFa] = useState<string>(
    'قطعه زمین ≠ کاربری ≠ مالکیت ≠ ارزش اقتصادی؛ تفکیک فرضی ≠ ثبتی؛ پارکینگ/کارگاه ≠ زمین بایر؛ مدل‌های سه‌بعدی مرجع رسمی ثبتی نیستند.',
  );

  const selectedProfile =
    INITIAL_STAGE81_LAND_PROFILES.find((p) => p.parcelId === selectedParcelId) ??
    INITIAL_STAGE81_LAND_PROFILES[0];

  const tabs: Array<{ id: Stage81TabId; labelFa: string; badgeFa: string }> = [
    {
      id: 'overview_entities_atlas',
      labelFa: '۱. اطلس ۱۵لایه، ۴ موجودیت و ۳ مبنای قیمت زمین',
      badgeFa: '۱۶ KPI + ۱۴ فیلتر',
    },
    {
      id: 'use_capacity_areas',
      labelFa: '۲. کاربری سه‌سطحی، ظرفیت قانونی و مساحت سندی',
      badgeFa: 'تفکیک فرضی ≠ ثبتی',
    },
    {
      id: 'vacant_sl_rlv',
      labelFa: '۳. اراضی بایر/کم‌استفاده، سهم زمین (SL) و RLV',
      badgeFa: 'RLV = GDV − Cd..',
    },
    {
      id: 'infra_privacy_reports_stage82',
      labelFa: '۴. زیرساخت (علیت ≠ همبستگی)، PII، UI-LND81 و ۸۲',
      badgeFa: 'UI-LND81-001..060',
    },
  ];

  return (
    <section
      className="rounded-2xl border border-lime-500/30 bg-slate-950/90 p-5 text-slate-100 shadow-xl space-y-4"
      dir="rtl"
      data-testid="stage81-urban-land-market-subpanel"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-lime-500/20 px-2.5 py-0.5 text-[11px] font-bold text-lime-300 border border-lime-500/40 break-words">
              RT-UI-URBAN-LAND-MARKET-LAND-ECONOMICS-OWNERSHIP-LAND-USE-001
            </span>
            <span className="text-xs text-slate-400">
              مرحله ۸۱: بازار زمین شهری، اقتصاد زمین، مالکیت و پویایی کاربری
            </span>
          </div>
          <h3 className="mt-1 text-base font-bold text-white">
            تفکیک ۴ موجودیت مستقل زمین، ارزش باقیمانده (RLV)، سهم زمین (SL)، اراضی بایر و حفاظت PII مالک
          </h3>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            شاخص KPI: {STAGE81_KPI_CARDS_16.length}
          </span>
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            لایه اطلس: {STAGE81_ATLAS_LAYERS_15.length}
          </span>
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            گزارش‌ها: {STAGE81_REPORT_TYPES_18.length}
          </span>
          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-slate-300 border border-slate-800">
            آزمون پذیرش: {STAGE81_ACCEPTANCE_TESTS_60.length}
          </span>
        </div>
      </header>

      <div
        className="rounded-xl border border-lime-500/30 bg-lime-950/20 px-3 py-2 text-xs text-lime-200"
        data-testid="stage81-status-banner"
      >
        {bannerFa}
      </div>

      <nav className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4" aria-label="تب‌های مرحله ۸۱">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              data-testid={`stage81-tab-${tab.id}`}
              className={`flex flex-col items-start justify-between rounded-xl border p-3 text-right transition cursor-pointer ${
                isActive
                  ? 'border-lime-500/60 bg-lime-950/30 text-white shadow-sm'
                  : 'border-slate-800 bg-slate-900/60 text-slate-300 hover:border-slate-700'
              }`}
            >
              <span className="text-xs font-bold leading-5">{tab.labelFa}</span>
              <span className="mt-1.5 rounded bg-slate-950/80 px-2 py-0.5 text-[10px] font-mono text-lime-300">
                {tab.badgeFa}
              </span>
            </button>
          );
        })}
      </nav>

      {(activeTab === 'overview_entities_atlas' || activeTab === 'use_capacity_areas') && (
        <Stage81LandIndexParcelUseCapacityPanel
          section={activeTab}
          profiles={INITIAL_STAGE81_LAND_PROFILES}
          selectedParcelId={selectedParcelId}
          onSelectParcelId={setSelectedParcelId}
          onFeedbackFa={setBannerFa}
        />
      )}

      {(activeTab === 'vacant_sl_rlv' || activeTab === 'infra_privacy_reports_stage82') && (
        <Stage81VacantResidualInfraPrivacyStage82Panel
          section={activeTab}
          profile={selectedProfile}
          onFeedbackFa={setBannerFa}
        />
      )}
    </section>
  );
};
