/** @file src/features/onboarding/components/Stage82AtlasInefficiencyFabricPanel.tsx — Stage 82 Tabs 1 & 2 Panel */
import React, { useState } from 'react';
import { evaluateAtlasAndInefficiencyBreakdown } from '../services/urbanRegenerationStage82Engine';
import {
  STAGE82_ATLAS_LAYERS_12,
  STAGE82_FILTERS_12,
  STAGE82_KPI_CARDS_14,
  STAGE82_SECTIONS_26,
  type Stage82RegenerationZoneProfile,
} from '../services/urbanRegenerationStage82Types';

interface Props {
  section: 'overview_five_entities_atlas' | 'inefficiency_decay_dysfunction';
  profiles: ReadonlyArray<Stage82RegenerationZoneProfile>;
  selectedZoneId: string;
  onSelectZoneId: (id: string) => void;
  onFeedbackFa: (message: string) => void;
}

export const Stage82AtlasInefficiencyFabricPanel: React.FC<Props> = ({
  section,
  profiles,
  selectedZoneId,
  onSelectZoneId,
  onFeedbackFa,
}) => {
  const [weightingBasisFa, setWeightingBasisFa] = useState<
    'نظر کارشناسی' | 'روش آماری' | 'سیاست مصوب' | 'ترکیب چند روش'
  >('ترکیب چند روش');

  const profile = profiles.find((p) => p.zoneId === selectedZoneId) ?? profiles[0];
  if (!profile) return null;

  const result = evaluateAtlasAndInefficiencyBreakdown(profile, weightingBasisFa);

  if (section === 'overview_five_entities_atlas') {
    return (
      <div className="space-y-4 text-xs" data-testid="stage82-overview-atlas-panel">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
          <div className="flex flex-wrap gap-2">
            {profiles.map((p) => (
              <button
                key={p.zoneId}
                type="button"
                onClick={() => {
                  onSelectZoneId(p.zoneId);
                  onFeedbackFa(`محدوده «${p.zoneNameFa}» (${p.districtFa}) انتخاب شد.`);
                }}
                className={`rounded-lg border px-3 py-1.5 cursor-pointer ${
                  p.zoneId === profile.zoneId
                    ? 'border-fuchsia-400 bg-fuchsia-500/20 text-fuchsia-200 font-bold'
                    : 'border-slate-700 bg-slate-950 text-slate-300'
                }`}
              >
                {p.zoneNameFa}
              </button>
            ))}
          </div>
          <span className="text-[11px] text-slate-400">
            مساحت: {profile.areaHectares} هکتار • بلوک: {profile.blockCount} • بنا: {profile.buildingCount}
          </span>
        </div>

        <div className="rounded-lg border border-fuchsia-500/30 bg-fuchsia-950/20 p-3 space-y-1 text-fuchsia-100">
          <div className="font-bold text-fuchsia-300">
            تفکیک ۵ موجودیت مستقل (محدوده ≠ وضعیت پایه ≠ برنامه ≠ پروژه ≠ نتیجه)
          </div>
          <p>{result.fiveEntitiesAndLifecycleGuardFa}</p>
          <p className="text-[11px] text-slate-400">منبع: {profile.dataSourceFa}</p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 space-y-1.5">
          <div className="font-bold text-fuchsia-300">
            ۲۶ بخش، ۱۴ کارت KPI، ۱۲ لایه اطلس و ۱۲ فیلتر
          </div>
          <div className="text-[11px] text-slate-300">
            ۱۴ KPI: {STAGE82_KPI_CARDS_14.map((k) => `${k.titleFa} (${k.unitFa})`).join(' • ')}
          </div>
          <div className="text-[11px] text-slate-400">
            ۱۲ لایه: {STAGE82_ATLAS_LAYERS_12.join(' • ')}
          </div>
          <div className="text-[11px] text-slate-400">
            ۱۲ فیلتر: {STAGE82_FILTERS_12.join(' • ')} | ۲۶ بخش: {STAGE82_SECTIONS_26.join(' • ')}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 text-xs" data-testid="stage82-inefficiency-decay-panel">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
        <label className="flex items-center gap-2 text-slate-300">
          <span>مبنای شفاف وزن‌دهی شاخص ناکارآمدی:</span>
          <select
            value={weightingBasisFa}
            onChange={(e) =>
              setWeightingBasisFa(
                e.target.value as 'نظر کارشناسی' | 'روش آماری' | 'سیاست مصوب' | 'ترکیب چند روش',
              )
            }
            className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100"
          >
            <option value="ترکیب چند روش">ترکیب چند روش</option>
            <option value="نظر کارشناسی">نظر کارشناسی</option>
            <option value="روش آماری">روش آماری</option>
            <option value="سیاست مصوب">سیاست مصوب</option>
          </select>
        </label>
        <span className="text-[11px] text-slate-400">
          عدم قطعیت: ±{profile.uncertaintyPct}%
        </span>
      </div>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <div className="rounded-lg border border-fuchsia-500/30 bg-fuchsia-950/20 p-3 space-y-1 text-fuchsia-100">
          <div className="font-bold text-fuchsia-300">شاخص ناکارآمدی همراه نمای تفکیکی ابعاد</div>
          <p>{result.compositeVsDisaggregatedBreakdownFa}</p>
        </div>
        <div className="rounded-lg border border-sky-500/30 bg-sky-950/20 p-3 space-y-1 text-sky-100">
          <div className="font-bold text-sky-300">فرسودگی ≠ ناکارآمدی شهری و تشخیص مداخله متناسب</div>
          <p>{result.decayVsDysfunctionAndDiagnosticGuardFa}</p>
        </div>
      </div>
    </div>
  );
};
