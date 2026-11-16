import { useState, useEffect } from 'react';
import type { BuyerAlertLeadItem, SponsorCrmRequestItem, ResidentVoteDoc, MarketPulseData, CityId } from '../data/neighborhoods';
import { withoutDemonstrationBuyerLeads, withoutDemonstrationSponsorRequests, BUYER_ALERTS_STORAGE_KEY, SPONSOR_CRM_STORAGE_KEY } from '../data/neighborhoods';
import type { AdminTabId, SystemHealthData } from './AdminModal';
import type { ExpansionModalType } from './ExpansionModulesModal';
import type { SuperModuleTabId } from './FutureSuperModulesModal';
import type { ListingMediaObject } from '../utils/objectStorage';
import { convertPricePerSqmToUnit, formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, type PrimaryViewId } from '../utils/areaUnit';
import { readHomeVerdictPrefillFromUrl, resolvePrimaryViewFromUrl } from '../utils/listingVerdictDeepLink';
import { resolveRouteFromLocation } from '../navigation/url/navigationUrlContract';
import type { AdminSectionId, ModuleSubTabId } from '../navigation/registry/route.types';
import type { MapContextPanelId } from '../navigation/map/mapToolRailConfig';
import { useAreaUnit, useIntlCurrency, useRadarLocale } from './AreaUnitToggle';

export function useAppUiState(initialUrlState: any) {
  const [areaUnit] = useAreaUnit();
  const [intlCurrency] = useIntlCurrency();
  const [locale] = useRadarLocale();
  const [visitedHomes, setVisitedHomes] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem('tehran_radar_visited_homes_v1');
      const parsed = saved ? JSON.parse(saved) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  });
  const [showVisitedModal, setShowVisitedModal] = useState<boolean>(false);
  const [newVisitAddress, setNewVisitAddress] = useState<string>('');
  const [newVisitPrice, setNewVisitPrice] = useState<number>(0);
  const [newVisitNotes, setNewVisitNotes] = useState<string>('');
  const [newVisitRating, setNewVisitRating] = useState<number>(8);

  const [showTradeUpModal, setShowTradeUpModal] = useState<boolean>(false);
  const [tradeUpCurrentHoodId, setTradeUpCurrentHoodId] = useState<number>(7);
  const [tradeUpCurrentSqm, setTradeUpCurrentSqm] = useState<number>(75);
  const [tradeUpCurrentAge, setTradeUpCurrentAge] = useState<number>(12);
  const [tradeUpExtraCash, setTradeUpExtraCash] = useState<number>(1500);
  const [tradeUpUseLoan, setTradeUpUseLoan] = useState<boolean>(true);
  const [tradeUpUseRahn, setTradeUpUseRahn] = useState<boolean>(true);
  const [tradeUpTargetSqm, setTradeUpTargetSqm] = useState<number>(100);
  const [tradeUpTargetAgeSegment, setTradeUpTargetAgeSegment] = useState<'new' | 'mid' | 'older'>('mid');

  const [revealedSponsorPhoneHoodId, setRevealedSponsorPhoneHoodId] = useState<number | null>(null);
  const [callingSponsorHoodId, setCallingSponsorHoodId] = useState<number | null>(null);

  const [selectedHoodId, setSelectedHoodId] = useState<number>(initialUrlState.initialHoodId);
  const [primaryView, setPrimaryView] = useState<PrimaryViewId>(() => resolvePrimaryViewFromUrl() ?? 'map');
  const [activeSubTab, setActiveSubTab] = useState<ModuleSubTabId | undefined>(() =>
    typeof window !== 'undefined' ? resolveRouteFromLocation(window.location.pathname, window.location.search).subTab : undefined
  );
  const [adminSection, setAdminSection] = useState<AdminSectionId>(() => {
    const sub = typeof window !== 'undefined' ? resolveRouteFromLocation(window.location.pathname, window.location.search).subTab : undefined;
    return (sub && ['overview', 'content', 'data', 'users', 'operations', 'security'].includes(sub) ? sub : 'overview') as AdminSectionId;
  });
  const [homeVerdictPrefill, setHomeVerdictPrefill] = useState<string>(() => readHomeVerdictPrefillFromUrl());
  const [activeTab, setActiveTab] = useState<'scorecard' | 'market' | 'bargains' | 'reviews' | 'vote'>('scorecard');
  const [showGoldPins, setShowGoldPins] = useState<boolean>(false);
  const [showLandmarkPins, setShowLandmarkPins] = useState<boolean>(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'green' | 'yellow' | 'red'>('all');
  const [onlyOutsideTrafficZone, setOnlyOutsideTrafficZone] = useState<boolean>(false);
  const [onlyHighMetro, setOnlyHighMetro] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [hoodCustomDeposit, setHoodCustomDeposit] = useState<number>(700);

  const [showCompareModal, setShowCompareModal] = useState<boolean>(initialUrlState.initialShowCompare);
  const [showShortlistMatrixModal, setShowShortlistMatrixModal] = useState<boolean>(false);
  const [compareId1, setCompareId1] = useState<number>(initialUrlState.initialCompareId1);
  const [compareId2, setCompareId2] = useState<number>(initialUrlState.initialCompareId2);
  const [showShareModal, setShowShareModal] = useState<boolean>(false);
  const [copiedShare, setCopiedShare] = useState<boolean>(false);
  const [showOnboardingModal, setShowOnboardingModal] = useState<boolean>(false);
  const [showSmartSuggestModal, setShowSmartSuggestModal] = useState<boolean>(false);
  const [suggestSortBy, setSuggestSortBy] = useState<'undervalued' | 'cheapest' | 'clean_calm' | 'commute_metro'>('undervalued');

  const [showAgencyModal, setShowAgencyModal] = useState<boolean>(false);
  const [agencyModalTab, setAgencyModalTab] = useState<'submit_bargain' | 'reserve_sponsor'>('submit_bargain');
  const [bargainHoodId, setBargainHoodId] = useState<number>(5);
  const [bargainType, setBargainType] = useState<'خرید' | 'اجاره'>('خرید');
  const [bargainSqm, setBargainSqm] = useState<number>(80);
  const [bargainTitle, setBargainTitle] = useState<string>('');
  const [bargainStreet, setBargainStreet] = useState<string>('');
  const [bargainProposedPrice, setBargainProposedPrice] = useState<number>(115);
  const [bargainUploadedMedia, setBargainUploadedMedia] = useState<ListingMediaObject[]>([]);
  const [bargainSubmitMsg, setBargainSubmitMsg] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  const [sponsorHoodId, setSponsorHoodId] = useState<number>(5);
  const [sponsorAgencyName, setSponsorAgencyName] = useState<string>('');
  const [sponsorPhone, setSponsorPhone] = useState<string>('');
  const [sponsorSpecialty, setSponsorSpecialty] = useState<string>('');
  const [sponsorExpYears, setSponsorExpYears] = useState<number>(12);
  const [sponsorPlanMonths, setSponsorPlanMonths] = useState<1 | 3>(1);
  const [sponsorTrackingCode, setSponsorTrackingCode] = useState<string>('');
  const [sponsorSubmitMsg, setSponsorSubmitMsg] = useState<string>('');

  const [activeCity, setActiveCity] = useState<CityId>(initialUrlState.initialCity || 'tehran');
  const [showNationwideProvinceModal, setShowNationwideProvinceModal] = useState<boolean>(false);
  const [showPriceTrendModal, setShowPriceTrendModal] = useState<boolean>(false);
  const [expansionModalType, setExpansionModalType] = useState<ExpansionModalType>(null);
  const [showSuperModulesModal, setShowSuperModulesModal] = useState<boolean>(false);
  const [superModuleInitialTab, setSuperModuleInitialTab] = useState<SuperModuleTabId>('valuation');
  const [showHedonicModal, setShowHedonicModal] = useState<boolean>(false);
  const [showListingVerifierModal, setShowListingVerifierModal] = useState<boolean>(false);
  const [hedonicInitialParams, setHedonicInitialParams] = useState<
    { sqm?: number; buildYear?: number; renovationStatus?: any; floor?: number } | undefined
  >(undefined);

  const [voteAir, setVoteAir] = useState<number>(8);
  const [votePower, setVotePower] = useState<number>(8);
  const [voteInternet, setVoteInternet] = useState<number>(8);
  const [voteMetro, setVoteMetro] = useState<number>(8);
  const [voteSecurity, setVoteSecurity] = useState<number>(8);
  const [voteFlat, setVoteFlat] = useState<number>(8);
  const [voteComment, setVoteComment] = useState<string>('');
  const [voteStatus, setVoteStatus] = useState<{ type: 'info' | 'success' | 'warning'; text: string } | null>(null);
  const [verifyingGeo, setVerifyingGeo] = useState<boolean>(false);

  const [cloudVotes, setCloudVotes] = useState<ResidentVoteDoc[]>([]);
  const [savingPrefs, setSavingPrefs] = useState<boolean>(false);
  const [prefsMessage, setPrefsMessage] = useState<string>('');
  const [mapLens, setMapLens] = useState<'budget' | 'bubble' | 'air' | 'traffic' | 'heatmap'>('budget');
  const [useLoanBooster, setUseLoanBooster] = useState<boolean>(false);

  const [marketPulse, setMarketPulse] = useState<MarketPulseData | null>(null);
  const [syncingPulse, setSyncingPulse] = useState<boolean>(false);
  const [deepSyncing, setDeepSyncing] = useState<boolean>(false);
  const [lastSyncNotice, setLastSyncNotice] = useState<string>('');
  const [showSeoDrawer, setShowSeoDrawer] = useState<boolean>(false);
  const [showSearchDropdown, setShowSearchDropdown] = useState<boolean>(false);

  const [showBuyerAlertModal, setShowBuyerAlertModal] = useState<boolean>(false);
  const [alertFullName, setAlertFullName] = useState<string>('');
  const [alertPhone, setAlertPhone] = useState<string>('');
  const [alertHoodId, setAlertHoodId] = useState<number>(5);
  const [alertDealType, setAlertDealType] = useState<'خرید' | 'اجاره'>('خرید');
  const [alertMaxBudget, setAlertMaxBudget] = useState<string>('۱۱ میلیارد تومان');
  const [alertSubmitMsg, setAlertSubmitMsg] = useState<string>('');

  const [buyerLeads, setBuyerLeads] = useState<BuyerAlertLeadItem[]>(() => {
    try {
      const saved = localStorage.getItem(BUYER_ALERTS_STORAGE_KEY);
      const parsed = saved ? JSON.parse(saved) : [];
      return Array.isArray(parsed) ? withoutDemonstrationBuyerLeads(parsed) : [];
    } catch { return []; }
  });

  const [sponsorRequests, setSponsorRequests] = useState<SponsorCrmRequestItem[]>(() => {
    try {
      const saved = localStorage.getItem(SPONSOR_CRM_STORAGE_KEY);
      const parsed = saved ? JSON.parse(saved) : [];
      return Array.isArray(parsed) ? withoutDemonstrationSponsorRequests(parsed) : [];
    } catch { return []; }
  });

  const [hasDelegatedAdminDoc, setHasDelegatedAdminDoc] = useState<boolean>(false);
  const [showAdminModal, setShowAdminModal] = useState<boolean>(false);
  const [adminUnlocked, setAdminUnlocked] = useState<boolean>(false);
  const [adminPassInput, setAdminPassInput] = useState<string>('');
  const [adminPassError, setAdminPassError] = useState<string>('');
  const [savedAdminPassword, setSavedAdminPassword] = useState<string>('');
  const [newAdminPassword, setNewAdminPassword] = useState<string>('');
  const [adminPassChangeMsg, setAdminPassChangeMsg] = useState<string>('');
  const [adminTab, setAdminTab] = useState<AdminTabId>('security');
  const [adminEditHoodId, setAdminEditHoodId] = useState<number>(5);
  const [adminEditBuySqm, setAdminEditBuySqm] = useState<number>(142);
  const [adminEditRahn80m, setAdminEditRahn80m] = useState<number>(1750);
  const [adminPriceSavedMsg, setAdminPriceSavedMsg] = useState<string>('');
  const [systemHealth, setSystemHealth] = useState<SystemHealthData | null>(null);
  const [loadingSystemHealth, setLoadingSystemHealth] = useState<boolean>(false);
  const [backupStatusMsg, setBackupStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [deferredPwaPrompt, setDeferredPwaPrompt] = useState<any>(null);
  const [showPwaModal, setShowPwaModal] = useState<boolean>(false);
  const [showLegalModal, setShowLegalModal] = useState<boolean>(false);

  useEffect(() => {
    try {
      localStorage.setItem('tehran_radar_visited_homes_v1', JSON.stringify(visitedHomes));
    } catch { /* ignore */ }
  }, [visitedHomes]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onBeforeInstall = (e: Event) => { e.preventDefault(); setDeferredPwaPrompt(e); };
    const onVisitedUpdated = () => {
      try {
        const saved = localStorage.getItem('tehran_radar_visited_homes_v1');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) setVisitedHomes(parsed);
        }
      } catch { /* ignore */ }
    };
    const onOpenPriceTrend = () => setShowPriceTrendModal(true);
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('radar-visited-updated', onVisitedUpdated);
    window.addEventListener('radar-open-price-trend-modal', onOpenPriceTrend);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('radar-visited-updated', onVisitedUpdated);
      window.removeEventListener('radar-open-price-trend-modal', onOpenPriceTrend);
    };
  }, []);

  const [showPulseModal, setShowPulseModal] = useState<boolean>(false);
  const [mobileFilterOpen, setMobileFilterOpen] = useState<boolean>(false);
  const [mobileSheetOpen, setMobileSheetOpen] = useState<boolean>(false);
  const [showMapLegendPopover, setShowMapLegendPopover] = useState<boolean>(false);
  const [showToolsPopover, setShowToolsPopover] = useState<boolean>(false);
  const [mapRailPanel, setMapRailPanel] = useState<MapContextPanelId>(null);
  const [showSpatialTools, setShowSpatialTools] = useState<boolean>(false);
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setShowSuperModulesModal(false); setShowCompareModal(false); setShowShortlistMatrixModal(false);
      setShowShareModal(false); setShowSmartSuggestModal(false); setShowAgencyModal(false);
      setShowAdminModal(false); setShowPulseModal(false); setShowSeoDrawer(false);
      setShowBuyerAlertModal(false); setShowPwaModal(false); setShowLegalModal(false);
      setShowVisitedModal(false); setShowTradeUpModal(false); setShowHedonicModal(false);
      setShowPriceTrendModal(false); setShowOnboardingModal(false); setExpansionModalType(null);
      setShowSearchDropdown(false); setShowToolsPopover(false); setShowMapLegendPopover(false); setMobileFilterOpen(false); setShowNationwideProvinceModal(false); setMobileSheetOpen(false);
      setMapRailPanel(null); setShowSpatialTools(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const uiUnitContext = {
    areaUnit, unitLabel: formatAreaUnitLabel(areaUnit), intlCurrency, locale,
    adminEditBuyUnitPrice: convertPricePerSqmToUnit(adminEditBuySqm, areaUnit),
    adminEditBuyIntlText: formatMillionTomanAsIntlCurrency(adminEditBuySqm, intlCurrency, locale),
  };

  return {
    visitedHomes, setVisitedHomes, showVisitedModal, setShowVisitedModal,
    newVisitAddress, setNewVisitAddress, newVisitPrice, setNewVisitPrice,
    newVisitNotes, setNewVisitNotes, newVisitRating, setNewVisitRating,
    showTradeUpModal, setShowTradeUpModal, tradeUpCurrentHoodId, setTradeUpCurrentHoodId,
    tradeUpCurrentSqm, setTradeUpCurrentSqm, tradeUpCurrentAge, setTradeUpCurrentAge,
    tradeUpExtraCash, setTradeUpExtraCash, tradeUpUseLoan, setTradeUpUseLoan,
    tradeUpUseRahn, setTradeUpUseRahn, tradeUpTargetSqm, setTradeUpTargetSqm,
    tradeUpTargetAgeSegment, setTradeUpTargetAgeSegment,
    revealedSponsorPhoneHoodId, setRevealedSponsorPhoneHoodId,
    callingSponsorHoodId, setCallingSponsorHoodId,
    selectedHoodId, setSelectedHoodId, primaryView, setPrimaryView, activeSubTab, setActiveSubTab, adminSection, setAdminSection, activeTab, setActiveTab,
    showGoldPins, setShowGoldPins, showLandmarkPins, setShowLandmarkPins,
    statusFilter, setStatusFilter, onlyOutsideTrafficZone, setOnlyOutsideTrafficZone,
    onlyHighMetro, setOnlyHighMetro, searchQuery, setSearchQuery,
    hoodCustomDeposit, setHoodCustomDeposit,
    showCompareModal, setShowCompareModal, showShortlistMatrixModal, setShowShortlistMatrixModal,
    compareId1, setCompareId1, compareId2, setCompareId2,
    showShareModal, setShowShareModal, copiedShare, setCopiedShare,
    showOnboardingModal, setShowOnboardingModal, showSmartSuggestModal, setShowSmartSuggestModal,
    suggestSortBy, setSuggestSortBy, showAgencyModal, setShowAgencyModal,
    agencyModalTab, setAgencyModalTab, bargainHoodId, setBargainHoodId,
    bargainType, setBargainType, bargainSqm, setBargainSqm,
    bargainTitle, setBargainTitle, bargainStreet, setBargainStreet,
    bargainProposedPrice, setBargainProposedPrice, bargainUploadedMedia, setBargainUploadedMedia,
    bargainSubmitMsg, setBargainSubmitMsg, sponsorHoodId, setSponsorHoodId,
    sponsorAgencyName, setSponsorAgencyName, sponsorPhone, setSponsorPhone,
    sponsorSpecialty, setSponsorSpecialty, sponsorExpYears, setSponsorExpYears,
    sponsorPlanMonths, setSponsorPlanMonths, sponsorTrackingCode, setSponsorTrackingCode,
    sponsorSubmitMsg, setSponsorSubmitMsg, activeCity, setActiveCity,
    showNationwideProvinceModal, setShowNationwideProvinceModal,
    showPriceTrendModal, setShowPriceTrendModal,
    expansionModalType, setExpansionModalType, showSuperModulesModal, setShowSuperModulesModal,
    superModuleInitialTab, setSuperModuleInitialTab, showHedonicModal, setShowHedonicModal,
    showListingVerifierModal, setShowListingVerifierModal,
    homeVerdictPrefill, setHomeVerdictPrefill,
    hedonicInitialParams, setHedonicInitialParams,
    voteAir, setVoteAir, votePower, setVotePower, voteInternet, setVoteInternet,
    voteMetro, setVoteMetro, voteSecurity, setVoteSecurity, voteFlat, setVoteFlat,
    voteComment, setVoteComment, voteStatus, setVoteStatus, verifyingGeo, setVerifyingGeo,
    cloudVotes, setCloudVotes, savingPrefs, setSavingPrefs, prefsMessage, setPrefsMessage,
    mapLens, setMapLens, useLoanBooster, setUseLoanBooster,
    marketPulse, setMarketPulse, syncingPulse, setSyncingPulse,
    deepSyncing, setDeepSyncing, lastSyncNotice, setLastSyncNotice,
    showSeoDrawer, setShowSeoDrawer, showSearchDropdown, setShowSearchDropdown,
    showBuyerAlertModal, setShowBuyerAlertModal, alertFullName, setAlertFullName,
    alertPhone, setAlertPhone, alertHoodId, setAlertHoodId,
    alertDealType, setAlertDealType, alertMaxBudget, setAlertMaxBudget,
    alertSubmitMsg, setAlertSubmitMsg, buyerLeads, setBuyerLeads,
    sponsorRequests, setSponsorRequests, hasDelegatedAdminDoc, setHasDelegatedAdminDoc,
    showAdminModal, setShowAdminModal, adminUnlocked, setAdminUnlocked,
    adminPassInput, setAdminPassInput, adminPassError, setAdminPassError,
    savedAdminPassword, setSavedAdminPassword, newAdminPassword, setNewAdminPassword,
    adminPassChangeMsg, setAdminPassChangeMsg, adminTab, setAdminTab,
    adminEditHoodId, setAdminEditHoodId, adminEditBuySqm, setAdminEditBuySqm,
    adminEditRahn80m, setAdminEditRahn80m, adminPriceSavedMsg, setAdminPriceSavedMsg,
    systemHealth, setSystemHealth, loadingSystemHealth, setLoadingSystemHealth,
    backupStatusMsg, setBackupStatusMsg, deferredPwaPrompt, setDeferredPwaPrompt,
    showPwaModal, setShowPwaModal, showLegalModal, setShowLegalModal,
    showPulseModal, setShowPulseModal, mobileFilterOpen, setMobileFilterOpen,
    mobileSheetOpen, setMobileSheetOpen, showMapLegendPopover, setShowMapLegendPopover,
    showToolsPopover, setShowToolsPopover, mapRailPanel, setMapRailPanel,
    showSpatialTools, setShowSpatialTools, uiUnitContext,
  };
}
export type AppUiState = ReturnType<typeof useAppUiState>;

