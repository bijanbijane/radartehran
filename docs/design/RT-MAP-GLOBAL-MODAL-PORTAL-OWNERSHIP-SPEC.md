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
| Modal aggregator | `AppModalsPortal.tsx` conditionally renders many lazy-loaded modal components under `React.Suspense`. | It is an aggregation component, not itself a `createPortal` host. Some child modal components portal their content independently. |
| Confirmed body portals | `NeighborhoodPriceTrendModal.tsx`, `modals/InstantListingVerifierModal.tsx`, and `modals/ReverseBudgetDiscoveryModal.tsx` import `createPortal` and return `createPortal(modalContent, document.body)` when `document` exists. | The active modal system is mixed: ordinary workspace descendants and body-level portal descendants coexist. Their DOM order and z-index must be reconciled. |
| Other inspected modal entry points | `AgencyModal`, `CompareModal`, `ShortlistMatrixModal`, `ShareModal`, `SecondaryModals`, `OnboardingWizardModal`, `HedonicValuationModal`, `PortfolioModals`, and `NationwideProvinceModal` were fetched from the active branch. | Most inspected dialogs declare modal semantics, but focus-hook adoption varies; this is not yet an exhaustive repository-wide inventory. |
| Shared dialog hook | `useDialogFocus.ts` saves trigger focus, applies a reference-counted body overflow lock, focuses an initial target, traps Tab/Shift+Tab, handles Escape only for the topmost modal, and restores focus on cleanup. | This is the strongest shared behavior contract currently identified; modal adoption is not universal. |
| Stack ordering | `utils/interactions/dialogStack.ts` identifies the topmost modal as the last DOM-ordered `[role="dialog"][aria-modal="true"]` element. | DOM order is currently part of the interaction contract; visual z-index and DOM order must remain aligned. |
| Modal consumers | `SmartSuggestModal`, `FutureSuperModulesModal`, `ExpansionModulesModal` use `useDialogFocus`. | These are positive adoption examples. |
| Secondary dialogs | `SecondaryModals.tsx` creates a shared hook ref with `showPulseModal || showSeoDrawer`; the same component also receives buyer-alert, PWA, and legal modal state. | The reviewed hook activation does not cover every modal state handled by this component. Each actual dialog surface needs its own verified focus lifecycle or a shared manager. |
| Primitive dialog | `ui/RadarPrimitives.tsx` contains a separate dialog implementation with its own keydown listener, focus cycling, Escape close, and z-index `70`. | There are at least two dialog-management implementations; the primitive does not use the shared topmost-dialog guard in the inspected block. |
| Layer values | Map workspace layers from DESIGN-MAP-006 include inspector backdrop/surface 34/35, bottom nav 43, geo-context banner 45, invalid-city overlay 55. Several feature dialogs use z-index 50; the primitive dialog uses 70. | A dialog at 50 can be visually below the invalid-city overlay at 55 if both states coexist. This is a conditional collision risk, not a verified rendered defect. |

## 3. Additional modal entry-point inventory\n\nThe following active-branch modules were fetched and checked for dialog semantics, focus-hook use, or portal mounting:\n\n| Component | Source-level result |\n|---|---|\n| `AgencyModal` | Declares dialog surfaces at z-50; shared `useDialogFocus` adoption was not found in the inspected file signals. |\n| `CompareModal` | Imports the shared focus hook; dialog surface at z-50. |\n| `ShortlistMatrixModal` | Uses the shared focus hook; dialog surface at z-50. |\n| `ShareModal` | Uses the shared focus hook; contains multiple dialog render branches. |\n| `SecondaryModals` | One shared hook instance is activated by pulse/SEO state; buyer-alert, PWA, and legal states are also passed into this component. |\n| `OnboardingWizardModal` | Uses the shared focus hook and an `aria-labelledby` name. |\n| `HedonicValuationModal` | Uses the shared focus hook and an `aria-labelledby` name. |\n| `PortfolioModals` | Contains visited-log and trade-up dialog surfaces; shared hook adoption was not found in inspected signals. |\n| `NationwideProvinceModal` | Uses the shared focus hook. |\n| `NeighborhoodPriceTrendModal` | Uses shared focus hook and portals to `document.body`; z-9500. |\n| `InstantListingVerifierModal` | Uses shared focus hook and portals to `document.body`; z-9500. |\n| `ReverseBudgetDiscoveryModal` | Uses shared focus hook and portals to `document.body`; z-9500. |

## 3.1 Repository contract test: explicit portal inventory

The active branch's `tests/form-input-handling.test.ts` contains a literal `portaledModals` inventory of 14 source paths. For each path, the test asserts both `createPortal(` and the `z-[9500]` class, explicitly describing the portal as protection from `backdrop-filter` containing blocks and the high layer as above the global top bar.

The 14 tested paths are:

1. `src/components/modals/ContractRoomShieldModal.tsx`
2. `src/components/modals/InstantListingVerifierModal.tsx`
3. `src/components/modals/ReverseBudgetDiscoveryModal.tsx`
4. `src/components/ListingMediaGallery.tsx`
5. `src/components/NeighborhoodPriceTrendModal.tsx`
6. `src/features/properties/filters/PropertyFilterPanel.tsx`
7. `src/features/properties/comparison/PropertyComparisonModal.tsx`
8. `src/features/properties/detail/PropertyGallery.tsx`
9. `src/features/properties/detail/PropertyDetailSections.tsx`
10. `src/features/services/components/ServiceProviderModal.tsx`
11. `src/features/services/components/ServiceRequestModal.tsx`
12. `src/features/market/saved-analysis/SavedAnalysisPanel.tsx`
13. `src/features/market/methodology/MethodologyPanel.tsx`
14. `src/features/market/filters/MarketFilterPanel.tsx`

All 11 additional paths beyond the three already discussed were fetched from the active design branch. Each contained one `createPortal(` call, one `role="dialog"` match, and a `useDialogFocus` reference. The three previously inventoried workspace portal files are also present in the test list. This verifies 14 explicit portal-bearing modules under the repository's test contract.

**Important limitation:** GitHub code search indexes the default branch, not this design branch. Search results were used only to discover candidate paths; all 11 additional source files and the contract test were then fetched with the design branch ref. This is a verified 14-file contract inventory, not proof that no further portal or dialog implementation exists outside the list.

## 3.2 Existing automated contract and its limits

The test's assertions protect the existence of the portal call and the `z-[9500]` class for all 14 listed modules. They do not establish runtime stacking-context ancestry, topmost-dialog keyboard ownership, background inertness, focus restoration, or correct behavior when multiple portaled dialogs are open.

The shared `useDialogFocus` implementation was also fetched. It:
- Saves the previously focused element and restores it on cleanup, with a fallback to `main, [role="main"], h1` if the trigger is no longer connected.
- Reference-counts a global `document.body.style.overflow = 'hidden'` lock and restores the saved inline overflow when the count returns to zero.
- Moves initial focus, traps Tab/Shift+Tab within the hook's container, and checks the last DOM-ordered `[role="dialog"][aria-modal="true"]` before handling Escape/Tab.
- Does not, in the inspected implementation, set `inert` or `aria-hidden` on the background application root.

The implementation is a useful shared baseline, but the DOM-order topmost rule and per-hook cleanup focus restoration still require nested body-portal runtime validation.

This inventory is limited to components directly imported by the inspected workspace/modal aggregator and the separately rendered reverse-budget modal. It is not proof that no other dialogs or portals exist elsewhere.\n\n## 4. Confirmed design risks and limits

1. **Portal ownership is fragmented.** `AppModalsPortal` is an ordinary React aggregator, while at least 14 explicit modules are covered by the repository's portal contract test and create portals to `document.body`. This is a verified mixed mounting model, not one canonical portal host. The 14-file test-backed inventory is verified; repository-wide completeness beyond that explicit contract remains open.
2. **Modal behavior is not uniformly delegated.** Shared hook adoption is visible in selected dialogs, while `RadarPrimitives` has an independent implementation and the secondary-modal group uses one ref for only a subset of its modal states.
3. **Topmost behavior depends on DOM order across mixed mount locations.** The shared hook guards Escape and Tab using the last matching dialog in document order. Body-level portals and ordinary descendants can produce a DOM order that differs from intended visual stack order unless centrally coordinated.
4. **Background inertness is not established.** The shared hook traps focus inside its own dialog and locks body overflow, but the inspected implementation does not set `inert` or `aria-hidden` on the application background. A focus trap alone does not prove that all background interaction paths are disabled.
5. **Scroll lock is reference-counted but global.** A module-level counter preserves the original `body.style.overflow` until the final hook consumer closes. It does not, in the inspected source, establish scrollbar-gap compensation, iOS visual-viewport behavior, or coordination with non-hook dialogs.
6. **Focus restoration under overlapping dialogs needs runtime validation.** Each hook instance stores its own previously focused element and restores it on cleanup. The intended nested-dialog sequence should be tested, including when a lower dialog closes while another remains open.
7. **Layer collisions are possible by declared values.** Feature dialogs at z-50 and invalid-city overlay at z-55 have an ordering conflict if simultaneously mounted. Whether that state is reachable and how stacking contexts affect the result require runtime inspection.
8. **Accessibility naming is inconsistent in the inspected examples.** Some dialogs use `aria-label`, while the primitive uses `aria-labelledby`. Both can be valid, but every dialog must have a stable accessible name and a deliberate initial focus target.

## 5. Canonical ownership contract

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

## 6. Acceptance criteria

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

## 7. Source review outcome

**VERIFIED — source inventory:** the named shell, aggregator, shared focus hook, dialog-stack helper, primitive dialog, 13 modal entry-point modules, and three body-level portal implementations were fetched from the active design branch.

**IMPLEMENTED — NOT VERIFIED:** this document records the design contract and acceptance criteria; no application implementation was changed.

**NOT VERIFIED:** full-repository portal-root inventory, runtime stacking ancestry, focus/inert behavior, scroll-lock behavior on mobile browsers, and screen-reader operation.

**BLOCKED:** browser/device QA remains unavailable while the development device is offline.

## 8. Next action

Complete a full modal entry-point and portal-root inventory, then validate nested-dialog focus, inert background, scroll locking, and layer ordering in a connected browser/device. Only after that evidence is available should the overlay coordinator be translated into an implementation proposal and frontend implementation authorization requested.
