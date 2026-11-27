# Firebase / Firestore / Sharp Retirement — Call-Site Inventory

**Repository:** `bijanbijane/radartehran`  
**Branch:** `feat/nips-backend-runtime-foundation-2026-11-26`  
**Inspection baseline:** runtime/config HEAD `2f5969683b1da75df04f4ac38e17e162590ddfaf`  
**Status:** INVENTORY PARTIAL — NO RUNTIME CHANGES  
**Scope:** GitHub repository inspection only. This is a migration inventory, not an authorization to change production resources.

## 1. Executive finding

Firebase is not yet removable as a package-level change. The current branch still has active Firebase Admin / Firestore operations in legacy Express services, even though the browser compatibility facade `src/firebase.ts` no longer imports the Firebase SDK and the dedicated Worker entrypoint forbids Firebase Admin and Sharp.

The npm audit inventory contains:
- `firebase@12.19.0` (root production dependency; manifest range `^12.12.0`);
- `firebase-admin@13.10.0` (root and API workspace production dependency; manifest range `^13.7.0`);
- `@firebase/firestore@4.17.2` and `@grpc/grpc-js@1.9.16` in the Firebase SDK dependency graph;
- `sharp@0.33.5` (root and API workspace production dependency).

The audit recommends major-version fix candidates for Firebase and Sharp. These packages must not be removed or blindly upgraded until the active call sites below have replacements and the lockfile can be regenerated and tested.

## 2. Verified runtime call sites

| Domain | Current branch evidence | Current responsibility | Migration constraint |
|---|---|---|---|
| Admin identity / Firestore bootstrap | `src/utils/serverAdminAndTelegramSecurity.ts:2,10,13` | Imports `firebase-admin/app` and `firebase-admin/firestore`; initializes Admin apps and resolves the Firestore database. | Replace with the Cloudflare session / D1 identity authority and explicit repository ports. Do not keep Firebase bearer-token fallback as an implicit downgrade. |
| Object storage ownership / bargain references | `src/utils/serverObjectStorage.ts:1-2,86,110-111,249,319,329` | Imports Firestore `FieldPath`; queries bargain and owner documents and performs orphan-audit queries. | Preserve owner checks, pagination, orphan-audit behavior, and deletion recovery. Binary media storage and metadata persistence must remain separate. |
| Sponsor and bargain persistence | `src/utils/serverSponsorFirestoreHelper.ts:7,54,88,90`; `src/utils/serverSponsorAndBargainRoutes.ts:3,8,29,80,116-180,216-217` | Uses `FieldValue.serverTimestamp()`, Firestore collections, transactions, sponsor requests, neighborhood overrides, monetization configuration and bargain moderation. | Replace each operation with an authorized domain API/adapter. Do not move all data into one D1 database without an ownership decision. |
| Market-pulse override writes | `src/utils/serverMarketPulseEngine.ts:169-180` | Dynamically imports Firestore `FieldValue` and the Admin Firestore provider to persist neighborhood overrides. | Separate market observations from user/admin override state; preserve provenance and write authorization. |
| Community persistence | `server/modules/community/communityFirestoreAdapter.ts:2,147,155-168,183,199,218-248,262` | Reads/writes community collections, paginates, uses Firestore transactions and increment operations. | Preserve transactional invariants, access policy, idempotency and pagination behind a domain-specific adapter. |
| Account deletion legacy bridge | `server/modules/account-lifecycle/legacyFirestoreDeletionSteps.ts:5-8,58,86-87,140-152,221` | Uses Firebase Admin Auth `getAuth().deleteUser()` and Firestore deletion of preferences, votes, bargains, owners and sponsor requests. | Reconcile every deletion step with the D1 account-lifecycle state machine, write blocks, export/deletion jobs and external identity semantics. Do not remove the legacy bridge until parity is proven. |
| Media metadata / upload grants / cleanup jobs | `server/modules/media/firestoreMetadataAuthority.ts:5-6,34-35,66-67,80-81,115-116,123-124,130-131,141-147,181-183` | Firestore metadata reads/writes/deletes, upload grants, cleanup jobs and paginated metadata audit. | Existing module comments identify D1 `media_objects` as the durable target; blobs remain in object storage. Verify the owner schema and migration before switching. |
| Legal-regulatory persistence | `server/modules/legal-regulatory/adapters.ts:375-412`; `index.ts:1`; `firestoreStore.ts:1`; `firestoreTransactionRunner.ts:1`; `server/modules/real-estate-transactions/productionCrossModuleAdapters.ts:8` | Firestore-typed adapters and transaction runner remain part of the legacy persistence boundary. | Preserve read-only property-registry guarantees, resource-level authorization and transaction semantics. The exact target D1 ownership/schema is not assumed here. |
| Deletion journal typing | `src/utils/serverJournalAdapters.ts:1` | Imports the Firestore type in a persistence adapter contract. | Confirm whether the type-only coupling is still needed after runtime adapters are replaced; remove it only after interface compatibility tests. |

## 3. Sharp image-processing boundary

- `src/utils/objectStorageUpload.ts:1` imports `sharp`.
- `src/utils/serverObjectStorage.ts:2,17` invokes `processImageToWebpMax800(rawBuffer, 800)` during image upload.
- The dedicated Worker entrypoint invariant explicitly forbids importing `sharp`; this Node/Express upload path must not leak into the Worker import graph.
- Audit version: `sharp@0.33.5`; audit fix candidate: `0.35.5` (major upgrade).
- Do not replace Sharp with an unverified browser-only transformation. Preserve server-side magic-byte validation, MIME/extension checks, size limits, WebP output constraints, and adversarial-image tests. Select a Worker-compatible image processing contract only after runtime capability and cost are verified.

## 4. Client SDK and build configuration

- `src/firebase.ts` is a compatibility facade over `src/platform/auth`; the inspected file does not import `firebase/app`, `firebase/auth`, or `firebase/firestore`.
- `vite.config.ts:65-71,82-88,102` still explicitly references Firebase SDK packages in dependency optimization / chunk selection. These references are stale candidates for cleanup, but first verify no current frontend import graph requires them.
- Root `package.json` still declares `firebase` as a production dependency. It also declares `@firebase/rules-unit-testing` as a development dependency; its peer relationship and remaining rules/emulator scripts must be reconciled before removing the SDK.
- `scripts/check-architecture.ts:121` currently rejects only `firebase/firestore` and `@firebase/firestore` imports under `src/**`. The guard does not express the complete client SDK prohibition or all legacy Express migration boundaries.
- `worker/index.ts` documents and enforces a stricter runtime boundary: its import graph must never include Express, `firebase-admin`, Sharp, or the legacy market-pulse engine.

## 5. Dependency audit facts

The recorded `npm audit --json` reports 21 findings (14 moderate, 5 high, 2 critical). Critical findings are in the development-only test runner chain (`vitest@3.2.7`, `tinypool@1.1.1`). High findings include production Firebase/Firestore and Sharp dependency paths. The exact advisory inventory is recorded in the RMEP progress log and remediation register.

No package changes were made in this inventory. Audit fix suggestions include major upgrades; use a compatible Node 22/npm 10 executor to regenerate `package-lock.json`, then run the focused and full test suites. Never use `npm audit fix --force` as a substitute for compatibility review.

## 6. Ordered retirement plan

1. Freeze new Firebase/Firestore imports and writes. Add/strengthen a source-level architecture guard for browser modules and Worker import graphs without falsely banning transitional Node-only adapters.
2. Migrate account/session and admin authorization consumers to the existing Cloudflare-native session and D1 lifecycle authority. Prove fail-closed behavior and no Firebase bearer fallback.
3. Migrate sponsor, bargain, neighborhood override, community and legal-regulatory repositories one domain at a time. Each needs an approved target binding/schema, authorization model, idempotency, transaction/CAS tests and data parity evidence.
4. Complete media metadata and upload-grant migration to the approved D1 metadata contract; retain object bytes in the authorized object store and preserve orphan cleanup.
5. Replace account-deletion legacy Firestore/Auth steps only after the D1 account-lifecycle workflow covers every collection and external identity action.
6. Replace Sharp with a verified runtime-compatible image pipeline while preserving upload security and output behavior.
7. Remove Firebase SDK/Admin and rules/emulator tooling dependencies only after import searches, workspace manifests, scripts, tests, lockfile and build configuration are reconciled.
8. Re-run npm audit, dependency graph inspection, TypeScript, architecture, security, storage, auth and integration suites. Record exact exit codes and deployment evidence separately.

## 7. Explicit non-actions

- No Firebase/Firestore project, collection, document, rules, index or credential was changed or deleted.
- No D1 binding, schema, migration or data was changed.
- No Worker deployment or secret mutation was performed.
- No dependency or lockfile change was made.
- No test pass is claimed from static inspection.
