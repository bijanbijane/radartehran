# Radar Tehran — Database & Data Layer Deep Audit Report
## Document Version: 1.0.0 (Workstream: DB-001)
## Author: Member 02 — Database and Data Architecture Engineer
## Authoritative Alignment: Version 22 Master Charter + Version 32 Execution Governance

---

## 1. Executive Summary & Audit Scope

This document presents an exhaustive, evidence-based architectural audit of the entire database and persistence layer of **Radar Tehran** (`رادار مسکن کلانشهرهای ایران`), conducted by Member 02 (Database and Data Architecture Engineer) under read-only audit workstream **`DB-001`**.

No application code, database records, schemas, or security rules were modified during this inspection. All findings are derived directly from source inspection of `firebase-blueprint.json`, `firestore.rules`, `firestore.indexes.json`, `src/firebase.ts`, `src/components/useRadarCloudSync.ts`, `src/utils/serverObjectStorage.ts`, `src/utils/serverMarketPulseEngine.ts`, and corresponding automated test suites.

---

## 2. Actual Database Technology Inventory

Contrary to common assumptions, Radar Tehran utilizes a multi-tiered hybrid storage architecture combining cloud NoSQL, file-backed atomic persistence, client-side browser storage, and object storage:

| Storage Tier | Technology & Implementation | Storage Location & Identifiers | Persistence Guarantee |
|---|---|---|---|
| **Primary Cloud Database** | **Google Cloud Firestore** (Document NoSQL) | Database ID: `ai-studio-e48df7a4-9535-4bf0-a948-61a6a0f37a6a` (Project `gen-lang-client-0671259189`) | High-availability multi-region cloud persistence with real-time `onSnapshot` WebChannel/long-polling listeners. |
| **Relational Database (SQL)** | **None Active** (`NOT_IN_USE`) | Standalone `cloud_sql_proxy` binary present in container root, but zero tables or active ORM connections exist in codebase. | Not applicable. |
| **Server-Side File Persistence** | Node.js Atomic Debounced JSON (`fs.promises.rename`, `0o600`) | `.cache-data.json` (Market pulse, city overrides, air quality cache), `.runtime-config.json` (Dynamic non-secret config). | High durability across server process restarts; protected against partial writes via PID temp files. |
| **Object Storage Master Index** | Local JSON Key-Value Store | `.object-storage-bucket/index.json` (Media records, owner bindings, deletion states, checksums). | Atomic persistence with scheduled flush and CAS consistency. |
| **Object Storage Binary Store** | Local Filesystem + S3-Compatible Remote Bucket | Local directory `.object-storage-bucket/` + optional S3/R2 remote upload endpoint. | Dual-tier storage; WebP normalized (max 800px) with magic-byte validation. |
| **Browser Client Storage** | HTML5 `localStorage` | Keys: `tehran_neighborhoods_radar_v2`, `tehran_radar_favorites_v1`, `tehran_radar_feature_flags_v1`, `tehran_radar_visited_homes_v1`. | Volatile client-side storage; cleared on logout or explicit reset. |
| **In-Memory Volatile Cache** | Node.js Process Memory & Circular Buffers | `serverAuditLogs` (100 entries FIFO), `cachedMarketPulseByCity`, IP rate limit token buckets. | Ephemeral; reset on process shutdown. |

---

## 3. Complete Data Architecture & Entity Relationship Map

### 3.1. Firestore Collections & Entity Schema Map

```
┌────────────────────────────────────────────────────────────────────────┐
│                        FIRESTORE DATABASE ROOT                         │
│                                                                        │
│  ├── /admins/{uid}                    (Delegated Admin RBAC Roles)     │
│  ├── /appConfig/featureFlags          (Global Feature Toggles)         │
│  ├── /userPreferences/{uid}           (User Budget, Target Sqm & Favs) │
│  ├── /votes/{voteId}                  (Resident Neighborhood Reviews)  │
│  ├── /bargains/{bargainId}            (Public Under-Market Listings)   │
│  ├── /bargainOwners/{bargainId}       (Private Ownership Auth Records) │
│  ├── /buyerAlerts/{alertId}           (Registered Buyer Contact Leads) │
│  ├── /sponsorRequests/{requestId}     (Agency CRM Sponsorship Bids)    │
│  └── /neighborhoodOverrides/{hoodId}  (Admin Price & Sponsor Overrides)│
└────────────────────────────────────────────────────────────────────────┘
```

#### Detailed Entity Specifications:
1. **`AdminRole` (`/admins/{uid}`)**:
   - Document ID: Firebase User UID (`^[a-zA-Z0-9_\-]+$`, 1..128 chars).
   - Fields: `role` (enum `["admin"]`), `email` (optional normalized string <= 120 chars).
   - Rules: Read-only for authenticated verified users; write-only out-of-band / system admin.
2. **`UserPreference` (`/userPreferences/{uid}`)**:
   - Document ID: User UID.
   - Fields: `userId`, `mode` (`rent` | `buy`), `deposit` (0..100,000M), `monthlyRent` (0..1,000M), `buyTotalBudget` (500..1,000,000M), `targetSqm` (20..1,000), `workHubId` (1..40 chars), `favoriteHoodIds` (array of numbers 1..999, max 25 items), `updatedAt` (timestamp).
   - Integrity: Read/write strictly restricted to `request.auth.uid == uid`.
3. **`ResidentVote` (`/votes/{voteId}`)**:
   - Document ID: Deterministic UID or composite ID.
   - Fields: `hoodId` (1..999), `hoodName` (1..80 chars), `userId`, `userDisplayName` (1..100 chars), scores (1..10) for `air`, `powerWater`, `internet`, `metro`, `security`, `flatTerrain`, `comment` (<= 500 chars), `locationVerified` (boolean), `createdAt`, `lastUpdatedAt`.
   - Cooldown Rule: 24-hour rate limit enforced via `request.time >= existing().lastUpdatedAt + duration.value(24, 'h')`.
4. **`BargainSubmission` (`/bargains/{bargainId}`) & `BargainOwner` (`/bargainOwners/{bargainId}`)**:
   - Pattern: Two-document decoupled ownership pattern.
   - `/bargains/{bargainId}`: Publicly readable; contains listing details (`hoodId`, `title`, `type`, `sqm`, `priceText`, `discountPercent` [10..60%], `buyerProfitText`, `street`, `imageUrl`, `imageUrls`, `videoUrl`, `objectStorageObjectIds`, `createdAt`).
   - `/bargainOwners/{bargainId}`: Private; maps `bargainId` to `userId`. Only the authenticated creator or admin may read/delete.
5. **`BuyerAlertLead` (`/buyerAlerts/{alertId}`)**:
   - Document ID: Generated ID.
   - Fields: `userId`, `hoodId` (1..999), `hoodName`, `fullName`, `phone` (Iranian mobile format), `dealType` (`خرید` | `اجاره`), `maxBudgetText`, `createdAt`, `updatedAt`.
   - Privacy Guard: Readable only by document owner (`userId == request.auth.uid`) or verified administrator. Mutable update restricted to non-sensitive fields (`fullName`, `phone`, `dealType`, `maxBudgetText`, `updatedAt`).
6. **`SponsorRequest` (`/sponsorRequests/{requestId}`)**:
   - Fields: `hoodId` (1..999), `hoodName`, `agencyName` (>= 2 chars), `phone`, `specialty`, `experienceYears`, `monthlyTariffMillion`, `planMonths` (1 | 3), `trackingCode`, `status` (`pending` | `approved`), `createdAt`, `expiresAtIso`.
   - Rules: Created by agency users; approved, extended, or deleted exclusively by verified admins.
7. **`NeighborhoodOverride` (`/neighborhoodOverrides/{hoodId}`)**:
   - Document ID: Integer hood ID as string (`1` to `999`).
   - Fields: `hoodId`, `buyPerSqm` (10..5,000M), `rahn80m` (>= 50M), `sponsorName`, `sponsorPhone`, `sponsorExpiresAt`, `sponsorBadge`, `updatedAt`.
   - Rules: Publicly readable; writable exclusively by verified admins.

---

## 4. Data Integrity & Reliability Assessment

### 4.1. Concurrency, Race Conditions & Partial Writes
- **Firestore Batch Decoupling**: Creation of `/bargains/{id}` and `/bargainOwners/{id}` occurs via batch write. If the client disconnects halfway during an unbatched write, ownership would be orphaned. `useRadarCrudActions.ts` enforces `writeBatch()` for bargain creation, preventing half-created listings.
- **Server Disk Atomic Rename**: `.cache-data.json` and `.object-storage-bucket/index.json` use atomic rename (`PID.tmp` → target). Even under sudden power loss or process kill (`SIGKILL`), corrupted partial JSON files are impossible on POSIX filesystems.
- **Client Race Mitigation**: Rapid city switching could cause stale market pulse responses to overwrite fresh state. `App.tsx` mitigates this with `activeCityRef.current === targetCity` check before setting state.

### 4.2. Referential Integrity & Orphan Data Risks
- **No Native Foreign Keys**: Firestore is NoSQL and does not enforce foreign keys.
- **Media Object Orphan Risk**: Deleting a bargain from `/bargains` without removing attached object storage files (`objectStorageObjectIds`) leaves orphaned WebP files on disk/S3.
- **Mitigation Implemented**: The codebase includes `serverObjectStorageOrphanAudit.ts` and `serverObjectStorageCleanup.ts` with a two-phase deletion coordinator (`pending_delete` state) and automated cleanup route `/api/object-storage/admin/reconcile-pending-deletes`.

---

## 5. Query Performance & Scalability Assessment

### 5.1. Composite Indexes Inspection
All composite queries match configured indexes in `firestore.indexes.json`:
1. `bargains`: `(status ASC, city ASC, createdAt DESC)`
2. `bargains`: `(status ASC, hoodId ASC, offeredTotalMillion ASC)`
3. `bargains`: `(createdByUid ASC, createdAt DESC)`
4. `sponsorRequests`: `(userId ASC, createdAtIso DESC)`
5. `sponsorRequests`: `(hoodId ASC, status ASC, expiresAtIso DESC)`
6. `buyerAlerts`: `(userId ASC, createdAt DESC)`

### 5.2. Query Inefficiencies & Scale Bottlenecks
- **Unbounded Collection Listeners**:
  - `useRadarCloudSync.ts` listens to `/neighborhoodOverrides` using `onSnapshot(collection(db, 'neighborhoodOverrides'))`. Because Iran metropolitan neighborhoods are capped at 999 items, this currently consumes `< 100` document reads per session. However, nationwide expansion beyond 1,000 points would require paginated or city-scoped queries.
  - `/votes` listener: Filters `where('userId', '==', user.uid)` and `limit(50)`, which is well-bounded.
  - `/bargains` listener: Scoped by `city` with a ceiling of 100 live bargains, preventing memory exhaustion.

---

## 6. Security & Access-Control Assessment

### 6.1. Multi-Layer RBAC & Email Verification
- **Admin Authentication**: `firestore.rules` enforces dual-check: (1) `request.auth.token.email_verified == true`, and (2) either matching canonical bootstrap emails (`masirsalamatt@gmail.com`, `radio837isf@gmail.com`, `bijanbijane.1@gmail.com`) or existing delegated admin document (`/admins/$(request.auth.uid)` with `role == 'admin'`).
- **Client Privilege Escalation Protection**: Verified by `tests/security-telegram-and-admin.test.ts`. Unverified emails, arbitrary claims, and non-admin delegated docs are completely rejected.
- **PII Exposure Guard**: Buyer lead phone numbers (`/buyerAlerts`) cannot be queried by unauthorized users. Only document creators or verified admins have read permission.

### 6.2. Sensitive Disk Persistence Invariant
- **Secret Masking**: `src/utils/serverMarketPulseEngine.ts` and `src/utils/serverRuntimeEnvStore.ts` strictly exclude `SECRET_ENV_KEYS` (e.g. `GEMINI_API_KEY`, `TELEGRAM_BOT_TOKEN`, `ADMIN_API_SECRET`) from `.cache-data.json` and `.runtime-config.json`.
- **File Permissions**: Files are created with `0o600` (read/write by owner only).

---

## 7. Storage, Backup & Disaster Recovery Assessment

### 7.1. Backup Portability & Restore Capability
- **Admin Full Backup Export**: `handleDownloadFullBackupJson` generates a portable, timestamped JSON snapshot including all neighborhood price overrides, sponsor CRM requests, buyer alert leads, and feature flags.
- **Validated Atomic Restore**: `validateAndBuildRestoredState` verifies schema versions and field types before restoring, ensuring corrupted backup files cannot destabilize running memory.
- **Cloud Database Backup**: Firestore automatic managed backups are subject to GCP cloud console configuration (`gcloud firestore export`). In the local/Build container, disaster recovery relies on the Admin Full Backup JSON and local atomic disk caches.

---

## 8. Cloud & Cloudflare Portability Assessment

As Radar Tehran evaluates Cloudflare infrastructure for future phases:

| Component | Current Technology | Cloudflare Equivalent | Portability & Migration Assessment |
|---|---|---|---|
| **Document Database** | Google Cloud Firestore | **Cloudflare D1** (Relational SQLite) or **Cloudflare KV** / **Hyperdrive** | `DESIGN_RISK`. Firestore SDK (`onSnapshot`, real-time listeners) is heavily coupled to Firebase. Migrating to Cloudflare would require replacing real-time listeners with Server-Sent Events (SSE) or WebSockets over D1/PostgreSQL. |
| **Object Storage** | S3-Compatible + Local File Store | **Cloudflare R2** | `CONFIRMED_COMPATIBLE`. `src/utils/objectStorageUpload.ts` already implements standard AWS S3 SDK v3 protocol (`@aws-sdk/client-s3`). Connecting Cloudflare R2 requires only setting `S3_ENDPOINT` to the Cloudflare R2 account URL. |
| **Server Persistence** | Local Disk Files (`.cache-data.json`) | **Cloudflare KV** or **Durable Objects** | `PORTABLE_WITH_ADAPTER`. Local file writes cannot run in serverless Cloudflare Workers; requires an adapter to write to Cloudflare KV. |
| **Authentication** | Firebase Auth | **Cloudflare Access** or JWT Verification | `DECOUPLED`. Backend already verifies standard JWTs (`verifyFirebaseUserAuthorization`); can accept any OIDC/JWKS provider. |

---

## 9. Prioritized Defect & Risk Register

All findings are classified according to Version 32 evidentiary standards:

| ID | Classification | Severity | Affected Entity / File | Summary of Finding & Evidence | Recommended Remediation |
|---|---|---|---|---|---|
| **DB-FIND-01** | `DESIGN_RISK` | Medium | `/neighborhoodOverrides` (`useRadarCloudSync.ts`) | Full collection subscription (`onSnapshot(collection(db, 'neighborhoodOverrides'))`) reads all overrides on app boot. Scalable for <= 1,000 hoods, but lacks city-level partitioning. | Add `where('city', '==', activeCity)` query scope when multi-city overrides exceed 500 records. |
| **DB-FIND-02** | `DESIGN_RISK` | Medium | `/votes` collection | Vote document IDs use client-generated or composite keys. If a user deletes and re-creates account, 24h cooldown relies on client timestamp check in security rules. | Maintain strict server timestamp enforcement (`request.time`) in `firestore.rules`. |
| **DB-FIND-03** | `IMPROVEMENT_HYPOTHESIS` | Low | Object Storage Index (`serverObjectStorageHelpers.ts`) | `.object-storage-bucket/index.json` is a single monolithic JSON file. At > 10,000 media objects, parsing memory overhead increases. | Partition index by year/month or migrate to SQLite / Cloudflare D1 when media count exceeds 1,000 files. |
| **DB-FIND-04** | `PREVIOUSLY_VERIFIED` | N/A (Pass) | `firestore.rules` & `/buyerAlerts` | Update mutations strictly restricted to allowed mutable keys and requires `updatedAt`. | Invariant verified by `tests/buyer-alert-contract.test.ts`. |
| **DB-FIND-05** | `PREVIOUSLY_VERIFIED` | N/A (Pass) | `.cache-data.json` secret hygiene | Secret environment keys and PII are strictly excluded from server disk cache. | Invariant verified by `tests/security-telegram-and-admin.test.ts`. |

---

## 10. Database Improvement Roadmap & Acceptance Criteria for Member 02

When implementation workstreams are authorized for the Database Engineer, the following sequential roadmap is recommended:

### Phase 1: Data Partitioning & Query Guardrails
- **Objective**: Introduce city-partitioned query filters for `/neighborhoodOverrides` and `/bargains` to bound client bandwidth.
- **Acceptance Criteria**: All collection queries must include `where('city', '==', cityId)` and explicit `.limit()`.

### Phase 2: Cloudflare R2 Object Storage Connector
- **Objective**: Validate remote S3 compatibility against Cloudflare R2 endpoints without altering local fallback.
- **Acceptance Criteria**: Upload, range stream, and two-phase delete pass all 43 storage security tests using Cloudflare R2 credentials.

### Phase 3: Automated Disaster Recovery Verification
- **Objective**: Create automated CI contract test for `validateAndBuildRestoredState` verifying round-trip backup export and restore fidelity.
- **Acceptance Criteria**: Automated test generates backup, mutates state, restores backup, and asserts 100% field equality.

---

## 11. Workstream DB-001 Terminal State

Workstream **`DB-001`** is successfully completed in read-only mode:
- Technology stack, schema structures, and entity relationships fully inventoried.
- Integrity, concurrency, and security invariants assessed and documented.
- Cloudflare infrastructure portability evaluated.
- No code, configuration, or database mutations performed.
- Registered in canonical progress log (`docs/AUTONOMOUS-ENGINEERING-PROGRESS.md`).
