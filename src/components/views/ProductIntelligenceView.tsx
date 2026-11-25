import React from 'react';
import { TrendingUp } from 'lucide-react';
import type { EvaluatedNeighborhood, MarketPulseData } from '../../data/neighborhoods';
import { convertPricePerSqmToUnitRaw, formatMillionTomanAsIntlCurrency, type PrimaryViewId } from '../../utils/areaUnit';
import { aggregateNeighborhoodMarketMetrics, buildNeighborhoodListingSamples } from '../../data/realMarketPriceAggregator';
import { EpistemicMarketDisclaimer } from '../EpistemicMarketDisclaimer';
import { MarketPage } from '../../features/market/pages/MarketPage';
import type { MarketSubTabId } from '../../navigation/registry/route.types';
import { PublicDataProvenanceCard } from '../../features/data-governance/components/PublicDataProvenanceCard';
import { AnalyticsAndResearchWorkspace } from '../../features/analytics/components/AnalyticsAndResearchWorkspace';
import { resolveAnalyticsPlaceId, resolveGovernanceEntityId } from '../../features/data-governance/services/placeIdentityMappers';
import { useAreaUnit, useExchangeRateSnapshot, useIntlCurrency, useRadarLocale } from '../AreaUnitToggle';
import { toPersianNum } from '../../data/neighborhoods';

export interface ProductIntelligenceViewProps {
  evaluatedNeighborhoods: EvaluatedNeighborhood[];
  selectedHood: EvaluatedNeighborhood;
  onSelectNeighborhood: (hood: EvaluatedNeighborhood) => void;
  marketPulse: MarketPulseData | null;
  onOpenPriceTrend: () => void;
  onOpenPulseModal: () => void;
  onOpenInspector: (hood: EvaluatedNeighborhood) => void;
  onNavigateView?: (view: PrimaryViewId) => void;
  onSyncMapLens?: (lens: 'bubble' | 'heatmap' | 'budget') => void;
  activeCity: string;
  activeSubTab?: MarketSubTabId;
  onChangeSubTab?: (tab: MarketSubTabId) => void;
}

class MarketSectionErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 m-4 rounded-xl border border-amber-300 bg-amber-50 text-xs text-amber-900">
          بخش تحلیل بازار با خطای موقت مواجه شد. لطفاً فیلترها را بازنشانی یا صفحه را تازه‌سازی کنید.
        </div>
      );
    }
    return this.props.children;
  }
}

export function ProductIntelligenceView(p: ProductIntelligenceViewProps): React.ReactElement {
  const [areaUnit] = useAreaUnit();
  const [intlCurrency] = useIntlCurrency();
  const [radarLocale] = useRadarLocale();
  useExchangeRateSnapshot();
  const liveSamples = buildNeighborhoodListingSamples(p.selectedHood);
  const refAgg = aggregateNeighborhoodMarketMetrics(
    p.selectedHood.id,
    p.selectedHood.name,
    p.selectedHood.buyPerSqm,
    liveSamples,
  );
  const quickSwitchHoods = p.evaluatedNeighborhoods.slice(0, 5);
  const syntheticCount = Math.max(0, (p.selectedHood.bargains?.length || 0) - liveSamples.length);
  const observedPerSqm = liveSamples.map((s) => Math.round((s.askingTotalMillion / Math.max(1, s.sqm)) * 10) / 10);
  const unitDeal = Math.round(convertPricePerSqmToUnitRaw(refAgg.estimatedDealPricePerSqm, areaUnit) * 10) / 10;

  return (
    <MarketSectionErrorBoundary>
      <MarketPage
        evaluatedNeighborhoods={p.evaluatedNeighborhoods}
        selectedHood={p.selectedHood}
        onSelectNeighborhood={p.onSelectNeighborhood}
        marketPulse={p.marketPulse}
        onOpenPriceTrend={p.onOpenPriceTrend}
        onOpenPulseModal={p.onOpenPulseModal}
        onOpenInspector={p.onOpenInspector}
        onNavigateView={p.onNavigateView}
        onSyncMapLens={p.onSyncMapLens}
        activeCity={p.activeCity}
        activeSubTab={p.activeSubTab}
        onChangeSubTab={p.onChangeSubTab}
      />
      <div className="w-full max-w-[1320px] mx-auto px-4 pb-6 space-y-4">
        <details className="rounded-xl border border-[var(--color-border-subtle)] dark:border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-3 text-xs">
          <summary className="cursor-pointer font-bold text-[var(--color-text-secondary)] select-none">
            کیفیت داده، پوشش نمونه و روش‌شناسی برآورد محله {p.selectedHood.name} ⓘ
          </summary>
          <div className="mt-3 space-y-3">
            <EpistemicMarketDisclaimer metrics={refAgg} />
            <PublicDataProvenanceCard
              entityId={resolveGovernanceEntityId(p.activeCity, p.selectedHood.id)}
              neighborhoodNameFa={p.selectedHood.name}
              sampleCount={refAgg.eligibleObservedCount}
              uniqueEntityCount={null}
              observedSampleCount={refAgg.observedSampleCount}
              syntheticSampleCount={syntheticCount}
            />
          </div>
        </details>
        {p.activeSubTab === 'reports' && (
          <AnalyticsAndResearchWorkspace
            activePlaceId={resolveAnalyticsPlaceId(p.selectedHood.id, p.activeCity)}
            activePlaceNameFa={p.selectedHood.name}
            baseBuyPerSqm={p.selectedHood.buyPerSqm}
            observedValues={observedPerSqm}
          />
        )}
        <div className="p-3 rounded-xl border border-[var(--color-border-subtle)] dark:border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-[var(--color-text-muted)]">دسترسی سریع محله:</span>
            {quickSwitchHoods.map((hood) => (
              <button
                key={hood.id}
                type="button"
                onClick={() => p.onSelectNeighborhood(hood)}
                className={`min-h-[44px] md:min-h-[34px] px-2.5 py-1 rounded-md border cursor-pointer ${hood.id === p.selectedHood.id ? 'border-[var(--color-brand-600)] text-[var(--color-brand-fg)] font-bold' : 'border-[var(--color-border-subtle)] text-[var(--color-text-primary)]'}`}
              >
                {hood.name}
              </button>
            ))}
          </div>
          <button type="button" onClick={p.onOpenPriceTrend} className="min-h-[44px] md:min-h-[36px] px-3 py-1 rounded-lg border border-[var(--color-border-strong)] font-bold text-[var(--color-text-primary)] flex items-center gap-1 cursor-pointer">
            <TrendingUp className="w-3.5 h-3.5 text-[var(--color-brand-fg)]" />
            <span>
              نمودار کامل روند ({toPersianNum(unitDeal)} م/{areaUnit === 'sqft' ? 'ft²' : 'م'}
              {intlCurrency !== 'IRT' ? ` · ${formatMillionTomanAsIntlCurrency(unitDeal, intlCurrency, radarLocale)}` : ''} · برآورد معامله)
            </span>
          </button>
        </div>
      </div>
    </MarketSectionErrorBoundary>
  );
}
