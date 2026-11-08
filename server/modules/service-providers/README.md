# Real Estate Professionals & Service Providers Backend Module

Exclusive ownership: `server/modules/service-providers/`

## 1. Core Purpose

The Real Estate Professionals & Service Providers backend module powers the marketplace and directory for real estate agents, brokers, engineers, architects, contractors, interior designers, property managers, and legal consultants. It handles individual profiles, business organizations, credential verification workflows, service offerings, customer service requests, quotations, and verified-engagement reviews without duplicating identity, payments, or geographic hierarchies.

## 2. Data Ownership Boundaries

### This Module Owns:
- Individual professional profiles (`IndividualProviderProfile`)
- Provider organization records (`ProviderOrganization`)
- Organization memberships & roles (`OrganizationMembership`)
- Professional categories & specialties
- Service catalog offerings (`ProviderServiceOffering`)
- Service-area coverage declarations (`ServiceAreaDeclaration`)
- Credential records & verification states (`ProviderCredentialRecord`)
- Customer service requests (`CustomerServiceRequest`)
- Quotation proposals & versioned updates (`ProviderQuotationRecord`)
- Provider selection & referral records
- Customer feedback & evidence-aware reviews (`ProviderReviewRecord`)
- Directory search indexes & filtering
- Provider domain events (`ProviderDomainEvent`)

### This Module Does NOT Own:
- **User Identity & Authentication**: Obtained via verified principal tokens (`Core` module). Never trusts client-supplied UIDs.
- **Geographic Data**: Canonical references consumed via `GeographyValidationAdapter`.
- **Media & Document Binaries**: Consumed via `MediaStorageReferenceAdapter`.
- **Notifications Delivery**: Dispatched via `NotificationsOutboxAdapter`.
- **Payments & Escrow**: Does not collect money or process invoices.
- **Trust & Safety Enforcement**: Reports suspicious activity via `TrustAndSafetyProviderAdapter`.

## 3. Key Domain Rules & Invariants

1. **Self-Review Prevention**:
   - Providers cannot review their own profiles (`CANNOT_REVIEW_OWN_PROFILE`).
2. **Independent Credential Verification**:
   - Providers cannot verify their own credentials (`CANNOT_VERIFY_OWN_CREDENTIAL`). Verification requires an independent reviewer.
3. **Quotation Versioning**:
   - Submitted quotations cannot be modified in-place; modifications create a versioned increment (v1 -> v2) while marking the previous version as `updated`.
4. **Verified Engagement Reviews**:
   - Reviews are classified as `isVerifiedEngagement: true` only when linked to an authoritative customer service request where the provider was selected.
