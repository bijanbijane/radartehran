# RT-MAP-OVERLAY-STATE-TRANSITION-AND-WRITER-AUDIT

**Package:** DESIGN-MAP-012  
**Date:** 2026-11-27  
**Branch:** design/rt-map-workspace-ux-2026-11-27  
**Scope:** Active-branch source trace and design handoff only. No application code or tests changed.

## 1. Purpose

Trace the central overlay state, selected modal writers, shell-level map-panel transitions, and global Escape behavior. Consolidate findings from DESIGN-MAP-008 through DESIGN-MAP-011 into a transition-ownership specification.

## 2. Source files reviewed

- `src/components/useAppUiState.ts`
- `src/components/RadarWorkspaceShell.tsx`
- `src/components/FloatingTopBar.tsx`
- `src/components/views/ProductViewRouter.tsx`
- `src/components/NeighborhoodInspectorDrawer.tsx`
- `src/components/NeighborhoodInspectorTabs.tsx`
- `src/components/NeighborhoodBargainsAndVotesTabs.tsx`
- `src/components/AppModalsPortal.tsx`
- `src/components/SecondaryModals.tsx`
- `src/components/BuyerAlertPwaLegalModals.tsx`
- `src/components/PortfolioModals.tsx`

All paths were fetched from the active design branch.

## 3. Verified state and transition findings

### A. Global Escape handler

`useAppUiState.ts` installs a `window` keydown listener. For any Escape event, it unconditionally clears a broad set of state values, including:

- modal flags: super modules, compare, shortlist matrix, share, smart suggest, agency, admin, pulse, SEO, buyer alert, PWA, legal, visited, trade-up, hedonic, price trend, onboarding, nationwide province, and listing verifier;
- expansion modal type;
- search dropdown;
- tools and map-legend popovers;
- mobile filter and mobile sheet;
- map rail panel and spatial tools.

This handler does not inspect event.defaultPrevented, identify a topmost layer, consult a modal/overlay registry, or limit itself to one dismissal. The reviewed handler does not use stopPropagation.

**Finding:** SOURCE CONFLICT VERIFIED — one Escape event can reach multiple document/window handlers and the global handler clears unrelated independent flags. Runtime event ordering and exact user-visible outcome remain NOT REPRODUCED.

### B. FloatingTopBar Escape handler

`FloatingTopBar.tsx` computes `hasOpenTopBarOverlay` from search, mobile filter, tools, and map legend flags. While any is open, it registers a separate `document` keydown handler. Escape clears all four flags rather than selecting one active overlay.

**Finding:** SOURCE CONFLICT VERIFIED — a single FloatingTopBar handler itself closes multiple top-bar overlays. It also coexists with the global window close-all handler and MapLegend's own document listener.

### C. Shell-level map panel coordination

`RadarWorkspaceShell.tsx` defines `closeFloatingMapPanels(except)`, which closes search, filter, tools, legend, map rail, mobile list, inspector sheet, and spatial tools except the named surface. The shell calls it during navigation/city-context transitions and before opening selected panels.

The quick spatial-measure transition explicitly closes competing floating panels, clears the rail panel, opens spatial tools, and sets the interactive spatial mode to measure. Other rail and map-context transitions are wired through shell callbacks.

**Finding:** A partial shell-level mutual-exclusion mechanism exists for selected map workspace transitions. It does not govern all global modal state or all independent Escape listeners and is not a unified overlay stack.

### D. Modal writer inventory — selected state families

| State family | Verified writer paths / callsites | Notes |
|---|---|---|
| Pulse | useAppUiState, FloatingTopBar, ProductViewRouter, RadarWorkspaceShell, SecondaryModals | Opened from product/map flows; SecondaryModals hook groups pulse with SEO |
| SEO drawer | useAppUiState, FloatingTopBar, ProductViewRouter, RadarWorkspaceShell, SecondaryModals | SEO action can open Legal or PWA after closing SEO |
| Buyer alert | useAppUiState, NeighborhoodInspectorDrawer, NeighborhoodInspectorTabs, NeighborhoodBargainsAndVotesTabs, ProductViewRouter, RadarWorkspaceShell, FloatingTopBar, BuyerAlertPwaLegalModals | Context IDs and form fields are set in several flows |
| PWA | useAppUiState, AppModalsPortal, BuyerAlertPwaLegalModals, AppModalsPortal install callback | PWA may be opened through install prompt flow |
| Legal | useAppUiState, ProductViewRouter, SecondaryModals, BuyerAlertPwaLegalModals | SEO-to-legal transition explicitly closes SEO before opening legal |
| Visited log | useAppUiState, RadarWorkspaceShell, FloatingTopBar, NeighborhoodInspectorDrawer, NeighborhoodInspectorTabs, NeighborhoodBargainsAndVotesTabs, ProductViewRouter, PortfolioModals | Several entry points open the same state |
| Trade-up | useAppUiState, RadarWorkspaceShell, FloatingTopBar, NeighborhoodInspectorTabs, NeighborhoodInspectorDrawer, PortfolioModals | Selected neighborhood context is set before open |
| Search dropdown | useAppUiState, RadarWorkspaceShell, FloatingTopBar, SearchDropdownMenu, ProductGlobalHeader path | Shell has explicit close-except-search transition |
| Spatial tools | useAppUiState, RadarWorkspaceShell, MapToolRail, MapSpatialToolsPopover | Shell has explicit competing-panel close helper |

This is a selected writer inventory for the traced families, not a proof that every setter/writer in the repository has been found.

### E. Shared focus-ref multiplexing remains material

The current component source still confirms these patterns:

- `SecondaryModals` creates one `useDialogFocus` ref from `showPulseModal || showSeoDrawer`, then renders separate dialog roots.
- `BuyerAlertPwaLegalModals` creates one hook ref from three flags, then renders separate buyer-alert, PWA, and legal dialog roots.
- `PortfolioModals` renders visited and trade-up dialogs independently; the reviewed component does not use the shared focus hook.

This is a separate focus ownership defect/risk from the Escape close-all behavior.

## 4. Transition invariants required

1. Every open overlay has one stable identity and declared class: modal, non-modal dialog, disclosure/region, or menu.
2. Open, close, replace, suspend, and restore transitions are dispatched through one workspace overlay authority.
3. One Escape closes no more than one active dismissible overlay.
4. The topmost modal takes priority over all non-modal surfaces. While a modal is active, lower surfaces cannot process Escape or trap Tab.
5. With no modal active, exactly one topmost dismissible non-modal overlay owns Escape.
6. A global keydown handler must never clear a list of unrelated overlay booleans.
7. Opening one map context panel must atomically close/suspend competing map context panels while preserving unrelated persistent map state (active layers, filters, spatial points) according to explicit transition policy.
8. Navigation and city-context changes may close a declared set of transient workspace panels, but must not accidentally dismiss unrelated modal flows without an explicit product rule.
9. Every dialog root has its own focus registration; one ref must never be attached to multiple independent roots.
10. Nested dialog close restores focus to the parent surface; final close restores focus to the original trigger or defined workspace fallback.
11. The overlay registry, rendered DOM, accessibility modality, and visual stack must agree.
12. State transition tests must assert both the requested state change and preservation of all unrelated state.

## 5. Required regression suite

### Escape precedence

- Mount two modal dialogs and one non-modal popover; one bubbling Escape closes only the top modal.
- A second Escape closes the next modal; only after the modal stack empties may the popover receive Escape.
- Verify the global close-all handler does not clear unrelated modal, search, map, or inspector state.
- Verify FloatingTopBar and MapLegend listeners cannot also dismiss sibling surfaces on the same key press.

### Map panel transitions

- Open filters, then layers, then spatial tools; verify one active context surface according to the declared policy.
- Verify quick spatial measure preserves points when specified and resets them only on explicit reset/close action.
- Verify closing a panel preserves map lens, active overlay layers, selected neighborhood, and other unrelated state.
- Verify city/view navigation closes only the declared transient panel set.

### Focus ownership

- Mount each dialog family independently and verify a unique focus registration per dialog root.
- Verify intentional parent-child dialog transitions and focus restoration.
- Verify unmount, removed trigger, non-dismissible top layer, and rapid open/close behavior.

### Test level

Use React DOM/browser event dispatch tests for native bubbling across document and window. Source-string assertions alone are insufficient. Add browser/device QA for stacking, pointer hit testing, safe area, and assistive technology.

## 6. QA boundary

- **Active-branch source review:** VERIFIED for the eleven listed files.
- **Selected state writer trace:** VERIFIED for the paths listed; complete repository-wide writer graph remains PARTIAL.
- **Global Escape close-all source behavior:** VERIFIED.
- **FloatingTopBar multi-close source behavior:** VERIFIED.
- **Runtime Escape ordering/reproduction:** NOT RUN.
- **Transition and DOM regression tests:** NOT RUN.
- **Browser/device/screen-reader QA:** NOT RUN.
- **Application code/tests:** unchanged.
- **Production readiness:** not established.

## 7. Handoff

Next source-only task: complete the writer inventory for remaining modal and transient overlay flags, including admin, share, compare, shortlist, smart-suggest, agency, listing-verifier, nationwide-province, onboarding, reverse-budget, and expansion surfaces. Then reconcile all entry points into one transition matrix.

Do not change application code or tests until explicit frontend implementation authorization is provided. Runtime reproduction remains blocked by the disconnected development browser/device.
