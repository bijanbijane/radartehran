# 06 — Proposed Design Blueprint (`CAMPAIGN-PROD-01`)

- **Campaign ID**: `CAMPAIGN-PROD-01`
- **Selected Architecture**: **Hybrid Option A+C — Spatial-First Progressive Disclosure & Unified Purchasing Power Engine**
- **Architectural Guardrails**:
  - Every new or modified file `< 300` lines (hard ceiling `< 500` lines per `ARCHITECTURE.md`).
  - Strict unidirectional dependency flow: `src/App.tsx` -> `src/components/*` -> `src/data/*` -> `src/utils/*` -> `src/types/*`.
  - Zero changes to `src/data/hedonicPricingEngine.ts` (`FAST_SALE_FACTOR = 0.88`).

---

## 1. Unified Mobile Chrome & Viewport Allocation (`ASSESS-001` Blueprint)

### 1.1 Eliminating Top-Chrome Duplication on Mobile (`< 768px`)
Currently, `ProductGlobalHeader` (`65px`) and `FloatingTopBar` (`90px`) render two stacked City selectors, two Search inputs, and two Budget triggers (`155px` total top chrome).

**Target Mobile Header & Map Chrome Specification**:
1. **`ProductGlobalHeader.tsx` (`56px` height on `< 768px`, `z-40`)**:
   - **Right**: Compact Radar Logo (`36×36px`) + City Selector `<select>` (`min-h-[44px] px-2.5 text-xs font-bold`).
   - **Center**: Global Neighborhood Search Trigger / Input (`min-h-[44px] flex-1`).
   - **Left**: Active Budget Summary Pill (`"خرید: ۳.۵B · ۷۵متر"`, `min-h-[44px]`, opens Unified Budget Modal) + Display Settings Button (`⚙️`, `44×44px`, opens a clean popover containing `Simple/Pro`, `m²/ft²`, `فا/EN/ع/TR`, `IRT/USD`, and `Light/Dark`—eliminating left-edge clipping on `320px–390px`!).
2. **`FloatingTopBar.tsx` on Mobile Map View (`38px` single chip strip at `top-[60px]`, `z-20`)**:
   - Hide the duplicate Row 1 (City/Search/Budget inputs) on `< 768px` (`hidden md:flex`).
   - Render only Row 2 as a single horizontal scrollable chip strip (`h-[38px]`): `[فقط سبزها (۵)]`, `[پیشنهاد هوشمند]`, `[مقایسه (۲)]`, `[راهنمای نقشه]`.
   - Change `z-40` to **`z-20`** on `< 1024px` so an expanded bottom sheet (`z-30`) cleanly covers the floating map chips instead of colliding with them.
3. **`MapLegend.tsx` Consolidation**:
   - On `< 640px`, integrate the 4 color dots (`سبز`, `زرد`, `قرمز`, `پیشنهادی`) into a compact `32px` floating pill at `bottom-[136px] right-3` (`z-20`) that automatically hides when the bottom sheet is in `peek` or `expanded` state.
4. **Secondary Views (`discover`, `intelligence`, `tools`, `userspace`)**:
   - In `resolveProductViewRouterShellClasses.ts`, set mobile offset to `mt-0 h-full` unless the user explicitly toggles `"نمایش نقشه همراه"` (`splitMapMode` defaults to `false` on `< 1024px`), reclaiming `136px` of vertical screen height.

#### Target Unobstructed Map Canvas Gain:
- **`320×568`**: Increases from `132px` (`23.2%`) to **`346px` (`60.9%`)** (`+162%` increase in clear map height).
- **`390×844`**: Increases from `448px` (`53.1%`) to **`622px` (`73.7%`)**.

---

## 2. Three-State Bottom Sheet Gesture & Snap-Point State Machine (`ASSESS-001` Blueprint)

### 2.1 Pure Snap-Point Math Module (`src/utils/bottomSheetSnapMath.ts` — New Pure Module, `~55` lines)
Define a deterministic 3-state model testable via `node:test`:

```ts
export type BottomSheetSnapState = 'collapsed' | 'peek' | 'expanded';

export interface BottomSheetSnapConfig {
  viewportHeight: number;
  bottomNavHeight: number; // 56px
  collapsedHeight: number; // 72px
  peekRatio: number;       // 0.40 (40dvh)
  expandedRatio: number;   // 0.86 (86dvh)
}

export function resolveSheetSnapHeightPx(
  state: BottomSheetSnapState,
  config: BottomSheetSnapConfig
): number {
  const available = Math.max(240, config.viewportHeight - config.bottomNavHeight);
  if (state === 'collapsed') return config.collapsedHeight;
  if (state === 'peek') return Math.round(Math.min(available * 0.65, config.viewportHeight * config.peekRatio));
  return Math.round(Math.min(available - 12, config.viewportHeight * config.expandedRatio));
}

export function computeNextSnapStateFromGesture(params: {
  currentState: BottomSheetSnapState;
  deltaY: number;        // positive = dragging down, negative = dragging up
  velocityY: number;     // px/ms
}): BottomSheetSnapState {
  const { currentState, deltaY, velocityY } = params;
  const FLICK_VELOCITY = 0.45;
  const DRAG_THRESHOLD = 48;

  if (velocityY < -FLICK_VELOCITY || deltaY < -DRAG_THRESHOLD) {
    return currentState === 'collapsed' ? 'peek' : 'expanded';
  }
  if (velocityY > FLICK_VELOCITY || deltaY > DRAG_THRESHOLD) {
    return currentState === 'expanded' ? 'peek' : 'collapsed';
  }
  return currentState;
}
```

### 2.2 Gesture Isolation & WCAG 2.5.7 Single-Tap Alternatives (`src/components/useBottomSheetGesture.ts`)
- Apply `.radar-drawer-drag-handle` (`min-h-[44px]` hit zone) to the sheet header/handle and `.radar-drawer-scroll-container` to the inner scroll body (re-activating the orphaned rules in `src/styles/tokens.css`).
- **Pointer Capture**: Attach `onPointerDown`, `onPointerMove`, `onPointerUp`, and `onPointerCancel` on the drag handle header (`touch-action: none`).
- **Scroll-Handoff Rule**: Inside `.radar-drawer-scroll-container`, native vertical scrolling (`touch-action: pan-y`) is active when `snapState === 'expanded'`. If `scrollTop === 0` and the user pulls downward (`deltaY > 56px`), transition smoothly from `expanded` -> `peek`.
- **WCAG 2.2 SC 2.5.7 Dragging Movements Compliance**: Every snap transition is also executable via single-tap buttons (`"بررسی محله"` -> `peek`/`expanded`, handle tap cycles `collapsed -> peek -> expanded -> collapsed`, and `"بستن"` -> `collapsed`).

---

## 3. Bottom Navigation Consolidation (`RadarBottomNav.tsx` Blueprint)

Replace `grid-cols-7` (`45.7px` per tab on `320px`) with a **5-column (`grid-cols-5`) ergonomic bar** (`min-h-[56px]`, each button `>= 64px` wide on `320px` and `78px` wide on `390px`):
1. **`خانه` (`home`)** — Decision overview & personalized verdict
2. **`نقشه` (`map`)** — Interactive spatial radar
3. **`کشف محله` (`discover`)** — Ranked neighborhood explorer & comparison
4. **`نبض بازار` (`intelligence`)** — Macro market trends & heatmaps
5. **`بیشتر` (`more`)** — Opens a clean bottom action sheet containing `ابزارها و ماشین‌حساب‌ها` (`tools`), `فضای من و ذخیره‌ها` (`userspace`), `مقایسه محله‌ها`, and `تنظیمات نمایش`.

---

## 4. Three-Tier Neighborhood Inspector Architecture (`ASSESS-002` Blueprint)

```
+-------------------------------------------------------------------+
| [==== دستگیره کشویی ۴۴px (Collapsed 72px / Peek 40dvh / 86dvh) ====] |
| پونک (منطقه ۵)                         [ذخیره] [مقایسه] [اشتراک] [✕] |
| [اعتماد داده: ۷۸٪ · نمونه بازار: ۲۴ آگهی · سناریو معامله ⓘ]         |
| +-------------------------------+-------------------------------+ |
| | میانگین خرید هر متر (تومان)   | میانگین رهن کامل (تومان)      | |
| | ۱۶۵.۰ میلیون (۱۲.۳۷B / ۷۵متر) | ۲,۱۵۰ میلیون                  | |
| +-------------------------------+-------------------------------+ |
| [وضعیت بودجه ۳.۵B شما: نیازمند اهرم یا تغییر به کرج/حومه — مشاهده پل] |
| [ ۱. کارنامه ] [ ۲. بازار و روند ] [ ۳. شکارچی ] [ ۴. دیدگاه و میدان ] |
+-------------------------------------------------------------------+
| (محتوای اسکرول‌پذیر تب فعال - حداکثر ۴ کارت کلیدی در حالت Simple)   |
| - کارت ۱: ارزش‌سنجی ترکیبی کسپر و تطبیق بودجه (BudgetBridge)        |
| - کارت ۲: شاخص‌های ۶گانه کیفیت زندگی (Livability Bars)              |
| - کارت ۳: ماتریس ترافیک و دسترسی به قطب‌های شغلی                   |
| - کارت ۴: نقاط قوت، ضعف و واقعیت‌های میدانی محله                   |
| [ + نمایش جزئیات پیشرفته: ریزومحله‌ها، ساختار قرارداد و مقایسه شهر ] |
| [ آگهی‌های دیوار ] [ محاسبه‌گر قطعی هدانیک ] [ دانلود کارنامه PDF ]  |
| [ ▸ باز کردن تحلیل‌های سطح ۲ کسپر (۱۲ ماژول تخصصی Pro) - بسته پیش‌فرض] |
+-------------------------------------------------------------------+
```

### Key Structural Changes in `NeighborhoodInspectorDrawer.tsx` & `NeighborhoodInspectorTabs.tsx`:
1. **Remove `AreaUnitToggle` from Drawer Header**: Global unit/language/currency controls live in `ProductGlobalHeader`'s settings popover, reducing drawer header height from `88px` to **`44px`**.
2. **Collapse 3 Epistemic Banners into 1 Interactive Epistemic Trust Pill (`32px`)**:
   - Above the price card, render a single high-contrast pill (`data-testid="inspector-provenance-badge"` + `data-testid="inspector-price-truth"`):
     `اعتماد داده: ۷۸٪ (مشاهده‌شده در بازار) · نرخ آگهی و سناریوی معامله v6.4 [ⓘ جزئیات اصالت داده]`.
   - Tapping `[ⓘ جزئیات اصالت داده]` expands the full 5-layer provenance breakdown inline.
3. **Relocate `QuickHoodRankingStrip` & `منتخب من` Below the Price & Tab Header**:
   - guarantees that on `390×844` in both `peek` (`40dvh`) and `expanded` (`86dvh`) states, **the Neighborhood Title, Epistemic Trust Pill, 2-Column Buy/Rent Price Card, and Tab Bar are 100% visible above the fold**.
4. **Move `SmartPriceForecastCard` and `NeighborhoodMonthlyBarChart` Inside `market` Tab Above Global CTAs**:
   - Fixes Finding `F-009` so all market charts sit contiguously inside `activeTab === 'market'`.
5. **Default `Stage2MasterWidget` `<details>` to `open={uiMode === 'pro'}`**:
   - In `Simple` mode (default), `<details>` is collapsed by default, reducing initial scroll height by `~1,020px` while keeping all elements accessible with 1 tap.

---

## 5. Unified First-Time Buyer Onboarding & Cross-City Bridge (`ASSESS-003` Blueprint)

### 5.1 First-Visit Auto-Hydration & Realistic Defaults
- In `useAppUiState.ts`, read `localStorage.getItem('tehran_radar_onboarded_v1')` on initial mount (when no explicit URL query parameters `?mode=...&buy=...` are present). If not onboarded, show a non-blocking **First-Time Buyer Quick-Start Banner / Wizard Prompt** on `Home`/`Map`.
- Change default `buyTotalBudget` from `24500` (`24.5B`) to **`6500` (`6.5B` Toman)** and provide 1-tap entry-level presets starting at **`2.5B` and `3.5B` Toman** (`[2500, 3500, 5000, 8000, 12000, 20000]`).

### 5.2 Unifying the Four Budget Modals into One Canonical Component
- Route both `ProductGlobalHeader`'s `"محاسبه با بودجه معکوس"` button and `ProductHomeView`/`ProductDiscoverView`'s `"با بودجه من کجا؟"` button to the unified `OnboardingWizardModal` (with a toggle between `"حالت سریع ۱صفحه‌ای"` and `"راهنمای گام‌به‌گام ۳مرحله‌ای"`).
- Ensure **Loan Booster (`+1.2B`)**, **Tenant Rahn Booster (`+15%`)**, **Building Age Segment (`نوساز / میان‌سال / قدیمی‌ساز`)**, and **City Selector (`تهران / کرج / مشهد / اصفهان / شیراز / تبریز`)** are present in both modes.

### 5.3 Cross-City Affordability Bridge (`پل هوشمند مقایسه تهران و کرج/حومه`)
When `mode === 'buy'` and `evaluatedNeighborhoods` finds `0` central city matches (e.g., `buyTotalBudget = 3500`, `targetSqm = 75` in `Tehran`), render an actionable **Affordability Bridge Card** inside the wizard and `BudgetFitVerdict.tsx`:
- **Option 1 (In-Province Satellite/County Match)**: `"۵ محدوده در استان تهران (پرند: ۳.۱۵B، پیشوا: ۳.۴۵B، رباط‌کریم، پاکدشت) با بودجه نقدی ۳.۵ میلیارد شما همخوانی دارند [مشاهده روی نقشه]"`
- **Option 2 (Financial + Age Levers in Tehran)**: `"با فعال‌سازی وام مسکن (+۱.۲B)، رهن مستأجر و انتخاب بنای قدیمی‌ساز، قدرت خرید شما به ۵.۴۵ میلیارد می‌رسد (۱۲ محله جنوب و غرب تهران) [اعمال اهرم‌ها]"`
- **Option 3 (1-Tap Karaj Cross-City Switch)**: `"در شهر کرج، همین امروز ۷ محله (۳ محله کاملاً سبز و ۴ محله لب‌مرز) با بودجه ۳.۵ میلیارد برای ۷۵ متر در دسترس است [تغییر به نقشه کرج]"`

### 5.4 Fixing `BudgetFitVerdict.tsx` Semantic Color & Scope Bug
- Replace the hardcoded `bg-emerald-100 text-emerald-800` on `line 57` of `src/components/listing/BudgetFitVerdict.tsx` with semantic status tokens:
  - `fitStatus === 'affordable'` (`مناسب بودجه`): `bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300`
  - `fitStatus === 'stretch'` (`نیازمند اهرم / لب‌مرز`): `bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300`
  - `fitStatus === 'unaffordable'` (`جا نمی‌شود`): `bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300`
- Pass the full `evaluatedNeighborhoods` list into `buildBudgetFitVerdict` so affordable county/peripheral neighborhoods (`پرند`, `پیشوا`, etc.) are surfaced first instead of showing only 3 unaffordable central neighborhoods.
