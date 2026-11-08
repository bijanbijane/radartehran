# Property Tax & Municipal Charges Backend Module (`server/modules/property-tax/`)

## 1. Module Responsibilities
Manages property-related tax records, municipal charges, tax assessments, tax obligations, billing periods, payment status references, tax deadlines, exemptions and relief workflows, tax disputes/appeals, taxpayer/responsible party references, versioned tax history, and property tax reporting summaries.

This module **does not**:
- Impersonate a tax authority or invent official tax identifiers/decisions.
- Process payments or store bank/card credentials (`processedByTaxModule: false`, `storesPaymentCredentials: false`).
- Treat a property tax record as proof of legal ownership (`provesLegalOwnership: false`).
- Use the platform's property valuation model as an official tax assessment (`usesPlatformValuationAsOfficialAssessment: false`).
- Mark an obligation as paid solely because a user uploaded a receipt (`RECEIPT_UPLOAD_DOES_NOT_CONFIRM_PAYMENT`).
- Automatically apply exemptions from demographic assumptions (`determinedFromDemographicsAlone: false`).
- Assume a tax dispute automatically suspends payment or collection (`suspensionConfirmedByAuthority` defaults to `false`).
- Infer that missing tax records mean zero tax liability (`missingRecordsMeanNoTaxLiability: false`).

## 2. Core Domain Models
- **Tax Authority Reference (`TaxAuthorityReferenceRecord`)**: Supports `NATIONAL_TAX_AUTHORITY`, `REGIONAL_TAX_AUTHORITY`, `MUNICIPAL_GOVERNMENT`, `LOCAL_PROPERTY_ASSESSMENT_AUTHORITY`, `MUNICIPAL_SERVICE_AUTHORITY`, and `OTHER_SUPPORTED_AUTHORITY`, distinguishing `USER_REPORTED_AUTHORITY`, `DOCUMENTED_AUTHORITY`, `VERIFIED_AUTHORITY`, and `UNKNOWN_AUTHORITY_STATUS`.
- **Property Tax Record (`PropertyTaxRecord`)**: Links canonical `propertyId`, `taxAuthorityId`, `jurisdiction`, `taxCategory`, `taxpayerPartyId`, and `taxPeriod` with optimistic concurrency (`version`) and `provesLegalOwnership: false`.
- **Tax Assessment (`TaxAssessmentRecord`)**: Distinguishes `OFFICIAL_ASSESSMENT`, `PRELIMINARY_ASSESSMENT`, `ESTIMATED_ASSESSMENT`, `USER_REPORTED_ASSESSMENT`, `DISPUTED_ASSESSMENT`, and `UNVERIFIED_ASSESSMENT`. Rejects using platform property valuations as `OFFICIAL_ASSESSMENT`. Corrections preserve the original assessment as `SUPERSEDED` (`SUPERSEDED_RECORD` in history) and create a new `CORRECTED` record.
- **Tax Obligation (`TaxObligationRecord`)**: Supports lifecycle states (`DRAFT`, `REPORTED`, `ASSESSED`, `DUE`, `PARTIALLY_PAID`, `PAID`, `OVERDUE`, `DISPUTED`, `SUSPENDED`, `CANCELLED`, `WAIVED`, `UNKNOWN`) and epistemic classifications (`OFFICIALLY_ASSESSED_OBLIGATION`, `USER_REPORTED_OBLIGATION`, `ESTIMATED_OBLIGATION`, `DISPUTED_OBLIGATION`, `UNKNOWN_OBLIGATION`). Blocks user-entered amounts from being declared legally `ASSESSED` or `DUE`.
- **Tax Bill (`TaxBillRecord`)**: Supports `INITIAL`, `CORRECTED`, `SUPPLEMENTAL`, and `REISSUED` bills with adjustments, documented penalties, and documented fees (`isAuthenticByUploadAlone: false`, `duplicatesPaymentsLedger: false`).
- **Municipal Charge (`MunicipalChargeRecord`)**: Distinguishes `TAX`, `MUNICIPAL_SERVICE_CHARGE`, `FEE`, `LEVY`, `PENALTY`, and `UTILITY_BILL_REFERENCE`. Blocks classifying a charge as `TAX` unless `sourceSupportsTaxClassification: true`.
- **Payment Status Reference (`TaxPaymentStatusReferenceRecord`)**: Distinguishes `PAYMENT_REPORTED_BY_USER`, `PAYMENT_RECEIPT_UPLOADED`, `PAYMENT_SUBMITTED`, `PAYMENT_CONFIRMED_BY_AUTHORITY`, `PAYMENT_PARTIALLY_CONFIRMED`, `PAYMENT_DISPUTED`, `PAYMENT_REVERSED`, and `REFUND_RECORDED`. Only authoritative confirmation via the Payments adapter transitions an obligation to `PAID` or `PARTIALLY_PAID`.
- **Tax Deadline (`TaxDeadlineRecord`)**: Distinguishes `OFFICIAL_DEADLINE`, `USER_ENTERED_DEADLINE`, `ESTIMATED_DEADLINE`, and `UNVERIFIED_DEADLINE`. Official deadlines require a verified `legalRegulatorySourceRef`. Reminder delivery is marked `true` only when confirmed by the Notifications adapter.
- **Tax Exemption (`TaxExemptionRecord`)**: Tracks `POTENTIAL_ELIGIBILITY`, `APPLICATION_SUBMITTED`, `APPLICATION_PENDING`, `APPROVED_EXEMPTION`, `REJECTED_EXEMPTION`, `EXPIRED_EXEMPTION`, and `UNVERIFIED_EXEMPTION`. Approval requires `AUTHORITY_VERIFIER_OR_ADMIN` and an `officialApprovalReference`.
- **Tax Dispute (`TaxDisputeRecord`)**: Tracks `DRAFT`, `PREPARING`, `SUBMITTED`, `ACKNOWLEDGED`, `UNDER_REVIEW`, `ADDITIONAL_INFORMATION_REQUIRED`, `ACCEPTED`, `PARTIALLY_ACCEPTED`, `REJECTED`, `WITHDRAWN`, `RESOLVED`, `CLOSED`, and `UNKNOWN`. Requires `officialCaseReference` before transitioning to `SUBMITTED`, and does not suspend collection unless `suspensionConfirmedByAuthority: true`.

## 3. Cross-Module Interfaces
- `PropertyRegistryTaxAdapter`: Verifies canonical property existence.
- `LegalRegulatoryTaxAdapter`: Verifies jurisdiction tax rules and official source references.
- `PaymentsTaxAdapter`: Verifies authoritative payment confirmations and receipts.
- `MediaTaxAdapter`: Verifies tax document media references without duplicating file storage.
- `NotificationsTaxAdapter`: Dispatches deadline reminders and reports actual delivery confirmation.

## 4. Synthetic Example (Test Fixture Only)
```ts
// SYNTHETIC TEST EXAMPLE ONLY — NOT AN OFFICIAL TAX RECORD
const facade = createPropertyTaxModuleFacade();
const authority = await facade.authorityAndAssessmentService.registerTaxAuthorityReference(adminActor, {
  authorityName: 'Tehran District 3 Municipal Revenue Office (Synthetic Fixture)',
  authorityType: 'MUNICIPAL_GOVERNMENT',
  jurisdiction: { citySlug: 'tehran', districtCode: '03', legalRegulatorySourceRef: 'rule-mun-tax-1404' },
  officialSourceReference: 'rule-mun-tax-1404',
  requestedVerificationStatus: 'VERIFIED_AUTHORITY',
  sourceProvenance: 'SYNTHETIC_TEST_FIXTURE',
  isSyntheticTestFixture: true,
});
```
