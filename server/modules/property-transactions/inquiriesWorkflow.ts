/**
 * Property Transaction Inquiries Workflow
 * (`server/modules/property-transactions/inquiriesWorkflow.ts`)
 * Exclusive ownership: `server/modules/property-transactions/`
 */

import type { BargainsListingValidationAdapter, MessagingWorkflowAdapter } from './contracts';
import type { PropertyTransactionRepository } from './repository';
import { generateDefaultDealMilestones } from './stateMachine';
import type {
  DealDomainEvent,
  DealParticipant,
  DealWorkflowRecord,
  PropertyInquiryRecord,
} from './types';
import {
  DealValidationError,
  sanitizeText,
  validateSafeFirestoreId,
} from './validation';

export interface InquiriesWorkflowContext {
  repository: PropertyTransactionRepository;
  bargainsAdapter: BargainsListingValidationAdapter;
  messagingAdapter?: MessagingWorkflowAdapter;
  emitEvent: (
    eventType: DealDomainEvent['eventType'],
    aggregateId: string,
    aggregateType: DealDomainEvent['aggregateType'],
    actorUserId: string,
    payload: Record<string, unknown>,
  ) => Promise<void>;
}

export async function createInquiryWorkflow(
  ctx: InquiriesWorkflowContext,
  input: {
    listingId: string;
    message: string;
    preferredContactMethod?: 'phone' | 'platform_message' | 'in_person';
    preferredViewingTimes?: string[];
    budgetMillionToman?: number;
  },
  actorUserId: string,
): Promise<PropertyInquiryRecord> {
  const listingId = validateSafeFirestoreId(input.listingId, 'listingId');
  const initiatorId = validateSafeFirestoreId(actorUserId, 'actorUserId');

  const listingCheck = await ctx.bargainsAdapter.validateListingForTransaction(listingId);
  if (!listingCheck.valid || !listingCheck.snapshot) {
    throw new DealValidationError('LISTING_NOT_AVAILABLE', listingCheck.reason ?? 'Listing is not available for inquiry.');
  }
  const snapshot = listingCheck.snapshot;

  if (snapshot.ownerUserId === initiatorId) {
    throw new DealValidationError('CANNOT_INQUIRE_OWN_LISTING', 'Listing owner cannot initiate an inquiry on their own property.');
  }

  const existing = await ctx.repository.findExistingActiveInquiry(listingId, initiatorId);
  if (existing) {
    throw new DealValidationError('DUPLICATE_ACTIVE_INQUIRY', `Active inquiry ${existing.inquiryId} already exists for this listing.`);
  }

  const now = new Date();
  const expiry = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  const inquiryId = `inq_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const record: PropertyInquiryRecord = {
    inquiryId,
    listingId,
    initiatingUserId: initiatorId,
    targetOwnerUserId: snapshot.ownerUserId,
    transactionType: snapshot.transactionType,
    propertyCategory: snapshot.propertyCategory,
    message: sanitizeText(input.message, 1000) || 'درخواست اطلاعات تکمیلی و بازدید ملک.',
    preferredContactMethod: input.preferredContactMethod ?? 'platform_message',
    preferredViewingTimes: input.preferredViewingTimes?.map((t) => sanitizeText(t, 100)).slice(0, 5),
    budgetMillionToman: typeof input.budgetMillionToman === 'number' && input.budgetMillionToman > 0 ? input.budgetMillionToman : undefined,
    status: 'submitted',
    createdAtIso: now.toISOString(),
    updatedAtIso: now.toISOString(),
    expiresAtIso: expiry.toISOString(),
  };

  await ctx.repository.saveInquiry(record);
  await ctx.emitEvent('inquiry.created', inquiryId, 'inquiry', initiatorId, { listingId, targetOwnerUserId: snapshot.ownerUserId });

  return record;
}

export async function respondToInquiryWorkflow(
  ctx: InquiriesWorkflowContext,
  inquiryId: string,
  responseNote: string,
  actorUserId: string,
): Promise<PropertyInquiryRecord> {
  const inq = await ctx.repository.getInquiryById(inquiryId);
  if (!inq) throw new DealValidationError('INQUIRY_NOT_FOUND', 'Inquiry was not found.');
  if (inq.targetOwnerUserId !== actorUserId) {
    throw new DealValidationError('UNAUTHORIZED_INQUIRY_ACCESS', 'Only the listing owner can respond to this inquiry.');
  }

  inq.status = 'responded';
  inq.updatedAtIso = new Date().toISOString();
  await ctx.repository.saveInquiry(inq);
  await ctx.emitEvent('inquiry.responded', inq.inquiryId, 'inquiry', actorUserId, { responseNote: sanitizeText(responseNote, 300) });
  return inq;
}

export async function withdrawInquiryWorkflow(
  ctx: InquiriesWorkflowContext,
  inquiryId: string,
  reason: string,
  actorUserId: string,
): Promise<PropertyInquiryRecord> {
  const inq = await ctx.repository.getInquiryById(inquiryId);
  if (!inq) throw new DealValidationError('INQUIRY_NOT_FOUND', 'Inquiry was not found.');
  if (inq.initiatingUserId !== actorUserId) {
    throw new DealValidationError('UNAUTHORIZED_INQUIRY_ACCESS', 'Only the inquiry initiator can withdraw this inquiry.');
  }

  inq.status = 'withdrawn';
  inq.withdrawalReason = sanitizeText(reason, 200);
  inq.updatedAtIso = new Date().toISOString();
  await ctx.repository.saveInquiry(inq);
  await ctx.emitEvent('inquiry.withdrawn', inq.inquiryId, 'inquiry', actorUserId, { reason: inq.withdrawalReason });
  return inq;
}

export async function convertInquiryToDealWorkflow(
  ctx: InquiriesWorkflowContext,
  inquiryId: string,
  actorUserId: string,
): Promise<DealWorkflowRecord> {
  const inq = await ctx.repository.getInquiryById(inquiryId);
  if (!inq) throw new DealValidationError('INQUIRY_NOT_FOUND', 'Inquiry was not found.');
  if (inq.initiatingUserId !== actorUserId && inq.targetOwnerUserId !== actorUserId) {
    throw new DealValidationError('UNAUTHORIZED_INQUIRY_ACCESS', 'Only the inquiry participants can convert it to a deal.');
  }

  const listingCheck = await ctx.bargainsAdapter.validateListingForTransaction(inq.listingId);
  if (!listingCheck.valid || !listingCheck.snapshot) {
    throw new DealValidationError('LISTING_NOT_AVAILABLE', 'Listing is no longer active or approved.');
  }

  const now = new Date().toISOString();
  const dealId = `deal_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const isSale = inq.transactionType === 'sale';

  const participants: DealParticipant[] = [
    {
      participantId: `pt_${actorUserId}_1`,
      userId: inq.initiatingUserId,
      role: isSale ? 'buyer' : 'tenant',
      isOwner: false,
      displayName: 'متقاضی معامله',
      joinedAtIso: now,
      isActive: true,
      canSubmitOffers: true,
      canAcceptOffers: true,
      canManageViewings: true,
      canUpdateMilestones: true,
    },
    {
      participantId: `pt_${inq.targetOwnerUserId}_2`,
      userId: inq.targetOwnerUserId,
      role: isSale ? 'seller' : 'landlord',
      isOwner: true,
      displayName: 'مالک مبیع',
      joinedAtIso: now,
      isActive: true,
      canSubmitOffers: true,
      canAcceptOffers: true,
      canManageViewings: true,
      canUpdateMilestones: true,
    },
  ];

  const milestones = generateDefaultDealMilestones(dealId, inq.transactionType);
  const dealRecord: DealWorkflowRecord = {
    dealId,
    sourceInquiryId: inq.inquiryId,
    listingId: inq.listingId,
    transactionType: inq.transactionType,
    propertyCategory: inq.propertyCategory,
    initiatorUserId: actorUserId,
    lifecycleStatus: 'active_negotiation',
    participants,
    milestones,
    statusHistory: [
      {
        fromStatus: 'initiated',
        toStatus: 'active_negotiation',
        actorUserId,
        timestampIso: now,
        reason: `Converted from inquiry ${inq.inquiryId}`,
      },
    ],
    revision: 1,
    createdAtIso: now,
    updatedAtIso: now,
  };

  await ctx.repository.saveDeal(dealRecord);
  inq.status = 'converted_to_deal';
  inq.convertedDealId = dealId;
  inq.updatedAtIso = now;
  await ctx.repository.saveInquiry(inq);

  if (ctx.messagingAdapter) {
    await ctx.messagingAdapter.ensureDirectNegotiationThread({
      dealId,
      participantUserIds: [inq.initiatingUserId, inq.targetOwnerUserId],
      initiatorUserId: actorUserId,
    });
  }

  await ctx.emitEvent('inquiry.converted', dealId, 'deal', actorUserId, { inquiryId: inq.inquiryId });
  return dealRecord;
}
