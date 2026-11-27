# NIPS Backend Profile Structure — v1

**Status:** Runtime foundation implemented on a feature branch. The owner approved shared storage in the existing `radar-neighborhood-db` (`NEIGHBORHOOD_DB`) on 2026-11-27. NIPS persistence is not yet implemented; its tables must be isolated with an `nips_` prefix and managed under `migrations/neighborhood-d1`. IRNI canonical identity/boundary reads remain behind the version-pinned `IRNI_GEOGRAPHY` Service Binding; no direct reads or writes to IRNI-owned registry tables are permitted.
**Scope:** One canonical neighborhood profile. This is not a user profile and does not replace IRNI.
**Design rule:** Begin from a clean profile contract. Legacy frontend profile structures are not authoritative schema inputs.

## 1. What a profile is

A NIPS profile is a versioned, reproducible read model for one canonical URBAN_NEIGHBORHOOD entity. It is not a mutable record containing every source row. It is assembled from governed, versioned domain observations.

The model has three data planes:

1. **Evidence plane — raw evidence:** immutable source payload/object, hash, source identity, receipt time, permissions, and lifecycle. Raw bytes stay in the evidence store; profile JSON carries references only.
2. **Analytical plane — canonical observations:** normalized values with variable ID, unit, semantic role, geography, time, methodology, evidence references, and lifecycle.
3. **Profile plane — assembled snapshot:** domain-specific sections, metrics, quality/readiness, source watermarks, schema/methodology versions, and publication state.

Source systems → Evidence Registry + immutable raw object → Source/Variable mapping + canonicalization → Canonical Observation Store → Validation + aggregation + domain analytics → NIPS Profile Assembly → Versioned Profile Snapshot / API read model.

## 2. Fourteen domains

| Domain ID | Responsibility |
|---|---|
| identity | IRNI canonical identity, verified aliases, parent hierarchy, verified legacy crosswalks |
| geography | reviewed boundary reference, geometry hash, CRS, area method, spatial capability flags |
| demographics | population, households, distributions, migration, projections and disclosure controls |
| socioeconomic | income, employment, occupations, economic activity, deprivation and household economics |
| real_estate | separate sale/rent/deposit/transaction/supply/demand/liquidity series and valuation |
| building_stock | building/unit counts, age, floors, typology, structure, condition, occupancy and vacancy |
| land_use | classification scheme, denominator, use areas/shares, coverage ratio and floor-area ratio |
| infrastructure | facility categories, utilities and digital connectivity |
| mobility | network coverage, public transport, traffic, walkability, cycling, travel time and accessibility |
| environment | air, noise, climate, green cover, water, waste and environmental risk |
| safety | aggregated crime, traffic incidents, emergency response, fire, natural and infrastructure hazards |
| history | dated, sourced neighborhood events and references to historical metric series |
| intelligence | indices, rankings, forecasts and risk assessments with model registry references |
| evidence | registry revisions, source coverage, permission state, lineage reference and unresolved conflicts |

Identity, geography and evidence are mandatory for a meaningful identity/readiness envelope. Other domains can be partial or unavailable without inventing values. Publication policy decides which domain states are required for a particular publication product.

## 3. Metric is the atomic contract

Every metric carries a stable metric ID and semantic role; value and explicit state; unit and currency; observation time and optional reference period; geographic level, canonical entity, boundary/scheme version and assignment method; methodology ID and version; evidence, canonical-observation, mapping and transformation references; quality, sample size, coverage, freshness and limitations; comparability key and display format.

**Null semantics are mandatory:**
- OBSERVED with value 0 means a measured zero.
- MISSING, UNAVAILABLE, SUPPRESSED, and NOT_APPLICABLE require value null.
- ESTIMATED and ALLOCATED are not direct observations and must remain visibly distinguished.
- A missing value is never converted to zero for charting or aggregation.

## 4. Market semantics

Market observations are separated by segment and economic role:
- asking sale price != confirmed sale transaction;
- asking rent != confirmed rent contract;
- rent != deposit;
- supply counts != demand;
- listing reference prices != neighborhood observed medians;
- valuation output != observed market price.

A series has its own sample counts, deduplication, eligible sample and coverage description. No cross-role aggregation is allowed unless a documented methodology explicitly defines it.

## 5. Logical persistence model — not migrations

Do not create fourteen independent profile tables and do not duplicate upstream source-of-truth domains.

| Logical record | Purpose | Ownership |
|---|---|---|
| source_registry_entry | source authority, access and redistribution policy | Source Registry |
| source_variable_mapping | source field ↔ NIPS variable compatibility | Data Governance |
| evidence_manifest | immutable evidence metadata and raw object reference/hash | Evidence Registry |
| canonical_observation | normalized, versioned observation | Analytical Store |
| transformation_run | reproducible transform and methodology lineage | Analytics/Processing |
| profile_snapshot | immutable assembled profile snapshot/manifest | NIPS Profile |
| profile_publication | publication decision and policy revision | NIPS Governance |

The current module defines contracts for NipsRawEvidenceManifest, NipsCanonicalObservation, and NipsNeighborhoodProfile. It does not create database tables, migrations, repositories, or write paths.

## 6. Snapshot identity and reproducibility

A snapshot is determined by canonical entity ID and IRNI registry revision; boundary version/hash and boundary scheme revision; source/evidence/observation watermarks; variable catalog and source registry revisions; methodology and model versions; publication policy version; and assembly build ID.

A cache key must include every dependency above. A source permission change, corrected observation, boundary revision, catalog update, or methodology change invalidates the affected snapshot.

## 7. Publication/readiness

Each domain has independent state:
- READY: required metrics validated and publishable;
- PARTIAL: some publishable data, but meaningful gaps remain;
- STALE: data exists but violates freshness policy;
- BLOCKED: validation, permission, identity, or lineage gate failed;
- UNAVAILABLE: provider is not available;
- NOT_APPLICABLE: domain does not apply, with an explicit reason.

The profile-level publication state is not inferred from one completeness percentage. PUBLISHED must fail closed if a required domain is not READY or has blocked metrics. Domain-specific products may later define separate publication policies.

## 8. Boundary rules

A center point supports map navigation, not area analysis. Area and polygon-dependent metrics require an active, independently reviewed boundary, verified canonical identity, source authority, CRS and server-verified geometry hash. The area method must distinguish geodesic approximation from an official registered/cadastral area.

No buffer, display radius, Voronoi cell or fallback geometry may be represented as the neighborhood's true area.

## 9. Privacy and safety

- Demographics and safety data are aggregate only.
- No individual dossiers, precise resident locations, personal-level crime records or direct identifiers belong in this profile.
- Suppression is a first-class metric state.
- Restricted source evidence may be retained under its governing access policy but cannot be exposed through public profile serialization.
- The profile contains evidence references and derived facts, not secrets, credentials, raw private payloads or exact private addresses.

## Database design references

- Logical ERD and ownership boundaries: `docs/engineering/NIPS-NEIGHBORHOOD-PROFILE-V2/NIPS-DATABASE-ERD-V1.md`
- D1 logical schema reference (design only; never apply as a migration): `docs/engineering/NIPS-NEIGHBORHOOD-PROFILE-V2/NIPS-D1-LOGICAL-SCHEMA-V1.DESIGN-ONLY.sql`

The proposed profile store is separate from IRNI, USER_DB and RESEARCH_DB. No D1 binding or migration has been created.

## 10. Current implementation status

Implemented locally:
- typed domain contracts for all fourteen sections;
- shared metric/provenance/time/geography/quality contract;
- separate raw evidence manifest and canonical observation contracts;
- domain catalog;
- runtime structural validator.

Not implemented:
- repositories or D1 schema;
- source registry or variable catalog providers;
- ingestion/canonicalization pipelines;
- profile assembler and publication policy service;
- HTTP endpoints, authorization, caching or UI adapter;
- historical backfill or production data migration.

The next engineering stage is to review this schema against actual IRNI, Source Registry, Evidence Registry, listing, and analytics owners, then define persistence and provider interfaces. Do not wire or publish guessed data.

## Runtime contract hardening — v1

- Metric values use recursive JSON-only types; non-finite numbers, Date, functions, undefined, class instances and cyclic objects are rejected at runtime.
- Publication readiness is product/audience/version-specific. The default public profile policy requires identity, geography, and evidence to be READY; optional domains may be READY, PARTIAL, UNAVAILABLE, or explicitly NOT_APPLICABLE.
- Optional domains are not required to contain a metric merely to publish the profile. A policy may set per-required-domain minimum metric counts and a maximum blocked-metric count.
- A published snapshot is validated against the exact policy supplied by the assembler. Persist the policy version and decision with the publication record; do not treat this default as a production approval.


## 10. Runtime foundation added (2026-11-26)

The implementation now includes:
- Explicit mapping of the twelve NIPS catalog categories / 120 variable IDs into the fourteen profile domains. The \`history\` domain is cross-cutting rather than a catalog category.
- Golden Reference structural validation; the fixture cannot be treated as real neighborhood data.
- Strict deterministic JSON serialization and SHA-256 snapshot content hashing.
- Confirmed-identity-gated profile assembly and profile/readiness validation.
- Separate publication decisions, immutable snapshot repository port and compare-and-swap activation contract.
- Public allow-list serialization that suppresses values without PUBLIC_REDISTRIBUTION or DERIVED_ONLY evidence permission.

The repository port is intentionally not wired to USER_DB or RESEARCH_DB. No authorized shared NIPS database binding or migration ownership is registered yet. A production adapter, route mounting and migrations remain blocked until those contracts are approved and integration-tested. See \`docs/engineering/NIPS-NEIGHBORHOOD-PROFILE-V2/NIPS-BACKEND-IMPLEMENTATION-FOUNDATION-V1.md\`.
