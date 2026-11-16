/**
 * @file src/features/home/sections/HomeMarketAndMethodologySections.tsx
 * @description Stage 14 (RT-UI-HOME-001 Sections 14.6, 14.7, 14.9, 14.10, 14.11, 14.12)
 */
import React from 'react';
import { Map as MapIcon, Compass, LineChart, Building2, Calculator, BookOpen, ArrowLeft, ShieldCheck } from 'lucide-react';
import type { EvaluatedNeighborhood } from '../../../data/neighborhoods';
import { MULTI_CITY_CONFIGS } from '../../../data/multiCityData';
import type { CityId } from '../../../types/models';
import type { PrimaryViewId } from '../../../utils/areaUnit';
import type { ModuleSubTabId } from '../../../navigation/registry/route.types';
import {
  HOME_ACCEPTANCE_CHECKLIST_18, HOME_DATA_QUALITY_BADGES, HOME_METHODOLOGY_PILLARS,
  HOME_QUICK_ACCESS_ITEMS, HOME_RESEARCH_REPORTS, STAGE_15_MAP_ARCHITECTURE_SPEC,
  buildHomeMarketSnapshotMetrics, buildPrivacySafeHomeTelemetry,
} from '../services/homeDataAdapter';
import type { HomeQuickAccessItem, HomeResilienceScenarioId } from '../types/home.types';

export interface HomeMarketAndMethodologyProps {
  evaluatedNeighborhoods: readonly EvaluatedNeighborhood[];
  activeCity: CityId;
  resilienceScenario: HomeResilienceScenarioId;
  onChangeResilienceScenario: (s: HomeResilienceScenarioId) => void;
  onNavigateView: (view: PrimaryViewId, subTab?: ModuleSubTabId) => void;
  onOpenHedonic: () => void;
  onRecordTelemetry?: (event: ReturnType<typeof buildPrivacySafeHomeTelemetry>) => void;
}

function renderQuickAccessIcon(iconName: HomeQuickAccessItem['iconName']) {
  const cls = 'w-4 h-4 text-[#176B63] dark:text-emerald-400 shrink-0';
  switch (iconName) {
    case 'map': return <MapIcon className={cls} aria-hidden="true" />;
    case 'compass': return <Compass className={cls} aria-hidden="true" />;
    case 'chart': return <LineChart className={cls} aria-hidden="true" />;
    case 'building': return <Building2 className={cls} aria-hidden="true" />;
    case 'calculator': return <Calculator className={cls} aria-hidden="true" />;
    case 'book': return <BookOpen className={cls} aria-hidden="true" />;
  }
}

export const QuickAccessAndMarketSnapshotSection: React.FC<HomeMarketAndMethodologyProps> = (p) => {
  const activeCityNameFa = MULTI_CITY_CONFIGS[p.activeCity]?.nameFa || 'تهران';
  const metrics = React.useMemo(
    () => buildHomeMarketSnapshotMetrics(p.evaluatedNeighborhoods, p.activeCity, p.resilienceScenario),
    [p.evaluatedNeighborhoods, p.activeCity, p.resilienceScenario],
  );

  return (
    <div className="space-y-10">
      <section aria-labelledby="home-quick-access-heading" data-testid="home-quick-access-section" className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h2 id="home-quick-access-heading" className="text-lg sm:text-xl font-extrabold text-[#182522] dark:text-white">از کجا شروع کنیم؟</h2>
          <span className="text-xs text-[#34433E] dark:text-slate-400">۶ مسیر اصلی ورود به رادار {activeCityNameFa}</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {HOME_QUICK_ACCESS_ITEMS.map((item) => (
            <button
              key={item.id} type="button" data-testid={`home-quick-access-${item.id}`}
              onClick={() => { if (item.intentId === 'estimate_property_value') p.onOpenHedonic(); else p.onNavigateView(item.targetView, item.targetSubTab); }}
              className={`min-h-[104px] p-3.5 rounded-[12px] border text-start flex flex-col justify-between transition cursor-pointer ${
                item.visualWeight === 'primary'
                  ? 'bg-[#F1F4F2] dark:bg-emerald-950/30 border-[#176B63]/40 hover:border-[#176B63]'
                  : 'bg-white dark:bg-slate-900 border-[#DCE3DF] dark:border-slate-800 hover:bg-[#F6F8F6] dark:hover:bg-slate-800/70 hover:border-[#176B63]/50'
              }`}
            >
              <div className="flex items-center justify-between gap-2">{renderQuickAccessIcon(item.iconName)}<ArrowLeft className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" /></div>
              <div className="mt-2">
                <div className="text-xs sm:text-sm font-bold text-[#182522] dark:text-white">{item.titleFa}</div>
                <div className="text-[11px] text-[#34433E] dark:text-slate-400 mt-0.5 leading-snug">{item.descriptionFa}</div>
              </div>
            </button>
          ))}
        </div>
      </section>

      <section aria-labelledby="home-market-snapshot-heading" data-testid="home-market-snapshot-section" className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <h2 id="home-market-snapshot-heading" className="text-lg sm:text-xl font-extrabold text-[#182522] dark:text-white">نمایی از بازار املاک {activeCityNameFa}</h2>
            <p className="text-xs sm:text-sm text-[#34433E] dark:text-slate-400 mt-1">شاخص‌های منتخب بازار بر اساس داده‌های در دسترس و محدوده زمانی مشخص.</p>
          </div>
          <div role="group" aria-label="شبیه‌ساز وضعیت داده بازار" className="flex flex-wrap items-center gap-1 bg-[#F1F4F2] dark:bg-slate-800 p-1 rounded-[8px] border border-[#DCE3DF] dark:border-slate-700 text-[11px]">
            {([
              { id: 'normal', label: 'وضعیت عادی' }, { id: 'partial_data', label: 'داده ناقص' },
              { id: 'old_data', label: 'داده قدیمی' }, { id: 'market_unavailable', label: 'عدم دسترسی بازار' },
            ] as const).map((sc) => (
              <button
                key={sc.id} type="button" data-testid={`home-resilience-${sc.id}`} aria-pressed={p.resilienceScenario === sc.id}
                onClick={() => p.onChangeResilienceScenario(sc.id)}
                className={`px-2 py-1 rounded-[6px] font-bold transition cursor-pointer whitespace-nowrap ${
                  p.resilienceScenario === sc.id ? 'bg-white dark:bg-slate-900 text-[#182522] dark:text-white shadow-2xs' : 'text-[#34433E] dark:text-slate-400'
                }`}
              >
                {sc.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {metrics.map((m) => {
            const qBadge = HOME_DATA_QUALITY_BADGES[m.quality];
            const isMissing = m.value === null || m.quality === 'unavailable' || m.quality === 'incomplete';
            return (
              <article key={m.id} data-testid={`home-market-metric-${m.id}`} className="p-4 rounded-[12px] bg-white dark:bg-slate-900 border border-[#DCE3DF] dark:border-slate-800 flex flex-col justify-between space-y-3">
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-xs sm:text-sm font-bold text-[#182522] dark:text-white">{m.title}</h3>
                    <span className={`px-2 py-0.5 rounded-[6px] border text-[10px] font-bold whitespace-nowrap shrink-0 ${qBadge.badgeClass}`}>
                      <span aria-hidden="true">{qBadge.symbol} </span><span>{m.quality}</span>
                    </span>
                  </div>
                  <div className="text-2xl font-black text-[#182522] dark:text-white tabular-nums">{isMissing ? '—' : m.formattedValue}</div>
                  {!isMissing && <div className="text-[11px] text-[#34433E] dark:text-slate-400">{m.unit} · {m.dataTypeLabelFa}</div>}
                  {m.limitationNote && <p className="text-[11px] text-[#34433E] dark:text-slate-400 leading-relaxed">{m.limitationNote}</p>}
                </div>
                <dl className="pt-2.5 border-t border-[#DCE3DF]/70 dark:border-slate-800 text-[10.5px] text-slate-500 dark:text-slate-400 space-y-1 tabular-nums">
                  <div className="flex justify-between gap-2"><dt>محدوده پوشش:</dt><dd className="font-semibold text-[#182522] dark:text-slate-200">{m.geography.cityLabelFa}</dd></div>
                  <div className="flex justify-between gap-2"><dt>تاریخ:</dt><dd className="font-semibold text-[#182522] dark:text-slate-200">{m.updatedAt || 'نامشخص'}</dd></div>
                  <div className="flex justify-between gap-2"><dt>منبع:</dt><dd className="truncate max-w-[160px] text-[#182522] dark:text-slate-200">{m.sourceLabels.join('، ')}</dd></div>
                  <div className="flex justify-between gap-2"><dt>روش:</dt><dd className="truncate max-w-[160px] text-[#182522] dark:text-slate-200">{m.methodologyLabelFa}</dd></div>
                </dl>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
};

export const ResearchServicesAndMethodologySection: React.FC<HomeMarketAndMethodologyProps> = (p) => {
  const activeCityNameFa = MULTI_CITY_CONFIGS[p.activeCity]?.nameFa || 'تهران';
  return (
    <div className="space-y-10">
      <section aria-labelledby="home-research-heading" data-testid="home-research-section" className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 id="home-research-heading" className="text-lg sm:text-xl font-extrabold text-[#182522] dark:text-white">داده‌ها و تحلیل‌های شهری</h2>
            <p className="text-xs text-[#34433E] dark:text-slate-400 mt-0.5">گزارش‌های تحلیلی مستقل با تاریخ انتشار، محدوده جغرافیایی و قابلیت ردیابی تا منبع داده</p>
          </div>
          <button type="button" onClick={() => p.onNavigateView('knowledge', 'reports')} className="text-xs font-bold text-[#176B63] dark:text-emerald-400 hover:underline cursor-pointer shrink-0">مرکز پژوهش ←</button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {HOME_RESEARCH_REPORTS.map((rep) => (
            <article key={rep.id} data-testid={`home-research-card-${rep.id}`} className="p-4 rounded-[12px] bg-white dark:bg-slate-900 border border-[#DCE3DF] dark:border-slate-800 flex flex-col justify-between space-y-3">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2 text-[11px] text-[#34433E] dark:text-slate-400">
                  <span className="font-bold text-[#176B63] dark:text-emerald-400">{rep.categoryLabelFa}</span>
                  <span>{rep.status === 'archived' ? 'وضعیت: آرشیوی' : 'گزارش تحلیلی'}</span>
                </div>
                <h3 className="text-sm sm:text-base font-bold text-[#182522] dark:text-white leading-snug">{rep.titleFa}</h3>
                <p className="text-xs text-[#34433E] dark:text-slate-400 leading-relaxed">{rep.summaryFa}</p>
              </div>
              <div className="pt-3 border-t border-[#DCE3DF]/70 dark:border-slate-800 space-y-2 text-[11px]">
                <div className="flex items-center justify-between text-slate-500">
                  <span>تاریخ انتشار: <strong className="text-[#182522] dark:text-slate-200">{rep.publishedAtFa || '—'}</strong></span>
                  <span>محدوده: <strong className="text-[#182522] dark:text-slate-200">{rep.geographyScopeFa}</strong></span>
                </div>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[10.5px] text-slate-400 truncate max-w-[180px]">{rep.sourceTraceFa}</span>
                  <button
                    type="button"
                    onClick={() => { p.onRecordTelemetry?.(buildPrivacySafeHomeTelemetry('home_report_open', { cityId: p.activeCity, targetDestination: rep.id })); p.onNavigateView(rep.targetView, rep.targetSubTab); }}
                    className="font-bold text-[#176B63] dark:text-emerald-400 hover:underline cursor-pointer shrink-0"
                  >
                    مشاهده گزارش ←
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="home-property-services-heading" data-testid="home-property-services-section" className="space-y-3">
        <h2 id="home-property-services-heading" className="text-base sm:text-lg font-extrabold text-[#182522] dark:text-white">دسترسی به املاک و خدمات تخصصی</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-4 sm:p-5 rounded-[12px] bg-white dark:bg-slate-900 border border-[#DCE3DF] dark:border-slate-800 flex items-center justify-between gap-4">
            <div className="space-y-1">
              <h3 className="text-sm sm:text-base font-bold text-[#182522] dark:text-white">املاک</h3>
              <p className="text-xs text-[#34433E] dark:text-slate-400">جست‌وجوی فایل‌های خرید، اجاره، تجاری و اداری.</p>
            </div>
            <button
              type="button" data-testid="home-open-properties-btn"
              onClick={() => { p.onRecordTelemetry?.(buildPrivacySafeHomeTelemetry('home_property_open', { cityId: p.activeCity, targetDestination: '/properties' })); p.onNavigateView('properties', 'all'); }}
              className="min-h-[44px] px-3.5 py-2 rounded-[8px] bg-[#F1F4F2] dark:bg-slate-800 hover:bg-[#DCE3DF]/60 text-xs font-bold text-[#182522] dark:text-white shrink-0 cursor-pointer"
            >
              مشاهده املاک ←
            </button>
          </div>
          <div className="p-4 sm:p-5 rounded-[12px] bg-white dark:bg-slate-900 border border-[#DCE3DF] dark:border-slate-800 flex items-center justify-between gap-4">
            <div className="space-y-1">
              <h3 className="text-sm sm:text-base font-bold text-[#182522] dark:text-white">خدمات تخصصی</h3>
              <p className="text-xs text-[#34433E] dark:text-slate-400">دسترسی به متخصصان و خدمات مرتبط با ملک و ساختمان.</p>
            </div>
            <button type="button" data-testid="home-open-services-btn" onClick={() => p.onNavigateView('services', 'valuation')} className="min-h-[44px] px-3.5 py-2 rounded-[8px] bg-[#F1F4F2] dark:bg-slate-800 hover:bg-[#DCE3DF]/60 text-xs font-bold text-[#182522] dark:text-white shrink-0 cursor-pointer">
              مشاهده خدمات ←
            </button>
          </div>
        </div>
      </section>

      <section aria-labelledby="home-methodology-heading" data-testid="home-methodology-section" className="p-4 sm:p-6 rounded-[12px] bg-white dark:bg-slate-900 border border-[#DCE3DF] dark:border-slate-800 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#DCE3DF]/80 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-[#176B63]" aria-hidden="true" />
            <h2 id="home-methodology-heading" className="text-base sm:text-lg font-extrabold text-[#182522] dark:text-white">اطلاعات را با منبع و زمینه آن بررسی کنید.</h2>
          </div>
          <span className="text-xs font-bold text-[#176B63] dark:text-emerald-400 tabular-nums">
            کنترل پذیرش صفحه خانه: {HOME_ACCEPTANCE_CHECKLIST_18.length}/{HOME_ACCEPTANCE_CHECKLIST_18.length} · معماری نقشه (RT-UI-MAP-001): {STAGE_15_MAP_ARCHITECTURE_SPEC.length}/15
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {HOME_METHODOLOGY_PILLARS.map((pil) => (
            <div key={pil.id} className="p-3.5 rounded-[10px] bg-[#F6F8F6] dark:bg-slate-800/70 border border-[#DCE3DF]/80 dark:border-slate-700 space-y-1">
              <div className="text-xs font-extrabold text-[#182522] dark:text-white">{pil.titleFa} · {pil.questionFa}</div>
              <p className="text-[11px] text-[#34433E] dark:text-slate-300 leading-relaxed">{pil.explanationFa}</p>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px]">
          <span className="font-bold text-[#34433E] dark:text-slate-400">وضعیت‌های استاندارد داده در سیستم طراحی:</span>
          {Object.values(HOME_DATA_QUALITY_BADGES).map((b) => (
            <span key={b.code} title={b.meaningFa} className={`px-2.5 py-1 rounded-[6px] border font-semibold ${b.badgeClass}`}>
              <span aria-hidden="true">{b.symbol} </span><span>{b.labelFa}</span>
            </span>
          ))}
        </div>
      </section>

      <footer aria-label={`فوتر صفحه خانه رادار ${activeCityNameFa}`} data-testid="home-quiet-footer" className="pt-6 border-t border-[#DCE3DF] dark:border-slate-800 space-y-6 text-xs text-[#34433E] dark:text-slate-400">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
          <div className="space-y-2">
            <div className="font-bold text-[#182522] dark:text-white">رادار {activeCityNameFa}</div>
            <ul className="space-y-1.5">
              <li><button type="button" onClick={() => p.onNavigateView('knowledge', 'guide')} className="hover:text-[#176B63] cursor-pointer">درباره و معرفی محصول</button></li>
              <li><button type="button" onClick={() => p.onNavigateView('contributions', 'submit')} className="hover:text-[#176B63] cursor-pointer">مشارکت و ارتباط</button></li>
            </ul>
          </div>
          <div className="space-y-2">
            <div className="font-bold text-[#182522] dark:text-white">کاوش</div>
            <ul className="space-y-1.5">
              <li><button type="button" onClick={() => p.onNavigateView('map')} className="hover:text-[#176B63] cursor-pointer">نقشه تعاملی</button></li>
              <li><button type="button" onClick={() => p.onNavigateView('discover')} className="hover:text-[#176B63] cursor-pointer">محله‌ها و مناطق</button></li>
            </ul>
          </div>
          <div className="space-y-2">
            <div className="font-bold text-[#182522] dark:text-white">بازار و ابزارها</div>
            <ul className="space-y-1.5">
              <li><button type="button" onClick={() => p.onNavigateView('intelligence', 'overview')} className="hover:text-[#176B63] cursor-pointer">تحلیل بازار</button></li>
              <li><button type="button" onClick={() => p.onNavigateView('properties', 'all')} className="hover:text-[#176B63] cursor-pointer">املاک</button></li>
              <li><button type="button" onClick={p.onOpenHedonic} className="hover:text-[#176B63] cursor-pointer">ارزش‌گذاری هدونیک</button></li>
            </ul>
          </div>
          <div className="space-y-2">
            <div className="font-bold text-[#182522] dark:text-white">اطلاعات</div>
            <ul className="space-y-1.5">
              <li><button type="button" onClick={() => p.onNavigateView('knowledge', 'reports')} className="hover:text-[#176B63] cursor-pointer">گزارش‌ها</button></li>
              <li><button type="button" onClick={() => p.onNavigateView('knowledge', 'methodology')} className="hover:text-[#176B63] cursor-pointer">روش‌شناسی داده</button></li>
              <li><button type="button" onClick={() => p.onNavigateView('userspace', 'settings')} className="hover:text-[#176B63] cursor-pointer">حریم خصوصی و تنظیمات</button></li>
            </ul>
          </div>
        </div>
        <div className="pt-4 border-t border-[#DCE3DF]/60 dark:border-slate-800/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-[11px] text-slate-500">
          <span>رادار {activeCityNameFa} — دروازه شناخت مکانی، تحلیل بازار و اطلاعات شهری (نسخه RT-UI-HOME-001)</span>
          <span>تمامی شاخص‌ها با ذکر منبع، بازه زمانی و سطح اعتبار داده منتشر می‌شوند.</span>
        </div>
      </footer>
    </div>
  );
};
