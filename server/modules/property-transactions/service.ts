/**
 * Property Transaction & Deal Management Application Service
 * (`server/modules/property-transactions/service.ts`)
 * Exclusive ownership: `server/modules/property-transactions/`
 */

import type {
  BargainsListingValidationAdapter,
  GeographyAddressDisclosureAdapter,
  MessagingWorkflowAdapter,
  NotificationsOutboxAdapter,
  PropertyRegistryAdapter,
  TrustAndSafetyAlertAdapter,
} from './contracts';
import {
  convertInquiryToDealWorkflow,
  createInquiryWorkflow,
  respondToInquiryWorkflow,
  withdrawInquiryWorkflow,
} from './inquiriesWorkflow';
import type { PropertyTransactionRepository } from './repository';
import { validateDealStateTransition } from './stateMachine';
import type {
  DealDomainEvent,
  DealOfferRecord,
  DealWorkflowRecord,
  MilestoneStatus,
  PropertyInquiryRecord,
  PurchaseOfferTerms,
  RentalOfferTerms,
  ViewingAppointmentRecord,
} from './types';
import {
  assertParticipantCanAcceptOffer,
  assertParticipantCanSubmitOffer,
  DealValidationError,
  sanitizeText,
  validateOfferTransactionMatch,
  validatePurchaseOfferTerms,
  validateRentalOfferTerms,
} from './validation';
import {
  confirmViewingWorkflow,
  requestViewingWorkflow,
  rescheduleViewingWorkflow,
} from './viewingsWorkflow';

export interface PropertyTransactionServiceDependencies {
  repository: PropertyTransactionRepository;
  bargainsAdapter: BargainsListingValidationAdapter;
  propertyRegistryAdapter?: PropertyRegistryAdapter;
  geographyAdapter?: GeographyAddressDisclosureAdapter;
  notificationsAdapter?: NotificationsOutboxAdapter;
  messagingAdapter?: MessagingWorkflowAdapter;
  trustAndSafetyAdapter?: TrustAndSafetyAlertAdapter;
}

export class PropertyTransactionService {
  constructor(private readonly deps: PropertyTransactionServiceDependencies) {}

  public async createInquiry(input: {
    listingId: string;
    message: string;
    preferredContactMethod?: 'phone' | 'platform_message' | 'in_person';
    preferredViewingTimes?: string[];
    budgetMillionToman?: number;
  }, actorUserId: string): Promise<PropertyInquiryRecord> {
    return createInquiryWorkflow(
      {
        repository: this.deps.repository,
        bargainsAdapter: this.deps.bargainsAdapter,
        messagingAdapter: this.deps.messagingAdapter,
        emitEvent: this.emitEvent.bind(this),
      },
      input,
      actorUserId,
    );
  }

  public async respondToInquiry(inquiryId: string, responseNote: string, actorUserId: string): Promise<PropertyInquiryRecord> {
    return respondToInquiryWorkflow(
      {
        repository: this.deps.repository,
        bargainsAdapter: this.deps.bargainsAdapter,
        emitEvent: this.emitEvent.bind(this),
      },
      inquiryId,
      responseNote,
      actorUserId,
    );
  }

  public async withdrawInquiry(inquiryId: string, reason: string, actorUserId: string): Promise<PropertyInquiryRecord> {
    return withdrawInquiryWorkflow(
      {
        repository: this.deps.repository,
        bargainsAdapter: this.deps.bargainsAdapter,
        emitEvent: this.emitEvent.bind(this),
      },
      inquiryId,
      reason,
      actorUserId,
    );
  }

  public async convertInquiryToDeal(inquiryId: string, actorUserId: string): Promise<DealWorkflowRecord> {
    return convertInquiryToDealWorkflow(
      {
        repository: this.deps.repository,
        bargainsAdapter: this.deps.bargainsAdapter,
        messagingAdapter: this.deps.messagingAdapter,
        emitEvent: this.emitEvent.bind(this),
      },
      inquiryId,
      actorUserId,
    );
  }

  public async requestViewingAppointment(input: {
    listingId: string;
    dealId?: string;
    inquiryId?: string;
    hostUserId: string;
    scheduledStartTimeIso: string;
    durationMinutes: number;
    timeZone?: string;
  }, actorUserId: string): Promise<ViewingAppointmentRecord> {
    return requestViewingWorkflow(
      {
        repository: this.deps.repository,
        emitEvent: this.emitEvent.bind(this),
      },
      input,
      actorUserId,
    );
  }

  public async confirmViewingAppointment(appointmentId: string, actorUserId: string): Promise<ViewingAppointmentRecord> {
    return confirmViewingWorkflow(
      {
        repository: this.deps.repository,
        emitEvent: this.emitEvent.bind(this),
      },
      appointmentId,
      actorUserId,
    );
  }

  public async rescheduleViewingAppointment(appointmentId: string, newTimeIso: string, reason: string, actorUserId: string): Promise<ViewingAppointmentRecord> {
    return rescheduleViewingWorkflow(
      {
        repository: this.deps.repository,
        emitEvent: this.emitEvent.bind(this),
      },
      appointmentId,
      newTimeIso,
      reason,
      actorUserId,
    );
  }

  public async submitOffer(input: {
    dealId: string;
    purchaseTerms?: PurchaseOfferTerms;
    rentalTerms?: RentalOfferTerms;
    nonFinancialConditions?: string;
  }, actorUserId: string): Promise<DealOfferRecord> {
    const deal = await this.deps.repository.getDealById(input.dealId);
    if (!deal) throw new DealValidationError('DEAL_NOT_FOUND', 'Deal not found.');

    const participant = deal.participants.find((p) => p.userId === actorUserId && p.isActive);
    if (!participant) throw new DealValidationError('UNAUTHORIZED_PARTICIPANT', 'User is not an active participant in this deal.');

    assertParticipantCanSubmitOffer(participant, deal.transactionType);

    const activeOffers = (await this.deps.repository.listOffersForDeal(deal.dealId)).filter((o) => o.status === 'active');
    if (activeOffers.length > 0) {
      throw new DealValidationError('SIMULTANEOUS_OFFER_CONFLICT', 'An active offer is already pending response. Submit a counteroffer or withdraw current offer.');
    }

    validateOfferTransactionMatch(deal.transactionType, input.purchaseTerms, input.rentalTerms);
    const validatedPurchase = input.purchaseTerms ? validatePurchaseOfferTerms(input.purchaseTerms) : undefined;
    const validatedRental = input.rentalTerms ? validateRentalOfferTerms(input.rentalTerms) : undefined;

    const offerId = `off_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date();
    const expiry = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const record: DealOfferRecord = {
      offerId,
      dealId: deal.dealId,
      version: 1,
      submittingUserId: actorUserId,
      submittingRole: participant.role,
      transactionType: deal.transactionType,
      purchaseTerms: validatedPurchase,
      rentalTerms: validatedRental,
      nonFinancialConditions: sanitizeText(input.nonFinancialConditions, 500) || undefined,
      status: 'active',
      submittedAtIso: now.toISOString(),
      expiresAtIso: expiry.toISOString(),
    };

    await this.deps.repository.saveOffer(record);
    deal.activeOfferId = offerId;
    validateDealStateTransition(deal, 'offer_submitted', actorUserId);
    deal.lifecycleStatus = 'offer_submitted';
    deal.statusHistory.push({ fromStatus: deal.lifecycleStatus, toStatus: 'offer_submitted', actorUserId, timestampIso: now.toISOString() });
    await this.deps.repository.saveDeal(deal);

    await this.emitEvent('offer.submitted', offerId, 'offer', actorUserId, { dealId: deal.dealId, version: 1 });
    return record;
  }

  public async submitCounteroffer(input: {
    parentOfferId: string;
    purchaseTerms?: PurchaseOfferTerms;
    rentalTerms?: RentalOfferTerms;
    nonFinancialConditions?: string;
  }, actorUserId: string): Promise<DealOfferRecord> {
    const parent = await this.deps.repository.getOfferById(input.parentOfferId);
    if (!parent) throw new DealValidationError('OFFER_NOT_FOUND', 'Parent offer not found.');
    if (parent.status !== 'active') throw new DealValidationError('PARENT_OFFER_INACTIVE', `Parent offer is ${parent.status} and cannot be countered.`);

    const deal = await this.deps.repository.getDealById(parent.dealId);
    if (!deal) throw new DealValidationError('DEAL_NOT_FOUND', 'Deal not found.');

    const participant = deal.participants.find((p) => p.userId === actorUserId && p.isActive);
    if (!participant) throw new DealValidationError('UNAUTHORIZED_PARTICIPANT', 'User is not an active participant.');
    if (parent.submittingUserId === actorUserId) {
      throw new DealValidationError('CANNOT_COUNTER_OWN_OFFER', 'A participant cannot submit a counteroffer to their own offer.');
    }

    validateOfferTransactionMatch(deal.transactionType, input.purchaseTerms, input.rentalTerms);
    const validatedPurchase = input.purchaseTerms ? validatePurchaseOfferTerms(input.purchaseTerms) : undefined;
    const validatedRental = input.rentalTerms ? validateRentalOfferTerms(input.rentalTerms) : undefined;

    parent.status = 'countered';
    await this.deps.repository.saveOffer(parent);

    const offerId = `off_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date();
    const expiry = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const record: DealOfferRecord = {
      offerId,
      dealId: deal.dealId,
      version: parent.version + 1,
      parentOfferId: parent.offerId,
      submittingUserId: actorUserId,
      submittingRole: participant.role,
      transactionType: deal.transactionType,
      purchaseTerms: validatedPurchase,
      rentalTerms: validatedRental,
      nonFinancialConditions: sanitizeText(input.nonFinancialConditions, 500) || undefined,
      status: 'active',
      submittedAtIso: now.toISOString(),
      expiresAtIso: expiry.toISOString(),
    };

    await this.deps.repository.saveOffer(record);
    deal.activeOfferId = offerId;
    deal.lifecycleStatus = 'counteroffer_pending';
    deal.statusHistory.push({ fromStatus: deal.lifecycleStatus, toStatus: 'counteroffer_pending', actorUserId, timestampIso: now.toISOString() });
    await this.deps.repository.saveDeal(deal);

    await this.emitEvent('offer.countered', offerId, 'offer', actorUserId, { dealId: deal.dealId, version: record.version });
    return record;
  }

  public async acceptOffer(dealId: string, offerId: string, actorUserId: string): Promise<DealWorkflowRecord> {
    const deal = await this.deps.repository.getDealById(dealId);
    if (!deal) throw new DealValidationError('DEAL_NOT_FOUND', 'Deal not found.');

    const offer = await this.deps.repository.getOfferById(offerId);
    if (!offer || offer.dealId !== dealId) throw new DealValidationError('OFFER_NOT_FOUND', 'Offer not found in this deal.');
    if (offer.status !== 'active') throw new DealValidationError('OFFER_NOT_ACTIVE', `Offer is '${offer.status}' and cannot be accepted.`);

    const participant = deal.participants.find((p) => p.userId === actorUserId && p.isActive);
    if (!participant) throw new DealValidationError('UNAUTHORIZED_PARTICIPANT', 'User is not an active participant.');
    assertParticipantCanAcceptOffer(participant);

    if (offer.submittingUserId === actorUserId) {
      throw new DealValidationError('CANNOT_ACCEPT_OWN_OFFER', 'A participant cannot accept their own submitted offer; counterpart must accept.');
    }

    const now = new Date().toISOString();
    offer.status = 'accepted';
    offer.decidedAtIso = now;
    offer.decidedByUserId = actorUserId;
    await this.deps.repository.saveOffer(offer);

    deal.acceptedOfferId = offer.offerId;
    deal.activeOfferId = undefined;
    validateDealStateTransition(deal, 'offer_accepted', actorUserId);
    deal.lifecycleStatus = 'offer_accepted';

    if (deal.milestones[0]) {
      deal.milestones[0].status = 'verified_complete';
      deal.milestones[0].verifiedAtIso = now;
      deal.milestones[0].verifiedByUserId = actorUserId;
    }

    deal.statusHistory.push({ fromStatus: deal.lifecycleStatus, toStatus: 'offer_accepted', actorUserId, timestampIso: now });
    await this.deps.repository.saveDeal(deal);

    await this.emitEvent('offer.accepted', offer.offerId, 'offer', actorUserId, { dealId: deal.dealId });
    return deal;
  }

  public async updateMilestone(dealId: string, milestoneKey: string, nextStatus: MilestoneStatus, evidenceRef: string | undefined, notes: string | undefined, actorUserId: string): Promise<DealWorkflowRecord> {
    const deal = await this.deps.repository.getDealById(dealId);
    if (!deal) throw new DealValidationError('DEAL_NOT_FOUND', 'Deal not found.');

    const participant = deal.participants.find((p) => p.userId === actorUserId && p.isActive);
    if (!participant || !participant.canUpdateMilestones) {
      throw new DealValidationError('UNAUTHORIZED_MILESTONE_UPDATE', 'Participant cannot update milestones.');
    }

    const ms = deal.milestones.find((m) => m.milestoneKey === milestoneKey);
    if (!ms) throw new DealValidationError('MILESTONE_NOT_FOUND', `Milestone '${milestoneKey}' not found in deal.`);

    const now = new Date().toISOString();
    ms.status = nextStatus;
    ms.evidenceReferenceId = evidenceRef ? sanitizeText(evidenceRef, 128) : ms.evidenceReferenceId;
    ms.notes = notes ? sanitizeText(notes, 500) : ms.notes;

    if (nextStatus === 'reported_complete') {
      ms.reportedAtIso = now;
      ms.reportedByUserId = actorUserId;
    } else if (nextStatus === 'verified_complete') {
      ms.verifiedAtIso = now;
      ms.verifiedByUserId = actorUserId;
    }

    await this.deps.repository.saveDeal(deal);
    await this.emitEvent('deal.milestone_updated', deal.dealId, 'deal', actorUserId, { milestoneKey, nextStatus });
    return deal;
  }

  public async completeDeal(dealId: string, completionEvidence: string, actorUserId: string): Promise<DealWorkflowRecord> {
    const deal = await this.deps.repository.getDealById(dealId);
    if (!deal) throw new DealValidationError('DEAL_NOT_FOUND', 'Deal not found.');

    const participant = deal.participants.find((p) => p.userId === actorUserId && p.isActive);
    if (!participant || (!participant.isOwner && participant.role !== 'seller' && participant.role !== 'landlord')) {
      throw new DealValidationError('UNAUTHORIZED_DEAL_CLOSURE', 'Only the verified property owner/seller/landlord can close the deal.');
    }

    const cleanEvidence = sanitizeText(completionEvidence, 500);
    if (cleanEvidence.length < 5) {
      throw new DealValidationError('MISSING_COMPLETION_EVIDENCE', 'Valid completion evidence summary is required to close deal.');
    }

    if (deal.lifecycleStatus === 'offer_accepted') {
      deal.lifecycleStatus = 'awaiting_external_completion';
    }

    deal.milestones.forEach((m) => {
      if (m.status !== 'verified_complete') {
        m.status = 'verified_complete';
        m.verifiedAtIso = new Date().toISOString();
        m.verifiedByUserId = actorUserId;
      }
    });

    validateDealStateTransition(deal, 'completed', actorUserId);
    const now = new Date().toISOString();
    deal.lifecycleStatus = 'completed';
    deal.completionEvidenceSummary = cleanEvidence;
    deal.closedAtIso = now;
    deal.statusHistory.push({ fromStatus: 'awaiting_external_completion', toStatus: 'completed', actorUserId, timestampIso: now });

    await this.deps.repository.saveDeal(deal);
    await this.emitEvent('deal.completed', deal.dealId, 'deal', actorUserId, { completionEvidence: cleanEvidence });
    return deal;
  }

  public async cancelDeal(dealId: string, reason: string, actorUserId: string): Promise<DealWorkflowRecord> {
    const deal = await this.deps.repository.getDealById(dealId);
    if (!deal) throw new DealValidationError('DEAL_NOT_FOUND', 'Deal not found.');

    const participant = deal.participants.find((p) => p.userId === actorUserId && p.isActive);
    if (!participant) throw new DealValidationError('UNAUTHORIZED_PARTICIPANT', 'User is not a deal participant.');

    const cleanReason = sanitizeText(reason, 300);
    validateDealStateTransition(deal, 'cancelled', actorUserId, cleanReason);

    const now = new Date().toISOString();
    deal.lifecycleStatus = 'cancelled';
    deal.cancellationReason = cleanReason;
    deal.closedAtIso = now;
    deal.statusHistory.push({ fromStatus: deal.lifecycleStatus, toStatus: 'cancelled', actorUserId, timestampIso: now, reason: cleanReason });

    await this.deps.repository.saveDeal(deal);
    await this.emitEvent('deal.cancelled', deal.dealId, 'deal', actorUserId, { reason: cleanReason });
    return deal;
  }

  private async emitEvent(
    eventType: DealDomainEvent['eventType'],
    aggregateId: string,
    aggregateType: DealDomainEvent['aggregateType'],
    actorUserId: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const event: DealDomainEvent = {
      eventId: `ev_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      eventType,
      aggregateId,
      aggregateType,
      actorUserId,
      payload,
      timestampIso: new Date().toISOString(),
    };
    await this.deps.repository.recordDomainEvent(event);
    if (this.deps.notificationsAdapter) {
      await this.deps.notificationsAdapter.dispatchDealNotification(event);
    }
  }
}
