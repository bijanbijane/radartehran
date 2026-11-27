# Remediation Register — RMEP-001

Updated: 2026-11-27
Repository: `bijanbijane/radartehran`
Active engineering branch: `feat/nips-backend-runtime-foundation-2026-11-26`
Baseline main commit: `456dcacb387b908797756863b10da1f7104b658e`
Active branch head: `9180bffe91577e9a53460fcf54e0058549813f0d`
NIPS PR: #67 (Draft)

## Active remediation items

| ID | Priority | Finding | Evidence | Status | Required remediation |
|---|---|---|---|---|---|
| RT-NIPS-001 | P1 | NIPS runtime foundation exists, but no persistent adapter, schema migration, HTTP route, or ingestion pipeline is wired. | `server/modules/neighborhood-profile/README.md`; PR #67; branch diff | IN_PROGRESS | Implement only behind the approved IRNI-owned storage RPC; preserve immutable snapshots and transactional compare-and-swap publication. |
| RT-CI-001 | P1 | Five PR #67 workflows fail; rerunning the root quality job still yields a failed job with no steps/log artifact. | Runs #45977620112, #45977620069, #45977619999, #45977620151, #45977620040; rerun job #140435161931; empty steps and `BlobNotFound` | BLOCKED | Diagnose Actions runner/platform execution first. Once steps/logs are available, isolate each failing gate and fix command-level causes. |
| RT-NIPS-002 | P1 | Storage ownership requires an authenticated, versioned NIPS RPC implemented by the database-owning IRNI Worker. Radar must not receive a direct binding to shared IRNI D1. | PR #67 body and `NIPS-BACKEND-IMPLEMENTATION-FOUNDATION-V1.md` | BLOCKED | Coordinate paired IRNI implementation and verify service identity, authorization, idempotency and transaction semantics before adding Radar adapter. |
| RT-NIPS-003 | P1 | The intended `IRNI_GEOGRAPHY` service binding/provider is not available to the Radar runtime. | PR #67 body and implementation tracker | BLOCKED | Verify live service deployment and implement a version-pinned provider adapter without importing Worker bindings into Node/Express. |
| RT-NIPS-004 | P2 | No end-to-end D1 concurrency or migration tests exist for NIPS persistence. | Repository port is an interface; no NIPS migration/adapter in PR #67 | NOT_STARTED | Add adapter-backed tests for immutable snapshots, FK constraints, duplicate publication IDs, CAS races, rollback and retry/idempotency after RPC exists. |
| RT-CI-002 | P1 | Native-auth and Bun lockfile fixes are isolated in PRs #69 and #70 but remain unverified. | Open Draft PRs #69 and #70; their associated Actions runs failed before returning usable step details | BLOCKED | Verify Actions runner execution; confirm Cloudflare preview selects npm, dependency installation succeeds, and frontend/API builds complete. |

## Safety constraints

- Do not create a fourth D1 database.
- Do not add a direct Radar API D1 binding to the shared IRNI-owned neighborhood database.
- Do not read or mutate IRNI-owned geographic registry tables through the NIPS persistence adapter.
- Keep USER_DB and RESEARCH_DB isolated.
- Do not seed or publish the Golden Reference as real neighborhood data.
- No production binding, migration, secret, or deployment change is authorized by this register.

## CI evidence limitation

The GitHub connector returned empty step summaries for the failed jobs and the job-log download returned `BlobNotFound`. The root quality-gate job was rerun; its replacement job also failed with an empty step list and missing log artifact. The exact failing command and root cause remain unverified. Do not classify this as an application-code defect until logs or reproducible local evidence establish it.
