# DESIGN-MAP-004 — Unified Map Panel State Architecture

- **Product:** Radar Tehran
- **Package:** `DESIGN-MAP-004`
- **Date:** 2026-11-27
- **Branch:** `design/rt-map-workspace-ux-2026-11-27`
- **Status:** `ARCHITECTURE_GAP_VERIFIED — IMPLEMENTATION_NOT_AUTHORIZED`
- **Scope:** State ownership, panel coordination, and acceptance-test handoff. No application source changes.

## 1. Executive finding

The repository contains a pure panel coordinator with unit tests, and a separate bottom-sheet snap utility with unit tests. The current workspace and inspector do not use these as one canonical state model. Instead, panel visibility, sheet detent, and overlay exclusivity are split across independent React state and imperative callbacks.

This is a verified integration gap, not proof that every user flow currently fails. Runtime collision and focus behavior remain unverified without a connected browser.

## 2. Verified source evidence

| Source | Evidence |
|---|---|
| `src/components/map/mapSheetCoordinator.ts` | Defines `MapWorkspacePanelState`, `MobileMapSheetId`, `DesktopMapPanelMode`, and `reduceMapPanelState`. Mobile sheet IDs include none/list/inspector/filter/tools/legend. |
| `src/components/map/mapSheetCoordinator.test.ts` | Tests mobile single-sheet mutual exclusion and desktop list/inspector/collapsed transitions. |
| `src/components/RadarWorkspaceShell.tsx` | Imports `createInitialMapPanelState` and uses it only to initialize `desktopMapPanelMode`. Mobile list, split-map state, inspector visibility, and floating panels are maintained separately. No reducer/state transition integration is present in the inspected shell source. |
| `src/components/NeighborhoodInspectorDrawer.tsx` | Maintains local `snapMode: 'peek' | 'expanded'`; derives collapsed from external `mobileSheetOpen === false`; uses 50dvh/84dvh classes. Gesture completion uses the pure gesture helper, but the sheet's height is not derived from the pure snap-height utility. |
| `src/utils/productViewRouterShellClasses.ts` | Defines canonical three-state type, default geometry 78px/40%/86%, snap-height calculation, gesture transition, and sequential cycle helper. |
| `tests/bottom-sheet-snap-math.test.ts` | Verifies geometry and all three logical snap states, but does not prove the React component uses those computed heights. |
| `docs/product-assessment/CAMPAIGN-PROD-01/08-acceptance-test-plan.md` | D2 requires three deterministic states, 72px collapsed height, ~40dvh peek, ~86dvh expanded, tap and pointer transitions, and no FloatingTopBar overlap. |

## 3. State fragmentation map

Current ownership is effectively distributed as follows:

| Concern | Current owner | Architectural risk |
|---|---|---|
| Desktop list/inspector/collapsed mode | `desktopMapPanelMode` in RadarWorkspaceShell | Separate from coordinator reducer's desktop state transitions |
| Mobile list visibility | `mobileMapListOpen` in RadarWorkspaceShell | Independent boolean can diverge from inspector/filter/tools state |
| Mobile inspector visibility | `ui.mobileSheetOpen` in app UI state | Separate from list and floating overlay states |
| Inspector peek/expanded detent | `snapMode` local to NeighborhoodInspectorDrawer | Detent cannot be authoritatively read or transitioned by shell |
| Filter/tools/legend/search | Separate booleans in app UI state | Mutual exclusion depends on imperative close helpers and caller discipline |
| Pure coordinator model | `mapSheetCoordinator.ts` | Has tests, but is not the canonical runtime source |
| Sheet geometry and gesture math | `productViewRouterShellClasses.ts` | Geometry helper is not reflected by current component CSS heights |

## 4. Target architecture

Use one canonical workspace panel state owned by RadarWorkspaceShell (or a dedicated reducer hook), with a typed state shape:

- Desktop: `list | inspector | collapsed`.
- Mobile: `none | list | inspector | filter | tools | legend`.
- Inspector detent while active: `peek | expanded`; when inactive, detent is retained or reset by an explicit documented policy.
- Search may remain a transient top-chrome popover only if it is included in the same exclusion contract; otherwise document its separate overlay layer and focus policy.
- Spatial measure is an interaction mode, not a sheet. It must close conflicting panels and remain coordinated through the shell's existing handler.

All state transitions must pass through typed actions. Components receive state and dispatch callbacks; they must not maintain competing visibility/detent copies.

## 5. Required transition contract

| Event | Mobile result | Desktop result |
|---|---|---|
| Open list | `list` | `list` |
| Open inspector | `inspector + peek` (or documented default detent) | `inspector` |
| Open filter/tools/legend | Corresponding single active sheet | Existing desktop behavior explicitly defined; no hidden mobile-only assumptions |
| Select neighborhood on map | Close sheet; inspector may remain collapsed/closed by product decision | Open inspector |
| Select neighborhood from list | Close list; open inspector only if intended by product flow | Open/retain list or inspector per documented transition |
| Collapse inspector | `none` | `collapsed` |
| Expand inspector | `inspector + expanded` | No mobile detent |
| Escape/backdrop close | `none`, restore focus to invoker | Close/collapse current overlay per desktop policy |
| Viewport breakpoint crossing | Deterministic state migration; never two panels visible | Deterministic state migration; preserve selected neighborhood |

## 6. Geometry contract

The current values conflict across three sources:
- Utility/tests: collapsed 78px, peek 40% viewport, expanded 86%.
- Acceptance plan: collapsed 72px, peek ~40dvh, expanded ~86dvh.
- Component CSS: hidden collapsed, 50dvh peek, 84dvh expanded.

Do not choose a final collapsed pixel height from source inspection alone. Reconcile bottom navigation, safe-area inset, viewport height, and usable map area in browser captures. Then update one canonical geometry configuration and test the actual component against it.

The target handle must have a minimum 44x44px interactive region, independently of the visible grip dimensions.

## 7. Implementation and regression acceptance

- [ ] `reduceMapPanelState` (or its successor) is the sole authority for panel visibility and mutual exclusion.
- [ ] No duplicate mobile visibility booleans remain for list/inspector/filter/tools/legend.
- [ ] Inspector detent is part of the canonical state while active; transitions are explicit actions.
- [ ] Actual rendered sheet height is derived from the shared geometry helper/config, not unrelated hard-coded vh classes.
- [ ] Component integration tests verify DOM state and computed geometry for all three detents.
- [ ] Unit tests cover every transition, repeated toggle, close-all, neighborhood selection source, and breakpoint migration.
- [ ] Pointer lifecycle covers down/move/up/cancel/lost capture, with tap fallback and no accidental click after drag.
- [ ] Focus returns to the invoking control after close; Escape and backdrop behavior are consistent.
- [ ] Search, filter, tools, legend, list, inspector, and spatial mode have a documented mutual-exclusion policy.
- [ ] FloatingTopBar and inspector do not overlap in the target viewport matrix.
- [ ] RTL/LTR, light/dark, reduced motion, and keyboard-only paths are verified.
- [ ] Existing GIS/map state and selected neighborhood survive panel transitions without unwanted map recentering.

## 8. Required QA evidence

Run automated component/browser tests and capture:
- 320x568, 360x800, 390x844, 430x932, 768x1024, 1024x768, 1440x900.
- Inspector collapsed/peek/expanded.
- List/filter/tools/legend open and transition among each other.
- Search open while inspector is active; Escape and focus restoration.
- Breakpoint changes around 1024px.
- Safe-area bottom inset and bottom navigation overlap.
- DOM bounding boxes, computed heights, z-index, scroll containers, and touch target sizes.

Until those artifacts are captured, mark visual and interaction QA as NOT VERIFIED.

## 9. Change boundary

This package is a design/architecture handoff only. It does not authorize refactoring the app, modifying state contracts, changing CSS, or altering map/GIS behavior. Implement only after the user explicitly authorizes frontend implementation.
