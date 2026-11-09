# Canonical Property Registry & Asset Identity Backend (`server/modules/property-registry/`)

## 1. Module Responsibilities
Owns canonical physical real estate identity (`PARCEL`, `BUILDING`, `UNIT`, `OTHER_ASSET`), structural entity relationships, namespace-isolated external identifier mappings, duplicate candidate detection, human-reviewed merge/split/demolition lineage, 7-dimensional data quality tracking, and point-in-time historical attribute reconstruction.

Does **not** own legal title verification, property listings (`bargains`), transaction workflows (`real-estate-transactions`), valuations (`market-analytics`/`valuation`), or geographic master hierarchy (`geography`).

## 2. Entity Taxonomy & Canonical ID Strategy
- **Land Parcels (`PARCEL`)**: `parcel_<uuid>` — independent physical land lots with optional area, measurement basis, and verified/unverified cadastral references.
- **Buildings (`BUILDING`)**: `bldg_<uuid>` — physical structures associated with one or more parcels, preserving construction year uncertainty and floor approximations.
- **Units & Premises (`UNIT`)**: `unit_<uuid>` — apartments, offices, shops, parking spaces, or storage units linked to a parent building and/or parcel.
- **Other Assets (`OTHER_ASSET`)**: `asset_<uuid>` — development sites, shared facilities, or standalone commercial premises.
- Canonical IDs are never derived from addresses, phone numbers, owner IDs, or listing IDs, and remain invariant across descriptive attribute updates.

## 3. Relationship Model & Cycle Prevention
- Supported relationships: `PARCEL_CONTAINS_BUILDING`, `BUILDING_CONTAINS_UNIT`, `BUILDING_ASSOCIATED_WITH_PARCEL`, `SHARED_FACILITY_BELONGS_TO_BUILDING`, `ASSET_LOCATED_ON_PARCEL`.
- Enforces entity-kind pair compatibility, prevents a unit from belonging to two active parent buildings simultaneously, and executes directed graph cycle detection (`CIRCULAR_RELATIONSHIP_DETECTED`).

## 4. External Identifier Namespaces
- Every external identifier is scoped by `issuingSourceNamespace :: jurisdictionScope :: identifierType :: identifierValue`.
- Identical strings in different namespaces or jurisdictions never collide or auto-merge.

## 5. Entity Resolution, Merge, Split & Demolition Lineage
- `generateDuplicateCandidates` classifies matches into `CONFIRMED_SAME_ENTITY`, `STRONG_CANDIDATE_REQUIRING_REVIEW`, `POSSIBLE_MATCH_INSUFFICIENT_EVIDENCE`, `CONFIRMED_DISTINCT_ENTITIES`, or `UNRESOLVED_IDENTITY_CONFLICT`, and **never** auto-merges (`autoMergePermitted: false`).
- Consequential merges require an `APPROVED_FOR_MERGE` review by an authorized reviewer/admin, preserve the retired entity as `MERGED_REDIRECT` pointing to the surviving entity, reassign active relationships and external identifiers atomically, and record an `IdentityLineageRecord` with a `reversibleSnapshotRef`.
- Splits (`SPLIT_FROM`) and building demolitions/replacements (`DEMOLISHED`, `REPLACED_BY`) preserve historical entities without treating a new replacement building as the same physical asset.

## 6. Historical Attribute Reconstruction & 7 Quality Dimensions
- Every descriptive change records both `effectiveDateIso` (real-world occurrence) and `recordedAtIso` (system ingestion timestamp), enabling point-in-time reconstruction across either dimension.
- Maintains 7 separate quality dimensions: `identityConfidence`, `sourceReliability`, `verificationStatus`, `attributeCompleteness`, `relationshipCompleteness`, `dataFreshness`, and `conflictStatus`.
