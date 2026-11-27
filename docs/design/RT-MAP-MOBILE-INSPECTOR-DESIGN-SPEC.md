# DESIGN-MAP-002 — Mobile Neighborhood Inspector Sheet

- **Date:** 2026-11-27
- **Branch:** `design/rt-map-workspace-ux-2026-11-27`
- **Parent package:** `DESIGN-MAP-001`
- **Status:** `DESIGN_SPEC_READY — PRODUCTION_VISUAL_QA_BLOCKED`
- **Scope:** Mobile inspector interaction design and design-to-code reconciliation. No application source or runtime behavior changed.

## 1. Current source evidence

Inspected current blobs:
- `src/components/NeighborhoodInspectorDrawer.tsx` — `8392f32cafb18b1190143e6761835cb3c11fa844`
- `src/utils/productViewRouterShellClasses.ts` — `044852f9272bea1a4bdd68db8ad44c7462723582`
- `tests/bottom-sheet-snap-math.test.ts` — `8db1c24daf4f4197c6e15f2f28cd98a2b097b7d1`
- `src/styles/tokens.css` — `9209ec2078bb741e1f3c3457c25501166f99a6a5`
- `docs/product-assessment/CAMPAIGN-PROD-01/08-acceptance-test-plan.md` — `9c7d8665f488149cdbd93c6bc2c74633fa1257c1`

## 2. Verified implementation mismatches

| Concern | Existing utility / test contract | Current component | Finding |
|---|---|---|---|
| Collapsed | `DEFAULT_BOTTOM_SHEET_CONFIG.collapsedHeight = 78`; pure test expects 78px | `mobileSheetOpen=false` applies `hidden`; no visible 72/78px mobile collapsed dock | State contract is not wired to rendered geometry |
| Peek | Utility ratio 0.40; test expects 338px at 844px viewport | CSS `h-[50dvh]` | 10vh above target |
| Expanded | Utility ratio 0.86; test expects 726px at 844px viewport | CSS `h-[84dvh]` | 2vh below target |
| Handle hit area | D3 says primary mobile controls >=44×44px | `min-h-[24px]` | 20px below target |
| Gesture lifecycle | Pure utility computes next state | Component has `onPointerDown` and `onPointerUp`; no `onPointerMove` or `onPointerCancel` | No continuous drag feedback and cancellation path is absent |
| State ownership | Helper supports collapsed/peek/expanded | Component state is `peek/expanded`; collapsed is a separate boolean-driven display:none | Two competing state representations |
| Tap alternative | D2 requires single-tap transitions across three states | Handle toggles open/closed; header button toggles peek/expanded | No explicit, deterministic three-state cycle in the sheet control |

Important correction to historical audit records: `.radar-drawer-scroll-container` and `.radar-drawer-drag-handle` are currently applied in JSX. The earlier claim that these classes are absent/orphaned is stale. The handle class is present, but its JSX minimum height remains 24px.

## 3. Acceptance-document drift

The current acceptance test plan specifies:
- collapsed: 72px
- peek: approximately 40dvh
- expanded: approximately 86dvh

The actual helper and unit test specify 78px, 40%, and 86%. The current component uses hidden, 50dvh, and 84dvh. These are three distinct contracts.

**Design decision:** Treat the pure utility and its tests as the current implementation-adjacent contract (78px / 40% / 86%), unless product owners explicitly choose the older 72px target. Align the acceptance document in a later documentation-only cleanup after confirming the intended bottom-nav/safe-area geometry. Do not silently change values in application code.

## 4. Selected interaction model

One canonical state machine:
- `collapsed`: a visible 72–78px neighborhood summary dock; map remains usable. The exact height must be validated against the 64px mobile navigation and safe-area inset.
- `peek`: 40dvh target; title, provenance/trust pill, two-column buy/rent reference metrics, and tab bar should remain visible above the fold where the viewport permits.
- `expanded`: 86dvh target, capped by available viewport height and top chrome.

One source of truth should drive:
1. `data-snap-state`
2. actual rendered height/transform
3. aria-expanded / accessible state
4. visible controls and focus management
5. backdrop visibility
6. map interaction availability

## 5. Gesture and keyboard contract

- Dedicated drag handle: minimum 44×44px hit region, with a visible 40×6px grip centered inside it.
- Pointer capture lifecycle: `pointerdown`, `pointermove`, `pointerup`, `pointercancel`, and lost-capture cleanup.
- Use vertical displacement and velocity to choose a snap target; clamp live drag displacement to the three valid detents.
- Do not attach sheet dragging to the scrollable content body. Preserve native vertical scrolling within the body.
- Provide explicit single-tap controls for collapse, peek, and expand; dragging is never the only path.
- Keyboard: buttons expose clear labels and state; Escape closes only when appropriate; focus remains predictable when the sheet changes state.
- Respect `prefers-reduced-motion`; use existing motion tokens and avoid spring overshoot.
- On selected-neighborhood changes, preserve a predictable initial state; do not unexpectedly reopen or reset while the user is actively reading without an explicit product rule.

## 6. Responsive and RTL rules

- Mobile portrait: collapsed state leaves the largest map viewport; peek gives concise decision context; expanded gives full inspector content.
- Mobile landscape / short viewport: cap expanded height to available viewport and ensure inner content scrolls; do not cover the global header.
- Tablet: choose dock vs bottom sheet based on actual map width, not only a breakpoint; retain usable map canvas.
- Desktop: preserve existing 356px side dock and its independent desktop collapse behavior.
- RTL: maintain Persian reading order and right-aligned content; directional chevrons must reflect action (expand/collapse), not be mirrored blindly. Isolate numeric values with tabular numerals and bidi-safe formatting.

## 7. Above-the-fold content hierarchy

1. Drag handle and state control.
2. Neighborhood name and district.
3. One-line data provenance / epistemic status.
4. Buy and rent reference metrics in a two-column group.
5. Four inspector tabs.
6. Secondary details and long-form analysis below the fold.

Do not place favorite/share actions above the neighborhood title or let them push the trust label into a second line on 390px widths.

## 8. Interactive design artifact

A second chat prototype was produced with three selectable states, a schematic map-space response, a selected neighborhood summary, reference metrics, four tabs, and explicit expand/collapse controls. It is an interaction concept, not a browser-rendered replica of the React component.

## 9. Independent design critique

**Decision: ACCEPT AS DESIGN SPECIFICATION; HOLD PRODUCTION APPROVAL.**

Strengths:
- Single explicit three-state mental model.
- Tap alternatives complement gestures.
- Clear progressive disclosure and map-space priority.
- Trust/provenance status appears before detailed analysis.
- Existing desktop dock is not forced into a mobile interaction model.

Required before implementation:
- Reconcile 72px vs 78px collapsed target.
- Validate 44px handle and bottom-navigation safe area on physical devices.
- Resolve the single-source-of-truth state model.
- Add cancellation and continuous drag behavior.
- Measure overlap against FloatingTopBar and global chrome.
- Validate all three states at 320×568, 360×800, and 390×844.

## 10. Execution blocker and next action

Desktop Commander reports the registered MacBook as offline (last seen 23h ago). Therefore the requested production screenshots and runtime DOM geometry could not be captured in this session.

**Next exact action:** reconnect the development machine/browser, capture current product at 320×568, 360×800, 390×844, and 844×390, then validate the existing component against this spec. Until that evidence exists, do not mark PAGE-02, D1–D4, or production visual QA as passed.

No application code, tests, API, or backend behavior were modified.
