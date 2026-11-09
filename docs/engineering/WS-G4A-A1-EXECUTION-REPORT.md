# WS-G4A-A1 (`WS-A1`) Execution Report — Post-Workstream-A Semantic, Statistical, and Regression Integrity Gate

- **Workstream ID**: `WS-G4A-A1` (`WS-A1`)
- **Workstream Title**: Post-Workstream-A Semantic, Statistical, and Regression Integrity Gate
- **Risk Classification**: `R1 / R2` (Pure domain metadata + UI disclosure refinement + unit test coverage)
- **Applet ID**: `1b7f1cd5-314b-4917-bfe4-cab0c714119b`
- **Firestore Database ID**: `ai-studio-e48df7a4-9535-4bf0-a948-61a6a0f37a6a`
- **Status**: `COMPLETED` (`WS-B` not started per operator handoff contract)

---

## 1. Confirmed and Refuted Findings (All 8 WS-A Claims Re-Audited Against Live Code)

| # | WS-A Claim | Audit Verdict | Exact Source Paths & Symbols | Technical Evidence |
|---|---|---|---|---|
| 1 | Silent substitution of reference price when `observedSampleCount === 0` | **CONFIRMED RESOLVED** | `src/data/realMarketPriceAggregator.ts` (`aggregateNeighborhoodMarketMetrics`, `dataSourceType`, `confidenceLevel`, `evidenceIndexScore`) | When `eligiblePrices.length === 0`, `dataSourceType` is `'REFERENCE_PROFILE_NO_OBSERVED_SAMPLES'`, `confidenceLevel` is `'NONE'`, `evidenceIndexScore` is `0`, and `coverageState` is `'BOOTSTRAPPED_BASELINE'`. UI surfaces explicitly display `پروفایل مرجع (۰ نمونه مشاهده‌شده)`. |
| 2 | Small-sample trimming (`N < 5`) and single/pair sample distortion | **CONFIRMED RESOLVED** | `src/data/realMarketPriceAggregator.ts` (`computeTrimmedMean`, lines 84–93) | `if (sortedPrices.length < 5) return computeMean(sortedPrices);` — 10% tail trimming is strictly gated at `N >= 5`. For `N = 1..2`, `coverageState` is `'SPARSE_1_TO_2'` (`confidenceLevel: 'LOW'`). |
| 3 | Unconditional `[0.55x, 1.65x]` outlier filtering and fraud conflation | **CONFIRMED RESOLVED** | `src/data/realMarketPriceAggregator.ts` (`filterEligibleListings`, lines 50–82; `outlierReason` union) | When `rawValidCount >= 5`, listings are filtered by dynamic `median ± 2.5 * MAD` (`OUTLIER_ROBUST_MAD_BAND`); static `[0.55x, 1.65x]` is used only as a small-sample guard when `N < 5`. Statistical price outliers are never labeled as fraud (`کلاهبرداری`). |
| 4 | Anchor smoothing (`65%/35%`) and `±3%` daily clamp disclosure | **PARTIALLY RESOLVED → FIXED IN WS-A1** | `src/data/realMarketPriceAggregator.ts` (`unclampedAveragePerSqm`, `isAnchorClamped`); `src/components/NeighborhoodInspectorTabs.tsx` (`market-anchor-clamp-disclosure`) | While `realMarketPriceAggregator.ts` computed `unclampedAveragePerSqm` and `isAnchorClamped`, the Market tab UI did not explicitly surface the unclamped raw average and daily `±3%` stability clamp state. Fixed in `WS-A1` via `data-testid="market-anchor-clamp-disclosure"`. |
| 5 | Deterministic PRNG dispersion (`mulberry32`) in market aggregation | **CONFIRMED RESOLVED** | `src/data/realMarketPriceAggregator.ts` (`computeStdDev`, `computeMedian`, `computeMAD`) | Zero PRNG (`mulberry32` / `Math.random`) exists in `realMarketPriceAggregator.ts`. All spread metrics (`stdDevPerSqm`, `coefficientOfVariationPercent`, `iqrPerSqm`) are computed strictly from observed listing samples (or `0` when `N < 2`). |
| 6 | Arbitrary formula `62 + N*3` presented as statistical confidence | **PARTIALLY RESOLVED → FIXED IN WS-A1** | `src/data/realMarketPriceAggregator.ts` (`evidenceIndexScore`, `evidenceIndexFormula`, `coverageState`); `src/components/NeighborhoodInspectorDrawer.tsx`; `src/components/views/ProductIntelligenceView.tsx` | Added `coverageState` (`BOOTSTRAPPED_BASELINE` / `SPARSE_1_TO_2` / `MODERATE_3_TO_9` / `SUFFICIENT_10_PLUS`) and `evidenceIndexFormula: '0_OBS=0|1_OBS=35|2_OBS=52|3PLUS_OBS=CLAMP(62+3*N,65,98)_COVERAGE_INDEX_NOT_PROBABILITY'`, and updated UI badges to `شاخص پوشش نمونه (غیرآماری)`. |
| 7 | `marketRegime` (`HOT`/`BALANCED`/`FROZEN`) without transaction velocity or time-on-market | **PARTIALLY RESOLVED → FIXED IN WS-A1** | `src/data/realMarketPriceAggregator.ts` (`marketActivityEvidence`); `src/components/NeighborhoodInspectorTabs.tsx` (`regimeNote`) | Added `marketActivityEvidence: 'NO_TRANSACTION_VELOCITY_DATA_DISPERSION_HEURISTIC'` and updated the Market tab regime note to explicitly disclose that without transaction-volume or time-on-market data, `marketRegime` is a listing-coverage/dispersion heuristic rather than empirical market liquidity. |
| 8 | Fixed multipliers (`0.975`/`0.93`/`0.90`) presented as `قیمت قطعی معامله` | **PARTIALLY RESOLVED → FIXED IN WS-A1** | `src/data/realMarketPriceAggregator.ts` (`negotiationMultiplierBasis`); `src/components/NeighborhoodInspectorDrawer.tsx`; `src/components/NeighborhoodInspectorTabs.tsx`; `src/components/CompareModal.tsx`; `src/components/views/ProductIntelligenceView.tsx` | Added `negotiationMultiplierBasis: 'HYPOTHETICAL_SCENARIO_ASSUMPTION_NOT_EMPIRICAL'` and updated UI surfaces to disclose `سناریوی فرضی مذاکره (غیرثبتی)` / `ضریب فرضی مذاکره (۲.۵٪، ۷٪ یا ۱۰٪ زیر قیمت پیشنهادی)`. |

---

## 2. Before / After Behavior

### Before `WS-G4A-A1`
1. `AggregatedMarketMetrics` did not expose machine-readable provenance fields distinguishing the heuristic `evidenceIndexScore` formula, the absence of transaction velocity data for `marketRegime`, or the hypothetical nature of negotiation multipliers (`0.975` / `0.93` / `0.90`).
2. `NeighborhoodInspectorTabs.tsx` (Market tab) displayed `agg.averagePerSqm` without disclosing `agg.unclampedAveragePerSqm` or whether the daily `±3%` stability clamp (`agg.isAnchorClamped`) was active.
3. UI surfaces (`NeighborhoodInspectorDrawer.tsx`, `NeighborhoodInspectorTabs.tsx`, `CompareModal.tsx`, `ProductIntelligenceView.tsx`) did not uniformly qualify `evidenceIndexScore` as non-probabilistic (`غیرآماری`) or `معامله v6.4` as a hypothetical negotiation scenario (`سناریوی فرضی مذاکره`).

### After `WS-G4A-A1`
1. `AggregatedMarketMetrics` (`src/data/realMarketPriceAggregator.ts`) exposes:
   - `coverageState`: `'BOOTSTRAPPED_BASELINE' | 'SPARSE_1_TO_2' | 'MODERATE_3_TO_9' | 'SUFFICIENT_10_PLUS'`
   - `evidenceIndexFormula`: `'0_OBS=0|1_OBS=35|2_OBS=52|3PLUS_OBS=CLAMP(62+3*N,65,98)_COVERAGE_INDEX_NOT_PROBABILITY'`
   - `marketActivityEvidence`: `'NO_TRANSACTION_VELOCITY_DATA_DISPERSION_HEURISTIC'`
   - `negotiationMultiplierBasis`: `'HYPOTHETICAL_SCENARIO_ASSUMPTION_NOT_EMPIRICAL'`
2. `NeighborhoodInspectorTabs.tsx` renders `data-testid="market-anchor-clamp-disclosure"` showing `agg.unclampedAveragePerSqm` and explicitly stating whether the `±3%` daily anchor clamp (`agg.isAnchorClamped`) is active or inactive, plus explicit regime and negotiation multiplier disclosures.
3. `NeighborhoodInspectorDrawer.tsx`, `CompareModal.tsx`, and `ProductIntelligenceView.tsx` qualify `شاخص پوشش نمونه` as `(غیرآماری)` and `معامله v6.4` as `سناریوی فرضی مذاکره`.

---

## 3. Acceptance Criteria Results

- **AC-1**: All 8 WS-A findings audited against live code with exact file paths, line numbers, and symbols — **PASS**.
- **AC-2**: `AggregatedMarketMetrics` exposes explicit machine-readable provenance for sample coverage state, heuristic index formula, market activity evidence basis, and hypothetical negotiation multiplier basis — **PASS**.
- **AC-3**: Market tab discloses `unclampedAveragePerSqm` and `isAnchorClamped` (`±3%` daily anchor clamp) alongside heuristic regime and negotiation multiplier disclosures — **PASS**.
- **AC-4**: All modified files remain `<= 290` lines (`0` warnings in `npm run arch:check`) — **PASS**:
  - `src/data/realMarketPriceAggregator.ts`: 289 lines
  - `src/components/NeighborhoodInspectorDrawer.tsx`: 248 lines
  - `src/components/NeighborhoodInspectorTabs.tsx`: 283 lines
  - `src/components/views/ProductIntelligenceView.tsx`: 265 lines
  - `src/components/CompareModal.tsx`: 255 lines
  - `tests/real-market-price-aggregator.test.ts`: 213 lines
- **AC-5**: Pinned governance files (`docs/engineering/RMEP-001/MASTER-PROMPT.md`, `docs/engineering/RMEP-001/EXECUTION-STATE.json`, `AGENTS.md`, `ARCHITECTURE.md`, `architecture-baseline.json`) remain unmodified — **PASS**.

---

## 4. Remaining Risks (Deferred to `WS-B` / `WP-3` and Subsequent Workstreams)
1. **Hedonic Engine Epistemic Transparency (`WS-B` / `WP-3`)**: `src/data/hedonicPricingEngine.ts` uses calibrated heuristic weights and `FAST_SALE_FACTOR = 0.96`; full epistemic provenance labeling and sensitivity range disclosure in the Hedonic calculator are scheduled for `WS-B` (`WP-3`).
2. **Recommendation Engine & Budget Fit Semantic Separation (`WS-C`)**: Explicit visual separation between multi-criteria neighborhood quality score (`overallScore`) and personal financial affordability (`status`) in map pins and recommendation cards is scheduled for `WS-C`.
3. **Onboarding Progressive Disclosure (`WS-D`)**: Simplifying first-load cognitive density while preserving expert power tools is scheduled for `WS-D`.
