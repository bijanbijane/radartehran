import {
  ApplicantRelationshipType,
  ApplicationOfficialDecisionReference,
  ApplicationWorkflowStatus,
  IssuingAuthorityRecord,
  OfficialDecisionStatus,
  PermitActorContext,
  PermitApplicationRecord,
  PermitCategoryCode,
  PermitConditionRecord,
  PermitError,
  PermitEvidenceAttachmentRef,
  PermitMultiDimensionalStatus,
  PermitRecord,
  PermitSubjectReference,
  PermitValidityStatus,
  SourceVerificationStatus,
} from './types';

export function validateNonEmptyText(value: string | undefined, fieldName: string, maxLength = 1000): string {
  const trimmed = (value ?? '').trim();
  if (!trimmed) {
    throw new PermitError('VALIDATION_FAILED', `Field '${fieldName}' must not be empty.`, 400);
  }
  if (trimmed.length > maxLength) {
    throw new PermitError(
      'VALIDATION_FAILED',
      `Field '${fieldName}' exceeds maximum length of ${maxLength} characters.`,
      400
    );
  }
  return trimmed;
}

export function assertOfficerOrComplianceAdmin(actor: PermitActorContext, operationDescription: string): void {
  if (
    actor.role !== 'PERMIT_CASE_OFFICER' &&
    actor.role !== 'REGULATORY_COMPLIANCE_ADMIN' &&
    actor.role !== 'SYSTEM_AUTOMATION'
  ) {
    throw new PermitError(
      'INSUFFICIENT_ROLE_PRIVILEGE',
      `Role '${actor.role}' is not authorized for ${operationDescription}.`,
      403
    );
  }
}

export function assertAuthorityEmpoweredForCategoryAndJurisdiction(
  authority: IssuingAuthorityRecord,
  permitCategory: PermitCategoryCode,
  subjectRef: PermitSubjectReference
): void {
  if (!authority.active) {
    throw new PermitError('VALIDATION_FAILED', `Authority '${authority.id}' is not active.`, 400);
  }
  if (!authority.authorizedPermitCategories.includes(permitCategory)) {
    throw new PermitError(
      'AUTHORITY_NOT_EMPOWERED_FOR_CATEGORY',
      `Authority '${authority.name}' is not empowered to issue permit category '${permitCategory}'.`,
      400
    );
  }
  if (authority.jurisdictionScope.citySlug.toLowerCase() !== subjectRef.citySlug.trim().toLowerCase()) {
    throw new PermitError(
      'JURISDICTION_MISMATCH',
      `Authority city '${authority.jurisdictionScope.citySlug}' does not match property city '${subjectRef.citySlug}'.`,
      400
    );
  }
  if (
    authority.jurisdictionScope.districtCodes &&
    authority.jurisdictionScope.districtCodes.length > 0 &&
    subjectRef.districtCode &&
    !authority.jurisdictionScope.districtCodes.includes(subjectRef.districtCode)
  ) {
    throw new PermitError(
      'JURISDICTION_MISMATCH',
      `Authority district scope does not cover district '${subjectRef.districtCode}'.`,
      400
    );
  }
}

export function assertApplicantStandingForPermit(
  standing: { propertyExists: boolean; hasVerifiedOrDocumentedStanding: boolean; standingSummary: string },
  relationship: ApplicantRelationshipType
): void {
  if (!standing.propertyExists) {
    throw new PermitError('RESOURCE_NOT_FOUND', 'Subject property does not exist.', 404);
  }
  if (!standing.hasVerifiedOrDocumentedStanding) {
    throw new PermitError(
      'UNAUTHORIZED_APPLICANT_RELATIONSHIP',
      `Applicant lacks standing (${relationship}): ${standing.standingSummary}`,
      403
    );
  }
}

export function assertCanReadApplicationOrPermit(
  actor: PermitActorContext,
  target: PermitApplicationRecord | PermitRecord
): void {
  if (
    actor.role === 'PERMIT_CASE_OFFICER' ||
    actor.role === 'REGULATORY_COMPLIANCE_ADMIN' ||
    actor.role === 'SYSTEM_AUTOMATION' ||
    actor.role === 'AUDITOR_READ_ONLY'
  ) {
    return;
  }
  if ('applicantPartyId' in target) {
    if (
      target.applicantPartyId === actor.actorId ||
      target.representativePartyId === actor.actorId
    ) {
      return;
    }
  } else {
    if (target.holderPartyIds.includes(actor.actorId)) {
      return;
    }
  }
  throw new PermitError(
    'INSUFFICIENT_ROLE_PRIVILEGE',
    `Actor '${actor.actorId}' is not authorized to view record '${target.id}'.`,
    403
  );
}

export function assertCanMutateApplicationOrPermit(
  actor: PermitActorContext,
  target: PermitApplicationRecord | PermitRecord
): void {
  if (
    actor.role === 'PERMIT_CASE_OFFICER' ||
    actor.role === 'REGULATORY_COMPLIANCE_ADMIN' ||
    actor.role === 'SYSTEM_AUTOMATION'
  ) {
    return;
  }
  if ('applicantPartyId' in target) {
    if (
      target.applicantPartyId === actor.actorId ||
      target.representativePartyId === actor.actorId
    ) {
      return;
    }
  } else {
    if (target.holderPartyIds.includes(actor.actorId)) {
      return;
    }
  }
  throw new PermitError(
    'INSUFFICIENT_ROLE_PRIVILEGE',
    `Actor '${actor.actorId}' is not authorized to mutate record '${target.id}'.`,
    403
  );
}

const ALLOWED_APPLICATION_TRANSITIONS: Record<ApplicationWorkflowStatus, ApplicationWorkflowStatus[]> = {
  DRAFT: ['READY_FOR_SUBMISSION', 'WITHDRAWN', 'CLOSED'],
  READY_FOR_SUBMISSION: ['DRAFT', 'SUBMITTED', 'WITHDRAWN', 'CLOSED'],
  SUBMITTED: ['ACKNOWLEDGED', 'UNDER_REVIEW', 'WITHDRAWN', 'CLOSED'],
  ACKNOWLEDGED: ['UNDER_REVIEW', 'ADDITIONAL_INFORMATION_REQUIRED', 'APPROVED', 'REJECTED', 'WITHDRAWN'],
  UNDER_REVIEW: ['ADDITIONAL_INFORMATION_REQUIRED', 'APPROVED', 'REJECTED', 'WITHDRAWN'],
  ADDITIONAL_INFORMATION_REQUIRED: ['RESUBMITTED', 'WITHDRAWN', 'REJECTED', 'CLOSED'],
  RESUBMITTED: ['UNDER_REVIEW', 'ADDITIONAL_INFORMATION_REQUIRED', 'APPROVED', 'REJECTED', 'WITHDRAWN'],
  APPROVED: ['CLOSED'],
  REJECTED: ['CLOSED'],
  WITHDRAWN: ['CLOSED'],
  CLOSED: [],
  UNKNOWN: ['UNDER_REVIEW', 'CLOSED'],
};

const OFFICIAL_AUTHORITY_STATES = new Set<ApplicationWorkflowStatus>([
  'ACKNOWLEDGED',
  'UNDER_REVIEW',
  'ADDITIONAL_INFORMATION_REQUIRED',
  'APPROVED',
  'REJECTED',
]);

export function assertValidApplicationTransition(
  actor: PermitActorContext,
  currentState: ApplicationWorkflowStatus,
  nextState: ApplicationWorkflowStatus,
  officialDecisionRef?: ApplicationOfficialDecisionReference
): void {
  const allowed = ALLOWED_APPLICATION_TRANSITIONS[currentState] ?? [];
  if (!allowed.includes(nextState)) {
    throw new PermitError(
      'INVALID_WORKFLOW_TRANSITION',
      `Invalid permit application transition from '${currentState}' to '${nextState}'.`,
      409
    );
  }
  if (OFFICIAL_AUTHORITY_STATES.has(nextState)) {
    if (
      actor.role !== 'PERMIT_CASE_OFFICER' &&
      actor.role !== 'REGULATORY_COMPLIANCE_ADMIN' &&
      actor.role !== 'SYSTEM_AUTOMATION'
    ) {
      throw new PermitError(
        'APPLICANT_CANNOT_SELF_APPROVE',
        `Role '${actor.role}' cannot transition application into official authority state '${nextState}'.`,
        403
      );
    }
  }
  if (nextState === 'APPROVED' || nextState === 'REJECTED') {
    if (
      !officialDecisionRef ||
      !officialDecisionRef.officialDecisionReferenceNumber.trim() ||
      officialDecisionRef.supportingEvidenceIds.length === 0
    ) {
      throw new PermitError(
        'MISSING_OFFICIAL_DECISION_REFERENCE',
        `Transitioning application to '${nextState}' requires an officialDecisionReferenceNumber and supportingEvidenceIds.`,
        400
      );
    }
  }
}

export function evaluatePermitMultiDimensionalStatus(params: {
  permit: {
    officialDecisionStatus: OfficialDecisionStatus;
    sourceVerificationStatus: SourceVerificationStatus;
    effectiveStartDateIso: string;
    expirationDateIso?: string;
    supportingEvidence: PermitEvidenceAttachmentRef[];
  };
  conditions: PermitConditionRecord[];
  asOfDateIso?: string;
}): PermitMultiDimensionalStatus {
  const { permit, conditions } = params;
  const asOfMs = new Date(params.asOfDateIso || new Date().toISOString()).getTime();
  const startMs = new Date(permit.effectiveStartDateIso).getTime();
  const expMs = permit.expirationDateIso ? new Date(permit.expirationDateIso).getTime() : undefined;

  let permitValidityStatus: PermitValidityStatus = 'UNKNOWN';
  if (
    permit.officialDecisionStatus === 'SUSPENDED' ||
    permit.officialDecisionStatus === 'REVOKED'
  ) {
    permitValidityStatus = 'INVALID_SUSPENDED_OR_REVOKED';
  } else if (
    permit.officialDecisionStatus === 'SUPERSEDED_BY_REPLACEMENT' ||
    permit.sourceVerificationStatus === 'SUPERSEDED'
  ) {
    permitValidityStatus = 'SUPERSEDED';
  } else if (permit.sourceVerificationStatus === 'DISPUTED') {
    permitValidityStatus = 'DISPUTED';
  } else if (expMs !== undefined && asOfMs > expMs) {
    permitValidityStatus = 'EXPIRED';
  } else if (asOfMs < startMs) {
    permitValidityStatus = 'NOT_YET_EFFECTIVE';
  } else if (permit.sourceVerificationStatus === 'UNVERIFIED_CLAIM') {
    permitValidityStatus = 'UNVERIFIED_CLAIM_ONLY';
  } else if (permit.sourceVerificationStatus === 'DOCUMENTED_UNVERIFIED') {
    permitValidityStatus = 'DOCUMENTED_BUT_UNVERIFIED';
  } else if (
    permit.sourceVerificationStatus === 'INDEPENDENTLY_VERIFIED_OFFICIAL_SOURCE' &&
    (permit.officialDecisionStatus === 'APPROVED' ||
      permit.officialDecisionStatus === 'CONDITIONAL_APPROVAL') &&
    permit.supportingEvidence.length > 0
  ) {
    permitValidityStatus = 'VALID_VERIFIED_ACTIVE';
  }

  let conditionFulfillmentStatus: PermitMultiDimensionalStatus['conditionFulfillmentStatus'] =
    'NO_CONDITIONS';
  if (conditions.length > 0) {
    if (conditions.some((c) => c.fulfillmentStatus === 'OVERDUE_OR_NON_COMPLIANT')) {
      conditionFulfillmentStatus = 'OVERDUE_OR_NON_COMPLIANT';
    } else if (
      conditions.every(
        (c) =>
          c.fulfillmentStatus === 'FULFILLMENT_INDEPENDENTLY_VERIFIED' ||
          c.fulfillmentStatus === 'WAIVED_BY_AUTHORITY'
      )
    ) {
      conditionFulfillmentStatus = 'ALL_VERIFIED_FULFILLED';
    } else if (conditions.some((c) => c.fulfillmentStatus === 'REPORTED_FULFILLED_BY_HOLDER')) {
      conditionFulfillmentStatus = 'REPORTED_FULFILLED_BY_HOLDER';
    } else {
      conditionFulfillmentStatus = 'PENDING_CONDITIONS';
    }
  }

  const evidenceCompleteness: PermitMultiDimensionalStatus['evidenceCompleteness'] =
    permit.supportingEvidence.length === 0
      ? 'MISSING'
      : permit.sourceVerificationStatus === 'INDEPENDENTLY_VERIFIED_OFFICIAL_SOURCE'
      ? 'COMPLETE'
      : 'UNVERIFIED';

  return {
    internalWorkflowStatus:
      permitValidityStatus === 'SUPERSEDED' ? 'ARCHIVED_RECORD' : 'REGISTERED_RECORD',
    officialAuthorityDecisionStatus: permit.officialDecisionStatus,
    permitValidityStatus,
    sourceVerificationStatus: permit.sourceVerificationStatus,
    evidenceCompleteness,
    conditionFulfillmentStatus,
  };
}
