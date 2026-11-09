import type { NormalizedTimestamp } from '../../core';
import type {
  ConfidenceClassification,
  DueDiligenceSourceType,
  SourcePropertyAttributesSnapshot,
} from '../contracts/externalAdapters';

export type DueDiligenceCasePurpose =
  | 'PURCHASE'
  | 'SALE'
  | 'RENTAL'
  | 'LEASE_RENEWAL'
  | 'INVESTMENT_ASSESSMENT'
  | 'PROPERTY_HANDOVER'
  | 'OTHER_SUPPORTED_REVIEW';

export type DueDiligenceCaseWorkflowState =
  | 'OPEN_DRAFT'
  | 'EVIDENCE_COLLECTION'
  | 'UNDER_REVIEW'
  | 'ASSESSMENT_ISSUED'
  | 'CLOSED'
  | 'CANCELLED';

export type EvidenceCategory =
  | 'OWNERSHIP_DOCUMENT'
  | 'TITLE_DEED_REFERENCE'
  | 'IDENTITY_OR_AUTHORITY_EVIDENCE'
  | 'BUILDING_PERMIT'
  | 'OCCUPANCY_CERTIFICATE'
  | 'LEASE_DOCUMENT'
  | 'PROPERTY_TAX_EVIDENCE'
  | 'UTILITY_CLEARANCE_EVIDENCE'
  | 'INSPECTION_REPORT'
  | 'STRUCTURAL_ASSESSMENT_REFERENCE'
  | 'INSURANCE_EVIDENCE'
  | 'OFFICIAL_REGISTRY_RESPONSE'
  | 'REGULATORY_CONFIRMATION';

export type EvidenceVerificationState =
  | 'NOT_SUBMITTED'
  | 'SUBMITTED'
  | 'PENDING_REVIEW'
  | 'VERIFIED'
  | 'REJECTED'
  | 'EXPIRED'
  | 'UNVERIFIABLE'
  | 'REQUIRES_ADDITIONAL_EVIDENCE';

export type VerificationMethodType =
  | 'AUTOMATED_METADATA_CHECK_ONLY'
  | 'AUTHORIZED_HUMAN_REVIEW'
  | 'OFFICIAL_SOURCE_CONFIRMATION'
  | 'UNVERIFIED_SUBMISSION';

export interface EvidenceStateTransitionEntry {
  transitionId: string;
  fromState: EvidenceVerificationState;
  toState: EvidenceVerificationState;
  actorUid: string;
  verificationMethod: VerificationMethodType;
  reason: string;
  occurredAt: NormalizedTimestamp;
}

export interface UntrustedAiExtractionEnvelope {
  extractionModelId: string;
  extractedFields: Record<string, string | number | null>;
  extractionConfidenceScore: number;
  isProofOfAuthenticity: false;
  requiresHumanVerification: true;
  extractionLimitations: string[];
}

export interface DueDiligenceEvidenceRecord {
  evidenceId: string;
  caseId: string;
  canonicalPropertyId: string;
  category: EvidenceCategory;
  mediaDocumentRefId: string;
  mediaSha256Checksum: string;
  sourceType: DueDiligenceSourceType;
  issuingAuthorityOrSource: string;
  documentReferenceNumber: string;
  issueDateIso: string;
  expirationDateIso: string | null;
  receivedAt: NormalizedTimestamp;
  verificationMethod: VerificationMethodType;
  verificationStatus: EvidenceVerificationState;
  assignedReviewerUid: string | null;
  confidenceClassification: ConfidenceClassification;
  limitationsAndWarnings: string[];
  untrustedAiExtraction?: UntrustedAiExtractionEnvelope | null;
  transitionHistory: EvidenceStateTransitionEntry[];
  nonLegalAuthenticityDisclaimer: string;
  createdAt: NormalizedTimestamp;
  updatedAt: NormalizedTimestamp;
}

export type OwnershipClaimAssessmentStatus =
  | 'EVIDENCE_CONSISTENT_WITH_CLAIM'
  | 'MISSING_AUTHORIZATION_OR_REPRESENTATIVE_EVIDENCE'
  | 'JOINT_OWNERSHIP_CO_SIGNER_MISSING'
  | 'CONFLICTING_OWNERSHIP_CLAIMS_DETECTED'
  | 'UNVERIFIED_CLAIM';

export interface OwnershipAndAuthorityReviewRecord {
  reviewId: string;
  caseId: string;
  canonicalPropertyId: string;
  claimedOwnerIdentifier: string;
  actingPartyRole: 'CLAIMED_OWNER' | 'AGENT_OR_REPRESENTATIVE' | 'CO_OWNER';
  representativeAuthorizationEvidenceId: string | null;
  jointOwnershipIndicatorsPresent: boolean;
  allCoOwnersDocumented: boolean;
  supportingEvidenceIds: string[];
  assessmentStatus: OwnershipClaimAssessmentStatus;
  explanation: string;
  nonLegalTitleDeterminationDisclaimer: string;
  recordedByUid: string;
  recordedAt: NormalizedTimestamp;
}

export type FinancialObligationStatusClassification =
  | 'VERIFIED_OUTSTANDING_OBLIGATION'
  | 'REPORTED_BUT_UNVERIFIED_OBLIGATION'
  | 'HISTORICAL_OBLIGATION'
  | 'RESOLVED_OBLIGATION_WITH_EVIDENCE'
  | 'UNKNOWN_FINANCIAL_STATUS';

export interface PropertyFinancialObligationCheckRecord {
  obligationCheckId: string;
  caseId: string;
  canonicalPropertyId: string;
  obligationType:
    | 'PROPERTY_TAX'
    | 'MUNICIPAL_CHARGE'
    | 'UTILITY_DEBT'
    | 'BUILDING_MAINTENANCE_HOA'
    | 'LEASE_SECURITY_DEPOSIT'
    | 'CONTRACTUAL_COMMITMENT';
  statusClassification: FinancialObligationStatusClassification;
  documentedAmount: number | null;
  currency: 'TOMAN' | 'IRR' | null;
  supportingEvidenceId: string | null;
  resolutionEvidenceId: string | null;
  notes: string;
  missingDataDoesNotImplyZeroDebtDisclaimer: string;
  recordedAt: NormalizedTimestamp;
}

export interface PropertyAttributeDiscrepancyItem {
  fieldName: string;
  discrepancyType: 'CONFLICTING_VALUES' | 'MISSING_IN_SOME_SOURCES' | 'OUTDATED_SOURCE';
  valuesBySource: Array<{
    sourceId: string;
    sourceType: DueDiligenceSourceType;
    sourceName: string;
    observedAtIso: string;
    value: string | number | null;
  }>;
  explanation: string;
}

export interface PropertyConsistencyCheckReport {
  reportId: string;
  caseId: string;
  canonicalPropertyId: string;
  preservedSnapshots: SourcePropertyAttributesSnapshot[];
  discrepancies: PropertyAttributeDiscrepancyItem[];
  generatedAt: NormalizedTimestamp;
}

export type FindingCategory =
  | 'OWNERSHIP_DISCREPANCY'
  | 'IDENTITY_OR_AUTHORITY_DISCREPANCY'
  | 'DOCUMENT_INCONSISTENCY'
  | 'MISSING_EVIDENCE'
  | 'EXPIRED_EVIDENCE'
  | 'REGULATORY_CONCERN'
  | 'FINANCIAL_OBLIGATION'
  | 'PHYSICAL_CONDITION_CONCERN'
  | 'GEOGRAPHIC_INCONSISTENCY'
  | 'SOURCE_RELIABILITY_CONCERN'
  | 'POTENTIAL_DUPLICATE_OR_FRAUDULENT_EVIDENCE';

export type FindingSeverityClassification = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type FindingResolutionStatus = 'OPEN_UNRESOLVED' | 'RESOLVED_WITH_EVIDENCE' | 'ACCEPTED_LIMITATION';

export interface DueDiligenceFindingRecord {
  findingId: string;
  caseId: string;
  canonicalPropertyId: string;
  category: FindingCategory;
  supportingEvidenceIds: string[];
  sourceReferences: string[];
  /** Severity and confidence are strictly separate fields (Section 3H) */
  severityClassification: FindingSeverityClassification;
  confidenceClassification: ConfidenceClassification;
  verificationStatus: 'ALLEGED_UNVERIFIED' | 'CORROBORATED_BY_EVIDENCE' | 'CONFIRMED_BY_REVIEWER';
  explanation: string;
  recommendedNextVerificationStep: string;
  responsibleReviewerUid: string | null;
  resolutionStatus: FindingResolutionStatus;
  resolutionEvidenceId: string | null;
  resolutionNotes: string | null;
  createdAt: NormalizedTimestamp;
  updatedAt: NormalizedTimestamp;
}

export type CompletionAssessmentOverallState =
  | 'NOT_STARTED'
  | 'IN_PROGRESS'
  | 'INCOMPLETE'
  | 'BLOCKED'
  | 'COMPLETED_WITH_FINDINGS'
  | 'COMPLETED_WITHOUT_IDENTIFIED_FINDINGS';

export interface DueDiligenceCompletionAssessmentRecord {
  assessmentId: string;
  versionNumber: number;
  caseId: string;
  canonicalPropertyId: string;
  purpose: DueDiligenceCasePurpose;
  overallState: CompletionAssessmentOverallState;
  requiredEvidenceCategories: EvidenceCategory[];
  verifiedEvidenceCategories: EvidenceCategory[];
  missingEvidenceCategories: EvidenceCategory[];
  expiredEvidenceIds: string[];
  unresolvedFindingsCount: number;
  highOrCriticalUnresolvedFindingsCount: number;
  unknownFinancialObligationDomainsCount: number;
  scopeSummary: string;
  limitations: string[];
  nonGuaranteeAndNonLegalCertificationDisclaimer: string;
  generatedByUid: string;
  generatedAt: NormalizedTimestamp;
}

export interface DueDiligenceCaseVersionSnapshot {
  versionNumber: number;
  workflowState: DueDiligenceCaseWorkflowState;
  finalAssessmentStatus: CompletionAssessmentOverallState;
  changedByUid: string;
  reason: string;
  changedAt: NormalizedTimestamp;
}

export interface DueDiligenceCaseActivityRecord {
  activityId: string;
  caseId: string;
  actorUid: string;
  actionType:
    | 'CASE_CREATED'
    | 'CASE_METADATA_UPDATED'
    | 'EVIDENCE_REGISTERED'
    | 'EVIDENCE_STATE_TRANSITIONED'
    | 'OWNERSHIP_REVIEW_RECORDED'
    | 'CONSISTENCY_CHECK_EXECUTED'
    | 'OBLIGATION_CHECK_RECORDED'
    | 'FINDING_CREATED'
    | 'FINDING_RESOLVED'
    | 'ASSESSMENT_GENERATED'
    | 'CASE_CLOSED_OR_CANCELLED';
  summary: string;
  occurredAt: NormalizedTimestamp;
}

export interface DueDiligenceCaseRecord {
  caseId: string;
  canonicalPropertyId: string;
  requestingUserUid: string;
  authorizedParticipantUids: string[];
  assignedReviewerUid: string | null;
  purpose: DueDiligenceCasePurpose;
  workflowState: DueDiligenceCaseWorkflowState;
  requestedVerificationScope: EvidenceCategory[];
  evidenceIds: string[];
  findingIds: string[];
  unresolvedFindingIds: string[];
  latestAssessmentId: string | null;
  finalAssessmentStatus: CompletionAssessmentOverallState;
  versionNumber: number;
  versionHistory: DueDiligenceCaseVersionSnapshot[];
  notes: string;
  createdAt: NormalizedTimestamp;
  updatedAt: NormalizedTimestamp;
}
