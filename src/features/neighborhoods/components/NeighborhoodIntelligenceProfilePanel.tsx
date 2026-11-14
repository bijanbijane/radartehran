import React, { useMemo, useState } from 'react';
import { FileText, MapPin, Layers, CheckCircle2, AlertTriangle, Sparkles, ChevronDown, ChevronUp } from 'lucide-react';
import {
  buildNeighborhoodIntelligenceProfile,
  NEIGHBORHOOD_SECTION_NAV_8,
  STAGE_17_ACCEPTANCE_CHECKLIST_30,
  STAGE_18_MARKET_INTELLIGENCE_SPEC_20,
  type AccessibilityDistanceMode,
  type AnyNeighborhoodInput,
  type NeighborhoodInternalSectionId,
  type NeighborhoodMarketTabId,
} from '../services/neighborhoodProfileEngine';
import { formatMillionTomanAsIntlCurrency } from '../../../utils/areaUnit';

export interface NeighborhoodIntelligenceProfilePanelProps {
  hood: AnyNeighborhoodInput;
  allNeighborhoods?: readonly AnyNeighborhoodInput[];
  dealPricePerSqm?: number;
}

export const NeighborhoodIntelligenceProfilePanel: React.FC<NeighborhoodIntelligenceProfilePanelProps> = ({
  hood, allNeighborhoods = [], dealPricePerSqm,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<NeighborhoodInternalSectionId>('overview');
  const [marketTab, setMarketTab] = useState<NeighborhoodMarketTabId>('sale');
  const [distanceMode, setDistanceMode] = useState<AccessibilityDistanceMode>('direct_distance');

  const profile = useMemo(
    () => buildNeighborhoodIntelligenceProfile(hood, allNeighborhoods.length ? allNeighborhoods : [hood], 'tehran', dealPricePerSqm),
    [hood, allNeighborhoods, dealPricePerSqm]
  );

  return (
    <div className="mt-3 rounded-xl border border-indigo-200/80 dark:border-indigo-800/50 bg-white/95 dark:bg-slate-900/90 p-3 shadow-sm" dir="rtl" data-testid="neighborhood-intelligence-profile-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-md bg-indigo-50 dark:bg-indigo-950/70 px-2 py-0.5 text-[11px] font-bold text-indigo-700 dark:text-indigo-300">
            <FileText className="w-3.5 h-3.5" /> شناسنامه جامع محله (RT-UI-NEIGHBORHOOD-001)
          </span>
          <span className="rounded bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:text-slate-300">
            {profile.boundary.statusLabelFa} · {profile.boundary.version}
          </span>
          <span className="rounded bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
            بلوغ پرونده: {profile.maturityLabelFa}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          data-testid="toggle-neighborhood-dossier-btn"
          className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 px-2.5 py-1 text-[11px] font-bold text-white transition-colors cursor-pointer"
        >
          <span>{isOpen ? 'بستن پرونده ۱۱ بخشی' : 'باز کردن پرونده ۱۱ بخشی محله'}</span>
          {isOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      </div>

      {isOpen && (
        <div className="mt-3 space-y-3 border-t border-slate-200/80 dark:border-slate-800 pt-3">
          <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100/90 dark:bg-slate-800/80 p-1" role="tablist" aria-label="بخش‌های شناسنامه محله">
            {NEIGHBORHOOD_SECTION_NAV_8.map((sec) => (
              <button
                key={sec.id} type="button" role="tab" aria-selected={activeSection === sec.id}
                onClick={() => setActiveSection(sec.id)} data-testid={`nbh-section-tab-${sec.id}`}
                className={`rounded-md px-2.5 py-1 text-[11px] font-bold transition-colors cursor-pointer ${
                  activeSection === sec.id ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-300 hover:bg-white/60 dark:hover:bg-slate-700/50'
                }`}
              >
                {sec.labelFa}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {profile.quickMetrics.map((m) => (
              <div key={m.id} data-testid={`nbh-metric-${m.id}`} className="rounded-lg border border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 p-2.5">
                <div className="flex items-center justify-between gap-1 text-[10px] text-slate-500 dark:text-slate-400">
                  <span>{m.title}</span>
                  <span className="rounded bg-slate-200/70 dark:bg-slate-700 px-1.5 py-0.5 text-[9px] font-bold">{m.dataQuality}</span>
                </div>
                <div className="mt-1 text-sm font-black text-slate-900 dark:text-white">
                  {m.formattedValue} <span className="text-[10px] font-normal text-slate-500">{m.unit}</span>
                </div>
                {m.comparisonLabel && <p className="mt-1 text-[10px] font-semibold text-indigo-600 dark:text-indigo-400">{m.comparisonLabel}</p>}
                {m.zeroVsNullNote && <p className="mt-1 text-[10px] text-amber-700 dark:text-amber-300">{m.zeroVsNullNote}</p>}
              </div>
            ))}
          </div>

          {activeSection === 'overview' && (
            <div className="space-y-2 text-xs text-slate-700 dark:text-slate-300">
              <p className="leading-relaxed font-medium">{profile.content.summary}</p>
              <div className="flex flex-wrap gap-2 text-[11px]">
                <span className="rounded bg-slate-100 dark:bg-slate-800 px-2 py-0.5">مسیر استاندارد: <code dir="ltr">{profile.identity.canonicalPath}</code></span>
                <span className="rounded bg-slate-100 dark:bg-slate-800 px-2 py-0.5">مساحت مرز: {profile.boundary.areaKm2} کیلومترمربع</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                <div className="rounded-lg border border-emerald-200/70 dark:border-emerald-900/40 bg-emerald-50/40 dark:bg-emerald-950/20 p-2">
                  <div className="font-bold text-emerald-800 dark:text-emerald-300 mb-1">نقاط قوت شاخص (مبتنی بر داده)</div>
                  <ul className="list-disc list-inside space-y-0.5 text-[11px]">{profile.content.strengths.map((s, idx) => <li key={idx}>{s}</li>)}</ul>
                </div>
                <div className="rounded-lg border border-amber-200/70 dark:border-amber-900/40 bg-amber-50/40 dark:bg-amber-950/20 p-2">
                  <div className="font-bold text-amber-800 dark:text-amber-300 mb-1">چالش‌ها و محدودیت‌های محله</div>
                  <ul className="list-disc list-inside space-y-0.5 text-[11px]">{profile.content.challenges.map((c, idx) => <li key={idx}>{c}</li>)}</ul>
                </div>
              </div>
            </div>
          )}

          {activeSection === 'market' && (
            <div className="space-y-2 text-xs">
              <div className="flex flex-wrap items-center gap-1">
                {([
                  { id: 'sale', label: 'فروش' }, { id: 'rent', label: 'اجاره' }, { id: 'supply', label: 'عرضه' },
                  { id: 'price-distribution', label: 'توزیع قیمت' }, { id: 'historical-changes', label: 'تغییرات تاریخی' },
                ] as const).map((t) => (
                  <button
                    key={t.id} type="button" onClick={() => setMarketTab(t.id)}
                    className={`rounded px-2 py-0.5 text-[11px] font-bold cursor-pointer ${
                      marketTab === t.id ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              {profile.marketSampleWarningFa && (
                <div className="flex items-center gap-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 px-2.5 py-1.5 text-[11px] text-amber-800 dark:text-amber-300">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> <span>{profile.marketSampleWarningFa}</span>
                </div>
              )}
              <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-2.5 text-[11px] space-y-1">
                <div className="font-bold text-slate-900 dark:text-white">تحلیل زبانه «{marketTab}» — تفکیک از ارزش‌گذاری ملک منفرد (Hedonic)</div>
                <p className="text-slate-600 dark:text-slate-400">
                  میانه پیشنهادی محله ({formatMillionTomanAsIntlCurrency(hood.buyPerSqm, 'IRT', 'fa')}) شاخص مکانی است و جایگزین ارزش‌گذاری هدونیک تک‌ملک نمی‌شود.
                </p>
              </div>
            </div>
          )}

          {activeSection === 'physical' && (
            <div className="space-y-2 text-xs">
              <div className="text-[11px] font-bold text-slate-700 dark:text-slate-300">{profile.landUseDenominatorLabelFa}</div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {profile.landUseShares.map((item) => (
                  <div key={item.id} className="rounded-lg border border-slate-200 dark:border-slate-800 p-2 text-[11px]">
                    <div className="font-bold text-slate-800 dark:text-slate-200">{item.labelFa}</div>
                    <div className="text-sm font-black text-indigo-600 dark:text-indigo-400">{item.sharePercent}%</div>
                    <div className="mt-0.5 flex items-center gap-1 text-[10px] text-slate-500"><Layers className="w-3 h-3" /><span>لایه: {item.layerId}</span></div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeSection === 'amenities' && (
            <div className="space-y-2 text-xs">
              <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                <span className="font-bold text-slate-700 dark:text-slate-300">معیار فاصله:</span>
                <button type="button" onClick={() => setDistanceMode('direct_distance')} className={`rounded px-2 py-0.5 font-bold cursor-pointer ${distanceMode === 'direct_distance' ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}`}>فاصله مستقیم</button>
                <button type="button" onClick={() => setDistanceMode('walking_network')} className={`rounded px-2 py-0.5 font-bold cursor-pointer ${distanceMode === 'walking_network' ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}`}>مسیر پیاده</button>
                <button type="button" disabled title="گراف زمان سفر خودرویی لحظه‌ای در این نسخه فعال نیست" className="rounded px-2 py-0.5 font-bold bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed">مسیر خودرویی (غیرفعال — بدون گراف ترافیکی)</button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {profile.amenities.map((am) => (
                  <div key={am.categoryId} className="rounded-lg border border-slate-200 dark:border-slate-800 p-2 text-[11px]">
                    <div className="font-bold text-slate-900 dark:text-white">{am.categoryTitleFa}</div>
                    <div className="text-slate-600 dark:text-slate-400 mt-0.5">
                      فاصله ({distanceMode === 'direct_distance' ? 'مستقیم' : 'شبکه پیاده'}): <strong className="text-slate-900 dark:text-white">{distanceMode === 'direct_distance' ? am.nearestDirectMeters : am.walkingNetworkMeters ?? '—'} متر</strong>
                    </div>
                    <div className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-0.5">{am.coverageStatusFa}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(activeSection === 'environment' || activeSection === 'history' || activeSection === 'compare' || activeSection === 'sources') && (
            <div className="space-y-2 text-[11px] text-slate-700 dark:text-slate-300">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-2">
                  <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1"><MapPin className="w-3.5 h-3.5 text-indigo-500" /> تفکیک محله‌های مجاور (مرز مشترک) و نزدیک (شعاع مکانی)</div>
                  <div className="mt-1 space-y-1">
                    {profile.adjacentNeighborhoods.map((rel) => (
                      <div key={rel.id} className="flex items-center justify-between"><span>{rel.name}</span><span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-bold">{rel.relationBadgeFa} ({rel.distanceKm} km)</span></div>
                    ))}
                    {profile.nearbyNeighborhoods.map((rel) => (
                      <div key={rel.id} className="flex items-center justify-between"><span>{rel.name}</span><span className="text-[10px] text-slate-500 font-semibold">{rel.relationBadgeFa} ({rel.distanceKm} km)</span></div>
                    ))}
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-2">
                  <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> مشارکت محلی (تفکیک ۳گانه) و پیش‌نیاز مرحله ۱۸</div>
                  <div className="mt-1 space-y-1">
                    {profile.contributions.map((c) => (
                      <div key={c.id} className="text-[10px]"><span className="font-bold text-indigo-600 dark:text-indigo-400">[{c.streamLabelFa} · {c.moderationStatus}]</span> {c.textFa}</div>
                    ))}
                    <div className="pt-1 text-[10px] text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
                      <Sparkles className="w-3 h-3" />
                      <span>۳۰ معیار پذیرش Stage 17 ({STAGE_17_ACCEPTANCE_CHECKLIST_30.length}/30) و ۲۰ سرفصل Stage 18 ({STAGE_18_MARKET_INTELLIGENCE_SPEC_20.length}/20) آماده است.</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
