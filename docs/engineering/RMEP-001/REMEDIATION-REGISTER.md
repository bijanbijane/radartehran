# Remediation Register — RMEP-001

Updated: 2026-11-27
Repository: `bijanbijane/radartehran`
Active engineering branch: `feat/nips-backend-runtime-foundation-2026-11-26`
Baseline main commit: `456dcacb387b908797756863b10da1f7104b658e`
NIPS PR: #67 (Draft)

## Active remediation items

| ID | Priority | Finding | Evidence | Status | Required remediation |
|---|---|---|---|---|---|
| RT-NIPS-001 | P1 | NIPS runtime foundation exists, but no persistent D1 adapter, schema migration, HTTP route, or ingestion pipeline is wired. | `server/modules/neighborhood-profile/README.md`; PR #67; branch diff | IN_PROGRESS | Implement only behind the approved IRNI-owned storage RPC; preserve immutable snapshots and transactional compare-and-swap publication. |
| RT-CI-001 | P1 | CI for PR #67 fails in multiple workflows. The path-filtered workflow fails at its `detect` job; other failed jobs include D1 triad, IRNI RPC, native auth, and root CI. | Workflow run #45932044356 (attempts 1 and 2); runs #45932044268, #45932044250, #45932044243, #45932044234 | BLOCKED | Obtain usable job logs/step details, isolate each failing gate, fix root causes, and rerun. Do not infer the cause from a failed conclusion alone. |
| RT-NIPS-002 | P1 | Storage ownership boundary requires an authenticated, versioned NIPS RPC implemented by the database-owning IRNI Worker. Radar must not receive a direct binding to the shared IRNI D1 database. | NIPS PR #67 body and `NIPS-BACKEND-IMPLEMENTATION-FOUNDATION-V1.md` | BLOCKED | Coordinate the paired IRNI implementation and verify the RPC contract, service identity, authorization, idempotency, and transaction semantics before adding a Radar adapter. |
| RT-NIPS-003 | P1 | The intended `IRNI_GEOGRAPHY` service binding/provider is not yet available to the Radar runtime according to the current PR evidence. | NIPS PR #67 body | BLOCKED | Verify the live service deployment and implement a version-pinned provider adapter without importing Worker bindings into Node/Express. |
| RT-NIPS-004 | P2 | Current schema/contract foundation has no demonstrated end-to-end D1 concurrency or migration tests. | Repository port is an interface only; no NIPS migration/adapter in the branch diff | NOT_STARTED | Add adapter-backed tests for immutable snapshots, FK constraints, duplicate publication IDs, CAS races, rollback, and retry/idempotency after the RPC exists. |

## Safety constraints

- Do not create a fourth D1 database.
- Do not add a direct Radar API D1 binding to the shared IRNI-owned neighborhood database.
- Do not read or mutate IRNI-owned geographic registry tables through the NIPS persistence adapter.
- Keep USER_DB and RESEARCH_DB isolated.
- Do not seed or publish the Golden Reference as real neighborhood data.
- No production binding, migration, secret, or deployment change is authorized by this register.

## CI evidence limitation

The GitHub connector returned empty step summaries for the failed jobs and the job-log download returned `BlobNotFound`. A rerun of the path-filtered `detect` job completed with failure again. Therefore the exact failing command and root cause remain unverified; this is not classified as a code defect until logs or reproducible local evidence establish it.
