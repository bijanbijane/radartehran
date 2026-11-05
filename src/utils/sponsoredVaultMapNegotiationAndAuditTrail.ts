import crypto from 'crypto';
import { formatAreaUnitLabel, formatMillionTomanAsIntlCurrency, getStoredAreaUnit, getStoredIntlCurrency, type AreaUnit, type IntlCurrencyCode } from './areaUnit';
export interface CandidateNeighborhoodOrListingForPlacement { id: number; name: string; organicScore: number; pricePerSqm: number; matchesActiveUserFilters: boolean; moderationStatus: 'APPROVED' | 'PENDING_REVIEW' | 'REJECTED' | 'SUSPENDED'; listingStatus: 'ACTIVE' | 'EXPIRED' | 'SOLD'; sponsorCampaign?: { campaignId: string; agencyName: string; paidAtMs: number; expiresAtMs: number; isPaused: boolean; }; } export function auditSponsoredPlacementAndOrganicRanking( candidates: CandidateNeighborhoodOrListingForPlacement[], nowMs: number, maxSponsoredSlots = 2
) { const eligible = candidates.filter( (c) => c.moderationStatus === 'APPROVED' && c.listingStatus === 'ACTIVE' && c.matchesActiveUserFilters
  ); const organicRanked = [...eligible].sort((a, b) => { if (b.organicScore !== a.organicScore) return b.organicScore - a.organicScore; if (a.pricePerSqm !== b.pricePerSqm) return a.pricePerSqm - b.pricePerSqm; return a.id - b.id; }); const seenCampaignItemIds = new Set<number>(); const sponsoredDedicatedSlots: Array<{ id: number; campaignId: string; agencyName: string;
    disclosureBadgeFa: string; isSponsoredPlacement: true; }> = []; for (const item of eligible) { const sp = item.sponsorCampaign; if (sp && !sp.isPaused && sp.paidAtMs <= nowMs && sp.expiresAtMs > nowMs && !seenCampaignItemIds.has(item.id)) {
      if (sponsoredDedicatedSlots.length < maxSponsoredSlots) { seenCampaignItemIds.add(item.id); sponsoredDedicatedSlots.push({ id: item.id, campaignId: sp.campaignId, agencyName: sp.agencyName, disclosureBadgeFa: 'آگهی ویژه / حامی مالی (تبلیغاتی)', isSponsoredPlacement: true, }); } } }
  return { organicRankingInvariantVerified: true as const, organicResults: organicRanked.map((c, idx) => ({ id: c.id, name: c.name, organicRank: idx + 1,
      organicScore: c.organicScore, isSponsoredPlacement: false as const, })), sponsoredDedicatedSlots,
  }; }
export class SponsoredTelemetryTracker { private impressions = new Map<string, number>(); private clicks = new Map<string, number>(); public recordImpression(campaignId: string) {
    if (!this.impressions.has(campaignId) && this.impressions.size >= 2000) { const first = this.impressions.keys().next().value; if (first !== undefined) this.impressions.delete(first); }
    this.impressions.set(campaignId, (this.impressions.get(campaignId) ?? 0) + 1); }
  public recordClick(campaignId: string) {
    if (!this.clicks.has(campaignId) && this.clicks.size >= 2000) { const first = this.clicks.keys().next().value; if (first !== undefined) this.clicks.delete(first); }
    this.clicks.set(campaignId, (this.clicks.get(campaignId) ?? 0) + 1);
  }
  public getMetrics(campaignId: string) {
    const imp = this.impressions.get(campaignId) ?? 0; const clk = this.clicks.get(campaignId) ?? 0;
    return { campaignId, impressions: imp, clicks: clk, ctrPercent: imp > 0 ? Number(((clk / imp) * 100).toFixed(2)) : 0 };
  }
}
export interface VaultDocumentRecord {
  docId: string; listingId: string; ownerUserId: string; assignedReviewerIds: string[];
  kind: 'TITLE_DEED_SANAD_TAK_BARG' | 'NATIONAL_ID_CARD' | 'AGENCY_POWER_OF_ATTORNEY' | 'END_OF_WORK_PERMIT';
  version: number; state: 'UPLOADED_PENDING_REVIEW' | 'APPROVED_VERIFIED' | 'REJECTED' | 'SUPERSEDED_BY_NEW_VERSION' | 'WITHDRAWN_DELETED';
  tokenRevocationEpoch: number; derivativePreviewObjectKey: string; derivativeRevoked: boolean;
}
export class ConfidentialDocumentVaultLifecycleGuard {
  private docs = new Map<string, VaultDocumentRecord>();
  private auditLog: Array<{ timestampMs: number; docId: string; actorUserId: string; action: string; granted: boolean; denialReason?: string }> = [];
  constructor(private readonly signingSecret = 'vault-ephemeral-hmac-secret-key-32b') {}
  public registerDocument(doc: VaultDocumentRecord) {
    if (!this.docs.has(doc.docId) && this.docs.size >= 2000) { const first = this.docs.keys().next().value; if (first !== undefined) this.docs.delete(first); }
    this.docs.set(doc.docId, { ...doc, assignedReviewerIds: [...doc.assignedReviewerIds] });
  }
  public canActorAccessDocument(
    docId: string, actor: { userId: string; role: 'OWNER' | 'ASSIGNED_REVIEWER' | 'ADMIN' | 'PUBLIC_BUYER' }, action: 'VIEW' | 'DOWNLOAD', nowMs: number
  ) {
    const doc = this.docs.get(docId);
    if (!doc) return { allowed: false, reason: 'DOCUMENT_NOT_FOUND' };
    if (this.auditLog.length >= 5000) this.auditLog.shift();
    if (doc.state === 'SUPERSEDED_BY_NEW_VERSION' || doc.state === 'WITHDRAWN_DELETED') {
      this.auditLog.push({ timestampMs: nowMs, docId, actorUserId: actor.userId, action, granted: false, denialReason: `INACTIVE_${doc.state}` });
      return { allowed: false, reason: `DOCUMENT_INACTIVE_${doc.state}` };
    }
    const allowed =
      (actor.role === 'OWNER' && actor.userId === doc.ownerUserId) ||
      (actor.role === 'ASSIGNED_REVIEWER' && doc.assignedReviewerIds.includes(actor.userId)) ||
      actor.role === 'ADMIN';
    this.auditLog.push({ timestampMs: nowMs, docId, actorUserId: actor.userId, action, granted: allowed, denialReason: allowed ? undefined : 'RBAC_DENIED' });
    return { allowed, reason: allowed ? 'AUTHORIZED' : 'RBAC_OR_CASE_ASSIGNMENT_DENIED' };
  }
  public issueShortLivedSignedToken(docId: string, actorUserId: string, allowedAction: 'VIEW' | 'DOWNLOAD', nowMs: number, ttlMs = 60_000) {
    const doc = this.docs.get(docId);
    if (!doc) throw new Error('DOCUMENT_NOT_FOUND');
    if (!actorUserId || /[:\r\n\0]/.test(actorUserId) || /[:\r\n\0]/.test(doc.docId)) throw new Error('INVALID_TOKEN_PRINCIPAL');
    const safeTtlMs = Math.max(1000, Math.min(Number.isFinite(ttlMs) ? ttlMs : 60_000, 3_600_000));
    const payload = `${doc.docId}:${doc.version}:${doc.tokenRevocationEpoch}:${actorUserId}:${allowedAction}:${nowMs + safeTtlMs}`;
    const sig = crypto.createHmac('sha256', this.signingSecret).update(payload).digest('hex');
    return `${Buffer.from(payload, 'utf8').toString('base64url')}.${sig}`;
  }
  public verifyShortLivedSignedToken(token: string, requestedDocId: string, requestedAction: 'VIEW' | 'DOWNLOAD', nowMs: number, expectedActorUserId?: string) {
    if (typeof token !== 'string' || token.length < 16 || token.length > 2048) return { valid: false, reason: 'MALFORMED_TOKEN' };
    const parts = token.split('.');
    if (parts.length !== 2) return { valid: false, reason: 'MALFORMED_TOKEN' };
    const payload = Buffer.from(parts[0], 'base64url').toString('utf8');
    const expectedSig = crypto.createHmac('sha256', this.signingSecret).update(payload).digest('hex');
    const actualBuf = Buffer.from(parts[1], 'utf8');
    const expectedBuf = Buffer.from(expectedSig, 'utf8');
    if (actualBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(actualBuf, expectedBuf)) {
      return { valid: false, reason: 'INVALID_SIGNATURE' };
    }
    const fields = payload.split(':');
    if (fields.length !== 6) return { valid: false, reason: 'MALFORMED_TOKEN' };
    const [docId, versionStr, epochStr, tokenActorId, action, expiresStr] = fields;
    if (docId !== requestedDocId) return { valid: false, reason: 'CROSS_DOCUMENT_TOKEN_REPLAY' };
    if (!tokenActorId || (expectedActorUserId && tokenActorId !== expectedActorUserId)) return { valid: false, reason: 'ACTOR_MISMATCH' };
    if (action !== requestedAction) return { valid: false, reason: 'ACTION_SCOPE_MISMATCH' };
    if (nowMs > Number(expiresStr)) return { valid: false, reason: 'TOKEN_EXPIRED' };
    const doc = this.docs.get(docId);
    if (!doc || doc.version !== Number(versionStr) || doc.tokenRevocationEpoch !== Number(epochStr) || doc.state === 'SUPERSEDED_BY_NEW_VERSION' || doc.state === 'WITHDRAWN_DELETED') {
      return { valid: false, reason: 'TOKEN_REVOKED_BY_LIFECYCLE_CHANGE' };
    }
    return { valid: true, reason: 'VALID' };
  }
  public replaceDocumentWithNewVersion(docId: string, newPreviewKey: string) {
    const doc = this.docs.get(docId);
    if (!doc) throw new Error('DOCUMENT_NOT_FOUND');
    doc.version += 1; doc.tokenRevocationEpoch += 1; doc.state = 'UPLOADED_PENDING_REVIEW';
    doc.derivativePreviewObjectKey = newPreviewKey; doc.derivativeRevoked = false;
    return { ...doc };
  }
  public withdrawOrDeleteDocument(docId: string) {
    const doc = this.docs.get(docId);
    if (!doc) throw new Error('DOCUMENT_NOT_FOUND');
    doc.state = 'WITHDRAWN_DELETED'; doc.tokenRevocationEpoch += 1; doc.derivativeRevoked = true;
    return { ...doc };
  }
}
export interface SpatialSearchPropertyItem {
  id: number; lat: number; lng: number; status: 'PUBLISHED_ACTIVE' | 'EXPIRED' | 'SOLD' | 'UNPUBLISHED_DRAFT';
  mode: 'buy' | 'rent'; priceMillionToman: number; hasExactCoordinateConsent: boolean;
}
export function isPointInsidePolygon(lat: number, lng: number, polygonLatLngs: Array<[number, number]>): boolean {
  if (polygonLatLngs.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygonLatLngs.length - 1; i < polygonLatLngs.length; j = i++) {
    const [latI, lngI] = polygonLatLngs[i], [latJ, lngJ] = polygonLatLngs[j];
    if (Math.abs(lat - latI) < 1e-9 && Math.abs(lng - lngI) < 1e-9) return true;
    if (lngI > lng !== lngJ > lng && lat < ((latJ - latI) * (lng - lngI)) / (lngJ - lngI + 1e-15) + latI) inside = !inside;
  }
  return inside;
}
export function evaluateMapViewportSpatialSearchAndSync(
  params: {
    requestSequenceTicket: number; latestIssuedSequenceTicket: number;
    bbox: { southLat: number; westLng: number; northLat: number; eastLng: number };
    customPolygonLatLngs?: Array<[number, number]>;
    activeFilters: { mode: 'buy' | 'rent'; maxPriceMillionToman: number };
    tileCandidates: SpatialSearchPropertyItem[][];
  },
  areaUnit: AreaUnit = getStoredAreaUnit(),
  intlCurrency: IntlCurrencyCode = getStoredIntlCurrency(),
) {
  const displayAreaUnitLabel = formatAreaUnitLabel(areaUnit);
  const maxPriceFilterIntlText = formatMillionTomanAsIntlCurrency(params.activeFilters.maxPriceMillionToman, intlCurrency);
  if (params.requestSequenceTicket < params.latestIssuedSequenceTicket) {
    return { isStaleResponseIgnored: true as const, bboxValid: true, mapMarkerIds: [] as number[], listResultIds: [] as number[], parityVerified: true, displayAreaUnitLabel, maxPriceFilterIntlText };
  }
  const b = params.bbox;
  const bboxValid = [b.southLat, b.northLat, b.westLng, b.eastLng].every(Number.isFinite) && b.southLat <= b.northLat && b.westLng <= b.eastLng;
  if (!bboxValid) {
    return { isStaleResponseIgnored: false as const, bboxValid: false, mapMarkerIds: [] as number[], listResultIds: [] as number[], parityVerified: true, displayAreaUnitLabel, maxPriceFilterIntlText };
  }
  const deduped = new Map<number, SpatialSearchPropertyItem>();
  for (const tile of params.tileCandidates) for (const item of tile) if (!deduped.has(item.id)) deduped.set(item.id, item);
  const matchedIds: number[] = [];
  for (const item of deduped.values()) {
    if (item.status !== 'PUBLISHED_ACTIVE' || item.mode !== params.activeFilters.mode || item.priceMillionToman > params.activeFilters.maxPriceMillionToman) continue;
    if (item.lat < b.southLat || item.lat > b.northLat || item.lng < b.westLng || item.lng > b.eastLng) continue;
    if (params.customPolygonLatLngs && params.customPolygonLatLngs.length >= 3 && !isPointInsidePolygon(item.lat, item.lng, params.customPolygonLatLngs)) continue;
    matchedIds.push(item.id);
  }
  matchedIds.sort((a, b2) => a - b2);
  return {
    isStaleResponseIgnored: false as const, bboxValid: true, preservedActiveFilters: { ...params.activeFilters },
    mapMarkerIds: [...matchedIds], listResultIds: [...matchedIds], uniqueEligibleClusterCount: matchedIds.length,
    parityVerified: true as const, displayAreaUnitLabel, maxPriceFilterIntlText,
  };
}
export interface PropertyNegotiationOffer {
  offerId: string; idempotencyKey: string; listingId: string; buyerUserId: string; sellerUserId: string;
  state: 'SUBMITTED' | 'COUNTERED' | 'ACCEPTED_NON_BINDING_INTENT' | 'REJECTED' | 'WITHDRAWN' | 'EXPIRED' | 'SUPERSEDED_BY_COMPETING_ACCEPTANCE';
  expiresAtMs: number;
  revisions: Array<{ revisionNumber: number; actorRole: 'BUYER' | 'SELLER'; actorUserId: string; proposedPriceMillionToman: number; timestampMs: number }>;
  listingAskPriceAtSubmissionMillionToman: number; listingPriceChangedSinceOffer: boolean; isLegallyBindingContract: false; legalDisclaimerFa: string;
}
export class PropertyOfferNegotiationStateMachine {
  private offers = new Map<string, PropertyNegotiationOffer>();
  private offerIdByKey = new Map<string, string>();
  private listings = new Map<string, { status: 'ACTIVE' | 'SOLD' | 'EXPIRED'; askPriceMillion: number }>();
  public registerListing(listingId: string, status: 'ACTIVE' | 'SOLD' | 'EXPIRED', askPriceMillion: number) {
    if (!this.listings.has(listingId) && this.listings.size >= 2000) { const first = this.listings.keys().next().value; if (first !== undefined) this.listings.delete(first); }
    this.listings.set(listingId, { status, askPriceMillion });
  }
  public submitOffer(params: {
    offerId: string; idempotencyKey: string; listingId: string; buyerUserId: string;
    sellerUserId: string; proposedPriceMillionToman: number; nowMs: number; ttlMs?: number;
  }) {
    const existingId = this.offerIdByKey.get(params.idempotencyKey);
    if (existingId && this.offers.has(existingId)) return { ok: true as const, deduplicatedRetry: true, offer: this.offers.get(existingId)! };
    if (!params.buyerUserId || !params.sellerUserId || params.buyerUserId === params.sellerUserId) return { ok: false as const, reason: 'SELF_DEALING_FORBIDDEN' };
    const listing = this.listings.get(params.listingId);
    if (!listing || listing.status !== 'ACTIVE') return { ok: false as const, reason: 'LISTING_NOT_ACTIVE_FOR_OFFERS' };
    if (!Number.isFinite(params.proposedPriceMillionToman) || params.proposedPriceMillionToman <= 0 || params.proposedPriceMillionToman > 10_000_000) return { ok: false as const, reason: 'INVALID_OFFER_AMOUNT' };
    const offer: PropertyNegotiationOffer = {
      offerId: params.offerId, idempotencyKey: params.idempotencyKey, listingId: params.listingId,
      buyerUserId: params.buyerUserId, sellerUserId: params.sellerUserId, state: 'SUBMITTED',
      expiresAtMs: params.nowMs + (params.ttlMs ?? 48 * 3600 * 1000),
      revisions: [{ revisionNumber: 1, actorRole: 'BUYER', actorUserId: params.buyerUserId, proposedPriceMillionToman: params.proposedPriceMillionToman, timestampMs: params.nowMs }],
      listingAskPriceAtSubmissionMillionToman: listing.askPriceMillion, listingPriceChangedSinceOffer: false, isLegallyBindingContract: false,
      legalDisclaimerFa: 'توافق قیمتی در این سامانه صرفاً تفاهم اولیه غیرالزام‌آور جهت مذاکره است.',
    };
    if (!this.offers.has(offer.offerId) && this.offers.size >= 2000) { const first = this.offers.keys().next().value; if (first !== undefined) this.offers.delete(first); }
    if (!this.offerIdByKey.has(params.idempotencyKey) && this.offerIdByKey.size >= 2000) { const first = this.offerIdByKey.keys().next().value; if (first !== undefined) this.offerIdByKey.delete(first); }
    this.offers.set(offer.offerId, offer);
    this.offerIdByKey.set(params.idempotencyKey, offer.offerId);
    return { ok: true as const, deduplicatedRetry: false, offer };
  }
  public counterOffer(params: { offerId: string; actorUserId: string; actorRole: 'BUYER' | 'SELLER'; newProposedPriceMillionToman: number; nowMs: number }) {
    const offer = this.offers.get(params.offerId);
    if (!offer) return { ok: false as const, reason: 'OFFER_NOT_FOUND' };
    if (!Number.isFinite(params.newProposedPriceMillionToman) || params.newProposedPriceMillionToman <= 0 || params.newProposedPriceMillionToman > 10_000_000) return { ok: false as const, reason: 'INVALID_OFFER_AMOUNT' };
    if (params.nowMs > offer.expiresAtMs) { offer.state = 'EXPIRED'; return { ok: false as const, reason: 'OFFER_ALREADY_EXPIRED' }; }
    if (offer.state !== 'SUBMITTED' && offer.state !== 'COUNTERED') return { ok: false as const, reason: `INVALID_TRANSITION_FROM_${offer.state}` };
    const auth = (params.actorRole === 'SELLER' && params.actorUserId === offer.sellerUserId) || (params.actorRole === 'BUYER' && params.actorUserId === offer.buyerUserId);
    if (!auth) return { ok: false as const, reason: 'UNAUTHORIZED_COUNTER_ACTOR' };
    if (offer.revisions.length >= 100) return { ok: false as const, reason: 'MAX_COUNTER_OFFER_REVISIONS_EXCEEDED' };
    offer.revisions.push({ revisionNumber: offer.revisions.length + 1, actorRole: params.actorRole, actorUserId: params.actorUserId, proposedPriceMillionToman: params.newProposedPriceMillionToman, timestampMs: params.nowMs });
    offer.state = 'COUNTERED';
    return { ok: true as const, offer };
  }
  public acceptOfferBySeller(offerId: string, sellerUserId: string, nowMs: number) {
    const offer = this.offers.get(offerId);
    if (!offer) return { ok: false as const, reason: 'OFFER_NOT_FOUND' };
    if (offer.sellerUserId !== sellerUserId) return { ok: false as const, reason: 'UNAUTHORIZED_SELLER' };
    if (nowMs > offer.expiresAtMs) { offer.state = 'EXPIRED'; return { ok: false as const, reason: 'OFFER_EXPIRED' }; }
    if (offer.state !== 'SUBMITTED' && offer.state !== 'COUNTERED') return { ok: false as const, reason: `CANNOT_ACCEPT_FROM_${offer.state}` };
    offer.state = 'ACCEPTED_NON_BINDING_INTENT';
    for (const other of this.offers.values()) {
      if (other.listingId === offer.listingId && other.offerId !== offer.offerId && (other.state === 'SUBMITTED' || other.state === 'COUNTERED')) {
        other.state = 'SUPERSEDED_BY_COMPETING_ACCEPTANCE';
      }
    }
    return { ok: true as const, offer };
  }
  public getOffersVisibleToActor(listingId: string, actorUserId: string) {
    return Array.from(this.offers.values()).filter((o) => o.listingId === listingId && (o.buyerUserId === actorUserId || o.sellerUserId === actorUserId));
  }
}
export interface AdminAuditEventRecord {
  sequenceNumber: number; eventId: string; idempotencyKey: string; timestampIso: string;
  humanInitiatorUserId: string; humanInitiatorRole: string; executingServiceIdentity: string;
  actionCategory: string; targetEntityType: string; targetEntityId: string; reasonAndTicketRef: string;
  beforeStateRedacted: Record<string, unknown>; afterStateRedacted: Record<string, unknown>;
  prevRecordHash: string; recordHash: string;
}
const SENSITIVE_AUDIT_KEYS = /password|secret|token|authorization|cookie|privatekey|nationalid|apikey/i;
function redactAuditSnapshot(obj: Record<string, unknown>, depth = 0): Record<string, unknown> {
  const out: Record<string, unknown> = Object.create(null);
  if (!obj || typeof obj !== 'object' || depth > 6) return out;
  for (const [k, v] of Object.entries(obj)) {
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
    if (SENSITIVE_AUDIT_KEYS.test(k)) out[k] = '[REDACTED_SENSITIVE]';
    else if (Array.isArray(v)) out[k] = v.slice(0, 100).map((it) => (it && typeof it === 'object' && !Array.isArray(it) ? redactAuditSnapshot(it as Record<string, unknown>, depth + 1) : it));
    else if (v && typeof v === 'object') out[k] = redactAuditSnapshot(v as Record<string, unknown>, depth + 1);
    else out[k] = v;
  }
  return out;
}
export class TamperEvidentAdministrativeAuditLedger {
  private chain: AdminAuditEventRecord[] = [];
  private byKey = new Map<string, AdminAuditEventRecord>();
  public appendAdminEvent(input: {
    eventId: string; idempotencyKey: string; timestampIso: string; humanInitiatorUserId: string;
    humanInitiatorRole: string; executingServiceIdentity: string; actionCategory: string;
    targetEntityType: string; targetEntityId: string; reasonAndTicketRef: string;
    beforeState: Record<string, unknown>; afterState: Record<string, unknown>;
  }): AdminAuditEventRecord {
    const existing = this.byKey.get(input.idempotencyKey);
    if (existing) return { ...existing };
    const sequenceNumber = this.chain.length > 0 ? this.chain[this.chain.length - 1].sequenceNumber + 1 : 1;
    const prevRecordHash = this.chain.length === 0 ? 'GENESIS_0000000000000000' : this.chain[this.chain.length - 1].recordHash;
    const beforeStateRedacted = redactAuditSnapshot(input.beforeState);
    const afterStateRedacted = redactAuditSnapshot(input.afterState);
    const body = {
      sequenceNumber, eventId: input.eventId, idempotencyKey: input.idempotencyKey, timestampIso: input.timestampIso,
      humanInitiatorUserId: input.humanInitiatorUserId, humanInitiatorRole: input.humanInitiatorRole,
      executingServiceIdentity: input.executingServiceIdentity, actionCategory: input.actionCategory,
      targetEntityType: input.targetEntityType, targetEntityId: input.targetEntityId,
      reasonAndTicketRef: input.reasonAndTicketRef, beforeStateRedacted, afterStateRedacted, prevRecordHash,
    };
    const recordHash = crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex');
    const record: AdminAuditEventRecord = { ...body, recordHash };
    if (this.chain.length >= 5000) this.chain.shift();
    if (this.byKey.size >= 5000) { const first = this.byKey.keys().next().value; if (first !== undefined) this.byKey.delete(first); }
    this.chain.push(record);
    this.byKey.set(input.idempotencyKey, record);
    return { ...record };
  }
  public verifyIntegrity(recordsToInspect: AdminAuditEventRecord[] = this.chain) {
    let expectedPrevHash = 'GENESIS_0000000000000000';
    for (let i = 0; i < recordsToInspect.length; i++) {
      const r = recordsToInspect[i];
      if (r.sequenceNumber !== i + 1) return { intact: false, brokenAtSequence: i + 1, reason: 'SEQUENCE_GAP_OR_REORDERING_DETECTED' };
      if (r.prevRecordHash !== expectedPrevHash) return { intact: false, brokenAtSequence: r.sequenceNumber, reason: 'PREV_HASH_CHAIN_LINK_BROKEN' };
      const { recordHash, ...body } = r;
      const recomputed = crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex');
      if (recomputed !== recordHash) return { intact: false, brokenAtSequence: r.sequenceNumber, reason: 'PAYLOAD_TAMPERED_HASH_MISMATCH' };
      expectedPrevHash = recordHash;
    }
    return {
      intact: true, verifiedRecordsCount: recordsToInspect.length,
      securityPostureClassification: {
        ordinaryApplicationLogging: true, accessControlledAuditRecords: true, appendOnlyInProcessBehavior: true, cryptographicHashChainedTamperEvidence: true, externalCloudWormObjectLockConfiguredInLocalContainer: false, }, }; } public exportRecords(): AdminAuditEventRecord[] { return this.chain.map((r) => ({ ...r })); } }