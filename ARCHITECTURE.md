# Architecture Policy & Regression Guardrails (`ARCHITECTURE.md`)

**Project**: رادار هوشمند محله‌ها و مسکن تهران و کلان‌شهرها (Tehran & Multi-City Housing Radar)

This document is the authoritative architecture policy for the repository. All contributors and automated coding agents must follow these boundaries, size limits, legacy ratchet rules, and verification checks before completing any task.

---

## 1. Layered Module Boundaries & Dependency Direction

Dependencies must flow strictly downward (`Entry/Shell` → `Feature Components` → `Domain Logic & Data` → `Pure Utilities` → `Types`):

1. **Application Shell & Server Entry (`src/App.tsx`, `server.ts`)**:
   - Coordinates top-level state, lazy modal mounting, map lifecycle, and Express API endpoints (`/api/*`).
   - New modal views, feature panels, and domain calculators **must not** be added inline inside `src/App.tsx`.
2. **Feature Components (`src/components/*.tsx`, `src/components/*.ts`)**:
   - Self-contained UI modals, drawers, legends, custom hooks, and interactive widgets (`FloatingTopBar.tsx`, `NeighborhoodInspectorDrawer.tsx`, `useLeafletRadarMap.ts`, `useRadarCloudSync.ts`, `useRadarCrudActions.ts`, `useRadarAdminActions.ts`, `useMarketPulseSync.ts`, `useAppPersistenceAndDerivedState.ts`).
   - May import from `src/data/*`, `src/utils/*`, `src/types/*`, and `src/firebase.ts`.
   - Must **never** import from `src/App.tsx` or `server.ts`.
3. **Domain Engines & Static Datasets (`src/data/*.ts`)**:
   - Pure TypeScript valuation engines (`hedonicPricingEngine.ts`, `superModulesLogic.ts`, `legalAndBuildingLogic.ts`, `mortgageCalculator.ts`), neighborhood evaluation logic (`neighborhoods.ts`), and city datasets (`multiCityData.ts`, `neighborhoodInsights.ts`).
   - **Strict Upward Dependency Ban**: Files in `src/data/*` must **never** import from `src/components/*`, `src/App.tsx`, `server.ts`, or `react`.
   - **Single Source of Truth for Property Valuation**: `src/data/hedonicPricingEngine.ts` (`calculateHedonicValuation`, `FAST_SALE_FACTOR`) is the canonical Hedonic pricing core. Extended calculators (such as `calculateDetailedValuation` in `src/data/superModulesLogic.ts`) must delegate core age, floor, size, renovation, and amenity calculations to `calculateHedonicValuation` rather than duplicating coefficient tables.
4. **Security, Server & Formatting Utilities (`src/utils/*.ts`)**:
   - Pure helper functions and modular server route handlers (`security.ts`, `serverMarketPulseEngine.ts`, `serverObjectStorage.ts`, `serverSeoAndSitemap.ts`, `serverUtilityRoutes.ts`, `serverAdminAndTelegramSecurity.ts`, `serverAiAndCommerceRoutes.ts`, `rmepExecutionStateEngine.ts`).
   - **Strict Upward Dependency Ban**: Files in `src/utils/*` must **never** import from `src/components/*`, `src/App.tsx`, `server.ts`, or `react`.
5. **Domain Types (`src/types/*.ts`)**:
   - Pure TypeScript interfaces and runtime type guards (`src/types/models.ts`, `src/types/typeGuards.ts`, `src/types/calculators.ts`). Must never import UI components or entry points.

---

## 2. File Size & Responsibility Thresholds

Enforced automatically by `npm run arch:check` (`scripts/check-architecture.ts` + `architecture-baseline.json`):

- **New & Standard Code Files (`src/**/*.{ts,tsx}`, `server.ts`)**:
  - Soft warning threshold (`thresholds.warningLines`): **300 lines**.
  - Review threshold (`thresholds.reviewLines`): **400 lines**.
  - Hard ceiling (`thresholds.maxLinesNewFile`): **< 500 lines**. Any newly created or standard component/module reaching 500 lines fails `npm run arch:check` with `NEW_FILE_OVERSIZED`.
- **Tracked Legacy Files & Universal Zero-Warning Ceiling (`architecture-baseline.json -> trackedLegacyFiles`)**:
  - `src/App.tsx` has been decomposed down to **64 lines** (`< 100` LOC per ARGON-4 `[RULE-01]`) and ratcheted at `maxLines: 100` (`maxLines: 270` historical ceiling superseded by `maxLines: 100`). All 244 non-dataset source files (`server.ts`, `src/App.tsx`, `src/main.tsx`, `src/firebase.ts`, and all non-dataset modules in `src/components`, `src/components/modals`, `src/components/inspector`, `src/context`, `src/workers`, `src/data`, `src/utils`, `src/types`) are strictly `<= 290` lines with **0 size review warnings** in `npm run arch:check`.
- **Static Domain Datasets (`architecture-baseline.json -> datasetExclusions`)**:
  - Pure neighborhood/insight datasets (`src/data/neighborhoods.ts`, `src/data/neighborhoodInsights.ts`, `src/data/multiCityData.ts`, `src/data/tehranCityRemainingHoods.ts`, `src/data/tehranCountiesHoods.ts`, `src/data/tehranExtendedInsights.ts`, `src/data/iranNorthWestEastHoods.ts`, `src/data/iranCentralSouthHoods.ts`, `src/data/iranProvincesDirectory.ts`) are also compacted and ratcheted at `maxLines: 290` (`<= 290` lines across all 253 scanned repository files) while remaining strictly free of React/UI imports (`DATASET_IMPORTS_UI`).

---

## 3. Security, I/O & Runtime Invariants

- **Leaflet HTML Escaping**: Any dynamic string interpolated into `L.divIcon({ html })` or `marker.bindTooltip(html)` must pass through `escapeHtmlAttr(...)` from `src/utils/security.ts`.
- **Multi-City External Links**: External listing links must use `buildExternalDivarUrl(activeCity, mode, hoodName)` from `src/utils/security.ts` rather than hardcoding `/s/tehran/buy-apartment/`.
- **Non-Blocking Server Persistence**: `server.ts` and `src/utils/serverMarketPulseEngine.ts` must persist `.cache-data.json` using debounced asynchronous `fs.promises.writeFile` + `fs.promises.rename` atomic writes, never synchronous `fs.writeFileSync` inside request handlers.
- **No Native Browser Dialogs**: Never use `window.alert`, `window.confirm`, or `window.open`.

---

## 4. Required Verification Workflow

Before finishing any code change, run all of the following checks:

```bash
npm run lint                                    # TypeScript strict typecheck (tsc --noEmit)
npm run arch:check                              # Automated file-size ratchet & dependency direction check
npx tsx tests/architecture-guardrails.test.ts   # Unit tests for guardrails, security helpers & valuation engine
npx tsx tests/fifty-step-audit.test.ts          # 50-step functional & regression audit suite
npx tsx tests/hedonic-and-627-debug.test.ts     # 627-cycle Hedonic & multi-city invariant suite
npx tsx tests/stress-50-cycles.test.ts          # 50-cycle high-load stress & memory suite
npm run build                                   # Production Vite bundle verification
```
