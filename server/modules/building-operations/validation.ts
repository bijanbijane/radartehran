import {
  normalizeFirestoreTimestamp,
  requireEnumValue,
  requireFiniteNumberInRange,
  requireNonEmptyString,
  requireSafeFirestoreId,
  validateObjectSchema,
  type FieldValidator,
  type ValidationIssue,
  type ValidationResult,
} from '../core';
import {
  ALL_TRANSACTION_CURRENCIES,
  MAX_MONETARY_SAFE_INT,
  type TransactionCurrency,
} from '../transactions';
import {
  ALL_BUILDING_INSPECTION_TYPES,
  ALL_BUILDING_MAINTENANCE_STATUSES,
  ALL_BUILDING_TYPES,
  ALL_EQUIPMENT_STATUSES,
  ALL_EXPENSE_ALLOCATION_METHODS,
  ALL_EXPENSE_CATEGORIES,
  ALL_FACILITY_CATEGORIES,
  ALL_PROPERTY_MANAGEMENT_STATUSES,
  ALL_SAFETY_INCIDENT_CATEGORIES,
  ALL_UNIT_OCCUPANCY_STATUSES,
  ALL_UTILITY_TYPES,
  ALL_WORK_ORDER_STATUSES,
  type BuildingInspectionType,
  type BuildingMaintenanceStatus,
  type BuildingType,
  type EquipmentStatus,
  type ExpenseAllocationMethod,
  type ExpenseCategory,
  type FacilityCategory,
  type PropertyManagementStatus,
  type SafetyIncidentCategory,
  type UnitOccupancyStatus,
  type UtilityType,
  type WorkOrderStatus,
} from './types';

const PROHIBITED_BUILDING_OPS_FIELDS: ReadonlySet<string> = new Set([
  'isOwner',
  'isAdmin',
  'emergencyServicesContactedBySystem',
  'paymentConfirmed',
  'cardNumber',
  'cvv',
  'cvv2',
  'password',
  'bankPassword',
]);

function checkProhibitedFields(rawInput: unknown): ValidationIssue[] {
  if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) return [];
  const issues: ValidationIssue[] = [];
  for (const key of Object.keys(rawInput as Record<string, unknown>)) {
    if (PROHIBITED_BUILDING_OPS_FIELDS.has(key)) {
      issues.push({
        field: key,
        code: 'UNTRUSTED_IDENTITY_FIELD',
        message: `Field "${key}" is prohibited in building operations payloads.`,
      });
    }
  }
  return issues;
}

function requireIsoTimestamp(): FieldValidator<string> {
  return (rawValue: unknown, fieldName: string): ValidationResult<string> => {
    const normalized = normalizeFirestoreTimestamp(rawValue);
    if (!normalized) {
      return {
        ok: false,
        issues: [{ field: fieldName, code: 'INVALID_FORMAT', message: `${fieldName} must be a valid ISO timestamp.` }],
      };
    }
    return { ok: true, value: normalized.iso, issues: [] };
  };
}

const booleanValidator: FieldValidator<boolean> = (v, f) =>
  typeof v === 'boolean'
    ? { ok: true, value: v, issues: [] }
    : { ok: false, issues: [{ field: f, code: 'INVALID_TYPE', message: `${f} must be a boolean.` }] };

const stringArrayValidator: FieldValidator<string[]> = (val, field) => {
  if (!Array.isArray(val) || val.length > 50) {
    return { ok: false, issues: [{ field, code: 'INVALID_TYPE', message: `${field} must be an array of up to 50 strings.` }] };
  }
  const items: string[] = [];
  for (let i = 0; i < val.length; i++) {
    const r = requireNonEmptyString({ minLength: 1, maxLength: 160 })(val[i], `${field}[${i}]`);
    if (!r.ok || !r.value) return { ok: false, issues: r.issues };
    items.push(r.value);
  }
  return { ok: true, value: items, issues: [] };
};

export type UpsertBuildingInput = {
  buildingId?: string;
  name: string;
  buildingType: BuildingType;
  constructionYear?: number;
  floorsCount: number;
  declaredUnitsCount: number;
  sharedSpaces: string[];
  ownerUids?: string[];
  managementOrganizationId?: string;
  propertyManagerUid: string;
  operationalStatus: PropertyManagementStatus;
};

export function validateUpsertBuildingInput(rawInput: unknown): ValidationResult<UpsertBuildingInput> {
  const prohibited = checkProhibitedFields(rawInput);
  if (prohibited.length > 0) return { ok: false, issues: prohibited };

  return validateObjectSchema<UpsertBuildingInput>(
    rawInput,
    {
      buildingId: requireSafeFirestoreId(),
      name: requireNonEmptyString({ minLength: 2, maxLength: 160 }),
      buildingType: requireEnumValue(ALL_BUILDING_TYPES),
      constructionYear: requireFiniteNumberInRange({ min: 1300, max: 2100, integerOnly: true }),
      floorsCount: requireFiniteNumberInRange({ min: 1, max: 200, integerOnly: true }),
      declaredUnitsCount: requireFiniteNumberInRange({ min: 1, max: 2000, integerOnly: true }),
      sharedSpaces: stringArrayValidator,
      ownerUids: stringArrayValidator,
      managementOrganizationId: requireSafeFirestoreId(),
      propertyManagerUid: requireSafeFirestoreId(),
      operationalStatus: requireEnumValue(ALL_PROPERTY_MANAGEMENT_STATUSES),
    },
    {
      optionalFields: ['buildingId', 'constructionYear', 'ownerUids', 'managementOrganizationId'],
      rejectUntrustedIdentityFields: true,
    },
  );
}

export type RegisterBuildingUnitInput = {
  unitId?: string;
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
};

export function validateRegisterBuildingUnitInput(rawInput: unknown): ValidationResult<RegisterBuildingUnitInput> {
  const prohibited = checkProhibitedFields(rawInput);
  if (prohibited.length > 0) return { ok: false, issues: prohibited };

  return validateObjectSchema<RegisterBuildingUnitInput>(
    rawInput,
    {
      unitId: requireSafeFirestoreId(),
      propertyId: requireSafeFirestoreId(),
      floorNumber: requireFiniteNumberInRange({ min: -10, max: 200, integerOnly: true }),
      unitNumber: requireNonEmptyString({ minLength: 1, maxLength: 32 }),
      category: requireEnumValue(ALL_BUILDING_TYPES),
      areaSqm: requireFiniteNumberInRange({ min: 1, max: 100_000, integerOnly: true }),
      ownershipShareBasisPoints: requireFiniteNumberInRange({ min: 1, max: 10_000, integerOnly: true }),
      occupancyStatus: requireEnumValue(ALL_UNIT_OCCUPANCY_STATUSES),
      ownerUid: requireSafeFirestoreId(),
      tenantUid: requireSafeFirestoreId(),
      activeLeaseId: requireSafeFirestoreId(),
    },
    {
      optionalFields: ['unitId', 'ownershipShareBasisPoints', 'tenantUid', 'activeLeaseId'],
      rejectUntrustedIdentityFields: true,
    },
  );
}

export type RegisterFacilityInput = {
  facilityId?: string;
  category: FacilityCategory;
  name: string;
  equipmentIds?: string[];
  installationDateIso?: string;
  manufacturer?: string;
  model?: string;
  operationalStatus: EquipmentStatus;
  lastInspectionDateIso?: string;
  nextInspectionDateIso?: string;
  responsibleServiceProviderId?: string;
  documentMediaIds?: string[];
};

export function validateRegisterFacilityInput(rawInput: unknown): ValidationResult<RegisterFacilityInput> {
  const prohibited = checkProhibitedFields(rawInput);
  if (prohibited.length > 0) return { ok: false, issues: prohibited };

  return validateObjectSchema<RegisterFacilityInput>(
    rawInput,
    {
      facilityId: requireSafeFirestoreId(),
      category: requireEnumValue(ALL_FACILITY_CATEGORIES),
      name: requireNonEmptyString({ minLength: 2, maxLength: 160 }),
      equipmentIds: stringArrayValidator,
      installationDateIso: requireIsoTimestamp(),
      manufacturer: requireNonEmptyString({ minLength: 1, maxLength: 120 }),
      model: requireNonEmptyString({ minLength: 1, maxLength: 120 }),
      operationalStatus: requireEnumValue(ALL_EQUIPMENT_STATUSES),
      lastInspectionDateIso: requireIsoTimestamp(),
      nextInspectionDateIso: requireIsoTimestamp(),
      responsibleServiceProviderId: requireSafeFirestoreId(),
      documentMediaIds: stringArrayValidator,
    },
    {
      optionalFields: [
        'facilityId',
        'equipmentIds',
        'installationDateIso',
        'manufacturer',
        'model',
        'lastInspectionDateIso',
        'nextInspectionDateIso',
        'responsibleServiceProviderId',
        'documentMediaIds',
      ],
      rejectUntrustedIdentityFields: true,
    },
  );
}

export type RegisterEquipmentAssetInput = {
  equipmentId?: string;
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
};

export function validateRegisterEquipmentAssetInput(
  rawInput: unknown,
): ValidationResult<RegisterEquipmentAssetInput> {
  const prohibited = checkProhibitedFields(rawInput);
  if (prohibited.length > 0) return { ok: false, issues: prohibited };

  return validateObjectSchema<RegisterEquipmentAssetInput>(
    rawInput,
    {
      equipmentId: requireSafeFirestoreId(),
      unitId: requireSafeFirestoreId(),
      facilityId: requireSafeFirestoreId(),
      classification: requireEnumValue(ALL_FACILITY_CATEGORIES),
      assetCode: requireNonEmptyString({ minLength: 2, maxLength: 64 }),
      manufacturer: requireNonEmptyString({ minLength: 1, maxLength: 120 }),
      model: requireNonEmptyString({ minLength: 1, maxLength: 120 }),
      serialReference: requireNonEmptyString({ minLength: 1, maxLength: 120 }),
      installationDateIso: requireIsoTimestamp(),
      warrantyReference: requireNonEmptyString({ minLength: 1, maxLength: 120 }),
      warrantyExpirationIso: requireIsoTimestamp(),
      status: requireEnumValue(ALL_EQUIPMENT_STATUSES),
      replacedByEquipmentId: requireSafeFirestoreId(),
    },
    {
      optionalFields: [
        'equipmentId',
        'unitId',
        'facilityId',
        'manufacturer',
        'model',
        'serialReference',
        'warrantyReference',
        'warrantyExpirationIso',
        'replacedByEquipmentId',
      ],
      rejectUntrustedIdentityFields: true,
    },
  );
}

export type CreateBuildingMaintenanceInput = {
  requestId?: string;
  propertyId?: string;
  unitId?: string;
  equipmentId?: string;
  category: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'EMERGENCY';
  description: string;
  attachmentMediaIds?: string[];
  estimatedCostAmount?: number;
  currency: TransactionCurrency;
  approvalRequired?: boolean;
};

export function validateCreateBuildingMaintenanceInput(
  rawInput: unknown,
): ValidationResult<CreateBuildingMaintenanceInput> {
  const prohibited = checkProhibitedFields(rawInput);
  if (prohibited.length > 0) return { ok: false, issues: prohibited };

  return validateObjectSchema<CreateBuildingMaintenanceInput>(
    rawInput,
    {
      requestId: requireSafeFirestoreId(),
      propertyId: requireSafeFirestoreId(),
      unitId: requireSafeFirestoreId(),
      equipmentId: requireSafeFirestoreId(),
      category: requireNonEmptyString({ minLength: 2, maxLength: 80 }),
      priority: requireEnumValue(['LOW', 'MEDIUM', 'HIGH', 'EMERGENCY'] as const),
      description: requireNonEmptyString({ minLength: 5, maxLength: 2000 }),
      attachmentMediaIds: stringArrayValidator,
      estimatedCostAmount: requireFiniteNumberInRange({ min: 0, max: MAX_MONETARY_SAFE_INT, integerOnly: true }),
      currency: requireEnumValue(ALL_TRANSACTION_CURRENCIES),
      approvalRequired: booleanValidator,
    },
    {
      optionalFields: [
        'requestId',
        'propertyId',
        'unitId',
        'equipmentId',
        'attachmentMediaIds',
        'estimatedCostAmount',
        'approvalRequired',
      ],
      rejectUntrustedIdentityFields: true,
    },
  );
}

export type CreatePreventiveScheduleInput = {
  scheduleId?: string;
  equipmentId?: string;
  facilityId?: string;
  title: string;
  recurrenceIntervalDays: number;
  nextDueDateIso: string;
  responsiblePartyUid: string;
  assignedServiceProviderId?: string;
  checklistItems: string[];
};

export function validateCreatePreventiveScheduleInput(
  rawInput: unknown,
): ValidationResult<CreatePreventiveScheduleInput> {
  const prohibited = checkProhibitedFields(rawInput);
  if (prohibited.length > 0) return { ok: false, issues: prohibited };

  return validateObjectSchema<CreatePreventiveScheduleInput>(
    rawInput,
    {
      scheduleId: requireSafeFirestoreId(),
      equipmentId: requireSafeFirestoreId(),
      facilityId: requireSafeFirestoreId(),
      title: requireNonEmptyString({ minLength: 3, maxLength: 160 }),
      recurrenceIntervalDays: requireFiniteNumberInRange({ min: 1, max: 3650, integerOnly: true }),
      nextDueDateIso: requireIsoTimestamp(),
      responsiblePartyUid: requireSafeFirestoreId(),
      assignedServiceProviderId: requireSafeFirestoreId(),
      checklistItems: stringArrayValidator,
    },
    {
      optionalFields: ['scheduleId', 'equipmentId', 'facilityId', 'assignedServiceProviderId'],
      rejectUntrustedIdentityFields: true,
    },
  );
}

export type CreateWorkOrderInput = {
  workOrderId?: string;
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
  estimatedCostAmount: number;
  currency: TransactionCurrency;
  linkedTransactionId?: string;
};

export function validateCreateWorkOrderInput(rawInput: unknown): ValidationResult<CreateWorkOrderInput> {
  const prohibited = checkProhibitedFields(rawInput);
  if (prohibited.length > 0) return { ok: false, issues: prohibited };

  return validateObjectSchema<CreateWorkOrderInput>(
    rawInput,
    {
      workOrderId: requireSafeFirestoreId(),
      propertyId: requireSafeFirestoreId(),
      unitId: requireSafeFirestoreId(),
      maintenanceRequestId: requireSafeFirestoreId(),
      preventiveScheduleId: requireSafeFirestoreId(),
      equipmentId: requireSafeFirestoreId(),
      serviceProviderId: requireSafeFirestoreId(),
      assignedPersonnelName: requireNonEmptyString({ minLength: 2, maxLength: 120 }),
      priority: requireEnumValue(['LOW', 'MEDIUM', 'HIGH', 'EMERGENCY'] as const),
      scheduledStartIso: requireIsoTimestamp(),
      scheduledCompletionIso: requireIsoTimestamp(),
      estimatedCostAmount: requireFiniteNumberInRange({ min: 0, max: MAX_MONETARY_SAFE_INT, integerOnly: true }),
      currency: requireEnumValue(ALL_TRANSACTION_CURRENCIES),
      linkedTransactionId: requireSafeFirestoreId(),
    },
    {
      optionalFields: [
        'workOrderId',
        'propertyId',
        'unitId',
        'maintenanceRequestId',
        'preventiveScheduleId',
        'equipmentId',
        'assignedPersonnelName',
        'linkedTransactionId',
      ],
      rejectUntrustedIdentityFields: true,
    },
  );
}

export type TransitionWorkOrderInput = {
  targetStatus: WorkOrderStatus;
  providerDecision?: 'ACCEPTED' | 'REJECTED';
  approvedCostAmount?: number;
  costPayerUid?: string;
  costPayeeUid?: string;
  completionNotes?: string;
  qualityRating?: number;
  supportingDocumentMediaIds?: string[];
};

export function validateTransitionWorkOrderInput(rawInput: unknown): ValidationResult<TransitionWorkOrderInput> {
  const prohibited = checkProhibitedFields(rawInput);
  if (prohibited.length > 0) return { ok: false, issues: prohibited };

  return validateObjectSchema<TransitionWorkOrderInput>(
    rawInput,
    {
      targetStatus: requireEnumValue(ALL_WORK_ORDER_STATUSES),
      providerDecision: requireEnumValue(['ACCEPTED', 'REJECTED'] as const),
      approvedCostAmount: requireFiniteNumberInRange({ min: 1, max: MAX_MONETARY_SAFE_INT, integerOnly: true }),
      costPayerUid: requireSafeFirestoreId(),
      costPayeeUid: requireSafeFirestoreId(),
      completionNotes: requireNonEmptyString({ minLength: 2, maxLength: 1000 }),
      qualityRating: requireFiniteNumberInRange({ min: 1, max: 5, integerOnly: true }),
      supportingDocumentMediaIds: stringArrayValidator,
    },
    {
      optionalFields: [
        'providerDecision',
        'approvedCostAmount',
        'costPayerUid',
        'costPayeeUid',
        'completionNotes',
        'qualityRating',
        'supportingDocumentMediaIds',
      ],
      rejectUntrustedIdentityFields: true,
    },
  );
}

export type CreateBuildingExpenseInput = {
  expenseId?: string;
  propertyId?: string;
  category: ExpenseCategory;
  title: string;
  amount: number;
  currency: TransactionCurrency;
  expenseDateIso: string;
  responsiblePartyUid: string;
  supportingDocumentMediaIds?: string[];
  workOrderId?: string;
  linkedTransactionId?: string;
  payerUid?: string;
  payeeUid?: string;
  approveImmediately?: boolean;
};

export function validateCreateBuildingExpenseInput(rawInput: unknown): ValidationResult<CreateBuildingExpenseInput> {
  const prohibited = checkProhibitedFields(rawInput);
  if (prohibited.length > 0) return { ok: false, issues: prohibited };

  return validateObjectSchema<CreateBuildingExpenseInput>(
    rawInput,
    {
      expenseId: requireSafeFirestoreId(),
      propertyId: requireSafeFirestoreId(),
      category: requireEnumValue(ALL_EXPENSE_CATEGORIES),
      title: requireNonEmptyString({ minLength: 3, maxLength: 200 }),
      amount: requireFiniteNumberInRange({ min: 1, max: MAX_MONETARY_SAFE_INT, integerOnly: true }),
      currency: requireEnumValue(ALL_TRANSACTION_CURRENCIES),
      expenseDateIso: requireIsoTimestamp(),
      responsiblePartyUid: requireSafeFirestoreId(),
      supportingDocumentMediaIds: stringArrayValidator,
      workOrderId: requireSafeFirestoreId(),
      linkedTransactionId: requireSafeFirestoreId(),
      payerUid: requireSafeFirestoreId(),
      payeeUid: requireSafeFirestoreId(),
      approveImmediately: booleanValidator,
    },
    {
      optionalFields: [
        'expenseId',
        'propertyId',
        'supportingDocumentMediaIds',
        'workOrderId',
        'linkedTransactionId',
        'payerUid',
        'payeeUid',
        'approveImmediately',
      ],
      rejectUntrustedIdentityFields: true,
    },
  );
}

export type AllocateBuildingExpenseInput = {
  allocationId?: string;
  expenseId: string;
  allocationPeriod: string;
  method: ExpenseAllocationMethod;
  customRatiosBasisPoints?: Record<string, number>;
};

export function validateAllocateBuildingExpenseInput(
  rawInput: unknown,
): ValidationResult<AllocateBuildingExpenseInput> {
  const prohibited = checkProhibitedFields(rawInput);
  if (prohibited.length > 0) return { ok: false, issues: prohibited };

  return validateObjectSchema<AllocateBuildingExpenseInput>(
    rawInput,
    {
      allocationId: requireSafeFirestoreId(),
      expenseId: requireSafeFirestoreId(),
      allocationPeriod: requireNonEmptyString({ minLength: 4, maxLength: 32 }),
      method: requireEnumValue(ALL_EXPENSE_ALLOCATION_METHODS),
      customRatiosBasisPoints: (val, field) => {
        if (!val || typeof val !== 'object' || Array.isArray(val)) {
          return { ok: false, issues: [{ field, code: 'INVALID_TYPE', message: `${field} must be an object.` }] };
        }
        return { ok: true, value: val as Record<string, number>, issues: [] };
      },
    },
    { optionalFields: ['allocationId', 'customRatiosBasisPoints'], rejectUntrustedIdentityFields: true },
  );
}

export type RecordUtilityBillInput = {
  utilityId?: string;
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
};

export function validateRecordUtilityBillInput(rawInput: unknown): ValidationResult<RecordUtilityBillInput> {
  const prohibited = checkProhibitedFields(rawInput);
  if (prohibited.length > 0) return { ok: false, issues: prohibited };

  return validateObjectSchema<RecordUtilityBillInput>(
    rawInput,
    {
      utilityId: requireSafeFirestoreId(),
      unitId: requireSafeFirestoreId(),
      utilityType: requireEnumValue(ALL_UTILITY_TYPES),
      providerReference: requireNonEmptyString({ minLength: 2, maxLength: 100 }),
      billingPeriod: requireNonEmptyString({ minLength: 4, maxLength: 32 }),
      meterReference: requireNonEmptyString({ minLength: 2, maxLength: 64 }),
      meterReading: requireFiniteNumberInRange({ min: 0, max: 1_000_000_000, integerOnly: true }),
      consumptionQuantity: requireFiniteNumberInRange({ min: 0, max: 1_000_000_000, integerOnly: true }),
      measurementUnit: requireEnumValue(['KWH', 'CUBIC_METER', 'GIGABYTE', 'THERM'] as const),
      billAmount: requireFiniteNumberInRange({ min: 0, max: MAX_MONETARY_SAFE_INT, integerOnly: true }),
      currency: requireEnumValue(ALL_TRANSACTION_CURRENCIES),
      paymentStatus: requireEnumValue(['UNPAID', 'PAID', 'OVERDUE'] as const),
      supportingDocumentMediaId: requireSafeFirestoreId(),
    },
    { optionalFields: ['utilityId', 'unitId', 'supportingDocumentMediaId'], rejectUntrustedIdentityFields: true },
  );
}

export type RecordBuildingInspectionInput = {
  inspectionId?: string;
  equipmentId?: string;
  inspectionType: BuildingInspectionType;
  inspectionDateIso: string;
  checklist: string[];
  findings: string;
  severity: 'NONE' | 'LOW' | 'MODERATE' | 'CRITICAL';
  evidenceMediaIds?: string[];
  requiredCorrectiveActions?: string[];
  completeImmediately?: boolean;
};

export function validateRecordBuildingInspectionInput(
  rawInput: unknown,
): ValidationResult<RecordBuildingInspectionInput> {
  const prohibited = checkProhibitedFields(rawInput);
  if (prohibited.length > 0) return { ok: false, issues: prohibited };

  return validateObjectSchema<RecordBuildingInspectionInput>(
    rawInput,
    {
      inspectionId: requireSafeFirestoreId(),
      equipmentId: requireSafeFirestoreId(),
      inspectionType: requireEnumValue(ALL_BUILDING_INSPECTION_TYPES),
      inspectionDateIso: requireIsoTimestamp(),
      checklist: stringArrayValidator,
      findings: requireNonEmptyString({ minLength: 2, maxLength: 2000 }),
      severity: requireEnumValue(['NONE', 'LOW', 'MODERATE', 'CRITICAL'] as const),
      evidenceMediaIds: stringArrayValidator,
      requiredCorrectiveActions: stringArrayValidator,
      completeImmediately: booleanValidator,
    },
    {
      optionalFields: ['inspectionId', 'equipmentId', 'evidenceMediaIds', 'requiredCorrectiveActions', 'completeImmediately'],
      rejectUntrustedIdentityFields: true,
    },
  );
}

export type ReportSafetyIncidentInput = {
  incidentId?: string;
  unitId?: string;
  equipmentId?: string;
  category: SafetyIncidentCategory;
  incidentTimestampIso: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  description: string;
  evidenceMediaIds?: string[];
  responsiblePartyUid: string;
  responseActions?: string[];
  status?: 'OPEN' | 'CONTAINED' | 'RESOLVED';
};

export function validateReportSafetyIncidentInput(rawInput: unknown): ValidationResult<ReportSafetyIncidentInput> {
  const prohibited = checkProhibitedFields(rawInput);
  if (prohibited.length > 0) return { ok: false, issues: prohibited };

  return validateObjectSchema<ReportSafetyIncidentInput>(
    rawInput,
    {
      incidentId: requireSafeFirestoreId(),
      unitId: requireSafeFirestoreId(),
      equipmentId: requireSafeFirestoreId(),
      category: requireEnumValue(ALL_SAFETY_INCIDENT_CATEGORIES),
      incidentTimestampIso: requireIsoTimestamp(),
      severity: requireEnumValue(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const),
      description: requireNonEmptyString({ minLength: 5, maxLength: 2000 }),
      evidenceMediaIds: stringArrayValidator,
      responsiblePartyUid: requireSafeFirestoreId(),
      responseActions: stringArrayValidator,
      status: requireEnumValue(['OPEN', 'CONTAINED', 'RESOLVED'] as const),
    },
    {
      optionalFields: ['incidentId', 'unitId', 'equipmentId', 'evidenceMediaIds', 'responseActions', 'status'],
      rejectUntrustedIdentityFields: true,
    },
  );
}

export type CreateManagementContractInput = {
  contractId?: string;
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
};

export function validateCreateManagementContractInput(
  rawInput: unknown,
): ValidationResult<CreateManagementContractInput> {
  const prohibited = checkProhibitedFields(rawInput);
  if (prohibited.length > 0) return { ok: false, issues: prohibited };

  return validateObjectSchema<CreateManagementContractInput>(
    rawInput,
    {
      contractId: requireSafeFirestoreId(),
      propertyId: requireSafeFirestoreId(),
      ownerUid: requireSafeFirestoreId(),
      managementOrganizationId: requireSafeFirestoreId(),
      authorizedManagerUid: requireSafeFirestoreId(),
      contractStartDateIso: requireIsoTimestamp(),
      contractEndDateIso: requireIsoTimestamp(),
      serviceScope: requireNonEmptyString({ minLength: 5, maxLength: 2000 }),
      delegatedPermissions: stringArrayValidator,
      managementFeeAmount: requireFiniteNumberInRange({ min: 0, max: MAX_MONETARY_SAFE_INT, integerOnly: true }),
      currency: requireEnumValue(ALL_TRANSACTION_CURRENCIES),
      contractDocumentMediaId: requireSafeFirestoreId(),
    },
    { optionalFields: ['contractId', 'propertyId', 'managementOrganizationId'], rejectUntrustedIdentityFields: true },
  );
}
