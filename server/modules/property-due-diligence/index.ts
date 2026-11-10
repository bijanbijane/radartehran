/**
 * @file server/modules/property-due-diligence/index.ts
 * @description Barrel Export for Property Due Diligence & Inspection Intelligence Backend Module.
 */

export * from './types';
export * from './validationAndAuthz';
export * from './adapters';
export * from './store';
export * from './assessmentAndChecklistService';
export * from './findingsEvidenceAndReviewsService';
export * from './riskRemediationAndReportingService';
export * from './facadeAndRoutes';
export * from './contracts/externalAdapters';
export * from './domain/types';
export * from './verification/verificationAndAssessmentEngine';
export * from './services/propertyDueDiligenceService';

export const PROPERTY_DUE_DILIGENCE_ROUTE_REGISTRATION_SPEC = [
  { method: 'POST', path: '/api/v1/property-due-diligence/cases', operation: 'createDueDiligenceCase' },
  { method: 'GET', path: '/api/v1/property-due-diligence/cases/:caseId', operation: 'retrieveCase' },
  { method: 'PATCH', path: '/api/v1/property-due-diligence/cases/:caseId', operation: 'updateCaseMetadata' },
  { method: 'POST', path: '/api/v1/property-due-diligence/cases/:caseId/evidence', operation: 'addEvidenceReference' },
  { method: 'POST', path: '/api/v1/property-due-diligence/cases/:caseId/evidence/:evidenceId/transition', operation: 'transitionEvidenceVerificationState' },
  { method: 'POST', path: '/api/v1/property-due-diligence/cases/:caseId/ownership-reviews', operation: 'evaluateOwnershipAndAuthorityEvidence' },
  { method: 'POST', path: '/api/v1/property-due-diligence/cases/:caseId/consistency-checks', operation: 'runPropertyConsistencyCheck' },
  { method: 'POST', path: '/api/v1/property-due-diligence/cases/:caseId/financial-checks', operation: 'recordFinancialObligationCheck' },
  { method: 'POST', path: '/api/v1/property-due-diligence/cases/:caseId/findings', operation: 'createFinding' },
  { method: 'POST', path: '/api/v1/property-due-diligence/cases/:caseId/findings/:findingId/resolve', operation: 'resolveFinding' },
  { method: 'POST', path: '/api/v1/property-due-diligence/cases/:caseId/assessments', operation: 'generateCompletionAssessment' },
  { method: 'GET', path: '/api/v1/property-due-diligence/cases/:caseId/assessments/history', operation: 'retrieveAssessmentHistory' },
  { method: 'GET', path: '/api/v1/property-due-diligence/cases/:caseId/activities', operation: 'retrieveCaseActivityHistory' },
  { method: 'POST', path: '/api/v1/property-due-diligence/cases/:caseId/close', operation: 'cancelOrCloseCase' },
] as const;
