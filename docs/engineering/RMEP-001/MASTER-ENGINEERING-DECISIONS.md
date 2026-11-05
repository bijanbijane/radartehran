# RMEP-001 — Master Engineering Decisions Register
**Program**: `RMEP-001` (`v4.1`)  
**Verification Date**: `2026-11-01`

---

## MED-001: Declarative & Atomic Execution State Engine (`src/utils/rmepExecutionStateEngine.ts`)
- **Decision Identifier**: `MED-001`
- **Problem**: Conversational context windows can expire or reset across sessions, and naive JSON writes can corrupt state files or accidentally persist credentials.
- **Existing Implementation**: Documentation existed in `docs/`, but no automated SHA-256 baseline verifier or atomic `.tmp` + `rename` writer existed for `docs/engineering/RMEP-001/EXECUTION-STATE.json`.
- **Alternatives Considered**:
  1. Storing execution state in browser `localStorage` (rejected: inaccessible to server/CLI tools and easily wiped).
  2. Direct `fs.writeFileSync` overwrites (rejected: non-atomic on interruption).
  3. Declarative JSON schema validated for secret/path-traversal leaks and written atomically via `.tmp` + `fs.promises.rename`.
- **Selected Approach**: Option 3 (`src/utils/rmepExecutionStateEngine.ts`).
- **Reason for Selection**: Guarantees syntactic validity, cryptographic verification against `MASTER-PROMPT.md` (`4be39b67c381536d5c363b9fa5c026d61dd00fae5964cedfd5df168d3f6abc63`), and zero secret leakage.
- **Expected Effects**: Safe deterministic resumption on `ادامه بده` / `CONTINUE`.
- **Implementation Status**: `VERIFIED`
- **Verification Evidence**: `tests/cloudflare-ai-commerce-architecture.test.ts` & `docs/engineering/RMEP-001/evidence/phase-1/backend-verification.json`.

---

## MED-002: Vite 8 Native ConfigLoader Modernization & Lazy Chunk Isolation
- **Decision Identifier**: `MED-002`
- **Problem**: `vite build` under Vite 8.3.5 emitted a native configLoader deprecation warning (`__dirname` and extensionless TS imports in `vite.config.ts` / `serverConfigValidator.ts`), and `NeighborhoodInspectorTabs.tsx` lazily imported `HedonicInlineWidget` through `HedonicValuationModal.tsx`, coupling the inline widget chunk to the full modal.
- **Existing Implementation**: `path.resolve(__dirname, '.')` in `vite.config.ts` and `import('./HedonicValuationModal')` in `NeighborhoodInspectorTabs.tsx`.
- **Alternatives Considered**:
  1. Setting `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to silence the warning (rejected: hides technical debt instead of fixing root cause).
  2. Migrating `vite.config.ts` to `import.meta.dirname` + explicit `.ts` imports and pointing `HedonicInlineWidget` lazy import directly to `./HedonicInlineWidget`.
- **Selected Approach**: Option 2.
- **Reason for Selection**: Eliminates the Vite 8 native loader warning cleanly and decouples `HedonicInlineWidget` into its own lightweight `10.15 kB` lazy chunk.
- **Implementation Status**: `VERIFIED`
- **Verification Evidence**: `docs/engineering/RMEP-001/evidence/phase-3/frontend-verification.json`.

---

## MED-003: Composite Index Coverage for Resident Votes (`firestore.indexes.json`)
- **Decision Identifier**: `MED-003`
- **Problem**: Neighborhood resident votes (`/votes`) are queried by `hoodId` ordered by `createdAtIso DESC`, which was missing from `firestore.indexes.json`.
- **Selected Approach**: Added composite index `{ hoodId: ASCENDING, createdAtIso: DESCENDING }` on collection group `votes` in `firestore.indexes.json`.
- **Reason for Selection**: Prevents Firestore `FAILED_PRECONDITION: The query requires an index` errors in production while preserving existing `firestore.rules`.
- **Implementation Status**: `VERIFIED`
- **Verification Evidence**: `docs/engineering/RMEP-001/evidence/phase-2/evidence.json`.

---

## MED-004: Isolated Lazy-Loading of HedonicInlineWidget in Inspector Drawer
- **Decision Identifier**: `MED-004`
- **Problem**: `NeighborhoodInspectorTabs.tsx` previously imported `HedonicInlineWidget` via `HedonicValuationModal.tsx`, coupling the inline calculator widget chunk to the full modal bundle.
- **Selected Approach**: Pointed `React.lazy` in `NeighborhoodInspectorTabs.tsx` directly to `./HedonicInlineWidget` (`7.22 kB` chunk) while delegating core valuation arithmetic to `src/data/hedonicPricingEngine.ts`.
- **Reason for Selection**: Reduces initial drawer chunk payload and preserves the Hedonic single source of truth (`FAST_SALE_FACTOR = 0.88`).
- **Implementation Status**: `VERIFIED`
- **Verification Evidence**: `docs/engineering/RMEP-001/evidence/phase-3/evidence.json`.

---

## MED-005: Declarative Atomic Execution State Persistence
- **Decision Identifier**: `MED-005`
- **Problem**: Non-atomic writes to `EXECUTION-STATE.json`, `.cache-data.json`, or `.runtime-config.json` risk partial file corruption or secret leakage across process restarts.
- **Selected Approach**: Enforced `.tmp` write + JSON round-trip verification + `0o600` mode + `fs.promises.rename` atomic replacement with regex secret scanning (`SECRET_LEAK_PATTERN`).
- **Reason for Selection**: Prevents partial writes and guarantees zero secret or buyer PII persistence on disk.
- **Implementation Status**: `VERIFIED`
- **Verification Evidence**: `docs/engineering/RMEP-001/evidence/phase-5/evidence.json`.

---

## MED-006: Universal Sub-450 Line Ratchet & Multi-Artifact Reconciliation Guard
- **Decision Identifier**: `MED-006`
- **Problem**: Even when files pass the 500-line ceiling (`ARCHITECTURE.md`), modules drifting into the `451..499` line range leave narrow headroom for future maintenance, and multi-document engineering state (`EXECUTION-STATE.json`, `MASTER-ENGINEERING-DECISIONS.md`, `PROGRESS-LOG.md`, `FINAL-ENGINEERING-REPORT.md`, `phases/*.md`) can drift out of sync.
- **Selected Approach**: Ratcheted 100% of all non-dataset source files (`186` scanned files) to `<= 450` lines (`>= 50` lines of safety headroom below 500) in `tests/architecture-guardrails.test.ts` and upgraded `readAndReconcileExecutionState()` in `src/utils/rmepExecutionStateEngine.ts` to enforce cross-artifact parity across state, decisions, phase reports, progress log, and final report.
- **Reason for Selection**: Provides automated fail-fast protection against both file-size bloat and documentation/checkpoint drift.
- **Implementation Status**: `VERIFIED`
- **Verification Evidence**: `tests/architecture-guardrails.test.ts` & `docs/engineering/RMEP-001/evidence/phase-6/evidence.json`.

---

## MED-007: Deterministic CI Lockfile, Bounded In-Memory Mutation Testing & Real-Browser E2E/Smoke Gates
- **Decision Identifier**: `MED-007`
- **Problem**: Prior to `OP-174`, `.github/workflows/ci.yml` used non-deterministic `npm install` because `package-lock.json` was absent, `@playwright/test` lacked a `playwright.config.ts` and `*.e2e.spec.ts` suite, local HTTP tests could be redirected to an HTML login page when `process.env.APP_URL` pointed to the external Cloud Run proxy, and no automated mutation gate verified whether tests actually caught broken domain/security invariants.
- **Alternatives Considered**:
  1. Running full-repository source-rewriting mutation tools on every commit (rejected: excessive runtime and disk churn across 242 files).
  2. Generating a pinned `package-lock.json` for `npm ci`, creating `tests/mutation-critical-invariants.test.ts` with 10 bounded in-memory mutants (`MUT-01`..`MUT-10`) against real Hedonic, area/currency, XSS/Divar/mobile, byte-range, and SSRF validators, adding `playwright.config.ts` + `tests/tehran-radar.e2e.spec.ts` using `SMOKE_BASE_URL || 'http://127.0.0.1:3000'`, and fixing the `1440x900` top-bar layout (`lg:max-w-[calc(100vw-530px)] 2xl:max-w-none` in `src/components/FloatingTopBar.tsx`).
- **Selected Approach**: Option 2.
- **Reason for Selection**: Delivers deterministic `npm ci` dependency locking, `100%` (`10/10`) mutation kill verification in `< 1s`, real headless Chromium E2E (`3 passed`) and smoke (`9/9 passed`) verification at `1440x900` and `390x844`, and zero flaky external network dependence.
- **Implementation Status**: `VERIFIED`
- **Verification Evidence**: `tests/engineering-quality-foundation.test.ts`, `tests/mutation-critical-invariants.test.ts`, `tests/tehran-radar.e2e.spec.ts`, `tests/browser-smoke.test.ts`, & `docs/engineering/RMEP-001/evidence/phase-6/evidence.json`.


