/**
 * @file server/modules/property-services/propertyServicesStore.ts
 * @description Isolated repository and store for provider profiles, offerings, quotations, bookings, and reviews.
 */

import crypto from 'node:crypto';
import type {
  BookingDocument,
  ModerationAuditEntry,
  ProviderPrivateProfile,
  ProviderPublicProfile,
  QuotationDocument,
  ReviewDocument,
  ServiceOfferingDocument,
  ServiceRequestDocument,
} from './propertyServicesTypes';

export class PropertyServicesStore {
  private readonly providers = new Map<string, ProviderPrivateProfile>(); // providerId -> profile
  private readonly userToProviderId = new Map<string, string>(); // userId -> providerId
  private readonly serviceOfferings = new Map<string, ServiceOfferingDocument>(); // serviceId -> offering
  private readonly serviceRequests = new Map<string, ServiceRequestDocument>(); // requestId -> request
  private readonly quotations = new Map<string, QuotationDocument>(); // quotationId -> quotation
  private readonly bookings = new Map<string, BookingDocument>(); // bookingId -> booking
  private readonly reviews = new Map<string, ReviewDocument>(); // reviewId -> review
  private readonly moderationAuditLogs: ModerationAuditEntry[] = [];

  // --- Provider Profiles ---

  public async saveProviderProfile(profile: ProviderPrivateProfile): Promise<ProviderPrivateProfile> {
    this.providers.set(profile.id, profile);
    this.userToProviderId.set(profile.userId, profile.id);
    return profile;
  }

  public async getPrivateProfileById(providerId: string): Promise<ProviderPrivateProfile | null> {
    return this.providers.get(providerId) || null;
  }

  public async getProviderByUserId(userId: string): Promise<ProviderPrivateProfile | null> {
    const providerId = this.userToProviderId.get(userId);
    if (!providerId) return null;
    return this.providers.get(providerId) || null;
  }

  /**
   * Returns sanitized public profile (stripping contact phone, IBAN, and private credentials).
   */
  public async getPublicProfileById(providerId: string): Promise<ProviderPublicProfile | null> {
    const priv = this.providers.get(providerId);
    if (!priv) return null;

    const {
      contactPhone: _cp,
      contactEmail: _ce,
      taxOrNationalId: _tn,
      officeAddressFa: _oa,
      bankIban: _bi,
      credentials: _c,
      internalAdminNotes: _in,
      ...publicFields
    } = priv;

    return publicFields;
  }

  public async listPublicProviders(filter?: {
    categoryId?: string;
    cityId?: string;
    verificationState?: string;
    limit?: number;
  }): Promise<ProviderPublicProfile[]> {
    const results: ProviderPublicProfile[] = [];
    const limit = Math.min(100, Math.max(1, filter?.limit || 20));

    for (const priv of this.providers.values()) {
      if (priv.operatingStatus === 'inactive') continue;

      if (filter?.verificationState && priv.verificationState !== filter.verificationState) {
        continue;
      }

      if (filter?.categoryId && !priv.primaryCategoryIds.includes(filter.categoryId)) {
        continue;
      }

      if (filter?.cityId) {
        const servesCity = priv.serviceAreas.some(
          (area) => area.isNationwide || area.cityId === filter.cityId,
        );
        if (!servesCity) continue;
      }

      const pub = await this.getPublicProfileById(priv.id);
      if (pub) results.push(pub);
      if (results.length >= limit) break;
    }

    return results;
  }

  // --- Service Offerings ---

  public async saveServiceOffering(offering: ServiceOfferingDocument): Promise<ServiceOfferingDocument> {
    this.serviceOfferings.set(offering.id, offering);
    return offering;
  }

  public async getServiceOfferingById(id: string): Promise<ServiceOfferingDocument | null> {
    return this.serviceOfferings.get(id) || null;
  }

  public async listOfferingsByProvider(providerId: string): Promise<ServiceOfferingDocument[]> {
    return Array.from(this.serviceOfferings.values()).filter(
      (o) => o.providerId === providerId && o.publicationStatus !== 'archived',
    );
  }

  // --- Service Requests ---

  public async saveServiceRequest(req: ServiceRequestDocument): Promise<ServiceRequestDocument> {
    this.serviceRequests.set(req.id, req);
    return req;
  }

  public async getServiceRequestById(id: string): Promise<ServiceRequestDocument | null> {
    return this.serviceRequests.get(id) || null;
  }

  public async listRequestsByClient(clientUid: string): Promise<ServiceRequestDocument[]> {
    return Array.from(this.serviceRequests.values()).filter((r) => r.clientUid === clientUid);
  }

  // --- Quotations ---

  public async saveQuotation(q: QuotationDocument): Promise<QuotationDocument> {
    this.quotations.set(q.id, q);
    return q;
  }

  public async getQuotationById(id: string): Promise<QuotationDocument | null> {
    return this.quotations.get(id) || null;
  }

  /**
   * Retrieves quotations for a request enforcing privacy:
   * Only the request owner or quoting provider can access!
   */
  public async listQuotationsForRequest(requestId: string, requestingUid: string, isAdmin = false): Promise<QuotationDocument[]> {
    const request = this.serviceRequests.get(requestId);
    if (!request) return [];

    const isClient = request.clientUid === requestingUid;

    return Array.from(this.quotations.values()).filter((q) => {
      if (q.requestId !== requestId) return false;
      if (isAdmin || isClient) return true;
      return q.providerUserId === requestingUid;
    });
  }

  // --- Bookings ---

  public async saveBooking(b: BookingDocument): Promise<BookingDocument> {
    this.bookings.set(b.id, b);
    return b;
  }

  public async getBookingById(bookingId: string): Promise<BookingDocument | null> {
    return this.bookings.get(bookingId) || null;
  }

  // --- Reviews ---

  public async saveReview(review: ReviewDocument): Promise<ReviewDocument> {
    this.reviews.set(review.id, review);
    return review;
  }

  public async listApprovedReviewsForProvider(providerId: string): Promise<ReviewDocument[]> {
    return Array.from(this.reviews.values()).filter(
      (r) => r.providerId === providerId && r.moderationStatus === 'approved',
    );
  }

  // --- Moderation ---

  public async logModerationAction(entry: Omit<ModerationAuditEntry, 'id' | 'timestampIso'>): Promise<ModerationAuditEntry> {
    const fullEntry: ModerationAuditEntry = {
      ...entry,
      id: `mod_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
      timestampIso: new Date().toISOString(),
    };
    this.moderationAuditLogs.push(fullEntry);
    return fullEntry;
  }

  public getModerationLogs(): readonly ModerationAuditEntry[] {
    return this.moderationAuditLogs;
  }

  public clearAllForTesting(): void {
    this.providers.clear();
    this.userToProviderId.clear();
    this.serviceOfferings.clear();
    this.serviceRequests.clear();
    this.quotations.clear();
    this.bookings.clear();
    this.reviews.clear();
    this.moderationAuditLogs.length = 0;
  }
}

export const defaultPropertyServicesStore = new PropertyServicesStore();
