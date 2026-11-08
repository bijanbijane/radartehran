import crypto from 'node:crypto';
import {
  AuthenticatedPrincipal,
  verifyAdminOrDelegatedPrincipal,
  runDurableTransaction,
  executeIdempotentMutation,
  createStructuredAuditEvent,
  createFirestoreIdempotencyStoreAdapter,
} from '../core';
import { BrokerageDependencies } from './types';
import {
  validateCreateBrokerageInput,
  validateUpdateBrokerageInput,
  validateUpsertAgentInput,
  validateInviteMemberInput,
  validateTransitionMembershipInput,
  validateCreateTeamInput,
  validateTransferTeamMemberInput,
  validateCreateClientInput,
  validateCreateLeadInput,
  validateDistributeLeadInput,
  validateUpdateLeadStatusInput,
  validateCreateFollowUpInput,
  validateUpdateFollowUpInput,
} from './validation';
import {
  validateCreateRepresentationInput,
  validateCreateAcquisitionInput,
  validateUpdateAcquisitionInput,
  validateTransactionParticipationInput,
  validateReplaceTransactionAgentInput,
  validateCreateAgreementInput,
  validateAmendAgreementInput,
  validateCommissionAllocationInput,
  validateCreateReferralInput,
  validateUpdateReferralStatusInput,
  validateRecordCommunicationInput,
  validateScheduleViewingInput,
  validateUpdateViewingInput,
} from './validationCommercialAndViewing';
import {
  executeCreateBrokerageOrganization,
  executeUpdateBrokerageOrganization,
  executeUpsertAgentProfile,
  executeInviteBrokerageMember,
  executeTransitionMembership,
  executeCreateTeam,
  executeTransferTeamMember,
} from './organizationAgentMembershipAndTeamOps';
import {
  executeCreateClient,
  executeGetClientWithAccessCheck,
  executeCreateLead,
  executeDistributeLead,
  executeUpdateLeadStatus,
  executeCreateFollowUpTask,
  executeUpdateFollowUpTask,
} from './clientLeadDistributionAndFollowUpOps';
import {
  executeCreatePropertyRepresentation,
  executeCreateListingAcquisition,
  executeUpdateListingAcquisition,
  executeRegisterTransactionParticipation,
  executeReplaceTransactionAgent,
} from './representationListingAndTransactionOps';
import {
  executeCreateBrokerageAgreement,
  executeAmendBrokerageAgreement,
  executeCalculateAndAllocateCommission,
  executeReverseBrokerageCommission,
  executeCreateReferral,
  executeUpdateReferralStatus,
} from './agreementCommissionAndReferralOps';
import {
  executeRecordClientCommunication,
  executeListClientCommunications,
  executeScheduleViewing,
  executeUpdateViewing,
  executeGetAgentPerformanceMetrics,
  executeGetBrokerageOperationalReport,
} from './communicationViewingAndReportingOps';

function defaultIdGen(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(6).toString('hex')}`;
}

export function createBrokerageService(deps: BrokerageDependencies) {
  const idempotencyStore =
    deps.idempotencyStore ?? createFirestoreIdempotencyStoreAdapter(deps.txRunner);
  const nowMs = () => (deps.nowFn ? deps.nowFn() : Date.now());
  const nowIso = () => new Date(nowMs()).toISOString();
  const idGen = deps.idGenerator ?? defaultIdGen;

  async function checkIsAdmin(principal: AuthenticatedPrincipal): Promise<boolean> {
    const decision = await verifyAdminOrDelegatedPrincipal(principal, deps.adminStore, {
      primaryAdminEmails: deps.primaryAdminEmails,
    });
    return decision.allowed;
  }

  function emitTelemetry(
    eventName: string,
    brokerageId: string,
    metrics: Record<string, number>,
  ): void {
    if (deps.telemetryEmitter) {
      deps.telemetryEmitter({ eventName, brokerageId, metrics, occurredAtMs: nowMs() });
    }
  }

  return {
    async createBrokerageOrganization(
      principal: AuthenticatedPrincipal,
      rawInput: unknown,
      idempotencyKey?: string,
    ) {
      const input = validateCreateBrokerageInput(rawInput);
      const executeCore = async () =>
        runDurableTransaction(
          deps.txRunner,
          { operationName: 'brokerage.createOrganization' },
          (tx) => executeCreateBrokerageOrganization(tx, input, principal.uid, nowIso(), idGen),
        );
      const brokerage = idempotencyKey
        ? (
            await executeIdempotentMutation({
              store: idempotencyStore,
              actorUid: principal.uid,
              operation: 'brokerage.createOrganization',
              idempotencyKey,
              requestPayload: input,
              mutationFn: async () => ({ statusCode: 201, body: await executeCore() }),
            })
          ).body
        : await executeCore();

      await deps.auditSink.writeAuditEvent(
        createStructuredAuditEvent({
          principal,
          correlationId: idempotencyKey ?? brokerage.brokerageId,
          action: 'BROKERAGE_CREATED',
          targetCollection: 'brokerageOrganizations',
          targetResourceId: brokerage.brokerageId,
          outcome: 'SUCCESS',
        }),
      );
      return { brokerage };
    },

    async updateBrokerageOrganization(
      principal: AuthenticatedPrincipal,
      rawInput: unknown,
    ) {
      const input = validateUpdateBrokerageInput(rawInput);
      const isAdmin = await checkIsAdmin(principal);
      const brokerage = await runDurableTransaction(
        deps.txRunner,
        { operationName: 'brokerage.updateOrganization' },
        (tx) => executeUpdateBrokerageOrganization(tx, input, principal.uid, isAdmin, nowIso()),
      );
      return { brokerage };
    },

    async upsertAgentProfile(
      principal: AuthenticatedPrincipal,
      rawInput: unknown,
    ) {
      const input = validateUpsertAgentInput(rawInput);
      const isAdmin = await checkIsAdmin(principal);
      const agent = await runDurableTransaction(
        deps.txRunner,
        { operationName: 'brokerage.upsertAgent' },
        (tx) => executeUpsertAgentProfile(tx, input, principal.uid, isAdmin, nowIso()),
      );
      return { agent };
    },

    async inviteMember(
      principal: AuthenticatedPrincipal,
      rawInput: unknown,
      idempotencyKey?: string,
    ) {
      const input = validateInviteMemberInput(rawInput);
      const isAdmin = await checkIsAdmin(principal);
      const executeCore = async () =>
        runDurableTransaction(
          deps.txRunner,
          { operationName: 'brokerage.inviteMember' },
          (tx) => executeInviteBrokerageMember(tx, input, principal.uid, isAdmin, nowIso(), idGen),
        );
      const membership = idempotencyKey
        ? (
            await executeIdempotentMutation({
              store: idempotencyStore,
              actorUid: principal.uid,
              operation: 'brokerage.inviteMember',
              idempotencyKey,
              requestPayload: input,
              mutationFn: async () => ({ statusCode: 201, body: await executeCore() }),
            })
          ).body
        : await executeCore();
      return { membership };
    },

    async transitionMembership(
      principal: AuthenticatedPrincipal,
      rawInput: unknown,
    ) {
      const input = validateTransitionMembershipInput(rawInput);
      const isAdmin = await checkIsAdmin(principal);
      return runDurableTransaction(
        deps.txRunner,
        { operationName: 'brokerage.transitionMembership' },
        (tx) => executeTransitionMembership(tx, input, principal.uid, isAdmin, nowIso(), idGen),
      );
    },

    async createTeam(
      principal: AuthenticatedPrincipal,
      rawInput: unknown,
    ) {
      const input = validateCreateTeamInput(rawInput);
      const isAdmin = await checkIsAdmin(principal);
      const team = await runDurableTransaction(
        deps.txRunner,
        { operationName: 'brokerage.createTeam' },
        (tx) => executeCreateTeam(tx, input, principal.uid, isAdmin, nowIso(), idGen),
      );
      return { team };
    },

    async transferTeamMember(
      principal: AuthenticatedPrincipal,
      rawInput: unknown,
    ) {
      const input = validateTransferTeamMemberInput(rawInput);
      const isAdmin = await checkIsAdmin(principal);
      return runDurableTransaction(
        deps.txRunner,
        { operationName: 'brokerage.transferTeamMember' },
        (tx) => executeTransferTeamMember(tx, input, principal.uid, isAdmin, nowIso()),
      );
    },

    async createClient(
      principal: AuthenticatedPrincipal,
      rawInput: unknown,
      idempotencyKey?: string,
    ) {
      const input = validateCreateClientInput(rawInput);
      const isAdmin = await checkIsAdmin(principal);
      const executeCore = async () =>
        runDurableTransaction(
          deps.txRunner,
          { operationName: 'brokerage.createClient' },
          (tx) => executeCreateClient(tx, input, principal.uid, isAdmin, nowIso(), idGen),
        );
      const client = idempotencyKey
        ? (
            await executeIdempotentMutation({
              store: idempotencyStore,
              actorUid: principal.uid,
              operation: 'brokerage.createClient',
              idempotencyKey,
              requestPayload: input,
              mutationFn: async () => ({ statusCode: 201, body: await executeCore() }),
            })
          ).body
        : await executeCore();
      return { client };
    },

    async getClient(principal: AuthenticatedPrincipal, clientId: string) {
      const isAdmin = await checkIsAdmin(principal);
      const client = await runDurableTransaction(
        deps.txRunner,
        { operationName: 'brokerage.getClient' },
        (tx) => executeGetClientWithAccessCheck(tx, clientId, principal.uid, isAdmin),
      );
      return { client };
    },

    async createLead(
      principal: AuthenticatedPrincipal,
      rawInput: unknown,
      idempotencyKey?: string,
    ) {
      const input = validateCreateLeadInput(rawInput);
      const isAdmin = await checkIsAdmin(principal);
      const executeCore = async () =>
        runDurableTransaction(
          deps.txRunner,
          { operationName: 'brokerage.createLead' },
          (tx) => executeCreateLead(tx, input, principal.uid, isAdmin, nowIso(), idGen),
        );
      const lead = idempotencyKey
        ? (
            await executeIdempotentMutation({
              store: idempotencyStore,
              actorUid: principal.uid,
              operation: 'brokerage.createLead',
              idempotencyKey,
              requestPayload: input,
              mutationFn: async () => ({ statusCode: 201, body: await executeCore() }),
            })
          ).body
        : await executeCore();
      emitTelemetry('LEAD_CREATED', lead.brokerageId, { count: 1 });
      return { lead };
    },

    async distributeLead(principal: AuthenticatedPrincipal, rawInput: unknown) {
      const input = validateDistributeLeadInput(rawInput);
      const isAdmin = await checkIsAdmin(principal);
      const lead = await runDurableTransaction(
        deps.txRunner,
        { operationName: 'brokerage.distributeLead' },
        (tx) => executeDistributeLead(tx, input, principal.uid, isAdmin, nowIso()),
      );
      emitTelemetry('LEAD_ASSIGNED', lead.brokerageId, { count: 1 });
      if (deps.notificationEmitter && lead.assignedAgentUid) {
        await deps.notificationEmitter({
          recipientUids: [lead.assignedAgentUid],
          eventType: 'BROKERAGE_LEAD_ASSIGNED',
          brokerageId: lead.brokerageId,
          entityId: lead.leadId,
          summary: `Lead ${lead.leadId} assigned via ${input.strategy}`,
        });
      }
      return { lead };
    },

    async updateLeadStatus(principal: AuthenticatedPrincipal, rawInput: unknown) {
      const input = validateUpdateLeadStatusInput(rawInput);
      const isAdmin = await checkIsAdmin(principal);
      const lead = await runDurableTransaction(
        deps.txRunner,
        { operationName: 'brokerage.updateLeadStatus' },
        (tx) => executeUpdateLeadStatus(tx, input, principal.uid, isAdmin, nowIso()),
      );
      if (lead.status === 'CONVERTED') {
        emitTelemetry('LEAD_CONVERTED', lead.brokerageId, { count: 1 });
      }
      return { lead };
    },

    async createFollowUpTask(principal: AuthenticatedPrincipal, rawInput: unknown) {
      const input = validateCreateFollowUpInput(rawInput);
      const isAdmin = await checkIsAdmin(principal);
      const task = await runDurableTransaction(
        deps.txRunner,
        { operationName: 'brokerage.createFollowUp' },
        (tx) => executeCreateFollowUpTask(tx, input, principal.uid, isAdmin, nowIso(), idGen),
      );
      if (deps.notificationEmitter) {
        await deps.notificationEmitter({
          recipientUids: [task.assignedAgentUid],
          eventType: 'BROKERAGE_FOLLOW_UP_REMINDER',
          brokerageId: task.brokerageId,
          entityId: task.taskId,
          summary: `Follow-up scheduled: ${task.title}`,
        });
      }
      return { task };
    },

    async updateFollowUpTask(principal: AuthenticatedPrincipal, rawInput: unknown) {
      const input = validateUpdateFollowUpInput(rawInput);
      const isAdmin = await checkIsAdmin(principal);
      const task = await runDurableTransaction(
        deps.txRunner,
        { operationName: 'brokerage.updateFollowUp' },
        (tx) => executeUpdateFollowUpTask(tx, input, principal.uid, isAdmin, nowIso()),
      );
      return { task };
    },

    async createPropertyRepresentation(principal: AuthenticatedPrincipal, rawInput: unknown) {
      const input = validateCreateRepresentationInput(rawInput);
      const isAdmin = await checkIsAdmin(principal);
      const representation = await runDurableTransaction(
        deps.txRunner,
        { operationName: 'brokerage.createRepresentation' },
        (tx) => executeCreatePropertyRepresentation(tx, input, principal.uid, isAdmin, nowIso(), idGen),
      );
      return { representation };
    },

    async createListingAcquisition(principal: AuthenticatedPrincipal, rawInput: unknown) {
      const input = validateCreateAcquisitionInput(rawInput);
      const isAdmin = await checkIsAdmin(principal);
      const acquisition = await runDurableTransaction(
        deps.txRunner,
        { operationName: 'brokerage.createAcquisition' },
        (tx) => executeCreateListingAcquisition(tx, input, principal.uid, isAdmin, nowIso(), idGen),
      );
      emitTelemetry('LISTING_ACQUIRED', acquisition.brokerageId, { count: 1 });
      return { acquisition };
    },

    async updateListingAcquisition(principal: AuthenticatedPrincipal, rawInput: unknown) {
      const input = validateUpdateAcquisitionInput(rawInput);
      const isAdmin = await checkIsAdmin(principal);
      const acquisition = await runDurableTransaction(
        deps.txRunner,
        { operationName: 'brokerage.updateAcquisition' },
        (tx) => executeUpdateListingAcquisition(tx, input, principal.uid, isAdmin, nowIso()),
      );
      return { acquisition };
    },

    async registerTransactionParticipation(principal: AuthenticatedPrincipal, rawInput: unknown) {
      const input = validateTransactionParticipationInput(rawInput);
      const isAdmin = await checkIsAdmin(principal);
      const participation = await runDurableTransaction(
        deps.txRunner,
        { operationName: 'brokerage.registerParticipation' },
        (tx) => executeRegisterTransactionParticipation(tx, input, principal.uid, isAdmin, nowIso(), idGen),
      );
      emitTelemetry('TRANSACTION_PARTICIPATION', participation.brokerageId, { count: 1 });
      return { participation };
    },

    async replaceTransactionAgent(principal: AuthenticatedPrincipal, rawInput: unknown) {
      const input = validateReplaceTransactionAgentInput(rawInput);
      const isAdmin = await checkIsAdmin(principal);
      const participation = await runDurableTransaction(
        deps.txRunner,
        { operationName: 'brokerage.replaceAgent' },
        (tx) => executeReplaceTransactionAgent(tx, input, principal.uid, isAdmin, nowIso()),
      );
      return { participation };
    },

    async createBrokerageAgreement(principal: AuthenticatedPrincipal, rawInput: unknown) {
      const input = validateCreateAgreementInput(rawInput);
      const isAdmin = await checkIsAdmin(principal);
      const agreement = await runDurableTransaction(
        deps.txRunner,
        { operationName: 'brokerage.createAgreement' },
        (tx) => executeCreateBrokerageAgreement(tx, input, principal.uid, isAdmin, nowIso(), idGen),
      );
      return { agreement };
    },

    async amendBrokerageAgreement(principal: AuthenticatedPrincipal, rawInput: unknown) {
      const input = validateAmendAgreementInput(rawInput);
      const isAdmin = await checkIsAdmin(principal);
      const agreement = await runDurableTransaction(
        deps.txRunner,
        { operationName: 'brokerage.amendAgreement' },
        (tx) => executeAmendBrokerageAgreement(tx, input, principal.uid, isAdmin, nowIso()),
      );
      return { agreement };
    },

    async calculateAndAllocateCommission(
      principal: AuthenticatedPrincipal,
      rawInput: unknown,
      idempotencyKey?: string,
    ) {
      const input = validateCommissionAllocationInput(rawInput);
      const isAdmin = await checkIsAdmin(principal);
      const executeCore = async () =>
        runDurableTransaction(
          deps.txRunner,
          { operationName: 'brokerage.calculateCommission' },
          (tx) => executeCalculateAndAllocateCommission(tx, input, principal.uid, isAdmin, nowIso(), idGen),
        );
      const commission = idempotencyKey
        ? (
            await executeIdempotentMutation({
              store: idempotencyStore,
              actorUid: principal.uid,
              operation: 'brokerage.calculateCommission',
              idempotencyKey,
              requestPayload: input,
              mutationFn: async () => ({ statusCode: 201, body: await executeCore() }),
            })
          ).body
        : await executeCore();
      emitTelemetry('COMMISSION_SETTLED', commission.brokerageId, {
        amount: commission.totalCommissionAmount,
      });
      return { commission };
    },

    async reverseCommission(
      principal: AuthenticatedPrincipal,
      brokerageCommissionId: string,
      reason: string,
    ) {
      const isAdmin = await checkIsAdmin(principal);
      const commission = await runDurableTransaction(
        deps.txRunner,
        { operationName: 'brokerage.reverseCommission' },
        (tx) => executeReverseBrokerageCommission(tx, brokerageCommissionId, reason, principal.uid, isAdmin, nowIso()),
      );
      return { commission };
    },

    async createReferral(principal: AuthenticatedPrincipal, rawInput: unknown) {
      const input = validateCreateReferralInput(rawInput);
      const isAdmin = await checkIsAdmin(principal);
      const referral = await runDurableTransaction(
        deps.txRunner,
        { operationName: 'brokerage.createReferral' },
        (tx) => executeCreateReferral(tx, input, principal.uid, isAdmin, nowIso(), idGen),
      );
      return { referral };
    },

    async updateReferralStatus(principal: AuthenticatedPrincipal, rawInput: unknown) {
      const input = validateUpdateReferralStatusInput(rawInput);
      const isAdmin = await checkIsAdmin(principal);
      const referral = await runDurableTransaction(
        deps.txRunner,
        { operationName: 'brokerage.updateReferralStatus' },
        (tx) => executeUpdateReferralStatus(tx, input, principal.uid, isAdmin, nowIso()),
      );
      if (referral.status === 'CONVERTED') {
        emitTelemetry('REFERRAL_CONVERTED', referral.referringBrokerageId, { count: 1 });
      }
      return { referral };
    },

    async recordClientCommunication(principal: AuthenticatedPrincipal, rawInput: unknown) {
      const input = validateRecordCommunicationInput(rawInput);
      const isAdmin = await checkIsAdmin(principal);
      const communication = await runDurableTransaction(
        deps.txRunner,
        { operationName: 'brokerage.recordCommunication' },
        (tx) => executeRecordClientCommunication(tx, input, principal.uid, isAdmin, nowIso(), idGen),
      );
      return { communication };
    },

    async listClientCommunications(
      principal: AuthenticatedPrincipal,
      brokerageId: string,
      clientId: string,
      includeInternalPrivate: boolean,
    ) {
      const isAdmin = await checkIsAdmin(principal);
      const communications = await runDurableTransaction(
        deps.txRunner,
        { operationName: 'brokerage.listCommunications' },
        (tx) => executeListClientCommunications(tx, brokerageId, clientId, principal.uid, isAdmin, includeInternalPrivate),
      );
      return { communications };
    },

    async scheduleViewing(principal: AuthenticatedPrincipal, rawInput: unknown) {
      const input = validateScheduleViewingInput(rawInput);
      const isAdmin = await checkIsAdmin(principal);
      const viewing = await runDurableTransaction(
        deps.txRunner,
        { operationName: 'brokerage.scheduleViewing' },
        (tx) => executeScheduleViewing(tx, input, principal.uid, isAdmin, nowIso(), idGen),
      );
      return { viewing };
    },

    async updateViewing(principal: AuthenticatedPrincipal, rawInput: unknown) {
      const input = validateUpdateViewingInput(rawInput);
      const isAdmin = await checkIsAdmin(principal);
      const viewing = await runDurableTransaction(
        deps.txRunner,
        { operationName: 'brokerage.updateViewing' },
        (tx) => executeUpdateViewing(tx, input, principal.uid, isAdmin, nowIso()),
      );
      if (viewing.status === 'COMPLETED') {
        emitTelemetry('PROPERTY_VIEWING_COMPLETED', viewing.brokerageId, { count: 1 });
      }
      return { viewing };
    },

    async getAgentPerformance(
      principal: AuthenticatedPrincipal,
      brokerageId: string,
      agentUid: string,
    ) {
      const isAdmin = await checkIsAdmin(principal);
      return runDurableTransaction(
        deps.txRunner,
        { operationName: 'brokerage.getAgentPerformance' },
        (tx) => executeGetAgentPerformanceMetrics(tx, brokerageId, agentUid, principal.uid, isAdmin),
      );
    },

    async getBrokerageOperationalReport(
      principal: AuthenticatedPrincipal,
      brokerageId: string,
    ) {
      const isAdmin = await checkIsAdmin(principal);
      return runDurableTransaction(
        deps.txRunner,
        { operationName: 'brokerage.getOperationalReport' },
        (tx) => executeGetBrokerageOperationalReport(tx, brokerageId, principal.uid, isAdmin),
      );
    },
  };
}
