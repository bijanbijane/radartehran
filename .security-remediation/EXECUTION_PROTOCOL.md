# AUTONOMOUS SECURITY REMEDIATION — PERSISTENT EXECUTION PROTOCOL (`EXECUTION_PROTOCOL.md`)

## 1. Mission & Security-Only Scope
This document governs the persistent, multi-turn autonomous security assessment, remediation, and verification lifecycle for **Radar Maskan (`رادار مسکن ایران`)**.

- **Security-Only Engineering Scope**: All engineering actions under this protocol are restricted to defensive application security, access control hardening, cryptographic verification, input/output sanitization, abuse/rate-limit enforcement, storage isolation, dependency/configuration hardening, and automated security regression testing.
- **No Unrelated Product Expansion**: Do not introduce unrelated UI features, speculative architectural rewrites, or cosmetic refactors disguised as security fixes.
- **Preservation of Repository Governance (`AGENTS.md` & `RMEP-001`)**:
  - Maintain strict compliance with `/ARCHITECTURE.md`, `/architecture-baseline.json`, and `/docs/engineering/RMEP-001/PERSISTENT-ENGINEERING-MEMORY.md`.
  - All 242 tracked source files (`server.ts`, `src/App.tsx`, `src/main.tsx`, `src/firebase.ts`, `src/components/*`, `src/data/*`, `src/utils/*`, `src/types/*`) must remain `<= 290` lines (`src/App.tsx <= 270` lines) with zero upward dependency violations.
  - Keep `docs/engineering/RMEP-001/MASTER-PROMPT.md` untouched (SHA-256 `4be39b67c381536d5c363b9fa5c026d61dd00fae5964cedfd5df168d3f6abc63`).

---

## 2. Evidence & Classification Requirements
Every security domain review, finding, remediation, and verification entry recorded in `.security-remediation/STATE.json` must be backed by direct repository evidence:

1. **Exact Code-Path Evidence**:
   - File path(s), function/handler/rule identifiers, and line ranges.
   - Entry points (HTTP route, Firestore rule match block, client URL/storage sink, or background worker).
   - Trust boundaries crossed and attacker prerequisites (unauthenticated network caller, authenticated non-owner user, delegated admin, or upstream third-party response).
2. **Permitted Finding Classifications**:
   - `CONFIRMED_VULNERABILITY`: Directly verifiable weakness in repository code or rules with a concrete exploit/bypass scenario.
   - `MISSING_SECURITY_CONTROL`: Absent defense-in-depth or boundary control required by the architecture.
   - `CONFIGURATION_WEAKNESS`: Insecure default, permissive fallback, or configuration validation gap.
   - `POTENTIAL_RISK`: Architectural or operational risk requiring defense-in-depth hardening or external runtime enforcement.
   - `NOT_APPLICABLE`: Domain capability does not exist in this repository (must cite architectural proof).
   - `BLOCKED`: Remediation or live enforcement requires external credentials, cloud console access, or production deployment authorization.
3. **Permitted Severity Levels**:
   - `CRITICAL`, `HIGH`, `MEDIUM`, `LOW`, `INFORMATIONAL`.
4. **Zero Fabrication Rule**:
   - Never invent vulnerabilities, test runs, Git commit hashes, or external scan outputs.
   - If the workspace container does not expose a `.git` metadata directory, record `git_metadata_available: false` and use deterministic SHA-256 file/state digests instead of fabricated Git commit hashes.

---

## 3. Safety Boundaries & Prohibited Actions
1. **Zero Secret or PII Persistence**:
   - Never write raw API keys (`GEMINI_API_KEY`, `TELEGRAM_BOT_TOKEN`, `ADMIN_API_SECRET`, `OBJECT_STORAGE_SECRET_KEY`, `BACKUP_ENCRYPTION_KEY`, `X402_SIGNING_SECRET`), JWTs, private keys, or buyer PII (`buyerLeads` phone numbers) into `.security-remediation/STATE.json`, code comments, test fixtures, or documentation.
2. **Prohibited Unapproved External / Destructive Operations**:
   - Do not independently deploy to live production (`deploy_firebase` / Cloud Run production rollout), rotate live production secrets, revoke active production credentials, or delete production database collections without explicit operator authorization.
   - For any external/production operation: implement all safe local code and rule changes first, verify them via local static/unit/integration test suites, and record the external rollout step in `blockers` with status `BLOCKED`.
3. **Minimal, Reversible, Contract-Preserving Changes**:
   - Preserve existing public API contracts (`API_ENDPOINT_CONTRACTS` in `src/utils/serverConfigValidator.ts` and `RADAR_API_ROUTE_INVENTORY` in `src/utils/apiContractsAndSerializationEngine.ts`), Firestore collection schemas (`firebase-blueprint.json`), and legitimate user/admin workflows.

---

## 4. Mandatory 7-Stage Execution Lifecycle
On every invocation (initial or continuation), execute the following stages in order:

- **Stage 1 — State Load & Reconciliation**:
  - Read `.security-remediation/EXECUTION_PROTOCOL.md` and `.security-remediation/STATE.json`.
  - Verify current file states, line counts, and test status against recorded entries in `STATE.json`.
- **Stage 2 — Architecture & Attack Surface Verification**:
  - Reconcile entry points across `server.ts`, `src/utils/server*.ts`, `firestore.rules`, `firebase-blueprint.json`, `index.html`, and `src/components/*`.
- **Stage 3 — 27-Domain Security Assessment**:
  - Maintain explicit applicability, review status (`NOT_STARTED`, `IN_PROGRESS`, `REVIEWED`, `REMEDIATED`, `VERIFIED`, `BLOCKED`, `NOT_APPLICABLE`), and repository evidence across all 27 mandatory security domains (`DOMAIN 01` through `DOMAIN 27`).
- **Stage 4 — Finding Validation & Prioritization**:
  - Prioritize exploitable auth/authz, financial/payment bypass, file upload/memory exhaustion, data exposure, and injection weaknesses (`CRITICAL` -> `HIGH` -> `MEDIUM` -> `LOW`).
- **Stage 5 — Direct Code Remediation**:
  - Implement concrete, minimal, root-cause fixes directly in project source files.
- **Stage 6 — Automated Security Test & Guardrail Verification**:
  - Add or update automated security tests asserting both:
    1. Malicious, unauthenticated, replayed, or out-of-bounds inputs are rejected with deterministic HTTP/error codes.
    2. Legitimate authorized operations continue to succeed.
  - Execute the mandatory repository verification suite (`npm run lint`, `npm run arch:check`, `npm test`, `npx tsx tests/stress-50-cycles.test.ts`, `npx tsx tests/object-storage-upload-auth.test.ts`, `npx tsx tests/object-storage-security.test.ts`, `npx tsx tests/object-storage-range.test.ts`, `npm run build`).
- **Stage 7 — Persistent State Update**:
  - Reconcile and write `.security-remediation/STATE.json` before concluding the turn.

---

## 5. Continuation Protocol (`ادامه بده` / `continue` / `resume`)
When the user sends a continuation prompt (`ادامه بده`, `continue`, `resume`, `ادامه`, `بعدی`, `next`):
1. Immediately read `.security-remediation/EXECUTION_PROTOCOL.md` and `.security-remediation/STATE.json`.
2. Reconcile the live repository state with `STATE.json` without repeating already-verified work.
3. Select the highest-priority item in `remaining_actions` or any unverified finding/domain.
4. Implement the code fix and automated regression test, run the verification suite, and update `.security-remediation/STATE.json`.
5. If all local code remediations and automated verifications are complete, re-verify the full test suite, reconcile `STATE.json`, and report the verified state and any remaining external blockers.

---

## 6. Completion Criteria & Honest Status Reporting
- Never claim the system is "100% secure" or "invulnerable".
- Use only the permitted `completion_status` values in `.security-remediation/STATE.json`:
  - `REMEDIATION_INCOMPLETE`: Actionable local code findings, unreviewed domains, or failing/unrun security tests remain.
  - `REMEDIATION_COMPLETE_WITH_RECORDED_RESIDUAL_RISKS`: All 27 domains have been reviewed with concrete repository evidence, all locally actionable findings have been remediated in code and verified by automated tests, and any external/production-only actions or architectural residual risks are explicitly documented in `blockers` and `completion_evidence`.
