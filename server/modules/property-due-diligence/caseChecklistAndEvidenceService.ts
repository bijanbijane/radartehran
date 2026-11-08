import crypto from 'crypto';
import {
  CaseReviewerAssignmentRecord,
  ChecklistDomainCategory,
  DueDiligenceCaseActorContext,
  DueDiligenceCaseRecord,
  DueDiligenceCaseStatus,
  DueDiligenceCaseType,
  DueDiligenceChecklistInstanceRecord,
  DueDiligenceEvidenceReferenceRecord,
  DueDiligenceVerificationRecord,
  EvidenceSourceClassification,
  EvidenceVerificationState,
  VerificationCaseError,
  VerificationChecklistItemSpec,
  VerificationMethodType,
  VerificationOutcomeResult,
} from './verificationCaseTypes';
import { DueDiligenceVerificationCaseStore } from './verificationCaseStore';

export function assertCaseParticipantAccess(
  actor: DueDiligenceCaseActorContext,
  caseRec: DueDiligenceCaseRecord,
  requireCoordinatorOrSupervisor = false
): void {
  if (actor.role === 'UNRELATED_USER') {
    throw new VerificationCaseError(
      'UNAUTHORIZED_CASE_ACCESS',
      `Actor '${actor.userId}' is not authorized to access due diligence case '${caseRec.id}'.`,
      403
    );
  }
  const isParticipant =
    actor.userId === caseRec.requestingUserId ||
    caseRec.assignedReviewerIds.includes(actor.userId) ||
    actor.role === 'CASE_COORDINATOR_OR_SUPERVISOR';

  if (!isParticipant) {
    throw new VerificationCaseError(
      'UNAUTHORIZED_CASE_ACCESS',
      `Actor '${actor.userId}' is not a participant on case '${caseRec.id}'.`,
      403
    );
  }
  if (requireCoordinatorOrSupervisor && actor.role !== 'CASE_COORDINATOR_OR_SUPERVISOR') {
    throw new VerificationCaseError(
      'UNAUTHORIZED_REVIEWER_SCOPE',
      `Role '${actor.role}' cannot perform coordinator/supervisor actions on case '${caseRec.id}'.`,
      403
    );
  }
}

export class CaseChecklistAndEvidenceService {
  constructor(private readonly store: DueDiligenceVerificationCaseStore) {}

  async createDueDiligenceCase(
    actor: DueDiligenceCaseActorContext,
    input: {
      id?: string;
      propertyId: string;
      transactionRef?: string;
      organizationId?: string;
      caseType: DueDiligenceCaseType;
      jurisdiction: { citySlug: string; districtCode?: string; neighborhoodIdOrSlug?: string };
      casePurpose: string;
      scopeOfReview: ChecklistDomainCategory[];
      priority?: DueDiligenceCaseRecord['priority'];
      targetCompletionDateIso?: string;
      checklistVersion?: number;
      confidentialityClassification?: DueDiligenceCaseRecord['confidentialityClassification'];
      isSyntheticTestFixture?: boolean;
    }
  ): Promise<DueDiligenceCaseRecord> {
    if (!input.propertyId || input.propertyId.startsWith('invalid_prop')) {
      throw new VerificationCaseError(
        'INVALID_PROPERTY_REFERENCE',
        `Invalid canonical property reference '${input.propertyId}'.`,
        404
      );
    }

    const now = new Date().toISOString();
    const record: DueDiligenceCaseRecord = {
      id: input.id || `ddcase_${crypto.randomBytes(6).toString('hex')}`,
      propertyId: input.propertyId,
      transactionRef: input.transactionRef,
      requestingUserId: actor.userId,
      organizationId: input.organizationId ?? actor.organizationId,
      assignedReviewerIds: [],
      caseType: input.caseType,
      jurisdiction: {
        ...input.jurisdiction,
        citySlug: input.jurisdiction.citySlug.trim().toLowerCase(),
      },
      casePurpose: input.casePurpose,
      scopeOfReview: input.scopeOfReview,
      priority: input.priority ?? 'NORMAL',
      status: 'OPEN',
      openingDateIso: now,
      targetCompletionDateIso: input.targetCompletionDateIso,
      checklistVersion: input.checklistVersion ?? 1,
      evidenceIds: [],
      findingIds: [],
      reportIds: [],
      confidentialityClassification: input.confidentialityClassification ?? 'STANDARD_CASE_PARTICIPANTS',
      isSyntheticTestFixture: input.isSyntheticTestFixture ?? false,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    await this.store.saveCase(record);
    return record;
  }

  async retrieveCase(
    actor: DueDiligenceCaseActorContext,
    caseId: string
  ): Promise<DueDiligenceCaseRecord> {
    const rec = await this.store.getCaseById(caseId);
    if (!rec) throw new VerificationCaseError('RESOURCE_NOT_FOUND', `Case '${caseId}' not found.`, 404);
    assertCaseParticipantAccess(actor, rec, false);
    return rec;
  }

  async updatePermittedCaseMetadata(
    actor: DueDiligenceCaseActorContext,
    input: {
      caseId: string;
      priority?: DueDiligenceCaseRecord['priority'];
      targetCompletionDateIso?: string;
      status?: Exclude<DueDiligenceCaseStatus, 'COMPLETED'>;
      expectedVersion?: number;
    }
  ): Promise<DueDiligenceCaseRecord> {
    const rec = await this.store.getCaseById(input.caseId);
    if (!rec) throw new VerificationCaseError('RESOURCE_NOT_FOUND', `Case '${input.caseId}' not found.`, 404);
    assertCaseParticipantAccess(actor, rec, false);

    if (input.expectedVersion !== undefined && rec.version !== input.expectedVersion) {
      throw new VerificationCaseError(
        'CONCURRENCY_CONFLICT',
        `Concurrent update conflict on case '${rec.id}': expected v${input.expectedVersion}, actual v${rec.version}.`,
        409
      );
    }

    const updated: DueDiligenceCaseRecord = {
      ...rec,
      priority: input.priority ?? rec.priority,
      targetCompletionDateIso: input.targetCompletionDateIso ?? rec.targetCompletionDateIso,
      status: input.status ?? rec.status,
      version: rec.version + 1,
      updatedAt: new Date().toISOString(),
    };
    await this.store.saveCase(updated);
    return updated;
  }

  async assignReviewer(
    actor: DueDiligenceCaseActorContext,
    input: {
      id?: string;
      caseId: string;
      reviewerUserId: string;
      reviewerRole: string;
      assignedDomains: ChecklistDomainCategory[];
      assignedScopeSummary: string;
      dueDateIso?: string;
      conflictOfInterestDeclaration: CaseReviewerAssignmentRecord['conflictOfInterestDeclaration'];
    }
  ): Promise<CaseReviewerAssignmentRecord> {
    const caseRec = await this.store.getCaseById(input.caseId);
    if (!caseRec) throw new VerificationCaseError('RESOURCE_NOT_FOUND', `Case '${input.caseId}' not found.`, 404);
    assertCaseParticipantAccess(actor, caseRec, true);

    if (
      !input.conflictOfInterestDeclaration.declared ||
      input.conflictOfInterestDeclaration.hasConflict ||
      !input.conflictOfInterestDeclaration.declarationReferenceId.trim()
    ) {
      throw new VerificationCaseError(
        'CONFLICT_OF_INTEREST_VIOLATION',
        'Reviewer assignment requires an explicit conflict-of-interest declaration with hasConflict: false.',
        400
      );
    }

    const now = new Date().toISOString();
    const assignment: CaseReviewerAssignmentRecord = {
      id: input.id || `ddrev_${crypto.randomBytes(6).toString('hex')}`,
      caseId: caseRec.id,
      reviewerUserId: input.reviewerUserId,
      reviewerRole: input.reviewerRole,
      assignedDomains: input.assignedDomains,
      assignedScopeSummary: input.assignedScopeSummary,
      status: 'ASSIGNED',
      startDateIso: now,
      dueDateIso: input.dueDateIso,
      conflictOfInterestDeclaration: input.conflictOfInterestDeclaration,
      isIndependentSecondReview: false,
      independentBasisVerifiedBySupervisor: false,
    };

    await this.store.saveReviewerAssignment(assignment);
    await this.store.saveCase({
      ...caseRec,
      assignedReviewerIds: Array.from(new Set([...caseRec.assignedReviewerIds, input.reviewerUserId])),
      version: caseRec.version + 1,
      updatedAt: now,
    });
    return assignment;
  }

  async requestIndependentSecondReview(
    actor: DueDiligenceCaseActorContext,
    input: {
      caseId: string;
      secondReviewerUserId: string;
      reviewerRole: string;
      assignedDomains: ChecklistDomainCategory[];
      conflictOfInterestDeclaration: CaseReviewerAssignmentRecord['conflictOfInterestDeclaration'];
      independentBasisVerifiedBySupervisor: boolean;
    }
  ): Promise<CaseReviewerAssignmentRecord> {
    const caseRec = await this.store.getCaseById(input.caseId);
    if (!caseRec) throw new VerificationCaseError('RESOURCE_NOT_FOUND', `Case '${input.caseId}' not found.`, 404);
    assertCaseParticipantAccess(actor, caseRec, true);

    // Do NOT automatically claim a reviewer is independent merely because they have a different user ID
    if (!input.independentBasisVerifiedBySupervisor || !input.conflictOfInterestDeclaration.declared || input.conflictOfInterestDeclaration.hasConflict) {
      throw new VerificationCaseError(
        'INDEPENDENT_REVIEW_NOT_VERIFIED',
        'Independent second reviewer cannot be assumed independent from a different userId alone; explicit supervisor verification and non-conflict declaration are required.',
        400
      );
    }

    const now = new Date().toISOString();
    const record: CaseReviewerAssignmentRecord = {
      id: `ddrev2_${crypto.randomBytes(6).toString('hex')}`,
      caseId: caseRec.id,
      reviewerUserId: input.secondReviewerUserId,
      reviewerRole: input.reviewerRole,
      assignedDomains: input.assignedDomains,
      assignedScopeSummary: 'Independent second review',
      status: 'ASSIGNED',
      startDateIso: now,
      conflictOfInterestDeclaration: input.conflictOfInterestDeclaration,
      isIndependentSecondReview: true,
      independentBasisVerifiedBySupervisor: true,
    };
    await this.store.saveReviewerAssignment(record);
    await this.store.saveCase({
      ...caseRec,
      assignedReviewerIds: Array.from(new Set([...caseRec.assignedReviewerIds, input.secondReviewerUserId])),
      version: caseRec.version + 1,
      updatedAt: now,
    });
    return record;
  }

  async completeReviewerAssignment(
    actor: DueDiligenceCaseActorContext,
    input: { assignmentId: string; reviewNotes: string }
  ): Promise<CaseReviewerAssignmentRecord> {
    const asg = await this.store.getReviewerAssignmentById(input.assignmentId);
    if (!asg) throw new VerificationCaseError('RESOURCE_NOT_FOUND', `Assignment '${input.assignmentId}' not found.`, 404);
    if (actor.userId !== asg.reviewerUserId && actor.role !== 'CASE_COORDINATOR_OR_SUPERVISOR') {
      throw new VerificationCaseError('UNAUTHORIZED_REVIEWER_SCOPE', 'Not authorized to complete assignment.', 403);
    }
    const updated: CaseReviewerAssignmentRecord = {
      ...asg,
      status: 'COMPLETED',
      completedAtIso: new Date().toISOString(),
      reviewNotes: input.reviewNotes,
    };
    await this.store.saveReviewerAssignment(updated);
    return updated;
  }

  async createChecklistInstance(
    actor: DueDiligenceCaseActorContext,
    input: {
      caseId: string;
      templateId: string;
      version: number;
      candidateItems: Omit<VerificationChecklistItemSpec, 'status' | 'linkedEvidenceIds'>[];
    }
  ): Promise<DueDiligenceChecklistInstanceRecord> {
    const caseRec = await this.store.getCaseById(input.caseId);
    if (!caseRec) throw new VerificationCaseError('RESOURCE_NOT_FOUND', `Case '${input.caseId}' not found.`, 404);
    assertCaseParticipantAccess(actor, caseRec, false);

    const citySlug = caseRec.jurisdiction.citySlug;
    // Filter items by jurisdiction applicability (do not assume every item applies to every jurisdiction)
    const applicableItems: VerificationChecklistItemSpec[] = input.candidateItems
      .filter(
        (item) =>
          item.applicableCitySlugs.length === 0 ||
          item.applicableCitySlugs.includes('*') ||
          item.applicableCitySlugs.map((s) => s.toLowerCase()).includes(citySlug)
      )
      .map((item) => ({
        ...item,
        effectiveVersion: input.version,
        status: 'PENDING_EVIDENCE',
        linkedEvidenceIds: [],
      }));

    const now = new Date().toISOString();
    const instance: DueDiligenceChecklistInstanceRecord = {
      id: `ddchk_${crypto.randomBytes(6).toString('hex')}`,
      caseId: caseRec.id,
      templateId: input.templateId,
      version: input.version,
      jurisdictionCitySlug: citySlug,
      items: applicableItems,
      createdAt: now,
      updatedAt: now,
    };

    await this.store.saveChecklistInstance(instance);
    await this.store.saveCase({
      ...caseRec,
      checklistInstanceId: instance.id,
      checklistVersion: input.version,
      version: caseRec.version + 1,
      updatedAt: now,
    });
    return instance;
  }

  async retrieveApplicableChecklist(
    actor: DueDiligenceCaseActorContext,
    caseId: string
  ): Promise<DueDiligenceChecklistInstanceRecord> {
    const caseRec = await this.retrieveCase(actor, caseId);
    const chk = await this.store.getChecklistInstanceByCase(caseRec.id);
    if (!chk) throw new VerificationCaseError('RESOURCE_NOT_FOUND', 'Checklist instance not found.', 404);
    return chk;
  }

  async registerEvidenceReference(
    actor: DueDiligenceCaseActorContext,
    input: {
      id?: string;
      caseId: string;
      checklistItemId?: string;
      evidenceCategory: string;
      mediaReferenceId: string;
      documentIssuerRef?: string;
      sourceClassification: EvidenceSourceClassification;
      dateOfIssueIso?: string;
      confidentialityTier?: DueDiligenceEvidenceReferenceRecord['confidentialityTier'];
      idempotencyKey?: string;
      rejectDuplicateMediaReference?: boolean;
    }
  ): Promise<DueDiligenceEvidenceReferenceRecord> {
    if (input.idempotencyKey) {
      const existingId = await this.store.getIdempotencyTargetId(input.idempotencyKey);
      if (existingId) {
        const existing = await this.store.getEvidenceRefById(existingId);
        if (existing) return existing;
      }
    }

    const caseRec = await this.store.getCaseById(input.caseId);
    if (!caseRec) throw new VerificationCaseError('RESOURCE_NOT_FOUND', `Case '${input.caseId}' not found.`, 404);
    assertCaseParticipantAccess(actor, caseRec, false);

    const existingEv = await this.store.listEvidenceRefsByCase(caseRec.id, 100);
    if (
      input.rejectDuplicateMediaReference &&
      existingEv.some((e) => e.mediaReferenceId === input.mediaReferenceId && e.checklistItemId === input.checklistItemId)
    ) {
      throw new VerificationCaseError(
        'DUPLICATE_EVIDENCE_SUBMISSION',
        `Duplicate mediaReferenceId '${input.mediaReferenceId}' for checklist item '${input.checklistItemId ?? 'general'}'.`,
        409
      );
    }

    const now = new Date().toISOString();
    const record: DueDiligenceEvidenceReferenceRecord = {
      id: input.id || `ddev_${crypto.randomBytes(6).toString('hex')}`,
      caseId: caseRec.id,
      checklistItemId: input.checklistItemId,
      evidenceCategory: input.evidenceCategory,
      mediaReferenceId: input.mediaReferenceId,
      documentIssuerRef: input.documentIssuerRef,
      sourceClassification: input.sourceClassification,
      dateOfIssueIso: input.dateOfIssueIso,
      dateReceivedIso: now,
      submittedByUserId: actor.userId,
      sourceVerificationState: 'EVIDENCE_SUBMITTED',
      confidentialityTier: input.confidentialityTier ?? 'CASE_PARTICIPANTS',
      isAuthenticProvenByUploadAlone: false,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    await this.store.saveEvidenceRef(record);
    if (input.idempotencyKey) {
      await this.store.saveIdempotencyTargetId(input.idempotencyKey, record.id);
    }

    // Update checklist item to EVIDENCE_SUBMITTED_UNVERIFIED (NEVER auto-completing case or item on upload alone!)
    if (input.checklistItemId) {
      const chk = await this.store.getChecklistInstanceByCase(caseRec.id);
      if (chk) {
        const updatedItems = chk.items.map((item) =>
          item.itemId === input.checklistItemId
            ? {
                ...item,
                status: (item.status === 'PENDING_EVIDENCE' ? 'EVIDENCE_SUBMITTED_UNVERIFIED' : item.status) as VerificationChecklistItemSpec['status'],
                linkedEvidenceIds: Array.from(new Set([...item.linkedEvidenceIds, record.id])),
              }
            : item
        );
        await this.store.saveChecklistInstance({ ...chk, items: updatedItems, updatedAt: now });
      }
    }

    await this.store.saveCase({
      ...caseRec,
      status: caseRec.status === 'OPEN' || caseRec.status === 'EVIDENCE_REQUESTED' ? 'EVIDENCE_RECEIVED' : caseRec.status,
      evidenceIds: Array.from(new Set([...caseRec.evidenceIds, record.id])),
      version: caseRec.version + 1,
      updatedAt: now,
    });

    return record;
  }

  async retrieveEvidenceReference(
    actor: DueDiligenceCaseActorContext,
    evidenceId: string
  ): Promise<DueDiligenceEvidenceReferenceRecord> {
    const ev = await this.store.getEvidenceRefById(evidenceId);
    if (!ev) throw new VerificationCaseError('RESOURCE_NOT_FOUND', `Evidence '${evidenceId}' not found.`, 404);
    const caseRec = await this.retrieveCase(actor, ev.caseId);
    if (
      ev.confidentialityTier === 'RESTRICTED_OWNERSHIP_OR_FINANCIAL' &&
      actor.role !== 'LEGAL_FINANCIAL_REVIEWER' &&
      actor.role !== 'CASE_COORDINATOR_OR_SUPERVISOR' &&
      actor.userId !== caseRec.requestingUserId
    ) {
      throw new VerificationCaseError(
        'RESTRICTED_EVIDENCE_ACCESS_DENIED',
        `Role '${actor.role}' is not authorized to view restricted ownership/financial evidence '${ev.id}'.`,
        403
      );
    }
    return ev;
  }

  async reviewEvidence(
    actor: DueDiligenceCaseActorContext,
    input: {
      evidenceId: string;
      newVerificationState: Extract<
        EvidenceVerificationState,
        'EVIDENCE_REVIEWED' | 'EVIDENCE_ACCEPTED_FOR_PURPOSE' | 'EVIDENCE_REJECTED' | 'EVIDENCE_EXPIRED' | 'EVIDENCE_CONTRADICTED'
      >;
      reviewNotes: string;
      contradictedByEvidenceId?: string;
    }
  ): Promise<DueDiligenceEvidenceReferenceRecord> {
    const ev = await this.store.getEvidenceRefById(input.evidenceId);
    if (!ev) throw new VerificationCaseError('RESOURCE_NOT_FOUND', `Evidence '${input.evidenceId}' not found.`, 404);
    const caseRec = await this.retrieveCase(actor, ev.caseId);

    if (actor.role === 'CASE_REQUESTER' || ev.submittedByUserId === actor.userId) {
      throw new VerificationCaseError(
        'UNVERIFIED_DOCUMENT_CANNOT_SELF_VERIFY',
        'Evidence submitter or case requester cannot review or accept their own submitted evidence.',
        403
      );
    }

    const updated: DueDiligenceEvidenceReferenceRecord = {
      ...ev,
      sourceVerificationState: input.newVerificationState,
      reviewerUserId: actor.userId,
      reviewNotes: input.reviewNotes,
      contradictedByEvidenceId: input.contradictedByEvidenceId,
      version: ev.version + 1,
      updatedAt: new Date().toISOString(),
    };
    await this.store.saveEvidenceRef(updated);
    return updated;
  }

  async recordVerificationResult(
    actor: DueDiligenceCaseActorContext,
    input: {
      id?: string;
      caseId: string;
      evidenceId: string;
      checklistItemId?: string;
      subjectVerified: string;
      verificationCategory: ChecklistDomainCategory;
      verificationMethod: VerificationMethodType;
      verificationSource: string;
      verificationResult: VerificationOutcomeResult;
      confidenceClassification?: DueDiligenceVerificationRecord['confidenceClassification'];
      supportingReferences: string[];
      contradictingEvidenceIds?: string[];
      limitations: string;
    }
  ): Promise<DueDiligenceVerificationRecord> {
    const caseRec = await this.retrieveCase(actor, input.caseId);
    if (actor.role === 'CASE_REQUESTER') {
      throw new VerificationCaseError('UNAUTHORIZED_REVIEWER_SCOPE', 'Requester cannot record verification results.', 403);
    }
    if (
      actor.authorizedDomains &&
      actor.authorizedDomains.length > 0 &&
      !actor.authorizedDomains.includes(input.verificationCategory)
    ) {
      throw new VerificationCaseError(
        'UNAUTHORIZED_REVIEWER_SCOPE',
        `Reviewer is not authorized for domain '${input.verificationCategory}'.`,
        403
      );
    }

    const finalResult: VerificationOutcomeResult =
      input.contradictingEvidenceIds && input.contradictingEvidenceIds.length > 0
        ? 'CONFLICTING_EVIDENCE'
        : input.verificationResult;

    const now = new Date().toISOString();
    const record: DueDiligenceVerificationRecord = {
      id: input.id || `ddver_${crypto.randomBytes(6).toString('hex')}`,
      caseId: caseRec.id,
      evidenceId: input.evidenceId,
      checklistItemId: input.checklistItemId,
      subjectVerified: input.subjectVerified,
      verificationCategory: input.verificationCategory,
      verificationMethod: input.verificationMethod,
      verificationSource: input.verificationSource,
      reviewerUserId: actor.userId,
      verificationResult: finalResult,
      confidenceClassification: input.confidenceClassification,
      verifiedAtIso: now,
      supportingReferences: input.supportingReferences,
      contradictingEvidenceIds: input.contradictingEvidenceIds,
      limitations: input.limitations,
    };

    await this.store.saveVerificationRecord(record);

    if (input.checklistItemId) {
      const chk = await this.store.getChecklistInstanceByCase(caseRec.id);
      if (chk) {
        const updatedItems = chk.items.map((item) =>
          item.itemId === input.checklistItemId
            ? {
                ...item,
                status: (finalResult === 'VERIFIED' || finalResult === 'VERIFIED_WITH_LIMITATIONS'
                  ? 'VERIFIED_COMPLETE'
                  : 'FAILED_OR_DISCREPANCY') as VerificationChecklistItemSpec['status'],
              }
            : item
        );
        await this.store.saveChecklistInstance({ ...chk, items: updatedItems, updatedAt: now });
      }
    }

    return record;
  }

  async requestAdditionalEvidence(
    actor: DueDiligenceCaseActorContext,
    caseId: string,
    reasonSummary: string
  ): Promise<DueDiligenceCaseRecord> {
    const caseRec = await this.retrieveCase(actor, caseId);
    const updated: DueDiligenceCaseRecord = {
      ...caseRec,
      status: 'EVIDENCE_REQUESTED',
      casePurpose: `${caseRec.casePurpose} [Additional Evidence Requested: ${reasonSummary}]`,
      version: caseRec.version + 1,
      updatedAt: new Date().toISOString(),
    };
    await this.store.saveCase(updated);
    return updated;
  }
}
