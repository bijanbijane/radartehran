import { normalizePersianAddressText } from '../data/listingFraudAndAddressEngine'; import { computeGeodesicHaversineKm } from './cacheJobsGeospatialIngestionFlags'; import { normalizeDigitsToEnglish } from './security';
import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, getStoredAreaUnit, getStoredIntlCurrency, type AreaUnit, type IntlCurrencyCode } from './areaUnit';
export interface TabSessionSnapshot { tabId: string; authenticatedUid: string | null; role: 'USER' | 'ADMIN' | 'GUEST'; sessionEpoch: number; activeDraftListingId: string | null; activeDraftRevision: number; privateCachedFavorites: number[]; } export class CrossTabSessionAndDraftCoordinator { private readonly tabs = new Map<string, TabSessionSnapshot>(); private authoritativeUid: string | null = null; private authoritativeRole: 'USER' | 'ADMIN' | 'GUEST' = 'GUEST'; private sessionEpoch = 1; private readonly listingRevisions = new Map<string, { revision: number; updatedByTabId: string; title: string }>(); private pollingLeaderTabId: string | null = null;
  registerTab(tabId: string, uid: string | null, role: 'USER' | 'ADMIN' | 'GUEST' = 'USER'): TabSessionSnapshot { this.authoritativeUid = uid; this.authoritativeRole = uid ? role : 'GUEST'; const snap: TabSessionSnapshot = { tabId, authenticatedUid: uid, role: this.authoritativeRole, sessionEpoch: this.sessionEpoch, activeDraftListingId: null, activeDraftRevision: 0, privateCachedFavorites: uid ? [1, 2] : [], }; if (!this.tabs.has(tabId) && this.tabs.size >= 200) { const oldest = this.tabs.keys().next().value; if (oldest !== undefined) this.tabs.delete(oldest); } this.tabs.set(tabId, snap); if (!this.pollingLeaderTabId) this.pollingLeaderTabId = tabId; return { ...snap };
  } broadcastLogoutFromTab(initiatingTabId: string): { invalidatedTabIds: string[]; sessionEpoch: number } { this.sessionEpoch += 1; this.authoritativeUid = null; this.authoritativeRole = 'GUEST'; const invalidatedTabIds: string[] = []; for (const [tabId, snap] of this.tabs.entries()) { snap.authenticatedUid = null;
      snap.role = 'GUEST'; snap.sessionEpoch = this.sessionEpoch; snap.activeDraftListingId = null; snap.privateCachedFavorites = []; if (tabId !== initiatingTabId) invalidatedTabIds.push(tabId); }
    return { invalidatedTabIds, sessionEpoch: this.sessionEpoch }; }
  broadcastAccountSwitch(newUid: string, newRole: 'USER' | 'ADMIN'): void { this.sessionEpoch += 1; this.authoritativeUid = newUid; this.authoritativeRole = newRole; for (const snap of this.tabs.values()) { snap.authenticatedUid = newUid; snap.role = newRole; snap.sessionEpoch = this.sessionEpoch; snap.activeDraftListingId = null;
      snap.privateCachedFavorites = []; } }
  saveDraftFromTab(input: { tabId: string; listingId: string; expectedRevision: number;
    title: string; }): { saved: boolean; reason: string; newRevision: number } { const tab = this.tabs.get(input.tabId); if (!tab || !tab.authenticatedUid || tab.authenticatedUid !== this.authoritativeUid) {
      return { saved: false, reason: 'STALE_OR_LOGGED_OUT_TAB_SESSION', newRevision: input.expectedRevision }; }
    const current = this.listingRevisions.get(input.listingId) ?? { revision: 0, updatedByTabId: input.tabId, title: '' }; if (input.expectedRevision !== current.revision) { return {
        saved: false,
        reason: `CONFLICT_DETECTED_NEWER_TAB_REVISION:${current.revision}_BY_${current.updatedByTabId}`,
        newRevision: current.revision,
      };
    }
    const nextRevision = current.revision + 1;
    if (!this.listingRevisions.has(input.listingId) && this.listingRevisions.size >= 1000) { const oldest = this.listingRevisions.keys().next().value; if (oldest !== undefined) this.listingRevisions.delete(oldest); }
    this.listingRevisions.set(input.listingId, { revision: nextRevision, updatedByTabId: input.tabId, title: input.title });
    tab.activeDraftListingId = input.listingId;
    tab.activeDraftRevision = nextRevision;
    return { saved: true, reason: 'SAVED', newRevision: nextRevision };
  }
  isPollingLeader(tabId: string): boolean { return this.pollingLeaderTabId === tabId; }
  getTabSnapshot(tabId: string): TabSessionSnapshot | undefined {
    const t = this.tabs.get(tabId);
    return t ? { ...t, privateCachedFavorites: [...t.privateCachedFavorites] } : undefined;
  }
}
export type ListingLifecycleStatus = 'DRAFT' | 'PENDING_REVIEW' | 'PUBLISHED' | 'REJECTED' | 'SUSPENDED' | 'EXPIRED' | 'SOLD' | 'RENTED' | 'WITHDRAWN' | 'ARCHIVED';
export type ListingTransitionActor = 'OWNER' | 'MODERATOR' | 'SYSTEM_EXPIRY_JOB';
export interface ListingLifecycleRecord {
  listingId: string; ownerUid: string; status: ListingLifecycleStatus; sqm: number; priceMillion: number; hoodId: number;
  hasVerifiedContact: boolean; publishedAtMs: number | null; expiresAtMs: number | null;
  history: Array<{ from: ListingLifecycleStatus; to: ListingLifecycleStatus; actor: ListingTransitionActor; reason: string; atMs: number }>;
}
const ALLOWED_TRANSITIONS: Record<
  ListingLifecycleStatus,
  ReadonlyArray<{ to: ListingLifecycleStatus; actors: ReadonlyArray<ListingTransitionActor>; requiresReason?: boolean }>
> = {
  DRAFT: [{ to: 'PENDING_REVIEW', actors: ['OWNER'] }, { to: 'WITHDRAWN', actors: ['OWNER'] }],
  PENDING_REVIEW: [{ to: 'PUBLISHED', actors: ['MODERATOR'] }, { to: 'REJECTED', actors: ['MODERATOR'], requiresReason: true }, { to: 'WITHDRAWN', actors: ['OWNER'] }],
  PUBLISHED: [{ to: 'SOLD', actors: ['OWNER'] }, { to: 'RENTED', actors: ['OWNER'] }, { to: 'WITHDRAWN', actors: ['OWNER'] }, { to: 'SUSPENDED', actors: ['MODERATOR'], requiresReason: true }, { to: 'EXPIRED', actors: ['SYSTEM_EXPIRY_JOB'] }],
  REJECTED: [{ to: 'DRAFT', actors: ['OWNER'] }, { to: 'ARCHIVED', actors: ['OWNER', 'MODERATOR'] }],
  SUSPENDED: [{ to: 'PENDING_REVIEW', actors: ['MODERATOR'], requiresReason: true }, { to: 'ARCHIVED', actors: ['MODERATOR'], requiresReason: true }],
  EXPIRED: [{ to: 'PENDING_REVIEW', actors: ['OWNER'] }, { to: 'ARCHIVED', actors: ['OWNER', 'SYSTEM_EXPIRY_JOB'] }],
  SOLD: [{ to: 'ARCHIVED', actors: ['OWNER', 'MODERATOR'] }],
  RENTED: [{ to: 'ARCHIVED', actors: ['OWNER', 'MODERATOR'] }],
  WITHDRAWN: [{ to: 'DRAFT', actors: ['OWNER'] }, { to: 'ARCHIVED', actors: ['OWNER'] }],
  ARCHIVED: [],
};
export function executeListingStateTransition(input: {
  record: ListingLifecycleRecord; targetStatus: ListingLifecycleStatus; actorRole: ListingTransitionActor; actorUid: string; reason?: string; nowMs: number;
}): {
  transitioned: boolean; rejectionCode: string | null; updatedRecord: ListingLifecycleRecord; isVisibleInPublicSearch: boolean; isIncludedInMarketStats: boolean;
} {
  const { record, targetStatus, actorRole, actorUid, nowMs } = input;
  const currentVis = record.status === 'PUBLISHED';
  const currentStats = currentVis || record.status === 'SOLD' || record.status === 'RENTED';
  if (actorRole === 'OWNER' && actorUid !== record.ownerUid) {
    return { transitioned: false, rejectionCode: 'FORBIDDEN_NOT_LISTING_OWNER', updatedRecord: record, isVisibleInPublicSearch: currentVis, isIncludedInMarketStats: currentStats };
  }
  const rules = ALLOWED_TRANSITIONS[record.status] ?? [];
  const matchingRule = rules.find((r) => r.to === targetStatus);
  if (!matchingRule) {
    return { transitioned: false, rejectionCode: `INVALID_STATE_TRANSITION:${record.status}_TO_${targetStatus}`, updatedRecord: record, isVisibleInPublicSearch: currentVis, isIncludedInMarketStats: currentVis };
  }
  if (!matchingRule.actors.includes(actorRole)) {
    return { transitioned: false, rejectionCode: `UNAUTHORIZED_ROLE_FOR_TRANSITION:${actorRole}_CANNOT_${record.status}_TO_${targetStatus}`, updatedRecord: record, isVisibleInPublicSearch: currentVis, isIncludedInMarketStats: currentVis };
  }
  if (matchingRule.requiresReason && (!input.reason || input.reason.trim().length < 4)) {
    return { transitioned: false, rejectionCode: 'TRANSITION_REASON_REQUIRED', updatedRecord: record, isVisibleInPublicSearch: currentVis, isIncludedInMarketStats: currentVis };
  }
  if ((targetStatus === 'PENDING_REVIEW' || targetStatus === 'PUBLISHED') && (record.sqm < 25 || record.priceMillion <= 0 || record.hoodId <= 0 || !record.hasVerifiedContact)) {
    return { transitioned: false, rejectionCode: 'PUBLICATION_PREREQUISITES_INCOMPLETE', updatedRecord: record, isVisibleInPublicSearch: false, isIncludedInMarketStats: false };
  }
  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
  const updatedRecord: ListingLifecycleRecord = {
    ...record,
    status: targetStatus,
    publishedAtMs: targetStatus === 'PUBLISHED' ? nowMs : record.publishedAtMs,
    expiresAtMs: targetStatus === 'PUBLISHED' ? nowMs + THIRTY_DAYS_MS : record.expiresAtMs,
    history: [...record.history.slice(-199), { from: record.status, to: targetStatus, actor: actorRole, reason: input.reason ?? 'STANDARD_TRANSITION', atMs: nowMs }],
  };
  const isVisibleInPublicSearch = updatedRecord.status === 'PUBLISHED' && Boolean(updatedRecord.expiresAtMs && updatedRecord.expiresAtMs > nowMs);
  const isIncludedInMarketStats = isVisibleInPublicSearch || updatedRecord.status === 'SOLD' || updatedRecord.status === 'RENTED';
  return { transitioned: true, rejectionCode: null, updatedRecord, isVisibleInPublicSearch, isIncludedInMarketStats };
}
export interface PropertyResolutionCandidateInput {
  listingId: string; submitterUid: string; contactPhone: string; hoodId: number; rawAddressFa: string; postalCode10?: string;
  lat: number; lng: number; sqm: number; rooms: number; floorNumber: number; unitNumber?: number; buildingAge: number; priceMillion: number;
}
export type DuplicateResolutionClassification = 'EXACT_DUPLICATE_ADVERTISEMENT' | 'CROSS_AGENT_SAME_PROPERTY_CANDIDATE' | 'DISTINCT_UNIT_IN_SAME_BUILDING' | 'UNRELATED_PROPERTY';
export interface DuplicateResolutionResult {
  classification: DuplicateResolutionClassification; similarityScore: number; requiresHumanReview: boolean; autoMergedDestructively: false;
  evidenceFactors: string[]; displayAreaUnitLabel?: string; candidateAPriceIntlText?: string;
}
export function evaluatePropertyDuplicateAndEntityResolution(
  candidateA: PropertyResolutionCandidateInput,
  candidateB: PropertyResolutionCandidateInput,
  areaUnit: AreaUnit = getStoredAreaUnit(),
  intlCurrency: IntlCurrencyCode = getStoredIntlCurrency(),
): DuplicateResolutionResult {
  const displayAreaUnitLabel = formatAreaUnitLabel(areaUnit);
  const candidateAPriceIntlText = formatMillionTomanAsIntlCurrency(candidateA.priceMillion, intlCurrency);
  const evidenceFactors: string[] = [];
  if (candidateA.hoodId !== candidateB.hoodId) {
    return { classification: 'UNRELATED_PROPERTY', similarityScore: 0, requiresHumanReview: false, autoMergedDestructively: false, evidenceFactors: ['DIFFERENT_NEIGHBORHOOD'], displayAreaUnitLabel, candidateAPriceIntlText };
  }
  const distKm = computeGeodesicHaversineKm(candidateA.lat, candidateA.lng, candidateB.lat, candidateB.lng);
  const sameBuildingAddress = normalizePersianAddressText(candidateA.rawAddressFa) === normalizePersianAddressText(candidateB.rawAddressFa) || distKm <= 0.045;
  if (!sameBuildingAddress) {
    return { classification: 'UNRELATED_PROPERTY', similarityScore: 0.15, requiresHumanReview: false, autoMergedDestructively: false, evidenceFactors: ['DISTANCE_OR_ADDRESS_DISTINCT'], displayAreaUnitLabel, candidateAPriceIntlText };
  }
  evidenceFactors.push('SAME_BUILDING_OR_COORDINATE_FOOTPRINT');
  const differentFloor = candidateA.floorNumber !== candidateB.floorNumber;
  const differentExplicitUnit = candidateA.unitNumber !== undefined && candidateB.unitNumber !== undefined && candidateA.unitNumber !== candidateB.unitNumber;
  const significantSqmDiff = Math.abs(candidateA.sqm - candidateB.sqm) > 3;
  if (differentFloor || differentExplicitUnit || significantSqmDiff) {
    if (differentFloor) evidenceFactors.push('DIFFERENT_FLOOR_NUMBER');
    if (differentExplicitUnit) evidenceFactors.push('DIFFERENT_UNIT_NUMBER');
    if (significantSqmDiff) evidenceFactors.push('DIFFERENT_APARTMENT_AREA');
    return { classification: 'DISTINCT_UNIT_IN_SAME_BUILDING', similarityScore: 0.45, requiresHumanReview: false, autoMergedDestructively: false, evidenceFactors, displayAreaUnitLabel, candidateAPriceIntlText };
  }
  evidenceFactors.push('MATCHING_FLOOR_SQM_AND_ROOMS');
  const samePhone = normalizeDigitsToEnglish(candidateA.contactPhone) === normalizeDigitsToEnglish(candidateB.contactPhone);
  if (samePhone && candidateA.submitterUid === candidateB.submitterUid) {
    evidenceFactors.push('SAME_SUBMITTER_AND_PHONE');
    return { classification: 'EXACT_DUPLICATE_ADVERTISEMENT', similarityScore: 0.98, requiresHumanReview: true, autoMergedDestructively: false, evidenceFactors, displayAreaUnitLabel, candidateAPriceIntlText };
  }
  evidenceFactors.push('CROSS_ACCOUNT_OR_PRICE_VARIATION_ON_IDENTICAL_UNIT');
  return { classification: 'CROSS_AGENT_SAME_PROPERTY_CANDIDATE', similarityScore: 0.89, requiresHumanReview: true, autoMergedDestructively: false, evidenceFactors, displayAreaUnitLabel, candidateAPriceIntlText };
}
export interface BulkModerationTargetItem {
  listingId: string;
  ownerUid: string;
  currentStatus: ListingLifecycleStatus;
}
export interface BulkModerationExecutionInput {
  operationId: string;
  idempotencyKey: string;
  actorUid: string;
  actorRole: 'USER' | 'MODERATOR' | 'SUPER_ADMIN';
  targetStatus: 'SUSPENDED' | 'ARCHIVED';
  reason: string;
  dryRun: boolean;
  confirmedByOperator: boolean;
  items: BulkModerationTargetItem[];
}
export interface BulkModerationExecutionReport {
  operationId: string;
  dryRun: boolean;
  rejectedEntireBatchReason: string | null;
  succeededIds: string[];
  skippedInvalidStateIds: string[];
  skippedUnauthorizedIds: string[];
  rollbackSnapshot: Array<{ listingId: string; previousStatus: ListingLifecycleStatus }>;
  reproducibleTargetSetHash: string;
}
export class SafeBulkOperationCoordinator {
  private readonly executedIdempotencyKeys = new Map<string, BulkModerationExecutionReport>();
  static readonly MAX_BATCH_SIZE = 100;
  executeBulkStatusChange(input: BulkModerationExecutionInput): BulkModerationExecutionReport {
    const cached = this.executedIdempotencyKeys.get(input.idempotencyKey);
    if (cached && !input.dryRun) return cached;
    const sortedIds = input.items.map((i) => i.listingId).sort().join(',');
    const reproducibleTargetSetHash = `batch-${input.targetStatus}:${sortedIds}`;
    if (input.items.length === 0 || input.items.length > SafeBulkOperationCoordinator.MAX_BATCH_SIZE) {
      return { operationId: input.operationId, dryRun: input.dryRun, rejectedEntireBatchReason: `BATCH_SIZE_OUT_OF_BOUNDS:${input.items.length}`, succeededIds: [], skippedInvalidStateIds: [], skippedUnauthorizedIds: [], rollbackSnapshot: [], reproducibleTargetSetHash };
    }
    if (!input.dryRun && !input.confirmedByOperator) {
      return { operationId: input.operationId, dryRun: false, rejectedEntireBatchReason: 'DESTRUCTIVE_BATCH_CONFIRMATION_REQUIRED', succeededIds: [], skippedInvalidStateIds: [], skippedUnauthorizedIds: [], rollbackSnapshot: [], reproducibleTargetSetHash };
    }
    const succeededIds: string[] = [];
    const skippedInvalidStateIds: string[] = [];
    const skippedUnauthorizedIds: string[] = [];
    const rollbackSnapshot: Array<{ listingId: string; previousStatus: ListingLifecycleStatus }> = [];
    for (const item of input.items) {
      const canAct = input.actorRole === 'MODERATOR' || input.actorRole === 'SUPER_ADMIN' || (input.actorRole === 'USER' && item.ownerUid === input.actorUid && input.targetStatus === 'ARCHIVED');
      if (!canAct) { skippedUnauthorizedIds.push(item.listingId); continue; }
      const validSourceState = input.targetStatus === 'SUSPENDED' ? item.currentStatus === 'PUBLISHED' : item.currentStatus === 'EXPIRED' || item.currentStatus === 'REJECTED' || item.currentStatus === 'WITHDRAWN';
      if (!validSourceState) { skippedInvalidStateIds.push(item.listingId); continue; }
      succeededIds.push(item.listingId);
      rollbackSnapshot.push({ listingId: item.listingId, previousStatus: item.currentStatus });
    }
    const report: BulkModerationExecutionReport = {
      operationId: input.operationId,
      dryRun: input.dryRun,
      rejectedEntireBatchReason: null,
      succeededIds,
      skippedInvalidStateIds,
      skippedUnauthorizedIds,
      rollbackSnapshot,
      reproducibleTargetSetHash,
    };
    if (!input.dryRun) {
      if (this.executedIdempotencyKeys.size >= 1000) { const oldest = this.executedIdempotencyKeys.keys().next().value; if (oldest !== undefined) this.executedIdempotencyKeys.delete(oldest); }
      this.executedIdempotencyKeys.set(input.idempotencyKey, report);
    }
    return report;
  }
}
export class SequencedAsyncRequestController<TValue> {
  private latestSeqId = 0;
  private committedSeqId = 0;
  private committedValue: TValue;
  private optimisticBackup: TValue | null = null;
  private inFlightMutationKeys = new Set<string>();
  constructor(initialValue: TValue) {
    this.committedValue = initialValue;
  }
  issueNextRequestTicket(): number {
    this.latestSeqId += 1;
    return this.latestSeqId;
  }
  commitResponseIfLatest(ticketSeqId: number, responseValue: TValue): {
    applied: boolean;
    reason: 'APPLIED_LATEST' | 'IGNORED_STALE_OUT_OF_ORDER_RESPONSE';
    stateValue: TValue;
  } {
    if (ticketSeqId < this.latestSeqId || ticketSeqId < this.committedSeqId) {
      return { applied: false, reason: 'IGNORED_STALE_OUT_OF_ORDER_RESPONSE', stateValue: this.committedValue };
    }
    this.committedSeqId = ticketSeqId;
    this.committedValue = responseValue;
    return { applied: true, reason: 'APPLIED_LATEST', stateValue: this.committedValue };
  }
  beginOptimisticMutation(mutationKey: string, optimisticNextValue: TValue): boolean {
    if (this.inFlightMutationKeys.has(mutationKey)) return false;
    this.inFlightMutationKeys.add(mutationKey);
    this.optimisticBackup = this.committedValue;
    this.committedValue = optimisticNextValue;
    return true;
  }
  finalizeOptimisticMutation(mutationKey: string, serverSucceeded: boolean, authoritativeValue?: TValue): TValue {
    this.inFlightMutationKeys.delete(mutationKey);
    if (!serverSucceeded) {
      if (this.optimisticBackup !== null) this.committedValue = this.optimisticBackup; } else if (authoritativeValue !== undefined) { this.committedValue = authoritativeValue; } this.optimisticBackup = null; return this.committedValue; } getState(): TValue { return this.committedValue; } }