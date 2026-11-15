import React from 'react';
import { TrendingUp } from 'lucide-react';
import type { EvaluatedNeighborhood, MarketPulseData } from '../../data/neighborhoods';
import { formatMillionTomanAsIntlCurrency, type PrimaryViewId } from '../../utils/areaUnit';
import { aggregateNeighborhoodMarketMetrics, buildNeighborhoodListingSamples } from '../../data/realMarketPriceAggregator';
import { EpistemicMarketDisclaimer } from '../EpistemicMarketDisclaimer';
import { MarketPage } from '../../features/market/pages/MarketPage';
import type { MarketSubTabId } from '../../navigation/registry/route.types';
import { PublicDataProvenanceCard } from '../../features/data-governance/components/PublicDataProvenanceCard';
import { AnalyticsAndResearchWorkspace } from '../../features/analytics/components/AnalyticsAndResearchWorkspace';

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
  const refAgg = aggregateNeighborhoodMarketMetrics(
    p.selectedHood.id,
    p.selectedHood.name,
    p.selectedHood.buyPerSqm,
    buildNeighborhoodListingSamples(p.selectedHood),
  );
  const quickSwitchHoods = p.evaluatedNeighborhoods.slice(0, 5);

  return (
    <MarketSectionErrorBoundary>
      <div className="w-full max-w-[1360px] mx-auto px-4 pt-5 space-y-4">
        <EpistemicMarketDisclaimer metrics={refAgg} />
        <PublicDataProvenanceCard
          entityId="saadat-abad"
          entityNameFa={p.selectedHood.name}
          sampleCount={Math.max(32, refAgg.sampleCount * 8)}
        />
      </div>
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
      <div className="w-full max-w-[1360px] mx-auto px-4 pb-6 space-y-4">
        <AnalyticsAndResearchWorkspace
          activePlaceId="saadat-abad"
          activePlaceNameFa={p.selectedHood.name}
          baseBuyPerSqm={p.selectedHood.buyPerSqm}
        />
        <div className="p-3 rounded-xl border border-[#DCE3DF] dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-[#586760] dark:text-slate-400">دسترسی سریع محله:</span>
            {quickSwitchHoods.map((hood) => (
              <div key={hood.id} className={`px-2 py-1 rounded-md border ${hood.id === p.selectedHood.id ? 'border-[#176B63] text-[#176B63] font-bold' : 'border-[#DCE3DF] dark:border-slate-700 text-[#182522] dark:text-slate-200'}`}>
                <div role="button" tabIndex={0} onClick={() => p.onSelectNeighborhood(hood)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); p.onSelectNeighborhood(hood); } }} className="cursor-pointer">
                  {hood.name}
                </div>
              </div>
            ))}
          </div>
          <button type="button" onClick={p.onOpenPriceTrend} className="px-3 py-1 rounded-lg border border-[#C5D0CA] dark:border-slate-700 font-bold text-[#182522] dark:text-slate-200 flex items-center gap-1 cursor-pointer">
            <TrendingUp className="w-3.5 h-3.5 text-[#176B63]" />
            <span>نمودار کامل روند ({formatMillionTomanAsIntlCurrency(refAgg.estimatedDealPricePerSqm, 'IRT')} · سناریو v6.4)</span>
          </button>
        </div>
      </div>
    </MarketSectionErrorBoundary>
  );
}
