# NIPS Source Registry and Ingestion Ownership Audit — V1

**Status:** Read-only code audit; design findings only. No ingestion code, routes, databases, or production resources changed.
**Scope:** Determine whether an existing Tehran Radar source registry can serve as the authoritative NIPS source/permission registry.
**Audit date:** 2026-11-26

## Executive finding

The repository contains a candidate source registry in `server/modules/ingestion-intelligence-pipeline`, but it is not currently a dependable NIPS authority or an end-to-end production ingestion boundary. Reuse is preferable to creating a second registry, but only after persistence, lifecycle, route wiring, evidence storage, and permission contracts are repaired and verified.

## Evidence found

| Evidence | Observed implementation | Consequence |
|---|---|---|
| Source record contract | `DataSourceRegistryRecord` in `types.ts` includes source identity, licensing reference, permissionVerified, allowed domains, connector, reliability, status and schema version | Useful initial metadata; not yet a complete permission/redistribution policy contract |
| Registration write | `registerDataSource` writes `ingestion_sources/{sourceId}` through the generic `TransactionRunnerAdapter` | A durable write is attempted, but the production backing adapter and transaction store are not established by this module |
| Runtime source cache | Service initializes `sources` as an empty `Map`; no constructor hydration or source-list repository method exists | Restarted service has no demonstrated way to reload registered sources |
| Status change | `setDataSourceStatus` updates only the in-memory Map and writes an audit event; it does not update `ingestion_sources/{sourceId}` through the transaction adapter | Pause/revoke state is not durable and can be lost on restart |
| Ingestion route factory | `routes.ts` exposes source registration/status and batch routes | Route factory exists |
| API composition root | No import or call to `createIngestionIntelligencePipelineRouter` was found in `apps/api/server.ts` or the searched API/server modules | The module is not demonstrated to be mounted in the active Express API |
| Raw object handling | Service creates an `r2://ingestion-staging/...` reference and stores sanitized summary metadata; dependencies expose no R2/object-store adapter | An object reference is not proof that raw bytes were uploaded to R2 |
| Provenance | Ingestion provenance carries source ID/version, external record ID, transformation version and confidence | It does not by itself capture a versioned redistribution/derived-use permission decision |
| Existing D1 migrations | Checked USER_DB, RESEARCH_DB and IRNI migration directories contain no NIPS evidence manifest, canonical observation, variable mapping or source-registry tables | No existing D1 schema can be treated as NIPS analytical persistence |
| IRNI boundary integration | Boundary read model accepts an injected source resolver and fails closed when absent | NIPS must consume verified source metadata through an explicit provider; it must not trust a UI-supplied source label |

## Ownership decision

1. **Candidate owner:** Ingestion Intelligence Pipeline remains the preferred owner for source acquisition and operational source registration.
2. **Not yet authoritative:** Do not make it NIPS's source-of-truth dependency until its source repository supports durable get/list/update, startup hydration, version history, permission lifecycle and audit.
3. **NIPS ownership:** NIPS owns canonical variable definitions/versions, source-field mappings, evidence manifests/references, canonical observations, transformations, profile snapshots and publication decisions.
4. **IRNI ownership:** IRNI remains authoritative for canonical geographic identity, aliases, hierarchy, registry revision and reviewed boundary identity. NIPS stores external references only.
5. **Evidence bytes:** R2/object storage owns raw evidence bytes. A D1 manifest may hold metadata and hashes, but must not imply that an object exists unless upload and hash verification completed.
6. **Research data:** RESEARCH_DB remains a separate behavioral research system. NIPS must not ingest user/session event streams or individual dossiers.

## Required remediation before NIPS provider integration

| Priority | Requirement | Acceptance evidence |
|---|---|---|
| P0 | Replace direct Map dependency with a SourceRegistryRepository port and production adapter | Restart test proves source registration, lookup, status and version survive process restart |
| P0 | Persist status transitions atomically with audit/outbox event | Failed persistence cannot return success; pause/revoke immediately blocks ingestion across instances |
| P0 | Mount the ingestion router only through the intended authenticated API composition root | Route integration test against the actual API app; no shadow/unmounted router |
| P0 | Implement actual R2 upload/read/HEAD verification for raw evidence | Integration test verifies bytes, size, media type and SHA-256 before evidence manifest becomes VALIDATED |
| P0 | Add explicit permission contract: permitted purposes, redistribution class, derived-data rights, territory, effective dates, expiry/revocation and evidence reference | Policy tests reject expired, revoked, unverified or prohibited sources at ingestion and publication |
| P1 | Add immutable source versions and source-registry revision/watermark | Deterministic snapshot replay can resolve the exact source/permission version |
| P1 | Add evidence manifest resolution and lifecycle events | Missing or inaccessible evidence blocks dependent metrics; revocation invalidates dependent snapshots |
| P1 | Define approved aggregate export from ingestion to NIPS | NIPS receives neighborhood-level governed observations, not raw property-level records or direct identifiers |
| P1 | Add pagination and operational read endpoints for registry administration | Bounded list/detail API and audit coverage |

## NIPS integration boundary

The future NIPS adapter should consume a narrow read contract such as:

- `getSource(sourceId, expectedRevision)`
- `getSourcePermission(sourceId, purpose, audience, asOf)`
- `getApprovedMapping(sourceId, datasetId, fieldPath, sourceSchemaVersion, expectedCatalogVersion)`
- `getEvidenceManifest(evidenceId)`
- `getRegistryWatermark()`

The adapter must return typed, version-pinned results. It must not expose credentials, unrestricted raw payloads, individual listing records, or internal actor identifiers to public profile serialization. A missing provider, unknown revision, unresolved permission or unavailable evidence must produce a blocked/unavailable result, never a permissive fallback.

## Explicit non-actions

- No existing ingestion route was mounted.
- No source records were migrated or rewritten.
- No R2 object was uploaded.
- No D1 migration, binding, database creation, deployment or production mutation was performed.
- No new parallel source registry was created.
