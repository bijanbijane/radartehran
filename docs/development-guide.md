# Development, Onboarding & Operator Guide

**Project**: رادار هوشمند محله‌ها و مسکن تهران و کلان‌شهرها

> **Architecture Rules**: Before creating new files or modifying legacy components, read [`/ARCHITECTURE.md`](../ARCHITECTURE.md) and [`/AGENTS.md`](../AGENTS.md). All new code files under `src/` must stay strictly below **500 lines**, and `src/data/*` / `src/utils/*` must never import from `src/components/*` or `src/App.tsx`.

---

## 1. Local Development Setup & Developer Commands Inventory (Prompts 546 & 557)

| Command | Category | Modifies Files / Network? | Expected Result |
| :--- | :--- | :--- | :--- |
| `npm install` | Setup | Writes `node_modules/` | Installs runtime and development dependencies |
| `npm run dev` | Runtime | Binds `0.0.0.0:3000` | Starts Express + Vite middleware dev server (`tsx server.ts`) |
| `npm run build` | Build | Writes `dist/` | Produces production client bundle (`< 600 KB` per chunk, zero public `.map` files) |
| `npm start` | Runtime | Binds `0.0.0.0:3000` | Starts production Express server serving `dist/` + `/api/*` |
| `npm run lint` | Verification | Read-only | Runs `tsc --noEmit` across the entire repository (zero errors) |
| `npm run arch:check` | Verification | Read-only | Enforces `< 500` line ceiling, legacy ratchet, and unidirectional layer imports |
| `npm test` | Verification | Read-only / local tmp | Runs all unit, security, domain, contract, 50-step, 627-cycle & static rules suites |
| `npm run test:rules` | Verification | Local Emulator (`127.0.0.1:8080`) | Runs behavioral Firestore Security Rules tests (`firestore.rules.test.ts`) |

---

## 2. Engineer Onboarding Path (Prompt 547)

1. **First Hour (Orientation)**:
   - Read [`/ARCHITECTURE.md`](../ARCHITECTURE.md), [`/AGENTS.md`](../AGENTS.md), and [`/docs/system-architecture.md`](./system-architecture.md).
   - Run `npm run lint && npm run arch:check && npm test` to confirm a green baseline.
2. **First Day (Codebase Tour)**:
   - **Types & Guards**: `src/types/models.ts`
   - **Pricing & Domain Logic**: `src/data/hedonicPricingEngine.ts`, `src/data/neighborhoods.ts`, `src/data/multiCityData.ts`, `src/data/superModulesLogic.ts`
   - **Security & Storage**: `src/utils/security.ts`, `src/utils/serverAdminAndTelegramSecurity.ts`, `src/utils/serverObjectStorage.ts`, `firestore.rules`
   - **UI Shell**: `src/App.tsx`, `src/components/FloatingTopBar.tsx`, `src/components/NeighborhoodInspectorDrawer.tsx`
3. **First Contribution**:
   - Implement your change in a cohesive module (`< 500` lines), add deterministic assertions in `tests/`, and run all mandatory verification commands listed in [`/AGENTS.md`](../AGENTS.md).

---

## 3. Adding or Updating Cities & Neighborhoods (190 Neighborhoods Across 5 Metropolises)

- **Tehran & Province Neighborhoods (`id: 1..80`)**:
  - Core Tehran (`1..35`): `src/data/neighborhoods.ts` (`INITIAL_NEIGHBORHOODS`).
  - Extended Tehran City (`36..60`): `src/data/tehranCityRemainingHoods.ts` (`TEHRAN_REMAINING_NEIGHBORHOODS`).
  - Tehran Province Counties (`61..80`): `src/data/tehranCountiesHoods.ts` (`TEHRAN_COUNTIES_NEIGHBORHOODS`).
- **Multi-City Neighborhoods (`id: 101..499`)**: `src/data/multiCityData.ts` (`MULTI_CITY_CONFIGS`) + extended city files (`alborzExtendedHoods.ts`, `mashhadExtendedHoods.ts`, `isfahanExtendedHoods.ts`, `shirazExtendedHoods.ts`).

---

## 4. Admin Panel Operator Guide (Prompt 556)

- **Accessing the Admin Panel**: Sign in via Google OAuth with a verified bootstrap admin email (`radio837isf@gmail.com`, `masirsalamatt@gmail.com`, `bijanbijane.1@gmail.com`) or an account with `/admins/{uid}` (`role: 'admin'`).
- **Safe vs. Destructive Actions**:
  - **Safe Read-Only**: Viewing system health (`GET /api/system-health`), running the 100-step diagnostic suite, exporting full JSON/CSV backups, and running Orphan Storage Audit in `dryRun: true` mode.
  - **State-Mutating (Requires Verification)**: Updating neighborhood price/sponsor overrides (`/neighborhoodOverrides/{hoodId}`), approving sponsor requests (`/sponsorRequests`), toggling feature flags (`/appConfig/featureFlags`), and restoring a full JSON backup (`validateAndBuildRestoredState`).

---

## 5. Domain Glossary (Prompt 554)

| Term | Persian UI Term | Code Identifier | Definition |
| :--- | :--- | :--- | :--- |
| **Hedonic Valuation** | ارزش‌گذاری هدونیک (قیمت منصفانه) | `calculateHedonicValuation` | Baseline neighborhood sqm price adjusted for building age, floor, elevator/parking/storage, area, and renovation (`FAST_SALE_FACTOR = 0.88`). |
| **Full Rahn (80m)** | رهن کامل ۸۰ متری | `rahn80m` | Benchmark refundable security deposit in Million Tomans for a standard 80 sqm apartment. |
| **Rahn-Rent Conversion** | نرخ تبدیل رهن به اجاره | `conversionRuleId` | Market conversion rate (typically `3%` monthly / `36%` annual) between refundable deposit and monthly rent. |
| **Bargain Listing** | شکارچی زیر فی (ملک اکازیون) | `BargainListing` | Verified discounted listing (`1%..60%` below neighborhood average) stored in `/bargains/{id}`. |
| **Neighborhood Override** | بازنویسی قیمت و اسپانسر محله | `NeighborhoodOverrideDoc` | Admin-curated price or sponsor override in `/neighborhoodOverrides/{hoodId}` (`1..999`). |
| **Deletion Journal** | ژورنال حذف دو مرحله‌ای رسانه | `DeletionJournalEntry` | Durable state machine (`queued` → `storage_deleted` → `completed`) ensuring zero orphaned media files. |

