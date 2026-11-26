import assert from 'node:assert/strict';
import test from 'node:test';
import {
  areNeighborhoodMetricsComparable,
  buildNeighborhoodProfileCacheKey,
  deriveProfilePublicationState,
  evaluateNeighborhoodProfileBoundary,
  evaluateNeighborhoodProfileObservation,
  type GeoJsonPolygonGeometry,
  type NeighborhoodProfileBoundaryEvidence,
  type NeighborhoodProfileObservation,
  type NeighborhoodProfileValidationContext,
} from './neighborhoodProfileEvidenceContract';

const HASH = 'a'.repeat(64);
const NOW = new Date('2026-11-26T08:00:00.000Z');
const SQUARE: GeoJsonPolygonGeometry = {
  type: 'Polygon',
  coordinates: [[
    [51.30, 35.70], [51.31, 35.70], [51.31, 35.71],
    [51.30, 35.71], [51.30, 35.70],
  ]],
};

function boundary(overrides: Partial<NeighborhoodProfileBoundaryEvidence> = {}): NeighborhoodProfileBoundaryEvidence {
  return {
    geographicEntityId: 'IRGEO1-test-neighborhood',
    cityId: 'tehran',
    legacyNeighborhoodId: 1,
    level: 'neighborhood',
    versionId: 'bnd_test_v3',
    version: 3,
    status: 'ACTIVE',
    identityStatus: 'CONFIRMED_CANONICAL',
    verificationStatus: 'VERIFIED_OFFICIAL_PRIMARY',
    authority: 'OFFICIAL_PRIMARY',
    crs: 'EPSG:4326',
    geometry: SQUARE,
    sourceReference: 'municipal-boundary-register:tehran:1',
    reviewedIndependently: true,
    reviewedAtIso: '2026-11-25T10:00:00.000Z',
    geometrySha256: HASH,
    geometryHashVerified: true,
    ...overrides,
  };
}
function checkBoundary(evidence: NeighborhoodProfileBoundaryEvidence | null = boundary()) {
  return evaluateNeighborhoodProfileBoundary({
    expectedGeographicEntityId: 'IRGEO1-test-neighborhood',
    expectedCityId: 'tehran',
    expectedLegacyNeighborhoodId: 1,
    evidence,
  });
}

function observation(overrides: Partial<NeighborhoodProfileObservation> = {}): NeighborhoodProfileObservation {
  return {
    canonicalRecordId: 'can_ini_0001',
    evidenceId: 'evd_ini_0001',
    sourceVariableMappingId: 'svm_ini_0001',
    variableId: 'var_ini_0050',
    value: 42,
    state: 'OBSERVED_VALUE',
    unit: 'million_toman_per_sqm',
    sourceId: 'src_ini_0001',
    sourceAccessStatus: 'VERIFIED',
    compatibility: 'VERIFIED_COMPATIBLE',
    sourceGeographicLevel: 'neighborhood',
    targetGeographicLevel: 'neighborhood',
    sourceReference: 'evidence://sample/42',
    metricRole: 'SALE_ASKING_PRICE',
    observedAtIso: '2026-11-25T08:00:00.000Z',
    temporalType: 'DYNAMIC',
    ...overrides,
  };
}

interface ContextOptions {
  readonly sourceAccessStatus?: NeighborhoodProfileValidationContext['source']['accessStatus'];
  readonly publicRedistributionAllowed?: boolean;
  readonly manualPermissionVerified?: boolean;
  readonly sourceRole?: NeighborhoodProfileValidationContext['source']['role'];
  readonly compatibility?: NeighborhoodProfileValidationContext['mapping']['compatibility'];
  readonly sourceGeographicLevel?: NeighborhoodProfileValidationContext['mapping']['sourceGeographicLevel'];
  readonly methodologyReference?: string;
  readonly includeMethodologyReference?: boolean;
  readonly approvedCrosswalkReference?: string;
  readonly allocationMethodologyReference?: string;
  readonly evidenceLifecycleStatus?: NeighborhoodProfileValidationContext['evidence']['lifecycleStatus'];
  readonly rawHashVerified?: boolean;
  readonly canonicalLifecycleStatus?: NeighborhoodProfileValidationContext['canonicalRecord']['lifecycleStatus'];
  readonly canonicalValue?: unknown;
  readonly canonicalUnit?: string | null;
  readonly canonicalState?: NeighborhoodProfileValidationContext['canonicalRecord']['state'];
  readonly canonicalHashVerified?: boolean;
  readonly canonicalSourceId?: string;
  readonly canonicalSourceEvidenceIds?: readonly string[];
  readonly canonicalSourceVariableMappingIds?: readonly string[];
  readonly freshnessPolicy?: NeighborhoodProfileValidationContext['variableDefinition']['freshnessPolicy'];
  readonly includeFreshnessPolicy?: boolean;
  readonly dataType?: NeighborhoodProfileValidationContext['variableDefinition']['dataType'];
  readonly minValue?: number;
  readonly maxValue?: number;
  readonly allowedValues?: readonly (string | number)[];
  readonly metricRole?: NeighborhoodProfileObservation['metricRole'];
  readonly temporalSemantics?: NeighborhoodProfileValidationContext['variableDefinition']['temporalSemantics'];
}

function contextFor(
  item: NeighborhoodProfileObservation,
  options: ContextOptions = {},
): NeighborhoodProfileValidationContext {
  const role = options.sourceRole
    ?? (item.metricRole === 'CONFIRMED_SALE_TRANSACTION' || item.metricRole === 'CONFIRMED_RENT_CONTRACT'
      ? 'OFFICIAL_TRANSACTION_REGISTRY'
      : item.metricRole === 'DEPOSIT_CONVERSION'
        ? 'OFFICIAL_STATISTICS'
        : item.metricRole === 'OTHER' ? 'GIS' : 'LISTING_PORTAL');
  const sourceAccessStatus = options.sourceAccessStatus ?? item.sourceAccessStatus;
  const compatibility = options.compatibility ?? item.compatibility;
  const sourceGeographicLevel = options.sourceGeographicLevel ?? item.sourceGeographicLevel;
  const temporalSemantics = options.temporalSemantics
    ?? (item.temporalType === 'STATIC' ? 'HISTORICAL_SNAPSHOT'
      : item.temporalType === 'PERIODIC' ? 'PERIOD_BASED'
        : item.temporalType === 'EVENT_BASED' ? 'EVENT_BASED' : 'POINT_IN_TIME');
  const priceRole = options.metricRole ?? item.metricRole;
  return {
    variableDefinition: {
      variableId: item.variableId,
      dataType: options.dataType ?? 'decimal',
      unit: item.unit,
      geographicLevel: item.targetGeographicLevel,
      temporalType: item.temporalType,
      temporalSemantics,
      ...(options.minValue !== undefined ? { minValue: options.minValue } : {}),
      ...(options.maxValue !== undefined ? { maxValue: options.maxValue } : {}),
      ...(options.allowedValues ? { allowedValues: options.allowedValues } : {}),
      ...(priceRole !== 'OTHER' ? { priceEconomicRole: priceRole } : {}),
      ...(options.includeFreshnessPolicy === false ? {} : {
        freshnessPolicy: options.freshnessPolicy ?? { maxAgeDays: 7, policyVersion: 'freshness-1.0.0' },
      }),
    },
    source: {
      sourceId: item.sourceId,
      accessStatus: sourceAccessStatus,
      publicRedistributionAllowed: options.publicRedistributionAllowed ?? true,
      manualPermissionVerified: options.manualPermissionVerified ?? true,
      role,
    },
    mapping: {
      sourceVariableMappingId: item.sourceVariableMappingId,
      sourceId: item.sourceId,
      variableId: item.variableId,
      compatibility,
      sourceGeographicLevel,
      ...(options.includeMethodologyReference === false ? {} : options.methodologyReference
        ? { methodologyReference: options.methodologyReference }
        : compatibility === 'CONDITIONALLY_COMPATIBLE' || compatibility === 'PARTIALLY_COMPATIBLE'
          ? { methodologyReference: 'method://reviewed/v1' } : {}),
      ...((options.approvedCrosswalkReference ?? item.approvedCrosswalkReference)
        ? { approvedCrosswalkReference: options.approvedCrosswalkReference ?? item.approvedCrosswalkReference } : {}),
      ...((options.allocationMethodologyReference ?? item.allocationMethodologyReference)
        ? { allocationMethodologyReference: options.allocationMethodologyReference ?? item.allocationMethodologyReference } : {}),
    },
    evidence: {
      evidenceId: item.evidenceId,
      sourceId: item.sourceId,
      lifecycleStatus: options.evidenceLifecycleStatus ?? 'ACCESS_APPROVED',
      rawHashVerified: options.rawHashVerified ?? true,
    },
    canonicalRecord: {
      canonicalRecordId: item.canonicalRecordId,
      sourceId: options.canonicalSourceId ?? item.sourceId,
      sourceEvidenceIds: options.canonicalSourceEvidenceIds ?? [item.evidenceId],
      sourceVariableMappingIds: options.canonicalSourceVariableMappingIds ?? [item.sourceVariableMappingId],
      variableId: item.variableId,
      value: options.canonicalValue !== undefined ? options.canonicalValue : item.value,
      unit: options.canonicalUnit !== undefined ? options.canonicalUnit : item.unit,
      state: options.canonicalState ?? item.state,
      lifecycleStatus: options.canonicalLifecycleStatus ?? 'ACTIVE',
      observedAtIso: item.observedAtIso,
      ...(item.referencePeriodEndIso ? { referencePeriodEndIso: item.referencePeriodEndIso } : {}),
      ...(item.sourceVersion ? { sourceVersion: item.sourceVersion } : {}),
      ...(item.sourceDatasetHash ? { sourceDatasetHash: item.sourceDatasetHash } : {}),
      sourceDatasetHashVerified: options.canonicalHashVerified ?? true,
    },
  };
}

function evaluateObservation(
  overrides: Partial<NeighborhoodProfileObservation> = {},
  options: ContextOptions = {},
) {
  const item = observation(overrides);
  return evaluateNeighborhoodProfileObservation(item, NOW, contextFor(item, options));
}

test('01 official active reviewed polygon is eligible and area is explicitly an approximation', () => {
  const result = checkBoundary();
  assert.equal(result.eligible, true);
  assert.equal(result.officialBoundary, true);
  assert.ok((result.areaSqKm ?? 0) > 0);
  assert.equal(result.areaQuality, 'OFFICIAL_GEOMETRY_DERIVED_APPROXIMATION');
  assert.equal(result.areaMethod, 'SPHERICAL_SPHERE_APPROXIMATION');
});

test('02 reviewed secondary gazetteer geometry is operational, never official', () => {
  const result = checkBoundary(boundary({
    authority: 'VERIFIED_SECONDARY',
    verificationStatus: 'VERIFIED_SECONDARY_GAZETTEER',
  }));
  assert.equal(result.eligible, true);
  assert.equal(result.officialBoundary, false);
  assert.equal(result.areaQuality, 'REVIEWED_GEOMETRY_DERIVED_APPROXIMATION');
});

test('03 no boundary evidence yields no area and no spatial eligibility', () => {
  const result = checkBoundary(null);
  assert.equal(result.code, 'MISSING_EVIDENCE');
  assert.equal(result.areaSqKm, null);
  assert.equal(result.areaAnalysisAllowed, false);
});

test('04 canonical geographic identity must match exactly', () => {
  assert.equal(checkBoundary(boundary({ geographicEntityId: 'IRGEO1-other' })).code, 'IDENTITY_MISMATCH');
});

test('05 a boundary from another city is rejected', () => {
  assert.equal(checkBoundary(boundary({ cityId: 'karaj' })).code, 'CITY_MISMATCH');
});

test('06 a legacy numeric ID without a verified mapping is rejected', () => {
  assert.equal(checkBoundary(boundary({ legacyNeighborhoodId: 99 })).code, 'LEGACY_ID_MISMATCH');
});

test('07 district or city geometry cannot be used as neighborhood geometry', () => {
  assert.equal(checkBoundary(boundary({ level: 'district' })).code, 'WRONG_GEOGRAPHIC_LEVEL');
});

test('08 pending geometry is not a profile boundary', () => {
  assert.equal(checkBoundary(boundary({ status: 'PENDING_REVIEW' })).code, 'NOT_ACTIVE');
});

test('09 rejected and superseded geometry are both blocked', () => {
  for (const status of ['REJECTED', 'SUPERSEDED'] as const) {
    assert.equal(checkBoundary(boundary({ status })).code, 'NOT_ACTIVE');
  }
});

test('10 unreviewed geometry cannot support area analysis', () => {
  const result = checkBoundary(boundary({ reviewedIndependently: false, reviewedAtIso: undefined }));
  assert.equal(result.code, 'NOT_REVIEWED');
  assert.equal(result.areaSqKm, null);
});

test('11 algorithmic Voronoi or radius geometry is never accepted as measured area', () => {
  assert.equal(checkBoundary(boundary({ authority: 'ALGORITHMIC' })).code, 'SOURCE_NOT_ACCEPTABLE');
});

test('12 geometry without explicit WGS84 CRS is rejected', () => {
  assert.equal(checkBoundary(boundary({ crs: 'UNKNOWN' })).code, 'CRS_UNSUPPORTED');
});

test('13 checksum must be SHA-256 and independently verified against canonical geometry', () => {
  assert.equal(checkBoundary(boundary({ geometrySha256: 'abcd' })).code, 'GEOMETRY_HASH_MISSING');
  assert.equal(checkBoundary(boundary({ geometryHashVerified: false })).code, 'GEOMETRY_HASH_UNVERIFIED');
});

test('14 unclosed GeoJSON rings are rejected rather than silently repaired', () => {
  const open: GeoJsonPolygonGeometry = { type: 'Polygon', coordinates: [[
    [51.30, 35.70], [51.31, 35.70], [51.31, 35.71], [51.30, 35.71],
  ]] };
  assert.equal(checkBoundary(boundary({ geometry: open })).code, 'GEOMETRY_INVALID');
});

test('15 self-intersecting polygons are rejected', () => {
  const bowTie: GeoJsonPolygonGeometry = { type: 'Polygon', coordinates: [[
    [51.30, 35.70], [51.31, 35.71], [51.30, 35.71], [51.31, 35.70], [51.30, 35.70],
  ]] };
  assert.equal(checkBoundary(boundary({ geometry: bowTie })).code, 'GEOMETRY_INVALID');
});

test('16 out-of-range or country-scale geometry is rejected', () => {
  const invalid: GeoJsonPolygonGeometry = { type: 'Polygon', coordinates: [[
    [251.30, 35.70], [251.31, 35.70], [251.31, 35.71], [251.30, 35.71], [251.30, 35.70],
  ]] };
  const huge: GeoJsonPolygonGeometry = { type: 'Polygon', coordinates: [[
    [40, 20], [60, 20], [60, 40], [40, 40], [40, 20],
  ]] };
  assert.equal(checkBoundary(boundary({ geometry: invalid })).code, 'GEOMETRY_INVALID');
  assert.equal(checkBoundary(boundary({ geometry: huge })).code, 'GEOMETRY_INVALID');
});

test('17 valid polygon holes reduce area; a hole touching outer ring is rejected', () => {
  const validHole: GeoJsonPolygonGeometry = {
    type: 'Polygon',
    coordinates: [
      SQUARE.coordinates[0],
      [[51.303, 35.703], [51.307, 35.703], [51.307, 35.707], [51.303, 35.707], [51.303, 35.703]],
    ],
  };
  const touchingHole: GeoJsonPolygonGeometry = {
    type: 'Polygon',
    coordinates: [
      SQUARE.coordinates[0],
      [[51.30, 35.704], [51.304, 35.704], [51.304, 35.707], [51.30, 35.707], [51.30, 35.704]],
    ],
  };
  const fullArea = checkBoundary().areaSqKm!;
  const holeArea = checkBoundary(boundary({ geometry: validHole })).areaSqKm!;
  assert.ok(holeArea > 0 && holeArea < fullArea);
  assert.equal(checkBoundary(boundary({ geometry: touchingHole })).code, 'GEOMETRY_INVALID');
});

test('18 valid multipolygon sums parts; overlapping components are rejected', () => {
  const secondRing = [[51.32, 35.70], [51.33, 35.70], [51.33, 35.71], [51.32, 35.71], [51.32, 35.70]] as const;
  const valid: GeoJsonPolygonGeometry = { type: 'MultiPolygon', coordinates: [SQUARE.coordinates, [secondRing]] };
  const overlapping: GeoJsonPolygonGeometry = { type: 'MultiPolygon', coordinates: [
    SQUARE.coordinates,
    [[ [51.305, 35.705], [51.315, 35.705], [51.315, 35.715], [51.305, 35.715], [51.305, 35.705] ]],
  ] };
  const one = checkBoundary().areaSqKm!;
  const two = checkBoundary(boundary({ geometry: valid })).areaSqKm!;
  assert.ok(two > one * 1.8 && two < one * 2.2);
  assert.equal(checkBoundary(boundary({ geometry: overlapping })).code, 'GEOMETRY_INVALID');
});

test('19 a reviewed source registry and canonical record are mandatory for an observation', () => {
  assert.equal(evaluateNeighborhoodProfileObservation(observation(), NOW).code, 'REFERENCE_CONTEXT_MISSING');
  const zero = evaluateObservation({ value: 0, state: 'OBSERVED_ZERO' });
  const missing = evaluateObservation({ value: null, state: 'MISSING' });
  const suppressed = evaluateObservation({ value: null, state: 'SUPPRESSED' });
  assert.equal(zero.publishable, true);
  assert.equal(missing.code, 'MISSING_VALUE');
  assert.equal(suppressed.code, 'SUPPRESSED');
});

test('20 source permission, redistribution, evidence lifecycle and hash are independently enforced', () => {
  assert.equal(evaluateObservation({ sourceAccessStatus: 'PROHIBITED' }, { sourceAccessStatus: 'PROHIBITED' }).code, 'SOURCE_PROHIBITED');
  assert.equal(evaluateObservation({ sourceAccessStatus: 'RESTRICTED' }, { sourceAccessStatus: 'RESTRICTED' }).code, 'SOURCE_PROHIBITED');
  assert.equal(evaluateObservation({ sourceAccessStatus: 'ACCESS_NOT_VERIFIED' }, { sourceAccessStatus: 'ACCESS_NOT_VERIFIED' }).code, 'SOURCE_PERMISSION_MISSING');
  assert.equal(evaluateObservation({}, { publicRedistributionAllowed: false }).code, 'SOURCE_PERMISSION_MISSING');
  assert.equal(evaluateObservation({}, { evidenceLifecycleStatus: 'RECEIVED' }).code, 'SOURCE_PERMISSION_MISSING');
  assert.equal(evaluateObservation({}, { rawHashVerified: false }).code, 'SOURCE_PERMISSION_MISSING');
});

test('21 source-to-variable compatibility and price economic roles cannot be self-declared', () => {
  assert.equal(evaluateObservation(
    { metricRole: 'CONFIRMED_SALE_TRANSACTION' },
    { sourceRole: 'LISTING_PORTAL' },
  ).code, 'PRICE_ROLE_MISMATCH');
  assert.equal(evaluateObservation(
    { metricRole: 'CONFIRMED_SALE_TRANSACTION' },
    { sourceRole: 'OFFICIAL_TRANSACTION_REGISTRY' },
  ).publishable, true);
  assert.equal(evaluateObservation({ compatibility: 'NOT_REVIEWED' }, { compatibility: 'NOT_REVIEWED' }).code, 'SOURCE_NOT_REVIEWED');
  assert.equal(evaluateObservation({ compatibility: 'NOT_COMPATIBLE' }, { compatibility: 'NOT_COMPATIBLE' }).code, 'SOURCE_VARIABLE_INCOMPATIBLE');
  assert.equal(evaluateObservation(
    { compatibility: 'CONDITIONALLY_COMPATIBLE' },
    { includeMethodologyReference: false },
  ).code, 'METHODOLOGY_MISSING');
});

test('22 canonical record, source, mapping and observation references must agree', () => {
  assert.equal(evaluateObservation({}, { canonicalValue: 41 }).code, 'REFERENCE_MISMATCH');
  assert.equal(evaluateObservation({}, { canonicalUnit: 'sqm' }).code, 'VARIABLE_UNIT_MISMATCH');
  assert.equal(evaluateObservation({}, { canonicalLifecycleStatus: 'SUPERSEDED' }).code, 'REFERENCE_MISMATCH');
  assert.equal(evaluateObservation({}, { canonicalSourceId: 'src_ini_0999' }).code, 'REFERENCE_MISMATCH');
  assert.equal(evaluateObservation({}, { canonicalSourceEvidenceIds: [] }).code, 'REFERENCE_MISMATCH');
  assert.equal(evaluateObservation({}, { canonicalSourceVariableMappingIds: [] }).code, 'REFERENCE_MISMATCH');
  assert.equal(evaluateObservation({ sourceReference: 'https://example.test/source/42' }).publishable, true,
    'a source locator is distinct from the immutable evidence ID');
  assert.equal(evaluateObservation({ sourceAccessStatus: 'MANUAL_ONLY' }, { sourceAccessStatus: 'MANUAL_ONLY', manualPermissionVerified: false }).code, 'SOURCE_PERMISSION_MISSING');
});

test('23 district data cannot become neighborhood data without an independently approved crosswalk', () => {
  assert.equal(evaluateObservation(
    { sourceGeographicLevel: 'district' },
    { sourceGeographicLevel: 'district' },
  ).code, 'GEOGRAPHIC_RESOLUTION_MISMATCH');
});

test('24 an approved crosswalk remains an explicitly allocated estimate, never an exact observation', () => {
  const result = evaluateObservation({
    sourceGeographicLevel: 'district',
    approvedCrosswalkReference: 'crosswalk://district-to-neighborhood/v1',
    allocationMethodologyReference: 'method://area-weighted/v1',
  }, {
    sourceGeographicLevel: 'district',
    approvedCrosswalkReference: 'crosswalk://district-to-neighborhood/v1',
    allocationMethodologyReference: 'method://area-weighted/v1',
    methodologyReference: 'methodology://population-allocation/v1',
  });
  assert.equal(result.publishable, true);
  assert.equal(result.code, 'ALLOCATED_ESTIMATE');
  assert.equal(result.geographicPrecision, 'ALLOCATED');
});

test('25 type, unit, range, enum, temporal semantics and freshness are checked against the variable registry', () => {
  assert.equal(evaluateObservation({ value: 42.5 }, { dataType: 'integer' }).code, 'VARIABLE_VALUE_INVALID');
  assert.equal(evaluateObservation({}, { minValue: 100 }).code, 'VALUE_OUT_OF_RANGE');
  assert.equal(evaluateObservation({}, { maxValue: 10 }).code, 'VALUE_OUT_OF_RANGE');
  assert.equal(evaluateObservation({}, { dataType: 'enum', allowedValues: ['low', 'high'] }).code, 'ENUM_VALUE_NOT_ALLOWED');
  assert.equal(evaluateObservation({}, { includeFreshnessPolicy: false }).code, 'FRESHNESS_POLICY_MISSING');
  assert.equal(evaluateObservation(
    { observedAtIso: '2026-11-01T08:00:00.000Z' },
  ).code, 'STALE_OBSERVATION');
  assert.equal(evaluateObservation(
    { temporalType: 'STATIC' },
  ).code, 'STATIC_SOURCE_VERSION_MISSING');
  assert.equal(evaluateObservation(
    { observedAtIso: '2026-11-27T08:00:00.000Z' },
  ).code, 'FUTURE_OBSERVATION');
});

test('26 comparability, publication readiness and cache identity include every relevant version boundary', () => {
  const base = {
    variableId: 'var_ini_0050', unit: 'million_toman_per_sqm', metricRole: 'SALE_ASKING_PRICE',
    referencePeriod: '2026-11', methodologyVersion: 'asking-v1', geographicResolution: 'neighborhood' as const,
    cityId: 'tehran', boundarySchemeId: 'municipal-v1', boundarySchemeVersion: '2026-01',
    geographicRegistryRevision: 19, currencyNormalizationPolicyVersion: 'irt-v1',
  };
  assert.equal(areNeighborhoodMetricsComparable(base, { ...base }), true);
  assert.equal(areNeighborhoodMetricsComparable(base, { ...base, referencePeriod: '2026-10' }), false);
  assert.equal(areNeighborhoodMetricsComparable(base, { ...base, cityId: 'karaj' }), false);
  assert.equal(areNeighborhoodMetricsComparable(base, { ...base, boundarySchemeVersion: '2025-01' }), false);
  assert.equal(areNeighborhoodMetricsComparable(base, { ...base, currencyNormalizationPolicyVersion: 'irt-v2' }), false);

  const draft = deriveProfilePublicationState([], ['identity', 'boundary']);
  const provisional = deriveProfilePublicationState([
    { domainId: 'identity', state: 'READY', publishableMetricCount: 1, blockedMetricCount: 0, reasons: [] },
    { domainId: 'boundary', state: 'PARTIAL', publishableMetricCount: 0, blockedMetricCount: 1, reasons: ['no polygon'] },
  ], ['identity', 'boundary']);
  const falseReady = deriveProfilePublicationState([
    { domainId: 'identity', state: 'READY', publishableMetricCount: 1, blockedMetricCount: 2, reasons: [] },
    { domainId: 'boundary', state: 'READY', publishableMetricCount: 1, blockedMetricCount: 0, reasons: [] },
  ], ['identity', 'boundary']);
  const duplicateDomain = deriveProfilePublicationState([
    { domainId: 'identity', state: 'READY', publishableMetricCount: 1, blockedMetricCount: 0, reasons: [] },
    { domainId: 'identity', state: 'READY', publishableMetricCount: 1, blockedMetricCount: 0, reasons: [] },
  ], ['identity']);
  const invalidCounts = deriveProfilePublicationState([
    { domainId: 'identity', state: 'READY', publishableMetricCount: -1, blockedMetricCount: 0, reasons: [] },
  ], ['identity']);
  const complete = deriveProfilePublicationState([
    { domainId: 'identity', state: 'READY', publishableMetricCount: 3, blockedMetricCount: 0, reasons: [] },
    { domainId: 'boundary', state: 'READY', publishableMetricCount: 2, blockedMetricCount: 0, reasons: [] },
  ], ['identity', 'boundary']);
  assert.equal(draft, 'DRAFT');
  assert.equal(provisional, 'PROVISIONAL');
  assert.equal(falseReady, 'DRAFT');
  assert.equal(duplicateDomain, 'DRAFT');
  assert.equal(invalidCounts, 'DRAFT');
  assert.equal(complete, 'PUBLISHED');

  const cacheInput = {
    geographicEntityId: 'IRGEO1-a', registryRevision: 2, boundaryVersionId: 'b2',
    boundaryGeometrySha256: HASH, observationsWatermark: 'obs-1', methodologyVersion: 'nips-1',
    variableCatalogVersion: '2.0.0', sourceRegistryRevision: 8, publicationPolicyVersion: 'pub-v1',
  };
  const cacheA = buildNeighborhoodProfileCacheKey(cacheInput);
  const cacheB = buildNeighborhoodProfileCacheKey({ ...cacheInput, registryRevision: 3 });
  const cacheC = buildNeighborhoodProfileCacheKey({ ...cacheInput, sourceRegistryRevision: 9 });
  const cacheD = buildNeighborhoodProfileCacheKey({ ...cacheInput, variableCatalogVersion: '2.1.0' });
  const cacheE = buildNeighborhoodProfileCacheKey({ ...cacheInput, publicationPolicyVersion: 'pub-v2' });
  assert.notEqual(cacheA, cacheB);
  assert.notEqual(cacheA, cacheC);
  assert.notEqual(cacheA, cacheD);
  assert.notEqual(cacheA, cacheE);
});
