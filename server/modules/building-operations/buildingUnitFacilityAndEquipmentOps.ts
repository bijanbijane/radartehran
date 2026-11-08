import { randomUUID } from 'node:crypto';
import { CoreApiError, type TransactionContextLike } from '../core';
import type {
  BuildingFacilityRecord,
  BuildingIndexRecord,
  BuildingOperationalHistoryRecord,
  BuildingRecord,
  BuildingUnitRecord,
  EquipmentAssetRecord,
  ManagementContractRecord,
} from './types';
import type {
  CreateManagementContractInput,
  RegisterBuildingUnitInput,
  RegisterEquipmentAssetInput,
  RegisterFacilityInput,
  UpsertBuildingInput,
} from './validation';

export async function loadOrInitBuildingIndex(
  tx: TransactionContextLike,
  buildingId: string,
  nowIso: string,
): Promise<BuildingIndexRecord> {
  const snap = await tx.get<BuildingIndexRecord>(`buildingOpsMeta/${buildingId}`);
  if (snap.exists && snap.data) {
    return {
      ...snap.data,
      unitIds: [...snap.data.unitIds],
      facilityIds: [...snap.data.facilityIds],
      equipmentIds: [...snap.data.equipmentIds],
      maintenanceRequestIds: [...snap.data.maintenanceRequestIds],
      preventiveScheduleIds: [...snap.data.preventiveScheduleIds],
      workOrderIds: [...snap.data.workOrderIds],
      expenseIds: [...snap.data.expenseIds],
      allocationIds: [...snap.data.allocationIds],
      utilityIds: [...snap.data.utilityIds],
      inspectionIds: [...snap.data.inspectionIds],
      incidentIds: [...snap.data.incidentIds],
      documentIds: [...snap.data.documentIds],
      managementContractIds: [...snap.data.managementContractIds],
      historyEventIds: [...snap.data.historyEventIds],
    };
  }
  return {
    buildingId,
    unitIds: [],
    facilityIds: [],
    equipmentIds: [],
    maintenanceRequestIds: [],
    preventiveScheduleIds: [],
    workOrderIds: [],
    expenseIds: [],
    allocationIds: [],
    utilityIds: [],
    inspectionIds: [],
    incidentIds: [],
    documentIds: [],
    managementContractIds: [],
    historyEventIds: [],
    historySequence: 0,
    updatedAtIso: nowIso,
  };
}

export function appendBuildingHistoryEvent(
  tx: TransactionContextLike,
  bIndex: BuildingIndexRecord,
  params: {
    eventType: string;
    actorUid: string;
    summary: string;
    metadata: Record<string, string | number | boolean>;
    nowIso: string;
  },
): BuildingOperationalHistoryRecord {
  bIndex.historySequence += 1;
  const eventId = `bhe_${bIndex.buildingId}_${bIndex.historySequence}_${randomUUID().slice(0, 6)}`;
  const record: BuildingOperationalHistoryRecord = {
    eventId,
    buildingId: bIndex.buildingId,
    sequenceNumber: bIndex.historySequence,
    eventType: params.eventType,
    actorUid: params.actorUid,
    summary: params.summary,
    metadata: params.metadata,
    timestampIso: params.nowIso,
  };
  tx.set(`buildingOpsHistory/${eventId}`, record);
  bIndex.historyEventIds.push(eventId);
  bIndex.updatedAtIso = params.nowIso;
  return record;
}

export function saveBuildingIndex(
  tx: TransactionContextLike,
  bIndex: BuildingIndexRecord,
): void {
  tx.set(`buildingOpsMeta/${bIndex.buildingId}`, bIndex);
}

export function assertBuildingOwnerOrManagerAccess(
  building: BuildingRecord,
  actorUid: string,
  isAdmin: boolean,
  requireOwner = false,
): void {
  if (isAdmin) return;
  const isOwner = building.ownerUids.includes(actorUid);
  if (requireOwner) {
    if (!isOwner) {
      throw new CoreApiError(
        'FORBIDDEN',
        403,
        'Access denied: operation requires verified building legal ownership.',
      );
    }
    return;
  }
  if (isOwner || building.propertyManagerUid === actorUid) return;
  throw new CoreApiError(
    'FORBIDDEN',
    403,
    'Access denied: principal is neither an authorized owner nor the assigned property/building manager.',
  );
}

export async function executeUpsertBuilding(params: {
  tx: TransactionContextLike;
  buildingId: string;
  actorUid: string;
  isAdmin: boolean;
  input: UpsertBuildingInput;
  nowIso: string;
}): Promise<{ building: BuildingRecord; isNew: boolean }> {
  const { tx, buildingId, actorUid, isAdmin, input, nowIso } = params;
  const existingSnap = await tx.get<BuildingRecord>(`buildingOpsBuildings/${buildingId}`);
  const bIndex = await loadOrInitBuildingIndex(tx, buildingId, nowIso);

  if (existingSnap.exists && existingSnap.data) {
    const existing = existingSnap.data;
    const isChangingOwners =
      input.ownerUids !== undefined &&
      JSON.stringify(input.ownerUids) !== JSON.stringify(existing.ownerUids);
    assertBuildingOwnerOrManagerAccess(existing, actorUid, isAdmin, isChangingOwners);
    const updated: BuildingRecord = {
      ...existing,
      name: input.name,
      buildingType: input.buildingType,
      ...(input.constructionYear !== undefined ? { constructionYear: input.constructionYear } : {}),
      floorsCount: input.floorsCount,
      declaredUnitsCount: input.declaredUnitsCount,
      sharedSpaces: input.sharedSpaces,
      ...(input.ownerUids ? { ownerUids: input.ownerUids } : {}),
      ...(input.managementOrganizationId ? { managementOrganizationId: input.managementOrganizationId } : {}),
      propertyManagerUid: input.propertyManagerUid,
      operationalStatus: input.operationalStatus,
      updatedAtIso: nowIso,
    };
    tx.set(`buildingOpsBuildings/${buildingId}`, updated);
    appendBuildingHistoryEvent(tx, bIndex, {
      eventType: 'BUILDING_UPDATED',
      actorUid,
      summary: `Building "${buildingId}" updated (status: ${input.operationalStatus}).`,
      metadata: { operationalStatus: input.operationalStatus },
      nowIso,
    });
    saveBuildingIndex(tx, bIndex);
    return { building: updated, isNew: false };
  }

  const ownerUids = input.ownerUids && input.ownerUids.length > 0 ? input.ownerUids : [actorUid];
  const created: BuildingRecord = {
    buildingId,
    name: input.name,
    buildingType: input.buildingType,
    ...(input.constructionYear !== undefined ? { constructionYear: input.constructionYear } : {}),
    floorsCount: input.floorsCount,
    declaredUnitsCount: input.declaredUnitsCount,
    sharedSpaces: input.sharedSpaces,
    ownerUids,
    ...(input.managementOrganizationId ? { managementOrganizationId: input.managementOrganizationId } : {}),
    propertyManagerUid: input.propertyManagerUid,
    operationalStatus: input.operationalStatus,
    createdAtIso: nowIso,
    updatedAtIso: nowIso,
  };
  tx.set(`buildingOpsBuildings/${buildingId}`, created);
  appendBuildingHistoryEvent(tx, bIndex, {
    eventType: 'BUILDING_CREATED',
    actorUid,
    summary: `Building "${buildingId}" (${input.buildingType}) registered.`,
    metadata: { buildingType: input.buildingType, declaredUnitsCount: input.declaredUnitsCount },
    nowIso,
  });
  saveBuildingIndex(tx, bIndex);
  return { building: created, isNew: true };
}

export async function executeRegisterBuildingUnit(params: {
  tx: TransactionContextLike;
  buildingId: string;
  actorUid: string;
  isAdmin: boolean;
  input: RegisterBuildingUnitInput;
  nowIso: string;
}): Promise<BuildingUnitRecord> {
  const { tx, buildingId, actorUid, isAdmin, input, nowIso } = params;
  const bSnap = await tx.get<BuildingRecord>(`buildingOpsBuildings/${buildingId}`);
  if (!bSnap.exists || !bSnap.data) {
    throw new CoreApiError('NOT_FOUND', 404, `Building "${buildingId}" was not found.`);
  }
  const building = bSnap.data;
  assertBuildingOwnerOrManagerAccess(building, actorUid, isAdmin);

  const bIndex = await loadOrInitBuildingIndex(tx, buildingId, nowIso);

  // Prevent duplicate unitNumber or duplicate propertyId association within the building
  for (const uid of bIndex.unitIds) {
    const uSnap = await tx.get<BuildingUnitRecord>(`buildingOpsUnits/${uid}`);
    if (uSnap.exists && uSnap.data) {
      if (uSnap.data.unitNumber === input.unitNumber) {
        throw new CoreApiError(
          'CONFLICT',
          409,
          `Unit number "${input.unitNumber}" is already registered in building "${buildingId}".`,
        );
      }
      if (uSnap.data.propertyId === input.propertyId) {
        throw new CoreApiError(
          'CONFLICT',
          409,
          `Property "${input.propertyId}" is already associated with unit "${uSnap.data.unitId}" in building "${buildingId}".`,
        );
      }
    }
  }

  const unitId = input.unitId ?? `unt_${randomUUID().replace(/-/g, '').slice(0, 14)}`;
  const unit: BuildingUnitRecord = {
    unitId,
    buildingId,
    propertyId: input.propertyId,
    floorNumber: input.floorNumber,
    unitNumber: input.unitNumber,
    category: input.category,
    areaSqm: input.areaSqm,
    ...(input.ownershipShareBasisPoints !== undefined
      ? { ownershipShareBasisPoints: input.ownershipShareBasisPoints }
      : {}),
    occupancyStatus: input.occupancyStatus,
    ownerUid: input.ownerUid,
    ...(input.tenantUid ? { tenantUid: input.tenantUid } : {}),
    ...(input.activeLeaseId ? { activeLeaseId: input.activeLeaseId } : {}),
    createdAtIso: nowIso,
    updatedAtIso: nowIso,
  };

  tx.set(`buildingOpsUnits/${unitId}`, unit);
  bIndex.unitIds.push(unitId);
  appendBuildingHistoryEvent(tx, bIndex, {
    eventType: 'UNIT_REGISTERED',
    actorUid,
    summary: `Unit "${unit.unitNumber}" (ID: ${unitId}, ${unit.areaSqm} sqm) registered.`,
    metadata: { unitId, unitNumber: unit.unitNumber, areaSqm: unit.areaSqm },
    nowIso,
  });
  saveBuildingIndex(tx, bIndex);
  return unit;
}

export async function executeRegisterOrUpdateFacility(params: {
  tx: TransactionContextLike;
  buildingId: string;
  actorUid: string;
  isAdmin: boolean;
  input: RegisterFacilityInput;
  nowIso: string;
}): Promise<BuildingFacilityRecord> {
  const { tx, buildingId, actorUid, isAdmin, input, nowIso } = params;
  const bSnap = await tx.get<BuildingRecord>(`buildingOpsBuildings/${buildingId}`);
  if (!bSnap.exists || !bSnap.data) {
    throw new CoreApiError('NOT_FOUND', 404, `Building "${buildingId}" was not found.`);
  }
  assertBuildingOwnerOrManagerAccess(bSnap.data, actorUid, isAdmin);

  const bIndex = await loadOrInitBuildingIndex(tx, buildingId, nowIso);
  const facilityId = input.facilityId ?? `fac_${randomUUID().replace(/-/g, '').slice(0, 14)}`;

  const facility: BuildingFacilityRecord = {
    facilityId,
    buildingId,
    category: input.category,
    name: input.name,
    equipmentIds: input.equipmentIds ?? [],
    ...(input.installationDateIso ? { installationDateIso: input.installationDateIso } : {}),
    ...(input.manufacturer ? { manufacturer: input.manufacturer } : {}),
    ...(input.model ? { model: input.model } : {}),
    operationalStatus: input.operationalStatus,
    ...(input.lastInspectionDateIso ? { lastInspectionDateIso: input.lastInspectionDateIso } : {}),
    ...(input.nextInspectionDateIso ? { nextInspectionDateIso: input.nextInspectionDateIso } : {}),
    ...(input.responsibleServiceProviderId ? { responsibleServiceProviderId: input.responsibleServiceProviderId } : {}),
    documentMediaIds: input.documentMediaIds ?? [],
    createdAtIso: nowIso,
    updatedAtIso: nowIso,
  };

  tx.set(`buildingOpsFacilities/${facilityId}`, facility);
  if (!bIndex.facilityIds.includes(facilityId)) {
    bIndex.facilityIds.push(facilityId);
  }
  appendBuildingHistoryEvent(tx, bIndex, {
    eventType: 'FACILITY_RECORDED',
    actorUid,
    summary: `Facility "${facility.name}" (${facility.category}) recorded with status "${facility.operationalStatus}".`,
    metadata: { facilityId, category: facility.category, status: facility.operationalStatus },
    nowIso,
  });
  saveBuildingIndex(tx, bIndex);
  return facility;
}

export async function executeRegisterOrUpdateEquipmentAsset(params: {
  tx: TransactionContextLike;
  buildingId: string;
  actorUid: string;
  isAdmin: boolean;
  input: RegisterEquipmentAssetInput;
  nowIso: string;
}): Promise<EquipmentAssetRecord> {
  const { tx, buildingId, actorUid, isAdmin, input, nowIso } = params;
  const bSnap = await tx.get<BuildingRecord>(`buildingOpsBuildings/${buildingId}`);
  if (!bSnap.exists || !bSnap.data) {
    throw new CoreApiError('NOT_FOUND', 404, `Building "${buildingId}" was not found.`);
  }
  assertBuildingOwnerOrManagerAccess(bSnap.data, actorUid, isAdmin);

  const bIndex = await loadOrInitBuildingIndex(tx, buildingId, nowIso);
  const equipmentId = input.equipmentId ?? `eqp_${randomUUID().replace(/-/g, '').slice(0, 14)}`;

  const existingSnap = await tx.get<EquipmentAssetRecord>(`buildingOpsEquipment/${equipmentId}`);
  if (existingSnap.exists && existingSnap.data && existingSnap.data.status === 'RETIRED' && input.status !== 'RETIRED') {
    throw new CoreApiError('CONFLICT', 409, `Retired equipment asset "${equipmentId}" cannot be returned to active service.`);
  }

  const equipment: EquipmentAssetRecord = {
    equipmentId,
    buildingId,
    ...(input.unitId ? { unitId: input.unitId } : {}),
    ...(input.facilityId ? { facilityId: input.facilityId } : {}),
    classification: input.classification,
    assetCode: input.assetCode,
    ...(input.manufacturer ? { manufacturer: input.manufacturer } : {}),
    ...(input.model ? { model: input.model } : {}),
    ...(input.serialReference ? { serialReference: input.serialReference } : {}),
    installationDateIso: input.installationDateIso,
    ...(input.warrantyReference ? { warrantyReference: input.warrantyReference } : {}),
    ...(input.warrantyExpirationIso ? { warrantyExpirationIso: input.warrantyExpirationIso } : {}),
    status: input.status,
    ...(input.replacedByEquipmentId ? { replacedByEquipmentId: input.replacedByEquipmentId } : {}),
    createdAtIso: existingSnap.exists && existingSnap.data ? existingSnap.data.createdAtIso : nowIso,
    updatedAtIso: nowIso,
  };

  tx.set(`buildingOpsEquipment/${equipmentId}`, equipment);
  if (!bIndex.equipmentIds.includes(equipmentId)) {
    bIndex.equipmentIds.push(equipmentId);
  }
  appendBuildingHistoryEvent(tx, bIndex, {
    eventType: 'EQUIPMENT_RECORDED',
    actorUid,
    summary: `Equipment asset "${equipment.assetCode}" (${equipment.classification}) recorded with status "${equipment.status}".`,
    metadata: { equipmentId, assetCode: equipment.assetCode, status: equipment.status },
    nowIso,
  });
  saveBuildingIndex(tx, bIndex);
  return equipment;
}

export async function executeCreateManagementContract(params: {
  tx: TransactionContextLike;
  buildingId: string;
  actorUid: string;
  isAdmin: boolean;
  input: CreateManagementContractInput;
  nowIso: string;
}): Promise<ManagementContractRecord> {
  const { tx, buildingId, actorUid, isAdmin, input, nowIso } = params;
  const bSnap = await tx.get<BuildingRecord>(`buildingOpsBuildings/${buildingId}`);
  if (!bSnap.exists || !bSnap.data) {
    throw new CoreApiError('NOT_FOUND', 404, `Building "${buildingId}" was not found.`);
  }
  const building = bSnap.data;
  // Require verified owner (or admin) to grant a management contract
  assertBuildingOwnerOrManagerAccess(building, actorUid, isAdmin, true);

  const bIndex = await loadOrInitBuildingIndex(tx, buildingId, nowIso);
  const contractId = input.contractId ?? `mgc_${randomUUID().replace(/-/g, '').slice(0, 14)}`;

  const contract: ManagementContractRecord = {
    contractId,
    buildingId,
    ...(input.propertyId ? { propertyId: input.propertyId } : {}),
    ownerUid: input.ownerUid,
    ...(input.managementOrganizationId ? { managementOrganizationId: input.managementOrganizationId } : {}),
    authorizedManagerUid: input.authorizedManagerUid,
    contractStartDateIso: input.contractStartDateIso,
    contractEndDateIso: input.contractEndDateIso,
    serviceScope: input.serviceScope,
    delegatedPermissions: input.delegatedPermissions,
    managementFeeAmount: input.managementFeeAmount,
    currency: input.currency,
    contractDocumentMediaId: input.contractDocumentMediaId,
    version: bIndex.managementContractIds.length + 1,
    status: 'ACTIVE',
    createdAtIso: nowIso,
    updatedAtIso: nowIso,
  };

  tx.set(`buildingOpsContracts/${contractId}`, contract);
  tx.set(`buildingOpsBuildings/${buildingId}`, {
    ...building,
    propertyManagerUid: input.authorizedManagerUid,
    ...(input.managementOrganizationId ? { managementOrganizationId: input.managementOrganizationId } : {}),
    updatedAtIso: nowIso,
  });
  bIndex.managementContractIds.push(contractId);
  appendBuildingHistoryEvent(tx, bIndex, {
    eventType: 'MANAGEMENT_CONTRACT_CREATED',
    actorUid,
    summary: `Management contract "${contractId}" (v${contract.version}) activated for manager "${input.authorizedManagerUid}".`,
    metadata: { contractId, managerUid: input.authorizedManagerUid, version: contract.version },
    nowIso,
  });
  saveBuildingIndex(tx, bIndex);
  return contract;
}
