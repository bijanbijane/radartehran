/**
 * @file server/modules/property-due-diligence/riskRemediationAndReportingService.ts
 * @description Service for Risk Register, Remediation Tracking, Conflict Resolution, Quality Controls, and Versioned Reports.
 */

import type {
  RiskRegisterEntry,
  RiskCategory,
  FindingSeverity,
  RemediationRecommendation,
  RemediationStatus,
  AssessmentPriority,
  ReviewerDisagreementRecord,
  AssessmentQualityCheckResult,
  DueDiligenceReportVersion,
} from './types';
import type { DueDiligenceStore } from './store';
import type { DueDiligenceEventSink } from './adapters';
import {
  DueDiligenceError,
  requireValidId,
  requireNonEmptyText,
  sanitizeString,
  validateFindingSeverity,
  assertCanAccessAssessment,
  assertCanCoordinateOrApproveReport,
  MANDATORY_REPORT_DISCLAIMER,
} from './validationAndAuthz';

export class RiskRemediationAndReportingService {
  constructor(
    private readonly store: DueDiligenceStore,
    private readonly eventSink: DueDiligenceEventSink,
  ) {}

  private async emitAndAudit(
    assessmentId: string,
    propertyReference: string,
    actorUid: string,
    eventType: Parameters<DueDiligenceEventSink['publishEvent']>[0]['eventType'],
    targetEntityType: string,
    targetEntityId: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const nowIso = new Date().toISOString();
    await this.store.appendAuditEntry({
      id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      assessmentId,
      actorUid,
      action: eventType,
      targetEntityType,
      targetEntityId,
      metadata: payload,
      timestampIso: nowIso,
    });
    await this.eventSink.publishEvent({
      eventId: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      schemaVersion: '2026-11.due-diligence.v1',
      eventType,
      assessmentId,
      propertyReference,
      actorUid,
      timestampIso: nowIso,
      payload,
    });
  }

  // --- Risk Register (Section 16) ---
  async createRiskRegisterEntry(
    actorUid: string,
    input: {
      assessmentId: string;
      relatedFindingId?: string;
      riskCategory: RiskCategory;
      riskBasis: RiskRegisterEntry['riskBasis'];
      description: string;
      evidenceIds?: string[];
      severity: FindingSeverity;
      likelihoodClassification?: RiskRegisterEntry['likelihoodClassification'];
      impactClassification?: RiskRegisterEntry['impactClassification'];
      requiredFollowUp: string;
      riskOwnerRef?: string;
    },
    isPlatformAdmin = false,
  ): Promise<RiskRegisterEntry> {
    const assessment = await this.store.getAssessmentById(requireValidId(input.assessmentId, 'assessmentId'));
    if (!assessment) throw new DueDiligenceError('NOT_FOUND', 'Assessment not found.', 404);
    assertCanAccessAssessment(actorUid, assessment, undefined, isPlatformAdmin);

    const severity = validateFindingSeverity(input.severity);
    const nowIso = new Date().toISOString();

    const entry: RiskRegisterEntry = {
      id: `dd_rsk_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      assessmentId: assessment.id,
      relatedFindingId: input.relatedFindingId,
      riskCategory: input.riskCategory,
      riskBasis: input.riskBasis,
      description: requireNonEmptyText(input.description, 'description', 800),
      classificationMethodologyVersion: '2026.1-qualitative-matrix',
      evidenceIds: input.evidenceIds || [],
      severity,
      likelihoodClassification: input.likelihoodClassification || 'not_evaluated',
      impactClassification: input.impactClassification || 'indeterminate',
      requiredFollowUp: requireNonEmptyText(input.requiredFollowUp, 'requiredFollowUp', 400),
      riskOwnerRef: input.riskOwnerRef ? sanitizeString(input.riskOwnerRef, 80) : undefined,
      reviewStatus: 'open',
      resolutionStatus: 'unresolved',
      lastReviewedAtIso: nowIso,
      createdAtIso: nowIso,
    };

    const saved = await this.store.saveRiskEntry(entry);
    await this.emitAndAudit(assessment.id, assessment.propertyReference, actorUid, 'due_diligence.risk.recorded', 'risk_entry', saved.id, {
      riskCategory: saved.riskCategory,
      riskBasis: saved.riskBasis,
      severity: saved.severity,
    });
    return saved;
  }

  async updateRiskStatus(
    actorUid: string,
    riskId: string,
    updates: {
      reviewStatus?: RiskRegisterEntry['reviewStatus'];
      resolutionStatus?: RiskRegisterEntry['resolutionStatus'];
    },
    isPlatformAdmin = false,
  ): Promise<RiskRegisterEntry> {
    const entry = await this.store.getRiskEntryById(requireValidId(riskId, 'riskId'));
    if (!entry) throw new DueDiligenceError('NOT_FOUND', 'Risk register entry not found.', 404);
    const assessment = await this.store.getAssessmentById(entry.assessmentId);
    if (!assessment) throw new DueDiligenceError('NOT_FOUND', 'Assessment not found.', 404);
    assertCanAccessAssessment(actorUid, assessment, undefined, isPlatformAdmin);

    if (updates.reviewStatus) entry.reviewStatus = updates.reviewStatus;
    if (updates.resolutionStatus) entry.resolutionStatus = updates.resolutionStatus;
    entry.lastReviewedAtIso = new Date().toISOString();

    return this.store.saveRiskEntry(entry);
  }

  // --- Remediation & Follow-up Tracking (Section 17) ---
  async createRemediationRecommendation(
    actorUid: string,
    input: {
      assessmentId: string;
      findingId: string;
      actionDescription: string;
      isLegallyMandated?: boolean;
      recommendedResponsiblePartyRef?: string;
      externalPropertyManagementRef?: string;
      externalDevelopmentProjectRef?: string;
      priority?: AssessmentPriority;
      dueDateIso?: string;
      followUpAssessmentId?: string;
    },
    isPlatformAdmin = false,
  ): Promise<RemediationRecommendation> {
    const assessment = await this.store.getAssessmentById(requireValidId(input.assessmentId, 'assessmentId'));
    if (!assessment) throw new DueDiligenceError('NOT_FOUND', 'Assessment not found.', 404);
    assertCanAccessAssessment(actorUid, assessment, undefined, isPlatformAdmin);

    const finding = await this.store.getFindingById(requireValidId(input.findingId, 'findingId'));
    if (!finding || finding.assessmentId !== assessment.id) {
      throw new DueDiligenceError('NOT_FOUND', 'Related finding not found on this assessment.', 404);
    }

    const nowIso = new Date().toISOString();
    const rem: RemediationRecommendation = {
      id: `dd_rem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      assessmentId: assessment.id,
      findingId: finding.id,
      actionDescription: requireNonEmptyText(input.actionDescription, 'actionDescription', 600),
      isLegallyMandated: Boolean(input.isLegallyMandated),
      recommendedResponsiblePartyRef: input.recommendedResponsiblePartyRef,
      externalPropertyManagementRef: input.externalPropertyManagementRef,
      externalDevelopmentProjectRef: input.externalDevelopmentProjectRef,
      priority: input.priority || 'normal',
      dueDateIso: input.dueDateIso,
      status: 'recommended',
      completionEvidenceIds: [],
      followUpAssessmentId: input.followUpAssessmentId,
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
    };

    const saved = await this.store.saveRemediation(rem);
    await this.emitAndAudit(assessment.id, assessment.propertyReference, actorUid, 'due_diligence.remediation.recommended', 'remediation', saved.id, {
      findingId: finding.id,
      priority: saved.priority,
    });
    return saved;
  }

  async recordRemediationProgressOrCompletion(
    actorUid: string,
    remediationId: string,
    updates: {
      status: Exclude<RemediationStatus, 'verified_resolved'>;
      completionEvidenceIds?: string[];
      followUpAssessmentId?: string;
    },
    isPlatformAdmin = false,
  ): Promise<RemediationRecommendation> {
    const rem = await this.store.getRemediationById(requireValidId(remediationId, 'remediationId'));
    if (!rem) throw new DueDiligenceError('NOT_FOUND', 'Remediation record not found.', 404);
    const assessment = await this.store.getAssessmentById(rem.assessmentId);
    if (!assessment) throw new DueDiligenceError('NOT_FOUND', 'Assessment not found.', 404);
    assertCanAccessAssessment(actorUid, assessment, undefined, isPlatformAdmin);

    rem.status = updates.status;
    if (updates.completionEvidenceIds) {
      rem.completionEvidenceIds = updates.completionEvidenceIds;
    }
    if (updates.followUpAssessmentId) {
      rem.followUpAssessmentId = updates.followUpAssessmentId;
    }
    if (updates.status === 'completed_awaiting_review') {
      rem.reportedCompletedAtIso = new Date().toISOString();
    }

    return this.store.saveRemediation(rem);
  }

  async verifyRemediationOutcome(
    actorUid: string,
    remediationId: string,
    decision: {
      verifiedResolved: boolean;
      completionEvidenceIds: string[];
    },
    isPlatformAdmin = false,
  ): Promise<RemediationRecommendation> {
    const rem = await this.store.getRemediationById(requireValidId(remediationId, 'remediationId'));
    if (!rem) throw new DueDiligenceError('NOT_FOUND', 'Remediation record not found.', 404);
    const assessment = await this.store.getAssessmentById(rem.assessmentId);
    if (!assessment) throw new DueDiligenceError('NOT_FOUND', 'Assessment not found.', 404);

    const isAssignedReviewer = assessment.assignedReviewers.some((r) => r.reviewerUid === actorUid);
    if (!isAssignedReviewer && !isPlatformAdmin) {
      throw new DueDiligenceError('FORBIDDEN', 'Only an assigned reviewer can confirm remediation resolution.', 403);
    }

    if (decision.verifiedResolved && (!decision.completionEvidenceIds || decision.completionEvidenceIds.length === 0)) {
      throw new DueDiligenceError(
        'COMPLETION_EVIDENCE_REQUIRED',
        'Cannot claim remediation succeeded (verified_resolved) without supporting completion evidence.',
        400,
      );
    }

    rem.completionEvidenceIds = decision.completionEvidenceIds;
    if (decision.verifiedResolved) {
      rem.status = 'verified_resolved';
      rem.verifiedByReviewerUid = actorUid;
      rem.verifiedResolvedAtIso = new Date().toISOString();

      // Update finding remediation status while preserving the original historical finding!
      const finding = await this.store.getFindingById(rem.findingId);
      if (finding) {
        finding.remediationStatus = 'verified_resolved';
        finding.reviewState = 'reassessed';
        finding.history.push({
          changedAtIso: new Date().toISOString(),
          changedByUid: actorUid,
          summary: `Remediation '${rem.id}' verified resolved with evidence [${decision.completionEvidenceIds.join(', ')}].`,
        });
        await this.store.saveFinding(finding);
      }

      await this.emitAndAudit(assessment.id, assessment.propertyReference, actorUid, 'due_diligence.remediation.completed', 'remediation', rem.id, {
        findingId: rem.findingId,
        verifiedByReviewerUid: actorUid,
      });
    } else {
      rem.status = 'in_progress';
    }

    return this.store.saveRemediation(rem);
  }

  // --- Multi-Reviewer Disagreement & Conflict Resolution (Section 18) ---
  async recordReviewerDisagreement(
    actorUid: string,
    input: {
      assessmentId: string;
      workstreamId: string;
      findingOrItemId: string;
      primaryReviewerUid: string;
      primaryPosition: string;
      dissentingPosition: string;
    },
    isPlatformAdmin = false,
  ): Promise<ReviewerDisagreementRecord> {
    const assessment = await this.store.getAssessmentById(requireValidId(input.assessmentId, 'assessmentId'));
    if (!assessment) throw new DueDiligenceError('NOT_FOUND', 'Assessment not found.', 404);
    assertCanAccessAssessment(actorUid, assessment, undefined, isPlatformAdmin);

    const record: ReviewerDisagreementRecord = {
      id: `dd_dis_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      assessmentId: assessment.id,
      workstreamId: requireValidId(input.workstreamId, 'workstreamId'),
      findingOrItemId: requireValidId(input.findingOrItemId, 'findingOrItemId'),
      primaryReviewerUid: requireValidId(input.primaryReviewerUid, 'primaryReviewerUid'),
      primaryPosition: requireNonEmptyText(input.primaryPosition, 'primaryPosition', 500),
      dissentingReviewerUid: actorUid,
      dissentingPosition: requireNonEmptyText(input.dissentingPosition, 'dissentingPosition', 500),
      status: 'open_conflict',
      createdAtIso: new Date().toISOString(),
    };

    return this.store.saveDisagreement(record);
  }

  async resolveReviewerDisagreement(
    actorUid: string,
    disagreementId: string,
    resolutionSummary: string,
    isPlatformAdmin = false,
  ): Promise<ReviewerDisagreementRecord> {
    const dis = await this.store.getDisagreementById(requireValidId(disagreementId, 'disagreementId'));
    if (!dis) throw new DueDiligenceError('NOT_FOUND', 'Disagreement record not found.', 404);
    const assessment = await this.store.getAssessmentById(dis.assessmentId);
    if (!assessment) throw new DueDiligenceError('NOT_FOUND', 'Assessment not found.', 404);

    assertCanCoordinateOrApproveReport(actorUid, assessment, isPlatformAdmin);

    dis.status = 'resolved_by_coordinator';
    dis.resolutionSummary = requireNonEmptyText(resolutionSummary, 'resolutionSummary', 600);
    dis.resolvedByCoordinatorUid = actorUid;
    dis.resolvedAtIso = new Date().toISOString();

    return this.store.saveDisagreement(dis);
  }

  // --- Assessment Completeness & Quality Controls (Section 22) ---
  async evaluateAssessmentQualityControls(
    actorUid: string,
    assessmentId: string,
    isPlatformAdmin = false,
  ): Promise<AssessmentQualityCheckResult> {
    const assessment = await this.store.getAssessmentById(requireValidId(assessmentId, 'assessmentId'));
    if (!assessment) throw new DueDiligenceError('NOT_FOUND', 'Assessment not found.', 404);
    assertCanAccessAssessment(actorUid, assessment, undefined, isPlatformAdmin);

    const workstreams = await this.store.listWorkstreamsByAssessment(assessment.id);
    const responses = await this.store.listChecklistResponsesByAssessment(assessment.id);
    const findingsPage = await this.store.listFindingsByAssessment(assessment.id, { limit: 100 });
    const findings = findingsPage.items;
    const documents = await this.store.listDocumentReviewsByAssessment(assessment.id);
    const evidenceList = await this.store.listEvidenceByAssessment(assessment.id);
    const disagreements = await this.store.listDisagreementsByAssessment(assessment.id);

    const incompleteMandatoryWorkstreams = workstreams
      .filter((w) => w.isMandatory && w.status !== 'completed')
      .map((w) => w.id);

    let totalRequiredItems = 0;
    let completedRequiredItems = 0;
    for (const ws of workstreams) {
      if (ws.checklistTemplateId && ws.checklistTemplateVersion) {
        const tpl = await this.store.getChecklistTemplate(ws.checklistTemplateId, ws.checklistTemplateVersion);
        if (tpl) {
          const reqItems = tpl.items.filter((i) => i.required && !i.conditionalOnItemId);
          totalRequiredItems += reqItems.length;
          for (const reqItem of reqItems) {
            const resp = responses.find(
              (r) => r.workstreamId === ws.id && r.itemId === reqItem.itemId && r.responseType !== 'not_inspected',
            );
            if (resp) completedRequiredItems += 1;
          }
        }
      }
    }

    const requiredChecklistCompletionRatio =
      totalRequiredItems > 0 ? Number((completedRequiredItems / totalRequiredItems).toFixed(2)) : 1;

    const missingRequiredEvidenceCount = responses.filter((r) => r.classification === 'evidence_missing').length;
    const unreviewedSuppliedDocumentsCount = documents.filter((d) => d.reviewStatus === 'supplied').length;
    const unresolvedCriticalOrMajorFindingsCount = findings.filter(
      (f) => (f.severity === 'critical' || f.severity === 'major') && f.remediationStatus !== 'verified_resolved',
    ).length;
    const openReviewerDisagreementsCount = disagreements.filter((d) => d.status === 'open_conflict').length;

    const nowMs = Date.now();
    const staleEvidenceIds = evidenceList
      .filter((e) => e.captureOrDocumentDateIso && nowMs - Date.parse(e.captureOrDocumentDateIso) > 180 * 24 * 60 * 60 * 1000)
      .map((e) => e.id);

    const blockers: string[] = [];
    const warnings: string[] = [];

    if (incompleteMandatoryWorkstreams.length > 0) {
      blockers.push(`${incompleteMandatoryWorkstreams.length} mandatory workstream(s) incomplete.`);
    }
    if (openReviewerDisagreementsCount > 0) {
      blockers.push(`${openReviewerDisagreementsCount} open reviewer disagreement(s) require coordinator resolution.`);
    }
    if (missingRequiredEvidenceCount > 0) {
      warnings.push(`${missingRequiredEvidenceCount} checklist deficiency item(s) lack supporting evidence.`);
    }
    if (unreviewedSuppliedDocumentsCount > 0) {
      warnings.push(`${unreviewedSuppliedDocumentsCount} supplied document(s) have not yet been reviewed.`);
    }
    if (staleEvidenceIds.length > 0) {
      warnings.push(`${staleEvidenceIds.length} evidence item(s) are older than 180 days.`);
    }

    const isScopeFullyCompleted = incompleteMandatoryWorkstreams.length === 0 && requiredChecklistCompletionRatio === 1;
    const allEvidenceIndependentlyVerified =
      evidenceList.length > 0 && evidenceList.every((e) => e.verificationStatus === 'independently_verified');
    const allDocsIndependentlyVerified =
      documents.every((d) => d.reviewStatus === 'independently_verified' || d.reviewStatus === 'not_requested');

    // Distinguish a fully completed checklist from a fully verified assessment!
    const isFullyVerifiedAssessment =
      isScopeFullyCompleted &&
      allEvidenceIndependentlyVerified &&
      allDocsIndependentlyVerified &&
      missingRequiredEvidenceCount === 0 &&
      openReviewerDisagreementsCount === 0;

    return {
      assessmentId: assessment.id,
      qualityCheckVersion: '2026.1-qc-rules',
      evaluatedAtIso: new Date().toISOString(),
      requiredChecklistCompletionRatio,
      missingRequiredEvidenceCount,
      incompleteMandatoryWorkstreams,
      unreviewedSuppliedDocumentsCount,
      unresolvedCriticalOrMajorFindingsCount,
      openReviewerDisagreementsCount,
      staleEvidenceIds,
      blockers,
      warnings,
      isScopeFullyCompleted,
      isFullyVerifiedAssessment,
      disclaimer:
        'Quality control indicators measure procedural completeness and evidence verification state only; they do NOT constitute a property safety score or legal clearance.',
    };
  }

  // --- Report Generation, Publication & Versioning (Section 21) ---
  async generateDraftReport(
    actorUid: string,
    assessmentId: string,
    isPlatformAdmin = false,
  ): Promise<DueDiligenceReportVersion> {
    const assessment = await this.store.getAssessmentById(requireValidId(assessmentId, 'assessmentId'));
    if (!assessment) throw new DueDiligenceError('NOT_FOUND', 'Assessment not found.', 404);
    assertCanCoordinateOrApproveReport(actorUid, assessment, isPlatformAdmin);

    const existingReports = await this.store.listReportVersionsByAssessment(assessment.id);
    const nextVersion = existingReports.length > 0 ? existingReports[existingReports.length - 1].reportVersion + 1 : 1;

    const workstreams = await this.store.listWorkstreamsByAssessment(assessment.id);
    const responses = await this.store.listChecklistResponsesByAssessment(assessment.id);
    const findings = (await this.store.listFindingsByAssessment(assessment.id, { limit: 100 })).items;
    const evidenceList = await this.store.listEvidenceByAssessment(assessment.id);
    const docs = await this.store.listDocumentReviewsByAssessment(assessment.id);
    const financials = await this.store.listFinancialRecordsByAssessment(assessment.id);
    const geoObs = await this.store.listGeoEnvironmentalObservationsByAssessment(assessment.id);
    const risks = await this.store.listRisksByAssessment(assessment.id);
    const remediations = await this.store.listRemediationsByAssessment(assessment.id);

    const completedWorkstreamIds = workstreams.filter((w) => w.status === 'completed').map((w) => w.id);
    const incompleteWorkstreamIds = workstreams.filter((w) => w.status !== 'completed').map((w) => w.id);

    const severityCounts: Record<FindingSeverity, number> = {
      informational: 0,
      minor: 0,
      moderate: 0,
      major: 0,
      critical: 0,
      undetermined: 0,
    };
    for (const f of findings) {
      severityCounts[f.severity] = (severityCounts[f.severity] || 0) + 1;
    }

    const outstandingUncertainties: string[] = [];
    for (const ws of workstreams) {
      if (ws.status !== 'completed') {
        outstandingUncertainties.push(
          `Workstream '${ws.workstreamType}' (${ws.id}) was not completed (status: ${ws.status}${ws.unavailableReason ? `, reason: ${ws.unavailableReason}` : ''}).`,
        );
      }
    }
    for (const d of docs) {
      if (d.reviewStatus === 'verification_unavailable' || d.verificationMethod === 'visual_copy_inspection_only') {
        outstandingUncertainties.push(
          `Document '${d.documentCategory}' (${d.id}) was reviewed as a copy without direct government registry verification.`,
        );
      }
    }

    const nowIso = new Date().toISOString();
    const report: DueDiligenceReportVersion = {
      id: `dd_rpt_${assessment.id}_v${nextVersion}`,
      assessmentId: assessment.id,
      reportVersion: nextVersion,
      propertyReference: assessment.propertyReference,
      assessmentScope: structuredClone(assessment.scope),
      completedWorkstreamIds,
      incompleteWorkstreamIds,
      checklistCompletionSummary: {
        totalItems: responses.length,
        respondedItems: responses.filter((r) => r.responseType !== 'not_inspected').length,
        deficienciesCount: responses.filter((r) => r.classification === 'deficiency_noted').length,
        notInspectedCount: responses.filter((r) => r.responseType === 'not_inspected').length,
        evidenceUnavailableCount: responses.filter(
          (r) => r.responseType === 'evidence_unavailable' || r.classification === 'evidence_missing',
        ).length,
      },
      findingIds: findings.map((f) => f.id),
      severityCounts,
      supportingEvidenceIds: evidenceList.filter((e) => e.verificationStatus !== 'rejected').map((e) => e.id),
      documentReviewSummary: {
        totalDocuments: docs.length,
        independentlyVerifiedCount: docs.filter((d) => d.reviewStatus === 'independently_verified').length,
        copyOnlyUnverifiedCount: docs.filter((d) => d.verificationMethod === 'visual_copy_inspection_only').length,
        inconsistenciesCount: docs.filter((d) => d.reviewStatus === 'inconsistency_identified').length,
        unavailableVerificationCount: docs.filter((d) => d.reviewStatus === 'verification_unavailable').length,
      },
      financialReviewIncluded: financials.length > 0,
      geographicReviewIncluded: geoObs.length > 0,
      outstandingUncertainties,
      unresolvedRiskIds: risks.filter((r) => r.resolutionStatus !== 'resolved_verified').map((r) => r.id),
      remediationRecommendationIds: remediations.map((r) => r.id),
      participatingReviewers: assessment.assignedReviewers.map((r) => ({
        reviewerUid: r.reviewerUid,
        role: r.role,
        licenseVerified: r.qualificationVerifiedByRegistry,
      })),
      generatedAtIso: nowIso,
      dataCutoffAtIso: nowIso,
      methodologyAndTemplateVersion: '2026.1-dd-methodology',
      status: 'draft',
      mandatoryLegalAndTechnicalDisclaimer: MANDATORY_REPORT_DISCLAIMER,
    };

    return this.store.saveReportVersion(report);
  }

  async publishReportVersion(
    actorUid: string,
    assessmentId: string,
    reportVersion: number,
    isPlatformAdmin = false,
  ): Promise<DueDiligenceReportVersion> {
    const assessment = await this.store.getAssessmentById(requireValidId(assessmentId, 'assessmentId'));
    if (!assessment) throw new DueDiligenceError('NOT_FOUND', 'Assessment not found.', 404);
    assertCanCoordinateOrApproveReport(actorUid, assessment, isPlatformAdmin);

    const disagreements = await this.store.listDisagreementsByAssessment(assessment.id);
    if (disagreements.some((d) => d.status === 'open_conflict')) {
      throw new DueDiligenceError(
        'UNRESOLVED_REVIEWER_CONFLICTS',
        'Cannot publish report while material reviewer disagreements remain unresolved.',
        409,
      );
    }

    const report = await this.store.getReportVersion(assessment.id, reportVersion);
    if (!report) throw new DueDiligenceError('NOT_FOUND', `Report version v${reportVersion} not found.`, 404);
    if (report.status === 'published' || report.status === 'superseded') {
      throw new DueDiligenceError('REPORT_ALREADY_PUBLISHED', `Report version v${reportVersion} is already immutable (${report.status}).`, 409);
    }

    // Lock all referenced evidence so it can never be silently replaced or invalidated
    for (const evId of report.supportingEvidenceIds) {
      const ev = await this.store.getEvidenceById(evId);
      if (ev && !ev.lockedInReportVersions.includes(reportVersion)) {
        ev.lockedInReportVersions.push(reportVersion);
        await this.store.saveEvidence(ev);
      }
    }

    // Supersede any previously published versions
    const allVersions = await this.store.listReportVersionsByAssessment(assessment.id);
    for (const prev of allVersions) {
      if (prev.reportVersion < reportVersion && prev.status === 'published') {
        prev.status = 'superseded';
        prev.supersededByVersion = reportVersion;
        await this.store.saveReportVersion(prev);
        await this.emitAndAudit(
          assessment.id,
          assessment.propertyReference,
          actorUid,
          'due_diligence.report.superseded',
          'report_version',
          prev.id,
          { supersededVersion: prev.reportVersion, supersededByVersion: reportVersion },
        );
      }
    }

    report.status = 'published';
    const saved = await this.store.saveReportVersion(report);

    await this.emitAndAudit(
      assessment.id,
      assessment.propertyReference,
      actorUid,
      'due_diligence.report.published',
      'report_version',
      saved.id,
      { reportVersion: saved.reportVersion, incompleteWorkstreamsCount: saved.incompleteWorkstreamIds.length },
    );
    return saved;
  }

  async getPublishedReport(
    actorUid: string,
    assessmentId: string,
    version?: number,
    actorOrgId?: string,
    isPlatformAdmin = false,
  ): Promise<DueDiligenceReportVersion> {
    const assessment = await this.store.getAssessmentById(requireValidId(assessmentId, 'assessmentId'));
    if (!assessment) throw new DueDiligenceError('NOT_FOUND', 'Assessment not found.', 404);
    assertCanAccessAssessment(actorUid, assessment, actorOrgId, isPlatformAdmin);

    if (version !== undefined) {
      const rep = await this.store.getReportVersion(assessment.id, version);
      if (!rep) throw new DueDiligenceError('NOT_FOUND', `Report v${version} not found.`, 404);
      return rep;
    }

    const all = await this.store.listReportVersionsByAssessment(assessment.id);
    const published = all.filter((r) => r.status === 'published');
    if (published.length === 0) {
      throw new DueDiligenceError('NO_PUBLISHED_REPORT', 'No published report version exists for this assessment.', 404);
    }
    return published[published.length - 1];
  }
}
