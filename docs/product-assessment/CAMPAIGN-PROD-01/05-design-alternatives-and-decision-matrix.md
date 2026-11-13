# 05 — Design Alternatives & Weighted Decision Matrix (`CAMPAIGN-PROD-01`)

- **Campaign ID**: `CAMPAIGN-PROD-01`
- **Methodology**: Multi-Attribute Utility Theory (MAUT) across 15 weighted criteria, followed by sensitivity analysis under 3 alternative weight profiles and Red-Team critique of the winning architecture.

---

## 1. Candidate Architectural Options

### Option A — Evolutionary Refinement (`اصلاح تکاملی کم‌ریسک`)
- **Core Concept**: Preserve the existing 6-view workspace shell, `FloatingTopBar`, and `NeighborhoodInspectorDrawer` structure, applying targeted bug fixes:
  - Add pointer drag to the bottom sheet (`collapsed`, `peek`, `expanded`).
  - Fix z-index overlap between `FloatingTopBar` and `NeighborhoodInspectorDrawer`.
  - Move `QuickHoodRankingStrip` below the price card and collapse `<details>` on `Stage2MasterWidget`.
  - Fix `BudgetFitVerdict` green badge bug and add `3.5B` preset to `OnboardingWizardModal`.
- **Strengths**: Lowest implementation diff; minimal component refactoring.
- **Weaknesses**: Retains the dual-header redundancy on mobile (`ProductGlobalHeader` + `FloatingTopBar`), keeps the 7-column cramped bottom nav (`45.7px` per tab on `320px`), and leaves 4 separate budget modals in the codebase.

### Option B — Cartographic Editorial & Bottom-Sheet-First Architecture (`معماری کارتوگرافیک نقشه-محور`)
- **Core Concept**: Collapse the entire application into a single fullscreen map canvas (Apple Maps / Google Maps style) where `Home`, `Discover`, `Intelligence`, and `Tools` exist strictly as snap-point cards inside a universal multi-detent bottom sheet.
- **Strengths**: Maximizes map canvas visibility (`>80%` in collapsed state); eliminates secondary-view switching.
- **Weaknesses**: **High architectural regression risk**—requires dismantling `ProductViewRouter.tsx`, `ProductHomeView.tsx`, `ProductDiscoverView.tsx`, and `ProductIntelligenceView.tsx` (which were deliberately established in Batch 4.x/RMEP-001); forces long-form macro tables and tools into a sheet container on desktop and mobile; violates `PERSISTENT-ENGINEERING-MEMORY.md` mandate to preserve existing multi-view product capabilities.

### Option C — Task-Oriented Multi-View Workspace (`معماری فضای کاری وظیفه‌محور مجزا`)
- **Core Concept**: Strictly separate Map exploration from Analytical/Wizard tasks: remove split-map companion mode on mobile, unify all 4 budget entry points into a single **Purchasing Power & Onboarding Engine**, consolidate mobile navigation into **4 primary task tabs + `More` sheet**, and restructure the Inspector into a **3-Tier Progressive Disclosure Drawer** (`Tier 1 Sticky Verdict` -> `Tier 2 Scoped Tab Cards` -> `Tier 3 On-Demand Stage-2 Deep Dive`).
- **Strengths**: Eliminates the 4-modal onboarding confusion, eliminates the `136px` split-map mobile sliver, restores `>= 44×44px` touch ergonomics, and makes the Inspector immediately scannable above the fold.
- **Weaknesses**: Pure Option C without Option A's 3-state map bottom sheet would under-serve spatial map comparison on mobile.

### Recommended Synthesis — **Hybrid Option A+C (`معماری ترکیبی A+C: افشای تدریجی فضا-محور و یکپارچه‌سازی بودجه`)**
We combine **Option A's low-risk component preservation and 3-state gesture bottom sheet on the Map view** with **Option C's unified mobile chrome, 4+1 bottom nav, 3-tier Inspector hierarchy, and unified Purchasing Power & Cross-City Onboarding Engine**.

---

## 2. 15-Criteria Weighted Decision Matrix (`1` = Poor to `10` = Excellent)

| # | Evaluation Criterion | Weight | Option A (Evolutionary) | Option B (Map-Only Sheet) | Option C (Task Workspace) | **Hybrid A+C (Recommended)** |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| 1 | **Mobile Ergonomics (`< 480px`)** | `12%` | `6.5` | `8.5` | `8.5` | **`9.4`** |
| 2 | **Map vs. Sheet Gesture Clarity** | `10%` | `7.5` | `8.8` | `8.0` | **`9.5`** |
| 3 | **Information Hierarchy & Scannability** | `10%` | `6.8` | `6.0` | `9.0` | **`9.3`** |
| 4 | **First-Time Buyer Onboarding Clarity (`3.5B`/`75m²`)** | `10%` | `6.5` | `6.2` | `9.4` | **`9.5`** |
| 5 | **Decision-Support Speed (Time-to-First-Verdict)** | `8%` | `7.0` | `7.2` | `9.0` | **`9.2`** |
| 6 | **Epistemic Data Trust Clarity** | `7%` | `6.5` | `6.0` | `9.0` | **`9.1`** |
| 7 | **Persian RTL Typography & Numeric Precision** | `6%` | `8.0` | `7.5` | `9.0` | **`9.2`** |
| 8 | **WCAG 2.2 AA Accessibility Compliance** | `7%` | `6.5` | `6.8` | `9.2` | **`9.3`** |
| 9 | **Performance & Bundle Impact (`Stage2` lazy/closed)** | `5%` | `7.5` | `6.5` | `8.8` | **`9.0`** |
| 10 | **Engineering Complexity & Delivery Speed** | `5%` | `9.0` | `3.5` | `7.8` | **`8.4`** |
| 11 | **Regression Risk to Existing Features/Tests** | `6%` | `9.0` | `3.0` | `8.2` | **`8.8`** |
| 12 | **Compliance with `ARCHITECTURE.md` (`<500` LOC)** | `5%` | `8.5` | `4.5` | `9.0` | **`9.2`** |
| 13 | **Multi-City Scalability (`Tehran` + `Karaj` + 4 Cities)** | `4%` | `6.5` | `7.5` | `9.2` | **`9.4`** |
| 14 | **Testability (Unit + E2E Playwright Determinism)** | `3%` | `8.0` | `6.0` | `9.0` | **`9.2`** |
| 15 | **Long-Term Maintainability** | `2%` | `7.0` | `5.5` | `9.0` | **`9.1`** |
| — | **Weighted Total Score (`/ 10.00`)** | **`100%`** | **`7.27`** | **`6.64`** | **`8.75`** | **`9.24`** |

---

## 3. Sensitivity Analysis Across Three Alternative Weight Profiles

To verify that **Hybrid Option A+C** is not an artifact of weight tuning, we re-evaluate under three extreme stakeholder weight profiles:

1. **Profile 1 — Mobile-First Consumer Priority** (`Criteria 1, 2, 4, 5, 8` weighted at `70%` total):
   - Option A: `6.78` | Option B: `7.62` | Option C: `8.81` | **Hybrid A+C: `9.40`** (Winner by `+0.59`).
2. **Profile 2 — Risk-Averse Engineering Stability Priority** (`Criteria 10, 11, 12, 14, 15` weighted at `65%` total):
   - Option A: `8.55` | Option B: `4.25` | Option C: `8.48` | **Hybrid A+C: `8.91`** (Winner by `+0.36` over Option A because consolidating 4 duplicate budget modals and extracting sub-components lowers file line counts and contract drift).
3. **Profile 3 — Analytical Power-User & Trust Priority** (`Criteria 3, 5, 6, 7, 13` weighted at `70%` total):
   - Option A: `6.94` | Option B: `6.58` | Option C: `9.04` | **Hybrid A+C: `9.25`** (Winner by `+0.21`).

---

## 4. Red-Team Critique of the Selected Hybrid A+C Architecture

| Failure Mode / Challenge | How Hybrid Option A+C Could Fail | Built-in Mitigation in Blueprint (`06-proposed-design-blueprint.md`) |
| :--- | :--- | :--- |
| **RT-1: Hidden Controls Risk** | Removing the duplicate `FloatingTopBar` search/city row on `< 768px` might make users miss quick map filters (`فقط سبزها`, `مقایسه`, `پیشنهاد هوشمند`). | Retain a single `36px`-tall horizontal **Map Quick-Action Chip Strip** (`top-[68px]`) on mobile Map view while delegating City + Search + Budget Pill to `ProductGlobalHeader`. |
| **RT-2: 3-State Sheet E2E Test Breakage** | Existing E2E/smoke tests may click `button[aria-label="بررسی محله"]` or `[aria-label="باز و بسته کردن پنل محله"]` expecting immediate full expansion. | Keep `button[aria-label="بررسی محله"]` transitioning directly to `expanded` (or `peek` with all primary tabs mounted in DOM) and preserve exact `aria-label` and `data-testid` contracts. |
| **RT-3: Collapsing `Stage2MasterWidget` By Default** | Power users or tests querying `[data-testid="stage2-master-widget"]` might expect it in the DOM. | Keep `<details data-testid="stage2-details-wrapper" open={uiMode === 'pro'}>` mounted in the DOM so `data-testid` selectors remain present, while saving `680px` of scroll height in `Simple` mode. |
| **RT-4: File Size Ceiling (`< 500` lines)** | Adding pointer-drag gesture logic directly into `NeighborhoodInspectorDrawer.tsx` (currently `279` lines) could push it over the `300`-line review warning. | Extract the pure state machine and pointer gesture hook into `src/components/useBottomSheetGesture.ts` (`~95` lines) and pure math helpers into `src/utils/bottomSheetSnapMath.ts` (`~55` lines). |
