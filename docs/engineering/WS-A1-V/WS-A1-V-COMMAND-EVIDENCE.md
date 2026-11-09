# WS-A1-V — Independent Command Execution & Raw Test Evidence (`E1`)

**Workstream ID:** `WS-A1-V`  
**Environment:** Linux container (`/app/applet`), Node.js `v22.23.2`, NPM `10.9.8`  
**Verification Principle:** Every command below was directly executed during the `WS-A1-V` forensic verification session. Zero test outputs or exit codes are assumed or copied from prior reports.

---

## Command 1: Workspace State, Archive, and Cryptographic Checksum Audit

- **Exact Command:**
  ```bash
  node -e '... [forensic filesystem & SHA-256 verification script] ...' && python3 -c '... [zipfile integrity & 1,167-entry SHA-256 comparison] ...'
  ```
- **Working Directory:** `/app/applet`
- **Timestamp:** `2026-11-08T12:24:22-08:00` (`2026-11-08T20:24:22Z`)
- **Exit Code:** `0`
- **Observed Output Summary:**
  ```text
  === ENVIRONMENT & STATE ===
  CWD: /app/applet
  Node: v22.23.2
  Platform: linux x64
  .git exists: false
  package-lock.json exists: false
  node_modules exists: true
  dist exists: true
  WS-A1-V dir exists: false

  === PINNED GOVERNANCE FILES ===
  docs/engineering/RMEP-001/MASTER-PROMPT.md | lines: 653 | sha256: de446dbcf3e351e845c6c07708a316dc7f3bb06d8e1a2267d62655195e728b51 | manifestMatch: true
  docs/engineering/RMEP-001/EXECUTION-STATE.json | lines: 186 | sha256: 0de3b7e480a569a7ac084b9d18c7d4d717c81239a006569ac8cf9ce3b9ebaa33 | manifestMatch: true
  AGENTS.md | lines: 62 | sha256: d55579b0fb78390cd59c8719f70147f99ca12ca5b32333cb1598762d50f36413 | manifestMatch: true
  ARCHITECTURE.md | lines: 123 | sha256: 7b55f44195f18e674d623b9de63c8b2c99fd9de2ba528661f2ff8cd073aa686e | manifestMatch: true
  architecture-baseline.json | lines: 42 | sha256: d8f29faaa7695dd6ef31d0c19bc636e1ba67f31279efdaef4a5ff59d65d4f6a4 | manifestMatch: true

  === MANIFEST CHANGED FILES VERIFICATION (8/8) ===
  src/data/realMarketPriceAggregator.ts | lines: 290 | exactMatch: true
  src/components/NeighborhoodInspectorDrawer.tsx | lines: 249 | exactMatch: true
  src/components/NeighborhoodInspectorTabs.tsx | lines: 284 | exactMatch: true
  src/components/views/ProductIntelligenceView.tsx | lines: 266 | exactMatch: true
  src/components/CompareModal.tsx | lines: 255 | exactMatch: true
  tests/real-market-price-aggregator.test.ts | lines: 214 | exactMatch: true
  docs/AUTONOMOUS-ENGINEERING-PROGRESS.md | lines: 437 | exactMatch: true
  docs/engineering/WS-G4A-A1-EXECUTION-REPORT.md | lines: 65 | exactMatch: true

  === ZIP ARCHIVE VERIFICATION ===
  public/radar-g4a-ws-a1-handoff.zip | size: 5840158 | sha256: e4e23ec43839fbe96e76c2898ace524cf9bf73b0132bfa7b1ff6f079bef831b2
  ZIP testzip() result (None = OK): None
  Total entries in ZIP: 1167
  Forbidden entries in ZIP: 0 []
  ZIP vs Live Workspace Mismatches: 0 []
  ```
- **What This Command Proves:** Confirms 100% cryptographic consistency between `public/radar-g4a-ws-a1-handoff.zip`, the 8 files listed in `WS-G4A-A1-MANIFEST.json`, the 5 pinned governance files, and the live workspace.
- **What This Command Does NOT Prove:** Does not prove that the code inside those files satisfies the domain/statistical requirements or that `WS-G4A-A1.patch` and `WS-G4A-A1-EXECUTION-REPORT.md` accurately describe the code.

---

## Command 2: Patch Hunk Applicability Audit (`docs/engineering/WS-G4A-A1.patch`)

- **Exact Command:**
  ```bash
  node -e '... [hunk-by-hunk "+" line verification of docs/engineering/WS-G4A-A1.patch against live files] ...'
  ```
- **Working Directory:** `/app/applet`
- **Timestamp:** `2026-11-08T12:27:05-08:00` (`2026-11-08T20:27:05Z`)
- **Exit Code:** `0`
- **Observed Output:**
  ```text
  Patch target: src/data/realMarketPriceAggregator.ts | +lines: 13 | matched in actual file: 8 | missing: 5
    Missing +line: +  dataSourceType: 'OBSERVED_MARKET_SAMPLE' | 'SPARSE_OBSERVED_SAMPLE' | 'REFERENCE_PROFILE_NO_OBSERVED_SAMPLES';
    Missing +line: +  confidenceLevel: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';
    Missing +line: +  exclusionReason: 'NONE' | 'INVALID_PRICE_OR_AREA' | 'EXTREME_PRICE_ANOMALY_FILTER' | 'OUTLIER_ROBUST_MAD_BAND';
  Patch target: src/components/NeighborhoodInspectorDrawer.tsx | +lines: 4 | matched in actual file: 0 | missing: 4
  Patch target: src/components/NeighborhoodInspectorTabs.tsx | +lines: 8 | matched in actual file: 2 | missing: 6
  Patch target: src/components/views/ProductIntelligenceView.tsx | +lines: 2 | matched in actual file: 0 | missing: 2
  Patch target: src/components/CompareModal.tsx | +lines: 3 | matched in actual file: 3 | missing: 0
  ```
- **What This Command Proves:** Proves `F-A1V-02` (`CRITICAL`): `docs/engineering/WS-G4A-A1.patch` was manually fabricated and does not match the actual lines of 4 of its 5 target files.

---

## Command 3: TypeScript Static Type Verification (`npm run lint`)

- **Exact Command:** `npm run lint` (`tsc --noEmit`)
- **Working Directory:** `/app/applet`
- **Timestamp:** `2026-11-08T12:27:49-08:00` (`2026-11-08T20:27:49Z`)
- **Exit Code:** `0`
- **Observed Output:**
  ```text
  > radar-tehran@2.6.0 lint
  > tsc --noEmit
  ```
- **What This Command Proves:** Zero TypeScript compilation or type-contract errors across all `.ts` and `.tsx` files.

---

## Command 4: Architectural Ratchet & Dependency Direction (`npm run arch:check`)

- **Exact Command:** `npm run arch:check` (`tsx scripts/check-architecture.ts`)
- **Working Directory:** `/app/applet`
- **Timestamp:** `2026-11-08T12:27:49-08:00` (`2026-11-08T20:27:49Z`)
- **Exit Code:** `0`
- **Observed Output:**
  ```text
  > radar-tehran@2.6.0 arch:check
  > tsx scripts/check-architecture.ts

  ======================================================================
  🏗️  ARCHITECTURE & MODULE BOUNDARY REPORT
  ======================================================================
  Total source files scanned : 284
  Tracked legacy monoliths   : 1
  Files in warning zone (>300): 0
  Architecture errors        : 0

  📊 Tracked Legacy Files (Ratchet Status):
    - src/App.tsx: 64 / 185 lines (121 lines below ceiling)

  ✅ Architecture check passed! All module boundaries and line-count ratchets are respected.
  ```
- **What This Command Proves:** All 284 source files are `<= 300` lines and respect strict unidirectional dependency boundaries.

---

## Command 5: Market Aggregator Unit Test (`npx tsx tests/real-market-price-aggregator.test.ts`)

- **Exact Command:** `npx tsx tests/real-market-price-aggregator.test.ts`
- **Working Directory:** `/app/applet`
- **Timestamp:** `2026-11-08T12:27:49-08:00` (`2026-11-08T20:27:49Z`)
- **Exit Code:** `0`
- **Observed Output:**
  ```text
  🧪 Running Real Market Price Aggregator & Persian NLP Suite...
  ✅ All Real Market Price Aggregator & Epistemic Contract tests passed!
  ```
- **What This Command Proves:** Existing assertions in `tests/real-market-price-aggregator.test.ts` pass.
- **What This Command Does NOT Prove:** Does not test duplicate listing sensitivity, missing-sqm `85` imputation, or `confidenceScore` monotonicity (`74` on `0` samples vs `71` on `3` samples).

---

## Command 6: Verification of Claimed `tests/hedonic-pricing-engine.test.ts`

- **Exact Command:** `npx tsx tests/hedonic-pricing-engine.test.ts`
- **Working Directory:** `/app/applet`
- **Timestamp:** `2026-11-08T12:27:49-08:00` (`2026-11-08T20:27:49Z`)
- **Exit Code:** `1`
- **Observed Output:**
  ```text
  node:internal/modules/run_main:107
      triggerUncaughtException(
      ^
  Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/app/applet/tests/hedonic-pricing-engine.test.ts'
  ```
- **What This Command Proves:** Confirms `F-A1V-06` (`LOW`): the filename `hedonic-pricing-engine.test.ts` cited in the previous handoff's Deliverable 5 prose does not exist in `/tests`.

---

## Command 7: Full Unit, Contract, and Static Firestore Rules Suites

- **Exact Command:** `npm run test:unit && npm run test:contracts && npm run test:rules:static`
- **Working Directory:** `/app/applet`
- **Timestamp:** `2026-11-08T12:28:12-08:00` (`2026-11-08T20:28:12Z`)
- **Exit Code:** `0`
- **Observed Output Summary:**
  - `npm run test:unit`: Executed all 26 unit test files defined in `package.json` line 23 (`pricing-engine-integrity.test.ts`, `real-market-price-aggregator.test.ts`, `hedonic-and-627-debug.test.ts`, `assess-004-hedonic-accuracy-benchmark.test.ts`, `valuation-trace-and-comparables.test.ts`, `model-governance-and-drift.test.ts`, etc.). All 26 suites exited `0`.
  - `npm run test:contracts`: Executed `tsx tests/engineering-quality-foundation.test.ts`, exited `0` (`ALL P0-P15 + ASSESS-004 + RMEP-001 GATES PASSED`).
  - `npm run test:rules:static`: Executed `tsx scripts/run-firestore-rules-tests.ts static`, exited `0` (`13/13 static checks passed`, `9/9 data integrity checks passed`).

---

## Command 8: Isolated Production Build Verification

- **Exact Command:** `npx vite build --outDir /tmp/ws-a1-v-dist && rm -rf /tmp/ws-a1-v-dist`
- **Working Directory:** `/app/applet`
- **Timestamp:** `2026-11-08T12:28:53-08:00` (`2026-11-08T20:28:53Z`)
- **Exit Code:** `0`
- **Observed Output Summary:**
  ```text
  vite v6.4.1 building for production...
  ✓ 2220 modules transformed.
  ✓ built in 12.51s
  ```
- **Why `--outDir /tmp/ws-a1-v-dist` Was Used:** Calling `npm run build` runs `tsx scripts/generate-seo-assets.ts && vite build`, which overwrites tracked files in `dist/`, `public/sitemap.xml`, and `public/robots.txt`. Using `--outDir /tmp/ws-a1-v-dist` verified full production compilation while preserving 100% read-only workspace integrity.

---

## Command 9: Live Headless Browser Verification (`playwright-cli`)

- **Exact Commands:**
  ```bash
  playwright-cli open "http://localhost:3000/?hood=5&compare=5-14"
  playwright-cli eval "() => ({ title: document.title, bodyTextSample: document.body.innerText.slice(0, 3000) })"
  playwright-cli console
  playwright-cli open "http://localhost:3000/?hood=5&view=intelligence"
  playwright-cli eval "() => ({ bodyText: document.body.innerText.slice(0, 3500) })"
  playwright-cli close
  ```
- **Working Directory:** `/app/applet`
- **Timestamp:** `2026-11-08T12:29:47-08:00` (`2026-11-08T20:29:47Z`)
- **Exit Code:** `0`
- **Observed Output Summary:**
  - Console errors: `0` (`Errors: 0, Warnings: 0`).
  - At `?hood=5&compare=5-14`:
    - `NeighborhoodInspectorDrawer` rendered: `منشا داده: تخمین ترکیبی (نمونه محدود: ۲ آگهی)` and `شاخص پوشش شواهد: ۵۲/۱۰۰ (پوشش محدود)`.
    - `CompareModal` rendered simultaneously for Punak (`پونک`): `پروفایل مرجع (۰ آگهی)` — directly confirming `F-A1V-04` (`CompareModal.tsx:8` passes `[]`).
  - At `?hood=5&view=intelligence`:
    - `ProductIntelligenceView` rendered for Punak (`پونک`): `منشا داده: پروفایل مرجع (۰ آگهی مستقیم)`, `تخمین قیمت قطعی معاملات (مدل v6.4)`, `بازه معتبر آماری محله (IQR): 131.3 تا 154.3 م.ت`, and `جایگاه معامله قطعی: صدک 56 محله` — directly confirming `F-A1V-03` and `F-A1V-04`.

---

## Command 10: In-Memory Adversarial, Metamorphic, and Reproducibility Probes (`npx tsx -e`)

- **Exact Commands:**
  1. `npx tsx -e '... [calculateHedonicValuation, buildReproducibleValuationTrace, verifyValuationTraceReproducibility, and step-discontinuity probes] ...'` (Timestamp: `2026-11-08T12:45:46-08:00`, Exit Code: `0`)
  2. `npx tsx -e '... [aggregateNeighborhoodMarketMetrics order invariance, duplicate sensitivity, missing-sqm imputation, and N=0/2/3 confidence probes] ...'` (Timestamp: `2026-11-08T12:48:57-08:00`, Exit Code: `0`)
- **Observed Output:**
  ```json
  {
    "REPRODUCIBILITY": {
      "hedonicEqual": true,
      "hedonicPerSqm": 141,
      "hedonicTotalMillion": 14100,
      "fastSaleTotalMillion": 12408,
      "sensitivityRangeMillion": { "min": 13607, "max": 14593 },
      "traceDigest": "trc_8a53657653fff790",
      "traceVerified": { "reproducible": true, "reason": "REPRODUCIBLE_EXACT" }
    },
    "ADVERSARIAL_HEDONIC": {
      "zeroSqm": { "clampedSqm": 30.000000000000004, "totalM": 4446, "perSqm": 148.2 },
      "negSqm": { "clampedSqm": 30.000000000000004, "totalM": 4446 },
      "nanSqm": { "clampedSqm": 85, "totalM": 12121 },
      "extremeSqm": { "clampedSqm": 600, "totalM": 82140 },
      "futureBuildYear1450": { "ageImpact": 6.5 },
      "floor20In4FloorBldg": { "floorImpact": 10.5 },
      "missingHoodPriceZero": { "fallbackBasePerSqm": 120, "totalM": 12050 }
    },
    "METAMORPHIC_AGGREGATOR": {
      "orderInvariant": true,
      "sameIdDup": {
        "observedSampleCount": 5,
        "eligibleObservedCount": 5,
        "evidenceIndexScore": 77,
        "confidenceScore": 77,
        "evidenceQuality": "MODERATE_OBSERVATIONS"
      },
      "noSqmInDesc": {
        "observedSampleCount": 3,
        "eligibleObservedCount": 3,
        "malformedSampleCount": 0,
        "observedMeanPerSqm": 183.2,
        "autoBargains": []
      },
      "zeroSamples": {
        "observedSampleCount": 0,
        "sampleCount": 12,
        "validSampleCount": 12,
        "confidenceScore": 74,
        "evidenceIndexScore": 0,
        "iqrLow": 131.3,
        "iqrHigh": 154.3,
        "dayAnchorPrice": 140.4,
        "autoBargainsCount": 3
      },
      "twoSamples": {
        "observedSampleCount": 2,
        "sampleCount": 12,
        "validSampleCount": 12,
        "confidenceScore": 74,
        "evidenceIndexScore": 52,
        "iqrLow": 131.3,
        "iqrHigh": 154.3,
        "dayAnchorPrice": 137.7,
        "autoBargainsCount": 3
      },
      "threeSamples": {
        "observedSampleCount": 3,
        "sampleCount": 3,
        "validSampleCount": 3,
        "confidenceScore": 71,
        "evidenceIndexScore": 71,
        "iqrLow": 132.5,
        "iqrHigh": 135.2,
        "dayAnchorPrice": 137.7,
        "unclampedAveragePerSqm": 134.1,
        "isAnchorClamped": true
      }
    }
  }
  ```

---

## Tests Not Executed & Exact Reasons

1. **Live Firestore Emulator Rules Suite (`npm run test:rules` / `firebase emulators:exec`):** Not executed because starting the Java Firestore emulator daemon in read-only audit mode is unnecessary when `npm run test:rules:static` (`exit 0`) verified that zero Firestore rules or schemas were touched in `WS-A1`.
2. **Full E2E/Smoke/Mutation/Stress Suites (`npm run test:e2e`, `npm run test:mutation`, `tests/stress-50-cycles.test.ts`):** Live browser interaction on the exact affected routes (`?hood=5`, `?hood=5&compare=5-14`, `?hood=5&view=intelligence`) was executed directly via `playwright-cli` (`Command 9`), and all 26 unit test suites + contract suites were executed (`Command 7`).
