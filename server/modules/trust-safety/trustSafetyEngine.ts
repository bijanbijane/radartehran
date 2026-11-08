/**
 * @file server/modules/trust-safety/trustSafetyEngine.ts
 * @description Core business logic engine for Trust, Safety, Abuse Prevention, and Enforcement.
 */

import crypto from 'node:crypto';
import type { CrossModuleEnforcementAdapter } from './trustSafetyAdapters';
import type { TrustSafetyRepository } from './trustSafetyStore';
import type {
  AppealRecord,
  AppealStatus,
  EnforcementActionType,
  EnforcementDecisionRecord,
  ModerationCaseRecord,
  ModerationCaseStatus,
  ReportCategory,
  ReportTargetType,
  RiskAssessmentRecord,
  RiskDimension,
  RiskLevel,
  TrustSafetyDomainEvent,
  UserReportRecord,
} from './trustSafetyTypes';
import {
  sanitizeTextFa,
  validateAppealTransition,
  validateCaseTransition,
  validateReportInput,
} from './trustSafetyValidator';

export class TrustSafetyEngine {
  public readonly domainEvents: TrustSafetyDomainEvent[] = [];

  constructor(
    private readonly store: TrustSafetyRepository,
    private readonly enforcementAdapter: CrossModuleEnforcementAdapter,
  ) {}

  public async submitUserReport(params: {
    reporterUid: string;
    targetType: ReportTargetType;
    targetId: string;
    category: ReportCategory;
    descriptionFa: string;
    evidenceMediaIds?: readonly string[];
    idempotencyKey?: string;
  }): Promise<{ success: boolean; errors?: string[]; report?: UserReportRecord; caseId?: string; replayed?: boolean }> {
    const val = validateReportInput(params);
    if (!val.valid) return { success: false, errors: val.errors };

    const idempotencyKey = params.idempotencyKey || `idemp_rep_${crypto.randomBytes(6).toString('hex')}`;
    const existing = await this.store.getReportByIdempotencyKey(idempotencyKey);
    if (existing) {
      if (existing.reporterUid !== params.reporterUid) {
        return { success: false, errors: ['IDEMPOTENCY_KEY_COLLISION'] };
      }
      return { success: true, report: existing, caseId: existing.assignedCaseId, replayed: true };
    }

    const nowIso = new Date().toISOString();
    const reportId = `rep_${crypto.randomBytes(6).toString('hex')}`;

    // Link to existing open case for the same target, or create a new one
    let targetCase = await this.store.findOpenCaseForTarget(params.targetType, params.targetId);
    if (!targetCase) {
      const caseId = `case_${crypto.randomBytes(6).toString('hex')}`;
      targetCase = {
        id: caseId,
        originatingReportIds: [reportId],
        targetType: params.targetType,
        targetId: params.targetId,
        caseCategory: params.category,
        severity: 'MEDIUM',
        status: 'OPEN',
        internalInvestigationNotes: [],
        attachedEvidenceIds: params.evidenceMediaIds ?? [],
        relatedCaseIds: [],
        createdAtIso: nowIso,
        updatedAtIso: nowIso,
      };
      await this.store.saveCase(targetCase);

      this.emitEvent({
        eventId: `evt_${crypto.randomBytes(6).toString('hex')}`,
        eventType: 'trust_safety.case_created',
        caseId: targetCase.id,
        targetType: targetCase.targetType,
        targetId: targetCase.targetId,
        severity: targetCase.severity,
        timestampIso: nowIso,
        summaryFa: `پرونده بازرسی جدید ایجاد شد (${targetCase.caseCategory}).`,
      });
    } else {
      // Append report to open case
      targetCase = {
        ...targetCase,
        originatingReportIds: [...targetCase.originatingReportIds, reportId],
        attachedEvidenceIds: [...targetCase.attachedEvidenceIds, ...(params.evidenceMediaIds ?? [])],
        updatedAtIso: nowIso,
      };
      await this.store.saveCase(targetCase);
    }

    const report: UserReportRecord = {
      id: reportId,
      reporterUid: params.reporterUid, // Kept strictly private
      targetType: params.targetType,
      targetId: params.targetId,
      category: params.category,
      descriptionFa: sanitizeTextFa(params.descriptionFa, 2000),
      evidenceMediaIds: params.evidenceMediaIds ?? [],
      status: 'ASSIGNED_TO_CASE',
      assignedCaseId: targetCase.id,
      idempotencyKey,
      createdAtIso: nowIso,
    };

    const savedReport = await this.store.saveReport(report);

    this.emitEvent({
      eventId: `evt_${crypto.randomBytes(6).toString('hex')}`,
      eventType: 'trust_safety.report_submitted',
      reportId: savedReport.id,
      caseId: targetCase.id,
      targetType: savedReport.targetType,
      targetId: savedReport.targetId,
      timestampIso: nowIso,
      summaryFa: `گزارش تخلف جدید ثبت شد (${savedReport.category}).`,
    });

    return { success: true, report: savedReport, caseId: targetCase.id };
  }

  public async assignCase(
    caseId: string,
    moderatorUid: string,
  ): Promise<{ success: boolean; errors?: string[]; modCase?: ModerationCaseRecord }> {
    const modCase = await this.store.getCaseById(caseId);
    if (!modCase) return { success: false, errors: ['CASE_NOT_FOUND'] };

    const nowIso = new Date().toISOString();
    const updated: ModerationCaseRecord = {
      ...modCase,
      assignedModeratorUid: moderatorUid,
      status: modCase.status === 'OPEN' || modCase.status === 'AWAITING_TRIAGE' ? 'UNDER_REVIEW' : modCase.status,
      updatedAtIso: nowIso,
    };

    const saved = await this.store.saveCase(updated);

    this.emitEvent({
      eventId: `evt_${crypto.randomBytes(6).toString('hex')}`,
      eventType: 'trust_safety.case_assigned',
      caseId: saved.id,
      targetType: saved.targetType,
      targetId: saved.targetId,
      timestampIso: nowIso,
      summaryFa: `پرونده به ناظر تخصصی ${moderatorUid} ارجاع شد.`,
    });

    return { success: true, modCase: saved };
  }

  public async addInvestigationNote(
    caseId: string,
    authorUid: string,
    noteFa: string,
  ): Promise<{ success: boolean; errors?: string[] }> {
    const modCase = await this.store.getCaseById(caseId);
    if (!modCase) return { success: false, errors: ['CASE_NOT_FOUND'] };

    const nowIso = new Date().toISOString();
    const newNote = {
      noteId: `note_${crypto.randomBytes(4).toString('hex')}`,
      authorUid,
      noteFa: sanitizeTextFa(noteFa, 2000),
      timestampIso: nowIso,
    };

    const updated: ModerationCaseRecord = {
      ...modCase,
      internalInvestigationNotes: [...modCase.internalInvestigationNotes, newNote],
      updatedAtIso: nowIso,
    };

    await this.store.saveCase(updated);
    return { success: true };
  }

  public async transitionCaseStatus(
    caseId: string,
    targetState: ModerationCaseStatus,
    resolutionDetailsFa?: string,
  ): Promise<{ success: boolean; errors?: string[]; modCase?: ModerationCaseRecord }> {
    const modCase = await this.store.getCaseById(caseId);
    if (!modCase) return { success: false, errors: ['CASE_NOT_FOUND'] };

    const check = validateCaseTransition(modCase.status, targetState);
    if (!check.allowed) return { success: false, errors: [check.reasonFa || 'INVALID_TRANSITION'] };

    const nowIso = new Date().toISOString();
    const isClosing = targetState === 'RESOLVED' || targetState === 'DISMISSED' || targetState === 'CLOSED';

    const updated: ModerationCaseRecord = {
      ...modCase,
      status: targetState,
      resolutionDetailsFa: resolutionDetailsFa ? sanitizeTextFa(resolutionDetailsFa, 1000) : modCase.resolutionDetailsFa,
      closedAtIso: isClosing ? nowIso : undefined,
      updatedAtIso: nowIso,
    };

    const saved = await this.store.saveCase(updated);

    if (isClosing) {
      this.emitEvent({
        eventId: `evt_${crypto.randomBytes(6).toString('hex')}`,
        eventType: 'trust_safety.case_resolved',
        caseId: saved.id,
        targetType: saved.targetType,
        targetId: saved.targetId,
        timestampIso: nowIso,
        summaryFa: `پرونده بازرسی تعیین تکلیف شد (${targetState}).`,
      });
    }

    return { success: true, modCase: saved };
  }

  public async recordRiskAssessment(params: {
    targetType: ReportTargetType;
    targetId: string;
    riskLevel: RiskLevel;
    dimensions: readonly RiskDimension[];
    riskScore: number;
    evidenceIdsConsidered: readonly string[];
    policyVersion: string;
    assessedByUid: string;
    reasoningFa: string;
  }): Promise<{ success: boolean; assessment?: RiskAssessmentRecord }> {
    const assessment: RiskAssessmentRecord = {
      id: `risk_${crypto.randomBytes(6).toString('hex')}`,
      targetType: params.targetType,
      targetId: params.targetId,
      riskLevel: params.riskLevel,
      dimensions: params.dimensions,
      riskScore: Math.min(Math.max(params.riskScore, 0), 100),
      evidenceIdsConsidered: params.evidenceIdsConsidered,
      assessmentMethod: 'MANUAL_MODERATOR',
      policyVersion: params.policyVersion,
      assessedByUid: params.assessedByUid,
      reasoningFa: sanitizeTextFa(params.reasoningFa, 1000),
      timestampIso: new Date().toISOString(),
    };

    const saved = await this.store.saveRiskAssessment(assessment);

    this.emitEvent({
      eventId: `evt_${crypto.randomBytes(6).toString('hex')}`,
      eventType: 'trust_safety.risk_assessed',
      targetType: saved.targetType,
      targetId: saved.targetId,
      severity: saved.riskLevel,
      timestampIso: saved.timestampIso,
      summaryFa: `ارزیابی ریسک ثبت شد (${saved.riskLevel} - امتیاز ${saved.riskScore}).`,
    });

    return { success: true, assessment: saved };
  }

  public async requestEnforcement(params: {
    caseId: string;
    targetType: ReportTargetType;
    targetId: string;
    actionType: EnforcementActionType;
    reasonFa: string;
    policyVersion: string;
    evidenceIds: readonly string[];
    issuingAuthorityUid: string;
    isAppealEligible?: boolean;
    expiresInHours?: number;
  }): Promise<{ success: boolean; errors?: string[]; decision?: EnforcementDecisionRecord }> {
    const nowIso = new Date().toISOString();
    const expiresAtIso = params.expiresInHours ? new Date(Date.now() + params.expiresInHours * 3600 * 1000).toISOString() : undefined;

    const decision: EnforcementDecisionRecord = {
      id: `enf_${crypto.randomBytes(6).toString('hex')}`,
      caseId: params.caseId,
      targetType: params.targetType,
      targetId: params.targetId,
      actionType: params.actionType,
      reasonFa: sanitizeTextFa(params.reasonFa, 500),
      policyVersion: params.policyVersion,
      evidenceIds: params.evidenceIds,
      issuingAuthorityUid: params.issuingAuthorityUid,
      executionStatus: 'REQUESTED',
      effectiveAtIso: nowIso,
      expiresAtIso,
      isAppealEligible: params.isAppealEligible ?? true,
    };

    // Dispatch request to target module through adapter
    const dispatchResult = await this.enforcementAdapter.dispatchEnforcementRequest(decision);

    const finalDecision: EnforcementDecisionRecord = {
      ...decision,
      executionStatus: dispatchResult.applied ? 'APPLIED' : dispatchResult.accepted ? 'ACCEPTED' : 'FAILED',
    };

    const saved = await this.store.saveEnforcementDecision(finalDecision);

    this.emitEvent({
      eventId: `evt_${crypto.randomBytes(6).toString('hex')}`,
      eventType: dispatchResult.applied ? 'trust_safety.enforcement_applied' : 'trust_safety.enforcement_requested',
      caseId: saved.caseId,
      targetType: saved.targetType,
      targetId: saved.targetId,
      actionType: saved.actionType,
      timestampIso: nowIso,
      summaryFa: `درخواست اعمال تصمیم انضباطی (${saved.actionType}) به ماژول مقصد ارسال شد.`,
    });

    if (!dispatchResult.accepted && !dispatchResult.applied) {
      return { success: false, errors: [dispatchResult.failureReasonFa || 'DISPATCH_REJECTED'], decision: saved };
    }

    return { success: true, decision: saved };
  }

  public async submitAppeal(params: {
    enforcementDecisionId: string;
    appellantUid: string;
    appealReasonFa: string;
    supportingEvidenceMediaIds?: readonly string[];
  }): Promise<{ success: boolean; errors?: string[]; appeal?: AppealRecord }> {
    const decision = await this.store.getEnforcementDecisionById(params.enforcementDecisionId);
    if (!decision) return { success: false, errors: ['ENFORCEMENT_DECISION_NOT_FOUND'] };

    if (!decision.isAppealEligible) {
      return { success: false, errors: ['DECISION_NOT_APPEAL_ELIGIBLE: این تصمیم مشمول تجدیدنظر نیست.'] };
    }

    const existingAppeal = await this.store.getAppealForDecision(params.enforcementDecisionId);
    if (existingAppeal) {
      return { success: false, errors: ['DUPLICATE_APPEAL: قبلاً برای این تصمیم درخواست تجدیدنظر ثبت شده است.'] };
    }

    const appeal: AppealRecord = {
      id: `app_${crypto.randomBytes(6).toString('hex')}`,
      enforcementDecisionId: decision.id,
      appellantUid: params.appellantUid,
      appealReasonFa: sanitizeTextFa(params.appealReasonFa, 1500),
      supportingEvidenceMediaIds: params.supportingEvidenceMediaIds ?? [],
      status: 'SUBMITTED',
      createdAtIso: new Date().toISOString(),
    };

    const saved = await this.store.saveAppeal(appeal);

    await this.store.saveEnforcementDecision({
      ...decision,
      appealId: saved.id,
    });

    this.emitEvent({
      eventId: `evt_${crypto.randomBytes(6).toString('hex')}`,
      eventType: 'trust_safety.appeal_submitted',
      targetType: decision.targetType,
      targetId: decision.targetId,
      actionType: decision.actionType,
      timestampIso: saved.createdAtIso,
      summaryFa: 'درخواست تجدیدنظر برای تصمیم انضباطی ثبت شد.',
    });

    return { success: true, appeal: saved };
  }

  public async reviewAppeal(params: {
    appealId: string;
    reviewerUid: string;
    decision: 'ACCEPTED' | 'REJECTED';
    reviewNotesFa: string;
  }): Promise<{ success: boolean; errors?: string[]; appeal?: AppealRecord }> {
    const appeal = await this.store.getAppealById(params.appealId);
    if (!appeal) return { success: false, errors: ['APPEAL_NOT_FOUND'] };

    const enforcement = await this.store.getEnforcementDecisionById(appeal.enforcementDecisionId);
    if (!enforcement) return { success: false, errors: ['ENFORCEMENT_NOT_FOUND'] };

    // Strict Separation of Duties: The reviewer CANNOT be the original authority!
    if (params.reviewerUid === enforcement.issuingAuthorityUid) {
      return {
        success: false,
        errors: ['SEPARATION_OF_DUTIES_VIOLATION: صادرکننده اولیه تصمیم مجاز به بازبینی تجدیدنظر خود نیست.'],
      };
    }

    const transition = validateAppealTransition(appeal.status, params.decision);
    if (!transition.allowed) {
      return { success: false, errors: [transition.reasonFa || 'INVALID_APPEAL_TRANSITION'] };
    }

    const nowIso = new Date().toISOString();
    const updatedAppeal: AppealRecord = {
      ...appeal,
      status: params.decision,
      reviewerUid: params.reviewerUid,
      reviewNotesFa: sanitizeTextFa(params.reviewNotesFa, 1000),
      decisionFa: params.decision === 'ACCEPTED' ? 'اعتراض پذیرفته شد و محدودیت رفع گردید.' : 'اعتراض رد شد و تصمیم پابرجا ماند.',
      resolvedAtIso: nowIso,
    };

    const savedAppeal = await this.store.saveAppeal(updatedAppeal);

    // If appeal accepted, reverse enforcement via adapter
    if (params.decision === 'ACCEPTED') {
      await this.enforcementAdapter.reverseEnforcementRequest(enforcement, params.reviewNotesFa);
      await this.store.saveEnforcementDecision({
        ...enforcement,
        executionStatus: 'REVERSED',
        reversalReasonFa: params.reviewNotesFa,
      });
    }

    this.emitEvent({
      eventId: `evt_${crypto.randomBytes(6).toString('hex')}`,
      eventType: 'trust_safety.appeal_resolved',
      targetType: enforcement.targetType,
      targetId: enforcement.targetId,
      actionType: enforcement.actionType,
      timestampIso: nowIso,
      summaryFa: `تجدیدنظر تعیین تکلیف شد (${params.decision}).`,
    });

    return { success: true, appeal: savedAppeal };
  }

  private emitEvent(event: TrustSafetyDomainEvent): void {
    this.domainEvents.push(event);
  }
}
