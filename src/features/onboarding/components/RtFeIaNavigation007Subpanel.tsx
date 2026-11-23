import React, { useMemo, useState } from 'react';
import {
  RT_FE_IA_NAVIGATION_007_SPEC_ID,
  RT_FE_INFORMATION_ARCHITECTURE_007_SPEC_ID,
  RT_FE_IA_20_ENTITIES,
  RT_FE_IA_NAV_USER_QUESTIONS_9,
  RT_FE_IA_NAV_12_DOMAINS,
  RT_FE_IA_NAV_5_LEVELS,
  RT_FE_IA_NAV_JOURNEYS_6,
  RT_FE_IA_NAV_VOCABULARY_12,
  RT_FE_IA_NAV_ROUTE_META_SAMPLES,
  RT_FE_IA_NAV_DELIVERABLES_23,
  buildEntityContextualLinks,
  applyFilterChangeToRouteQuery,
} from '../services/rtFeIaNavigation007Engine';

export const RtFeIaNavigation007Subpanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'domains_questions' | 'nav_levels_graph' | 'journeys_vocab' | 'meta_deliverables'>('domains_questions');
  const [hasBuildingData, setHasBuildingData] = useState<boolean>(false);
  const [hasNeighborhoodData, setHasNeighborhoodData] = useState<boolean>(true);
  const [selectedCityFilter, setSelectedCityFilter] = useState<string>('tehran');

  const contextualLinks = useMemo(
    () =>
      buildEntityContextualLinks({
        citySlug: 'tehran',
        districtSlug: 'region-2',
        neighborhoodSlug: hasNeighborhoodData ? 'saadat-abad' : null,
        buildingId: hasBuildingData ? 'BLD-408' : null,
        propertyId: 'PR-1024',
        listingId: 'LST-9901',
      }),
    [hasBuildingData, hasNeighborhoodData],
  );

  const filterResetPreview = useMemo(
    () =>
      applyFilterChangeToRouteQuery(
        { city: 'tehran', district: '2', neighborhood: 'saadat-abad', type: 'sale', page: 4 },
        { city: selectedCityFilter },
      ),
    [selectedCityFilter],
  );

  return (
    <div className="space-y-4 text-right" dir="rtl" data-testid="rt-fe-ia-navigation-007-panel">
      {/* Header Banner */}
      <div className="rounded-xl border border-emerald-500/30 bg-slate-900/90 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded bg-emerald-500/20 px-2 py-0.5 font-mono text-[11px] font-bold text-emerald-300">
                {RT_FE_IA_NAVIGATION_007_SPEC_ID} / {RT_FE_INFORMATION_ARCHITECTURE_007_SPEC_ID}
              </span>
              <span className="rounded bg-cyan-500/20 px-2 py-0.5 text-[11px] font-bold text-cyan-300">
                بخش ۷ از ۲۸ — ۱۲ حوزه اطلاعاتی، {RT_FE_IA_20_ENTITIES.length} موجودیت، ناوبری ۵سطحی و ۶ مسیر کاربر
              </span>
            </div>
            <h4 className="mt-1.5 text-sm font-bold text-white">
              مرحله هفتم: طراحی و معماری نظام معماری اطلاعات (IA)، نقشه سایت، سلسله‌مراتب ناوبری و مسیرهای دسترسی کاربران
            </h4>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="rounded-lg border border-slate-700 bg-slate-800/80 px-2.5 py-1 text-slate-200">
              ۱۲ حوزه اطلاعاتی + ۵ سطح ناوبری
            </span>
            <span className="rounded-lg border border-emerald-500/40 bg-emerald-950/50 px-2.5 py-1 font-bold text-emerald-300">
              دروازه مرحله ۸ (Visual Design System): آماده و تاییدشده
            </span>
          </div>
        </div>

        {/* Sub-tabs */}
        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-slate-800 pt-3">
          {[
            { id: 'domains_questions', label: '۱. مدل ذهنی کاربر (۹ پرسش) و ۱۲ حوزه کلان اطلاعاتی' },
            { id: 'nav_levels_graph', label: '۲. ناوبری ۵سطحی (NAV-001..005) و پیوندهای زمینه‌ای گراف موجودیت‌ها' },
            { id: 'journeys_vocab', label: '۳. شش مسیر اصلی کاربر (JOURNEY-001..006) و جدول واژگان رسمی' },
            { id: 'meta_deliverables', label: '۴. قرارداد RadarRouteMeta، ۲۰ موجودیت و خروجی‌ها (IA-OUT-001..023)' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              data-testid={`rt-fe-ia-nav-tab-${tab.id}`}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                activeTab === tab.id
                  ? 'bg-[var(--color-brand-600)] text-white'
                  : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'domains_questions' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-2">
            <h5 className="text-xs font-bold text-emerald-300">۹ پرسش اصلی مدل ذهنی کاربر در رادار تهران</h5>
            {RT_FE_IA_NAV_USER_QUESTIONS_9.map((q) => (
              <div key={q.questionFa} className="rounded border border-slate-800 bg-slate-950/70 p-2 text-xs">
                <div className="font-bold text-white">{q.questionFa}</div>
                <div className="mt-0.5 flex items-center justify-between text-[11px]">
                  <span className="text-emerald-300">{q.domainFa}</span>
                  <span className="font-mono text-cyan-300" dir="ltr">{q.primaryPath}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="lg:col-span-2 rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-2.5">
            <h5 className="text-xs font-bold text-cyan-300">ساختار کلان ۱۲ حوزه اطلاعاتی محصول (IA-OUT-001)</h5>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {RT_FE_IA_NAV_12_DOMAINS.map((dom) => (
                <div key={dom.domainKey} className="rounded-lg border border-slate-800 bg-slate-950/70 p-2.5 text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white">{dom.index}. {dom.titleFa}</span>
                    <span className="font-mono text-[10px] text-indigo-300">{dom.domainKey}</span>
                  </div>
                  <div className="text-[11px] text-slate-300">{dom.subItemsFa.join(' • ')}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'nav_levels_graph' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-2.5 text-xs">
            <h5 className="font-bold text-cyan-300">نظام ناوبری ۵سطحی رادار تهران (NAV-001 تا NAV-005)</h5>
            {RT_FE_IA_NAV_5_LEVELS.map((lvl) => (
              <div key={lvl.code} className="rounded border border-slate-800 bg-slate-950/70 p-2.5 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-emerald-300">{lvl.code} — Level {lvl.level}: {lvl.nameEn}</span>
                </div>
                <div className="font-bold text-white">{lvl.titleFa}</div>
                <div className="text-[11px] text-slate-300">{lvl.examplesFa.join(' | ')}</div>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-3 text-xs">
            <h5 className="font-bold text-indigo-300">
              شبیه‌ساز پیوندهای زمینه‌ای موجودیت‌ها و مدیریت داده ناقص بدون لینک شکسته (NAV-004, NAV-010)
            </h5>
            <div className="flex flex-wrap gap-4 text-slate-200">
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={hasNeighborhoodData}
                  onChange={(e) => setHasNeighborhoodData(e.target.checked)}
                />
                داده محله موجود است (saadat-abad)
              </label>
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={hasBuildingData}
                  onChange={(e) => setHasBuildingData(e.target.checked)}
                />
                داده ساختمان موجود است (BLD-408)
              </label>
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-950 p-3 space-y-2">
              <div className="font-bold text-emerald-300">پیوندهای زمینه‌ای فعال (بدون بن‌بست):</div>
              <div className="flex flex-wrap gap-1.5">
                {contextualLinks.activeLinks.map((lnk) => (
                  <span key={lnk.href} className="rounded bg-slate-800 px-2 py-1 text-[11px] text-slate-200">
                    {lnk.labelFa} (<code className="text-cyan-300" dir="ltr">{lnk.href}</code>)
                  </span>
                ))}
              </div>
              {contextualLinks.missingRelationsNoticeFa.length > 0 && (
                <div className="pt-1 text-[11px] text-amber-300">
                  اعلام شفاف بخش‌های ناقص: {contextualLinks.missingRelationsNoticeFa.join(' | ')}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'journeys_vocab' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 text-xs">
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-2">
            <h5 className="font-bold text-emerald-300">۶ مسیر اصلی حرکت کاربر (User Journeys — JOURNEY-001..006)</h5>
            {RT_FE_IA_NAV_JOURNEYS_6.map((j) => (
              <div key={j.id} className="rounded border border-slate-800 bg-slate-950/70 p-2.5 space-y-1">
                <div className="font-mono font-bold text-cyan-300">{j.id} — {j.titleFa}</div>
                <div className="text-[11px] text-slate-300">{j.stepsFa.join(' ← ')}</div>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-2">
            <h5 className="font-bold text-amber-300">جدول واژگان رسمی و تفکیک معنایی مفاهیم (NAV-012 — IA-OUT-009)</h5>
            <div className="max-h-80 overflow-y-auto space-y-1.5">
              {RT_FE_IA_NAV_VOCABULARY_12.map((v) => (
                <div key={v.technicalTerm} className="rounded border border-slate-800 bg-slate-950/70 p-2">
                  <div className="flex justify-between">
                    <span className="font-bold text-white">{v.canonicalPersianLabel}</span>
                    <span className="font-mono text-indigo-300">{v.technicalTerm}</span>
                  </div>
                  <div className="text-[11px] text-slate-300 mt-0.5">{v.distinctionNoteFa}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'meta_deliverables' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 text-xs">
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-3">
            <h5 className="font-bold text-cyan-300">قرارداد مرکزی RadarRouteMeta و بازنشانی خودکار فیلترها (NAV-008)</h5>
            <div className="flex items-center gap-2">
              <span className="text-slate-300">آزمون تغییر شهر در فیلتر (صفحه ۴ به صفحه ۱):</span>
              {['tehran', 'karaj'].map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setSelectedCityFilter(c)}
                  className={`rounded px-2.5 py-1 font-mono text-[11px] ${
                    selectedCityFilter === c ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
            <div className="rounded border border-slate-800 bg-slate-950 p-2.5 font-mono text-[11px] text-emerald-300" dir="ltr">
              /listings?{filterResetPreview.nextQueryString} (pageResetToOne={String(filterResetPreview.pageResetToOne)})
            </div>

            <div className="max-h-48 overflow-y-auto space-y-1">
              {RT_FE_IA_NAV_ROUTE_META_SAMPLES.map((rm) => (
                <div key={rm.id} className="flex items-center justify-between rounded border border-slate-800 bg-slate-950/60 p-1.5 text-[11px]">
                  <span className="font-bold text-white">{rm.title}</span>
                  <span className="font-mono text-cyan-300" dir="ltr">{rm.path}</span>
                  <span className="font-mono text-amber-300">{rm.domain} / {rm.layout}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-1.5">
            <h5 className="font-bold text-emerald-300">خروجی‌های ۲۳گانه الزامی مرحله هفتم (IA-OUT-001 تا IA-OUT-023)</h5>
            <div className="max-h-72 overflow-y-auto space-y-1">
              {RT_FE_IA_NAV_DELIVERABLES_23.map((del) => (
                <div key={del.id} className="rounded border border-slate-800 bg-slate-950/60 p-1.5 text-[11px] text-slate-200">
                  <span className="font-mono font-bold text-emerald-300">✓ {del.id}: </span>
                  <span>{del.titleFa}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
