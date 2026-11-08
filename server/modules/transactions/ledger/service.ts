import { randomUUID } from 'node:crypto';
import {
  CoreApiError,
  createFirestoreIdempotencyStoreAdapter,
  createStructuredAuditEvent,
  executeIdempotentMutation,
  runDurableTransaction,
  verifyAdminOrDelegatedPrincipal,
  type AuthenticatedPrincipal,
} from '../../core';
import {
  computeObligationOutstandingBalance,
  computeSettlementRefundableBalance,
  safeAddMonetary,
  validateLedgerEntriesBalance,
} from './calculationEngine';
import {
  appendFinancialHistoryEvent,
  executeCreateCommission,
  executeCreateObligation,
  executeGenerateRentalSchedule,
  executePostLedgerPair,
  executeReverseLedgerPostingGroup,
  executeUpdateObligation,
  loadTransactionAndVerifyFinancialParticipant,
  saveFinancialIndex,
} from './obligationScheduleAndCommissionOps';
import { runTransactionFinancialReconciliation } from './reconciliationEngine';
import {
  executeCreateAndConfirmRefund,
  executeCreateFinancialDispute,
  executeCreatePaymentReference,
  executeCreateSettlement,
  executeRefundDecision,
  executeResolveFinancialDispute,
  executeSettlementAction,
  executeUpdatePaymentReferenceStatus,
} from './settlementRefundAndDisputeOps';
import type {
  CommissionAgreementRecord,
  FinancialAnalyticsSnapshot,
  FinancialDisputeRecord,
  FinancialHistoryEventRecord,
  FinancialLedgerDependencies,
  FinancialLedgerEntryRecord,
  FinancialObligationRecord,
  PaymentStatusReferenceRecord,
  ReconciliationReportRecord,
  RentalSchedulePlanRecord,
  TransactionFinancialSummary,
  TransactionRefundRecord,
  TransactionSettlementRecord,
} from './types';
import {
  validateCreateCommissionInput,
  validateCreateFinancialDisputeInput,
  validateCreateLedgerPostingInput,
  validateCreateObligationInput,
  validateCreatePaymentReferenceInput,
  validateCreateRefundInput,
  validateCreateSettlementInput,
  validateGenerateRentalScheduleInput,
  validateRefundDecisionInput,
  validateResolveFinancialDisputeInput,
  validateReverseLedgerPostingInput,
  validateSettlementActionInput,
  validateUpdateObligationInput,
  validateUpdatePaymentReferenceInput,
} from './validation';

export function createTransactionFinancialLedgerService(deps: FinancialLedgerDependencies) {
  const idempotencyStore =
    deps.idempotencyStore ?? createFirestoreIdempotencyStoreAdapter(deps.txRunner);
  const nowFn = deps.nowFn ?? (() => Date.now());
  const nowIsoFn = () => new Date(nowFn()).toISOString();

  const analyticsAccumulator = {
    totalObligationVolume: 0,
    totalSettledVolume: 0,
    outstandingObligationTotal: 0,
    totalRefundedVolume: 0,
    settlementsCreated: 0,
    settlementsConfirmed: 0,
    refundsConfirmed: 0,
    reconciliationsRun: 0,
    reconciliationsFailedOrMismatched: 0,
    totalSettlementDurationMs: 0,
    rentalObligationsCreated: 0,
    rentalObligationsSettled: 0,
    commissionsCreated: 0,
    commissionsSettled: 0,
  };

  async function isPrincipalAdmin(principal: AuthenticatedPrincipal): Promise<boolean> {
    const decision = await verifyAdminOrDelegatedPrincipal(
      principal,
      deps.adminStore,
      { primaryAdminEmails: deps.primaryAdminEmails },
    );
    return decision.allowed;
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
        targetCollection: 'transactionFinancialLedger',
        targetResourceId,
        outcome: 'SUCCESS',
        metadata,
      }),
    );
  }

  function isObligationVisibleToViewer(
    ob: FinancialObligationRecord,
    viewerUid: string,
    viewerRole: string,
    isAdmin: boolean,
  ): boolean {
    if (isAdmin) return true;
    if (ob.category === 'BROKER_COMMISSION') {
      return ob.payerUid === viewerUid || ob.payeeUid === viewerUid || viewerRole === 'BROKER';
    }
    return true;
  }

  return {
    async createObligation(params: {
      principal: AuthenticatedPrincipal;
      transactionId: string;
      rawInput: unknown;
      idempotencyKey: string;
      correlationId: string;
    }) {
      const validation = validateCreateObligationInput(params.rawInput);
      if (!validation.ok || !validation.value) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid obligation payload.', validation.issues);
      }
      const input = validation.value;
      const isAdmin = await isPrincipalAdmin(params.principal);

      return executeIdempotentMutation({
        store: idempotencyStore,
        actorUid: params.principal.uid,
        operation: 'ledger.obligation.create',
        idempotencyKey: params.idempotencyKey,
        requestPayload: { transactionId: params.transactionId, ...input },
        mutationFn: async () => {
          const ob = await runDurableTransaction(
            deps.txRunner,
            { operationName: 'ledger.obligation.create' },
            async (tx) =>
              executeCreateObligation({
                tx,
                transactionId: params.transactionId,
                actorUid: params.principal.uid,
                isAdmin,
                input,
                nowIso: nowIsoFn(),
              }),
          );
          analyticsAccumulator.totalObligationVolume = safeAddMonetary(
            analyticsAccumulator.totalObligationVolume,
            ob.amount,
          );
          analyticsAccumulator.outstandingObligationTotal = safeAddMonetary(
            analyticsAccumulator.outstandingObligationTotal,
            ob.amount,
          );
          await recordAudit(params.principal, params.correlationId, 'ledger.obligation.create', ob.obligationId, {
            transactionId: params.transactionId,
            category: ob.category,
            amount: ob.amount,
          });
          return { statusCode: 201, body: ob };
        },
      });
    },

    async updateObligation(params: {
      principal: AuthenticatedPrincipal;
      transactionId: string;
      obligationId: string;
      rawInput: unknown;
      idempotencyKey: string;
      correlationId: string;
    }) {
      const validation = validateUpdateObligationInput(params.rawInput);
      if (!validation.ok || !validation.value) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid obligation update payload.', validation.issues);
      }
      const input = validation.value;
      const isAdmin = await isPrincipalAdmin(params.principal);

      return executeIdempotentMutation({
        store: idempotencyStore,
        actorUid: params.principal.uid,
        operation: 'ledger.obligation.update',
        idempotencyKey: params.idempotencyKey,
        requestPayload: { transactionId: params.transactionId, obligationId: params.obligationId, ...input },
        mutationFn: async () => {
          const ob = await runDurableTransaction(
            deps.txRunner,
            { operationName: 'ledger.obligation.update' },
            async (tx) =>
              executeUpdateObligation({
                tx,
                transactionId: params.transactionId,
                obligationId: params.obligationId,
                actorUid: params.principal.uid,
                isAdmin,
                input,
                nowIso: nowIsoFn(),
              }),
          );
          await recordAudit(params.principal, params.correlationId, 'ledger.obligation.update', ob.obligationId, {
            status: ob.status,
          });
          return { statusCode: 200, body: ob };
        },
      });
    },

    async postLedgerEntryPair(params: {
      principal: AuthenticatedPrincipal;
      transactionId: string;
      rawInput: unknown;
      idempotencyKey: string;
      correlationId: string;
    }) {
      const validation = validateCreateLedgerPostingInput(params.rawInput);
      if (!validation.ok || !validation.value) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid ledger posting payload.', validation.issues);
      }
      const input = validation.value;
      const isAdmin = await isPrincipalAdmin(params.principal);

      return executeIdempotentMutation({
        store: idempotencyStore,
        actorUid: params.principal.uid,
        operation: 'ledger.entry.post',
        idempotencyKey: params.idempotencyKey,
        requestPayload: { transactionId: params.transactionId, ...input },
        mutationFn: async () => {
          const res = await runDurableTransaction(
            deps.txRunner,
            { operationName: 'ledger.entry.post' },
            async (tx) =>
              executePostLedgerPair({
                tx,
                transactionId: params.transactionId,
                actorUid: params.principal.uid,
                isAdmin,
                input,
                idempotencyReference: params.idempotencyKey,
                nowIso: nowIsoFn(),
              }),
          );
          await recordAudit(params.principal, params.correlationId, 'ledger.entry.post', res.postingGroupId, {
            amount: input.amount,
            entryType: input.entryType,
          });
          return { statusCode: 201, body: res };
        },
      });
    },

    async reverseLedgerPosting(params: {
      principal: AuthenticatedPrincipal;
      transactionId: string;
      rawInput: unknown;
      idempotencyKey: string;
      correlationId: string;
    }) {
      const validation = validateReverseLedgerPostingInput(params.rawInput);
      if (!validation.ok || !validation.value) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid ledger reversal payload.', validation.issues);
      }
      const input = validation.value;
      const isAdmin = await isPrincipalAdmin(params.principal);

      return executeIdempotentMutation({
        store: idempotencyStore,
        actorUid: params.principal.uid,
        operation: 'ledger.entry.reverse',
        idempotencyKey: params.idempotencyKey,
        requestPayload: { transactionId: params.transactionId, ...input },
        mutationFn: async () => {
          const res = await runDurableTransaction(
            deps.txRunner,
            { operationName: 'ledger.entry.reverse' },
            async (tx) =>
              executeReverseLedgerPostingGroup({
                tx,
                transactionId: params.transactionId,
                actorUid: params.principal.uid,
                isAdmin,
                input,
                nowIso: nowIsoFn(),
              }),
          );
          await recordAudit(params.principal, params.correlationId, 'ledger.entry.reverse', res.reversalPostingGroupId);
          return { statusCode: 200, body: res };
        },
      });
    },

    async createPaymentReference(params: {
      principal: AuthenticatedPrincipal;
      transactionId: string;
      rawInput: unknown;
      idempotencyKey: string;
      correlationId: string;
    }) {
      const validation = validateCreatePaymentReferenceInput(params.rawInput);
      if (!validation.ok || !validation.value) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid payment reference payload.', validation.issues);
      }
      const input = validation.value;
      const isAdmin = await isPrincipalAdmin(params.principal);

      return executeIdempotentMutation({
        store: idempotencyStore,
        actorUid: params.principal.uid,
        operation: 'ledger.payment_ref.create',
        idempotencyKey: params.idempotencyKey,
        requestPayload: { transactionId: params.transactionId, ...input },
        mutationFn: async () => {
          const pRef = await runDurableTransaction(
            deps.txRunner,
            { operationName: 'ledger.payment_ref.create' },
            async (tx) =>
              executeCreatePaymentReference({
                tx,
                transactionId: params.transactionId,
                actorUid: params.principal.uid,
                isAdmin,
                input,
                nowIso: nowIsoFn(),
              }),
          );
          return { statusCode: 201, body: pRef };
        },
      });
    },

    async updatePaymentReferenceStatus(params: {
      principal: AuthenticatedPrincipal;
      transactionId: string;
      paymentRefId: string;
      rawInput: unknown;
      idempotencyKey: string;
      correlationId: string;
      webhookSecretHeader?: string;
    }) {
      const validation = validateUpdatePaymentReferenceInput(params.rawInput);
      if (!validation.ok || !validation.value) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid payment status payload.', validation.issues);
      }
      const input = validation.value;
      const isAdmin = await isPrincipalAdmin(params.principal);
      const isTrustedProviderWebhook = Boolean(
        params.webhookSecretHeader &&
          deps.trustedWebhookSecrets &&
          deps.trustedWebhookSecrets.includes(params.webhookSecretHeader),
      );

      return executeIdempotentMutation({
        store: idempotencyStore,
        actorUid: params.principal.uid,
        operation: 'ledger.payment_ref.update',
        idempotencyKey: params.idempotencyKey,
        requestPayload: { transactionId: params.transactionId, paymentRefId: params.paymentRefId, ...input },
        mutationFn: async () => {
          const pRef = await runDurableTransaction(
            deps.txRunner,
            { operationName: 'ledger.payment_ref.update' },
            async (tx) =>
              executeUpdatePaymentReferenceStatus({
                tx,
                transactionId: params.transactionId,
                paymentRefId: params.paymentRefId,
                actorUid: params.principal.uid,
                isAdmin,
                isTrustedProviderWebhook,
                input,
                nowIso: nowIsoFn(),
              }),
          );
          await recordAudit(params.principal, params.correlationId, 'ledger.payment_ref.update', pRef.paymentRefId, {
            status: pRef.status,
          });
          return { statusCode: 200, body: pRef };
        },
      });
    },

    async createSettlement(params: {
      principal: AuthenticatedPrincipal;
      transactionId: string;
      rawInput: unknown;
      idempotencyKey: string;
      correlationId: string;
    }) {
      const validation = validateCreateSettlementInput(params.rawInput);
      if (!validation.ok || !validation.value) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid settlement payload.', validation.issues);
      }
      const input = validation.value;
      const isAdmin = await isPrincipalAdmin(params.principal);

      return executeIdempotentMutation({
        store: idempotencyStore,
        actorUid: params.principal.uid,
        operation: 'ledger.settlement.create',
        idempotencyKey: params.idempotencyKey,
        requestPayload: { transactionId: params.transactionId, ...input },
        mutationFn: async () => {
          const stl = await runDurableTransaction(
            deps.txRunner,
            { operationName: 'ledger.settlement.create' },
            async (tx) =>
              executeCreateSettlement({
                tx,
                transactionId: params.transactionId,
                actorUid: params.principal.uid,
                isAdmin,
                input,
                nowIso: nowIsoFn(),
              }),
          );
          analyticsAccumulator.settlementsCreated += 1;
          await recordAudit(params.principal, params.correlationId, 'ledger.settlement.create', stl.settlementId, {
            totalAmount: stl.totalAmount,
          });
          return { statusCode: 201, body: stl };
        },
      });
    },

    async performSettlementAction(params: {
      principal: AuthenticatedPrincipal;
      transactionId: string;
      settlementId: string;
      rawInput: unknown;
      idempotencyKey: string;
      correlationId: string;
      webhookSecretHeader?: string;
    }) {
      const validation = validateSettlementActionInput(params.rawInput);
      if (!validation.ok || !validation.value) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid settlement action payload.', validation.issues);
      }
      const input = validation.value;
      const isAdmin = await isPrincipalAdmin(params.principal);
      const isTrustedProviderWebhook = Boolean(
        params.webhookSecretHeader &&
          deps.trustedWebhookSecrets &&
          deps.trustedWebhookSecrets.includes(params.webhookSecretHeader),
      );

      return executeIdempotentMutation({
        store: idempotencyStore,
        actorUid: params.principal.uid,
        operation: 'ledger.settlement.action',
        idempotencyKey: params.idempotencyKey,
        requestPayload: { transactionId: params.transactionId, settlementId: params.settlementId, ...input },
        mutationFn: async () => {
          const stl = await runDurableTransaction(
            deps.txRunner,
            { operationName: 'ledger.settlement.action' },
            async (tx) =>
              executeSettlementAction({
                tx,
                transactionId: params.transactionId,
                settlementId: params.settlementId,
                actorUid: params.principal.uid,
                isAdmin,
                isTrustedProviderWebhook,
                input,
                nowIso: nowIsoFn(),
              }),
          );
          if (input.action === 'CONFIRM') {
            analyticsAccumulator.settlementsConfirmed += 1;
            analyticsAccumulator.totalSettledVolume = safeAddMonetary(
              analyticsAccumulator.totalSettledVolume,
              stl.confirmedAmount,
            );
            if (stl.confirmedAmount <= analyticsAccumulator.outstandingObligationTotal) {
              analyticsAccumulator.outstandingObligationTotal -= stl.confirmedAmount;
            }
          }
          await recordAudit(params.principal, params.correlationId, `ledger.settlement.${input.action.toLowerCase()}`, stl.settlementId, {
            status: stl.status,
            confirmedAmount: stl.confirmedAmount,
          });
          return { statusCode: 200, body: stl };
        },
      });
    },

    async createRefund(params: {
      principal: AuthenticatedPrincipal;
      transactionId: string;
      rawInput: unknown;
      idempotencyKey: string;
      correlationId: string;
    }) {
      const validation = validateCreateRefundInput(params.rawInput);
      if (!validation.ok || !validation.value) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid refund payload.', validation.issues);
      }
      const input = validation.value;
      const isAdmin = await isPrincipalAdmin(params.principal);

      return executeIdempotentMutation({
        store: idempotencyStore,
        actorUid: params.principal.uid,
        operation: 'ledger.refund.create',
        idempotencyKey: params.idempotencyKey,
        requestPayload: { transactionId: params.transactionId, ...input },
        mutationFn: async () => {
          const rfd = await runDurableTransaction(
            deps.txRunner,
            { operationName: 'ledger.refund.create' },
            async (tx) =>
              executeCreateAndConfirmRefund({
                tx,
                transactionId: params.transactionId,
                actorUid: params.principal.uid,
                isAdmin,
                input,
                nowIso: nowIsoFn(),
              }),
          );
          await recordAudit(params.principal, params.correlationId, 'ledger.refund.create', rfd.refundId, {
            amount: rfd.amount,
          });
          return { statusCode: 201, body: rfd };
        },
      });
    },

    async decideRefund(params: {
      principal: AuthenticatedPrincipal;
      transactionId: string;
      refundId: string;
      rawInput: unknown;
      idempotencyKey: string;
      correlationId: string;
      webhookSecretHeader?: string;
    }) {
      const validation = validateRefundDecisionInput(params.rawInput);
      if (!validation.ok || !validation.value) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid refund decision payload.', validation.issues);
      }
      const input = validation.value;
      const isAdmin = await isPrincipalAdmin(params.principal);
      const isTrustedProviderWebhook = Boolean(
        params.webhookSecretHeader &&
          deps.trustedWebhookSecrets &&
          deps.trustedWebhookSecrets.includes(params.webhookSecretHeader),
      );

      return executeIdempotentMutation({
        store: idempotencyStore,
        actorUid: params.principal.uid,
        operation: 'ledger.refund.decide',
        idempotencyKey: params.idempotencyKey,
        requestPayload: { transactionId: params.transactionId, refundId: params.refundId, ...input },
        mutationFn: async () => {
          const rfd = await runDurableTransaction(
            deps.txRunner,
            { operationName: 'ledger.refund.decide' },
            async (tx) =>
              executeRefundDecision({
                tx,
                transactionId: params.transactionId,
                refundId: params.refundId,
                actorUid: params.principal.uid,
                isAdmin,
                isTrustedProviderWebhook,
                input,
                nowIso: nowIsoFn(),
              }),
          );
          if (input.action === 'CONFIRM') {
            analyticsAccumulator.refundsConfirmed += 1;
            analyticsAccumulator.totalRefundedVolume = safeAddMonetary(
              analyticsAccumulator.totalRefundedVolume,
              rfd.amount,
            );
          }
          await recordAudit(params.principal, params.correlationId, `ledger.refund.${input.action.toLowerCase()}`, rfd.refundId, {
            status: rfd.status,
          });
          return { statusCode: 200, body: rfd };
        },
      });
    },

    async generateRentalSchedule(params: {
      principal: AuthenticatedPrincipal;
      transactionId: string;
      rawInput: unknown;
      idempotencyKey: string;
      correlationId: string;
    }) {
      const validation = validateGenerateRentalScheduleInput(params.rawInput);
      if (!validation.ok || !validation.value) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid rental schedule payload.', validation.issues);
      }
      const input = validation.value;
      const isAdmin = await isPrincipalAdmin(params.principal);

      return executeIdempotentMutation({
        store: idempotencyStore,
        actorUid: params.principal.uid,
        operation: 'ledger.rental_schedule.generate',
        idempotencyKey: params.idempotencyKey,
        requestPayload: { transactionId: params.transactionId, ...input },
        mutationFn: async () => {
          const res = await runDurableTransaction(
            deps.txRunner,
            { operationName: 'ledger.rental_schedule.generate' },
            async (tx) =>
              executeGenerateRentalSchedule({
                tx,
                transactionId: params.transactionId,
                actorUid: params.principal.uid,
                isAdmin,
                input,
                nowIso: nowIsoFn(),
              }),
          );
          analyticsAccumulator.rentalObligationsCreated += res.obligations.length;
          await recordAudit(params.principal, params.correlationId, 'ledger.rental_schedule.generate', res.schedule.scheduleId, {
            installmentCount: res.schedule.installmentCount,
          });
          return { statusCode: 201, body: res };
        },
      });
    },

    async createCommission(params: {
      principal: AuthenticatedPrincipal;
      transactionId: string;
      rawInput: unknown;
      idempotencyKey: string;
      correlationId: string;
    }) {
      const validation = validateCreateCommissionInput(params.rawInput);
      if (!validation.ok || !validation.value) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid commission payload.', validation.issues);
      }
      const input = validation.value;
      const isAdmin = await isPrincipalAdmin(params.principal);

      return executeIdempotentMutation({
        store: idempotencyStore,
        actorUid: params.principal.uid,
        operation: 'ledger.commission.create',
        idempotencyKey: params.idempotencyKey,
        requestPayload: { transactionId: params.transactionId, ...input },
        mutationFn: async () => {
          const res = await runDurableTransaction(
            deps.txRunner,
            { operationName: 'ledger.commission.create' },
            async (tx) =>
              executeCreateCommission({
                tx,
                transactionId: params.transactionId,
                actorUid: params.principal.uid,
                isAdmin,
                input,
                nowIso: nowIsoFn(),
              }),
          );
          analyticsAccumulator.commissionsCreated += 1;
          await recordAudit(params.principal, params.correlationId, 'ledger.commission.create', res.commission.commissionId, {
            calculatedAmount: res.commission.calculatedCommissionAmount,
          });
          return { statusCode: 201, body: res };
        },
      });
    },

    async initiateFinancialDispute(params: {
      principal: AuthenticatedPrincipal;
      transactionId: string;
      rawInput: unknown;
      idempotencyKey: string;
      correlationId: string;
    }) {
      const validation = validateCreateFinancialDisputeInput(params.rawInput);
      if (!validation.ok || !validation.value) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid financial dispute payload.', validation.issues);
      }
      const input = validation.value;
      const isAdmin = await isPrincipalAdmin(params.principal);

      return executeIdempotentMutation({
        store: idempotencyStore,
        actorUid: params.principal.uid,
        operation: 'ledger.dispute.initiate',
        idempotencyKey: params.idempotencyKey,
        requestPayload: { transactionId: params.transactionId, ...input },
        mutationFn: async () => {
          const dispute = await runDurableTransaction(
            deps.txRunner,
            { operationName: 'ledger.dispute.initiate' },
            async (tx) =>
              executeCreateFinancialDispute({
                tx,
                transactionId: params.transactionId,
                actorUid: params.principal.uid,
                isAdmin,
                input,
                nowIso: nowIsoFn(),
              }),
          );
          await recordAudit(params.principal, params.correlationId, 'ledger.dispute.initiate', dispute.financialDisputeId, {
            disputedAmount: dispute.disputedAmount,
          });
          return { statusCode: 201, body: dispute };
        },
      });
    },

    async resolveFinancialDispute(params: {
      principal: AuthenticatedPrincipal;
      transactionId: string;
      financialDisputeId: string;
      rawInput: unknown;
      idempotencyKey: string;
      correlationId: string;
    }) {
      const validation = validateResolveFinancialDisputeInput(params.rawInput);
      if (!validation.ok || !validation.value) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid financial dispute resolution payload.', validation.issues);
      }
      const input = validation.value;
      const isAdmin = await isPrincipalAdmin(params.principal);
      if (!isAdmin) {
        throw new CoreApiError('FORBIDDEN', 403, 'Only an authorized administrator can resolve a financial dispute.');
      }

      return executeIdempotentMutation({
        store: idempotencyStore,
        actorUid: params.principal.uid,
        operation: 'ledger.dispute.resolve',
        idempotencyKey: params.idempotencyKey,
        requestPayload: { transactionId: params.transactionId, financialDisputeId: params.financialDisputeId, ...input },
        mutationFn: async () => {
          const dispute = await runDurableTransaction(
            deps.txRunner,
            { operationName: 'ledger.dispute.resolve' },
            async (tx) =>
              executeResolveFinancialDispute({
                tx,
                transactionId: params.transactionId,
                financialDisputeId: params.financialDisputeId,
                adminUid: params.principal.uid,
                input,
                nowIso: nowIsoFn(),
              }),
          );
          await recordAudit(params.principal, params.correlationId, 'ledger.dispute.resolve', dispute.financialDisputeId, {
            status: dispute.status,
          });
          return { statusCode: 200, body: dispute };
        },
      });
    },

    async reconcileTransactionLedger(params: {
      principal: AuthenticatedPrincipal;
      transactionId: string;
      correlationId: string;
    }): Promise<ReconciliationReportRecord> {
      const isAdmin = await isPrincipalAdmin(params.principal);
      const nowIso = nowIsoFn();
      const report = await runDurableTransaction(
        deps.txRunner,
        { operationName: 'ledger.reconcile' },
        async (tx) => {
          const { txDoc, finIndex } = await loadTransactionAndVerifyFinancialParticipant(
            tx,
            params.transactionId,
            params.principal.uid,
            isAdmin,
          );

          const obligations: FinancialObligationRecord[] = [];
          for (const id of finIndex.obligationIds) {
            const s = await tx.get<FinancialObligationRecord>(`transactionObligations/${id}`);
            if (s.exists && s.data) obligations.push(s.data);
          }

          const ledgerEntries: FinancialLedgerEntryRecord[] = [];
          for (const id of finIndex.ledgerEntryIds) {
            const s = await tx.get<FinancialLedgerEntryRecord>(`transactionLedgerEntries/${id}`);
            if (s.exists && s.data) ledgerEntries.push(s.data);
          }

          const paymentRefs: PaymentStatusReferenceRecord[] = [];
          for (const id of finIndex.paymentRefIds) {
            const s = await tx.get<PaymentStatusReferenceRecord>(`transactionPaymentRefs/${id}`);
            if (s.exists && s.data) paymentRefs.push(s.data);
          }

          const settlements: TransactionSettlementRecord[] = [];
          for (const id of finIndex.settlementIds) {
            const s = await tx.get<TransactionSettlementRecord>(`transactionSettlements/${id}`);
            if (s.exists && s.data) settlements.push(s.data);
          }

          const refunds: TransactionRefundRecord[] = [];
          for (const id of finIndex.refundIds) {
            const s = await tx.get<TransactionRefundRecord>(`transactionRefunds/${id}`);
            if (s.exists && s.data) refunds.push(s.data);
          }

          const financialDisputes: FinancialDisputeRecord[] = [];
          for (const id of finIndex.financialDisputeIds) {
            const s = await tx.get<FinancialDisputeRecord>(`transactionFinancialDisputes/${id}`);
            if (s.exists && s.data) financialDisputes.push(s.data);
          }

          const reportId = `rcp_${params.transactionId}_${randomUUID().slice(0, 8)}`;
          const recReport = runTransactionFinancialReconciliation({
            reportId,
            transactionId: params.transactionId,
            currency: txDoc.monetary.currency,
            obligations,
            ledgerEntries,
            paymentRefs,
            settlements,
            refunds,
            financialDisputes,
            actorUid: params.principal.uid,
            nowIso,
          });

          tx.set(`transactionReconciliations/${reportId}`, recReport);
          finIndex.reconciliationReportIds.push(reportId);
          finIndex.lastReconciliationStatus = recReport.status;
          appendFinancialHistoryEvent(tx, finIndex, {
            eventType: 'RECONCILIATION_EXECUTED',
            actorUid: params.principal.uid,
            summary: `Reconciliation "${reportId}" completed with status "${recReport.status}" (${recReport.discrepancies.length} discrepancies).`,
            metadata: { reportId, status: recReport.status, discrepancies: recReport.discrepancies.length },
            nowIso,
          });
          saveFinancialIndex(tx, finIndex);
          return recReport;
        },
      );

      analyticsAccumulator.reconciliationsRun += 1;
      if (report.status === 'FAILED' || report.status === 'MISMATCH') {
        analyticsAccumulator.reconciliationsFailedOrMismatched += 1;
      }
      await recordAudit(params.principal, params.correlationId, 'ledger.reconcile', report.reportId, {
        status: report.status,
        discrepancies: report.discrepancies.length,
      });
      return report;
    },

    async getFinancialSummaryAndRecords(params: {
      principal: AuthenticatedPrincipal;
      transactionId: string;
    }): Promise<{
      summary: TransactionFinancialSummary;
      obligations: FinancialObligationRecord[];
      ledgerEntries: Array<Omit<FinancialLedgerEntryRecord, 'idempotencyReference'>>;
      paymentReferences: PaymentStatusReferenceRecord[];
      settlements: TransactionSettlementRecord[];
      refunds: TransactionRefundRecord[];
      rentalSchedules: RentalSchedulePlanRecord[];
      commissions: CommissionAgreementRecord[];
      financialDisputes: FinancialDisputeRecord[];
      history: FinancialHistoryEventRecord[];
    }> {
      const isAdmin = await isPrincipalAdmin(params.principal);
      return runDurableTransaction(
        deps.txRunner,
        { operationName: 'ledger.summary.get' },
        async (tx) => {
          const { txDoc, actorParticipant, finIndex } = await loadTransactionAndVerifyFinancialParticipant(
            tx,
            params.transactionId,
            params.principal.uid,
            isAdmin,
          );
          const viewerRole = isAdmin ? 'ADMIN' : actorParticipant!.role;

          const allObligations: FinancialObligationRecord[] = [];
          for (const id of finIndex.obligationIds) {
            const s = await tx.get<FinancialObligationRecord>(`transactionObligations/${id}`);
            if (s.exists && s.data) allObligations.push(s.data);
          }

          const visibleObligations = allObligations.filter((o) =>
            isObligationVisibleToViewer(o, params.principal.uid, viewerRole, isAdmin),
          );

          const rawLedgerEntries: FinancialLedgerEntryRecord[] = [];
          for (const id of finIndex.ledgerEntryIds) {
            const s = await tx.get<FinancialLedgerEntryRecord>(`transactionLedgerEntries/${id}`);
            if (s.exists && s.data) rawLedgerEntries.push(s.data);
          }

          const paymentReferences: PaymentStatusReferenceRecord[] = [];
          for (const id of finIndex.paymentRefIds) {
            const s = await tx.get<PaymentStatusReferenceRecord>(`transactionPaymentRefs/${id}`);
            if (s.exists && s.data) paymentReferences.push(s.data);
          }

          const settlements: TransactionSettlementRecord[] = [];
          for (const id of finIndex.settlementIds) {
            const s = await tx.get<TransactionSettlementRecord>(`transactionSettlements/${id}`);
            if (s.exists && s.data) settlements.push(s.data);
          }

          const refunds: TransactionRefundRecord[] = [];
          for (const id of finIndex.refundIds) {
            const s = await tx.get<TransactionRefundRecord>(`transactionRefunds/${id}`);
            if (s.exists && s.data) refunds.push(s.data);
          }

          const rentalSchedules: RentalSchedulePlanRecord[] = [];
          for (const id of finIndex.rentalScheduleIds) {
            const s = await tx.get<RentalSchedulePlanRecord>(`transactionRentalSchedules/${id}`);
            if (s.exists && s.data) rentalSchedules.push(s.data);
          }

          const allCommissions: CommissionAgreementRecord[] = [];
          for (const id of finIndex.commissionIds) {
            const s = await tx.get<CommissionAgreementRecord>(`transactionCommissions/${id}`);
            if (s.exists && s.data) allCommissions.push(s.data);
          }
          const visibleCommissions = allCommissions.filter(
            (c) =>
              isAdmin ||
              c.brokerUid === params.principal.uid ||
              c.payerUid === params.principal.uid ||
              viewerRole === 'BROKER',
          );

          const financialDisputes: FinancialDisputeRecord[] = [];
          for (const id of finIndex.financialDisputeIds) {
            const s = await tx.get<FinancialDisputeRecord>(`transactionFinancialDisputes/${id}`);
            if (s.exists && s.data) financialDisputes.push(s.data);
          }

          const history: FinancialHistoryEventRecord[] = [];
          for (const id of finIndex.historyEventIds) {
            const s = await tx.get<FinancialHistoryEventRecord>(`transactionFinancialHistory/${id}`);
            if (s.exists && s.data) history.push(s.data);
          }

          const ledgerBalance = validateLedgerEntriesBalance(
            rawLedgerEntries,
            params.transactionId,
            txDoc.monetary.currency,
          );

          let totalObligationAmount = 0;
          let totalSettledAmount = 0;
          let totalRefundedAmount = 0;
          let outstandingBalance = 0;
          let disputedAmount = 0;
          let settledObligationCount = 0;
          let overdueObligationCount = 0;

          for (const ob of visibleObligations) {
            if (ob.status !== 'CANCELLED') {
              totalObligationAmount = safeAddMonetary(totalObligationAmount, ob.amount);
              totalSettledAmount = safeAddMonetary(totalSettledAmount, ob.settledAmount);
              totalRefundedAmount = safeAddMonetary(totalRefundedAmount, ob.refundedAmount);
              outstandingBalance = safeAddMonetary(
                outstandingBalance,
                computeObligationOutstandingBalance(ob),
              );
            }
            if (ob.status === 'SETTLED') settledObligationCount += 1;
            if (ob.status === 'OVERDUE') overdueObligationCount += 1;
            if (ob.status === 'DISPUTED') disputedAmount = safeAddMonetary(disputedAmount, ob.amount);
          }

          let refundableBalance = 0;
          for (const stl of settlements) {
            refundableBalance = safeAddMonetary(
              refundableBalance,
              computeSettlementRefundableBalance(stl, refunds),
            );
          }

          const sanitizedLedgerEntries = rawLedgerEntries
            .filter(
              (e) =>
                isAdmin ||
                e.financialCategory !== 'BROKER_COMMISSION' ||
                e.responsiblePartyUid === params.principal.uid ||
                e.beneficiaryUid === params.principal.uid ||
                viewerRole === 'BROKER',
            )
            .map(({ idempotencyReference: _idemp, ...safeEntry }) => safeEntry);

          const summary: TransactionFinancialSummary = {
            transactionId: params.transactionId,
            transactionType: txDoc.transactionType,
            transactionStatus: txDoc.status,
            currency: txDoc.monetary.currency,
            viewerRole,
            totalObligationAmount,
            totalSettledAmount,
            totalRefundedAmount,
            outstandingBalance,
            refundableBalance,
            disputedAmount,
            ledgerBalanced: ledgerBalance.balanced,
            totalPostedDebits: ledgerBalance.totalDebits,
            totalPostedCredits: ledgerBalance.totalCredits,
            reconciliationStatus: finIndex.lastReconciliationStatus,
            obligationCount: visibleObligations.length,
            settledObligationCount,
            overdueObligationCount,
            activeFinancialDisputeCount: financialDisputes.filter(
              (d) => d.status === 'OPEN' || d.status === 'UNDER_REVIEW',
            ).length,
          };

          return {
            summary,
            obligations: visibleObligations,
            ledgerEntries: sanitizedLedgerEntries,
            paymentReferences,
            settlements,
            refunds,
            rentalSchedules,
            commissions: visibleCommissions,
            financialDisputes,
            history,
          };
        },
      );
    },

    getFinancialAnalyticsSnapshot(): FinancialAnalyticsSnapshot {
      const a = analyticsAccumulator;
      const toRatio = (num: number, den: number) =>
        den === 0 ? 0 : Math.round((num / den) * 10000) / 10000;
      return {
        totalObligationVolume: a.totalObligationVolume,
        totalSettledVolume: a.totalSettledVolume,
        outstandingObligationTotal: a.outstandingObligationTotal,
        totalRefundedVolume: a.totalRefundedVolume,
        settlementCompletionRate: toRatio(a.settlementsConfirmed, a.settlementsCreated),
        refundRate: toRatio(a.refundsConfirmed, a.settlementsConfirmed),
        reconciliationFailureRate: toRatio(a.reconciliationsFailedOrMismatched, a.reconciliationsRun),
        averageSettlementDurationMs: 0,
        rentalPaymentCompletionRate: toRatio(a.rentalObligationsSettled, a.rentalObligationsCreated),
        commissionSettlementRate: toRatio(a.commissionsSettled, a.commissionsCreated),
      };
    },
  };
}
