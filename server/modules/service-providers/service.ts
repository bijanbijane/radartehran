/**
 * Real Estate Professionals & Service Providers Application Service
 * (`server/modules/service-providers/service.ts`)
 * Exclusive ownership: `server/modules/service-providers/`
 */

import type {
  GeographyValidationAdapter,
  MediaStorageReferenceAdapter,
  NotificationsOutboxAdapter,
  TrustAndSafetyProviderAdapter,
} from './contracts';
import {
  recordCredentialVerificationWorkflow,
  submitCredentialWorkflow,
} from './credentialsAndVerificationService';
import {
  addOrganizationMemberWorkflow,
  createOrganizationWorkflow,
  removeOrganizationMemberWorkflow,
} from './organizationsAndMembersService';
import type { ServiceProviderRepository } from './repository';
import {
  createServiceRequestWorkflow,
  selectProviderWorkflow,
  submitQuotationWorkflow,
  updateQuotationWorkflow,
} from './requestsAndQuotationsService';
import type {
  CustomerServiceRequest,
  IndividualProviderProfile,
  OrganizationMembership,
  OrganizationRole,
  PricingModel,
  ProfilePublicationStatus,
  ProviderCategory,
  ProviderCredentialRecord,
  ProviderDomainEvent,
  ProviderOrganization,
  ProviderPerformanceMetrics,
  ProviderQuotationRecord,
  ProviderReviewRecord,
  ProviderSearchFilters,
  ProviderServiceOffering,
  ServiceAreaDeclaration,
} from './types';
import {
  assertNoSelfReview,
  ProviderValidationError,
  sanitizeText,
  validatePricingModel,
  validateProviderCategory,
  validateReviewRating,
  validateSafeFirestoreId,
} from './validation';

export interface ServiceProviderServiceDependencies {
  repository: ServiceProviderRepository;
  geographyAdapter?: GeographyValidationAdapter;
  mediaAdapter?: MediaStorageReferenceAdapter;
  notificationsAdapter?: NotificationsOutboxAdapter;
  trustAndSafetyAdapter?: TrustAndSafetyProviderAdapter;
}

export class ServiceProviderService {
  constructor(private readonly deps: ServiceProviderServiceDependencies) {}

  public async createIndividualProfile(input: {
    displayNameFa: string;
    professionalHeadlineFa: string;
    biographyFa?: string;
    primaryCategory: ProviderCategory;
    specialties?: string[];
    yearsOfExperience?: number;
    languages?: string[];
    serviceAreas?: ServiceAreaDeclaration[];
    publicContactPhone?: string;
    publicEmail?: string;
    avatarMediaId?: string;
  }, actorUserId: string): Promise<IndividualProviderProfile> {
    const existing = await this.deps.repository.getProviderProfileByUserId(actorUserId);
    if (existing) {
      throw new ProviderValidationError('PROFILE_ALREADY_EXISTS', 'A provider profile already exists for this user account.');
    }

    const category = validateProviderCategory(input.primaryCategory);
    const nameFa = sanitizeText(input.displayNameFa, 150);
    const headline = sanitizeText(input.professionalHeadlineFa, 200);

    if (nameFa.length < 3) throw new ProviderValidationError('INVALID_DISPLAY_NAME', 'Display name must be at least 3 characters.');
    if (headline.length < 5) throw new ProviderValidationError('INVALID_HEADLINE', 'Headline must be at least 5 characters.');

    const providerId = `pro_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();

    const profile: IndividualProviderProfile = {
      providerId,
      userId: actorUserId,
      displayNameFa: nameFa,
      professionalHeadlineFa: headline,
      biographyFa: sanitizeText(input.biographyFa, 2000) || undefined,
      primaryCategory: category,
      specialties: input.specialties?.map((s) => sanitizeText(s, 100)).filter(Boolean) || [],
      yearsOfExperience: typeof input.yearsOfExperience === 'number' && input.yearsOfExperience >= 0 ? Math.min(70, Math.floor(input.yearsOfExperience)) : undefined,
      languages: input.languages?.map((l) => sanitizeText(l, 50)).filter(Boolean) || ['fa'],
      serviceAreas: input.serviceAreas || [],
      publicContactPhone: sanitizeText(input.publicContactPhone, 50) || undefined,
      publicEmail: sanitizeText(input.publicEmail, 100) || undefined,
      avatarMediaId: input.avatarMediaId,
      verificationStatus: 'unverified',
      publicationStatus: 'published',
      revision: 1,
      createdAtIso: now,
      updatedAtIso: now,
    };

    await this.deps.repository.saveProviderProfile(profile);
    await this.emitEvent('provider.profile.created', providerId, 'provider', actorUserId, {
      displayNameFa: nameFa,
      category,
    });

    return profile;
  }

  public async updatePublicationStatus(
    providerId: string,
    status: ProfilePublicationStatus,
    actorUserId: string,
  ): Promise<IndividualProviderProfile> {
    const profile = await this.deps.repository.getProviderProfileById(providerId);
    if (!profile) throw new ProviderValidationError('PROFILE_NOT_FOUND', 'Provider profile not found.');
    if (profile.userId !== actorUserId) throw new ProviderValidationError('UNAUTHORIZED_PROFILE_ACTION', 'Only the profile owner can change publication status.');

    profile.publicationStatus = status;
    profile.updatedAtIso = new Date().toISOString();
    await this.deps.repository.saveProviderProfile(profile);

    await this.emitEvent(
      status === 'published' ? 'provider.profile.published' : 'provider.profile.updated',
      profile.providerId,
      'provider',
      actorUserId,
      { status },
    );

    return profile;
  }

  public async createServiceOffering(input: {
    providerId?: string;
    organizationId?: string;
    category: ProviderCategory;
    titleFa: string;
    descriptionFa: string;
    serviceAreas?: ServiceAreaDeclaration[];
    pricingModel: PricingModel;
    basePriceMillionToman?: number;
    maxPriceMillionToman?: number;
  }, actorUserId: string): Promise<ProviderServiceOffering> {
    const category = validateProviderCategory(input.category);
    const model = validatePricingModel(input.pricingModel);
    const titleFa = sanitizeText(input.titleFa, 150);
    const descriptionFa = sanitizeText(input.descriptionFa, 1000);

    if (titleFa.length < 3) throw new ProviderValidationError('INVALID_SERVICE_TITLE', 'Title must be at least 3 characters.');

    const serviceId = `srv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();

    const offering: ProviderServiceOffering = {
      serviceId,
      providerId: input.providerId,
      organizationId: input.organizationId,
      category,
      titleFa,
      descriptionFa,
      serviceAreas: input.serviceAreas || [],
      pricingModel: model,
      basePriceMillionToman: typeof input.basePriceMillionToman === 'number' && input.basePriceMillionToman > 0 ? Math.round(input.basePriceMillionToman * 100) / 100 : undefined,
      maxPriceMillionToman: typeof input.maxPriceMillionToman === 'number' && input.maxPriceMillionToman > 0 ? Math.round(input.maxPriceMillionToman * 100) / 100 : undefined,
      currency: 'IRT',
      isAvailable: true,
      createdAtIso: now,
      updatedAtIso: now,
    };

    await this.deps.repository.saveServiceOffering(offering);
    await this.emitEvent('provider.service.created', serviceId, 'service', actorUserId, {
      titleFa,
      category,
      pricingModel: model,
    });

    return offering;
  }

  public async submitReview(input: {
    providerId?: string;
    organizationId?: string;
    serviceId?: string;
    serviceRequestId?: string;
    rating: number;
    reviewTextFa: string;
  }, reviewerUserId: string): Promise<ProviderReviewRecord> {
    const targetId = input.providerId || input.organizationId;
    if (!targetId) throw new ProviderValidationError('MISSING_REVIEW_TARGET', 'Either providerId or organizationId must be specified.');

    const rating = validateReviewRating(input.rating);
    const textFa = sanitizeText(input.reviewTextFa, 1000);
    if (textFa.length < 5) throw new ProviderValidationError('INVALID_REVIEW_TEXT', 'Review text must be at least 5 characters.');

    // Assert no self review
    if (input.providerId) {
      const profile = await this.deps.repository.getProviderProfileById(input.providerId);
      if (profile) {
        assertNoSelfReview(reviewerUserId, profile.userId);
      }
    }

    // Assert no duplicate review
    const existing = await this.deps.repository.findExistingReview(reviewerUserId, targetId, input.serviceRequestId);
    if (existing) {
      throw new ProviderValidationError('DUPLICATE_REVIEW', 'A review from this user already exists for this provider.');
    }

    // Determine verified engagement status
    let isVerifiedEngagement = false;
    if (input.serviceRequestId) {
      const req = await this.deps.repository.getServiceRequestById(input.serviceRequestId);
      if (req && req.requesterUserId === reviewerUserId && (req.selectedProviderId === targetId || req.targetProviderIds?.includes(targetId))) {
        isVerifiedEngagement = true;
      }
    }

    const reviewId = `rev_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();

    const review: ProviderReviewRecord = {
      reviewId,
      reviewerUserId,
      providerId: input.providerId,
      organizationId: input.organizationId,
      serviceId: input.serviceId,
      serviceRequestId: input.serviceRequestId,
      rating,
      reviewTextFa: textFa,
      isVerifiedEngagement,
      moderationStatus: 'approved',
      createdAtIso: now,
    };

    await this.deps.repository.saveReview(review);
    await this.emitEvent('provider.review.submitted', reviewId, 'review', reviewerUserId, {
      targetId,
      rating,
      isVerifiedEngagement,
    });

    return review;
  }

  public async searchProviders(filters: ProviderSearchFilters): Promise<{ items: IndividualProviderProfile[]; nextCursor?: string }> {
    return this.deps.repository.searchProviderProfiles(filters);
  }

  public async getPerformanceMetrics(providerId: string): Promise<ProviderPerformanceMetrics> {
    const profile = await this.deps.repository.getProviderProfileById(providerId);
    if (!profile) throw new ProviderValidationError('PROFILE_NOT_FOUND', 'Provider profile not found.');

    const services = await this.deps.repository.listServicesByProvider(providerId);
    const credentials = await this.deps.repository.listCredentialsByOwner(providerId);
    const reviews = await this.deps.repository.listReviewsByTarget(providerId, true);

    const verifiedCreds = credentials.filter((c) => c.verificationStatus === 'verified').length;
    const avgRating = reviews.length > 0 ? Math.round((reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length) * 10) / 10 : 0;

    // Calculate completeness score
    let score = 30; // base score for registered profile
    if (profile.biographyFa) score += 15;
    if (profile.specialties.length > 0) score += 15;
    if (profile.serviceAreas.length > 0) score += 15;
    if (services.length > 0) score += 15;
    if (verifiedCreds > 0) score += 10;

    return {
      providerId,
      profileCompletenessPercent: Math.min(100, score),
      publishedServicesCount: services.length,
      submittedQuotationsCount: 0,
      verifiedCredentialsCount: verifiedCreds,
      approvedReviewsCount: reviews.length,
      averageRating: avgRating,
    };
  }

  // Delegated workflows
  public async createOrganization(input: Parameters<typeof createOrganizationWorkflow>[1], actorUserId: string): Promise<ProviderOrganization> {
    return createOrganizationWorkflow({ repository: this.deps.repository, emitEvent: this.emitEvent.bind(this) }, input, actorUserId);
  }

  public async addOrganizationMember(input: Parameters<typeof addOrganizationMemberWorkflow>[1], actorUserId: string): Promise<OrganizationMembership> {
    return addOrganizationMemberWorkflow({ repository: this.deps.repository, emitEvent: this.emitEvent.bind(this) }, input, actorUserId);
  }

  public async removeOrganizationMember(organizationId: string, targetUserId: string, actorUserId: string): Promise<void> {
    return removeOrganizationMemberWorkflow({ repository: this.deps.repository, emitEvent: this.emitEvent.bind(this) }, organizationId, targetUserId, actorUserId);
  }

  public async submitCredential(input: Parameters<typeof submitCredentialWorkflow>[1], actorUserId: string): Promise<ProviderCredentialRecord> {
    return submitCredentialWorkflow({ repository: this.deps.repository, emitEvent: this.emitEvent.bind(this) }, input, actorUserId);
  }

  public async recordCredentialVerification(credentialId: string, decision: 'verified' | 'rejected', reason: string | undefined, reviewerUserId: string): Promise<ProviderCredentialRecord> {
    return recordCredentialVerificationWorkflow({ repository: this.deps.repository, emitEvent: this.emitEvent.bind(this) }, credentialId, decision, reason, reviewerUserId);
  }

  public async createServiceRequest(input: Parameters<typeof createServiceRequestWorkflow>[1], requesterUserId: string): Promise<CustomerServiceRequest> {
    return createServiceRequestWorkflow({ repository: this.deps.repository, emitEvent: this.emitEvent.bind(this) }, input, requesterUserId);
  }

  public async submitQuotation(input: Parameters<typeof submitQuotationWorkflow>[1], submittingUserId: string): Promise<ProviderQuotationRecord> {
    return submitQuotationWorkflow({ repository: this.deps.repository, emitEvent: this.emitEvent.bind(this) }, input, submittingUserId);
  }

  public async updateQuotation(parentQuotationId: string, newPriceMillion: number, newDetailsFa: string, actorUserId: string): Promise<ProviderQuotationRecord> {
    return updateQuotationWorkflow({ repository: this.deps.repository, emitEvent: this.emitEvent.bind(this) }, parentQuotationId, newPriceMillion, newDetailsFa, actorUserId);
  }

  public async selectProvider(requestId: string, selectedProviderId: string, selectedQuotationId: string | undefined, requesterUserId: string): Promise<CustomerServiceRequest> {
    return selectProviderWorkflow({ repository: this.deps.repository, emitEvent: this.emitEvent.bind(this) }, requestId, selectedProviderId, selectedQuotationId, requesterUserId);
  }

  private async emitEvent(
    eventType: ProviderDomainEvent['eventType'],
    aggregateId: string,
    aggregateType: ProviderDomainEvent['aggregateType'],
    actorUserId: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const event: ProviderDomainEvent = {
      eventId: `ev_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      eventType,
      aggregateId,
      aggregateType,
      actorUserId,
      payload,
      timestampIso: new Date().toISOString(),
    };
    await this.deps.repository.recordEvent(event);
    if (this.deps.notificationsAdapter) {
      await this.deps.notificationsAdapter.dispatchProviderEvent(event);
    }
  }
}
