# Property Insurance & Claims Management Backend (`server/modules/property-insurance/`)

## 1. Module Responsibilities
Owns insurance policy records, insured property and party references, structured coverage and exclusion items, policy lifecycle transitions, premium/deductible financial references, insurance claims, 6-dimensional damage/loss assessments, claim evidence references, settlement records, and renewal linkages.

Strictly distinguishes a recorded policy from confirmation that coverage is currently valid, applicable, or sufficient for a particular loss.

## 2. Policy, Coverage & Exclusion Model
- **Policyholder vs. Legal Owner**: `policyholderIsConfirmedPropertyOwner` is evaluated solely through `InsurancePropertyOwnershipReadAdapter`; purchasing or maintaining a policy never automatically implies legal ownership.
- **No Coverage by Policy Name Alone**: `evaluatePolicyCoverageStatusWithLimitations` requires an explicit `PolicyCoverageRecord` matching the queried `RiskCoverageCategory` and insured asset within effective dates, and checks all `PolicyExclusionOrLimitationRecord` entries (including waiting periods and verbatim source exclusions).
- **Verbatim Exclusion Preservation**: `originalSourceWordingVerbatim` is stored alongside `structuredClassificationSummary` with `aiSummaryNeverOverridesOriginal: true`.

## 3. Policy & Claim Lifecycles
- **Policy States**: `DRAFT` -> `SUBMITTED` -> `PENDING_VERIFICATION` -> `ACTIVE` | `SUSPENDED` | `EXPIRED` | `CANCELLED` | `NON_RENEWED` | `DISPUTED` | `UNKNOWN`. Transitioning to `ACTIVE` requires `verificationStatus === 'PROVIDER_CONFIRMED_AUTHORITATIVE'`.
- **Claim States**: `DRAFT` -> `REPORTED` -> `SUBMITTED` -> `ACKNOWLEDGED` -> `UNDER_REVIEW` -> `INSPECTION_REQUIRED` | `ADDITIONAL_EVIDENCE_REQUIRED` -> `APPROVED` | `PARTIALLY_APPROVED` | `REJECTED` -> `SETTLEMENT_PENDING` -> `SETTLED` | `DISPUTED` -> `CLOSED`.

## 4. Damage Assessments & Settlements
- **6 Loss Dimensions**: `reportedPhysicalDamageText`, `observedPhysicalDamageText`, `professionallyAssessedDamageText`, `estimatedRepairCostAmount`, `estimatedReplacementCostAmount`, `verifiedEligibleLossAmount`, and `insuranceApprovedSettlementAmount`.
- Sets `doesNotCertifyStructuralSafety: true` and preserves counter-assessments (`DISPUTED_BY_COUNTER_ASSESSMENT`).
- Settlement payment confirmation (`SETTLEMENT_PAYMENT_CONFIRMED`) is only accepted via `InsurancePaymentVerificationReadAdapter`.
