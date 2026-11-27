# Radar Tehran QA Blockers

## Active

1. **No executable runner currently available**
   - The linked Desktop Commander MacBook device previously reported Offline.
   - No local checkout, npm install, or test command has been executed in this session.

2. **GitHub Actions diagnostics unavailable**
   - Latest PR-associated runs report failures, but job details returned null step arrays.
   - Job-log download endpoints returned BlobNotFound.
   - This prevents attribution of the observed failures to runner provisioning, workflow setup, or actual test execution. The root cause remains unconfirmed.
   - Do not label these runs as test assertion failures or passes.

3. **Newly repaired workflow commands require execution**
   - QA-003 and QA-004 are statically corrected and read back from GitHub.
   - Their runtime outcomes remain unknown until the affected workflows run with accessible logs.

No production credentials, production data, deployments, or migrations were touched.
