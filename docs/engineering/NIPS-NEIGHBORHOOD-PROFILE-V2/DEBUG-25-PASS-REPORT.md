# Neighborhood Profile V2 — 25-Pass Debug Report

**Repository:** radartehran-main-docker
**Branch at inspection:** docker/main-debug-2026-11-25
**Baseline commit:** f5d24bc
**Run date:** 2026-11-26
**Outcome:** 25 review/debug passes completed; 26 dedicated contract scenarios; 92 related tests passed in the latest combined regression run; full TypeScript check passed after the server read-model additions. The frontend production build was rerun after the Worker adapter and JSX correction and passed (3,062 modules).

## 1. The 25 debug passes

| # | Defect class / attack | Corrected behavior / acceptance check |
|---:|---|---|
| 01 | Map coverage polygon was treated as analytical boundary | Display geometry is not boundary evidence; area remains null without approved boundary evidence. |
| 02 | Legacy numeric neighborhood ID could be confused with canonical identity | Canonical IRNI ID is a separate field; legacy ID only works through a reviewed mapping. |
| 03 | Boundary from another city could be attached | City ID must match the profile entity. |
| 04 | Another neighborhood's legacy ID could resolve incorrectly | Canonical ID and legacy crosswalk must both match. |
| 05 | District/city geometry could be presented as a neighborhood boundary | Only neighborhood-level geometry is eligible. |
| 06 | Pending/rejected/superseded boundary could affect public profile | Only ACTIVE boundary versions are eligible. |
| 07 | Canonical identity could be confused with authority of its geometry | Identity and boundary verification are independent. |
| 08 | Missing human review could still allow area display | Reviewer UID and valid review timestamp are mandatory. |
| 09 | Radius/Voronoi/algorithmic boundary could appear measured | Algorithmic/unknown geometry is blocked from area analysis. |
| 10 | CRS could be assumed from coordinates | CRS must be explicitly EPSG:4326 for this contract. |
| 11 | A hash-shaped string could be treated as proof of geometry integrity | The backend must recompute SHA-256 from canonical GeoJSON; an explicit server-verified flag is required. |
| 12 | Open or malformed GeoJSON rings could be silently repaired | Rings must be closed and normalized; invalid rings fail closed. |
| 13 | Self-intersecting Polygon could yield area | Self-intersections are rejected. |
| 14 | Country-scale geometry could enter neighborhood calculation | Extents beyond the local neighborhood envelope are rejected. |
| 15 | Hole rings could intersect outer ring or produce incorrect subtraction | Holes must be contained, non-intersecting and smaller than the outer ring. |
| 16 | Overlapping MultiPolygon parts could double-count area | Overlapping or nested components are rejected. |
| 17 | Missing, suppressed, unavailable and zero values could collapse to one state | Distinct observation states are retained; zero has explicit semantics. |
| 18 | Access permission could be confused with public redistribution permission | Source access and redistribution rights are separate registry controls. |
| 19 | Payload could self-assert source trust or variable compatibility | Independent source and source-variable registries must agree with payload claims. |
| 20 | Asking price could be treated as confirmed transaction/contract | Economic role and source role must match; listing portals cannot supply confirmed transactions. |
| 21 | District data could be relabeled as neighborhood data | Coarser observations are blocked unless an approved crosswalk and allocation method exist; accepted values remain allocated estimates. |
| 22 | Wrong type, unit, range or enum could enter canonical profile | Definition-driven type, unit, range and allowlist checks are enforced. |
| 23 | Static/periodic/dynamic data could bypass temporal freshness | Temporal type/semantics, period end, policy version, future dates and source hash/version are checked. |
| 24 | Narrative and listing volume could imply a complete/research-ready profile | Readiness is domain-based; blocked, stale, unavailable or contradictory counts prevent PUBLISHED. |
| 25 | Incomparable metrics or stale cache could survive registry/method changes | Comparison includes city, period, boundary scheme, methodology, geography, registry and currency policy; cache key includes catalog/source/publication versions. |

## 2. Automated verification

### Dedicated neighborhood-profile contract suite
- 26 scenario tests: **26 passed / 0 failed**.
- Covers boundary eligibility, geometry validation, source and evidence trust, canonical record linkage, source-to-variable compatibility, market role separation, spatial allocation labels, temporal freshness, comparability, publication gating and cache identity.

### Related regressions
- Existing neighborhood provenance/profile integrity tests.
- Homepage and map architecture tests.
- Discover neighborhood result regressions.
- Geospatial boundary approval and GIS module tests.
- Geospatial durable recovery and operator migration tests.
- Worker neighborhood-boundary visualization route tests.
- Canonical IRNI v2 route ownership tests.
- New server-side profile-boundary read-model and independent-approval tests.

### Executed results
| Verification | Result |
|---|---:|
| Latest combined profile/geospatial/Worker/IRNI regression run | **92 passed / 0 failed** |
| Dedicated server read-model + geospatial approval + GIS run | 16 passed / 0 failed |
| Full TypeScript check after server/Worker changes (npx tsc --noEmit --pretty false) | exit 0 |
| Worker TypeScript check (npx tsc --noEmit -p tsconfig.worker.json) | exit 0 |
| Frontend production build (npm run build, latest run) | exit 0; 3,062 modules transformed |
| Targeted tracked diff + new-file trailing-whitespace checks | clean |
| Repository-wide git diff --check | reports unrelated trailing whitespace in other pre-existing dirty files; no automatic cleanup performed |

The latest frontend build reports two circular manual-chunk warnings involving data-neighborhoods, data-iran-provinces and app-core-shared. Those bundle boundaries were not changed in this task.

## 3. Files changed in this pass

Modified:
- src/features/neighborhoods/services/neighborhoodProfileEngine.ts
- src/features/neighborhoods/components/NeighborhoodIntelligenceProfilePanel.tsx
- src/features/home/tests/homeAndMapArchitecture.test.ts
- tests/neighborhood-provenance-and-profile-integrity.test.ts
- server/modules/geospatial/geospatialBoundaryMutations.ts
- server/modules/geospatial/service.ts
- server/modules/geospatial/routes.ts
- server/modules/geospatial/types.ts
- src/features/community/components/CommunityTopicsAndSpatialTab.tsx (fixed mismatched h2/h3 closing tag while preserving the user's h2 heading edit)

New:
- src/features/neighborhoods/profile-contract/neighborhoodProfileEvidenceContract.ts
- src/features/neighborhoods/profile-contract/neighborhoodProfileBoundaryContract.ts
- src/features/neighborhoods/profile-contract/neighborhoodProfileObservationContract.ts
- src/features/neighborhoods/profile-contract/neighborhoodProfileAssembly.ts
- src/features/neighborhoods/profile-contract/neighborhoodProfileEvidenceContract.test.ts
- docs/engineering/NIPS-NEIGHBORHOOD-PROFILE-V2/NEIGHBORHOOD-PROFILE-REFERENCE-DESIGN-V2.md
- server/modules/geospatial/neighborhoodProfileBoundaryReadModel.ts
- tests/neighborhood-profile-boundary-read-model.test.ts
- worker/irni/neighborhoodProfileIdentityResolver.ts
- tests/irni-neighborhood-profile-identity-resolver.test.ts
- docs/engineering/NIPS-NEIGHBORHOOD-PROFILE-V2/DEBUG-25-PASS-REPORT.md

No changes were made to user-modified Discover regression test files.

## 4. Implemented in frontend/reference code

- Synthetic radius-derived area was removed. No boundary evidence means no area.
- Fake alternative names were removed; alias list is empty until verified aliases are supplied.
- Profile maturity no longer derives from listing count or narrative text.
- The synthetic sample count is unknown/null unless the source aggregator classifies it.
- The asking-price card no longer labels an internal reference value as an observed median.
- Market tabs have distinct content and disclose missing rental/distribution/history inputs.
- Neighborhood strengths/challenges and environmental scores are not fabricated.
- The UI accepts an optional approved boundary record, but does not fetch or invent one.
- The boundary validator distinguishes official geometry from reviewed operational geometry and labels calculated area as approximation.
- The Geospatial service now stores a server-computed SHA-256 digest and explicit EPSG:4326 marker for newly created boundary records.
- A read-only profile-boundary read model and Express endpoint were added. They return evidence only after independent identity/source resolvers and review/hash/CRS gates pass.
- A pending-boundary approval operation rejects creator self-approval, only approves the latest pending version, revalidates geometry/hash, and supersedes the previous active version.
- A Worker-side IRNI identity resolver uses the existing v2 Service Binding, approved versioned legacy aliases, registry revision/checksum and canonical entity validation; 8 dedicated tests cover its fail-closed behavior.
- The IRNI resolver remains in the Worker runtime and is not injected into Express because the Workers Service Binding is not available to the Node process; an authenticated Worker/API bridge and trusted source resolver remain blockers.
- The HTTP approval route checks the existing admin/delegation verifier, but is blocked in current production wiring because auth dependencies are not injected.
- Observation validation uses injected trusted contexts for variable definition, source, source-variable mapping, immutable evidence and canonical record.
- Profile publication and metric comparison now fail closed on contradictory/incompatible inputs.

## 5. Remaining blockers — do not mark production-ready

1. **The new server read model is scaffolded, but production resolvers are not wired.** Its service method and read-only Express route require independent IRNI identity and source-registry resolvers. The current production module factory call supplies neither, so it correctly returns BLOCKED.
2. **The frontend provider is not wired.** The panel's optional evidence prop remains empty by default. Do not use the map's display polygon as a substitute.
3. **The live IRNI neighborhood entities audited in the connected database are point-only GeoNames locations.** They do not provide measured neighborhood polygons. A valid Tehran boundary dataset and reviewed legacy-to-canonical mapping are still required.
4. **The approval HTTP route is not operational in the current API bootstrap.** The production module factory is called without tokenVerifier/adminStore, so the route returns FORBIDDEN. It must be connected to the actual admin/delegation policy before use.
5. **Old boundary records are not grandfathered.** Records lacking server-computed geometry SHA-256/CRS or containing creator self-review are ineligible; they need a governed re-ingestion/review flow.
6. **The observation contract is a reference implementation.** It has not been connected to the live Source Registry, Raw Evidence, Canonical Record or NIPS catalog APIs.
7. **No independent observed-data pilot has been run against an actual Tehran neighborhood with reviewed geometry.**
8. **No real market, demographic, service or environmental values are made valid merely by the frontend tests.** Each dataset still needs source permission, mapping, reference period, spatial precision and human/source review.
9. **The shared D1 / IRNI Worker RPC integration and migration topology were not changed.** No schema was applied.

## 6. Additional server-side work in the continuation

Added/modified:
- server/modules/geospatial/neighborhoodProfileBoundaryReadModel.ts
- server/modules/geospatial/geospatialBoundaryMutations.ts
- server/modules/geospatial/service.ts
- server/modules/geospatial/routes.ts
- server/modules/geospatial/types.ts
- tests/neighborhood-profile-boundary-read-model.test.ts

New HTTP surface (local implementation only):
- GET /api/v1/geospatial/neighborhood-boundaries/:cityId/:hoodId/profile-evidence
- POST /api/v1/geospatial/neighborhood-boundaries/:cityId/:hoodId/versions/:versionId/approve

The read route is read-only and sends private/no-store. The approval route is fail-closed when admin dependencies are absent. The current production API bootstrap passes no trusted identity/source resolver or admin auth dependencies. No live adapter was guessed or substituted. The frontend remains unconnected to the endpoint.

## 7. Scope and safety statement

- No merge or push.
- No deployment.
- No D1 schema change or migration.
- No write to live Cloudflare resources.
- No production data mutation or publication.
- The user's existing dirty Working Tree was preserved.

The build regenerated public/sitemap.xml. It was left as generated by the repository build script and was not reverted because the Working Tree already contained pre-existing uncommitted work.
## 8. Privacy hardening continuation (2026-11-26)

A review of the public profile-evidence route found that the READY evidence DTO included the raw reviewedByUid account identifier. The server still needs that identifier internally to prove the reviewer is not the creator, but exposing it in the public-facing response is unnecessary.

Changes made:
- Server read-model evidence now emits reviewedIndependently: true instead of reviewedByUid.
- The server continues to validate the actual reviewer UID against createdByUid before producing READY evidence; the internal boundary record and approval audit trail are unchanged.
- The frontend boundary contract now requires the explicit independent-review assertion and review timestamp, without needing a user/account identifier.
- Added a regression assertion that READY evidence contains no reviewedByUid field.

Verification in this continuation:
- Boundary read-model + frontend evidence-contract tests: 37 passed / 0 failed.
- Full TypeScript check: exit 0.
- Worker TypeScript check: exit 0.
- Production frontend build: exit 0; 3,062 modules transformed. Existing circular manual-chunk warnings remain in the neighborhood/province/shared chunks.
- Targeted diff whitespace check for the changed files: clean.

No Worker-to-Express bridge was added. The Worker has an existing short-lived HMAC session assertion pattern for authenticated proxy hops, but that is not by itself proof that the API has a secure, configured reverse path for this specific read model. Production resolvers, source registry, bridge wiring and reviewed Tehran geometry remain blockers.
