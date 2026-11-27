# DESIGN-MAP-003 — Map Control Ownership & Integration Contract

- **Product:** Radar Tehran
- **Package:** `DESIGN-MAP-003`
- **Date:** 2026-11-27
- **Branch:** `design/rt-map-workspace-ux-2026-11-27`
- **Status:** `DESIGN_CONTRACT_READY — IMPLEMENTATION_NOT_AUTHORIZED`
- **Scope:** UX architecture and frontend handoff; no application source changes.

## 1. Purpose

Resolve the map-control ownership ambiguity found while reconciling DESIGN-MAP-001 and DESIGN-MAP-002 against the current branch source. The objective is one discoverable home per map action, explicit state ownership, and predictable stacking across desktop and mobile.

## 2. Source evidence (current branch)

| Source | Verified responsibility / observation |
|---|---|
| `src/components/FloatingTopBar.tsx` | Owns search, buy/rent context, map lens selection, budget/filter controls, and map legend entry points. Imports `MapQuickControlsStrip` but explicitly voids the symbol; it is not rendered. |
| `src/components/map/MapQuickControlsStrip.tsx` | Defines buy/rent buttons plus metro, traffic-zone, and optional ruler toggles. Reads overlay state through `useMapAdvancedOverlayState` and ruler state through `useInteractiveSpatialMeasureState`. Its buttons currently use compact padding rather than explicit 44px minimum dimensions. |
| `src/components/map/MapExplorerToolbar.tsx` | Owns canvas actions: zoom in/out, zoom readout, reset city view, locate nearest neighborhood, viewport ranking filter, and legend callback. It also exposes a ruler callback/props surface. |
| `src/components/RadarWorkspaceShell.tsx` | Owns shared mode and panel state; passes ruler action to both FloatingTopBar and MapExplorerToolbar. Ruler action closes competing floating panels and switches the spatial interaction mode. |
| `src/components/navigation/ProductGlobalHeader.tsx` | Global navigation and city/product context remain outside map-specific control ownership. |

## 3. Control ownership matrix

| User task | Canonical owner | Placement | State/action contract |
|---|---|---|---|
| Global navigation, city context | ProductGlobalHeader | Global header | Existing global navigation state |
| Search neighborhood | FloatingTopBar | Top map chrome | Existing search state; focus/escape behavior retained |
| Buy / rent mode | FloatingTopBar | Map context/action row | Single shared `mode` state; do not mount a second independent mode control |
| Map thematic lens | FloatingTopBar | Map context/action row | Existing `mapLens` state and matching legend |
| Metro overlay | Map action strip | Secondary map action row | Existing advanced-overlay provider state |
| Traffic-zone overlay | Map action strip | Secondary map action row | Existing advanced-overlay provider state; respect city capability |
| Spatial ruler | Map action strip OR canvas rail, not both | One canonical location | Delegate to the existing shell handler; preserve panel exclusivity and interactive spatial mode |
| Zoom in/out + zoom readout | MapExplorerToolbar | Canvas edge | Map instance only; bounded zoom 5–18 as current implementation |
| Reset city extent | MapExplorerToolbar | Canvas edge | Existing city config/default zoom and desktop center offset |
| Locate nearest neighborhood | MapExplorerToolbar | Canvas edge | Existing location handler and permission/error states |
| Viewport ranking filter | MapExplorerToolbar | Canvas edge or its overflow | Existing advanced-overlay state; unavailable until viewport bounds exist |
| Legend | FloatingTopBar or canvas toolbar trigger, one trigger only | Adjacent to relevant layer controls | One shared open state; close other floating panels on open |

## 4. Placement decision

### Desktop (>=1024px)
- Keep global header separate from map chrome.
- Keep search, buy/rent, lens, filters and legend in the top map context row.
- Keep zoom/reset/locate/viewport tools grouped vertically at the map edge.
- Place metro and traffic toggles in a compact secondary action row adjacent to the lens context, not in the canvas utility rail.
- Place ruler in exactly one location. Preferred: secondary map action row, because it is a thematic/spatial mode rather than a navigation primitive. Remove/disable the duplicate canvas entry only after confirming all consumers and tests.

### Mobile (<1024px)
- Preserve a single horizontally scrollable map action row with 44x44px minimum interactive targets for primary actions.
- Keep search accessible in top chrome; avoid forcing all secondary actions into the first visible row.
- Put low-frequency actions (viewport ranking filter, map tile style, advanced overlays) behind a labeled overflow/secondary panel rather than shrinking hit targets.
- Keep zoom/reset/locate in a compact canvas rail whose bottom offset is coordinated with bottom navigation, safe-area inset, and inspector detent.
- Do not let the action row overlap the inspector handle or obscure the map's primary interaction region.

## 5. State and interaction invariants

1. Exactly one canonical state source for buy/rent, map lens, each overlay, legend visibility, and spatial-measure mode.
2. No second local state copy for a control already owned by `RadarWorkspaceShell` or an existing context/provider.
3. Opening search/filter/tools/legend/list/inspector/spatial mode must continue to use the shell's panel-exclusion policy; do not bypass `closeFloatingMapPanels`.
4. A control's visual active state must reflect the same state that drives the map layer; use `aria-pressed` for toggle buttons.
5. City-specific unsupported overlays must be unavailable or clearly disabled, not silently shown as active.
6. Ruler activation must preserve the existing spatial mode transition and cleanup semantics.
7. Every primary mobile action target must be >=44x44 CSS px; compact desktop controls may follow the existing desktop sizing policy.
8. Horizontal overflow in the action row must be intentional, keyboard-scrollable, and not clip focus indicators.
9. Every layer toggle must have an understandable Persian accessible name and visible active state in light and dark themes.
10. Do not imply live data when the layer is static, unavailable, cached, or estimated.

## 6. Acceptance criteria for implementation

- [ ] Each action in the ownership matrix appears in exactly one canonical location at each breakpoint.
- [ ] No duplicate ruler entry or duplicate buy/rent control.
- [ ] `MapQuickControlsStrip` is either intentionally mounted with documented owner/state or removed in a separate implementation decision; import-only dead integration is not accepted.
- [ ] Metro and traffic toggles change the actual map overlays and their `aria-pressed` values together.
- [ ] Ruler enters/exits spatial-measure mode and closes conflicting panels.
- [ ] Legend remains synchronized with the selected lens and visible overlays.
- [ ] All primary mobile targets measure >=44x44px in the rendered DOM.
- [ ] Action row has no unintended horizontal page overflow at 320, 360, 390, and 430 CSS px.
- [ ] Canvas rail does not collide with bottom navigation, safe-area inset, or any inspector state.
- [ ] Keyboard focus order follows visual order; focus remains visible when the action row scrolls.
- [ ] Persian RTL and English LTR layouts both preserve logical grouping and icon-label order.
- [ ] Automated tests cover state synchronization, panel exclusivity, and unsupported-city overlay behavior.

## 7. Risks and unresolved decisions

- **Ruler ownership:** both FloatingTopBar and MapExplorerToolbar receive the ruler handler. A single visible owner must be selected before implementation; source-level prop wiring alone does not prove two visible buttons, but it creates a duplicate-placement risk.
- **Viewport filter discoverability:** MapExplorerToolbar accepts `onOpenFilters`, but the source excerpt reviewed does not establish whether the callback is rendered as a control in all variants. Verify the complete component before changing placement.
- **Layer capability:** overlay support varies by city. Validate the capability resolver and overlay rendering contract before presenting controls as available.
- **Mobile geometry:** no live browser screenshots or DOM measurements are available while the development machine is offline. Placement decisions are a handoff contract, not visually verified outcomes.

## 8. Required QA evidence

Capture the map view at 320x568, 360x800, 390x844, 430x932, 768x1024, 1024x768, and 1440x900. For each relevant viewport, record:
- bounding boxes for global header, FloatingTopBar, map action row, canvas rail, bottom navigation, and inspector;
- minimum target dimensions and focus visibility;
- map unobstructed rectangle with inspector collapsed, peek, and expanded;
- open/close behavior for search, filters, tools, legend, spatial mode, list, and inspector;
- RTL/LTR and light/dark screenshots.

No browser/device QA is claimed in this package.

## 9. Handoff boundary

This document defines ownership and acceptance criteria only. It does not authorize application code changes, change map provider behavior, alter GIS data, or assert that any proposed placement has passed runtime validation.
