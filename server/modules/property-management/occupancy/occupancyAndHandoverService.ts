import crypto from 'crypto';
import {
  CoreApiError,
  executeIdempotentMutation,
  runDurableTransaction,
  type AuthenticatedPrincipal,
  type IdempotencyStoreAdapter,
} from '../../core';
import type { PropertyManagementModuleDependencies } from '../contracts/externalAdapters';
import type {
  OccupancyLifecycleState,
  OccupancyRecord,
  RentalAgreementRecord,
} from '../domain/models';
import type {
  HandoverParticipantRecord,
  MeterReadingEntry,
  PropertyHandoverRecord,
  SanitizedAccessItemEntry,
} from '../domain/LifecycleAndReportingTypes';
import {
  appendToCollectionIndex,
  emitDomainNotificationEvent,
  loadIndexedRecords,
  nowTimestamp,
  recordManagementActivity,
  requireAuthenticatedVerifiedUser,
  verifyActorAuthorityForProperty,
  verifyMediaIdsIfSupplied,
} from '../repositories/durableStoreHelpers';
import {
  assertNoSecretCredentialsInText,
  assertPlainObjectWithNoUntrustedIdentity,
  HANDOVER_TYPES,
  requireCleanString,
  requireEnum,
  requireIdArray,
  requireIsoDateString,
  requireNonNegativeAmount,
  requireOptionalId,
  requireValidId,
} from '../schemas/validation';

const CONFLICTING_OCCUPANCY_STATES: ReadonlySet<OccupancyLifecycleState> =
  new Set<OccupancyLifecycleState>(['SCHEDULED', 'ACTIVE', 'TEMPORARILY_SUSPENDED']);

export function createOccupancyAndHandoverService(
  deps: PropertyManagementModuleDependencies,
  idempotencyStore: IdempotencyStoreAdapter,
) {
  const nowMs = () => (deps.nowFn ? deps.nowFn() : Date.now());

  return {
    async registerOccupancy(params: {
      principal: AuthenticatedPrincipal;
      idempotencyKey: string;
      correlationId: string;
      rawBody: unknown;
    }): Promise<{ occupancy: OccupancyRecord; replayed: boolean }> {
      await requireAuthenticatedVerifiedUser(params.principal, deps);
      const body = assertPlainObjectWithNoUntrustedIdentity(params.rawBody);

      const propertyRefId = requireValidId(body.propertyRefId, 'propertyRefId');
      const rentalAgreementId = requireValidId(body.rentalAgreementId, 'rentalAgreementId');
      const tenantUid = requireValidId(body.tenantUid, 'tenantUid');
      const authorizedCoOccupantUids = requireIdArray(
        body.authorizedCoOccupantUids,
        'authorizedCoOccupantUids',
        20,
      );
      const occupancyStartDateIso = requireIsoDateString(
        body.occupancyStartDateIso,
        'occupancyStartDateIso',
      );
      const expectedEndDateIso = requireIsoDateString(body.expectedEndDateIso, 'expectedEndDateIso');
      const initialStatus = requireEnum(
        body.initialStatus ?? 'SCHEDULED',
        'initialStatus',
        ['PENDING', 'SCHEDULED'] as const,
      );

      if (body.initialStatus === 'ACTIVE') {
        throw new CoreApiError(
          'VALIDATION_FAILED',
          400,
          'Occupancy cannot be created directly in ACTIVE state without an active agreement and confirmed move-in handover.',
        );
      }

      const outcome = await executeIdempotentMutation<OccupancyRecord>({
        store: idempotencyStore,
        actorUid: params.principal.uid,
        operation: 'pm.occupancy.register',
        idempotencyKey: params.idempotencyKey,
        requestPayload: body,
        nowEpochMs: nowMs(),
        mutationFn: async () => {
          const created = await runDurableTransaction(
            deps.txRunner,
            { operationName: 'pm.occupancy.register', maxAttempts: 3 },
            async (tx) => {
              const authCtx = await verifyActorAuthorityForProperty({
                tx,
                deps,
                principal: params.principal,
                propertyRefId,
                requiredScope: 'LEASE_ADMINISTRATION',
                nowEpochMs: nowMs(),
              });

              const agrSnap = await tx.get<RentalAgreementRecord>(
                `pmRentalAgreements/${rentalAgreementId}`,
              );
              if (!agrSnap.exists || !agrSnap.data) {
                throw new CoreApiError(
                  'NOT_FOUND',
                  404,
                  `Rental agreement "${rentalAgreementId}" not found; an offer or inquiry alone cannot create occupancy.`,
                );
              }
              const agr = agrSnap.data;
              if (agr.propertyRefId !== propertyRefId || agr.tenantUid !== tenantUid) {
                throw new CoreApiError(
                  'VALIDATION_FAILED',
                  400,
                  'Occupancy propertyRefId and tenantUid must match the recorded rental agreement.',
                );
              }
              if (agr.status === 'DRAFT' || agr.status === 'TERMINATED' || agr.status === 'DISPUTED') {
                throw new CoreApiError(
                  'CONFLICT',
                  409,
                  `Cannot register occupancy when agreement "${rentalAgreementId}" is in "${agr.status}" state.`,
                );
              }

              const totalOccupants = 1 + authorizedCoOccupantUids.length;
              if (totalOccupants > agr.maxAuthorizedOccupants) {
                throw new CoreApiError(
                  'VALIDATION_FAILED',
                  400,
                  `Total occupants (${totalOccupants}) exceeds agreement maximum (${agr.maxAuthorizedOccupants}).`,
                );
              }

              // Prevent conflicting active/scheduled occupancies for the same property/unit
              const existingOccupancies = await loadIndexedRecords<OccupancyRecord>(
                tx,
                `pmPropertyOccupanciesIndex/${propertyRefId}`,
                'pmOccupancies',
              );
              const overlapping = existingOccupancies.filter((occ) => {
                if (!CONFLICTING_OCCUPANCY_STATES.has(occ.status)) return false;
                const existingStart = Date.parse(occ.occupancyStartDateIso);
                const existingEnd = Date.parse(occ.actualEndDateIso ?? occ.expectedEndDateIso);
                const newStart = Date.parse(occupancyStartDateIso);
                const newEnd = Date.parse(expectedEndDateIso);
                return newStart < existingEnd && newEnd > existingStart;
              });

              const maxAllowedConcurrent = authCtx.propertySnapshot.supportsMultipleConcurrentOccupancies
                ? (authCtx.propertySnapshot.maxConcurrentOccupancies ?? 2)
                : 1;

              if (overlapping.length >= maxAllowedConcurrent) {
                throw new CoreApiError(
                  'CONFLICT',
                  409,
                  `Conflicting occupancy detected for "${propertyRefId}": active/scheduled occupancy limit (${maxAllowedConcurrent}) reached.`,
                );
              }

              const ts = nowTimestamp(deps);
              const occupancyId = `pmocc_${crypto.randomBytes(6).toString('hex')}`;
              const occDoc: OccupancyRecord = {
                id: occupancyId,
                propertyRefId,
                ...(authCtx.propertySnapshot.buildingRefId
                  ? { buildingRefId: authCtx.propertySnapshot.buildingRefId }
                  : {}),
                ...(authCtx.propertySnapshot.unitRefId
                  ? { unitRefId: authCtx.propertySnapshot.unitRefId }
                  : {}),
                ...(agr.portfolioId ? { portfolioId: agr.portfolioId } : {}),
                tenantUid,
                authorizedCoOccupantUids,
                rentalAgreementId,
                occupancyStartDateIso,
                expectedEndDateIso,
                status: initialStatus,
                history: [
                  {
                    fromState: 'NONE',
                    toState: initialStatus,
                    actorUid: params.principal.uid,
                    occurredAt: ts,
                    note: 'Occupancy registered under rental agreement',
                  },
                ],
                revision: 1,
                createdAt: ts,
                updatedAt: ts,
              };

              tx.set(`pmOccupancies/${occupancyId}`, occDoc as unknown as Record<string, unknown>);
              await appendToCollectionIndex(
                tx,
                `pmPropertyOccupanciesIndex/${propertyRefId}`,
                occupancyId,
              );
              if (agr.portfolioId) {
                await appendToCollectionIndex(
                  tx,
                  `pmPortfolioOccupanciesIndex/${agr.portfolioId}`,
                  occupancyId,
                );
              }

              await recordManagementActivity({
                tx,
                deps,
                principal: params.principal,
                actorRole: authCtx.actorRole,
                portfolioId: agr.portfolioId,
                propertyRefId,
                entityType: 'OCCUPANCY',
                entityId: occupancyId,
                action: 'occupancy.registered',
                summary: `Occupancy ${occupancyId} registered in ${initialStatus} state.`,
                correlationId: params.correlationId,
                nowTs: ts,
              });
              return occDoc;
            },
          );
          return { statusCode: 201, body: created };
        },
      });

      return { occupancy: outcome.body, replayed: outcome.replayed };
    },

    async updateOccupancyStatus(params: {
      principal: AuthenticatedPrincipal;
      occupancyId: string;
      targetStatus: OccupancyLifecycleState;
      moveInHandoverId?: string;
      moveOutHandoverId?: string;
      note?: string;
      correlationId: string;
    }): Promise<OccupancyRecord> {
      await requireAuthenticatedVerifiedUser(params.principal, deps);
      const occupancyId = requireValidId(params.occupancyId, 'occupancyId');

      return runDurableTransaction(
        deps.txRunner,
        { operationName: 'pm.occupancy.update_status', maxAttempts: 3 },
        async (tx) => {
          const snap = await tx.get<OccupancyRecord>(`pmOccupancies/${occupancyId}`);
          if (!snap.exists || !snap.data) {
            throw new CoreApiError('NOT_FOUND', 404, `Occupancy "${occupancyId}" not found.`);
          }
          const occ = snap.data;

          const authCtx = await verifyActorAuthorityForProperty({
            tx,
            deps,
            principal: params.principal,
            propertyRefId: occ.propertyRefId,
            requiredScope: 'LEASE_ADMINISTRATION',
            portfolioId: occ.portfolioId,
            nowEpochMs: nowMs(),
          });

          const moveInHandoverId =
            params.moveInHandoverId !== undefined
              ? requireValidId(params.moveInHandoverId, 'moveInHandoverId')
              : occ.moveInHandoverId;
          const moveOutHandoverId =
            params.moveOutHandoverId !== undefined
              ? requireValidId(params.moveOutHandoverId, 'moveOutHandoverId')
              : occ.moveOutHandoverId;

          if (params.targetStatus === 'ACTIVE') {
            const agrSnap = await tx.get<RentalAgreementRecord>(
              `pmRentalAgreements/${occ.rentalAgreementId}`,
            );
            if (!agrSnap.exists || !agrSnap.data || agrSnap.data.status !== 'ACTIVE') {
              throw new CoreApiError(
                'CONFLICT',
                409,
                'Occupancy cannot become ACTIVE unless the linked rental agreement is ACTIVE.',
              );
            }
            if (!moveInHandoverId) {
              throw new CoreApiError(
                'CONFLICT',
                409,
                'Occupancy activation requires a completed move-in handover reference (moveInHandoverId).',
              );
            }
            const hoSnap = await tx.get<PropertyHandoverRecord>(`pmHandovers/${moveInHandoverId}`);
            if (
              !hoSnap.exists ||
              !hoSnap.data ||
              hoSnap.data.confirmationState !== 'COMPLETED_CONFIRMED'
            ) {
              throw new CoreApiError(
                'CONFLICT',
                409,
                `Move-in handover "${moveInHandoverId}" must be in COMPLETED_CONFIRMED state before activating occupancy.`,
              );
            }
          }

          const ts = nowTimestamp(deps);
          const updated: OccupancyRecord = {
            ...occ,
            status: params.targetStatus,
            ...(moveInHandoverId ? { moveInHandoverId } : {}),
            ...(moveOutHandoverId ? { moveOutHandoverId } : {}),
            ...(params.targetStatus === 'ENDED' ? { actualEndDateIso: ts.iso } : {}),
            history: [
              ...occ.history,
              {
                fromState: occ.status,
                toState: params.targetStatus,
                actorUid: params.principal.uid,
                occurredAt: ts,
                ...(params.note ? { note: sanitizeNote(params.note) } : {}),
              },
            ],
            revision: occ.revision + 1,
            updatedAt: ts,
          };

          tx.set(`pmOccupancies/${occupancyId}`, updated as unknown as Record<string, unknown>);
          await recordManagementActivity({
            tx,
            deps,
            principal: params.principal,
            actorRole: authCtx.actorRole,
            portfolioId: occ.portfolioId,
            propertyRefId: occ.propertyRefId,
            entityType: 'OCCUPANCY',
            entityId: occupancyId,
            action: `occupancy.status_${params.targetStatus.toLowerCase()}`,
            summary: `Occupancy ${occupancyId} transitioned from ${occ.status} to ${params.targetStatus}.`,
            correlationId: params.correlationId,
            nowTs: ts,
          });
          return updated;
        },
      );
    },

    async getAuthorizedOccupancyDetails(params: {
      principal: AuthenticatedPrincipal;
      occupancyId: string;
    }): Promise<{
      occupancy: OccupancyRecord;
      locationAccess: {
        publicLocationSummaryFa: string;
        privateExactAddressFa?: string;
        locationPrivacyPolicy: string;
      };
    }> {
      await requireAuthenticatedVerifiedUser(params.principal, deps);
      const occupancyId = requireValidId(params.occupancyId, 'occupancyId');

      return runDurableTransaction(
        deps.txRunner,
        { operationName: 'pm.occupancy.get', maxAttempts: 2 },
        async (tx) => {
          const snap = await tx.get<OccupancyRecord>(`pmOccupancies/${occupancyId}`);
          if (!snap.exists || !snap.data) {
            throw new CoreApiError('NOT_FOUND', 404, `Occupancy "${occupancyId}" not found.`);
          }
          const occ = snap.data;

          const isTenantOrCoOccupant =
            occ.tenantUid === params.principal.uid ||
            occ.authorizedCoOccupantUids.includes(params.principal.uid);

          const initialSnapshot = await deps.propertyRegistry.getPropertyOrUnitSnapshot(
            occ.propertyRefId,
          );
          if (!initialSnapshot) {
            throw new CoreApiError('NOT_FOUND', 404, 'Canonical property snapshot not found.');
          }
          let propSnapshot = initialSnapshot;

          if (!isTenantOrCoOccupant) {
            const authCtx = await verifyActorAuthorityForProperty({
              tx,
              deps,
              principal: params.principal,
              propertyRefId: occ.propertyRefId,
              requiredScope: 'TENANT_COMMUNICATION',
              portfolioId: occ.portfolioId,
              nowEpochMs: nowMs(),
            });
            propSnapshot = authCtx.propertySnapshot;
          }

          return {
            occupancy: occ,
            locationAccess: {
              publicLocationSummaryFa: propSnapshot.publicLocationSummaryFa,
              privateExactAddressFa: propSnapshot.privateExactAddressFa,
              locationPrivacyPolicy:
                'RESTRICTED_PARTICIPANT_ONLY: Exact residential address is disclosed strictly to verified owner, authorized manager, or active/scheduled tenant.',
            },
          };
        },
      );
    },

    async schedulePropertyHandover(params: {
      principal: AuthenticatedPrincipal;
      idempotencyKey: string;
      correlationId: string;
      rawBody: unknown;
    }): Promise<{ handover: PropertyHandoverRecord; replayed: boolean }> {
      await requireAuthenticatedVerifiedUser(params.principal, deps);
      const body = assertPlainObjectWithNoUntrustedIdentity(params.rawBody);

      const propertyRefId = requireValidId(body.propertyRefId, 'propertyRefId');
      const relatedOccupancyId = requireOptionalId(body.relatedOccupancyId, 'relatedOccupancyId');
      const relatedAgreementId = requireOptionalId(body.relatedAgreementId, 'relatedAgreementId');
      const handoverType = requireEnum(body.handoverType, 'handoverType', HANDOVER_TYPES);
      const scheduledAtIso = requireIsoDateString(body.scheduledAtIso, 'scheduledAtIso');
      const propertyConditionSummary = requireCleanString(
        body.propertyConditionSummary,
        'propertyConditionSummary',
        3,
        1200,
      );
      assertNoSecretCredentialsInText(propertyConditionSummary, 'propertyConditionSummary');

      const outstandingIssueRefs = requireIdArray(
        body.outstandingIssueRefs,
        'outstandingIssueRefs',
      );
      const evidenceMediaIds = requireIdArray(body.evidenceMediaIds, 'evidenceMediaIds');

      const rawParticipants = Array.isArray(body.participants) ? body.participants : [];
      if (rawParticipants.length === 0) {
        throw new CoreApiError(
          'VALIDATION_FAILED',
          400,
          'participants must include at least one confirming participant.',
        );
      }

      const participants: HandoverParticipantRecord[] = rawParticipants.map((p: unknown, idx: number) => {
        const pObj = assertPlainObjectWithNoUntrustedIdentity(p, ['uid', 'role']);
        return {
          uid: requireValidId(pObj.uid, `participants[${idx}].uid`),
          role: requireEnum(
            pObj.role,
            `participants[${idx}].role`,
            ['LANDLORD', 'TENANT', 'OUTGOING_MANAGER', 'INCOMING_MANAGER', 'WITNESS'] as const,
          ),
          confirmed: false,
        };
      });

      const rawMeters = Array.isArray(body.meterReadings) ? body.meterReadings : [];
      const meterReadings: MeterReadingEntry[] = rawMeters.map((m: unknown, idx: number) => {
        const mObj = assertPlainObjectWithNoUntrustedIdentity(m);
        return {
          meterType: requireEnum(
            mObj.meterType,
            `meterReadings[${idx}].meterType`,
            ['ELECTRICITY', 'WATER', 'GAS', 'HEATING', 'OTHER'] as const,
          ),
          meterSerialRef: requireCleanString(
            mObj.meterSerialRef,
            `meterReadings[${idx}].meterSerialRef`,
            1,
            64,
          ),
          readingValue: requireNonNegativeAmount(
            mObj.readingValue,
            `meterReadings[${idx}].readingValue`,
            0,
          ),
          unit: requireCleanString(mObj.unit ?? 'kWh', `meterReadings[${idx}].unit`, 1, 20),
          recordedAtIso: scheduledAtIso,
        };
      });

      const rawAccessItems = Array.isArray(body.keyAndAccessItems) ? body.keyAndAccessItems : [];
      const keyAndAccessItems: SanitizedAccessItemEntry[] = rawAccessItems.map(
        (k: unknown, idx: number) => {
          const kObj = assertPlainObjectWithNoUntrustedIdentity(k);
          const itemLabel = requireCleanString(
            kObj.itemLabel,
            `keyAndAccessItems[${idx}].itemLabel`,
            2,
            120,
          );
          // Section 12: Never store passwords, access codes, or security credentials in handover records
          assertNoSecretCredentialsInText(itemLabel, `keyAndAccessItems[${idx}].itemLabel`);
          return {
            itemType: requireEnum(
              kObj.itemType,
              `keyAndAccessItems[${idx}].itemType`,
              ['PHYSICAL_KEY', 'MAGNETIC_FOB', 'PARKING_REMOTE', 'MAILBOX_KEY'] as const,
            ),
            itemLabel,
            quantity: requireNonNegativeAmount(
              kObj.quantity,
              `keyAndAccessItems[${idx}].quantity`,
              1,
              50,
            ),
            handedOver: Boolean(kObj.handedOver),
          };
        },
      );

      await verifyMediaIdsIfSupplied(deps, evidenceMediaIds, params.principal.uid);

      const outcome = await executeIdempotentMutation<PropertyHandoverRecord>({
        store: idempotencyStore,
        actorUid: params.principal.uid,
        operation: 'pm.handover.schedule',
        idempotencyKey: params.idempotencyKey,
        requestPayload: body,
        nowEpochMs: nowMs(),
        mutationFn: async () => {
          const created = await runDurableTransaction(
            deps.txRunner,
            { operationName: 'pm.handover.schedule', maxAttempts: 3 },
            async (tx) => {
              const authCtx = await verifyActorAuthorityForProperty({
                tx,
                deps,
                principal: params.principal,
                propertyRefId,
                requiredScope: 'INSPECTION_COORDINATION',
                nowEpochMs: nowMs(),
              });

              const ts = nowTimestamp(deps);
              const handoverId = `pmho_${crypto.randomBytes(6).toString('hex')}`;
              const handoverDoc: PropertyHandoverRecord = {
                id: handoverId,
                propertyRefId,
                ...(authCtx.propertySnapshot.buildingRefId
                  ? { buildingRefId: authCtx.propertySnapshot.buildingRefId }
                  : {}),
                ...(authCtx.propertySnapshot.unitRefId
                  ? { unitRefId: authCtx.propertySnapshot.unitRefId }
                  : {}),
                ...(relatedOccupancyId ? { relatedOccupancyId } : {}),
                ...(relatedAgreementId ? { relatedAgreementId } : {}),
                handoverType,
                participants,
                scheduledAtIso,
                meterReadings,
                keyAndAccessItems,
                originalPropertyConditionSummary: propertyConditionSummary,
                propertyConditionSummary,
                outstandingIssueRefs,
                disagreements: [],
                evidenceMediaIds,
                confirmationState: 'PROPOSED',
                revision: 1,
                createdAt: ts,
                updatedAt: ts,
              };

              tx.set(`pmHandovers/${handoverId}`, handoverDoc as unknown as Record<string, unknown>);
              await appendToCollectionIndex(tx, `pmPropertyHandoversIndex/${propertyRefId}`, handoverId);

              for (const part of participants) {
                await emitDomainNotificationEvent({
                  tx,
                  deps,
                  eventType: 'HANDOVER_SCHEDULED',
                  recipientUid: part.uid,
                  idempotencyKey: `ho_sched_${handoverId}_${part.uid}`,
                  correlationId: params.correlationId,
                  nowTs: ts,
                  variables: {
                    handoverId,
                    propertyRefId,
                    handoverType,
                    scheduledAtIso,
                  },
                });
              }

              await recordManagementActivity({
                tx,
                deps,
                principal: params.principal,
                actorRole: authCtx.actorRole,
                propertyRefId,
                entityType: 'HANDOVER',
                entityId: handoverId,
                action: 'handover.scheduled',
                summary: `Handover ${handoverId} (${handoverType}) proposed for ${scheduledAtIso}.`,
                correlationId: params.correlationId,
                nowTs: ts,
              });

              return handoverDoc;
            },
          );
          return { statusCode: 201, body: created };
        },
      });

      return { handover: outcome.body, replayed: outcome.replayed };
    },

    async confirmOrDisputeHandover(params: {
      principal: AuthenticatedPrincipal;
      handoverId: string;
      action: 'CONFIRM' | 'RECORD_DISAGREEMENT';
      note?: string;
      evidenceMediaIds?: string[];
      correlationId: string;
    }): Promise<PropertyHandoverRecord> {
      await requireAuthenticatedVerifiedUser(params.principal, deps);
      const handoverId = requireValidId(params.handoverId, 'handoverId');
      const evidenceMediaIds = params.evidenceMediaIds
        ? requireIdArray(params.evidenceMediaIds, 'evidenceMediaIds')
        : [];
      await verifyMediaIdsIfSupplied(deps, evidenceMediaIds, params.principal.uid);

      return runDurableTransaction(
        deps.txRunner,
        { operationName: 'pm.handover.confirm_or_dispute', maxAttempts: 3 },
        async (tx) => {
          const snap = await tx.get<PropertyHandoverRecord>(`pmHandovers/${handoverId}`);
          if (!snap.exists || !snap.data) {
            throw new CoreApiError('NOT_FOUND', 404, `Handover "${handoverId}" not found.`);
          }
          const ho = snap.data;

          const partIdx = ho.participants.findIndex((p) => p.uid === params.principal.uid);
          if (partIdx < 0) {
            throw new CoreApiError(
              'FORBIDDEN',
              403,
              'Only a listed participant on this handover record may confirm or record a disagreement.',
            );
          }

          const ts = nowTimestamp(deps);
          const participant = ho.participants[partIdx]!;

          if (params.action === 'RECORD_DISAGREEMENT') {
            const statement = requireCleanString(params.note, 'note', 3, 600);
            assertNoSecretCredentialsInText(statement, 'note');

            // Section 12: Record disagreements without silently changing the original report
            const updated: PropertyHandoverRecord = {
              ...ho,
              disagreements: [
                ...ho.disagreements,
                {
                  disagreementId: `hodis_${crypto.randomBytes(4).toString('hex')}`,
                  reportedByUid: params.principal.uid,
                  reportedByRole: participant.role,
                  statement,
                  evidenceMediaIds,
                  recordedAt: ts,
                },
              ],
              confirmationState: 'DISPUTED',
              revision: ho.revision + 1,
              updatedAt: ts,
            };
            tx.set(`pmHandovers/${handoverId}`, updated as unknown as Record<string, unknown>);
            return updated;
          }

          const nextParticipants = ho.participants.map((p, idx) =>
            idx === partIdx
              ? {
                  ...p,
                  confirmed: true,
                  confirmedAt: ts,
                  ...(params.note ? { confirmationNote: sanitizeNote(params.note) } : {}),
                }
              : p,
          );
          const allConfirmed = nextParticipants.every((p) => p.confirmed);
          const nextState = allConfirmed ? 'COMPLETED_CONFIRMED' : 'PARTIALLY_CONFIRMED';

          const updated: PropertyHandoverRecord = {
            ...ho,
            participants: nextParticipants,
            confirmationState: nextState,
            ...(allConfirmed ? { completedAtIso: ts.iso } : {}),
            revision: ho.revision + 1,
            updatedAt: ts,
          };

          tx.set(`pmHandovers/${handoverId}`, updated as unknown as Record<string, unknown>);

          if (allConfirmed) {
            for (const part of nextParticipants) {
              await emitDomainNotificationEvent({
                tx,
                deps,
                eventType: 'HANDOVER_COMPLETED',
                recipientUid: part.uid,
                idempotencyKey: `ho_comp_${handoverId}_${part.uid}`,
                correlationId: params.correlationId,
                nowTs: ts,
                variables: {
                  handoverId,
                  propertyRefId: ho.propertyRefId,
                  handoverType: ho.handoverType,
                  completedAtIso: ts.iso,
                },
              });
            }
          }

          return updated;
        },
      );
    },
  };
}

function sanitizeNote(note: string): string {
  assertNoSecretCredentialsInText(note, 'note');
  return requireCleanString(note, 'note', 1, 400);
}
