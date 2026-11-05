# Radar Tehran — Master Product Discovery and Assessment Roadmap
## Document Version: 1.0.0 (Phase 0 Planning — Workstream PLAN-001)
## Authoritative Alignment: Version 22 Master Charter + Version 32 Execution Governance

---

## 1. Executive Charter & Objective

The primary objective of **PLAN-001** is to establish an evidence-based, comprehensive discovery baseline and assessment architecture for **Radar Tehran** (`رادار مسکن کلانشهرهای ایران`), bridging the gap between technical code-level verification and holistic real-world product quality.

While the previous engineering campaign (`CAMPAIGN-V32-001`) successfully resolved five targeted engineering defect workstreams (`WS-001` through `WS-005`) and established technical compliance across 30 engineering audit domains, technical verification alone does not guarantee end-to-end product excellence, market differentiation, intuitive ergonomics, or friction-free user journeys.

This document establishes:
1. An exhaustive, grounded inventory of the actual application as it exists in code.
2. A 20-domain Master Product Assessment Matrix cross-referenced with the 30 engineering audit domains.
3. Realistic user journey maps across three distinct personas (First-time visitor, Returning power user, Mobile user).
4. An evidence and measurement framework distinguishing code inspection from live production reality.
5. A finite, dependency-aware assessment and evaluation roadmap.

---

## 2. Actual Product & Subsystem Inventory

Based on direct source-tree inspection, the following components, routes, calculations, and storage structures constitute the actual, running Radar Tehran application.

### 2.1. Core Application Topology & Entrypoints
- **Entrypoints**:
  - Web Client: `/index.html` → `/src/main.tsx` → `/src/App.tsx`
  - Backend Server: `/server.ts` (Express server running on port `3000` with Vite middleware in development mode and static asset serving in production).
- **Global Layout & Navigation**:
  - **Header (`FloatingTopBar.tsx`)**: Global brand logo, nationwide province/city switcher (`NationwideProvinceModal`), live search input with keyboard navigation (`SearchDropdownMenu.tsx`), view mode switch (Rent vs Buy), area unit toggle (sqm vs metric/imperial), dark/light theme switch, and access triggers for primary tools (Pulse, Compare, Share, Admin).
  - **Interactive GIS Map (`useLeafletRadarMap.ts`)**: Fullscreen Leaflet GIS canvas supporting 4 visual layers (Affordability Budget lens, Price Bubble lens, Air Quality/Pollution lens, Traffic/Transit lens), tile provider failover (OSM, Carto Dark, Carto Light, Neshan tile proxy via `/api/osm-tile/:z/:x/:y`), and dynamic level-of-detail (LOD) marker rendering (`mapMarkerLodController.ts`, `mapZoomLodAndDeclutter.ts`).
  - **Quick Ranking Strip (`QuickHoodRankingStrip.tsx`)**: Horizontal sticky/scrolling strip rendering top-ranked neighborhoods, budget-fit badges, and direct coordinate navigation (`flyTo`).
  - **Neighborhood Inspector Drawer (`NeighborhoodInspectorDrawer.tsx`)**: Bottom/side slide-over sheet containing above-the-fold tabs (`anatomyTabsRef`: Price Chart & History, Neighborhood Anatomy, Resident Sentiment & Community Reviews), secondary analytical cards (Commute Hub Matrix, Buying Power Trend, Budget Bridge Advisor, Smart Price Forecast), and photo gallery.
  - **Mobile Bottom Navigation (`RadarBottomNav.tsx`)**: 6-action bottom bar on mobile viewports for quick switching between Map, Budget Filters, Smart Suggestions, Cross-Neighborhood Comparison, and Tools Drawer.

### 2.2. User-Facing Feature Modules & Studios (Modals & Drawers)
All feature modals are lazy-loaded through `/src/components/AppModalsPortal.tsx`:
1. **Onboarding Wizard (`OnboardingWizardModal.tsx`)**: 4-step wizard for first-time buyers/renters (Mode selection, budget calibration with age multiplier, work hub proximity, and recommended neighborhood matching).
2. **Smart Neighborhood Recommender (`SmartSuggestModal.tsx`)**: Multi-criteria matching engine sorting neighborhoods by affordability, proximity, green space, amenities, and transit.
3. **Cross-Neighborhood Comparison Studio (`CompareModal.tsx`)**: Side-by-side comparison matrix for two neighborhoods (price per sqm, rent/rahn ratio, safety index, green space, building density, and commute hubs).
4. **Favorites Shortlist & Matrix (`ShortlistMatrixModal.tsx`)**: Consolidated watchlist of saved favorite neighborhoods with real-time budget comparison.
5. **Real Estate Agency & Sponsor Studio (`AgencyModal.tsx`, `AgencySponsorReservationTab.tsx`)**:
   - Tab 1: Under-market bargain submission (`handleSubmitBargainListing`) with real-time discount badge preview and media upload (`ListingMediaStorageUploader.tsx`).
   - Tab 2: Neighborhood exclusive agency sponsorship reservation (`handleReserveSponsor`) with contact validation.
6. **Hedonic Valuation Studio (`HedonicValuationModal.tsx`, `HedonicValuationResultsColumn.tsx`)**: Professional property appraisal engine with fine-grained parameter sliders (construction age, floor level, parking, elevator, storage, master bedroom, deed type, smart lighting, view/exposure) calculating benchmark value and confidence range.
7. **Personal Portfolio & Visited Homes Notebook (`PortfolioModals.tsx`)**:
   - Sub-modal 1: Visited Homes Notebook (saved property inspection notes, ratings, asking prices, and neighborhood attribution).
   - Sub-modal 2: Trade-Up & Asset Swap Advisor (assesses upgrading from current home to target neighborhood utilizing equity, loans, and rental bridge).
8. **PropTech Super Modules Hub (`FutureSuperModulesModal.tsx`)**:
   - 10 specialized calculation tabs: (1) Detailed valuation & gold/FX benchmarking, (2) Fake listing & fraud detector, (3) Mortgage loan repayment schedules, (4) 1405 property & inheritance tax calculator, (5) Tenant legal rights & dispute advisor, (6) Municipal zoning & density rules, (7) Suburb swap & migration advisor, (8) Property physical visit checklist, (9) School & traffic zone radar, (10) Realtor marketing studio.
9. **Expansion Legal & Telegram Studio (`ExpansionModulesModal.tsx`)**:
   - Official notary & real estate commission calculator.
   - Smart contract legal clause inspector (`ContractLegalAdvisorView.tsx`).
   - Automated Telegram channel post generator & bot publisher.
10. **Secondary System Modals (`SecondaryModals.tsx`, `BuyerAlertPwaLegalModals.tsx`)**:
    - Live Market Pulse & Air Quality modal (`showPulseModal`).
    - SEO Popular Comparisons drawer (`showSeoDrawer`).
    - Buyer Alert & Price Threshold subscription modal (`showBuyerAlertModal`).
    - PWA Offline Installation guide (`showPwaModal`).
    - Legal disclaimer & methodology disclosure modal (`showLegalModal`).

### 2.3. Administrative & Operational Governance Subsystems
Mounted within `AdminModal.tsx` and protected by server/client multi-layer authorization:
1. **Admin Login & Auth (`handleAdminLogin`, Firebase Auth / Google Sign-In)**: Verified email and delegated admin document check (`/admins/{uid}`).
2. **Sponsor Moderation Tab (`AdminOverviewAndModerationTabs.tsx`)**: Review, approve, extend, or reject agency sponsorship requests; syncs directly to Firestore `/neighborhoodOverrides`.
3. **Bargain Moderation Tab**: Review and delete user-submitted bargains; manages media attachment lifecycle.
4. **Buyer Leads Management**: Real-time inspection and sanitized CSV export of registered buyer alert leads.
5. **Quick Pricing Override**: Inline per-square-meter buy and rahn price overrides saved to Firestore and reflected on client GIS maps.
6. **Server Environment & Runtime Config Panel (`AdminEnvConfigPanel.tsx`)**: Live inspection and dynamic update of non-secret server runtime configuration.
7. **Map Provider & Failover Panel (`AdminMapProviderConfigPanel.tsx`)**: Manual toggle between OSM, Carto, and Neshan tile providers with circuit-breaker reset.
8. **System Health & Diagnostic Monitor (`fetchSystemHealth`)**: Server uptime, RSS memory consumption, cache hit rates, external API status, rate-limit statistics, and sanitized audit logs.
9. **Full Backup & Restore (`AdminSecurityAndBackupTabs.tsx`)**: Atomic JSON export and import of all client state and settings.

### 2.4. Backend Architecture & Server API Routes
Defined in `server.ts` and modular route handlers under `src/utils/`:
- **Core Market & Health APIs**:
  - `GET /api/market-pulse`: City-specific aggregated market statistics with Redis/memory caching and rate-limiting.
  - `POST /api/sync-real-prices` & `POST /api/market-pulse/deep-sync`: Administrative deep market price scraping/syncing.
  - `GET /api/air-quality`: Real-time multi-station air quality index from Open-Meteo with seed fallbacks.
  - `GET /api/system-health`: System diagnostics, memory metrics, rate-limit telemetry, and audit log.
- **Sponsor & Bargain APIs (`serverSponsorAndBargainRoutes.ts`)**:
  - `GET /api/buyer-alerts`: Retrieves active buyer alert records with city filtering.
  - `GET /api/sponsors/list`: Lists active neighborhood sponsors.
  - `POST /api/sponsors/release`: Releases expired or revoked sponsorship overrides (`{ sponsor: null }`).
- **Object Storage & Media Upload APIs (`serverObjectStorage.ts`)**:
  - `POST /api/object-storage/upload`: Authenticated file upload with magic-bytes sniffing, WebP normalization (800px), owner binding, and storage quota enforcement (300 objects / 2GB global quota).
  - `GET /api/object-storage/media/:objectId`: Public asset delivery with `X-Content-Type-Options: nosniff` and caching headers.
  - `GET /api/object-storage/media/:objectId/stream`: RFC-7233 compliant byte-range streaming for video/audio.
  - `DELETE /api/object-storage/media/:objectId`: Owner/admin deletion with two-phase deletion journal (`serverJournalAdapters.ts`).
- **Utility & Integration APIs (`serverUtilityRoutes.ts`)**:
  - `POST /api/send-telegram`: Server-side Telegram Bot API proxy with strict payload sanitization (bot tokens never exposed to client).
  - `POST /api/contract-check`: AI-assisted legal contract analysis via Google Gemini API (`@google/genai`) with deterministic offline fallback.
  - `GET /api/osm-tile/:z/:x/:y`: Server-side OpenStreetMap tile caching proxy.
  - `GET /api/neighborhood-boundaries/resolve`: Geospatial boundary resolution engine (`serverBoundaryProtocol.ts`).
- **SEO & Discoverability APIs (`serverSeoAndSitemap.ts`)**:
  - `GET /sitemap.xml`: Canonical XML sitemap with all multi-city neighborhood deep links.
  - `GET /robots.txt`: Search crawler directives.
  - SSR Dynamic Meta Injection: `injectDynamicSeoMeta` injects title, description, and OpenGraph tags into `index.html` on initial page load.

### 2.5. Domain Engines & Calculation Logic
- **Canonical Hedonic Engine (`src/data/hedonicPricingEngine.ts`)**: Single source of truth for residential property valuation across all Iranian metropolitan areas; applies non-linear age depreciation, floor elevation adjustments, and fast-sale discount factor (`FAST_SALE_FACTOR = 0.88`).
- **Multi-City Geospatial Dataset (`src/data/multiCityData.ts`)**: Complete dataset covering Tehran (Zones 1–22), Karaj, Mashhad, Isfahan, Shiraz, Tabriz, Ahvaz, Qom, and Rasht with localized landmarks, metro stations, and price medians.
- **Legal & Tax Calculations (`src/data/legalAndBuildingLogic.ts`)**: Article 54/131 rental income tax formula, 1405 inheritance tax rates, official notary commission brackets, and building charge allocation models.
- **Listing Fraud Detection Engine (`src/data/listingFraudAndAddressEngine.ts`)**: Heuristic fraud detection scoring suspiciously cheap listings, contradictory square-meter claims, and phone number repetition.

### 2.6. Database & Persistence Layer
- **Cloud Firestore**:
  - Collections: `/votes` (neighborhood resident feedback), `/bargains` (moderated under-market properties), `/bargainOwners` (private ownership records), `/buyerAlerts` (buyer budget matching alerts), `/sponsorRequests` (agency sponsorship submissions), `/neighborhoodOverrides` (active real-time price & sponsor overrides), `/appConfig` (feature flags), `/userPreferences` (user bookmark sync), `/admins` (delegated admin roles).
  - Security Rules (`firestore.rules`): Strict schema validation, owner-only mutation, admin escalation blocks, and rate-limiting.
- **Local Client Storage (`localStorage`)**:
  - Client bookmarks, favorite neighborhoods, visited homes notebook, onboarding completion flag, and dark/light UI theme preference.
- **Server Disk Storage**:
  - Atomic, debounced JSON files (`.cache-data.json`, `.runtime-config.json`, `.object-storage-bucket/index.json`) written with strict `0o600` permissions.

---

## 3. Comprehensive 20-Domain Assessment Framework

This framework expands upon the original 30 engineering audit domains to encompass end-to-end product value, user experience, and market fit.

| # | Master Product Assessment Domain | Scope & Focus Areas | Cross-Reference to Eng. Domains (1–30) | Verification Nature |
|---|---|---|---|---|
| **A** | **Product Functionality & Feature Completeness** | Verification that every advertised button, slider, and calculation produces a complete, meaningful output without dead ends or stubbed modals. | Eng Domains 3, 5, 8, 9, 10 | `SOURCE_REVIEWED` + `INTERACTION_VERIFIED` |
| **B** | **Frontend Architecture & Maintainability** | Component decomposition, custom hook boundaries, 500-line ceilings, bundle splitting, React 19 concurrent safety. | Eng Domains 1, 3, 21, 28 | `SOURCE_REVIEWED` + `BUILD_VERIFIED` |
| **C** | **Backend Architecture & Server Reliability** | Express routing, graceful shutdown, exception traps, memory footprint, request timeouts, and keepalive configuration. | Eng Domains 1, 10, 15, 22 | `SOURCE_REVIEWED` + `TEST_EXECUTED` |
| **D** | **Database Architecture & Data Integrity** | Firestore document structure, index optimization, atomic batch writes, schema evolution, and backward compatibility. | Eng Domains 12, 13 | `SOURCE_REVIEWED` + `TEST_EXECUTED` |
| **E** | **Business Logic & Calculation Correctness** | Mathematical validation of Hedonic pricing, rent-to-rahn conversions (30:1 ratio), 1405 tax brackets, and official commission rates. | Eng Domains 3, 26, 27 | `SOURCE_REVIEWED` + `TEST_EXECUTED` |
| **F** | **API Integrations & External Dependencies** | Resiliency and graceful fallback when Open-Meteo, Neshan, OpenStreetMap, Telegram Bot API, or Google Gemini are offline/throttled. | Eng Domains 8, 16, 17 | `SOURCE_REVIEWED` + `TEST_EXECUTED` (Fallbacks) |
| **G** | **Authentication, Authorization & Security** | Firebase Auth lifecycle, delegated admin permissions, CSRF, XSS escaping in Leaflet tooltips, rate-limiting, and SSRF prevention. | Eng Domains 11, 13, 19 | `SOURCE_REVIEWED` + `TEST_EXECUTED` |
| **H** | **Data Privacy & Storage Security** | PII protection (phone numbers, user full names), object storage quotas, magic-bytes MIME sniffing, and deletion journal CAS. | Eng Domains 14, 20 | `SOURCE_REVIEWED` + `TEST_EXECUTED` |
| **I** | **Performance & Loading Behavior** | First Contentful Paint (FCP), Time to Interactive (TTI), dynamic modal code-splitting, map marker LOD culling, and client memory usage. | Eng Domains 8, 21, 22 | `BUILD_VERIFIED` + `PREVIEW_OBSERVED` |
| **J** | **Reliability & Error Recovery** | `DualLayerErrorTrap`, `FeatureErrorBoundary`, offline service worker caching, network reconnect synchronization. | Eng Domains 17, 22 | `SOURCE_REVIEWED` + `TEST_EXECUTED` |
| **K** | **UI Consistency & Visual Design** | Typography scale (Vazirmatn), Apple-style frosted vibrancy, Tailwind styling discipline, dark/light contrast ratios, zero-pill design. | Eng Domains 5, 6 | `SOURCE_REVIEWED` + `PREVIEW_OBSERVED` |
| **L** | **UX & Information Architecture** | Drawer layout hierarchy, above-the-fold tab accessibility, logical modal groupings, and clear feedback loops on actions. | Eng Domains 4, 5, 30 | `SOURCE_REVIEWED` + `PREVIEW_OBSERVED` |
| **M** | **First-Time User Experience & Onboarding** | New user welcome tour, intuitive defaults, immediate visual payoff on the map, and self-explanatory budget controls. | Eng Domains 30 | `SOURCE_REVIEWED` + `PREVIEW_OBSERVED` |
| **N** | **Navigation & Feature Discoverability** | Ability of users to discover hidden tools (Trade-Up advisor, Commission calculator, Super Modules) without feeling overwhelmed. | Eng Domains 4, 30 | `SOURCE_REVIEWED` + `HUMAN_EVALUATED` |
| **O** | **Mobile Responsiveness & Usability** | Bottom sheet gesture fluidity, touch target sizes (>= 44px), map panning without scrolling conflict, and bottom bar ergonomics. | Eng Domains 7 | `SOURCE_REVIEWED` + `PREVIEW_OBSERVED` |
| **P** | **Accessibility (a11y)** | Semantic HTML tags, ARIA roles (`role="dialog"`, `role="alert"`), keyboard trap management (`useDialogFocus`), screen-reader labels. | Eng Domains 23 | `SOURCE_REVIEWED` + `TEST_EXECUTED` |
| **Q** | **SEO & Search Discoverability** | Dynamic SSR meta tags, canonical URLs, automated XML sitemap, schema.org structured data, and OpenGraph share cards. | Eng Domains 24 | `SOURCE_REVIEWED` + `TEST_EXECUTED` |
| **R** | **Administrative & Operational Workflows** | Ease of reviewing bargains, approving sponsors, exporting leads, monitoring health, and updating runtime config. | Eng Domains 10, 11, 18 | `SOURCE_REVIEWED` + `TEST_EXECUTED` |
| **S** | **Testing Quality & Regression Protection** | Coverage breadth across unit, integration, stress, and security test suites; deterministic assertion standards. | Eng Domains 25, 26, 27, 28 | `TEST_EXECUTED` |
| **T** | **Product Value, Differentiation & Retention** | Uniqueness of GIS visualization, real utility of Hedonic valuation vs standard listing portals (Divar/Sheypoor), recurring return value. | Product Dimension (New) | `ANALYTICAL_EVALUATION` |

---

## 4. Real User Journey Maps

To evaluate real product friction, three realistic user journeys have been mapped from entry to success.

### 4.1. Journey 1: First-Time Home Buyer Seeking Affordable Neighborhood
- **Persona**: First-time home buyer with 3.5 billion Toman savings looking for a 75 sqm apartment in Tehran or Karaj.
- **Entry Point**: Lands on homepage (`/` or `/?onboarding=1`) via social media link or search engine.
- **User Objective**: Understand which neighborhoods fit their exact purchasing budget and compare living conditions.
- **Key Interaction Flow**:
  1. Trigger or dismiss Onboarding Wizard (`OnboardingWizardModal.tsx`); calibrate mode to "خرید" (Buy), total budget slider to 3,500 million Toman, and target area to 75 sqm.
  2. Observe GIS map dynamically recolor neighborhoods: green (affordable), amber (stretch budget), red (unaffordable).
  3. Click a green neighborhood marker on map (e.g., "پونک" or "ستارخان"); view bottom ranking strip (`QuickHoodRankingStrip.tsx`).
  4. Expand Neighborhood Inspector Drawer (`NeighborhoodInspectorDrawer.tsx`); inspect above-the-fold price history chart, anatomy metrics (green space, density), and resident reviews.
  5. Click "ماشین‌حساب ارزش‌گذاری هدونیک" to check what age/floor apartment fits 3.5B Toman in that neighborhood.
  6. Register for Buyer Price Alert (`BuyerAlertPwaLegalModals.tsx`) to receive notification if a property drops under budget.
- **Success State**: User identifies 2–3 viable neighborhoods, understands purchasing power trade-offs, and saves them to watchlist.
- **Potential Friction Points**:
  - Overwhelming number of analytical widgets when opening the drawer.
  - Budget slider granularity on touch devices.
  - Confusion between "قیمت هر متر" (Price/sqm) vs "بودجه کل" (Total budget).
- **Verification Method**: Interaction testing in preview mode + automated URL state hydration tests (`useAppUrlAndTitleSync.ts`).

### 4.2. Journey 2: Returning Investor / Homeowner Evaluating Trade-Up
- **Persona**: Existing apartment owner in Tehran (District 10) wanting to trade up to a larger 110 sqm unit in District 5.
- **Entry Point**: Direct visit to saved URL with preset filters (`/?city=tehran&mode=buy&hood=10`).
- **User Objective**: Calculate net equity from selling current home, evaluate financing gap (loan + tenant rahn), and identify target neighborhoods.
- **Key Interaction Flow**:
  1. Opens Tools drawer → launches "مشاور ارتقای مسکن و معاوضه" (`TradeUpModal` in `PortfolioModals.tsx`).
  2. Inputs current home specs (70 sqm, 12 years old, District 10), additional cash savings, and selects mortgage loan / tenant deposit options.
  3. Reviews calculated upgrade feasibility and recommended target neighborhoods in District 5 (`tradeUpResults`).
  4. Clicks "مقایسه دو محله" (`CompareModal.tsx`) to evaluate side-by-side metrics between current and target neighborhood.
  5. Clicks "مشاور حقوقی قولنامه و مبایعه‌نامه" (`ExpansionModulesModal.tsx`) to review standard contract pitfalls and calculate notary/brokerage commission fees.
- **Success State**: Homeowner receives a precise financial roadmap of equity gap and required cash reserves.
- **Potential Friction Points**:
  - Discoverability of the Trade-Up tool (nested inside Portfolio Modals).
  - Complexity of inputting multiple financial parameters simultaneously.
- **Verification Method**: Domain logic unit tests (`src/data/neighborhoodInsights.ts`) + form validation tests.

### 4.3. Journey 3: Mobile Renter on 4G Seeking Commute-Friendly Home
- **Persona**: Young professional renting in Tehran with 400M Toman deposit and 15M monthly rent, working in "میدان ولیعصر".
- **Entry Point**: Mobile browser via mobile search query.
- **User Objective**: Find neighborhoods within 35 minutes metro commute to work that match deposit/rent budget.
- **Key Interaction Flow**:
  1. Opens mobile bottom navigation bar (`RadarBottomNav.tsx`) → taps "فیلتر بودجه".
  2. Sets Mode to "رهن و اجاره" (Rent), Deposit to 400M, Rent to 15M, and selects Work Hub: "میدان ولیعصر".
  3. Taps "پیشنهادها" on bottom nav (`SmartSuggestModal.tsx`) to see algorithmically sorted recommendations ranked by commute time and price match.
  4. Taps top suggested neighborhood; map flies smoothly to coordinates.
  5. Opens "ماتریس قطب‌های اداری" card in drawer to verify direct metro lines and estimated commute duration.
  6. Taps "شکار زیر قیمت" tab to inspect verified agency bargains or submit a request to the neighborhood exclusive sponsor.
- **Success State**: Renter finds affordable neighborhoods with verified direct metro access and contacts a local verified broker.
- **Potential Friction Points**:
  - Touch target conflicts between Leaflet map drag gestures and mobile bottom sheet gestures.
  - Viewport clutter on screens under 380px width.
- **Verification Method**: Mobile smoke test suite (`tests/browser-smoke.test.ts`) + mobile viewport preview testing.

---

## 5. Evidence & Measurement Framework

To prevent subjective speculation, all future assessments under this program must utilize the following classification and evidence hierarchy:

### 5.1. Classification System
- `CONFIRMED_PROBLEM`: Reproducible functional bug, contract violation, or broken user flow demonstrated by tests or browser interaction.
- `REPRODUCED_PROBLEM`: Performance bottleneck, visual collision, or layout glitch captured and confirmed in the preview environment.
- `DESIGN_RISK`: Architectural or UX pattern that increases user error, creates cognitive overload, or risks data inconsistency.
- `IMPROVEMENT_HYPOTHESIS`: Potential enhancement to user value, ergonomics, or conversion that requires empirical validation.
- `PREVIOUSLY_VERIFIED`: Feature or subsystem already proven compliant by existing automated test suites and audit records.
- `NOT_VERIFIED`: Dimension or requirement that has not yet been subjected to rigorous evaluation.
- `NOT_APPLICABLE`: Dimension outside the current product scope or technical platform boundaries.

### 5.2. Evidence Verification Hierarchy
1. `SOURCE_REVIEWED`: Static code analysis confirming presence, architecture, and boundary compliance.
2. `TEST_EXECUTED`: Automated unit, contract, regression, or stress tests executed with terminal exit code 0.
3. `BUILD_VERIFIED`: Compilation, bundling, and linting passing with zero warnings or errors.
4. `PREVIEW_OBSERVED`: Visual verification of rendered DOM, layout responsiveness, and CSS styling in the active browser iframe.
5. `INTERACTION_VERIFIED`: Hands-on execution of multi-step user workflows (forms, modals, map clicks) confirming state updates.
6. `END_TO_END_VERIFIED`: Full-stack integration confirming client state, server endpoints, and cloud database persistence synchronously.
7. `REAL_EXTERNAL_INTEGRATION`: Live outbound communication with external third-party APIs (Telegram, Open-Meteo, Gemini) in production.
8. `REAL_USER_VALIDATED`: Direct qualitative feedback from actual Iranian property searchers and real estate professionals.
9. `ANALYTICS_MEASURED`: Quantitative behavioral data (conversion funnels, drop-off rates, session length, retention).

*Explicit Measurement Boundary Disclosure*: Capabilities 7, 8, and 9 cannot be fully established in the sandbox build environment without live production deployment, external network access, and real end-user traffic. They must be explicitly classified as `UNAVAILABLE_IN_SANDBOX` rather than inferred.

---

## 6. Finite, Dependency-Aware Assessment Roadmap

The Master Product Assessment Program is organized into **Four Bounded Assessment Campaigns**, designed to be executed sequentially without violating execution budgets or overlapping responsibilities.

```
┌────────────────────────────────────────────────────────────────────────┐
│  PHASE 0: Master Product Discovery & Assessment Architecture (PLAN-001)│
│  [STATUS: COMPLETED & VERIFIED]                                       │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│  CAMPAIGN-PROD-01: Usability, Ergonomics & Mobile UX Assessment        │
│  ├── WORKSTREAM ASSESS-001: Mobile Touch Ergonomics & Map Gestures     │
│  ├── WORKSTREAM ASSESS-002: Information Density & Drawer Architecture  │
│  └── WORKSTREAM ASSESS-003: First-Time Onboarding & Cognitive Friction │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│  CAMPAIGN-PROD-02: PropTech Calculation & Valuation Accuracy Assessment │
│  ├── WORKSTREAM ASSESS-004: Hedonic Pricing & Extreme Edge Cases       │
│  ├── WORKSTREAM ASSESS-005: 1405 Legal, Tax & Notary Formula Audit    │
│  └── WORKSTREAM ASSESS-006: Trade-Up & Asset Swap Model Validation     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│  CAMPAIGN-PROD-03: Performance, Rendering & Offline Resilience         │
│  ├── WORKSTREAM ASSESS-007: Leaflet Marker LOD & Viewport Culling     │
│  └── WORKSTREAM ASSESS-008: PWA Caching & Offline Recovery Resilience │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│  CAMPAIGN-PROD-04: Discoverability, Viral Sharing & Conversion         │
│  ├── WORKSTREAM ASSESS-009: Social Card & Share Deep-Link Fidelity     │
│  └── WORKSTREAM ASSESS-010: Buyer Alert & Agency CRM Conversion Funnel │
└────────────────────────────────────────────────────────────────────────┘
```

### 6.1. Campaign Details & Acceptance Criteria

#### Campaign PROD-01: Usability, Ergonomics & Mobile UX Assessment
- **Objective**: Identify UI friction, visual clipping, gesture conflicts, and cognitive overload on mobile and desktop viewports.
- **Workstreams**:
  - `ASSESS-001` (Mobile Touch Ergonomics): Assess Leaflet map pan/zoom conflicts against bottom sheet drawer drag gestures on viewports `< 480px`.
  - `ASSESS-002` (Information Density & Drawer Architecture): Assess readability of the 6 secondary analytical cards in `NeighborhoodInspectorDrawer.tsx` to eliminate visual fatigue.
  - `ASSESS-003` (First-Time Onboarding & Cognitive Friction): Evaluate completion friction and default budget parameter accuracy in `OnboardingWizardModal.tsx`.
- **Dependencies**: None (Can start immediately upon authorization).
- **Risk Level**: Low (Assessment only; no code changes).

#### Campaign PROD-02: PropTech Calculation & Valuation Accuracy Assessment
- **Objective**: Empirically audit the mathematical models of property valuation, tax estimation, and loan schedules across all 9 metropolitan regions.
- **Workstreams**:
  - `ASSESS-004` (Hedonic Pricing Engine Accuracy): Benchmark `calculateHedonicValuation` against recent real-world transaction medians across Tehran, Karaj, Isfahan, Mashhad, and Shiraz.
  - `ASSESS-005` (1405 Legal & Tax Formula Audit): Validate statutory compliance of Article 54 rental tax brackets and 1405 inheritance tax tables in `legalAndBuildingLogic.ts`.
  - `ASSESS-006` (Trade-Up & Swap Model Validation): Verify financial logic in `evaluateTradeUpOptions` when tenant rahn deduction and mortgage loans are combined.
- **Dependencies**: Requires completed domain baseline from Phase 0.
- **Risk Level**: Medium (Requires domain expertise in Iranian real estate finance).

#### Campaign PROD-03: Performance, Rendering & Offline Resilience
- **Objective**: Audit rendering frame rates, marker DOM memory footprint, and offline caching performance.
- **Workstreams**:
  - `ASSESS-007` (Leaflet Marker LOD & Viewport Culling): Measure DOM node count when rendering nationwide neighborhood markers (100+ points) and assess map frame rate during rapid panning.
  - `ASSESS-008` (PWA Caching & Service Worker Resilience): Test offline startup, asset precaching, and graceful degradation when network connectivity drops.
- **Dependencies**: Dependent on Campaign PROD-01 findings.
- **Risk Level**: Low.

#### Campaign PROD-04: Discoverability, Viral Sharing & Conversion
- **Objective**: Audit feature discoverability, social sharing fidelity, and lead generation conversion paths.
- **Workstreams**:
  - `ASSESS-009` (Social Card & Deep-Link Fidelity): Test OpenGraph image generation, Telegram share formatting, and deep-link hydration for all neighborhood comparison pairs (`?compare=5-101`).
  - `ASSESS-010` (Buyer Alert & Agency CRM Conversion Funnel): Audit the end-to-end user friction when registering buyer price alerts and submitting agency sponsorship bids.
- **Dependencies**: Dependent on Campaigns PROD-01 and PROD-02.
- **Risk Level**: Low.

---

## 7. Recommended Execution Order & Governance Rules

1. **Strict Separation of Assessment and Implementation**: No assessment workstream is permitted to modify application source code. Assessment outputs must be documented in evidence-based audit findings before any remediation campaign is authorized.
2. **Prioritization Rationale**:
   - Priority 1: Mobile Usability & Navigation Ergonomics (Campaign PROD-01) — Highest impact on immediate user retention.
   - Priority 2: Valuation & Financial Calculation Correctness (Campaign PROD-02) — Core product credibility and value differentiation.
   - Priority 3: Rendering Performance & Offline Resilience (Campaign PROD-03) — Foundation for smooth scaling.
   - Priority 4: Viral Sharing & Conversion Funnels (Campaign PROD-04) — Drives organic user acquisition and agency monetization.
3. **Finite Iteration Budgets**: Every subsequent assessment campaign must adhere strictly to Version 32 governance (maximum 3 batches, maximum 2 corrective iterations, and explicit read-back checkpoints).

---

## 8. Summary of Phase 0 Completion

Workstream **PLAN-001** has successfully established:
- Grounded inventory of all 22 major user-facing modules, 15 backend API routes, and 4 database structures.
- Complete 20-domain Master Product Assessment Matrix cross-referenced with all 30 engineering audit domains.
- 3 detailed real user journey maps with identified friction points.
- 9-level evidence verification hierarchy distinguishing sandbox test capability from live production analytics.
- Finite, 4-campaign assessment roadmap (ASSESS-001 through ASSESS-010).

This document serves as the permanent product discovery baseline for all future engineering and product evaluations of Radar Tehran.
