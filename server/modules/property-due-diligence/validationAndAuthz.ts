/**
 * @file server/modules/property-due-diligence/validationAndAuthz.ts
 * @description Validation Rules, State-Transition Guards, and Multi-Reviewer RBAC & Separation-of-Duties Policies.
 */

import type {
  AssessmentType,
  AssessmentStatus,
  WorkstreamType,
  WorkstreamStatus,
  ReviewerRole,
  FindingSeverity,
  DueDiligenceAssessment,
  AssessmentWorkstream,
  EvidencePrivacyClassification,
} from './types';

export class DueDiligenceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 400,
    public readonly field?: string,
  ) {
    super(message);
    this.name = 'DueDiligenceError';
  }
}

export function sanitizeString(val: unknown, maxLen = 500): string {
  if (typeof val !== 'string') return '';
  return val.trim().slice(0, maxLen);
}

export function requireValidId(val: unknown, fieldName = 'id'): string {
  if (typeof val !== 'string' || !/^[a-zA-Z0-9_-]{2,80}$/.test(val.trim())) {
    throw new DueDiligenceError('INVALID_IDENTIFIER', `Invalid identifier for '${fieldName}'.`, 400, fieldName);
  }
  return val.trim();
}

export function requireNonEmptyText(val: unknown, fieldName: string, maxLen = 1000): string {
  const s = sanitizeString(val, maxLen);
  if (!s) {
    throw new DueDiligenceError('MISSING_REQUIRED_FIELD', `Field '${fieldName}' is required.`, 400, fieldName);
  }
  return s;
}

const VALID_ASSESSMENT_TYPES: ReadonlySet<AssessmentType> = new Set([
  'purchase_due_diligence',
  'rental_due_diligence',
  'sale_preparation',
  'investment_due_diligence',
  'technical_inspection',
]);

export function validateAssessmentType(val: unknown): AssessmentType {
  if (typeof val !== 'string' || !VALID_ASSESSMENT_TYPES.has(val as AssessmentType)) {
    throw new DueDiligenceError('INVALID_ASSESSMENT_TYPE', `Unsupported assessment type '${String(val)}'.`, 400, 'assessmentType');
  }
  return val as AssessmentType;
}

const VALID_WORKSTREAM_TYPES: ReadonlySet<WorkstreamType> = new Set([
  'technical_inspection',
  'structural_review',
  'electrical_review',
  'plumbing_review',
  'mechanical_system_review',
  'interior_condition_review',
  'exterior_condition_review',
  'legal_document_checklist',
  'financial_document_review',
  'geographic_review',
  'environmental_review',
  'regulatory_document_checklist',
]);

export function validateWorkstreamType(val: unknown): WorkstreamType {
  if (typeof val !== 'string' || !VALID_WORKSTREAM_TYPES.has(val as WorkstreamType)) {
    throw new DueDiligenceError('INVALID_WORKSTREAM_TYPE', `Unsupported workstream type '${String(val)}'.`, 400, 'workstreamType');
  }
  return val as WorkstreamType;
}

const VALID_REVIEWER_ROLES: ReadonlySet<ReviewerRole> = new Set([
  'assessment_coordinator',
  'technical_inspector',
  'structural_specialist',
  'electrical_specialist',
  'mechanical_specialist',
  'document_reviewer',
  'financial_reviewer',
  'environmental_reviewer',
  'final_report_reviewer',
]);

export function validateReviewerRole(val: unknown): ReviewerRole {
  if (typeof val !== 'string' || !VALID_REVIEWER_ROLES.has(val as ReviewerRole)) {
    throw new DueDiligenceError('INVALID_REVIEWER_ROLE', `Unsupported reviewer role '${String(val)}'.`, 400, 'role');
  }
  return val as ReviewerRole;
}

const VALID_SEVERITIES: ReadonlySet<FindingSeverity> = new Set([
  'informational',
  'minor',
  'moderate',
  'major',
  'critical',
  'undetermined',
]);

export function validateFindingSeverity(val: unknown): FindingSeverity {
  if (typeof val !== 'string' || !VALID_SEVERITIES.has(val as FindingSeverity)) {
    throw new DueDiligenceError('INVALID_SEVERITY', `Unsupported finding severity '${String(val)}'.`, 400, 'severity');
  }
  return val as FindingSeverity;
}

const ALLOWED_ASSESSMENT_TRANSITIONS: Record<AssessmentStatus, ReadonlySet<AssessmentStatus>> = {
  draft: new Set(['requested', 'awaiting_assignment', 'assigned', 'cancelled']),
  requested: new Set(['awaiting_assignment', 'assigned', 'cancelled']),
  awaiting_assignment: new Set(['assigned', 'cancelled']),
  assigned: new Set(['in_progress', 'awaiting_evidence', 'cancelled']),
  in_progress: new Set(['awaiting_evidence', 'findings_recorded', 'under_review', 'cancelled']),
  awaiting_evidence: new Set(['in_progress', 'findings_recorded', 'under_review', 'cancelled']),
  findings_recorded: new Set(['under_review', 'awaiting_corrections', 'completed', 'cancelled']),
  under_review: new Set(['awaiting_corrections', 'findings_recorded', 'completed', 'cancelled']),
  awaiting_corrections: new Set(['in_progress', 'under_review', 'findings_recorded', 'cancelled']),
  completed: new Set(['archived']),
  cancelled: new Set(['archived']),
  archived: new Set([]),
};

export function assertValidAssessmentStateTransition(
  current: AssessmentStatus,
  next: AssessmentStatus,
): void {
  if (current === next) return;
  const allowed = ALLOWED_ASSESSMENT_TRANSITIONS[current];
  if (!allowed || !allowed.has(next)) {
    throw new DueDiligenceError(
      'INVALID_STATE_TRANSITION',
      `Cannot transition assessment from '${current}' to '${next}'.`,
      409,
    );
  }
}

const WORKSTREAM_ROLE_AUTHORIZATION: Record<WorkstreamType, ReadonlySet<ReviewerRole>> = {
  technical_inspection: new Set(['assessment_coordinator', 'technical_inspector', 'structural_specialist']),
  structural_review: new Set(['assessment_coordinator', 'structural_specialist', 'technical_inspector']),
  electrical_review: new Set(['assessment_coordinator', 'electrical_specialist', 'technical_inspector']),
  plumbing_review: new Set(['assessment_coordinator', 'mechanical_specialist', 'technical_inspector']),
  mechanical_system_review: new Set(['assessment_coordinator', 'mechanical_specialist', 'technical_inspector']),
  interior_condition_review: new Set(['assessment_coordinator', 'technical_inspector']),
  exterior_condition_review: new Set(['assessment_coordinator', 'technical_inspector', 'structural_specialist']),
  legal_document_checklist: new Set(['assessment_coordinator', 'document_reviewer']),
  financial_document_review: new Set(['assessment_coordinator', 'financial_reviewer']),
  geographic_review: new Set(['assessment_coordinator', 'environmental_reviewer', 'technical_inspector']),
  environmental_review: new Set(['assessment_coordinator', 'environmental_reviewer']),
  regulatory_document_checklist: new Set(['assessment_coordinator', 'document_reviewer']),
};

export function assertCanAccessAssessment(
  actorUid: string,
  assessment: DueDiligenceAssessment,
  actorOrgId?: string,
  isPlatformAdmin = false,
): void {
  if (!actorUid) {
    throw new DueDiligenceError('UNAUTHENTICATED', 'Verified principal UID required.', 401);
  }
  if (isPlatformAdmin) return;

  if (assessment.requestingOrganizationId && actorOrgId && assessment.requestingOrganizationId !== actorOrgId) {
    const isAssignedReviewer = assessment.assignedReviewers.some((r) => r.reviewerUid === actorUid);
    if (!isAssignedReviewer && assessment.requestingUserUid !== actorUid) {
      throw new DueDiligenceError('CROSS_ORG_ACCESS_DENIED', 'Cross-organization assessment access is prohibited.', 403);
    }
  }

  const isRequester = assessment.requestingUserUid === actorUid;
  const isAssignedReviewer = assessment.assignedReviewers.some((r) => r.reviewerUid === actorUid);
  const isSameOrg = Boolean(assessment.requestingOrganizationId && assessment.requestingOrganizationId === actorOrgId);

  if (!isRequester && !isAssignedReviewer && !isSameOrg) {
    throw new DueDiligenceError('FORBIDDEN', 'Actor is not authorized to access this assessment.', 403);
  }
}

export function assertCanModifyWorkstream(
  actorUid: string,
  assessment: DueDiligenceAssessment,
  workstream: AssessmentWorkstream,
  isPlatformAdmin = false,
): void {
  if (isPlatformAdmin) return;
  const reviewer = assessment.assignedReviewers.find((r) => r.reviewerUid === actorUid);
  if (!reviewer) {
    throw new DueDiligenceError('FORBIDDEN', 'Only assigned reviewers can record or modify workstream data.', 403);
  }

  if (reviewer.role === 'assessment_coordinator') return;

  if (workstream.assignedReviewerUid && workstream.assignedReviewerUid !== actorUid) {
    throw new DueDiligenceError(
      'WORKSTREAM_OWNERSHIP_MISMATCH',
      `Workstream '${workstream.workstreamType}' is assigned to another specialist (${workstream.assignedReviewerUid}); silent overwrite prohibited.`,
      403,
    );
  }

  const allowedRoles = WORKSTREAM_ROLE_AUTHORIZATION[workstream.workstreamType];
  if (allowedRoles && !allowedRoles.has(reviewer.role)) {
    throw new DueDiligenceError(
      'INSUFFICIENT_SPECIALIST_ROLE',
      `Reviewer role '${reviewer.role}' is not authorized to execute workstream '${workstream.workstreamType}'.`,
      403,
    );
  }
}

export function assertCanCoordinateOrApproveReport(
  actorUid: string,
  assessment: DueDiligenceAssessment,
  isPlatformAdmin = false,
): void {
  if (isPlatformAdmin) return;
  const reviewer = assessment.assignedReviewers.find(
    (r) =>
      r.reviewerUid === actorUid &&
      (r.role === 'assessment_coordinator' || r.role === 'final_report_reviewer'),
  );
  const isRequester = assessment.requestingUserUid === actorUid;
  if (!reviewer && !isRequester) {
    throw new DueDiligenceError(
      'FORBIDDEN',
      'Only an assessment coordinator, final report reviewer, or requesting principal can coordinate this action.',
      403,
    );
  }
}

export function assertCanViewEvidence(
  actorUid: string,
  assessment: DueDiligenceAssessment,
  privacy: EvidencePrivacyClassification,
  isPlatformAdmin = false,
): void {
  if (isPlatformAdmin) return;
  if (privacy === 'public_authorized') return;

  const isRequester = assessment.requestingUserUid === actorUid;
  const reviewer = assessment.assignedReviewers.find((r) => r.reviewerUid === actorUid);

  if (privacy === 'assessment_participants_only') {
    if (!isRequester && !reviewer) {
      throw new DueDiligenceError('FORBIDDEN', 'Evidence is restricted to assessment participants.', 403);
    }
    return;
  }

  if (privacy === 'confidential_legal_financial') {
    const canViewConfidential =
      isRequester ||
      (reviewer &&
        (reviewer.role === 'assessment_coordinator' ||
          reviewer.role === 'document_reviewer' ||
          reviewer.role === 'financial_reviewer' ||
          reviewer.role === 'final_report_reviewer'));
    if (!canViewConfidential) {
      throw new DueDiligenceError(
        'CONFIDENTIAL_EVIDENCE_RESTRICTED',
        'Access to confidential legal and financial evidence is restricted to authorized specialist roles.',
        403,
      );
    }
  }
}

export const MANDATORY_REPORT_DISCLAIMER =
  'NOTICE OF LIMITATIONS: This property due-diligence report records structured inspection observations, document copy reviews, and reported evidence as of the stated data cutoff timestamp. It is NOT a legal opinion, official title guarantee, government registry verification, building permit approval, or engineering/safety certification, and does not guarantee future property condition or legal transferability.';
