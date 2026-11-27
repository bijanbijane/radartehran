import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { readServerEntrySource } from './helpers/readServerEntrySource.ts';
import { isValidIranianMobile, cleanIranianMobile } from '../src/utils/security';
import type { BuyerAlertLeadItem } from '../src/types/models';
import { findMigrationRegisterEntry } from '../worker/migrationRegister';

console.log('--- Running Buyer Alert Contract Tests ---');

// 1. Mobile number validation and normalization
assert.equal(isValidIranianMobile('09123456789'), true, 'Valid mobile accepted');
assert.equal(isValidIranianMobile('۰۹۱۲۳۴۵۶۷۸۹'), true, 'Persian digits mobile accepted');
assert.equal(isValidIranianMobile('0912-345-6789'), true, 'Dashed mobile accepted');
assert.equal(isValidIranianMobile('0912 345 6789'), true, 'Spaced mobile accepted');
assert.equal(isValidIranianMobile('12345'), false, 'Short number rejected');
assert.equal(isValidIranianMobile('099999999999'), false, '12-digit number rejected');
assert.equal(cleanIranianMobile('۰۹۱۲-۳۴۵-۶۷۸۹'), '09123456789', 'Formatted mobile cleaned properly');

// 2. Retention and Consent Contract
const now = new Date();
const nowIso = now.toISOString();
const expiresDate = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
const expiresIso = expiresDate.toISOString();

const validLead: BuyerAlertLeadItem = {
  id: 'lead-test-1',
  fullName: 'علی رضایی',
  phone: '09123456789',
  hoodId: 5,
  hoodName: 'سعادت آباد',
  dealType: 'خرید',
  maxBudgetText: '۱۰ تا ۱۲ میلیارد',
  createdAtFa: '۱۴۰۵/۰۲/۰۱',
  createdAtIso: nowIso,
  expiresAtIso: expiresIso,
  consentAtIso: nowIso,
  consentVersion: 'buyer-alert-2026-10-v1',
  submittedByUid: 'user-uid-123',
};

assert.equal(validLead.consentVersion, 'buyer-alert-2026-10-v1', 'Consent version contract matches');
assert.ok(validLead.expiresAtIso, 'Expiry date ISO is present');
const expiryDiffDays = (new Date(validLead.expiresAtIso!).getTime() - new Date(validLead.createdAtIso!).getTime()) / (24 * 60 * 60 * 1000);
assert.ok(expiryDiffDays >= 89 && expiryDiffDays <= 91, 'Lead retention is within 90 days');

// 3. D1 buyer-alert contract & UX hierarchy regression assertions (WS-001)
const crudSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/useRadarCrudActions.ts'), 'utf8');
assert.ok(
  crudSrc.includes('await upsertBuyerAlertLead({'),
  'buyer alert submission must use the canonical D1 repository rather than Firestore updateDoc'
);
assert.ok(
  crudSrc.includes('privacyConsent') && crudSrc.includes('maxBudgetMillion'),
  'buyer alert submission must carry explicit consent and a numeric million-Toman budget'
);
const buyerAlertModalSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/BuyerAlertPwaLegalModals.tsx'), 'utf8');
assert.ok(
  buyerAlertModalSrc.includes('buyer-alert-privacy-consent') && buyerAlertModalSrc.includes('required'),
  'buyer alert UI must require an explicit privacy consent checkbox'
);
const buyerAlertWorkerSrc = fs.readFileSync(path.join(process.cwd(), 'worker/routes/marketplaceRoutes.ts'), 'utf8');
assert.ok(
  buyerAlertWorkerSrc.includes('privacyConsent !== true') && buyerAlertWorkerSrc.includes('INSERT INTO buyer_alerts'),
  'Worker D1 buyer-alert route must reject missing consent and write canonical buyer_alerts rows'
);
assert.ok(
  !crudSrc.includes('if (hoodId < 100)') && !crudSrc.includes('p.selectedHoodId < 100'),
  'Multi-city neighborhoods (1..999) must not be excluded from local state updates'
);

const adminSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/useRadarAdminActions.ts'), 'utf8');
assert.ok(
  !adminSrc.includes("'publicSponsors'"),
  'Admin sponsor actions must write to canonical neighborhoodOverrides instead of unprovisioned publicSponsors'
);

const tabsSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/NeighborhoodInspectorTabs.tsx'), 'utf8');
assert.ok(
  tabsSrc.includes('cloudVotes.filter((v) => v.hoodId === selectedHood.id)'),
  'Resident reviews in NeighborhoodInspectorTabs must filter cloudVotes by selectedHood.id'
);

const drawerSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/NeighborhoodInspectorDrawer.tsx'), 'utf8');
const tabsIndex = drawerSrc.indexOf('anatomyTabsRef');
const forecastIndex = drawerSrc.indexOf('<SmartPriceForecastCard');
assert.ok(
  tabsIndex > 0 && forecastIndex > tabsIndex,
  'Primary navigation tabs (anatomyTabsRef) must appear above SmartPriceForecastCard so tabs are visible above the fold'
);

// 4. WS-003 Regression: D1 sponsor request contract & AgencyModal discount ceiling UX
assert.ok(
  crudSrc.includes('createSponsorRequest({') && crudSrc.includes('planMonths: activePlanMonths'),
  'Sponsor reservations must use the canonical D1 sponsor repository and send only the selected plan.'
);
assert.ok(
  !crudSrc.includes('/api/sponsors/reserve'),
  'Sponsor reservation UI must not fall back to the legacy Express/Firestore endpoint.'
);
const sponsorRepositorySrc = fs.readFileSync(path.join(process.cwd(), 'src/data/neighborhoodRemoteRepository.ts'), 'utf8');
assert.ok(
  sponsorRepositorySrc.includes('/api/v1/market/sponsor-requests'),
  'Sponsor reservation repository must use the D1-owned Worker endpoint.'
);

const agencyModalSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/AgencyModal.tsx'), 'utf8');
assert.ok(
  agencyModalSrc.includes('liveBargainCheck.discountPercent > 60') &&
    agencyModalSrc.includes('اعمال ۱۰٪ تخفیف'),
  'AgencyModal must distinguish discountPercent > 60 from < 10 and provide 1-click discount preset buttons'
);

const sponsorTabSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/AgencySponsorReservationTab.tsx'), 'utf8');
assert.ok(
  sponsorTabSrc.includes('sanitizeInput(sponsorAgencyName, 90).length < 2'),
  'AgencySponsorReservationTab must validate agencyName minimum length (>= 2 chars) before submitting'
);

// 5. WS-004 Regression: D1 sponsor release persistence & multi-city resolution
const sponsorWorkerSrc = fs.readFileSync(path.join(process.cwd(), 'worker/routes/marketplaceRoutes.ts'), 'utf8');
assert.ok(
  sponsorWorkerSrc.includes("ctx.pathname === '/api/v1/admin/market/sponsors/release'") &&
    sponsorWorkerSrc.includes("sponsor_json = NULL") &&
    sponsorWorkerSrc.includes("UPDATE sponsor_requests SET status = 'expired'"),
  'D1 admin sponsor release must clear neighborhood_overrides and expire approved sponsor_requests.'
);
assert.ok(
  sponsorWorkerSrc.includes('SUPPORTED_CITY_IDS') &&
    sponsorWorkerSrc.includes('neighborhood_overrides') &&
    sponsorWorkerSrc.includes('sponsor_requests'),
  'D1 sponsor route must enforce supported city IDs and persist city-scoped sponsor state.'
);
for (const [method, routePath] of [
  ['POST', '/api/v1/market/sponsor-requests'],
  ['POST', '/api/v1/market/buyer-alerts'],
  ['POST', '/api/v1/admin/market/sponsors/approve'],
  ['POST', '/api/v1/admin/market/sponsors/release'],
  ['PUT', '/api/v1/admin/market/neighborhood-overrides'],
  ['DELETE', '/api/v1/admin/market/sponsor-requests/test-id'],
] as const) {
  const registration = findMigrationRegisterEntry(method, routePath);
  assert.ok(registration, 'D1 marketplace route must be registered: ' + method + ' ' + routePath);
  assert.equal(registration.entry.workerHandlerModule, 'worker/routes/marketplaceRoutes.ts');
  assert.equal(registration.entry.status, 'BLOCKED',
    'Marketplace remains blocked from production until canonical D1 migrations are applied; local-only test routing must not erase this gate.');
}

// 6. WS-005 Regression: Cross-city comparison resolution, single flyTo selection & canonical SEO/URL lookup
const appSrc =
  fs.readFileSync(path.join(process.cwd(), 'src/App.tsx'), 'utf8') +
  fs.readFileSync(path.join(process.cwd(), 'src/components/RadarWorkspaceShell.tsx'), 'utf8');
const appOrDerivedSrc = appSrc + fs.readFileSync(path.join(process.cwd(), 'src/components/useAppPersistenceAndDerivedState.ts'), 'utf8');
assert.ok(
  appOrDerivedSrc.includes('nationwideEvaluatedNeighborhoods.find((n) => n.id === ui.compareId1)') &&
    appOrDerivedSrc.includes('nationwideEvaluatedNeighborhoods.find((n) => n.id === ui.compareId2)'),
  'App.tsx / useAppPersistenceAndDerivedState compHood1 and compHood2 must fall back to nationwideEvaluatedNeighborhoods for cross-city comparison'
);
assert.ok(
  appSrc.includes('ui.setBargainHoodId(hood.id); ui.setSponsorHoodId(hood.id); ui.setAlertHoodId(hood.id);'),
  'handleSelectNeighborhood must sync bargainHoodId, sponsorHoodId, and alertHoodId to the selected neighborhood'
);

const urlSyncSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/useAppUrlAndTitleSync.ts'), 'utf8');
assert.ok(
  urlSyncSrc.includes('getAllMultiCityNeighborhoods().map'),
  'useAppUrlAndTitleSync must use getAllMultiCityNeighborhoods() for URL deep-link resolution'
);

const seoSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/serverSeoAndSitemap.ts'), 'utf8');
assert.ok(
  seoSrc.includes('const allHoods = getAllMultiCityNeighborhoods();'),
  'serverSeoAndSitemap injectDynamicSeoMeta must use getAllMultiCityNeighborhoods()'
);

// 7. Stage 27 & 28 Bilingual (FA/EN), Direction (RTL/LTR) & Reference-Backed FX Regression Tests
import('../src/utils/areaUnit').then((areaMod) => {
  assert.equal(areaMod.detectBrowserLocaleFromNavigator(['en-US', 'fa-IR']), 'en', 'Detects supported English locale');
  assert.equal(areaMod.detectBrowserLocaleFromNavigator(['ar-AE']), 'fa', 'Unsupported locale falls back to Persian');
  assert.equal(areaMod.detectBrowserLocaleFromNavigator(['tr-TR']), 'fa', 'Unsupported locale falls back to Persian');
  assert.equal(areaMod.detectBrowserLocaleFromNavigator(['fa-IR']), 'fa', 'Detects Persian locale');
  assert.equal(areaMod.getRadarLocaleDirection('fa'), 'rtl', 'Persian is RTL');
  assert.equal(areaMod.getRadarLocaleDirection('ar'), 'rtl', 'Arabic falls back to RTL');
  assert.equal(areaMod.getRadarLocaleDirection('en'), 'ltr', 'English is LTR');
  assert.equal(areaMod.getRadarLocaleDirection('tr'), 'rtl', 'Turkish falls back to RTL');
  assert.ok(areaMod.formatMillionTomanAsIntlCurrency(6500, 'IRT', 'fa').includes('میلیارد تومان'), '6,500M Toman formats in Persian Toman');
  assert.equal(areaMod.getRadarTopBarCopy('en').toolsBtnLabel, 'Tools', 'English top-bar copy returns Tools');
  assert.equal(areaMod.getRadarTopBarCopy('fa').toolsBtnLabel, 'ابزارها', 'Persian top-bar copy returns ابزارها');
  assert.equal(areaMod.getRadarBottomNavCopy('en').mapLabel, 'Map', 'English bottom-nav copy returns Map');
  assert.equal(areaMod.getRadarBottomNavCopy('tr').mapLabel, 'نقشه', 'Fallback bottom-nav copy returns نقشه');
  assert.equal(areaMod.getRadarInspectorCopy('ar').marketTab, 'بازار', 'Fallback inspector copy returns current Persian label');
  assert.equal(areaMod.getRadarInspectorCopy('en').scorecardTab, 'Overview', 'English inspector copy returns current label');
  assert.equal(areaMod.getRadarLegendCopy('en').legendBtnLabel, 'Map Legend', 'English legend copy returns Map Legend');
  assert.equal(areaMod.getRadarLegendCopy('ar').legendBtnLabel, 'راهنمای نقشه', 'Fallback legend copy returns Persian');
  assert.equal(areaMod.getRadarCompareCopy('en').swapBtnLabel, 'Swap', 'English compare copy returns Swap');
  assert.equal(areaMod.getRadarCompareCopy('tr').swapBtnLabel, 'جابه‌جایی', 'Fallback compare copy returns Persian');
  const inspectorTabsSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/NeighborhoodInspectorTabs.tsx'), 'utf8');
  const budgetBridgeSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/BudgetBridgeAdvisorCard.tsx'), 'utf8');
  const purchasingPowerSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/PurchasingPowerTrendCard.tsx'), 'utf8');
  const bargainsTabsSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/NeighborhoodBargainsAndVotesTabs.tsx'), 'utf8');
  const priceTrendModalSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/NeighborhoodPriceTrendModal.tsx'), 'utf8');
  const smartForecastSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/SmartPriceForecastCard.tsx'), 'utf8');
  const shortlistMatrixSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/ShortlistMatrixModal.tsx'), 'utf8');
  const quickRankingSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/QuickHoodRankingStrip.tsx'), 'utf8');
  const searchDropdownSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/SearchDropdownMenu.tsx'), 'utf8');
  const portfolioModalsSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/PortfolioModals.tsx'), 'utf8');
  const secondaryModalsSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/SecondaryModals.tsx'), 'utf8');
  const smartNaturalSearchSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/SmartNaturalSearchMatchesSection.tsx'), 'utf8');
  const superModulesValSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/SuperModulesValuationAndFakeTabs.tsx'), 'utf8');
  const superModulesSwapSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/SuperModulesSwapAndStudioTabs.tsx'), 'utf8');
  const superModulesLegalSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/SuperModulesLegalAndBuildingTabs.tsx'), 'utf8');
  const smartSuggestSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/SmartSuggestModal.tsx'), 'utf8');
  const shareModalSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/ShareModal.tsx'), 'utf8');
  const thresholdAlertsSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/buyerPriceThresholdAlerts.tsx'), 'utf8');
  const expansionModalSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/ExpansionModulesModal.tsx'), 'utf8');
  const hedonicModalSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/HedonicValuationModal.tsx'), 'utf8');
  const buyerAlertModalsSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/BuyerAlertPwaLegalModals.tsx'), 'utf8');
  const monthlyBarChartSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/NeighborhoodMonthlyBarChart.tsx'), 'utf8');
  const buyerSparklineSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/BuyerAlertPriceSparkline.tsx'), 'utf8');
  const legalStudioSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/LegalContractAndPortfolioStudioModal.tsx'), 'utf8');
  const onboardingWizardSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/OnboardingWizardModal.tsx'), 'utf8');
  const agencyCrmStudioSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/AgencyCrmAndAutomationStudioModal.tsx'), 'utf8');
  const biGisStudioSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/BiRiskAndGeospatialIntelligenceStudioModal.tsx'), 'utf8');
  const sponsorReservationTabSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/AgencySponsorReservationTab.tsx'), 'utf8');
  const enterpriseModalSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/EnterpriseAssetFundAndMarketIntelligenceModal.tsx'), 'utf8');
  const agencyModalSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/AgencyModal.tsx'), 'utf8');
  const contractAdvisorSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/ContractLegalAdvisorView.tsx'), 'utf8');
  const adminOverviewTabsSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/AdminOverviewAndModerationTabs.tsx'), 'utf8');
  const adminMonetizationSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/AdminMonetizationCard.tsx'), 'utf8');
  const adminCloudAiSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/AdminCloudAiCommerceCenter.tsx'), 'utf8');
  const topBarProvinceDirSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/TopBarProvinceDirectoryControl.tsx'), 'utf8');
  const adminMcpSandboxSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/AdminMcpAndPortabilitySandboxPanel.tsx'), 'utf8');
  const modeSwitcherSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/ModeSwitcherSegmented.tsx'), 'utf8');
  const futureSuperModulesModalSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/FutureSuperModulesModal.tsx'), 'utf8');
  const priceHeatmapSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/priceHeatmapAndViewportLazy.tsx'), 'utf8');
  const mapZoomLodSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/mapZoomLodAndDeclutter.ts'), 'utf8');
  const commuteMatrixSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/CommuteHubsMatrixCard.tsx'), 'utf8');
  const photoGallerySrc = fs.readFileSync(path.join(process.cwd(), 'src/components/NeighborhoodPhotoGallery.tsx'), 'utf8');
  const listingMediaGallerySrc = fs.readFileSync(path.join(process.cwd(), 'src/components/ListingMediaGallery.tsx'), 'utf8');
  const topBarProvinceControlSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/TopBarProvinceControl.tsx'), 'utf8');
  const listingMediaUploaderSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/ListingMediaStorageUploader.tsx'), 'utf8');
  const pwaOfflineBannerSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/PWAOfflineStatusBanner.tsx'), 'utf8');
  const adminModalSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/AdminModal.tsx'), 'utf8');
  const adminSecurityBackupSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/AdminSecurityAndBackupTabs.tsx'), 'utf8');
  const adminPanelSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/AdminPanel.tsx'), 'utf8');
  const adminEnvConfigSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/AdminEnvConfigPanel.tsx'), 'utf8');
  const adminMapProviderSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/AdminMapProviderConfigPanel.tsx'), 'utf8');
  const adminWeeklyDbHealthSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/AdminWeeklyDatabaseHealthChart.tsx'), 'utf8');
  const cleanupProgressSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/CleanupProgressSummary.tsx'), 'utf8');
  const liveDiagOverlaySrc = fs.readFileSync(path.join(process.cwd(), 'src/components/LiveDiagnosticOverlay.tsx'), 'utf8');
  const loadingSkeletonsSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/NeighborhoodLoadingSkeletons.tsx'), 'utf8');
  const dualLayerErrorTrapSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/DualLayerErrorTrap.tsx'), 'utf8');
  const featureErrorBoundarySrc = fs.readFileSync(path.join(process.cwd(), 'src/components/FeatureErrorBoundary.tsx'), 'utf8');
  const urlAndTitleSyncSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/useAppUrlAndTitleSync.ts'), 'utf8');
  const mapAdvancedLayersSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/mapAdvancedLayers.ts'), 'utf8');
  const useLeafletRadarMapSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/useLeafletRadarMap.ts'), 'utf8');
  const useRadarCrudActionsSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/useRadarCrudActions.ts'), 'utf8');
  const useMarketPulseSyncSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/useMarketPulseSync.ts'), 'utf8');
  const useRadarAdminActionsSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/useRadarAdminActions.ts'), 'utf8');
  const useAppPersistenceSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/useAppPersistenceAndDerivedState.ts'), 'utf8');
  const useEvaluatedHoodsSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/useEvaluatedNeighborhoods.ts'), 'utf8');
  const useRadarCloudSyncSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/useRadarCloudSync.ts'), 'utf8');
  const appModalsPortalSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/AppModalsPortal.tsx'), 'utf8');
  const useAppUiStateSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/useAppUiState.ts'), 'utf8');
  const mapBaseTileCtrlSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/mapBaseTileController.ts'), 'utf8');
  const useDialogFocusSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/useDialogFocus.ts'), 'utf8');
  const appRootSrc =
    fs.readFileSync(path.join(process.cwd(), 'src/App.tsx'), 'utf8') +
    fs.readFileSync(path.join(process.cwd(), 'src/components/RadarWorkspaceShell.tsx'), 'utf8');
  const hedonicEngineSrc = fs.readFileSync(path.join(process.cwd(), 'src/data/hedonicPricingEngine.ts'), 'utf8');
  const calcRegistrySrc = fs.readFileSync(path.join(process.cwd(), 'src/data/calculatorRegistryAndScenarios.ts'), 'utf8');
  const superLogicSrc = fs.readFileSync(path.join(process.cwd(), 'src/data/superModulesLogic.ts'), 'utf8');
  const legalBuildingSrc = fs.readFileSync(path.join(process.cwd(), 'src/data/legalAndBuildingLogic.ts'), 'utf8');
  const valTraceSrc = fs.readFileSync(path.join(process.cwd(), 'src/data/valuationTraceAndComparables.ts'), 'utf8');
  const listingFraudSrc = fs.readFileSync(path.join(process.cwd(), 'src/data/listingFraudAndAddressEngine.ts'), 'utf8');
  const rentalCommissionSrc = fs.readFileSync(path.join(process.cwd(), 'src/data/rentalMarketCommissionAndPreSaleAudit.ts'), 'utf8');
  const multiCityCalcSrc = fs.readFileSync(path.join(process.cwd(), 'src/data/multiCityCalculatorsAreaDisputesLicensingAudit.ts'), 'utf8');
  const investmentAuditSrc = fs.readFileSync(path.join(process.cwd(), 'src/data/investmentPriceHistoryStalePhoneAiToolAudit.ts'), 'utf8');
  const completenessAuditSrc = fs.readFileSync(path.join(process.cwd(), 'src/data/completenessMessagingReputationCompareCurrencyAudit.ts'), 'utf8');
  const contentVersioningAuditSrc = fs.readFileSync(path.join(process.cwd(), 'src/data/contentVersioningQualityHierarchyZoningNotificationAudit.ts'), 'utf8');
  const backtestAuditSrc = fs.readFileSync(path.join(process.cwd(), 'src/data/backtestTaxonomyRecoveryRetentionCsvAudit.ts'), 'utf8');
  const driftRankingSrc = fs.readFileSync(path.join(process.cwd(), 'src/data/driftRankingConsentAndEnvironment.ts'), 'utf8');
  const firestoreAuditorSrc = fs.readFileSync(path.join(process.cwd(), 'src/data/firestoreDataAuditor.ts'), 'utf8');
  const integrityChecksSrc = fs.readFileSync(path.join(process.cwd(), 'src/data/firestoreIntegrityChecks.ts'), 'utf8');
  const hoodMappersSrc = fs.readFileSync(path.join(process.cwd(), 'src/data/firestoreNeighborhoodMappers.ts'), 'utf8');
  const diagRunnerSrc = fs.readFileSync(path.join(process.cwd(), 'src/data/diagnosticRunner.ts'), 'utf8');
  const firestoreRepoSrc = fs.readFileSync(path.join(process.cwd(), 'src/data/firestoreNeighborhoodRepository.ts'), 'utf8');
  const metroHoodsSrc = fs.readFileSync(path.join(process.cwd(), 'src/data/metropolitanExtendedHoods.ts'), 'utf8');
  const buyerAlertsUtilSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/buyerAlertsAndCommunityTrust.ts'), 'utf8');
  const bargainSubSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/bargainSubmissionEngine.ts'), 'utf8');
  const finCalcSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/realEstateFinancialCalculatorsAndPublisherAnalytics.ts'), 'utf8');
  const propCompSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/propertyComparisonAndFinancialPrecision.ts'), 'utf8');
  const copywriterSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/listingCopywriterAndVisitConversion.ts'), 'utf8');
  const draftValSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/listingDraftAndValidationEngine.ts'), 'utf8');
  const legalWorkspaceSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/legalContractIntelligenceAndAgencyWorkspace.ts'), 'utf8');
  const agencyCrmEngineSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/agencyCrmWorkflowAndReportingEngine.ts'), 'utf8');
  const marketBiEngineSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/marketBiRiskAndForecastingEngine.ts'), 'utf8');
  const invFundEngineSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/investmentFundNavWaterfallIrrAndGovernanceEngine.ts'), 'utf8');
  const agencyEntEngineSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/agencyEnterpriseOperationsAndGovernanceEngine.ts'), 'utf8');
  const assetOpsEngineSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/assetManagementBuildingOpsAndCmmsEngine.ts'), 'utf8');
  const buildingCompEngineSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/buildingComplianceInsuranceNoiTcoAndAuditEngine.ts'), 'utf8');
  const wbsEngineSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/constructionDevelopmentWbsBudgetAndPartnershipEngine.ts'), 'utf8');
  const deliveryEngineSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/constructionProjectDeliveryContractorAndAuditEngine.ts'), 'utf8');
  const xirrEngineSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/investmentPortfolioXirrNpvBreakEvenAndExitEngine.ts'), 'utf8');
  const propMgmtEngineSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/propertyManagementLeaseBillingAndOperationsEngine.ts'), 'utf8');
  const leasingEngineSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/leasingTenantLifecycleChequeAndHandoverAuditEngine.ts'), 'utf8');
  const facilityEngineSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/facilityManagementPdmSlaEnergyAndHealthEngine.ts'), 'utf8');
  const titleRegistryEngineSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/propertyLegalTitleRegistryAndTransactionTransferEngine.ts'), 'utf8');
  const legalDossierEngineSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/realEstateLegalDossierTitleDisputeAndDueDiligenceEngine.ts'), 'utf8');
  const physicalAssetEngineSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/physicalAssetLifecycleContractorAccessAndFacilityAuditEngine.ts'), 'utf8');
  const specCrmEngineSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/realEstateSpecializedCrmPipelineAndFunnelEngine.ts'), 'utf8');
  const mktTxEngineSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/marketTransactionsNormalizationAndSpecializedSectorsEngine.ts'), 'utf8');
  const mktProvEngineSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/marketIntelligenceProvenanceIndicatorsAndForecastAuditEngine.ts'), 'utf8');
  const urbanIntelEngineSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/urbanIntelligenceDemographicsAndResilienceEngine.ts'), 'utf8');
  const geoCrsEngineSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/geospatialCrsAccessibilityAndEnvironmentalEngine.ts'), 'utf8');
  const mktIdxEngineSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/marketIndexingSpatialPolygonAndSurvivalAnalytics.ts'), 'utf8');
  const propDomainGovSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/propertyDomainGeospatialAndAnalyticsGovernance.ts'), 'utf8');
  const spatialGeomSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/spatialGeometryEngine.ts'), 'utf8');
  const searchEngSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/searchEngineeringEngine.ts'), 'utf8');
  const agencyOutboxSlaSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/agencyAutomationOutboxAndSlaEngine.ts'), 'utf8');
  const agencyDedupMsgSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/agencyDeduplicationAndMessagingGovernance.ts'), 'utf8');
  const sponsoredVaultMapSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/sponsoredVaultMapNegotiationAndAuditTrail.ts'), 'utf8');
  const buyerCorrAdminGovSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/buyerCorrectionAndAdminGovernance.ts'), 'utf8');
  const listingLifecycleSecSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/listingLifecycleAndPlatformSecurity.ts'), 'utf8');
  const mktPipelineDesignGovSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/marketPipelineDesignSystemAndUiStateGovernance.ts'), 'utf8');
  const leadsMediaFunnelSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/leadsMediaOnboardingFunnelTransportAudit.ts'), 'utf8');
  const listingTimeMediaQualSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/listingTimestampAndMediaQuality.ts'), 'utf8');
  const mktHistPulseIntSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/marketHistoryAndPulseIntegrity.ts'), 'utf8');
  const multiTabDedupeSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/multiTabListingDedupeBulkRaceAudit.ts'), 'utf8');
  const offlineAuthTimeSeriesSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/offlineAppointmentsFavoritesTimeSeriesAuthority.ts'), 'utf8');
  const persianSearchWorkspaceSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/persianSearchAndPersonalWorkspace.ts'), 'utf8');
  const paymentFinopsPrivacySrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/paymentFinopsDesignBoundaryPrivacyAudit.ts'), 'utf8');
  const timeSeriesLicensingSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/timeSeriesLicensingAndBrowserLifecycleGovernance.ts'), 'utf8');
  const uxJourneyTrustSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/uxJourneyAndTrustAuditEngine.ts'), 'utf8');
  const productAnalyticsSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/productAnalyticsEngine.ts'), 'utf8');
  const uxAccessibilitySrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/uxAccessibilityAndDesignSystemEngine.ts'), 'utf8');
  const webPlatformPrivacySrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/webPlatformPwaAndPrivacyEngine.ts'), 'utf8');
  const a11yOidcCircuitSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/accessibilityOidcIntegrityAnalyticsCircuit.ts'), 'utf8');
  const advAppSecGovSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/advancedAppSecAndSupplyChainGovernance.ts'), 'utf8');
  const aiGovObsSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/aiGovernanceAndObservability.ts'), 'utf8');
  const aiModelGatewaySrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/aiModelRegistryAndGateway.ts'), 'utf8');
  const apiContractsSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/apiContractsAndSerializationEngine.ts'), 'utf8');
  const archSolidSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/architectureSolidAndMaturityEngine.ts'), 'utf8');
  const backupConcurrencySrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/backupConcurrencyAndBusinessInvariants641To660.ts'), 'utf8');
  const bootstrapLocSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/bootstrapLocalizationAndModerationGovernance.ts'), 'utf8');
  const buildReleaseSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/buildReleaseAndSupplyChainEngine.ts'), 'utf8');
  const cacheJobsGeoSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/cacheJobsGeospatialIngestionFlags.ts'), 'utf8');
  const cfPortabilitySrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/cloudflarePortabilityAndCapabilities.ts'), 'utf8');
  const dataCommerceMcpSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/dataCommerceMcpAndMonetization.ts'), 'utf8');
  const deepInfraSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/deepInfrastructureAndRecovery661To700.ts'), 'utf8');
  const deletionJournalSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/deletionJournal.ts'), 'utf8');
  const diagnosticsSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/diagnostics.ts'), 'utf8');
  const docGovDriftSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/documentationGovernanceAndDriftEngine.ts'), 'utf8');
  const domainAuthSecSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/domainAndAuthSecurity741To800.ts'), 'utf8');
  const domainSecValSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/domainSecurityValidators.ts'), 'utf8');
  const engMigGovSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/engineeringAndMigrationGovernance.ts'), 'utf8');
  const finPrecisionSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/financialPrecisionAndUnits.ts'), 'utf8');
  const freeScraperSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/freeLiveMarketScraper.ts'), 'utf8');
  const frontendArchSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/frontendArchitectureAndOfflineResilience.ts'), 'utf8');
  const geojsonLazySrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/geojsonViewportLazyEngine.ts'), 'utf8');
  const hedonicImgSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/hedonicImageGenerator.ts'), 'utf8');
  const httpFirestoreSecSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/httpFirestoreAndStorage701To740.ts'), 'utf8');
  const idempotencyOpsSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/idempotencyContentionAndOpsGovernance.ts'), 'utf8');
  const identityGovSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/identityLifecycleAndBackendGovernance.ts'), 'utf8');
  const marketIntegritySrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/marketDataIntegrity.ts'), 'utf8');
  const multiScriptUnitsSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/multiScriptNumericAndUnits.ts'), 'utf8');
  const hoodBoundariesSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/neighborhoodBoundaries.ts'), 'utf8');
  const neshanTileSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/neshanTileConfig.ts'), 'utf8');
  const notifMobileIamSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/notificationMobileResidencyPortabilityIam.ts'), 'utf8');
  const objStorageSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/objectStorage.ts'), 'utf8');
  const opsScaleGameDaySrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/operationalScaleAndGameDay.ts'), 'utf8');
  const pdfJalaliAuditSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/pdfJalaliPushErrorBuildAudit.ts'), 'utf8');
  const privacyLifecycleSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/privacyAndDataLifecycle861To880.ts'), 'utf8');
  const pwaOfflineSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/pwaOfflineSupport.ts'), 'utf8');
  const secGov601Src = fs.readFileSync(path.join(process.cwd(), 'src/utils/securityGovernance601To639.ts'), 'utf8');
  const secGovListingsSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/securityGovernanceLifecycleAndListings.ts'), 'utf8');
  const supplyChainRoutingSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/supplyChainWebhooksMediaSearchRouting.ts'), 'utf8');
  const telegramAsyncSecSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/telegramAndAsyncJobSecurity801To820.ts'), 'utf8');
  const xssMassAssignChartSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/xssMassAssignChartBrowserThirdParty.ts'), 'utf8');
  const fileSigSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/fileSignature.ts'), 'utf8');
  const persianFinancialsSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/persianFinancials.ts'), 'utf8');
  const firestoreConnSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/firestoreConnectionState.ts'), 'utf8');
  const leafletLoaderSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/leafletLoader.ts'), 'utf8');
  const objDeleteCoordSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/objectStorageDeleteCoordinator.ts'), 'utf8');
  const objSampleMediaSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/objectStorageSampleMedia.ts'), 'utf8');
  const objStorageUploadSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/objectStorageUpload.ts'), 'utf8');
  const osmTileProxySrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/osmTileProxy.ts'), 'utf8');
  const securityUtilSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/security.ts'), 'utf8');
  const rmepStateEngineSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/rmepExecutionStateEngine.ts'), 'utf8');
  const srvAdminTelegramSecSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/serverAdminAndTelegramSecurity.ts'), 'utf8');
  const srvAdminSodBackupSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/serverAdminSodAndBackupSecurity.ts'), 'utf8');
  const srvAiCommerceSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/serverAiAndCommerceRoutes.ts'), 'utf8');
  const srvBackupChunkSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/serverBackupAndChunkUploadRoutes.ts'), 'utf8');
  const srvBoundaryProtoSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/serverBoundaryProtocol.ts'), 'utf8');
  const srvConfigValSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/serverConfigValidator.ts'), 'utf8');
  const srvDeliveryGuardSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/serverDeliveryAndAbuseGuard.ts'), 'utf8');
  const srvForensicsSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/serverForensicsAndIncidentResponse.ts'), 'utf8');
  const srvIdempotencySrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/serverIdempotencyAndConcurrency.ts'), 'utf8');
  const srvJournalAdaptersSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/serverJournalAdapters.ts'), 'utf8');
  const srvLegalRuleEngineSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/serverLegalRuleEngine.ts'), 'utf8');
  const srvMarketPulseSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/serverMarketPulseEngine.ts'), 'utf8');
  const srvObjectStorageSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/serverObjectStorage.ts'), 'utf8');
  const srvObjStorageCleanupSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/serverObjectStorageCleanup.ts'), 'utf8');
  const srvObjStorageHelpersSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/serverObjectStorageHelpers.ts'), 'utf8');
  const srvObjStorageOrphanSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/serverObjectStorageOrphanAudit.ts'), 'utf8');
  const srvPublisherBargainsSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/serverPublisherBargains.ts'), 'utf8');
  const srvRuntimeEnvStoreSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/serverRuntimeEnvStore.ts'), 'utf8');
  const srvSeoAndSitemapSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/serverSeoAndSitemap.ts'), 'utf8');
  const srvSponsorBargainRoutesSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/serverSponsorAndBargainRoutes.ts'), 'utf8');
  const srvUtilityRoutesSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/serverUtilityRoutes.ts'), 'utf8');
  const firebaseRootSrc = fs.readFileSync(path.join(process.cwd(), 'src/firebase.ts'), 'utf8');
  const serverEntrySrc = readServerEntrySource(process.cwd());
  const srvStoragePortabilitySrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/serverStoragePortabilityAndTracing.ts'), 'utf8');
  const areaUnitToggleSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/AreaUnitToggle.tsx'), 'utf8');
  const mapLegendSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/MapLegend.tsx'), 'utf8');
  const radarBottomNavSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/RadarBottomNav.tsx'), 'utf8');
  const mainEntrySrc = fs.readFileSync(path.join(process.cwd(), 'src/main.tsx'), 'utf8');
  const modelsTypeSrc = fs.readFileSync(path.join(process.cwd(), 'src/types/models.ts'), 'utf8');
  const typeGuardsSrc = fs.readFileSync(path.join(process.cwd(), 'src/types/typeGuards.ts'), 'utf8');
  // OP-DEC-001 is a financial-domain contract; unrelated UI, transport, error, and map modules
  // are not required to import the formatter merely to pass this source audit.
  assert.ok(persianFinancialsSrc.includes('formatMillionTomanAsIntlCurrency'));
  assert.ok(hedonicEngineSrc.includes('formatMillionTomanAsIntlCurrency'));
  assert.ok(hedonicModalSrc.includes('formatMillionTomanAsIntlCurrency'));
  assert.ok(inspectorTabsSrc.includes('formatMillionTomanAsIntlCurrency'));
  assert.ok(buyerAlertModalsSrc.includes('formatMillionTomanAsIntlCurrency'));
  assert.ok(agencyModalSrc.includes('formatMillionTomanAsIntlCurrency'));
  assert.ok(sponsorReservationTabSrc.includes('formatMillionTomanAsIntlCurrency'));
  assert.ok(bargainSubSrc.includes('formatMillionTomanAsIntlCurrency'));
  assert.ok(areaUnitToggleSrc.includes('formatMillionTomanAsIntlCurrency'));

  assert.deepEqual(
    areaMod.parseUrlIntlParams('?city=tehran&hood=5&lang=en&currency=usd&unit=sqft'),
    { lang: 'en', currency: 'USD', unit: 'sqft' },
    'parseUrlIntlParams must parse valid lang=en, currency=USD, and unit=sqft query parameters'
  );
  assert.deepEqual(
    areaMod.parseUrlIntlParams('?lang=invalid&currency=gbp&unit=acres'),
    { lang: undefined, currency: undefined, unit: undefined },
    'parseUrlIntlParams must ignore unsupported lang, currency, and unit query parameters'
  );
  assert.equal(
    areaMod.resolveInitialRadarLocale({ urlLang: 'tr', savedLocale: 'fa', navigatorLanguages: ['en-US'], enableAutoBrowserDetect: true }),
    'fa',
    'resolveInitialRadarLocale must fall back to savedLocale (fa) when urlLang is unsupported'
  );
  assert.equal(
    areaMod.resolveInitialRadarLocale({ savedLocale: 'ar', navigatorLanguages: ['en-US'], enableAutoBrowserDetect: true }),
    'en',
    'resolveInitialRadarLocale must detect navigatorLanguages (en) when savedLocale is unsupported'
  );
  assert.equal(
    areaMod.resolveInitialRadarLocale({ savedLocale: null, navigatorLanguages: ['en-GB', 'fa-IR'], enableAutoBrowserDetect: true }),
    'en',
    'resolveInitialRadarLocale must detect en-GB as en when auto browser detect is enabled'
  );
  assert.ok(
    urlAndTitleSyncSrc.includes('setStoredRadarLocale') &&
      areaUnitToggleSrc.includes('ft²'),
    'useAppUrlAndTitleSync must sync dynamic locale/dir and AreaUnitToggle must expose ft² controls'
  );
  const inspectorDrawerSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/NeighborhoodInspectorDrawer.tsx'), 'utf8');
  const compareSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/CompareModal.tsx'), 'utf8');
  assert.ok(
    shareModalSrc.includes('storyBuyFx') &&
      shareModalSrc.includes('storyRahnFx') &&
      inspectorDrawerSrc.includes('useAreaUnit') &&
      useRadarCrudActionsSrc.includes('intlQuerySuffix'),
    'ShareModal, NeighborhoodInspectorDrawer, and useRadarCrudActions must expose story FX rendering, global unit/currency hooks, and deep-link share query suffixes'
  );
  assert.ok(
    compareSrc.includes('activeBudgetMillion') &&
      shortlistMatrixSrc.includes('useAreaUnit') &&
      smartSuggestSrc.includes('useAreaUnit') &&
      hedonicModalSrc.includes('sellerAskingMillion && intlCurrency !== \'IRT\''),
    'CompareModal, ShortlistMatrixModal, SmartSuggestModal, and HedonicValuationModal must consume global unit/currency hooks and live currency equivalence'
  );
  const nationwideProvinceSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/NationwideProvinceModal.tsx'), 'utf8');
  assert.ok(
    portfolioModalsSrc.includes('newVisitPrice > 0 && intlCurrency !== \'IRT\'') &&
      priceTrendModalSrc.includes('useAreaUnit') &&
      agencyModalSrc.includes('useAreaUnit') &&
      nationwideProvinceSrc.includes('useAreaUnit'),
    'PortfolioModals, NeighborhoodPriceTrendModal, AgencyModal, and NationwideProvinceModal must consume global unit/currency hooks and live currency equivalence'
  );
  assert.ok(
    secondaryModalsSrc.includes('useAreaUnit') &&
      buyerAlertModalsSrc.includes('useAreaUnit') &&
      expansionModalSrc.includes('commDeposit > 0 && intlCurrency !== \'IRT\'') &&
      futureSuperModulesModalSrc.includes('useAreaUnit'),
    'SecondaryModals, BuyerAlertPwaLegalModals, ExpansionModulesModal, and FutureSuperModulesModal must consume global unit/currency hooks and live currency equivalence'
  );
  assert.ok(
    legalStudioSrc.includes('formatMillionTomanAsIntlCurrency(loanPrincipalMillion, currency, locale)') &&
      agencyCrmStudioSrc.includes('useAreaUnit') &&
      biGisStudioSrc.includes('formatMillionTomanAsIntlCurrency(purchasePriceMillion, currency, locale)') &&
      enterpriseModalSrc.includes('useAreaUnit') &&
      adminModalSrc.includes('useAreaUnit') &&
      onboardingWizardSrc.includes('formatMillionTomanAsIntlCurrency(deposit, currency, locale)') &&
      onboardingWizardSrc.includes('formatMillionTomanAsIntlCurrency(monthlyRent, currency, locale)'),
    'LegalContractAndPortfolioStudioModal, AgencyCrmAndAutomationStudioModal, BiRiskAndGeospatialIntelligenceStudioModal, EnterpriseAssetFundAndMarketIntelligenceModal, AdminModal, and OnboardingWizardModal must consume global unit/currency hooks and live currency equivalence'
  );
  assert.ok(
    superModulesValSrc.includes('formatMillionTomanAsIntlCurrency(landShareResult.pureLandValueMillion, intlCurrency, locale)') &&
      superModulesValSrc.includes('formatMillionTomanAsIntlCurrency(negotiationResult.discountTomansMillion, intlCurrency, locale)') &&
      superModulesValSrc.includes('formatMillionTomanAsIntlCurrency(auctionResult.optimalBidEnvelopeMillion, intlCurrency, locale)') &&
      superModulesValSrc.includes('formatMillionTomanAsIntlCurrency(rahnArbitrageResult.annualAdvantageMillion, intlCurrency, locale)') &&
      superModulesSwapSrc.includes('const areaStr = formatAreaValue(valSqm, areaUnit, true);') &&
      superModulesSwapSrc.includes('formatMillionTomanAsIntlCurrency(movingCostResult.totalMovingCostThousand / 1000, intlCurrency, locale)') &&
      superModulesLegalSrc.includes('formatMillionTomanAsIntlCurrency(propertyTaxResult.vacantHomeTaxAnnualMillion, intlCurrency, locale)') &&
      superModulesLegalSrc.includes('formatMillionTomanAsIntlCurrency(inheritanceResult.estateTaxEstimateMillion, intlCurrency, locale)') &&
      superModulesLegalSrc.includes('formatMillionTomanAsIntlCurrency(buildingBillResult.unitTotalBillThousand / 1000, intlCurrency, locale)'),
    'SuperModulesValuationAndFakeTabs, SuperModulesSwapAndStudioTabs, and SuperModulesLegalAndBuildingTabs must expose live international currency and area unit equivalence across valuation certificates, AI ads, tax/inheritance/charge outputs, and moving cost calculators'
  );
  const hedonicResultsColSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/HedonicValuationResultsColumn.tsx'), 'utf8');
  const hedonicInlineSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/HedonicInlineWidget.tsx'), 'utf8');
  const buyingPowerCardSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/BuyingPowerSummaryCard.tsx'), 'utf8');
  assert.ok(
    hedonicImgSrc.includes('const unitHedonicPrice = convertPricePerSqmToUnit(valuation.hedonicPerSqm, areaUnit);') &&
      hedonicImgSrc.includes('const unitHoodBasePrice = convertPricePerSqmToUnit(valuation.hoodBasePerSqm, areaUnit);') &&
      hedonicResultsColSrc.includes('formatMillionTomanAsIntlCurrency(valuation.confidenceRangeMillion.min, intlCurrency, radarLocale)') &&
      hedonicResultsColSrc.includes('formatMillionTomanAsIntlCurrency(valuation.diffTotalMillion, intlCurrency, radarLocale)') &&
      hedonicInlineSrc.includes('formatAreaValue(sqm, areaUnit, true)') &&
      hedonicInlineSrc.includes('formatMillionTomanAsIntlCurrency(unitPrice, intlCurrency, radarLocale)') &&
      buyingPowerCardSrc.includes('formatMillionTomanAsIntlCurrency(loanHelpMillion, intlCurrency, radarLocale)') &&
      buyingPowerCardSrc.includes('formatMillionTomanAsIntlCurrency(tenantRahnHelpMillion, intlCurrency, radarLocale)') &&
      smartForecastSrc.includes('formatMillionTomanAsIntlCurrency(financialAuditSummary.sampleDeposit, intlCurrency, radarLocale)') &&
      smartForecastSrc.includes('formatMillionTomanAsIntlCurrency(totalRahnEquivalent, intlCurrency, radarLocale)'),
    'hedonicImageGenerator, HedonicValuationResultsColumn, HedonicInlineWidget, BuyingPowerSummaryCard, and SmartPriceForecastCard must expose full area unit and international currency equivalence'
  );
  const op145PriceChartSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/NeighborhoodPriceChart.tsx'), 'utf8');
  const op145MonthlyBarSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/NeighborhoodMonthlyBarChart.tsx'), 'utf8');
  assert.ok(
    op145PriceChartSrc.includes('formatMillionTomanAsIntlCurrency(rentMonthlyVal, intlCurrency, radarLocale)') &&
      op145PriceChartSrc.includes('convertPricePerSqmToUnit(pt.buyPerSqm, areaUnit)') &&
      op145MonthlyBarSrc.includes('const unitChangeVal = convertPricePerSqmToUnit(point.changeAmount, areaUnit);') &&
      op145MonthlyBarSrc.includes('formatMillionTomanAsIntlCurrency(unitCityVal, intlCurrency, radarLocale)') &&
      inspectorTabsSrc.includes('fxTag(deepInsight.monthlyChargeEstimateThousand / 1000)') &&
      bargainsTabsSrc.includes('setNewVisitAddress(`${b.type === \'اجاره\' ? \'[رهن/اجاره] \' : \'\'}واحد ${formatAreaValue(b.sqm, areaUnit)} - ${b.street}`)') &&
      bargainsTabsSrc.includes('formatMillionTomanAsIntlCurrency(uRate, intlCurrency, radarLocale)'),
    'NeighborhoodPriceChart, NeighborhoodMonthlyBarChart, NeighborhoodInspectorTabs, and NeighborhoodBargainsAndVotesTabs must expose full OP-145 area unit and international currency equivalence'
  );
  const op146ExpandableCompareSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/ExpandableComparisonTable.tsx'), 'utf8');
  const op146BudgetBridgeSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/BudgetBridgeAdvisorCard.tsx'), 'utf8');
  const op146PurchasingPowerSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/PurchasingPowerTrendCard.tsx'), 'utf8');
  const op146QuickRankingSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/QuickHoodRankingStrip.tsx'), 'utf8');
  const op146NaturalSearchSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/SmartNaturalSearchMatchesSection.tsx'), 'utf8');
  assert.ok(
    op146ExpandableCompareSrc.includes('formatMillionTomanAsIntlCurrency(uBuyA, intlCurrency, radarLocale)') &&
      op146BudgetBridgeSrc.includes('formatAreaShort(35, areaUnit)') &&
      op146BudgetBridgeSrc.includes('fxTag(1200)') &&
      op146PurchasingPowerSrc.includes('formatMillionTomanAsIntlCurrency(safeBudget, intlCurrency, radarLocale)') &&
      op146QuickRankingSrc.includes('{h.name} ({h.zone}) — {areaUnit === \'sqft\' ? \'ft²\' : \'متری\'} {toPersianNum(uBuy)} م{fx}') &&
      op146NaturalSearchSrc.includes('formatMillionTomanAsIntlCurrency(convertPricePerSqmToUnit(parsed.maxBuyPerSqmMillions, areaUnit), intlCurrency, locale)'),
    'ExpandableComparisonTable, BudgetBridgeAdvisorCard, PurchasingPowerTrendCard, QuickHoodRankingStrip, and SmartNaturalSearchMatchesSection must expose full OP-146 area unit and international currency equivalence'
  );
  const op147PriceTrendModalSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/NeighborhoodPriceTrendModal.tsx'), 'utf-8');
  const op147CompareModalSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/CompareModal.tsx'), 'utf-8');
  const op147PortfolioModalsSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/PortfolioModals.tsx'), 'utf-8');
  assert.ok(
    op147PriceTrendModalSrc.includes('const uCityBuy = Number(convertPricePerSqmToUnit(pt.tehranAvgBuy, areaUnit).toFixed(1));') &&
      op147PriceTrendModalSrc.includes('const uRowBuy = Number(convertPricePerSqmToUnit(row.buyPerSqm, areaUnit).toFixed(1));') &&
      op147CompareModalSrc.includes('رهن کامل واحد ${formatAreaValue(80, areaUnit, true)}') &&
      op147CompareModalSrc.includes('formatHoodOption(n, compareId2)') &&
      op147PortfolioModalsSrc.includes('formatMillionTomanAsIntlCurrency(Math.abs(item.surplusOrDeficitMillion), intlCurrency, radarLocale)') &&
      op147PortfolioModalsSrc.includes('formatMillionTomanAsIntlCurrency(1200, intlCurrency, radarLocale)'),
    'NeighborhoodPriceTrendModal, CompareModal, and PortfolioModals must expose full OP-147 area unit and international currency equivalence'
  );
  const op148ThresholdAlertsSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/buyerPriceThresholdAlerts.tsx'), 'utf-8');
  const op148ExpansionModalSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/ExpansionModulesModal.tsx'), 'utf-8');
  const op148OnboardingSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/OnboardingWizardModal.tsx'), 'utf-8');
  const op148AgencyModalSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/AgencyModal.tsx'), 'utf-8');
  assert.ok(
    op148ThresholdAlertsSrc.includes("const uDefault = dealType === 'خرید' ? convertPricePerSqmToUnit(defaultThreshold, areaUnit) : defaultThreshold;") &&
      op148ThresholdAlertsSrc.includes("const uTopObs = topMatch.subscription.dealType === 'خرید' ? convertPricePerSqmToUnit(topMatch.observedMillion, areaUnit) : topMatch.observedMillion;") &&
      op148ExpansionModalSrc.includes('const fmtFee = (toman: number) =>') &&
      op148ExpansionModalSrc.includes('const uCommPrice = convertPricePerSqmToUnit(commPricePerSqm, areaUnit);') &&
      op148OnboardingSrc.includes('formatMillionTomanAsIntlCurrency(preset, currency, locale)') &&
      op148OnboardingSrc.includes('formatMillionTomanAsIntlCurrency(uBuy, currency, locale)') &&
      op148AgencyModalSrc.includes('const uBench = Number(convertPricePerSqmToUnit(rawBench, areaUnit).toFixed(1));'),
    'buyerPriceThresholdAlerts, ExpansionModulesModal, OnboardingWizardModal, and AgencyModal must expose full OP-148 area unit and international currency equivalence'
  );
  const op149ProvinceModalSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/NationwideProvinceModal.tsx'), 'utf-8');
  const op149SponsorTabSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/AgencySponsorReservationTab.tsx'), 'utf-8');
  const op149LegalStudioSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/LegalContractAndPortfolioStudioModal.tsx'), 'utf-8');
  const op149BiGisStudioSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/BiRiskAndGeospatialIntelligenceStudioModal.tsx'), 'utf-8');
  assert.ok(
    op149ProvinceModalSrc.includes("({toPersianNum(uPrice)} {areaUnit === 'sqft' ? 'م/ft²' : 'م'}{fxTip})") &&
      op149SponsorTabSrc.includes('formatMillionTomanAsIntlCurrency(Math.round(billingSummary.baseMonthlyTariff * 3 * 0.8 * 10) / 10, currency, locale)') &&
      op149LegalStudioSrc.includes('formatMillionTomanAsIntlCurrency(extraMonthlyPrepayMillion, currency, locale)') &&
      op149LegalStudioSrc.includes('formatMillionTomanAsIntlCurrency(brokerageFeeMillion, currency, locale)') &&
      op149BiGisStudioSrc.includes("convertPricePerSqmToUnit((indexAndGap.askingMedianPerSqmToman ?? 0) / 1_000_000, areaUnit)"),
    'NationwideProvinceModal, AgencySponsorReservationTab, LegalContractAndPortfolioStudioModal, and BiRiskAndGeospatialIntelligenceStudioModal must expose full OP-149 area unit and international currency equivalence'
  );
  const op150EnterpriseModalSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/EnterpriseAssetFundAndMarketIntelligenceModal.tsx'), 'utf-8');
  const op150AdminOverviewSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/AdminOverviewAndModerationTabs.tsx'), 'utf-8');
  const op150ShareModalSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/ShareModal.tsx'), 'utf-8');
  assert.ok(
    op150EnterpriseModalSrc.includes('convertPricePerSqmToUnit((b120MarketResult.pricingAndTom.askingDistribution.medianPricePerSqmToman ?? 0) / 1_000_000, areaUnit)') &&
      op150EnterpriseModalSrc.includes('convertPricePerSqmToUnit((b131DeliveryResult.costAndAudits.unitCostMetrics.costPerSqmToman ?? 0) / 1_000_000, areaUnit)') &&
      op150AdminOverviewSrc.includes('fxTag(convertPricePerSqmToUnit(adminEditBuySqm, areaUnit))') &&
      op150AdminOverviewSrc.includes('رهن کامل {formatAreaShort(80, areaUnit)} (میلیون){fxTag(adminEditRahn80m)}:') &&
      op150ShareModalSrc.includes('formatNeighborhoodPriceTruthFa(hood.id, 0)'),
    'EnterpriseAssetFundAndMarketIntelligenceModal, AdminOverviewAndModerationTabs, and ShareModal must expose full OP-150 area unit and international currency equivalence'
  );
  const op151AdminAiSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/AdminCloudAiCommerceCenter.tsx'), 'utf-8');
  const op151AdminMcpSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/AdminMcpAndPortabilitySandboxPanel.tsx'), 'utf-8');
  const op151HedonicModalSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/HedonicValuationModal.tsx'), 'utf-8');
  assert.ok(
    op151AdminAiSrc.includes('convertPricePerSqmToUnit(searchTestResult.structuredQuery.maxBuyPerSqmMillions, areaUnit)') &&
      op151AdminMcpSrc.includes('formatMillionTomanAsIntlCurrency(convertPricePerSqmToUnit(maxBuyPerSqm, areaUnit), intlCurrency, locale)') &&
      op151HedonicModalSrc.includes('formatMillionTomanAsIntlCurrency(valuation.confidenceRangeMillion.min, intlCurrency, radarLocale)') &&
      op151HedonicModalSrc.includes('formatMillionTomanAsIntlCurrency(convertPricePerSqmToUnit(n.baseBuyPerSqm ?? n.buyPerSqm, areaUnit), intlCurrency, radarLocale)'),
    'AdminCloudAiCommerceCenter, AdminMcpAndPortabilitySandboxPanel, and HedonicValuationModal must expose full OP-151 area unit and international currency equivalence'
  );
  const op152SearchDropdownSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/SearchDropdownMenu.tsx'), 'utf-8');
  const op152HedonicInlineSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/HedonicInlineWidget.tsx'), 'utf-8');
  assert.ok(
    op152SearchDropdownSrc.includes('رهن ${formatAreaShort(80, areaUnit)}:') &&
      op152HedonicInlineSrc.includes('formatMillionTomanAsIntlCurrency(unitHoodBase, intlCurrency, radarLocale)') &&
      op146ExpandableCompareSrc.includes('formatMillionTomanAsIntlCurrency(optVal, intlCurrency, radarLocale)') &&
      op147PriceTrendModalSrc.includes('name={`رهن کامل ${effectiveAreaLabel} (میلیون تومان)`}') &&
      op147PriceTrendModalSrc.includes('convertPricePerSqmToUnit(summaryStats.avgBuy12m, areaUnit)'),
    'SearchDropdownMenu, HedonicInlineWidget, ExpandableComparisonTable, and NeighborhoodPriceTrendModal must expose full OP-152 area unit and international currency equivalence'
  );
  const op153PriceChartSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/NeighborhoodPriceChart.tsx'), 'utf-8');
  const op153MonthlyBarSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/NeighborhoodMonthlyBarChart.tsx'), 'utf-8');
  const op153ForecastCardSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/SmartPriceForecastCard.tsx'), 'utf-8');
  const op153SecondaryModalsSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/SecondaryModals.tsx'), 'utf-8');
  assert.ok(
    op153PriceChartSrc.includes('name={`رهن کامل ${formatAreaShort(80, areaUnit)} (م)`}') &&
      op153PriceChartSrc.includes('formatMillionTomanAsIntlCurrency(uPtBuy, intlCurrency, radarLocale)') &&
      op153MonthlyBarSrc.includes('formatMillionTomanAsIntlCurrency(Math.abs(avgMonthlyIncreaseMillion), intlCurrency, radarLocale)') &&
      op153MonthlyBarSrc.includes('formatMillionTomanAsIntlCurrency(Math.abs(unitChangeVal), intlCurrency, radarLocale)') &&
      op153ForecastCardSrc.includes('شفافیت کمیسیون اتحادیه، سهم عرصه و تبدیل رهن ({formatAreaShort(80, areaUnit)})') &&
      op153SecondaryModalsSrc.includes("seoSortBy === 'cheapest_rent' ? fmtUnitRent(n.rahn80m) : fmtUnitBuy"),
    'NeighborhoodPriceChart, NeighborhoodMonthlyBarChart, SmartPriceForecastCard, and SecondaryModals must expose full OP-153 area unit and international currency equivalence'
  );
  const op154QuickRankingSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/QuickHoodRankingStrip.tsx'), 'utf-8');
  const op154BargainsSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/NeighborhoodBargainsAndVotesTabs.tsx'), 'utf-8');
  const op154BuyingPowerSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/BuyingPowerSummaryCard.tsx'), 'utf-8');
  const op154BudgetBridgeSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/BudgetBridgeAdvisorCard.tsx'), 'utf-8');
  const op154CompareModalSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/CompareModal.tsx'), 'utf-8');
  assert.ok(
    op154QuickRankingSrc.includes('formatMillionTomanAsIntlCurrency(convertPricePerSqmToUnit(cityMarketStats.iqrPricePerSqm ?? 0, areaUnit), intlCurrency, radarLocale)') &&
      op154BargainsSrc.includes('نرخ معادل رهن ({formatAreaShort(80, areaUnit)}):') &&
      op154BargainsSrc.includes('سود خریدار: {b.buyerProfitText}{fxProfit}') &&
      op154BuyingPowerSrc.includes('formatMillionTomanAsIntlCurrency(displayUnitPrice, intlCurrency, radarLocale)') &&
      op154BudgetBridgeSrc.includes('رهن (${formatAreaShort(80, areaUnit)}) ${toPersianNum(diffRahn)}م${fxTag(diffRahn)}') &&
      op154CompareModalSrc.includes('`رهن (${formatAreaShort(80, areaUnit)})`'),
    'QuickHoodRankingStrip, NeighborhoodBargainsAndVotesTabs, BuyingPowerSummaryCard, BudgetBridgeAdvisorCard, and CompareModal must expose full OP-154 area unit and international currency equivalence'
  );
  const op155InspectorDrawerSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/NeighborhoodInspectorDrawer.tsx'), 'utf-8');
  const op155InspectorTabsSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/NeighborhoodInspectorTabs.tsx'), 'utf-8');
  const op155ShortlistMatrixSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/ShortlistMatrixModal.tsx'), 'utf-8');
  const op155PortfolioModalsSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/PortfolioModals.tsx'), 'utf-8');
  assert.ok(
    op155InspectorDrawerSrc.includes('`رهن (${formatAreaShort(80, areaUnit)}): ${toPersianNum(favHood.rahn80m)} م') &&
      op155InspectorDrawerSrc.includes('formatMillionTomanAsIntlCurrency(selectedHood.rahn80m, intlCurrency, radarLocale)') &&
      op155InspectorTabsSrc.includes('`رهن (${formatAreaShort(80, areaUnit)}) ~${toPersianNum(Math.round(selectedHood.rahn80m * tier.priceMultiplier))} م${fxTag(Math.round(selectedHood.rahn80m * tier.priceMultiplier))}`') &&
      (op155ShortlistMatrixSrc.includes('رهن کامل (${formatAreaShort(80, areaUnit)} — میلیون تومان)') || op155ShortlistMatrixSrc.includes('رهن کامل ({formatAreaShort(80, areaUnit)} — میلیون تومان)')) &&
      op155ShortlistMatrixSrc.includes('formatMillionTomanAsIntlCurrency(unitBuy, intlCurrency, radarLocale)') &&
      op155PortfolioModalsSrc.includes('قیمت کل واحد ({formatAreaShort(tradeUpTargetSqm, areaUnit)}):'),
    'NeighborhoodInspectorDrawer, NeighborhoodInspectorTabs, ShortlistMatrixModal, and PortfolioModals must expose full OP-155 area unit and international currency equivalence'
  );
  const op156SecondaryModalsSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/SecondaryModals.tsx'), 'utf-8');
  const op156SmartSuggestSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/SmartSuggestModal.tsx'), 'utf-8');
  const op156ShareModalSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/ShareModal.tsx'), 'utf-8');
  const op156ProvinceModalSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/NationwideProvinceModal.tsx'), 'utf-8');
  assert.ok(
    op156SecondaryModalsSrc.includes('compare=${pair.id1}-${pair.id2}${intlQuerySuffix}') &&
      op156SmartSuggestSrc.includes('کل ${formatAreaValue(safeTargetSqm, areaUnit, true)}: ${toPersianNum(Math.round(safeBuySqm * safeTargetSqm))} م') &&
      op156ShareModalSrc.includes('formatMillionTomanAsIntlCurrency(storyUnitBuy, intlCurrency, locale)') &&
      op156ProvinceModalSrc.includes('رهن ${formatAreaShort(80, areaUnit)}: ${toPersianNum(h.rahn80m)} میلیون${rahnFxTip}'),
    'SecondaryModals, SmartSuggestModal, ShareModal, and NationwideProvinceModal must expose full OP-156 deep-link, area unit, and international currency equivalence'
  );
  const op157HedonicModalSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/HedonicValuationModal.tsx'), 'utf-8');
  const op157HedonicResultsSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/HedonicValuationResultsColumn.tsx'), 'utf-8');
  const op157AgencyModalSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/AgencyModal.tsx'), 'utf-8');
  const op157OnboardingSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/OnboardingWizardModal.tsx'), 'utf-8');
  assert.ok(
    op157HedonicModalSrc.includes('فروش فوری نقدی (-۱۲٪): ${toPersianNum((valuation.fastSaleTotalMillion / 1000).toFixed(2))} میلیارد تومان') &&
      op157HedonicModalSrc.includes('اعلامی هر ${unitLabel}: ${toPersianNum(convertPricePerSqmToUnit(Math.round(sellerAskingMillion / Math.max(1, sqm)), areaUnit))} م') &&
      op157HedonicResultsSrc.includes('م/{areaUnit === \'sqft\' ? \'ft²\' : \'متر\'}') &&
      op157AgencyModalSrc.includes('رهن ${formatAreaShort(80, areaUnit)}') &&
      op157AgencyModalSrc.includes('اعمال ۱۵٪ تخفیف ({toPersianNum(Math.max(10, Math.floor((liveBargainCheck.maxAllowedFor10Percent / 0.9) * 0.85)))} م') &&
      op157OnboardingSrc.includes('کل بودجه نقدی در دسترس شما:') &&
      op157OnboardingSrc.includes('متری ${toPersianNum(uBuy)} م (معامله v6.4: ${toPersianNum(uDeal)} م)${showIntl ? ` (${formatMillionTomanAsIntlCurrency(uBuy, currency, locale)})` : \'\'}') &&
      op157OnboardingSrc.includes('formatAreaShort(targetSqm, \'sqft\')'),
    'HedonicValuationModal, HedonicValuationResultsColumn, AgencyModal, and OnboardingWizardModal must expose full OP-157 area unit and international currency equivalence'
  );
  const op158PortfolioSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/PortfolioModals.tsx'), 'utf-8');
  const op158BuyerAlertsSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/buyerPriceThresholdAlerts.tsx'), 'utf-8');
  const op158SparklineSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/BuyerAlertPriceSparkline.tsx'), 'utf-8');
  const op158LegalAdvisorSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/ContractLegalAdvisorView.tsx'), 'utf-8');
  assert.ok(
    op158PortfolioSrc.includes('ارزش تقریبی فروش ملک فعلی (هر {areaUnit === \'sqft\' ? \'ft²\' : \'متر\'}') &&
      op158PortfolioSrc.includes('({areaUnit === \'sqft\' ? \'ft²\' : \'متری\'} {toPersianNum(Math.round(convertPricePerSqmToUnit(item.hood.buyPerSqm, areaUnit)))} م)') &&
      op158BuyerAlertsSrc.includes('سقف انتخابی: {toPersianNum(uInput)} م') &&
      op158BuyerAlertsSrc.includes('در انتظار کاهش قیمت{subHood ? ` (فعلی: ${toPersianNum(uCur)} م)` : \'\'}') &&
      op158SparklineSrc.includes('سقف شما: {fmtVal(pt.thresholdMillion)} {unitSuffix}{fmtFx(pt.thresholdMillion)}') &&
      op158LegalAdvisorSrc.includes('<AreaUnitToggle compact showIntlControls />') &&
      op158LegalAdvisorSrc.includes('const rewriteWithFx = `${clauseResult.safeRewrite}'),
    'PortfolioModals, buyerPriceThresholdAlerts, BuyerAlertPriceSparkline, and ContractLegalAdvisorView must expose full OP-158 area unit and international currency equivalence'
  );
  const op159ExpansionSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/ExpansionModulesModal.tsx'), 'utf-8');
  const op159LegalStudioSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/LegalContractAndPortfolioStudioModal.tsx'), 'utf-8');
  const op159AgencyCrmSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/AgencyCrmAndAutomationStudioModal.tsx'), 'utf-8');
  const op159BiGisSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/BiRiskAndGeospatialIntelligenceStudioModal.tsx'), 'utf-8');
  assert.ok(
    op159ExpansionSrc.includes("commDealType === 'buy' ? 'جمع کل قابل پرداخت خریدار:' : 'جمع کل قابل پرداخت مستاجر:'") &&
      op159ExpansionSrc.includes('const tgHoodSummary = `📊 نرخ فعلی ${selectedHood?.name || \'تهران\'}') &&
      op159LegalStudioSrc.includes('واحد سعادت‌آباد ({formatAreaShort(110, areaUnit)})') &&
      op159LegalStudioSrc.includes('تغییر رقم مالی${showIntl ? `: ${formatMillionTomanAsIntlCurrency(10_000, currency, locale)} ← ${formatMillionTomanAsIntlCurrency(10_500, currency, locale)}` : \'\'}') &&
      op159AgencyCrmSrc.includes('{formatAreaShort(125, areaUnit)}{showIntl ? ` · ${formatMillionTomanAsIntlCurrency(13_800, currency, locale)}` : \'\'}') &&
      op159AgencyCrmSrc.includes('(${formatMillionTomanAsIntlCurrency(136.5, currency, locale)} ← ${formatMillionTomanAsIntlCurrency(116, currency, locale)})') &&
      op159BiGisSrc.includes('NOI: {Math.round(investmentSim.annualNetOperatingIncomeToman / 1_000_000).toLocaleString(\'fa-IR\')} م') &&
      op159BiGisSrc.includes('شعاع {r} متر'),
    'ExpansionModulesModal, LegalContractAndPortfolioStudioModal, AgencyCrmAndAutomationStudioModal, and BiRiskAndGeospatialIntelligenceStudioModal must expose full OP-159 area unit and international currency equivalence'
  );
  const op160EnterpriseSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/EnterpriseAssetFundAndMarketIntelligenceModal.tsx'), 'utf-8');
  const op160ValuationFakeSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/SuperModulesValuationAndFakeTabs.tsx'), 'utf-8');
  const op160LegalBuildingSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/SuperModulesLegalAndBuildingTabs.tsx'), 'utf-8');
  const op160SwapStudioSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/SuperModulesSwapAndStudioTabs.tsx'), 'utf-8');
  assert.ok(
    op160EnterpriseSrc.includes('NAV هر واحد: <strong>{toPersianNum((b119FundResult.nav.navPerUnitToman ?? 0).toLocaleString())} ت{fxM((b119FundResult.nav.navPerUnitToman ?? 0) / 1_000_000)}</strong>') &&
      op160EnterpriseSrc.includes('kWh/m²') &&
      op160EnterpriseSrc.includes('({formatAreaShort(142.5, areaUnit)})') &&
      op160ValuationFakeSrc.includes("convertPricePerSqmToUnit(valuationResult.goldGramPricePerSqm, 'sqm')") &&
      op160ValuationFakeSrc.includes('formatMillionTomanAsIntlCurrency(negotiationResult.targetClosingPriceMillion, intlCurrency, locale)') &&
      op160ValuationFakeSrc.includes('formatMillionTomanAsIntlCurrency(depositInflationResult.realValue1YrMillion, intlCurrency, locale)') &&
      op160LegalBuildingSrc.includes('formatMillionTomanAsIntlCurrency(share.perPersonValueMillion, intlCurrency, locale)') &&
      op160LegalBuildingSrc.includes('معادل ارزی سهم واحد:') &&
      op160LegalBuildingSrc.includes('ودیعه مرجع: {toPersianNum(activeHood.rahn80m)} م') &&
      op160SwapStudioSrc.includes("${areaUnit === 'sqft' ? 'هر ft² فقط' : 'متری فقط'} ${toPersianNum(convertPricePerSqmToUnit(fairPerSqm, areaUnit))} میلیون") &&
      op160SwapStudioSrc.includes('واحد ${formatAreaValue(valSqm, areaUnit, true)} (چک‌لیست ۱۲گانه:') &&
      op160SwapStudioSrc.includes("{areaUnit === 'sqft' ? '۱.۵ کیلومتر (۴,۹۲۰ فوت)' : '۱.۵ کیلومتر'}"),
    'EnterpriseAssetFundAndMarketIntelligenceModal, SuperModulesValuationAndFakeTabs, SuperModulesLegalAndBuildingTabs, and SuperModulesSwapAndStudioTabs must expose full OP-160 area unit and international currency equivalence'
  );
  const op161InspectorDrawerSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/NeighborhoodInspectorDrawer.tsx'), 'utf-8');
  const op161PurchasingPowerSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/PurchasingPowerTrendCard.tsx'), 'utf-8');
  const op161CommuteMatrixSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/CommuteHubsMatrixCard.tsx'), 'utf-8');
  const op161RankingStripSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/QuickHoodRankingStrip.tsx'), 'utf-8');
  assert.ok(
    op161InspectorDrawerSrc.includes('محله {selectedHood.name} · {formatAreaShort(targetSqm, areaUnit)}') &&
      op161InspectorDrawerSrc.includes("formatMillionTomanAsIntlCurrency(selectedHood.buyPerSqm * targetSqm, intlCurrency, radarLocale) : 'محاسبه آنلاین'") &&
      op161PurchasingPowerSrc.includes('const uPriceDelta = Number((uCurrentPrice - uStartPrice).toFixed(1));') &&
      op161PurchasingPowerSrc.includes('Math.round(spatialReport.nearestMetroDistKm * 3280.84).toLocaleString(\'en-US\')') &&
      op161CommuteMatrixSrc.includes("radarLocale === 'en' ? 'km' : 'کیلومتر'") &&
      op161CommuteMatrixSrc.includes('این محدوده‌ها فاصله مستقیم را نشان می‌دهند و بیانگر زمان واقعی سفر نیستند.') &&
      op161RankingStripSrc.includes('(hood.distKm * 0.621371).toFixed(1)') &&
      op161RankingStripSrc.includes("return `رشد ۶م ${g > 0 ? '+' : ''}${toPersianNum(g)}٪ · ${areaUnit === 'sqft' ? 'ft²' : 'متری'}"),
    'NeighborhoodInspectorDrawer, PurchasingPowerTrendCard, CommuteHubsMatrixCard, and QuickHoodRankingStrip must expose full OP-161 area unit, imperial distance, and international currency equivalence'
  );
  const op162BargainsSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/NeighborhoodBargainsAndVotesTabs.tsx'), 'utf-8');
  const op162InspectorTabsSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/NeighborhoodInspectorTabs.tsx'), 'utf-8');
  const op162ExpandableCompareSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/ExpandableComparisonTable.tsx'), 'utf-8');
  const op162CompareModalSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/CompareModal.tsx'), 'utf-8');
  assert.ok(
    op162BargainsSrc.includes('معیار {formatAreaShort(targetSqm, areaUnit)}:') &&
      op162BargainsSrc.includes('شعاع {toPersianNum(selectedHood.radius || 900)} متر') &&
      op162InspectorTabsSrc.includes('ارزش معیار واحد {formatAreaShort(targetSqm, areaUnit)}:') &&
      op162InspectorTabsSrc.includes('selectedHood.distKm.toFixed(1)') &&
      op162ExpandableCompareSrc.includes('const diffTotalMillion = Math.abs(hoodA.buyPerSqm - hoodB.buyPerSqm) * targetSqm;') &&
      op162ExpandableCompareSrc.includes('hoodA.distKm.toFixed(1)') &&
      op162CompareModalSrc.includes('اختلاف متراژ: <strong className="tabular-nums">{formatAreaValue(summaryStats.diffSqm, areaUnit)}</strong>') &&
      op162CompareModalSrc.includes('compHood1.distKm.toFixed(1)'),
    'NeighborhoodBargainsAndVotesTabs, NeighborhoodInspectorTabs, ExpandableComparisonTable, and CompareModal must expose full OP-162 area unit, imperial distance, and international currency equivalence'
  );
  const op163PriceChartSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/NeighborhoodPriceChart.tsx'), 'utf-8');
  const op163MonthlyBarSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/NeighborhoodMonthlyBarChart.tsx'), 'utf-8');
  const op163ShortlistMatrixSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/ShortlistMatrixModal.tsx'), 'utf-8');
  const op163BudgetBridgeSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/BudgetBridgeAdvisorCard.tsx'), 'utf-8');
  assert.ok(
    op163PriceChartSrc.includes('tickFormatter={(val) => toPersianNum(convertPricePerSqmToUnit(Number(val) || 0, areaUnit))}') &&
      op163PriceChartSrc.includes('کل واحد (۸۰م):') &&
      op163MonthlyBarSrc.includes('tickFormatter={(val) => toPersianNum(convertPricePerSqmToUnit(Number(val) || 0, areaUnit))}') &&
      op163MonthlyBarSrc.includes('ارزش واحد (${formatAreaShort(80, areaUnit)}):') &&
      op163ShortlistMatrixSrc.includes('~{toPersianNum(distKm)} km') &&
      op163ShortlistMatrixSrc.includes('const unitBuy = Number(convertPricePerSqmToUnit(hood.buyPerSqm, areaUnit).toFixed(1));') &&
      op163BudgetBridgeSrc.includes('کمبود بودجه ({formatAreaShort(targetSqm, areaUnit)}):') &&
      op163BudgetBridgeSrc.includes('(distKm * 0.621371).toFixed(1)'),
    'NeighborhoodPriceChart, NeighborhoodMonthlyBarChart, ShortlistMatrixModal, and BudgetBridgeAdvisorCard must expose full OP-163 area unit, imperial distance, and international currency equivalence'
  );
  const op164TrendModalSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/NeighborhoodPriceTrendModal.tsx'), 'utf-8');
  const op164ForecastSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/SmartPriceForecastCard.tsx'), 'utf-8');
  const op164RankingStripSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/QuickHoodRankingStrip.tsx'), 'utf-8');
  const op164PortfolioModalsSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/PortfolioModals.tsx'), 'utf-8');
  assert.ok(
    op164TrendModalSrc.includes("tickFormatter={(val) => toPersianNum(chartMode === 'rent_rahn_detail' ? val : Number(convertPricePerSqmToUnit(Number(val) || 0, areaUnit).toFixed(1)))}") &&
      op164TrendModalSrc.includes('اجاره ماهانه: ${toPersianNum(summaryStats.endMonthlyRent)} م') &&
      op164ForecastSrc.includes('ارزش ۳ ماه آینده ({formatAreaShort(80, areaUnit)}):') &&
      op164RankingStripSrc.includes('if (criterion === \'clean_air\') return `هوا ${toPersianNum(hood.air)}/۱۰ · ${priceTag}`;') &&
      op164RankingStripSrc.includes('if (criterion === \'best_metro\') return `مترو ${toPersianNum(hood.metro)}/۱۰ · ${priceTag}`;') &&
      op164PortfolioModalsSrc.includes('معیار محله: ${areaUnit === \'sqft\' ? \'ft²\' : \'متری\'} ${toPersianNum(uHood)} م') &&
      op164PortfolioModalsSrc.includes('متراژ مورد نظر واحد جدید ({tradeUpTargetSqm >= tradeUpCurrentSqm ? \'+\' : \'-\'}{formatAreaShort(Math.abs(tradeUpTargetSqm - tradeUpCurrentSqm), areaUnit)}):'),
    'NeighborhoodPriceTrendModal, SmartPriceForecastCard, QuickHoodRankingStrip, and PortfolioModals must expose full OP-164 area unit and international currency equivalence'
  );
  const op165BuyingPowerSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/BuyingPowerSummaryCard.tsx'), 'utf-8');
  const op165HedonicWidgetSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/HedonicInlineWidget.tsx'), 'utf-8');
  const op165NaturalSearchSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/SmartNaturalSearchMatchesSection.tsx'), 'utf-8');
  const op165SearchDropdownSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/SearchDropdownMenu.tsx'), 'utf-8');
  assert.ok(
    op165BuyingPowerSrc.includes('متراژ قابل خرید در {selectedHood?.name || \'این محله\'}') &&
      op165BuyingPowerSrc.includes('const affordableSqmInHood = Math.round(effectivePurchasingPowerMillion / hoodPerSqm);') &&
      op165HedonicWidgetSrc.includes('const fastSaleUnitPrice = convertPricePerSqmToUnit(Math.round(result.fastSaleTotalMillion / Math.max(1, sqm)), areaUnit);') &&
      op165HedonicWidgetSrc.includes('const totalDiffMillion = Math.round(Math.abs(result.hedonicTotalMillion - result.hoodBasePerSqm * sqm));') &&
      op165NaturalSearchSrc.includes('(n.distKm * 0.621371).toFixed(1)') &&
      op165NaturalSearchSrc.includes('کل ${formatAreaShort(80, areaUnit)}:') &&
      op165SearchDropdownSrc.includes('(n.distKm * 0.621371).toFixed(1)') &&
      op165SearchDropdownSrc.includes('کل ${formatAreaShort(80, areaUnit)}:'),
    'BuyingPowerSummaryCard, HedonicInlineWidget, SmartNaturalSearchMatchesSection, and SearchDropdownMenu must expose full OP-165 area unit, imperial distance, and international currency equivalence'
  );
  const op166HedonicModalSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/HedonicValuationModal.tsx'), 'utf-8');
  const op166HedonicResultsSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/HedonicValuationResultsColumn.tsx'), 'utf-8');
  const op166ProvinceModalSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/NationwideProvinceModal.tsx'), 'utf-8');
  const op166ShareModalSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/ShareModal.tsx'), 'utf-8');
  assert.ok(
    op166HedonicModalSrc.includes('اجاره ماهانه معادل: ${toPersianNum(Math.round(valuation.estimatedRahnMillion * 0.03))} م') &&
      op166HedonicModalSrc.includes('(n.distKm * 0.621371).toFixed(1)') &&
      op166HedonicResultsSrc.includes('اجاره ماهانه: {toPersianNum(Math.round(valuation.estimatedRahnMillion * 0.03))} م') &&
      op166ProvinceModalSrc.includes('const avgProvUnit = provHoods.length > 0 ? convertPricePerSqmToUnit(') &&
      op166ProvinceModalSrc.includes('const total80m = h.buyPerSqm * 80;') &&
      (op166ShareModalSrc.includes('معامله v6.4:') || op166ShareModalSrc.includes('سناریو v6.4')) &&
      op166ShareModalSrc.includes('buildNeighborhoodListingSamples(selectedHood)') &&
      op166ShareModalSrc.includes('رهن کامل ${formatAreaShort(80, areaUnit)}:'),
    'HedonicValuationModal, HedonicValuationResultsColumn, NationwideProvinceModal, and ShareModal must expose full OP-166 area unit, imperial distance, and international currency equivalence'
  );
  const op167SecondaryModalsSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/SecondaryModals.tsx'), 'utf-8');
  const op167SmartSuggestSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/SmartSuggestModal.tsx'), 'utf-8');
  const op167PurchasingPowerSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/PurchasingPowerTrendCard.tsx'), 'utf-8');
  const op167AgencyModalSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/AgencyModal.tsx'), 'utf-8');
  assert.ok(
    op167SecondaryModalsSrc.includes('واحد {formatAreaShort(80, areaUnit)}: {toPersianNum((((marketPulse?.marketSummary?.tehranAverageBuyPerSqm || 138) * 80) / 1000).toFixed(1))} میلیارد') &&
      op167SecondaryModalsSrc.includes('🚇 ~{toPersianNum(metroDist)}کم') &&
      op167SmartSuggestSrc.includes('اجاره ماهانه: ${toPersianNum(Math.round(scaledRahn * 0.03))} م') &&
      op167SmartSuggestSrc.includes('فاصله تا کار: ${toPersianNum(n.distKm)} کیلومتر') &&
      op167PurchasingPowerSrc.includes('const total80DeltaMillion = (currentPrice - startPrice) * 80;') &&
      op167PurchasingPowerSrc.includes('(selectedHood.distKm * 0.621371).toFixed(1)') &&
      op167AgencyModalSrc.includes('اجاره ماهانه معادل: {toPersianNum(Math.round(bargainProposedPrice * 0.03))} م') &&
      op167AgencyModalSrc.includes('معادل هر ft²: ${toPersianNum(convertPricePerSqmToUnit(bargainProposedPrice, areaUnit))} م'),
    'SecondaryModals, SmartSuggestModal, PurchasingPowerTrendCard, and AgencyModal must expose full OP-167 area unit, imperial distance, and international currency equivalence'
  );
  const op168BuyerAlertModalsSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/BuyerAlertPwaLegalModals.tsx'), 'utf-8');
  const op168ExpansionModalSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/ExpansionModulesModal.tsx'), 'utf-8');
  const op168OnboardingSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/OnboardingWizardModal.tsx'), 'utf-8');
  const op168PortfolioSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/PortfolioModals.tsx'), 'utf-8');
  assert.ok(
    op168BuyerAlertModalsSrc.includes('رهن ${formatAreaShort(80, areaUnit)}: ${toPersianNum(n.rahn80m)} م · اجاره: ${toPersianNum(Math.round(n.rahn80m * 0.03))} م') &&
      op168BuyerAlertModalsSrc.includes('کل ${formatAreaShort(85, areaUnit)}: ${toPersianNum(((n.buyPerSqm * 85) / 1000).toFixed(1))} میلیارد') &&
      op168ExpansionModalSrc.includes('معادل رهن کامل مبنای کمیسیون ({formatAreaShort(commSqm, areaUnit)}):') &&
      op168ExpansionModalSrc.includes('کل ${formatAreaShort(80, areaUnit)}: ${toPersianNum((((selectedHood?.buyPerSqm || 135) * 80) / 1000).toFixed(1))} میلیارد') &&
      op168OnboardingSrc.includes('formatAreaShort(targetSqm, \'sqft\')') &&
      op168OnboardingSrc.includes('رهن: ${toPersianNum(effectiveRahn)} م') &&
      op168PortfolioSrc.includes('کل {formatAreaShort(80, areaUnit)}: {toPersianNum(((n.buyPerSqm * 80) / 1000).toFixed(1))} میلیارد') &&
      op168PortfolioSrc.includes('رهن دادن واحد جدید به مستأجر (~{toPersianNum(Math.round(selectedHood.rahn80m * (tradeUpTargetSqm / 80)))} م'),
    'BuyerAlertPwaLegalModals, ExpansionModulesModal, OnboardingWizardModal, and PortfolioModals must expose full OP-168 area unit, imperial distance, and international currency equivalence'
  );
  const op169ThresholdAlertsSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/buyerPriceThresholdAlerts.tsx'), 'utf-8');
  const op169SparklineSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/BuyerAlertPriceSparkline.tsx'), 'utf-8');
  const op169LegalAdvisorSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/ContractLegalAdvisorView.tsx'), 'utf-8');
  const op169SponsorTabSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/AgencySponsorReservationTab.tsx'), 'utf-8');
  assert.ok(
    op169ThresholdAlertsSrc.includes('اجاره معادل: ${toPersianNum(Math.round(uSubMax * 0.03))} م') &&
      op169ThresholdAlertsSrc.includes('اجاره معادل: ${toPersianNum(Math.round(uTopObs * 0.03))} م') &&
      op169SparklineSrc.includes('fmtVal(Math.abs(series.endMillion - series.startMillion))') &&
      op169SparklineSrc.includes('کل ${formatAreaShort(80, areaUnit)}: ${toPersianNum(((pt.priceMillion * 80) / 1000).toFixed(1))} میلیارد') &&
      op169LegalAdvisorSrc.includes('مبایعه‌نامه خرید ({formatAreaShort(80, areaUnit)})') &&
      op169LegalAdvisorSrc.includes('ودیعه نمونه ۱.۲ میلیارد ت ≈ ${formatMillionTomanAsIntlCurrency(1200, currency, locale)}') &&
      op169SponsorTabSrc.includes('کل {formatAreaShort(80, areaUnit)}: {toPersianNum(((n.buyPerSqm * 80) / 1000).toFixed(1))} میلیارد') &&
      op169SponsorTabSrc.includes('({formatAreaShort(80, areaUnit)}: {toPersianNum(((n.buyPerSqm * 80) / 1000).toFixed(1))} میلیارد)'),
    'buyerPriceThresholdAlerts, BuyerAlertPriceSparkline, ContractLegalAdvisorView, and AgencySponsorReservationTab must expose full OP-169 area unit and international currency equivalence'
  );
  const op170AdminOverviewSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/AdminOverviewAndModerationTabs.tsx'), 'utf-8');
  const op170AdminMonetizationSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/AdminMonetizationCard.tsx'), 'utf-8');
  const op170AdminAiSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/AdminCloudAiCommerceCenter.tsx'), 'utf-8');
  const op170AdminMcpSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/AdminMcpAndPortabilitySandboxPanel.tsx'), 'utf-8');
  assert.ok(
    op170AdminOverviewSrc.includes('کل {formatAreaShort(80, areaUnit)}: {toPersianNum(((adminEditBuySqm * 80) / 1000).toFixed(1))} میلیارد') &&
      op170AdminOverviewSrc.includes('(اجاره ماهانه: {toPersianNum(Math.round(adminEditRahn80m * 0.03))} م{fxTag(Math.round(adminEditRahn80m * 0.03))})') &&
      op170AdminMonetizationSrc.includes('{n.name} ({areaUnit === \'sqft\' ? \'ft²\' : \'متری\'} {toPersianNum(convertPricePerSqmToUnit(n.buyPerSqm, areaUnit))} م · کل {formatAreaShort(80, areaUnit)}: {toPersianNum(((n.buyPerSqm * 80) / 1000).toFixed(1))} میلیارد):') &&
      op170AdminAiSrc.includes('(کل ${formatAreaShort(80, areaUnit)}: ${toPersianNum(((searchTestResult.structuredQuery.maxBuyPerSqmMillions * 80) / 1000).toFixed(1))} میلیارد)') &&
      op170AdminMcpSrc.includes('سقف قیمت هر متر (میلیون تومان · کل {formatAreaShort(80, areaUnit)}: {toPersianNum(((maxBuyPerSqm * 80) / 1000).toFixed(1))} میلیارد'),
    'AdminOverviewAndModerationTabs, AdminMonetizationCard, AdminCloudAiCommerceCenter, and AdminMcpAndPortabilitySandboxPanel must expose full OP-170 area unit and international currency equivalence'
  );
  const op171LegalStudioSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/LegalContractAndPortfolioStudioModal.tsx'), 'utf-8');
  const op171AgencyCrmSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/AgencyCrmAndAutomationStudioModal.tsx'), 'utf-8');
  const op171BiGisSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/BiRiskAndGeospatialIntelligenceStudioModal.tsx'), 'utf-8');
  const op171EnterpriseSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/EnterpriseAssetFundAndMarketIntelligenceModal.tsx'), 'utf-8');
  assert.ok(
    op171LegalStudioSrc.includes('قیمت ناخالص فروش (میلیون تومان · هر {areaUnit === \'sqft\' ? \'ft²\' : \'متر\'} واحد {formatAreaShort(80, areaUnit)}:') &&
      op171LegalStudioSrc.includes('تعداد دارایی‌های اظهارشده کاربر: {portfolioSummary.eligibleAssetCount} ملک (مجموع متراژ: {formatAreaShort(250, areaUnit)})') &&
      op171AgencyCrmSrc.includes('(هر ${areaUnit === \'sqft\' ? \'ft²\' : \'متر\'} واحد ${formatAreaShort(80, areaUnit)}:') &&
      op171AgencyCrmSrc.includes('(هر {areaUnit === \'sqft\' ? \'ft²\' : \'متر\'} {formatAreaShort(125, areaUnit)}:') &&
      op171BiGisSrc.includes('خط مستقیم تا ورودی: {metroAndPoi.nearestOperationalMetro.straightLineMeters} متر') &&
      op171BiGisSrc.includes('تراکم: {demographicMetrics.densityPersonsPerHectare} نفر/هکتار') &&
      op171EnterpriseSrc.includes('| کل واحد {formatAreaShort(80, areaUnit)}: <strong>{toPersianNum((((b120MarketResult.pricingAndTom.confirmedTransactionDistribution.medianPricePerSqmToman ?? 0) * 80) / 1_000_000_000).toFixed(2))} میلیارد ت') &&
      op171EnterpriseSrc.includes('(کل {formatAreaShort(80, areaUnit)}: {toPersianNum((((b131DeliveryResult.costAndAudits.unitCostMetrics.costPerSqmToman ?? 0) * 80) / 1_000_000_000).toFixed(2))} میلیارد ت)'),
    'LegalContractAndPortfolioStudioModal, AgencyCrmAndAutomationStudioModal, BiRiskAndGeospatialIntelligenceStudioModal, and EnterpriseAssetFundAndMarketIntelligenceModal must expose full OP-171 area unit, imperial distance/density, and international currency equivalence'
  );
  const op172ValuationSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/SuperModulesValuationAndFakeTabs.tsx'), 'utf-8');
  const op172SwapSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/SuperModulesSwapAndStudioTabs.tsx'), 'utf-8');
  const op172LegalSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/SuperModulesLegalAndBuildingTabs.tsx'), 'utf-8');
  const op172ModalShellSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/FutureSuperModulesModal.tsx'), 'utf-8');
  assert.ok(
    op172ValuationSrc.includes('متراژ سندی ({formatAreaValue(valSqm, areaUnit, true)})') &&
      op172ValuationSrc.includes('رهن کامل معادل (اجاره: {toPersianNum(Math.round(valuationResult.fullRahnMillion * 0.03))} م/ماه):') &&
      op172SwapSrc.includes('کل {formatAreaValue(valSqm, areaUnit, true)}: {toPersianNum(((chitgarScoreResult.estimatedFinishedPricePerSqmMillion * valSqm) / 1000).toFixed(2))} میلیارد') &&
      op172SwapSrc.includes("{areaUnit === 'sqft' ? ' / ۰.۹۳ مایل' : ''}") &&
      op172LegalSrc.includes('ودیعه (اجاره: {toPersianNum(Math.round(taxRahnMillion * 0.03))} م/ماه)') &&
      op172LegalSrc.includes('واحد {formatAreaValue(valSqm, areaUnit, true)} از کل {formatAreaValue(valSqm * bldgUnitsCount, areaUnit, true)}') &&
      op172ModalShellSrc.includes('کارشناسی واحد {formatAreaValue(valSqm, areaUnit, true)}: {toPersianNum((valuationResult.fairTotalMillion / 1000).toFixed(2))} میلیارد') &&
      op172ModalShellSrc.includes('کل {formatAreaValue(80, areaUnit, true)}: {toPersianNum(((n.buyPerSqm * 80) / 1000).toFixed(1))} میلیارد'),
    'SuperModulesValuationAndFakeTabs, SuperModulesSwapAndStudioTabs, SuperModulesLegalAndBuildingTabs, and FutureSuperModulesModal must expose full OP-172 area unit, imperial distance, and international currency equivalence'
  );
  const op173TopBarSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/FloatingTopBar.tsx'), 'utf-8');
  const op173SearchDropdownSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/SearchDropdownMenu.tsx'), 'utf-8');
  const op173RankingStripSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/QuickHoodRankingStrip.tsx'), 'utf-8');
  const op173MapLegendSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/MapLegend.tsx'), 'utf-8');
  assert.ok(
    op173TopBarSrc.includes('اجاره ماهانه (رهن کامل معادل: {toPersianNum(deposit + Math.round(monthlyRent / 0.03))} م):') &&
      op173TopBarSrc.includes('formatMillionTomanAsIntlCurrency(deposit, intlCurrency, radarLocale') &&
      op173TopBarSrc.includes("متراژ مورد نظر ({mode === 'rent' ? 'اجاره' : 'خرید'} · {formatAreaShort(targetSqm, areaUnit)}):") &&
      op173SearchDropdownSrc.includes('رهن ${formatAreaShort(80, areaUnit)}: ${toPersianNum(n.rahn80m)} م · اجاره: ${toPersianNum(Math.round(n.rahn80m * 0.03))} م') &&
      op173SearchDropdownSrc.includes('کل: ${formatMillionTomanAsIntlCurrency(n.buyPerSqm * 80, intlCurrency, radarLocale)}') &&
      op173RankingStripSrc.includes('رهن (${formatAreaShort(80, areaUnit)}) ${toPersianNum(hood.rahn80m)} م · اجاره ${toPersianNum(Math.round(hood.rahn80m * 0.03))} م') &&
      op173RankingStripSrc.includes('واحد {formatAreaShort(80, areaUnit)}: <strong className="text-slate-800">{toPersianNum(((cityMarketStats.medianPricePerSqm * 80) / 1000).toFixed(1))} میلیارد</strong>') &&
      op173MapLegendSrc.includes('({formatAreaShort(80, areaUnit)} · ۱۰ م.ت') &&
      op173MapLegendSrc.includes('حلقه‌های شعاعی ۴٫۳ / ۸٫۲ / ۱۲٫۵ کیلومتر تا محل کار'),
    'FloatingTopBar, SearchDropdownMenu, QuickHoodRankingStrip, and MapLegend must expose full OP-173 area unit, metric radial distance, and international currency equivalence'
  );
  const op175InspectorTabsSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/NeighborhoodInspectorTabs.tsx'), 'utf-8');
  const op175BargainsTabsSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/NeighborhoodBargainsAndVotesTabs.tsx'), 'utf-8');
  const op175HedonicModalSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/HedonicValuationModal.tsx'), 'utf-8');
  const op175FakeTabsSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/SuperModulesValuationAndFakeTabs.tsx'), 'utf-8');
  assert.ok(
    op175InspectorTabsSrc.includes('convertPricePerSqmToUnit(agg.askingPricePerSqm, areaUnit)') &&
      op175InspectorTabsSrc.includes('convertPricePerSqmToUnit(agg.estimatedDealPricePerSqm, areaUnit)') &&
      op175InspectorTabsSrc.includes('بازه منطقی محله: {toPersianNum(convertPricePerSqmToUnit(agg.iqrLowPerSqm, areaUnit))} تا {toPersianNum(convertPricePerSqmToUnit(agg.iqrHighPerSqm, areaUnit))}') &&
      op175BargainsTabsSrc.includes('متراژ ({formatAreaShort(anSqm, areaUnit)})') &&
      op175BargainsTabsSrc.includes('formatMillionTomanAsIntlCurrency(fairAskTotal, intlCurrency, radarLocale)') &&
      op175BargainsTabsSrc.includes('formatMillionTomanAsIntlCurrency(fairDealTotal, intlCurrency, radarLocale)') &&
      op175BargainsTabsSrc.includes('convertPricePerSqmToUnit(ab.perSqmMillion, areaUnit)') &&
      op175HedonicModalSrc.includes('(ضریب کیفی ${toPersianNum(qMult)}x)') &&
      op175FakeTabsSrc.includes('استخراج هوشمند مشخصات از متن'),
    'NeighborhoodInspectorTabs, NeighborhoodBargainsAndVotesTabs, HedonicValuationModal, and SuperModulesValuationAndFakeTabs must expose full OP-175 v6.4 area unit, FX, and NLP extraction parity'
  );
  const op176InlineWidgetSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/HedonicInlineWidget.tsx'), 'utf-8');
  const op176ResultsColSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/HedonicValuationResultsColumn.tsx'), 'utf-8');
  const op176CompareModalSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/CompareModal.tsx'), 'utf-8');
  const op176BuyingPowerSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/BuyingPowerSummaryCard.tsx'), 'utf-8');
  assert.ok(
    op176InlineWidgetSrc.includes('رهن کارشناسی: <strong className="text-emerald-700 dark:text-emerald-400 font-extrabold">{toPersianNum(result.estimatedRahnMillion)} م (اجاره: {toPersianNum(Math.round(result.estimatedRahnMillion * 0.03))} م)</strong>') &&
      op176InlineWidgetSrc.includes('<span>بازه منصفانه معامله:</span>') &&
      op176ResultsColSrc.includes('{toPersianNum((valuation.fastSaleTotalMillion / 1000).toFixed(2))} میلیارد{intlCurrency !== \'IRT\' ? ` (${formatMillionTomanAsIntlCurrency(valuation.fastSaleTotalMillion, intlCurrency, radarLocale)})` : \'\'}') &&
      op176ResultsColSrc.includes('{toPersianNum(valuation.estimatedRahnMillion)} میلیون{intlCurrency !== \'IRT\' ? ` (${formatMillionTomanAsIntlCurrency(valuation.estimatedRahnMillion, intlCurrency, radarLocale)})` : \'\'}') &&
      op176CompareModalSrc.includes('convertPricePerSqmToUnit(agg1.estimatedDealPricePerSqm, areaUnit)') &&
      op176BuyingPowerSrc.includes('const dealPerSqm = Math.max(1, agg?.estimatedDealPricePerSqm || hoodPerSqm);'),
    'HedonicInlineWidget, HedonicValuationResultsColumn, CompareModal, and BuyingPowerSummaryCard must expose full OP-176 v6.4 deal price, monthly rent, and primary Toman + FX parity'
  );
  const op177ExpandableCompareSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/ExpandableComparisonTable.tsx'), 'utf-8');
  const op177BudgetBridgeSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/BudgetBridgeAdvisorCard.tsx'), 'utf-8');
  const op177ShortlistMatrixSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/ShortlistMatrixModal.tsx'), 'utf-8');
  const op177ForecastCardSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/SmartPriceForecastCard.tsx'), 'utf-8');
  assert.ok(
    op177ExpandableCompareSrc.includes("id: 'cost_deal'") &&
      op177ExpandableCompareSrc.includes('\'اجاره: \'}${toPersianNum(Math.round(scaledRahnA * 0.03))}م') &&
      op177BudgetBridgeSrc.includes('formatAreaShort(dealAffordableSqm, areaUnit)') &&
      op177ShortlistMatrixSrc.includes('const monthlyRent80m = Math.round(hood.rahn80m * 0.03);') &&
      op177ForecastCardSrc.includes('toPersianNum(projectedDealUnitPrice)'),
    'ExpandableComparisonTable, BudgetBridgeAdvisorCard, ShortlistMatrixModal, and SmartPriceForecastCard must expose full OP-177 v6.4 deal price, monthly rent, and FX parity'
  );
  const op178PortfolioSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/PortfolioModals.tsx'), 'utf-8');
  const op178SecondarySrc = fs.readFileSync(path.join(process.cwd(), 'src/components/SecondaryModals.tsx'), 'utf-8');
  const op178TrendModalSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/NeighborhoodPriceTrendModal.tsx'), 'utf-8');
  const op178ProvinceModalSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/NationwideProvinceModal.tsx'), 'utf-8');
  assert.ok(
    op178PortfolioSrc.includes('${toPersianNum(uDeal)} م') &&
      op178PortfolioSrc.includes('· اجاره: {toPersianNum(Math.round(selectedHood.rahn80m * (tradeUpTargetSqm / 80) * 0.03))} م') &&
      op178SecondarySrc.includes('estimatedDealPricePerSqm') &&
      op178TrendModalSrc.includes('convertPricePerSqmToUnit(liveDealAgg.estimatedDealPricePerSqm, areaUnit)') &&
      op178ProvinceModalSrc.includes('${toPersianNum(uDeal)} م') &&
      op178ProvinceModalSrc.includes('(اجاره: ${toPersianNum(Math.round(h.rahn80m * 0.03))} م)'),
    'PortfolioModals, SecondaryModals, NeighborhoodPriceTrendModal, and NationwideProvinceModal must expose full OP-178 v6.4 deal price, monthly rent, and FX parity'
  );
  const op179SmartSuggestSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/SmartSuggestModal.tsx'), 'utf-8');
  const op179ShareModalSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/ShareModal.tsx'), 'utf-8');
  const op179PurchasingPowerSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/PurchasingPowerTrendCard.tsx'), 'utf-8');
  const op179AgencyModalSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/AgencyModal.tsx'), 'utf-8');
  assert.ok(
    op179SmartSuggestSrc.includes('${toPersianNum(uDeal)} م') &&
      op179ShareModalSrc.includes('buildNeighborhoodListingSamples(selectedHood)') &&
      op179PurchasingPowerSrc.includes('{formatAreaValue(sqmDealToday, areaUnit)}') &&
      op179AgencyModalSrc.includes('${toPersianNum(uDealBench)} م') &&
      op179AgencyModalSrc.includes('· اجاره: ${toPersianNum(Math.round(scaledRahn * 0.03))} م'),
    'SmartSuggestModal, ShareModal, PurchasingPowerTrendCard, and AgencyModal must expose full OP-179 v6.4 deal price, monthly rent, and FX parity'
  );
  const op180ExpansionSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/ExpansionModulesModal.tsx'), 'utf-8');
  const op180SuperModalShellSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/FutureSuperModulesModal.tsx'), 'utf-8');
  const op180SuperValFakeSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/SuperModulesValuationAndFakeTabs.tsx'), 'utf-8');
  const op180SuperSwapSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/SuperModulesSwapAndStudioTabs.tsx'), 'utf-8');
  assert.ok(
    op180ExpansionSrc.includes('${toPersianNum(uDealComm)} م') &&
      op180SuperModalShellSrc.includes('{toPersianNum(uDeal)} م · کل {formatAreaValue(80, areaUnit, true)}:') &&
      op180SuperValFakeSrc.includes('estimatedDealPricePerSqm') &&
      op180SuperSwapSrc.includes('estimatedDealPricePerSqm'),
    'ExpansionModulesModal, FutureSuperModulesModal, SuperModulesValuationAndFakeTabs, and SuperModulesSwapAndStudioTabs must expose full OP-180 v6.4 deal price, area unit, and FX parity'
  );
  const op181SuperLegalSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/SuperModulesLegalAndBuildingTabs.tsx'), 'utf-8');
  const op181OnboardingSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/OnboardingWizardModal.tsx'), 'utf-8');
  const op181BuyerAlertModalsSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/BuyerAlertPwaLegalModals.tsx'), 'utf-8');
  const op181ThresholdAlertsSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/buyerPriceThresholdAlerts.tsx'), 'utf-8');
  assert.ok(
    op181SuperLegalSrc.includes('estimatedDealPricePerSqm') &&
      op181OnboardingSrc.includes('(معامله v6.4: ${toPersianNum(uDeal)} م)') &&
      op181BuyerAlertModalsSrc.includes('{toPersianNum(uDealVal)} م') &&
      op181ThresholdAlertsSrc.includes('${toPersianNum(uDealDefault)} م'),
    'SuperModulesLegalAndBuildingTabs, OnboardingWizardModal, BuyerAlertPwaLegalModals, and buyerPriceThresholdAlerts must expose full OP-181 v6.4 deal price, area unit, and FX parity'
  );
  const op182LegalStudioSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/LegalContractAndPortfolioStudioModal.tsx'), 'utf-8');
  const op182AgencyCrmSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/AgencyCrmAndAutomationStudioModal.tsx'), 'utf-8');
  const op182BiGisSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/BiRiskAndGeospatialIntelligenceStudioModal.tsx'), 'utf-8');
  const op182EnterpriseSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/EnterpriseAssetFundAndMarketIntelligenceModal.tsx'), 'utf-8');
  assert.ok(
    op182LegalStudioSrc.includes('estimatedDealPricePerSqm') &&
      op182AgencyCrmSrc.includes('estimatedDealPricePerSqm') &&
      op182BiGisSrc.includes('estimatedDealPricePerSqm') &&
      op182EnterpriseSrc.includes('estimatedDealPricePerSqm'),
    'LegalContractAndPortfolioStudioModal, AgencyCrmAndAutomationStudioModal, BiRiskAndGeospatialIntelligenceStudioModal, and EnterpriseAssetFundAndMarketIntelligenceModal must expose full OP-182 v6.4 deal price, area unit, and FX parity'
  );
  const op183SparklineSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/BuyerAlertPriceSparkline.tsx'), 'utf-8');
  const op183LegalAdvisorSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/ContractLegalAdvisorView.tsx'), 'utf-8');
  const op183SponsorTabSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/AgencySponsorReservationTab.tsx'), 'utf-8');
  const op183CommuteMatrixSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/CommuteHubsMatrixCard.tsx'), 'utf-8');
  assert.ok(
    op183SparklineSrc.includes('estimatedDealPricePerSqm') &&
      op183SparklineSrc.includes('${toPersianNum(uDealEnd)} ${unitSuffix}') &&
      op183LegalAdvisorSrc.includes('buildNeighborhoodListingSamples(INITIAL_NEIGHBORHOODS[0])).estimatedDealPricePerSqm') &&
      op183SponsorTabSrc.includes('estimatedDealPricePerSqm') &&
      op183CommuteMatrixSrc.includes('buildNeighborhoodListingSamples(selectedHood)'),
    'BuyerAlertPriceSparkline, ContractLegalAdvisorView, AgencySponsorReservationTab, and CommuteHubsMatrixCard must expose full OP-183 v6.4 deal price, area unit, and FX parity'
  );
  const op184PriceChartSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/NeighborhoodPriceChart.tsx'), 'utf-8');
  const op184MonthlyBarSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/NeighborhoodMonthlyBarChart.tsx'), 'utf-8');
  const op184RankingStripSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/QuickHoodRankingStrip.tsx'), 'utf-8');
  const op184SearchDropdownSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/SearchDropdownMenu.tsx'), 'utf-8');
  const op184NaturalMatchesSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/SmartNaturalSearchMatchesSection.tsx'), 'utf-8');
  assert.ok(
    op184PriceChartSrc.includes('{toPersianNum(uDealCur)} م') &&
      op184MonthlyBarSrc.includes('{toPersianNum(unitDealVal)} م') &&
      op184MonthlyBarSrc.includes('{toPersianNum(latestDealUnitPrice)} م') &&
      op184RankingStripSrc.includes('${toPersianNum(unitDeal)} م') &&
      op184SearchDropdownSrc.includes('${toPersianNum(unitDeal)} م') &&
      op184NaturalMatchesSrc.includes('estimatedDealPricePerSqm'),
    'NeighborhoodPriceChart, NeighborhoodMonthlyBarChart, QuickHoodRankingStrip, SearchDropdownMenu, and SmartNaturalSearchMatchesSection must expose full OP-184 v6.4 deal price, area unit, and FX parity'
  );
  const op185ProvinceCtrlSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/TopBarProvinceControl.tsx'), 'utf-8');
  const op185ProvinceDirCtrlSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/TopBarProvinceDirectoryControl.tsx'), 'utf-8');
  const op185HeatmapLazySrc = fs.readFileSync(path.join(process.cwd(), 'src/components/priceHeatmapAndViewportLazy.tsx'), 'utf-8');
  const op185MapLodSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/mapZoomLodAndDeclutter.ts'), 'utf-8');
  const op185AdminOverviewSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/AdminOverviewAndModerationTabs.tsx'), 'utf-8');
  const op185AdminMonetizationSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/AdminMonetizationCard.tsx'), 'utf-8');
  assert.ok(
    op185ProvinceCtrlSrc.includes('{toPersianNum(unitDeal)} م') &&
      op185HeatmapLazySrc.includes('${toPersianNum(unitDeal)} میلیون تومان') &&
      op185MapLodSrc.includes('formatNeighborhoodPriceTruthFa(hood.id') &&
      op185MapLodSrc.includes('${toPersianNum(uClusterDeal)}م') &&
      op185AdminOverviewSrc.includes('estimatedDealPricePerSqm'),
    'Price-bearing province controls, heatmap, map LOD and admin overview must expose the canonical deal-price projection'
  );
  const budgetFitUiSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/listing/BudgetFitVerdict.tsx'), 'utf-8');
  assert.ok(
    budgetFitUiSrc.includes("line.fit === 'fits' ? CheckCircle2") &&
      budgetFitUiSrc.includes("line.fit === 'tight' ? AlertTriangle : XCircle") &&
      budgetFitUiSrc.includes('FitIcon className="w-3.5 h-3.5 shrink-0" aria-hidden="true"') &&
      budgetFitUiSrc.includes('bg-rose-100 text-rose-800'),
    'Budget affordability verdicts must pair persistent text labels with distinct decorative status icons and semantic status colors'
  );
  console.log('[PASS] Buyer Alert Contract & WS-001..WS-005 + OP-DEC-001 Regression Tests Passed.');
});




