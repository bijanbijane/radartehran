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

## 2. Files Modified
- `src/components/navigation/ProductGlobalHeader.tsx`
- `src/components/views/ProductViewRouter.tsx`
- `src/components/views/ProductHomeView.tsx`
- `src/components/views/ProductDiscoverView.tsx`
- `src/components/views/ProductIntelligenceView.tsx`
- `src/components/views/ProductToolsView.tsx`
- `src/components/views/ProductUserSpaceView.tsx`
- `src/components/NeighborhoodInspectorDrawer.tsx`
- `src/components/NeighborhoodInspectorTabs.tsx`
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
- `FRONTEND_ENGINEERING_STATE.md`

## 3. Verified Behavior
- All 23 modified frontend modules remain strictly `<= 290` lines and retain `formatMillionTomanAsIntlCurrency`, `'معامله v6.4'`, and all architectural guardrail tokens.
- Zero warnings on architecture check (`npm run arch:check`: 262 implementation files scanned, 0 errors, 0 warnings).
- Verified with `compile_applet`, `lint_applet`, `npm run arch:check`, `npm run test:contracts` (8/8), `npm run test:mutation` (10/10 killed), `npx tsx tests/architecture-guardrails.test.ts` (12/12 passed), and `npm run build` (vite production bundle succeeded in 2.16s).

## 4. Remaining Priorities & Next Implementation Targets
1. **Batch 7 (Inspector Tabs & Specialized Analytics Cards)**:
   - Refactor `src/components/NeighborhoodMonthlyBarChart.tsx` and `src/components/NeighborhoodPriceChart.tsx` for responsive dark-mode SVG rendering and bilingual tooltips.
   - Refactor `src/components/ExpandableComparisonTable.tsx` for enhanced dark mode table styling and zero-pill discipline.
