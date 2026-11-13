# 02 — `ASSESS-001`: Mobile Touch Ergonomics & Map Gesture Conflicts

- **Workstream ID**: `ASSESS-001`
- **Primary Focus**: Mobile viewport ergonomics (`< 480px` and 9-viewport matrix), Leaflet map pan/zoom vs. bottom-sheet gesture mechanics, vertical chrome compression, z-index collisions, and touch target compliance (WCAG 2.2 SC 2.5.7 & SC 2.5.8).
- **Primary Inspected Files**:
  - `src/components/NeighborhoodInspectorDrawer.tsx` (279 lines)
  - `src/components/RadarBottomNav.tsx` (131 lines)
  - `src/components/FloatingTopBar.tsx` (325 lines)
  - `src/components/navigation/ProductGlobalHeader.tsx` (274 lines)
  - `src/components/MapLegend.tsx` (71 lines)
  - `src/components/useLeafletRadarMap.ts` (373 lines)
  - `src/components/useAppUiState.ts` (128 lines)
  - `src/utils/productViewRouterShellClasses.ts` (51 lines)
  - `src/styles/tokens.css` (156 lines)

---

## 1. Anatomical Audit of the Mobile Map Viewport (`< 480px`)

### 1.1 Five-Layer Vertical Chrome Compression (`REPRODUCED_PROBLEM` | `VIEWPORT_TESTED`)

When a mobile user opens the Map view (`/?view=map`), five independent fixed/absolute UI layers simultaneously occupy the viewport:

| Layer # | Component | Positioning & Z-Index | Measured Box on `320×568` | Measured Box on `390×844` | Functional Redundancy |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **1** | `ProductGlobalHeader.tsx` | Sticky top, `z-40` | `y: 0..65px` (`65px` tall) | `y: 0..65px` (`65px` tall) | Contains Logo, City `<select>`, Search input, Reverse Budget icon, Simple/Pro, `m²/ft²`, `فا/EN/ع/TR`, `IRT`, Theme toggle. |
| **2** | `FloatingTopBar.tsx` | `fixed top-20 inset-x-0 z-40` | `y: 80..170px` (`90px` tall) | `y: 80..170px` (`90px` tall) | **Duplicates** City `<select>`, Search input, and Budget filter button directly beneath `ProductGlobalHeader`, plus a 2nd row of horizontal action pills. |
| **3** | `MapLegend.tsx` | `fixed bottom-[192px] z-20` | `y: 302..386px` (`84px` tall, wraps to 2 rows) | `y: 618..656px` (`38px` tall) | Renders 5 status dots + `"راهنمای نقشه"` button + `"پاکسازی"` button floating in the middle-lower map canvas. |
| **4** | `NeighborhoodInspectorDrawer.tsx` (Collapsed) | `fixed bottom-[calc(3.5rem+var(--safe-bottom))] z-30` | `y: 434..512px` (`78px` tall) | `y: 710..788px` (`78px` tall) | Collapsed bottom sheet (`h-[78px]`) showing drag handle, hood title, and price line. |
| **5** | `RadarBottomNav.tsx` | `fixed bottom-0 z-50` | `y: 508..568px` (`60px` tall) | `y: 784..844px` (`60px` tall) | 7-column bottom navigation bar (`grid-cols-7`). |

#### Measured Unobstructed Map Canvas Across Mobile Viewports:
- **`320×568` (iPhone SE / Small Android)**:
  - Clear vertical band between `FloatingTopBar.bottom` (`170px`) and `MapLegend.top` (`302px`): **`132px` (`23.2%` of viewport height)**.
  - Total verticalband between `FloatingTopBar.bottom` (`170px`) and `CollapsedSheet.top` (`434px`): `264px` (`46.5%`), with the `84px`-tall `MapLegend` sitting directly inside that band (`y: 302..386px`).
- **`360×800` (Standard Android)**:
  - Clear vertical band (`170px` to `574px`): **`404px` (`50.5%` of viewport height)**.
- **`375×812` (iPhone Mini / Standard iOS)**:
  - Clear vertical band (`170px` to `586px`): **`416px` (`51.2%` of viewport height)**.
- **`390×844` (Modern iOS / Android)**:
  - Clear vertical band (`170px` to `618px`): **`448px` (`53.1%` of viewport height)**.
- **`430×932` (Large Mobile)**:
  - Clear vertical band (`170px` to `706px`): **`536px` (`57.5%` of viewport height)**.

**Ergonomic Verdict**: On `320×568`, over **76% of the vertical screen is blocked or interrupted by chrome/overlays**, making 1-finger map panning and neighborhood polygon comparison severely claustrophobic. Even on `390×844`, nearly half (`47%`) of the vertical axis is occupied by non-map UI.

---

## 2. Bottom Sheet Gesture Mechanics & Orphaned CSS Tokens

### 2.1 Binary Tap-Only State Machine (`REPRODUCED_PROBLEM` | `INTERACTION_TESTED`)

In `src/components/useAppUiState.ts` (line 75) and `src/components/NeighborhoodInspectorDrawer.tsx` (lines 13–17), the mobile bottom sheet is controlled by a single boolean state:

```tsx
// src/components/NeighborhoodInspectorDrawer.tsx:13-17
const mobileHeightClass = mobileSheetOpen ? 'h-[78vh]' : 'h-[78px] overflow-hidden';
return (
  <section
    aria-label={`پنل اطلاعات و کارنامه محله ${selectedHood.name}`}
    className={`fixed inset-x-0 bottom-[calc(3.5rem+var(--safe-bottom))] z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl rounded-t-3xl shadow-[0_-10px_40px_rgba(0,0,0,0.12)] border-t border-slate-200/80 dark:border-slate-800 transition-all duration-300 flex flex-col lg:top-16 lg:bottom-0 lg:right-0 lg:left-auto lg:w-[396px] lg:h-[calc(100vh-4rem)] lg:rounded-none lg:border-t-0 lg:border-l lg:z-20 ${mobileHeightClass}`}
  >
```

And the drag handle (`lines 69–81`) is implemented as:

```tsx
<div
  role="button"
  tabIndex={0}
  aria-expanded={mobileSheetOpen}
  aria-label="باز و بسته کردن پنل محله"
  onClick={() => setMobileSheetOpen(!mobileSheetOpen)}
  onKeyDown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setMobileSheetOpen(!mobileSheetOpen);
    }
  }}
  className="lg:hidden w-full pt-2.5 pb-1 flex flex-col items-center justify-center cursor-pointer active: scale-95 transition-transform shrink-0 touch-none"
>
  <div className="w-12 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full" />
</div>
```

**Critical Ergonomic Consequences**:
1. **Dead Drag Gesture**: The visual pill (`w-12 h-1.5 rounded-full`) universally signals a draggable sheet to mobile users. Because `touch-none` (`touch-action: none`) is applied without any `onPointerDown`, `onPointerMove`, `onPointerUp`, or `onTouchStart`/`onTouchMove` handlers, **dragging the handle up or down produces zero visual movement**—the browser suppresses scrolling while React ignores pointer movement until a discrete `click` fires.
2. **Missing Intermediate `Peek` State (`~38dvh`)**: The sheet jumps directly from `78px` (where only the title and 1-line price are visible) to `78vh` (where the map is completely covered and `FloatingTopBar` collides with the sheet top). Users cannot inspect a neighborhood's core Buy/Rent price, budget fit, and 4 key scores while keeping the neighborhood's map polygon and adjacent neighborhoods in view.
3. **Scroll-to-Dismiss Conflict**: Inside `.overflow-y-auto overscroll-contain` (`line 144`), when a user scrolls back to `scrollTop === 0` and continues pulling downward, the sheet cannot transition smoothly back to `peek` or `collapsed`; the user must reach to the top of the `78vh` sheet (`y ≈ 130px`, inside the hard-to-reach top zone of the screen) and tap the `20px`-tall drag handle or `بستن` button.

### 2.2 Orphaned CSS Ergonomic Tokens in `src/styles/tokens.css` (`CONFIRMED_PROBLEM` | `STATIC_ANALYZED` + `DOM_INSPECTED`)

Inspection of `src/styles/tokens.css` (lines 62–84) reveals that ergonomic classes were previously authored specifically to solve mobile drawer scrolling, gesture isolation, and landscape height overflow:

```css
/* src/styles/tokens.css:62-84 */
.radar-drawer-scroll-container {
  overscroll-behavior-y: contain;
  -webkit-overflow-scrolling: touch;
  touch-action: pan-y;
}

.radar-drawer-drag-handle {
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
}

@media (max-height: 480px) and (orientation: landscape) {
  .radar-drawer-scroll-container {
    max-height: 55dvh;
  }
}
```

However, a full codebase search (`grep -rn "radar-drawer-" src/`) and live DOM check (`!!sec.querySelector('.radar-drawer-scroll-container') === false`) confirm that **neither `.radar-drawer-scroll-container` nor `.radar-drawer-drag-handle` is applied anywhere in `src/`**. As a result, the `@media (max-height: 480px) and (orientation: landscape)` rule is dead code.

---

## 3. Z-Index & Visual Collisions on Mobile Viewports (`REPRODUCED_PROBLEM` | `VIEWPORT_TESTED`)

### 3.1 Collision A — `FloatingTopBar` (`z-40`) Overlaps Expanded `NeighborhoodInspectorDrawer` (`z-30`)
- On `390×844`, when `mobileSheetOpen === true`:
  - `NeighborhoodInspectorDrawer` has `h-[78vh]` (`658px` height), anchored at `bottom: 56px` (`y: 130px..788px`), with **`z-30`**.
  - `FloatingTopBar` is positioned at `top-20` (`y: 80px..170px`), with **`z-40`**.
  - **Result**: `FloatingTopBar` renders **on top of the upper `40px` (`y: 130px..170px`) of the expanded bottom sheet**, obscuring the drag handle (`y: 130..150px`) and colliding with the sheet's top action bar (see `.playwright-cli/assess002-mobile-390x844-expanded-real.png`).

### 3.2 Collision B — `DevDiagnosticsHud` Overlaps Collapsed `NeighborhoodInspectorDrawer`
- On all viewports `< 1024px`, `complementary "داشبورد پایش پرفورمنس توسعه"` (`⚡ Perf: نقشه | FPS: 60...`) renders at `y: 746..780px` (`x: 12..341px` on `390×844`) directly over the collapsed `NeighborhoodInspectorDrawer` (`y: 710..788px`), covering the `"بررسی محله"` button and price summary line (see `.playwright-cli/assess001-mobile-390x844-collapsed.png` and `.playwright-cli/assess001-mobile-320x568-map.png`).

### 3.3 Collision C — `ProductGlobalHeader` Left-Edge Horizontal Overflow & Clipping
- On `320px`, `360px`, `375px`, and `390px` viewports, `ProductGlobalHeader` packs too many horizontal items into a single `64px` row (`Logo` + `City Select` + `Search Input` + `Reverse Budget Icon` + `Simple/Pro` + `m²/ft²` + `فا/EN/ع/TR` + `IRT` + `Theme Toggle`).
- On `390×844`, the `فا` button is clipped at the left edge (`x ≈ 0..15px`), and on `320×568`, the entire language/unit toggle cluster overflows off-screen.

---

## 4. Secondary Views Split-Map Mobile Sliver (`REPRODUCED_PROBLEM` | `VIEWPORT_TESTED`)

In `src/utils/productViewRouterShellClasses.ts` (lines 34–49):

```ts
const mobileOffsetClasses = !splitMapMode
  ? 'mt-0 h-full rounded-none border-t-0 shadow-none'
  : homeContentFirst
    ? 'mt-0 h-full rounded-none border-t-0 shadow-none'
    : 'mt-[136px] h-[calc(100%-136px)] rounded-t-3xl border-t shadow-[0_-12px_36px_rgba(15,23,42,0.16)]';
```

Because `splitMapMode` initializes to `true` in `useAppUiState.ts` (`line 86`), whenever a mobile user navigates to **`کشف محله` (`discover`)**, **`نبض بازار` (`intelligence`)**, **`ابزارها` (`tools`)**, or **`فضای من` (`userspace`)**, the content container is pushed down by `mt-[136px]`. Since `ProductGlobalHeader` covers `y: 0..65px`, only a **`71px` tall sliver of the map (`y: 65..136px`)** is visible at the top of the screen (see `.playwright-cli/assess003-wizard-step1-verified.png`). This `71px` strip is too narrow to pan or read map pins, yet steals `136px` of vertical reading height from analytical views.

---

## 5. Touch Target Audit (WCAG 2.2 SC 2.5.8 AA `24×24px` & Mobile Ergonomic `44×44px`)

Automated DOM geometry measurement across all `239` visible interactive elements on `390×844` revealed:
- **`53` interactive elements (`22.2%`) violate WCAG 2.2 SC 2.5.8 Level AA (`< 24×24px`)**.
- **`204` interactive elements (`85.4%`) fall below the `44×44px` mobile ergonomic standard (Apple HIG / Material 3)**.

| Element / Control | Component | Measured Size (`390×844`) | WCAG 2.2 AA (`>=24px`) | Ergonomic (`>=44px`) |
| :--- | :--- | :--- | :--- | :--- |
| Language buttons (`فا`, `EN`, `ع`, `TR`) | `ProductGlobalHeader` / `AreaUnitToggle` | `14×18px` to `20×18px` | **FAIL** | **FAIL** |
| Area unit buttons (`m²`, `ft²`) | `ProductGlobalHeader` / `AreaUnitToggle` | `25×19px`, `23×19px` | **FAIL** | **FAIL** |
| Mode toggle (`Simple`, `Pro`) | `ProductGlobalHeader` | `44×19px`, `28×19px` | **FAIL (`19px` h)** | **FAIL** |
| Currency `<select>` (`IRT`) | `ProductGlobalHeader` / `AreaUnitToggle` | `52×23px` | **FAIL (`23px` h)** | **FAIL** |
| Bottom Sheet Drag Handle | `NeighborhoodInspectorDrawer` | `364×20px` | **FAIL (`20px` h)** | **FAIL** |
| Map Legend `"راهنمای نقشه"` / `"پاکسازی"` | `MapLegend` | `84×25px`, `44×25px` | PASS (`25px` h) | **FAIL (`25px` h)** |
| Header Reverse Budget / Theme icons | `ProductGlobalHeader` | `32×32px` | PASS | **FAIL (`32px`)** |
| FloatingTopBar pill buttons | `FloatingTopBar` | `57..110×26px` | PASS (`26px` h) | **FAIL (`26px` h)** |
| Bottom Navigation Tabs (7 cols) | `RadarBottomNav` | `55.7×59px` (`45.7×59px` on `320px`) | PASS | Narrow width on `320px` (text wraps) |
| Leaflet Zoom `+` / `-` buttons | `useLeafletRadarMap` / Leaflet | `30×30px` | PASS | **FAIL (`30px`)** |
