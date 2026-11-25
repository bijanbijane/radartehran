/**
 * @file server/modules/leads/leadRoutes.ts
 * @description Standalone Express Router factory for Real Estate Lead Management & CRM module.
 * Provides RESTful API endpoints for Customers, Professionals, Agencies, and Admins.
 */

import { Router, type Request, type Response } from 'express';
import {
  buildErrorEnvelope,
  buildSuccessEnvelope,
  extractAuthenticatedPrincipal,
  resolveCorrelationId,
  type AuthenticatedPrincipal,
  type CanonicalApiErrorCode,
  type FirebaseTokenVerifierAdapter,
} from '../core';
import type { LeadEngine } from './leadEngine';
import type {
  InquiryIntent,
  LeadActivityType,
  LeadLifecycleState,
  PreferredContactMethod,
  PropertyCategory,
} from './leadTypes';

function resolveTrustedLeadActorRole(principal: AuthenticatedPrincipal): 'ADMIN' | 'PROFESSIONAL' {
  const claimRole = principal.claims?.platformRole ?? principal.claims?.role;
  return ['ADMIN', 'primary_admin', 'delegated_admin'].includes(String(claimRole)) ? 'ADMIN' : 'PROFESSIONAL';
}

export function createLeadRouter(
  engine: LeadEngine,
  tokenVerifier?: FirebaseTokenVerifierAdapter,
): Router {
  const router = Router();

  async function resolvePrincipal(req: Request) {
    if (!tokenVerifier || typeof tokenVerifier.verifyIdToken !== 'function') {
      return {
        ok: false,
        status: 503,
        failureCode: 'INTERNAL_ERROR' as CanonicalApiErrorCode,
        reason: 'سرویس تایید هویت در دسترس نیست (Fail-Closed).',
      };
    }
    const ext = await extractAuthenticatedPrincipal(req, tokenVerifier, { requireVerifiedEmail: true });
    return {
      ok: ext.ok,
      principal: ext.principal,
      status: ext.status ?? 401,
      failureCode: (ext.status === 403 ? 'FORBIDDEN' : (ext.status ?? 401) >= 500 ? 'INTERNAL_ERROR' : 'UNAUTHENTICATED') as CanonicalApiErrorCode,
      reason: ext.reason ?? 'احراز هویت الزامی است.',
    };
  }

  // --- Customer Inquiries Creation ---

  router.post('/property-inquiry', async (req: Request, res: Response) => {
    const cid = resolveCorrelationId(req);
    const auth = await resolvePrincipal(req);
    if (!auth.ok || !auth.principal) {
      return res.status(auth.status || 401).json(buildErrorEnvelope(auth.failureCode, auth.reason, cid));
    }

    const b = req.body;
    const result = await engine.createLead(auth.principal.uid, {
      leadType: 'PROPERTY_INQUIRY',
      intent: (b.intent as InquiryIntent) || 'CALLBACK_REQUEST',
      targetListingId: b.targetListingId,
      customerDisplayName: b.customerDisplayName || auth.principal.email?.split('@')[0] || 'متقاضی',
      customerPhone: b.customerPhone,
      customerEmail: b.customerEmail || auth.principal.email,
      preferredContactMethod: (b.preferredContactMethod as PreferredContactMethod) || 'PHONE',
      requirements: b.requirements || { cityId: 'tehran', propertyCategory: 'RESIDENTIAL_APARTMENT', transactionType: 'BUY' },
      consentPurpose: b.consentPurpose || 'تماس جهت ارائه مشاوره و جزئیات فایل ملکی',
      consentTextVersion: b.consentTextVersion || 'v1.0',
      marketingOptIn: b.marketingOptIn,
      agencySharingConsent: b.agencySharingConsent,
      idempotencyKey: b.idempotencyKey,
    });

    if (!result.success || !result.lead) {
      return res.status(400).json(buildErrorEnvelope('VALIDATION_FAILED', result.errors?.join('; ') || 'خطا در ثبت سرنخ.', cid));
    }

    return res.status(result.replayed ? 200 : 201).json(
      buildSuccessEnvelope({ lead: engine.projectCustomerLead(result.lead), replayed: result.replayed }, cid),
    );
  });

  router.post('/general-requirement', async (req: Request, res: Response) => {
    const cid = resolveCorrelationId(req);
    const auth = await resolvePrincipal(req);
    if (!auth.ok || !auth.principal) {
      return res.status(auth.status || 401).json(buildErrorEnvelope(auth.failureCode, auth.reason, cid));
    }

    const b = req.body;
    const result = await engine.createLead(auth.principal.uid, {
      leadType: 'GENERAL_PROPERTY_REQUIREMENT',
      intent: (b.intent as InquiryIntent) || 'DIRECT_CONSULTATION',
      customerDisplayName: b.customerDisplayName || auth.principal.email?.split('@')[0] || 'متقاضی',
      customerPhone: b.customerPhone,
      customerEmail: b.customerEmail || auth.principal.email,
      preferredContactMethod: (b.preferredContactMethod as PreferredContactMethod) || 'PHONE',
      requirements: b.requirements || {},
      consentPurpose: b.consentPurpose || 'جستجوی ملک متناسب با نیازمندی‌های اعلام‌شده',
      consentTextVersion: b.consentTextVersion || 'v1.0',
      marketingOptIn: b.marketingOptIn,
      agencySharingConsent: b.agencySharingConsent,
      idempotencyKey: b.idempotencyKey,
    });

    if (!result.success || !result.lead) {
      return res.status(400).json(buildErrorEnvelope('VALIDATION_FAILED', result.errors?.join('; ') || 'خطا در ثبت نیازمندی ملک.', cid));
    }

    return res.status(result.replayed ? 200 : 201).json(
      buildSuccessEnvelope({ lead: engine.projectCustomerLead(result.lead), replayed: result.replayed }, cid),
    );
  });

  router.post('/commercial-inquiry', async (req: Request, res: Response) => {
    const cid = resolveCorrelationId(req);
    const auth = await resolvePrincipal(req);
    if (!auth.ok || !auth.principal) {
      return res.status(auth.status || 401).json(buildErrorEnvelope(auth.failureCode, auth.reason, cid));
    }

    const b = req.body;
    const result = await engine.createLead(auth.principal.uid, {
      leadType: 'COMMERCIAL_OFFICE_INQUIRY',
      intent: (b.intent as InquiryIntent) || 'DIRECT_CONSULTATION',
      targetListingId: b.targetListingId,
      customerDisplayName: b.customerDisplayName || 'متقاضی تجاری',
      customerPhone: b.customerPhone,
      customerEmail: b.customerEmail,
      preferredContactMethod: (b.preferredContactMethod as PreferredContactMethod) || 'PHONE',
      requirements: { ...(b.requirements || {}), propertyCategory: (b.requirements?.propertyCategory as PropertyCategory) || 'OFFICE_SPACE' },
      consentPurpose: b.consentPurpose || 'ارائه مشاوره تخصصی در زمینه املاک تجاری و اداری',
      consentTextVersion: b.consentTextVersion || 'v1.0',
      idempotencyKey: b.idempotencyKey,
    });

    if (!result.success || !result.lead) {
      return res.status(400).json(buildErrorEnvelope('VALIDATION_FAILED', result.errors?.join('; ') || 'خطا در ثبت استعلام اداری/تجاری.', cid));
    }

    return res.status(result.replayed ? 200 : 201).json(
      buildSuccessEnvelope({ lead: engine.projectCustomerLead(result.lead), replayed: result.replayed }, cid),
    );
  });

  router.post('/agency-inquiry', async (req: Request, res: Response) => {
    const cid = resolveCorrelationId(req);
    const auth = await resolvePrincipal(req);
    if (!auth.ok || !auth.principal) {
      return res.status(auth.status || 401).json(buildErrorEnvelope(auth.failureCode, auth.reason, cid));
    }

    const b = req.body;
    const result = await engine.createLead(auth.principal.uid, {
      leadType: 'AGENCY_PROFESSIONAL_INQUIRY',
      intent: (b.intent as InquiryIntent) || 'DIRECT_CONSULTATION',
      targetAgencyId: b.targetAgencyId,
      targetBranchId: b.targetBranchId,
      targetProfessionalId: b.targetProfessionalId,
      customerDisplayName: b.customerDisplayName || 'متقاضی',
      customerPhone: b.customerPhone,
      preferredContactMethod: 'PHONE',
      requirements: b.requirements || { cityId: 'tehran', propertyCategory: 'RESIDENTIAL_APARTMENT', transactionType: 'BUY' },
      consentPurpose: b.consentPurpose || 'مشاوره اختصاصی با دفتر املاک یا مشاور',
      consentTextVersion: b.consentTextVersion || 'v1.0',
      idempotencyKey: b.idempotencyKey,
    });

    if (!result.success || !result.lead) {
      return res.status(400).json(buildErrorEnvelope('VALIDATION_FAILED', result.errors?.join('; ') || 'خطا در ثبت استعلام دفتر.', cid));
    }

    return res.status(result.replayed ? 200 : 201).json(
      buildSuccessEnvelope({ lead: engine.projectCustomerLead(result.lead), replayed: result.replayed }, cid),
    );
  });

  // --- Customer View: List My Leads ---

  router.get('/my-leads', async (req: Request, res: Response) => {
    const cid = resolveCorrelationId(req);
    const auth = await resolvePrincipal(req);
    if (!auth.ok || !auth.principal) {
      return res.status(auth.status || 401).json(buildErrorEnvelope(auth.failureCode, auth.reason, cid));
    }

    const isClosed = req.query.isClosed === 'true' ? true : req.query.isClosed === 'false' ? false : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : 20;
    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;

    const store = (engine as any).store;
    const paginated = await store.listCustomerLeads(auth.principal.uid, { isClosed, limit, cursor });

    return res.json(
      buildSuccessEnvelope(
        {
          leads: paginated.items.map((l: any) => engine.projectCustomerLead(l)),
          nextCursor: paginated.nextCursor,
          totalMatching: paginated.totalMatching,
        },
        cid,
      ),
    );
  });

  // --- Lead Details & Activities ---

  router.get('/:leadId', async (req: Request, res: Response) => {
    const cid = resolveCorrelationId(req);
    const auth = await resolvePrincipal(req);
    if (!auth.ok || !auth.principal) {
      return res.status(auth.status || 401).json(buildErrorEnvelope(auth.failureCode, auth.reason, cid));
    }

    const store = (engine as any).store;
    const lead = await store.getLeadById(req.params.leadId);
    if (!lead) return res.status(404).json(buildErrorEnvelope('NOT_FOUND', 'سرنخ یافت نشد.', cid));

    const isCustomer = lead.customerAccountUid === auth.principal.uid;
    const isAssignee = lead.currentAssignment?.professionalId === auth.principal.uid || lead.targetProfessionalId === auth.principal.uid;
    const isAdmin = resolveTrustedLeadActorRole(auth.principal) === 'ADMIN';
    const isAgencyManager = await engine.canManageAgency(auth.principal.uid, lead.targetAgencyId ?? '');

    if (!isCustomer && !isAssignee && !isAdmin && !isAgencyManager) {
      return res.status(403).json(buildErrorEnvelope('FORBIDDEN', 'شما به این سرنخ دسترسی ندارید.', cid));
    }

    if (isCustomer) {
      return res.json(buildSuccessEnvelope({ lead: engine.projectCustomerLead(lead) }, cid));
    }
    return res.json(buildSuccessEnvelope({ lead: engine.projectProfessionalLead(lead) }, cid));
  });

  router.get('/:leadId/activities', async (req: Request, res: Response) => {
    const cid = resolveCorrelationId(req);
    const auth = await resolvePrincipal(req);
    if (!auth.ok || !auth.principal) {
      return res.status(auth.status || 401).json(buildErrorEnvelope(auth.failureCode, auth.reason, cid));
    }

    const store = (engine as any).store;
    const lead = await store.getLeadById(req.params.leadId);
    if (!lead) return res.status(404).json(buildErrorEnvelope('NOT_FOUND', 'سرنخ یافت نشد.', cid));

    const isCustomer = lead.customerAccountUid === auth.principal.uid;
    const isAssignee = lead.currentAssignment?.professionalId === auth.principal.uid || lead.targetProfessionalId === auth.principal.uid;
    const isAdmin = resolveTrustedLeadActorRole(auth.principal) === 'ADMIN';
    const isAgencyManager = await engine.canManageAgency(auth.principal.uid, lead.targetAgencyId ?? '');
    if (!isCustomer && !isAssignee && !isAdmin && !isAgencyManager) {
      return res.status(403).json(buildErrorEnvelope('FORBIDDEN', 'شما به فعالیت‌های این سرنخ دسترسی ندارید.', cid));
    }
    const activities = await store.listActivities(req.params.leadId, isCustomer ? 'PUBLIC_CUSTOMER' : undefined);
    return res.json(buildSuccessEnvelope({ activities }, cid));
  });

  router.post('/:leadId/activities', async (req: Request, res: Response) => {
    const cid = resolveCorrelationId(req);
    const auth = await resolvePrincipal(req);
    if (!auth.ok || !auth.principal) {
      return res.status(auth.status || 401).json(buildErrorEnvelope(auth.failureCode, auth.reason, cid));
    }

    const actorRole = resolveTrustedLeadActorRole(auth.principal);

    const result = await engine.recordActivity(auth.principal.uid, actorRole, req.params.leadId, {
      activityType: (req.body.activityType as LeadActivityType) || 'INTERNAL_NOTE_ADDED',
      notesFa: req.body.notesFa,
      visibility: req.body.visibility,
      scheduledAtIso: req.body.scheduledAtIso,
    });

    if (!result.success) {
      return res.status(400).json(buildErrorEnvelope('VALIDATION_FAILED', result.errors?.join('; ') || 'خطا در ثبت فعالیت.', cid));
    }
    return res.status(201).json(buildSuccessEnvelope({ activity: result.activity }, cid));
  });

  // --- CRM & Professional Operations ---

  router.post('/:leadId/assign', async (req: Request, res: Response) => {
    const cid = resolveCorrelationId(req);
    const auth = await resolvePrincipal(req);
    if (!auth.ok || !auth.principal) {
      return res.status(auth.status || 401).json(buildErrorEnvelope(auth.failureCode, auth.reason, cid));
    }

    const actorRole =
      resolveTrustedLeadActorRole(auth.principal) === 'ADMIN' ? 'ADMIN' : 'AGENCY_MANAGER';

    const result = await engine.assignLead(
      auth.principal.uid,
      actorRole,
      req.params.leadId,
      { agencyId: req.body.agencyId, branchId: req.body.branchId, professionalId: req.body.professionalId },
      req.body.reasonFa,
    );

    if (!result.success || !result.lead) {
      return res.status(400).json(buildErrorEnvelope('VALIDATION_FAILED', result.errors?.join('; ') || 'خطا در ارجاع سرنخ.', cid));
    }
    return res.json(buildSuccessEnvelope({ lead: engine.projectProfessionalLead(result.lead) }, cid));
  });

  router.post('/:leadId/respond-assignment', async (req: Request, res: Response) => {
    const cid = resolveCorrelationId(req);
    const auth = await resolvePrincipal(req);
    if (!auth.ok || !auth.principal) {
      return res.status(auth.status || 401).json(buildErrorEnvelope(auth.failureCode, auth.reason, cid));
    }

    const result = await engine.respondToAssignment(auth.principal.uid, req.params.leadId, Boolean(req.body.accept), req.body.reasonFa);
    if (!result.success || !result.lead) {
      return res.status(400).json(buildErrorEnvelope('VALIDATION_FAILED', result.errors?.join('; ') || 'خطا در پاسخ ارجاع.', cid));
    }
    return res.json(buildSuccessEnvelope({ lead: engine.projectProfessionalLead(result.lead) }, cid));
  });

  router.post('/:leadId/state-transition', async (req: Request, res: Response) => {
    const cid = resolveCorrelationId(req);
    const auth = await resolvePrincipal(req);
    if (!auth.ok || !auth.principal) {
      return res.status(auth.status || 401).json(buildErrorEnvelope(auth.failureCode, auth.reason, cid));
    }

    const actorRole = resolveTrustedLeadActorRole(auth.principal);

    const result = await engine.transitionLeadState(auth.principal.uid, actorRole, req.params.leadId, req.body.targetState as LeadLifecycleState, {
      reasonFa: req.body.reasonFa,
      scheduledAtIso: req.body.scheduledAtIso,
    });

    if (!result.success || !result.lead) {
      return res.status(400).json(buildErrorEnvelope('VALIDATION_FAILED', result.errors?.join('; ') || 'انتقال وضعیت غیرمجاز است.', cid));
    }
    return res.json(buildSuccessEnvelope({ lead: engine.projectProfessionalLead(result.lead) }, cid));
  });

  // --- Controlled Contact Access with Audit Logging ---

  router.post('/:leadId/contact-access', async (req: Request, res: Response) => {
    const cid = resolveCorrelationId(req);
    const auth = await resolvePrincipal(req);
    if (!auth.ok || !auth.principal) {
      return res.status(auth.status || 401).json(buildErrorEnvelope(auth.failureCode, auth.reason, cid));
    }

    const actorRole = resolveTrustedLeadActorRole(auth.principal);

    const result = await engine.accessCustomerContactDetails(auth.principal.uid, actorRole, req.params.leadId, req.body.accessPurposeFa);
    if (!result.success || !result.contact) {
      return res.status(403).json(buildErrorEnvelope('FORBIDDEN', result.errors?.join('; ') || 'دسترسی به شماره تماس مقدور نیست.', cid));
    }
    return res.json(buildSuccessEnvelope({ contact: result.contact }, cid));
  });

  // --- Customer Cancellation & Consent Withdrawal ---

  router.post('/:leadId/cancel', async (req: Request, res: Response) => {
    const cid = resolveCorrelationId(req);
    const auth = await resolvePrincipal(req);
    if (!auth.ok || !auth.principal) {
      return res.status(auth.status || 401).json(buildErrorEnvelope(auth.failureCode, auth.reason, cid));
    }

    const result = await engine.transitionLeadState(auth.principal.uid, 'CUSTOMER', req.params.leadId, 'CANCELLED', { reasonFa: req.body.reasonFa });
    if (!result.success || !result.lead) {
      return res.status(400).json(buildErrorEnvelope('VALIDATION_FAILED', result.errors?.join('; ') || 'انصراف ممکن نیست.', cid));
    }
    return res.json(buildSuccessEnvelope({ lead: engine.projectCustomerLead(result.lead) }, cid));
  });

  router.post('/:leadId/withdraw-consent', async (req: Request, res: Response) => {
    const cid = resolveCorrelationId(req);
    const auth = await resolvePrincipal(req);
    if (!auth.ok || !auth.principal) {
      return res.status(auth.status || 401).json(buildErrorEnvelope(auth.failureCode, auth.reason, cid));
    }

    const result = await engine.withdrawConsent(auth.principal.uid, req.params.leadId, req.body.reasonFa);
    if (!result.success) {
      return res.status(400).json(buildErrorEnvelope('VALIDATION_FAILED', result.errors?.join('; ') || 'لغو رضایت با خطا مواجه شد.', cid));
    }
    return res.json(buildSuccessEnvelope({ messageFa: 'رضایت ارتباط با موفقیت لغو شد.' }, cid));
  });

  // --- CRM Queues & Metrics ---

  router.get('/crm/professional', async (req: Request, res: Response) => {
    const cid = resolveCorrelationId(req);
    const auth = await resolvePrincipal(req);
    if (!auth.ok || !auth.principal) {
      return res.status(auth.status || 401).json(buildErrorEnvelope(auth.failureCode, auth.reason, cid));
    }

    const store = (engine as any).store;
    const limit = req.query.limit ? Number(req.query.limit) : 20;
    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
    const state = typeof req.query.state === 'string' ? (req.query.state as LeadLifecycleState) : undefined;

    const paginated = await store.listProfessionalLeads(auth.principal.uid, { limit, cursor, lifecycleState: state });
    return res.json(
      buildSuccessEnvelope(
        {
          leads: paginated.items.map((l: any) => engine.projectProfessionalLead(l)),
          nextCursor: paginated.nextCursor,
          totalMatching: paginated.totalMatching,
        },
        cid,
      ),
    );
  });

  router.get('/crm/agency', async (req: Request, res: Response) => {
    const cid = resolveCorrelationId(req);
    const auth = await resolvePrincipal(req);
    if (!auth.ok || !auth.principal) {
      return res.status(auth.status || 401).json(buildErrorEnvelope(auth.failureCode, auth.reason, cid));
    }

    const agencyId = req.query.agencyId as string;
    if (!agencyId) {
      return res.status(400).json(buildErrorEnvelope('VALIDATION_FAILED', 'شناسه دفتر املاک الزامی است.', cid));
    }

    if (resolveTrustedLeadActorRole(auth.principal) !== 'ADMIN' &&
        !(await engine.canManageAgency(auth.principal.uid, agencyId))) {
      return res.status(403).json(buildErrorEnvelope('FORBIDDEN', 'دسترسی مدیریتی به این دفتر احراز نشد.', cid));
    }

    const store = (engine as any).store;
    const branchId = typeof req.query.branchId === 'string' ? req.query.branchId : undefined;
    const unassignedOnly = req.query.unassignedOnly === 'true';
    const limit = req.query.limit ? Number(req.query.limit) : 20;
    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;

    const paginated = await store.listAgencyLeads(agencyId, { branchId, unassignedOnly, limit, cursor });
    return res.json(
      buildSuccessEnvelope(
        {
          leads: paginated.items.map((l: any) => engine.projectProfessionalLead(l)),
          nextCursor: paginated.nextCursor,
          totalMatching: paginated.totalMatching,
        },
        cid,
      ),
    );
  });

  router.get('/crm/metrics', async (req: Request, res: Response) => {
    const cid = resolveCorrelationId(req);
    const auth = await resolvePrincipal(req);
    if (!auth.ok || !auth.principal) {
      return res.status(auth.status || 401).json(buildErrorEnvelope(auth.failureCode, auth.reason, cid));
    }

    const agencyId = typeof req.query.agencyId === 'string' ? req.query.agencyId : undefined;
    const professionalId = typeof req.query.professionalId === 'string' ? req.query.professionalId : undefined;
    const windowDays = req.query.windowDays ? Number(req.query.windowDays) : 30;

    const isAdmin = resolveTrustedLeadActorRole(auth.principal) === 'ADMIN';
    if (!isAdmin && agencyId && !(await engine.canManageAgency(auth.principal.uid, agencyId))) {
      return res.status(403).json(buildErrorEnvelope('FORBIDDEN', 'دسترسی مدیریتی به این دفتر احراز نشد.', cid));
    }
    if (!isAdmin && professionalId && professionalId !== auth.principal.uid) {
      return res.status(403).json(buildErrorEnvelope('FORBIDDEN', 'فقط مجاز به مشاهده شاخص‌های حساب خود هستید.', cid));
    }
    if (!agencyId && !professionalId) {
      return res.status(400).json(buildErrorEnvelope('VALIDATION_FAILED', 'شناسه دفتر یا مشاور الزامی است.', cid));
    }
    const metrics = await engine.calculateOperationalMetrics({ agencyId, professionalId, windowDays });
    return res.json(buildSuccessEnvelope({ metrics }, cid));
  });

  return router;
}
