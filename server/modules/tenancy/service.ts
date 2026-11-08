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
import {
  executeCreateAndApproveLeaseAmendment,
  executeDepositOperation,
  executeProposeAndApproveRentAdjustment,
  executeProposeLeaseRenewal,
  executeRespondLeaseRenewal,
} from './depositRenewalAdjustmentAndAmendmentOps';
import {
  executeCreateMaintenanceRequest,
  executeHandoverOperation,
  executeRecordOrCompleteInspection,
  executeTenancyTermination,
  executeUpdateMaintenanceRequest,
} from './maintenanceInspectionTerminationAndHandoverOps';
import {
  executeCreateLeaseAgreement,
  executeCreateRentalApplication,
  executeDecideRentalApplication,
  executeLeaseWorkflowAction,
  executeRecordTenantScreening,
  executeUpsertRentalPropertyConfig,
  loadOrInitPropertyTenancyIndex,
} from './propertyApplicationAndLeaseOps';
import type {
  LeaseAgreementRecord,
  LeaseAmendmentRecord,
  LeaseRenewalProposalRecord,
  MaintenanceRequestRecord,
  PropertyHandoverRecord,
  PropertyInspectionRecord,
  RentalApplicationRecord,
  RentalPropertyConfigRecord,
  RentAdjustmentRecord,
  TenancyAnalyticsSnapshot,
  TenancyDepositRecord,
  TenancyHistoryEventRecord,
  TenancyModuleDependencies,
  TenancyTerminationRecord,
  TenantScreeningReferenceRecord,
} from './types';
import {
  validateCreateLeaseAgreementInput,
  validateCreateLeaseAmendmentInput,
  validateCreateMaintenanceRequestInput,
  validateCreateRentalApplicationInput,
  validateDecideRentalApplicationInput,
  validateDepositOperationInput,
  validateHandoverOperationInput,
  validateInitiateTerminationInput,
  validateLeaseWorkflowActionInput,
  validateProposeRenewalInput,
  validateProposeRentAdjustmentInput,
  validateRecordInspectionInput,
  validateRecordTenantScreeningInput,
  validateRespondRenewalInput,
  validateUpdateMaintenanceRequestInput,
  validateUpsertRentalPropertyConfigInput,
} from './validation';

export function createTenancyManagementService(deps: TenancyModuleDependencies) {
  const idempotencyStore =
    deps.idempotencyStore ?? createFirestoreIdempotencyStoreAdapter(deps.txRunner);
  const nowFn = deps.nowFn ?? (() => Date.now());
  const nowIsoFn = () => new Date(nowFn()).toISOString();

  const analyticsAccumulator = {
    rentalApplicationVolume: 0,
    approvedApplicationCount: 0,
    activeTenancyCount: 0,
    totalLeasesCreated: 0,
    renewedLeaseCount: 0,
    terminatedLeaseCount: 0,
    maintenanceRequestVolume: 0,
    completedMaintenanceCount: 0,
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
    propertyId: string;
    leaseId?: string;
    recipientUids: string[];
    actorUid: string;
    summary: string;
  }): Promise<void> {
    if (!deps.notificationEmitter || params.recipientUids.length === 0) return;
    try {
      await deps.notificationEmitter({
        eventId: `ntf_ten_${randomUUID().slice(0, 12)}`,
        eventType: params.eventType,
        propertyId: params.propertyId,
        ...(params.leaseId ? { leaseId: params.leaseId } : {}),
        recipientUids: params.recipientUids,
        actorUid: params.actorUid,
        summary: params.summary,
        occurredAtIso: nowIsoFn(),
      });
    } catch {
      // Noncritical notification failure must never invalidate a completed tenancy operation
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
        targetCollection: 'tenancyManagement',
        targetResourceId,
        outcome: 'SUCCESS',
        metadata,
      }),
    );
  }

  return {
    async upsertRentalPropertyConfig(params: {
      principal: AuthenticatedPrincipal;
      propertyId: string;
      rawInput: unknown;
      idempotencyKey: string;
      correlationId: string;
    }) {
      const validation = validateUpsertRentalPropertyConfigInput(params.rawInput);
      if (!validation.ok || !validation.value) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid rental property config payload.', validation.issues);
      }
      const input = validation.value;
      const isAdmin = await isPrincipalAdmin(params.principal);

      return executeIdempotentMutation({
        store: idempotencyStore,
        actorUid: params.principal.uid,
        operation: 'tenancy.property.upsert',
        idempotencyKey: params.idempotencyKey,
        requestPayload: { propertyId: params.propertyId, ...input },
        mutationFn: async () => {
          const prop = await runDurableTransaction(
            deps.txRunner,
            { operationName: 'tenancy.property.upsert' },
            async (tx) =>
              executeUpsertRentalPropertyConfig({
                tx,
                propertyId: params.propertyId,
                actorUid: params.principal.uid,
                isAdmin,
                input,
                nowIso: nowIsoFn(),
              }),
          );
          await recordAudit(params.principal, params.correlationId, 'tenancy.property.upsert', params.propertyId, {
            availabilityStatus: prop.availabilityStatus,
          });
          return { statusCode: 200, body: prop };
        },
      });
    },

    async createRentalApplication(params: {
      principal: AuthenticatedPrincipal;
      propertyId: string;
      rawInput: unknown;
      idempotencyKey: string;
      correlationId: string;
    }) {
      const validation = validateCreateRentalApplicationInput(params.rawInput);
      if (!validation.ok || !validation.value) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid rental application payload.', validation.issues);
      }
      const input = validation.value;

      return executeIdempotentMutation({
        store: idempotencyStore,
        actorUid: params.principal.uid,
        operation: 'tenancy.application.create',
        idempotencyKey: params.idempotencyKey,
        requestPayload: { propertyId: params.propertyId, ...input },
        mutationFn: async () => {
          const app = await runDurableTransaction(
            deps.txRunner,
            { operationName: 'tenancy.application.create' },
            async (tx) =>
              executeCreateRentalApplication({
                tx,
                propertyId: params.propertyId,
                applicantUid: params.principal.uid,
                input,
                nowIso: nowIsoFn(),
              }),
          );
          analyticsAccumulator.rentalApplicationVolume += 1;
          await emitNotificationSafe({
            eventType: 'RENTAL_APPLICATION_RECEIVED',
            propertyId: params.propertyId,
            recipientUids: [app.landlordUid],
            actorUid: params.principal.uid,
            summary: `New rental application "${app.applicationId}" submitted.`,
          });
          await recordAudit(params.principal, params.correlationId, 'tenancy.application.create', app.applicationId);
          return { statusCode: 201, body: app };
        },
      });
    },

    async decideRentalApplication(params: {
      principal: AuthenticatedPrincipal;
      propertyId: string;
      applicationId: string;
      rawInput: unknown;
      idempotencyKey: string;
      correlationId: string;
    }) {
      const validation = validateDecideRentalApplicationInput(params.rawInput);
      if (!validation.ok || !validation.value) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid application decision payload.', validation.issues);
      }
      const input = validation.value;
      const isAdmin = await isPrincipalAdmin(params.principal);

      return executeIdempotentMutation({
        store: idempotencyStore,
        actorUid: params.principal.uid,
        operation: 'tenancy.application.decide',
        idempotencyKey: params.idempotencyKey,
        requestPayload: { propertyId: params.propertyId, applicationId: params.applicationId, ...input },
        mutationFn: async () => {
          const app = await runDurableTransaction(
            deps.txRunner,
            { operationName: 'tenancy.application.decide' },
            async (tx) =>
              executeDecideRentalApplication({
                tx,
                propertyId: params.propertyId,
                applicationId: params.applicationId,
                actorUid: params.principal.uid,
                isAdmin,
                input,
                nowIso: nowIsoFn(),
              }),
          );
          if (app.status === 'APPROVED') {
            analyticsAccumulator.approvedApplicationCount += 1;
          }
          await emitNotificationSafe({
            eventType: 'APPLICATION_STATUS_CHANGED',
            propertyId: params.propertyId,
            recipientUids: [app.applicantUid],
            actorUid: params.principal.uid,
            summary: `Application "${app.applicationId}" status changed to "${app.status}".`,
          });
          await recordAudit(params.principal, params.correlationId, 'tenancy.application.decide', app.applicationId, {
            status: app.status,
          });
          return { statusCode: 200, body: app };
        },
      });
    },

    async recordTenantScreening(params: {
      principal: AuthenticatedPrincipal;
      propertyId: string;
      applicationId: string;
      rawInput: unknown;
      idempotencyKey: string;
      correlationId: string;
    }) {
      const validation = validateRecordTenantScreeningInput(params.rawInput);
      if (!validation.ok || !validation.value) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid screening payload.', validation.issues);
      }
      const input = validation.value;
      const isAdmin = await isPrincipalAdmin(params.principal);

      return executeIdempotentMutation({
        store: idempotencyStore,
        actorUid: params.principal.uid,
        operation: 'tenancy.screening.record',
        idempotencyKey: params.idempotencyKey,
        requestPayload: { propertyId: params.propertyId, applicationId: params.applicationId, ...input },
        mutationFn: async () => {
          const scr = await runDurableTransaction(
            deps.txRunner,
            { operationName: 'tenancy.screening.record' },
            async (tx) =>
              executeRecordTenantScreening({
                tx,
                propertyId: params.propertyId,
                applicationId: params.applicationId,
                actorUid: params.principal.uid,
                isAdmin,
                input,
                nowIso: nowIsoFn(),
              }),
          );
          await recordAudit(params.principal, params.correlationId, 'tenancy.screening.record', scr.screeningId, {
            manualReviewStatus: scr.manualReviewStatus,
          });
          return { statusCode: 200, body: scr };
        },
      });
    },

    async createLeaseAgreement(params: {
      principal: AuthenticatedPrincipal;
      propertyId: string;
      rawInput: unknown;
      idempotencyKey: string;
      correlationId: string;
    }) {
      const validation = validateCreateLeaseAgreementInput(params.rawInput);
      if (!validation.ok || !validation.value) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid lease agreement payload.', validation.issues);
      }
      const input = validation.value;
      const isAdmin = await isPrincipalAdmin(params.principal);

      return executeIdempotentMutation({
        store: idempotencyStore,
        actorUid: params.principal.uid,
        operation: 'tenancy.lease.create',
        idempotencyKey: params.idempotencyKey,
        requestPayload: { propertyId: params.propertyId, ...input },
        mutationFn: async () => {
          const lease = await runDurableTransaction(
            deps.txRunner,
            { operationName: 'tenancy.lease.create' },
            async (tx) =>
              executeCreateLeaseAgreement({
                tx,
                propertyId: params.propertyId,
                actorUid: params.principal.uid,
                isAdmin,
                input,
                nowIso: nowIsoFn(),
              }),
          );
          analyticsAccumulator.totalLeasesCreated += 1;
          await emitNotificationSafe({
            eventType: 'AGREEMENT_APPROVAL_REQUIRED',
            propertyId: params.propertyId,
            leaseId: lease.leaseId,
            recipientUids: [lease.tenantUid, lease.landlordUid],
            actorUid: params.principal.uid,
            summary: `Lease agreement "${lease.leaseId}" drafted for review.`,
          });
          await recordAudit(params.principal, params.correlationId, 'tenancy.lease.create', lease.leaseId);
          return { statusCode: 201, body: lease };
        },
      });
    },

    async performLeaseWorkflowAction(params: {
      principal: AuthenticatedPrincipal;
      propertyId: string;
      leaseId: string;
      rawInput: unknown;
      idempotencyKey: string;
      correlationId: string;
    }) {
      const validation = validateLeaseWorkflowActionInput(params.rawInput);
      if (!validation.ok || !validation.value) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid lease workflow payload.', validation.issues);
      }
      const input = validation.value;
      const isAdmin = await isPrincipalAdmin(params.principal);

      return executeIdempotentMutation({
        store: idempotencyStore,
        actorUid: params.principal.uid,
        operation: 'tenancy.lease.workflow',
        idempotencyKey: params.idempotencyKey,
        requestPayload: { propertyId: params.propertyId, leaseId: params.leaseId, ...input },
        mutationFn: async () => {
          const lease = await runDurableTransaction(
            deps.txRunner,
            { operationName: 'tenancy.lease.workflow' },
            async (tx) =>
              executeLeaseWorkflowAction({
                tx,
                propertyId: params.propertyId,
                leaseId: params.leaseId,
                actorUid: params.principal.uid,
                isAdmin,
                input,
                nowIso: nowIsoFn(),
              }),
          );
          if (input.action === 'ACTIVATE') {
            analyticsAccumulator.activeTenancyCount += 1;
            await emitNotificationSafe({
              eventType: 'AGREEMENT_ACTIVATED',
              propertyId: params.propertyId,
              leaseId: lease.leaseId,
              recipientUids: [lease.tenantUid, lease.landlordUid],
              actorUid: params.principal.uid,
              summary: `Tenancy "${lease.leaseId}" is now ACTIVE.`,
            });
          }
          await recordAudit(params.principal, params.correlationId, `tenancy.lease.${input.action.toLowerCase()}`, lease.leaseId, {
            status: lease.status,
          });
          return { statusCode: 200, body: lease };
        },
      });
    },

    async performDepositOperation(params: {
      principal: AuthenticatedPrincipal;
      propertyId: string;
      leaseId: string;
      rawInput: unknown;
      idempotencyKey: string;
      correlationId: string;
    }) {
      const validation = validateDepositOperationInput(params.rawInput);
      if (!validation.ok || !validation.value) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid deposit operation payload.', validation.issues);
      }
      const input = validation.value;
      const isAdmin = await isPrincipalAdmin(params.principal);

      return executeIdempotentMutation({
        store: idempotencyStore,
        actorUid: params.principal.uid,
        operation: 'tenancy.deposit.operation',
        idempotencyKey: params.idempotencyKey,
        requestPayload: { propertyId: params.propertyId, leaseId: params.leaseId, ...input },
        mutationFn: async () => {
          const dep = await runDurableTransaction(
            deps.txRunner,
            { operationName: 'tenancy.deposit.operation' },
            async (tx) =>
              executeDepositOperation({
                tx,
                propertyId: params.propertyId,
                leaseId: params.leaseId,
                actorUid: params.principal.uid,
                isAdmin,
                input,
                nowIso: nowIsoFn(),
              }),
          );
          await emitNotificationSafe({
            eventType: 'DEPOSIT_STATUS_CHANGED',
            propertyId: params.propertyId,
            leaseId: params.leaseId,
            recipientUids: [dep.tenantUid, dep.landlordUid],
            actorUid: params.principal.uid,
            summary: `Security deposit "${dep.depositId}" status updated to "${dep.status}".`,
          });
          await recordAudit(params.principal, params.correlationId, `tenancy.deposit.${input.operation.toLowerCase()}`, dep.depositId, {
            status: dep.status,
            refundableBalance: dep.refundableBalance,
          });
          return { statusCode: 200, body: dep };
        },
      });
    },

    async proposeLeaseRenewal(params: {
      principal: AuthenticatedPrincipal;
      propertyId: string;
      leaseId: string;
      rawInput: unknown;
      idempotencyKey: string;
      correlationId: string;
    }) {
      const validation = validateProposeRenewalInput(params.rawInput);
      if (!validation.ok || !validation.value) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid lease renewal payload.', validation.issues);
      }
      const input = validation.value;
      const isAdmin = await isPrincipalAdmin(params.principal);

      return executeIdempotentMutation({
        store: idempotencyStore,
        actorUid: params.principal.uid,
        operation: 'tenancy.renewal.propose',
        idempotencyKey: params.idempotencyKey,
        requestPayload: { propertyId: params.propertyId, leaseId: params.leaseId, ...input },
        mutationFn: async () => {
          const rnw = await runDurableTransaction(
            deps.txRunner,
            { operationName: 'tenancy.renewal.propose' },
            async (tx) =>
              executeProposeLeaseRenewal({
                tx,
                propertyId: params.propertyId,
                leaseId: params.leaseId,
                actorUid: params.principal.uid,
                isAdmin,
                input,
                nowIso: nowIsoFn(),
              }),
          );
          return { statusCode: 201, body: rnw };
        },
      });
    },

    async respondToLeaseRenewal(params: {
      principal: AuthenticatedPrincipal;
      propertyId: string;
      leaseId: string;
      renewalId: string;
      rawInput: unknown;
      idempotencyKey: string;
      correlationId: string;
    }) {
      const validation = validateRespondRenewalInput(params.rawInput);
      if (!validation.ok || !validation.value) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid renewal response payload.', validation.issues);
      }
      const input = validation.value;
      const isAdmin = await isPrincipalAdmin(params.principal);

      return executeIdempotentMutation({
        store: idempotencyStore,
        actorUid: params.principal.uid,
        operation: 'tenancy.renewal.respond',
        idempotencyKey: params.idempotencyKey,
        requestPayload: { propertyId: params.propertyId, leaseId: params.leaseId, renewalId: params.renewalId, ...input },
        mutationFn: async () => {
          const res = await runDurableTransaction(
            deps.txRunner,
            { operationName: 'tenancy.renewal.respond' },
            async (tx) =>
              executeRespondLeaseRenewal({
                tx,
                propertyId: params.propertyId,
                leaseId: params.leaseId,
                renewalId: params.renewalId,
                actorUid: params.principal.uid,
                isAdmin,
                input,
                nowIso: nowIsoFn(),
              }),
          );
          if (res.successorLease) {
            analyticsAccumulator.renewedLeaseCount += 1;
            analyticsAccumulator.totalLeasesCreated += 1;
          }
          return { statusCode: 200, body: res };
        },
      });
    },

    async proposeRentAdjustment(params: {
      principal: AuthenticatedPrincipal;
      propertyId: string;
      leaseId: string;
      rawInput: unknown;
      approveImmediately?: boolean;
      idempotencyKey: string;
      correlationId: string;
    }) {
      const validation = validateProposeRentAdjustmentInput(params.rawInput);
      if (!validation.ok || !validation.value) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid rent adjustment payload.', validation.issues);
      }
      const input = validation.value;
      const isAdmin = await isPrincipalAdmin(params.principal);

      return executeIdempotentMutation({
        store: idempotencyStore,
        actorUid: params.principal.uid,
        operation: 'tenancy.rent_adjustment.propose',
        idempotencyKey: params.idempotencyKey,
        requestPayload: { propertyId: params.propertyId, leaseId: params.leaseId, ...input },
        mutationFn: async () => {
          const adj = await runDurableTransaction(
            deps.txRunner,
            { operationName: 'tenancy.rent_adjustment.propose' },
            async (tx) =>
              executeProposeAndApproveRentAdjustment({
                tx,
                propertyId: params.propertyId,
                leaseId: params.leaseId,
                actorUid: params.principal.uid,
                isAdmin,
                input,
                approveImmediately: params.approveImmediately,
                nowIso: nowIsoFn(),
              }),
          );
          return { statusCode: 201, body: adj };
        },
      });
    },

    async createLeaseAmendment(params: {
      principal: AuthenticatedPrincipal;
      propertyId: string;
      leaseId: string;
      rawInput: unknown;
      counterpartyConfirmed?: boolean;
      idempotencyKey: string;
      correlationId: string;
    }) {
      const validation = validateCreateLeaseAmendmentInput(params.rawInput);
      if (!validation.ok || !validation.value) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid lease amendment payload.', validation.issues);
      }
      const input = validation.value;
      const isAdmin = await isPrincipalAdmin(params.principal);

      return executeIdempotentMutation({
        store: idempotencyStore,
        actorUid: params.principal.uid,
        operation: 'tenancy.amendment.create',
        idempotencyKey: params.idempotencyKey,
        requestPayload: { propertyId: params.propertyId, leaseId: params.leaseId, ...input },
        mutationFn: async () => {
          const amd = await runDurableTransaction(
            deps.txRunner,
            { operationName: 'tenancy.amendment.create' },
            async (tx) =>
              executeCreateAndApproveLeaseAmendment({
                tx,
                propertyId: params.propertyId,
                leaseId: params.leaseId,
                actorUid: params.principal.uid,
                isAdmin,
                input,
                counterpartyConfirmed: params.counterpartyConfirmed,
                nowIso: nowIsoFn(),
              }),
          );
          return { statusCode: 201, body: amd };
        },
      });
    },

    async createMaintenanceRequest(params: {
      principal: AuthenticatedPrincipal;
      propertyId: string;
      leaseId: string;
      rawInput: unknown;
      idempotencyKey: string;
      correlationId: string;
    }) {
      const validation = validateCreateMaintenanceRequestInput(params.rawInput);
      if (!validation.ok || !validation.value) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid maintenance request payload.', validation.issues);
      }
      const input = validation.value;
      const isAdmin = await isPrincipalAdmin(params.principal);

      return executeIdempotentMutation({
        store: idempotencyStore,
        actorUid: params.principal.uid,
        operation: 'tenancy.maintenance.create',
        idempotencyKey: params.idempotencyKey,
        requestPayload: { propertyId: params.propertyId, leaseId: params.leaseId, ...input },
        mutationFn: async () => {
          const mnt = await runDurableTransaction(
            deps.txRunner,
            { operationName: 'tenancy.maintenance.create' },
            async (tx) =>
              executeCreateMaintenanceRequest({
                tx,
                propertyId: params.propertyId,
                leaseId: params.leaseId,
                actorUid: params.principal.uid,
                isAdmin,
                input,
                nowIso: nowIsoFn(),
              }),
          );
          analyticsAccumulator.maintenanceRequestVolume += 1;
          return { statusCode: 201, body: mnt };
        },
      });
    },

    async updateMaintenanceRequest(params: {
      principal: AuthenticatedPrincipal;
      propertyId: string;
      leaseId: string;
      requestId: string;
      rawInput: unknown;
      idempotencyKey: string;
      correlationId: string;
    }) {
      const validation = validateUpdateMaintenanceRequestInput(params.rawInput);
      if (!validation.ok || !validation.value) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid maintenance update payload.', validation.issues);
      }
      const input = validation.value;
      const isAdmin = await isPrincipalAdmin(params.principal);

      return executeIdempotentMutation({
        store: idempotencyStore,
        actorUid: params.principal.uid,
        operation: 'tenancy.maintenance.update',
        idempotencyKey: params.idempotencyKey,
        requestPayload: { propertyId: params.propertyId, leaseId: params.leaseId, requestId: params.requestId, ...input },
        mutationFn: async () => {
          const mnt = await runDurableTransaction(
            deps.txRunner,
            { operationName: 'tenancy.maintenance.update' },
            async (tx) =>
              executeUpdateMaintenanceRequest({
                tx,
                propertyId: params.propertyId,
                leaseId: params.leaseId,
                requestId: params.requestId,
                actorUid: params.principal.uid,
                isAdmin,
                input,
                nowIso: nowIsoFn(),
              }),
          );
          if (mnt.status === 'COMPLETED') {
            analyticsAccumulator.completedMaintenanceCount += 1;
          }
          return { statusCode: 200, body: mnt };
        },
      });
    },

    async recordInspection(params: {
      principal: AuthenticatedPrincipal;
      propertyId: string;
      leaseId: string;
      rawInput: unknown;
      idempotencyKey: string;
      correlationId: string;
    }) {
      const validation = validateRecordInspectionInput(params.rawInput);
      if (!validation.ok || !validation.value) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid inspection payload.', validation.issues);
      }
      const input = validation.value;
      const isAdmin = await isPrincipalAdmin(params.principal);

      return executeIdempotentMutation({
        store: idempotencyStore,
        actorUid: params.principal.uid,
        operation: 'tenancy.inspection.record',
        idempotencyKey: params.idempotencyKey,
        requestPayload: { propertyId: params.propertyId, leaseId: params.leaseId, ...input },
        mutationFn: async () => {
          const ins = await runDurableTransaction(
            deps.txRunner,
            { operationName: 'tenancy.inspection.record' },
            async (tx) =>
              executeRecordOrCompleteInspection({
                tx,
                propertyId: params.propertyId,
                leaseId: params.leaseId,
                actorUid: params.principal.uid,
                isAdmin,
                input,
                nowIso: nowIsoFn(),
              }),
          );
          return { statusCode: 201, body: ins };
        },
      });
    },

    async performHandover(params: {
      principal: AuthenticatedPrincipal;
      propertyId: string;
      leaseId: string;
      rawInput: unknown;
      idempotencyKey: string;
      correlationId: string;
    }) {
      const validation = validateHandoverOperationInput(params.rawInput);
      if (!validation.ok || !validation.value) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid handover payload.', validation.issues);
      }
      const input = validation.value;
      const isAdmin = await isPrincipalAdmin(params.principal);

      return executeIdempotentMutation({
        store: idempotencyStore,
        actorUid: params.principal.uid,
        operation: 'tenancy.handover.perform',
        idempotencyKey: params.idempotencyKey,
        requestPayload: { propertyId: params.propertyId, leaseId: params.leaseId, ...input },
        mutationFn: async () => {
          const hnd = await runDurableTransaction(
            deps.txRunner,
            { operationName: 'tenancy.handover.perform' },
            async (tx) =>
              executeHandoverOperation({
                tx,
                propertyId: params.propertyId,
                leaseId: params.leaseId,
                actorUid: params.principal.uid,
                isAdmin,
                input,
                nowIso: nowIsoFn(),
              }),
          );
          return { statusCode: 201, body: hnd };
        },
      });
    },

    async initiateOrCompleteTermination(params: {
      principal: AuthenticatedPrincipal;
      propertyId: string;
      leaseId: string;
      rawInput: unknown;
      idempotencyKey: string;
      correlationId: string;
    }) {
      const validation = validateInitiateTerminationInput(params.rawInput);
      if (!validation.ok || !validation.value) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid termination payload.', validation.issues);
      }
      const input = validation.value;
      const isAdmin = await isPrincipalAdmin(params.principal);

      return executeIdempotentMutation({
        store: idempotencyStore,
        actorUid: params.principal.uid,
        operation: 'tenancy.termination.execute',
        idempotencyKey: params.idempotencyKey,
        requestPayload: { propertyId: params.propertyId, leaseId: params.leaseId, ...input },
        mutationFn: async () => {
          const trm = await runDurableTransaction(
            deps.txRunner,
            { operationName: 'tenancy.termination.execute' },
            async (tx) =>
              executeTenancyTermination({
                tx,
                propertyId: params.propertyId,
                leaseId: params.leaseId,
                actorUid: params.principal.uid,
                isAdmin,
                input,
                nowIso: nowIsoFn(),
              }),
          );
          if (trm.status === 'COMPLETED') {
            analyticsAccumulator.terminatedLeaseCount += 1;
            if (analyticsAccumulator.activeTenancyCount > 0) {
              analyticsAccumulator.activeTenancyCount -= 1;
            }
          }
          return { statusCode: 201, body: trm };
        },
      });
    },

    async getPropertyTenancyOverview(params: {
      principal: AuthenticatedPrincipal;
      propertyId: string;
    }): Promise<{
      propertyConfig: RentalPropertyConfigRecord;
      applications: RentalApplicationRecord[];
      screenings: TenantScreeningReferenceRecord[];
      leases: LeaseAgreementRecord[];
      deposits: TenancyDepositRecord[];
      renewals: LeaseRenewalProposalRecord[];
      rentAdjustments: RentAdjustmentRecord[];
      amendments: LeaseAmendmentRecord[];
      maintenanceRequests: MaintenanceRequestRecord[];
      inspections: PropertyInspectionRecord[];
      terminations: TenancyTerminationRecord[];
      handovers: PropertyHandoverRecord[];
      history: TenancyHistoryEventRecord[];
    }> {
      const isAdmin = await isPrincipalAdmin(params.principal);
      return runDurableTransaction(
        deps.txRunner,
        { operationName: 'tenancy.overview.get' },
        async (tx) => {
          const propSnap = await tx.get<RentalPropertyConfigRecord>(`tenancyProperties/${params.propertyId}`);
          if (!propSnap.exists || !propSnap.data) {
            throw new CoreApiError('NOT_FOUND', 404, `Rental property "${params.propertyId}" was not found.`);
          }
          const prop = propSnap.data;
          const pIndex = await loadOrInitPropertyTenancyIndex(tx, params.propertyId, nowIsoFn());

          const isLandlordOrManager =
            isAdmin ||
            prop.landlordUid === params.principal.uid ||
            prop.propertyManagerUid === params.principal.uid ||
            prop.brokerUid === params.principal.uid;

          const allApplications: RentalApplicationRecord[] = [];
          for (const id of pIndex.applicationIds) {
            const s = await tx.get<RentalApplicationRecord>(`tenancyApplications/${id}`);
            if (s.exists && s.data) allApplications.push(s.data);
          }

          // Enforce strict applicant isolation: applicants only see their own application
          const visibleApplications = isLandlordOrManager
            ? allApplications
            : allApplications.filter((a) => a.applicantUid === params.principal.uid);

          const screenings: TenantScreeningReferenceRecord[] = [];
          if (isLandlordOrManager) {
            for (const id of pIndex.screeningIds) {
              const s = await tx.get<TenantScreeningReferenceRecord>(`tenancyScreenings/${id}`);
              if (s.exists && s.data) screenings.push(s.data);
            }
          }

          const allLeases: LeaseAgreementRecord[] = [];
          for (const id of pIndex.leaseIds) {
            const s = await tx.get<LeaseAgreementRecord>(`tenancyLeases/${id}`);
            if (s.exists && s.data) allLeases.push(s.data);
          }
          const visibleLeases = isLandlordOrManager
            ? allLeases
            : allLeases.filter((l) => l.tenantUid === params.principal.uid);

          const visibleLeaseIds = new Set(visibleLeases.map((l) => l.leaseId));

          if (!isLandlordOrManager && visibleApplications.length === 0 && visibleLeases.length === 0) {
            throw new CoreApiError('FORBIDDEN', 403, 'Principal does not have access to private tenancy records for this property.');
          }

          const deposits: TenancyDepositRecord[] = [];
          for (const id of pIndex.depositIds) {
            const s = await tx.get<TenancyDepositRecord>(`tenancyDeposits/${id}`);
            if (s.exists && s.data && (isLandlordOrManager || visibleLeaseIds.has(s.data.leaseId))) {
              deposits.push(s.data);
            }
          }

          const renewals: LeaseRenewalProposalRecord[] = [];
          for (const id of pIndex.renewalIds) {
            const s = await tx.get<LeaseRenewalProposalRecord>(`tenancyRenewals/${id}`);
            if (s.exists && s.data && (isLandlordOrManager || visibleLeaseIds.has(s.data.originalLeaseId))) {
              renewals.push(s.data);
            }
          }

          const rentAdjustments: RentAdjustmentRecord[] = [];
          for (const id of pIndex.adjustmentIds) {
            const s = await tx.get<RentAdjustmentRecord>(`tenancyRentAdjustments/${id}`);
            if (s.exists && s.data && (isLandlordOrManager || visibleLeaseIds.has(s.data.leaseId))) {
              rentAdjustments.push(s.data);
            }
          }

          const amendments: LeaseAmendmentRecord[] = [];
          for (const id of pIndex.amendmentIds) {
            const s = await tx.get<LeaseAmendmentRecord>(`tenancyAmendments/${id}`);
            if (s.exists && s.data && (isLandlordOrManager || visibleLeaseIds.has(s.data.leaseId))) {
              amendments.push(s.data);
            }
          }

          const maintenanceRequests: MaintenanceRequestRecord[] = [];
          for (const id of pIndex.maintenanceIds) {
            const s = await tx.get<MaintenanceRequestRecord>(`tenancyMaintenance/${id}`);
            if (s.exists && s.data && (isLandlordOrManager || visibleLeaseIds.has(s.data.leaseId))) {
              maintenanceRequests.push(s.data);
            }
          }

          const inspections: PropertyInspectionRecord[] = [];
          for (const id of pIndex.inspectionIds) {
            const s = await tx.get<PropertyInspectionRecord>(`tenancyInspections/${id}`);
            if (s.exists && s.data && (isLandlordOrManager || visibleLeaseIds.has(s.data.leaseId))) {
              inspections.push(s.data);
            }
          }

          const terminations: TenancyTerminationRecord[] = [];
          for (const id of pIndex.terminationIds) {
            const s = await tx.get<TenancyTerminationRecord>(`tenancyTerminations/${id}`);
            if (s.exists && s.data && (isLandlordOrManager || visibleLeaseIds.has(s.data.leaseId))) {
              terminations.push(s.data);
            }
          }

          const handovers: PropertyHandoverRecord[] = [];
          for (const id of pIndex.handoverIds) {
            const s = await tx.get<PropertyHandoverRecord>(`tenancyHandovers/${id}`);
            if (s.exists && s.data && (isLandlordOrManager || visibleLeaseIds.has(s.data.leaseId))) {
              handovers.push(s.data);
            }
          }

          const history: TenancyHistoryEventRecord[] = [];
          for (const id of pIndex.historyEventIds) {
            const s = await tx.get<TenancyHistoryEventRecord>(`tenancyHistory/${id}`);
            if (s.exists && s.data && (isLandlordOrManager || (s.data.leaseId && visibleLeaseIds.has(s.data.leaseId)))) {
              history.push(s.data);
            }
          }

          return {
            propertyConfig: prop,
            applications: visibleApplications,
            screenings,
            leases: visibleLeases,
            deposits,
            renewals,
            rentAdjustments,
            amendments,
            maintenanceRequests,
            inspections,
            terminations,
            handovers,
            history,
          };
        },
      );
    },

    getTenancyAnalyticsSnapshot(): TenancyAnalyticsSnapshot {
      const a = analyticsAccumulator;
      const toRatio = (num: number, den: number) =>
        den === 0 ? 0 : Math.round((num / den) * 10000) / 10000;
      return {
        rentalApplicationVolume: a.rentalApplicationVolume,
        approvedApplicationCount: a.approvedApplicationCount,
        applicationConversionRate: toRatio(a.approvedApplicationCount, a.rentalApplicationVolume),
        activeTenancyCount: a.activeTenancyCount,
        totalLeasesCreated: a.totalLeasesCreated,
        renewedLeaseCount: a.renewedLeaseCount,
        renewalRate: toRatio(a.renewedLeaseCount, a.totalLeasesCreated),
        terminatedLeaseCount: a.terminatedLeaseCount,
        terminationRate: toRatio(a.terminatedLeaseCount, a.totalLeasesCreated),
        maintenanceRequestVolume: a.maintenanceRequestVolume,
        completedMaintenanceCount: a.completedMaintenanceCount,
      };
    },
  };
}
