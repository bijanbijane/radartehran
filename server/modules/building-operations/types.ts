import type {
  AuditEventSink,
  DelegatedAdminStoreAdapter,
  FirebaseTokenVerifierAdapter,
  IdempotencyStoreAdapter,
  TransactionRunnerAdapter,
} from '../core';
import type { TransactionCurrency } from '../transactions';

export type PropertyManagementStatus =
  | 'ACTIVE'
  | 'INACTIVE'
  | 'SUSPENDED'
  | 'TRANSFER_PENDING'
  | 'TERMINATED';

export const ALL_PROPERTY_MANAGEMENT_STATUSES: readonly PropertyManagementStatus[] = [
  'ACTIVE',
  'INACTIVE',
  'SUSPENDED',
  'TRANSFER_PENDING',
  'TERMINATED',
] as const;

export type BuildingType =
  | 'RESIDENTIAL'
  | 'COMMERCIAL'
  | 'OFFICE'
  | 'MIXED_USE'
  | 'INDUSTRIAL'
  | 'OTHER';

export const ALL_BUILDING_TYPES: readonly BuildingType[] = [
  'RESIDENTIAL',
  'COMMERCIAL',
  'OFFICE',
  'MIXED_USE',
  'INDUSTRIAL',
  'OTHER',
] as const;

export type UnitOccupancyStatus =
  | 'VACANT'
  | 'OWNER_OCCUPIED'
  | 'RENTED'
  | 'UNDER_RENOVATION'
  | 'UNAVAILABLE';

export const ALL_UNIT_OCCUPANCY_STATUSES: readonly UnitOccupancyStatus[] = [
  'VACANT',
  'OWNER_OCCUPIED',
  'RENTED',
  'UNDER_RENOVATION',
  'UNAVAILABLE',
] as const;

export type FacilityCategory =
  | 'ELEVATOR'
  | 'HEATING_SYSTEM'
  | 'COOLING_SYSTEM'
  | 'WATER_SYSTEM'
  | 'ELECTRICAL_SYSTEM'
  | 'BACKUP_GENERATOR'
  | 'PUMP'
  | 'FIRE_DETECTION'
  | 'FIRE_SUPPRESSION'
  | 'SECURITY_SYSTEM'
  | 'CCTV_SYSTEM'
  | 'ACCESS_CONTROL'
  | 'PARKING_SYSTEM'
  | 'WATER_STORAGE'
  | 'WASTE_MANAGEMENT'
  | 'RECREATIONAL_FACILITY';

export const ALL_FACILITY_CATEGORIES: readonly FacilityCategory[] = [
  'ELEVATOR',
  'HEATING_SYSTEM',
  'COOLING_SYSTEM',
  'WATER_SYSTEM',
  'ELECTRICAL_SYSTEM',
  'BACKUP_GENERATOR',
  'PUMP',
  'FIRE_DETECTION',
  'FIRE_SUPPRESSION',
  'SECURITY_SYSTEM',
  'CCTV_SYSTEM',
  'ACCESS_CONTROL',
  'PARKING_SYSTEM',
  'WATER_STORAGE',
  'WASTE_MANAGEMENT',
  'RECREATIONAL_FACILITY',
] as const;

export type EquipmentStatus =
  | 'OPERATIONAL'
  | 'DEGRADED'
  | 'UNDER_MAINTENANCE'
  | 'OUT_OF_SERVICE'
  | 'REPLACEMENT_PENDING'
  | 'RETIRED';

export const ALL_EQUIPMENT_STATUSES: readonly EquipmentStatus[] = [
  'OPERATIONAL',
  'DEGRADED',
  'UNDER_MAINTENANCE',
  'OUT_OF_SERVICE',
  'REPLACEMENT_PENDING',
  'RETIRED',
] as const;

export type BuildingMaintenanceStatus =
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'APPROVED'
  | 'ASSIGNED'
  | 'SCHEDULED'
  | 'IN_PROGRESS'
  | 'WAITING_FOR_PARTS'
  | 'BLOCKED'
  | 'COMPLETED'
  | 'REJECTED'
  | 'CANCELLED';

export const ALL_BUILDING_MAINTENANCE_STATUSES: readonly BuildingMaintenanceStatus[] = [
  'SUBMITTED',
  'UNDER_REVIEW',
  'APPROVED',
  'ASSIGNED',
  'SCHEDULED',
  'IN_PROGRESS',
  'WAITING_FOR_PARTS',
  'BLOCKED',
  'COMPLETED',
  'REJECTED',
  'CANCELLED',
] as const;

export type WorkOrderStatus =
  | 'CREATED'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'ASSIGNED'
  | 'SCHEDULED'
  | 'IN_PROGRESS'
  | 'ON_HOLD'
  | 'COMPLETED'
  | 'VERIFIED'
  | 'CANCELLED';

export const ALL_WORK_ORDER_STATUSES: readonly WorkOrderStatus[] = [
  'CREATED',
  'PENDING_APPROVAL',
  'APPROVED',
  'ASSIGNED',
  'SCHEDULED',
  'IN_PROGRESS',
  'ON_HOLD',
  'COMPLETED',
  'VERIFIED',
  'CANCELLED',
] as const;

export type ExpenseCategory =
  | 'MAINTENANCE'
  | 'UTILITY'
  | 'CLEANING'
  | 'SECURITY'
  | 'EQUIPMENT'
  | 'INSURANCE'
  | 'SHARED_FACILITY'
  | 'MANAGEMENT_FEE'
  | 'OTHER';

export const ALL_EXPENSE_CATEGORIES: readonly ExpenseCategory[] = [
  'MAINTENANCE',
  'UTILITY',
  'CLEANING',
  'SECURITY',
  'EQUIPMENT',
  'INSURANCE',
  'SHARED_FACILITY',
  'MANAGEMENT_FEE',
  'OTHER',
] as const;

export type ExpenseAllocationMethod =
  | 'EQUAL_PER_UNIT'
  | 'AREA_BASED'
  | 'OWNERSHIP_SHARE'
  | 'CUSTOM_AUTHORIZED';

export const ALL_EXPENSE_ALLOCATION_METHODS: readonly ExpenseAllocationMethod[] = [
  'EQUAL_PER_UNIT',
  'AREA_BASED',
  'OWNERSHIP_SHARE',
  'CUSTOM_AUTHORIZED',
] as const;

export type UtilityType =
  | 'ELECTRICITY'
  | 'WATER'
  | 'GAS'
  | 'HEATING'
  | 'COOLING'
  | 'INTERNET'
  | 'OTHER';

export const ALL_UTILITY_TYPES: readonly UtilityType[] = [
  'ELECTRICITY',
  'WATER',
  'GAS',
  'HEATING',
  'COOLING',
  'INTERNET',
  'OTHER',
] as const;

export type BuildingInspectionType =
  | 'ROUTINE'
  | 'EQUIPMENT'
  | 'STRUCTURAL'
  | 'SAFETY'
  | 'COMMON_AREA'
  | 'PRE_MAINTENANCE'
  | 'POST_MAINTENANCE';

export const ALL_BUILDING_INSPECTION_TYPES: readonly BuildingInspectionType[] = [
  'ROUTINE',
  'EQUIPMENT',
  'STRUCTURAL',
  'SAFETY',
  'COMMON_AREA',
  'PRE_MAINTENANCE',
  'POST_MAINTENANCE',
] as const;

export type SafetyIncidentCategory =
  | 'WATER_LEAKAGE'
  | 'ELECTRICAL_FAILURE'
  | 'FIRE_INCIDENT'
  | 'ELEVATOR_MALFUNCTION'
  | 'STRUCTURAL_CONCERN'
  | 'GAS_INCIDENT'
  | 'SECURITY_INCIDENT'
  | 'EQUIPMENT_FAILURE'
  | 'OTHER';

export const ALL_SAFETY_INCIDENT_CATEGORIES: readonly SafetyIncidentCategory[] = [
  'WATER_LEAKAGE',
  'ELECTRICAL_FAILURE',
  'FIRE_INCIDENT',
  'ELEVATOR_MALFUNCTION',
  'STRUCTURAL_CONCERN',
  'GAS_INCIDENT',
  'SECURITY_INCIDENT',
  'EQUIPMENT_FAILURE',
  'OTHER',
] as const;

export type PropertyManagementRecord = {
  managementId: string;
  propertyId: string;
  buildingId?: string;
  classification: BuildingType;
  status: PropertyManagementStatus;
  ownerUids: string[];
  authorizedRepresentativeUids: string[];
  managementOrganizationId?: string;
  assignedPropertyManagerUid: string;
  operationalStatus: 'NORMAL' | 'MAINTENANCE_MODE' | 'RESTRICTED';
  managementStartDateIso: string;
  managementEndDateIso?: string;
  delegatedPermissions: string[];
  createdAtIso: string;
  updatedAtIso: string;
};

export type ManagementContractRecord = {
  contractId: string;
  buildingId: string;
  propertyId?: string;
  ownerUid: string;
  managementOrganizationId?: string;
  authorizedManagerUid: string;
  contractStartDateIso: string;
  contractEndDateIso: string;
  serviceScope: string;
  delegatedPermissions: string[];
  managementFeeAmount: number;
  currency: TransactionCurrency;
  contractDocumentMediaId: string;
  version: number;
  status: 'DRAFT' | 'APPROVED' | 'ACTIVE' | 'EXPIRED' | 'TERMINATED';
  createdAtIso: string;
  updatedAtIso: string;
};

export type BuildingRecord = {
  buildingId: string;
  name: string;
  buildingType: BuildingType;
  constructionYear?: number;
  floorsCount: number;
  declaredUnitsCount: number;
  sharedSpaces: string[];
  ownerUids: string[];
  managementOrganizationId?: string;
  propertyManagerUid: string;
  operationalStatus: PropertyManagementStatus;
  createdAtIso: string;
  updatedAtIso: string;
};

export type BuildingUnitRecord = {
  unitId: string;
  buildingId: string;
  propertyId: string;
  floorNumber: number;
  unitNumber: string;
  category: BuildingType;
  areaSqm: number;
  ownershipShareBasisPoints?: number;
  occupancyStatus: UnitOccupancyStatus;
  ownerUid: string;
  tenantUid?: string;
  activeLeaseId?: string;
  createdAtIso: string;
  updatedAtIso: string;
};

export type BuildingFacilityRecord = {
  facilityId: string;
  buildingId: string;
  category: FacilityCategory;
  name: string;
  equipmentIds: string[];
  installationDateIso?: string;
  manufacturer?: string;
  model?: string;
  operationalStatus: EquipmentStatus;
  lastInspectionDateIso?: string;
  nextInspectionDateIso?: string;
  responsibleServiceProviderId?: string;
  documentMediaIds: string[];
  createdAtIso: string;
  updatedAtIso: string;
};

export type EquipmentAssetRecord = {
  equipmentId: string;
  buildingId: string;
  unitId?: string;
  facilityId?: string;
  classification: FacilityCategory;
  assetCode: string;
  manufacturer?: string;
  model?: string;
  serialReference?: string;
  installationDateIso: string;
  warrantyReference?: string;
  warrantyExpirationIso?: string;
  status: EquipmentStatus;
  replacedByEquipmentId?: string;
  createdAtIso: string;
  updatedAtIso: string;
};

export type BuildingMaintenanceRequestRecord = {
  requestId: string;
  buildingId: string;
  propertyId?: string;
  unitId?: string;
  equipmentId?: string;
  requestedByUid: string;
  category: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'EMERGENCY';
  description: string;
  attachmentMediaIds: string[];
  estimatedCostAmount?: number;
  currency: TransactionCurrency;
  assignedTechnicianUid?: string;
  assignedServiceProviderId?: string;
  approvalRequired: boolean;
  approvedByUid?: string;
  status: BuildingMaintenanceStatus;
  completionEvidenceMediaIds: string[];
  workOrderId?: string;
  createdAtIso: string;
  updatedAtIso: string;
  completedAtIso?: string;
};

export type PreventiveMaintenanceScheduleRecord = {
  scheduleId: string;
  buildingId: string;
  equipmentId?: string;
  facilityId?: string;
  title: string;
  recurrenceIntervalDays: number;
  nextDueDateIso: string;
  responsiblePartyUid: string;
  assignedServiceProviderId?: string;
  checklistItems: string[];
  status: 'ACTIVE' | 'SUSPENDED';
  generatedWorkOrderKeys: string[];
  createdAtIso: string;
  updatedAtIso: string;
};

export type WorkOrderRecord = {
  workOrderId: string;
  buildingId: string;
  propertyId?: string;
  unitId?: string;
  maintenanceRequestId?: string;
  preventiveScheduleId?: string;
  equipmentId?: string;
  serviceProviderId: string;
  assignedPersonnelName?: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'EMERGENCY';
  scheduledStartIso: string;
  scheduledCompletionIso: string;
  actualStartIso?: string;
  actualCompletionIso?: string;
  estimatedCostAmount: number;
  approvedCostAmount?: number;
  currency: TransactionCurrency;
  providerAcceptanceStatus: 'PENDING' | 'ACCEPTED' | 'REJECTED';
  status: WorkOrderStatus;
  completionNotes?: string;
  supportingDocumentMediaIds: string[];
  qualityRating?: number;
  linkedTransactionId?: string;
  linkedFinancialObligationId?: string;
  createdAtIso: string;
  updatedAtIso: string;
};

export type BuildingExpenseRecord = {
  expenseId: string;
  buildingId: string;
  propertyId?: string;
  category: ExpenseCategory;
  title: string;
  amount: number;
  currency: TransactionCurrency;
  expenseDateIso: string;
  responsiblePartyUid: string;
  supportingDocumentMediaIds: string[];
  approvalStatus: 'PENDING' | 'APPROVED' | 'REJECTED';
  approvedByUid?: string;
  paymentReferenceId?: string;
  workOrderId?: string;
  linkedTransactionId?: string;
  linkedFinancialObligationId?: string;
  createdAtIso: string;
  updatedAtIso: string;
};

export type UnitExpenseShareItem = {
  unitId: string;
  ownerUid: string;
  ratioBasisPoints: number;
  allocatedAmount: number;
};

export type SharedExpenseAllocationRecord = {
  allocationId: string;
  buildingId: string;
  expenseId: string;
  allocationPeriod: string;
  method: ExpenseAllocationMethod;
  totalExpenseAmount: number;
  currency: TransactionCurrency;
  unitShares: UnitExpenseShareItem[];
  approvedByUid: string;
  reconciliationStatus: 'RECONCILED' | 'PENDING';
  createdAtIso: string;
};

export type UtilityRecord = {
  utilityId: string;
  buildingId: string;
  unitId?: string;
  utilityType: UtilityType;
  providerReference: string;
  billingPeriod: string;
  meterReference: string;
  meterReading: number;
  consumptionQuantity: number;
  measurementUnit: 'KWH' | 'CUBIC_METER' | 'GIGABYTE' | 'THERM';
  billAmount: number;
  currency: TransactionCurrency;
  paymentStatus: 'UNPAID' | 'PAID' | 'OVERDUE';
  supportingDocumentMediaId?: string;
  createdAtIso: string;
};

export type BuildingInspectionRecord = {
  inspectionId: string;
  buildingId: string;
  equipmentId?: string;
  inspectionType: BuildingInspectionType;
  inspectorUid: string;
  inspectionDateIso: string;
  checklist: string[];
  findings: string;
  severity: 'NONE' | 'LOW' | 'MODERATE' | 'CRITICAL';
  evidenceMediaIds: string[];
  requiredCorrectiveActions: string[];
  status: 'SCHEDULED' | 'COMPLETED_IMMUTABLE';
  createdAtIso: string;
  updatedAtIso: string;
};

export type SafetyIncidentRecord = {
  incidentId: string;
  buildingId: string;
  unitId?: string;
  equipmentId?: string;
  category: SafetyIncidentCategory;
  incidentTimestampIso: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  escalationPriority: 'P3_NORMAL' | 'P2_URGENT' | 'P1_IMMEDIATE';
  description: string;
  evidenceMediaIds: string[];
  responsiblePartyUid: string;
  responseActions: string[];
  status: 'OPEN' | 'CONTAINED' | 'RESOLVED';
  createdAtIso: string;
  updatedAtIso: string;
  resolvedAtIso?: string;
};

export type BuildingDocumentReferenceRecord = {
  documentId: string;
  buildingId: string;
  documentCategory:
    | 'MAINTENANCE_DOC'
    | 'EQUIPMENT_MANUAL'
    | 'WARRANTY_DOC'
    | 'INSPECTION_REPORT'
    | 'BUILDING_PLAN'
    | 'UTILITY_BILL'
    | 'INSURANCE_REF'
    | 'SERVICE_CONTRACT'
    | 'MANAGEMENT_AGREEMENT';
  title: string;
  mediaObjectId: string;
  sha256Checksum: string;
  restrictedToRoles: Array<'OWNER' | 'MANAGER' | 'PROVIDER' | 'RESIDENT'>;
  uploadedByUid: string;
  createdAtIso: string;
};

export type BuildingOperationalHistoryRecord = {
  eventId: string;
  buildingId: string;
  sequenceNumber: number;
  eventType: string;
  actorUid: string;
  summary: string;
  metadata: Record<string, string | number | boolean>;
  timestampIso: string;
};

export type BuildingIndexRecord = {
  buildingId: string;
  unitIds: string[];
  facilityIds: string[];
  equipmentIds: string[];
  maintenanceRequestIds: string[];
  preventiveScheduleIds: string[];
  workOrderIds: string[];
  expenseIds: string[];
  allocationIds: string[];
  utilityIds: string[];
  inspectionIds: string[];
  incidentIds: string[];
  documentIds: string[];
  managementContractIds: string[];
  historyEventIds: string[];
  historySequence: number;
  updatedAtIso: string;
};

export type BuildingOperationsAnalyticsSnapshot = {
  managedBuildingCount: number;
  managedUnitCount: number;
  operationalEquipmentCount: number;
  degradedOrOutEquipmentCount: number;
  maintenanceVolume: number;
  preventiveWorkOrdersGenerated: number;
  completedWorkOrderCount: number;
  totalApprovedExpenseAmount: number;
  totalUtilityBillAmount: number;
  completedInspectionCount: number;
  safetyIncidentCount: number;
};

export interface BuildingOperationsDependencies {
  tokenVerifier: FirebaseTokenVerifierAdapter;
  adminStore: DelegatedAdminStoreAdapter;
  txRunner: TransactionRunnerAdapter;
  idempotencyStore?: IdempotencyStoreAdapter;
  auditSink?: AuditEventSink;
  primaryAdminEmails?: string[];
  notificationEmitter?: (event: {
    eventId: string;
    eventType: string;
    buildingId: string;
    recipientUids: string[];
    actorUid: string;
    summary: string;
    occurredAtIso: string;
  }) => Promise<void>;
  nowFn?: () => number;
}
