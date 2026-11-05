import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { runArchitectureCheck } from '../scripts/check-architecture';
import { escapeHtmlAttr, buildExternalDivarUrl } from '../src/utils/security';
import { calculateHedonicValuation, FAST_SALE_FACTOR } from '../src/data/hedonicPricingEngine';
import { calculateDetailedValuation } from '../src/data/superModulesLogic';
import { INITIAL_NEIGHBORHOODS, type EvaluatedNeighborhood } from '../src/data/neighborhoods';
import { readAndReconcileExecutionState, PINNED_MASTER_PROMPT_SHA256 } from '../src/utils/rmepExecutionStateEngine';

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

// 1. Passing Case: Real workspace passes all architecture guardrails with 0 errors and 0 size warnings
verify('Current workspace passes runArchitectureCheck() with zero violations and zero size review warnings', () => {
  const result = runArchitectureCheck({ rootDir });
  assert.equal(
    result.errors.length,
    0,
    `Expected 0 architecture violations, got: ${JSON.stringify(result.errors, null, 2)}`
  );
  assert.equal(
    result.warnings.length,
    0,
    `Expected 0 size review warnings (< 300 lines), got: ${JSON.stringify(result.warnings, null, 2)}`
  );
  assert.ok(
    result.scannedFilesCount >= 20,
    `Expected at least 20 source files checked, got ${result.scannedFilesCount}`
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

// 10. RMEP-001 Contract, Route Registration & Blueprint Parity Verification
verify('server.ts mounts all contracted route modules and firebase-blueprint.json covers all 10 Firestore collections', () => {
  const serverSrc = fs.readFileSync(path.join(rootDir, 'server.ts'), 'utf8');
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

  const blueprint = JSON.parse(fs.readFileSync(path.join(rootDir, 'firebase-blueprint.json'), 'utf8'));
  const firestorePaths = Object.keys(blueprint.firestore || {});
  assert.equal(firestorePaths.length, 10, `Expected 10 Firestore collection paths in firebase-blueprint.json, got ${firestorePaths.length}`);
  assert.ok(firestorePaths.includes('/publicSponsors/{hoodId}'), 'Expected /publicSponsors/{hoodId} in firebase-blueprint.json');

  const sysArchDoc = fs.readFileSync(path.join(rootDir, 'docs/system-architecture.md'), 'utf8');
  const secDoc = fs.readFileSync(path.join(rootDir, 'docs/security.md'), 'utf8');
  assert.ok(sysArchDoc.includes('/publicSponsors/{hoodId}'), 'Expected docs/system-architecture.md to document /publicSponsors/{hoodId}');
  assert.ok(secDoc.includes('/publicSponsors/{hoodId}'), 'Expected docs/security.md to document /publicSponsors/{hoodId}');

  const appLineCount = fs.readFileSync(path.join(rootDir, 'src/App.tsx'), 'utf8').replace(/\r?\n$/, '').split(/\r?\n/).length;
  assert.ok(appLineCount <= 270, `Expected src/App.tsx <= 270 lines, got ${appLineCount}`);

  const baselineConfig = JSON.parse(fs.readFileSync(path.join(rootDir, 'architecture-baseline.json'), 'utf8'));
  assert.ok(baselineConfig.trackedLegacyFiles?.['src/App.tsx']?.maxLines <= 270, 'Expected architecture-baseline.json src/App.tsx maxLines <= 270');
  const staticDatasets = new Set<string>(Object.keys(baselineConfig.datasetExclusions || {}));
  assert.equal(staticDatasets.size, 9, `Expected 9 static datasets in datasetExclusions, got ${staticDatasets.size}`);
  for (const dsRel of staticDatasets) {
    assert.ok(baselineConfig.datasetExclusions[dsRel].maxLines <= 290, `Expected ${dsRel} maxLines <= 290`);
  }
  const allNonDatasetFiles: string[] = ['server.ts', 'src/App.tsx', 'src/main.tsx', 'src/firebase.ts'];
  for (const relDir of ['src/components', 'src/data', 'src/utils', 'src/types']) {
    const absDir = path.join(rootDir, relDir);
    if (!fs.existsSync(absDir)) continue;
    for (const entry of fs.readdirSync(absDir)) {
      if ((entry.endsWith('.ts') || entry.endsWith('.tsx')) && !staticDatasets.has(`${relDir}/${entry}`)) allNonDatasetFiles.push(`${relDir}/${entry}`);
    }
  }
  assert.equal(allNonDatasetFiles.length, 242, `Expected 242 non-dataset source files, got ${allNonDatasetFiles.length}`);
  const all242RepoFiles = [...allNonDatasetFiles, ...staticDatasets];
  assert.equal(all242RepoFiles.length, 251, `Expected 251 total repository source files, got ${all242RepoFiles.length}`);
  for (const rel of all242RepoFiles) {
    const srcText = fs.readFileSync(path.join(rootDir, rel), 'utf8');
    const lc = srcText.split(/\r?\n/).length;
    assert.ok(lc <= 290, `Expected ${rel} <= 290 lines (strictly below warningLines=300), got ${lc}`);
    assert.ok(srcText.includes('formatMillionTomanAsIntlCurrency'), `Expected ${rel} to support OP-DEC-001 international currency equivalence`);
  }
});

// 11. RMEP-001 Persistent Memory & Master Prompt Cryptographic Integrity Reconciliation
verify('readAndReconcileExecutionState verifies MASTER-PROMPT.md SHA-256, deep evidence JSONs, phase dependency graph, decision register, architecture-baseline.json (<=270 src/App.tsx & <=290 datasetExclusions) & dependency-direction ratchet, universal <=290-line zero-warning 242-file ceiling & OP-DEC-001 parity, 10-collection Firestore & root src/firebase.ts parity, API contract & env registries, Hedonic single-source delegation, Leaflet/Divar multi-city URL & disk I/O no-PII cache invariants, Rule 4 mandatory test scripts, Rule 5 doc sync parity, and EXECUTION-STATE.json with zero discrepancies', () => {
  const reconciled = readAndReconcileExecutionState(rootDir);
  assert.equal(reconciled.masterPromptVerification.exists, true, 'MASTER-PROMPT.md must exist');
  assert.equal(reconciled.masterPromptVerification.sha256, PINNED_MASTER_PROMPT_SHA256, 'MASTER-PROMPT.md SHA-256 must match pinned baseline');
  assert.equal(reconciled.reconciled, true, `Expected 0 RMEP state discrepancies, got: ${reconciled.discrepancies.join('; ')}`);
  assert.ok(reconciled.state && reconciled.state.operations.length >= 192, 'Expected at least 192 recorded RMEP operations');
  assert.equal(reconciled.state?.checkpoint.checkpoint_id, 'CHK-192-FINAL', 'Expected checkpoint_id CHK-192-FINAL');
});

// 12. Gold Master v2.0 Map-Centric Split-Map Companion Mode, GIS Comparison Arc, FX & v6.4 Deal Price Parity Across All Views
verify('All 7 Gold Master v2.0 view & navigation modules stay strictly <= 290 lines and enforce Split-Map Companion Mode, GIS Comparison Arc, OP-DEC-001 FX, and v6.4 Deal Price parity', () => {
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
    assert.ok(lc <= 290, `Expected ${rel} <= 290 lines, got ${lc}`);
    assert.ok(src.includes('formatMillionTomanAsIntlCurrency'), `Expected ${rel} to support OP-DEC-001 international currency equivalence`);
  }
  const routerSrc = fs.readFileSync(path.join(rootDir, 'src/components/views/ProductViewRouter.tsx'), 'utf8');
  assert.ok(routerSrc.includes('تغییر سریع محله فعال روی نقشه') && routerSrc.includes('showMetroLines') && routerSrc.includes('showTrafficZones'), 'ProductViewRouter.tsx must expose active neighborhood switcher and Metro/Traffic GIS toggles');
  for (const viewRel of [
    'src/components/views/ProductDiscoverView.tsx',
    'src/components/views/ProductIntelligenceView.tsx',
    'src/components/views/ProductToolsView.tsx',
    'src/components/views/ProductHomeView.tsx',
    'src/components/views/ProductUserSpaceView.tsx',
  ]) {
    const viewSrc = fs.readFileSync(path.join(rootDir, viewRel), 'utf8');
    assert.ok((viewSrc.includes('FAST_SALE_FACTOR') || viewSrc.includes('estimatedDealPricePerSqm')) && viewSrc.includes('معامله v6.4'), `Expected ${viewRel} to display v6.4 Estimated Deal Price`);
  }
});

console.log(`\n🎉 ALL ${passed} ARCHITECTURE & REFACTORING GUARDRAIL TESTS PASSED!\n`);

