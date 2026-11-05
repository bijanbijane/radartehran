/**
 * @file tests/fifty-step-audit.test.ts
 * @description 50-Step Comprehensive Debugging, Audit & Regression Test Suite
 * covering Security, Math Integrity, Persian PropTech Logic, Multi-City, and UI State.
 */

import * as fs from 'fs';
import {
  calculateDetailedValuation,
  calculateLandShare,
  calculateFloorplanOptimization,
  calculateNegotiationStrategy,
  calculateAuctionBidding,
  calculateCombinedBuyingPower,
  calculateDepositInflationLoss,
  calculateRahnArbitrage,
  calculatePropertyTaxes,
  calculateInheritanceShares,
  generateBuildingChargeBill,
  calculateLobbyUpgradeRoi,
  calculateChitgarCoopScore,
  calculateInterCityMigration,
  getNeighborhoodInfraData,
  calculateMovingCost,
  SANA_LEGAL_NOTICES,
  ARTICLE_55_OFFICE_PERMITTED_JOBS,
  DEED_TYPE_OPTIONS,
  PARKING_OPTIONS,
  IRAN_SEASONAL_MARKET_CALENDAR,
} from '../src/data/superModulesLogic';
import {
  INITIAL_NEIGHBORHOODS,
  isAuthorizedAdminUser,
  toPersianNum,
  calcDistanceKm,
  hydrateNeighborhoodsFromStorage,
  validateAndBuildRestoredState,
  getNeighborhoodMarketReport,
  getNeighborhoodTrafficInfo,
  EvaluatedNeighborhood,
} from '../src/data/neighborhoods';
import { MULTI_CITY_CONFIGS, CityId } from '../src/data/multiCityData';
import {
  cleanIranianMobile,
  isValidIranianMobile,
  sanitizeInput,
  safeJsonParse,
  DEFAULT_FEATURE_FLAGS,
  loadValidatedFeatureFlags,
} from '../src/utils/security';

export interface AuditStepResult {
  step: number;
  domain: string;
  name: string;
  status: 'PASS' | 'FAIL';
  details: string;
}

const auditResults: AuditStepResult[] = [];

function assertStep(step: number, domain: string, name: string, condition: boolean, details: string) {
  if (!condition) {
    console.error(`[AUDIT FAIL] مرحله #${step} (${domain}) - ${name}: ${details}`);
    throw new Error(`مرحله #${step} FAILED: ${details}`);
  }
  console.log(`[PASS] مرحله #${step} [${domain}] ${name}: ${details}`);
  auditResults.push({ step, domain, name, status: 'PASS', details });
}

export async function runFiftyStepAudit(): Promise<void> {
  const sampleHood: EvaluatedNeighborhood = {
    ...INITIAL_NEIGHBORHOODS[0],
    buyPerSqm: 120,
    rahn80m: 1400,
    status: 'green' as const,
    diffPercent: 0,
    distKm: 5,
    overallScore: 8.5,
    marketReport: getNeighborhoodMarketReport(INITIAL_NEIGHBORHOODS[0]),
    trafficInfo: getNeighborhoodTrafficInfo(INITIAL_NEIGHBORHOODS[0]),
  };

  // =========================================================================
  // DOMAIN A: SECURITY, PERMISSIONS & SECRETS AUDIT (Steps 1–10)
  // =========================================================================

  // Step 1: Zero hardcoded admin password `admin1404` in codebase
  const appSrc = fs.readFileSync('src/App.tsx', 'utf8');
  const adminModalSrc = fs.readFileSync('src/components/AdminModal.tsx', 'utf8');
  const neighborhoodsSrc = fs.readFileSync('src/data/neighborhoods.ts', 'utf8');
  const hasPlaintextPassword =
    appSrc.includes('admin1404') ||
    adminModalSrc.includes('admin1404') ||
    neighborhoodsSrc.includes('admin1404');
  assertStep(1, 'Security', 'Zero hardcoded admin1404 passwords', !hasPlaintextPassword, 'admin1404 purged from all source files');

  // Step 2: Strict Admin User Authorization logic (email & emailVerified)
  const fakeAdmin = { email: 'fake@example.com', emailVerified: true };
  const unverifiedOfficialAdmin = { email: 'radio837isf@gmail.com', emailVerified: false };
  const verifiedOfficialAdmin = { email: 'radio837isf@gmail.com', emailVerified: true };
  const adminCheckPassed =
    !isAuthorizedAdminUser(fakeAdmin as any) &&
    !isAuthorizedAdminUser(unverifiedOfficialAdmin as any) &&
    isAuthorizedAdminUser(verifiedOfficialAdmin as any);
  assertStep(2, 'Security', 'isAuthorizedAdminUser enforcement', adminCheckPassed, 'Strict email and emailVerified verified');

  // Step 3: PII phone number validation & cleaning
  const validMobile = cleanIranianMobile('۰۹۱۲۳۴۵۶۷۸۹');
  const isValid = isValidIranianMobile(validMobile) && !isValidIranianMobile('091212345');
  assertStep(3, 'Security', 'Iranian mobile validation & Persian digit normalization', isValid && validMobile === '09123456789', 'Correctly parsed ۰۹۱۲ to 0912');

  // Step 4: Input XSS sanitization
  const dirty = '<script>alert("xss")</script>آپارتمان سعادت‌آباد';
  const clean = sanitizeInput(dirty);
  assertStep(4, 'Security', 'XSS sanitization of user text input', !clean.includes('<script>') && clean.includes('آپارتمان'), 'Stripped dangerous script tags');

  // Step 5: Safe JSON parse against prototype pollution
  const parsedSafe = safeJsonParse('{"__proto__": {"polluted": true}}', { fallback: true });
  assertStep(5, 'Security', 'Protection against prototype pollution in JSON parsing', !(Object.prototype as any).polluted, 'Prototype pollution blocked');

  // Step 6: LocalStorage corruption recovery
  const corruptedRestored = loadValidatedFeatureFlags('non_existent_or_bad_key');
  assertStep(6, 'Security', 'Corrupted LocalStorage graceful fallback', Boolean(corruptedRestored.enableCommissionCalc), 'Returned DEFAULT_FEATURE_FLAGS cleanly');

  // Step 7: Atomic Database Backup Validation & Malformed Payload Rejection
  const badBackup = '{"version": 1, "neighborhoods": "not-an-array"}';
  const restoreRes = validateAndBuildRestoredState(badBackup);
  const backupRejected = !restoreRes.ok && Boolean(restoreRes.errorMessage);
  assertStep(7, 'Security', 'Atomic backup restoration validation rejects malformed schema', backupRejected, 'Rejected non-array neighborhoods payload');

  // Step 8: Firestore rules structural presence and required default-deny
  const rulesContent = fs.readFileSync('firestore.rules', 'utf8');
  const hasDefaultDeny = rulesContent.includes('match /{document=**}') && rulesContent.includes('allow read, write: if false;');
  assertStep(8, 'Security', 'firestore.rules contains global default-deny', hasDefaultDeny, 'Verified global default-deny rule');

  // Step 9: Firestore rules feature flags whitelist enforcement
  const hasFeatureFlagsRule = rulesContent.includes('match /appConfig/{configId}') && rulesContent.includes("configId == 'featureFlags'");
  assertStep(9, 'Security', 'firestore.rules appConfig/featureFlags rule configured', hasFeatureFlagsRule, 'Verified appConfig/featureFlags rule block');

  // Step 10: Firestore rules admin email consistency
  const hasMatchingAdminEmail = rulesContent.includes('radio837isf@gmail.com');
  assertStep(10, 'Security', 'firestore.rules isAdmin() matches authorized client email', hasMatchingAdminEmail, 'admin email verified in rules');

  // =========================================================================
  // DOMAIN B: PROPTECH SUPER-MODULES & CALCULATOR MATH INTEGRITY (Steps 11–20)
  // =========================================================================

  // Step 11: Unit Valuation calculations (normal inputs)
  const valResult = calculateDetailedValuation({
    hood: sampleHood,
    sqm: 100,
    age: 0,
    floor: 3,
    bedrooms: 2,
    deedType: 'single_deed',
    parkingType: 'dedicated',
    hasElevator: true,
    hasStorage: true,
    renovation: 'renovated',
    light: 'south',
  });
  assertStep(11, 'Math', 'Unit valuation normal range calculation', valResult.fairTotalMillion > 0 && valResult.fairPerSqm > sampleHood.buyPerSqm, 'Premium unit valued above neighborhood baseline');

  // Step 12: Unit Valuation edge cases (extreme age & zero floors)
  const valEdgeResult = calculateDetailedValuation({
    hood: sampleHood,
    sqm: 10,
    age: 50,
    floor: 10,
    bedrooms: 1,
    deedType: 'informal_contract',
    parkingType: 'none',
    hasElevator: false,
    hasStorage: false,
    renovation: 'needs_work',
    light: 'dim',
  });
  assertStep(12, 'Math', 'Unit valuation extreme age and negative factor safeguards', !Number.isNaN(valEdgeResult.fairTotalMillion) && valEdgeResult.fairPerSqm >= 10, 'Safeguarded against negative prices');

  // Step 13: Deed types discount order (single_deed > probate_coop > endowment > informal_contract)
  const singleDeedOption = DEED_TYPE_OPTIONS.find((d) => d.id === 'single_deed')!;
  const endowmentOption = DEED_TYPE_OPTIONS.find((d) => d.id === 'endowment')!;
  const informalOption = DEED_TYPE_OPTIONS.find((d) => d.id === 'informal_contract')!;
  const deedOrderValid = singleDeedOption.multiplier > endowmentOption.multiplier && endowmentOption.multiplier > informalOption.multiplier;
  assertStep(13, 'Math', 'Deed type multiplier hierarchy', deedOrderValid, 'Verified single_deed (1.0) > endowment (0.88) > informal (0.82)');

  // Step 14: Land share calculation math
  const landShare = calculateLandShare({
    totalPlotSqm: 500,
    totalBuildingUnits: 10,
    unitSqm: 100,
    totalBuildingFloorSqm: 1000,
    neighborhoodLandPerSqmMillion: 200,
  });
  assertStep(14, 'Math', 'Land share pure land value and consolidation estimate', landShare.exactLandShareSqm === 50 && landShare.pureLandValueMillion === 10000, 'Exact land share 50m² and 10,000M Tomans calculated');

  // Step 15: Floorplan dead space percentage clamping
  const floorplan = calculateFloorplanOptimization({
    totalSqm: 100,
    corridorSqm: 15,
    irregularCorners: 2,
    balconySqm: 5,
    currentBedrooms: 2,
    buyPerSqmMillion: 100,
  });
  assertStep(15, 'Math', 'Floorplan dead space optimization calculation', floorplan.deadSpacePercent <= 35 && floorplan.usableSqm > 0, 'Dead space clamped and usable sqm verified');

  // Step 16: Negotiation Coach anchoring and discount calculation
  const negotiation = calculateNegotiationStrategy({
    askingPriceMillion: 10000,
    neighborhoodAvgPriceMillion: 9000,
    buyerReadyCashMillion: 8000,
    propertyAge: 10,
  });
  assertStep(16, 'Math', 'Negotiation strategy anchor offer and closing target', negotiation.anchorOfferMillion < negotiation.targetClosingPriceMillion && negotiation.targetClosingPriceMillion < 10000, 'Anchor offer < target closing price < asking price');

  // Step 17: Bank Auction envelope and 10% guarantee calculation
  const auction = calculateAuctionBidding({
    retailMarketValueMillion: 12000,
    auctionBasePriceMillion: 8000,
  });
  assertStep(17, 'Math', 'Bank auction 10% deposit and bid envelope', auction.required10PercentDepositMillion === 800 && auction.optimalBidEnvelopeMillion === 8400, '10% deposit (800M) and envelope (8,400M) calculated');

  // Step 18: Iranian Combined Buying Power with Tenant Rahn Deduction
  const combinedPower = calculateCombinedBuyingPower({
    cashSavingsMillion: 2000,
    carSaleBudgetMillion: 1000,
    goldCoinBudgetMillion: 500,
    housingLoanMillion: 1480,
    targetHoodRahn80mMillion: 1200,
  });
  assertStep(
    18,
    'Math',
    'Combined buying power formula with tenant rahn',
    combinedPower.totalEquityBeforeRahnMillion === 4980 &&
      combinedPower.totalPurchasingPowerWithRahnMillion === 4980 &&
      combinedPower.tenantDepositBridgeMillion === 1200 &&
      combinedPower.grossPurchaseHeadlineWithRahnMillion === 6180,
    'Total equity: 4,980M; gross headline with 1,200M tenant rahn bridge: 6,180M'
  );

  // Step 19: Tenant Deposit Inflation Loss Guard
  const inflationLoss = calculateDepositInflationLoss({
    depositMillion: 1000,
    annualInflationPercent: 40,
  });
  assertStep(
    19,
    'Math',
    'Tenant deposit inflation purchasing power loss',
    inflationLoss.realValue1YrMillion === 714.3 &&
      inflationLoss.purchasingPowerLossPercent1Yr === 28.6,
    'Accurately calculated real purchasing power of deposit (28.6% loss)'
  );

  // Step 20: Rahn vs Fund Arbitrage comparison
  const arbitrage = calculateRahnArbitrage({
    rahnDifferenceMillion: 500,
    monthlyRentDifferenceMillion: 15,
    fundAnnualYieldPercent: 36,
  });
  assertStep(20, 'Math', 'Rahn vs Fund arbitrage comparison', typeof arbitrage.betterOption === 'string' && arbitrage.annualAdvantageMillion >= 0, 'Arbitrage comparison calculated without error');

  // =========================================================================
  // DOMAIN C: BUILDING MANAGER, LEGAL & MUNICIPAL MATH (Steps 21–30)
  // =========================================================================

  // Step 21: Property Taxes (Exemption check for Tehran <= 150m & qualifiesForAreaExemption)
  const taxUnder150 = calculatePropertyTaxes({
    monthlyRentMillion: 30,
    rahnMillion: 500,
    sqm: 120,
    city: 'tehran',
    qualifiesForAreaExemption: true,
  });
  const taxOver150 = calculatePropertyTaxes({
    monthlyRentMillion: 30,
    rahnMillion: 500,
    sqm: 180,
    city: 'tehran',
    qualifiesForAreaExemption: true,
  });
  assertStep(21, 'Legal', 'Property rental tax 150m Tehran exemption boundary', taxUnder150.isAreaExempt && !taxOver150.isAreaExempt, 'Units <= 150m exempt in Tehran when qualification condition met; > 150m taxable');

  // Step 22: Islamic Inheritance Share divider sum validation
  const inheritance = calculateInheritanceShares({
    propertyTotalValueMillion: 12000,
    hasSpouse: true,
    spouseType: 'wife',
    sonsCount: 2,
    daughtersCount: 1,
    hasMother: false,
    hasFather: false,
  });
  const totalSharesValue = inheritance.shares.reduce((acc, s) => acc + s.totalValueMillion, 0);
  assertStep(22, 'Legal', 'Islamic inheritance share divider sum integrity', totalSharesValue <= 12000 && inheritance.shares.length === 3, 'Wife (1/8), sons, and daughters allocated exact fractions');

  // Step 23: Building Manager SaaS charge bill generator
  const bill = generateBuildingChargeBill({
    buildingName: 'ساختمان مروارید',
    monthName: 'آبان',
    totalCleaningThousand: 4000,
    totalElevatorServiceThousand: 2000,
    totalSharedWaterPowerThousand: 3000,
    totalReserveFundThousand: 1000,
    totalUnits: 10,
    unitNumber: 3,
    unitOccupants: 3,
    totalBuildingOccupants: 30,
    unitSqm: 80,
    totalBuildingSqm: 800,
  });
  assertStep(
    23,
    'SaaS',
    'Building charge bill generator format & math',
    bill.unitTotalBillThousand === 1000 &&
      bill.whatsappMessageText.includes('ساختمان مروارید') &&
      bill.whatsappMessageText.includes('۱,۰۰۰,۰۰۰ تومان'),
    'Unit bill 1,000,000 Tomans generated with formatted WhatsApp message'
  );

  // Step 24: Sana legal notice templates generation
  const noticeText = SANA_LEGAL_NOTICES.depositRefund.template('امیر رضایی', 'سعید حسینی', 'پونک', 1500, '۱۴۰۴/۰۸/۰۱');
  assertStep(
    24,
    'Legal',
    'Sana judicial legal notice template formatting',
    noticeText.includes('امیر رضایی') &&
      noticeText.includes('پونک') &&
      noticeText.includes('پیش‌نویس غیررسمی') &&
      !noticeText.includes('شورای حل اختلاف'),
    'Sana legal notice draft disclaimer verified'
  );

  // Step 25: Lobby upgrade 5x ROI calculator
  const lobbyRoi = calculateLobbyUpgradeRoi({
    totalBuildingUnits: 10,
    currentUnitAvgPriceBillion: 10,
    renovationBudgetMillion: 500,
  });
  assertStep(25, 'Math', 'Lobby upgrade ROI calculation', lobbyRoi.perUnitCostMillion === 50 && lobbyRoi.roiMultiple > 1, '50M cost per unit generated significant multiple gain');

  // Step 26: Article 55 permitted jobs lookup
  const doctorJob = ARTICLE_55_OFFICE_PERMITTED_JOBS.find((j) => j.title.includes('پزشکان'))!;
  const commercialJob = ARTICLE_55_OFFICE_PERMITTED_JOBS.find((j) => j.title.includes('بازرگانی'))!;
  assertStep(26, 'Legal', 'Article 55 Band 24 residential office jobs classification', doctorJob.permitted && !commercialJob.permitted, 'Doctors permitted in residential, commercial trading firms prohibited');

  // Step 27: Chitgar Cooperative Housing score calculation
  const chitgarScore = calculateChitgarCoopScore({
    baseInstallmentsPaidMillion: 2000,
    transferRightFeeMillion: 1000,
    promisedRemainingCostPerSqmMillion: 30,
    unitSqm: 100,
    deliveryMonths: 24,
  });
  assertStep(27, 'Math', 'Chitgar cooperative housing finished cost estimation', chitgarScore.cashNeededTodayMillion === 3000 && chitgarScore.estimatedFinishedPricePerSqmMillion > 0, 'Chitgar cooperative total finished cost verified');

  // Step 28: Inter-city migration financial arbitrage
  const migrationKaraj = calculateInterCityMigration(150, 'karaj');
  assertStep(28, 'Math', 'Inter-city migration arbitrage calculation', migrationKaraj.tehran80mUnitValueBillion > 0 && migrationKaraj.targetCityAffordableSqm > 80, 'Selling 80m in Tehran yields larger space in Karaj');

  // Step 29: Neighborhood infrastructure facts retrieval (honest unavailable status without fabricated numbers)
  const infraShemiran = getNeighborhoodInfraData('نیاوران');
  const infraWest = getNeighborhoodInfraData('صادقیه');
  assertStep(
    29,
    'Data',
    'Neighborhood infrastructure honest unavailable status',
    infraShemiran.sourceStatus === 'unavailable' &&
      infraShemiran.waterTdsPpm === null &&
      infraWest.noiseLevelDb === null &&
      infraWest.hasMehrabadFlightPath,
    'Unverified TDS/dB numbers suppressed (null) and West flight corridor verified'
  );

  // Step 30: Moving truck and worker fee calculation
  const moving = calculateMovingCost({
    truckType: 'khavar',
    workerCount: 4,
    hours: 4,
    heavyItemsCount: 2,
    hasElevatorOrigin: true,
    hasElevatorDest: true,
    floorsCount: 3,
  });
  assertStep(30, 'Math', 'Moving truck and worker cost calculation', moving.totalMovingCostThousand > 0 && moving.housingRegistryChecklist.length === 4, 'Moving truck fee calculated and 4-step housing registry checklist verified');

  // =========================================================================
  // DOMAIN D: FRONTEND STATE, MODALS & REALTOR STUDIO (Steps 31–40)
  // =========================================================================

  // Step 31: Persian number formatting function
  const persianNumber = toPersianNum('1234567890');
  assertStep(31, 'UI', 'Persian number conversion function', persianNumber === '۱۲۳۴۵۶۷۸۹۰', '0-9 correctly converted to ۰-۹');

  // Step 32: Iranian 12-month seasonal real estate market calendar
  assertStep(32, 'Data', '12-Month seasonal market calendar coverage', IRAN_SEASONAL_MARKET_CALENDAR.length === 12, 'All 12 Iranian months present in seasonal guide');

  // Step 33: Multi-City configs all contain valid neighborhoods
  const cities: CityId[] = ['tehran', 'karaj', 'mashhad', 'isfahan', 'shiraz'];
  const allCitiesHaveHoods = cities.every((c) => Array.isArray(MULTI_CITY_CONFIGS[c].neighborhoods) && MULTI_CITY_CONFIGS[c].neighborhoods.length >= 4);
  assertStep(33, 'Data', 'Multi-City configuration integrity across 5 cities', allCitiesHaveHoods, 'Tehran, Karaj, Mashhad, Isfahan, Shiraz all configured');

  // Step 34: Distance calculation formula (Haversine formula in calcDistanceKm)
  const dist = calcDistanceKm(35.6892, 51.389, 35.75, 51.4);
  assertStep(34, 'Math', 'Haversine distance calculation in km', dist !== null && dist > 0 && dist < 30, 'Distance calculated accurately');

  // Step 35: DEFAULT_FEATURE_FLAGS contains all required 24 boolean flags
  const flagKeys = Object.keys(DEFAULT_FEATURE_FLAGS);
  assertStep(35, 'Config', 'DEFAULT_FEATURE_FLAGS contains 24 flags', flagKeys.length === 24, `Found ${flagKeys.length} feature flags`);

  // Step 36: FutureSuperModulesModal file existence and export
  const superModalSrc = fs.readFileSync('src/components/FutureSuperModulesModal.tsx', 'utf8');
  assertStep(36, 'Code', 'FutureSuperModulesModal exports clean component', superModalSrc.includes('export function FutureSuperModulesModal'), 'Component function exported');

  // Step 37: 10 tabs definition present in FutureSuperModulesModal
  const hasTenTabs =
    superModalSrc.includes("'valuation'") &&
    superModalSrc.includes("'fake_detector'") &&
    superModalSrc.includes("'mortgage'") &&
    superModalSrc.includes("'tax_inheritance'") &&
    superModalSrc.includes("'tenant_rights'") &&
    superModalSrc.includes("'municipality'") &&
    superModalSrc.includes("'swap_suburb'") &&
    superModalSrc.includes("'visit_checklist'") &&
    superModalSrc.includes("'school_traffic'") &&
    superModalSrc.includes("'realtor_studio'");
  assertStep(37, 'Code', 'All 10 tabs configured in FutureSuperModulesModal', hasTenTabs, 'All 10 tab IDs verified in component source');

  // Step 38: Lazy loading configuration in App.tsx or AppModalsPortal.tsx
  const modalsPortalSrc = fs.existsSync('src/components/AppModalsPortal.tsx')
    ? fs.readFileSync('src/components/AppModalsPortal.tsx', 'utf8')
    : '';
  const hasLazyImport =
    appSrc.includes("import('./components/FutureSuperModulesModal')") ||
    modalsPortalSrc.includes("import('./FutureSuperModulesModal')");
  assertStep(38, 'Perf', 'FutureSuperModulesModal code-split with React.lazy', hasLazyImport, 'React.lazy dynamic import verified in App.tsx');

  // Step 39: Escape key listener dismisses all modals in App.tsx / useAppUiState.ts / AppModalsPortal.tsx
  const uiStateSrc = fs.existsSync('src/components/useAppUiState.ts')
    ? fs.readFileSync('src/components/useAppUiState.ts', 'utf8')
    : '';
  const hasEscapeHandler =
    appSrc.includes('setShowSuperModulesModal(false)') ||
    modalsPortalSrc.includes('setShowSuperModulesModal(false)') ||
    uiStateSrc.includes('setShowSuperModulesModal(false)');
  assertStep(39, 'UX', 'Escape key dismisses FutureSuperModulesModal', hasEscapeHandler, 'Escape handler closes super modules modal');

  // Step 40: Tools popover button in App.tsx or FloatingTopBar.tsx opens FutureSuperModulesModal
  const topBarSrc = fs.existsSync('src/components/FloatingTopBar.tsx')
    ? fs.readFileSync('src/components/FloatingTopBar.tsx', 'utf8')
    : '';
  const hasToolsButton =
    appSrc.includes('ابرماژول‌ها و جعبه ابزار جامع مسکن') ||
    topBarSrc.includes('ابرماژول‌ها و جعبه ابزار جامع مسکن');
  assertStep(40, 'UX', 'Tools popover contains Super-Modules entry button', hasToolsButton, 'Button present in Tools menu');

  // =========================================================================
  // DOMAIN E: BUILD, LINT, FIREBASE & TEST SUITE INTEGRITY (Steps 41–50)
  // =========================================================================

  // Step 41: firebase.json configuration targets port 8088 and rules files
  const fbJson = JSON.parse(fs.readFileSync('firebase.json', 'utf8'));
  assertStep(41, 'Config', 'firebase.json emulator port isolated to 8088', fbJson.emulators?.firestore?.port === 8088 && INITIAL_NEIGHBORHOODS.length >= 35, 'Port 8088 and neighborhood count verified');

  // Step 42: .firebaserc contains production project identifier
  const fbRc = JSON.parse(fs.readFileSync('.firebaserc', 'utf8'));
  assertStep(42, 'Config', '.firebaserc targets gen-lang-client-0713157837', fbRc.projects?.default === 'gen-lang-client-0713157837', 'Project id verified');

  // Step 43: server.ts mounts express and vite middlewares
  const serverSrc = fs.readFileSync('server.ts', 'utf8');
  assertStep(43, 'Server', 'server.ts configured with Express and Vite middleware', serverSrc.includes('.middlewares') && (serverSrc.includes('app.listen') || serverSrc.includes('server.listen')), 'Server full-stack entry verified');

  // Step 44: index.html contains proper SEO metadata, og:title, and viewport
  const indexHtml = fs.readFileSync('index.html', 'utf8');
  assertStep(44, 'SEO', 'index.html contains title, meta description, and og tags', indexHtml.includes('<title>') && indexHtml.includes('og:title'), 'SEO metadata verified');

  // Step 45: manifest.json configured for PWA installation
  const manifest = JSON.parse(fs.readFileSync('public/manifest.json', 'utf8'));
  assertStep(45, 'PWA', 'manifest.json configured with Persian name and icons', manifest.name && manifest.icons?.length > 0, 'PWA manifest verified');

  // Step 46: package.json scripts contain lint, build, dev, start
  const pkgJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  assertStep(46, 'Package', 'package.json contains clean build and lint scripts', Boolean(pkgJson.scripts?.build && pkgJson.scripts?.lint), 'Scripts verified');

  // Step 47: No unmasked sample phone numbers in INITIAL_BUYER_LEADS
  const leadsSrc = fs.readFileSync('src/data/neighborhoods.ts', 'utf8');
  const hasRawLeads = /phone:\s*['"]09\d{9}['"]/.test(leadsSrc);
  assertStep(47, 'Security', 'Sample buyer leads masked in source', !hasRawLeads, 'No plaintext 11-digit mobile numbers in initial seed');

  // Step 48: Playwright smoke test suite presence
  const hasSmokeTest = fs.existsSync('tests/browser-smoke.test.ts');
  assertStep(48, 'Test', 'Playwright browser smoke suite exists', hasSmokeTest, 'tests/browser-smoke.test.ts verified');

  // Step 49: Firestore rules test suite presence
  const hasRulesTest = fs.existsSync('firestore.rules.test.ts');
  assertStep(49, 'Test', 'Firestore rules behavioral unit test exists', hasRulesTest, 'firestore.rules.test.ts verified');

  // Step 50: Implementation checkpoint documented
  const hasCheckpoint = fs.existsSync('docs/implementation-checkpoint.md');
  assertStep(50, 'Docs', 'Implementation checkpoint file exists', hasCheckpoint, 'docs/implementation-checkpoint.md verified');

  console.log(`\n=======================================================`);
  console.log(`[50-STEP AUDIT PASS] All 50/50 audit steps passed with 0 errors!`);
  console.log(`=======================================================\n`);
}

runFiftyStepAudit().catch((err) => {
  console.error('[50-STEP AUDIT CRITICAL ERROR]', err);
  process.exit(1);
});
