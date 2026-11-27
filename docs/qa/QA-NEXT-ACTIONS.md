# QA Next Actions — Radar Tehran

1. **Unblock execution:** reconnect the authorized local execution device.
2. **Triage CI:** retrieve logs for run `45837739418`; identify the first failing command in the quality-gates job and both Worker build checks.
3. **Reproduce:** run only the first failing command locally; classify it as application defect, test defect, infrastructure failure, or environment/configuration issue.
4. **D1 regression baseline:** execute:
   - `npx tsx tests/d1-triad-binding-isolation.test.ts`
   - `npm run test:triad`
   - `npx tsx --test worker/db/writePause.test.ts`
5. **Security and auth:** run `npm run test:auth`, `npm run test:security`, and relevant Worker/API tests.
6. **Browser:** restore prerequisite CI gates, then execute `npm run test:e2e`; inspect RTL, responsive, keyboard, and accessibility behavior.
7. Update all QA registers with exact commands, exit codes, counts, evidence links, and commit SHA.

Do not merge, deploy, touch production data, or weaken existing quality gates.
