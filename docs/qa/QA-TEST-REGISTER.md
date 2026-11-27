# Radar Tehran QA Test Register

| ID | Command | Scope | Status |
|---|---|---|---|
| QA-T-001 | `npm run test:triad` | RT-DB-TRIAD-001 and RT-DB-TRIAD-002 | Not executed |
| QA-T-002 | `npm run test:cloudflare` | Worker platform, AI commerce, D1 binding isolation, D1 triad, write-pause | Not executed |
| QA-T-003 | `npm run test:auth` | Native auth, Google OIDC, browser session, session bridge, fail-closed Worker auth | Not executed |
| QA-T-004 | `npm run test:irni-geographic-rpc` | Canonical RPC route, v1 RPC client, v2 consumer tests | Not executed |
| QA-T-005 | `npm run typecheck:irni-geographic-rpc` | Strict isolated RPC consumer typecheck | Not executed |
| QA-T-006 | `npm run test:geography-catalog` | Legacy geography catalog transition guardrails | Not executed |
| QA-T-007 | `npm run test:security` | Telegram/admin and security remediation suites | Not executed |
| QA-T-008 | GitHub Actions quality gates | TypeScript, architecture, unit, storage, stress, build, Cloudflare, E2E | Runner allocation failure before steps | Runs 45982139278 etc.; runner_id=0, runner_name empty, steps=0 |

Counting policy: source inspection and workflow wiring do not count as test execution. Keep all counts at zero until actual runner output is inspected.
