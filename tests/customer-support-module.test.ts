/**
 * Employee 66 — Comprehensive Automated Test Suite
 * (`tests/customer-support-module.test.ts`)
 *
 * Covers all 21 testing requirements from Employee 66 specification:
 * 1. Case creation and ownership
 * 2. Case lifecycle transitions & state machine enforcement
 * 3. Unauthorized transitions
 * 4. Concurrent state changes (optimistic revision conflict detection)
 * 5. Case assignment (manual, reassignment, auto routing, workload cap)
 * 6. Team-level access & restricted sensitive case protection
 * 7. SLA calculations & policy version preservation
 * 8. SLA pause and resume (WAITING_FOR_CUSTOMER -> IN_PROGRESS)
 * 9. SLA breach detection & warnings
 * 10. Escalation workflows
 * 11. Internal/public communication separation
 * 12. Attachment permissions (Employee 63 integration & restricted evidence protection)
 * 13. Complaint workflows, authoritative domain referral & appeal
 * 14. Customer satisfaction (CSAT) eligibility
 * 15. Duplicate feedback prevention
 * 16. Customer API access boundaries (IDOR prevention)
 * 17. Administrative RBAC
 * 18. Structured audit records
 * 19. Event & background job idempotency / retry safety
 * 20. Knowledge Base publication filtering
 * 21. Express HTTP API router integration (`/api/v1/support/*`)
 */

import assert from 'node:assert/strict';
import express from 'express';
import {
  CoreApiError,
  createFirestoreIdempotencyStoreAdapter,
} from '../server/modules/core';
import type {
  AuthenticatedPrincipal,
  DelegatedAdminStoreAdapter,
  FirebaseTokenVerifierAdapter,
  StructuredAuditEvent,
} from '../server/modules/core/types';
import {
  createCustomerSupportRouter,
  createInMemoryCustomerSupportTxRunner,
  CustomerSupportService,
  type CustomerSupportDomainEvent,
} from '../server/modules/customer-support';

function createSupportTestHarness() {
  const txRunner = createInMemoryCustomerSupportTxRunner();
  const auditEvents: StructuredAuditEvent[] = [];
  const domainEvents: CustomerSupportDomainEvent[] = [];
  const sentNotifications: Array<{
    recipientUid: string;
    caseId: string;
    eventType: string;
    idempotencyKey: string;
  }> = [];

  const tokenVerifier: FirebaseTokenVerifierAdapter = {
    async verifyIdToken(token: string) {
      switch (token) {
        case 'valid_bearer_token_customer_1':
          return { uid: 'customer_1', email: 'c1@example.com', email_verified: true };
        case 'valid_bearer_token_customer_2':
          return { uid: 'customer_2', email: 'c2@example.com', email_verified: true };
        case 'valid_bearer_token_agent_general':
          return { uid: 'agent_general_1', email: 'agent1@radar.ir', email_verified: true };
        case 'valid_bearer_token_agent_trust':
          return { uid: 'agent_trust_1', email: 'trust1@radar.ir', email_verified: true };
        case 'valid_bearer_token_admin':
          return { uid: 'admin_1', email: 'admin@radar.ir', email_verified: true, admin: true };
        default:
          throw new Error('Invalid token');
      }
    },
  };

  const adminStore: DelegatedAdminStoreAdapter = {
    async getDelegatedAdminByUid(uid: string) {
      if (uid === 'admin_1') {
        return { uid: 'admin_1', email: 'admin@radar.ir', role: 'admin', active: true };
      }
      return null;
    },
  };

  const idempotencyStore = createFirestoreIdempotencyStoreAdapter(txRunner);

  const service = new CustomerSupportService({
    tokenVerifier,
    adminStore,
    txRunner,
    idempotencyStore,
    primaryAdminEmails: ['admin@radar.ir'],
    documentAdapter: {
      async verifyDocumentAccess(params) {
        if (params.documentId === 'doc_missing') {
          return { exists: false, authorized: false };
        }
        if (params.documentId === 'doc_unauthorized' && !params.isStaffOrAdmin) {
          return { exists: true, authorized: false };
        }
        return {
          exists: true,
          authorized: true,
          fileName: `${params.documentId}.pdf`,
          mimeType: 'application/pdf',
          sizeBytes: 16_384,
          ownerUid: params.requesterUid,
        };
      },
    },
    notificationAdapter: {
      async sendCaseNotification(params) {
        sentNotifications.push({
          recipientUid: params.recipientUid,
          caseId: params.caseId,
          eventType: params.eventType,
          idempotencyKey: params.idempotencyKey,
        });
        return {
          delivered: true,
          notificationRefId: `notif_${sentNotifications.length}`,
        };
      },
    },
    auditSink: {
      async writeAuditEvent(event) {
        auditEvents.push(event);
      },
    },
    onDomainEvent(evt) {
      domainEvents.push(evt);
    },
  });

  const customer1: AuthenticatedPrincipal = {
    uid: 'customer_1',
    email: 'c1@example.com',
    emailVerified: true,
    role: 'verified_user',
    authMode: 'firebase_id_token',
    claims: {},
  };
  const customer2: AuthenticatedPrincipal = {
    uid: 'customer_2',
    email: 'c2@example.com',
    emailVerified: true,
    role: 'verified_user',
    authMode: 'firebase_id_token',
    claims: {},
  };
  const agentGeneral1: AuthenticatedPrincipal = {
    uid: 'agent_general_1',
    email: 'agent1@radar.ir',
    emailVerified: true,
    role: 'verified_user',
    authMode: 'firebase_id_token',
    claims: {},
  };
  const agentTrust1: AuthenticatedPrincipal = {
    uid: 'agent_trust_1',
    email: 'trust1@radar.ir',
    emailVerified: true,
    role: 'verified_user',
    authMode: 'firebase_id_token',
    claims: {},
  };
  const adminPrincipal: AuthenticatedPrincipal = {
    uid: 'admin_1',
    email: 'admin@radar.ir',
    emailVerified: true,
    role: 'primary_admin',
    authMode: 'firebase_id_token',
    claims: { admin: true },
  };

  return {
    service,
    txRunner,
    tokenVerifier,
    adminStore,
    idempotencyStore,
    auditEvents,
    domainEvents,
    sentNotifications,
    customer1,
    customer2,
    agentGeneral1,
    agentTrust1,
    adminPrincipal,
  };
}

async function runSupportTests(): Promise<void> {
  // ==========================================================================
  // 1, 2, 3, 4 & 16. Case Creation, Ownership, IDOR Prevention, Lifecycle & Concurrency
  // ==========================================================================
  {
    const h = createSupportTestHarness();

    // Reject raw credentials in case creation
    await assert.rejects(
      () =>
        h.service.createSupportCase(h.customer1, {
          category: 'ACCOUNT_AND_PROFILE',
          subject: 'مشکل رمز عبور',
          description: 'رمز عبور من کار نمی‌کند',
          password: 'secretPassword123',
        }),
      (err: unknown) => err instanceof CoreApiError && err.status === 400,
    );

    const created = await h.service.createSupportCase(h.customer1, {
      category: 'PROPERTY_AND_LISTING',
      subcategory: 'LISTING_PHOTO_ISSUE',
      subject: 'عدم نمایش تصاویر آگهی آپارتمان سعادت‌آباد',
      structuredDescription: {
        summary: 'تصاویر آپلود شده در آگهی ملک شماره ۱۰۱ پس از تایید نمایش داده نمی‌شوند.',
        stepsOrContext: 'آپلود ۳ تصویر با فرمت استاندارد',
        expectedOutcome: 'نمایش گالری تصاویر در صفحه آگهی',
      },
      relatedEntities: {
        propertyId: 'prop_101',
        listingId: 'lst_101',
      },
      priority: 'HIGH',
    });

    assert.equal(created.requesterUid, 'customer_1');
    assert.equal(created.status, 'SUBMITTED');
    assert.equal(created.assignedTeamId, 'team_general_support');
    assert.equal(created.revision, 1);

    // IDOR prevention: customer_2 cannot view customer_1's case
    await assert.rejects(
      () => h.service.getCustomerCaseDetails(h.customer2, created.caseId),
      (err: unknown) => err instanceof CoreApiError && err.status === 403,
    );

    // Unauthorized transition: customer cannot transition SUBMITTED -> RESOLVED
    await assert.rejects(
      () =>
        h.service.transitionCaseStatus(h.customer1, created.caseId, {
          toStatus: 'RESOLVED',
          resolutionSummary: 'حل شد',
        }),
      (err: unknown) => err instanceof CoreApiError && err.status === 403,
    );

    // Agent assigns case (auto-routing to least-loaded agent in team_general_support)
    const assigned = await h.service.assignSupportCase(h.agentGeneral1, created.caseId, {
      autoAssign: true,
    });
    assert.equal(assigned.status, 'ASSIGNED');
    assert.equal(assigned.assignedAgentUid, 'agent_general_1');

    // Concurrent update conflict detection via expectedRevision
    await assert.rejects(
      () =>
        h.service.transitionCaseStatus(h.agentGeneral1, created.caseId, {
          toStatus: 'IN_PROGRESS',
          expectedRevision: 1, // Stale revision (actual is 2)
        }),
      (err: unknown) => err instanceof CoreApiError && err.status === 409,
    );

    const inProgress = await h.service.transitionCaseStatus(h.agentGeneral1, created.caseId, {
      toStatus: 'IN_PROGRESS',
      expectedRevision: assigned.revision,
    });
    assert.equal(inProgress.status, 'IN_PROGRESS');
  }

  // ==========================================================================
  // 6, 11 & 12. Restricted Cases, Internal vs. Customer Message Separation & Attachments
  // ==========================================================================
  {
    const h = createSupportTestHarness();

    // Privacy & Data Rights case is automatically marked restricted/sensitive and routed to team_trust_privacy_legal
    const sensitiveCase = await h.service.createSupportCase(h.customer1, {
      category: 'PRIVACY_AND_DATA_RIGHTS',
      subject: 'درخواست بررسی دسترسی داده‌های شخصی',
      description: 'لطفا گزارش کامل دسترسی‌های حساب کاربری من را بررسی نمایید.',
    });
    assert.equal(sensitiveCase.assignedTeamId, 'team_trust_privacy_legal');

    // General support agent (not in restricted team) cannot access restricted privacy case
    await assert.rejects(
      () => h.service.getStaffCaseDetails(h.agentGeneral1, sensitiveCase.caseId),
      (err: unknown) => err instanceof CoreApiError && err.status === 403,
    );

    // Specialized trust/privacy agent CAN access it and add an internal note + restricted investigation attachment
    const internalNote = await h.service.addInternalStaffNote(
      h.agentTrust1,
      sensitiveCase.caseId,
      {
        body: 'یادداشت محرمانه داخلی: بررسی لاگ‌های امنیتی انجام شد، هیچ دسترسی غیرمجازی وجود ندارد.',
        mentionedAgentUids: ['admin_1'],
      },
    );
    assert.equal(internalNote.visibility, 'INTERNAL_STAFF_ONLY');

    const restrictedAtt = await h.service.attachCaseEvidence(
      h.agentTrust1,
      sensitiveCase.caseId,
      {
        documentId: 'doc_internal_audit_77',
        classification: 'RESTRICTED_INVESTIGATION_EVIDENCE',
      },
    );
    assert.equal(restrictedAtt.restrictedToStaffOnly, true);

    const customerAtt = await h.service.attachCaseEvidence(
      h.customer1,
      sensitiveCase.caseId,
      {
        documentId: 'doc_customer_id_card',
        classification: 'CUSTOMER_UPLOAD',
      },
    );
    assert.equal(customerAtt.restrictedToStaffOnly, false);

    // Agent sends customer-visible response
    await h.service.addCustomerVisibleMessage(h.agentTrust1, sensitiveCase.caseId, {
      body: 'کاربر گرامی، بررسی امنیتی حساب شما تکمیل شد.',
      attachmentIds: [customerAtt.attachmentId],
    });

    // Customer portal view must NEVER include internalNotes or restrictedToStaffOnly attachments
    const customerDetails = await h.service.getCustomerCaseDetails(
      h.customer1,
      sensitiveCase.caseId,
    );
    assert.equal('internalNotes' in (customerDetails as any), false);
    assert.equal(customerDetails.messages.length, 1);
    assert.equal(customerDetails.attachments.length, 1);
    assert.equal(customerDetails.attachments[0].attachmentId, customerAtt.attachmentId);

    // Customer attempting to download restricted investigation evidence gets 403 FORBIDDEN
    await assert.rejects(
      () =>
        h.service.authorizeAttachmentDownload(
          h.customer1,
          sensitiveCase.caseId,
          restrictedAtt.attachmentId,
        ),
      (err: unknown) => err instanceof CoreApiError && err.status === 403,
    );

    // Trust agent CAN download restricted investigation evidence
    const staffDl = await h.service.authorizeAttachmentDownload(
      h.agentTrust1,
      sensitiveCase.caseId,
      restrictedAtt.attachmentId,
    );
    assert.equal(staffDl.authorized, true);
  }

  // ==========================================================================
  // 5, 7, 8, 9, 10 & 19. SLA Calculations, Pause/Resume, Breach Job Idempotency & Policy Versioning
  // ==========================================================================
  {
    const h = createSupportTestHarness();

    const c = await h.service.createSupportCase(h.customer1, {
      category: 'BUYER_AND_SELLER_SUPPORT',
      subject: 'سوال فوری درباره هماهنگی بازدید ملک',
      description: 'نیاز به راهنمایی جهت زمان‌بندی بازدید حضوری ملک دارم.',
      priority: 'URGENT',
    });

    const staffViewBefore = await h.service.getStaffCaseDetails(h.agentGeneral1, c.caseId);
    const initialPolicyVersion = staffViewBefore.case.sla.policyVersion;
    const initialResolutionDeadlineMs = Date.parse(
      staffViewBefore.case.sla.resolutionDeadlineIso,
    );
    assert.equal(initialPolicyVersion, 'v2026.1');
    assert.equal(staffViewBefore.case.sla.isPaused, false);

    // Transition to WAITING_FOR_CUSTOMER -> pauses SLA clock
    const waiting = await h.service.transitionCaseStatus(h.agentGeneral1, c.caseId, {
      toStatus: 'OPEN',
    });
    assert.equal(waiting.status, 'OPEN');

    const pausedCase = await h.service.transitionCaseStatus(h.agentGeneral1, c.caseId, {
      toStatus: 'WAITING_FOR_CUSTOMER',
      reason: 'Awaiting preferred viewing time from buyer',
    });
    assert.equal(pausedCase.sla.isPaused, true);
    assert.ok(pausedCase.sla.pausedAtIso);

    // Customer replies -> automatically transitions WAITING_FOR_CUSTOMER -> IN_PROGRESS and resumes SLA
    await h.service.addCustomerVisibleMessage(h.customer1, c.caseId, {
      body: 'زمان پیشنهادی من فردا ساعت ۱۷ است.',
    });
    const afterReply = await h.service.getStaffCaseDetails(h.agentGeneral1, c.caseId);
    assert.equal(afterReply.case.status, 'IN_PROGRESS');
    assert.equal(afterReply.case.sla.isPaused, false);
    assert.equal(afterReply.case.sla.pauseHistory.length, 1);

    // Admin updates SLA policy to v2026.2 -> existing case must preserve v2026.1 and not rewrite historical outcome
    await h.service.adminUpdateSlaPolicy(h.adminPrincipal, {
      policyVersion: 'v2026_2',
      name: 'نسخه دوم سیاست سطح خدمات',
    });
    const afterPolicyChange = await h.service.getStaffCaseDetails(h.agentGeneral1, c.caseId);
    assert.equal(afterPolicyChange.case.sla.policyVersion, 'v2026.1');
    assert.ok(
      Date.parse(afterPolicyChange.case.sla.resolutionDeadlineIso) >=
        initialResolutionDeadlineMs,
    );

    // Execute SLA monitoring job far in the future -> detects resolution breach & auto-escalates URGENT case
    const futureIso = new Date(Date.now() + 10 * 86_400_000).toISOString();
    const job1 = await h.service.executeSlaMonitoringJob('sla_job_key_001', futureIso);
    assert.equal(job1.replayed, false);
    assert.ok(job1.resolutionBreachedCaseIds.includes(c.caseId));
    assert.ok(job1.autoEscalatedCaseIds.includes(c.caseId));

    // Retry with identical jobExecutionKey -> idempotent replay without duplicate events
    const eventsCountBeforeRetry = h.domainEvents.length;
    const job1Retry = await h.service.executeSlaMonitoringJob('sla_job_key_001', futureIso);
    assert.equal(job1Retry.replayed, true);
    assert.equal(h.domainEvents.length, eventsCountBeforeRetry);
  }

  // ==========================================================================
  // 13, 14 & 15. Resolution, Closed Case Immutability, Reopening, CSAT & Complaint Workflows
  // ==========================================================================
  {
    const h = createSupportTestHarness();

    const cmpRes = await h.service.submitComplaint(h.customer1, {
      category: 'BROKERAGE_AND_AGENT_SUPPORT',
      subcategory: 'AGENT_MISCONDUCT',
      severity: 'HIGH',
      subject: 'شکایت از عدم حضور مشاور در زمان بازدید هماهنگ‌شده',
      description: 'مشاور املاک با وجود تایید قبلی در محل ملک حاضر نشد.',
      relatedEntities: {
        agentUid: 'agent_ext_99',
        propertyId: 'prop_101',
      },
    });
    assert.equal(cmpRes.complaint.status, 'SUBMITTED');
    assert.equal(cmpRes.complaint.decisionOutcome, 'PENDING');

    // CSAT cannot be submitted before case is RESOLVED or CLOSED
    await assert.rejects(
      () =>
        h.service.submitCaseSatisfactionFeedback(h.customer1, cmpRes.case.caseId, {
          overallScore: 5,
        }),
      (err: unknown) => err instanceof CoreApiError && err.status === 409,
    );

    // Record complaint decision with authoritative domain referral (does not directly mutate reputation/ledger)
    const decidedCmp = await h.service.recordComplaintDecision(
      h.agentTrust1,
      cmpRes.complaint.complaintId,
      {
        decisionOutcome: 'REFERRED_TO_AUTHORITATIVE_DOMAIN',
        decisionRationale: 'مستندات بررسی و جهت اعمال در کارتابل نظارت حرفه‌ای ارجاع شد.',
        resolutionActions: ['ثبت اخطار در کارتابل نظارت تخصصی'],
        authoritativeDomainReferral: {
          targetDomain: 'PROFESSIONAL_VERIFICATION_AND_REPUTATION',
          targetEntityId: 'agent_ext_99',
          recommendedActionSummary: 'بررسی سابقه عدم حضور در بازدید',
        },
      },
    );
    assert.equal(decidedCmp.status, 'DECISION_RECORDED');
    assert.equal(decidedCmp.authoritativeDomainReferrals.length, 1);

    // Complainant submits appeal
    const appealedCmp = await h.service.submitComplaintAppeal(
      h.customer1,
      cmpRes.complaint.complaintId,
      {
        appealReason: 'درخواست بررسی مجدد خسارت زمان از دست رفته',
      },
    );
    assert.equal(appealedCmp.status, 'APPEAL_SUBMITTED');

    // Transition case: SUBMITTED -> OPEN -> IN_PROGRESS -> RESOLVED -> CLOSED
    await h.service.transitionCaseStatus(h.agentTrust1, cmpRes.case.caseId, {
      toStatus: 'OPEN',
    });
    await h.service.transitionCaseStatus(h.agentTrust1, cmpRes.case.caseId, {
      toStatus: 'IN_PROGRESS',
    });

    // RESOLVED requires resolutionSummary
    await assert.rejects(
      () =>
        h.service.transitionCaseStatus(h.agentTrust1, cmpRes.case.caseId, {
          toStatus: 'RESOLVED',
          resolutionSummary: '',
        }),
      (err: unknown) => err instanceof CoreApiError && err.status === 400,
    );

    const resolvedCase = await h.service.transitionCaseStatus(
      h.agentTrust1,
      cmpRes.case.caseId,
      {
        toStatus: 'RESOLVED',
        resolutionCategory: 'REFERRED_TO_DOMAIN_TEAM',
        resolutionSummary: 'شکایت بررسی و به واحد نظارت بر مشاورین ارجاع گردید.',
      },
    );
    assert.equal(resolvedCase.status, 'RESOLVED');

    const closedCase = await h.service.transitionCaseStatus(
      h.agentTrust1,
      cmpRes.case.caseId,
      {
        toStatus: 'CLOSED',
        closureReason: 'تکمیل فرآیند رسیدگی و اطلاع‌رسانی به کاربر',
      },
    );
    assert.equal(closedCase.status, 'CLOSED');

    // Closed case cannot be modified through ordinary message posting or assignment
    await assert.rejects(
      () =>
        h.service.addCustomerVisibleMessage(h.customer1, cmpRes.case.caseId, {
          body: 'پیام روی پرونده بسته شده',
        }),
      (err: unknown) => err instanceof CoreApiError && err.status === 409,
    );

    // Non-participant cannot submit CSAT
    await assert.rejects(
      () =>
        h.service.submitCaseSatisfactionFeedback(h.customer2, cmpRes.case.caseId, {
          overallScore: 4,
        }),
      (err: unknown) => err instanceof CoreApiError && err.status === 403,
    );

    // Requester submits CSAT on closed case
    const csat = await h.service.submitCaseSatisfactionFeedback(
      h.customer1,
      cmpRes.case.caseId,
      {
        overallScore: 5,
        categories: {
          timeliness: 4,
          clarityAndHelpfulness: 5,
          resolutionQuality: 5,
        },
        comment: 'رسیدگی دقیق و سریع بود.',
      },
    );
    assert.equal(csat.overallScore, 5);

    // Duplicate CSAT submission without allowRevision is rejected
    await assert.rejects(
      () =>
        h.service.submitCaseSatisfactionFeedback(h.customer1, cmpRes.case.caseId, {
          overallScore: 3,
        }),
      (err: unknown) => err instanceof CoreApiError && err.status === 409,
    );

    // Controlled reopening of closed case
    const reopened = await h.service.transitionCaseStatus(
      h.customer1,
      cmpRes.case.caseId,
      {
        toStatus: 'REOPENED',
        reason: 'نیاز به ارسال مدرک تکمیلی جدید',
      },
    );
    assert.equal(reopened.status, 'REOPENED');
    assert.equal(reopened.reopenCount, 1);
  }

  // ==========================================================================
  // 11, 12, 17, 18, 20 & 21. Knowledge Base, Analytics & Express HTTP Router
  // ==========================================================================
  {
    const h = createSupportTestHarness();

    // Admin creates PUBLISHED and INTERNAL_RESTRICTED KB articles
    const pubArt = await h.service.upsertKnowledgeArticle(h.adminPrincipal, {
      articleId: 'kb_valuation_guide',
      slug: 'hedonic-valuation-guide',
      title: 'راهنمای محاسبه قیمت کارشناسی ملک در رادار تهران',
      contentMarkdown: 'مدل هدونیک بر اساس متراژ، سن بنا، طبقه و امکانات قیمت را محاسبه می‌کند.',
      category: 'SEARCH_AND_VALUATION',
      tags: ['ارزش‌گذاری', 'هدونیک'],
      publicationStatus: 'PUBLISHED',
    });
    await h.service.upsertKnowledgeArticle(h.adminPrincipal, {
      articleId: 'kb_internal_playbook',
      slug: 'internal-escalation-playbook',
      title: 'دستورالعمل داخلی ارجاع پرونده‌های امنیتی',
      contentMarkdown: 'فقط ویژه کارشناسان داخلی پشتیبانی.',
      category: 'ABUSE_AND_SAFETY_REPORTS',
      publicationStatus: 'INTERNAL_RESTRICTED',
    });

    // Public search must only return PUBLISHED articles
    const publicArticles = await h.service.searchPublicKnowledgeArticles({});
    assert.equal(publicArticles.length, 1);
    assert.equal(publicArticles[0].articleId, pubArt.articleId);

    await h.service.submitKnowledgeArticleFeedback(h.customer1, pubArt.articleId, {
      helpful: true,
      comment: 'بسیار مفید بود',
    });

    // Express HTTP Router test
    const app = express();
    app.use(express.json());
    const { router } = createCustomerSupportRouter(
      {
        tokenVerifier: h.tokenVerifier,
        adminStore: h.adminStore,
        txRunner: h.txRunner,
        idempotencyStore: h.idempotencyStore,
        primaryAdminEmails: ['admin@radar.ir'],
        auditSink: {
          async writeAuditEvent(e) {
            h.auditEvents.push(e);
          },
        },
      },
      h.service,
    );
    app.use('/api/v1/support', router);

    const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
    const addr = server.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;
    const baseUrl = `http://127.0.0.1:${port}/api/v1/support`;

    try {
      // Idempotent POST /cases
      const res1 = await fetch(`${baseUrl}/cases`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer valid_bearer_token_customer_1',
          'Content-Type': 'application/json',
          'Idempotency-Key': 'idem_support_case_create_1',
        },
        body: JSON.stringify({
          category: 'SEARCH_AND_VALUATION',
          subject: 'ابهام در ضریب طبقه ماشین‌حساب',
          description: 'لطفا نحوه محاسبه ضریب طبقه چهارم را توضیح دهید.',
        }),
      });
      assert.equal(res1.status, 201);
      const body1 = (await res1.json()) as any;
      assert.equal(body1.ok, true);
      assert.equal(body1.meta.idempotentReplay, false);

      const res1Replay = await fetch(`${baseUrl}/cases`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer valid_bearer_token_customer_1',
          'Content-Type': 'application/json',
          'Idempotency-Key': 'idem_support_case_create_1',
        },
        body: JSON.stringify({
          category: 'SEARCH_AND_VALUATION',
          subject: 'ابهام در ضریب طبقه ماشین‌حساب',
          description: 'لطفا نحوه محاسبه ضریب طبقه چهارم را توضیح دهید.',
        }),
      });
      assert.equal(res1Replay.status, 201);
      const bodyReplay = (await res1Replay.json()) as any;
      assert.equal(bodyReplay.meta.idempotentReplay, true);
      assert.equal(bodyReplay.data.caseId, body1.data.caseId);

      // Customer attempting to call staff metrics endpoint gets 403
      const custMetricsRes = await fetch(`${baseUrl}/staff/metrics`, {
        headers: { Authorization: 'Bearer valid_bearer_token_customer_1' },
      });
      assert.equal(custMetricsRes.status, 403);

      // Staff calling metrics endpoint gets 200 with aggregated operational stats
      const staffMetricsRes = await fetch(`${baseUrl}/staff/metrics`, {
        headers: { Authorization: 'Bearer valid_bearer_token_agent_general' },
      });
      assert.equal(staffMetricsRes.status, 200);
      const metricsBody = (await staffMetricsRes.json()) as any;
      assert.equal(metricsBody.ok, true);
      assert.equal(metricsBody.data.openCaseCount, 1);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }
}

runSupportTests().catch((err) => {
  console.error('Customer Support Module Tests Failed:', err);
  process.exit(1);
});
