/**
 * @file server/modules/leads/leadEngine.ts
 * @description Core business logic engine for Real Estate Lead Management & CRM.
 */

import crypto from 'node:crypto';
import type {
  GeographyVerificationAdapter,
  ListingVerificationAdapter,
  NotificationEventPublisherAdapter,
  ProfessionalVerificationAdapter,
} from './leadAdapters';
import type { LeadRepository } from './leadStore';
import type {
  ActivityVisibility,
  CustomerConsentRecord,
  CustomerLeadProjection,
  InquiryIntent,
  LeadActivityRecord,
  LeadActivityType,
  LeadAssignmentRecord,
  LeadAssignmentStatus,
  LeadCustomerRequirements,
  LeadDomainEvent,
  LeadLifecycleState,
  LeadOperationalMetrics,
  LeadPriority,
  LeadRecord,
  LeadSourceChannel,
  LeadType,
  PreferredContactMethod,
  ProfessionalLeadProjection,
} from './leadTypes';
import {
  maskPhoneNumber,
  sanitizeTextFa,
  validateCustomerRequirements,
  validateLeadCreationInput,
  validateStateTransition,
} from './leadValidator';

export interface CreateLeadCommandParams {
  readonly leadType: LeadType;
  readonly intent: InquiryIntent;
  readonly targetListingId?: string;
  readonly targetAgencyId?: string;
  readonly targetBranchId?: string;
  readonly targetProfessionalId?: string;
  readonly customerDisplayName: string;
  readonly customerPhone: string;
  readonly customerEmail?: string;
  readonly preferredContactMethod: PreferredContactMethod;
  readonly requirements: Partial<LeadCustomerRequirements>;
  readonly priority?: LeadPriority;
  readonly sourceChannel?: LeadSourceChannel;
  readonly consentPurpose: string;
  readonly consentTextVersion: string;
  readonly marketingOptIn?: boolean;
  readonly agencySharingConsent?: boolean;
  readonly idempotencyKey?: string;
}

export class LeadEngine {
  constructor(
    private readonly store: LeadRepository,
    private readonly listingAdapter: ListingVerificationAdapter,
    private readonly professionalAdapter: ProfessionalVerificationAdapter,
    private readonly geographyAdapter: GeographyVerificationAdapter,
    private readonly notificationPublisher?: NotificationEventPublisherAdapter,
  ) {}

  public async createLead(
    customerUid: string,
    params: CreateLeadCommandParams,
  ): Promise<{ success: boolean; errors?: string[]; lead?: LeadRecord; replayed?: boolean }> {
    const validated = validateLeadCreationInput(params);
    if (!validated.success || !validated.value) {
      return { success: false, errors: validated.errors?.map((e) => `${e.field}: ${e.messageFa}`) };
    }
    const val = validated.value;

    // 1. Idempotency Check
    const existing = await this.store.getLeadByIdempotencyKey(val.idempotencyKey);
    if (existing) {
      if (existing.customerAccountUid !== customerUid) {
        return { success: false, errors: ['IDEMPOTENCY_KEY_COLLISION'] };
      }
      return { success: true, lead: existing, replayed: true };
    }

    // 2. Duplicate Detection
    const duplicate = await this.store.findActiveDuplicate({
      customerUid,
      targetListingId: val.targetListingId,
      cityId: val.requirements.cityId,
      hoodId: val.requirements.hoodId,
      propertyCategory: val.requirements.propertyCategory,
      transactionType: val.requirements.transactionType,
    });
    if (duplicate) {
      return {
        success: false,
        errors: ['DUPLICATE_ACTIVE_LEAD_EXISTS: شما پیش‌تر استعلام فعالی با همین مشخصات ثبت کرده‌اید.'],
      };
    }

    // 3. Geographic Validation
    const citySupported = await this.geographyAdapter.isCitySupported(val.requirements.cityId);
    if (!citySupported) {
      return { success: false, errors: ['CITY_NOT_SUPPORTED: شهر مورد نظر در سامانه پشتیبانی نمی‌شود.'] };
    }

    // 4. Listing Reference Validation
    let assignedAgencyId = val.targetAgencyId;
    let assignedProfessionalId = val.targetProfessionalId;
    let assignmentStatus: LeadAssignmentStatus = 'UNASSIGNED';

    if (val.leadType === 'PROPERTY_INQUIRY' && val.targetListingId) {
      const listing = await this.listingAdapter.getListingReference(val.targetListingId);
      if (!listing.found || !listing.isApproved) {
        return { success: false, errors: ['INVALID_LISTING_REFERENCE: فایل ملکی مورد نظر فعال یا تاییدشده نیست.'] };
      }
      if (listing.assignedProfessionalUid) {
        assignedProfessionalId = listing.assignedProfessionalUid;
        assignmentStatus = 'ASSIGNED_TO_PROFESSIONAL';
      }
      if (listing.representingAgencyId) {
        assignedAgencyId = listing.representingAgencyId;
        if (assignmentStatus === 'UNASSIGNED') {
          assignmentStatus = 'ASSIGNED_TO_AGENCY';
        }
      }
    }

    // 5. Professional & Agency Validation
    if (val.targetProfessionalId) {
      const prof = await this.professionalAdapter.verifyProfessional(val.targetProfessionalId);
      if (!prof.exists) {
        return { success: false, errors: ['PROFESSIONAL_NOT_FOUND: مشاور مورد نظر یافت نشد.'] };
      }
      assignedProfessionalId = val.targetProfessionalId;
      assignmentStatus = 'ASSIGNED_TO_PROFESSIONAL';
    }

    if (val.targetAgencyId) {
      const agency = await this.professionalAdapter.verifyAgency(val.targetAgencyId);
      if (!agency.exists) {
        return { success: false, errors: ['AGENCY_NOT_FOUND: دفتر املاک مورد نظر یافت نشد.'] };
      }
      assignedAgencyId = val.targetAgencyId;
      if (assignmentStatus === 'UNASSIGNED') {
        assignmentStatus = 'ASSIGNED_TO_AGENCY';
      }
    }

    const nowIso = new Date().toISOString();
    const leadId = `lead_${crypto.randomBytes(6).toString('hex')}`;

    const consentRecord: CustomerConsentRecord = {
      id: `cst_${crypto.randomBytes(4).toString('hex')}`,
      customerUid,
      consentPurpose: val.consentPurpose,
      consentTextVersion: val.consentTextVersion,
      timestampIso: nowIso,
      communicationChannels: [val.preferredContactMethod],
      marketingOptIn: val.marketingOptIn,
      agencySharingConsent: val.agencySharingConsent,
    };

    let initialAssignment: LeadAssignmentRecord | undefined;
    if (assignmentStatus !== 'UNASSIGNED') {
      initialAssignment = {
        assignmentId: `asg_${crypto.randomBytes(4).toString('hex')}`,
        assignedToType: assignedProfessionalId ? 'PROFESSIONAL' : 'AGENCY',
        agencyId: assignedAgencyId,
        branchId: val.targetBranchId,
        professionalId: assignedProfessionalId,
        assignedByUid: 'SYSTEM',
        assignedAtIso: nowIso,
        status: assignmentStatus,
      };
    }

    const initialState: LeadLifecycleState = initialAssignment ? 'ASSIGNED' : 'NEW';

    const record: LeadRecord = {
      id: leadId,
      leadType: val.leadType,
      customerAccountUid: customerUid,
      customerDisplayName: val.customerDisplayName,
      customerPhone: val.customerPhone,
      customerEmail: val.customerEmail,
      targetListingId: val.targetListingId,
      targetAgencyId: assignedAgencyId,
      targetBranchId: val.targetBranchId,
      targetProfessionalId: assignedProfessionalId,
      intent: val.intent,
      requirements: val.requirements,
      preferredContactMethod: val.preferredContactMethod,
      consent: consentRecord,
      assignmentStatus,
      currentAssignment: initialAssignment,
      assignmentHistory: initialAssignment ? [initialAssignment] : [],
      lifecycleState: initialState,
      stateHistory: [
        {
          fromState: 'NEW',
          toState: initialState,
          actorUid: customerUid,
          timestampIso: nowIso,
          reasonFa: 'ثبت استعلام اولیه توسط متقاضی',
        },
      ],
      priority: params.priority ?? 'NORMAL',
      sourceChannel: params.sourceChannel ?? 'PUBLIC_LISTING_PAGE',
      idempotencyKey: val.idempotencyKey,
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
      lastActivityAtIso: nowIso,
    };

    const saved = await this.store.saveLead(record);

    // Record initial timeline activity
    await this.store.saveActivity({
      id: `act_${crypto.randomBytes(4).toString('hex')}`,
      leadId: saved.id,
      activityType: 'LEAD_CREATED',
      actorUid: customerUid,
      actorRole: 'CUSTOMER',
      timestampIso: nowIso,
      visibility: 'PUBLIC_CUSTOMER',
      notesFa: 'استعلام با موفقیت در سامانه ثبت شد.',
    });

    if (initialAssignment) {
      await this.store.saveActivity({
        id: `act_${crypto.randomBytes(4).toString('hex')}`,
        leadId: saved.id,
        activityType: 'ASSIGNMENT_CREATED',
        actorUid: 'SYSTEM',
        actorRole: 'SYSTEM',
        timestampIso: nowIso,
        visibility: 'INTERNAL_CRM',
        notesFa: `سرنخ به ${assignedProfessionalId ? 'مشاور' : 'دفتر املاک'} ارجاع داده شد.`,
      });
    }

    // Publish versioned domain event
    await this.publishEvent({
      eventId: `evt_${crypto.randomBytes(6).toString('hex')}`,
      eventType: 'lead.created',
      leadId: saved.id,
      leadType: saved.leadType,
      customerUid: saved.customerAccountUid,
      targetListingId: saved.targetListingId,
      agencyId: saved.targetAgencyId,
      professionalId: saved.targetProfessionalId,
      lifecycleState: saved.lifecycleState,
      timestampIso: nowIso,
      summaryFa: `سرنخ جدید ثبت شد (${saved.leadType}).`,
    });

    return { success: true, lead: saved };
  }

  public async assignLead(
    actorUid: string,
    actorRole: 'AGENCY_MANAGER' | 'ADMIN',
    leadId: string,
    target: { agencyId: string; branchId?: string; professionalId?: string },
    reasonFa?: string,
  ): Promise<{ success: boolean; errors?: string[]; lead?: LeadRecord }> {
    const lead = await this.store.getLeadById(leadId);
    if (!lead) return { success: false, errors: ['LEAD_NOT_FOUND: سرنخ مورد نظر یافت نشد.'] };

    // Agency manager can only assign within their agency
    if (actorRole === 'AGENCY_MANAGER') {
      const agency = await this.professionalAdapter.verifyAgency(target.agencyId);
      if (!agency.exists || (agency.ownerUid !== actorUid && !agency.managerUids.includes(actorUid))) {
        return { success: false, errors: ['FORBIDDEN_AGENCY_ACCESS: شما مجاز به ارجاع در این دفتر نیستید.'] };
      }
    }

    if (target.professionalId) {
      const isMember = await this.professionalAdapter.isMemberOfAgency(target.professionalId, target.agencyId);
      if (!isMember) {
        return {
          success: false,
          errors: ['PROFESSIONAL_NOT_IN_AGENCY: مشاور انتخابی عضو این دفتر املاک نیست.'],
        };
      }
    }

    const nowIso = new Date().toISOString();
    const newAssignment: LeadAssignmentRecord = {
      assignmentId: `asg_${crypto.randomBytes(4).toString('hex')}`,
      assignedToType: target.professionalId ? 'PROFESSIONAL' : 'AGENCY',
      agencyId: target.agencyId,
      branchId: target.branchId,
      professionalId: target.professionalId,
      assignedByUid: actorUid,
      assignedAtIso: nowIso,
      status: target.professionalId ? 'ASSIGNED_TO_PROFESSIONAL' : 'ASSIGNED_TO_AGENCY',
      notesFa: reasonFa ? sanitizeTextFa(reasonFa, 200) : undefined,
    };

    const updated: LeadRecord = {
      ...lead,
      targetAgencyId: target.agencyId,
      targetBranchId: target.branchId,
      targetProfessionalId: target.professionalId,
      assignmentStatus: newAssignment.status,
      currentAssignment: newAssignment,
      assignmentHistory: [...lead.assignmentHistory, newAssignment],
      lifecycleState: 'ASSIGNED',
      stateHistory: [
        ...lead.stateHistory,
        {
          fromState: lead.lifecycleState,
          toState: 'ASSIGNED',
          actorUid,
          timestampIso: nowIso,
          reasonFa: reasonFa ? sanitizeTextFa(reasonFa, 200) : 'ارجاع سرنخ به مشاور/دفتر',
        },
      ],
      updatedAtIso: nowIso,
      lastActivityAtIso: nowIso,
    };

    const saved = await this.store.saveLead(updated);

    await this.store.saveActivity({
      id: `act_${crypto.randomBytes(4).toString('hex')}`,
      leadId: saved.id,
      activityType: 'ASSIGNMENT_CREATED',
      actorUid,
      actorRole,
      timestampIso: nowIso,
      visibility: 'INTERNAL_CRM',
      notesFa: reasonFa ? sanitizeTextFa(reasonFa, 200) : 'سرنخ به مشاور ارجاع شد.',
    });

    await this.publishEvent({
      eventId: `evt_${crypto.randomBytes(6).toString('hex')}`,
      eventType: 'lead.assigned',
      leadId: saved.id,
      leadType: saved.leadType,
      customerUid: saved.customerAccountUid,
      agencyId: target.agencyId,
      professionalId: target.professionalId,
      lifecycleState: saved.lifecycleState,
      timestampIso: nowIso,
      summaryFa: 'سرنخ ارجاع داده شد.',
    });

    return { success: true, lead: saved };
  }

  public async respondToAssignment(
    professionalUserId: string,
    leadId: string,
    accept: boolean,
    reasonFa?: string,
  ): Promise<{ success: boolean; errors?: string[]; lead?: LeadRecord }> {
    const lead = await this.store.getLeadById(leadId);
    if (!lead) return { success: false, errors: ['LEAD_NOT_FOUND'] };

    if (lead.currentAssignment?.professionalId !== professionalUserId) {
      return { success: false, errors: ['UNAUTHORIZED_ASSIGNEE: شما مسئول فعلی این سرنخ نیستید.'] };
    }

    const nowIso = new Date().toISOString();
    const updatedAssignment: LeadAssignmentRecord = {
      ...lead.currentAssignment,
      status: accept ? 'ASSIGNED_TO_PROFESSIONAL' : 'REJECTED_BY_ASSIGNEE',
      acceptedAtIso: accept ? nowIso : undefined,
      rejectedAtIso: !accept ? nowIso : undefined,
      rejectionReasonFa: !accept && reasonFa ? sanitizeTextFa(reasonFa, 200) : undefined,
    };

    const nextState: LeadLifecycleState = accept ? 'ACCEPTED' : 'AWAITING_ASSIGNMENT';

    const updated: LeadRecord = {
      ...lead,
      currentAssignment: updatedAssignment,
      assignmentStatus: updatedAssignment.status,
      lifecycleState: nextState,
      stateHistory: [
        ...lead.stateHistory,
        {
          fromState: lead.lifecycleState,
          toState: nextState,
          actorUid: professionalUserId,
          timestampIso: nowIso,
          reasonFa: accept ? 'پذیرش سرنخ توسط مشاور' : (reasonFa ? sanitizeTextFa(reasonFa, 200) : 'رد ارجاع سرنخ توسط مشاور'),
        },
      ],
      updatedAtIso: nowIso,
      lastActivityAtIso: nowIso,
    };

    const saved = await this.store.saveLead(updated);

    await this.store.saveActivity({
      id: `act_${crypto.randomBytes(4).toString('hex')}`,
      leadId: saved.id,
      activityType: accept ? 'ASSIGNMENT_ACCEPTED' : 'ASSIGNMENT_REJECTED',
      actorUid: professionalUserId,
      actorRole: 'PROFESSIONAL',
      timestampIso: nowIso,
      visibility: 'INTERNAL_CRM',
      notesFa: accept ? 'مشاور مسئولیت پیگیری سرنخ را پذیرفت.' : reasonFa,
    });

    await this.publishEvent({
      eventId: `evt_${crypto.randomBytes(6).toString('hex')}`,
      eventType: accept ? 'lead.assignment_accepted' : 'lead.assignment_rejected',
      leadId: saved.id,
      leadType: saved.leadType,
      customerUid: saved.customerAccountUid,
      agencyId: saved.targetAgencyId,
      professionalId: professionalUserId,
      lifecycleState: saved.lifecycleState,
      timestampIso: nowIso,
      summaryFa: accept ? 'ارجاع سرنخ پذیرفته شد.' : 'ارجاع سرنخ رد شد.',
    });

    return { success: true, lead: saved };
  }

  public async transitionLeadState(
    actorUid: string,
    actorRole: 'CUSTOMER' | 'PROFESSIONAL' | 'AGENCY_MANAGER' | 'ADMIN',
    leadId: string,
    targetState: LeadLifecycleState,
    params?: {
      reasonFa?: string;
      activityType?: LeadActivityType;
      scheduledAtIso?: string;
      followUpCompletedAtIso?: string;
    },
  ): Promise<{ success: boolean; errors?: string[]; lead?: LeadRecord }> {
    const lead = await this.store.getLeadById(leadId);
    if (!lead) return { success: false, errors: ['LEAD_NOT_FOUND'] };

    // Authorization checks
    if (actorRole === 'CUSTOMER' && lead.customerAccountUid !== actorUid) {
      return { success: false, errors: ['FORBIDDEN_CUSTOMER_ACCESS'] };
    }
    if (actorRole === 'PROFESSIONAL' && lead.currentAssignment?.professionalId !== actorUid && lead.targetProfessionalId !== actorUid) {
      return { success: false, errors: ['FORBIDDEN_PROFESSIONAL_ACCESS'] };
    }
    if (actorRole === 'AGENCY_MANAGER') {
      const agency = await this.professionalAdapter.verifyAgency(lead.targetAgencyId ?? '');
      if (!agency.exists || (agency.ownerUid !== actorUid && !agency.managerUids.includes(actorUid))) {
        return { success: false, errors: ['FORBIDDEN_AGENCY_ACCESS'] };
      }
    }

    const transitionCheck = validateStateTransition(lead.lifecycleState, targetState, actorRole);
    if (!transitionCheck.allowed) {
      return { success: false, errors: [transitionCheck.reasonFa ?? 'INVALID_STATE_TRANSITION'] };
    }

    const nowIso = new Date().toISOString();
    let firstResponseAtIso = lead.firstResponseAtIso;
    if (!firstResponseAtIso && (targetState === 'CONTACT_ATTEMPTED' || targetState === 'CONTACTED')) {
      firstResponseAtIso = nowIso;
    }

    const isClosing = ['SUCCESSFUL', 'UNSUCCESSFUL', 'CANCELLED', 'EXPIRED', 'REJECTED'].includes(targetState);

    const updated: LeadRecord = {
      ...lead,
      lifecycleState: targetState,
      firstResponseAtIso,
      closedAtIso: isClosing ? nowIso : undefined,
      closureReasonFa: isClosing && params?.reasonFa ? sanitizeTextFa(params.reasonFa, 200) : lead.closureReasonFa,
      stateHistory: [
        ...lead.stateHistory,
        {
          fromState: lead.lifecycleState,
          toState: targetState,
          actorUid,
          timestampIso: nowIso,
          reasonFa: params?.reasonFa ? sanitizeTextFa(params.reasonFa, 200) : undefined,
        },
      ],
      updatedAtIso: nowIso,
      lastActivityAtIso: nowIso,
    };

    const saved = await this.store.saveLead(updated);

    const activityType: LeadActivityType =
      params?.activityType ??
      (targetState === 'VISIT_SCHEDULED'
        ? 'VISIT_SCHEDULED'
        : targetState === 'CONTACT_ATTEMPTED'
          ? 'CALL_ATTEMPTED'
          : targetState === 'CONTACTED'
            ? 'CUSTOMER_CONTACTED'
            : isClosing
              ? 'LEAD_CLOSED'
              : 'LEAD_REOPENED');

    await this.store.saveActivity({
      id: `act_${crypto.randomBytes(4).toString('hex')}`,
      leadId: saved.id,
      activityType,
      actorUid,
      actorRole,
      timestampIso: nowIso,
      transition: { fromState: lead.lifecycleState, toState: targetState },
      notesFa: params?.reasonFa ? sanitizeTextFa(params.reasonFa, 300) : undefined,
      visibility: actorRole === 'CUSTOMER' ? 'PUBLIC_CUSTOMER' : 'INTERNAL_CRM',
      scheduledAtIso: params?.scheduledAtIso,
      followUpCompletedAtIso: params?.followUpCompletedAtIso,
    });

    await this.publishEvent({
      eventId: `evt_${crypto.randomBytes(6).toString('hex')}`,
      eventType: isClosing ? 'lead.closed' : 'lead.status_changed',
      leadId: saved.id,
      leadType: saved.leadType,
      customerUid: saved.customerAccountUid,
      agencyId: saved.targetAgencyId,
      professionalId: saved.targetProfessionalId,
      lifecycleState: saved.lifecycleState,
      timestampIso: nowIso,
      summaryFa: `وضعیت سرنخ به ${targetState} تغییر یافت.`,
    });

    return { success: true, lead: saved };
  }

  public async recordActivity(
    actorUid: string,
    actorRole: 'CUSTOMER' | 'PROFESSIONAL' | 'AGENCY_MANAGER' | 'ADMIN',
    leadId: string,
    params: {
      activityType: LeadActivityType;
      notesFa?: string;
      visibility?: ActivityVisibility;
      scheduledAtIso?: string;
    },
  ): Promise<{ success: boolean; errors?: string[]; activity?: LeadActivityRecord }> {
    const lead = await this.store.getLeadById(leadId);
    if (!lead) return { success: false, errors: ['LEAD_NOT_FOUND'] };

    // Authorization must be checked inside the domain engine, not only in the HTTP router.
    if (actorRole === 'PROFESSIONAL' &&
        lead.currentAssignment?.professionalId !== actorUid &&
        lead.targetProfessionalId !== actorUid) {
      return { success: false, errors: ['FORBIDDEN_PROFESSIONAL_ACCESS'] };
    }
    if (actorRole === 'AGENCY_MANAGER' && !(await this.canManageAgency(actorUid, lead.targetAgencyId ?? ''))) {
      return { success: false, errors: ['FORBIDDEN_AGENCY_ACCESS'] };
    }

    // Customers can ONLY write customer-visible notes
    let visibility: ActivityVisibility = params.visibility ?? 'INTERNAL_CRM';
    if (actorRole === 'CUSTOMER') {
      if (lead.customerAccountUid !== actorUid) {
        return { success: false, errors: ['FORBIDDEN_CUSTOMER_ACCESS'] };
      }
      visibility = 'PUBLIC_CUSTOMER';
    }

    const nowIso = new Date().toISOString();
    const activity: LeadActivityRecord = {
      id: `act_${crypto.randomBytes(4).toString('hex')}`,
      leadId,
      activityType: params.activityType,
      actorUid,
      actorRole,
      timestampIso: nowIso,
      notesFa: params.notesFa ? sanitizeTextFa(params.notesFa, 500) : undefined,
      visibility,
      scheduledAtIso: params.scheduledAtIso,
    };

    const saved = await this.store.saveActivity(activity);

    // Update lead's lastActivityAt
    await this.store.saveLead({
      ...lead,
      lastActivityAtIso: nowIso,
      updatedAtIso: nowIso,
    });

    return { success: true, activity: saved };
  }

  public async accessCustomerContactDetails(
    actorUid: string,
    actorRole: 'PROFESSIONAL' | 'AGENCY_MANAGER' | 'ADMIN',
    leadId: string,
    accessPurposeFa: string,
  ): Promise<{ success: boolean; errors?: string[]; contact?: { displayName: string; phone: string; email?: string } }> {
    const lead = await this.store.getLeadById(leadId);
    if (!lead) return { success: false, errors: ['LEAD_NOT_FOUND'] };

    // Check consent validity
    if (lead.consent.withdrawalTimestampIso) {
      return { success: false, errors: ['CONSENT_WITHDRAWN: متقاضی رضایت خود را برای ارتباط پس گرفته است.'] };
    }

    // Role verification
    if (actorRole === 'PROFESSIONAL') {
      const isAssignee = lead.currentAssignment?.professionalId === actorUid || lead.targetProfessionalId === actorUid;
      if (!isAssignee) {
        return { success: false, errors: ['FORBIDDEN_CONTACT_ACCESS: فقط مشاور انتساب‌یافته به شماره دسترسی دارد.'] };
      }
    } else if (actorRole === 'AGENCY_MANAGER') {
      const agency = await this.professionalAdapter.verifyAgency(lead.targetAgencyId ?? '');
      if (!agency.exists || (agency.ownerUid !== actorUid && !agency.managerUids.includes(actorUid))) {
        return { success: false, errors: ['FORBIDDEN_AGENCY_ACCESS'] };
      }
    }

    const nowIso = new Date().toISOString();
    await this.store.saveContactAccessAudit({
      id: `aud_${crypto.randomBytes(4).toString('hex')}`,
      leadId,
      accessedByUid: actorUid,
      accessedRole: actorRole,
      accessPurposeFa: sanitizeTextFa(accessPurposeFa, 200) || 'تماس جهت پیگیری استعلام ملک',
      timestampIso: nowIso,
    });

    return {
      success: true,
      contact: {
        displayName: lead.customerDisplayName,
        phone: lead.customerPhone,
        email: lead.customerEmail,
      },
    };
  }

  public async withdrawConsent(
    customerUid: string,
    leadId: string,
    reasonFa?: string,
  ): Promise<{ success: boolean; errors?: string[] }> {
    const lead = await this.store.getLeadById(leadId);
    if (!lead) return { success: false, errors: ['LEAD_NOT_FOUND'] };

    if (lead.customerAccountUid !== customerUid) {
      return { success: false, errors: ['FORBIDDEN_CUSTOMER_ACCESS'] };
    }

    const nowIso = new Date().toISOString();
    const updatedConsent: CustomerConsentRecord = {
      ...lead.consent,
      withdrawalTimestampIso: nowIso,
      withdrawalReasonFa: reasonFa ? sanitizeTextFa(reasonFa, 200) : 'لغو رضایت توسط متقاضی',
    };

    await this.store.saveLead({
      ...lead,
      consent: updatedConsent,
      updatedAtIso: nowIso,
      lastActivityAtIso: nowIso,
    });

    await this.store.saveActivity({
      id: `act_${crypto.randomBytes(4).toString('hex')}`,
      leadId,
      activityType: 'CONSENT_WITHDRAWN',
      actorUid: customerUid,
      actorRole: 'CUSTOMER',
      timestampIso: nowIso,
      visibility: 'PUBLIC_CUSTOMER',
      notesFa: 'رضایت ارتباط با متقاضی لغو شد.',
    });

    await this.publishEvent({
      eventId: `evt_${crypto.randomBytes(6).toString('hex')}`,
      eventType: 'lead.consent_withdrawn',
      leadId,
      leadType: lead.leadType,
      customerUid,
      lifecycleState: lead.lifecycleState,
      timestampIso: nowIso,
      summaryFa: 'متقاضی رضایت‌نامه ارتباط را لغو کرد.',
    });

    return { success: true };
  }

  public async canManageAgency(actorUid: string, agencyId: string): Promise<boolean> {
    if (!actorUid || !agencyId) return false;
    const agency = await this.professionalAdapter.verifyAgency(agencyId);
    return Boolean(agency.exists && (agency.ownerUid === actorUid || agency.managerUids.includes(actorUid)));
  }

  public projectCustomerLead(lead: LeadRecord): CustomerLeadProjection {
    return {
      id: lead.id,
      leadType: lead.leadType,
      targetListingId: lead.targetListingId,
      targetAgencyId: lead.targetAgencyId,
      targetProfessionalId: lead.targetProfessionalId,
      intent: lead.intent,
      requirements: lead.requirements,
      preferredContactMethod: lead.preferredContactMethod,
      lifecycleState: lead.lifecycleState,
      priority: lead.priority,
      createdAtIso: lead.createdAtIso,
      updatedAtIso: lead.updatedAtIso,
      lastActivityAtIso: lead.lastActivityAtIso,
      closureReasonFa: lead.closureReasonFa,
    };
  }

  public projectProfessionalLead(lead: LeadRecord): ProfessionalLeadProjection {
    let responseTimeMinutes: number | undefined;
    if (lead.firstResponseAtIso) {
      const createdMs = new Date(lead.createdAtIso).getTime();
      const respMs = new Date(lead.firstResponseAtIso).getTime();
      responseTimeMinutes = Math.max(Math.round((respMs - createdMs) / 60000), 0);
    }

    return {
      id: lead.id,
      leadType: lead.leadType,
      customerDisplayName: lead.customerDisplayName,
      customerContactAvailable: !lead.consent.withdrawalTimestampIso,
      customerPhoneMasked: maskPhoneNumber(lead.customerPhone),
      targetListingId: lead.targetListingId,
      targetAgencyId: lead.targetAgencyId,
      targetBranchId: lead.targetBranchId,
      targetProfessionalId: lead.targetProfessionalId,
      intent: lead.intent,
      requirements: lead.requirements,
      preferredContactMethod: lead.preferredContactMethod,
      assignmentStatus: lead.assignmentStatus,
      currentAssigneeUid: lead.currentAssignment?.professionalId,
      lifecycleState: lead.lifecycleState,
      priority: lead.priority,
      sourceChannel: lead.sourceChannel,
      createdAtIso: lead.createdAtIso,
      updatedAtIso: lead.updatedAtIso,
      lastActivityAtIso: lead.lastActivityAtIso,
      firstResponseAtIso: lead.firstResponseAtIso,
      responseTimeMinutes,
      closureReasonFa: lead.closureReasonFa,
    };
  }

  public async calculateOperationalMetrics(params?: {
    agencyId?: string;
    professionalId?: string;
    windowDays?: number;
  }): Promise<LeadOperationalMetrics> {
    const days = params?.windowDays ?? 30;
    const nowMs = Date.now();
    const periodStartIso = new Date(nowMs - days * 86400 * 1000).toISOString();
    const periodEndIso = new Date(nowMs).toISOString();

    let leads: LeadRecord[] = [];
    if (params?.agencyId) {
      const res = await this.store.listAgencyLeads(params.agencyId, { limit: 100 });
      leads = [...res.items];
    } else if (params?.professionalId) {
      const res = await this.store.listProfessionalLeads(params.professionalId, { limit: 100 });
      leads = [...res.items];
    }

    let newCount = 0;
    let assignedCount = 0;
    let contactedCount = 0;
    let visitCount = 0;
    let negCount = 0;
    let successCount = 0;
    let unsuccessCount = 0;
    const responseTimes: number[] = [];

    for (const l of leads) {
      switch (l.lifecycleState) {
        case 'NEW':
        case 'AWAITING_ASSIGNMENT':
          newCount += 1;
          break;
        case 'ASSIGNED':
        case 'ACCEPTED':
          assignedCount += 1;
          break;
        case 'CONTACT_ATTEMPTED':
        case 'CONTACTED':
        case 'FOLLOW_UP_REQUIRED':
          contactedCount += 1;
          break;
        case 'VISIT_SCHEDULED':
          visitCount += 1;
          break;
        case 'NEGOTIATION':
          negCount += 1;
          break;
        case 'SUCCESSFUL':
          successCount += 1;
          break;
        case 'UNSUCCESSFUL':
        case 'CANCELLED':
        case 'EXPIRED':
        case 'REJECTED':
          unsuccessCount += 1;
          break;
      }

      if (l.firstResponseAtIso) {
        const diffMin = Math.round((new Date(l.firstResponseAtIso).getTime() - new Date(l.createdAtIso).getTime()) / 60000);
        if (diffMin >= 0) responseTimes.push(diffMin);
      }
    }

    let avgResponseTime: number | undefined;
    let medianResponseTime: number | undefined;
    if (responseTimes.length > 0) {
      avgResponseTime = Math.round(responseTimes.reduce((acc, v) => acc + v, 0) / responseTimes.length);
      responseTimes.sort((a, b) => a - b);
      const mid = Math.floor(responseTimes.length / 2);
      medianResponseTime = responseTimes.length % 2 === 0 ? Math.round((responseTimes[mid - 1] + responseTimes[mid]) / 2) : responseTimes[mid];
    }

    return {
      periodStartIso,
      periodEndIso,
      totalLeadsCount: leads.length,
      newLeadsCount: newCount,
      assignedLeadsCount: assignedCount,
      contactedLeadsCount: contactedCount,
      scheduledVisitsCount: visitCount,
      openNegotiationsCount: negCount,
      successfulLeadsCount: successCount,
      unsuccessfulLeadsCount: unsuccessCount,
      averageResponseTimeMinutes: avgResponseTime,
      medianResponseTimeMinutes: medianResponseTime,
      followUpCompletionRatePercent: leads.length > 0 ? Math.round(((contactedCount + visitCount + negCount + successCount) / leads.length) * 100) : undefined,
    };
  }

  private async publishEvent(event: LeadDomainEvent): Promise<void> {
    if (!this.notificationPublisher) return;
    try {
      await this.notificationPublisher.publishDomainEvent(event);
    } catch {
      // Event publishing failure is isolated to prevent rolling back successful database state mutations
    }
  }
}
