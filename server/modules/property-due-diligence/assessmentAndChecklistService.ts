/**
 * @file server/modules/property-due-diligence/assessmentAndChecklistService.ts
 * @description Service for Assessments, Workstreams, Reviewer Assignments, and Versioned Checklist Engine.
 */

import type {
  DueDiligenceAssessment,
  AssessmentType,
  AssessmentStatus,
  AssessmentPriority,
  WorkstreamType,
  WorkstreamStatus,
  ReviewerRole,
  AssessmentWorkstream,
  ChecklistTemplate,
  ChecklistItemDefinition,
  ChecklistResponseRecord,
  ChecklistResponseType,
} from './types';
import type { DueDiligenceStore } from './store';
import type {
  PropertyRegistryReferenceAdapter,
  ServiceProvidersQualificationAdapter,
  AppointmentsReferenceAdapter,
  DueDiligenceEventSink,
} from './adapters';
import {
  DueDiligenceError,
  requireValidId,
  requireNonEmptyText,
  sanitizeString,
  validateAssessmentType,
  validateWorkstreamType,
  validateReviewerRole,
  assertValidAssessmentStateTransition,
  assertCanAccessAssessment,
  assertCanModifyWorkstream,
  assertCanCoordinateOrApproveReport,
} from './validationAndAuthz';

export interface CreateAssessmentInput {
  assessmentType: AssessmentType;
  propertyReference: string;
  listingReference?: string;
  transactionReference?: string;
  appointmentReferences?: string[];
  requestingOrganizationId?: string;
  includedWorkstreams: WorkstreamType[];
  objectives: string[];
  limitationsAndExclusions?: string[];
  priority?: AssessmentPriority;
  plannedStartDateIso?: string;
  plannedCompletionDateIso?: string;
  reportingCurrency?: 'IRT' | 'IRR' | 'USD' | 'EUR';
  idempotencyKey?: string;
}

export interface CreateWorkstreamInput {
  assessmentId: string;
  workstreamType: WorkstreamType;
  description: string;
  assignedReviewerUid?: string;
  assignedReviewerRole?: ReviewerRole;
  checklistTemplateId?: string;
  checklistTemplateVersion?: number;
  isMandatory?: boolean;
}

export interface RecordChecklistResponseInput {
  assessmentId: string;
  workstreamId: string;
  itemId: string;
  responseType: ChecklistResponseType;
  value: string | number | boolean | null;
  unit?: string;
  isSubjectiveObservation?: boolean;
  reasonIfIncompleteOrNegative?: string;
  evidenceIds?: string[];
  reviewerNotes?: string;
  classification: ChecklistResponseRecord['classification'];
  expectedVersion?: number;
}

export class AssessmentAndChecklistService {
  constructor(
    private readonly store: DueDiligenceStore,
    private readonly propertyAdapter: PropertyRegistryReferenceAdapter,
    private readonly providerAdapter: ServiceProvidersQualificationAdapter,
    private readonly appointmentAdapter: AppointmentsReferenceAdapter,
    private readonly eventSink: DueDiligenceEventSink,
  ) {}

  private async emitAndAudit(
    assessment: DueDiligenceAssessment,
    actorUid: string,
    eventType: Parameters<DueDiligenceEventSink['publishEvent']>[0]['eventType'],
    targetEntityType: string,
    targetEntityId: string,
    payload: Record<string, unknown>,
    idempotencyKey?: string,
  ): Promise<void> {
    const nowIso = new Date().toISOString();
    await this.store.appendAuditEntry({
      id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      assessmentId: assessment.id,
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
      assessmentId: assessment.id,
      propertyReference: assessment.propertyReference,
      actorUid,
      timestampIso: nowIso,
      idempotencyKey,
      payload,
    });
  }

  async createAssessment(
    actorUid: string,
    input: CreateAssessmentInput,
  ): Promise<DueDiligenceAssessment> {
    if (!actorUid) throw new DueDiligenceError('UNAUTHENTICATED', 'Verified principal UID required.', 401);

    if (input.idempotencyKey) {
      const cached = await this.store.getIdempotentResult<DueDiligenceAssessment>(`create_assessment:${actorUid}:${input.idempotencyKey}`);
      if (cached) return cached;
    }

    const assessmentType = validateAssessmentType(input.assessmentType);
    const propertyRef = requireValidId(input.propertyReference, 'propertyReference');
    const propCheck = await this.propertyAdapter.verifyPropertyReference(propertyRef);
    if (!propCheck.exists) {
      throw new DueDiligenceError('PROPERTY_NOT_FOUND', `Canonical property reference '${propertyRef}' not found.`, 404, 'propertyReference');
    }

    if (!Array.isArray(input.includedWorkstreams) || input.includedWorkstreams.length === 0) {
      throw new DueDiligenceError('EMPTY_SCOPE', 'Assessment scope must include at least one workstream.', 400, 'includedWorkstreams');
    }
    const validWorkstreams = input.includedWorkstreams.map((w) => validateWorkstreamType(w));

    const appointmentRefs: string[] = [];
    for (const apptId of input.appointmentReferences || []) {
      const checkedId = requireValidId(apptId, 'appointmentReference');
      const apptStatus = await this.appointmentAdapter.verifyAppointmentReference(checkedId);
      if (!apptStatus.exists) {
        throw new DueDiligenceError('APPOINTMENT_NOT_FOUND', `Referenced appointment '${checkedId}' does not exist.`, 404);
      }
      appointmentRefs.push(checkedId);
    }

    const nowIso = new Date().toISOString();
    const assessmentId = `dd_asmt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const assessment: DueDiligenceAssessment = {
      id: assessmentId,
      assessmentType,
      propertyReference: propertyRef,
      listingReference: input.listingReference ? requireValidId(input.listingReference, 'listingReference') : undefined,
      transactionReference: input.transactionReference ? requireValidId(input.transactionReference, 'transactionReference') : undefined,
      appointmentReferences: appointmentRefs,
      requestingUserUid: actorUid,
      requestingOrganizationId: input.requestingOrganizationId ? requireValidId(input.requestingOrganizationId, 'requestingOrganizationId') : undefined,
      assignedReviewers: [],
      scope: {
        includedWorkstreams: validWorkstreams,
        objectives: (input.objectives || []).map((o) => sanitizeString(o, 300)).filter(Boolean),
        limitationsAndExclusions: (input.limitationsAndExclusions || [
          'Does not constitute a legal title opinion, building permit approval, or structural safety guarantee.',
        ]).map((l) => sanitizeString(l, 400)),
        agreedAtIso: nowIso,
        version: 1,
      },
      status: 'requested',
      priority: input.priority || 'normal',
      plannedStartDateIso: input.plannedStartDateIso,
      plannedCompletionDateIso: input.plannedCompletionDateIso,
      reportingCurrency: input.reportingCurrency || 'IRT',
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
      version: 1,
    };

    const saved = await this.store.saveAssessment(assessment);

    await this.emitAndAudit(
      saved,
      actorUid,
      'due_diligence.assessment.created',
      'assessment',
      saved.id,
      { assessmentType, includedWorkstreams: validWorkstreams },
      input.idempotencyKey,
    );

    if (input.idempotencyKey) {
      await this.store.setIdempotentResult(`create_assessment:${actorUid}:${input.idempotencyKey}`, saved);
    }
    return saved;
  }

  async getAssessment(
    actorUid: string,
    assessmentId: string,
    actorOrgId?: string,
    isPlatformAdmin = false,
  ): Promise<DueDiligenceAssessment> {
    requireValidId(assessmentId, 'assessmentId');
    const assessment = await this.store.getAssessmentById(assessmentId);
    if (!assessment) throw new DueDiligenceError('NOT_FOUND', `Assessment '${assessmentId}' not found.`, 404);
    assertCanAccessAssessment(actorUid, assessment, actorOrgId, isPlatformAdmin);
    return assessment;
  }

  async updateAssessmentScope(
    actorUid: string,
    assessmentId: string,
    updates: {
      includedWorkstreams: WorkstreamType[];
      objectives: string[];
      limitationsAndExclusions?: string[];
    },
    isPlatformAdmin = false,
  ): Promise<DueDiligenceAssessment> {
    const assessment = await this.getAssessment(actorUid, assessmentId, undefined, isPlatformAdmin);
    assertCanCoordinateOrApproveReport(actorUid, assessment, isPlatformAdmin);

    if (assessment.status === 'completed' || assessment.status === 'cancelled' || assessment.status === 'archived') {
      throw new DueDiligenceError('IMMUTABLE_ASSESSMENT_STATE', `Cannot alter scope when assessment is '${assessment.status}'.`, 409);
    }

    const validWorkstreams = updates.includedWorkstreams.map((w) => validateWorkstreamType(w));
    assessment.scope = {
      includedWorkstreams: validWorkstreams,
      objectives: updates.objectives.map((o) => sanitizeString(o, 300)).filter(Boolean),
      limitationsAndExclusions: (updates.limitationsAndExclusions || assessment.scope.limitationsAndExclusions).map((l) => sanitizeString(l, 400)),
      agreedAtIso: new Date().toISOString(),
      version: assessment.scope.version + 1,
    };

    return this.store.saveAssessment(assessment, assessment.version);
  }

  async assignReviewer(
    actorUid: string,
    assessmentId: string,
    reviewerUid: string,
    role: ReviewerRole,
    serviceProviderRef?: string,
    isPlatformAdmin = false,
  ): Promise<DueDiligenceAssessment> {
    const assessment = await this.getAssessment(actorUid, assessmentId, undefined, isPlatformAdmin);
    assertCanCoordinateOrApproveReport(actorUid, assessment, isPlatformAdmin);

    const validatedRole = validateReviewerRole(role);
    const validatedReviewerUid = requireValidId(reviewerUid, 'reviewerUid');

    let qualificationVerified = false;
    if (serviceProviderRef) {
      const provCheck = await this.providerAdapter.verifyProviderQualification(serviceProviderRef, validatedReviewerUid);
      qualificationVerified = provCheck.exists && provCheck.licenseVerifiedByRegistry;
    }

    const existingIdx = assessment.assignedReviewers.findIndex(
      (r) => r.reviewerUid === validatedReviewerUid && r.role === validatedRole,
    );
    const entry = {
      reviewerUid: validatedReviewerUid,
      role: validatedRole,
      serviceProviderRef: serviceProviderRef ? sanitizeString(serviceProviderRef, 80) : undefined,
      qualificationVerifiedByRegistry: qualificationVerified,
      assignedAtIso: new Date().toISOString(),
      assignedByUid: actorUid,
    };

    if (existingIdx >= 0) {
      assessment.assignedReviewers[existingIdx] = entry;
    } else {
      assessment.assignedReviewers.push(entry);
    }

    if (assessment.status === 'requested' || assessment.status === 'awaiting_assignment') {
      assessment.status = 'assigned';
    }

    const saved = await this.store.saveAssessment(assessment, assessment.version);
    await this.emitAndAudit(saved, actorUid, 'due_diligence.assessment.assigned', 'assessment', saved.id, {
      reviewerUid: validatedReviewerUid,
      role: validatedRole,
      qualificationVerified,
    });
    return saved;
  }

  async transitionAssessmentStatus(
    actorUid: string,
    assessmentId: string,
    nextStatus: AssessmentStatus,
    isPlatformAdmin = false,
  ): Promise<DueDiligenceAssessment> {
    const assessment = await this.getAssessment(actorUid, assessmentId, undefined, isPlatformAdmin);
    assertValidAssessmentStateTransition(assessment.status, nextStatus);

    if (nextStatus === 'completed') {
      assertCanCoordinateOrApproveReport(actorUid, assessment, isPlatformAdmin);
      const workstreams = await this.store.listWorkstreamsByAssessment(assessmentId);
      const incompleteMandatory = workstreams.filter(
        (w) => w.isMandatory && w.status !== 'completed' && w.status !== 'unavailable',
      );
      if (incompleteMandatory.length > 0) {
        throw new DueDiligenceError(
          'MANDATORY_WORKSTREAMS_INCOMPLETE',
          `Cannot complete assessment while ${incompleteMandatory.length} mandatory workstream(s) remain incomplete.`,
          409,
        );
      }
      assessment.actualCompletionDateIso = new Date().toISOString();
    }

    assessment.status = nextStatus;
    const saved = await this.store.saveAssessment(assessment, assessment.version);

    if (nextStatus === 'in_progress') {
      await this.emitAndAudit(saved, actorUid, 'due_diligence.assessment.started', 'assessment', saved.id, {});
    } else if (nextStatus === 'under_review') {
      await this.emitAndAudit(saved, actorUid, 'due_diligence.assessment.review_requested', 'assessment', saved.id, {});
    } else if (nextStatus === 'completed') {
      await this.emitAndAudit(saved, actorUid, 'due_diligence.assessment.completed', 'assessment', saved.id, {});
    } else if (nextStatus === 'cancelled') {
      await this.emitAndAudit(saved, actorUid, 'due_diligence.assessment.cancelled', 'assessment', saved.id, {});
    }
    return saved;
  }

  // --- Workstreams ---
  async createWorkstream(
    actorUid: string,
    input: CreateWorkstreamInput,
    isPlatformAdmin = false,
  ): Promise<AssessmentWorkstream> {
    const assessment = await this.getAssessment(actorUid, input.assessmentId, undefined, isPlatformAdmin);
    assertCanCoordinateOrApproveReport(actorUid, assessment, isPlatformAdmin);

    const wsType = validateWorkstreamType(input.workstreamType);
    let templateVersion: number | undefined = input.checklistTemplateVersion;

    if (input.checklistTemplateId) {
      const tpl = await this.store.getChecklistTemplate(input.checklistTemplateId, input.checklistTemplateVersion);
      if (!tpl) {
        throw new DueDiligenceError('TEMPLATE_NOT_FOUND', `Checklist template '${input.checklistTemplateId}' not found.`, 404);
      }
      templateVersion = tpl.version;
    }

    const wsId = `dd_ws_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const nowIso = new Date().toISOString();

    const ws: AssessmentWorkstream = {
      id: wsId,
      assessmentId: assessment.id,
      workstreamType: wsType,
      description: requireNonEmptyText(input.description, 'description', 400),
      assignedReviewerUid: input.assignedReviewerUid ? requireValidId(input.assignedReviewerUid, 'assignedReviewerUid') : undefined,
      assignedReviewerRole: input.assignedReviewerRole ? validateReviewerRole(input.assignedReviewerRole) : undefined,
      checklistTemplateId: input.checklistTemplateId,
      checklistTemplateVersion: templateVersion,
      isMandatory: input.isMandatory ?? true,
      status: input.assignedReviewerUid ? 'assigned' : 'pending',
      findingsCount: 0,
      evidenceCompletenessState: 'partial',
      reviewOutcome: 'not_assessed',
      updatedAtIso: nowIso,
      version: 1,
    };

    return this.store.saveWorkstream(ws);
  }

  async updateWorkstreamStatus(
    actorUid: string,
    workstreamId: string,
    updates: {
      status: WorkstreamStatus;
      unavailableReason?: string;
      reviewOutcome?: AssessmentWorkstream['reviewOutcome'];
      evidenceCompletenessState?: AssessmentWorkstream['evidenceCompletenessState'];
      expectedVersion?: number;
    },
    isPlatformAdmin = false,
  ): Promise<AssessmentWorkstream> {
    const ws = await this.store.getWorkstreamById(workstreamId);
    if (!ws) throw new DueDiligenceError('NOT_FOUND', `Workstream '${workstreamId}' not found.`, 404);

    const assessment = await this.getAssessment(actorUid, ws.assessmentId, undefined, isPlatformAdmin);
    assertCanModifyWorkstream(actorUid, assessment, ws, isPlatformAdmin);

    if (updates.status === 'unavailable' && !sanitizeString(updates.unavailableReason, 300)) {
      throw new DueDiligenceError('MISSING_UNAVAILABLE_REASON', 'Reason required when marking a workstream unavailable.', 400);
    }

    if (updates.status === 'completed' && ws.checklistTemplateId && ws.checklistTemplateVersion) {
      const tpl = await this.store.getChecklistTemplate(ws.checklistTemplateId, ws.checklistTemplateVersion);
      if (tpl) {
        const responses = (await this.store.listChecklistResponsesByAssessment(ws.assessmentId)).filter(
          (r) => r.workstreamId === ws.id,
        );
        const respondedItemIds = new Set(responses.map((r) => r.itemId));
        for (const item of tpl.items) {
          if (item.required && !item.conditionalOnItemId && !respondedItemIds.has(item.itemId)) {
            throw new DueDiligenceError(
              'REQUIRED_CHECKLIST_ITEMS_MISSING',
              `Cannot mark workstream completed: required checklist item '${item.itemId}' has no recorded response.`,
              409,
            );
          }
        }
      }
    }

    const nowIso = new Date().toISOString();
    if (updates.status === 'in_progress' && !ws.startedAtIso) {
      ws.startedAtIso = nowIso;
    }
    if (updates.status === 'completed') {
      ws.completedAtIso = nowIso;
    }
    if (updates.unavailableReason) {
      ws.unavailableReason = sanitizeString(updates.unavailableReason, 300);
    }
    if (updates.reviewOutcome) {
      ws.reviewOutcome = updates.reviewOutcome;
    }
    if (updates.evidenceCompletenessState) {
      ws.evidenceCompletenessState = updates.evidenceCompletenessState;
    }
    ws.status = updates.status;

    const saved = await this.store.saveWorkstream(ws, updates.expectedVersion);
    if (saved.status === 'completed') {
      await this.emitAndAudit(assessment, actorUid, 'due_diligence.workstream.completed', 'workstream', saved.id, {
        workstreamType: saved.workstreamType,
        reviewOutcome: saved.reviewOutcome,
      });
    }
    return saved;
  }

  async listWorkstreams(actorUid: string, assessmentId: string, isPlatformAdmin = false): Promise<AssessmentWorkstream[]> {
    await this.getAssessment(actorUid, assessmentId, undefined, isPlatformAdmin);
    return this.store.listWorkstreamsByAssessment(assessmentId);
  }

  // --- Checklist Template Engine ---
  async createOrPublishChecklistTemplate(
    actorUid: string,
    input: {
      templateId?: string;
      name: string;
      assessmentCategory: AssessmentType;
      applicablePropertyTypes: string[];
      applicableBuildingCategories: string[];
      items: ChecklistItemDefinition[];
      publishImmediately?: boolean;
    },
  ): Promise<ChecklistTemplate> {
    if (!actorUid) throw new DueDiligenceError('UNAUTHENTICATED', 'Verified principal required.', 401);
    const category = validateAssessmentType(input.assessmentCategory);
    const name = requireNonEmptyText(input.name, 'name', 150);

    if (!Array.isArray(input.items) || input.items.length === 0) {
      throw new DueDiligenceError('EMPTY_TEMPLATE_ITEMS', 'Checklist template must define at least one item.', 400);
    }

    const templateId = input.templateId ? requireValidId(input.templateId, 'templateId') : `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const existingLatest = await this.store.getChecklistTemplate(templateId);
    const nextVersion = existingLatest ? existingLatest.version + 1 : 1;
    const nowIso = new Date().toISOString();

    const template: ChecklistTemplate = {
      id: templateId,
      version: nextVersion,
      name,
      assessmentCategory: category,
      applicablePropertyTypes: input.applicablePropertyTypes || ['apartment', 'villa', 'commercial'],
      applicableBuildingCategories: input.applicableBuildingCategories || ['concrete_frame', 'steel_frame'],
      items: input.items,
      activeStatus: input.publishImmediately ? 'published' : 'draft',
      publishedAtIso: input.publishImmediately ? nowIso : undefined,
      createdAtIso: nowIso,
    };

    return this.store.saveChecklistTemplate(template);
  }

  async getChecklistTemplateForWorkstream(workstream: AssessmentWorkstream): Promise<ChecklistTemplate | null> {
    if (!workstream.checklistTemplateId) return null;
    // Always retrieves the exact historical version pinned on the workstream
    return this.store.getChecklistTemplate(workstream.checklistTemplateId, workstream.checklistTemplateVersion);
  }

  // --- Checklist Responses ---
  async recordChecklistResponse(
    actorUid: string,
    input: RecordChecklistResponseInput,
    isPlatformAdmin = false,
  ): Promise<ChecklistResponseRecord> {
    const assessment = await this.getAssessment(actorUid, input.assessmentId, undefined, isPlatformAdmin);
    const ws = await this.store.getWorkstreamById(input.workstreamId);
    if (!ws || ws.assessmentId !== assessment.id) {
      throw new DueDiligenceError('NOT_FOUND', 'Target workstream not found on this assessment.', 404);
    }
    assertCanModifyWorkstream(actorUid, assessment, ws, isPlatformAdmin);

    if (!ws.checklistTemplateId || !ws.checklistTemplateVersion) {
      throw new DueDiligenceError('NO_TEMPLATE_BOUND', 'Workstream has no bound checklist template.', 400);
    }
    const tpl = await this.store.getChecklistTemplate(ws.checklistTemplateId, ws.checklistTemplateVersion);
    if (!tpl) {
      throw new DueDiligenceError('TEMPLATE_NOT_FOUND', 'Bound checklist template version not found.', 404);
    }

    const itemDef = tpl.items.find((i) => i.itemId === input.itemId);
    if (!itemDef) {
      throw new DueDiligenceError('INVALID_CHECKLIST_ITEM', `Item '${input.itemId}' does not exist in template '${tpl.id}@v${tpl.version}'.`, 400);
    }

    if (!itemDef.allowedResponseTypes.includes(input.responseType)) {
      throw new DueDiligenceError(
        'UNSUPPORTED_RESPONSE_TYPE',
        `Response type '${input.responseType}' is not allowed for item '${itemDef.itemId}'.`,
        400,
      );
    }

    // Conditional item check
    if (itemDef.conditionalOnItemId) {
      const parentResp = await this.store.findChecklistResponseByWorkstreamAndItem(ws.id, itemDef.conditionalOnItemId);
      if (!parentResp || parentResp.value !== itemDef.conditionalExpectedValue) {
        if (input.responseType !== 'not_applicable') {
          throw new DueDiligenceError(
            'CONDITIONAL_PREREQUISITE_NOT_MET',
            `Conditional item '${itemDef.itemId}' requires parent item '${itemDef.conditionalOnItemId}' to equal '${String(itemDef.conditionalExpectedValue)}'.`,
            409,
          );
        }
      }
    }

    // Require reasons for not_applicable, not_inspected, evidence_unavailable, or deficiency_noted
    if (
      (input.responseType === 'not_applicable' ||
        input.responseType === 'not_inspected' ||
        input.responseType === 'evidence_unavailable' ||
        input.classification === 'deficiency_noted') &&
      !sanitizeString(input.reasonIfIncompleteOrNegative, 400)
    ) {
      throw new DueDiligenceError(
        'REASON_REQUIRED',
        `A reason is required when recording '${input.responseType}' or '${input.classification}'.`,
        400,
        'reasonIfIncompleteOrNegative',
      );
    }

    // Validate numeric measurement unit
    if (input.responseType === 'numeric_measurement') {
      if (typeof input.value !== 'number' || !Number.isFinite(input.value)) {
        throw new DueDiligenceError('INVALID_NUMERIC_VALUE', 'Numeric measurement requires a finite number value.', 400);
      }
      if (itemDef.expectedUnit && input.unit !== itemDef.expectedUnit) {
        throw new DueDiligenceError(
          'UNIT_MISMATCH',
          `Item '${itemDef.itemId}' requires unit '${itemDef.expectedUnit}', received '${String(input.unit)}'.`,
          400,
        );
      }
    }

    const existing = await this.store.findChecklistResponseByWorkstreamAndItem(ws.id, itemDef.itemId);
    if (existing && existing.reviewStatus === 'reviewed_locked') {
      throw new DueDiligenceError('RESPONSE_LOCKED', 'Reviewed checklist responses cannot be overwritten directly; use correctChecklistResponse.', 409);
    }

    const nowIso = new Date().toISOString();
    const record: ChecklistResponseRecord = {
      id: existing?.id || `chk_resp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      assessmentId: assessment.id,
      workstreamId: ws.id,
      templateId: tpl.id,
      templateVersion: tpl.version,
      itemId: itemDef.itemId,
      responseType: input.responseType,
      value: input.value,
      unit: input.unit,
      isSubjectiveObservation: Boolean(input.isSubjectiveObservation),
      reasonIfIncompleteOrNegative: input.reasonIfIncompleteOrNegative ? sanitizeString(input.reasonIfIncompleteOrNegative, 400) : undefined,
      reviewerUid: actorUid,
      observationTimestampIso: nowIso,
      evidenceIds: input.evidenceIds || [],
      reviewerNotes: input.reviewerNotes ? sanitizeString(input.reviewerNotes, 500) : undefined,
      classification:
        itemDef.requiresEvidenceOnNegative &&
        input.classification === 'deficiency_noted' &&
        (!input.evidenceIds || input.evidenceIds.length === 0)
          ? 'evidence_missing'
          : input.classification,
      reviewStatus: 'recorded',
      history: existing?.history || [],
      version: existing?.version || 1,
    };

    const saved = await this.store.saveChecklistResponse(record, input.expectedVersion);
    await this.emitAndAudit(assessment, actorUid, 'due_diligence.checklist.response.recorded', 'checklist_response', saved.id, {
      itemId: saved.itemId,
      classification: saved.classification,
    });
    return saved;
  }

  async correctChecklistResponse(
    actorUid: string,
    responseId: string,
    updates: {
      newValue: string | number | boolean | null;
      newClassification: ChecklistResponseRecord['classification'];
      correctionReason: string;
      expectedVersion?: number;
    },
    isPlatformAdmin = false,
  ): Promise<ChecklistResponseRecord> {
    const resp = await this.store.getChecklistResponseById(responseId);
    if (!resp) throw new DueDiligenceError('NOT_FOUND', 'Checklist response not found.', 404);

    const assessment = await this.getAssessment(actorUid, resp.assessmentId, undefined, isPlatformAdmin);
    const ws = await this.store.getWorkstreamById(resp.workstreamId);
    if (!ws) throw new DueDiligenceError('NOT_FOUND', 'Workstream not found.', 404);
    assertCanModifyWorkstream(actorUid, assessment, ws, isPlatformAdmin);

    const reason = requireNonEmptyText(updates.correctionReason, 'correctionReason', 400);
    resp.history.push({
      previousValue: resp.value,
      previousClassification: resp.classification,
      correctedByUid: actorUid,
      correctionReason: reason,
      correctedAtIso: new Date().toISOString(),
    });
    resp.value = updates.newValue;
    resp.classification = updates.newClassification;
    resp.reviewStatus = 'corrected';
    resp.reviewerUid = actorUid;

    return this.store.saveChecklistResponse(resp, updates.expectedVersion);
  }
}
