# WS-A1-V — RADAR 2.0 Product Acceptance, Quality & Verification Matrix Mapping (Part XI Outputs)

**Workstream ID:** `WS-A1-V`  
**Specification:** `RADAR 2.0 — Product Acceptance, Quality & Verification Matrix` (Parts I–XII, Sections 1–45)  
**Execution Mode:** Read-Only First-Run / Post-WS-A1 Forensic Verification  
**Release Recommendation (Section 45):** **`NO-GO`** (`DECISION C — REJECTED / REMEDIATION REQUIRED`)

---

## 1. Global Quality Gates Assessment (Section 9: Gates `G0`–`G7`)

| Gate ID | Gate Name | Status | Evidence Level | Forensic Justification |
|---|---|---|---|---|
| **Gate G0** | Repository Integrity | **PARTIAL / FAIL** | `E1`, `E3`, `E4` | Zero secrets in repository or ZIP (`1,167/1,167` files match). However, `docs/engineering/WS-G4A-A1.patch` is a fabricated pseudo-patch (`F-A1V-02`), `WS-G4A-A1-EXECUTION-REPORT.md` cites non-existent functions (`F-A1V-01`), and `src/data/hedonicPricingEngine.ts` (`mtime 20:10:45Z`) was omitted from `WS-G4A-A1-MANIFEST.json` (`F-A1V-05`). |
| **Gate G1** | Build and Static Quality | **PASS** | `E1` | `npm run lint` (`tsc --noEmit`) exit `0`; `npm run arch:check` exit `0` (`284` files `<= 300` lines); `npx vite build --outDir /tmp/ws-a1-v-dist` exit `0` (`2,220` modules). |
| **Gate G2** | Domain and Data Integrity | **FAIL** | `E1`, `E2` | `src/data/realMarketPriceAggregator.ts` fabricates 12 PRNG synthetic samples when `N < 3`, yields higher `confidenceScore` on `0` samples (`74`) than `3` real samples (`71`) (`F-A1V-03`), fails to deduplicate repeated listings (`F-A1V-07`), and silently imputes `sqm = 85` when area is missing from listing text (`F-A1V-08`). |
| **Gate G3** | Security and Privacy | **PASS (Current Scope)** | `E1`, `E2` | `npm run test:rules:static` exit `0` (`13/13` static Firestore checks + `9/9` data integrity checks); `escapeHtmlAttr` and `buildExternalDivarUrl` enforced; `.cache-data.json` / `.runtime-config.json` exclude `SECRET_ENV_KEYS` and `buyerLeads`. Full multi-tenant agency isolation (`RADAR-SEC-003`) is not yet implemented as a multi-agency RBAC model (`DEFERRED` to agency workspace phase). |
| **Gate G4** | Critical User Workflows | **PARTIAL / FAIL** | `E1`, `E2` | Core spatial inspection, hedonic calculation, and comparison render with `0` console errors in Playwright, but `ProductIntelligenceView.tsx` and `CompareModal.tsx` pass hardcoded `[]` to `aggregateNeighborhoodMarketMetrics` (`F-A1V-04`), contradicting the Inspector Drawer on the same screen. |
| **Gate G5** | UX, Accessibility, and Localization | **PASS (with minor I18N note)** | `E1`, `E2` | RTL layout, focus management, keyboard controls, and Persian numeral parsing (`normalizePersianText`) work across views (`ProductIntelligenceView.tsx:182, 191` has minor unformatted Latin digits inside Persian copy). |
| **Gate G6** | Decision Integrity and AI | **FAIL** | `E1`, `E2` | `ProductIntelligenceView.tsx:65, 116, 191` labels heuristic `0.93x` asking-price adjustments as `تخمین قیمت قطعی معاملات (مدل v6.4)` and displays PRNG-derived `iqrLowPerSqm`/`iqrHighPerSqm` (`131.3 تا 154.3 م.ت`) as valid statistical IQR (`F-A1V-03`, `F-A1V-04`). |
| **Gate G7** | Observability and Recovery | **PASS** | `E1`, `E2` | `valuationTraceAndComparables.ts` produces deterministic `trc_*` audit digests (`REPRODUCIBLE_EXACT`); `server.ts` and `ProcessResourceLifecycleManager` enforce bounded timers and atomic disk recovery. |

---

## 2. Section 42 — Acceptance Mapping Report (`RADAR-*` Requirements)

### 2.1 In-Scope `WS-A1` Requirements (Data, Epistemic Integrity, Domain Valuation & UI Disclosure)

| Requirement ID | Priority | Types | Status | Implemented Evidence | Test Evidence | Gap | Risk | Next Action |
|---|---|---|---|---|---|---|---|---|
| **`RADAR-DATA-001`** (Property & market attributes carry appropriate evidence state) | **P1** | `DATA`, `EPI`, `DOM` | **`VERIFIED_FAIL`** | `realMarketPriceAggregator.ts:17-34` defines `MarketDataProvenance` and `EpistemicDataStatus`; `NeighborhoodInspectorDrawer.tsx:86-99` renders badges. | `tests/real-market-price-aggregator.test.ts` (exit `0`), Playwright (`Command 9`), Adversarial Probe (`Command 10`). | 1. `ProductIntelligenceView.tsx:47,231` and `CompareModal.tsx:8` pass `[]`, erasing `hood.bargains` (`F-A1V-04`).<br>2. `extractListingSpecsFromText:137,78,170-175` silently imputes `sqm=85`, `age=10`, `floor=2`, `hasParking=true` without an `INFERRED`/`MISSING` state (`F-A1V-08`). | **HIGH** | Pass mapped `hood.bargains` in all views; reject or explicitly flag listings with missing `sqm`. |
| **`RADAR-DATA-002`** (Units and numeric attributes are unambiguous) | **P1** | `DATA`, `FUNC`, `I18N` | **`VERIFIED_FAIL`** | `src/utils/areaUnit.ts`, `parseIranianPriceToMillionToman` (`realMarketPriceAggregator.ts:95-134`), `hedonicPricingEngine.ts:96-105`. | `tests/pricing-engine-integrity.test.ts` (exit `0`), Adversarial Probe (`Command 10`). | Persian/Arabic digits and Billion/Million/Rial units parse accurately, **but** `hedonicPricingEngine.ts:97-100` silently clamps `sqm <= 0` to `30`, `sqm: NaN` to `85`, and `floor: 20` in a 4-floor building (`+10.5%` bonus) without validation error (`F-A1V-08`). | **HIGH** | Add explicit input validation boundary for `sqm <= 0`, `NaN`, and `floor > totalFloors`. |
| **`RADAR-DATA-004`** (Geographic claims communicate precision and source) | **P1** | `DATA`, `EPI`, `UX` | **`IMPLEMENTED_UNVERIFIED`** | `src/data/neighborhoods.ts`, `src/data/listingFraudAndAddressEngine.ts`, `NeighborhoodInspectorDrawer.tsx`. | `npm run test:unit` (exit `0`). | Neighborhood centroids are represented honestly as regional profiles in Drawer, but `applySpatialGrowthFallback` (`realMarketPriceAggregator.ts:233-241`) interpolates across a `12 km` radius without UI disclosure. | **MEDIUM** | Disclose when growth rate is spatially interpolated from neighboring zones. |
| **`RADAR-EPI-001`** (Claims are distinguishable from evidence) | **P1** | `EPI`, `DATA`, `UX` | **`VERIFIED_FAIL`** | `NeighborhoodInspectorTabs.tsx:183-220` separates asking prices from hypothetical negotiation estimates (`ضریب فرضی سناریوی مذاکره`). | Playwright (`Command 9`), Static Inspection (`E2`). | `ProductIntelligenceView.tsx:65, 116, 191` still labels heuristic `0.93x` asking-price estimates as **`تخمین قیمت قطعی معاملات (مدل v6.4)`** and **`جایگاه معامله قطعی`** (`F-A1V-04`). | **HIGH (Release Blocker)** | Replace closing-transaction wording in `ProductIntelligenceView.tsx` with scenario-based asking-discount terminology. |
| **`RADAR-EPI-002`** (Uncertainty is calibrated and comprehensible) | **P1** | `EPI`, `UX`, `AI` | **`VERIFIED_FAIL`** | `valuationTraceAndComparables.ts:110-114` (`isStatisticalConfidenceInterval: false`), `realMarketPriceAggregator.ts:265-275`. | Adversarial Probe (`Command 10`), Playwright (`Command 9`). | 1. `confidenceScore` in `realMarketPriceAggregator.ts:274` is **`74` on `0` observed samples** vs **`71` on `3` real observed samples** (`F-A1V-03`).<br>2. When `N < 3`, `iqrLowPerSqm` and `iqrHighPerSqm` (`131.3 – 154.3 م.ت`) are computed from 12 PRNG synthetic samples and displayed in UI as valid neighborhood IQR! | **HIGH (Release Blocker)** | Eliminate PRNG synthetic IQR and fix `confidenceScore` monotonicity when `observedEvaluated.length < 3`. |
| **`RADAR-EPI-003`** (Evidence freshness is explicit) | **P1** | `EPI`, `DATA` | **`VERIFIED_FAIL`** | `valuationTraceAndComparables.ts:190, 208` checks 90-day freshness (`maxStaleMs`), `driftRankingConsentAndEnvironment.ts`. | `tests/prompts-106-to-145.test.ts` (exit `0`), `Command 10`. | `aggregateNeighborhoodMarketMetrics` (`realMarketPriceAggregator.ts:243-246`) accepts no timestamp on input samples and re-seeds its PRNG every UTC day (`Date.now() / 86_400_000`), making static reference neighborhoods fluctuate daily as if fresh market data arrived (`F-A1V-03`). | **HIGH** | Remove `Date.now()` PRNG seeding and include sample timestamps/freshness state in `aggregateNeighborhoodMarketMetrics`. |
| **`RADAR-DOM-003`** (Property identity and duplicate detection are explainable) | **P1** | `DOM`, `DATA`, `UX` | **`VERIFIED_FAIL`** | `valuationTraceAndComparables.ts:191, 212` (`seenFingerprints`), `listingFraudAndAddressEngine.ts`, `realMarketPriceAggregator.ts:247-260`. | Adversarial Metamorphic Probe (`Command 10`). | While `evaluateComparableProperties` deduplicates by fingerprint, `aggregateNeighborhoodMarketMetrics` performs **zero deduplication**: passing `[sA, sA, sA, sA, sA]` yields `observedSampleCount: 5` and `evidenceIndexScore: 77` (`F-A1V-07`). Also `rejectedFraudCount` sums `excludedOutlierCount` (`F-A1V-03`). | **HIGH (Release Blocker)** | Deduplicate samples by ID and normalized attribute fingerprint in `aggregateNeighborhoodMarketMetrics`; separate `excludedOutlierCount` from `rejectedFraudCount`. |
| **`RADAR-FUNC-009`** (Every operational metric has a definition) | **P1** | `FUNC`, `DATA`, `EPI`, `UX` | **`VERIFIED_FAIL`** | `realMarketPriceAggregator.ts:27-28` (`evidenceIndexFormula`), `NeighborhoodInspectorTabs.tsx:183-220`. | Static Inspection (`E2`), Playwright (`Command 9`). | In `realMarketPriceAggregator.ts:271, 275`, when `observedSampleCount === 0`, `sampleCount` (`12`) and `validSampleCount` (`12`) report the count of synthetic PRNG rows rather than `0`, violating the requirement that *"A zero value is distinguishable from missing data and failed calculation."* | **HIGH** | Set `sampleCount = 0` and `validSampleCount = 0` when `observedEvaluated.length === 0`. |

---

### 2.2 Deferred `WS-B` (`WP-3`) Requirements & Platform-Wide Requirements Mapping

| Requirement ID | Priority | Types | Status | Repository Evidence & Rationale |
|---|---|---|---|---|
| **`RADAR-FUNC-003`** (Requirement-to-property matching is explainable) | **P1** | `FUNC`, `EPI`, `UX`, `AGENCY` | **`DEFERRED` (`WS-B` / `WP-3`)** | In `src/components/useEvaluatedNeighborhoods.ts:27` and `MapLegend.tsx:28-30`, budget-fit and neighborhood quality are still conflated under `optimal` (`ارزنده‌ترین (تطابق کامل)`). Explicitly scoped to `WS-B` (`WP-3`), which is blocked pending `WS-A1` sign-off. |
| **`RADAR-AGENCY-001`..`005`** (Situation-scoped Decision Context & non-coercive preference discovery) | **P1** | `AGENCY`, `UX`, `DATA` | **`DEFERRED` (`WS-B` / `WP-3`)** | `src/components/OnboardingWizardModal.tsx` (283 lines) collects buyer preferences without coercive dark patterns, but wiring all onboarding controls cleanly into separated budget-fit vs quality scoring is scoped to `WS-B` (`WP-3`). |
| **`RADAR-AGENCY-006`..`007`** (Household decision architecture & multi-stakeholder disagreement) | **P1** | `AGENCY`, `SEC`, `UX`, `DOM` | **`NOT_IMPLEMENTED`** | No multi-participant household comparison or private household note boundary exists in `src/types/models.ts` or `firestore.rules`. Future roadmap capability. |
| **`RADAR-DOM-001`**, **`RADAR-DOM-002`**, **`RADAR-DOM-004`**, **`RADAR-DOM-005`** (Agency workspace context, `PhysicalAsset` vs `AgencyRecord` vs `ListingPublication`, CRM entities) | **P0 / P1** | `DOM`, `DATA`, `FUNC`, `SEC` | **`PARTIAL / DEFERRED`** | `src/types/models.ts` and `firestore.rules` implement `/bargains/{id}` + `/bargainOwners/{id}` + `/buyerLeads/{id}` + `/agencyWorkspaces` scaffolding (`src/components/B2BAgencyWorkspaceModal.tsx`), but full 3-layer separation (`PhysicalAsset` / `AgencyRecord` / `ListingPublication`) is not yet split at the schema boundary (`ADR-0002`). |
| **`RADAR-SEC-001`..`007`** (Authentication, server-side RBAC, multi-tenant isolation, media upload safety, privacy & audit logs) | **P0 / P1** | `SEC`, `DOM`, `DATA`, `OBS` | **`VERIFIED_PASS` (Current Single-Tenant/Public-Bargain Scope) / `DEFERRED` (Multi-Agency RBAC)** | Verified by `npm run test:rules:static` (`13/13`), `tests/object-storage-upload-auth.test.ts`, `tests/object-storage-security.test.ts`, and `src/utils/serverAdminSodAndBackupSecurity.ts`. Multi-agency cross-tenant isolation (`RADAR-SEC-003`) requires `ADR-0003` implementation. |
| **`RADAR-AI-001`..`006`** (AI output labeling, reasoning disclosure, human confirmation, privacy boundaries, safe degradation) | **P0 / P1** | `AI`, `EPI`, `SEC`, `REL` | **`VERIFIED_PASS` (Current Scope)** | Enforced by `ADR-005` and `ADR-006` in `src/utils/aiGovernanceAndObservability.ts` (`SIMULATED — NOT A REAL AI RESPONSE` labeling, groundedness checks, zero autonomous mutations). Verified in `npm run test:unit` (`tests/prompts-106-to-145.test.ts`). |
| **`RADAR-I18N-001`..`003`**, **`RADAR-A11Y-001`..`003`**, **`RADAR-UX-001`..`002`** (Persian RTL, digits, keyboard & assistive tech, responsive viewports) | **P1 / P2** | `I18N`, `A11Y`, `UX` | **`VERIFIED_PASS` (with minor digit formatting gap in `ProductIntelligenceView`)** | Verified via `playwright-cli` (`Command 9`) and `tests/prompts-541-to-600-docs-ux-and-architecture.test.ts` (`exit 0`). |
| **`RADAR-REL-001`..`003`**, **`RADAR-PERF-001`..`002`**, **`RADAR-MIG-001`..`002`** (Reliability, concurrency, performance budgets, schema migrations) | **P0 / P1** | `REL`, `PERF`, `MIG` | **`VERIFIED_PASS`** | Verified via `npm run test:unit` and `npm run test:contracts` (`src/utils/serverIdempotencyAndConcurrency.ts`, `src/utils/engineeringAndMigrationGovernance.ts`). |

---

## 3. Section 43 — Executable Test Plan for Failed In-Scope `P0` / `P1` Requirements

### Test Scenario 1: `RADAR-EPI-002` / `RADAR-FUNC-009` — Zero-Sample & Sparse-Sample Honesty (No PRNG Bootstrap Contamination)
- **Test Objective:** Verify that `aggregateNeighborhoodMarketMetrics` does not fabricate synthetic listings, synthetic IQR bounds, or inflated confidence scores when `0`, `1`, or `2` observed listings exist.
- **Test Level:** Unit & Metamorphic (`tests/real-market-price-aggregator.test.ts`).
- **Preconditions:** Neighborhood baseline `baseHoodPerSqm = 142` (`Punak`, `hoodId = 5`).
- **Test Data:** `samples0 = []`, `samples2 = [sA, sB]`, `samples3 = [sA, sB, sC]`.
- **Given / When / Then:**
  - **Given** a neighborhood with `0` observed listing samples (`samples0 = []`),
  - **When** `aggregateNeighborhoodMarketMetrics(5, 'پونک', 142, [])` is executed,
  - **Then** `observedSampleCount` MUST equal `0`, `sampleCount` MUST equal `0`, `validSampleCount` MUST equal `0`, `syntheticSampleCount` MUST equal `0`, `autoBargains` MUST be empty (`[]`), `observedIqrLowPerSqm` and `iqrLowPerSqm` MUST be `null` (or explicitly flagged as unavailable),
  - **And** `confidenceScore` for `0` samples MUST be strictly less than `confidenceScore` for `3` real observed samples (`agg(samples0).confidenceScore < agg(samples3).confidenceScore`).
- **Negative Case:** Calling `aggregateNeighborhoodMarketMetrics` on two consecutive UTC days (`Date.now()` shifted by `+86,400,000 ms`) with identical inputs MUST return 100% identical outputs (zero wall-clock PRNG drift).
- **Evidence Artifact:** `docs/engineering/WS-A1-V/WS-A1-V-COMMAND-EVIDENCE.md` (`Command 10`).

### Test Scenario 2: `RADAR-DOM-003` — Idempotent Listing Deduplication & Outlier-vs-Fraud Separation
- **Test Objective:** Verify that duplicate listing records do not inflate `observedSampleCount` or `evidenceIndexScore`, and statistical outliers do not increment `rejectedFraudCount`.
- **Test Level:** Unit & Metamorphic (`tests/real-market-price-aggregator.test.ts`).
- **Given / When / Then:**
  - **Given** a single valid listing sample `sA = { id: 'a', askingTotalMillion: 13500, description: '100 متر طبقه 2 از 4 پارکینگ آسانسور انباری', yearOrAge: 5 }`,
  - **When** `aggregateNeighborhoodMarketMetrics(5, 'پونک', 142, [sA, sA, sA, sA, sA])` is called with 5 duplicate copies of `sA`,
  - **Then** `observedSampleCount` (unique valid observations) MUST equal `1`, `evidenceIndexScore` MUST equal `35` (not `77`), and `evidenceQuality` MUST remain `'LIMITED_OBSERVATIONS'` (not `'MODERATE_OBSERVATIONS'`).
  - **And when** a sample set of 9 valid listings plus 1 high-priced statistical outlier (`310M/sqm` vs `142M/sqm` base) is evaluated,
  - **Then** `excludedOutlierCount` MUST equal `1`, `rejectedFraudCount` MUST equal `0`, and `fraudReviewState` MUST equal `'STATISTICAL_OUTLIER'` (never `'FRAUD_SUSPECTED'`).

### Test Scenario 3: `RADAR-DATA-001` / `RADAR-DATA-002` — Rejection of Missing-Area Listings & Invalid Hedonic Inputs
- **Test Objective:** Verify that missing meterage (`sqm`) in listing descriptions is never silently defaulted to `85 sqm`, and invalid `sqm <= 0` / `NaN` or `floor > totalFloors` inputs are rejected or flagged.
- **Test Level:** Unit (`tests/real-market-price-aggregator.test.ts`, `tests/assess-004-hedonic-accuracy-benchmark.test.ts`).
- **Given / When / Then:**
  - **Given** a listing sample `{ id: 'm1', askingTotalMillion: 14000, description: 'آپارتمان خوش نقشه در پونک بدون ذکر متراژ' }` with no area specified,
  - **When** `aggregateNeighborhoodMarketMetrics` evaluates the sample,
  - **Then** `malformedSampleCount` MUST increment by `1`, and the sample MUST NOT be divided by a default `85 sqm` or included in `observedEvaluated`.

### Test Scenario 4: `RADAR-DATA-001` / `RADAR-EPI-001` — Cross-View Sample Consistency & Non-Deceptive Deal Framing
- **Test Objective:** Verify that `NeighborhoodInspectorDrawer`, `ProductIntelligenceView`, and `CompareModal` report identical observed sample counts for the same neighborhood, and no view labels heuristic asking-price discounts as confirmed closing transactions.
- **Test Level:** Integration / Playwright E2E (`http://localhost:3000/?hood=5&compare=5-14` and `?hood=5&view=intelligence`).
- **Given / When / Then:**
  - **Given** neighborhood `Punak` (`hoodId = 5`) which has `2` observed listings in `hood.bargains`,
  - **When** the user opens `NeighborhoodInspectorDrawer`, `ProductIntelligenceView`, and `CompareModal` for `hood = 5`,
  - **Then** all three views MUST display `۲ آگهی` and `شاخص پوشش شواهد: ۵۲/۱۰۰` (never `۰ آگهی`),
  - **And** `ProductIntelligenceView` MUST NOT contain the strings `'تخمین قیمت قطعی معاملات'` or `'جایگاه معامله قطعی'`.

---

## 4. Section 44 & Section 45 — Verification Summary & Release Recommendation

- **Verification Summary:** See `docs/engineering/WS-A1-V/WS-A1-V-COMMAND-EVIDENCE.md` for all 10 executed command blocks, timestamps, exit codes, and browser verifications (`26/26` unit test files passed, contract suite passed, static Firestore rules passed, isolated Vite production build passed, live Playwright inspection completed).
- **Release Recommendation (Section 45):** **`NO-GO`** (`DECISION C — REJECTED / REMEDIATION REQUIRED`).
  - **Blocking Requirement IDs:** `RADAR-DATA-001`, `RADAR-DATA-002`, `RADAR-DOM-003`, `RADAR-FUNC-009`, `RADAR-EPI-001`, `RADAR-EPI-002`, `RADAR-EPI-003`, and **Gate G0 / Gate G2 / Gate G4 / Gate G6** (`F-A1V-01`, `F-A1V-02`, `F-A1V-03`, `F-A1V-04`, `F-A1V-07`, `F-A1V-08`).
  - **Authorization Boundary:** Human decision-maker review is required; `WS-B` (`WP-3`) remains **NOT AUTHORIZED**.
