import crypto from 'crypto';
import {
  DiscrepancyFindingCategory,
  DiscrepancySeverity,
  DueDiligenceCaseActorContext,
  DueDiligenceCaseRecord,
  DueDiligenceCaseReportSnapshot,
  DueDiligenceDiscrepancyFindingRecord,
  EnvironmentalRiskReviewReference,
  FinancialCommercialReviewReference,
  FindingEpistemicClassification,
  OwnershipAndTitleReviewReference,
  PermitAndRegulatoryReviewReference,
  PhysicalTechnicalReviewReference,
  PropertyGeographicConsistencyCheckRecord,
  ReportWorkflowConclusion,
  UntrustedAiReviewSuggestionRecord,
  VerificationCaseError,
} from './verificationCaseTypes';
import { assertCaseParticipantAccess } from './caseChecklistAndEvidenceService';
import { DueDiligenceVerificationCaseStore } from './verificationCaseStore';

export class DomainReviewsFindingsAndReportService {
  constructor(private readonly store: DueDiligenceVerificationCaseStore) {}

  async createFinding(
    actor: DueDiligenceCaseActorContext,
    input: {
      id?: string;
      caseId: string;
      findingCategory: DiscrepancyFindingCategory;
      description: string;
      affectedChecklistItemIds?: string[];
      supportingEvidenceIds?: string[];
      contradictoryEvidenceIds?: string[];
      severity: DiscrepancySeverity;
      epistemicClassification: FindingEpistemicClassification;
      potentialConsequence: string;
      recommendedNextAction: string;
      authoredByAiSuggestion?: boolean;
      humanReviewedByUserId?: string;
    }
  ): Promise<DueDiligenceDiscrepancyFindingRecord> {
    const caseRec = await this.store.getCaseById(input.caseId);
    if (!caseRec) throw new VerificationCaseError('RESOURCE_NOT_FOUND', `Case '${input.caseId}' not found.`, 404);
    assertCaseParticipantAccess(actor, caseRec, false);

    // Do not automatically assign CRITICAL severity based solely on an AI-generated observation without human review
    if (input.authoredByAiSuggestion && !input.humanReviewedByUserId && input.severity === 'CRITICAL') {
      throw new VerificationCaseError(
        'AI_OUTPUT_UNTREATED_AS_AUTHORITATIVE',
        'AI-generated observations cannot automatically assign CRITICAL severity without human reviewer confirmation.',
        400
      );
    }

    // Do not present unverified allegations as confirmed discrepancies without supporting evidence
    if (
      input.epistemicClassification === 'CONFIRMED_DISCREPANCY' &&
      (!input.supportingEvidenceIds || input.supportingEvidenceIds.length === 0)
    ) {
      throw new VerificationCaseError(
        'VALIDATION_FAILED',
        'CONFIRMED_DISCREPANCY requires supportingEvidenceIds; uncorroborated claims must be classified as UNVERIFIED_ALLEGATION or SUSPECTED_DISCREPANCY.',
        400
      );
    }

    const now = new Date().toISOString();
    const finding: DueDiligenceDiscrepancyFindingRecord = {
      id: input.id || `ddfind_${crypto.randomBytes(6).toString('hex')}`,
      caseId: caseRec.id,
      propertyId: caseRec.propertyId,
      findingCategory: input.findingCategory,
      description: input.description,
      affectedChecklistItemIds: input.affectedChecklistItemIds ?? [],
      supportingEvidenceIds: input.supportingEvidenceIds ?? [],
      contradictoryEvidenceIds: input.contradictoryEvidenceIds ?? [],
      severity: input.severity,
      epistemicClassification: input.epistemicClassification,
      potentialConsequence: input.potentialConsequence,
      recommendedNextAction: input.recommendedNextAction,
      assignedReviewerId: actor.userId,
      resolutionStatus: 'OPEN',
      resolutionEvidenceIds: [],
      authoredByAiSuggestion: input.authoredByAiSuggestion ?? false,
      humanReviewedByUserId: input.humanReviewedByUserId,
      createdAt: now,
      updatedAt: now,
    };

    await this.store.saveFinding(finding);
    await this.store.saveCase({
      ...caseRec,
      status: 'FINDINGS_REQUIRING_ACTION',
      findingIds: Array.from(new Set([...caseRec.findingIds, finding.id])),
      version: caseRec.version + 1,
      updatedAt: now,
    });
    return finding;
  }

  async updateFindingStatus(
    actor: DueDiligenceCaseActorContext,
    input: {
      findingId: string;
      severity?: DiscrepancySeverity;
      epistemicClassification?: FindingEpistemicClassification;
      resolutionStatus?: DueDiligenceDiscrepancyFindingRecord['resolutionStatus'];
    }
  ): Promise<DueDiligenceDiscrepancyFindingRecord> {
    const finding = await this.store.getFindingById(input.findingId);
    if (!finding) throw new VerificationCaseError('RESOURCE_NOT_FOUND', `Finding '${input.findingId}' not found.`, 404);
    const caseRec = await this.store.getCaseById(finding.caseId);
    if (!caseRec) throw new VerificationCaseError('RESOURCE_NOT_FOUND', 'Case not found.', 404);
    assertCaseParticipantAccess(actor, caseRec, false);

    const updated: DueDiligenceDiscrepancyFindingRecord = {
      ...finding,
      severity: input.severity ?? finding.severity,
      epistemicClassification: input.epistemicClassification ?? finding.epistemicClassification,
      resolutionStatus: input.resolutionStatus ?? finding.resolutionStatus,
      humanReviewedByUserId: actor.userId,
      updatedAt: new Date().toISOString(),
    };
    await this.store.saveFinding(updated);
    return updated;
  }

  async recordFindingResolution(
    actor: DueDiligenceCaseActorContext,
    input: {
      findingId: string;
      resolutionEvidenceIds: string[];
    }
  ): Promise<DueDiligenceDiscrepancyFindingRecord> {
    const finding = await this.store.getFindingById(input.findingId);
    if (!finding) throw new VerificationCaseError('RESOURCE_NOT_FOUND', `Finding '${input.findingId}' not found.`, 404);
    if (input.resolutionEvidenceIds.length === 0) {
      throw new VerificationCaseError('VALIDATION_FAILED', 'Resolving a finding requires resolutionEvidenceIds.', 400);
    }
    const updated: DueDiligenceDiscrepancyFindingRecord = {
      ...finding,
      epistemicClassification: 'RESOLVED_FINDING',
      resolutionStatus: 'RESOLVED',
      resolutionEvidenceIds: input.resolutionEvidenceIds,
      humanReviewedByUserId: actor.userId,
      updatedAt: new Date().toISOString(),
    };
    await this.store.saveFinding(updated);
    return updated;
  }

  async retrieveUnresolvedFindings(
    actor: DueDiligenceCaseActorContext,
    caseId: string,
    limit = 50
  ): Promise<DueDiligenceDiscrepancyFindingRecord[]> {
    if (limit < 1 || limit > 100) {
      throw new VerificationCaseError('VALIDATION_FAILED', 'Pagination limit must be between 1 and 100.', 400);
    }
    const caseRec = await this.store.getCaseById(caseId);
    if (!caseRec) throw new VerificationCaseError('RESOURCE_NOT_FOUND', `Case '${caseId}' not found.`, 404);
    assertCaseParticipantAccess(actor, caseRec, false);
    const list = await this.store.listFindingsByCase(caseId, limit);
    return list.filter((f) => f.resolutionStatus !== 'RESOLVED');
  }

  async recordOwnershipReviewReference(
    actor: DueDiligenceCaseActorContext,
    input: Omit<OwnershipAndTitleReviewReference, 'id' | 'isCanonicalOwnershipDetermination' | 'recordedAtIso' | 'reviewerUserId'>
  ): Promise<OwnershipAndTitleReviewReference> {
    const caseRec = await this.store.getCaseById(input.caseId);
    if (!caseRec) throw new VerificationCaseError('RESOURCE_NOT_FOUND', 'Case not found.', 404);
    assertCaseParticipantAccess(actor, caseRec, false);
    const record: OwnershipAndTitleReviewReference = {
      ...input,
      id: `ddown_${crypto.randomBytes(6).toString('hex')}`,
      reviewerUserId: actor.userId,
      isCanonicalOwnershipDetermination: false,
      recordedAtIso: new Date().toISOString(),
    };
    await this.store.saveOwnershipReview(record);
    return record;
  }

  async retrieveOwnershipReviewReferences(
    actor: DueDiligenceCaseActorContext,
    caseId: string
  ): Promise<OwnershipAndTitleReviewReference[]> {
    const caseRec = await this.store.getCaseById(caseId);
    if (!caseRec) throw new VerificationCaseError('RESOURCE_NOT_FOUND', 'Case not found.', 404);
    assertCaseParticipantAccess(actor, caseRec, false);
    return this.store.listOwnershipReviewsByCase(caseId);
  }

  async recordPermitReviewReference(
    actor: DueDiligenceCaseActorContext,
    input: Omit<PermitAndRegulatoryReviewReference, 'id' | 'isCanonicalPermitRecord' | 'recordedAtIso' | 'reviewerUserId'>
  ): Promise<PermitAndRegulatoryReviewReference> {
    const caseRec = await this.store.getCaseById(input.caseId);
    if (!caseRec) throw new VerificationCaseError('RESOURCE_NOT_FOUND', 'Case not found.', 404);
    assertCaseParticipantAccess(actor, caseRec, false);
    const record: PermitAndRegulatoryReviewReference = {
      ...input,
      id: `ddprm_${crypto.randomBytes(6).toString('hex')}`,
      reviewerUserId: actor.userId,
      isCanonicalPermitRecord: false,
      recordedAtIso: new Date().toISOString(),
    };
    await this.store.savePermitReview(record);
    return record;
  }

  async retrievePermitReviewReferences(
    actor: DueDiligenceCaseActorContext,
    caseId: string
  ): Promise<PermitAndRegulatoryReviewReference[]> {
    const caseRec = await this.store.getCaseById(caseId);
    if (!caseRec) throw new VerificationCaseError('RESOURCE_NOT_FOUND', 'Case not found.', 404);
    assertCaseParticipantAccess(actor, caseRec, false);
    return this.store.listPermitReviewsByCase(caseId);
  }

  async recordGeographicConsistencyCheck(
    actor: DueDiligenceCaseActorContext,
    input: Omit<PropertyGeographicConsistencyCheckRecord, 'id' | 'provesLegalParcelOwnership' | 'recordedByUserId' | 'recordedAtIso'>
  ): Promise<PropertyGeographicConsistencyCheckRecord> {
    const caseRec = await this.store.getCaseById(input.caseId);
    if (!caseRec) throw new VerificationCaseError('RESOURCE_NOT_FOUND', 'Case not found.', 404);
    assertCaseParticipantAccess(actor, caseRec, false);
    const record: PropertyGeographicConsistencyCheckRecord = {
      ...input,
      id: `ddgeo_${crypto.randomBytes(6).toString('hex')}`,
      provesLegalParcelOwnership: false,
      recordedByUserId: actor.userId,
      recordedAtIso: new Date().toISOString(),
    };
    await this.store.saveGeoConsistencyCheck(record);
    return record;
  }

  async retrieveGeographicConsistencyResults(
    actor: DueDiligenceCaseActorContext,
    caseId: string
  ): Promise<PropertyGeographicConsistencyCheckRecord[]> {
    const caseRec = await this.store.getCaseById(caseId);
    if (!caseRec) throw new VerificationCaseError('RESOURCE_NOT_FOUND', 'Case not found.', 404);
    assertCaseParticipantAccess(actor, caseRec, false);
    return this.store.listGeoConsistencyChecksByCase(caseId);
  }

  async recordTechnicalAssessmentReference(
    actor: DueDiligenceCaseActorContext,
    input: Omit<PhysicalTechnicalReviewReference, 'id' | 'issuesStructuralSafetyCertification' | 'recordedAtIso'>
  ): Promise<PhysicalTechnicalReviewReference> {
    const caseRec = await this.store.getCaseById(input.caseId);
    if (!caseRec) throw new VerificationCaseError('RESOURCE_NOT_FOUND', 'Case not found.', 404);
    assertCaseParticipantAccess(actor, caseRec, false);
    const record: PhysicalTechnicalReviewReference = {
      ...input,
      id: `ddtech_${crypto.randomBytes(6).toString('hex')}`,
      issuesStructuralSafetyCertification: false,
      recordedAtIso: new Date().toISOString(),
    };
    await this.store.saveTechnicalReview(record);
    return record;
  }

  async retrieveTechnicalAssessmentReferences(
    actor: DueDiligenceCaseActorContext,
    caseId: string
  ): Promise<PhysicalTechnicalReviewReference[]> {
    const caseRec = await this.store.getCaseById(caseId);
    if (!caseRec) throw new VerificationCaseError('RESOURCE_NOT_FOUND', 'Case not found.', 404);
    assertCaseParticipantAccess(actor, caseRec, false);
    return this.store.listTechnicalReviewsByCase(caseId);
  }

  async recordFinancialReviewReference(
    actor: DueDiligenceCaseActorContext,
    input: Omit<FinancialCommercialReviewReference, 'id' | 'processedByPlatform' | 'recordedAtIso' | 'reviewerUserId'>
  ): Promise<FinancialCommercialReviewReference> {
    const caseRec = await this.store.getCaseById(input.caseId);
    if (!caseRec) throw new VerificationCaseError('RESOURCE_NOT_FOUND', 'Case not found.', 404);
    assertCaseParticipantAccess(actor, caseRec, false);
    const record: FinancialCommercialReviewReference = {
      ...input,
      id: `ddfin_${crypto.randomBytes(6).toString('hex')}`,
      reviewerUserId: actor.userId,
      processedByPlatform: false,
      recordedAtIso: new Date().toISOString(),
    };
    await this.store.saveFinancialReview(record);
    return record;
  }

  async recordEnvironmentalRiskReference(
    actor: DueDiligenceCaseActorContext,
    input: Omit<EnvironmentalRiskReviewReference, 'id' | 'provesPropertySpecificDamage' | 'recordedAtIso'>
  ): Promise<EnvironmentalRiskReviewReference> {
    const caseRec = await this.store.getCaseById(input.caseId);
    if (!caseRec) throw new VerificationCaseError('RESOURCE_NOT_FOUND', 'Case not found.', 404);
    assertCaseParticipantAccess(actor, caseRec, false);
    const record: EnvironmentalRiskReviewReference = {
      ...input,
      id: `ddenv_${crypto.randomBytes(6).toString('hex')}`,
      provesPropertySpecificDamage: false,
      recordedAtIso: new Date().toISOString(),
    };
    await this.store.saveEnvironmentalReview(record);
    return record;
  }

  async retrieveEnvironmentalRiskReferences(
    actor: DueDiligenceCaseActorContext,
    caseId: string
  ): Promise<EnvironmentalRiskReviewReference[]> {
    const caseRec = await this.store.getCaseById(caseId);
    if (!caseRec) throw new VerificationCaseError('RESOURCE_NOT_FOUND', 'Case not found.', 404);
    assertCaseParticipantAccess(actor, caseRec, false);
    return this.store.listEnvironmentalReviewsByCase(caseId);
  }

  async recordAiReviewSuggestion(
    actor: DueDiligenceCaseActorContext,
    input: {
      caseId: string;
      sourceEvidenceIds: string[];
      modelIdentifier: string;
      extractedFacts: string[];
      inferredObservations: string[];
      suggestedFindingCategory?: DiscrepancyFindingCategory;
      attemptAutoVerifyEvidenceOrApproveCase?: boolean;
    }
  ): Promise<UntrustedAiReviewSuggestionRecord> {
    if (input.attemptAutoVerifyEvidenceOrApproveCase) {
      throw new VerificationCaseError(
        'AI_OUTPUT_UNTREATED_AS_AUTHORITATIVE',
        'AI output is untrusted and must never independently verify evidence, dismiss findings, or approve a due diligence case.',
        403
      );
    }
    if (!input.sourceEvidenceIds || input.sourceEvidenceIds.length === 0) {
      throw new VerificationCaseError('VALIDATION_FAILED', 'AI suggestions must preserve sourceEvidenceIds.', 400);
    }
    const caseRec = await this.store.getCaseById(input.caseId);
    if (!caseRec) throw new VerificationCaseError('RESOURCE_NOT_FOUND', 'Case not found.', 404);
    assertCaseParticipantAccess(actor, caseRec, false);

    const suggestion: UntrustedAiReviewSuggestionRecord = {
      id: `ddai_${crypto.randomBytes(6).toString('hex')}`,
      caseId: caseRec.id,
      sourceEvidenceIds: input.sourceEvidenceIds,
      modelIdentifier: input.modelIdentifier,
      extractedFacts: input.extractedFacts,
      inferredObservations: input.inferredObservations,
      suggestedFindingCategory: input.suggestedFindingCategory,
      humanReviewStatus: 'UNREVIEWED_SUGGESTION',
      isAuthoritative: false,
      createdAtIso: new Date().toISOString(),
    };
    await this.store.saveAiSuggestion(suggestion);
    return suggestion;
  }

  async generateDueDiligenceReport(
    actor: DueDiligenceCaseActorContext,
    input: {
      caseId: string;
      requestedConclusion: ReportWorkflowConclusion;
      externalVerificationLimitations: string[];
      requiredFollowUpActions: string[];
    }
  ): Promise<DueDiligenceCaseReportSnapshot> {
    const caseRec = await this.store.getCaseById(input.caseId);
    if (!caseRec) throw new VerificationCaseError('RESOURCE_NOT_FOUND', 'Case not found.', 404);
    assertCaseParticipantAccess(actor, caseRec, true);

    const [chk, evidenceList, findingsList, existingReports] = await Promise.all([
      this.store.getChecklistInstanceByCase(caseRec.id),
      this.store.listEvidenceRefsByCase(caseRec.id, 100),
      this.store.listFindingsByCase(caseRec.id, 100),
      this.store.listReportSnapshotsByCase(caseRec.id),
    ]);

    const unresolvedHighOrCritical = findingsList.filter(
      (f) => f.resolutionStatus !== 'RESOLVED' && (f.severity === 'HIGH' || f.severity === 'CRITICAL')
    );

    if (
      unresolvedHighOrCritical.length > 0 &&
      input.requestedConclusion === 'REVIEW_COMPLETE_WITH_NO_RECORDED_CRITICAL_FINDINGS'
    ) {
      throw new VerificationCaseError(
        'CRITICAL_FINDING_BLOCKS_CLEAN_CONCLUSION',
        `Cannot issue REVIEW_COMPLETE_WITH_NO_RECORDED_CRITICAL_FINDINGS while ${unresolvedHighOrCritical.length} unresolved HIGH/CRITICAL findings exist.`,
        409
      );
    }

    const evidenceVersionMap: Record<string, number> = {};
    const verifiedEvidenceIds: string[] = [];
    const unverifiedEvidenceIds: string[] = [];
    for (const ev of evidenceList) {
      evidenceVersionMap[ev.id] = ev.version;
      if (ev.sourceVerificationState === 'EVIDENCE_ACCEPTED_FOR_PURPOSE') {
        verifiedEvidenceIds.push(ev.id);
      } else {
        unverifiedEvidenceIds.push(ev.id);
      }
    }

    const nextVersion = existingReports.length + 1;
    // Mark prior issued versions as SUPERSEDED_BY_NEWER_VERSION without overwriting their contents
    for (const prev of existingReports) {
      if (prev.status === 'ISSUED_IMMUTABLE') {
        await this.store.saveReportSnapshot({
          ...prev,
          status: 'SUPERSEDED_BY_NEWER_VERSION',
        });
      }
    }

    const items = chk?.items ?? [];
    const now = new Date().toISOString();
    const snapshot: DueDiligenceCaseReportSnapshot = {
      id: `ddr_${caseRec.id}_v${nextVersion}`,
      caseId: caseRec.id,
      propertyId: caseRec.propertyId,
      reportVersion: nextVersion,
      generatedAtIso: now,
      scopeOfReview: caseRec.scopeOfReview,
      checklistVersionUsed: chk?.version ?? caseRec.checklistVersion,
      checklistCompletionSummary: {
        totalApplicableItems: items.length,
        verifiedCompleteCount: items.filter((i) => i.status === 'VERIFIED_COMPLETE').length,
        pendingOrUnverifiedCount: items.filter(
          (i) => i.status === 'PENDING_EVIDENCE' || i.status === 'EVIDENCE_SUBMITTED_UNVERIFIED'
        ).length,
        failedOrDiscrepancyCount: items.filter((i) => i.status === 'FAILED_OR_DISCREPANCY').length,
      },
      evidenceVersionMap,
      verifiedEvidenceIds,
      unverifiedEvidenceIds,
      findingIds: findingsList.map((f) => f.id),
      unresolvedHighOrCriticalFindingIds: unresolvedHighOrCritical.map((f) => f.id),
      externalVerificationLimitations: input.externalVerificationLimitations,
      conclusion: input.requestedConclusion,
      requiredFollowUpActions: input.requiredFollowUpActions,
      status: 'ISSUED_IMMUTABLE',
      isLegalGuaranteeOrCertification: false,
    };

    await this.store.saveReportSnapshot(snapshot);
    await this.store.saveCase({
      ...caseRec,
      reportIds: Array.from(new Set([...caseRec.reportIds, snapshot.id])),
      status: 'READY_FOR_REPORT',
      version: caseRec.version + 1,
      updatedAt: now,
    });
    return snapshot;
  }

  async retrieveImmutableReportVersion(
    actor: DueDiligenceCaseActorContext,
    caseId: string,
    reportVersion: number
  ): Promise<DueDiligenceCaseReportSnapshot> {
    const caseRec = await this.store.getCaseById(caseId);
    if (!caseRec) throw new VerificationCaseError('RESOURCE_NOT_FOUND', 'Case not found.', 404);
    assertCaseParticipantAccess(actor, caseRec, false);
    const snap = await this.store.getReportSnapshotByVersion(caseId, reportVersion);
    if (!snap) throw new VerificationCaseError('RESOURCE_NOT_FOUND', `Report v${reportVersion} not found.`, 404);
    return snap;
  }

  async closeCase(
    actor: DueDiligenceCaseActorContext,
    caseId: string
  ): Promise<DueDiligenceCaseRecord> {
    const caseRec = await this.store.getCaseById(caseId);
    if (!caseRec) throw new VerificationCaseError('RESOURCE_NOT_FOUND', 'Case not found.', 404);
    assertCaseParticipantAccess(actor, caseRec, true);

    if (caseRec.reportIds.length === 0) {
      throw new VerificationCaseError(
        'INCOMPLETE_VERIFICATION_BLOCKS_COMPLETION',
        'Cannot complete and close a due diligence case before generating a due diligence report.',
        409
      );
    }

    const now = new Date().toISOString();
    const updated: DueDiligenceCaseRecord = {
      ...caseRec,
      status: 'CLOSED',
      actualCompletionDateIso: now,
      version: caseRec.version + 1,
      updatedAt: now,
    };
    await this.store.saveCase(updated);
    return updated;
  }

  async retrieveCaseHistory(
    actor: DueDiligenceCaseActorContext,
    caseId: string
  ): Promise<{
    caseRecord: DueDiligenceCaseRecord;
    verifications: Awaited<ReturnType<DueDiligenceVerificationCaseStore['listVerificationRecordsByCase']>>;
    reports: DueDiligenceCaseReportSnapshot[];
  }> {
    const caseRec = await this.store.getCaseById(caseId);
    if (!caseRec) throw new VerificationCaseError('RESOURCE_NOT_FOUND', 'Case not found.', 404);
    assertCaseParticipantAccess(actor, caseRec, false);
    const [verifications, reports] = await Promise.all([
      this.store.listVerificationRecordsByCase(caseId),
      this.store.listReportSnapshotsByCase(caseId),
    ]);
    return { caseRecord: caseRec, verifications, reports };
  }

  async attemptCrossModuleDirectWrite(targetModule: string): Promise<never> {
    throw new VerificationCaseError(
      'CROSS_MODULE_WRITE_FORBIDDEN',
      `Direct cross-module write into '${targetModule}' is strictly prohibited by Property Due Diligence & Verification ownership boundaries.`,
      403
    );
  }
}
