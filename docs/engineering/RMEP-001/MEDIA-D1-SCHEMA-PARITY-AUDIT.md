# Media D1 Schema Parity Audit — 2026-11-27

**Repository:** `bijanbijane/radartehran`  
**Branch:** `feat/nips-backend-runtime-foundation-2026-11-26`  
**Scope:** GitHub repository inspection only  
**Status:** `BLOCKED — NO SAFE D1 CUTOVER`

## Executive finding

The existing `media_objects` table in migration `migrations/d1/0003_media_objects_and_queue_execution_leases.sql` is **not a drop-in durable store** for the legacy Media module's native metadata records, upload grants, or cleanup jobs.

The current Express media repository explicitly returns `MEDIA_METADATA_D1_EXPRESS_ADAPTER_BLOCKED` for the `d1` backend. That block must remain until a schema/adapter contract is approved and verified. Do not remove it merely because a table named `media_objects` exists.

## Verified evidence

1. Migration 0003 defines `media_objects` with:
   - identity and storage fields: `object_id`, `owner_uid`, `bucket_name`, `storage_key`;
   - geographic/media attributes: `city_id`, `hood_id`, `media_type`, `mime_type`, `size_bytes`;
   - checksum and association: `sha256_checksum`, `target_type`, `target_id`;
   - lifecycle/deletion/retention fields and timestamps.
2. `server/modules/media/durableMediaMetadataRepository.ts` still has a fail-closed D1 repository. Its D1 methods throw `MEDIA_METADATA_D1_EXPRESS_ADAPTER_BLOCKED`; D1 availability is not claimed.
3. `server/modules/media/firestoreMetadataAuthority.ts` persists a different native envelope (`media_metadata_native_v1`) containing a `MediaMetadataRecord`, and separately persists upload grants and cleanup jobs in distinct Firestore collections.
4. `server/modules/media/metadataStore.ts` requires durable semantics for:
   - upload-grant save/get/idempotency lookup/consume;
   - metadata save/get/idempotency lookup/revision-checked atomic update;
   - metadata listing and owner listing;
   - cleanup-job save/get/list;
   - startup hydration.
5. The migration does not define dedicated upload-grant or cleanup-job tables, nor does the `media_objects` row shape directly encode the complete native metadata envelope and revision/CAS contract.
6. `worker/account-lifecycle/workerD1DomainAdapters.ts` has a partial media adapter used only for contract tests. It reads `media_objects` and marks rows `PURGED/DELETED` during account deletion. The file explicitly states these partial adapters are not wired into the Worker runtime and do not establish a production-ready media metadata repository.

## Compatibility conclusion

The existing `media_objects` table is a stored-object/account-lifecycle projection, not proven parity for the full Media domain persistence contract. Treating it as the full native metadata authority would risk losing:
- upload-grant state and idempotency;
- cleanup-job state and retry checkpoints;
- metadata revision conflict semantics;
- native metadata fields not represented in the D1 row;
- startup hydration and pagination behavior.

The presence of a partial account-deletion adapter does not close these gaps.

## Required work before D1 cutover

1. Define an explicit D1 schema contract for native media metadata, upload grants, and cleanup jobs, including ownership and migration location.
2. Decide whether `media_objects` is extended as a compatible canonical table or whether separate tables are required. Do not silently overload its existing lifecycle projection.
3. Specify atomic revision/CAS behavior and idempotency constraints for grants, metadata updates, and cleanup jobs.
4. Implement a D1 repository behind the existing `MediaMetadataRepository` / `MediaMetadataPersistenceStore` contracts, with fail-closed handling for unavailable bindings and query errors.
5. Add migration-backed tests for schema parity, revision conflicts, idempotency, pagination, hydration, cleanup retry, and account-deletion interoperability.
6. Prove that the Express runtime receives only an explicitly authorized D1 binding. Do not infer binding availability from Worker-only bindings.
7. Run the focused media/storage tests, typecheck, architecture checks, and full CI after GitHub Actions runner allocation is healthy.
8. Only then consider changing the production backend default or removing Firestore legacy paths.

## Explicit non-actions

- No migration was added or applied.
- No D1 binding, table, row, secret, or Cloudflare resource was changed.
- No Firestore data was copied, deleted, or modified.
- No Firebase package or lockfile was changed.
- No runtime cutover or production deployment was performed.

## Status

`IMPLEMENTED_BUT_NOT_VERIFIED` applies to the repository documentation change only. The D1 adapter and migration remain `BLOCKED` pending the contract and verification work above.
