# DESIGN-MAP-009 — Modal Accessibility & Keyboard Interaction Audit

**Repository:** `bijanbijane/radartehran`  
**Branch:** `design/rt-map-workspace-ux-2026-11-27`  
**Status:** Source review documented; runtime behavior not verified  
**Scope:** Modal focus ownership, Escape propagation, keyboard dismissal, dialog semantics, and non-modal overlay listeners. No application code or tests changed.

## 1. Executive finding

The inspected implementation has multiple independent keyboard-dismissal systems rather than one authoritative modal stack. The source establishes several concrete ownership conflicts and accessibility risks. These are source-level findings only: simultaneous-dialog behavior, event ordering in a mounted React tree, and focus outcomes have not been reproduced in a browser.

## 2. Verified source findings

### 2.1 Global Escape handler closes unrelated surfaces

`src/components/useAppUiState.ts` registers a `window` keydown listener. On any Escape it clears a broad set of modal flags (including pulse, SEO, buyer alert, PWA, legal, visited, trade-up, and other modal families), as well as search, tools, legend, filter, map sheet, spatial tools, and listing-verifier state.

This handler does not identify the active/topmost surface and does not check whether the event was already handled by a dialog. A bubbling Escape from a dialog can therefore reach this global listener.

### 2.2 Shared hook uses DOM order but does not stop Escape propagation

`src/components/useDialogFocus.ts` registers a document-level listener, checks the last DOM-ordered `[role="dialog"][aria-modal="true"]`, and only lets that root handle Escape/Tab. On Escape it calls `preventDefault()` and invokes `onClose`, but the inspected handler does not call `stopPropagation()`.

Because `preventDefault()` does not stop event bubbling, the event can continue to the global `window` listener. This confirms the previously documented source conflict; runtime reproduction remains outstanding.

### 2.3 One ref is shared across multiple independently rendered dialog roots

The inspected consumers use a single ref returned by one hook call for multiple conditional dialog surfaces:

- `SecondaryModals.tsx`: one `useDialogFocus(showPulseModal || showSeoDrawer, ...)` ref is attached to the pulse and SEO dialog content roots.
- `BuyerAlertPwaLegalModals.tsx`: one ref is attached to buyer-alert, PWA, and legal dialog content roots while the hook opens for the OR of their flags.
- `PortfolioModals.tsx`: one ref is attached to visited-homes and trade-up dialog content roots while the hook opens for the OR of their flags.

A React ref attached to multiple mounted elements cannot independently represent each dialog container. The hook's focus trap and topmost test therefore do not establish per-dialog focus ownership when multiple roots are rendered. Whether these states are reachable together is not proven by the inspected source.

### 2.4 A separate primitive dialog bypasses the shared topmost guard

The dialog implementation in `src/components/ui/RadarPrimitives.tsx` installs its own document-level Escape/Tab listener. It closes on Escape and traps Tab within its panel, but the inspected handler does not consult `isTopmostModalDialogElement`. If it coexists with another modal listener, both may react to the same key event. Its z-layer is also independently declared in the primitive.

### 2.5 Non-modal overlays also register Escape listeners

The inspected set includes:

- `NotificationDropdown.tsx`: window-level Escape dismissal; its surface uses `role="dialog"` and `aria-label`, but the inspected root does not declare `aria-modal="true"`.
- `MapLegend.tsx`: document-level Escape dismissal.
- `FloatingTopBar.tsx`: document-level Escape handler for search/filter/tools popovers.
- `SearchDropdownMenu.tsx`, `DesktopMegaMenu.tsx`, `MobileMoreSheet.tsx`, and `MapToolRail.tsx`: additional independent keydown handling surfaced by repository search.

These surfaces may be legitimate non-modal popovers/sheets, but their dismissal policy needs coordination with modal ownership so one Escape does not dismiss multiple unrelated layers.

### 2.6 Focus restoration and scroll locking are local to the shared hook

The shared hook reference-counts body scroll lock and restores the saved body overflow when its active count reaches zero. On cleanup it restores focus to the previously focused element or a main-content fallback. The inspected primitive dialog separately captures/restores focus and does not share the hook's scroll-lock counter. Mixed modal implementations therefore have independent focus and lifecycle accounting.

## 3. Accessibility and interaction risks

| Area | Source evidence | Status |
|---|---|---|
| Topmost-only Escape | Shared hook checks DOM order; global window handler clears all flags | Conflict verified; runtime not reproduced |
| Ref ownership | Three hook consumers attach one ref to multiple dialog roots | Source risk verified |
| Primitive dialog stacking | Separate key handler lacks topmost guard | Source risk verified |
| Non-modal overlay dismissal | Multiple document/window keydown listeners | Inventory partial |
| Dialog semantics | Notification preview is `role="dialog"` without `aria-modal` in inspected root | Semantics need product classification |
| Focus restoration | Shared hook and primitive use separate restoration paths | Source divergence verified |
| Background inertness | No inert/aria-hidden management found in inspected shared hook | Not verified globally |
| Scroll lock | Shared hook counts locks; primitive path is separate | Runtime not run |

## 4. Recommended design contract

1. Establish one typed overlay coordinator for modal stack order, active ownership, dismissal policy, and focus restoration.
2. Give every dialog root its own focus-management registration; never reuse one element ref across independently mounted dialog roots.
3. Only the top stack entry may handle Escape and modal Tab trapping.
4. A handled modal Escape must not bubble into global close-all handlers. Prefer coordinator-owned dispatch over competing document/window listeners.
5. Distinguish modal dialogs from non-modal popovers and disclosure panels. Non-modal surfaces must not claim modal semantics or participate in the modal stack unless they truly block the rest of the application.
6. Define explicit parent-child relationships for intentional nested dialogs and restore focus to the parent dialog when a child closes.
7. Make background inertness, accessible naming, focus containment, scroll locking, and cleanup part of the same lifecycle contract.
8. Ensure close-all behavior is an explicit user action, not the default consequence of one Escape keypress.

## 5. Required regression tests before implementation acceptance

- Mount two real modal roots with independent focus registrations; dispatch one bubbling Escape and assert only the topmost closes.
- Assert the lower modal remains mounted and retains focus after the top modal closes; a second Escape closes the lower modal.
- Mount a primitive dialog above a shared-hook dialog and assert only the topmost handles Escape and Tab.
- Mount one non-modal popover with a modal; verify one Escape dismisses only the top interaction layer according to the declared policy.
- Verify a single Escape does not invoke global close-all for unrelated flags.
- Verify each modal's own trigger is restored, including when a child dialog closes back into its parent.
- Verify body overflow returns exactly to its prior inline value after nested/concurrent dialog teardown.
- Verify background inertness/aria-hidden lifecycle and accessible dialog names.
- Cover non-dismissible dialogs, removed triggers, unmount during transition, and keyboard focus entering/leaving the application.

## 6. QA boundary

- **VERIFIED:** Active design branch source inspection of `useAppUiState.ts`, `useDialogFocus.ts`, `dialogStack.ts`, `SecondaryModals.tsx`, `BuyerAlertPwaLegalModals.tsx`, `PortfolioModals.tsx`, `RadarPrimitives.tsx`, `NotificationDropdown.tsx`, `MapLegend.tsx`, and `FloatingTopBar.tsx`.
- **PARTIAL:** Repository search surfaced additional keydown owners; a complete listener and state-writer inventory is not established.
- **NOT RUN:** DOM-level React tests, browser reproduction, screen-reader testing, keyboard-only QA, and mobile/desktop runtime checks.
- **BLOCKED:** Connected development browser/device was previously reported offline.
- **UNCHANGED:** No application code, test code, or production configuration was modified.

## 7. Next action

After explicit frontend implementation authorization, implement the coordinator/ref-ownership correction and the DOM-level regression suite. Until then, preserve this source-backed contract and obtain browser/device access for runtime reproduction.
