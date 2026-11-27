# DESIGN-MAP-008 — Modal Concurrency & Focus Ownership Contract

**Repository:** `bijanbijane/radartehran`  
**Branch:** `design/rt-map-workspace-ux-2026-11-27`  
**Package:** `DESIGN-MAP-008`  
**Review date:** 2026-11-27  
**Scope:** source-level design audit and acceptance contract. No application code changed.

## 1. Objective

Determine whether modal visibility state, focus ownership, Escape handling, and visual stacking remain coherent when multiple modal-capable states are independently enabled. This package extends DESIGN-MAP-007; it does not claim browser/runtime reproduction.

## 2. Verified source findings

### 2.1 SecondaryModals: incomplete focus-hook activation set

`src/components/SecondaryModals.tsx` renders independent conditional surfaces for:
- `showPulseModal`
- `showSeoDrawer`
- `showBuyerAlertModal`
- `showPwaModal`
- `showLegalModal`

The component creates one hook ref using:

```ts
useDialogFocus(showPulseModal || showSeoDrawer, () => {
  setShowPulseModal(false);
  setShowSeoDrawer(false);
});
```

The same file separately renders buyer-alert, PWA, and legal dialog surfaces. Therefore the shared hook activation predicate does not include all modal surfaces rendered by this component. The source does not establish mutual exclusion between these independent boolean props.

### 2.2 BuyerAlertPwaLegalModals: one ref shared by three independently rendered dialogs

`src/components/BuyerAlertPwaLegalModals.tsx` creates one focus hook using the OR of buyer-alert, PWA, and legal flags. It then conditionally renders each dialog independently. The source does not establish an exclusive state machine among these three flags. If more than one is true, one hook ref is associated with multiple candidate dialog roots; this needs runtime and state-transition validation.

### 2.3 PortfolioModals: two independently rendered dialogs without shared focus hook

`src/components/PortfolioModals.tsx` conditionally renders:
- `showVisitedModal`: visited-homes dialog, z-50
- `showTradeUpModal`: trade-up calculator dialog, z-50

Both are passed as independent booleans from `AppModalsPortal.tsx`, whose parent condition is their OR. The inspected component does not import or call `useDialogFocus`. The source does not establish that the two flags cannot both be true.

### 2.4 Workspace modal aggregation exposes multiple independent visibility flags

`AppModalsPortal.tsx` conditionally mounts several modal families from separate UI flags, including secondary modals, expansion modules, future modules, portfolio dialogs, onboarding, hedonic valuation, nationwide province selection, price trend, and listing verification. Some flows explicitly close one modal before opening another (for example, the future-module quick-submit callback closes that modal before opening the agency modal), but no single global exclusivity invariant is evident in the reviewed aggregation block.

### 2.5 Shared hook and stack semantics

The reviewed `useDialogFocus.ts`:
- Registers one document-level keydown listener per active hook instance.
- Uses the last DOM-ordered `[role="dialog"][aria-modal="true"]` as the topmost-dialog guard.
- Handles Escape only when its own dialog container is that topmost element.
- Traps Tab/Shift+Tab within its hook container.
- Restores the element focused before that hook opened when its effect cleans up; otherwise it focuses a main landmark fallback.
- Uses a module-level reference count for body overflow locking.

`dialogStack.ts` also uses DOM order to identify the topmost dialog. This makes DOM order an implicit cross-component coordination mechanism rather than an explicit modal-stack state contract.

## 2.6 Global Escape listener conflicts with topmost-dialog dismissal

`src/components/useAppUiState.ts` registers a native `keydown` listener on `window`. When `e.key === 'Escape'`, it sets a broad set of modal flags to false in one handler, including super modules, compare, shortlist, share, smart suggest, agency, admin, pulse, SEO, buyer alert, PWA, legal, visited, trade-up, hedonic, price trend, onboarding, nationwide province, and listing verifier. It also closes several non-modal floating panels.

The shared `useDialogFocus.ts` registers a native `keydown` listener on `document`. For Escape, it checks whether its container is the last DOM-ordered modal; if so, it calls that modal's `onClose` and calls `preventDefault()`, but the inspected handler does not call `stopPropagation()`.

Native keydown propagation proceeds from `document` to `window`. Consequently, when a hook-managed dialog receives Escape, the document handler can close the topmost dialog and the event can continue to the window-level handler, which clears all modal flags. This creates a source-level conflict with the intended one-topmost-dialog dismissal contract and can close multiple modal states on one Escape press.

**Evidence status:** both listener implementations and their registration targets were fetched from the active design branch. This is a deterministic source-path conflict; actual user-visible impact still requires a browser test with at least two simultaneously active modal states. Do not claim runtime reproduction until tested.

## 2.7 Source-backed transition writer inventory

The following active-branch files were fetched and searched for direct setter calls:

| State family | Verified open/close writers or entry points | Result |
|---|---|---|
| Pulse / SEO | `ProductViewRouter.tsx`, `FloatingTopBar.tsx`, `SecondaryModals.tsx` | Both can be opened from separate entry points; FloatingTopBar closes its tools popover when opening SEO, not other modal flags. |
| Buyer alert | `NeighborhoodBargainsAndVotesTabs.tsx`, `ProductViewRouter.tsx`, `BuyerAlertPwaLegalModals.tsx` | Buyer alert can be opened from neighborhood and product-view actions; no global modal exclusivity is evident in these call sites. |
| Visited log | `NeighborhoodInspectorDrawer.tsx`, `NeighborhoodBargainsAndVotesTabs.tsx`, `ProductViewRouter.tsx`, `RadarWorkspaceShell.tsx` | Multiple independent entry points set the visited flag true. |
| Trade-up | `NeighborhoodInspectorTabs.tsx` | Separate action sets trade-up true and seeds the current neighborhood. |
| Global close | `useAppUiState.ts` | Escape listener clears many modal flags together; this is not topmost-only dismissal. |

The writer inventory is scoped to the seven state families and call sites fetched in this pass. It is not a complete cross-repository state-transition graph.

## 3. Concurrency risk register

| Surface group | Verified state model | Risk if flags overlap | Evidence status |
|---|---|---|---|
| SecondaryModals | Five independent visibility props; hook covers pulse/SEO only | Some active dialogs may have no matching active focus hook; Escape/focus ownership may be inconsistent | Source-level risk verified; overlap runtime NOT VERIFIED |
| BuyerAlert/PWA/Legal | Three booleans; one shared hook ref | One ref may not point to the active topmost dialog for every combination | Source-level risk verified; overlap runtime NOT VERIFIED |
| PortfolioModals | Two booleans; two independent z-50 dialog branches; no shared hook found | Two modal surfaces may mount together without coordinated focus ownership | Source-level risk verified; overlap runtime NOT VERIFIED |
| Workspace modal families | Independent flags in aggregator; selected flows close predecessors manually | Other entry paths may create competing surfaces without a central exclusivity rule | Partial source evidence; full transition graph NOT VERIFIED |
| Global Escape handler | Document-level hook dismisses topmost; window-level UI-state listener clears all modal flags | A single Escape can invoke both handlers and clear more than the topmost modal | Source conflict VERIFIED; runtime reproduction NOT RUN |
| Body-portaled modal families | 14 paths asserted by an existing test to use createPortal and z-[9500] | Several portal roots can be simultaneously mounted; DOM insertion order may not match intended user-facing priority | Test-backed inventory VERIFIED; runtime order NOT VERIFIED |

## 4. Canonical product contract

### 4.1 Modal state must be explicit

Adopt a single modal coordinator with a typed active stack or an explicitly exclusive active-modal state. Do not infer ownership from unrelated booleans or DOM query order alone.

Recommended conceptual model:

- `activeModalId`: unique stable identifier for the visible top-level modal.
- `modalStack`: ordered entries for intentional nested dialogs only.
- Each entry declares `owner`, `dismissalPolicy`, `focusReturnTarget`, `layerRole`, and `accessibleName`.
- Opening an exclusive peer replaces or closes the current peer through a documented transition.
- Nested confirmation dialogs may push onto the stack and must restore focus into the parent on close.
- Unrelated modal families must not silently coexist merely because their booleans are independently true.

### 4.2 One topmost owner

- Only the coordinator's top stack entry handles Escape and Tab.
- The topmost visual surface, coordinator entry, DOM-ordered dialog, and active focus container must refer to the same dialog.
- A hook ref must belong to exactly one dialog root. Never reuse one ref across multiple simultaneously renderable dialog roots.
- Dialogs without a shared focus manager must not claim `aria-modal="true"` until focus containment and background interaction behavior are implemented and verified.

### 4.3 Close and focus restoration

- Closing a child returns focus to the invoking control inside its still-open parent.
- Closing an exclusive modal returns focus to its trigger in the workspace.
- If the trigger is removed, use a stable, programmatically focusable fallback.
- Closing a lower stack entry while a child remains open must not steal focus from the child.
- A modal's close callback must not indiscriminately close unrelated active modal state.

### 4.4 Background and scroll

- Exactly one coordinator owns body scroll lock, with reference-counted or stack-derived lifecycle.
- Background application content is non-interactive while a modal is active; verify `inert` or an equivalent strategy.
- Nested dialogs must not unlock body scrolling until the final active modal closes.
- Portal mount/unmount and workspace breakpoint changes must preserve the same modal ownership rules.

## 5. Required state-transition matrix

| Current state | Event | Expected next state | Required invariant |
|---|---|---|---|
| No modal | Open an exclusive modal | That modal only | One active owner |
| Modal A | Open exclusive Modal B | B replaces A, or explicit confirmation | Never accidental dual modal |
| Modal A | Open nested confirmation B | Stack A → B | B owns Escape/Tab; A remains inert |
| Stack A → B | Close B | A | Focus returns to B's trigger inside A |
| Stack A → B | Close A requested externally | Defined policy: close stack or defer | No orphaned child dialog |
| Any modal stack | Escape | Top entry closes only if dismissible | One Escape action, one close |
| Any modal stack | Final close | No active modal | Restore trigger focus and body overflow |
| Two independent flags true | Reconcile | Deterministic canonical state | No ambiguous ownership |

## 6. Acceptance criteria

- [ ] Enumerate every state flag that can mount a `role="dialog"` surface and identify all writers/transitions.
- [ ] Prove or disprove mutual exclusion for the five SecondaryModals states.
- [ ] Prove or disprove mutual exclusion for BuyerAlert/PWA/Legal states.
- [ ] Prove or disprove mutual exclusion for visited-homes/trade-up states.
- [ ] Map every `useDialogFocus` ref to exactly one dialog root at a time.
- [ ] Test simultaneous in-tree and body-portal dialogs, including equal z-9500 surfaces.
- [ ] Remove the competing global all-modals Escape behavior or route it through the same coordinator; verify one Escape closes exactly one topmost dismissible dialog.
- [ ] Verify Tab/Shift+Tab containment and nested focus restoration.
- [ ] Verify lower-dialog cleanup cannot steal focus from a still-open top dialog.
- [ ] Verify background inertness, body scroll lock, and exact restoration.
- [ ] Verify all transitions with keyboard, pointer, RTL/LTR, mobile virtual keyboard, and screen reader.
- [ ] Add behavioral tests for exclusivity and stack transitions; source-regex assertions alone are insufficient.

## 7. Review outcome

**VERIFIED — source findings:** the named components, independent visibility conditions, shared-hook activation expressions, workspace modal aggregation, setter call sites, and document/window Escape listeners were fetched from the active design branch.

**IMPLEMENTED — NOT VERIFIED:** this design package records the concurrency contract and acceptance matrix. No application code or tests were changed.

**NOT VERIFIED:** whether every overlapping boolean combination is reachable through actual user journeys; runtime DOM order, focus behavior, Escape behavior, and visual layer ownership. The document/window Escape listener conflict is source-verified but runtime reproduction is NOT RUN.

**BLOCKED:** browser/device QA remains unavailable; no runtime claim is made.

## 8. Next exact action

Trace all writers and transition handlers for the SecondaryModals, BuyerAlert/PWA/Legal, and PortfolioModals flags. Build a verified transition graph from actual source call sites. Then validate overlapping states in a connected browser/device. Only after that evidence should a central modal coordinator implementation be proposed for explicit frontend authorization.
