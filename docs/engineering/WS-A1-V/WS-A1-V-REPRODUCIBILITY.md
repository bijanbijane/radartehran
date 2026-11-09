# WS-A1-V — Deliverable 9: Determinism, Environment, and Reproducibility Audit

**Workstream ID:** `WS-A1-V` (Section 21 & Section 26 Deliverable 9)  
**Evidence Level:** `E1` (Direct Execution Reproductions), `E2` (Static Source Inspection), `E3` (Dependency & Archive Inspection)

---

## 1. Runtime and Environment Specification (Section 21)

| Parameter | Observed Value | Reproducibility Impact |
|---|---|---|
| **Operating System / Arch** | `linux x64` (Container workspace `/app/applet`) | Standard POSIX float and string behavior. |
| **Node.js Version** | `v22.23.2` | Used for all `tsx` test executions and Vite builds. |
| **NPM Version** | `10.9.8` | Used for script orchestration. |
| **TypeScript Version** | `~5.8.2` (`node_modules/typescript`) | Strict typechecking (`tsc --noEmit` exit `0`). |
| **Vite Bundler Version** | `v6.4.1` (`^6.2.0` in `package.json`) | Deterministic ESM bundle transform (`2,220` modules). |
| **System Timezone / Clock** | `America/Los_Angeles` (`UTC-08:00`) / `2026-11-08T20:45:00Z` | **Impacts time-dependent functions** (`getCurrentJalaliYear()` and `Date.now()` PRNG seed in `realMarketPriceAggregator.ts:260`). |

---

## 2. Dependency and Lockfile State (Section 21 & Section 25)

- **`package.json`:** Present (`90` lines). Declares runtime dependencies (`react@^19.0.0`, `leaflet@^1.9.4`, `lucide-react@^0.546.0`, `firebase@^12.10.0`, `express@^4.21.2`, `@google/genai@^1.29.0`, `motion@^12.23.24`) and devDependencies (`vite@^6.2.0`, `tsx@^4.21.0`, `typescript@~5.8.2`, `@playwright/test@^1.58.2`).
- **Lockfile State (`package-lock.json` / `yarn.lock` / `pnpm-lock.yaml`):** **`ABSENT` (`false`)**.
  - **Reproducibility Risk:** Without a committed lockfile in `/app/applet`, fresh `npm install` runs on external machines may resolve newer minor/patch versions of caret (`^`) dependencies (`vite`, `firebase`, `lucide-react`). Within the live container, `node_modules/` is pre-populated and stable.
- **Git Repository State (`.git`):** **`ABSENT` (`false`)**.

---

## 3. Audit of Important Deterministic vs. Non-Deterministic Computations (Section 21.1)

| Computation / Symbol | Source File & Lines | Deterministic Under Fixed Inputs? | Wall-Clock / External Dependencies | Reproducibility Status |
|---|---|---|---|---|
| **`calculateHedonicValuation`** | `src/data/hedonicPricingEngine.ts:95-269` | **YES (when `currentJalaliYear` is provided)** / **TIME-DEPENDENT (when omitted)** | Calls `getCurrentJalaliYear()` (`lines 9-19`) using `new Date()` (`Intl.DateTimeFormat('en-US-u-ca-persian')`) if `inputs.currentJalaliYear` is omitted. | **`REPRODUCIBLE_WITH_PINNED_YEAR`** |
| **`buildReproducibleValuationTrace` & `verifyValuationTraceReproducibility`** | `src/data/valuationTraceAndComparables.ts:26-142` | **YES (100% Deterministic Digest)** | Hashing (`computeDigest`, `lines 14-25`) excludes `calculatedAtIso`, `areaUnit`, and `intlCurrency`, hashing only `formulaId`, `formulaVersion`, `baselineDatasetVersion`, `referenceJalaliYear`, `hoodId`, `hoodBasePerSqm`, `hoodBaseRahn80m`, `canonicalInputs`, `appliedCoefficients`, and `coreOutputs`. | **`REPRODUCIBLE_EXACT` (`trc_8a53657653fff790`)** |
| **`evaluateComparableProperties`** | `src/data/valuationTraceAndComparables.ts:184-286` | **YES (when `nowMs` is provided)** | Defaults `nowMs = Date.now()` (`line 188`) for the 90-day freshness filter (`nowMs - listedMs > maxStaleMs`). | **`REPRODUCIBLE_WITH_PINNED_NOWMS`** |
| **`aggregateNeighborhoodMarketMetrics` (when `observedEvaluated.length >= 3`)** | `src/data/realMarketPriceAggregator.ts:243-276` | **PARTIALLY (Order-Invariant for Median/Mean, Order-Sensitive for `autoBargains`)** | Sorts prices (`line 265`) before computing `q1`, `q3`, `trimmed`, `observedMeanPerSqm`, and `observedMedianPerSqm` (verified order-invariant in `E1`), though `autoBargains` preserves input array order. Note: `resolveBuildingAge` (`line 75`) hardcodes `currentSolarYear = 1405`. | **`REPRODUCIBLE_SAME_INPUTS`** |
| **`aggregateNeighborhoodMarketMetrics` (when `observedEvaluated.length < 3`, `isBootstrapped === true`)** | `src/data/realMarketPriceAggregator.ts:260-275` | **NO — WALL-CLOCK DATE DEPENDENT (`F-A1V-03`)** | Line 260 seeds the Mulberry32 PRNG using `Math.floor(Date.now() / 86_400_000)` (`seededRandom(hoodId * 997 + Math.floor(Date.now() / 86_400_000))`)! And line 261 calls `rand()` **twice per synthetic item** (`80 + Math.round(rand() * 20)` in `askingTotalMillion` and again in `description`), meaning the numeric `askingTotalMillion` and the text `description` meterage in `syntheticRaw` use **two different random draws**! | **`NON_DETERMINISTIC_ACROSS_UTC_DAYS`** |

---

## 4. Detailed Reproducibility Records & Observed Outputs (Section 21.1)

### Record 1: Hedonic Valuation & Cryptographic Trace (`Punak`, `hoodId = 5`)
- **Input Assumptions:** `neighborhood = INITIAL_NEIGHBORHOODS.find(n => n.id === 5)` (`buyPerSqm: 142`, `rahn80m: 1750`), `sqm: 100`, `buildYear: 1399` (`buildingAgeYears: 6`), `floor: 2`, `totalFloors: 5`, `hasElevator: true`, `hasParking: true`, `hasStorage: true`, `renovationStatus: 'standard'`, `referenceJalaliYear: 1405`.
- **Executed Command:** `Command 10` (`npx tsx -e ...`)
- **Observed Output:**
  - `hedonicPerSqm`: `141` Million Toman
  - `hedonicTotalMillion`: `14100` Million Toman (`14.1` Billion Toman)
  - `fastSaleTotalMillion`: `12408` Million Toman (`0.88 * 14100`)
  - `sensitivityRangeMillion`: `{ min: 13607, max: 14593 }`
  - `reproducibilityDigest`: `'trc_8a53657653fff790'`
  - `verifyValuationTraceReproducibility(trace1, punak)`: `{ reproducible: true, reason: 'REPRODUCIBLE_EXACT' }`
- **Reproducibility Status:** **`VERIFIED DETERMINISTIC`**.

### Record 2: Market Aggregator Under `N = 0` vs `N = 2` vs `N = 3` (`Punak`, `hoodId = 5`, UTC Day `20765`)
- **Input Assumptions:** `hoodId: 5`, `hoodName: 'پونک'`, `baseHoodPerSqm: 142`, `UTC Date: 2026-11-08` (`Math.floor(Date.now() / 86_400_000) = 20765`).
- **Observed Output (`Command 10`):**
  - `zeroSamples` (`[]`): `observedSampleCount: 0`, `sampleCount: 12`, `validSampleCount: 12`, `confidenceScore: 74`, `evidenceIndexScore: 0`, `iqrLow: 131.3`, `iqrHigh: 154.3`, `dayAnchorPrice: 140.4`, `autoBargainsCount: 3`.
  - `twoSamples` (`[sA, sB]`): `observedSampleCount: 2`, `sampleCount: 12`, `validSampleCount: 12`, `confidenceScore: 74`, `evidenceIndexScore: 52`, `iqrLow: 131.3`, `iqrHigh: 154.3`, `dayAnchorPrice: 137.7`, `autoBargainsCount: 3`.
  - `threeSamples` (`[sA, sB, sC]`): `observedSampleCount: 3`, `sampleCount: 3`, `validSampleCount: 3`, `confidenceScore: 71`, `evidenceIndexScore: 71`, `iqrLow: 132.5`, `iqrHigh: 135.2`, `dayAnchorPrice: 137.7`, `unclampedAveragePerSqm: 134.1`, `isAnchorClamped: true`.
- **Identified Double-PRNG-Draw Bug (`realMarketPriceAggregator.ts:261`):**
  In `syntheticRaw`:
  ```ts
  askingTotalMillion: Math.round(baseHoodPerSqm * factor * (80 + Math.round(rand() * 20)) * 10) / 10,
  description: `${80 + Math.round(rand() * 20)} متر طبقه 2 از 5 با پارکینگ و آسانسور ساخت 1400`,
  ```
  Because `rand()` is invoked once to calculate `askingTotalMillion` and a **second time** to generate the `${80 + Math.round(rand() * 20)} متر` string in `description`, the synthetic listing's total price is computed for one random area $A_1 \in [80, 100]$, and then `evalSample` divides that total price by a **different** random area $A_2 \in [80, 100]$ parsed from `description`! This introduces artificial random noise of up to $\pm 25\%$ into the synthetic `rawPerSqm` values every UTC day.

---

## 5. Reproduction Failures & External Dependency Limitations (Section 21)

1. **`npx tsx tests/hedonic-pricing-engine.test.ts` (`FAILED — ERR_MODULE_NOT_FOUND`):** Could not be reproduced because the filename cited in the prior handoff summary does not exist (`F-A1V-06`); the actual test suites (`tests/pricing-engine-integrity.test.ts` and `tests/assess-004-hedonic-accuracy-benchmark.test.ts`) reproduced with exit code `0`.
2. **`docs/engineering/WS-G4A-A1.patch` Application (`FAILED — HUNK MISMATCH`):** Cannot be applied or reproduced against the workspace because 4 of its 5 file diffs contain hand-fabricated lines that do not exist in the codebase (`F-A1V-02`).
3. **Pre-Session Git Baseline Diff (`UNAVAILABLE`):** Because `.git` is absent in `/app/applet`, historical commit comparison via `git diff` is unavailable.
