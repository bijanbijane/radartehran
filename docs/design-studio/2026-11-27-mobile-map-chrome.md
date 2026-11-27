# Radar Tehran Design Studio — Mobile Map Chrome & Navigation
**Date:** 2026-11-27  
**Repository:** `bijanbijane/radartehran`  
**Baseline:** `main` at `456dcacb387b908797756863b10da1f7104b658e`  
**Design branch:** `design/mobile-neighborhood-inspector-2026-11-27`  
**Status:** Design audit and handoff complete; no frontend implementation performed.

## 1. Objective
Reduce the mobile map's competing interface chrome while preserving the actions users need during map exploration. The map must remain the primary workspace; controls should be grouped by task, not duplicated across floating rows.

This package continues the approved Hybrid A+C direction from `CAMPAIGN-PROD-01/05` and `06`.

## 2. Evidence inspected
- `src/components/navigation/ProductGlobalHeader.tsx`
- `src/components/FloatingTopBar.tsx`
- `src/components/MapLegend.tsx`
- `src/components/map/MapQuickControlsStrip.tsx`
- `src/components/navigation/primaryNavigation.ts`
- `src/components/navigation/radarBottomNavParts.tsx`
- `src/components/RadarBottomNav.tsx`
- `src/utils/productViewRouterShellClasses.ts`
- `docs/product-assessment/CAMPAIGN-PROD-01/05-design-alternatives-and-decision-matrix.md`
- `docs/product-assessment/CAMPAIGN-PROD-01/06-proposed-design-blueprint.md`

## 3. Verified current structure
1. `ProductGlobalHeader` is sticky at z-index 45 and contains brand, city selector, desktop primary navigation, global-search trigger, and account control. The global header is already the canonical place for city selection.
2. `FloatingTopBar` contains a neighborhood search input, Buy/Rent mode, budget filter, map-layer entry point, active-filter chips, and additional map tools. On mobile, the search input and several controls can compete for the same narrow row.
3. There are two search entry points with different apparent scopes: the global-search trigger in `ProductGlobalHeader` and the neighborhood search input in `FloatingTopBar`. Their scopes must be clarified before either is hidden; they must not be presented as duplicate identical searches.
4. `MapQuickControlsStrip` provides Buy/Rent, metro, traffic-zone, and optional ruler controls. It is scrollable but its compact controls currently use small vertical padding and 11px text.
5. `MapLegend` is a fixed overlay above the mobile bottom navigation. It supports a hidden-on-sheet state, but its close button in `main` is currently 32×32px; PR #68 proposes 44×44px.
6. Mobile navigation is already implemented as four direct destinations plus a More sheet, for five bottom destinations total. The source order is discover, intelligence, map, properties, More. This is more mature than older seven-tab audit descriptions.
7. The split-map shell is already full-width on mobile when split mode is false. Do not reintroduce a permanent mobile split-map sliver.

## 4. Selected mobile chrome architecture
### A. Global header — one persistent identity/search row
- Preserve the current global header as the only persistent city selector.
- Keep brand, city, unified search entry, and account access.
- Resolve search semantics: one visually primary search affordance should open a search surface whose default scope on the Map view is neighborhoods, while still allowing global destinations. If the existing global search cannot support this scope, label the two search intents distinctly rather than pretending they are duplicates.
- Keep the header height aligned to the existing 56px mobile token. Do not add another city or budget selector to the map toolbar.

### B. Map action strip — one scrollable row
Replace the mobile first-row controls in FloatingTopBar with a single horizontally scrollable action strip directly below the global header. Recommended order:
1. Buy / Rent segmented control.
2. Budget & mortgage filters, including active-filter count.
3. Map layers / color lens.
4. Map legend.
5. Optional ruler action when enabled.

Rules:
- One row only; no wrapping into a second row.
- 44px minimum height for interactive targets, even if the visual chip is smaller within the target.
- Preserve visible selected states and accessible labels.
- Horizontal scrolling must remain discoverable; do not shrink labels below readable size.
- Hide or disable irrelevant map-only actions outside the Map view.
- Do not put a full filter form inline; open the existing focused filter dialog/popover.

### C. Map legend — compact by default
- Closed state: a single 44px touch target labelled “راهنمای نقشه” with a small status-color key; no large floating card.
- Open state: a bounded panel anchored above the bottom navigation, with internal scrolling and a clear 44×44px close control.
- Hide the closed legend trigger when the Neighborhood Inspector is in peek or expanded state, unless the user explicitly opens the legend from the inspector's layer action.
- Keep green/amber/red semantics contextual to the active map lens; do not imply that those colors always mean budget fit.

### D. Bottom navigation — preserve the existing 4+1 model
Keep the five destinations already represented in source:
- کشف محله‌ها
- نبض بازار
- نقشه (central/high-emphasis destination)
- املاک
- بیشتر

Do not add a sixth or seventh destination. The More sheet remains the overflow destination for tools, account, services, knowledge, and other secondary areas.

## 5. Z-index and overlay rules
Use one explicit overlay hierarchy and verify it against the actual shell:
- Global header remains above normal map controls.
- Map action strip and closed legend remain below the expanded Neighborhood Inspector.
- Open filter/layer/legend dialogs must be mutually exclusive where their state already coordinates them.
- Open dialogs must sit above the bottom navigation and respect safe-area insets.
- When the inspector enters peek or expanded state, suppress map-only floating controls that would overlap it.
- Escape closes the active popover/dialog; focus returns to its trigger.

Do not change global z-index tokens without checking every overlay consumer.

## 6. Responsive acceptance targets
| Viewport | Required behavior |
|---|---|
| 320×568 | Header and action strip remain one row each; map remains usable; no horizontal page overflow; bottom nav has five destinations only. |
| 390×844 | Search and map actions remain distinct and legible; map canvas is not covered by a second wrapped toolbar row. |
| Tablet | Action strip may become a fixed-width control cluster; map retains a large continuous canvas. |
| Desktop | Preserve existing desktop navigation and toolbar behavior; do not force mobile chips into desktop. |

## 7. Design critic — risks and required corrections
| Severity | Risk | Required correction |
|---|---|---|
| Critical | Hiding FloatingTopBar's search without merging its neighborhood-search behavior could remove the main map-search path. | Confirm and document search contracts; provide a unified scope-aware search or retain clearly differentiated search labels. |
| High | A 38px visual chip row can create undersized touch targets. | Keep at least 44px hit areas; visual content may be compact inside them. |
| High | Legend, layer popover, and inspector can overlap. | Implement one overlay priority model and verify on actual 320×568 and 390×844 browser screenshots. |
| Medium | Four map quick controls can overflow on 320px screens. | Use a single horizontal scroll row with stable order and visible overflow affordance. |
| Medium | Map colors change meaning by active lens. | Show contextual legend copy and selected lens state; never rely on color alone. |

**Decision:** accept the architecture for prototyping. Do not approve production implementation until the search-scope behavior and overlay coordination are verified.

## 8. Implementation handoff
- Reuse existing components and state: `ProductGlobalHeader`, `FloatingTopBar`, `MapQuickControlsStrip`, `MapLegend`, `RadarBottomNav`.
- Do not create a new navigation system or duplicate map-filter state.
- Preserve existing `data-testid`, route IDs, keyboard semantics, and callback contracts.
- Keep the current four direct destinations + More navigation model.
- Keep the map sheet's existing snap-state machine; this package only defines the map chrome relationship with the sheet.
- No API, database, or backend changes are required for the visual reorganization.

## 9. Definition of done
- [ ] Search scope is explicit and no existing search capability is lost.
- [ ] Mobile city selection exists in one place.
- [ ] Mobile map actions occupy one scrollable row.
- [ ] All critical touch targets meet the 44px design target.
- [ ] Legend close control is at least 44×44px.
- [ ] No overlay collision with the inspector or bottom navigation.
- [ ] Four primary destinations + More remain intact.
- [ ] RTL, dark mode, keyboard, and screen-reader behavior are verified.
- [ ] Browser screenshots and interaction tests pass at 320×568 and 390×844.
- [ ] Lint, architecture checks, focused tests, and production build pass.

## 10. Next package
After this map-chrome package, the next design priority is **unified first-time purchasing-power onboarding**. It should be treated as a cross-view task flow, not another independent modal or visual refresh.
