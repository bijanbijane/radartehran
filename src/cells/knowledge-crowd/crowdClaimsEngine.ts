/** @file src/cells/knowledge-crowd/crowdClaimsEngine.ts — Stage 2.1 Knowledge Graph & Crowd Claims Engine */
import { MULTI_CITY_CONFIGS } from '../../data/multiCityData';
import { INITIAL_NEIGHBORHOODS } from '../../data/neighborhoods';
import { formatMillionTomanAsIntlCurrency, type IntlCurrencyCode } from '../../utils/areaUnit';
import { clampNumber, isValidFirestoreDocId, sanitizeInput, validateCityParam } from '../../utils/security';
import { getFirebaseAdminFirestoreForServer } from '../../utils/serverAdminAndTelegramSecurity';
import {
  formatClaimPriceSqmIntl, type AlleySlopeType, type ClaimVoteDirection, type ContributorProfileDocument,
  type ContributorRoleBadge, type CrowdClaimCategory, type CrowdClaimDocument, type HoodClaimsQueryResult,
  type PlausibilityEvaluationInput, type PlausibilityEvaluationResult, type ProcessClaimVoteInput,
  type ProcessClaimVoteResult, type SpatialTargetLevel, type SubmitCrowdClaimInput,
} from './crowdClaimsTypes';

export const TRUST_WEIGHT_MIN = 0.1, TRUST_WEIGHT_MAX = 5.0, DEFAULT_INITIAL_TRUST_WEIGHT = 1.0;
export const PROMOTION_CONSENSUS_THRESHOLD = 3.0, PROMOTION_PLAUSIBILITY_THRESHOLD = 70;
export const PROMOTION_REPUTATION_REWARD = 25, PROMOTION_TRUST_WEIGHT_REWARD = 0.05, MAX_PRICE_DEVIATION_WITHOUT_EVIDENCE = 0.40;
const inMemoryCrowdClaims = new Map<string, CrowdClaimDocument>();
const inMemoryContributorProfiles = new Map<string, ContributorProfileDocument>();

const VALID_TARGET_LEVELS: ReadonlySet<SpatialTargetLevel> = new Set(['HOOD', 'MICRO_BLOCK', 'STREET_SEGMENT', 'BUILDING_PARCEL']);
const VALID_CATEGORIES: ReadonlySet<CrowdClaimCategory> = new Set([
  'ALLEY_LIVABILITY', 'PRICE_OBSERVATION', 'CONSTRUCTION_QUALITY', 'INFRASTRUCTURE_POI', 'DATA_CORRECTION',
]);
const VALID_ROLE_BADGES: ReadonlySet<ContributorRoleBadge> = new Set(['CITIZEN', 'LOCAL_RESIDENT', 'VERIFIED_REALTOR', 'OFFICIAL_EXPERT']);
const VALID_SLOPE_TYPES: ReadonlySet<AlleySlopeType> = new Set(['FLAT', 'MILD_SLOPE', 'STEEP_SLOPE']);

function shouldAttemptFirestoreAdmin(): boolean {
  if (process.env.CROWD_CLAIMS_FORCE_MEMORY === 'true') return false;
  return Boolean(process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
}

async function persistDocBestEffort(collectionName: 'crowdClaims' | 'contributorProfiles', docId: string, payload: unknown): Promise<void> {
  if (!shouldAttemptFirestoreAdmin()) return;
  try {
    const db = getFirebaseAdminFirestoreForServer(process.env);
    await db.collection(collectionName).doc(docId).set(payload as Record<string, unknown>, { merge: true });
  } catch {
    // Fallback to in-memory store when Admin SDK credentials/emulator are unavailable in test environment
  }
}

export function normalizeStreetName(raw: string): string {
  const cleaned = sanitizeInput(String(raw || ''), 120)
    .replace(/[\u200B-\u200D\uFEFF]/g, ' ')
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632))
    .replace(/^(?:خیابان|خ|کوچه|ک|بلوار|بن‌بست|بن بست)\s+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  return cleaned || 'نامشخص';
}

export function resolveNeighborhoodBaseBuyPriceSqm(hoodId: number, cityId: string = 'tehran'): number {
  const safeCity = validateCityParam(cityId, 'tehran');
  const cityHoods = MULTI_CITY_CONFIGS[safeCity]?.neighborhoods ?? INITIAL_NEIGHBORHOODS;
  const matched = cityHoods.find((h) => h.id === hoodId) ?? INITIAL_NEIGHBORHOODS.find((h) => h.id === hoodId);
  return matched && Number.isFinite(matched.buyPerSqm) && matched.buyPerSqm > 0 ? matched.buyPerSqm : 120;
}

export function evaluateClaimPlausibility(input: PlausibilityEvaluationInput): PlausibilityEvaluationResult {
  const evidenceIds = Array.isArray(input.evidenceMediaObjectIds)
    ? input.evidenceMediaObjectIds.filter((id) => typeof id === 'string' && id.trim().length > 0)
    : [];
  const hasSupportingEvidence = evidenceIds.length > 0;
  const narrativeLen = (input.narrativeText || '').trim().length;
  const basePrice = Number.isFinite(input.baseHoodPriceSqm) && input.baseHoodPriceSqm > 0 ? input.baseHoodPriceSqm : 120;

  let score = 78 + (narrativeLen >= 25 ? 6 : 0) + (hasSupportingEvidence ? 8 : 0);
  if (typeof input.parkingScore === 'number' || typeof input.noiseLevelScore === 'number' || typeof input.safetyScore === 'number') {
    score += 4;
  }

  const hasPrice = typeof input.estimatedPriceSqm === 'number' && Number.isFinite(input.estimatedPriceSqm) && input.estimatedPriceSqm > 0;
  if (hasPrice) {
    const deviationRatio = Math.abs(Number(input.estimatedPriceSqm) - basePrice) / basePrice;
    const roundedDev = Number(deviationRatio.toFixed(4));
    if (deviationRatio > MAX_PRICE_DEVIATION_WITHOUT_EVIDENCE && !hasSupportingEvidence) {
      const penaltyScore = Math.max(15, Math.round(42 - Math.min(25, (deviationRatio - 0.4) * 40)));
      return {
        aiPlausibilityScore: penaltyScore, deviationRatio: roundedDev, hasSupportingEvidence: false, flaggedUnverifiedPriceOutlier: true,
        reasonFa: `انحراف قیمت ادعایی (${Math.round(deviationRatio * 100)}٪) بیش از سقف مجاز ۴۰٪ نسبت به میانگین محله بدون پیوست مدرک معتبر است.`,
      };
    }
    if (deviationRatio > MAX_PRICE_DEVIATION_WITHOUT_EVIDENCE && hasSupportingEvidence) {
      return {
        aiPlausibilityScore: clampNumber(72, 0, 100, 72), deviationRatio: roundedDev, hasSupportingEvidence: true, flaggedUnverifiedPriceOutlier: false,
        reasonFa: 'انحراف قیمتی بالا ولی دارای مستندات پیوست؛ نیازمند اجماع همسایگان و کارشناسان.',
      };
    }
    const closenessBonus = Math.round((1 - deviationRatio / MAX_PRICE_DEVIATION_WITHOUT_EVIDENCE) * 8);
    return {
      aiPlausibilityScore: clampNumber(score + closenessBonus, 0, 100, 80), deviationRatio: roundedDev, hasSupportingEvidence, flaggedUnverifiedPriceOutlier: false,
      reasonFa: 'قیمت گزارش‌شده در بازه منطقی محله قرار دارد.',
    };
  }

  if (narrativeLen < 8) {
    return {
      aiPlausibilityScore: 45, deviationRatio: null, hasSupportingEvidence, flaggedUnverifiedPriceOutlier: false,
      reasonFa: 'توضیحات متنی گزارش بسیار کوتاه است.',
    };
  }
  return {
    aiPlausibilityScore: clampNumber(score, 0, 100, 78), deviationRatio: null, hasSupportingEvidence, flaggedUnverifiedPriceOutlier: false,
    reasonFa: 'گزارش کیفی کوچه/محله با ساختار استاندارد همخوانی دارد.',
  };
}

export function getOrCreateContributorProfile(
  uid: string,
  defaults?: { displayName?: string; roleBadge?: ContributorRoleBadge; trustWeight?: number; shadowBanned?: boolean },
): ContributorProfileDocument {
  const cleanUid = sanitizeInput(uid, 128);
  if (!cleanUid || !isValidFirestoreDocId(cleanUid)) throw new Error('INVALID_CONTRIBUTOR_UID');
  const existing = inMemoryContributorProfiles.get(cleanUid);
  if (existing) {
    if (defaults?.displayName && existing.displayName === 'کاربر رادار') existing.displayName = sanitizeInput(defaults.displayName, 80);
    if (defaults?.roleBadge && VALID_ROLE_BADGES.has(defaults.roleBadge)) existing.roleBadge = defaults.roleBadge;
    if (typeof defaults?.shadowBanned === 'boolean') existing.shadowBanned = defaults.shadowBanned;
    if (typeof defaults?.trustWeight === 'number' && Number.isFinite(defaults.trustWeight)) {
      existing.trustWeight = clampNumber(defaults.trustWeight, TRUST_WEIGHT_MIN, TRUST_WEIGHT_MAX, DEFAULT_INITIAL_TRUST_WEIGHT);
    }
    return existing;
  }
  const nowIso = new Date().toISOString();
  const roleBadge: ContributorRoleBadge = defaults?.roleBadge && VALID_ROLE_BADGES.has(defaults.roleBadge) ? defaults.roleBadge : 'CITIZEN';
  const initialWeight = typeof defaults?.trustWeight === 'number' && Number.isFinite(defaults.trustWeight)
    ? clampNumber(defaults.trustWeight, TRUST_WEIGHT_MIN, TRUST_WEIGHT_MAX, DEFAULT_INITIAL_TRUST_WEIGHT)
    : DEFAULT_INITIAL_TRUST_WEIGHT;
  const created: ContributorProfileDocument = {
    uid: cleanUid, displayName: sanitizeInput(defaults?.displayName || 'کاربر رادار', 80) || 'کاربر رادار',
    roleBadge, reputationPoints: 0, trustWeight: initialWeight, verifiedClaimsCount: 0, totalSubmittedClaimsCount: 0,
    topSpecialtyHoodIds: [], shadowBanned: Boolean(defaults?.shadowBanned), createdAtIso: nowIso, updatedAtIso: nowIso,
  };
  inMemoryContributorProfiles.set(cleanUid, created);
  return created;
}

export function setContributorShadowBanStatus(uid: string, shadowBanned: boolean): ContributorProfileDocument {
  const profile = getOrCreateContributorProfile(uid, { shadowBanned });
  profile.shadowBanned = Boolean(shadowBanned);
  profile.updatedAtIso = new Date().toISOString();
  inMemoryContributorProfiles.set(profile.uid, profile);
  void persistDocBestEffort('contributorProfiles', profile.uid, profile);
  return profile;
}

export async function submitCrowdClaim(input: SubmitCrowdClaimInput): Promise<CrowdClaimDocument> {
  const authorUid = sanitizeInput(input.authorUid, 128);
  if (!authorUid || !isValidFirestoreDocId(authorUid)) throw new Error('INVALID_AUTHOR_UID');
  const hoodId = Math.trunc(Number(input.hoodId));
  if (!Number.isInteger(hoodId) || hoodId < 1 || hoodId > 9999) throw new Error('INVALID_HOOD_ID');
  const narrativeText = sanitizeInput(input.narrativeText || '', 1200);
  if (narrativeText.length < 5) throw new Error('NARRATIVE_TOO_SHORT');

  const category: CrowdClaimCategory = VALID_CATEGORIES.has(input.category) ? input.category : 'ALLEY_LIVABILITY';
  const targetLevel: SpatialTargetLevel = input.targetLevel && VALID_TARGET_LEVELS.has(input.targetLevel) ? input.targetLevel : 'STREET_SEGMENT';
  const cityId = validateCityParam(input.cityId, 'tehran');
  const streetNameRaw = sanitizeInput(input.streetName || 'کوچه اصلی', 120) || 'کوچه اصلی';
  const authorProfile = getOrCreateContributorProfile(authorUid, { displayName: input.authorDisplayName, roleBadge: input.authorRoleBadge });
  const evidenceMediaObjectIds = Array.isArray(input.evidenceMediaObjectIds)
    ? input.evidenceMediaObjectIds.map((id) => sanitizeInput(String(id), 120)).filter((id) => id.length > 0 && isValidFirestoreDocId(id)).slice(0, 10)
    : [];
  const estimatedPriceSqm = typeof input.estimatedPriceSqm === 'number' && Number.isFinite(input.estimatedPriceSqm) && input.estimatedPriceSqm > 0
    ? Number(input.estimatedPriceSqm) : null;
  const baseHoodPriceSqm = typeof input.baseHoodPriceSqmOverride === 'number' && input.baseHoodPriceSqmOverride > 0
    ? input.baseHoodPriceSqmOverride : resolveNeighborhoodBaseBuyPriceSqm(hoodId, cityId);
  const plausibility = evaluateClaimPlausibility({
    category, estimatedPriceSqm, baseHoodPriceSqm, evidenceMediaObjectIds, narrativeText,
    parkingScore: input.parkingScore, noiseLevelScore: input.noiseLevelScore, safetyScore: input.safetyScore,
  });

  const nowIso = new Date().toISOString();
  const rawClaimId = input.claimId ? sanitizeInput(input.claimId, 100) : `clm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  if (!isValidFirestoreDocId(rawClaimId)) throw new Error('INVALID_CLAIM_ID');
  const intlCurrency: IntlCurrencyCode = input.intlCurrency || 'USD';

  const claim: CrowdClaimDocument = {
    claimId: rawClaimId, targetLevel, cityId, hoodId, streetNameRaw,
    streetNameNormalized: normalizeStreetName(streetNameRaw),
    coords: input.coords && Number.isFinite(input.coords.lat) && Number.isFinite(input.coords.lng)
      ? { lat: clampNumber(input.coords.lat, 24, 40, 35.7), lng: clampNumber(input.coords.lng, 44, 64, 51.4) } : null,
    category, estimatedPriceSqm,
    estimatedPriceSqmIntlText: estimatedPriceSqm !== null
      ? formatClaimPriceSqmIntl(estimatedPriceSqm, intlCurrency) ?? formatMillionTomanAsIntlCurrency(estimatedPriceSqm, intlCurrency, 'fa')
      : undefined,
    parkingScore: typeof input.parkingScore === 'number' ? clampNumber(input.parkingScore, 1, 10, 5) : null,
    noiseLevelScore: typeof input.noiseLevelScore === 'number' ? clampNumber(input.noiseLevelScore, 1, 10, 5) : null,
    safetyScore: typeof input.safetyScore === 'number' ? clampNumber(input.safetyScore, 1, 10, 5) : null,
    slopeType: input.slopeType && VALID_SLOPE_TYPES.has(input.slopeType) ? input.slopeType : null,
    narrativeText, evidenceMediaObjectIds,
    authorUid: authorProfile.uid, authorDisplayName: authorProfile.displayName, authorRoleBadge: authorProfile.roleBadge,
    authorTrustWeightAtSubmission: clampNumber(authorProfile.trustWeight, TRUST_WEIGHT_MIN, TRUST_WEIGHT_MAX, DEFAULT_INITIAL_TRUST_WEIGHT),
    epistemicState: 'STAGE_COMMUNITY', aiPlausibilityScore: plausibility.aiPlausibilityScore, plausibilityReasonFa: plausibility.reasonFa,
    upvoteCount: 0, downvoteCount: 0, weightedConsensusScore: 0, citationCount: 0, votesByUid: {},
    createdAtIso: nowIso, updatedAtIso: nowIso, promotedToReferenceAtIso: null,
  };

  inMemoryCrowdClaims.set(claim.claimId, claim);
  authorProfile.totalSubmittedClaimsCount += 1;
  if (!authorProfile.topSpecialtyHoodIds.includes(hoodId)) authorProfile.topSpecialtyHoodIds = [...authorProfile.topSpecialtyHoodIds, hoodId].slice(0, 10);
  authorProfile.updatedAtIso = nowIso;
  inMemoryContributorProfiles.set(authorProfile.uid, authorProfile);
  await Promise.all([persistDocBestEffort('crowdClaims', claim.claimId, claim), persistDocBestEffort('contributorProfiles', authorProfile.uid, authorProfile)]);
  return claim;
}

export async function processClaimVoteAndPromotion(input: ProcessClaimVoteInput): Promise<ProcessClaimVoteResult> {
  const claim = inMemoryCrowdClaims.get(sanitizeInput(input.claimId, 100));
  if (!claim) throw new Error('CLAIM_NOT_FOUND');
  const voterUid = sanitizeInput(input.voterUid, 128);
  if (!voterUid || !isValidFirestoreDocId(voterUid)) throw new Error('INVALID_VOTER_UID');
  const direction: ClaimVoteDirection = input.direction === 'DOWN' ? 'DOWN' : 'UP';
  const voterProfile = getOrCreateContributorProfile(voterUid);
  const clampedVoterTrust = clampNumber(voterProfile.trustWeight, TRUST_WEIGHT_MIN, TRUST_WEIGHT_MAX, DEFAULT_INITIAL_TRUST_WEIGHT);
  const effectiveVoteWeight = voterProfile.shadowBanned ? 0 : direction === 'UP' ? clampedVoterTrust : -clampedVoterTrust;
  const nowIso = new Date().toISOString();

  claim.votesByUid[voterUid] = {
    voterUid, direction, voterTrustWeightAtVote: clampedVoterTrust,
    effectiveWeight: effectiveVoteWeight, shadowBannedAtVote: voterProfile.shadowBanned, votedAtIso: nowIso,
  };

  let upCount = 0, downCount = 0, weightedSum = 0;
  for (const vote of Object.values(claim.votesByUid)) {
    if (vote.shadowBannedAtVote || vote.effectiveWeight === 0) continue;
    if (vote.direction === 'UP') upCount += 1; else downCount += 1;
    weightedSum += vote.effectiveWeight;
  }
  claim.upvoteCount = upCount;
  claim.downvoteCount = downCount;
  claim.weightedConsensusScore = Number(weightedSum.toFixed(4));
  claim.updatedAtIso = nowIso;

  const authorProfile = getOrCreateContributorProfile(claim.authorUid, { displayName: claim.authorDisplayName, roleBadge: claim.authorRoleBadge });
  let promotedToVerifiedReference = false;
  if (
    claim.epistemicState !== 'VERIFIED_REFERENCE' &&
    claim.weightedConsensusScore >= PROMOTION_CONSENSUS_THRESHOLD &&
    claim.aiPlausibilityScore >= PROMOTION_PLAUSIBILITY_THRESHOLD
  ) {
    claim.epistemicState = 'VERIFIED_REFERENCE';
    claim.promotedToReferenceAtIso = nowIso;
    promotedToVerifiedReference = true;
    authorProfile.reputationPoints += PROMOTION_REPUTATION_REWARD;
    authorProfile.trustWeight = Number(clampNumber(authorProfile.trustWeight + PROMOTION_TRUST_WEIGHT_REWARD, TRUST_WEIGHT_MIN, TRUST_WEIGHT_MAX, DEFAULT_INITIAL_TRUST_WEIGHT).toFixed(4));
    authorProfile.verifiedClaimsCount += 1;
    if (!authorProfile.topSpecialtyHoodIds.includes(claim.hoodId)) authorProfile.topSpecialtyHoodIds = [...authorProfile.topSpecialtyHoodIds, claim.hoodId].slice(0, 10);
    authorProfile.updatedAtIso = nowIso;
    inMemoryContributorProfiles.set(authorProfile.uid, authorProfile);
  } else if (claim.epistemicState === 'STAGE_COMMUNITY' && claim.weightedConsensusScore <= -PROMOTION_CONSENSUS_THRESHOLD) {
    claim.epistemicState = 'DISPUTED';
  }

  inMemoryCrowdClaims.set(claim.claimId, claim);
  await Promise.all([persistDocBestEffort('crowdClaims', claim.claimId, claim), persistDocBestEffort('contributorProfiles', authorProfile.uid, authorProfile)]);
  return { claim, authorProfile, voterProfile, effectiveVoteWeight, promotedToVerifiedReference };
}

export function queryNeighborhoodCrowdClaims(hoodId: number, streetNameFilter?: string): HoodClaimsQueryResult {
  const normalizedFilter = typeof streetNameFilter === 'string' && streetNameFilter.trim().length > 0 ? normalizeStreetName(streetNameFilter) : null;
  const verifiedReferenceClaims: CrowdClaimDocument[] = [], communityStageClaims: CrowdClaimDocument[] = [], disputedClaims: CrowdClaimDocument[] = [];
  for (const claim of inMemoryCrowdClaims.values()) {
    if (claim.hoodId !== hoodId) continue;
    if (normalizedFilter && !claim.streetNameNormalized.includes(normalizedFilter) && !normalizedFilter.includes(claim.streetNameNormalized)) continue;
    if (claim.epistemicState === 'VERIFIED_REFERENCE') verifiedReferenceClaims.push(claim);
    else if (claim.epistemicState === 'STAGE_COMMUNITY') communityStageClaims.push(claim);
    else if (claim.epistemicState === 'DISPUTED') disputedClaims.push(claim);
  }
  verifiedReferenceClaims.sort((a, b) => b.weightedConsensusScore - a.weightedConsensusScore);
  communityStageClaims.sort((a, b) => b.createdAtIso.localeCompare(a.createdAtIso));
  return {
    hoodId, streetNameFilterNormalized: normalizedFilter, verifiedReferenceClaims, communityStageClaims, disputedClaims,
    totalMatchedCount: verifiedReferenceClaims.length + communityStageClaims.length + disputedClaims.length,
  };
}

export function getContributorProfileWithClaims(uid: string) {
  const profile = getOrCreateContributorProfile(uid);
  const submittedClaims = Array.from(inMemoryCrowdClaims.values()).filter((c) => c.authorUid === profile.uid).sort((a, b) => b.createdAtIso.localeCompare(a.createdAtIso));
  return { profile, submittedClaims, verifiedClaims: submittedClaims.filter((c) => c.epistemicState === 'VERIFIED_REFERENCE') };
}

export function resetCrowdClaimsMemoryStoreForTests(): void {
  inMemoryCrowdClaims.clear();
  inMemoryContributorProfiles.clear();
}
