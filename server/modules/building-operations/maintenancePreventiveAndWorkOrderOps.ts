import { randomUUID } from 'node:crypto';
import { CoreApiError, type TransactionContextLike } from '../core';
import { executeCreateObligation } from '../transactions';
import {
  appendBuildingHistoryEvent,
  assertBuildingOwnerOrManagerAccess,
  loadOrInitBuildingIndex,
  saveBuildingIndex,
} from './buildingUnitFacilityAndEquipmentOps';
import type {
  BuildingMaintenanceRequestRecord,
  BuildingRecord,
  BuildingUnitRecord,
  EquipmentAssetRecord,
  PreventiveMaintenanceScheduleRecord,
  WorkOrderRecord,
  WorkOrderStatus,
} from './types';
import type {
  CreateBuildingMaintenanceInput,
  CreatePreventiveScheduleInput,
  CreateWorkOrderInput,
  TransitionWorkOrderInput,
} from './validation';

export const ALLOWED_WORK_ORDER_TRANSITIONS: Readonly<
  Record<WorkOrderStatus, readonly WorkOrderStatus[]>
> = {
  CREATED: ['PENDING_APPROVAL', 'APPROVED', 'ASSIGNED', 'CANCELLED'],
  PENDING_APPROVAL: ['APPROVED', 'CANCELLED'],
  APPROVED: ['ASSIGNED', 'SCHEDULED', 'CANCELLED'],
  ASSIGNED: ['SCHEDULED', 'IN_PROGRESS', 'ON_HOLD', 'CANCELLED'],
  SCHEDULED: ['IN_PROGRESS', 'ON_HOLD', 'CANCELLED'],
  IN_PROGRESS: ['ON_HOLD', 'COMPLETED', 'CANCELLED'],
  ON_HOLD: ['IN_PROGRESS', 'CANCELLED'],
  COMPLETED: ['VERIFIED'],
  VERIFIED: [],
  CANCELLED: [],
};

export async function isBuildingResidentOrParticipant(
  tx: TransactionContextLike,
  building: BuildingRecord,
  unitIds: readonly string[],
  actorUid: string,
  isAdmin: boolean,
): Promise<boolean> {
  if (isAdmin || building.ownerUids.includes(actorUid) || building.propertyManagerUid === actorUid) {
    return true;
  }
  for (const uid of unitIds) {
    const uSnap = await tx.get<BuildingUnitRecord>(`buildingOpsUnits/${uid}`);
    if (uSnap.exists && uSnap.data && (uSnap.data.ownerUid === actorUid || uSnap.data.tenantUid === actorUid)) {
      return true;
    }
  }
  return false;
}

export async function executeCreateBuildingMaintenanceRequest(params: {
  tx: TransactionContextLike;
  buildingId: string;
  actorUid: string;
  isAdmin: boolean;
  input: CreateBuildingMaintenanceInput;
  nowIso: string;
}): Promise<BuildingMaintenanceRequestRecord> {
  const { tx, buildingId, actorUid, isAdmin, input, nowIso } = params;
  const bSnap = await tx.get<BuildingRecord>(`buildingOpsBuildings/${buildingId}`);
  if (!bSnap.exists || !bSnap.data) {
    throw new CoreApiError('NOT_FOUND', 404, `Building "${buildingId}" was not found.`);
  }
  const building = bSnap.data;
  const bIndex = await loadOrInitBuildingIndex(tx, buildingId, nowIso);

  const authorized = await isBuildingResidentOrParticipant(tx, building, bIndex.unitIds, actorUid, isAdmin);
  if (!authorized) {
    throw new CoreApiError('FORBIDDEN', 403, 'Principal is not authorized to submit maintenance requests for this building.');
  }

  if (input.equipmentId) {
    const eqSnap = await tx.get<EquipmentAssetRecord>(`buildingOpsEquipment/${input.equipmentId}`);
    if (!eqSnap.exists || !eqSnap.data || eqSnap.data.buildingId !== buildingId) {
      throw new CoreApiError('VALIDATION_FAILED', 400, `Equipment "${input.equipmentId}" does not belong to building "${buildingId}".`);
    }
  }

  const requestId = input.requestId ?? `bmr_${randomUUID().replace(/-/g, '').slice(0, 14)}`;
  const record: BuildingMaintenanceRequestRecord = {
    requestId,
    buildingId,
    ...(input.propertyId ? { propertyId: input.propertyId } : {}),
    ...(input.unitId ? { unitId: input.unitId } : {}),
    ...(input.equipmentId ? { equipmentId: input.equipmentId } : {}),
    requestedByUid: actorUid,
    category: input.category,
    priority: input.priority,
    description: input.description,
    attachmentMediaIds: input.attachmentMediaIds ?? [],
    ...(input.estimatedCostAmount !== undefined ? { estimatedCostAmount: input.estimatedCostAmount } : {}),
    currency: input.currency,
    approvalRequired: input.approvalRequired ?? true,
    status: 'SUBMITTED',
    completionEvidenceMediaIds: [],
    createdAtIso: nowIso,
    updatedAtIso: nowIso,
  };

  tx.set(`buildingOpsMaintenance/${requestId}`, record);
  bIndex.maintenanceRequestIds.push(requestId);
  appendBuildingHistoryEvent(tx, bIndex, {
    eventType: 'MAINTENANCE_REQUEST_SUBMITTED',
    actorUid,
    summary: `Maintenance request "${requestId}" (${input.category}, ${input.priority}) submitted.`,
    metadata: { requestId, priority: input.priority },
    nowIso,
  });
  saveBuildingIndex(tx, bIndex);
  return record;
}

export async function executeCreatePreventiveSchedule(params: {
  tx: TransactionContextLike;
  buildingId: string;
  actorUid: string;
  isAdmin: boolean;
  input: CreatePreventiveScheduleInput;
  nowIso: string;
}): Promise<PreventiveMaintenanceScheduleRecord> {
  const { tx, buildingId, actorUid, isAdmin, input, nowIso } = params;
  const bSnap = await tx.get<BuildingRecord>(`buildingOpsBuildings/${buildingId}`);
  if (!bSnap.exists || !bSnap.data) {
    throw new CoreApiError('NOT_FOUND', 404, `Building "${buildingId}" was not found.`);
  }
  assertBuildingOwnerOrManagerAccess(bSnap.data, actorUid, isAdmin);

  if (input.equipmentId) {
    const eqSnap = await tx.get<EquipmentAssetRecord>(`buildingOpsEquipment/${input.equipmentId}`);
    if (!eqSnap.exists || !eqSnap.data || eqSnap.data.buildingId !== buildingId) {
      throw new CoreApiError('VALIDATION_FAILED', 400, `Equipment "${input.equipmentId}" does not belong to building "${buildingId}".`);
    }
  }

  const bIndex = await loadOrInitBuildingIndex(tx, buildingId, nowIso);
  const scheduleId = input.scheduleId ?? `pms_${randomUUID().replace(/-/g, '').slice(0, 14)}`;

  const schedule: PreventiveMaintenanceScheduleRecord = {
    scheduleId,
    buildingId,
    ...(input.equipmentId ? { equipmentId: input.equipmentId } : {}),
    ...(input.facilityId ? { facilityId: input.facilityId } : {}),
    title: input.title,
    recurrenceIntervalDays: input.recurrenceIntervalDays,
    nextDueDateIso: input.nextDueDateIso,
    responsiblePartyUid: input.responsiblePartyUid,
    ...(input.assignedServiceProviderId ? { assignedServiceProviderId: input.assignedServiceProviderId } : {}),
    checklistItems: input.checklistItems,
    status: 'ACTIVE',
    generatedWorkOrderKeys: [],
    createdAtIso: nowIso,
    updatedAtIso: nowIso,
  };

  tx.set(`buildingOpsPreventiveSchedules/${scheduleId}`, schedule);
  bIndex.preventiveScheduleIds.push(scheduleId);
  appendBuildingHistoryEvent(tx, bIndex, {
    eventType: 'PREVENTIVE_SCHEDULE_CREATED',
    actorUid,
    summary: `Preventive schedule "${scheduleId}" (${input.title}) registered.`,
    metadata: { scheduleId, recurrenceIntervalDays: input.recurrenceIntervalDays },
    nowIso,
  });
  saveBuildingIndex(tx, bIndex);
  return schedule;
}

export async function executeGeneratePreventiveWorkOrder(params: {
  tx: TransactionContextLike;
  buildingId: string;
  scheduleId: string;
  actorUid: string;
  isAdmin: boolean;
  serviceProviderId: string;
  estimatedCostAmount: number;
  currency: 'IRR' | 'IRT';
  nowIso: string;
}): Promise<{ schedule: PreventiveMaintenanceScheduleRecord; workOrder: WorkOrderRecord }> {
  const { tx, buildingId, scheduleId, actorUid, isAdmin, serviceProviderId, estimatedCostAmount, currency, nowIso } = params;
  const bSnap = await tx.get<BuildingRecord>(`buildingOpsBuildings/${buildingId}`);
  const sSnap = await tx.get<PreventiveMaintenanceScheduleRecord>(`buildingOpsPreventiveSchedules/${scheduleId}`);
  if (!bSnap.exists || !bSnap.data || !sSnap.exists || !sSnap.data || sSnap.data.buildingId !== buildingId) {
    throw new CoreApiError('NOT_FOUND', 404, `Preventive schedule "${scheduleId}" was not found.`);
  }
  assertBuildingOwnerOrManagerAccess(bSnap.data, actorUid, isAdmin);
  const schedule = sSnap.data;

  if (schedule.status !== 'ACTIVE') {
    throw new CoreApiError('CONFLICT', 409, `Preventive schedule "${scheduleId}" is suspended.`);
  }

  const cycleKey = `${scheduleId}:${schedule.nextDueDateIso}`;
  if (schedule.generatedWorkOrderKeys.includes(cycleKey)) {
    throw new CoreApiError(
      'CONFLICT',
      409,
      `Work order for preventive schedule "${scheduleId}" at due date "${schedule.nextDueDateIso}" has already been generated.`,
    );
  }

  const bIndex = await loadOrInitBuildingIndex(tx, buildingId, nowIso);
  const workOrderId = `wo_pms_${scheduleId}_${schedule.generatedWorkOrderKeys.length + 1}`;
  const dueMs = Date.parse(schedule.nextDueDateIso);
  const nextCycleIso = new Date(dueMs + schedule.recurrenceIntervalDays * 24 * 60 * 60 * 1000).toISOString();

  const workOrder: WorkOrderRecord = {
    workOrderId,
    buildingId,
    preventiveScheduleId: scheduleId,
    ...(schedule.equipmentId ? { equipmentId: schedule.equipmentId } : {}),
    serviceProviderId,
    priority: 'MEDIUM',
    scheduledStartIso: schedule.nextDueDateIso,
    scheduledCompletionIso: new Date(dueMs + 24 * 60 * 60 * 1000).toISOString(),
    estimatedCostAmount,
    currency,
    providerAcceptanceStatus: 'PENDING',
    status: 'ASSIGNED',
    supportingDocumentMediaIds: [],
    createdAtIso: nowIso,
    updatedAtIso: nowIso,
  };

  const updatedSchedule: PreventiveMaintenanceScheduleRecord = {
    ...schedule,
    nextDueDateIso: nextCycleIso,
    generatedWorkOrderKeys: [...schedule.generatedWorkOrderKeys, cycleKey],
    updatedAtIso: nowIso,
  };

  tx.set(`buildingOpsWorkOrders/${workOrderId}`, workOrder);
  tx.set(`buildingOpsPreventiveSchedules/${scheduleId}`, updatedSchedule);
  bIndex.workOrderIds.push(workOrderId);
  appendBuildingHistoryEvent(tx, bIndex, {
    eventType: 'PREVENTIVE_WORK_ORDER_GENERATED',
    actorUid,
    summary: `Preventive work order "${workOrderId}" generated for cycle "${schedule.nextDueDateIso}".`,
    metadata: { workOrderId, scheduleId },
    nowIso,
  });
  saveBuildingIndex(tx, bIndex);
  return { schedule: updatedSchedule, workOrder };
}

export async function executeCreateWorkOrder(params: {
  tx: TransactionContextLike;
  buildingId: string;
  actorUid: string;
  isAdmin: boolean;
  input: CreateWorkOrderInput;
  nowIso: string;
}): Promise<WorkOrderRecord> {
  const { tx, buildingId, actorUid, isAdmin, input, nowIso } = params;
  const bSnap = await tx.get<BuildingRecord>(`buildingOpsBuildings/${buildingId}`);
  if (!bSnap.exists || !bSnap.data) {
    throw new CoreApiError('NOT_FOUND', 404, `Building "${buildingId}" was not found.`);
  }
  assertBuildingOwnerOrManagerAccess(bSnap.data, actorUid, isAdmin);

  if (input.equipmentId) {
    const eqSnap = await tx.get<EquipmentAssetRecord>(`buildingOpsEquipment/${input.equipmentId}`);
    if (!eqSnap.exists || !eqSnap.data || eqSnap.data.buildingId !== buildingId) {
      throw new CoreApiError('VALIDATION_FAILED', 400, `Equipment "${input.equipmentId}" does not belong to building "${buildingId}".`);
    }
  }

  const bIndex = await loadOrInitBuildingIndex(tx, buildingId, nowIso);
  const workOrderId = input.workOrderId ?? `wo_${randomUUID().replace(/-/g, '').slice(0, 14)}`;
  if (bIndex.workOrderIds.includes(workOrderId)) {
    throw new CoreApiError('CONFLICT', 409, `Work order "${workOrderId}" already exists.`);
  }

  const workOrder: WorkOrderRecord = {
    workOrderId,
    buildingId,
    ...(input.propertyId ? { propertyId: input.propertyId } : {}),
    ...(input.unitId ? { unitId: input.unitId } : {}),
    ...(input.maintenanceRequestId ? { maintenanceRequestId: input.maintenanceRequestId } : {}),
    ...(input.preventiveScheduleId ? { preventiveScheduleId: input.preventiveScheduleId } : {}),
    ...(input.equipmentId ? { equipmentId: input.equipmentId } : {}),
    serviceProviderId: input.serviceProviderId,
    ...(input.assignedPersonnelName ? { assignedPersonnelName: input.assignedPersonnelName } : {}),
    priority: input.priority,
    scheduledStartIso: input.scheduledStartIso,
    scheduledCompletionIso: input.scheduledCompletionIso,
    estimatedCostAmount: input.estimatedCostAmount,
    currency: input.currency,
    providerAcceptanceStatus: 'PENDING',
    status: 'ASSIGNED',
    supportingDocumentMediaIds: [],
    ...(input.linkedTransactionId ? { linkedTransactionId: input.linkedTransactionId } : {}),
    createdAtIso: nowIso,
    updatedAtIso: nowIso,
  };

  if (input.maintenanceRequestId) {
    const mSnap = await tx.get<BuildingMaintenanceRequestRecord>(`buildingOpsMaintenance/${input.maintenanceRequestId}`);
    if (mSnap.exists && mSnap.data && mSnap.data.buildingId === buildingId) {
      tx.set(`buildingOpsMaintenance/${input.maintenanceRequestId}`, {
        ...mSnap.data,
        assignedServiceProviderId: input.serviceProviderId,
        workOrderId,
        status: 'ASSIGNED',
        updatedAtIso: nowIso,
      });
    }
  }

  tx.set(`buildingOpsWorkOrders/${workOrderId}`, workOrder);
  bIndex.workOrderIds.push(workOrderId);
  appendBuildingHistoryEvent(tx, bIndex, {
    eventType: 'WORK_ORDER_CREATED',
    actorUid,
    summary: `Work order "${workOrderId}" created and assigned to provider "${input.serviceProviderId}".`,
    metadata: { workOrderId, serviceProviderId: input.serviceProviderId },
    nowIso,
  });
  saveBuildingIndex(tx, bIndex);
  return workOrder;
}

export async function executeTransitionWorkOrder(params: {
  tx: TransactionContextLike;
  buildingId: string;
  workOrderId: string;
  actorUid: string;
  isAdmin: boolean;
  input: TransitionWorkOrderInput;
  nowIso: string;
}): Promise<WorkOrderRecord> {
  const { tx, buildingId, workOrderId, actorUid, isAdmin, input, nowIso } = params;
  const bSnap = await tx.get<BuildingRecord>(`buildingOpsBuildings/${buildingId}`);
  const woSnap = await tx.get<WorkOrderRecord>(`buildingOpsWorkOrders/${workOrderId}`);
  if (!bSnap.exists || !bSnap.data || !woSnap.exists || !woSnap.data || woSnap.data.buildingId !== buildingId) {
    throw new CoreApiError('NOT_FOUND', 404, `Work order "${workOrderId}" was not found.`);
  }
  const building = bSnap.data;
  const wo = woSnap.data;

  const isManagerOrOwner =
    isAdmin || building.ownerUids.includes(actorUid) || building.propertyManagerUid === actorUid;
  const isAssignedProvider = actorUid === wo.serviceProviderId;

  if (!isManagerOrOwner && !isAssignedProvider) {
    throw new CoreApiError('FORBIDDEN', 403, 'Not authorized to transition this work order.');
  }

  if ((input.targetStatus === 'VERIFIED' || input.targetStatus === 'CANCELLED') && !isManagerOrOwner) {
    throw new CoreApiError(
      'FORBIDDEN',
      403,
      `Work order transition to "${input.targetStatus}" requires owner or building manager authorization.`,
    );
  }

  if (wo.status !== input.targetStatus) {
    const allowed = ALLOWED_WORK_ORDER_TRANSITIONS[wo.status] ?? [];
    if (!allowed.includes(input.targetStatus)) {
      throw new CoreApiError(
        'CONFLICT',
        409,
        `Work order transition from "${wo.status}" to "${input.targetStatus}" is not permitted.`,
      );
    }
  }

  const bIndex = await loadOrInitBuildingIndex(tx, buildingId, nowIso);
  let linkedFinancialObligationId = wo.linkedFinancialObligationId;

  if (
    wo.linkedTransactionId &&
    input.approvedCostAmount !== undefined &&
    input.costPayerUid &&
    input.costPayeeUid &&
    !linkedFinancialObligationId
  ) {
    const ob = await executeCreateObligation({
      tx,
      transactionId: wo.linkedTransactionId,
      actorUid,
      isAdmin: true,
      input: {
        obligationId: `obl_wo_${workOrderId}`,
        category: 'SERVICE_FEE',
        title: `Approved Work Order Cost (${workOrderId})`,
        amount: input.approvedCostAmount,
        currency: wo.currency,
        payerUid: input.costPayerUid,
        payeeUid: input.costPayeeUid,
        dueDateIso: wo.scheduledCompletionIso,
      },
      nowIso,
    });
    linkedFinancialObligationId = ob.obligationId;
  }

  const updated: WorkOrderRecord = {
    ...wo,
    status: input.targetStatus,
    ...(input.providerDecision ? { providerAcceptanceStatus: input.providerDecision } : {}),
    ...(input.approvedCostAmount !== undefined ? { approvedCostAmount: input.approvedCostAmount } : {}),
    ...(input.completionNotes ? { completionNotes: input.completionNotes } : {}),
    ...(input.qualityRating !== undefined ? { qualityRating: input.qualityRating } : {}),
    ...(input.supportingDocumentMediaIds ? { supportingDocumentMediaIds: input.supportingDocumentMediaIds } : {}),
    ...(input.targetStatus === 'IN_PROGRESS' && !wo.actualStartIso ? { actualStartIso: nowIso } : {}),
    ...(input.targetStatus === 'COMPLETED' ? { actualCompletionIso: nowIso } : {}),
    ...(linkedFinancialObligationId ? { linkedFinancialObligationId } : {}),
    updatedAtIso: nowIso,
  };

  if (wo.maintenanceRequestId && (input.targetStatus === 'COMPLETED' || input.targetStatus === 'VERIFIED')) {
    const mSnap = await tx.get<BuildingMaintenanceRequestRecord>(`buildingOpsMaintenance/${wo.maintenanceRequestId}`);
    if (mSnap.exists && mSnap.data) {
      tx.set(`buildingOpsMaintenance/${wo.maintenanceRequestId}`, {
        ...mSnap.data,
        status: 'COMPLETED',
        completedAtIso: nowIso,
        updatedAtIso: nowIso,
      });
    }
  }

  tx.set(`buildingOpsWorkOrders/${workOrderId}`, updated);
  appendBuildingHistoryEvent(tx, bIndex, {
    eventType: 'WORK_ORDER_TRANSITIONED',
    actorUid,
    summary: `Work order "${workOrderId}" transitioned to "${input.targetStatus}".`,
    metadata: { workOrderId, status: input.targetStatus },
    nowIso,
  });
  saveBuildingIndex(tx, bIndex);
  return updated;
}
