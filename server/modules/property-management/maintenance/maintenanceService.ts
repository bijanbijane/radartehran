import crypto from 'crypto';
import {
  CoreApiError,
  executeIdempotentMutation,
  runDurableTransaction,
  type AuthenticatedPrincipal,
  type IdempotencyStoreAdapter,
} from '../../core';
import type { PropertyManagementModuleDependencies } from '../contracts/externalAdapters';
import type { OccupancyRecord } from '../domain/models';
import type {
  MaintenanceRequestRecord,
  MaintenanceWorkflowState,
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
  MAINTENANCE_URGENCY_VALUES,
  requireCleanString,
  requireEnum,
  requireIdArray,
  requireMaintenanceCategory,
  requireNonNegativeAmount,
  requireOptionalId,
  requireValidId,
} from '../schemas/validation';

export function createMaintenanceService(
  deps: PropertyManagementModuleDependencies,
  idempotencyStore: IdempotencyStoreAdapter,
) {
  const nowMs = () => (deps.nowFn ? deps.nowFn() : Date.now());

  return {
    async submitMaintenanceRequest(params: {
      principal: AuthenticatedPrincipal;
      idempotencyKey: string;
      correlationId: string;
      rawBody: unknown;
    }): Promise<{ maintenanceRequest: MaintenanceRequestRecord; replayed: boolean }> {
      await requireAuthenticatedVerifiedUser(params.principal, deps);
      const body = assertPlainObjectWithNoUntrustedIdentity(params.rawBody);

      const propertyRefId = requireValidId(body.propertyRefId, 'propertyRefId');
      const issueCategory = requireMaintenanceCategory(body.issueCategory, 'issueCategory');
      const description = requireCleanString(body.description, 'description', 4, 1500);
      assertNoSecretCredentialsInText(description, 'description');

      const urgency = requireEnum(body.urgency ?? 'MEDIUM', 'urgency', MAINTENANCE_URGENCY_VALUES);
      const affectedArea = requireCleanString(body.affectedArea ?? 'General unit area', 'affectedArea', 2, 160);
      const privateAccessRequirements = requireCleanString(
        body.privateAccessRequirements ?? 'Contact tenant to schedule entry window',
        'privateAccessRequirements',
        2,
        400,
      );
      assertNoSecretCredentialsInText(privateAccessRequirements, 'privateAccessRequirements');

      const isCommonAreaOrBuildingEquipment = body.isCommonAreaOrBuildingEquipment === true;
      const evidenceMediaIds = requireIdArray(body.evidenceMediaIds, 'evidenceMediaIds');
      const estimatedCostAmount =
        body.estimatedCostAmount !== undefined
          ? requireNonNegativeAmount(body.estimatedCostAmount, 'estimatedCostAmount', 0)
          : undefined;
      const currency = requireEnum(body.currency ?? 'TOMAN', 'currency', ['IRT', 'TOMAN', 'IRR'] as const);

      await verifyMediaIdsIfSupplied(deps, evidenceMediaIds, params.principal.uid);

      const outcome = await executeIdempotentMutation<MaintenanceRequestRecord>({
        store: idempotencyStore,
        actorUid: params.principal.uid,
        operation: 'pm.maintenance.submit',
        idempotencyKey: params.idempotencyKey,
        requestPayload: body,
        nowEpochMs: nowMs(),
        mutationFn: async () => {
          const created = await runDurableTransaction(
            deps.txRunner,
            { operationName: 'pm.maintenance.submit', maxAttempts: 3 },
            async (tx) => {
              const occupancies = await loadIndexedRecords<OccupancyRecord>(
                tx,
                `pmPropertyOccupanciesIndex/${propertyRefId}`,
                'pmOccupancies',
              );
              const activeTenantOcc = occupancies.find(
                (o) =>
                  (o.tenantUid === params.principal.uid ||
                    o.authorizedCoOccupantUids.includes(params.principal.uid)) &&
                  (o.status === 'ACTIVE' || o.status === 'SCHEDULED'),
              );

              let requestingRole: 'TENANT' | 'LANDLORD' | 'AUTHORIZED_MANAGER' = 'TENANT';
              let recipientForNotification = params.principal.uid;
              let buildingRefId: string | undefined;
              let unitRefId: string | undefined;

              if (activeTenantOcc && !isCommonAreaOrBuildingEquipment) {
                const propSnap = await deps.propertyRegistry.getPropertyOrUnitSnapshot(propertyRefId);
                if (!propSnap) {
                  throw new CoreApiError('NOT_FOUND', 404, `Property "${propertyRefId}" not found.`);
                }
                requestingRole = 'TENANT';
                recipientForNotification = propSnap.verifiedOwnerUids[0] ?? params.principal.uid;
                buildingRefId = propSnap.buildingRefId;
                unitRefId = propSnap.unitRefId;
              } else {
                const authCtx = await verifyActorAuthorityForProperty({
                  tx,
                  deps,
                  principal: params.principal,
                  propertyRefId,
                  requiredScope: 'MAINTENANCE_COORDINATION',
                  nowEpochMs: nowMs(),
                });
                requestingRole = authCtx.actorRole === 'OWNER' ? 'LANDLORD' : 'AUTHORIZED_MANAGER';
                recipientForNotification =
                  authCtx.propertySnapshot.verifiedOwnerUids[0] ?? params.principal.uid;
                buildingRefId = authCtx.propertySnapshot.buildingRefId;
                unitRefId = authCtx.propertySnapshot.unitRefId;
              }

              const ts = nowTimestamp(deps);
              const requestId = `pmmnt_${crypto.randomBytes(6).toString('hex')}`;
              const doc: MaintenanceRequestRecord = {
                id: requestId,
                propertyRefId,
                ...(buildingRefId ? { buildingRefId } : {}),
                ...(unitRefId ? { unitRefId } : {}),
                isCommonAreaOrBuildingEquipment,
                requestingParticipantUid: params.principal.uid,
                requestingParticipantRole: requestingRole,
                issueCategory,
                description,
                urgency,
                affectedArea,
                privateAccessRequirements,
                evidenceMediaIds,
                costTracking: {
                  ...(estimatedCostAmount !== undefined ? { estimatedCostAmount } : {}),
                  currency,
                },
                status: 'SUBMITTED',
                history: [
                  {
                    fromStatus: 'NONE',
                    toStatus: 'SUBMITTED',
                    actorUid: params.principal.uid,
                    occurredAt: ts,
                    note: description,
                  },
                ],
                revision: 1,
                createdAt: ts,
                updatedAt: ts,
              };

              tx.set(`pmMaintenanceRequests/${requestId}`, doc as unknown as Record<string, unknown>);
              await appendToCollectionIndex(
                tx,
                `pmPropertyMaintenanceIndex/${propertyRefId}`,
                requestId,
              );

              await emitDomainNotificationEvent({
                tx,
                deps,
                eventType: 'MAINTENANCE_REQUEST_SUBMITTED',
                recipientUid: recipientForNotification,
                idempotencyKey: `mnt_sub_${requestId}`,
                correlationId: params.correlationId,
                nowTs: ts,
                variables: {
                  maintenanceRequestId: requestId,
                  propertyRefId,
                  issueCategory,
                  urgency,
                },
              });

              await recordManagementActivity({
                tx,
                deps,
                principal: params.principal,
                actorRole: requestingRole,
                propertyRefId,
                entityType: 'MAINTENANCE',
                entityId: requestId,
                action: 'maintenance.submitted',
                summary: `Maintenance request ${requestId} (${issueCategory}, ${urgency}) submitted.`,
                correlationId: params.correlationId,
                nowTs: ts,
              });

              return doc;
            },
          );
          return { statusCode: 201, body: created };
        },
      });

      return { maintenanceRequest: outcome.body, replayed: outcome.replayed };
    },

    async processMaintenanceRequestAndSpending(params: {
      principal: AuthenticatedPrincipal;
      maintenanceRequestId: string;
      targetStatus: MaintenanceWorkflowState;
      estimatedCostAmount?: number;
      agreedCostAmount?: number;
      confirmedPaymentExternalRefId?: string;
      note?: string;
      correlationId: string;
    }): Promise<MaintenanceRequestRecord> {
      await requireAuthenticatedVerifiedUser(params.principal, deps);
      const maintenanceRequestId = requireValidId(
        params.maintenanceRequestId,
        'maintenanceRequestId',
      );
      const confirmedPaymentExternalRefId = requireOptionalId(
        params.confirmedPaymentExternalRefId,
        'confirmedPaymentExternalRefId',
      );

      let confirmedPaidAmount: number | undefined;
      if (confirmedPaymentExternalRefId) {
        if (!deps.paymentAuthority) {
          throw new CoreApiError(
            'PERSISTENCE_FAILED',
            503,
            'Payment Authority adapter is required to verify confirmed maintenance payment.',
          );
        }
        const verifiedPay = await deps.paymentAuthority.verifyAuthoritativePaymentEvent(
          confirmedPaymentExternalRefId,
        );
        if (
          !verifiedPay ||
          !verifiedPay.authoritativeSignatureVerified ||
          verifiedPay.status !== 'PAYMENT_CONFIRMED_AUTHORITATIVE'
        ) {
          throw new CoreApiError(
            'VALIDATION_FAILED',
            400,
            `Maintenance payment reference "${confirmedPaymentExternalRefId}" is not authoritatively confirmed.`,
          );
        }
        confirmedPaidAmount = verifiedPay.amount;
      }

      return runDurableTransaction(
        deps.txRunner,
        { operationName: 'pm.maintenance.process', maxAttempts: 3 },
        async (tx) => {
          const snap = await tx.get<MaintenanceRequestRecord>(
            `pmMaintenanceRequests/${maintenanceRequestId}`,
          );
          if (!snap.exists || !snap.data) {
            throw new CoreApiError(
              'NOT_FOUND',
              404,
              `Maintenance request "${maintenanceRequestId}" not found.`,
            );
          }
          const reqDoc = snap.data;

          // Validate who may approve work and spending (Section 14)
          const authCtx = await verifyActorAuthorityForProperty({
            tx,
            deps,
            principal: params.principal,
            propertyRefId: reqDoc.propertyRefId,
            requiredScope: 'MAINTENANCE_COORDINATION',
            nowEpochMs: nowMs(),
          });

          const ts = nowTimestamp(deps);
          const nextEstimated =
            params.estimatedCostAmount !== undefined
              ? requireNonNegativeAmount(params.estimatedCostAmount, 'estimatedCostAmount', 0)
              : reqDoc.costTracking.estimatedCostAmount;
          const nextAgreed =
            params.agreedCostAmount !== undefined
              ? requireNonNegativeAmount(params.agreedCostAmount, 'agreedCostAmount', 0)
              : reqDoc.costTracking.agreedCostAmount;

          const isApproved = params.targetStatus === 'APPROVED';
          const isCompleted = params.targetStatus === 'COMPLETED';
          const isRejected = params.targetStatus === 'REJECTED';

          const updated: MaintenanceRequestRecord = {
            ...reqDoc,
            assignedManagerUid:
              authCtx.actorRole === 'AUTHORIZED_MANAGER'
                ? params.principal.uid
                : reqDoc.assignedManagerUid,
            costTracking: {
              ...reqDoc.costTracking,
              ...(nextEstimated !== undefined ? { estimatedCostAmount: nextEstimated } : {}),
              ...(nextAgreed !== undefined ? { agreedCostAmount: nextAgreed } : {}),
              ...(confirmedPaidAmount !== undefined ? { confirmedPaidAmount } : {}),
              ...(confirmedPaymentExternalRefId ? { confirmedPaymentExternalRefId } : {}),
              ...(isApproved || nextAgreed !== undefined
                ? { spendingApprovedByUid: params.principal.uid, spendingApprovedAt: ts }
                : {}),
            },
            status: params.targetStatus,
            ...(isCompleted ? { completedAt: ts } : {}),
            history: [
              ...reqDoc.history,
              {
                fromStatus: reqDoc.status,
                toStatus: params.targetStatus,
                actorUid: params.principal.uid,
                occurredAt: ts,
                ...(params.note
                  ? { note: requireCleanString(params.note, 'note', 1, 300) }
                  : {}),
              },
            ],
            revision: reqDoc.revision + 1,
            updatedAt: ts,
          };

          tx.set(
            `pmMaintenanceRequests/${maintenanceRequestId}`,
            updated as unknown as Record<string, unknown>,
          );

          if (isApproved || isRejected || isCompleted) {
            const evtType = isApproved
              ? 'MAINTENANCE_APPROVED'
              : isRejected
                ? 'MAINTENANCE_REJECTED'
                : 'MAINTENANCE_COMPLETED';
            await emitDomainNotificationEvent({
              tx,
              deps,
              eventType: evtType,
              recipientUid: reqDoc.requestingParticipantUid,
              idempotencyKey: `mnt_${params.targetStatus.toLowerCase()}_${maintenanceRequestId}`,
              correlationId: params.correlationId,
              nowTs: ts,
              variables: {
                maintenanceRequestId,
                propertyRefId: reqDoc.propertyRefId,
                status: params.targetStatus,
              },
            });
          }

          return updated;
        },
      );
    },

    async assignServiceProviderToMaintenance(params: {
      principal: AuthenticatedPrincipal;
      maintenanceRequestId: string;
      serviceProviderRefId: string;
      workOrderRefId?: string;
      correlationId: string;
    }): Promise<MaintenanceRequestRecord> {
      await requireAuthenticatedVerifiedUser(params.principal, deps);
      const maintenanceRequestId = requireValidId(
        params.maintenanceRequestId,
        'maintenanceRequestId',
      );
      const serviceProviderRefId = requireValidId(
        params.serviceProviderRefId,
        'serviceProviderRefId',
      );
      const workOrderRefId = requireOptionalId(params.workOrderRefId, 'workOrderRefId');

      if (!deps.propertyServices) {
        throw new CoreApiError(
          'PERSISTENCE_FAILED',
          503,
          'Property Services adapter is required to verify service provider and work order references.',
        );
      }

      const providerSnap = await deps.propertyServices.verifyServiceProvider(serviceProviderRefId);
      if (!providerSnap || !providerSnap.active || providerSnap.verifiedCredentialState === 'SUSPENDED') {
        throw new CoreApiError(
          'VALIDATION_FAILED',
          400,
          `Service provider "${serviceProviderRefId}" is invalid, inactive, or suspended in Property Services.`,
        );
      }

      if (workOrderRefId) {
        const woSnap = await deps.propertyServices.verifyWorkOrderReference(
          workOrderRefId,
          serviceProviderRefId,
        );
        if (!woSnap) {
          throw new CoreApiError(
            'VALIDATION_FAILED',
            400,
            `Work order reference "${workOrderRefId}" could not be verified for provider "${serviceProviderRefId}".`,
          );
        }
      }

      return runDurableTransaction(
        deps.txRunner,
        { operationName: 'pm.maintenance.assign_provider', maxAttempts: 3 },
        async (tx) => {
          const snap = await tx.get<MaintenanceRequestRecord>(
            `pmMaintenanceRequests/${maintenanceRequestId}`,
          );
          if (!snap.exists || !snap.data) {
            throw new CoreApiError(
              'NOT_FOUND',
              404,
              `Maintenance request "${maintenanceRequestId}" not found.`,
            );
          }
          const reqDoc = snap.data;

          await verifyActorAuthorityForProperty({
            tx,
            deps,
            principal: params.principal,
            propertyRefId: reqDoc.propertyRefId,
            requiredScope: 'MAINTENANCE_COORDINATION',
            nowEpochMs: nowMs(),
          });

          const ts = nowTimestamp(deps);
          const nextStatus: MaintenanceWorkflowState = workOrderRefId
            ? 'SCHEDULED'
            : 'PROVIDER_REQUESTED';

          const updated: MaintenanceRequestRecord = {
            ...reqDoc,
            serviceProviderRefId,
            ...(workOrderRefId ? { workOrderRefId } : {}),
            status: nextStatus,
            history: [
              ...reqDoc.history,
              {
                fromStatus: reqDoc.status,
                toStatus: nextStatus,
                actorUid: params.principal.uid,
                occurredAt: ts,
                note: `Assigned provider ${serviceProviderRefId}${workOrderRefId ? ` (workOrder ${workOrderRefId})` : ''}`,
              },
            ],
            revision: reqDoc.revision + 1,
            updatedAt: ts,
          };

          tx.set(
            `pmMaintenanceRequests/${maintenanceRequestId}`,
            updated as unknown as Record<string, unknown>,
          );
          return updated;
        },
      );
    },

    async getAuthorizedMaintenanceRequest(params: {
      principal: AuthenticatedPrincipal;
      maintenanceRequestId: string;
    }): Promise<MaintenanceRequestRecord> {
      await requireAuthenticatedVerifiedUser(params.principal, deps);
      const maintenanceRequestId = requireValidId(
        params.maintenanceRequestId,
        'maintenanceRequestId',
      );

      return runDurableTransaction(
        deps.txRunner,
        { operationName: 'pm.maintenance.get', maxAttempts: 2 },
        async (tx) => {
          const snap = await tx.get<MaintenanceRequestRecord>(
            `pmMaintenanceRequests/${maintenanceRequestId}`,
          );
          if (!snap.exists || !snap.data) {
            throw new CoreApiError(
              'NOT_FOUND',
              404,
              `Maintenance request "${maintenanceRequestId}" not found.`,
            );
          }
          const reqDoc = snap.data;

          if (reqDoc.requestingParticipantUid === params.principal.uid) {
            return reqDoc;
          }

          await verifyActorAuthorityForProperty({
            tx,
            deps,
            principal: params.principal,
            propertyRefId: reqDoc.propertyRefId,
            requiredScope: 'MAINTENANCE_COORDINATION',
            nowEpochMs: nowMs(),
          });
          return reqDoc;
        },
      );
    },
  };
}
