import { randomUUID } from 'node:crypto';
import { CoreApiError, type TransactionContextLike } from '../core';
import { executeCreateObligation } from '../transactions';
import {
  appendBuildingHistoryEvent,
  assertBuildingOwnerOrManagerAccess,
  loadOrInitBuildingIndex,
  saveBuildingIndex,
} from './buildingUnitFacilityAndEquipmentOps';
import { isBuildingResidentOrParticipant } from './maintenancePreventiveAndWorkOrderOps';
import type {
  BuildingExpenseRecord,
  BuildingInspectionRecord,
  BuildingRecord,
  BuildingUnitRecord,
  SafetyIncidentRecord,
  SharedExpenseAllocationRecord,
  UnitExpenseShareItem,
  UtilityRecord,
} from './types';
import type {
  AllocateBuildingExpenseInput,
  CreateBuildingExpenseInput,
  RecordBuildingInspectionInput,
  RecordUtilityBillInput,
  ReportSafetyIncidentInput,
} from './validation';

export async function executeCreateBuildingExpense(params: {
  tx: TransactionContextLike;
  buildingId: string;
  actorUid: string;
  isAdmin: boolean;
  input: CreateBuildingExpenseInput;
  nowIso: string;
}): Promise<BuildingExpenseRecord> {
  const { tx, buildingId, actorUid, isAdmin, input, nowIso } = params;
  const bSnap = await tx.get<BuildingRecord>(`buildingOpsBuildings/${buildingId}`);
  if (!bSnap.exists || !bSnap.data) {
    throw new CoreApiError('NOT_FOUND', 404, `Building "${buildingId}" was not found.`);
  }
  assertBuildingOwnerOrManagerAccess(bSnap.data, actorUid, isAdmin);

  const bIndex = await loadOrInitBuildingIndex(tx, buildingId, nowIso);
  const expenseId = input.expenseId ?? `exp_${randomUUID().replace(/-/g, '').slice(0, 14)}`;

  const approvalStatus = input.approveImmediately !== false ? 'APPROVED' : 'PENDING';
  let linkedFinancialObligationId: string | undefined;

  if (
    approvalStatus === 'APPROVED' &&
    input.linkedTransactionId &&
    input.payerUid &&
    input.payeeUid
  ) {
    const ob = await executeCreateObligation({
      tx,
      transactionId: input.linkedTransactionId,
      actorUid,
      isAdmin: true,
      input: {
        obligationId: `obl_exp_${expenseId}`,
        category: 'SERVICE_FEE',
        title: `Building Expense: ${input.title}`,
        amount: input.amount,
        currency: input.currency,
        payerUid: input.payerUid,
        payeeUid: input.payeeUid,
        dueDateIso: input.expenseDateIso,
      },
      nowIso,
    });
    linkedFinancialObligationId = ob.obligationId;
  }

  const expense: BuildingExpenseRecord = {
    expenseId,
    buildingId,
    ...(input.propertyId ? { propertyId: input.propertyId } : {}),
    category: input.category,
    title: input.title,
    amount: input.amount,
    currency: input.currency,
    expenseDateIso: input.expenseDateIso,
    responsiblePartyUid: input.responsiblePartyUid,
    supportingDocumentMediaIds: input.supportingDocumentMediaIds ?? [],
    approvalStatus,
    ...(approvalStatus === 'APPROVED' ? { approvedByUid: actorUid } : {}),
    ...(input.workOrderId ? { workOrderId: input.workOrderId } : {}),
    ...(input.linkedTransactionId ? { linkedTransactionId: input.linkedTransactionId } : {}),
    ...(linkedFinancialObligationId ? { linkedFinancialObligationId } : {}),
    createdAtIso: nowIso,
    updatedAtIso: nowIso,
  };

  tx.set(`buildingOpsExpenses/${expenseId}`, expense);
  bIndex.expenseIds.push(expenseId);
  appendBuildingHistoryEvent(tx, bIndex, {
    eventType: 'BUILDING_EXPENSE_RECORDED',
    actorUid,
    summary: `Building expense "${expenseId}" (${input.category}: ${input.amount} ${input.currency}) recorded.`,
    metadata: { expenseId, amount: input.amount, approvalStatus },
    nowIso,
  });
  saveBuildingIndex(tx, bIndex);
  return expense;
}

export async function executeAllocateSharedBuildingExpense(params: {
  tx: TransactionContextLike;
  buildingId: string;
  actorUid: string;
  isAdmin: boolean;
  input: AllocateBuildingExpenseInput;
  nowIso: string;
}): Promise<SharedExpenseAllocationRecord> {
  const { tx, buildingId, actorUid, isAdmin, input, nowIso } = params;
  const bSnap = await tx.get<BuildingRecord>(`buildingOpsBuildings/${buildingId}`);
  const expSnap = await tx.get<BuildingExpenseRecord>(`buildingOpsExpenses/${input.expenseId}`);
  if (!bSnap.exists || !bSnap.data || !expSnap.exists || !expSnap.data || expSnap.data.buildingId !== buildingId) {
    throw new CoreApiError('NOT_FOUND', 404, `Expense "${input.expenseId}" was not found in building "${buildingId}".`);
  }
  assertBuildingOwnerOrManagerAccess(bSnap.data, actorUid, isAdmin);
  const expense = expSnap.data;

  if (expense.approvalStatus !== 'APPROVED') {
    throw new CoreApiError('CONFLICT', 409, 'Only APPROVED building expenses can be allocated to units.');
  }

  const bIndex = await loadOrInitBuildingIndex(tx, buildingId, nowIso);

  // Prevent duplicate allocation for the same expenseId and allocationPeriod
  for (const aid of bIndex.allocationIds) {
    const aSnap = await tx.get<SharedExpenseAllocationRecord>(`buildingOpsAllocations/${aid}`);
    if (
      aSnap.exists &&
      aSnap.data &&
      aSnap.data.expenseId === input.expenseId &&
      aSnap.data.allocationPeriod === input.allocationPeriod
    ) {
      throw new CoreApiError(
        'CONFLICT',
        409,
        `Expense "${input.expenseId}" has already been allocated for period "${input.allocationPeriod}".`,
      );
    }
  }

  const units: BuildingUnitRecord[] = [];
  for (const uid of bIndex.unitIds) {
    const uSnap = await tx.get<BuildingUnitRecord>(`buildingOpsUnits/${uid}`);
    if (uSnap.exists && uSnap.data) units.push(uSnap.data);
  }
  if (units.length === 0) {
    throw new CoreApiError('CONFLICT', 409, 'Cannot allocate shared building expense: no units registered in building.');
  }

  const weights: Array<{ unit: BuildingUnitRecord; weight: number }> = [];
  let totalWeight = 0;

  for (const u of units) {
    let w = 0;
    if (input.method === 'EQUAL_PER_UNIT') {
      w = 1;
    } else if (input.method === 'AREA_BASED') {
      if (!u.areaSqm || u.areaSqm <= 0) {
        throw new CoreApiError('VALIDATION_FAILED', 400, `Unit "${u.unitId}" is missing areaSqm for AREA_BASED allocation.`);
      }
      w = u.areaSqm;
    } else if (input.method === 'OWNERSHIP_SHARE') {
      if (!u.ownershipShareBasisPoints || u.ownershipShareBasisPoints <= 0) {
        throw new CoreApiError(
          'VALIDATION_FAILED',
          400,
          `Unit "${u.unitId}" has no configured ownershipShareBasisPoints.`,
        );
      }
      w = u.ownershipShareBasisPoints;
    } else {
      const customBps = input.customRatiosBasisPoints?.[u.unitId];
      if (customBps === undefined || customBps <= 0) {
        throw new CoreApiError(
          'VALIDATION_FAILED',
          400,
          `Missing customRatiosBasisPoints for unit "${u.unitId}".`,
        );
      }
      w = customBps;
    }
    weights.push({ unit: u, weight: w });
    totalWeight += w;
  }

  if (
    (input.method === 'OWNERSHIP_SHARE' || input.method === 'CUSTOM_AUTHORIZED') &&
    totalWeight !== 10_000
  ) {
    throw new CoreApiError(
      'VALIDATION_FAILED',
      400,
      `Allocation basis points must sum to exactly 10000 (100.00%); received ${totalWeight}.`,
    );
  }

  // Deterministic integer allocation with remainder distribution so sum(allocatedAmount) === expense.amount
  const totalBig = BigInt(expense.amount);
  const weightSumBig = BigInt(totalWeight);
  let allocatedSum = 0;

  const unitShares: UnitExpenseShareItem[] = weights.map(({ unit, weight }) => {
    const shareBig = (totalBig * BigInt(weight)) / weightSumBig;
    const allocatedAmount = Number(shareBig);
    const ratioBasisPoints = Math.round((weight / totalWeight) * 10000);
    allocatedSum += allocatedAmount;
    return {
      unitId: unit.unitId,
      ownerUid: unit.ownerUid,
      ratioBasisPoints,
      allocatedAmount,
    };
  });

  const remainder = expense.amount - allocatedSum;
  if (remainder > 0 && unitShares.length > 0) {
    unitShares[0].allocatedAmount += remainder;
  }

  const allocationId = input.allocationId ?? `alc_${randomUUID().replace(/-/g, '').slice(0, 14)}`;
  const record: SharedExpenseAllocationRecord = {
    allocationId,
    buildingId,
    expenseId: input.expenseId,
    allocationPeriod: input.allocationPeriod,
    method: input.method,
    totalExpenseAmount: expense.amount,
    currency: expense.currency,
    unitShares,
    approvedByUid: actorUid,
    reconciliationStatus: 'RECONCILED',
    createdAtIso: nowIso,
  };

  tx.set(`buildingOpsAllocations/${allocationId}`, record);
  bIndex.allocationIds.push(allocationId);
  appendBuildingHistoryEvent(tx, bIndex, {
    eventType: 'SHARED_EXPENSE_ALLOCATED',
    actorUid,
    summary: `Expense "${input.expenseId}" allocated across ${unitShares.length} units via "${input.method}".`,
    metadata: { allocationId, expenseId: input.expenseId, method: input.method },
    nowIso,
  });
  saveBuildingIndex(tx, bIndex);
  return record;
}

export async function executeRecordUtilityBill(params: {
  tx: TransactionContextLike;
  buildingId: string;
  actorUid: string;
  isAdmin: boolean;
  input: RecordUtilityBillInput;
  nowIso: string;
}): Promise<UtilityRecord> {
  const { tx, buildingId, actorUid, isAdmin, input, nowIso } = params;
  const bSnap = await tx.get<BuildingRecord>(`buildingOpsBuildings/${buildingId}`);
  if (!bSnap.exists || !bSnap.data) {
    throw new CoreApiError('NOT_FOUND', 404, `Building "${buildingId}" was not found.`);
  }
  assertBuildingOwnerOrManagerAccess(bSnap.data, actorUid, isAdmin);

  const bIndex = await loadOrInitBuildingIndex(tx, buildingId, nowIso);
  const utilityId = input.utilityId ?? `utl_${randomUUID().replace(/-/g, '').slice(0, 14)}`;

  const record: UtilityRecord = {
    utilityId,
    buildingId,
    ...(input.unitId ? { unitId: input.unitId } : {}),
    utilityType: input.utilityType,
    providerReference: input.providerReference,
    billingPeriod: input.billingPeriod,
    meterReference: input.meterReference,
    meterReading: input.meterReading,
    consumptionQuantity: input.consumptionQuantity,
    measurementUnit: input.measurementUnit,
    billAmount: input.billAmount,
    currency: input.currency,
    paymentStatus: input.paymentStatus,
    ...(input.supportingDocumentMediaId ? { supportingDocumentMediaId: input.supportingDocumentMediaId } : {}),
    createdAtIso: nowIso,
  };

  tx.set(`buildingOpsUtilities/${utilityId}`, record);
  bIndex.utilityIds.push(utilityId);
  appendBuildingHistoryEvent(tx, bIndex, {
    eventType: 'UTILITY_BILL_RECORDED',
    actorUid,
    summary: `Utility bill "${utilityId}" (${input.utilityType}, ${input.billingPeriod}) recorded.`,
    metadata: { utilityId, utilityType: input.utilityType, billAmount: input.billAmount },
    nowIso,
  });
  saveBuildingIndex(tx, bIndex);
  return record;
}

export async function executeRecordBuildingInspection(params: {
  tx: TransactionContextLike;
  buildingId: string;
  actorUid: string;
  isAdmin: boolean;
  input: RecordBuildingInspectionInput;
  nowIso: string;
}): Promise<BuildingInspectionRecord> {
  const { tx, buildingId, actorUid, isAdmin, input, nowIso } = params;
  const bSnap = await tx.get<BuildingRecord>(`buildingOpsBuildings/${buildingId}`);
  if (!bSnap.exists || !bSnap.data) {
    throw new CoreApiError('NOT_FOUND', 404, `Building "${buildingId}" was not found.`);
  }
  assertBuildingOwnerOrManagerAccess(bSnap.data, actorUid, isAdmin);

  const bIndex = await loadOrInitBuildingIndex(tx, buildingId, nowIso);
  const inspectionId = input.inspectionId ?? `bin_${randomUUID().replace(/-/g, '').slice(0, 14)}`;

  const existingSnap = await tx.get<BuildingInspectionRecord>(`buildingOpsInspections/${inspectionId}`);
  if (existingSnap.exists && existingSnap.data && existingSnap.data.status === 'COMPLETED_IMMUTABLE') {
    throw new CoreApiError('CONFLICT', 409, `Completed building inspection "${inspectionId}" is immutable.`);
  }

  const status = input.completeImmediately !== false ? 'COMPLETED_IMMUTABLE' : 'SCHEDULED';
  const record: BuildingInspectionRecord = {
    inspectionId,
    buildingId,
    ...(input.equipmentId ? { equipmentId: input.equipmentId } : {}),
    inspectionType: input.inspectionType,
    inspectorUid: actorUid,
    inspectionDateIso: input.inspectionDateIso,
    checklist: input.checklist,
    findings: input.findings,
    severity: input.severity,
    evidenceMediaIds: input.evidenceMediaIds ?? [],
    requiredCorrectiveActions: input.requiredCorrectiveActions ?? [],
    status,
    createdAtIso: existingSnap.exists && existingSnap.data ? existingSnap.data.createdAtIso : nowIso,
    updatedAtIso: nowIso,
  };

  tx.set(`buildingOpsInspections/${inspectionId}`, record);
  if (!bIndex.inspectionIds.includes(inspectionId)) {
    bIndex.inspectionIds.push(inspectionId);
  }
  appendBuildingHistoryEvent(tx, bIndex, {
    eventType: 'BUILDING_INSPECTION_RECORDED',
    actorUid,
    summary: `Building inspection "${inspectionId}" (${input.inspectionType}) recorded as "${status}".`,
    metadata: { inspectionId, inspectionType: input.inspectionType, severity: input.severity },
    nowIso,
  });
  saveBuildingIndex(tx, bIndex);
  return record;
}

export async function executeReportSafetyIncident(params: {
  tx: TransactionContextLike;
  buildingId: string;
  actorUid: string;
  isAdmin: boolean;
  input: ReportSafetyIncidentInput;
  nowIso: string;
}): Promise<SafetyIncidentRecord> {
  const { tx, buildingId, actorUid, isAdmin, input, nowIso } = params;
  const bSnap = await tx.get<BuildingRecord>(`buildingOpsBuildings/${buildingId}`);
  if (!bSnap.exists || !bSnap.data) {
    throw new CoreApiError('NOT_FOUND', 404, `Building "${buildingId}" was not found.`);
  }
  const bIndex = await loadOrInitBuildingIndex(tx, buildingId, nowIso);
  const authorized = await isBuildingResidentOrParticipant(tx, bSnap.data, bIndex.unitIds, actorUid, isAdmin);
  if (!authorized) {
    throw new CoreApiError('FORBIDDEN', 403, 'Principal is not authorized to report or update safety incidents for this building.');
  }

  const incidentId = input.incidentId ?? `inc_${randomUUID().replace(/-/g, '').slice(0, 14)}`;
  const escalationPriority =
    input.severity === 'CRITICAL'
      ? 'P1_IMMEDIATE'
      : input.severity === 'HIGH'
        ? 'P2_URGENT'
        : 'P3_NORMAL';
  const status = input.status ?? 'OPEN';

  const incident: SafetyIncidentRecord = {
    incidentId,
    buildingId,
    ...(input.unitId ? { unitId: input.unitId } : {}),
    ...(input.equipmentId ? { equipmentId: input.equipmentId } : {}),
    category: input.category,
    incidentTimestampIso: input.incidentTimestampIso,
    severity: input.severity,
    escalationPriority,
    description: input.description,
    evidenceMediaIds: input.evidenceMediaIds ?? [],
    responsiblePartyUid: input.responsiblePartyUid,
    responseActions: input.responseActions ?? [],
    status,
    ...(status === 'RESOLVED' ? { resolvedAtIso: nowIso } : {}),
    createdAtIso: nowIso,
    updatedAtIso: nowIso,
  };

  tx.set(`buildingOpsIncidents/${incidentId}`, incident);
  if (!bIndex.incidentIds.includes(incidentId)) {
    bIndex.incidentIds.push(incidentId);
  }
  appendBuildingHistoryEvent(tx, bIndex, {
    eventType: 'SAFETY_INCIDENT_RECORDED',
    actorUid,
    summary: `Safety incident "${incidentId}" (${input.category}, ${escalationPriority}) recorded.`,
    metadata: { incidentId, category: input.category, escalationPriority, status },
    nowIso,
  });
  saveBuildingIndex(tx, bIndex);
  return incident;
}
