/**
 * Employee 66 — Real Estate Customer Support, Case Management & Service Operations Backend
 * (`server/modules/customer-support/types.ts`)
 *
 * Exclusive ownership: `server/modules/customer-support/`
 */

import type {
  AuditEventSink,
  AuthenticatedPrincipal,
  DelegatedAdminStoreAdapter,
  FirebaseTokenVerifierAdapter,
  IdempotencyStoreAdapter,
  TransactionRunnerAdapter,
} from '../core/types';
import type { NotificationChannel } from '../notifications/types';

// ============================================================================
// 2. SUPPORT CASE DOMAIN & CATEGORIES
// ============================================================================

export type SupportCaseCategory =
  | 'ACCOUNT_AND_PROFILE'
  | 'PROPERTY_AND_LISTING'
  | 'SEARCH_AND_VALUATION'
  | 'BUYER_AND_SELLER_SUPPORT'
  | 'RENTAL_AND_TENANCY_SUPPORT'
  | 'BROKERAGE_AND_AGENT_SUPPORT'
  | 'PROPERTY_MANAGEMENT_SUPPORT'
  | 'PAYMENT_AND_TRANSACTION_ASSISTANCE'
  | 'DOCUMENT_AND_VERIFICATION_ASSISTANCE'
  | 'PRIVACY_AND_DATA_RIGHTS'
  | 'PLATFORM_TECHNICAL_ISSUES'
  | 'ABUSE_AND_SAFETY_REPORTS'
  | 'GENERAL_CUSTOMER_INQUIRIES';

export type SupportCasePriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT' | 'CRITICAL';

// ============================================================================
// 3. CASE LIFECYCLE & STATE MACHINE
// ============================================================================

export type SupportCaseStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'OPEN'
  | 'ASSIGNED'
  | 'IN_PROGRESS'
  | 'WAITING_FOR_CUSTOMER'
  | 'WAITING_FOR_INTERNAL_TEAM'
  | 'ESCALATED'
  | 'RESOLVED'
  | 'CLOSED'
  | 'REOPENED'
  | 'CANCELED';

export interface CaseRelatedEntityReferences {
  propertyId?: string | null;
  listingId?: string | null;
  agentUid?: string | null;
  brokerageId?: string | null;
  transactionId?: string | null;
  tenancyId?: string | null;
  documentId?: string | null;
  reviewId?: string | null;
  dataRightsRequestId?: string | null;
}

export interface CaseParticipantReference {
  uid: string;
  role: 'REQUESTER' | 'AUTHORIZED_REPRESENTATIVE' | 'COLLABORATOR';
  addedByUid: string;
  addedAtIso: string;
}

export interface CaseStatusTransitionRecord {
  transitionId: string;
  caseId: string;
  fromStatus: SupportCaseStatus | null;
  toStatus: SupportCaseStatus;
  actorUid: string;
  actorRole: 'CUSTOMER' | 'SUPPORT_AGENT' | 'SUPPORT_LEAD' | 'ADMIN' | 'SYSTEM';
  reason: string;
  timestampIso: string;
}

// ============================================================================
// 4. CASE ASSIGNMENT & TEAM OPERATIONS
// ============================================================================

export interface SupportTeamRecord {
  teamId: string;
  name: string;
  description: string;
  specializedCategories: SupportCaseCategory[];
  memberAgentUids: string[];
  leadAgentUid: string | null;
  isRestrictedAccessTeam: boolean;
  maxConcurrentCasesPerAgent: number;
  active: boolean;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface CaseAssignmentHistoryRecord {
  assignmentId: string;
  caseId: string;
  previousTeamId: string | null;
  newTeamId: string;
  previousAgentUid: string | null;
  newAgentUid: string | null;
  assignedByUid: string;
  assignmentMode: 'MANUAL' | 'REASSIGNMENT' | 'AUTO_QUEUE_ROUTING' | 'ESCALATION';
  reason: string;
  timestampIso: string;
}

// ============================================================================
// 5. SERVICE-LEVEL AGREEMENTS (SLA)
// ============================================================================

export interface BusinessHoursCalendarConfig {
  timezone: string;
  workingDaysOfWeek: number[]; // 0=Sun .. 6=Sat (Iran default: [6, 0, 1, 2, 3, 4])
  startHourUtc: number;
  endHourUtc: number;
  holidaysIsoDates: string[]; // YYYY-MM-DD
  countOnlyBusinessHours: boolean;
}

export interface SlaPolicyRecord {
  policyId: string;
  policyVersion: string;
  name: string;
  priorityTargetsMinutes: Record<
    SupportCasePriority,
    {
      firstResponseMinutes: number;
      resolutionMinutes: number;
      escalationThresholdMinutes: number;
    }
  >;
  categoryOverridesMinutes: Partial<
    Record<
      SupportCaseCategory,
      Partial<
        Record<
          SupportCasePriority,
          {
            firstResponseMinutes: number;
            resolutionMinutes: number;
          }
        >
      >
    >
  >;
  warningThresholdPercent: number; // e.g., 80
  pauseOnStatuses: SupportCaseStatus[]; // e.g., ['WAITING_FOR_CUSTOMER']
  calendar: BusinessHoursCalendarConfig;
  active: boolean;
  updatedByUid: string;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface SlaPauseIntervalRecord {
  pausedAtIso: string;
  resumedAtIso: string | null;
  reasonStatus: SupportCaseStatus;
  durationMs: number;
}

export interface SlaExecutionState {
  policyId: string;
  policyVersion: string;
  firstResponseTargetMinutes: number;
  resolutionTargetMinutes: number;
  firstResponseDeadlineIso: string;
  resolutionDeadlineIso: string;
  firstRespondedAtIso: string | null;
  resolvedAtIso: string | null;
  isPaused: boolean;
  pausedAtIso: string | null;
  totalPausedDurationMs: number;
  pauseHistory: SlaPauseIntervalRecord[];
  warningTriggered: boolean;
  warningTriggeredAtIso: string | null;
  firstResponseBreached: boolean;
  firstResponseBreachedAtIso: string | null;
  resolutionBreached: boolean;
  resolutionBreachedAtIso: string | null;
  lastEvaluatedAtIso: string;
}

// ============================================================================
// 6. CUSTOMER COMMUNICATION & INTERNAL NOTES
// ============================================================================

export interface CaseMessageRecord {
  messageId: string;
  caseId: string;
  authorUid: string;
  authorRole: 'CUSTOMER' | 'SUPPORT_AGENT' | 'ADMIN' | 'SYSTEM';
  visibility: 'CUSTOMER_VISIBLE';
  body: string;
  templateIdUsed: string | null;
  attachmentIds: string[];
  deliveryChannels: NotificationChannel[];
  deliveryRefId: string | null;
  readByRequesterAtIso: string | null;
  readByAgentAtIso: string | null;
  createdAtIso: string;
}

export interface CaseInternalNoteRecord {
  noteId: string;
  caseId: string;
  authorAgentUid: string;
  visibility: 'INTERNAL_STAFF_ONLY';
  body: string;
  attachmentIds: string[];
  mentionedAgentUids: string[];
  createdAtIso: string;
}

export interface SupportResponseTemplateRecord {
  templateId: string;
  name: string;
  category: SupportCaseCategory;
  subjectTemplate: string;
  bodyTemplate: string;
  placeholders: string[];
  active: boolean;
  updatedByUid: string;
  updatedAtIso: string;
}

// ============================================================================
// 7. COMPLAINT & ESCALATION MANAGEMENT
// ============================================================================

export type ComplaintSeverity = 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';

export type ComplaintStatus =
  | 'SUBMITTED'
  | 'UNDER_INVESTIGATION'
  | 'ESCALATED'
  | 'DECISION_RECORDED'
  | 'APPEAL_SUBMITTED'
  | 'CLOSED';

export type ComplaintDecisionOutcome =
  | 'PENDING'
  | 'UPHELD'
  | 'PARTIALLY_UPHELD'
  | 'UNSUBSTANTIATED'
  | 'REFERRED_TO_AUTHORITATIVE_DOMAIN';

export interface AuthoritativeDomainReferralReference {
  referralId: string;
  targetDomain:
    | 'PROFESSIONAL_VERIFICATION_AND_REPUTATION'
    | 'PROPERTY_TRANSACTIONS_AND_ESCROW'
    | 'LISTING_MODERATION'
    | 'LEGAL_AND_COMPLIANCE';
  targetEntityId: string;
  recommendedActionSummary: string;
  referredByUid: string;
  referredAtIso: string;
}

export interface SupportComplaintRecord {
  complaintId: string;
  caseId: string;
  complainantUid: string;
  category: SupportCaseCategory;
  subcategory: string;
  severity: ComplaintSeverity;
  status: ComplaintStatus;
  subject: string;
  description: string;
  relatedEntities: CaseRelatedEntityReferences;
  evidenceAttachmentIds: string[];
  assignedInvestigatorUid: string | null;
  decisionOutcome: ComplaintDecisionOutcome;
  decisionRationale: string | null;
  resolutionActions: string[];
  authoritativeDomainReferrals: AuthoritativeDomainReferralReference[];
  appealReference: {
    appealedAtIso: string;
    appealReason: string;
    appealStatus: 'PENDING_REVIEW' | 'UPHELD' | 'DENIED';
    reviewedByUid: string | null;
    reviewedAtIso: string | null;
  } | null;
  history: Array<{
    eventId: string;
    actorUid: string;
    action: string;
    details: string;
    timestampIso: string;
  }>;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface CaseEscalationRecord {
  escalationId: string;
  caseId: string;
  escalatedByUid: string;
  reason: 'SLA_BREACH' | 'CUSTOMER_COMPLAINT_SEVERITY' | 'COMPLEX_DOMAIN_ISSUE' | 'SECURITY_OR_PRIVACY_RISK' | 'MANUAL_AGENT_ESCALATION';
  fromTeamId: string | null;
  toTeamId: string;
  targetAgentUid: string | null;
  notes: string;
  resolvedAtIso: string | null;
  createdAtIso: string;
}

// ============================================================================
// 8. CASE EVIDENCE & ATTACHMENTS (EMPLOYEE 63 INTEGRATION)
// ============================================================================

export type CaseEvidenceClassification =
  | 'CUSTOMER_UPLOAD'
  | 'AGENT_ATTACHMENT'
  | 'RESTRICTED_INVESTIGATION_EVIDENCE'
  | 'LEGAL_COMPLIANCE_ARTIFACT';

export interface CaseEvidenceAttachmentRecord {
  attachmentId: string;
  caseId: string;
  documentId: string;
  versionId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  classification: CaseEvidenceClassification;
  uploadedByUid: string;
  restrictedToStaffOnly: boolean;
  retentionPolicyTag: 'STANDARD_SUPPORT_1Y' | 'COMPLIANCE_HOLD_5Y' | 'PRIVACY_RESTRICTED';
  createdAtIso: string;
}

// ============================================================================
// 2 & 15. CORE SUPPORT CASE RECORD & PUBLIC/CUSTOMER PROJECTION
// ============================================================================

export interface CaseResolutionRecord {
  resolvedByUid: string;
  resolutionCategory:
    | 'FIXED_OR_COMPLETED'
    | 'GUIDANCE_PROVIDED'
    | 'REFERRED_TO_DOMAIN_TEAM'
    | 'DUPLICATE_CASE'
    | 'CANNOT_REPRODUCE'
    | 'POLICY_DECLINED';
  resolutionSummary: string;
  resolvedAtIso: string;
}

export interface SupportCaseRecord {
  caseId: string;
  caseNumber: string; // e.g., "CS-2026-10001"
  requesterUid: string;
  requesterDisplayName: string;
  participants: CaseParticipantReference[];
  category: SupportCaseCategory;
  subcategory: string;
  subject: string;
  structuredDescription: {
    summary: string;
    stepsOrContext?: string;
    expectedOutcome?: string;
  };
  relatedEntities: CaseRelatedEntityReferences;
  priority: SupportCasePriority;
  status: SupportCaseStatus;
  isRestrictedSensitiveCase: boolean;
  assignedTeamId: string | null;
  assignedAgentUid: string | null;
  sla: SlaExecutionState;
  resolution: CaseResolutionRecord | null;
  closureReason: string | null;
  closedByUid: string | null;
  closedAtIso: string | null;
  reopenCount: number;
  lastCustomerMessageAtIso: string | null;
  lastAgentResponseAtIso: string | null;
  linkedComplaintId: string | null;
  satisfactionSubmitted: boolean;
  retentionExpiresAtIso: string;
  revision: number;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface CustomerFacingCaseView {
  caseId: string;
  caseNumber: string;
  requesterUid: string;
  participants: CaseParticipantReference[];
  category: SupportCaseCategory;
  subcategory: string;
  subject: string;
  structuredDescription: SupportCaseRecord['structuredDescription'];
  relatedEntities: CaseRelatedEntityReferences;
  priority: SupportCasePriority;
  status: SupportCaseStatus;
  assignedTeamId: string | null;
  firstResponseDeadlineIso: string;
  resolutionDeadlineIso: string;
  resolution: CaseResolutionRecord | null;
  closureReason: string | null;
  closedAtIso: string | null;
  reopenCount: number;
  satisfactionSubmitted: boolean;
  revision: number;
  createdAtIso: string;
  updatedAtIso: string;
}

// ============================================================================
// 11. KNOWLEDGE BASE INTEGRATION
// ============================================================================

export type KnowledgeArticlePublicationStatus =
  | 'DRAFT'
  | 'PUBLISHED'
  | 'ARCHIVED'
  | 'INTERNAL_RESTRICTED';

export interface KnowledgeBaseArticleRecord {
  articleId: string;
  slug: string;
  title: string;
  summary: string;
  contentMarkdown: string;
  category: SupportCaseCategory;
  relatedCategories: SupportCaseCategory[];
  tags: string[];
  version: number;
  publicationStatus: KnowledgeArticlePublicationStatus;
  helpfulCount: number;
  notHelpfulCount: number;
  authorUid: string;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface KnowledgeArticleFeedbackRecord {
  feedbackId: string;
  articleId: string;
  userUid: string;
  helpful: boolean;
  comment: string | null;
  createdAtIso: string;
}

// ============================================================================
// 12. SUPPORT ANALYTICS & 13. CUSTOMER SATISFACTION (CSAT)
// ============================================================================

export interface CaseSatisfactionFeedbackRecord {
  feedbackId: string;
  caseId: string;
  requesterUid: string;
  overallScore: 1 | 2 | 3 | 4 | 5;
  categories: {
    timeliness: 1 | 2 | 3 | 4 | 5;
    clarityAndHelpfulness: 1 | 2 | 3 | 4 | 5;
    resolutionQuality: 1 | 2 | 3 | 4 | 5;
  };
  comment: string;
  revision: number;
  submittedAtIso: string;
  updatedAtIso: string;
}

export interface SupportOperationalMetricsSummary {
  generatedAtIso: string;
  openCaseCount: number;
  unassignedCaseCount: number;
  casesByCategory: Record<SupportCaseCategory, number>;
  casesByPriority: Record<SupportCasePriority, number>;
  casesByStatus: Record<SupportCaseStatus, number>;
  averageFirstResponseMinutes: number | null;
  averageResolutionMinutes: number | null;
  slaCompliancePercent: number;
  slaFirstResponseBreachCount: number;
  slaResolutionBreachCount: number;
  escalationRatePercent: number;
  reopenedCaseRatePercent: number;
  agentWorkload: Record<string, { assignedActiveCount: number; resolvedCount: number }>;
  teamWorkload: Record<string, { assignedActiveCount: number; unassignedQueueCount: number }>;
  customerSatisfaction: {
    totalResponses: number;
    averageOverallScore: number | null;
  };
}

// ============================================================================
// 16. EVENTS, BACKGROUND PROCESSING & EXTERNAL ADAPTERS
// ============================================================================

export type CustomerSupportDomainEventType =
  | 'support.case.submitted'
  | 'support.case.assigned'
  | 'support.case.reassigned'
  | 'support.case.customer_response'
  | 'support.case.status_changed'
  | 'support.case.sla_warning'
  | 'support.case.sla_breach'
  | 'support.case.escalated'
  | 'support.case.resolved'
  | 'support.case.closed'
  | 'support.case.reopened'
  | 'support.case.satisfaction_submitted'
  | 'support.complaint.updated';

export interface CustomerSupportDomainEvent {
  eventId: string;
  eventType: CustomerSupportDomainEventType;
  actorUid: string;
  caseId: string;
  correlationId: string;
  payload: Record<string, unknown>;
  occurredAtIso: string;
}

export interface SlaMonitorJobExecutionResult {
  jobExecutionKey: string;
  replayed: boolean;
  evaluatedCasesCount: number;
  warningsTriggeredCaseIds: string[];
  firstResponseBreachedCaseIds: string[];
  resolutionBreachedCaseIds: string[];
  autoEscalatedCaseIds: string[];
  executedAtIso: string;
}

export interface DocumentManagementAdapter {
  verifyDocumentAccess(params: {
    documentId: string;
    versionId?: string;
    requesterUid: string;
    isStaffOrAdmin: boolean;
  }): Promise<{
    exists: boolean;
    authorized: boolean;
    fileName?: string;
    mimeType?: string;
    sizeBytes?: number;
    ownerUid?: string;
  }>;
}

export interface SupportNotificationAdapter {
  sendCaseNotification(params: {
    recipientUid: string;
    caseId: string;
    caseNumber: string;
    eventType: CustomerSupportDomainEventType;
    subject: string;
    summary: string;
    channels: NotificationChannel[];
    idempotencyKey: string;
  }): Promise<{ delivered: boolean; notificationRefId: string | null }>;
}

export interface CustomerSupportModuleDependencies {
  tokenVerifier: FirebaseTokenVerifierAdapter;
  adminStore: DelegatedAdminStoreAdapter;
  txRunner: TransactionRunnerAdapter;
  auditSink: AuditEventSink;
  idempotencyStore?: IdempotencyStoreAdapter;
  primaryAdminEmails?: string[];
  documentAdapter?: DocumentManagementAdapter;
  notificationAdapter?: SupportNotificationAdapter;
  onDomainEvent?: (event: CustomerSupportDomainEvent) => Promise<void> | void;
}
