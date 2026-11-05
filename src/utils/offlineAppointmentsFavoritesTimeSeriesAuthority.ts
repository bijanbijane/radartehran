import { sanitizeInput } from './security';
import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, getStoredAreaUnit, getStoredIntlCurrency, type AreaUnit, type IntlCurrencyCode } from './areaUnit';
export type OfflineMutationPersistenceState = 'LOCALLY_QUEUED_PENDING_SYNC' | 'SERVER_CONFIRMED_PERSISTED' | 'CONFLICT_REJECTED_REQUIRES_USER_RESOLUTION' | 'DISCARDED_ON_ACCOUNT_CHANGE_OR_DELETED_TARGET';
export interface QueuedOfflineMutation { mutationId: string; idempotencyKey: string; actorUid: string; targetRecordId: string; baseServerRevision: number; patchPayload: Record<string, unknown>; queuedAtMs: number; }
export class OfflineMutationQueueAndConflictResolver { private readonly queue: QueuedOfflineMutation[] = []; private readonly processedIdempotencyKeys = new Set<string>(); static readonly MAX_OFFLINE_QUEUE_LENGTH = 50; enqueueOfflineMutation(item: QueuedOfflineMutation): { enqueued: boolean; uiPersistenceBadge: OfflineMutationPersistenceState; rejectionReason: string | null; } { if (this.queue.length >= OfflineMutationQueueAndConflictResolver.MAX_OFFLINE_QUEUE_LENGTH) { return { enqueued: false, uiPersistenceBadge: 'CONFLICT_REJECTED_REQUIRES_USER_RESOLUTION', rejectionReason: 'OFFLINE_QUEUE_QUOTA_EXCEEDED', }; } const alreadyQueued = this.queue.some((q) => q.idempotencyKey === item.idempotencyKey); if (!alreadyQueued) { this.queue.push({ ...item }); }
    return { enqueued: true, uiPersistenceBadge: 'LOCALLY_QUEUED_PENDING_SYNC', rejectionReason: null, }; } purgeQueueOnAccountSwitchOrLogout(previousUid: string): number { const before = this.queue.length; for (let i = this.queue.length - 1; i >= 0; i -= 1) { if (this.queue[i].actorUid === previousUid) { this.queue.splice(i, 1); } }
    return before - this.queue.length; } replayQueuedMutationAgainstServer(input: { mutationId: string; activeAuthenticatedUid: string | null; currentServerRevision: number | null; // null if record was deleted on server
    targetRecordRestricted: boolean; }): { synced: boolean; finalState: OfflineMutationPersistenceState; reason: string; } { const idx = this.queue.findIndex((q) => q.mutationId === input.mutationId); if (idx === -1) { return { synced: false, finalState: 'DISCARDED_ON_ACCOUNT_CHANGE_OR_DELETED_TARGET', reason: 'MUTATION_NOT_FOUND_IN_QUEUE', }; }
    const item = this.queue[idx]; if (!input.activeAuthenticatedUid || item.actorUid !== input.activeAuthenticatedUid) { this.queue.splice(idx, 1); return { synced: false, finalState: 'DISCARDED_ON_ACCOUNT_CHANGE_OR_DELETED_TARGET', reason: 'ACCOUNT_MISMATCH_ABORTED_SYNC', }; }
    if (this.processedIdempotencyKeys.has(item.idempotencyKey)) { this.queue.splice(idx, 1); return { synced: true, finalState: 'SERVER_CONFIRMED_PERSISTED', reason: 'IDEMPOTENT_ALREADY_APPLIED', }; }
    if (input.currentServerRevision === null || input.targetRecordRestricted) { this.queue.splice(idx, 1); return { synced: false, finalState: 'DISCARDED_ON_ACCOUNT_CHANGE_OR_DELETED_TARGET', reason: 'TARGET_DELETED_OR_RESTRICTED_ON_SERVER' }; }
    if (item.baseServerRevision !== input.currentServerRevision) { this.queue.splice(idx, 1); return { synced: false,
        finalState: 'CONFLICT_REJECTED_REQUIRES_USER_RESOLUTION',
        reason: `CONFLICT_STALE_OFFLINE_BASE_REVISION:${item.baseServerRevision}_VS_SERVER_${input.currentServerRevision}`,
      }; }
    if (this.processedIdempotencyKeys.size >= 2000) {
      const oldestKey = this.processedIdempotencyKeys.values().next().value;
      if (oldestKey !== undefined) this.processedIdempotencyKeys.delete(oldestKey);
    }
    this.processedIdempotencyKeys.add(item.idempotencyKey); this.queue.splice(idx, 1);
    return { synced: true, finalState: 'SERVER_CONFIRMED_PERSISTED', reason: 'SYNCED_OK' };
  }
}
export function auditPropertyViewingAppointmentCapability(): { appointmentSubsystemImplemented: false; policyNote: string; } {
  return {
    appointmentSubsystemImplemented: false,
    policyNote: 'Tehran Radar uses direct buyer alerts and inquiry messages rather than a standalone calendar slot-booking engine. Do not add an unrequested calendar UI.',
  };
}
export class ViewingSlotConcurrencyGuard {
  private readonly reservedSlots = new Map<string, { requestId: string; buyerUid: string; status: 'PENDING_AGENT_APPROVAL' | 'CONFIRMED' }>();
  requestViewingSlot(input: {
    requestId: string; listingId: string; listingStatus: 'PUBLISHED' | 'EXPIRED' | 'SOLD' | 'SUSPENDED'; buyerUid: string; slotStartMs: number; nowMs: number;
  }): {
    accepted: boolean; autoConfirmed: false; status: 'PENDING_AGENT_APPROVAL' | 'REJECTED'; rejectionReason: string | null;
  } {
    if (input.listingStatus !== 'PUBLISHED') {
      return { accepted: false, autoConfirmed: false, status: 'REJECTED', rejectionReason: `LISTING_NOT_AVAILABLE_FOR_VIEWING:${input.listingStatus}` };
    }
    if (input.slotStartMs <= input.nowMs) {
      return { accepted: false, autoConfirmed: false, status: 'REJECTED', rejectionReason: 'APPOINTMENT_IN_PAST_FORBIDDEN' };
    }
    const slotKey = `${input.listingId}:${input.slotStartMs}`;
    if (this.reservedSlots.has(slotKey)) {
      return { accepted: false, autoConfirmed: false, status: 'REJECTED', rejectionReason: 'DOUBLE_BOOKING_SLOT_ALREADY_RESERVED' };
    }
    if (this.reservedSlots.size >= 2000) {
      const oldestKey = this.reservedSlots.keys().next().value;
      if (oldestKey !== undefined) this.reservedSlots.delete(oldestKey);
    }
    this.reservedSlots.set(slotKey, { requestId: input.requestId, buyerUid: input.buyerUid, status: 'PENDING_AGENT_APPROVAL' });
    return { accepted: true, autoConfirmed: false, status: 'PENDING_AGENT_APPROVAL', rejectionReason: null };
  }
}
export interface SavedSearchCriteriaRecord {
  savedSearchId: string; ownerUid: string; city: string; mode: 'buy' | 'rent'; hoodId: number; maxPricePerSqmMillion: number; alertsEnabled: boolean;
}
export class FavoritesAndSavedSearchAlertManager {
  private readonly userFavorites = new Map<string, Set<number>>();
  private readonly savedSearches = new Map<string, SavedSearchCriteriaRecord>();
  private readonly dispatchedAlertKeys = new Set<string>();
  addFavoriteNeighborhood(uid: string, hoodId: number, validHoodIds: ReadonlySet<number>): { added: boolean; totalFavorites: number } {
    if (!validHoodIds.has(hoodId)) {
      return { added: false, totalFavorites: this.userFavorites.get(uid)?.size ?? 0 };
    }
    let set = this.userFavorites.get(uid);
    if (!set) {
      if (this.userFavorites.size >= 2000) {
        const oldestUid = this.userFavorites.keys().next().value;
        if (oldestUid !== undefined) this.userFavorites.delete(oldestUid);
      }
      set = new Set<number>();
      this.userFavorites.set(uid, set);
    }
    if (!set.has(hoodId) && set.size >= 200) {
      const oldestHood = set.values().next().value;
      if (oldestHood !== undefined) set.delete(oldestHood);
    }
    set.add(hoodId);
    return { added: true, totalFavorites: set.size };
  }
  removeFavoriteNeighborhood(uid: string, hoodId: number): { removedRelationshipOnly: boolean; underlyingHoodDeleted: false } {
    const set = this.userFavorites.get(uid);
    const removedRelationshipOnly = Boolean(set && set.delete(hoodId));
    return { removedRelationshipOnly, underlyingHoodDeleted: false };
  }
  saveSearchCriteria(record: SavedSearchCriteriaRecord): void {
    if (!this.savedSearches.has(record.savedSearchId) && this.savedSearches.size >= 2000) {
      const oldestId = this.savedSearches.keys().next().value;
      if (oldestId !== undefined) this.savedSearches.delete(oldestId);
    }
    this.savedSearches.set(record.savedSearchId, { ...record });
  }
  evaluateListingAgainstSavedSearches(listing: {
    listingId: string; city: string; mode: 'buy' | 'rent'; hoodId: number; pricePerSqmMillion: number; status: 'PUBLISHED' | 'DRAFT' | 'SUSPENDED';
  }): { triggeredSearchIds: string[]; deduplicatedSkipCount: number } {
    if (listing.status !== 'PUBLISHED') {
      return { triggeredSearchIds: [], deduplicatedSkipCount: 0 };
    }
    const triggeredSearchIds: string[] = [];
    let deduplicatedSkipCount = 0;
    for (const search of this.savedSearches.values()) {
      if (!search.alertsEnabled) continue;
      if (search.city === listing.city && search.mode === listing.mode && search.hoodId === listing.hoodId && listing.pricePerSqmMillion <= search.maxPricePerSqmMillion) {
        const dedupeKey = `${search.savedSearchId}:${listing.listingId}:${listing.pricePerSqmMillion}`;
        if (this.dispatchedAlertKeys.has(dedupeKey)) {
          deduplicatedSkipCount += 1;
          continue;
        }
        if (this.dispatchedAlertKeys.size >= 5000) {
          const oldestKey = this.dispatchedAlertKeys.values().next().value;
          if (oldestKey !== undefined) this.dispatchedAlertKeys.delete(oldestKey);
        }
        this.dispatchedAlertKeys.add(dedupeKey);
        triggeredSearchIds.push(search.savedSearchId);
      }
    }
    return { triggeredSearchIds, deduplicatedSkipCount };
  }
}
export type MarketPriceSeriesProvenance = 'ESTIMATED_SEASONAL_INDEX_ANCHORED_TO_BASELINE' | 'VERIFIED_ADMIN_MARKET_OBSERVATION';
export interface HistoricalPricePointRecord {
  hoodId: number; periodJalaliMonth: string; publishedBuyPerSqmMillion: number; currentBuyPerSqmMillion: number;
  provenance: MarketPriceSeriesProvenance; displayAreaUnitLabel?: string; publishedBuyPerSqmIntlText?: string;
  revisionHistory: Array<{ previousValue: number; newValue: number; reason: string; revisedAtIso: string }>;
}
export class MarketTimeSeriesRevisionGovernor {
  private readonly points = new Map<string, HistoricalPricePointRecord>();
  recordInitialPeriodObservation(
    input: { hoodId: number; periodJalaliMonth: string; buyPerSqmMillion: number; provenance: MarketPriceSeriesProvenance },
    areaUnit: AreaUnit = getStoredAreaUnit(),
    intlCurrency: IntlCurrencyCode = getStoredIntlCurrency(),
  ): HistoricalPricePointRecord {
    if (!Number.isFinite(input.buyPerSqmMillion) || input.buyPerSqmMillion <= 0) {
      throw new Error('INVALID_ZERO_OR_NEGATIVE_HISTORICAL_PRICE');
    }
    const key = `${input.hoodId}:${input.periodJalaliMonth}`;
    if (this.points.has(key)) {
      throw new Error('HISTORICAL_PERIOD_ALREADY_EXISTS_USE_REVISION_WORKFLOW');
    }
    if (this.points.size >= 2000) {
      const oldestKey = this.points.keys().next().value;
      if (oldestKey !== undefined) this.points.delete(oldestKey);
    }
    const rec: HistoricalPricePointRecord = {
      hoodId: input.hoodId, periodJalaliMonth: input.periodJalaliMonth,
      publishedBuyPerSqmMillion: input.buyPerSqmMillion, currentBuyPerSqmMillion: input.buyPerSqmMillion,
      provenance: input.provenance, displayAreaUnitLabel: formatAreaUnitLabel(areaUnit),
      publishedBuyPerSqmIntlText: formatMillionTomanAsIntlCurrency(input.buyPerSqmMillion, intlCurrency), revisionHistory: [],
    };
    this.points.set(key, rec);
    return { ...rec, revisionHistory: [] };
  }
  applyAuditedHistoricalRevision(input: {
    hoodId: number; periodJalaliMonth: string; correctedBuyPerSqmMillion: number; reason: string; revisedAtIso: string;
  }): {
    updatedRecord: HistoricalPricePointRecord; originallyPublishedValuePreserved: boolean; downstreamCacheInvalidationRequired: true;
  } {
    const key = `${input.hoodId}:${input.periodJalaliMonth}`;
    const existing = this.points.get(key);
    if (!existing) throw new Error('HISTORICAL_PERIOD_NOT_FOUND');
    if (!input.reason || input.reason.trim().length < 5) throw new Error('REVISION_REASON_REQUIRED');
    if (existing.revisionHistory.length >= 200) existing.revisionHistory.shift();
    existing.revisionHistory.push({
      previousValue: existing.currentBuyPerSqmMillion,
      newValue: input.correctedBuyPerSqmMillion,
      reason: sanitizeInput(input.reason, 200),
      revisedAtIso: input.revisedAtIso,
    });
    existing.currentBuyPerSqmMillion = input.correctedBuyPerSqmMillion;
    return {
      updatedRecord: { ...existing, revisionHistory: [...existing.revisionHistory] },
      originallyPublishedValuePreserved: existing.publishedBuyPerSqmMillion !== existing.currentBuyPerSqmMillion,
      downstreamCacheInvalidationRequired: true,
    };
  }
}
export type AdvertiserClaimedCapacity = 'CLAIMED_PROPERTY_OWNER' | 'REAL_ESTATE_AGENT_REPRESENTATIVE';
export type RepresentationVerificationState =
  | 'UNVERIFIED_SELF_DECLARATION'
  | 'EVIDENCE_PENDING_HUMAN_REVIEW'
  | 'HUMAN_REVIEWED_REPRESENTATION_AUTHORITY'
  | 'AUTHORIZATION_EXPIRED_OR_REVOKED';
export interface AdvertiserAuthorityEvaluationInput {
  submitterUid: string;
  submitterPhoneVerified: boolean;
  submitterAccountSuspended: boolean;
  claimedCapacity: AdvertiserClaimedCapacity;
  serverStoredVerificationState: RepresentationVerificationState;
  clientSubmittedIsOwnerVerifiedSpoof?: boolean;
  representationExpiresAtMs?: number;
  evidenceModifiedAfterApproval: boolean;
  nowMs: number;
}
export interface AdvertiserAuthorityEvaluationResult {
  canPublishOrMaintainListing: boolean;
  effectiveVerificationState: RepresentationVerificationState;
  provesLegalPropertyOwnership: false;
  publicBadgeLabelFa: string;
  rejectionReason: string | null;
}
export function evaluateAdvertiserAuthorityAndListingEligibility(
  input: AdvertiserAuthorityEvaluationInput,
): AdvertiserAuthorityEvaluationResult {
  if (input.submitterAccountSuspended || !input.submitterPhoneVerified) {
    return {
      canPublishOrMaintainListing: false,
      effectiveVerificationState: 'AUTHORIZATION_EXPIRED_OR_REVOKED',
      provesLegalPropertyOwnership: false,
      publicBadgeLabelFa: 'غیرفعال / نیازمند احراز شماره تماس',
      rejectionReason: 'SUBMITTER_SUSPENDED_OR_UNVERIFIED_PHONE',
    };
  }
  let effectiveState = input.serverStoredVerificationState;
  if (
    input.claimedCapacity === 'REAL_ESTATE_AGENT_REPRESENTATIVE' &&
    typeof input.representationExpiresAtMs === 'number' &&
    input.representationExpiresAtMs <= input.nowMs
  ) {
    effectiveState = 'AUTHORIZATION_EXPIRED_OR_REVOKED';
  } else if (effectiveState === 'HUMAN_REVIEWED_REPRESENTATION_AUTHORITY' && input.evidenceModifiedAfterApproval) {
    effectiveState = 'EVIDENCE_PENDING_HUMAN_REVIEW';
  }
  if (effectiveState === 'AUTHORIZATION_EXPIRED_OR_REVOKED') {
    return {
      canPublishOrMaintainListing: false,
      effectiveVerificationState: effectiveState,
      provesLegalPropertyOwnership: false,
      publicBadgeLabelFa: 'مجوز نمایندگی منقضی یا لغو شده',
      rejectionReason: 'REPRESENTATION_AUTHORITY_EXPIRED_OR_REVOKED',
    }; } const publicBadgeLabelFa =
    effectiveState === 'HUMAN_REVIEWED_REPRESENTATION_AUTHORITY'
      ? 'مدارک معرفی ملک توسط کارشناس بررسی شد (معادل سند رسمی مالکیت نیست)'
      : 'تلفن آگهی‌دهنده تأیید شده (ادعای مالکیت/نمایندگی بررسی نشده است)'; return { canPublishOrMaintainListing: true, effectiveVerificationState: effectiveState, provesLegalPropertyOwnership: false, publicBadgeLabelFa, rejectionReason: null, }; }