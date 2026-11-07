/**
 * @fileoverview Pure Validators, State Transition Matrix, and Duplicate Detection
 * for Domain 1: Crowd Claims (`server/modules/crowd-data/crowdClaimsValidators.ts`).
 */

import {
  computeTokenSimilarity,
  sanitizeSafeExternalUrl,
} from '../../../src/utils/marketDataIntegrity';
import { sanitizeInput } from '../../../src/utils/security';
import { CrowdDataDomainError } from './persistenceAdapter';
import type {
  ClaimEvidenceReference,
  ClaimEvidenceType,
  CrowdClaimCategory,
  CrowdClaimLifecycleState,
  CrowdClaimRecord,
  DuplicateClaimCandidateMatch,
  DuplicateClaimCheckResult,
} from './types';

export const VALID_CLAIM_CATEGORIES = new Set<CrowdClaimCategory>([
  'DEAL_PRICE_REPORT',
  'RENTAL_TERMS_REPORT',
  'STREET_LIQUIDITY_SHIFT',
  'INFRASTRUCTURE_OR_ZONING_EVENT',
  'LISTING_AUTHENTICITY_ALERT',
  'NEIGHBORHOOD_ATTRIBUTE_CORRECTION',
]);

export const VALID_EVIDENCE_TYPES = new Set<ClaimEvidenceType>([
  'REDACTED_CONTRACT_IMAGE',
  'OFFICIAL_REGISTRY_RECEIPT',
  'FIELD_SURVEY_PHOTO',
  'EXTERNAL_LISTING_URL',
  'WITNESS_ATTESTATION_NOTE',
]);

export const CROWD_CLAIM_ALLOWED_TRANSITIONS: Readonly<
  Record<CrowdClaimLifecycleState, readonly CrowdClaimLifecycleState[]>
> = {
  SUBMITTED: ['UNDER_REVIEW', 'ACCEPTED', 'REJECTED', 'DISPUTED', 'WITHDRAWN'],
  UNDER_REVIEW: ['ACCEPTED', 'REJECTED', 'DISPUTED', 'WITHDRAWN'],
  ACCEPTED: ['DISPUTED', 'UNDER_REVIEW'],
  DISPUTED: ['DISPUTED', 'UNDER_REVIEW', 'ACCEPTED', 'REJECTED'],
  REJECTED: ['UNDER_REVIEW'],
  WITHDRAWN: [],
};

export function validateEvidenceReferences(
  rawRefs: readonly Partial<ClaimEvidenceReference>[] | undefined,
  nowIso: string
): ClaimEvidenceReference[] {
  if (!rawRefs || rawRefs.length === 0) return [];
  if (rawRefs.length > 10) {
    throw new CrowdDataDomainError('VALIDATION_FAILED', 'At most 10 evidence references are allowed per claim.');
  }
  return rawRefs.map((ref, idx) => {
    const type = ref.type as ClaimEvidenceType;
    if (!type || !VALID_EVIDENCE_TYPES.has(type)) {
      throw new CrowdDataDomainError('VALIDATION_FAILED', `Invalid evidence reference type at index ${idx}.`);
    }
    const descriptionFa = sanitizeInput(String(ref.descriptionFa ?? ''), 300);
    if (descriptionFa.length < 4) {
      throw new CrowdDataDomainError('VALIDATION_FAILED', `Evidence description at index ${idx} is too short.`);
    }
    const storageObjectKey = ref.storageObjectKey ? sanitizeInput(ref.storageObjectKey, 180) : undefined;
    let externalUrl: string | undefined;
    if (ref.externalUrl !== undefined) {
      const safeUrl = sanitizeSafeExternalUrl(ref.externalUrl);
      if (!safeUrl) {
        throw new CrowdDataDomainError('VALIDATION_FAILED', `Unsafe or invalid external evidence URL at index ${idx}.`);
      }
      externalUrl = safeUrl;
    }
    if (!storageObjectKey && !externalUrl && type !== 'WITNESS_ATTESTATION_NOTE') {
      throw new CrowdDataDomainError(
        'VALIDATION_FAILED',
        `Evidence item ${idx} (${type}) requires a storageObjectKey or externalUrl.`
      );
    }
    const sha256Digest =
      typeof ref.sha256Digest === 'string' && /^[a-fA-F0-9]{64}$/.test(ref.sha256Digest.trim())
        ? ref.sha256Digest.trim().toLowerCase()
        : undefined;
    return {
      evidenceId: sanitizeInput(ref.evidenceId || `ev_${idx + 1}_${Date.now().toString(36)}`, 64),
      type,
      storageObjectKey,
      externalUrl,
      sha256Digest,
      descriptionFa,
      capturedAtIso:
        typeof ref.capturedAtIso === 'string' && ref.capturedAtIso.trim() ? ref.capturedAtIso.trim() : nowIso,
    };
  });
}

/**
 * Detects duplicate or near-duplicate crowd claims within the same city & neighborhood.
 */
export function detectDuplicateCrowdClaims(
  candidate: {
    cityId: string;
    hoodId: number;
    streetKeyNormalized: string;
    category: CrowdClaimCategory;
    assertedBuyPerSqmMillionToman?: number;
    narrativeFa: string;
  },
  existingClaims: readonly CrowdClaimRecord[]
): DuplicateClaimCheckResult {
  const matches: DuplicateClaimCandidateMatch[] = [];
  for (const existing of existingClaims) {
    if (existing.state === 'WITHDRAWN' || existing.state === 'REJECTED') continue;
    if (existing.cityId !== candidate.cityId || existing.hoodId !== candidate.hoodId) continue;

    const reasons: string[] = [];
    const streetSim = computeTokenSimilarity(candidate.streetKeyNormalized, existing.streetKeyNormalized);
    const narrativeSim = computeTokenSimilarity(candidate.narrativeFa, existing.narrativeFa);
    const sameCategory = candidate.category === existing.category;

    let priceSim = 0;
    if (
      typeof candidate.assertedBuyPerSqmMillionToman === 'number' &&
      typeof existing.assertedBuyPerSqmMillionToman === 'number' &&
      existing.assertedBuyPerSqmMillionToman > 0
    ) {
      const relDiff =
        Math.abs(candidate.assertedBuyPerSqmMillionToman - existing.assertedBuyPerSqmMillionToman) /
        existing.assertedBuyPerSqmMillionToman;
      if (relDiff <= 0.02) {
        priceSim = 1;
        reasons.push('NEAR_IDENTICAL_ASSERTED_PRICE');
      } else if (relDiff <= 0.07) {
        priceSim = 0.75;
        reasons.push('CLOSE_ASSERTED_PRICE');
      }
    }

    if (streetSim >= 0.85) reasons.push('MATCHING_NORMALIZED_STREET');
    if (sameCategory) reasons.push('SAME_CLAIM_CATEGORY');
    if (narrativeSim >= 0.75) reasons.push('HIGH_NARRATIVE_OVERLAP');

    const weightedScore =
      Math.round(
        (streetSim * 0.4 + narrativeSim * 0.35 + (sameCategory ? 0.15 : 0) + priceSim * 0.1) * 1000
      ) / 1000;

    if (sameCategory && streetSim >= 0.9 && (narrativeSim >= 0.85 || priceSim === 1)) {
      matches.push({
        existingClaimId: existing.claimId,
        authorUid: existing.provenance.authorUid,
        similarityScore: Math.max(weightedScore, 0.92),
        classification: 'CONFIRMED_DUPLICATE',
        matchedReasons: reasons,
      });
    } else if (sameCategory && weightedScore >= 0.72) {
      matches.push({
        existingClaimId: existing.claimId,
        authorUid: existing.provenance.authorUid,
        similarityScore: weightedScore,
        classification: 'PROBABLE_DUPLICATE',
        matchedReasons: reasons,
      });
    }
  }

  matches.sort((a, b) => b.similarityScore - a.similarityScore);
  const top = matches[0];
  return {
    isDuplicate: Boolean(
      top && (top.classification === 'CONFIRMED_DUPLICATE' || top.classification === 'PROBABLE_DUPLICATE')
    ),
    highestSimilarity: top ? top.similarityScore : 0,
    primaryDuplicateClaimId: top ? top.existingClaimId : null,
    matches,
  };
}
