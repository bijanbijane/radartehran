/**
 * Property Transaction & Deal Management Backend Domain Types
 * (`server/modules/property-transactions/types.ts`)
 * Exclusive ownership: `server/modules/property-transactions/`
 */

export type TransactionCategory = 'residential' | 'commercial' | 'office' | 'land' | 'other';
export type TransactionType = 'sale' | 'rental';

export type InquiryStatus =
  | 'submitted'
  | 'received'
  | 'responded'
  | 'viewing_requested'
  | 'converted_to_deal'
  | 'declined'
  | 'withdrawn'
  | 'expired'
  | 'closed';

export type DealLifecycleStatus =
  | 'initiated'
  | 'participants_pending'
  | 'active_negotiation'
  | 'viewing_pending'
  | 'viewing_completed'
  | 'offer_submitted'
  | 'counteroffer_pending'
  | 'offer_accepted'
  | 'awaiting_external_completion'
  | 'completed'
  | 'cancelled'
  | 'expired'
  | 'disputed';

export type ParticipantRole =
  | 'buyer'
  | 'seller'
  | 'tenant'
  | 'landlord'
  | 'authorized_representative'
  | 'real_estate_agent'
  | 'broker'
  | 'observer';

export type ViewingAppointmentStatus =
  | 'requested'
  | 'accepted'
  | 'rejected'
  | 'rescheduling_proposed'
  | 'confirmed'
  | 'completed'
  | 'cancelled'
  | 'missed'
  | 'expired';

export type OfferStatus =
  | 'active'
  | 'accepted'
  | 'rejected'
  | 'countered'
  | 'withdrawn'
  | 'expired'
  | 'superseded';

export type MilestoneStatus =
  | 'pending'
  | 'in_progress'
  | 'reported_complete'
  | 'verified_complete'
  | 'blocked'
  | 'skipped';

export interface DealParticipant {
  participantId: string;
  userId: string;
  role: ParticipantRole;
  isOwner: boolean;
  authorizationEvidenceId?: string;
  invitedByUserId?: string;
  displayName: string;
  joinedAtIso: string;
  isActive: boolean;
  canSubmitOffers: boolean;
  canAcceptOffers: boolean;
  canManageViewings: boolean;
  canUpdateMilestones: boolean;
}

export interface PropertyInquiryRecord {
  inquiryId: string;
  listingId: string;
  canonicalPropertyId?: string;
  initiatingUserId: string;
  targetOwnerUserId: string;
  transactionType: TransactionType;
  propertyCategory: TransactionCategory;
  message: string;
  preferredContactMethod: 'phone' | 'platform_message' | 'in_person';
  preferredViewingTimes?: string[];
  budgetMillionToman?: number;
  status: InquiryStatus;
  convertedDealId?: string;
  declineReason?: string;
  withdrawalReason?: string;
  createdAtIso: string;
  updatedAtIso: string;
  expiresAtIso: string;
}

export interface ViewingAppointmentRecord {
  appointmentId: string;
  dealId?: string;
  inquiryId?: string;
  listingId: string;
  requestingUserId: string;
  hostUserId: string;
  scheduledStartTimeIso: string;
  durationMinutes: number;
  timeZone: string;
  status: ViewingAppointmentStatus;
  disclosurePolicy: 'neighborhood_only' | 'street_level' | 'exact_address_confirmed';
  disclosedAddressText?: string;
  locationCentroid?: { lat: number; lng: number };
  cancellationReason?: string;
  reschedulingHistory: Array<{
    previousTimeIso: string;
    newTimeIso: string;
    proposedByUserId: string;
    timestampIso: string;
    reason?: string;
  }>;
  viewingOutcomeNotes?: string;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface PurchaseOfferTerms {
  purchasePriceMillionToman: number;
  currency: 'IRT';
  paymentConditionsSummary: string;
  earnestMoneyDepositMillionToman?: number;
  financingContingencyDays?: number;
  closingDaysLimit?: number;
  includedFixturesSummary?: string;
  additionalTerms?: string;
}

export interface RentalOfferTerms {
  depositMillionToman: number;
  monthlyRentMillionToman: number;
  currency: 'IRT';
  leaseDurationMonths: number;
  proposedStartDateIso: string;
  occupantCount?: number;
  petClause?: string;
  additionalRentalConditions?: string;
}

export interface DealOfferRecord {
  offerId: string;
  dealId: string;
  version: number;
  parentOfferId?: string;
  submittingUserId: string;
  submittingRole: ParticipantRole;
  transactionType: TransactionType;
  purchaseTerms?: PurchaseOfferTerms;
  rentalTerms?: RentalOfferTerms;
  nonFinancialConditions?: string;
  status: OfferStatus;
  rejectionReason?: string;
  withdrawalReason?: string;
  submittedAtIso: string;
  expiresAtIso: string;
  decidedAtIso?: string;
  decidedByUserId?: string;
}

export interface DealMilestoneRecord {
  milestoneId: string;
  dealId: string;
  milestoneKey: string;
  titleFa: string;
  descriptionFa: string;
  sequenceOrder: number;
  status: MilestoneStatus;
  responsibleRole: ParticipantRole;
  evidenceReferenceId?: string;
  reportedByUserId?: string;
  reportedAtIso?: string;
  verifiedByUserId?: string;
  verifiedAtIso?: string;
  notes?: string;
  isLegalDeterminationDisclaimer: true;
}

export interface DealWorkflowRecord {
  dealId: string;
  sourceInquiryId?: string;
  listingId: string;
  canonicalPropertyId?: string;
  transactionType: TransactionType;
  propertyCategory: TransactionCategory;
  initiatorUserId: string;
  lifecycleStatus: DealLifecycleStatus;
  activeOfferId?: string;
  acceptedOfferId?: string;
  participants: DealParticipant[];
  milestones: DealMilestoneRecord[];
  statusHistory: Array<{
    fromStatus: DealLifecycleStatus;
    toStatus: DealLifecycleStatus;
    actorUserId: string;
    timestampIso: string;
    reason?: string;
  }>;
  completionEvidenceSummary?: string;
  cancellationReason?: string;
  disputeReason?: string;
  revision: number;
  createdAtIso: string;
  updatedAtIso: string;
  closedAtIso?: string;
}

export interface DealDomainEvent {
  eventId: string;
  eventType:
    | 'inquiry.created'
    | 'inquiry.responded'
    | 'inquiry.withdrawn'
    | 'inquiry.converted'
    | 'viewing.requested'
    | 'viewing.confirmed'
    | 'viewing.rescheduled'
    | 'viewing.cancelled'
    | 'viewing.completed'
    | 'offer.submitted'
    | 'offer.countered'
    | 'offer.accepted'
    | 'offer.rejected'
    | 'offer.withdrawn'
    | 'offer.expired'
    | 'deal.status_changed'
    | 'deal.milestone_updated'
    | 'deal.completed'
    | 'deal.cancelled'
    | 'security.unauthorized_access_attempt'
    | 'security.suspicious_activity_reported';
  aggregateId: string;
  aggregateType: 'inquiry' | 'deal' | 'viewing' | 'offer';
  actorUserId: string;
  payload: Record<string, unknown>;
  timestampIso: string;
}
