/**
 * Employee 66 — Real Estate Customer Support, Case Management & Service Operations Service
 * (`server/modules/customer-support/service.ts`)
 *
 * Exclusive ownership: `server/modules/customer-support/`
 */

import crypto from 'node:crypto';
import {
  authorizePrincipal,
  CoreApiError,
  createStructuredAuditEvent,
  decodePaginationCursor,
  encodePaginationCursor,
  normalizePaginationParams,
  sanitizeTextInput,
  verifyAdminOrDelegatedPrincipal,
} from '../core';
import type { AuthenticatedPrincipal, TransactionContextLike } from '../core/types';
import { CustomerSupportRepository } from './repository';
import type {
  AuthoritativeDomainReferralReference,
  CaseAssignmentHistoryRecord,
  CaseEscalationRecord,
  CaseEvidenceAttachmentRecord,
  CaseInternalNoteRecord,
  CaseMessageRecord,
  CaseResolutionRecord,
  CaseSatisfactionFeedbackRecord,
  CaseStatusTransitionRecord,
  ComplaintDecisionOutcome,
  CustomerFacingCaseView,
  CustomerSupportDomainEvent,
  CustomerSupportDomainEventType,
  CustomerSupportModuleDependencies,
  DocumentManagementAdapter,
  KnowledgeArticleFeedbackRecord,
  KnowledgeArticlePublicationStatus,
  KnowledgeBaseArticleRecord,
  SlaMonitorJobExecutionResult,
  SlaPolicyRecord,
  SupportCaseCategory,
  SupportCasePriority,
  SupportCaseRecord,
  SupportCaseStatus,
  SupportComplaintRecord,
  SupportNotificationAdapter,
  SupportOperationalMetricsSummary,
  SupportResponseTemplateRecord,
  SupportTeamRecord,
} from './types';
import {
  ALLOWED_CASE_CATEGORIES,
  ALLOWED_CASE_PRIORITIES,
  ALLOWED_CASE_STATUSES,
  applySlaPauseOrResumeOnStatusChange,
  assertPlainObject,
  computeInitialSlaExecutionState,
  rejectUnknownOrMassAssignedKeys,
  RESTRICTED_SENSITIVE_CATEGORIES,
  sanitizeAndMinimizeSupportText,
  validateAttachmentClassification,
  validateCaseStateTransition,
  validateComplaintSeverity,
  validateCreateCaseInput,
  validateRelatedEntityReferences,
  validateSafeId,
} from './validation';

const DEFAULT_CASE_RETENTION_DAYS = 365;

export class CustomerSupportService {
  private readonly repo: CustomerSupportRepository;
  private readonly deps: CustomerSupportModuleDependencies;
  private readonly documentAdapter: DocumentManagementAdapter;
  private readonly notificationAdapter: SupportNotificationAdapter;
  private caseSequenceCounter = 10000;

  constructor(deps: CustomerSupportModuleDependencies) {
    this.deps = deps;
    this.repo = new CustomerSupportRepository(deps.txRunner);
    this.documentAdapter = deps.documentAdapter ?? {
      async verifyDocumentAccess(params) {
        return {
          exists: true,
          authorized: true,
          fileName: `doc_${params.documentId}.pdf`,
          mimeType: 'application/pdf',
          sizeBytes: 24_576,
          ownerUid: params.requesterUid,
        };
      },
    };
    this.notificationAdapter = deps.notificationAdapter ?? {
      async sendCaseNotification(params) {
        return {
          delivered: true,
          notificationRefId: `notif_${params.caseId}_${params.idempotencyKey.slice(0, 12)}`,
        };
      },
    };
  }

  private async emitDomainEvent(
    eventType: CustomerSupportDomainEventType,
    actorUid: string,
    caseId: string,
    correlationId: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    if (!this.deps.onDomainEvent) return;
    const evt: CustomerSupportDomainEvent = {
      eventId: `cs_evt_${crypto.randomUUID()}`,
      eventType,
      actorUid,
      caseId,
      correlationId,
      payload,
      occurredAtIso: new Date().toISOString(),
    };
    await this.deps.onDomainEvent(evt);
  }

  private buildDefaultSlaPolicy(nowIso: string): SlaPolicyRecord {
    return {
      policyId: 'sla_policy_default',
      policyVersion: 'v2026.1',
      name: 'استاندارد عملیات پشتیبانی رادار تهران',
      priorityTargetsMinutes: {
        CRITICAL: { firstResponseMinutes: 15, resolutionMinutes: 120, escalationThresholdMinutes: 30 },
        URGENT: { firstResponseMinutes: 30, resolutionMinutes: 240, escalationThresholdMinutes: 60 },
        HIGH: { firstResponseMinutes: 60, resolutionMinutes: 480, escalationThresholdMinutes: 120 },
        MEDIUM: { firstResponseMinutes: 240, resolutionMinutes: 1440, escalationThresholdMinutes: 480 },
        LOW: { firstResponseMinutes: 720, resolutionMinutes: 2880, escalationThresholdMinutes: 1440 },
      },
      categoryOverridesMinutes: {
        ABUSE_AND_SAFETY_REPORTS: {
          HIGH: { firstResponseMinutes: 30, resolutionMinutes: 240 },
        },
        PRIVACY_AND_DATA_RIGHTS: {
          MEDIUM: { firstResponseMinutes: 120, resolutionMinutes: 1440 },
        },
      },
      warningThresholdPercent: 80,
      pauseOnStatuses: ['WAITING_FOR_CUSTOMER'],
      calendar: {
        timezone: 'Asia/Tehran',
        workingDaysOfWeek: [6, 0, 1, 2, 3, 4],
        startHourUtc: 5,
        endHourUtc: 17,
        holidaysIsoDates: [],
        countOnlyBusinessHours: false,
      },
      active: true,
      updatedByUid: 'system',
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
    };
  }

  private buildDefaultTeams(nowIso: string): SupportTeamRecord[] {
    return [
      {
        teamId: 'team_general_support',
        name: 'پشتیبانی عمومی و مشتریان',
        description: 'رسیدگی به درخواست‌های عمومی، حساب کاربری، جستجو و آگهی‌ها',
        specializedCategories: [
          'GENERAL_CUSTOMER_INQUIRIES',
          'ACCOUNT_AND_PROFILE',
          'PROPERTY_AND_LISTING',
          'SEARCH_AND_VALUATION',
          'BUYER_AND_SELLER_SUPPORT',
          'PLATFORM_TECHNICAL_ISSUES',
        ],
        memberAgentUids: ['agent_general_1', 'agent_general_2'],
        leadAgentUid: 'agent_general_1',
        isRestrictedAccessTeam: false,
        maxConcurrentCasesPerAgent: 15,
        active: true,
        createdAtIso: nowIso,
        updatedAtIso: nowIso,
      },
      {
        teamId: 'team_real_estate_ops',
        name: 'عملیات معاملات، اجاره و مشاورین املاک',
        description: 'پشتیبانی تخصصی معاملات، اجاره‌نامه، مشاورین و مدیریت ملک',
        specializedCategories: [
          'RENTAL_AND_TENANCY_SUPPORT',
          'BROKERAGE_AND_AGENT_SUPPORT',
          'PROPERTY_MANAGEMENT_SUPPORT',
          'PAYMENT_AND_TRANSACTION_ASSISTANCE',
          'DOCUMENT_AND_VERIFICATION_ASSISTANCE',
        ],
        memberAgentUids: ['agent_ops_1', 'agent_ops_2'],
        leadAgentUid: 'agent_ops_1',
        isRestrictedAccessTeam: true,
        maxConcurrentCasesPerAgent: 10,
        active: true,
        createdAtIso: nowIso,
        updatedAtIso: nowIso,
      },
      {
        teamId: 'team_trust_privacy_legal',
        name: 'امنیت، حریم خصوصی و رسیدگی به شکایات حساس',
        description: 'تیم محدود ویژه گزارش‌های تخلف، امنیت، حریم خصوصی و حقوق داده',
        specializedCategories: ['PRIVACY_AND_DATA_RIGHTS', 'ABUSE_AND_SAFETY_REPORTS'],
        memberAgentUids: ['agent_trust_1'],
        leadAgentUid: 'agent_trust_1',
        isRestrictedAccessTeam: true,
        maxConcurrentCasesPerAgent: 8,
        active: true,
        createdAtIso: nowIso,
        updatedAtIso: nowIso,
      },
    ];
  }

  private async ensureBaselineConfigInTx(
    tx: TransactionContextLike,
    nowIso: string,
  ): Promise<{ slaPolicy: SlaPolicyRecord; teams: SupportTeamRecord[] }> {
    let slaPolicy = await this.repo.getActiveSlaPolicyInTx(tx);
    if (!slaPolicy) {
      slaPolicy = this.buildDefaultSlaPolicy(nowIso);
      this.repo.setActiveSlaPolicyInTx(tx, slaPolicy);
    }

    let teams = await this.repo.listTeamsInTx(tx);
    if (teams.length === 0) {
      const defaults = this.buildDefaultTeams(nowIso);
      for (const t of defaults) {
        await this.repo.upsertTeamInTx(tx, t);
      }
      teams = defaults;
    }

    return { slaPolicy, teams };
  }

  private async assertAuthenticatedUser(
    principal: AuthenticatedPrincipal | null | undefined,
  ): Promise<void> {
    const decision = await authorizePrincipal(
      principal,
      { minimumRole: 'verified_user' },
      this.deps.adminStore,
      this.deps.primaryAdminEmails,
    );
    if (!decision.allowed) {
      throw new CoreApiError(
        decision.status === 401 ? 'UNAUTHENTICATED' : 'FORBIDDEN',
        decision.status,
        decision.reason ?? 'Authentication required.',
      );
    }
  }

  private async isPrincipalAdmin(
    principal: AuthenticatedPrincipal | null | undefined,
  ): Promise<boolean> {
    const decision = await verifyAdminOrDelegatedPrincipal(principal, this.deps.adminStore, {
      primaryAdminEmails: this.deps.primaryAdminEmails,
    });
    return decision.allowed;
  }

  private async resolveStaffContextInTx(
    tx: TransactionContextLike,
    principal: AuthenticatedPrincipal,
    nowIso: string,
  ): Promise<{
    isAdmin: boolean;
    isSupportStaff: boolean;
    memberTeams: SupportTeamRecord[];
    hasRestrictedAccess: boolean;
    actorRole: 'CUSTOMER' | 'SUPPORT_AGENT' | 'SUPPORT_LEAD' | 'ADMIN';
  }> {
    const isAdmin = await this.isPrincipalAdmin(principal);
    const { teams } = await this.ensureBaselineConfigInTx(tx, nowIso);
    const memberTeams = teams.filter(
      (t) => t.active && (t.memberAgentUids.includes(principal.uid) || t.leadAgentUid === principal.uid),
    );
    const isLead = memberTeams.some((t) => t.leadAgentUid === principal.uid);
    const isSupportStaff = isAdmin || memberTeams.length > 0;
    const hasRestrictedAccess =
      isAdmin || memberTeams.some((t) => t.isRestrictedAccessTeam);

    const actorRole = isAdmin
      ? 'ADMIN'
      : isLead
        ? 'SUPPORT_LEAD'
        : memberTeams.length > 0
          ? 'SUPPORT_AGENT'
          : 'CUSTOMER';

    return {
      isAdmin,
      isSupportStaff,
      memberTeams,
      hasRestrictedAccess,
      actorRole,
    };
  }

  private assertCustomerCanAccessCase(
    principal: AuthenticatedPrincipal,
    caseRecord: SupportCaseRecord,
  ): void {
    const isRequester = caseRecord.requesterUid === principal.uid;
    const isParticipant = caseRecord.participants.some((p) => p.uid === principal.uid);
    if (!isRequester && !isParticipant) {
      throw new CoreApiError(
        'FORBIDDEN',
        403,
        'Access denied: you are not an authorized participant of this support case.',
      );
    }
  }

  private assertStaffCanAccessCase(
    staffCtx: {
      isAdmin: boolean;
      isSupportStaff: boolean;
      memberTeams: SupportTeamRecord[];
      hasRestrictedAccess: boolean;
    },
    principalUid: string,
    caseRecord: SupportCaseRecord,
  ): void {
    if (!staffCtx.isSupportStaff) {
      throw new CoreApiError('FORBIDDEN', 403, 'Support staff or administrative privileges required.');
    }
    if (staffCtx.isAdmin) return;

    if (
      caseRecord.isRestrictedSensitiveCase &&
      !staffCtx.hasRestrictedAccess &&
      caseRecord.assignedAgentUid !== principalUid
    ) {
      throw new CoreApiError(
        'FORBIDDEN',
        403,
        'Restricted sensitive support cases require specialized team authorization.',
      );
    }

    if (caseRecord.assignedTeamId) {
      const inAssignedTeam = staffCtx.memberTeams.some((t) => t.teamId === caseRecord.assignedTeamId);
      if (!inAssignedTeam && caseRecord.assignedAgentUid !== principalUid && !staffCtx.hasRestrictedAccess) {
        throw new CoreApiError(
          'FORBIDDEN',
          403,
          `Access denied: case is assigned to team "${caseRecord.assignedTeamId}".`,
        );
      }
    }
  }

  public projectCustomerFacingCase(record: SupportCaseRecord): CustomerFacingCaseView {
    return {
      caseId: record.caseId,
      caseNumber: record.caseNumber,
      requesterUid: record.requesterUid,
      participants: record.participants,
      category: record.category,
      subcategory: record.subcategory,
      subject: record.subject,
      structuredDescription: record.structuredDescription,
      relatedEntities: record.relatedEntities,
      priority: record.priority,
      status: record.status,
      assignedTeamId: record.assignedTeamId,
      firstResponseDeadlineIso: record.sla.firstResponseDeadlineIso,
      resolutionDeadlineIso: record.sla.resolutionDeadlineIso,
      resolution: record.resolution,
      closureReason: record.closureReason,
      closedAtIso: record.closedAtIso,
      reopenCount: record.reopenCount,
      satisfactionSubmitted: record.satisfactionSubmitted,
      revision: record.revision,
      createdAtIso: record.createdAtIso,
      updatedAtIso: record.updatedAtIso,
    };
  }

  // ==========================================================================
  // 2, 3 & 9. CREATE CASE, CUSTOMER PORTAL RETRIEVAL & STATE TRANSITIONS
  // ==========================================================================

  public async createSupportCase(
    principal: AuthenticatedPrincipal,
    rawInput: unknown,
    correlationId = 'cs-create-case',
  ): Promise<CustomerFacingCaseView> {
    await this.assertAuthenticatedUser(principal);
    const validated = validateCreateCaseInput(rawInput);
    const now = new Date();
    const nowIso = now.toISOString();

    const created = await this.repo.runInTransaction('cs.createSupportCase', async (tx) => {
      const { slaPolicy, teams } = await this.ensureBaselineConfigInTx(tx, nowIso);

      this.caseSequenceCounter += 1;
      const caseId = `case_${crypto.randomUUID().slice(0, 12)}`;
      const caseNumber = `CS-${now.getUTCFullYear()}-${this.caseSequenceCounter}`;

      const matchingTeam =
        teams.find((t) => t.active && t.specializedCategories.includes(validated.category)) ??
        teams[0] ??
        null;

      const isRestrictedSensitiveCase = RESTRICTED_SENSITIVE_CATEGORIES.has(validated.category);
      const initialStatus: SupportCaseStatus = validated.submitImmediately ? 'SUBMITTED' : 'DRAFT';
      const sla = computeInitialSlaExecutionState(
        slaPolicy,
        validated.category,
        validated.priority,
        nowIso,
      );

      const retentionExpiresAtIso = new Date(
        now.getTime() + DEFAULT_CASE_RETENTION_DAYS * 86_400_000,
      ).toISOString();

      const caseRecord: SupportCaseRecord = {
        caseId,
        caseNumber,
        requesterUid: principal.uid,
        requesterDisplayName: principal.email ? principal.email.split('@')[0] : principal.uid,
        participants: [
          {
            uid: principal.uid,
            role: 'REQUESTER',
            addedByUid: principal.uid,
            addedAtIso: nowIso,
          },
        ],
        category: validated.category,
        subcategory: validated.subcategory,
        subject: validated.subject,
        structuredDescription: validated.structuredDescription,
        relatedEntities: validated.relatedEntities,
        priority: validated.priority,
        status: initialStatus,
        isRestrictedSensitiveCase,
        assignedTeamId: matchingTeam ? matchingTeam.teamId : null,
        assignedAgentUid: null,
        sla,
        resolution: null,
        closureReason: null,
        closedByUid: null,
        closedAtIso: null,
        reopenCount: 0,
        lastCustomerMessageAtIso: nowIso,
        lastAgentResponseAtIso: null,
        linkedComplaintId: null,
        satisfactionSubmitted: false,
        retentionExpiresAtIso,
        revision: 1,
        createdAtIso: nowIso,
        updatedAtIso: nowIso,
      };

      await this.repo.upsertCaseInTx(tx, caseRecord);

      const transition: CaseStatusTransitionRecord = {
        transitionId: `tr_${crypto.randomUUID().slice(0, 12)}`,
        caseId,
        fromStatus: null,
        toStatus: initialStatus,
        actorUid: principal.uid,
        actorRole: 'CUSTOMER',
        reason: validated.submitImmediately ? 'Initial case submission' : 'Saved as draft',
        timestampIso: nowIso,
      };
      await this.repo.appendStatusTransitionInTx(tx, transition);

      return caseRecord;
    });

    if (created.status === 'SUBMITTED') {
      await this.notificationAdapter.sendCaseNotification({
        recipientUid: principal.uid,
        caseId: created.caseId,
        caseNumber: created.caseNumber,
        eventType: 'support.case.submitted',
        subject: `ثبت پرونده پشتیبانی ${created.caseNumber}`,
        summary: created.subject,
        channels: ['IN_APP', 'EMAIL'],
        idempotencyKey: `cs_submit_${created.caseId}`,
      });

      await this.emitDomainEvent(
        'support.case.submitted',
        principal.uid,
        created.caseId,
        correlationId,
        {
          caseNumber: created.caseNumber,
          category: created.category,
          priority: created.priority,
          assignedTeamId: created.assignedTeamId,
        },
      );
    }

    return this.projectCustomerFacingCase(created);
  }

  public async listCustomerCases(
    principal: AuthenticatedPrincipal,
    query: {
      limit?: unknown;
      cursor?: unknown;
      status?: SupportCaseStatus;
      category?: SupportCaseCategory;
    } = {},
  ): Promise<{
    items: CustomerFacingCaseView[];
    nextCursor: string | null;
    hasMore: boolean;
    totalCount: number;
  }> {
    await this.assertAuthenticatedUser(principal);
    const pagination = normalizePaginationParams(query);

    const all = await this.repo.runInTransaction('cs.listCustomerCases', (tx) =>
      this.repo.listCasesByParticipantInTx(tx, principal.uid),
    );

    let filtered = all;
    if (query.status) {
      filtered = filtered.filter((c) => c.status === query.status);
    }
    if (query.category) {
      filtered = filtered.filter((c) => c.category === query.category);
    }

    let startIndex = 0;
    if (pagination.cursor) {
      const decoded = decodePaginationCursor(pagination.cursor);
      const idx = filtered.findIndex((c) => c.caseId === decoded.docId);
      if (idx >= 0) startIndex = idx + 1;
    }

    const slice = filtered.slice(startIndex, startIndex + pagination.limit);
    const hasMore = startIndex + pagination.limit < filtered.length;
    const last = slice[slice.length - 1];
    const nextCursor =
      hasMore && last
        ? encodePaginationCursor({
            sortValue: last.updatedAtIso,
            docId: last.caseId,
            direction: 'desc',
          })
        : null;

    return {
      items: slice.map((c) => this.projectCustomerFacingCase(c)),
      nextCursor,
      hasMore,
      totalCount: filtered.length,
    };
  }

  public async getCustomerCaseDetails(
    principal: AuthenticatedPrincipal,
    caseId: string,
  ): Promise<{
    case: CustomerFacingCaseView;
    messages: CaseMessageRecord[];
    attachments: CaseEvidenceAttachmentRecord[];
    statusHistory: CaseStatusTransitionRecord[];
  }> {
    await this.assertAuthenticatedUser(principal);
    const cleanCaseId = validateSafeId(caseId, 'caseId');

    return this.repo.runInTransaction('cs.getCustomerCaseDetails', async (tx) => {
      const record = await this.repo.getCaseInTx(tx, cleanCaseId);
      if (!record) {
        throw new CoreApiError('NOT_FOUND', 404, 'Support case not found.');
      }
      this.assertCustomerCanAccessCase(principal, record);

      const messages = await this.repo.listCustomerVisibleMessagesByCaseInTx(tx, cleanCaseId);
      const allAttachments = await this.repo.listAttachmentsByCaseInTx(tx, cleanCaseId);
      const customerAttachments = allAttachments.filter((a) => !a.restrictedToStaffOnly);
      const statusHistory = await this.repo.listStatusTransitionsByCaseInTx(tx, cleanCaseId);

      return {
        case: this.projectCustomerFacingCase(record),
        messages,
        attachments: customerAttachments,
        statusHistory,
      };
    });
  }

  public async getStaffCaseDetails(
    staffPrincipal: AuthenticatedPrincipal,
    caseId: string,
  ): Promise<{
    case: SupportCaseRecord;
    messages: CaseMessageRecord[];
    internalNotes: CaseInternalNoteRecord[];
    attachments: CaseEvidenceAttachmentRecord[];
    statusHistory: CaseStatusTransitionRecord[];
    assignmentHistory: CaseAssignmentHistoryRecord[];
    escalations: CaseEscalationRecord[];
  }> {
    await this.assertAuthenticatedUser(staffPrincipal);
    const cleanCaseId = validateSafeId(caseId, 'caseId');
    const nowIso = new Date().toISOString();

    return this.repo.runInTransaction('cs.getStaffCaseDetails', async (tx) => {
      const staffCtx = await this.resolveStaffContextInTx(tx, staffPrincipal, nowIso);
      const record = await this.repo.getCaseInTx(tx, cleanCaseId);
      if (!record) {
        throw new CoreApiError('NOT_FOUND', 404, 'Support case not found.');
      }
      this.assertStaffCanAccessCase(staffCtx, staffPrincipal.uid, record);

      const [
        messages,
        internalNotes,
        attachments,
        statusHistory,
        assignmentHistory,
        escalations,
      ] = await Promise.all([
        this.repo.listCustomerVisibleMessagesByCaseInTx(tx, cleanCaseId),
        this.repo.listInternalNotesByCaseInTx(tx, cleanCaseId),
        this.repo.listAttachmentsByCaseInTx(tx, cleanCaseId),
        this.repo.listStatusTransitionsByCaseInTx(tx, cleanCaseId),
        this.repo.listAssignmentHistoryByCaseInTx(tx, cleanCaseId),
        this.repo.listEscalationsByCaseInTx(tx, cleanCaseId),
      ]);

      return {
        case: record,
        messages,
        internalNotes,
        attachments,
        statusHistory,
        assignmentHistory,
        escalations,
      };
    });
  }

  public async transitionCaseStatus(
    principal: AuthenticatedPrincipal,
    caseId: string,
    rawInput: unknown,
    correlationId = 'cs-status-transition',
  ): Promise<SupportCaseRecord> {
    await this.assertAuthenticatedUser(principal);
    const cleanCaseId = validateSafeId(caseId, 'caseId');
    const obj = assertPlainObject(rawInput, 'Status transition');
    rejectUnknownOrMassAssignedKeys(
      obj,
      new Set([
        'toStatus',
        'reason',
        'resolutionCategory',
        'resolutionSummary',
        'closureReason',
        'expectedRevision',
      ]),
    );

    if (typeof obj.toStatus !== 'string' || !ALLOWED_CASE_STATUSES.includes(obj.toStatus as SupportCaseStatus)) {
      throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid target case status.');
    }
    const toStatus = obj.toStatus as SupportCaseStatus;
    const reason =
      typeof obj.reason === 'string' ? sanitizeAndMinimizeSupportText(obj.reason, 400) : '';
    const closureReason =
      typeof obj.closureReason === 'string'
        ? sanitizeAndMinimizeSupportText(obj.closureReason, 400)
        : null;

    let resolution: CaseResolutionRecord | null = null;
    if (toStatus === 'RESOLVED') {
      const allowedResCats: CaseResolutionRecord['resolutionCategory'][] = [
        'FIXED_OR_COMPLETED',
        'GUIDANCE_PROVIDED',
        'REFERRED_TO_DOMAIN_TEAM',
        'DUPLICATE_CASE',
        'CANNOT_REPRODUCE',
        'POLICY_DECLINED',
      ];
      const resCat =
        typeof obj.resolutionCategory === 'string' &&
        allowedResCats.includes(obj.resolutionCategory as any)
          ? (obj.resolutionCategory as CaseResolutionRecord['resolutionCategory'])
          : 'FIXED_OR_COMPLETED';
      const resSummary =
        typeof obj.resolutionSummary === 'string'
          ? sanitizeAndMinimizeSupportText(obj.resolutionSummary, 1000)
          : '';
      resolution = {
        resolvedByUid: principal.uid,
        resolutionCategory: resCat,
        resolutionSummary: resSummary,
        resolvedAtIso: new Date().toISOString(),
      };
    }

    const nowIso = new Date().toISOString();

    const { updatedCase, fromStatus, actorRole } = await this.repo.runInTransaction(
      'cs.transitionCaseStatus',
      async (tx) => {
        const { slaPolicy } = await this.ensureBaselineConfigInTx(tx, nowIso);
        const staffCtx = await this.resolveStaffContextInTx(tx, principal, nowIso);
        const record = await this.repo.getCaseInTx(tx, cleanCaseId);
        if (!record) {
          throw new CoreApiError('NOT_FOUND', 404, 'Support case not found.');
        }

        if (staffCtx.isSupportStaff) {
          this.assertStaffCanAccessCase(staffCtx, principal.uid, record);
        } else {
          this.assertCustomerCanAccessCase(principal, record);
        }

        if (obj.expectedRevision !== undefined) {
          if (typeof obj.expectedRevision !== 'number' || obj.expectedRevision !== record.revision) {
            throw new CoreApiError(
              'CONFLICT',
              409,
              `Concurrent modification detected: expected revision ${String(obj.expectedRevision)}, actual is ${record.revision}.`,
            );
          }
        }

        const previousStatus = record.status;
        validateCaseStateTransition({
          fromStatus: previousStatus,
          toStatus,
          actorRole: staffCtx.actorRole,
          resolution,
          closureReason,
          reason,
        });

        record.status = toStatus;
        record.sla = applySlaPauseOrResumeOnStatusChange(
          record.sla,
          toStatus,
          slaPolicy.pauseOnStatuses,
          nowIso,
        );

        if (toStatus === 'RESOLVED' && resolution) {
          record.resolution = resolution;
        }
        if (toStatus === 'CLOSED') {
          record.closureReason = closureReason;
          record.closedByUid = principal.uid;
          record.closedAtIso = nowIso;
        }
        if (toStatus === 'REOPENED') {
          record.reopenCount += 1;
          record.closedAtIso = null;
          record.closedByUid = null;
          record.sla.resolvedAtIso = null;
        }

        record.revision += 1;
        record.updatedAtIso = nowIso;

        await this.repo.upsertCaseInTx(tx, record);

        const transition: CaseStatusTransitionRecord = {
          transitionId: `tr_${crypto.randomUUID().slice(0, 12)}`,
          caseId: cleanCaseId,
          fromStatus: previousStatus,
          toStatus,
          actorUid: principal.uid,
          actorRole: staffCtx.actorRole,
          reason: reason || `Transitioned ${previousStatus} -> ${toStatus}`,
          timestampIso: nowIso,
        };
        await this.repo.appendStatusTransitionInTx(tx, transition);

        return {
          updatedCase: record,
          fromStatus: previousStatus,
          actorRole: staffCtx.actorRole,
        };
      },
    );

    const eventType: CustomerSupportDomainEventType =
      toStatus === 'RESOLVED'
        ? 'support.case.resolved'
        : toStatus === 'CLOSED'
          ? 'support.case.closed'
          : toStatus === 'REOPENED'
            ? 'support.case.reopened'
            : 'support.case.status_changed';

    await this.notificationAdapter.sendCaseNotification({
      recipientUid: updatedCase.requesterUid,
      caseId: updatedCase.caseId,
      caseNumber: updatedCase.caseNumber,
      eventType,
      subject: `به‌روزرسانی وضعیت پرونده ${updatedCase.caseNumber}`,
      summary: `وضعیت پرونده به ${toStatus} تغییر یافت.`,
      channels: ['IN_APP'],
      idempotencyKey: `cs_status_${updatedCase.caseId}_rev${updatedCase.revision}`,
    });

    await this.emitDomainEvent(eventType, principal.uid, updatedCase.caseId, correlationId, {
      fromStatus,
      toStatus,
      actorRole,
      revision: updatedCase.revision,
    });

    return updatedCase;
  }

  // ==========================================================================
  // 4. CASE ASSIGNMENT, TEAM QUEUES & ESCALATION
  // ==========================================================================

  public async assignSupportCase(
    staffPrincipal: AuthenticatedPrincipal,
    caseId: string,
    rawInput: unknown,
    correlationId = 'cs-assign-case',
  ): Promise<SupportCaseRecord> {
    await this.assertAuthenticatedUser(staffPrincipal);
    const cleanCaseId = validateSafeId(caseId, 'caseId');
    const obj = assertPlainObject(rawInput, 'Case assignment');
    rejectUnknownOrMassAssignedKeys(
      obj,
      new Set(['teamId', 'agentUid', 'autoAssign', 'reason', 'expectedRevision']),
    );

    const reason =
      typeof obj.reason === 'string' && sanitizeTextInput(obj.reason)
        ? sanitizeTextInput(obj.reason).slice(0, 300)
        : 'Assigned by support operations';
    const nowIso = new Date().toISOString();

    const { updatedCase, isReassignment } = await this.repo.runInTransaction(
      'cs.assignSupportCase',
      async (tx) => {
        const staffCtx = await this.resolveStaffContextInTx(tx, staffPrincipal, nowIso);
        const record = await this.repo.getCaseInTx(tx, cleanCaseId);
        if (!record) throw new CoreApiError('NOT_FOUND', 404, 'Support case not found.');

        this.assertStaffCanAccessCase(staffCtx, staffPrincipal.uid, record);

        if (record.status === 'CLOSED' || record.status === 'CANCELED') {
          throw new CoreApiError('CONFLICT', 409, 'Closed or canceled cases cannot be assigned.');
        }

        if (obj.expectedRevision !== undefined && obj.expectedRevision !== record.revision) {
          throw new CoreApiError('CONFLICT', 409, 'Assignment conflict: case revision has changed.');
        }

        const targetTeamId =
          typeof obj.teamId === 'string'
            ? validateSafeId(obj.teamId, 'teamId')
            : (record.assignedTeamId ?? 'team_general_support');

        const team = await this.repo.getTeamInTx(tx, targetTeamId);
        if (!team || !team.active) {
          throw new CoreApiError('NOT_FOUND', 404, `Support team "${targetTeamId}" not found or inactive.`);
        }
        if (record.isRestrictedSensitiveCase && !team.isRestrictedAccessTeam) {
          throw new CoreApiError(
            'FORBIDDEN',
            403,
            'Restricted sensitive support cases can only be assigned to authorized restricted-access teams.',
          );
        }

        let targetAgentUid: string | null = null;
        let assignmentMode: CaseAssignmentHistoryRecord['assignmentMode'] = 'MANUAL';

        if (obj.autoAssign === true) {
          assignmentMode = 'AUTO_QUEUE_ROUTING';
          if (team.memberAgentUids.length === 0) {
            throw new CoreApiError('CONFLICT', 409, `Team "${team.teamId}" has no available agents.`);
          }
          // Select least-loaded agent in team
          let bestAgent: string | null = null;
          let minActiveCount = Number.POSITIVE_INFINITY;
          for (const candidateUid of team.memberAgentUids) {
            const agentCases = await this.repo.listCasesByAgentInTx(tx, candidateUid);
            const activeCount = agentCases.filter(
              (c) => c.status !== 'RESOLVED' && c.status !== 'CLOSED' && c.status !== 'CANCELED',
            ).length;
            if (activeCount < team.maxConcurrentCasesPerAgent && activeCount < minActiveCount) {
              minActiveCount = activeCount;
              bestAgent = candidateUid;
            }
          }
          if (!bestAgent) {
            throw new CoreApiError(
              'CONFLICT',
              409,
              `All agents in team "${team.teamId}" have reached their maximum concurrent case workload.`,
            );
          }
          targetAgentUid = bestAgent;
        } else if (obj.agentUid !== undefined && obj.agentUid !== null) {
          targetAgentUid = validateSafeId(obj.agentUid, 'agentUid');
          if (!team.memberAgentUids.includes(targetAgentUid) && team.leadAgentUid !== targetAgentUid) {
            throw new CoreApiError(
              'VALIDATION_FAILED',
              400,
              `Agent "${targetAgentUid}" is not a member of team "${team.teamId}".`,
            );
          }
          const agentCases = await this.repo.listCasesByAgentInTx(tx, targetAgentUid);
          const activeCount = agentCases.filter(
            (c) =>
              c.caseId !== record.caseId &&
              c.status !== 'RESOLVED' &&
              c.status !== 'CLOSED' &&
              c.status !== 'CANCELED',
          ).length;
          if (activeCount >= team.maxConcurrentCasesPerAgent) {
            throw new CoreApiError(
              'CONFLICT',
              409,
              `Agent "${targetAgentUid}" has reached the maximum workload of ${team.maxConcurrentCasesPerAgent} active cases.`,
            );
          }
        }

        const prevTeamId = record.assignedTeamId;
        const prevAgentUid = record.assignedAgentUid;
        const wasAssignedBefore = Boolean(prevAgentUid);
        if (wasAssignedBefore && assignmentMode === 'MANUAL') {
          assignmentMode = 'REASSIGNMENT';
        }

        record.assignedTeamId = team.teamId;
        record.assignedAgentUid = targetAgentUid;

        if (
          targetAgentUid &&
          (record.status === 'SUBMITTED' || record.status === 'OPEN' || record.status === 'REOPENED')
        ) {
          const prevStatus = record.status;
          record.status = 'ASSIGNED';
          await this.repo.appendStatusTransitionInTx(tx, {
            transitionId: `tr_${crypto.randomUUID().slice(0, 12)}`,
            caseId: record.caseId,
            fromStatus: prevStatus,
            toStatus: 'ASSIGNED',
            actorUid: staffPrincipal.uid,
            actorRole: staffCtx.actorRole,
            reason: `Case assigned to ${targetAgentUid}`,
            timestampIso: nowIso,
          });
        }

        record.revision += 1;
        record.updatedAtIso = nowIso;

        await this.repo.upsertCaseInTx(tx, record, prevTeamId, prevAgentUid);

        await this.repo.appendAssignmentHistoryInTx(tx, {
          assignmentId: `asg_${crypto.randomUUID().slice(0, 12)}`,
          caseId: record.caseId,
          previousTeamId: prevTeamId,
          newTeamId: team.teamId,
          previousAgentUid: prevAgentUid,
          newAgentUid: targetAgentUid,
          assignedByUid: staffPrincipal.uid,
          assignmentMode,
          reason,
          timestampIso: nowIso,
        });

        return { updatedCase: record, isReassignment: wasAssignedBefore };
      },
    );

    await this.emitDomainEvent(
      isReassignment ? 'support.case.reassigned' : 'support.case.assigned',
      staffPrincipal.uid,
      updatedCase.caseId,
      correlationId,
      {
        assignedTeamId: updatedCase.assignedTeamId,
        assignedAgentUid: updatedCase.assignedAgentUid,
      },
    );

    return updatedCase;
  }

  public async escalateSupportCase(
    staffPrincipal: AuthenticatedPrincipal,
    caseId: string,
    rawInput: unknown,
    correlationId = 'cs-escalate-case',
  ): Promise<{ case: SupportCaseRecord; escalation: CaseEscalationRecord }> {
    await this.assertAuthenticatedUser(staffPrincipal);
    const cleanCaseId = validateSafeId(caseId, 'caseId');
    const obj = assertPlainObject(rawInput, 'Escalate case');
    rejectUnknownOrMassAssignedKeys(
      obj,
      new Set(['reason', 'toTeamId', 'targetAgentUid', 'notes', 'upgradePriorityTo']),
    );

    const allowedReasons: CaseEscalationRecord['reason'][] = [
      'SLA_BREACH',
      'CUSTOMER_COMPLAINT_SEVERITY',
      'COMPLEX_DOMAIN_ISSUE',
      'SECURITY_OR_PRIVACY_RISK',
      'MANUAL_AGENT_ESCALATION',
    ];
    if (typeof obj.reason !== 'string' || !allowedReasons.includes(obj.reason as any)) {
      throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid escalation reason.');
    }
    const toTeamId = validateSafeId(obj.toTeamId, 'toTeamId');
    const notes =
      typeof obj.notes === 'string' && sanitizeAndMinimizeSupportText(obj.notes, 500).length >= 3
        ? sanitizeAndMinimizeSupportText(obj.notes, 500)
        : 'Escalated to specialized team';

    const nowIso = new Date().toISOString();

    const result = await this.repo.runInTransaction('cs.escalateSupportCase', async (tx) => {
      const staffCtx = await this.resolveStaffContextInTx(tx, staffPrincipal, nowIso);
      const record = await this.repo.getCaseInTx(tx, cleanCaseId);
      if (!record) throw new CoreApiError('NOT_FOUND', 404, 'Support case not found.');

      this.assertStaffCanAccessCase(staffCtx, staffPrincipal.uid, record);

      const targetTeam = await this.repo.getTeamInTx(tx, toTeamId);
      if (!targetTeam || !targetTeam.active) {
        throw new CoreApiError('NOT_FOUND', 404, `Target escalation team "${toTeamId}" not found.`);
      }

      validateCaseStateTransition({
        fromStatus: record.status,
        toStatus: 'ESCALATED',
        actorRole: staffCtx.actorRole,
        reason: notes,
      });

      const prevTeamId = record.assignedTeamId;
      const prevAgentUid = record.assignedAgentUid;
      const prevStatus = record.status;

      record.status = 'ESCALATED';
      record.assignedTeamId = toTeamId;
      record.assignedAgentUid =
        typeof obj.targetAgentUid === 'string'
          ? validateSafeId(obj.targetAgentUid, 'targetAgentUid')
          : targetTeam.leadAgentUid;

      if (
        typeof obj.upgradePriorityTo === 'string' &&
        ALLOWED_CASE_PRIORITIES.includes(obj.upgradePriorityTo as SupportCasePriority)
      ) {
        record.priority = obj.upgradePriorityTo as SupportCasePriority;
      }

      record.revision += 1;
      record.updatedAtIso = nowIso;

      await this.repo.upsertCaseInTx(tx, record, prevTeamId, prevAgentUid);

      await this.repo.appendStatusTransitionInTx(tx, {
        transitionId: `tr_${crypto.randomUUID().slice(0, 12)}`,
        caseId: record.caseId,
        fromStatus: prevStatus,
        toStatus: 'ESCALATED',
        actorUid: staffPrincipal.uid,
        actorRole: staffCtx.actorRole,
        reason: notes,
        timestampIso: nowIso,
      });

      const escalation: CaseEscalationRecord = {
        escalationId: `esc_${crypto.randomUUID().slice(0, 12)}`,
        caseId: record.caseId,
        escalatedByUid: staffPrincipal.uid,
        reason: obj.reason as CaseEscalationRecord['reason'],
        fromTeamId: prevTeamId,
        toTeamId,
        targetAgentUid: record.assignedAgentUid,
        notes,
        resolvedAtIso: null,
        createdAtIso: nowIso,
      };
      await this.repo.appendEscalationInTx(tx, escalation);

      return { case: record, escalation };
    });

    await this.emitDomainEvent(
      'support.case.escalated',
      staffPrincipal.uid,
      result.case.caseId,
      correlationId,
      {
        escalationId: result.escalation.escalationId,
        toTeamId,
        reason: result.escalation.reason,
      },
    );

    return result;
  }

  public async listStaffQueueCases(
    staffPrincipal: AuthenticatedPrincipal,
    query: {
      teamId?: string;
      agentUid?: string;
      unassignedOnly?: boolean;
      status?: SupportCaseStatus;
      priority?: SupportCasePriority;
      limit?: unknown;
      cursor?: unknown;
    } = {},
  ): Promise<{
    items: SupportCaseRecord[];
    nextCursor: string | null;
    hasMore: boolean;
    totalCount: number;
  }> {
    await this.assertAuthenticatedUser(staffPrincipal);
    const pagination = normalizePaginationParams(query);
    const nowIso = new Date().toISOString();

    return this.repo.runInTransaction('cs.listStaffQueueCases', async (tx) => {
      const staffCtx = await this.resolveStaffContextInTx(tx, staffPrincipal, nowIso);
      if (!staffCtx.isSupportStaff) {
        throw new CoreApiError('FORBIDDEN', 403, 'Support staff authorization required.');
      }

      let pool: SupportCaseRecord[];
      if (query.teamId) {
        pool = await this.repo.listCasesByTeamInTx(tx, validateSafeId(query.teamId, 'teamId'));
      } else if (query.agentUid) {
        pool = await this.repo.listCasesByAgentInTx(tx, validateSafeId(query.agentUid, 'agentUid'));
      } else {
        pool = await this.repo.listAllCasesInTx(tx);
      }

      const memberTeamIds = new Set(staffCtx.memberTeams.map((t) => t.teamId));
      let filtered = pool.filter((c) => {
        if (staffCtx.isAdmin) return true;
        if (c.isRestrictedSensitiveCase && !staffCtx.hasRestrictedAccess && c.assignedAgentUid !== staffPrincipal.uid) {
          return false;
        }
        return !c.assignedTeamId || memberTeamIds.has(c.assignedTeamId) || c.assignedAgentUid === staffPrincipal.uid;
      });

      if (query.unassignedOnly) {
        filtered = filtered.filter((c) => c.assignedAgentUid === null && c.status !== 'CLOSED' && c.status !== 'CANCELED');
      }
      if (query.status) {
        filtered = filtered.filter((c) => c.status === query.status);
      }
      if (query.priority) {
        filtered = filtered.filter((c) => c.priority === query.priority);
      }

      let startIndex = 0;
      if (pagination.cursor) {
        const decoded = decodePaginationCursor(pagination.cursor);
        const idx = filtered.findIndex((c) => c.caseId === decoded.docId);
        if (idx >= 0) startIndex = idx + 1;
      }

      const slice = filtered.slice(startIndex, startIndex + pagination.limit);
      const hasMore = startIndex + pagination.limit < filtered.length;
      const last = slice[slice.length - 1];
      const nextCursor =
        hasMore && last
          ? encodePaginationCursor({
              sortValue: last.updatedAtIso,
              docId: last.caseId,
              direction: 'desc',
            })
          : null;

      return {
        items: slice,
        nextCursor,
        hasMore,
        totalCount: filtered.length,
      };
    });
  }

  // ==========================================================================
  // 6. CUSTOMER COMMUNICATION vs. STRICTLY SEPARATED INTERNAL NOTES
  // ==========================================================================

  public async addCustomerVisibleMessage(
    principal: AuthenticatedPrincipal,
    caseId: string,
    rawInput: unknown,
    correlationId = 'cs-add-message',
  ): Promise<CaseMessageRecord> {
    await this.assertAuthenticatedUser(principal);
    const cleanCaseId = validateSafeId(caseId, 'caseId');
    const obj = assertPlainObject(rawInput, 'Case message');
    rejectUnknownOrMassAssignedKeys(
      obj,
      new Set(['body', 'templateId', 'templateVariables', 'attachmentIds']),
    );

    const nowIso = new Date().toISOString();

    const { message, caseRecord, isCustomerAuthor } = await this.repo.runInTransaction(
      'cs.addCustomerVisibleMessage',
      async (tx) => {
        const { slaPolicy } = await this.ensureBaselineConfigInTx(tx, nowIso);
        const staffCtx = await this.resolveStaffContextInTx(tx, principal, nowIso);
        const record = await this.repo.getCaseInTx(tx, cleanCaseId);
        if (!record) throw new CoreApiError('NOT_FOUND', 404, 'Support case not found.');

        if (record.status === 'CLOSED' || record.status === 'CANCELED') {
          throw new CoreApiError(
            'CONFLICT',
            409,
            'Cannot post new messages to a CLOSED or CANCELED case without reopening it.',
          );
        }

        const isCustomerParticipant =
          record.requesterUid === principal.uid ||
          record.participants.some((p) => p.uid === principal.uid);

        if (!isCustomerParticipant) {
          this.assertStaffCanAccessCase(staffCtx, principal.uid, record);
        }

        let bodyText = typeof obj.body === 'string' ? sanitizeAndMinimizeSupportText(obj.body, 3000) : '';
        let templateIdUsed: string | null = null;

        if (typeof obj.templateId === 'string' && staffCtx.isSupportStaff) {
          const tplId = validateSafeId(obj.templateId, 'templateId');
          const tpl = await this.repo.getResponseTemplateInTx(tx, tplId);
          if (!tpl || !tpl.active) {
            throw new CoreApiError('NOT_FOUND', 404, 'Response template not found or inactive.');
          }
          templateIdUsed = tpl.templateId;
          let rendered = tpl.bodyTemplate;
          const vars = obj.templateVariables ? assertPlainObject(obj.templateVariables, 'templateVariables') : {};
          for (const [k, v] of Object.entries(vars)) {
            if (typeof v === 'string') {
              rendered = rendered.replaceAll(`{{${k}}}`, sanitizeTextInput(v));
            }
          }
          bodyText = bodyText ? `${rendered}\n\n${bodyText}` : rendered;
        }

        if (bodyText.length < 2) {
          throw new CoreApiError('VALIDATION_FAILED', 400, 'Message body must be at least 2 characters.');
        }

        const attachmentIds: string[] = [];
        if (obj.attachmentIds !== undefined) {
          if (!Array.isArray(obj.attachmentIds) || obj.attachmentIds.length > 10) {
            throw new CoreApiError('VALIDATION_FAILED', 400, 'attachmentIds must be an array of up to 10 IDs.');
          }
          for (const aid of obj.attachmentIds) {
            const cleanAid = validateSafeId(aid, 'attachmentId');
            const att = await this.repo.getAttachmentInTx(tx, cleanAid);
            if (!att || att.caseId !== cleanCaseId) {
              throw new CoreApiError('NOT_FOUND', 404, `Attachment "${cleanAid}" does not belong to this case.`);
            }
            if (att.restrictedToStaffOnly) {
              throw new CoreApiError(
                'FORBIDDEN',
                403,
                'Restricted staff-only investigation evidence cannot be attached to customer-visible messages.',
              );
            }
            attachmentIds.push(cleanAid);
          }
        }

        const isCustomer = isCustomerParticipant && !staffCtx.isSupportStaff;
        const authorRole: CaseMessageRecord['authorRole'] = isCustomer
          ? 'CUSTOMER'
          : staffCtx.isAdmin
            ? 'ADMIN'
            : 'SUPPORT_AGENT';

        const msg: CaseMessageRecord = {
          messageId: `msg_${crypto.randomUUID().slice(0, 12)}`,
          caseId: cleanCaseId,
          authorUid: principal.uid,
          authorRole,
          visibility: 'CUSTOMER_VISIBLE',
          body: bodyText,
          templateIdUsed,
          attachmentIds,
          deliveryChannels: ['IN_APP'],
          deliveryRefId: null,
          readByRequesterAtIso: isCustomer ? nowIso : null,
          readByAgentAtIso: isCustomer ? null : nowIso,
          createdAtIso: nowIso,
        };

        await this.repo.appendCustomerVisibleMessageInTx(tx, msg);

        if (isCustomer) {
          record.lastCustomerMessageAtIso = nowIso;
          if (record.status === 'WAITING_FOR_CUSTOMER') {
            record.status = 'IN_PROGRESS';
            record.sla = applySlaPauseOrResumeOnStatusChange(
              record.sla,
              'IN_PROGRESS',
              slaPolicy.pauseOnStatuses,
              nowIso,
            );
            await this.repo.appendStatusTransitionInTx(tx, {
              transitionId: `tr_${crypto.randomUUID().slice(0, 12)}`,
              caseId: cleanCaseId,
              fromStatus: 'WAITING_FOR_CUSTOMER',
              toStatus: 'IN_PROGRESS',
              actorUid: principal.uid,
              actorRole: 'CUSTOMER',
              reason: 'Customer provided requested response',
              timestampIso: nowIso,
            });
          }
        } else {
          record.lastAgentResponseAtIso = nowIso;
          if (!record.sla.firstRespondedAtIso) {
            record.sla.firstRespondedAtIso = nowIso;
            if (Date.parse(nowIso) > Date.parse(record.sla.firstResponseDeadlineIso)) {
              record.sla.firstResponseBreached = true;
              record.sla.firstResponseBreachedAtIso = nowIso;
            }
          }
        }

        record.revision += 1;
        record.updatedAtIso = nowIso;
        await this.repo.upsertCaseInTx(tx, record);

        return { message: msg, caseRecord: record, isCustomerAuthor: isCustomer };
      },
    );

    if (!isCustomerAuthor) {
      await this.notificationAdapter.sendCaseNotification({
        recipientUid: caseRecord.requesterUid,
        caseId: caseRecord.caseId,
        caseNumber: caseRecord.caseNumber,
        eventType: 'support.case.status_changed',
        subject: `پاسخ جدید پشتیبانی برای پرونده ${caseRecord.caseNumber}`,
        summary: message.body.slice(0, 140),
        channels: ['IN_APP', 'EMAIL'],
        idempotencyKey: `cs_msg_${message.messageId}`,
      });
    } else {
      await this.emitDomainEvent(
        'support.case.customer_response',
        principal.uid,
        caseRecord.caseId,
        correlationId,
        { messageId: message.messageId },
      );
    }

    return message;
  }

  public async addInternalStaffNote(
    staffPrincipal: AuthenticatedPrincipal,
    caseId: string,
    rawInput: unknown,
    correlationId = 'cs-add-internal-note',
  ): Promise<CaseInternalNoteRecord> {
    await this.assertAuthenticatedUser(staffPrincipal);
    const cleanCaseId = validateSafeId(caseId, 'caseId');
    const obj = assertPlainObject(rawInput, 'Internal staff note');
    rejectUnknownOrMassAssignedKeys(obj, new Set(['body', 'attachmentIds', 'mentionedAgentUids']));

    if (typeof obj.body !== 'string') {
      throw new CoreApiError('VALIDATION_FAILED', 400, 'Internal note body is required.');
    }
    const body = sanitizeAndMinimizeSupportText(obj.body, 3000);
    if (body.length < 2) {
      throw new CoreApiError('VALIDATION_FAILED', 400, 'Internal note body must be at least 2 characters.');
    }

    const attachmentIds = Array.isArray(obj.attachmentIds)
      ? obj.attachmentIds.map((id) => validateSafeId(id, 'attachmentId'))
      : [];
    const mentionedAgentUids = Array.isArray(obj.mentionedAgentUids)
      ? obj.mentionedAgentUids.map((id) => validateSafeId(id, 'mentionedAgentUid'))
      : [];

    const nowIso = new Date().toISOString();

    const note = await this.repo.runInTransaction('cs.addInternalStaffNote', async (tx) => {
      const staffCtx = await this.resolveStaffContextInTx(tx, staffPrincipal, nowIso);
      if (!staffCtx.isSupportStaff) {
        throw new CoreApiError('FORBIDDEN', 403, 'Only authorized support staff may create internal notes.');
      }
      const record = await this.repo.getCaseInTx(tx, cleanCaseId);
      if (!record) throw new CoreApiError('NOT_FOUND', 404, 'Support case not found.');

      this.assertStaffCanAccessCase(staffCtx, staffPrincipal.uid, record);

      const createdNote: CaseInternalNoteRecord = {
        noteId: `inote_${crypto.randomUUID().slice(0, 12)}`,
        caseId: cleanCaseId,
        authorAgentUid: staffPrincipal.uid,
        visibility: 'INTERNAL_STAFF_ONLY',
        body,
        attachmentIds,
        mentionedAgentUids,
        createdAtIso: nowIso,
      };
      await this.repo.appendInternalNoteInTx(tx, createdNote);
      return createdNote;
    });

    await this.deps.auditSink.writeAuditEvent(
      createStructuredAuditEvent({
        principal: staffPrincipal,
        correlationId,
        action: 'support.internal_note.created',
        targetCollection: 'cs_internal_notes',
        targetResourceId: note.noteId,
        outcome: 'SUCCESS',
        metadata: { caseId: cleanCaseId },
      }),
    );

    return note;
  }

  // ==========================================================================
  // 8. CASE EVIDENCE & ATTACHMENTS (EMPLOYEE 63 INTEGRATION)
  // ==========================================================================

  public async attachCaseEvidence(
    principal: AuthenticatedPrincipal,
    caseId: string,
    rawInput: unknown,
    correlationId = 'cs-attach-evidence',
  ): Promise<CaseEvidenceAttachmentRecord> {
    await this.assertAuthenticatedUser(principal);
    const cleanCaseId = validateSafeId(caseId, 'caseId');
    const obj = assertPlainObject(rawInput, 'Case evidence attachment');
    rejectUnknownOrMassAssignedKeys(
      obj,
      new Set(['documentId', 'versionId', 'classification', 'retentionPolicyTag']),
    );

    const documentId = validateSafeId(obj.documentId, 'documentId');
    const versionId =
      typeof obj.versionId === 'string' ? validateSafeId(obj.versionId, 'versionId') : 'v1';
    const classification =
      obj.classification !== undefined
        ? validateAttachmentClassification(obj.classification)
        : 'CUSTOMER_UPLOAD';

    const nowIso = new Date().toISOString();

    const preCheck = await this.repo.runInTransaction('cs.attachEvidencePreCheck', async (tx) => {
      const staffCtx = await this.resolveStaffContextInTx(tx, principal, nowIso);
      const record = await this.repo.getCaseInTx(tx, cleanCaseId);
      if (!record) throw new CoreApiError('NOT_FOUND', 404, 'Support case not found.');

      const isCustomerParticipant =
        record.requesterUid === principal.uid ||
        record.participants.some((p) => p.uid === principal.uid);

      if (!isCustomerParticipant) {
        this.assertStaffCanAccessCase(staffCtx, principal.uid, record);
      }

      if (!staffCtx.isSupportStaff && classification !== 'CUSTOMER_UPLOAD') {
        throw new CoreApiError(
          'FORBIDDEN',
          403,
          'Customers may only attach evidence with CUSTOMER_UPLOAD classification.',
        );
      }

      return { isStaffOrAdmin: staffCtx.isSupportStaff };
    });

    const docVerification = await this.documentAdapter.verifyDocumentAccess({
      documentId,
      versionId,
      requesterUid: principal.uid,
      isStaffOrAdmin: preCheck.isStaffOrAdmin,
    });
    if (!docVerification.exists) {
      throw new CoreApiError('NOT_FOUND', 404, `Referenced document "${documentId}" does not exist.`);
    }
    if (!docVerification.authorized) {
      throw new CoreApiError(
        'FORBIDDEN',
        403,
        `Requester is not authorized to reference document "${documentId}".`,
      );
    }

    const restrictedToStaffOnly =
      classification === 'RESTRICTED_INVESTIGATION_EVIDENCE' ||
      classification === 'LEGAL_COMPLIANCE_ARTIFACT';

    const retentionPolicyTag: CaseEvidenceAttachmentRecord['retentionPolicyTag'] =
      obj.retentionPolicyTag === 'COMPLIANCE_HOLD_5Y' || obj.retentionPolicyTag === 'PRIVACY_RESTRICTED'
        ? obj.retentionPolicyTag
        : restrictedToStaffOnly
          ? 'COMPLIANCE_HOLD_5Y'
          : 'STANDARD_SUPPORT_1Y';

    const attachment = await this.repo.runInTransaction('cs.attachEvidenceCommit', async (tx) => {
      const att: CaseEvidenceAttachmentRecord = {
        attachmentId: `att_${crypto.randomUUID().slice(0, 12)}`,
        caseId: cleanCaseId,
        documentId,
        versionId,
        fileName: docVerification.fileName ?? `${documentId}.pdf`,
        mimeType: docVerification.mimeType ?? 'application/pdf',
        sizeBytes: docVerification.sizeBytes ?? 1024,
        classification,
        uploadedByUid: principal.uid,
        restrictedToStaffOnly,
        retentionPolicyTag,
        createdAtIso: nowIso,
      };
      await this.repo.upsertAttachmentInTx(tx, att);
      return att;
    });

    await this.deps.auditSink.writeAuditEvent(
      createStructuredAuditEvent({
        principal,
        correlationId,
        action: 'support.evidence.attached',
        targetCollection: 'cs_case_attachments',
        targetResourceId: attachment.attachmentId,
        outcome: 'SUCCESS',
        metadata: {
          caseId: cleanCaseId,
          documentId,
          classification,
          restrictedToStaffOnly,
        },
      }),
    );

    return attachment;
  }

  public async authorizeAttachmentDownload(
    principal: AuthenticatedPrincipal,
    caseId: string,
    attachmentId: string,
  ): Promise<{
    authorized: boolean;
    attachment: CaseEvidenceAttachmentRecord;
    downloadTokenRef: string;
  }> {
    await this.assertAuthenticatedUser(principal);
    const cleanCaseId = validateSafeId(caseId, 'caseId');
    const cleanAttId = validateSafeId(attachmentId, 'attachmentId');
    const nowIso = new Date().toISOString();

    return this.repo.runInTransaction('cs.authorizeAttachmentDownload', async (tx) => {
      const staffCtx = await this.resolveStaffContextInTx(tx, principal, nowIso);
      const record = await this.repo.getCaseInTx(tx, cleanCaseId);
      if (!record) throw new CoreApiError('NOT_FOUND', 404, 'Support case not found.');

      const att = await this.repo.getAttachmentInTx(tx, cleanAttId);
      if (!att || att.caseId !== cleanCaseId) {
        throw new CoreApiError('NOT_FOUND', 404, 'Attachment not found on this case.');
      }

      if (staffCtx.isSupportStaff) {
        this.assertStaffCanAccessCase(staffCtx, principal.uid, record);
      } else {
        this.assertCustomerCanAccessCase(principal, record);
        if (att.restrictedToStaffOnly) {
          throw new CoreApiError(
            'FORBIDDEN',
            403,
            'Access denied: restricted investigation evidence is not accessible to customers.',
          );
        }
      }

      return {
        authorized: true,
        attachment: att,
        downloadTokenRef: `dl_${att.documentId}_${att.versionId}_${principal.uid}`,
      };
    });
  }

  // ==========================================================================
  // 7. COMPLAINT & ESCALATION MANAGEMENT
  // ==========================================================================

  /**
   * Submits a structured complaint.
   * Architectural Rule: A support complaint never automatically mutates a reputation score,
   * transaction status, financial ledger, or professional verification status.
   */
  public async submitComplaint(
    principal: AuthenticatedPrincipal,
    rawInput: unknown,
    correlationId = 'cs-submit-complaint',
  ): Promise<{ complaint: SupportComplaintRecord; case: CustomerFacingCaseView }> {
    await this.assertAuthenticatedUser(principal);
    const obj = assertPlainObject(rawInput, 'Submit complaint');
    rejectUnknownOrMassAssignedKeys(
      obj,
      new Set([
        'category',
        'subcategory',
        'severity',
        'subject',
        'description',
        'relatedEntities',
        'evidenceAttachmentIds',
      ]),
    );

    const category: SupportCaseCategory =
      typeof obj.category === 'string' && ALLOWED_CASE_CATEGORIES.includes(obj.category as SupportCaseCategory)
        ? (obj.category as SupportCaseCategory)
        : 'ABUSE_AND_SAFETY_REPORTS';
    const subcategory =
      typeof obj.subcategory === 'string' && sanitizeTextInput(obj.subcategory)
        ? sanitizeTextInput(obj.subcategory).slice(0, 80)
        : 'FORMAL_COMPLAINT';
    const severity = obj.severity !== undefined ? validateComplaintSeverity(obj.severity) : 'MODERATE';

    if (typeof obj.subject !== 'string' || sanitizeTextInput(obj.subject).length < 4) {
      throw new CoreApiError('VALIDATION_FAILED', 400, 'Complaint subject must be at least 4 characters.');
    }
    if (typeof obj.description !== 'string' || sanitizeTextInput(obj.description).length < 10) {
      throw new CoreApiError('VALIDATION_FAILED', 400, 'Complaint description must be at least 10 characters.');
    }

    const subject = sanitizeAndMinimizeSupportText(obj.subject, 160);
    const description = sanitizeAndMinimizeSupportText(obj.description, 2500);
    const relatedEntities = validateRelatedEntityReferences(obj.relatedEntities);
    const evidenceAttachmentIds = Array.isArray(obj.evidenceAttachmentIds)
      ? obj.evidenceAttachmentIds.map((id) => validateSafeId(id, 'evidenceAttachmentId'))
      : [];

    const priority: SupportCasePriority =
      severity === 'CRITICAL'
        ? 'CRITICAL'
        : severity === 'HIGH'
          ? 'URGENT'
          : severity === 'MODERATE'
            ? 'HIGH'
            : 'MEDIUM';

    const createdCaseView = await this.createSupportCase(
      principal,
      {
        category,
        subcategory,
        subject,
        structuredDescription: { summary: description },
        relatedEntities,
        priority,
        submitImmediately: true,
      },
      correlationId,
    );

    const nowIso = new Date().toISOString();
    const complaintId = `cmp_${crypto.randomUUID().slice(0, 12)}`;

    const complaint = await this.repo.runInTransaction('cs.submitComplaint', async (tx) => {
      const caseRec = await this.repo.getCaseInTx(tx, createdCaseView.caseId);
      if (caseRec) {
        caseRec.linkedComplaintId = complaintId;
        await this.repo.upsertCaseInTx(tx, caseRec);
      }

      const cmp: SupportComplaintRecord = {
        complaintId,
        caseId: createdCaseView.caseId,
        complainantUid: principal.uid,
        category,
        subcategory,
        severity,
        status: 'SUBMITTED',
        subject,
        description,
        relatedEntities,
        evidenceAttachmentIds,
        assignedInvestigatorUid: null,
        decisionOutcome: 'PENDING',
        decisionRationale: null,
        resolutionActions: [],
        authoritativeDomainReferrals: [],
        appealReference: null,
        history: [
          {
            eventId: `ch_${crypto.randomUUID().slice(0, 10)}`,
            actorUid: principal.uid,
            action: 'COMPLAINT_SUBMITTED',
            details: `Severity: ${severity}`,
            timestampIso: nowIso,
          },
        ],
        createdAtIso: nowIso,
        updatedAtIso: nowIso,
      };
      await this.repo.upsertComplaintInTx(tx, cmp);
      return cmp;
    });

    await this.emitDomainEvent(
      'support.complaint.updated',
      principal.uid,
      createdCaseView.caseId,
      correlationId,
      {
        complaintId: complaint.complaintId,
        status: complaint.status,
        severity: complaint.severity,
      },
    );

    return { complaint, case: createdCaseView };
  }

  public async recordComplaintDecision(
    staffPrincipal: AuthenticatedPrincipal,
    complaintId: string,
    rawInput: unknown,
    correlationId = 'cs-complaint-decision',
  ): Promise<SupportComplaintRecord> {
    await this.assertAuthenticatedUser(staffPrincipal);
    const cleanId = validateSafeId(complaintId, 'complaintId');
    const obj = assertPlainObject(rawInput, 'Complaint decision');
    rejectUnknownOrMassAssignedKeys(
      obj,
      new Set([
        'decisionOutcome',
        'decisionRationale',
        'resolutionActions',
        'authoritativeDomainReferral',
      ]),
    );

    const allowedOutcomes: ComplaintDecisionOutcome[] = [
      'UPHELD',
      'PARTIALLY_UPHELD',
      'UNSUBSTANTIATED',
      'REFERRED_TO_AUTHORITATIVE_DOMAIN',
    ];
    if (typeof obj.decisionOutcome !== 'string' || !allowedOutcomes.includes(obj.decisionOutcome as any)) {
      throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid complaint decisionOutcome.');
    }
    if (typeof obj.decisionRationale !== 'string' || sanitizeTextInput(obj.decisionRationale).length < 5) {
      throw new CoreApiError('VALIDATION_FAILED', 400, 'decisionRationale is required.');
    }

    const nowIso = new Date().toISOString();

    const updated = await this.repo.runInTransaction('cs.recordComplaintDecision', async (tx) => {
      const staffCtx = await this.resolveStaffContextInTx(tx, staffPrincipal, nowIso);
      if (!staffCtx.isSupportStaff) {
        throw new CoreApiError('FORBIDDEN', 403, 'Support staff authorization required to record complaint decisions.');
      }

      const cmp = await this.repo.getComplaintInTx(tx, cleanId);
      if (!cmp) throw new CoreApiError('NOT_FOUND', 404, 'Complaint not found.');

      cmp.decisionOutcome = obj.decisionOutcome as ComplaintDecisionOutcome;
      cmp.decisionRationale = sanitizeAndMinimizeSupportText(obj.decisionRationale as string, 1000);
      cmp.status = 'DECISION_RECORDED';
      cmp.assignedInvestigatorUid = cmp.assignedInvestigatorUid ?? staffPrincipal.uid;

      if (Array.isArray(obj.resolutionActions)) {
        cmp.resolutionActions = obj.resolutionActions
          .filter((a): a is string => typeof a === 'string')
          .map((a) => sanitizeTextInput(a).slice(0, 200));
      }

      if (obj.authoritativeDomainReferral !== undefined && obj.authoritativeDomainReferral !== null) {
        const refObj = assertPlainObject(obj.authoritativeDomainReferral, 'authoritativeDomainReferral');
        const allowedDomains: AuthoritativeDomainReferralReference['targetDomain'][] = [
          'PROFESSIONAL_VERIFICATION_AND_REPUTATION',
          'PROPERTY_TRANSACTIONS_AND_ESCROW',
          'LISTING_MODERATION',
          'LEGAL_AND_COMPLIANCE',
        ];
        if (typeof refObj.targetDomain !== 'string' || !allowedDomains.includes(refObj.targetDomain as any)) {
          throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid authoritative referral targetDomain.');
        }
        const targetEntityId = validateSafeId(refObj.targetEntityId, 'targetEntityId');
        const recommendedActionSummary =
          typeof refObj.recommendedActionSummary === 'string'
            ? sanitizeTextInput(refObj.recommendedActionSummary).slice(0, 300)
            : 'Referred for authoritative domain review';

        cmp.authoritativeDomainReferrals.push({
          referralId: `ref_${crypto.randomUUID().slice(0, 10)}`,
          targetDomain: refObj.targetDomain as AuthoritativeDomainReferralReference['targetDomain'],
          targetEntityId,
          recommendedActionSummary,
          referredByUid: staffPrincipal.uid,
          referredAtIso: nowIso,
        });
      }

      cmp.history.push({
        eventId: `ch_${crypto.randomUUID().slice(0, 10)}`,
        actorUid: staffPrincipal.uid,
        action: 'DECISION_RECORDED',
        details: `Outcome: ${cmp.decisionOutcome}`,
        timestampIso: nowIso,
      });
      cmp.updatedAtIso = nowIso;

      await this.repo.upsertComplaintInTx(tx, cmp);
      return cmp;
    });

    await this.deps.auditSink.writeAuditEvent(
      createStructuredAuditEvent({
        principal: staffPrincipal,
        correlationId,
        action: 'support.complaint.decision_recorded',
        targetCollection: 'cs_complaints',
        targetResourceId: updated.complaintId,
        outcome: 'SUCCESS',
        metadata: {
          caseId: updated.caseId,
          decisionOutcome: updated.decisionOutcome,
          referralsCount: updated.authoritativeDomainReferrals.length,
        },
      }),
    );

    await this.notificationAdapter.sendCaseNotification({
      recipientUid: updated.complainantUid,
      caseId: updated.caseId,
      caseNumber: updated.caseId,
      eventType: 'support.complaint.updated',
      subject: 'ثبت نتیجه بررسی شکایت',
      summary: updated.decisionRationale ?? '',
      channels: ['IN_APP', 'EMAIL'],
      idempotencyKey: `cs_cmp_dec_${updated.complaintId}`,
    });

    return updated;
  }

  public async submitComplaintAppeal(
    principal: AuthenticatedPrincipal,
    complaintId: string,
    rawInput: unknown,
    correlationId = 'cs-complaint-appeal',
  ): Promise<SupportComplaintRecord> {
    await this.assertAuthenticatedUser(principal);
    const cleanId = validateSafeId(complaintId, 'complaintId');
    const obj = assertPlainObject(rawInput, 'Complaint appeal');
    rejectUnknownOrMassAssignedKeys(obj, new Set(['appealReason']));

    if (typeof obj.appealReason !== 'string' || sanitizeTextInput(obj.appealReason).length < 5) {
      throw new CoreApiError('VALIDATION_FAILED', 400, 'appealReason must be at least 5 characters.');
    }
    const appealReason = sanitizeAndMinimizeSupportText(obj.appealReason, 800);
    const nowIso = new Date().toISOString();

    const updated = await this.repo.runInTransaction('cs.submitComplaintAppeal', async (tx) => {
      const cmp = await this.repo.getComplaintInTx(tx, cleanId);
      if (!cmp) throw new CoreApiError('NOT_FOUND', 404, 'Complaint not found.');
      if (cmp.complainantUid !== principal.uid) {
        throw new CoreApiError('FORBIDDEN', 403, 'Only the original complainant may appeal this complaint decision.');
      }
      if (cmp.status !== 'DECISION_RECORDED') {
        throw new CoreApiError('CONFLICT', 409, 'Appeals can only be submitted after a decision is recorded.');
      }
      if (cmp.appealReference) {
        throw new CoreApiError('CONFLICT', 409, 'An appeal has already been submitted for this complaint.');
      }

      cmp.status = 'APPEAL_SUBMITTED';
      cmp.appealReference = {
        appealedAtIso: nowIso,
        appealReason,
        appealStatus: 'PENDING_REVIEW',
        reviewedByUid: null,
        reviewedAtIso: null,
      };
      cmp.history.push({
        eventId: `ch_${crypto.randomUUID().slice(0, 10)}`,
        actorUid: principal.uid,
        action: 'APPEAL_SUBMITTED',
        details: appealReason.slice(0, 120),
        timestampIso: nowIso,
      });
      cmp.updatedAtIso = nowIso;

      await this.repo.upsertComplaintInTx(tx, cmp);
      return cmp;
    });

    await this.emitDomainEvent(
      'support.complaint.updated',
      principal.uid,
      updated.caseId,
      correlationId,
      { complaintId: updated.complaintId, status: updated.status },
    );

    return updated;
  }

  // ==========================================================================
  // 13. CUSTOMER SATISFACTION (CSAT) — SEPARATE FROM PUBLIC REPUTATION
  // ==========================================================================

  public async submitCaseSatisfactionFeedback(
    principal: AuthenticatedPrincipal,
    caseId: string,
    rawInput: unknown,
    correlationId = 'cs-submit-csat',
  ): Promise<CaseSatisfactionFeedbackRecord> {
    await this.assertAuthenticatedUser(principal);
    const cleanCaseId = validateSafeId(caseId, 'caseId');
    const obj = assertPlainObject(rawInput, 'Customer satisfaction feedback');
    rejectUnknownOrMassAssignedKeys(
      obj,
      new Set(['overallScore', 'categories', 'comment', 'allowRevision']),
    );

    const validateScore = (val: unknown, name: string): 1 | 2 | 3 | 4 | 5 => {
      const n = Number(val);
      if (!Number.isInteger(n) || n < 1 || n > 5) {
        throw new CoreApiError('VALIDATION_FAILED', 400, `${name} must be an integer between 1 and 5.`);
      }
      return n as 1 | 2 | 3 | 4 | 5;
    };

    const overallScore = validateScore(obj.overallScore, 'overallScore');
    const catObj = obj.categories ? assertPlainObject(obj.categories, 'categories') : {};
    const categories = {
      timeliness: validateScore(catObj.timeliness ?? overallScore, 'categories.timeliness'),
      clarityAndHelpfulness: validateScore(
        catObj.clarityAndHelpfulness ?? overallScore,
        'categories.clarityAndHelpfulness',
      ),
      resolutionQuality: validateScore(
        catObj.resolutionQuality ?? overallScore,
        'categories.resolutionQuality',
      ),
    };
    const comment =
      typeof obj.comment === 'string' ? sanitizeAndMinimizeSupportText(obj.comment, 1000) : '';

    const nowIso = new Date().toISOString();

    const feedback = await this.repo.runInTransaction('cs.submitCaseSatisfactionFeedback', async (tx) => {
      const record = await this.repo.getCaseInTx(tx, cleanCaseId);
      if (!record) throw new CoreApiError('NOT_FOUND', 404, 'Support case not found.');

      if (record.requesterUid !== principal.uid) {
        throw new CoreApiError(
          'FORBIDDEN',
          403,
          'Only the primary case requester is eligible to submit customer satisfaction feedback.',
        );
      }

      if (record.status !== 'RESOLVED' && record.status !== 'CLOSED') {
        throw new CoreApiError(
          'CONFLICT',
          409,
          'Customer satisfaction feedback can only be submitted after the case is RESOLVED or CLOSED.',
        );
      }

      const existing = await this.repo.getSatisfactionByCaseInTx(tx, cleanCaseId);
      if (existing) {
        if (obj.allowRevision !== true || existing.revision >= 2) {
          throw new CoreApiError(
            'CONFLICT',
            409,
            'Satisfaction feedback has already been submitted for this case.',
          );
        }
        existing.overallScore = overallScore;
        existing.categories = categories;
        existing.comment = comment;
        existing.revision += 1;
        existing.updatedAtIso = nowIso;
        await this.repo.upsertSatisfactionInTx(tx, existing);
        return existing;
      }

      const created: CaseSatisfactionFeedbackRecord = {
        feedbackId: `csat_${cleanCaseId}`,
        caseId: cleanCaseId,
        requesterUid: principal.uid,
        overallScore,
        categories,
        comment,
        revision: 1,
        submittedAtIso: nowIso,
        updatedAtIso: nowIso,
      };
      await this.repo.upsertSatisfactionInTx(tx, created);

      record.satisfactionSubmitted = true;
      record.updatedAtIso = nowIso;
      await this.repo.upsertCaseInTx(tx, record);

      return created;
    });

    await this.emitDomainEvent(
      'support.case.satisfaction_submitted',
      principal.uid,
      cleanCaseId,
      correlationId,
      {
        overallScore: feedback.overallScore,
        revision: feedback.revision,
      },
    );

    return feedback;
  }

  // ==========================================================================
  // 11. KNOWLEDGE BASE INTEGRATION
  // ==========================================================================

  public async upsertKnowledgeArticle(
    adminPrincipal: AuthenticatedPrincipal,
    rawInput: unknown,
    correlationId = 'cs-kb-upsert',
  ): Promise<KnowledgeBaseArticleRecord> {
    if (!(await this.isPrincipalAdmin(adminPrincipal))) {
      throw new CoreApiError('FORBIDDEN', 403, 'Administrative privileges required to manage knowledge base articles.');
    }

    const obj = assertPlainObject(rawInput, 'Knowledge base article');
    rejectUnknownOrMassAssignedKeys(
      obj,
      new Set([
        'articleId',
        'slug',
        'title',
        'summary',
        'contentMarkdown',
        'category',
        'relatedCategories',
        'tags',
        'publicationStatus',
      ]),
    );

    const articleId =
      typeof obj.articleId === 'string'
        ? validateSafeId(obj.articleId, 'articleId')
        : `kb_${crypto.randomUUID().slice(0, 10)}`;
    const slug =
      typeof obj.slug === 'string' ? validateSafeId(obj.slug, 'slug') : articleId;

    if (typeof obj.title !== 'string' || sanitizeTextInput(obj.title).length < 3) {
      throw new CoreApiError('VALIDATION_FAILED', 400, 'Article title is required.');
    }
    if (typeof obj.contentMarkdown !== 'string' || sanitizeTextInput(obj.contentMarkdown).length < 10) {
      throw new CoreApiError('VALIDATION_FAILED', 400, 'Article contentMarkdown is required.');
    }
    if (typeof obj.category !== 'string' || !ALLOWED_CASE_CATEGORIES.includes(obj.category as SupportCaseCategory)) {
      throw new CoreApiError('VALIDATION_FAILED', 400, 'Invalid article category.');
    }

    const allowedStatuses: KnowledgeArticlePublicationStatus[] = [
      'DRAFT',
      'PUBLISHED',
      'ARCHIVED',
      'INTERNAL_RESTRICTED',
    ];
    const publicationStatus: KnowledgeArticlePublicationStatus =
      typeof obj.publicationStatus === 'string' && allowedStatuses.includes(obj.publicationStatus as any)
        ? (obj.publicationStatus as KnowledgeArticlePublicationStatus)
        : 'DRAFT';

    const relatedCategories: SupportCaseCategory[] = Array.isArray(obj.relatedCategories)
      ? obj.relatedCategories.filter(
          (c): c is SupportCaseCategory =>
            typeof c === 'string' && ALLOWED_CASE_CATEGORIES.includes(c as SupportCaseCategory),
        )
      : [];

    const tags: string[] = Array.isArray(obj.tags)
      ? obj.tags
          .filter((t): t is string => typeof t === 'string')
          .map((t) => sanitizeTextInput(t).slice(0, 40))
      : [];

    const nowIso = new Date().toISOString();

    const article = await this.repo.runInTransaction('cs.upsertKnowledgeArticle', async (tx) => {
      const existing = await this.repo.getKnowledgeArticleInTx(tx, articleId);
      const record: KnowledgeBaseArticleRecord = {
        articleId,
        slug,
        title: sanitizeTextInput(obj.title as string).slice(0, 160),
        summary:
          typeof obj.summary === 'string'
            ? sanitizeTextInput(obj.summary).slice(0, 400)
            : sanitizeTextInput(obj.contentMarkdown as string).slice(0, 200),
        contentMarkdown: sanitizeTextInput(obj.contentMarkdown as string).slice(0, 15_000),
        category: obj.category as SupportCaseCategory,
        relatedCategories,
        tags,
        version: (existing?.version ?? 0) + 1,
        publicationStatus,
        helpfulCount: existing?.helpfulCount ?? 0,
        notHelpfulCount: existing?.notHelpfulCount ?? 0,
        authorUid: adminPrincipal.uid,
        createdAtIso: existing?.createdAtIso ?? nowIso,
        updatedAtIso: nowIso,
      };
      await this.repo.upsertKnowledgeArticleInTx(tx, record);
      return record;
    });

    await this.deps.auditSink.writeAuditEvent(
      createStructuredAuditEvent({
        principal: adminPrincipal,
        correlationId,
        action: 'support.kb_article.upserted',
        targetCollection: 'cs_kb_articles',
        targetResourceId: article.articleId,
        outcome: 'SUCCESS',
        metadata: {
          version: article.version,
          publicationStatus: article.publicationStatus,
        },
      }),
    );

    return article;
  }

  /**
   * Public search over Knowledge Base articles.
   * Never returns DRAFT, ARCHIVED, or INTERNAL_RESTRICTED articles.
   */
  public async searchPublicKnowledgeArticles(query: {
    q?: string;
    category?: SupportCaseCategory;
    limit?: number;
  } = {}): Promise<KnowledgeBaseArticleRecord[]> {
    const all = await this.repo.runInTransaction('cs.searchPublicKnowledgeArticles', (tx) =>
      this.repo.listAllKnowledgeArticlesInTx(tx),
    );

    const searchLower = typeof query.q === 'string' ? query.q.trim().toLowerCase() : '';
    const publishedOnly = all.filter((a) => a.publicationStatus === 'PUBLISHED');

    const matched = publishedOnly.filter((a) => {
      if (
        query.category &&
        a.category !== query.category &&
        !a.relatedCategories.includes(query.category)
      ) {
        return false;
      }
      if (searchLower) {
        const hay = `${a.title} ${a.summary} ${a.tags.join(' ')}`.toLowerCase();
        return hay.includes(searchLower);
      }
      return true;
    });

    return matched.slice(0, Math.max(1, Math.min(50, query.limit ?? 20)));
  }

  public async submitKnowledgeArticleFeedback(
    principal: AuthenticatedPrincipal,
    articleId: string,
    rawInput: unknown,
  ): Promise<KnowledgeArticleFeedbackRecord> {
    await this.assertAuthenticatedUser(principal);
    const cleanId = validateSafeId(articleId, 'articleId');
    const obj = assertPlainObject(rawInput, 'Article feedback');
    rejectUnknownOrMassAssignedKeys(obj, new Set(['helpful', 'comment']));

    if (typeof obj.helpful !== 'boolean') {
      throw new CoreApiError('VALIDATION_FAILED', 400, 'helpful must be a boolean.');
    }
    const comment =
      typeof obj.comment === 'string' ? sanitizeAndMinimizeSupportText(obj.comment, 400) : null;
    const nowIso = new Date().toISOString();

    return this.repo.runInTransaction('cs.submitKnowledgeArticleFeedback', async (tx) => {
      const article = await this.repo.getKnowledgeArticleInTx(tx, cleanId);
      if (!article || article.publicationStatus !== 'PUBLISHED') {
        throw new CoreApiError('NOT_FOUND', 404, 'Published knowledge base article not found.');
      }

      const existing = await this.repo.getKnowledgeFeedbackInTx(tx, cleanId, principal.uid);
      if (!existing) {
        if (obj.helpful) article.helpfulCount += 1;
        else article.notHelpfulCount += 1;
        await this.repo.upsertKnowledgeArticleInTx(tx, article);
      }

      const fb: KnowledgeArticleFeedbackRecord = {
        feedbackId: `kbfb_${cleanId}_${principal.uid}`,
        articleId: cleanId,
        userUid: principal.uid,
        helpful: obj.helpful as boolean,
        comment,
        createdAtIso: nowIso,
      };
      this.repo.setKnowledgeFeedbackInTx(tx, fb);
      return fb;
    });
  }

  // ==========================================================================
  // 5, 12, 14 & 16. SLA MONITORING JOB, ADMIN CONTROLS & ANALYTICS
  // ==========================================================================

  /**
   * Idempotent background SLA monitoring job.
   * Detects SLA warnings, first-response breaches, resolution breaches,
   * and auto-escalates breached high/urgent/critical cases without duplicate notifications on retry.
   */
  public async executeSlaMonitoringJob(
    jobExecutionKey: string,
    nowIso = new Date().toISOString(),
  ): Promise<SlaMonitorJobExecutionResult> {
    const cleanJobKey = validateSafeId(jobExecutionKey, 'jobExecutionKey');
    const nowMs = Date.parse(nowIso);

    const { result, eventsToEmit } = await this.repo.runInTransaction(
      'cs.executeSlaMonitoringJob',
      async (tx) => {
        const existingJob = await this.repo.getSlaMonitorJobInTx(tx, cleanJobKey);
        if (existingJob) {
          return {
            result: { ...existingJob, replayed: true },
            eventsToEmit: [] as Array<{
              type: CustomerSupportDomainEventType;
              caseId: string;
              payload: Record<string, unknown>;
            }>,
          };
        }

        const { slaPolicy } = await this.ensureBaselineConfigInTx(tx, nowIso);
        const allCases = await this.repo.listAllCasesInTx(tx);

        const warningsTriggeredCaseIds: string[] = [];
        const firstResponseBreachedCaseIds: string[] = [];
        const resolutionBreachedCaseIds: string[] = [];
        const autoEscalatedCaseIds: string[] = [];
        const pendingEvents: Array<{
          type: CustomerSupportDomainEventType;
          caseId: string;
          payload: Record<string, unknown>;
        }> = [];

        let evaluatedCasesCount = 0;

        for (const c of allCases) {
          if (
            c.status === 'DRAFT' ||
            c.status === 'RESOLVED' ||
            c.status === 'CLOSED' ||
            c.status === 'CANCELED' ||
            c.sla.isPaused
          ) {
            continue;
          }

          evaluatedCasesCount += 1;
          let changed = false;

          const firstRespDeadlineMs = Date.parse(c.sla.firstResponseDeadlineIso);
          const resolutionDeadlineMs = Date.parse(c.sla.resolutionDeadlineIso);
          const createdMs = Date.parse(c.createdAtIso);

          // Check warning threshold (e.g., 80% of resolution window elapsed)
          const totalWindowMs = Math.max(1, resolutionDeadlineMs - createdMs);
          const elapsedMs = nowMs - createdMs;
          const elapsedPercent = (elapsedMs / totalWindowMs) * 100;

          if (!c.sla.warningTriggered && elapsedPercent >= slaPolicy.warningThresholdPercent && nowMs < resolutionDeadlineMs) {
            c.sla.warningTriggered = true;
            c.sla.warningTriggeredAtIso = nowIso;
            warningsTriggeredCaseIds.push(c.caseId);
            changed = true;
            pendingEvents.push({
              type: 'support.case.sla_warning',
              caseId: c.caseId,
              payload: { caseNumber: c.caseNumber, elapsedPercent: Math.round(elapsedPercent) },
            });
          }

          // Check First Response SLA breach
          if (!c.sla.firstRespondedAtIso && !c.sla.firstResponseBreached && nowMs > firstRespDeadlineMs) {
            c.sla.firstResponseBreached = true;
            c.sla.firstResponseBreachedAtIso = nowIso;
            firstResponseBreachedCaseIds.push(c.caseId);
            changed = true;
            pendingEvents.push({
              type: 'support.case.sla_breach',
              caseId: c.caseId,
              payload: { breachType: 'FIRST_RESPONSE', caseNumber: c.caseNumber },
            });
          }

          // Check Resolution SLA breach
          if (!c.sla.resolvedAtIso && !c.sla.resolutionBreached && nowMs > resolutionDeadlineMs) {
            c.sla.resolutionBreached = true;
            c.sla.resolutionBreachedAtIso = nowIso;
            resolutionBreachedCaseIds.push(c.caseId);
            changed = true;
            pendingEvents.push({
              type: 'support.case.sla_breach',
              caseId: c.caseId,
              payload: { breachType: 'RESOLUTION', caseNumber: c.caseNumber },
            });

            if (
              c.status !== 'ESCALATED' &&
              (c.priority === 'HIGH' || c.priority === 'URGENT' || c.priority === 'CRITICAL')
            ) {
              const prevStatus = c.status;
              c.status = 'ESCALATED';
              autoEscalatedCaseIds.push(c.caseId);
              await this.repo.appendStatusTransitionInTx(tx, {
                transitionId: `tr_${crypto.randomUUID().slice(0, 12)}`,
                caseId: c.caseId,
                fromStatus: prevStatus,
                toStatus: 'ESCALATED',
                actorUid: 'system-sla-monitor',
                actorRole: 'SYSTEM',
                reason: 'Auto-escalated due to SLA resolution deadline breach',
                timestampIso: nowIso,
              });
              pendingEvents.push({
                type: 'support.case.escalated',
                caseId: c.caseId,
                payload: { reason: 'SLA_BREACH', jobExecutionKey: cleanJobKey },
              });
            }
          }

          c.sla.lastEvaluatedAtIso = nowIso;
          if (changed) {
            c.revision += 1;
            c.updatedAtIso = nowIso;
            await this.repo.upsertCaseInTx(tx, c);
          }
        }

        const jobResult: SlaMonitorJobExecutionResult = {
          jobExecutionKey: cleanJobKey,
          replayed: false,
          evaluatedCasesCount,
          warningsTriggeredCaseIds,
          firstResponseBreachedCaseIds,
          resolutionBreachedCaseIds,
          autoEscalatedCaseIds,
          executedAtIso: nowIso,
        };
        this.repo.setSlaMonitorJobInTx(tx, jobResult);

        return { result: jobResult, eventsToEmit: pendingEvents };
      },
    );

    for (const evt of eventsToEmit) {
      await this.emitDomainEvent(evt.type, 'system-sla-monitor', evt.caseId, cleanJobKey, evt.payload);
    }

    return result;
  }

  public async getOperationalMetricsSummary(
    staffPrincipal: AuthenticatedPrincipal,
  ): Promise<SupportOperationalMetricsSummary> {
    await this.assertAuthenticatedUser(staffPrincipal);
    const nowIso = new Date().toISOString();

    return this.repo.runInTransaction('cs.getOperationalMetricsSummary', async (tx) => {
      const staffCtx = await this.resolveStaffContextInTx(tx, staffPrincipal, nowIso);
      if (!staffCtx.isSupportStaff) {
        throw new CoreApiError('FORBIDDEN', 403, 'Support staff or admin privileges required for operational metrics.');
      }

      const [allCases, allTeams, allCsat] = await Promise.all([
        this.repo.listAllCasesInTx(tx),
        this.repo.listTeamsInTx(tx),
        this.repo.listAllSatisfactionInTx(tx),
      ]);

      const casesByCategory = Object.fromEntries(
        ALLOWED_CASE_CATEGORIES.map((c) => [c, 0]),
      ) as Record<SupportCaseCategory, number>;
      const casesByPriority = Object.fromEntries(
        ALLOWED_CASE_PRIORITIES.map((p) => [p, 0]),
      ) as Record<SupportCasePriority, number>;
      const casesByStatus = Object.fromEntries(
        ALLOWED_CASE_STATUSES.map((s) => [s, 0]),
      ) as Record<SupportCaseStatus, number>;

      let openCaseCount = 0;
      let unassignedCaseCount = 0;
      let firstRespSumMinutes = 0;
      let firstRespCount = 0;
      let resolutionSumMinutes = 0;
      let resolutionCount = 0;
      let slaFirstResponseBreachCount = 0;
      let slaResolutionBreachCount = 0;
      let escalatedCount = 0;
      let reopenedCount = 0;

      const agentWorkload: Record<string, { assignedActiveCount: number; resolvedCount: number }> = {};
      const teamWorkload: Record<string, { assignedActiveCount: number; unassignedQueueCount: number }> = {};

      for (const t of allTeams) {
        teamWorkload[t.teamId] = { assignedActiveCount: 0, unassignedQueueCount: 0 };
        for (const uid of t.memberAgentUids) {
          agentWorkload[uid] = { assignedActiveCount: 0, resolvedCount: 0 };
        }
      }

      for (const c of allCases) {
        casesByCategory[c.category] = (casesByCategory[c.category] ?? 0) + 1;
        casesByPriority[c.priority] = (casesByPriority[c.priority] ?? 0) + 1;
        casesByStatus[c.status] = (casesByStatus[c.status] ?? 0) + 1;

        const isActive =
          c.status !== 'DRAFT' &&
          c.status !== 'RESOLVED' &&
          c.status !== 'CLOSED' &&
          c.status !== 'CANCELED';

        if (isActive) {
          openCaseCount += 1;
          if (!c.assignedAgentUid) {
            unassignedCaseCount += 1;
            if (c.assignedTeamId && teamWorkload[c.assignedTeamId]) {
              teamWorkload[c.assignedTeamId].unassignedQueueCount += 1;
            }
          } else {
            if (!agentWorkload[c.assignedAgentUid]) {
              agentWorkload[c.assignedAgentUid] = { assignedActiveCount: 0, resolvedCount: 0 };
            }
            agentWorkload[c.assignedAgentUid].assignedActiveCount += 1;
            if (c.assignedTeamId && teamWorkload[c.assignedTeamId]) {
              teamWorkload[c.assignedTeamId].assignedActiveCount += 1;
            }
          }
        } else if (c.status === 'RESOLVED' || c.status === 'CLOSED') {
          if (c.assignedAgentUid) {
            if (!agentWorkload[c.assignedAgentUid]) {
              agentWorkload[c.assignedAgentUid] = { assignedActiveCount: 0, resolvedCount: 0 };
            }
            agentWorkload[c.assignedAgentUid].resolvedCount += 1;
          }
        }

        if (c.sla.firstRespondedAtIso) {
          const diffMin =
            (Date.parse(c.sla.firstRespondedAtIso) - Date.parse(c.createdAtIso)) / 60_000;
          if (diffMin >= 0) {
            firstRespSumMinutes += diffMin;
            firstRespCount += 1;
          }
        }
        if (c.sla.resolvedAtIso) {
          const diffMin =
            (Date.parse(c.sla.resolvedAtIso) - Date.parse(c.createdAtIso)) / 60_000;
          if (diffMin >= 0) {
            resolutionSumMinutes += diffMin;
            resolutionCount += 1;
          }
        }
        if (c.sla.firstResponseBreached) slaFirstResponseBreachCount += 1;
        if (c.sla.resolutionBreached) slaResolutionBreachCount += 1;
        if (c.status === 'ESCALATED') escalatedCount += 1;
        if (c.reopenCount > 0) reopenedCount += 1;
      }

      const totalCases = allCases.length;
      const breachedCases = allCases.filter(
        (c) => c.sla.firstResponseBreached || c.sla.resolutionBreached,
      ).length;
      const slaCompliancePercent =
        totalCases > 0 ? Math.round(((totalCases - breachedCases) / totalCases) * 1000) / 10 : 100;

      const csatSum = allCsat.reduce((sum, item) => sum + item.overallScore, 0);

      return {
        generatedAtIso: nowIso,
        openCaseCount,
        unassignedCaseCount,
        casesByCategory,
        casesByPriority,
        casesByStatus,
        averageFirstResponseMinutes:
          firstRespCount > 0 ? Math.round((firstRespSumMinutes / firstRespCount) * 10) / 10 : null,
        averageResolutionMinutes:
          resolutionCount > 0 ? Math.round((resolutionSumMinutes / resolutionCount) * 10) / 10 : null,
        slaCompliancePercent,
        slaFirstResponseBreachCount,
        slaResolutionBreachCount,
        escalationRatePercent:
          totalCases > 0 ? Math.round((escalatedCount / totalCases) * 1000) / 10 : 0,
        reopenedCaseRatePercent:
          totalCases > 0 ? Math.round((reopenedCount / totalCases) * 1000) / 10 : 0,
        agentWorkload,
        teamWorkload,
        customerSatisfaction: {
          totalResponses: allCsat.length,
          averageOverallScore:
            allCsat.length > 0 ? Math.round((csatSum / allCsat.length) * 100) / 100 : null,
        },
      };
    });
  }

  public async adminUpsertSupportTeam(
    adminPrincipal: AuthenticatedPrincipal,
    rawInput: unknown,
    correlationId = 'cs-admin-team-upsert',
  ): Promise<SupportTeamRecord> {
    if (!(await this.isPrincipalAdmin(adminPrincipal))) {
      throw new CoreApiError('FORBIDDEN', 403, 'Administrative privileges required to manage support teams.');
    }
    const obj = assertPlainObject(rawInput, 'Support team config');
    rejectUnknownOrMassAssignedKeys(
      obj,
      new Set([
        'teamId',
        'name',
        'description',
        'specializedCategories',
        'memberAgentUids',
        'leadAgentUid',
        'isRestrictedAccessTeam',
        'maxConcurrentCasesPerAgent',
        'active',
      ]),
    );

    const teamId = validateSafeId(obj.teamId, 'teamId');
    if (typeof obj.name !== 'string' || sanitizeTextInput(obj.name).length < 2) {
      throw new CoreApiError('VALIDATION_FAILED', 400, 'Team name is required.');
    }
    const specializedCategories = Array.isArray(obj.specializedCategories)
      ? obj.specializedCategories.filter(
          (c): c is SupportCaseCategory =>
            typeof c === 'string' && ALLOWED_CASE_CATEGORIES.includes(c as SupportCaseCategory),
        )
      : [];
    const memberAgentUids = Array.isArray(obj.memberAgentUids)
      ? obj.memberAgentUids.map((id) => validateSafeId(id, 'memberAgentUid'))
      : [];

    const nowIso = new Date().toISOString();
    const team = await this.repo.runInTransaction('cs.adminUpsertSupportTeam', async (tx) => {
      await this.ensureBaselineConfigInTx(tx, nowIso);
      const existing = await this.repo.getTeamInTx(tx, teamId);
      const record: SupportTeamRecord = {
        teamId,
        name: sanitizeTextInput(obj.name as string).slice(0, 100),
        description:
          typeof obj.description === 'string'
            ? sanitizeTextInput(obj.description).slice(0, 300)
            : (existing?.description ?? ''),
        specializedCategories,
        memberAgentUids,
        leadAgentUid:
          typeof obj.leadAgentUid === 'string'
            ? validateSafeId(obj.leadAgentUid, 'leadAgentUid')
            : (existing?.leadAgentUid ?? null),
        isRestrictedAccessTeam:
          typeof obj.isRestrictedAccessTeam === 'boolean'
            ? obj.isRestrictedAccessTeam
            : (existing?.isRestrictedAccessTeam ?? false),
        maxConcurrentCasesPerAgent:
          typeof obj.maxConcurrentCasesPerAgent === 'number' && obj.maxConcurrentCasesPerAgent >= 1
            ? Math.min(100, Math.floor(obj.maxConcurrentCasesPerAgent))
            : (existing?.maxConcurrentCasesPerAgent ?? 15),
        active: typeof obj.active === 'boolean' ? obj.active : true,
        createdAtIso: existing?.createdAtIso ?? nowIso,
        updatedAtIso: nowIso,
      };
      await this.repo.upsertTeamInTx(tx, record);
      return record;
    });

    await this.deps.auditSink.writeAuditEvent(
      createStructuredAuditEvent({
        principal: adminPrincipal,
        correlationId,
        action: 'admin.support_team.upserted',
        targetCollection: 'cs_teams',
        targetResourceId: team.teamId,
        outcome: 'SUCCESS',
        metadata: {
          isRestrictedAccessTeam: team.isRestrictedAccessTeam,
          membersCount: team.memberAgentUids.length,
        },
      }),
    );

    return team;
  }

  /**
   * Updates active SLA policy configuration with a new `policyVersion`.
   * Never rewrites historical SLA deadlines or outcomes on existing cases.
   */
  public async adminUpdateSlaPolicy(
    adminPrincipal: AuthenticatedPrincipal,
    rawInput: unknown,
    correlationId = 'cs-admin-sla-update',
  ): Promise<SlaPolicyRecord> {
    if (!(await this.isPrincipalAdmin(adminPrincipal))) {
      throw new CoreApiError('FORBIDDEN', 403, 'Administrative privileges required to update SLA policy.');
    }
    const obj = assertPlainObject(rawInput, 'SLA policy update');
    rejectUnknownOrMassAssignedKeys(
      obj,
      new Set([
        'policyVersion',
        'name',
        'priorityTargetsMinutes',
        'categoryOverridesMinutes',
        'warningThresholdPercent',
        'pauseOnStatuses',
        'calendar',
      ]),
    );

    const policyVersion = validateSafeId(obj.policyVersion, 'policyVersion');
    const nowIso = new Date().toISOString();

    const updated = await this.repo.runInTransaction('cs.adminUpdateSlaPolicy', async (tx) => {
      const { slaPolicy: current } = await this.ensureBaselineConfigInTx(tx, nowIso);
      const next: SlaPolicyRecord = {
        ...structuredClone(current),
        policyVersion,
        name:
          typeof obj.name === 'string'
            ? sanitizeTextInput(obj.name).slice(0, 120)
            : current.name,
        warningThresholdPercent:
          typeof obj.warningThresholdPercent === 'number' &&
          obj.warningThresholdPercent >= 10 &&
          obj.warningThresholdPercent <= 99
            ? obj.warningThresholdPercent
            : current.warningThresholdPercent,
        updatedByUid: adminPrincipal.uid,
        updatedAtIso: nowIso,
      };

      if (obj.priorityTargetsMinutes !== undefined) {
        const pt = assertPlainObject(obj.priorityTargetsMinutes, 'priorityTargetsMinutes');
        for (const prio of ALLOWED_CASE_PRIORITIES) {
          if (pt[prio] !== undefined) {
            const pObj = assertPlainObject(pt[prio], `priorityTargetsMinutes.${prio}`);
            const firstResp = Number(pObj.firstResponseMinutes);
            const resMin = Number(pObj.resolutionMinutes);
            const escMin = Number(pObj.escalationThresholdMinutes ?? firstResp * 2);
            if (!Number.isFinite(firstResp) || !Number.isFinite(resMin) || firstResp < 1 || resMin < firstResp) {
              throw new CoreApiError(
                'VALIDATION_FAILED',
                400,
                `Invalid SLA target minutes for priority ${prio}.`,
              );
            }
            next.priorityTargetsMinutes[prio] = {
              firstResponseMinutes: firstResp,
              resolutionMinutes: resMin,
              escalationThresholdMinutes: escMin,
            };
          }
        }
      }

      if (obj.calendar !== undefined) {
        const cal = assertPlainObject(obj.calendar, 'calendar');
        if (typeof cal.countOnlyBusinessHours === 'boolean') {
          next.calendar.countOnlyBusinessHours = cal.countOnlyBusinessHours;
        }
        if (Array.isArray(cal.holidaysIsoDates)) {
          next.calendar.holidaysIsoDates = cal.holidaysIsoDates.filter(
            (d): d is string => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d),
          );
        }
      }

      this.repo.setActiveSlaPolicyInTx(tx, next);
      return next;
    });

    await this.deps.auditSink.writeAuditEvent(
      createStructuredAuditEvent({
        principal: adminPrincipal,
        correlationId,
        action: 'admin.sla_policy.updated',
        targetCollection: 'cs_sla_policies',
        targetResourceId: updated.policyVersion,
        outcome: 'SUCCESS',
        metadata: { policyVersion: updated.policyVersion },
      }),
    );

    return updated;
  }

  public async adminUpsertResponseTemplate(
    adminPrincipal: AuthenticatedPrincipal,
    rawInput: unknown,
    correlationId = 'cs-admin-template-upsert',
  ): Promise<SupportResponseTemplateRecord> {
    if (!(await this.isPrincipalAdmin(adminPrincipal))) {
      throw new CoreApiError('FORBIDDEN', 403, 'Administrative privileges required.');
    }
    const obj = assertPlainObject(rawInput, 'Response template');
    rejectUnknownOrMassAssignedKeys(
      obj,
      new Set(['templateId', 'name', 'category', 'subjectTemplate', 'bodyTemplate', 'placeholders', 'active']),
    );

    const templateId = validateSafeId(obj.templateId, 'templateId');
    if (typeof obj.name !== 'string' || typeof obj.bodyTemplate !== 'string') {
      throw new CoreApiError('VALIDATION_FAILED', 400, 'name and bodyTemplate are required.');
    }
    const category: SupportCaseCategory =
      typeof obj.category === 'string' && ALLOWED_CASE_CATEGORIES.includes(obj.category as SupportCaseCategory)
        ? (obj.category as SupportCaseCategory)
        : 'GENERAL_CUSTOMER_INQUIRIES';

    const nowIso = new Date().toISOString();
    const tpl: SupportResponseTemplateRecord = {
      templateId,
      name: sanitizeTextInput(obj.name).slice(0, 80),
      category,
      subjectTemplate:
        typeof obj.subjectTemplate === 'string'
          ? sanitizeTextInput(obj.subjectTemplate).slice(0, 140)
          : '',
      bodyTemplate: sanitizeTextInput(obj.bodyTemplate).slice(0, 2000),
      placeholders: Array.isArray(obj.placeholders)
        ? obj.placeholders.filter((p): p is string => typeof p === 'string')
        : [],
      active: obj.active !== false,
      updatedByUid: adminPrincipal.uid,
      updatedAtIso: nowIso,
    };

    await this.repo.runInTransaction('cs.adminUpsertResponseTemplate', (tx) =>
      this.repo.upsertResponseTemplateInTx(tx, tpl),
    );

    await this.deps.auditSink.writeAuditEvent(
      createStructuredAuditEvent({
        principal: adminPrincipal,
        correlationId,
        action: 'admin.response_template.upserted',
        targetCollection: 'cs_response_templates',
        targetResourceId: tpl.templateId,
        outcome: 'SUCCESS',
        metadata: { category },
      }),
    );

    return tpl;
  }
}
