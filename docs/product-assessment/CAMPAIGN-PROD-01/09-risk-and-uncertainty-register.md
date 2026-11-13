# 09 — Risk, Uncertainty & Verification Boundary Register (`CAMPAIGN-PROD-01`)

- **Campaign ID**: `CAMPAIGN-PROD-01`
- **Epistemic Discipline**: Separates empirically verified runtime facts (`Levels 1–6`) from sandbox-unavailable field metrics (`Levels 7–9`).

---

## 1. Verification Level Audit (`Levels 1–9`)

| Level | Verification Code | Definition | Status in `CAMPAIGN-PROD-01` | Evidence / Boundary Explanation |
| :---: | :--- | :--- | :--- | :--- |
| **1** | `SOURCE_REVIEWED` | Direct inspection of TypeScript/React/CSS source files. | **COMPLETED (`100%`)** | Over 45 core files in `src/`, `docs/`, and `scripts/` read and cross-checked. |
| **2** | `STATIC_ANALYZED` | Type checking (`tsc --noEmit`) & architecture boundary check (`arch:check`). | **COMPLETED (`100%`)** | `358` files scanned; `0` TS errors; `0` architecture errors. |
| **3** | `DOM_INSPECTED` | Live DOM tree, computed styles, z-index, and `scrollHeight` inspection. | **COMPLETED (`100%`)** | Measured exact `boundingClientRect`, `scrollHeight`, and orphaned class selectors in Chromium. |
| **4** | `VIEWPORT_TESTED` | Multi-viewport rendering verification across the 9-viewport matrix. | **COMPLETED (`100%`)** | Tested `320×568`, `360×800`, `375×812`, `390×844`, `430×932`, `768×1024`, `1024×768`, `1280×800`, `1440×900`. |
| **5** | `INTERACTION_TESTED` | Real browser clicks, modal triggers, URL state hydration, and city switching. | **COMPLETED (`100%`)** | Verified sheet toggle, `OnboardingWizardModal`, `reverse_budget`, `Home` chips, and `Karaj` switch via `playwright-cli`. |
| **6** | `AUTOMATED_TESTED` | Execution of automated contract, security, numeric, and build suites. | **COMPLETED (`100%`)** | `npm run test:contracts` (`10/10` passed) and `npm run build` (`vite build` succeeded). |
| **7** | `DEVICE_TESTED` | Physical capacitive touch testing on real iOS Safari (WebKit) & Android Chrome hardware. | **`UNAVAILABLE_IN_SANDBOX`** | Headless Linux Chromium emulates viewport dimensions and pointer events, but cannot replicate iOS Safari dynamic address bar (`100svh`/`100dvh`) rubber-banding or physical thumb biomechanics. |
| **8** | `USER_TESTED` | Moderated/unmoderated usability sessions with real Iranian home buyers. | **`UNAVAILABLE_IN_SANDBOX`** | Cannot recruit external human participants inside the AI Studio execution container. |
| **9** | `ANALYTICS_MEASURED` | Production telemetry (funnel drop-off, time-to-first-verdict, rage clicks). | **`UNAVAILABLE_IN_SANDBOX`** | No production user traffic stream is connected to the local sandbox environment. |

---

## 2. Technical, UX & Architectural Risk Register

| Risk ID | Category | Description of Risk | Likelihood | Impact | Mitigation Strategy |
| :--- | :--- | :--- | :---: | :---: | :--- |
| **RISK-01** | **E2E / Contract Regression** | Existing Playwright E2E or contract tests (`tests/engineering-quality-foundation.test.ts`, `tests/e2e*.ts`) may assert specific `data-testid` attributes (`inspector-price-truth`, `inspector-provenance-badge`, `stage2-master-widget`) or `aria-label` strings (`بررسی محله`, `باز و بسته کردن پنل محله`). | High | High | Preserve all existing `data-testid` and `aria-label` attributes verbatim when refactoring `NeighborhoodInspectorDrawer.tsx`, `RadarBottomNav.tsx`, and `OnboardingWizardModal.tsx`. |
| **RISK-02** | **iOS Safari Touch-Scroll vs. Sheet-Drag Conflict** | On physical iOS Safari (`WebKit`), dragging down inside an inner scrollable container (`.radar-drawer-scroll-container`) at `scrollTop === 0` can trigger native page pull-to-refresh or rubber-band bounce instead of snapping the sheet from `expanded` to `peek`. | Medium | High | Restrict direct pointer-capture dragging (`touch-action: none`) to the dedicated `44px`-tall `.radar-drawer-drag-handle` and top summary header (`Tier 1`), while keeping `overscroll-behavior-y: contain` and `touch-action: pan-y` on the scrollable body. |
| **RISK-03** | **Architecture File Size Ceiling (`< 500` lines)** | `NeighborhoodInspectorDrawer.tsx` (`279` lines), `NeighborhoodInspectorTabs.tsx` (`279` lines), and `FloatingTopBar.tsx` (`325` lines) are near the `300`-line soft review threshold enforced by `scripts/check-architecture.ts`. | High | Medium | Extract new logic into dedicated small modules: `src/utils/bottomSheetSnapMath.ts` (`~55` lines), `src/components/useBottomSheetGesture.ts` (`~95` lines), and `src/components/InspectorTier1SummaryHeader.tsx` (`~110` lines). |
| **RISK-04** | **Client Bundle Weight (`index` `678 kB`, `Stage2` `288 kB`)** | On 3G/4G mobile networks in Iran, downloading `678 kB` (`155 kB` gzip) of main bundle + `443 kB` of chart vendor chunks delays Time-to-Interactive (TTI). | Medium | Medium | Lazy-load `Stage2MasterWidget` (`React.lazy`) only when the user expands the Stage-2 `<details>` accordion or activates `Pro` mode, saving `288 kB` (`42 kB` gzip) on initial map load. |
| **RISK-05** | **Epistemic Misinterpretation of Scenario Prices** | Condensing the 3 provenance banners into a 1-line Trust Pill could risk users mistaking `estimatedDealPricePerSqm` (`v6.4`) for official Ministry of Roads & Urban Development (`کد رهگیری`) registry data if the label is ambiguous. | Low | High | Retain the explicit label `"نرخ پیشنهادی آگهی و سناریوی معامله (غیرثبتی)"` on the primary price card and keep `FORBIDDEN_DEAL_FACT_LABELS` contract test #10 passing at `100%`. |
