/**
 * Service Providers & Professionals Durable Repository Interface & Store
 * (`server/modules/service-providers/repository.ts`)
 * Exclusive ownership: `server/modules/service-providers/`
 */

import type {
  CustomerServiceRequest,
  IndividualProviderProfile,
  OrganizationMembership,
  ProviderCredentialRecord,
  ProviderDomainEvent,
  ProviderOrganization,
  ProviderQuotationRecord,
  ProviderReviewRecord,
  ProviderSearchFilters,
  ProviderServiceOffering,
} from './types';
import { ProviderValidationError } from './validation';

export interface ServiceProviderRepository {
  saveProviderProfile(profile: IndividualProviderProfile, expectedRevision?: number): Promise<void>;
  getProviderProfileById(providerId: string): Promise<IndividualProviderProfile | null>;
  getProviderProfileByUserId(userId: string): Promise<IndividualProviderProfile | null>;
  searchProviderProfiles(filters: ProviderSearchFilters): Promise<{ items: IndividualProviderProfile[]; nextCursor?: string }>;

  saveOrganization(org: ProviderOrganization): Promise<void>;
  getOrganizationById(organizationId: string): Promise<ProviderOrganization | null>;
  listOrganizations(limit: number, cursor?: string): Promise<{ items: ProviderOrganization[]; nextCursor?: string }>;

  saveMembership(membership: OrganizationMembership): Promise<void>;
  getMembership(organizationId: string, userId: string): Promise<OrganizationMembership | null>;
  listMembershipsByOrg(organizationId: string): Promise<OrganizationMembership[]>;
  listMembershipsByUser(userId: string): Promise<OrganizationMembership[]>;

  saveCredential(cred: ProviderCredentialRecord): Promise<void>;
  getCredentialById(credentialId: string): Promise<ProviderCredentialRecord | null>;
  listCredentialsByOwner(ownerId: string): Promise<ProviderCredentialRecord[]>;

  saveServiceOffering(service: ProviderServiceOffering): Promise<void>;
  getServiceOfferingById(serviceId: string): Promise<ProviderServiceOffering | null>;
  listServicesByProvider(providerId: string): Promise<ProviderServiceOffering[]>;
  listServicesByOrganization(organizationId: string): Promise<ProviderServiceOffering[]>;

  saveServiceRequest(req: CustomerServiceRequest): Promise<void>;
  getServiceRequestById(requestId: string): Promise<CustomerServiceRequest | null>;
  listRequestsByCustomer(userId: string, limit: number, cursor?: string): Promise<{ items: CustomerServiceRequest[]; nextCursor?: string }>;

  saveQuotation(quotation: ProviderQuotationRecord): Promise<void>;
  getQuotationById(quotationId: string): Promise<ProviderQuotationRecord | null>;
  listQuotationsByRequest(requestId: string): Promise<ProviderQuotationRecord[]>;

  saveReview(review: ProviderReviewRecord): Promise<void>;
  getReviewById(reviewId: string): Promise<ProviderReviewRecord | null>;
  listReviewsByTarget(targetId: string, approvedOnly?: boolean): Promise<ProviderReviewRecord[]>;
  findExistingReview(reviewerUserId: string, targetId: string, requestId?: string): Promise<ProviderReviewRecord | null>;

  recordEvent(event: ProviderDomainEvent): Promise<void>;
  listEvents(aggregateId: string): Promise<ProviderDomainEvent[]>;
}

export class InMemoryServiceProviderRepository implements ServiceProviderRepository {
  private profiles = new Map<string, IndividualProviderProfile>();
  private organizations = new Map<string, ProviderOrganization>();
  private memberships = new Map<string, OrganizationMembership>();
  private credentials = new Map<string, ProviderCredentialRecord>();
  private services = new Map<string, ProviderServiceOffering>();
  private requests = new Map<string, CustomerServiceRequest>();
  private quotations = new Map<string, ProviderQuotationRecord>();
  private reviews = new Map<string, ProviderReviewRecord>();
  private events: ProviderDomainEvent[] = [];

  public async saveProviderProfile(profile: IndividualProviderProfile, expectedRevision?: number): Promise<void> {
    const current = this.profiles.get(profile.providerId);
    if (expectedRevision !== undefined && current) {
      if (current.revision !== expectedRevision) {
        throw new ProviderValidationError(
          'CONCURRENCY_CONFLICT',
          `Optimistic concurrency conflict on provider ${profile.providerId}: expected revision ${expectedRevision}, found ${current.revision}.`,
        );
      }
    }
    const nextRevision = (current ? current.revision : 0) + 1;
    const updated: IndividualProviderProfile = {
      ...JSON.parse(JSON.stringify(profile)),
      revision: nextRevision,
      updatedAtIso: new Date().toISOString(),
    };
    this.profiles.set(profile.providerId, updated);
  }

  public async getProviderProfileById(providerId: string): Promise<IndividualProviderProfile | null> {
    const item = this.profiles.get(providerId);
    return item ? JSON.parse(JSON.stringify(item)) : null;
  }

  public async getProviderProfileByUserId(userId: string): Promise<IndividualProviderProfile | null> {
    for (const p of this.profiles.values()) {
      if (p.userId === userId) {
        return JSON.parse(JSON.stringify(p));
      }
    }
    return null;
  }

  public async searchProviderProfiles(filters: ProviderSearchFilters): Promise<{ items: IndividualProviderProfile[]; nextCursor?: string }> {
    const matching = Array.from(this.profiles.values()).filter((p) => {
      if (p.publicationStatus !== 'published') return false;
      if (filters.category && p.primaryCategory !== filters.category) return false;
      if (filters.cityId && !p.serviceAreas.some((sa) => sa.cityId === filters.cityId || sa.isNationwide)) return false;
      if (filters.verifiedOnly && p.verificationStatus === 'unverified') return false;
      if (filters.language && !p.languages.includes(filters.language)) return false;
      if (filters.specialtyKeyword) {
        const kw = filters.specialtyKeyword.toLowerCase();
        const matchesHeadline = p.professionalHeadlineFa.toLowerCase().includes(kw);
        const matchesSpec = p.specialties.some((s) => s.toLowerCase().includes(kw));
        if (!matchesHeadline && !matchesSpec) return false;
      }
      return true;
    });

    matching.sort((a, b) => b.updatedAtIso.localeCompare(a.updatedAtIso));

    const startIndex = filters.cursor ? matching.findIndex((p) => p.providerId === filters.cursor) + 1 : 0;
    const safeStart = Math.max(0, startIndex);
    const slice = matching.slice(safeStart, safeStart + filters.limit);
    const nextCursor = safeStart + filters.limit < matching.length ? slice[slice.length - 1]?.providerId : undefined;

    return { items: JSON.parse(JSON.stringify(slice)), nextCursor };
  }

  public async saveOrganization(org: ProviderOrganization): Promise<void> {
    this.organizations.set(org.organizationId, JSON.parse(JSON.stringify(org)));
  }

  public async getOrganizationById(organizationId: string): Promise<ProviderOrganization | null> {
    const item = this.organizations.get(organizationId);
    return item ? JSON.parse(JSON.stringify(item)) : null;
  }

  public async listOrganizations(limit: number, cursor?: string): Promise<{ items: ProviderOrganization[]; nextCursor?: string }> {
    const all = Array.from(this.organizations.values()).sort((a, b) => b.updatedAtIso.localeCompare(a.updatedAtIso));
    const startIndex = cursor ? all.findIndex((o) => o.organizationId === cursor) + 1 : 0;
    const safeStart = Math.max(0, startIndex);
    const slice = all.slice(safeStart, safeStart + limit);
    const nextCursor = safeStart + limit < all.length ? slice[slice.length - 1]?.organizationId : undefined;
    return { items: JSON.parse(JSON.stringify(slice)), nextCursor };
  }

  public async saveMembership(membership: OrganizationMembership): Promise<void> {
    this.memberships.set(membership.membershipId, JSON.parse(JSON.stringify(membership)));
  }

  public async getMembership(organizationId: string, userId: string): Promise<OrganizationMembership | null> {
    for (const m of this.memberships.values()) {
      if (m.organizationId === organizationId && m.userId === userId && m.isActive) {
        return JSON.parse(JSON.stringify(m));
      }
    }
    return null;
  }

  public async listMembershipsByOrg(organizationId: string): Promise<OrganizationMembership[]> {
    return Array.from(this.memberships.values())
      .filter((m) => m.organizationId === organizationId && m.isActive)
      .map((item) => JSON.parse(JSON.stringify(item)));
  }

  public async listMembershipsByUser(userId: string): Promise<OrganizationMembership[]> {
    return Array.from(this.memberships.values())
      .filter((m) => m.userId === userId && m.isActive)
      .map((item) => JSON.parse(JSON.stringify(item)));
  }

  public async saveCredential(cred: ProviderCredentialRecord): Promise<void> {
    this.credentials.set(cred.credentialId, JSON.parse(JSON.stringify(cred)));
  }

  public async getCredentialById(credentialId: string): Promise<ProviderCredentialRecord | null> {
    const item = this.credentials.get(credentialId);
    return item ? JSON.parse(JSON.stringify(item)) : null;
  }

  public async listCredentialsByOwner(ownerId: string): Promise<ProviderCredentialRecord[]> {
    return Array.from(this.credentials.values())
      .filter((c) => c.ownerId === ownerId)
      .sort((a, b) => b.createdAtIso.localeCompare(a.createdAtIso))
      .map((item) => JSON.parse(JSON.stringify(item)));
  }

  public async saveServiceOffering(service: ProviderServiceOffering): Promise<void> {
    this.services.set(service.serviceId, JSON.parse(JSON.stringify(service)));
  }

  public async getServiceOfferingById(serviceId: string): Promise<ProviderServiceOffering | null> {
    const item = this.services.get(serviceId);
    return item ? JSON.parse(JSON.stringify(item)) : null;
  }

  public async listServicesByProvider(providerId: string): Promise<ProviderServiceOffering[]> {
    return Array.from(this.services.values())
      .filter((s) => s.providerId === providerId)
      .map((item) => JSON.parse(JSON.stringify(item)));
  }

  public async listServicesByOrganization(organizationId: string): Promise<ProviderServiceOffering[]> {
    return Array.from(this.services.values())
      .filter((s) => s.organizationId === organizationId)
      .map((item) => JSON.parse(JSON.stringify(item)));
  }

  public async saveServiceRequest(req: CustomerServiceRequest): Promise<void> {
    this.requests.set(req.requestId, JSON.parse(JSON.stringify(req)));
  }

  public async getServiceRequestById(requestId: string): Promise<CustomerServiceRequest | null> {
    const item = this.requests.get(requestId);
    return item ? JSON.parse(JSON.stringify(item)) : null;
  }

  public async listRequestsByCustomer(userId: string, limit: number, cursor?: string): Promise<{ items: CustomerServiceRequest[]; nextCursor?: string }> {
    const matching = Array.from(this.requests.values()).filter((r) => r.requesterUserId === userId);
    matching.sort((a, b) => b.createdAtIso.localeCompare(a.createdAtIso));

    const startIndex = cursor ? matching.findIndex((r) => r.requestId === cursor) + 1 : 0;
    const safeStart = Math.max(0, startIndex);
    const slice = matching.slice(safeStart, safeStart + limit);
    const nextCursor = safeStart + limit < matching.length ? slice[slice.length - 1]?.requestId : undefined;

    return { items: JSON.parse(JSON.stringify(slice)), nextCursor };
  }

  public async saveQuotation(quotation: ProviderQuotationRecord): Promise<void> {
    this.quotations.set(quotation.quotationId, JSON.parse(JSON.stringify(quotation)));
  }

  public async getQuotationById(quotationId: string): Promise<ProviderQuotationRecord | null> {
    const item = this.quotations.get(quotationId);
    return item ? JSON.parse(JSON.stringify(item)) : null;
  }

  public async listQuotationsByRequest(requestId: string): Promise<ProviderQuotationRecord[]> {
    return Array.from(this.quotations.values())
      .filter((q) => q.requestId === requestId)
      .sort((a, b) => a.version - b.version)
      .map((item) => JSON.parse(JSON.stringify(item)));
  }

  public async saveReview(review: ProviderReviewRecord): Promise<void> {
    this.reviews.set(review.reviewId, JSON.parse(JSON.stringify(review)));
  }

  public async getReviewById(reviewId: string): Promise<ProviderReviewRecord | null> {
    const item = this.reviews.get(reviewId);
    return item ? JSON.parse(JSON.stringify(item)) : null;
  }

  public async listReviewsByTarget(targetId: string, approvedOnly = true): Promise<ProviderReviewRecord[]> {
    return Array.from(this.reviews.values())
      .filter((r) => {
        if (r.providerId !== targetId && r.organizationId !== targetId) return false;
        if (approvedOnly && r.moderationStatus !== 'approved') return false;
        return true;
      })
      .sort((a, b) => b.createdAtIso.localeCompare(a.createdAtIso))
      .map((item) => JSON.parse(JSON.stringify(item)));
  }

  public async findExistingReview(reviewerUserId: string, targetId: string, requestId?: string): Promise<ProviderReviewRecord | null> {
    for (const r of this.reviews.values()) {
      if (r.reviewerUserId === reviewerUserId && (r.providerId === targetId || r.organizationId === targetId)) {
        if (!requestId || r.serviceRequestId === requestId) {
          return JSON.parse(JSON.stringify(r));
        }
      }
    }
    return null;
  }

  public async recordEvent(event: ProviderDomainEvent): Promise<void> {
    this.events.push(JSON.parse(JSON.stringify(event)));
  }

  public async listEvents(aggregateId: string): Promise<ProviderDomainEvent[]> {
    return this.events
      .filter((e) => e.aggregateId === aggregateId)
      .map((item) => JSON.parse(JSON.stringify(item)));
  }
}
