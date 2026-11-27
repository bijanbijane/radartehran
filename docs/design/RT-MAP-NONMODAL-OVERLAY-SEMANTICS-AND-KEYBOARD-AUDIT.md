# RT-MAP-NONMODAL-OVERLAY-SEMANTICS-AND-KEYBOARD-AUDIT

**Package:** DESIGN-MAP-011  
**Date:** 2026-11-27  
**Branch:** design/rt-map-workspace-ux-2026-11-27  
**Scope:** Active-branch source audit and design contract only. No application code or tests changed.

## 1. Purpose

Classify map-workspace panels, notification previews, menus, and legends by actual interaction modality. Define a consistent keyboard ownership policy so non-modal overlays do not accidentally compete with modal dialogs or each other.

## 2. Reviewed active-branch source

- `src/shared/notification-ui/NotificationDropdown.tsx`
- `src/components/MapLegend.tsx`
- `src/components/SearchDropdownMenu.tsx`
- `src/components/FloatingTopBar.tsx`
- `src/components/navigation/DesktopMegaMenu.tsx`
- `src/components/navigation/MobileMoreSheet.tsx`
- `src/components/navigation/MapToolRail.tsx`
- `src/features/properties/detail/PropertyGallery.tsx`
- `src/features/map/components/MapSpatialToolsPopover.tsx`
- `src/features/communications/components/HeaderNotificationBell.tsx`

## 3. Verified source findings

### A. Non-modal regions/popovers with independent Escape handling

| Surface | Source behavior | Semantics / ownership observation |
|---|---|---|
| NotificationDropdown | Registers a window keydown listener while open; Escape calls onClose | Root is `role=dialog`, labelled, but no `aria-modal=true`; no focus trap or focus restoration in reviewed component |
| HeaderNotificationBell preview | Registers document keydown and outside-mousedown listeners; Escape closes | Root is `role=dialog`, labelled, no `aria-modal=true`; no focus trap or explicit focus restoration in reviewed component |
| MapLegend | Registers document keydown and outside-mousedown listeners; Escape toggles closed | Content is correctly exposed as a labelled `region`, not a dialog; Escape listener has no topmost/ownership guard |
| MapSpatialToolsPopover | Registers document keydown listener; Escape resets spatial mode and closes | Root is `role=dialog`, labelled, no `aria-modal=true`; no topmost guard or focus management in reviewed component |
| MapToolRail panels | One document keydown listener closes open panel/spatial tools; multiple panel surfaces use `role=dialog` without `aria-modal=true` | Panel state is coordinated locally through openPanel/showSpatialTools and competing-panel callbacks; not registered in a shared overlay stack |
| FloatingTopBar | Registers a document Escape listener; renders layer/filter surfaces with `role=dialog` and labels | The inspected surfaces do not declare `aria-modal=true`; ownership relative to MapToolRail and global modal stack is not coordinated by a shared registry |
| SearchDropdownMenu | Has global shortcut and Escape listeners; checks for an existing `[role=dialog][aria-modal=true]` before selected shortcut/focus actions | Uses modal presence as a coarse suppression guard; this does not identify topmost non-modal overlay or establish unified Escape ownership |
| DesktopMegaMenu | Window Escape closes and restores focus to trigger; outside click closes | Root is a labelled `region`; this is consistent with non-modal disclosure semantics, but Escape ownership is independent |
| MobileMoreSheet | Document keydown handler traps Tab and closes on Escape; restores previously focused element | Root is `role=dialog` and `aria-modal=true`; this is a modal surface and should participate in the modal stack |
| PropertyGallery | Window keydown listener while open; rendered dialog root declares `aria-modal=true` | Must be coordinated with other modal handlers; detailed focus lifecycle is covered by modal inventory, runtime not verified |

### B. Key cross-surface risks

1. Several document/window Escape listeners may be active at once. A single Escape can reach multiple handlers unless one authoritative owner prevents competing handlers from acting.
2. A non-modal surface may close concurrently with a modal surface because some listeners do not inspect the active modal stack.
3. SearchDropdownMenu's presence check for any modal dialog is not equivalent to topmost ownership and does not account for non-modal overlays.
4. MapToolRail and MapSpatialToolsPopover both represent map-context interaction surfaces. Their independent listeners and state transitions need one shell-level owner.
5. The notification previews expose `role=dialog` without `aria-modal=true`. This is not automatically invalid: it can represent a non-modal dialog, but the accessible interaction model must remain non-modal and must not claim modal behavior.
6. MapLegend uses `role=region`, which better matches a persistent disclosure/region than a dialog. Its Escape behavior still needs a documented precedence rule.
7. DesktopMegaMenu uses region semantics and trigger focus restoration, but its window Escape listener may compete with other open overlays.
8. MobileMoreSheet is explicitly modal and must be coordinated with all other modal surfaces; it must not independently compete for Tab/Escape ownership.

All findings above are source-level. No event-dispatch/browser reproduction is claimed.

## 4. Required classification model

Every overlay must declare one of these interaction classes:

- **Modal dialog:** blocks background interaction; `role=dialog`, `aria-modal=true`, labelled title, topmost-only focus trap, stack-owned Escape, explicit focus restoration, and background inertness.
- **Non-modal dialog:** supplementary task surface that does not block the rest of the application; `role=dialog` with accessible name, no `aria-modal=true`, no modal focus trap, and deliberate trigger/focus behavior.
- **Disclosure/popover/region:** transient supplementary content; use the appropriate disclosure/button/region semantics rather than dialog semantics when no dialog interaction model exists. Escape dismissal is delegated to the active non-modal overlay owner.
- **Menu:** use menu semantics only when implementing the corresponding menu keyboard interaction model; otherwise use disclosure/region semantics and ordinary links/buttons.

Do not assign semantics based solely on visual appearance or z-index.

## 5. Keyboard ownership contract

1. The workspace owns a single ordered overlay registry for modal and non-modal surfaces.
2. The registry tracks identity, class, open state, parent relationship, trigger, dismissal policy, and Escape priority.
3. A modal stack always has priority over non-modal overlays. While a modal is active, non-modal Escape handlers must not run.
4. With no modal open, one active topmost dismissible overlay may consume Escape. One key press closes at most one surface.
5. Only modal topmost entries trap Tab. Non-modal surfaces do not trap focus unless an explicit, separately justified composite-widget pattern requires managed keyboard navigation.
6. Opening a modal over a non-modal overlay must define whether the underlying overlay remains open, suspends, or closes. It must not independently process keyboard input while suspended.
7. Outside-click dismissal and Escape dismissal must route through the same overlay owner and must not close unrelated surfaces.
8. Trigger focus restoration is required for keyboard-opened transient surfaces; modal restoration follows parent-stack rules from DESIGN-MAP-009/010.
9. MapToolRail, FloatingTopBar, MapLegend, SearchDropdownMenu, and spatial tools must dispatch overlay actions through the workspace owner rather than maintain independent global Escape policies.
10. A modal's presence must be determined by the registry, not by querying for any arbitrary `[role=dialog][aria-modal=true]` node as a proxy for ownership.

## 6. Required regression tests

- Open a notification preview and MapLegend; one Escape closes only the designated topmost transient overlay.
- Open a modal while MapToolRail, SearchDropdownMenu, or a notification preview is open; Escape closes only the modal and leaves the suspended/non-modal surface unchanged according to the declared policy.
- Open MapToolRail filters and spatial tools in succession; verify exactly one map context surface owns dismissal and no duplicate callbacks fire.
- Open DesktopMegaMenu and a notification preview; verify deterministic Escape precedence and correct trigger focus restoration.
- Verify MapLegend remains a region/disclosure and does not trap focus.
- Verify non-modal notification previews do not set `aria-modal=true`, do not trap Tab, and remain non-blocking.
- Verify MobileMoreSheet and PropertyGallery participate in the modal stack and only the topmost one owns Escape/Tab.
- Verify one Escape never clears unrelated modal flags through the global close-all listener.
- Verify outside click closes only the intended overlay and preserves map interaction state.
- Test keyboard and pointer paths in RTL/LTR, narrow mobile, tablet, desktop, and reduced-motion settings.

## 7. QA boundary

- **Source review:** VERIFIED for the ten files listed above.
- **Overlay modality classification:** DOCUMENTED; some component behavior requires product-level confirmation.
- **Browser/DOM keyboard reproduction:** NOT RUN.
- **Screen-reader validation:** NOT RUN.
- **Application code/tests:** unchanged.
- **Production readiness:** not established.

## 8. Handoff

Continue source-only audits until a connected browser/device is available. Frontend implementation remains unauthorized. Once implementation is explicitly authorized, unify the overlay registry, event ownership, and modal stack before changing individual component listeners; add the regression tests above as a coordinated change.
