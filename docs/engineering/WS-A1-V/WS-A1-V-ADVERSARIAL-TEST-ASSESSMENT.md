# WS-A1-V — Deliverable 10: Adversarial, Edge-Case, Metamorphic & Test Coverage Quality Assessment

**Workstream ID:** `WS-A1-V` (Sections 22, 24 & Section 26 Deliverable 10)  
**Evidence Level:** `E1` (Direct Runtime Adversarial/Metamorphic Probes), `E2` (Static Source & Test Suite Inspection)

---

## 1. Evaluated Input-Edge Cases (Section 22.1)

All edge cases below were executed in-memory via `npx tsx -e` (`Command 10` in `WS-A1-V-COMMAND-EVIDENCE.md`) without modifying any repository files:

| Target Function | Adversarial Input | Expected Domain Behavior | Observed Implementation Behavior (`E1`) | Verdict |
|---|---|---|---|---|
| `calculateHedonicValuation` (`hedonicPricingEngine.ts:97`) | `sqm: 0` | Reject input or return explicit validation error / `null` valuation. | Silently clamps `safeSqm = 30` and returns `hedonicTotalMillion: 4446` (`4.446B` Toman) at `148.2M/sqm`. | **FAIL (`F-A1V-08`)** |
| `calculateHedonicValuation` (`hedonicPricingEngine.ts:97`) | `sqm: -50` | Reject negative area. | Silently clamps `safeSqm = 30` and returns `hedonicTotalMillion: 4446`. | **FAIL (`F-A1V-08`)** |
| `calculateHedonicValuation` (`hedonicPricingEngine.ts:97`) | `sqm: NaN` | Reject `NaN` area. | Silently substitutes fallback `85 sqm` and returns `hedonicTotalMillion: 12121` (`12.121B` Toman). | **FAIL (`F-A1V-08`)** |
| `calculateHedonicValuation` (`hedonicPricingEngine.ts:97`) | `sqm: 50000` | Reject or flag out-of-domain apartment area (`> 600m²`). | Silently clamps `safeSqm = 600` and returns `hedonicTotalMillion: 82140` without a clamping warning. | **PARTIAL (Silent Clamp)** |
| `calculateHedonicValuation` (`hedonicPricingEngine.ts:103`) | `buildYear: 1450` (future year vs `currentJalaliYear: 1405`) | Reject future build year or flag invalid date. | Clamps `safeBuildYear = 1405` (`buildingAge = 0`) and applies `+6.5%` brand-new premium. | **PARTIAL (Silent Clamp)** |
| `calculateHedonicValuation` (`hedonicPricingEngine.ts:99-100, 151`) | `floor: 20, totalFloors: 4, hasElevator: true` | Reject `floor > totalFloors` or clamp `floor <= totalFloors`. | Does **not** validate `floor <= totalFloors`; applies `+10.5%` high-rise view bonus (`f > 5`) to a 20th-floor unit in a 4-story building! | **FAIL (`F-A1V-08`)** |
| `calculateHedonicValuation` (`hedonicPricingEngine.ts:98`) | `neighborhood.buyPerSqm: 0, rahn80m: 0` | Flag missing neighborhood baseline. | Silently defaults `hoodBasePerSqm = 120` (`Math.max(15, Number(0) || 120)`) and returns `hedonicTotalMillion: 12050`. | **FAIL (`F-A1V-08`)** |
| `aggregateNeighborhoodMarketMetrics` (`realMarketPriceAggregator.ts:137, 251`) | 3 listings with `askingTotalMillion > 0` but **no meterage (`sqm`) in `description`** | Increment `malformedSampleCount` (`3`) and exclude from per-sqm mean. | `extractListingSpecsFromText` silently defaults `sqm = 85`; all 3 listings are accepted (`malformedSampleCount: 0`, `eligibleObservedCount: 3`), computing a fabricated `observedMeanPerSqm: 183.2`! | **FAIL (`F-A1V-08`)** |
| `aggregateNeighborhoodMarketMetrics` (`realMarketPriceAggregator.ts:247`) | `samples: null as any` or `[]` | Return `0` observed samples, `0` valid samples, `null` IQR, and `0` confidence. | Returns `observedSampleCount: 0`, `evidenceIndexScore: 0`, **but** returns `sampleCount: 12`, `validSampleCount: 12`, `confidenceScore: 74`, `iqrLowPerSqm: 131.3`, `iqrHighPerSqm: 154.3`, and `3` synthetic `autoBargains`. | **FAIL (`F-A1V-03`)** |

---

## 2. Market-Data Adversarial Cases (Section 22.2)

| Adversarial Scenario | Observed Behavior in `realMarketPriceAggregator.ts` (`E1` / `E2`) | Risk Severity |
|---|---|---|
| **1. Duplicate Listing Inflation** | Passing `[sA, sA, sA, sA, sA]` (5 identical references with `id: 'a'`) produces `observedSampleCount: 5`, `eligibleObservedCount: 5`, `evidenceIndexScore: 77`, `confidenceScore: 77`, and `evidenceQuality: 'MODERATE_OBSERVATIONS'`. Zero deduplication exists. | **HIGH (`F-A1V-07`)** |
| **2. Single Extreme Observation in Small Sample (`N = 3`)** | With 2 normal samples (`135M/sqm`, `141M/sqm`) and 1 extreme sample (`330M/sqm`, just below the `2.4x = 340.8M/sqm` predatory cutoff), `sortedPrices` has length `3`, `q1 = sortedPrices[0]`, `q3 = sortedPrices[2]`, so `iqr = q3 - q1` spans the entire range, `1.5 * iqr` trims **zero** items (`excludedOutlierCount: 0`), and the extreme observation pulls `observedMeanPerSqm` upward until blocked only by the arbitrary `±3%` anchor clamp! | **HIGH** |
| **3. Outdated / Stale Observation Dominance** | `aggregateNeighborhoodMarketMetrics` has no timestamp parameter on input samples (`Array<{ id?: string; askingTotalMillion: number; description: string; yearOrAge?: number }>`). A 2-year-old listing is weighted identically to a listing from today. | **MEDIUM** |
| **4. Missing Amenity Negative Bias Inversion** | Because `resolveAmenityStatus` (`lines 172, 174`) sets `defaultValue = true` for `hasParking` and `hasStorage`, any listing that omits mentioning parking/storage is normalized as if it has both (`qMult` is higher by `+0.09` to `+0.105`), which artificially depresses its normalized price (`normPerSqm = rawPerSqm / qMult`) and makes unequipped apartments look like false bargains! | **HIGH** |
| **5. Small Sample Size Producing Falsely Precise Outputs** | When `N = 0, 1, 2`, 12 PRNG synthetic listings generate `iqrLowPerSqm: 131.3` and `iqrHighPerSqm: 154.3` and `confidenceScore: 74`. | **HIGH (`F-A1V-03`)** |

---

## 3. Metamorphic Properties Evaluation (Section 22.3)

| Metamorphic Property | Hold Status | Empirical Proof (`Command 10`) |
|---|---|---|
| **1. Order Invariance:** Reordering equivalent input observations should not arbitrarily change the result. | **HOLDS (for scalar metrics)** | `agg([sA, sB, sC])` and `agg([sC, sB, sA])` produced identical `observedMedianPerSqm`, `observedMeanPerSqm`, `iqrLowPerSqm`, `iqrHighPerSqm`, `dayAnchorPrice` (`137.7`), and `evidenceIndexScore` (`71`). (`autoBargains` array order follows input order). |
| **2. Duplicate Sensitivity:** Duplicating the same observation should not create unjustified additional market evidence. | **VIOLATED (`F-A1V-07`)** | Duplicating `sA` 5 times increased `observedSampleCount` from `1` to `5`, jumped `evidenceIndexScore` from `35` to `77`, flipped `isBootstrapped` from `true` to `false`, and upgraded `evidenceQuality` from `LIMITED_OBSERVATIONS` to `MODERATE_OBSERVATIONS`. (Note: `evaluateComparableProperties` in `valuationTraceAndComparables.ts:212` **does** deduplicate via `seenFingerprints`, proving the pattern exists in the repo but was omitted from `realMarketPriceAggregator.ts`). |
| **3. Missing-Data Transparency:** Removing required information should not silently improve the apparent confidence of the result. | **VIOLATED (`F-A1V-03`)** | Removing all 3 real observations (`N = 3 -> N = 0`) **increased** `confidenceScore` from **`71` to `74`** and **increased** `sampleCount` and `validSampleCount` from **`3` to `12`**! Additionally, removing the meterage text from a listing description (`noSqmInDesc`) did not trigger `malformedSampleCount` (`0`) because `sqm` silently defaulted to `85`. |
| **4. Unit Consistency:** Equivalent values expressed in supported units should produce equivalent normalized outcomes. | **HOLDS** | `parseIranianPriceToMillionToman` (`realMarketPriceAggregator.ts:281-283`) converts `'۱۲.۵ میلیارد'`, `'۱۲ میلیارد و پانصد'`, `'۱۲.۵۰۰.۰۰۰.۰۰۰ تومان'`, and Rial inputs to identical `12500` Million Toman (`verifyPricingEngineIntegrity` Cases 1–6 pass). |
| **5. Source-Failure Transparency:** A failed or empty source should not silently result in a misleadingly complete aggregate. | **PARTIALLY VIOLATED (`F-A1V-03`, `F-A1V-04`)** | While `provenance: 'REFERENCE_BASELINE'` and `evidenceIndexScore: 0` are set when `samples = []`, `iqrLowPerSqm`, `iqrHighPerSqm`, `sampleCount: 12`, `validSampleCount: 12`, `confidenceScore: 74`, and `autoBargains` (`3` synthetic items) are still populated as if 12 listings were evaluated. |
| **6. Geographic Consistency:** Records outside the supported geographic scope should not be treated as valid comparable evidence. | **HOLDS in `valuationTraceAndComparables.ts` / UNGUARDED in `realMarketPriceAggregator.ts`** | `evaluateComparableProperties` (`valuationTraceAndComparables.ts:199`) enforces `c.cityKey !== subject.cityKey`, whereas `aggregateNeighborhoodMarketMetrics` does not verify that `samples[i]` belongs to `hoodId`. |
| **7. Temporal Consistency:** Stale data should not appear more recent because of aggregation or display transformations. | **VIOLATED in `realMarketPriceAggregator.ts`** | Because `seededRandom` re-seeds daily with `Math.floor(Date.now() / 86_400_000)` (`line 260`), neighborhoods with `0` real observations exhibit daily fluctuations in `dayAnchorPrice`, `iqrLowPerSqm`, `iqrHighPerSqm`, and `autoBargains`, creating the illusion of daily market movement from static reference data. |

---

## 4. Test Coverage Quality & Verification Gaps (Section 24)

Inspection of `tests/real-market-price-aggregator.test.ts` (214 lines), `tests/pricing-engine-integrity.test.ts` (16 lines), and `tests/assess-004-hedonic-accuracy-benchmark.test.ts` (233 lines) reveals why all 26 unit test suites pass (`exit 0`) despite the High/Critical findings uncovered in `WS-A1-V`:

| Module | What Existing Tests Verify | Critical Unverified / Masked Failure Modes |
|---|---|---|
| `tests/real-market-price-aggregator.test.ts` | Checks `provenance === 'REFERENCE_BASELINE'` and `evidenceIndexScore === 0` on `[]`; checks `SPARSE_1_TO_2` on 2 samples; checks `MODERATE_3_TO_9` on 4 samples; checks `STATISTICAL_OUTLIER` on 9 samples with 1 outlier (`500M/sqm` vs `200M/sqm` base). | 1. **Explicitly asserts `syntheticSampleCount === 12` on `0` and `2` samples (`lines 19, 32`)**, enshrining the PRNG bootstrap behavior instead of failing on it!<br>2. Does **not** assert `sampleCount === 0` or `validSampleCount === 0` on `[]`.<br>3. Does **not** check `confidenceScore` monotonicity (`74` on `0` samples vs `71` on `3` samples).<br>4. In the outlier test (`line 51`), uses `baseHoodPerSqm = 200` and outlier `500M/sqm` (`2.5x > 2.4x`), and only asserts `excludedOutlierCount >= 1` and `fraudReviewState !== 'FRAUD_CONFIRMED'`, completely missing that `fraudReviewState` was set to `'FRAUD_SUSPECTED'` and `rejectedFraudCount` summed `excludedOutlierCount + suspectedFraudCount`!<br>5. Zero tests for duplicate listings or missing meterage in descriptions. |
| `tests/assess-004-hedonic-accuracy-benchmark.test.ts` | Checks positivity, city ordering, renovation monotonicity, walk-up penalty, `-26%` age floor, `FAST_SALE_FACTOR === 0.88`, and `sellerPriceEvaluation` verdicts (`fair`, `bargain`, `overpriced`). | Zero negative/boundary tests for `sqm <= 0`, `sqm = NaN`, `floor > totalFloors`, or `buyPerSqm = 0`. |
| UI Component Tests | Contract regex checks in `tests/engineering-quality-foundation.test.ts`. | Did not test that `ProductIntelligenceView.tsx` and `CompareModal.tsx` pass `hood.bargains` rather than hardcoded `[]` to `aggregateNeighborhoodMarketMetrics`. |

---

## 5. Recommended Automated Tests for Future Remediation

1. **Zero-Bootstrap Contamination Assertion:** When `samples = []`, assert `sampleCount === 0`, `validSampleCount === 0`, `syntheticSampleCount === 0`, `autoBargains.length === 0`, `iqrLowPerSqm === null`, `iqrHighPerSqm === null`, and `confidenceScore === 0`.
2. **Confidence Monotonicity Metamorphic Test:** Assert `agg(N=0).confidenceScore <= agg(N=1).confidenceScore <= agg(N=2).confidenceScore <= agg(N=3).confidenceScore`.
3. **Idempotent Deduplication Metamorphic Test:** Assert `agg([sA, sA, sA, sA])` produces the exact same `observedSampleCount` (`1`) and `evidenceIndexScore` (`35`) as `agg([sA])`.
4. **Missing-Area Rejection Test:** Assert that a sample `{ askingTotalMillion: 14000, description: 'آپارتمان خوش نقشه بدون ذکر متراژ' }` increments `malformedSampleCount` and is excluded from `observedEvaluated`.
5. **Cross-View Sample Parity Test:** Assert that for any `hood` with `hood.bargains.length > 0`, `NeighborhoodInspectorDrawer`, `ProductIntelligenceView`, and `CompareModal` compute identical `observedSampleCount` and `evidenceIndexScore`.
