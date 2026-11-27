# Radar Tehran QA Blockers

## Active

1. **Local runner unavailable**
   - The authorized Desktop Commander MacBook device reports Offline.
   - No local npm install, test, typecheck, build, or Wrangler dry-run was executed.

2. **GitHub Actions diagnostics unavailable**
   - Recent PR workflows report failure, but job payloads expose null step arrays.
   - Job log downloads returned `404 BlobNotFound`; diagnostic artifacts were empty.
   - The exact cause remains unconfirmed. Do not classify the failures as test assertion failures or infrastructure failures without job-level evidence.

3. **CI repairs remain unverified**
   - QA-001 through QA-004 have static source corrections.
   - Their execution status remains unknown until actual runner output is available.

No production credentials, production data, deployment, migration, secret rotation, or destructive operation was touched.
