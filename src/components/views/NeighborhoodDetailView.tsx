/** @file src/components/views/NeighborhoodDetailView.tsx — Rich 5-Section Neighborhood Profile Page (/areas/:slug) (F-09, F-12) */
import React, { useMemo, useState } from 'react';
import {
  ArrowLeft, ArrowRight, Calculator, Compass, GitCompare, Heart, Map as MapIcon,
  ShieldCheck, Train, Wind, Car, Building2, CheckCircle2, AlertTriangle, Wifi, Zap, Mountain,
} from 'lucide-react';
import { toPersianNum, type EvaluatedNeighborhood } from '../../data/neighborhoods';
import { MULTI_CITY_CONFIGS, type CityId } from '../../data/multiCityData';
import { aggregateNeighborhoodMarketMetrics, buildNeighborhoodListingSamples } from '../../data/realMarketPriceAggregator';
import { getAreaSlugForHoodId } from '../../data/neighborhoodListingSamples';
import { formatPersianPrice, formatPersianScore } from '../../utils/persianBidiFormat';
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

  const peerCandidates = useMemo(
    () => allNeighborhoods.filter((h) => h.id !== hood.id),
    [allNeighborhoods, hood.id],
  );
  const defaultPeerId = useMemo(
    () => peerCandidates.find((h) => h.zone === hood.zone)?.id ?? peerCandidates[0]?.id ?? null,
    [peerCandidates, hood.zone],
  );
  const [selectedPeerId, setSelectedPeerId] = useState<number | null>(null);
  const peerHood = useMemo(
    () => peerCandidates.find((h) => h.id === (selectedPeerId ?? defaultPeerId)) || peerCandidates[0],
    [peerCandidates, selectedPeerId, defaultPeerId],
  );
  const similarPeers = useMemo(() => {
    return [...peerCandidates]
      .sort((a, b) => Math.abs(a.buyPerSqm - hood.buyPerSqm) - Math.abs(b.buyPerSqm - hood.buyPerSqm))
      .slice(0, 4);
  }, [peerCandidates, hood.buyPerSqm]);

  const fmtNum = (n: number) => (isEn ? Math.round(n).toLocaleString('en-US') : toPersianNum(Math.round(n).toLocaleString('en-US')));
  const fmtDec = (n: number) => (isEn ? n.toFixed(1) : toPersianNum(n.toFixed(1)).replace(/\./g, '٫'));
  const estimatedTotalM = Math.round(hood.buyPerSqm * targetSqm);
  const scenarioSqm = market.estimatedDealPricePerSqm !== hood.buyPerSqm
    ? market.estimatedDealPricePerSqm
    : Math.round(hood.buyPerSqm * 0.94);

  const sixAxisScores = [
    { label: isEn ? 'Air Quality' : 'کیفیت هوا', val: hood.air, Icon: Wind },
    { label: isEn ? 'Power & Water' : 'پایداری برق و آب', val: hood.powerWater, Icon: Zap },
    { label: isEn ? 'Internet & Fiber' : 'کیفیت اینترنت', val: hood.internet, Icon: Wifi },
    { label: isEn ? 'Metro & Transit' : 'دسترسی مترو و حمل‌ونقل', val: hood.metro, Icon: Train },
    { label: isEn ? 'Safety & Calm' : 'امنیت و آرامش', val: hood.security, Icon: ShieldCheck },
    { label: isEn ? 'Terrain & Walkability' : 'همواری و پیاده‌روی', val: hood.flatTerrain, Icon: Mountain },
  ];

  const handleBackToCatalog = () => {
    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', '/areas');
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
    onNavigateView('discover', 'results');
  };

  const handleNavigatePeer = (target: EvaluatedNeighborhood) => {
    onSelectNeighborhood(target);
    const slug = getAreaSlugForHoodId(target.id);
    if (typeof window !== 'undefined' && slug) {
      window.history.pushState({}, '', `/areas/${slug}`);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  };

  return (
    <article
      dir={isEn ? 'ltr' : 'rtl'}
      data-testid="neighborhood-detail-page"
      className="w-full max-w-[1320px] mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6 animate-fadeIn"
    >
      {/* Section 1: Hero Price & Budget Summary */}
      <div className="rounded-[16px] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-5 sm:p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[var(--color-border-subtle)]">
          <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[var(--color-brand-fg)]">
            <Compass className="w-4 h-4" aria-hidden="true" />
            <span>{cityName} · {hood.zone}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <RadarLink
              href="/areas"
              onNavigate={handleBackToCatalog}
              className="inline-flex items-center gap-1.5 min-h-[44px] md:min-h-[38px] px-3.5 py-1.5 rounded-[8px] border border-[var(--color-border-subtle)] bg-[var(--color-bg-canvas)] text-sm font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-muted)] cursor-pointer"
            >
              <BackIcon className="w-4 h-4" aria-hidden="true" />
              <span>{isEn ? 'All Neighborhoods' : 'فهرست محله‌ها'}</span>
            </RadarLink>

            <button
              type="button"
              onClick={() => onToggleFavorite(hood.id)}
              aria-pressed={isFavorite}
              className={`inline-flex items-center gap-1.5 min-h-[44px] md:min-h-[38px] px-3.5 py-1.5 rounded-[8px] border text-sm font-semibold transition cursor-pointer ${
                isFavorite
                  ? 'bg-rose-600 text-white border-rose-600'
                  : 'border-[var(--color-border-strong)] bg-[var(--color-bg-surface)] text-[var(--color-text-primary)] hover:bg-[var(--color-bg-muted)]'
              }`}
            >
              <Heart className={`w-4 h-4 ${isFavorite ? 'fill-current' : ''}`} aria-hidden="true" />
              <span>{isFavorite ? (isEn ? 'Saved' : 'ذخیره‌شده') : (isEn ? 'Save Area' : 'ذخیره محله')}</span>
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1.5">
            <h1 className="text-2xl sm:text-[30px] font-bold leading-[1.3] text-[var(--color-text-primary)]">
              {isEn ? `${hood.name} Neighborhood Profile` : `محله ${hood.name}`}
            </h1>
            <p className="text-[15px] text-[var(--color-text-secondary)] max-w-2xl leading-7">
              {hood.pros || (isEn ? 'Verified spatial benchmark and livability breakdown.' : 'شاخص‌های قیمت خرید، رهن کامل و کیفیت زندگی محله.')}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1 rounded-[12px] bg-[var(--color-bg-muted)] px-4 py-3 border border-[var(--color-border-subtle)]">
            <span className="text-[13px] font-semibold text-[var(--color-text-muted)]">
              {isEn ? 'Overall Livability' : 'امتیاز کل زیست‌پذیری'}
            </span>
            <span className="text-2xl font-bold text-[var(--color-brand-fg)] tabular-nums">
              {isEn ? `${fmtDec(hood.overallScore)} / 10` : formatPersianScore(hood.overallScore)}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
          <div className="rounded-[12px] border border-[var(--color-border-subtle)] bg-[var(--color-bg-canvas)] p-4">
            <div className="text-sm font-semibold text-[var(--color-text-muted)]">
              {isEn ? 'Asking Median / m²' : 'میانه نرخ اعلامی هر متر'}
            </div>
            <div className="mt-1 text-lg font-bold text-[var(--color-text-primary)] tabular-nums">
              {isEn ? `${fmtNum(hood.buyPerSqm)} M Toman` : formatPersianPrice(hood.buyPerSqm, 'میلیون تومان')}
            </div>
          </div>

          <div className="rounded-[12px] border border-[var(--color-border-subtle)] bg-[var(--color-bg-canvas)] p-4">
            <div className="text-sm font-semibold text-[var(--color-text-muted)]">
              {isEn ? 'Negotiation Scenario / m²' : 'سناریوی مذاکره (غیرثبتی)'}
            </div>
            <div className="mt-1 text-lg font-bold text-[var(--color-brand-fg)] tabular-nums">
              {isEn ? `${fmtNum(scenarioSqm)} M Toman` : formatPersianPrice(scenarioSqm, 'میلیون تومان')}
            </div>
          </div>

          <div className="rounded-[12px] border border-[var(--color-border-subtle)] bg-[var(--color-bg-canvas)] p-4">
            <div className="text-sm font-semibold text-[var(--color-text-muted)]">
              {isEn ? `Est. ${targetSqm}m² Purchase` : `برآورد خرید واحد ${toPersianNum(targetSqm)} متری`}
            </div>
            <div className="mt-1 text-lg font-bold text-[var(--color-text-primary)] tabular-nums">
              {isEn ? `${(estimatedTotalM / 1000).toFixed(1)}B Toman` : `${fmtDec(estimatedTotalM / 1000)} میلیارد تومان`}
            </div>
          </div>

          <div className="rounded-[12px] border border-[var(--color-border-subtle)] bg-[var(--color-bg-canvas)] p-4">
            <div className="text-sm font-semibold text-[var(--color-text-muted)]">
              {isEn ? '80m² Full Deposit (Rahn)' : 'رهن کامل مرجع (۸۰ متری)'}
            </div>
            <div className="mt-1 text-lg font-bold text-[var(--color-text-primary)] tabular-nums">
              {isEn ? `${fmtNum(hood.rahn80m)} M Toman` : formatPersianPrice(hood.rahn80m, 'میلیون تومان')}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[var(--color-border-subtle)]">
          <div className="flex flex-wrap items-center gap-2.5">
            <RadarLink
              href="/map"
              onNavigate={() => { onSelectNeighborhood(hood); onNavigateView('map'); }}
              className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-[10px] bg-[var(--color-brand-600)] text-white text-sm font-bold hover:opacity-95 cursor-pointer"
            >
              <MapIcon className="w-4 h-4" aria-hidden="true" />
              <span>{isEn ? 'View on Live Map' : 'مشاهده روی نقشه زنده'}</span>
            </RadarLink>
            <RadarLink
              href="/tools/valuation"
              onNavigate={() => { onSelectNeighborhood(hood); onNavigateView('tools', 'valuation'); }}
              className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-[10px] border border-[var(--color-border-strong)] bg-[var(--color-bg-surface)] text-[var(--color-text-primary)] text-sm font-semibold hover:bg-[var(--color-bg-muted)] cursor-pointer"
            >
              <Calculator className="w-4 h-4 text-[var(--color-brand-fg)]" aria-hidden="true" />
              <span>{isEn ? 'Valuate a Unit Here' : 'ارزش‌گذاری ملک در این محله'}</span>
            </RadarLink>
            <RadarLink
              href="/properties"
              onNavigate={() => { onSelectNeighborhood(hood); onNavigateView('properties', 'all'); }}
              className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-[10px] border border-[var(--color-border-strong)] bg-[var(--color-bg-surface)] text-[var(--color-text-primary)] text-sm font-semibold hover:bg-[var(--color-bg-muted)] cursor-pointer"
            >
              <Building2 className="w-4 h-4 text-[var(--color-brand-fg)]" aria-hidden="true" />
              <span>{isEn ? 'Browse Properties' : 'مشاهده املاک و فایل‌ها'}</span>
            </RadarLink>
          </div>
          {peerHood && (
            <div className="inline-flex items-center rounded-[10px] border border-[var(--color-border-strong)] bg-[var(--color-bg-canvas)] overflow-hidden">
              <span className="px-3 text-[13px] font-semibold text-[var(--color-text-muted)] border-e border-[var(--color-border-subtle)] whitespace-nowrap">
                {isEn ? 'Compare with:' : 'مقایسه با:'}
              </span>
              <select
                aria-label={isEn ? 'Select neighborhood to compare with' : 'انتخاب محله مقابل برای مقایسه'}
                value={peerHood.id}
                onChange={(e) => setSelectedPeerId(Number(e.target.value))}
                className="min-h-[44px] px-2.5 bg-transparent text-sm font-semibold text-[var(--color-text-primary)] border-e border-[var(--color-border-subtle)] focus:outline-none cursor-pointer"
              >
                {peerCandidates.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => onOpenCompare(hood.id, peerHood.id)}
                className="inline-flex items-center gap-1.5 min-h-[44px] px-3.5 py-2 text-[var(--color-brand-fg)] text-sm font-bold hover:bg-[var(--color-brand-soft)] cursor-pointer transition"
              >
                <GitCompare className="w-4 h-4" aria-hidden="true" />
                <span>{isEn ? 'Compare' : 'شروع مقایسه'}</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Section 2 & 3: 6-Axis Livability + Access, Traffic & Key Notes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <section className="rounded-[14px] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-5 space-y-4">
          <h2 className="text-base font-bold text-[var(--color-text-primary)]">
            {isEn ? '6-Axis Livability Scorecard' : 'کارنامه ۶گانه زیست‌پذیری محله'}
          </h2>
          <div className="space-y-3">
            {sixAxisScores.map(({ label, val, Icon }) => {
              const pct = Math.max(8, Math.min(100, Math.round((val / 10) * 100)));
              return (
                <div key={label} className="space-y-1">
                  <div className="flex items-center justify-between text-sm font-semibold">
                    <span className="inline-flex items-center gap-1.5 text-[var(--color-text-secondary)]">
                      <Icon className="w-4 h-4 text-[var(--color-brand-fg)]" aria-hidden="true" />
                      <span>{label}</span>
                    </span>
                    <span className="text-[var(--color-text-primary)] font-bold tabular-nums">
                      {isEn ? `${fmtDec(val)} / 10` : formatPersianScore(val)}
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-[var(--color-bg-muted)] overflow-hidden">
                    <div className="h-full rounded-full bg-[var(--color-brand-600)]" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-[14px] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-5 space-y-4">
          <h2 className="text-lg font-bold text-[var(--color-text-primary)]">
            {isEn ? 'Access, Traffic & Local Takeaways' : 'دسترسی، ترافیک و نکات کلیدی محله'}
          </h2>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="p-3.5 rounded-[10px] bg-[var(--color-bg-muted)] border border-[var(--color-border-subtle)]">
              <div className="text-[13px] text-[var(--color-text-muted)] flex items-center gap-1.5">
                <Car className="w-4 h-4 text-[var(--color-brand-fg)]" aria-hidden="true" />
                <span>{isEn ? 'Traffic Status' : 'وضعیت طرح و ترافیک'}</span>
              </div>
              <div className="font-bold text-[var(--color-text-primary)] mt-1 flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[var(--color-brand-600)] shrink-0" aria-hidden="true" />
                <span>
                  {(hood.trafficInfo?.liveStatus || (isEn ? 'Normal Traffic Flow' : 'جریان ترافیکی متعادل')).replace(/^[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]\s*/u, '')}
                </span>
              </div>
            </div>
            <div className="p-3.5 rounded-[10px] bg-[var(--color-bg-muted)] border border-[var(--color-border-subtle)]">
              <div className="text-[13px] text-[var(--color-text-muted)] flex items-center gap-1.5">
                <Train className="w-4 h-4 text-[var(--color-brand-fg)]" aria-hidden="true" />
                <span>{isEn ? 'Transit Access' : 'امتیاز حمل‌ونقل'}</span>
              </div>
              <div className="font-bold text-[var(--color-text-primary)] mt-1 tabular-nums">
                {isEn ? `${fmtDec(hood.metro)} / 10` : formatPersianScore(hood.metro)}
              </div>
            </div>
          </div>
          <div className="space-y-3 text-sm leading-7">
            <div className="flex items-start gap-2.5 p-3.5 rounded-[10px] bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/70 dark:border-emerald-900/50">
              <CheckCircle2 className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0 mt-1" aria-hidden="true" />
              <div className="space-y-0.5">
                <div className="text-sm font-bold text-emerald-900 dark:text-emerald-200">{isEn ? 'Key Strengths' : 'نقاط قوت اصلی'}</div>
                <p className="text-sm text-[var(--color-text-secondary)]">{hood.pros}</p>
              </div>
            </div>
            {hood.cons && (
              <div className="flex items-start gap-2.5 p-3.5 rounded-[10px] bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/70 dark:border-amber-900/50">
                <AlertTriangle className="w-4 h-4 text-amber-700 dark:text-amber-300 shrink-0 mt-1" aria-hidden="true" />
                <div className="space-y-0.5">
                  <div className="text-sm font-bold text-amber-900 dark:text-amber-200">{isEn ? 'Watch-Outs' : 'نکات قابل توجه'}</div>
                  <p className="text-sm text-[var(--color-text-secondary)]">{hood.cons}</p>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Section 4: Market Pulse & Active Files */}
      <section className="rounded-[14px] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold text-[var(--color-text-primary)]">
            {isEn ? 'Market Benchmark & Active Listings' : 'نبض بازار و فایل‌های فعال محله'}
          </h2>
          <RadarLink
            href="/properties"
            onNavigate={() => { onSelectNeighborhood(hood); onNavigateView('properties', 'all'); }}
            className="min-h-[44px] md:min-h-[38px] inline-flex items-center px-3.5 rounded-[8px] bg-[var(--color-brand-soft)] text-[var(--color-brand-fg)] text-sm font-bold hover:opacity-90 cursor-pointer"
          >
            {isEn ? 'View All Listings →' : 'مشاهده همه فایل‌های این محله ←'}
          </RadarLink>
        </div>
        <p className="text-[15px] leading-7 text-[var(--color-text-secondary)]">
          {isEn
            ? `Asking median is ${fmtNum(hood.buyPerSqm)} M/m² with an analytical negotiation reference of ${fmtNum(scenarioSqm)} M/m². Active curated deals tracked: ${hood.bargains?.length || 0}.`
            : `میانه نرخ اعلامی هر متر در ${hood.name} معادل ${formatPersianPrice(hood.buyPerSqm, 'میلیون تومان')} و سناریوی تحلیلی مذاکره (غیرثبتی) حدود ${formatPersianPrice(scenarioSqm, 'میلیون تومان')} است. تعداد فایل‌های زیر عرف ثبت‌شده در محله: ${toPersianNum(hood.bargains?.length || 0)} مورد.`}
        </p>
      </section>

      {/* Section 5: Similar Peer Neighborhoods */}
      {similarPeers.length > 0 && (
        <section className="rounded-[14px] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-5 space-y-3">
          <h2 className="text-lg font-bold text-[var(--color-text-primary)]">
            {isEn ? 'Compare with Similar-Budget Neighborhoods' : 'مقایسه با محله‌های هم‌سطح قیمتی'}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {similarPeers.map((peer) => {
              const peerSlug = getAreaSlugForHoodId(peer.id);
              return (
                <div key={peer.id} className="p-4 rounded-[12px] border border-[var(--color-border-subtle)] bg-[var(--color-bg-canvas)] flex flex-col justify-between gap-3 text-sm">
                  <div>
                    <div className="font-bold text-[var(--color-text-primary)]">{peer.name}</div>
                    <div className="text-[13px] text-[var(--color-text-muted)] mt-0.5">{peer.zone}</div>
                  </div>
                  <div className="space-y-1 tabular-nums">
                    <div className="flex justify-between">
                      <span className="text-[var(--color-text-muted)]">{isEn ? 'Buy / m²' : 'خرید متری'}</span>
                      <span className="font-bold text-[var(--color-text-primary)]">{formatPersianPrice(peer.buyPerSqm, 'م')}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--color-text-muted)]">{isEn ? 'Score' : 'زیست‌پذیری'}</span>
                      <span className="font-bold text-[var(--color-brand-fg)]">{formatPersianScore(peer.overallScore)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 pt-1">
                    <RadarLink
                      href={peerSlug ? `/areas/${peerSlug}` : '/areas'}
                      onNavigate={() => handleNavigatePeer(peer)}
                      className="flex-1 min-h-[44px] md:min-h-[38px] inline-flex items-center justify-center rounded-[8px] border border-[var(--color-border-strong)] font-semibold text-[var(--color-text-primary)] hover:bg-[var(--color-bg-muted)] cursor-pointer"
                    >
                      {isEn ? 'Profile' : 'کارنامه'}
                    </RadarLink>
                    <button
                      type="button"
                      onClick={() => onOpenCompare(hood.id, peer.id)}
                      className="flex-1 min-h-[44px] md:min-h-[38px] inline-flex items-center justify-center rounded-[8px] bg-[var(--color-brand-600)] text-white font-semibold hover:bg-[var(--color-brand-700)] cursor-pointer"
                    >
                      {isEn ? 'Compare' : 'مقایسه'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </article>
  );
};
