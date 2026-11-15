import React, { useMemo, useState } from 'react';
import {
  RT_FE_VISUAL_DESIGN_SYSTEM_008_SPEC_ID,
  RT_FE_VDS_BRAND_PALETTE_4,
  RT_FE_VDS_SEMANTIC_STATUS_5,
  RT_FE_VDS_ELEVATION_6,
  RT_FE_VDS_DENSITY_3,
  RT_FE_VDS_CHART_TYPES_9,
  RT_FE_VDS_MAP_HIERARCHY_6,
  RT_FE_VDS_MEDIA_RATIOS_6,
  RT_FE_VDS_19_UNITS,
  RT_FE_VDS_DELIVERABLES_28,
  type VisualDensityMode,
} from '../services/rtFeVisualDesignSystem008Engine';

export const RtFeVisualDesignSystem008Subpanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'brand_colors' | 'density_elevation' | 'charts_map_media' | 'units_deliverables'>('brand_colors');
  const [selectedDensity, setSelectedDensity] = useState<VisualDensityMode>('Standard');

  const activeDensitySpec = useMemo(
    () => RT_FE_VDS_DENSITY_3.find((d) => d.mode === selectedDensity) ?? RT_FE_VDS_DENSITY_3[1],
    [selectedDensity],
  );

  return (
    <div className="space-y-4 text-right" dir="rtl" data-testid="rt-fe-visual-design-system-008-panel">
      {/* Header Banner */}
      <div className="rounded-xl border border-amber-500/30 bg-slate-900/90 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded bg-amber-500/20 px-2 py-0.5 font-mono text-[11px] font-bold text-amber-300">
                {RT_FE_VISUAL_DESIGN_SYSTEM_008_SPEC_ID}
              </span>
              <span className="rounded bg-cyan-500/20 px-2 py-0.5 text-[11px] font-bold text-cyan-300">
                بخش ۸ از ۲۸ — زبان بصری، تراکم ۳سطحی، ارتفاع E0..E5، نمودار و نقشه (VDS-001..019)
              </span>
            </div>
            <h4 className="mt-1.5 text-sm font-bold text-white">
              مرحله هشتم: طراحی و معماری سیستم طراحی بصری (Visual Design System) رادار تهران
            </h4>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="rounded-lg border border-slate-700 bg-slate-800/80 px-2.5 py-1 font-mono text-slate-200">
              #173B57 · #246B8F · #3C8D91 · #D5A64A
            </span>
            <span className="rounded-lg border border-emerald-500/40 bg-emerald-950/50 px-2.5 py-1 font-bold text-emerald-300">
              دروازه مرحله ۹ (Interaction Design System): تاییدشده
            </span>
          </div>
        </div>

        {/* Sub-tabs */}
        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-slate-800 pt-3">
          {[
            { id: 'brand_colors', label: '۱. هویت بصری برند و سیستم رنگ معنایی ۴توکنی (VDS-001..003)' },
            { id: 'density_elevation', label: '۲. تراکم بصری ۳سطحی (Comfortable/Standard/Compact) و ارتفاع E0..E5' },
            { id: 'charts_map_media', label: '۳. زبان بصری ۹ نمودار، سلسله‌مراتب ۶سطحی نقشه و نسبت تصاویر' },
            { id: 'units_deliverables', label: '۴. کاتالوگ VDS-001..019 و ۲۸ خروجی الزامی (VDS-OUT-001..028)' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              data-testid={`rt-fe-vds-tab-${tab.id}`}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                activeTab === tab.id
                  ? 'bg-amber-600 text-white'
                  : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'brand_colors' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-2.5 text-xs">
            <h5 className="font-bold text-amber-300">پالت ۴گانه هویت بصری برند رادار تهران (VDS-001, VDS-002)</h5>
            {RT_FE_VDS_BRAND_PALETTE_4.map((c) => (
              <div key={c.nameEn} className="rounded-lg border border-slate-800 bg-slate-950/70 p-2.5 flex items-center justify-between">
                <div>
                  <div className="font-bold text-white">{c.nameFa} ({c.nameEn})</div>
                  <div className="text-[11px] text-slate-300 mt-0.5">{c.roleFa}</div>
                </div>
                <span className="rounded bg-slate-800 px-2.5 py-1 font-mono font-bold text-cyan-300" dir="ltr">
                  {c.hex}
                </span>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-2.5 text-xs">
            <h5 className="font-bold text-emerald-300">
              سیستم رنگ معنایی با ۴ توکن الزامی برای هر وضعیت (Background / Border / Text / Icon)
            </h5>
            {RT_FE_VDS_SEMANTIC_STATUS_5.map((st) => (
              <div key={st.status} className="rounded border border-slate-800 bg-slate-950/70 p-2 space-y-1">
                <div className="flex justify-between">
                  <span className="font-mono font-bold text-white">{st.status}</span>
                  <span className="text-slate-300">{st.meaningFa}</span>
                </div>
                <div className="font-mono text-[10px] text-cyan-300" dir="ltr">
                  {st.backgroundToken} | {st.borderToken} | {st.textToken} | {st.iconToken}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'density_elevation' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 text-xs">
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-3">
            <h5 className="font-bold text-cyan-300">
              شبیه‌ساز ۳ سطح تراکم بصری برای کاربران عمومی و حرفه‌ای (Visual Density — VDS-011)
            </h5>
            <div className="flex gap-2">
              {RT_FE_VDS_DENSITY_3.map((d) => (
                <button
                  key={d.mode}
                  type="button"
                  onClick={() => setSelectedDensity(d.mode)}
                  className={`rounded-lg px-3 py-1.5 font-bold ${
                    selectedDensity === d.mode ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  {d.mode} ({d.titleFa})
                </button>
              ))}
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950 p-3 space-y-1.5">
              <div>
                <span className="text-slate-400">مخاطب هدف: </span>
                <span className="font-bold text-white">{activeDensitySpec.targetAudienceFa}</span>
              </div>
              <div>
                <span className="text-slate-400">ارتفاع ردیف جدول / Padding کارت: </span>
                <span className="font-mono text-emerald-300">
                  Row: {activeDensitySpec.rowHeightPx}px | Card Padding: {activeDensitySpec.cardPaddingPx}px
                </span>
              </div>
              <div>
                <span className="text-slate-400">موارد کاربرد: </span>
                <span className="text-slate-200">{activeDensitySpec.useCasesFa.join(' • ')}</span>
              </div>
              <div className="text-[11px] text-amber-300">
                حفظ حداقل اندازه هدف تعاملی در تمام سطوح تراکم: {activeDensitySpec.minTouchTargetPreservedPx}px
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-2">
            <h5 className="font-bold text-indigo-300">معماری ۶ سطح Elevation (E0 تا E5) و مقیاس مرکزی Z-Index (VDS-009)</h5>
            {RT_FE_VDS_ELEVATION_6.map((el) => (
              <div key={el.level} className="rounded border border-slate-800 bg-slate-950/70 p-2 flex items-center justify-between">
                <div>
                  <span className="font-mono font-bold text-amber-300">{el.level}: </span>
                  <span className="text-slate-200">{el.usageFa}</span>
                </div>
                <span className="font-mono text-[11px] text-cyan-300" dir="ltr">{el.zIndexLayer}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'charts_map_media' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 text-xs">
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3.5 space-y-1.5">
            <div className="font-bold text-emerald-300">۹ نوع نمودار استاندارد (VDS-012)</div>
            {RT_FE_VDS_CHART_TYPES_9.map((ch) => (
              <div key={ch.typeEn} className="rounded border border-slate-800 bg-slate-950/60 p-1.5 flex justify-between">
                <span className="font-mono font-bold text-cyan-300">{ch.typeEn}</span>
                <span className="text-[11px] text-slate-300">{ch.usageFa}</span>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3.5 space-y-1.5">
            <div className="font-bold text-amber-300">سلسله‌مراتب ۶سطحی اولویت بصری نقشه (VDS-013)</div>
            {RT_FE_VDS_MAP_HIERARCHY_6.map((mh) => (
              <div key={mh.priorityRank} className="rounded border border-slate-800 bg-slate-950/60 p-1.5">
                <div className="font-mono text-[11px] text-indigo-300">
                  Rank {mh.priorityRank}: {mh.layerNameEn}
                </div>
                <div className="text-[11px] text-slate-200">{mh.labelFa}</div>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3.5 space-y-1.5">
            <div className="font-bold text-cyan-300">استاندارد نسبت ابعاد تصویر و رسانه (VDS-014)</div>
            {RT_FE_VDS_MEDIA_RATIOS_6.map((mr) => (
              <div key={mr.useCaseFa} className="rounded border border-slate-800 bg-slate-950/60 p-2 flex justify-between">
                <span className="text-white font-bold">{mr.useCaseFa}</span>
                <span className="font-mono text-emerald-300" dir="ltr">{mr.aspectRatio}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'units_deliverables' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 text-xs">
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-1.5">
            <h5 className="font-bold text-cyan-300">۱۹ واحد معماری سیستم طراحی بصری (VDS-001 تا VDS-019)</h5>
            <div className="max-h-64 overflow-y-auto space-y-1">
              {RT_FE_VDS_19_UNITS.map((u) => (
                <div key={u.id} className="text-[11px] text-slate-300">
                  <span className="font-mono font-bold text-amber-300">{u.id} ({u.titleEn}): </span>
                  <span>{u.titleFa}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-1.5">
            <h5 className="font-bold text-emerald-300">۲۸ خروجی الزامی مرحله هشتم (VDS-OUT-001 تا VDS-OUT-028)</h5>
            <div className="max-h-64 overflow-y-auto space-y-1">
              {RT_FE_VDS_DELIVERABLES_28.map((d) => (
                <div key={d.id} className="text-[11px] text-slate-300">
                  <span className="font-mono font-bold text-emerald-300">✓ {d.id}: </span>
                  <span>{d.titleFa}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
