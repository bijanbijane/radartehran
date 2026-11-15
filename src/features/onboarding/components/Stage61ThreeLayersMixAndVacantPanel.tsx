/** @file src/features/onboarding/components/Stage61ThreeLayersMixAndVacantPanel.tsx — Stage 61 Tabs 1 & 2 Panel */
import React, { useState } from 'react';
import {
  evaluateMixCompatibilityVacantAndValuationGuards,
  evaluateThreeLayerSeparationAndConflictGuard,
} from '../services/urbanLandUseEngine';
import {
  STAGE61_CATEGORIES_17,
  STAGE61_MAP_LAYERS_14,
  STAGE61_SECTIONS_16,
  type ParcelLandUseProfile,
} from '../services/urbanLandUseTypes';

interface Props {
  section: 'three_layers_and_classification' | 'mix_compatibility_and_vacant';
  profiles: ReadonlyArray<ParcelLandUseProfile>;
  selectedZoneId: string;
  onSelectZoneId: (id: string) => void;
  onFeedbackFa: (message: string) => void;
}

export const Stage61ThreeLayersMixAndVacantPanel: React.FC<Props> = ({
  section,
  profiles,
  selectedZoneId,
  onSelectZoneId,
  onFeedbackFa,
}) => {
  const [attemptViolationVerdict, setAttemptViolationVerdict] = useState<boolean>(true);
  const [attemptCombineColorConf, setAttemptCombineColorConf] = useState<boolean>(true);
  const [publicPrivacyMode, setPublicPrivacyMode] = useState<boolean>(true);

  const profile = profiles.find((p) => p.zoneId === selectedZoneId) ?? profiles[0];
  if (!profile) return null;

  const threeLayerGuard = evaluateThreeLayerSeparationAndConflictGuard(
    profile,
    attemptViolationVerdict,
    attemptCombineColorConf,
  );
  const mixVacantGuard = evaluateMixCompatibilityVacantAndValuationGuards(
    profile,
    publicPrivacyMode,
    true,
  );

  if (section === 'three_layers_and_classification') {
    return (
      <div className="space-y-4 text-xs" data-testid="stage61-three-layers-panel">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
          <div className="flex flex-wrap gap-2">
            {profiles.map((p) => (
              <button
                key={p.zoneId}
                type="button"
                onClick={() => {
                  onSelectZoneId(p.zoneId);
                  onFeedbackFa(`قطعه/محدوده «${p.parcelNameFa}» برای مقایسه سه‌لایه کاربری انتخاب شد.`);
                }}
                className={`rounded-lg border px-3 py-1.5 cursor-pointer ${
                  p.zoneId === profile.zoneId
                    ? 'border-cyan-400 bg-cyan-500/20 text-cyan-200 font-bold'
                    : 'border-slate-700 bg-slate-950 text-slate-300'
                }`}
              >
                {p.parcelNameFa}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-3 text-slate-300">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={attemptViolationVerdict}
                onChange={(e) => setAttemptViolationVerdict(e.target.checked)}
              />
              <span>آزمون صدور برچسب تخلف</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={attemptCombineColorConf}
                onChange={(e) => setAttemptCombineColorConf(e.target.checked)}
              />
              <span>آزمون ادغام رنگ و اعتبار</span>
            </label>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 space-y-1" data-testid="stage61-three-layers-text">
            <div className="font-bold text-cyan-300">تفکیک مصوب، ثبت‌شده و استفاده واقعی مشاهده‌شده</div>
            <p className="text-slate-200">{threeLayerGuard.threeLayersComparisonFa}</p>
            <p className="text-[11px] text-amber-300">{threeLayerGuard.registeredConflictAndLegalGuardFa}</p>
          </div>
          <div
            className={`rounded-lg border p-3 space-y-1 ${
              attemptViolationVerdict
                ? 'border-rose-500/40 bg-rose-950/25 text-rose-200'
                : 'border-emerald-500/30 bg-emerald-950/20 text-emerald-200'
            }`}
            data-testid="stage61-violation-guard"
          >
            <div className="font-bold">کنترل برچسب حقوقی و تفکیک بصری</div>
            <p>{threeLayerGuard.violationVerdictGuardFa}</p>
            <p className="text-[11px] text-sky-300">{threeLayerGuard.visualColorConfidenceRuleFa}</p>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 space-y-1">
          <div className="font-bold text-cyan-300">۱۶ بخش، ۱۴ لایه نقشه و ۱۷ دسته کلان کاربری زمین</div>
          <div className="text-[11px] text-slate-300">
            بخش‌ها: {STAGE61_SECTIONS_16.map((s) => `${s.id}.${s.titleFa}`).join(' • ')}
          </div>
          <div className="text-[11px] text-slate-400">
            لایه‌ها: {STAGE61_MAP_LAYERS_14.join(' • ')} | دسته‌ها: {STAGE61_CATEGORIES_17.join('، ')}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 text-xs" data-testid="stage61-mix-vacant-panel">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
        <h4 className="font-bold text-cyan-300">اختلاط کاربری، ماتریس سازگاری مجاورت و تفکیک زمین خالی از کم‌استفاده</h4>
        <label className="flex items-center gap-2 cursor-pointer text-slate-300">
          <input
            type="checkbox"
            checked={publicPrivacyMode}
            onChange={(e) => setPublicPrivacyMode(e.target.checked)}
          />
          <span>حالت عمومی (پنهان کردن اسناد مالکیت خصوصی و پرونده‌های حساس)</span>
        </label>
      </div>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 space-y-1" data-testid="stage61-mix-building-split">
          <div className="font-bold text-cyan-300">اختلاط مکانی ≠ تنوع آماری و کاربری قطعه ≠ طبقات</div>
          <p className="text-slate-200">{mixVacantGuard.mixAndBuildingSplitFa}</p>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 space-y-1" data-testid="stage61-compatibility-guard">
          <div className="font-bold text-emerald-300">سازگاری و تعارض مجاورت (هم‌جواری ≠ تخلف قطعی)</div>
          <p className="text-slate-200">{mixVacantGuard.compatibilityBoundaryFa}</p>
        </div>
        <div className="rounded-lg border border-amber-500/30 bg-amber-950/20 p-3 space-y-1 text-amber-200 md:col-span-2" data-testid="stage61-vacant-guard">
          <div className="font-bold text-amber-300">زمین خالی ≠ زمین کم‌استفاده ≠ زمین قابل توسعه</div>
          <p>{mixVacantGuard.vacantDevelopabilityGuardFa}</p>
        </div>
      </div>
    </div>
  );
};
