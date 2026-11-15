/** @file src/features/onboarding/components/Stage63SidewalkAccessSafetyPanel.tsx — Stage 63 Tabs 1 & 2 Panel */
import React, { useState } from 'react';
import {
  evaluateSafetyShadeFacadePrivacyAndScenario,
  evaluateSidewalkAndAccessibilityChain,
} from '../services/urbanPublicRealmEngine';
import {
  STAGE63_MAP_LAYERS_12,
  STAGE63_QUALITY_DIMENSIONS_6,
  STAGE63_SECTIONS_16,
  type PublicRealmZoneProfile,
} from '../services/urbanPublicRealmTypes';

interface Props {
  section: 'overview_and_sidewalks' | 'accessibility_and_safety';
  profiles: ReadonlyArray<PublicRealmZoneProfile>;
  selectedZoneId: string;
  onSelectZoneId: (id: string) => void;
  onFeedbackFa: (message: string) => void;
}

export const Stage63SidewalkAccessSafetyPanel: React.FC<Props> = ({
  section,
  profiles,
  selectedZoneId,
  onSelectZoneId,
  onFeedbackFa,
}) => {
  const [preventCompositeMasking, setPreventCompositeMasking] = useState<boolean>(true);
  const [publicPrivacyMode, setPublicPrivacyMode] = useState<boolean>(true);

  const profile = profiles.find((p) => p.zoneId === selectedZoneId) ?? profiles[0];
  if (!profile) return null;

  const accessGuard = evaluateSidewalkAndAccessibilityChain(profile, preventCompositeMasking);
  const safetyGuard = evaluateSafetyShadeFacadePrivacyAndScenario(profile, publicPrivacyMode, false);

  if (section === 'overview_and_sidewalks') {
    return (
      <div className="space-y-4 text-xs" data-testid="stage63-overview-sidewalks-panel">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
          <div className="flex flex-wrap gap-2">
            {profiles.map((p) => (
              <button
                key={p.zoneId}
                type="button"
                onClick={() => {
                  onSelectZoneId(p.zoneId);
                  onFeedbackFa(`محور/فضای «${p.streetOrSpaceNameFa}» برای ارزیابی تجربه پیاده انتخاب شد.`);
                }}
                className={`rounded-lg border px-3 py-1.5 cursor-pointer ${
                  p.zoneId === profile.zoneId
                    ? 'border-emerald-400 bg-emerald-500/20 text-emerald-200 font-bold'
                    : 'border-slate-700 bg-slate-950 text-slate-300'
                }`}
              >
                {p.streetOrSpaceNameFa}
              </button>
            ))}
          </div>
          <span className="text-[11px] text-emerald-300">نوع فضا: {profile.spaceTypeFa}</span>
        </div>

        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 space-y-1">
            <div className="font-bold text-emerald-300">تفکیک عرض اسمی از عرض مفید پیاده‌رو</div>
            <p className="text-slate-200">{accessGuard.widthSeparationFa}</p>
            <p className="text-[11px] text-amber-300">{accessGuard.continuityVsAccessibilityFa}</p>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 space-y-1">
            <div className="font-bold text-sky-300">۶ بُعد مستقل کیفیت فضای عمومی</div>
            <ul className="space-y-0.5 text-[11px] text-slate-300">
              {STAGE63_QUALITY_DIMENSIONS_6.map((d) => (
                <li key={d.titleFa}>
                  <span className="font-bold text-slate-100">{d.titleFa}:</span> {d.scopeFa}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 space-y-1">
          <div className="font-bold text-emerald-300">۱۶ بخش و ۱۲ لایه نقشه مرکز فضای عمومی</div>
          <div className="text-[11px] text-slate-300">
            بخش‌ها: {STAGE63_SECTIONS_16.map((s) => `${s.id}.${s.titleFa}`).join(' • ')}
          </div>
          <div className="text-[11px] text-slate-400">لایه‌ها: {STAGE63_MAP_LAYERS_12.join(' • ')}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 text-xs" data-testid="stage63-accessibility-safety-panel">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
        <label className="flex items-center gap-2 cursor-pointer text-slate-300">
          <input
            type="checkbox"
            checked={preventCompositeMasking}
            onChange={(e) => setPreventCompositeMasking(e.target.checked)}
          />
          <span>منع پنهان‌کاری ضعف دسترس‌پذیری پشت امتیاز کلی</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer text-slate-300">
          <input
            type="checkbox"
            checked={publicPrivacyMode}
            onChange={(e) => setPublicPrivacyMode(e.target.checked)}
          />
          <span>حالت انتشار عمومی (پوشاندن PII و مختصات گزارش‌دهنده)</span>
        </label>
      </div>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <div className="rounded-lg border border-amber-500/30 bg-amber-950/20 p-3 space-y-1 text-amber-200">
          <div className="font-bold text-amber-300">ارزیابی زنجیره دسترسی و تفکیک گروه‌ها</div>
          <p>{accessGuard.accessibilityChainVerdictFa}</p>
          <p className="text-[11px] text-slate-300">{accessGuard.compositeMaskingGuardFa}</p>
          <div className="mt-1 space-y-1 text-[11px]">
            {profile.groupRows.map((row) => (
              <div key={row.groupFa} className="rounded bg-slate-950/70 px-2 py-1">
                <span className={row.isChainPassable ? 'text-emerald-300' : 'text-rose-300'}>
                  {row.groupFa}: {row.isChainPassable ? 'قابل عبور' : 'دارای گسست'}
                </span>{' '}
                — {row.barrierReasonFa}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 space-y-1.5">
          <div className="font-bold text-emerald-300">ایمنی فیزیکی ≠ احساس امنیت | سایه ≠ آسایش حرارتی</div>
          <p className="text-slate-200">{safetyGuard.safetySeparationFa}</p>
          <p className="text-sky-200">{safetyGuard.shadeVsThermalGuardFa}</p>
          <p className="text-[11px] text-amber-300">{safetyGuard.duplicateStaleAndPrivacyGuardFa}</p>
        </div>
      </div>
    </div>
  );
};
