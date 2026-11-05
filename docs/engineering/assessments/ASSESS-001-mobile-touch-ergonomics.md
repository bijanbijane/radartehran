# Workstream ASSESS-001: Mobile Touch Ergonomics & Map Gestures Audit

- **Campaign**: `CAMPAIGN-PROD-01` (Usability, Ergonomics & Mobile UX Assessment)
- **Workstream ID**: `ASSESS-001`
- **Lead Role**: Member 06 — Frontend & Product Experience Engineer
- **Status**: `VERIFIED`
- **Execution Date**: 2026-11-01

---

## 1. Executive Summary & Objective

Workstream `ASSESS-001` evaluates and hardens the interaction ergonomics, gesture disambiguation, and touch performance of Radar Tehran across touchscreens and viewports `< 480px` (specifically benchmarking iPhone 12/13/14 390x844 and standard Android 360x800).

The primary objective is to eliminate gesture collision between:
1. **Leaflet Map Drag / Pinch-Zoom / Tap**: Background GIS exploration across metropolitan areas.
2. **Bottom Sheet Drawer (`NeighborhoodInspectorDrawer.tsx`)**: Upward swipe / expand / collapse states (`h-[78px]` collapsed to `h-[78vh]` expanded).
3. **Fixed Bottom Navigation Bar (`RadarBottomNav.tsx`)**: 6-tab quick navigation grid.
4. **Interactive Overlays & Quick Actions**: Drag handles, close triggers, and drawer content scrolling.

---

## 2. Audited Touch Dimensions & Findings

### 2.1. Gesture Disambiguation & Layering (`z-index` Topology)
- **Leaflet Map Canvas**: `z-0` to `z-10` with hardware-accelerated canvas (`preferCanvas: true`).
- **Floating Map Controls (Metro, Traffic, Map Style, Auto-Test)**: `z-10` / `z-20`.
- **Mobile Backdrop Scrim**: `z-20` with `bg-slate-950/35 backdrop-blur-[3px]`, `pointer-events: auto` when opened, `pointer-events: none` when closed.
- **Bottom Sheet Drawer (`NeighborhoodInspectorDrawer`)**: `z-30` with `will-change-[height,transform,box-shadow]` and cubic bezier curve `ease-[cubic-bezier(0.32,0.72,0,1)]`.
- **Bottom Navigation Bar (`RadarBottomNav`)**: `z-40` with `fixed bottom-0 inset-x-0 h-14`.

### 2.2. Touch Ergonomic Improvements Applied
1. **Drag Handle Isolation**:
   - Added `touch-none` to the top pill handle `<div className="... touch-none" role="button">` to ensure vertical swipe attempts on the handle do not scroll the underlying DOM or bubble into map pan.
   - Added keyboard trigger (`onKeyDown` handling `Enter` and `Space`) satisfying WCAG 2.2 accessible interaction standards.
2. **Drawer Scroll Chaining Protection**:
   - Added `overscroll-contain` on the drawer content wrapper `<div className="flex flex-col flex-1 overflow-y-auto overscroll-contain ...">`.
   - Prevents scroll boundary bouncing (rubber-banding on iOS WebKit) from chaining into Leaflet map panning when the user reaches the top or bottom of neighborhood analysis content.
3. **Collapsed vs Expanded Hit Targets**:
   - In collapsed state (`h-[78px]`), users retain 85% of viewport height for map panning, zoom gestures, and marker clicks.
   - Quick action button "بررسی محله" (Review Neighborhood) provides a `44px` minimum touch target with prominent call-to-action styling.
4. **Bottom Nav Tap Target Dimensions**:
   - 6 navigation items evenly spaced across grid columns (`grid grid-cols-6 h-14`), each exceeding the standard `44x44px` minimum touch target size.

---

## 3. Verification & Evidence Citations

1. **Automated Headless Browser Capture**:
   - Captured mobile viewport at 390x844 (`.playwright-cli/r3-mobile.png`).
   - Verified 0 horizontal overflow (`scrollWidth === clientWidth`).
   - Verified that bottom drawer, navigation bar, and map markers align without layout shifts.
2. **Verification Suite**:
   - `npm run lint`: PASS (0 errors)
   - `npm run arch:check`: PASS (0 errors, `NeighborhoodInspectorDrawer.tsx` remains 486 lines <= 500 lines)
   - `npm test`: PASS (24 test suites)
   - `compile_applet`: PASS
