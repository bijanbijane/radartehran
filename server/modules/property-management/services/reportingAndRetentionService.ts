import {
  CoreApiError,
  normalizePaginationParams,
  runDurableTransaction,
  type AuthenticatedPrincipal,
} from '../../core';
import type { PropertyManagementModuleDependencies } from '../contracts/externalAdapters';
import type {
  FinancialObligationScheduleRecord,
  ManagedPortfolioRecord,
  OccupancyRecord,
  RentalAgreementRecord,
} from '../domain/models';
import type {
  LeaseRenewalRequestRecord,
  MaintenanceRequestRecord,
  PortfolioOperationalReport,
  PropertyHandoverRecord,
  PropertyIncidentRecord,
  PropertyInspectionRecord,
  PropertyManagementActivityRecord,
} from '../domain/LifecycleAndReportingTypes';
import {
  canActorViewPortfolio,
  loadIndexedRecords,
  nowTimestamp,
  paginateRecordsByCreatedAt,
  requireAuthenticatedVerifiedUser,
  verifyActorAuthorityForProperty,
} from '../repositories/durableStoreHelpers';
import {
  requireIsoDateString,
  requireNonNegativeAmount,
  requireValidId,
} from '../schemas/validation';

export function createReportingAndRetentionService(
  deps: PropertyManagementModuleDependencies,
) {
  const nowMs = () => (deps.nowFn ? deps.nowFn() : Date.now());

  return {
    async retrieveAuthorizedManagementHistory(params: {
      principal: AuthenticatedPrincipal;
      propertyRefId?: string;
      portfolioId?: string;
      query?: Record<string, unknown>;
    }): Promise<{
      items: PropertyManagementActivityRecord[];
      hasMore: boolean;
      nextCursor: string | null;
      totalCount: number;
    }> {
      await requireAuthenticatedVerifiedUser(params.principal, deps);
      const pagination = normalizePaginationParams(params.query, { defaultLimit: 20, maxLimit: 50 });

      return runDurableTransaction(
        deps.txRunner,
        { operationName: 'pm.history.retrieve', maxAttempts: 2 },
        async (tx) => {
          if (params.portfolioId) {
            const portfolioId = requireValidId(params.portfolioId, 'portfolioId');
            const portSnap = await tx.get<ManagedPortfolioRecord>(`pmPortfolios/${portfolioId}`);
            if (!portSnap.exists || !portSnap.data) {
              throw new CoreApiError('NOT_FOUND', 404, `Portfolio "${portfolioId}" not found.`);
            }
            const allowed = await canActorViewPortfolio(tx, portSnap.data, params.principal, nowMs());
            if (!allowed) {
              throw new CoreApiError('FORBIDDEN', 403, 'Unauthorized portfolio history access.');
            }
            const records = await loadIndexedRecords<PropertyManagementActivityRecord>(
              tx,
              `pmPortfolioActivityIndex/${portfolioId}`,
              'pmActivityHistory',
            );
            const transformed = records.map((r) => ({ ...r, createdAt: r.occurredAt }));
            const paged = paginateRecordsByCreatedAt(transformed, pagination);
            return {
              ...paged,
              items: paged.items.map(({ createdAt: _c, ...rest }) => rest),
            };
          }

          const propertyRefId = requireValidId(params.propertyRefId, 'propertyRefId');
          await verifyActorAuthorityForProperty({
            tx,
            deps,
            principal: params.principal,
            propertyRefId,
            requiredScope: 'LIMITED_OPERATIONAL_ACCESS',
            nowEpochMs: nowMs(),
          });

          const records = await loadIndexedRecords<PropertyManagementActivityRecord>(
            tx,
            `pmPropertyActivityIndex/${propertyRefId}`,
            'pmActivityHistory',
          );
          const transformed = records.map((r) => ({ ...r, createdAt: r.occurredAt }));
          const paged = paginateRecordsByCreatedAt(transformed, pagination);
          return {
            ...paged,
            items: paged.items.map(({ createdAt: _c, ...rest }) => rest),
          };
        },
      );
    },

    async retrievePortfolioOperationalReport(params: {
      principal: AuthenticatedPrincipal;
      portfolioId: string;
      windowStartIso: string;
      windowEndIso: string;
      upcomingExpirationHorizonDays?: number;
    }): Promise<PortfolioOperationalReport> {
      await requireAuthenticatedVerifiedUser(params.principal, deps);
      const portfolioId = requireValidId(params.portfolioId, 'portfolioId');
      const windowStartIso = requireIsoDateString(params.windowStartIso, 'windowStartIso');
      const windowEndIso = requireIsoDateString(params.windowEndIso, 'windowEndIso');
      const upcomingExpirationHorizonDays =
        params.upcomingExpirationHorizonDays !== undefined
          ? requireNonNegativeAmount(
              params.upcomingExpirationHorizonDays,
              'upcomingExpirationHorizonDays',
              1,
              365,
            )
          : 30;

      const winStartMs = Date.parse(windowStartIso);
      const winEndMs = Date.parse(windowEndIso);
      if (winEndMs < winStartMs) {
        throw new CoreApiError('VALIDATION_FAILED', 400, 'windowEndIso must be >= windowStartIso.');
      }

      return runDurableTransaction(
        deps.txRunner,
        { operationName: 'pm.report.portfolio', maxAttempts: 2 },
        async (tx) => {
          const portSnap = await tx.get<ManagedPortfolioRecord>(`pmPortfolios/${portfolioId}`);
          if (!portSnap.exists || !portSnap.data) {
            throw new CoreApiError('NOT_FOUND', 404, `Portfolio "${portfolioId}" not found.`);
          }
          const portfolio = portSnap.data;
          const allowed = await canActorViewPortfolio(tx, portfolio, params.principal, nowMs());
          if (!allowed) {
            throw new CoreApiError('FORBIDDEN', 403, 'Unauthorized portfolio report access.');
          }

          const propertyIds = portfolio.propertyRefs.map((p) => p.propertyRefId);
          const ts = nowTimestamp(deps);
          const horizonEndMs =
            ts.epochMs + upcomingExpirationHorizonDays * 24 * 60 * 60 * 1000;

          let activeOccupancyCount = 0;
          let upcomingAgreementExpirationsCount = 0;
          let totalDecidedRenewalRequestsInWindow = 0;
          let acceptedRenewalsInWindow = 0;

          let scheduledObligationCount = 0;
          let scheduledRentTotalAmount = 0;
          let scheduledDepositTotalAmount = 0;
          let tenantSelfReportedPaidCount = 0;
          let tenantSelfReportedPaidAmount = 0;
          let authoritativeConfirmedPaidCount = 0;
          let authoritativeConfirmedPaidAmount = 0;
          let overdueObligationCount = 0;

          let totalMaintenanceRequests = 0;
          let completedMaintenanceRequests = 0;
          const maintenanceResolutionDurationsMs: number[] = [];

          let openIncidentsCount = 0;
          let hoScheduledCount = 0;
          let hoCompletedConfirmedCount = 0;
          let hoDisputedCount = 0;
          let totalInspectionsCount = 0;
          let followUpRequiredCount = 0;

          // Bounded per-property indexed lookups (no unbounded cross-module scans)
          for (const propId of propertyIds) {
            const occs = await loadIndexedRecords<OccupancyRecord>(
              tx,
              `pmPropertyOccupanciesIndex/${propId}`,
              'pmOccupancies',
            );
            activeOccupancyCount += occs.filter((o) => o.status === 'ACTIVE').length;

            const agreements = await loadIndexedRecords<RentalAgreementRecord>(
              tx,
              `pmPropertyAgreementsIndex/${propId}`,
              'pmRentalAgreements',
            );
            for (const agr of agreements) {
              const endMs = Date.parse(agr.endDateIso);
              if (
                (agr.status === 'ACTIVE' || agr.status === 'RENEWAL_PENDING') &&
                endMs >= ts.epochMs &&
                endMs <= horizonEndMs
              ) {
                upcomingAgreementExpirationsCount++;
              }

              const renewals = await loadIndexedRecords<LeaseRenewalRequestRecord>(
                tx,
                `pmAgreementRenewalsIndex/${agr.id}`,
                'pmRenewalRequests',
              );
              for (const ren of renewals) {
                if (
                  ren.decidedAt &&
                  ren.decidedAt.epochMs >= winStartMs &&
                  ren.decidedAt.epochMs <= winEndMs &&
                  (ren.status === 'ACCEPTED' || ren.status === 'REJECTED')
                ) {
                  totalDecidedRenewalRequestsInWindow++;
                  if (ren.status === 'ACCEPTED') acceptedRenewalsInWindow++;
                }
              }
            }

            const obligations = await loadIndexedRecords<FinancialObligationScheduleRecord>(
              tx,
              `pmPropertyObligationsIndex/${propId}`,
              'pmObligations',
            );
            for (const obl of obligations) {
              const dueMs = Date.parse(obl.dueDateIso);
              if (dueMs < winStartMs || dueMs > winEndMs || obl.status === 'CANCELLED') continue;

              scheduledObligationCount++;
              if (obl.obligationType === 'MONTHLY_RENT') {
                scheduledRentTotalAmount += obl.currentAmount;
              } else if (obl.obligationType === 'SECURITY_DEPOSIT') {
                scheduledDepositTotalAmount += obl.currentAmount;
              }

              if (obl.tenantSelfReportedAmount > 0 && obl.status !== 'PAYMENT_CONFIRMED') {
                tenantSelfReportedPaidCount++;
                tenantSelfReportedPaidAmount += obl.tenantSelfReportedAmount;
              }
              if (obl.status === 'PAYMENT_CONFIRMED' || obl.confirmedSettledAmount > 0) {
                authoritativeConfirmedPaidCount++;
                authoritativeConfirmedPaidAmount += obl.confirmedSettledAmount;
              }
              if (obl.status === 'OVERDUE') {
                overdueObligationCount++;
              }
            }

            const maintReqs = await loadIndexedRecords<MaintenanceRequestRecord>(
              tx,
              `pmPropertyMaintenanceIndex/${propId}`,
              'pmMaintenanceRequests',
            );
            for (const mnt of maintReqs) {
              if (mnt.createdAt.epochMs < winStartMs || mnt.createdAt.epochMs > winEndMs) continue;
              totalMaintenanceRequests++;
              if (mnt.status === 'COMPLETED' && mnt.completedAt) {
                completedMaintenanceRequests++;
                const durationMs = mnt.completedAt.epochMs - mnt.createdAt.epochMs;
                if (durationMs >= 0) maintenanceResolutionDurationsMs.push(durationMs);
              }
            }

            const incidents = await loadIndexedRecords<PropertyIncidentRecord>(
              tx,
              `pmPropertyIncidentsIndex/${propId}`,
              'pmIncidents',
            );
            for (const inc of incidents) {
              if (inc.resolutionStatus !== 'RESOLVED' && inc.resolutionStatus !== 'CLOSED') {
                openIncidentsCount++;
              }
            }

            const handovers = await loadIndexedRecords<PropertyHandoverRecord>(
              tx,
              `pmPropertyHandoversIndex/${propId}`,
              'pmHandovers',
            );
            for (const ho of handovers) {
              const schedMs = Date.parse(ho.scheduledAtIso);
              if (schedMs < winStartMs || schedMs > winEndMs) continue;
              hoScheduledCount++;
              if (ho.confirmationState === 'COMPLETED_CONFIRMED') hoCompletedConfirmedCount++;
              if (ho.confirmationState === 'DISPUTED') hoDisputedCount++;
            }

            const inspections = await loadIndexedRecords<PropertyInspectionRecord>(
              tx,
              `pmPropertyInspectionsIndex/${propId}`,
              'pmInspections',
            );
            for (const insp of inspections) {
              const inspMs = Date.parse(insp.inspectionDateIso);
              if (inspMs < winStartMs || inspMs > winEndMs) continue;
              totalInspectionsCount++;
              if (insp.status === 'FOLLOW_UP_REQUIRED') followUpRequiredCount++;
            }
          }

          const renewalRateRatio =
            totalDecidedRenewalRequestsInWindow > 0
              ? Number((acceptedRenewalsInWindow / totalDecidedRenewalRequestsInWindow).toFixed(4))
              : null;

          const averageResolutionTimeMs =
            maintenanceResolutionDurationsMs.length > 0
              ? Math.round(
                  maintenanceResolutionDurationsMs.reduce((a, b) => a + b, 0) /
                    maintenanceResolutionDurationsMs.length,
                )
              : null;

          return {
            portfolioId,
            generatedAtIso: ts.iso,
            reportingWindow: {
              windowStartIso,
              windowEndIso,
              upcomingExpirationHorizonDays,
            },
            metrics: {
              managedPropertyCount: propertyIds.length,
              activeOccupancyCount,
              upcomingAgreementExpirationsCount,
              renewalStats: {
                totalDecidedRenewalRequestsInWindow,
                acceptedRenewalsInWindow,
                renewalRateRatio,
              },
              financialObligationsInWindow: {
                scheduledObligationCount,
                scheduledRentTotalAmount,
                scheduledDepositTotalAmount,
                tenantSelfReportedPaidCount,
                tenantSelfReportedPaidAmount,
                authoritativeConfirmedPaidCount,
                authoritativeConfirmedPaidAmount,
                overdueObligationCount,
                unconfirmedPaymentDisclaimer:
                  'REPORTING_DISTINCTION: Missing authoritative payment confirmation is not proof of tenant non-payment; self-reported payments are tracked separately until provider reconciliation.',
              },
              maintenanceMetricsInWindow: {
                totalMaintenanceRequests,
                completedMaintenanceRequests,
                averageResolutionTimeMs,
              },
              openIncidentsCount,
              handoverActivityInWindow: {
                scheduledCount: hoScheduledCount,
                completedConfirmedCount: hoCompletedConfirmedCount,
                disputedCount: hoDisputedCount,
              },
              inspectionActivityInWindow: {
                totalInspectionsCount,
                followUpRequiredCount,
              },
            },
          };
        },
      );
    },

    /**
     * Section 23 & 25: Account-deletion and data-retention integration boundary.
     * Prevents destructive deletion of active leases, unsettled obligations, or open incident/dispute records.
     */
    async evaluateAccountDeletionAndRetentionHold(params: {
      subjectUid: string;
      propertyRefIdsToInspect: string[];
    }): Promise<{
      canImmediatelyPurgeOperationalReferences: boolean;
      retentionHoldReasons: string[];
      activeOccupancyIds: string[];
      activeAgreementIds: string[];
      unsettledObligationIds: string[];
    }> {
      const subjectUid = requireValidId(params.subjectUid, 'subjectUid');

      return runDurableTransaction(
        deps.txRunner,
        { operationName: 'pm.retention.evaluate_account_deletion', maxAttempts: 2 },
        async (tx) => {
          const retentionHoldReasons: string[] = [];
          const activeOccupancyIds: string[] = [];
          const activeAgreementIds: string[] = [];
          const unsettledObligationIds: string[] = [];

          for (const propId of params.propertyRefIdsToInspect) {
            const occs = await loadIndexedRecords<OccupancyRecord>(
              tx,
              `pmPropertyOccupanciesIndex/${propId}`,
              'pmOccupancies',
            );
            for (const o of occs) {
              if (
                (o.tenantUid === subjectUid || o.authorizedCoOccupantUids.includes(subjectUid)) &&
                (o.status === 'ACTIVE' || o.status === 'SCHEDULED' || o.status === 'DISPUTED')
              ) {
                activeOccupancyIds.push(o.id);
              }
            }

            const agreements = await loadIndexedRecords<RentalAgreementRecord>(
              tx,
              `pmPropertyAgreementsIndex/${propId}`,
              'pmRentalAgreements',
            );
            for (const a of agreements) {
              if (
                (a.tenantUid === subjectUid || a.landlordUid === subjectUid) &&
                (a.status === 'ACTIVE' ||
                  a.status === 'RENEWAL_PENDING' ||
                  a.status === 'TERMINATION_PENDING' ||
                  a.status === 'DISPUTED')
              ) {
                activeAgreementIds.push(a.id);
              }
            }

            const obligations = await loadIndexedRecords<FinancialObligationScheduleRecord>(
              tx,
              `pmPropertyObligationsIndex/${propId}`,
              'pmObligations',
            );
            for (const obl of obligations) {
              if (
                (obl.tenantUid === subjectUid || obl.landlordUid === subjectUid) &&
                (obl.status === 'DUE' ||
                  obl.status === 'OVERDUE' ||
                  obl.status === 'REPORTED_AS_PAID' ||
                  obl.status === 'DISPUTED')
              ) {
                unsettledObligationIds.push(obl.id);
              }
            }
          }

          if (activeOccupancyIds.length > 0) {
            retentionHoldReasons.push('ACTIVE_OR_DISPUTED_OCCUPANCY_HOLD');
          }
          if (activeAgreementIds.length > 0) {
            retentionHoldReasons.push('ACTIVE_OR_TERMINATION_PENDING_AGREEMENT_HOLD');
          }
          if (unsettledObligationIds.length > 0) {
            retentionHoldReasons.push('UNSETTLED_OR_DISPUTED_FINANCIAL_OBLIGATION_HOLD');
          }

          return {
            canImmediatelyPurgeOperationalReferences: retentionHoldReasons.length === 0,
            retentionHoldReasons,
            activeOccupancyIds,
            activeAgreementIds,
            unsettledObligationIds,
          };
        },
      );
    },
  };
}
