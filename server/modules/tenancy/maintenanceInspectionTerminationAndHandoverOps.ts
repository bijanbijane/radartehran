import { randomUUID } from 'node:crypto';
import { CoreApiError, type TransactionContextLike } from '../core';
import { executeCreateObligation } from '../transactions';
import {
  appendTenancyHistoryEvent,
  assertLandlordOrManagerAccess,
  loadOrInitPropertyTenancyIndex,
  savePropertyTenancyIndex,
} from './propertyApplicationAndLeaseOps';
import type {
  LeaseAgreementRecord,
  MaintenanceRequestRecord,
  PropertyHandoverRecord,
  PropertyInspectionRecord,
  RentalPropertyConfigRecord,
  TenancyTerminationRecord,
} from './types';
import type {
  CreateMaintenanceRequestInput,
  HandoverOperationInput,
  InitiateTerminationInput,
  RecordInspectionInput,
  UpdateMaintenanceRequestInput,
} from './validation';

export async function executeCreateMaintenanceRequest(params: {
  tx: TransactionContextLike;
  propertyId: string;
  leaseId: string;
  actorUid: string;
  isAdmin: boolean;
  input: CreateMaintenanceRequestInput;
  nowIso: string;
}): Promise<MaintenanceRequestRecord> {
  const { tx, propertyId, leaseId, actorUid, isAdmin, input, nowIso } = params;
  const leaseSnap = await tx.get<LeaseAgreementRecord>(`tenancyLeases/${leaseId}`);
  if (!leaseSnap.exists || !leaseSnap.data || leaseSnap.data.propertyId !== propertyId) {
    throw new CoreApiError('NOT_FOUND', 404, `Lease "${leaseId}" was not found.`);
  }
  const lease = leaseSnap.data;

  const isAuthorizedParty =
    isAdmin ||
    actorUid === lease.tenantUid ||
    actorUid === lease.landlordUid ||
    actorUid === lease.propertyManagerUid;
  if (!isAuthorizedParty) {
    throw new CoreApiError('FORBIDDEN', 403, 'Principal is not authorized to submit maintenance requests for this tenancy.');
  }

  const pIndex = await loadOrInitPropertyTenancyIndex(tx, propertyId, nowIso);
  const requestId = input.requestId ?? `mnt_${randomUUID().replace(/-/g, '').slice(0, 14)}`;

  const record: MaintenanceRequestRecord = {
    requestId,
    leaseId,
    propertyId,
    transactionId: lease.transactionId,
    requestedByUid: actorUid,
    category: input.category,
    description: input.description,
    priority: input.priority,
    ...(lease.propertyManagerUid ? { assignedPropertyManagerUid: lease.propertyManagerUid } : {}),
    status: 'SUBMITTED',
    attachmentMediaIds: input.attachmentMediaIds ?? [],
    ...(input.estimatedCostAmount !== undefined ? { estimatedCostAmount: input.estimatedCostAmount } : {}),
    currency: lease.currency,
    createdAtIso: nowIso,
    updatedAtIso: nowIso,
  };

  tx.set(`tenancyMaintenance/${requestId}`, record);
  pIndex.maintenanceIds.push(requestId);
  appendTenancyHistoryEvent(tx, pIndex, {
    leaseId,
    eventType: 'MAINTENANCE_SUBMITTED',
    actorUid,
    summary: `Maintenance request "${requestId}" (${input.category}, ${input.priority}) submitted.`,
    metadata: { requestId, category: input.category, priority: input.priority },
    nowIso,
  });
  savePropertyTenancyIndex(tx, pIndex);
  return record;
}

export async function executeUpdateMaintenanceRequest(params: {
  tx: TransactionContextLike;
  propertyId: string;
  leaseId: string;
  requestId: string;
  actorUid: string;
  isAdmin: boolean;
  input: UpdateMaintenanceRequestInput;
  nowIso: string;
}): Promise<MaintenanceRequestRecord> {
  const { tx, propertyId, leaseId, requestId, actorUid, isAdmin, input, nowIso } = params;
  const propSnap = await tx.get<RentalPropertyConfigRecord>(`tenancyProperties/${propertyId}`);
  const leaseSnap = await tx.get<LeaseAgreementRecord>(`tenancyLeases/${leaseId}`);
  const mntSnap = await tx.get<MaintenanceRequestRecord>(`tenancyMaintenance/${requestId}`);
  if (
    !propSnap.exists ||
    !propSnap.data ||
    !leaseSnap.exists ||
    !leaseSnap.data ||
    !mntSnap.exists ||
    !mntSnap.data ||
    mntSnap.data.leaseId !== leaseId
  ) {
    throw new CoreApiError('NOT_FOUND', 404, `Maintenance request "${requestId}" was not found.`);
  }
  const prop = propSnap.data;
  const lease = leaseSnap.data;
  const mnt = mntSnap.data;

  if (input.status === 'CANCELLED' && actorUid === mnt.requestedByUid) {
    // Requesting participant may cancel their own request before completion
  } else {
    assertLandlordOrManagerAccess(prop, actorUid, isAdmin);
  }

  const pIndex = await loadOrInitPropertyTenancyIndex(tx, propertyId, nowIso);
  let linkedFinancialObligationId = mnt.linkedFinancialObligationId;

  // When an approved service cost is configured with a designated payer, record an Employee 54 financial obligation
  if (
    input.approvedCostAmount !== undefined &&
    input.costPayerUid &&
    !linkedFinancialObligationId
  ) {
    const payeeUid =
      input.costPayerUid === lease.tenantUid ? lease.landlordUid : lease.tenantUid;
    const ob = await executeCreateObligation({
      tx,
      transactionId: lease.transactionId,
      actorUid,
      isAdmin: true,
      input: {
        obligationId: `obl_mnt_${requestId}`,
        category: 'SERVICE_FEE',
        title: `Approved Maintenance Service Cost (${requestId})`,
        amount: input.approvedCostAmount,
        currency: lease.currency,
        payerUid: input.costPayerUid,
        payeeUid,
        dueDateIso: new Date(Date.parse(nowIso) + 7 * 24 * 60 * 60 * 1000).toISOString(),
        contractReferenceId: lease.contractDocumentId,
      },
      nowIso,
    });
    linkedFinancialObligationId = ob.obligationId;
  }

  const updated: MaintenanceRequestRecord = {
    ...mnt,
    status: input.status,
    ...(input.assignedServiceProviderId ? { assignedServiceProviderId: input.assignedServiceProviderId } : {}),
    ...(input.workOrderReference ? { workOrderReference: input.workOrderReference } : {}),
    ...(input.approvedCostAmount !== undefined ? { approvedCostAmount: input.approvedCostAmount } : {}),
    ...(input.costPayerUid ? { costPayerUid: input.costPayerUid } : {}),
    ...(linkedFinancialObligationId ? { linkedFinancialObligationId } : {}),
    ...(input.completionSummary ? { completionSummary: input.completionSummary } : {}),
    ...(input.status === 'COMPLETED' ? { completedAtIso: nowIso } : {}),
    updatedAtIso: nowIso,
  };

  tx.set(`tenancyMaintenance/${requestId}`, updated);
  appendTenancyHistoryEvent(tx, pIndex, {
    leaseId,
    eventType: 'MAINTENANCE_UPDATED',
    actorUid,
    summary: `Maintenance request "${requestId}" updated to "${input.status}".`,
    metadata: { requestId, status: input.status },
    nowIso,
  });
  savePropertyTenancyIndex(tx, pIndex);
  return updated;
}

export async function executeRecordOrCompleteInspection(params: {
  tx: TransactionContextLike;
  propertyId: string;
  leaseId: string;
  actorUid: string;
  isAdmin: boolean;
  input: RecordInspectionInput;
  nowIso: string;
}): Promise<PropertyInspectionRecord> {
  const { tx, propertyId, leaseId, actorUid, isAdmin, input, nowIso } = params;
  const leaseSnap = await tx.get<LeaseAgreementRecord>(`tenancyLeases/${leaseId}`);
  if (!leaseSnap.exists || !leaseSnap.data || leaseSnap.data.propertyId !== propertyId) {
    throw new CoreApiError('NOT_FOUND', 404, `Lease "${leaseId}" was not found.`);
  }
  const lease = leaseSnap.data;
  const isParticipant =
    isAdmin ||
    actorUid === lease.landlordUid ||
    actorUid === lease.tenantUid ||
    actorUid === lease.propertyManagerUid;
  if (!isParticipant) {
    throw new CoreApiError('FORBIDDEN', 403, 'Not authorized to record property inspections.');
  }

  const pIndex = await loadOrInitPropertyTenancyIndex(tx, propertyId, nowIso);
  const inspectionId = input.inspectionId ?? `ins_${randomUUID().replace(/-/g, '').slice(0, 14)}`;

  const existingSnap = await tx.get<PropertyInspectionRecord>(`tenancyInspections/${inspectionId}`);
  if (existingSnap.exists && existingSnap.data && existingSnap.data.status === 'COMPLETED_IMMUTABLE') {
    throw new CoreApiError(
      'CONFLICT',
      409,
      `Completed inspection "${inspectionId}" is an immutable historical snapshot and cannot be modified.`,
    );
  }

  const status = input.completeImmediately ? 'COMPLETED_IMMUTABLE' : 'SCHEDULED';
  const record: PropertyInspectionRecord = {
    inspectionId,
    leaseId,
    propertyId,
    inspectionType: input.inspectionType,
    scheduledAtIso: input.scheduledAtIso,
    inspectorUid: actorUid,
    authorizedParticipantUids: Array.from(
      new Set(
        [lease.landlordUid, lease.tenantUid, lease.propertyManagerUid].filter(
          (u): u is string => typeof u === 'string',
        ),
      ),
    ),
    checklist: input.checklist,
    status,
    acknowledgedByUids: [actorUid],
    ...(status === 'COMPLETED_IMMUTABLE' ? { completedAtIso: nowIso } : {}),
    createdAtIso: existingSnap.exists && existingSnap.data ? existingSnap.data.createdAtIso : nowIso,
    updatedAtIso: nowIso,
  };

  tx.set(`tenancyInspections/${inspectionId}`, record);
  if (!pIndex.inspectionIds.includes(inspectionId)) {
    pIndex.inspectionIds.push(inspectionId);
  }
  appendTenancyHistoryEvent(tx, pIndex, {
    leaseId,
    eventType: `INSPECTION_${status}`,
    actorUid,
    summary: `Property inspection "${inspectionId}" (${input.inspectionType}) recorded as "${status}".`,
    metadata: { inspectionId, inspectionType: input.inspectionType, status },
    nowIso,
  });
  savePropertyTenancyIndex(tx, pIndex);
  return record;
}

export async function executeHandoverOperation(params: {
  tx: TransactionContextLike;
  propertyId: string;
  leaseId: string;
  actorUid: string;
  isAdmin: boolean;
  input: HandoverOperationInput;
  nowIso: string;
}): Promise<PropertyHandoverRecord> {
  const { tx, propertyId, leaseId, actorUid, isAdmin, input, nowIso } = params;
  const leaseSnap = await tx.get<LeaseAgreementRecord>(`tenancyLeases/${leaseId}`);
  if (!leaseSnap.exists || !leaseSnap.data || leaseSnap.data.propertyId !== propertyId) {
    throw new CoreApiError('NOT_FOUND', 404, `Lease "${leaseId}" was not found.`);
  }
  const lease = leaseSnap.data;

  const insSnap = await tx.get<PropertyInspectionRecord>(`tenancyInspections/${input.inspectionReferenceId}`);
  if (!insSnap.exists || !insSnap.data || insSnap.data.leaseId !== leaseId) {
    throw new CoreApiError(
      'VALIDATION_FAILED',
      400,
      `Handover requires a valid inspectionReferenceId ("${input.inspectionReferenceId}") belonging to this lease.`,
    );
  }

  if (input.completeHandover) {
    if (!input.keysTransferredConfirmed || !input.accessDevicesTransferredConfirmed) {
      throw new CoreApiError(
        'CONFLICT',
        409,
        'Cannot complete property handover while keysTransferredConfirmed or accessDevicesTransferredConfirmed remain incomplete.',
      );
    }
    if (insSnap.data.status !== 'COMPLETED_IMMUTABLE') {
      throw new CoreApiError(
        'CONFLICT',
        409,
        'Cannot complete property handover until the referenced inspection is completed.',
      );
    }
  }

  const pIndex = await loadOrInitPropertyTenancyIndex(tx, propertyId, nowIso);
  const handoverId = input.handoverId ?? `hnd_${randomUUID().replace(/-/g, '').slice(0, 14)}`;
  const status = input.completeHandover ? 'COMPLETED' : 'IN_PROGRESS';

  const record: PropertyHandoverRecord = {
    handoverId,
    leaseId,
    propertyId,
    handoverType: input.handoverType,
    scheduledAtIso: input.scheduledAtIso,
    inspectionReferenceId: input.inspectionReferenceId,
    keysTransferredConfirmed: input.keysTransferredConfirmed,
    accessDevicesTransferredConfirmed: input.accessDevicesTransferredConfirmed,
    meterReadings: input.meterReadings ?? {},
    handoverDocumentMediaIds: input.handoverDocumentMediaIds ?? [],
    confirmedByLandlord: true,
    confirmedByTenant: true,
    status,
    ...(status === 'COMPLETED' ? { completedAtIso: nowIso } : {}),
    createdAtIso: nowIso,
    updatedAtIso: nowIso,
  };

  tx.set(`tenancyHandovers/${handoverId}`, record);
  if (!pIndex.handoverIds.includes(handoverId)) {
    pIndex.handoverIds.push(handoverId);
  }
  appendTenancyHistoryEvent(tx, pIndex, {
    leaseId,
    eventType: `HANDOVER_${status}`,
    actorUid,
    summary: `Property handover "${handoverId}" (${input.handoverType}) marked "${status}".`,
    metadata: { handoverId, handoverType: input.handoverType, status },
    nowIso,
  });
  savePropertyTenancyIndex(tx, pIndex);
  return record;
}

export async function executeTenancyTermination(params: {
  tx: TransactionContextLike;
  propertyId: string;
  leaseId: string;
  actorUid: string;
  isAdmin: boolean;
  input: InitiateTerminationInput;
  nowIso: string;
}): Promise<TenancyTerminationRecord> {
  const { tx, propertyId, leaseId, actorUid, isAdmin, input, nowIso } = params;
  const propSnap = await tx.get<RentalPropertyConfigRecord>(`tenancyProperties/${propertyId}`);
  const leaseSnap = await tx.get<LeaseAgreementRecord>(`tenancyLeases/${leaseId}`);
  if (!propSnap.exists || !propSnap.data || !leaseSnap.exists || !leaseSnap.data || leaseSnap.data.propertyId !== propertyId) {
    throw new CoreApiError('NOT_FOUND', 404, `Lease "${leaseId}" was not found.`);
  }
  const prop = propSnap.data;
  const lease = leaseSnap.data;

  if (lease.status === 'TERMINATED') {
    throw new CoreApiError('CONFLICT', 409, `Lease "${leaseId}" is already TERMINATED.`);
  }

  const isLandlord = actorUid === lease.landlordUid || actorUid === lease.propertyManagerUid || isAdmin;
  const isTenant = actorUid === lease.tenantUid || isAdmin;
  if (!isLandlord && !isTenant) {
    throw new CoreApiError('FORBIDDEN', 403, 'Not authorized to initiate or complete tenancy termination.');
  }

  if (input.completeTermination) {
    if (!input.moveOutHandoverId) {
      throw new CoreApiError(
        'CONFLICT',
        409,
        'Finalizing tenancy termination requires a completed moveOutHandoverId.',
      );
    }
    const hndSnap = await tx.get<PropertyHandoverRecord>(`tenancyHandovers/${input.moveOutHandoverId}`);
    if (!hndSnap.exists || !hndSnap.data || hndSnap.data.status !== 'COMPLETED') {
      throw new CoreApiError('CONFLICT', 409, 'Referenced move-out handover must be in COMPLETED status.');
    }
  }

  const pIndex = await loadOrInitPropertyTenancyIndex(tx, propertyId, nowIso);
  const terminationId = input.terminationId ?? `trm_${randomUUID().replace(/-/g, '').slice(0, 14)}`;
  const status = input.completeTermination ? 'COMPLETED' : 'NOTICE_SUBMITTED';

  const record: TenancyTerminationRecord = {
    terminationId,
    leaseId,
    propertyId,
    transactionId: lease.transactionId,
    terminationType: input.terminationType,
    initiatedByUid: actorUid,
    noticeTimestampIso: nowIso,
    effectiveTerminationDateIso: input.effectiveTerminationDateIso,
    reason: input.reason,
    contractualRuleReference: input.contractualRuleReference,
    approvedByLandlord: isLandlord || Boolean(input.completeTermination),
    approvedByTenant: isTenant || Boolean(input.completeTermination),
    depositSettled: Boolean(input.completeTermination),
    ...(input.moveOutHandoverId ? { moveOutHandoverId: input.moveOutHandoverId } : {}),
    status,
    ...(status === 'COMPLETED' ? { completedAtIso: nowIso } : {}),
    createdAtIso: nowIso,
    updatedAtIso: nowIso,
  };

  tx.set(`tenancyTerminations/${terminationId}`, record);
  if (!pIndex.terminationIds.includes(terminationId)) {
    pIndex.terminationIds.push(terminationId);
  }

  tx.set(`tenancyLeases/${leaseId}`, {
    ...lease,
    status: status === 'COMPLETED' ? 'TERMINATED' : 'TERMINATION_PENDING',
    ...(status === 'COMPLETED' ? { terminatedAtIso: nowIso } : {}),
    updatedAtIso: nowIso,
  });

  if (status === 'COMPLETED') {
    tx.set(`tenancyProperties/${propertyId}`, {
      ...prop,
      availabilityStatus: 'AVAILABLE',
      activeLeaseId: undefined,
      updatedAtIso: nowIso,
    });
  }

  appendTenancyHistoryEvent(tx, pIndex, {
    leaseId,
    eventType: `TERMINATION_${status}`,
    actorUid,
    summary: `Tenancy termination "${terminationId}" (${input.terminationType}) recorded with status "${status}".`,
    metadata: { terminationId, terminationType: input.terminationType, status },
    nowIso,
  });
  savePropertyTenancyIndex(tx, pIndex);
  return record;
}
