import { ComplianceActorContext, ComplianceAuditReference } from './types';
import { ComplianceDomainError, RegulatoryComplianceStore, requireCompliancePermission } from './store';
import { JurisdictionSourceAndObligationService } from './jurisdictionSourceAndObligationService';
import { ControlAssessmentAndEvidenceService } from './controlAssessmentAndEvidenceService';
import { CaseChangeIncidentAndRemediationService } from './caseChangeIncidentAndRemediationService';
import { LegalHoldAndPropagationService } from './legalHoldAndPropagationService';
import { RetentionPrecedenceAndDispositionService } from './retentionPrecedenceAndDispositionService';

export * from './types';
export * from './legalHoldTypes';
export * from './store';
export * from './jurisdictionSourceAndObligationService';
export * from './controlAssessmentAndEvidenceService';
export * from './caseChangeIncidentAndRemediationService';
export * from './legalHoldAndPropagationService';
export * from './retentionPrecedenceAndDispositionService';
export * from './canonicalHoldModels';
export * from './canonicalHoldValidationAndAuthz';
export * from './canonicalHoldRepository';
export * from './canonicalLegalHoldService';
export * from './canonicalRetentionPolicyAndEvaluationService';
export * from './canonicalRetentionAndDispositionService';
export * from './canonicalHoldRoutes';

export interface RegulatoryComplianceModuleFacade {
  store: RegulatoryComplianceStore;
  jurisdictionsAndObligations: JurisdictionSourceAndObligationService;
  controlsAndAssessments: ControlAssessmentAndEvidenceService;
  casesIncidentsAndRemediation: CaseChangeIncidentAndRemediationService;
  legalHolds: LegalHoldAndPropagationService;
  retentionAndDisposition: RetentionPrecedenceAndDispositionService;
  generateExecutiveComplianceReport: (actor: ComplianceActorContext) => {
    totalObligations: number;
    activeObligations: number;
    totalControls: number;
    assessmentSummary: Record<string, number>;
    activeExceptions: number;
    openIncidents: number;
    openCorrectiveActions: number;
    activeLegalHolds: number;
    openRetentionConflicts: number;
    generatedAt: string;
  };
  queryAuditHistory: (
    actor: ComplianceActorContext,
    filters?: { targetType?: string; targetId?: string; limit?: number },
  ) => ComplianceAuditReference[];
  attemptModifyHistoricalDecisionOrEraseAudit: (actor: ComplianceActorContext, auditId: string) => never;
}

export function createRegulatoryComplianceModule(
  existingStore?: RegulatoryComplianceStore,
): RegulatoryComplianceModuleFacade {
  const store = existingStore ?? new RegulatoryComplianceStore();
  const jurisdictionsAndObligations = new JurisdictionSourceAndObligationService(store);
  const controlsAndAssessments = new ControlAssessmentAndEvidenceService(store);
  const casesIncidentsAndRemediation = new CaseChangeIncidentAndRemediationService(store);
  const legalHolds = new LegalHoldAndPropagationService(store);
  const retentionAndDisposition = new RetentionPrecedenceAndDispositionService(store);

  return {
    store,
    jurisdictionsAndObligations,
    controlsAndAssessments,
    casesIncidentsAndRemediation,
    legalHolds,
    retentionAndDisposition,
    generateExecutiveComplianceReport(actor: ComplianceActorContext) {
      requireCompliancePermission(actor, 'compliance.read', store);
      const assessmentSummary: Record<string, number> = {};
      for (const a of store.assessments.values()) {
        if (a.tenantId !== actor.tenantId) continue;
        assessmentSummary[a.determinationState] = (assessmentSummary[a.determinationState] ?? 0) + 1;
      }
      return {
        totalObligations: store.obligations.size,
        activeObligations: Array.from(store.obligations.values()).filter((o) => o.status === 'ACTIVE').length,
        totalControls: store.controls.size,
        assessmentSummary,
        activeExceptions: Array.from(store.exceptions.values()).filter((e) => e.status === 'APPROVED').length,
        openIncidents: Array.from(store.incidents.values()).filter((i) => i.status !== 'CLOSED').length,
        openCorrectiveActions: Array.from(store.correctiveActions.values()).filter(
          (c) => c.status !== 'COMPLETED' && c.status !== 'CANCELLED',
        ).length,
        activeLegalHolds: Array.from(store.legalHolds.values()).filter((h) => h.status === 'ACTIVE').length,
        openRetentionConflicts: Array.from(store.retentionConflicts.values()).filter(
          (c) => c.status === 'OPEN_LEGAL_REVIEW_REQUIRED',
        ).length,
        generatedAt: store.nowIso(),
      };
    },
    queryAuditHistory(actor: ComplianceActorContext, filters) {
      requireCompliancePermission(actor, 'compliance.read', store);
      const limit = Math.min(Math.max(filters?.limit ?? 50, 1), 200);
      return store.auditTrail
        .filter((entry) => {
          if (entry.tenantId !== actor.tenantId) return false;
          if (filters?.targetType && entry.targetType !== filters.targetType) return false;
          if (filters?.targetId && entry.targetId !== filters.targetId) return false;
          return true;
        })
        .slice(-limit);
    },
    attemptModifyHistoricalDecisionOrEraseAudit(_actor: ComplianceActorContext, _auditId: string): never {
      throw new ComplianceDomainError(
        'IMMUTABLE_AUDIT_TRAIL_VIOLATION',
        'Historical compliance and legal-hold decisions and their audit trail are immutable and cannot be modified or erased.',
        403,
      );
    },
  };
}
