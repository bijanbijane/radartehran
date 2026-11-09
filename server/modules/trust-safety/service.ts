import crypto from 'crypto';
import {
  CoreApiError,
  createStructuredAuditEvent,
} from '../core';
import {
  CANONICAL_SAFETY_POLICIES,
  validateAppealTransition,
  validateCaseTransition,
  validateEnforcementTransition,
  validateReportTransition,
  type AttachEvidenceInput,
  type CreateEnforcementDecisionInput,
  type CreateModerationCaseInput,
  type SubmitAppealInput,
  type SubmitUserReportInput,
} from './lifecycleAndValidation';
import {
  buildEvidenceRecord,
  evaluateEntityRiskHeuristic,
} from './riskAndEvidenceEngine';
import type {
  AppealStatus,
  EnforcementActionType,
  ModerationCaseStatus,
  ReportCategory,
  ReportLifecycleStatus,
  ReportableEntityType,
  StoredAppealRecord,
  StoredEnforcementDecision,
  StoredEvidenceRecord,
  StoredModerationCase,
  StoredRiskAssessment,
  StoredUserReport,
  TrustSafetyModuleDependencies,
} from './types';

export class TrustSafetyService {
  constructor(private readonly deps: TrustSafetyModuleDependencies) {}

  private nowIso(): string {
    return new Date(this.deps.nowFn ? this.deps.nowFn() : Date.now()).toISOString();
  }

  async submitUserReport(params: {
    reporterUid: string;
    input: SubmitUserReportInput;
    idempotencyKey: string;
  }): Promise<StoredUserReport> {
    const { targetType, targetId, category, description } = params.input;

    // 1. Verify target entity exists via cross-module resolver (prevent reporting phantom entities)
    const targetCheck = await this.deps.targetResolver.resolveTargetEntity(targetType, targetId);
    if (!targetCheck.exists) {
      throw new CoreApiError('NOT_FOUND', 404, targetCheck.reason ?? `Target ${targetType} "${targetId}" not found.`);
    }

    // 2. Prevent abusive duplicate reports from the same user on the same active target/category
    const existingReports = await this.deps.repository.getUserReportsByTarget(targetType, targetId);
    const hasDuplicate = existingReports.some(
      (r) => r.reporterUid === params.reporterUid && r.category === category && r.status !== 'resolved' && r.status !== 'dismissed',
    );
    if (hasDuplicate) {
      throw new CoreApiError(
        'CONFLICT',
        409,
        'You have already submitted an active report for this entity under this category. Our moderation team is investigating.',
      );
    }

    const nowIso = this.nowIso();
    const reportId = `rep_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;

    const report: StoredUserReport = {
      id: reportId,
      reporterUid: params.reporterUid,
      targetType,
      targetId,
      category,
      description,
      evidenceReferences: params.input.evidenceReferences ?? [],
      status: 'submitted',
      assignedCaseId: null,
      idempotencyKey: params.idempotencyKey,
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
    };

    await this.deps.repository.saveUserReport(report);

    await this.deps.auditSink.writeAuditEvent(
      createStructuredAuditEvent({
        principal: { uid: params.reporterUid, email: '', role: 'verified_user' },
        correlationId: `rt_rep_${reportId}`,
        action: 'trust_safety.report_submitted',
        targetCollection: 'userReports',
        targetResourceId: reportId,
        outcome: 'SUCCESS',
        metadata: { targetType, targetId, category },
      }),
    );

    return report;
  }

  async getUserReport(reportId: string, actor: { uid: string; isPrivileged: boolean }): Promise<StoredUserReport> {
    const report = await this.deps.repository.getUserReport(reportId);
    if (!report) {
      throw new CoreApiError('NOT_FOUND', 404, 'Report not found.');
    }
    if (!actor.isPrivileged && report.reporterUid !== actor.uid) {
      throw new CoreApiError('FORBIDDEN', 403, 'Cannot access another user report.');
    }
    return report;
  }

  async createModerationCase(params: {
    input: CreateModerationCaseInput;
    creatorUid: string;
  }): Promise<StoredModerationCase> {
    const { originatingType, originatingReferenceId, targetType, targetId, caseCategory, severity, initialNote } = params.input;
    const nowIso = this.nowIso();
    const caseId = `case_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;

    const initialNotes = initialNote
      ? [{ noteId: `note_${crypto.randomUUID().slice(0, 8)}`, authorUid: params.creatorUid, note: initialNote, timestampIso: nowIso }]
      : [];

    const caseRecord: StoredModerationCase = {
      id: caseId,
      originatingType,
      originatingReferenceId,
      targetType,
      targetId,
      caseCategory,
      severity: severity ?? (CANONICAL_SAFETY_POLICIES[caseCategory as ReportCategory]?.defaultSeverity ?? 'medium'),
      status: 'open',
      assignedModeratorUid: null,
      internalNotes: initialNotes,
      evidenceIds: [],
      enforcementActionIds: [],
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
    };

    await this.deps.repository.saveModerationCase(caseRecord);

    // If originated from a user report, link case to report
    if (originatingType === 'user_report') {
      const origReport = await this.deps.repository.getUserReport(originatingReferenceId);
      if (origReport) {
        origReport.status = 'escalated_to_case';
        origReport.assignedCaseId = caseId;
        origReport.updatedAtIso = nowIso;
        await this.deps.repository.saveUserReport(origReport);
      }
    }

    return caseRecord;
  }

  async assignModerator(params: {
    caseId: string;
    moderatorUid: string;
    actorUid: string;
  }): Promise<StoredModerationCase> {
    const caseRecord = await this.deps.repository.getModerationCase(params.caseId);
    if (!caseRecord) {
      throw new CoreApiError('NOT_FOUND', 404, 'Moderation case not found.');
    }

    const nowIso = this.nowIso();
    caseRecord.assignedModeratorUid = params.moderatorUid;
    if (caseRecord.status === 'open' || caseRecord.status === 'awaiting_triage') {
      caseRecord.status = 'under_review';
    }
    caseRecord.updatedAtIso = nowIso;
    caseRecord.internalNotes.push({
      noteId: `note_${crypto.randomUUID().slice(0, 8)}`,
      authorUid: params.actorUid,
      note: `Assigned case to moderator ${params.moderatorUid}.`,
      timestampIso: nowIso,
    });

    await this.deps.repository.saveModerationCase(caseRecord);
    return caseRecord;
  }

  async addCaseNote(params: {
    caseId: string;
    authorUid: string;
    note: string;
  }): Promise<StoredModerationCase> {
    const caseRecord = await this.deps.repository.getModerationCase(params.caseId);
    if (!caseRecord) {
      throw new CoreApiError('NOT_FOUND', 404, 'Moderation case not found.');
    }

    const nowIso = this.nowIso();
    caseRecord.internalNotes.push({
      noteId: `note_${crypto.randomUUID().slice(0, 8)}`,
      authorUid: params.authorUid,
      note: params.note,
      timestampIso: nowIso,
    });
    caseRecord.updatedAtIso = nowIso;

    await this.deps.repository.saveModerationCase(caseRecord);
    return caseRecord;
  }

  async attachEvidence(params: {
    caseId: string;
    input: AttachEvidenceInput;
    actorUid: string;
  }): Promise<StoredEvidenceRecord> {
    const caseRecord = await this.deps.repository.getModerationCase(params.caseId);
    if (!caseRecord) {
      throw new CoreApiError('NOT_FOUND', 404, 'Moderation case not found.');
    }

    const nowIso = this.nowIso();
    const evidence = buildEvidenceRecord({
      caseId: params.caseId,
      type: params.input.type,
      sourceModule: params.input.sourceModule,
      sourceRef: params.input.sourceRef,
      submittedByUid: params.actorUid,
      accessClassification: params.input.accessClassification,
      description: params.input.description,
      contentForHash: params.input.sha256Hash,
      nowIso,
    });

    await this.deps.repository.saveEvidenceRecord(evidence);
    caseRecord.evidenceIds.push(evidence.id);
    caseRecord.updatedAtIso = nowIso;
    await this.deps.repository.saveModerationCase(caseRecord);

    return evidence;
  }

  async evaluateRiskAssessment(params: {
    targetType: ReportableEntityType;
    targetId: string;
    category: ReportCategory;
    signals?: string[];
    actorUid: string;
  }): Promise<StoredRiskAssessment> {
    const reports = await this.deps.repository.getUserReportsByTarget(params.targetType, params.targetId);
    const assessment = evaluateEntityRiskHeuristic({
      targetType: params.targetType,
      targetId: params.targetId,
      category: params.category,
      reports,
      signals: params.signals ?? [],
      reviewerUid: params.actorUid,
      nowIso: this.nowIso(),
    });

    await this.deps.repository.saveRiskAssessment(assessment);
    return assessment;
  }

  async issueEnforcementDecision(params: {
    input: CreateEnforcementDecisionInput;
    actorUid: string;
  }): Promise<StoredEnforcementDecision> {
    const caseRecord = await this.deps.repository.getModerationCase(params.input.caseId);
    if (!caseRecord) {
      throw new CoreApiError('NOT_FOUND', 404, 'Moderation case not found.');
    }

    const nowIso = this.nowIso();
    const policy = CANONICAL_SAFETY_POLICIES[caseRecord.caseCategory];
    const enforcementId = `enf_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;

    // Publish enforcement command to owning module (does NOT mutate foreign collections directly)
    let executionStatus: StoredEnforcementDecision['status'] = 'requested';
    let statusReason: string | undefined;

    if (this.deps.enforcementPublisher) {
      const pubRes = await this.deps.enforcementPublisher.publishEnforcementCommand({
        commandId: `cmd_${crypto.randomUUID().slice(0, 12)}`,
        enforcementId,
        targetType: caseRecord.targetType,
        targetId: caseRecord.targetId,
        actionType: params.input.actionType,
        reason: params.input.reason,
        expiresAtIso: params.input.expiresAtIso,
      });

      if (pubRes.accepted) {
        executionStatus = 'accepted';
      } else {
        executionStatus = 'failed';
        statusReason = pubRes.failureReason ?? 'Owning module rejected enforcement request.';
      }
    }

    const decision: StoredEnforcementDecision = {
      id: enforcementId,
      caseId: caseRecord.id,
      targetType: caseRecord.targetType,
      targetId: caseRecord.targetId,
      actionType: params.input.actionType,
      reason: params.input.reason,
      policyVersion: params.input.policyVersion ?? policy.version,
      evidenceReferences: params.input.evidenceReferences ?? caseRecord.evidenceIds,
      issuingAuthorityUid: params.actorUid,
      effectiveFromIso: nowIso,
      expiresAtIso: params.input.expiresAtIso,
      appealEligible: policy.appealPermitted,
      status: executionStatus,
      statusReason,
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
    };

    await this.deps.repository.saveEnforcementDecision(decision);

    caseRecord.enforcementActionIds.push(enforcementId);
    caseRecord.updatedAtIso = nowIso;
    await this.deps.repository.saveModerationCase(caseRecord);

    return decision;
  }

  async submitAppeal(params: {
    input: SubmitAppealInput;
    appellantUid: string;
  }): Promise<StoredAppealRecord> {
    const enforcement = await this.deps.repository.getEnforcementDecision(params.input.enforcementId);
    if (!enforcement) {
      throw new CoreApiError('NOT_FOUND', 404, 'Enforcement decision not found.');
    }
    if (!enforcement.appealEligible) {
      throw new CoreApiError('CONFLICT', 409, 'This enforcement action is not eligible for appeal.');
    }

    const nowIso = this.nowIso();
    const appealId = `app_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;

    const appeal: StoredAppealRecord = {
      id: appealId,
      enforcementId: enforcement.id,
      appellantUid: params.appellantUid,
      reason: params.input.reason,
      supportingEvidenceIds: params.input.supportingEvidenceIds ?? [],
      status: 'submitted',
      assignedReviewerUid: null,
      originalDeciderUid: enforcement.issuingAuthorityUid,
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
    };

    await this.deps.repository.saveAppealRecord(appeal);
    return appeal;
  }

  async resolveAppeal(params: {
    appealId: string;
    decision: 'accepted' | 'rejected';
    reviewNotes: string;
    reviewerUid: string;
  }): Promise<StoredAppealRecord> {
    const appeal = await this.deps.repository.getAppealRecord(params.appealId);
    if (!appeal) {
      throw new CoreApiError('NOT_FOUND', 404, 'Appeal not found.');
    }

    // MANDATORY SEPARATION OF DUTIES:
    // The original decision-maker CANNOT review or decide their own appeal!
    if (appeal.originalDeciderUid === params.reviewerUid) {
      throw new CoreApiError(
        'FORBIDDEN',
        403,
        'Separation of duties violation: The original issuing authority cannot adjudicate an appeal against their own decision.',
      );
    }

    const nowIso = this.nowIso();
    appeal.decision = params.decision;
    appeal.status = params.decision === 'accepted' ? 'accepted' : 'rejected';
    appeal.assignedReviewerUid = params.reviewerUid;
    appeal.reviewNotes = params.reviewNotes;
    appeal.decidedAtIso = nowIso;
    appeal.updatedAtIso = nowIso;

    await this.deps.repository.saveAppealRecord(appeal);

    // If appeal is accepted, update enforcement status to reversed
    if (params.decision === 'accepted') {
      const enforcement = await this.deps.repository.getEnforcementDecision(appeal.enforcementId);
      if (enforcement) {
        enforcement.status = 'reversed';
        enforcement.reversalHistory = enforcement.reversalHistory ?? [];
        enforcement.reversalHistory.push({
          reversedByUid: params.reviewerUid,
          reason: `Appeal ${appeal.id} accepted: ${params.reviewNotes}`,
          timestampIso: nowIso,
        });
        enforcement.updatedAtIso = nowIso;
        await this.deps.repository.saveEnforcementDecision(enforcement);
      }
    }

    return appeal;
  }
}
