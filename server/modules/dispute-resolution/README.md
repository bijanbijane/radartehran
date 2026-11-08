# Employee 53 — Real Estate Dispute Resolution & Case Management Backend

## 1. Mission & Boundary

The Dispute Resolution and Case Management backend (`server/modules/dispute-resolution/`) is an independent domain service that manages real-estate dispute intake, involved parties, structured claims, responses, confidential evidence references, negotiation proposals, bilateral settlement agreements, timeline recording, and state machine transitions.

### Invariant & Boundary:
- **Case Management Only**: This system is a case-management engine. It is NOT a court, arbitration authority, legal-advice engine, law-enforcement system, or automated judge.
- **Consensual Settlement Agreements**: Settlement agreements represent mutual, bilateral party consensus verified through cryptographic signature hashes (`partyUid + proposalId + timestamp`).
- **Privacy & Separation of Duties**: Evidence marked `MEDIATOR_ONLY` or `INTERNAL_LEGAL`, along with mediator private notes (`mediatorPrivateNotesFa`), are strictly filtered out from regular party views.
- **Append-Only Timeline**: Every critical lifecycle transition, claim, response, evidence submission, and settlement signature is recorded in an immutable audit timeline.

## 2. Directory Layout

- `disputeTypes.ts`: Domain models, statuses, categories, proposals, settlements, timeline events, and domain events.
- `disputeValidator.ts`: Persian text sanitization, input validation, and state machine transition rules.
- `disputeStore.ts`: `DisputeRepository` interface and `MemoryDisputeStore` with GDPR-friendly data export and anonymization.
- `disputeNegotiationEngine.ts`: Proposals, bilateral electronic signatures, and mediation sessions.
- `disputeEngine.ts`: Core `DisputeResolutionEngine` orchestrating intake, claims, evidence, transitions, and summaries.
- `disputeRoutes.ts`: Express router factory (`createDisputeRouter`).
- `index.ts`: Public module exports.

## 3. Case Lifecycle State Machine

```
DRAFT -> SUBMITTED -> [AWAITING_PARTIES / AWAITING_RESPONSE / UNDER_REVIEW]
UNDER_REVIEW -> [NEGOTIATION / MEDIATION / SETTLEMENT_PROPOSED / RESOLVED / CLOSED]
NEGOTIATION / MEDIATION -> SETTLEMENT_PROPOSED -> SETTLEMENT_ACCEPTED -> RESOLVED -> CLOSED
```

## 4. API Endpoints

- `POST /api/disputes/cases`: Case intake with idempotency check
- `GET /api/disputes/my-cases`: List cases for the authenticated user
- `GET /api/disputes/cases/:caseId`: Get case summary and claims (with privacy enforcement)
- `POST /api/disputes/cases/:caseId/claims`: Submit new claim
- `POST /api/disputes/claims/:claimId/responses`: Submit response to a claim
- `POST /api/disputes/cases/:caseId/evidence`: Attach evidence reference
- `POST /api/disputes/cases/:caseId/proposals`: Issue negotiation proposal
- `POST /api/disputes/proposals/:proposalId/accept`: Accept proposal (creates bilateral agreement on dual accept)
- `POST /api/disputes/cases/:caseId/transition`: State machine transition
- `POST /api/disputes/cases/:caseId/resolve`: Document resolution outcome
- `GET /api/disputes/cases/:caseId/timeline`: Immutable timeline log
