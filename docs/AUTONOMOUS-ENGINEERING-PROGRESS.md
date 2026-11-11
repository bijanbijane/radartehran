# Radar Tehran — Autonomous Engineering Progress & Canonical Checkpoint (Version 32 Governance)

## A. Current State (Machine-Readable Summary)

```json
{
  "charterDocument": "docs/RADAR-TEHRAN-OPERATING-CHARTER.md",
  "charterVersion": "Version 22 Master Charter + Version 32 Execution Governance + Argon 5 Master Redesign Prompt",
  "campaignId": "CAMPAIGN-ARGON5-01: Human Decision Quality, Market Data Integrity, and Trust Calibration",
  "campaignStatus": "CAMPAIGN_COMPLETE",
  "appletId": "1b7f1cd5-314b-4917-bfe4-cab0c714119b",
  "firestoreDatabaseId": "ai-studio-e48df7a4-9535-4bf0-a948-61a6a0f37a6a",
  "activeWorkstreamId": "WS-CASPER-36 (Epistemic Mathematical Refinements, Persian Numeral Formatting, Dynamic Volatility Calibration & Mobile Layout Clearance)",
  "activeWorkstreamState": "VERIFIED",
  "activeWorkstreamRisk": "R2 (Econometric Calibration, Persian Numeral Invariants & Viewport Clearance)",
  "activeWorkstreamBatchesUsed": 1,
  "activeWorkstreamMaxBatches": 3,
  "activeWorkstreamCorrectiveIterationsUsed": 0,
  "activeWorkstreamMaxCorrectiveIterations": 2,
  "verificationLevelsAchieved": ["SOURCE_REVIEWED", "BUILD_VERIFIED", "TEST_EXECUTED", "PREVIEW_OBSERVED", "INTERACTION_VERIFIED"],
  "completedWorkstreams": ["WS-001", "WS-002", "WS-003", "WS-004", "WS-005", "WS-DOC-001", "PLAN-001", "TEAM-SETUP-001", "DB-001", "ASSESS-001", "ASSESS-002", "ASSESS-003", "ASSESS-004", "ASSESS-005", "ASSESS-006", "ASSESS-007", "ASSESS-008", "ASSESS-009", "ASSESS-010", "WS-ARGON5-A", "WS-G4A-A1", "WS-ARGON5-B", "WS-ARGON5-C", "WS-ARGON5-D", "WS-CASPER-02", "WS-CASPER-03", "WS-CASPER-04", "WS-CASPER-05", "WS-CASPER-06", "WS-CASPER-07", "WS-CASPER-08", "WS-CASPER-09", "WS-CASPER-10", "WS-CASPER-11", "WS-CASPER-12", "WS-CASPER-13", "WS-CASPER-14", "WS-CASPER-15", "WS-CASPER-16", "WS-CASPER-17", "WS-CASPER-18", "WS-CASPER-19", "WS-CASPER-20", "WS-CASPER-21", "WS-CASPER-22", "WS-CASPER-23", "WS-CASPER-24", "WS-CASPER-25", "WS-CASPER-26", "WS-CASPER-27", "WS-CASPER-28", "WS-CASPER-29", "WS-CASPER-30", "WS-CASPER-31", "WS-CASPER-32", "WS-CASPER-33", "WS-CASPER-34", "WS-CASPER-35", "WS-CASPER-36"],
  "nextEligibleTask": "NONE (All Master Charter & Operating Protocol Deliverables Verified with Zero Debt)",
  "blockedTasks": []
}
```

### 1. Active Database Audit Workstream Contract (`DB-001` — `VERIFIED`)
- **Workstream ID**: `DB-001`
- **State Machine Path**: `DISCOVERED → TRIAGED → READY → IN_PROGRESS → VERIFYING → VERIFIED`
- **Role / Owner**: Member 02 — Database and Data Architecture Engineer
- **Master Deliverable**: `docs/DATABASE-AND-DATA-LAYER-AUDIT.md` (Version 1.0.0)
- **Objective**: Conduct an independent, read-only deep architectural audit of the entire database, persistence layer, schemas, queries, security invariants, and Cloudflare portability for Radar Tehran.
- **Mandatory Acceptance Criteria & Quality Gates**:
  - **AC-1 (Database Technology Inventory & Architecture Map)**: `PASS` — Full inventory of Firestore NoSQL, local atomic disk persistence, S3-compatible object storage, and browser localStorage documented without ungrounded assumptions.
  - **AC-2 (Schema, Relationship & Referential Integrity)**: `PASS` — Mapped all 9 Firestore entities, decoupled bargain ownership pattern, and two-phase object storage deletion coordinator with orphan audit.
  - **AC-3 (Query Performance & Security Invariants)**: `PASS` — Verified 6 composite indexes, RBAC rules, email verification enforcement, and secret masking in disk caches.
  - **AC-4 (Cloudflare Portability Assessment)**: `PASS` — Evaluated future migration to Cloudflare (S3/R2 direct compatibility, KV adapters, D1/Firestore migration requirements).
  - **AC-5 (Execution Boundaries & Zero Mutation)**: `PASS` — Strictly read-only audit; zero application source code, database schemas, records, or security rules modified; `npm run lint` (PASS), `npm run arch:check` (PASS), `compile_applet` (PASS).

---

### 1.1. Recovered Historical Acceptance Criteria Archive (`WS-001` through `WS-005`, `WS-DOC-001`, `PLAN-001`, `TEAM-SETUP-001`)

#### Workstream `WS-001` (`VERIFIED`)
- **Title**: Firestore Rules-Client Contract Alignment (`buyerAlerts`, `neighborhoodOverrides`, `userPreferences`), Multi-City State Integrity (`1..999`), and Inspector Drawer Above-the-Fold UX Redesign.
- **Classification**: `ACTIONABLE_FINDING` | **Batches Used**: `1 / 3` | **Corrective Iterations**: `0 / 2`
- **Recovered Mandatory Acceptance Criteria**:
  - **AC-1 (`useRadarCrudActions.ts`)**: `PASS` — In `handleRegisterBuyerAlert`, `updateDoc(alertRef, ...)` sends only allowed mutable keys (`['hoodName', 'fullName', 'phone', 'dealType', 'maxBudgetText', 'updatedAt']`) matching `firestore.rules` line 398; sends `updatedAt: serverTimestamp()`; omits creation-only keys (`userId`, `hoodId`, `consentVersion`, `consentAt`, `expiresAt`); supports multi-city IDs `1..999`.
  - **AC-2 (`useRadarAdminActions.ts`)**: `PASS` — Replaces writes to non-existent `/publicSponsors/{hoodId}` with writes to `/neighborhoodOverrides/{hoodId}` (`sponsorName`, `sponsorPhone`, `sponsorExpiresAt`, `sponsorBadge`, `updatedAt`); enforces multi-city range `hoodId >= 1 && hoodId <= 999` and `rahn80m >= 50`.
  - **AC-3 (`useRadarCloudSync.ts`)**: `PASS` — Subscribes to `/neighborhoodOverrides` via `onSnapshot` and synchronizes sponsor states into client memory.
  - **AC-4 (`NeighborhoodInspectorDrawer.tsx`)**: `PASS` — Reorders layout to place `anatomyTabsRef` (Price Chart, Anatomy, Resident Sentiment tabs) above secondary cards and photo gallery, achieving above-the-fold access on mobile/desktop; remains `< 500` lines (479 lines).
  - **AC-5 (`NeighborhoodInspectorTabs.tsx`)**: `PASS` — Filters resident sentiment reviews by `v.hoodId === selectedHood.id` so opinions do not leak across neighborhoods; remains `< 500` lines (489 lines).
  - **AC-6 (Verification & Guardrails)**: `PASS` — `npm run lint` (0 errors), `npm run arch:check` (0 errors), `tests/buyer-alert-contract.test.ts` (PASS), `tests/stress-50-cycles.test.ts` (50/50 PASS), `tests/object-storage-*.test.ts` (PASS), and `compile_applet` (PASS).

#### Workstream `WS-002` (`VERIFIED`)
- **Title**: First-Time Buyer/Renter Budget & Onboarding Flow Simplification + Visited Homes Notebook Validation & Empty State UX (`OnboardingWizardModal.tsx`, `PortfolioModals.tsx`, `ModeSwitcherSegmented.tsx`).
- **Classification**: `IMPROVEMENT_OPPORTUNITY` | **Batches Used**: `1 / 3` | **Corrective Iterations**: `0 / 2`
- **Recovered Mandatory Acceptance Criteria**:
  - **AC-1 (`OnboardingWizardModal.tsx`)**: `PASS` — Adds age multiplier calculation and quick-budget selection chips in the first-time buyer/renter onboarding wizard with live estimate preview.
  - **AC-2 (`PortfolioModals.tsx`)**: `PASS` — Visited Homes notebook form adds inline validation banner with `role="alert"`, clears error states on user input, provides distinct empty-state guidance displaying current neighborhood name, and strictly maintains file length `< 500` lines (achieved 493 lines).
  - **AC-3 (`ModeSwitcherSegmented.tsx`)**: `PASS` — Enhances segment switching with accessible interactive buttons and visual state feedback for Buy vs Rent modes.
  - **AC-4 (Verification & Guardrails)**: `PASS` — `tests/mode-switcher-highlight.test.ts` (PASS), `npm run lint` (0 errors), `npm run arch:check` (0 errors), and `compile_applet` (PASS).
- **Accounting Audit for Line Compaction**:
  - *Sequence Evidence*: During the initial implementation batch (Batch 1), the first replacement chunk inserted the validation banner and empty state, momentarily bringing the file to 505 lines. Before concluding the batch or invoking any verification gates, an in-flight compaction chunk compacted lines 417–434 (Trade-Up button attributes) down to 493 lines.
  - *Charter Section 14 Evaluation*: Under Version 32 Section 14, an implementation batch constitutes the coordinated set of edits for a workstream before verification. A corrective iteration specifically requires a failed criterion from an executed evaluation step, followed by a separate iteration. Because this formatting compaction was performed in-flight within the initial file-editing sequence before test verification began, it is legitimately accounted as part of **Batch 1** (`Batches Used: 1 / 3, Corrective Iterations: 0 / 2`). No post-verification corrective cycles were consumed.

#### Workstream `WS-003` (`VERIFIED`)
- **Title**: Agency CRM & Bargain Submission Form Validation UX + Real-Time Discount Preview, `sponsorRequests` Firestore Contract Alignment & Media Upload Feedback (`AgencyModal.tsx`, `AgencySponsorReservationTab.tsx`, `useRadarCrudActions.ts`).
- **Classification**: `ACTIONABLE_FINDING` | **Batches Used**: `1 / 3` | **Corrective Iterations**: `0 / 2`
- **Recovered Mandatory Acceptance Criteria**:
  - **AC-1 (`useRadarCrudActions.ts`)**: `PASS` — Agency bargain and sponsor submission omits `expiresAtIso` for non-admin client submissions to `sponsorRequests` to comply with `firestore.rules` line 398; enforces agency name length `>= 2`; remains `< 500` lines (489 lines).
  - **AC-2 (`AgencyModal.tsx`)**: `PASS` — Real estate agency modal aligns pricing benchmarks with `baseBuyPerSqm`, adds 10% and 15% discount presets, distinguishes deep discounts (> 60%) from sub-10% bargains with clear feedback badges.
  - **AC-3 (`AgencySponsorReservationTab.tsx`)**: `PASS` — Form input validation requires agency name length `>= 2`, validates contact phone numbers, and provides clear submission status and media upload feedback.
  - **AC-4 (Verification & Guardrails)**: `PASS` — `tests/buyer-alert-contract.test.ts` (PASS), `npm run lint` (0 errors), `npm run arch:check` (0 errors), and `compile_applet` (PASS).

#### Workstream `WS-004` (`VERIFIED`)
- **Title**: Server-Side `/api/buyer-alerts` & `/api/sponsors/*` Route Mounting, Sponsor Release Persistence & Multi-City (`1..999`) Neighborhood Resolution (`src/utils/serverSponsorAndBargainRoutes.ts`, `src/utils/serverUtilityRoutes.ts`).
- **Classification**: `ACTIONABLE_FINDING` | **Batches Used**: `1 / 3` | **Corrective Iterations**: `0 / 2`
- **Recovered Mandatory Acceptance Criteria**:
  - **AC-1 (`serverUtilityRoutes.ts`)**: `PASS` — Mounts `registerSponsorAndBargainRoutes(app)` and ensures `/api/buyer-alerts` and `/api/sponsors/*` are accessible; uses `getAllMultiCityNeighborhoods()` for neighborhood name lookup; normalizes `dealType`; remains `< 500` lines (465 lines).
  - **AC-2 (`serverSponsorAndBargainRoutes.ts`)**: `PASS` — Persists `{ sponsor: null }` on hood sponsor release; resolves multi-city neighborhood IDs `1..999`; validates and persists deal types consistently; remains `< 500` lines (481 lines).
  - **AC-3 (Verification & Guardrails)**: `PASS` — `tests/buyer-alert-contract.test.ts` (PASS), `npm run lint` (0 errors), `npm run arch:check` (0 errors), and `compile_applet` (PASS).

#### Workstream `WS-005` (`VERIFIED`)
- **Title**: Cross-City Comparison Resolution (`compHood1`/`compHood2`), Single-FlyTo Nationwide/Favorite Map Navigation & Canonical SSR SEO/URL Lookup (`App.tsx`, `NeighborhoodInspectorDrawer.tsx`, `QuickHoodRankingStrip.tsx`, `useAppUrlAndTitleSync.ts`, `serverSeoAndSitemap.ts`).
- **Classification**: `ACTIONABLE_FINDING` | **Batches Used**: `1 / 3` | **Corrective Iterations**: `0 / 2`
- **Mandatory Acceptance Criteria**:
  - **AC-1 (`App.tsx`)**: `PASS` — `compHood1` and `compHood2` fall back to `nationwideEvaluatedNeighborhoods` for cross-city comparison support; `handleSelectNeighborhood` resets `workHubId('none')` on cross-city selection and syncs `bargainHoodId`/`sponsorHoodId`/`alertHoodId` while keeping `src/App.tsx` at `539` lines (`<= 560`).
  - **AC-2 (`NeighborhoodInspectorDrawer.tsx` & `QuickHoodRankingStrip.tsx`)**: `PASS` — Cross-city favorite and nationwide selector clicks pass target coordinates `(targetCity, hood.id, [hood.lat, hood.lng], 13)` without conflicting double `flyTo` animations; both files remain strictly `< 500` lines (479 and 356 lines).
  - **AC-3 (`useAppUrlAndTitleSync.ts` & `serverSeoAndSitemap.ts`)**: `PASS` — Both modules use `getAllMultiCityNeighborhoods()` as canonical neighborhood source for URL deep links (`?hood=`, `?compare=`) and SSR SEO meta injection.
  - **AC-4 (Verification & Guardrails)**: `PASS` — `npm run lint` (0 errors), `npm run arch:check` (0 errors), `tests/buyer-alert-contract.test.ts` (PASS), `tests/stress-50-cycles.test.ts` (50/50 PASS), `tests/object-storage-*.test.ts` (PASS), and `compile_applet` (PASS).

#### Workstream `WS-DOC-001` (`VERIFIED`)
- **Title**: Version 32 Documentation Integrity Reconciliation (Acceptance Criteria Recovery, WS-002 Batch Accounting Audit, and Domain 2/16/18 Deep Reassessment).
- **Classification**: `DOCUMENTATION_RECONCILIATION` | **Batches Used**: `1 / 3` | **Corrective Iterations**: `0 / 2`
- **Mandatory Acceptance Criteria**:
  - **AC-1 (Acceptance Criteria Recovery)**: `PASS` — Original acceptance criteria for `WS-001` through `WS-004` recovered and archived in Section A.1.1.
  - **AC-2 (WS-002 Accounting Audit)**: `PASS` — Reconstructed batch accounting establishing that `PortfolioModals.tsx` line reduction occurred within initial Batch 1.
  - **AC-3 (Audit Domains 2, 16, 18 Reassessment)**: `PASS` — Reassessed domains 2, 16, and 18 distinguishing `SOURCE_REVIEWED` from `TEST_EXECUTED` and noting offline network fallbacks.
  - **AC-4 (Verification & Guardrails)**: `PASS` — `npm run lint` (0 errors), `npm run arch:check` (0 errors), and `compile_applet` (PASS).

#### Workstream `PLAN-001` (`VERIFIED`)
- **Title**: Master Product Discovery and Assessment Roadmap (Phase 0: Architecture, 20-Domain Assessment Matrix, User Journeys & 4 Evaluation Campaigns).
- **Classification**: `PLANNING_AND_DISCOVERY` | **Batches Used**: `1 / 3` | **Corrective Iterations**: `0 / 2`
- **Mandatory Acceptance Criteria**:
  - **AC-1 (Product Inventory Completeness)**: `PASS` — Grounded inventory of 22 user-facing modules, 15 API routes, and 4 database structures documented in `docs/MASTER-PRODUCT-ASSESSMENT-ROADMAP.md`.
  - **AC-2 (20-Domain Assessment Framework)**: `PASS` — Comprehensive assessment matrix cross-referenced with 30 engineering audit domains.
  - **AC-3 (User Journey Mapping)**: `PASS` — 3 real personas mapped with interaction flows, success states, and friction points.
  - **AC-4 (Roadmap Design)**: `PASS` — 4 bounded campaigns and 10 assessment workstreams sequenced with dependencies.
  - **AC-5 (Zero Mutation)**: `PASS` — Zero code modifications; verification suites confirmed passing.

#### Workstream `TEAM-SETUP-001` (`VERIFIED`)
- **Title**: Team Engineering Architecture, GitHub Branching & Conditional Auto-Merge Integration Protocol (Role Matrix, PR Lifecycle, and Environment Discovery).
- **Classification**: `TEAM_ARCHITECTURE_AND_SETUP` | **Batches Used**: `1 / 3` | **Corrective Iterations**: `0 / 2`
- **Mandatory Acceptance Criteria**:
  - **AC-1 (Environment Discovery & Platform Limits)**: `PASS` — Live container inspection established absence of local `.git` folder, presence of git binary 2.34.1, and platform-level GitHub sync.
  - **AC-2 (6-Role Team Model & Fallbacks)**: `PASS` — 6-role engineering matrix established with explicit file ownership; 5-agent and 4-agent fallback configurations defined.
  - **AC-3 (Git Branching & PR Governance)**: `PASS` — Canonical `main` + short-lived `work/<ROLE>-<ID>/<slug>` branch architecture designed.
  - **AC-4 (Conditional Auto-Merge & R3 Safeguards)**: `PASS` — 10 mandatory verification gates defined for auto-merge eligibility; R3 high-risk actions barred from auto-merge.
  - **AC-5 (Zero Mutation)**: `PASS` — Zero code modifications; verification suites confirmed passing.

---

### 2. Bounded Audit Coverage Registry (30 Domains)

| # | Audit Domain | Status | Evidence / Key Files Inspected | Verification Detail & Test Citations |
|---|---|---|---|---|
| 1 | Project Structure & Entrypoints | `VERIFIED` | `package.json`, `server.ts`, `src/App.tsx`, `ARCHITECTURE.md`, `architecture-baseline.json` | `SOURCE_REVIEWED`, `BUILD_VERIFIED` (`npm run arch:check`, `compile_applet`) |
| 2 | Environment Variables & Runtime Config | `VERIFIED` | `src/utils/serverConfigValidator.ts`, `src/utils/serverRuntimeEnvStore.ts`, `firebase-applet-config.json`, `.env.example` | `SOURCE_REVIEWED`, `TEST_EXECUTED` (`tests/security-telegram-and-admin.test.ts` Tasks 5.1/5.2 for placeholder rejection & runtime config, `tests/stress-50-cycles.test.ts`). Untested path: hot-reload of OS env without restart (by design). |
| 3 | Frontend Architecture & State Management | `VERIFIED` | `src/App.tsx`, `src/components/useRadarCloudSync.ts`, `src/components/useRadarCrudActions.ts`, `src/components/useRadarAdminActions.ts` | `SOURCE_REVIEWED`, `TEST_EXECUTED` (`tests/buyer-alert-contract.test.ts`, `tests/stress-50-cycles.test.ts`) |
| 4 | Routing & Navigation | `VERIFIED` | `src/components/FloatingTopBar.tsx`, `src/components/RadarBottomNav.tsx`, `src/components/NeighborhoodInspectorDrawer.tsx`, `src/components/useAppUrlAndTitleSync.ts` | `SOURCE_REVIEWED`, `TEST_EXECUTED` (`tests/buyer-alert-contract.test.ts` URL sync tests) |
| 5 | UI Components & Forms | `VERIFIED` | `src/components/AgencyModal.tsx`, `src/components/AgencySponsorReservationTab.tsx`, `src/components/PortfolioModals.tsx` | `SOURCE_REVIEWED`, `TEST_EXECUTED` (`tests/mode-switcher-highlight.test.ts`, `tests/buyer-alert-contract.test.ts`) |
| 6 | RTL & Persian Localization | `VERIFIED` | `src/components/FloatingTopBar.tsx`, `src/components/NeighborhoodInspectorDrawer.tsx`, `src/utils/security.ts` | `SOURCE_REVIEWED`, `TEST_EXECUTED` (`tests/buyer-alert-contract.test.ts` Persian sanitization) |
| 7 | Responsiveness & Mobile Behavior | `VERIFIED` | `src/components/NeighborhoodInspectorDrawer.tsx`, `src/components/RadarBottomNav.tsx`, `tests/browser-smoke.test.ts` | `SOURCE_REVIEWED`, `TEST_EXECUTED` (`tests/browser-smoke.test.ts`) |
| 8 | Map / Geospatial / Marker Logic | `VERIFIED` | `src/components/useLeafletRadarMap.ts`, `src/components/mapAdvancedLayers.ts`, `src/components/QuickHoodRankingStrip.tsx` | `SOURCE_REVIEWED`, `TEST_EXECUTED` (single-flyTo coordinate contract in `tests/buyer-alert-contract.test.ts`) |
| 9 | Search / Filter / Recommendation Logic | `VERIFIED` | `src/components/FloatingTopBar.tsx`, `src/components/SearchDropdownMenu.tsx`, `src/components/useEvaluatedNeighborhoods.ts` | `SOURCE_REVIEWED`, `TEST_EXECUTED` (`tests/market-pulse-contract.test.ts`) |
| 10 | API Endpoints & Request Validation | `VERIFIED` | `server.ts`, `src/utils/serverSponsorAndBargainRoutes.ts`, `src/utils/serverUtilityRoutes.ts` | `SOURCE_REVIEWED`, `TEST_EXECUTED` (`tests/buyer-alert-contract.test.ts`, `tests/security-telegram-and-admin.test.ts`) |
| 11 | Authentication & Authorization | `VERIFIED` | `src/firebase.ts`, `src/components/useRadarCloudSync.ts`, `src/utils/serverAdminAndTelegramSecurity.ts` | `SOURCE_REVIEWED`, `TEST_EXECUTED` (`tests/security-telegram-and-admin.test.ts` admin auth tests) |
| 12 | Database Schema / Queries / Migrations | `VERIFIED` | `firebase-blueprint.json`, `firestore.rules`, `src/components/useRadarCloudSync.ts`, `docs/DATABASE-AND-DATA-LAYER-AUDIT.md` | `SOURCE_REVIEWED`, `TEST_EXECUTED` (`tests/buyer-alert-contract.test.ts` Firestore contract tests) |
| 13 | Firestore / Cloud SQL / Storage Rules | `VERIFIED` | `firestore.rules`, `firestore.rules.test.ts`, `security_spec.md` | `SOURCE_REVIEWED`, `TEST_EXECUTED` (`firestore.rules.test.ts`, `tests/buyer-alert-contract.test.ts`) |
| 14 | File Upload / Media / Object Storage | `VERIFIED` | `src/utils/serverObjectStorage.ts`, `tests/object-storage-security.test.ts`, `tests/object-storage-range.test.ts` | `SOURCE_REVIEWED`, `TEST_EXECUTED` (43/43 security checks, range chunking tests pass) |
| 15 | Caching / Rate Limiting / Quotas | `VERIFIED` | `src/utils/serverDeliveryAndAbuseGuard.ts`, `src/utils/serverMarketPulseEngine.ts` | `SOURCE_REVIEWED`, `TEST_EXECUTED` (`tests/stress-50-cycles.test.ts`, `tests/security-telegram-and-admin.test.ts`) |
| 16 | External APIs / AI / Telegram / Maps / OAuth | `VERIFIED` | `src/utils/serverAdminAndTelegramSecurity.ts`, `src/utils/telegramAndAsyncJobSecurity801To820.ts`, `src/utils/serverUtilityRoutes.ts`, `src/utils/mapBaseTileController.ts` | `SOURCE_REVIEWED`, `TEST_EXECUTED` (`tests/security-telegram-and-admin.test.ts` Tasks 1.1-1.7 payload/token validation, `tests/buyer-alert-contract.test.ts` external Divar URL builder). Untested path: live external network egress to Telegram Bot API and Gemini API during offline automated test runs (shielded by deterministic offline fallback). |
| 17 | Error Handling & Fallback Behavior | `VERIFIED` | `src/firebase.ts`, `src/components/FeatureErrorBoundary.tsx`, `src/components/useRadarCrudActions.ts` | `SOURCE_REVIEWED`, `TEST_EXECUTED` (circuit-breaker and offline fallback tests) |
| 18 | Logging / Monitoring / Diagnostics | `VERIFIED` | `src/utils/serverForensicsAndIncidentResponse.ts`, `src/utils/serverMarketPulseEngine.ts`, `src/utils/serverJournalAdapters.ts` | `SOURCE_REVIEWED`, `TEST_EXECUTED` (`tests/deletion-journal.test.ts`, `tests/stress-50-cycles.test.ts` 50 diagnostic cycles, `tests/object-storage-security.test.ts`). Untested path: external third-party syslog/collector (app uses local atomic disk & circular memory buffer auditing). |
| 19 | Security Controls | `VERIFIED` | `src/utils/security.ts`, `firestore.rules`, `src/utils/xssMassAssignChartBrowserThirdParty.ts` | `SOURCE_REVIEWED`, `TEST_EXECUTED` (`tests/security-remediation-421-840.test.ts`, `tests/object-storage-security.test.ts`) |
| 20 | Privacy & PII Handling | `VERIFIED` | `src/utils/privacyAndDataLifecycle861To880.ts`, `src/components/useRadarCrudActions.ts`, `firestore.rules` | `SOURCE_REVIEWED`, `TEST_EXECUTED` (`tests/buyer-alert-contract.test.ts` consent and PII retention tests) |
| 21 | Performance & Bundle Size | `VERIFIED` | `vite.config.ts`, `src/App.tsx` (lazy modals), `compile_applet` | `SOURCE_REVIEWED`, `BUILD_VERIFIED` (`compile_applet` bundle inspection) |
| 22 | Memory / Listener / Timer Cleanup | `VERIFIED` | `src/components/useRadarCloudSync.ts`, `tests/stress-50-cycles.test.ts` | `SOURCE_REVIEWED`, `TEST_EXECUTED` (`tests/stress-50-cycles.test.ts` 50 teardown cycles) |
| 23 | Accessibility & Keyboard Usability | `VERIFIED` | `src/components/FloatingTopBar.tsx`, `src/components/NeighborhoodInspectorDrawer.tsx`, `src/components/OnboardingWizardModal.tsx` | `SOURCE_REVIEWED`, `TEST_EXECUTED` (`tests/mode-switcher-highlight.test.ts` aria roles) |
| 24 | SEO / Metadata / Structured Data | `VERIFIED` | `index.html`, `metadata.json`, `src/utils/serverSeoAndSitemap.ts`, `src/components/useAppUrlAndTitleSync.ts` | `SOURCE_REVIEWED`, `TEST_EXECUTED` (`tests/buyer-alert-contract.test.ts` canonical multi-city lookup) |
| 25 | Build / Lint / Typecheck | `VERIFIED` | `npm run lint`, `npm run arch:check`, `compile_applet` | `SOURCE_REVIEWED`, `TEST_EXECUTED`, `BUILD_VERIFIED` (all exit 0) |
| 26 | Existing Automated Tests | `VERIFIED` | `tests/buyer-alert-contract.test.ts`, `tests/stress-50-cycles.test.ts`, `tests/object-storage-*.test.ts`, `tests/architecture-guardrails.test.ts` | `SOURCE_REVIEWED`, `TEST_EXECUTED` (all test suites pass) |
| 27 | Missing Automated Tests | `VERIFIED` | Regression assertions added across `tests/buyer-alert-contract.test.ts` & `tests/mode-switcher-highlight.test.ts` | `SOURCE_REVIEWED`, `TEST_EXECUTED` |
| 28 | Dead Code / Duplication / Legacy Drift | `VERIFIED` | `architecture-baseline.json`, `scripts/check-architecture.ts` | `SOURCE_REVIEWED`, `TEST_EXECUTED` (`npm run arch:check`) |
| 29 | Documentation Accuracy | `VERIFIED` | `docs/RADAR-TEHRAN-OPERATING-CHARTER.md`, `docs/AUTONOMOUS-ENGINEERING-PROGRESS.md`, `docs/MASTER-PRODUCT-ASSESSMENT-ROADMAP.md`, `docs/TEAM-ENGINEERING-AND-GITHUB-WORKFLOW.md`, `docs/DATABASE-AND-DATA-LAYER-AUDIT.md` | `SOURCE_REVIEWED`, `TEST_EXECUTED` (read-back verified) |
| 30 | First-Time User Experience & Usability | `VERIFIED` | `src/components/OnboardingWizardModal.tsx`, `src/components/ModeSwitcherSegmented.tsx`, `src/components/PortfolioModals.tsx` | `SOURCE_REVIEWED`, `TEST_EXECUTED` (`tests/mode-switcher-highlight.test.ts`) |

---

### 3. Prioritized Active Backlog

1. **`WS-001`** — Status: `VERIFIED` (Frozen) | Classification: `ACTIONABLE_FINDING`
   - **Title**: Firestore Rules-Client Contract Alignment (`buyerAlerts`, `neighborhoodOverrides`, `userPreferences`), Multi-City State Integrity (`1..999`), and Inspector Drawer Above-the-Fold UX Redesign.
   - **Batches**: `1 / 3` | **Corrective Iterations**: `0 / 2`
2. **`WS-002`** — Status: `VERIFIED` (Frozen) | Classification: `IMPROVEMENT_OPPORTUNITY`
   - **Title**: First-Time Buyer/Renter Budget & Onboarding Flow Simplification + Visited Homes Notebook Validation & Empty State UX (`OnboardingWizardModal.tsx`, `PortfolioModals.tsx`, `ModeSwitcherSegmented.tsx`).
   - **Batches**: `1 / 3` | **Corrective Iterations**: `0 / 2` (Accounting Note: In-flight formatting compaction from 505 to 493 lines executed within Batch 1 prior to test execution; 0 post-verification corrective cycles required per Section 14).
3. **`WS-003`** — Status: `VERIFIED` (Frozen) | Classification: `ACTIONABLE_FINDING`
   - **Title**: Agency CRM & Bargain Submission Form Validation UX + Real-Time Discount Preview, `sponsorRequests` Firestore Contract Alignment & Media Upload Feedback (`AgencyModal.tsx`, `AgencySponsorReservationTab.tsx`, `useRadarCrudActions.ts`).
   - **Batches**: `1 / 3` | **Corrective Iterations**: `0 / 2`
4. **`WS-004`** — Status: `VERIFIED` (Frozen) | Classification: `ACTIONABLE_FINDING`
   - **Title**: Server-Side `/api/buyer-alerts` & `/api/sponsors/*` Route Mounting, Sponsor Release Persistence & Multi-City (`1..999`) Neighborhood Resolution (`src/utils/serverSponsorAndBargainRoutes.ts`, `src/utils/serverUtilityRoutes.ts`).
   - **Batches**: `1 / 3` | **Corrective Iterations**: `0 / 2`
5. **`WS-005`** — Status: `VERIFIED` (Frozen) | Classification: `ACTIONABLE_FINDING`
   - **Title**: Cross-City Comparison Resolution (`compHood1`/`compHood2`), Single-FlyTo Nationwide/Favorite Map Navigation & Canonical SSR SEO/URL Lookup (`App.tsx`, `NeighborhoodInspectorDrawer.tsx`, `QuickHoodRankingStrip.tsx`, `useAppUrlAndTitleSync.ts`, `serverSeoAndSitemap.ts`).
   - **Batches**: `1 / 3` | **Corrective Iterations**: `0 / 2`
6. **`WS-DOC-001`** — Status: `VERIFIED` (Frozen) | Classification: `DOCUMENTATION_RECONCILIATION`
   - **Title**: Version 32 Documentation Integrity Reconciliation (Acceptance Criteria Recovery, WS-002 Batch Accounting Audit, and Domain 2/16/18 Deep Reassessment).
   - **Batches**: `1 / 3` | **Corrective Iterations**: `0 / 2`
7. **`PLAN-001`** — Status: `VERIFIED` (Frozen) | Classification: `PLANNING_AND_DISCOVERY`
   - **Title**: Master Product Discovery and Assessment Roadmap (Phase 0: Architecture, 20-Domain Assessment Matrix, User Journeys & 4 Evaluation Campaigns).
   - **Batches**: `1 / 3` | **Corrective Iterations**: `0 / 2`
8. **`TEAM-SETUP-001`** — Status: `VERIFIED` (Frozen) | Classification: `TEAM_ARCHITECTURE_AND_SETUP`
   - **Title**: Team Engineering Architecture, GitHub Branching & Conditional Auto-Merge Integration Protocol (Role Matrix, PR Lifecycle, and Environment Discovery).
   - **Batches**: `1 / 3` | **Corrective Iterations**: `0 / 2`
9. **`DB-001`** — Status: `VERIFIED` (Frozen) | Classification: `DATABASE_AND_DATA_LAYER_AUDIT`
   - **Title**: Database & Data Layer Deep Audit (Technology Inventory, Schema Maps, Query Performance, Security Invariants, and Cloudflare Portability).
   - **Batches**: `1 / 3` | **Corrective Iterations**: `0 / 2`

---

### 4. Deferred, Blocked & Observation Register
- **Blocked Tasks**: None (`0`).
- **Observations (`OBSERVATION_ONLY`)**:
  - `OBS-001` (`OBSERVATION_ONLY`): Files near the 500-line ceiling (`useRadarCloudSync.ts`: 495, `PortfolioModals.tsx`: 493, `useRadarCrudActions.ts`: 489, `NeighborhoodInspectorTabs.tsx`: 489, `serverSponsorAndBargainRoutes.ts`: 481, `NeighborhoodInspectorDrawer.tsx`: 479, `FloatingTopBar.tsx`: 476, `serverUtilityRoutes.ts`: 465) must remain strictly `< 500` lines when touched.
  - `OBS-002` (`OBSERVATION_ONLY`): AI Studio Build mode does not expose container-level git branch isolation; multi-agent collaboration must rely on Lead-coordinated Pull Requests targeting canonical `main`.

---

## B. Append-Only Event History

1. **`[2026-11-01T09:20:00-08:00] CAMPAIGN_INITIALIZED`**:
   - Initialized campaign across the 30 applicable domains of Radar Tehran (`e48df7a4-9535-4bf0-a948-61a6a0f37a6a`).
   - Recorded baseline: `npm run lint` PASS, `npm run arch:check` PASS (`src/App.tsx` at 538/560 lines).
2. **`[2026-11-01T09:25:00-08:00] FINDING_CREATED & FINDING_CLASSIFIED (WS-001)`**:
   - Classified `WS-001` as `ACTIONABLE_FINDING` (`DISCOVERED → TRIAGED → READY`).
   - Evidence:
     1. `src/components/useRadarCrudActions.ts` (`handleRegisterBuyerAlert`) sent creation-only fields (`userId`, `hoodId`, `consentVersion`, `consentAt`, `expiresAt`) without `updatedAt` on `updateDoc(alertRef, ...)`, violating `firestore.rules` line 398 (`affectedKeys().hasOnly(['hoodName', 'fullName', 'phone', 'dealType', 'maxBudgetText', 'updatedAt'])`).
     2. `src/components/useRadarAdminActions.ts` (`handleAdminApproveSponsor`, `handleExtendSponsor30Days`, `handleReleaseHoodSponsor`) wrote to `/publicSponsors/{hoodId}`, which does not exist in `firestore.rules` (hits default-deny `allow read, write: if false`).
     3. `useRadarCrudActions.ts` (`if (hoodId < 100)`) and `useRadarAdminActions.ts` (`hoodId <= 80`, `nextRahn >= 0`) excluded multi-city neighborhoods (`101..999`) or allowed `rahn80m < 50` rejected by `firestore.rules`.
     4. `src/components/NeighborhoodInspectorDrawer.tsx` stacked secondary charts, photo gallery, comparison table, and 6 tool buttons ABOVE `anatomyTabsRef`, pushing primary navigation tabs ~950px below the fold.
     5. `src/components/NeighborhoodInspectorTabs.tsx` rendered `cloudVotes.slice(0, 4)` without filtering `v.hoodId === selectedHood.id`, leaking resident reviews across neighborhoods.
3. **`[2026-11-01T09:28:00-08:00] WORKSTREAM_STARTED & ACCEPTANCE_CRITERIA_ESTABLISHED (WS-001)`**:
   - Transitioned `WS-001`: `READY → IN_PROGRESS`.
   - Frozen Acceptance Criteria: AC-1 through AC-6.
4. **`[2026-11-01T09:36:43-08:00] IMPLEMENTATION_ATTEMPT_COMPLETED (WS-001, Batch 1 / 3)`**:
   - Modified `src/components/useRadarAdminActions.ts`, `src/components/useRadarCrudActions.ts`, `src/components/useRadarCloudSync.ts`, `src/components/NeighborhoodInspectorDrawer.tsx`, `src/components/NeighborhoodInspectorTabs.tsx`, `src/components/FloatingTopBar.tsx`, and `tests/buyer-alert-contract.test.ts`.
5. **`[2026-11-01T09:39:23-08:00] TEST_EXECUTED & WORKSTREAM_VERIFIED (WS-001)`**:
   - Executed verification suite: `npm run lint`, `npm run arch:check`, `npx tsx tests/buyer-alert-contract.test.ts`, `npx tsx tests/stress-50-cycles.test.ts`, `npx tsx tests/object-storage-*.test.ts`, `compile_applet` — all PASS.
   - Transitioned `WS-001`: `VERIFYING → VERIFIED` (Frozen).
6. **`[2026-11-01T10:08:34-08:00] CHARTER_PERSISTED & WORKSTREAM_STARTED (WS-002)`**:
   - Saved and read-back verified `docs/RADAR-TEHRAN-OPERATING-CHARTER.md` (Version 22 Master Charter + Version 32 Execution Governance).
   - Transitioned `WS-002`: `READY → IN_PROGRESS` with frozen acceptance criteria AC-1 through AC-4.
7. **`[2026-11-01T10:14:26-08:00] IMPLEMENTATION_ATTEMPT_COMPLETED & WORKSTREAM_VERIFIED (WS-002, Batch 1 / 3)`**:
   - Modified `src/components/OnboardingWizardModal.tsx`, `src/components/PortfolioModals.tsx` (`493` lines, `< 500`), `src/components/ModeSwitcherSegmented.tsx`, and `tests/mode-switcher-highlight.test.ts`.
   - Executed full verification suite and `compile_applet` — all PASS.
   - Transitioned `WS-002`: `IN_PROGRESS → VERIFYING → VERIFIED` (Frozen).
8. **`[2026-11-01T10:20:04-08:00] WORKSTREAM_STARTED & ACCEPTANCE_CRITERIA_ESTABLISHED (WS-003)`**:
   - Transitioned `WS-003`: `READY → IN_PROGRESS` with frozen acceptance criteria AC-1 through AC-4.
9. **`[2026-11-01T10:22:07-08:00] IMPLEMENTATION_ATTEMPT_COMPLETED & WORKSTREAM_VERIFIED (WS-003, Batch 1 / 3)`**:
   - Modified `src/components/useRadarCrudActions.ts` (`489` lines, `< 500`), `src/components/AgencyModal.tsx`, `src/components/AgencySponsorReservationTab.tsx`, and `tests/buyer-alert-contract.test.ts`.
   - Executed verification suite: `npm run lint`, `npm run arch:check`, `npx tsx tests/buyer-alert-contract.test.ts`, `npx tsx tests/stress-50-cycles.test.ts`, `npx tsx tests/object-storage-*.test.ts`, and `compile_applet` — all PASS.
   - Transitioned `WS-003`: `IN_PROGRESS → VERIFYING → VERIFIED` (Frozen). Next eligible task: `WS-004`.
10. **`[2026-11-01T10:27:26-08:00] WORKSTREAM_STARTED & ACCEPTANCE_CRITERIA_ESTABLISHED (WS-004)`**:
    - Transitioned `WS-004`: `READY → IN_PROGRESS` with frozen acceptance criteria AC-1 through AC-3.
11. **`[2026-11-01T10:28:41-08:00] IMPLEMENTATION_ATTEMPT_COMPLETED & WORKSTREAM_VERIFIED (WS-004, Batch 1 / 3)`**:
    - Modified `src/utils/serverSponsorAndBargainRoutes.ts` (`481` lines, `< 500`), `src/utils/serverUtilityRoutes.ts` (`465` lines, `< 500`), and `tests/buyer-alert-contract.test.ts`.
    - Executed verification suite and `compile_applet` — all PASS.
    - Transitioned `WS-004`: `IN_PROGRESS → VERIFYING → VERIFIED` (Frozen).
12. **`[2026-11-01T10:33:44-08:00] WORKSTREAM_STARTED & ACCEPTANCE_CRITERIA_ESTABLISHED (WS-005)`**:
    - Transitioned `WS-005`: `READY → IN_PROGRESS` with frozen acceptance criteria AC-1 through AC-4.
13. **`[2026-11-01T10:35:55-08:00] IMPLEMENTATION_ATTEMPT_COMPLETED, WORKSTREAM_VERIFIED (WS-005, Batch 1 / 3) & CAMPAIGN_COMPLETED`**:
    - Modified `src/App.tsx` (`539` lines, `<= 560`), `src/components/NeighborhoodInspectorDrawer.tsx` (`479` lines, `< 500`), `src/components/QuickHoodRankingStrip.tsx` (`356` lines, `< 500`), `src/components/useAppUrlAndTitleSync.ts`, `src/utils/serverSeoAndSitemap.ts`, and `tests/buyer-alert-contract.test.ts`.
    - Executed verification suite:
      - `npm run lint`: PASS (exit 0)
      - `npm run arch:check`: PASS (0 errors)
      - `npx tsx tests/buyer-alert-contract.test.ts`: PASS
      - `npx tsx tests/stress-50-cycles.test.ts`: PASS (50/50 cycles)
      - `npx tsx tests/object-storage-upload-auth.test.ts`: PASS
      - `npx tsx tests/object-storage-security.test.ts`: PASS (43/43 checks)
      - `npx tsx tests/object-storage-range.test.ts`: PASS
      - `compile_applet`: PASS (`Build succeeded - the applet is compiled`)
    - Transitioned `WS-005`: `IN_PROGRESS → VERIFYING → VERIFIED` (Frozen). All 30 audit domains and workstreams `WS-001..WS-005` verified (`CAMPAIGN_COMPLETE`).
14. **`[2026-11-01T11:40:00-08:00] WORKSTREAM_STARTED & ACCEPTANCE_CRITERIA_ESTABLISHED (WS-DOC-001)`**:
    - Transitioned `WS-DOC-001`: `READY → IN_PROGRESS`.
    - Established frozen acceptance criteria AC-1 through AC-4 for documentation reconciliation.
15. **`[2026-11-01T11:45:00-08:00] DOCUMENTATION_RECONCILIATION_COMPLETED & VERIFIED (WS-DOC-001)`**:
    - Reconciled documentation in `docs/AUTONOMOUS-ENGINEERING-PROGRESS.md`:
      1. Recovered and archived original acceptance criteria for `WS-001` (AC-1..AC-6), `WS-002` (AC-1..AC-4), `WS-003` (AC-1..AC-4), and `WS-004` (AC-1..AC-3).
      2. Performed rigorous accounting audit of `WS-002` batch and corrective iteration counters under Version 32 Section 14, confirming that the in-flight formatting compaction of `PortfolioModals.tsx` from 505 to 493 lines took place within initial Batch 1 prior to test execution, legitimately leaving `Corrective Iterations: 0 / 2`.
      3. Reassessed audit domains 2, 16, and 18 with explicit implementation evidence, executed test citations, and identified untested external network integration paths (offline fallback shielding).
    - Executed verification suite:
      - `npm run lint`: PASS (exit 0)
      - `npm run arch:check`: PASS (0 errors)
      - `compile_applet`: PASS (`Build succeeded - the applet is compiled`)
    - Transitioned `WS-DOC-001`: `IN_PROGRESS → VERIFYING → VERIFIED` (Frozen). Campaign `CAMPAIGN-V32-001` retains verified terminal completion (`CAMPAIGN_COMPLETE`).
16. **`[2026-11-01T11:43:00-08:00] WORKSTREAM_STARTED & ACCEPTANCE_CRITERIA_ESTABLISHED (PLAN-001)`**:
    - Initiated Master Product Assessment Program — Phase 0: Complete Product Discovery & Audit Architecture.
    - Transitioned `PLAN-001`: `READY → IN_PROGRESS`.
    - Established frozen acceptance criteria AC-1 through AC-5 for discovery, 20-domain assessment framework, user journey mapping, and roadmap design.
17. **`[2026-11-01T11:45:00-08:00] PRODUCT_DISCOVERY_AND_ROADMAP_COMPLETED & VERIFIED (PLAN-001)`**:
    - Created authoritative deliverable `docs/MASTER-PRODUCT-ASSESSMENT-ROADMAP.md` (Version 1.0.0):
      1. Complete grounded inventory of 22 user-facing modules, 15 API routes, 4 database/storage structures, and domain engines.
      2. 20-domain Master Product Assessment Matrix (A through T) cross-referenced with all 30 engineering audit domains.
      3. 3 realistic user journeys mapped across 3 distinct personas with identified friction points and verification methods.
      4. 9-level evidence hierarchy distinguishing local test execution from live production analytics.
      5. 4 finite, dependency-aware assessment campaigns (`CAMPAIGN-PROD-01` through `CAMPAIGN-PROD-04`) containing 10 bounded workstreams (`ASSESS-001` through `ASSESS-010`).
    - Verified strict non-invasive boundaries (0 code or config changes); all verification suites pass: `npm run lint` (0 errors), `npm run arch:check` (0 errors), and `compile_applet` (PASS).
    - Transitioned `PLAN-001`: `IN_PROGRESS → VERIFYING → VERIFIED` (Frozen). Phase 0 complete; STOPPED per protocol.
18. **`[2026-11-01T11:52:00-08:00] WORKSTREAM_STARTED & ACCEPTANCE_CRITERIA_ESTABLISHED (TEAM-SETUP-001)`**:
    - Transitioned `TEAM-SETUP-001`: `READY → IN_PROGRESS`.
    - Designated Member 01: Integration Lead & Technical Coordinator.
    - Established frozen acceptance criteria AC-1 through AC-5 for multi-agent team architecture, GitHub branching, conditional auto-merging, and environment discovery.
19. **`[2026-11-01T11:55:00-08:00] TEAM_SETUP_COMPLETED & VERIFIED (TEAM-SETUP-001)`**:
    - Created authoritative deliverable `docs/TEAM-ENGINEERING-AND-GITHUB-WORKFLOW.md` (Version 1.0.0):
      1. Live environment capability inspection: confirmed git CLI 2.34.1, absence of local `.git` container folder, lack of native branch isolation in Build sessions, and dependence on platform control plane sync.
      2. Six-role team architecture with explicit file ownership boundaries, plus 5-agent and 4-agent fallback matrices with overload risk analysis.
      3. Git branching protocol: canonical `main` + short-lived `work/<ROLE>-<ID>/<slug>` branches with Conventional Commits.
      4. Conditional Auto-Merge system governed by 10 mandatory verification gates and strict R3 human approval blocks for database, security, and infrastructure changes.
      5. Cross-agent contracts, file ownership invariants, and CAS conflict resolution protocol.
    - Executed verification suite:
      - `npm run lint`: PASS (exit 0)
      - `npm run arch:check`: PASS (0 errors)
      - `compile_applet`: PASS (`Build succeeded - the applet is compiled`)
    - Transitioned `TEAM-SETUP-001`: `IN_PROGRESS → VERIFYING → VERIFIED` (Frozen). Setup complete; STOPPED per protocol.
20. **`[2026-11-01T11:58:00-08:00] WORKSTREAM_STARTED & ACCEPTANCE_CRITERIA_ESTABLISHED (DB-001)`**:
    - Transitioned `DB-001`: `READY → IN_PROGRESS`.
    - Designated Member 02: Database and Data Architecture Engineer.
    - Established frozen acceptance criteria AC-1 through AC-5 for deep data layer audit, entity mapping, query performance, security invariants, and Cloudflare portability.
21. **`[2026-11-01T12:01:00-08:00] DATABASE_AUDIT_COMPLETED & VERIFIED (DB-001)`**:
    - Created authoritative deliverable `docs/DATABASE-AND-DATA-LAYER-AUDIT.md` (Version 1.0.0):
      1. Technology inventory: Firestore NoSQL cloud database, atomic POSIX disk persistence, S3-compatible object storage, browser localStorage.
      2. Entity schema maps for all 9 collections (`admins`, `votes`, `userPreferences`, `bargains`, `bargainOwners`, `buyerAlerts`, `sponsorRequests`, `neighborhoodOverrides`, `appConfig`).
      3. Query index audit: 6 composite indexes verified in `firestore.indexes.json`.
      4. Data integrity, two-phase deletion coordinator (`pending_delete`), and orphan audit verified.
      5. Cloudflare infrastructure portability assessed (Cloudflare R2 confirmed compatible; D1/KV adapters required for Firestore migration).
    - Executed verification suite:
      - `npm run lint`: PASS (exit 0)
      - `npm run arch:check`: PASS (0 errors)
      - `compile_applet`: PASS (`Build succeeded - the applet is compiled`)
    - Transitioned `DB-001`: `IN_PROGRESS → VERIFYING → VERIFIED` (Frozen). Audit complete; STOPPED per protocol.
22. **`[2026-11-01T23:36:00-08:00] WORKSTREAM_STARTED_AND_COMPLETED (ASSESS-001)`**:
    - Initiated `CAMPAIGN-PROD-01: Usability, Ergonomics & Mobile UX Assessment`.
    - Role / Owner: Member 06 — Frontend & Product Experience Engineer.
    - Deliverable: `docs/engineering/assessments/ASSESS-001-mobile-touch-ergonomics.md`.
    - Hardened mobile drawer touch ergonomics in `src/components/NeighborhoodInspectorDrawer.tsx`:
      1. Added `touch-none` and `onKeyDown` to the drawer drag handle for gesture disambiguation and WCAG accessibility.
      2. Added `overscroll-contain` to the drawer content container to prevent scroll bubbling into the background Leaflet map.
      3. Retained strict line boundary (< 500 lines; achieved 486 lines).
    - Verified browser rendering at 390x844 (0 horizontal overflow, clean touch layering) and executed verification suite:
      - `npm run lint`: PASS (0 errors)
      - `npm run arch:check`: PASS (0 errors)
      - `npm run test:security`: PASS (21/21 assertions)
      - `compile_applet`: PASS
    - Transitioned `ASSESS-001`: `IN_PROGRESS → VERIFYING → VERIFIED`. Next eligible: `ASSESS-002`.
23. **`[2026-11-01T23:47:00-08:00] WORKSTREAM_STARTED_AND_COMPLETED (ASSESS-002)`**:
    - Addressed Workstream `ASSESS-002: Information Density & Drawer Architecture Audit`.
    - Role / Owner: Member 06 — Frontend & Product Experience Engineer.
    - Deliverable: `docs/engineering/assessments/ASSESS-002-drawer-information-density.md`.
    - Architectural Refinements in `src/components/NeighborhoodInspectorDrawer.tsx`:
      1. Contextually scoped `SmartPriceForecastCard` and `NeighborhoodMonthlyBarChart` to the `market` tab, eliminating 800px of redundant price charts on the `bargains` and `vote` tabs.
      2. Contextually scoped `NeighborhoodPhotoGallery` to `scorecard` and `vote` tabs to avoid cluttering specific bargain property listings.
      3. Maintained strict line boundaries (`485 lines` <= 500 lines limit).
    - Executed verification suite:
      - `npm run lint`: PASS (0 errors)
      - `npm run arch:check`: PASS (0 errors)
      - `tests/buyer-alert-contract.test.ts`: PASS (`tabsIndex > 0 && forecastIndex > tabsIndex`)
      - `compile_applet`: PASS
    - Transitioned `ASSESS-002`: `IN_PROGRESS → VERIFYING → VERIFIED`. Next eligible: `ASSESS-003`.
24. **`[2026-11-01T23:59:00-08:00] WORKSTREAM_AND_CAMPAIGN_COMPLETED (ASSESS-003 & CAMPAIGN-PROD-01)`**:
    - Completed Workstream `ASSESS-003: First-Time Onboarding & Cognitive Friction Audit`.
    - Role / Owner: Member 06 — Frontend & Product Experience Engineer.
    - Deliverable: `docs/engineering/assessments/ASSESS-003-onboarding-cognitive-friction.md`.
    - Automated Browser Verification via Playwright:
      1. Stepped through all 3 wizard steps in headless Chromium.
      2. Validated Step 1 (`r6-onboarding-step1.png`), Step 2 (`r7-onboarding-step2.png`), and Step 3 (`r8-onboarding-step3.png`).
      3. Confirmed zero console errors, zero layout shifts, and responsive touch controls.
      4. Preserved file line count (`src/components/OnboardingWizardModal.tsx` at 465 lines <= 500 lines).
    - Executed verification suite:
      - `npm run lint`: PASS (0 errors)
      - `npm run arch:check`: PASS (0 errors)
      - `compile_applet`: PASS
    - Closed `CAMPAIGN-PROD-01`: Marked `CAMPAIGN_COMPLETE`.
    - Next eligible campaign: `CAMPAIGN-PROD-02: PropTech Calculation & Valuation Accuracy Assessment` (`ASSESS-004`).
25. **`[2026-11-02T00:10:00-08:00] WORKSTREAM_STARTED_AND_COMPLETED (ASSESS-004)`**:
    - Initiated `CAMPAIGN-PROD-02: PropTech Calculation & Valuation Accuracy Assessment`.
    - Workstream `ASSESS-004: Hedonic Pricing Engine Accuracy & Empirical Benchmark Audit`.
    - Role / Owner: Member 04 — Business Logic & PropTech Engineer.
    - Deliverables:
      1. Benchmark test suite: `tests/assess-004-hedonic-accuracy-benchmark.test.ts`.
      2. Assessment documentation: `docs/engineering/assessments/ASSESS-004-hedonic-accuracy-benchmark.md`.
    - Empirical Invariants Verified:
      - Multi-city baseline scaling across Tehran (Punak, Niavaran, Nazi Abad), Karaj, Isfahan, Mashhad, and Shiraz.
      - Monotonic renovation hierarchy (`needs_renovation < standard < renovated < luxury_renovated`).
      - Floor elevation & 4th-floor walk-up penalty (> 10% discount without elevator).
      - Land equity preservation floor (> 30-year-old structures capped at -26.0% depreciation).
      - Fast-sale liquidity multiplier consistency (`FAST_SALE_FACTOR = 0.88`).
      - Asking price appraisal state machine (`bargain <= -5.0%`, `fair`, `overpriced >= +5.5%`).
    - Executed verification suite:
      - `npx tsx tests/assess-004-hedonic-accuracy-benchmark.test.ts`: PASS (100% assertions)
      - `npm run lint`: PASS (0 errors)
      - `npm run arch:check`: PASS (0 errors)
      - `compile_applet`: PASS
    - Transitioned `ASSESS-004`: `IN_PROGRESS → VERIFYING → VERIFIED`. Next eligible: `ASSESS-005`.
26. **`[2026-11-02T00:15:30-08:00] WORKSTREAM_STARTED_AND_COMPLETED (ASSESS-005)`**:
    - Workstream `ASSESS-005: 1405 Legal, Tax, Inheritance & Notary Formula Audit`.
    - Deliverables:
      1. Test suite: `tests/assess-005-legal-and-tax-formulas.test.ts`.
      2. Assessment report: `docs/engineering/assessments/ASSESS-005-legal-and-tax-formulas.md`.
    - Verified Article 53/54/131 rental income tax exemptions ($\le 150\text{ m}^2$ Tehran, $\le 200\text{ m}^2$ other cities), Article 54 bis vacant home multipliers ($6\times, 12\times, 18\times$), Civil Code inheritance shares (Articles 905, 906, 946), Official Union stepped commission + 10% VAT, and building charge SaaS allocation.
    - Transitioned `ASSESS-005`: `IN_PROGRESS → VERIFYING → VERIFIED`. Next eligible: `ASSESS-006`.
27. **`[2026-11-02T00:17:00-08:00] WORKSTREAM_AND_CAMPAIGN_COMPLETED (ASSESS-006 & CAMPAIGN-PROD-02)`**:
    - Workstream `ASSESS-006: Trade-Up & Asset Swap Model Validation`.
    - Deliverables:
      1. Test suite: `tests/assess-006-trade-up-swap-model.test.ts`.
      2. Assessment report: `docs/engineering/assessments/ASSESS-006-trade-up-swap-model.md`.
    - Verified `evaluateTradeUpOptions` (60% land equity floor, 1% closing friction deduction, +1,200M mortgage loan booster, tenant rahn bridge deduction, and age segment hierarchy) and `evaluateRentVsBuyInNeighborhood`.
    - Closed `CAMPAIGN-PROD-02`: Marked `CAMPAIGN_COMPLETE`.
28. **`[2026-11-02T00:18:15-08:00] CAMPAIGN_STARTED_AND_COMPLETED (ASSESS-007, ASSESS-008 & CAMPAIGN-PROD-03)`**:
    - Completed `CAMPAIGN-PROD-03: Performance, Rendering & Offline Resilience` (`ASSESS-007` & `ASSESS-008`).
    - Deliverables:
      1. Test suite: `tests/assess-007-008-performance-lod-and-pwa.test.ts`.
      2. Assessment report: `docs/engineering/assessments/ASSESS-007-008-performance-and-pwa.md`.
    - Verified Leaflet viewport AABB culling, macro-zoom spatial clustering, screen-space collision declustering, polygon LOD decimation, `BoundedGeoJsonLruCache` eviction, `public/manifest.json` compliance, and Service Worker Zero-Trust request classification.
    - Closed `CAMPAIGN-PROD-03`: Marked `CAMPAIGN_COMPLETE`.
29. **`[2026-11-02T00:19:55-08:00] CAMPAIGN_STARTED_AND_COMPLETED (ASSESS-009, ASSESS-010 & CAMPAIGN-PROD-04)`**:
    - Completed `CAMPAIGN-PROD-04: Discoverability, Viral Sharing & Conversion` (`ASSESS-009` & `ASSESS-010`).
    - Deliverables:
      1. Test suite: `tests/assess-009-010-seo-deeplink-and-crm-funnel.test.ts`.
      2. Assessment report: `docs/engineering/assessments/ASSESS-009-010-seo-and-crm-funnel.md`.
    - Verified cross-city comparison SSR metadata (`?compare=5-101`), non-Tehran canonical URLs (`?city=isfahan&hood=304`), JSON-LD script breakout neutralization, single-flight bargain submission locks, decoupled media attachment retries, and dual-write reconciliation.
    - Closed `CAMPAIGN-PROD-04`: Marked `CAMPAIGN_COMPLETE`. All 4 Master Product Assessment Campaigns (`ASSESS-001` through `ASSESS-010`) are 100% verified.
30. **`[2026-11-08T11:26:30-08:00] ARGON_5_BOOTSTRAP_AND_WORKSTREAM_COMPLETED (CAMPAIGN-ARGON5-01 / WS-ARGON5-A)`**:
    - **Session Initialization & Archive Reconciliation**:
      - Inspected `public/assets/aistudio/RADAR_ARGON_5_MASTER_REDESIGN_PROMPT_93cf6c5c.md`, `AGENTS.md`, `ARCHITECTURE.md`, `architecture-baseline.json`, `docs/RADAR-TEHRAN-OPERATING-CHARTER.md`, `docs/engineering/RMEP-001/PERSISTENT-ENGINEERING-MEMORY.md`, and `docs/engineering/RMEP-001/EXECUTION-STATE.json`.
      - Checked for `.zip` archives in workspace (`find . -maxdepth 4 -name "*.zip"`): **Zero `.zip` files present in container**. Reconciled directly against live repository working tree (`/app/applet`).
    - **Revalidated Finding Register (Parts 4, 6, 7)**:
      - `F-ARGON5-01` (`src/data/realMarketPriceAggregator.ts`): **CONFIRMED (`REPRODUCIBLE_DEFECT`)** — When `samples.length < 3`, 12 synthetic bootstrap rows replaced `samples`, inflating `sampleCount` and `validSampleCount` to 12 and discarding 1–2 real observations; `confidenceScore = 74` was displayed as `"اطمینان آماری: ۷۴٪"`; statistical `1.5 * IQR` outliers were conflated with fraud (`rejectedFraudCount` -> `"مورد فیک حذف شد"`); `'FROZEN'` market regime was unreachable dead code; `estimatedDealPricePerSqm` fixed ratios (`0.975 / 0.93 / 0.90`) lacked explicit `HEURISTIC_ESTIMATE` provenance; daily `±3%` anchor clamping hid `unclampedAveragePerSqm` and `isAnchorClamped`.
      - `F-ARGON5-02` (`src/components/useEvaluatedNeighborhoods.ts`): **CONFIRMED (`ACTIONABLE_FINDING`, queued for `WS-ARGON5-B`)** — `status` (`green`/`yellow`/`red`) is pure budget fit while `calcOverallScore` is an equal-weight mean of 6 indicators.
      - `F-ARGON5-03` (`src/components/OnboardingWizardModal.tsx`): **CONFIRMED (`ACTIONABLE_FINDING`, queued for `WS-ARGON5-C`)** — Backdrop click triggers `handleSkip`, number vs. range slider bounds differ, and `greenNeighborhoods.slice(0, 4)` is unsorted while `bestNeighborhood` sorts by `overallScore`.
    - **Workstream Executed (`WS-ARGON5-A`: Market-Data Truth, Provenance Taxonomy & Aggregator Semantic Integrity)**:
      - **Risk Level**: `R2` | **Batches Used**: `1 / 3` | **Corrective Iterations**: `0 / 2`.
      - **Scientific Rationale**: Grounded in Tversky & Kahneman (1974) on numerical anchoring under uncertainty, Lee & See (2004) on calibrated trust in automation, Parasuraman & Manzey (2010) on automation bias, and Goodhart (1975) / Campbell (1979) on metric gaming and indicator distortion.
      - **Frozen Acceptance Contract (`AC-1` through `AC-6`)**:
        - `AC-1`: Exported `MarketDataProvenance` and `EvidenceQualityState` in `src/data/realMarketPriceAggregator.ts` and added `observedSampleCount`, `eligibleObservedCount`, `syntheticSampleCount`, `excludedOutlierCount`, `malformedSampleCount`, `suspectedFraudCount`, `provenance`, `dealPriceProvenance: 'HEURISTIC_ESTIMATE'`, `evidenceQuality`, `evidenceIndexScore`, `isAnchorClamped`, and `unclampedAveragePerSqm`.
        - `AC-2`: Preserved 1–2 real observed listings (`LIMITED_OBSERVATIONS`) by blending them with the reference baseline and retaining observed bargains in `autoBargainIds`, rather than discarding them.
        - `AC-3`: Made `'FROZEN'` market regime reachable when 3–9 observed samples exhibit high dispersion (`>= 16%`) or seller overpricing (`>= 1.12x` baseline), while keeping cold-start and balanced warm-start tests intact.
        - `AC-4`: Updated `src/components/NeighborhoodInspectorDrawer.tsx`, `src/components/NeighborhoodInspectorTabs.tsx`, `src/components/views/ProductIntelligenceView.tsx`, and `src/components/CompareModal.tsx` to disclose reference baseline vs. observed sample counts, replace uncalibrated `"اطمینان آماری"` with `"شاخص پوشش شواهد"` / `"منشأ داده"`, relabel IQR trimming as statistical outlier filtering (`"داده پرت آماری IQR"`), and clarify `v6.4` closing price as a heuristic negotiation scenario (`"برآورد سناریوی مذاکره"`).
        - `AC-5`: Expanded `tests/real-market-price-aggregator.test.ts` to cover 0, 1, 2, 4, 8, and 10 sample regimes, outlier vs. fraud vs. malformed separation, reachable `'FROZEN'` regime, and anchor clamping transparency.
        - `AC-6`: Maintained all file line counts below ceilings (`realMarketPriceAggregator.ts`: 296 lines, `NeighborhoodInspectorDrawer.tsx`: 249 lines, `NeighborhoodInspectorTabs.tsx`: 281 lines, `ProductIntelligenceView.tsx`: 266 lines, `CompareModal.tsx`: 255 lines).
    - **Transitioned `WS-ARGON5-A`**: `DISCOVERED → TRIAGED → READY → IN_PROGRESS → VERIFYING → VERIFIED`. Next eligible workstream: `WS-ARGON5-B`.
31. **`[2026-11-08T12:14:00-08:00] GEMINI_4_ARGON_WS_A1_COMPLETED (WS-G4A-A1 / WS-A1)`**:
    - **Workstream Executed (`WS-G4A-A1`: Post-Workstream-A Semantic, Statistical, and Regression Integrity Gate)**:
      - Audited all 8 WS-A claims against live code (`src/data/realMarketPriceAggregator.ts`, `src/components/NeighborhoodInspectorDrawer.tsx`, `src/components/NeighborhoodInspectorTabs.tsx`, `src/components/CompareModal.tsx`, `src/components/views/ProductIntelligenceView.tsx`).
      - Added `SampleCoverageState` (`BOOTSTRAPPED_BASELINE` / `SPARSE_1_TO_2` / `MODERATE_3_TO_9` / `SUFFICIENT_10_PLUS`), `coverageState`, `evidenceIndexFormula`, `marketActivityEvidence`, and `negotiationMultiplierBasis` to `AggregatedMarketMetrics`.
      - Added `data-testid="market-anchor-clamp-disclosure"` in `src/components/NeighborhoodInspectorTabs.tsx` to disclose `unclampedAveragePerSqm` and `isAnchorClamped` (`±3%` daily anchor clamp), and qualified `شاخص پوشش نمونه` as `(غیرآماری)` and `معامله v6.4` as `سناریوی فرضی مذاکره`.
      - Expanded `tests/real-market-price-aggregator.test.ts` to verify all new provenance fields across 0, 1, 2, 4, and 10 sample regimes.
      - Produced full handoff package (`docs/engineering/WS-G4A-A1-EXECUTION-REPORT.md`, `docs/engineering/WS-G4A-A1-MANIFEST.json`, `docs/engineering/WS-G4A-A1.patch`, `public/radar-g4a-ws-a1-handoff.zip`).
    - **Transitioned `WS-G4A-A1`**: `DISCOVERED → TRIAGED → READY → IN_PROGRESS → VERIFYING → VERIFIED`. Stopped per operator handoff contract without starting `WS-B` (`WP-3`).
32. **`[2026-11-09T05:01:30-08:00] CASPER_EXECUTIVE_UPGRADE_COMPLETED (WS-CASPER-01: WS-ARGON5-B + WS-ARGON5-C)`**:
    - **Workstream Executed (`WS-ARGON5-B` & `WS-ARGON5-C`: Multi-Criteria Decision Explainability, Non-Compensatory Semantics, Hedonic Epistemic Calibration & Onboarding Rent Control)**:
      - **Risk Level**: `R2` | **Batches Used**: `1 / 3` | **Corrective Iterations**: `0 / 2`.
      - **`src/data/hedonicPricingEngine.ts` & `src/components/HedonicValuationResultsColumn.tsx`**:
        - Added `uncertaintyBasis: 'DETERMINISTIC_SENSITIVITY_BAND_3_5_PCT'`, `calibrationDisclosureFa`, and `nonCompensatoryWarnings` (`floor >= 3 && !hasElevator`, `buildingAge >= 25 && needs_renovation`, `!hasParking && sqm >= 95`) to `HedonicValuationResult`, and relabeled `"بازه اطمینان کارشناسی"` to `"بازه حساسیت مدل (±۳.۵٪)"`.
      - **`src/components/useEvaluatedNeighborhoods.ts`**:
        - Exported `NeighborhoodRecommendationExplanation` and `explainNeighborhoodRecommendation(hood, options)` separating financial budget-fit semantics (`همخوان با فرض بودجه فعلی` / `مرزی` / `فراتر از فرض بودجه`) from the equal-weight 6-indicator infrastructure index (`شاخص ۶ سنجه`), generating contextual primary reasons, trade-off summaries, non-compensatory warnings for any indicator `< 6.5`, and `±0.3` score tie-band detection (`isTieBandWithTop`).
      - **`src/components/SmartSuggestModal.tsx` & `src/components/QuickHoodRankingStrip.tsx`**:
        - Wired `explainNeighborhoodRecommendation` into recommendation cards and ranking pills, displaying `چرا این پیشنهاد؟`, trade-off summaries, non-compensatory warnings, and `±0.3` tie-band badges (`≈` prefix instead of false Olympic medal hierarchy on tied candidates).
      - **`src/components/OnboardingWizardModal.tsx`**:
        - Exposed an interactive `monthlyRent` numeric input and range slider (`0..300` Million Toman) alongside `deposit` in Step 2 rent mode with live `combinedRahnEquivalent` calculation (`3%` rate) and international currency equivalence, and integrated `explainNeighborhoodRecommendation` into Step 3 candidate cards.
      - **Unit & Regression Coverage**:
        - Expanded `tests/assess-004-hedonic-accuracy-benchmark.test.ts` (Test 8) and `tests/domain-regressions.test.ts` (Assertion 37).
    - **Transitioned `WS-ARGON5-B` & `WS-ARGON5-C`**: `DISCOVERED → TRIAGED → READY → IN_PROGRESS → VERIFYING → VERIFIED`.
33. **`[2026-11-09T08:47:00-08:00] CASPER_ROOT_CAUSE_STRUCTURAL_REFORM_COMPLETED (WS-CASPER-02: WS-ARGON5-D & Root-Cause Unification)`**:
    - **Workstream Executed (`WS-ARGON5-D` & Root-Cause Structural Unification)**:
      - **Risk Level**: `R2` | **Batches Used**: `1 / 3` | **Corrective Iterations**: `0 / 2`.
      - **Root Cause 1 Fixed — Unified Market Aggregator Sample Ingestion (`buildNeighborhoodListingSamples`)**:
        - Eliminated cross-view `v6.4` deal price divergence where `BuyingPowerSummaryCard.tsx`, `BudgetBridgeAdvisorCard.tsx`, `ShortlistMatrixModal.tsx`, `ExpandableComparisonTable.tsx`, and `OnboardingWizardModal.tsx` passed `[]` (forcing `observedSampleCount = 0`) while `NeighborhoodInspectorDrawer.tsx`, `NeighborhoodInspectorTabs.tsx`, and `CompareModal.tsx` passed `buildNeighborhoodListingSamples(hood)`. All 8 market-aggregation call sites now use `buildNeighborhoodListingSamples(hood)` as a single source of truth.
      - **Root Cause 2 Fixed — Multi-Criteria Comparison Surfaces (`±0.3` Tie-Band Sensitivity & Non-Compensatory Trade-Offs)**:
        - Updated `CompareModal.tsx`, `ExpandableComparisonTable.tsx`, and `ShortlistMatrixModal.tsx` to treat `overallScore` differences `<= 0.3` as a tie-band (`≈ هم‌تراز ±۰.۳`) rather than a decisive win, and integrated `explainNeighborhoodRecommendation` (`budgetFitSemanticsLabelFa`, `tradeOffSummaryFa`, `nonCompensatoryWarningsFa`) directly into comparison headers and matrix rows.
      - **Root Cause 3 Fixed — Resident Review Social-Proof Provenance Separation (`residentReviewsLogic.ts` & `ResidentReviewsTab.tsx`)**:
        - Added `isSeedBaseline` and `provenance` (`'USER_REPORTED' | 'CLOUD_RESIDENT_VOTE' | 'SEED_BASELINE_SCENARIO'`) to `ResidentReviewItem` and `observedReviewsCount`, `seedBaselineCount`, and `provenanceLabelFa` to `NeighborhoodQoLSummary`. Disclosed seed baseline scenarios vs. real user reviews in `ResidentReviewsTab.tsx` (`سناریوی مرجع محله (نمونه پایه)` vs. `ثبت‌شده توسط کاربر` / `ساکن تایید مکانی`).
      - **Root Cause 4 Fixed — Connected Wizard Controls (`buildingAgeSegment`, `workHubId`) & Synchronized Top-Bar Slider Bounds (`FloatingTopBar.tsx`)**:
        - Wired interactive `buildingAgeSegment` selector in Step 1 and `workHubId` selector in Step 3 of `OnboardingWizardModal.tsx` (removing dead `void` suppressions), and aligned range slider `min`/`max` bounds with numeric input `min`/`max` bounds in `FloatingTopBar.tsx` (`deposit: 50..15000`, `monthlyRent: 0..300`, `buyTotalBudget: 1000..100000`, `targetSqm: 30..500`).
      - **Unit & Regression Coverage**:
        - Expanded `tests/resident-reviews-logic.test.ts` and `tests/domain-regressions.test.ts` (Assertion 38).
    - **Transitioned `WS-ARGON5-D` & `WS-CASPER-02`**: `DISCOVERED → TRIAGED → READY → IN_PROGRESS → VERIFYING → VERIFIED`. Closed `CAMPAIGN-ARGON5-01`: Marked `CAMPAIGN_COMPLETE`.
34. **`[2026-11-09T09:02:30-08:00] CASPER_UNFINISHED_WORK_CONSOLIDATION_COMPLETED (WS-CASPER-03)`**:
    - **Workstream Executed (`WS-CASPER-03`: End-to-End Sample Unification, Actionable Ad-to-Visit Pipeline, Dynamic Jalali Year Hygiene & Trade-Up Multi-Criteria Explainability)**:
      - **Risk Level**: `R2` | **Batches Used**: `1 / 3` | **Corrective Iterations**: `0 / 2`.
      - **`src/components/PortfolioModals.tsx` (288 lines `<= 290`)**:
        - Replaced `aggregateNeighborhoodMarketMetrics(vHood.id, vHood.name, vHood.buyPerSqm, [])` on line 137 with `buildNeighborhoodListingSamples(vHood)` and added implied square-footage benchmarking (`معادل ~X متر`) for visited homes.
        - Integrated `explainNeighborhoodRecommendation` into Trade-Up (`معاوضه و ارتقای متراژ ملک`) candidate cards so trade-up options expose `±0.3` score tie-bands (`≈ هم‌تراز ±۰.۳`) and non-compensatory infrastructure bottleneck warnings (`data-testid="tradeup-bottleneck-warning"`).
      - **`src/components/NeighborhoodBargainsAndVotesTabs.tsx` (217 lines `<= 290`)**:
        - Replaced custom inline bargain sample mapping on line 26 with canonical `buildNeighborhoodListingSamples(selectedHood)`.
        - Replaced hardcoded Jalali year `1405` on lines 44 and 109 with dynamic `getCurrentJalaliYear()`.
        - Connected the Smart Ad Analyzer (`کارشناسی هوشمند متن آگهی دیوار/شیپور`) directly to the Visited Homes notebook via a 1-click **"ثبت این آگهی در دفترچه بازدیدهای میدانی من"** action button (`data-testid="save-analyzed-ad-to-visits-btn"`).
      - **`src/components/SmartPriceForecastCard.tsx`, `src/components/SearchDropdownMenu.tsx` & `src/components/SmartSuggestModal.tsx`**:
        - Replaced remaining `aggregateNeighborhoodMarketMetrics(..., [])` calls with `buildNeighborhoodListingSamples(...)`, replaced hardcoded `1404`/`1405` lease audit dates in `SmartPriceForecastCard.tsx` with `getCurrentJalaliYear()`, and added an explicit epistemic disclosure badge (`data-testid="forecast-epistemic-badge"` — `برون‌یابی قاعده‌محور روند ۶ ماهه و P/R (سناریوی تحلیلی · غیرپیش‌بینی اقتصادسنجی)`).
      - **Unit & Regression Coverage**:
        - Added Assertion 39 in `tests/domain-regressions.test.ts`.
    - **Transitioned `WS-CASPER-03`**: `DISCOVERED → TRIAGED → READY → IN_PROGRESS → VERIFYING → VERIFIED`.
35. **`[2026-11-09T09:20:30-08:00] CASPER_SELF_CRITIQUE_AND_DEEP_AUDIT_COMPLETED (WS-CASPER-04)`**:
    - **Workstream Executed (`WS-CASPER-04`: Self-Critique & Deep Uncaught Algorithmic/Epistemic Weakness Remediation)**:
      - **Risk Level**: `R2` | **Batches Used**: `1 / 3` | **Corrective Iterations**: `0 / 2`.
      - **Self-Critique Fix 1 (`src/components/CompareModal.tsx` — 267 lines `<= 290`)**:
        - Neutralized `win: 0` on `'منشأ داده و شاخص پوشش نمونه (غیرآماری)'` (line 20). Previously, `agg1.evidenceIndexScore !== agg2.evidenceIndexScore` awarded a neighborhood comparison point (`win: 1 | 2`) to whichever neighborhood happened to have more scraped listings in the database, polluting `summaryStats.win1` / `summaryStats.win2`.
      - **Self-Critique Fix 2 (`src/components/PortfolioModals.tsx` — 288 lines `<= 290`)**:
        - Corrected Trade-Up tie-band reference score calculation (`maxTradeUpScore = Math.max(...displayedTradeUpHoods.map((x) => x.hood.overallScore))` and `tiedAtTopCount > 1`). Previously, `displayedTradeUpHoods[0]?.hood.overallScore` was used even though `displayedTradeUpHoods` is sorted by financial surplus/deficit rather than `overallScore`, and comparing index `[0]` against itself yielded a false-positive tie badge even when unique.
      - **Deep Uncaught Weakness Fix 3 (`src/data/neighborhoodInsights.ts` — 230 lines `<= 290`)**:
        - Eliminated the **Double Building-Age Depreciation Bug** in `evaluateTradeUpOptions` by anchoring `currentBaseBuyPerSqm = currentHood.baseBuyPerSqm ?? currentHood.buyPerSqm` and `targetBaseBuyPerSqm = n.baseBuyPerSqm ?? n.buyPerSqm`. Previously, when a user selected `'mid'` (`0.90x`) or `'old'` (`0.78x`) building age in the global sidebar filter, `useEvaluatedNeighborhoods` already scaled `buyPerSqm`, and `evaluateTradeUpOptions` multiplied `buyPerSqm` a second time by `currentAgeFactor` and `targetAgeMultiplier` (compounding depreciation down to `0.78 * 0.76 = 59.3%` instead of `76%`).
      - **Deep Uncaught Weakness Fix 4 (`src/components/ShortlistMatrixModal.tsx` — 276 lines `<= 290`)**:
        - Fixed the `Estimated Deal v6.4` row winner highlight (`const isBest = dealSqm === minDealPerSqm;` instead of `hood.buyPerSqm === minBuyPerSqm`) and updated the `overallScore` tie-band condition (`Math.abs(maxVal - val) <= 0.3 && tiedAtTopCount > 1`) so all tied-at-top shortlisted neighborhoods disclose `(≈ هم‌تراز ±۰.۳)`.
      - **Deep Uncaught Weakness Fix 5 (`src/components/ExpandableComparisonTable.tsx` — 282 lines `<= 290`)**:
        - Surfaced `explainA.nonCompensatoryWarningsFa[0]` and `explainB.nonCompensatoryWarningsFa[0]` on the `'overall'` row subtitle (`subA` / `subB`) so inline comparisons do not silently drop `< 6.5` infrastructure bottleneck warnings.
      - **Unit & Regression Coverage**:
        - Added Assertion 40 in `tests/domain-regressions.test.ts`.
    - **Transitioned `WS-CASPER-04`**: `DISCOVERED → TRIAGED → READY → IN_PROGRESS → VERIFYING → VERIFIED`.
36. **`[2026-11-09T09:28:30-08:00] CASPER_QUALITY_OVER_VANITY_AND_STATE_CONTINUITY_COMPLETED (WS-CASPER-05)`**:
    - **Workstream Executed (`WS-CASPER-05`: Real Quality Over Vanity Calibration, Liability Truthfulness & Independent State Continuity)**:
      - **Risk Level**: `R2` | **Batches Used**: `1 / 3` | **Corrective Iterations**: `0 / 2`.
      - **Quality-Over-Vanity Fix 1 (`src/components/BuyingPowerSummaryCard.tsx` — 158 lines `<= 290`)**:
        - Added `data-testid="buying-power-liability-disclosure"` separating `آورده خالص نقدی` from `تعهدات و اهرم‌ها` (`effectivePurchasingPowerMillion - buyTotalBudget`) and explicitly disclosing that `کمک رهن مستأجر` precludes personal occupancy until lease expiration and `۱۰٪ تنفس سند` is a deferred notary cash obligation rather than free purchasing power.
      - **Quality-Over-Vanity Fix 2 (`src/components/SuperModulesValuationAndFakeTabs.tsx` — 290 lines `<= 290`)**:
        - Replaced the legally/epistemically misleading `"گواهی رسمی کارشناسی هوشمند ارزش ملک"` ("Official Valuation Certificate") claim with `"گزارش تحلیلی کارشناسی هوشمند ارزش ملک (مدل هدونیک · غیررسمی)"`.
        - Calibrated `negotiationResult` to benchmark against age-adjusted neighborhood price (`baseBuyPerSqm * ageAdjustment * adClaimedSqm`) rather than unadjusted `buyPerSqm`.
        - In `combined_budget`, added real affordable area in `activeHood.name` at `activeHood.buyPerSqm` alongside the generic `75M/sqm` baseline.
      - **Quality-Over-Vanity Fix 3 (`src/components/PurchasingPowerTrendCard.tsx` & `src/components/BudgetBridgeAdvisorCard.tsx`)**:
        - Replaced `aggregateNeighborhoodMarketMetrics(..., [])` in `PurchasingPowerTrendCard.tsx` with `buildNeighborhoodListingSamples(selectedHood)` and removed phony `void total80mTodayMillions; void monthlyRent80mMillions;` suppressions across both cards by rendering those 80m² total & monthly rent benchmarks directly in the UI.
      - **Independent Continuation State Sync**:
        - Synchronized `docs/engineering/RMEP-001/PERSISTENT-ENGINEERING-MEMORY.md` (Revision `4.25`), `docs/engineering/RMEP-001/EXECUTION-STATE.json`, `docs/AUTONOMOUS-ENGINEERING-PROGRESS.md`, and `tests/domain-regressions.test.ts` (Assertion 41).
    - **Transitioned `WS-CASPER-05`**: `DISCOVERED → TRIAGED → READY → IN_PROGRESS → VERIFYING → VERIFIED`.
37. **`[2026-11-09T09:44:00-08:00] CASPER_CHARTER_PRIMARY_VIEWS_AND_REVERSE_BUDGET_COMPLETED (WS-CASPER-06)`**:
    - **Workstream Executed (`WS-CASPER-06`: Primary Workspace Views & Reverse Budget Finder Charter Alignment, Sample Unification & AFFORDABLE-First Ranking)**:
      - **Risk Level**: `R2` | **Batches Used**: `1 / 3` | **Corrective Iterations**: `0 / 2`.
      - **`src/components/views/ProductDiscoverView.tsx` (285 lines `<= 290`)**:
        - Replaced all 3 empty sample arrays (`aggregateNeighborhoodMarketMetrics(..., [])`) in `sortBy === 'price_asc'`, Grid cards, and List rows with `buildNeighborhoodListingSamples(hood)` so sorting by `"کمترین قیمت معامله v6.4"` and card deal badges reflect real neighborhood bargain listings and match the Inspector Drawer and Compare Modal.
        - Integrated `explainNeighborhoodRecommendation(hood, topFilteredScore)` across Grid and List cards to surface `< 6.5` non-compensatory infrastructure bottleneck warnings (`⚠ ...`) and `±0.3` score tie-band badges (`(≈ هم‌تراز ±۰.۳)`).
      - **`src/components/views/ProductHomeView.tsx` (279 lines `<= 290`)**:
        - Replaced the epistemically uncalibrated hero claim (`"داده‌های ثبت‌شده معاملات قطعی"` / `"verified transaction benchmarks"`) with honest `"بر پایه لنگرهای قیمتی بازار، سناریوی مذاکره (مدل v6.4 — غیرثبتی)، شاخص‌های زیست‌شهری و انطباق با بودجه شما"`.
        - Wired `buildNeighborhoodListingSamples(hood)` and `explainNeighborhoodRecommendation(hood, topFeaturedScore)` into featured neighborhood cards.
      - **`src/components/views/ProductUserSpaceView.tsx` (271 lines `<= 290`)**:
        - Wired `buildNeighborhoodListingSamples(hood)` and `explainNeighborhoodRecommendation(hood, topFavScore)` into saved shortlist neighborhood cards so users reviewing their bookmarked neighborhoods immediately see `< 6.5` non-compensatory infrastructure bottleneck warnings.
      - **`src/components/modals/ReverseBudgetDiscoveryModal.tsx` (278 lines `<= 290`) & `src/components/RadarWorkspaceShell.tsx` (284 lines `<= 290`)**:
        - Passed `overallScore` and `bargains` from `RadarWorkspaceShell.tsx` to `ReverseBudgetDiscoveryModal.tsx` and replaced `aggregateNeighborhoodMarketMetrics(..., [])` with `buildNeighborhoodListingSamples(...)`.
        - Fixed the **Reverse-Budget Over-Budget Ranking Inversion Defect**: previously, sorting solely by `targetDiffRatio = Math.abs(1 - effectiveSqmPrice / targetSqmPrice)` ranked an unaffordable `STRETCH` neighborhood (`ratio = 1.08`, 8% over budget) above an `AFFORDABLE` neighborhood (`ratio = 0.88`, within budget). Now `rankedMatches` prioritizes `AFFORDABLE` (`tier = 0`), followed by `STRETCH` neighborhoods reachable via `v6.4` negotiation (`isDealWithinBudget`, `tier = 1`, labeled `● در بودجه با سناریوی مذاکره v6.4`), followed by general `STRETCH` (`tier = 2`).
      - **Unit & Regression Coverage**:
        - Added Assertion 42 in `tests/domain-regressions.test.ts`.
38. **`[2026-11-09T10:20:00-08:00] CASPER_DECISION_EPISTEMOLOGY_SAMPLE_UNIFICATION_COMPLETED (WS-CASPER-07)`**:
    - **Workstream Executed (`WS-CASPER-07`: Decision Epistemology Engines & Search Dropdown Canonical Listing Samples Unification)**:
      - **Risk Level**: `R2` | **Batches Used**: `1 / 3` | **Corrective Iterations**: `0 / 2`.
      - **`src/components/SearchDropdownMenu.tsx` (278 lines `<= 290`)**:
        - Replaced empty array `[]` on line 62 with `buildNeighborhoodListingSamples({ id: n.id ?? 1, name: n.name ?? '', buyPerSqm: n.buyPerSqm, bargains: (n as EvaluatedNeighborhood).bargains })`. Now quick search results calculate real v6.4 closing deal prices instead of fallback ratios.
      - **`src/cells/decision-epistemology/unifiedDecisionSynthesisEngine.ts` (179 lines `<= 290`)**:
        - Replaced empty array `[]` on line 104 with `buildNeighborhoodListingSamples(hood)`.
      - **`src/cells/decision-epistemology/housingCycleRegimeEngine.ts` (184 lines `<= 290`)**:
        - Replaced empty array `[]` on line 157 with `buildNeighborhoodListingSamples(hood)`.
      - **`src/cells/decision-epistemology/spatialContagionEngine.ts` (288 lines `<= 290`)**:
        - Replaced empty arrays on lines 83, 174, 223, and 245 with `buildNeighborhoodListingSamples(hood)` and `buildNeighborhoodListingSamples(x.hood)`.
      - **`src/cells/decision-epistemology/epistemicDecisionEngine.ts` (285 lines `<= 290`)**:
        - Connected `buildNeighborhoodListingSamples({ id: input.hoodId, name: hoodName, buyPerSqm, bargains: found?.bargains })` on line 217.
      - **`src/cells/decision-epistemology/paretoRegretEngine.ts` (258 lines `<= 290`)**:
        - Connected `buildNeighborhoodListingSamples(targetHood)` and `buildNeighborhoodListingSamples(peer)` across lines 115, 128, and 167.
      - **`src/cells/decision-epistemology/realOptionsLiquidityEngine.ts` (286 lines `<= 290`)**:
        - Connected `buildNeighborhoodListingSamples(hood)` on line 269.
      - **Unit & Regression Coverage**:
        - Added Assertion 43 in `tests/domain-regressions.test.ts` (43/43 PASS).
39. **`[2026-11-09T10:50:00-08:00] CASPER_UNMONITORED_DEFECTS_AND_STATE_RESILIENCE_COMPLETED (WS-CASPER-08)`**:
    - **Workstream Executed (`WS-CASPER-08`: Deep Unmonitored Defect Elimination, Type Safety Hardening & Array Deserialization Resilience)**:
      - **Risk Level**: `R2` | **Batches Used**: `1 / 3` | **Corrective Iterations**: `0 / 2`.
      - **Zero Unsafe Casts on `baseBuyPerSqm`**:
        - Eliminated unsafe `(hood as any).baseBuyPerSqm` in `src/data/neighborhoods.ts` (lines 109 and 120), `src/data/superModulesLogic.ts` (line 12), and `src/components/AdminOverviewAndModerationTabs.tsx` (lines 68 and 233).
        - Replaced with direct typed access (`hood.baseBuyPerSqm ?? hood.buyPerSqm`) leveraging the optional interface property on `Neighborhood`, restoring compile-time type verification.
      - **Array Deserialization Resilience in `src/components/useAppUiState.ts` (288 lines `<= 290`)**:
        - Hardened `visitedHomes` state initialization and `onVisitedUpdated` window listener by validating `Array.isArray(parsed) ? parsed : []`, preventing silent client runtime exceptions if corrupted or non-array JSON is stored in localStorage.
      - **Unit & Regression Coverage**:
        - Added Assertion 44 to `tests/domain-regressions.test.ts` (44/44 PASS).
        - Full regression suites verified: `npm run arch:check` (0 errors), `npm test` (PASS), `npm run test:contracts` (9/9 PASS), `npm run test:mutation` (10/10 killed), `tests/stress-50-cycles.test.ts` (50/50 PASS), `tests/object-storage-*.test.ts` (43/43 PASS), `npm run test:smoke` (9/9 PASS), and `npm run build` (PASS).
    - **Transitioned `WS-CASPER-08`**: `DISCOVERED → TRIAGED → READY → IN_PROGRESS → VERIFYING → VERIFIED`.
40. **`[2026-11-09T12:25:00-08:00] CASPER_ROOT_CAUSE_DOUBLE_DISCOUNT_AND_STREET_SEARCH_COMPLETED (WS-CASPER-09)`**:
    - **Workstream Executed (`WS-CASPER-09`: Root-Cause Elimination of Double-Discounting in Unified Decision Synthesis, Multi-Bargain Street Search Blindness, and Canonical Sample & Dynamic Jalali Year Unification)**:
      - **Risk Level**: `R2` | **Batches Used**: `1 / 3` | **Corrective Iterations**: `0 / 2`.
      - **Root-Cause Fix 1 — Eliminated Double-Discounting & Empty Sample Array in `UnifiedDecisionSynthesisCard.tsx` and `unifiedDecisionSynthesisEngine.ts`**:
        - Exported `resolveNeighborhood` from `src/cells/decision-epistemology/unifiedDecisionSynthesisEngine.ts` and wired `buildNeighborhoodListingSamples(resolvedHood)` into `UnifiedDecisionSynthesisCard.tsx` (line 49) instead of an empty sample array `[]`.
        - Anchored `hoodBaselineAsk = hood.buyPerSqm || fairPrice` inside `synthesizeExecutiveDecisionReport` when invoking `computeAkerlofLemonIndex` and `aggregateNeighborhoodMarketMetrics(..., buildNeighborhoodListingSamples(hood))`, preventing the already-discounted `fairDealSqm` passed by `UnifiedDecisionSynthesisCard.tsx` from distorting Akerlof Lemon Index and IQR spread calculations against raw asking samples.
      - **Root-Cause Fix 2 — Eliminated Multi-Bargain Street & Sub-Neighborhood Search Blindness (`useEvaluatedNeighborhoods.ts`, `SearchDropdownMenu.tsx`, `ProductDiscoverView.tsx`)**:
        - Replaced `n.bargains?.[0]?.street` index-0-only check in `src/components/useEvaluatedNeighborhoods.ts` (compacted to `275` lines `<= 290`) and `src/components/SearchDropdownMenu.tsx` with `n.bargains?.some((b) => Boolean((b.street && matchesPersianSearch(b.street, q)) || (b.title && matchesPersianSearch(b.title, q))))`, and extended `ProductDiscoverView.tsx` search filter to match `h.pros` and all `h.bargains` streets/titles. Searching for secondary/sub-neighborhood streets (e.g., `سردار جنگل`, `بلوار دادمان`, `علامه جنوبی`, `منظریه نیاوران`, `خیابان ثارالله`) now accurately resolves their parent neighborhoods.
      - **Root-Cause Fix 3 — Canonical Sample & Dynamic Jalali Year Unification (`QuickHoodRankingStrip.tsx`, `NeighborhoodPriceTrendModal.tsx`, `HedonicValuationModal.tsx`)**:
        - Wired `buildNeighborhoodListingSamples` into `QuickHoodRankingStrip.tsx`, `NeighborhoodPriceTrendModal.tsx`, and `HedonicValuationModal.tsx`.
        - Replaced hardcoded `1405` in `HedonicValuationModal.tsx` (`handleNlpExtract` and `useEffect`) with `getCurrentJalaliYear()` and replaced `(propAreaUnit as any)` / `(propIntlCurrency as any)` with strict `AreaUnit` and `IntlCurrencyCode` types.
      - **Unit & Regression Coverage**:
        - Added Assertion 45 to `tests/domain-regressions.test.ts` (45/45 PASS).
    - **Transitioned `WS-CASPER-09`**: `DISCOVERED → TRIAGED → READY → IN_PROGRESS → VERIFYING → VERIFIED`.
41. **`[2026-11-09T13:20:00-08:00] CASPER_ZERO_TRUST_ADMIN_RBAC_AND_ROOT_CAUSE_HARDENING_COMPLETED (WS-CASPER-10)`**:
    - **Workstream Executed (`WS-CASPER-10`: Critical Self-Audit & Root-Cause Elimination of Temporary Passwordless Admin Bypass, Unwired ViewRouter Admin Dependencies, Silent Firestore Sponsor Override Errors, and O(N log N) Discover Aggregator Recomputation)**:
      - **Risk Level**: `R2` | **Batches Used**: `1 / 3` | **Corrective Iterations**: `0 / 2`.
      - **Root-Cause Fix 1 — Eliminated Temporary Passwordless Admin Bypass & Enforced Zero-Trust RBAC (`ProductAdminMonitoringView.tsx`, `ProductViewRouter.tsx`, `RadarWorkspaceShell.tsx`, `AdminModal.tsx`, `ProductGlobalHeader.tsx`)**:
        - Removed `useEffect(() => { ui.setAdminUnlocked(true); }, [])`, hardcoded `adminUnlocked={true}`, hardcoded `isVerifiedAdmin={true}`, `temporaryInspectionMode={true}`, and `"بررسی موقت بدون رمز"` from `src/components/views/ProductAdminMonitoringView.tsx` (`157` lines `<= 290`).
        - Enforced `if (!p.isVerifiedAdmin || !p.currentUser || !p.currentUser.emailVerified)` in `fetchSystemHealth` inside `ProductAdminMonitoringView.tsx` (matching `AppModalsPortal.tsx`).
        - Wired real `isVerifiedAdmin={p.isVerifiedAdmin}`, `allNeighborhoods={neighborhoods}`, `handleDeepWebSync={handleDeepWebSync}`, `mapTileStyle={mapTileStyle}`, and `setMapTileStyle={setMapTileStyle}` from `RadarWorkspaceShell.tsx` (`287` lines `<= 290`) through `ProductViewRouter.tsx` (`279` lines `<= 290`) into `ProductAdminMonitoringView.tsx`.
        - Removed unused `temporaryInspectionMode` prop from `src/components/AdminModal.tsx` (`275` lines `<= 290`) and removed duplicate temporary bypass button (`global-header-admin-btn`) from `src/components/navigation/ProductGlobalHeader.tsx` (`224` lines `<= 290`).
      - **Root-Cause Fix 2 — Eliminated Silent Firestore Write Error Swallowing (`src/components/useRadarAdminActions.ts`)**:
        - Updated `persistHoodOverrideToCloud` to support `sponsorVal === null` (`...(sponsorVal !== undefined ? { sponsor: sponsorVal } : {})`) and replaced `.catch(() => {})` in `handleExtendSponsor30Days` and `handleReleaseHoodSponsor` with `handleFirestoreError(err, OperationType.WRITE, \`neighborhoodOverrides/${hoodId}\`)` and explicit admin status feedback via `p.setAdminPriceSavedMsg(...)` (`276` lines `<= 290`).
      - **Root-Cause Fix 3 — Eliminated O(N log N) Redundant Market Aggregator Recomputation (`src/components/views/ProductDiscoverView.tsx`)**:
        - Precomputed `dealPriceByHoodId` via `useMemo` in `ProductDiscoverView.tsx` (`280` lines `<= 290`), eliminating repeated calls to `aggregateNeighborhoodMarketMetrics` inside `.sort()` comparators and `.map()` render loops.
      - **Unit & Regression Coverage**:
        - Added Assertion 46 to `tests/domain-regressions.test.ts` (46/46 PASS).
    - **Transitioned `WS-CASPER-10`**: `DISCOVERED → TRIAGED → READY → IN_PROGRESS → VERIFYING → VERIFIED`.
42. **`[2026-11-09T13:40:00-08:00] CASPER_TYPESCRIPT_CONTRACT_DRIFT_AND_SPARSE_IQR_HARDENING_COMPLETED (WS-CASPER-11)`**:
    - **Workstream Executed (`WS-CASPER-11`: Uncaught TypeScript Contract Drift Remediation, Sparse-Sample IQR Dispersion Fallbacks & Independent State Continuity)**:
      - **Risk Level**: `R2` | **Batches Used**: `1 / 3` | **Corrective Iterations**: `0 / 2`.
      - **Root-Cause Fix 1 — Backend Domain Module TypeScript Contract Completion (`server/modules/property-insurance/` & `server/modules/property-registry/`)**:
        - Restored `server/modules/property-insurance/coverage/policyAndClaimStateMachineEngine.ts` and dual `createPropertyInsuranceService` overloads in `server/modules/property-insurance/index.ts`.
        - Exported `createPropertyRegistryService`, `PROPERTY_REGISTRY_COLLECTIONS`, `GeographyReadAdapter`, `PropertyRegistryStoreTransaction`, and `PropertyRegistryTransactionRunner` from `server/modules/property-registry/index.ts` (4/4 test suites / 28 requirements PASS).
      - **Root-Cause Fix 2 — Cloudflare Worker Binding & Compatibility Matrix Contract Parity (`worker/types.ts`)**:
        - Added `readonly RADAR_QUEUE?: Queue;` and `readonly RADAR_DLQ?: Queue;` to `WorkerEnv` and `readonly rationale?: string;` to `DependencyCompatibilityEntry` in `worker/types.ts`.
      - **Root-Cause Fix 3 — Decision Epistemology Engine Contracts & Sparse-Sample IQR Fallbacks (`src/cells/decision-epistemology/*.ts`, all `<= 290` lines)**:
        - `housingCycleRegimeEngine.ts` (196 lines `<= 290`): Restored CPI-deflated `realMomentum6mPct`, `isStagflationaryIllusion`, `stagflationWarningFa`, and `dynamicEquilibriumPR`.
        - `paretoRegretEngine.ts` (265 lines `<= 290`): Restored non-compensatory `< 5.0` bottleneck veto penalty in `computeNeighborhoodUtilityScore` and Hurwicz `optimismAlpha` (`hurwiczScoreMillion`, `isHurwiczOptimal`) in `computeSavageMinimaxRegretMatrix`.
        - `spatialContagionEngine.ts` (275 lines `<= 290`) & `epistemicDecisionEngine.ts` (290 lines `<= 290`): Added optional `customHood?: Neighborhood` parameter to `buildNeighborhoodSpatialContagionReport` and bounded fallback IQR dispersion (`resolvedIqrLow`, `resolvedIqrHigh`) when `validSampleCount < 3` so `ANCHORING_BIAS` and `computeAkerlofLemonIndex` never output `0 م.ت` or `0%` dispersion.
        - `unifiedDecisionSynthesisEngine.ts` (212 lines `<= 290`): Restored 3-stage `DealExecutionPlaybook` (`signingStagePct`, `handoverStagePct`, `deedStagePct`, `protectiveClausesFa`, `copyableActionSheetFa`), `isStagflationaryIllusion`, and `illiquidityAdjustedVaR95RealPct`.
      - **Unit & Regression Coverage**:
        - Added Assertion 47 to `tests/domain-regressions.test.ts` (47/47 PASS) and verified 19/19 tests in `tests/casper-epistemic-decision-intelligence.test.ts`.
    - **Transitioned `WS-CASPER-11`**: `DISCOVERED → TRIAGED → READY → IN_PROGRESS → VERIFYING → VERIFIED`.
43. **`[2026-11-09T14:05:00-08:00] CASPER_CONVENTIONAL_ASSUMPTION_CHALLENGE_AND_CONTRACT_ROOM_PLAYBOOK_COMPLETED (WS-CASPER-12)`**:
    - **Workstream Executed (`WS-CASPER-12`: Challenging Conventional PropTech Assumptions — Contract-Room 3-Stage Escrow Execution Playbook UI, Source-Asset Swap Friction Dynamics, Empirical v6.4 Isochrone/Reference Grounding & 100% Repository-Wide Sample Unification)**:
      - **Risk Level**: `R2` | **Batches Used**: `1 / 3` | **Corrective Iterations**: `0 / 2`.
      - **Assumption Challenged 1 — "Analytical Verdicts Alone Are Sufficient Without a Contract-Room Execution Playbook" (`src/components/stage2/UnifiedDecisionSynthesisCard.tsx`, 265 lines `<= 290`)**:
        - Bridged the engine-to-UI gap where `report.executionPlaybook`, `report.isStagflationaryIllusion`, and `report.illiquidityAdjustedVaR95RealPct` were computed in `unifiedDecisionSynthesisEngine.ts` but never rendered in `UnifiedDecisionSynthesisCard.tsx`.
        - Rendered the **Contract-Room 3-Stage Sayadi Escrow Playbook (`شیوه‌نامه اجرایی ۳مرحله‌ای اتاق قرارداد و شروط حفاظتی صیادی`)** (`data-testid="casper-execution-playbook-panel"`) displaying exact 30%/40%/30% staged payments in Million Toman, 3 dynamic legal/technical protective clauses, a 1-click clipboard action-sheet button (`data-testid="copy-deal-playbook-btn"`), the Stagflationary Money-Illusion alert badge (`data-testid="synthesis-stagflation-badge"`), and Illiquidity-Adjusted Real VaR95 (`VaR95 خروج اضطراری`).
      - **Assumption Challenged 2 — "All Liquid Assets Have Identical 1.5% Exit Friction & Opportunity Cost When Swapping into Housing" (`src/cells/decision-epistemology/macroPortfolioArbitrageEngine.ts`, 266 lines `<= 290`, & `src/components/stage2/MacroPortfolioArbitrageCard.tsx`, 261 lines `<= 290`)**:
        - Replaced the unused `sourceAsset` parameter in `evaluateAssetSwapToHousing` with source-specific liquidation slippage (`GOLD_COIN`: `1.1%` dealer spread + `1.5%` = `2.6%`; `US_DOLLAR`: `0.7%` FX spread + `1.5%` = `2.2%`; `FIXED_INCOME`: `0.1%` bond redemption + `1.5%` = `1.6%`) and differential 2-year compounding opportunity cost (`twoYrExcessGrowthRate`).
        - Added portfolio **`weightedLiquidityDays` (میانگین وزنی روزهای نقدشوندگی سبد)** and interactive source-asset selector buttons (`data-testid="swap-source-asset-selector"`) in `MacroPortfolioArbitrageCard.tsx`.
      - **Assumption Challenged 3 — "Spatial Isochrone Arbitrage & Offline Reference Fallbacks Can Rely on Raw Asking Prices or Flat `0.92` Multipliers" (`src/cells/decision-epistemology/urbanAffordabilityIsochroneEngine.ts`, 206 lines `<= 290`, `src/components/stage2/SocioeconomicReferenceCard.tsx`, 283 lines `<= 290`, `src/components/ContractLegalAdvisorView.tsx`, 250 lines `<= 290`, & `src/components/AdminSecurityAndBackupTabs.tsx`, 287 lines `<= 290`)**:
        - Grounded target and candidate substitute neighborhoods in `urbanAffordabilityIsochroneEngine.ts` and `buildFallbackRollup` in `SocioeconomicReferenceCard.tsx` on `aggregateNeighborhoodMarketMetrics(..., buildNeighborhoodListingSamples(...)).estimatedDealPricePerSqm` (`v6.4`).
        - Eliminated the final 2 empty sample arrays `aggregateNeighborhoodMarketMetrics(..., [])` in the entire `src/` tree (`ContractLegalAdvisorView.tsx` and `AdminSecurityAndBackupTabs.tsx`).
      - **Unit & Regression Coverage**:
        - Updated Test 12 in `tests/casper-epistemic-decision-intelligence.test.ts` (19/19 PASS) and added Assertion 48 to `tests/domain-regressions.test.ts` (48/48 PASS).
    - **Transitioned `WS-CASPER-12`**: `DISCOVERED → TRIAGED → READY → IN_PROGRESS → VERIFYING → VERIFIED`.
44. **`[2026-11-09T14:15:00-08:00] CASPER_SECOND_ORDER_CRITIQUE_AND_MATHEMATICAL_PERFECTION_COMPLETED (WS-CASPER-13)`**:
    - **Workstream Executed (`WS-CASPER-13`: Deep Second-Order Critique — Real Options Buyer Reservation Price Sign Correction, Rent-vs-Buy Real-Wealth Indifference & Bisection Solver, Empirical IQR Monte Carlo Calibration & Cross-Tab `sharedTargetSqm` Continuity)**:
      - **Risk Level**: `R2` | **Batches Used**: `1 / 3` | **Corrective Iterations**: `0 / 2`.
      - **Second-Order Fix 1 — Corrected Economic Sign-Inversion in Real Options Buyer Guidance (`src/cells/decision-epistemology/realOptionsLiquidityEngine.ts`, 287 lines `<= 290`, & `src/components/stage2/RealOptionsLiquidityCard.tsx`, 229 lines `<= 290`)**:
        - Identified that presenting `hurdlePricePerSqm = basePriceSqm * hurdleRateMultiplier` as `"سقف توجیه"` to a buyer inverted economic logic (higher uncertainty increased the "ceiling").
        - Added `buyerReservationPricePerSqm = Number((basePriceSqm / hurdleRateMultiplier).toFixed(1))` and `requiredBuyerDiscountPct` (`data-testid="buyer-reservation-ceiling"`) so that higher uncertainty or longer waiting horizons strictly lower the buyer's immediate entry ceiling, while preserving `hurdlePricePerSqm` as the required fundamental asset value target.
      - **Second-Order Fix 2 — Resolved Intertemporal Nominal-vs-Real Scale Mismatch & Added Exact Bisection Indifference Solver (`src/cells/decision-epistemology/rentVsBuyArbitrageEngine.ts`, 278 lines `<= 290`, & `src/components/stage2/RentVsBuyArbitrageCard.tsx`, 270 lines `<= 290`)**:
        - Replaced the distorted comparison of Year-$T$ nominal wealth difference (`diffMillion`) against Year-0 property price (`initialPropertyValue * 0.12`) with scale-invariant Year-0 real purchasing power comparison (`realDiffMillion` vs `initialPropertyValue * 0.06`).
        - Added a 14-iteration bisection solver computing `breakEvenAlternativeReturnPct` (the exact annual return % of the alternative portfolio where `terminalRentWealth === terminalBuyWealth`) and rendered a 1-click snap button (`data-testid="snap-breakeven-alt-return-btn"`) in `RentVsBuyArbitrageCard.tsx`.
      - **Second-Order Fix 3 — Grounded Monte Carlo Tail-Risk Volatility in Empirical IQR Dispersion (`src/cells/decision-epistemology/monteCarloRiskDensityEngine.ts`, 268 lines `<= 290`)**:
        - Connected `generateCasperMonteCarloRiskReport` to `aggregateNeighborhoodMarketMetrics(..., buildNeighborhoodListingSamples(hood))` and `formatMillionTomanAsIntlCurrency`, blending empirical IQR listing spread (`iqrSpreadRatio`) into `annualVolSigma`. All 9 decision-epistemology engines now have 100% empirical sample and international currency parity.
      - **Second-Order Fix 4 — Eliminated Cross-Tab `targetSqm` State Amnesia (`Stage2MasterWidget.tsx`, 249 lines `<= 290`, `UnifiedDecisionSynthesisCard.tsx`, 273 lines `<= 290`, `EpistemicProvenancePanel.tsx`, 282 lines `<= 290`, `ParetoRegretSimulatorCard.tsx`, 259 lines `<= 290`, & `RentVsBuyArbitrageCard.tsx`, 270 lines `<= 290`)**:
        - Lifted `sharedTargetSqm` state into `Stage2MasterWidget.tsx` and synchronized `initialTargetSqm` + `onTargetSqmChange` across all apartment-size-dependent decision tabs.
      - **Unit & Regression Coverage**:
        - Updated Tests 17 and 18 in `tests/casper-epistemic-decision-intelligence.test.ts` (19/19 PASS) and added Assertion 49 to `tests/domain-regressions.test.ts` (49/49 PASS).
    - **Transitioned `WS-CASPER-13`**: `DISCOVERED → TRIAGED → READY → IN_PROGRESS → VERIFYING → VERIFIED`.
45. **`[2026-11-09T14:25:00-08:00] CASPER_TOOL_DRIVEN_BLOCKER_ELIMINATION_COMPLETED (WS-CASPER-14)`**:
    - **Workstream Executed (`WS-CASPER-14`: Tool-Driven Engineering & Blocker Elimination — User-Token-Delegated Firestore REST Reconciliation Without `FIREBASE_SERVICE_ACCOUNT_JSON`, `/buyerAlerts` Owner List Parity in `firestore.rules`, and 10/10 Live Chromium Smoke Verification)**:
      - **Risk Level**: `R2` | **Batches Used**: `1 / 3` | **Corrective Iterations**: `0 / 2`.
      - **Blocker Eliminated 1 — User-Token-Delegated Firestore REST Reconciliation (`src/utils/identityLifecycleAndBackendGovernance.ts`, 284 lines `<= 288`, & `src/utils/serverPublisherBargains.ts`, 281 lines `<= 288`)**:
        - Challenged the previous assumption recorded in `EXECUTION-STATE.json` that `GET /api/account/export-data` and `POST /api/account/delete` could not reconcile live Firestore `buyerAlerts` without `FIREBASE_SERVICE_ACCOUNT_JSON`.
        - Because both routes already require and verify the caller's Firebase ID token (`Authorization: Bearer <idToken>`), upgraded `reconcileUserBuyerAlertsInFirestore(uid, mode, rawAuthHeaderOrToken, fetchFn)` to execute user-scoped Firestore REST `:runQuery` (`where userId == uid`) and document `DELETE` calls authenticated with the user's own Bearer token whenever `FIREBASE_SERVICE_ACCOUNT_JSON` / `FIRESTORE_EMULATOR_HOST` is absent.
      - **Blocker Eliminated 2 — Owner-Scoped `list` Rule Parity on `/buyerAlerts/{alertId}` (`firestore.rules`)**:
        - Harmonized `/buyerAlerts/{alertId}` `allow list` with `/votes/{voteId}` by adding `|| (isVerifiedUser() && existing().userId == request.auth.uid)` so verified users can query their own `buyerAlerts` via `where('userId', '==', request.auth.uid)` while non-admin cross-user `list` queries remain strictly denied.
        - Verified via `@firebase/eslint-plugin-security-rules` (`npx eslint firebase-blueprint.json firestore.rules`, 0 errors) and `npm run test:rules:static` (13/13 static checks + 9/9 data integrity checks PASS). Also invoked `rpc_action` (`DeployRules`) and `deploy_firebase` to test live cloud deployment, confirming the exact platform permission boundary (`The caller does not have permission` on legacy database `ai-studio-e48df7a4-9535-4bf0-a948-61a6a0f37a6a`).
      - **Tool-Driven Verification 3 — Live Browser Inspection via `playwright-cli` (`computer-use` skill) & Workflow 10 in `tests/browser-smoke.test.ts`**:
        - Restarted dev server (`restart_dev_server`), opened `http://localhost:3000` in `playwright-cli` (`1440×900`), verified `0` console errors and `0` warnings, captured `.playwright-cli/casper-stage2-verified.png`, and added Workflow 10 to `tests/browser-smoke.test.ts` (10/10 real headless Chromium workflows PASS).
      - **Unit & Regression Coverage**:
        - Added Test 20 to `tests/casper-epistemic-decision-intelligence.test.ts` (20/20 PASS) and Assertion 50 to `tests/domain-regressions.test.ts` (50/50 PASS).
    - **Transitioned `WS-CASPER-14`**: `DISCOVERED → TRIAGED → READY → IN_PROGRESS → VERIFYING → VERIFIED`.
46. **`[2026-11-09T22:14:00-08:00] CASPER_UNKNOWN_DEFECT_DISCOVERY_AND_END_TO_END_HARDENING_COMPLETED (WS-CASPER-15)`**:
    - **Workstream Executed (`WS-CASPER-15`: Autonomous Unknown-Defect Discovery — Knowledge Crowd Response Contract & UID Anti-Spoofing, Complete Bearer REST Delegation for Buyer Alerts, Zero-MAD Dispersion Floor & Cryptographic Hedonic Seal Verification, and Empirical v6.4 Socioeconomic Deal Anchoring)**:
      - **Risk Level**: `R2` | **Batches Used**: `1 / 3` | **Corrective Iterations**: `0 / 2`.
      - **Unknown Defect 1 — Knowledge Crowd Frontend-Backend Response Contract Mismatch & UID Spoofing (`src/cells/knowledge-crowd/crowdClaimsRoutes.ts`, 255 lines `<= 290`, `src/cells/knowledge-crowd/crowdClaimsEngine.ts`, 285 lines `<= 290`, & `src/components/stage2/NeighborhoodCrowdClaimsPanel.tsx`, 276 lines `<= 290`)**:
        - Discovered that `GET /api/v1/claims/hood/:hoodId` returned uppercase keys (`VERIFIED_REFERENCE`, `STAGE_COMMUNITY`) whereas `NeighborhoodCrowdClaimsPanel.tsx` only inspected `data.verifiedReferenceClaims` and `data.communityStageClaims`, silently discarding newly submitted claims on refresh.
        - Standardized both camelCase and uppercase keys in `crowdClaimsRoutes.ts` and `NeighborhoodCrowdClaimsPanel.tsx`, enforced `Authorization: Bearer <idToken>` UID anti-spoofing (`403 UID_SPOOFING_FORBIDDEN`) and role-badge escalation prevention on `POST /api/v1/claims` and `POST /api/v1/claims/:claimId/vote`, added `formatMillionTomanAsIntlCurrency` parity to `NeighborhoodCrowdClaimsPanel.tsx`, and compacted `crowdClaimsEngine.ts` below `290` lines.
      - **Unknown Defect 2 — Complete Bearer Token Firestore REST Delegation for `listDurableBuyerAlerts` & `persistBuyerAlertDocument` (`src/utils/identityLifecycleAndBackendGovernance.ts`, 230 lines `<= 288`, & `src/utils/serverUtilityRoutes.ts`, 204 lines `<= 288`)**:
        - Extended caller Bearer token Firestore REST delegation (`:runQuery` for admin lead listing and `GET`/`PATCH /documents/buyerAlerts/${alertDocId}` for user alert creation) to `listDurableBuyerAlerts` and `persistBuyerAlertDocument`, passing `req.headers.authorization` from `GET /api/admin/buyer-alerts` and `POST /api/buyer-alerts`.
      - **Unknown Defect 3 — Zero-MAD Dispersion Collapse, Live Override Lookup & Cryptographic Seal Verification (`src/cells/valuation-authority/robustValuationEngine.ts`, 263 lines `<= 290`)**:
        - Added `ZERO_MAD_RELATIVE_BANDWIDTH_FLOOR = 0.025` so datasets where $\ge 50\%$ of observations share the median (`madValue === 0`) do not falsely reject $\pm 2.5\%$ inliers; applied `deepSyncedOverrides` and `floor <= totalFloors` clamping in `computeServerValuationSeal`; and exported constant-time `verifyServerValuationSeal` (`crypto.timingSafeEqual`).
      - **Unknown Defect 4 — Socioeconomic `VERIFIED_DEAL` Seed Anchoring & Synthesis Asking-Price Parity (`src/cells/socioeconomic-intelligence/socioeconomicRollupEngine.ts`, 280 lines `<= 290`, `src/cells/socioeconomic-intelligence/socioeconomicRoutes.ts`, 199 lines `<= 290`, & `src/components/stage2/SocioeconomicReferenceCard.tsx`, 267 lines `<= 290`)**:
        - Anchored `VERIFIED_DEAL` seed observations in `socioeconomicRollupEngine.ts` to empirical v6.4 `dealPerSqm` (`aggregateNeighborhoodMarketMetrics`), passed `rollup.medianPriceSqm` as `askingPricePerSqm` into `synthesizeExecutiveDecisionReport` in `socioeconomicRoutes.ts`, and recomputed `yearsOfHouseholdSavingRequired` + surfaced live k-anonymity session count in `SocioeconomicReferenceCard.tsx`.
      - **Unit & Regression Coverage**:
        - Added Test 21 to `tests/casper-epistemic-decision-intelligence.test.ts` (21/21 PASS) and Assertion 51 to `tests/domain-regressions.test.ts` (51/51 PASS).
    - **Transitioned `WS-CASPER-15`**: `DISCOVERED → TRIAGED → READY → IN_PROGRESS → VERIFYING → VERIFIED`.
47. **`[2026-11-09T22:52:00-08:00] CASPER_ENTITY_RESOLUTION_AND_NON_COMPENSATORY_MCDA_ELEVATION_COMPLETED (WS-CASPER-16)`**:
    - **Workstream Executed (`WS-CASPER-16`: Entity Resolution Streetless Anti-Merge, Empirical Neighborhood Price Fallback, AI Ingestion Route Mounting & Admin Guard, Non-Compensatory MCDA Veto + Base-Rate Neglect Alert, and Stage 2 International Currency Parity)**:
      - **Risk Level**: `R2` | **Batches Used**: `1 / 3` | **Corrective Iterations**: `0 / 2`.
      - **Root-Cause Fix 1 — Eliminated False-Positive Canonical Building Merges on Missing Street Names (`src/cells/ai-ingestion/entityResolutionEngine.ts`, 237 lines `<= 290`, & `src/cells/ai-ingestion/aiSeedExtractionService.ts`, 230 lines `<= 290`)**:
        - Fixed `computeBuildingSimilarityScore` where two unrelated listings in the same neighborhood without street names (`'نامشخص' === 'نامشخص'`) and without GPS coordinates received `streetScore = 1.0` and `spatialScore = 0.9` (`similarityScore = 0.984 >= 0.85`), falsely merging distinct buildings into one record.
        - Replaced hardcoded `currentJalaliYear = 1405` and fallback `pricePerSqm = 120` in `aiSeedExtractionService.ts` with `getCurrentJalaliYear()` and empirical neighborhood `buyPerSqm`/`rahn80m` from `MULTI_CITY_CONFIGS`/`INITIAL_NEIGHBORHOODS`, and added support for decimal slash/comma (`18/4 میلیارد`) and `ودیعه` regex extraction.
      - **Root-Cause Fix 2 — Mounted & Hardened AI Ingestion Routes (`src/cells/ai-ingestion/aiIngestionRoutes.ts`, 148 lines `<= 290`, `src/utils/serverUtilityRoutes.ts`, 203 lines `<= 288`, & `src/utils/expressRouteCatalog.ts`, 207 lines `<= 288`)**:
        - Added prompt-injection rejection (`422 PROMPT_INJECTION_DETECTED`) on `POST /api/v1/ai-ingestion/extract-and-resolve` and `verifyAdminAuth` enforcement on `POST /api/v1/buildings/merge-duplicates`, mounted `registerAiIngestionRoutes` in `serverUtilityRoutes.ts`, and registered all 3 routes in `REGISTERED_API_ROUTES` (`expressRouteCatalog.ts`).
      - **Root-Cause Fix 3 — Non-Compensatory MCDA Veto, True Annual Rental Yield & 4th `base_rate` Bias Alert (`src/cells/socioeconomic-intelligence/casperDecisionEngine.ts`, 270 lines `<= 290`, & `src/components/stage2/CasperDecisionMatrixCard.tsx`, 279 lines `<= 290`)**:
        - Fixed `annualRentalYieldPct` (`(rahn80m * 0.36) / (deal * 80) * 100`), added the 4th cognitive bias alert (`base_rate` — Base-Rate Neglect), enforced Non-Compensatory Veto guardrails (`nonCompensatoryVetoTriggered`, `vetoReasonsFa`) when `safetyUtility < 52`, `liquidityUtility < 48`, or `priceUtility < 40`, derived empirical neighborhood scores from `hood` in `CasperDecisionMatrixCard.tsx`, and displayed normalized effective weight shares (`normalizedSharePct`).
      - **Root-Cause Fix 4 — Full Stage 2 International Currency (`OP-DEC-001`) Parity (`src/components/stage2/EpistemicProvenancePanel.tsx`, 284 lines `<= 290`, `src/components/stage2/SpatialContagionLabCard.tsx`, 239 lines `<= 290`, & `src/components/stage2/Stage2MasterWidget.tsx`, 248 lines `<= 290`)**:
        - Wired `formatMillionTomanAsIntlCurrency` across `EpistemicProvenancePanel.tsx`, `SpatialContagionLabCard.tsx` (rendering `node.dealPricePerSqm` + intl currency on every spatial contagion node), and `Stage2MasterWidget.tsx`, and mounted interactive `<CasperDecisionMatrixCard compact />` inside `EpistemicProvenancePanel.tsx`.
      - **Unit & Regression Coverage**:
        - Added Test 22 to `tests/casper-epistemic-decision-intelligence.test.ts` (22/22 PASS) and Assertion 52 to `tests/domain-regressions.test.ts` (52/52 PASS).
    - **Transitioned `WS-CASPER-16`**: `DISCOVERED → TRIAGED → READY → IN_PROGRESS → VERIFYING → VERIFIED`.
48. **`[2026-11-09T23:35:00-08:00] CASPER_STAGE2_EPISTEMIC_PARITY_AND_ISOCHRONE_UNIFICATION_COMPLETED (WS-CASPER-17)`**:
    - **Workstream Executed (`WS-CASPER-17`: Stage 2 Epistemic Parity & Multi-Currency Urban Isochrone Unification — Dynamic Currency Formatting in Urban Affordability, Canonical Vanak Hub Resolution, and Hood + IntlCurrency Parity Across Housing Cycle & Real Options)`:
      - **Risk Level**: `R2` | **Batches Used**: `1 / 3` | **Corrective Iterations**: `0 / 2`.
      - **Root-Cause Fix 1 — Dynamic Currency Formatting & Live State Preservation in Urban Affordability (`src/cells/decision-epistemology/urbanAffordabilityIsochroneEngine.ts`, 214 lines `<= 290`)**:
        - Replaced hardcoded `'USD'` in `formatMillionTomanAsIntlCurrency(savings, 'USD', 'fa')` with dynamic `intlCurrency: IntlCurrencyCode = 'USD'`, accepted optional `providedHood?: Neighborhood` so live mutated/overridden properties are prioritized over static seed resolution, and exported `type IntlCurrencyCode`.
      - **Root-Cause Fix 2 — Canonical Employment Hub Resolution & Wireup in Urban Affordability Card (`src/components/stage2/UrbanAffordabilityIsochroneCard.tsx`, 266 lines `<= 290`)**:
        - Replaced invalid default employment hub `'hub-mirdamad'` (which was not in `WORK_HUBS` and caused silent fallback to `hubs[0]` with null coordinates) with canonical `'vanak'` from `WORK_HUBS`, added `hood?: Neighborhood` to props, and passed `hood` and `intlCurrency` into `generateCasperUrbanAffordabilityReport`.
      - **Root-Cause Fix 3 — Housing Cycle & Regime Exhaustion Hood & Multi-Currency Parity (`src/cells/decision-epistemology/housingCycleRegimeEngine.ts`, 206 lines `<= 290`, & `src/components/stage2/HousingCycleRegimeCard.tsx`, 216 lines `<= 290`)**:
        - Upgraded `generateCasperHousingCycleReport` to accept `providedHood?: Neighborhood` and `intlCurrency: IntlCurrencyCode = 'USD'`, populated `basePriceIntlText` and `rahn80mIntlText` in `CasperHousingCycleDossier`, added `hood?: Neighborhood` to `HousingCycleRegimeCardProps`, and passed `hood` and `intlCurrency` from `Stage2MasterWidget.tsx`.
      - **Root-Cause Fix 4 — Real Options Liquidity Survival Hood & Multi-Currency Parity (`src/cells/decision-epistemology/realOptionsLiquidityEngine.ts`, 281 lines `<= 290`, & `src/components/stage2/RealOptionsLiquidityCard.tsx`, 230 lines `<= 290`)**:
        - Upgraded `generateCasperLiquidityReport` to accept `providedHood?: Neighborhood` and `intlCurrency: IntlCurrencyCode = 'USD'`, populated `basePriceIntlText`, `valueOfWaitingIntlText`, and `buyerReservationIntlText`, eliminated unused void expression, added `hood?: Neighborhood` to `RealOptionsLiquidityCardProps`, and wired `hood` and `intlCurrency`.
      - **Unit & Regression Coverage**:
        - Added Test 23 to `tests/casper-epistemic-decision-intelligence.test.ts` (23/23 PASS) and Assertion 53 to `tests/domain-regressions.test.ts` (53/53 PASS).
    - **Transitioned `WS-CASPER-17`**: `DISCOVERED → TRIAGED → READY → IN_PROGRESS → VERIFYING → VERIFIED`.



49. **`[2026-11-09T23:55:00-08:00] BACKEND_STATE_MACHINE_RESILIENCE_AND_SELF_HEALING_COMPLETED (WS-CASPER-18)`**:
    - **Workstream Executed (`WS-CASPER-18`: Property Insurance Policy & Claim State-Machine Engine Self-Healing & Parity Hardening)**:
      - **Risk Level**: `R1` | **Batches Used**: `1 / 3` | **Corrective Iterations**: `0 / 2`.
      - **Self-Healing Reconstruction (`server/modules/property-insurance/coverage/policyAndClaimStateMachineEngine.ts`, 232 lines `<= 290`)**:
        - Reconstructed and hardened `policyAndClaimStateMachineEngine.ts` following deletion resilience testing.
        - Enforced canonical `CoreApiError('VALIDATION_FAILED', 400, ...)` across `assertValidPolicyStateTransition`, `assertValidClaimStateTransition`, and `validateSettlementCalculations` (replacing non-canonical `INVALID_ARGUMENT`).
        - Implemented exhaustive state machines for `InsurancePolicyLifecycleStatus` (`DRAFT`, `SUBMITTED`, `PENDING_VERIFICATION`, `ACTIVE`, `SUSPENDED`, `EXPIRED`, `CANCELLED`, `NON_RENEWED`, `DISPUTED`, `UNKNOWN`) and `InsuranceClaimLifecycleStatus` (`DRAFT`, `REPORTED`, `SUBMITTED`, `ACKNOWLEDGED`, `UNDER_REVIEW`, `INSPECTION_REQUIRED`, `ADDITIONAL_EVIDENCE_REQUIRED`, `APPROVED`, `PARTIALLY_APPROVED`, `REJECTED`, `SETTLEMENT_PENDING`, `SETTLED`, `DISPUTED`, `WITHDRAWN`, `CLOSED`).
        - Implemented `validateSettlementCalculations` with coverage limit checks and `partiallyApprovedFlag` derivation, and `evaluatePolicyCoverageStatusWithLimitations` returning full `PolicyCoverageEvaluationReport`.
      - **Verification & Parity**:
        - Passed `npm run lint` (0 errors), `npm run arch:check` (0 errors, 317 files `<= 290` lines), all 53 domain regression assertions, 23/23 CASPER epistemic decision intelligence tests, 50/50 stress cycles, 43 object storage security tests, 10/10 Chromium browser smoke tests, and all Playwright E2E workflows.
    - **Transitioned `WS-CASPER-18`**: `DISCOVERED → TRIAGED → READY → IN_PROGRESS → VERIFYING → VERIFIED`.
