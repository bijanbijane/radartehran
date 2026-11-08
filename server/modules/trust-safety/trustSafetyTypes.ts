/**
 * @file server/modules/trust-safety/trustSafetyTypes.ts
 * @description Canonical data models, taxonomy, risk classifications, enforcement contracts,
 * and domain events for Employee 16 — Trust, Safety & Fraud Prevention Backend.
 */

export type ReportTargetType =
  | 'LISTING'
  | 'USER_ACCOUNT'
  | 'AGENCY'
  | 'PROFESSIONAL'
  | 'SERVICE_PROVIDER'
  | 'REVIEW'
  | 'LEAD_INQUIRY'
  | 'SPONSOR_AD';

export type ReportCategory =
  | 'FRAUD_SCAM'
  | 'FAKE_PHOTOS'
  | 'PRICE_MISREPRESENTATION'
  | 'UNAUTHORIZED_REPRESENTATION'
  | 'DUPLICATE_LISTING'
  | 'UNVERIFIED_CREDENTIALS'
  | 'HARASSMENT_ABUSE'
  | 'SPAM'
  | 'IMPERSONATION'
  | 'SUSPICIOUS_PAYMENT';

export type ReportStatus =
  | 'SUBMITTED'
  | 'TRIAGED'
  | 'ASSIGNED_TO_CASE'
  | 'DISMISSED_UNFOUNDED'
  | 'RESOLVED';

export type ModerationCaseStatus =
  | 'OPEN'
  | 'AWAITING_TRIAGE'
  | 'UNDER_REVIEW'
  | 'AWAITING_EVIDENCE'
  | 'ESCALATED'
  | 'RESOLVED'
  | 'DISMISSED'
  | 'CLOSED'
  | 'REOPENED';

export type RiskLevel = 'INFORMATIONAL' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type RiskDimension =
  | 'FINANCIAL_HARM'
  | 'IDENTITY_FRAUD'
  | 'REPEATED_ABUSE'
  | 'PLATFORM_MANIPULATION'
  | 'HARASSMENT'
  | 'MISLEADING_DATA';

export type EnforcementActionType =
  | 'WARNING'
  | 'REQUEST_CORRECTION'
  | 'TEMP_CONTENT_RESTRICTION'
  | 'CONTENT_REMOVAL_REQUEST'
  | 'ACCOUNT_RESTRICTION_REQUEST'
  | 'PROFILE_SUSPENSION_REQUEST';

export type EnforcementExecutionStatus =
  | 'REQUESTED'
  | 'ACCEPTED'
  | 'APPLIED'
  | 'REJECTED'
  | 'FAILED'
  | 'REVERSED'
  | 'EXPIRED';

export type AppealStatus =
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'AWAITING_EVIDENCE'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'WITHDRAWN'
  | 'CLOSED';

/**
 * User Report Record.
 * Reporter identity is strictly protected and never leaked to targets or external queries.
 */
export interface UserReportRecord {
  readonly id: string;
  readonly reporterUid: string; // Strictly confidential
  readonly targetType: ReportTargetType;
  readonly targetId: string;
  readonly category: ReportCategory;
  readonly descriptionFa: string;
  readonly evidenceMediaIds: readonly string[];
  readonly status: ReportStatus;
  readonly assignedCaseId?: string;
  readonly idempotencyKey: string;
  readonly createdAtIso: string;
  readonly resolvedAtIso?: string;
}

/**
 * Moderation Case Record.
 */
export interface ModerationCaseRecord {
  readonly id: string;
  readonly originatingReportIds: readonly string[];
  readonly targetType: ReportTargetType;
  readonly targetId: string;
  readonly caseCategory: ReportCategory;
  readonly severity: RiskLevel;
  readonly status: ModerationCaseStatus;
  readonly assignedModeratorUid?: string;
  readonly internalInvestigationNotes: readonly {
    readonly noteId: string;
    readonly authorUid: string;
    readonly noteFa: string;
    readonly timestampIso: string;
  }[];
  readonly attachedEvidenceIds: readonly string[];
  readonly relatedCaseIds: readonly string[];
  readonly resolutionDetailsFa?: string;
  readonly createdAtIso: string;
  readonly updatedAtIso: string;
  readonly closedAtIso?: string;
}

/**
 * Evidence Reference Record.
 * Binary files reside in the Media module; this records metadata and provenance.
 */
export interface SafetyEvidenceRecord {
  readonly id: string;
  readonly caseId: string;
  readonly evidenceType: 'SCREENSHOT' | 'LISTING_SNAPSHOT' | 'CHAT_LOG' | 'EXTERNAL_URL' | 'PAYMENT_REFERENCE';
  readonly sourceMediaId?: string;
  readonly descriptionFa: string;
  readonly submittedByUid: string;
  readonly confidentialityLevel: 'PUBLIC' | 'RESTRICTED_MODERATOR' | 'INTERNAL_LEGAL';
  readonly createdAtIso: string;
}

/**
 * Evidence-Based Risk Assessment Record.
 */
export interface RiskAssessmentRecord {
  readonly id: string;
  readonly targetType: ReportTargetType;
  readonly targetId: string;
  readonly riskLevel: RiskLevel;
  readonly dimensions: readonly RiskDimension[];
  readonly riskScore: number; // 0 to 100
  readonly evidenceIdsConsidered: readonly string[];
  readonly assessmentMethod: 'MANUAL_MODERATOR' | 'HEURISTIC_RULE';
  readonly policyVersion: string;
  readonly assessedByUid: string;
  readonly reasoningFa: string;
  readonly timestampIso: string;
}

/**
 * Enforcement Decision Record.
 * Invariant: Trust & Safety requests enforcement; owning modules apply it.
 */
export interface EnforcementDecisionRecord {
  readonly id: string;
  readonly caseId: string;
  readonly targetType: ReportTargetType;
  readonly targetId: string;
  readonly actionType: EnforcementActionType;
  readonly reasonFa: string;
  readonly policyVersion: string;
  readonly evidenceIds: readonly string[];
  readonly issuingAuthorityUid: string;
  readonly executionStatus: EnforcementExecutionStatus;
  readonly effectiveAtIso: string;
  readonly expiresAtIso?: string;
  readonly isAppealEligible: boolean;
  readonly appealId?: string;
  readonly reversalReasonFa?: string;
}

/**
 * Appeal Record.
 * Invariant: ReviewerUid must NOT be the issuingAuthorityUid of the original enforcement!
 */
export interface AppealRecord {
  readonly id: string;
  readonly enforcementDecisionId: string;
  readonly appellantUid: string;
  readonly appealReasonFa: string;
  readonly supportingEvidenceMediaIds: readonly string[];
  readonly status: AppealStatus;
  readonly reviewerUid?: string;
  readonly reviewNotesFa?: string;
  readonly decisionFa?: string;
  readonly createdAtIso: string;
  readonly resolvedAtIso?: string;
}

/**
 * Versioned Safety Policy.
 */
export interface SafetyPolicy {
  readonly policyId: string;
  readonly version: string;
  readonly titleFa: string;
  readonly category: ReportCategory;
  readonly applicableTargetTypes: readonly ReportTargetType[];
  readonly standardEnforcementAction: EnforcementActionType;
  readonly effectiveDateIso: string;
  readonly isActive: boolean;
}

/**
 * Versioned Trust & Safety Domain Events.
 */
export interface TrustSafetyDomainEvent {
  readonly eventId: string;
  readonly eventType:
    | 'trust_safety.report_submitted'
    | 'trust_safety.case_created'
    | 'trust_safety.case_assigned'
    | 'trust_safety.risk_assessed'
    | 'trust_safety.enforcement_requested'
    | 'trust_safety.enforcement_applied'
    | 'trust_safety.appeal_submitted'
    | 'trust_safety.appeal_resolved'
    | 'trust_safety.case_resolved';
  readonly caseId?: string;
  readonly reportId?: string;
  readonly targetType: ReportTargetType;
  readonly targetId: string;
  readonly severity?: RiskLevel;
  readonly actionType?: EnforcementActionType;
  readonly timestampIso: string;
  readonly summaryFa: string;
}
