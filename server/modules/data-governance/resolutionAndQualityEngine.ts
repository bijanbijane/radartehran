import { isSupportedCityId } from '../geography';
import { ALLOWED_CATEGORIES } from '../valuation';
import { calculateGeodesicDistanceMeters } from '../geospatial';
import type {
  CrossModuleConsistencyReport,
  DataContractSchemaSpec,
  DataProfileReport,
  DataQualityRule,
  DataQualityScoreReport,
  EntityResolutionResult,
  MasterDataRecord,
  MasterEntityType,
} from './types';

export function createDefaultDataQualityRules(nowIso = new Date().toISOString()): DataQualityRule[] {
  return [
    {
      ruleId: 'DQ_REQ_CORE_FIELDS',
      name: 'Required Canonical Attributes',
      description: 'Ensures required entity-specific core attributes (e.g. cityId, sqm, propertyCategory) are present.',
      category: 'REQUIRED_FIELD',
      severity: 'BLOCKING_ERROR',
      applicableEntityTypes: ['property', 'building', 'unit', 'listing'],
      version: 1,
      active: true,
      effectiveAtIso: nowIso,
    },
    {
      ruleId: 'DQ_RANGE_AREA_PRICE',
      name: 'Plausible Area and Price Ranges',
      description: 'Validates numeric ranges for area (sqm) and monetary values.',
      category: 'RANGE_VALIDATION',
      severity: 'BLOCKING_ERROR',
      applicableEntityTypes: ['property', 'unit', 'listing'],
      version: 1,
      active: true,
      effectiveAtIso: nowIso,
    },
    {
      ruleId: 'DQ_GEO_CONSISTENCY',
      name: 'Geographic City & Neighborhood Consistency',
      description: 'Verifies cityId and hoodId belong to supported geographic registries.',
      category: 'GEOGRAPHIC_CONSISTENCY',
      severity: 'BLOCKING_ERROR',
      applicableEntityTypes: ['property', 'building', 'listing', 'neighborhood'],
      version: 1,
      active: true,
      effectiveAtIso: nowIso,
    },
    {
      ruleId: 'DQ_CAT_COMPATIBILITY',
      name: 'Property Category Compatibility',
      description: 'Ensures propertyCategory is a canonical supported category.',
      category: 'CATEGORY_COMPATIBILITY',
      severity: 'BLOCKING_ERROR',
      applicableEntityTypes: ['property', 'unit', 'listing'],
      version: 1,
      active: true,
      effectiveAtIso: nowIso,
    },
    {
      ruleId: 'DQ_REF_INTEGRITY',
      name: 'Parent & Related Entity Referential Integrity',
      description: 'Checks that parentCanonicalId and relatedCanonicalIds resolve to active master records.',
      category: 'REFERENTIAL_INTEGRITY',
      severity: 'BLOCKING_ERROR',
      applicableEntityTypes: ['unit', 'listing', 'owner_representation'],
      version: 1,
      active: true,
      effectiveAtIso: nowIso,
    },
    {
      ruleId: 'DQ_FRESHNESS_90D',
      name: 'Data Freshness Window (90 Days)',
      description: 'Flags records that have not been verified or updated within 90 days.',
      category: 'DATA_FRESHNESS',
      severity: 'WARNING',
      applicableEntityTypes: ['listing', 'property', 'market_evidence_source'],
      version: 1,
      active: true,
      effectiveAtIso: nowIso,
    },
    {
      ruleId: 'DQ_SOURCE_VERIFICATION',
      name: 'Source Reliability & Verification',
      description: 'Warns when a record originates from an unverified low-reliability source.',
      category: 'SOURCE_VERIFICATION',
      severity: 'WARNING',
      applicableEntityTypes: ['property', 'listing', 'broker_agency'],
      version: 1,
      active: true,
      effectiveAtIso: nowIso,
    },
  ];
}

export function createDefaultDataContracts(nowIso = new Date().toISOString()): DataContractSchemaSpec[] {
  return [
    {
      contractId: 'contract_canonical_property_v2',
      entityType: 'property',
      schemaVersion: '2.0.0',
      requiredFields: ['cityId', 'hoodId', 'propertyCategory', 'sqm'],
      optionalFields: ['buildYear', 'floor', 'totalFloors', 'deedType', 'coordinates', 'normalizedAddressFa'],
      deprecatedFields: ['legacyPriceText'],
      compatibleConsumerModules: ['transactions', 'tenancy', 'building-operations', 'brokerage', 'valuation', 'market-intelligence', 'geospatial'],
      effectiveAtIso: nowIso,
    },
    {
      contractId: 'contract_canonical_listing_v2',
      entityType: 'listing',
      schemaVersion: '2.0.0',
      requiredFields: ['propertyCanonicalId', 'cityId', 'hoodId', 'propertyCategory', 'transactionType', 'sqm'],
      optionalFields: ['askingPriceMillion', 'monthlyRentMillion', 'depositMillion', 'publicationStatus'],
      deprecatedFields: ['rawHtmlDescription'],
      compatibleConsumerModules: ['search', 'bargains', 'valuation', 'market-intelligence', 'geospatial'],
      effectiveAtIso: nowIso,
    },
  ];
}

export function resolveEntityAgainstCatalog(params: {
  entityType: MasterEntityType;
  candidateCanonicalId?: string;
  externalSourceKey?: { sourceKey: string; externalId: string };
  attributes: Record<string, unknown>;
  existingRecords: MasterDataRecord[];
}): EntityResolutionResult {
  const { entityType, candidateCanonicalId, externalSourceKey, attributes, existingRecords } = params;
  const scoped = existingRecords.filter((r) => r.entityType === entityType && r.status === 'ACTIVE');

  // 1. Deterministic match on canonicalId or alternateIds
  if (candidateCanonicalId) {
    const exact = scoped.find(
      (r) => r.canonicalId === candidateCanonicalId || r.alternateIds.includes(candidateCanonicalId),
    );
    if (exact) {
      return {
        classification: 'EXACT_MATCH',
        similarityScore: 100,
        matchedCanonicalId: exact.canonicalId,
        candidateCanonicalIds: [exact.canonicalId],
        requiresAuthorizedReview: false,
        autoMergePermitted: false,
        factorBreakdown: { exactCanonicalId: 100 },
        explanation: `Deterministic exact match on canonical/alternate identifier '${candidateCanonicalId}'.`,
      };
    }
  }

  // 2. Deterministic match on verified external source-specific identifier
  if (externalSourceKey) {
    const extMatch = scoped.find(
      (r) => r.sourceSpecificIds[externalSourceKey.sourceKey] === externalSourceKey.externalId,
    );
    if (extMatch) {
      return {
        classification: 'EXACT_MATCH',
        similarityScore: 100,
        matchedCanonicalId: extMatch.canonicalId,
        candidateCanonicalIds: [extMatch.canonicalId],
        requiresAuthorizedReview: false,
        autoMergePermitted: false,
        factorBreakdown: { externalIdentifier: 100 },
        explanation: `Deterministic match on external identifier ${externalSourceKey.sourceKey}:${externalSourceKey.externalId}.`,
      };
    }
  }

  const candCity = typeof attributes.cityId === 'string' ? attributes.cityId : undefined;
  const candHood = typeof attributes.hoodId === 'number' ? attributes.hoodId : undefined;
  const candSqm = typeof attributes.sqm === 'number' ? attributes.sqm : undefined;
  const candAddr =
    typeof attributes.normalizedAddressFa === 'string'
      ? attributes.normalizedAddressFa.trim().replace(/\s+/g, '')
      : undefined;
  const candBuilding = typeof attributes.buildingId === 'string' ? attributes.buildingId : undefined;
  const candUnitNum = typeof attributes.unitNumber === 'string' ? attributes.unitNumber : undefined;
  const candCoords = attributes.coordinates as { lat: number; lng: number } | undefined;

  if (!candCity && !candAddr && !candBuilding && !candCoords) {
    return {
      classification: 'INSUFFICIENT_EVIDENCE',
      similarityScore: 0,
      candidateCanonicalIds: [],
      requiresAuthorizedReview: false,
      autoMergePermitted: false,
      factorBreakdown: {},
      explanation: 'Insufficient identifying attributes to perform entity resolution.',
    };
  }

  let bestScore = 0;
  let bestRecord: MasterDataRecord | undefined;
  let bestFactors: Record<string, number> = {};
  const candidatesAbove50: string[] = [];

  for (const rec of scoped) {
    const factorScores: Record<string, number> = {};
    let score = 0;

    if (candCity && rec.attributes.cityId === candCity) {
      score += 15;
      factorScores.cityMatch = 15;
    }
    if (candHood !== undefined && rec.attributes.hoodId === candHood) {
      score += 15;
      factorScores.hoodMatch = 15;
    }
    if (candBuilding && rec.attributes.buildingId === candBuilding) {
      score += 35;
      factorScores.buildingMatch = 35;
      if (candUnitNum && rec.attributes.unitNumber === candUnitNum) {
        score += 35;
        factorScores.unitNumberMatch = 35;
      }
    }
    if (candAddr && typeof rec.attributes.normalizedAddressFa === 'string') {
      const recAddr = rec.attributes.normalizedAddressFa.trim().replace(/\s+/g, '');
      if (recAddr === candAddr) {
        score += 45;
        factorScores.addressMatch = 45;
      }
    }
    if (candCoords && rec.attributes.coordinates) {
      const rc = rec.attributes.coordinates as { lat: number; lng: number };
      const dist = calculateGeodesicDistanceMeters(candCoords, rc);
      if (dist <= 25) {
        score += 30;
        factorScores.coordinateProximity = 30;
      } else if (dist <= 80) {
        score += 15;
        factorScores.coordinateProximity = 15;
      }
    }
    if (candSqm !== undefined && typeof rec.attributes.sqm === 'number') {
      const diffPct = Math.abs(candSqm - rec.attributes.sqm) / Math.max(1, candSqm);
      if (diffPct <= 0.03) {
        score += 20;
        factorScores.areaSimilarity = 20;
      } else if (diffPct <= 0.08) {
        score += 10;
        factorScores.areaSimilarity = 10;
      }
    }

    const boundedScore = Math.min(99, score);
    if (boundedScore >= 55) {
      candidatesAbove50.push(rec.canonicalId);
    }
    if (boundedScore > bestScore) {
      bestScore = boundedScore;
      bestRecord = rec;
      bestFactors = factorScores;
    }
  }

  if (bestScore >= 82 && bestRecord) {
    return {
      classification: 'HIGH_CONFIDENCE_CANDIDATE',
      similarityScore: bestScore,
      matchedCanonicalId: bestRecord.canonicalId,
      candidateCanonicalIds: candidatesAbove50,
      requiresAuthorizedReview: true,
      autoMergePermitted: false,
      factorBreakdown: bestFactors,
      explanation: `High-confidence similarity candidate (${bestScore}/100); requires authorized human review before merge.`,
    };
  }

  if (bestScore >= 55 && bestRecord) {
    return {
      classification: 'POSSIBLE_MATCH',
      similarityScore: bestScore,
      matchedCanonicalId: bestRecord.canonicalId,
      candidateCanonicalIds: candidatesAbove50,
      requiresAuthorizedReview: true,
      autoMergePermitted: false,
      factorBreakdown: bestFactors,
      explanation: `Possible duplicate candidate (${bestScore}/100); do not auto-merge.`,
    };
  }

  return {
    classification: 'CONFIRMED_DISTINCT',
    similarityScore: bestScore,
    candidateCanonicalIds: [],
    requiresAuthorizedReview: false,
    autoMergePermitted: false,
    factorBreakdown: bestFactors,
    explanation: 'No matching entity found above similarity thresholds.',
  };
}

export function evaluateMasterRecordQuality(params: {
  record: MasterDataRecord;
  allRecordsMap: Map<string, MasterDataRecord>;
  activeRules: DataQualityRule[];
  isPartOfDuplicateGroup: boolean;
  nowIso: string;
}): DataQualityScoreReport {
  const { record, allRecordsMap, isPartOfDuplicateGroup, nowIso } = params;
  const attr = record.attributes;
  const failedBlockingRules: DataQualityScoreReport['failedBlockingRules'] = [];
  const warningRules: DataQualityScoreReport['warningRules'] = [];
  const missingFields: string[] = [];

  // 1. Completeness check
  const expectedFieldsByType: Record<string, string[]> = {
    property: ['cityId', 'hoodId', 'propertyCategory', 'sqm', 'buildYear', 'deedType'],
    building: ['cityId', 'hoodId', 'floorsCount', 'declaredUnitsCount'],
    unit: ['buildingId', 'unitNumber', 'sqm', 'floorNumber'],
    listing: ['propertyCanonicalId', 'cityId', 'hoodId', 'propertyCategory', 'transactionType', 'sqm'],
  };
  const expectedFields = expectedFieldsByType[record.entityType] ?? ['cityId'];
  for (const f of expectedFields) {
    if (attr[f] === undefined || attr[f] === null || attr[f] === '') {
      missingFields.push(f);
    }
  }
  const completeness = Math.round(
    ((expectedFields.length - missingFields.length) / Math.max(1, expectedFields.length)) * 100,
  );

  const coreRequired = ['cityId', 'hoodId', 'propertyCategory', 'sqm'].filter((f) => expectedFields.includes(f));
  const missingCore = coreRequired.filter((f) => attr[f] === undefined || attr[f] === null || attr[f] === '');
  if (missingCore.length > 0) {
    failedBlockingRules.push({
      ruleId: 'DQ_REQ_CORE_FIELDS',
      category: 'REQUIRED_FIELD',
      message: `Missing required core fields: ${missingCore.join(', ')}`,
    });
  }

  // 2. Range & Validity check
  let validity = 100;
  if (attr.sqm !== undefined) {
    const s = Number(attr.sqm);
    if (!Number.isFinite(s) || s < 10 || s > 100_000) {
      validity -= 50;
      failedBlockingRules.push({
        ruleId: 'DQ_RANGE_AREA_PRICE',
        category: 'RANGE_VALIDATION',
        message: `Implausible sqm value (${String(attr.sqm)}).`,
      });
    }
  }
  if (attr.propertyCategory !== undefined) {
    if (!ALLOWED_CATEGORIES.includes(attr.propertyCategory as any)) {
      validity -= 50;
      failedBlockingRules.push({
        ruleId: 'DQ_CAT_COMPATIBILITY',
        category: 'CATEGORY_COMPATIBILITY',
        message: `Unsupported propertyCategory '${String(attr.propertyCategory)}'.`,
      });
    }
  }

  // 3. Geographic consistency
  let consistency = 100;
  if (typeof attr.cityId === 'string' && !isSupportedCityId(attr.cityId)) {
    consistency -= 50;
    failedBlockingRules.push({
      ruleId: 'DQ_GEO_CONSISTENCY',
      category: 'GEOGRAPHIC_CONSISTENCY',
      message: `City '${attr.cityId}' is not in the canonical geography registry.`,
    });
  }

  // 4. Referential integrity
  let referentialIntegrity = 100;
  if (record.parentCanonicalId) {
    const parent = allRecordsMap.get(record.parentCanonicalId);
    if (!parent || parent.status !== 'ACTIVE') {
      referentialIntegrity = 20;
      failedBlockingRules.push({
        ruleId: 'DQ_REF_INTEGRITY',
        category: 'REFERENTIAL_INTEGRITY',
        message: `parentCanonicalId '${record.parentCanonicalId}' does not resolve to an ACTIVE master record.`,
      });
    }
  }

  // 5. Uniqueness
  const uniqueness = isPartOfDuplicateGroup ? 45 : 100;
  if (isPartOfDuplicateGroup) {
    warningRules.push({
      ruleId: 'DQ_DUP_CANDIDATE',
      category: 'DUPLICATE_DETECTION',
      message: 'Record belongs to an unresolved duplicate candidate group.',
    });
  }

  // 6. Freshness
  const ageDays = Math.max(
    0,
    Math.round((Date.parse(nowIso) - Date.parse(record.updatedAtIso)) / (1000 * 60 * 60 * 24)),
  );
  const freshness = ageDays <= 30 ? 100 : ageDays <= 90 ? 80 : 40;
  if (ageDays > 90) {
    warningRules.push({
      ruleId: 'DQ_FRESHNESS_90D',
      category: 'DATA_FRESHNESS',
      message: `Record has not been updated for ${ageDays} days (> 90 days).`,
    });
  }

  // 7. Source reliability
  const sourceReliability =
    record.provenance.reliabilityTier === 'HIGH'
      ? 100
      : record.provenance.reliabilityTier === 'MEDIUM'
        ? 75
        : 45;
  if (record.provenance.verificationStatus === 'UNVERIFIED') {
    warningRules.push({
      ruleId: 'DQ_SOURCE_VERIFICATION',
      category: 'SOURCE_VERIFICATION',
      message: 'Source provenance is currently UNVERIFIED.',
    });
  }

  const overallScore = Math.round(
    completeness * 0.2 +
      Math.max(0, validity) * 0.2 +
      Math.max(0, consistency) * 0.15 +
      uniqueness * 0.15 +
      freshness * 0.1 +
      sourceReliability * 0.1 +
      referentialIntegrity * 0.1,
  );

  const blockingPassed = failedBlockingRules.length === 0;
  const overallClassification: DataQualityScoreReport['overallClassification'] = !blockingPassed
    ? 'CRITICAL_FAILURE'
    : overallScore >= 88
      ? 'EXCELLENT'
      : overallScore >= 75
        ? 'GOOD'
        : overallScore >= 60
          ? 'ACCEPTABLE'
          : 'POOR';

  return {
    canonicalId: record.canonicalId,
    entityType: record.entityType,
    overallClassification,
    overallScore,
    blockingPassed,
    componentScores: {
      completeness,
      validity: Math.max(0, validity),
      consistency: Math.max(0, consistency),
      uniqueness,
      freshness,
      sourceReliability,
      referentialIntegrity,
    },
    failedBlockingRules,
    warningRules,
    missingFields,
    ruleSetVersion: 'dq_rules_v1.0',
    evaluatedAtIso: nowIso,
    disclaimer:
      'Data quality score reflects completeness, structural validity, and provenance tier; it does not guarantee legal title or physical accuracy without inspection.',
  };
}

export function evaluateCrossModuleConsistency(params: {
  allRecordsMap: Map<string, MasterDataRecord>;
  checks: Array<{
    checkType:
      | 'LISTING_TO_PROPERTY'
      | 'UNIT_TO_BUILDING'
      | 'TRANSACTION_TO_PROPERTY'
      | 'TENANCY_TO_UNIT'
      | 'LISTING_COMPLETION_VS_TRANSACTION';
    sourceId: string;
    targetId: string;
    sourceMeta?: Record<string, unknown>;
  }>;
  nowIso: string;
}): CrossModuleConsistencyReport {
  const { allRecordsMap, checks, nowIso } = params;
  const violations: CrossModuleConsistencyReport['violations'] = [];

  for (const c of checks) {
    const target = allRecordsMap.get(c.targetId);
    if (c.checkType === 'LISTING_TO_PROPERTY') {
      if (!target || target.entityType !== 'property' || target.status !== 'ACTIVE') {
        violations.push({
          code: 'DANGLING_PROPERTY_REFERENCE',
          sourceEntityId: c.sourceId,
          targetEntityId: c.targetId,
          message: `Listing '${c.sourceId}' references non-existent or inactive canonical property '${c.targetId}'.`,
        });
      }
    } else if (c.checkType === 'UNIT_TO_BUILDING') {
      const unitRec = allRecordsMap.get(c.sourceId);
      if (!target || target.entityType !== 'building' || (unitRec && unitRec.parentCanonicalId !== c.targetId)) {
        violations.push({
          code: 'UNIT_BUILDING_MISMATCH',
          sourceEntityId: c.sourceId,
          targetEntityId: c.targetId,
          message: `Unit '${c.sourceId}' does not belong to referenced building '${c.targetId}'.`,
        });
      }
    } else if (c.checkType === 'TRANSACTION_TO_PROPERTY') {
      if (!target || target.entityType !== 'property') {
        violations.push({
          code: 'DANGLING_PROPERTY_REFERENCE',
          sourceEntityId: c.sourceId,
          targetEntityId: c.targetId,
          message: `Transaction '${c.sourceId}' references missing property '${c.targetId}'.`,
        });
      } else if (
        c.sourceMeta?.propertyCategory &&
        target.attributes.propertyCategory &&
        c.sourceMeta.propertyCategory !== target.attributes.propertyCategory
      ) {
        violations.push({
          code: 'TRANSACTION_CATEGORY_INCOMPATIBLE',
          sourceEntityId: c.sourceId,
          targetEntityId: c.targetId,
          message: `Transaction category '${String(c.sourceMeta.propertyCategory)}' contradicts property category '${String(target.attributes.propertyCategory)}'.`,
        });
      }
    } else if (c.checkType === 'TENANCY_TO_UNIT') {
      if (!target || (target.entityType !== 'unit' && target.entityType !== 'property') || target.status !== 'ACTIVE') {
        violations.push({
          code: 'TENANCY_UNIT_INVALID',
          sourceEntityId: c.sourceId,
          targetEntityId: c.targetId,
          message: `Tenancy '${c.sourceId}' references invalid unit/property '${c.targetId}'.`,
        });
      }
    } else if (c.checkType === 'LISTING_COMPLETION_VS_TRANSACTION') {
      if (c.sourceMeta?.listingState === 'ACTIVE_AVAILABLE' && c.sourceMeta?.transactionState === 'COMPLETED_CLOSED') {
        violations.push({
          code: 'CONTRADICTORY_COMPLETION_STATE',
          sourceEntityId: c.sourceId,
          targetEntityId: c.targetId,
          message: `Listing '${c.sourceId}' remains ACTIVE_AVAILABLE despite completed closing on transaction '${c.targetId}'.`,
        });
      }
    }
  }

  return {
    valid: violations.length === 0,
    checkedAtIso: nowIso,
    violations,
  };
}

export function buildEntityDataProfile(params: {
  entityType: MasterEntityType;
  cityId?: string;
  records: MasterDataRecord[];
  duplicateIds: Set<string>;
  nowIso: string;
}): DataProfileReport {
  const scoped = params.records.filter(
    (r) =>
      r.entityType === params.entityType &&
      (!params.cityId || r.attributes.cityId === params.cityId),
  );
  const total = scoped.length;
  const trackedFields = ['cityId', 'hoodId', 'propertyCategory', 'sqm', 'buildYear', 'coordinates'];
  const fieldCompletenessPct: Record<string, number> = {};
  for (const f of trackedFields) {
    const present = scoped.filter((r) => r.attributes[f] !== undefined && r.attributes[f] !== null).length;
    fieldCompletenessPct[f] = total > 0 ? Number(((present / total) * 100).toFixed(1)) : 0;
  }

  const categoryDistribution: Record<string, number> = {};
  const sourceDistribution: Record<string, number> = {};
  let staleCount = 0;
  let dupCount = 0;

  for (const r of scoped) {
    const cat = String(r.attributes.propertyCategory ?? 'unspecified');
    categoryDistribution[cat] = (categoryDistribution[cat] ?? 0) + 1;
    const src = r.provenance.sourceCategory;
    sourceDistribution[src] = (sourceDistribution[src] ?? 0) + 1;

    const ageDays = (Date.parse(params.nowIso) - Date.parse(r.updatedAtIso)) / (1000 * 60 * 60 * 24);
    if (ageDays > 90) staleCount++;
    if (params.duplicateIds.has(r.canonicalId) || r.status === 'MERGED_ALIAS') dupCount++;
  }

  return {
    entityType: params.entityType,
    cityId: params.cityId,
    totalRecords: total,
    verifiedRecordsCount: scoped.filter((r) => r.verificationStatus === 'VERIFIED').length,
    duplicateRecordsCount: dupCount,
    staleRecordsCount: staleCount,
    fieldCompletenessPct,
    categoryDistribution,
    sourceDistribution,
    generatedAtIso: params.nowIso,
  };
}
