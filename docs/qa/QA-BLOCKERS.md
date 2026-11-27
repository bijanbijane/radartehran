# QA Blockers

## Active

1. **GitHub Actions jobs fail before runner assignment**
   - Latest five PR #74 runs on head `b9e43ded6f6ecb9675eafd3d3694dfbba64fe44d`: 46005424220, 46005424339, 46005424528, 46005424288, 46005424272.
   - Each primary job reports zero steps; CI E2E and three path-filtered dependent jobs were skipped.
   - Root cause remains unconfirmed. This is an infrastructure startup failure, not a test failure.

2. **Local execution device offline**
   - Desktop Commander lists `MacBook-Air.local` as Offline, last seen 23 hours ago.
   - GitHub repository APIs allow source inspection and commits but do not execute npm/Node/Wrangler/Playwright commands.

3. **Four confirmed CI workflow contract defects on main await PR #79**
   - Missing commands: `test:cloudflare-native-auth`, `test:irni-geographic-rpc`, `typecheck:irni-geographic-rpc`, and `test:geo`.
   - PR #79 branch contains matching fixes; its static audit shows 0 missing commands across 16 workflows / 40 invocations.
   - PR #79 remains Draft/open/unmerged. No runtime validation has occurred.

## Not blockers

- Repository read/write access is available.
- PR #74 and PR #79 are open, Draft, and unmerged.
- NIPS test is correctly wired into `test:contracts` on PR #74's QA branch.
- Persistent QA records are available and updated on the QA branch.
