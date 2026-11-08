import { randomUUID } from 'node:crypto';
import {
  CoreApiError,
  createFirestoreIdempotencyStoreAdapter,
  createStructuredAuditEvent,
  executeIdempotentMutation,
  runDurableTransaction,
  verifyAdminOrDelegatedPrincipal,
  type AuthenticatedPrincipal,
} from '../core';
import { safeAddMonetary } from '../transactions';
import {
  executeCreateManagementContract,
  executeRegisterBuildingUnit,
  executeRegisterOrUpdateEquipmentAsset,
  executeRegisterOrUpdateFacility,
  executeUpsertBuilding,
  loadOrInitBuildingIndex,
} from './buildingUnitFacilityAndEquipmentOps';
import {
  executeAllocateSharedBuildingExpense,
  executeCreateBuildingExpense,
  executeRecordBuildingInspection,
  executeRecordUtilityBill,
  executeReportSafetyIncident,
} from './expenseUtilityInspectionAndIncidentOps';
import {
  executeCreateBuildingMaintenanceRequest,
  executeCreatePreventiveSchedule,
  executeCreateWorkOrder,
  executeGeneratePreventiveWorkOrder,
  executeTransitionWorkOrder,
  isBuildingResidentOrParticipant,
} from './maintenancePreventiveAndWorkOrderOps';
import type {
  BuildingExpenseRecord,
  BuildingFacilityRecord,
  BuildingInspectionRecord,
  BuildingMaintenanceRequestRecord,
  BuildingOperationalHistoryRecord,
  BuildingOperationsAnalyticsSnapshot,
  BuildingOperationsDependencies,
  BuildingRecord,
  BuildingUnitRecord,
  EquipmentAssetRecord,
  ManagementContractRecord,
  PreventiveMaintenanceScheduleRecord,
  SafetyIncidentRecord,
  SharedExpenseAllocationRecord,
  UtilityRecord,
  WorkOrderRecord,
} from './types';
import {
  validateAllocateBuildingExpenseInput,
  validateCreateBuildingExpenseInput,
  validateCreateBuildingMaintenanceInput,
  validateCreateManagementContractInput,
  validateCreatePreventiveScheduleInput,
  validateCreateWorkOrderInput,
  validateRecordBuildingInspectionInput,
  validateRecordUtilityBillInput,
  validateRegisterBuildingUnitInput,
  validateRegisterEquipmentAssetInput,
  validateRegisterFacilityInput,
  validateReportSafetyIncidentInput,
  validateTransitionWorkOrderInput,
  validateUpsertBuildingInput,
} from './validation';

export function createBuildingOperationsService(deps: BuildingOperationsDependencies) {
  const idempotencyStore =
    deps.idempotencyStore ?? createFirestoreIdempotencyStoreAdapter(deps.txRunner);
  const nowFn = deps.nowFn ?? (() => Date.now());
  const nowIsoFn = () => new Date(nowFn()).toISOString();

  const analyticsAccumulator: BuildingOperationsAnalyticsSnapshot = {
    managedBuildingCount: 0,
    managedUnitCount: 0,
    operationalEquipmentCount: 0,
    degradedOrOutEquipmentCount: 0,
    maintenanceVolume: 0,
    preventiveWorkOrdersGenerated: 0,
    completedWorkOrderCount: 0,
    totalApprovedExpenseAmount: 0,
    totalUtilityBillAmount: 0,
    completedInspectionCount: 0,
    safetyIncidentCount: 0,
  };

  async function isPrincipalAdmin(principal: AuthenticatedPrincipal): Promise<boolean> {
    const decision = await verifyAdminOrDelegatedPrincipal(
      principal,
      deps.adminStore,
      { primaryAdminEmails: deps.primaryAdminEmails },
    );
    return decision.allowed;
  }

  async function emitNotificationSafe(params: {
    eventType: string;
    buildingId: string;
    recipientUids: string[];
    actorUid: string;
    summary: string;
  }): Promise<void> {
    if (!deps.notificationEmitter || params.recipientUids.length === 0) return;
    try {
      await deps.notificationEmitter({
        eventId: `ntf_bld_${randomUUID().slice(0, 12)}`,
        eventType: params.eventType,
        buildingId: params.buildingId,
        recipientUids: params.recipientUids,
        actorUid: params.actorUid,
        summary: params.summary,
        occurredAtIso: nowIsoFn(),
      });
    } catch {
      // Non-critical notification failure must never abort core building operations
    }
  }

  async function recordAudit(
    principal: AuthenticatedPrincipal,
    correlationId: string,
    action: string,
    targetResourceId: string,
    metadata?: Record<string, string | number | boolean | null>,
  ): Promise<void> {
    if (!deps.auditSink) return;
    await deps.auditSink.writeAuditEvent(
      createStructuredAuditEvent({
        principal,
        correlationId,
        action,
        targetCollection: 'buildingOperations',
        targetResourceId,
        outcome: 'SUCCESS',
        metadata,
      }),
    );
  }

  return {
    async upsertBuilding(params: {
      principal: AuthenticatedPrincipal;
      buildingId: string;
      rawInput: unknown;
      idempotencyKey: string;
      correlationId: string;
    }) {
      const validation = validateUpsertBuildingInput(params.rawInput);
      if (!validation.ok || !validation.value) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid building payload.', validation.issues);
      }
      const input = validation.value;
      const isAdmin = await isPrincipalAdmin(params.principal);

      return executeIdempotentMutation({
        store: idempotencyStore,
        actorUid: params.principal.uid,
        operation: 'building_ops.building.upsert',
        idempotencyKey: params.idempotencyKey,
        requestPayload: { buildingId: params.buildingId, ...input },
        mutationFn: async () => {
          const res = await runDurableTransaction(
            deps.txRunner,
            { operationName: 'building_ops.building.upsert' },
            async (tx) =>
              executeUpsertBuilding({
                tx,
                buildingId: params.buildingId,
                actorUid: params.principal.uid,
                isAdmin,
                input,
                nowIso: nowIsoFn(),
              }),
          );
          if (res.isNew) {
            analyticsAccumulator.managedBuildingCount += 1;
          }
          await recordAudit(params.principal, params.correlationId, 'building_ops.building.upsert', params.buildingId, {
            buildingType: res.building.buildingType,
            status: res.building.operationalStatus,
          });
          return { statusCode: res.isNew ? 201 : 200, body: res.building };
        },
      });
    },

    async registerBuildingUnit(params: {
      principal: AuthenticatedPrincipal;
      buildingId: string;
      rawInput: unknown;
      idempotencyKey: string;
      correlationId: string;
    }) {
      const validation = validateRegisterBuildingUnitInput(params.rawInput);
      if (!validation.ok || !validation.value) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid building unit payload.', validation.issues);
      }
      const input = validation.value;
      const isAdmin = await isPrincipalAdmin(params.principal);

      return executeIdempotentMutation({
        store: idempotencyStore,
        actorUid: params.principal.uid,
        operation: 'building_ops.unit.register',
        idempotencyKey: params.idempotencyKey,
        requestPayload: { buildingId: params.buildingId, ...input },
        mutationFn: async () => {
          const unit = await runDurableTransaction(
            deps.txRunner,
            { operationName: 'building_ops.unit.register' },
            async (tx) =>
              executeRegisterBuildingUnit({
                tx,
                buildingId: params.buildingId,
                actorUid: params.principal.uid,
                isAdmin,
                input,
                nowIso: nowIsoFn(),
              }),
          );
          analyticsAccumulator.managedUnitCount += 1;
          await recordAudit(params.principal, params.correlationId, 'building_ops.unit.register', unit.unitId, {
            buildingId: params.buildingId,
            unitNumber: unit.unitNumber,
          });
          return { statusCode: 201, body: unit };
        },
      });
    },

    async registerOrUpdateFacility(params: {
      principal: AuthenticatedPrincipal;
      buildingId: string;
      rawInput: unknown;
      idempotencyKey: string;
      correlationId: string;
    }) {
      const validation = validateRegisterFacilityInput(params.rawInput);
      if (!validation.ok || !validation.value) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid facility payload.', validation.issues);
      }
      const input = validation.value;
      const isAdmin = await isPrincipalAdmin(params.principal);

      return executeIdempotentMutation({
        store: idempotencyStore,
        actorUid: params.principal.uid,
        operation: 'building_ops.facility.upsert',
        idempotencyKey: params.idempotencyKey,
        requestPayload: { buildingId: params.buildingId, ...input },
        mutationFn: async () => {
          const fac = await runDurableTransaction(
            deps.txRunner,
            { operationName: 'building_ops.facility.upsert' },
            async (tx) =>
              executeRegisterOrUpdateFacility({
                tx,
                buildingId: params.buildingId,
                actorUid: params.principal.uid,
                isAdmin,
                input,
                nowIso: nowIsoFn(),
              }),
          );
          return { statusCode: 201, body: fac };
        },
      });
    },

    async registerOrUpdateEquipmentAsset(params: {
      principal: AuthenticatedPrincipal;
      buildingId: string;
      rawInput: unknown;
      idempotencyKey: string;
      correlationId: string;
    }) {
      const validation = validateRegisterEquipmentAssetInput(params.rawInput);
      if (!validation.ok || !validation.value) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid equipment asset payload.', validation.issues);
      }
      const input = validation.value;
      const isAdmin = await isPrincipalAdmin(params.principal);

      return executeIdempotentMutation({
        store: idempotencyStore,
        actorUid: params.principal.uid,
        operation: 'building_ops.equipment.upsert',
        idempotencyKey: params.idempotencyKey,
        requestPayload: { buildingId: params.buildingId, ...input },
        mutationFn: async () => {
          const eq = await runDurableTransaction(
            deps.txRunner,
            { operationName: 'building_ops.equipment.upsert' },
            async (tx) =>
              executeRegisterOrUpdateEquipmentAsset({
                tx,
                buildingId: params.buildingId,
                actorUid: params.principal.uid,
                isAdmin,
                input,
                nowIso: nowIsoFn(),
              }),
          );
          if (eq.status === 'OPERATIONAL') {
            analyticsAccumulator.operationalEquipmentCount += 1;
          } else {
            analyticsAccumulator.degradedOrOutEquipmentCount += 1;
          }
          return { statusCode: 201, body: eq };
        },
      });
    },

    async createManagementContract(params: {
      principal: AuthenticatedPrincipal;
      buildingId: string;
      rawInput: unknown;
      idempotencyKey: string;
      correlationId: string;
    }) {
      const validation = validateCreateManagementContractInput(params.rawInput);
      if (!validation.ok || !validation.value) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid management contract payload.', validation.issues);
      }
      const input = validation.value;
      const isAdmin = await isPrincipalAdmin(params.principal);

      return executeIdempotentMutation({
        store: idempotencyStore,
        actorUid: params.principal.uid,
        operation: 'building_ops.contract.create',
        idempotencyKey: params.idempotencyKey,
        requestPayload: { buildingId: params.buildingId, ...input },
        mutationFn: async () => {
          const contract = await runDurableTransaction(
            deps.txRunner,
            { operationName: 'building_ops.contract.create' },
            async (tx) =>
              executeCreateManagementContract({
                tx,
                buildingId: params.buildingId,
                actorUid: params.principal.uid,
                isAdmin,
                input,
                nowIso: nowIsoFn(),
              }),
          );
          await recordAudit(params.principal, params.correlationId, 'building_ops.contract.create', contract.contractId, {
            authorizedManagerUid: contract.authorizedManagerUid,
          });
          return { statusCode: 201, body: contract };
        },
      });
    },

    async createMaintenanceRequest(params: {
      principal: AuthenticatedPrincipal;
      buildingId: string;
      rawInput: unknown;
      idempotencyKey: string;
      correlationId: string;
    }) {
      const validation = validateCreateBuildingMaintenanceInput(params.rawInput);
      if (!validation.ok || !validation.value) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid building maintenance payload.', validation.issues);
      }
      const input = validation.value;
      const isAdmin = await isPrincipalAdmin(params.principal);

      return executeIdempotentMutation({
        store: idempotencyStore,
        actorUid: params.principal.uid,
        operation: 'building_ops.maintenance.create',
        idempotencyKey: params.idempotencyKey,
        requestPayload: { buildingId: params.buildingId, ...input },
        mutationFn: async () => {
          const req = await runDurableTransaction(
            deps.txRunner,
            { operationName: 'building_ops.maintenance.create' },
            async (tx) =>
              executeCreateBuildingMaintenanceRequest({
                tx,
                buildingId: params.buildingId,
                actorUid: params.principal.uid,
                isAdmin,
                input,
                nowIso: nowIsoFn(),
              }),
          );
          analyticsAccumulator.maintenanceVolume += 1;
          await emitNotificationSafe({
            eventType: 'NEW_MAINTENANCE_REQUEST',
            buildingId: params.buildingId,
            recipientUids: [params.principal.uid],
            actorUid: params.principal.uid,
            summary: `Building maintenance request "${req.requestId}" submitted.`,
          });
          return { statusCode: 201, body: req };
        },
      });
    },

    async createPreventiveSchedule(params: {
      principal: AuthenticatedPrincipal;
      buildingId: string;
      rawInput: unknown;
      idempotencyKey: string;
      correlationId: string;
    }) {
      const validation = validateCreatePreventiveScheduleInput(params.rawInput);
      if (!validation.ok || !validation.value) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid preventive schedule payload.', validation.issues);
      }
      const input = validation.value;
      const isAdmin = await isPrincipalAdmin(params.principal);

      return executeIdempotentMutation({
        store: idempotencyStore,
        actorUid: params.principal.uid,
        operation: 'building_ops.preventive.create',
        idempotencyKey: params.idempotencyKey,
        requestPayload: { buildingId: params.buildingId, ...input },
        mutationFn: async () => {
          const sch = await runDurableTransaction(
            deps.txRunner,
            { operationName: 'building_ops.preventive.create' },
            async (tx) =>
              executeCreatePreventiveSchedule({
                tx,
                buildingId: params.buildingId,
                actorUid: params.principal.uid,
                isAdmin,
                input,
                nowIso: nowIsoFn(),
              }),
          );
          return { statusCode: 201, body: sch };
        },
      });
    },

    async generatePreventiveWorkOrder(params: {
      principal: AuthenticatedPrincipal;
      buildingId: string;
      scheduleId: string;
      serviceProviderId: string;
      estimatedCostAmount: number;
      currency: 'IRR' | 'IRT';
      idempotencyKey: string;
      correlationId: string;
    }) {
      const isAdmin = await isPrincipalAdmin(params.principal);
      return executeIdempotentMutation({
        store: idempotencyStore,
        actorUid: params.principal.uid,
        operation: 'building_ops.preventive.generate_wo',
        idempotencyKey: params.idempotencyKey,
        requestPayload: {
          buildingId: params.buildingId,
          scheduleId: params.scheduleId,
          serviceProviderId: params.serviceProviderId,
          estimatedCostAmount: params.estimatedCostAmount,
        },
        mutationFn: async () => {
          const res = await runDurableTransaction(
            deps.txRunner,
            { operationName: 'building_ops.preventive.generate_wo' },
            async (tx) =>
              executeGeneratePreventiveWorkOrder({
                tx,
                buildingId: params.buildingId,
                scheduleId: params.scheduleId,
                actorUid: params.principal.uid,
                isAdmin,
                serviceProviderId: params.serviceProviderId,
                estimatedCostAmount: params.estimatedCostAmount,
                currency: params.currency,
                nowIso: nowIsoFn(),
              }),
          );
          analyticsAccumulator.preventiveWorkOrdersGenerated += 1;
          return { statusCode: 201, body: res };
        },
      });
    },

    async createWorkOrder(params: {
      principal: AuthenticatedPrincipal;
      buildingId: string;
      rawInput: unknown;
      idempotencyKey: string;
      correlationId: string;
    }) {
      const validation = validateCreateWorkOrderInput(params.rawInput);
      if (!validation.ok || !validation.value) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid work order payload.', validation.issues);
      }
      const input = validation.value;
      const isAdmin = await isPrincipalAdmin(params.principal);

      return executeIdempotentMutation({
        store: idempotencyStore,
        actorUid: params.principal.uid,
        operation: 'building_ops.work_order.create',
        idempotencyKey: params.idempotencyKey,
        requestPayload: { buildingId: params.buildingId, ...input },
        mutationFn: async () => {
          const wo = await runDurableTransaction(
            deps.txRunner,
            { operationName: 'building_ops.work_order.create' },
            async (tx) =>
              executeCreateWorkOrder({
                tx,
                buildingId: params.buildingId,
                actorUid: params.principal.uid,
                isAdmin,
                input,
                nowIso: nowIsoFn(),
              }),
          );
          await emitNotificationSafe({
            eventType: 'WORK_ORDER_ASSIGNED',
            buildingId: params.buildingId,
            recipientUids: [wo.serviceProviderId],
            actorUid: params.principal.uid,
            summary: `Work order "${wo.workOrderId}" assigned.`,
          });
          return { statusCode: 201, body: wo };
        },
      });
    },

    async transitionWorkOrder(params: {
      principal: AuthenticatedPrincipal;
      buildingId: string;
      workOrderId: string;
      rawInput: unknown;
      idempotencyKey: string;
      correlationId: string;
    }) {
      const validation = validateTransitionWorkOrderInput(params.rawInput);
      if (!validation.ok || !validation.value) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid work order transition payload.', validation.issues);
      }
      const input = validation.value;
      const isAdmin = await isPrincipalAdmin(params.principal);

      return executeIdempotentMutation({
        store: idempotencyStore,
        actorUid: params.principal.uid,
        operation: 'building_ops.work_order.transition',
        idempotencyKey: params.idempotencyKey,
        requestPayload: { buildingId: params.buildingId, workOrderId: params.workOrderId, ...input },
        mutationFn: async () => {
          const wo = await runDurableTransaction(
            deps.txRunner,
            { operationName: 'building_ops.work_order.transition' },
            async (tx) =>
              executeTransitionWorkOrder({
                tx,
                buildingId: params.buildingId,
                workOrderId: params.workOrderId,
                actorUid: params.principal.uid,
                isAdmin,
                input,
                nowIso: nowIsoFn(),
              }),
          );
          if (wo.status === 'COMPLETED' || wo.status === 'VERIFIED') {
            analyticsAccumulator.completedWorkOrderCount += 1;
          }
          return { statusCode: 200, body: wo };
        },
      });
    },

    async createBuildingExpense(params: {
      principal: AuthenticatedPrincipal;
      buildingId: string;
      rawInput: unknown;
      idempotencyKey: string;
      correlationId: string;
    }) {
      const validation = validateCreateBuildingExpenseInput(params.rawInput);
      if (!validation.ok || !validation.value) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid building expense payload.', validation.issues);
      }
      const input = validation.value;
      const isAdmin = await isPrincipalAdmin(params.principal);

      return executeIdempotentMutation({
        store: idempotencyStore,
        actorUid: params.principal.uid,
        operation: 'building_ops.expense.create',
        idempotencyKey: params.idempotencyKey,
        requestPayload: { buildingId: params.buildingId, ...input },
        mutationFn: async () => {
          const exp = await runDurableTransaction(
            deps.txRunner,
            { operationName: 'building_ops.expense.create' },
            async (tx) =>
              executeCreateBuildingExpense({
                tx,
                buildingId: params.buildingId,
                actorUid: params.principal.uid,
                isAdmin,
                input,
                nowIso: nowIsoFn(),
              }),
          );
          if (exp.approvalStatus === 'APPROVED') {
            analyticsAccumulator.totalApprovedExpenseAmount = safeAddMonetary(
              analyticsAccumulator.totalApprovedExpenseAmount,
              exp.amount,
            );
          }
          return { statusCode: 201, body: exp };
        },
      });
    },

    async allocateSharedBuildingExpense(params: {
      principal: AuthenticatedPrincipal;
      buildingId: string;
      rawInput: unknown;
      idempotencyKey: string;
      correlationId: string;
    }) {
      const validation = validateAllocateBuildingExpenseInput(params.rawInput);
      if (!validation.ok || !validation.value) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid expense allocation payload.', validation.issues);
      }
      const input = validation.value;
      const isAdmin = await isPrincipalAdmin(params.principal);

      return executeIdempotentMutation({
        store: idempotencyStore,
        actorUid: params.principal.uid,
        operation: 'building_ops.expense.allocate',
        idempotencyKey: params.idempotencyKey,
        requestPayload: { buildingId: params.buildingId, ...input },
        mutationFn: async () => {
          const alc = await runDurableTransaction(
            deps.txRunner,
            { operationName: 'building_ops.expense.allocate' },
            async (tx) =>
              executeAllocateSharedBuildingExpense({
                tx,
                buildingId: params.buildingId,
                actorUid: params.principal.uid,
                isAdmin,
                input,
                nowIso: nowIsoFn(),
              }),
          );
          return { statusCode: 201, body: alc };
        },
      });
    },

    async recordUtilityBill(params: {
      principal: AuthenticatedPrincipal;
      buildingId: string;
      rawInput: unknown;
      idempotencyKey: string;
      correlationId: string;
    }) {
      const validation = validateRecordUtilityBillInput(params.rawInput);
      if (!validation.ok || !validation.value) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid utility bill payload.', validation.issues);
      }
      const input = validation.value;
      const isAdmin = await isPrincipalAdmin(params.principal);

      return executeIdempotentMutation({
        store: idempotencyStore,
        actorUid: params.principal.uid,
        operation: 'building_ops.utility.record',
        idempotencyKey: params.idempotencyKey,
        requestPayload: { buildingId: params.buildingId, ...input },
        mutationFn: async () => {
          const utl = await runDurableTransaction(
            deps.txRunner,
            { operationName: 'building_ops.utility.record' },
            async (tx) =>
              executeRecordUtilityBill({
                tx,
                buildingId: params.buildingId,
                actorUid: params.principal.uid,
                isAdmin,
                input,
                nowIso: nowIsoFn(),
              }),
          );
          analyticsAccumulator.totalUtilityBillAmount = safeAddMonetary(
            analyticsAccumulator.totalUtilityBillAmount,
            utl.billAmount,
          );
          return { statusCode: 201, body: utl };
        },
      });
    },

    async recordBuildingInspection(params: {
      principal: AuthenticatedPrincipal;
      buildingId: string;
      rawInput: unknown;
      idempotencyKey: string;
      correlationId: string;
    }) {
      const validation = validateRecordBuildingInspectionInput(params.rawInput);
      if (!validation.ok || !validation.value) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid building inspection payload.', validation.issues);
      }
      const input = validation.value;
      const isAdmin = await isPrincipalAdmin(params.principal);

      return executeIdempotentMutation({
        store: idempotencyStore,
        actorUid: params.principal.uid,
        operation: 'building_ops.inspection.record',
        idempotencyKey: params.idempotencyKey,
        requestPayload: { buildingId: params.buildingId, ...input },
        mutationFn: async () => {
          const ins = await runDurableTransaction(
            deps.txRunner,
            { operationName: 'building_ops.inspection.record' },
            async (tx) =>
              executeRecordBuildingInspection({
                tx,
                buildingId: params.buildingId,
                actorUid: params.principal.uid,
                isAdmin,
                input,
                nowIso: nowIsoFn(),
              }),
          );
          if (ins.status === 'COMPLETED_IMMUTABLE') {
            analyticsAccumulator.completedInspectionCount += 1;
          }
          return { statusCode: 201, body: ins };
        },
      });
    },

    async reportSafetyIncident(params: {
      principal: AuthenticatedPrincipal;
      buildingId: string;
      rawInput: unknown;
      idempotencyKey: string;
      correlationId: string;
    }) {
      const validation = validateReportSafetyIncidentInput(params.rawInput);
      if (!validation.ok || !validation.value) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid safety incident payload.', validation.issues);
      }
      const input = validation.value;
      const isAdmin = await isPrincipalAdmin(params.principal);

      return executeIdempotentMutation({
        store: idempotencyStore,
        actorUid: params.principal.uid,
        operation: 'building_ops.incident.report',
        idempotencyKey: params.idempotencyKey,
        requestPayload: { buildingId: params.buildingId, ...input },
        mutationFn: async () => {
          const inc = await runDurableTransaction(
            deps.txRunner,
            { operationName: 'building_ops.incident.report' },
            async (tx) =>
              executeReportSafetyIncident({
                tx,
                buildingId: params.buildingId,
                actorUid: params.principal.uid,
                isAdmin,
                input,
                nowIso: nowIsoFn(),
              }),
          );
          analyticsAccumulator.safetyIncidentCount += 1;
          await emitNotificationSafe({
            eventType: 'SAFETY_INCIDENT_REPORTED',
            buildingId: params.buildingId,
            recipientUids: [inc.responsiblePartyUid],
            actorUid: params.principal.uid,
            summary: `Safety incident "${inc.incidentId}" (${inc.escalationPriority}) reported.`,
          });
          return { statusCode: 201, body: inc };
        },
      });
    },

    async getBuildingOperationalOverview(params: {
      principal: AuthenticatedPrincipal;
      buildingId: string;
    }): Promise<{
      building: BuildingRecord;
      units: BuildingUnitRecord[];
      facilities: BuildingFacilityRecord[];
      equipment: EquipmentAssetRecord[];
      maintenanceRequests: BuildingMaintenanceRequestRecord[];
      preventiveSchedules: PreventiveMaintenanceScheduleRecord[];
      workOrders: WorkOrderRecord[];
      expenses: BuildingExpenseRecord[];
      allocations: SharedExpenseAllocationRecord[];
      utilities: UtilityRecord[];
      inspections: BuildingInspectionRecord[];
      incidents: SafetyIncidentRecord[];
      managementContracts: ManagementContractRecord[];
      history: BuildingOperationalHistoryRecord[];
    }> {
      const isAdmin = await isPrincipalAdmin(params.principal);
      return runDurableTransaction(
        deps.txRunner,
        { operationName: 'building_ops.overview.get' },
        async (tx) => {
          const bSnap = await tx.get<BuildingRecord>(`buildingOpsBuildings/${params.buildingId}`);
          if (!bSnap.exists || !bSnap.data) {
            throw new CoreApiError('NOT_FOUND', 404, `Building "${params.buildingId}" was not found.`);
          }
          const building = bSnap.data;
          const bIndex = await loadOrInitBuildingIndex(tx, params.buildingId, nowIsoFn());

          const authorized = await isBuildingResidentOrParticipant(
            tx,
            building,
            bIndex.unitIds,
            params.principal.uid,
            isAdmin,
          );
          if (!authorized) {
            throw new CoreApiError('FORBIDDEN', 403, 'Principal does not have access to operational records for this building.');
          }

          const isOwnerOrManager =
            isAdmin ||
            building.ownerUids.includes(params.principal.uid) ||
            building.propertyManagerUid === params.principal.uid;

          const units: BuildingUnitRecord[] = [];
          for (const id of bIndex.unitIds) {
            const s = await tx.get<BuildingUnitRecord>(`buildingOpsUnits/${id}`);
            if (
              s.exists &&
              s.data &&
              (isOwnerOrManager || s.data.ownerUid === params.principal.uid || s.data.tenantUid === params.principal.uid)
            ) {
              units.push(s.data);
            }
          }

          const facilities: BuildingFacilityRecord[] = [];
          for (const id of bIndex.facilityIds) {
            const s = await tx.get<BuildingFacilityRecord>(`buildingOpsFacilities/${id}`);
            if (s.exists && s.data) facilities.push(s.data);
          }

          const equipment: EquipmentAssetRecord[] = [];
          for (const id of bIndex.equipmentIds) {
            const s = await tx.get<EquipmentAssetRecord>(`buildingOpsEquipment/${id}`);
            if (s.exists && s.data) equipment.push(s.data);
          }

          const maintenanceRequests: BuildingMaintenanceRequestRecord[] = [];
          for (const id of bIndex.maintenanceRequestIds) {
            const s = await tx.get<BuildingMaintenanceRequestRecord>(`buildingOpsMaintenance/${id}`);
            if (s.exists && s.data && (isOwnerOrManager || s.data.requestedByUid === params.principal.uid)) {
              maintenanceRequests.push(s.data);
            }
          }

          const preventiveSchedules: PreventiveMaintenanceScheduleRecord[] = [];
          if (isOwnerOrManager) {
            for (const id of bIndex.preventiveScheduleIds) {
              const s = await tx.get<PreventiveMaintenanceScheduleRecord>(`buildingOpsPreventiveSchedules/${id}`);
              if (s.exists && s.data) preventiveSchedules.push(s.data);
            }
          }

          const workOrders: WorkOrderRecord[] = [];
          for (const id of bIndex.workOrderIds) {
            const s = await tx.get<WorkOrderRecord>(`buildingOpsWorkOrders/${id}`);
            if (s.exists && s.data && (isOwnerOrManager || s.data.serviceProviderId === params.principal.uid)) {
              workOrders.push(s.data);
            }
          }

          const expenses: BuildingExpenseRecord[] = [];
          if (isOwnerOrManager) {
            for (const id of bIndex.expenseIds) {
              const s = await tx.get<BuildingExpenseRecord>(`buildingOpsExpenses/${id}`);
              if (s.exists && s.data) expenses.push(s.data);
            }
          }

          const allocations: SharedExpenseAllocationRecord[] = [];
          for (const id of bIndex.allocationIds) {
            const s = await tx.get<SharedExpenseAllocationRecord>(`buildingOpsAllocations/${id}`);
            if (s.exists && s.data) allocations.push(s.data);
          }

          const utilities: UtilityRecord[] = [];
          for (const id of bIndex.utilityIds) {
            const s = await tx.get<UtilityRecord>(`buildingOpsUtilities/${id}`);
            if (s.exists && s.data) utilities.push(s.data);
          }

          const inspections: BuildingInspectionRecord[] = [];
          if (isOwnerOrManager) {
            for (const id of bIndex.inspectionIds) {
              const s = await tx.get<BuildingInspectionRecord>(`buildingOpsInspections/${id}`);
              if (s.exists && s.data) inspections.push(s.data);
            }
          }

          const incidents: SafetyIncidentRecord[] = [];
          for (const id of bIndex.incidentIds) {
            const s = await tx.get<SafetyIncidentRecord>(`buildingOpsIncidents/${id}`);
            if (s.exists && s.data) incidents.push(s.data);
          }

          const managementContracts: ManagementContractRecord[] = [];
          if (isOwnerOrManager) {
            for (const id of bIndex.managementContractIds) {
              const s = await tx.get<ManagementContractRecord>(`buildingOpsContracts/${id}`);
              if (s.exists && s.data) managementContracts.push(s.data);
            }
          }

          const history: BuildingOperationalHistoryRecord[] = [];
          if (isOwnerOrManager) {
            for (const id of bIndex.historyEventIds) {
              const s = await tx.get<BuildingOperationalHistoryRecord>(`buildingOpsHistory/${id}`);
              if (s.exists && s.data) history.push(s.data);
            }
          }

          return {
            building,
            units,
            facilities,
            equipment,
            maintenanceRequests,
            preventiveSchedules,
            workOrders,
            expenses,
            allocations,
            utilities,
            inspections,
            incidents,
            managementContracts,
            history,
          };
        },
      );
    },

    getBuildingOperationsAnalyticsSnapshot(): BuildingOperationsAnalyticsSnapshot {
      return { ...analyticsAccumulator };
    },
  };
}
