# AI Agent & Contributor Architecture Instructions (`AGENTS.md`)

All coding agents and contributors working in this repository **must** follow the architectural rules defined in [`/ARCHITECTURE.md`](./ARCHITECTURE.md) and enforced by [`/architecture-baseline.json`](./architecture-baseline.json). Before undertaking any nontrivial engineering task, read the canonical persistent memory at [`/docs/engineering/RMEP-001/PERSISTENT-ENGINEERING-MEMORY.md`](./docs/engineering/RMEP-001/PERSISTENT-ENGINEERING-MEMORY.md) and the latest execution state at [`/docs/engineering/RMEP-001/EXECUTION-STATE.json`](./docs/engineering/RMEP-001/EXECUTION-STATE.json).

## Persistent Memory & Cross-Session Continuity
All agents must adhere to the canonical Persistent Engineering Memory in [`/docs/engineering/RMEP-001/PERSISTENT-ENGINEERING-MEMORY.md`](./docs/engineering/RMEP-001/PERSISTENT-ENGINEERING-MEMORY.md) and execute its mandatory Session Initialization Contract before undertaking non-trivial tasks.

For durable operator decisions, verified technical knowledge, and session resumption under **RMEP-001**, always read [`/docs/engineering/RMEP-001/PERSISTENT-ENGINEERING-MEMORY.md`](./docs/engineering/RMEP-001/PERSISTENT-ENGINEERING-MEMORY.md) and [`/docs/engineering/RMEP-001/EXECUTION-STATE.json`](./docs/engineering/RMEP-001/EXECUTION-STATE.json) before modifying the repository.

## Mandatory Rules Before & During Implementation

1. **File Size Limits**:
   - Every new or standard source file under `src/**/*.{ts,tsx}` and `server.ts` must remain **under 500 lines** (`thresholds.maxLinesNewFile: 500`; soft warning at `300` lines).
   - Never add new modals, calculators, or feature panels inline inside `src/App.tsx`. Create a cohesive module in `src/components/`, `src/data/`, or `src/utils/` instead.
   - Tracked legacy files in `architecture-baseline.json` (`trackedLegacyFiles`) are governed by a **strict non-increasing line-count ratchet (`maxLines`)**.

2. **Dependency Direction**:
   - Allowed flow: `src/App.tsx` / `server.ts` → `src/components/*` → `src/data/*` → `src/utils/*` → `src/types/*`.
   - `src/data/*`, `src/utils/*`, and `src/types/*` must **never** import from `src/components/*`, `src/App.tsx`, `server.ts`, or `react`.
   - Static dataset files (`src/data/neighborhoods.ts`, `src/data/neighborhoodInsights.ts`, `src/data/multiCityData.ts`, `src/data/tehranCityRemainingHoods.ts`, `src/data/tehranCountiesHoods.ts`, `src/data/tehranExtendedInsights.ts`) must never import React or UI components.

3. **Domain & Security Invariants**:
   - **Property Valuation**: `src/data/hedonicPricingEngine.ts` (`calculateHedonicValuation`, `FAST_SALE_FACTOR`) is the single source of truth for Hedonic property pricing.
   - **Leaflet HTML**: Always escape dynamic strings inside `L.divIcon` and `marker.bindTooltip` using `escapeHtmlAttr()` from `src/utils/security.ts`.
   - **Multi-City Links**: Always generate external Divar listing links via `buildExternalDivarUrl(city, mode, hoodName)` from `src/utils/security.ts`.
   - **Server Disk I/O & Secrets**: Use debounced asynchronous atomic writes (`0o600`) in `src/utils/serverMarketPulseEngine.ts`, `src/utils/serverRuntimeEnvStore.ts`, and `src/utils/serverObjectStorage.ts`. Never persist `SECRET_ENV_KEYS` or buyer PII (`buyerLeads`) to `.cache-data.json` or `.runtime-config.json`.
   - **Canonical identity/data plane (RT-DATA-001 / Firebase retirement)**: The browser SPA must not import Firebase SDK packages. `src/firebase.ts` is a compatibility facade over `src/platform/auth` and Cloudflare D1 opaque HttpOnly sessions; it does not initialize Firebase. Google login is handled by Worker OIDC (`worker/routes/authRoutes.ts`), and protected writes use same-origin cookies plus server-side origin/idempotency checks. Canonical user and marketplace state is in Cloudflare D1 (`migrations/user-d1`); Worker readiness is authoritative for D1/OIDC/R2. Remaining `firebase-admin`/Firestore code in legacy Express modules is migration debt, not the canonical identity or marketplace data plane. Do not route new writes to Firestore.

4. **Mandatory Verification Commands**:
   For authentication, Worker, D1, or backend changes, run the applicable regression gates before completion:
   ```bash
   npm run test:auth
   npm run test:cloudflare
   npm run test:security
   npm run typecheck --workspace=radartehran-frontend
   npm run typecheck --workspace=radartehran-api
   ./node_modules/.bin/tsc --noEmit -p tsconfig.worker.json
   npm run build --workspace=radartehran-frontend
   npm run build --workspace=radartehran-api
   npx wrangler deploy --dry-run --config wrangler.local.jsonc
   npm run arch:check
   ```
   Run domain-specific contracts, mutation, E2E, smoke, stress, object-storage, geography, and lifecycle suites when touched. `npm test` is the broader repository gate and must not be represented as passed unless every constituent command completed successfully. Firestore Rules tests are historical only; they do not validate the canonical D1 data plane.

5. **AI-Agent Contribution & Documentation Sync Protocol (Prompt 558)**:
   - **Inspect Before Writing**: Inspect the actual route, Worker handler, binding type, D1 migration, tests, and runtime configuration before claiming behavior or updating docs. `firestore.rules` and `firebase-blueprint.json` are retained as historical migration artifacts only.
   - **Synchronize Contracts & Docs in the Same Turn**:
     - If an Express route changes, update `API_ENDPOINT_CONTRACTS` (`src/utils/serverConfigValidator.ts`) and `RADAR_API_ROUTE_INVENTORY` (`src/utils/apiContractsAndSerializationEngine.ts`).
     - If a D1 table, index, or invariant changes, update the relevant `migrations/user-d1/*.sql` file, Worker repository, schema tests, and `docs/system-architecture.md` / `docs/security.md`.
     - If Firebase-retirement or Google OIDC/session contracts change, update `src/platform/auth`, `worker/auth`, `worker/routes/authRoutes.ts`, native auth tests, `wrangler.local.jsonc`, and deployment documentation as applicable.
     - If an environment variable changes, update `.env.example`, `RUNTIME_ENV_KEYS` (`src/utils/serverRuntimeEnvStore.ts`), and `docs/deployment.md`.
   - **Zero Secret Leakage**: Never write raw API keys, tokens, or PII into code comments, test fixtures, or Markdown files.
   - **Evidence-Based Reporting**: Every completion summary must list exact modified files, verification commands actually executed, and any remaining external prerequisites.

6. **Persistent Engineering Memory & Cross-Session Governance (RMEP-001 v4.0)**:
   - The canonical durable engineering memory is maintained at [`docs/engineering/RMEP-001/PERSISTENT-ENGINEERING-MEMORY.md`](./docs/engineering/RMEP-001/PERSISTENT-ENGINEERING-MEMORY.md).
   - In any new session, resumption, or continuation, agents must inspect this document for permanent operator decisions, verified architecture, and established engineering principles (e.g. halting arbitrary line reduction and preserving working functionality).

