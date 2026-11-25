import React from 'react'; import type { EvaluatedNeighborhood, Neighborhood, SponsorCrmRequestItem, CityId, MapTileServerId, } from '../data/neighborhoods'; import { MULTI_CITY_CONFIGS } from '../data/multiCityData'; import { convertPricePerSqmToUnit, formatAreaUnitLabel, formatMillionTomanAsIntlCurrency } from '../utils/areaUnit'; import type { FeatureFlags } from '../utils/security'; import type { BubbleReport } from '../types/models'; import { useAreaUnit, useIntlCurrency, useRadarLocale } from './AreaUnitToggle'; import type { AppUiState } from './useAppUiState'; import { PersistentPriceThresholdMatchBanner, useBuyerPriceThresholdAlerts, } from './buyerPriceThresholdAlerts'; const SmartSuggestModal = React.lazy(() => import('./SmartSuggestModal').then((m) => ({ default: m.SmartSuggestModal }))); const AgencyModal = React.lazy(() => import('./AgencyModal').then((m) => ({ default: m.AgencyModal }))); const CompareModal = React.lazy(() => import('./CompareModal').then((m) => ({ default: m.CompareModal }))); const ShortlistMatrixModal = React.lazy(() => import('./ShortlistMatrixModal').then((m) => ({ default: m.ShortlistMatrixModal })));
const ShareModal = React.lazy(() => import('./ShareModal').then((m) => ({ default: m.ShareModal }))); const SecondaryModals = React.lazy(() => import('./SecondaryModals').then((m) => ({ default: m.SecondaryModals }))); const ExpansionModulesModal = React.lazy(() => import('./ExpansionModulesModal').then((m) => ({ default: m.ExpansionModulesModal }))); const FutureSuperModulesModal = React.lazy(() => import('./FutureSuperModulesModal').then((m) => ({ default: m.FutureSuperModulesModal }))); const OnboardingWizardModal = React.lazy(() => import('./OnboardingWizardModal').then((m) => ({ default: m.OnboardingWizardModal }))); const HedonicValuationModal = React.lazy(() => import('./HedonicValuationModal').then((m) => ({ default: m.HedonicValuationModal }))); const PortfolioModals = React.lazy(() => import('./PortfolioModals').then((m) => ({ default: m.PortfolioModals }))); const NationwideProvinceModal = React.lazy(() => import('./NationwideProvinceModal').then((m) => ({ default: m.NationwideProvinceModal })));
const NeighborhoodPriceTrendModal = React.lazy(() => import('./NeighborhoodPriceTrendModal').then((m) => ({ default: m.NeighborhoodPriceTrendModal })));
const InstantListingVerifierModal = React.lazy(() => import('./modals/InstantListingVerifierModal').then((m) => ({ default: m.InstantListingVerifierModal })));
export interface AppModalsPortalProps { ui: AppUiState; onSwitchCity?: (city: CityId, targetHoodId?: number, targetCenter?: [number, number], targetZoom?: number) => void; mode: 'rent' | 'buy'; setMode: (m: 'rent' | 'buy') => void; totalRahnEquivalent: number; maxAffordablePerSqm: number; smartSuggestedNeighborhoods: EvaluatedNeighborhood[]; handleSelectNeighborhood: (hood: EvaluatedNeighborhood) => void; targetSqm: number; setTargetSqm: (v: number) => void; rentAgeMultiplier: number; evaluatedNeighborhoods: EvaluatedNeighborhood[]; nationwideEvaluatedNeighborhoods?: EvaluatedNeighborhood[]; allNeighborhoods?: Neighborhood[]; targetBargainHood: Neighborhood; liveBargainCheck: any; handleSubmitBargainListing: (e: React.FormEvent) => void; handleReserveSponsor: (e: React.FormEvent) => void;
  featureFlags: FeatureFlags; compHood1?: EvaluatedNeighborhood; compHood2?: EvaluatedNeighborhood; buyTotalBudget: number; setBuyTotalBudget: (v: number) => void; favoriteHoodIds: number[]; toggleFavoriteHood: (id: number) => void; selectedHood: EvaluatedNeighborhood; marketReport: BubbleReport; bestIndicator: { label: string; score: number }; handleCopyShareCard: () => void; handleAdminLogin: (e: React.FormEvent) => void; totalLiveBargainsCount: number; handleAdminApproveSponsor: (item: SponsorCrmRequestItem) => void; handleAdminDeleteSponsorRequest: (id: string) => void; handleDownloadBuyerLeadsCsv: () => void;
  handleAdminDeleteBargain: (hoodId: number, bId: string) => void; handleAdminApproveBargain?: (hoodId: number, bId: string) => void; handleAdminQuickPriceSave: (e: React.FormEvent) => void; handleDeepWebSync: () => void; handleAdminChangePassword: (e: React.FormEvent) => void; handleToggleFeatureFlag: (key: keyof FeatureFlags) => void; handleDownloadFullBackupJson: () => void; handleRestoreFullBackupJson: (e: React.ChangeEvent<HTMLInputElement>) => void; isVerifiedAdmin: boolean; currentUser: any; handleExtendSponsor30Days: (id: number) => void; handleReleaseHoodSponsor: (id: number) => void; fetchMarketPulse: (force?: boolean, city?: CityId) => void;
  handleRegisterBuyerAlert: (e: React.FormEvent) => void; isSavingBuyerAlert?: boolean; deposit: number; setDeposit: (v: number) => void; monthlyRent: number; setMonthlyRent: (v: number) => void; setDeductTenantRahnInBuy: (v: boolean) => void; tradeUpResults: any; workHubId: string; setWorkHubId: (v: string) => void; buildingAgeSegment: 'new' | 'mid' | 'older'; setBuildingAgeSegment: (v: 'new' | 'mid' | 'older') => void; deductTenantRahnInBuy: boolean; activeCityWorkHubs: any[]; onFlyTo?: (lat: number, lng: number) => void;
  mapTileStyle?: MapTileServerId; setMapTileStyle?: (style: MapTileServerId) => void; }
export function AppModalsPortal(p: AppModalsPortalProps) { const { ui } = p; const [areaUnit] = useAreaUnit(); const [intlCurrency] = useIntlCurrency(); const [locale] = useRadarLocale(); const thresholdAlerts = useBuyerPriceThresholdAlerts(p.evaluatedNeighborhoods); const effectiveBuyBudget = ui.useLoanBooster ? p.buyTotalBudget + 1200 : p.buyTotalBudget; const unitMaxAffordable = convertPricePerSqmToUnit(p.maxAffordablePerSqm, areaUnit); const portalIntlSummary = `${formatAreaUnitLabel(areaUnit)} | ${formatMillionTomanAsIntlCurrency(unitMaxAffordable, intlCurrency, locale)}`;
  React.useEffect(() => {
    // F-11 IA consolidation: Admin has one canonical surface at /admin (ProductAdminMonitoringView)
    if (!ui.showAdminModal || typeof window === 'undefined') return;
    ui.setShowAdminModal(false);
    if (window.location.pathname !== '/admin') {
      window.history.pushState({}, '', '/admin');
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  }, [ui]);
  const handleOpenSeoComparison = (id1: number, id2: number) => {
    ui.setCompareId1(id1); ui.setCompareId2(id2); ui.setSelectedHoodId(id1); ui.setShowCompareModal(true);
    const h1 = p.evaluatedNeighborhoods.find((n) => n.id === id1) || p.allNeighborhoods?.find((n) => n.id === id1);
    if (h1 && p.onFlyTo) p.onFlyTo(h1.lat, h1.lng);
  };
  const handleTriggerPwaInstall = async () => {
    if (ui.deferredPwaPrompt) {
      try { ui.deferredPwaPrompt.prompt(); await ui.deferredPwaPrompt.userChoice; ui.setDeferredPwaPrompt(null); return; } catch { /* ignore */ }
    }
    ui.setShowPwaModal(true);
  };
  const handleCloseOnboarding = (selectedFromWizard?: EvaluatedNeighborhood) => {
    ui.setShowOnboardingModal(false);
    try { localStorage.setItem('tehran_radar_onboarded_v1', '1'); } catch { /* ignore */ }
    if (selectedFromWizard) { p.handleSelectNeighborhood(selectedFromWizard); ui.setMobileSheetOpen(true); }
  };
  return (
    <React.Suspense fallback={null}>
      <span className="sr-only" data-modals-intl-context={portalIntlSummary} />
      <PersistentPriceThresholdMatchBanner
        matches={thresholdAlerts.activeVisibleMatches}
        onInspectMatchedHood={(hood) => {
          const evalHood = p.evaluatedNeighborhoods.find((n) => n.id === hood.id) || (hood as EvaluatedNeighborhood);
          p.handleSelectNeighborhood(evalHood);
          ui.setActiveTab('bargains');
          ui.setMobileSheetOpen(true);
          if (p.onFlyTo) p.onFlyTo(evalHood.lat, evalHood.lng);
        }}
        onOpenAlertModal={() => {
          const topMatch = thresholdAlerts.activeVisibleMatches[0];
          if (topMatch) {
            ui.setAlertHoodId(topMatch.subscription.hoodId);
            ui.setAlertDealType(topMatch.subscription.dealType);
          }
          ui.setShowBuyerAlertModal(true);
        }}
        onDismissMatch={thresholdAlerts.dismissMatch}
      />
      {ui.showSmartSuggestModal && (
        <SmartSuggestModal
          open={ui.showSmartSuggestModal} onClose={() => ui.setShowSmartSuggestModal(false)} mode={p.mode}
          totalRahnEquivalent={p.totalRahnEquivalent} maxAffordablePerSqm={p.maxAffordablePerSqm}
          suggestSortBy={ui.suggestSortBy as any} setSuggestSortBy={ui.setSuggestSortBy}
          smartSuggestedNeighborhoods={p.smartSuggestedNeighborhoods} onSelectNeighborhood={p.handleSelectNeighborhood}
          targetSqm={p.targetSqm} rentAgeMultiplier={p.rentAgeMultiplier}
        />
      )}
      {ui.showAgencyModal && (
        <AgencyModal
          open={ui.showAgencyModal} onClose={() => ui.setShowAgencyModal(false)}
          agencyModalTab={ui.agencyModalTab} setAgencyModalTab={ui.setAgencyModalTab}
          neighborhoods={p.evaluatedNeighborhoods} bargainHoodId={ui.bargainHoodId}
          setBargainHoodId={ui.setBargainHoodId} bargainType={ui.bargainType}
          setBargainType={ui.setBargainType} bargainSqm={ui.bargainSqm}
          setBargainSqm={ui.setBargainSqm} bargainProposedPrice={ui.bargainProposedPrice}
          setBargainProposedPrice={ui.setBargainProposedPrice} bargainStreet={ui.bargainStreet}
          setBargainStreet={ui.setBargainStreet} bargainTitle={ui.bargainTitle}
          setBargainTitle={ui.setBargainTitle} targetBargainHood={p.targetBargainHood}
          liveBargainCheck={p.liveBargainCheck} bargainSubmitMsg={ui.bargainSubmitMsg}
          setBargainSubmitMsg={ui.setBargainSubmitMsg}
          onSubmitBargainListing={p.handleSubmitBargainListing} sponsorHoodId={ui.sponsorHoodId}
          setSponsorHoodId={ui.setSponsorHoodId} sponsorAgencyName={ui.sponsorAgencyName}
          setSponsorAgencyName={ui.setSponsorAgencyName} sponsorPhone={ui.sponsorPhone}
          setSponsorPhone={ui.setSponsorPhone} sponsorSpecialty={ui.sponsorSpecialty}
          setSponsorSpecialty={ui.setSponsorSpecialty} sponsorExpYears={ui.sponsorExpYears}
          setSponsorExpYears={ui.setSponsorExpYears} sponsorSubmitMsg={ui.sponsorSubmitMsg}
          setSponsorSubmitMsg={ui.setSponsorSubmitMsg}
          onReserveSponsor={p.handleReserveSponsor} enableSponsorBilling={p.featureFlags.enableSponsorBilling}
          sponsorPlanMonths={ui.sponsorPlanMonths} setSponsorPlanMonths={ui.setSponsorPlanMonths}
          sponsorTrackingCode={ui.sponsorTrackingCode} setSponsorTrackingCode={ui.setSponsorTrackingCode}
          activeCity={ui.activeCity} bargainUploadedMedia={ui.bargainUploadedMedia}
          setBargainUploadedMedia={ui.setBargainUploadedMedia}
        />
      )}
      {ui.showCompareModal && (
        <CompareModal
          open={ui.showCompareModal} onClose={() => ui.setShowCompareModal(false)}
          evaluatedNeighborhoods={p.evaluatedNeighborhoods} compareId1={ui.compareId1}
          setCompareId1={ui.setCompareId1} compareId2={ui.compareId2}
          setCompareId2={ui.setCompareId2} compHood1={p.compHood1 || p.evaluatedNeighborhoods[0]} compHood2={p.compHood2 || p.evaluatedNeighborhoods[1] || p.evaluatedNeighborhoods[0]}
          mode={p.mode} buyTotalBudget={effectiveBuyBudget}
          totalRahnEquivalent={p.totalRahnEquivalent}
          rentAgeMultiplier={p.rentAgeMultiplier}
          deductTenantRahnInBuy={p.deductTenantRahnInBuy}
          onSelectNeighborhood={p.handleSelectNeighborhood}
        />
      )}
      {ui.showShortlistMatrixModal && (
        <ShortlistMatrixModal
          open={ui.showShortlistMatrixModal} onClose={() => ui.setShowShortlistMatrixModal(false)}
          favoriteHoodIds={p.favoriteHoodIds} evaluatedNeighborhoods={p.evaluatedNeighborhoods}
          nationwideEvaluatedNeighborhoods={p.nationwideEvaluatedNeighborhoods}
          mode={p.mode} buyTotalBudget={effectiveBuyBudget}
          totalRahnEquivalent={p.totalRahnEquivalent} targetSqm={p.targetSqm}
          rentAgeMultiplier={p.rentAgeMultiplier}
          deductTenantRahnInBuy={p.deductTenantRahnInBuy}
          onSelectNeighborhood={p.handleSelectNeighborhood}
          onRemoveFavorite={p.toggleFavoriteHood}
        />
      )}
      {ui.showShareModal && (
        <ShareModal
          open={ui.showShareModal} onClose={() => ui.setShowShareModal(false)}
          selectedHood={p.selectedHood} marketReport={p.marketReport}
          bestIndicator={p.bestIndicator} copiedShare={ui.copiedShare}
          onCopyShareCard={p.handleCopyShareCard}
          activeCityNameFa={MULTI_CITY_CONFIGS[ui.activeCity]?.nameFa || 'تهران'}
        />
      )}

      {(ui.showPulseModal || ui.showSeoDrawer || ui.showBuyerAlertModal || ui.showPwaModal || ui.showLegalModal) && (
        <SecondaryModals
          showPulseModal={ui.showPulseModal} setShowPulseModal={ui.setShowPulseModal}
          activeCityNameFa={MULTI_CITY_CONFIGS[ui.activeCity]?.nameFa || 'تهران'}
          marketPulse={ui.marketPulse} evaluatedNeighborhoods={p.evaluatedNeighborhoods}
          onSelectNeighborhood={p.handleSelectNeighborhood} lastSyncNotice={ui.lastSyncNotice}
          syncingPulse={ui.syncingPulse} onFetchMarketPulse={p.fetchMarketPulse}
          deepSyncing={ui.deepSyncing} onDeepWebSync={p.handleDeepWebSync}
          showSeoDrawer={ui.showSeoDrawer} setShowSeoDrawer={ui.setShowSeoDrawer}
          selectedHoodId={ui.selectedHoodId} onOpenSeoComparison={handleOpenSeoComparison}
          onTriggerPwaInstall={handleTriggerPwaInstall} showBuyerAlertModal={ui.showBuyerAlertModal}
          setShowBuyerAlertModal={ui.setShowBuyerAlertModal} neighborhoods={p.evaluatedNeighborhoods}
          alertFullName={ui.alertFullName} setAlertFullName={ui.setAlertFullName}
          alertPhone={ui.alertPhone} setAlertPhone={ui.setAlertPhone}
          alertHoodId={ui.alertHoodId} setAlertHoodId={ui.setAlertHoodId}
          alertDealType={ui.alertDealType} setAlertDealType={ui.setAlertDealType}
          alertMaxBudget={ui.alertMaxBudget} setAlertMaxBudget={ui.setAlertMaxBudget}
          alertSubmitMsg={ui.alertSubmitMsg} setAlertSubmitMsg={ui.setAlertSubmitMsg} onRegisterBuyerAlert={p.handleRegisterBuyerAlert}
          isSavingBuyerAlert={p.isSavingBuyerAlert}
          showPwaModal={ui.showPwaModal} setShowPwaModal={ui.setShowPwaModal}
          showLegalModal={ui.showLegalModal} setShowLegalModal={ui.setShowLegalModal}
          thresholdSubscriptions={thresholdAlerts.subscriptions}
          thresholdMatches={thresholdAlerts.allMatches}
          onAddThresholdSubscription={thresholdAlerts.addSubscription}
          onRemoveThresholdSubscription={thresholdAlerts.removeSubscription}
        />
      )}
      {ui.expansionModalType !== null && (
        <ExpansionModulesModal
          activeModal={ui.expansionModalType} onClose={() => ui.setExpansionModalType(null)}
          selectedHood={p.selectedHood} activeCity={ui.activeCity} defaultMode={p.mode}
          defaultBuyBudgetMillion={p.buyTotalBudget} defaultDepositMillion={p.deposit}
          defaultMonthlyRentMillion={p.monthlyRent} defaultSqm={p.targetSqm}
        />
      )}
      {ui.showSuperModulesModal && (
        <FutureSuperModulesModal
          open={ui.showSuperModulesModal} onClose={() => ui.setShowSuperModulesModal(false)}
          initialTab={ui.superModuleInitialTab} selectedHood={p.selectedHood}
          neighborhoods={p.evaluatedNeighborhoods} activeCity={ui.activeCity}
          featureFlags={p.featureFlags} onSelectNeighborhood={p.handleSelectNeighborhood}
          onQuickSubmitBargain={({ hoodId, sqm, proposedPricePerSqm, title }) => {
            ui.setShowSuperModulesModal(false); ui.setBargainHoodId(hoodId); ui.setBargainType('خرید');
            ui.setBargainSqm(sqm); ui.setBargainProposedPrice(proposedPricePerSqm); ui.setBargainTitle(title);
            ui.setBargainSubmitMsg(null); ui.setAgencyModalTab('submit_bargain'); ui.setShowAgencyModal(true);
          }}
          onApplyCombinedBudget={(totalBudgetMillion, targetSqmVal, enableTenantRahn) => {
            ui.setShowSuperModulesModal(false);
            p.setMode('buy');
            ui.setUseLoanBooster(false);
            p.setBuyTotalBudget(totalBudgetMillion);
            p.setTargetSqm(targetSqmVal);
            if (typeof enableTenantRahn === 'boolean') {
              p.setDeductTenantRahnInBuy(enableTenantRahn);
            }
          }}
        />
      )}
      {(ui.showVisitedModal || ui.showTradeUpModal) && (
        <PortfolioModals
          selectedHood={p.selectedHood} evaluatedNeighborhoods={p.evaluatedNeighborhoods}
          onSelectNeighborhood={p.handleSelectNeighborhood} setMobileSheetOpen={ui.setMobileSheetOpen}
          showVisitedModal={ui.showVisitedModal} setShowVisitedModal={ui.setShowVisitedModal}
          visitedHomes={ui.visitedHomes} setVisitedHomes={ui.setVisitedHomes}
          newVisitAddress={ui.newVisitAddress} setNewVisitAddress={ui.setNewVisitAddress}
          newVisitPrice={ui.newVisitPrice} setNewVisitPrice={ui.setNewVisitPrice}
          newVisitNotes={ui.newVisitNotes} setNewVisitNotes={ui.setNewVisitNotes}
          newVisitRating={ui.newVisitRating} setNewVisitRating={ui.setNewVisitRating}
          showTradeUpModal={ui.showTradeUpModal} setShowTradeUpModal={ui.setShowTradeUpModal}
          tradeUpCurrentHoodId={ui.tradeUpCurrentHoodId} setTradeUpCurrentHoodId={ui.setTradeUpCurrentHoodId}
          tradeUpCurrentSqm={ui.tradeUpCurrentSqm} setTradeUpCurrentSqm={ui.setTradeUpCurrentSqm}
          tradeUpCurrentAge={ui.tradeUpCurrentAge} setTradeUpCurrentAge={ui.setTradeUpCurrentAge}
          tradeUpExtraCash={ui.tradeUpExtraCash} setTradeUpExtraCash={ui.setTradeUpExtraCash}
          tradeUpUseLoan={ui.tradeUpUseLoan} setTradeUpUseLoan={ui.setTradeUpUseLoan}
          tradeUpUseRahn={ui.tradeUpUseRahn} setTradeUpUseRahn={ui.setTradeUpUseRahn}
          tradeUpTargetSqm={ui.tradeUpTargetSqm} setTradeUpTargetSqm={ui.setTradeUpTargetSqm}
          tradeUpTargetAgeSegment={ui.tradeUpTargetAgeSegment} setTradeUpTargetAgeSegment={ui.setTradeUpTargetAgeSegment}
          tradeUpResults={p.tradeUpResults}
        />
      )}
      {ui.showOnboardingModal && (
        <OnboardingWizardModal
          open={ui.showOnboardingModal} onClose={handleCloseOnboarding}
          evaluatedNeighborhoods={p.evaluatedNeighborhoods} mode={p.mode} setMode={p.setMode}
          deposit={p.deposit} setDeposit={p.setDeposit} monthlyRent={p.monthlyRent} setMonthlyRent={p.setMonthlyRent}
          buyTotalBudget={p.buyTotalBudget} setBuyTotalBudget={p.setBuyTotalBudget}
          targetSqm={p.targetSqm} setTargetSqm={p.setTargetSqm} workHubId={p.workHubId} setWorkHubId={p.setWorkHubId}
          buildingAgeSegment={p.buildingAgeSegment} setBuildingAgeSegment={p.setBuildingAgeSegment}
          deductTenantRahnInBuy={p.deductTenantRahnInBuy} setDeductTenantRahnInBuy={p.setDeductTenantRahnInBuy}
          useLoanBooster={ui.useLoanBooster} setUseLoanBooster={ui.setUseLoanBooster}
          workHubs={p.activeCityWorkHubs}
        />
      )}
      {ui.showHedonicModal && (
        <HedonicValuationModal
          open={ui.showHedonicModal} onClose={() => ui.setShowHedonicModal(false)}
          selectedNeighborhood={p.selectedHood} allNeighborhoods={p.evaluatedNeighborhoods}
          onSelectNeighborhood={p.handleSelectNeighborhood} initialSqm={p.targetSqm}
          buildingAgeSegment={p.buildingAgeSegment}
          initialParams={ui.hedonicInitialParams}
        />
      )}
      {ui.showNationwideProvinceModal && (
        <NationwideProvinceModal
          isOpen={ui.showNationwideProvinceModal}
          onClose={() => ui.setShowNationwideProvinceModal(false)}
          activeCity={ui.activeCity}
          onSelectProvince={(prov) => {
            if (p.onSwitchCity) {
              p.onSwitchCity(prov.targetCityId, prov.sampleHoodId, prov.center, prov.defaultZoom);
            }
          }}
        />
      )}
      {ui.showPriceTrendModal && (
        <NeighborhoodPriceTrendModal
          open={ui.showPriceTrendModal} onClose={() => ui.setShowPriceTrendModal(false)} selectedHood={p.selectedHood} marketReport={p.marketReport} activeCity={ui.activeCity} targetSqm={p.targetSqm} evaluatedNeighborhoods={p.evaluatedNeighborhoods} onSelectNeighborhood={p.handleSelectNeighborhood} />
      )}
      {ui.showListingVerifierModal && (
        <InstantListingVerifierModal
          isOpen={ui.showListingVerifierModal}
          onClose={() => ui.setShowListingVerifierModal(false)}
          cityKey={ui.activeCity}
          initialHoodName={p.selectedHood?.name}
          initialListingText={ui.homeVerdictPrefill}
          evaluatedNeighborhoods={p.evaluatedNeighborhoods}
        />
      )} </React.Suspense>
  ); }