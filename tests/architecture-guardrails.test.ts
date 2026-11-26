import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { collectSourceFiles, runArchitectureCheck } from '../scripts/check-architecture';
import { escapeHtmlAttr, buildExternalDivarUrl } from '../src/utils/security';
import { calculateHedonicValuation, FAST_SALE_FACTOR } from '../src/data/hedonicPricingEngine';
import { calculateDetailedValuation } from '../src/data/superModulesLogic';
import { INITIAL_NEIGHBORHOODS, type EvaluatedNeighborhood } from '../src/data/neighborhoods';
import { readAndReconcileExecutionState, PINNED_MASTER_PROMPT_SHA256 } from '../src/utils/rmepExecutionStateEngine';
import { readServerEntrySource } from './helpers/readServerEntrySource.ts';

console.log('🛡️ Running Architecture Guardrails & Refactoring Verification Suite...\n');

let passed = 0;

function verify(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✅ ${passed}. ${name}`);
  } catch (err) {
    console.error(`  ❌ FAILED: ${name}`);
    throw err;
  }
}

const rootDir = process.cwd();

// 1. Passing Case: Real workspace passes all architecture guardrails with 0 blocking errors across src + server/modules
verify('Current workspace passes runArchitectureCheck() with zero blocking violations and scans all server/modules', () => {
  const result = runArchitectureCheck({ rootDir });
  assert.equal(
    result.errors.length,
    0,
    `Expected 0 architecture violations, got: ${JSON.stringify(result.errors, null, 2)}`
  );
  assert.ok(
    result.scannedFilesCount >= 1400,
    `Expected >= 1400 scanned source files across src + server/modules, got ${result.scannedFilesCount}`
  );
  assert.ok(
    result.legacyTracked.length >= 110,
    `Expected tracked legacy debt register (>= 110 files), got ${result.legacyTracked.length}`
  );
});

// 2. Failing Case: Newly added oversized file (>= 500 lines) is rejected
verify('Guardrail rejects newly created non-baseline file exceeding 500 lines (NEW_FILE_OVERSIZED)', () => {
  const fakeLines = Array.from({ length: 505 }, (_, i) => `export const line_${i} = ${i};`).join('\n');
  const result = runArchitectureCheck({
    rootDir,
    virtualOverrides: [
      {
        relPath: 'src/components/HypotheticalBloatedModal.tsx',
        content: fakeLines,
      },
    ],
  });
  const violation = result.errors.find(
    (v) => v.file === 'src/components/HypotheticalBloatedModal.tsx' && v.code === 'NEW_FILE_OVERSIZED'
  );
  assert.ok(violation, 'Expected NEW_FILE_OVERSIZED violation for 505-line new component');
});

// 3. Failing Case: Tracked legacy file growing beyond its baseline maxLines is rejected
verify('Guardrail rejects tracked legacy file growing above its ratchet maxLines (LEGACY_FILE_GREW)', () => {
  const appPath = path.join(rootDir, 'src/App.tsx');
  const currentContent = fs.readFileSync(appPath, 'utf8');
  const baselineConfig = JSON.parse(fs.readFileSync(path.join(rootDir, 'architecture-baseline.json'), 'utf8'));
  const maxAllowed = baselineConfig.trackedLegacyFiles['src/App.tsx']?.maxLines || 560;
  const currentLines = currentContent.trim().split('\n').length;
  const extraNeeded = Math.max(2, maxAllowed - currentLines + 2);
  const grownContent = `${currentContent}\n${'// extra line\n'.repeat(extraNeeded)}`;
  const result = runArchitectureCheck({
    rootDir,
    virtualOverrides: [
      {
        relPath: 'src/App.tsx',
        content: grownContent,
      },
    ],
  });
  const violation = result.errors.find(
    (v) => v.file === 'src/App.tsx' && v.code === 'LEGACY_FILE_GREW'
  );
  assert.ok(violation, 'Expected LEGACY_FILE_GREW violation when src/App.tsx grows above baseline');
});

// 4. Failing Case: Upward dependency from src/data/* or src/utils/* into src/components/* or src/App
verify('Guardrail rejects upward dependency from src/data/* or src/utils/* into UI layer (UPWARD_DEPENDENCY)', () => {
  const badDataModule = `import { MapLegend } from '../components/MapLegend';\nexport const x = 1;\n`;
  const result = runArchitectureCheck({
    rootDir,
    virtualOverrides: [
      {
        relPath: 'src/data/illegalUpwardImport.ts',
        content: badDataModule,
      },
    ],
  });
  const violation = result.errors.find(
    (v) => v.file === 'src/data/illegalUpwardImport.ts' && v.code === 'UPWARD_DEPENDENCY'
  );
  assert.ok(violation, 'Expected UPWARD_DEPENDENCY violation when src/data/* imports from ../components/*');
});

// 5. Exclusion & Static Dataset Boundary Case: Static dataset allowed under cap, rejected if importing React
verify('Guardrail enforces static dataset isolation (allows pure data under cap, rejects React imports)', () => {
  const contaminatedDataset = `import React from 'react';\nexport const y = 2;\n`;
  const result = runArchitectureCheck({
    rootDir,
    virtualOverrides: [
      {
        relPath: 'src/data/multiCityData.ts',
        content: contaminatedDataset,
      },
    ],
  });
  const violation = result.errors.find(
    (v) => v.file === 'src/data/multiCityData.ts' && v.code === 'DATASET_IMPORTS_UI'
  );
  assert.ok(violation, 'Expected DATASET_IMPORTS_UI violation when static dataset imports React');
});

// 6. PortfolioModals, SecondaryModals & BuyerAlertPwaLegalModals extraction verification
verify('Extracted PortfolioModals.tsx, SecondaryModals.tsx, and BuyerAlertPwaLegalModals.tsx stay strictly under 500 lines', () => {
  for (const rel of [
    'src/components/PortfolioModals.tsx',
    'src/components/SecondaryModals.tsx',
    'src/components/BuyerAlertPwaLegalModals.tsx',
  ]) {
    const abs = path.join(rootDir, rel);
    assert.ok(fs.existsSync(abs), `${rel} must exist`);
    const trimmed = fs.readFileSync(abs, 'utf8').replace(/\r?\n$/, '');
    const lineCount = trimmed.split(/\r?\n/).length;
    assert.ok(lineCount < 500, `Expected ${rel} < 500 lines, got ${lineCount}`);
  }
});

// 7. HTML Attribute Escaping for Leaflet Tooltips/Markers
verify('escapeHtmlAttr neutralizes quotes, angle brackets, and ampersands in Leaflet HTML templates', () => {
  const malicious = `ونک" onload="alert(1)" <script>&'test'`;
  const escaped = escapeHtmlAttr(malicious);
  assert.ok(!escaped.includes('"'), 'Must escape double quotes');
  assert.ok(!escaped.includes("'"), 'Must escape single quotes');
  assert.ok(!escaped.includes('<'), 'Must escape <');
  assert.ok(!escaped.includes('>'), 'Must escape >');
  assert.equal(escaped, 'ونک&quot; onload=&quot;alert(1)&quot; &lt;script&gt;&amp;&#39;test&#39;');
});

// 8. Multi-city & Buy/Rent Dynamic Divar URL Builder
verify('buildExternalDivarUrl routes all 5 cities and both buy/rent modes to accurate Divar paths', () => {
  const cities = ['tehran', 'karaj', 'mashhad', 'isfahan', 'shiraz'] as const;
  for (const city of cities) {
    const buyUrl = buildExternalDivarUrl(city, 'buy', 'محله تست');
    const rentUrl = buildExternalDivarUrl(city, 'rent', 'محله تست');
    assert.ok(
      buyUrl.startsWith(`https://divar.ir/s/${city}/buy-apartment/`),
      `Invalid buy URL for ${city}: ${buyUrl}`
    );
    assert.ok(
      rentUrl.startsWith(`https://divar.ir/s/${city}/rent-apartment/`),
      `Invalid rent URL for ${city}: ${rentUrl}`
    );
  }
});

// 9. Single Source of Truth Valuation Engine Consistency
verify('calculateDetailedValuation delegates core hedonic factors and FAST_SALE_FACTOR to calculateHedonicValuation consistently', () => {
  const hood = INITIAL_NEIGHBORHOODS[0] as unknown as EvaluatedNeighborhood;
  const baseHedonic = calculateHedonicValuation({
    neighborhood: hood,
    sqm: 100,
    buildYear: 1400,
    renovationStatus: 'renovated',
    floor: 3,
    totalFloors: 5,
    hasElevator: true,
    hasParking: true,
    hasStorage: true,
    parkingAdjustmentPercent: 5,
    currentJalaliYear: 1405,
  });

  const detailedStandard = calculateDetailedValuation({
    hood,
    sqm: 100,
    age: 5,
    floor: 3,
    totalFloors: 5,
    bedrooms: 2,
    deedType: 'single_deed',
    parkingType: 'dedicated',
    hasElevator: true,
    hasStorage: true,
    renovation: 'renovated',
    light: 'normal',
  });

  assert.equal(FAST_SALE_FACTOR, 0.88, 'FAST_SALE_FACTOR must be 0.88');
  assert.equal(
    detailedStandard.fairPerSqm,
    baseHedonic.hedonicPerSqm,
    'Detailed valuation with single_deed and normal light must match hedonic engine per-sqm price'
  );

  const detailedEndowment = calculateDetailedValuation({
    hood,
    sqm: 100,
    age: 5,
    floor: 3,
    totalFloors: 5,
    bedrooms: 2,
    deedType: 'endowment',
    parkingType: 'dedicated',
    hasElevator: true,
    hasStorage: true,
    renovation: 'renovated',
    light: 'normal',
  });
  assert.ok(
    detailedEndowment.fairTotalMillion < detailedStandard.fairTotalMillion,
    'Endowment deed must apply a negative adjustment compared to single_deed'
  );
});

// 10. Cloudflare-native contract, D1 schema, identity, and Firebase retirement verification
verify('server.ts mounts contracted routes and Cloudflare D1 migrations define native identity and marketplace data', () => {
  const serverSrc = readServerEntrySource(rootDir);
  for (const requiredToken of [
    'registerSponsorAndBargainRoutes(app',
    'registerBackupAndChunkUploadRoutes(app)',
    'resolveServerHttpTimeouts(process.env)',
    '"/api/healthz"',
    '"/api/openapi.json"',
    '"/api/admin/runtime-env"',
    '"/api/market-pulse/refresh"',
  ]) {
    assert.ok(serverSrc.includes(requiredToken), `Expected server.ts to include ${requiredToken}`);
  }

  const identityMigration = fs.readFileSync(path.join(rootDir, 'migrations/user-d1/0007_cloudflare_native_identity_and_sessions.sql'), 'utf8');
  for (const token of ['CREATE TABLE IF NOT EXISTS auth_identities', 'CREATE TABLE IF NOT EXISTS auth_oauth_states', 'CREATE TABLE IF NOT EXISTS auth_phone_challenges', 'token_hash', 'expires_at_iso']) {
    assert.ok(identityMigration.includes(token), `Expected Cloudflare identity migration to define ${token}`);
  }
  const marketplaceMigration = fs.readFileSync(path.join(rootDir, 'migrations/user-d1/0010_marketplace_and_neighborhood_core.sql'), 'utf8');
  for (const token of ['CREATE TABLE IF NOT EXISTS bargains', 'CREATE TABLE IF NOT EXISTS sponsor_requests', 'CREATE TABLE IF NOT EXISTS buyer_alerts', 'CREATE TABLE IF NOT EXISTS neighborhood_votes', 'CREATE TABLE IF NOT EXISTS neighborhood_overrides']) {
    assert.ok(marketplaceMigration.includes(token), `Expected USER_DB migration to define ${token}`);
  }
  const sessionAuth = fs.readFileSync(path.join(rootDir, 'worker/auth/sessionAuth.ts'), 'utf8');
  assert.ok(sessionAuth.includes('RADAR_SESSION_COOKIE') && sessionAuth.includes('authenticateWorkerSession'));
  assert.ok(sessionAuth.includes('token_hash') && sessionAuth.includes('expires_at_iso'));
  assert.equal(sessionAuth.includes("from 'firebase/auth'"), false, 'Worker identity must not depend on Firebase Auth');

  const backendWrangler = fs.readFileSync(path.join(rootDir, 'wrangler.backend.jsonc'), 'utf8');
  assert.ok(backendWrangler.includes('USER_DB') && backendWrangler.includes('RESEARCH_DB'), 'Backend Worker must bind separate user and research D1 databases');
  assert.equal(fs.existsSync(path.join(rootDir, 'firebase-blueprint.json')), false, 'Firebase blueprint must be retired');
  const authCompatibilityFacade = fs.readFileSync(path.join(rootDir, 'src/firebase.ts'), 'utf8');
  assert.ok(authCompatibilityFacade.includes('Compatibility facade') && authCompatibilityFacade.includes('getAuthClient'), 'Legacy firebase.ts must remain a Cloudflare-auth compatibility facade only');
  assert.equal(/from ['\"]firebase\//.test(authCompatibilityFacade), false, 'Compatibility facade must not import Firebase SDK packages');
  assert.equal(fs.existsSync(path.join(rootDir, 'firebase.json')), false, 'Firebase deploy configuration must be absent from the Cloudflare deployment path');
  assert.equal(fs.existsSync(path.join(rootDir, 'firestore.rules')), true, 'Legacy Firestore rules remain as a migration artifact and are not a Cloudflare runtime policy');

  const appLineCount = fs.readFileSync(path.join(rootDir, 'src/App.tsx'), 'utf8').replace(/\r?\n$/, '').split(/\r?\n/).length;
  assert.ok(appLineCount <= 270, `Expected src/App.tsx <= 270 lines, got ${appLineCount}`);

  const baselineConfig = JSON.parse(fs.readFileSync(path.join(rootDir, 'architecture-baseline.json'), 'utf8'));
  assert.ok(baselineConfig.trackedLegacyFiles?.['src/App.tsx']?.maxLines <= 270, 'Expected architecture-baseline.json src/App.tsx maxLines <= 270');
  const staticDatasets = new Set<string>(Object.keys(baselineConfig.datasetExclusions || {}));
  assert.equal(staticDatasets.size, 9, `Expected 9 static datasets in datasetExclusions, got ${staticDatasets.size}`);
  for (const dsRel of staticDatasets) {
    assert.ok(baselineConfig.datasetExclusions[dsRel].maxLines <= 290, `Expected ${dsRel} maxLines <= 290`);
  }
});

// 11. RMEP-001 Persistent Memory & Master Prompt Cryptographic Integrity Reconciliation
verify('RMEP-001 state preserves master-prompt integrity and truthfully records the active Cloudflare migration checkpoint', () => {
  const reconciled = readAndReconcileExecutionState(rootDir);
  assert.equal(reconciled.masterPromptVerification.exists, true, 'MASTER-PROMPT.md must exist');
  assert.equal(reconciled.masterPromptVerification.sha256, PINNED_MASTER_PROMPT_SHA256, 'MASTER-PROMPT.md SHA-256 must match pinned baseline');
  assert.equal(reconciled.reconciled, true, 'Execution-state evidence must be internally reconciled even while the program remains partially verified');
  assert.equal(reconciled.discrepancies.length, 0, `Expected no internal execution-state discrepancies, got: ${reconciled.discrepancies.join('; ')}`);
  assert.ok(reconciled.state && reconciled.state.operations.length >= 192, 'Expected at least 192 recorded RMEP operations');
  assert.equal(reconciled.state?.program_status, 'PARTIALLY_VERIFIED');
  assert.equal(reconciled.state?.current_workstream.workstream_id, 'WS-CLOUDFLARE-NATIVE-MIGRATION');
  assert.match(reconciled.state?.checkpoint.checkpoint_id || '', /^CHK-\d{3}-CLOUDFLARE-NATIVE-/);
});

// 12. Gold Master v2.0 Map-Centric Split-Map Companion Mode, GIS Comparison Arc, FX & v6.4 Deal Price Parity Across All Views
verify('All 7 Gold Master v2.0 view & navigation modules stay within the repository 500-line module ceiling and enforce Split-Map Companion Mode, GIS Comparison Arc, OP-DEC-001 FX, and v6.4 Deal Price parity', () => {
  for (const rel of [
    'src/components/navigation/ProductGlobalHeader.tsx',
    'src/components/views/ProductViewRouter.tsx',
    'src/components/views/ProductDiscoverView.tsx',
    'src/components/views/ProductIntelligenceView.tsx',
    'src/components/views/ProductToolsView.tsx',
    'src/components/views/ProductHomeView.tsx',
    'src/components/views/ProductUserSpaceView.tsx',
  ]) {
    const abs = path.join(rootDir, rel);
    assert.ok(fs.existsSync(abs), `${rel} must exist`);
    const src = fs.readFileSync(abs, 'utf8');
    const lc = src.split(/\r?\n/).length;
    assert.ok(lc <= 500, `Expected ${rel} <= 500 lines, got ${lc}`);
    // The global header is navigation-only and intentionally renders no monetary amounts.
    // OP-DEC-001 formatting is required in the six view modules that actually present prices.
    if (rel !== 'src/components/navigation/ProductGlobalHeader.tsx') {
      assert.ok(src.includes('formatMillionTomanAsIntlCurrency'), `Expected ${rel} to support OP-DEC-001 international currency equivalence`);
    }
  }
  const routerSrc = fs.readFileSync(path.join(rootDir, 'src/components/views/ProductViewRouter.tsx'), 'utf8');
  assert.ok(routerSrc.includes('تغییر سریع محله فعال روی نقشه') && routerSrc.includes('showMetroLines') && routerSrc.includes('showTrafficZones'), 'ProductViewRouter.tsx must expose active neighborhood switcher and Metro/Traffic GIS toggles');
  assert.ok(routerSrc.includes('homeContentFirst') && routerSrc.includes('resolveProductViewRouterShellClasses'), 'ProductViewRouter must use content-first home shell on mobile');
  const homeSrc = fs.readFileSync(path.join(rootDir, 'src/components/views/ProductHomeView.tsx'), 'utf8');
  assert.ok(homeSrc.includes('<HomeHeroAndMapPreview') && homeSrc.includes('<QuickAccessAndMarketSnapshotSection'), 'ProductHomeView must mount the focused hero/map preview and market snapshot launchpad');
  assert.ok(fs.existsSync(path.join(rootDir, 'src/components/listing/ListingVerdictHero.tsx')), 'ListingVerdictHero module must exist');
  for (const viewRel of [
    'src/components/views/ProductDiscoverView.tsx',
    'src/components/views/ProductIntelligenceView.tsx',
    'src/components/views/ProductToolsView.tsx',
    'src/components/views/ProductHomeView.tsx',
    'src/components/views/ProductUserSpaceView.tsx',
  ]) {
    const viewSrc = fs.readFileSync(path.join(rootDir, viewRel), 'utf8');
    if (viewRel === 'src/components/views/ProductHomeView.tsx') {
      assert.ok(viewSrc.includes('getNeighborhoodPricePresentation') && viewSrc.includes('buyReferenceLabelFa') && viewSrc.includes('rahnAreaLabelFa'), 'ProductHomeView must use the shared epistemic price presentation contract');
    } else if (viewRel === 'src/components/views/ProductUserSpaceView.tsx') {
      assert.ok(viewSrc.includes('aggregateNeighborhoodMarketMetrics') && viewSrc.includes('برآورد معامله (غیرثبتی)'), 'ProductUserSpaceView must use canonical deal estimates and label them as non-registered estimates');
    } else {
      assert.ok(
        (viewSrc.includes('FAST_SALE_FACTOR') || viewSrc.includes('estimatedDealPricePerSqm') || viewSrc.includes('useDealPriceByHoodIdMap')) &&
          (viewSrc.includes('معامله v6.4') || viewSrc.includes('سناریو v6.4') || viewSrc.includes('displayDealLabelFa') || viewSrc.includes('EpistemicMarketDisclaimer') || viewSrc.includes('DiscoverSelectedHoodEpistemicBanner')),
        `Expected ${viewRel} to display v6.4 negotiation scenario pricing (epistemic labels)`,
      );
    }
  }
});

// 13. AG-01..AG-10 Stage 2 Backend Architecture Guardrail Coverage
verify('AG-01..AG-10 Full server/modules scan, test exclusion, legacy ratchet, new file <500 ceiling, and backend upward-import ban', () => {
  const scanned = collectSourceFiles(rootDir);
  // AG-01: Covers all server/modules beyond telemetry & casper-hub
  assert.ok(scanned.includes('server/modules/community/communityRoutes.ts'));
  assert.ok(scanned.includes('server/modules/trust-safety/trustSafetyRoutes.ts'));
  assert.ok(scanned.includes('server/modules/dispute-resolution/disputeRoutes.ts'));
  // AG-02: Excludes test and spec files
  assert.equal(scanned.some((p) => /\.(test|spec)\.(ts|tsx)$/.test(p) || p.includes('/__tests__/')), false);

  // AG-03: New oversized backend file >= 500 lines is blocked
  const oversizedBackend = Array.from({ length: 505 }, (_, i) => `export const v_${i} = ${i};`).join('\n');
  const resOversized = runArchitectureCheck({
    rootDir,
    virtualOverrides: [{ relPath: 'server/modules/community/newBloatedService.ts', content: oversizedBackend }],
  });
  assert.ok(
    resOversized.errors.some((e) => e.file === 'server/modules/community/newBloatedService.ts' && e.code === 'NEW_FILE_OVERSIZED'),
    'Expected NEW_FILE_OVERSIZED for new >=500 line file inside server/modules',
  );

  // AG-04: Tracked legacy backend file growing above baseline ceiling is rejected
  const baseline = JSON.parse(fs.readFileSync(path.join(rootDir, 'architecture-baseline.json'), 'utf8'));
  const legacyEntry = baseline.trackedLegacyFiles['server/modules/notifications/durableNotificationStore.ts'];
  assert.ok(legacyEntry, 'durableNotificationStore.ts must be registered in trackedLegacyFiles');
  const grownLegacy = Array.from({ length: legacyEntry.maxLines + 3 }, (_, i) => `// line ${i}`).join('\n');
  const resLegacyGrew = runArchitectureCheck({
    rootDir,
    virtualOverrides: [{ relPath: 'server/modules/notifications/durableNotificationStore.ts', content: grownLegacy }],
  });
  assert.ok(
    resLegacyGrew.errors.some(
      (e) => e.file === 'server/modules/notifications/durableNotificationStore.ts' && e.code === 'LEGACY_FILE_GREW',
    ),
    'Expected LEGACY_FILE_GREW when registered backend legacy file grows',
  );

  // AG-05: Upward dependency from server/modules/* into src/components/* or App is blocked
  const resUpward = runArchitectureCheck({
    rootDir,
    virtualOverrides: [
      {
        relPath: 'server/modules/community/illegalUiImport.ts',
        content: `import { MapLegend } from '../../../src/components/MapLegend';\nexport const x = 1;\n`,
      },
    ],
  });
  assert.ok(
    resUpward.errors.some((e) => e.file === 'server/modules/community/illegalUiImport.ts' && e.code === 'UPWARD_DEPENDENCY'),
    'Expected UPWARD_DEPENDENCY when server/modules/* imports UI components',
  );
});

console.log(`\n🎉 ALL ${passed} ARCHITECTURE & REFACTORING GUARDRAIL TESTS PASSED!\n`);

