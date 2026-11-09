# WS-A1-V — Deliverable 7: Statistical and Scientific Validity of the Valuation System

**Workstream ID:** `WS-A1-V` (Section 19 & Section 26 Deliverable 7)  
**Inspected Modules:** `src/data/hedonicPricingEngine.ts`, `src/data/realMarketPriceAggregator.ts`, `src/data/valuationTraceAndComparables.ts`, `src/data/neighborhoods.ts`, `tests/assess-004-hedonic-accuracy-benchmark.test.ts`  
**Evidence Level:** `E1` (Runtime Probes), `E2` (Static Source Inspection)

---

## 1. Actual Model Classification (Section 19.1)

Direct inspection of `src/data/hedonicPricingEngine.ts` (270 lines) and `src/data/realMarketPriceAggregator.ts` (290 lines) establishes that the system is **NOT** a classical econometric hedonic regression model, linear statistical model, or machine-learning prediction model fitted to empirical transaction data.

- **Exact Classification:**
  1. **`calculateHedonicValuation` (`src/data/hedonicPricingEngine.ts:95-269`):** A **manually configured, deterministic rule-based piecewise adjustment formula** anchored to a static neighborhood asking-price reference table (`buyPerSqm` and `rahn80m` in `src/data/neighborhoods.ts` and `src/data/multiCityData.ts`).
  2. **`aggregateNeighborhoodMarketMetrics` (`src/data/realMarketPriceAggregator.ts:243-276`):** A **hybrid heuristic-normalization and synthetic-bootstrap aggregation engine** that divides listing asking prices by a rule-based quality multiplier (`computeQualityMultiplier`), falls back to 12 Mulberry32 PRNG synthetic listings when `observedEvaluated.length < 3`, clamps the resulting mean within `±3%` of a static daily anchor (`dayAnchorPrice`), and multiplies by a fixed regime factor (`0.90`, `0.93`, or `0.975`) to produce `estimatedDealPricePerSqm`.

---

## 2. Methodology Reconstruction (Section 19.1)

| Component | `calculateHedonicValuation` (`hedonicPricingEngine.ts`) | `aggregateNeighborhoodMarketMetrics` (`realMarketPriceAggregator.ts`) |
|---|---|---|
| **Dependent Variable / Target** | `hedonicPerSqm` (Million Toman / $\text{m}^2$) and `hedonicTotalMillion` (Million Toman) | `hedonicAdjustedPerSqm` / `askingPricePerSqm` (`dayAnchorPrice`) and `estimatedDealPricePerSqm` |
| **Baseline Anchor** | `hoodBasePerSqm = max(15, hood.baseBuyPerSqm ?? hood.buyPerSqm)` (`line 98`) | `baseHoodPerSqm` passed by caller (`line 244`) |
| **Independent Variables / Inputs** | `sqm`, `buildYear` (converted to `buildingAge = currentJalaliYear - buildYear`), `floor`, `totalFloors`, `hasElevator`, `hasParking`, `hasStorage`, `renovationStatus`, `sellerAskingTotalMillion` | Array of `{ id, askingTotalMillion, description, yearOrAge }` parsed via regex (`extractListingSpecsFromText`) into `sqm`, `floor`, `totalFloors`, `age`, `hasParking`, `hasElevator`, `hasStorage`, `renovationStatus`, `detectedSignals` |
| **Feature Transformations & Weights** | Piecewise additive percentage adjustments (`ageImpact`, `effectiveRenoImpact`, `floorImpact`, `sqmImpact`, `amenitiesImpact`) summed into `rawNetAdjustment` and clamped to `[-38%, +45%]` (`line 206`). | Multiplicative/additive `computeQualityMultiplier` (`lines 209-226`) clamped to `[0.68, 1.32]`; `normPerSqm = rawPerSqm / max(0.68, qMult)` (`line 252`). |
| **Interactions** | Age × Renovation (`age > 8` boosts renovation weight by `1.35x`, `age <= 2` scales by `0.35x`, `line 135`); Floor × Elevator (`floor >= 3 && !hasElevator` applies walk-up penalty `-3.5% * (floor - 1)` in `realMarketPriceAggregator.ts:216` vs `-3.8% - (floor - 3)*4.2%` in `hedonicPricingEngine.ts:148`). | In `computeQualityMultiplier`, `hasLegalRisk` multiplies the entire multiplier by `0.88` (`line 222`) and `hasTenantLag` by `0.96` (`line 224`). |
| **Prediction Formula** | $\text{hedonicPerSqm} = \text{round}_{0.1}\!\left(\text{hoodBasePerSqm} \times \left(1 + \frac{\text{clamp}(\sum \Delta_i, -38, +45)}{100}\right)\right)$ | $\text{dayAnchorPrice} = \text{clamp}(\text{rawAveragePerSqm}, 0.97 A, 1.03 A)$; $\text{dealPerSqm} = \text{dayAnchorPrice} \times r_{\text{regime}}$ |
| **Fast-Sale / Liquidity Factor** | `FAST_SALE_FACTOR = 0.88` (`fastSaleTotalMillion = round(hedonicTotalMillion * 0.88)`, `line 209`). | Not computed; uses `askToDealRatio` (`0.975`, `0.93`, `0.90`, `line 270`). |
| **Geographic & Temporal Scope** | 5 Iranian cities (Tehran, Karaj, Isfahan, Mashhad, Shiraz), 104 static neighborhood baselines (`BASELINE_DATASET_VERSION = '2026.10-5city-104hoods-v1'`); Solar Hijri year `1405`. | Same 104 neighborhood baselines; PRNG seed changes daily via `Math.floor(Date.now() / 86_400_000)`. |

---

## 3. Statistical Assumptions (Section 19.2)

Because the implementation is a manually parameterized rule-based multiplier system rather than an Ordinary Least Squares (OLS) or spatial regression model, classical residual assumptions (homoscedasticity, Gaussian error terms) do not govern parameter estimation. Instead, the implementation implicitly relies on five structural assumptions:
1. **Cross-City Elasticity Invariance (Violated in Practice):** The exact same percentage weights (e.g., `-7.5%` for no parking, `+6.5%` for `age === 0`, `-26%` land-value depreciation cap) are applied identically across luxury North Tehran (`Niavaran`, `265M/sqm` where land share exceeds `75%` of value) and southern zones or secondary cities (`Nazi-Abad`, `84M/sqm`), ignoring spatial heterogeneity in land-to-structure value ratios.
2. **Additive Separability of Percentage Adjustments:** Apart from three hardcoded interaction rules (Age × Renovation, Floor × No-Elevator, Top-Floor × Old-Building), adjustments are summed linearly before clamping to `[-38%, +45%]`.
3. **Parallel Formula Consistency Between Modules (Violated in Code):** `hedonicPricingEngine.ts` and `realMarketPriceAggregator.ts` (`computeQualityMultiplier`) define **different numerical coefficients for the same physical attributes**:
   - No parking penalty: `-7.0%` in `hedonicPricingEngine.ts:181` vs `-7.5%` in `realMarketPriceAggregator.ts:218`.
   - No storage penalty: `-1.8%` in `hedonicPricingEngine.ts:185` vs `-1.5%` in `realMarketPriceAggregator.ts:220`.
   - Walk-up floor 4 without elevator: `-8.0%` in `hedonicPricingEngine.ts:148` vs `-10.5%` (`-0.035 * 3`) in `realMarketPriceAggregator.ts:216`.

---

## 4. Available Training-Data Evidence (Section 19.3)

- **Status:** **`NONE` (No Training Dataset Exists)**.
- All coefficients in `hedonicPricingEngine.ts` and `realMarketPriceAggregator.ts` and all neighborhood baseline prices in `src/data/neighborhoods.ts` and `src/data/multiCityData.ts` are hardcoded TypeScript constants. There is no training pipeline, no historical transaction table, no cross-validation split, and no parameter estimation script in the repository.

---

## 5. Validation Methodology (Section 19.3)

Inspection of `tests/assess-004-hedonic-accuracy-benchmark.test.ts` (233 lines) and `tests/pricing-engine-integrity.test.ts` (16 lines) shows that existing automated validation consists exclusively of:
1. **Axiomatic / Monotonic Invariant Checks:** Verifying that `Niavaran > Punak > Nazi-Abad`, `needs_renovation < standard < renovated < luxury_renovated`, 4th-floor walk-up `< 0.90x` elevator unit, age depreciation `>= -26.0%`, and `fastSaleTotalMillion === Math.round(hedonicTotalMillion * 0.88)`.
2. **Regex NLP Extraction Unit Cases:** 15 hardcoded Persian string parsing assertions in `verifyPricingEngineIntegrity()` (`realMarketPriceAggregator.ts:278-289`).
- **Missing Validation:** Zero random holdout, temporal holdout, or spatial holdout validation against independent market observations.

---

## 6. Accuracy Evidence (Section 19.4)

- **Predictive Accuracy Classification:** **`NOT VERIFIABLE`**.
- Because no reference dataset of verified property transactions exists in the repository, out-of-sample error metrics (MAE, MedAE, RMSE, MAPE, MedAPE, prediction interval coverage) **cannot be computed honestly**. Per Section 19.4 (*"Do not calculate performance metrics without valid reference observations. Do not fabricate accuracy values. If no reliable ground-truth dataset is available, classify predictive accuracy as NOT VERIFIABLE"*), predictive accuracy is formally classified as **`NOT VERIFIABLE`**.

---

## 7. Geographic Validity (Section 19.6)

- **Granularity:** Coarse neighborhood-level centroids (`104` neighborhoods across 5 cities). Intra-neighborhood micro-location variance (e.g., main boulevard vs. narrow dead-end alley `< 6m`, proximity to highway noise or fault lines) is not modeled in `calculateHedonicValuation`.
- **Spatial Extrapolation (`applySpatialGrowthFallback`, `realMarketPriceAggregator.ts:233-241`):** Uses inverse-distance-squared weighting ($w = 1 / \max(0.3, d_{\text{km}})^2$) up to `12 km` across neighborhood centroids. In Tehran, a `12 km` radius spans across socioeconomic regimes (e.g., District 1 to District 8/14), creating spatial smoothing distortion when growth rates are interpolated.

---

## 8. Temporal Validity (Section 19.6)

- **Static Anchors + Hardcoded `±3%` Daily Clamp:** In `realMarketPriceAggregator.ts:268`, `dayAnchorPrice` is clamped to `[anchor * 0.97, anchor * 1.03]` where `anchor` defaults to the static `baseHoodPerSqm` constant. Even when `3+` fresh observed listings exist with an average `15%` above or below the static baseline (`unclampedAveragePerSqm = 134.1` vs `142` in our `E1` probe), `dayAnchorPrice` is prevented from moving beyond `137.7` (`-3%`). During Iranian macroeconomic regime shifts or currency shocks, this `±3%` clamp forces the aggregator to lag reality unless `previousDayAnchorPrice` is iteratively chained across days.

---

## 9. Market Observation Quality & Asking-vs-Transaction Distinction (Section 19.5)

- **Source Population:** All ingested samples (`hood.bargains` and Divar text descriptions) represent **unverified secondary-market asking prices (قیمت‌های پیشنهادی آگهی)**, not completed transactions (معاملات قطعی ثبت‌شده).
- **Distortion Mechanisms Identified (`E1`, `E2`):**
  1. **Synthetic Bootstrap Contamination (`realMarketPriceAggregator.ts:260-264`):** When `observedEvaluated.length < 3`, 12 PRNG synthetic samples (`boot-*`) are generated and mixed into `evaluated` and `autoBargains`.
  2. **Zero Deduplication (`F-A1V-07`):** Reposted or duplicated listings are counted as independent observations, inflating `observedSampleCount` and `evidenceIndexScore`.
  3. **Heuristic Deal-Price Multiplier (`realMarketPriceAggregator.ts:270`):** `dealPerSqm` is computed by multiplying `dayAnchorPrice` by `0.975` (`HOT`), `0.93` (`BALANCED`), or `0.90` (`FROZEN`). While `NeighborhoodInspectorTabs.tsx:214` discloses this as a hypothetical negotiation scenario, `ProductIntelligenceView.tsx:65, 116, 191` mislabels it as `تخمین قیمت قطعی معاملات (مدل v6.4)` and `جایگاه معامله قطعی`.

---

## 10. Uncertainty Representation (Section 19.7)

- **Hedonic Valuation (`hedonicPricingEngine.ts:211-215`, `valuationTraceAndComparables.ts:109-114`):** Computes a deterministic `±3.5%` band (`sensitivityRangeMillion`) and explicitly sets `isStatisticalConfidenceInterval: false` with the Persian note: `'دامنه حساسیت ±۳.۵٪ بازه تلورانس مذاکره کارشناسی حول خروجی مدل هدونیک است و فاصله اطمینان آماری نیست.'`
- **Market Aggregator (`realMarketPriceAggregator.ts:274`):** Exposes two competing indicators:
  1. `evidenceIndexScore` (`0`, `35`, `52`, or `clamp(62 + 3*N, 65, 98)`) with `calibratedConfidencePct: null`.
  2. Legacy `confidenceScore = isBootstrapped ? 74 : clampNumber(62 + validSampleCount * 3, 65, 98, 82)`.

---

## 11. Potential False Precision (Section 19.7)

1. **Confidence Score Inversion (`F-A1V-03`, Verified via `E1`):** When `0` observed samples exist (`isBootstrapped = true`), `confidenceScore` is **`74`** and `validSampleCount` is **`12`**. When `3` real observed samples exist (`isBootstrapped = false`), `confidenceScore` drops to **`71`** (`62 + 3*3`) and `validSampleCount` is **`3`**.
2. **PRNG-Derived IQR Bounds Displayed to One Decimal Place (`F-A1V-03`):** For Punak (`hood=5`) with `0` or `2` observed listings, `iqrLowPerSqm = 131.3` and `iqrHighPerSqm = 154.3` are computed from 12 PRNG synthetic samples and rendered in `NeighborhoodInspectorTabs.tsx:201` (`بازه منطقی محله: ۱۳۱.۳ – ۱۵۴.۳ م.ت`) and `ProductIntelligenceView.tsx:182` (`بازه معتبر آماری محله (IQR): 131.3 تا 154.3 م.ت`).

---

## 12. Feature Sensitivity & Step Discontinuities (Section 19.8)

In-memory sensitivity probing (`E1`) of `calculateHedonicValuation` (`hedonicPricingEngine.ts:110-195`) identified piecewise threshold cliffs:
- **Building Age Cliff at `age = 0` vs `age = 2`:** `age = 0` (`+6.5%`), `age = 1` (`+4.2%`), `age = 2` (`+1.5%`).
- **Renovation Multiplier Jump at `age = 8` vs `age = 9` (`line 135`):** `ageFactorForReno` jumps discontinuously from `1.0` at `age = 8` to `1.35` at `age = 9` (a `+3.3%` jump on `luxury_renovated`).
- **Walk-Up Penalty Activation at `floor = 3` (`line 148`):** Without an elevator, `floor = 2` has `-3.2%` amenity penalty (`line 183`), whereas `floor = 3` adds `-3.8%` floor penalty on top of `-3.2%` (`-7.0%` total), and `floor = 4` jumps to `-8.0% - 3.2% = -11.2%`.

---

## 13. Final Scientific-Validity Assessment

- **`calculateHedonicValuation` (`hedonicPricingEngine.ts`):** **ACCEPTABLE AS AN EXPLICIT HEURISTIC DECISION-SUPPORT CALCULATOR** (provided invalid inputs `sqm <= 0` / `NaN` / `floor > totalFloors` are guarded), because it transparently discloses its deterministic factor weights and labels its `±3.5%` band as a non-statistical sensitivity tolerance. Its empirical predictive accuracy against real transactions is **`NOT VERIFIABLE`**.
- **`aggregateNeighborhoodMarketMetrics` (`realMarketPriceAggregator.ts`):** **`SCIENTIFICALLY DEFECTIVE IN CURRENT STATE (REJECTED)`** due to PRNG synthetic contamination when `N < 3` (`F-A1V-03`), confidence-score inversion (`74` on `0` samples vs `71` on `3` samples), silent `85 sqm` imputation on missing area (`F-A1V-08`), zero deduplication (`F-A1V-07`), and `excludedOutlierCount` summation into `rejectedFraudCount`.
