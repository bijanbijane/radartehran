# QA Blockers

## Active

1. **Local execution unavailable**
   - The connected MacBook device is offline.
   - GitHub repository read/write APIs do not provide shell execution.
   - Consequence: no local test command has been run in this session.
   - Workaround: use a draft pull request to trigger the repository's configured GitHub Actions workflows and inspect their actual results.

## Not blockers

- GitHub repository access is available.
- A dedicated QA branch has been created.
- File inspection and isolated branch commits are available.
