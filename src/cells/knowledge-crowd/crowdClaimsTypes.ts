/**
 * @file src/cells/knowledge-crowd/crowdClaimsTypes.ts
 * @description Stage 2.1 — Knowledge Graph & Crowd Claims Cell Type Definitions
 * Defines schemas for `/crowdClaims/{claimId}` and `/contributorProfiles/{uid}`.
 */
import type { CityId } from '../../types/models';
import { formatMillionTomanAsIntlCurrency, type IntlCurrencyCode } from '../../utils/areaUnit';

export type SpatialTargetLevel =
  | 'HOOD'
  | 'MICRO_BLOCK'
  | 'STREET_SEGMENT'
  | 'BUILDING_PARCEL';

export type CrowdClaimCategory =
  | 'ALLEY_LIVABILITY'
  | 'PRICE_OBSERVATION'
  | 'CONSTRUCTION_QUALITY'
  | 'INFRASTRUCTURE_POI'
  | 'DATA_CORRECTION';

export type ContributorRoleBadge =
  | 'CITIZEN'
  | 'LOCAL_RESIDENT'
  | 'VERIFIED_REALTOR'
  | 'OFFICIAL_EXPERT';

export type EpistemicClaimState =
  | 'STAGE_COMMUNITY'
  | 'VERIFIED_REFERENCE'
  | 'DISPUTED'
  | 'REJECTED_SPAM';

export type AlleySlopeType = 'FLAT' | 'MILD_SLOPE' | 'STEEP_SLOPE';

export type ClaimVoteDirection = 'UP' | 'DOWN';

export interface CrowdClaimCoords {
  lat: number;
  lng: number;
}

export interface ClaimVoteRecord {
  voterUid: string;
  direction: ClaimVoteDirection;
  voterTrustWeightAtVote: number;
  effectiveWeight: number;
  shadowBannedAtVote: boolean;
  votedAtIso: string;
}

/**
 * Firestore document schema for `/crowdClaims/{claimId}`
 */
export interface CrowdClaimDocument {
  claimId: string;
  // 1. Spatial Target Hierarchy
  targetLevel: SpatialTargetLevel;
  cityId: CityId;
  hoodId: number;
  streetNameRaw: string;
  streetNameNormalized: string;
  coords: CrowdClaimCoords | null;

  // 2. Category
  category: CrowdClaimCategory;

  // 3. Structured Metrics & Narrative
  estimatedPriceSqm: number | null;
  estimatedPriceSqmIntlText?: string;
  parkingScore: number | null;
  noiseLevelScore: number | null;
  safetyScore: number | null;
  slopeType: AlleySlopeType | null;
  narrativeText: string;
  evidenceMediaObjectIds: string[];

  // 4. Named User Attribution
  authorUid: string;
  authorDisplayName: string;
  authorRoleBadge: ContributorRoleBadge;
  authorTrustWeightAtSubmission: number;

  // 5. Dual-Layer Epistemic State & Consensus
  epistemicState: EpistemicClaimState;
  aiPlausibilityScore: number;
  plausibilityReasonFa: string;
  upvoteCount: number;
  downvoteCount: number;
  weightedConsensusScore: number;
  citationCount: number;

  // Audit & Vote Ledger
  votesByUid: Record<string, ClaimVoteRecord>;
  createdAtIso: string;
  updatedAtIso: string;
  promotedToReferenceAtIso: string | null;
}

/**
 * Firestore document schema for `/contributorProfiles/{uid}`
 */
export interface ContributorProfileDocument {
  uid: string;
  displayName: string;
  roleBadge: ContributorRoleBadge;
  reputationPoints: number;
  trustWeight: number; // Strictly bounded in [0.1, 5.0]
  verifiedClaimsCount: number;
  totalSubmittedClaimsCount: number;
  topSpecialtyHoodIds: number[];
  shadowBanned: boolean;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface SubmitCrowdClaimInput {
  claimId?: string;
  targetLevel?: SpatialTargetLevel;
  cityId?: CityId | string;
  hoodId: number;
  streetName: string;
  coords?: CrowdClaimCoords | null;
  category: CrowdClaimCategory;
  estimatedPriceSqm?: number | null;
  parkingScore?: number | null;
  noiseLevelScore?: number | null;
  safetyScore?: number | null;
  slopeType?: AlleySlopeType | null;
  narrativeText: string;
  evidenceMediaObjectIds?: string[];
  authorUid: string;
  authorDisplayName: string;
  authorRoleBadge?: ContributorRoleBadge;
  baseHoodPriceSqmOverride?: number;
  intlCurrency?: IntlCurrencyCode;
}

export interface PlausibilityEvaluationInput {
  category: CrowdClaimCategory;
  estimatedPriceSqm?: number | null;
  baseHoodPriceSqm: number;
  evidenceMediaObjectIds?: string[];
  narrativeText: string;
  parkingScore?: number | null;
  noiseLevelScore?: number | null;
  safetyScore?: number | null;
}

export interface PlausibilityEvaluationResult {
  aiPlausibilityScore: number;
  deviationRatio: number | null;
  hasSupportingEvidence: boolean;
  flaggedUnverifiedPriceOutlier: boolean;
  reasonFa: string;
}

export interface ProcessClaimVoteInput {
  claimId: string;
  voterUid: string;
  direction: ClaimVoteDirection;
}

export interface ProcessClaimVoteResult {
  claim: CrowdClaimDocument;
  authorProfile: ContributorProfileDocument;
  voterProfile: ContributorProfileDocument;
  effectiveVoteWeight: number;
  promotedToVerifiedReference: boolean;
  demotedFromVerifiedReference?: boolean;
}

export interface HoodClaimsQueryResult {
  hoodId: number;
  streetNameFilterNormalized: string | null;
  verifiedReferenceClaims: CrowdClaimDocument[];
  communityStageClaims: CrowdClaimDocument[];
  disputedClaims: CrowdClaimDocument[];
  totalMatchedCount: number;
  crowdVerifiedDealMedianPerSqm?: number | null;
  crowdPriceObservationCount?: number;
}

export function formatClaimPriceSqmIntl(
  estimatedPriceSqm: number | null | undefined,
  currency: IntlCurrencyCode = 'USD',
): string | undefined {
  if (typeof estimatedPriceSqm !== 'number' || !Number.isFinite(estimatedPriceSqm) || estimatedPriceSqm <= 0) {
    return undefined;
  }
  return formatMillionTomanAsIntlCurrency(estimatedPriceSqm, currency, 'fa');
}
