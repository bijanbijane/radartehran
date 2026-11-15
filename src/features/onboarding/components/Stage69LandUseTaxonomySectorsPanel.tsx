/** @file src/features/onboarding/components/Stage69LandUseTaxonomySectorsPanel.tsx — Stage 69 Tabs 1 & 2 Panel */
import React, { useState } from 'react';
import { evaluateLandUseClassificationMapAndSectors } from '../services/landUseFunctionalStructureStage69Engine';
import {
  STAGE69_DOMAINS_20,
  STAGE69_FILTER_FIELDS_18,
  STAGE69_KPI_CARDS_8,
  STAGE69_MAIN_GROUPS_14,
  STAGE69_TOOLBAR_ACTIONS_7,
  type Stage69LandUseDomainProfile,
} from '../services/landUseFunctionalStructureStage69Types';

interface Props {
  section: 'map_domains_taxonomy_colors' | 'residential_commercial_services_green';
  profiles: ReadonlyArray<Stage69LandUseDomainProfile>;
  selectedZoneId: string;
  onSelectZoneId: (id: string) => void;
  onFeedbackFa: (message: string) => void;
}

export const Stage69LandUseTaxonomySectorsPanel: React.FC<Props> = ({
  section,
  profiles,
  selectedZoneId,
  onSelectZoneId,
  onFeedbackFa,
}) => {
  const [enforceDistinctColors, setEnforceDistinctColors] = useState<boolean>(true);
  const [excludePrivateGarden, setExcludePrivateGarden] = useState<boolean>(true);

  const profile = profiles.find((p) => p.zoneId === selectedZoneId) ?? profiles[0];
  if (!profile) return null;

  const guard = evaluateLandUseClassificationMapAndSectors(
    profile,
    enforceDistinctColors,
    excludePrivateGarden,
  );

  if (section === 'map_domains_taxonomy_colors') {
    return (
      <div className="space-y-4 text-xs" data-testid="stage69-map-taxonomy-panel">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
          <div className="flex flex-wrap gap-2">
            {profiles.map((p) => (
              <button
                key={p.zoneId}
                type="button"
                onClick={() => {
                  onSelectZoneId(p.zoneId);
                  onFeedbackFa(`محدوده «${p.zoneNameFa}» (${p.districtFa}) انتخاب شد؛ فیلترهای ۱۸گانه در انتقال به سایر نظامها حفظ میشوند.`);
                }}
                className={`rounded-lg border px-3 py-1.5 cursor-pointer ${
                  p.zoneId === profile.zoneId
                    ? 'border-emerald-400 bg-emerald-500/20 text-emerald-200 font-bold'
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
              checked={enforceDistinctColors}
              onChange={(e) => setEnforceDistinctColors(e.target.checked)}
            />
            <span>تفکیک رنگ کاربری، وضعیت داده و هشدار</span>
          </label>
        </div>

        <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/20 p-3 space-y-1.5 text-emerald-100">
          <div className="font-bold text-emerald-300">تفکیک کاربری زمین از فعالیت اقتصادی و قاعده رنگ نقشه</div>
          <p>{guard.landUseVsActivityAndColorRuleFa}</p>
          <p className="text-[11px] text-slate-400">
            منشأ داده: {profile.dataSourceFa} • اعتبارسنجی: {profile.validationStatusFa} • اطمینان: {profile.confidenceLevelFa}
          </p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 space-y-1.5">
          <div className="font-bold text-emerald-300">
            ۲۰ حوزه معماری، ۱۴ گروه اصلی سطح اول، ۸ کارت شاخص، ۷ ابزار و ۱۸ فیلتر مشترک
          </div>
          <div className="text-[11px] text-slate-300">
            ۱۴ گروه: {STAGE69_MAIN_GROUPS_14.join(' • ')}
          </div>
          <div className="text-[11px] text-slate-400">
            ۸ کارت KPI: {STAGE69_KPI_CARDS_8.map((k) => `${k.titleFa} (${k.unitFa})`).join(' • ')}
          </div>
          <div className="text-[11px] text-slate-400">
            ۷ ابزار: {STAGE69_TOOLBAR_ACTIONS_7.join(' • ')} | ۱۸ فیلتر: {STAGE69_FILTER_FIELDS_18.join(' • ')}
          </div>
          <div className="text-[11px] text-slate-400">
            ۲۰ حوزه: {STAGE69_DOMAINS_20.map((d) => `${d.id}.${d.titleFa}`).join(' • ')}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 text-xs" data-testid="stage69-sectors-green-services-panel">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
        <span className="font-bold text-emerald-300">تحلیل تخصصی مسکونی، تجاری، اداری، صنعتی، خدمات و فضای سبز</span>
        <label className="flex items-center gap-2 cursor-pointer text-slate-300">
          <input
            type="checkbox"
            checked={excludePrivateGarden}
            onChange={(e) => setExcludePrivateGarden(e.target.checked)}
          />
          <span>جداسازی باغ خصوصی از سرانه فضای سبز عمومی</span>
        </label>
      </div>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 space-y-1.5">
          <div className="font-bold text-emerald-300">۴ متغیر مسکونی و جداسازی سرانه فضای سبز عمومی</div>
          <p className="text-slate-200">{guard.residentialFourVarsAndPublicGreenGuardFa}</p>
        </div>

        <div className="rounded-lg border border-sky-500/30 bg-sky-950/20 p-3 space-y-1.5 text-sky-200">
          <div className="font-bold text-sky-300">کفایت خدمات آموزشی/درمانی و مرز تصویر ماهواره‌ای در باغات</div>
          <p>{guard.educationHealthCapacityAndSatelliteLegalGuardFa}</p>
        </div>
      </div>
    </div>
  );
};
