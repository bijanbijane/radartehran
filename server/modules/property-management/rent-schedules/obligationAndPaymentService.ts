import crypto from 'crypto';
import {
  CoreApiError,
  executeIdempotentMutation,
  normalizePaginationParams,
  runDurableTransaction,
  type AuthenticatedPrincipal,
  type IdempotencyStoreAdapter,
} from '../../core';
import type { PropertyManagementModuleDependencies } from '../contracts/externalAdapters';
import type {
  FinancialObligationScheduleRecord,
  ObligationStatus,
  RentalAgreementRecord,
} from '../domain/models';
import {
  appendToCollectionIndex,
  emitDomainNotificationEvent,
  loadIndexedRecords,
  nowTimestamp,
  paginateRecordsByCreatedAt,
  recordManagementActivity,
  requireAuthenticatedVerifiedUser,
  verifyActorAuthorityForProperty,
} from '../repositories/durableStoreHelpers';
import {
  assertNoSecretCredentialsInText,
  assertPlainObjectWithNoUntrustedIdentity,
  OBLIGATION_TYPES,
  requireCleanString,
  requireEnum,
  requireIsoDateString,
  requireNonNegativeAmount,
  requireValidId,
} from '../schemas/validation';

export function createObligationAndPaymentService(
  deps: PropertyManagementModuleDependencies,
  idempotencyStore: IdempotencyStoreAdapter,
) {
  const nowMs = () => (deps.nowFn ? deps.nowFn() : Date.now());

  return {
    async createObligationSchedule(params: {
      principal: AuthenticatedPrincipal;
      idempotencyKey: string;
      correlationId: string;
      rawBody: unknown;
    }): Promise<{ obligation: FinancialObligationScheduleRecord; replayed: boolean }> {
      await requireAuthenticatedVerifiedUser(params.principal, deps);
      const body = assertPlainObjectWithNoUntrustedIdentity(params.rawBody);

      const agreementId = requireValidId(body.agreementId, 'agreementId');
      const obligationType = requireEnum(body.obligationType, 'obligationType', OBLIGATION_TYPES);
      const dueDateIso = requireIsoDateString(body.dueDateIso, 'dueDateIso');
      const amount = requireNonNegativeAmount(body.amount, 'amount', 1);
      const currency = requireEnum(body.currency ?? 'TOMAN', 'currency', ['IRT', 'TOMAN', 'IRR'] as const);
      const paymentPeriodKey = requireCleanString(body.paymentPeriodKey, 'paymentPeriodKey', 2, 48);
      const coveredPeriodStartIso = requireIsoDateString(
        body.coveredPeriodStartIso,
        'coveredPeriodStartIso',
      );
      const coveredPeriodEndIso = requireIsoDateString(
        body.coveredPeriodEndIso,
        'coveredPeriodEndIso',
      );
      const gracePeriodDays =
        body.gracePeriodDays !== undefined
          ? requireNonNegativeAmount(body.gracePeriodDays, 'gracePeriodDays', 0, 90)
          : 0;

      const outcome = await executeIdempotentMutation<FinancialObligationScheduleRecord>({
        store: idempotencyStore,
        actorUid: params.principal.uid,
        operation: 'pm.obligation.create',
        idempotencyKey: params.idempotencyKey,
        requestPayload: body,
        nowEpochMs: nowMs(),
        mutationFn: async () => {
          const created = await runDurableTransaction(
            deps.txRunner,
            { operationName: 'pm.obligation.create', maxAttempts: 3 },
            async (tx) => {
              const agrSnap = await tx.get<RentalAgreementRecord>(`pmRentalAgreements/${agreementId}`);
              if (!agrSnap.exists || !agrSnap.data) {
                throw new CoreApiError('NOT_FOUND', 404, `Agreement "${agreementId}" not found.`);
              }
              const agr = agrSnap.data;

              const authCtx = await verifyActorAuthorityForProperty({
                tx,
                deps,
                principal: params.principal,
                propertyRefId: agr.propertyRefId,
                requiredScope: 'RENT_SCHEDULE_ADMINISTRATION',
                portfolioId: agr.portfolioId,
                nowEpochMs: nowMs(),
              });

              // Section 10: Prevent duplicate obligations for the same agreement, obligationType, and paymentPeriodKey
              const existingObligations = await loadIndexedRecords<FinancialObligationScheduleRecord>(
                tx,
                `pmAgreementObligationsIndex/${agreementId}`,
                'pmObligations',
              );
              const duplicate = existingObligations.find(
                (o) =>
                  o.obligationType === obligationType &&
                  o.paymentPeriodKey === paymentPeriodKey &&
                  o.status !== 'CANCELLED',
              );
              if (duplicate) {
                throw new CoreApiError(
                  'CONFLICT',
                  409,
                  `Duplicate obligation rejected: "${obligationType}" for period "${paymentPeriodKey}" already exists on agreement "${agreementId}".`,
                );
              }

              const ts = nowTimestamp(deps);
              const obligationId = `pmobl_${crypto.randomBytes(6).toString('hex')}`;
              const dueMs = Date.parse(dueDateIso);
              const initialStatus: ObligationStatus = dueMs <= ts.epochMs ? 'DUE' : 'SCHEDULED';

              const doc: FinancialObligationScheduleRecord = {
                id: obligationId,
                agreementId,
                agreementVersion: agr.currentVersion,
                propertyRefId: agr.propertyRefId,
                tenantUid: agr.tenantUid,
                landlordUid: agr.landlordUid,
                obligationType,
                originalDueDateIso: dueDateIso,
                dueDateIso,
                originalAmount: amount,
                currentAmount: amount,
                confirmedSettledAmount: 0,
                tenantSelfReportedAmount: 0,
                currency,
                paymentPeriodKey,
                coveredPeriodStartIso,
                coveredPeriodEndIso,
                gracePeriodDays,
                status: initialStatus,
                paymentState: 'UNPAID',
                authoritativeExternalPaymentRefs: [],
                reconciliationHistory: [],
                amendmentHistory: [],
                revision: 1,
                createdAt: ts,
                updatedAt: ts,
              };

              tx.set(`pmObligations/${obligationId}`, doc as unknown as Record<string, unknown>);
              await appendToCollectionIndex(tx, `pmAgreementObligationsIndex/${agreementId}`, obligationId);
              await appendToCollectionIndex(tx, `pmPropertyObligationsIndex/${agr.propertyRefId}`, obligationId);
              if (agr.portfolioId) {
                await appendToCollectionIndex(tx, `pmPortfolioObligationsIndex/${agr.portfolioId}`, obligationId);
              }

              await emitDomainNotificationEvent({
                tx,
                deps,
                eventType: 'RENT_OBLIGATION_APPROACHING',
                recipientUid: agr.tenantUid,
                idempotencyKey: `obl_approaching_${obligationId}`,
                correlationId: params.correlationId,
                nowTs: ts,
                variables: {
                  obligationId,
                  agreementId,
                  obligationType,
                  amount,
                  dueDateIso,
                },
              });

              await recordManagementActivity({
                tx,
                deps,
                principal: params.principal,
                actorRole: authCtx.actorRole,
                portfolioId: agr.portfolioId,
                propertyRefId: agr.propertyRefId,
                entityType: 'OBLIGATION',
                entityId: obligationId,
                action: 'obligation.scheduled',
                summary: `Obligation ${obligationId} (${obligationType}, ${amount} ${currency}) scheduled for ${dueDateIso}.`,
                correlationId: params.correlationId,
                nowTs: ts,
              });

              return doc;
            },
          );
          return { statusCode: 201, body: created };
        },
      });

      return { obligation: outcome.body, replayed: outcome.replayed };
    },

    async amendObligationSchedule(params: {
      principal: AuthenticatedPrincipal;
      obligationId: string;
      newAmount?: number;
      newDueDateIso?: string;
      reason: string;
      correlationId: string;
    }): Promise<FinancialObligationScheduleRecord> {
      await requireAuthenticatedVerifiedUser(params.principal, deps);
      const obligationId = requireValidId(params.obligationId, 'obligationId');
      const reason = requireCleanString(params.reason, 'reason', 3, 400);

      return runDurableTransaction(
        deps.txRunner,
        { operationName: 'pm.obligation.amend', maxAttempts: 3 },
        async (tx) => {
          const snap = await tx.get<FinancialObligationScheduleRecord>(`pmObligations/${obligationId}`);
          if (!snap.exists || !snap.data) {
            throw new CoreApiError('NOT_FOUND', 404, `Obligation "${obligationId}" not found.`);
          }
          const obl = snap.data;

          await verifyActorAuthorityForProperty({
            tx,
            deps,
            principal: params.principal,
            propertyRefId: obl.propertyRefId,
            requiredScope: 'RENT_SCHEDULE_ADMINISTRATION',
            nowEpochMs: nowMs(),
          });

          const nextAmount =
            params.newAmount !== undefined
              ? requireNonNegativeAmount(params.newAmount, 'newAmount', 0)
              : obl.currentAmount;
          const nextDueDateIso =
            params.newDueDateIso !== undefined
              ? requireIsoDateString(params.newDueDateIso, 'newDueDateIso')
              : obl.dueDateIso;

          const ts = nowTimestamp(deps);
          // Section 10: Preserve originalAmount and originalDueDateIso
          const updated: FinancialObligationScheduleRecord = {
            ...obl,
            currentAmount: nextAmount,
            dueDateIso: nextDueDateIso,
            amendmentHistory: [
              ...obl.amendmentHistory,
              {
                previousAmount: obl.currentAmount,
                newAmount: nextAmount,
                previousDueDateIso: obl.dueDateIso,
                newDueDateIso: nextDueDateIso,
                amendedByUid: params.principal.uid,
                reason,
                amendedAt: ts,
              },
            ],
            revision: obl.revision + 1,
            updatedAt: ts,
          };

          tx.set(`pmObligations/${obligationId}`, updated as unknown as Record<string, unknown>);
          return updated;
        },
      );
    },

    /**
     * Section 10 & 11: Tenant self-reported payment statement.
     * Explicitly records `REPORTED_AS_PAID` / `PAYMENT_REPORTED` and NEVER marks `PAYMENT_CONFIRMED`.
     */
    async reportTenantPaymentClaim(params: {
      principal: AuthenticatedPrincipal;
      obligationId: string;
      reportedAmount: number;
      note?: string;
      correlationId: string;
    }): Promise<FinancialObligationScheduleRecord> {
      await requireAuthenticatedVerifiedUser(params.principal, deps);
      const obligationId = requireValidId(params.obligationId, 'obligationId');
      const reportedAmount = requireNonNegativeAmount(params.reportedAmount, 'reportedAmount', 1);
      const note = params.note ? requireCleanString(params.note, 'note', 1, 300) : undefined;
      if (note) assertNoSecretCredentialsInText(note, 'note');

      return runDurableTransaction(
        deps.txRunner,
        { operationName: 'pm.obligation.tenant_report', maxAttempts: 3 },
        async (tx) => {
          const snap = await tx.get<FinancialObligationScheduleRecord>(`pmObligations/${obligationId}`);
          if (!snap.exists || !snap.data) {
            throw new CoreApiError('NOT_FOUND', 404, `Obligation "${obligationId}" not found.`);
          }
          const obl = snap.data;

          if (obl.tenantUid !== params.principal.uid) {
            throw new CoreApiError('FORBIDDEN', 403, 'Only the obligation tenant may submit a self-reported payment claim.');
          }
          if (obl.status === 'PAYMENT_CONFIRMED') {
            return obl;
          }

          const ts = nowTimestamp(deps);
          const updated: FinancialObligationScheduleRecord = {
            ...obl,
            tenantSelfReportedAmount: reportedAmount,
            status: 'REPORTED_AS_PAID',
            paymentState: 'PAYMENT_REPORTED',
            reconciliationHistory: [
              ...obl.reconciliationHistory,
              {
                reconciliationId: `rec_${crypto.randomBytes(4).toString('hex')}`,
                source: 'TENANT_SELF_REPORT',
                amount: reportedAmount,
                paymentEventStatus: 'PAYMENT_REPORTED',
                actorUid: params.principal.uid,
                recordedAt: ts,
                note: note ?? 'Tenant self-reported payment (awaiting authoritative provider verification)',
              },
            ],
            revision: obl.revision + 1,
            updatedAt: ts,
          };

          tx.set(`pmObligations/${obligationId}`, updated as unknown as Record<string, unknown>);
          return updated;
        },
      );
    },

    /**
     * Section 11: Associate Authoritative Payment Reference.
     * Never marks an obligation as PAYMENT_CONFIRMED without verified authoritative payment provider evidence.
     */
    async associateAuthoritativePaymentReference(params: {
      principal: AuthenticatedPrincipal;
      obligationId: string;
      externalPaymentRefId: string;
      idempotencyKey: string;
      correlationId: string;
    }): Promise<{ obligation: FinancialObligationScheduleRecord; replayed: boolean }> {
      await requireAuthenticatedVerifiedUser(params.principal, deps);
      const obligationId = requireValidId(params.obligationId, 'obligationId');
      const externalPaymentRefId = requireValidId(params.externalPaymentRefId, 'externalPaymentRefId');

      if (!deps.paymentAuthority) {
        throw new CoreApiError(
          'PERSISTENCE_FAILED',
          503,
          'Payment Authority adapter is not configured; cannot confirm payment without authoritative provider verification.',
        );
      }

      const outcome = await executeIdempotentMutation<FinancialObligationScheduleRecord>({
        store: idempotencyStore,
        actorUid: params.principal.uid,
        operation: 'pm.obligation.reconcile_payment',
        idempotencyKey: params.idempotencyKey,
        requestPayload: { obligationId, externalPaymentRefId },
        nowEpochMs: nowMs(),
        mutationFn: async () => {
          const verifiedPayment =
            await deps.paymentAuthority!.verifyAuthoritativePaymentEvent(externalPaymentRefId);

          if (!verifiedPayment || !verifiedPayment.authoritativeSignatureVerified) {
            throw new CoreApiError(
              'VALIDATION_FAILED',
              400,
              `External payment reference "${externalPaymentRefId}" could not be verified by an authoritative payment provider.`,
            );
          }

          if (verifiedPayment.obligationId !== obligationId) {
            throw new CoreApiError(
              'VALIDATION_FAILED',
              400,
              `External payment reference "${externalPaymentRefId}" does not belong to obligation "${obligationId}".`,
            );
          }

          const updated = await runDurableTransaction(
            deps.txRunner,
            { operationName: 'pm.obligation.reconcile_payment', maxAttempts: 3 },
            async (tx) => {
              const snap = await tx.get<FinancialObligationScheduleRecord>(`pmObligations/${obligationId}`);
              if (!snap.exists || !snap.data) {
                throw new CoreApiError('NOT_FOUND', 404, `Obligation "${obligationId}" not found.`);
              }
              const obl = snap.data;

              if (obl.tenantUid !== params.principal.uid) {
                await verifyActorAuthorityForProperty({
                  tx,
                  deps,
                  principal: params.principal,
                  propertyRefId: obl.propertyRefId,
                  requiredScope: 'RENT_SCHEDULE_ADMINISTRATION',
                  nowEpochMs: nowMs(),
                });
              }

              if (obl.authoritativeExternalPaymentRefs.includes(externalPaymentRefId)) {
                return obl;
              }

              const ts = nowTimestamp(deps);
              let nextConfirmedAmount = obl.confirmedSettledAmount;
              let nextStatus: ObligationStatus = obl.status;

              if (verifiedPayment.status === 'PAYMENT_CONFIRMED_AUTHORITATIVE') {
                nextConfirmedAmount = obl.confirmedSettledAmount + verifiedPayment.amount;
                nextStatus =
                  nextConfirmedAmount >= obl.currentAmount
                    ? 'PAYMENT_CONFIRMED'
                    : 'PARTIALLY_SETTLED';
              } else if (verifiedPayment.status === 'PAYMENT_REVERSED') {
                nextConfirmedAmount = Math.max(0, obl.confirmedSettledAmount - verifiedPayment.amount);
                nextStatus = 'OVERDUE';
              } else if (verifiedPayment.status === 'PAYMENT_DISPUTED') {
                nextStatus = 'DISPUTED';
              } else if (verifiedPayment.status === 'PAYMENT_PENDING') {
                nextStatus = 'REPORTED_AS_PAID';
              }

              const nextObl: FinancialObligationScheduleRecord = {
                ...obl,
                confirmedSettledAmount: nextConfirmedAmount,
                status: nextStatus,
                paymentState: verifiedPayment.status,
                authoritativeExternalPaymentRefs: [
                  ...obl.authoritativeExternalPaymentRefs,
                  externalPaymentRefId,
                ],
                reconciliationHistory: [
                  ...obl.reconciliationHistory,
                  {
                    reconciliationId: `rec_${crypto.randomBytes(4).toString('hex')}`,
                    source: 'AUTHORITATIVE_PAYMENT_PROVIDER',
                    externalPaymentRefId,
                    providerId: verifiedPayment.providerId,
                    amount: verifiedPayment.amount,
                    paymentEventStatus: verifiedPayment.status,
                    actorUid: params.principal.uid,
                    recordedAt: ts,
                  },
                ],
                revision: obl.revision + 1,
                updatedAt: ts,
              };

              tx.set(`pmObligations/${obligationId}`, nextObl as unknown as Record<string, unknown>);

              if (verifiedPayment.status === 'PAYMENT_CONFIRMED_AUTHORITATIVE') {
                await emitDomainNotificationEvent({
                  tx,
                  deps,
                  eventType: 'PAYMENT_CONFIRMATION_RECEIVED',
                  recipientUid: obl.landlordUid,
                  idempotencyKey: `pay_conf_ll_${externalPaymentRefId}`,
                  correlationId: params.correlationId,
                  nowTs: ts,
                  variables: {
                    obligationId,
                    externalPaymentRefId,
                    amount: verifiedPayment.amount,
                    status: nextStatus,
                  },
                });
              }

              return nextObl;
            },
          );

          return { statusCode: 200, body: updated };
        },
      });

      return { obligation: outcome.body, replayed: outcome.replayed };
    },

    /**
     * Server-side due and overdue obligation evaluation (Section 10: never rely on client timers).
     */
    async evaluateDueAndOverdueObligationsForAgreement(params: {
      principal: AuthenticatedPrincipal;
      agreementId: string;
      referenceTimeIso?: string;
      correlationId: string;
    }): Promise<{ updatedObligations: FinancialObligationScheduleRecord[] }> {
      await requireAuthenticatedVerifiedUser(params.principal, deps);
      const agreementId = requireValidId(params.agreementId, 'agreementId');
      const evalEpochMs = params.referenceTimeIso
        ? Date.parse(requireIsoDateString(params.referenceTimeIso, 'referenceTimeIso'))
        : nowMs();

      return runDurableTransaction(
        deps.txRunner,
        { operationName: 'pm.obligation.evaluate_overdue', maxAttempts: 3 },
        async (tx) => {
          const agrSnap = await tx.get<RentalAgreementRecord>(`pmRentalAgreements/${agreementId}`);
          if (!agrSnap.exists || !agrSnap.data) {
            throw new CoreApiError('NOT_FOUND', 404, `Agreement "${agreementId}" not found.`);
          }
          const agr = agrSnap.data;

          await verifyActorAuthorityForProperty({
            tx,
            deps,
            principal: params.principal,
            propertyRefId: agr.propertyRefId,
            requiredScope: 'RENT_SCHEDULE_ADMINISTRATION',
            portfolioId: agr.portfolioId,
            nowEpochMs: nowMs(),
          });

          const obligations = await loadIndexedRecords<FinancialObligationScheduleRecord>(
            tx,
            `pmAgreementObligationsIndex/${agreementId}`,
            'pmObligations',
          );
          const ts = nowTimestamp(deps);
          const updatedList: FinancialObligationScheduleRecord[] = [];

          for (const obl of obligations) {
            if (
              obl.status === 'PAYMENT_CONFIRMED' ||
              obl.status === 'WAIVED' ||
              obl.status === 'CANCELLED'
            ) {
              continue;
            }
            const dueMs = Date.parse(obl.dueDateIso);
            const overdueThresholdMs = dueMs + obl.gracePeriodDays * 24 * 60 * 60 * 1000;

            let targetStatus: ObligationStatus = obl.status;
            if (evalEpochMs > overdueThresholdMs) {
              targetStatus = 'OVERDUE';
            } else if (evalEpochMs >= dueMs && obl.status === 'SCHEDULED') {
              targetStatus = 'DUE';
            }

            if (targetStatus !== obl.status) {
              const nextObl: FinancialObligationScheduleRecord = {
                ...obl,
                status: targetStatus,
                revision: obl.revision + 1,
                updatedAt: ts,
              };
              tx.set(`pmObligations/${obl.id}`, nextObl as unknown as Record<string, unknown>);
              updatedList.push(nextObl);

              if (targetStatus === 'OVERDUE') {
                await emitDomainNotificationEvent({
                  tx,
                  deps,
                  eventType: 'RENT_OBLIGATION_OVERDUE',
                  recipientUid: obl.tenantUid,
                  idempotencyKey: `obl_overdue_${obl.id}`,
                  correlationId: params.correlationId,
                  nowTs: ts,
                  variables: {
                    obligationId: obl.id,
                    agreementId,
                    dueDateIso: obl.dueDateIso,
                    currentAmount: obl.currentAmount,
                  },
                });
              }
            }
          }

          return { updatedObligations: updatedList };
        },
      );
    },

    async retrieveObligationHistory(params: {
      principal: AuthenticatedPrincipal;
      agreementId: string;
      periodStartIso?: string;
      periodEndIso?: string;
      query?: Record<string, unknown>;
    }): Promise<{
      items: FinancialObligationScheduleRecord[];
      hasMore: boolean;
      nextCursor: string | null;
      totalCount: number;
    }> {
      await requireAuthenticatedVerifiedUser(params.principal, deps);
      const agreementId = requireValidId(params.agreementId, 'agreementId');
      const pagination = normalizePaginationParams(params.query, { defaultLimit: 20, maxLimit: 50 });

      return runDurableTransaction(
        deps.txRunner,
        { operationName: 'pm.obligation.history', maxAttempts: 2 },
        async (tx) => {
          const agrSnap = await tx.get<RentalAgreementRecord>(`pmRentalAgreements/${agreementId}`);
          if (!agrSnap.exists || !agrSnap.data) {
            throw new CoreApiError('NOT_FOUND', 404, `Agreement "${agreementId}" not found.`);
          }
          const agr = agrSnap.data;

          if (agr.tenantUid !== params.principal.uid) {
            await verifyActorAuthorityForProperty({
              tx,
              deps,
              principal: params.principal,
              propertyRefId: agr.propertyRefId,
              requiredScope: 'RENT_SCHEDULE_ADMINISTRATION',
              portfolioId: agr.portfolioId,
              nowEpochMs: nowMs(),
            });
          }

          let obligations = await loadIndexedRecords<FinancialObligationScheduleRecord>(
            tx,
            `pmAgreementObligationsIndex/${agreementId}`,
            'pmObligations',
          );

          if (params.periodStartIso) {
            const startMs = Date.parse(requireIsoDateString(params.periodStartIso, 'periodStartIso'));
            obligations = obligations.filter((o) => Date.parse(o.dueDateIso) >= startMs);
          }
          if (params.periodEndIso) {
            const endMs = Date.parse(requireIsoDateString(params.periodEndIso, 'periodEndIso'));
            obligations = obligations.filter((o) => Date.parse(o.dueDateIso) <= endMs);
          }

          return paginateRecordsByCreatedAt(obligations, pagination);
        },
      );
    },
  };
}
