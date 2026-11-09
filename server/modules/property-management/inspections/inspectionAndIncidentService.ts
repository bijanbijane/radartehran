import crypto from 'crypto';
import {
  CoreApiError,
  executeIdempotentMutation,
  runDurableTransaction,
  type AuthenticatedPrincipal,
  type IdempotencyStoreAdapter,
} from '../../core';
import type {
  PropertyManagementModuleDependencies,
  TrustAndSafetyCaseCategory,
} from '../contracts/externalAdapters';
import type { OccupancyRecord } from '../domain/models';
import type {
  InspectionConditionCategoryEntry,
  PropertyIncidentRecord,
  PropertyInspectionRecord,
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
  INCIDENT_CATEGORIES,
  INCIDENT_SEVERITIES,
  INSPECTION_TYPES,
  requireCleanString,
  requireEnum,
  requireIdArray,
  requireIsoDateString,
  requireOptionalId,
  requireValidId,
} from '../schemas/validation';

const NON_INSURANCE_LEGAL_DISCLAIMER =
  'OPERATIONAL_INCIDENT_RECORD_ONLY: Does not constitute an insurance coverage determination, liability ruling, or legal finding.';

const TRUST_SAFETY_CATEGORIES: readonly TrustAndSafetyCaseCategory[] = [
  'TENANT_LANDLORD_DISPUTE',
  'UNAUTHORIZED_PROPERTY_ACCESS',
  'SUSPECTED_IMPERSONATION',
  'FRAUDULENT_PAYMENT_CLAIM',
  'PROPERTY_DAMAGE_DISPUTE',
  'HARASSMENT_OR_SAFETY_REPORT',
  'UNAUTHORIZED_MANAGEMENT_ACTIVITY',
];

function parseConditionCategories(raw: unknown): InspectionConditionCategoryEntry[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new CoreApiError(
      'VALIDATION_FAILED',
      400,
      'conditionCategories must be a non-empty array.',
    );
  }
  return raw.map((item, idx) => {
    const obj = assertPlainObjectWithNoUntrustedIdentity(item);
    return {
      categoryName: requireCleanString(
        obj.categoryName,
        `conditionCategories[${idx}].categoryName`,
        2,
        80,
      ),
      rating: requireEnum(
        obj.rating,
        `conditionCategories[${idx}].rating`,
        ['EXCELLENT', 'GOOD', 'FAIR', 'POOR', 'DAMAGED'] as const,
      ),
      notes: requireCleanString(obj.notes ?? 'Recorded', `conditionCategories[${idx}].notes`, 1, 300),
    };
  });
}

function parseStringList(raw: unknown, fieldName: string): string[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    throw new CoreApiError('VALIDATION_FAILED', 400, `${fieldName} must be an array of strings.`);
  }
  return raw.map((item, idx) => requireCleanString(item, `${fieldName}[${idx}]`, 2, 300));
}

export function createInspectionAndIncidentService(
  deps: PropertyManagementModuleDependencies,
  idempotencyStore: IdempotencyStoreAdapter,
) {
  const nowMs = () => (deps.nowFn ? deps.nowFn() : Date.now());

  return {
    async recordPropertyInspection(params: {
      principal: AuthenticatedPrincipal;
      idempotencyKey: string;
      correlationId: string;
      rawBody: unknown;
    }): Promise<{ inspection: PropertyInspectionRecord; replayed: boolean }> {
      await requireAuthenticatedVerifiedUser(params.principal, deps);
      const body = assertPlainObjectWithNoUntrustedIdentity(params.rawBody);

      const propertyRefId = requireValidId(body.propertyRefId, 'propertyRefId');
      const relatedOccupancyId = requireOptionalId(body.relatedOccupancyId, 'relatedOccupancyId');
      const relatedAgreementId = requireOptionalId(body.relatedAgreementId, 'relatedAgreementId');
      const inspectionType = requireEnum(body.inspectionType, 'inspectionType', INSPECTION_TYPES);
      const inspectionDateIso = requireIsoDateString(body.inspectionDateIso, 'inspectionDateIso');
      const conditionCategories = parseConditionCategories(body.conditionCategories);
      const reportedDefects = parseStringList(body.reportedDefects, 'reportedDefects');
      const maintenanceRecommendations = parseStringList(
        body.maintenanceRecommendations,
        'maintenanceRecommendations',
      );
      const evidenceMediaIds = requireIdArray(body.evidenceMediaIds, 'evidenceMediaIds');
      const followUpMaintenanceRequestIds = requireIdArray(
        body.followUpMaintenanceRequestIds,
        'followUpMaintenanceRequestIds',
      );
      const status = requireEnum(
        body.status ?? 'COMPLETED',
        'status',
        ['SCHEDULED', 'COMPLETED', 'FOLLOW_UP_REQUIRED'] as const,
      );

      await verifyMediaIdsIfSupplied(deps, evidenceMediaIds, params.principal.uid);

      const outcome = await executeIdempotentMutation<PropertyInspectionRecord>({
        store: idempotencyStore,
        actorUid: params.principal.uid,
        operation: 'pm.inspection.record',
        idempotencyKey: params.idempotencyKey,
        requestPayload: body,
        nowEpochMs: nowMs(),
        mutationFn: async () => {
          const created = await runDurableTransaction(
            deps.txRunner,
            { operationName: 'pm.inspection.record', maxAttempts: 3 },
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
              const inspectionId = `pminsp_${crypto.randomBytes(6).toString('hex')}`;
              const inPersonRecorded = body.inPersonAttendanceConfirmed === true;

              const doc: PropertyInspectionRecord = {
                id: inspectionId,
                propertyRefId,
                ...(authCtx.propertySnapshot.buildingRefId
                  ? { buildingRefId: authCtx.propertySnapshot.buildingRefId }
                  : {}),
                ...(authCtx.propertySnapshot.unitRefId
                  ? { unitRefId: authCtx.propertySnapshot.unitRefId }
                  : {}),
                ...(relatedOccupancyId ? { relatedOccupancyId } : {}),
                ...(relatedAgreementId ? { relatedAgreementId } : {}),
                inspectionType,
                inspectionDateIso,
                inspectorUid: params.principal.uid,
                inspectorRole:
                  authCtx.actorRole === 'OWNER' ? 'LANDLORD' : 'AUTHORIZED_MANAGER',
                inPersonAttendanceRecordedByAuthorizedActor: inPersonRecorded,
                assessmentDistinction:
                  'OPERATIONAL_INSPECTION_NOT_CERTIFIED_ENGINEERING_ASSESSMENT',
                originalFindingsSnapshot: {
                  conditionCategories,
                  reportedDefects,
                  maintenanceRecommendations,
                },
                conditionCategories,
                reportedDefects,
                maintenanceRecommendations,
                evidenceMediaIds,
                status,
                followUpMaintenanceRequestIds,
                currentVersion: 1,
                amendmentHistory: [],
                revision: 1,
                createdAt: ts,
                updatedAt: ts,
              };

              tx.set(`pmInspections/${inspectionId}`, doc as unknown as Record<string, unknown>);
              await appendToCollectionIndex(
                tx,
                `pmPropertyInspectionsIndex/${propertyRefId}`,
                inspectionId,
              );

              await emitDomainNotificationEvent({
                tx,
                deps,
                eventType: 'INSPECTION_SCHEDULED',
                recipientUid: authCtx.propertySnapshot.verifiedOwnerUids[0] ?? params.principal.uid,
                idempotencyKey: `insp_sched_${inspectionId}`,
                correlationId: params.correlationId,
                nowTs: ts,
                variables: {
                  inspectionId,
                  propertyRefId,
                  inspectionType,
                  inspectionDateIso,
                },
              });

              await recordManagementActivity({
                tx,
                deps,
                principal: params.principal,
                actorRole: authCtx.actorRole,
                propertyRefId,
                entityType: 'INSPECTION',
                entityId: inspectionId,
                action: 'inspection.recorded',
                summary: `Inspection ${inspectionId} (${inspectionType}) recorded by ${params.principal.uid}.`,
                correlationId: params.correlationId,
                nowTs: ts,
              });

              return doc;
            },
          );
          return { statusCode: 201, body: created };
        },
      });

      return { inspection: outcome.body, replayed: outcome.replayed };
    },

    async amendPropertyInspection(params: {
      principal: AuthenticatedPrincipal;
      inspectionId: string;
      amendmentReason: string;
      rawBody: unknown;
      correlationId: string;
    }): Promise<PropertyInspectionRecord> {
      await requireAuthenticatedVerifiedUser(params.principal, deps);
      const inspectionId = requireValidId(params.inspectionId, 'inspectionId');
      const amendmentReason = requireCleanString(params.amendmentReason, 'amendmentReason', 3, 300);
      const body = assertPlainObjectWithNoUntrustedIdentity(params.rawBody);

      return runDurableTransaction(
        deps.txRunner,
        { operationName: 'pm.inspection.amend', maxAttempts: 3 },
        async (tx) => {
          const snap = await tx.get<PropertyInspectionRecord>(`pmInspections/${inspectionId}`);
          if (!snap.exists || !snap.data) {
            throw new CoreApiError('NOT_FOUND', 404, `Inspection "${inspectionId}" not found.`);
          }
          const insp = snap.data;

          await verifyActorAuthorityForProperty({
            tx,
            deps,
            principal: params.principal,
            propertyRefId: insp.propertyRefId,
            requiredScope: 'INSPECTION_COORDINATION',
            nowEpochMs: nowMs(),
          });

          const nextCategories = body.conditionCategories
            ? parseConditionCategories(body.conditionCategories)
            : insp.conditionCategories;
          const nextDefects = body.reportedDefects
            ? parseStringList(body.reportedDefects, 'reportedDefects')
            : insp.reportedDefects;
          const nextRecs = body.maintenanceRecommendations
            ? parseStringList(body.maintenanceRecommendations, 'maintenanceRecommendations')
            : insp.maintenanceRecommendations;
          const nextEvidence = body.evidenceMediaIds
            ? requireIdArray(body.evidenceMediaIds, 'evidenceMediaIds')
            : insp.evidenceMediaIds;

          await verifyMediaIdsIfSupplied(deps, nextEvidence, params.principal.uid);

          const ts = nowTimestamp(deps);
          const nextVer = insp.currentVersion + 1;

          // Section 13: Preserve originalFindingsSnapshot unchanged; record versioned amendment
          const updated: PropertyInspectionRecord = {
            ...insp,
            conditionCategories: nextCategories,
            reportedDefects: nextDefects,
            maintenanceRecommendations: nextRecs,
            evidenceMediaIds: nextEvidence,
            status: 'AMENDED',
            currentVersion: nextVer,
            amendmentHistory: [
              ...insp.amendmentHistory,
              {
                versionNumber: nextVer,
                amendedByUid: params.principal.uid,
                amendmentReason,
                conditionCategories: nextCategories,
                reportedDefects: nextDefects,
                maintenanceRecommendations: nextRecs,
                evidenceMediaIds: nextEvidence,
                amendedAt: ts,
              },
            ],
            revision: insp.revision + 1,
            updatedAt: ts,
          };

          tx.set(`pmInspections/${inspectionId}`, updated as unknown as Record<string, unknown>);
          return updated;
        },
      );
    },

    async getAuthorizedPropertyInspection(params: {
      principal: AuthenticatedPrincipal;
      inspectionId: string;
    }): Promise<PropertyInspectionRecord> {
      await requireAuthenticatedVerifiedUser(params.principal, deps);
      const inspectionId = requireValidId(params.inspectionId, 'inspectionId');

      return runDurableTransaction(
        deps.txRunner,
        { operationName: 'pm.inspection.get', maxAttempts: 2 },
        async (tx) => {
          const snap = await tx.get<PropertyInspectionRecord>(`pmInspections/${inspectionId}`);
          if (!snap.exists || !snap.data) {
            throw new CoreApiError('NOT_FOUND', 404, `Inspection "${inspectionId}" not found.`);
          }
          const insp = snap.data;

          // Section 13 & 18: Do not expose private inspection evidence publicly; restrict to authorized manager/owner or linked occupancy tenant
          let isAuthorizedTenant = false;
          if (insp.relatedOccupancyId) {
            const occSnap = await tx.get<OccupancyRecord>(`pmOccupancies/${insp.relatedOccupancyId}`);
            if (occSnap.exists && occSnap.data?.tenantUid === params.principal.uid) {
              isAuthorizedTenant = true;
            }
          }
          if (!isAuthorizedTenant) {
            await verifyActorAuthorityForProperty({
              tx,
              deps,
              principal: params.principal,
              propertyRefId: insp.propertyRefId,
              requiredScope: 'INSPECTION_COORDINATION',
              nowEpochMs: nowMs(),
            });
          }

          return insp;
        },
      );
    },

    async recordPropertyIncident(params: {
      principal: AuthenticatedPrincipal;
      idempotencyKey: string;
      correlationId: string;
      rawBody: unknown;
    }): Promise<{ incident: PropertyIncidentRecord; replayed: boolean }> {
      await requireAuthenticatedVerifiedUser(params.principal, deps);
      const body = assertPlainObjectWithNoUntrustedIdentity(params.rawBody);

      const propertyRefId = requireValidId(body.propertyRefId, 'propertyRefId');
      const incidentCategory = requireEnum(body.incidentCategory, 'incidentCategory', INCIDENT_CATEGORIES);
      const description = requireCleanString(body.description, 'description', 5, 1500);
      assertNoSecretCredentialsInText(description, 'description');

      const reportedOccurrenceTimeIso = requireIsoDateString(
        body.reportedOccurrenceTimeIso,
        'reportedOccurrenceTimeIso',
      );
      const severity = requireEnum(body.severity, 'severity', INCIDENT_SEVERITIES);
      const evidenceMediaIds = requireIdArray(body.evidenceMediaIds, 'evidenceMediaIds');
      const immediateActions = parseStringList(body.immediateActions, 'immediateActions');
      const relatedMaintenanceRequestId = requireOptionalId(
        body.relatedMaintenanceRequestId,
        'relatedMaintenanceRequestId',
      );

      await verifyMediaIdsIfSupplied(deps, evidenceMediaIds, params.principal.uid);

      const outcome = await executeIdempotentMutation<PropertyIncidentRecord>({
        store: idempotencyStore,
        actorUid: params.principal.uid,
        operation: 'pm.incident.record',
        idempotencyKey: params.idempotencyKey,
        requestPayload: body,
        nowEpochMs: nowMs(),
        mutationFn: async () => {
          const created = await runDurableTransaction(
            deps.txRunner,
            { operationName: 'pm.incident.record', maxAttempts: 3 },
            async (tx) => {
              const occupancies = await loadIndexedRecords<OccupancyRecord>(
                tx,
                `pmPropertyOccupanciesIndex/${propertyRefId}`,
                'pmOccupancies',
              );
              const isTenant = occupancies.some(
                (o) =>
                  (o.tenantUid === params.principal.uid ||
                    o.authorizedCoOccupantUids.includes(params.principal.uid)) &&
                  (o.status === 'ACTIVE' || o.status === 'SCHEDULED'),
              );

              let reportingRole: 'TENANT' | 'LANDLORD' | 'AUTHORIZED_MANAGER' = 'TENANT';
              let ownerUidForAlert = params.principal.uid;

              if (isTenant) {
                const propSnap = await deps.propertyRegistry.getPropertyOrUnitSnapshot(propertyRefId);
                if (!propSnap) {
                  throw new CoreApiError('NOT_FOUND', 404, `Property "${propertyRefId}" not found.`);
                }
                ownerUidForAlert = propSnap.verifiedOwnerUids[0] ?? params.principal.uid;
              } else {
                const authCtx = await verifyActorAuthorityForProperty({
                  tx,
                  deps,
                  principal: params.principal,
                  propertyRefId,
                  requiredScope: 'MAINTENANCE_COORDINATION',
                  nowEpochMs: nowMs(),
                });
                reportingRole = authCtx.actorRole === 'OWNER' ? 'LANDLORD' : 'AUTHORIZED_MANAGER';
                ownerUidForAlert = authCtx.propertySnapshot.verifiedOwnerUids[0] ?? params.principal.uid;
              }

              const ts = nowTimestamp(deps);
              const incidentId = `pminc_${crypto.randomBytes(6).toString('hex')}`;

              // Section 15: Distinguish allegation from confirmed finding; preserve originalReport snapshot
              const doc: PropertyIncidentRecord = {
                id: incidentId,
                propertyRefId,
                reportingPartyUid: params.principal.uid,
                reportingPartyRole: reportingRole,
                incidentCategory,
                originalReport: {
                  description,
                  reportedOccurrenceTimeIso,
                  submittedAtIso: ts.iso,
                  severity,
                  evidenceMediaIds,
                },
                findingClassification: 'ALLEGATION_UNCONFIRMED',
                nonInsuranceNonLegalDisclaimer: NON_INSURANCE_LEGAL_DISCLAIMER,
                immediateActions,
                subsequentUpdates: [],
                ...(relatedMaintenanceRequestId ? { relatedMaintenanceRequestId } : {}),
                resolutionStatus: immediateActions.length > 0 ? 'IMMEDIATE_ACTION_TAKEN' : 'OPEN',
                revision: 1,
                createdAt: ts,
                updatedAt: ts,
              };

              tx.set(`pmIncidents/${incidentId}`, doc as unknown as Record<string, unknown>);
              await appendToCollectionIndex(tx, `pmPropertyIncidentsIndex/${propertyRefId}`, incidentId);

              await emitDomainNotificationEvent({
                tx,
                deps,
                eventType: 'PROPERTY_INCIDENT_REPORTED',
                recipientUid: ownerUidForAlert,
                idempotencyKey: `inc_rep_${incidentId}`,
                correlationId: params.correlationId,
                nowTs: ts,
                variables: {
                  incidentId,
                  propertyRefId,
                  incidentCategory,
                  severity,
                },
              });

              await recordManagementActivity({
                tx,
                deps,
                principal: params.principal,
                actorRole: reportingRole,
                propertyRefId,
                entityType: 'INCIDENT',
                entityId: incidentId,
                action: 'incident.reported',
                summary: `Incident ${incidentId} (${incidentCategory}, ${severity}) reported.`,
                correlationId: params.correlationId,
                nowTs: ts,
              });

              return doc;
            },
          );
          return { statusCode: 201, body: created };
        },
      });

      return { incident: outcome.body, replayed: outcome.replayed };
    },

    async appendIncidentUpdateOrEscalateToTrustSafety(params: {
      principal: AuthenticatedPrincipal;
      incidentId: string;
      note: string;
      findingClassification?: 'ALLEGATION_UNCONFIRMED' | 'OPERATIONAL_OBSERVATION' | 'CONFIRMED_OPERATIONAL_FINDING';
      resolutionStatus?: PropertyIncidentRecord['resolutionStatus'];
      escalateCategory?: TrustAndSafetyCaseCategory;
      additionalEvidenceMediaIds?: string[];
      correlationId: string;
    }): Promise<PropertyIncidentRecord> {
      await requireAuthenticatedVerifiedUser(params.principal, deps);
      const incidentId = requireValidId(params.incidentId, 'incidentId');
      const note = requireCleanString(params.note, 'note', 3, 800);
      assertNoSecretCredentialsInText(note, 'note');
      const additionalEvidenceMediaIds = params.additionalEvidenceMediaIds
        ? requireIdArray(params.additionalEvidenceMediaIds, 'additionalEvidenceMediaIds')
        : [];
      await verifyMediaIdsIfSupplied(deps, additionalEvidenceMediaIds, params.principal.uid);

      return runDurableTransaction(
        deps.txRunner,
        { operationName: 'pm.incident.update_or_escalate', maxAttempts: 3 },
        async (tx) => {
          const snap = await tx.get<PropertyIncidentRecord>(`pmIncidents/${incidentId}`);
          if (!snap.exists || !snap.data) {
            throw new CoreApiError('NOT_FOUND', 404, `Incident "${incidentId}" not found.`);
          }
          const inc = snap.data;

          const authCtx = await verifyActorAuthorityForProperty({
            tx,
            deps,
            principal: params.principal,
            propertyRefId: inc.propertyRefId,
            requiredScope: 'MAINTENANCE_COORDINATION',
            nowEpochMs: nowMs(),
          });

          const ts = nowTimestamp(deps);
          let investigationRefId = inc.trustAndSafetyInvestigationRefId;
          let trustCategory = inc.trustAndSafetyCategory;
          let nextStatus = params.resolutionStatus ?? inc.resolutionStatus;

          if (params.escalateCategory) {
            trustCategory = requireEnum(
              params.escalateCategory,
              'escalateCategory',
              TRUST_SAFETY_CATEGORIES,
            );
            if (deps.trustAndSafety) {
              const esc = await deps.trustAndSafety.escalateCase({
                escalationId: `tsesc_${crypto.randomBytes(4).toString('hex')}`,
                category: trustCategory,
                reportingUid: params.principal.uid,
                propertyRefId: inc.propertyRefId,
                relatedEntityType: 'INCIDENT',
                relatedEntityId: incidentId,
                summary: note,
                evidenceMediaIds: [
                  ...inc.originalReport.evidenceMediaIds,
                  ...additionalEvidenceMediaIds,
                ],
                correlationId: params.correlationId,
                createdAtIso: ts.iso,
              });
              investigationRefId = esc.investigationRefId;
            } else {
              investigationRefId = `tsref_pending_${incidentId}`;
            }
            nextStatus = 'ESCALATED_TO_TRUST_AND_SAFETY';
          }

          const nextClassification =
            params.findingClassification ?? inc.findingClassification;

          // Section 15: Preserve originalReport snapshot immutable; append subsequent update separately
          const updated: PropertyIncidentRecord = {
            ...inc,
            findingClassification: nextClassification,
            resolutionStatus: nextStatus,
            ...(investigationRefId
              ? { trustAndSafetyInvestigationRefId: investigationRefId }
              : {}),
            ...(trustCategory ? { trustAndSafetyCategory: trustCategory } : {}),
            subsequentUpdates: [
              ...inc.subsequentUpdates,
              {
                updateId: `incupd_${crypto.randomBytes(4).toString('hex')}`,
                authorUid: params.principal.uid,
                authorRole: authCtx.actorRole,
                note,
                findingClassification: nextClassification,
                additionalEvidenceMediaIds,
                recordedAt: ts,
              },
            ],
            revision: inc.revision + 1,
            updatedAt: ts,
          };

          tx.set(`pmIncidents/${incidentId}`, updated as unknown as Record<string, unknown>);
          return updated;
        },
      );
    },
  };
}
