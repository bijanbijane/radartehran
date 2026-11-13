# 01 — Repository & Runtime Evidence Register (`CAMPAIGN-PROD-01`)

- **Campaign ID**: `CAMPAIGN-PROD-01`
- **Verification Scope**: Full repository reconstruction (`358` scanned implementation files), documentation-to-code parity audit, automated non-destructive verification checks, and live headless Chromium runtime measurements across 9 viewports (`320×568` to `1440×900`).

---

## 1. Repository Architecture & Tech Stack Reconstruction

| Layer | Actual Implementation (Verified in Source) | Primary Entry / Config Files | Status |
| :--- | :--- | :--- | :--- |
| **Frontend Framework** | React `19.0.0` + TypeScript `5.8.2` + Vite `6.2.0` + Tailwind CSS `4.1.14` (`@tailwindcss/vite`) | `package.json`, `src/main.tsx`, `src/App.tsx` (64 lines), `src/index.css`, `src/styles/tokens.css` | `SOURCE_REVIEWED` + `AUTOMATED_TESTED` |
| **Spatial & Map Engine** | Leaflet `1.9.4` with custom zoom LOD (`mapZoomLodAndDeclutter.ts`), SVG polygons, and HTML markers (`escapeHtmlAttr` sanitized) | `src/components/useLeafletRadarMap.ts` (373 lines), `src/components/mapZoomLodAndDeclutter.ts` | `SOURCE_REVIEWED` + `VIEWPORT_TESTED` |
| **Workspace Shell & Routing** | URL-synchronized SPA (`useAppUrlAndTitleSync.ts`) with 6 primary views (`home`, `discover`, `intelligence`, `map`, `tools`, `userspace`) | `src/components/RadarWorkspaceShell.tsx`, `src/components/views/ProductViewRouter.tsx`, `src/components/navigation/primaryNavigation.ts` | `SOURCE_REVIEWED` + `INTERACTION_TESTED` |
| **Domain Valuation & Market Data** | Hedonic Pricing Engine (`FAST_SALE_FACTOR = 0.88`) + Multidimensional Market Price Aggregator (`IQR` outlier trimming, 3 provenance tiers) across 6 cities (`159` neighborhoods) | `src/data/hedonicPricingEngine.ts`, `src/utils/realMarketPriceAggregator.ts`, `src/data/neighborhoods.ts`, `src/data/multiCityData.ts` | `SOURCE_REVIEWED` + `AUTOMATED_TESTED` |
| **Backend & Cloud Edge** | Express `4.21.2` (`server.ts`, port `3000`) + Cloudflare Worker/D1 staging architecture (`worker/`, `wrangler.toml`) + Firebase `12.11.0` | `server.ts`, `firestore.rules`, `firebase-blueprint.json`, `wrangler.toml` | `SOURCE_REVIEWED` + `AUTOMATED_TESTED` |
| **Architecture Guardrails** | Strict `< 500` lines per file limit (`0` warnings, `0` errors across `358` files); unidirectional imports (`App` -> `components` -> `data` -> `utils` -> `types`) | `ARCHITECTURE.md`, `architecture-baseline.json`, `scripts/check-architecture.ts` | `AUTOMATED_TESTED` |

---

## 2. Documentation vs. Implementation Discrepancies (`CONFIRMED_PROBLEM` | `SOURCE_REVIEWED`)

Per Section 2 of the CASPER Mandate, wherever documentation disagrees with implementation, the discrepancy is explicitly recorded and the live source code is treated as the ground truth of current behavior:

1. **`README.md` vs. Actual Repository Architecture**:
   - **Claim in `README.md`**: Describes a future "Agency-First (B2B2C) Modular Monolith" built on **Next.js (App Router) + NestJS / Fastify + PostgreSQL 16 + PostGIS + Redis 7**.
   - **Actual Codebase (`package.json`, `src/`, `server.ts`)**: A consumer-and-prosumer urban housing intelligence SPA built on **React 19 + Vite 6 + Express 4 + Firebase Firestore + Cloudflare Worker/D1**.
2. **Historical `docs/engineering/assessments/ASSESS-001.md` vs. `src/components/RadarBottomNav.tsx`**:
   - **Claim in `ASSESS-001.md`**: States that `RadarBottomNav.tsx` uses a **6-column grid (`grid-cols-6`)**.
   - **Actual Code (`src/components/RadarBottomNav.tsx:90`)**: Uses a **7-column grid (`grid-cols-7`)** (`خانه`, `کشف محله`, `نبض بازار`, `نقشه`, `ابزارها`, `فضای من`, `بیشتر`), making each tab even narrower (`45.7px` on `320px`).
3. **Historical `docs/engineering/assessments/ASSESS-001.md` vs. `src/styles/tokens.css` & `NeighborhoodInspectorDrawer.tsx`**:
   - **Claim**: Assumes `.radar-drawer-scroll-container` and `.radar-drawer-drag-handle` are active on the drawer.
   - **Actual Code**: Defined in `src/styles/tokens.css` (`lines 62–84`), but **never applied to any JSX element** in `NeighborhoodInspectorDrawer.tsx` (`hasOrphanTokenScroll: false`, `hasOrphanTokenHandle: false`).
4. **`docs/MASTER-PRODUCT-ASSESSMENT-ROADMAP.md` (Section 2.2) vs. `src/components/OnboardingWizardModal.tsx`**:
   - **Claim**: Refers to a "4-step onboarding wizard" and "age multiplier".
   - **Actual Code (`OnboardingWizardModal.tsx:36, 134–162`)**: Has **3 steps (`step: 1 | 2 | 3`)** and the multiplier is **target building construction age (`سن بنای هدف`: `نوساز 1.15x`, `میان‌سال 1.0x`, `قدیمی‌ساز 0.85x`)**, not the user's personal age.

---

## 3. Non-Destructive Engineering Verification Baseline (`AUTOMATED_TESTED`)

All repository health checks were executed non-destructively prior to authoring this assessment:

- **`npm run lint` (`tsc --noEmit`)**: `PASS` (`0` TypeScript errors).
- **`npm run arch:check` (`tsx scripts/check-architecture.ts`)**: `PASS` (`358` implementation files scanned, `1` tracked legacy file `src/App.tsx` at `64/100` lines, `0` size review warnings, `0` blocking architecture errors).
- **`npm run test:contracts` (`tsx tests/engineering-quality-foundation.test.ts`)**: `PASS` (`10/10` contract, security, numeric, FX/area-unit, and epistemic UI guard suites passed).
- **`npm run build` (`tsx scripts/generate-sitemap.ts && vite build`)**: `PASS` (`2,280` modules transformed; production build succeeded in `14.53s`; note heavy client bundles: `index` `678.78 kB` / `155.08 kB` gzip, `Stage2MasterWidget` `288.06 kB` / `42.01 kB` gzip).

---

## 4. Runtime 9-Viewport Matrix Measurements (`VIEWPORT_TESTED`)

Live Chromium measurements captured via `playwright-cli` on `http://localhost:3000/?view=map&city=tehran&mode=buy&buy=3500&sqm=75`:

| Viewport (`W×H`) | Device Class | `ProductGlobalHeader` (`px`) | `FloatingTopBar` (`px`) | `MapLegend` (`px`) | Collapsed Sheet (`px`) | `RadarBottomNav` (`px`) | Unobstructed Map Band (`px` / `%`) | Bottom Nav Tab Width (`px`) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **`320×568`** | Small Mobile (SE) | `0..65` (`65px`) | `80..170` (`90px`) | `302..386` (`84px`, 2 rows) | `434..512` (`78px`) | `508..568` (`60px`) | **`132px` (`23.2%`)** | **`45.7px`** (wraps text) |
| **`360×800`** | Standard Android | `0..65` (`65px`) | `80..170` (`90px`) | `574..612` (`38px`) | `666..744` (`78px`) | `740..800` (`60px`) | **`404px` (`50.5%`)** | `51.4px` |
| **`375×812`** | Standard iOS | `0..65` (`65px`) | `80..170` (`90px`) | `586..624` (`38px`) | `678..756` (`78px`) | `752..812` (`60px`) | **`416px` (`51.2%`)** | `53.6px` |
| **`390×844`** | Modern Mobile | `0..65` (`65px`) | `80..170` (`90px`) | `618..656` (`38px`) | `710..788` (`78px`) | `784..844` (`60px`) | **`448px` (`53.1%`)** | `55.7px` |
| **`430×932`** | Large Mobile | `0..65` (`65px`) | `80..170` (`90px`) | `706..744` (`38px`) | `798..876` (`78px`) | `872..932` (`60px`) | **`536px` (`57.5%`)** | `61.4px` |
| **`768×1024`** | Tablet Portrait | `0..65` (`65px`) | `80..170` (`90px`) | `798..836` (`38px`) | `890..968` (`78px`) | `964..1024` (`60px`) | **`628px` (`61.3%`)** | `109.7px` |
| **`1024×768`** | Tablet Landscape / Small Laptop | `0..65` (`65px`) | `80..130` (`50px`) | `692..730` (`38px`) | Side Drawer `w=396px` (`h=704px`) | Hidden (`lg:hidden`) | **`562px` (`73.2%` h, `628px` w)** | N/A |
| **`1280×800`** | Standard Laptop | `0..65` (`65px`) | `80..130` (`50px`) | `724..762` (`38px`) | Side Drawer `w=396px` (`h=736px`) | Hidden (`lg:hidden`) | **`594px` (`74.3%` h, `884px` w)** | N/A |
| **`1440×900`** | Desktop | `0..65` (`65px`) | `80..130` (`50px`) | `824..862` (`38px`) | Side Drawer `w=396px` (`h=836px`) | Hidden (`lg:hidden`) | **`694px` (`77.1%` h, `1044px` w)** | N/A |

---

## 5. Captured Runtime Screenshot Evidence Index (`.playwright-cli/`)

1. `.playwright-cli/assess001-mobile-390x844-collapsed.png` — Mobile `390×844` map view showing 5-layer chrome stack and `DevDiagnosticsHud` overlapping the collapsed bottom sheet.
2. `.playwright-cli/assess001-mobile-320x568-map.png` — Small mobile `320×568` showing extreme `23.2%` (`132px`) unobstructed map band and 2-row wrapped `MapLegend`.
3. `.playwright-cli/assess002-mobile-390x844-expanded-real.png` — Mobile `390×844` expanded inspector sheet (`h-[78vh]`) demonstrating `FloatingTopBar` (`z-40`) overlapping the top `40px` of the sheet (`z-30`) and complete above-the-fold starvation (zero price cards or tabs visible above the fold).
4. `.playwright-cli/assess002-mobile-390x844-market-tab.png` — Mobile `390×844` `market` tab view.
5. `.playwright-cli/assess002-desktop-1440x900-map-inspector.png` — Desktop `1440×900` map + `396px` side inspector drawer.
6. `.playwright-cli/assess003-mobile-390x844-onboarding-step1.png` — `ExpansionModulesModal` (`reverse_budget`) opened from header calculator icon, showing missing mortgage/rahn boosters and `5B+` presets.
7. `.playwright-cli/assess003-onboarding-wizard-modal.png` — `OnboardingWizardModal` opened from `ProductDiscoverView`.
8. `.playwright-cli/assess003-mobile-390x844-home-view.png` — `ProductHomeView` (`mode=buy&buy=3500&sqm=75`) showing `BudgetFitVerdict` rendering `"جا نمی‌شود"` in emerald green on unaffordable central neighborhoods.
9. `.playwright-cli/assess003-wizard-step1-verified.png` — `ProductDiscoverView` on `390×844` demonstrating the `136px` split-map mobile sliver at the top of secondary views.
10. `.playwright-cli/assess003-karaj-390x844-map.png` — `Karaj` (`?city=karaj&mode=buy&buy=3500&sqm=75`) on `390×844` showing `7` affordable neighborhoods matching the `3.5B` / `75m²` persona.
