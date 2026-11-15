import React, { useMemo, useState } from 'react';
import {
  RT_FE_DESIGN_SYSTEM_004_SPEC_ID,
  RT_FE_DS_5_LAYERS,
  RT_FE_DS_PRIMARY_COLORS_10,
  RT_FE_DS_NEUTRAL_TOKENS_10,
  RT_FE_DS_STATUS_COLORS_5,
  RT_FE_DS_GEO_COLORS_10,
  RT_FE_DS_TYPOGRAPHY_10,
  RT_FE_DS_SPACING_12,
  RT_FE_DS_CONTROL_SIZES_5,
  RT_FE_DS_RADIUS_7,
  RT_FE_DS_SHADOWS_5,
  RT_FE_DS_CHART_SERIES_8,
  RT_FE_DS_MOTION_6,
  RT_FE_DS_RTL_10,
  RT_FE_DS_REQUIREMENTS_20,
  RT_FE_DS_DELIVERABLES_20,
  formatRadarDesignSystemMetric,
  validateDesignTokenSpacing,
} from '../services/rtFeDesignSystem004Engine';

export const RtFeDesignSystem004Subpanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'tokens_colors' | 'typography_numbers' | 'spacing_scales' | 'themes_rtl_qa'>('tokens_colors');
  const [themePreview, setThemePreview] = useState<'light' | 'dark'>('dark');
  const [sampleSpacingPx, setSampleSpacingPx] = useState<number>(16);

  const formattedNumbers = useMemo(
    () =>
      formatRadarDesignSystemMetric({
        totalPriceToman: 12_500_000_000,
        pricePerSqmToman: 125_000_000,
        areaSqm: 120,
        jalaliDate: '1405/08/24',
        percentChange: 12.5,
        technicalEntityId: 'PR-1024',
      }),
    [],
  );
  const spacingVerdict = useMemo(() => validateDesignTokenSpacing(sampleSpacingPx), [sampleSpacingPx]);

  return (
    <div className="space-y-4 text-right" dir="rtl" data-testid="rt-fe-design-system-004-panel">
      <div className="rounded-xl border border-amber-500/30 bg-slate-900/90 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded bg-amber-500/20 px-2 py-0.5 font-mono text-[11px] font-bold text-amber-300">
                {RT_FE_DESIGN_SYSTEM_004_SPEC_ID}
              </span>
              <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-[11px] font-bold text-emerald-300">
                بخش ۴ از ۲۸ — سیستم طراحی بصری ۵لایه و توکن‌های مرکزی
              </span>
            </div>
            <h4 className="mt-1.5 text-sm font-bold text-white">
              مرحله چهارم: طراحی سیستم طراحی بصری (Design System) و استانداردهای یکپارچه رابط کاربری رادار تهران
            </h4>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="rounded-lg border border-slate-700 bg-slate-800/80 px-2.5 py-1 font-mono text-slate-200">
              Primary 500: #287C83 | Vazirmatn
            </span>
            <span className="rounded-lg border border-emerald-500/40 bg-emerald-950/50 px-2.5 py-1 font-bold text-emerald-300">
              دروازه مرحله ۵ (Shared Component Library): آماده و تاییدشده
            </span>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-slate-800 pt-3">
          {[
            { id: 'tokens_colors', label: '۱. معماری ۵لایه توکن‌ها و خانواده‌های رنگ (CLR / N / GEO / Status)' },
            { id: 'typography_numbers', label: '۲. تایپوگرافی Vazirmatn (T-001..010) و فرمت اعداد مالی فارسی' },
            { id: 'spacing_scales', label: '۳. فاصله‌گذاری ۴پیکسلی (SP)، ابعاد (SZ)، گوشه‌ها (RD) و نمودارها' },
            { id: 'themes_rtl_qa', label: '۴. تم روشن/تاریک، استانداردهای RTL-001..010 و تحویل‌ها (DS-OUT-01..20)' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              data-testid={`rt-fe-ds-tab-${tab.id}`}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                activeTab === tab.id ? 'bg-amber-600 text-white' : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'tokens_colors' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 text-xs">
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-2">
            <h5 className="font-bold text-amber-300">معماری ۵لایه سیستم طراحی رادار</h5>
            {RT_FE_DS_5_LAYERS.map((l) => (
              <div key={l.layer} className="rounded border border-slate-800 bg-slate-950/70 p-2">
                <div className="font-mono font-bold text-cyan-300">Layer {l.layer}: {l.nameEn}</div>
                <div className="text-[11px] text-slate-300">{l.responsibilityFa}</div>
              </div>
            ))}
            <div className="pt-2 border-t border-slate-800 space-y-1">
              {RT_FE_DS_STATUS_COLORS_5.map((st) => (
                <div key={st.status} className="flex justify-between text-[11px] text-slate-200">
                  <span className="font-mono font-bold">{st.status} ({st.primaryHex})</span>
                  <span className="text-slate-400">{st.usageFa}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-1.5">
            <h5 className="font-bold text-cyan-300">پالت هویت اصلی رادار (CLR-001 تا CLR-010)</h5>
            {RT_FE_DS_PRIMARY_COLORS_10.map((c) => (
              <div key={c.id} className="flex items-center justify-between rounded border border-slate-800 bg-slate-950/70 p-1.5 text-[11px]">
                <span className="font-mono text-amber-300">{c.id} ({c.name})</span>
                <span className="font-mono text-cyan-300" dir="ltr">{c.hex}</span>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-1.5">
            <h5 className="font-bold text-indigo-300">رنگ‌های اطلاعات شهری و کاربری زمین (GEO-001..010)</h5>
            {RT_FE_DS_GEO_COLORS_10.map((g) => (
              <div key={g.id} className="flex items-center justify-between rounded border border-slate-800 bg-slate-950/70 p-1.5 text-[11px]">
                <span className="font-mono text-indigo-300">{g.id}</span>
                <span className="font-bold text-white">{g.categoryFa}</span>
                <span className="font-mono text-emerald-300" dir="ltr">{g.hex}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'typography_numbers' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 text-xs">
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-1.5">
            <h5 className="font-bold text-amber-300">سلسله‌مراتب ۱۰گانه تایپوگرافی (Vazirmatn — T-001 تا T-010)</h5>
            {RT_FE_DS_TYPOGRAPHY_10.map((t) => (
              <div key={t.id} className="flex items-center justify-between rounded border border-slate-800 bg-slate-950/70 p-1.5 text-[11px]">
                <span className="font-mono text-amber-300">{t.id} — {t.name}</span>
                <span className="font-mono text-cyan-300">{t.fontSizePx}px / w{t.fontWeight} / lh-{t.lineHeightPx}px</span>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-2">
            <h5 className="font-bold text-emerald-300">استاندارد نمایش اعداد، مبالغ مالی و ترکیب دوزبانه (DS-OUT-05)</h5>
            <div className="rounded-lg border border-slate-800 bg-slate-950 p-3 space-y-1.5 tabular-nums">
              <div>قیمت کل: <strong className="text-white">{formattedNumbers.formattedTotalPriceFa}</strong></div>
              <div>قیمت هر متر: <strong className="text-emerald-300">{formattedNumbers.formattedPricePerSqmFa}</strong></div>
              <div>متراژ: <strong className="text-cyan-300">{formattedNumbers.formattedAreaFa}</strong></div>
              <div>تاریخ شمسی: <strong className="text-amber-300">{formattedNumbers.formattedJalaliDateFa}</strong></div>
              <div>درصد تغییر: <strong className="text-indigo-300">{formattedNumbers.formattedPercentChangeFa}</strong></div>
              <div>شناسه فنی (LTR): <code className="text-slate-200" dir="ltr">{formattedNumbers.preservedTechnicalIdLtr}</code></div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'spacing_scales' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 text-xs">
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-2">
            <h5 className="font-bold text-amber-300">نظام فاصله‌گذاری ۴پیکسلی (SP-001..012)</h5>
            <div className="flex flex-wrap gap-1.5">
              {[4, 8, 12, 16, 24, 32, 13, 19].map((px) => (
                <button key={px} type="button" onClick={() => setSampleSpacingPx(px)} className={`rounded px-2 py-1 font-mono text-[11px] ${sampleSpacingPx === px ? 'bg-amber-600 text-white' : 'bg-slate-800 text-slate-300'}`}>
                  {px}px
                </button>
              ))}
            </div>
            <div className={`rounded border p-2 text-[11px] ${spacingVerdict.valid ? 'border-emerald-500/40 bg-emerald-950/30 text-emerald-200' : 'border-rose-500/40 bg-rose-950/30 text-rose-200'}`}>
              {spacingVerdict.reasonFa}
            </div>
            <div className="grid grid-cols-3 gap-1 text-[11px]">
              {RT_FE_DS_SPACING_12.map((sp) => (
                <div key={sp.id} className="rounded border border-slate-800 bg-slate-950/60 p-1 font-mono text-slate-300">{sp.id}: {sp.px}px</div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-1.5 text-[11px]">
            <div className="font-bold text-cyan-300">ارتفاع کنترل‌ها (SZ)، گوشه‌ها (RD) و سایه‌ها (SH)</div>
            {RT_FE_DS_CONTROL_SIZES_5.map((sz) => (
              <div key={sz.id} className="flex justify-between text-slate-300"><span>{sz.id} ({sz.labelFa})</span><span>{sz.heightPx}px</span></div>
            ))}
            <div className="flex flex-wrap gap-1 pt-1">
              {RT_FE_DS_RADIUS_7.map((rd) => <span key={rd.id} className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-amber-300">{rd.id}: {rd.px}px</span>)}
            </div>
            {RT_FE_DS_SHADOWS_5.map((sh) => <div key={sh.id} className="text-slate-300">{sh.id}: {sh.usageFa}</div>)}
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-1.5 text-[11px]">
            <div className="font-bold text-indigo-300">پالت نمودارها (Series 1..8) و حرکت (MOT-001..006)</div>
            <div className="grid grid-cols-2 gap-1">
              {RT_FE_DS_CHART_SERIES_8.map((cs) => <div key={cs.series} className="rounded border border-slate-800 bg-slate-950/60 p-1 font-mono text-slate-200">{cs.series}: {cs.hex}</div>)}
            </div>
            {RT_FE_DS_MOTION_6.map((mot) => (
              <div key={mot.id} className="flex justify-between text-slate-300"><span>{mot.id} ({mot.typeEn})</span><span>{mot.durationMs}ms</span></div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'themes_rtl_qa' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 text-[11px]">
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3.5 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-amber-300">توکن‌های خنثی (N-001..010)</span>
              <button type="button" onClick={() => setThemePreview((p) => (p === 'light' ? 'dark' : 'light'))} className="rounded bg-slate-800 px-2 py-0.5 text-cyan-300">
                {themePreview}
              </button>
            </div>
            {RT_FE_DS_NEUTRAL_TOKENS_10.map((n) => (
              <div key={n.id} className="flex justify-between rounded border border-slate-800 bg-slate-950/60 p-1">
                <span className="font-mono text-white">{n.id} ({n.token})</span>
                <span className="font-mono text-emerald-300" dir="ltr">{themePreview === 'light' ? n.lightHex : n.darkHex}</span>
              </div>
            ))}
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3.5 space-y-1">
            <div className="font-bold text-cyan-300">استانداردهای RTL-001..010</div>
            {RT_FE_DS_RTL_10.map((r) => <div key={r.id} className="text-slate-300">✓ {r.id}: {r.titleFa}</div>)}
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3.5 space-y-1 max-h-64 overflow-y-auto">
            <div className="font-bold text-emerald-300">الزامات ({RT_FE_DS_REQUIREMENTS_20.length}) و تحویل‌ها ({RT_FE_DS_DELIVERABLES_20.length})</div>
            {RT_FE_DS_DELIVERABLES_20.map((d) => <div key={d.id} className="text-slate-300">✓ {d.id}: {d.titleFa}</div>)}
          </div>
        </div>
      )}
    </div>
  );
};
