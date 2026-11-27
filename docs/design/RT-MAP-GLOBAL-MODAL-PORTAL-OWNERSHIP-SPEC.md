# DESIGN-MAP-007 — Global Modal & Dialog Ownership Contract

**Repository:** `bijanbijane/radartehran`  
**Branch:** `design/rt-map-workspace-ux-2026-11-27`  
**Package:** `DESIGN-MAP-007`  
**Review date:** 2026-11-27  
**Scope:** source-level design and accessibility contract only. No application code changed.

## 1. Purpose

Reconcile the map workspace overlay contract (DESIGN-MAP-006) with the repository's current modal/dialog composition, focus management, scroll locking, and stacking conventions. This is a source review, not rendered-browser verification.

## 2. Verified source inventory

| Area | Verified source evidence | Design implication |
|---|---|---|
| Workspace ownership | `RadarWorkspaceShell.tsx` renders `AppModalsPortal` inside the workspace error boundary; the reverse-budget modal is separately rendered immediately before it. | Modal entry points are distributed across the shell rather than governed by one explicit overlay host. |
| Modal aggregator | `AppModalsPortal.tsx` conditionally renders many lazy-loaded modal components under `React.Suspense`. | Despite its name, this component contains no `createPortal` call in the reviewed source. It is an aggregation component, not evidence of a dedicated DOM portal root. |
| Shared dialog hook | `useDialogFocus.ts` saves trigger focus, applies a reference-counted body overflow lock, focuses an initial target, traps Tab/Shift+Tab, handles Escape only for the topmost modal, and restores focus on cleanup. | This is the strongest shared behavior contract currently identified; modal adoption is not universal. |
| Stack ordering | `utils/interactions/dialogStack.ts` identifies the topmost modal as the last DOM-ordered `[role="dialog"][aria-modal="true"]` element. | DOM order is currently part of the interaction contract; visual z-index and DOM order must remain aligned. |
| Modal consumers | `SmartSuggestModal`, `FutureSuperModulesModal`, `ExpansionModulesModal` use `useDialogFocus`. | These are positive adoption examples. |
| Secondary dialogs | `SecondaryModals.tsx` creates a shared hook ref with `showPulseModal || showSeoDrawer`; the same component also receives buyer-alert, PWA, and legal modal state. | The reviewed hook activation does not cover every modal state handled by this component. Each actual dialog surface needs its own verified focus lifecycle or a shared manager. |
| Primitive dialog | `ui/RadarPrimitives.tsx` contains a separate dialog implementation with its own keydown listener, focus cycling, Escape close, and z-index `70`. | There are at least two dialog-management implementations; the primitive does not use the shared topmost-dialog guard in the inspected block. |
| Layer values | Map workspace layers from DESIGN-MAP-006 include inspector backdrop/surface 34/35, bottom nav 43, geo-context banner 45, invalid-city overlay 55. Several feature dialogs use z-index 50; the primitive dialog uses 70. | A dialog at 50 can be visually below the invalid-city overlay at 55 if both states coexist. This is a conditional collision risk, not a verified rendered defect. |

## 3. Confirmed design risks and limits

1. **No canonical DOM portal host is evidenced.** `AppModalsPortal` is rendered in the ordinary React tree. A portal root elsewhere in the app was not established by this bounded source review; do not infer that none exists globally.
2. **Modal behavior is not uniformly delegated.** Shared hook adoption is visible in selected dialogs, while `RadarPrimitives` has an independent implementation and the secondary-modal group uses one ref for only a subset of its modal states.
3. **Topmost behavior depends on DOM order.** The shared hook guards Escape and Tab using the last matching dialog in document order. A visual stacking change without matching DOM ordering can make keyboard ownership disagree with the visible top layer.
4. **Background inertness is not established.** The shared hook traps focus inside its own dialog and locks body overflow, but the inspected implementation does not set `inert` or `aria-hidden` on the application background. A focus trap alone does not prove that all background interaction paths are disabled.
5. **Scroll lock is reference-counted but global.** A module-level counter preserves the original `body.style.overflow` until the final hook consumer closes. It does not, in the inspected source, establish scrollbar-gap compensation, iOS visual-viewport behavior, or coordination with non-hook dialogs.
6. **Focus restoration under overlapping dialogs needs runtime validation.** Each hook instance stores its own previously focused element and restores it on cleanup. The intended nested-dialog sequence should be tested, including when a lower dialog closes while another remains open.
7. **Layer collisions are possible by declared values.** Feature dialogs at z-50 and invalid-city overlay at z-55 have an ordering conflict if simultaneously mounted. Whether that state is reachable and how stacking contexts affect the result require runtime inspection.
8. **Accessibility naming is inconsistent in the inspected examples.** Some dialogs use `aria-label`, while the primitive uses `aria-labelledby`. Both can be valid, but every dialog must have a stable accessible name and a deliberate initial focus target.

## 4. Canonical ownership contract

### 4.1 One overlay coordinator

- Establish one documented overlay coordinator at the application/workspace boundary.
- The coordinator owns the ordered stack of active modal surfaces, their semantic layer role, dismissal policy, and focus ownership.
- Modal content components own their content and domain callbacks; they do not independently invent competing global stacking or scroll-lock rules.
- A true DOM portal host may be adopted only after its root, mounting lifecycle, SSR behavior, and stacking-context relationship are verified. Do not rename an ordinary aggregator as a portal host.

### 4.2 Stack and dismissal invariants

- Exactly one topmost modal owns Escape and sequential keyboard focus at a time.
- The visually topmost dialog, last DOM-ordered modal, and coordinator's top stack entry must identify the same surface.
- Backdrop dismissal is explicit per modal; clicking inside content never dismisses its parent.
- Escape behavior must be explicit for destructive, multi-step, or busy flows; it must not be silently inconsistent between implementations.
- Opening a child dialog preserves the parent dialog's state and focus context. Closing the child restores focus to its invoking control inside the still-open parent.
- Closing the final dialog restores focus to the original invoking control, or to a documented stable fallback if that control no longer exists.

### 4.3 Focus and background interaction

- Every modal has a programmatic initial-focus target and a stable accessible name.
- Tab and Shift+Tab remain within the topmost dialog, including the zero-focusable-element case.
- Background content is non-interactive while a modal is active; evaluate `inert` on the application root or an equivalent tested strategy. Do not apply `aria-hidden` to an ancestor containing the active dialog.
- Focus restoration must be stack-aware, not an unconditional return to a stale trigger.
- Validate focus visibility, logical RTL order, keyboard operation, and screen-reader announcement.

### 4.4 Scroll and viewport behavior

- Use a single reference-counted lock owner for modal body scroll.
- Preserve and restore pre-existing inline overflow state exactly.
- Validate scrollbar compensation, iOS Safari, on-screen keyboard, dynamic browser chrome, and visual viewport resizing.
- Nested dialogs must not release the body lock while another modal remains active.
- Modal content scrolls independently without moving the map workspace behind it.

### 4.5 Semantic layer roles

Use semantic roles rather than arbitrary per-component z-index values. Proposed ordering from low to high:

1. Workspace/map surfaces and map-local controls
2. Workspace drawers and their backdrops
3. Floating workspace status/context notices
4. Standard modal backdrop and modal surface
5. Explicitly elevated blocking/system dialog (only when product behavior requires it)

The exact token values and whether system notices should sit above dialogs must be reconciled with the product's interruption policy. Do not numerically change existing layers based on source inventory alone.

## 5. Acceptance criteria

- [ ] Inventory every modal/dialog entry point, including lazy-loaded, error-boundary, onboarding, PWA, legal, admin, and reverse-budget flows.
- [ ] Identify the actual DOM portal roots (if any), their owners, and their stacking-context ancestry.
- [ ] Demonstrate that coordinator order, DOM order, and visual order agree for two- and three-dialog scenarios.
- [ ] Verify Escape and Tab are handled by only the topmost dialog.
- [ ] Verify nested open/close focus restoration and trigger removal fallback.
- [ ] Verify background inertness and no keyboard/pointer interaction leaks.
- [ ] Verify body scroll lock reference counting and exact restoration across nested dialogs.
- [ ] Verify backdrop click, content click, busy state, and explicit Escape policy per dialog.
- [ ] Verify accessible name, initial focus, focus visibility, and RTL keyboard sequence.
- [ ] Verify z-layer behavior with map inspector, bottom navigation, geo-context notice, invalid-city notice, and all modal classes.
- [ ] Run viewport checks at 320×568, 360×800, 390×844, 844×390, tablet, and desktop; include safe-area and mobile virtual keyboard states.

## 6. Source review outcome

**VERIFIED — source inventory:** the named files, shared focus hook, dialog-stack helper, and representative modal call sites were fetched from the active design branch.

**IMPLEMENTED — NOT VERIFIED:** this document records the design contract and acceptance criteria; no application implementation was changed.

**NOT VERIFIED:** full-repository portal-root inventory, runtime stacking ancestry, focus/inert behavior, scroll-lock behavior on mobile browsers, and screen-reader operation.

**BLOCKED:** browser/device QA remains unavailable while the development device is offline.

## 7. Next action

Complete a full modal entry-point and portal-root inventory, then validate nested-dialog focus, inert background, scroll locking, and layer ordering in a connected browser/device. Only after that evidence is available should the overlay coordinator be translated into an implementation proposal and frontend implementation authorization requested.
