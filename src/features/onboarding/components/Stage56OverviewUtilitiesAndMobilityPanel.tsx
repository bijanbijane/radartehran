/** @file src/features/onboarding/components/Stage56OverviewUtilitiesAndMobilityPanel.tsx — Stage 56 Overview, Layers, Utilities & Mobility Accessibility */
import React, { useState } from 'react';
import { evaluateLayersAccessibilityAndPrivacy } from '../services/urbanInfrastructureEngine';
import {
  STAGE56_INTEGRATIONS_5,
  STAGE56_MAP_LAYERS_10,
  STAGE56_SECTIONS_12,
  type InfrastructureViewerRole,
  type NeighborhoodInfrastructureProfile,
  type TravelModeKind,
} from '../services/urbanInfrastructureTypes';

interface Props {
  section: 'overview_and_utilities' | 'mobility_and_services';
  profiles: ReadonlyArray<NeighborhoodInfrastructureProfile>;
  onFeedbackFa: (message: string) => void;
}

const TRAVEL_MODES: ReadonlyArray<TravelModeKind> = ['پیاده', 'دوچرخه', 'خودرو', 'حمل‌ونقل عمومی'];
const MINUTES: ReadonlyArray<5 | 10 | 15 | 30> = [5, 10, 15, 30];

export const Stage56OverviewUtilitiesAndMobilityPanel: React.FC<Props> = ({
  section,
  profiles,
  onFeedbackFa,
}) => {
  const [selectedId, setSelectedId] = useState<string>(profiles[0]?.neighborhoodId ?? 'narmak');
  const [selectedLayers, setSelectedLayers] = useState<string[]>(['حمل‌ونقل عمومی', 'درمان']);
  const [travelMode, setTravelMode] = useState<TravelModeKind>('پیاده');
  const [isochroneMinutes, setIsochroneMinutes] = useState<5 | 10 | 15 | 30>(15);
  const [role, setRole] = useState<InfrastructureViewerRole>('کاربر عمومی');

  const profile = profiles.find((p) => p.neighborhoodId === selectedId) ?? profiles[0];
  if (!profile) return null;

  const evalResult = evaluateLayersAccessibilityAndPrivacy(
    profile,
    selectedLayers.length,
    travelMode,
    isochroneMinutes,
    role,
  );

  const toggleLayer = (layer: string) => {
    setSelectedLayers((prev) => {
      const next = prev.includes(layer) ? prev.filter((item) => item !== layer) : [...prev, layer];
      onFeedbackFa(`تعداد لایه فعال نقشه زیرساخت به ${next.length} تغییر یافت.`);
      return next;
    });
  };

  if (section === 'overview_and_utilities') {
    return (
      <div className="space-y-4" data-testid="stage56-overview-utilities-panel">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
          <div className="flex flex-wrap gap-2">
            {profiles.map((p) => (
              <button
                key={p.neighborhoodId}
                type="button"
                onClick={() => {
                  setSelectedId(p.neighborhoodId);
                  onFeedbackFa(`محله «${p.neighborhoodNameFa}» (${p.districtFa}) برای رصد زیرساخت انتخاب شد.`);
                }}
                className={`rounded-lg border px-3 py-1.5 text-xs cursor-pointer ${
                  p.neighborhoodId === profile.neighborhoodId
                    ? 'border-emerald-400 bg-emerald-500/20 text-emerald-200 font-bold'
                    : 'border-slate-700 bg-slate-950 text-slate-300'
                }`}
              >
                {p.neighborhoodNameFa} ({p.districtFa})
              </button>
            ))}
          </div>

          <select
            aria-label="نقش کاربری زیرساخت"
            value={role}
            onChange={(e) => setRole(e.target.value as InfrastructureViewerRole)}
            className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-100"
          >
            <option value="کاربر عمومی">کاربر عمومی</option>
            <option value="تحلیل‌گر شهری">تحلیل‌گر شهری</option>
            <option value="مدیر زیرساخت">مدیر زیرساخت</option>
          </select>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 space-y-2 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-bold text-emerald-300">کنترل لایه‌های نقشه ({STAGE56_MAP_LAYERS_10.length} لایه؛ هشدار شلوغی بالای ۳ لایه)</span>
            <button
              type="button"
              onClick={() => setSelectedLayers(['حمل‌ونقل عمومی', 'درمان'])}
              className="rounded border border-slate-700 bg-slate-950 px-2 py-0.5 text-[11px] text-slate-300 cursor-pointer"
            >
              بازنشانی لایه‌ها
            </button>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {STAGE56_MAP_LAYERS_10.map((layer) => {
              const active = selectedLayers.includes(layer);
              return (
                <button
                  key={layer}
                  type="button"
                  onClick={() => toggleLayer(layer)}
                  className={`rounded-lg border px-2.5 py-1 text-[11px] cursor-pointer ${
                    active
                      ? 'border-emerald-400 bg-emerald-500/20 text-emerald-200 font-bold'
                      : 'border-slate-800 bg-slate-950 text-slate-400'
                  }`}
                >
                  {layer}
                </button>
              );
            })}
          </div>

          <div
            className={`rounded-lg border p-2.5 ${
              evalResult.layerClutterBlocked
                ? 'border-amber-500/40 bg-amber-950/25 text-amber-200'
                : 'border-emerald-500/30 bg-emerald-950/20 text-emerald-200'
            }`}
            data-testid="stage56-layer-clutter-status"
          >
            {evalResult.layerStatusMessageFa}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 md:grid-cols-2 text-xs">
          <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 space-y-1">
            <div className="font-bold text-sky-300">آب، فاضلاب و انرژی (تفکیک «نامشخص» از «نبود»)</div>
            <div className="text-slate-200">آب: {profile.waterCoverageStatus} • گاز: {profile.gasCoverageStatus}</div>
            <div className="text-slate-400">
              فاضلاب: {profile.wastewaterCoveragePercent !== null ? `${profile.wastewaterCoveragePercent}٪` : 'داده موجود نیست (بدون مقدار فرضی)'}
            </div>
            <div className="text-amber-200/90 mt-1" data-testid="stage56-missing-data-guard">
              {evalResult.missingDataSeparationFa}
            </div>
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 space-y-1">
            <div className="font-bold text-rose-300">حریم امنیتی شبکه‌های حیاتی</div>
            <div className="text-slate-200" data-testid="stage56-security-gate">
              {evalResult.publicSecurityGateFa}
            </div>
            <div className="text-slate-400 mt-1">
              اتصال ۵گانه ماژول: {STAGE56_INTEGRATIONS_5.map((i) => i.moduleFa).join(' • ')}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="stage56-mobility-services-panel">
      <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-3 text-xs">
        <h4 className="font-bold text-emerald-300">تحلیل محدوده دسترسی زمانی (Isochrone شبکه‌ای واقعی، نه دایره خط مستقیم)</h4>
        <div className="flex flex-wrap gap-3">
          <label className="space-y-1">
            <span className="text-slate-400 block">شیوه سفر:</span>
            <select
              value={travelMode}
              onChange={(e) => setTravelMode(e.target.value as TravelModeKind)}
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-slate-100"
            >
              {TRAVEL_MODES.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-slate-400 block">بازه دسترسی:</span>
            <select
              value={isochroneMinutes}
              onChange={(e) => setIsochroneMinutes(Number(e.target.value) as 5 | 10 | 15 | 30)}
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-slate-100"
            >
              {MINUTES.map((min) => (
                <option key={min} value={min}>{min} دقیقه</option>
              ))}
            </select>
          </label>
        </div>

        <div className="rounded-lg border border-sky-500/30 bg-sky-950/20 p-3 text-sky-200" data-testid="stage56-isochrone-note">
          {evalResult.isochroneMethodNoteFa}
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-2.5">
            <div className="font-bold text-slate-200">ایستگاه‌های حمل‌ونقل</div>
            <div className="text-emerald-300 text-sm font-bold mt-1">{profile.transitStationsCount} ایستگاه/نقطه</div>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-2.5">
            <div className="font-bold text-slate-200">مراکز درمانی ثبت‌شده</div>
            <div className="text-emerald-300 text-sm font-bold mt-1">{profile.hospitalsAndClinicsCount} مرکز</div>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-2.5">
            <div className="font-bold text-slate-200">مدارس و مراکز آموزشی</div>
            <div className="text-emerald-300 text-sm font-bold mt-1">{profile.schoolsCount} مرکز</div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 text-xs">
        <div className="font-bold text-emerald-300 mb-2">معماری ۱۲ بخش اصلی ماژول زیرساخت</div>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4 text-[11px]">
          {STAGE56_SECTIONS_12.map((sec) => (
            <div key={sec.id} className="rounded border border-slate-800 bg-slate-950/70 p-2">
              <span className="font-mono text-emerald-400">{sec.id}</span> · <span className="font-bold text-slate-200">{sec.titleFa}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
