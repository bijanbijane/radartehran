# Radar Tehran Design Studio — Mobile Neighborhood Inspector
**Date:** 2026-11-27  
**Repository:** `bijanbijane/radartehran`  
**Baseline:** `main` at `456dcacb387b908797756863b10da1f7104b658e`  
**Design branch:** `design/mobile-neighborhood-inspector-2026-11-27`  
**Status:** Concept and handoff complete; frontend implementation not authorized or performed.

## 1. Design package objective
Improve the mobile Neighborhood Inspector so a user can understand a selected neighborhood's affordability, core housing metrics, and quality indicators without losing the spatial context of the map or navigating a long, unstructured stack of cards.

This package follows the repository's existing recommended direction: **Hybrid Option A+C — Spatial-First Progressive Disclosure & Unified Purchasing Power Engine**. It does not replace the multi-view application with a map-only experience.

## 2. Evidence inspected
- `src/components/NeighborhoodInspectorDrawer.tsx` — current drawer structure, header, two housing metric cards, five current tabs, and current mobile snap/gesture behavior.
- `src/components/NeighborhoodInspectorTabs.tsx` — scorecard content and neighborhood quality indicators.
- `src/components/RadarBottomNav.tsx` — five-column mobile navigation shell and More sheet.
- `src/components/FloatingTopBar.tsx` — map controls and floating search/filter chrome.
- `src/styles/tokens.css` — existing color, typography, spacing, radius, and geometry tokens.
- `docs/product-assessment/CAMPAIGN-PROD-01/00-executive-assessment.md`
- `docs/product-assessment/CAMPAIGN-PROD-01/05-design-alternatives-and-decision-matrix.md`
- `docs/product-assessment/CAMPAIGN-PROD-01/06-proposed-design-blueprint.md`
- `docs/engineering/assessments/ASSESS-002-drawer-information-density.md`
- Draft PR #68, which proposes a 44px minimum drag-handle hit area and a 44×44px map-legend close control.

### Verified current implementation facts
1. The drawer currently supports pointer-based gesture handling and `collapsed / peek / expanded` snap states. The current component uses 50dvh for peek and 84dvh for expanded; the older assessment's claim that the sheet is tap-only is stale relative to current `main`.
2. The drag handle in current `main` still declares `min-h-[24px]`. Draft PR #68 proposes changing it to 44px and adding regression assertions. That PR is not merged.
3. The current drawer already renders a two-column buy/rent metric area and five tabs (`scorecard`, `market`, `bargains`, `reviews`, `vote`). Therefore, older statements that the price cards and tabs are entirely absent above the fold must not be repeated as current facts without a fresh viewport reproduction.
4. The existing design tokens specify Vazirmatn, deep petroleum green (`#176b63`), warm neutral surfaces (`#f6f8f6`, `#ffffff`), semantic status colors, 8/12/16px component radii, and a 4px-based spacing scale.
5. The repository's design blueprint recommends a three-tier inspector, consolidated trust disclosure, four task-oriented inspector sections, and a 4+1 mobile navigation model. The current five-tab implementation differs; that is a proposed information-architecture change, not an existing feature.

## 3. Selected design direction
**Spatial-first, compact verdict header, progressive disclosure.**

Keep the map visible in the upper portion of the mobile screen. The inspector rises from the bottom and is divided into three levels:

### Tier 1 — Sticky neighborhood verdict
- 44px minimum gesture/tap handle with a visible drag affordance.
- Neighborhood name and geographic context.
- One compact affordability/status indicator.
- One consolidated data-trust disclosure, expandable on demand.
- Favorite and share actions, each with a minimum 44×44px touch target.
- Two primary metric tiles: buy estimate and full deposit/rent estimate, with units and target area explicit.
- No repeated global currency, language, theme, or area-unit controls in the drawer.

### Tier 2 — Task-oriented tabs
Use the product blueprint's four semantic groups as the target IA:
1. **کارنامه** — livability, access, safety, air, and neighborhood conditions.
2. **بازار و روند** — asking/observed prices, deal estimates, trend charts, and valuation tools.
3. **شکارچی** — current listings and under-market opportunities.
4. **دیدگاه و میدان** — resident reviews, votes, and field observations.

Migration from the existing five tab IDs requires a deliberate mapping and regression tests. Do not silently delete or merge existing capabilities.

### Tier 3 — On-demand advanced analysis
- Keep the Stage-2 / Pro analytical suite collapsed by default in Simple mode.
- Preserve the ability to open it explicitly.
- Keep advanced provenance, micro-neighborhood analysis, and comparison details available without forcing them into the default scroll path.

## 4. Mobile composition and responsive rules
- **320×568:** prioritize map visibility, a compact collapsed sheet, and a direct tap path to the primary verdict. Do not force all tabs into a cramped row; use horizontal scrolling or a compact segmented control with accessible focus.
- **390×844:** in peek state, show the neighborhood identity, trust/status, primary metric tiles, and tab entry point where practical. In expanded state, keep the header and tab selector sticky while the selected tab content scrolls independently.
- **Tablet:** transition to a docked inspector with map canvas preserved; avoid simply scaling the mobile sheet.
- **Desktop:** preserve the existing right-side 356px inspector behavior unless a separate desktop redesign is commissioned.
- Avoid overlap between FloatingTopBar and the expanded inspector. Floating map controls must yield to the sheet's z-order and disappear when the sheet occupies their region.
- Respect safe-area insets and the existing mobile bottom navigation.
- Every drag transition must also have a non-drag alternative (tap control); support keyboard operation and visible focus.

## 5. Design tokens and visual language
Reuse the repository's existing tokens; do not introduce a parallel palette.
- Brand: `#176b63`; hover: `#14534e`; accent: `#1b7f74`.
- Canvas: `#f6f8f6`; surface: `#ffffff`; subtle surface: `#f1f4f2`.
- Primary text: `#182522`; secondary: `#34433e`; muted: `#586760`.
- Borders: `#dce3df` and `#c5d0ca`.
- Typography: Vazirmatn; use tabular numerals and bidi isolation for all financial values.
- Spacing: existing 4px scale; cards 12px radius; sheet 20px radius.
- Use semantic green/amber/red only for the actual affordability state; never use color alone to communicate meaning.

## 6. Data trust and financial content
- Distinguish asking price, observed listing sample, reference estimate, and estimated transaction price.
- Every financial metric must show its unit, area basis, and period/source status where applicable.
- Missing, stale, blocked, and not-applicable values must remain distinct; do not fabricate a fallback value.
- Consolidate repeated provenance messages into one expandable trust disclosure, but retain all underlying evidence and policy details.
- Sample values in visual concepts are illustrative only and are not verified live neighborhood data.

## 7. Independent design critique
**Decision: accept as a direction concept, not as an implementation-ready visual spec without the following corrections.**

| Severity | Finding | Required correction |
|---|---|---|
| High | A static mockup cannot prove real map behavior, sheet physics, responsive layout, or text fidelity. | Build and inspect an interactive prototype or actual browser rendering before visual QA sign-off. |
| High | The generated concept includes illustrative neighborhood and financial values. | Replace all sample values with verified API-bound data before production use. |
| High | Four target tabs differ from the five existing tab IDs. | Produce a capability-to-tab mapping and preserve route/test contracts before implementation. |
| Medium | A dense header can still starve the map and content area on 320px screens. | Test 320×568 and 390×844; use progressive disclosure and remove duplicate global controls. |
| Medium | A visible drag handle alone does not satisfy accessibility. | Provide tap alternatives, keyboard behavior, 44px target, and focus-state verification. |

## 8. Acceptance criteria for implementation
- [ ] No duplicated city/search/budget controls between global header and FloatingTopBar on mobile.
- [ ] Map and sheet do not overlap in a way that obscures controls or content.
- [ ] Handle and all critical icon actions meet a 44×44px minimum target.
- [ ] The sheet supports collapsed, peek, and expanded states with pointer cancellation and scroll handoff.
- [ ] All existing five-tab capabilities are mapped and preserved before any four-group migration.
- [ ] The default view exposes neighborhood identity, trust status, buy/rent metrics, and tab navigation without redundant banners.
- [ ] Stage-2 advanced analysis is closed by default in Simple mode and remains accessible.
- [ ] Persian RTL, financial bidi isolation, dark mode, keyboard navigation, and screen-reader labels are verified.
- [ ] Browser screenshots and interaction tests pass at 320×568, 390×844, tablet, and desktop.
- [ ] `npm run lint`, `npm run arch:check`, focused contract tests, and production build pass.

## 9. Scope and next action
No application source, API contract, database schema, or production configuration was modified. The next design package should address **mobile map chrome and unified navigation** as a connected system, then return to the inspector for a browser-rendered validation pass. Implementation remains outside this design-only package.
