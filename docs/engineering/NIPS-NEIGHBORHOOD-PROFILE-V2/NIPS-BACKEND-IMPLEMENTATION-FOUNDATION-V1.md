# NIPS Backend Runtime Foundation — 2026-11-26

**Branch:** \`feat/nips-backend-runtime-foundation-2026-11-26\`  
**Baseline:** \`main\` at \`456dcacb387b908797756863b10da1f7104b658e\`  
**Scope:** NIPS-1.0.0 runtime foundation in the Tehran Radar backend. This is not a production deployment or a database migration.

## 1. Implementation delivered in this change

- Added an explicit mapping from the twelve catalog categories (120 variable IDs) into the fourteen runtime profile domains. The cross-cutting \`history\` domain is not a thirteenth catalog category.
- Added a Golden Reference validator. It checks the exact twelve-category / 120-variable structure and rejects any fixture carrying a real geographic identity or real values.
- Added strict canonical JSON serialization and SHA-256 snapshot hashing. Object keys are sorted; cycles, sparse arrays, accessors, symbols, non-finite values and non-plain runtime objects are rejected. Volatile creation/publication timestamps are excluded from the content hash.
- Added a NIPS snapshot assembler. Assembly requires the complete fourteen-domain envelope, a confirmed canonical geographic identity and an identity registry revision. It computes quality counters and validates the resulting snapshot before hashing.
- Added explicit publication decision records separate from snapshot content. Approval is represented as \`APPROVED/ACTIVE\`; rejection as \`REJECTED/SUPERSEDED\`; revocation as \`REVOKED/REVOKED\`.
- Added a publication evaluator that rechecks policy, canonical identity and the deterministic content hash before approving a publication.
- Added a Repository port and application service. The activation contract requires compare-and-swap on the active publication and a single transaction for saving the decision, superseding the previous active decision, and replacing the active pointer.
- Added an allow-list public serializer. Restricted, prohibited, unverified or absent evidence permission suppresses the corresponding metric; source IDs, raw object references, hashes, verified aliases, legacy crosswalks and raw domain payloads are not returned in the public view.
- Hardened profile validation for non-finite quality values, sparse/accessor arrays, malformed envelopes, mandatory publication domains and quality/readiness counter consistency.

## 2. Challenge register and adopted solutions

| ID | Verified challenge | Adopted solution | Status |
|---|---|---|---|
| NIPS-BE-001 | Runtime profile has 14 domains while NIPS-1.0.0 catalog has 12 categories / 120 variable IDs. | Keep the axes separate; maintain a versioned, explicit category-to-domain mapping. Treat \`history\` as cross-cutting. | Implemented in domain code; contract test added. |
| NIPS-BE-002 | Golden Reference is a structural fixture, not a real neighborhood record. | Validate fixture identity flags, exact category/variable counts and null reference-only values. Never seed or publish it as real data. | Implemented; fixture test added. |
| NIPS-BE-003 | Shared storage ownership was not approved at the time of the initial implementation. | Owner decision received on 2026-11-27: NIPS will share the existing `radar-neighborhood-db` (`NEIGHBORHOOD_DB`) rather than create a fourth D1 database. NIPS must use its own prefixed tables and migrations under `migrations/neighborhood-d1`; `USER_DB` and `RESEARCH_DB` remain physically isolated. IRNI canonical identity and boundary reads remain exclusively behind the version-pinned `IRNI_GEOGRAPHY` Service Binding; NIPS must not query or mutate IRNI-owned registry tables directly. | Ownership decision approved; D1 schema/adapter, migration review, staging binding verification and transactional CAS tests remain pending. |
| NIPS-BE-004 | The IRNI geography capability is a Cloudflare Worker Service Binding; the Express/Node API is a separate runtime. | Keep NIPS domain logic runtime-neutral. Resolve identity only through an explicit version-pinned provider/adapter. Do not import Worker bindings into Express or pretend they are environment variables. | Runtime-neutral boundary implemented; provider adapter/integration test blocked on approved RPC/service contract. |
| NIPS-BE-005 | Existing profile model contains legacy publication fields alongside a separate publication table in the design. | Treat publication as an independent append-only governance decision; leave legacy snapshot fields for compatibility in this increment. Remove/deprecate them only with a versioned schema migration and backfill plan. | New publication model implemented; legacy-field retirement remains open. |
| NIPS-BE-006 | A configurable publication policy could omit identity/geography/evidence or allow a non-ready identity. | Make those three domains non-removable hard gates in validation; require a confirmed canonical entity and positive registry revision. | Implemented; regression test added. |
| NIPS-BE-007 | Existing quality checks could accept NaN/Infinity or inconsistent counters. | Require finite 0..1 ratios and exact recomputation of metric/readiness/profile counters. | Implemented; regression tests added. |
| NIPS-BE-008 | Public output could accidentally expose evidence references or restricted-source values. | Use an explicit public serializer allow-list; suppress values without verified redistribution/derived-data permission. | Implemented; restricted-evidence test added. |
| NIPS-BE-009 | Concurrent publication activations can race and leave multiple active pointers. | Require a compare-and-swap token and one database transaction covering the publication row, previous active status and active pointer. | Port contract implemented; DB concurrency test waits for the real adapter. |

## 3. Deliberately not done

- No migration was added or applied. The current SQL remains design-only.
- No D1 database, Worker binding, Service Binding, Queue, R2 bucket or production secret was created or modified.
- No Express route or Worker route is mounted for NIPS until the storage and IRNI identity contracts are authorized and integration-tested.
- No real neighborhood values were generated, inferred or published.
- No old, deeply-behind backend branches were merged into this work. The feature branch is based directly on current main.

## 4. Verification and acceptance gates

The new contract suite is \`tests/nips-backend-runtime-foundation.test.ts\`. It covers Golden Reference integrity, category/domain mapping, canonical JSON/hash behavior, assembly and identity rejection, non-removable publication gates, publication approval and public evidence suppression.

The GitHub Actions result is authoritative for this branch. A green contract test does not prove the D1 adapter, live IRNI provider, migration, production deployment or data coverage. Those remain separate acceptance gates.

## 5. Next implementation sequence

1. Obtain explicit owner, database ID, D1 binding name, region/account, migration ownership and read/write boundaries for the shared NIPS store.
2. Define the authenticated/version-pinned IRNI identity/boundary read contract for both Worker and Express consumers.
3. Implement the D1 repository adapter with foreign-key enforcement, immutable snapshot writes, active-publication compare-and-swap and integration tests against actual D1.
4. Add migration only after the data ownership model and schema constraints are approved; test it locally and in staging before production.
5. Mount a read-only public API route only after publication gating, serializer tests and repository integration are green; then add controlled internal/admin workflows.
6. Prove coverage for every eligible canonical neighborhood. Structural profile creation is not proof of real-data completeness.
