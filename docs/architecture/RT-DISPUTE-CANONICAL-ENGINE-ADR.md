# ADR: Canonical Dispute Resolution Engine & Durable Firestore Core

- **ID:** `RT-DISPUTE-CRITICAL-031`
- **Status:** Accepted Architecture (Implementation Complete — Pending Live Firestore Emulator & Production Wiring Gate)
- **Date:** 2026-11-22
- **Scope:** `server/modules/dispute-resolution/*`

## 1. Context & Problem Statement

Two parallel, in-memory implementations coexisted under `server/modules/dispute-resolution/`:

1. **Architecture A**: `disputeEngine.ts`, `disputeStore.ts` (`MemoryDisputeStore`), `disputeRoutes.ts`, `disputeTypes.ts`, `disputeValidator.ts`.
2. **Architecture B**: `store.ts` (`TransactionalDisputeResolutionStore`), `intakePartyClaimAndEvidenceService.ts`, `mediationSettlementResolutionAndHistoryService.ts`, `disputeNegotiationEngine.ts`, `types.ts`.

Both implementations stored all state in process-local JavaScript `Map` instances, relied on mock prefix checks (e.g., `externalPaymentRef.startsWith('confirmed-pay-')`), trusted client-supplied `respondentUid` without checking Transaction or Property Registry linkage, and were never mounted in `server.ts`.

## 2. Decision: Single Canonical Durable Core

All production Dispute Resolution workflows MUST execute through **one canonical architecture**:

| Pillar | Canonical Artifact | Responsibility |
|---|---|---|
| **Canonical Dispute Entity** | `CanonicalDisputeCaseRecord` (`firestoreStore.ts`) | Single case master record with monotonic `revision`, strict `CaseStatus`, verified `claimantUid` / `respondentUid`, `propertyReferenceId`, `transactionReferenceId`, and immutable `legalBoundary` flags. |
| **Canonical Repository** | `FirestoreDisputeResolutionStore` (`firestoreStore.ts`) | Durable Firestore backing across all 13 canonical collections using strict `READ_PHASE -> WRITE_PHASE` transactions (`DurableFirestoreEngine`). |
| **Canonical Service & Lifecycle** | `CanonicalDisputeResolutionService` (`canonicalDisputeService.ts`) | Enforces state machine (`validateDisputeTransition`), Revision CAS, durable Idempotency (`409` on payload mismatch), and participant authorization verified against Real Estate Transactions & Property Registry. |
| **Canonical Evidence Reference** | `dispute_evidence` + `media_object_metadata_v2` | References verified `ACTIVE` media objects only; strictly redacts `MEDIATOR_ONLY` and `INTERNAL_LEGAL` evidence from Claimant/Respondent views. |
| **Canonical Settlement Proposal & Bilateral Acceptance** | `dispute_settlement_proposals` & `dispute_settlements` | Single-party acceptance transitions proposal to `PARTIALLY_ACCEPTED` only. A `dispute_settlements` record is created **only** after explicit bilateral acceptance by both Claimant and Respondent inside a single atomic transaction. |
| **Canonical Audit Timeline** | `dispute_case_history` | Strictly append-only, immutable collection (no update/delete repository APIs); written atomically inside the same Firestore transaction as every state mutation. |
| **Canonical Payment Reference** | `payment_intents` (`status === 'SUCCEEDED' && ledgerCommitted === true`) | Verified via `Payments` Canonical Engine; forged strings such as `confirmed-pay-*` are unconditionally rejected (`409 UNVERIFIED_PAYMENT_REFERENCE`). |
| **Canonical Notification Outbox** | `dispute_notification_outbox` | Durable outbox entries written transactionally alongside case creation, status transitions, settlement acceptance, and final resolution. |

## 3. Canonical Firestore Collections (13 Core + 1 Outbox)

1. `dispute_cases`
2. `dispute_parties`
3. `dispute_claims`
4. `dispute_responses`
5. `dispute_evidence`
6. `dispute_communications`
7. `dispute_deadlines`
8. `dispute_mediation_sessions`
9. `dispute_settlement_proposals`
10. `dispute_settlements`
11. `dispute_resolution_outcomes`
12. `dispute_case_history`
13. `dispute_idempotency`
14. `dispute_notification_outbox` (transactional outbox)

All collections enforce `allow read, write: if false;` in `firestore.rules` (backend-only Admin SDK access).

## 4. Legal & Epistemic Boundaries (Non-Negotiable Invariants)

This module is strictly **internal case management**. Every `CanonicalSettlementRecord` and `CanonicalResolutionOutcomeRecord` embeds immutable legal boundary metadata:

- `isBindingCourtOrder: false` — internal settlement is never a judicial or arbitral ruling.
- `isOfficialElectronicSignature: false` — internal acceptance hash is not a statutory electronic signature.
- `isFinalLegalContract: false` — settlement proposals are not binding official deeds.
- `confirmsPaymentAlone: false` — uploaded receipts or mutual text never confirm payment; only Payments Canonical Engine confirms settlement.
- `transfersOwnershipAlone: false` — resolution outcomes never mutate Property Ownership directly.

## 5. Deprecation & Production Composition Root Rules

- `MemoryDisputeStore` and `TransactionalDisputeResolutionStore` are restricted exclusively to unit tests (`createInMemoryDisputeResolutionModuleForTests()`), which throws `503 DISPUTE_RESOLUTION_DEPENDENCY_UNAVAILABLE` when `NODE_ENV === 'production'`.
- `createProductionDisputeResolutionModule(deps)` requires all real canonical adapters (`FirestoreDisputeResolutionStore`, `PropertyRegistry`, `RealEstateTransactions`, `Media`, `Payments`) with zero mock defaults.
- `registerDisputeResolutionRoutes(app, options)` fails closed with `503 DISPUTE_RESOLUTION_DEPENDENCY_UNAVAILABLE` until live durable dependencies are wired and verified.
