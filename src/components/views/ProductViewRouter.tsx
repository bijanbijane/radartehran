import React from 'react';
import { toPersianNum, type EvaluatedNeighborhood, type Neighborhood, type MapTileServerId } from '../../data/neighborhoods';
import type { FeatureFlags, CityId } from '../../types/models';
import { convertPricePerSqmToUnit, convertPricePerSqmToUnitRaw, formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, type PrimaryViewId } from '../../utils/areaUnit';
import { useAreaUnit, useIntlCurrency, useRadarLocale } from '../AreaUnitToggle';
import { useExchangeRateSnapshot } from '../../features/commerce/services/exchangeRateClient';
import { aggregateNeighborhoodMarketMetrics, buildNeighborhoodListingSamples } from '../../data/realMarketPriceAggregator';
import { updateMapAdvancedOverlayState, useMapAdvancedOverlayState } from '../mapAdvancedLayers';
import { InspectorDrawerSkeleton } from '../NeighborhoodLoadingSkeletons';
import { resolveProductViewRouterShellClasses } from '../../utils/productViewRouterShellClasses';
import { ModuleSecondaryNav } from '../navigation/ModuleSecondaryNav';
import { resolveActiveCityDisplayName, resolveEffectiveSubTab, resolveSecondaryTabsForView } from '../navigation/viewRouterHelpers';
import type { AccountSubTabId, KnowledgeSubTabId, MarketSubTabId, ModuleSubTabId, PropertiesSubTabId, SavedMapViewItem, ToolsSubTabId } from '../../navigation/registry/route.types';

const ProductHomeView = React.lazy(() => import('./ProductHomeView').then((m) => ({ default: m.ProductHomeView })));
const ProductDiscoverView = React.lazy(() => import('./ProductDiscoverView').then((m) => ({ default: m.ProductDiscoverView })));
const ProductIntelligenceView = React.lazy(() => import('./ProductIntelligenceView').then((m) => ({ default: m.ProductIntelligenceView })));
const ProductPropertiesView = React.lazy(() => import('./ProductPropertiesView').then((m) => ({ default: m.ProductPropertiesView })));
const ProductToolsView = React.lazy(() => import('./ProductToolsView').then((m) => ({ default: m.ProductToolsView })));
const ProductUserSpaceView = React.lazy(() => import('./ProductUserSpaceView').then((m) => ({ default: m.ProductUserSpaceView })));
const ProductSecondaryHubView = React.lazy(() => import('./ProductSecondaryHubView').then((m) => ({ default: m.ProductSecondaryHubView })));
const ProductAdminMonitoringView = React.lazy(() => import('./ProductAdminMonitoringView').then((m) => ({ default: m.ProductAdminMonitoringView })));

export interface ProductViewRouterProps {
  primaryView: PrimaryViewId;
  ui: any;
  evaluatedNeighborhoods: EvaluatedNeighborhood[];
  nationwideEvaluatedNeighborhoods?: EvaluatedNeighborhood[];
  allNeighborhoods?: Neighborhood[];
  selectedHood: EvaluatedNeighborhood;
  handleSelectNeighborhood: (h: EvaluatedNeighborhood) => void;
  favoriteHoodIds: number[]; toggleFavoriteHood: (id: number) => void;
  mode: 'rent' | 'buy'; setMode: (m: 'rent' | 'buy') => void;
  targetSqm: number; totalRahnEquivalent: number; buyTotalBudget: number;
  deposit: number; monthlyRent: number;
  counts: { green: number; yellow: number; red: number };
  featureFlags: FeatureFlags;
  currentUser: any; isVerifiedAdmin: boolean;
  activeCity: CityId;
  crudActions: any;
  handleDeepWebSync?: () => void;
  mapTileStyle?: MapTileServerId; setMapTileStyle?: (s: MapTileServerId) => void;
  setShowReverseBudgetModal: (b: boolean) => void;
  onRestoreSavedView?: (v: SavedMapViewItem) => void;
  onSignOut: () => void;
}

export const ProductViewRouter: React.FC<ProductViewRouterProps> = (p) => {
  const { primaryView, ui, evaluatedNeighborhoods, selectedHood, handleSelectNeighborhood } = p;
  const homeContentFirst = primaryView === 'home';
  const [splitMapMode, setSplitMapMode] = React.useState<boolean>(true);
  const [areaUnit] = useAreaUnit(), [intlCurrency] = useIntlCurrency(), [radarLocale] = useRadarLocale();
  const rateState = useExchangeRateSnapshot();
  const isEn = radarLocale === 'en';
  const { comparisonArc, showMetroLines, showTrafficZones } = useMapAdvancedOverlayState();
  const hasActiveArc = Boolean(comparisonArc.active && comparisonArc.hoodA && comparisonArc.hoodB && comparisonArc.hoodA.id !== comparisonArc.hoodB.id);
  const rawDealSqm = aggregateNeighborhoodMarketMetrics(selectedHood.id, selectedHood.name, selectedHood.buyPerSqm, buildNeighborhoodListingSamples(selectedHood)).estimatedDealPricePerSqm;
  const activeDealUnit = convertPricePerSqmToUnit(rawDealSqm, areaUnit), activeDealRaw = convertPricePerSqmToUnitRaw(rawDealSqm, areaUnit);
  const axisAreaSuffix = formatAreaUnitLabel(areaUnit);
  const activeDealLabel = intlCurrency !== 'IRT' ? `${formatMillionTomanAsIntlCurrency(activeDealRaw, intlCurrency, radarLocale, rateState.snapshot)} / ${axisAreaSuffix}` : `${toPersianNum(activeDealUnit)} میلیون تومان / ${axisAreaSuffix}`;
  const secondaryTabs = resolveSecondaryTabsForView(primaryView);
  const effectiveSubTab = resolveEffectiveSubTab(primaryView, ui.activeSubTab);
  const navigateTo = (view: PrimaryViewId, subTab?: ModuleSubTabId) => {
    ui.setActiveSubTab?.(subTab);
    ui.setPrimaryView(view);
  };

  const mapAxisBar = (
    <div className={`${homeContentFirst ? 'hidden lg:block ' : ''}sticky top-0 z-20 w-full bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800 px-3 sm:px-4 py-1.5 space-y-1`}>
      <div className="max-w-[1360px] mx-auto flex flex-wrap items-center justify-between gap-1.5 text-xs">
        <div className="flex items-center gap-1.5 min-w-0">
          <select
            aria-label="تغییر سریع محله فعال روی نقشه"
            value={selectedHood.id}
            onChange={(e) => {
              const found = evaluatedNeighborhoods.find((h) => h.id === Number(e.target.value));
              if (found) handleSelectNeighborhood(found);
            }}
            className="font-black text-slate-900 dark:text-white bg-slate-100/90 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-emerald-600 cursor-pointer max-w-[145px] sm:max-w-[190px] truncate"
          >
            {evaluatedNeighborhoods.map((h) => (
              <option key={h.id} value={h.id}>{isEn ? `${h.name} (${h.overallScore}/10)` : `محله ${h.name} (${h.overallScore}/۱۰)`}</option>
            ))}
          </select>
          <span className="hidden xl:inline text-[11px] font-bold text-emerald-700 dark:text-emerald-400 tabular-nums whitespace-nowrap">
            سناریو v6.4 (غیرثبتی): {activeDealLabel}
          </span>
          <button
            type="button"
            onClick={() => ui.setMobileSheetOpen(true)}
            className="px-2 py-1 rounded-md bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-[11px] font-bold hover:bg-emerald-100/70 transition cursor-pointer shrink-0 whitespace-nowrap"
          >
            {isEn ? 'Scorecard ↗' : 'کارنامه محله ↗'}
          </button>
          <div role="group" aria-label={isEn ? 'Map lens' : 'لنز نمایش نقشه'} className="hidden md:flex items-center gap-0.5 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg shrink-0 text-[10.5px]">
            {([
              { id: 'budget', label: isEn ? 'Budget' : 'بودجه' },
              { id: 'heatmap', label: isEn ? 'Heatmap' : 'هیت‌مپ' },
              { id: 'bubble', label: isEn ? 'Bubble' : 'حباب' },
              { id: 'air', label: isEn ? 'Air' : 'هوا' },
              { id: 'traffic', label: isEn ? 'Traffic' : 'ترافیک' },
            ] as const).map((l) => (
              <button
                key={l.id}
                type="button"
                aria-pressed={ui.mapLens === l.id}
                onClick={() => ui.setMapLens(l.id)}
                className={`px-1.5 py-0.5 rounded-md font-bold transition cursor-pointer whitespace-nowrap ${ui.mapLens === l.id ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <div role="group" aria-label={isEn ? 'Map overlays' : 'لایه‌های روی نقشه'} className="flex items-center gap-1 shrink-0 lg:hidden text-[10.5px]">
            <button
              type="button"
              aria-pressed={showMetroLines}
              onClick={() => updateMapAdvancedOverlayState({ showMetroLines: !showMetroLines })}
              className={`px-1.5 py-0.5 rounded-md border font-bold transition cursor-pointer whitespace-nowrap ${showMetroLines ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-transparent' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'}`}
            >
              {isEn ? 'Metro' : 'مترو'}
            </button>
            <button
              type="button"
              aria-pressed={showTrafficZones}
              onClick={() => updateMapAdvancedOverlayState({ showTrafficZones: !showTrafficZones })}
              className={`px-1.5 py-0.5 rounded-md border font-bold transition cursor-pointer whitespace-nowrap ${showTrafficZones ? 'bg-rose-600 text-white border-transparent' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'}`}
            >
              {isEn ? 'Traffic' : 'طرح'}
            </button>
          </div>
          <div role="group" aria-label={isEn ? 'Deal Mode' : 'نوع معامله'} className="hidden sm:inline-flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg border border-slate-200/70 dark:border-slate-700">
            <button type="button" onClick={() => p.setMode('buy')} className={`px-2 py-0.5 rounded-md text-[11px] font-bold transition cursor-pointer whitespace-nowrap ${p.mode === 'buy' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'}`}>{isEn ? 'Buy' : 'خرید'}</button>
            <button type="button" onClick={() => p.setMode('rent')} className={`px-2 py-0.5 rounded-md text-[11px] font-bold transition cursor-pointer whitespace-nowrap ${p.mode === 'rent' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'}`}>{isEn ? 'Rent' : 'رهن/اجاره'}</button>
          </div>
          <button
            type="button"
            data-testid="toggle-split-map-btn"
            onClick={() => setSplitMapMode((s) => !s)}
            className="hidden lg:flex px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-[11px] font-bold items-center gap-1 transition cursor-pointer whitespace-nowrap"
          >
            <span>{splitMapMode ? (isEn ? 'Expand Panel' : 'نمای عریض پنل') : (isEn ? 'Split Map' : 'کنار نقشه زنده')}</span>
          </button>
          <button
            type="button"
            onClick={() => navigateTo('map')}
            className="px-2.5 py-1 rounded-lg bg-slate-900 dark:bg-emerald-600 hover:opacity-90 text-white text-[11px] font-bold flex items-center gap-1 transition cursor-pointer shadow-xs whitespace-nowrap"
          >
            <span>{isEn ? 'Full Map' : 'نقشه کامل'}</span>
          </button>
        </div>
      </div>
      {hasActiveArc && comparisonArc.hoodA && comparisonArc.hoodB && (
        <div className="max-w-[1360px] mx-auto flex items-center justify-between gap-2 px-2.5 py-1 rounded-lg bg-indigo-50/90 dark:bg-indigo-950/60 border border-indigo-200/80 dark:border-indigo-800 text-[11px]">
          <span className="font-bold text-indigo-900 dark:text-indigo-200 truncate">
            {isEn ? 'Active Comparison Arc:' : 'کمان مقایسه فعال روی نقشه:'} <strong>{comparisonArc.hoodA.name}</strong> ⇄ <strong>{comparisonArc.hoodB.name}</strong>
          </span>
          <div className="flex items-center gap-1.5 shrink-0">
            <button type="button" onClick={() => { ui.setCompareId1(comparisonArc.hoodA!.id); ui.setCompareId2(comparisonArc.hoodB!.id); ui.setShowCompareModal(true); }} className="px-2 py-0.5 rounded bg-indigo-600 text-white font-bold hover:bg-indigo-700 transition cursor-pointer whitespace-nowrap">{isEn ? 'Full Matrix' : 'جدول مقایسه کامل'}</button>
            <button type="button" aria-label="حذف کمان مقایسه" onClick={() => updateMapAdvancedOverlayState({ comparisonArc: { active: false, isPinned: false, hoodA: null, hoodB: null } })} className="px-1.5 py-0.5 rounded bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 font-bold cursor-pointer">✕</button>
          </div>
        </div>
      )}
    </div>
  );

  let content: React.ReactElement | null = null;
  if (primaryView === 'home') {
    content = (
      <ProductHomeView
        evaluatedNeighborhoods={evaluatedNeighborhoods} selectedHood={selectedHood} onSelectNeighborhood={handleSelectNeighborhood}
        onOpenInspector={(h) => { handleSelectNeighborhood(h); ui.setMobileSheetOpen(true); }} onNavigateView={navigateTo}
        onOpenBudgetFilter={() => ui.setMobileFilterOpen(true)} onOpenReverseBudget={() => p.setShowReverseBudgetModal(true)}
        onOpenHedonic={() => ui.setShowHedonicModal(true)} onOpenCompare={() => ui.setShowCompareModal(true)} onOpenSmartSuggest={() => ui.setShowSmartSuggestModal(true)}
        onOpenSuperModule={(tab) => { ui.setSuperModuleInitialTab(tab); ui.setShowSuperModulesModal(true); }}
        onOpenListingVerifier={() => ui.setShowListingVerifierModal(true)} initialListingVerdictText={ui.homeVerdictPrefill}
        activeCity={p.activeCity} mode={p.mode} setMode={p.setMode} targetSqm={p.targetSqm} totalRahnEquivalent={p.totalRahnEquivalent}
        buyTotalBudget={p.buyTotalBudget} counts={p.counts} featureFlags={p.featureFlags}
      />
    );
  } else if (primaryView === 'discover') {
    content = (
      <ProductDiscoverView
        evaluatedNeighborhoods={evaluatedNeighborhoods} selectedHood={selectedHood} onSelectNeighborhood={handleSelectNeighborhood}
        favoriteHoodIds={p.favoriteHoodIds} onToggleFavorite={p.toggleFavoriteHood}
        onOpenInspector={(h) => { handleSelectNeighborhood(h); ui.setMobileSheetOpen(true); }}
        onOpenCompare={(id1, id2) => { ui.setCompareId1(id1); ui.setCompareId2(id2); ui.setShowCompareModal(true); }}
        activeCity={p.activeCity} mode={p.mode} targetSqm={p.targetSqm}
      />
    );
  } else if (primaryView === 'intelligence') {
    content = (
      <ProductIntelligenceView
        evaluatedNeighborhoods={evaluatedNeighborhoods} selectedHood={selectedHood} onSelectNeighborhood={handleSelectNeighborhood}
        marketPulse={ui.marketPulse} onOpenPriceTrend={() => ui.setShowPriceTrendModal(true)} onOpenPulseModal={() => ui.setShowPulseModal(true)}
        onOpenInspector={(h) => { handleSelectNeighborhood(h); ui.setMobileSheetOpen(true); }} onNavigateView={(v) => navigateTo(v)}
        onSyncMapLens={(lens) => ui.setMapLens(lens)} activeCity={p.activeCity}
        activeSubTab={effectiveSubTab as MarketSubTabId} onChangeSubTab={(t) => ui.setActiveSubTab?.(t)}
      />
    );
  } else if (primaryView === 'properties') {
    content = (
      <ProductPropertiesView
        evaluatedNeighborhoods={evaluatedNeighborhoods} selectedHood={selectedHood} activeSubTab={effectiveSubTab as PropertiesSubTabId}
        currentUserUid={p.currentUser?.uid ?? null}
        onChangeSubTab={(t) => ui.setActiveSubTab?.(t)} onSelectNeighborhood={handleSelectNeighborhood}
        onOpenInspector={(h) => { handleSelectNeighborhood(h); ui.setMobileSheetOpen(true); }}
        onOpenHedonicForProperty={(h, params) => { handleSelectNeighborhood(h); if (params) ui.setHedonicInitialParams(params); ui.setShowHedonicModal(true); }}
        onNavigateView={(v) => navigateTo(v)} activeCity={p.activeCity} targetSqm={p.targetSqm}
        splitMapMode={splitMapMode} onToggleSplitMap={() => setSplitMapMode((s) => !s)}
      />
    );
  } else if (primaryView === 'tools') {
    content = (
      <ProductToolsView
        evaluatedNeighborhoods={evaluatedNeighborhoods} selectedHood={selectedHood} onSelectNeighborhood={handleSelectNeighborhood}
        onOpenInspector={(h) => { handleSelectNeighborhood(h); ui.setMobileSheetOpen(true); }} onOpenHedonic={() => ui.setShowHedonicModal(true)}
        onOpenSuperModule={(tab) => { ui.setSuperModuleInitialTab(tab); ui.setShowSuperModulesModal(true); }}
        onOpenExpansionModal={(t) => ui.setExpansionModalType(t)} onOpenReverseBudget={() => p.setShowReverseBudgetModal(true)}
        onOpenCompare={() => ui.setShowCompareModal(true)} featureFlags={p.featureFlags} activeCity={p.activeCity}
        currentUser={p.currentUser} targetSqm={p.targetSqm} activeSubTab={effectiveSubTab as ToolsSubTabId}
      />
    );
  } else if (primaryView === 'userspace') {
    content = (
      <ProductUserSpaceView
        currentUser={p.currentUser} onGoogleSignIn={p.crudActions.handleSaveUserPreferences} onSignOut={p.onSignOut}
        favoriteHoodIds={p.favoriteHoodIds} onToggleFavorite={p.toggleFavoriteHood}
        evaluatedNeighborhoods={evaluatedNeighborhoods} nationwideEvaluatedNeighborhoods={p.nationwideEvaluatedNeighborhoods}
        activeCity={p.activeCity} selectedHood={selectedHood} activeSubTab={effectiveSubTab as AccountSubTabId}
        onSelectNeighborhood={handleSelectNeighborhood} onOpenInspector={(h) => { handleSelectNeighborhood(h); ui.setMobileSheetOpen(true); }}
        onOpenShortlistMatrix={() => ui.setShowShortlistMatrixModal(true)} onNavigateView={navigateTo}
        onOpenBuyerAlertModal={() => ui.setShowBuyerAlertModal(true)} visitedHomesCount={ui.visitedHomes.length}
        onOpenVisitedModal={() => ui.setShowVisitedModal(true)} mode={p.mode} deposit={p.deposit} monthlyRent={p.monthlyRent}
        buyTotalBudget={p.buyTotalBudget} targetSqm={p.targetSqm} totalRahnEquivalent={p.totalRahnEquivalent}
        useLoanBooster={Boolean(ui.useLoanBooster)} onOpenBudgetFilter={() => ui.setMobileFilterOpen(true)}
        onRestoreSavedView={p.onRestoreSavedView}
      />
    );
  } else if (primaryView === 'services' || primaryView === 'knowledge' || primaryView === 'contributions' || primaryView === 'not_found') {
    content = (
      <ProductSecondaryHubView
        viewKind={primaryView} activeSubTab={effectiveSubTab as KnowledgeSubTabId} activeCity={p.activeCity}
        currentUser={p.currentUser} isVerifiedAdmin={p.isVerifiedAdmin} selectedHood={selectedHood}
        evaluatedNeighborhoods={evaluatedNeighborhoods} onSelectNeighborhood={handleSelectNeighborhood} onNavigateView={navigateTo}
        onOpenHedonic={() => ui.setShowHedonicModal(true)} onOpenListingVerifier={() => ui.setShowListingVerifierModal(true)}
        onOpenExpansionModal={(t) => ui.setExpansionModalType(t)} onOpenSuperModule={(tab) => { ui.setSuperModuleInitialTab(tab); ui.setShowSuperModulesModal(true); }}
        onOpenAgencySubmit={() => { ui.setBargainHoodId(selectedHood.id); ui.setShowAgencyModal(true); }}
        onOpenResidentVoteTab={() => { ui.setActiveTab('vote'); ui.setMobileSheetOpen(true); }}
        onOpenPulseModal={() => ui.setShowPulseModal(true)} onOpenSeoDrawer={() => ui.setShowSeoDrawer(true)}
      />
    );
  } else if (primaryView === 'admin') {
    return (
      <div className="w-full h-full overflow-y-auto pointer-events-auto bg-[#F8F9FA] dark:bg-slate-950">
        <React.Suspense fallback={<div className="p-4"><InspectorDrawerSkeleton /></div>}>
          <ProductAdminMonitoringView
            ui={ui} evaluatedNeighborhoods={evaluatedNeighborhoods} allNeighborhoods={p.allNeighborhoods} activeCity={p.activeCity}
            totalLiveBargainsCount={evaluatedNeighborhoods.reduce((acc, h) => acc + (h.bargains?.length || 0), 0)}
            featureFlags={p.featureFlags} currentUser={p.currentUser} isVerifiedAdmin={p.isVerifiedAdmin}
            crudActions={p.crudActions} handleDeepWebSync={p.handleDeepWebSync || (() => {})}
            mapTileStyle={p.mapTileStyle} setMapTileStyle={p.setMapTileStyle}
            activeSection={ui.adminSection} onChangeSection={ui.setAdminSection} onBackToMap={() => navigateTo('map')}
          />
        </React.Suspense>
      </div>
    );
  }

  if (!content) return null;
  const { shellBg, splitShell } = resolveProductViewRouterShellClasses(splitMapMode, homeContentFirst);
  return (
    <div className={`overflow-y-auto pb-20 lg:pb-8 pointer-events-auto transition-all duration-200 ${shellBg} lg:border-l border-slate-200/80 dark:border-slate-800 shadow-2xl ${splitShell}`}>
      {mapAxisBar}
      <ModuleSecondaryNav
        primaryView={primaryView} subTab={effectiveSubTab} tabs={secondaryTabs}
        onSelectSubTab={(t) => ui.setActiveSubTab?.(t)} onNavigateView={navigateTo}
        locale={radarLocale} cityName={resolveActiveCityDisplayName(p.activeCity, isEn)} hoodName={selectedHood.name}
      />
      <React.Suspense fallback={<div className="p-4"><InspectorDrawerSkeleton /></div>}>{content}</React.Suspense>
    </div>
  );
};
