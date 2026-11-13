# 08 — Quantitative Acceptance Framework & Test Plan (`CAMPAIGN-PROD-01`)

- **Campaign ID**: `CAMPAIGN-PROD-01`
- **Scoring Philosophy**: Per Section 17 of the CASPER Mandate, engineering green builds (`tsc`, `arch:check`) are strictly separated from **Human Experience Score** and **Verification Evidence Score**. No single composite score may hide a P0 human usability defect.

---

## 1. Three-Pillar Baseline vs. Target Scoreboard

| Pillar | Current Baseline (`CAMPAIGN-PROD-01` Audit) | Target Post-Implementation Gate | Blocking Threshold |
| :--- | :--- | :--- | :--- |
| **1. Engineering Score** (`lint`, `arch:check`, `test:contracts`, `build`, `<500` LOC) | **`98 / 100`** (`0` TS errors, `0` arch errors, `10/10` contracts pass; `-2` for `678kB` index chunk & orphaned CSS rules) | **`100 / 100`** | `>= 98 / 100` (`0` errors) |
| **2. Human Experience Score** (10 weighted UX/Ergonomic domains below) | **`54.2 / 100`** (Dragged down by `23%` map height on `320×568`, binary sheet, z-index collisions, above-fold starvation, and `"جا نمی‌شود"` green badge bug) | **`>= 91.0 / 100`** | `>= 88.0 / 100` (`0` P0 defects) |
| **3. Evidence Score** (Levels 1–6 verified in sandbox; Levels 7–9 documented) | **`100%` of Sandbox-Available Levels (`Levels 1–6`)** (`9` viewports + `10` screenshots + AST/DOM metrics) | **`100%` Levels 1–6 + Automated E2E Regression Suite** | `100%` Levels 1–6 |

---

## 2. Ten-Domain Quantitative Acceptance Rubric (Human Experience Score)

| Domain # | Domain Name | Weight | Current Score (`/10`) | Target Score (`/10`) | Concrete Quantitative Acceptance Gate (Testable in Playwright / `node:test`) |
| :---: | :--- | :---: | :---: | :---: | :--- |
| **D1** | **Mobile Map Viewport Freedom (`< 480px`)** | `15%` | `4.0` | `9.2` | Unobstructed map band between top chrome bottom and bottom UI top `>= 60%` (`>= 340px`) on `320×568` and `>= 72%` (`>= 608px`) on `390×844` when sheet is `collapsed`. |
| **D2** | **Bottom Sheet Gesture & Snap Determinism** | `12%` | `4.5` | `9.4` | Sheet supports 3 deterministic states (`collapsed: 72px`, `peek: ~40dvh`, `expanded: ~86dvh`); pointer drag and single-tap buttons both transition states; `.radar-drawer-scroll-container` & `.radar-drawer-drag-handle` active in DOM; zero overlap with `FloatingTopBar`. |
| **D3** | **Touch Target Ergonomics & Bottom Nav** | `12%` | `5.0` | `9.5` | `0` visible interactive elements `< 24×24px` (WCAG 2.2 AA); `100%` of primary mobile controls (`header`, `bottom nav`, `sheet handle`, `wizard buttons`) `>= 44×44px`; `RadarBottomNav` uses 5 columns (`>= 64px` width on `320px`) with zero wrapped labels. |
| **D4** | **Inspector Above-the-Fold Hierarchy** | `14%` | `4.0` | `9.3` | On `390×844` in `peek` (`40dvh`) and `expanded` (`86dvh`), Neighborhood Title, 1-line Epistemic Trust Pill, 2-column Buy/Rent Price Card, and 4-tab bar all have `boundingBox.bottom <= viewportHeight - 56` without scrolling (`scrollTop === 0`). |
| **D5** | **Inspector Card Density & Progressive Disclosure** | `10%` | `5.5` | `9.0` | In `Simple` mode, `<details>` for `Stage2MasterWidget` defaults to `open === false` (`scrollHeight` of `scorecard` tab reduced by `>= 35%`); `SmartPriceForecastCard` and `NeighborhoodMonthlyBarChart` render inside `market` tab *above* global CTA buttons. |
| **D6** | **Epistemic Data Trust Scannability** | `8%` | `6.5` | `9.2` | Above-the-fold provenance disclosure consolidated into 1 compact interactive Trust Pill (`<= 40px` height collapsed) with 1-tap expansion to the 5-layer provenance breakdown; zero forbidden deal-fact claims (`test:contracts` #10). |
| **D7** | **First-Time Buyer Onboarding & Defaults (`3.5B`/`75m²`)** | `11%` | `5.0` | `9.4` | Unified budget modal accessible from Header, Home, and Discover; includes `2.5B` & `3.5B` presets, Loan (`+1.2B`), Tenant Rahn (`+15%`), Building Age (`0.85x..1.15x`), and City Switcher; `ProductHomeView` quick chips sync with global budget state. |
| **D8** | **Affordability Verdict Accuracy & Cross-City Bridge** | `8%` | `4.5` | `9.5` | `BudgetFitVerdict.tsx` never applies `emerald` classes to `"جا نمی‌شود"`; evaluates full city/province neighborhood set; offers 1-tap **Karaj (`کرج`) Cross-City Bridge** when central Tehran yields `0` cash matches. |
| **D9** | **RTL Typography, Bidi & Contrast Compliance** | `5%` | `7.8` | `9.3` | `tabular-nums` active on all numeric price columns; zero horizontal overflow (`document.documentElement.scrollWidth <= window.innerWidth`) across all 9 viewports; light/dark text contrast `>= 4.5:1`. |
| **D10** | **Secondary View Mobile Reading Space** | `5%` | `5.5` | `9.2` | On `< 1024px`, `discover`, `intelligence`, `tools`, and `userspace` default to `splitMapMode = false` (`mt-0 h-full`), reclaiming `136px` of vertical viewport height. |
| — | **Weighted Human Experience Total** | **`100%`** | **`54.2 / 100`** | **`93.1 / 100`** | **All P0/P1 gates verified via automated Playwright assertions.** |

---

## 3. Automated Test Specification for Implementation Phase

### 3.1 Pure Logic Unit Tests (`node:test` — Decoupled from React/DOM)
1. **`tests/bottom-sheet-snap-math.test.ts`**:
   - Verifies `resolveSheetSnapHeightPx` across `320×568`, `390×844`, and landscape `844×390` (enforcing `55dvh` cap).
   - Verifies `computeNextSnapStateFromGesture` for upward flick (`velocityY = -0.6` -> `collapsed` to `peek`, `peek` to `expanded`), downward flick (`velocityY = 0.6` -> `expanded` to `peek`, `peek` to `collapsed`), and sub-threshold micro-drags (`|deltaY| < 48` -> remains in `currentState`).
2. **`tests/budget-fit-verdict-and-bridge.test.ts`**:
   - Verifies that for `mode = 'buy'`, `buyTotalBudget = 3500`, `targetSqm = 75` in `Tehran`, `buildBudgetFitVerdict` surfaces affordable Tehran Province areas (`پرند`, `پیشوا`) with `fitStatus = 'affordable'` (`emerald`), labels unaffordable central hoods with `fitStatus = 'unaffordable'` (`rose`), and computes the Karaj cross-city bridge count (`7` matching neighborhoods in `karaj`).

### 3.2 Playwright E2E Viewport & Interaction Assertions (`tests/e2e-campaign-prod-01.test.ts`)
1. **Viewport Chrome Freedom Check (`320×568` & `390×844`)**:
   - Assert `unobstructedMapHeight / viewport.height >= 0.60` on `320×568` and `>= 0.72` on `390×844`.
   - Assert `FloatingTopBar.boundingBox().bottom <= ExpandedSheet.boundingBox().top` (or `FloatingTopBar` z-index `<` `ExpandedSheet` z-index).
2. **Above-the-Fold Inspector Check (`390×844`)**:
   - Click `button[aria-label="بررسی محله"]`, assert `scrollTop === 0`, and assert that `[data-testid="inspector-price-card"]` and `[role="tablist"]` have `boundingBox().bottom <= 784`.
3. **WCAG 2.2 SC 2.5.8 Touch Target Audit**:
   - Query all visible interactive controls in `ProductGlobalHeader`, `RadarBottomNav`, and `NeighborhoodInspectorDrawer` header; assert `width >= 24 && height >= 24` (`>= 44` for primary mobile controls).
