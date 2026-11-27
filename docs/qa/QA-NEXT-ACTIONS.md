# QA Next Actions

1. **Resolve hosted-runner allocation:** inspect GitHub account Actions usage/billing and included-minute/spending limits; inspect repository Settings → Actions → General for Actions enablement, allowed actions, and hosted-runner policy.
2. **Do not create another CI trigger solely to repeat the same pre-runner failure.** The five latest PR #74 workflows all had `runner_id=0` and `steps=[]`; root cause remains unconfirmed.
3. If billing and policy are clear, escalate the five run IDs (46004991418, 46004991653, 46004991515, 46004991666, 46004991463) to GitHub Support with job IDs and timestamps.
4. Once a runner is actually allocated, run `npm run test:contracts` first; capture the full output and exit code for the NIPS golden-reference contract suite.
5. Then inspect the primary quality-gates job's first failing step; run only that command for reproduction and classify code, test, dependency, environment, and infrastructure failures separately.
6. Continue with D1 triad and write-pause suites, then auth/security/typecheck/build and the browser E2E/accessibility suites. Use the existing scripts in `package.json`; do not add an overlapping test framework.
7. Keep all test data synthetic and isolated. Do not run production migrations, mutate production data, or deploy.
8. Update all six QA records with actual test counts, workflow evidence, and the latest inspected commit after each meaningful package.
9. Keep PR #74 open and Draft; do not merge without explicit approval.
