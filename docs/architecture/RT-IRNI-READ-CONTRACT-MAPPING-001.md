# RT-IRNI-READ-CONTRACT-MAPPING-001

**Status:** RPC v2 implementation drafted in both repositories; production cutover blocked pending executable CI and ordered deployment  
**Updated:** 2026-11-25  
**IRNI read repository:** [PR #22](https://github.com/bijanbijane/Iran-Neighborhood-Intelligence/pull/22)  
**IRNI 104-record crosswalk:** [PR #23](https://github.com/bijanbijane/Iran-Neighborhood-Intelligence/pull/23)  
**Radar RPC consumer:** [PR #61](https://github.com/bijanbijane/radartehran/pull/61), stacked on PR #60 → PR #58  
**Tracking:** [Radar Issue #4](https://github.com/bijanbijane/radartehran/issues/4), [IRNI Issue #7](https://github.com/bijanbijane/Iran-Neighborhood-Intelligence/issues/7), [IRNI Issue #21](https://github.com/bijanbijane/Iran-Neighborhood-Intelligence/issues/21)

## 1. Architecture decision

IRNI is the sole canonical owner of geographic entities, canonical IDs, identity anchors, source mappings, verified relationships, legacy alias evidence, publication revisions and checksums.

Radar reads this registry through an internal Cloudflare Workers Service Binding to IRNI's default `WorkerEntrypoint`. Radar must not query the shared geography D1 directly, publish canonical data, or infer canonical identity from local numeric IDs, names, coordinates or proximity.

Radar may retain its own non-canonical market areas, listing coverage, prices, local presentation fields and other business extensions. Those records must link to canonical IRNI IDs only when an evidence-backed one-to-one or explicit many-to-many relationship is approved. Composite market areas are not canonical neighborhoods.

## 2. Verified IRNI source state

Read-only inspection of the shared D1 database `radar-neighborhood-db` confirmed:

- Active registry head and publication pointer both reference revision **19**.
- Head and pointer checksums match.
- `integrity_verified=1`; duplicate conflict count is zero.
- 9,828 canonical entities, 9,827 relationships, 10,341 source mappings and 9,828 identity anchors.
- **3,670** active, verified, non-synthetic `URBAN_NEIGHBORHOOD` entities.
- Five migrations are recorded (0001–0005).

The 3,670 count was rechecked with a read-only D1 query joining canonical entities, identity registry entries and immutable identity anchors. A sample also confirmed that `issued_order_index`, `issued_at_registry_revision` and `entry_json` are present and consistent. All queries reported `rows_written=0` and `changed_db=false`.

## 3. IRNI RPC v2 contract

Draft PR #22 adds:

- Explicit v2 DTOs matching the actual persisted revision-19 `entity_json` and identity-ledger payloads. It does not cast those rows to the richer domain type or invent absent provenance/boundary metadata.
- A D1 repository using `withSession('first-primary')`, publication pointer/head checks and stable-snapshot revalidation.
- Six read methods: metadata, entity by canonical ID, exact identifier resolution, cursor-paginated entities, relationships for an entity, and approved legacy aliases.
- Identity-ledger fields including `issuedOrderIndex` and `issuedAtRegistryRevision`.
- Cursor sorting by official registry order and bounded canonical-name substring filtering.
- Fail-closed behavior on revision/checksum drift, invalid identity/anchor rows, unsupported contract versions and malformed cursors.
- A Worker configuration for the shared D1 read binding with public Worker URLs disabled.

The IRNI Worker is not deployed. PR #22 remains Draft until type generation, strict typecheck and contract tests execute successfully.

## 4. Radar RPC v2 consumer

Draft PR #61 adds:

- Structural v2 RPC types and runtime validators.
- A fail-closed client for `IRNI_GEOGRAPHY`; no public HTTPS or local-data fallback.
- Revision and checksum verification, including entity identity metadata and paginated snapshots.
- A public, read-only Radar facade at `/api/v2/reference/irni/canonical/*` for metadata, entities, relationships, exact resolution and aliases.
- Migration Register entries and a Wrangler Service Binding from Radar to `irni-api`. The binding targets the default WorkerEntrypoint; no `entrypoint` field is required.
- The Geographic Registry Explorer migrated to cursor pagination, official `issuedOrderIndex`, province filtering and canonical-name search; the global map toolbar now links directly to Discover → Registry.
- The legacy 31-province modal is explicitly labeled as Radar's current market-data coverage, not as the canonical national neighborhood registry. Its static market areas remain separate from IRNI canonical entities.
- Health diagnostics that verify IRNI RPC metadata and do not read the shared geography D1 directly.
- Removal of the obsolete external HTTPS/token client and its environment variables.
- Removal of dispatch to the legacy direct-D1 geographic reader/publisher handler.

The old geographic route module remains in the repository for audit/retirement follow-up, but is not dispatched by the Radar Worker on this branch.

## 5. Legacy Radar crosswalk

Radar's active `getAllMultiCityNeighborhoods()` path contains **265 unique legacy market records** across the five configured hubs and imported regional spreads:

| Source | Records |
|---|---:|
| Tehran core + remaining + county sources | 80 |
| Direct records in `multiCityData.ts` | 24 |
| Metropolitan seed arrays | 76 |
| North/West and East/Northeast regional arrays | 45 |
| Central/Zagros and South/Persian Gulf regional arrays | 40 |
| **Total** | **265** |

The previous 104-record count omitted 161 records introduced through imported arrays. The stale source-code comment claiming 996 records was also incorrect and is corrected in Radar PR #61. The full static source inventory has 265 unique numeric IDs and no duplicates. Other server-side/dynamic geography sources remain a separate call-site audit.

IRNI Draft PR #23 now records every one of these 265 source rows and its evidence-backed status:

| Classification | Count |
|---|---:|
| Existing one-to-one numeric compatibility aliases in live revision 19 | 11 |
| Yusefabad one-to-one proposal, not published | 1 |
| Karaj one-to-one candidates requiring human review | 2 |
| Radar-owned composite market areas | 42 |
| Alternate-label review case | 1 |
| Unresolved | 47 |
| **Total** | **265** |

Only the 11 existing one-to-one aliases and the unpublished Yusefabad proposal receive proposed namespaced keys. The other 92 rows receive no canonical alias key. Numeric aliases remain compatibility evidence and are not automatically attached by the v2 client. No alias has been published or activated by these PRs.

## 6. Production drift and cutover boundary

Read-only Cloudflare settings inspection on 2026-11-25 found:

- Production Worker `radartehran-api` still has the legacy `NEIGHBORHOOD_DB` binding to `radar-neighborhood-db`.
- Production Worker still has the legacy `IRNI_PUBLISH_HMAC_SECRET`.
- Staging has no shared geography D1 binding.
- No `irni-api` Worker is deployed yet.

These are current production facts, not the desired architecture. The Radar PR's Wrangler configuration removes the direct geography D1 binding and adds the internal RPC Service Binding, but it must not be deployed until IRNI's Worker is deployed and the replacement route is tested. The publisher secret must be explicitly retired after the cutover; changing Wrangler config alone does not delete a stored secret.

The database-triad health route now reports degraded status while the legacy direct binding remains present or IRNI RPC is unavailable. It verifies user/research D1 and the IRNI service through RPC; it no longer probes the geography D1 directly.

## 7. Dependency and validation gates

Merge/deploy order:

1. IRNI PR #22: executable type generation, typecheck and contract tests must pass.
2. IRNI Worker deployment with the shared D1 binding and no public URL.
3. Radar PR #58 → PR #60 → PR #61, in order; PR #61 must not be retargeted around its auth/runtime dependencies.
4. Validate the Service Binding and all six RPC methods in a controlled staging environment.
5. Deploy Radar config, verify health reports `irniRpc=ok` and no legacy direct D1 binding, then explicitly remove the old publisher secret.
6. Complete evidence-backed resolution of the 104 legacy rows; do not promote review/unresolved/composite rows by fuzzy matching.

GitHub Actions currently fails before job execution: the latest IRNI job reports `runner_id=0`, no steps and no log artifact. This is not a source-code test failure and is not a passing validation. Both PRs remain Draft until executable checks run.

## 8. Safety record

No D1 writes, migrations, alias publication, Cloudflare binding/secret changes or Worker deployments were performed during this implementation. The shared database remains at revision 19. Production cutover is intentionally blocked until the dependency and validation gates above are satisfied.
