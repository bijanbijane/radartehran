import React, { useMemo, useState } from 'react';
import {
  RT_FE_PAGE_TEMPLATES_010_SPEC_ID,
  RT_FE_INFORMATION_ARCHITECTURE_011_SPEC_ID,
  RT_FE_STAGE10_PAGE_TEMPLATES_10,
  RT_FE_IA011_16_CLASSIFICATIONS,
  RT_FE_IA011_57_ENTITIES,
  RT_FE_IA011_MISSING_DATA_STATES_8,
  RT_FE_IA011_CENTRAL_REGISTRIES_10,
  RT_FE_IA011_VISIBILITY_5,
  RT_FE_IA011_DELIVERABLES_35,
  normalizePersianSearchQuery,
  resolveConflictingAttributeObservations,
} from '../services/rtFeIaContent010And011Engine';

export const RtFeIaContent011Subpanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<
    'domains_templates' | 'entities_registries' | 'search_conflict_sim' | 'visibility_deliverables'
  >('domains_templates');
  const [sampleQuery, setSampleQuery] = useState<string>('يوسف\u200cآباد ۱۲۰ متري');
  const [hasVerifiedSource, setHasVerifiedSource] = useState<boolean>(true);

  const normalizedSearch = useMemo(() => normalizePersianSearchQuery(sampleQuery), [sampleQuery]);
  const conflictResolution = useMemo(
    () =>
      resolveConflictingAttributeObservations([
        { sourceId: 'LISTING-A', sourceTrustRank: 60, observedAtIso: '2026-11-10', value: 118, verified: false },
        { sourceId: 'CADASTRE-DOC', sourceTrustRank: 95, observedAtIso: '2026-11-12', value: 115, verified: hasVerifiedSource },
      ]),
    [hasVerifiedSource],
  );

  return (
    <div className="space-y-4 text-right" dir="rtl" data-testid="rt-fe-ia-content-011-panel">
      {/* Header Banner */}
      <div className="rounded-xl border border-teal-500/30 bg-slate-900/90 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded bg-teal-500/20 px-2 py-0.5 font-mono text-[11px] font-bold text-teal-300">
                {RT_FE_PAGE_TEMPLATES_010_SPEC_ID} + {RT_FE_INFORMATION_ARCHITECTURE_011_SPEC_ID}
              </span>
              <span className="rounded bg-cyan-500/20 px-2 py-0.5 text-[11px] font-bold text-cyan-300">
                بخش‌های ۱۰ و ۱۱ از ۲۸ — ۱۰ الگوی صفحه، ۱۶ طبقه اطلاعاتی، ۵۷ موجودیت و ۳۵ خروجی الزامی
              </span>
            </div>
            <h4 className="mt-1.5 text-sm font-bold text-white">
              مراحل دهم و یازدهم: الگوهای صفحات (Page Templates) و نظام معماری اطلاعات و ساختار محتوا (IA-001..IA-031)
            </h4>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="rounded-lg border border-slate-700 bg-slate-800/80 px-2.5 py-1 text-slate-200">
              ۱۰ رجیستری مرکزی + ۵۷ موجودیت
            </span>
            <span className="rounded-lg border border-emerald-500/40 bg-emerald-950/50 px-2.5 py-1 font-bold text-emerald-300">
              دروازه مرحله ۱۲ (Frontend Data Architecture): آماده و تاییدشده
            </span>
          </div>
        </div>

        {/* Sub-tabs */}
        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-slate-800 pt-3">
          {[
            { id: 'domains_templates', label: '۱. ۱۰ الگوی استاندارد صفحه (مرحله ۱۰) و ۱۶ طبقه کلان اطلاعات (IA-001)' },
            { id: 'entities_registries', label: '۲. ۵۷ موجودیت (GEO/RE/BLD/MKT/SRV/RSC) و ۱۰ رجیستری مرکزی (IA-002, IA-027)' },
            { id: 'search_conflict_sim', label: '۳. شبیه‌ساز نرمال‌سازی فارسی (IA-016) و مدیریت داده‌های متناقض/ناقص (IA-025)' },
            { id: 'visibility_deliverables', label: '۴. ۵ سطح محرمانگی (IA-030) و ۳۵ خروجی الزامی (IA-OUT-001..035)' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              data-testid={`rt-fe-ia011-tab-${tab.id}`}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                activeTab === tab.id
                  ? 'bg-teal-600 text-white'
                  : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'domains_templates' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 text-xs">
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-1.5">
            <h5 className="font-bold text-teal-300">۱۰ الگوی استاندارد صفحات محصول (مرحله دهم — RT-FE-PAGE-TEMPLATES-010)</h5>
            {RT_FE_STAGE10_PAGE_TEMPLATES_10.map((tpl) => (
              <div key={tpl.id} className="flex items-center justify-between rounded border border-slate-800 bg-slate-950/70 p-2">
                <div>
                  <span className="font-mono font-bold text-cyan-300">{tpl.id} ({tpl.nameEn}): </span>
                  <span className="text-slate-200">{tpl.titleFa}</span>
                </div>
                <code className="font-mono text-[11px] text-emerald-300" dir="ltr">{tpl.routePattern}</code>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-1.5">
            <h5 className="font-bold text-cyan-300">۱۶ طبقه کلان معماری اطلاعات رادار تهران (IA-001)</h5>
            <div className="max-h-80 overflow-y-auto space-y-1">
              {RT_FE_IA011_16_CLASSIFICATIONS.map((cls) => (
                <div key={cls.code} className="rounded border border-slate-800 bg-slate-950/70 p-2">
                  <div className="font-mono text-[11px] font-bold text-indigo-300" dir="ltr">{cls.code}</div>
                  <div className="text-slate-200">{cls.titleFa}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'entities_registries' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 text-xs">
          <div className="lg:col-span-2 rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-2">
            <h5 className="font-bold text-emerald-300">۵۷ موجودیت رسمی در ۶ خانواده موضوعی (Entity Taxonomy — IA-002)</h5>
            <div className="max-h-72 overflow-y-auto grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {RT_FE_IA011_57_ENTITIES.map((ent) => (
                <div key={ent.id} className="flex items-center justify-between rounded border border-slate-800 bg-slate-950/70 p-1.5 text-[11px]">
                  <span className="text-white font-bold">{ent.titleFa}</span>
                  <span className="font-mono text-cyan-300" dir="ltr">{ent.id} ({ent.nameEn})</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-1.5">
            <h5 className="font-bold text-amber-300">۱۰ رجیستری مرکزی اطلاعات (IA-027)</h5>
            {RT_FE_IA011_CENTRAL_REGISTRIES_10.map((reg) => (
              <div key={reg} className="rounded border border-slate-800 bg-slate-950/70 p-2 font-mono text-[11px] text-teal-300" dir="ltr">
                {reg}
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'search_conflict_sim' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 text-xs">
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-3">
            <h5 className="font-bold text-cyan-300">شبیه‌ساز نرمال‌سازی فارسی جست‌وجو بدون تغییر متن منبع اصلی (IA-016)</h5>
            <input
              type="text"
              value={sampleQuery}
              onChange={(e) => setSampleQuery(e.target.value)}
              className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-1.5 text-white"
            />
            <div className="rounded border border-slate-800 bg-slate-950 p-2.5 space-y-1">
              <div>متن خام منبع (حفظ‌شده): <span className="font-bold text-amber-300">{normalizedSearch.rawPreserved}</span></div>
              <div>نسخه نرمال‌شده جست‌وجو: <span className="font-bold text-emerald-300">{normalizedSearch.normalizedQuery}</span></div>
              <div>تشخیص نوع عبارت: <span className="font-mono text-cyan-300">{normalizedSearch.detectedIntent}</span></div>
            </div>
            <div className="flex flex-wrap gap-1">
              {RT_FE_IA011_MISSING_DATA_STATES_8.map((st) => (
                <span key={st} className="rounded bg-slate-800 px-2 py-0.5 font-mono text-[10px] text-slate-300">{st}</span>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-3">
            <h5 className="font-bold text-indigo-300">شبیه‌ساز حل تعارض مشاهدات متناقض مساحت ملک (IA-008 §11.2 و IA-025)</h5>
            <label className="flex items-center gap-2 text-slate-200">
              <input
                type="checkbox"
                checked={hasVerifiedSource}
                onChange={(e) => setHasVerifiedSource(e.target.checked)}
              />
              سند رسمی کاداستر (۱۱۵ مترمربع) بررسی و تأیید شده است
            </label>
            <div className="rounded border border-slate-800 bg-slate-950 p-3 space-y-1 text-[11px]">
              <div>تعداد مشاهدات حفظ‌شده در تاریخچه: <strong className="text-white">{conflictResolution.preservedCount}</strong> (۱۱۸ متر در آگهی A در برابر ۱۱۵ متر در سند)</div>
              <div>وضعیت داوری: <code className="text-cyan-300">{conflictResolution.resolutionStatus}</code></div>
              <div>مقدار مرجع انتخاب‌شده: <strong className="text-emerald-300">{conflictResolution.referenceValue ?? 'تعارض حل‌نشده (عدم انتخاب خودسرانه)'}</strong></div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'visibility_deliverables' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 text-xs">
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-2">
            <h5 className="font-bold text-amber-300">۵ سطح دسترسی و انتشار محتوا (IA-030)</h5>
            {RT_FE_IA011_VISIBILITY_5.map((vis) => (
              <div key={vis} className="rounded border border-slate-800 bg-slate-950/70 p-2 font-mono text-cyan-300" dir="ltr">
                {vis}
              </div>
            ))}
          </div>

          <div className="lg:col-span-2 rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-1.5">
            <h5 className="font-bold text-emerald-300">۳۵ خروجی الزامی مرحله یازدهم (IA-OUT-001 تا IA-OUT-035)</h5>
            <div className="max-h-72 overflow-y-auto grid grid-cols-1 gap-1 sm:grid-cols-2">
              {RT_FE_IA011_DELIVERABLES_35.map((del) => (
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
