# RADAR 2.0 — WS-A1-R Remediation & Engineering Progress Notes

- **Workstream**: `WS-A1-R` (Controlled Remediation, Data Integrity Restoration & Evidence Reconstruction)
- **Parent Workstreams**: `WS-A1` / `WS-A1-V`
- **Timestamp (UTC)**: `2026-11-08T21:40:00Z`
- **Governance Preservation**: Pinned governance files (`docs/engineering/RMEP-001/MASTER-PROMPT.md`, `docs/engineering/RMEP-001/EXECUTION-STATE.json`, `AGENTS.md`, `ARCHITECTURE.md`, `architecture-baseline.json`) and historical `WS-A1` / `WS-A1-V` artifacts remain 100% untouched.
- **Release & Workstream Gate**: `REMEDIATION COMPLETE — AWAITING INDEPENDENT VERIFICATION` (`WS-B AUTHORIZATION: NOT GRANTED`).

---

## 1. Summary of Controlled Remediation (`F-A1V-01` through `F-A1V-08`)

1. **Elimination of Silent `85 sqm` Area Substitution (`F-A1V-01`)**:
   - `extractListingSpecsFromText` in `src/data/realMarketPriceAggregator.ts` now returns `extractedSqm: number | null` and `hasExplicitSqm: boolean`.
   - `aggregateNeighborhoodMarketMetrics` rejects any listing sample without an explicit positive area (`!hasExplicitSqm || sqm <= 0`), incrementing `malformedSampleCount` and `missingAreaSampleCount` rather than fabricating `price / 85`.

2. **Conservative 3-Tier Deduplication & Outlier-vs-Fraud Separation (`F-A1V-02`)**:
   - Exact listing `id` collisions and identical `description|askingTotalMillion|yearOrAge|sqm` fingerprints are rejected as `duplicateSampleCount`.
   - Listings with distinct non-empty IDs and distinct descriptions that share `price|age|sqm` are retained in the valid sample pool and flagged under `probableDuplicateCount`.
   - Statistical IQR outliers (`excludedOutlierCount`) and extreme price deviations (`extremePriceAnomalyCount`, `fraudReviewState: 'UNVERIFIED_PRICE_ANOMALY'`) are strictly separated from `suspectedFraudCount` (`0`) and `rejectedFraudCount` (`0`).

3. **Removal of Unlabeled Synthetic PRNG Fallback (`F-A1V-03`)**:
   - Removed `generateNeighborhoodListingSamples` fallback from `aggregateNeighborhoodMarketMetrics`. Zero valid observations now produce `observedSampleCount: 0`, `syntheticSampleCount: 0`, `autoBargains: []`, and `provenanceSource: 'STATIC_BENCHMARK_FALLBACK'`.
   - Added canonical `buildNeighborhoodListingSamples(hood)` so all UI views feed identical deterministic observed records (`hood.listings` + `hood.bargains`).

4. **Minimum Sample Threshold (`N >= 3`) for IQR & Monotonic Evidence Index (`F-A1V-04`)**:
   - Added `hasSufficientIqrEvidence = trimmed.length >= 3`. When `< 3` valid samples exist, `observedIqrLowPerSqm = null`, `observedIqrHighPerSqm = null`, `iqrLowPerSqm = 0`, `iqrHighPerSqm = 0`.
   - Unified `confidenceScore = evidenceIndexScore` so confidence is strictly monotonic with sample size (`0 -> 0`, `1 -> 35`, `2 -> 52`, `3 -> 71`, `6 -> 85`).

5. **Strict Hedonic Input Validation & Heuristic Disclosure (`F-A1V-05`)**:
   - Added `validateHedonicInputs(params, currentYear)` in `src/data/hedonicPricingEngine.ts`.
   - Invalid inputs (`sqm <= 0`, `NaN`, `Infinity`, `sqm > 1000`, `floor > totalFloors`, invalid `neighborhood.buyPerSqm`) return `isValid: false`, `validationStatus: 'INVALID_INPUT'`, `validationErrors`, and zeroed valuation fields without silent clamping.
   - Added `methodologyKind: 'RULE_BASED_HEURISTIC_MULTIPLIER'` and `isEmpiricallyCalibratedRegression: false`.

6. **Cross-Surface Sample Count Parity & Asking-Price Semantic Honesty (`F-A1V-06`)**:
   - Updated `ProductIntelligenceView.tsx`, `CompareModal.tsx`, `NeighborhoodInspectorDrawer.tsx`, and `NeighborhoodInspectorTabs.tsx` to use `buildNeighborhoodListingSamples(hood)`. Punak (`hood=5`) now consistently displays `۲ نمونه` and `شاخص پوشش ۵۲/۱۰۰` across all surfaces.
   - Removed all claims of completed transaction prices (`تخمین قیمت قطعی معاملات`, `همگرایی قیمت اعلامی با نرخ معامله`) from `ProductIntelligenceView.tsx`, replacing them with explicit asking-price and hypothetical fast-sale negotiation scenario labels.
