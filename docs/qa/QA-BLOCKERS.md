# QA Blockers

## Active

1. **GitHub Actions jobs fail before runner assignment**
   - Five latest independent workflows triggered by PR #74 failed before execution: 46004991418, 46004991653, 46004991515, 46004991666, 46004991463.
   - Each failed job reports `runner_id: 0`, empty `runner_name`, and `steps: []`; completion occurred within 1–2 seconds.
   - The primary CI Playwright job and three path-filtered downstream jobs were skipped because prerequisite jobs failed.
   - Primary CI job-log retrieval (job 140525806828) returns HTTP 404 `BlobNotFound`; no test command output exists.
   - This is a CI startup/infrastructure failure, not evidence that application code or tests failed.
   - Root cause is unconfirmed. Check account Actions usage/billing and hosted-runner eligibility, then repository Actions policy. If those are clear, escalate run IDs to GitHub Support.

2. **No independent command-execution host is available through the current GitHub repository integration**
   - GitHub repository APIs permit source inspection and commits but do not execute npm/Node/Wrangler/Playwright commands.
   - No repository test command has been executed in this session. The prior QA register records the configured MacBook execution device as offline; current session did not verify a device reconnection.

## External status check

- The earlier public GitHub Status check reported all systems operational on 2026-11-27. That does not establish that this account/repository has no billing, policy, or runner-eligibility restriction.

## Not blockers

- GitHub repository access and branch write permissions are available.
- Dedicated QA branch and Draft PR #74 exist.
- QA suite and all six persistent QA records exist on the QA branch.
- Repository file inspection and isolated branch commits are available.
