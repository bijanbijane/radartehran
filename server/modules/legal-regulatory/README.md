# Legal & Regulatory Intelligence Backend Module (`server/modules/legal-regulatory/`)

## 1. Module Responsibilities

The **Legal & Regulatory Intelligence Backend Module** (`EMPLOYEE 39`) provides a structured, versioned, provenance-tracked backend domain for Iranian real estate and urban development laws, municipal bylaws, detailed master plans (*Tarh-e Tafsili*), national building code chapters (*Mabhas*), registration directives (*Sabt*), property transfer obligations, and compliance requirements.

Core responsibilities:
1. **Legal & Regulatory Source Registry**: Tracks official titles, issuing authorities, canonical geographic jurisdiction scopes, source reliability tiers (`PRIMARY_OFFICIAL_STATUTE`, `OFFICIAL_BYLAW_OR_DIRECTIVE`, `SECONDARY_COMMENTARY`, `UNVERIFIED_EXTERNAL_REFERENCE`), verification lifecycle states (`VERIFIED`, `PENDING_VERIFICATION`, `UNVERIFIED`, `SUPERSEDED`, `REPEALED`), publication/effective/expiration/repeal dates, official reference numbers, and reviewer provenance.
2. **Regulatory Documents & Hierarchical Provisions**: Models regulatory documents and hierarchical provisions (`CHAPTER`, `ARTICLE`, `CLAUSE`, `SUBCLAUSE`, `NOTE_TABSAREH`) while strictly separating `originalTextVerbatim`, `verifiedExcerptText`, `humanVerifiedInterpretation`, and `nonAuthoritativeAiSummary`.
3. **Jurisdiction & Geographic Applicability**: Evaluates national (`IR`), provincial (`ProvinceId`), municipal/city (`SupportedCityId`), district (`districtNumber`), neighborhood (`neighborhoodId`), and designated zone (`designatedZoneCode`) applicability by consuming canonical geography identifiers via `GeographyLookupAdapter` (`/server/modules/geography`).
4. **4-State Regulatory Applicability Engine**: Evaluates property/context characteristics without turning missing data into definitive legal conclusions:
   - `CONFIRMED_APPLICABLE`
   - `POTENTIALLY_APPLICABLE_NEEDS_INFO`
   - `UNKNOWN_APPLICABILITY_MISSING_DATA`
   - `NOT_APPLICABLE_VERIFIED_EXCLUSION`
5. **Immutable Version History & Regulatory Changes**: Records enactments, amendments, repeals, temporary provisions, extensions, superseding replacements, and provision conflicts (`RegulatoryProvisionConflictRecord`). Supports point-in-time historical reconstruction (`getProvisionVersionAsOfDate(provisionId, asOfDateIso)`).
6. **Property Regulatory Profile Read Model**: Builds a comprehensive read-oriented profile (`buildPropertyRegulatoryProfile`) combining land-use restrictions, construction/density rules, building safety rules, transaction obligations, compliance requirements, open conflicts, and incomplete-data warnings.
7. **Compliance Requirements Catalog**: Maintains structured statutory/regulatory requirements while enforcing `complianceEstablished: false`—proving that the existence of a legal requirement never constitutes proof that a specific property satisfies it.
8. **Structured Search & Cursor Pagination**: Filters provisions by keyword, issuing authority, jurisdiction hierarchy, source/document category, publication date range, effective `asOfDateIso`, property category, and lifecycle status with bounded cursor pagination (`limit` clamped `1..100`, default `25`).

---

## 2. Domain Entities & Data Ownership

This module owns the following Firestore collections exclusively:

| Collection Name | Entity Type | Primary Key | Versioning Strategy |
| :--- | :--- | :--- | :--- |
| `legal_regulatory_sources_v1` | `RegulatorySourceRecord` | `reg_src_*` | Optimistic CAS (`version`) |
| `legal_regulatory_documents_v1` | `RegulatoryDocumentRecord` | `reg_doc_*` | Optimistic CAS (`version`) |
| `legal_regulatory_provisions_v1` | `RegulatoryProvisionRecord` | `reg_prov_*` | Optimistic CAS (`version`) + immutable `versionHistory[]` |
| `legal_applicability_rules_v1` | `RegulatoryApplicabilityRuleRecord` | `reg_rule_*` | Optimistic CAS (`version`) |
| `legal_change_records_v1` | `RegulatoryChangeRecord` | `reg_chg_*` | Append-only immutable |
| `legal_conflict_records_v1` | `RegulatoryProvisionConflictRecord` | `reg_conf_*` | Optimistic CAS (`version`) |
| `legal_compliance_requirements_v1` | `ComplianceRequirementRecord` | `comp_req_*` | Optimistic CAS (`version`) |
| `legal_ai_suggestions_v1` | `NonAuthoritativeAiSummaryRecord` | `ai_sum_*` | Append-only (`isAuthoritative: false`) |
| `legal_regulatory_audit_v1` | `LegalRegulatoryAuditRecord` | `audit_*` | Append-only audit trail |
| `legal_regulatory_idempotency_v1` | `IdempotencyRecord` | `${op}_${actor}_${key}` | Idempotency ledger |

---

## 3. Authorization & Public vs. Restricted Access Rules

- **Administrative & Reviewer Mutations**: Creating, amending, repealing, or verifying sources, documents, provisions, applicability rules, conflicts, compliance requirements, or AI summaries requires `role: 'REGULATORY_ADMIN' | 'LEGAL_REVIEWER'` (`assertAdminOrReviewerActor`). Unauthenticated callers receive `401 UNAUTHENTICATED`; authenticated non-admin callers receive `403 FORBIDDEN`.
- **Public View Redaction**: Public and standard user reads pass through `toPublicRegulatorySource`, `toPublicRegulatoryProvision`, and `toPublicComplianceRequirement`, which strip `internalReviewerNotes` and `restrictedAuditMetadata`.
- **Unverified Draft Isolation**: Unverified sources and provisions (`verificationStatus === 'UNVERIFIED'` or `lifecycleStatus === 'DRAFT_UNVERIFIED'`) are excluded from public searches and rejected on direct public reads (`403 FORBIDDEN`).

---

## 4. Synthetic Test Fixtures Notice

All statutory references, article numbers, and URLs used in `__tests__/legalRegulatory.test.ts` are marked with `isSyntheticTestFixture: true` in their provenance metadata and represent controlled test fixtures for verifying domain rules, versioning, and applicability logic.
