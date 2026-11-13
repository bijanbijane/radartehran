# 07 — Accessibility & Responsive Specification (`CAMPAIGN-PROD-01`)

- **Campaign ID**: `CAMPAIGN-PROD-01`
- **Standards Referenced**: WCAG 2.2 Level AA, WAI-ARIA 1.2 Authoring Practices, Apple HIG / Material Design 3 Touch Ergonomics, and Persian RTL / Bidirectional Typographic Standards (`Vazirmatn`).

---

## 1. WCAG 2.2 Level AA Audit & Remediation Matrix

| WCAG 2.2 Criterion | Current Status in Radar Tehran | Concrete Violation / Evidence | Target Specification in Blueprint |
| :--- | :--- | :--- | :--- |
| **SC 1.4.1 Use of Color (Level A)** | **PARTIAL PASS** (Map legend uses text + color, but `BudgetFitVerdict` uses green color on `"جا نمی‌شود"`). | `BudgetFitVerdict.tsx:57` renders `"جا نمی‌شود"` in `bg-emerald-100 text-emerald-800`. | Pair every affordability status with both a distinct icon (`✓`, `⚠`, `✕`), accurate Persian label, and semantic color token (`emerald`, `amber`, `rose`). |
| **SC 1.4.3 Contrast Minimum (Level AA — `4.5:1` text, `3:1` UI)** | **PASS with minor `text-[10px] text-slate-400` warnings** | `text-slate-400` (`#94a3b8`) on `bg-slate-50` (`#f8fafc`) yields **`2.42:1`** contrast ratio in light mode (`AreaUnitToggle`, `QuickHoodRankingStrip`). | Replace `text-slate-400` in light mode with **`text-slate-600` (`#475569`, contrast `7.18:1`)** or `text-slate-500` (`#64748b`, contrast `4.61:1` on white). |
| **SC 1.4.10 Reflow (`320px` CSS width, Level AA)** | **FAIL on `ProductGlobalHeader` & `MapLegend`** | At `320×568`, `ProductGlobalHeader` clips language/unit buttons off the left edge; `MapLegend` wraps into an `84px` block leaving `132px` of map. | Move secondary display toggles (`Simple/Pro`, `m²/ft²`, `Lang`, `Currency`) into a single `44×44px` Header Display Settings Popover; collapse `MapLegend` on `<640px`. |
| **SC 2.1.1 Keyboard & SC 2.4.3 Focus Order (Level A)** | **PASS on Modals (`useModalFocusTrap`), PARTIAL on Sheet** | `OnboardingWizardModal`, `SmartSuggestModal`, and `HedonicValuationModal` implement `useModalFocusTrap`. However, when `NeighborhoodInspectorDrawer` is `collapsed` (`h-[78px] overflow-hidden`), off-screen interactive children inside `.overflow-y-auto` remain tabbable via keyboard! | Set `inert={!mobileSheetOpen || snapState === 'collapsed'}` (or `hidden` on mobile when `collapsed`) on the drawer's scrollable body so keyboard `Tab` does not get trapped in invisible off-screen cards. |
| **SC 2.5.7 Dragging Movements (Level AA — New in WCAG 2.2)** | **PASS (Currently tap-only, must remain compliant when adding drag)** | Adding touch-drag to the bottom sheet must not make dragging the *only* way to reach `peek` or `expanded`. | Provide explicit single-tap cycle behavior on the handle (`collapsed -> peek -> expanded -> collapsed`) plus dedicated `"بررسی محله"` and `"بستن"` buttons. |
| **SC 2.5.8 Target Size Minimum (`24×24px` AA) & `44×44px` Ergonomic** | **FAIL (`53` elements `< 24×24px`, `204` elements `< 44×44px`)** | `ProductGlobalHeader` & `AreaUnitToggle` buttons measure `14×18px` to `25×19px`; sheet handle is `364×20px`. | Enforce `min-h-[44px] min-w-[44px]` on all primary mobile touch controls and `min-h-[36px]` (`>= 24×24px` with `>= 8px` spacing) on dense secondary pills. |

---

## 2. Responsive Breakpoint & 9-Viewport Specification

| Viewport (`W×H`) | Breakpoint Token | Navigation Pattern | Inspector Pattern | `splitMapMode` Default | Target Unobstructed Map Height (`Map` View) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`320×568`** | `xs` (`< 360px`) | 5-col Bottom Nav (`56px` h, `64px` w/tab) | 3-State Bottom Sheet (`72px` / `38dvh` / `86dvh`) | `false` | **`>= 346px` (`60.9%`)** |
| **`360×800`** | `sm-mobile` | 5-col Bottom Nav (`56px` h, `72px` w/tab) | 3-State Bottom Sheet (`72px` / `40dvh` / `86dvh`) | `false` | **`>= 578px` (`72.3%`)** |
| **`375×812`** | `md-mobile` | 5-col Bottom Nav (`56px` h, `75px` w/tab) | 3-State Bottom Sheet (`72px` / `40dvh` / `86dvh`) | `false` | **`>= 590px` (`72.7%`)** |
| **`390×844`** | `lg-mobile` | 5-col Bottom Nav (`56px` h, `78px` w/tab) | 3-State Bottom Sheet (`72px` / `40dvh` / `86dvh`) | `false` | **`>= 622px` (`73.7%`)** |
| **`430×932`** | `xl-mobile` | 5-col Bottom Nav (`56px` h, `86px` w/tab) | 3-State Bottom Sheet (`72px` / `40dvh` / `86dvh`) | `false` | **`>= 710px` (`76.2%`)** |
| **`768×1024`** | `md` (`>= 768px`) | Top Header Nav Pills + Bottom Nav hidden or tablet dock |Docked Bottom/Right Sheet (`420px` w or `45dvh`) | `false` (toggleable) | **`>= 740px` (`72.3%`)** |
| **`1024×768`** | `lg` (`>= 1024px`) | Top Global Header (`64px`) | Right Side Drawer (`396px` w, `calc(100vh - 4rem)`) | `true` | **`638px` (`83.1%` h, `628px` w)** |
| **`1280×800`** | `xl` (`>= 1280px`) | Top Global Header (`64px`) | Right Side Drawer (`408px` w, `calc(100vh - 4rem)`) | `true` | **`670px` (`83.8%` h, `872px` w)** |
| **`1440×900`** | `2xl` (`>= 1440px`) | Top Global Header (`64px`) | Right Side Drawer (`420px` w, `calc(100vh - 4rem)`) | `true` | **`770px` (`85.6%` h, `1020px` w)** |

---

## 3. Persian RTL, Bidirectional Text & Typographic Scale Specification

### 3.1 Font Stack & Numeric Alignment
- **Primary Font**: `Vazirmatn` (`src/index.css`) with `font-feature-settings: "ss01" 1, "tnum" 1` (`font-variant-numeric: tabular-nums`) enforced on all price tables, slider readouts, and comparison badges so Persian numerals (`۰۱۲۳۴۵۶۷۸۹`) align vertically in columns.
- **Bidirectional Isolation (`unicode-bidi: isolate` / `dir="ltr"`)**:
  - Mixed Persian + Latin/Unit strings such as `"165.0M / m²"`, `"v6.4"`, `"IQR"`, or `"+1.2B"` must wrap technical/LTR tokens in `<span dir="ltr" className="inline-block font-mono tabular-nums">` or use pure Persian unit labels (`"۱۶۵ میلیون تومان / متر مربع"`, `"۱.۲ میلیارد تومان"`) to prevent RTL parenthesis inversion (`(غیرثبتی) v6.4`).
- **Minimum Font Size Guardrail**:
  - Eliminate `text-[9px]` and `text-[10px]` on primary data labels.
  - Minimum body/card copy: `13px` (`0.8125rem`, line-height `1.65`).
  - Minimum badge/caption copy: `11px` (`0.6875rem`, line-height `1.45`, font-weight `600`).

### 3.2 Reduced Motion & Safe-Area Inset Resilience
- Respect `@media (prefers-reduced-motion: reduce)` in `src/styles/tokens.css`: disable spring/cubic-bezier sheet transitions and Leaflet `flyTo` animations (`duration: 0`) when reduced motion is active.
- Preserve `env(safe-area-inset-bottom, 0px)` (`--safe-bottom`) on both `RadarBottomNav` and `NeighborhoodInspectorDrawer` bottom offsets.
