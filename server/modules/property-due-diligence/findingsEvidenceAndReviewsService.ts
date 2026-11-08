/**
 * @file server/modules/property-due-diligence/findingsEvidenceAndReviewsService.ts
 * @description Service for Findings, Media Evidence Provenance, Legal/Financial/Geo Reviews, and Technical Measurements.
 */

import type {
  PropertyFinding,
  FindingSeverity,
  ObservationBasis,
  AssessmentEvidenceRecord,
  EvidenceType,
  EvidencePrivacyClassification,
  DocumentReviewRecord,
  DocumentCategory,
  DocumentReviewStatus,
  FinancialEvidenceReviewRecord,
  GeographicEnvironmentalObservation,
  TechnicalMeasurementRecord,
} from './types';
import type { DueDiligenceStore, CursorPageParams, CursorPaginatedResult } from './store';
import type {
  MediaEvidenceReferenceAdapter,
  GeographyAndEnvironmentalReferenceAdapter,
  DueDiligenceEventSink,
} from './adapters';
import {
  DueDiligenceError,
  requireValidId,
  requireNonEmptyText,
  sanitizeString,
  validateFindingSeverity,
  assertCanAccessAssessment,
  assertCanModifyWorkstream,
  assertCanViewEvidence,
} from './validationAndAuthz';

export interface CreateFindingInput {
  assessmentId: string;
  workstreamId: string;
  checklistItemId?: string;
  category: string;
  title: string;
  description: string;
  locationWithinProperty: string;
  observedCondition: string;
  observationBasis: ObservationBasis;
  evidenceIds?: string[];
  evidenceUnavailableExplanation?: string;
  severity: FindingSeverity;
  recommendedNextStep: string;
  authoredByAiSuggestion?: boolean;
  humanConfirmedByUid?: string;
}

export class FindingsEvidenceAndReviewsService {
  constructor(
    private readonly store: DueDiligenceStore,
    private readonly mediaAdapter: MediaEvidenceReferenceAdapter,
    private readonly geoAdapter: GeographyAndEnvironmentalReferenceAdapter,
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

  // --- Findings (Section 10) ---
  async createFinding(
    actorUid: string,
    input: CreateFindingInput,
    isPlatformAdmin = false,
  ): Promise<PropertyFinding> {
    const assessment = await this.store.getAssessmentById(requireValidId(input.assessmentId, 'assessmentId'));
    if (!assessment) throw new DueDiligenceError('NOT_FOUND', 'Assessment not found.', 404);
    assertCanAccessAssessment(actorUid, assessment, undefined, isPlatformAdmin);

    const ws = await this.store.getWorkstreamById(requireValidId(input.workstreamId, 'workstreamId'));
    if (!ws || ws.assessmentId !== assessment.id) {
      throw new DueDiligenceError('NOT_FOUND', 'Workstream not found on this assessment.', 404);
    }
    assertCanModifyWorkstream(actorUid, assessment, ws, isPlatformAdmin);

    const severity = validateFindingSeverity(input.severity);
    const evidenceIds = input.evidenceIds || [];
    const unavailableReason = sanitizeString(input.evidenceUnavailableExplanation, 400);

    // Require evidence or explicit explanation for major or critical findings
    if ((severity === 'major' || severity === 'critical') && evidenceIds.length === 0 && !unavailableReason) {
      throw new DueDiligenceError(
        'EVIDENCE_OR_EXPLANATION_REQUIRED',
        `Significant findings (${severity}) require either supporting evidence IDs or an explicit evidenceUnavailableExplanation.`,
        400,
      );
    }

    // AI boundary check: material findings suggested by AI require human confirmation before confirmation state
    if (input.authoredByAiSuggestion && !input.humanConfirmedByUid && (severity === 'major' || severity === 'critical')) {
      throw new DueDiligenceError(
        'HUMAN_CONFIRMATION_REQUIRED_FOR_AI_FINDING',
        'Material findings suggested by an AI model require explicit human reviewer confirmation.',
        400,
      );
    }

    const nowIso = new Date().toISOString();
    const findingId = `dd_fnd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const finding: PropertyFinding = {
      id: findingId,
      assessmentId: assessment.id,
      workstreamId: ws.id,
      checklistItemId: input.checklistItemId,
      category: requireNonEmptyText(input.category, 'category', 100),
      title: requireNonEmptyText(input.title, 'title', 200),
      description: requireNonEmptyText(input.description, 'description', 1500),
      locationWithinProperty: requireNonEmptyText(input.locationWithinProperty, 'locationWithinProperty', 200),
      observedCondition: requireNonEmptyText(input.observedCondition, 'observedCondition', 500),
      observationBasis: input.observationBasis,
      observationDateIso: nowIso,
      reportingReviewerUid: actorUid,
      evidenceIds,
      evidenceUnavailableExplanation: unavailableReason || undefined,
      severity,
      severityCriteriaVersion: '2026.1-qualitative',
      reviewState: input.authoredByAiSuggestion && !input.humanConfirmedByUid ? 'draft' : 'confirmed',
      recommendedNextStep: requireNonEmptyText(input.recommendedNextStep, 'recommendedNextStep', 400),
      remediationStatus: 'recommended',
      authoredByAiSuggestion: Boolean(input.authoredByAiSuggestion),
      humanConfirmedByUid: input.humanConfirmedByUid,
      history: [
        {
          changedAtIso: nowIso,
          changedByUid: actorUid,
          summary: `Finding created with severity '${severity}' and basis '${input.observationBasis}'.`,
        },
      ],
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
      version: 1,
    };

    const saved = await this.store.saveFinding(finding);

    ws.findingsCount += 1;
    await this.store.saveWorkstream(ws);

    await this.emitAndAudit(assessment.id, assessment.propertyReference, actorUid, 'due_diligence.finding.created', 'finding', saved.id, {
      severity: saved.severity,
      observationBasis: saved.observationBasis,
    });
    return saved;
  }

  async updateFinding(
    actorUid: string,
    findingId: string,
    updates: {
      severity?: FindingSeverity;
      observedCondition?: string;
      observationBasis?: ObservationBasis;
      reviewState?: PropertyFinding['reviewState'];
      remediationStatus?: PropertyFinding['remediationStatus'];
      evidenceIds?: string[];
      changeSummary: string;
      expectedVersion?: number;
    },
    isPlatformAdmin = false,
  ): Promise<PropertyFinding> {
    const finding = await this.store.getFindingById(requireValidId(findingId, 'findingId'));
    if (!finding) throw new DueDiligenceError('NOT_FOUND', 'Finding not found.', 404);

    const assessment = await this.store.getAssessmentById(finding.assessmentId);
    if (!assessment) throw new DueDiligenceError('NOT_FOUND', 'Assessment not found.', 404);
    const ws = await this.store.getWorkstreamById(finding.workstreamId);
    if (!ws) throw new DueDiligenceError('NOT_FOUND', 'Workstream not found.', 404);
    assertCanModifyWorkstream(actorUid, assessment, ws, isPlatformAdmin);

    const summary = requireNonEmptyText(updates.changeSummary, 'changeSummary', 300);
    if (updates.severity) finding.severity = validateFindingSeverity(updates.severity);
    if (updates.observedCondition) finding.observedCondition = sanitizeString(updates.observedCondition, 500);
    if (updates.observationBasis) finding.observationBasis = updates.observationBasis;
    if (updates.reviewState) finding.reviewState = updates.reviewState;
    if (updates.remediationStatus) finding.remediationStatus = updates.remediationStatus;
    if (updates.evidenceIds) finding.evidenceIds = updates.evidenceIds;

    finding.history.push({
      changedAtIso: new Date().toISOString(),
      changedByUid: actorUid,
      summary,
    });

    const saved = await this.store.saveFinding(finding, updates.expectedVersion);
    await this.emitAndAudit(assessment.id, assessment.propertyReference, actorUid, 'due_diligence.finding.updated', 'finding', saved.id, {
      severity: saved.severity,
      remediationStatus: saved.remediationStatus,
    });
    return saved;
  }

  async listFindings(
    actorUid: string,
    assessmentId: string,
    params?: CursorPageParams,
    actorOrgId?: string,
    isPlatformAdmin = false,
  ): Promise<CursorPaginatedResult<PropertyFinding>> {
    const assessment = await this.store.getAssessmentById(requireValidId(assessmentId, 'assessmentId'));
    if (!assessment) throw new DueDiligenceError('NOT_FOUND', 'Assessment not found.', 404);
    assertCanAccessAssessment(actorUid, assessment, actorOrgId, isPlatformAdmin);
    return this.store.listFindingsByAssessment(assessmentId, params);
  }

  // --- Evidence & Media References (Section 11) ---
  async submitEvidence(
    actorUid: string,
    input: {
      assessmentId: string;
      workstreamId?: string;
      findingId?: string;
      mediaReferenceId: string;
      evidenceType: EvidenceType;
      sourceClassification: AssessmentEvidenceRecord['sourceClassification'];
      captureOrDocumentDateIso?: string;
      description: string;
      privacyClassification?: EvidencePrivacyClassification;
    },
    isPlatformAdmin = false,
  ): Promise<AssessmentEvidenceRecord> {
    const assessment = await this.store.getAssessmentById(requireValidId(input.assessmentId, 'assessmentId'));
    if (!assessment) throw new DueDiligenceError('NOT_FOUND', 'Assessment not found.', 404);
    assertCanAccessAssessment(actorUid, assessment, undefined, isPlatformAdmin);

    const mediaRef = requireValidId(input.mediaReferenceId, 'mediaReferenceId');
    const mediaCheck = await this.mediaAdapter.verifyMediaReference(mediaRef);
    if (!mediaCheck.exists) {
      throw new DueDiligenceError('MEDIA_REFERENCE_NOT_FOUND', `Media reference '${mediaRef}' does not exist in Media module.`, 404);
    }

    const nowIso = new Date().toISOString();
    const evidenceId = `dd_evd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const record: AssessmentEvidenceRecord = {
      id: evidenceId,
      assessmentId: assessment.id,
      workstreamId: input.workstreamId,
      findingId: input.findingId,
      mediaReferenceId: mediaRef,
      evidenceType: input.evidenceType,
      sourceClassification: input.sourceClassification,
      submittedByUid: actorUid,
      captureOrDocumentDateIso: input.captureOrDocumentDateIso,
      submittedAtIso: nowIso,
      description: requireNonEmptyText(input.description, 'description', 500),
      // Distinguish upload from independent verification!
      verificationStatus: 'uploaded_unverified',
      privacyClassification: input.privacyClassification || 'assessment_participants_only',
      lockedInReportVersions: [],
      reviewHistory: [
        {
          status: 'uploaded_unverified',
          actorUid,
          note: `Evidence submitted (${input.sourceClassification}).`,
          timestampIso: nowIso,
        },
      ],
    };

    const saved = await this.store.saveEvidence(record);
    await this.emitAndAudit(assessment.id, assessment.propertyReference, actorUid, 'due_diligence.evidence.submitted', 'evidence', saved.id, {
      evidenceType: saved.evidenceType,
      sourceClassification: saved.sourceClassification,
    });
    return saved;
  }

  async reviewEvidence(
    actorUid: string,
    evidenceId: string,
    decision: {
      verificationStatus: 'independently_verified' | 'rejected' | 'verification_unavailable';
      note?: string;
    },
    isPlatformAdmin = false,
  ): Promise<AssessmentEvidenceRecord> {
    const ev = await this.store.getEvidenceById(requireValidId(evidenceId, 'evidenceId'));
    if (!ev) throw new DueDiligenceError('NOT_FOUND', 'Evidence record not found.', 404);

    if (ev.lockedInReportVersions.length > 0 && decision.verificationStatus === 'rejected') {
      throw new DueDiligenceError(
        'EVIDENCE_LOCKED_IN_PUBLISHED_REPORT',
        `Evidence '${ev.id}' is locked in published report version(s) [${ev.lockedInReportVersions.join(', ')}] and cannot be silently invalidated.`,
        409,
      );
    }

    const assessment = await this.store.getAssessmentById(ev.assessmentId);
    if (!assessment) throw new DueDiligenceError('NOT_FOUND', 'Assessment not found.', 404);

    // Separation of duties: user who uploaded user_provided evidence cannot self-verify it
    if (ev.sourceClassification === 'user_provided' && ev.submittedByUid === actorUid && decision.verificationStatus === 'independently_verified' && !isPlatformAdmin) {
      throw new DueDiligenceError('SEPARATION_OF_DUTIES_VIOLATION', 'Submitter of user-provided evidence cannot self-approve independent verification.', 403);
    }

    if (decision.verificationStatus === 'rejected' && !sanitizeString(decision.note, 300)) {
      throw new DueDiligenceError('REJECTION_REASON_REQUIRED', 'Explanation required when rejecting submitted evidence.', 400);
    }

    const nowIso = new Date().toISOString();
    ev.verificationStatus = decision.verificationStatus;
    if (decision.verificationStatus === 'rejected') {
      ev.rejectionExplanation = sanitizeString(decision.note, 300);
    }
    if (decision.verificationStatus === 'independently_verified') {
      ev.verifiedByUid = actorUid;
      ev.verifiedAtIso = nowIso;
    }
    ev.reviewHistory.push({
      status: decision.verificationStatus,
      actorUid,
      note: decision.note ? sanitizeString(decision.note, 300) : undefined,
      timestampIso: nowIso,
    });

    return this.store.saveEvidence(ev);
  }

  async getEvidenceAuthorized(
    actorUid: string,
    evidenceId: string,
    isPlatformAdmin = false,
  ): Promise<AssessmentEvidenceRecord> {
    const ev = await this.store.getEvidenceById(requireValidId(evidenceId, 'evidenceId'));
    if (!ev) throw new DueDiligenceError('NOT_FOUND', 'Evidence not found.', 404);
    const assessment = await this.store.getAssessmentById(ev.assessmentId);
    if (!assessment) throw new DueDiligenceError('NOT_FOUND', 'Assessment not found.', 404);
    assertCanViewEvidence(actorUid, assessment, ev.privacyClassification, isPlatformAdmin);
    return ev;
  }

  // --- Legal & Ownership Document Review (Section 12) ---
  async submitDocumentForReview(
    actorUid: string,
    input: {
      assessmentId: string;
      documentCategory: DocumentCategory;
      mediaReferenceId?: string;
      documentDateIso?: string;
      statedIssuingAuthority?: string;
      visibleDocumentIdentifier?: string;
    },
    isPlatformAdmin = false,
  ): Promise<DocumentReviewRecord> {
    const assessment = await this.store.getAssessmentById(requireValidId(input.assessmentId, 'assessmentId'));
    if (!assessment) throw new DueDiligenceError('NOT_FOUND', 'Assessment not found.', 404);
    assertCanAccessAssessment(actorUid, assessment, undefined, isPlatformAdmin);

    if (input.mediaReferenceId) {
      const mCheck = await this.mediaAdapter.verifyMediaReference(input.mediaReferenceId);
      if (!mCheck.exists) {
        throw new DueDiligenceError('MEDIA_REFERENCE_NOT_FOUND', 'Referenced document media not found.', 404);
      }
    }

    const nowIso = new Date().toISOString();
    const docId = `dd_doc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const record: DocumentReviewRecord = {
      id: docId,
      assessmentId: assessment.id,
      documentCategory: input.documentCategory,
      mediaReferenceId: input.mediaReferenceId,
      submittedByUid: actorUid,
      documentDateIso: input.documentDateIso,
      statedIssuingAuthority: input.statedIssuingAuthority ? sanitizeString(input.statedIssuingAuthority, 150) : undefined,
      visibleDocumentIdentifier: input.visibleDocumentIdentifier ? sanitizeString(input.visibleDocumentIdentifier, 100) : undefined,
      isCopyNotOfficialRegistry: true,
      reviewStatus: input.mediaReferenceId ? 'supplied' : 'requested',
      history: [
        {
          status: input.mediaReferenceId ? 'supplied' : 'requested',
          actorUid,
          timestampIso: nowIso,
        },
      ],
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
    };

    return this.store.saveDocumentReview(record);
  }

  async recordDocumentReviewResult(
    actorUid: string,
    docReviewId: string,
    result: {
      reviewStatus: DocumentReviewStatus;
      verificationMethod: NonNullable<DocumentReviewRecord['verificationMethod']>;
      externalVerificationReference?: string;
      reviewerNotes?: string;
    },
    isPlatformAdmin = false,
  ): Promise<DocumentReviewRecord> {
    const doc = await this.store.getDocumentReviewById(requireValidId(docReviewId, 'docReviewId'));
    if (!doc) throw new DueDiligenceError('NOT_FOUND', 'Document review record not found.', 404);

    const assessment = await this.store.getAssessmentById(doc.assessmentId);
    if (!assessment) throw new DueDiligenceError('NOT_FOUND', 'Assessment not found.', 404);
    assertCanViewEvidence(actorUid, assessment, 'confidential_legal_financial', isPlatformAdmin);

    // Never claim independent registry verification without an external verification reference!
    if (
      result.reviewStatus === 'independently_verified' &&
      (result.verificationMethod !== 'external_authorized_registry_adapter' || !sanitizeString(result.externalVerificationReference, 150))
    ) {
      throw new DueDiligenceError(
        'UNSUPPORTED_OWNERSHIP_VERIFICATION',
        'Cannot mark a legal/ownership document as independently_verified without external_authorized_registry_adapter and a valid externalVerificationReference.',
        400,
      );
    }

    const nowIso = new Date().toISOString();
    doc.reviewerUid = actorUid;
    doc.reviewStatus = result.reviewStatus;
    doc.verificationMethod = result.verificationMethod;
    doc.externalVerificationReference = result.externalVerificationReference ? sanitizeString(result.externalVerificationReference, 150) : undefined;
    doc.reviewerNotes = result.reviewerNotes ? sanitizeString(result.reviewerNotes, 600) : undefined;
    doc.reviewedAtIso = nowIso;
    doc.history.push({
      status: result.reviewStatus,
      actorUid,
      note: doc.reviewerNotes,
      timestampIso: nowIso,
    });

    const saved = await this.store.saveDocumentReview(doc);
    await this.emitAndAudit(assessment.id, assessment.propertyReference, actorUid, 'due_diligence.document.reviewed', 'document_review', saved.id, {
      documentCategory: saved.documentCategory,
      reviewStatus: saved.reviewStatus,
      verificationMethod: saved.verificationMethod,
    });
    return saved;
  }

  async getDocumentReviewsAuthorized(
    actorUid: string,
    assessmentId: string,
    isPlatformAdmin = false,
  ): Promise<DocumentReviewRecord[]> {
    const assessment = await this.store.getAssessmentById(requireValidId(assessmentId, 'assessmentId'));
    if (!assessment) throw new DueDiligenceError('NOT_FOUND', 'Assessment not found.', 404);
    assertCanViewEvidence(actorUid, assessment, 'confidential_legal_financial', isPlatformAdmin);
    return this.store.listDocumentReviewsByAssessment(assessmentId);
  }

  // --- Financial Evidence Review (Section 13) ---
  async recordFinancialEvidenceReview(
    actorUid: string,
    input: Omit<FinancialEvidenceReviewRecord, 'id' | 'reviewerUid' | 'recordedAtIso'>,
    isPlatformAdmin = false,
  ): Promise<FinancialEvidenceReviewRecord> {
    const assessment = await this.store.getAssessmentById(requireValidId(input.assessmentId, 'assessmentId'));
    if (!assessment) throw new DueDiligenceError('NOT_FOUND', 'Assessment not found.', 404);
    assertCanViewEvidence(actorUid, assessment, 'confidential_legal_financial', isPlatformAdmin);

    if (typeof input.amount !== 'number' || !Number.isFinite(input.amount) || input.amount < 0) {
      throw new DueDiligenceError('INVALID_FINANCIAL_AMOUNT', 'Financial amount must be a non-negative finite number.', 400);
    }
    if (Date.parse(input.reportingPeriodEndIso) < Date.parse(input.reportingPeriodStartIso)) {
      throw new DueDiligenceError('INVALID_REPORTING_PERIOD', 'Reporting period end date cannot precede start date.', 400);
    }

    const rec: FinancialEvidenceReviewRecord = {
      ...input,
      id: `dd_fin_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      reviewerUid: actorUid,
      recordedAtIso: new Date().toISOString(),
    };
    return this.store.saveFinancialRecord(rec);
  }

  // --- Geographic & Environmental Review (Section 14) ---
  async recordGeographicEnvironmentalObservation(
    actorUid: string,
    input: {
      assessmentId: string;
      canonicalCityId: string;
      canonicalNeighborhoodId?: number;
      category: GeographicEnvironmentalObservation['category'];
      sourceType: GeographicEnvironmentalObservation['sourceType'];
      datasetSourceName?: string;
      datasetPublishedAtIso?: string;
      observationSummary: string;
      verificationStatus: GeographicEnvironmentalObservation['verificationStatus'];
    },
    isPlatformAdmin = false,
  ): Promise<GeographicEnvironmentalObservation> {
    const assessment = await this.store.getAssessmentById(requireValidId(input.assessmentId, 'assessmentId'));
    if (!assessment) throw new DueDiligenceError('NOT_FOUND', 'Assessment not found.', 404);
    assertCanAccessAssessment(actorUid, assessment, undefined, isPlatformAdmin);

    const geoCheck = await this.geoAdapter.validateGeographicContext(input.canonicalCityId, input.canonicalNeighborhoodId);
    if (!geoCheck.isValidCity || !geoCheck.isValidNeighborhood) {
      throw new DueDiligenceError('INVALID_GEOGRAPHIC_REFERENCE', 'Invalid canonical city or neighborhood reference.', 400);
    }

    const publishedIso = input.datasetPublishedAtIso || geoCheck.datasetPublishedAtIso;
    // Flag dataset as stale if older than 365 days
    const isStale = publishedIso ? Date.now() - Date.parse(publishedIso) > 365 * 24 * 60 * 60 * 1000 : false;

    const obs: GeographicEnvironmentalObservation = {
      id: `dd_geo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      assessmentId: assessment.id,
      canonicalCityId: input.canonicalCityId,
      canonicalNeighborhoodId: input.canonicalNeighborhoodId,
      category: input.category,
      sourceType: input.sourceType,
      datasetSourceName: input.datasetSourceName || geoCheck.datasetSourceName,
      datasetPublishedAtIso: publishedIso,
      isStaleDataset: isStale,
      observationSummary: requireNonEmptyText(input.observationSummary, 'observationSummary', 600),
      verificationStatus: input.sourceType === 'user_reported_observation' ? 'unverified_report' : input.verificationStatus,
      recordedByUid: actorUid,
      recordedAtIso: new Date().toISOString(),
    };
    return this.store.saveGeoEnvironmentalObservation(obs);
  }

  // --- Technical Measurements (Section 15) ---
  async recordTechnicalMeasurement(
    actorUid: string,
    input: {
      assessmentId: string;
      findingOrChecklistId?: string;
      measurementType: TechnicalMeasurementRecord['measurementType'];
      originalValue: number;
      originalUnit: string;
      measurementMethod: TechnicalMeasurementRecord['measurementMethod'];
      instrumentReference?: string;
      certificationEvidenceId?: string;
      measurementConditions?: string;
      evidenceId?: string;
      notes?: string;
    },
    isPlatformAdmin = false,
  ): Promise<TechnicalMeasurementRecord> {
    const assessment = await this.store.getAssessmentById(requireValidId(input.assessmentId, 'assessmentId'));
    if (!assessment) throw new DueDiligenceError('NOT_FOUND', 'Assessment not found.', 404);
    assertCanAccessAssessment(actorUid, assessment, undefined, isPlatformAdmin);

    if (typeof input.originalValue !== 'number' || !Number.isFinite(input.originalValue)) {
      throw new DueDiligenceError('INVALID_MEASUREMENT_VALUE', 'Measurement value must be a finite number.', 400);
    }
    const unit = requireNonEmptyText(input.originalUnit, 'originalUnit', 32);

    const record: TechnicalMeasurementRecord = {
      id: `dd_msr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      assessmentId: assessment.id,
      findingOrChecklistId: input.findingOrChecklistId,
      measurementType: input.measurementType,
      originalValue: input.originalValue,
      originalUnit: unit,
      measurementMethod: input.measurementMethod,
      instrumentReference: input.instrumentReference ? sanitizeString(input.instrumentReference, 100) : undefined,
      certificationEvidenceId: input.certificationEvidenceId,
      // Never claim certified measurement unless certification evidence exists and method is instrument_reading
      isCertifiedMeasurement: Boolean(input.certificationEvidenceId && input.measurementMethod === 'instrument_reading'),
      measurementConditions: input.measurementConditions ? sanitizeString(input.measurementConditions, 200) : undefined,
      reviewerUid: actorUid,
      measuredAtIso: new Date().toISOString(),
      evidenceId: input.evidenceId,
      notes: input.notes ? sanitizeString(input.notes, 300) : undefined,
      correctionHistory: [],
    };
    return this.store.saveMeasurement(record);
  }
}
