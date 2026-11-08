/** @file src/components/views/ProductViewRouter.tsx — View Router for تهران رادار (< 250 lines) [RULE-01] */
import React from 'react';
import type { EvaluatedNeighborhood } from '../../data/neighborhoods';
import { toPersianNum } from '../../data/neighborhoods';
import type { FeatureFlags, CityId } from '../../types/models';
import { convertPricePerSqmToUnit, formatMillionTomanAsIntlCurrency, type PrimaryViewId } from '../../utils/areaUnit';
import { useAreaUnit, useIntlCurrency, useRadarLocale } from '../AreaUnitToggle';
import { FAST_SALE_FACTOR } from '../../data/hedonicPricingEngine';
import { ProductHomeView } from './ProductHomeView';
import { ProductDiscoverView } from './ProductDiscoverView';
import { ProductIntelligenceView } from './ProductIntelligenceView';
import { ProductToolsView } from './ProductToolsView';
import { ProductUserSpaceView } from './ProductUserSpaceView';
import { updateMapAdvancedOverlayState, useMapAdvancedOverlayState } from '../mapAdvancedLayers';

export interface ProductViewRouterProps {
  primaryView: PrimaryViewId;
  ui: any;
  evaluatedNeighborhoods: EvaluatedNeighborhood[];
  selectedHood: EvaluatedNeighborhood;
  handleSelectNeighborhood: (h: EvaluatedNeighborhood) => void;
  favoriteHoodIds: number[];
  toggleFavoriteHood: (id: number) => void;
  mode: 'rent' | 'buy';
  setMode: (m: 'rent' | 'buy') => void;
  targetSqm: number;
  totalRahnEquivalent: number;
  buyTotalBudget: number;
  deposit: number;
  monthlyRent: number;
  counts: { green: number; yellow: number; red: number };
  featureFlags: FeatureFlags;
  currentUser: any;
  isVerifiedAdmin: boolean;
  activeCity: CityId;
  crudActions: any;
  setShowReverseBudgetModal: (b: boolean) => void;
  onSignOut: () => void;
}

export const ProductViewRouter: React.FC<ProductViewRouterProps> = (p) => {
  const { primaryView, ui, evaluatedNeighborhoods, selectedHood, handleSelectNeighborhood } = p;
  const [splitMapMode, setSplitMapMode] = React.useState<boolean>(true);
  const [areaUnit] = useAreaUnit(), [intlCurrency] = useIntlCurrency(), [radarLocale] = useRadarLocale();
  const isEn = radarLocale === 'en';
  const { comparisonArc, showMetroLines, showTrafficZones } = useMapAdvancedOverlayState();
  const hasActiveArc = Boolean(comparisonArc.active && comparisonArc.hoodA && comparisonArc.hoodB && comparisonArc.hoodA.id !== comparisonArc.hoodB.id);
  const activeDealUnit = convertPricePerSqmToUnit(Math.round(selectedHood.buyPerSqm * FAST_SALE_FACTOR), areaUnit);
  const activeDealFx = intlCurrency !== 'IRT' ? ` · ${formatMillionTomanAsIntlCurrency(activeDealUnit, intlCurrency, radarLocale)}` : '';

  const mapAxisBar = (
    <div className="sticky top-0 z-20 w-full bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800 px-3 sm:px-4 py-2 space-y-1.5">
      <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
          <span className="text-slate-500 dark:text-slate-400 font-medium hidden sm:inline">
            {isEn ? 'Live Map Axis:' : 'محور نقشه زنده:'}
          </span>
          <select
            aria-label="تغییر سریع محله فعال روی نقشه"
            value={selectedHood.id}
            onChange={(e) => {
              const found = evaluatedNeighborhoods.find((h) => h.id === Number(e.target.value));
              if (found) handleSelectNeighborhood(found);
            }}
            className="font-black text-slate-900 dark:text-white bg-slate-100/90 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-emerald-600 cursor-pointer max-w-[155px] sm:max-w-[210px] truncate"
          >
            {evaluatedNeighborhoods.map((h) => (
              <option key={h.id} value={h.id}>{isEn ? `${h.name} (${h.overallScore}/10)` : `محله ${h.name} (${h.overallScore}/۱۰)`}</option>
            ))}
          </select>
          <span className="hidden md:inline text-[11px] font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
            معامله v6.4: {toPersianNum(activeDealUnit)} م{activeDealFx}
          </span>
          <button
            type="button"
            onClick={() => ui.setMobileSheetOpen(true)}
            className="px-2 py-1 rounded-md bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-[11px] font-bold hover:bg-emerald-100/70 transition cursor-pointer shrink-0 whitespace-nowrap"
          >
            {isEn ? 'Scorecard ↗' : 'کارنامه محله ↗'}
          </button>
        </div>
        <div className="flex items-center gap-1.5">
          <div role="group" aria-label={isEn ? 'Deal Mode' : 'نوع معامله'} className="hidden sm:inline-flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg border border-slate-200/70 dark:border-slate-700">
            <button
              type="button"
              onClick={() => p.setMode('buy')}
              className={`px-2 py-0.5 rounded-md text-[11px] font-bold transition cursor-pointer whitespace-nowrap ${p.mode === 'buy' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'}`}
            >
              {isEn ? 'Buy' : 'خرید'}
            </button>
            <button
              type="button"
              onClick={() => p.setMode('rent')}
              className={`px-2 py-0.5 rounded-md text-[11px] font-bold transition cursor-pointer whitespace-nowrap ${p.mode === 'rent' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'}`}
            >
              {isEn ? 'Rent' : 'رهن/اجاره'}
            </button>
          </div>
          <button
            type="button"
            data-testid="toggle-split-map-btn"
            onClick={() => setSplitMapMode((s) => !s)}
            className="flex px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-[11px] font-bold items-center gap-1 transition cursor-pointer whitespace-nowrap"
          >
            <span>{splitMapMode ? (isEn ? 'Expand Panel' : 'نمای عریض پنل') : (isEn ? 'Split Map' : 'کنار نقشه زنده')}</span>
          </button>
          <button
            type="button"
            onClick={() => ui.setPrimaryView('map')}
            className="px-2.5 sm:px-3 py-1 rounded-lg bg-slate-900 dark:bg-emerald-600 hover:opacity-90 text-white text-[11px] font-bold flex items-center gap-1 transition cursor-pointer shadow-xs whitespace-nowrap"
          >
            <span>{isEn ? 'Full Map' : 'نقشه کامل'}</span>
          </button>
        </div>
      </div>
      <div className="max-w-6xl mx-auto flex items-center justify-between gap-1.5 overflow-x-auto no-scrollbar pt-0.5 text-[11px]">
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg shrink-0">
          {[
            { id: 'budget' as const, label: isEn ? 'Budget Lens' : 'لنز بودجه' },
            { id: 'heatmap' as const, label: isEn ? 'Price Heatmap' : 'هیت‌مپ قیمت' },
            { id: 'bubble' as const, label: isEn ? 'Bubble Lens' : 'حباب قیمت' },
            { id: 'air' as const, label: isEn ? 'Air Quality' : 'کیفیت هوا' },
          ].map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => ui.setMapLens(l.id)}
              className={`px-2 py-0.5 rounded-md font-bold transition cursor-pointer whitespace-nowrap ${ui.mapLens === l.id ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
            >
              {l.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            aria-pressed={showMetroLines}
            onClick={() => updateMapAdvancedOverlayState({ showMetroLines: !showMetroLines })}
            className={`px-2 py-0.5 rounded-md border font-bold transition cursor-pointer whitespace-nowrap ${showMetroLines ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-transparent' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'}`}
          >
            {isEn ? '🚇 Metro Lines' : '🚇 خطوط مترو'}
          </button>
          <button
            type="button"
            aria-pressed={showTrafficZones}
            onClick={() => updateMapAdvancedOverlayState({ showTrafficZones: !showTrafficZones })}
            className={`px-2 py-0.5 rounded-md border font-bold transition cursor-pointer whitespace-nowrap ${showTrafficZones ? 'bg-rose-600 text-white border-transparent' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'}`}
          >
            {isEn ? '🚦 Traffic Zone' : '🚦 طرح ترافیک'}
          </button>
        </div>
      </div>
      {hasActiveArc && comparisonArc.hoodA && comparisonArc.hoodB && (
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-2 px-2.5 py-1 rounded-lg bg-indigo-50/90 dark:bg-indigo-950/60 border border-indigo-200/80 dark:border-indigo-800 text-[11px]">
          <span className="font-bold text-indigo-900 dark:text-indigo-200 truncate">
            ⚖️ {isEn ? 'Active Comparison Arc:' : 'کمان مقایسه فعال روی نقشه:'} <strong>{comparisonArc.hoodA.name}</strong> ⇄ <strong>{comparisonArc.hoodB.name}</strong>
          </span>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                ui.setCompareId1(comparisonArc.hoodA!.id);
                ui.setCompareId2(comparisonArc.hoodB!.id);
                ui.setShowCompareModal(true);
              }}
              className="px-2 py-0.5 rounded bg-indigo-600 text-white font-bold hover:bg-indigo-700 transition cursor-pointer whitespace-nowrap"
            >
              {isEn ? 'Full Matrix' : 'جدول مقایسه کامل'}
            </button>
            <button
              type="button"
              aria-label="حذف کمان مقایسه"
              onClick={() => updateMapAdvancedOverlayState({ comparisonArc: { active: false, isPinned: false, hoodA: null, hoodB: null } })}
              className="px-1.5 py-0.5 rounded bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 font-bold cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );

  let content: React.ReactElement | null = null;

  if (primaryView === 'home') {
    content = (
      <ProductHomeView
        evaluatedNeighborhoods={evaluatedNeighborhoods} selectedHood={selectedHood}
        onSelectNeighborhood={(h) => handleSelectNeighborhood(h)}
        onOpenInspector={(h) => { handleSelectNeighborhood(h); ui.setMobileSheetOpen(true); }}
        onNavigateView={ui.setPrimaryView} onOpenBudgetFilter={() => ui.setMobileFilterOpen(true)}
        onOpenReverseBudget={() => p.setShowReverseBudgetModal(true)} onOpenHedonic={() => ui.setShowHedonicModal(true)}
        onOpenCompare={() => ui.setShowCompareModal(true)} onOpenSmartSuggest={() => ui.setShowSmartSuggestModal(true)}
        onOpenSuperModule={(tab) => { ui.setSuperModuleInitialTab(tab); ui.setShowSuperModulesModal(true); }}
        mode={p.mode} setMode={p.setMode} targetSqm={p.targetSqm} totalRahnEquivalent={p.totalRahnEquivalent}
        buyTotalBudget={p.buyTotalBudget} counts={p.counts} featureFlags={p.featureFlags}
      />
    );
  } else if (primaryView === 'discover') {
    content = (
      <ProductDiscoverView
        evaluatedNeighborhoods={evaluatedNeighborhoods} selectedHood={selectedHood}
        onSelectNeighborhood={(h) => handleSelectNeighborhood(h)}
        favoriteHoodIds={p.favoriteHoodIds} onToggleFavorite={p.toggleFavoriteHood}
        onOpenInspector={(h) => { handleSelectNeighborhood(h); ui.setMobileSheetOpen(true); }}
        onOpenCompare={(id1, id2) => { ui.setCompareId1(id1); ui.setCompareId2(id2); ui.setShowCompareModal(true); }}
        onNavigateView={ui.setPrimaryView} mode={p.mode} onChangeMode={p.setMode} targetSqm={p.targetSqm}
      />
    );
  } else if (primaryView === 'intelligence') {
    content = (
      <ProductIntelligenceView
        evaluatedNeighborhoods={evaluatedNeighborhoods} selectedHood={selectedHood}
        onSelectNeighborhood={(h) => handleSelectNeighborhood(h)}
        marketPulse={ui.marketPulse} onOpenPriceTrend={() => ui.setShowPriceTrendModal(true)}
        onOpenPulseModal={() => ui.setShowPulseModal(true)}
        onOpenInspector={(h) => { handleSelectNeighborhood(h); ui.setMobileSheetOpen(true); }}
        onNavigateView={ui.setPrimaryView}
        onSyncMapLens={(lens) => ui.setMapLens(lens)}
        activeCity={p.activeCity}
      />
    );
  } else if (primaryView === 'tools') {
    content = (
      <ProductToolsView
        evaluatedNeighborhoods={evaluatedNeighborhoods}
        selectedHood={selectedHood}
        onSelectNeighborhood={(h) => handleSelectNeighborhood(h)}
        onOpenInspector={(h) => { handleSelectNeighborhood(h); ui.setMobileSheetOpen(true); }}
        onOpenHedonic={() => ui.setShowHedonicModal(true)}
        onOpenSuperModule={(tab) => { ui.setSuperModuleInitialTab(tab); ui.setShowSuperModulesModal(true); }}
        onOpenExpansionModal={(t) => ui.setExpansionModalType(t)} onOpenReverseBudget={() => p.setShowReverseBudgetModal(true)}
        onOpenCompare={() => ui.setShowCompareModal(true)} featureFlags={p.featureFlags}
      />
    );
  } else if (primaryView === 'userspace') {
    content = (
      <ProductUserSpaceView
        currentUser={p.currentUser} onGoogleSignIn={p.crudActions.handleSaveUserPreferences} onSignOut={p.onSignOut}
        isVerifiedAdmin={p.isVerifiedAdmin} onOpenAdminModal={() => ui.setShowAdminModal(true)}
        favoriteHoodIds={p.favoriteHoodIds} onToggleFavorite={p.toggleFavoriteHood}
        evaluatedNeighborhoods={evaluatedNeighborhoods} selectedHood={selectedHood}
        onSelectNeighborhood={(h) => handleSelectNeighborhood(h)}
        onOpenInspector={(h) => { handleSelectNeighborhood(h); ui.setMobileSheetOpen(true); }}
        onOpenShortlistMatrix={() => ui.setShowShortlistMatrixModal(true)}
        onNavigateView={ui.setPrimaryView}
        onOpenBuyerAlertModal={() => ui.setShowBuyerAlertModal(true)}
        visitedHomesCount={ui.visitedHomes.length} onOpenVisitedModal={() => ui.setShowVisitedModal(true)}
        mode={p.mode} deposit={p.deposit} monthlyRent={p.monthlyRent} buyTotalBudget={p.buyTotalBudget}
        targetSqm={p.targetSqm} onOpenBudgetFilter={() => ui.setMobileFilterOpen(true)}
      />
    );
  }

  if (!content) return null;
  return (
    <div className={`overflow-y-auto pb-20 lg:pb-8 pointer-events-auto transition-all duration-200 bg-[#F8F9FA]/95 dark:bg-slate-950/95 backdrop-blur-xl lg:border-l border-slate-200/80 dark:border-slate-800 shadow-2xl ${splitMapMode ? 'mt-[175px] h-[calc(100%-175px)] rounded-t-3xl border-t lg:mt-0 lg:h-full lg:rounded-none lg:border-t-0 w-full lg:w-[60%] xl:w-[56%] 2xl:w-[52%]' : 'h-full w-full lg:w-[calc(100%-220px)]'}`}>
      {mapAxisBar}
      {content}
    </div>
  );
};
