# Property Mortgage & Financing Backend Module (`server/modules/property-financing/`)

## 1. Module Responsibilities
Manages property-related mortgage records, financing provider references, financing applications, borrower/co-borrower/guarantor relationships, structured loan terms, interest rates, repayment schedules, collateral references, LTV calculations from verified inputs, financing offer comparisons, refinancing workflows, payoff/closure records, financing risk indicators, and financing history.

This module **does not**:
- Act as a bank, lender, credit bureau, payment processor, or autonomous loan approval system.
- Treat a financing record as proof of property ownership (`provesPropertyOwnership: false`).
- Allow clients to mark an application `APPROVED` or `FUNDED` without `LENDER_OR_VERIFIER` authorization and an official confirmation reference (`LENDER_CONFIRMATION_REQUIRED_FOR_APPROVAL_OR_FUNDING`).
- Assume a property owner is a borrower or vice versa (`assumesOwnerIsBorrower: false`, `assumesBorrowerIsOwner: false`), or infer guarantor liability without a `contractualGuaranteeDocumentId`.
- Silently overwrite `CONTRACTUAL_TERMS` with updated lender quotes (`CONTRACTUAL_TERMS_CANNOT_BE_SILENTLY_OVERWRITTEN`) or treat an estimated rate as contractual (`ESTIMATED_RATE_CANNOT_BE_MARKED_CONTRACTUAL`).
- Mark an installment as `PAID_CONFIRMED` without confirmation from the Payments adapter (`PAYMENT_CONFIRMATION_REQUIRED_FOR_INSTALLMENT_PAID`).
- Infer a registered mortgage security (`REGISTERED_SECURITY`) without an official registration reference verified against Property Ownership & Rights (`COLLATERAL_REGISTRATION_REQUIRES_OFFICIAL_REF`).
- Use listing asking prices (`ASKING_PRICE_NOT_VALID_VALUATION`) or stale/missing valuations (`STALE_OR_MISSING_VALUATION`) for LTV calculations.
- Automatically close an existing loan merely because a refinancing application is approved (`automaticallyClosesExistingLoanOnApproval: false`).
- Mark a loan closed solely because a payoff payment was initiated (`PAYOFF_INITIATION_DOES_NOT_CLOSE_LOAN`), or assume collateral security is released when the loan closes (`assumesCollateralReleasedOnPayoff: false`).

## 2. LTV & Offer Comparison Methodology
- **LTV Formula (`LTV_STANDARD_V1`)**:
  $$\text{LTV (\%)} = \text{round\_2dp}\left(\frac{\text{Loan Amount (IRR)}}{\text{Verified Property Value (IRR)}} \times 100\right)$$
  Supports `ORIGINAL_LOAN_AMOUNT` or `CURRENT_OUTSTANDING_BALANCE` against a verified valuation reference from `PropertyValuationFinancingAdapter`. Rejects `UNVERIFIED_ASKING_PRICE` and stale/missing valuations.
- **Offer Comparison**:
  Computes a transparent baseline comparison (`principal + annualRate * years + documentedFees`) alongside explicit `repaymentAssumptions`, `isExpiredAsOfComparison`, and `missingInformationFlags` (`guaranteesApplicantEligibility: false`, `guaranteesFinancialOutcome: false`).

## 3. Cross-Module Interfaces
- `PropertyRegistryFinancingAdapter`: Verifies canonical property identity.
- `PropertyOwnershipFinancingAdapter`: Verifies registered mortgage encumbrance references.
- `PropertyValuationFinancingAdapter`: Verifies property valuation records, dates, and freshness.
- `LegalRegulatoryFinancingAdapter`: Verifies lender registration references.
- `PaymentsFinancingAdapter`: Verifies authoritative installment and payoff payment confirmations.
- `MediaFinancingAdapter`: Verifies financing document media references without duplicating file storage.
- `NotificationsFinancingAdapter`: Dispatches financing deadline and lifecycle notifications.

## 4. Synthetic Example (Test Fixture Only)
```ts
// SYNTHETIC TEST FIXTURE ONLY — NOT A REAL BANK OFFER OR MORTGAGE APPROVAL
const facade = createPropertyFinancingModuleFacade();
const provider = await facade.providerApplicationAndFinancingService.registerFinancingProviderReference(lenderActor, {
  providerName: 'Synthetic Housing Bank Fixture',
  providerType: 'BANK',
  jurisdictionCitySlug: 'tehran',
  officialRegistrationReference: 'CBI-SYNTH-REG-101',
  requestedVerificationStatus: 'VERIFIED_PROVIDER',
  sourceProvenance: 'SYNTHETIC_TEST_FIXTURE',
  isSyntheticTestFixture: true,
});
```
