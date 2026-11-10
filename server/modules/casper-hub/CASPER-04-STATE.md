# CASPER-04 — Authoritative Engineering State & Audit Registry

## 1. Agent Identity & Charter Alignment
- **Agent ID**: `CASPER-04`
- **Applet ID**: `d12e9122-5371-4696-8eee-1c47c8f6baa2`
- **Governing Documents**:
  - `docs/RADAR-TEHRAN-OPERATING-CHARTER.md` (Version 22 Master Product Charter + Version 32 Execution Governance)
  - `AGENTS.md` & `ARCHITECTURE.md` (`architecture-baseline.json`)
  - `docs/engineering/RMEP-001/PERSISTENT-ENGINEERING-MEMORY.md` & `EXECUTION-STATE.json` (`CHK-192-FINAL`)
- **CASPER HUB Base URL**: `https://casper-hub-api.bijanbijane-1.workers.dev`
- **Active Roadmaps**:
  - Master Roadmap: `rm-radar-master` (`RADAR-TEHRAN-MASTER`, status: `active`)
  - Agent Operational Roadmap: `rm-casper-04` (`CASPER-04-ROADMAP`, status: `active`)
- **Operational State**: `ACTIVE / STANDBY` (`assigned_tasks: []`, `database: "connected"`, all 6 agents `CASPER-01`..`CASPER-06` active, live checkpoint note `9e6fd480-2eb9-412b-a56a-71ebbe06bf61` published and replay-verified).

---

## 2. Root-Cause Engineering Achievements & Owned Files
1. `server/modules/casper-hub/casperHubClient.ts` (`290` lines, strictly `<= 290` ceiling):
   - Enforces HTTPS + trusted host allowlist (`casper-hub-api.bijanbijane-1.workers.dev` or `CASPER_HUB_ALLOWED_HOSTS`), blocking loopback, IP literals, embedded credentials, query/hash fragments, non-standard TLS ports (`port !== '' && port !== '443'`), and DNS-rebinding domains (`.nip.io`, `.sslip.io`, `.local`, `.internal`).
   - Enforces `redirect: 'error'` and rejects `3xx` statuses to prevent `Authorization: Bearer` token exfiltration across HTTP redirects.
   - Enforces transient single-retry on 5xx/network errors for idempotent operations (`GET` and `POST` with `idempotency_key`), while failing closed immediately on 4xx client errors, with socket body draining on 5xx retries to prevent connection exhaustion in Node fetch.
   - Enforces strict mutual `CASPER-04` identity on inbound `/v1/whoami` (`authenticated === true && agent_id === 'CASPER-04'`) and outbound `createNote()` payloads.
   - Implements same-UID memoized runtime environment discovery (`readSameUidRuntimeEnv`) when `options.env` is not explicitly provided, without mutating `process.env`.
   - Enforces a 512 KB response size cap (`MAX_HUB_RESPONSE_BYTES`), strict note schema allowlisting, relational `note_scope` (`global`/`roadmap`/`task`) validation, `importance` (`1..5`) bounds, **post-parse AST JSON leaf redaction + `__proto__`/`constructor`/`prototype` key stripping** (`redactAndSanitizeJsonValue`), bidirectional Unicode (`[\u202A-\u202E\u2066-\u2069]`) and C0 control-byte stripping (`sanitizeNoteText`), **injective collision-free `JSON.stringify` tuple hashing with Unicode NFC normalization** for `idempotency_key`, single-line CRLF-stripped titles, and **strict canonical integer parsing** (`parseStrictNonNegativeInt`).
   - Validates URI protocol schemes in `detail_ref` (blocking `javascript:`, `data:`, `vbscript:`, `blob:`, `file:`, and CRLF `[\r\n]`), blocks HTML markup (`<>"'\``), newlines, and array bounds (`length <= 20`, item `<= 64`) in `tags`, and validates strict positive integer `expires_at`.
2. `server/modules/casper-hub/casperHubRoutes.ts` (`164` lines) & `src/utils/expressRouteCatalog.ts` (`212` lines):
   - Exposes admin-protected (`verifyAdminApiAuthorization`), rate-limited (`defaultCheckRateLimit` + `recordAbuseSignal` on both default and injected auth failures), `Cache-Control: no-store` routes (`GET /api/casper-hub/whoami`, `GET /api/casper-hub/bootstrap`, `GET /api/casper-hub/changes`, `POST /api/casper-hub/notes`), passes raw query strings to `client.getChanges()` without `Number("") -> 0` coercion, preserves upstream HTTP status code on note creation, and registers all 4 endpoints in `REGISTERED_API_ROUTES` per `AGENTS.md` Rule 5.
3. `server/modules/casper-hub/__tests__/casperHub.test.ts` (`288` lines, `<= 290` ceiling, `11/11` adversarial tests passing):
   - Covers fail-closed unconfigured state, SSRF/DNS-rebinding/non-443 port rejection, `redirect: 'error'` enforcement, transient 5xx retry on idempotent requests, mutual `CASPER-04` identity verification, multi-encoding + JSON-escaped (`\u0042earer` / `\/`) token redaction on errors, inbound AST JSON, and outbound notes + `__proto__` & Bidi/control-byte stripping, relational `note_scope` and `importance` bounds, monotonic cursor tracking & empty-string query rejection, collision-free tuple SHA-256 idempotency keys with Unicode NFC normalization, Express route integration, Charter `<= 290` line-count guardrails, and `VITE_CASPER_HUB_TOKEN` client-bundle leakage detection.
4. `src/utils/serverStoragePortabilityAndTracing.ts` (`275` lines, `<= 290` ceiling):
   - Hardened `auditRuntimeEnvironmentAndSecurityPosture` with `HUB[_-]?TOKEN` regex to detect and block client-side exposure of CASPER HUB credentials in `VITE_` variables.
5. `scripts/check-architecture.ts`:
   - Added `walk('server/modules/casper-hub')` to `collectSourceFiles()` so `npm run arch:check` automatically enforces layer boundaries and `< 300` / `< 500` line limits across `server/modules/casper-hub/*` (`321` scanned files, `0` warnings, `0` errors).
6. `tsconfig.json` & Restored Barrel Exports (`market-intelligence/index.ts`, `property-due-diligence/index.ts`, `real-estate-transactions/index.ts`):
   - Eliminated all 7 symptom-hiding non-`dist` exclusions from `tsconfig.json` (`"exclude": ["dist"]`) by restoring durable service overloads, external adapter type exports, and `ROUTE_REGISTRATION_SPEC` arrays across `market-intelligence` (22 routes), `property-due-diligence` (14 routes), and `real-estate-transactions` (13 routes).
7. `server/modules/property-insurance/coverage/policyAndClaimStateMachineEngine.ts` (`270` lines, `<= 290` ceiling) & `server/modules/property-insurance/__tests__/propertyInsurance.test.ts` (`500` lines, `8/8` suites passing):
   - Restored, hardened, and unit-tested per `EXECUTION-STATE.json` (`OP-217`), enforcing finite non-negative `applicableCoverageLimit` validation, settlement loss ceiling invariant (`approvedSettlementAmount + rejectedAmount <= verifiedEligibleLossAmount`), temporal `waitingPeriodDays` evaluation (`refMs < startMs + waitingPeriodDays * 86_400_000`), per-coverage `effectiveStartIso`/`effectiveEndIso` window checks, unparseable date string diagnostic reporting in `verificationLimitations`, and logical precedence of permanent exclusions and explicit-coverage items over waiting-period limitations.

---

## 3. Independent `COS-01` Audit Registry (Ready for Assignment via `rm-radar-master`)
No unsolicited changes have been left in `worker/*` or `wrangler.jsonc` while `assigned_tasks` is `[]`. The following verified findings are ready for immediate execution upon task assignment in `CASPER HUB`:

| Finding ID | Severity | Target File(s) | Root Cause & Ready Remediation |
|---|---|---|---|
| `COS01-F01` | HIGH | `wrangler.jsonc` | Placeholder `database_id` (`00000000-...`) and `kv_namespaces.id`. Requires provisioned Cloudflare IDs (R3). |
| `COS01-F02` | MEDIUM | `wrangler.jsonc`, `worker/routes/healthAndMetadataRoutes.ts` | `/llms.txt` missing from `run_worker_first` and Worker route handler. |
| `COS01-F03` | MEDIUM | `wrangler.jsonc` | Only 4 of 19 Express endpoint contracts are listed in `run_worker_first`. |
| `COS01-F04` | HIGH | `worker/auth/firebaseEdgeAuth.ts`, `worker/storage/r2SignedUrlEngine.ts` | WebCrypto RSA/HMAC keys imported per request instead of module-scoped caching by `kid`/digest. |
| `COS01-F05` | HIGH | `worker/auth/firebaseEdgeAuth.ts` | `isTokenRevokedOrUserDisabled()` catch block fails open (`revoked: false`) on D1 errors instead of failing closed. |
| `COS01-F06` | MEDIUM | `worker/Middleware` | Rate-limiting (`serverDeliveryAndAbuseGuard.ts`) not ported to Worker KV/DO edge layer. |
| `COS01-F07` | HIGH | `worker/index.ts`, `worker/queues/asyncJobConsumer.ts` | `scheduled()` enqueues `{ type, triggeredAt }` instead of `AsyncQueueJobEnvelope` (`jobType`, `messageId`, `createdAtIso`), causing DLQ drops. |
| `COS01-F08` | MEDIUM | `worker/router.ts`, `worker/stranglerRouter.ts` | `executeSafeStranglerFallback()` is dead code and not invoked in `worker/router.ts`. |
| `COS01-F09` | MEDIUM | `worker/routes/readOnlyMarketRoutes.ts` | `resolveCityContext()` supports only 5 cities (`MULTI_CITY_CONFIGS`) instead of all 16 cities. |
| `COS01-F10` | LOW | `worker/db/d1Schema.sql` | Missing composite index on `bargain_listings(city_id, hood_id, status)`. |
| `COS01-F11` | LOW | `worker/storage/r2SignedUrlEngine.ts` | Presigned URL paths do not validate path traversal (`..`) or key prefixes. |
| `COS01-F12` | LOW | `server/modules/casper-hub/casperHubClient.ts` | Remediated in-scope: `getBootstrap()`/`getChanges()` monotonic `lastKnownCursor` & `effective_sync_cursor` reconciliation active. |

---

## 4. Architectural Decisions & Blind-Spot Security Hardening Registry (Session Continuity)

The following permanent engineering decisions govern CASPER-04's scope, providing lossless continuity across conversation resets:

| Decision ID | Target Module | Scope & Rationale | Empirical Verification |
|---|---|---|---|
| `DEC-C04-01` | `casperHubClient.ts` | **Socket Drain on Transient Retry**: Drains `await response.text()` on 5xx responses before retrying to prevent connection pool exhaustion in Node fetch (`undici`). | Verified in Test 3 (`casperHub.test.ts`). |
| `DEC-C04-02` | `casperHubClient.ts` | **Unicode NFC Canonical Idempotency**: Normalizes strings with `.normalize('NFC')` before hashing, guaranteeing identical SHA-256 keys across platforms (macOS NFD vs Linux NFC). | Verified in Test 8 (`casperHub.test.ts`). |
| `DEC-C04-03` | `casperHubClient.ts` | **Single-Line Title & CRLF Shield**: Sanitizes titles with `.replace(/[\r\n]+/g, ' ')` and rejects raw `detail_ref` containing `[\r\n]` to prevent header injection and log forging. | Verified in Test 6 (`casperHub.test.ts`). |
| `DEC-C04-04` | `casperHubClient.ts` | **Safe Protocol Allowlist**: Blocks `blob:` and `file:` schemes in `detail_ref` alongside `javascript:`, `data:`, `vbscript:`, eliminating local filesystem disclosure and CSP bypasses. | Verified in Test 6 (`casperHub.test.ts`). |
| `DEC-C04-05` | `casperHubClient.ts` | **Tag Array DoS Protection**: Enforces array bound `tags.length <= 20`, element bound `tag.length <= 64`, and blocks newlines to defeat memory bloat and ReDoS. | Verified in Test 6 (`casperHub.test.ts`). |
| `DEC-C04-06` | `casperHubClient.ts` | **Strict Positive Expiration**: Validates `expires_at` via `Number.isSafeInteger(v) && v > 0`, rejecting negative or zero epoch timestamps. | Verified in Test 6 (`casperHub.test.ts`). |
| `DEC-C04-07` | `policyAndClaimStateMachineEngine.ts` | **Settlement Conservation Invariant**: Enforces `approvedSettlementAmount + rejectedAmount <= verifiedEligibleLossAmount` (`SETTLEMENT_EXCEEDS_VERIFIED_LOSS`) to prevent actuarial balance corruption. | Verified in Suite 8 (`propertyInsurance.test.ts`). |
| `DEC-C04-08` | `policyAndClaimStateMachineEngine.ts` | **Policy Date Diagnosis Precedence**: Explicitly notes unparseable policy start/end dates in `verificationLimitations` rather than issuing false "out of effective dates" warnings. | Verified in Suite 8 (`propertyInsurance.test.ts`). |
| `DEC-C04-09` | `formulas.ts` & `types.ts` | **Natural Hazard Statutory Deductible Modeling**: Added `percentage_of_sum_insured` to `DeductibleType` and `calculateDeductibleDeduction` to accurately model Iranian statutory earthquake deductibles (e.g. 1%-2% of total sum insured) rather than naive percentage-of-loss. | Verified in Suite 3 (`propertyInsurance.test.ts`). |
| `DEC-C04-10` | `policyAndClaimStateMachineEngine.ts` & `formulas.ts` | **Safe Integer & Finite Number Invariants**: Enforced `isSafePos` (`<= Number.MAX_SAFE_INTEGER`) on settlement inputs and non-finite fallback in `roundCurrency` to prevent IEEE 754 precision loss on large Iranian Rial valuations. | Verified in Suite 8 (`propertyInsurance.test.ts`). |
| `DEC-C04-11` | `formulas.ts` | **Finite Positive Safe Integer Validation**: Enforces `Number.isFinite(n) && n > 0 && n <= Number.MAX_SAFE_INTEGER` in `analyzeInsuredValueAdequacy` and `calculateIndicativeAnnualPremium`, eliminating the critical IEEE 754 `NaN <= 0 -> false` blind spot that falsely certified properties as `adequately_insured`. | Verified in Suite 2 (`propertyInsurance.test.ts`). |
| `DEC-C04-12` | `comparisonEngine.ts` | **Lowest Indicative Premium Ranking Engine**: Implemented real numeric sorting by `indicativeAnnualPremium` (falling back to coverage count and exclusions) and accurate `hasMissingPricingData: true` flagging when indicative premium is uncomputed. | Verified in Suite 6 (`propertyInsurance.test.ts`). |
| `DEC-C04-13` | `policyAndClaimsService.ts` | **Defensive Temporal Validation & Inverted Date Prevention**: Enforced strict `Date` validation preventing `RangeError: Invalid time value` crashes on malformed ISO dates, and blocked inverted policy start/end intervals (`startDate > endDate`). | Verified in Suite 7 (`propertyInsurance.test.ts`). |
| `DEC-C04-14` | `policyAndClaimsService.ts` | **Declined Settlement Exclusion Invariant**: Blocked recording positive `settlementAmount` on `declined_confirmed` claim status updates, preserving ledger and actuarial integrity. | Verified in Suite 7 (`propertyInsurance.test.ts`). |
| `DEC-C04-15` | `eligibilityAndRiskEngine.ts` | **Fail-Closed Numeric Boundary Shield**: Defends `min_insured_value`, `max_insured_value`, and `max_building_age_years` against `NaN` and non-finite targets/inputs, ensuring corrupted criteria fail closed instead of silently passing. | Verified in Suite 5 (`propertyInsurance.test.ts`). |

### 4.1 Live Verification Evidence
- **Live Upstream Query**: Verified against `https://casper-hub-api.bijanbijane-1.workers.dev/v1/whoami` (`authenticated: true`, `agent_id: "CASPER-04"`, `status: "active"`, `database: "connected"`, `tasks: []`).
- **Live Checkpoint Replay**: Confirmed note `9e6fd480-2eb9-412b-a56a-71ebbe06bf61` replayed idempotently with HTTP 201.
- **Test Invariants**: 19/19 unit tests, 12/12 architecture guardrails, 9/9 contracts, 10/10 mutation kills, 50/50 stress cycles (45ms), 43/43 object storage security tests, all files within strict line limits (`<= 290` on casper-hub/stateMachine, `< 500` standard files), 0 lint/compile errors.
