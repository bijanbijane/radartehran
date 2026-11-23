/** @file src/components/RadarWorkspaceShell.tsx — Extracted Spatial GIS & PropTech Workspace Shell (< 275 lines) [RULE-01] */
import { useState, useMemo, useEffect, useRef, lazy, Suspense } from 'react';
import { WORK_HUBS, Neighborhood, EvaluatedNeighborhood, isAuthorizedAdminUser, MapTileServerId, parseInitialUrlParams, hydrateNeighborhoodsFromStorage, DEFAULT_FEATURE_FLAGS, FeatureFlags, CityId } from '../data/neighborhoods';
import { MULTI_CITY_CONFIGS, getAllMultiCityNeighborhoods, resolveCityIdForNeighborhood } from '../data/multiCityData';
import { findProvinceForHood } from '../data/iranProvincesDirectory';
import { FloatingTopBar } from './FloatingTopBar';
import { NeighborhoodInspectorDrawer } from './NeighborhoodInspectorDrawer';
import { useLeafletRadarMap, type MapNavigationIntent } from './useLeafletRadarMap';
import { getCityServiceCoverage, SUPPORTED_CITY_IDS, CITY_DISPLAY_NAMES, CANONICAL_BRAND_FA } from '../utils/geo/cityGeospatialResolver';
import { useRadarCloudSync } from './useRadarCloudSync';
import { useEvaluatedNeighborhoods } from './useEvaluatedNeighborhoods';
import { useRadarCrudActions } from './useRadarCrudActions';
import { useAppUiState } from './useAppUiState';
import { useAppUrlAndTitleSync } from './useAppUrlAndTitleSync';
import { AppModalsPortal } from './AppModalsPortal';
import { RadarBottomNav } from './RadarBottomNav';
import { resolveInitialPreferredTileStyle } from './mapBaseTileController';
import { FeatureErrorBoundary } from './FeatureErrorBoundary';
import { useMarketPulseSync } from './useMarketPulseSync';
import { FEATURE_FLAGS_STORAGE_KEY, useAppPersistenceAndDerivedState } from './useAppPersistenceAndDerivedState';
import { formatAreaShort, formatMillionTomanAsIntlCurrency, getRadarLocaleDirection, getStoredAreaUnit, getStoredIntlCurrency, getStoredRadarLocale, subscribeAreaUnit } from '../utils/areaUnit';
import { SHOW_INTL_UNIT_CURRENCY_CONTROLS } from './AreaUnitToggle';
import { ProductGlobalHeader } from './navigation/ProductGlobalHeader';
import { MapToolRail } from './navigation/MapToolRail';
import { ProductViewRouter } from './views/ProductViewRouter';
import { DevPerformancePanel } from './DevPerformancePanel';
import { setActiveAccountScopeUid } from '../features/account/services/accountStorageScope';
import type { SavedMapViewItem } from '../navigation/registry/route.types';
const ReverseBudgetDiscoveryModal = lazy(() => import('./modals/ReverseBudgetDiscoveryModal').then((m) => ({ default: m.ReverseBudgetDiscoveryModal })));

async function signOutCurrentUser(): Promise<void> {
  const [{ auth }, { signOut }] = await Promise.all([
    import('../firebase'),
    import('firebase/auth'),
  ]);
  await signOut(auth);
}

export function RadarWorkspaceShell() {
  const handleSignOut = (): void => {
    void signOutCurrentUser().catch((error) => {
      console.error('RadarTehran sign-out failed:', error);
    });
  };

  const [, setIntlTick] = useState(0);
  useEffect(() => subscribeAreaUnit(() => setIntlTick((t) => t + 1)), []);
  const areaUnit = SHOW_INTL_UNIT_CURRENCY_CONTROLS ? getStoredAreaUnit() : 'sqm';
  const intlCurrency = SHOW_INTL_UNIT_CURRENCY_CONTROLS ? getStoredIntlCurrency() : 'IRT';
  const radarLocale = SHOW_INTL_UNIT_CURRENCY_CONTROLS ? getStoredRadarLocale() : 'fa';
  const initialUrlState = useMemo(() => parseInitialUrlParams(), []);
  const allExpansionSeeds = useMemo(() => getAllMultiCityNeighborhoods().filter((n) => n.id >= 100 && !(n.id >= 500 && n.id <= 599)), []);
  const activeCityRef = useRef<CityId>(initialUrlState.initialCity || 'tehran');
  const [neighborhoods, setNeighborhoods] = useState<Neighborhood[]>(() => hydrateNeighborhoodsFromStorage(allExpansionSeeds));
  const [mode, setMode] = useState<'rent' | 'buy'>(initialUrlState.initialMode || 'rent'), [deposit, setDeposit] = useState<number>(initialUrlState.initialDeposit ?? 2800), [monthlyRent, setMonthlyRent] = useState<number>(initialUrlState.initialMonthlyRent ?? 45);
  const [buyTotalBudget, setBuyTotalBudget] = useState<number>(initialUrlState.initialBuyBudget ?? 24500), [targetSqm, setTargetSqm] = useState<number>(initialUrlState.initialTargetSqm ?? 80);
  const [buildingAgeSegment, setBuildingAgeSegment] = useState<'new' | 'mid' | 'older'>('new'), [deductTenantRahnInBuy, setDeductTenantRahnInBuy] = useState<boolean>(false), [workHubId, setWorkHubId] = useState<string>(initialUrlState.initialWorkHubId || 'none'), [showReverseBudgetModal, setShowReverseBudgetModal] = useState<boolean>(false);
  const [favoriteHoodIds, setFavoriteHoodIds] = useState<number[]>(() => { try { const s = localStorage.getItem('tehran_radar_favorites_v1'); if (s) { const p = JSON.parse(s); if (Array.isArray(p)) return p.filter((id) => typeof id === 'number' && !Number.isNaN(id)).slice(0, 25); } } catch { /* ignore */ } return [5, 13]; });
  const [featureFlags, setFeatureFlags] = useState<FeatureFlags>(() => { try { const s = localStorage.getItem(FEATURE_FLAGS_STORAGE_KEY); if (s) return { ...DEFAULT_FEATURE_FLAGS, ...JSON.parse(s) }; } catch { /* ignore */ } return DEFAULT_FEATURE_FLAGS; });
  const [mapTileStyle, setMapTileStyle] = useState<MapTileServerId>(() => resolveInitialPreferredTileStyle());
  const [appleTheme, setAppleTheme] = useState<'light' | 'dark'>(() => { try { return localStorage.getItem('tehran_radar_apple_theme_v1') === 'dark' ? 'dark' : 'light'; } catch { return 'light'; } });
  useEffect(() => {
    document.documentElement.classList.toggle('dark', appleTheme === 'dark'); document.documentElement.classList.toggle('apple-dark', appleTheme === 'dark');
    document.documentElement.setAttribute('data-apple-theme', appleTheme);
    try { localStorage.setItem('tehran_radar_apple_theme_v1', appleTheme); } catch { /* ignore */ }
  }, [appleTheme]);
  const toggleAppleTheme = () => setAppleTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  const ui = useAppUiState(initialUrlState);
  const anatomyTabsRef = useRef<HTMLDivElement | null>(null);
  const searchFocusTimerRef = useRef<number | null>(null);
  useEffect(() => () => { if (searchFocusTimerRef.current !== null) window.clearTimeout(searchFocusTimerRef.current); }, []);
  const buyAgeMultiplier = buildingAgeSegment === 'new' ? 1.0 : buildingAgeSegment === 'mid' ? 0.88 : 0.76;
  const rentAgeMultiplier = buildingAgeSegment === 'new' ? 1.0 : buildingAgeSegment === 'mid' ? 0.90 : 0.80;
  const { currentUser, cloudBargainsByHood, cloudSponsorsByHood, connectionStatus } = useRadarCloudSync({
    activeCity: ui.activeCity, hasUrlBudgetParams: initialUrlState.hasUrlBudgetParams, setMode, setDeposit, setMonthlyRent, setBuyTotalBudget, setTargetSqm, setWorkHubId,
    setFavoriteHoodIds, setFeatureFlags, setNeighborhoods, setCloudVotes: ui.setCloudVotes, setSponsorRequests: ui.setSponsorRequests, setBuyerLeads: ui.setBuyerLeads, setHasDelegatedAdminDoc: ui.setHasDelegatedAdminDoc,
  });
  const isVerifiedAdmin = useMemo(() => isAuthorizedAdminUser(currentUser, ui.hasDelegatedAdminDoc), [ui.hasDelegatedAdminDoc, currentUser?.uid, currentUser?.email, currentUser?.emailVerified]);
  useEffect(() => { setActiveAccountScopeUid(currentUser?.uid ?? null); }, [currentUser?.uid]);
  const { fetchMarketPulse, handleDeepWebSync } = useMarketPulseSync({ ui, activeCityRef, currentUser, allExpansionSeeds, setNeighborhoods });
  const activeCityWorkHubs = useMemo(() => (ui.activeCity === 'tehran' ? WORK_HUBS : (MULTI_CITY_CONFIGS[ui.activeCity]?.workHubs || WORK_HUBS)), [ui.activeCity]);
  const selectedWorkHub = useMemo(() => activeCityWorkHubs.find((w) => w.id === workHubId) || activeCityWorkHubs[0] || WORK_HUBS[0], [activeCityWorkHubs, workHubId]);
  const { totalRahnEquivalent, maxAffordablePerSqm, extraGreenWithLoan, evaluatedNeighborhoods, nationwideEvaluatedNeighborhoods, nationwideFilteredNeighborhoods, counts, smartSuggestedNeighborhoods } = useEvaluatedNeighborhoods({
    activeCity: ui.activeCity, neighborhoods, cloudBargainsByHood, cloudSponsorsByHood, cloudVotes: ui.cloudVotes, mode, deposit, monthlyRent, buyTotalBudget, targetSqm, useLoanBooster: ui.useLoanBooster,
    deductTenantRahnInBuy, buyAgeMultiplier, rentAgeMultiplier, selectedWorkHub, statusFilter: ui.statusFilter, deferredSearchQuery: ui.searchQuery, onlyOutsideTrafficZone: ui.onlyOutsideTrafficZone, onlyHighMetro: ui.onlyHighMetro, suggestSortBy: ui.suggestSortBy,
  });
  const { selectedHood, compHood1, compHood2, hoodLandmarks, targetBargainHood, liveBargainCheck, totalLiveBargainsCount, calculatedHoodMonthlyRent, localAnalysis, marketReport, bestIndicator, deepInsight, directMetroCommuteInfo, rentVsBuyVerdict, tradeUpResults } = useAppPersistenceAndDerivedState({
    ui, neighborhoods, evaluatedNeighborhoods, nationwideEvaluatedNeighborhoods, favoriteHoodIds, featureFlags, isVerifiedAdmin, mode, targetSqm, rentAgeMultiplier, totalRahnEquivalent, maxAffordablePerSqm, selectedWorkHub, workHubId,
  });
  const closeFloatingMapPanels = (except?: 'search' | 'filter' | 'tools' | 'legend' | 'rail' | 'spatial') => {
    if (except !== 'search') ui.setShowSearchDropdown(false);
    if (except !== 'filter') ui.setMobileFilterOpen(false);
    if (except !== 'tools') ui.setShowToolsPopover(false);
    if (except !== 'legend') ui.setShowMapLegendPopover(false);
    if (except !== 'rail') ui.setMapRailPanel(null);
    if (except !== 'spatial') ui.setShowSpatialTools(false);
  };
  const navigationIntentRef = useRef<MapNavigationIntent>('initial_mount');
  const applyCityContextTransition = (cityId: CityId, intent: MapNavigationIntent, targetHoodId?: number, targetCenter?: [number, number], targetZoom?: number) => {
    const cityChanged = activeCityRef.current !== cityId;
    navigationIntentRef.current = intent;
    if (intent !== 'manual_map_pan') closeFloatingMapPanels();
    activeCityRef.current = cityId;
    ui.setActiveCity(cityId);
    ui.setInvalidCityParam(null);
    if (cityChanged) ui.setSearchQuery('');
    if (intent !== 'manual_map_pan') ui.setGeoContextResolution(null);
    setWorkHubId('none');
    if (getCityServiceCoverage(cityId).capabilities.trafficZones === 'NOT_SUPPORTED') {
      ui.setOnlyOutsideTrafficZone(false);
    }
    const cfg = MULTI_CITY_CONFIGS[cityId];
    const firstId = targetHoodId ?? (cityId === 'tehran' ? 5 : cfg.neighborhoods[0]?.id || 101);
    const secondId = cityId === 'tehran' ? 14 : cfg.neighborhoods[1]?.id || firstId;
    ui.setSelectedHoodId(firstId); ui.setCompareId1(firstId); ui.setCompareId2(secondId);
    if (!ui.showAgencyModal) { ui.setBargainHoodId(firstId); ui.setSponsorHoodId(firstId); }
    if (!ui.showBuyerAlertModal) ui.setAlertHoodId(firstId);
    if (intent !== 'manual_map_pan' && mapInstanceRef.current && (!cityChanged || targetCenter || targetZoom)) {
      const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 1024;
      const baseCenter = targetCenter || cfg.center;
      const adjustedCenter: [number, number] = [baseCenter[0], baseCenter[1] + (isDesktop && ui.primaryView === 'map' ? 0.055 : 0)];
      try { mapInstanceRef.current.flyTo(adjustedCenter, targetZoom || cfg.defaultZoom, { duration: 0.85 }); } catch { /* ignore */ }
    }
  };
  const handleSwitchCity = (cityId: CityId, targetHoodId?: number, targetCenter?: [number, number], targetZoom?: number) => {
    applyCityContextTransition(cityId, 'explicit_city_select', targetHoodId, targetCenter, targetZoom);
  };
  const handleMapAutoSwitchCity = (cityId: CityId) => {
    applyCityContextTransition(cityId, 'manual_map_pan');
  };
  const handleSelectNeighborhood = (hood: EvaluatedNeighborhood) => {
    navigationIntentRef.current = 'programmatic_hood_jump';
    const ownerCity = resolveCityIdForNeighborhood(hood.id);
    if (ownerCity !== activeCityRef.current) {
      activeCityRef.current = ownerCity; ui.setActiveCity(ownerCity); ui.setInvalidCityParam(null); ui.setGeoContextResolution(null); setWorkHubId('none');
      if (getCityServiceCoverage(ownerCity).capabilities.trafficZones === 'NOT_SUPPORTED') ui.setOnlyOutsideTrafficZone(false);
    }
    ui.setSelectedHoodId(hood.id);
    if (!ui.showAgencyModal && !ui.showBuyerAlertModal) { ui.setBargainHoodId(hood.id); ui.setSponsorHoodId(hood.id); ui.setAlertHoodId(hood.id); }
    else { if (!ui.showAgencyModal) { ui.setBargainHoodId(hood.id); ui.setSponsorHoodId(hood.id); } if (!ui.showBuyerAlertModal) ui.setAlertHoodId(hood.id); }
    ui.setVoteStatus(null); closeFloatingMapPanels();
    if (mapInstanceRef.current && typeof hood.lat === 'number' && !Number.isNaN(hood.lat)) {
      const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 1024;
      const [latOffset, lngOffset] = [!isDesktop && ui.primaryView !== 'map' ? -0.022 : 0, isDesktop ? (ui.primaryView !== 'map' ? 0.032 : 0.055) : 0];
      const currentZoom = typeof mapInstanceRef.current.getZoom === 'function' ? mapInstanceRef.current.getZoom() : 12;
      const targetZoom = Math.max(13, Number.isFinite(currentZoom) ? currentZoom : 13);
      try { mapInstanceRef.current.flyTo([hood.lat + latOffset, hood.lng + lngOffset], targetZoom, { duration: 0.7 }); } catch { /* ignore */ }
    }
  };
  const toggleFavoriteHood = (id: number) => setFavoriteHoodIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  const handleRestoreSavedView = (saved: SavedMapViewItem) => {
    closeFloatingMapPanels(); ui.setMapLens(saved.lens); setMode(saved.mode);
    const found = nationwideEvaluatedNeighborhoods.find((h) => h.id === saved.hoodId) || evaluatedNeighborhoods.find((h) => h.id === saved.hoodId);
    if (found) handleSelectNeighborhood(found);
    else if (saved.cityId in MULTI_CITY_CONFIGS) handleSwitchCity(saved.cityId as CityId, saved.hoodId);
    ui.setPrimaryView('map'); ui.setActiveSubTab(undefined);
  };
  const { mapContainerRef, mapInstanceRef, handleFocusLandmarkOnMap, isMapLoaded } = useLeafletRadarMap({
    activeCity: ui.activeCity, mapTileStyle, setMapTileStyle,
    deferredMapNeighborhoods: nationwideFilteredNeighborhoods, selectedHoodId: ui.selectedHoodId, selectedHood,
    mode, targetSqm, rentAgeMultiplier, selectedWorkHub, statusFilter: ui.statusFilter, mapLens: ui.mapLens,
    showGoldPins: ui.showGoldPins, showLandmarkPins: ui.showLandmarkPins, hoodLandmarks, featureFlags,
    navigationIntentRef, onMapAutoSwitchCity: handleMapAutoSwitchCity, onGeoContextStatusChange: ui.setGeoContextResolution,
    onSelectNeighborhood: handleSelectNeighborhood,
    onOpenModalQuick: (hoodId, action) => {
      closeFloatingMapPanels();
      const found = nationwideEvaluatedNeighborhoods.find((n) => n.id === hoodId) || evaluatedNeighborhoods.find((n) => n.id === hoodId);
      if (found) handleSelectNeighborhood(found);
      if (action === 'anatomy') { ui.setActiveTab('scorecard'); ui.setMobileSheetOpen(true); anatomyTabsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
      else if (action === 'hedonic') ui.setShowHedonicModal(true);
      else if (action === 'bargains') { ui.setActiveTab('bargains'); ui.setMobileSheetOpen(true); }
      else if (action === 'compare') { ui.setCompareId1(hoodId); ui.setShowCompareModal(true); }
      else if (action === 'share') ui.setShowShareModal(true);
    },
  });

  useEffect(() => {
    if (!mapInstanceRef.current) return undefined;
    const timerId = setTimeout(() => mapInstanceRef.current?.invalidateSize(), 60);
    return () => clearTimeout(timerId);
  }, [ui.primaryView]);
  useAppUrlAndTitleSync({
    activeCity: ui.activeCity, setActiveCity: ui.setActiveCity, selectedHood, selectedHoodId: ui.selectedHoodId,
    setSelectedHoodId: ui.setSelectedHoodId, showCompareModal: ui.showCompareModal, setShowCompareModal: ui.setShowCompareModal,
    compareId1: ui.compareId1, setCompareId1: ui.setCompareId1, compareId2: ui.compareId2, setCompareId2: ui.setCompareId2,
    compHood1, compHood2, mode, setMode, deposit, setDeposit, monthlyRent, setMonthlyRent,
    buyTotalBudget, setBuyTotalBudget, targetSqm, setTargetSqm, workHubId, setWorkHubId,
    primaryView: ui.primaryView, setPrimaryView: ui.setPrimaryView,
    activeSubTab: ui.activeSubTab, setActiveSubTab: ui.setActiveSubTab, setAdminSection: ui.setAdminSection, mapInstanceRef,
    hasUrlBudgetParams: Boolean(initialUrlState.hasUrlBudgetParams), useLoanBooster: ui.useLoanBooster, setUseLoanBooster: ui.setUseLoanBooster, deductTenantRahnInBuy, setDeductTenantRahnInBuy, buildingAgeSegment, setBuildingAgeSegment,
    invalidCityParam: ui.invalidCityParam, setInvalidCityParam: ui.setInvalidCityParam, navigationIntentRef,
  });

  const crudActions = useRadarCrudActions({
    currentUser, isVerifiedAdmin, activeCity: ui.activeCity, mode, deposit, monthlyRent, buyTotalBudget, targetSqm, workHubId, useLoanBooster: ui.useLoanBooster, deductTenantRahnInBuy, buildingAgeSegment,
    favoriteHoodIds, setFavoriteHoodIds, featureFlags, setFeatureFlags, neighborhoods, setNeighborhoods, evaluatedNeighborhoods,
    selectedHood, selectedHoodId: ui.selectedHoodId, setSelectedHoodId: ui.setSelectedHoodId, onSelectNeighborhood: handleSelectNeighborhood,
    setMobileSheetOpen: ui.setMobileSheetOpen, setActiveTab: ui.setActiveTab, setShowGoldPins: ui.setShowGoldPins, mapInstanceRef, allExpansionSeeds,
    bargainHoodId: ui.bargainHoodId, bargainType: ui.bargainType, bargainSqm: ui.bargainSqm, bargainTitle: ui.bargainTitle, setBargainTitle: ui.setBargainTitle,
    bargainStreet: ui.bargainStreet, setBargainStreet: ui.setBargainStreet, bargainProposedPrice: ui.bargainProposedPrice,
    bargainUploadedMedia: ui.bargainUploadedMedia, setBargainUploadedMedia: ui.setBargainUploadedMedia, setBargainSubmitMsg: ui.setBargainSubmitMsg,
    targetBargainHood, liveBargainCheck, sponsorHoodId: ui.sponsorHoodId, sponsorAgencyName: ui.sponsorAgencyName, sponsorPhone: ui.sponsorPhone,
    sponsorSpecialty: ui.sponsorSpecialty, sponsorExpYears: ui.sponsorExpYears, sponsorPlanMonths: ui.sponsorPlanMonths,
    sponsorTrackingCode: ui.sponsorTrackingCode, setSponsorTrackingCode: ui.setSponsorTrackingCode, setSponsorSubmitMsg: ui.setSponsorSubmitMsg,
    sponsorRequests: ui.sponsorRequests, setSponsorRequests: ui.setSponsorRequests, alertHoodId: ui.alertHoodId, alertFullName: ui.alertFullName,
    setAlertFullName: ui.setAlertFullName, alertPhone: ui.alertPhone, setAlertPhone: ui.setAlertPhone, alertDealType: ui.alertDealType,
    alertMaxBudget: ui.alertMaxBudget, setAlertSubmitMsg: ui.setAlertSubmitMsg, buyerLeads: ui.buyerLeads, setBuyerLeads: ui.setBuyerLeads,
    setAdminUnlocked: ui.setAdminUnlocked, adminPassInput: ui.adminPassInput, setAdminPassInput: ui.setAdminPassInput,
    setAdminPassError: ui.setAdminPassError, savedAdminPassword: ui.savedAdminPassword, setSavedAdminPassword: ui.setSavedAdminPassword,
    newAdminPassword: ui.newAdminPassword, setNewAdminPassword: ui.setNewAdminPassword, setAdminPassChangeMsg: ui.setAdminPassChangeMsg,
    adminEditHoodId: ui.adminEditHoodId, adminEditBuySqm: ui.adminEditBuySqm, adminEditRahn80m: ui.adminEditRahn80m,
    setAdminPriceSavedMsg: ui.setAdminPriceSavedMsg, setBackupStatusMsg: ui.setBackupStatusMsg, voteAir: ui.voteAir, votePower: ui.votePower,
    voteInternet: ui.voteInternet, voteMetro: ui.voteMetro, voteSecurity: ui.voteSecurity, voteFlat: ui.voteFlat, voteComment: ui.voteComment,
    setVoteComment: ui.setVoteComment, setVoteStatus: ui.setVoteStatus, setVerifyingGeo: ui.setVerifyingGeo, setSavingPrefs: ui.setSavingPrefs,
    setPrefsMessage: ui.setPrefsMessage, setLastSyncNotice: ui.setLastSyncNotice, setCallingSponsorHoodId: ui.setCallingSponsorHoodId,
    setRevealedSponsorPhoneHoodId: ui.setRevealedSponsorPhoneHoodId, bestIndicator, marketReport, setCopiedShare: ui.setCopiedShare,
  });

  return (
    <div id="top" dir={getRadarLocaleDirection(radarLocale)} data-area-unit={areaUnit} data-intl-currency={intlCurrency} data-radar-locale={radarLocale} data-intl-budget={`${formatMillionTomanAsIntlCurrency(buyTotalBudget, intlCurrency)} · ${formatAreaShort(targetSqm, areaUnit)}`} style={{ height: 'var(--app-height, 100dvh)' }} className="relative w-full overflow-hidden bg-[#F6F8F6] dark:bg-slate-950 text-[#182522] dark:text-slate-100 flex flex-col">
      {ui.primaryView !== 'admin' && (
        <ProductGlobalHeader
          primaryView={ui.primaryView} activeSubTab={ui.activeSubTab} activeCity={ui.activeCity} onSwitchCity={handleSwitchCity}
          onSelectPrimaryView={(v, sub) => { ui.setMobileSheetOpen(false); closeFloatingMapPanels(); ui.setActiveSubTab(sub); ui.setPrimaryView(v); }}
          appleTheme={appleTheme} onToggleAppleTheme={toggleAppleTheme} searchQuery={ui.searchQuery}
          isSearchOpen={ui.showSearchDropdown}
          onOpenSearch={() => {
            if (searchFocusTimerRef.current !== null) { window.clearTimeout(searchFocusTimerRef.current); searchFocusTimerRef.current = null; }
            closeFloatingMapPanels('search');
            ui.setShowSearchDropdown((p) => {
              const next = !p;
              if (next) searchFocusTimerRef.current = window.setTimeout(() => { searchFocusTimerRef.current = null; (document.querySelector('input[aria-label="جست‌وجوی محله"]') as HTMLInputElement | null)?.focus(); }, 30);
              return next;
            });
          }}
          onMegaMenuAction={(act) => {
            if (act === 'visited') ui.setShowVisitedModal(true); else if (act === 'onboarding') ui.setShowOnboardingModal(true);
            else if (act === 'seo') ui.setShowSeoDrawer(true); else if (act === 'listing_verifier') ui.setShowListingVerifierModal(true);
            else if (act === 'reverse_budget') setShowReverseBudgetModal(true);
          }}
          activePlaceLabelFa={findProvinceForHood(ui.selectedHoodId)?.capitalFa} invalidCityParam={ui.invalidCityParam} currentUser={currentUser}
        />
      )}
      <div id={ui.primaryView === 'map' ? 'radar-main-content' : undefined} tabIndex={ui.primaryView === 'map' ? -1 : undefined} role="region" aria-label="نقشه تعاملی محله‌ها" className={`fixed inset-0 ${ui.primaryView === 'admin' ? 'top-0' : ui.primaryView === 'map' ? 'top-[56px]' : 'top-[56px] lg:top-[68px]'} z-0 focus:outline-none`}>
        <div ref={mapContainerRef} className="w-full h-full bg-[#E9EFEC]" />
        {!isMapLoaded && (
          <div data-testid="map-loading-indicator" className="absolute inset-0 flex items-center justify-center bg-[#F6F8F6]/70 dark:bg-slate-900/60 backdrop-blur-[2px] pointer-events-none z-10 transition-opacity duration-300">
            <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/95 dark:bg-slate-800/95 shadow-md border border-[#DCE3DF] dark:border-slate-700 text-xs font-bold text-[#182522] dark:text-slate-200">
              <span className="w-3 h-3 border-2 border-[#176B63] border-t-transparent rounded-full animate-spin" />
              <span>در حال بارگذاری نقشه محله‌ها...</span>
            </div>
          </div>
        )}
      </div>
      {ui.invalidCityParam && (
        <div className="fixed inset-0 top-[56px] lg:top-[68px] z-[55] bg-slate-950/45 backdrop-blur-[3px] flex items-start justify-center pt-10 sm:pt-16 px-3">
          <div role="alert" data-testid="invalid-city-banner" className="max-w-xl w-full rounded-2xl border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-900 shadow-2xl p-4 sm:p-5 space-y-3 text-xs">
            <div className="text-sm font-black text-amber-800 dark:text-amber-300">
              شهر درخواستی «{ui.invalidCityParam}» در {CANONICAL_BRAND_FA} پشتیبانی نمی‌شود
            </div>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
              برای جلوگیری از نمایش اطلاعات اشتباه، سامانه به‌صورت خودکار به تهران تغییر نکرد. لطفاً یکی از کلان‌شهرهای فعال زیر را انتخاب کنید:
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-0.5">
              {SUPPORTED_CITY_IDS.map((cid) => (
                <button key={cid} type="button" onClick={() => handleSwitchCity(cid)} className="px-3.5 py-1.5 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold hover:bg-emerald-700 dark:hover:bg-emerald-200 transition cursor-pointer">
                  {CITY_DISPLAY_NAMES[cid].fa}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      {!ui.invalidCityParam && (ui.geoContextResolution?.status === 'outside_city_boundaries' || ui.geoContextResolution?.status === 'ambiguous') && (
        <div role="status" data-testid="geo-context-banner" className="fixed left-1/2 -translate-x-1/2 bottom-20 lg:bottom-6 z-[45] max-w-md w-[calc(100vw-1.5rem)] rounded-xl border border-slate-300 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md shadow-xl px-3.5 py-2.5 flex items-center justify-between gap-2 text-[11px]">
          <span className="font-bold text-slate-700 dark:text-slate-200">
            {ui.geoContextResolution.status === 'ambiguous'
              ? 'مرکز نقشه در مرز هم‌پوشان شهری قرار دارد؛ شهر فعال تغییر نکرد.'
              : 'مرکز نقشه خارج از محدودهٔ کلان‌شهرهای پشتیبانی‌شده است.'}
          </span>
          <button type="button" onClick={() => handleSwitchCity(ui.activeCity)} className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white font-bold shrink-0 cursor-pointer">
            بازگشت به {CITY_DISPLAY_NAMES[ui.activeCity].fa}
          </button>
        </div>
      )}
      <FloatingTopBar
        primaryView={ui.primaryView} activeCity={ui.activeCity} invalidCityParam={ui.invalidCityParam} featureFlags={featureFlags} onSwitchCity={handleSwitchCity} searchQuery={ui.searchQuery} setSearchQuery={ui.setSearchQuery}
        showSearchDropdown={ui.showSearchDropdown} setShowSearchDropdown={ui.setShowSearchDropdown} evaluatedNeighborhoods={evaluatedNeighborhoods} selectedHood={selectedHood}
        selectedHoodId={ui.selectedHoodId} onSelectNeighborhood={handleSelectNeighborhood} setMobileSheetOpen={ui.setMobileSheetOpen} onLocateNearestHood={crudActions.handleLocateNearestHood}
        mobileFilterOpen={ui.mobileFilterOpen} setMobileFilterOpen={ui.setMobileFilterOpen} showToolsPopover={ui.showToolsPopover} setShowToolsPopover={ui.setShowToolsPopover} onBeforeOpenFloatingPanel={(panel) => closeFloatingMapPanels(panel)}
        counts={counts} setShowOnboardingModal={ui.setShowOnboardingModal} mode={mode} setMode={setMode} deposit={deposit} setDeposit={setDeposit} monthlyRent={monthlyRent} setMonthlyRent={setMonthlyRent}
        buyTotalBudget={buyTotalBudget} setBuyTotalBudget={setBuyTotalBudget} targetSqm={targetSqm} setTargetSqm={setTargetSqm} buildingAgeSegment={buildingAgeSegment} setBuildingAgeSegment={setBuildingAgeSegment}
        deductTenantRahnInBuy={deductTenantRahnInBuy} setDeductTenantRahnInBuy={setDeductTenantRahnInBuy} useLoanBooster={ui.useLoanBooster} setUseLoanBooster={ui.setUseLoanBooster}
        extraGreenWithLoan={extraGreenWithLoan} workHubId={workHubId} setWorkHubId={setWorkHubId} activeCityWorkHubs={activeCityWorkHubs} statusFilter={ui.statusFilter} setStatusFilter={ui.setStatusFilter}
        onlyOutsideTrafficZone={ui.onlyOutsideTrafficZone} setOnlyOutsideTrafficZone={ui.setOnlyOutsideTrafficZone} onlyHighMetro={ui.onlyHighMetro} setOnlyHighMetro={ui.setOnlyHighMetro}
        onSaveUserPreferences={crudActions.handleSaveUserPreferences} savingPrefs={ui.savingPrefs} currentUser={currentUser} onCopyBudgetShareLink={crudActions.handleCopyBudgetShareLink}
        prefsMessage={ui.prefsMessage} mapLens={ui.mapLens} setMapLens={ui.setMapLens} setSuperModuleInitialTab={ui.setSuperModuleInitialTab} setShowSuperModulesModal={ui.setShowSuperModulesModal}
        setShowHedonicModal={ui.setShowHedonicModal} setShowSmartSuggestModal={ui.setShowSmartSuggestModal} setShowCompareModal={ui.setShowCompareModal} setExpansionModalType={ui.setExpansionModalType}
        setBargainHoodId={ui.setBargainHoodId} setSponsorHoodId={ui.setSponsorHoodId} setShowAgencyModal={ui.setShowAgencyModal} totalLiveBargainsCount={totalLiveBargainsCount}
        setShowVisitedModal={ui.setShowVisitedModal} visitedHomesCount={ui.visitedHomes.length} setTradeUpCurrentHoodId={ui.setTradeUpCurrentHoodId} setShowTradeUpModal={ui.setShowTradeUpModal}
        setAlertHoodId={ui.setAlertHoodId} setAlertSubmitMsg={ui.setAlertSubmitMsg} setShowBuyerAlertModal={ui.setShowBuyerAlertModal} setShowPulseModal={ui.setShowPulseModal} marketPulse={ui.marketPulse}
        setShowSeoDrawer={ui.setShowSeoDrawer} mapTileStyle={mapTileStyle} setMapTileStyle={setMapTileStyle} onSignOut={handleSignOut} onGoogleSignIn={crudActions.handleSaveUserPreferences}
        showMapLegendPopover={ui.showMapLegendPopover} setShowMapLegendPopover={ui.setShowMapLegendPopover} mobileSheetOpen={ui.mobileSheetOpen} lastSyncNotice={ui.lastSyncNotice}
        setShowNationwideProvinceModal={ui.setShowNationwideProvinceModal} connectionStatus={connectionStatus} onOpenReverseBudgetModal={() => setShowReverseBudgetModal(true)}
        onFlyToCityCenter={() => { const cfg = MULTI_CITY_CONFIGS[ui.activeCity]; if (mapInstanceRef.current) mapInstanceRef.current.flyTo(cfg.center, cfg.defaultZoom, { duration: 0.7 }); }}
        onNavigateView={(v, sub) => { ui.setShowSearchDropdown(false); ui.setShowToolsPopover(false); closeFloatingMapPanels(); ui.setActiveSubTab(sub); ui.setPrimaryView(v); }} />
      <MapToolRail
        visible={ui.primaryView === 'map'} locale={radarLocale} activeCity={ui.activeCity} selectedHood={selectedHood} evaluatedNeighborhoods={evaluatedNeighborhoods} targetSqm={targetSqm} mapLens={ui.mapLens} setMapLens={ui.setMapLens}
        mapTileStyle={mapTileStyle} setMapTileStyle={setMapTileStyle} mode={mode} hasFilterApplied={ui.statusFilter !== 'all' || ui.onlyOutsideTrafficZone || ui.onlyHighMetro}
        openPanel={ui.mapRailPanel} onChangeOpenPanel={ui.setMapRailPanel} showSpatialTools={ui.showSpatialTools} onChangeShowSpatialTools={ui.setShowSpatialTools}
        onCloseCompetingPanels={() => closeFloatingMapPanels('rail')} onToggleFilterPopover={() => { closeFloatingMapPanels('filter'); ui.setMobileFilterOpen((p) => !p); }} onLocateNearestHood={crudActions.handleLocateNearestHood}
        onOpenCompareModal={() => ui.setShowCompareModal(true)} onOpenPriceTrendModal={() => ui.setShowPriceTrendModal(true)} onOpenInspectorDrawer={() => ui.setMobileSheetOpen(true)} onRestoreSavedView={handleRestoreSavedView} />
      {ui.primaryView !== 'map' && (
        <main id="radar-main-content" tabIndex={-1} className="relative z-10 w-full flex-1 overflow-hidden pointer-events-none flex justify-start focus:outline-none">
          <ProductViewRouter
            primaryView={ui.primaryView} ui={ui} evaluatedNeighborhoods={evaluatedNeighborhoods} nationwideEvaluatedNeighborhoods={nationwideEvaluatedNeighborhoods} allNeighborhoods={neighborhoods}
            selectedHood={selectedHood} handleSelectNeighborhood={handleSelectNeighborhood} favoriteHoodIds={favoriteHoodIds} toggleFavoriteHood={toggleFavoriteHood} mode={mode}
            setMode={setMode} targetSqm={targetSqm} totalRahnEquivalent={totalRahnEquivalent} buyTotalBudget={buyTotalBudget} deposit={deposit} monthlyRent={monthlyRent} counts={counts}
            featureFlags={featureFlags} currentUser={currentUser} isVerifiedAdmin={isVerifiedAdmin} activeCity={ui.activeCity} crudActions={crudActions} handleDeepWebSync={handleDeepWebSync}
            mapTileStyle={mapTileStyle} setMapTileStyle={setMapTileStyle} setShowReverseBudgetModal={setShowReverseBudgetModal} onRestoreSavedView={handleRestoreSavedView} onSignOut={handleSignOut} />
        </main>
      )}
      {(ui.primaryView === 'map' || ui.mobileSheetOpen) && ui.primaryView !== 'admin' && (
        <FeatureErrorBoundary sectionName="پنل کالبدشکافی محله" resetKey={ui.selectedHoodId}>
          <NeighborhoodInspectorDrawer
            isOverlayOnSecondaryView={ui.primaryView !== 'map'} mobileSheetOpen={ui.mobileSheetOpen} setMobileSheetOpen={ui.setMobileSheetOpen} appleTheme={appleTheme}
            onToggleAppleTheme={toggleAppleTheme} mapTileStyle={mapTileStyle} setMapTileStyle={setMapTileStyle} favoriteHoodIds={favoriteHoodIds} onToggleFavoriteHood={toggleFavoriteHood}
            onOpenShortlistMatrix={() => ui.setShowShortlistMatrixModal(true)} evaluatedNeighborhoods={evaluatedNeighborhoods} selectedHood={selectedHood} onSelectNeighborhood={handleSelectNeighborhood}
            activeCity={ui.activeCity} onSwitchCity={handleSwitchCity} onOpenShareModal={() => ui.setShowShareModal(true)} targetSqm={targetSqm} rentAgeMultiplier={rentAgeMultiplier}
            selectedWorkHub={selectedWorkHub} workHubId={workHubId} workHubs={activeCityWorkHubs} onSelectWorkHubId={setWorkHubId} onChangeTargetSqm={setTargetSqm}
            onChangeBuildingAgeSegment={setBuildingAgeSegment} useLoanBooster={ui.useLoanBooster} onToggleLoanBooster={() => ui.setUseLoanBooster((p) => !p)} deductTenantRahnInBuy={deductTenantRahnInBuy}
            onToggleDeductTenantRahn={() => setDeductTenantRahnInBuy((p) => !p)} featureFlags={featureFlags} anatomyTabsRef={anatomyTabsRef}
            setShowHedonicModal={(v, params) => { if (params) ui.setHedonicInitialParams(params); ui.setShowHedonicModal(v); }} setExpansionModalType={ui.setExpansionModalType}
            setSuperModuleInitialTab={ui.setSuperModuleInitialTab} setShowSuperModulesModal={ui.setShowSuperModulesModal} activeTab={ui.activeTab} setActiveTab={ui.setActiveTab}
            mode={mode} buildingAgeSegment={buildingAgeSegment} localAnalysis={localAnalysis} directMetroCommuteInfo={directMetroCommuteInfo} deepInsight={deepInsight}
            rentVsBuyVerdict={rentVsBuyVerdict} marketReport={marketReport} hoodCustomDeposit={ui.hoodCustomDeposit} setHoodCustomDeposit={ui.setHoodCustomDeposit}
            calculatedHoodMonthlyRent={calculatedHoodMonthlyRent} setTradeUpCurrentHoodId={ui.setTradeUpCurrentHoodId} setShowTradeUpModal={ui.setShowTradeUpModal}
            setBargainHoodId={ui.setBargainHoodId} setSponsorHoodId={ui.setSponsorHoodId} setAgencyModalTab={ui.setAgencyModalTab} setShowAgencyModal={ui.setShowAgencyModal}
            setAlertHoodId={ui.setAlertHoodId} setAlertSubmitMsg={ui.setAlertSubmitMsg} setShowBuyerAlertModal={ui.setShowBuyerAlertModal} callingSponsorHoodId={ui.callingSponsorHoodId}
            revealedSponsorPhoneHoodId={ui.revealedSponsorPhoneHoodId} onTrackSponsorCall={crudActions.handleTrackSponsorCall} setNewVisitAddress={ui.setNewVisitAddress}
            setNewVisitPrice={ui.setNewVisitPrice} setShowVisitedModal={ui.setShowVisitedModal} hoodLandmarks={hoodLandmarks}
            onFocusLandmarkOnMap={(lm) => { ui.setShowLandmarkPins(true); handleFocusLandmarkOnMap(lm); }} voteAir={ui.voteAir} setVoteAir={ui.setVoteAir}
            votePower={ui.votePower} setVotePower={ui.setVotePower} voteInternet={ui.voteInternet} setVoteInternet={ui.setVoteInternet} voteMetro={ui.voteMetro} setVoteMetro={ui.setVoteMetro}
            voteSecurity={ui.voteSecurity} setVoteSecurity={ui.setVoteSecurity} voteFlat={ui.voteFlat} setVoteFlat={ui.setVoteFlat} voteComment={ui.voteComment} setVoteComment={ui.setVoteComment}
            verifyingGeo={ui.verifyingGeo} onResidentVote={crudActions.handleResidentVote} voteStatus={ui.voteStatus} cloudVotes={ui.cloudVotes} totalRahnEquivalent={totalRahnEquivalent}
            buyTotalBudget={buyTotalBudget} deposit={deposit} monthlyRent={monthlyRent} visitedHomes={ui.visitedHomes} />
        </FeatureErrorBoundary>
      )}
      <RadarBottomNav
        primaryView={ui.primaryView} onSelectPrimaryView={(v) => { ui.setShowSearchDropdown(false); ui.setPrimaryView(v); }} activeCity={ui.activeCity} onSwitchCity={handleSwitchCity}
        appleTheme={appleTheme} onToggleAppleTheme={toggleAppleTheme} mobileSheetOpen={ui.mobileSheetOpen} setMobileSheetOpen={ui.setMobileSheetOpen}
        mobileFilterOpen={ui.mobileFilterOpen} setMobileFilterOpen={ui.setMobileFilterOpen} showToolsPopover={ui.showToolsPopover} setShowToolsPopover={ui.setShowToolsPopover}
        onCloseFloatingPanels={() => closeFloatingMapPanels()}
        onFlyToHood={() => { if (mapInstanceRef.current && selectedHood) mapInstanceRef.current.flyTo([selectedHood.lat, selectedHood.lng], 12.5, { duration: 0.5 }); }}
        onOpenOnboarding={() => ui.setShowOnboardingModal(true)} onOpenVisitedLog={() => ui.setShowVisitedModal(true)}
      />
      {showReverseBudgetModal && (
        <FeatureErrorBoundary sectionName="کشف محله بر اساس بودجه" resetKey={ui.activeCity} onDismissModal={() => setShowReverseBudgetModal(false)}>
          <Suspense fallback={null}>
            <ReverseBudgetDiscoveryModal
              isOpen={showReverseBudgetModal} onClose={() => setShowReverseBudgetModal(false)} initialBudgetMillion={buyTotalBudget} initialAreaSqm={targetSqm} initialMaxAgeYears={buildingAgeSegment === 'new' ? 5 : buildingAgeSegment === 'mid' ? 12 : 20} useLoanBooster={ui.useLoanBooster} deductTenantRahnInBuy={deductTenantRahnInBuy}
              neighborhoods={evaluatedNeighborhoods.map((h) => ({ id: String(h.id), nameFa: h.name, districtNumber: (h.id % 22) + 1, zoneLabel: h.zone, avgPricePerSqmMillion: h.baseBuyPerSqm ?? h.buyPerSqm, rahn80m: h.rahn80m, overallScore: h.overallScore, bargains: h.bargains }))}
              onSelectNeighborhood={(id, budgetMillion, areaSqm, ageYears) => {
                const found = evaluatedNeighborhoods.find((h) => String(h.id) === id);
                if (typeof budgetMillion === 'number' && budgetMillion > 0) setBuyTotalBudget(budgetMillion);
                if (typeof areaSqm === 'number' && areaSqm >= 35) setTargetSqm(areaSqm); if (typeof ageYears === 'number') setBuildingAgeSegment(ageYears <= 5 ? 'new' : ageYears <= 15 ? 'mid' : 'older');
                if (found) { setMode('buy'); handleSelectNeighborhood(found); ui.setMobileSheetOpen(true); }
              }} />
          </Suspense>
        </FeatureErrorBoundary>
      )}
      <FeatureErrorBoundary sectionName="پنجره‌ها و ابزارهای تخصصی" resetKey={ui.activeCity}>
        <AppModalsPortal
          ui={ui} mode={mode} setMode={setMode} totalRahnEquivalent={totalRahnEquivalent} maxAffordablePerSqm={maxAffordablePerSqm} smartSuggestedNeighborhoods={smartSuggestedNeighborhoods}
          handleSelectNeighborhood={handleSelectNeighborhood} targetSqm={targetSqm} setTargetSqm={setTargetSqm} rentAgeMultiplier={rentAgeMultiplier} evaluatedNeighborhoods={evaluatedNeighborhoods}
          nationwideEvaluatedNeighborhoods={nationwideEvaluatedNeighborhoods} allNeighborhoods={neighborhoods} targetBargainHood={targetBargainHood} liveBargainCheck={liveBargainCheck}
          featureFlags={featureFlags} compHood1={compHood1} compHood2={compHood2} buyTotalBudget={buyTotalBudget} setBuyTotalBudget={setBuyTotalBudget}
          favoriteHoodIds={favoriteHoodIds} toggleFavoriteHood={toggleFavoriteHood} selectedHood={selectedHood} marketReport={marketReport} bestIndicator={bestIndicator}
          totalLiveBargainsCount={totalLiveBargainsCount} handleDeepWebSync={handleDeepWebSync} isVerifiedAdmin={isVerifiedAdmin} currentUser={currentUser} fetchMarketPulse={fetchMarketPulse}
          deposit={deposit} setDeposit={setDeposit} monthlyRent={monthlyRent} setMonthlyRent={setMonthlyRent} setDeductTenantRahnInBuy={setDeductTenantRahnInBuy} tradeUpResults={tradeUpResults}
          workHubId={workHubId} setWorkHubId={setWorkHubId} buildingAgeSegment={buildingAgeSegment} setBuildingAgeSegment={setBuildingAgeSegment} deductTenantRahnInBuy={deductTenantRahnInBuy}
          activeCityWorkHubs={activeCityWorkHubs} mapTileStyle={mapTileStyle} setMapTileStyle={setMapTileStyle} onSwitchCity={handleSwitchCity}
          onFlyTo={(lat, lng) => mapInstanceRef.current?.flyTo([lat, lng], 13, { duration: 0.6 })} {...crudActions} />
      </FeatureErrorBoundary>
      <DevPerformancePanel />
    </div>
  );
}
