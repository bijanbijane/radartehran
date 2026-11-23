import React, { useEffect, useMemo, useRef, useState } from 'react';
import { TrendingUp } from 'lucide-react';
import { toPersianNum, type EvaluatedNeighborhood, type MarketPulseData } from '../../../data/neighborhoods';
import { convertPricePerSqmToUnit, formatMillionTomanAsIntlCurrency, type PrimaryViewId } from '../../../utils/areaUnit';
import { useAreaUnit, useExperienceMode, useIntlCurrency, useRadarLocale } from '../../../components/AreaUnitToggle';
import type { Stage2ActiveTab } from '../../../components/stage2/Stage2MasterWidget';
import type { MarketSubTabId } from '../../../navigation/registry/route.types';
import {
  commitMarketDraft,
  createDefaultMarketDraft,
  isDraftDirty,
  normalizeDraftForMarketType,
  resetMarketFiltersToDefault,
} from '../filters/MarketFilterDraft';
import { buildMarketSnapshotBundle } from '../services/marketDataAdapter';
import { buildMarketAggregateExport } from '../services/marketQueryService';
import {
  loadSavedMarketAnalyses,
  persistSavedMarketAnalyses,
  serializeMarketContextToQuery,
  trackMarketEvent,
} from '../state/marketUrlAdapter';
import type { AppliedMarketFilters, MarketFilterDraft, MarketType, SavedMarketAnalysis } from '../types/market.types';
import { MarketContextBar } from '../shell/MarketContextBar';
import { MarketFilterPanel } from '../filters/MarketFilterPanel';
import { IndicatorCard } from '../indicators/IndicatorCard';
import { MarketTrendChart } from '../charts/MarketTrendChart';
import { PriceDistributionChart } from '../charts/PriceDistributionChart';
import { PriceAreaScatter } from '../charts/PriceAreaScatter';
import { SupplyCompositionChart } from '../charts/SupplyCompositionChart';
import { MarketMapSyncPanel } from '../map/MarketMapSyncPanel';
import { GeographicComparison } from '../comparison/GeographicComparison';
import { MethodologyPanel } from '../methodology/MethodologyPanel';
import { MarketReportList } from '../reports/MarketReportList';
import { SavedAnalysisPanel } from '../saved-analysis/SavedAnalysisPanel';
import { RentAnalyticsSection } from '../analytics/RentAnalyticsSection';
import { MarketExperienceFooter } from './MarketExperienceFooter';

export interface MarketPageProps {
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

export const MarketPage: React.FC<MarketPageProps> = (p) => {
  const [areaUnit] = useAreaUnit(), [intlCurrency] = useIntlCurrency(), [radarLocale] = useRadarLocale();
  const [experienceMode, setExperienceMode] = useExperienceMode();
  const isEn = radarLocale === 'en';
  const subTab: MarketSubTabId = p.activeSubTab || 'overview';

  const [draft, setDraft] = useState<MarketFilterDraft>(() =>
    createDefaultMarketDraft(subTab === 'rent' ? 'rent' : 'sale', 'neighborhood', p.selectedHood.zone),
  );
  const [applied, setApplied] = useState<AppliedMarketFilters>(() => commitMarketDraft(draft));
  const [compareHoodIds, setCompareHoodIds] = useState<number[]>(() =>
    p.evaluatedNeighborhoods.filter((h) => h.id !== p.selectedHood.id).slice(0, 2).map((h) => h.id),
  );
  const [selectedIndicatorId, setSelectedIndicatorId] = useState<string>('asking_price_median_sqm');
  const [methodologyOpen, setMethodologyOpen] = useState(false);
  const [savedOpen, setSavedOpen] = useState(false);
  const [savedItems, setSavedItems] = useState<SavedMarketAnalysis[]>(() => loadSavedMarketAnalyses());
  const [stage2Tab, setStage2Tab] = useState<Stage2ActiveTab>('HOUSING_CYCLE');
  const prevCityRef = useRef<string>(p.activeCity);

  useEffect(() => {
    if (prevCityRef.current !== p.activeCity) {
      prevCityRef.current = p.activeCity;
      const nextCompare = p.evaluatedNeighborhoods.filter((h) => h.id !== p.selectedHood.id).slice(0, 2).map((h) => h.id);
      setCompareHoodIds(nextCompare);
      setDraft((prev) => {
        const next = { ...prev, zoneName: p.selectedHood.zone };
        setApplied(commitMarketDraft(next));
        return next;
      });
    }
  }, [p.activeCity, p.evaluatedNeighborhoods, p.selectedHood.id, p.selectedHood.zone]);

  useEffect(() => {
    if (p.activeSubTab === 'rent') {
      setDraft((prev) => {
        if (prev.transactionType === 'rent') return prev;
        const next: MarketFilterDraft = { ...prev, transactionType: 'rent' };
        setApplied(commitMarketDraft(next));
        return next;
      });
    }
  }, [p.activeSubTab]);

  const availableZones = useMemo(() => Array.from(new Set(p.evaluatedNeighborhoods.map((h) => h.zone).filter(Boolean))), [p.evaluatedNeighborhoods]);
  const dirty = useMemo(() => isDraftDirty(draft, applied), [draft, applied]);

  const bundle = useMemo(
    () =>
      buildMarketSnapshotBundle({
        allHoods: p.evaluatedNeighborhoods,
        selectedHood: p.selectedHood,
        activeCity: p.activeCity,
        filters: applied,
        compareHoodIds,
        areaUnit,
        intlCurrency,
        radarLocale,
      }),
    [p.evaluatedNeighborhoods, p.selectedHood, p.activeCity, applied, compareHoodIds, areaUnit, intlCurrency, radarLocale],
  );

  const applyDraftNow = (nextDraft?: MarketFilterDraft) => {
    const committed = commitMarketDraft(nextDraft || draft);
    setApplied(committed);
    trackMarketEvent('market_filter_applied', { marketType: committed.marketType, tx: committed.transactionType, geo: committed.geoLevel });
  };

  const handleSelectMarketType = (mt: MarketType) => {
    const normalized = normalizeDraftForMarketType(draft, mt);
    setDraft(normalized);
    applyDraftNow(normalized);
  };

  const handleSelectTransaction = (tx: 'sale' | 'rent') => {
    const next = { ...draft, transactionType: tx };
    setDraft(next);
    applyDraftNow(next);
    if (tx === 'rent' && subTab === 'prices') p.onChangeSubTab?.('rent');
  };

  const handleExport = (format: 'csv' | 'json') => {
    const payload = buildMarketAggregateExport(bundle, applied, format);
    trackMarketEvent('market_export_triggered', { format, geo: applied.geoLevel });
    const blob = new Blob([payload.content], { type: payload.mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = payload.filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSaveAnalysis = (title: string) => {
    const item: SavedMarketAnalysis = {
      id: `mkt-${Date.now()}`, title, savedAtIso: new Date().toISOString(), cityId: p.activeCity,
      neighborhoodId: p.selectedHood.id, neighborhoodName: p.selectedHood.name, subTab, filters: applied, compareHoodIds,
    };
    const next = [item, ...savedItems].slice(0, 20);
    setSavedItems(next);
    persistSavedMarketAnalyses(next);
    trackMarketEvent('market_analysis_saved', { marketType: applied.marketType });
  };

  const shareUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/market?${serializeMarketContextToQuery(applied, compareHoodIds)}`;
  const uDealUnit = convertPricePerSqmToUnit(bundle.selectedAgg.estimatedDealPricePerSqm, areaUnit);

  return (
    <div className="w-full max-w-[1360px] mx-auto px-4 py-6 space-y-5 animate-fadeIn" data-testid="product-intelligence-view">
      <MarketContextBar
        activeCity={p.activeCity} selectedHood={p.selectedHood} appliedFilters={applied} isEn={isEn}
        onSelectMarketType={handleSelectMarketType} onSelectTransaction={handleSelectTransaction}
        onOpenMethodology={() => { setMethodologyOpen(true); trackMarketEvent('market_methodology_opened', { subTab }); }}
        onOpenSaved={() => setSavedOpen(true)} onExportCsv={() => handleExport('csv')} onOpenFullMap={() => p.onNavigateView?.('map')}
      />

      {p.marketPulse && (
        <div className="px-4 py-2.5 rounded-xl bg-[var(--color-text-primary)] text-white flex flex-wrap items-center justify-between gap-2 text-xs tabular-nums">
          <span>
            نبض کلان {bundle.cityNameFa}: میانگین پیشنهادی متری{' '}
            <strong>{toPersianNum(convertPricePerSqmToUnit(p.marketPulse.marketSummary.tehranAverageBuyPerSqm, areaUnit))} م</strong>{' '}
            · رهن ۸۰م: <strong>{toPersianNum(p.marketPulse.marketSummary.tehranAverageRahn80m)} م</strong>
            {intlCurrency !== 'IRT' ? ` (${formatMillionTomanAsIntlCurrency(uDealUnit, intlCurrency, radarLocale)})` : ''}
          </span>
          <div className="flex items-center gap-3 text-[11px] text-slate-300">
            <span>شاخص هوا: {toPersianNum(p.marketPulse.airQuality.tehranAverageAqi)}</span>
            <button type="button" onClick={p.onOpenPulseModal} className="text-emerald-300 font-bold hover:underline cursor-pointer flex items-center gap-1">
              <TrendingUp className="w-3.5 h-3.5" /><span>نبض زنده</span>
            </button>
          </div>
        </div>
      )}

      <MarketFilterPanel
        draft={draft} applied={applied} isDirty={dirty} availableZones={availableZones}
        onUpdateDraft={(patch) => setDraft((prev) => ({ ...prev, ...patch }))}
        onApply={() => applyDraftNow()}
        onReset={() => { const r = resetMarketFiltersToDefault(p.selectedHood.zone); setDraft(r.draft); setApplied(r.applied); }}
      />

      {bundle.isNonResidentialUnavailable && (
        <div data-testid="market-unavailable-notice" className="p-4 rounded-[12px] bg-[#FFF4E5] dark:bg-amber-950/30 border border-[#F4D3A1] dark:border-amber-800 text-xs text-[#875000] dark:text-amber-200 flex flex-wrap items-center justify-between gap-2">
          <span>
            داده کالیبره‌شده برای بازار <strong>{applied.marketType === 'commercial' ? 'تجاری' : applied.marketType === 'office' ? 'اداری' : 'زمین'}</strong> هنوز در این نسخه منتشر نشده است و از داده مسکونی برای پر کردن آن استفاده نمی‌شود.
          </span>
          <button type="button" onClick={() => handleSelectMarketType('residential')} className="px-3 py-1.5 rounded-lg bg-[var(--color-brand-600)] text-white font-bold cursor-pointer">
            بازگشت به بازار مسکونی
          </button>
        </div>
      )}

      {(subTab === 'rent' || applied.transactionType === 'rent') && !bundle.isNonResidentialUnavailable && (
        <RentAnalyticsSection
          rentBreakdown={bundle.rentBreakdown} geoScopeFa={bundle.geoScopeFa} intlCurrency={intlCurrency} radarLocale={radarLocale} includeConverted={applied.includeRentEquivalent}
          onToggleConverted={(val) => { const next = { ...draft, includeRentEquivalent: val }; setDraft(next); applyDraftNow(next); }}
        />
      )}

      {subTab === 'supply' && <SupplyCompositionChart byArea={bundle.supplyByArea} byAge={bundle.supplyByAge} geoScopeFa={bundle.geoScopeFa} status={bundle.quality.status} />}

      {subTab === 'compare' && (
        <GeographicComparison
          allHoods={p.evaluatedNeighborhoods} selectedHood={p.selectedHood} comparisonRows={bundle.comparisonRows} compareHoodIds={compareHoodIds} areaUnit={areaUnit}
          onAddCompareHood={(id) => { setCompareHoodIds((prev) => Array.from(new Set([...prev, id])).slice(0, 3)); trackMarketEvent('market_region_compared', { hoodId: id }); }}
          onRemoveCompareHood={(id) => setCompareHoodIds((prev) => prev.filter((x) => x !== id))} onSelectNeighborhood={p.onSelectNeighborhood}
        />
      )}

      {subTab === 'reports' && <MarketReportList reports={bundle.reports} onOpenMethodology={() => setMethodologyOpen(true)} />}

      <section aria-label="شاخص‌های کلیدی بازار" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {bundle.indicators.slice(0, subTab === 'overview' ? 6 : 3).map((ind) => (
          <IndicatorCard
            key={ind.id} indicator={ind} active={selectedIndicatorId === ind.id}
            onSelect={(selected) => {
              setSelectedIndicatorId(selected.id);
              trackMarketEvent('market_indicator_selected', { indicatorId: selected.id });
              if (selected.id === 'rent_deposit_80m') p.onChangeSubTab?.('rent');
              else if (selected.id === 'supply_valid_count') p.onChangeSubTab?.('supply');
              else if (selected.id === 'asking_price_median_sqm') p.onChangeSubTab?.('prices');
            }}
          />
        ))}
      </section>

      {(subTab === 'overview' || subTab === 'prices' || subTab === 'rent') && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <MarketTrendChart series={bundle.trendSeries} geoScopeFa={bundle.geoScopeFa} cityNameFa={bundle.cityNameFa} periodLabelFa={bundle.periodLabelFa} transactionType={subTab === 'rent' ? 'rent' : applied.transactionType} areaUnit={areaUnit} status={bundle.quality.status} />
          <PriceDistributionChart stats={bundle.distribution} geoScopeFa={bundle.geoScopeFa} status={bundle.quality.status} />
        </div>
      )}

      {subTab === 'prices' && <PriceAreaScatter points={bundle.scatterPoints} geoScopeFa={bundle.geoScopeFa} status={bundle.quality.status} />}

      {subTab === 'overview' && <SupplyCompositionChart byArea={bundle.supplyByArea} byAge={bundle.supplyByAge} geoScopeFa={bundle.geoScopeFa} status={bundle.quality.status} />}

      {subTab === 'overview' && (
        <GeographicComparison
          allHoods={p.evaluatedNeighborhoods} selectedHood={p.selectedHood} comparisonRows={bundle.comparisonRows} compareHoodIds={compareHoodIds} areaUnit={areaUnit}
          onAddCompareHood={(id) => { setCompareHoodIds((prev) => Array.from(new Set([...prev, id])).slice(0, 3)); trackMarketEvent('market_region_compared', { hoodId: id }); }}
          onRemoveCompareHood={(id) => setCompareHoodIds((prev) => prev.filter((x) => x !== id))} onSelectNeighborhood={p.onSelectNeighborhood}
        />
      )}

      {(subTab === 'overview' || subTab === 'compare') && (
        <MarketMapSyncPanel
          evaluatedNeighborhoods={p.evaluatedNeighborhoods} selectedHood={p.selectedHood} areaUnit={areaUnit} geoScopeFa={bundle.geoScopeFa}
          onSelectNeighborhood={p.onSelectNeighborhood} onSyncMapLens={p.onSyncMapLens} onOpenFullMap={() => p.onNavigateView?.('map')}
        />
      )}

      {subTab === 'overview' && <MarketReportList reports={bundle.reports} onOpenMethodology={() => setMethodologyOpen(true)} />}

      <MarketExperienceFooter
        evaluatedNeighborhoods={p.evaluatedNeighborhoods} selectedHood={p.selectedHood} activeCity={p.activeCity} intlCurrency={intlCurrency}
        experienceMode={experienceMode} stage2Tab={stage2Tab} onSetExperienceMode={setExperienceMode} onSetStage2Tab={setStage2Tab}
        onSelectNeighborhood={p.onSelectNeighborhood} onOpenInspector={p.onOpenInspector}
      />

      {methodologyOpen && <MethodologyPanel quality={bundle.quality} isModal onClose={() => setMethodologyOpen(false)} />}
      {savedOpen && (
        <SavedAnalysisPanel
          savedItems={savedItems} shareLinkText={shareUrl} onSaveCurrent={handleSaveAnalysis}
          onLoadItem={(item) => { setDraft(item.filters); setApplied(commitMarketDraft(item.filters)); setCompareHoodIds(item.compareHoodIds); const t = p.evaluatedNeighborhoods.find((h) => h.id === item.neighborhoodId); if (t) p.onSelectNeighborhood(t); }}
          onDeleteItem={(id) => { const next = savedItems.filter((x) => x.id !== id); setSavedItems(next); persistSavedMarketAnalyses(next); }}
          onExportFormat={handleExport} onClose={() => setSavedOpen(false)}
        />
      )}
    </div>
  );
};
