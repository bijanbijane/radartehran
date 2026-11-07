/**
 * @file server/modules/leads/leadAdapters.ts
 * @description Dependency isolation adapters for cross-module integration with
 * Bargains, Real Estate Professionals, Geography, and Notifications modules.
 */

import type { LeadDomainEvent } from './leadTypes';

export interface ListingVerificationResult {
  readonly found: boolean;
  readonly isApproved: boolean;
  readonly cityId?: string;
  readonly hoodId?: number;
  readonly ownerUid?: string;
  readonly assignedProfessionalUid?: string;
  readonly representingAgencyId?: string;
}

export interface ListingVerificationAdapter {
  getListingReference(listingId: string): Promise<ListingVerificationResult>;
}

export interface ProfessionalVerificationResult {
  readonly exists: boolean;
  readonly isLicenseVerified: boolean;
  readonly agencyId?: string;
  readonly branchId?: string;
  readonly role?: string;
}

export interface AgencyVerificationResult {
  readonly exists: boolean;
  readonly ownerUid: string;
  readonly managerUids: readonly string[];
  readonly activeBranchIds: readonly string[];
}

export interface ProfessionalVerificationAdapter {
  verifyProfessional(professionalUserId: string): Promise<ProfessionalVerificationResult>;
  verifyAgency(agencyId: string): Promise<AgencyVerificationResult>;
  isMemberOfAgency(professionalUserId: string, agencyId: string): Promise<boolean>;
}

export interface GeographyVerificationAdapter {
  isCitySupported(cityId: string): Promise<boolean>;
  isNeighborhoodInCity(cityId: string, hoodId: number): Promise<boolean>;
}

export interface NotificationEventPublisherAdapter {
  publishDomainEvent(event: LeadDomainEvent): Promise<void>;
}

/**
 * In-memory test adapter for Bargains listings.
 */
export class MemoryListingAdapter implements ListingVerificationAdapter {
  private readonly listings = new Map<string, ListingVerificationResult>();

  public setListing(listingId: string, details: ListingVerificationResult): void {
    this.listings.set(listingId, details);
  }

  public async getListingReference(listingId: string): Promise<ListingVerificationResult> {
    const found = this.listings.get(listingId);
    if (!found) {
      return { found: false, isApproved: false };
    }
    return found;
  }
}

/**
 * In-memory test adapter for Real Estate Professionals and Agencies.
 */
export class MemoryProfessionalAdapter implements ProfessionalVerificationAdapter {
  private readonly professionals = new Map<string, ProfessionalVerificationResult>();
  private readonly agencies = new Map<string, AgencyVerificationResult>();
  private readonly agencyMemberships = new Set<string>(); // "agencyId:professionalUserId"

  public setProfessional(uid: string, details: ProfessionalVerificationResult): void {
    this.professionals.set(uid, details);
    if (details.agencyId) {
      this.agencyMemberships.add(`${details.agencyId}:${uid}`);
    }
  }

  public setAgency(agencyId: string, details: AgencyVerificationResult): void {
    this.agencies.set(agencyId, details);
  }

  public addMembership(agencyId: string, professionalUserId: string): void {
    this.agencyMemberships.add(`${agencyId}:${professionalUserId}`);
  }

  public async verifyProfessional(professionalUserId: string): Promise<ProfessionalVerificationResult> {
    const prof = this.professionals.get(professionalUserId);
    if (!prof) {
      return { exists: false, isLicenseVerified: false };
    }
    return prof;
  }

  public async verifyAgency(agencyId: string): Promise<AgencyVerificationResult> {
    const agency = this.agencies.get(agencyId);
    if (!agency) {
      return { exists: false, ownerUid: '', managerUids: [], activeBranchIds: [] };
    }
    return agency;
  }

  public async isMemberOfAgency(professionalUserId: string, agencyId: string): Promise<boolean> {
    return this.agencyMemberships.has(`${agencyId}:${professionalUserId}`);
  }
}

/**
 * In-memory test adapter for Geographic references.
 */
export class MemoryGeographyAdapter implements GeographyVerificationAdapter {
  private readonly supportedCities = new Set<string>(['tehran', 'karaj', 'mashhad', 'isfahan', 'shiraz']);

  public async isCitySupported(cityId: string): Promise<boolean> {
    return this.supportedCities.has(cityId.toLowerCase());
  }

  public async isNeighborhoodInCity(cityId: string, hoodId: number): Promise<boolean> {
    if (!this.supportedCities.has(cityId.toLowerCase())) return false;
    return hoodId > 0 && hoodId <= 999;
  }
}

/**
 * In-memory test adapter for Event publishing.
 */
export class MemoryNotificationPublisher implements NotificationEventPublisherAdapter {
  public readonly publishedEvents: LeadDomainEvent[] = [];

  public async publishDomainEvent(event: LeadDomainEvent): Promise<void> {
    this.publishedEvents.push(event);
  }

  public clear(): void {
    this.publishedEvents.length = 0;
  }
}
