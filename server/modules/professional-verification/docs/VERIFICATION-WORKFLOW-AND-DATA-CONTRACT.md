# Verification Workflow and Data Contract (`Employee 12 — Professional Identity and Credential Verification Backend`)

## 1. Domain Scope & Ownership
- **Canonical Path**: `server/modules/professional-verification/`
- **Supported Regulated Entities (`VerifiedEntityType`)**:
  - `real_estate_agency` (آژانس / دفتر مشاوران املاک)
  - `real_estate_agent` (مشاور و کارشناس معاملات ملکی)
  - `construction_company` (شرکت ساختمانی و انبوه‌ساز)
  - `architect` (معمار / مهندس معمار)
  - `engineer` (مهندس نظام مهندسی ساختمان)
  - `contractor` (پیمانکار اجرایی)
  - `regulated_certified_provider` (سایر ارائه‌دهندگان دارای مجوز رسمی مانند کارشناس رسمی دادگستری)

---

## 2. Explicit Verification Lifecycle States (`VerificationLifecycleState`)

Every credential (`ProfessionalLicenseRecord`) and profile aggregate (`overallVerificationState`) follows an explicit 8-state machine:

| State | Meaning | Public Visibility |
| :--- | :--- | :--- |
| `unsubmitted` | Draft created with a license number; no supporting documents submitted yet. | Not verified (`isCurrentlyVerified: false`) |
| `pending` | Supporting private documents uploaded and submitted for human review. | Not verified (`isCurrentlyVerified: false`) |
| `under_review` | Claimed by an authorized reviewer (`reviewer.uid !== ownerUid`). | Not verified (`isCurrentlyVerified: false`) |
| `verified` | Approved by an authorized reviewer with explicit verification method (`manual_document_review` or `official_authority_registry_cross_check`) and non-expired validity. | Verified (`isCurrentlyVerified: true`) |
| `rejected` | Rejected by reviewer due to invalid/unverifiable documents or mismatch. | Not verified (`isCurrentlyVerified: false`) |
| `expired` | Previously verified or suspended credential whose `expiresAtIso` has passed. | Not verified (`isCurrentlyVerified: false`) |
| `suspended` | Temporarily suspended by compliance/reviewer pending investigation. | Not verified (`isCurrentlyVerified: false`) |
| `revoked` | Terminal disciplinary revocation of a credential. | Not verified (`isCurrentlyVerified: false`) |

### Allowed State Transitions
- `unsubmitted` $\rightarrow$ `['pending']`
- `pending` $\rightarrow$ `['under_review', 'rejected']`
- `under_review` $\rightarrow$ `['verified', 'rejected']`
- `verified` $\rightarrow$ `['expired', 'revoked', 'suspended']`
- `rejected` $\rightarrow$ `['pending']` (upon fresh evidence submission)
- `expired` $\rightarrow$ `['pending', 'revoked']`
- `suspended` $\rightarrow$ `['verified', 'revoked', 'expired']`
- `revoked` $\rightarrow$ `[]` (terminal state for that credential record)

---

## 3. Core Anti-Plausibility & Security Invariants

1. **License Number Is Not Proof of Validity**:
   - Calling `createCredentialDraft` or `submitCredential` with a formatted license number never sets `status: 'verified'`.
2. **Uploaded Document Is Not Independently Authoritative**:
   - Uploading private document scans transitions a record only to `pending` (`verificationMethod: 'unverified_submission'`).
3. **Explicit Verification Method Required**:
   - An authorized reviewer cannot approve a credential with `verificationMethod: 'unverified_submission'`. They must explicitly record either:
     - `manual_document_review` (بازبینی دستی اسناد بارگذاری‌شده توسط بازرس)
     - `official_authority_registry_cross_check` (تطبیق دستی بازرس با درگاه رسمی مرجع صادرکننده همراه با لینک HTTPS معتبر یا کد پیگیری استعلام)
4. **Separation of Duties (SoD)**:
   - Even if an account holds reviewer permissions, `authorizePrincipalForVerificationAction` blocks `principal.uid === resourceOwnerUid` from reviewing, approving, or reinstating their own credential.
5. **Private Evidence Protection**:
   - `PrivateDocumentEvidenceItem` enforces `accessClassification: 'restricted_reviewer_only'`, rejects public HTTP URLs as storage keys, verifies 64-hex SHA-256 digests, and blocks unauthorized access via `readProtectedEvidenceForPrincipal`.
6. **Minimum-Disclosure Public Summaries**:
   - `PublicProfessionalVerificationSummary` and `PublicOrganizationVerificationSummary` expose only masked license identifiers (`14***54`), authority names, verification method labels, and validated official portal links—never raw storage keys, SHA-256 digests, reviewer UIDs, or internal rejection notes.
