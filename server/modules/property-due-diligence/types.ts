/**
 * @file server/modules/property-due-diligence/types.ts
 * @description Domain Models, Value Objects, Enums, and Contracts for Property Due Diligence & Inspection Intelligence.
 */

export type AssessmentType =
  | 'purchase_due_diligence'
  | 'rental_due_diligence'
  | 'sale_preparation'
  | 'investment_due_diligence'
  | 'technical_inspection';

export type AssessmentStatus =
  | 'draft'
  | 'requested'
  | 'awaiting_assignment'
  | 'assigned'
  | 'in_progress'
  | 'awaiting_evidence'
  | 'under_review'
  | 'findings_recorded'
  | 'awaiting_corrections'
  | 'completed'
  | 'cancelled'
  | 'archived';

export type AssessmentPriority = 'low' | 'normal' | 'high' | 'urgent';

export type WorkstreamType =
  | 'technical_inspection'
  | 'structural_review'
  | 'electrical_review'
  | 'plumbing_review'
  | 'mechanical_system_review'
  | 'interior_condition_review'
  | 'exterior_condition_review'
  | 'legal_document_checklist'
  | 'financial_document_review'
  | 'geographic_review'
  | 'environmental_review'
  | 'regulatory_document_checklist';

export type WorkstreamStatus =
  | 'pending'
  | 'assigned'
  | 'in_progress'
  | 'partially_completed'
  | 'unavailable'
  | 'completed';

export type ReviewerRole =
  | 'assessment_coordinator'
  | 'technical_inspector'
  | 'structural_specialist'
  | 'electrical_specialist'
  | 'mechanical_specialist'
  | 'document_reviewer'
  | 'financial_reviewer'
  | 'environmental_reviewer'
  | 'final_report_reviewer';

export interface AssignedReviewer {
  reviewerUid: string;
  role: ReviewerRole;
  serviceProviderRef?: string;
  qualificationVerifiedByRegistry: boolean;
  assignedAtIso: string;
  assignedByUid: string;
}

export interface AssessmentScope {
  includedWorkstreams: WorkstreamType[];
  objectives: string[];
  limitationsAndExclusions: string[];
  agreedAtIso: string;
  version: number;
}

export interface DueDiligenceAssessment {
  id: string;
  assessmentType: AssessmentType;
  propertyReference: string;
  listingReference?: string;
  transactionReference?: string;
  appointmentReferences: string[];
  requestingUserUid: string;
  requestingOrganizationId?: string;
  assignedReviewers: AssignedReviewer[];
  scope: AssessmentScope;
  status: AssessmentStatus;
  priority: AssessmentPriority;
  plannedStartDateIso?: string;
  plannedCompletionDateIso?: string;
  actualCompletionDateIso?: string;
  reportingCurrency?: 'IRT' | 'IRR' | 'USD' | 'EUR';
  createdAtIso: string;
  updatedAtIso: string;
  version: number;
}

export interface AssessmentWorkstream {
  id: string;
  assessmentId: string;
  workstreamType: WorkstreamType;
  description: string;
  assignedReviewerUid?: string;
  assignedReviewerRole?: ReviewerRole;
  checklistTemplateId?: string;
  checklistTemplateVersion?: number;
  isMandatory: boolean;
  status: WorkstreamStatus;
  unavailableReason?: string;
  startedAtIso?: string;
  completedAtIso?: string;
  findingsCount: number;
  evidenceCompletenessState: 'complete' | 'partial' | 'missing_required' | 'not_applicable';
  reviewOutcome?: 'reviewed_no_material_observations' | 'findings_identified' | 'inconclusive_missing_evidence' | 'not_assessed';
  updatedAtIso: string;
  version: number;
}

export type ChecklistResponseType =
  | 'yes_no'
  | 'pass_fail'
  | 'observed_not_observed'
  | 'numeric_measurement'
  | 'text_observation'
  | 'selected_option'
  | 'not_applicable'
  | 'not_inspected'
  | 'evidence_unavailable';

export interface ChecklistItemDefinition {
  itemId: string;
  section: 'structural' | 'electrical' | 'plumbing' | 'building_envelope' | 'interior' | 'documents' | 'hvac' | 'safety';
  title: string;
  instructions: string;
  required: boolean;
  requiresEvidenceOnNegative: boolean;
  allowedResponseTypes: ChecklistResponseType[];
  expectedUnit?: string;
  conditionalOnItemId?: string;
  conditionalExpectedValue?: string | boolean;
}

export interface ChecklistTemplate {
  id: string;
  version: number;
  name: string;
  assessmentCategory: AssessmentType;
  applicablePropertyTypes: string[];
  applicableBuildingCategories: string[];
  items: ChecklistItemDefinition[];
  activeStatus: 'draft' | 'published' | 'deprecated';
  publishedAtIso?: string;
  createdAtIso: string;
}

export interface ChecklistResponseHistoryEntry {
  previousValue: unknown;
  previousClassification: string;
  correctedByUid: string;
  correctionReason: string;
  correctedAtIso: string;
}

export interface ChecklistResponseRecord {
  id: string;
  assessmentId: string;
  workstreamId: string;
  templateId: string;
  templateVersion: number;
  itemId: string;
  responseType: ChecklistResponseType;
  value: string | number | boolean | null;
  unit?: string;
  isSubjectiveObservation: boolean;
  reasonIfIncompleteOrNegative?: string;
  reviewerUid: string;
  observationTimestampIso: string;
  evidenceIds: string[];
  reviewerNotes?: string;
  classification: 'satisfactory' | 'deficiency_noted' | 'further_evaluation_needed' | 'not_applicable' | 'not_inspected' | 'evidence_missing';
  reviewStatus: 'recorded' | 'reviewed_locked' | 'corrected';
  history: ChecklistResponseHistoryEntry[];
  version: number;
}

export type FindingSeverity =
  | 'informational'
  | 'minor'
  | 'moderate'
  | 'major'
  | 'critical'
  | 'undetermined';

export type ObservationBasis =
  | 'observed_damage'
  | 'suspected_damage'
  | 'reviewer_opinion'
  | 'verified_technical_defect';

export interface PropertyFinding {
  id: string;
  assessmentId: string;
  workstreamId: string;
  checklistItemId?: string;
  category: string;
  title: string;
  description: string;
  locationWithinProperty: string;
  observedCondition: string;
  observationBasis: ObservationBasis;
  observationDateIso: string;
  reportingReviewerUid: string;
  evidenceIds: string[];
  evidenceUnavailableExplanation?: string;
  severity: FindingSeverity;
  severityCriteriaVersion: string;
  reviewState: 'draft' | 'confirmed' | 'disputed' | 'reassessed';
  recommendedNextStep: string;
  remediationStatus: 'none' | 'recommended' | 'in_progress' | 'verified_resolved' | 'unresolved';
  authoredByAiSuggestion: boolean;
  humanConfirmedByUid?: string;
  history: Array<{
    changedAtIso: string;
    changedByUid: string;
    summary: string;
  }>;
  createdAtIso: string;
  updatedAtIso: string;
  version: number;
}

export type EvidenceType =
  | 'inspection_photograph'
  | 'video'
  | 'technical_drawing'
  | 'building_plan'
  | 'document_scan'
  | 'maintenance_record'
  | 'measurement_report'
  | 'specialist_report'
  | 'official_document_copy'
  | 'other';

export type EvidencePrivacyClassification =
  | 'public_authorized'
  | 'assessment_participants_only'
  | 'confidential_legal_financial';

export interface AssessmentEvidenceRecord {
  id: string;
  assessmentId: string;
  workstreamId?: string;
  findingId?: string;
  mediaReferenceId: string;
  evidenceType: EvidenceType;
  sourceClassification: 'user_provided' | 'inspector_captured' | 'specialist_supplied' | 'external_registry_reference';
  submittedByUid: string;
  captureOrDocumentDateIso?: string;
  submittedAtIso: string;
  description: string;
  verificationStatus: 'uploaded_unverified' | 'independently_verified' | 'rejected' | 'verification_unavailable';
  rejectionExplanation?: string;
  verifiedByUid?: string;
  verifiedAtIso?: string;
  privacyClassification: EvidencePrivacyClassification;
  lockedInReportVersions: number[];
  reviewHistory: Array<{
    status: string;
    actorUid: string;
    note?: string;
    timestampIso: string;
  }>;
}

export type DocumentCategory =
  | 'ownership_document_copy'
  | 'title_registration_reference'
  | 'power_of_attorney_copy'
  | 'building_permit_copy'
  | 'completion_certificate_copy'
  | 'court_or_administrative_reference'
  | 'lease_document_reference'
  | 'co_ownership_documentation'
  | 'other_transaction_document';

export type DocumentReviewStatus =
  | 'not_requested'
  | 'requested'
  | 'not_supplied'
  | 'supplied'
  | 'under_review'
  | 'information_incomplete'
  | 'inconsistency_identified'
  | 'independently_verified'
  | 'verification_unavailable'
  | 'rejected'
  | 'expired';

export interface DocumentReviewRecord {
  id: string;
  assessmentId: string;
  documentCategory: DocumentCategory;
  mediaReferenceId?: string;
  submittedByUid?: string;
  documentDateIso?: string;
  statedIssuingAuthority?: string;
  visibleDocumentIdentifier?: string;
  isCopyNotOfficialRegistry: true;
  reviewerUid?: string;
  reviewStatus: DocumentReviewStatus;
  verificationMethod?: 'visual_copy_inspection_only' | 'external_authorized_registry_adapter' | 'unavailable_no_registry_access';
  externalVerificationReference?: string;
  reviewerNotes?: string;
  reviewedAtIso?: string;
  history: Array<{
    status: DocumentReviewStatus;
    actorUid: string;
    note?: string;
    timestampIso: string;
  }>;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface FinancialEvidenceReviewRecord {
  id: string;
  assessmentId: string;
  recordCategory:
    | 'reported_rental_income'
    | 'rental_agreement_reference'
    | 'operating_expense'
    | 'maintenance_cost'
    | 'building_charge'
    | 'utility_cost'
    | 'insurance_document'
    | 'tax_or_fee_document'
    | 'transaction_cost'
    | 'financing_document';
  amount: number;
  originalCurrency: 'IRT' | 'IRR' | 'USD' | 'EUR';
  reportingPeriodStartIso: string;
  reportingPeriodEndIso: string;
  frequency: 'recurring_monthly' | 'recurring_annual' | 'one_time';
  obligationType: 'contractual_obligation' | 'actual_recorded_payment' | 'unverified_reported_estimate';
  verificationStatus: 'reported_unverified' | 'supported_by_receipt' | 'independently_verified' | 'verification_unavailable';
  evidenceIds: string[];
  reviewerUid: string;
  notes?: string;
  recordedAtIso: string;
}

export interface GeographicEnvironmentalObservation {
  id: string;
  assessmentId: string;
  canonicalCityId: string;
  canonicalNeighborhoodId?: number;
  category: 'road_access' | 'public_transport' | 'nearby_infrastructure' | 'environmental_observation' | 'site_access_limitation';
  sourceType: 'official_dataset_reference' | 'user_reported_observation' | 'inspector_field_observation' | 'data_unavailable';
  datasetSourceName?: string;
  datasetPublishedAtIso?: string;
  isStaleDataset?: boolean;
  observationSummary: string;
  verificationStatus: 'verified_dataset' | 'field_observed' | 'unverified_report' | 'unavailable';
  recordedByUid: string;
  recordedAtIso: string;
}

export interface TechnicalMeasurementRecord {
  id: string;
  assessmentId: string;
  findingOrChecklistId?: string;
  measurementType:
    | 'room_dimension'
    | 'ceiling_height'
    | 'moisture_reading'
    | 'temperature'
    | 'crack_width'
    | 'electrical_voltage_or_resistance'
    | 'water_pressure'
    | 'other';
  originalValue: number;
  originalUnit: string;
  measurementMethod: 'instrument_reading' | 'visual_estimate';
  instrumentReference?: string;
  certificationEvidenceId?: string;
  isCertifiedMeasurement: boolean;
  measurementConditions?: string;
  reviewerUid: string;
  measuredAtIso: string;
  evidenceId?: string;
  notes?: string;
  correctionHistory: Array<{
    previousValue: number;
    previousUnit: string;
    correctedByUid: string;
    reason: string;
    correctedAtIso: string;
  }>;
}

export type RiskCategory =
  | 'structural'
  | 'electrical'
  | 'plumbing'
  | 'fire_and_life_safety'
  | 'moisture_and_water_damage'
  | 'legal_document_completeness'
  | 'financial_document_uncertainty'
  | 'environmental'
  | 'access_and_location'
  | 'maintenance'
  | 'other_documented_risk';

export interface RiskRegisterEntry {
  id: string;
  assessmentId: string;
  relatedFindingId?: string;
  riskCategory: RiskCategory;
  riskBasis: 'observed_defect' | 'possible_future_risk' | 'missing_information_uncertainty';
  description: string;
  classificationMethodologyVersion: string;
  evidenceIds: string[];
  severity: FindingSeverity;
  likelihoodClassification: 'not_evaluated' | 'low_qualitative' | 'medium_qualitative' | 'high_qualitative' | 'indeterminate';
  impactClassification: 'low' | 'moderate' | 'high' | 'severe' | 'indeterminate';
  requiredFollowUp: string;
  riskOwnerRef?: string;
  reviewStatus: 'open' | 'under_review' | 'accepted' | 'mitigated';
  resolutionStatus: 'unresolved' | 'remediation_in_progress' | 'resolved_verified' | 'deferred';
  lastReviewedAtIso: string;
  createdAtIso: string;
}

export type RemediationStatus =
  | 'recommended'
  | 'accepted'
  | 'assigned'
  | 'in_progress'
  | 'awaiting_evidence'
  | 'completed_awaiting_review'
  | 'verified_resolved'
  | 'rejected'
  | 'deferred'
  | 'cancelled';

export interface RemediationRecommendation {
  id: string;
  assessmentId: string;
  findingId: string;
  actionDescription: string;
  isLegallyMandated: boolean;
  recommendedResponsiblePartyRef?: string;
  externalPropertyManagementRef?: string;
  externalDevelopmentProjectRef?: string;
  priority: AssessmentPriority;
  dueDateIso?: string;
  status: RemediationStatus;
  completionEvidenceIds: string[];
  reportedCompletedAtIso?: string;
  verifiedByReviewerUid?: string;
  verifiedResolvedAtIso?: string;
  followUpAssessmentId?: string;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface ReviewerDisagreementRecord {
  id: string;
  assessmentId: string;
  workstreamId: string;
  findingOrItemId: string;
  primaryReviewerUid: string;
  primaryPosition: string;
  dissentingReviewerUid: string;
  dissentingPosition: string;
  status: 'open_conflict' | 'resolved_by_coordinator';
  resolutionSummary?: string;
  resolvedByCoordinatorUid?: string;
  resolvedAtIso?: string;
  createdAtIso: string;
}

export interface AssessmentQualityCheckResult {
  assessmentId: string;
  qualityCheckVersion: string;
  evaluatedAtIso: string;
  requiredChecklistCompletionRatio: number;
  missingRequiredEvidenceCount: number;
  incompleteMandatoryWorkstreams: string[];
  unreviewedSuppliedDocumentsCount: number;
  unresolvedCriticalOrMajorFindingsCount: number;
  openReviewerDisagreementsCount: number;
  staleEvidenceIds: string[];
  blockers: string[];
  warnings: string[];
  isScopeFullyCompleted: boolean;
  isFullyVerifiedAssessment: boolean;
  disclaimer: string;
}

export interface DueDiligenceReportVersion {
  id: string;
  assessmentId: string;
  reportVersion: number;
  propertyReference: string;
  assessmentScope: AssessmentScope;
  completedWorkstreamIds: string[];
  incompleteWorkstreamIds: string[];
  checklistCompletionSummary: {
    totalItems: number;
    respondedItems: number;
    deficienciesCount: number;
    notInspectedCount: number;
    evidenceUnavailableCount: number;
  };
  findingIds: string[];
  severityCounts: Record<FindingSeverity, number>;
  supportingEvidenceIds: string[];
  documentReviewSummary: {
    totalDocuments: number;
    independentlyVerifiedCount: number;
    copyOnlyUnverifiedCount: number;
    inconsistenciesCount: number;
    unavailableVerificationCount: number;
  };
  financialReviewIncluded: boolean;
  geographicReviewIncluded: boolean;
  outstandingUncertainties: string[];
  unresolvedRiskIds: string[];
  remediationRecommendationIds: string[];
  participatingReviewers: Array<{ reviewerUid: string; role: ReviewerRole; licenseVerified: boolean }>;
  generatedAtIso: string;
  dataCutoffAtIso: string;
  methodologyAndTemplateVersion: string;
  status: 'draft' | 'reviewed' | 'published' | 'superseded' | 'withdrawn';
  supersededByVersion?: number;
  withdrawalReason?: string;
  mandatoryLegalAndTechnicalDisclaimer: string;
}

export type DueDiligenceEventType =
  | 'due_diligence.assessment.created'
  | 'due_diligence.assessment.assigned'
  | 'due_diligence.assessment.started'
  | 'due_diligence.workstream.completed'
  | 'due_diligence.checklist.response.recorded'
  | 'due_diligence.finding.created'
  | 'due_diligence.finding.updated'
  | 'due_diligence.evidence.submitted'
  | 'due_diligence.document.reviewed'
  | 'due_diligence.risk.recorded'
  | 'due_diligence.remediation.recommended'
  | 'due_diligence.remediation.completed'
  | 'due_diligence.assessment.review_requested'
  | 'due_diligence.report.published'
  | 'due_diligence.report.superseded'
  | 'due_diligence.assessment.completed'
  | 'due_diligence.assessment.cancelled';

export interface DueDiligenceDomainEvent {
  eventId: string;
  schemaVersion: '2026-11.due-diligence.v1';
  eventType: DueDiligenceEventType;
  assessmentId: string;
  propertyReference: string;
  actorUid: string;
  timestampIso: string;
  idempotencyKey?: string;
  payload: Record<string, unknown>;
}

export interface DueDiligenceAuditEntry {
  id: string;
  assessmentId: string;
  actorUid: string;
  action: string;
  targetEntityType: string;
  targetEntityId: string;
  metadata?: Record<string, unknown>;
  timestampIso: string;
}
