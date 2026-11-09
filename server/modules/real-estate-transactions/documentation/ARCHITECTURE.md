# Real Estate Transaction Management Backend Module (`server/modules/real-estate-transactions/`)

## 1. Module Responsibilities & Ownership Boundaries
The **Real Estate Transaction Management** module coordinates property purchases, sales, residential rentals, commercial rentals, and lease renewals across offers, counteroffers, participant roles, financial terms revisions, contract workflow references, milestones, authoritative payment status references, and completion prerequisites.

### Strict Non-Ownership Boundaries
- **Property Registry**: Owns canonical property records (`RealEstateTransactionPropertyRegistryReadAdapter`).
- **Bargains**: Owns public listings and initial bargain discovery (`RealEstateTransactionBargainsReadAdapter`).
- **Property Due Diligence**: Owns evidence verification and due diligence completion states (`RealEstateTransactionDueDiligenceReadAdapter`).
- **Media**: Owns contract and evidence binary files (`RealEstateTransactionMediaReadAdapter`).
- **Payments**: Owns payment processing and authoritative settlement confirmation (`RealEstateTransactionPaymentVerificationReadAdapter`). Client-supplied `CONFIRMED` payment claims are strictly rejected.
- **Dispute Non-Adjudication**: Records cancellation, termination, and dispute references without adjudicating legal entitlement to deposits.

## 2. Negotiation & Completion State Machines
- **Offer Lifecycle (`ALLOWED_OFFER_STATE_TRANSITIONS`)**:
  - `DRAFT` -> `SUBMITTED` | `WITHDRAWN`
  - `SUBMITTED` -> `UNDER_REVIEW` | `COUNTEROFFERED` | `ACCEPTED` | `REJECTED` | `WITHDRAWN` | `EXPIRED`
  - Counteroffers preserve the superseded offer record intact (`COUNTEROFFERED`) and create a new versioned offer linked via `previousOfferId`.
  - Simultaneous acceptance conflicts and stale offer transitions are blocked atomically inside Firestore transactions using `activeOfferId`, `acceptedOfferId`, and optimistic concurrency `revisionNumber`.
- **Completion Prerequisites (`verifyTransactionCompletionPrerequisites`)**:
  - Offer acceptance transitions the transaction to `TERMS_ACCEPTED_PENDING_CLOSING` (never directly to `COMPLETED`).
  - Transition to `COMPLETED` requires: (1) an accepted offer, (2) signed/effective contract metadata, (3) at least one authoritatively verified `CONFIRMED` payment reference, (4) a verified/completed `HANDOVER_COMPLETED` milestone, and (5) no blocking due diligence findings.

## 3. Required Integration Work (For Integration Lead)
Mount the 13 route specifications exported in `REAL_ESTATE_TRANSACTIONS_ROUTE_REGISTRATION_SPEC` (`server/modules/real-estate-transactions/index.ts`) and wire the read adapters for `propertyRegistry`, `bargains`, `dueDiligence`, `media`, `payments`, and `notifications`.
