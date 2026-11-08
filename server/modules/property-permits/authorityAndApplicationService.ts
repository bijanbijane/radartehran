import crypto from 'crypto';
import {
  ApplicantRelationshipType, ApplicationAdditionalInfoExchange,
  ApplicationOfficialDecisionReference, ApplicationRequirementChecklistItem,
  ApplicationSubmissionChannel, AuthorityCategory,
  AuthorityJurisdictionScope, IssuingAuthorityRecord,
  PERMIT_CATEGORY_GROUP_MAP, PermitActorContext,
  PermitApplicationRecord, PermitCategoryCode,
  PermitError, PermitEvidenceAttachmentRef,
  PermitSubjectReference, } from './types';
import {
  assertApplicantStandingForPermit, assertAuthorityEmpoweredForCategoryAndJurisdiction,
  assertCanMutateApplicationOrPermit, assertCanReadApplicationOrPermit,
  assertValidApplicationTransition, validateNonEmptyText,
} from './validationAndAuthz';
import { PropertyPermitsExternalAdapters } from './adapters';
import { PropertyPermitsStore } from './store';
export interface RegisterAuthorityReferenceInput {
  id?: string;
  name: string;
  authorityCategory: AuthorityCategory;
  jurisdictionScope: AuthorityJurisdictionScope;
  authorizedPermitCategories: PermitCategoryCode[];
  officialReferenceMetadata?: string;
  active?: boolean;
  isSyntheticTestFixture?: boolean;
}
export interface CreatePermitApplicationInput {
  id?: string;
  permitCategory: PermitCategoryCode;
  issuingAuthorityId: string;
  subjectRef: PermitSubjectReference;
  applicantPartyId?: string;
  applicantRelationship: ApplicantRelationshipType;
  representativePartyId?: string;
  requestedScopeSummary: string;
  requirementChecklist?: Omit<ApplicationRequirementChecklistItem, 'status'>[];
  supportingEvidence?: PermitEvidenceAttachmentRef[];
  notes?: string;
  isSyntheticTestFixture?: boolean;
}
export interface UpdateDraftApplicationInput {
  applicationId: string;
  requestedScopeSummary?: string;
  markReadyForSubmission?: boolean;
  submittedChecklistRequirementIds?: { requirementId: string; submittedEvidenceIds: string[] }[];
  additionalEvidence?: PermitEvidenceAttachmentRef[];
  notes?: string;
}
export interface RecordApplicationSubmissionInput {
  applicationId: string;
  submissionChannel: Exclude<ApplicationSubmissionChannel, 'NOT_SUBMITTED'>;
  externalApplicationReferenceNumber?: string;
  submittedAtIso?: string;
  idempotencyKey?: string;
}
export interface RecordAuthorityAcknowledgmentInput {
  applicationId: string;
  externalApplicationReferenceNumber: string;
  acknowledgedAtIso?: string;
  moveToUnderReview?: boolean;
}
export interface RecordAdditionalInfoRequestInput {
  applicationId: string;
  authorityReferenceNumber?: string;
  requestSummary: string;
  requestedAtIso?: string;
}
export interface RecordApplicantResponseInput {
  applicationId: string;
  exchangeId: string;
  applicantResponseSummary: string;
  responseEvidenceIds?: string[];
  respondedAtIso?: string;
}
export interface RecordOfficialDecisionInput {
  applicationId: string;
  decisionOutcome: 'APPROVED' | 'REJECTED';
  officialDecisionReferenceNumber: string;
  decisionDateIso: string;
  decisionSummary: string;
  supportingEvidenceIds: string[];
  additionalEvidence?: PermitEvidenceAttachmentRef[];
}
export class AuthorityAndApplicationService {
  constructor(
    private readonly store: PropertyPermitsStore, private readonly adapters: PropertyPermitsExternalAdapters
  ) {}
  async registerAuthorityReference(
    actor: PermitActorContext, input: RegisterAuthorityReferenceInput
  ): Promise<IssuingAuthorityRecord> {
    if (
      actor.role !== 'REGULATORY_COMPLIANCE_ADMIN' &&
      actor.role !== 'SYSTEM_AUTOMATION' &&
      actor.role !== 'PERMIT_CASE_OFFICER'
    ) {
      throw new PermitError(
        'INSUFFICIENT_ROLE_PRIVILEGE',
        'Only regulatory compliance admins or permit case officers may register issuing authorities.', 403
      );
    }
    const name = validateNonEmptyText(input.name, 'name', 300);
    if (!input.authorizedPermitCategories || input.authorizedPermitCategories.length === 0) {
      throw new PermitError(
        'AUTHORITY_NOT_EMPOWERED_FOR_CATEGORY',
        'An issuing authority must specify at least one authorizedPermitCategory.', 400
      );
    }
    const geoCheck = await this.adapters.geography.validateJurisdiction({
      citySlug: input.jurisdictionScope.citySlug,
      neighborhoodIdOrSlug: input.jurisdictionScope.neighborhoodIdsOrSlugs?.[0], });
    if (!geoCheck.valid) {
      throw new PermitError('JURISDICTION_MISMATCH', geoCheck.reason || 'Invalid jurisdiction.', 400);
    }
    const now = new Date().toISOString();
    const record: IssuingAuthorityRecord = {
      id: input.id || `auth_${crypto.randomBytes(6).toString('hex')}`, name,
      authorityCategory: input.authorityCategory, jurisdictionScope: {
        ...input.jurisdictionScope, citySlug: input.jurisdictionScope.citySlug.trim().toLowerCase(),
      }, authorizedPermitCategories: Array.from(new Set(input.authorizedPermitCategories)),
      officialReferenceMetadata: input.officialReferenceMetadata, active: input.active ?? true,
      isSyntheticTestFixture: input.isSyntheticTestFixture ?? false, createdAt: now,
      updatedAt: now, };
    await this.store.saveAuthority(record);
    await this.store.appendAuditEvent({
      id: `aud_${crypto.randomBytes(6).toString('hex')}`, targetType: 'AUTHORITY',
      targetId: record.id, action: 'AUTHORITY_REGISTERED',
      actorId: actor.actorId, actorRole: actor.role,
      occurredAt: now, summary: `Registered authority '${record.name}' (${record.authorityCategory}).`,
    });
    return record;
  }
  async createPermitApplication(
    actor: PermitActorContext, input: CreatePermitApplicationInput
  ): Promise<PermitApplicationRecord> {
    const applicantPartyId = input.applicantPartyId || actor.actorId;
    const requestedScopeSummary = validateNonEmptyText(input.requestedScopeSummary, 'requestedScopeSummary', 2000);
    const authority = await this.store.getAuthorityById(input.issuingAuthorityId);
    if (!authority) {
      throw new PermitError('RESOURCE_NOT_FOUND', `Authority '${input.issuingAuthorityId}' not found.`, 404);
    }
    const geoCheck = await this.adapters.geography.validateJurisdiction({
      citySlug: input.subjectRef.citySlug, districtCode: input.subjectRef.districtCode,
      neighborhoodIdOrSlug: input.subjectRef.neighborhoodIdOrSlug, });
    if (!geoCheck.valid) {
      throw new PermitError('JURISDICTION_MISMATCH', geoCheck.reason || 'Invalid subject geography.', 400);
    }
    assertAuthorityEmpoweredForCategoryAndJurisdiction(authority, input.permitCategory, input.subjectRef);
    const standing = await this.adapters.propertyAndOwnership.verifyApplicantStanding({
      propertyId: input.subjectRef.propertyId, applicantPartyId,
      applicantRelationship: input.applicantRelationship, representativePartyId: input.representativePartyId,
    });
    assertApplicantStandingForPermit(standing, input.applicantRelationship);
    const now = new Date().toISOString();
    const checklist: ApplicationRequirementChecklistItem[] = (input.requirementChecklist ?? []).map((item) => ({
      ...item, status: item.submittedEvidenceIds.length > 0 ? 'SUBMITTED_UNREVIEWED' : 'REQUIRED_MISSING',
    }));
    const application: PermitApplicationRecord = {
      id: input.id || `papp_${crypto.randomBytes(6).toString('hex')}`, isIssuedPermitRecord: false,
      permitCategory: input.permitCategory,
      permitCategoryGroup: PERMIT_CATEGORY_GROUP_MAP[input.permitCategory], issuingAuthorityId: authority.id,
      subjectRef: { ...input.subjectRef, citySlug: input.subjectRef.citySlug.trim().toLowerCase() },
      applicantPartyId, applicantRelationship: input.applicantRelationship,
      representativePartyId: input.representativePartyId, requestedScopeSummary,
      workflowStatus: 'DRAFT', submissionChannel: 'NOT_SUBMITTED',
      requirementChecklist: checklist, additionalInfoExchanges: [],
      supportingEvidence: input.supportingEvidence ?? [], notes: input.notes,
      isSyntheticTestFixture: input.isSyntheticTestFixture ?? false, createdAt: now,
      updatedAt: now, };
    assertCanMutateApplicationOrPermit(actor, application);
    await this.store.saveApplication(application);
    await this.store.appendAuditEvent({
      id: `aud_${crypto.randomBytes(6).toString('hex')}`, targetType: 'APPLICATION',
      targetId: application.id, action: 'APPLICATION_CREATED_DRAFT',
      actorId: actor.actorId, actorRole: actor.role,
      occurredAt: now, summary: `Created DRAFT application for ${application.permitCategory}.`,
    });
    return application;
  }
  async retrievePermitApplication(actor: PermitActorContext, applicationId: string): Promise<PermitApplicationRecord> {
    const app = await this.store.getApplicationById(applicationId);
    if (!app) {
      throw new PermitError('RESOURCE_NOT_FOUND', `Permit application '${applicationId}' not found.`, 404);
    }
    assertCanReadApplicationOrPermit(actor, app);
    return app;
  }
  async updateDraftApplication(
    actor: PermitActorContext, input: UpdateDraftApplicationInput
  ): Promise<PermitApplicationRecord> {
    const app = await this.store.getApplicationById(input.applicationId);
    if (!app) {
      throw new PermitError('RESOURCE_NOT_FOUND', `Permit application '${input.applicationId}' not found.`, 404);
    }
    assertCanMutateApplicationOrPermit(actor, app);
    if (app.workflowStatus !== 'DRAFT' && app.workflowStatus !== 'READY_FOR_SUBMISSION') {
      throw new PermitError('INVALID_WORKFLOW_TRANSITION', `Cannot edit draft in state '${app.workflowStatus}'.`, 409);
    }
    const updatedChecklist = app.requirementChecklist.map((item) => {
      const sub = input.submittedChecklistRequirementIds?.find((s) => s.requirementId === item.requirementId);
      if (!sub) return item;
      const mergedIds = Array.from(new Set([...item.submittedEvidenceIds, ...sub.submittedEvidenceIds]));
      return {
        ...item, submittedEvidenceIds: mergedIds,
        status: (mergedIds.length > 0 ? 'SUBMITTED_UNREVIEWED' : 'REQUIRED_MISSING') as ApplicationRequirementChecklistItem['status'],
      };
    });
    let nextState = app.workflowStatus;
    if (input.markReadyForSubmission && app.workflowStatus === 'DRAFT') {
      if (updatedChecklist.some((c) => c.mandatory && c.submittedEvidenceIds.length === 0)) {
        throw new PermitError('VALIDATION_FAILED', 'Mandatory checklist items are missing.', 400);
      }
      assertValidApplicationTransition(actor, app.workflowStatus, 'READY_FOR_SUBMISSION');
      nextState = 'READY_FOR_SUBMISSION';
    }
    const updated: PermitApplicationRecord = {
      ...app, requestedScopeSummary: input.requestedScopeSummary
        ? validateNonEmptyText(input.requestedScopeSummary, 'requestedScopeSummary', 2000)
        : app.requestedScopeSummary, requirementChecklist: updatedChecklist,
      supportingEvidence: input.additionalEvidence
        ? [...app.supportingEvidence, ...input.additionalEvidence]
        : app.supportingEvidence, workflowStatus: nextState,
      notes: input.notes ?? app.notes, updatedAt: new Date().toISOString(),
    };
    await this.store.saveApplication(updated);
    return updated;
  }
  async recordApplicationSubmission(
    actor: PermitActorContext, input: RecordApplicationSubmissionInput
  ): Promise<PermitApplicationRecord> {
    if (input.idempotencyKey) {
      const idem = await this.store.getIdempotencyRecord(input.idempotencyKey);
      if (idem && idem.operation === 'SUBMIT_APPLICATION') {
        const existing = await this.store.getApplicationById(idem.targetId);
        if (existing) return existing;
      }
    }
    const app = await this.store.getApplicationById(input.applicationId);
    if (!app) {
      throw new PermitError('RESOURCE_NOT_FOUND', `Permit application '${input.applicationId}' not found.`, 404);
    }
    assertCanMutateApplicationOrPermit(actor, app);
    assertValidApplicationTransition(actor, app.workflowStatus, 'SUBMITTED');
    const activeDuplicates = await this.store.findActiveSubmittedApplications(
      app.subjectRef.propertyId, app.permitCategory,
      app.issuingAuthorityId
    );
    if (activeDuplicates.some((other) => other.id !== app.id)) {
      throw new PermitError(
        'DUPLICATE_ACTIVE_APPLICATION',
        `Active application already exists for property '${app.subjectRef.propertyId}' and category '${app.permitCategory}'.`,
        409
      );
    }
    if (
      input.submissionChannel === 'CONFIRMED_EXTERNAL_AUTHORITY_INTEGRATION' &&
      !input.externalApplicationReferenceNumber
    ) {
      throw new PermitError('MISSING_OFFICIAL_DECISION_REFERENCE', 'External reference required.', 400);
    }
    const now = new Date().toISOString();
    const updated: PermitApplicationRecord = {
      ...app, workflowStatus: 'SUBMITTED',
      submissionChannel: input.submissionChannel,
      externalApplicationReferenceNumber: input.externalApplicationReferenceNumber,
      submittedAtIso: input.submittedAtIso || now, updatedAt: now,
    };
    await this.store.saveApplication(updated);
    if (input.idempotencyKey) {
      await this.store.saveIdempotencyRecord({
        key: input.idempotencyKey, operation: 'SUBMIT_APPLICATION',
        targetId: updated.id, createdAt: now,
      });
    }
    await this.store.appendAuditEvent({
      id: `aud_${crypto.randomBytes(6).toString('hex')}`, targetType: 'APPLICATION',
      targetId: updated.id, action: 'APPLICATION_SUBMITTED',
      actorId: actor.actorId, actorRole: actor.role,
      occurredAt: now, summary: `Application submitted via ${updated.submissionChannel}.`,
    });
    return updated;
  }
  async recordAuthorityAcknowledgment(
    actor: PermitActorContext, input: RecordAuthorityAcknowledgmentInput
  ): Promise<PermitApplicationRecord> {
    const app = await this.store.getApplicationById(input.applicationId);
    if (!app) {
      throw new PermitError('RESOURCE_NOT_FOUND', `Permit application '${input.applicationId}' not found.`, 404);
    }
    const targetState = input.moveToUnderReview ? 'UNDER_REVIEW' : 'ACKNOWLEDGED';
    if (app.workflowStatus === 'SUBMITTED' && targetState === 'UNDER_REVIEW') {
      assertValidApplicationTransition(actor, 'SUBMITTED', 'ACKNOWLEDGED');
      assertValidApplicationTransition(actor, 'ACKNOWLEDGED', 'UNDER_REVIEW');
    } else {
      assertValidApplicationTransition(actor, app.workflowStatus, targetState);
    }
    const extRef = validateNonEmptyText(input.externalApplicationReferenceNumber, 'externalApplicationReferenceNumber', 150);
    const now = new Date().toISOString();
    const updated: PermitApplicationRecord = {
      ...app, workflowStatus: targetState,
      externalApplicationReferenceNumber: extRef,
      acknowledgedAtIso: input.acknowledgedAtIso || app.acknowledgedAtIso || now, updatedAt: now,
    };
    await this.store.saveApplication(updated);
    await this.store.appendAuditEvent({
      id: `aud_${crypto.randomBytes(6).toString('hex')}`, targetType: 'APPLICATION',
      targetId: updated.id, action: `APPLICATION_${targetState}`,
      actorId: actor.actorId, actorRole: actor.role,
      occurredAt: now, summary: `Authority acknowledged application (ref: ${extRef}).`,
    });
    return updated;
  }
  async recordAdditionalInformationRequest(
    actor: PermitActorContext, input: RecordAdditionalInfoRequestInput
  ): Promise<PermitApplicationRecord> {
    const app = await this.store.getApplicationById(input.applicationId);
    if (!app) {
      throw new PermitError('RESOURCE_NOT_FOUND', `Permit application '${input.applicationId}' not found.`, 404);
    }
    assertValidApplicationTransition(actor, app.workflowStatus, 'ADDITIONAL_INFORMATION_REQUIRED');
    const now = new Date().toISOString();
    const exchange: ApplicationAdditionalInfoExchange = {
      id: `info_${crypto.randomBytes(6).toString('hex')}`, requestedAtIso: input.requestedAtIso || now,
      authorityReferenceNumber: input.authorityReferenceNumber,
      requestSummary: validateNonEmptyText(input.requestSummary, 'requestSummary', 1000),
      status: 'OPEN_PENDING_APPLICANT', };
    const updated: PermitApplicationRecord = {
      ...app, workflowStatus: 'ADDITIONAL_INFORMATION_REQUIRED',
      additionalInfoExchanges: [...app.additionalInfoExchanges, exchange], updatedAt: now,
    };
    await this.store.saveApplication(updated);
    return updated;
  }
  async recordApplicantResponse(
    actor: PermitActorContext, input: RecordApplicantResponseInput
  ): Promise<PermitApplicationRecord> {
    const app = await this.store.getApplicationById(input.applicationId);
    if (!app) {
      throw new PermitError('RESOURCE_NOT_FOUND', `Permit application '${input.applicationId}' not found.`, 404);
    }
    assertCanMutateApplicationOrPermit(actor, app);
    assertValidApplicationTransition(actor, app.workflowStatus, 'RESUBMITTED');
    const now = new Date().toISOString();
    const updatedExchanges = app.additionalInfoExchanges.map((ex) =>
      ex.id === input.exchangeId
        ? {
            ...ex, respondedAtIso: input.respondedAtIso || now,
            applicantResponseSummary: validateNonEmptyText(input.applicantResponseSummary, 'applicantResponseSummary', 1000),
            responseEvidenceIds: input.responseEvidenceIds ?? [], status: 'RESPONDED_BY_APPLICANT' as const,
          }
        : ex
    );
    const updated: PermitApplicationRecord = {
      ...app, workflowStatus: 'RESUBMITTED',
      additionalInfoExchanges: updatedExchanges, updatedAt: now,
    };
    await this.store.saveApplication(updated);
    return updated;
  }
  async recordOfficialDecision(
    actor: PermitActorContext, input: RecordOfficialDecisionInput
  ): Promise<PermitApplicationRecord> {
    const app = await this.store.getApplicationById(input.applicationId);
    if (!app) {
      throw new PermitError('RESOURCE_NOT_FOUND', `Permit application '${input.applicationId}' not found.`, 404);
    }
    const decisionRef: ApplicationOfficialDecisionReference = {
      officialDecisionReferenceNumber: validateNonEmptyText(
        input.officialDecisionReferenceNumber, 'officialDecisionReferenceNumber',
        150
      ), decisionDateIso: input.decisionDateIso,
      decisionOutcome: input.decisionOutcome,
      decisionSummary: validateNonEmptyText(input.decisionSummary, 'decisionSummary', 1000),
      supportingEvidenceIds: input.supportingEvidenceIds ?? [], recordedByActorId: actor.actorId,
      recordedAtIso: new Date().toISOString(), };
    assertValidApplicationTransition(actor, app.workflowStatus, input.decisionOutcome, decisionRef);
    const now = new Date().toISOString();
    const updated: PermitApplicationRecord = {
      ...app, workflowStatus: input.decisionOutcome,
      officialDecisionReference: decisionRef, supportingEvidence: input.additionalEvidence
        ? [...app.supportingEvidence, ...input.additionalEvidence]
        : app.supportingEvidence, updatedAt: now,
    };
    await this.store.saveApplication(updated);
    await this.store.appendAuditEvent({
      id: `aud_${crypto.randomBytes(6).toString('hex')}`, targetType: 'APPLICATION',
      targetId: updated.id, action: `APPLICATION_DECISION_${input.decisionOutcome}`,
      actorId: actor.actorId, actorRole: actor.role,
      occurredAt: now, summary: `Recorded official decision ${input.decisionOutcome}.`,
    });
    return updated;
  }
  async withdrawApplication(
    actor: PermitActorContext, applicationId: string,
    reason: string
  ): Promise<PermitApplicationRecord> {
    const app = await this.store.getApplicationById(applicationId);
    if (!app) {
      throw new PermitError('RESOURCE_NOT_FOUND', `Permit application '${applicationId}' not found.`, 404);
    }
    assertCanMutateApplicationOrPermit(actor, app);
    assertValidApplicationTransition(actor, app.workflowStatus, 'WITHDRAWN');
    const updated: PermitApplicationRecord = {
      ...app, workflowStatus: 'WITHDRAWN',
      notes: `${app.notes ? app.notes + ' | ' : ''}Withdrawn: ${validateNonEmptyText(reason, 'reason', 500)}`,
      updatedAt: new Date().toISOString(), };
    await this.store.saveApplication(updated);
    return updated;
  }
}
