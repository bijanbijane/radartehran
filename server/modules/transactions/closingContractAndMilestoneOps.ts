import crypto from 'crypto';
import {
  CoreApiError,
  runDurableTransaction,
  type AuthenticatedPrincipal,
  type TransactionContextLike,
} from '../core';
import type { OfferOpsHelpers } from './offerAndNegotiationOps';
import {
  assertExpectedTransactionVersion,
  assertTransactionNotSuspended,
  validateTransactionStateTransition,
  verifyParticipantPermission,
} from './stateMachineAndAuthz';
import {
  validateAttachContractInput,
  validateClosingOperationInput,
  validateUpdateContractStatusInput,
  validateUpdateMilestoneInput,
} from './validation';
import type {
  StoredTransactionDocument,
  TransactionClosingStateRecord,
  TransactionContractReferenceRecord,
  TransactionMilestoneRecord,
  TransactionsModuleDependencies,
} from './types';

export function createClosingContractAndMilestoneOps(
  deps: TransactionsModuleDependencies,
  helpers: OfferOpsHelpers,
) {
  const nowFn = deps.nowFn ?? (() => Date.now());

  return {
    async attachContractReference(params: {
      principal: AuthenticatedPrincipal;
      transactionId: string;
      rawBody: unknown;
      correlationId: string;
    }): Promise<{ contract: TransactionContractReferenceRecord; transactionStatus: StoredTransactionDocument['status']; transactionVersion: number }> {
      const nowMs = nowFn();
      const nowIso = new Date(nowMs).toISOString();
      const validation = validateAttachContractInput(params.rawBody, nowMs);
      if (!validation.ok || !validation.value) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid contract attachment payload.', validation.issues);
      }
      const input = validation.value;

      if (deps.mediaVerifier) {
        const mediaCheck = await deps.mediaVerifier(input.mediaObjectId, params.principal.uid);
        if (!mediaCheck.valid) {
          throw new CoreApiError(
            'FORBIDDEN',
            403,
            `Media object "${input.mediaObjectId}" is not valid, not owned/authorized, or quarantined.`,
          );
        }
        if (mediaCheck.sha256 && mediaCheck.sha256.toLowerCase() !== input.sha256Checksum.toLowerCase()) {
          throw new CoreApiError('VALIDATION_FAILED', 400, 'Contract media SHA-256 checksum mismatch.');
        }
      }

      const result = await runDurableTransaction(
        deps.txRunner,
        { operationName: 'transactions.attach_contract', maxAttempts: 3 },
        async (tx) => {
          const { txDoc, participants } = await helpers.loadTransactionAndParticipants(tx, params.transactionId);
          assertTransactionNotSuspended(txDoc, false);
          assertExpectedTransactionVersion(txDoc.version, input.expectedVersion, 'transactions.attach_contract');

          const actorPart = verifyParticipantPermission(participants, params.principal.uid, 'contract:manage');

          if (!['AGREEMENT_PENDING', 'CONTRACT_PENDING'].includes(txDoc.status)) {
            throw new CoreApiError(
              'CONFLICT',
              409,
              `Cannot attach or replace contract when transaction is in "${txDoc.status}" state.`,
            );
          }

          let version = 1;
          if (txDoc.activeContractId) {
            const prevPath = `transactionContracts/${params.transactionId}_${txDoc.activeContractId}`;
            const prevSnap = await tx.get<TransactionContractReferenceRecord>(prevPath);
            if (prevSnap.exists && prevSnap.data) {
              if (prevSnap.data.status === 'EXECUTED') {
                throw new CoreApiError(
                  'CONFLICT',
                  409,
                  'An executed contract cannot be replaced without administrative dispute intervention.',
                );
              }
              version = prevSnap.data.version + 1;
              tx.set(prevPath, {
                ...prevSnap.data,
                status: 'SUPERSEDED',
                updatedAtIso: nowIso,
              } as unknown as Record<string, unknown>);
            }
          }

          const contractId = `cnt_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
          const contract: TransactionContractReferenceRecord = {
            contractId,
            transactionId: params.transactionId,
            version,
            title: input.title,
            mediaObjectId: input.mediaObjectId,
            sha256Checksum: input.sha256Checksum.toLowerCase(),
            ...(input.officialTrackingCode ? { officialTrackingCode: input.officialTrackingCode } : {}),
            status: 'UNDER_REVIEW',
            uploadedByUid: params.principal.uid,
            signatures: [],
            ...(input.supersedesContractId ? { supersedesContractId: input.supersedesContractId } : {}),
            ...(input.expiresAtIso ? { expiresAtIso: input.expiresAtIso } : {}),
            createdAtIso: nowIso,
            updatedAtIso: nowIso,
          };

          const msPrepPath = `transactionMilestones/${params.transactionId}_ms_${params.transactionId}_contract_prepared`;
          const msPrepSnap = await tx.get<TransactionMilestoneRecord>(msPrepPath);
          if (msPrepSnap.exists && msPrepSnap.data) {
            tx.set(msPrepPath, {
              ...msPrepSnap.data,
              status: 'COMPLETED',
              completedAtIso: nowIso,
              completedByUid: params.principal.uid,
              updatedAtIso: nowIso,
            } as unknown as Record<string, unknown>);
          }

          const nextStatus = txDoc.status === 'AGREEMENT_PENDING' ? 'CONTRACT_PENDING' : txDoc.status;
          const nextVersion = txDoc.version + 1;
          const nextHistoryCount = helpers.appendHistoryInTx(tx, txDoc, {
            eventType: 'CONTRACT_ATTACHED',
            actorUid: params.principal.uid,
            actorRole: actorPart.role,
            fromStatus: txDoc.status,
            toStatus: nextStatus,
            summary: `Contract reference ${contractId} (v${version}) attached.`,
            metadata: { contractId, version, mediaObjectId: input.mediaObjectId },
            nowIso,
          });

          const updatedTx: StoredTransactionDocument = {
            ...txDoc,
            status: nextStatus,
            version: nextVersion,
            activeContractId: contractId,
            historyCount: nextHistoryCount,
            updatedAtIso: nowIso,
          };

          tx.set(
            `transactionContracts/${params.transactionId}_${contractId}`,
            contract as unknown as Record<string, unknown>,
          );
          tx.set(`transactions/${params.transactionId}`, updatedTx as unknown as Record<string, unknown>);

          return { contract, updatedTx };
        },
      );

      await helpers.emitNotification(
        params.transactionId,
        'transaction.contract_attached',
        result.updatedTx.activeParticipantUids.filter((u) => u !== params.principal.uid),
        params.principal.uid,
        `Contract document reference ${result.contract.contractId} attached to transaction ${params.transactionId}.`,
        nowIso,
      );

      return {
        contract: result.contract,
        transactionStatus: result.updatedTx.status,
        transactionVersion: result.updatedTx.version,
      };
    },

    async updateContractStatus(params: {
      principal: AuthenticatedPrincipal;
      transactionId: string;
      contractId: string;
      rawBody: unknown;
      correlationId: string;
    }): Promise<{ contract: TransactionContractReferenceRecord; transactionStatus: StoredTransactionDocument['status']; transactionVersion: number }> {
      const nowMs = nowFn();
      const nowIso = new Date(nowMs).toISOString();
      const validation = validateUpdateContractStatusInput(params.rawBody);
      if (!validation.ok || !validation.value) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid contract status update payload.', validation.issues);
      }
      const input = validation.value;

      const result = await runDurableTransaction(
        deps.txRunner,
        { operationName: 'transactions.update_contract', maxAttempts: 3 },
        async (tx) => {
          const { txDoc, participants } = await helpers.loadTransactionAndParticipants(tx, params.transactionId);
          assertTransactionNotSuspended(txDoc, false);
          assertExpectedTransactionVersion(txDoc.version, input.expectedVersion, 'transactions.update_contract');

          const actorPart = verifyParticipantPermission(participants, params.principal.uid, 'contract:manage');
          const contractPath = `transactionContracts/${params.transactionId}_${params.contractId}`;
          const cSnap = await tx.get<TransactionContractReferenceRecord>(contractPath);
          if (!cSnap.exists || !cSnap.data) {
            throw new CoreApiError('NOT_FOUND', 404, `Contract reference "${params.contractId}" not found.`);
          }
          const contract = cSnap.data;

          if (contract.status === 'SUPERSEDED' || contract.status === 'REVOKED') {
            throw new CoreApiError('CONFLICT', 409, `Cannot update contract in "${contract.status}" status.`);
          }

          const updatedSignatures = [...contract.signatures];
          if (input.recordPartySignature) {
            const existingIdx = updatedSignatures.findIndex((s) => s.partyUid === params.principal.uid);
            const sigEntry = {
              partyUid: params.principal.uid,
              role: actorPart.role,
              executionStatus: input.recordPartySignature.executionStatus,
              ...(input.recordPartySignature.externalRegistryRef
                ? { externalRegistryRef: input.recordPartySignature.externalRegistryRef }
                : {}),
              recordedAtIso: nowIso,
            };
            if (existingIdx >= 0) updatedSignatures[existingIdx] = sigEntry;
            else updatedSignatures.push(sigEntry);
          }

          const requiredRoles = txDoc.transactionType === 'SALE' ? ['BUYER', 'SELLER'] : ['LANDLORD', 'TENANT'];
          const executedRoles = new Set(
            updatedSignatures
              .filter((s) => s.executionStatus === 'ACKNOWLEDGED' || s.executionStatus === 'EXTERNAL_REGISTRY_RECORDED')
              .map((s) => s.role),
          );
          const allRequiredPartiesExecuted = requiredRoles.every((r) => executedRoles.has(r as any));

          let nextContractStatus = input.targetStatus ?? contract.status;
          if (input.recordPartySignature) {
            if (allRequiredPartiesExecuted) nextContractStatus = 'EXECUTED';
            else if (executedRoles.size > 0) nextContractStatus = 'PARTIALLY_SIGNED';
          }

          if (nextContractStatus === 'EXECUTED' && !allRequiredPartiesExecuted) {
            throw new CoreApiError(
              'CONFLICT',
              409,
              `Contract cannot be marked EXECUTED until both required parties (${requiredRoles.join(' & ')}) have recorded execution status.`,
            );
          }

          const updatedContract: TransactionContractReferenceRecord = {
            ...contract,
            status: nextContractStatus,
            signatures: updatedSignatures,
            updatedAtIso: nowIso,
          };

          let nextTxStatus = txDoc.status;
          if (nextContractStatus === 'EXECUTED' && txDoc.status === 'CONTRACT_PENDING') {
            const trCheck = validateTransactionStateTransition({
              txDoc,
              targetStatus: 'CONTRACT_SIGNED',
              actorRole: actorPart.role,
              viaWorkflowEngine: true,
              contractExecuted: true,
            });
            if (!trCheck.allowed) {
              throw new CoreApiError('CONFLICT', 409, trCheck.reason ?? 'Cannot transition to CONTRACT_SIGNED.');
            }
            nextTxStatus = 'CONTRACT_SIGNED';

            const msSignedPath = `transactionMilestones/${params.transactionId}_ms_${params.transactionId}_contract_signed`;
            const msSignedSnap = await tx.get<TransactionMilestoneRecord>(msSignedPath);
            if (msSignedSnap.exists && msSignedSnap.data) {
              tx.set(msSignedPath, {
                ...msSignedSnap.data,
                status: 'COMPLETED',
                completedAtIso: nowIso,
                completedByUid: params.principal.uid,
                updatedAtIso: nowIso,
              } as unknown as Record<string, unknown>);
            }
          }

          const nextVersion = txDoc.version + 1;
          const nextHistoryCount = helpers.appendHistoryInTx(tx, txDoc, {
            eventType: 'CONTRACT_STATUS_CHANGED',
            actorUid: params.principal.uid,
            actorRole: actorPart.role,
            fromStatus: txDoc.status,
            toStatus: nextTxStatus,
            summary: `Contract ${contract.contractId} status updated to ${nextContractStatus}.`,
            metadata: { contractId: contract.contractId, contractStatus: nextContractStatus },
            nowIso,
          });

          const updatedTx: StoredTransactionDocument = {
            ...txDoc,
            status: nextTxStatus,
            version: nextVersion,
            historyCount: nextHistoryCount,
            updatedAtIso: nowIso,
          };

          tx.set(contractPath, updatedContract as unknown as Record<string, unknown>);
          tx.set(`transactions/${params.transactionId}`, updatedTx as unknown as Record<string, unknown>);

          return { contract: updatedContract, updatedTx };
        },
      );

      await helpers.emitNotification(
        params.transactionId,
        'transaction.contract_status_changed',
        result.updatedTx.activeParticipantUids.filter((u) => u !== params.principal.uid),
        params.principal.uid,
        `Contract ${result.contract.contractId} is now ${result.contract.status}.`,
        nowIso,
      );

      return {
        contract: result.contract,
        transactionStatus: result.updatedTx.status,
        transactionVersion: result.updatedTx.version,
      };
    },

    async updateMilestone(params: {
      principal: AuthenticatedPrincipal;
      transactionId: string;
      rawBody: unknown;
      correlationId: string;
    }): Promise<{ milestone: TransactionMilestoneRecord; transactionVersion: number }> {
      const nowMs = nowFn();
      const nowIso = new Date(nowMs).toISOString();
      const validation = validateUpdateMilestoneInput(params.rawBody);
      if (!validation.ok || !validation.value) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid milestone update payload.', validation.issues);
      }
      const input = validation.value;

      const result = await runDurableTransaction(
        deps.txRunner,
        { operationName: 'transactions.update_milestone', maxAttempts: 3 },
        async (tx) => {
          const { txDoc, participants } = await helpers.loadTransactionAndParticipants(tx, params.transactionId);
          assertTransactionNotSuspended(txDoc, false);
          assertExpectedTransactionVersion(txDoc.version, input.expectedVersion, 'transactions.update_milestone');

          const actorPart = verifyParticipantPermission(participants, params.principal.uid, 'milestone:update');
          const milestoneId = `ms_${params.transactionId}_${input.milestoneType.toLowerCase()}`;
          const msPath = `transactionMilestones/${params.transactionId}_${milestoneId}`;
          const msSnap = await tx.get<TransactionMilestoneRecord>(msPath);

          const existing: TransactionMilestoneRecord =
            msSnap.exists && msSnap.data
              ? msSnap.data
              : {
                  milestoneId,
                  transactionId: params.transactionId,
                  milestoneType: input.milestoneType,
                  required: input.required ?? false,
                  status: 'PENDING',
                  responsibleUid: params.principal.uid,
                  auditReferenceId: `aud_${crypto.randomUUID().slice(0, 12)}`,
                  updatedAtIso: nowIso,
                };

          const updatedMilestone: TransactionMilestoneRecord = {
            ...existing,
            status: input.status,
            ...(input.required !== undefined ? { required: input.required } : {}),
            ...(input.dueDateIso ? { dueDateIso: input.dueDateIso } : {}),
            ...(input.status === 'COMPLETED'
              ? { completedAtIso: nowIso, completedByUid: params.principal.uid }
              : {}),
            auditReferenceId: `aud_${crypto.randomUUID().slice(0, 12)}`,
            updatedAtIso: nowIso,
          };

          const nextVersion = txDoc.version + 1;
          const nextHistoryCount = helpers.appendHistoryInTx(tx, txDoc, {
            eventType: 'MILESTONE_UPDATED',
            actorUid: params.principal.uid,
            actorRole: actorPart.role,
            summary: `Milestone ${input.milestoneType} updated to ${input.status}.`,
            metadata: { milestoneType: input.milestoneType, status: input.status },
            nowIso,
          });

          const updatedTx: StoredTransactionDocument = {
            ...txDoc,
            version: nextVersion,
            historyCount: nextHistoryCount,
            updatedAtIso: nowIso,
          };

          tx.set(msPath, updatedMilestone as unknown as Record<string, unknown>);
          tx.set(`transactions/${params.transactionId}`, updatedTx as unknown as Record<string, unknown>);

          return { milestone: updatedMilestone, updatedTx };
        },
      );

      if (input.status === 'COMPLETED') {
        helpers.emitTelemetry(result.updatedTx, 'transaction_milestone_completed', { completed: 1 }, nowMs);
      }

      return { milestone: result.milestone, transactionVersion: result.updatedTx.version };
    },

    async executeClosingOperation(params: {
      principal: AuthenticatedPrincipal;
      transactionId: string;
      rawBody: unknown;
      correlationId: string;
    }): Promise<{ closing: TransactionClosingStateRecord; transactionStatus: StoredTransactionDocument['status']; transactionVersion: number }> {
      const nowMs = nowFn();
      const nowIso = new Date(nowMs).toISOString();
      const validation = validateClosingOperationInput(params.rawBody);
      if (!validation.ok || !validation.value) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid closing operation payload.', validation.issues);
      }
      const input = validation.value;

      const result = await runDurableTransaction(
        deps.txRunner,
        { operationName: `transactions.closing_${input.operation.toLowerCase()}`, maxAttempts: 3 },
        async (tx) => {
          const { txDoc, participants } = await helpers.loadTransactionAndParticipants(tx, params.transactionId);
          assertTransactionNotSuspended(txDoc, false);
          assertExpectedTransactionVersion(txDoc.version, input.expectedVersion, 'transactions.closing');

          const actorPart = verifyParticipantPermission(participants, params.principal.uid, 'closing:confirm');
          const closingPath = `transactionClosings/${params.transactionId}`;
          const cSnap = await tx.get<TransactionClosingStateRecord>(closingPath);

          if (input.operation === 'INITIATE') {
            if (txDoc.status !== 'CONTRACT_SIGNED') {
              throw new CoreApiError('CONFLICT', 409, 'Closing can only be initiated when transaction is in CONTRACT_SIGNED state.');
            }
            const initialClosing: TransactionClosingStateRecord = {
              transactionId: params.transactionId,
              status: 'IN_PROGRESS',
              initiatedByUid: params.principal.uid,
              initiatedAtIso: nowIso,
              checklistItems: {
                contractExecutedVerified: true,
                requiredMilestonesVerified: false,
                settlementReferenceVerified: false,
                handoverConfirmed: false,
              },
              confirmedByUids: [],
              settlementStatus: 'UNINITIATED',
              exceptions: [],
              updatedAtIso: nowIso,
            };
            const nextVersion = txDoc.version + 1;
            const nextHistoryCount = helpers.appendHistoryInTx(tx, txDoc, {
              eventType: 'CLOSING_INITIATED',
              actorUid: params.principal.uid,
              actorRole: actorPart.role,
              fromStatus: txDoc.status,
              toStatus: 'CLOSING',
              summary: 'Transaction closing workflow initiated.',
              nowIso,
            });
            const updatedTx: StoredTransactionDocument = {
              ...txDoc,
              status: 'CLOSING',
              version: nextVersion,
              historyCount: nextHistoryCount,
              updatedAtIso: nowIso,
            };
            tx.set(closingPath, initialClosing as unknown as Record<string, unknown>);
            tx.set(`transactions/${params.transactionId}`, updatedTx as unknown as Record<string, unknown>);
            return { closing: initialClosing, updatedTx };
          }

          if (!cSnap.exists || !cSnap.data) {
            throw new CoreApiError('CONFLICT', 409, 'Closing workflow has not been initiated yet.');
          }
          const currentClosing = cSnap.data;
          if (currentClosing.status === 'COMPLETED' || currentClosing.status === 'CANCELLED') {
            throw new CoreApiError('CONFLICT', 409, `Closing is already in terminal state "${currentClosing.status}".`);
          }

          let updatedClosing: TransactionClosingStateRecord = {
            ...currentClosing,
            checklistItems: { ...currentClosing.checklistItems },
            confirmedByUids: [...currentClosing.confirmedByUids],
            exceptions: [...currentClosing.exceptions],
            updatedAtIso: nowIso,
          };
          let nextTxStatus = txDoc.status;
          let historyType: 'CLOSING_CONFIRMED' | 'CLOSING_EXCEPTION_RECORDED' | 'CLOSING_COMPLETED' | 'CLOSING_CANCELLED' =
            'CLOSING_CONFIRMED';
          let summary = `Closing operation ${input.operation} executed.`;

          if (input.operation === 'RECORD_SETTLEMENT_REF') {
            if (!input.settlementReferenceId || !input.settlementStatus) {
              throw new CoreApiError('VALIDATION_FAILED', 400, 'settlementReferenceId and settlementStatus are required.');
            }
            if (updatedClosing.settlementStatus === 'CONFIRMED_BY_PARTIES' && input.settlementStatus === 'CONFIRMED_BY_PARTIES') {
              throw new CoreApiError('CONFLICT', 409, 'Settlement confirmation has already been recorded.');
            }
            updatedClosing.settlementReferenceId = input.settlementReferenceId;
            updatedClosing.settlementStatus = input.settlementStatus;
            updatedClosing.checklistItems.settlementReferenceVerified =
              input.settlementStatus === 'CONFIRMED_BY_PARTIES';
          } else if (input.operation === 'CONFIRM_PARTY') {
            if (!updatedClosing.confirmedByUids.includes(params.principal.uid)) {
              updatedClosing.confirmedByUids.push(params.principal.uid);
            }
            if (input.handoverConfirmed === true) {
              updatedClosing.checklistItems.handoverConfirmed = true;
            }
          } else if (input.operation === 'REPORT_EXCEPTION') {
            if (!input.exceptionCode || !input.exceptionDescription) {
              throw new CoreApiError('VALIDATION_FAILED', 400, 'exceptionCode and exceptionDescription are required.');
            }
            updatedClosing.exceptions.push({
              exceptionId: `exc_${crypto.randomUUID().slice(0, 10)}`,
              reportedByUid: params.principal.uid,
              code: input.exceptionCode,
              description: input.exceptionDescription,
              resolved: false,
              reportedAtIso: nowIso,
            });
            historyType = 'CLOSING_EXCEPTION_RECORDED';
          } else if (input.operation === 'RESOLVE_EXCEPTION') {
            const exc = updatedClosing.exceptions.find((e) => e.exceptionId === input.exceptionId);
            if (!exc) throw new CoreApiError('NOT_FOUND', 404, 'Closing exception not found.');
            exc.resolved = true;
            exc.resolvedAtIso = nowIso;
            exc.resolvedByUid = params.principal.uid;
          } else if (input.operation === 'CANCEL') {
            updatedClosing.status = 'CANCELLED';
            updatedClosing.cancelledAtIso = nowIso;
            updatedClosing.cancelledByUid = params.principal.uid;
            updatedClosing.cancellationReason = input.cancellationReason ?? 'Closing cancelled.';
            nextTxStatus = 'CANCELLED';
            historyType = 'CLOSING_CANCELLED';
            summary = 'Closing workflow cancelled.';
          } else if (input.operation === 'COMPLETE') {
            if (updatedClosing.exceptions.some((e) => !e.resolved)) {
              throw new CoreApiError('CONFLICT', 409, 'Cannot complete closing while unresolved exceptions exist.');
            }
            if (!updatedClosing.checklistItems.settlementReferenceVerified || !updatedClosing.settlementReferenceId) {
              throw new CoreApiError('CONFLICT', 409, 'Cannot complete closing without verified financial settlement reference.');
            }
            if (!updatedClosing.checklistItems.handoverConfirmed) {
              throw new CoreApiError('CONFLICT', 409, 'Cannot complete closing before property handover confirmation.');
            }
            const requiredRoles = txDoc.transactionType === 'SALE' ? ['BUYER', 'SELLER'] : ['LANDLORD', 'TENANT'];
            const confirmedRoles = new Set(
              participants
                .filter((p) => p.status === 'ACTIVE' && updatedClosing.confirmedByUids.includes(p.userId))
                .map((p) => p.role),
            );
            if (!requiredRoles.every((r) => confirmedRoles.has(r as any))) {
              throw new CoreApiError(
                'CONFLICT',
                409,
                `Both primary parties (${requiredRoles.join(' & ')}) must confirm closing before completion.`,
              );
            }

            updatedClosing.checklistItems.requiredMilestonesVerified = true;
            updatedClosing.status = 'COMPLETED';
            updatedClosing.completedAtIso = nowIso;
            updatedClosing.completedByUid = params.principal.uid;
            nextTxStatus = 'COMPLETED';
            historyType = 'CLOSING_COMPLETED';
            summary = 'Closing completed; transaction transitioned to COMPLETED.';
          }

          const nextVersion = txDoc.version + 1;
          const nextHistoryCount = helpers.appendHistoryInTx(tx, txDoc, {
            eventType: historyType,
            actorUid: params.principal.uid,
            actorRole: actorPart.role,
            fromStatus: txDoc.status,
            toStatus: nextTxStatus,
            summary,
            nowIso,
          });

          const updatedTx: StoredTransactionDocument = {
            ...txDoc,
            status: nextTxStatus,
            version: nextVersion,
            historyCount: nextHistoryCount,
            updatedAtIso: nowIso,
            ...(nextTxStatus === 'COMPLETED' ? { completedAtIso: nowIso } : {}),
            ...(nextTxStatus === 'CANCELLED'
              ? {
                  cancelledAtIso: nowIso,
                  cancelledByUid: params.principal.uid,
                  cancellationReason: updatedClosing.cancellationReason,
                }
              : {}),
          };

          tx.set(closingPath, updatedClosing as unknown as Record<string, unknown>);
          tx.set(`transactions/${params.transactionId}`, updatedTx as unknown as Record<string, unknown>);
          return { closing: updatedClosing, updatedTx };
        },
      );

      if (result.updatedTx.status === 'COMPLETED') {
        helpers.emitTelemetry(result.updatedTx, 'transaction_completed', { completed: 1 }, nowMs);
      }

      return {
        closing: result.closing,
        transactionStatus: result.updatedTx.status,
        transactionVersion: result.updatedTx.version,
      };
    },
  };
}
