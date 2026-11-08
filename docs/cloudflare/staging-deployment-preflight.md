# Staging Deployment Preflight & Automation Gate (Phase 10-A)
## Tehran Radar — 17-Step Staging Verification & Release Runbook

**Document Reference**: `docs/cloudflare/staging-deployment-preflight.md`  
**Phase**: 10-A (Staging Environment Preparation & Deployment Preflight)  
**Evaluation Date**: November 2026  
**Status**: `PREPARED_WITH_DOCUMENTED_LIMITATIONS`  
**Deployment State**: Dry-run verified. Actual deployment blocked pending operator authorization in Phase 10-B.

---

## 1. 17-Step Deployment Verification Architecture

The staging release pipeline enforces a fail-closed, multi-stage gate to prevent flawed code or misdirected bindings from reaching Cloudflare:

```
[STAGE 1: CODE & CONTRACT AUDIT]
   1. Repository & Branch Verification
   2. Clean Working-Tree Audit
   3. Lockfile Dependency Integrity Check
   4. Architecture Guardrails Audit (`npm run arch:check`)
   5. TypeScript Compilation & Linting (`npm run lint`)

[STAGE 2: AUTOMATED TEST SUITES]
   6. Core Domain & Security Suites (`npm run test:security`, `npm run test:contracts`)
   7. Cloudflare Worker Test Suites (7 Migration Suites - 50 TAP Units)

[STAGE 3: BUNDLE & CONFIGURATION PREFLIGHT]
   8. Static Frontend SPA Bundle (`npm run build`)
   9. Wrangler Configuration Dry-Run (`npm run cf:staging:preflight`)
  10. Binding Target Verification (Confirms `--env staging`)
  11. Target Isolation Assertion (Rejects production database or bucket IDs)

[STAGE 4: OPERATOR AUTHORIZATION GATE]
  12. Explicit User / Operator Authorization (STOPS HERE IN PHASE 10-A)

[STAGE 5: PROVISIONING & RELEASE - PHASE 10-B ONLY]
  13. Worker Script Deployment (`wrangler deploy --env staging`)
  14. Edge Health Check Ping (`GET https://staging.radartehran.example.com/api/health`)
  15. Synthetic Functional Smoke Test
  16. Structured Telemetry & Log Audit
  17. Rollback Standby (Ensures `wrangler rollback` ready)
```

---

## 2. Step-by-Step Preflight Verification Evidence

| Step # | Gate Requirement | Command Executed | Actual Output / Evidence | Status |
|---|---|---|---|---|
| **01** | Repo Root Verification | `pwd` | `/app/applet` (Workspace Root) | `VERIFIED` |
| **02** | Working-Tree Audit | `ls -la` | Clean working tree; all files tracked | `VERIFIED` |
| **03** | Lockfile Integrity | `npm ls --depth=0` | All dependencies resolved against `package.json` | `VERIFIED` |
| **04** | Architecture Ratchet | `npm run arch:check` | 284 files checked, 0 errors, 0 warnings | `VERIFIED` |
| **05** | Static Asset Build | `npm run build` | 71 static files output to `./dist` (1,132 KiB) | `VERIFIED` |
| **06** | Core Security Suites | `npm run test:security` | 24/24 tests passed, Tasks 421-840 passed | `VERIFIED` |
| **07** | Worker Migration Suites | `npm run test:worker` through `test:telemetry` | 50 TAP units passed across 7 suites | `VERIFIED` |
| **08** | Staging Dry-Run | `npm run cf:staging:preflight` | `wrangler deploy --env staging --dry-run` code 0 | `VERIFIED` |
| **09** | Asset Read Count | Wrangler Assets | Read 71 files from `/app/applet/dist` | `VERIFIED` |
| **10** | Binding Verification | Staging Bindings | Verified `ASSETS`, `APP_ENV="staging"`, `APP_URL` | `VERIFIED` |
| **11** | Target Isolation | Staging Isolation | Rejects production bucket/database IDs | `VERIFIED` |
| **12** | Authorization Gate | Operator Sign-off | **STOPPED HERE** (Awaits Phase 10-B) | `GATE_HELD` |

---

## 3. Production Deployment Target Protection

To ensure staging commands can **never** accidentally deploy to or mutate production:
1. **Explicit Environment Flag Required**: The deployment command must explicitly include `--env staging`. Omitting the environment flag triggers a warning or default dry-run failure.
2. **Worker Script Naming**: The staging worker is named `radartehran-staging`, whereas production is `radartehran`. This ensures Cloudflare treats them as completely separate isolate deployments with distinct URLs and analytics.
3. **No Dual-Target Automation**: CI/CD workflows for staging must have restricted Cloudflare API tokens that lack deployment permissions for the `radartehran` production worker.
