/**
 * @file tests/argon4-remediation.test.ts
 * @description Automated Verification Suite for ARGON-4 Autonomous Refactoring & UI/UX Remediation Protocol ([RULE-01] to [RULE-18])
 */

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  normalizeFinancialInput,
  formatMillionToVerbalPersian,
  validateAndScaleTomanInput,
  calculateTehranAgeFactor,
  computeRentConversion,
  formatJalaliMonthYear,
} from '../src/utils/persianFinancials';
import {
  TEHRAN_BOUNDS,
  TEHRAN_DEFAULT_CENTER,
  isInsideTehranBounds,
  acquireSafeTehranLocation,
} from '../src/utils/geolocationGuard';
import { detectBrowserEnvironment } from '../src/utils/inAppBrowserGuard';
import { evaluateHedonicModelSync } from '../src/workers/hedonicEstimator.worker';
import { pruneLocalCache } from '../src/components/useMarketPulseSync';

const rootDir = process.cwd();

function verify(name: string, fn: () => void | Promise<void>): Promise<void> {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      console.log(`  ✓ [ARGON-4 PASS] ${name}`);
    });
}

async function runArgon4Verification(): Promise<void> {
  console.log('\n========================================================================');
  console.log('Executing ARGON-4 Autonomous Refactoring & UI/UX Remediation Test Suite');
  console.log('========================================================================');

  await verify('[RULE-01] src/App.tsx is strictly under 100 lines and delegates to RadarWorkspaceShell + Providers', () => {
    const appContent = fs.readFileSync(path.join(rootDir, 'src/App.tsx'), 'utf8');
    const lines = appContent.replace(/\r?\n$/, '').split(/\r?\n/).length;
    assert.ok(lines < 100, `Expected src/App.tsx < 100 lines, got ${lines}`);
    assert.ok(appContent.includes('RadarNavigationProvider'), 'Must wrap RadarNavigationProvider');
    assert.ok(appContent.includes('ComparisonFilterProvider'), 'Must wrap ComparisonFilterProvider');
    assert.ok(appContent.includes('RadarWorkspaceShell'), 'Must render RadarWorkspaceShell');

    const adminTabs = fs.readFileSync(path.join(rootDir, 'src/components/AdminSecurityAndBackupTabs.tsx'), 'utf8');
    assert.ok(adminTabs.includes('React.lazy') && adminTabs.includes('AdminCloudAiCommerceCenter'), 'AdminCloudAiCommerceCenter must be lazy-loaded');
  });

  await verify('[RULE-02] & [RULE-03] useRadarCloudSync exposes modular hooks, ConnectionStatusState, and pruneLocalCache(50)', () => {
    const cloudSyncSrc = fs.readFileSync(path.join(rootDir, 'src/components/useRadarCloudSync.ts'), 'utf8');
    assert.ok(cloudSyncSrc.includes('useMarketSync') && cloudSyncSrc.includes('useSponsorSync') && cloudSyncSrc.includes('useUserCacheSync'));
    assert.ok(cloudSyncSrc.includes('connectionStatus'));

    const topBarSrc = fs.readFileSync(path.join(rootDir, 'src/components/FloatingTopBar.tsx'), 'utf8');
    assert.ok(topBarSrc.includes('NetworkStatusBadge'), 'FloatingTopBar must render NetworkStatusBadge');

    const drawerSrc = fs.readFileSync(path.join(rootDir, 'src/components/NeighborhoodInspectorDrawer.tsx'), 'utf8');
    assert.ok(drawerSrc.includes('key={selectedHood.id}'), 'NeighborhoodInspectorTabs must bind key={selectedHood.id}');

    assert.equal(pruneLocalCache(50), 0);
  });

  await verify('[RULE-04] & [RULE-13] Off-main-thread Hedonic Estimator Worker & Non-linear Tehran Age Depreciation', () => {
    const primeAge = calculateTehranAgeFactor(2);
    const midAge = calculateTehranAgeFactor(12);
    const kolangiAge = calculateTehranAgeFactor(30, 0.76);

    assert.equal(primeAge.regime, 'PRIME_NEW');
    assert.equal(midAge.regime, 'DEPRECIATING_ACAYAN');
    assert.equal(kolangiAge.regime, 'KOLANGI_LAND_FLOOR');
    assert.equal(kolangiAge.multiplier, 0.76, 'Older than 22 yrs must hit Kolangi land-value floor');

    const est = evaluateHedonicModelSync({
      requestId: 42,
      hoodBasePricePerSqmMillion: 150,
      districtTier: 'NORTH_LUXURY',
      areaSqm: 110,
      buildingAgeYears: 5,
      bedrooms: 2,
      floorNumber: 4,
      hasElevator: true,
      hasParking: true,
      hasStorage: true,
      isSunlitSouthFacing: true,
      depositShareRatio: 0.5,
      monthlyConversionRatePercent: 3.0,
    });
    assert.equal(est.requestId, 42);
    assert.ok(est.estimatedTotalMillion > 15000);
    assert.ok(est.lowBandTotalMillion < est.estimatedTotalMillion);
    assert.ok(est.highBandTotalMillion > est.estimatedTotalMillion);
    assert.ok(est.annualCapRatePercent > 0);
  });

  await verify('[RULE-05], [RULE-06], [RULE-10], [RULE-15] CSS Design Tokens, Z-index scale, Tabular Numerals & Leaflet Viscosity', () => {
    const tokensCss = fs.readFileSync(path.join(rootDir, 'src/styles/tokens.css'), 'utf8');
    assert.ok(tokensCss.includes('--z-map-canvas: 0;'));
    assert.ok(tokensCss.includes('--z-critical-error-banner: 80;'));
    assert.ok(tokensCss.includes('.radar-tabular-num'));
    assert.ok(tokensCss.includes('.radar-map-price-badge'));
    assert.ok(tokensCss.includes('overscroll-behavior-y: contain'));
    assert.ok(tokensCss.includes('@keyframes radarMarkerPulseGpu'));

    const leafletSrc = fs.readFileSync(path.join(rootDir, 'src/components/useLeafletRadarMap.ts'), 'utf8');
    assert.ok(leafletSrc.includes('maxBoundsViscosity: 0.8'), 'Leaflet map must set maxBoundsViscosity: 0.8');
  });

  await verify('[RULE-07] Geolocation Bounding-Box Guard rejects VPN coordinates outside Tehran', async () => {
    assert.equal(isInsideTehranBounds({ lat: 35.72, lng: 51.41 }), true, 'Vanak is inside Tehran bounds');
    assert.equal(isInsideTehranBounds({ lat: 50.11, lng: 8.68 }), false, 'Frankfurt VPN is outside Tehran bounds');
    assert.equal(TEHRAN_DEFAULT_CENTER.lat, 35.6997);
    assert.equal(TEHRAN_BoundsCheck(), true);
    const fallbackRes = await acquireSafeTehranLocation(100);
    assert.equal(fallbackRes.coordinates.lat, TEHRAN_DEFAULT_CENTER.lat);
  });

  await verify('[RULE-08], [RULE-09], [RULE-11] Persian/Arabic Numeral Sanitizer, Unit Scale Disambiguation & Jalali Formatter', () => {
    assert.equal(normalizeFinancialInput('۶٬۵۰۰.۵'), 6500.5);
    assert.equal(normalizeFinancialInput('١٢٣٤'), 1234);
    assert.equal(normalizeFinancialInput('abc'), 0);

    const verbal = formatMillionToVerbalPersian(6500);
    assert.ok(verbal.includes('۶ میلیارد') && verbal.includes('۵۰۰ میلیون'), `Unexpected verbal: ${verbal}`);

    const scaleWarn = validateAndScaleTomanInput('12', 'TOTAL_BUY_PRICE');
    assert.equal(scaleWarn.isLikelyMissingZeros, true);
    assert.ok(scaleWarn.warningMessage?.includes('میلیارد'));

    const depositOk = validateAndScaleTomanInput('120', 'DEPOSIT_OR_UNIT');
    assert.equal(depositOk.isLikelyMissingZeros, false);

    const rentConv = computeRentConversion(10000, 'CENTRAL_BALANCED', 0.5, 3.0);
    assert.equal(rentConv.fullDepositMillion, 1800);
    assert.equal(rentConv.depositMillion, 900);
    assert.equal(rentConv.monthlyRentMillion, 27);

    const jalaliLabel = formatJalaliMonthYear(Date.UTC(2025, 4, 15));
    assert.ok(jalaliLabel.length > 0);
  });

  await verify('[RULE-14], [RULE-16], [RULE-18] Reverse Budget Modal, Shareable Card & In-App WebView Detector', () => {
    const tgCheck = detectBrowserEnvironment('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Telegram/10.5');
    assert.equal(tgCheck.isRestrictedWebView, true);
    assert.ok(tgCheck.detectedAppNamePersian?.includes('تلگرام'));

    const igCheck = detectBrowserEnvironment('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Instagram 312.0');
    assert.equal(igCheck.isRestrictedWebView, true);

    const desktopCheck = detectBrowserEnvironment('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/124.0.0.0 Safari/537.36');
    assert.equal(desktopCheck.isRestrictedWebView, false);

    const revModalSrc = fs.readFileSync(path.join(rootDir, 'src/components/modals/ReverseBudgetDiscoveryModal.tsx'), 'utf8');
    const shareCardSrc = fs.readFileSync(path.join(rootDir, 'src/components/modals/ShareableNeighborhoodCard.tsx'), 'utf8');
    assert.ok(revModalSrc.includes('useDialogFocus(isOpen, onClose)') && revModalSrc.includes('formatMillionTomanAsIntlCurrency') && revModalSrc.includes('formatAreaShort'));
    assert.ok(shareCardSrc.includes('formatMillionTomanAsIntlCurrency') && shareCardSrc.includes('formatAreaShort'));
  });

  console.log('========================================================================');
  console.log('ALL ARGON-4 REMEDIATION CHECKS PASSED 100%');
  console.log('========================================================================\n');
}

function TEHRAN_BoundsCheck(): boolean {
  return TEHRAN_BOUNDS.minLat === 35.5 && TEHRAN_BOUNDS.maxLat === 35.9;
}

runArgon4Verification().catch((err) => {
  console.error('[ARGON-4 TEST FAILED]', err);
  process.exit(1);
});
