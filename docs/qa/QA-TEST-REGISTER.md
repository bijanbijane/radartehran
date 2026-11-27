# Radar Tehran QA Test Register

| Test ID | Suite / Command | Scope | Execution status | Evidence |
|---|---|---|---|---|
| QA-T-001 | `npm run test:triad` | RT-DB-TRIAD-001 and RT-DB-TRIAD-002 real-SQLite and forensic regression suites | Not executed — CI failed before steps | Existing package script and test files inspected; now included in `test:cloudflare` |
| QA-T-002 | `npm run test:cloudflare` | Cloudflare Worker platform, AI commerce architecture, D1 binding isolation, triad suites, and write-pause tests | Not executed — CI failed before steps | Root `package.json` and `.github/workflows/ci.yml` inspected |
| QA-T-003 | CI quality-gates job | TypeScript, architecture, unit, storage, stress, build, Cloudflare and staging dry-run gates | Runner failure before steps; logs unavailable | Run 45978194244; rerun also failed before steps |

**Counting policy:** tests executed/passed/failed/skipped remain zero until actual runner output is inspected. Source inspection is not test execution.
