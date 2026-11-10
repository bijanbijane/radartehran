# CASPER-02 Server-Side HUB Integration — Canonical Engineering Handoff & Continuity State (`HANDOFF.md`)

**Agent Identity:** `CASPER-02` (`کَسپر`)  
**Target Project:** RADAR TEHRAN (`56114e1d-bffb-437b-a438-1563ac350b49`)  
**Upstream Coordination Service:** `https://casper-hub-api.bijanbijane-1.workers.dev`  
**Status:** `VERIFIED_ACTIVE` (`0` TypeScript errors, `0` architecture warnings across `323` scanned files)

---

## 1. Module Architecture & File Inventory (`< 280` Lines per File)

All files in `server/modules/casper-hub/` are monitored by `scripts/check-architecture.ts` (`npm run arch:check`) and strictly obey the `< 300`-line zero-warning ceiling and downward dependency rules:

| File | Responsibility |
| :--- | :--- |
| `server/modules/casper-hub/casperHubTypes.ts` | Canonical TypeScript interfaces for CASPER HUB v2 (`CasperHubWhoamiData`, `CasperHubBootstrapData`, `CasperHubChangesData`, `CasperHubNoteRecord`, `CasperHubNotePayload`), `CasperHubClientError`, `redactSensitiveTokenText`, `deriveDeterministicNoteIdempotencyKey` (SHA-256), and `assertCasper02Identity`. |
| `server/modules/casper-hub/casperHubClient.ts` | Side-effect-free environment resolution (`resolveEffectiveHubEnv`), strict `ALLOWED_CASPER_HUB_HOST` host-pinning (`resolveCasperHubBaseUrl`), `getCasperHubStatus`, `CasperHubClient` (`whoami`, `bootstrap`, `getChanges`, `createNote`), and `getCasperHubClient` factory. |
| `server/modules/casper-hub/casperHubRoutes.ts` | Admin-authenticated Express proxy routes (`/api/admin/casper-hub/{status,whoami,bootstrap,changes,notes}`) guarded by `verifyAdminApiAuthorization`, `checkRateLimit`, and `recordAbuseSignal`. |
| `server/modules/casper-hub/index.ts` | Clean barrel export of types, client, and Express route registration. |
| `server/modules/casper-hub/__tests__/casperHubClient.test.ts` | Unit & adversarial security test suite covering host-pinning, `redirect: 'error'`, `503` unconfigured secret handling, deterministic SHA-256 `Idempotency-Key` derivation, relational `note_scope` validation, `403 CASPER_AGENT_IDENTITY_MISMATCH` on `CASPER-01` or missing identity, and outbound/error token redaction. |

---

## 2. Critical Engineering Decisions & Root-Cause Remediations

1. **Decision `CASPER02-DEC-01` — Strict Host-Pinning & `redirect: 'error'` (Anti-Exfiltration Guard):**
   - **Problem:** Allowing arbitrary `https://` URLs in `CASPER_HUB_URL` or following HTTP `301`/`302`/`307` redirects could leak `Authorization: Bearer ${CASPER_HUB_TOKEN}` to a third-party host.
   - **Resolution:** `resolveCasperHubBaseUrl()` enforces `parsed.hostname.toLowerCase() === 'casper-hub-api.bijanbijane-1.workers.dev'`, rejects embedded credentials or non-HTTPS schemes, and `CasperHubClient.request()` sets `redirect: 'error'` and a `512 KB` response size ceiling (`MAX_HUB_RESPONSE_BYTES`).

2. **Decision `CASPER02-DEC-02` — Deterministic Content-Derived `Idempotency-Key` (SHA-256):**
   - **Problem:** Generating a random `crypto.randomUUID()` when `input.idempotency_key` is omitted caused retries of the same note after transient network drops to insert duplicate records into the CASPER HUB D1 database.
   - **Resolution:** `deriveDeterministicNoteIdempotencyKey()` computes a canonical SHA-256 digest (`casper02-note-<32_hex>`) over `(CASPER_AGENT_ID, note_scope, roadmap_id, task_id, note_type, importance, title, summary, detail_ref, sorted_tags)`.

3. **Decision `CASPER02-DEC-03` — Side-Effect-Free Environment Resolution & Outbound Secret Redaction:**
   - **Problem:** Mutating `process.env.CASPER_HUB_TOKEN` during `/proc/<pid>/environ` fallback broke unit test isolation when testing unconfigured environments.
   - **Resolution:** `resolveEffectiveHubEnv()` never mutates `process.env`; when an explicit `env` map is passed (e.g., in tests), it is used verbatim without reading `/proc`. All error messages and outbound note fields (`title`, `summary`, `detail_ref`) pass through `redactSensitiveTokenText(text, token)` before leaving the process.

4. **Decision `CASPER02-DEC-04` — Elimination of Symptom-Hiding `tsconfig.json` Exclusions & Canonical Domain Restoration:**
   - **Problem:** Seven paths (`server/modules/brokerage`, `market-intelligence/tests`, `property-due-diligence/tests`, `property-insurance/tests`, `real-estate-transactions/tests`, `tests/brokerage-module.test.ts`, `tests/dispute-resolution-module.test.ts`) had been added to `tsconfig.json` `"exclude"` to hide missing barrel exports and missing state-machine symbols.
   - **Resolution:** Restored full v1+v2 exports in `market-intelligence/index.ts`, `property-due-diligence/index.ts`, and `real-estate-transactions/index.ts`; implemented the complete domain state machine and conjunctive exclusion evaluator in `server/modules/property-insurance/coverage/policyAndClaimStateMachineEngine.ts` (`< 245` lines); and restored `"exclude": ["dist", "node_modules"]` in `tsconfig.json`.

5. **Decision `CASPER02-DEC-05` — Same-UID `/proc` Verification, Prototype-Pollution Stripping & Cross-Agent Prompt-Injection Shield:**
   - **Problem:** Scanning `/proc/<pid>/environ` without verifying `fs.statSync('/proc/' + pid).uid === process.getuid()` could inspect foreign-UID process metadata; parsing upstream JSON without a reviver could admit `__proto__` keys; and publishing uninspected note strings to the shared multi-agent `CASPER HUB` D1 database could allow cross-agent prompt injection when peer agents run `/v1/bootstrap`.
   - **Resolution:** Added same-UID process ownership check in `resolveEffectiveHubEnv()`, stripped `__proto__ | constructor | prototype` in `JSON.parse`, and enforced `detectPromptInjection` across `title`, `summary`, and `detail_ref` in `createNote()` (`422 CASPER_HUB_INVALID_INPUT`).

6. **Decision `CASPER02-DEC-06` — Strict Top-Down Dependency Flow & Authoritative Route Catalog Parity:**
   - **Problem:** `src/utils/serverAiAndCommerceRoutes.ts` imported `registerCasperHubRoutes` upward from `../../server/modules/casper-hub`, and the 5 `/api/admin/casper-hub/*` routes were missing from `REGISTERED_API_ROUTES` in `src/utils/expressRouteCatalog.ts`.
   - **Resolution:** Mounted `registerCasperHubRoutes(app, { checkRateLimit, getClientIp })` directly in `server.ts` and registered all 5 `/api/admin/casper-hub/{status,whoami,bootstrap,changes,notes}` routes in `src/utils/expressRouteCatalog.ts` (`API_ENDPOINT_CONTRACTS` & `RADAR_API_ROUTE_INVENTORY`).

7. **Decision `CASPER02-DEC-07` — Pre-Flight SHA-256 Token-Digest Identity Verification & 2000-Character Summary Fidelity:**
   - **Problem:** (1) Upstream `GET /v1/changes` omits caller `agent_id` in its top-level payload, and `POST /v1/notes` mutates D1 before returning `created_by_agent_id`; relying solely on post-response identity checks allowed foreign agent tokens to read `/v1/changes` or mutate D1 before rejection. (2) `redactSensitiveTokenText()` truncated all strings to `500` characters, cutting Persian technical summaries mid-word in live `/v1/bootstrap` records (`note_id: 5b909ab0-33a8-44c0-8c06-8702e637bfc8`).
   - **Resolution:** Added `verifiedCasper02TokenDigests` (SHA-256) and `ensureTokenIdentityVerified()` in `casperHubClient.ts` so `getChanges()` and `createNote()` verify `CASPER-02` token ownership via `/v1/whoami` before executing, enforced `requireExplicitIdentity = true` on `POST /v1/notes`, parameterized `redactSensitiveTokenText(text, extraToken, maxLength)` (`2000` chars for note summaries), and registered `/proc`-resolved tokens in `registerRuntimeHubTokenForRedaction`.

8. **Decision `CASPER02-DEC-08` — Tags/Detail-Ref Prompt-Injection Shield, Events/Changes Normalization & Deep Secret Scrubbing:**
   - **Problem:** (1) While `title` and `summary` were scanned for prompt injection, `tags` arrays and `detail_ref` were not inspected with `detectPromptInjection`, creating an uninspected vector into peer agents during `/v1/bootstrap`. (2) `GET /v1/changes` responses could contain either `events` or `changes` depending on D1 query format. (3) Backup serializer `scrubSecretsFromBackupObject` and runtime posture audit `auditRuntimeEnvironmentAndSecurityPosture` did not explicitly catch `CASPER_HUB_TOKEN` or `VITE_CASPER_HUB_TOKEN`.
   - **Resolution:** Added prompt-injection scanning to `tags` and `detail_ref`, sanitized tag tokens before length bounding, normalized `events` and `changes` bidirectionally in `getChanges()`, added `CASPER_HUB_TOKEN` and `HUB_TOKEN` to `FORBIDDEN_BACKUP_SECRET_KEYS`, and added `(?:CASPER_)?HUB_TOKEN` pattern check to `auditRuntimeEnvironmentAndSecurityPosture`.

9. **Decision `CASPER02-DEC-09` — Inflight WhoAmI Single-Flight Mutex & Forensics Token Scrubbing Parity:**
   - **Problem:** (1) Concurrent asynchronous calls to `getChanges()` or `createNote()` when the token digest was unverified triggered duplicate parallel `/v1/whoami` requests, wasting network round-trips and introducing race conditions. (2) Forensics ledger `redactSensitiveForensicText()` in `src/utils/serverForensicsAndIncidentResponse.ts` redacted `sk-` and `ghp_` tokens but omitted raw `chub_` tokens.
   - **Resolution:** Added `inflightWhoAmI` single-flight promise coalesce pattern in `CasperHubClient.ensureTokenIdentityVerified()`, added `chub_[0-9A-Za-z_-]{16,}` to `redactSensitiveForensicText()`, maintained strict sub-300 line limits across all modules, and verified live checkpoint note `e87a85a7-5673-44b6-bb4d-8424d2c60089` in CASPER HUB.

10. **Decision `CASPER02-DEC-10` — Scientific Epistemic Rigor, Non-Compensatory Valuation Proof & Autonomous HUB Alignment:**
    - **Problem:** Superficial speed can compromise epistemic rigor in real-estate valuations (e.g. compensatory scoring where high quality masks fatal liquidity flaws like 4th floor walk-up or missing parking in large units) or lead to fragmented multi-agent synchronization.
    - **Resolution:** Validated that Hedonic Valuation (`src/data/hedonicPricingEngine.ts`) applies non-compensatory MCDA veto alerts when non-negotiable consumer requirements fail, verified single-source valuation authority, and synchronized live checkpoint note `9aefdc01-4573-4245-827e-9507fc92f361` with CASPER HUB.

---

## 3. Session Resumption & Verification Checklist

When resuming work in a new session or after context compaction:

1. **Read Persistent Memory First:**
   - `/docs/engineering/RMEP-001/PERSISTENT-ENGINEERING-MEMORY.md` (see Revision `4.49`)
   - `/docs/engineering/RMEP-001/EXECUTION-STATE.json` (`CHK-192-FINAL`)
   - `/server/modules/casper-hub/HANDOFF.md` (this file)
2. **Verify Live CASPER HUB State (`CASPER-02`):**
   ```bash
   npx tsx -e 'import { getCasperHubClient } from "./server/modules/casper-hub"; (async () => { const c = getCasperHubClient(); console.log(await c.whoami()); console.log(await c.bootstrap()); })();'
   ```
3. **Run Mandatory Verification Gates:**
   ```bash
   npm run lint
   npm run arch:check
   npx tsx --test server/modules/casper-hub/__tests__/casperHubClient.test.ts server/modules/property-insurance/__tests__/propertyInsurance.test.ts server/modules/property-insurance/tests/propertyInsurance.test.ts tests/architecture-guardrails.test.ts
   npm test
   npm run test:contracts
   npm run test:mutation
   npm run test:e2e
   npm run test:smoke
   npx tsx tests/stress-50-cycles.test.ts
   npx tsx tests/object-storage-security.test.ts
   npm run build
   ```
