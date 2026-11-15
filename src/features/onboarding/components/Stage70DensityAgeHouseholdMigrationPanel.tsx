/** @file src/features/onboarding/components/Stage70DensityAgeHouseholdMigrationPanel.tsx — Stage 70 Tabs 1 & 2 Panel */
import React, { useState } from 'react';
import { evaluateDensityChangeHouseholdAndMigration } from '../services/demographicAnalysisStage70Engine';
import {
  STAGE70_AGE_GROUPS_8,
  STAGE70_DOMAINS_20,
  STAGE70_FILTER_FIELDS_19,
  STAGE70_KPI_CARDS_8,
  STAGE70_TOOLBAR_ACTIONS_6,
  type Stage70DemographicZoneProfile,
} from '../services/demographicAnalysisStage70Types';

interface Props {
  section: 'overview_density_years' | 'age_household_change_migration';
  profiles: ReadonlyArray<Stage70DemographicZoneProfile>;
  selectedZoneId: string;
  onSelectZoneId: (id: string) => void;
  onFeedbackFa: (message: string) => void;
}

export const Stage70DensityAgeHouseholdMigrationPanel: React.FC<Props> = ({
  section,
  profiles,
  selectedZoneId,
  onSelectZoneId,
  onFeedbackFa,
}) => {
  const [mismatchedYears, setMismatchedYears] = useState<boolean>(false);
  const [suppressMicroMigration, setSuppressMicroMigration] = useState<boolean>(true);

  const profile = profiles.find((p) => p.zoneId === selectedZoneId) ?? profiles[0];
  if (!profile) return null;

  const guard = evaluateDensityChangeHouseholdAndMigration(profile, mismatchedYears, suppressMicroMigration);

  if (section === 'overview_density_years') {
    return (
      <div className="space-y-4 text-xs" data-testid="stage70-overview-density-panel">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
          <div className="flex flex-wrap gap-2">
            {profiles.map((p) => (
              <button
                key={p.zoneId}
                type="button"
                onClick={() => {
                  onSelectZoneId(p.zoneId);
                  onFeedbackFa(`محدوده «${p.zoneNameFa}» (${p.districtFa}) با حفظ سال آماری و فیلترهای ۱۹گانه انتخاب شد.`);
                }}
                className={`rounded-lg border px-3 py-1.5 cursor-pointer ${
                  p.zoneId === profile.zoneId
                    ? 'border-cyan-400 bg-cyan-500/20 text-cyan-200 font-bold'
                    : 'border-slate-700 bg-slate-950 text-slate-300'
                }`}
              >
                {p.zoneNameFa}
              </button>
            ))}
          </div>

          <label className="flex items-center gap-2 cursor-pointer text-slate-300">
            <input
              type="checkbox"
              checked={mismatchedYears}
              onChange={(e) => setMismatchedYears(e.target.checked)}
            />
            <span>شبیه‌سازی هشدار ناسازگاری سال آماری</span>
          </label>
        </div>

        <div className="rounded-lg border border-cyan-500/30 bg-cyan-950/20 p-3 space-y-1.5 text-cyan-100">
          <div className="font-bold text-cyan-300">تراکم ناخالص ≠ تراکم خالص | سال مرجع ≠ سال انتشار</div>
          <p>{guard.grossVsNetDensityAndReferenceYearGuardFa}</p>
          <p className="text-[11px] text-slate-400">
            وضعیت: {profile.dataStatusFa} • منبع: {profile.dataSourceFa} • اطمینان: {profile.confidenceLevelFa}
          </p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 space-y-1.5">
          <div className="font-bold text-cyan-300">
            ۲۰ حوزه جمعیتی، ۸ کارت شاخص، ۶ ابزار، ۸ گروه سنی و ۱۹ فیلتر مشترک
          </div>
          <div className="text-[11px] text-slate-300">
            ۸ گروه سنی: {STAGE70_AGE_GROUPS_8.join(' • ')}
          </div>
          <div className="text-[11px] text-slate-400">
            ۸ کارت KPI: {STAGE70_KPI_CARDS_8.map((k) => `${k.titleFa} (${k.unitFa})`).join(' • ')}
          </div>
          <div className="text-[11px] text-slate-400">
            ۶ ابزار: {STAGE70_TOOLBAR_ACTIONS_6.join(' • ')} | ۱۹ فیلتر: {STAGE70_FILTER_FIELDS_19.join(' • ')}
          </div>
          <div className="text-[11px] text-slate-400">
            ۲۰ حوزه: {STAGE70_DOMAINS_20.map((d) => `${d.id}.${d.titleFa}`).join(' • ')}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 text-xs" data-testid="stage70-age-household-migration-panel">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
        <span className="font-bold text-cyan-300">تغییرات مطلق/درصدی، ساختار خانوار، بازار کار و مهاجرت تجمیعی</span>
        <label className="flex items-center gap-2 cursor-pointer text-slate-300">
          <input
            type="checkbox"
            checked={suppressMicroMigration}
            onChange={(e) => setSuppressMicroMigration(e.target.checked)}
          />
          <span>تجمیع مهاجرت و منع تعمیم به قطعه/خانوار</span>
        </label>
      </div>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 space-y-1.5">
          <div className="font-bold text-emerald-300">تغییر مطلق/درصدی + CAGR و تفکیک نرخ بیکاری</div>
          <p className="text-slate-200">{guard.absVsPctChangeCagrAndLaborGuardFa}</p>
        </div>

        <div className="rounded-lg border border-sky-500/30 bg-sky-950/20 p-3 space-y-1.5 text-sky-200">
          <div className="font-bold text-sky-300">ساختار خانوار در برابر مسکن و محرمانگی جریان مهاجرت</div>
          <p>{guard.householdHousingAndMigrationPrivacyGuardFa}</p>
        </div>
      </div>
    </div>
  );
};
