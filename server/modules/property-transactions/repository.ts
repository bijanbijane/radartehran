/**
 * Property Transaction Durable Repository Interface & Transactional Store
 * (`server/modules/property-transactions/repository.ts`)
 * Exclusive ownership: `server/modules/property-transactions/`
 */

import type {
  DealDomainEvent,
  DealOfferRecord,
  DealWorkflowRecord,
  PropertyInquiryRecord,
  ViewingAppointmentRecord,
} from './types';
import { DealValidationError } from './validation';

export interface PropertyTransactionRepository {
  saveInquiry(inquiry: PropertyInquiryRecord): Promise<void>;
  getInquiryById(inquiryId: string): Promise<PropertyInquiryRecord | null>;
  listInquiriesByUser(
    userId: string,
    role: 'initiator' | 'target' | 'any',
    limit: number,
    cursor?: string,
  ): Promise<{ items: PropertyInquiryRecord[]; nextCursor?: string }>;
  findExistingActiveInquiry(
    listingId: string,
    initiatingUserId: string,
  ): Promise<PropertyInquiryRecord | null>;

  saveDeal(deal: DealWorkflowRecord, expectedRevision?: number): Promise<void>;
  getDealById(dealId: string): Promise<DealWorkflowRecord | null>;
  listDealsForParticipant(
    userId: string,
    limit: number,
    cursor?: string,
  ): Promise<{ items: DealWorkflowRecord[]; nextCursor?: string }>;

  saveViewingAppointment(viewing: ViewingAppointmentRecord): Promise<void>;
  getViewingById(appointmentId: string): Promise<ViewingAppointmentRecord | null>;
  listConfirmedViewingsForHost(
    hostUserId: string,
    startIso: string,
    endIso: string,
  ): Promise<ViewingAppointmentRecord[]>;
  listViewingsForDeal(dealId: string): Promise<ViewingAppointmentRecord[]>;

  saveOffer(offer: DealOfferRecord): Promise<void>;
  getOfferById(offerId: string): Promise<DealOfferRecord | null>;
  listOffersForDeal(dealId: string): Promise<DealOfferRecord[]>;

  recordDomainEvent(event: DealDomainEvent): Promise<void>;
  listDomainEvents(aggregateId: string): Promise<DealDomainEvent[]>;
}

export class InMemoryPropertyTransactionRepository implements PropertyTransactionRepository {
  private inquiries = new Map<string, PropertyInquiryRecord>();
  private deals = new Map<string, DealWorkflowRecord>();
  private viewings = new Map<string, ViewingAppointmentRecord>();
  private offers = new Map<string, DealOfferRecord>();
  private events: DealDomainEvent[] = [];

  public async saveInquiry(inquiry: PropertyInquiryRecord): Promise<void> {
    this.inquiries.set(inquiry.inquiryId, JSON.parse(JSON.stringify(inquiry)));
  }

  public async getInquiryById(inquiryId: string): Promise<PropertyInquiryRecord | null> {
    const item = this.inquiries.get(inquiryId);
    return item ? JSON.parse(JSON.stringify(item)) : null;
  }

  public async listInquiriesByUser(
    userId: string,
    role: 'initiator' | 'target' | 'any',
    limit: number,
    cursor?: string,
  ): Promise<{ items: PropertyInquiryRecord[]; nextCursor?: string }> {
    const all = Array.from(this.inquiries.values()).filter((inq) => {
      if (role === 'initiator') return inq.initiatingUserId === userId;
      if (role === 'target') return inq.targetOwnerUserId === userId;
      return inq.initiatingUserId === userId || inq.targetOwnerUserId === userId;
    });

    all.sort((a, b) => b.createdAtIso.localeCompare(a.createdAtIso));

    const startIndex = cursor ? all.findIndex((i) => i.inquiryId === cursor) + 1 : 0;
    const safeStart = Math.max(0, startIndex);
    const slice = all.slice(safeStart, safeStart + limit);
    const nextCursor = safeStart + limit < all.length ? slice[slice.length - 1]?.inquiryId : undefined;

    return {
      items: JSON.parse(JSON.stringify(slice)),
      nextCursor,
    };
  }

  public async findExistingActiveInquiry(
    listingId: string,
    initiatingUserId: string,
  ): Promise<PropertyInquiryRecord | null> {
    for (const inq of this.inquiries.values()) {
      if (
        inq.listingId === listingId &&
        inq.initiatingUserId === initiatingUserId &&
        !['withdrawn', 'declined', 'expired', 'closed'].includes(inq.status)
      ) {
        return JSON.parse(JSON.stringify(inq));
      }
    }
    return null;
  }

  public async saveDeal(deal: DealWorkflowRecord, expectedRevision?: number): Promise<void> {
    const current = this.deals.get(deal.dealId);
    if (expectedRevision !== undefined && current) {
      if (current.revision !== expectedRevision) {
        throw new DealValidationError(
          'CONCURRENCY_CONFLICT',
          `Optimistic concurrency conflict on deal ${deal.dealId}: expected revision ${expectedRevision}, found ${current.revision}.`,
        );
      }
    }

    const nextRevision = (current ? current.revision : 0) + 1;
    const updated: DealWorkflowRecord = {
      ...JSON.parse(JSON.stringify(deal)),
      revision: nextRevision,
      updatedAtIso: new Date().toISOString(),
    };
    this.deals.set(deal.dealId, updated);
  }

  public async getDealById(dealId: string): Promise<DealWorkflowRecord | null> {
    const item = this.deals.get(dealId);
    return item ? JSON.parse(JSON.stringify(item)) : null;
  }

  public async listDealsForParticipant(
    userId: string,
    limit: number,
    cursor?: string,
  ): Promise<{ items: DealWorkflowRecord[]; nextCursor?: string }> {
    const matching = Array.from(this.deals.values()).filter((d) =>
      d.participants.some((p) => p.userId === userId && p.isActive),
    );

    matching.sort((a, b) => b.updatedAtIso.localeCompare(a.updatedAtIso));

    const startIndex = cursor ? matching.findIndex((d) => d.dealId === cursor) + 1 : 0;
    const safeStart = Math.max(0, startIndex);
    const slice = matching.slice(safeStart, safeStart + limit);
    const nextCursor = safeStart + limit < matching.length ? slice[slice.length - 1]?.dealId : undefined;

    return {
      items: JSON.parse(JSON.stringify(slice)),
      nextCursor,
    };
  }

  public async saveViewingAppointment(viewing: ViewingAppointmentRecord): Promise<void> {
    this.viewings.set(viewing.appointmentId, JSON.parse(JSON.stringify(viewing)));
  }

  public async getViewingById(appointmentId: string): Promise<ViewingAppointmentRecord | null> {
    const item = this.viewings.get(appointmentId);
    return item ? JSON.parse(JSON.stringify(item)) : null;
  }

  public async listConfirmedViewingsForHost(
    hostUserId: string,
    startIso: string,
    endIso: string,
  ): Promise<ViewingAppointmentRecord[]> {
    const startTime = new Date(startIso).getTime();
    const endTime = new Date(endIso).getTime();

    return Array.from(this.viewings.values())
      .filter((v) => {
        if (v.hostUserId !== hostUserId || v.status !== 'confirmed') return false;
        const vStart = new Date(v.scheduledStartTimeIso).getTime();
        const vEnd = vStart + v.durationMinutes * 60 * 1000;
        return (vStart < endTime && vEnd > startTime);
      })
      .map((item) => JSON.parse(JSON.stringify(item)));
  }

  public async listViewingsForDeal(dealId: string): Promise<ViewingAppointmentRecord[]> {
    return Array.from(this.viewings.values())
      .filter((v) => v.dealId === dealId)
      .sort((a, b) => b.scheduledStartTimeIso.localeCompare(a.scheduledStartTimeIso))
      .map((item) => JSON.parse(JSON.stringify(item)));
  }

  public async saveOffer(offer: DealOfferRecord): Promise<void> {
    this.offers.set(offer.offerId, JSON.parse(JSON.stringify(offer)));
  }

  public async getOfferById(offerId: string): Promise<DealOfferRecord | null> {
    const item = this.offers.get(offerId);
    return item ? JSON.parse(JSON.stringify(item)) : null;
  }

  public async listOffersForDeal(dealId: string): Promise<DealOfferRecord[]> {
    return Array.from(this.offers.values())
      .filter((o) => o.dealId === dealId)
      .sort((a, b) => a.version - b.version)
      .map((item) => JSON.parse(JSON.stringify(item)));
  }

  public async recordDomainEvent(event: DealDomainEvent): Promise<void> {
    this.events.push(JSON.parse(JSON.stringify(event)));
  }

  public async listDomainEvents(aggregateId: string): Promise<DealDomainEvent[]> {
    return this.events
      .filter((e) => e.aggregateId === aggregateId)
      .map((item) => JSON.parse(JSON.stringify(item)));
  }
}
