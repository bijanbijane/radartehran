# QA Next Actions

1. Open a draft pull request from `qa/radar-tehran-autonomous-qa-2026-11-27` into `main`.
2. Confirm the pull-request event actually starts the intended CI workflow.
3. Inspect workflow run conclusion, individual jobs, logs, and test counts.
4. If the new NIPS regression suite fails, reproduce and correct the test or fixture only when evidence identifies the cause.
5. Expand the next work package to high-risk backend/API authorization and D1 write-path contracts, following current AGENTS.md.
6. Update execution state and all relevant registers with actual run evidence.
7. Do not merge the QA pull request or deploy.
