/**
 * @file server/modules/property-services/propertyServicesEngine.ts
 * @description Core business logic engine for provider registration, credentials, quotations, and bookings.
 */

import crypto from 'node:crypto';
import type { ServiceCategoryRegistry } from './propertyServicesCategories';
import type { PropertyServicesStore } from './propertyServicesStore';
import type {
  BookingDocument,
  BookingLifecycleState,
  CredentialType,
  PricingModel,
  PropertyServicesDomainEvent,
  ProviderCredential,
  ProviderPrivateProfile,
  ProviderPublicProfile,
  ProviderServiceArea,
  ProviderType,
  QuotationDocument,
  ReviewDocument,
  ServiceOfferingDocument,
  ServiceRequestDocument,
  VerificationState,
} from './propertyServicesTypes';
import {
  validateBookingStateTransition,
  validateCredentialSubmission,
  validateProviderProfileInput,
  validateQuotationSubmission,
} from './propertyServicesValidator';

export class PropertyServicesEngine {
  private readonly domainEvents: PropertyServicesDomainEvent[] = [];

  constructor(
    private readonly store: PropertyServicesStore,
    private readonly categoryRegistry: ServiceCategoryRegistry,
  ) {}

  // --- Provider Registration & Management ---

  public async registerOrUpdateProvider(
    userId: string,
    params: {
      publicDisplayName: string;
      businessName?: string;
      providerType: ProviderType;
      primaryCategoryIds: string[];
      descriptionFa: string;
      contactPhone: string;
      contactEmail?: string;
      serviceAreas?: ProviderServiceArea[];
      portfolioMediaIds?: string[];
    },
  ): Promise<{ success: boolean; errors?: string[]; profile?: ProviderPrivateProfile }> {
    const val = validateProviderProfileInput(params);
    if (!val.valid || !val.sanitized) {
      return { success: false, errors: val.errors };
    }

    // Validate that categories exist
    for (const catId of val.sanitized.primaryCategoryIds) {
      if (!this.categoryRegistry.getCategory(catId)) {
        return { success: false, errors: [`Category not found: ${catId}`] };
      }
    }

    const existing = await this.store.getProviderByUserId(userId);
    const nowIso = new Date().toISOString();
    const providerId = existing?.id || `prov_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;

    const profile: ProviderPrivateProfile = {
      id: providerId,
      userId,
      publicDisplayName: val.sanitized.publicDisplayName,
      businessName: val.sanitized.businessName,
      providerType: val.sanitized.providerType,
      primaryCategoryIds: val.sanitized.primaryCategoryIds,
      descriptionFa: val.sanitized.descriptionFa,
      contactPhone: val.sanitized.contactPhone,
      contactEmail: val.sanitized.contactEmail,
      serviceAreas: params.serviceAreas || [{ cityId: 'tehran', isCitywide: true }],
      portfolioMediaIds: params.portfolioMediaIds || [],
      verificationState: existing?.verificationState || 'NOT_SUBMITTED',
      operatingStatus: 'active',
      completedJobsCount: existing?.completedJobsCount || 0,
      averageRating: existing?.averageRating,
      reviewCount: existing?.reviewCount || 0,
      credentials: existing?.credentials || [],
      createdAtIso: existing?.createdAtIso || nowIso,
      updatedAtIso: nowIso,
    };

    const saved = await this.store.saveProviderProfile(profile);

    this.emitEvent({
      eventType: 'provider.profile_submitted',
      recipientUid: userId,
      relatedEntityId: saved.id,
      summaryFa: `پروفایل ارائه‌دهنده خدمت «${saved.publicDisplayName}» با موفقیت ثبت شد.`,
    });

    return { success: true, profile: saved };
  }

  // --- Credentials and Verification ---

  public async submitCredential(
    userId: string,
    params: {
      credentialType: CredentialType;
      issuingAuthorityFa: string;
      licenseNumber: string;
      documentMediaId: string;
    },
  ): Promise<{ success: boolean; errors?: string[]; credential?: ProviderCredential }> {
    const provider = await this.store.getProviderByUserId(userId);
    if (!provider) {
      return { success: false, errors: ['PROVIDER_PROFILE_NOT_FOUND'] };
    }

    const val = validateCredentialSubmission(params);
    if (!val.valid || !val.sanitized) {
      return { success: false, errors: val.errors };
    }

    const nowIso = new Date().toISOString();
    const credentialId = `crd_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;

    const newCred: ProviderCredential = {
      id: credentialId,
      providerId: provider.id,
      credentialType: val.sanitized.credentialType,
      issuingAuthorityFa: val.sanitized.issuingAuthorityFa,
      licenseNumber: val.sanitized.licenseNumber,
      documentMediaId: val.sanitized.documentMediaId,
      verificationState: 'SUBMITTED', // Submission does NOT equal verified!
      submittedAtIso: nowIso,
      updatedAtIso: nowIso,
    };

    const updatedProfile: ProviderPrivateProfile = {
      ...provider,
      verificationState: 'UNDER_REVIEW',
      credentials: [...provider.credentials, newCred],
      updatedAtIso: nowIso,
    };

    await this.store.saveProviderProfile(updatedProfile);

    this.emitEvent({
      eventType: 'credential.submitted',
      recipientUid: userId,
      relatedEntityId: newCred.id,
      summaryFa: `مدرک «${newCred.issuingAuthorityFa}» جهت بررسی به کارشناسان ارسال شد.`,
    });

    return { success: true, credential: newCred };
  }

  public async reviewCredential(
    adminUid: string,
    providerId: string,
    credentialId: string,
    decision: 'VERIFIED' | 'REJECTED',
    rejectionReasonFa?: string,
  ): Promise<{ success: boolean; errors?: string[] }> {
    const provider = await this.store.getPrivateProfileById(providerId);
    if (!provider) return { success: false, errors: ['PROVIDER_NOT_FOUND'] };

    const credIndex = provider.credentials.findIndex((c) => c.id === credentialId);
    if (credIndex === -1) return { success: false, errors: ['CREDENTIAL_NOT_FOUND'] };

    const nowIso = new Date().toISOString();
    const updatedCreds = [...provider.credentials];
    updatedCreds[credIndex] = {
      ...updatedCreds[credIndex],
      verificationState: decision,
      reviewerUid: adminUid,
      reviewedAtIso: nowIso,
      rejectionReasonFa: decision === 'REJECTED' ? rejectionReasonFa : undefined,
      updatedAtIso: nowIso,
    };

    // Update overall provider verification status
    const hasAnyVerified = updatedCreds.some((c) => c.verificationState === 'VERIFIED');
    const newProviderState: VerificationState = hasAnyVerified ? 'VERIFIED' : decision === 'REJECTED' ? 'REJECTED' : 'UNDER_REVIEW';

    await this.store.saveProviderProfile({
      ...provider,
      verificationState: newProviderState,
      credentials: updatedCreds,
      updatedAtIso: nowIso,
    });

    await this.store.logModerationAction({
      entityType: 'credential',
      entityId: credentialId,
      action: decision === 'VERIFIED' ? 'approve' : 'reject',
      reviewerUid: adminUid,
      reasonFa: rejectionReasonFa,
    });

    this.emitEvent({
      eventType: 'credential.reviewed',
      recipientUid: provider.userId,
      relatedEntityId: credentialId,
      summaryFa: decision === 'VERIFIED'
        ? 'مدارک شغلی شما تایید و نشان تایید رسمی به پروفایل شما افزوده شد.'
        : `مدارک شغلی شما رد شد: ${rejectionReasonFa || 'عدم انطباق مدارک'}`,
    });

    return { success: true };
  }

  // --- Service Offerings ---

  public async createServiceOffering(
    userId: string,
    params: {
      categoryId: string;
      titleFa: string;
      descriptionFa: string;
      pricingModel: PricingModel;
      basePriceToman?: number;
      maxPriceToman?: number;
      unitLabelFa?: string;
      portfolioMediaIds?: string[];
    },
  ): Promise<{ success: boolean; errors?: string[]; offering?: ServiceOfferingDocument }> {
    const provider = await this.store.getProviderByUserId(userId);
    if (!provider) return { success: false, errors: ['PROVIDER_NOT_REGISTERED'] };

    const category = this.categoryRegistry.getCategory(params.categoryId);
    if (!category) return { success: false, errors: ['INVALID_CATEGORY'] };

    const nowIso = new Date().toISOString();
    const offering: ServiceOfferingDocument = {
      id: `srv_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
      providerId: provider.id,
      categoryId: params.categoryId,
      titleFa: params.titleFa.trim().slice(0, 150),
      descriptionFa: params.descriptionFa.trim().slice(0, 2000),
      pricingModel: params.pricingModel,
      basePriceToman: params.basePriceToman,
      maxPriceToman: params.maxPriceToman,
      unitLabelFa: params.unitLabelFa?.slice(0, 50),
      portfolioMediaIds: params.portfolioMediaIds || [],
      publicationStatus: 'published',
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
    };

    const saved = await this.store.saveServiceOffering(offering);
    return { success: true, offering: saved };
  }

  // --- Service Requests & Quotations Workflow ---

  public async createServiceRequest(
    clientUid: string,
    params: {
      categoryId: string;
      titleFa: string;
      descriptionFa: string;
      cityId: string;
      hoodId?: number;
      budgetMaxToman?: number;
      preferredScheduleFa?: string;
    },
  ): Promise<{ success: boolean; errors?: string[]; request?: ServiceRequestDocument }> {
    const nowIso = new Date().toISOString();
    const reqDoc: ServiceRequestDocument = {
      id: `req_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
      clientUid,
      categoryId: params.categoryId,
      titleFa: params.titleFa.trim().slice(0, 150),
      descriptionFa: params.descriptionFa.trim().slice(0, 3000),
      cityId: params.cityId,
      hoodId: params.hoodId,
      budgetMaxToman: params.budgetMaxToman,
      preferredScheduleFa: params.preferredScheduleFa?.slice(0, 100),
      mediaReferences: [],
      status: 'open',
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
    };

    const saved = await this.store.saveServiceRequest(reqDoc);

    this.emitEvent({
      eventType: 'service_request.created',
      recipientUid: clientUid,
      relatedEntityId: saved.id,
      summaryFa: `درخواست خدمت «${saved.titleFa}» ایجاد و در دسترس متخصصان قرار گرفت.`,
    });

    return { success: true, request: saved };
  }

  public async submitQuotation(
    providerUserId: string,
    requestId: string,
    params: {
      priceToman: number;
      scopeOfWorkFa: string;
      exclusionsFa?: string;
      estimatedDurationDays: number;
      validityPeriodDays: number;
      termsFa?: string;
    },
  ): Promise<{ success: boolean; errors?: string[]; quotation?: QuotationDocument }> {
    const provider = await this.store.getProviderByUserId(providerUserId);
    if (!provider) return { success: false, errors: ['PROVIDER_NOT_REGISTERED'] };

    const request = await this.store.getServiceRequestById(requestId);
    if (!request || request.status === 'closed' || request.status === 'cancelled') {
      return { success: false, errors: ['REQUEST_NOT_ACCEPTING_QUOTATIONS'] };
    }

    const val = validateQuotationSubmission(params);
    if (!val.valid || !val.sanitized) {
      return { success: false, errors: val.errors };
    }

    const nowIso = new Date().toISOString();
    const quotation: QuotationDocument = {
      id: `quot_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
      requestId,
      providerId: provider.id,
      providerUserId,
      clientUid: request.clientUid,
      priceToman: val.sanitized.priceToman,
      scopeOfWorkFa: val.sanitized.scopeOfWorkFa,
      exclusionsFa: val.sanitized.exclusionsFa,
      estimatedDurationDays: val.sanitized.estimatedDurationDays,
      validityPeriodDays: val.sanitized.validityPeriodDays,
      termsFa: val.sanitized.termsFa,
      status: 'submitted',
      submittedAtIso: nowIso,
      updatedAtIso: nowIso,
    };

    const saved = await this.store.saveQuotation(quotation);

    // Update request state to quoted
    if (request.status === 'open') {
      await this.store.saveServiceRequest({
        ...request,
        status: 'quoted',
        updatedAtIso: nowIso,
      });
    }

    this.emitEvent({
      eventType: 'quotation.received',
      recipientUid: request.clientUid,
      relatedEntityId: saved.id,
      summaryFa: `پیش‌فاکتور جدیدی برای درخواست «${request.titleFa}» دریافت شد.`,
    });

    return { success: true, quotation: saved };
  }

  public async acceptQuotationAndCreateBooking(
    clientUid: string,
    quotationId: string,
  ): Promise<{ success: boolean; errors?: string[]; booking?: BookingDocument }> {
    const quotation = await this.store.getQuotationById(quotationId);
    if (!quotation) return { success: false, errors: ['QUOTATION_NOT_FOUND'] };

    if (quotation.clientUid !== clientUid) {
      return { success: false, errors: ['UNAUTHORIZED_QUOTATION_ACCEPTANCE'] };
    }

    if (quotation.status !== 'submitted' && quotation.status !== 'under_review') {
      return { success: false, errors: ['QUOTATION_CANNOT_BE_ACCEPTED'] };
    }

    const request = await this.store.getServiceRequestById(quotation.requestId);
    if (!request) return { success: false, errors: ['REQUEST_NOT_FOUND'] };

    const nowIso = new Date().toISOString();

    // Mark quotation accepted
    await this.store.saveQuotation({
      ...quotation,
      status: 'accepted',
      updatedAtIso: nowIso,
    });

    // Mark request accepted
    await this.store.saveServiceRequest({
      ...request,
      status: 'accepted',
      selectedQuotationId: quotation.id,
      updatedAtIso: nowIso,
    });

    // Create booking in ACCEPTED state
    const booking: BookingDocument = {
      id: `bk_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
      requestId: request.id,
      quotationId: quotation.id,
      providerId: quotation.providerId,
      clientUid,
      categoryId: request.categoryId,
      agreedPriceToman: quotation.priceToman,
      currentState: 'ACCEPTED',
      statusHistory: [
        {
          state: 'ACCEPTED',
          changedByUid: clientUid,
          timestampIso: nowIso,
          noteFa: 'پیش‌فاکتور توسط کارفرما پذیرفته شد.',
        },
      ],
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
    };

    const savedBooking = await this.store.saveBooking(booking);

    this.emitEvent({
      eventType: 'quotation.accepted',
      recipientUid: quotation.providerUserId,
      relatedEntityId: savedBooking.id,
      summaryFa: `پیش‌فاکتور شما برای درخواست «${request.titleFa}» توسط کارفرما پذیرفته شد.`,
    });

    return { success: true, booking: savedBooking };
  }

  // --- Booking Lifecycle Transitions ---

  public async transitionBookingState(
    actorUid: string,
    bookingId: string,
    targetState: BookingLifecycleState,
    noteFa?: string,
    isAdmin = false,
  ): Promise<{ success: boolean; errors?: string[]; booking?: BookingDocument }> {
    const booking = await this.store.getBookingById(bookingId);
    if (!booking) return { success: false, errors: ['BOOKING_NOT_FOUND'] };

    const provider = await this.store.getPrivateProfileById(booking.providerId);
    const isClient = booking.clientUid === actorUid;
    const isProvider = provider?.userId === actorUid;

    const transitionCheck = validateBookingStateTransition(booking.currentState, targetState, {
      uid: actorUid,
      isClient,
      isProvider,
      isAdmin,
    });

    if (!transitionCheck.allowed) {
      return { success: false, errors: [transitionCheck.reasonFa || 'TRANSITION_DISALLOWED'] };
    }

    const nowIso = new Date().toISOString();
    const updatedBooking: BookingDocument = {
      ...booking,
      currentState: targetState,
      completedAtIso: targetState === 'COMPLETED' ? nowIso : booking.completedAtIso,
      cancelledAtIso: targetState === 'CANCELLED' ? nowIso : booking.cancelledAtIso,
      cancellationReasonFa: targetState === 'CANCELLED' ? noteFa : booking.cancellationReasonFa,
      statusHistory: [
        ...booking.statusHistory,
        {
          state: targetState,
          changedByUid: actorUid,
          timestampIso: nowIso,
          noteFa,
        },
      ],
      updatedAtIso: nowIso,
    };

    // If completed, increment provider completed count
    if (targetState === 'COMPLETED' && provider) {
      await this.store.saveProviderProfile({
        ...provider,
        completedJobsCount: provider.completedJobsCount + 1,
        updatedAtIso: nowIso,
      });
    }

    const saved = await this.store.saveBooking(updatedBooking);

    this.emitEvent({
      eventType: targetState === 'COMPLETED' ? 'booking.completed' : 'booking.status_changed',
      recipientUid: isClient ? provider?.userId || '' : booking.clientUid,
      relatedEntityId: saved.id,
      summaryFa: `وضعیت سفارش کار به «${targetState}» تغییر یافت.`,
    });

    return { success: true, booking: saved };
  }

  // --- Verified Reviews ---

  public async submitReview(
    clientUid: string,
    bookingId: string,
    params: { ratingScore: number; commentFa: string },
  ): Promise<{ success: boolean; errors?: string[]; review?: ReviewDocument }> {
    const booking = await this.store.getBookingById(bookingId);
    if (!booking) return { success: false, errors: ['BOOKING_NOT_FOUND'] };

    // Strict rule: Only client of completed booking can review!
    if (booking.clientUid !== clientUid) {
      return { success: false, errors: ['UNAUTHORIZED_REVIEW_ATTEMPT'] };
    }

    if (booking.currentState !== 'COMPLETED') {
      return { success: false, errors: ['REVIEW_ONLY_ALLOWED_FOR_COMPLETED_WORK'] };
    }

    const rating = Math.max(1, Math.min(5, Math.round(params.ratingScore)));
    const comment = params.commentFa.trim().slice(0, 1500);
    if (comment.length < 5) {
      return { success: false, errors: ['Comment must be at least 5 characters'] };
    }

    const nowIso = new Date().toISOString();
    const review: ReviewDocument = {
      id: `rev_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
      bookingId,
      providerId: booking.providerId,
      clientUid,
      categoryId: booking.categoryId,
      ratingScore: rating,
      commentFa: comment,
      isVerifiedCompletedWork: true, // Truly verified against completed booking!
      moderationStatus: 'approved',
      createdAtIso: nowIso,
    };

    const saved = await this.store.saveReview(review);

    // Update provider rating
    const provider = await this.store.getPrivateProfileById(booking.providerId);
    if (provider) {
      const allReviews = await this.store.listApprovedReviewsForProvider(provider.id);
      const totalScore = allReviews.reduce((sum, r) => sum + r.ratingScore, 0);
      const avg = Math.round((totalScore / allReviews.length) * 10) / 10;

      await this.store.saveProviderProfile({
        ...provider,
        averageRating: avg,
        reviewCount: allReviews.length,
        updatedAtIso: nowIso,
      });
    }

    return { success: true, review: saved };
  }

  private emitEvent(event: Omit<PropertyServicesDomainEvent, 'eventId' | 'timestampIso'>): void {
    const fullEvent: PropertyServicesDomainEvent = {
      ...event,
      eventId: `psevt_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
      timestampIso: new Date().toISOString(),
    };
    this.domainEvents.push(fullEvent);
  }

  public getDomainEvents(): readonly PropertyServicesDomainEvent[] {
    return this.domainEvents;
  }
}
