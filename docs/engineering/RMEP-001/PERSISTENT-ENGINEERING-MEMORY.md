# RMEP-001 — PERSISTENT ENGINEERING MEMORY (`PERSISTENT-ENGINEERING-MEMORY.md`)

- **Document Path**: `docs/engineering/RMEP-001/PERSISTENT-ENGINEERING-MEMORY.md`
- **Memory System Version**: `4.0` (Golden Persistent Engineering Memory System)
- **Program Alignment**: `RMEP-001` (`v4.1`) — Radar Maskan / Tehran Radar (`رادار مسکن کلانشهرهای ایران`)
- **Target Applet ID**: `e48df7a4-9535-4bf0-a948-61a6a0f37a6a`
- **Last Verified Date**: `2026-11-04`
- **Canonical Layer Role**: **Layer A** (Permanent Operator & Engineering Memory) + **Layer B** (Verified Project Knowledge & Provenance). Dynamic execution state (**Layer C**) remains exclusively in `docs/engineering/RMEP-001/EXECUTION-STATE.json` and `docs/engineering/RMEP-001/PROGRESS-LOG.md`.

---

## 1. Purpose and Authority

This document is the single canonical repository-backed engineering memory for **Tehran Radar (`رادار تهران / رادار مسکن کلانشهرهای ایران`)**. Its purpose is to preserve durable operator decisions, product direction, architectural invariants, verified stack facts, and session-resumption procedures across:
- New Google AI Studio Build sessions and conversation resets.
- Context-window compactions, model transitions, and quota interruptions.
- Server restarts and future development environments.

### Important Distinction: Repository File Persistence vs. Internal Model Memory
- Saving this file in the workspace or GitHub **does not** place it into Gemini's internal model weights or guarantee automatic retrieval in every future session.
- Cross-session continuity relies on either:
  1. The platform loading `/AGENTS.md` (which references this file) into `<user_rules><RULE[AGENTS_md]>`, **followed by** the agent actively calling `view_file` on this document; or
  2. The human operator providing the **Session Initialization Contract (Section 11)** at the start of a new session.

### Authority Precedence Hierarchy
1. **Security, Privacy, Data-Integrity & Authorization**: Mandatory platform and safety constraints, zero secret/PII leakage, and explicit human authorization for `R3` / production operations.
2. **Original Authoritative Engineering Governance**: `docs/engineering/RMEP-001/MASTER-PROMPT.md` (SHA-256 pinned), `ARCHITECTURE.md`, `AGENTS.md`, `architecture-baseline.json`, and `docs/RADAR-TEHRAN-OPERATING-CHARTER.md`.
3. **Explicitly Approved Governance Amendments**: Versioned operator governance updates within their defined scope.
4. **Current Explicit Operator Decisions (`OPERATOR_CONFIRMED`)**: Govern new requirements and supersede conflicting earlier heuristics (see Section 3 & Section 9).
5. **Persistent Engineering Memory (This Document)**: Records established operator decisions and verified technical facts (`Layer A` & `Layer B`).
6. **Historical AI-Generated Reports (`HISTORICALLY_REPORTED`)**: Historical evidence only (`FINAL-ENGINEERING-REPORT.md`, `PROGRESS-LOG.md`), never automatic truth without repository verification.

---

## 2. Memory Version & Layer Architecture

- **Memory Version**: `4.0`
- **Three-Layer Separation**:
  - **Layer A — Permanent Operator & Engineering Memory** (Sections 3–5 of this file): Durable operator decisions, product vision, UX principles, infrastructure strategy, and communication rules.
  - **Layer B — Verified Project Knowledge & Provenance** (Sections 6–9 of this file): Repository-verified stack versions, architectural boundaries, external dependencies, and supersession log.
  - **Layer C — Execution Continuity** (External to this file): Dynamic task progress, completed operations (`OP-001..OP-187`, `CHK-187-FINAL`), and test evidence stored in `docs/engineering/RMEP-001/EXECUTION-STATE.json`, `docs/engineering/RMEP-001/PROGRESS-LOG.md`, and `docs/AUTONOMOUS-ENGINEERING-PROGRESS.md`.

---

## 3. Permanent Operator Decisions (`LAYER A`)

All decisions in this section carry provenance classification **`OPERATOR_CONFIRMED`** (confirmed by the operator on `2026-11-02` under RMEP-001 Golden Persistent Engineering Memory System v4.0):

| Decision ID | Category | Operator Decision Summary | Provenance | Status |
|---|---|---|---|---|
| `OP-DEC-001` | **Product Vision** | Tehran Radar is intended to evolve into a globally extensible real-estate platform. Long-term objectives (roadmap direction, not yet implemented) include automatic language detection, manual language selection, country-specific services, gradual international expansion, and international-ready infrastructure. | `OPERATOR_CONFIRMED` | Active (`Long-Term Direction`) |
| `OP-DEC-002` | **Product Experience (UI/UX)** | Prioritize simplicity, immediate user comprehension, intuitive navigation, fast interaction, low cognitive burden, reliable mobile/desktop responsiveness, accessibility, and a welcoming first-time visitor experience. Visual identity uses a clean light default aesthetic with both light and dark theme support. | `OPERATOR_CONFIRMED` | Active |
| `OP-DEC-003` | **Infrastructure Strategy** | Long-term direction: use Cloudflare services where technically beneficial while preserving full portability to conventional Node.js VPS / container environments, avoiding unnecessary provider lock-in, and supporting future Android and iOS clients via shared backend services. | `OPERATOR_CONFIRMED` | Active (`Long-Term Direction`) |
| `OP-DEC-004` | **Engineering Principles** | 1. Product functionality takes priority over artificial engineering metrics.<br>2. **Arbitrary universal source-code line-count reduction must not continue** (supersedes `OP-018..OP-054` ratcheting).<br>3. Completed operations must not be repeated without new reproducible evidence.<br>4. Proceed one bounded work package at a time.<br>5. Preserve existing working functionality.<br>6. Tests must verify real application behavior.<br>7. Distinguish code implementation from operational verification.<br>8. Production deployment and paid-service activation require explicit human authorization.<br>9. Keep reports concise and evidence-based. | `OPERATOR_CONFIRMED` | Active (`Supersedes Universal Line-Compaction`) |
| `OP-DEC-005` | **Operator Communication Preferences** | 1. Communicate in **Persian (`فارسی`)**.<br>2. Explain technical issues in clear, accessible language without assuming professional programming background.<br>3. Prefer actionable recommendations over jargon.<br>4. Keep routine engineering reports concise.<br>5. Clearly highlight any action requiring human authorization. | `OPERATOR_CONFIRMED` | Active |

---

## 4. Product Direction (`LAYER A`)

1. **Current Core Domain (`REPOSITORY_VERIFIED`)**:
   - Multi-city Iranian geospatial real-estate intelligence, hedonic property valuation, buy vs. rent/rahn neighborhood comparison, air quality (AQI) & traffic/metro scoring, resident reviews, bargain discovery, buyer price alerts, and agency sponsorship CRM across Tehran and Iranian metropolitan provinces.
2. **Future International & Multi-Platform Expansion (`OPERATOR_CONFIRMED` — Planned, Not Yet Implemented)**:
   - Automatic & manual multi-language support (i18n/RTL/LTR switching).
   - Country-specific real-estate valuation, currency, and legal/commission rulesets.
   - Shared API contracts ready for future native Android and iOS applications alongside the web PWA.

---

## 5. Engineering Governance & Conflict Supersession Log (`LAYER A`)

### Active Governance Rules
- **Master Prompt Integrity**: `docs/engineering/RMEP-001/MASTER-PROMPT.md` must never be altered (`PINNED_MASTER_PROMPT_SHA256 = 4be39b67c381536d5c363b9fa5c026d61dd00fae5964cedfd5df168d3f6abc63`).
- **Architectural Boundaries (`ARCHITECTURE.md` & `AGENTS.md`)**:
  - Unidirectional dependency flow: `src/App.tsx` / `server.ts` → `src/components/*` → `src/data/*` → `src/utils/*` → `src/types/*`.
  - Standard source files under `src/**/*.{ts,tsx}` and `server.ts` must remain under the **500-line ceiling** (`maxLinesNewFile: 500` in `architecture-baseline.json`).
- **Human Authorization Gate**: Production deployments (`firebase deploy`, Cloud Run / Cloudflare production promotion), destructive database operations, billing/paid-service activation, and git remote pushes require explicit operator approval.

### Decision Conflict & Supersession Register (Section 9 Compliance)

| Conflict / Update ID | Previous Decision / Practice | New Authoritative Decision | Source of Authority | Date | Reason | Status |
|---|---|---|---|---|---|---|
| `SUP-001` | Universal repository-wide source-code line-count ratcheting (`OP-018` through `OP-054` ratcheting all 231 non-dataset files from `<=485` down to `<=299` lines). | **Stop arbitrary universal source-code line-count reduction.** Keep the standard `< 500` line ceiling (`ARCHITECTURE.md`), and prioritize real product functionality and readability over artificial line-count compaction. | Explicit Operator Decision (`RMEP-001 Golden Persistent Memory v4.0, Section 6 & 11`) | `2026-11-02` | Repeated mechanical line compaction consumes engineering turns without improving user-facing product quality and harms code readability. | `SUPERSEDED` (`OP-DEC-004` governs) |

---

## 6. Verified Project Architecture & Tech Stack (`LAYER B`)

Every technical fact below was re-inspected directly against the workspace files on `2026-11-02`:

| Component / Fact | Verified Detail | Source File(s) | Verification Date | Verification Method | Classification |
|---|---|---|---|---|---|
| **Frontend Framework** | `react` `^19.0.1`, `react-dom` `^19.0.1`, `typescript` `^7.0.2` | `package.json` | `2026-11-02` | `view_file` on `/package.json` | `REPOSITORY_VERIFIED` |
| **Build Tooling** | `vite` `^8.3.0`, `@vitejs/plugin-react` `^6.1.1`, `tsx` `^4.21.0` | `package.json`, `vite.config.ts` | `2026-11-02` | `view_file` on `/package.json` | `REPOSITORY_VERIFIED` |
| **Styling System** | `tailwindcss` `^4.3.3`, `@tailwindcss/vite` `^4.3.3`, Vazirmatn Persian font (`index.html`), light/dark CSS variables (`src/index.css`) | `package.json`, `index.html`, `src/index.css` | `2026-11-02` | `view_file` on `/package.json` & `/index.html` | `REPOSITORY_VERIFIED` |
| **Backend Runtime** | Node.js `>=22.0.0` (`v22.23.3` in container) + `express` `^4.21.2` (`server.ts` serving `/api/*` and Vite middleware/static SPA) | `package.json`, `server.ts` | `2026-11-02` | `view_file` on `/package.json` & `/server.ts` | `REPOSITORY_VERIFIED` |
| **Database & Auth** | `firebase` `^13.1.0` (Client SDK), `firebase-admin` `^14.5.0` (Server SDK), Firestore DB `ai-studio-e48df7a4-9535-4bf0-a948-61a6a0f37a6a` in project `gen-lang-client-0713157837` | `package.json`, `firebase-applet-config.json`, `firestore.rules` | `2026-11-02` | `view_file` on `/package.json` & `/firebase-applet-config.json` | `REPOSITORY_VERIFIED` |
| **Firestore Collections (9)** | `/admins`, `/votes`, `/bargains`, `/bargainOwners`, `/neighborhoodOverrides` (public sponsor on `neighborhoodOverrides.sponsor`), `/sponsorRequests`, `/buyerAlerts`, `/appConfig`, `/userPreferences` | `firestore.rules`, `firebase-blueprint.json` | `2026-11-06` | `view_file` of `firestore.rules` and `firebase-blueprint.json` | `REPOSITORY_VERIFIED` |
| **Geospatial & Map Engine** | Leaflet `1.9.4` loaded via CDN with SHA-384 SRI in `index.html`; tile controller (`src/components/mapBaseTileController.ts`) supporting Neshan raster tiles and OpenStreetMap fallback | `index.html`, `src/components/mapBaseTileController.ts` | `2026-11-02` | `view_file` on `/index.html` | `REPOSITORY_VERIFIED` |
| **Charts & Visualization** | `recharts` `^3.10.1`, `d3-scale` `^4.0.2`, `lucide-react` `^0.546.0`, `motion` `^12.23.24` | `package.json` | `2026-11-02` | `view_file` on `/package.json` | `REPOSITORY_VERIFIED` |
| **Hedonic Valuation & Persian NLP Engine** | Single source of truth in `src/data/hedonicPricingEngine.ts` (`calculateHedonicValuation`, `FAST_SALE_FACTOR = 0.88`) and `src/data/realMarketPriceAggregator.ts` (v6.4 context-guarded Persian NLP parser, bi-directional negation engine, compound Hedonic quality multiplier, IQR outlier filter, Asking-to-Deal spread, and 15-case `verifyPricingEngineIntegrity`) | `src/data/hedonicPricingEngine.ts`, `src/data/realMarketPriceAggregator.ts`, `tests/pricing-engine-integrity.test.ts` | `2026-11-04` | `view_file` & `npx tsx tests/pricing-engine-integrity.test.ts` | `REPOSITORY_VERIFIED` |
| **Hono / Cloudflare Workers Native Backend** | Architectural portability helpers and tests exist (`src/utils/cloudflareEdgeAndWorkerPortability.ts`), but the live backend runtime is Express (`server.ts`), **not** Hono or native Cloudflare Workers. | `server.ts`, `package.json` | `2026-11-02` | `view_file` on `/package.json` | `REPOSITORY_VERIFIED` (Not implemented as live runtime; future consideration only) |

---

## 7. Important Technical Constraints (`LAYER B`)

1. **Security & Sanitization Constraints (`REPOSITORY_VERIFIED`)**:
   - Dynamic strings in Leaflet `L.divIcon` and `marker.bindTooltip` must be escaped via `escapeHtmlAttr()` (`src/utils/security.ts`).
   - External Divar links must be generated exclusively via `buildExternalDivarUrl(city, mode, hoodName)` (`src/utils/security.ts`).
   - Server disk persistence (`serverMarketPulseEngine.ts`, `serverRuntimeEnvStore.ts`, `serverObjectStorage.ts`) must use debounced atomic writes (`0o600`) and must never persist `SECRET_ENV_KEYS` or buyer PII (`buyerLeads`) to `.cache-data.json` or `.runtime-config.json`.
2. **Reconciliation Status with `readAndReconcileExecutionState()` (`REPOSITORY_VERIFIED`)**:
   - `readAndReconcileExecutionState()` (`src/utils/rmepExecutionStateEngine.ts`) and `tests/architecture-guardrails.test.ts` pass with **0 discrepancies** and **0 warnings** (`src/components/AgencyModal.tsx` is at `262` lines while preserving the 1-click bargain price threshold helper button). Future tasks are governed by `OP-DEC-004` / `SUP-001` (no further universal line-count ratcheting below the standard `< 500` line ceiling in `ARCHITECTURE.md`).

---

## 8. External Dependencies (`LAYER B`)

| Dependency / Service | Purpose | Configuration / Credential Source | Current Status |
|---|---|---|---|
| **Firebase Auth & Cloud Firestore** | User authentication, admin RBAC (`bijanbijane.1@gmail.com`), real-time sync of overrides, bargains, votes, and alerts | `firebase-applet-config.json` (Client) / `FIREBASE_SERVICE_ACCOUNT_JSON` (Server Admin optional) | `REPOSITORY_VERIFIED` |
| **Leaflet CDN (`unpkg.com/leaflet@1.9.4`)** | Interactive map rendering with Subresource Integrity (SRI) | `index.html` lines 58–68 | `REPOSITORY_VERIFIED` |
| **Neshan Map Tiles & OpenStreetMap** | Base map raster tiles with automatic fallback to OSM | Runtime env `VITE_NESHAN_MAP_API_KEY` / Admin panel config | `REPOSITORY_VERIFIED` |
| **Google Fonts (`Vazirmatn`)** | Persian UI and tabular numerals typography | `index.html` lines 54–56 | `REPOSITORY_VERIFIED` |
| **Telegram Bot Webhook / Alerts** | Optional outbound notification channel for bargain/lead alerts | Server runtime env (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`) — never stored in repo | `REPOSITORY_VERIFIED` |
| **S3-Compatible Object Storage** | Optional external media storage with local `.object-storage/` fallback | Server runtime env (`S3_*`) — never stored in repo | `REPOSITORY_VERIFIED` |

---

## 9. Unresolved Technical Assumptions & Retrieval Limitations (`LAYER B`)

1. **Cross-Session Automatic Instruction Loading (`UNVERIFIED`)**:
   - In the current Google AI Studio Build session, root `/AGENTS.md` is loaded into the model system prompt under `<user_rules><RULE[AGENTS_md]>`.
   - A concise reference to `docs/engineering/RMEP-001/PERSISTENT-ENGINEERING-MEMORY.md` has been added to `/AGENTS.md`.
   - However, **whether a brand-new, separate Google AI Studio Build session automatically re-reads `/AGENTS.md` and triggers the agent to open `PERSISTENT-ENGINEERING-MEMORY.md` without a user prompt is `UNVERIFIED`** until tested in a separate session. Therefore, operators should use the **Session Initialization Contract (Section 11)** when starting new sessions.
2. **Git / GitHub Remote Synchronization in Container (`UNVERIFIED` / Environment Limitation)**:
   - Inside the AI Studio execution container (`/app/applet`), `.git` metadata is not mounted (`git status` returns `fatal: not a git repository`).
   - While `EXECUTION-STATE.json` records historical commit hashes (`f8b066f76c9053ce9b3c53fb136b9ec34fc57f7a`, `5e577f861de711ffcd77cd455ea79d41d553e0b` — `HISTORICALLY_REPORTED`), live GitHub push/sync status cannot be verified from inside the container and must be verified via the AI Studio GitHub UI by the operator.

---

## 10. References to Authoritative Project Documents

1. **Master Autonomous Engineering Prompt**: `docs/engineering/RMEP-001/MASTER-PROMPT.md` (Pinned SHA-256: `4be39b67c381536d5c363b9fa5c026d61dd00fae5964cedfd5df168d3f6abc63`)
2. **Dynamic Execution State (`Layer C`)**: `docs/engineering/RMEP-001/EXECUTION-STATE.json`
3. **Append-Only Progress Log (`Layer C`)**: `docs/engineering/RMEP-001/PROGRESS-LOG.md`
4. **Master Engineering Decisions Register**: `docs/engineering/RMEP-001/MASTER-ENGINEERING-DECISIONS.md`
5. **Final Engineering Report (`RMEP-001`)**: `docs/engineering/RMEP-001/FINAL-ENGINEERING-REPORT.md`
6. **Agent & Architecture Rules**: `/AGENTS.md`, `/ARCHITECTURE.md`, `/architecture-baseline.json`
7. **Static Operating Charter**: `docs/RADAR-TEHRAN-OPERATING-CHARTER.md`
8. **Autonomous Campaign Progress**: `docs/AUTONOMOUS-ENGINEERING-PROGRESS.md`
9. **System Architecture & Security**: `docs/system-architecture.md`, `docs/security.md`, `firestore.rules`, `firebase-blueprint.json`

---

## 11. Session Initialization Contract (Reusable Bootstrap Procedure)

 Copy and paste the following exact contract at the start of any new session or after a conversation reset:

```text
Before undertaking any nontrivial Tehran Radar engineering task:

1. Read the applicable AGENTS.md instructions.
2. Read the canonical PERSISTENT-ENGINEERING-MEMORY.md.
3. Read the latest valid RMEP-001 EXECUTION-STATE.json.
4. Read relevant recent progress and verification records.
5. Check for incomplete operations and uncommitted changes.
6. Reconcile important decisions with authoritative project rules.
7. Identify the next authorized and incomplete task.

Do not repeat completed work.

Do not resume arbitrary source-code compaction.

Do not invent remembered information.

Do not claim that an unread document has been retrieved.

Execute one authorized, bounded work package at a time.

If memory is missing, stale, inconsistent, or inaccessible, report the limitation and stop unsafe work.
```

---

## 12. Revision History

| Version | Date | Author / Authority | Summary of Changes |
|---|---|---|---|
| `4.0` | `2026-11-02` | Autonomous Principal Engineering Agent (authorized by Operator under RMEP-001 Golden Persistent Engineering Memory System v4.0) | Initial canonical installation of `docs/engineering/RMEP-001/PERSISTENT-ENGINEERING-MEMORY.md`. Recorded `OPERATOR_CONFIRMED` decisions (`OP-DEC-001..005`), superseded universal line-count compaction (`SUP-001`), verified repository stack and provenance (`REPOSITORY_VERIFIED`), separated Layer A/B memory from Layer C execution state, and established the Session Initialization Contract. |
| `4.1` | `2026-11-04` | Autonomous Principal Engineering Agent (`OP-174..OP-185` / `CHK-185-FINAL`) | Recorded verification of v6.4 Iran-Native Hedonic Pricing Engine & Persian NLP Parser (`src/data/realMarketPriceAggregator.ts`, `tests/pricing-engine-integrity.test.ts`), 3-Tab High-Trust Inspector Drawer UX (`NeighborhoodInspectorDrawer.tsx`, `NeighborhoodInspectorTabs.tsx`, `NeighborhoodBargainsAndVotesTabs.tsx`), Hedonic Modal & Fake Ad Detector NLP/unit/FX parity (`HedonicValuationModal.tsx`, `SuperModulesValuationAndFakeTabs.tsx`), v6.4 Estimated Deal Price & monthly rent equivalence across `HedonicInlineWidget.tsx`, `HedonicValuationResultsColumn.tsx`, `CompareModal.tsx`, `BuyingPowerSummaryCard.tsx`, `ExpandableComparisonTable.tsx`, `BudgetBridgeAdvisorCard.tsx`, `ShortlistMatrixModal.tsx`, `SmartPriceForecastCard.tsx`, `PortfolioModals.tsx`, `SecondaryModals.tsx`, `NeighborhoodPriceTrendModal.tsx`, `NationwideProvinceModal.tsx`, `SmartSuggestModal.tsx`, `ShareModal.tsx`, `PurchasingPowerTrendCard.tsx`, `AgencyModal.tsx`, `ExpansionModulesModal.tsx`, `FutureSuperModulesModal.tsx`, `SuperModulesSwapAndStudioTabs.tsx`, `SuperModulesLegalAndBuildingTabs.tsx`, `OnboardingWizardModal.tsx`, `BuyerAlertPwaLegalModals.tsx`, `buyerPriceThresholdAlerts.tsx`, `LegalContractAndPortfolioStudioModal.tsx`, `AgencyCrmAndAutomationStudioModal.tsx`, `BiRiskAndGeospatialIntelligenceStudioModal.tsx`, `EnterpriseAssetFundAndMarketIntelligenceModal.tsx`, `BuyerAlertPriceSparkline.tsx`, `ContractLegalAdvisorView.tsx`, `AgencySponsorReservationTab.tsx`, `CommuteHubsMatrixCard.tsx`, `NeighborhoodPriceChart.tsx`, `NeighborhoodMonthlyBarChart.tsx`, `QuickHoodRankingStrip.tsx`, `SearchDropdownMenu.tsx`, `SmartNaturalSearchMatchesSection.tsx`, `TopBarProvinceControl.tsx`, `TopBarProvinceDirectoryControl.tsx`, `priceHeatmapAndViewportLazy.tsx`, `mapZoomLodAndDeclutter.ts`, `AdminOverviewAndModerationTabs.tsx`, and `AdminMonetizationCard.tsx`, GIS debounce & Cloud Sync bounds guards (`useLeafletRadarMap.ts`, `useRadarCloudSync.ts`), and deterministic legal rule pre-scan (`serverUtilityRoutes.ts`). |
| `4.2` | `2026-11-05` | Autonomous Product Experience & Frontend Architect (`OP-186` / `CHK-186-FINAL` — Gold Master Prompt v2.0) | Delivered Map-Centric Architecture & Live Split-Map Companion Mode (`حالت کنار نقشه زنده`) across both Desktop (`1440×900` side-by-side) and Mobile (`390×844` top live map window with latitude offset `-0.022`) in `RadarWorkspaceShell.tsx`, `ProductViewRouter.tsx`, `ProductDiscoverView.tsx`, `ProductIntelligenceView.tsx`, `ProductToolsView.tsx`, `ProductHomeView.tsx`, and `ProductUserSpaceView.tsx`; wired live GIS Comparison Arc (`کمان مقایسه روی نقشه`), Map Viewport Bounding-Box Filter (`فقط کادر نقشه`), Metro/Traffic GIS overlay controls (`🚇 خطوط مترو`, `🚦 طرح ترافیک`), interactive active neighborhood switcher, and v6.4 Estimated Deal Price (`معامله v6.4`) parity across all secondary views; synchronized market segment KPI filters with the live Bubble Map Lens; eliminated desktop horizontal overflow (`1440×900`) in `ProductGlobalHeader.tsx`; streamlined mobile single-row ergonomics (`390×844`) in `FloatingTopBar.tsx`, `TopBarProvinceDirectoryControl.tsx`, and `MapLegend.tsx`; synchronized `?view=` URL query parameters and `popstate` browser navigation in `useAppUrlAndTitleSync.ts`; and verified all 9 Gold Master acceptance gates (`STABLE`). |
| `4.3` | `2026-11-05` | Autonomous Principal Software Architect (`OP-187` / `CHK-187-FINAL` — Gold Edition 6.0) | Executed Gold Edition 6.0 Backend Security, Data Integrity & Contract Hardening across `serverPublisherBargains.ts` (strict `isValidFirestoreDocId` & `10_000_000` Million Toman upper bound, `PATCH` `displayAreaText`/`priceText`/`priceIntlText` synchronization, and GDPR export/deletion cascade for buyer leads, data corrections, and media objects), idempotent `WeakSet<Express>` route mounting guards (`serverSponsorAndBargainRoutes.ts`, `serverBackupAndChunkUploadRoutes.ts`, `osmTileProxy.ts`), sponsor idempotency TTL pruning, canonical 6-rule legal engine delegation (`serverAdminAndTelegramSecurity.ts`), Persian/Arabic digit normalization in upstream Divar widget validation (`freeLiveMarketScraper.ts`), IPv6 and IPv4-mapped IPv6 (`[::1]`, `[::ffff:127.0.0.1]`) SSRF protection (`listingLifecycleAndPlatformSecurity.ts`, `objectStorageUpload.ts`), `authorization`/`cookie` stripping and case-insensitive CORS origin validation (`apiContractsAndSerializationEngine.ts`), oldest-first deletion journal recovery (`deletionJournal.ts`), isolated graceful shutdown cleanup hooks (`serverIdempotencyAndConcurrency.ts`), concurrent orphan delete locking and `.lock` cleanup (`serverObjectStorageOrphanAudit.ts`), and `.tmp-`/`.tmp.` cleanup (`serverObjectStorageHelpers.ts`). |
| `4.4` | `2026-11-05` | Autonomous Principal Software Architect (`OP-188` / `CHK-188-FINAL` — Gold Edition 6.0 Batch 2) | Hardened `isSafeHttpsStorageUrl` in `src/utils/serverRuntimeEnvStore.ts` against IPv6 literals, raw IPv4 literals, credentialed URLs, single-label hosts, and `.local`/`.internal`/`.localhost` domains across both live admin updates and disk hydration (`ensureDiskOverridesLoaded`); sanitized hydrated `serverAuditLogs` entries in `loadDiskPersistedCache` and enforced `^https?:\/\/` URI scheme validation on Gemini grounding chunks in `src/utils/serverMarketPulseEngine.ts`; wired `recordAbuseSignal(getClientIp(req), 'auth_failure')` across `/api/admin/rmep-status`, `/api/admin/architecture-and-ai-registry`, `/api/admin/ai-routing`, and `/api/admin/ai-routing/rollback` in `src/utils/serverAiAndCommerceRoutes.ts`; and enforced rate limiting on `GET /api/telegram-digest` (`DIGEST_RATE_LIMIT`) plus `recordAbuseSignal` on unauthorized `/api/send-telegram` and `/api/admin/buyer-alerts` requests in `src/utils/serverUtilityRoutes.ts`. |
| `4.5` | `2026-11-05` | Autonomous Principal Software Architect (`OP-189` / `CHK-189-FINAL` — Gold Edition 6.0 Batch 3) | Hardened `server.ts` (`redactLogEvent` API key and Persian/Arabic phone redaction in `GET /api/system-health` + `recordAbuseSignal` on unauthorized `GET /api/market-pulse?refresh=1`); moved `verifyAdminApiAuthorization` before `bargainCleanupInProgress` lock acquisition in `POST /api/object-storage/cleanup-bargain/:bargainId` to prevent unauthenticated `409 CLEANUP_ALREADY_RUNNING` lock-contention DoS and wired `recordAbuseSignal(getClientIp(req), 'auth_failure')` across all 6 admin object-storage routes in `src/utils/serverObjectStorage.ts`; added atomic rollback (`objectStoreIndex.splice` + `fs.promises.unlink(localFilePath)`) on `POST /api/object-storage/upload-complete` disk/index persistence failure and `recordAbuseSignal` across admin circuit-breaker/backup routes in `src/utils/serverBackupAndChunkUploadRoutes.ts`; wired `recordAbuseSignal` across sponsor/bargain admin and financial validation routes in `src/utils/serverSponsorAndBargainRoutes.ts`; enforced strict `parsed.timestampIso !== undefined` type validation in `verifyX402PaymentHeaders` and fixed falsy `0` coercion for brand-new buildings (`buildingAge: 0` -> `1405`) and ground-floor units (`floor: 0`) plus `floor <= totalFloors` clamping in `executeAuthorizedMcpTool` (`src/utils/dataCommerceMcpAndMonetization.ts`); and added `.tmp-*` cleanup on failure in `writeExecutionStateAtomically` (`src/utils/rmepExecutionStateEngine.ts`). |
| `4.6` | `2026-11-05` | Autonomous Principal Software Architect (`OP-190` / `CHK-190-FINAL` — Gold Edition 6.0 Batch 4) | Hardened `isPrivateOrReservedIpLiteral` (out-of-range IPv4 octets `> 255`, TEST-NET-1/2/3 `192.0.0.0/24`, `192.0.2.0/24`, `198.51.100.0/24`, `203.0.113.0/24`, and full IPv6 ULA/link-local ranges `fc00::/7` & `fe80::/10`) and `FIRESTORE_DATABASE_ID_DRIFT` detection in `src/utils/serverConfigValidator.ts`; prevented public caching of `/api/market-pulse?refresh=1` and included `x-payment-context`/`x-payment-signature` in `hasAuthenticationHeaders` in `src/utils/serverDeliveryAndAbuseGuard.ts`; recursively scrubbed nested objects inside arrays and up to depth 8 in `scrubSecretsFromBackupObject` and enforced finite temperature (`-90..70`) and US AQI (`0..1000`) bounds in `validateExternalApiResponseSchema` in `src/utils/serverAdminSodAndBackupSecurity.ts`; redacted `sk-`/`ghp_` tokens, Persian/Arabic mobile numbers (`۰۹...`/`٠٩...`), and nested objects inside arrays in `src/utils/serverForensicsAndIncidentResponse.ts`; added ZWNJ-insensitive neighborhood keyword matching (`سعادت آباد`, `جنت آباد`) and `میلیارد` (Billion Toman) budget parsing in `parseNaturalPersianHousingQuery` (`src/utils/aiModelRegistryAndGateway.ts`); and resolved canonical SEO URLs from the matched neighborhood's actual city in `injectDynamicSeoMeta` (`src/utils/serverSeoAndSitemap.ts`). |
| `4.7` | `2026-11-05` | Autonomous Principal Software Architect (`OP-191` / `CHK-191-FINAL` — Gold Edition 6.0 Batch 5) | Enforced `Number.isSafeInteger` byte-range checks in `PortableMemoryStorageAdapter.getObject`, `contentType` parity checks in `migrateAndVerifyStorageObjects`, and non-empty `VITE_` secret detection in `auditRuntimeEnvironmentAndSecurityPosture` (`src/utils/serverStoragePortabilityAndTracing.ts`); blocked single-label/`.localhost` hostnames and query/hash fragments in `validateObjectStorageEndpoint` and enforced `detectMediaFormatByMagicBytes` binary verification in `validateObjectStoragePayload` (`src/utils/objectStorageUpload.ts`); sanitized `ETag`/`Last-Modified`/`Cache-Control` headers, prevented `private`/`no-store` passthrough, and pruned expired tiles before FIFO eviction (`src/utils/osmTileProxy.ts`); guarded `clampLatLngRing` against `maxPoints <= 0` or `NaN` (`src/utils/serverBoundaryProtocol.ts`); scaled cumulative legal trap `riskScore` (`src/utils/serverLegalRuleEngine.ts`); normalized zero-width characters and Arabic Yeh/Kaf in `detectPromptInjection` (`src/utils/security.ts`); and rejected percent-encoded control characters in `validateSafeReturnPath` (`src/utils/domainSecurityValidators.ts`). |
| `4.8` | `2026-11-05` | Autonomous Principal Software Architect (`OP-192` / `CHK-192-FINAL` — Gold Edition 6.0 Batch 6) | Enforced 90-day buyer lead retention pruning (`expiresAtIso <= now`) before returning admin leads or checking duplicates and preserved `riskScore` in Gemini AI contract checks (`src/utils/serverUtilityRoutes.ts`); skipped `schemaVersion > 2` records and stripped prototype-pollution keys in `runSecurityPreservingSchemaMigration` (`src/utils/serverSponsorAndBargainRoutes.ts`); deduplicated `attachedMediaIds` in `buildCascadeDeletionPlan` and validated allowed MIME types at `POST /api/object-storage/upload-init` (`src/utils/serverBackupAndChunkUploadRoutes.ts`); deduplicated candidate object IDs in `cleanupBargainObjects` (`src/utils/serverObjectStorageCleanup.ts`); validated `SAFE_OBJECT_ID` in `deleteStoredObjectSafely` and trimmed/coerced safe integers in `parseBoundedQueryInteger` (`src/utils/serverObjectStorageOrphanAudit.ts`); required `Number.isSafeInteger(record.sizeBytes)` and case-insensitive extension checks in `isSafeStoredObjectRecord` (`src/utils/serverObjectStorageHelpers.ts`); aligned `listRecoverable` limit fallbacks (`limit < 1` -> `50`) and cleared stale leases (`leaseOwner`, `leaseExpiresAt`, `nextAttemptAt`) on terminal journal transitions (`src/utils/serverJournalAdapters.ts`, `src/utils/deletionJournal.ts`); and normalized retryable error codes/statuses plus cleared `remoteS3Synced` on completed deletion (`src/utils/objectStorageDeleteCoordinator.ts`). |
| `4.9` | `2026-11-06` | Backend completion mission (no commit) | Confirmed and fixed: 3-month sponsor total is 80% (`calculateCanonicalSponsorPricing` no longer overwrites it); public bargain overlay requires `status === 'approved'`; sponsor and buyer-alert success only after the durable write; guest votes no longer mutate shared neighborhood scores; `enableSponsorBilling` missing value stays false; neighborhood/bargain/vote listeners use a 999 hood cap with `orderBy('hoodId')`; votes composite index `userId+hoodId`; App Check is consulted on sponsor reserve and buyer alerts and remains disabled unless `FIREBASE_APP_CHECK_MODE` is `monitor` or `enforced`; weather icons apply only to verified Open-Meteo readings; `hourlyChangePercent` is no longer a seed-versus-sync delta. `EXECUTION-STATE.json` checkpoint id stays `CHK-192-FINAL` because architecture tests pin it. Buyer-lead memory cache and Firestore `buyerAlerts` are still two stores. |
| `4.10` | `2026-11-06` | Backend continuation (no commit, no deploy) | `POST /api/buyer-alerts` and `GET /api/admin/buyer-alerts` now succeed only after a Firestore `buyerAlerts` read or write (`503 BUYER_ALERT_PERSIST_FAILED` otherwise). `serverSideBuyerLeads` is updated only by `cacheBuyerAlertAfterDurableCommit(true, …)` and is not the customer record. Account export/delete in `serverPublisherBargains.ts` still reads that memory cache; replacing it with a live Firestore backfill needs `FIREBASE_SERVICE_ACCOUNT_JSON` (or the emulator) and was not run. Cloud listener health is per listener: a later snapshot of the same listener, or an `online` reconnect that resubscribes, clears that listener's failure; another listener's snapshot does not mark a dead listener live. The votes `userId+hoodId` index remains in `firestore.indexes.json` only and was not deployed. Checkpoint id stays `CHK-192-FINAL`. |
