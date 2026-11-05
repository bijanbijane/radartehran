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

4. **Mandatory Verification Commands**:
   Always run these checks before completing any task:
   ```bash
   npm run lint
   npm run arch:check
   npm test
   npm run test:contracts
   npm run test:mutation
   npm run test:e2e
   npm run test:smoke
   npx tsx tests/stress-50-cycles.test.ts
   npx tsx tests/object-storage-upload-auth.test.ts
   npx tsx tests/object-storage-security.test.ts
   npx tsx tests/object-storage-range.test.ts
   npm run build
   ```

5. **AI-Agent Contribution & Documentation Sync Protocol (Prompt 558)**:
   - **Inspect Before Writing**: Always inspect the actual files (`server.ts`, `firestore.rules`, `firebase-blueprint.json`, `src/types/models.ts`) before claiming any behavior or updating docs.
   - **Synchronize Contracts & Docs in the Same Turn**:
     - If an Express route changes, update `API_ENDPOINT_CONTRACTS` (`src/utils/serverConfigValidator.ts`) and `RADAR_API_ROUTE_INVENTORY` (`src/utils/apiContractsAndSerializationEngine.ts`).
     - If a Firestore collection or rule changes, update `firestore.rules`, `firebase-blueprint.json`, `docs/system-architecture.md`, and `docs/security.md`.
     - If an environment variable changes, update `.env.example`, `RUNTIME_ENV_KEYS` (`src/utils/serverRuntimeEnvStore.ts`), and `docs/deployment.md`.
   - **Zero Secret Leakage**: Never write raw API keys, tokens, or PII into code comments, test fixtures, or Markdown files.
   - **Evidence-Based Reporting**: Every completion summary must list exact modified files, verification commands actually executed, and any remaining external prerequisites.

6. **Persistent Engineering Memory & Cross-Session Governance (RMEP-001 v4.0)**:
   - The canonical durable engineering memory is maintained at [`docs/engineering/RMEP-001/PERSISTENT-ENGINEERING-MEMORY.md`](./docs/engineering/RMEP-001/PERSISTENT-ENGINEERING-MEMORY.md).
   - In any new session, resumption, or continuation, agents must inspect this document for permanent operator decisions, verified architecture, and established engineering principles (e.g. halting arbitrary line reduction and preserving working functionality).

