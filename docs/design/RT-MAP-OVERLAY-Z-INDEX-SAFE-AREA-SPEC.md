# DESIGN-MAP-006 — Map Workspace Overlay, Z-Index & Safe-Area Contract

**Status:** Source audit verified; visual overlap and device behavior not runtime verified  
**Scope:** Map workspace overlays, floating controls, inspector/backdrop, mobile navigation, viewport anchoring and safe-area behavior  
**Branch:** `design/rt-map-workspace-ux-2026-11-27`

## 1. Evidence reviewed

Active-branch files:
- `src/components/RadarWorkspaceShell.tsx`
- `src/components/FloatingTopBar.tsx`
- `src/components/map/MapExplorerToolbar.tsx`
- `src/components/NeighborhoodInspectorDrawer.tsx`
- `src/components/RadarBottomNav.tsx`
- `src/index.css`

Verified source declarations:
- Workspace map surface is fixed to the viewport and offsets its top edge by `--header-height` outside the admin view.
- FloatingTopBar is fixed below the global header. In the map view it shifts horizontally to accommodate the desktop inspector. Its wrapper uses z-index 30 normally and 44 when a top-bar overlay is open.
- MapExplorerToolbar is fixed at z-index 22. Its bottom offsets differ by breakpoint: mobile uses `9.5rem + safe-area-inset-bottom`, medium screens use 5.25rem, and large screens use 1.25rem.
- NeighborhoodInspectorDrawer backdrop uses z-index 34 on mobile; the drawer uses z-index 35 on mobile and 25 on large screens.
- RadarBottomNav is fixed at the mobile viewport bottom, includes `--safe-bottom` padding, and uses z-index 43.
- RadarWorkspaceShell includes a geo-context banner at z-index 45 and an invalid-city overlay at z-index 55.
- The Leaflet container establishes its own local z-index declaration in `src/index.css`; this audit does not infer the full stacking-context tree from isolated declarations.

## 2. Problem statement

Overlay priority is encoded locally across multiple components rather than expressed as a single workspace contract. A numeric z-index comparison alone is insufficient: positioned ancestors, transforms, opacity, isolation, filters, and portal roots can create independent stacking contexts. Actual occlusion therefore requires DOM/computed-style and viewport evidence.

The current source nevertheless exposes several review targets:
- Top-bar overlays (44) can sit above the mobile bottom navigation (43), while the geo-context banner (45) can sit above both.
- The inspector backdrop (34) is below the inspector (35), as expected, but the bottom navigation (43) remains above both; verify whether that is intentional while the sheet is open.
- MapExplorerToolbar (22) is below the inspector/backdrop and navigation, but its breakpoint-specific bottom offsets are hard-coded independently from actual nav height and safe-area variables.
- FloatingTopBar desktop horizontal offset (right 384px) is a fixed assumption; verify it against the inspector's 356px width, margins, and responsive breakpoint.
- Invalid-city overlay (55) is above the other listed workspace overlays; confirm it intentionally blocks all map interactions and remains below any global application-level critical dialog if one exists.

These are source-level risks, not confirmed rendered defects.

## 3. Overlay layers: proposed semantic contract

Adopt semantic layer roles rather than allowing each component to invent numeric values. Exact numeric tokens must be reconciled with the app-wide modal/portal system before implementation.

| Semantic layer | Intended role | Required ordering |
|---|---|---|
| Map base | Leaflet canvas, tiles, markers | Lowest workspace layer |
| Map utility | Zoom, locate, viewport filter, legend | Above map; below inspector/backdrop |
| Contextual inspector backdrop | Mobile dimming surface | Above map utility; below inspector |
| Inspector surface | Neighborhood panel/sheet | Above its backdrop; below global navigation only if navigation remains intentionally interactive |
| Global mobile navigation | Primary route navigation | Above ordinary workspace surfaces; hidden/disabled where modal interaction requires |
| Floating top-bar overlay | Search suggestions, filters, tools popover | Above its trigger and ordinary workspace surfaces; must not cover modal dialogs |
| Context banners | Location/permission/status feedback | Non-modal; must not obscure critical controls or dialogs |
| Blocking workspace dialog | Invalid route/city or blocking error | Above workspace controls; below app-wide critical/system dialogs |
| App-wide modal/dialog | Authentication, destructive confirmation, critical flows | Governed by global modal/portal contract, not this workspace package |

Do not mechanically translate this table into z-index values until stacking-context roots and portal ownership are inspected.

## 4. Interaction invariants

1. A modal or blocking dialog owns interaction: background map controls and underlying floating controls must not remain keyboard- or pointer-interactive.
2. A non-modal status banner must never silently cover a primary action. If it overlaps, reposition it or reserve layout space.
3. When the inspector is open, map utilities must not be visually or interactively trapped behind its sheet unless the action is intentionally unavailable.
4. Search/filter popovers must remain attached to their trigger and fit within the visual viewport, including mobile browser chrome and safe areas.
5. Bottom navigation must remain reachable when the inspector is collapsed/peek/expanded; if the sheet intentionally overlays it, provide a documented close/navigation path and prevent ambiguous hit targets.
6. Only one blocking surface may own focus at a time. Focus must be contained for modal dialogs and restored to the invoking control on close.
7. z-index ordering must remain correct in RTL and LTR; horizontal anchoring must use logical start/end properties where feasible.
8. Overlay open/close transitions must respect reduced-motion preferences and avoid transient pointer interception after dismissal.

## 5. Safe-area and viewport anchoring requirements

- Define one shared bottom-navigation occupied-height contract, including the actual nav row, safe-area inset, and any visible border/shadow contribution.
- Position MapExplorerToolbar relative to that contract rather than duplicating fixed `9.5rem` and `5.25rem` assumptions without a documented calculation.
- Distinguish layout viewport from visual viewport when placing popovers and sheets; test mobile browser chrome expansion/collapse and keyboard appearance.
- Include `env(safe-area-inset-top)`, `env(safe-area-inset-bottom)`, and relevant horizontal insets where the device layout requires them. Avoid adding the same inset twice when `--safe-bottom` already includes it.
- Confirm that the global header height token matches the actual rendered header at each breakpoint.
- Verify landscape mobile, short-height screens, and split-screen/resized windows; vertical space must not be inferred from width breakpoints alone.

## 6. Required viewport and interaction matrix

| Scenario | Required verification |
|---|---|
| 320×568 portrait | No clipped top-bar actions; bottom controls remain reachable; inspector content scrolls |
| 360×800 portrait | Sheet/nav overlap and safe-bottom spacing |
| 390×844 portrait | Search/filter popover bounds and backdrop hit testing |
| 844×390 landscape | Short-height sheet, keyboard, and utility placement |
| Tablet portrait/landscape | Breakpoint transitions and map/inspector balance |
| Desktop ≥1024px | Inspector 356px dock, top-bar horizontal offset, toolbar separation |
| RTL and LTR | Logical anchoring, focus order, tab/popup alignment |
| Keyboard open | Visual viewport resize and popover/sheet visibility |
| Reduced motion | No disruptive overlay transitions |
| Dark/light | Backdrop contrast and status/banner legibility |

For each state capture: screenshot, viewport dimensions, active overlay set, computed z-index, nearest stacking-context ancestor, bounding rectangles, pointer hit-test target, focused element, and safe-area values.

## 7. Acceptance criteria

1. Every workspace overlay maps to a documented semantic layer role.
2. No ordinary workspace popover can cover a blocking dialog.
3. The inspector backdrop never intercepts clicks outside its intended active state.
4. Bottom navigation and inspector interaction are deterministic, with no ambiguous overlapping hit targets.
5. MapExplorerToolbar maintains a consistent gap from the actual bottom navigation across supported mobile heights and safe-area values.
6. FloatingTopBar remains within the visual viewport and does not collide with the desktop inspector.
7. Geo-context and validation banners do not obscure critical controls or dialog actions.
8. RTL/LTR, keyboard, touch, reduced-motion, light/dark and landscape behavior pass the matrix above.
9. No claim of rendered correctness is accepted from source-level z-index values alone.

## 8. QA status

| Check | Status |
|---|---|
| Source z-index/anchoring inventory | VERIFIED |
| Semantic overlay contract | DOCUMENTED — NOT RUNTIME VERIFIED |
| Stacking-context ancestry | NOT VERIFIED |
| Computed z-index and bounding boxes | BLOCKED — browser/device unavailable |
| Safe-area and visual viewport | NOT RUN |
| Pointer hit-testing/focus ownership | NOT RUN |
| Responsive screenshot matrix | BLOCKED — browser/device unavailable |

## 9. Handoff

This is a design/architecture contract, not an implementation authorization. No application code or tests were changed. Reconcile this contract with the global modal/portal architecture before choosing numeric tokens. Then run the viewport matrix alongside DESIGN-MAP-002, 004 and 005. Request explicit frontend implementation authorization only after rendered evidence and cross-component ownership are reviewed.
