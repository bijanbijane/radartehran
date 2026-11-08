# Technical Handoff Report: Property Due Diligence & Inspection Intelligence Backend (`server/modules/property-due-diligence/`)

## 1. Exclusive Ownership & Isolation
- **Owned Directory**: `server/modules/property-due-diligence/`
- **Target Branch**: `feature/backend-property-due-diligence`
- **External Modifications**: **Zero** shared files, frontend components, `server.ts`, global route catalogs, or other employee modules were modified.

---

## 2. Created Files Inventory
| File | Purpose |
| :--- | :--- |
| `types.ts` | Domain types for assessments, scopes, workstreams, versioned checklist templates, responses, findings, media evidence, legal/financial/geo reviews, technical measurements, risk registers, remediations, reports, quality controls, and events |
| `validationAndAuthz.ts` | State machine transitions, multi-reviewer RBAC matrix (`WORKSTREAM_ROLE_AUTHORIZATION`), workstream ownership guards, separation-of-duties checks, and evidence privacy enforcement |
| `adapters.ts` | Explicit integration contracts for Property Registry, Media, Geography/Environmental, Service Providers, Appointments, Event Sink, Optional AI Assistant boundary, and Account Lifecycle |
| `store.ts` | `DueDiligenceStore` interface and `DurableDueDiligenceStore` with optimistic concurrency (`expectedVersion`), idempotency cache, versioned template storage, and cursor pagination |
| `assessmentAndChecklistService.ts` | Assessment lifecycle, scope versioning, reviewer assignment with registry qualification lookup, workstream execution, and versioned checklist template/response engine |
| `findingsEvidenceAndReviewsService.ts` | Property condition findings, media evidence provenance & locking, legal/ownership copy review, financial due-diligence records, geographic/environmental observations, and technical measurements |
| `riskRemediationAndReportingService.ts` | Qualitative risk register, remediation recommendation & verification workflow, reviewer disagreement & coordinator resolution, quality control evaluation, and versioned report publication/supersession |
| `facadeAndRoutes.ts` | `PropertyDueDiligenceFacade`, Account Lifecycle export/deletion handlers, and self-contained route dispatchers (`createPropertyDueDiligenceRouter`) |
| `index.ts` | Module barrel export |
| `__tests__/propertyDueDiligence.test.ts` | Comprehensive automated test suite covering all 8 functional & security domains |
| `HANDOFF.md` | Technical architecture and integration handoff documentation |

---

## 3. Ownership Boundaries (Assessment, Workstream, and Reviewer)
- **Assessments**: Owned by `property-due-diligence`, referencing canonical properties (`propertyReference`), optional listings/transactions, and appointment references without duplicating property registry data.
- **Workstreams**: Each workstream (`structural_review`, `electrical_review`, `plumbing_review`, `legal_document_checklist`, `financial_document_review`, etc.) is assigned to a specific specialist reviewer and role. `assertCanModifyWorkstream` prevents one specialist from silently overwriting another specialist's workstream (`WORKSTREAM_OWNERSHIP_MISMATCH`).
- **Reviewer Qualifications**: Reviewer assignments query `ServiceProvidersQualificationAdapter`. `qualificationVerifiedByRegistry` is set to `true` **only** when confirmed by the authoritative provider registry.
- **Disagreements**: Conflicting specialist observations are recorded via `ReviewerDisagreementRecord` (`open_conflict`) and block report publication until resolved by an `assessment_coordinator` (`resolved_by_coordinator`).

---

## 4. Checklist Template Versioning
- Templates are stored by composite key `${templateId}@v${version}`.
- When a workstream is created, it pins both `checklistTemplateId` and `checklistTemplateVersion`.
- Publishing a new template version (`v2`, `v3`) increments the version number without altering historical assessments or workstreams bound to `v1`.
- Supports conditional items (`conditionalOnItemId` / `conditionalExpectedValue`), required vs. optional items, and requires explicit reasons for `not_applicable`, `not_inspected`, `evidence_unavailable`, or `deficiency_noted`.

---

## 5. Finding & Severity Classifications
- Qualitative severities (`informational`, `minor`, `moderate`, `major`, `critical`, `undetermined`) governed by `severityCriteriaVersion: '2026.1-qualitative'`. No arbitrary numerical composite risk scores are invented.
- Distinguishes `observed_damage`, `suspected_damage`, `reviewer_opinion`, and `verified_technical_defect`.
- `major` and `critical` findings require either supporting `evidenceIds` or an explicit `evidenceUnavailableExplanation`.
- Historical findings are never deleted when resolved; their `remediationStatus` transitions to `verified_resolved` and their `history` array records the reassessment.

---

## 6. Evidence Provenance & Privacy Rules
- Stores `mediaReferenceId` pointers validated against `MediaEvidenceReferenceAdapter`; never stores duplicate media binaries.
- Distinguishes `uploaded_unverified` from `independently_verified`, `rejected` (which requires a rejection reason), and `verification_unavailable`.
- Enforces separation of duties: a user who uploads `user_provided` evidence cannot self-approve `independently_verified` (`SEPARATION_OF_DUTIES_VIOLATION`).
- Enforces privacy tiers (`public_authorized`, `assessment_participants_only`, `confidential_legal_financial`). Confidential legal/financial evidence is restricted to the requester, coordinator, document reviewer, financial reviewer, and final report reviewer.
- Evidence referenced in a published report version is added to `lockedInReportVersions` and cannot be silently invalidated or replaced.

---

## 7. Legal-Document Review Limitations
- Every `DocumentReviewRecord` sets `isCopyNotOfficialRegistry: true`.
- Prohibits setting `reviewStatus: 'independently_verified'` unless `verificationMethod === 'external_authorized_registry_adapter'` and a non-empty `externalVerificationReference` is supplied (`UNSUPPORTED_OWNERSHIP_VERIFICATION`).
- Supports `verification_unavailable` when no authoritative government registry adapter is connected. Never issues legal opinions or determines legal ownership.

---

## 8. Measurements & Remediation Workflows
- **Technical Measurements**: Preserves `originalValue` and `originalUnit` without destructive unit conversion. Distinguishes `instrument_reading` from `visual_estimate`. Sets `isCertifiedMeasurement: true` only when `certificationEvidenceId` is present on an `instrument_reading`.
- **Remediation Tracking**: Distinguishes reported completion (`completed_awaiting_review`) from reviewer-confirmed resolution (`verified_resolved`). Transitioning to `verified_resolved` requires an assigned reviewer and non-empty `completionEvidenceIds` (`COMPLETION_EVIDENCE_REQUIRED`). Links external `externalPropertyManagementRef` or `externalDevelopmentProjectRef` without executing maintenance work orders directly.

---

## 9. Report Versioning, Publication, & Quality Controls
- **Quality Controls (`evaluateAssessmentQualityControls`)**: Computes `requiredChecklistCompletionRatio`, `missingRequiredEvidenceCount`, `incompleteMandatoryWorkstreams`, `unreviewedSuppliedDocumentsCount`, `openReviewerDisagreementsCount`, and `staleEvidenceIds`. Explicitly distinguishes `isScopeFullyCompleted` from `isFullyVerifiedAssessment` and never converts completeness into a safety score.
- **Immutable Report Versions**: Revisions create a new `reportVersion` (`v1`, `v2`, ...). Publishing `v2` automatically transitions `v1` to `superseded` (`supersededByVersion: 2`) and emits `due_diligence.report.superseded`.
- **Prominent Disclaimers & Uncertainties**: Every report includes `incompleteWorkstreamIds`, `outstandingUncertainties`, and `mandatoryLegalAndTechnicalDisclaimer`.

---

## 10. Upstream Module Dependencies & Integration Instructions
- **Required Adapter Contracts** (defined in `adapters.ts`):
  - `PropertyRegistryReferenceAdapter` (Property Registry module)
  - `MediaEvidenceReferenceAdapter` (Media module)
  - `GeographyAndEnvironmentalReferenceAdapter` (Geography / Urban Intelligence / Data Ingestion modules)
  - `ServiceProvidersQualificationAdapter` (Service Providers / Professional Verification module)
  - `AppointmentsReferenceAdapter` (Appointments module)
  - `DueDiligenceEventSink` (Notifications / Domain Event pipeline)
  - `OptionalAiReviewAssistantAdapter` (Optional AI gateway; unconfigured by default, requires human confirmation for material findings)
  - `DueDiligenceAccountLifecycleAdapter` (Account Lifecycle module)
- **Route Registration for Integration Lead**:
  Mount `createPropertyDueDiligenceRouter(facade)` in `server.ts` under `/api/v1/due-diligence/*`.
