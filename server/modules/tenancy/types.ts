import type {
  AuditEventSink,
  DelegatedAdminStoreAdapter,
  FirebaseTokenVerifierAdapter,
  IdempotencyStoreAdapter,
  TransactionRunnerAdapter,
} from '../core';
import type {
  RentalFrequency,
  TransactionCurrency,
} from '../transactions';

export type RentalAvailabilityStatus =
  | 'AVAILABLE'
  | 'APPLICATIONS_OPEN'
  | 'RESERVED'
  | 'RENTED'
  | 'MAINTENANCE'
  | 'UNAVAILABLE';

export const ALL_RENTAL_AVAILABILITY_STATUSES: readonly RentalAvailabilityStatus[] = [
  'AVAILABLE',
  'APPLICATIONS_OPEN',
  'RESERVED',
  'RENTED',
  'MAINTENANCE',
  'UNAVAILABLE',
] as const;

export type FurnishingStatus = 'UNFURNISHED' | 'SEMI_FURNISHED' | 'FULLY_FURNISHED';

export type RentalCategory = 'RESIDENTIAL_APARTMENT' | 'VILLA' | 'COMMERCIAL_UNIT' | 'OFFICE_SPACE';

export type RentalPropertyConfigRecord = {
  propertyId: string;
  landlordUid: string;
  propertyManagerUid?: string;
  brokerUid?: string;
  availabilityStatus: RentalAvailabilityStatus;
  rentalCategory: RentalCategory;
  maxOccupancyCount: number;
  furnishingStatus: FurnishingStatus;
  facilities: string[];
  parkingSpaces: number;
  hasStorageUnit: boolean;
  rentalConditions: string;
  minLeaseDurationMonths: number;
  maxLeaseDurationMonths: number;
  requiredDepositAmount: number;
  advertisedPeriodicRentAmount: number;
  currency: TransactionCurrency;
  availableFromIso: string;
  activeLeaseId?: string;
  createdAtIso: string;
  updatedAtIso: string;
};

export type RentalApplicationStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'ADDITIONAL_INFORMATION_REQUIRED'
  | 'APPROVED'
  | 'REJECTED'
  | 'WITHDRAWN'
  | 'EXPIRED';

export const ALL_RENTAL_APPLICATION_STATUSES: readonly RentalApplicationStatus[] = [
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'ADDITIONAL_INFORMATION_REQUIRED',
  'APPROVED',
  'REJECTED',
  'WITHDRAWN',
  'EXPIRED',
] as const;

export type ScreeningVerificationItemStatus =
  | 'NOT_SUBMITTED'
  | 'PENDING_REVIEW'
  | 'VERIFIED'
  | 'FAILED'
  | 'WAIVED';

export type TenantScreeningReferenceRecord = {
  screeningId: string;
  applicationId: string;
  propertyId: string;
  applicantUid: string;
  identityVerificationStatus: ScreeningVerificationItemStatus;
  documentVerificationStatus: ScreeningVerificationItemStatus;
  referenceVerificationStatus: ScreeningVerificationItemStatus;
  incomeDocumentationStatus: ScreeningVerificationItemStatus;
  employmentVerificationStatus: ScreeningVerificationItemStatus;
  externalProviderReference?: string;
  manualReviewStatus: 'PENDING' | 'APPROVED' | 'REJECTED';
  reviewedByUid?: string;
  reviewNote?: string;
  updatedAtIso: string;
};

export type RentalApplicationRecord = {
  applicationId: string;
  propertyId: string;
  landlordUid: string;
  applicantUid: string;
  proposedPeriodicRentAmount: number;
  proposedDepositAmount: number;
  currency: TransactionCurrency;
  desiredMoveInDateIso: string;
  desiredLeaseDurationMonths: number;
  occupantCount: number;
  applicantNote?: string;
  status: RentalApplicationStatus;
  screeningId?: string;
  linkedTransactionId?: string;
  decidedByUid?: string;
  decisionReason?: string;
  expiresAtIso: string;
  createdAtIso: string;
  updatedAtIso: string;
};

export type LeaseAgreementStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'SIGNATURE_PENDING'
  | 'ACTIVE'
  | 'EXPIRING'
  | 'EXPIRED'
  | 'TERMINATION_PENDING'
  | 'TERMINATED'
  | 'DISPUTED';

export const ALL_LEASE_AGREEMENT_STATUSES: readonly LeaseAgreementStatus[] = [
  'DRAFT',
  'PENDING_APPROVAL',
  'APPROVED',
  'SIGNATURE_PENDING',
  'ACTIVE',
  'EXPIRING',
  'EXPIRED',
  'TERMINATION_PENDING',
  'TERMINATED',
  'DISPUTED',
] as const;

export type LeaseAgreementRecord = {
  leaseId: string;
  propertyId: string;
  transactionId: string;
  applicationId?: string;
  previousLeaseId?: string;
  renewedByLeaseId?: string;
  landlordUid: string;
  tenantUid: string;
  propertyManagerUid?: string;
  brokerUid?: string;
  leaseStartDateIso: string;
  leaseEndDateIso: string;
  periodicRentAmount: number;
  depositAmount: number;
  currency: TransactionCurrency;
  paymentFrequency: RentalFrequency;
  customIntervalDays?: number;
  installmentCount: number;
  gracePeriodDays: number;
  contractualConditions: string;
  permittedRentAdjustmentClauseRef?: string;
  contractDocumentId: string;
  status: LeaseAgreementStatus;
  approvedByLandlord: boolean;
  approvedByTenant: boolean;
  signedByLandlord: boolean;
  signedByTenant: boolean;
  rentalScheduleId?: string;
  depositRecordId?: string;
  amendmentIds: string[];
  activatedAtIso?: string;
  terminatedAtIso?: string;
  createdAtIso: string;
  updatedAtIso: string;
};

export type DepositDeductionEntry = {
  deductionId: string;
  amount: number;
  reason: string;
  authorizationReference: string;
  inspectionReferenceId?: string;
  obligationId?: string;
  recordedByUid: string;
  recordedAtIso: string;
};

export type TenancyDepositRecord = {
  depositId: string;
  leaseId: string;
  transactionId: string;
  propertyId: string;
  tenantUid: string;
  landlordUid: string;
  requiredDepositAmount: number;
  confirmedDepositAmount: number;
  deductedAmount: number;
  refundedAmount: number;
  refundableBalance: number;
  currency: TransactionCurrency;
  depositObligationId: string;
  depositSettlementId?: string;
  refundId?: string;
  status:
    | 'AWAITING_PAYMENT'
    | 'HELD_CONFIRMED'
    | 'PARTIALLY_DEDUCTED'
    | 'REFUND_INITIATED'
    | 'REFUND_CONFIRMED'
    | 'DISPUTED';
  deductions: DepositDeductionEntry[];
  updatedAtIso: string;
};

export type LeaseRenewalProposalRecord = {
  renewalId: string;
  originalLeaseId: string;
  propertyId: string;
  transactionId: string;
  proposedByUid: string;
  newLeaseStartDateIso: string;
  newLeaseEndDateIso: string;
  proposedPeriodicRentAmount: number;
  proposedDepositAmount: number;
  currency: TransactionCurrency;
  installmentCount: number;
  proposedConditions: string;
  status: 'INVITED' | 'PROPOSED' | 'COUNTERPROPOSED' | 'ACCEPTED' | 'REJECTED' | 'RENEWED_LEASE_CREATED';
  landlordDecision?: 'ACCEPTED' | 'REJECTED' | 'COUNTERED';
  tenantDecision?: 'ACCEPTED' | 'REJECTED' | 'COUNTERED';
  successorLeaseId?: string;
  createdAtIso: string;
  updatedAtIso: string;
};

export type RentAdjustmentRecord = {
  adjustmentId: string;
  leaseId: string;
  transactionId: string;
  contractualClauseReference: string;
  previousRentAmount: number;
  newRentAmount: number;
  currency: TransactionCurrency;
  effectiveDateIso: string;
  reason: string;
  proposedByUid: string;
  approvedByLandlord: boolean;
  approvedByTenant: boolean;
  status: 'PROPOSED' | 'APPROVED' | 'REJECTED' | 'APPLIED';
  createdAtIso: string;
  updatedAtIso: string;
};

export type LeaseAmendmentRecord = {
  amendmentId: string;
  leaseId: string;
  transactionId: string;
  reason: string;
  changedFields: Record<string, { previousValue: string | number | boolean; proposedValue: string | number | boolean }>;
  effectiveDateIso: string;
  amendmentDocumentId?: string;
  approvedByLandlord: boolean;
  approvedByTenant: boolean;
  status: 'PROPOSED' | 'APPROVED' | 'REJECTED';
  createdByUid: string;
  createdAtIso: string;
  updatedAtIso: string;
};

export type MaintenancePriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'EMERGENCY';

export type MaintenanceStatus =
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'APPROVED'
  | 'ASSIGNED'
  | 'IN_PROGRESS'
  | 'WAITING_FOR_PARTS'
  | 'COMPLETED'
  | 'REJECTED'
  | 'CANCELLED';

export const ALL_MAINTENANCE_STATUSES: readonly MaintenanceStatus[] = [
  'SUBMITTED',
  'UNDER_REVIEW',
  'APPROVED',
  'ASSIGNED',
  'IN_PROGRESS',
  'WAITING_FOR_PARTS',
  'COMPLETED',
  'REJECTED',
  'CANCELLED',
] as const;

export type MaintenanceRequestRecord = {
  requestId: string;
  leaseId: string;
  propertyId: string;
  transactionId: string;
  requestedByUid: string;
  category: 'PLUMBING' | 'ELECTRICAL' | 'HVAC' | 'APPLIANCE' | 'STRUCTURAL' | 'GENERAL';
  description: string;
  priority: MaintenancePriority;
  assignedPropertyManagerUid?: string;
  assignedServiceProviderId?: string;
  workOrderReference?: string;
  status: MaintenanceStatus;
  attachmentMediaIds: string[];
  estimatedCostAmount?: number;
  approvedCostAmount?: number;
  costPayerUid?: string;
  linkedFinancialObligationId?: string;
  currency: TransactionCurrency;
  completionSummary?: string;
  completedAtIso?: string;
  createdAtIso: string;
  updatedAtIso: string;
};

export type InspectionType = 'MOVE_IN' | 'PERIODIC' | 'MOVE_OUT';

export type InspectionChecklistItem = {
  area: string;
  condition: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'DAMAGED';
  notes: string;
  damageEstimatedAmount?: number;
  photoMediaIds: string[];
};

export type PropertyInspectionRecord = {
  inspectionId: string;
  leaseId: string;
  propertyId: string;
  inspectionType: InspectionType;
  scheduledAtIso: string;
  inspectorUid: string;
  authorizedParticipantUids: string[];
  checklist: InspectionChecklistItem[];
  status: 'SCHEDULED' | 'COMPLETED_IMMUTABLE';
  acknowledgedByUids: string[];
  completedAtIso?: string;
  createdAtIso: string;
  updatedAtIso: string;
};

export type TerminationType =
  | 'TENANT_INITIATED'
  | 'LANDLORD_INITIATED'
  | 'MUTUAL'
  | 'CONTRACTUAL_EXPIRATION'
  | 'EARLY_AUTHORIZED';

export type TenancyTerminationRecord = {
  terminationId: string;
  leaseId: string;
  propertyId: string;
  transactionId: string;
  terminationType: TerminationType;
  initiatedByUid: string;
  noticeTimestampIso: string;
  effectiveTerminationDateIso: string;
  reason: string;
  contractualRuleReference: string;
  approvedByLandlord: boolean;
  approvedByTenant: boolean;
  finalReconciliationReportId?: string;
  depositSettled: boolean;
  moveOutHandoverId?: string;
  status: 'NOTICE_SUBMITTED' | 'APPROVED' | 'COMPLETED' | 'REJECTED';
  completedAtIso?: string;
  createdAtIso: string;
  updatedAtIso: string;
};

export type PropertyHandoverRecord = {
  handoverId: string;
  leaseId: string;
  propertyId: string;
  handoverType: 'MOVE_IN' | 'MOVE_OUT';
  scheduledAtIso: string;
  inspectionReferenceId: string;
  keysTransferredConfirmed: boolean;
  accessDevicesTransferredConfirmed: boolean;
  meterReadings: {
    electricityKwh?: number;
    waterCubicMeters?: number;
    gasCubicMeters?: number;
  };
  handoverDocumentMediaIds: string[];
  confirmedByLandlord: boolean;
  confirmedByTenant: boolean;
  status: 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED';
  completedAtIso?: string;
  createdAtIso: string;
  updatedAtIso: string;
};

export type TenancyHistoryEventRecord = {
  eventId: string;
  propertyId: string;
  leaseId?: string;
  sequenceNumber: number;
  eventType: string;
  actorUid: string;
  summary: string;
  metadata: Record<string, string | number | boolean>;
  timestampIso: string;
};

export type PropertyTenancyIndexRecord = {
  propertyId: string;
  applicationIds: string[];
  screeningIds: string[];
  leaseIds: string[];
  depositIds: string[];
  renewalIds: string[];
  adjustmentIds: string[];
  amendmentIds: string[];
  maintenanceIds: string[];
  inspectionIds: string[];
  terminationIds: string[];
  handoverIds: string[];
  historyEventIds: string[];
  historySequence: number;
  updatedAtIso: string;
};

export type TenancyAnalyticsSnapshot = {
  rentalApplicationVolume: number;
  approvedApplicationCount: number;
  applicationConversionRate: number;
  activeTenancyCount: number;
  totalLeasesCreated: number;
  renewedLeaseCount: number;
  renewalRate: number;
  terminatedLeaseCount: number;
  terminationRate: number;
  maintenanceRequestVolume: number;
  completedMaintenanceCount: number;
};

export interface TenancyModuleDependencies {
  tokenVerifier: FirebaseTokenVerifierAdapter;
  adminStore: DelegatedAdminStoreAdapter;
  txRunner: TransactionRunnerAdapter;
  idempotencyStore?: IdempotencyStoreAdapter;
  auditSink?: AuditEventSink;
  primaryAdminEmails?: string[];
  notificationEmitter?: (event: {
    eventId: string;
    eventType: string;
    propertyId: string;
    leaseId?: string;
    recipientUids: string[];
    actorUid: string;
    summary: string;
    occurredAtIso: string;
  }) => Promise<void>;
  telemetryEmitter?: (event: {
    eventName: string;
    propertyId: string;
    metrics: Record<string, number>;
    occurredAtMs: number;
  }) => void;
  nowFn?: () => number;
}
