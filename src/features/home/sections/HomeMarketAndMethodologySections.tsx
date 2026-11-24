/**
 * @file src/features/home/sections/HomeMarketAndMethodologySections.tsx
 * @description Stage 14 (RT-UI-HOME-001) — Streamlined Market Snapshot, Decision Toolbox Launchpad, Research Briefs & Methodology Trust Strip (AUD-002, AUD-003, AUD-007, AUD-008).
 */
import React from 'react';
import { Calculator, ShieldCheck, SlidersHorizontal, FileCheck2, ArrowLeft } from 'lucide-react';
import type { EvaluatedNeighborhood } from '../../../data/neighborhoods';
import { MULTI_CITY_CONFIGS } from '../../../data/multiCityData';
import type { CityId } from '../../../types/models';
import type { PrimaryViewId } from '../../../utils/areaUnit';
import type { ModuleSubTabId } from '../../../navigation/registry/route.types';
import { RadarLink } from '../../../components/ui/RadarPrimitives';
import {
  HOME_DATA_QUALITY_BADGES,
  HOME_METHODOLOGY_PILLARS,
  HOME_RESEARCH_REPORTS,
  buildHomeMarketSnapshotMetrics,
  buildPrivacySafeHomeTelemetry,
} from '../services/homeDataAdapter';
import type { HomeResilienceScenarioId } from '../types/home.types';

function isHomeDevQueryEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get('dev') === '1' || params.get('diag') === '1';
  } catch {
    return false;
  }
}

export interface HomeMarketAndMethodologyProps {
  evaluatedNeighborhoods: readonly EvaluatedNeighborhood[];
  activeCity: CityId;
  resilienceScenario: HomeResilienceScenarioId;
  onChangeResilienceScenario: (s: HomeResilienceScenarioId) => void;
  onNavigateView: (view: PrimaryViewId, subTab?: ModuleSubTabId) => void;
  onOpenHedonic: () => void;
  onRecordTelemetry?: (event: ReturnType<typeof buildPrivacySafeHomeTelemetry>) => void;
}

const TOOLBOX_CARDS: ReadonlyArray<{
  id: string;
  href: string;
  titleFa: string;
  descFa: string;
  subTab: ModuleSubTabId;
  icon: 'valuation' | 'budget' | 'verifier';
}> = [
  {
    id: 'valuation',
    href: '/tools/valuation',
    titleFa: 'ارزش‌گذاری هدونیک ملک',
    descFa: 'برآورد بازه قیمت منصفانه بر اساس متراژ، سن بنا، طبقه، پارکینگ و امکانات.',
    subTab: 'valuation',
    icon: 'valuation',
  },
  {
    id: 'budget-fit',
    href: '/tools/budget-fit',
    titleFa: 'تطبیق بودجه و محله‌ها',
    descFa: 'تشخیص سریع محله‌های سازگار با بودجه خرید یا رهن و اجاره شما.',
    subTab: 'budget_fit',
    icon: 'budget',
  },
  {
    id: 'verifier',
    href: '/tools/verifier',
    titleFa: 'سنجش قیمت آگهی',
    descFa: 'بررسی عادلانه‌بودن قیمت یک آگهی واقعی در مقایسه با میانگین محله.',
    subTab: 'verifier',
    icon: 'verifier',
  },
];

export const QuickAccessAndMarketSnapshotSection: React.FC<HomeMarketAndMethodologyProps> = (p) => {
  const activeCityNameFa = MULTI_CITY_CONFIGS[p.activeCity]?.nameFa || 'تهران';
  const showQaSimulator = isHomeDevQueryEnabled();
  const metrics = React.useMemo(
    () => buildHomeMarketSnapshotMetrics(p.evaluatedNeighborhoods, p.activeCity, p.resilienceScenario),
    [p.evaluatedNeighborhoods, p.activeCity, p.resilienceScenario],
  );

  return (
    <div className="space-y-8">
      <section aria-labelledby="home-market-snapshot-heading" data-testid="home-market-snapshot-section" className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <h2 id="home-market-snapshot-heading" className="text-lg sm:text-xl font-extrabold text-[var(--color-text-primary)]">
              نمایی از بازار املاک {activeCityNameFa}
            </h2>
            <p className="text-xs sm:text-sm text-[var(--color-text-secondary)] mt-1">
              شاخص‌های منتخب بازار با تفکیک قیمت پیشنهادی، برآورد معامله و تاریخ به‌روزرسانی.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {showQaSimulator && (
              <div role="group" aria-label="شبیه‌ساز وضعیت داده بازار" className="flex flex-wrap items-center gap-1 bg-[var(--color-bg-muted)] p-1 rounded-[8px] border border-[var(--color-border-subtle)] text-xs">
                {([
                  { id: 'normal', label: 'وضعیت عادی' },
                  { id: 'partial_data', label: 'داده ناقص' },
                  { id: 'old_data', label: 'داده قدیمی' },
                  { id: 'market_unavailable', label: 'عدم دسترسی بازار' },
                ] as const).map((sc) => (
                  <button
                    key={sc.id}
                    type="button"
                    data-testid={`home-resilience-${sc.id}`}
                    aria-pressed={p.resilienceScenario === sc.id}
                    onClick={() => p.onChangeResilienceScenario(sc.id)}
                    className={`px-2 py-1 rounded-[6px] font-bold transition cursor-pointer whitespace-nowrap ${
                      p.resilienceScenario === sc.id ? 'bg-[var(--color-bg-surface)] text-[var(--color-text-primary)] shadow-2xs' : 'text-[var(--color-text-secondary)]'
                    }`}
                  >
                    {sc.label}
                  </button>
                ))}
              </div>
            )}
            <RadarLink
              href="/market"
              onNavigate={() => p.onNavigateView('intelligence', 'overview')}
              className="min-h-[44px] md:min-h-[32px] inline-flex items-center px-1 text-xs font-bold text-[var(--color-brand-fg)] hover:underline gap-1"
            >
              <span>تحلیل کامل بازار</span>
              <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
            </RadarLink>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {metrics.map((m) => {
            const qBadge = HOME_DATA_QUALITY_BADGES[m.quality];
            const isMissing = m.value === null || m.quality === 'unavailable' || m.quality === 'incomplete';
            return (
              <article
                key={m.id}
                data-testid={`home-market-metric-${m.id}`}
                className="p-4 rounded-[12px] bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] flex flex-col justify-between space-y-3"
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-xs sm:text-sm font-bold text-[var(--color-text-primary)]">{m.title}</h3>
                    <span className={`px-2 py-0.5 rounded-[6px] border text-xs font-bold whitespace-nowrap shrink-0 ${qBadge.badgeClass}`}>
                      <span aria-hidden="true">{qBadge.symbol} </span>
                      <span>{qBadge.labelFa}</span>
                    </span>
                  </div>
                  <div className="text-2xl font-black text-[var(--color-text-primary)] tabular-nums">{isMissing ? '—' : m.formattedValue}</div>
                  {!isMissing && <div className="text-xs text-[var(--color-text-secondary)]">{m.unit} · {m.dataTypeLabelFa}</div>}
                  {m.limitationNote && <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">{m.limitationNote}</p>}
                </div>
                <dl className="pt-2.5 border-t border-[var(--color-border-subtle)] text-xs text-[var(--color-text-muted)] space-y-1 tabular-nums">
                  <div className="flex justify-between gap-2">
                    <dt>پوشش:</dt>
                    <dd className="font-semibold text-[var(--color-text-primary)]">{m.geography.cityLabelFa}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt>تاریخ:</dt>
                    <dd className="font-semibold text-[var(--color-text-primary)]">{m.updatedAt || 'نامشخص'}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt>منبع:</dt>
                    <dd className="truncate max-w-[160px] text-[var(--color-text-primary)]">{m.sourceLabels.join('، ')}</dd>
                  </div>
                </dl>
              </article>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="home-quick-access-heading" data-testid="home-quick-access-section" className="space-y-3.5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 id="home-quick-access-heading" className="text-lg sm:text-xl font-extrabold text-[var(--color-text-primary)]">
              ابزارهای تصمیم‌گیری سریع
            </h2>
            <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
              ورود مستقیم به موتورهای محاسبه، تطبیق بودجه و راستی‌آزمایی قیمت
            </p>
          </div>
          <RadarLink
            href="/tools"
            onNavigate={() => p.onNavigateView('tools', 'overview')}
            className="min-h-[44px] md:min-h-[32px] inline-flex items-center px-1 text-xs font-bold text-[var(--color-brand-fg)] hover:underline gap-1 shrink-0"
          >
            <span>همه ابزارها</span>
            <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
          </RadarLink>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
          {TOOLBOX_CARDS.map((card) => (
            <RadarLink
              key={card.id}
              href={card.href}
              data-testid={`home-quick-access-${card.id}`}
              onNavigate={() => p.onNavigateView('tools', card.subTab)}
              className="w-full p-4 rounded-[12px] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] hover:border-[var(--color-brand-600)] transition flex flex-col items-start justify-between gap-3 text-start"
            >
              <div className="w-full flex items-center justify-between gap-2">
                <span className="p-2 rounded-[8px] bg-[var(--color-brand-soft)] text-[var(--color-brand-600)] dark:text-emerald-300">
                  {card.icon === 'valuation' ? (
                    <Calculator className="w-4 h-4" aria-hidden="true" />
                  ) : card.icon === 'budget' ? (
                    <SlidersHorizontal className="w-4 h-4" aria-hidden="true" />
                  ) : (
                    <FileCheck2 className="w-4 h-4" aria-hidden="true" />
                  )}
                </span>
                <ArrowLeft className="w-4 h-4 text-[var(--color-text-muted)]" aria-hidden="true" />
              </div>
              <div className="space-y-1">
                <div className="text-sm font-extrabold text-[var(--color-text-primary)]">{card.titleFa}</div>
                <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">{card.descFa}</p>
              </div>
            </RadarLink>
          ))}
        </div>
      </section>
    </div>
  );
};

export const ResearchServicesAndMethodologySection: React.FC<HomeMarketAndMethodologyProps> = (p) => {
  return (
    <div className="space-y-8">
      <section aria-labelledby="home-research-heading" data-testid="home-research-section" className="space-y-3.5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 id="home-research-heading" className="text-lg sm:text-xl font-extrabold text-[var(--color-text-primary)]">
              پژوهش‌ها، فایل‌ها و خدمات تخصصی
            </h2>
            <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
              گزارش‌های تحلیلی مستقل با منبع و تاریخ انتشار، در کنار دسترسی مستقیم به املاک و خدمات
            </p>
          </div>
          <RadarLink
            href="/knowledge"
            onNavigate={() => p.onNavigateView('knowledge', 'reports')}
            className="min-h-[44px] md:min-h-[32px] inline-flex items-center px-1 text-xs font-bold text-[var(--color-brand-fg)] hover:underline shrink-0"
          >
            مرکز پژوهش ←
          </RadarLink>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
          {HOME_RESEARCH_REPORTS.map((rep) => (
            <article
              key={rep.id}
              data-testid={`home-research-card-${rep.id}`}
              className="p-4 rounded-[12px] bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] flex flex-col justify-between space-y-3"
            >
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2 text-xs text-[var(--color-text-muted)]">
                  <span className="font-bold text-[var(--color-brand-600)] dark:text-emerald-400">{rep.categoryLabelFa}</span>
                  <span>{rep.publishedAtFa || 'تحلیلی'}</span>
                </div>
                <h3 className="text-sm font-bold text-[var(--color-text-primary)] leading-snug">{rep.titleFa}</h3>
                <p className="text-xs text-[var(--color-text-secondary)] line-clamp-2 leading-relaxed">{rep.summaryFa}</p>
              </div>
              <div className="pt-2.5 border-t border-[var(--color-border-subtle)] flex items-center justify-between gap-2 text-xs">
                <span className="text-[var(--color-text-muted)] truncate">{rep.geographyScopeFa}</span>
                <RadarLink
                  href="/knowledge"
                  onNavigate={() => {
                    p.onRecordTelemetry?.(buildPrivacySafeHomeTelemetry('home_report_open', { cityId: p.activeCity, targetDestination: rep.id }));
                    p.onNavigateView(rep.targetView, rep.targetSubTab);
                  }}
                  className="min-h-[44px] md:min-h-[32px] inline-flex items-center px-1 font-bold text-[var(--color-brand-fg)] hover:underline shrink-0"
                >
                  مطالعه ←
                </RadarLink>
              </div>
            </article>
          ))}
        </div>

        <div data-testid="home-property-services-section" className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
          <div className="p-4 rounded-[12px] bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] flex items-center justify-between gap-4">
            <div className="space-y-0.5">
              <h3 className="text-sm font-bold text-[var(--color-text-primary)]">کاوشگر املاک و فایل‌ها</h3>
              <p className="text-xs text-[var(--color-text-secondary)]">فایل‌های خرید، اجاره، تجاری و اداری با ارزیابی قیمت.</p>
            </div>
            <RadarLink
              href="/properties"
              data-testid="home-open-properties-btn"
              onNavigate={() => {
                p.onRecordTelemetry?.(buildPrivacySafeHomeTelemetry('home_property_open', { cityId: p.activeCity, targetDestination: '/properties' }));
                p.onNavigateView('properties', 'all');
              }}
              className="min-h-[44px] px-3.5 py-2 rounded-[8px] bg-[var(--color-bg-muted)] hover:bg-[var(--color-border-subtle)] text-xs font-bold text-[var(--color-text-primary)] shrink-0"
            >
              مشاهده املاک ←
            </RadarLink>
          </div>
          <div className="p-4 rounded-[12px] bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] flex items-center justify-between gap-4">
            <div className="space-y-0.5">
              <h3 className="text-sm font-bold text-[var(--color-text-primary)]">خدمات تخصصی و کارشناسی</h3>
              <p className="text-xs text-[var(--color-text-secondary)]">کارشناسی ارزش‌گذاری، بازرسی فنی و مشاوره حقوقی ملک.</p>
            </div>
            <RadarLink
              href="/services"
              data-testid="home-open-services-btn"
              onNavigate={() => p.onNavigateView('services', 'all')}
              className="min-h-[44px] px-3.5 py-2 rounded-[8px] bg-[var(--color-bg-muted)] hover:bg-[var(--color-border-subtle)] text-xs font-bold text-[var(--color-text-primary)] shrink-0"
            >
              مشاهده خدمات ←
            </RadarLink>
          </div>
        </div>
      </section>

      <section
        aria-labelledby="home-methodology-heading"
        data-testid="home-methodology-section"
        className="p-4 sm:p-5 rounded-[12px] bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] space-y-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[var(--color-border-subtle)] pb-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-[var(--color-brand-600)] dark:text-emerald-400 shrink-0" aria-hidden="true" />
            <h2 id="home-methodology-heading" className="text-sm sm:text-base font-extrabold text-[var(--color-text-primary)]">
              شفافیت منبع و روش‌شناسی داده‌های رادارتهران
            </h2>
          </div>
          <RadarLink
            href="/knowledge/methodology"
            onNavigate={() => p.onNavigateView('knowledge', 'methodology')}
            className="min-h-[44px] md:min-h-[32px] inline-flex items-center px-1 text-xs font-bold text-[var(--color-brand-fg)] hover:underline self-start sm:self-auto"
          >
            مطالعه روش‌شناسی ←
          </RadarLink>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {HOME_METHODOLOGY_PILLARS.map((pil) => (
            <div key={pil.id} className="p-3 rounded-[10px] bg-[var(--color-bg-canvas)] border border-[var(--color-border-subtle)] space-y-1">
              <div className="text-xs font-extrabold text-[var(--color-text-primary)]">{pil.titleFa}</div>
              <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">{pil.explanationFa}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
