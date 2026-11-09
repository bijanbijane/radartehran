# FRONTEND_ENGINEERING_STATE.md — TEHRAN RADAR AUTONOMOUS FRONTEND TRANSFORMATION

## 1. Completed Frontend Improvements
- **Batch 1 — Global Navigation, Map Axis Bar, Homepage Interactive Discovery & Neighborhood Explorer**:
  - `src/components/navigation/ProductGlobalHeader.tsx`: Exposed `<AreaUnitToggle compact showIntlControls />` directly in the global header so desktop, tablet, and mobile users can switch Language (`FA/EN/AR/TR`), Area Unit (`m²/ft²`), and International Currency (`IRT/USD/EUR/AED`) at any time. Removed decorative pulsing badge; added active search query display and bilingual (`en`/`fa`) localization.
  - `src/components/views/ProductViewRouter.tsx`: Added inline Buy/Rent (`خرید` / `رهن/اجاره`) mode switcher in the sticky `mapAxisBar`, removed decorative pulsing dot, wired `onChangeMode={p.setMode}` to `ProductDiscoverView`, and added bilingual (`en`/`fa`) labels.
  - `src/components/views/ProductHomeView.tsx`: Replaced dead `readOnly` search box with a live interactive neighborhood search & instant filter (`homeQuery`), added clear/reset button and empty-search state, displayed both `v6.4` deal price and 80m² rent/deposit metrics on featured cards, and added bilingual (`en`/`fa`) support.
  - `src/components/views/ProductDiscoverView.tsx`: Added `♥ منتخب‌ها` (Favorites) and `شکارهای زیر قیمت` (Under-Market Bargains) filter buttons, expanded sorting (`rahn_asc`, `price_asc` v6.4 deal price), added one-click active-filter reset (`پاک کردن فیلترها ✕`), and restored Favorite (`Heart`) and Head-to-Head Compare (`ArrowLeftRight`) buttons in List view.
- **Batch 2 — Market Intelligence Provenance, Calculators Toolkit Search & User Space**:
  - `src/components/views/ProductIntelligenceView.tsx`: Added statistical provenance badge (`confidenceScore`, `validSampleCount`, `rejectedFraudCount`), live macro `marketPulse` banner, instant search input within the active market segment (`segQuery`), and bilingual (`en`/`fa`) labels.
  - `src/components/views/ProductToolsView.tsx`: Added instant calculator search (`toolQuery`), category filter tabs (`همه ابزارها (۱۳)`, `مالی و قیمت (۵)`, `حقوقی و بازدید (۴)`, `ساخت و تهاتر (۴)`), and bilingual (`en`/`fa`) headers.
  - `src/components/views/ProductUserSpaceView.tsx`: Added shortlist average livability score badge (`میانگین امتیاز`), bilingual (`en`/`fa`) labels across profile/stats/shortlist cards, and preserved full action parity.
- **Batch 3 — Neighborhood Inspector Drawer, Tabs & Mobile Navigation**:
  - `src/components/NeighborhoodInspectorDrawer.tsx`: Fixed dark-mode text contrast in the collapsed inspector bar (`dark:text-slate-200`, `dark:text-emerald-400`), upgraded the main buy price card to display Asking vs. `معامله v6.4` side-by-side with emerald highlight, and added bilingual (`en`/`fa`) labels.
  - `src/components/NeighborhoodInspectorTabs.tsx`: Added bilingual (`en`/`fa`) labels for all 6 urban livability indicators in the Scorecard tab.
  - `src/components/RadarBottomNav.tsx`: Added `aria-current="page"`, bilingual `aria-label`, and enhanced active tab contrast on mobile.
- **Batch 4 — Hedonic Valuation Suite Dark-Mode & Fast-Sale Invariant Sync + Compare Modal Provenance**:
  - `src/components/HedonicInlineWidget.tsx`: Fixed missing dark-mode surface/input/border classes (`dark:bg-slate-900`, `dark:bg-slate-800`, `dark:text-white`) and aligned the Fast Sale label (`فروش فوری نقدی (-۱۲٪)`) with the canonical `FAST_SALE_FACTOR = 0.88` domain invariant.
  - `src/components/HedonicValuationResultsColumn.tsx` & `src/components/HedonicValuationModal.tsx`: Aligned Fast Sale label (`فروش فوری نقدی (-۱۲٪)`) with `FAST_SALE_FACTOR = 0.88`.
  - `src/components/CompareModal.tsx`: Added statistical confidence & valid sample count comparison row (`ضریب اطمینان آماری و نمونه معتبر`) and explicit `v6.4` closing price label with bilingual (`en`/`fa`) support.
- **Batch 5 — Reverse Budget Finder, Smart Recommender, Decision Matrix & Secondary Modals**:
  - `src/components/modals/ReverseBudgetDiscoveryModal.tsx`: Full dark mode polish (`dark:bg-slate-900`, `dark:border-slate-800`), explicit Deal `معامله v6.4` indicator, bilingual labels & presets (`5B`, `8B`, `12B`, `20B`), and international currency formatting.
  - `src/components/SmartSuggestModal.tsx`: Full dark-mode support, bilingual tab navigation & badge labels (`Top Undervalued`, `Lowest Price`, `Clean Air & Calm`, `Commute & Metro`), and Deal `معامله v6.4` metric.
  - `src/components/ShortlistMatrixModal.tsx`: Complete dark-mode matrix table styling (`dark:bg-slate-900`, `dark:border-slate-800`, `dark:text-white`, `dark:bg-emerald-950/40`), bilingual indicators & score row labels, and `معامله v6.4` deal price parity under 210 lines.
  - `src/components/SecondaryModals.tsx`: Full dark mode for Market Pulse modal and SEO drawer, `معامله v6.4` deal estimation badge, and line count optimization under 210 lines.
  - `src/components/BuyerAlertPwaLegalModals.tsx`: Full dark-mode support across deal alert registration, PWA installation instructions, and legal disclaimer sheets with Deal `معامله v6.4` parity.
- **Batch 6 — Neighborhood Detail Cards, Trends, Onboarding & Story Sharing**:
  - `src/components/NeighborhoodPhotoGallery.tsx`: Full dark-mode overhaul for header, gallery container, thumbnail strip, and lightbox viewer (`dark:bg-slate-900`, `dark:border-slate-800`), explicit Deal `معامله v6.4` metric, and bilingual labels under 235 lines.
  - `src/components/NeighborhoodPriceTrendModal.tsx`: Full dark-mode chart and table support, explicit Deal `قطعی معامله v6.4` benchmark, bilingual tab switcher and controls, and compacted under 240 lines to pass architecture checks with 0 warnings.
  - `src/components/OnboardingWizardModal.tsx`: Dark-mode surfaces across all 3 wizard steps, sliders, and checkboxes (`dark:bg-slate-900`, `dark:border-slate-800`), Deal `معامله v6.4` metric, and bilingual step navigation under 240 lines.
  - `src/components/ShareModal.tsx`: Full dark-mode scorecard presentation, Deal `معامله v6.4` metric, `storyTotal80mMillions` & `monthlyRent80mMillions` contract adherence, and bilingual action buttons under 230 lines.

- **Batch 7 — Deep Frontend Visual & Code Audit Remediation (Viewport Clipping, Mode-Specific Median Clarity & Dark-Mode Polish)**:
  - `src/components/QuickHoodRankingStrip.tsx`: Clarified city/viewport median bar (`میانه رهن شهر` vs `میانه خرید شهر` and `رهن واحد ۸۰ متر` vs `واحد ۸۰ متر`) so Rent mode never misleads users with deposit-per-m² next to buy prices, and replaced `truncate` with `flex-wrap` so `واحد ۸۰ متر` never clips mid-word.
  - `src/components/navigation/ProductGlobalHeader.tsx` & `src/components/AreaUnitToggle.tsx`: Eliminated `1440px` desktop `<nav>` clipping on the 6th navigation tab (`فضای شخصی` / `نقشه تعاملی`) and fixed `390px` mobile header horizontal overflow so `m²/ft²`, `IRT/USD`, and `theme-toggle-btn` stay 100% visible inside the mobile viewport.
  - `src/components/views/ProductViewRouter.tsx` & `src/components/FloatingTopBar.tsx`: Hid the desktop-only `splitMapMode` width toggle on mobile screens (`hidden lg:flex`), expanded the desktop map search input (`sm:w-48 xl:w-64`), and added dark-mode hover states to GPS and Comparison Arc controls.
  - `src/components/NeighborhoodMonthlyBarChart.tsx`, `src/components/NeighborhoodPriceChart.tsx`, `src/components/views/ProductHomeView.tsx`, `src/components/views/ProductDiscoverView.tsx`, `src/components/views/ProductIntelligenceView.tsx`, `src/components/views/ProductUserSpaceView.tsx`: Refined SVG chart axis contrast (`strokeOpacity={0.35}`) and completed dark-mode hover/active states on Comparison Arc and Favorite buttons.

- **Batch 8 — Deep Blind-Spot Audit & Stage-2 / Nested Modals Dark-Mode & Mobile Overflow Remediation**:
  - `src/components/stage2/Stage2MasterWidget.tsx`, `src/components/stage2/NeighborhoodCrowdClaimsPanel.tsx`, & `src/components/stage2/SocioeconomicReferenceCard.tsx`: Remediated the Stage-2 Knowledge Graph & Socioeconomic Dossier blind spot where child panels had zero `dark:*` classes (`bg-white`, `border-slate-200`, `text-slate-900`, `bg-amber-50/40`, `bg-emerald-50/50`) when rendered inside dark-mode `NeighborhoodInspectorDrawer` and `ProductIntelligenceView`. Added complete dark-mode styling across the contributor leaderboard, claim submission form inputs/selects/textarea, street filter, `verifiedClaims` & `communityClaims` cards, MAD/Affordability/Hesitation KPI cards, and Inflow/Outflow displacement matrix.
  - `src/components/FutureSuperModulesModal.tsx` & `src/components/PortfolioModals.tsx`: Constrained long neighborhood `<select>` dropdown widths on `390px` mobile screens (`max-w-[185px] sm:max-w-[280px] truncate` and `max-w-[190px] sm:max-w-[260px] truncate`) to prevent modal header overflow, and added `dark:bg-slate-950/80` / `dark:bg-slate-900` / `dark:bg-slate-800` contrast to segmented tab controls.
  - `src/components/inspector/ResidentReviewsTab.tsx`, `src/components/SearchDropdownMenu.tsx`, `src/components/SearchHistory.tsx`, & `src/components/FeatureErrorBoundary.tsx`: Added dark-mode active pill contrast (`dark:bg-slate-900/90`, `dark:bg-slate-800 text-slate-900 dark:text-slate-100`) in Resident Reviews, dark-mode sub-neighborhood badge (`dark:bg-amber-950/60 dark:text-amber-300`) and hover states (`dark:group-hover:text-emerald-400`) in Search Dropdown/History, and dark-mode unit context badge text in `FeatureErrorBoundary`.

- **Batch 9 — Principal Frontend Architecture Audit (Focus-Trap Lifecycle, CSS Token Specificity, Map Theme Reactivity & Legend/Admin Parity)**:
  - `src/components/useDialogFocus.ts`: Decoupled the WCAG 2.1 AA focus-trap & focus-restoration `useEffect` (depending solely on `[open]`) from the `data-dialog-unit-context` attribute synchronization `useEffect` (depending on `[open, areaUnit, intlCurrency, locale]`). Eliminated the focus-hijacking bug where toggling `m²/ft²`, `IRT/USD/EUR/AED`, or `FA/EN/AR/TR` inside an open modal re-ran the focus trap, yanked focus back to the first control, and overwrote `previousFocusRef.current`.
  - `src/index.css`: Fixed `.apple-segmented-pill-active` dark-mode surface collapse (`background-color: #3a3a3c` with elevated ring shadow inside `#1c1c1e` grouped cards) and removed `!important` from `color: var(--apple-accent-blue)` so component-level semantic text classes (`text-emerald-700`, `dark:text-slate-100`) are respected; scoped `[data-apple-theme='dark'] .apple-window-sheet .bg-slate-900:not(.dark\:bg-white)` so `bg-slate-900 dark:bg-white` primary CTA buttons inside modals retain high-contrast white surfaces in dark mode; added dark-mode `::-webkit-scrollbar-thumb` visibility (`rgba(235, 235, 245, 0.28)`).
  - `src/components/MapLegend.tsx` & `src/components/useLeafletRadarMap.ts`: Added full `dark:*` active state classes (`dark:bg-emerald-950/60`, `dark:bg-amber-950/60`, `dark:bg-rose-950/60`) to `statusItems` in `MapLegend.tsx`; added a `MutationObserver` on `document.documentElement` (`class` / `data-apple-theme`) in `useLeafletRadarMap.ts` so toggling light/dark theme immediately refreshes Leaflet price pills, selection borders, and rich HTML tooltips regardless of active tile provider (`neshan`/`satellite`), and localized commute polyline distance (`کیلومتر`/`مایل`).
  - `src/components/AgencyModal.tsx`, `src/components/BudgetBridgeAdvisorCard.tsx`, `src/components/AdminOverviewAndModerationTabs.tsx`, & `src/components/AdminPanel.tsx`: Added dark-mode surface/text styling to `AgencyModal` fallback sheet and `BudgetBridgeAdvisorCard` `dealAffordableSqm` badge; added mobile horizontal scroll protection (`overflow-x-auto` + `min-w-[540px]`) to the 5-column `buyerLeads` table in `AdminOverviewAndModerationTabs.tsx` (compacted to `288` lines `<= 290`); added dark-mode severity badges in `AdminPanel.tsx`.

## 2. Files Modified
- `src/index.css`
- `src/components/useDialogFocus.ts`
- `src/components/useLeafletRadarMap.ts`
- `src/components/MapLegend.tsx`
- `src/components/AgencyModal.tsx`
- `src/components/BudgetBridgeAdvisorCard.tsx`
- `src/components/AdminOverviewAndModerationTabs.tsx`
- `src/components/AdminPanel.tsx`
- `src/components/navigation/ProductGlobalHeader.tsx`
- `src/components/AreaUnitToggle.tsx`
- `src/components/FloatingTopBar.tsx`
- `src/components/QuickHoodRankingStrip.tsx`
- `src/components/views/ProductViewRouter.tsx`
- `src/components/views/ProductHomeView.tsx`
- `src/components/views/ProductDiscoverView.tsx`
- `src/components/views/ProductIntelligenceView.tsx`
- `src/components/views/ProductToolsView.tsx`
- `src/components/views/ProductUserSpaceView.tsx`
- `src/components/NeighborhoodInspectorDrawer.tsx`
- `src/components/NeighborhoodInspectorTabs.tsx`
- `src/components/NeighborhoodMonthlyBarChart.tsx`
- `src/components/NeighborhoodPriceChart.tsx`
- `src/components/RadarBottomNav.tsx`
- `src/components/HedonicInlineWidget.tsx`
- `src/components/HedonicValuationResultsColumn.tsx`
- `src/components/HedonicValuationModal.tsx`
- `src/components/CompareModal.tsx`
- `src/components/modals/ReverseBudgetDiscoveryModal.tsx`
- `src/components/SmartSuggestModal.tsx`
- `src/components/ShortlistMatrixModal.tsx`
- `src/components/SecondaryModals.tsx`
- `src/components/BuyerAlertPwaLegalModals.tsx`
- `src/components/NeighborhoodPhotoGallery.tsx`
- `src/components/NeighborhoodPriceTrendModal.tsx`
- `src/components/OnboardingWizardModal.tsx`
- `src/components/ShareModal.tsx`
- `src/components/stage2/Stage2MasterWidget.tsx`
- `src/components/stage2/NeighborhoodCrowdClaimsPanel.tsx`
- `src/components/stage2/SocioeconomicReferenceCard.tsx`
- `src/components/FutureSuperModulesModal.tsx`
- `src/components/PortfolioModals.tsx`
- `src/components/inspector/ResidentReviewsTab.tsx`
- `src/components/SearchDropdownMenu.tsx`
- `src/components/SearchHistory.tsx`
- `src/components/FeatureErrorBoundary.tsx`
- `FRONTEND_ENGINEERING_STATE.md`

## 3. Verified Behavior
- All modified frontend modules remain strictly `<= 290` lines (`src/App.tsx` at `65` lines, tracked legacy `SearchDropdownMenu.tsx` at `295` lines) and retain `formatMillionTomanAsIntlCurrency`, `'معامله v6.4'`, and all architectural guardrail tokens.
- Zero warnings on architecture check (`npm run arch:check`: 0 errors, 0 warnings).
- Verified with `compile_applet`, `lint_applet`, `npm run arch:check`, `npm run test:contracts`, `npm run test:mutation`, `npx tsx tests/architecture-guardrails.test.ts`, `npx tsx tests/frontend-deep-debug.test.ts`, `npx tsx scripts/verify-all-views-browser.ts`, and `npm run build`.

## 4. Remaining Priorities & Next Implementation Targets
- All 9 Frontend Engineering Batches and the Principal-Level Frontend Architecture, CSS Specificity, Focus-Trap Lifecycle & Blind-Spot Audits are 100% complete and verified.

