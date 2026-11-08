import crypto from 'crypto';
import {
  ConditionFulfillmentStatus, ConditionTimingCategory,
  OfficialDecisionStatus, PERMIT_CATEGORY_GROUP_MAP,
  PermitActorContext, PermitAmendmentOrRenewalRecord,
  PermitCategoryCode, PermitConditionRecord,
  PermitError, PermitEvidenceAttachmentRef,
  PermitMultiDimensionalStatus, PermitRecord,
  PermitStatusHistoryEntry, PermitSubjectReference,
  PermitValidityStatus, SourceVerificationStatus,
} from './types';
import {
  assertAuthorityEmpoweredForCategoryAndJurisdiction, assertCanMutateApplicationOrPermit,
  assertCanReadApplicationOrPermit, assertOfficerOrComplianceAdmin,
  evaluatePermitMultiDimensionalStatus, validateNonEmptyText,
} from './validationAndAuthz';
import { PropertyPermitsStore } from './store';
export interface RegisterIssuedPermitInput {
  id?: string;
  officialPermitNumber: string;
  permitCategory: PermitCategoryCode;
  issuingAuthorityId: string;
  originatingApplicationId?: string;
  subjectRef: PermitSubjectReference;
  holderPartyIds: string[];
  approvedScopeSummary: string;
  issueDateIso: string;
  effectiveStartDateIso: string;
  expirationDateIso?: string;
  officialDecisionStatus: OfficialDecisionStatus;
  sourceVerificationStatus: SourceVerificationStatus;
  evidenceCompleteness?: 'COMPLETE' | 'PARTIAL' | 'MISSING' | 'UNVERIFIED';
  supportingEvidence: PermitEvidenceAttachmentRef[];
  idempotencyKey?: string;
  isSyntheticTestFixture?: boolean;
}
export interface RegisterPermitConditionInput {
  id?: string;
  permitId: string;
  conditionCode: string;
  description: string;
  timingCategory: ConditionTimingCategory;
  responsiblePartyId: string;
  dueDateIso?: string;
  fulfillmentStatus: Extract<
    ConditionFulfillmentStatus, 'STATED_IN_OFFICIAL_DECISION_PENDING' | 'INTERNALLY_SUMMARIZED_PENDING'
  >;
  blocksCompletionOrOccupancy?: boolean;
  isSyntheticTestFixture?: boolean;
}
export interface RecordConditionFulfillmentInput {
  conditionId: string;
  fulfillmentStatus: Extract<
    ConditionFulfillmentStatus, | 'REPORTED_FULFILLED_BY_HOLDER'
    | 'FULFILLMENT_INDEPENDENTLY_VERIFIED'
    | 'OVERDUE_OR_NON_COMPLIANT'
    | 'WAIVED_BY_AUTHORITY'
  >;
  supportingEvidenceIds?: string[];
  verificationNotes?: string;
}
export interface SubmitAmendmentOrRenewalRequestInput {
  id?: string;
  targetPermitId: string;
  requestType: 'AMENDMENT' | 'EXTENSION' | 'RENEWAL';
  requestedByPartyId?: string;
  requestedChangesSummary: string;
  requestedNewExpirationDateIso?: string;
  requestedNewScopeSummary?: string;
  supportingEvidenceIds?: string[];
}
export interface RecordAmendmentOrRenewalDecisionInput {
  requestId: string;
  decisionOutcome: 'APPROVED_BY_AUTHORITY' | 'REJECTED_BY_AUTHORITY';
  authorityDecisionReference: string;
  decidedAtIso?: string;
  replacementPermitId?: string;
  supportingEvidenceIds: string[];
}
export interface RecordSuspensionOrRevocationInput {
  permitId: string;
  actionType: 'SUSPENDED' | 'REVOKED';
  authorityDecisionReference: string;
  reasonSummary: string;
  supportingEvidenceIds: string[];
  effectiveAtIso?: string;
}
export class PermitAndAmendmentService {
  constructor(private readonly store: PropertyPermitsStore) {}
  async registerIssuedPermit(
    actor: PermitActorContext, input: RegisterIssuedPermitInput
  ): Promise<PermitRecord> {
    if (input.idempotencyKey) {
      const idem = await this.store.getIdempotencyRecord(input.idempotencyKey);
      if (idem && idem.operation === 'REGISTER_PERMIT') {
        const existing = await this.store.getPermitById(idem.targetId);
        if (existing) return existing;
      }
    }
    const authority = await this.store.getAuthorityById(input.issuingAuthorityId);
    if (!authority) {
      throw new PermitError('RESOURCE_NOT_FOUND', `Authority '${input.issuingAuthorityId}' not found.`, 404);
    }
    assertAuthorityEmpoweredForCategoryAndJurisdiction(authority, input.permitCategory, input.subjectRef);
    if (
      input.sourceVerificationStatus === 'INDEPENDENTLY_VERIFIED_OFFICIAL_SOURCE' &&
      actor.role !== 'PERMIT_CASE_OFFICER' &&
      actor.role !== 'REGULATORY_COMPLIANCE_ADMIN' &&
      actor.role !== 'SYSTEM_AUTOMATION'
    ) {
      throw new PermitError(
        'APPLICANT_CANNOT_SELF_APPROVE',
        'Applicants cannot self-verify a permit as INDEPENDENTLY_VERIFIED_OFFICIAL_SOURCE.', 403
      );
    }
    const now = new Date().toISOString();
    const initialMultiStatus = evaluatePermitMultiDimensionalStatus({
      permit: {
        officialDecisionStatus: input.officialDecisionStatus,
        sourceVerificationStatus: input.sourceVerificationStatus,
        effectiveStartDateIso: input.effectiveStartDateIso, expirationDateIso: input.expirationDateIso,
        supportingEvidence: input.supportingEvidence, },
      conditions: [], asOfDateIso: now,
    });
    const permitId = input.id || `prm_${crypto.randomBytes(6).toString('hex')}`;
    const initialHistory: PermitStatusHistoryEntry = {
      id: `phist_${crypto.randomBytes(6).toString('hex')}`, changedAtIso: now,
      changedByActorId: actor.actorId, changedByRole: actor.role,
      previousValidityStatus: 'UNKNOWN', newValidityStatus: initialMultiStatus.permitValidityStatus,
      reasonSummary: `Permit registered (verification=${input.sourceVerificationStatus}).`,
      officialReferenceNumber: input.officialPermitNumber, };
    const permit: PermitRecord = {
      id: permitId, isIssuedPermitRecord: true,
      officialPermitNumber: validateNonEmptyText(input.officialPermitNumber, 'officialPermitNumber', 150),
      permitCategory: input.permitCategory,
      permitCategoryGroup: PERMIT_CATEGORY_GROUP_MAP[input.permitCategory], issuingAuthorityId: authority.id,
      originatingApplicationId: input.originatingApplicationId,
      subjectRef: { ...input.subjectRef, citySlug: input.subjectRef.citySlug.trim().toLowerCase() },
      holderPartyIds: input.holderPartyIds.length > 0 ? input.holderPartyIds : [actor.actorId],
      approvedScopeSummary: validateNonEmptyText(input.approvedScopeSummary, 'approvedScopeSummary', 2000),
      issueDateIso: input.issueDateIso, effectiveStartDateIso: input.effectiveStartDateIso,
      expirationDateIso: input.expirationDateIso, officialDecisionStatus: input.officialDecisionStatus,
      sourceVerificationStatus: input.sourceVerificationStatus, multiDimensionalStatus: initialMultiStatus,
      conditionIds: [], supportingEvidence: input.supportingEvidence,
      statusHistory: [initialHistory], version: 1,
      isSyntheticTestFixture: input.isSyntheticTestFixture ?? false, createdAt: now,
      updatedAt: now, };
    await this.store.savePermit(permit);
    if (input.idempotencyKey) {
      await this.store.saveIdempotencyRecord({
        key: input.idempotencyKey, operation: 'REGISTER_PERMIT',
        targetId: permit.id, createdAt: now,
      });
    }
    if (input.originatingApplicationId) {
      const app = await this.store.getApplicationById(input.originatingApplicationId);
      if (app) {
        await this.store.saveApplication({ ...app, resultingPermitId: permit.id, updatedAt: now });
      }
    }
    await this.store.appendAuditEvent({
      id: `aud_${crypto.randomBytes(6).toString('hex')}`, targetType: 'PERMIT',
      targetId: permit.id, action: 'PERMIT_REGISTERED',
      actorId: actor.actorId, actorRole: actor.role,
      occurredAt: now, summary: `Registered permit '${permit.officialPermitNumber}'.`,
    });
    return permit;
  }
  async retrievePermitRecord(
    actor: PermitActorContext, permitId: string,
    asOfDateIso?: string
  ): Promise<PermitRecord> {
    const permit = await this.store.getPermitById(permitId);
    if (!permit) {
      throw new PermitError('RESOURCE_NOT_FOUND', `Permit '${permitId}' not found.`, 404);
    }
    assertCanReadApplicationOrPermit(actor, permit);
    const conditions = await this.store.listConditionsByPermit(permit.id);
    const multiDimensionalStatus = evaluatePermitMultiDimensionalStatus({
      permit, conditions,
      asOfDateIso, });
    return { ...permit, multiDimensionalStatus };
  }
  async evaluatePermitValidity(
    actor: PermitActorContext, permitId: string,
    asOfDateIso: string
  ): Promise<{
    permitId: string;
    asOfDateIso: string;
    multiDimensionalStatus: PermitMultiDimensionalStatus;
    isEstablishableAsOfficialValidPermit: boolean;
  }> {
    const permit = await this.retrievePermitRecord(actor, permitId, asOfDateIso);
    return {
      permitId: permit.id, asOfDateIso,
      multiDimensionalStatus: permit.multiDimensionalStatus, isEstablishableAsOfficialValidPermit:
        permit.multiDimensionalStatus.permitValidityStatus === 'VALID_VERIFIED_ACTIVE', };
  }
  async registerPermitCondition(
    actor: PermitActorContext, input: RegisterPermitConditionInput
  ): Promise<PermitConditionRecord> {
    const permit = await this.store.getPermitById(input.permitId);
    if (!permit) {
      throw new PermitError('RESOURCE_NOT_FOUND', `Permit '${input.permitId}' not found.`, 404);
    }
    assertCanMutateApplicationOrPermit(actor, permit);
    if (input.fulfillmentStatus === 'STATED_IN_OFFICIAL_DECISION_PENDING') {
      assertOfficerOrComplianceAdmin(actor, 'registering an official decision condition');
    }
    const now = new Date().toISOString();
    const condition: PermitConditionRecord = {
      id: input.id || `pcond_${crypto.randomBytes(6).toString('hex')}`, permitId: permit.id,
      conditionCode: validateNonEmptyText(input.conditionCode, 'conditionCode', 100),
      description: validateNonEmptyText(input.description, 'description', 1000),
      timingCategory: input.timingCategory, responsiblePartyId: input.responsiblePartyId,
      dueDateIso: input.dueDateIso, fulfillmentStatus: input.fulfillmentStatus,
      blocksCompletionOrOccupancy:
        input.blocksCompletionOrOccupancy ??
        (input.timingCategory === 'PRE_COMPLETION' || input.timingCategory === 'PRE_OCCUPANCY'),
      supportingEvidenceIds: [], isSyntheticTestFixture: input.isSyntheticTestFixture ?? false,
      createdAt: now, updatedAt: now,
    };
    await this.store.saveCondition(condition);
    const allConditions = await this.store.listConditionsByPermit(permit.id);
    const multiDimensionalStatus = evaluatePermitMultiDimensionalStatus({
      permit, conditions: allConditions,
      asOfDateIso: now, });
    await this.store.savePermit({
      ...permit, conditionIds: Array.from(new Set([...permit.conditionIds, condition.id])),
      multiDimensionalStatus, updatedAt: now,
    });
    return condition;
  }
  async recordConditionFulfillment(
    actor: PermitActorContext, input: RecordConditionFulfillmentInput
  ): Promise<PermitConditionRecord> {
    const condition = await this.store.getConditionById(input.conditionId);
    if (!condition) {
      throw new PermitError('RESOURCE_NOT_FOUND', `Permit condition '${input.conditionId}' not found.`, 404);
    }
    const permit = await this.store.getPermitById(condition.permitId);
    if (!permit) {
      throw new PermitError('RESOURCE_NOT_FOUND', `Permit '${condition.permitId}' not found.`, 404);
    }
    assertCanMutateApplicationOrPermit(actor, permit);
    if (
      input.fulfillmentStatus === 'FULFILLMENT_INDEPENDENTLY_VERIFIED' ||
      input.fulfillmentStatus === 'WAIVED_BY_AUTHORITY'
    ) {
      assertOfficerOrComplianceAdmin(actor, `setting condition status to ${input.fulfillmentStatus}`);
    }
    const now = new Date().toISOString();
    const updatedCondition: PermitConditionRecord = {
      ...condition, fulfillmentStatus: input.fulfillmentStatus,
      supportingEvidenceIds: input.supportingEvidenceIds
        ? Array.from(new Set([...condition.supportingEvidenceIds, ...input.supportingEvidenceIds]))
        : condition.supportingEvidenceIds, verifiedByActorId:
        input.fulfillmentStatus === 'FULFILLMENT_INDEPENDENTLY_VERIFIED' ? actor.actorId : condition.verifiedByActorId,
      verifiedAtIso:
        input.fulfillmentStatus === 'FULFILLMENT_INDEPENDENTLY_VERIFIED' ? now : condition.verifiedAtIso,
      verificationNotes: input.verificationNotes ?? condition.verificationNotes, updatedAt: now,
    };
    await this.store.saveCondition(updatedCondition);
    const allConditions = await this.store.listConditionsByPermit(permit.id);
    const multiDimensionalStatus = evaluatePermitMultiDimensionalStatus({
      permit, conditions: allConditions,
      asOfDateIso: now, });
    await this.store.savePermit({ ...permit, multiDimensionalStatus, updatedAt: now });
    return updatedCondition;
  }
  async submitAmendmentOrRenewalRequest(
    actor: PermitActorContext, input: SubmitAmendmentOrRenewalRequestInput
  ): Promise<PermitAmendmentOrRenewalRecord> {
    const permit = await this.store.getPermitById(input.targetPermitId);
    if (!permit) {
      throw new PermitError('RESOURCE_NOT_FOUND', `Permit '${input.targetPermitId}' not found.`, 404);
    }
    assertCanMutateApplicationOrPermit(actor, permit);
    const now = new Date().toISOString();
    const record: PermitAmendmentOrRenewalRecord = {
      id: input.id || `pamend_${crypto.randomBytes(6).toString('hex')}`, targetPermitId: permit.id,
      requestType: input.requestType, requestedByPartyId: input.requestedByPartyId || actor.actorId,
      requestedChangesSummary: validateNonEmptyText(input.requestedChangesSummary, 'requestedChangesSummary', 1000),
      requestedNewExpirationDateIso: input.requestedNewExpirationDateIso,
      requestedNewScopeSummary: input.requestedNewScopeSummary, requestStatus: 'REQUESTED_PENDING_AUTHORITY',
      supportingEvidenceIds: input.supportingEvidenceIds ?? [], requestedAtIso: now,
    };
    await this.store.saveAmendmentOrRenewal(record);
    await this.store.appendAuditEvent({
      id: `aud_${crypto.randomBytes(6).toString('hex')}`, targetType: 'AMENDMENT_OR_RENEWAL',
      targetId: record.id, action: `${input.requestType}_REQUEST_SUBMITTED`,
      actorId: actor.actorId, actorRole: actor.role,
      occurredAt: now, summary: `Submitted ${input.requestType} request for permit ${permit.id}.`,
    });
    return record;
  }
  async recordAmendmentOrRenewalDecision(
    actor: PermitActorContext, input: RecordAmendmentOrRenewalDecisionInput
  ): Promise<{ amendmentRecord: PermitAmendmentOrRenewalRecord; updatedPermit: PermitRecord }> {
    assertOfficerOrComplianceAdmin(actor, 'recording an official amendment/renewal decision');
    const reqRecord = await this.store.getAmendmentOrRenewalById(input.requestId);
    if (!reqRecord) {
      throw new PermitError('RESOURCE_NOT_FOUND', `Amendment/renewal request '${input.requestId}' not found.`, 404);
    }
    const permit = await this.store.getPermitById(reqRecord.targetPermitId);
    if (!permit) {
      throw new PermitError('RESOURCE_NOT_FOUND', `Permit '${reqRecord.targetPermitId}' not found.`, 404);
    }
    const authRef = validateNonEmptyText(input.authorityDecisionReference, 'authorityDecisionReference', 150);
    if (!input.supportingEvidenceIds || input.supportingEvidenceIds.length === 0) {
      throw new PermitError('MISSING_OFFICIAL_DECISION_REFERENCE', 'supportingEvidenceIds required.', 400);
    }
    const now = input.decidedAtIso || new Date().toISOString();
    const updatedAmendment: PermitAmendmentOrRenewalRecord = {
      ...reqRecord, requestStatus: input.decisionOutcome,
      authorityDecisionReference: authRef,
      supportingEvidenceIds: Array.from(new Set([...reqRecord.supportingEvidenceIds, ...input.supportingEvidenceIds])),
      replacementPermitId: input.replacementPermitId, decidedAtIso: now,
    };
    await this.store.saveAmendmentOrRenewal(updatedAmendment);
    let updatedPermit = permit;
    if (input.decisionOutcome === 'APPROVED_BY_AUTHORITY') {
      const conditions = await this.store.listConditionsByPermit(permit.id);
      const draftUpdatedPermit: PermitRecord = {
        ...permit, expirationDateIso: reqRecord.requestedNewExpirationDateIso || permit.expirationDateIso,
        approvedScopeSummary: reqRecord.requestedNewScopeSummary || permit.approvedScopeSummary,
        officialDecisionStatus: input.replacementPermitId
          ? 'SUPERSEDED_BY_REPLACEMENT'
          : permit.officialDecisionStatus,
        supersededByPermitId: input.replacementPermitId ?? permit.supersededByPermitId,
        version: permit.version + 1, updatedAt: now,
      };
      const multiStatus = evaluatePermitMultiDimensionalStatus({
        permit: draftUpdatedPermit, conditions,
        asOfDateIso: now, });
      const historyEntry: PermitStatusHistoryEntry = {
        id: `phist_${crypto.randomBytes(6).toString('hex')}`, changedAtIso: now,
        changedByActorId: actor.actorId, changedByRole: actor.role,
        previousValidityStatus: permit.multiDimensionalStatus.permitValidityStatus,
        newValidityStatus: multiStatus.permitValidityStatus,
        reasonSummary: `${reqRecord.requestType} approved by authority (ref: ${authRef}).`,
        officialReferenceNumber: authRef, };
      updatedPermit = {
        ...draftUpdatedPermit, multiDimensionalStatus: multiStatus,
        statusHistory: [...permit.statusHistory, historyEntry], };
      await this.store.savePermit(updatedPermit);
    }
    return { amendmentRecord: updatedAmendment, updatedPermit };
  }
  async recordSuspensionOrRevocation(
    actor: PermitActorContext, input: RecordSuspensionOrRevocationInput
  ): Promise<PermitRecord> {
    assertOfficerOrComplianceAdmin(actor, `recording permit ${input.actionType}`);
    const permit = await this.store.getPermitById(input.permitId);
    if (!permit) {
      throw new PermitError('RESOURCE_NOT_FOUND', `Permit '${input.permitId}' not found.`, 404);
    }
    const authRef = validateNonEmptyText(input.authorityDecisionReference, 'authorityDecisionReference', 150);
    const reasonSummary = validateNonEmptyText(input.reasonSummary, 'reasonSummary', 1000);
    if (!input.supportingEvidenceIds || input.supportingEvidenceIds.length === 0) {
      throw new PermitError('MISSING_OFFICIAL_DECISION_REFERENCE', 'supportingEvidenceIds required.', 400);
    }
    const now = input.effectiveAtIso || new Date().toISOString();
    const conditions = await this.store.listConditionsByPermit(permit.id);
    const draftPermit: PermitRecord = {
      ...permit, officialDecisionStatus: input.actionType,
      version: permit.version + 1, updatedAt: now,
    };
    const multiStatus = evaluatePermitMultiDimensionalStatus({
      permit: draftPermit, conditions,
      asOfDateIso: now, });
    const historyEntry: PermitStatusHistoryEntry = {
      id: `phist_${crypto.randomBytes(6).toString('hex')}`, changedAtIso: now,
      changedByActorId: actor.actorId, changedByRole: actor.role,
      previousValidityStatus: permit.multiDimensionalStatus.permitValidityStatus,
      newValidityStatus: multiStatus.permitValidityStatus as PermitValidityStatus,
      reasonSummary: `${input.actionType}: ${reasonSummary}`, officialReferenceNumber: authRef,
    };
    const updatedPermit: PermitRecord = {
      ...draftPermit, multiDimensionalStatus: multiStatus,
      statusHistory: [...permit.statusHistory, historyEntry], };
    await this.store.savePermit(updatedPermit);
    return updatedPermit;
  }
}
