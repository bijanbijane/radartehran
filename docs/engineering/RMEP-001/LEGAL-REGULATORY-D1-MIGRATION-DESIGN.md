# Legal-Regulatory D1 Migration Design

Status: DESIGN ONLY — NOT IMPLEMENTED, NOT DEPLOYED
Date: 2026-11-27
Scope: Replace the production Firestore persistence used by `server/modules/legal-regulatory` without weakening its transaction, authorization, audit, versioning, or idempotency guarantees.

## 1. Verified current state

- `apps/api/server.ts` imports and mounts `registerLegalRegulatoryRoutes`.
- `server/modules/legal-regulatory/routes.ts` constructs `FirestoreLegalRegulatoryStore` by default.
- The production store uses `FirestoreLegalRegulatoryTransactionRunner` and fail-closed 503 behavior; it has no in-memory fallback.
- The module uses ten logical collections: sources, documents, provisions, applicability rules, change history, conflicts, compliance requirements, AI summaries, audit log, and idempotency.
- The transaction contract stages writes, performs all reads before writes, checks optimistic versions, then commits entity + audit + idempotency records atomically.
- Existing tests explicitly verify read-before-write ordering, CAS conflicts, atomic rollback, idempotency, and durable cross-instance behavior.
- No legal-regulatory-specific D1 migration currently exists under `migrations/`.

## 2. Data ownership decision — BLOCKING

The repository has distinct D1 roles (user, neighborhood, researcher). Legal-regulatory source material is curated shared reference content, not user account data and not authoritative geography. The likely candidate is the researcher/reference domain, but this mapping is **not yet approved or encoded**. Do not bind this module to `radar_user_db` or `radar_neighborhood_db` by convenience. Before implementation, confirm the owning database and the binding available to the Express/Worker runtime. The candidate binding to evaluate is `radar_researcher_db`.

No migration should run against a remote database as part of this work.

## 3. Proposed relational model

Use one table per current logical collection; preserve the existing stable record IDs and JSON shape during the first cutover. Keep searchable and integrity-critical fields as typed columns and the complete versioned object in validated JSON.

| Table | Primary key | Typed projection / required constraints |
|---|---|---|
| `legal_regulatory_sources` | `id` | `version`, `verification_status`, `source_category`, `jurisdiction_level`, `province_id`, `city_id`, `district_number`, `neighborhood_id`, `effective_from_iso`, `effective_to_iso`, `payload_json` |
| `legal_regulatory_documents` | `id` | `source_id`, `version`, `verification_status`, `document_category`, `effective_from_iso`, `payload_json` |
| `legal_regulatory_provisions` | `id` | `source_id`, `document_id`, `parent_provision_id`, `version`, `lifecycle_status`, `verification_status`, `provision_number`, `effective_from_iso`, `payload_json` |
| `legal_regulatory_applicability_rules` | `id` | `source_id`, `provision_id`, `version`, `verification_status`, `jurisdiction_level`, `city_id`, `district_number`, `neighborhood_id`, `effective_from_iso`, `payload_json` |
| `legal_regulatory_change_records` | `id` | `target_provision_id`, `enacting_source_id`, `previous_provision_version`, `new_provision_version`, `recorded_at_iso`, `payload_json` |
| `legal_regulatory_conflicts` | `id` | `provision_id_a`, `provision_id_b`, `status`, `version`, `recorded_at_iso`, `payload_json` |
| `legal_regulatory_compliance_requirements` | `id` | `requirement_code`, `source_id`, `provision_id`, `status`, `version`, `verification_status`, `effective_from_iso`, `payload_json` |
| `legal_regulatory_ai_summaries` | `id` | `target_entity_type`, `target_entity_id`, `target_entity_version`, `generated_at_iso`, `human_review_status`, constant checks `is_authoritative = 0`, `requires_human_review = 1`, `payload_json` |
| `legal_regulatory_audit` | `id` | `target_entity_type`, `target_entity_id`, `actor_id`, `actor_role`, `action`, `occurred_at_iso`, `payload_json` |
| `legal_regulatory_idempotency` | `document_id` | unique `(operation, actor_id, key)`, `request_hash`, `created_at_iso`, `payload_json` |

All payload columns must use `TEXT NOT NULL CHECK(json_valid(payload_json))`. Use integer booleans and explicit ISO-8601 UTC text. Preserve optional/null semantics and avoid lossy conversion of Persian text, arrays, nested jurisdiction scopes, or provision version-history snapshots.

Foreign-key candidates: documents.source_id → sources.id; provisions.source_id → sources.id and document_id → documents.id; rules.source_id/provision_id → source/provision; changes.target_provision_id/enacting_source_id → provision/source; compliance.source_id/provision_id → source/provision; conflicts.provision_id_a/provision_id_b → provisions. Confirm delete/update behavior before enabling enforcement; legal records should normally be append/version controlled rather than cascade-deleted.

## 4. Required indexes

- Documents: `(source_id, id)`.
- Provisions: `(source_id, id)`, `(document_id, id)`, `(lifecycle_status, verification_status, id)`.
- Applicability rules: `(provision_id, id)`, `(source_id, id)`, and geographic lookup `(city_id, district_number, neighborhood_id, verification_status)`.
- Change records: `(target_provision_id, previous_provision_version)`.
- Conflicts: `(status, id)`, `(provision_id_a, provision_id_b)`.
- Compliance requirements: `(source_id, id)`, `(provision_id, id)`, `(status, verification_status)`.
- AI summaries: `(target_entity_type, target_entity_id, generated_at_iso DESC)`.
- Audit: `(target_entity_type, target_entity_id, occurred_at_iso DESC)`, `(actor_id, occurred_at_iso DESC)`.
- Idempotency: unique `(operation, actor_id, key)`.

Do not rely on loading an unbounded table and sorting in application memory. Preserve existing API caps initially; implement deterministic keyset pagination before increasing caps.

## 5. D1 transaction protocol — mandatory design

D1 exposes atomic `batch()`, not a Firestore-style callback transaction with reads interleaved before writes. A naive translation of the current transaction runner is not equivalent.

The adapter must:
1. Execute all `get*` calls before staging writes, preserving the existing read-before-write contract.
2. Record every observed row version and every expected previous version.
3. Generate a cryptographically random transaction token.
4. Use one atomic D1 batch with a conditional transaction-guard insert that succeeds only if **all** observed CAS predicates still hold and all create-only IDs/idempotency keys remain available.
5. Make every entity, change, audit, and idempotency write conditional on the guard token existing; perform all writes in the same batch.
6. Delete the guard token in the same batch.
7. Inspect the guard-insert result. If no guard row was inserted, perform no data writes and map the result to the same 409 conflict or idempotency conflict semantics as the Firestore implementation.
8. Treat D1 errors as fail-closed 503; never fall back to memory or Firestore silently.

The guard table is an internal coordination mechanism, not a user-facing entity. Its row must be inserted and deleted in the same D1 batch so a successful transaction leaves no durable guard row. The exact SQL must be proven against D1/SQLite semantics before implementation; do not assume a CTE or `RETURNING` feature without runtime verification.

## 6. Compatibility and migration sequence

1. Add the migration only after database ownership and binding are confirmed.
2. Implement a D1 transaction runner behind the existing `LegalRegulatoryStore` interface; do not change service or route contracts in the first slice.
3. Add parity tests against the existing Firestore mock contract: read-before-write, multi-entity atomicity, audit rollback, idempotency hash mismatch, optimistic version conflict, concurrent create collision, and concurrent version update.
4. Add real D1 integration tests using the actual D1 binding in an isolated test database.
5. Add an explicit composition-root selection requiring the D1 binding; if absent, fail closed. Do not silently retain Firestore as a fallback.
6. Add a one-time, resumable export/import plan with row counts, stable IDs, checksums, payload validation, and a read-only verification report. No dual-write.
7. Cut over only after parity and data reconciliation pass and the owner explicitly approves. Keep Firestore read-only during the agreed rollback window; no automatic write fallback.
8. Remove Firebase Admin imports from this module only after the D1 implementation is deployed and verified. Global Firebase retirement is a separate workstream.

## 7. Acceptance gates

- All existing legal-regulatory tests pass unchanged against the current Firestore implementation.
- D1 contract suite proves the same status codes and transactional guarantees.
- D1 integration tests cover concurrent writers and prove zero partial entity/audit/idempotency writes on conflict or injected failure.
- Public redaction, actor authorization, property-context verification, rate limiting, and legal-source verification semantics remain unchanged.
- Every returned provision snapshot preserves exact historical text/version and provenance.
- AI summaries remain explicitly non-authoritative and require human review.
- A reconciliation report proves counts and checksums match before cutover.
- No production migration, dual-write, merge, or deploy occurs without explicit approval.

## 8. Explicit non-goals

- No change to legal interpretation or applicability rules.
- No weakening of source verification or reviewer permissions.
- No moving authoritative neighborhood geography into this module.
- No automatic deletion of legal history.
- No production D1 migration or Firestore data mutation in this engineering phase.
