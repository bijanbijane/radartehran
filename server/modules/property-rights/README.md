# Property Ownership & Rights Registry Backend Module (`server/modules/property-rights/`)

## 1. Module Responsibilities

The **Property Ownership & Rights Registry Backend Module** (`EMPLOYEE 43`) manages structured property ownership interests, co-ownership shares (*Dang* / *Sahm*), non-ownership property rights (usufruct, habitation, easement, right of way, surface/development rights, commercial occupancy *Haqq-e Kasb-o-Pisheh*), tenure/leasehold interests, encumbrances (mortgages, liens, judicial attachments *Bazdast*, transfer restrictions), supporting evidence references, disputes, and bitemporal historical lineage.

Key domain invariants:
1. **Multi-Dimensional Status Vector (`MultiDimensionalStatusVector`)**: Keeps `identityConfidence`, `sourceReliability`, `verificationStatus`, and `legalStatus` strictly separate—never collapsing them into a single unexplained ownership confidence score and never presenting an unverified claim (`CLAIMED`, `DOCUMENTED`, `PENDING_VERIFICATION`) as established legal ownership (`INDEPENDENTLY_VERIFIED_INTEREST`).
2. **Exact Rational Fractional Ownership (`ExactOwnershipShare`)**: Represents shares using exact GCD-reduced BigInt rational fractions (`numerator`, `denominator`) with support for Iranian 6-Dang (`SIX_DANG_6`), 96-Shair (`NINETY_SIX_SHAIR_96`), and basis-point (`BASIS_POINTS_10000`) bases. Strictly separates `UNKNOWN_SHARE` from `ZERO_NO_OWNERSHIP` and never redistributes missing or disputed shares automatically.
3. **Non-Ownership Rights & Tenure Separation**: Records `PropertyRightRecord` and `TenureInterestRecord` with `establishesLegalOwnership: false`, keeping operational rent collection and maintenance outside this module (owned by Property Management).
4. **6-State Encumbrance Model**: Distinguishes `REPORTED_ENCUMBRANCE`, `DOCUMENTED_UNVERIFIED_ENCUMBRANCE`, `VERIFIED_REGISTERED_ENCUMBRANCE`, `DISPUTED_ENCUMBRANCE`, `RELEASED_OR_EXPIRED_WITH_EVIDENCE`, and `UNKNOWN_ENCUMBRANCE_STATUS`, while enforcing `encumbranceFreeEstablished: false` (absence of recorded encumbrances never proves a property is free of encumbrances).
5. **Bitemporal Lineage & Dispute Non-Adjudication**: Tracks `effectiveDateIso`, `recordedAtIso`, and `sourceVerifiedAtIso` separately (`learnedAfterEffectiveDateDays`), preserves all superseded/disputed historical interests, and prohibits platform adjudication of competing legal claims (`DISPUTE_ADJUDICATION_PROHIBITED`).

---

## 2. Existing Ownership Source-of-Truth Analysis

- **`server/modules/bargains` (`/bargainOwners/{bargainId}`)**: Stores the Firebase `userId` of the account that submitted a bargain advertisement (`bargainId` → `userId`). That record represents **listing-submission authorship**, NOT legal real-estate title or co-ownership shares on a canonical property entity.
- **`server/modules/brokerage`**: Stores agency representation mandates (`mandates`), which represent an agent's authorization to market a property rather than property title.
- **`server/modules/property-due-diligence`**: Stores inspection and document-review case workflows (`legal_document_checklist`), referencing evidence without owning the canonical registry of property ownership interests, rights, and encumbrances.

---

## 3. Exclusive Collections Owned by This Module

| Collection Name | Entity | Primary Key | Concurrency Strategy |
| :--- | :--- | :--- | :--- |
| `property_ownership_interests_v1` | `OwnershipInterestRecord` | `own_int_*` | Optimistic CAS (`version`) |
| `property_non_ownership_rights_v1` | `PropertyRightRecord` | `prop_right_*` | Optimistic CAS (`version`) |
| `property_tenure_interests_v1` | `TenureInterestRecord` | `tenure_*` | Optimistic CAS (`version`) |
| `property_encumbrances_v1` | `PropertyEncumbranceRecord` | `enc_*` | Optimistic CAS (`version`) |
| `property_rights_evidence_v1` | `OwnershipEvidenceRecord` | `ev_*` | Optimistic CAS (`version`) + duplicate ref check |
| `property_rights_history_v1` | `PropertyRightsHistoryEventRecord` | `hist_*` | Append-only immutable |
| `property_rights_disputes_v1` | `OwnershipDisputeRecord` | `disp_*` | Optimistic CAS (`version`) |
| `property_rights_idempotency_v1` | Idempotency ledger | `${op}_${actor}_${key}` | Transaction idempotency |

---

## 4. Synthetic Test Fixtures Notice

All ownership records, deed reference numbers, registration plates (*Pelak-e Sabti*), and party identifiers in `__tests__/propertyRights.test.ts` are marked `isSyntheticTestFixture: true` and are synthetic test fixtures only.
