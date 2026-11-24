/** @file src/components/views/NeighborhoodDetailView.tsx — Dedicated Neighborhood Profile Page (/areas/:slug, /neighborhoods/:slug) */
import React, { useMemo } from 'react';
import {
  ArrowLeft, ArrowRight, Calculator, Compass, GitCompare, Heart, Map as MapIcon,
  ShieldCheck, Train, Wind, Car, Building2, CheckCircle2, AlertTriangle,
} from 'lucide-react';
import { toPersianNum, type EvaluatedNeighborhood } from '../../data/neighborhoods';
import { MULTI_CITY_CONFIGS, type CityId } from '../../data/multiCityData';
import { aggregateNeighborhoodMarketMetrics, buildNeighborhoodListingSamples } from '../../data/realMarketPriceAggregator';
import { useRadarLocale } from '../AreaUnitToggle';
import type { PrimaryViewId } from '../../utils/areaUnit';
import type { ModuleSubTabId } from '../../navigation/registry/route.types';
import { RadarLink } from '../ui/RadarPrimitives';

export interface NeighborhoodDetailViewProps {
  hood: EvaluatedNeighborhood;
  allNeighborhoods: EvaluatedNeighborhood[];
  activeCity: CityId;
  targetSqm: number;
  isFavorite: boolean;
  onToggleFavorite: (id: number) => void;
  onSelectNeighborhood: (hood: EvaluatedNeighborhood) => void;
  onNavigateView: (view: PrimaryViewId, subTab?: ModuleSubTabId) => void;
  onOpenCompare: (id1: number, id2: number) => void;
}

export const NeighborhoodDetailView: React.FC<NeighborhoodDetailViewProps> = ({
  hood,
  allNeighborhoods,
  activeCity,
  targetSqm,
  isFavorite,
  onToggleFavorite,
  onSelectNeighborhood,
  onNavigateView,
  onOpenCompare,
}) => {
  const [locale] = useRadarLocale();
  const isEn = locale === 'en';
  const BackIcon = isEn ? ArrowLeft : ArrowRight;
  const cityName = MULTI_CITY_CONFIGS[activeCity]?.nameFa || 'تهران';

  const market = useMemo(() => {
    const samples = buildNeighborhoodListingSamples(hood);
    return aggregateNeighborhoodMarketMetrics(hood.id, hood.name, hood.buyPerSqm, samples);
  }, [hood]);

  const peerHood = useMemo(
    () => allNeighborhoods.find((h) => h.id !== hood.id && h.zone === hood.zone) || allNeighborhoods.find((h) => h.id !== hood.id),
    [allNeighborhoods, hood],
  );

  const fmtNum = (n: number) => (isEn ? n.toLocaleString('en-US') : toPersianNum(Math.round(n).toLocaleString('en-US')));
  const estimatedTotalM = Math.round(hood.buyPerSqm * targetSqm);
  const scenarioSqm = market.estimatedDealPricePerSqm !== hood.buyPerSqm
    ? market.estimatedDealPricePerSqm
    : Math.round(hood.buyPerSqm * 0.94);

  const scores = [
    { label: isEn ? 'Overall Livability' : 'امتیاز کل زیست‌پذیری', val: hood.overallScore, Icon: ShieldCheck },
    { label: isEn ? 'Transit & Metro' : 'دسترسی مترو و حمل‌ونقل', val: hood.metro, Icon: Train },
    { label: isEn ? 'Air Quality' : 'کیفیت هوا', val: hood.air, Icon: Wind },
    { label: isEn ? 'Traffic Calmness' : 'روانی ترافیک', val: hood.trafficInfo?.trafficScore ?? hood.flatTerrain, Icon: Car },
  ];

  const handleBackToCatalog = () => {
    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', '/areas');
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
    onNavigateView('discover', 'results');
  };

  return (
    <article
      dir={isEn ? 'ltr' : 'rtl'}
      data-testid="neighborhood-detail-page"
      className="w-full max-w-[1320px] mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6 animate-fadeIn"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <RadarLink
          href="/areas"
          onNavigate={handleBackToCatalog}
          className="inline-flex items-center gap-1.5 min-h-[44px] md:min-h-[36px] px-3 py-1.5 rounded-[8px] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] text-xs font-bold text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-muted)] cursor-pointer"
        >
          <BackIcon className="w-4 h-4" aria-hidden="true" />
          <span>{isEn ? 'All Neighborhoods' : 'بازگشت به فهرست محله‌ها'}</span>
        </RadarLink>

        <button
          type="button"
          onClick={() => onToggleFavorite(hood.id)}
          aria-pressed={isFavorite}
          className={`inline-flex items-center gap-1.5 min-h-[44px] md:min-h-[36px] px-3.5 py-1.5 rounded-[8px] border text-xs font-bold transition cursor-pointer ${
            isFavorite
              ? 'bg-rose-600 text-white border-rose-600'
              : 'border-[var(--color-border-strong)] bg-[var(--color-bg-surface)] text-[var(--color-text-primary)] hover:bg-[var(--color-bg-muted)]'
          }`}
        >
          <Heart className={`w-4 h-4 ${isFavorite ? 'fill-current' : ''}`} aria-hidden="true" />
          <span>{isFavorite ? (isEn ? 'Saved' : 'ذخیره‌شده') : (isEn ? 'Save Area' : 'ذخیره محله')}</span>
        </button>
      </div>

      <header className="rounded-[16px] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-[var(--color-brand-fg)]">
              <Compass className="w-4 h-4" aria-hidden="true" />
              <span>{isEn ? `${cityName} · ${hood.zone}` : `${cityName} · ${hood.zone}`}</span>
            </div>
            <h1 className="text-2xl sm:text-[28px] font-black leading-[1.35] text-[var(--color-text-primary)]">
              {isEn ? `${hood.name} Neighborhood Profile` : `محله ${hood.name}`}
            </h1>
            <p className="text-sm text-[var(--color-text-secondary)] max-w-2xl leading-6">
              {hood.pros || (isEn ? 'Verified spatial benchmark and livability breakdown.' : 'شاخص‌های قیمت خرید، رهن کامل و کیفیت زندگی محله.')}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1 rounded-[12px] bg-[var(--color-bg-muted)] px-4 py-3 border border-[var(--color-border-subtle)]">
            <span className="text-xs font-semibold text-[var(--color-text-muted)]">
              {isEn ? 'Overall Score' : 'امتیاز کل محله'}
            </span>
            <span className="text-2xl font-black text-[var(--color-brand-fg)] tabular-nums">
              {isEn ? `${hood.overallScore.toFixed(1)} / 10` : `${toPersianNum(hood.overallScore.toFixed(1))} از ۱۰`}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
          <div className="rounded-[12px] border border-[var(--color-border-subtle)] bg-[var(--color-bg-canvas)] p-4">
            <div className="text-xs font-semibold text-[var(--color-text-muted)]">
              {isEn ? 'Asking Median / m²' : 'میانه نرخ اعلامی هر متر'}
            </div>
            <div className="mt-1 text-lg font-black text-[var(--color-text-primary)] tabular-nums">
              {fmtNum(hood.buyPerSqm)} <span className="text-xs font-semibold text-[var(--color-text-secondary)]">{isEn ? 'M Toman' : 'میلیون تومان'}</span>
            </div>
          </div>

          <div className="rounded-[12px] border border-[var(--color-border-subtle)] bg-[var(--color-bg-canvas)] p-4">
            <div className="text-xs font-semibold text-[var(--color-text-muted)]">
              {isEn ? 'Negotiation Scenario / m²' : 'سناریو پایه مذاکره (۶٪ تعدیل)'}
            </div>
            <div className="mt-1 text-lg font-black text-[var(--color-brand-fg)] tabular-nums">
              {fmtNum(scenarioSqm)} <span className="text-xs font-semibold text-[var(--color-text-secondary)]">{isEn ? 'M Toman' : 'میلیون تومان'}</span>
            </div>
          </div>

          <div className="rounded-[12px] border border-[var(--color-border-subtle)] bg-[var(--color-bg-canvas)] p-4">
            <div className="text-xs font-semibold text-[var(--color-text-muted)]">
              {isEn ? `Est. ${targetSqm}m² Purchase` : `برآورد خرید واحد ${toPersianNum(targetSqm)} متری`}
            </div>
            <div className="mt-1 text-lg font-black text-[var(--color-text-primary)] tabular-nums">
              {isEn ? `${(estimatedTotalM / 1000).toFixed(1)}B Toman` : `${toPersianNum((estimatedTotalM / 1000).toFixed(1))} میلیارد تومان`}
            </div>
          </div>

          <div className="rounded-[12px] border border-[var(--color-border-subtle)] bg-[var(--color-bg-canvas)] p-4">
            <div className="text-xs font-semibold text-[var(--color-text-muted)]">
              {isEn ? '80m² Full Deposit (Rahn)' : 'رهن کامل مرجع (۸۰ متری)'}
            </div>
            <div className="mt-1 text-lg font-black text-[var(--color-text-primary)] tabular-nums">
              {fmtNum(hood.rahn80m)} <span className="text-xs font-semibold text-[var(--color-text-secondary)]">{isEn ? 'M Toman' : 'میلیون تومان'}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 pt-2">
          <RadarLink
            href="/map"
            onNavigate={() => { onSelectNeighborhood(hood); onNavigateView('map'); }}
            className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-[10px] bg-[var(--color-brand-600)] text-white text-xs font-bold hover:opacity-95 cursor-pointer"
          >
            <MapIcon className="w-4 h-4" aria-hidden="true" />
            <span>{isEn ? 'View on Live Map' : 'مشاهده روی نقشه زنده'}</span>
          </RadarLink>
          <RadarLink
            href="/tools/valuation"
            onNavigate={() => { onSelectNeighborhood(hood); onNavigateView('tools', 'valuation'); }}
            className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-[10px] border border-[var(--color-border-strong)] bg-[var(--color-bg-surface)] text-[var(--color-text-primary)] text-xs font-bold hover:bg-[var(--color-bg-muted)] cursor-pointer"
          >
            <Calculator className="w-4 h-4 text-[var(--color-brand-fg)]" aria-hidden="true" />
            <span>{isEn ? 'Valuate a Unit Here' : 'ارزش‌گذاری ملک در این محله'}</span>
          </RadarLink>
          {peerHood && (
            <button
              type="button"
              onClick={() => onOpenCompare(hood.id, peerHood.id)}
              className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-[10px] border border-[var(--color-border-strong)] bg-[var(--color-bg-surface)] text-[var(--color-text-primary)] text-xs font-bold hover:bg-[var(--color-bg-muted)] cursor-pointer"
            >
              <GitCompare className="w-4 h-4 text-[var(--color-brand-fg)]" aria-hidden="true" />
              <span>{isEn ? `Compare with ${peerHood.name}` : `مقایسه با ${peerHood.name}`}</span>
            </button>
          )}
          <RadarLink
            href="/properties"
            onNavigate={() => { onSelectNeighborhood(hood); onNavigateView('properties', 'all'); }}
            className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-[10px] border border-[var(--color-border-strong)] bg-[var(--color-bg-surface)] text-[var(--color-text-primary)] text-xs font-bold hover:bg-[var(--color-bg-muted)] cursor-pointer"
          >
            <Building2 className="w-4 h-4 text-[var(--color-brand-fg)]" aria-hidden="true" />
            <span>{isEn ? 'Browse Properties' : 'مشاهده املاک و فایل‌ها'}</span>
          </RadarLink>
        </div>
      </header>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="rounded-[14px] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-5 space-y-4">
          <h2 className="text-base font-extrabold text-[var(--color-text-primary)]">
            {isEn ? 'Livability Scorecard' : 'کارنامه کیفیت زندگی محله'}
          </h2>
          <div className="space-y-3">
            {scores.map(({ label, val, Icon }) => {
              const pct = Math.max(8, Math.min(100, Math.round((val / 10) * 100)));
              return (
                <div key={label} className="space-y-1">
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="inline-flex items-center gap-1.5 text-[var(--color-text-secondary)]">
                      <Icon className="w-4 h-4 text-[var(--color-brand-fg)]" aria-hidden="true" />
                      <span>{label}</span>
                    </span>
                    <span className="text-[var(--color-text-primary)] tabular-nums">
                      {isEn ? `${val.toFixed(1)}/10` : `${toPersianNum(val.toFixed(1))}/۱۰`}
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-[var(--color-bg-muted)] overflow-hidden">
                    <div className="h-full rounded-full bg-[var(--color-brand-600)]" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-[14px] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-5 space-y-4">
          <h2 className="text-base font-extrabold text-[var(--color-text-primary)]">
            {isEn ? 'Strengths & Considerations' : 'مزایا و نکات کلیدی پیش از تصمیم'}
          </h2>
          <div className="space-y-3 text-sm leading-6">
            <div className="flex items-start gap-2.5 p-3 rounded-[10px] bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/70 dark:border-emerald-900/50">
              <CheckCircle2 className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0 mt-1" aria-hidden="true" />
              <div className="space-y-0.5">
                <div className="text-xs font-extrabold text-emerald-900 dark:text-emerald-200">{isEn ? 'Key Strengths' : 'نقاط قوت اصلی'}</div>
                <p className="text-xs text-[var(--color-text-secondary)]">{hood.pros}</p>
              </div>
            </div>
            {hood.cons && (
              <div className="flex items-start gap-2.5 p-3 rounded-[10px] bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/70 dark:border-amber-900/50">
                <AlertTriangle className="w-4 h-4 text-amber-700 dark:text-amber-300 shrink-0 mt-1" aria-hidden="true" />
                <div className="space-y-0.5">
                  <div className="text-xs font-extrabold text-amber-900 dark:text-amber-200">{isEn ? 'Watch-Outs' : 'نکات قابل توجه'}</div>
                  <p className="text-xs text-[var(--color-text-secondary)]">{hood.cons}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
    </article>
  );
};
