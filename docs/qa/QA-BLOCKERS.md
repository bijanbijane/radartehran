# Radar Tehran QA Blockers

## Active

1. **GitHub Actions runner allocation failure — confirmed**
   - Five PR #79 workflow jobs returned `runner_id=0`, empty `runner_name`, and zero steps.
   - They failed within approximately 2–5 seconds, before checkout, Node setup, dependency installation, or any test command.
   - A rerun of the primary CI quality-gates job produced the same `runner_id=0`, empty runner name, zero-step failure.
   - Evidence: runs `45982139278`, `45982139311`, `45982139268`, `45982139346`, `45982139324`; retry job `140448953174`.
   - Conclusion: runner allocation did not occur. This is not an application test failure and no test assertion ran.
   - Public GitHub Status currently lists Actions as operational and reports no incident for 2026-11-27; this does not rule out a repository/account-specific runner eligibility, quota, or configuration issue. Those settings have not yet been inspected. (https://www.githubstatus.com/)
   - Next: inspect repository/account Actions runner eligibility and usage, or use the authorized local runner. Avoid further blind retries until the runner state changes.

2. **Local runner unavailable**
   - The authorized Desktop Commander MacBook device reports Offline.
   - No local npm install, test, typecheck, build, or Wrangler dry-run has been executed.

3. **CI repairs remain unverified**
   - QA-001 through QA-004 are statically corrected and GitHub read-back verified.
   - Their runtime behavior remains unknown until a job receives a real runner and executes steps.

No production credentials, production data, deployment, migration, secret rotation, or destructive operation was touched.
