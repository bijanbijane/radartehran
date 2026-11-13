# 03 — `ASSESS-002`: Information Density & Neighborhood Inspector Architecture

- **Workstream ID**: `ASSESS-002`
- **Primary Focus**: Visual hierarchy, above-the-fold information architecture, card proliferation, nested tab structures (`NeighborhoodInspectorTabs` vs. `Stage2MasterWidget`), chart legibility in `390px`/`396px` containers, and progressive disclosure of multidimensional epistemic data trust.
- **Primary Inspected Files**:
  - `src/components/NeighborhoodInspectorDrawer.tsx` (279 lines)
  - `src/components/NeighborhoodInspectorTabs.tsx` (279 lines)
  - `src/components/stage2/Stage2MasterWidget.tsx` (230 lines)
  - `src/components/EpistemicMarketDisclaimer.tsx` (54 lines)
  - `src/components/BuyingPowerSummaryCard.tsx` (107 lines)
  - `src/components/BudgetBridgeAdvisorCard.tsx` (91 lines)
  - `src/components/CommuteHubsMatrixCard.tsx` (104 lines)
  - `src/components/PurchasingPowerTrendCard.tsx` (94 lines)
  - `src/components/SmartPriceForecastCard.tsx` (131 lines)
  - `src/components/NeighborhoodPriceChart.tsx` (134 lines)
  - `src/components/NeighborhoodMonthlyBarChart.tsx` (154 lines)
  - `src/utils/realMarketPriceAggregator.ts`

---

## 1. Complete Structural Anatomy of `NeighborhoodInspectorDrawer.tsx`

A top-to-bottom DOM and source trace of `NeighborhoodInspectorDrawer.tsx` reveals **18 distinct vertical blocks** rendered inside a single scrolling column (`396px` width on desktop; `100vw` on mobile):

| Order | Block / Component | Source Lines | Rendered Scope | Measured/Observed Height (`390×844`) | Hierarchy Critique |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **1** | Drag Handle (`w-12 h-1.5`) | `Drawer:69-81` | Mobile only | `20px` (overlapped by `FloatingTopBar`) | Binary tap toggle (`!mobileSheetOpen`); no drag physics. |
| **2** | Collapsed Summary Bar | `Drawer:83-105` | Mobile (`!mobileSheetOpen`) | `58px` | Good compact summary when collapsed (`78px` total), but hidden when expanded. |
| **3** | Top Utility Header Bar (`AreaUnitToggle` + Compare + Share + Close) | `Drawer:107-142` | Always visible | **`88px`** | **Severe bloat**: embeds `AreaUnitToggle` (which stacks `m²/ft²`, `فا/EN/ع/TR`, and `IRT/USD/EUR` into 3 vertical sub-rows), duplicating `ProductGlobalHeader`. |
| **4** | `منتخب من` (Shortlist Strip) | `Drawer:146-162` | When `shortlistIds.length > 0` (default has `[1, 5]`) | `~68px` | Appears above the selected neighborhood's own title, confusing users about which neighborhood they are inspecting. |
| **5** | Neighborhood Title (`h2`) + District + Status Dot + Bookmark | `Drawer:164-205` | Always visible | `~54px` | Core identity block, pushed down by Blocks 3 & 4. |
| **6** | **3 Stacked Epistemic/Provenance Alert Boxes** | `Drawer:167-187` | Always visible | **`~156px`** | Renders: (a) Status pill (`کاملاً متناسب...`), (b) Amber box `[data-testid="inspector-price-truth"]`, and (c) Slate box `[data-testid="inspector-provenance-badge"]` with multi-line disclaimers *before* showing any price! |
| **7** | `QuickHoodRankingStrip` | `Drawer:207-214` | Always visible | **`~240px`** | Renders city median banner, 2 sort/filter `<select>` dropdowns, 3 filter tabs, and a ranked list of other neighborhoods *above* the current neighborhood's price card! |
| **8** | **Primary 2-Column Price Card (Buy/m² & Rent/Rahn)** | `Drawer:217-226` | Always visible | `~92px` | **Pushed completely below the fold on `390×844` (`y > 784px`)!** |
| **9** | **5-Tab Inspector Navigation Bar** (`کارنامه`, `بازار و نمودار`, `شکارچی بارگین`, `نظرات`, `رای و تحلیل`) | `Drawer:229-239` | Always visible | `~44px` | **Pushed completely below the fold on `390×844`!** |
| **10** | `NeighborhoodInspectorTabs.tsx` Active Tab Body | `Drawer:241-250` | Tab-dependent | `~1,850px` (`scorecard`) | In `scorecard`, renders **11 stacked analytical cards** sequentially. |
| **11** | **Global Action CTA Block (6 Full-Width/Grid Buttons)** | `Drawer:246` (`Tabs:227-276`) | **All 5 Tabs** | `~148px` | Renders Divar Buy link, Divar Rent link, Hedonic Calculator button, PDF Download button, WhatsApp/Telegram share, and Price Alert input across *every* tab. |
| **12** | `SmartPriceForecastCard` | `Drawer:254` | `activeTab === 'market'` | `~310px` | **Architectural anomaly**: Rendered *below* the Global Action CTA buttons instead of inside `NeighborhoodInspectorTabs.tsx`! |
| **13** | `NeighborhoodMonthlyBarChart` | `Drawer:255` | `activeTab === 'market'` | `~290px` | Also rendered *below* Global Action CTA buttons, detached from `NeighborhoodPriceChart`. |
| **14** | `EpistemicMarketDisclaimer` | `Drawer:260` | Always visible | `~130px` | 4th full epistemic disclaimer box in the same scroll column. |
| **15** | `NeighborhoodPhotoGallery` | `Drawer:262` | Always visible | `~210px` | Street/neighborhood imagery rendered near the bottom of the drawer. |
| **16** | **`<details open>` Stage-2 Master Widget (`Stage2MasterWidget.tsx`)** | `Drawer:264-272` | **Always open on all 5 tabs** | `~680px` | Contains **4 Domain Buttons** (`هوش تصمیم‌گیری`, `کشف و زمان‌بندی`, `شفافیت و اصالت داده`, `ریسک کلان و اقلیم`) and **12 Sub-Tabs**! |
| **17** | `ExpandableComparisonTable` | `Drawer:271` | Inside `<details open>` | `~340px` | Multi-neighborhood matrix table inside the `396px` drawer. |
| **18** | `InspectorSponsorFooter` | `Drawer:274` | Always visible | `~90px` | Native sponsor CTA card at bottom. |

---

## 2. Primary Findings in `ASSESS-002`

### 2.1 Above-the-Fold Starvation on Mobile (`REPRODUCED_PROBLEM` | `VIEWPORT_TESTED`)
- **Evidence**: In `.playwright-cli/assess002-mobile-390x844-expanded-real.png` (`390×844` with `mobileSheetOpen = true`), the visible viewport of the sheet (`y: 170..784px`, `614px` net visible height beneath `FloatingTopBar`) is 100% occupied by Blocks 3, 4, 5, 6, and 7 (`AreaUnitToggle` header + `منتخب من` + Title + 3 Provenance boxes + `QuickHoodRankingStrip`).
- **Impact**: A user who taps `"بررسی محله"` to see Punak's price per square meter, total 75m² price, or livability scorecard **cannot see either the Buy/Rent price summary card (Block 8) or the 5-tab bar (Block 9) without scrolling down by more than a full screen height**.

### 2.2 Card Proliferation & Cognitive Overload in `scorecard` Tab (`CONFIRMED_PROBLEM` | `DOM_INSPECTED`)
Inside `NeighborhoodInspectorTabs.tsx` (`activeTab === 'scorecard'`, lines 55–123), **11 distinct cards** are stacked without collapsible grouping or Simple/Pro gating:
1. **Casper Value Synthesis (`ارزش‌سنجی ترکیبی کسپر`)**: Quality score (`/100`), Relative Price (`%` vs city median), Liquidity (`/100`), and 2-line synthesis badge.
2. **`BudgetBridgeAdvisorCard`**: Purchasing power coverage bar, effective budget with levers, and 3 actionable recommendations (`رهن مستأجر`, `تعدیل متراژ`, `بودجه نقدی یا وام`).
3. **4-Step Contract Payment Structurer (`ساختار پیشنهادی پرداخت در قرارداد خرید`)**: `10%` signing (`قولنامه`), `30%` handover (`تحویل کلید`), `50%` progress/checks (`طی مراحل و چک‌ها`), `10%` deed transfer (`محضر و سند`).
4. **6-Metric Livability Progress Bars**: `دسترسی مترو و حمل‌ونقل`, `مراکز خرید و خدمات`, `آرامش و بافت مسکونی`, `امنیت محله`, `فضای سبز و پارک‌ها`, `کیفیت مدارس و آموزش`.
5. **`CommuteHubsMatrixCard`**: Peak morning (`08:00`) vs. evening (`18:00`) drive & metro commute times to 5 major employment hubs (`ونک`, `مطهری`, `آزادی`, `پاسداران`, `تهرانپارس`).
6. **Traffic & Bottlenecks Card**: Morning/Evening/Seasonal congestion badges + local highway bottlenecks (`همت`, `اشرفی اصفهانی`).
7. **3-Column Pros / Cons / Budget Verdict Grid (`نقاط قوت`, `نقاط ضعف`, `وضعیت بودجه`)**.
8. **Direct Metro Access Card**.
9. **3-Tier Micro-Hoods Price Stratification (`بافت و قیمت ریزومحله‌ها`)**: Premium (`+12%`), Middle (`Base`), Affordable (`-10%`) streets.
10. **Hidden Traps & Field Realities (`دام‌های پنهان و واقعیت‌های میدانی`)**.
11. **3-Year Rent vs. Buy Wealth Verdict (`حکم نهایی خرید در برابر اجاره — افق ۳ ساله`)**.

### 2.3 Nested Tab-Within-Accordion-Within-Tab Anti-Pattern (`CONFIRMED_PROBLEM` | `DOM_INSPECTED`)
- Level 1 Navigation: 7 bottom nav tabs (`RadarBottomNav`).
- Level 2 Navigation: 5 inspector tabs (`کارنامه`, `بازار و نمودار`, `شکارچی بارگین`, `نظرات`, `رای و تحلیل`).
- Level 3 Navigation: `<details className="group pt-2 border-t..." open>` at the bottom of `NeighborhoodInspectorDrawer.tsx` (`line 264`), which defaults to `open` on every single tab!
- Level 4 Navigation: Inside `Stage2MasterWidget.tsx`, 4 domain buttons (`DECISION`, `DISCOVERY`, `TRUST`, `MACRO`) switch among **12 sub-tab pills** (`SCENARIO_MATRIX`, `RENT_VS_BUY`, `CLOSING_COSTS`, `COMMUTE_GRAVITY`, `SIMILAR_HOODS`, `TIME_TO_SELL`, `NEGOTIATION_BAND`, `EPISTEMIC_PROVENANCE`, `CROWD_CALIBRATION`, `DATA_FRESHNESS`, `MACRO_STRESS`, `CLIMATE_COMFORT`).
- **Consequence**: Users scrolling the inspector encounter **two independent tab bars** (`NeighborhoodInspectorTabs` at the top and `Stage2MasterWidget` at the bottom) with overlapping topics (e.g., `Rent vs. Buy` appears both in `scorecard` Card #11 and in Stage-2 `RENT_VS_BUY`; `Commute` appears in `scorecard` Card #5 and Stage-2 `COMMUTE_GRAVITY`; `Epistemic Provenance` appears in Block 6, Block 14, and Stage-2 `EPISTEMIC_PROVENANCE`).

### 2.4 Detached `market` Tab Charts (`CONFIRMED_PROBLEM` | `SOURCE_REVIEWED`)
- When a user selects the `بازار و نمودار` (`market`) tab (`NeighborhoodInspectorTabs.tsx:125-171`), they see the 6-month trend summary, `PurchasingPowerTrendCard`, `Realized vs Asking Spread`, and `NeighborhoodPriceChart`.
- Next, they hit the **6 Global Action CTA buttons** (`آگهی‌های خرید دیوار`, `محاسبه‌گر قیمت قطعی ملک`, etc. — `lines 227-276`), which visually signal the end of the tab content.
- Yet `SmartPriceForecastCard` and `NeighborhoodMonthlyBarChart` are mounted in `NeighborhoodInspectorDrawer.tsx` (`lines 253-257`) **after** `<NeighborhoodInspectorTabs />`, causing users to miss the 3-scenario AI/statistical forecast and monthly bar chart or perceive them as orphaned footer widgets.

---

## 3. Epistemic Data Trust & Price Provenance Evaluation

### 3.1 Strengths of the Underlying Data Layer (`PREVIOUSLY_VERIFIED` | `SOURCE_REVIEWED`)
`src/utils/realMarketPriceAggregator.ts` and `src/components/stage2/Stage2MasterWidget.tsx` implement a rigorous, transparent 3-tier provenance model:
- `OBSERVED_MARKET` (`>= 10` valid deduplicated listings after IQR outlier trimming)
- `LIMITED_OBSERVED_BLEND` (`3–9` valid listings blended with regional baseline)
- `BASELINE_MODEL_ONLY` (`< 3` valid listings; regional hedonic baseline)
- Explicit distinction between **Observed Asking Price (`نرخ پیشنهادی آگهی‌ها`)**, **Scenario Deal Estimate (`نرخ سناریوی معامله v6.4 = asking × discountFactor`)**, and **Fast-Sale Floor (`فروش فوری = 0.88×`)**.

### 3.2 UI Presentation Failure: High Repetition, Low Scannability (`CONFIRMED_PROBLEM` | `VIEWPORT_TESTED`)
Instead of a progressive 3-level disclosure (`Level 1 Badge` -> `Level 2 Popover/Expand` -> `Level 3 Full Provenance Audit`), the current UI prints raw parenthetical disclaimers (`"سناریو v6.4 (غیرثبتی)"`, `"برآورد مدل (تعدیل پیشنهادی به معامله)"`) on almost every price label while stacking two multi-line alert banners (`inspector-price-truth` + `inspector-provenance-badge`) above the fold and `EpistemicMarketDisclaimer` below the fold. This creates **banner blindness** while consuming `~286px` of prime vertical space.
