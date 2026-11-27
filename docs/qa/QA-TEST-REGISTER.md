# QA Test Register — Radar Tehran

This register records test commands discovered in the repository. A command is not marked passed unless it was executed and its exit status was observed.

| ID | Layer | Command / suite | Current status |
|---|---|---|---|
| QA-T-001 | TypeScript | `npm run lint` and `npm run typecheck` | Not independently executed in this session |
| QA-T-002 | Architecture | `npm run arch:check` | Not independently executed in this session |
| QA-T-003 | Unit / broad regression | `npm test` | Not independently executed in this session |
| QA-T-004 | Contracts | `npm run test:contracts` | Not independently executed in this session |
| QA-T-005 | Mutation invariants | `npm run test:mutation` | Not independently executed in this session |
| QA-T-006 | D1 binding isolation | `npx tsx tests/d1-triad-binding-isolation.test.ts` | Pending |
| QA-T-007 | D1 triad | `npm run test:triad` | Pending |
| QA-T-008 | Worker write-pause | `npx tsx --test worker/db/writePause.test.ts` | Pending |
| QA-T-009 | Auth regression | `npm run test:auth` | Historical RMEP record only; rerun pending |
| QA-T-010 | Cloudflare integration | `npm run test:cloudflare` | Not independently executed in this session |
| QA-T-011 | Browser E2E | `npm run test:e2e` | Skipped by latest main CI because prerequisite quality-gates job failed |
| QA-T-012 | Production frontend build | `npm run build` | Latest main CI quality-gates job failed; exact failing step unknown |

## Counting rule

Current-session executed / passed / failed / skipped: **0 / 0 / 0 / 0**. CI job conclusions are tracked separately and are not converted into individual test counts.
