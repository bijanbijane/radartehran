# DESIGN-MAP-001 — Map Workspace UX/UI Design Package

- **Product:** Radar Tehran (`رادار تهران`)
- **Package:** `DESIGN-MAP-001`
- **Date:** 2026-11-27
- **Branch:** `design/rt-map-workspace-ux-2026-11-27`
- **Status:** `DESIGN_PROTOTYPE_READY — IMPLEMENTATION_NOT_AUTHORIZED`
- **Scope:** Product design, UX architecture, visual direction, and developer handoff only.
- **Source policy:** No application source, API contract, backend behavior, or database schema was modified.

## 1. Objective and priority

Design the map workspace as Radar Tehran's primary spatial decision surface. The repository's UX audit register marks `PAGE-02` (map as the central GIS workspace; floating controls and neighborhood inspector must not overwhelm the map) as `NOT STARTED`. The older `CAMPAIGN-PROD-01` audit contains high-severity mobile map findings, but several details are now stale and were rechecked against current source before this package was selected.

## 2. Repository evidence inspected

- `src/components/RadarWorkspaceShell.tsx`: mounts `ProductGlobalHeader`, `FloatingTopBar`, `MapExplorerToolbar`, and `NeighborhoodInspectorDrawer`.
- `src/components/navigation/ProductGlobalHeader.tsx`: sticky global header, city selector, primary navigation, search/account/theme actions; canonical font and brand styling are shared.
- `src/components/FloatingTopBar.tsx`: fixed map toolbar below the global header, including search, mode/lens, budget filters, active filter chips, and map legend.
- `src/components/map/MapExplorerToolbar.tsx`: fixed canvas toolbar for zoom, reset, locate, viewport filter, and ruler.
- `src/components/map/MapQuickControlsStrip.tsx`: a reusable control strip for buy/rent, metro, traffic-zone, and ruler controls. Search found only its own file as a reference for `map-quick-controls-strip`; `FloatingTopBar.tsx` imports the component but does not render it (the import is explicitly voided). This is a verified integration gap, not proof that the underlying map overlays are unavailable.
- `src/components/NeighborhoodInspectorDrawer.tsx`: current implementation has `collapsed/peek/expanded` state semantics and pointer-down/up gesture handling; the drag handle is currently `min-h-[24px]`, while the current open sizes are `50dvh` and `84dvh`.
- `src/components/RadarBottomNav.tsx`: current mobile navigation is already a five-column grid. The older seven-tab finding is not current.
- `src/styles/tokens.css` and `src/index.css`: existing brand color `#176b63`, semantic surface/text/border tokens, Vazirmatn, 4px spacing rhythm, and focus-ring styling are the design-system baseline.
- `src/data/neighborhoods.ts`: reference profile values for Poonak, Saadatabad, Shahrak Gharb, Jannatabad, and Zafaraniyeh used in the prototype.

## 3. Epistemic classification

### Verified existing functionality
- The map workspace shell composes the global header, floating map controls, canvas toolbar, and neighborhood inspector.
- The app has rent/buy mode, map lenses, metro and traffic overlays, spatial measurement, neighborhood selection, and a mobile inspector.
- The current mobile navigation has five columns.
- The inspector contains a three-state model and a pointer gesture handler.

### Verified design requirements
- `PAGE-02`: preserve map centrality and prevent floating controls/inspector from overwhelming the map.
- `D1–D3` in `docs/product-assessment/CAMPAIGN-PROD-01/08-acceptance-test-plan.md`: mobile map viewport freedom, deterministic bottom-sheet states, and touch-target ergonomics.
- Existing design-system tokens and Vazirmatn must be reused.

### Proposed improvements
- Make one compact map-action rail the sole home for map-only quick controls.
- Reuse and mount `MapQuickControlsStrip` in the intended map context rather than creating another parallel control system.
- Keep global navigation/search/city selection in the global header; avoid duplicating those controls in map chrome.
- Keep the map canvas visually dominant and make the selected-neighborhood summary a progressive-disclosure inspector.
- Increase the dedicated sheet handle hit area to at least 44px and define explicit collapsed, peek, and expanded detents with single-tap alternatives.
- Keep all numeric overlays explicitly labeled as reference profile, observed listing, or analytical estimate; never imply that static profile data is live.

### Assumptions / limitations
- The chat prototype uses a deliberately schematic map illustration. It is not a geospatial rendering, tile layer, boundary source, or coordinate-accurate representation.
- The prototype uses repository profile values but does not query live APIs or map state.
- Browser screenshots, device testing, and runtime interaction tests were not available through this GitHub-only inspection session.

## 4. Concept exploration and selection

1. **Spatial-first canvas + contextual inspector — SELECTED.** Map remains the primary surface; controls are grouped by map task; selected neighborhood details appear progressively.
2. **Equal-weight list/map split — REJECTED.** Reduces map area and makes discovery feel like a generic directory.
3. **Analytics-card dashboard with embedded map — REJECTED.** Weakens the product's geographic identity and hides spatial relationships.

## 5. Selected design specification

### Information architecture
1. Global shell: brand, city context, global search, primary navigation, account/theme.
2. Map action strip: rent/buy, active lens, metro/traffic/ruler toggles, filter entry.
3. Spatial canvas: dominant map, selected neighborhood marker, map legend, locate/zoom/reset.
4. Context inspector: selected neighborhood, reference metric, data classification, next actions, expandable details.
5. Mobile navigation: preserve the existing five-destination model.

### Responsive behavior
- **360–390px:** single compact global header; one horizontally scrollable map action strip; full-width map; collapsed inspector by default; peek and expanded states; five-destination bottom navigation; safe-area-aware offsets.
- **768px:** map remains primary; controls wrap only when necessary; inspector can occupy a side companion region if the map retains sufficient usable width.
- **1024–1440px:** map canvas fills available space; inspector is a fixed-width contextual dock (existing 356px pattern is a reasonable starting point); map tools stay on the opposite edge; no overlap with header or page content.

### Interaction contract
- Selecting a neighborhood updates the active marker and inspector.
- Changing rent/buy mode updates the displayed reference metric and associated map lens.
- Changing a map lens changes the map visualization and its legend.
- Metro, traffic-zone, and ruler controls expose `aria-pressed` state and remain operable by keyboard/touch.
- Inspector detents are available through both pointer gestures and explicit buttons; dragging is never the only way to change state.
- Search has clear, loading, empty, and error states.
- Offline/stale data is visibly distinguished from live data.

### Design tokens
Reuse repository tokens; do not introduce parallel brand values:
- Brand: `--color-brand-primary: #176b63`
- Brand hover: `--color-brand-hover: #14534e`
- Brand soft: `--color-brand-soft: #eaf3f0`
- Main text: `--color-text-primary`
- Secondary text: `--color-text-secondary`
- Surfaces: `--color-bg-canvas`, `--color-bg-surface`, `--color-bg-subtle`
- Borders: `--color-border-subtle`, `--color-border-strong`
- Typeface: Vazirmatn
- Spacing: existing 4px scale
- Minimum touch target: 44×44px for primary mobile controls
- Focus: existing visible focus ring and semantic focus token

## 6. Prototype deliverable

An interactive chat-rendered prototype was produced in the design session. It includes:
- Buy/rent mode switching.
- Price, air-quality, metro, and traffic information selection.
- Metro and traffic overlay toggles.
- Search across five repository-backed neighborhood profiles.
- Neighborhood selection that updates the selected profile and metric.
- Explicit labeling that the map is schematic and profile values are not live transaction prices.

The map drawing and pins are intentionally non-geographic and are not clickable. Neighborhood selection is performed through the adjacent list in the prototype. The production map's Leaflet behavior is not replaced by this prototype.

## 7. Independent design critique

**Decision: ACCEPT AS A CONCEPT PROTOTYPE; NOT APPROVED AS A PRODUCTION-READY DESIGN.**

Corrections applied in the prototype:
- Added explicit non-geographic labeling to prevent false spatial precision.
- Added source-context labels distinguishing profile reference values from live traffic.
- Kept map layers and neighborhood selection as real prototype interactions rather than inert decorative controls.

Remaining defects / validation gaps:
- The schematic map cannot validate real geographic composition, marker collision, tile contrast, or boundary legibility.
- The prototype's markers are not directly interactive; selection is list-driven.
- No real browser rendering was captured at 360, 390, 768, 1024, 1280, or 1440px.
- No screen-reader, keyboard, reduced-motion, or device safe-area run was performed.
- Current production overlay stacking and map unobstructed-height metrics need fresh browser evidence; historical measurements must not be treated as current.

## 8. Developer handoff

This package is a design handoff only. Before frontend implementation:
1. Capture current production screenshots at 360×800, 390×844, 768×1024, 1024×768, 1280×800, and 1440×900.
2. Measure unobstructed map canvas height with inspector collapsed, peek, and expanded.
3. Confirm every map-only control has one canonical placement and no duplicate owner.
4. Integrate the existing `MapQuickControlsStrip` only after confirming the owning state/provider and its intended location.
5. Verify touch targets, safe-area offsets, keyboard focus, RTL labels, dark mode, and map attribution.
6. Run the acceptance gates in `docs/product-assessment/CAMPAIGN-PROD-01/08-acceptance-test-plan.md`; do not mark them passed based on this prototype.

**No application implementation is authorized or claimed in this package.**
