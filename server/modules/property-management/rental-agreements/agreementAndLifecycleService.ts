import crypto from 'crypto';
import {
  CoreApiError,
  executeIdempotentMutation,
  runDurableTransaction,
  type AuthenticatedPrincipal,
  type IdempotencyStoreAdapter,
} from '../../core';
import type { PropertyManagementModuleDependencies } from '../contracts/externalAdapters';
import type { RentalAgreementRecord, RentalAgreementState } from '../domain/models';
import type {
  LeaseRenewalRequestRecord,
  LeaseTerminationWorkflowRecord,
} from '../domain/LifecycleAndReportingTypes';
import {
  appendToCollectionIndex,
  emitDomainNotificationEvent,
  nowTimestamp,
  recordManagementActivity,
  requireAuthenticatedVerifiedUser,
  verifyActorAuthorityForProperty,
  verifyMediaIdsIfSupplied,
} from '../repositories/durableStoreHelpers';
import {
  AGREEMENT_TYPES,
  assertPlainObjectWithNoUntrustedIdentity,
  PAYMENT_FREQUENCIES,
  requireCleanString,
  requireEnum,
  requireIdArray,
  requireIsoDateString,
  requireNonNegativeAmount,
  requireOptionalId,
  requireValidId,
} from '../schemas/validation';

const NON_LEGAL_CONTRACT_DISCLAIMER =
  'OPERATIONAL_RECORD_ONLY: Completeness of metadata or uploaded documents does not constitute legal contract execution, signature authentication, or statutory legal validity.';

export function createAgreementAndLifecycleService(
  deps: PropertyManagementModuleDependencies,
  idempotencyStore: IdempotencyStoreAdapter,
) {
  const nowMs = () => (deps.nowFn ? deps.nowFn() : Date.now());

  return {
    async createRentalAgreement(params: {
      principal: AuthenticatedPrincipal;
      idempotencyKey: string;
      correlationId: string;
      rawBody: unknown;
    }): Promise<{ agreement: RentalAgreementRecord; replayed: boolean }> {
      await requireAuthenticatedVerifiedUser(params.principal, deps);
      const body = assertPlainObjectWithNoUntrustedIdentity(params.rawBody);

      const propertyRefId = requireValidId(body.propertyRefId, 'propertyRefId');
      const portfolioId = requireOptionalId(body.portfolioId, 'portfolioId');
      const tenantUid = requireValidId(body.tenantUid, 'tenantUid');
      const relatedDealRefId = requireOptionalId(body.relatedDealRefId, 'relatedDealRefId');
      const agreementType = requireEnum(body.agreementType, 'agreementType', AGREEMENT_TYPES);
      const startDateIso = requireIsoDateString(body.startDateIso, 'startDateIso');
      const endDateIso = requireIsoDateString(body.endDateIso, 'endDateIso');
      const depositAmount = requireNonNegativeAmount(body.depositAmount, 'depositAmount', 0);
      const monthlyRentAmount = requireNonNegativeAmount(body.monthlyRentAmount, 'monthlyRentAmount', 0);
      const currency = requireEnum(body.currency ?? 'TOMAN', 'currency', ['IRT', 'TOMAN', 'IRR'] as const);
      const paymentFrequency = requireEnum(body.paymentFrequency ?? 'MONTHLY', 'paymentFrequency', PAYMENT_FREQUENCIES);
      const maxAuthorizedOccupants =
        body.maxAuthorizedOccupants !== undefined
          ? requireNonNegativeAmount(body.maxAuthorizedOccupants, 'maxAuthorizedOccupants', 1, 25)
          : 2;
      const renewalConditionsMetadata = requireCleanString(
        body.renewalConditionsMetadata ?? 'Subject to mutual written renewal agreement.',
        'renewalConditionsMetadata',
        3,
        600,
      );
      const terminationConditionsMetadata = requireCleanString(
        body.terminationConditionsMetadata ?? 'Subject to contractual notice and handover.',
        'terminationConditionsMetadata',
        3,
        600,
      );
      const documentMediaIds = requireIdArray(body.documentMediaIds, 'documentMediaIds');
      const externalContractReferenceCode =
        body.externalContractReferenceCode !== undefined
          ? requireCleanString(body.externalContractReferenceCode, 'externalContractReferenceCode', 3, 120)
          : undefined;

      if (Date.parse(endDateIso) <= Date.parse(startDateIso)) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'endDateIso must be after startDateIso.');
      }

      await verifyMediaIdsIfSupplied(deps, documentMediaIds, params.principal.uid);

      const outcome = await executeIdempotentMutation<RentalAgreementRecord>({
        store: idempotencyStore,
        actorUid: params.principal.uid,
        operation: 'pm.agreement.create',
        idempotencyKey: params.idempotencyKey,
        requestPayload: body,
        nowEpochMs: nowMs(),
        mutationFn: async () => {
          if (relatedDealRefId && deps.propertyTransactions) {
            const deal = await deps.propertyTransactions.getVerifiedDealReference(relatedDealRefId);
            if (!deal || deal.propertyRefId !== propertyRefId) {
              throw new CoreApiError(
                'VALIDATION_FAILED',
                400,
                `Related deal reference "${relatedDealRefId}" is invalid for property "${propertyRefId}".`,
              );
            }
          }

          const record = await runDurableTransaction(
            deps.txRunner,
            { operationName: 'pm.agreement.create', maxAttempts: 3 },
            async (tx) => {
              const authCtx = await verifyActorAuthorityForProperty({
                tx,
                deps,
                principal: params.principal,
                propertyRefId,
                requiredScope: 'LEASE_ADMINISTRATION',
                portfolioId,
                nowEpochMs: nowMs(),
              });

              const landlordUid = authCtx.propertySnapshot.verifiedOwnerUids[0] ?? params.principal.uid;
              const ts = nowTimestamp(deps);
              const agreementId = `pmagr_${crypto.randomBytes(6).toString('hex')}`;

              const docDistinction = externalContractReferenceCode
                ? 'EXTERNAL_OFFICIAL_CONTRACT_REFERENCE_LINKED'
                : documentMediaIds.length > 0
                  ? 'UPLOADED_DOCUMENT_NOT_LEGALLY_AUTHENTICATED'
                  : 'METADATA_ONLY_NO_DOCUMENT';

              const initialStatus: RentalAgreementState =
                body.initialStatus === 'PENDING_COMMENCEMENT' ? 'PENDING_COMMENCEMENT' : 'DRAFT';

              const agreementDoc: RentalAgreementRecord = {
                id: agreementId,
                propertyRefId,
                ...(authCtx.propertySnapshot.buildingRefId ? { buildingRefId: authCtx.propertySnapshot.buildingRefId } : {}),
                ...(authCtx.propertySnapshot.unitRefId ? { unitRefId: authCtx.propertySnapshot.unitRefId } : {}),
                ...(portfolioId ? { portfolioId } : {}),
                tenantUid,
                maxAuthorizedOccupants,
                landlordUid,
                authorizedRepresentativeUids:
                  authCtx.actorRole === 'AUTHORIZED_MANAGER' ? [params.principal.uid] : [],
                ...(relatedDealRefId ? { relatedDealRefId } : {}),
                agreementType,
                startDateIso,
                endDateIso,
                originalDepositAmount: depositAmount,
                originalMonthlyRentAmount: monthlyRentAmount,
                depositAmount,
                monthlyRentAmount,
                currency,
                paymentFrequency,
                renewalConditionsMetadata,
                terminationConditionsMetadata,
                documentMediaIds,
                ...(externalContractReferenceCode ? { externalContractReferenceCode } : {}),
                documentVerificationDistinction: docDistinction,
                legalValidityDisclaimer: NON_LEGAL_CONTRACT_DISCLAIMER,
                status: initialStatus,
                currentVersion: 1,
                versionHistory: [
                  {
                    versionNumber: 1,
                    depositAmount,
                    monthlyRentAmount,
                    currency,
                    paymentFrequency,
                    startDateIso,
                    endDateIso,
                    renewalConditionsMetadata,
                    terminationConditionsMetadata,
                    documentMediaIds,
                    ...(externalContractReferenceCode ? { externalContractReferenceCode } : {}),
                    amendedByUid: params.principal.uid,
                    amendmentReason: 'Initial rental agreement metadata creation',
                    createdAt: ts,
                  },
                ],
                revision: 1,
                createdAt: ts,
                updatedAt: ts,
              };

              tx.set(`pmRentalAgreements/${agreementId}`, agreementDoc as unknown as Record<string, unknown>);
              await appendToCollectionIndex(tx, `pmPropertyAgreementsIndex/${propertyRefId}`, agreementId);
              if (portfolioId) {
                await appendToCollectionIndex(tx, `pmPortfolioAgreementsIndex/${portfolioId}`, agreementId);
              }

              await recordManagementActivity({
                tx,
                deps,
                principal: params.principal,
                actorRole: authCtx.actorRole,
                portfolioId,
                propertyRefId,
                entityType: 'AGREEMENT',
                entityId: agreementId,
                action: 'agreement.created',
                summary: `Rental agreement ${agreementId} created in ${initialStatus} state.`,
                correlationId: params.correlationId,
                nowTs: ts,
              });

              return agreementDoc;
            },
          );
          return { statusCode: 201, body: record };
        },
      });

      return { agreement: outcome.body, replayed: outcome.replayed };
    },

    async activateOrTransitionAgreementState(params: {
      principal: AuthenticatedPrincipal;
      agreementId: string;
      targetStatus: RentalAgreementState;
      correlationId: string;
    }): Promise<RentalAgreementRecord> {
      await requireAuthenticatedVerifiedUser(params.principal, deps);
      const agreementId = requireValidId(params.agreementId, 'agreementId');

      return runDurableTransaction(
        deps.txRunner,
        { operationName: 'pm.agreement.transition', maxAttempts: 3 },
        async (tx) => {
          const snap = await tx.get<RentalAgreementRecord>(`pmRentalAgreements/${agreementId}`);
          if (!snap.exists || !snap.data) {
            throw new CoreApiError('NOT_FOUND', 404, `Rental agreement "${agreementId}" not found.`);
          }
          const agr = snap.data;

          const authCtx = await verifyActorAuthorityForProperty({
            tx,
            deps,
            principal: params.principal,
            propertyRefId: agr.propertyRefId,
            requiredScope: 'LEASE_ADMINISTRATION',
            portfolioId: agr.portfolioId,
            nowEpochMs: nowMs(),
          });

          const ts = nowTimestamp(deps);
          const updated: RentalAgreementRecord = {
            ...agr,
            status: params.targetStatus,
            revision: agr.revision + 1,
            updatedAt: ts,
          };
          tx.set(`pmRentalAgreements/${agreementId}`, updated as unknown as Record<string, unknown>);

          if (params.targetStatus === 'PENDING_COMMENCEMENT' || params.targetStatus === 'ACTIVE') {
            await emitDomainNotificationEvent({
              tx,
              deps,
              eventType: 'AGREEMENT_COMMENCEMENT_APPROACHING',
              recipientUid: agr.tenantUid,
              idempotencyKey: `commence_${agreementId}_${params.targetStatus}`,
              correlationId: params.correlationId,
              nowTs: ts,
              variables: {
                agreementId,
                propertyRefId: agr.propertyRefId,
                startDateIso: agr.startDateIso,
              },
            });
          }

          await recordManagementActivity({
            tx,
            deps,
            principal: params.principal,
            actorRole: authCtx.actorRole,
            portfolioId: agr.portfolioId,
            propertyRefId: agr.propertyRefId,
            entityType: 'AGREEMENT',
            entityId: agreementId,
            action: `agreement.status_${params.targetStatus.toLowerCase()}`,
            summary: `Agreement ${agreementId} transitioned to ${params.targetStatus}.`,
            correlationId: params.correlationId,
            nowTs: ts,
          });
          return updated;
        },
      );
    },

    async amendRentalAgreement(params: {
      principal: AuthenticatedPrincipal;
      agreementId: string;
      expectedRevision?: number;
      correlationId: string;
      rawBody: unknown;
    }): Promise<RentalAgreementRecord> {
      await requireAuthenticatedVerifiedUser(params.principal, deps);
      const agreementId = requireValidId(params.agreementId, 'agreementId');
      const body = assertPlainObjectWithNoUntrustedIdentity(params.rawBody);
      const amendmentReason = requireCleanString(body.amendmentReason, 'amendmentReason', 3, 400);

      return runDurableTransaction(
        deps.txRunner,
        { operationName: 'pm.agreement.amend', maxAttempts: 3 },
        async (tx) => {
          const snap = await tx.get<RentalAgreementRecord>(`pmRentalAgreements/${agreementId}`);
          if (!snap.exists || !snap.data) {
            throw new CoreApiError('NOT_FOUND', 404, `Rental agreement "${agreementId}" not found.`);
          }
          const agr = snap.data;

          if (params.expectedRevision !== undefined && agr.revision !== params.expectedRevision) {
            throw new CoreApiError(
              'CONFLICT',
              409,
              `Optimistic concurrency conflict on agreement "${agreementId}": expected revision ${params.expectedRevision}, found ${agr.revision}.`,
            );
          }

          await verifyActorAuthorityForProperty({
            tx,
            deps,
            principal: params.principal,
            propertyRefId: agr.propertyRefId,
            requiredScope: 'LEASE_ADMINISTRATION',
            portfolioId: agr.portfolioId,
            nowEpochMs: nowMs(),
          });

          const newDeposit =
            body.depositAmount !== undefined
              ? requireNonNegativeAmount(body.depositAmount, 'depositAmount', 0)
              : agr.depositAmount;
          const newRent =
            body.monthlyRentAmount !== undefined
              ? requireNonNegativeAmount(body.monthlyRentAmount, 'monthlyRentAmount', 0)
              : agr.monthlyRentAmount;
          const newEndDateIso =
            body.endDateIso !== undefined
              ? requireIsoDateString(body.endDateIso, 'endDateIso')
              : agr.endDateIso;
          const newDocIds =
            body.documentMediaIds !== undefined
              ? requireIdArray(body.documentMediaIds, 'documentMediaIds')
              : agr.documentMediaIds;

          await verifyMediaIdsIfSupplied(deps, newDocIds, params.principal.uid);

          const ts = nowTimestamp(deps);
          const nextVersion = agr.currentVersion + 1;

          // Section 8: Preserve originalDepositAmount & originalMonthlyRentAmount unchanged; append new version
          const updated: RentalAgreementRecord = {
            ...agr,
            depositAmount: newDeposit,
            monthlyRentAmount: newRent,
            endDateIso: newEndDateIso,
            documentMediaIds: newDocIds,
            currentVersion: nextVersion,
            versionHistory: [
              ...agr.versionHistory,
              {
                versionNumber: nextVersion,
                depositAmount: newDeposit,
                monthlyRentAmount: newRent,
                currency: agr.currency,
                paymentFrequency: agr.paymentFrequency,
                startDateIso: agr.startDateIso,
                endDateIso: newEndDateIso,
                renewalConditionsMetadata: agr.renewalConditionsMetadata,
                terminationConditionsMetadata: agr.terminationConditionsMetadata,
                documentMediaIds: newDocIds,
                ...(agr.externalContractReferenceCode
                  ? { externalContractReferenceCode: agr.externalContractReferenceCode }
                  : {}),
                amendedByUid: params.principal.uid,
                amendmentReason,
                createdAt: ts,
              },
            ],
            revision: agr.revision + 1,
            updatedAt: ts,
          };

          tx.set(`pmRentalAgreements/${agreementId}`, updated as unknown as Record<string, unknown>);
          return updated;
        },
      );
    },

    async requestLeaseRenewal(params: {
      principal: AuthenticatedPrincipal;
      agreementId: string;
      idempotencyKey: string;
      correlationId: string;
      rawBody: unknown;
    }): Promise<{ renewalRequest: LeaseRenewalRequestRecord; replayed: boolean }> {
      await requireAuthenticatedVerifiedUser(params.principal, deps);
      const agreementId = requireValidId(params.agreementId, 'agreementId');
      const body = assertPlainObjectWithNoUntrustedIdentity(params.rawBody);

      const proposedNewRent = requireNonNegativeAmount(body.proposedNewRent, 'proposedNewRent', 0);
      const proposedNewDeposit = requireNonNegativeAmount(body.proposedNewDeposit, 'proposedNewDeposit', 0);
      const proposedStartDateIso = requireIsoDateString(body.proposedStartDateIso, 'proposedStartDateIso');
      const proposedEndDateIso = requireIsoDateString(body.proposedEndDateIso, 'proposedEndDateIso');
      const revisedConditions = requireCleanString(
        body.revisedConditions ?? 'Standard renewal proposal',
        'revisedConditions',
        3,
        600,
      );

      const outcome = await executeIdempotentMutation<LeaseRenewalRequestRecord>({
        store: idempotencyStore,
        actorUid: params.principal.uid,
        operation: 'pm.renewal.request',
        idempotencyKey: params.idempotencyKey,
        requestPayload: { agreementId, ...body },
        nowEpochMs: nowMs(),
        mutationFn: async () => {
          const created = await runDurableTransaction(
            deps.txRunner,
            { operationName: 'pm.renewal.request', maxAttempts: 3 },
            async (tx) => {
              const snap = await tx.get<RentalAgreementRecord>(`pmRentalAgreements/${agreementId}`);
              if (!snap.exists || !snap.data) {
                throw new CoreApiError('NOT_FOUND', 404, `Agreement "${agreementId}" not found.`);
              }
              const agr = snap.data;

              let initiatorRole: 'LANDLORD' | 'TENANT' | 'AUTHORIZED_MANAGER' = 'TENANT';
              if (params.principal.uid === agr.tenantUid) {
                initiatorRole = 'TENANT';
              } else {
                const authCtx = await verifyActorAuthorityForProperty({
                  tx,
                  deps,
                  principal: params.principal,
                  propertyRefId: agr.propertyRefId,
                  requiredScope: 'LEASE_ADMINISTRATION',
                  portfolioId: agr.portfolioId,
                  nowEpochMs: nowMs(),
                });
                initiatorRole = authCtx.actorRole === 'OWNER' ? 'LANDLORD' : 'AUTHORIZED_MANAGER';
              }

              const ts = nowTimestamp(deps);
              const renewalId = `pmren_${crypto.randomBytes(6).toString('hex')}`;
              const renewalDoc: LeaseRenewalRequestRecord = {
                id: renewalId,
                agreementId,
                propertyRefId: agr.propertyRefId,
                initiatedByUid: params.principal.uid,
                initiatorRole,
                proposedNewRent,
                proposedNewDeposit,
                proposedStartDateIso,
                proposedEndDateIso,
                revisedConditions,
                status: 'PROPOSED',
                decisionHistory: [
                  {
                    status: 'PROPOSED',
                    actorUid: params.principal.uid,
                    occurredAt: ts,
                    note: revisedConditions,
                  },
                ],
                revision: 1,
                createdAt: ts,
                updatedAt: ts,
              };

              // Section 9: Distinguish renewal proposal from accepted renewal; do NOT overwrite active agreement financial terms yet
              tx.set(`pmRenewalRequests/${renewalId}`, renewalDoc as unknown as Record<string, unknown>);
              tx.set(`pmRentalAgreements/${agreementId}`, {
                ...agr,
                status: 'RENEWAL_PENDING',
                revision: agr.revision + 1,
                updatedAt: ts,
              });
              await appendToCollectionIndex(tx, `pmAgreementRenewalsIndex/${agreementId}`, renewalId);
              if (agr.portfolioId) {
                await appendToCollectionIndex(tx, `pmPortfolioRenewalsIndex/${agr.portfolioId}`, renewalId);
              }

              const recipientUid =
                initiatorRole === 'TENANT' ? agr.landlordUid : agr.tenantUid;
              await emitDomainNotificationEvent({
                tx,
                deps,
                eventType: 'RENEWAL_REQUESTED',
                recipientUid,
                idempotencyKey: `ren_req_${renewalId}`,
                correlationId: params.correlationId,
                nowTs: ts,
                variables: {
                  renewalId,
                  agreementId,
                  proposedNewRent,
                  proposedNewDeposit,
                },
              });

              return renewalDoc;
            },
          );
          return { statusCode: 201, body: created };
        },
      });

      return { renewalRequest: outcome.body, replayed: outcome.replayed };
    },

    async decideLeaseRenewal(params: {
      principal: AuthenticatedPrincipal;
      renewalId: string;
      decision: 'ACCEPTED' | 'REJECTED' | 'WITHDRAWN';
      decisionNote?: string;
      correlationId: string;
    }): Promise<{ renewalRequest: LeaseRenewalRequestRecord; agreement: RentalAgreementRecord }> {
      await requireAuthenticatedVerifiedUser(params.principal, deps);
      const renewalId = requireValidId(params.renewalId, 'renewalId');
      const decisionNote = params.decisionNote
        ? requireCleanString(params.decisionNote, 'decisionNote', 2, 400)
        : undefined;

      return runDurableTransaction(
        deps.txRunner,
        { operationName: 'pm.renewal.decide', maxAttempts: 3 },
        async (tx) => {
          const renSnap = await tx.get<LeaseRenewalRequestRecord>(`pmRenewalRequests/${renewalId}`);
          if (!renSnap.exists || !renSnap.data) {
            throw new CoreApiError('NOT_FOUND', 404, `Renewal request "${renewalId}" not found.`);
          }
          const ren = renSnap.data;
          if (ren.status !== 'PROPOSED') {
            throw new CoreApiError('CONFLICT', 409, `Renewal request "${renewalId}" is already ${ren.status}.`);
          }

          const agrSnap = await tx.get<RentalAgreementRecord>(`pmRentalAgreements/${ren.agreementId}`);
          if (!agrSnap.exists || !agrSnap.data) {
            throw new CoreApiError('NOT_FOUND', 404, `Agreement "${ren.agreementId}" not found.`);
          }
          const agr = agrSnap.data;

          if (params.decision === 'WITHDRAWN') {
            if (ren.initiatedByUid !== params.principal.uid) {
              throw new CoreApiError('FORBIDDEN', 403, 'Only the initiating party may withdraw a renewal proposal.');
            }
          } else if (ren.initiatorRole === 'TENANT') {
            await verifyActorAuthorityForProperty({
              tx,
              deps,
              principal: params.principal,
              propertyRefId: agr.propertyRefId,
              requiredScope: 'LEASE_ADMINISTRATION',
              portfolioId: agr.portfolioId,
              nowEpochMs: nowMs(),
            });
          } else if (params.principal.uid !== agr.tenantUid) {
            throw new CoreApiError(
              'FORBIDDEN',
              403,
              'Counterparty tenant must accept or reject a landlord/manager-initiated renewal.',
            );
          }

          const ts = nowTimestamp(deps);
          let nextAgreement = agr;
          let resultingVersion: number | undefined;

          if (params.decision === 'ACCEPTED') {
            resultingVersion = agr.currentVersion + 1;
            nextAgreement = {
              ...agr,
              depositAmount: ren.proposedNewDeposit,
              monthlyRentAmount: ren.proposedNewRent,
              startDateIso: ren.proposedStartDateIso,
              endDateIso: ren.proposedEndDateIso,
              renewalConditionsMetadata: ren.revisedConditions,
              status: 'ACTIVE',
              currentVersion: resultingVersion,
              versionHistory: [
                ...agr.versionHistory,
                {
                  versionNumber: resultingVersion,
                  depositAmount: ren.proposedNewDeposit,
                  monthlyRentAmount: ren.proposedNewRent,
                  currency: agr.currency,
                  paymentFrequency: agr.paymentFrequency,
                  startDateIso: ren.proposedStartDateIso,
                  endDateIso: ren.proposedEndDateIso,
                  renewalConditionsMetadata: ren.revisedConditions,
                  terminationConditionsMetadata: agr.terminationConditionsMetadata,
                  documentMediaIds: agr.documentMediaIds,
                  amendedByUid: params.principal.uid,
                  amendmentReason: `Accepted renewal request ${renewalId}`,
                  createdAt: ts,
                },
              ],
              revision: agr.revision + 1,
              updatedAt: ts,
            };
          } else {
            nextAgreement = {
              ...agr,
              status: 'ACTIVE',
              revision: agr.revision + 1,
              updatedAt: ts,
            };
          }

          const updatedRen: LeaseRenewalRequestRecord = {
            ...ren,
            status: params.decision,
            ...(resultingVersion ? { resultingAgreementVersion: resultingVersion } : {}),
            decidedByUid: params.principal.uid,
            decidedAt: ts,
            ...(decisionNote ? { decisionNote } : {}),
            decisionHistory: [
              ...ren.decisionHistory,
              {
                status: params.decision,
                actorUid: params.principal.uid,
                occurredAt: ts,
                ...(decisionNote ? { note: decisionNote } : {}),
              },
            ],
            revision: ren.revision + 1,
            updatedAt: ts,
          };

          tx.set(`pmRenewalRequests/${renewalId}`, updatedRen as unknown as Record<string, unknown>);
          tx.set(`pmRentalAgreements/${agr.id}`, nextAgreement as unknown as Record<string, unknown>);

          if (params.decision === 'ACCEPTED' || params.decision === 'REJECTED') {
            await emitDomainNotificationEvent({
              tx,
              deps,
              eventType: params.decision === 'ACCEPTED' ? 'RENEWAL_ACCEPTED' : 'RENEWAL_REJECTED',
              recipientUid: ren.initiatedByUid,
              idempotencyKey: `ren_dec_${renewalId}_${params.decision}`,
              correlationId: params.correlationId,
              nowTs: ts,
              variables: {
                renewalId,
                agreementId: agr.id,
                decision: params.decision,
              },
            });
          }

          return { renewalRequest: updatedRen, agreement: nextAgreement };
        },
      );
    },

    async recordLeaseTerminationWorkflow(params: {
      principal: AuthenticatedPrincipal;
      agreementId: string;
      idempotencyKey: string;
      correlationId: string;
      rawBody: unknown;
    }): Promise<{ termination: LeaseTerminationWorkflowRecord; replayed: boolean }> {
      await requireAuthenticatedVerifiedUser(params.principal, deps);
      const agreementId = requireValidId(params.agreementId, 'agreementId');
      const body = assertPlainObjectWithNoUntrustedIdentity(params.rawBody);

      const terminationReason = requireCleanString(body.terminationReason, 'terminationReason', 4, 500);
      const intendedTerminationDateIso = requireIsoDateString(
        body.intendedTerminationDateIso,
        'intendedTerminationDateIso',
      );
      const tenantNoticeRef = requireOptionalId(body.tenantNoticeRef, 'tenantNoticeRef');
      const landlordNoticeRef = requireOptionalId(body.landlordNoticeRef, 'landlordNoticeRef');
      const finalHandoverId = requireOptionalId(body.finalHandoverId, 'finalHandoverId');

      const outcome = await executeIdempotentMutation<LeaseTerminationWorkflowRecord>({
        store: idempotencyStore,
        actorUid: params.principal.uid,
        operation: 'pm.termination.record',
        idempotencyKey: params.idempotencyKey,
        requestPayload: { agreementId, ...body },
        nowEpochMs: nowMs(),
        mutationFn: async () => {
          const record = await runDurableTransaction(
            deps.txRunner,
            { operationName: 'pm.termination.record', maxAttempts: 3 },
            async (tx) => {
              const agrSnap = await tx.get<RentalAgreementRecord>(`pmRentalAgreements/${agreementId}`);
              if (!agrSnap.exists || !agrSnap.data) {
                throw new CoreApiError('NOT_FOUND', 404, `Agreement "${agreementId}" not found.`);
              }
              const agr = agrSnap.data;

              let initiatorRole: 'LANDLORD' | 'TENANT' | 'AUTHORIZED_MANAGER' = 'TENANT';
              if (params.principal.uid === agr.tenantUid) {
                initiatorRole = 'TENANT';
              } else {
                const authCtx = await verifyActorAuthorityForProperty({
                  tx,
                  deps,
                  principal: params.principal,
                  propertyRefId: agr.propertyRefId,
                  requiredScope: 'LEASE_ADMINISTRATION',
                  portfolioId: agr.portfolioId,
                  nowEpochMs: nowMs(),
                });
                initiatorRole = authCtx.actorRole === 'OWNER' ? 'LANDLORD' : 'AUTHORIZED_MANAGER';
              }

              const ts = nowTimestamp(deps);
              const isEarlyTermination =
                Date.parse(intendedTerminationDateIso) < Date.parse(agr.endDateIso);

              let verifiedLegalPolicyRefCode: string | undefined;
              if (deps.legalPolicy) {
                const policyRes = await deps.legalPolicy.evaluateTerminationNoticeWindow({
                  agreementId,
                  agreementEndDateIso: agr.endDateIso,
                  intendedTerminationDateIso,
                  requestedAtIso: ts.iso,
                });
                verifiedLegalPolicyRefCode = policyRes.policyReferenceCode;
              }

              const termId = `pmterm_${crypto.randomBytes(6).toString('hex')}`;
              const isCompleted = Boolean(finalHandoverId && body.markCompleted === true);

              const termDoc: LeaseTerminationWorkflowRecord = {
                id: termId,
                agreementId,
                propertyRefId: agr.propertyRefId,
                initiatedByUid: params.principal.uid,
                initiatorRole,
                ...(tenantNoticeRef ? { tenantNoticeRef } : {}),
                ...(landlordNoticeRef ? { landlordNoticeRef } : {}),
                terminationReason,
                isEarlyTermination,
                intendedTerminationDateIso,
                ...(isCompleted ? { actualTerminationDateIso: ts.iso } : {}),
                ...(finalHandoverId ? { finalHandoverId } : {}),
                status: isCompleted ? 'COMPLETED' : 'REQUESTED',
                ...(verifiedLegalPolicyRefCode ? { verifiedLegalPolicyRefCode } : {}),
                legalDeterminationDisclaimer:
                  'OPERATIONAL_WORKFLOW_ONLY: Recording a termination request or early termination does not constitute a statutory or judicial legal determination.',
                history: [
                  {
                    status: isCompleted ? 'COMPLETED' : 'REQUESTED',
                    actorUid: params.principal.uid,
                    occurredAt: ts,
                    note: terminationReason,
                  },
                ],
                revision: 1,
                createdAt: ts,
                updatedAt: ts,
              };

              tx.set(`pmTerminations/${termId}`, termDoc as unknown as Record<string, unknown>);
              tx.set(`pmRentalAgreements/${agreementId}`, {
                ...agr,
                status: isCompleted ? 'TERMINATED' : 'TERMINATION_PENDING',
                revision: agr.revision + 1,
                updatedAt: ts,
              });

              const notifyTargetUid =
                initiatorRole === 'TENANT' ? agr.landlordUid : agr.tenantUid;
              await emitDomainNotificationEvent({
                tx,
                deps,
                eventType: 'TERMINATION_REQUESTED',
                recipientUid: notifyTargetUid,
                idempotencyKey: `term_req_${termId}`,
                correlationId: params.correlationId,
                nowTs: ts,
                variables: {
                  terminationId: termId,
                  agreementId,
                  intendedTerminationDateIso,
                  isEarlyTermination,
                },
              });

              return termDoc;
            },
          );
          return { statusCode: 201, body: record };
        },
      });

      return { termination: outcome.body, replayed: outcome.replayed };
    },
  };
}
