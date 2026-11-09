/**
 * @file server/modules/property-registry/resolution/relationshipsAndResolutionEngine.ts
 * @description Pure domain algorithms for canonical ID generation, address normalization/redaction,
 * structural relationship validation & cycle prevention, duplicate candidate scoring,
 * 7-dimensional quality evaluation, and point-in-time historical attribute reconstruction.
 */

import { randomUUID } from 'node:crypto';
import { CoreApiError, sanitizeTextInput } from '../../core';
import type {
  AttributeChangeHistoryRecord,
  CanonicalPropertyEntity,
  CompletenessTier,
  DataFreshnessTier,
  DataQualityFindingRecord,
  DuplicateComparisonSignal,
  EntityRelationshipRecord,
  EntityRelationshipType,
  EntityVerificationStatus,
  IdentityConfidenceLevel,
  IdentityConflictStatus,
  IdentityQualityDimensions,
  MatchClassification,
  PropertyAddressReference,
  PropertyEntityKind,
  SourceOriginalAddressEntry,
  SourceProvenanceReference,
  SourceReliabilityLevel,
} from '../domain/types';

const ENTITY_PREFIX_MAP: Record<PropertyEntityKind, string> = {
  PARCEL: 'parcel',
  BUILDING: 'bldg',
  UNIT: 'unit',
  OTHER_ASSET: 'asset',
};

/**
 * Generates a stable, unique internal canonical ID for a physical property entity.
 * Never derives IDs from addresses, phone numbers, owner IDs, or listing IDs.
 */
export function generateCanonicalPropertyId(kind: PropertyEntityKind): string {
  const prefix = ENTITY_PREFIX_MAP[kind];
  return `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
}

/**
 * Normalizes Persian/English address components into a deterministic comparison text
 * while preserving the source-provided raw address in `sourceOriginalAddresses`.
 */
export function buildNormalizedAddressReference(input: {
  country?: string;
  provinceId: string;
  cityId: string;
  municipality?: string | null;
  districtNumber?: number | null;
  neighborhoodCompositeId?: string | null;
  neighborhoodNameFa?: string | null;
  street: string;
  streetNumberOrPlate?: string | null;
  buildingEntranceOrBlock?: string | null;
  unitDesignation?: string | null;
  postalCode?: string | null;
  rawSourceAddress?: string;
  sourceRecordId: string;
  sourceSystemNamespace: string;
  nowIso: string;
  existingOriginalAddresses?: SourceOriginalAddressEntry[];
}): PropertyAddressReference {
  const streetClean = sanitizeTextInput(input.street).slice(0, 180);
  if (!streetClean) {
    throw new CoreApiError(
      'VALIDATION_FAILED',
      400,
      'INVALID_ADDRESS_STREET: Street name is required for property address reference.',
    );
  }

  const plateClean = input.streetNumberOrPlate ? sanitizeTextInput(input.streetNumberOrPlate).slice(0, 40) : null;
  const blockClean = input.buildingEntranceOrBlock ? sanitizeTextInput(input.buildingEntranceOrBlock).slice(0, 40) : null;
  const unitClean = input.unitDesignation ? sanitizeTextInput(input.unitDesignation).slice(0, 40) : null;
  const postalClean = input.postalCode ? sanitizeTextInput(input.postalCode).replace(/\s+/g, '').slice(0, 20) : null;

  const normalizedParts = [
    input.cityId.trim().toLowerCase(),
    input.districtNumber ? `d${input.districtNumber}` : null,
    input.neighborhoodCompositeId ? input.neighborhoodCompositeId.toLowerCase() : null,
    streetClean.replace(/\s+/g, ' ').toLowerCase(),
    plateClean ? `pl:${plateClean.toLowerCase()}` : null,
    blockClean ? `blk:${blockClean.toLowerCase()}` : null,
    unitClean ? `u:${unitClean.toLowerCase()}` : null,
  ].filter(Boolean);

  const normalizedAddressText = normalizedParts.join('|');
  const publicRedactedAddressSummary = [
    input.neighborhoodNameFa || input.cityId,
    input.districtNumber ? `منطقه ${input.districtNumber}` : null,
    streetClean,
  ]
    .filter(Boolean)
    .join('، ');

  const rawAddressText = input.rawSourceAddress
    ? sanitizeTextInput(input.rawSourceAddress).slice(0, 400)
    : [streetClean, plateClean, blockClean, unitClean].filter(Boolean).join(' - ');

  const existingHistory = input.existingOriginalAddresses ? [...input.existingOriginalAddresses] : [];
  const alreadyRecorded = existingHistory.some(
    (entry) =>
      entry.rawAddressText === rawAddressText &&
      entry.sourceRecordId === input.sourceRecordId &&
      entry.postalCodeRaw === postalClean,
  );
  if (!alreadyRecorded) {
    existingHistory.push({
      rawAddressText,
      sourceRecordId: input.sourceRecordId,
      sourceSystemNamespace: input.sourceSystemNamespace,
      observedAtIso: input.nowIso,
      postalCodeRaw: postalClean,
    });
  }

  return {
    country: input.country ? sanitizeTextInput(input.country).slice(0, 10) : 'IR',
    provinceId: input.provinceId,
    cityId: input.cityId,
    municipality: input.municipality ? sanitizeTextInput(input.municipality).slice(0, 80) : null,
    districtNumber: input.districtNumber ?? null,
    neighborhoodCompositeId: input.neighborhoodCompositeId ?? null,
    neighborhoodNameFa: input.neighborhoodNameFa ? sanitizeTextInput(input.neighborhoodNameFa).slice(0, 100) : null,
    street: streetClean,
    streetNumberOrPlate: plateClean,
    buildingEntranceOrBlock: blockClean,
    unitDesignation: unitClean,
    postalCode: postalClean,
    normalizedAddressText,
    publicRedactedAddressSummary,
    sourceOriginalAddresses: existingHistory,
    lastNormalizedAtIso: input.nowIso,
  };
}

/**
 * Redacts sensitive plate, unit, entrance, and postal code details for public projections.
 */
export function redactEntityForPublicAccess<T extends CanonicalPropertyEntity>(entity: T): T {
  const redactedAddress: PropertyAddressReference = {
    ...entity.addressRef,
    streetNumberOrPlate: null,
    buildingEntranceOrBlock: null,
    postalCode: null,
    normalizedAddressText: entity.addressRef.publicRedactedAddressSummary,
    sourceOriginalAddresses: [],
  };
  const copy = {
    ...entity,
    addressRef: redactedAddress,
  };
  if (copy.entityKind === 'PARCEL') {
    copy.officialParcelIdentifier = null;
  }
  return copy;
}

/**
 * Validates whether a relationship type is structurally valid between two entity kinds
 * and verifies that adding the edge does not introduce any cycle in the relationship graph.
 */
export function validateRelationshipConsistencyAndPreventCycles(input: {
  sourceEntity: CanonicalPropertyEntity;
  targetEntity: CanonicalPropertyEntity;
  relationshipType: EntityRelationshipType;
  existingActiveRelationships: EntityRelationshipRecord[];
}): void {
  const { sourceEntity, targetEntity, relationshipType, existingActiveRelationships } = input;

  if (sourceEntity.canonicalId === targetEntity.canonicalId) {
    throw new CoreApiError(
      'VALIDATION_FAILED',
      400,
      'SELF_RELATIONSHIP_FORBIDDEN: An entity cannot have a structural relationship with itself.',
    );
  }

  const allowedPairs: Record<EntityRelationshipType, Array<[PropertyEntityKind, PropertyEntityKind]>> = {
    PARCEL_CONTAINS_BUILDING: [['PARCEL', 'BUILDING']],
    BUILDING_CONTAINS_UNIT: [['BUILDING', 'UNIT']],
    BUILDING_ASSOCIATED_WITH_PARCEL: [['BUILDING', 'PARCEL']],
    SHARED_FACILITY_BELONGS_TO_BUILDING: [['OTHER_ASSET', 'BUILDING']],
    ASSET_LOCATED_ON_PARCEL: [['OTHER_ASSET', 'PARCEL']],
  };

  const validKindPair = allowedPairs[relationshipType].some(
    ([allowedSource, allowedTarget]) =>
      sourceEntity.entityKind === allowedSource && targetEntity.entityKind === allowedTarget,
  );

  if (!validKindPair) {
    throw new CoreApiError(
      'VALIDATION_FAILED',
      400,
      `INVALID_ENTITY_RELATIONSHIP_KINDS: Relationship '${relationshipType}' is not valid between '${sourceEntity.entityKind}' and '${targetEntity.entityKind}'.`,
    );
  }

  // Check if unit already belongs to a different active parent building
  if (relationshipType === 'BUILDING_CONTAINS_UNIT') {
    const conflictingParent = existingActiveRelationships.find(
      (r) =>
        r.status === 'ACTIVE' &&
        r.relationshipType === 'BUILDING_CONTAINS_UNIT' &&
        r.targetEntityId === targetEntity.canonicalId &&
        r.sourceEntityId !== sourceEntity.canonicalId,
    );
    if (conflictingParent) {
      throw new CoreApiError(
        'CONFLICT',
        409,
        `UNIT_MULTIPLE_PARENT_BUILDINGS_CONFLICT: Unit '${targetEntity.canonicalId}' already belongs to parent building '${conflictingParent.sourceEntityId}'.`,
      );
    }
  }

  // Directed cycle detection across all active relationships
  const adjacency = new Map<string, Set<string>>();
  for (const rel of existingActiveRelationships) {
    if (rel.status !== 'ACTIVE') continue;
    if (!adjacency.has(rel.sourceEntityId)) {
      adjacency.set(rel.sourceEntityId, new Set());
    }
    adjacency.get(rel.sourceEntityId)!.add(rel.targetEntityId);
  }
  if (!adjacency.has(sourceEntity.canonicalId)) {
    adjacency.set(sourceEntity.canonicalId, new Set());
  }
  adjacency.get(sourceEntity.canonicalId)!.add(targetEntity.canonicalId);

  // Check if targetEntity can reach sourceEntity
  const visited = new Set<string>();
  const stack: string[] = [targetEntity.canonicalId];
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current === sourceEntity.canonicalId) {
      throw new CoreApiError(
        'CONFLICT',
        409,
        `CIRCULAR_RELATIONSHIP_DETECTED: Adding relationship '${sourceEntity.canonicalId}' -> '${targetEntity.canonicalId}' creates a cycle.`,
      );
    }
    if (visited.has(current)) continue;
    visited.add(current);
    const neighbors = adjacency.get(current);
    if (neighbors) {
      for (const n of neighbors) {
        stack.push(n);
      }
    }
  }
}

/**
 * Evaluates whether two canonical entities of the same kind are duplicate candidates.
 */
export function evaluateEntitySimilaritySignals(input: {
  primary: CanonicalPropertyEntity;
  candidate: CanonicalPropertyEntity;
  sharedVerifiedOfficialIdentifiers: string[];
  conflictingOfficialIdentifiers: boolean;
}): {
  matchClassification: MatchClassification;
  evidenceScore: number;
  signals: DuplicateComparisonSignal[];
} {
  const { primary, candidate, sharedVerifiedOfficialIdentifiers, conflictingOfficialIdentifiers } = input;
  const signals: DuplicateComparisonSignal[] = [];
  let score = 0;

  if (primary.entityKind !== candidate.entityKind) {
    return {
      matchClassification: 'CONFIRMED_DISTINCT_ENTITIES',
      evidenceScore: 0,
      signals: [],
    };
  }

  // False-positive guard for UNITS:
  if (primary.entityKind === 'UNIT' && candidate.entityKind === 'UNIT') {
    if (
      primary.parentBuildingId &&
      candidate.parentBuildingId &&
      primary.parentBuildingId !== candidate.parentBuildingId
    ) {
      signals.push({
        signalType: 'BUILDING_AND_UNIT_DESIGNATION',
        matched: false,
        weightContribution: -100,
        evidenceSummary: `Units belong to distinct parent buildings (${primary.parentBuildingId} vs ${candidate.parentBuildingId}).`,
      });
      return {
        matchClassification: 'CONFIRMED_DISTINCT_ENTITIES',
        evidenceScore: 0,
        signals,
      };
    }

    if (
      primary.parentBuildingId &&
      candidate.parentBuildingId &&
      primary.parentBuildingId === candidate.parentBuildingId &&
      primary.unitDesignation.trim().toLowerCase() !== candidate.unitDesignation.trim().toLowerCase()
    ) {
      signals.push({
        signalType: 'CONFLICTING_UNIT_OR_FLOOR',
        matched: false,
        weightContribution: -100,
        evidenceSummary: `Distinct unit designations (${primary.unitDesignation} vs ${candidate.unitDesignation}) inside the same building.`,
      });
      return {
        matchClassification: 'CONFIRMED_DISTINCT_ENTITIES',
        evidenceScore: 0,
        signals,
      };
    }
  }

  if (conflictingOfficialIdentifiers) {
    signals.push({
      signalType: 'OFFICIAL_IDENTIFIER_MATCH',
      matched: false,
      weightContribution: -80,
      evidenceSummary: 'Entities carry conflicting verified official identifiers in the same namespace.',
    });
    return {
      matchClassification: 'UNRESOLVED_IDENTITY_CONFLICT',
      evidenceScore: 15,
      signals,
    };
  }

  if (sharedVerifiedOfficialIdentifiers.length > 0) {
    signals.push({
      signalType: 'OFFICIAL_IDENTIFIER_MATCH',
      matched: true,
      weightContribution: 55,
      evidenceSummary: `Shared verified official identifier(s): ${sharedVerifiedOfficialIdentifiers.join(', ')}`,
    });
    score += 55;
  }

  // Address similarity signal
  const sameStreetAndPlate =
    primary.addressRef.cityId === candidate.addressRef.cityId &&
    primary.addressRef.street.toLowerCase() === candidate.addressRef.street.toLowerCase() &&
    Boolean(primary.addressRef.streetNumberOrPlate) &&
    primary.addressRef.streetNumberOrPlate === candidate.addressRef.streetNumberOrPlate;

  if (sameStreetAndPlate) {
    signals.push({
      signalType: 'NORMALIZED_ADDRESS_SIMILARITY',
      matched: true,
      weightContribution: 25,
      evidenceSummary: 'Matching city, normalized street, and street plate.',
    });
    score += 25;
  }

  // Geographic proximity signal
  if (primary.geographicRef.coordinates && candidate.geographicRef.coordinates) {
    const dLat = Math.abs(primary.geographicRef.coordinates.lat - candidate.geographicRef.coordinates.lat);
    const dLng = Math.abs(primary.geographicRef.coordinates.lng - candidate.geographicRef.coordinates.lng);
    if (dLat < 0.0003 && dLng < 0.0003) {
      signals.push({
        signalType: 'GEOGRAPHIC_PROXIMITY',
        matched: true,
        weightContribution: 15,
        evidenceSummary: 'Coordinates within ~30m threshold.',
      });
      score += 15;
    }
  }

  // Unit parent building + unit number match
  if (
    primary.entityKind === 'UNIT' &&
    candidate.entityKind === 'UNIT' &&
    primary.parentBuildingId &&
    primary.parentBuildingId === candidate.parentBuildingId &&
    primary.unitDesignation.trim().toLowerCase() === candidate.unitDesignation.trim().toLowerCase()
  ) {
    signals.push({
      signalType: 'BUILDING_AND_UNIT_DESIGNATION',
      matched: true,
      weightContribution: 40,
      evidenceSummary: `Same parent building (${primary.parentBuildingId}) and unit designation (${primary.unitDesignation}).`,
    });
    score += 40;
  }

  // Area similarity signal
  const areaA = getPrimaryEntityAreaSqm(primary);
  const areaB = getPrimaryEntityAreaSqm(candidate);
  if (areaA !== null && areaB !== null && areaA > 0 && areaB > 0) {
    const diffRatio = Math.abs(areaA - areaB) / Math.max(areaA, areaB);
    if (diffRatio <= 0.05) {
      signals.push({
        signalType: 'AREA_CONSISTENCY',
        matched: true,
        weightContribution: 10,
        evidenceSummary: `Reported areas (${areaA} vs ${areaB} sqm) within 5% tolerance.`,
      });
      score += 10;
    }
  }

  const clampedScore = Math.min(100, Math.max(0, score));
  let matchClassification: MatchClassification = 'CONFIRMED_DISTINCT_ENTITIES';

  if (sharedVerifiedOfficialIdentifiers.length > 0 && clampedScore >= 80) {
    matchClassification = 'CONFIRMED_SAME_ENTITY';
  } else if (clampedScore >= 60) {
    matchClassification = 'STRONG_CANDIDATE_REQUIRING_REVIEW';
  } else if (clampedScore >= 25) {
    matchClassification = 'POSSIBLE_MATCH_INSUFFICIENT_EVIDENCE';
  }

  return {
    matchClassification,
    evidenceScore: clampedScore,
    signals,
  };
}

export function getPrimaryEntityAreaSqm(entity: CanonicalPropertyEntity): number | null {
  switch (entity.entityKind) {
    case 'PARCEL':
      return entity.parcelAreaSqm;
    case 'UNIT':
      return entity.areaSpec.verifiedDeedAreaSqm ?? entity.areaSpec.reportedAreaSqm;
    case 'OTHER_ASSET':
      return entity.reportedAreaSqm;
    case 'BUILDING':
      return null;
  }
}

/**
 * Computes the 7 distinct IdentityQualityDimensions without collapsing them into a single score.
 */
export function computeIdentityQualityDimensions(input: {
  sourceReferences: SourceProvenanceReference[];
  hasVerifiedOfficialIdentifier: boolean;
  populatedAttributeRatio: number;
  hasStructuralRelationship: boolean;
  openFindings: DataQualityFindingRecord[];
  nowIso: string;
}): IdentityQualityDimensions {
  const {
    sourceReferences,
    hasVerifiedOfficialIdentifier,
    populatedAttributeRatio,
    hasStructuralRelationship,
    openFindings,
    nowIso,
  } = input;

  const reliabilityRank: Record<SourceReliabilityLevel, number> = {
    AUTHORITATIVE_OFFICIAL: 5,
    VERIFIED_PARTNER: 4,
    PLATFORM_INTERNAL: 3,
    USER_SUBMITTED: 2,
    UNVERIFIED_EXTERNAL: 1,
  };

  let bestReliability: SourceReliabilityLevel = 'UNVERIFIED_EXTERNAL';
  for (const src of sourceReferences) {
    if (reliabilityRank[src.reliabilityTier] > reliabilityRank[bestReliability]) {
      bestReliability = src.reliabilityTier;
    }
  }

  const hasConflictFinding = openFindings.some(
    (f) =>
      f.status === 'OPEN' &&
      (f.findingType === 'CONFLICTING_ADDRESSES' ||
        f.findingType === 'CONFLICTING_PROPERTY_AREAS' ||
        f.findingType === 'INCONSISTENT_BUILDING_UNIT_RELATIONSHIP'),
  );
  const hasDuplicatePending = openFindings.some(
    (f) => f.status === 'OPEN' && f.findingType === 'DUPLICATE_CANDIDATE_RECORDS',
  );

  let conflictStatus: IdentityConflictStatus = 'NO_CONFLICT';
  if (hasConflictFinding) {
    conflictStatus = 'CRITICAL_IDENTITY_CONFLICT';
  } else if (hasDuplicatePending) {
    conflictStatus = 'DUPLICATE_CANDIDATE_PENDING';
  } else if (openFindings.some((f) => f.status === 'OPEN')) {
    conflictStatus = 'MINOR_ATTRIBUTE_DISCREPANCY';
  }

  let verificationStatus: EntityVerificationStatus = 'UNVERIFIED';
  if (hasConflictFinding) {
    verificationStatus = 'CONFLICTING';
  } else if (hasVerifiedOfficialIdentifier && bestReliability === 'AUTHORITATIVE_OFFICIAL') {
    verificationStatus = 'OFFICIAL_VERIFIED';
  } else if (sourceReferences.length >= 2) {
    verificationStatus = 'MULTI_SOURCE_CORROBORATED';
  } else if (sourceReferences.length === 1) {
    verificationStatus = 'SINGLE_SOURCE_REPORTED';
  }

  let attributeCompleteness: CompletenessTier = 'MINIMAL';
  if (populatedAttributeRatio >= 0.85) attributeCompleteness = 'COMPLETE';
  else if (populatedAttributeRatio >= 0.65) attributeCompleteness = 'SUBSTANTIAL';
  else if (populatedAttributeRatio >= 0.4) attributeCompleteness = 'PARTIAL';

  const relationshipCompleteness: CompletenessTier = hasStructuralRelationship ? 'COMPLETE' : 'PARTIAL';

  const latestObservedMs = sourceReferences.reduce((max, s) => {
    const ms = Date.parse(s.observedAtIso);
    return Number.isFinite(ms) && ms > max ? ms : max;
  }, 0);
  const ageDays = latestObservedMs > 0 ? (Date.parse(nowIso) - latestObservedMs) / (1000 * 60 * 60 * 24) : 999;

  let dataFreshness: DataFreshnessTier = 'STALE';
  if (ageDays <= 30) dataFreshness = 'CURRENT';
  else if (ageDays <= 180) dataFreshness = 'RECENT';
  else if (ageDays <= 365) dataFreshness = 'AGING';

  let identityConfidence: IdentityConfidenceLevel = 'PROVISIONAL';
  if (verificationStatus === 'OFFICIAL_VERIFIED' && conflictStatus === 'NO_CONFLICT') {
    identityConfidence = 'HIGH';
  } else if (
    (verificationStatus === 'MULTI_SOURCE_CORROBORATED' || bestReliability === 'VERIFIED_PARTNER') &&
    conflictStatus !== 'CRITICAL_IDENTITY_CONFLICT'
  ) {
    identityConfidence = 'MEDIUM';
  } else if (sourceReferences.length >= 1 && conflictStatus !== 'CRITICAL_IDENTITY_CONFLICT') {
    identityConfidence = 'LOW';
  }

  return {
    identityConfidence,
    sourceReliability: bestReliability,
    verificationStatus,
    attributeCompleteness,
    relationshipCompleteness,
    dataFreshness,
    conflictStatus,
  };
}

/**
 * Section 11: Reconstructs an entity's recorded attribute state as of a requested
 * `asOfEffectiveDateIso` (when changes occurred in the real world) or `asOfRecordedDateIso`
 * (when the system learned about the changes).
 */
export function reconstructEntityAttributesAtDate(input: {
  initialSnapshot: Record<string, unknown>;
  changeHistory: AttributeChangeHistoryRecord[];
  asOfDateIso: string;
  temporalDimension: 'EFFECTIVE_DATE' | 'RECORDED_DATE';
}): {
  reconstructedAttributes: Record<string, unknown>;
  appliedChangesCount: number;
  appliedHistoryIds: string[];
} {
  const targetMs = Date.parse(input.asOfDateIso);
  if (!Number.isFinite(targetMs)) {
    throw new CoreApiError(
      'VALIDATION_FAILED',
      400,
      'INVALID_AS_OF_DATE: asOfDateIso must be a valid ISO-8601 timestamp.',
    );
  }

  const state: Record<string, unknown> = { ...input.initialSnapshot };
  const matching = input.changeHistory
    .filter((entry) => {
      const entryMs = Date.parse(
        input.temporalDimension === 'EFFECTIVE_DATE' ? entry.effectiveDateIso : entry.recordedAtIso,
      );
      return Number.isFinite(entryMs) && entryMs <= targetMs;
    })
    .sort((a, b) => {
      const msA = Date.parse(
        input.temporalDimension === 'EFFECTIVE_DATE' ? a.effectiveDateIso : a.recordedAtIso,
      );
      const msB = Date.parse(
        input.temporalDimension === 'EFFECTIVE_DATE' ? b.effectiveDateIso : b.recordedAtIso,
      );
      if (msA !== msB) return msA - msB;
      return a.entityVersionAfterChange - b.entityVersionAfterChange;
    });

  const appliedHistoryIds: string[] = [];
  for (const change of matching) {
    state[change.attributeName] = change.newValue;
    appliedHistoryIds.push(change.historyId);
  }

  return {
    reconstructedAttributes: state,
    appliedChangesCount: matching.length,
    appliedHistoryIds,
  };
}
