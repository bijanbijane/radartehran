/**
 * EMPLOYEE 71 — REAL ESTATE FRAUD DETECTION, RISK INTELLIGENCE & PLATFORM ABUSE PREVENTION BACKEND
 * Canonical Domain Types & Interfaces
 */

import type {
  AuditEventSink,
  AuthenticatedPrincipal,
  FirebaseTokenVerifierAdapter,
  TransactionRunnerAdapter,
} from '../core';

export type RiskSignalCategory =
  | 'IDENTITY_AND_ACCOUNT'
  | 'LISTING_INTEGRITY'
  | 'TRANSACTION_MANIPULATION'
  | 'RENTAL_AND_TENANCY'
  | 'FINANCIAL_AND_BILLING'
  | 'DOCUMENT_INTEGRITY'
  | 'REPUTATION_AND_REVIEWS'
  | 'DATA_INGESTION_AND_SOURCES'
  | 'COORDINATED_ABUSE'
  | 'OPERATIONAL_INSIDER_RISK';

export type RiskEntityType =
  | 'USER_ACCOUNT'
  | 'ORGANIZATION'
  | 'AGENT_BROKER'
  | 'PROPERTY_LISTING'
  | 'PROPERTY'
  | 'TRANSACTION'
  | 'RENTAL_APPLICATION'
  | 'TENANCY'
  | 'PAYMENT_ENTITY'
  | 'DOCUMENT'
  | 'EXTERNAL_DATA_SOURCE';

export type RiskSeverity = 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';

export type RiskBand = 'MINIMAL' | 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';

export type EvidenceReliability =
  | 'AUTHORITATIVE_VERIFIED'
  | 'CORROBORATED_INTERNAL'
  | 'AUTOMATED_HEURISTIC'
  | 'EXTERNAL_UNVERIFIED'
  | 'USER_REPORTED';

export type RiskAssessmentStatus =
  | 'PENDING'
  | 'EVALUATING'
  | 'ASSESSED'
  | 'REVIEW_REQUIRED'
  | 'UNDER_REVIEW'
  | 'CONFIRMED_CONCERN'
  | 'UNSUBSTANTIATED'
  | 'FALSE_POSITIVE'
  | 'RESOLVED'
  | 'EXPIRED'
  | 'SUPERSEDED';

export type RiskPermission =
  | 'risk.read.summary'
  | 'risk.read.sensitive'
  | 'risk.signal.create'
  | 'risk.rule.read'
  | 'risk.rule.manage'
  | 'risk.assessment.read'
  | 'risk.assessment.recalculate'
  | 'risk.review.assign'
  | 'risk.review.decide'
  | 'risk.case.manage'
  | 'risk.action.execute'
  | 'risk.policy.manage'
  | 'risk.analytics.read'
  | 'risk.evidence.read';

export interface RiskSignal {
  signalId: string;
  category: RiskSignalCategory;
  signalType: string;
  sourceModule: string;
  sourceReferenceId: string;
  entityType: RiskEntityType;
  entityId: string;
  detectedAt: string;
  observedAt: string;
  severity: RiskSeverity;
  confidence: number; // 0 to 1
  reliability: EvidenceReliability;
  evidenceIds: string[];
  ruleId: string;
  ruleVersion: number;
  contextMetadata: Record<string, string | number | boolean>;
  status: 'ACTIVE' | 'SUPPRESSED_FALSE_POSITIVE' | 'EXPIRED' | 'RESOLVED';
  expiresAt: string;
  requiresHumanReview: boolean;
  relatedSignalIds: string[];
  correlationId: string;
  provenance: string;
  deduplicationKey: string;
}

export type StructuredRuleOperator =
  | 'EQ'
  | 'NEQ'
  | 'GT'
  | 'GTE'
  | 'LT'
  | 'LTE'
  | 'IN'
  | 'RATIO_DEVIATION_GT'
  | 'WINDOW_COUNT_GTE';

export interface StructuredRuleCondition {
  field: string;
  operator: StructuredRuleOperator;
  expectedValue: number | string | boolean | (number | string)[];
  referenceBaselineField?: string;
}

export interface RiskRule {
  ruleId: string;
  name: string;
  description: string;
  category: RiskSignalCategory;
  version: number;
  enabled: boolean;
  severity: RiskSeverity;
  confidenceContribution: number; // 0 to 1
  weightPoints: number; // 1 to 100
  conditions: StructuredRuleCondition[];
  requiredFields: string[];
  supportedEntityTypes: RiskEntityType[];
  cooldownSeconds: number;
  expirationHours: number;
  requiresHumanReview: boolean;
  weakSignalOnly?: boolean; // e.g., shared IP/office cannot trigger high risk alone
  effectiveFrom: string;
  retiredAt?: string;
  ownerUid: string;
  updatedAt: string;
}

export interface RiskRuleVersion {
  ruleId: string;
  version: number;
  snapshot: RiskRule;
  changedByUid: string;
  changeReason: string;
  recordedAt: string;
}

export interface RiskPolicyConfiguration {
  policyVersion: string;
  bands: {
    minimalMax: number;
    lowMax: number;
    moderateMax: number;
    highMax: number;
  };
  humanReviewThresholdScore: number;
  secondReviewerRequiredCategories: string[];
  defaultSignalTtlHours: number;
  timeDecayHalfLifeHours: number;
  updatedAt: string;
  updatedByUid: string;
}

export interface ContributingSignalSummary {
  signalId: string;
  category: RiskSignalCategory;
  signalType: string;
  ruleId: string;
  ruleVersion: number;
  severity: RiskSeverity;
  confidence: number;
  rawWeight: number;
  effectiveWeightAfterDecayAndCorrelation: number;
  detectedAt: string;
}

export interface RiskAssessment {
  assessmentId: string;
  entityType: RiskEntityType;
  entityId: string;
  score: number; // 0 to 100
  riskBand: RiskBand;
  confidence: number; // 0 to 1
  status: RiskAssessmentStatus;
  contributingSignals: ContributingSignalSummary[];
  positiveMitigatingFactors: string[];
  missingDataFieldsNotPenalized: string[];
  ruleVersionsUsed: Record<string, number>;
  calculatedAt: string;
  scoreVersion: string;
  dataFreshnessSeconds: number;
  expiresAt: string;
  requiresHumanReview: boolean;
  linkedCaseId?: string;
  assignedReviewerUid?: string;
  manualOverrideReason?: string;
  transitionHistory: {
    fromStatus: RiskAssessmentStatus | 'INITIAL';
    toStatus: RiskAssessmentStatus;
    changedByUid: string;
    reason: string;
    timestamp: string;
  }[];
}

export interface RiskEvidenceReference {
  evidenceId: string;
  evidenceType:
    | 'LISTING_REVISION'
    | 'PROPERTY_RECORD'
    | 'TRANSACTION_EVENT'
    | 'LEDGER_RECORD'
    | 'RENTAL_RECORD'
    | 'DOCUMENT_FINGERPRINT'
    | 'VERIFICATION_RECORD'
    | 'AUDIT_RECORD'
    | 'INGESTION_PROVENANCE'
    | 'SUPPORT_CASE';
  sourceModule: string;
  sourceRecordId: string;
  sourceVersion?: string;
  collectedAt: string;
  provenance: string;
  integrityHash?: string;
  accessClassification: 'RISK_RESTRICTED' | 'RISK_SENSITIVE_ADMIN_ONLY';
  retentionDays: number;
  relatedCaseIds: string[];
  verificationStatus: 'UNVERIFIED' | 'VERIFIED' | 'DISPUTED';
}

export interface RiskRelationship {
  relationshipId: string;
  fromEntityType: RiskEntityType;
  fromEntityId: string;
  toEntityType: RiskEntityType;
  toEntityId: string;
  relationshipType:
    | 'USER_TO_USER_INTERACTION'
    | 'USER_TO_ORGANIZATION'
    | 'AGENT_TO_BROKERAGE'
    | 'USER_TO_LISTING'
    | 'LISTING_TO_PROPERTY'
    | 'USER_TO_TRANSACTION'
    | 'TRANSACTION_TO_DOCUMENT'
    | 'USER_TO_REVIEW'
    | 'SHARED_DOCUMENT_HASH'
    | 'SHARED_NETWORK_WEAK_CORRELATION';
  sourceModule: string;
  createdAt: string;
  confidence: number;
  evidenceIds: string[];
  isWeakTechnicalCorrelation: boolean;
}

export type FalsePositiveReasonCategory =
  | 'INCORRECT_SIGNAL_IDENTIFICATION'
  | 'INCORRECT_ENTITY_ASSOCIATION'
  | 'INSUFFICIENT_EVIDENCE'
  | 'LEGITIMATE_UNUSUAL_BEHAVIOR'
  | 'INCORRECT_SOURCE_DATA'
  | 'INCORRECT_RULE_CONFIGURATION'
  | 'EXPIRED_OR_OUTDATED_EVIDENCE'
  | 'STATISTICAL_DETECTION_ERROR';

export interface RiskDecision {
  decisionId: string;
  assessmentId: string;
  entityType: RiskEntityType;
  entityId: string;
  reviewerUid: string;
  secondApproverUid?: string;
  decisionOutcome: 'CONFIRM_CONCERN' | 'MARK_FALSE_POSITIVE' | 'MARK_UNSUBSTANTIATED' | 'ESCALATE' | 'RESOLVE';
  falsePositiveCategory?: FalsePositiveReasonCategory;
  ruleImprovementRef?: string;
  reason: string;
  evidenceIds: string[];
  previousStatus: RiskAssessmentStatus;
  newStatus: RiskAssessmentStatus;
  decidedAt: string;
}

export type ProtectiveActionClassification =
  | 'INFORMATIONAL'
  | 'REVERSIBLE'
  | 'TEMPORARILY_RESTRICTIVE'
  | 'HIGH_IMPACT'
  | 'IRREVERSIBLE';

export type ProtectiveActionType =
  | 'REQUEST_ADDITIONAL_VERIFICATION'
  | 'HOLD_LISTING_FOR_MODERATION'
  | 'REQUIRE_DOCUMENT_VERIFICATION'
  | 'ESCALATE_TRANSACTION_MANUAL_REVIEW'
  | 'TEMPORARY_HIGH_RISK_OPERATION_HOLD'
  | 'REQUEST_PAYMENT_RECONCILIATION'
  | 'QUARANTINE_EXTERNAL_SOURCE_RECORD'
  | 'REQUIRE_CREDENTIAL_REVERIFICATION'
  | 'OPEN_INVESTIGATION_CASE'
  | 'NOTIFY_PLATFORM_OPERATORS'
  | 'PERMANENT_ACCOUNT_BAN'
  | 'DELETE_USER_ACCOUNT'
  | 'SEIZE_OR_TRANSFER_FUNDS'
  | 'MODIFY_LEDGER_BALANCE';

export interface RiskActionExecution {
  actionId: string;
  assessmentId: string;
  entityType: RiskEntityType;
  entityId: string;
  actionType: ProtectiveActionType;
  classification: ProtectiveActionClassification;
  reasonCode: string;
  idempotencyKey: string;
  requestedByUid: string;
  secondApproverUid?: string;
  isAutomatedTrigger: boolean;
  status: 'COMPLETED' | 'REJECTED_PROHIBITED' | 'REQUIRES_HUMAN_DUAL_APPROVAL' | 'RELEASED';
  expiresAt?: string;
  executedAt: string;
  releasedAt?: string;
}

export interface RiskCaseLink {
  riskCaseLinkId: string;
  supportCaseId: string;
  assessmentId: string;
  entityType: RiskEntityType;
  entityId: string;
  investigationCategory: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  assignedTeam: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'ESCALATED' | 'RESOLVED' | 'REOPENED';
  createdAt: string;
  updatedAt: string;
}

export interface RiskCheckGateResult {
  checkStatus: 'RISK_CHECK_PASSED' | 'RISK_CHECK_FAILED' | 'RISK_CHECK_UNAVAILABLE' | 'RISK_CHECK_REQUIRES_HUMAN_REVIEW';
  entityType: RiskEntityType;
  entityId: string;
  riskBand: RiskBand | 'UNKNOWN_UNAVAILABLE';
  confidence: number;
  requiresAdditionalReview: boolean;
  fallbackPolicyApplied?: 'HOLD_FOR_MANUAL_REVIEW' | 'DEFER_HIGH_RISK_MUTATION' | 'ALLOW_LOW_IMPACT_WITH_MONITORING';
  reasonCode: string;
}

export interface FraudRiskModuleDependencies {
  txRunner: TransactionRunnerAdapter;
  auditSink: AuditEventSink;
  tokenVerifier?: FirebaseTokenVerifierAdapter;
  onSupportCaseRequested?: (payload: {
    assessmentId: string;
    entityType: RiskEntityType;
    entityId: string;
    category: string;
    priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  }) => Promise<string> | string;
  onProtectiveActionDispatched?: (action: RiskActionExecution) => Promise<void> | void;
  onRiskDomainEventPublished?: (eventName: string, payload: Record<string, unknown>) => Promise<void> | void;
}
