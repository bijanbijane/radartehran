export type AuthorityCategory =
  | 'MUNICIPAL_AUTHORITY'
  | 'PLANNING_AUTHORITY'
  | 'BUILDING_CONTROL_AUTHORITY'
  | 'ENVIRONMENTAL_AUTHORITY'
  | 'FIRE_AND_SAFETY_AUTHORITY'
  | 'UTILITY_PROVIDER'
  | 'HERITAGE_AUTHORITY'
  | 'DELEGATED_PUBLIC_AUTHORITY';
export type PermitCategoryGroup =
  | 'CONSTRUCTION_AND_DEVELOPMENT'
  | 'LAND_USE_AND_PLANNING'
  | 'BUILDING_COMPLETION_AND_OCCUPANCY'
  | 'INFRASTRUCTURE_AND_UTILITIES'
  | 'ENVIRONMENTAL_AND_SAFETY';
export type PermitCategoryCode =
  // 5.1 Construction & Development
  | 'NEW_CONSTRUCTION_PERMIT'
  | 'STRUCTURAL_RENOVATION_PERMIT'
  | 'NON_STRUCTURAL_RENOVATION_PERMIT'
  | 'RECONSTRUCTION_PERMIT'
  | 'DEMOLITION_PERMIT'
  | 'EXCAVATION_PERMIT'
  | 'TEMPORARY_SITE_WORKS_PERMIT'
  | 'FACADE_MODIFICATION_PERMIT'
  // 5.2 Land-Use & Planning
  | 'LAND_USE_APPROVAL'
  | 'CHANGE_OF_USE_APPROVAL'
  | 'DENSITY_OR_HEIGHT_VARIANCE_APPROVAL'
  | 'SUBDIVISION_APPROVAL'
  | 'PARCEL_CONSOLIDATION_APPROVAL'
  | 'MASTER_PLAN_OR_SITE_PLAN_APPROVAL'
  | 'ZONING_COMPLIANCE_APPROVAL'
  // 5.3 Building Completion & Occupancy
  | 'COMPLETION_CERTIFICATE'
  | 'OCCUPANCY_PERMIT'
  | 'PARTIAL_OCCUPANCY_APPROVAL'
  | 'AS_BUILT_COMPLIANCE_APPROVAL'
  | 'FINAL_INSPECTION_CLEARANCE'
  // 5.4 Infrastructure & Utilities
  | 'WATER_CONNECTION_APPROVAL'
  | 'ELECTRICITY_CONNECTION_APPROVAL'
  | 'GAS_CONNECTION_APPROVAL'
  | 'SEWAGE_OR_DRAINAGE_APPROVAL'
  | 'TELECOMMUNICATIONS_INFRASTRUCTURE_APPROVAL'
  | 'ROAD_ACCESS_OR_CURB_CUT_PERMIT'
  // 5.5 Environmental, Heritage & Safety
  | 'FIRE_SAFETY_APPROVAL'
  | 'ENVIRONMENTAL_CLEARANCE'
  | 'HERITAGE_ALTERATION_APPROVAL'
  | 'SEISMIC_OR_STRUCTURAL_SAFETY_CLEARANCE'
  | 'HAZARDOUS_MATERIAL_OR_SITE_REMEDIATION_CLEARANCE';
export const PERMIT_CATEGORY_GROUP_MAP: Record<PermitCategoryCode, PermitCategoryGroup> = {
  NEW_CONSTRUCTION_PERMIT: 'CONSTRUCTION_AND_DEVELOPMENT',
  STRUCTURAL_RENOVATION_PERMIT: 'CONSTRUCTION_AND_DEVELOPMENT',
  NON_STRUCTURAL_RENOVATION_PERMIT: 'CONSTRUCTION_AND_DEVELOPMENT',
  RECONSTRUCTION_PERMIT: 'CONSTRUCTION_AND_DEVELOPMENT',
  DEMOLITION_PERMIT: 'CONSTRUCTION_AND_DEVELOPMENT',
  EXCAVATION_PERMIT: 'CONSTRUCTION_AND_DEVELOPMENT',
  TEMPORARY_SITE_WORKS_PERMIT: 'CONSTRUCTION_AND_DEVELOPMENT',
  FACADE_MODIFICATION_PERMIT: 'CONSTRUCTION_AND_DEVELOPMENT',
  LAND_USE_APPROVAL: 'LAND_USE_AND_PLANNING',
  CHANGE_OF_USE_APPROVAL: 'LAND_USE_AND_PLANNING',
  DENSITY_OR_HEIGHT_VARIANCE_APPROVAL: 'LAND_USE_AND_PLANNING',
  SUBDIVISION_APPROVAL: 'LAND_USE_AND_PLANNING',
  PARCEL_CONSOLIDATION_APPROVAL: 'LAND_USE_AND_PLANNING',
  MASTER_PLAN_OR_SITE_PLAN_APPROVAL: 'LAND_USE_AND_PLANNING',
  ZONING_COMPLIANCE_APPROVAL: 'LAND_USE_AND_PLANNING',
  COMPLETION_CERTIFICATE: 'BUILDING_COMPLETION_AND_OCCUPANCY',
  OCCUPANCY_PERMIT: 'BUILDING_COMPLETION_AND_OCCUPANCY',
  PARTIAL_OCCUPANCY_APPROVAL: 'BUILDING_COMPLETION_AND_OCCUPANCY',
  AS_BUILT_COMPLIANCE_APPROVAL: 'BUILDING_COMPLETION_AND_OCCUPANCY',
  FINAL_INSPECTION_CLEARANCE: 'BUILDING_COMPLETION_AND_OCCUPANCY',
  WATER_CONNECTION_APPROVAL: 'INFRASTRUCTURE_AND_UTILITIES',
  ELECTRICITY_CONNECTION_APPROVAL: 'INFRASTRUCTURE_AND_UTILITIES',
  GAS_CONNECTION_APPROVAL: 'INFRASTRUCTURE_AND_UTILITIES',
  SEWAGE_OR_DRAINAGE_APPROVAL: 'INFRASTRUCTURE_AND_UTILITIES',
  TELECOMMUNICATIONS_INFRASTRUCTURE_APPROVAL: 'INFRASTRUCTURE_AND_UTILITIES',
  ROAD_ACCESS_OR_CURB_CUT_PERMIT: 'INFRASTRUCTURE_AND_UTILITIES',
  FIRE_SAFETY_APPROVAL: 'ENVIRONMENTAL_AND_SAFETY',
  ENVIRONMENTAL_CLEARANCE: 'ENVIRONMENTAL_AND_SAFETY',
  HERITAGE_ALTERATION_APPROVAL: 'ENVIRONMENTAL_AND_SAFETY',
  SEISMIC_OR_STRUCTURAL_SAFETY_CLEARANCE: 'ENVIRONMENTAL_AND_SAFETY',
  HAZARDOUS_MATERIAL_OR_SITE_REMEDIATION_CLEARANCE: 'ENVIRONMENTAL_AND_SAFETY',
};
export interface AuthorityJurisdictionScope {
  countryCode?: string;
  provinceCode?: string;
  citySlug: string;
  districtCodes?: string[];
  neighborhoodIdsOrSlugs?: string[];
}
export interface IssuingAuthorityRecord {
  id: string;
  name: string;
  authorityCategory: AuthorityCategory;
  jurisdictionScope: AuthorityJurisdictionScope;
  authorizedPermitCategories: PermitCategoryCode[];
  officialReferenceMetadata?: string;
  active: boolean;
  isSyntheticTestFixture: boolean;
  createdAt: string;
  updatedAt: string;
}
export interface PermitSubjectReference {
  propertyId: string;
  parcelId?: string;
  buildingOrUnitId?: string;
  developmentProjectId?: string;
  citySlug: string;
  districtCode?: string;
  neighborhoodIdOrSlug?: string;
}
export type ApplicantRelationshipType =
  | 'PROPERTY_OWNER'
  | 'CO_OWNER'
  | 'AUTHORIZED_REPRESENTATIVE'
  | 'DEVELOPER_WITH_MANDATE'
  | 'CONTRACTOR_WITH_AUTHORIZATION';
export type ApplicationWorkflowStatus =
  | 'DRAFT'
  | 'READY_FOR_SUBMISSION'
  | 'SUBMITTED'
  | 'ACKNOWLEDGED'
  | 'UNDER_REVIEW'
  | 'ADDITIONAL_INFORMATION_REQUIRED'
  | 'RESUBMITTED'
  | 'APPROVED'
  | 'REJECTED'
  | 'WITHDRAWN'
  | 'CLOSED'
  | 'UNKNOWN';
export type ApplicationSubmissionChannel =
  | 'NOT_SUBMITTED'
  | 'MANUALLY_REPORTED_BY_APPLICANT'
  | 'CONFIRMED_EXTERNAL_AUTHORITY_INTEGRATION';
export type RequirementChecklistItemStatus =
  | 'REQUIRED_MISSING'
  | 'SUBMITTED_UNREVIEWED'
  | 'REVIEWED_PENDING_DECISION'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'UNKNOWN_STATUS';
export interface ApplicationRequirementChecklistItem {
  requirementId: string;
  title: string;
  mandatory: boolean;
  submittedEvidenceIds: string[];
  status: RequirementChecklistItemStatus;
  reviewerNotes?: string;
}
export interface ApplicationAdditionalInfoExchange {
  id: string;
  requestedAtIso: string;
  authorityReferenceNumber?: string;
  requestSummary: string;
  respondedAtIso?: string;
  applicantResponseSummary?: string;
  responseEvidenceIds?: string[];
  status: 'OPEN_PENDING_APPLICANT' | 'RESPONDED_BY_APPLICANT' | 'CLOSED_BY_AUTHORITY';
}
export interface ApplicationOfficialDecisionReference {
  officialDecisionReferenceNumber: string;
  decisionDateIso: string;
  decisionOutcome: 'APPROVED' | 'REJECTED';
  decisionSummary: string;
  supportingEvidenceIds: string[];
  recordedByActorId: string;
  recordedAtIso: string;
}
export type SourceVerificationStatus =
  | 'UNVERIFIED_CLAIM'
  | 'DOCUMENTED_UNVERIFIED'
  | 'INDEPENDENTLY_VERIFIED_OFFICIAL_SOURCE'
  | 'DISPUTED'
  | 'SUPERSEDED';
export interface PermitEvidenceAttachmentRef {
  evidenceId: string;
  documentType: string;
  title: string;
  verificationStatus: SourceVerificationStatus;
  uploadedByActorId: string;
  uploadedAtIso: string;
}
export interface PermitApplicationRecord {
  id: string;
  isIssuedPermitRecord: false;
  permitCategory: PermitCategoryCode;
  permitCategoryGroup: PermitCategoryGroup;
  issuingAuthorityId: string;
  subjectRef: PermitSubjectReference;
  applicantPartyId: string;
  applicantRelationship: ApplicantRelationshipType;
  representativePartyId?: string;
  requestedScopeSummary: string;
  workflowStatus: ApplicationWorkflowStatus;
  submissionChannel: ApplicationSubmissionChannel;
  externalApplicationReferenceNumber?: string;
  submittedAtIso?: string;
  acknowledgedAtIso?: string;
  requirementChecklist: ApplicationRequirementChecklistItem[];
  additionalInfoExchanges: ApplicationAdditionalInfoExchange[];
  officialDecisionReference?: ApplicationOfficialDecisionReference;
  resultingPermitId?: string;
  supportingEvidence: PermitEvidenceAttachmentRef[];
  notes?: string;
  isSyntheticTestFixture: boolean;
  createdAt: string;
  updatedAt: string;
}
export type OfficialDecisionStatus =
  | 'APPROVED'
  | 'CONDITIONAL_APPROVAL'
  | 'SUSPENDED'
  | 'REVOKED'
  | 'SUPERSEDED_BY_REPLACEMENT'
  | 'UNKNOWN';
export type PermitValidityStatus =
  | 'NOT_YET_EFFECTIVE'
  | 'VALID_VERIFIED_ACTIVE'
  | 'DOCUMENTED_BUT_UNVERIFIED'
  | 'UNVERIFIED_CLAIM_ONLY'
  | 'EXPIRED'
  | 'INVALID_SUSPENDED_OR_REVOKED'
  | 'SUPERSEDED'
  | 'DISPUTED'
  | 'UNKNOWN';
export type ConditionFulfillmentStatus =
  | 'STATED_IN_OFFICIAL_DECISION_PENDING'
  | 'INTERNALLY_SUMMARIZED_PENDING'
  | 'REPORTED_FULFILLED_BY_HOLDER'
  | 'FULFILLMENT_INDEPENDENTLY_VERIFIED'
  | 'OVERDUE_OR_NON_COMPLIANT'
  | 'WAIVED_BY_AUTHORITY';
export interface PermitMultiDimensionalStatus {
  internalWorkflowStatus: 'REGISTERED_RECORD' | 'ARCHIVED_RECORD';
  officialAuthorityDecisionStatus: OfficialDecisionStatus;
  permitValidityStatus: PermitValidityStatus;
  sourceVerificationStatus: SourceVerificationStatus;
  evidenceCompleteness: 'COMPLETE' | 'PARTIAL' | 'MISSING' | 'UNVERIFIED';
  conditionFulfillmentStatus:
    | 'NO_CONDITIONS'
    | 'ALL_VERIFIED_FULFILLED'
    | 'PENDING_CONDITIONS'
    | 'REPORTED_FULFILLED_BY_HOLDER'
    | 'OVERDUE_OR_NON_COMPLIANT';
}
export interface PermitStatusHistoryEntry {
  id: string;
  changedAtIso: string;
  changedByActorId: string;
  changedByRole: PermitActorRole;
  previousValidityStatus: PermitValidityStatus;
  newValidityStatus: PermitValidityStatus;
  reasonSummary: string;
  officialReferenceNumber?: string;
}
export interface PermitRecord {
  id: string;
  isIssuedPermitRecord: true;
  officialPermitNumber: string;
  permitCategory: PermitCategoryCode;
  permitCategoryGroup: PermitCategoryGroup;
  issuingAuthorityId: string;
  originatingApplicationId?: string;
  subjectRef: PermitSubjectReference;
  holderPartyIds: string[];
  approvedScopeSummary: string;
  issueDateIso: string;
  effectiveStartDateIso: string;
  expirationDateIso?: string;
  officialDecisionStatus: OfficialDecisionStatus;
  sourceVerificationStatus: SourceVerificationStatus;
  multiDimensionalStatus: PermitMultiDimensionalStatus;
  conditionIds: string[];
  supportingEvidence: PermitEvidenceAttachmentRef[];
  statusHistory: PermitStatusHistoryEntry[];
  supersededByPermitId?: string;
  version: number;
  isSyntheticTestFixture: boolean;
  createdAt: string;
  updatedAt: string;
}
export type ConditionTimingCategory =
  | 'PRE_COMMENCEMENT'
  | 'DURING_CONSTRUCTION'
  | 'PRE_COMPLETION'
  | 'PRE_OCCUPANCY'
  | 'ONGOING_OPERATIONAL';
export interface PermitConditionRecord {
  id: string;
  permitId: string;
  conditionCode: string;
  description: string;
  timingCategory: ConditionTimingCategory;
  responsiblePartyId: string;
  dueDateIso?: string;
  fulfillmentStatus: ConditionFulfillmentStatus;
  blocksCompletionOrOccupancy: boolean;
  supportingEvidenceIds: string[];
  verifiedByActorId?: string;
  verifiedAtIso?: string;
  verificationNotes?: string;
  isSyntheticTestFixture: boolean;
  createdAt: string;
  updatedAt: string;
}
export interface PermitAmendmentOrRenewalRecord {
  id: string;
  targetPermitId: string;
  requestType: 'AMENDMENT' | 'EXTENSION' | 'RENEWAL';
  requestedByPartyId: string;
  requestedChangesSummary: string;
  requestedNewExpirationDateIso?: string;
  requestedNewScopeSummary?: string;
  requestStatus:
    | 'REQUESTED_PENDING_AUTHORITY'
    | 'APPROVED_BY_AUTHORITY'
    | 'REJECTED_BY_AUTHORITY'
    | 'WITHDRAWN';
  authorityDecisionReference?: string;
  supportingEvidenceIds: string[];
  replacementPermitId?: string;
  requestedAtIso: string;
  decidedAtIso?: string;
}
export type InspectionStageCategory =
  | 'SITE_PREPARATION_INSPECTION'
  | 'FOUNDATION_INSPECTION'
  | 'STRUCTURAL_FRAME_INSPECTION'
  | 'UTILITY_AND_MEP_INSPECTION'
  | 'FIRE_AND_SAFETY_INSPECTION'
  | 'ENVIRONMENTAL_COMPLIANCE_INSPECTION'
  | 'FINAL_COMPLETION_INSPECTION'
  | 'OCCUPANCY_READINESS_INSPECTION'
  | 'FOLLOW_UP_REINSPECTION';
export type InspectionVerificationStatus =
  | 'INTERNALLY_SCHEDULED'
  | 'REPORTED_COMPLETED_BY_APPLICANT'
  | 'CONFIRMED_COMPLETED_BY_AUTHORITY'
  | 'OFFICIAL_RESULT_PASSED'
  | 'OFFICIAL_RESULT_FAILED'
  | 'OFFICIAL_RESULT_CONDITIONAL';
export interface PermitInspectionRecord {
  id: string;
  permitId?: string;
  applicationId?: string;
  inspectionStage: InspectionStageCategory;
  scheduledDateIso?: string;
  conductedDateIso?: string;
  inspectingAuthorityId: string;
  officialInspectionReference?: string;
  verificationStatus: InspectionVerificationStatus;
  findingsSummary: string;
  followUpRequired: boolean;
  supportingEvidenceIds: string[];
  isSyntheticTestFixture: boolean;
  createdAt: string;
  updatedAt: string;
}
export type FeeRequirementStatus =
  | 'ESTIMATED_FEE'
  | 'OFFICIALLY_ASSESSED_OUTSTANDING'
  | 'REPORTED_PAID_BY_APPLICANT_UNVERIFIED'
  | 'CONFIRMED_PAID_BY_AUTHORITATIVE_SOURCE'
  | 'WAIVED_OR_REFUNDED';
export interface PermitFeeRecord {
  id: string;
  permitId?: string;
  applicationId?: string;
  feeType: string;
  amountRials: number;
  currency: 'IRR';
  issuingAuthorityId: string;
  feeStatus: FeeRequirementStatus;
  officialAssessmentReference?: string;
  externalPaymentReferenceNumber?: string;
  dueDateIso?: string;
  receiptEvidenceIds: string[];
  processedByPlatform: false;
  isSyntheticTestFixture: boolean;
  createdAt: string;
  updatedAt: string;
}
export type DeadlineClassification =
  | 'OFFICIAL_AUTHORITY_DEADLINE'
  | 'ESTIMATED_TARGET_DATE'
  | 'INTERNAL_CONFIGURED_REMINDER';
export type DeadlineUrgencyStatus = 'UPCOMING' | 'DUE_SOON' | 'OVERDUE' | 'COMPLETED';
export interface PermitDeadlineRecord {
  id: string;
  targetType: 'APPLICATION' | 'PERMIT' | 'CONDITION' | 'INSPECTION' | 'FEE';
  targetId: string;
  propertyId: string;
  deadlineClassification: DeadlineClassification;
  title: string;
  dueDateIso: string;
  urgencyStatus: DeadlineUrgencyStatus;
  completedAtIso?: string;
  createdAt: string;
  updatedAt: string;
}
export interface PropertyAndProjectPermitProfile {
  propertyId: string;
  applications: PermitApplicationRecord[];
  permits: PermitRecord[];
  conditionsByPermitId: Record<string, PermitConditionRecord[]>;
  inspections: PermitInspectionRecord[];
  fees: PermitFeeRecord[];
  upcomingAndOverdueDeadlines: PermitDeadlineRecord[];
}
export type PermitActorRole =
  | 'PROPERTY_OWNER'
  | 'APPLICANT'
  | 'AUTHORIZED_REPRESENTATIVE'
  | 'PERMIT_CASE_OFFICER'
  | 'REGULATORY_COMPLIANCE_ADMIN'
  | 'SYSTEM_AUTOMATION'
  | 'AUDITOR_READ_ONLY';
export interface PermitActorContext {
  actorId: string;
  role: PermitActorRole;
}
export interface PermitAuditEvent {
  id: string;
  targetType: 'AUTHORITY' | 'APPLICATION' | 'PERMIT' | 'CONDITION' | 'AMENDMENT_OR_RENEWAL' | 'INSPECTION' | 'FEE';
  targetId: string;
  action: string;
  actorId: string;
  actorRole: PermitActorRole;
  occurredAt: string;
  summary: string;
}
export interface PermitIdempotencyRecord {
  key: string;
  operation: 'SUBMIT_APPLICATION' | 'REGISTER_PERMIT';
  targetId: string;
  createdAt: string;
}
export type PermitErrorCode =
  | 'VALIDATION_FAILED'
  | 'RESOURCE_NOT_FOUND'
  | 'AUTHORITY_NOT_EMPOWERED_FOR_CATEGORY'
  | 'JURISDICTION_MISMATCH'
  | 'UNAUTHORIZED_APPLICANT_RELATIONSHIP'
  | 'INSUFFICIENT_ROLE_PRIVILEGE'
  | 'APPLICANT_CANNOT_SELF_APPROVE'
  | 'INVALID_WORKFLOW_TRANSITION'
  | 'DUPLICATE_ACTIVE_APPLICATION'
  | 'MISSING_OFFICIAL_DECISION_REFERENCE'
  | 'UNVERIFIED_INSPECTION_PASS_REJECTED'
  | 'UNVERIFIED_PAYMENT_CLAIM_REJECTED';
export class PermitError extends Error {
  constructor(
    public readonly code: PermitErrorCode,
    message: string,
    public readonly statusCode: number = 400
  ) {
    super(message);
    this.name = 'PermitError';
  }
}
