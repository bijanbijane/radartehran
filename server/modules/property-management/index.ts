export * from './contracts/externalAdapters';
export * from './domain/models';
export * from './domain/LifecycleAndReportingTypes';
export * from './schemas/validation';
export * from './repositories/durableStoreHelpers';
export * from './portfolios/portfolioAndAuthorizationService';
export * from './rental-agreements/agreementAndLifecycleService';
export * from './occupancy/occupancyAndHandoverService';
export * from './rent-schedules/obligationAndPaymentService';
export * from './inspections/inspectionAndIncidentService';
export * from './maintenance/maintenanceService';
export * from './services/reportingAndRetentionService';

import { createFirestoreIdempotencyStoreAdapter, runDurableTransaction } from '../core';
import type { PropertyManagementModuleDependencies } from './contracts/externalAdapters';
import { createInspectionAndIncidentService } from './inspections/inspectionAndIncidentService';
import { createMaintenanceService } from './maintenance/maintenanceService';
import { createOccupancyAndHandoverService } from './occupancy/occupancyAndHandoverService';
import { createPortfolioAndAuthorizationService } from './portfolios/portfolioAndAuthorizationService';
import { createObligationAndPaymentService } from './rent-schedules/obligationAndPaymentService';
import { createAgreementAndLifecycleService } from './rental-agreements/agreementAndLifecycleService';
import { createReportingAndRetentionService } from './services/reportingAndRetentionService';

/**
 * Route-Registration Specification for the Integration Lead (Section 24).
 *
 * This module intentionally does NOT register global Express routes in `server.ts`.
 * When ready to wire into the HTTP router, mount under `/api/v1/property-management`:
 *
 *  - POST   /api/v1/property-management/portfolios                           -> createPortfolio
 *  - GET    /api/v1/property-management/portfolios/:portfolioId              -> getPortfolio
 *  - POST   /api/v1/property-management/portfolios/:portfolioId/properties   -> addManagedPropertyToPortfolio
 *  - DELETE /api/v1/property-management/portfolios/:portfolioId/properties/:propertyRefId -> removeManagedPropertyFromPortfolio
 *  - POST   /api/v1/property-management/authorizations                       -> grantManagementAuthorization
 *  - POST   /api/v1/property-management/authorizations/:authorizationId/confirm -> confirmManagementAuthorization
 *  - POST   /api/v1/property-management/authorizations/:authorizationId/revoke  -> revokeOrSuspendManagementAuthorization
 *  - POST   /api/v1/property-management/agreements                           -> createRentalAgreement
 *  - PATCH  /api/v1/property-management/agreements/:agreementId              -> amendRentalAgreement
 *  - POST   /api/v1/property-management/agreements/:agreementId/renewals     -> requestLeaseRenewal
 *  - POST   /api/v1/property-management/renewals/:renewalId/decision         -> decideLeaseRenewal
 *  - POST   /api/v1/property-management/agreements/:agreementId/terminations -> recordLeaseTerminationWorkflow
 *  - POST   /api/v1/property-management/occupancies                          -> registerOccupancy
 *  - PATCH  /api/v1/property-management/occupancies/:occupancyId/status      -> updateOccupancyStatus
 *  - GET    /api/v1/property-management/occupancies/:occupancyId             -> getAuthorizedOccupancyDetails
 *  - POST   /api/v1/property-management/obligations                          -> createObligationSchedule
 *  - GET    /api/v1/property-management/agreements/:agreementId/obligations  -> retrieveObligationHistory
 *  - POST   /api/v1/property-management/obligations/:obligationId/self-report -> reportTenantPaymentClaim
 *  - POST   /api/v1/property-management/obligations/:obligationId/reconcile  -> associateAuthoritativePaymentReference
 *  - POST   /api/v1/property-management/handovers                            -> schedulePropertyHandover
 *  - POST   /api/v1/property-management/handovers/:handoverId/confirm        -> confirmOrDisputeHandover
 *  - POST   /api/v1/property-management/inspections                          -> recordPropertyInspection
 *  - PATCH  /api/v1/property-management/inspections/:inspectionId            -> amendPropertyInspection
 *  - POST   /api/v1/property-management/maintenance                          -> submitMaintenanceRequest
 *  - PATCH  /api/v1/property-management/maintenance/:maintenanceRequestId    -> processMaintenanceRequestAndSpending
 *  - POST   /api/v1/property-management/maintenance/:maintenanceRequestId/provider -> assignServiceProviderToMaintenance
 *  - POST   /api/v1/property-management/incidents                            -> recordPropertyIncident
 *  - POST   /api/v1/property-management/incidents/:incidentId/updates        -> appendIncidentUpdateOrEscalateToTrustSafety
 *  - GET    /api/v1/property-management/history                              -> retrieveAuthorizedManagementHistory
 *  - GET    /api/v1/property-management/portfolios/:portfolioId/report       -> retrievePortfolioOperationalReport
 */
export const PROPERTY_MANAGEMENT_ROUTE_REGISTRATION_SPEC = [
  { method: 'POST', path: '/api/v1/property-management/portfolios', handler: 'createPortfolio' },
  { method: 'GET', path: '/api/v1/property-management/portfolios/:portfolioId', handler: 'getPortfolio' },
  { method: 'POST', path: '/api/v1/property-management/portfolios/:portfolioId/properties', handler: 'addManagedPropertyToPortfolio' },
  { method: 'DELETE', path: '/api/v1/property-management/portfolios/:portfolioId/properties/:propertyRefId', handler: 'removeManagedPropertyFromPortfolio' },
  { method: 'POST', path: '/api/v1/property-management/authorizations', handler: 'grantManagementAuthorization' },
  { method: 'POST', path: '/api/v1/property-management/authorizations/:authorizationId/confirm', handler: 'confirmManagementAuthorization' },
  { method: 'POST', path: '/api/v1/property-management/authorizations/:authorizationId/revoke', handler: 'revokeOrSuspendManagementAuthorization' },
  { method: 'POST', path: '/api/v1/property-management/agreements', handler: 'createRentalAgreement' },
  { method: 'PATCH', path: '/api/v1/property-management/agreements/:agreementId', handler: 'amendRentalAgreement' },
  { method: 'POST', path: '/api/v1/property-management/agreements/:agreementId/renewals', handler: 'requestLeaseRenewal' },
  { method: 'POST', path: '/api/v1/property-management/renewals/:renewalId/decision', handler: 'decideLeaseRenewal' },
  { method: 'POST', path: '/api/v1/property-management/agreements/:agreementId/terminations', handler: 'recordLeaseTerminationWorkflow' },
  { method: 'POST', path: '/api/v1/property-management/occupancies', handler: 'registerOccupancy' },
  { method: 'PATCH', path: '/api/v1/property-management/occupancies/:occupancyId/status', handler: 'updateOccupancyStatus' },
  { method: 'GET', path: '/api/v1/property-management/occupancies/:occupancyId', handler: 'getAuthorizedOccupancyDetails' },
  { method: 'POST', path: '/api/v1/property-management/obligations', handler: 'createObligationSchedule' },
  { method: 'GET', path: '/api/v1/property-management/agreements/:agreementId/obligations', handler: 'retrieveObligationHistory' },
  { method: 'POST', path: '/api/v1/property-management/obligations/:obligationId/self-report', handler: 'reportTenantPaymentClaim' },
  { method: 'POST', path: '/api/v1/property-management/obligations/:obligationId/reconcile', handler: 'associateAuthoritativePaymentReference' },
  { method: 'POST', path: '/api/v1/property-management/handovers', handler: 'schedulePropertyHandover' },
  { method: 'POST', path: '/api/v1/property-management/handovers/:handoverId/confirm', handler: 'confirmOrDisputeHandover' },
  { method: 'POST', path: '/api/v1/property-management/inspections', handler: 'recordPropertyInspection' },
  { method: 'PATCH', path: '/api/v1/property-management/inspections/:inspectionId', handler: 'amendPropertyInspection' },
  { method: 'POST', path: '/api/v1/property-management/maintenance', handler: 'submitMaintenanceRequest' },
  { method: 'PATCH', path: '/api/v1/property-management/maintenance/:maintenanceRequestId', handler: 'processMaintenanceRequestAndSpending' },
  { method: 'POST', path: '/api/v1/property-management/maintenance/:maintenanceRequestId/provider', handler: 'assignServiceProviderToMaintenance' },
  { method: 'POST', path: '/api/v1/property-management/incidents', handler: 'recordPropertyIncident' },
  { method: 'POST', path: '/api/v1/property-management/incidents/:incidentId/updates', handler: 'appendIncidentUpdateOrEscalateToTrustSafety' },
  { method: 'GET', path: '/api/v1/property-management/history', handler: 'retrieveAuthorizedManagementHistory' },
  { method: 'GET', path: '/api/v1/property-management/portfolios/:portfolioId/report', handler: 'retrievePortfolioOperationalReport' },
] as const;

export function createPropertyManagementService(deps: PropertyManagementModuleDependencies) {
  const retryableTxRunner = {
    runTransaction<T>(workFn: Parameters<typeof deps.txRunner.runTransaction<T>>[0]): Promise<T> {
      return runDurableTransaction(
        deps.txRunner,
        { operationName: 'pm.idempotency_store', maxAttempts: 3 },
        workFn,
      );
    },
  };

  const idempotencyStore =
    deps.idempotencyStore ??
    createFirestoreIdempotencyStoreAdapter(retryableTxRunner, 'pmIdempotencyLocks');

  const portfoliosAndAuth = createPortfolioAndAuthorizationService(deps, idempotencyStore);
  const agreementsAndLifecycle = createAgreementAndLifecycleService(deps, idempotencyStore);
  const occupancyAndHandovers = createOccupancyAndHandoverService(deps, idempotencyStore);
  const obligationsAndPayments = createObligationAndPaymentService(deps, idempotencyStore);
  const inspectionsAndIncidents = createInspectionAndIncidentService(deps, idempotencyStore);
  const maintenance = createMaintenanceService(deps, idempotencyStore);
  const reportingAndRetention = createReportingAndRetentionService(deps);

  return {
    ...portfoliosAndAuth,
    ...agreementsAndLifecycle,
    ...occupancyAndHandovers,
    ...obligationsAndPayments,
    ...inspectionsAndIncidents,
    ...maintenance,
    ...reportingAndRetention,
  };
}
