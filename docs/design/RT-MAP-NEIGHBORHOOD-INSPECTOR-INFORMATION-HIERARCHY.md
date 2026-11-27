# DESIGN-MAP-005 — Neighborhood Inspector Information Hierarchy & Data Provenance

**Status:** Design specification ready; implementation and rendered QA not authorized / not verified  
**Scope:** Neighborhood inspector header, five-tab information architecture, above-the-fold content, market-data provenance and progressive disclosure  
**Repository:** `bijanbijane/radartehran`  
**Branch:** `design/rt-map-workspace-ux-2026-11-27`

## 1. Evidence reviewed

Active-branch source inspected:
- `src/components/NeighborhoodInspectorDrawer.tsx`
- `src/components/NeighborhoodInspectorTabs.tsx`
- `docs/implementation/UX-AUDIT-IMPLEMENTATION-REGISTER.md`

Verified source facts:
- The inspector exposes five tabs: `scorecard`, `market`, `bargains`, `reviews`, and `vote`. The tablist uses tab/tabpanel semantics, selected state, roving tabIndex, and arrow/Home/End keyboard handling.
- The header currently combines budget-fit status, neighborhood name, traffic-zone badge (Tehran only), price-truth text, observed-sample/provenance badge, optional visit count, favorite/share actions, and headline price figures.
- The scorecard begins with a value summary and then a budget-bridge advisor and smart payment structurer; the tab component also imports commute, purchasing-power, epistemic-disclaimer and lazy-render modules.
- The inspector header exposes both a price-truth badge and a provenance badge, but their relationship, freshness semantics, and the distinction between observed listings and reference estimates need a consistent explanatory hierarchy.
- The mobile inspector is a scrollable, fixed-height sheet with 50dvh peek and 84dvh expanded classes in the current component. The top-level shell and panel-state architecture are addressed in DESIGN-MAP-004, not redefined here.
- PAGE-02 remains NOT STARTED in the UX implementation register and requires desktop/mobile screenshots.

No application code, tests, or runtime configuration were changed.

## 2. Design problem

The inspector serves several different user intents at once:
1. Decide whether the neighborhood is relevant to the user's budget and housing mode.
2. Understand the neighborhood's quality/value profile.
3. Assess market conditions and the confidence/coverage behind price figures.
4. Inspect available bargains and community evidence.
5. Contribute a resident assessment.

The current header and scorecard can expose many badges, numbers, and actions before the user reaches the tab-specific task. The design must reduce interpretation cost without hiding uncertainty or removing existing capabilities.

## 3. Information hierarchy

### Tier A — Persistent neighborhood identity
Keep visible at the top of the inspector:
- Neighborhood name and city context.
- Overall score with its scale explicitly available (e.g. out of 10).
- Current mode (rent/buy) and budget-fit result.
- One primary price anchor relevant to the selected mode.

Avoid repeating the same price value in multiple header badges. Favorite and share remain secondary icon actions with accessible names.

### Tier B — Decision-critical qualification
Show a compact, readable evidence row directly below identity:
- Price evidence class: observed eligible listings, observed listings plus reference baseline, or reference estimate only.
- Sample count where meaningful.
- Price-truth/coverage explanation via a short label and an accessible disclosure.
- Traffic-zone or other city-specific contextual badge only when applicable.

Do not imply that an observed sample is a complete market census. Do not call reference estimates live data. A count of zero must be explicit and must not visually resemble a positive live-data state. Where freshness timestamps are unavailable, omit freshness claims rather than inventing them.

### Tier C — Task-specific content
Keep the five tabs and make each tab's purpose legible:
- **کارنامه / Scorecard:** fit, score rationale, affordability bridge, and the few inputs that materially change the result.
- **بازار / Market:** price level, trend, sample coverage, methodology and limitations; put provenance adjacent to the chart/metric it qualifies.
- **فرصت‌ها / Bargains:** available opportunities, eligibility/status, and evidence/last-observed context when supplied by source data.
- **نظرها / Reviews:** resident feedback with recency and sample context where available.
- **امتیازدهی / Vote:** contribution form, privacy/location explanation, validation state and submission feedback.

Do not move community opinions into the market evidence tier or merge modeled estimates with observed listings.

## 4. Above-the-fold contract

At mobile peek and expanded states:
- Peek should expose neighborhood identity, mode/budget fit, one primary price anchor, evidence class, and a clear affordance to expand. It must not attempt to show the full scorecard.
- Expanded should begin with the same identity/evidence block, then the tablist, then the selected tab's first decision-supporting section.
- The first screen of Scorecard should prioritize the summary and budget bridge. Defer secondary calculators, long comparison tables, galleries and deep analytical widgets below the first decision section or behind explicit expansion.
- The first screen of Market should pair each headline metric with its evidence class/sample coverage and a visible route to methodology.
- Bargains and Reviews should show useful empty/loading/error states rather than collapsing into blank space.
- Vote should explain what is submitted and whether location is optional before requesting geolocation.

On desktop, preserve the same hierarchy while allowing the inspector to scroll independently from the map. The map remains the dominant workspace surface.

## 5. Data provenance and epistemic presentation

Use consistent, non-color-only labels:
- **Observed listing:** an eligible listing record actually included in the aggregate.
- **Reference baseline:** a neighborhood reference value used as a fallback or bootstrap.
- **Estimate/model:** a derived or modeled value, not a directly observed transaction.
- **Community report:** user-submitted opinion or report, not a verified market measurement.
- **Live signal:** only when a source contract establishes current live retrieval and its timestamp/status.

For mixed aggregates, state the composition (observed + reference) and avoid presenting the combined value as a pure observed-market statistic. Keep provenance adjacent to the metric, not only in a global disclaimer. Use text and icon/shape cues in addition to color. Provide a short explanation on demand without forcing a long methodology block into the initial viewport.

## 6. Interaction and accessibility requirements

- Preserve tablist semantics, roving focus, ArrowLeft/ArrowRight, Home/End behavior and selected/controls relationships; verify RTL expectations explicitly because physical arrow direction and logical tab order can diverge.
- Keep keyboard focus visible and ensure tab changes do not unexpectedly reset the user's scroll position.
- Ensure the inspector's independent scroll region does not trap keyboard or touch scrolling.
- All icon-only actions need localized accessible names; disclosures need expanded state and controlled-region relationships.
- Do not rely on color alone for budget fit, evidence class, listing status or vote feedback.
- Respect reduced motion and avoid layout jumps when lazy content loads.
- Maintain 44px minimum mobile touch targets for primary actions; verify actual rendered dimensions rather than relying on utility classes alone.

## 7. Content density and responsive behavior

- Use one dominant headline metric per decision context; secondary metrics should be grouped and visually subordinate.
- Avoid placing more than one explanatory badge row between neighborhood identity and the tablist.
- Long tab labels may wrap, but the tablist must remain readable at 320px width without horizontal page overflow.
- Keep charts, tables and galleries lazy/deferred where appropriate, but provide stable loading dimensions to prevent scroll jumps.
- On narrow screens, prioritize text clarity and evidence labels over decorative chart chrome.
- On desktop, do not allow the inspector's content density to obscure the map or create competing fixed overlays.

## 8. Acceptance criteria

1. A first-time user can identify the neighborhood, mode, budget fit and primary price anchor without opening a tab.
2. The user can distinguish observed listing evidence from reference estimates without relying on color or opening a separate methodology page.
3. Sample count and mixed-source composition are stated accurately; zero observed listings are unambiguous.
4. Scorecard's first viewport supports the core affordability decision before secondary analytical modules.
5. Market metrics show provenance adjacent to the metric/chart and expose methodology.
6. Empty, loading, error and stale/unknown freshness states are designed for Bargains and Reviews.
7. Vote explains geolocation purpose and optionality before prompting.
8. Tabs remain keyboard-operable and usable in Persian RTL and English LTR at 320px, 360px, 390px, tablet portrait/landscape and desktop.
9. Mobile peek and expanded states preserve the same identity/evidence hierarchy and do not hide the expand affordance.
10. No claim of live market data or freshness is made without source evidence.

## 9. QA plan and current status

| Check | Required evidence | Status |
|---|---|---|
| Source hierarchy review | Active-branch component inspection | VERIFIED |
| Provenance vocabulary/contract | Design specification | DOCUMENTED — NOT RUNTIME VERIFIED |
| 320/360/390px layout | Rendered screenshots + overflow checks | NOT RUN |
| Desktop inspector/map balance | Rendered screenshots | BLOCKED — development device offline |
| RTL/LTR tab keyboard behavior | Browser keyboard test | NOT RUN |
| Screen reader labels/disclosures | Accessibility audit | NOT RUN |
| Empty/loading/error states | Component/runtime review | NOT RUN |
| Application implementation | Explicit frontend authorization | NOT AUTHORIZED |

## 10. Handoff boundary

This package is a design contract only. It does not authorize frontend implementation and does not claim that any proposed hierarchy is already implemented. After the development browser is available, validate the current rendered behavior against this contract, reconcile any source/data limitations, and request explicit authorization before changing application code.

**Related:** DESIGN-MAP-001 workspace direction; DESIGN-MAP-002 mobile inspector geometry; DESIGN-MAP-003 map-control ownership; DESIGN-MAP-004 panel state architecture.
