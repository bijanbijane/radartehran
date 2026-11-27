# NIPS Implementation Tracker

**Status date:** 2026-11-27  
**Objective:** Implement the neighborhood profile system specified by the NIPS v3.3 execution directive, while preserving the approved IRNI identity and database ownership boundaries.

> This tracker records verified repository and platform facts. A source-level implementation is not marked VERIFIED until its required tests or integration checks have actually run and passed.

## 1. Authoritative baseline and reconciliation

| Concern | Current evidence | Decision / status |
|---|---|---|
| Execution requirements | User-approved NIPS v3.3 implementation directive supplied on 2026-11-27 | Governing implementation brief for this work |
| Catalog source of truth | IRNI `NEIGHBORHOOD-VARIABLE-CATALOG.md`, schema/taxonomy version `2.0.0` | 120 variables / 12 primary categories; definitions are schemas, not measurements |
| Runtime domains | Radar NIPS runtime has 14 domains | `history` is cross-cutting, not a 13th primary category |
| Published standard in Radar | `NIPS-1.0.0` and Golden Reference merged in Radar main by PR #66 | Existing compatibility baseline; do not silently relabel it as v3.3 |
| NIPS v3.3 artifact | No canonical v3.3 specification/catalog artifact was found in either repository or the NIPS Notion page during this audit | Open reconciliation item; preserve the IRNI 2.0.0 catalog and do not invent variable metadata |
| Physical database | Cloudflare D1 `radar-neighborhood-db`, ID `f335efe8-37ac-4c7d-a057-bc9f4480f6c6` | Existing database; no new database |
| Database owner | IRNI | All NIPS storage access must be through an IRNI-owned authenticated/versioned service contract |
| Logical ownership | NIPS-owned tables with `nips_` prefix inside the shared physical database | Radar API must not bind directly to the IRNI database |
| Data authority | IRNI canonical identities, aliases, relationships and boundaries remain authoritative | NIPS stores canonical references; no duplicate identity or boundary master |

## 2. Repository, branch and PR

- Radar repository: `bijanbijane/radartehran`
- Active Radar implementation branch: `feat/nips-backend-runtime-foundation-2026-11-26`
- Existing implementation PR: [#67 — deterministic neighborhood profile runtime foundation](https://github.com/bijanbijane/radartehran/pull/67)
- PR #67 base: `main`; baseline SHA at branch creation: `456dcacb387b908797756863b10da1f7104b658e`
- PR #67 head before this tracker commit: `006d41662ec3a05c921651b1060c6ca02aac4710`
- PR #67 remains Draft; do not merge or deploy until required checks and integrations pass.
- Radar PR #66 registered NIPS-1.0.0 and Golden Reference in Radar main. It is not an active implementation PR.
- IRNI repository: `bijanbijane/Iran-Neighborhood-Intelligence`
- IRNI PR #24 is a separate Draft documentation PR for NIPS-1.0.0; it is not an implementation of storage or RPC.
- An owner-side IRNI implementation branch/PR is required for the authenticated NIPS storage service. Do not put IRNI-owned D1 writes in the Radar repository.

## 3. Phase status

Task states: `NOT_STARTED`, `IN_PROGRESS`, `IMPLEMENTED`, `VERIFIED`, `BLOCKED`, `DEFERRED`.

| Phase | Status | Evidence / remaining work |
|---|---|---|
| 0 — Repository and architecture audit | IN_PROGRESS | Both repositories, main/feature trees, NIPS PRs, catalog source, IRNI ADR, Notion architecture page and live Cloudflare Worker/D1 metadata inspected. Remaining: complete owner-side schema/migration-ledger audit and resolve NIPS v3.3 document/version reconciliation. |
| 1 — Contracts and catalog | IN_PROGRESS | Radar runtime foundation in PR #67 contains 12-category/120-variable mapping, 14-domain model, Golden Reference validator, snapshot assembly, deterministic hashing, publication policy and public serializer. Missing: persistent variable definitions, complete per-neighborhood variable-state vocabulary/matrix, applicability and lifecycle rules aligned to the approved source catalog. |
| 2 — Persistent storage and IRNI RPC | BLOCKED | No live `irni-api` Worker exists. IRNI `workers/irni-api` is LOCAL_SCAFFOLD_ONLY; its RPC methods return STORAGE_UNAVAILABLE. No durable D1 repository or authorized live binding is configured. Build owner-side contract, D1 adapter, additive migration draft and local integration tests; do not apply remotely. |
| 3 — Provisioning and backfill | NOT_STARTED | No NIPS durable outbox, profile provisioning consumer, resumable backfill or reconciliation implementation verified. |
| 4 — Observation and metric pipeline | NOT_STARTED | No complete NIPS observation/metric persistence pipeline or verified Source Registry/R2 integration. Existing IRNI source and persistence prototypes are in-memory; do not treat them as production persistence. |
| 5 — Snapshot and publication | IN_PROGRESS | Domain-level snapshot assembly/hash and publication decision/evaluation exist in PR #67. Missing: durable immutable snapshot repository, transactionally safe publication activation/CAS, policy persistence, snapshot-pinned API reads and integration/security tests. |
| 6 — Frontend integration | NOT_STARTED | No NIPS profile page integration or canonical-ID view-model contract has been verified. |
| 7 — Final audit and hardening | NOT_STARTED | Pending integration, migration, security, frontend, CI and coverage verification. |

## 4. Verified implementation inventory

### Radar PR #67 source-level implementation

- Explicit mapping of 12 catalog categories / 120 variable IDs to 14 runtime domains.
- Golden Reference structure validation; the fixture is reference-only and contains no real neighborhood identity or observations.
- Canonical JSON serialization and deterministic SHA-256 hash implementation.
- Canonical-identity-gated profile assembly and quality/readiness validation.
- Separate publication decision model and policy evaluation.
- Repository/application ports with compare-and-swap activation contract.
- Public allow-list serialization with evidence-permission suppression.
- Validation hardening for unsafe JSON values, non-finite numbers, hard publication gates and counter consistency.
- `npm run test:nips` script wired into the package scripts.

These are source-level facts. They do **not** prove D1 persistence, RPC operation, deployed behavior or coverage of actual neighborhoods.

### Owner-side IRNI findings

- The authoritative variable catalog is `NEIGHBORHOOD-VARIABLE-CATALOG.md`, version 2.0.0, with 120 variables in 12 primary categories.
- `workers/irni-api` is explicitly LOCAL_SCAFFOLD_ONLY and has no D1, Queue or Service Binding configuration.
- Its current geographic RPC methods fail closed with `STORAGE_UNAVAILABLE` until durable D1 repository/schema/ledger verification.
- Existing repository interfaces are present, but the inspected storage implementations are prototypes backed by in-memory repositories.
- IRNI ADR-0001 adopts shared physical D1 with IRNI as the sole geographic writer and an internal Workers RPC read boundary. The NIPS storage RPC must be a separately scoped owner-side contract for NIPS-owned tables; it must not grant Radar authority over canonical IRNI tables.

## 5. Live Cloudflare inspection (read-only)

Account: `Bijanbijane` (`5bafb2033937006704e81afcc0b18b38`).

| Resource | Observed state |
|---|---|
| `radar-neighborhood-db` | Exists; ID `f335efe8-37ac-4c7d-a057-bc9f4480f6c6`; metadata reports 19 tables, approximately 237 MB, region ENAM |
| `radartehran-api` production | Has direct `NEIGHBORHOOD_DB` D1 binding to the IRNI-owned database |
| `radartehran-api-staging` | No `NEIGHBORHOOD_DB` binding and no `IRNI_GEOGRAPHY` Service Binding observed |
| `irni-api` | No deployed Worker with this name observed; the repository Worker is local scaffold only |
| New databases/resources | None created by this work |

**Critical transition:** The production direct `NEIGHBORHOOD_DB` binding conflicts with the target ownership contract. It was not removed: first implement and verify the owner-side RPC in a safe local/staging path, inventory every current consumer, then prepare a separately authorized cutover. Do not break production reads by removing the binding prematurely. No production binding, secret, migration or deployment was modified.

## 6. CI and test evidence

Latest observed PR #67 head before this tracker update: `006d41662ec3a05c921651b1060c6ca02aac4710`.

Five associated workflows were completed with `failure`:

- Tehran Radar CI Quality Gates — run `45932044234`
- Radar Backend Triad & Frontend Service Binding — run `45932044268`
- Cloudflare Native Auth Validation — run `45932044243`
- IRNI Geographic RPC Consumer Contract — run `45932044250`
- Tehran Radar Path-Filtered Checks — run `45932044356`

The fetched job records returned no steps; fetching their log artifacts returned `BlobNotFound`. Therefore the root causes cannot be attributed to implementation or baseline from the available logs. These checks are failures, not passes.

| Validation | Status |
|---|---|
| `npm run test:nips` | IMPLEMENTED as a script; not executed in this connected session |
| TypeScript on PR head | Not independently executed in this session |
| Local D1 migration/persistence integration | NOT_STARTED |
| IRNI RPC authentication/authorization integration | BLOCKED |
| GitHub CI on latest pre-tracker PR head | FAILURE; step/log evidence unavailable |
| Production migration | NOT_APPLIED |
| Production deployment | NOT_DEPLOYED by this work |
| Production persistence | NOT_VERIFIED |

## 7. Migration, deployment and safety state

- No NIPS migration has been applied.
- The existing Radar SQL file named `NIPS-D1-LOGICAL-SCHEMA-V1.DESIGN-ONLY.sql` is design-only and still refers to the superseded proposed database name `radar-profile-db`. It must not be applied. Reconcile the document with the shared IRNI-owned physical database and owner-side migration process.
- Do not add NIPS tables to `USER_DB` or `RESEARCH_DB`.
- Do not add a fourth NIPS database.
- Do not add a direct D1 binding from Radar API to `radar-neighborhood-db`.
- No real neighborhood data, observations, confidence values or boundaries have been fabricated.
- No production secrets, bindings, database migrations, Worker deployments or PR merges have been changed.

## 8. Current blockers

1. Owner-side IRNI D1 schema and migration-ledger audit is incomplete. Cloudflare metadata alone is not schema verification.
2. No live IRNI Worker with an operational storage RPC is deployed.
3. NIPS v3.3 canonical specification artifact was not found in the repositories or the linked Notion architecture page; the existing authoritative variable definitions found are IRNI catalog 2.0.0 / NIPS-1.0.0.
4. Production Radar API still has a direct IRNI D1 binding; safe removal depends on the owner RPC cutover and consumer audit.
5. Latest PR #67 CI is red and lacks retrievable job steps/logs.
6. Durable NIPS provisioning, per-variable matrix, observation pipeline, snapshots/publications persistence, and frontend integration remain incomplete.

## 9. Exact next actions

1. Create/extend the owner-side IRNI implementation branch for a versioned, authenticated, purpose-scoped NIPS Storage RPC; keep canonical geography APIs and NIPS storage operations separately authorized.
2. Implement the NIPS-owned D1 repository and additive `nips_` schema in the IRNI repository, with a local-only migration/test path. Do not attach the live shared database to staging or run remote migrations before owner schema/ledger verification.
3. Persist the approved IRNI catalog versions and implement the complete profile-variable state matrix with the eight required states; preserve catalog metadata exactly and report any missing definition.
4. Implement idempotent outbox provisioning, retry/reconciliation, and resumable backfill against the canonical identity list supplied by IRNI.
5. Add provenance-bound observation/metric persistence, immutable snapshot storage, separate publication decisions and CAS.
6. Integrate Radar through the IRNI contract; remove the production direct D1 binding only in a planned, authorized cutover after staging verification.
7. Investigate CI runner/log failures and run the focused NIPS tests, TypeScript, local D1 tests, contract/security tests and full CI. Keep PRs Draft until required checks pass.
8. Update this tracker after each verified unit and update the NIPS Notion architecture page with the same evidence.

## 10. Status vocabulary

- `IMPLEMENTED`: source code/change exists.
- `VERIFIED`: relevant command/integration/test actually ran and passed.
- `BLOCKED`: external contract, owner permission, schema audit, unavailable environment or another genuine dependency prevents safe verification.
- `DEFERRED`: intentionally postponed with a recorded reason.

Never infer deployed or production status from local source code or CI unit tests.


## 11. Additional owner-side work discovered after the initial audit

IRNI PR #22 is an existing Draft implementation branch for the separate, read-only geographic RPC v2:

- PR: [#22 — audited read-only geography RPC v2](https://github.com/bijanbijane/Iran-Neighborhood-Intelligence/pull/22)
- Branch: `feat/irni-d1-readonly-geography-rpc-v2-2026-11-25`
- Head at audit: `e657824b2727c4cfe9537d965ea7fe51fd4484f7`
- It adds `D1ReadOnlyGeographicRegistryRepository`, a version-pinned read-only repository, and configures the owner Worker candidate with `GEOGRAPHIC_REGISTRY_DB` pointing at the existing `radar-neighborhood-db`.
- Its RPC methods are SELECT-only and its PR body reports a revision-19 audit with 9,828 canonical entities and 3,670 active verified non-synthetic urban neighborhoods. These are claims recorded by that PR, not counts independently queried in this session.
- Its CI run `45613213136` failed before providing usable job steps/logs. PR #22 remains Draft and no live `irni-api` deployment was observed.

**Do not turn the read-only geography RPC into a write API.** NIPS storage operations must be a separate versioned and purpose-scoped owner-side RPC entrypoint/module, sharing the existing IRNI Worker boundary and physical database binding only where authorized. A separate stacked implementation PR based on PR #22's audited code is preferred over changing the semantics of PR #22.

The current IRNI catalog type `VariableDefinition` includes data type, unit, category, geographic level, minimum geographic resolution, temporal semantics, measurement nature, source policy, validation rules, lifecycle, and schema version. It does not, by itself, provide a complete evaluated applicability decision for every canonical neighborhood. Golden Reference rows explicitly say applicability is unassessed and contain no real values. The provisioning implementation must therefore create explicit variable-state rows without guessing applicability; unresolved applicability must remain `BLOCKED` until an approved rule evaluates it.

The existing IRNI schema-evolution document says no migration has been executed against a real database, and the current repository has no checked-in Worker D1 migration directory. The revision-19 geographic data snapshot reported by PR #22 is not, by itself, proof of an approved D1 schema-migration ledger. NIPS migration ordering/ledger ownership must be reconciled before any remote migration.
