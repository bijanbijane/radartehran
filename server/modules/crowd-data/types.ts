/**
 * @fileoverview Employee 4 — Crowd Claims and Market Observations Domain Types.
 * Strictly separates Crowd Claims (`CROWD_CLAIM`) from Market Observations (`MARKET_OBSERVATION`)
 * with independent state machines, trust models, and provenance contracts.
 */

import type { CityId } from '../../../src/types/models';
import type { MarketAnomalyReasonCode } from '../../../src/utils/marketHistoryAndPulseIntegrity';

export type ClaimPlausibilityStatus = 'plausible' | 'needs_review' | 'rejected_outlier';

/**
 * Epistemic classification enforcing that user claims are never conflated with
 * raw observations, verified observations, or derived market metrics.
 */
export type EpistemicClassification =
  | 'UNVERIFIED_CROWD_CLAIM'
  | 'MODERATED_CROWD_CLAIM'
  | 'RAW_MARKET_OBSERVATION'
  | 'VERIFIED_MARKET_OBSERVATION'
  | 'DERIVED_MARKET_METRIC';

export interface ActorContext {
  readonly uid: string;
  readonly isAdmin: boolean;
  readonly sessionId?: string;
  readonly clientIpHash?: string;
}

export interface AuthoritativeNeighborhoodRef {
  readonly cityId: CityId;
  readonly hoodId: number;
  readonly hoodName: string;
  readonly baseBuyPerSqmMillionToman: number;
  readonly baseRahn80mMillionToman: number;
}

// ============================================================================
// DOMAIN 1: CROWD CLAIMS (User-Submitted Claims, Moderation, Audit & Duplicates)
// ============================================================================

export type CrowdClaimCategory =
  | 'DEAL_PRICE_REPORT'
  | 'RENTAL_TERMS_REPORT'
  | 'STREET_LIQUIDITY_SHIFT'
  | 'INFRASTRUCTURE_OR_ZONING_EVENT'
  | 'LISTING_AUTHENTICITY_ALERT'
  | 'NEIGHBORHOOD_ATTRIBUTE_CORRECTION';

export type CrowdClaimLifecycleState =
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'DISPUTED'
  | 'WITHDRAWN';

export type ClaimEvidenceType =
  | 'REDACTED_CONTRACT_IMAGE'
  | 'OFFICIAL_REGISTRY_RECEIPT'
  | 'FIELD_SURVEY_PHOTO'
  | 'EXTERNAL_LISTING_URL'
  | 'WITNESS_ATTESTATION_NOTE';

export interface ClaimEvidenceReference {
  readonly evidenceId: string;
  readonly type: ClaimEvidenceType;
  readonly storageObjectKey?: string;
  readonly externalUrl?: string;
  readonly sha256Digest?: string;
  readonly descriptionFa: string;
  readonly capturedAtIso: string;
}

export interface ClaimProvenanceMetadata {
  readonly authorUid: string;
  readonly submissionChannel: 'WEB_APP' | 'MOBILE_PWA' | 'FIELD_AGENT_PORTAL';
  readonly submittedAtIso: string;
  readonly sourceObservationDateIso: string;
  readonly contributorTrustWeightAtSubmission: number;
  readonly clientSessionRef?: string;
}

export type ClaimAuditEventType =
  | 'CLAIM_SUBMITTED'
  | 'CLAIM_UPDATED_BY_OWNER'
  | 'CLAIM_WITHDRAWN_BY_OWNER'
  | 'CLAIM_MOVED_TO_REVIEW'
  | 'CLAIM_ACCEPTED_BY_MODERATOR'
  | 'CLAIM_REJECTED_BY_MODERATOR'
  | 'CLAIM_DISPUTED'
  | 'DUPLICATE_FLAG_ATTACHED';

export interface ClaimAuditEvent {
  readonly eventId: string;
  readonly claimId: string;
  readonly eventType: ClaimAuditEventType;
  readonly fromState: CrowdClaimLifecycleState | null;
  readonly toState: CrowdClaimLifecycleState;
  readonly actorUid: string;
  readonly actorRole: 'OWNER' | 'MODERATOR' | 'COMMUNITY_DISPUTER' | 'SYSTEM';
  readonly occurredAtIso: string;
  readonly reason: string;
  readonly revision: number;
}

export interface DuplicateClaimCandidateMatch {
  readonly existingClaimId: string;
  readonly authorUid: string;
  readonly similarityScore: number;
  readonly classification: 'CONFIRMED_DUPLICATE' | 'PROBABLE_DUPLICATE' | 'DISTINCT';
  readonly matchedReasons: readonly string[];
}

export interface DuplicateClaimCheckResult {
  readonly isDuplicate: boolean;
  readonly highestSimilarity: number;
  readonly primaryDuplicateClaimId: string | null;
  readonly matches: readonly DuplicateClaimCandidateMatch[];
}

export interface CrowdClaimRecord {
  readonly claimId: string;
  readonly epistemicClass: 'UNVERIFIED_CROWD_CLAIM' | 'MODERATED_CROWD_CLAIM';
  readonly authoritativeDataEligible: false;
  readonly cityId: CityId;
  readonly hoodId: number;
  readonly hoodName: string;
  readonly streetKeyNormalized: string;
  readonly streetDisplayFa: string;
  readonly category: CrowdClaimCategory;
  readonly state: CrowdClaimLifecycleState;
  readonly assertedBuyPerSqmMillionToman?: number;
  readonly assertedRahn80mMillionToman?: number;
  readonly sqm?: number;
  readonly narrativeFa: string;
  readonly correctedFieldKey?: string;
  readonly evidenceRefs: readonly ClaimEvidenceReference[];
  readonly provenance: ClaimProvenanceMetadata;
  readonly plausibilityStatus: ClaimPlausibilityStatus;
  readonly plausibilityDeviationRatio: number;
  readonly plausibilityReason: string;
  readonly duplicateCheck: DuplicateClaimCheckResult;
  readonly disputeCount: number;
  readonly disputeReasons: readonly string[];
  readonly moderationNote?: string;
  readonly moderatedByUid?: string;
  readonly moderatedAtIso?: string;
  readonly revision: number;
  readonly createdAtIso: string;
  readonly updatedAtIso: string;
  readonly auditHistory: readonly ClaimAuditEvent[];
}

export interface SubmitCrowdClaimRequest {
  readonly cityId: CityId;
  readonly hoodId: number;
  readonly streetName: string;
  readonly category: CrowdClaimCategory;
  readonly assertedBuyPerSqmMillionToman?: number;
  readonly assertedRahn80mMillionToman?: number;
  readonly sqm?: number;
  readonly narrativeFa: string;
  readonly correctedFieldKey?: string;
  readonly sourceObservationDateIso?: string;
  readonly submissionChannel?: 'WEB_APP' | 'MOBILE_PWA' | 'FIELD_AGENT_PORTAL';
  readonly evidenceRefs?: readonly Partial<ClaimEvidenceReference>[];
}

export interface UpdateOwnCrowdClaimRequest {
  readonly claimId: string;
  readonly expectedRevision?: number;
  readonly narrativeFa?: string;
  readonly assertedBuyPerSqmMillionToman?: number;
  readonly assertedRahn80mMillionToman?: number;
  readonly evidenceRefs?: readonly Partial<ClaimEvidenceReference>[];
}

export interface ModerateCrowdClaimRequest {
  readonly claimId: string;
  readonly targetState: 'UNDER_REVIEW' | 'ACCEPTED' | 'REJECTED' | 'DISPUTED';
  readonly reason: string;
  readonly expectedRevision?: number;
}

// ============================================================================
// DOMAIN 2: MARKET OBSERVATIONS (Structured Observations, Validity & Analytics)
// ============================================================================

export type MarketObservationSourceType =
  | 'OFFICIAL_DEED_REGISTRY'
  | 'VERIFIED_ESCROW_CONTRACT'
  | 'LICENSED_APPRAISER_REPORT'
  | 'VETTED_MARKET_FEED'
  | 'USER_REPORTED_RAW';

export type ObservationVerificationState =
  | 'RAW_UNVERIFIED'
  | 'QUARANTINED'
  | 'VERIFIED_OBSERVATION'
  | 'REJECTED_INVALID';

export interface ObservationProvenance {
  readonly submittedByUid: string;
  readonly sourceType: MarketObservationSourceType;
  readonly externalReferenceId: string;
  readonly sourceCapturedAtIso: string;
  readonly ingestedAtIso: string;
  readonly originCrowdsourcedClaimId?: never;
}

export interface ObservationValidityWindow {
  readonly observedAtIso: string;
  readonly validFromIso: string;
  readonly validUntilIso: string;
  readonly ttlDays: number;
}

export interface ObservationConfidenceMetadata {
  readonly confidenceScore: number;
  readonly confidenceGrade: 'A' | 'B' | 'C' | 'D';
  readonly anomalyFlags: readonly MarketAnomalyReasonCode[];
  readonly verifierUid?: string;
  readonly verifiedAtIso?: string;
  readonly verificationMethod?: 'ADMIN_AUDIT' | 'MULTI_SOURCE_CORROBORATION' | 'REGISTRY_MATCH';
  readonly qualityControlNotes?: string;
}

export interface MarketObservationRecord {
  readonly observationId: string;
  readonly epistemicClass: 'RAW_MARKET_OBSERVATION' | 'VERIFIED_MARKET_OBSERVATION';
  readonly cityId: CityId;
  readonly hoodId: number;
  readonly hoodName: string;
  readonly streetKeyNormalized: string;
  readonly dealType: 'BUY' | 'RENT';
  readonly sqm: number;
  readonly pricePerSqmMillionToman: number;
  readonly totalPriceMillionToman: number;
  readonly rahn80mEquivalentMillionToman?: number;
  readonly buildingAgeYears?: number;
  readonly verificationState: ObservationVerificationState;
  readonly provenance: ObservationProvenance;
  readonly validity: ObservationValidityWindow;
  readonly confidence: ObservationConfidenceMetadata;
  readonly revision: number;
  readonly createdAtIso: string;
  readonly updatedAtIso: string;
}

export interface SubmitMarketObservationRequest {
  readonly cityId: CityId;
  readonly hoodId: number;
  readonly streetName: string;
  readonly dealType: 'BUY' | 'RENT';
  readonly sqm: number;
  readonly pricePerSqmMillionToman: number;
  readonly rahn80mEquivalentMillionToman?: number;
  readonly buildingAgeYears?: number;
  readonly sourceType: MarketObservationSourceType;
  readonly externalReferenceId: string;
  readonly observedAtIso: string;
  readonly ttlDays?: number;
  readonly sourceClaimId?: string;
}

export interface ModerateMarketObservationRequest {
  readonly observationId: string;
  readonly action: 'VERIFY' | 'QUARANTINE' | 'REJECT';
  readonly verificationMethod?: 'ADMIN_AUDIT' | 'MULTI_SOURCE_CORROBORATION' | 'REGISTRY_MATCH';
  readonly confidenceBoost?: number;
  readonly qualityControlNotes: string;
  readonly expectedRevision?: number;
}

export interface DerivedMarketMetrics {
  readonly epistemicClass: 'DERIVED_MARKET_METRIC';
  readonly medianBuyPerSqmMillionToman: number;
  readonly q1BuyPerSqmMillionToman: number;
  readonly q3BuyPerSqmMillionToman: number;
  readonly iqrMillionToman: number;
  readonly meanWeightedConfidence: number;
  readonly aggregateConfidenceGrade: 'high' | 'medium' | 'low';
  readonly earliestObservationIso: string;
  readonly latestObservationIso: string;
}

export interface SafeMarketObservationAggregation {
  readonly cityId: CityId;
  readonly hoodId: number;
  readonly hoodName: string;
  readonly evaluatedAtIso: string;
  readonly rawObservationCount: number;
  readonly quarantinedObservationCount: number;
  readonly rejectedObservationCount: number;
  readonly expiredObservationCount: number;
  readonly verifiedActiveObservationCount: number;
  readonly outlierFilteredCount: number;
  readonly status: 'AGGREGATED_FROM_VERIFIED' | 'INSUFFICIENT_VERIFIED_OBSERVATIONS';
  readonly syntheticFallbackUsed: false;
  readonly derivedMetrics: DerivedMarketMetrics | null;
}
