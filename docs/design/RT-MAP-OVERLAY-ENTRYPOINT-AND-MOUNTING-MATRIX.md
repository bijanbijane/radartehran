# RT-MAP-OVERLAY-ENTRYPOINT-AND-MOUNTING-MATRIX

**Package:** DESIGN-MAP-013  
**Date:** 2026-11-27  
**Branch:** design/rt-map-workspace-ux-2026-11-27  
**Scope:** Active-branch source audit only. No application code or tests changed.

## 1. Purpose

Extend DESIGN-MAP-012 with the remaining modal entry points, route-driven state, local overlay state, and the actual mount/portal model in AppModalsPortal.

## 2. Additional active-branch files reviewed

- `src/components/AppModalsPortal.tsx`
- `src/components/useAppUrlAndTitleSync.ts`
- `src/components/views/ProductViewRouter.tsx`
- `src/components/FloatingTopBar.tsx`
- `src/components/RadarWorkspaceShell.tsx`
- `src/components/ShareModal.tsx`
- `src/components/CompareModal.tsx`
- `src/components/ShortlistMatrixModal.tsx`
- `src/components/SmartSuggestModal.tsx`
- `src/components/AgencyModal.tsx`
- `src/components/NationwideProvinceModal.tsx`
- `src/components/OnboardingWizardModal.tsx`
- `src/components/modals/ReverseBudgetDiscoveryModal.tsx`
- `src/components/ExpansionModulesModal.tsx`

A direct fetch of the previously assumed path `src/components/InstantListingVerifierModal.tsx` returned 404; AppModalsPortal imports the component from `src/components/modals/InstantListingVerifierModal`. The incorrect path is not treated as evidence of a missing component.

## 3. Expanded state entrypoint matrix

| State / surface | Open/close entry points verified | Mount / ownership observations |
|---|---|---|
| Share | useAppUiState; AppModalsPortal conditional; close callback passed to ShareModal | ShareModal uses shared useDialogFocus; central Escape clears share flag |
| Compare | useAppUiState; ProductViewRouter; RadarWorkspaceShell; FloatingTopBar; AppModalsPortal; useAppUrlAndTitleSync | URL parser can open/close compare state; CompareModal uses shared useDialogFocus |
| Shortlist matrix | useAppUiState; RadarWorkspaceShell; ProductViewRouter; AppModalsPortal | ShortlistMatrixModal uses shared useDialogFocus |
| Smart suggestions | useAppUiState; FloatingTopBar; RadarWorkspaceShell; ProductViewRouter; AppModalsPortal | SmartSuggestModal uses shared useDialogFocus |
| Agency / bargain / sponsor | useAppUiState; FloatingTopBar; RadarWorkspaceShell; NeighborhoodInspectorDrawer/Tabs; NeighborhoodBargainsAndVotesTabs; ProductViewRouter; AppModalsPortal | AgencyModal uses shared useDialogFocus; state includes independent context/form fields |
| Nationwide province | useAppUiState; RadarWorkspaceShell; FloatingTopBar; AppModalsPortal | NationwideProvinceModal uses shared useDialogFocus |
| Onboarding | useAppUiState; FloatingTopBar; RadarWorkspaceShell; AppModalsPortal; persistence/derived-state path | OnboardingWizardModal uses shared useDialogFocus; close handler persists completion and may open inspector sheet |
| Expansion modules | useAppUiState; FloatingTopBar; RadarWorkspaceShell; ProductViewRouter; AppModalsPortal | One nullable `expansionModalType` selects commission/contract/telegram; component uses shared useDialogFocus |
| Reverse budget | Local `showReverseBudgetModal` state in RadarWorkspaceShell; ProductViewRouter callback; AppModalsPortal is not its owner | Separate local state from useAppUiState global Escape list; ReverseBudgetDiscoveryModal is a direct createPortal surface and uses shared useDialogFocus |
| Admin | useAppUiState; AppModalsPortal effect | Not a conventional modal in current flow: effect resets flag and navigates to `/admin` via history/popstate |
| Listing verifier | useAppUiState; ProductViewRouter; RadarWorkspaceShell; AppModalsPortal | Imported from `./modals/InstantListingVerifierModal`; conditional mount uses `isOpen` and onClose |
| Hedonic valuation | useAppUiState; ProductViewRouter; FloatingTopBar; RadarWorkspaceShell; NeighborhoodInspectorDrawer/Tabs; AppModalsPortal | Conditional mount in AppModalsPortal; detailed focus behavior requires component-specific follow-up |
| Price trend | useAppUiState; ProductViewRouter; AppModalsPortal | Conditional mount in AppModalsPortal; component-specific focus behavior requires follow-up |
| Super modules | useAppUiState; ProductViewRouter; FloatingTopBar; RadarWorkspaceShell; AppModalsPortal | Quick-submit transition closes super modules then opens AgencyModal; budget transition closes super modules and changes workspace budget state |

## 4. Important architecture findings

### A. AppModalsPortal is a conditional aggregator, not a universal portal host

The inspected file uses React.lazy and conditional rendering for many surfaces. It does not itself wrap the entire modal collection in createPortal. Individual modal components may create their own portals, but that is a per-component implementation detail.

### B. URL synchronization is a modal state writer

`useAppUrlAndTitleSync.ts` receives `setShowCompareModal` and can open compare mode when a public compare route is parsed. It also closes compare state when route/map navigation leaves the compare route. Therefore, a complete state transition graph must include URL/history-driven transitions, not only button click handlers.

### C. Reverse budget is a separate shell-local state family

`showReverseBudgetModal` is declared in `RadarWorkspaceShell`, passed through ProductViewRouter, and rendered through the shell's modal composition. It is not part of the `useAppUiState` global Escape clear list shown in DESIGN-MAP-012. The modal itself uses a shared focus hook and createPortal. Whether its close path is correctly handled by its own Escape hook must be verified in the component/runtime.

### D. Admin modal flag is converted to route navigation

The AppModalsPortal effect checks `showAdminModal`, resets it, and navigates to `/admin` if needed. This flag should not be treated as an ordinary modal stack entry without changing the product flow.

### E. Modal hook adoption is not equivalent to coordinator integration

Share, Compare, Shortlist Matrix, Smart Suggest, Agency, Nationwide Province, Onboarding, Expansion, and Reverse Budget use the shared `useDialogFocus` hook in the inspected source. The hook still determines topmost ownership by DOM order, and the separate global Escape handler remains active. Hook adoption alone does not provide one central state transition authority.

## 5. Updated transition model

The future overlay coordinator must support:

- state-driven overlays owned by useAppUiState;
- shell-local transient overlays (e.g. reverse-budget and map workspace panels);
- URL/history-driven overlays (compare route);
- route transitions that replace an overlay with a full page (admin);
- parent-to-child modal transitions (SEO to Legal/PWA, super modules to Agency);
- close-and-open transitions that preserve explicitly selected context;
- lazily mounted modal components and individually portaled modal surfaces.

A transition should declare:
`source`, `target`, `trigger`, `closePolicy`, `preserveState`, `focusReturnTarget`, and `historyEffect`.

## 6. Additional regression acceptance tests

1. Enter compare mode from a URL; assert the compare modal/route state is coherent, and browser back/forward transitions restore the correct overlay state.
2. Close compare by navigation and verify unrelated workspace overlays are not cleared.
3. Trigger admin navigation; verify the admin flag is consumed once and the route is the sole active admin surface.
4. Open reverse-budget while another transient map panel is active; verify declared exclusivity and Escape behavior without relying on the useAppUiState global handler.
5. Trigger the Super Modules quick-submit action; verify parent closes, Agency opens, and focus is transferred/restored according to an explicit parent-child transition.
6. Trigger SEO-to-Legal and SEO-to-PWA transitions; verify exactly one active modal and correct focus origin.
7. Close onboarding after selecting a neighborhood; verify the intended inspector opens and focus does not return to a removed trigger.
8. Verify lazy loading does not create a period in which the overlay is logically open but lacks an accessible mounted surface.
9. Verify direct portal and ordinary React-root modal surfaces share one visual and keyboard ownership order.

## 7. QA boundary

- **Source review:** VERIFIED for the fourteen listed valid source paths and route/state contracts.
- **Expanded entrypoint inventory:** VERIFIED for the families listed; repository-wide completeness remains NOT VERIFIED.
- **URL/history transitions:** SOURCE REVIEWED; runtime NOT RUN.
- **Reverse-budget Escape behavior:** NOT VERIFIED.
- **Modal stack and focus runtime:** NOT RUN.
- **Application code/tests:** unchanged.
- **Production readiness:** not established.

## 8. Handoff

Continue by reviewing the remaining component-specific keyboard/focus contracts for HedonicValuationModal, NeighborhoodPriceTrendModal, and the correctly located InstantListingVerifierModal. Then reconcile the complete route/state writer graph. No implementation changes until explicit frontend authorization.
