# RT-MAP-OVERLAY-PRIMITIVE-ACCESSIBILITY-SPEC

**Package:** DESIGN-MAP-010  
**Date:** 2026-11-27  
**Branch:** design/rt-map-workspace-ux-2026-11-27  
**Scope:** Source-level design audit only. No application code or tests changed.

## 1. Purpose

Extend DESIGN-MAP-009 by auditing the shared `RadarSheet` primitive and documenting the interaction contract required for modal and sheet surfaces to coexist safely.

## 2. Verified source evidence

Reviewed active-branch source:

- `src/components/ui/RadarPrimitives.tsx`
- `src/components/useDialogFocus.ts`
- `src/components/useAppUiState.ts`

### RadarSheet behavior

The current `RadarSheet` implementation:

1. Creates a per-instance `panelRef` and title ID.
2. On each open instance, records `document.activeElement`, focuses the first focusable child (or panel), and installs a `document`-level `keydown` listener.
3. Handles Escape by calling that instance's `onClose`, with `preventDefault()` but no topmost-layer check and no propagation stop.
4. Handles Tab/Shift+Tab within that instance's focusables, but does not verify that its sheet is the active/topmost dialog before trapping.
5. Restores its captured focus target on cleanup.
6. Renders a root with `role="dialog"`, `aria-modal="true"`, and `aria-labelledby`; the labelled title is generated with `useId`.
7. Does not use the shared `useDialogFocus` hook or the reviewed `dialogStack` topmost helper.

### Cross-system interaction

- `useDialogFocus` independently registers a document keydown listener and gates Escape/Tab using `isTopmostModalDialogElement`.
- `useAppUiState` registers a window keydown listener that clears numerous modal and overlay flags on Escape.
- Native document keydown events bubble to window. Consequently, a RadarSheet Escape may invoke multiple sheet listeners and the global close-all listener; the exact set of callbacks depends on which sheets are mounted/open.
- Multiple `RadarSheet` instances can each capture the same or different focus targets and independently restore focus during cleanup. Their ordering and resulting focus are not coordinated.
- Each RadarSheet independently traps Tab without topmost ownership, so simultaneous modal surfaces can compete for sequential focus.

These are source-level risks. No browser event-dispatch reproduction or runtime claim is made.

## 3. Design risks

| Risk | Evidence | Runtime status |
|---|---|---|
| Multiple sheets respond to one Escape | Per-instance document listener; no topmost guard | NOT REPRODUCED |
| Background/global close-all also responds | Global window listener clears many flags | NOT REPRODUCED |
| Non-topmost sheet traps Tab | Per-instance trap without stack check | NOT REPRODUCED |
| Focus restoration races | Per-instance previous-focus snapshot and cleanup | NOT REPRODUCED |
| Modality semantics may be overstated | Every RadarSheet root declares aria-modal=true; no stack/background inert coordination in primitive | RUNTIME NOT VERIFIED |

## 4. Required overlay contract

1. Use one shared overlay coordinator for modal dialogs and modal sheets.
2. Register each open surface with a unique stable identity, explicit modality, parent relationship (for intentional nesting), and dismissal policy.
3. Only the active topmost modal may own Escape and Tab handling.
4. One Escape closes at most one dismissible topmost surface. The event must not also trigger global close-all behavior.
5. Only the topmost surface may trap focus. Lower surfaces remain mounted but do not intercept sequential focus.
6. Focus restoration must target the parent dialog for nested surfaces, otherwise the originating trigger; if unavailable, use a deliberate workspace fallback.
7. Apply background inertness/aria-hidden policy consistently while a modal stack is active, and restore prior values exactly.
8. Scroll locking must be reference-counted by the coordinator and restore the original body overflow after the final modal closes.
9. Set `aria-modal=true` only when the surface actually blocks interaction with the rest of the application. Non-modal sheets/popovers must use semantics matching their behavior.
10. Keep title association, visible close control, keyboard operation, reduced-motion behavior, RTL layout, and minimum 44×44 mobile targets in the component acceptance contract.

## 5. Required regression tests

- Mount two RadarSheet surfaces; dispatch one bubbling Escape; assert only the topmost closes and the lower remains open.
- Dispatch a second Escape; assert the lower sheet closes.
- Dispatch Tab and Shift+Tab while two surfaces are mounted; assert focus remains in the topmost surface and lower listeners do not redirect it.
- Verify nested-sheet close restores focus to the parent trigger, then final close restores focus to the original workspace trigger.
- Verify one Escape does not activate the global close-all path for unrelated overlays.
- Verify body overflow and background inert/aria-hidden values restore exactly after nested and overlapping lifecycles.
- Verify non-modal surfaces do not claim `aria-modal=true` and do not trap focus.
- Include unmount-while-open, removed-trigger, non-dismissible-topmost, and rapid open/close cases.

## 6. QA boundary

- **Source review:** VERIFIED for the three files listed above.
- **DOM/browser reproduction:** NOT RUN.
- **Screen-reader and device validation:** NOT RUN.
- **Application code/tests:** unchanged.
- **Production readiness:** not established.

## 7. Handoff

Do not implement this contract until explicit frontend implementation authorization is given. First reconnect a browser/device and reproduce the multi-sheet Escape, Tab ownership, focus restoration, and global close-all interactions. Then implement the coordinator and DOM-level regression tests as one coordinated frontend change.
