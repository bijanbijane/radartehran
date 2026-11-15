/** @file src/features/onboarding/components/Stage64NetworkTransitMultimodalPanel.tsx — Stage 64 Tabs 1 & 2 Panel */
import React, { useState } from 'react';
import {
  evaluateNetworkTransitAndMultimodalGuards,
  evaluateTrafficParkingOdPrivacyAndValuationGuards,
} from '../services/urbanMobilityEngine';
import {
  STAGE64_MAP_LAYERS_12,
  STAGE64_SECTIONS_17,
  STAGE64_TEMPORAL_STATES_5,
  type MobilityZoneProfile,
} from '../services/urbanMobilityTypes';

interface Props {
  section: 'overview_and_network' | 'transit_and_multimodal';
  profiles: ReadonlyArray<MobilityZoneProfile>;
  selectedZoneId: string;
  onSelectZoneId: (id: string) => void;
  onFeedbackFa: (message: string) => void;
}

export const Stage64NetworkTransitMultimodalPanel: React.FC<Props> = ({
  section,
  profiles,
  selectedZoneId,
  onSelectZoneId,
  onFeedbackFa,
}) => {
  const [includeWaitAndTransfer, setIncludeWaitAndTransfer] = useState<boolean>(true);

  const profile = profiles.find((p) => p.zoneId === selectedZoneId) ?? profiles[0];
  if (!profile) return null;

  const routingGuard = evaluateNetworkTransitAndMultimodalGuards(profile, includeWaitAndTransfer);
  const trafficGuard = evaluateTrafficParkingOdPrivacyAndValuationGuards(profile, false, true);

  if (section === 'overview_and_network') {
    return (
      <div className="space-y-4 text-xs" data-testid="stage64-overview-network-panel">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
          <div className="flex flex-wrap gap-2">
            {profiles.map((p) => (
              <button
                key={p.zoneId}
                type="button"
                onClick={() => {
                  onSelectZoneId(p.zoneId);
                  onFeedbackFa(`محدوده/گره «${p.corridorOrHubNameFa}» برای تحلیل تحرک چندوجهی انتخاب شد.`);
                }}
                className={`rounded-lg border px-3 py-1.5 cursor-pointer ${
                  p.zoneId === profile.zoneId
                    ? 'border-indigo-400 bg-indigo-500/20 text-indigo-200 font-bold'
                    : 'border-slate-700 bg-slate-950 text-slate-300'
                }`}
              >
                {p.corridorOrHubNameFa}
              </button>
            ))}
          </div>
          <span className="text-[11px] text-indigo-300">وضعیت زمانی: {profile.temporalState}</span>
        </div>

        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 space-y-1">
            <div className="font-bold text-indigo-300">فاصله مستقیم ≠ دسترسی واقعی ایستگاه</div>
            <p className="text-slate-200">{routingGuard.distanceVsAccessTimeFa}</p>
            <p className="text-[11px] text-amber-300">{routingGuard.interchangeOperationalGapFa}</p>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 space-y-1">
            <div className="font-bold text-sky-300">۵ وضعیت زمانی مجزا و منبع ترافیک</div>
            <p className="text-slate-200">{trafficGuard.temporalAndLiveTrafficGuardFa}</p>
            <p className="text-[11px] text-slate-400">وضعیت‌ها: {STAGE64_TEMPORAL_STATES_5.join(' • ')}</p>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 space-y-1">
          <div className="font-bold text-indigo-300">۱۷ بخش و ۱۲ لایه نقشه مرکز تحرک شهری</div>
          <div className="text-[11px] text-slate-300">
            بخش‌ها: {STAGE64_SECTIONS_17.map((s) => `${s.id}.${s.titleFa}`).join(' • ')}
          </div>
          <div className="text-[11px] text-slate-400">لایه‌ها: {STAGE64_MAP_LAYERS_12.join(' • ')}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 text-xs" data-testid="stage64-transit-multimodal-panel">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
        <span className="font-bold text-indigo-300">حمل‌ونقل عمومی، سرفاصله واقعی و مسیریابی چندوجهی</span>
        <label className="flex items-center gap-2 cursor-pointer text-slate-300">
          <input
            type="checkbox"
            checked={includeWaitAndTransfer}
            onChange={(e) => setIncludeWaitAndTransfer(e.target.checked)}
          />
          <span>لحاظ زمان انتظار و انتقال در زمان کل سفر</span>
        </label>
      </div>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 space-y-1">
          <div className="font-bold text-indigo-300">برنامه رسمی ≠ عملکرد مشاهده‌شده</div>
          <p className="text-slate-200">{routingGuard.scheduleVsObservedFa}</p>
          <p className="text-[11px] text-sky-300">{routingGuard.bestRouteCriterionGuardFa}</p>
        </div>
        <div
          className={`rounded-lg border p-3 space-y-1 ${
            includeWaitAndTransfer
              ? 'border-emerald-500/30 bg-emerald-950/20 text-emerald-200'
              : 'border-rose-500/40 bg-rose-950/25 text-rose-200'
          }`}
        >
          <div className="font-bold">تجزیه زمان سفر چندوجهی و منع حذف پنهان</div>
          <p>{routingGuard.multimodalTotalTimeBreakdownFa}</p>
          <div className="mt-1 space-y-1 text-[11px] text-slate-300">
            {profile.routes.map((r) => (
              <div key={r.optionId} className="rounded bg-slate-950/70 px-2 py-1">
                {r.labelFa} — معیار: {r.rankingCriterionFa} |{' '}
                {r.isWheelchairFriendly ? 'مسیر بدون پله' : 'دارای پله/محدودیت ویلچر'}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
