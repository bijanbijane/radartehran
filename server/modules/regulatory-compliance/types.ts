export type JurisdictionHierarchyLevel =
  | 'COUNTRY'
  | 'PROVINCE_OR_STATE'
  | 'CITY'
  | 'MUNICIPALITY'
  | 'SPECIAL_ADMINISTRATIVE_AREA'
  | 'REGULATORY_AUTHORITY'
  | 'BUSINESS_OPERATING_TERRITORY'
  | 'SERVICE_SPECIFIC_GEOGRAPHIC_SCOPE';

export type RegulatorySourceType =
  | 'GOVERNMENT_LEGISLATION_PORTAL'
  | 'REGULATORY_AUTHORITY_PUBLICATION'
  | 'ADMINISTRATIVE_CIRCULAR'
  | 'TECHNICAL_OR_SECURITY_STANDARD'
  | 'CONTRACTUAL_COMPLIANCE_OBLIGATION'
  | 'INTERNAL_GOVERNANCE_POLICY'
  | 'APPROVED_ORGANIZATIONAL_PROCEDURE'
  | 'SEARCH_ENGINE_SNIPPET'
  | 'UNOFFICIAL_WEBSITE'
  | 'UNVERIFIED_AI_SUMMARY';

export type RegulatorySourceApprovalStatus =
  | 'DRAFT'
  | 'PENDING_VERIFICATION'
  | 'VERIFIED'
  | 'APPROVED'
  | 'SUPERSEDED'
  | 'RETIRED'
  | 'REJECTED';

export type ObligationCategory =
  | 'REAL_ESTATE_ADVERTISING_AND_LISTING'
  | 'BROKER_AND_AGENCY_LICENSING'
  | 'IDENTITY_VERIFICATION_AND_CUSTOMER_DUE_DILIGENCE'
  | 'TRANSACTION_DOCUMENTATION_AND_DISCLOSURE'
  | 'RENTAL_AND_TENANCY_REGULATORY'
  | 'ESCROW_PAYMENT_AND_FINANCIAL_RECORDS'
  | 'ANTI_FRAUD_AND_SUSPICIOUS_ACTIVITY_ESCALATION'
  | 'CONSUMER_PROTECTION_AND_DISPUTE_HANDLING'
  | 'PRIVACY_DATA_PROTECTION_AND_CONSENT'
  | 'RECORD_RETENTION_ARCHIVAL_AND_LEGAL_HOLD'
  | 'DOCUMENT_EXECUTION_AND_EVIDENCE_INTEGRITY'
  | 'EXTERNAL_DATA_SOURCE_AND_CRAWLER_COMPLIANCE'
  | 'API_PARTNER_AND_SYNDICATION_COMPLIANCE'
  | 'TAX_AND_INVOICING_RECORDKEEPING'
  | 'INFORMATION_SECURITY_AND_ACCESS_GOVERNANCE'
  | 'OPERATIONAL_AUDITABILITY_AND_CHANGE_MANAGEMENT'
  | 'AI_USAGE_TRANSPARENCY_AND_HUMAN_REVIEW'
  | 'ACCESSIBILITY_AND_COMMUNICATIONS_COMPLIANCE'
  | 'INTERNAL_POLICY_AND_GOVERNANCE';

export type ObligationLifecycleStatus =
  | 'DRAFT'
  | 'PENDING_VERIFICATION'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'ACTIVE'
  | 'SUPERSEDED'
  | 'RETIRED'
  | 'REJECTED';

export type ObligationSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export type ControlType =
  | 'PREVENTIVE'
  | 'DETECTIVE'
  | 'CORRECTIVE'
  | 'MANUAL'
  | 'AUTOMATED'
  | 'HYBRID';

export type ControlImplementationStatus =
  | 'DESIGNED'
  | 'CONFIGURED_ONLY'
  | 'IMPLEMENTED_AND_VERIFIED'
  | 'PARTIALLY_IMPLEMENTED'
  | 'DEGRADED'
  | 'RETIRED';

export type ComplianceDeterminationState =
  | 'COMPLIANT'
  | 'PARTIALLY_COMPLIANT'
  | 'NON_COMPLIANT'
  | 'NOT_APPLICABLE'
  | 'PENDING_EVIDENCE'
  | 'PENDING_REVIEW'
  | 'UNABLE_TO_DETERMINE'
  | 'EXCEPTION_APPROVED'
  | 'EXPIRED';

export type EvidenceVerificationStatus =
  | 'UNVERIFIED'
  | 'VERIFIED'
  | 'REJECTED'
  | 'EXPIRED';

export type ComplianceExceptionStatus =
  | 'REQUESTED'
  | 'UNDER_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'EXPIRED'
  | 'REVOKED';

export type CorrectiveActionStatus =
  | 'OPEN'
  | 'ASSIGNED'
  | 'IN_PROGRESS'
  | 'BLOCKED'
  | 'PENDING_VERIFICATION'
  | 'COMPLETED'
  | 'REJECTED'
  | 'REOPENED'
  | 'CANCELLED';

export type OperationGateStatus =
  | 'ALLOWED'
  | 'BLOCKED'
  | 'REVIEW_REQUIRED'
  | 'NOT_APPLICABLE'
  | 'UNABLE_TO_DETERMINE'
  | 'SERVICE_UNAVAILABLE';

export type CompliancePermission =
  | 'compliance.read'
  | 'compliance.jurisdiction.manage'
  | 'compliance.source.manage'
  | 'compliance.source.approve'
  | 'compliance.obligation.manage'
  | 'compliance.obligation.approve'
  | 'compliance.control.manage'
  | 'compliance.control.execute'
  | 'compliance.assessment.run'
  | 'compliance.assessment.approve'
  | 'compliance.evidence.submit'
  | 'compliance.evidence.verify'
  | 'compliance.exception.request'
  | 'compliance.exception.approve'
  | 'compliance.incident.manage'
  | 'compliance.remediation.manage'
  | 'compliance.report.export'
  | 'compliance.policy.manage'
  | 'compliance.legal_hold.manage'
  | 'compliance.legal_hold.approve'
  | 'compliance.legal_hold.release'
  | 'compliance.retention.manage'
  | 'compliance.disposition.approve';

export interface ComplianceActorContext {
  actorId: string;
  actorRole: string;
  organizationId: string;
  tenantId: string;
  permissions: CompliancePermission[];
  correlationId?: string;
}

export interface ComplianceJurisdiction {
  id: string;
  code: string;
  name: string;
  level: JurisdictionHierarchyLevel;
  parentJurisdictionId: string | null;
  regulatoryAuthorityIds: string[];
  active: boolean;
  effectiveFrom: string;
  effectiveTo: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RegulatoryAuthority {
  id: string;
  name: string;
  jurisdictionId: string;
  domainScope: string[];
  officialPortalUrl: string | null;
  active: boolean;
  createdAt: string;
}

export interface RegulatorySource {
  id: string;
  title: string;
  issuingAuthorityId: string;
  jurisdictionId: string;
  sourceType: RegulatorySourceType;
  externalReferenceCode: string;
  officialCitation: string;
  publicationDate: string;
  effectiveDate: string;
  expirationOrReviewDate: string | null;
  versionLabel: string;
  verificationStatus: 'UNVERIFIED' | 'VERIFIED' | 'REJECTED';
  approvalStatus: RegulatorySourceApprovalStatus;
  verifiedByActorId: string | null;
  approvedByActorId: string | null;
  summaryNotes: string;
  linkedDocumentReferenceIds: string[];
  currentVersionNumber: number;
  createdAt: string;
  updatedAt: string;
}

export interface RegulatorySourceVersion {
  id: string;
  sourceId: string;
  versionNumber: number;
  versionLabel: string;
  officialCitation: string;
  effectiveDate: string;
  summaryNotes: string;
  approvalStatus: RegulatorySourceApprovalStatus;
  recordedByActorId: string;
  recordedAt: string;
}

export interface ApplicabilityRuleCriteria {
  jurisdictionIds: string[];
  businessActivities: string[];
  platformModules: string[];
  organizationTypes: string[];
  transactionCategories: string[];
  propertyCategories: string[];
  customerRelationships: string[];
  dataProcessingActivities: string[];
}

export interface ComplianceObligation {
  id: string;
  code: string;
  title: string;
  description: string;
  category: ObligationCategory;
  regulatorySourceId: string;
  jurisdictionId: string;
  applicabilityCriteria: ApplicabilityRuleCriteria;
  mandatoryLevel: 'MANDATORY' | 'CONDITIONAL' | 'RECOMMENDED';
  severity: ObligationSeverity;
  responsibleOwnerRole: string;
  reviewFrequencyDays: number;
  evidenceRequirements: string[];
  effectiveStartDate: string;
  effectiveEndDate: string | null;
  status: ObligationLifecycleStatus;
  currentVersionNumber: number;
  supersedesObligationId: string | null;
  approvedByActorId: string | null;
  approvedAt: string | null;
  createdByActorId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ObligationVersion {
  id: string;
  obligationId: string;
  versionNumber: number;
  title: string;
  description: string;
  applicabilityCriteria: ApplicabilityRuleCriteria;
  evidenceRequirements: string[];
  effectiveStartDate: string;
  effectiveEndDate: string | null;
  status: ObligationLifecycleStatus;
  changeReason: string;
  createdByActorId: string;
  approvedByActorId: string | null;
  createdAt: string;
}

export interface ComplianceControl {
  id: string;
  code: string;
  title: string;
  description: string;
  controlType: ControlType;
  ownerRole: string;
  targetModule: string;
  targetServiceFunctionality: string;
  executionFrequencyDays: number;
  expectedEvidenceTypes: string[];
  passFailReviewCriteria: string;
  failureEscalationPolicy: string;
  implementationStatus: ControlImplementationStatus;
  functionalBindingVerified: boolean;
  currentVersionNumber: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ControlVersion {
  id: string;
  controlId: string;
  versionNumber: number;
  title: string;
  description: string;
  controlType: ControlType;
  targetModule: string;
  targetServiceFunctionality: string;
  passFailReviewCriteria: string;
  implementationStatus: ControlImplementationStatus;
  recordedByActorId: string;
  recordedAt: string;
}

export interface ObligationControlMapping {
  id: string;
  obligationId: string;
  obligationVersionNumber: number;
  controlId: string;
  controlVersionNumber: number;
  mappingWeight: 'PRIMARY' | 'SUPPORTING';
  createdByActorId: string;
  createdAt: string;
}

export interface ComplianceEvidenceReference {
  id: string;
  tenantId: string;
  organizationId: string;
  evidenceType: string;
  sourceModule: string;
  sourceRecordId: string;
  documentReferenceId: string | null;
  obligationIds: string[];
  controlIds: string[];
  collectedAt: string;
  validFrom: string;
  validUntil: string;
  freshnessWindowDays: number;
  verificationStatus: EvidenceVerificationStatus;
  verifiedByActorId: string | null;
  verifiedAt: string | null;
  immutableDigest: string;
  restrictedAccess: boolean;
  summary: string;
}

export interface ControlExecution {
  id: string;
  controlId: string;
  controlVersionNumber: number;
  targetEntityType: string;
  targetEntityId: string;
  executedByActorId: string;
  executionMode: 'AUTOMATED' | 'MANUAL' | 'HYBRID';
  outcome: 'PASSED' | 'FAILED' | 'NEEDS_REVIEW' | 'ERROR';
  evidenceReferenceIds: string[];
  findingsSummary: string;
  executedAt: string;
}

export interface ComplianceFinding {
  id: string;
  obligationId: string;
  controlId: string | null;
  severity: ObligationSeverity;
  findingType: 'MISSING_CONTROL' | 'CONTROL_NOT_IMPLEMENTED' | 'EVIDENCE_MISSING' | 'EVIDENCE_EXPIRED' | 'EVIDENCE_UNVERIFIED' | 'CONTROL_EXECUTION_FAILED' | 'EXCEPTION_ACTIVE';
  description: string;
  detectedAt: string;
}

export interface ComplianceAssessment {
  id: string;
  tenantId: string;
  organizationId: string;
  scopeType: 'OBLIGATION' | 'MODULE' | 'JURISDICTION' | 'ENTITY' | 'TRANSACTION' | 'LISTING' | 'BROKER' | 'PRIVACY_FLOW';
  targetEntityId: string;
  obligationId: string;
  obligationVersionNumber: number;
  determinationState: ComplianceDeterminationState;
  evaluatedControlIds: string[];
  evaluatedEvidenceIds: string[];
  activeExceptionId: string | null;
  openCorrectiveActionIds: string[];
  findings: ComplianceFinding[];
  explanation: string;
  assessedByActorId: string;
  approvedByActorId: string | null;
  assessedAt: string;
  validUntil: string;
}

export interface ComplianceAssessmentSnapshot {
  id: string;
  assessmentId: string;
  obligationId: string;
  obligationVersionNumber: number;
  determinationState: ComplianceDeterminationState;
  snapshotPayload: Record<string, unknown>;
  capturedAt: string;
}

export interface ComplianceException {
  id: string;
  tenantId: string;
  organizationId: string;
  affectedObligationId: string;
  affectedControlId: string | null;
  scopeEntityType: string;
  scopeEntityId: string;
  businessJustification: string;
  riskAssessment: string;
  compensatingControls: string[];
  requestedByActorId: string;
  reviewedByActorId: string | null;
  approvedByActorId: string | null;
  effectiveStartDate: string;
  expirationDate: string;
  status: ComplianceExceptionStatus;
  reviewNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ComplianceCaseReference {
  id: string;
  externalCaseId: string;
  caseCategory: 'OBLIGATION_REVIEW' | 'EVIDENCE_VERIFICATION' | 'EXCEPTION_APPROVAL' | 'REGULATORY_CHANGE' | 'INCIDENT_ASSESSMENT' | 'PRIVACY_COMPLIANCE' | 'BROKER_COMPLIANCE' | 'LISTING_COMPLIANCE' | 'TRANSACTION_COMPLIANCE' | 'AUDIT_REMEDIATION' | 'LEGAL_HOLD_CONFLICT';
  status: 'OPEN' | 'IN_REVIEW' | 'ESCALATED' | 'RESOLVED' | 'CLOSED';
  linkedObligationIds: string[];
  linkedEntityType: string;
  linkedEntityId: string;
  assignedReviewerRole: string;
  slaDueAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface RegulatoryChange {
  id: string;
  regulatorySourceId: string;
  title: string;
  changeSummary: string;
  impactedJurisdictionIds: string[];
  impactedObligationIds: string[];
  impactedModules: string[];
  aiGeneratedCandidate: boolean;
  candidateVerificationStatus: 'UNVERIFIED_CANDIDATE' | 'HUMAN_VERIFIED' | 'REJECTED';
  status: 'DETECTED' | 'IMPACT_ANALYSIS' | 'OBLIGATION_DRAFTED' | 'REVIEW_REQUIRED' | 'APPROVED' | 'IMPLEMENTED' | 'CLOSED';
  reviewedByActorId: string | null;
  effectiveDate: string;
  createdAt: string;
  updatedAt: string;
}

export interface ComplianceIncident {
  id: string;
  tenantId: string;
  organizationId: string;
  title: string;
  category: 'PRIVACY_INCIDENT' | 'REGULATORY_BREACH_POTENTIAL' | 'CONTROL_FAILURE' | 'CRAWLER_VIOLATION' | 'UNAUTHORIZED_DISCLOSURE' | 'FINANCIAL_RECORD_DISCREPANCY';
  severity: ObligationSeverity;
  affectedModules: string[];
  affectedJurisdictionIds: string[];
  linkedObligationIds: string[];
  containmentActions: string[];
  evidenceReferenceIds: string[];
  legalReportabilityStatus: 'REQUIRES_HUMAN_LEGAL_DETERMINATION' | 'HUMAN_DETERMINED_REPORTABLE' | 'HUMAN_DETERMINED_NON_REPORTABLE';
  externalRegulatorNotificationSent: boolean;
  status: 'REPORTED' | 'TRIAGING' | 'CONTAINING' | 'INVESTIGATING' | 'REMEDIATING' | 'RESOLVED' | 'CLOSED';
  reportedByActorId: string;
  legalReviewerActorId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CorrectiveAction {
  id: string;
  tenantId: string;
  organizationId: string;
  title: string;
  rootCauseCategory: string;
  remediationPlan: string;
  linkedAssessmentId: string | null;
  linkedIncidentId: string | null;
  linkedObligationId: string;
  ownerActorId: string;
  dueDate: string;
  status: CorrectiveActionStatus;
  validationEvidenceIds: string[];
  verifiedByActorId: string | null;
  verifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProcessingActivityReference {
  id: string;
  activityName: string;
  purpose: string;
  dataCategories: string[];
  lawfulBasisOrRequirement: string;
  linkedObligationIds: string[];
  retentionRuleCode: string;
  crossModuleSystems: string[];
  active: boolean;
  createdAt: string;
}

export interface ComplianceApproval {
  id: string;
  targetType: 'REGULATORY_SOURCE' | 'OBLIGATION' | 'ASSESSMENT' | 'EXCEPTION' | 'CORRECTIVE_ACTION' | 'REGULATORY_CHANGE' | 'LEGAL_HOLD' | 'RETENTION_POLICY' | 'DISPOSITION';
  targetId: string;
  requestedByActorId: string;
  decidedByActorId: string;
  decision: 'APPROVED' | 'REJECTED';
  rationale: string;
  decidedAt: string;
}

export interface ComplianceAuditReference {
  id: string;
  actorId: string;
  actorRole: string;
  tenantId: string;
  organizationId: string;
  action: string;
  targetType: string;
  targetId: string;
  previousState?: Record<string, unknown> | null;
  newState?: Record<string, unknown> | null;
  reason?: string;
  authorizationContext?: string[];
  correlationId: string;
  metadata: Record<string, unknown>;
  recordedAt: string;
}

export interface ComplianceEventEnvelope {
  eventId: string;
  eventType:
    | 'compliance.obligation.created'
    | 'compliance.obligation.updated'
    | 'compliance.obligation.superseded'
    | 'compliance.control.updated'
    | 'compliance.assessment.completed'
    | 'compliance.finding.created'
    | 'compliance.exception.approved'
    | 'compliance.exception.expired'
    | 'compliance.incident.opened'
    | 'compliance.remediation.completed'
    | 'compliance.regulatory_change.detected'
    | 'legal_hold.created'
    | 'legal_hold.approved'
    | 'legal_hold.activated'
    | 'legal_hold.scope_updated'
    | 'legal_hold.propagation_completed'
    | 'legal_hold.review_required'
    | 'legal_hold.release_requested'
    | 'legal_hold.released'
    | 'legal_hold.revoked'
    | 'retention.policy_activated'
    | 'retention.policy_updated'
    | 'retention.evaluation_completed'
    | 'retention.disposition_blocked'
    | 'retention.disposition_approved'
    | 'retention.disposition_completed'
    | 'retention.conflict_detected';
  eventVersion: string;
  idempotencyKey: string;
  correlationId: string;
  occurredAt: string;
  deliveryAttempts: number;
  payload: Record<string, unknown>;
}
