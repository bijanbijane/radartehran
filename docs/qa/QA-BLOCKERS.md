# QA Blockers — Radar Tehran

## QA-BLOCK-001 — No online local execution host

- The configured Desktop Commander device `MacBook-Air.local` is offline (last seen 20 hours ago).
- Consequently, this session cannot run npm, Node, Wrangler, Vitest, or Playwright commands against a checked-out working tree.
- **Required:** Reconnect the authorized MacBook / Desktop Commander agent or provide another authorized execution environment.

## QA-BLOCK-002 — Main CI failure logs unavailable

- Failed workflow run: [45837739418](https://github.com/bijanbijane/radartehran/actions/runs/45837739418).
- GitHub API reports no retained artifacts for this run.
- The job-log retrieval endpoint returned HTTP 404.
- **Required:** Restore job-log access or rerun CI with diagnostics retained.

No production deployment, production data mutation, or secret access is required to clear these blockers.
