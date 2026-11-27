# QA Next Actions

1. Inspect GitHub account **Settings → Billing and licensing → Usage/Budgets** for Actions minutes, included quota, and spending limits.
2. Inspect repository **Settings → Actions → General** for Actions enablement, allowed actions, and GitHub-hosted runner policy.
3. If billing and policy are clear, submit the five run IDs in `QA-BLOCKERS.md` to GitHub Support; the jobs never received runners and produced no logs.
4. Do not alter workflow YAML or application code to compensate for a pre-runner failure without new evidence.
5. Once runner allocation works, run `npm run test:contracts` first and inspect the new NIPS regression test output.
6. Then inspect the complete quality-gates CI job, including the first failing step, and classify test, source, configuration, and infrastructure failures separately.
7. Continue with high-risk backend/API authorization and D1 write-path contracts, following current AGENTS.md.
8. Update execution state and all registers with actual test counts and run evidence.
9. Keep PR #74 unmerged; do not deploy.
