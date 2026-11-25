import React from 'react';
import { toPersianNum, type EvaluatedNeighborhood, type Neighborhood, type MapTileServerId } from '../../data/neighborhoods';
import type { FeatureFlags, CityId } from '../../types/models';
import { convertPricePerSqmToUnit, convertPricePerSqmToUnitRaw, formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, type PrimaryViewId } from '../../utils/areaUnit';
import { useAreaUnit, useIntlCurrency, useRadarLocale } from '../AreaUnitToggle';
import { useExchangeRateSnapshot } from '../../features/commerce/services/exchangeRateClient';
import { aggregateNeighborhoodMarketMetrics, buildNeighborhoodListingSamples } from '../../data/realMarketPriceAggregator';
import { updateMapAdvancedOverlayState, useMapAdvancedOverlayState } from '../mapAdvancedLayers';
import { InspectorDrawerSkeleton } from '../NeighborhoodLoadingSkeletons';
import { FeatureErrorBoundary } from '../FeatureErrorBoundary';
import { resolveProductViewRouterShellClasses } from '../../utils/productViewRouterShellClasses';
import { ModuleSecondaryNav } from '../navigation/ModuleSecondaryNav';
import { resolveActiveCityDisplayName, resolveEffectiveSubTab, resolveSecondaryTabsForView } from '../navigation/viewRouterHelpers';
import { ProductQuietFooter } from '../layout/ProductQuietFooter';
import type { AccountSubTabId, ContributionsSubTabId, KnowledgeSubTabId, MarketSubTabId, ModuleSubTabId, PropertiesSubTabId, SavedMapViewItem, ServicesSubTabId, ToolsSubTabId } from '../../navigation/registry/route.types';

const ProductHomeView = React.lazy(() => import('./ProductHomeView').then((m) => ({ default: m.ProductHomeView })));
const GeographicRegistryView = React.lazy(() => import('./GeographicRegistryView').then((m) => ({ default: m.GeographicRegistryView })));
const ProductDiscoverView = React.lazy(() => import('./ProductDiscoverView').then((m) => ({ default: m.ProductDiscoverView })));
const ProductIntelligenceView = React.lazy(() => import('./ProductIntelligenceView').then((m) => ({ default: m.ProductIntelligenceView })));
const ProductPropertiesView = React.lazy(() => import('./ProductPropertiesView').then((m) => ({ default: m.ProductPropertiesView })));
const ProductToolsView = React.lazy(() => import('./ProductToolsView').then((m) => ({ default: m.ProductToolsView })));
const ProductUserSpaceView = React.lazy(() => import('./ProductUserSpaceView').then((m) => ({ default: m.ProductUserSpaceView })));
const ProductSecondaryHubView = React.lazy(() => import('./ProductSecondaryHubView').then((m) => ({ default: m.ProductSecondaryHubView })));
const ProductAdminMonitoringView = React.lazy(() => import('./ProductAdminMonitoringView').then((m) => ({ default: m.ProductAdminMonitoringView })));
const NeighborhoodDetailView = React.lazy(() => import('./NeighborhoodDetailView').then((m) => ({ default: m.NeighborhoodDetailView })));

export interface ProductViewRouterProps {
  primaryView: PrimaryViewId; ui: any;
  evaluatedNeighborhoods: EvaluatedNeighborhood[]; nationwideEvaluatedNeighborhoods?: EvaluatedNeighborhood[]; allNeighborhoods?: Neighborhood[];
  selectedHood: EvaluatedNeighborhood; handleSelectNeighborhood: (h: EvaluatedNeighborhood) => void;
  favoriteHoodIds: number[]; toggleFavoriteHood: (id: number) => void;
  mode: 'rent' | 'buy'; setMode: (m: 'rent' | 'buy') => void;
  targetSqm: number; totalRahnEquivalent: number; buyTotalBudget: number; deposit: number; monthlyRent: number;
  counts: { green: number; yellow: number; red: number };
  featureFlags: FeatureFlags; currentUser: any; isVerifiedAdmin: boolean; activeCity: CityId; crudActions: any;
  handleDeepWebSync?: () => void; mapTileStyle?: MapTileServerId; setMapTileStyle?: (s: MapTileServerId) => void;
  setShowReverseBudgetModal: (b: boolean) => void; onRestoreSavedView?: (v: SavedMapViewItem) => void; onSignOut: () => void;
  onSplitMapModeChange?: (active: boolean) => void;
}

export const ProductViewRouter: React.FC<ProductViewRouterProps> = (p) => {
  const { primaryView, ui, evaluatedNeighborhoods, selectedHood, handleSelectNeighborhood, onSplitMapModeChange } = p;
  const homeContentFirst = primaryView === 'home';
  const supportsSplitMap = (primaryView === 'discover' && ui.activeSubTab !== 'registry') || primaryView === 'properties';
  const [splitMapMode, setSplitMapMode] = React.useState<boolean>(false);
  const effectiveSplitMap = supportsSplitMap && splitMapMode;
  React.useEffect(() => {
    onSplitMapModeChange?.(effectiveSplitMap);
  }, [effectiveSplitMap, onSplitMapModeChange]);
  const [areaUnit] = useAreaUnit(), [intlCurrency] = useIntlCurrency(), [radarLocale] = useRadarLocale();
  const rateState = useExchangeRateSnapshot();
  const isEn = radarLocale === 'en';
  const { comparisonArc, showMetroLines, showTrafficZones } = useMapAdvancedOverlayState();
  const hasActiveArc = Boolean(comparisonArc.active && comparisonArc.hoodA && comparisonArc.hoodB && comparisonArc.hoodA.id !== comparisonArc.hoodB.id);
  // Listing parsing and market aggregation are CPU-heavy; keep them off unrelated UI rerenders.
  const rawDealSqm = React.useMemo(
    () => aggregateNeighborhoodMarketMetrics(
      selectedHood.id,
      selectedHood.name,
      selectedHood.buyPerSqm,
      buildNeighborhoodListingSamples(selectedHood),
    ).estimatedDealPricePerSqm,
    [selectedHood.id, selectedHood.name, selectedHood.buyPerSqm, selectedHood.bargains],
  );
  const activeDealUnit = convertPricePerSqmToUnit(rawDealSqm, areaUnit), activeDealRaw = convertPricePerSqmToUnitRaw(rawDealSqm, areaUnit);
  const axisAreaSuffix = formatAreaUnitLabel(areaUnit);
  const activeDealLabel = intlCurrency !== 'IRT' ? `${formatMillionTomanAsIntlCurrency(activeDealRaw, intlCurrency, radarLocale, rateState.snapshot)} / ${axisAreaSuffix}` : `${toPersianNum(activeDealUnit)} میلیون تومان / ${axisAreaSuffix}`;
  const secondaryTabs = resolveSecondaryTabsForView(primaryView); const effectiveSubTab = resolveEffectiveSubTab(primaryView, ui.activeSubTab);
  const activeCityName = resolveActiveCityDisplayName(p.activeCity, isEn);
  const navigateTo = (view: PrimaryViewId, subTab?: ModuleSubTabId) => { ui.setActiveSubTab?.(subTab); ui.setPrimaryView(view); };

  const currentPath = typeof window !== 'undefined' ? window.location.pathname.replace(/\/+$/, '') : '';
  const isNeighborhoodDetailSlug =
    primaryView === 'discover' &&
    ((currentPath.startsWith('/areas/') && currentPath !== '/areas/registry') || currentPath.startsWith('/neighborhoods/'));

  const mapAxisBar = effectiveSplitMap ? (
    <div className="sticky top-0 z-20 w-full bg-[var(--color-bg-surface)]/95 backdrop-blur-md border-b border-[var(--color-border-subtle)] px-3 sm:px-4 py-2 space-y-1.5">
      <div className="max-w-[1320px] mx-auto flex flex-wrap items-center justify-between gap-2 text-sm">
        <div className="flex items-center gap-2 min-w-0">
          <select aria-label="تغییر سریع محله فعال روی نقشه" value={selectedHood.id} onChange={(e) => { const found = evaluatedNeighborhoods.find((h) => h.id === Number(e.target.value)); if (found) handleSelectNeighborhood(found); }} className="min-h-[44px] lg:min-h-[36px] font-semibold text-[var(--color-text-primary)] bg-[var(--color-bg-muted)] border border-[var(--color-border-subtle)] rounded-lg px-2.5 py-1 text-sm focus:outline-none focus:border-[var(--color-brand-600)] cursor-pointer max-w-[175px] sm:max-w-[220px] truncate">
            {evaluatedNeighborhoods.map((h) => (
              <option key={h.id} value={h.id}>
                {isEn
                  ? `${h.name} (${h.overallScore.toFixed(1)}/10)`
                  : `محله ${h.name} (${toPersianNum(h.overallScore.toFixed(1).replace('.', '٫'))} از ۱۰)`}
              </option>
            ))}
          </select>
          <span className="hidden xl:inline text-sm font-semibold text-[var(--color-brand-fg)] tabular-nums whitespace-nowrap">برآورد معامله: {activeDealLabel}</span>
          <button type="button" onClick={() => ui.setMobileSheetOpen(true)} className="min-h-[44px] lg:min-h-[36px] px-3 py-1 rounded-lg bg-[var(--color-brand-soft)] text-[var(--color-brand-fg)] border border-[var(--color-brand-soft-border)] text-sm font-semibold hover:opacity-90 transition cursor-pointer shrink-0 whitespace-nowrap">{isEn ? 'Scorecard ↗' : 'کارنامه محله ↗'}</button>
        </div>
        <div className="flex items-center gap-2">
          <div role="group" aria-label={isEn ? 'Map overlays' : 'لایه‌های روی نقشه'} className="flex items-center gap-1.5 shrink-0 lg:hidden text-sm">
            <button type="button" aria-pressed={showMetroLines} onClick={() => updateMapAdvancedOverlayState({ showMetroLines: !showMetroLines })} className={`min-h-[44px] px-3 py-1 rounded-lg border font-semibold transition cursor-pointer whitespace-nowrap ${showMetroLines ? 'bg-[var(--color-brand-600)] text-white border-transparent' : 'bg-[var(--color-bg-surface)] text-[var(--color-text-secondary)] border-[var(--color-border-subtle)]'}`}>{isEn ? 'Metro' : 'مترو'}</button>
            <button type="button" aria-pressed={showTrafficZones} onClick={() => updateMapAdvancedOverlayState({ showTrafficZones: !showTrafficZones })} className={`min-h-[44px] px-3 py-1 rounded-lg border font-semibold transition cursor-pointer whitespace-nowrap ${showTrafficZones ? 'bg-rose-600 text-white border-transparent' : 'bg-[var(--color-bg-surface)] text-[var(--color-text-secondary)] border-[var(--color-border-subtle)]'}`}>{isEn ? 'Traffic' : 'طرح'}</button>
          </div>
          <button type="button" data-testid="toggle-split-map-btn" onClick={() => setSplitMapMode((s) => !s)} className="hidden lg:inline-flex min-h-[36px] px-3 py-1 rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] hover:bg-[var(--color-bg-muted)] text-[var(--color-text-primary)] text-sm font-semibold items-center gap-1 transition cursor-pointer whitespace-nowrap">
            <span>{isEn ? 'Full Width' : 'نمای تمام‌عرض'}</span>
          </button>
          <button type="button" onClick={() => navigateTo('map')} className="min-h-[44px] lg:min-h-[36px] px-3 py-1 rounded-lg bg-[var(--color-brand-600)] hover:bg-[var(--color-brand-700)] text-white text-sm font-semibold flex items-center gap-1 transition cursor-pointer whitespace-nowrap">
            <span>{isEn ? 'Full Map' : 'نقشه کامل'}</span>
          </button>
        </div>
      </div>
      {hasActiveArc && comparisonArc.hoodA && comparisonArc.hoodB && (
        <div className="max-w-[1320px] mx-auto flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg bg-[var(--color-brand-soft)] border border-[var(--color-brand-soft-border)] text-sm">
          <span className="font-semibold text-[var(--color-brand-fg)] truncate">
            {isEn ? 'Active Comparison Arc:' : 'کمان مقایسه فعال روی نقشه:'} <strong>{comparisonArc.hoodA.name}</strong> ⇄ <strong>{comparisonArc.hoodB.name}</strong>
          </span>
          <div className="flex items-center gap-1.5 shrink-0">
            <button type="button" onClick={() => { ui.setCompareId1(comparisonArc.hoodA!.id); ui.setCompareId2(comparisonArc.hoodB!.id); ui.setShowCompareModal(true); }} className="min-h-[36px] px-3 py-1 rounded-lg bg-[var(--color-brand-600)] text-white font-semibold hover:opacity-90 transition cursor-pointer whitespace-nowrap">{isEn ? 'Full Matrix' : 'جدول مقایسه کامل'}</button>
            <button type="button" aria-label="حذف کمان مقایسه" onClick={() => updateMapAdvancedOverlayState({ comparisonArc: { active: false, isPinned: false, hoodA: null, hoodB: null } })} className="min-h-[36px] min-w-[36px] px-2 py-1 rounded-lg bg-[var(--color-bg-surface)] text-[var(--color-text-secondary)] border border-[var(--color-border-subtle)] font-bold cursor-pointer">✕</button>
          </div>
        </div>
      )}
    </div>
  ) : null;

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
    content = effectiveSubTab === 'registry' ? (
      <GeographicRegistryView />
    ) : isNeighborhoodDetailSlug ? (
      <NeighborhoodDetailView
        hood={selectedHood}
        allNeighborhoods={evaluatedNeighborhoods}
        activeCity={p.activeCity}
        targetSqm={p.targetSqm}
        isFavorite={p.favoriteHoodIds.includes(selectedHood.id)}
        onToggleFavorite={p.toggleFavoriteHood}
        onSelectNeighborhood={handleSelectNeighborhood}
        onNavigateView={navigateTo}
        onOpenCompare={(id1, id2) => { ui.setCompareId1(id1); ui.setCompareId2(id2); ui.setShowCompareModal(true); }}
      />
    ) : (
      <ProductDiscoverView
        evaluatedNeighborhoods={evaluatedNeighborhoods} selectedHood={selectedHood} onSelectNeighborhood={handleSelectNeighborhood}
        favoriteHoodIds={p.favoriteHoodIds} onToggleFavorite={p.toggleFavoriteHood}
        onOpenInspector={(h) => { handleSelectNeighborhood(h); ui.setMobileSheetOpen(true); }}
        onOpenCompare={(id1, id2) => { ui.setCompareId1(id1); ui.setCompareId2(id2); ui.setShowCompareModal(true); }}
        activeCity={p.activeCity} mode={p.mode} targetSqm={p.targetSqm}
        splitMapMode={effectiveSplitMap} onToggleSplitMap={() => setSplitMapMode((s) => !s)}
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
        splitMapMode={effectiveSplitMap} onToggleSplitMap={() => setSplitMapMode((s) => !s)}
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
        onSelectSubTab={(t) => ui.setActiveSubTab?.(t)}
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
        viewKind={primaryView} activeSubTab={effectiveSubTab as ServicesSubTabId | KnowledgeSubTabId | ContributionsSubTabId} activeCity={p.activeCity}
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
      <div className="w-full h-full overflow-y-auto pointer-events-auto bg-[var(--color-bg-canvas)] dark:bg-[#0D1513]">
        <FeatureErrorBoundary sectionName="پنل نظارت و مدیریت" resetKey={ui.adminSection}>
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
        </FeatureErrorBoundary>
      </div>
    );
  }

  if (!content) return null;
  const { shellBg, splitShell } = resolveProductViewRouterShellClasses(effectiveSplitMap, homeContentFirst);
  return (
    <div className={`overflow-y-auto pb-20 md:pb-8 pointer-events-auto transition-[background-color,box-shadow] duration-200 min-w-0 flex flex-col ${shellBg} ${effectiveSplitMap ? 'lg:border-l border-[var(--color-border-subtle)] dark:border-[var(--color-border-subtle)] shadow-2xl' : ''} ${splitShell}`}>
      {mapAxisBar}
      <ModuleSecondaryNav
        primaryView={primaryView}
        subTab={effectiveSubTab}
        tabs={isNeighborhoodDetailSlug ? [] : secondaryTabs}
        onSelectSubTab={(t) => ui.setActiveSubTab?.(t)}
        onNavigateView={navigateTo}
        locale={radarLocale}
        cityName={activeCityName}
        hoodName={isNeighborhoodDetailSlug ? selectedHood.name : undefined}
      />
      <div className="flex-1">
        <FeatureErrorBoundary key={primaryView} sectionName="بخش محتوای رادار" resetKey={`${primaryView}-${effectiveSubTab || 'default'}`}>
          <React.Suspense fallback={<div className="p-4"><InspectorDrawerSkeleton /></div>}>{content}</React.Suspense>
        </FeatureErrorBoundary>
      </div>
      <ProductQuietFooter
        onNavigateView={navigateTo}
        onOpenSeoDirectory={() => ui.setShowSeoDrawer?.(true)}
        onOpenLegal={() => ui.setShowLegalModal?.(true)}
      />
    </div>
  );
};
