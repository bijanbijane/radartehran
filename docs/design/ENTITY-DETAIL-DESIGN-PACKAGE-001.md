# Radar Tehran — Entity Detail Design Package 001

- **Package ID:** RT-DESIGN-ENTITY-DETAIL-001
- **Date:** 2026-11-27
- **Status:** `DESIGN_PROTOTYPE_READY / RUNTIME_NOT_VERIFIED`
- **Repository:** `bijanbijane/radartehran`
- **Branch:** `design/entity-detail-package-001`
- **Scope:** Product design, interaction design, design QA and handoff. No application code, API, database, Worker or production behavior was changed.

## 1. Why this package was prioritized

The entity-detail experience is the next high-impact unfinished product surface because the search-to-detail journey is not coherently connected to the canonical entity-detail feature. The existing feature architecture supports four core entities: property, listing, building and neighborhood. The actual navigation and page composition do not yet converge on that shared page.

## 2. Repository-grounded findings

The following findings were verified from the current `main` source files during this session:

| Area | Verified finding | Impact |
|---|---|---|
| Search selection | `ProductViewRouter.handleSearchEntitySelection` sends property and listing to `/properties/:id`, neighborhood to `/areas/:id`, service to `/services/providers/:id`, and other types to `/areas`. | The entity type is not consistently preserved in navigation. |
| Runtime path resolution | `resolveRouteFromLocation` resolves `/properties/:id` to the Properties view with `listingId`; `/areas/:slug` and legacy `/neighborhoods/:slug` resolve to Discover with an area slug. | These routes do not mount the canonical `UnifiedEntityDetailPage`. |
| Page mounting | `ProductViewRouter` imports `UnifiedSearchPage`, but no import or usage of `UnifiedEntityDetailPage` was found. | The unified entity page is not connected to the active product router. |
| Data loading | `UnifiedEntityDetailPage` reads `viewState` from `useEntityDetail`, but does not call the hook's returned `loadEntity`. Without `initialEntity`, the hook starts in its initial state and the page falls to Not Found. | A direct detail-page load cannot complete through this component as currently written. |
| Section navigation | `DetailPageShell` marks the selected tab but maps and renders every visible section. | Tabs do not behave as content navigation; all sections remain on screen. |
| Field provenance | `EntityDetailField` supports `sourceId`, `observedAt`, `updatedAt` and `limitationNoteFa`. Current `DetailMetadata` displays confidence and limitation text but omits the source ID and observed-at timestamp from each field card. | Users cannot inspect the full provenance promised by the data model. |
| Visual language | Detail components hard-code slate/dark surfaces and sky-blue active states. The main project tokens specify light neutral surfaces and deep petroleum green as the brand color. | The detail shell feels detached from Radar Tehran's established product identity. |

### Primary source files inspected

- `src/components/views/ProductViewRouter.tsx`
- `src/navigation/url/navigationUrlContract.ts`
- `src/navigation/registry/public.routes.ts`
- `src/features/entity-detail/pages/UnifiedEntityDetailPage.tsx`
- `src/features/entity-detail/hooks/useEntityDetail.ts`
- `src/shared/entity-detail-ui/DetailPageShell.tsx`
- `src/shared/entity-detail-ui/DetailHeader.tsx`
- `src/shared/entity-detail-ui/DetailMetadata.tsx`
- `src/shared/entity-detail-ui/DetailSection.tsx`
- `src/platform/entity-detail/core/EntityDetailTypes.ts`
- `src/platform/entity-detail/core/EntityDetailRegistry.ts`
- `src/platform/entity-detail/sections/SectionRegistry.ts`
- `src/platform/entity-detail/navigation/EntityDetailRoutes.ts`
- `src/styles/layers/tokens.css`
- `src/design-system/typographySystem.ts`

## 3. Design direction

Three materially different concepts were evaluated:

1. **Editorial data dossier:** information-first, entity identity at the top, section navigation, field-level evidence and a compact context rail.
2. **Map-first workspace:** a large map as the primary surface with entity facts in a side panel. Rejected as the universal default because property, listing, building and neighborhood do not share the same spatial eligibility or geometry.
3. **Chronological activity feed:** history and updates as the principal organizing structure. Rejected as the universal default because most first-visit tasks require identity, specifications, financial role and location before history.

**Selected:** Editorial data dossier with optional spatial context. It provides a stable shell for all four entity types and does not require a valid polygon to render the rest of the profile.

## 4. Interactive prototype delivered in ChatGPT

The prototype is presented in the conversation as a responsive, interactive interface—not as a screenshot or a production implementation.

Interactions included:
- Switch the sample entity type: listing, property, building or neighborhood.
- Switch visible sections: overview, specifications, financials, location, sources and history.
- Toggle the sample favorite state.
- Toggle the sample comparison state.
- Expand and collapse a field's sample source details.
- Expand and collapse the history rule note.

All sample property values and source identifiers are explicitly marked as illustrative. Save and compare are local prototype states only; they are not connected to the product's persistence or engagement APIs. A separate state explorer also renders Loading, Success, Partial, Stale, Conflict, Restricted, Deleted, Archived, Not Found and Error variants; its selector is local prototype state.

## 5. Design specification

### Foundations

Use the repository's established design tokens:

| Token | Value |
|---|---|
| Brand primary | `#176B63` |
| Brand secondary | `#279487` |
| Canvas | `#F6F8F6` |
| Surface | `#FFFFFF` |
| Subtle surface | `#F1F4F2` |
| Primary text | `#182522` |
| Secondary text | `#34433E` |
| Subtle border | `#DCE3DF` |
| Warning | `#875000` |
| Danger | `#A61B1B` |
| Font | Vazirmatn |
| Base spacing rhythm | 4px |
| Minimum primary touch target | 44px |

### Shared header

The entity header should include:
- Breadcrumb and return context.
- Entity type and display name.
- Lifecycle/page status as a separate dimension from data confidence.
- Neighborhood/city context where applicable.
- Actions shown only when permitted: favorite, compare, share, edit and report.
- Canonical identifier available as secondary metadata, not as the headline.

### Section navigation

The selected section must control the content visible below it. Do not merely highlight a tab while rendering every section.

The common shell may use these section families, filtered by entity type and permissions:
- Overview
- Specifications (where applicable)
- Pricing and valuation (where applicable)
- Location and GIS
- Media and documents
- Analytics
- Related entities
- History and provenance
- Activity (permission-gated)
- Private documents (permission-gated)

### Field-level evidence

Each field must distinguish:
- Value and unit.
- Confidence state: verified, estimated, unverified, conflicting or unknown.
- Source identifier.
- Observation time and update time when present.
- Limitation or interpretation note.

Missing data must remain unknown/unavailable; never silently coerce it to zero. Asking price, registered deal price and estimated valuation must remain separate economic roles.

### Spatial behavior

- Do not infer area from a point, display radius, Voronoi cell or fallback display geometry.
- Label coordinate precision.
- Show a boundary-dependent metric only when the required reviewed geometry is eligible.
- Keep map presentation separate from analytical-boundary eligibility.
- If evidence is unavailable, show an explicit limitation state rather than a fabricated map or measurement.

### Responsive behavior

- Mobile-first single-column layout.
- At wider widths, use a primary content column and a compact supporting context/provenance rail.
- Permit grids to collapse based on minimum card width; do not simply shrink desktop cards.
- Keep key actions touch-accessible (minimum 44px).
- On mobile, keep section navigation horizontally scrollable or wrap it without clipping labels.
- Preserve return context between search, map, results and compare.
- Use RTL layout structure and bidi isolation for IDs, routes, coordinates and mixed-script tokens.

## 6. Independent design critique and corrections

| Critique | Correction / disposition |
|---|---|
| A universal large map would overstate spatial eligibility for some entity types. | Map becomes a section, not the page's defining background. |
| All sections shown at once create excessive scroll and weaken task focus. | Prototype tabs now switch the visible content panel. |
| A single confidence badge could obscure field-level uncertainty. | Confidence and source are displayed per field. |
| Asking price and estimated valuation may be misread as registered transaction price. | Financial view presents asking, estimated valuation and registered deal as three distinct cards; the last remains unavailable when there is no record. |
| A polished sample could be mistaken for live listing data. | A prominent sample-data notice appears above the content. |
| Local save/compare interactions could be mistaken for persisted actions. | They are explicitly identified as prototype-only state in this handoff. |

## 7. QA status and limitations

- **Information architecture:** reviewed against the entity types and section registry in the repository.
- **Visual direction:** aligned with the current light canvas, petroleum brand and Vazirmatn typography tokens.
- **Interaction:** tab switching, entity-type switching, source disclosure, favorite and comparison prototype states are interactive in ChatGPT. The status-state explorer covers all ten principal page states listed above.
- **Responsive:** content uses wrapping and minimum-width layouts to support narrow and wide viewports.
- **RTL:** Persian-first content order and labels are used; browser-level bidi behavior and device rendering have not been tested.
- **Data semantics:** the prototype labels illustrative values; it does not claim a live data connection.
- **Runtime:** not tested in the actual Radar Tehran browser application.
- **Code:** no application code, routes, APIs, database schemas or production services were changed.

## 8. Required next engineering/design actions

1. Define one canonical route contract for each entity type and preserve return context.
2. Connect search-result selection to the canonical entity-detail route without routing a building to a neighborhood scorecard or conflating property and listing.
3. Wire a real entity fetcher into the page lifecycle and invoke `loadEntity`; cover direct deep links and request cancellation.
4. Make section selection actually control the active content.
5. Render field-level source IDs and observation timestamps.
6. Replace hard-coded slate/sky styling with the established Radar tokens and accessible semantic states.
7. Add Loading, Partial, Stale, Conflict, Restricted, Deleted, Archived, Not Found and Error QA scenarios.
8. Test all four entity types at mobile, tablet and desktop sizes, including permission-gated sections and RTL/bidi cases.

## 9. Scope guardrail

This package is a design deliverable and implementation-ready direction. It is not a claim that the entity-detail feature is mounted, data-connected, runtime-tested or production-ready. Application code changes require a separate explicit implementation request.
