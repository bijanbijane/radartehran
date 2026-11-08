export type DueDiligenceCaseType =
  | 'PURCHASE_DUE_DILIGENCE'
  | 'SALE_DUE_DILIGENCE'
  | 'RENTAL_DUE_DILIGENCE'
  | 'COMMERCIAL_PROPERTY_DUE_DILIGENCE'
  | 'DEVELOPMENT_LAND_DUE_DILIGENCE'
  | 'INVESTMENT_REVIEW'
  | 'OWNERSHIP_VERIFICATION'
  | 'GENERAL_PROPERTY_DOCUMENTATION_REVIEW';

export type DueDiligenceCaseStatus =
  | 'DRAFT'
  | 'OPEN'
  | 'EVIDENCE_REQUESTED'
  | 'EVIDENCE_RECEIVED'
  | 'UNDER_REVIEW'
  | 'FINDINGS_REQUIRING_ACTION'
  | 'ADDITIONAL_VERIFICATION_REQUIRED'
  | 'READY_FOR_REPORT'
  | 'COMPLETED'
  | 'CLOSED'
  | 'CANCELLED';

export type ChecklistDomainCategory =
  | 'PROPERTY_IDENTITY'
  | 'OWNERSHIP_AND_LEGAL_STATUS'
  | 'REGULATORY_AND_PERMIT_STATUS'
  | 'PHYSICAL_AND_TECHNICAL_DOCUMENTATION'
  | 'FINANCIAL_AND_COMMERCIAL_INFORMATION'
  | 'ENVIRONMENTAL_AND_LOCATION_RISK'
  | 'TRANSACTION_READINESS';

export type EvidenceSourceClassification =
  | 'OFFICIAL_GOVERNMENT_SOURCE'
  | 'OFFICIAL_AUTHORITY_DOCUMENT'
  | 'LICENSED_PROFESSIONAL_REPORT'
  | 'FINANCIAL_INSTITUTION_RECORD'
  | 'PROPERTY_OWNER_SUBMISSION'
  | 'SELLER_OR_BUYER_SUBMISSION'
  | 'THIRD_PARTY_REPORT'
  | 'PLATFORM_GENERATED_RECORD'
  | 'UNVERIFIED_EXTERNAL_SOURCE';

export type EvidenceVerificationState =
  | 'EVIDENCE_SUBMITTED'
  | 'EVIDENCE_RECEIVED'
  | 'EVIDENCE_REVIEWED'
  | 'EVIDENCE_ACCEPTED_FOR_PURPOSE'
  | 'EVIDENCE_REJECTED'
  | 'EVIDENCE_EXPIRED'
  | 'EVIDENCE_CONTRADICTED';

export type VerificationOutcomeResult =
  | 'VERIFIED'
  | 'VERIFIED_WITH_LIMITATIONS'
  | 'NOT_VERIFIED'
  | 'FAILED_VERIFICATION'
  | 'CONFLICTING_EVIDENCE'
  | 'PENDING_EXTERNAL_CONFIRMATION'
  | 'NOT_APPLICABLE'
  | 'EXPIRED';

export type VerificationMethodType =
  | 'AUTHORITATIVE_SOURCE_CROSS_REFERENCE'
  | 'MANUAL_DOCUMENT_REVIEW'
  | 'PROFESSIONAL_REPORT_REVIEW'
  | 'DIRECT_AUTHORITY_CONFIRMATION'
  | 'STRUCTURED_DATA_CONSISTENCY_CHECK'
  | 'INDEPENDENT_REVIEWER_CONFIRMATION';

export type DiscrepancySeverity =
  | 'INFORMATIONAL'
  | 'LOW'
  | 'MODERATE'
  | 'HIGH'
  | 'CRITICAL'
  | 'UNASSESSED';

export type DiscrepancyFindingCategory =
  | 'PROPERTY_IDENTITY_MISMATCH'
  | 'OWNERSHIP_INCONSISTENCY'
  | 'MISSING_OWNERSHIP_DOCUMENTATION'
  | 'PERMIT_DISCREPANCY'
  | 'AREA_OR_BOUNDARY_MISMATCH'
  | 'CONFLICTING_PROPERTY_RECORDS'
  | 'UNDISCLOSED_OCCUPANCY'
  | 'UNRESOLVED_FINANCIAL_OBLIGATION'
  | 'STRUCTURAL_DOCUMENTATION_GAP'
  | 'ENVIRONMENTAL_CONCERN'
  | 'EXPIRED_DOCUMENT'
  | 'INCONSISTENT_PARTY_AUTHORIZATION'
  | 'OTHER_DOCUMENTED_DISCREPANCY';

export type FindingEpistemicClassification =
  | 'CONFIRMED_DISCREPANCY'
  | 'SUSPECTED_DISCREPANCY'
  | 'MISSING_INFORMATION'
  | 'UNVERIFIED_ALLEGATION'
  | 'RESOLVED_FINDING';

export type ReportWorkflowConclusion =
  | 'REVIEW_COMPLETE_WITH_NO_RECORDED_CRITICAL_FINDINGS'
  | 'REVIEW_COMPLETE_WITH_FINDINGS'
  | 'ADDITIONAL_VERIFICATION_REQUIRED'
  | 'INSUFFICIENT_EVIDENCE'
  | 'REVIEW_INCOMPLETE'
  | 'REVIEW_WITHDRAWN';

export interface DueDiligenceCaseRecord {
  id: string;
  propertyId: string;
  transactionRef?: string;
  requestingUserId: string;
  organizationId?: string;
  assignedReviewerIds: string[];
  caseType: DueDiligenceCaseType;
  jurisdiction: {
    citySlug: string;
    districtCode?: string;
    neighborhoodIdOrSlug?: string;
  };
  casePurpose: string;
  scopeOfReview: ChecklistDomainCategory[];
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  status: DueDiligenceCaseStatus;
  openingDateIso: string;
  targetCompletionDateIso?: string;
  actualCompletionDateIso?: string;
  checklistInstanceId?: string;
  checklistVersion: number;
  evidenceIds: string[];
  findingIds: string[];
  reportIds: string[];
  confidentialityClassification:
    | 'STANDARD_CASE_PARTICIPANTS'
    | 'RESTRICTED_OWNERSHIP_FINANCIAL'
    | 'HIGHLY_CONFIDENTIAL_LEGAL';
  isSyntheticTestFixture: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface VerificationChecklistItemSpec {
  itemId: string;
  domain: ChecklistDomainCategory;
  description: string;
  requirementClassification: string;
  applicableCitySlugs: string[]; // empty or ['*'] means all jurisdictions; otherwise specific citySlugs
  requiredEvidenceCategory: string;
  verificationMethod: VerificationMethodType;
  responsibleReviewerRole: string;
  applicableSourceReference: string;
  effectiveVersion: number;
  mandatory: boolean;
  completionCriteria: string;
  status: 'PENDING_EVIDENCE' | 'EVIDENCE_SUBMITTED_UNVERIFIED' | 'VERIFIED_COMPLETE' | 'FAILED_OR_DISCREPANCY' | 'NOT_APPLICABLE';
  linkedEvidenceIds: string[];
}

export interface DueDiligenceChecklistInstanceRecord {
  id: string;
  caseId: string;
  templateId: string;
  version: number;
  jurisdictionCitySlug: string;
  items: VerificationChecklistItemSpec[];
  createdAt: string;
  updatedAt: string;
}

export interface DueDiligenceEvidenceReferenceRecord {
  id: string;
  caseId: string;
  checklistItemId?: string;
  evidenceCategory: string;
  mediaReferenceId: string;
  documentIssuerRef?: string;
  sourceClassification: EvidenceSourceClassification;
  dateOfIssueIso?: string;
  dateReceivedIso: string;
  effectiveEndIso?: string;
  submittedByUserId: string;
  sourceVerificationState: EvidenceVerificationState;
  confidentialityTier: 'CASE_PARTICIPANTS' | 'RESTRICTED_OWNERSHIP_OR_FINANCIAL';
  reviewerUserId?: string;
  reviewNotes?: string;
  contradictedByEvidenceId?: string;
  isAuthenticProvenByUploadAlone: false;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface DueDiligenceVerificationRecord {
  id: string;
  caseId: string;
  evidenceId: string;
  checklistItemId?: string;
  subjectVerified: string;
  verificationCategory: ChecklistDomainCategory;
  verificationMethod: VerificationMethodType;
  verificationSource: string;
  reviewerUserId: string;
  verificationResult: VerificationOutcomeResult;
  confidenceClassification?: 'HIGH_AUTHORITATIVE' | 'MODERATE_DOCUMENTARY' | 'LOW_UNCORROBORATED';
  verifiedAtIso: string;
  sourceDateIso?: string;
  revalidationDateIso?: string;
  supportingReferences: string[];
  contradictingEvidenceIds?: string[];
  limitations: string;
}

export interface DueDiligenceDiscrepancyFindingRecord {
  id: string;
  caseId: string;
  propertyId: string;
  findingCategory: DiscrepancyFindingCategory;
  description: string;
  affectedChecklistItemIds: string[];
  supportingEvidenceIds: string[];
  contradictoryEvidenceIds: string[];
  severity: DiscrepancySeverity;
  epistemicClassification: FindingEpistemicClassification;
  potentialConsequence: string;
  recommendedNextAction: string;
  assignedReviewerId?: string;
  resolutionStatus: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'ACCEPTED_WITH_LIMITATION';
  resolutionEvidenceIds: string[];
  authoredByAiSuggestion: boolean;
  humanReviewedByUserId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface OwnershipAndTitleReviewReference {
  id: string;
  caseId: string;
  propertyId: string;
  ownershipRecordRef: string;
  provenance:
    | 'USER_REPORTED'
    | 'DOCUMENT_EXTRACTED'
    | 'AUTHORITATIVE_REGISTRY_CHECKED'
    | 'INDEPENDENTLY_VERIFIED';
  coOwnershipSummary?: string;
  encumbranceRefs: string[];
  transferRestrictionsSummary?: string;
  ownershipChainGapsDetected: boolean;
  reviewNotes: string;
  reviewerUserId: string;
  isCanonicalOwnershipDetermination: false;
  recordedAtIso: string;
}

export interface PropertyGeographicConsistencyCheckRecord {
  id: string;
  caseId: string;
  propertyId: string;
  sourceA: { name: string; valueSummary: string; sourceDateIso?: string };
  sourceB: { name: string; valueSummary: string; sourceDateIso?: string };
  comparedAttributes: ('PARCEL_REF' | 'ADDRESS' | 'COORDINATES' | 'RECORDED_AREA' | 'BOUNDARY' | 'JURISDICTION')[];
  comparisonMethod: string;
  result: 'CONSISTENT' | 'DISCREPANCY_DETECTED' | 'INCONCLUSIVE';
  differenceSummary?: string;
  verificationStatus: 'VERIFIED_CONSISTENT' | 'UNRESOLVED_CONFLICT' | 'UNVERIFIED';
  provesLegalParcelOwnership: false;
  recordedByUserId: string;
  recordedAtIso: string;
}

export interface PermitAndRegulatoryReviewReference {
  id: string;
  caseId: string;
  propertyId: string;
  permitRecordRef?: string;
  officialPermitNumber?: string;
  permitCategory: string;
  issuingAuthorityName: string;
  sourceType: 'AUTHORITY_SOURCE' | 'OFFICIAL_DOCUMENT' | 'CONNECTED_PERMIT_RECORD' | 'MANUALLY_REPORTED_STATEMENT';
  recordedPermitStatus: string;
  unfulfilledConditionsCount: number;
  reviewSummary: string;
  reviewerUserId: string;
  isCanonicalPermitRecord: false;
  recordedAtIso: string;
}

export interface PhysicalTechnicalReviewReference {
  id: string;
  caseId: string;
  propertyId: string;
  reviewCategory: 'STRUCTURAL' | 'ELECTRICAL' | 'PLUMBING' | 'HVAC' | 'FIRE_SAFETY' | 'MOISTURE' | 'ENVELOPE';
  specialistRef: string;
  qualificationRef?: string;
  inspectionDateIso: string;
  inspectionScope: string;
  reportEvidenceId: string;
  findingsSummary: string;
  limitations: string;
  verificationState: 'REPORT_REVIEWED' | 'INDEPENDENTLY_CONFIRMED' | 'INCOMPLETE_DOCUMENTATION';
  issuesStructuralSafetyCertification: false;
  recordedAtIso: string;
}

export interface FinancialCommercialReviewReference {
  id: string;
  caseId: string;
  propertyId: string;
  obligationCategory: 'PROPERTY_TAX' | 'MUNICIPAL_FEE' | 'MORTGAGE_OR_LIEN' | 'LEASE_DEPOSIT' | 'SERVICE_CHARGE' | 'UTILITY';
  amountRials: number;
  amountClassification:
    | 'USER_REPORTED_AMOUNT'
    | 'DOCUMENTED_AMOUNT'
    | 'OFFICIALLY_ASSESSED_AMOUNT'
    | 'INDEPENDENTLY_VERIFIED_AMOUNT'
    | 'OUTSTANDING_AMOUNT'
    | 'DISPUTED_AMOUNT';
  settlementVerifiedByAuthoritativeSource: boolean;
  supportingEvidenceIds: string[];
  reviewerUserId: string;
  processedByPlatform: false;
  recordedAtIso: string;
}

export interface EnvironmentalRiskReviewReference {
  id: string;
  caseId: string;
  propertyId: string;
  hazardCategory: 'SEISMIC' | 'FLOOD' | 'SUBSIDENCE' | 'LANDSLIDE' | 'CONTAMINATION' | 'AIR_QUALITY';
  originalSourceRef: string;
  hazardExistence: string;
  propertyExposure: string;
  vulnerability: string;
  potentialConsequence: string;
  overallRiskAssessment: string;
  verificationStatus: 'REFERENCED_FROM_RISK_MODULE' | 'UNVERIFIED';
  provesPropertySpecificDamage: false;
  recordedAtIso: string;
}

export interface CaseReviewerAssignmentRecord {
  id: string;
  caseId: string;
  reviewerUserId: string;
  reviewerRole: string;
  assignedDomains: ChecklistDomainCategory[];
  assignedScopeSummary: string;
  status: 'ASSIGNED' | 'ACCEPTED' | 'REJECTED' | 'COMPLETED';
  startDateIso: string;
  dueDateIso?: string;
  completedAtIso?: string;
  reviewNotes?: string;
  conflictOfInterestDeclaration: {
    declared: boolean;
    hasConflict: boolean;
    declarationReferenceId: string;
    summary: string;
  };
  isIndependentSecondReview: boolean;
  independentBasisVerifiedBySupervisor: boolean;
}

export interface DueDiligenceCaseReportSnapshot {
  id: string;
  caseId: string;
  propertyId: string;
  reportVersion: number;
  generatedAtIso: string;
  scopeOfReview: ChecklistDomainCategory[];
  checklistVersionUsed: number;
  checklistCompletionSummary: {
    totalApplicableItems: number;
    verifiedCompleteCount: number;
    pendingOrUnverifiedCount: number;
    failedOrDiscrepancyCount: number;
  };
  evidenceVersionMap: Record<string, number>;
  verifiedEvidenceIds: string[];
  unverifiedEvidenceIds: string[];
  findingIds: string[];
  unresolvedHighOrCriticalFindingIds: string[];
  externalVerificationLimitations: string[];
  conclusion: ReportWorkflowConclusion;
  requiredFollowUpActions: string[];
  status: 'ISSUED_IMMUTABLE' | 'SUPERSEDED_BY_NEWER_VERSION' | 'WITHDRAWN';
  isLegalGuaranteeOrCertification: false;
}

export interface UntrustedAiReviewSuggestionRecord {
  id: string;
  caseId: string;
  sourceEvidenceIds: string[];
  modelIdentifier: string;
  extractedFacts: string[];
  inferredObservations: string[];
  suggestedFindingCategory?: DiscrepancyFindingCategory;
  humanReviewStatus: 'UNREVIEWED_SUGGESTION' | 'ACCEPTED_BY_HUMAN_REVIEWER' | 'REJECTED_BY_HUMAN_REVIEWER';
  reviewedByUserId?: string;
  isAuthoritative: false;
  createdAtIso: string;
}

export type DueDiligenceCaseActorRole =
  | 'CASE_REQUESTER'
  | 'CASE_COORDINATOR_OR_SUPERVISOR'
  | 'DOMAIN_REVIEWER'
  | 'LEGAL_FINANCIAL_REVIEWER'
  | 'INDEPENDENT_SECOND_REVIEWER'
  | 'UNRELATED_USER';

export interface DueDiligenceCaseActorContext {
  userId: string;
  role: DueDiligenceCaseActorRole;
  organizationId?: string;
  authorizedDomains?: ChecklistDomainCategory[];
}

export type VerificationCaseErrorCode =
  | 'VALIDATION_FAILED'
  | 'RESOURCE_NOT_FOUND'
  | 'INVALID_PROPERTY_REFERENCE'
  | 'UNAUTHORIZED_CASE_ACCESS'
  | 'RESTRICTED_EVIDENCE_ACCESS_DENIED'
  | 'UNAUTHORIZED_REVIEWER_SCOPE'
  | 'CONFLICT_OF_INTEREST_VIOLATION'
  | 'INDEPENDENT_REVIEW_NOT_VERIFIED'
  | 'DUPLICATE_EVIDENCE_SUBMISSION'
  | 'UNVERIFIED_DOCUMENT_CANNOT_SELF_VERIFY'
  | 'AI_OUTPUT_UNTREATED_AS_AUTHORITATIVE'
  | 'CRITICAL_FINDING_BLOCKS_CLEAN_CONCLUSION'
  | 'INCOMPLETE_VERIFICATION_BLOCKS_COMPLETION'
  | 'CONCURRENCY_CONFLICT'
  | 'PERSISTENCE_FAILURE'
  | 'CROSS_MODULE_WRITE_FORBIDDEN';

export class VerificationCaseError extends Error {
  constructor(
    public readonly code: VerificationCaseErrorCode,
    message: string,
    public readonly statusCode: number = 400
  ) {
    super(message);
    this.name = 'VerificationCaseError';
  }
}
