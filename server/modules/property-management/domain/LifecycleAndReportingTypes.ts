import type { NormalizedTimestamp } from '../../core';
import type {
  PropertyManagementNotificationOutboxEvent,
  TrustAndSafetyCaseCategory,
} from '../contracts/externalAdapters';

export type RenewalRequestState = 'PROPOSED' | 'ACCEPTED' | 'REJECTED' | 'WITHDRAWN';

export interface LeaseRenewalRequestRecord {
  id: string;
  agreementId: string;
  propertyRefId: string;
  initiatedByUid: string;
  initiatorRole: 'LANDLORD' | 'TENANT' | 'AUTHORIZED_MANAGER';
  proposedNewRent: number;
  proposedNewDeposit: number;
  proposedStartDateIso: string;
  proposedEndDateIso: string;
  revisedConditions: string;
  status: RenewalRequestState;
  resultingAgreementVersion?: number;
  decidedByUid?: string;
  decidedAt?: NormalizedTimestamp;
  decisionNote?: string;
  decisionHistory: Array<{
    status: RenewalRequestState;
    actorUid: string;
    occurredAt: NormalizedTimestamp;
    note?: string;
  }>;
  revision: number;
  createdAt: NormalizedTimestamp;
  updatedAt: NormalizedTimestamp;
}

export type TerminationWorkflowState =
  | 'REQUESTED'
  | 'ACKNOWLEDGED'
  | 'HANDOVER_PENDING'
  | 'COMPLETED'
  | 'DISPUTED'
  | 'CANCELLED';

export interface LeaseTerminationWorkflowRecord {
  id: string;
  agreementId: string;
  propertyRefId: string;
  initiatedByUid: string;
  initiatorRole: 'LANDLORD' | 'TENANT' | 'AUTHORIZED_MANAGER';
  tenantNoticeRef?: string;
  landlordNoticeRef?: string;
  terminationReason: string;
  isEarlyTermination: boolean;
  intendedTerminationDateIso: string;
  actualTerminationDateIso?: string;
  finalHandoverId?: string;
  status: TerminationWorkflowState;
  verifiedLegalPolicyRefCode?: string;
  legalDeterminationDisclaimer: string;
  history: Array<{
    status: TerminationWorkflowState;
    actorUid: string;
    occurredAt: NormalizedTimestamp;
    note?: string;
  }>;
  revision: number;
  createdAt: NormalizedTimestamp;
  updatedAt: NormalizedTimestamp;
}

export type HandoverType =
  | 'INITIAL_TENANT_MOVE_IN'
  | 'TENANT_MOVE_OUT'
  | 'PROPERTY_MANAGER_CHANGE'
  | 'MANAGER_TO_MANAGER_TRANSFER'
  | 'OTHER_SUPPORTED_HANDOVER';

export type HandoverConfirmationState =
  | 'PROPOSED'
  | 'PARTIALLY_CONFIRMED'
  | 'COMPLETED_CONFIRMED'
  | 'DISPUTED'
  | 'CANCELLED';

export interface HandoverParticipantRecord {
  uid: string;
  role: 'LANDLORD' | 'TENANT' | 'OUTGOING_MANAGER' | 'INCOMING_MANAGER' | 'WITNESS';
  confirmed: boolean;
  confirmedAt?: NormalizedTimestamp;
  confirmationNote?: string;
}

export interface MeterReadingEntry {
  meterType: 'ELECTRICITY' | 'WATER' | 'GAS' | 'HEATING' | 'OTHER';
  meterSerialRef: string;
  readingValue: number;
  unit: string;
  recordedAtIso: string;
}

export interface SanitizedAccessItemEntry {
  itemType: 'PHYSICAL_KEY' | 'MAGNETIC_FOB' | 'PARKING_REMOTE' | 'MAILBOX_KEY';
  itemLabel: string;
  quantity: number;
  handedOver: boolean;
}

export interface HandoverDisagreementEntry {
  disagreementId: string;
  reportedByUid: string;
  reportedByRole: string;
  statement: string;
  evidenceMediaIds: string[];
  recordedAt: NormalizedTimestamp;
}

export interface PropertyHandoverRecord {
  id: string;
  propertyRefId: string;
  buildingRefId?: string;
  unitRefId?: string;
  relatedOccupancyId?: string;
  relatedAgreementId?: string;
  handoverType: HandoverType;
  participants: HandoverParticipantRecord[];
  scheduledAtIso: string;
  completedAtIso?: string;
  meterReadings: MeterReadingEntry[];
  keyAndAccessItems: SanitizedAccessItemEntry[];
  originalPropertyConditionSummary: string;
  propertyConditionSummary: string;
  outstandingIssueRefs: string[];
  disagreements: HandoverDisagreementEntry[];
  evidenceMediaIds: string[];
  confirmationState: HandoverConfirmationState;
  revision: number;
  createdAt: NormalizedTimestamp;
  updatedAt: NormalizedTimestamp;
}

export type PropertyInspectionType =
  | 'MOVE_IN_INSPECTION'
  | 'MOVE_OUT_INSPECTION'
  | 'PERIODIC_CONDITION_INSPECTION'
  | 'MAINTENANCE_INSPECTION'
  | 'DAMAGE_INSPECTION'
  | 'PRE_MANAGEMENT_INSPECTION';

export type InspectionStatus = 'SCHEDULED' | 'COMPLETED' | 'AMENDED' | 'FOLLOW_UP_REQUIRED';

export interface InspectionConditionCategoryEntry {
  categoryName: string;
  rating: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR' | 'DAMAGED';
  notes: string;
}

export interface InspectionAmendmentEntry {
  versionNumber: number;
  amendedByUid: string;
  amendmentReason: string;
  conditionCategories: InspectionConditionCategoryEntry[];
  reportedDefects: string[];
  maintenanceRecommendations: string[];
  evidenceMediaIds: string[];
  amendedAt: NormalizedTimestamp;
}

export interface PropertyInspectionRecord {
  id: string;
  propertyRefId: string;
  buildingRefId?: string;
  unitRefId?: string;
  relatedOccupancyId?: string;
  relatedAgreementId?: string;
  inspectionType: PropertyInspectionType;
  inspectionDateIso: string;
  inspectorUid: string;
  inspectorRole: 'LANDLORD' | 'AUTHORIZED_MANAGER' | 'DESIGNATED_INSPECTOR';
  inPersonAttendanceRecordedByAuthorizedActor: boolean;
  assessmentDistinction:
    | 'OPERATIONAL_INSPECTION_NOT_CERTIFIED_ENGINEERING_ASSESSMENT'
    | 'EXTERNAL_CERTIFIED_ASSESSMENT_REFERENCE_ONLY';
  originalFindingsSnapshot: {
    conditionCategories: InspectionConditionCategoryEntry[];
    reportedDefects: string[];
    maintenanceRecommendations: string[];
  };
  conditionCategories: InspectionConditionCategoryEntry[];
  reportedDefects: string[];
  maintenanceRecommendations: string[];
  evidenceMediaIds: string[];
  status: InspectionStatus;
  followUpMaintenanceRequestIds: string[];
  currentVersion: number;
  amendmentHistory: InspectionAmendmentEntry[];
  revision: number;
  createdAt: NormalizedTimestamp;
  updatedAt: NormalizedTimestamp;
}

export type MaintenanceIssueCategory =
  | 'PLUMBING'
  | 'ELECTRICAL'
  | 'HEATING_AND_COOLING'
  | 'ELEVATOR'
  | 'STRUCTURAL_CONCERN'
  | 'ROOF_AND_WATERPROOFING'
  | 'PAINTING'
  | 'FLOORING'
  | 'DOORS_AND_WINDOWS'
  | 'CLEANING'
  | 'PEST_CONTROL'
  | 'GENERAL_MAINTENANCE'
  | 'OTHER_CLASSIFIED_ISSUE';

export const ALL_MAINTENANCE_ISSUE_CATEGORIES: readonly MaintenanceIssueCategory[] = [
  'PLUMBING',
  'ELECTRICAL',
  'HEATING_AND_COOLING',
  'ELEVATOR',
  'STRUCTURAL_CONCERN',
  'ROOF_AND_WATERPROOFING',
  'PAINTING',
  'FLOORING',
  'DOORS_AND_WINDOWS',
  'CLEANING',
  'PEST_CONTROL',
  'GENERAL_MAINTENANCE',
  'OTHER_CLASSIFIED_ISSUE',
] as const;

export type MaintenanceUrgency = 'LOW' | 'MEDIUM' | 'HIGH' | 'EMERGENCY';

export type MaintenanceWorkflowState =
  | 'SUBMITTED'
  | 'REVIEWED'
  | 'AWAITING_AUTHORIZATION'
  | 'APPROVED'
  | 'PROVIDER_REQUESTED'
  | 'SCHEDULED'
  | 'IN_PROGRESS'
  | 'AWAITING_INSPECTION'
  | 'COMPLETED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'DISPUTED';

export interface MaintenanceCostBreakdown {
  estimatedCostAmount?: number;
  agreedCostAmount?: number;
  confirmedPaidAmount?: number;
  confirmedPaymentExternalRefId?: string;
  currency: 'IRT' | 'TOMAN' | 'IRR';
  spendingApprovedByUid?: string;
  spendingApprovedAt?: NormalizedTimestamp;
}

export interface MaintenanceRequestRecord {
  id: string;
  propertyRefId: string;
  buildingRefId?: string;
  unitRefId?: string;
  isCommonAreaOrBuildingEquipment: boolean;
  requestingParticipantUid: string;
  requestingParticipantRole: 'TENANT' | 'LANDLORD' | 'AUTHORIZED_MANAGER';
  issueCategory: MaintenanceIssueCategory;
  description: string;
  urgency: MaintenanceUrgency;
  affectedArea: string;
  privateAccessRequirements: string;
  evidenceMediaIds: string[];
  assignedManagerUid?: string;
  serviceProviderRefId?: string;
  workOrderRefId?: string;
  costTracking: MaintenanceCostBreakdown;
  status: MaintenanceWorkflowState;
  completedAt?: NormalizedTimestamp;
  history: Array<{
    fromStatus: MaintenanceWorkflowState | 'NONE';
    toStatus: MaintenanceWorkflowState;
    actorUid: string;
    occurredAt: NormalizedTimestamp;
    note?: string;
  }>;
  revision: number;
  createdAt: NormalizedTimestamp;
  updatedAt: NormalizedTimestamp;
}

export type PropertyIncidentCategory =
  | 'WATER_LEAK'
  | 'FIRE_OR_SMOKE_DAMAGE'
  | 'EQUIPMENT_FAILURE'
  | 'STRUCTURAL_CONCERN'
  | 'SECURITY_INCIDENT'
  | 'TENANT_REPORTED_DAMAGE'
  | 'COMMON_AREA_INCIDENT'
  | 'OTHER_PROPERTY_INCIDENT';

export type IncidentSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type IncidentResolutionStatus =
  | 'OPEN'
  | 'IMMEDIATE_ACTION_TAKEN'
  | 'UNDER_REVIEW'
  | 'ESCALATED_TO_TRUST_AND_SAFETY'
  | 'RESOLVED'
  | 'DISPUTED'
  | 'CLOSED';

export interface IncidentSubsequentUpdateEntry {
  updateId: string;
  authorUid: string;
  authorRole: string;
  note: string;
  findingClassification: 'ALLEGATION_UNCONFIRMED' | 'OPERATIONAL_OBSERVATION' | 'CONFIRMED_OPERATIONAL_FINDING';
  additionalEvidenceMediaIds: string[];
  recordedAt: NormalizedTimestamp;
}

export interface PropertyIncidentRecord {
  id: string;
  propertyRefId: string;
  buildingRefId?: string;
  unitRefId?: string;
  reportingPartyUid: string;
  reportingPartyRole: 'TENANT' | 'LANDLORD' | 'AUTHORIZED_MANAGER';
  incidentCategory: PropertyIncidentCategory;
  originalReport: {
    description: string;
    reportedOccurrenceTimeIso: string;
    submittedAtIso: string;
    severity: IncidentSeverity;
    evidenceMediaIds: string[];
  };
  findingClassification: 'ALLEGATION_UNCONFIRMED' | 'OPERATIONAL_OBSERVATION' | 'CONFIRMED_OPERATIONAL_FINDING';
  nonInsuranceNonLegalDisclaimer: string;
  immediateActions: string[];
  subsequentUpdates: IncidentSubsequentUpdateEntry[];
  relatedMaintenanceRequestId?: string;
  trustAndSafetyInvestigationRefId?: string;
  trustAndSafetyCategory?: TrustAndSafetyCaseCategory;
  resolutionStatus: IncidentResolutionStatus;
  revision: number;
  createdAt: NormalizedTimestamp;
  updatedAt: NormalizedTimestamp;
}

export interface PropertyManagementActivityRecord {
  id: string;
  portfolioId?: string;
  propertyRefId: string;
  entityType:
    | 'PORTFOLIO'
    | 'AUTHORIZATION'
    | 'OCCUPANCY'
    | 'AGREEMENT'
    | 'RENEWAL'
    | 'TERMINATION'
    | 'OBLIGATION'
    | 'HANDOVER'
    | 'INSPECTION'
    | 'MAINTENANCE'
    | 'INCIDENT'
    | 'DISPUTE_ESCALATION';
  entityId: string;
  action: string;
  actorUid: string;
  actorRole: string;
  summary: string;
  correlationId: string;
  occurredAt: NormalizedTimestamp;
}

export interface PortfolioOperationalReport {
  portfolioId: string;
  generatedAtIso: string;
  reportingWindow: {
    windowStartIso: string;
    windowEndIso: string;
    upcomingExpirationHorizonDays: number;
  };
  metrics: {
    managedPropertyCount: number;
    activeOccupancyCount: number;
    upcomingAgreementExpirationsCount: number;
    renewalStats: {
      totalDecidedRenewalRequestsInWindow: number;
      acceptedRenewalsInWindow: number;
      renewalRateRatio: number | null;
    };
    financialObligationsInWindow: {
      scheduledObligationCount: number;
      scheduledRentTotalAmount: number;
      scheduledDepositTotalAmount: number;
      tenantSelfReportedPaidCount: number;
      tenantSelfReportedPaidAmount: number;
      authoritativeConfirmedPaidCount: number;
      authoritativeConfirmedPaidAmount: number;
      overdueObligationCount: number;
      unconfirmedPaymentDisclaimer: string;
    };
    maintenanceMetricsInWindow: {
      totalMaintenanceRequests: number;
      completedMaintenanceRequests: number;
      averageResolutionTimeMs: number | null;
    };
    openIncidentsCount: number;
    handoverActivityInWindow: {
      scheduledCount: number;
      completedConfirmedCount: number;
      disputedCount: number;
    };
    inspectionActivityInWindow: {
      totalInspectionsCount: number;
      followUpRequiredCount: number;
    };
  };
  outboxEventsCount?: number;
}

export type { PropertyManagementNotificationOutboxEvent };
