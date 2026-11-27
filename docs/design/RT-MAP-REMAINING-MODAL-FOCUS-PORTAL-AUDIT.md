# RT-MAP-REMAINING-MODAL-FOCUS-PORTAL-AUDIT

**Package:** DESIGN-MAP-014  
**Date:** 2026-11-27  
**Branch:** design/rt-map-workspace-ux-2026-11-27  
**Scope:** Active-branch source audit only. No application code or tests changed.

## 1. Purpose

Complete the component-specific source review assigned by DESIGN-MAP-013 for HedonicValuationModal, NeighborhoodPriceTrendModal, and InstantListingVerifierModal.

## 2. Source evidence

### A. HedonicValuationModal

Path: `src/components/HedonicValuationModal.tsx`

- Uses `useDialogFocus(open, onClose)`.
- Root dialog declares `role="dialog"`, `aria-modal="true"`, and `aria-labelledby="hedonic-modal-title"`.
- The returned focus ref is attached to the inner panel, which has `tabIndex={-1}`.
- The component is rendered in the ordinary React tree in the inspected source; it does not call `createPortal`.
- Root visual layer uses `z-50`.

**Source status:** focus hook and labelled modal semantics VERIFIED; portal absence VERIFIED in reviewed component.

### B. NeighborhoodPriceTrendModal

Path: `src/components/NeighborhoodPriceTrendModal.tsx`

- Uses `useDialogFocus(open, onClose)`.
- Declares `role="dialog"`, `aria-modal="true"`, and `aria-labelledby="neighborhood-price-trend-modal-title"`.
- Attaches the focus ref to the inner dialog panel.
- Uses `createPortal(modalContent, document.body)`.
- Portal backdrop/root uses `z-[9500]`.

**Source status:** focus hook, semantics, and direct portal VERIFIED.

### C. InstantListingVerifierModal

Path: `src/components/modals/InstantListingVerifierModal.tsx`

- Uses `useDialogFocus(isOpen, onClose)`.
- Attaches the returned ref to the inner dialog panel.
- Inner panel declares `role="dialog"`, `aria-modal="true"`, and an accessible `aria-label`.
- Uses `createPortal(modalContent, document.body)`.
- Portal backdrop uses `z-[9500]`.

**Source status:** focus hook, semantics, and direct portal VERIFIED.

## 3. Cross-component implications

1. These three components use the shared focus hook, but they are not integrated into a central overlay state coordinator.
2. Hedonic is an inline React-tree modal with z-50; Price Trend and Instant Listing Verifier portal to document.body with z-[9500].
3. The shared hook's topmost decision is based on DOM order of modal elements. The visual layer order is controlled separately by CSS z-index and portal/stacking-context placement.
4. Therefore, the inspected source does not prove that DOM-order topmost ownership always matches the visually topmost dialog when inline and portaled surfaces overlap.
5. This is a source-level integration risk, not proof that users can currently open these exact combinations or that the visible order is wrong.
6. No component-specific Escape listener was found in the reviewed sections; dismissal is delegated to the shared hook. The global window close-all listener remains an independent competing path documented in DESIGN-MAP-012.

## 4. Required overlay contract additions

- Overlay registration must provide one authoritative stack order used by both visual layering and keyboard/focus ownership.
- Portal and inline modal surfaces must register identically; DOM append order must not be an implicit stack API.
- The coordinator must own portal mount order or provide explicit z-layer tokens derived from the same stack.
- Only the visually topmost registered modal receives Escape and Tab ownership.
- Mixed portal/inline pairs must have deterministic parent/child or peer ordering.
- Focus refs remain unique to each modal root.

## 5. Required regression tests

1. Open Hedonic (inline) and Price Trend (portaled) in both orders; assert visual topmost and keyboard topmost are identical.
2. Open Instant Listing Verifier while another portal and one inline modal are mounted; verify exactly one active modal owns Escape and Tab.
3. Verify portal and inline surfaces restore focus to the correct trigger/parent after closing.
4. Verify CSS stacking contexts around the workspace shell do not cause an inline z-50 modal to appear below or above a portaled z-[9500] surface contrary to coordinator order.
5. Verify every registered dialog has a unique focus root and an accessible name.
6. Verify global Escape does not clear unrelated flags after a topmost modal consumes the key.

## 6. QA boundary

- **Source review:** VERIFIED for all three components.
- **Focus hook adoption:** VERIFIED.
- **Modal semantics:** VERIFIED.
- **Portal ownership:** VERIFIED per component.
- **Visual stack vs DOM order:** NOT VERIFIED at runtime.
- **Mixed portal/inline keyboard ownership:** NOT RUN.
- **Browser/device/screen-reader QA:** NOT RUN.
- **Application code/tests:** unchanged.
- **Production readiness:** not established.

## 7. Handoff

The selected component-level focus/portal inventory is complete for the three paths in this package. Continue by auditing remaining dialog components not yet covered by the current selected inventory, then consolidate the portal/inline layer ordering into the overlay transition matrix. No implementation changes until explicit frontend implementation authorization.
