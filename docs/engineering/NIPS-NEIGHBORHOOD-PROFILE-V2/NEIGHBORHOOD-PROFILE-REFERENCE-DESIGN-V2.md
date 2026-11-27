# Tehran Radar — Neighborhood Profile Reference Design V2

**Status:** Engineering reference / server read-model scaffolded; production integration blocked
**Scope:** Neighborhood profile for Tehran Radar; not user profiles and not the separate geographic identity registry.
**Implementation baseline:** docker/main-debug-2026-11-25 at f5d24bc when audited.
**Safety:** No merge, deployment, migration, production mutation, or production data publication was performed.

## 1. Product definition

A neighborhood profile is a versioned, evidence-backed analytical dossier for one canonical neighborhood identity. It is assembled from independently governed sources and is not a second authoritative copy of the source records.

The profile must distinguish three independent capabilities:

1. **Identity profile:** The entity can be identified, named, located and linked to its aliases and parent administrative entities.
2. **Spatial profile:** A reviewed active boundary exists and supports geometry-dependent analysis.
3. **Analytical profile:** Specific metrics have valid source evidence, permissions, geographic and temporal semantics, calculation methodology, and current validation status.

A point-only neighborhood can have an identity profile. It cannot claim a measured polygon area or publish polygon-dependent indicators.

## 2. Product principles

- No inferred boundary area from display radius, Voronoi cells, point buffers, or map fallback geometry.
- No fabricated alternative names, strengths, weaknesses, quality scores, source counts, or historical trends.
- A missing observation is not zero. Not-applicable, suppressed, unavailable, stale, under-review and observed-zero are separate states.
- Listing asking prices, confirmed sale transactions, asking rents, signed rent contracts and deposits are different economic roles.
- District/city/station observations must not be relabeled as neighborhood observations.
- Allocated estimates are explicitly labeled and never silently mixed with direct neighborhood observations.
- The profile is a read model assembled from authoritative domains; it does not own canonical geography, source evidence, listing history or source permissions.
- Public publication is fail-closed. An unavailable backend or missing evidence must not be replaced by demo or synthetic values.
- Existing neighborhood URLs and legacy IDs remain compatibility identifiers, never substitutes for canonical geographic IDs.

## 3. Information architecture

### A. Identity and location
- Canonical IRNI geographic entity ID.
- Public display name and verified aliases, each with source and alias type.
- Parent city, district and administrative hierarchy.
- Legacy Radar neighborhood ID and an explicit verified crosswalk to canonical identity.
- Center point for map navigation (not an area proxy).
- Identity verification and lifecycle state.

### B. Boundary and spatial eligibility
- Active boundary version ID and monotonic version.
- Boundary status: active, pending review, rejected, superseded.
- Authority class: official primary, official derived, verified secondary, reviewed community, algorithmic, unknown.
- CRS, geometry type, geometry hash, source dataset/version and validity period.
- Human reviewer and review timestamp.
- Geometry validation report.
- Explicit area method and quality label. A geometry-derived area is still an approximation; it is not a cadastral/register area.
- Spatial capability flags: point-only, boundary available, area-analysis eligible, network-analysis eligible.

### C. Market
Separate subviews:
- Sale asking listings.
- Rental asking listings.
- Rental deposit.
- Confirmed sale transactions.
- Confirmed rental contracts.
- Supply sample and deduplication.
- Price distribution.
- Historical listing-price changes.

Every metric must show its role, source coverage, sample count, period, unit, geographic precision, methodology and freshness. A price reference from an internal catalogue is not a median of observed listings.

### D. Housing stock and built form
- Residential building and unit counts.
- Occupancy/vacancy only where source definitions are compatible.
- Age and construction-period distribution.
- Floors and building typology.
- Structural/physical condition with official criteria.
- Housing density only when validated boundary area exists.

### E. Land use and urban form
- Residential, commercial, office, industrial, agricultural, garden/green, mixed, public/institutional and vacant land.
- Building coverage and floor-area ratio only from approved parcel/building layers.
- Each percentage records denominator, land mask, boundary version, classification scheme and date.

### F. Mobility and accessibility
- Network distance to arterial roads, transit, metro, bus/BRT and designated services.
- Transit frequency/capacity only with real timetable or operator data.
- Pedestrian and cycling continuity only where network coverage is audited.
- Straight-line distance and network distance must never share one label.

### G. Services and public facilities
- Education, health, emergency, sports, parks, culture and public administration.
- Counts must use a facility taxonomy, active/inactive status, deduplication and point-in-polygon assignment method.
- Accessibility metrics must disclose their routing graph and travel mode.

### H. Environment and risk
- Air quality and noise retain monitor/station location and time window.
- Temperature/climate data retain station or grid resolution; they are not silently downscaled to a neighborhood.
- Green cover and tree canopy remain separate from public park area.
- Seismic, flood, subsidence, landslide, fire and infrastructure vulnerability require source authority, scale, model version and limitation.
- No risk class should be derived from an undocumented heuristic.

### I. Demography and socioeconomic indicators
- Aggregated data only; never individual profiles or personally identifiable data.
- Census basis, population reference date, geographic allocation and disclosure suppression must be explicit.
- District-level demographic values remain district-level unless a documented and independently reviewed allocation is used.
- Socioeconomic classifications require a published method and bias/interpretation controls.

### J. Urban change and public projects
- Dated observations of projects, permits, infrastructure and land-use changes.
- Separate approved, under-construction and completed project states.
- Approved budget is not evidence of completion.

### K. Sources and evidence
- Source registry identity, owner/provider, access and redistribution rights, ToS/legal basis and review date.
- Source-to-variable compatibility and known semantic differences.
- Immutable raw evidence ID/hash and evidence lifecycle.
- Extraction, canonicalization and transformation versions.
- Reviewer/audit events and unresolved conflict state.

### L. Data quality and publication
- Domain-level readiness, not one global completeness number.
- Number of publishable, partial, stale, suppressed, unavailable and blocked metrics.
- Source independence, not just raw source count.
- Last observation and period end per metric.
- Spatial and temporal precision.
- Verification and conflict status.
- Publication state: draft, provisional, published.

## 4. Evidence and ownership model

The profile is a read model. It should compose these logical owners rather than duplicate them:

| Concern | Authoritative owner | Profile behavior |
|---|---|---|
| Canonical geographic identity and lineage | IRNI Geographic Registry | Read by canonical ID/revision |
| Boundary versions and review | Geospatial boundary service | Read ACTIVE reviewed version only |
| Variable definitions and taxonomy | NIPS Data Dictionary | Read by variable ID/version |
| Source permissions and compatibility | Source Registry | Read current approved status and mapping |
| Raw source payload and integrity | Evidence Registry | Reference immutable evidence IDs |
| Canonical observations and transformations | Data Validation / Canonical Record domain | Read active canonical record versions |
| Listings and listing history | Radar market/listing domain | Read listing observations; never infer confirmed contracts |
| User contributions and moderation | Radar community domain | Show in a separate contribution stream |
| Profile assembly and display | Neighborhood Profile read model | Derive deterministically; cache by all source revisions |

**Do not create a profile table that becomes an alternative source of truth.** If a versioned published snapshot is later required, store an immutable manifest containing source watermarks, method/catalog versions, and a checksum, not duplicated editable source data.

## 5. Eligibility and publication gates

### Boundary gate
Area analysis is enabled only when:
- canonical geographic entity ID, city ID and approved legacy crosswalk match;
- entity level is neighborhood;
- boundary version is ACTIVE;
- identity is canonical and not disputed;
- review actor and timestamp exist;
- source reference, authority, CRS and canonical geometry hash are verified;
- Polygon/MultiPolygon is structurally valid, closed, locally bounded and non-self-intersecting;
- holes are contained and do not intersect outer/other rings;
- MultiPolygon parts do not overlap.

A valid official source does not turn a spherical geometry-derived area into an official cadastral measurement.

### Observation gate
A publishable observation requires independent references to:
- variable definition;
- source and redistribution permission;
- source-variable mapping;
- immutable evidence and verified raw hash;
- active canonical record;
- source/target geography;
- temporal semantics and freshness policy;
- unit, data type, range/enum and economic role.

Payload-declared source status or compatibility is never authoritative. It must match trusted registries.

### Publication gate
- **PUBLISHED:** every required domain is READY, has publishable metrics and no blocked metrics.
- **PROVISIONAL:** one or more domains are partial or not applicable, but no required domain is blocked/stale/unavailable.
- **DRAFT:** required evidence is missing, stale, blocked, unavailable, structurally inconsistent or the readiness data itself is invalid.

Duplicate domain readiness entries, negative/fractional counts, or a READY domain with blocked metrics must fail closed.

## 6. Metric comparability

Two neighborhood metrics are comparable only when all of these match:
- variable and economic role;
- unit and currency normalization policy;
- reference period;
- methodology version;
- geographic resolution;
- city;
- boundary scheme ID/version;
- geographic registry revision.

A neighborhood's own boundary version differs across neighborhoods; compare the common boundary scheme/revision, not the unrelated local polygon version. If spatial assignment changed between boundary versions, require a reviewed crosswalk/recalculation.

## 7. Cache identity

Cache keys include:
- canonical entity ID;
- geographic registry revision;
- active boundary version and geometry hash;
- observations watermark;
- methodology version;
- variable catalog version;
- source registry revision;
- publication policy version.

A cache hit must not survive a change to a source permission, canonical record, boundary, catalog, methodology or publication policy.

## 8. UI behavior

- Preserve existing deep links and legacy routes.
- Show boundary state and evidence source near any area value.
- Do not show area where boundary eligibility is absent.
- Keep sale/rent/supply/distribution/history tabs semantically distinct.
- Historical views require append-only time-series observations.
- Separate neighborhood history from community contributions.
- Display unavailable and not-applicable states without fake chart baselines or fabricated zeroes.
- Show estimated/allocated/official labels next to each metric, not in a distant generic disclaimer.
- No single profile maturity badge should imply every domain is equally complete.
- Map display geometry and analytical boundary are separate concepts.

## 9. API integration contract — server scaffold exists; live providers are pending

The profile panel accepts an optional approvedBoundaryEvidence object and, when the caller does not explicitly inject one, now requests the read-only evidence endpoint through a dedicated frontend client. The panel is mounted in the map's NeighborhoodInspectorDrawer. The client uses same-origin credentials and `cache: 'no-store'`, accepts only a valid success envelope with either a complete READY evidence object or a BLOCKED result, and treats malformed payloads, HTTP failures and network errors as UNAVAILABLE. Only READY evidence is passed to the profile engine; BLOCKED reason codes are rendered in the Sources section. The browser does not create identity/source facts or set `geometryHashVerified`. This is a frontend transport integration only; it does not resolve the server-side production dependency gap.

A server-side read model now exists in the Geospatial service:

- Service method: `getNeighborhoodProfileBoundaryReadModel({ cityId, hoodId })`.
- Read-only Express route: `GET /api/v1/geospatial/neighborhood-boundaries/:cityId/:hoodId/profile-evidence`.
- Approval route: `POST /api/v1/geospatial/neighborhood-boundaries/:cityId/:hoodId/versions/:versionId/approve`.
- New boundary writes store SHA-256 of the persisted GeoJSON and an explicit `EPSG:4326` CRS marker.
- Approval accepts only the latest `PENDING_REVIEW` version, rejects creator self-approval, revalidates geometry/hash, supersedes the previous ACTIVE version, and records an independent reviewer and timestamp.
- The read model returns a complete evidence object only after active status, identity, legacy ID, city, version, independent review, CRS, recomputed geometry hash, canonical identity resolver and trusted source resolver all pass. Resolver errors and absent dependencies return stable BLOCKED reason codes with no partial evidence.
- The read model never consults the Worker display-boundary fallback.

The server resolver contract is injected through `GeospatialModuleDependencies.neighborhoodProfileBoundaryResolvers`. Its two independent responsibilities are:
1. Resolve the legacy Radar city/neighborhood ID to a confirmed canonical IRNI identity.
2. Resolve `sourceProvenance` against a trusted source registry to obtain authority, source reference, CRS and verification status.

**Current production wiring is deliberately incomplete.** `apps/api/server.ts` currently calls `createProductionGeospatialModule()` without those resolvers and without the token-verifier/admin-store dependencies. Consequently:
- The profile-evidence endpoint currently returns BLOCKED with resolver-not-configured reasons.
- The approval HTTP route currently fails closed with FORBIDDEN because admin auth dependencies are not injected.
- Existing boundary records created before the hash/CRS fields were added remain ineligible until re-ingested/reviewed through a governed process.
- A boundary that was auto-approved by its creator is not eligible for a profile and cannot be approved again through the new pending-only flow.

A Worker-side IRNI identity adapter has now been implemented at `worker/irni/neighborhoodProfileIdentityResolver.ts`. It uses the configured `IRNI_GEOGRAPHY` Service Binding and the existing v2 RPC client; checks the approved registry revision, checksum, identity-contract version and ID algorithm; matches only the three exact, versioned Radar legacy alias encodings; permits multiple distinct encodings only when each key is unique, every alias is marked `automaticResolutionEligible`, and all aliases converge on the same canonical entity; then fetches and validates the canonical entity as an active `URBAN_NEIGHBORHOOD`. It never matches by name, coordinate or bare numeric ID. Nine dedicated tests cover success, convergent legacy encodings, absent binding, contract mismatch, missing/conflicting/manual-only aliases, wrong entity type and malformed identifiers.

**Important topology boundary:** `IRNI_GEOGRAPHY` is a Cloudflare Workers Service Binding configured in `wrangler.backend.jsonc`. It is not a Node/Express environment variable or binding. `apps/api/server.ts` is a separate Express process and cannot receive that binding by passing `process.env` or by importing the Worker client. The Worker-side identity adapter is therefore implemented and tested but is not yet injected into the Express read model. A production bridge must be designed at the Worker/API boundary with an authenticated, version-pinned contract; direct D1 access or an untrusted public HTTP fallback is prohibited. The trusted source-registry resolver remains unimplemented.

The frontend read-only client is now implemented in `src/features/neighborhoods/services/neighborhoodProfileBoundaryApi.ts`; `NeighborhoodIntelligenceProfilePanel` loads it when no evidence prop is explicitly supplied, and `NeighborhoodInspectorDrawer` mounts the panel for the selected neighborhood. The client is fail-closed and never fabricates identity/source facts or sets `geometryHashVerified` in the browser.

The observation provider still requires independent source, mapping, evidence, canonical record and variable registry contexts. No guessed endpoint or browser-side trust assertion is acceptable.

## 10. Rollout plan

1. Verify canonical entity ↔ Radar legacy neighborhood mapping, with unresolved/ambiguous states.
2. Wire the new server read model to the actual IRNI v2 identity registry and the trusted source registry; keep the endpoint BLOCKED until both return validated records.
3. Inject authenticated admin dependencies and test the independent approval route with real admin/delegation policy.
4. Frontend read-only endpoint client and map-inspector panel integration are implemented; retain the existing API blocker display until production resolvers are wired and verify this path in browser E2E.
5. Populate a read-only observation view from the existing Source Registry, Evidence and Canonical Record owners.
6. Build IRNI/Radar adapter parity tests using the same independent fixtures and expected decisions.
7. Pilot one Tehran neighborhood with an official/reviewed polygon and independently sourced observations.
8. Compare displayed metrics with source documents and human review.
9. Enable more domains in cohorts; keep point-only neighborhoods identity-only.
10. Only after live D1 catalog, migrations, ownership map and transition design are verified should persistence/migration be designed.

## 11. Known implementation blockers

- Current live IRNI neighborhood entities are point-only GeoNames records; they do not provide neighborhood polygons or measured area.
- The profile panel's approvedBoundaryEvidence prop is not wired to the new read-only endpoint yet; therefore area remains unavailable in the UI.
- The Express API read model is only a scaffold: the tested IRNI identity resolver exists in the Cloudflare Worker layer, but the Express process cannot access the Workers Service Binding directly; no authenticated Worker-to-API bridge is implemented. The source-registry resolver is also missing, so the endpoint returns BLOCKED.
- The approval HTTP route has no admin token verifier/store injected by the current production module factory call; it remains FORBIDDEN until auth dependencies are wired and tested.
- Existing boundary records may lack the new server hash/CRS fields and can include creator self-review; they are not automatically grandfathered.
- The observation validator is an executable reference contract; the actual Radar/IRNI observation backend adapter and RPC integration are not implemented.
- Source permissions/redistribution and the source-to-variable matrix need current independent review before public use.
- NIPS catalog structured schemas, enum allowlists and freshness thresholds need formal versioned definitions.
- No real neighborhood observations have been validated by this frontend test suite.

## 12. Non-goals of this implementation pass

- No D1 schema or migration.
- No Worker deployment or Service Binding change. The existing IRNI Service Binding in `wrangler.backend.jsonc` was only consumed by a new local Worker-side adapter; it was not changed or deployed.
- The Express read-only/read-approval route scaffolding was added locally but is not production-operational; no authenticated Worker-to-API bridge, source resolver or admin auth provider is configured.
- No production Polygon ingestion or approval.
- No fake or synthetic neighborhood statistics.
- No PR merge, publish or production write.
