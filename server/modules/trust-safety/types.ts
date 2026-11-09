import type {
  AuditEventSink,
  AuthenticatedPrincipal,
  DelegatedAdminStoreAdapter,
  FirebaseTokenVerifierAdapter,
  IdempotencyStoreAdapter,
  TransactionRunnerAdapter,
} from '../core';

export type ReportableEntityType =
  | 'listing'
  | 'user'
  | 'agency'
  | 'professional'
  | 'service_provider'
  | 'review'
  | 'lead'
  | 'advertisement'
  | 'payment_transaction';

export type ReportCategory =
  | 'fake_photos'
  | 'misleading_price'
  | 'duplicate_listing'
  | 'unauthorized_representation'
  | 'suspicious_agent'
  | 'fake_review'
  | 'harassment'
  | 'spam'
  | 'impersonation'
  | 'payment_fraud'
  | 'policy_violation_other';

export type ReportLifecycleStatus =
  | 'submitted'
  | 'under_triage'
  | 'escalated_to_case'
  | 'dismissed'
  | 'resolved';

export type ModerationCaseStatus =
  | 'open'
  | 'awaiting_triage'
  | 'under_review'
  | 'awaiting_evidence'
  | 'escalated'
  | 'resolved'
  | 'dismissed'
  | 'closed'
  | 'reopened';

export type RiskSeverity = 'informational' | 'low' | 'medium' | 'high' | 'critical';

export type EvidenceAccessLevel =
  | 'public'
  | 'reporter_only'
  | 'target_and_reporter'
  | 'internal_moderator_only'
  | 'restricted_admin';

export type EvidenceType =
  | 'screenshot'
  | 'listing_snapshot'
  | 'communication_log'
  | 'credential_document'
  | 'payment_reference'
  | 'system_signal'
  | 'external_url';

export type EnforcementActionType =
  | 'warning'
  | 'request_for_correction'
  | 'temporary_content_restriction'
  | 'content_removal_request'
  | 'temporary_account_restriction'
  | 'publishing_restriction'
  | 'profile_suspension_request'
  | 'referral_for_review'
  | 'account_termination_request';

export type EnforcementExecutionStatus =
  | 'requested'
  | 'accepted'
  | 'applied'
  | 'rejected'
  | 'failed'
  | 'reversed'
  | 'expired';

export type AppealStatus =
  | 'submitted'
  | 'under_review'
  | 'awaiting_additional_evidence'
  | 'accepted'
  | 'rejected'
  | 'withdrawn'
  | 'closed';

/**
 * Authoritative User Report.
 * Allegation submitted by an authenticated user; not proof of wrongdoing.
 */
export interface StoredUserReport {
  id: string;
  reporterUid: string;
  targetType: ReportableEntityType;
  targetId: string;
  category: ReportCategory;
  description: string;
  evidenceReferences: string[];
  status: ReportLifecycleStatus;
  assignedCaseId: string | null;
  resolutionDetails?: string;
  idempotencyKey: string;
  createdAtIso: string;
  updatedAtIso: string;
  resolvedAtIso?: string;
}

/**
 * Central Moderation Case.
 * Investigation workflow record.
 */
export interface StoredModerationCase {
  id: string;
  originatingType: 'user_report' | 'system_signal' | 'admin_referral';
  originatingReferenceId: string;
  targetType: ReportableEntityType;
  targetId: string;
  caseCategory: ReportCategory;
  severity: RiskSeverity;
  status: ModerationCaseStatus;
  assignedModeratorUid: string | null;
  internalNotes: Array<{
    noteId: string;
    authorUid: string;
    note: string;
    timestampIso: string;
  }>;
  evidenceIds: string[];
  enforcementActionIds: string[];
  createdAtIso: string;
  updatedAtIso: string;
  closedAtIso?: string;
  resolutionSummary?: string;
}

/**
 * Evidence Reference.
 * Preserves source integrity metadata without storing raw binary files directly.
 */
export interface StoredEvidenceRecord {
  id: string;
  caseId: string;
  type: EvidenceType;
  sourceModule: string;
  sourceRef: string;
  submittedByUid: string;
  sha256Hash?: string;
  accessClassification: EvidenceAccessLevel;
  description: string;
  createdAtIso: string;
}

/**
 * Risk Assessment Record.
 * Evidence-based evaluation; transparent and auditable.
 */
export interface StoredRiskAssessment {
  id: string;
  targetType: ReportableEntityType;
  targetId: string;
  severity: RiskSeverity;
  signalsConsidered: string[];
  evaluationMethod: 'rule_heuristic' | 'manual_moderator' | 'composite';
  policyVersion: string;
  reviewerUid: string;
  limitations: string[];
  evaluatedAtIso: string;
}

/**
 * Enforcement Decision.
 * Requests or records sanctions against target entities via cross-module dispatch.
 */
export interface StoredEnforcementDecision {
  id: string;
  caseId: string;
  targetType: ReportableEntityType;
  targetId: string;
  actionType: EnforcementActionType;
  reason: string;
  policyVersion: string;
  evidenceReferences: string[];
  issuingAuthorityUid: string;
  effectiveFromIso: string;
  expiresAtIso?: string;
  appealEligible: boolean;
  status: EnforcementExecutionStatus;
  statusReason?: string;
  reversalHistory?: Array<{
    reversedByUid: string;
    reason: string;
    timestampIso: string;
  }>;
  createdAtIso: string;
  updatedAtIso: string;
}

/**
 * Appeal against an enforcement decision.
 * Enforces separation of duties (original decider cannot be sole reviewer).
 */
export interface StoredAppealRecord {
  id: string;
  enforcementId: string;
  appellantUid: string;
  reason: string;
  supportingEvidenceIds: string[];
  status: AppealStatus;
  assignedReviewerUid: string | null;
  originalDeciderUid: string;
  reviewNotes?: string;
  decision?: 'accepted' | 'rejected';
  decidedAtIso?: string;
  createdAtIso: string;
  updatedAtIso: string;
}

/**
 * Platform Safety Policy versioning.
 */
export interface PlatformSafetyPolicy {
  policyId: string;
  version: string;
  category: ReportCategory;
  nameFa: string;
  descriptionFa: string;
  applicableEntityTypes: ReportableEntityType[];
  defaultSeverity: RiskSeverity;
  evidenceRequired: boolean;
  appealPermitted: boolean;
  isActive: boolean;
  effectiveFromIso: string;
}

/**
 * Cross-Module Target Resolver Contract.
 * Validates target entities exist without reading foreign collections directly.
 */
export interface TargetEntityResolver {
  resolveTargetEntity(type: ReportableEntityType, id: string): Promise<{
    exists: boolean;
    ownerUid?: string;
    titleOrName?: string;
    reason?: string;
  }>;
}

/**
 * Cross-Module Enforcement Command Publisher.
 * Dispatches enforcement requests to the target module without mutating its data directly.
 */
export interface EnforcementCommandPublisher {
  publishEnforcementCommand(command: {
    commandId: string;
    enforcementId: string;
    targetType: ReportableEntityType;
    targetId: string;
    actionType: EnforcementActionType;
    reason: string;
    expiresAtIso?: string;
  }): Promise<{ accepted: boolean; failureReason?: string }>;
}

/**
 * Repository Adapter for decoupled persistence.
 */
export interface TrustSafetyRepositoryAdapter {
  saveUserReport(report: StoredUserReport): Promise<void>;
  getUserReport(id: string): Promise<StoredUserReport | null>;
  getUserReportsByReporter(reporterUid: string): Promise<StoredUserReport[]>;
  getUserReportsByTarget(targetType: ReportableEntityType, targetId: string): Promise<StoredUserReport[]>;
  saveModerationCase(caseRecord: StoredModerationCase): Promise<void>;
  getModerationCase(id: string): Promise<StoredModerationCase | null>;
  saveEvidenceRecord(evidence: StoredEvidenceRecord): Promise<void>;
  getEvidenceRecords(caseId: string): Promise<StoredEvidenceRecord[]>;
  saveRiskAssessment(assessment: StoredRiskAssessment): Promise<void>;
  saveEnforcementDecision(decision: StoredEnforcementDecision): Promise<void>;
  getEnforcementDecision(id: string): Promise<StoredEnforcementDecision | null>;
  saveAppealRecord(appeal: StoredAppealRecord): Promise<void>;
  getAppealRecord(id: string): Promise<StoredAppealRecord | null>;
  getSafetyPolicy(policyId: string, version?: string): Promise<PlatformSafetyPolicy | null>;
}

export interface TrustSafetyModuleDependencies {
  tokenVerifier: FirebaseTokenVerifierAdapter;
  adminStore: DelegatedAdminStoreAdapter;
  txRunner: TransactionRunnerAdapter;
  idempotencyStore: IdempotencyStoreAdapter;
  auditSink: AuditEventSink;
  repository: TrustSafetyRepositoryAdapter;
  targetResolver: TargetEntityResolver;
  enforcementPublisher?: EnforcementCommandPublisher;
  primaryAdminEmails?: string[];
  nowFn?: () => number;
}
