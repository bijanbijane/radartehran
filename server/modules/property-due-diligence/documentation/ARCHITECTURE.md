# Property Due Diligence & Verification Backend Module (`server/modules/property-due-diligence/`)

## 1. Module Purpose & Boundaries
The **Property Due Diligence & Verification** module enables users and authorized reviewers to evaluate the completeness, consistency, provenance, and verification status of documents, obligations, and physical/ownership attributes associated with a canonical property prior to a purchase, sale, rental, lease renewal, investment assessment, or property handover.

### Strict Non-Ownership & Legal Boundaries
- **No Competing Property Registry**: Consumes canonical property references via `DueDiligencePropertyRegistryReadAdapter`.
- **No Direct Binary Storage**: Stores only verified media references (`mediaDocumentRefId`, `mediaSha256Checksum`) via `DueDiligenceMediaReadAdapter`.
- **No Legal Title Certification**: Ownership and authority reviews evaluate documentary consistency and never replace official property registries or notaries.
- **No Payment Processing or Debt Fabrication**: Financial obligation checks distinguish `VERIFIED_OUTSTANDING_OBLIGATION`, `REPORTED_BUT_UNVERIFIED_OBLIGATION`, `HISTORICAL_OBLIGATION`, `RESOLVED_OBLIGATION_WITH_EVIDENCE`, and `UNKNOWN_FINANCIAL_STATUS`. Missing debt evidence never implies zero debt.
- **AI/OCR Isolation**: Untrusted AI/OCR extractions (`UntrustedAiExtractionEnvelope`) are marked `isProofOfAuthenticity: false` and `requiresHumanVerification: true` and can never transition evidence to `VERIFIED`.

## 2. Verification State Machine
Evidence items start at `NOT_SUBMITTED` and follow explicit state transitions (`ALLOWED_EVIDENCE_STATE_TRANSITIONS`):
- `NOT_SUBMITTED` -> `SUBMITTED`
- `SUBMITTED` -> `PENDING_REVIEW` | `EXPIRED` | `REQUIRES_ADDITIONAL_EVIDENCE`
- `PENDING_REVIEW` -> `VERIFIED` | `REJECTED` | `EXPIRED` | `UNVERIFIABLE` | `REQUIRES_ADDITIONAL_EVIDENCE`
- `REQUIRES_ADDITIONAL_EVIDENCE` -> `SUBMITTED` | `PENDING_REVIEW` | `REJECTED` | `EXPIRED`
- `VERIFIED` -> `EXPIRED` | `REQUIRES_ADDITIONAL_EVIDENCE`

Transitions to `VERIFIED`, `REJECTED`, `UNVERIFIABLE`, or `REQUIRES_ADDITIONAL_EVIDENCE` require an authorized reviewer (`isAuthorizedReviewer = true`) and a human or official verification method (`AUTHORIZED_HUMAN_REVIEW` or `OFFICIAL_SOURCE_CONFIRMATION`). Expired documents cannot be marked `VERIFIED`.

## 3. Persistence Collections Owned by This Module
- `dd_cases/{caseId}`
- `dd_evidence/{evidenceId}` + `dd_case_evidence_index/{caseId}`
- `dd_ownership_reviews/{reviewId}`
- `dd_consistency_reports/{reportId}`
- `dd_obligation_checks/{obligationCheckId}` + `dd_case_obligations_index/{caseId}`
- `dd_findings/{findingId}` + `dd_case_findings_index/{caseId}`
- `dd_assessments/{assessmentId}` + `dd_case_assessments_index/{caseId}`
- `dd_case_activities/{activityId}` + `dd_case_activities_index/{caseId}`

## 4. Required Integration Work (For Integration Lead)
Mount the 14 routes specified in `PROPERTY_DUE_DILIGENCE_ROUTE_REGISTRATION_SPEC` (`server/modules/property-due-diligence/index.ts`) and wire adapters for `propertyRegistry`, `media`, `inspectionsAndManagement`, and `trustAndSafety`.
