# Property Permits & Regulatory Approvals Backend (`server/modules/property-permits`)

## 1. Domain Overview

The **Property Permits & Regulatory Approvals Backend** manages property-related permit applications, official authority decisions, issued permit records, permit conditions, amendments/extensions/renewals, suspensions/revocations, official inspections, regulatory fee assessments/receipts, and deadline/expiration workflows.

### Non-Negotiable Epistemic & Authority Boundaries
1. **No Impersonation of Public Authorities**: The module records applications and official decisions; it never issues government permits itself.
2. **Application vs. Issued Permit Separation**: `PermitApplicationRecord` (`isIssuedPermitRecord: false`) is strictly distinct from `PermitRecord` (`isIssuedPermitRecord: true`). Submitting an application or uploading all checklist documents never converts an application into an approved permit.
3. **Explicit Authority Empowerment & Jurisdiction**: An `IssuingAuthorityRecord` is never assumed to be empowered to issue a permit category merely from its organization name. It must explicitly list the `PermitCategoryCode` in `authorizedPermitCategories` and match the subject property's canonical geography (`citySlug`, optional `districtCodes` / `neighborhoodIdsOrSlugs`).
4. **Six-Dimensional Permit Status Model**: Every `PermitRecord` evaluates and exposes 6 separate dimensions:
   - `internalWorkflowStatus`
   - `officialAuthorityDecisionStatus`
   - `permitValidityStatus`
   - `sourceVerificationStatus`
   - `evidenceCompleteness`
   - `conditionFulfillmentStatus`
5. **No Validity Inference from Unverified PDFs or Future Dates Alone**: An uploaded PDF with `UNVERIFIED_CLAIM` or `DOCUMENTED_UNVERIFIED` or a future `expirationDateIso` never yields `VALID_VERIFIED_ACTIVE`.
6. **Amendment / Renewal Immutability Until Approved**: Submitting an amendment, extension, or renewal request leaves the original `PermitRecord`'s approved scope, expiration date, and version untouched until an authorized officer records an official authority decision.

---

## 2. Module Structure

| File | Responsibility |
| --- | --- |
| `types.ts` | Canonical domain types, 5 permit taxonomy groups, 31 permit category codes, 6-dimensional status model, error codes (`PermitError`). |
| `validationAndAuthz.ts` | Application workflow transition matrix, RBAC enforcement, applicant standing checks, authority jurisdiction/category validation, and 6-dimensional validity evaluator. |
| `adapters.ts` | Module-local adapters for Geography (`CanonicalPermitsGeographyAdapter`), Property & Ownership standing (`PermitsPropertyAndOwnershipAdapter`), Legal & Regulatory rules (`PermitsLegalRegulatoryAdapter`), Payment/Financial verification (`PermitsPaymentReferenceAdapter`), and Notifications (`PermitsNotificationsAdapter`). |
| `store.ts` | `PropertyPermitsStore` interface and deterministic `InMemoryPropertyPermitsStore`. |
| `firestoreStore.ts` | Production `FirestorePropertyPermitsStore` backed by Firebase Admin Firestore. |
| `authorityAndApplicationService.ts` | Issuing authority registration and full permit application workflow lifecycle. |
| `permitAndAmendmentService.ts` | Issued permit registry, 6-dimensional validity evaluation, permit conditions, amendments/renewals, and suspensions/revocations. |
| `inspectionsFeesAndDeadlinesService.ts` | Official inspections, regulatory fee assessments/payment references, deadline/expiration tracking, and property/project permit profiles. |
| `index.ts` | Barrel exports and `createPropertyPermitsModuleFacade()`. |
| `__tests__/propertyPermits.test.ts` | 30-scenario automated verification suite. |
